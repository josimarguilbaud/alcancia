// Genera pasaportes SINTÉTICOS para medir la lectura del MRZ.
//
// El país emisor es **UTO**, el código que ICAO 9303 reserva para especímenes. No se
// dibuja la réplica del pasaporte de ningún país real: aunque lleve marca de agua de
// documento sintético, fabricar una copia creíble de un documento de viaje de un estado
// es exactamente la clase de cosa que no se hace.
//
// El navegador dibuja (Node no tiene canvas) y este servidor escribe a disco.
// Correr: node documentos/generar-pasaporte.mjs y abrir http://localhost:3216. Se cierra solo.
import http from "node:http";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mrzDe } from "../pasaporte.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));

// La verdad de cada documento. Es contra esto que se puntúa la lectura.
export const PASAPORTES = [
  {
    id: "pasaporte-limpio",
    pais: "UTO",
    apellidos: "FERREIRA<DOS<SANTOS",
    nombres: "ANA LUCIA",
    numero: "X1234567",
    nacimiento: "1993-09-05",
    expira: "2032-08-19",
    sexo: "F",
    opcional: "",
    estilo: "limpia",
  },
  {
    id: "pasaporte-gastado",
    pais: "UTO",
    apellidos: "OKONKWO",
    nombres: "CHIDI EMEKA",
    numero: "B7742019",
    nacimiento: "1979-02-28",
    expira: "2024-11-30",
    sexo: "M",
    opcional: "",
    estilo: "gastada",
  },
];

const CON_MRZ = PASAPORTES.map((p) => ({ ...p, mrz: mrzDe(p) }));

const PAGINA = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>generando</title></head>
<body style="font:14px system-ui;padding:24px">
<p id="e">dibujando…</p>
<script>
const PASAPORTES = ${JSON.stringify(CON_MRZ)};

function dibujar(p) {
  const c = document.createElement("canvas");
  c.width = 1000; c.height = 700;
  const g = c.getContext("2d");
  const gastado = p.estilo === "gastada";

  // fondo
  g.fillStyle = "#EDE9E1"; g.fillRect(0, 0, 1000, 700);
  g.strokeStyle = "#9A8F7C"; g.lineWidth = 3; g.strokeRect(14, 14, 972, 672);

  // guilloche muy simple, solo para que no sea un rectangulo plano
  g.strokeStyle = "rgba(120,140,110,.16)"; g.lineWidth = 1;
  for (let i = 0; i < 44; i++) {
    g.beginPath();
    for (let x = 20; x < 980; x += 6) g.lineTo(x, 60 + i * 13 + Math.sin(x / 26 + i) * 7);
    g.stroke();
  }

  g.fillStyle = "#2B2A26";
  g.font = "700 26px Georgia, serif";
  g.fillText("PASAPORTE  ·  PASSPORT", 40, 62);
  g.font = "600 15px Georgia, serif";
  g.fillText("REPUBLICA DE UTOPIA  ·  SPECIMEN", 40, 88);

  // foto
  g.fillStyle = "#C9C2B4"; g.fillRect(40, 110, 200, 250);
  g.strokeStyle = "#8A8271"; g.lineWidth = 2; g.strokeRect(40, 110, 200, 250);
  g.fillStyle = "#8A8271"; g.font = "600 13px system-ui";
  g.fillText("FOTO", 118, 240);

  const filas = [
    ["Tipo / Type", "P"],
    ["Codigo del pais / Country code", p.pais],
    ["Pasaporte No. / Passport No.", p.numero],
    ["Apellidos / Surname", p.apellidos.replace(/</g, " ")],
    ["Nombres / Given names", p.nombres],
    ["Nacionalidad / Nationality", "UTOPIANA"],
    ["Fecha de nacimiento / Date of birth", p.nacimiento.split("-").reverse().join(" ")],
    ["Sexo / Sex", p.sexo],
    ["Fecha de expiracion / Date of expiry", p.expira.split("-").reverse().join(" ")],
  ];

  let y = 128;
  for (const [et, val] of filas) {
    g.fillStyle = "#6B6355"; g.font = "500 12px system-ui";
    g.fillText(et.toUpperCase(), 275, y);
    g.fillStyle = "#1E1D1A"; g.font = "700 20px Georgia, serif";
    g.fillText(String(val), 275, y + 24);
    y += 52;
  }

  // marca de agua: esto no es un documento real y se dice en el propio documento
  g.save();
  g.translate(500, 350); g.rotate(-0.32);
  g.fillStyle = "rgba(180,60,60,.20)"; g.font = "800 40px system-ui"; g.textAlign = "center";
  g.fillText("DOCUMENTO SINTETICO", 0, -18);
  g.fillText("NO ES UN PASAPORTE REAL", 0, 30);
  g.restore();
  g.textAlign = "left";

  // MRZ
  g.fillStyle = "#F4F2EC"; g.fillRect(20, 566, 960, 114);
  g.fillStyle = "#15140F";
  g.font = "700 27px 'Courier New', monospace";
  g.fillText(p.mrz[0], 34, 610);
  g.fillText(p.mrz[1], 34, 654);

  if (gastado) {
    // desgaste: manchas, rayas y un velo. El MRZ es lo que mas sufre en un documento real.
    g.globalAlpha = .5;
    for (let i = 0; i < 260; i++) {
      g.fillStyle = Math.random() > .5 ? "rgba(90,80,60,.5)" : "rgba(255,255,255,.6)";
      g.fillRect(Math.random() * 1000, Math.random() * 700, Math.random() * 26, Math.random() * 4);
    }
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(120,110,90,.45)"; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      g.beginPath(); g.moveTo(Math.random() * 1000, 560 + Math.random() * 120);
      g.lineTo(Math.random() * 1000, 560 + Math.random() * 120); g.stroke();
    }
    g.fillStyle = "rgba(200,190,170,.30)"; g.fillRect(0, 0, 1000, 700);
  }

  return c.toDataURL("image/png");
}

(async () => {
  for (const p of PASAPORTES) {
    await fetch("/guardar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.id, png: dibujar(p) }),
    });
  }
  await fetch("/listo", { method: "POST" });
  document.getElementById("e").textContent = "listo, ya puedes cerrar esta pestaña";
})();
</script></body></html>`;

const cuerpo = (req) => new Promise((res) => {
  const t = []; req.on("data", (x) => t.push(x)); req.on("end", () => res(Buffer.concat(t).toString("utf-8")));
});

const servidor = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(PAGINA);
  }
  if (req.method === "POST" && req.url === "/guardar") {
    const { id, png } = JSON.parse(await cuerpo(req));
    const ruta = path.join(DIR, `${id}.png`);
    writeFileSync(ruta, Buffer.from(png.split(",")[1], "base64"));
    console.log("  escrito", `${id}.png`);
    res.writeHead(200); return res.end("ok");
  }
  if (req.method === "POST" && req.url === "/listo") {
    writeFileSync(path.join(DIR, "verdad-pasaportes.json"), JSON.stringify(CON_MRZ, null, 2));
    console.log("  escrito verdad-pasaportes.json");
    res.writeHead(200); res.end("ok");
    console.log("listo");
    setTimeout(() => process.exit(0), 300);
    return;
  }
  res.writeHead(404); res.end();
});

servidor.listen(3216, () => console.log("generador de pasaportes en http://localhost:3216"));
