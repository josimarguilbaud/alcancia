// La entrevista de ventanilla: lo que el oficial dicta -> expediente KYC.
//
// Mismo reparto de responsabilidades que en el resto del producto: el modelo propone,
// el código comprueba. Lo que un banco no puede permitirse que un modelo invente lo
// decide el código leyendo la propia frase:
//
//   cédula    -> `cedulaEn`   (formato panameño, y descartando fechas disfrazadas)
//   teléfono  -> `telefonoEn`
//   ingreso   -> `montoEn`    (y si venía con «como» o «más o menos», queda ESTIMADO)
//
// El modelo solo propone lo que es texto libre y no se puede validar con una regla:
// nombre, producto solicitado, domicilio y ocupación. Y aun de eso, lo que no aparece
// en la frase se descarta: si el modelo se lo inventó, no entra al expediente.
import { completion } from "@qvac/sdk";
import { plano, cedulaValida } from "./documento.mjs";

// ---------------------------------------------------------------- el modelo propone

export const esquema = {
  type: "object",
  properties: {
    nombre: { type: "string" },
    producto: { type: "string" },
    domicilio: { type: "string" },
    ocupacion: { type: "string" },
  },
  required: ["nombre", "producto", "domicilio", "ocupacion"],
};

export const SISTEMA = `You extract a bank customer intake from what a branch officer dictated, into JSON. Extract only what the message states; never infer, never ask.
Rules:
- nombre: the customer's full name exactly as spoken, with no titles and no surrounding words. Empty string if the message does not name the customer.
- producto: the product the customer is asking for, in Spanish and in the words of the message ("cuenta de ahorros", "prestamo personal", "cuenta corriente"). Empty string if not stated.
- domicilio: only the place where the customer LIVES ("vive en X", "reside en X", "es de X"). Not the branch, not a workplace. Empty string if not stated.
- ocupacion: the customer's job or profession, one or two words. Empty string if not stated.
- NEVER output a national ID number, a phone number or an amount of money: those are read by code, not by you.
Output only JSON matching the schema.`;

// ------------------------------------------------------------- el código comprueba

// La cédula panameña hablada llega como dígitos con guiones. El problema es que una
// fecha dicha en voz alta tiene la misma forma (23-01-1966 encaja en el patrón), así
// que se descarta todo lo que sea una fecha creíble.
// Se buscan candidatas con una red ancha y se filtran con `cedulaValida`, que es donde
// vive el formato de verdad. Un teléfono («302-1122») entra en la red y sale en el filtro.
const CANDIDATA = /\b(?:[A-Za-z]{1,2}-)?\d{1,4}-\d{1,6}(?:-\d{1,6})?\b/g;
const PALABRA_CEDULA = /^(cedula|cedulas|documento|identidad|identificacion)$/;

export const pareceFecha = (s) => {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(s).trim());
  if (!m) return false;
  const mes = Number(m[2]), anio = Number(m[3]);
  return mes >= 1 && mes <= 12 && anio >= 1900 && anio <= 2100;
};

/**
 * La cédula que aparece en la frase. Si hay varias candidatas, gana la que va detrás
 * de la palabra «cédula»: es la que el oficial señaló como tal.
 */
export function cedulaEn(texto) {
  const t = String(texto ?? "");
  const candidatas = (t.match(CANDIDATA) ?? [])
    .map((c) => c.toUpperCase())
    .filter((c) => cedulaValida(c) && !pareceFecha(c));
  if (!candidatas.length) return "";

  const tok = plano(t).split(" ");
  for (let i = 0; i < tok.length; i++) {
    if (!PALABRA_CEDULA.test(tok[i])) continue;
    for (let j = i + 1; j <= i + 3 && j < tok.length; j++) {
      const hit = candidatas.find((c) => plano(c) === tok[j]);
      if (hit) return hit;
    }
  }
  return candidatas[0];
}

// Panamá: móvil de 8 dígitos que empieza en 6, fijo de 7. Se exige el guion para no
// confundir un teléfono con un monto ni con un trozo de cédula.
const TELEFONO = /\b(?:6\d{3}-\d{4}|[2-9]\d{2}-\d{4})\b/g;

export function telefonoEn(texto, cedula = "") {
  const c = plano(cedula);
  for (const m of String(texto ?? "").match(TELEFONO) ?? []) {
    if (c && c.includes(plano(m))) continue; // es un trozo de la cédula, no un teléfono
    return m;
  }
  return "";
}

// «como 800», «más o menos 900», «unos 1,200»: el número está, pero el cliente no lo
// afirmó. Ese matiz es la diferencia entre un dato reportado y uno estimado, y en un
// expediente de crédito no da lo mismo.
const APROXIMA = new Set(["como", "unos", "unas", "aproximadamente", "casi", "tipo", "cerca", "alrededor", "algo", "mas", "más", "menos", "ahi", "ahí", "por"]);
const FRASES_APROXIMA = [["mas", "o", "menos"], ["por", "ahi"], ["cerca", "de"], ["alrededor", "de"], ["algo", "asi", "como"]];
const DINERO = new Set(["balboa", "balboas", "dolar", "dolares", "b", "usd", "mensual", "mensuales", "mensualmente", "mes", "sueldo", "salario", "ingreso", "ingresos", "gana", "ganaba", "gano", "cobra", "percibe"]);

// `plano` convierte la coma en espacio, así que «1,200» se partiría en dos palabras.
// El separador de miles se quita antes, no después.
const sinMiles = (t) => String(t ?? "").replace(/(\d),(\d{3})(?!\d)/g, "$1$2");

/**
 * El ingreso mensual que aparece en la frase, y si venía con calificativo.
 * Un número suelto sin ancla de dinero no cuenta: «vive en la casa 800» no es un sueldo.
 */
export function montoEn(texto) {
  const tok = plano(sinMiles(texto)).split(" ").filter(Boolean);
  for (let i = 0; i < tok.length; i++) {
    if (!/^\d+$/.test(tok[i])) continue;
    const n = Number(tok[i]);
    if (!Number.isFinite(n) || n <= 0) continue;

    // Ancla: alguna palabra de dinero o de periodicidad cerca del número.
    let ancla = false;
    for (let j = Math.max(0, i - 3); j <= i + 3 && j < tok.length; j++) {
      if (j !== i && DINERO.has(tok[j])) { ancla = true; break; }
    }
    if (!ancla) continue;

    // Calificativo: en las tres palabras anteriores.
    const antes = tok.slice(Math.max(0, i - 3), i);
    let porque = null;
    for (const f of FRASES_APROXIMA) {
      for (let k = 0; k + f.length <= antes.length; k++) {
        if (f.every((w, d) => antes[k + d] === w)) { porque = f.join(" "); break; }
      }
      if (porque) break;
    }
    if (!porque) {
      const suelta = antes.find((w) => APROXIMA.has(w) && w !== "mas" && w !== "más" && w !== "menos" && w !== "por");
      if (suelta) porque = suelta;
    }

    return { monto: n, estimado: !!porque, porque: porque ? `dijo «${porque}», no una cifra` : null };
  }
  return null;
}

// Lo que el modelo propuso pero la frase no respalda, se cae. Se compara palabra a
// palabra sobre el texto sin acentos: el modelo normaliza y no queremos castigar eso.
export function apareceEn(valor, texto) {
  const v = plano(valor).split(" ").filter((w) => w.length > 2);
  if (!v.length) return true;
  const dichas = plano(texto).split(" ").filter(Boolean);
  // Palabra entera, tolerando el plural por los dos lados ("préstamo" / "préstamos").
  return v.every((w) => dichas.some((d) => d === w || (d.length > 3 && w.length > 3 && (d.startsWith(w) || w.startsWith(d)))));
}

export const formatoMonto = (n) => `B/. ${n.toLocaleString("en-US")} / mes`;

/**
 * Junta las dos mitades: lo que propuso el modelo (ya filtrado) y lo que leyó el
 * código. Devuelve el expediente en la forma que consume la pantalla.
 */
export function expedienteDe(crudo, texto) {
  const descartes = [];
  const libre = {};
  for (const clave of ["nombre", "producto", "domicilio", "ocupacion"]) {
    const v = String(crudo?.[clave] ?? "").trim();
    if (!v) { libre[clave] = ""; continue; }
    if (!apareceEn(v, texto)) {
      descartes.push(`${clave}: el modelo dijo «${v}» y eso no está en la frase`);
      libre[clave] = "";
      continue;
    }
    libre[clave] = v;
  }

  const cedula = cedulaEn(texto);
  const telefono = telefonoEn(texto, cedula);
  const ingreso = montoEn(texto);

  return {
    expediente: {
      nombre:    { valor: libre.nombre },
      cedula:    { valor: cedula },
      producto:  { valor: libre.producto },
      ingreso:   ingreso
        ? { valor: formatoMonto(ingreso.monto), estimado: ingreso.estimado, porque: ingreso.porque }
        : { valor: "" },
      domicilio: { valor: libre.domicilio },
      telefono:  { valor: telefono },
      ocupacion: { valor: libre.ocupacion },
    },
    descartes,
  };
}

export async function extraerEntrevista(modelId, texto) {
  const t0 = Date.now();
  const run = completion({
    modelId,
    history: [{ role: "system", content: SISTEMA }, { role: "user", content: texto + " /no_think" }],
    responseFormat: { type: "json_schema", json_schema: { name: "entrevista", strict: true, schema: esquema } },
    temperature: 0, max_tokens: 300, captureThinking: false,
  });
  const crudo = JSON.parse(await run.text);
  return { crudo, ...expedienteDe(crudo, texto), ms: Date.now() - t0, stats: await run.stats };
}
