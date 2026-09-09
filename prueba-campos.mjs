// Pruebas de la capa de codigo, con el texto EXACTO que devolvio VisionPsy el 9 sep.
// Sin modelo: corren en milisegundos. `node prueba-campos.mjs`
import { camposDeCedula, evaluarKyc, etiquetaDe, cedulaValida, aIso, nombreDudoso } from "./documento.mjs";

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

console.log(`\n${ok} ok, ${fallo} fallan`);
process.exit(fallo ? 1 : 0);
