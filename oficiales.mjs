// Quién firma el acta.
//
// Alcancía no abre la cuenta: entrega un expediente cerrado con folio, y ese expediente
// dice si el trámite sigue o se detiene. Es el documento que alguien va a leer dentro de
// seis meses cuando pregunten por qué esta cuenta se abrió, o por qué aquella no. Hasta
// ahora todas las actas salían firmadas `"ventanilla"`, porque el nombre venía en el
// cuerpo de la petición y la interfaz ni siquiera lo mandaba. Un acta que no sabe quién
// la firmó no es un acta: es una nota.
//
// Se comprueba con un PIN de cuatro dígitos DENTRO del equipo de la sucursal:
// sha256(sal + pin) contra el hash guardado, con una sal distinta por persona. No sale
// una sola llamada de red, que es la condición de todo el sistema. Y hay que decir qué no
// es: cuatro dígitos no son el directorio del banco ni la doble firma que un banco de
// verdad exige para abrir una cuenta. Es la prueba más fuerte que se puede dar sin salir
// del equipo, y el padrón guarda de cada quien si venía en la lista de la sucursal o se
// dio de alta solo. Igual que con el cotejo: se enseña lo que se sabe, no se aparenta
// saber más.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { plano } from "./documento.mjs";

export const PIN = /^\d{4}$/;

export const nuevaSal = () => randomBytes(16).toString("hex");

export const hashDePin = (sal, pin) => createHash("sha256").update(`${sal}:${pin}`, "utf-8").digest("hex");

// Comparación de tiempo constante. Comparar hashes con === se rinde en el primer carácter
// distinto, y ese tiempo es información. Cuesta tres líneas; se ponen.
export function pinCorrecto(oficial, pin) {
  if (!oficial?.sal || !PIN.test(String(pin ?? ""))) return false;
  const a = Buffer.from(hashDePin(oficial.sal, String(pin)), "hex");
  const b = Buffer.from(String(oficial.pinHash ?? ""), "hex");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

// Cuatro dígitos son diez mil combinaciones: a mano no se prueban, con un script sí. La
// espera crece con los fallos para que probarlas todas deje de salir gratis. Se cuenta
// por oficial y no por equipo: si fuera por equipo, el primero que se equivoca deja sin
// atender a toda la sucursal.
export const ESPERAS = [0, 0, 0, 5, 15, 60, 300];
export const esperaTras = (fallos) => ESPERAS[Math.min(Math.max(0, fallos | 0), ESPERAS.length - 1)] * 1000;

// Nunca salen del servidor la sal ni el hash. El PIN de nadie viaja al navegador.
export function oficialPublico(o) {
  if (!o) return null;
  const { sal, pinHash, ...resto } = o;
  return resto;
}

const numeroDeId = (id) => Number(String(id ?? "").replace(/[^0-9]/g, "")) || 0;

// El alta queda escrita: «padrón» es quien ya venía en la lista de la sucursal, «alta
// local» es quien se registró en este equipo. No son la misma garantía y el acta no las
// enseña igual.
export function registrar(padron, { nombre, sucursal, pin, origen = "alta local", hoy = new Date() }) {
  const n = String(nombre ?? "").trim().replace(/\s+/g, " ");
  if (n.length < 3) return { error: "El nombre necesita al menos 3 letras." };
  if (!PIN.test(String(pin ?? ""))) return { error: "El PIN son exactamente cuatro dígitos." };
  // Se responde con el nombre como está escrito en el padrón, no como lo acaban de
  // teclear: quien lo lee necesita reconocer a quién se refiere.
  const ya = padron.find((o) => plano(o.nombre) === plano(n));
  if (ya) return { error: `${ya.nombre} ya está en el padrón de esta sucursal.` };
  const sal = nuevaSal();
  const id = `OF-${String(Math.max(0, ...padron.map((o) => numeroDeId(o.id))) + 1).padStart(2, "0")}`;
  return {
    oficial: {
      id, nombre: n,
      sucursal: String(sucursal ?? "").trim() || "Sin sucursal",
      origen, alta: hoy.toISOString(),
      sal, pinHash: hashDePin(sal, String(pin)),
    },
  };
}

// ---------- quién firma ----------
// Las actas cerradas antes de que existiera el padrón guardaban el oficial como un texto
// suelto, casi siempre «ventanilla», que no era nadie. Se siguen leyendo y se marcan «sin
// verificar», que es la verdad sobre ellas. No se borran ni se reescriben: un libro de
// actas al que se le corrige el pasado deja de servir para lo único que sirve.
export function oficialDe(acta) {
  const v = acta?.oficial;
  if (v && typeof v === "object") {
    return { id: String(v.id ?? "?"), nombre: String(v.nombre ?? "Sin nombre"), sucursal: v.sucursal ?? null, verificado: v.verificado !== false };
  }
  const nombre = String(v ?? "").trim() || "Sin nombre";
  return { id: `libre:${plano(nombre)}`, nombre, sucursal: null, verificado: false };
}

// Qué ha firmado cada quien. Sale del libro de actas, no de un contador aparte: si un
// número de aquí no se puede seguir hasta un folio, no debería estar.
export function actuacionDe(libro, padron = []) {
  const filas = new Map();
  const anota = (quien, base = {}) => {
    if (!filas.has(quien.id)) {
      filas.set(quien.id, { ...quien, ...base, actas: 0, continuados: 0, detenidos: 0, ultima: null });
    }
    return filas.get(quien.id);
  };
  // El padrón entra completo, aunque alguien no haya cerrado nada: un oficial en cero es
  // un dato, no un hueco.
  for (const o of padron) anota({ id: o.id, nombre: o.nombre, sucursal: o.sucursal, verificado: true }, { origen: o.origen, alta: o.alta });
  for (const acta of libro ?? []) {
    const f = anota(oficialDe(acta));
    f.actas++;
    if (acta.decision === "detenido") f.detenidos++; else f.continuados++;
    if (!f.ultima || acta.fecha > f.ultima) f.ultima = acta.fecha;
  }
  return [...filas.values()].sort((a, b) => b.actas - a.actas || a.nombre.localeCompare(b.nombre));
}
