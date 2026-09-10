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
 * Encuentra las dos líneas del MRZ dentro de lo que devolvió el modelo.
 * La segunda línea es la que manda: es la que trae las fechas y los dígitos de control.
 */
export function lineasDeMrz(texto) {
  const candidatas = String(texto ?? "")
    .split("\n")
    .map(normalizarLinea)
    .filter((l) => l.length >= 30 && /^[A-Z0-9<]+$/.test(l));

  // La primera empieza por P; la segunda es la que le sigue con largo parecido.
  const i = candidatas.findIndex((l) => /^P[A-Z<]/.test(l));
  if (i < 0 || i + 1 >= candidatas.length) return null;

  const rellenar = (l) => (l.length >= LARGO ? l.slice(0, LARGO) : l.padEnd(LARGO, "<"));
  return { uno: rellenar(candidatas[i]), dos: rellenar(candidatas[i + 1]) };
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

  const fallos = [];
  const trozo = (linea, desde, hasta) => linea.slice(desde, hasta);

  const pais = trozo(l.uno, 2, 5).replace(/</g, "");
  const nombre = nombreDeMrz(trozo(l.uno, 5, LARGO));

  const numero = trozo(l.dos, 0, 9);
  const dNumero = trozo(l.dos, 9, 10);
  const nacionalidad = trozo(l.dos, 10, 13).replace(/</g, "");
  const nac = trozo(l.dos, 13, 19);
  const dNac = trozo(l.dos, 19, 20);
  const sexo = trozo(l.dos, 20, 21).replace(/</g, "");
  const exp = trozo(l.dos, 21, 27);
  const dExp = trozo(l.dos, 27, 28);
  const opcional = trozo(l.dos, 28, 42);
  const dOpcional = trozo(l.dos, 42, 43);
  const dTodo = trozo(l.dos, 43, 44);

  const numeroOk = cuadra(numero, dNumero);
  const nacOk = cuadra(nac, dNac);
  const expOk = cuadra(exp, dExp);
  // El compuesto abarca número+dígito, nacimiento+dígito, expiración+dígito y el opcional.
  const compuesto = numero + dNumero + nac + dNac + exp + dExp + opcional + dOpcional;
  const todoOk = cuadra(compuesto, dTodo);

  if (!numeroOk) fallos.push("el número de pasaporte no cuadra con su dígito de control");
  if (!nacOk) fallos.push("la fecha de nacimiento no cuadra con su dígito de control");
  if (!expOk) fallos.push("la fecha de expiración no cuadra con su dígito de control");
  if (!todoOk) fallos.push("el dígito de control del conjunto no cuadra: hay algo mal leído");

  return {
    tipo: "pasaporte",
    nombre,
    // Se llama `cedula` a propósito: el resto del sistema (evaluarKyc, cotejar, la
    // pantalla) trabaja con esa clave y no tiene que saber qué documento es.
    cedula: numeroOk ? numero.replace(/</g, "") : "",
    nacimiento: nacOk ? aFecha(nac, "nacimiento", hoy) : "",
    lugar: nacionalidad,
    sexo,
    sangre: "",
    expedida: "",
    expira: expOk ? aFecha(exp, "expiracion", hoy) : "",
    huerfanos: [],
    // Lo propio del pasaporte
    paisEmisor: pais,
    nacionalidad,
    mrz: [l.uno, l.dos],
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
