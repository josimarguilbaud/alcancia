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
import { createHash } from "node:crypto";
import { completion } from "@qvac/sdk";
import { camposDePasaporte } from "./pasaporte.mjs";

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
  // Las del pasaporte. Vienen en dos idiomas separados por una barra, y `etiquetaDe`
  // se queda con la mitad de la izquierda antes de comparar.
  { campo: "cedula", texto: "pasaporte no" },
  { campo: "nombre", texto: "apellidos" },
  { campo: "expira", texto: "fecha de expiracion" },
  { campo: "lugar", texto: "nacionalidad" },
];

export function etiquetaDe(linea) {
  // Un documento bilingüe rotula «FECHA DE NACIMIENTO / DATE OF BIRTH». Se compara con
  // la mitad de la izquierda: la de la derecha solo alarga la línea y estorba.
  const l = plano(String(linea ?? "").split("/")[0]);
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

// La cédula imprime 17-04-1988; el pasaporte, 05 09 1993. Las dos son la misma fecha.
const FECHA = /^(\d{1,2})[-/\s](\d{1,2})[-/\s](\d{4})$/;
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
 * Qué documento es. No se le pregunta al modelo ni al operador: se mira lo leído.
 * Si trae un MRZ válido en su forma, es un pasaporte; si no, se sigue tratando como
 * cédula, exactamente igual que hasta ahora. El camino de la cédula no cambia.
 */
export function camposDeDocumento(texto, hoy = new Date()) {
  const pasaporte = camposDePasaporte(texto, hoy);
  if (pasaporte) return pasaporte;
  return { tipo: "cedula", ...camposDeCedula(texto) };
}

// De vuelta a como se lee una fecha en Panamá. El motor trabaja en ISO porque ordenar
// y restar es más seguro así, pero al operador nunca se le enseña 2025-02-11.
export const deIso = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso ?? "");
};

/**
 * La regla del banco. No decide por el operador cuando no puede leer: distingue
 * "vencida" de "no pude leer la fecha", que para un trámite son cosas muy distintas.
 */
export function evaluarKyc(campos, hoy = new Date()) {
  const esPasaporte = campos.tipo === "pasaporte";
  const faltan = [];
  if (!campos.nombre) faltan.push("nombre");
  if (!campos.cedula) faltan.push(esPasaporte ? "número de pasaporte" : "número de cédula");
  if (!campos.nacimiento) faltan.push("fecha de nacimiento");
  if (!campos.expira) faltan.push("fecha de expiración");

  const avisos = [];
  // El formato panameño solo aplica a la cédula. Un pasaporte extranjero no tiene por
  // qué parecerse, y lo que lo valida a él son sus dígitos de control.
  if (!esPasaporte && campos.cedula && !cedulaValida(campos.cedula)) avisos.push(`«${campos.cedula}» no tiene forma de cédula panameña`);
  // Lo que el MRZ delató: el modelo leyó algo cuya cuenta no cuadra.
  for (const f of campos.fallos ?? []) avisos.push(f);
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
    return { estado: "vencida", puedeSeguir: false, motivo: `La cédula venció hace ${Math.abs(dias)} días (${deIso(campos.expira)}).`, faltan, avisos };
  }
  if (dias < 90) {
    return { estado: "por vencer", puedeSeguir: true, motivo: `Vigente, pero vence en ${dias} días (${deIso(campos.expira)}).`, faltan, avisos };
  }
  return { estado: "vigente", puedeSeguir: true, motivo: `Vigente hasta ${deIso(campos.expira)}.`, faltan, avisos };
}

/**
 * Consenso de dos lecturas.
 *
 * Midiendo salió algo que no esperábamos: **VisionPsy no es determinista ni a temperatura
 * 0**. La misma cédula, el mismo modelo y el mismo prompt pueden dar dos lecturas
 * distintas. En otro producto eso sería una nota al pie; en un banco es el problema
 * entero, porque significa que un campo puede salir bien una vez y mal la siguiente sin
 * que nadie se entere.
 *
 * Así que se lee dos veces y **solo entra lo que las dos lecturas dicen igual**. Un campo
 * que no se confirma a sí mismo se trata como uno que no se pudo leer: se marca, y si es
 * obligatorio detiene el trámite. Cuesta el doble de tiempo. Treinta segundos de más para
 * no abrir una cuenta con un dato que el modelo no sostiene dos veces seguidas es un
 * intercambio que cualquier banco firma.
 */
const CAMPOS = ["nombre", "cedula", "nacimiento", "lugar", "sexo", "sangre", "expedida", "expira"];

export function consensuar(lecturas) {
  if (lecturas.length < 2) return { campos: { ...(lecturas[0] ?? {}) }, discrepancias: [] };

  const campos = {};
  const discrepancias = [];

  for (const clave of CAMPOS) {
    const vistos = lecturas.map((l) => l?.[clave] ?? "");
    if (vistos.every((v) => plano(v) === plano(vistos[0]))) { campos[clave] = vistos[0]; continue; }
    // No se queda con ninguna: si el modelo no lo sostiene dos veces, no lo sabemos.
    campos[clave] = "";
    discrepancias.push({ campo: clave, lecturas: vistos.map((v) => v || "(vacío)") });
  }

  // Una fecha huérfana que solo aparece en una lectura puede no existir. Preguntarle al
  // operador por un dato que quizá inventó el modelo es peor que no preguntarle nada.
  campos.huerfanos = (lecturas[0]?.huerfanos ?? []).filter((h) =>
    lecturas.slice(1).every((l) => (l?.huerfanos ?? []).some((x) => plano(x) === plano(h))));

  // Lo que no es un campo comparable viaja con la primera lectura: qué documento es, qué
  // dijeron los dígitos de control y qué país lo emitió.
  campos.tipo = lecturas[0]?.tipo ?? "cedula";
  if (lecturas[0]?.tipo === "pasaporte") {
    campos.paisEmisor = lecturas[0].paisEmisor;
    campos.nacionalidad = lecturas[0].nacionalidad;
    campos.control = lecturas[0].control;
    campos.mrz = lecturas[0].mrz;
  }
  // Un fallo de control en cualquiera de las lecturas cuenta: si una de las dos no cuadró,
  // no se acepta como si nada hubiera pasado.
  campos.fallos = [...new Set(lecturas.flatMap((l) => l?.fallos ?? []))];

  return { campos, discrepancias };
}

/**
 * La huella deja por escrito qué produjo esta lectura: qué modelo, con qué cuantización,
 * con qué prompt y sobre qué imagen. En banca eso tiene nombre, gobernanza de modelos, y
 * responde la pregunta que hace un auditor un año después: ¿quién decidió que este
 * documento estaba vigente? Los digest son de la entrada, no de la persona: no
 * identifican a nadie y no permiten reconstruir la imagen.
 */
export function huellaDe({ modelo, cuantizacion, prompt, imagen, pasadas, hoy = new Date() }) {
  const digest = (x) => createHash("sha256").update(x).digest("hex").slice(0, 16);
  return {
    modelo, cuantizacion, pasadas,
    prompt: digest(String(prompt)),
    imagen: imagen ? digest(imagen) : null,
    leido: hoy.toISOString(),
  };
}

// Medido el 10 sep: con el prompt general, VisionPsy transcribe los campos impresos del
// pasaporte y **se salta el MRZ**. Pidiéndoselo expresamente sí lo devuelve. Por eso el
// pasaporte lleva una pasada más, y solo el pasaporte: la cédula no la necesita y no se
// le cambia nada.
export const PREGUNTA_MRZ =
  "Transcribe the very last line at the bottom of this image. It is a single line of " +
  "monospaced characters containing capital letters, digits and < symbols. Copy it " +
  "exactly, character by character. Output nothing else.";

async function unaLectura(modelId, rutaImagen, prompt = PREGUNTA) {
  const run = completion({
    modelId,
    history: [{ role: "user", content: prompt, attachments: [{ path: rutaImagen }] }],
    temperature: 0, max_tokens: 300, captureThinking: false,
  });
  const texto = (await run.text).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return { texto, campos: camposDeDocumento(texto), stats: await run.stats };
}

const PARECE_PASAPORTE = /\b(pasaporte|passport)\b/i;

/**
 * Cuando lo leído es un pasaporte, el MRZ es la autoridad: es lo único de todo el
 * documento que puede demostrar con aritmética que se leyó bien. Lo impreso pasa a ser
 * la segunda opinión, y si las dos no coinciden **se dice**, porque eso significa que el
 * modelo se equivocó en una de las dos y no sabemos en cuál sin mirar.
 */
export function mandaElMrz(impresas, mrz) {
  const buenas = (impresas ?? []).filter(Boolean);
  if (!mrz) return { campos: buenas[0] ?? null, avisos: [] };

  const avisos = [];
  const comparar = [
    ["cedula", "el número de documento"],
    ["nacimiento", "la fecha de nacimiento"],
    ["expira", "la fecha de expiración"],
  ];
  // Se compara contra CADA lectura impresa, no contra el consenso: si una de ellas
  // discrepa del MRZ, eso es justo lo que hay que contar.
  for (const [clave, como] of comparar) {
    const b = mrz[clave];
    if (!b) continue;
    const distintas = [...new Set(buenas.map((i) => i?.[clave]).filter((a) => a && plano(a) !== plano(b)))];
    for (const a of distintas) {
      avisos.push(`${como} salió distinta en lo impreso (${deIso(a)}) y en el MRZ (${deIso(b)}): manda el MRZ, que trae su dígito de control`);
    }
  }

  // El MRZ que devuelve el modelo suele ser solo la segunda línea, que no lleva el
  // nombre. Se toma el impreso, descartando el que venga con palabras pegadas: eso es
  // basura de transcripción, no un nombre.
  const nombres = buenas.map((i) => i?.nombre).filter(Boolean);
  const nombreImpreso = nombres.find((n) => !nombreDudoso(n)) ?? "";

  return { campos: { ...mrz, nombre: mrz.nombre || nombreImpreso }, avisos };
}

export async function leerCedula(modelId, rutaImagen, opciones = {}) {
  const pasadas = Math.max(1, opciones.pasadas ?? 2);
  const t0 = Date.now();

  const lecturas = [];
  for (let i = 0; i < pasadas; i++) lecturas.push(await unaLectura(modelId, rutaImagen));

  let { campos, discrepancias } = consensuar(lecturas.map((l) => l.campos));
  const avisosDelMrz = [];

  // Si lo leído habla de un pasaporte, una pasada más para pedirle el MRZ.
  if (lecturas.some((l) => PARECE_PASAPORTE.test(l.texto))) {
    const zona = await unaLectura(modelId, rutaImagen, PREGUNTA_MRZ);
    lecturas.push(zona);
    const mrz = zona.campos?.tipo === "pasaporte" ? zona.campos : null;
    const r = mandaElMrz(lecturas.slice(0, pasadas).map((l) => l.campos), mrz);
    avisosDelMrz.push(...r.avisos);

    if (mrz) {
      // El MRZ **sustituye** al consenso de las dos lecturas. Un dígito de control
      // prueba más que dos lecturas que coinciden: coincidir dos veces en el mismo
      // error sigue siendo un error, y la aritmética no.
      campos = r.campos;
      discrepancias = [];
    } else {
      avisosDelMrz.push("no se pudo leer la zona MRZ del pasaporte: sin ella no hay dígitos de control que comprueben la lectura");
    }
  }

  const kyc = evaluarKyc(campos);
  kyc.avisos.push(...avisosDelMrz);

  // Una discrepancia consigo mismo no es un detalle técnico: es el motivo por el que ese
  // campo no está, y el operador tiene que leerlo con las mismas palabras que lo demás.
  for (const d of discrepancias) {
    kyc.avisos.push(`«${d.campo}» salió distinto en las dos lecturas (${d.lecturas.join(" / ")}): no se acepta ninguna`);
  }

  return {
    campos, kyc, discrepancias,
    textoLeido: lecturas.map((l) => l.texto).join("\n\n─── otra lectura de la misma imagen ───\n\n"),
    lecturas: lecturas.map((l) => l.texto),
    huella: huellaDe({
      modelo: opciones.modelo ?? "VisionPsy-Nano-460M",
      cuantizacion: opciones.cuantizacion ?? "q4_k_m (+ mmproj q8_0)",
      prompt: PREGUNTA,
      imagen: opciones.imagen ?? null,
      pasadas,
    }),
    ms: Date.now() - t0,
    stats: lecturas.map((l) => l.stats),
  };
}
