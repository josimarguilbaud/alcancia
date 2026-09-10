// Pruebas del MRZ. Sin modelo: corren en milisegundos. `node prueba-pasaporte.mjs`
//
// El banco de pruebas es el ejemplo canónico de ICAO 9303 (Anna Maria Eriksson, del
// propio estándar). Si nuestros dígitos de control no dan exactamente los suyos, el
// módulo está mal y no hay que discutirlo.
import {
  digitoDeControl, cuadra, anioCompleto, nombreDeMrz,
  lineasDeMrz, pareceMrz, camposDePasaporte, normalizarLinea, mrzDe,
} from "./pasaporte.mjs";
import { evaluarKyc } from "./documento.mjs";

let ok = 0, fallo = 0;
const igual = (nombre, a, b) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) { ok++; console.log(`  ok   ${nombre}`); }
  else { fallo++; console.log(`  FALLA ${nombre}\n        dio      ${x}\n        esperaba ${y}`); }
};
const HOY = new Date("2026-09-10T12:00:00-05:00");

// El specimen del estándar.
const UNO = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const DOS = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";

console.log("digitoDeControl: los del ejemplo de ICAO 9303");
igual("numero de documento L898902C3 -> 6", digitoDeControl("L898902C3"), 6);
igual("nacimiento 740812 -> 2", digitoDeControl("740812"), 2);
igual("expiracion 120415 -> 9", digitoDeControl("120415"), 9);
igual("opcional ZE184226B<<<<< -> 1", digitoDeControl("ZE184226B<<<<<"), 1);
igual("el relleno vale cero", digitoDeControl("<<<<"), 0);
igual("un caracter que no es de MRZ da nulo", digitoDeControl("ABC-123"), null);
igual("cuadra() compara como texto", [cuadra("740812", "2"), cuadra("740812", "3")], [true, false]);

console.log("\nel compuesto abarca todo lo anterior");
const compuesto = "L898902C36" + "7408122" + "1204159" + "ZE184226B<<<<<1";
igual("compuesto -> 0", digitoDeControl(compuesto), 0);

console.log("\nnombreDeMrz: apellidos<<nombres");
igual("Anna Maria Eriksson", nombreDeMrz("ERIKSSON<<ANNA<MARIA<<<<<<<<<<<<"), "ANNA MARIA ERIKSSON");
igual("un solo apellido", nombreDeMrz("PEREZ<<JUAN<<<<<"), "JUAN PEREZ");
igual("sin nombres, solo apellido", nombreDeMrz("PEREZ<<<<<"), "PEREZ");

console.log("\nanioCompleto: el nacimiento esta en el pasado");
igual("74 -> 1974", anioCompleto("74", "nacimiento", HOY), 1974);
igual("05 -> 2005", anioCompleto("05", "nacimiento", HOY), 2005);
igual("30 no puede ser 2030 para un nacimiento", anioCompleto("30", "nacimiento", HOY), 1930);
igual("expiracion 31 -> 2031", anioCompleto("31", "expiracion", HOY), 2031);
igual("expiracion 12 -> 2012 (vencido, pero valido)", anioCompleto("12", "expiracion", HOY), 2012);

console.log("\nlineasDeMrz: encontrarlas dentro de lo que devolvio el modelo");
const CRUDO = `PASSPORT
Type P  Code UTO  Passport No L898902C3
Surname ERIKSSON
Given names ANNA MARIA
${UNO}
${DOS}`;
igual("las encuentra entre el resto del texto", lineasDeMrz(CRUDO), { uno: UNO, dos: DOS });
igual("pareceMrz en un pasaporte", pareceMrz(CRUDO), true);
igual("pareceMrz en una cedula, no", pareceMrz("NOMBRE\nMARIA ISABEL QUINTERO ARJONA\nCEDULA\n8-912-3456"), false);

console.log("\nnormalizarLinea: erratas de forma del modelo de vision");
igual("las comillas angulares son relleno", normalizarLinea("P«UTOERIKSSON"), "P<UTOERIKSSON");
igual("quita lo que no pertenece al MRZ", normalizarLinea("L898902C3 6 UTO"), "L898902C36UTO");

console.log("\ncamposDePasaporte: lectura limpia");
const p = camposDePasaporte(CRUDO, HOY);
igual("nombre", p.nombre, "ANNA MARIA ERIKSSON");
igual("numero de pasaporte", p.cedula, "L898902C3");
igual("nacimiento", p.nacimiento, "1974-08-12");
igual("expiracion", p.expira, "2012-04-15");
igual("sexo", p.sexo, "F");
igual("pais emisor y nacionalidad", [p.paisEmisor, p.nacionalidad], ["UTO", "UTO"]);
igual("tipo", p.tipo, "pasaporte");
igual("los cuatro controles cuadran", p.control, { numero: true, nacimiento: true, expiracion: true, conjunto: true });
igual("sin fallos", p.fallos, []);

console.log("\ny el resto del sistema lo trata igual que una cedula");
const k = evaluarKyc(p, HOY);
igual("vencido en 2012", k.estado, "vencida");
igual("el tramite se detiene", k.puedeSeguir, false);

console.log("\ncamposDePasaporte: cuando el modelo lee mal, la cuenta lo delata");
// Una sola letra cambiada en el numero: L898902C3 -> L898902C8
const MALO = CRUDO.replace("L898902C36UTO", "L898902C86UTO");
const m = camposDePasaporte(MALO, HOY);
igual("el numero no entra al expediente", m.cedula, "");
igual("el control del numero falla", m.control.numero, false);
igual("y el del conjunto tambien", m.control.conjunto, false);
igual("se dice por que", m.fallos.length, 2);
igual("pero lo que si cuadra se conserva", [m.nacimiento, m.expira], ["1974-08-12", "2012-04-15"]);

// Sin numero de documento, evaluarKyc lo declara no evaluable: es un campo obligatorio.
const km = evaluarKyc(m, HOY);
igual("sin numero, no evaluable", km.estado, "no evaluable");

console.log("\nuna fecha imposible no se acepta aunque el digito cuadre");
const RARO = CRUDO.replace("7408122F", "7413992F");
const r = camposDePasaporte(RARO, HOY);
igual("mes 13 no es una fecha", r.nacimiento, "");

console.log("\nsi no hay MRZ, devuelve nulo y el sistema sigue con la cedula");
igual("texto de cedula", camposDePasaporte("NOMBRE\nJUAN PEREZ\nCEDULA\n8-1-1"), null);


console.log("\nida y vuelta: construir un MRZ y volverlo a leer");
const inventado = {
  pais: "UTO",
  apellidos: "FERREIRA<DOS<SANTOS",
  nombres: "ANA LUCIA",
  numero: "X1234567",
  nacimiento: "1993-09-05",
  expira: "2032-08-19",
  sexo: "F",
  opcional: "",
};
const [l1, l2] = mrzDe(inventado);
igual("las dos lineas miden 44", [l1.length, l2.length], [44, 44]);
const v = camposDePasaporte(`${l1}\n${l2}`, HOY);
igual("el nombre vuelve entero", v.nombre, "ANA LUCIA FERREIRA DOS SANTOS");
igual("el numero vuelve entero", v.cedula, "X1234567");
igual("el nacimiento vuelve entero", v.nacimiento, "1993-09-05");
igual("la expiracion vuelve entera", v.expira, "2032-08-19");
igual("y todos los controles cuadran", v.control, { numero: true, nacimiento: true, expiracion: true, conjunto: true });
igual("vigente", evaluarKyc(v, HOY).estado, "vigente");

// Un pasaporte de un migrante que llega a abrir su primera cuenta: el sistema lo trata
// igual que a un panameno con cedula, sin una sola rama especial en el resto del codigo.
igual("el numero de pasaporte NO se juzga con el formato panameno",
  evaluarKyc(v, HOY).avisos.filter((a) => a.includes("cédula panameña")).length, 0);

console.log(`\n${ok} ok, ${fallo} fallan`);
process.exit(fallo ? 1 : 0);
