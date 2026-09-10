// Calcula los cuatro casos con el MISMO código que corre en el servidor y los incrusta
// en index.html, entre las marcas CASOS:inicio y CASOS:fin.
//
// Existe para que la página siga explicándose sola cuando se abre sin servidor (que es
// como se la mandamos a alguien por WhatsApp) sin que esa copia se separe de la verdad:
// si cambia una regla, se vuelve a correr `node generar-casos.mjs` y la copia se rehace.
// Sin modelo: no toca QVAC. `node generar-casos.mjs`
import { readFileSync, writeFileSync } from "node:fs";
import { camposDeDocumento, evaluarKyc } from "./documento.mjs";
import { expedienteDe } from "./entrevista.mjs";
import { decidir } from "./cotejar.mjs";
import { CASOS } from "./casos-demo.mjs";

const INICIO = "/* CASOS:inicio */";
const FIN = "/* CASOS:fin */";

const calculados = CASOS.map((c) => {
  const { expediente, descartes } = expedienteDe(c.crudo, c.dictado);
  const campos = camposDeDocumento(c.textoLeido);
  const kyc = evaluarKyc(campos);
  return {
    id: c.id, boton: c.boton, resumen: c.resumen,
    dictado: c.dictado, textoLeido: c.textoLeido,
    descartes, campos, kyc,
    ...decidir(expediente, campos, kyc),
  };
});

const ruta = new URL("./index.html", import.meta.url);
const html = readFileSync(ruta, "utf-8");
const a = html.indexOf(INICIO), b = html.indexOf(FIN);
if (a < 0 || b < 0) {
  console.error(`No encontré las marcas ${INICIO} … ${FIN} en index.html`);
  process.exit(1);
}

const bloque = `${INICIO}\n    var CASOS = ${JSON.stringify(calculados, null, 2).replace(/\n/g, "\n    ")};\n    `;
writeFileSync(ruta, html.slice(0, a) + bloque + html.slice(b), "utf-8");

for (const c of calculados) {
  const conflicto = c.conflictos.length ? `, cotejo: ${c.conflictos.map((x) => x.etiqueta).join(" y ")}` : "";
  console.log(`  ${c.id.padEnd(15)} ${c.kyc.estado.padEnd(13)} ${c.puedeSeguir ? "sigue" : "se detiene"}${conflicto}`);
  for (const d of c.descartes) console.log(`      descarte: ${d}`);
}
console.log(`\n${calculados.length} casos incrustados en index.html`);
