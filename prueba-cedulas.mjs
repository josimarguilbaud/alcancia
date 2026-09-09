// Puntúa la lectura contra la verdad de documentos/verdad.json y deja el registro de
// rendimiento. La métrica que importa a un banco no es "cuántos campos leyó" sino
// "cuántos leyó MAL": un campo que falta se pregunta, uno inventado se firma.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loadModel, unloadModel, VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M_1, MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1 } from "@qvac/sdk";
import { leerCedula } from "./documento.mjs";

const verdad = JSON.parse(readFileSync(new URL("./documentos/verdad.json", import.meta.url), "utf-8"));
const ruta = (id) => new URL(`./documentos/${id}.png`, import.meta.url).pathname.slice(1);

const t0 = Date.now();
const modelId = await loadModel({
  modelSrc: VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M_1,
  modelConfig: { ctx_size: 4096, projectionModelSrc: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1 },
});
const cargaMs = Date.now() - t0;
console.log(`VisionPsy-Nano-460M (q4_k_m + mmproj q8) cargado en ${(cargaMs / 1000).toFixed(1)} s\n`);

const COMPARAR = ["nombre", "cedula", "nacimiento", "lugar", "sexo", "sangre", "expedida", "expira"];
const registro = { modelo: "VisionPsy-Nano-460M", cuantizacion: "q4_k_m (+ mmproj q8_0)", cargaMs, documentos: [] };
let leidos = 0, malos = 0, decisionesOk = 0;

for (const c of verdad) {
  const r = await leerCedula(modelId, ruta(c.id));
  const errores = [];
  let n = 0;
  for (const campo of COMPARAR) {
    const dio = String(r.campos[campo] ?? "").trim();
    if (!dio) continue;              // no leído: se pregunta, no cuenta como error
    n++;
    const esperado = String(c[campo] ?? "").trim();
    if (dio.toUpperCase() !== esperado.toUpperCase()) errores.push(`${campo}: «${dio}» (era «${esperado}»)`);
  }
  leidos += n; malos += errores.length;

  // Lo que un operador humano decidiría con ese documento delante.
  const esperada = c.id === "vencida" ? "vencida" : (r.campos.expira ? "vigente" : "no evaluable");
  const decisionOk = r.kyc.estado === esperada;
  if (decisionOk) decisionesOk++;

  console.log(`${errores.length === 0 ? "✅" : "❌"} ${c.id.padEnd(16)} ${String(r.ms).padStart(6)} ms · ${n} campos leídos, ${errores.length} mal`);
  console.log(`   ${decisionOk ? "✅" : "❌"} trámite: ${r.kyc.estado.toUpperCase()} · ${r.kyc.motivo}`);
  for (const a of r.kyc.avisos) console.log(`      aviso: ${a}`);
  for (const e of errores) console.log(`      MAL ${e}`);
  registro.documentos.push({ id: c.id, ms: r.ms, campos: r.campos, kyc: r.kyc, errores, textoLeido: r.textoLeido, stats: r.stats });
}

console.log(`\nRESULTADO: ${leidos} campos leídos en ${verdad.length} documentos · **${malos} mal** · ${decisionesOk}/${verdad.length} trámites decididos como un operador`);
const st = registro.documentos.map((d) => d.stats);
const med = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`TTFT medio ${Math.round(med(st.map((s) => s.timeToFirstToken)))} ms · ${med(st.map((s) => s.tokensPerSecond)).toFixed(1)} tok/s · ${st[0].backendDevice}`);
mkdirSync(new URL("./rendimiento/", import.meta.url), { recursive: true });
writeFileSync(new URL("./rendimiento/cedulas.json", import.meta.url), JSON.stringify(registro, null, 2) + "\n");
console.log("registro de rendimiento en rendimiento/cedulas.json");
await unloadModel({ modelId, clearStorage: false });
