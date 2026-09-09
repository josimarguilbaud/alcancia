// El puesto de ventanilla. Junta las tres piezas que se probaron por separado:
// voz -> texto (Whisper), texto -> expediente KYC (Qwen3 + verificación en código),
// foto -> cédula (VisionPsy + emparejado de etiquetas), y el cotejo entre las dos.
//
// Todo corre dentro de este equipo. No hay una sola llamada de red: si se desenchufa
// el cable, la ventanilla sigue atendiendo. Esa es la razón de ser del producto, no
// una nota al pie, así que el servidor no tiene ninguna dependencia fuera de Node y QVAC.
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  loadModel, transcribe,
  WHISPER_SMALL_Q8_0, WHISPER_BASE_Q8_0,
  QWEN3_1_7B_INST_Q4, QWEN3_4B_INST_Q4_K_M,
  VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M_1, MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1,
} from "@qvac/sdk";
import { leerCedula, evaluarKyc, camposDeCedula } from "./documento.mjs";
import { extraerEntrevista, expedienteDe } from "./entrevista.mjs";
import { decidir } from "./cotejar.mjs";

// El nombre del producto vive aquí, y en el <title> y el <h1> de index.html.
const PRODUCTO = "Alcancía";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATOS = path.join(DIR, "datos");
mkdirSync(DATOS, { recursive: true });
const PUERTO = Number(process.env.PUERTO || 3215);

// Qwen3 1.7B basta para una entrevista de ventanilla: son cuatro campos de texto libre
// y el resto lo decide el código. QMODEL=4b sube al grande si hace falta más criterio.
const USA_4B = process.env.QMODEL === "4b";
const VOZ_BASE = process.env.QVOZ === "base";
const MODELOS = `Whisper ${VOZ_BASE ? "base" : "small"} + Qwen3 ${USA_4B ? "4B" : "1.7B"} + VisionPsy-Nano-460M`;

// Sesga a Whisper hacia el vocabulario de ventanilla. Sin esto confunde los productos
// del banco con palabras corrientes y parte los números de cédula donde no toca.
const VOCABULARIO = "Cédula de identidad personal. Cuenta de ahorros, cuenta corriente, préstamo personal, préstamo hipotecario, certificado de plazo fijo. Balboas al mes. En Panamá: La Chorrera, Betania, Colón, David, Chiriquí, Santiago, Penonomé.";

console.log("cargando modelos…");
const t0 = Date.now();
const whisper = await loadModel({ modelSrc: VOZ_BASE ? WHISPER_BASE_Q8_0 : WHISPER_SMALL_Q8_0, modelConfig: { detect_language: true } });
const llm = await loadModel({ modelSrc: USA_4B ? QWEN3_4B_INST_Q4_K_M : QWEN3_1_7B_INST_Q4 });
console.log(`voz y texto listos en ${((Date.now() - t0) / 1000).toFixed(1)} s · ${MODELOS}`);

// VisionPsy se carga con la primera foto, no al arrancar: son 411 MB más, y en una
// ventanilla la atención empieza hablando. La primera cédula paga la carga; las demás no.
let visionpsy = null;
async function modeloDeDocumentos() {
  if (visionpsy) return visionpsy;
  const t = Date.now();
  visionpsy = await loadModel({
    modelSrc: VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M_1,
    modelConfig: { ctx_size: 4096, projectionModelSrc: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1 },
  });
  console.log(`VisionPsy-Nano-460M cargado en ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return visionpsy;
}

// ---------- HTTP ----------

const cuerpo = (req) => new Promise((res, rej) => {
  const trozos = []; let n = 0;
  req.on("data", (t) => { n += t.length; if (n > 30e6) { rej(new Error("cuerpo demasiado grande")); req.destroy(); } else trozos.push(t); });
  req.on("end", () => res(Buffer.concat(trozos)));
  req.on("error", rej);
});
const json = (res, codigo, obj) => { res.writeHead(codigo, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PUERTO}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(path.join(DIR, "index.html")));
    }

    if (req.method === "GET" && url.pathname === "/estado") {
      return json(res, 200, { producto: PRODUCTO, modelos: MODELOS, documentoCargado: !!visionpsy });
    }

    // Voz del oficial -> texto. Se guarda la última grabación para poder reproducir
    // un fallo con la voz real en vez de con una transcripción de memoria.
    if (req.method === "POST" && url.pathname === "/transcribir") {
      const audio = await cuerpo(req);
      if (!audio.length) return json(res, 400, { error: "falta el audio" });
      writeFileSync(path.join(DATOS, "ultimo-audio.wav"), audio);
      const t = Date.now();
      const texto = String(await transcribe({ modelId: whisper, audioChunk: audio, prompt: VOCABULARIO })).trim();
      return json(res, 200, { texto, ms: Date.now() - t });
    }

    // Texto -> expediente KYC. El modelo propone cuatro campos de texto libre; la
    // cédula, el teléfono y el ingreso los saca el código de la propia frase.
    if (req.method === "POST" && url.pathname === "/entrevista") {
      const { texto, campos } = JSON.parse((await cuerpo(req)).toString("utf-8"));
      if (!texto?.trim()) return json(res, 400, { error: "falta el texto" });
      const r = await extraerEntrevista(llm, texto.trim());
      const kyc = campos ? evaluarKyc(campos) : null;
      return json(res, 200, { ...r, ...decidir(r.expediente, campos ?? null, kyc), kyc });
    }

    // Foto de la cédula -> campos + veredicto de vigencia, y el cotejo si ya hay
    // expediente. Se guarda la última foto para poder reproducir una lectura mala.
    if (req.method === "POST" && url.pathname === "/documento") {
      const ct = req.headers["content-type"] || "";
      const imagen = await cuerpo(req);
      if (!imagen.length) return json(res, 400, { error: "falta la imagen" });
      const ruta = path.join(DATOS, `ultimo-documento.${ct.includes("jpeg") ? "jpg" : "png"}`);
      writeFileSync(ruta, imagen);
      const r = await leerCedula(await modeloDeDocumentos(), ruta);
      return json(res, 200, r);
    }

    // Rehacer la decisión cuando cambia una de las dos mitades sin volver a pasar por
    // un modelo: el operador asigna una fecha huérfana, o se queda con el nombre del
    // documento. La regla vive en un solo sitio y no se duplica en el navegador.
    if (req.method === "POST" && url.pathname === "/decidir") {
      const { expediente, campos } = JSON.parse((await cuerpo(req)).toString("utf-8"));
      if (!expediente) return json(res, 400, { error: "falta el expediente" });
      const kyc = campos ? evaluarKyc(campos) : null;
      return json(res, 200, { ...decidir(expediente, campos ?? null, kyc), kyc });
    }

    // Un caso de la demostración. Todo es real menos la foto: Qwen3 extrae de verdad
    // el dictado, y del lado del documento entra el texto que VisionPsy YA devolvió
    // sobre esa cédula (`rendimiento/cedulas.json`). Sirve para enseñar los cuatro
    // desenlaces seguidos sin depender de la cámara ni de 18 s de lectura por foto.
    if (req.method === "POST" && url.pathname === "/caso") {
      const { texto, textoLeido } = JSON.parse((await cuerpo(req)).toString("utf-8"));
      if (!texto?.trim()) return json(res, 400, { error: "falta el texto" });
      const r = await extraerEntrevista(llm, texto.trim());
      const campos = textoLeido ? camposDeCedula(textoLeido) : null;
      const kyc = campos ? evaluarKyc(campos) : null;
      return json(res, 200, { crudo: r.crudo, descartes: r.descartes, ms: r.ms, stats: r.stats, campos, textoLeido: textoLeido ?? "", ...decidir(r.expediente, campos, kyc), kyc });
    }

    json(res, 404, { error: "no existe" });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e?.message ?? String(e) });
  }
});

// HOST=0.0.0.0 abre la ventanilla a la red local. Ojo: el micrófono del navegador solo
// funciona en localhost o HTTPS; desde otra máquina se puede subir audio, no grabar.
const HOST = process.env.HOST || "127.0.0.1";
servidor.listen(PUERTO, HOST, () => {
  console.log(`${PRODUCTO} en http://localhost:${PUERTO}`);
  if (HOST === "0.0.0.0") {
    const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
    for (const ip of ips) console.log(`  en la red local: http://${ip}:${PUERTO}  (sin micrófono; para grabar hace falta HTTPS)`);
  }
});
