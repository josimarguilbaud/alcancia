# Alcancía

**La ventanilla que no puede inventar un dato del cliente.**

Un ejecutivo de Caja de Ahorros atiende a alguien que viene a abrir su primera cuenta.
En vez de teclear un formulario, **habla**. Toma una foto de la cédula. Alcancía arma el
expediente KYC, **coteja lo que se dijo contra lo que dice el documento**, y cuando algo
no cuadra **detiene el trámite** en vez de resolverlo por su cuenta.

Todo dentro de la computadora de la sucursal. Cero llamadas de red.

> Entrega para el **Decentralized AI Hackathon** (ISD × Tether, Panamá, 9–11 sep 2026).
> Reto corporativo: **Caja de Ahorros**.

---

## La tesis

Un banco no puede aceptar «probablemente».

Medido el 9 de septiembre sobre cuatro cédulas sintéticas, VisionPsy pierde primero
justo el campo que más le importa a un banco: en la cédula gastada **la fecha de
expiración no aparece**. Un lector ingenuo enseña seis campos correctos y se come el
séptimo en silencio. Eso no es un error de software: es un problema de cumplimiento con
cara de software que funciona.

Por eso aquí **el modelo propone y el código comprueba**:

| Lo decide el modelo | Lo decide el código |
|---|---|
| Nombre, producto solicitado, domicilio, ocupación | La cédula, el teléfono, el ingreso |
| Transcribir cada línea de la cédula | Emparejar etiqueta con valor |
| | Si está vigente, vencida o no evaluable |
| | Si lo dicho cuadra con lo leído |
| | Si el trámite puede seguir |

Lo que el modelo propone y la frase no respalda, se descarta con su motivo.

---

## El cotejo

Es la pieza que le da nombre a la función, y tiene **tres** desenlaces, no dos. La
diferencia entre el segundo y el tercero es lo que evita que el aviso se vuelva ruido.

| | Ejemplo | Qué pasa |
|---|---|---|
| **coincide** | dijo «María Isabel Quintero Arjona», la cédula dice lo mismo | el dato queda **confirmado** |
| **contenido** | dijo «Ana Lucía Ferreira», la cédula dice «ANA LUCIA FERREIRA DOS SANTOS» | no es conflicto: es un nombre incompleto. Gana el del documento y se anota de dónde salió |
| **discrepa** | dijo «Rodrigo Bernal Sánchez», la cédula dice «RODRIGO ANTONIO BERNAL SAAVEDRA» | **conflicto**: el trámite se detiene hasta que lo resuelva una persona |

En ventanilla la gente se presenta con un apellido y la cédula trae dos. Tratar eso como
conflicto haría saltar el aviso siempre, y un aviso que salta siempre deja de leerse.

---

## Lo que nunca hace

- **No rellena un hueco.** Si no pudo leer la expiración, el veredicto es
  `no evaluable` y el trámite no sigue. Eso es distinto de `vencida`, y para un trámite
  son cosas muy distintas.
- **No arregla un nombre.** Si el modelo lee las letras pegadas, se dejan pegadas y se
  avisa. Inventarle un espacio a un nombre es lo que un banco no puede permitirse.
- **No adivina una fecha.** Una fecha sin etiqueta se devuelve como huérfana, con dos
  botones para que la persona la coloque.
- **No elige entre dos fuentes.** Las enseña las dos, una al lado de la otra, y para.

---

## Lo que está medido

| | |
|---|---|
| Campos leídos | **30** en cuatro cédulas sintéticas |
| Campos mal | **0** |
| Trámites decididos como lo haría un operador | **4 / 4** |
| Pruebas deterministas | **83** |

Registro completo en [`rendimiento/cedulas.json`](rendimiento/cedulas.json), con el texto
crudo que devolvió el modelo en cada documento.

**VisionPsy no es determinista, ni siquiera a temperatura 0.** Si una lectura falla, lo
primero que hay que mirar es `textoLeido` en ese registro: casi siempre el fallo está en
el parseo, no en el modelo.

---

## Todo corre en el dispositivo

| Modelo | Para qué | Cuándo se carga |
|---|---|---|
| Whisper small (q8_0) | transcribir lo que dicta el oficial | al arrancar |
| Qwen3 1.7B (Q4) | proponer los campos de texto libre | al arrancar |
| VisionPsy-Nano-460M (q4_k_m) + mmproj | leer la cédula | con la primera foto |

Todos vía [QVAC](https://www.npmjs.com/package/@qvac/sdk). El servidor no tiene una sola
dependencia fuera de Node y QVAC: si se desenchufa el cable, la ventanilla sigue
atendiendo. Por eso el argumento de privacidad aquí no es un adorno — la cédula del
cliente no sale del equipo porque no hay a dónde mandarla.

---

## Correrlo

```bash
npm install     # QVAC son ~6 GB de binarios y modelos
npm start       # http://localhost:3215
```

La primera foto tarda más: es cuando se carga VisionPsy.

```bash
npm run prueba  # 83 pruebas deterministas, sin modelo, en milisegundos
npm run casos   # recalcula los cuatro casos de la demostración
```

Variables: `PUERTO` (3215), `QMODEL=4b` para usar Qwen3 4B, `QVOZ=base` para Whisper
base, `HOST=0.0.0.0` para abrirlo a la red local (sin micrófono: el navegador solo lo
permite en localhost o HTTPS).

---

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `documento.mjs` | lee la cédula: empareja etiqueta con valor, y `evaluarKyc` da el veredicto de vigencia |
| `entrevista.mjs` | el dictado → expediente KYC. `cedulaEn`, `telefonoEn`, `montoEn` |
| `cotejar.mjs` | el cotejo y `decidir`, la regla completa del trámite |
| `servidor.mjs` | `/transcribir` `/entrevista` `/documento` `/decidir` `/caso` |
| `index.html` | la ventanilla. No decide nada: pinta lo que devolvió `decidir` |
| `casos-demo.mjs` + `generar-casos.mjs` | los cuatro casos, calculados con el mismo código y empotrados en la página |
| `documentos/generar.mjs` | fabrica las cuatro cédulas sintéticas |

La página se abre sola sin servidor y enseña los cuatro casos ya calculados. Esa copia
la genera `generar-casos.mjs` con el código de producción, así que no puede separarse de
la verdad sin que una prueba lo note.

---

## Datos

Las cuatro cédulas son **sintéticas** y lo dicen en la propia imagen: *«DOCUMENTO
SINTÉTICO · GENERADO PARA PRUEBAS · NO ES UNA CÉDULA REAL»*. Ningún dato de ninguna
persona real, de ninguna entidad financiera. La carpeta `datos/`, donde el servidor
guarda la última grabación y la última foto para poder reproducir un fallo, **no se
publica**.

---

## Licencia

MIT. Ver [LICENSE](LICENSE).
