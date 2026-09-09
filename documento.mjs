// Lectura de una cédula panameña con VisionPsy-Nano-460M, entera en el dispositivo.
//
// La tesis: un banco no puede aceptar "probablemente". Medido el 9 sep sobre cuatro
// cédulas sintéticas, VisionPsy pierde primero justo el campo que más importa: en la
// cédula gastada la FECHA DE EXPIRACIÓN no aparece, y en la de extranjero hay dos
// fechas bajo una sola etiqueta. Un lector ingenuo enseña seis campos correctos y se
// come el séptimo en silencio, o le asigna la fecha equivocada.
//
// Por eso aquí el modelo solo transcribe y el código empareja etiqueta con valor. Lo
// que no tiene etiqueta no se asigna: se devuelve como huérfano para que lo confirme
// una persona. Preferimos decir "no lo leí" antes que decir un número que no vimos.
import { completion } from "@qvac/sdk";

export const PREGUNTA = "This is a national ID card. Transcribe every line of text exactly as printed, one line per row. Do not explain, do not add anything.";

// Minúsculas, sin acentos, sin puntuación: "CEDula" y "CÉDULA" son la misma etiqueta.
export const plano = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[.,;:!?¿¡"«»()]+/g, " ").replace(/\s+/g, " ").trim();

function distancia(a, b) {
  const f = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = f[0]; f[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = f[j];
      f[j] = Math.min(f[j] + 1, f[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return f[b.length];
}

// Las etiquetas de la cédula. El modelo las devuelve con erratas ("LUIGAR", "LUARDE DE",
// "CEDula"), así que se emparejan por distancia de edición proporcional al largo.
const ETIQUETAS = [
  { campo: "nombre", texto: "nombre" },
  { campo: "cedula", texto: "cedula" },
  { campo: "nacimiento", texto: "fecha de nacimiento" },
  { campo: "lugar", texto: "lugar de nacimiento" },
  { campo: "sexo", texto: "sexo" },
  { campo: "sangre", texto: "tipo de sangre" },
  { campo: "expedida", texto: "expedida" },
  { campo: "expira", texto: "expira" },
];

export function etiquetaDe(linea) {
  const l = plano(linea);
  if (!l || l.length > 30) return null;
  for (const e of ETIQUETAS) if (l === e.texto) return e.campo;
  for (const e of ETIQUETAS) {
    const tope = Math.max(1, Math.floor(e.texto.length / 5));
    if (Math.abs(l.length - e.texto.length) <= 3 && distancia(l, e.texto) <= tope) return e.campo;
  }
  return null;
}

// Frases con las que el modelo se presenta o se despide. No son texto de la cédula.
const RUIDO = /^(this (card )?is a( national)? id card|the answer is|here (is|are)|documento sintetico)/i;

const FECHA = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
export const aIso = (t) => {
  const m = FECHA.exec(String(t).trim());
  if (!m) return "";
  const [, d, mes, a] = m;
  return `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

// Formatos reales de la cédula panameña: natural (8-912-3456), provincias con dos
// dígitos, extranjero (E-8-145097), panameño nacido fuera (PE-123-4567) y naturalizado.
const FORMATO_CEDULA = /^(?:\d{1,2}-\d{1,4}-\d{1,6}|(?:PE|E|N|AV|PI)-\d{1,4}-\d{1,6})$/i;
export const cedulaValida = (c) => FORMATO_CEDULA.test(String(c).trim().toUpperCase());

// Un nombre pegado ("ANTONIOBERNAL") es una lectura dudosa: se marca, no se arregla.
// Inventarle un espacio a un nombre es exactamente lo que un banco no puede permitirse.
export const nombreDudoso = (n) => String(n).split(/\s+/).some((w) => w.length > 12);

/**
 * Empareja etiqueta con valor recorriendo las líneas. Una etiqueta se lleva UNA línea
 * de valor. Todo lo demás queda huérfano: leído, pero sin a qué campo pertenece.
 */
export function camposDeCedula(texto) {
  const lineas = String(texto).split("\n").map((l) => l.trim()).filter((l) => l && !RUIDO.test(l));
  const campos = {};
  const huerfanos = [];

  for (let i = 0; i < lineas.length; i++) {
    const campo = etiquetaDe(lineas[i]);
    if (!campo) continue;
    // El valor es la siguiente línea que no sea otra etiqueta.
    const j = i + 1;
    if (j >= lineas.length || etiquetaDe(lineas[j])) continue;
    if (campos[campo] === undefined) campos[campo] = lineas[j].trim();
    i = j;
  }

  // Lo que quedó suelto: valores sin etiqueta que los reclame.
  const usados = new Set(Object.values(campos));
  for (const l of lineas) {
    if (etiquetaDe(l) || usados.has(l.trim())) continue;
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(l.trim())) huerfanos.push(l.trim());
  }

  // "F   O+" trae sexo y sangre juntos: se separan sin adivinar nada.
  if (campos.sexo && !campos.sangre) {
    const m = /^([FM])\s+([ABO]{1,2}[+-]|AB[+-])$/i.exec(campos.sexo.replace(/\s+/g, " ").trim());
    if (m) { campos.sexo = m[1].toUpperCase(); campos.sangre = m[2].toUpperCase(); }
  }

  return {
    nombre: campos.nombre ?? "",
    cedula: (campos.cedula ?? "").toUpperCase().replace(/\s+/g, ""),
    nacimiento: aIso(campos.nacimiento),
    lugar: campos.lugar ?? "",
    sexo: (campos.sexo ?? "").toUpperCase().slice(0, 1),
    sangre: (campos.sangre ?? "").toUpperCase(),
    expedida: aIso(campos.expedida),
    expira: aIso(campos.expira),
    // Fechas leídas que ninguna etiqueta reclamó. No se asignan: se preguntan.
    huerfanos,
  };
}

/**
 * La regla del banco. No decide por el operador cuando no puede leer: distingue
 * "vencida" de "no pude leer la fecha", que para un trámite son cosas muy distintas.
 */
export function evaluarKyc(campos, hoy = new Date()) {
  const faltan = [];
  if (!campos.nombre) faltan.push("nombre");
  if (!campos.cedula) faltan.push("número de cédula");
  if (!campos.nacimiento) faltan.push("fecha de nacimiento");
  if (!campos.expira) faltan.push("fecha de expiración");

  const avisos = [];
  if (campos.cedula && !cedulaValida(campos.cedula)) avisos.push(`«${campos.cedula}» no tiene forma de cédula panameña`);
  if (campos.nombre && nombreDudoso(campos.nombre)) avisos.push(`el nombre trae palabras pegadas: hay que confirmarlo a mano`);
  if (campos.huerfanos?.length) avisos.push(`se leyeron ${campos.huerfanos.length} fecha(s) sin etiqueta (${campos.huerfanos.join(", ")}): no se asignan solas`);

  if (faltan.length) {
    return {
      estado: "no evaluable",
      puedeSeguir: false,
      motivo: `No se pudo leer: ${faltan.join(", ")}. El trámite no sigue hasta confirmarlo una persona.`,
      faltan, avisos,
    };
  }

  const vence = new Date(campos.expira + "T00:00:00");
  const dias = Math.floor((vence - hoy) / 86400000);
  if (dias < 0) {
    return { estado: "vencida", puedeSeguir: false, motivo: `La cédula venció hace ${Math.abs(dias)} días (${campos.expira}).`, faltan, avisos };
  }
  if (dias < 90) {
    return { estado: "por vencer", puedeSeguir: true, motivo: `Vigente, pero vence en ${dias} días (${campos.expira}).`, faltan, avisos };
  }
  return { estado: "vigente", puedeSeguir: true, motivo: `Vigente hasta ${campos.expira}.`, faltan, avisos };
}

export async function leerCedula(modelId, rutaImagen) {
  const t0 = Date.now();
  const run = completion({
    modelId,
    history: [{ role: "user", content: PREGUNTA, attachments: [{ path: rutaImagen }] }],
    temperature: 0, max_tokens: 300, captureThinking: false,
  });
  const texto = (await run.text).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const campos = camposDeCedula(texto);
  return { campos, kyc: evaluarKyc(campos), textoLeido: texto, ms: Date.now() - t0, stats: await run.stats };
}
