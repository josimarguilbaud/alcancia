// Pruebas de la capa de codigo de la entrevista y del cotejo. Sin modelo: corren en
// milisegundos. `node prueba-entrevista.mjs`
//
// Lo que se prueba aqui es exactamente lo que el modelo NO decide: la cedula, el
// telefono, el monto y el matiz de «como». Si esto pasa, da igual que el modelo tenga
// un mal dia con el texto libre: el expediente no se llena de numeros inventados.
import { cedulaEn, telefonoEn, montoEn, apareceEn, pareceFecha, expedienteDe, formatoMonto, pasaporteEn, documentoEn } from "./entrevista.mjs";
import { cotejar, cotejarExpediente, conflictosDe } from "./cotejar.mjs";

let ok = 0, fallo = 0;
const igual = (nombre, a, b) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) { ok++; console.log(`  ok   ${nombre}`); }
  else { fallo++; console.log(`  FALLA ${nombre}\n        dio      ${x}\n        esperaba ${y}`); }
};

console.log("cedulaEn: la saca de la frase, no del modelo");
igual("natural", cedulaEn("Juana Perez, cedula 8-123-456, quiere abrir cuenta"), "8-123-456");
igual("con acento", cedulaEn("cédula 8-912-3456"), "8-912-3456");
igual("extranjero", cedulaEn("el senor tiene cedula E-8-145097"), "E-8-145097");
igual("panameno nacido fuera", cedulaEn("cedula PE-123-4567"), "PE-123-4567");
igual("provincia de dos digitos", cedulaEn("cedula 10-701-2288"), "10-701-2288");
igual("si no hay, vacio", cedulaEn("quiere abrir una cuenta de ahorros"), "");

console.log("\ncedulaEn: una fecha tiene la misma forma y no debe colarse");
igual("fecha suelta no es cedula", cedulaEn("nacio el 23-01-1966 y vive en David"), "");
igual("la palabra cedula manda", cedulaEn("nacio el 23-01-1966, cedula 4-155-8830"), "4-155-8830");
igual("pareceFecha", [pareceFecha("23-01-1966"), pareceFecha("8-912-3456")], [true, false]);

console.log("\ntelefonoEn: movil y fijo panamenos");
igual("movil", telefonoEn("el telefono es 6123-4567"), "6123-4567");
igual("fijo", telefonoEn("llamar al 302-1122"), "302-1122");
igual("no confunde con la cedula", telefonoEn("cedula 8-912-3456", "8-912-3456"), "");
igual("si no hay, vacio", telefonoEn("vive en Betania"), "");

console.log("\nmontoEn: el numero y, sobre todo, si fue afirmado o estimado");
igual("cifra exacta", montoEn("gana 1,200 balboas al mes"), { monto: 1200, estimado: false, porque: null });
igual("separador de miles", montoEn("gana 1,200 al mes").monto, 1200);
igual("«como» lo vuelve estimado", montoEn("ingreso como 800 al mes"),
  { monto: 800, estimado: true, porque: "dijo «como», no una cifra" });
igual("«mas o menos» tambien", montoEn("gana mas o menos 900 al mes").estimado, true);
igual("«unos» tambien", montoEn("unos 1500 mensuales").estimado, true);
igual("«por ahi» tambien", montoEn("gana por ahi 700 al mes").estimado, true);
igual("un numero sin ancla de dinero no es sueldo", montoEn("vive en la casa 800 de Betania"), null);
igual("sin numero, nada", montoEn("no quiso decir cuanto gana"), null);
igual("formato", formatoMonto(1200), "B/. 1,200 / mes");

console.log("\napareceEn: lo que el modelo no puede respaldar, se cae");
igual("lo dicho aparece", apareceEn("cuenta de ahorros", "quiere abrir una cuenta de ahorros"), true);
igual("tolera el plural", apareceEn("prestamo personal", "quiere un prestamo personal"), true);
igual("con acentos da igual", apareceEn("Maria Perez", "habla Maria Pérez"), true);
igual("lo inventado no", apareceEn("cuenta corriente", "quiere abrir una cuenta de ahorros"), false);
igual("vacio pasa", apareceEn("", "lo que sea"), true);

console.log("\nexpedienteDe: junta las dos mitades");
const frase = "Rodrigo Bernal, cedula 3-701-2288, quiere un prestamo personal. Gana como 900 al mes y vive en Colon.";
const e = expedienteDe({ nombre: "Rodrigo Bernal", producto: "prestamo personal", domicilio: "Colon", ocupacion: "" }, frase);
igual("la cedula la puso el codigo", e.expediente.cedula.valor, "3-701-2288");
igual("el ingreso quedo estimado", [e.expediente.ingreso.valor, e.expediente.ingreso.estimado], ["B/. 900 / mes", true]);
igual("lo que no se dijo, queda vacio", [e.expediente.telefono.valor, e.expediente.ocupacion.valor], ["", ""]);
igual("sin descartes", e.descartes, []);

const inventado = expedienteDe({ nombre: "Rodrigo Bernal", producto: "cuenta corriente", domicilio: "Colon", ocupacion: "ingeniero" }, frase);
igual("el producto inventado se descarta", inventado.expediente.producto.valor, "");
igual("la ocupacion inventada tambien", inventado.expediente.ocupacion.valor, "");
igual("y se dice por que", inventado.descartes.length, 2);

// ---- El cotejo ----

console.log("\ncotejar: tres resultados, cada uno significa algo distinto");
igual("coincide", cotejar("Maria Isabel Quintero Arjona", "MARIA ISABEL QUINTERO ARJONA").resultado, "coincide");
igual("acentos no son discrepancia", cotejar("Jose Perez", "José Pérez").resultado, "coincide");
igual("contenido: dijo menos apellidos", cotejar("Jose Castillero", "Jose Miguel Castillero Pinzon").resultado, "contenido");
igual("discrepa: el apellido pegado", cotejar("Rodrigo Bernal", "Rodrigo ANTONIOBERNAL Saavedra"),
  { resultado: "discrepa", sobran: ["bernal"] });
igual("cedula distinta discrepa", cotejar("8-912-3455", "8-912-3456").resultado, "discrepa");
igual("sin documento no hay cotejo", cotejar("Jose Perez", "").resultado, "sin-cotejo");
igual("sin voz tampoco", cotejar("", "JOSE PEREZ").resultado, "sin-cotejo");

console.log("\ncotejarExpediente: que valor gana y que estado queda");
const voz = { nombre: { valor: "Jose Castillero" }, cedula: { valor: "4-155-8830" } };
const campos = { nombre: "Jose Miguel Castillero Pinzon", cedula: "4-155-8830" };
const filas = cotejarExpediente(voz, campos);
igual("el nombre incompleto no es conflicto", filas[0].estado, "confirmado");
igual("y gana el del documento", filas[0].valor, "Jose Miguel Castillero Pinzon");
igual("la cedula coincide", filas[1].estado, "confirmado");
igual("no hay conflictos", conflictosDe(filas).length, 0);

const vozMala = { nombre: { valor: "Rodrigo Bernal" }, cedula: { valor: "3-701-2288" } };
const camposMalos = { nombre: "Rodrigo ANTONIOBERNAL Saavedra", cedula: "3-701-2288" };
const filasMalas = cotejarExpediente(vozMala, camposMalos);
igual("el apellido que no cuadra es conflicto", filasMalas[0].estado, "conflicto");
igual("y no gana nadie: se queda lo dicho hasta que decida una persona", filasMalas[0].valor, "Rodrigo Bernal");
igual("un conflicto", conflictosDe(filasMalas).length, 1);

const sinFoto = cotejarExpediente(vozMala, { nombre: "", cedula: "" });
igual("sin foto todavia, el dato es reportado", sinFoto.map((f) => f.estado), ["reportado", "reportado"]);


console.log("\npasaporteEn: el cliente que llega con pasaporte, no con cedula");
igual("detras de la palabra pasaporte", pasaporteEn("Ana Lucia Ferreira, pasaporte X1234567, quiere abrir cuenta"), "X1234567");
igual("con la palabra en ingles", pasaporteEn("passport B7742019"), "B7742019");
igual("solo letras no vale: hace falta un digito", pasaporteEn("pasaporte ABCDEFG"), "");
igual("suelto por ahi NO se captura", pasaporteEn("vive en BETANIA1 desde 2019"), "");
igual("si no lo dice, vacio", pasaporteEn("quiere abrir una cuenta"), "");

console.log("\ndocumentoEn: la cedula manda, el pasaporte es el respaldo");
igual("cedula si la hay", documentoEn("cedula 8-912-3456, pasaporte X1234567"), "8-912-3456");
igual("pasaporte si no hay cedula", documentoEn("pasaporte X1234567"), "X1234567");
igual("ninguno", documentoEn("no trajo documento"), "");

const conPasaporte = expedienteDe(
  { nombre: "Ana Lucia Ferreira", producto: "cuenta de ahorros", domicilio: "", ocupacion: "" },
  "Ana Lucia Ferreira, pasaporte X1234567, quiere abrir una cuenta de ahorros."
);
igual("el expediente lo recoge", conPasaporte.expediente.cedula.valor, "X1234567");

console.log(`\n${ok} ok, ${fallo} fallan`);
process.exit(fallo ? 1 : 0);
