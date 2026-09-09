// Genera cédulas panameñas SINTÉTICAS para medir cuánto acierta la lectura.
// El reto de Caja de Ahorros exige datos sintéticos o públicos y prohíbe expresamente
// datos reales de clientes de cualquier entidad financiera: por eso se fabrican aquí,
// con nombres inventados, y la verdad de cada una queda escrita al lado.
//
// El navegador dibuja (Node no tiene canvas) y este servidor escribe a disco.
// Correr: node documentos/generar.mjs y abrir http://localhost:3213. Se cierra solo.
import http from "node:http";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

// La verdad de cada documento. Es contra esto que se puntúa la lectura.
export const CEDULAS = [
  {
    id: "vigente-limpia",
    nombre: "MARIA ISABEL QUINTERO ARJONA",
    cedula: "8-912-3456",
    nacimiento: "1988-04-17",
    lugar: "PANAMA, PANAMA",
    sexo: "F",
    sangre: "O+",
    expedida: "2021-06-02",
    expira: "2031-06-02",
    estilo: "limpia",
  },
  {
    id: "vencida",
    nombre: "RODRIGO ANTONIO BERNAL SAAVEDRA",
    cedula: "3-701-2288",
    nacimiento: "1974-11-30",
    lugar: "COLON, COLON",
    sexo: "M",
    sangre: "A-",
    expedida: "2015-02-11",
    expira: "2025-02-11",
    estilo: "limpia",
  },
  {
    id: "extranjero",
    nombre: "ANA LUCIA FERREIRA DOS SANTOS",
    cedula: "E-8-145097",
    nacimiento: "1993-09-05",
    lugar: "SAO PAULO, BRASIL",
    sexo: "F",
    sangre: "B+",
    expedida: "2022-08-19",
    expira: "2032-08-19",
    estilo: "limpia",
  },
  {
    id: "gastada",
    nombre: "JOSE MIGUEL CASTILLERO PINZON",
    cedula: "4-155-8830",
    nacimiento: "1966-01-23",
    lugar: "DAVID, CHIRIQUI",
    sexo: "M",
    sangre: "AB+",
    expedida: "2019-10-08",
    expira: "2029-10-08",
    estilo: "gastada",
  },
];

const PAGINA = `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:20px">
<h3>Generando cédulas sintéticas…</h3><div id="log"></div><script>
const CEDULAS = ${JSON.stringify(CEDULAS)};
const fecha = (iso) => { const [a, m, d] = iso.split("-"); return d + "-" + m + "-" + a; };

function dibujar(c) {
  const cv = document.createElement("canvas");
  cv.width = 860; cv.height = 540;
  const x = cv.getContext("2d");
  const gastada = c.estilo === "gastada";

  // Fondo tipo tarjeta plastificada, con una banda superior.
  x.fillStyle = gastada ? "#e6e3dc" : "#f4f2ec"; x.fillRect(0, 0, 860, 540);
  x.fillStyle = "#123a6b"; x.fillRect(0, 0, 860, 92);
  x.strokeStyle = "#9aa3ab"; x.lineWidth = 4; x.strokeRect(2, 2, 856, 536);

  x.fillStyle = "#ffffff";
  x.font = "bold 27px Arial"; x.fillText("REPUBLICA DE PANAMA", 28, 40);
  x.font = "17px Arial"; x.fillText("TRIBUNAL ELECTORAL", 28, 70);
  x.font = "bold 15px Arial"; x.fillText("CEDULA DE IDENTIDAD PERSONAL", 470, 70);

  // Hueco de la foto. Sin retrato: es un documento sintetico y no toca fingir una cara.
  x.fillStyle = "#d6d2c8"; x.fillRect(28, 120, 180, 230);
  x.strokeStyle = "#9aa3ab"; x.lineWidth = 2; x.strokeRect(28, 120, 180, 230);
  x.fillStyle = "#8b8577"; x.font = "13px Arial";
  x.fillText("FOTO", 100, 240);

  const etiqueta = (t, y) => { x.fillStyle = gastada ? "#5c5a52" : "#4a4f55"; x.font = "13px Arial"; x.fillText(t, 240, y); };
  const valor = (t, y, grande) => { x.fillStyle = "#16181a"; x.font = "bold " + (grande ? 26 : 19) + "px Arial"; x.fillText(t, 240, y + 25); };

  etiqueta("NOMBRE", 140); valor(c.nombre, 140, false);
  etiqueta("CEDULA", 205); valor(c.cedula, 205, true);
  etiqueta("FECHA DE NACIMIENTO", 280); valor(fecha(c.nacimiento), 280, false);
  etiqueta("LUGAR DE NACIMIENTO", 345); valor(c.lugar, 345, false);

  etiqueta("SEXO", 410); x.fillStyle = "#16181a"; x.font = "bold 19px Arial"; x.fillText(c.sexo, 240, 435);
  x.fillStyle = gastada ? "#5c5a52" : "#4a4f55"; x.font = "13px Arial"; x.fillText("TIPO DE SANGRE", 340, 410);
  x.fillStyle = "#16181a"; x.font = "bold 19px Arial"; x.fillText(c.sangre, 340, 435);

  x.fillStyle = gastada ? "#5c5a52" : "#4a4f55"; x.font = "13px Arial";
  x.fillText("EXPEDIDA", 540, 410); x.fillText("EXPIRA", 700, 410);
  x.fillStyle = "#16181a"; x.font = "bold 18px Arial";
  x.fillText(fecha(c.expedida), 540, 435); x.fillText(fecha(c.expira), 700, 435);

  x.fillStyle = "#7c8288"; x.font = "12px Arial";
  x.fillText("DOCUMENTO SINTETICO - GENERADO PARA PRUEBAS - NO ES UNA CEDULA REAL", 28, 505);

  if (gastada) {
    // Desgaste: brillo de plastico, rayas y ruido, como una foto hecha en ventanilla.
    const g = x.createLinearGradient(0, 0, 860, 540);
    g.addColorStop(0, "rgba(255,255,255,0.30)"); g.addColorStop(0.45, "rgba(255,255,255,0)");
    g.addColorStop(0.8, "rgba(255,255,255,0.20)"); g.addColorStop(1, "rgba(0,0,0,0.16)");
    x.fillStyle = g; x.fillRect(0, 0, 860, 540);
    x.strokeStyle = "rgba(0,0,0,0.10)"; x.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      x.beginPath(); const yy = Math.random() * 540;
      x.moveTo(0, yy); x.lineTo(860, yy + (Math.random() * 14 - 7)); x.stroke();
    }
    const d = x.getImageData(0, 0, 860, 540);
    for (let i = 0; i < d.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 24;
      d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
    }
    x.putImageData(d, 0, 0);
  }
  return cv.toDataURL("image/png");
}

(async () => {
  for (const c of CEDULAS) {
    await fetch("/guardar", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: c.id, png: dibujar(c).slice(22) }) });
    document.getElementById("log").innerHTML += c.id + " ok<br>";
  }
  document.getElementById("log").innerHTML += "<b>LISTO</b>";
  await fetch("/fin", { method: "POST" });
})();
</script></body>`;

const servidor = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/guardar") {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      const { id, png } = JSON.parse(cuerpo);
      writeFileSync(path.join(DIR, `${id}.png`), Buffer.from(png, "base64"));
      console.log(`escrita ${id}.png`);
      res.writeHead(204).end();
    });
    return;
  }
  if (req.method === "POST" && req.url === "/fin") {
    writeFileSync(path.join(DIR, "verdad.json"), JSON.stringify(CEDULAS, null, 2) + "\n");
    console.log("escrita verdad.json — listo");
    res.writeHead(204).end();
    setTimeout(() => process.exit(0), 300);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGINA);
});
servidor.listen(3213, () => console.log("generador en http://localhost:3213"));
