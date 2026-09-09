// Pruebas de la capa de codigo, con el texto EXACTO que devolvio VisionPsy el 9 sep.
// Sin modelo: corren en milisegundos. `node prueba-campos.mjs`
import { camposDeCedula, evaluarKyc, etiquetaDe, cedulaValida, aIso, nombreDudoso, consensuar, huellaDe, PREGUNTA } from "./documento.mjs";

let ok = 0, fallo = 0;
const igual = (nombre, a, b) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) { ok++; console.log(`  ok   ${nombre}`); }
  else { fallo++; console.log(`  FALLA ${nombre}\n        dio      ${x}\n        esperaba ${y}`); }
};
const HOY = new Date("2026-09-09T12:00:00-05:00");

console.log("etiquetaDe: tolera las erratas del modelo");
igual("CEDula", etiquetaDe("CEDula"), "cedula");
igual("LUIGAR DE NACIMIENTO", etiquetaDe("LUIGAR DE NACIMIENTO"), "lugar");
igual("LUARDE DE NACIMIENTO", etiquetaDe("LUARDE DE NACIMIENTO"), "lugar");
igual("un valor no es etiqueta", etiquetaDe("8-912-3456"), null);
igual("una frase larga tampoco", etiquetaDe("DOCUMENTO SINTETICO - GENERADO PARA PRUEBAS"), null);

console.log("\ncedulaValida: formatos panamenos");
igual("natural", cedulaValida("8-912-3456"), true);
igual("extranjero", cedulaValida("E-8-145097"), true);
igual("panameno nacido fuera", cedulaValida("PE-123-4567"), true);
igual("provincia de dos digitos", cedulaValida("10-701-2288"), true);
igual("un numero suelto no", cedulaValida("89123456"), false);

console.log("\naIso: la cedula trae DD-MM-AAAA");
igual("17-04-1988", aIso("17-04-1988"), "1988-04-17");
igual("8-10-2019", aIso("8-10-2019"), "2019-10-08");
igual("basura da vacio", aIso("O+"), "");

// ---- Texto REAL devuelto por VisionPsy el 9 sep 2026 ----

console.log("\nvigente-limpia: la lectura completa");
const limpia = camposDeCedula(`This card is a national ID card.
NOMBRE
MARIA ISABEL QUINTERO ARJONA

CEDula
8-912-3456

Fecha de Nacimiento
17-04-1988

LUGAR DE Nacimiento
PANAMA, PANAMA

SEXO
F   O+

EXPEDIDA
02-06-2021

EXPIRA
02-06-2031

DOCUMENTO SINTETICO - GENERADO PARA PRUEBAS - NO ES UNA CEDula REAL`);
igual("nombre y cedula", [limpia.nombre, limpia.cedula], ["MARIA ISABEL QUINTERO ARJONA", "8-912-3456"]);
igual("fechas", [limpia.nacimiento, limpia.expedida, limpia.expira], ["1988-04-17", "2021-06-02", "2031-06-02"]);
igual("sexo y sangre venian pegados", [limpia.sexo, limpia.sangre], ["F", "O+"]);
igual("vigente", evaluarKyc(limpia, HOY).estado, "vigente");
igual("y se puede seguir", evaluarKyc(limpia, HOY).puedeSeguir, true);

console.log("\nvencida: el banco no puede abrir la cuenta");
const vencida = camposDeCedula(`NOMBRE
RODRIGO ANTONIOBERNAL SAAVEDRA

CEDULA
3-701-2288

FECHA DE NACIMIENTO
30-11-1974

LUIGAR DE NACIMIENTO
COLON, COLON

SEXO
M

TIPO DE SANGRE
A-

EXPEDIDA
11-02-2015

EXPIRA
11-02-2025`);
igual("la etiqueta con errata no pierde el lugar", vencida.lugar, "COLON, COLON");
igual("estado vencida", evaluarKyc(vencida, HOY).estado, "vencida");
igual("no se puede seguir", evaluarKyc(vencida, HOY).puedeSeguir, false);
igual("el nombre pegado se avisa, no se arregla", nombreDudoso(vencida.nombre), true);
igual("y sigue diciendo lo que leyo", vencida.nombre, "RODRIGO ANTONIOBERNAL SAAVEDRA");

console.log("\nextranjero: dos fechas, una sola etiqueta");
const extranjero = camposDeCedula(`This is a national ID card.
NOMBRE
ANA LUCIA FERREIRA DOS SANTOS
CEDula
E-8-145097
FECHA DE NACIMIENTO
05-09-1993
LUGAR DE NACIMIENTO
SAO PAULO, BRASIL
SEXO
F
B+
EXPEDIDA
19-08-2022
19-08-2032`);
igual("expedida se asigna", extranjero.expedida, "2022-08-19");
igual("expira NO se adivina", extranjero.expira, "");
igual("pero la fecha no se pierde", extranjero.huerfanos, ["19-08-2032"]);
igual("no evaluable, no vencida", evaluarKyc(extranjero, HOY).estado, "no evaluable");
igual("y el tramite se detiene", evaluarKyc(extranjero, HOY).puedeSeguir, false);

console.log("\ngastada: la fecha de expiracion no aparece");
const gastada = camposDeCedula(`This is a national ID card.

NOMBRE
JOSE MIGUEL CASTILLERO PINZON
CEDula
4-155-8830
FECHA DE NACIMIENTO
23-01-1966
LUARDE DE NACIMIENTO
DAVID, CHIRIQUIUT
SEXO
M
TIPO DE SANGRE
EXPEDIDA
08-10-2019
DOUBENTO SINTETICO - GENERADO PARA PRUEBA BASADO - NO ES UNA CEDula REAL`);
igual("lo que si leyo, lo leyo bien", [gastada.nombre, gastada.cedula, gastada.nacimiento], ["JOSE MIGUEL CASTILLERO PINZON", "4-155-8830", "1966-01-23"]);
igual("expira vacia, no inventada", gastada.expira, "");
const k = evaluarKyc(gastada, HOY);
igual("no evaluable", k.estado, "no evaluable");
igual("y dice exactamente que falta", k.faltan, ["fecha de expiración"]);
igual("el tramite se detiene", k.puedeSeguir, false);
// "TIPO DE SANGRE" seguido de "EXPEDIDA" (otra etiqueta) no debe robarle el valor.
igual("una etiqueta no se come a la siguiente", gastada.expedida, "2019-10-08");


// ---------------------------------------------------------------- consenso de lecturas
//
// VisionPsy no es determinista ni a temperatura 0: la misma imagen puede dar dos lecturas
// distintas. La lectura A es la registrada en `rendimiento/cedulas.json` el 9 sep. La B
// esta CONSTRUIDA para la prueba, con la forma del fallo que si hemos visto de verdad (el
// apellido pegado). Cuantas veces discrepa en la practica solo lo dice correr el modelo
// dos veces sobre la misma maquina.

console.log("\nconsensuar: solo entra lo que las dos lecturas dicen igual");

const lecturaA = camposDeCedula(`NOMBRE
RODRIGO ANTONIO BERNAL SAAVEDRA
CEDULA
3-701-2288
FECHA DE NACIMIENTO
30-11-1974
EXPEDIDA
11-02-2015
EXPIRA
11-02-2025`);

const lecturaB = camposDeCedula(`NOMBRE
RODRIGO ANTONIOBERNAL SAAVEDRA
CEDULA
3-701-2288
FECHA DE NACIMIENTO
30-11-1974
EXPEDIDA
11-02-2015
EXPIRA
11-02-2025`);

const cons = consensuar([lecturaA, lecturaB]);
igual("lo que coincide se queda", [cons.campos.cedula, cons.campos.expira], ["3-701-2288", "2025-02-11"]);
igual("el nombre que no coincide se cae", cons.campos.nombre, "");
igual("y se dice cual fue", cons.discrepancias.map((d) => d.campo), ["nombre"]);
igual("con las dos lecturas a la vista", cons.discrepancias[0].lecturas.length, 2);

const iguales = consensuar([lecturaA, lecturaA]);
igual("dos lecturas iguales no pierden nada", iguales.campos.nombre, "RODRIGO ANTONIO BERNAL SAAVEDRA");
igual("y no hay discrepancias", iguales.discrepancias, []);
igual("una sola lectura pasa tal cual", consensuar([lecturaA]).campos.nombre, "RODRIGO ANTONIO BERNAL SAAVEDRA");

// Un campo que una lectura ve y la otra no tambien discrepa. Es el modo de fallo que mas
// duele: un campo que aparece a medias parece un campo leido.
const sinExpira = { ...lecturaA, expira: "" };
const parcial = consensuar([lecturaA, sinExpira]);
igual("visto una sola vez no es visto", parcial.campos.expira, "");
igual("y queda registrado", parcial.discrepancias.map((d) => d.campo), ["expira"]);

// Una fecha huerfana que solo sale en una lectura puede no existir. No se le pregunta al
// operador por un dato que quiza invento el modelo.
const huerfanoA = { ...lecturaA, huerfanos: ["19-08-2032"] };
const huerfanoB = { ...lecturaA, huerfanos: [] };
igual("un huerfano de una sola lectura no entra", consensuar([huerfanoA, huerfanoB]).campos.huerfanos, []);
igual("uno que sale en las dos, si", consensuar([huerfanoA, huerfanoA]).campos.huerfanos, ["19-08-2032"]);

// El consenso no es cosmetico: si el campo que se cae es obligatorio, para el tramite.
const kCons = evaluarKyc(parcial.campos, HOY);
igual("sin expira confirmada, no evaluable", kCons.estado, "no evaluable");
igual("y el tramite se detiene", kCons.puedeSeguir, false);

console.log("\nhuellaDe: que modelo produjo este dato");
const imagen = Buffer.from("una imagen cualquiera");
const h1 = huellaDe({ modelo: "VisionPsy-Nano-460M", cuantizacion: "q4_k_m", prompt: PREGUNTA, imagen, pasadas: 2, hoy: HOY });
const h2 = huellaDe({ modelo: "VisionPsy-Nano-460M", cuantizacion: "q4_k_m", prompt: PREGUNTA, imagen, pasadas: 2, hoy: HOY });
igual("misma entrada, misma huella", h1, h2);
igual("el digest no revela la entrada", h1.imagen.length, 16);
igual("guarda cuantas pasadas hubo", h1.pasadas, 2);
const h3 = huellaDe({ modelo: "VisionPsy-Nano-460M", cuantizacion: "q4_k_m", prompt: PREGUNTA + " ", imagen, pasadas: 2, hoy: HOY });
igual("cambiar el prompt cambia la huella", h1.prompt === h3.prompt, false);
const h4 = huellaDe({ modelo: "VisionPsy-Nano-460M", cuantizacion: "q4_k_m", prompt: PREGUNTA, imagen: Buffer.from("otra"), pasadas: 2, hoy: HOY });
igual("cambiar la imagen tambien", h1.imagen === h4.imagen, false);
igual("sin imagen, nulo y no vacio", huellaDe({ prompt: PREGUNTA, pasadas: 1, hoy: HOY }).imagen, null);

console.log(`\n${ok} ok, ${fallo} fallan`);
process.exit(fallo ? 1 : 0);
