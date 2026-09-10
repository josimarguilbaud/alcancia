// Lectura del pasaporte por su MRZ, la zona de dos líneas del pie de la página de datos.
//
// Esto es lo más cerca que se puede estar de demostrar que una lectura es correcta.
// El MRZ está definido en ICAO 9303 y **lleva dígitos de control**: el número de
// documento, la fecha de nacimiento, la de expiración y el conjunto entero van cada uno
// con su cifra verificadora. Si el modelo lee mal un carácter, la cuenta no cuadra y el
// código lo sabe. No lo sospecha: lo sabe.
//
// Por eso el pasaporte es el mejor documento para este producto. En la cédula podemos
// decir «no pude leerlo». Aquí podemos decir «lo leí, hice la cuenta, y no cuadra», que
// para un banco es una afirmación mucho más fuerte.
//
// Y cambia el alcance: en Panamá quien llega a abrir su primera cuenta con pasaporte
// suele ser justamente la persona no bancarizada de la que habla la marca.

// ---------------------------------------------------------------- el MRZ

// TD3: dos líneas de 44 caracteres. El relleno es «<». Los modelos de visión confunden
// con frecuencia el «<» con «K» o «(», y el «0» con «O»: eso se corrige antes de contar,
// porque son erratas de forma, no lecturas distintas.
const LARGO = 44;

export function normalizarLinea(linea) {
  return String(linea ?? "")
    .toUpperCase()
    .replace(/[«»‹›〈〉<]/g, "<")
    .replace(/[KḰ]{2,}/g, (m) => "<".repeat(m.length))  // «KKKK» de relleno mal leído
    .replace(/[^A-Z0-9<]/g, "")
    .trim();
}

// Peso 7-3-1 cíclico. Dígitos valen su cifra, letras 10..35, el relleno vale 0.
const PESOS = [7, 3, 1];
export function digitoDeControl(cadena) {
  let suma = 0;
  const s = String(cadena ?? "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    let v;
    if (c >= "0" && c <= "9") v = c.charCodeAt(0) - 48;
    else if (c >= "A" && c <= "Z") v = c.charCodeAt(0) - 55;
    else if (c === "<") v = 0;
    else return null; // carácter que no pertenece a un MRZ
    suma += v * PESOS[i % 3];
  }
  return suma % 10;
}

export const cuadra = (cadena, digito) => {
  const d = digitoDeControl(cadena);
  return d !== null && String(d) === String(digito);
};

/**
 * Dos cifras de año a año completo.
 * El nacimiento siempre está en el pasado. La expiración de un pasaporte vivo está en
 * una ventana corta, así que se resuelve contra el año actual en vez de con un corte fijo.
 */
export function anioCompleto(yy, clase, hoy = new Date()) {
  const n = Number(yy);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  const actual = hoy.getFullYear();
  if (clase === "nacimiento") {
    const candidato = 2000 + n;
    return candidato > actual ? 1900 + n : candidato;
  }
  // Expiración: se acepta hasta 15 años atrás (pasaporte vencido) y lo que venga delante.
  const candidato = 2000 + n;
  return candidato >= actual - 15 ? candidato : 1900 + n;
}

const aFecha = (yymmdd, clase, hoy) => {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(String(yymmdd ?? ""));
  if (!m) return "";
  const anio = anioCompleto(m[1], clase, hoy);
  const mes = Number(m[2]), dia = Number(m[3]);
  if (!anio || mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";
  return `${anio}-${m[2]}-${m[3]}`;
};

// El nombre viene «APELLIDOS<<NOMBRES», con «<» por cada espacio.
export function nombreDeMrz(campo) {
  const [apellidos = "", nombres = ""] = String(campo ?? "").split("<<");
  const limpiar = (x) => x.replace(/</g, " ").replace(/\s+/g, " ").trim();
  return [limpiar(nombres), limpiar(apellidos)].filter(Boolean).join(" ");
}

/**
 * Lee la segunda línea del MRZ **por estructura, no por posición**.
 *
 * Medido el 10 sep: VisionPsy devuelve la línea comprimida. Con el pasaporte limpio dio
 *
 *     X1234567<7UTOPIA9309050F3208195<02
 *
 * cuando la línea real es
 *
 *     X1234567<7UTO9309050F3208195<<<<<<<<<<<<<<02
 *
 * Se comió el relleno y escribió el país entero. Pero **todos los datos y todos los
 * dígitos de control están bien**. Cortar por posición fija los perdía; leerlos por su
 * forma los recupera, y la comprobación aritmética sigue siendo exactamente la misma.
 *
 * El ancla es el bloque central, que tiene forma inconfundible:
 * seis dígitos de nacimiento, su control, el sexo, seis de expiración y su control.
 */
const CENTRO = /(\d{6})(\d)([MFX<])(\d{6})(\d)/;

export function partesDeLinea(linea) {
  const l = normalizarLinea(linea);
  const m = CENTRO.exec(l);
  if (!m) return null;

  const antes = l.slice(0, m.index);
  const despues = l.slice(m.index + m[0].length);

  // Antes del ancla: número de documento, su dígito, y la nacionalidad. El dígito es
  // siempre una cifra, así que la nacionalidad es la tira de letras que va al final.
  const a = /^(.*\d)([A-Z]+)$/.exec(antes);
  if (!a) return null;
  const numeroYDigito = a[1];
  const nacionalidad = a[2].slice(0, 3);

  const digitoNumero = numeroYDigito.slice(-1);
  // El dígito se calcula sobre el campo de 9 posiciones, relleno incluido.
  const numero = numeroYDigito.slice(0, -1).replace(/<+$/, "").padEnd(9, "<");

  // Después del ancla: el campo opcional, su dígito y el del conjunto. Los dos últimos
  // caracteres son siempre esos dos dígitos.
  const digitoTodo = despues.slice(-1);
  const digitoOpcional = despues.slice(-2, -1);
  const opcional = despues.slice(0, -2).replace(/<+$/, "").padEnd(14, "<");

  return {
    numero, digitoNumero, nacionalidad,
    nacimiento: m[1], digitoNacimiento: m[2],
    sexo: m[3] === "<" ? "" : m[3],
    expiracion: m[4], digitoExpiracion: m[5],
    opcional, digitoOpcional, digitoTodo,
  };
}

/**
 * Encuentra las dos líneas del MRZ dentro de lo que devolvió el modelo.
 * La segunda es la que manda: es la que trae las fechas y los dígitos de control. La
 * primera, la del nombre, es opcional: si el modelo solo devolvió una, se sigue igual.
 */
export function lineasDeMrz(texto) {
  const candidatas = String(texto ?? "")
    .split("\n")
    .map(normalizarLinea)
    .filter((l) => l.length >= 20 && /^[A-Z0-9<]+$/.test(l));

  const dos = candidatas.find((l) => partesDeLinea(l) !== null);
  if (!dos) return null;

  // La del nombre es la que empieza por P y no es la segunda.
  const uno = candidatas.find((l) => l !== dos && /^P[A-Z<]/.test(l)) ?? "";
  return { uno, dos };
}

export const pareceMrz = (texto) => lineasDeMrz(texto) !== null;

/**
 * Lee el MRZ y **comprueba cada dígito de control**. Un campo cuya cuenta no cuadra no
 * entra al expediente: se devuelve vacío, con el motivo escrito. Preferimos decir «la
 * cuenta no da» antes que dar por bueno un número de pasaporte con una letra cambiada.
 */
export function camposDePasaporte(texto, hoy = new Date()) {
  const l = lineasDeMrz(texto);
  if (!l) return null;
  const p = partesDeLinea(l.dos);
  if (!p) return null;

  const fallos = [];
  const numeroOk = cuadra(p.numero, p.digitoNumero);
  const nacOk = cuadra(p.nacimiento, p.digitoNacimiento);
  const expOk = cuadra(p.expiracion, p.digitoExpiracion);
  const compuesto = p.numero + p.digitoNumero + p.nacimiento + p.digitoNacimiento
                  + p.expiracion + p.digitoExpiracion + p.opcional + p.digitoOpcional;
  const todoOk = cuadra(compuesto, p.digitoTodo);

  if (!numeroOk) fallos.push("el número de pasaporte no cuadra con su dígito de control");
  if (!nacOk) fallos.push("la fecha de nacimiento no cuadra con su dígito de control");
  if (!expOk) fallos.push("la fecha de expiración no cuadra con su dígito de control");
  if (!todoOk) fallos.push("el dígito de control del conjunto no cuadra: hay algo mal leído");

  // El país emisor sale de la primera línea si la hay; si no, de la nacionalidad.
  const pais = /^P[A-Z<]([A-Z]{3})/.exec(l.uno)?.[1] ?? p.nacionalidad;
  const nombre = l.uno ? nombreDeMrz(l.uno.slice(5)) : "";

  return {
    tipo: "pasaporte",
    nombre,
    // Se llama `cedula` a propósito: el resto del sistema (evaluarKyc, cotejar, la
    // pantalla) trabaja con esa clave y no tiene que saber qué documento es.
    cedula: numeroOk ? p.numero.replace(/</g, "") : "",
    nacimiento: nacOk ? aFecha(p.nacimiento, "nacimiento", hoy) : "",
    lugar: p.nacionalidad,
    sexo: p.sexo,
    sangre: "",
    expedida: "",
    expira: expOk ? aFecha(p.expiracion, "expiracion", hoy) : "",
    huerfanos: [],
    paisEmisor: pais,
    nacionalidad: p.nacionalidad,
    mrz: [l.uno, l.dos].filter(Boolean),
    control: { numero: numeroOk, nacimiento: nacOk, expiracion: expOk, conjunto: todoOk },
    fallos,
  };
}

/**
 * Construye las dos líneas del MRZ a partir de los datos, con sus dígitos de control
 * bien calculados. Vive aquí y no en el generador porque es la operación inversa de
 * `camposDePasaporte`: teniéndolas juntas, la prueba de ida y vuelta comprueba las dos.
 */
export function mrzDe(p) {
  const relleno = (s, n) => String(s).toUpperCase().replace(/[^A-Z0-9<]/g, "<").padEnd(n, "<").slice(0, n);
  const yy = (iso) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

  const uno = relleno(`P<${p.pais}${p.apellidos}<<${String(p.nombres).replace(/ /g, "<")}`, LARGO);

  const numero = relleno(p.numero, 9);
  const nac = yy(p.nacimiento);
  const exp = yy(p.expira);
  const opcional = relleno(p.opcional ?? "", 14);

  const dNumero = digitoDeControl(numero);
  const dNac = digitoDeControl(nac);
  const dExp = digitoDeControl(exp);
  const dOpcional = digitoDeControl(opcional);
  const dTodo = digitoDeControl(`${numero}${dNumero}${nac}${dNac}${exp}${dExp}${opcional}${dOpcional}`);

  const dos = `${numero}${dNumero}${p.pais}${nac}${dNac}${p.sexo}${exp}${dExp}${opcional}${dOpcional}${dTodo}`;
  return [uno, dos];
}

// No hace falta un prompt distinto para el pasaporte. El que ya usamos pide «transcribe
// every line of text exactly as printed», y el MRZ son dos líneas de texto. Cambiarlo
// invalidaría la medición de las cédulas, que está hecha con ese prompt exacto.
