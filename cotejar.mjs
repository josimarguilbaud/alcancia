// El cotejo: comparar lo que el cliente dijo contra lo que dice su documento.
//
// Es la pieza que hace que esto sirva en un banco. Un lector de cédulas normal lee un papel y ya.
// Aquí hay dos fuentes que pueden no coincidir, y la regla del banco es la misma que en
// el resto del producto: cuando dos fuentes discrepan, no se elige una en silencio.
//
// Tres resultados, y cada uno significa algo distinto para el operador:
//
//   coincide   lo dicho y lo leído son lo mismo -> el dato queda CONFIRMADO
//   contenido  lo dicho es parte de lo leído ("José Castillero" dentro de "José Miguel
//              Castillero Pinzón") -> no es un conflicto, es un nombre incompleto: se
//              adopta el del documento y se deja dicho de dónde salió
//   discrepa   hay una palabra que el documento no respalda -> CONFLICTO, y el trámite
//              se detiene hasta que lo resuelva una persona
//
// El caso "contenido" existe porque en ventanilla la gente se presenta con un apellido
// y la cédula trae dos. Tratar eso como conflicto convertiría el aviso en ruido, y un
// aviso que salta siempre deja de leerse.
import { plano } from "./documento.mjs";

const palabras = (s) => {
  const p = plano(s);
  return p ? p.split(" ").filter(Boolean) : [];
};

/**
 * Compara un valor dicho contra el mismo valor leído del documento.
 * No corrige nada: solo dice qué encontró.
 */
export function cotejar(dicho, leido) {
  if (!String(dicho ?? "").trim() || !String(leido ?? "").trim()) {
    return { resultado: "sin-cotejo" };
  }
  if (plano(dicho) === plano(leido)) return { resultado: "coincide" };

  const d = palabras(dicho);
  const l = palabras(leido);
  const sobran = d.filter((w) => !l.includes(w));

  if (sobran.length === 0) {
    return { resultado: "contenido", nota: "el documento trae el nombre completo" };
  }
  return { resultado: "discrepa", sobran };
}

// Los campos que existen a los dos lados. El resto del expediente (producto, ingreso,
// domicilio, teléfono, ocupación) no está en la cédula: no hay contra qué cotejarlo.
export const COTEJABLES = [
  { clave: "nombre", etiqueta: "Nombre completo" },
  { clave: "cedula", etiqueta: "Cédula" },
];

/**
 * Cotejo campo por campo del expediente contra la cédula.
 * Devuelve, por cada campo cotejable, qué pasó y con qué valor hay que quedarse.
 */
export function cotejarExpediente(voz, campos) {
  const filas = [];
  for (const { clave, etiqueta } of COTEJABLES) {
    const dicho = voz?.[clave]?.valor ?? "";
    const leido = campos?.[clave] ?? "";
    const r = cotejar(dicho, leido);
    filas.push({
      clave,
      etiqueta,
      dicho,
      leido,
      resultado: r.resultado,
      nota: r.nota ?? null,
      sobran: r.sobran ?? null,
      // Con qué valor se queda el expediente. En "contenido" gana el documento, que es
      // la fuente fuerte; en "discrepa" no gana nadie hasta que una persona decida.
      valor: r.resultado === "contenido" ? leido : dicho,
      estado:
        r.resultado === "coincide" || r.resultado === "contenido" ? "confirmado"
        : r.resultado === "discrepa" ? "conflicto"
        : dicho ? "reportado" : "falta",
    });
  }
  return filas;
}

export const conflictosDe = (filas) => filas.filter((f) => f.estado === "conflicto");

/**
 * La regla completa del trámite. `evaluarKyc` decide sobre el documento; aquí se le
 * suman las dos razones que solo existen cuando hay dos fuentes: que el expediente
 * esté incompleto, y que lo dicho no cuadre con lo leído.
 *
 * Una discrepancia detiene el trámite igual que una cédula vencida. Es deliberado: si
 * el nombre que dio el cliente no es el de su documento, eso no es un detalle de forma.
 */
const OBLIGATORIOS = [
  { clave: "nombre", etiqueta: "nombre completo" },
  { clave: "cedula", etiqueta: "cédula" },
  { clave: "producto", etiqueta: "producto solicitado" },
];

export function decidir(expediente, campos, kyc) {
  const cotejo = cotejarExpediente(expediente, campos);
  const conflictos = conflictosDe(cotejo);

  // El cotejo puede mejorar el expediente: cuando el documento trae el nombre completo,
  // ese es el que vale. Se anota de dónde salió; no se pisa en silencio.
  const resuelto = { ...expediente };
  for (const f of cotejo) {
    if (f.estado === "confirmado" && f.valor && f.valor !== f.dicho) {
      resuelto[f.clave] = { valor: f.valor, estado: "confirmado", porque: `dijo «${f.dicho}»; ${f.nota ?? "lo confirma el documento"}` };
    } else if (f.estado !== "falta" && f.dicho) {
      resuelto[f.clave] = { ...resuelto[f.clave], estado: f.estado, porque: f.estado === "conflicto" ? `el documento dice «${f.leido}»` : f.estado === "confirmado" ? "coincide con el documento" : null };
    }
  }

  const faltan = OBLIGATORIOS.filter((o) => !resuelto[o.clave]?.valor).map((o) => o.etiqueta);
  const razones = [];
  if (kyc && !kyc.puedeSeguir) razones.push(kyc.motivo);
  for (const c of conflictos) razones.push(`Lo que dijo el cliente no coincide con el documento en: ${c.etiqueta}.`);
  if (faltan.length) razones.push(`Faltan datos obligatorios: ${faltan.join(", ")}.`);
  if (!campos) razones.push("Falta la foto del documento: nada está confirmado todavía.");

  return { expediente: resuelto, cotejo, conflictos, faltan, razones, puedeSeguir: razones.length === 0 };
}
