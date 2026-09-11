// Pruebas de quién firma el acta. Código determinista: ningún modelo, milisegundos.
import { PIN, hashDePin, nuevaSal, pinCorrecto, esperaTras, ESPERAS, oficialPublico, registrar, oficialDe, actuacionDe } from "./oficiales.mjs";

let ok = 0, fallo = 0;
const igual = (nombre, a, b) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) { ok++; console.log(`  ok   ${nombre}`); }
  else { fallo++; console.log(`  FALLA ${nombre}\n        dio      ${x}\n        esperaba ${y}`); }
};

// ---------------------------------------------------------------- el PIN
console.log("PIN: cuatro dígitos, ni más ni menos");
igual("4 dígitos vale", PIN.test("3691"), true);
igual("3 no vale", PIN.test("369"), false);
igual("5 no vale", PIN.test("36910"), false);
igual("letras no valen", PIN.test("36a1"), false);
igual("espacios no valen", PIN.test(" 369"), false);

console.log("\nhashDePin: la sal es lo que impide la tabla precalculada");
igual("mismo par, mismo hash", hashDePin("sal1", "3691"), hashDePin("sal1", "3691"));
igual("distinta sal, distinto hash", hashDePin("sal1", "3691") === hashDePin("sal2", "3691"), false);
igual("distinto PIN, distinto hash", hashDePin("sal1", "3691") === hashDePin("sal1", "3692"), false);
igual("el hash no contiene el PIN", hashDePin("sal1", "3691").includes("3691"), false);
igual("sha256 son 64 hex", /^[0-9a-f]{64}$/.test(hashDePin(nuevaSal(), "0000")), true);
igual("dos sales seguidas no se repiten", nuevaSal() === nuevaSal(), false);

const sal = nuevaSal();
const yaritza = { id: "OF-01", nombre: "Yaritza Mendoza", sucursal: "Vía España", sal, pinHash: hashDePin(sal, "3691") };

console.log("\npinCorrecto");
igual("el PIN bueno entra", pinCorrecto(yaritza, "3691"), true);
igual("el PIN malo no entra", pinCorrecto(yaritza, "3692"), false);
igual("el PIN como número también entra", pinCorrecto(yaritza, 3691), true);
igual("vacío no entra", pinCorrecto(yaritza, ""), false);
igual("sin PIN no entra", pinCorrecto(yaritza, null), false);
igual("un oficial sin sal no entra nunca", pinCorrecto({ id: "OF-9", pinHash: "" }, "3691"), false);
igual("un hash vacío no deja pasar a nadie", pinCorrecto({ sal, pinHash: "" }, "3691"), false);
// El hash de otra persona con el mismo PIN no sirve: para eso está la sal por oficial.
const prestado = { id: "OF-02", nombre: "Ricardo Him", sal: nuevaSal(), pinHash: hashDePin(sal, "3691") };
igual("hash prestado de otra sal no entra", pinCorrecto(prestado, "3691"), false);

console.log("\nesperaTras: probar diez mil combinaciones deja de salir gratis");
igual("primer fallo, sin espera", esperaTras(1), 0);
igual("tercer fallo, sin espera", esperaTras(2), 0);
igual("cuarto fallo, 5 s", esperaTras(3), 5000);
igual("sexto fallo, un minuto", esperaTras(5), 60000);
igual("de ahí no sube más", esperaTras(99), ESPERAS.at(-1) * 1000);
igual("cero fallos, sin espera", esperaTras(0), 0);
igual("un negativo no rompe nada", esperaTras(-3), 0);

console.log("\noficialPublico: el secreto no viaja al navegador");
const publico = oficialPublico(yaritza);
igual("no lleva sal", "sal" in publico, false);
igual("no lleva hash", "pinHash" in publico, false);
igual("sí lleva quién es", [publico.id, publico.nombre, publico.sucursal], ["OF-01", "Yaritza Mendoza", "Vía España"]);
igual("sin oficial, null", oficialPublico(null), null);

// ---------------------------------------------------------------- el padrón
console.log("\nregistrar: dar de alta a alguien en esta sucursal");
const hoy = new Date("2026-09-10T15:00:00.000Z");
const padron = [yaritza];
const alta = registrar(padron, { nombre: "  Ricardo   Him ", sucursal: "La Chorrera", pin: "8024", hoy });
igual("el nombre se limpia", alta.oficial.nombre, "Ricardo Him");
igual("el id sigue al mayor del padrón", alta.oficial.id, "OF-02");
igual("queda escrito cómo entró", alta.oficial.origen, "alta local");
igual("y cuándo", alta.oficial.alta, "2026-09-10T15:00:00.000Z");
igual("el PIN queda comprobable", pinCorrecto(alta.oficial, "8024"), true);
igual("y solo ese PIN", pinCorrecto(alta.oficial, "8025"), false);
igual("nombre corto, no", registrar(padron, { nombre: "Al", pin: "1111" }).error, "El nombre necesita al menos 3 letras.");
igual("PIN de 3, no", registrar(padron, { nombre: "Damaris Sáez", pin: "111" }).error, "El PIN son exactamente cuatro dígitos.");
igual("nombre repetido, no", registrar(padron, { nombre: "yaritza mendoza", pin: "1111" }).error, "Yaritza Mendoza ya está en el padrón de esta sucursal.");
igual("sin sucursal, no queda vacío", registrar(padron, { nombre: "Damaris Sáez", pin: "1111", hoy }).oficial.sucursal, "Sin sucursal");
igual("el id no se recicla", registrar([{ id: "OF-07", nombre: "X" }, { id: "OF-02", nombre: "Y" }], { nombre: "Nueva Una", pin: "1111", hoy }).oficial.id, "OF-08");

// ---------------------------------------------------------------- quién firma
console.log("\noficialDe: lo viejo se lee, y se dice que no está verificado");
igual("el «ventanilla» de antes", oficialDe({ oficial: "ventanilla" }), { id: "libre:ventanilla", nombre: "ventanilla", sucursal: null, verificado: false });
igual("firmada de verdad", oficialDe({ oficial: { id: "OF-01", nombre: "Yaritza Mendoza", sucursal: "Vía España", verificado: true } }), { id: "OF-01", nombre: "Yaritza Mendoza", sucursal: "Vía España", verificado: true });
igual("sin oficial no se inventa nombre", oficialDe({}).nombre, "Sin nombre");
igual("un acta vieja nunca pasa por verificada", oficialDe({ oficial: "ventanilla" }).verificado, false);

// ---------------------------------------------------------------- el libro
const acta = (folio, quien, fecha, decision) => ({ folio, fecha, decision, oficial: quien });
const YARITZA = { id: "OF-01", nombre: "Yaritza Mendoza", sucursal: "Vía España", verificado: true };
const RICARDO = { id: "OF-02", nombre: "Ricardo Him", sucursal: "La Chorrera", verificado: true };

console.log("\nactuacionDe: qué firmó cada quien, y sale del libro");
const libro = [
  acta("ALC-0001", YARITZA, "2026-09-08T10:00:00.000Z", "continuado"),
  acta("ALC-0002", YARITZA, "2026-09-09T11:30:00.000Z", "detenido"),
  acta("ALC-0003", RICARDO, "2026-09-09T15:00:00.000Z", "continuado"),
  acta("ALC-0004", "ventanilla", "2026-09-01T09:00:00.000Z", "continuado"),
];
const act = actuacionDe(libro, [
  { id: "OF-01", nombre: "Yaritza Mendoza", sucursal: "Vía España", origen: "padrón" },
  { id: "OF-02", nombre: "Ricardo Him", sucursal: "La Chorrera", origen: "padrón" },
  { id: "OF-03", nombre: "Damaris Sáez", sucursal: "David", origen: "padrón" },
]);
const de = (id) => act.find((f) => f.id === id);
igual("sale el padrón entero más la firma vieja", act.length, 4);
igual("Yaritza: dos actas, una detenida", [de("OF-01").actas, de("OF-01").continuados, de("OF-01").detenidos], [2, 1, 1]);
igual("Ricardo: una, continuada", [de("OF-02").actas, de("OF-02").continuados, de("OF-02").detenidos], [1, 1, 0]);
igual("Damaris en cero, que también es un dato", [de("OF-03").actas, de("OF-03").ultima], [0, null]);
igual("la última es la fecha real", de("OF-01").ultima, "2026-09-09T11:30:00.000Z");
igual("el «ventanilla» de antes aparece, sin verificar", act.find((f) => f.nombre === "ventanilla").verificado, false);
igual("y los firmados sí verificados", de("OF-01").verificado, true);
igual("de más actas a menos", act.map((f) => f.actas), [2, 1, 1, 0]);
igual("un libro vacío deja el padrón en cero", actuacionDe([], [{ id: "OF-01", nombre: "Yaritza Mendoza" }]).map((f) => f.actas), [0]);
igual("sin padrón, solo quien firmó", actuacionDe(libro, []).length, 3);

console.log(`\n${ok} bien, ${fallo} mal`);
process.exit(fallo ? 1 : 0);
