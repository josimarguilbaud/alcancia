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
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  loadModel, transcribe,
  WHISPER_SMALL_Q8_0, WHISPER_BASE_Q8_0,
  QWEN3_1_7B_INST_Q4, QWEN3_4B_INST_Q4_K_M,
  VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M_1, MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1,
} from "@qvac/sdk";
import { leerCedula, evaluarKyc, camposDeDocumento } from "./documento.mjs";
import { extraerEntrevista, expedienteDe } from "./entrevista.mjs";
import { decidir } from "./cotejar.mjs";
import { pinCorrecto, esperaTras, oficialPublico, registrar, oficialDe, actuacionDe } from "./oficiales.mjs";

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


// El libro de expedientes. Alcancia no abre la cuenta: su trabajo termina cuando produce
// un expediente verificado que otro sistema puede aceptar, y deja constancia de como se
// verifico. Vive en `datos/`, que no se publica.
const LIBRO = path.join(DATOS, "expedientes.json");
const leerLibro = () => (existsSync(LIBRO) ? JSON.parse(readFileSync(LIBRO, "utf-8")) : []);
const escribirLibro = (l) => writeFileSync(LIBRO, JSON.stringify(l, null, 2));

// ---------- el padron de la sucursal ----------
// Quien puede firmar un acta en este equipo. Se siembra la primera vez con los oficiales
// de ejemplo; a partir de ahi el archivo es de la sucursal. Las sales y los hashes viven
// SOLO aqui: al navegador nunca le llega mas que id, nombre y sucursal.
const PADRON = path.join(DATOS, "oficiales.json");
const PADRON_EJEMPLO = path.join(DIR, "datos-ejemplo", "oficiales.json");
function leerPadron() {
  if (!existsSync(PADRON) && existsSync(PADRON_EJEMPLO)) copyFileSync(PADRON_EJEMPLO, PADRON);
  return existsSync(PADRON) ? JSON.parse(readFileSync(PADRON, "utf-8")) : [];
}
const escribirPadron = (p) => writeFileSync(PADRON, JSON.stringify(p, null, 2));

// La sesion vive en memoria y se muere con el proceso: no hay cookie, no hay disco, no
// hay red. Existe para que el acta no se pueda firmar con el nombre de otro solo por
// escribirlo en el cuerpo de la peticion. Sin esto la firma seria decorado, que es
// exactamente lo que era: todas las actas salian firmadas "ventanilla".
const SESIONES = new Map();
const FALLOS = new Map(); // por oficial: cuantos PIN malos seguidos, y hasta cuando espera
const quienEs = (req) => SESIONES.get(String(req.headers["x-alcancia-sesion"] ?? ""));

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

    // Las tipografias se sirven desde el repo, no desde un CDN: una app que funciona sin
    // conexion no puede depender de una descarga externa para verse bien.
    if (req.method === "GET" && url.pathname.startsWith("/tipografias/")) {
      const nombre = path.basename(url.pathname);
      const ruta = path.join(DIR, "tipografias", nombre);
      if (!existsSync(ruta)) return json(res, 404, { error: "no existe" });
      res.writeHead(200, {
        "content-type": nombre.endsWith(".woff2") ? "font/woff2" : "text/css; charset=utf-8",
        "cache-control": "public, max-age=604800",
      });
      return res.end(readFileSync(ruta));
    }

    if (req.method === "GET" && url.pathname === "/estado") {
      return json(res, 200, { producto: PRODUCTO, modelos: MODELOS, documentoCargado: !!visionpsy, pasadas: 2 });
    }

    // Voz del oficial -> texto. Se guarda la última grabación para poder reproducir
    // un fallo con la voz real en vez de con una transcripción de memoria.
    // ---------- quien firma ----------
    // Va sin sesion a proposito: para elegir quien eres hay que poder ver la lista antes
    // de entrar, y aqui no viaja ni una sal ni un hash.
    if (req.method === "GET" && url.pathname === "/oficiales") {
      const padron = leerPadron();
      return json(res, 200, { padron: padron.map(oficialPublico), actuacion: actuacionDe(leerLibro(), padron) });
    }
    if (req.method === "POST" && url.pathname === "/entrar") {
      const { id, pin } = JSON.parse((await cuerpo(req)).toString("utf-8"));
      const oficial = leerPadron().find((o) => o.id === id);
      // Mismo mensaje y mismo camino si el oficial no existe o si el PIN esta mal: si
      // fueran distintos, probar ids seria una forma de averiguar quien trabaja aqui.
      const estado = FALLOS.get(id) ?? { fallos: 0, hasta: 0 };
      const faltan = estado.hasta - Date.now();
      if (faltan > 0) return json(res, 429, { error: `Demasiados intentos. Espera ${Math.ceil(faltan / 1000)} s.`, esperaMs: faltan });
      if (!oficial || !pinCorrecto(oficial, pin)) {
        const fallos = estado.fallos + 1;
        FALLOS.set(id, { fallos, hasta: Date.now() + esperaTras(fallos) });
        return json(res, 401, { error: "Ese PIN no es." });
      }
      FALLOS.delete(id);
      const sesion = randomBytes(24).toString("hex");
      SESIONES.set(sesion, { id: oficial.id, nombre: oficial.nombre, sucursal: oficial.sucursal, verificado: true });
      console.log(`abrio ventanilla ${oficial.nombre} (${oficial.id})`);
      return json(res, 200, { ok: true, sesion, oficial: oficialPublico(oficial) });
    }
    if (req.method === "POST" && url.pathname === "/registrar") {
      const { nombre, sucursal, pin } = JSON.parse((await cuerpo(req)).toString("utf-8"));
      const padron = leerPadron();
      const r = registrar(padron, { nombre, sucursal, pin });
      if (r.error) return json(res, 400, { error: r.error });
      padron.push(r.oficial); escribirPadron(padron);
      const sesion = randomBytes(24).toString("hex");
      SESIONES.set(sesion, { id: r.oficial.id, nombre: r.oficial.nombre, sucursal: r.oficial.sucursal, verificado: true });
      return json(res, 200, { ok: true, sesion, oficial: oficialPublico(r.oficial) });
    }
    if (req.method === "POST" && url.pathname === "/salir") {
      SESIONES.delete(String(req.headers["x-alcancia-sesion"] ?? ""));
      return json(res, 200, { ok: true });
    }

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
      // Dos pasadas por defecto. `?pasadas=1` existe para depurar, no para atender.
      const pasadas = Math.max(1, Math.min(3, Number(url.searchParams.get("pasadas")) || 2));
      const r = await leerCedula(await modeloDeDocumentos(), ruta, {
        pasadas, imagen,
        modelo: "VisionPsy-Nano-460M", cuantizacion: "q4_k_m (+ mmproj q8_0)",
      });
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
      const campos = textoLeido ? camposDeDocumento(textoLeido) : null;
      const kyc = campos ? evaluarKyc(campos) : null;
      return json(res, 200, { crudo: r.crudo, descartes: r.descartes, ms: r.ms, stats: r.stats, campos, textoLeido: textoLeido ?? "", ...decidir(r.expediente, campos, kyc), kyc });
    }

    // Cerrar el tramite. **El servidor vuelve a decidir**: el boton no autoriza nada. Si
    // el navegador pide continuar sobre un expediente que la regla detiene, se rechaza.
    // Un boton que decide es un boton que se puede saltar.
    if (req.method === "POST" && url.pathname === "/cerrar") {
      // La firma sale de la SESION, nunca del cuerpo de la peticion. Ese era el agujero:
      // el acta decide si una cuenta se abre y todas salian firmadas "ventanilla", porque
      // el nombre venia en el cuerpo y la interfaz ni siquiera lo mandaba. Si viniera en
      // el cuerpo, firmar como otra persona seria teclearlo.
      const yo = quienEs(req);
      if (!yo) return json(res, 401, { error: "Entra con tu PIN antes de cerrar un trámite." });
      const { expediente, campos, textoLeido, huella, decision } = JSON.parse((await cuerpo(req)).toString("utf-8"));
      if (!expediente) return json(res, 400, { error: "falta el expediente" });

      const kyc = campos ? evaluarKyc(campos) : null;
      const d = decidir(expediente, campos ?? null, kyc);

      if (decision === "continuar" && !d.puedeSeguir) {
        return json(res, 409, { error: "El trámite no puede continuar.", razones: d.razones });
      }

      const libro = leerLibro();
      const folio = `ALC-${String(libro.length + 1).padStart(4, "0")}`;
      const acta = {
        folio,
        fecha: new Date().toISOString(),
        decision: decision === "continuar" ? "continuado" : "detenido",
        oficial: { id: yo.id, nombre: yo.nombre, sucursal: yo.sucursal, verificado: true },
        expediente: d.expediente,
        campos: campos ?? null,
        kyc,
        cotejo: d.cotejo,
        razones: d.razones,
        huella: huella ?? null,
        textoLeido: textoLeido ?? "",
      };
      libro.push(acta);
      escribirLibro(libro);
      console.log(`${acta.decision}: ${folio} · ${yo.nombre} (${yo.id})`);
      return json(res, 200, { folio, fecha: acta.fecha, decision: acta.decision, razones: d.razones, oficial: oficialDe(acta) });
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
