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

## Se lee dos veces

Midiendo salió algo que no esperábamos: **VisionPsy no es determinista ni a temperatura
0**. La misma cédula, el mismo modelo y el mismo prompt pueden dar dos lecturas distintas.

En otro producto eso sería una nota al pie. En un banco es el problema entero, porque
significa que un campo puede salir bien una vez y mal la siguiente sin que nadie se
entere.

Así que **se lee dos veces y solo entra lo que las dos lecturas dicen igual.**

| | |
|---|---|
| Las dos lecturas coinciden | el campo entra |
| No coinciden | el campo **no entra**, y se dice con qué salió cada vez |
| Una lo vio y la otra no | tampoco entra: visto una sola vez no es visto |
| Una fecha huérfana en una sola lectura | se descarta: puede no existir |

Un campo que no se confirma a sí mismo se trata exactamente igual que uno que no se pudo
leer: se marca, y si es obligatorio **detiene el trámite**.

Cuesta el doble de tiempo. Treinta segundos de más para no abrir una cuenta con un dato
que el modelo no sostiene dos veces seguidas es un intercambio que cualquier banco firma.
`?pasadas=1` existe para depurar, no para atender.

---

## La huella

Cada lectura guarda **qué la produjo**:

```json
{
  "modelo": "VisionPsy-Nano-460M",
  "cuantizacion": "q4_k_m (+ mmproj q8_0)",
  "pasadas": 2,
  "prompt": "a1b2c3d4e5f60718",
  "imagen": "9f8e7d6c5b4a3021",
  "leido": "2026-09-09T18:20:00.000Z"
}
```

En banca eso tiene nombre: gobernanza de modelos. Responde la pregunta que hace un
auditor un año después, cuando el modelo ya se actualizó dos veces: **¿quién decidió que
este documento estaba vigente?**

Los digest son de la entrada, no de la persona. No identifican a nadie y no permiten
reconstruir la imagen.

Las dos cosas se sostienen mutuamente: la huella dice exactamente qué modelo y qué prompt
produjeron el dato, y como ese mismo modelo con la misma entrada no siempre dice lo
mismo, se lee dos veces y solo se acepta lo que coincide.

---

## Cédula o pasaporte

En Panamá quien llega a abrir su primera cuenta muchas veces no trae cédula: trae
pasaporte. Es justamente la persona no bancarizada, así que dejarla fuera sería dejar
fuera al cliente que más importa.

**Alcancía no pregunta qué documento es. Lo mira.** Si lo leído trae un MRZ (las dos
líneas del pie de la página de datos, formato ICAO 9303), es un pasaporte; si no, se
trata como cédula. El resto del sistema —el cotejo, el veredicto, el expediente— no sabe
la diferencia ni la necesita.

### Y el pasaporte puede demostrar que se leyó bien

Esto es lo mejor que le pasó a este producto. El MRZ **lleva dígitos de control**: el
número de documento, la fecha de nacimiento, la de expiración y el conjunto entero van
cada uno con su cifra verificadora, calculada con pesos 7-3-1.

O sea que si el modelo lee mal un solo carácter, **la cuenta no cuadra y el código lo
sabe**. No lo sospecha: lo sabe.

```
Lo que dijo el modelo        L898902C8 6 UTO 7408122 F 1204159 …
Lo que dice la aritmética    el dígito de L898902C8 debería ser 4, no 6
Lo que hace Alcancía         el número no entra al expediente, y se dice por qué
```

Con la cédula podemos decir «no pude leerlo». Con el pasaporte podemos decir **«lo leí,
hice la cuenta, y no cuadra»**, que para un banco es una afirmación mucho más fuerte.

Las pruebas se corren contra el ejemplo canónico de ICAO 9303 (Anna Maria Eriksson, del
propio estándar): si nuestros dígitos no dan exactamente los suyos, el módulo está mal.
Y hay una prueba de ida y vuelta, que construye un MRZ y lo vuelve a leer.

### Los pasaportes de prueba

```bash
npm run pasaportes   # dibuja dos pasaportes sintéticos y su verdad
```

El país emisor es **UTO**, el código que ICAO reserva para especímenes. No se dibuja la
réplica del pasaporte de ningún país real: aunque lleve marca de agua de documento
sintético, fabricar una copia creíble del documento de viaje de un estado es exactamente
la clase de cosa que no se hace.

### Lo que pasó al medirlo, el 10 de septiembre

Vale la pena contarlo entero, porque no salió como esperábamos y el resultado es mejor.

**Con el prompt general, VisionPsy se salta el MRZ.** Transcribe los campos impresos y
no baja hasta las dos líneas del pie. Pidiéndoselo expresamente sí las devuelve, así que
el pasaporte lleva una pasada más; la cédula no la necesita y no se le tocó nada.

**Y las devuelve comprimidas.** Sobre el pasaporte limpio dio

```
X1234567<7UTOPIA9309050F3208195<02          lo que devolvió el modelo
X1234567<7UTO9309050F3208195<<<<<<<<<<<<<<02  la línea real
```

Se comió el relleno y escribió el país entero en vez del código de tres letras. Pero
**todos los datos y todos los dígitos de control están bien**. Por eso el parser lee la
línea *por estructura y no por posición*: ancla en el bloque central (seis dígitos de
nacimiento, su control, el sexo, seis de expiración y su control), que tiene forma
inconfundible, y deduce el resto hacia los lados.

**Y entonces pasó lo bueno.** En la parte impresa el modelo leyó la expiración como
`10 08 2032`. La verdad es `19 08 2032`: confundió un 9 con un 0. El MRZ, con su dígito
de control, dice 19. Y la app lo dijo sola:

> la fecha de expiración salió distinta en lo impreso (10-08-2032) y en el MRZ
> (19-08-2032): manda el MRZ, que trae su dígito de control

**El sistema atrapó un error del propio modelo, y explicó cómo lo supo.** No es que
desconfíe del modelo por norma: es que tenía una manera de comprobarlo y la usó.

| | pasaporte limpio | pasaporte gastado |
|---|---|---|
| Tiempo | 29,5 s | 31,2 s |
| Número, nacimiento, expiración | correctos | correctos |
| Dígitos de control | 4 / 4 | 4 / 4 |
| Nombre | leído de lo impreso | **no legible** |
| Veredicto | vigente, el trámite sigue | **no evaluable**, se detiene |

En el gastado el nombre impreso salió como una tira de letras pegadas y el MRZ recortado
no lo trae, así que no hay nombre que aceptar. El trámite se detiene, que es exactamente
lo que tiene que pasar: **un banco no abre una cuenta a un nombre que nadie pudo leer.**

Son tres pasadas del modelo, unos 30 segundos. Para no abrir una cuenta con una fecha
mal leída, es barato.

---

## Lo que está medido

| | |
|---|---|
| Campos leídos | **30** en cuatro cédulas sintéticas |
| Campos mal | **0** |
| Trámites decididos como lo haría un operador | **4 / 4** |
| Pruebas deterministas | **159** |

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
npm run prueba  # 159 pruebas deterministas, sin modelo, en milisegundos
npm run casos   # recalcula los cuatro casos de la demostración
```

Variables: `PUERTO` (3215), `QMODEL=4b` para usar Qwen3 4B, `QVOZ=base` para Whisper
base, `HOST=0.0.0.0` para abrirlo a la red local (sin micrófono: el navegador solo lo
permite en localhost o HTTPS).

---

## Si no arranca

**«RPC initialization timed out» en Windows.** No es un fallo de esta app: es Windows
bloqueando los binarios de QVAC, que no van firmados. Smart App Control y la protección
de reputación los matan en silencio y lo único que se ve es el timeout. Hay que
permitirlos en Seguridad de Windows, o desactivar Smart App Control mientras se prueba.
Para ver la causa real en vez del timeout, lanzar el proceso de QVAC a mano con `bare`.

**Se instaló una versión distinta del SDK.** El `package.json` fija `@qvac/sdk` a
`^0.18.2`, que es con la que están medidos todos los números de este README. Las
versiones 1.x traen otro `@qvac/fabric` y otro árbol de dependencias, y no están
probadas aquí. Si `npm install` trajo otra cosa, borrar `node_modules` y
`package-lock.json` y repetir.

**La primera vez tarda mucho.** `npm install` baja unos 6 GB entre binarios y modelos, y
el primer arranque los carga en memoria. A partir de ahí es rápido.

**Node.** Medido en v24. Hace falta 20 o superior.

---

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `pasaporte.mjs` | lee el MRZ y **comprueba sus dígitos de control**; `mrzDe` hace el camino inverso |
| `documento.mjs` | decide qué documento es, lo lee dos veces, empareja etiqueta con valor, `consensuar` cruza las dos lecturas, `evaluarKyc` da el veredicto y `huellaDe` firma quién lo leyó |
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
