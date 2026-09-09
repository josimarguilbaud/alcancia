# Prompt para generar la interfaz de Cotejo

Copia todo lo que hay debajo de la línea y pégalo en la herramienta.
Cuando te devuelva el HTML, pásamelo y yo lo cableo al motor.

---

Necesito un **único archivo HTML autocontenido** para una aplicación llamada **Cotejo**.

## Qué es

Una herramienta de ventanilla bancaria que lee la cédula de identidad de un cliente con
un modelo de IA que corre **dentro de la propia computadora de la sucursal**. Ningún dato
sale de ahí. La usa un ejecutivo de cuentas mientras el cliente está enfrente.

**La tesis del producto, y tiene que notarse en el diseño:** un banco no puede aceptar
«probablemente». El sistema extrae solo lo que puede probar que leyó, marca lo que no
pudo leer, y **detiene el trámite** por el campo que falta en vez de completarlo. Una
cédula vencida no abre una cuenta, y un campo inventado en un expediente de identidad
no es un error de software, es un problema de cumplimiento.

## Restricciones técnicas, no negociables

- Un solo archivo `.html`. Nada de React, Vue, Tailwind ni ningún framework.
- **Cero recursos externos.** Ni un `<link>`, ni un `<script src>`, ni `@import` a
  Google Fonts o a cualquier CDN. La aplicación funciona sin internet: si pides una
  fuente a un servidor, se rompe justo en la demostración. Declara las familias
  tipográficas por nombre con sus alternativas y ya está; yo sirvo los archivos.
- Sin imágenes externas, sin iconos de librería, sin emoji como elemento de diseño.
- Todo el texto en español de Panamá.
- Funciona bien a 375 px de ancho y a 1200. Una sola columna, ancho máximo 720 px
  centrado. Nada debe desbordar horizontalmente a ningún ancho.
- Tema claro y tema oscuro con `prefers-color-scheme`, definiendo los colores como
  variables CSS en `:root` y redefiniéndolas dentro de la media query. El oscuro no es
  una inversión: se vuelven a elegir los tonos.

## Sistema de diseño, úsalo tal cual

```css
/* claro */
--papel:#F1F4F4;  --hoja:#FFFFFF;  --tinta:#14181A;  --media:#5E696D;
--suave:#8A9498;  --linea:#D3DADC;  --linea-f:#E4E9EA;  --metal:#E7ECED;
--acento:#075A63; --acento-tenue:#E2EEEF;
--ambar:#8A5A00;  --ambar-tenue:#FAF0DC;
--rojo:#8D3030;   --rojo-tenue:#F9EBEA;
--verde:#14603A;

/* oscuro */
--papel:#0F1315;  --hoja:#171D1F;  --tinta:#E6ECED;  --media:#96A2A6;
--suave:#6C787C;  --linea:#2A3437;  --linea-f:#202829;  --metal:#232B2D;
--acento:#4FC3CE; --acento-tenue:#103336;
--ambar:#D9A64E;  --ambar-tenue:#2C2415;
--rojo:#E08A82;   --rojo-tenue:#2E1A19;
--verde:#5CC08C;
```

**Tipografías** (declara los nombres y las alternativas, sin cargarlas de ningún sitio):

- Títulos: `"Archivo", "Arial Narrow", sans-serif`, peso 700, `letter-spacing:-.022em`
- Texto e interfaz: `"Public Sans", "Segoe UI", system-ui, sans-serif`
- **Todo dato**: `"JetBrains Mono", Consolas, monospace` con
  `font-variant-numeric: tabular-nums`. Números de cédula, fechas y cantidades siempre
  en monoespaciada.

**Escala con salto real, no con cambios de grosor:** 40 / 22 / 16 / 11 px.

**Espaciado** base 4, con saltos grandes entre grupos: 4, 8, 12, 16, 24, 40, 64.

**Radios casi planos:** 3 px en fichas, botones y campos. 4 px como máximo. Nada
redondeado del todo.

## Reglas de estética, y son las que deciden si sirve

1. **Filas regladas, no tarjetas.** Los datos se separan con una línea de 1 px
   (`--linea-f`), nunca con una tarjeta con sombra. **Cero `box-shadow` en todo el
   archivo.** Esto es un acta, no un panel de control: un acta no flota.
2. **El color significa.** El acento solo aparece en lo que se puede pulsar. El ámbar
   solo cuando hay un aviso. El rojo solo cuando algo está vencido o bloqueado. Si un
   color aparece decorando, está mal.
3. **La marca de procedencia va en cada dato.** Es una ficha pequeña en monoespaciada,
   10 px, versalitas, radio 3 px, que dice de dónde salió el valor. Hay dos:
   - `leído en la cédula` — fondo `--metal`, borde `--linea`, texto `--tinta`
   - `no se pudo leer` — fondo `--ambar-tenue`, borde y texto `--ambar`
4. Un dato que no se pudo leer **no se deja en blanco ni se rellena con un guion
   discreto**: se ve, con su marca ámbar, porque es la información más importante de
   la pantalla.

## Lo que NO quiero, y lo digo porque es lo que sale por defecto

- Tarjetas con sombra y esquinas muy redondeadas como contenedor de todo.
- Azul corporativo. Nada de azul de banco.
- Degradados de cualquier tipo, y sobre todo morado o violeta.
- Rejilla de tres columnas con un icono dentro de un círculo de color y dos líneas de
  texto debajo.
- Todo centrado.
- Barra de color en el borde izquierdo de una tarjeta.
- Iconos decorativos, emoji, formas flotantes, líneas onduladas.
- Números grandes de estadística que no significan nada.
- `system-ui` como tipografía principal.

## La pantalla

Un encabezado, un área de captura y el resultado. Un solo flujo, de arriba abajo.

### Encabezado

- Título **Cotejo** y debajo, en texto secundario: «Lectura de documentos en ventanilla».
- A la derecha, en monoespaciada pequeña y en color acento:
  `VisionPsy-Nano-460M · todo en esta computadora`.
- Debajo, una línea discreta: `Ningún dato del cliente sale de este equipo.`

### Captura

- Un botón primario: **Tomar foto de la cédula**, y uno secundario **Subir archivo**.
- Debajo, una línea de estado (vacía al principio).

### Resultado

Un bloque con el veredicto arriba del todo, bien visible, y los campos debajo.

**El veredicto** es una banda con borde de 1 px, radio 3, sin sombra, que cambia según
el estado. Lleva un rótulo en versalitas monoespaciadas, una frase, y a la derecha si el
trámite puede continuar. Tres estados:

- **VIGENTE** — borde y texto `--verde`, fondo transparente.
  «Vigente hasta 02-06-2031.» · El trámite puede continuar.
- **VENCIDA** — borde y texto `--rojo`, fondo `--rojo-tenue`.
  «La cédula venció hace 576 días (11-02-2025).» · El trámite se detiene.
- **NO EVALUABLE** — borde y texto `--ambar`, fondo `--ambar-tenue`.
  «No se pudo leer la fecha de expiración. El trámite no sigue hasta que lo confirme una
  persona.» · El trámite se detiene.

**Los campos**, en filas regladas, cada uno con etiqueta a la izquierda en versalitas
11 px color `--suave`, valor a la derecha, y su marca de procedencia al final:

```
NOMBRE                MARIA ISABEL QUINTERO ARJONA        leído en la cédula
CEDULA                8-912-3456                          leído en la cédula
FECHA DE NACIMIENTO   17-04-1988                          leído en la cédula
LUGAR DE NACIMIENTO   PANAMA, PANAMA                      leído en la cédula
SEXO                  F                                   leído en la cédula
TIPO DE SANGRE        O+                                  leído en la cédula
EXPEDIDA              02-06-2021                          leído en la cédula
EXPIRA                02-06-2031                          leído en la cédula
```

**Avisos**, cuando los hay, en un bloque ámbar debajo de los campos. Ejemplo real:
«El nombre trae palabras pegadas: hay que confirmarlo a mano.»

**Fechas sin etiqueta.** A veces el modelo lee una fecha pero no a qué campo pertenece.
No se asigna sola. Va en su propio bloque: «Se leyó esta fecha pero no a qué campo
pertenece: **19-08-2032**», con dos botones pequeños para que la persona la asigne a
Expedida o a Expira.

**Al final**, un `<details>` cerrado que dice «Lo que leyó el modelo, tal cual» y dentro
un `<pre>` con el texto crudo.

**Botón final**: **Continuar con el trámite**, primario, ancho completo. Aparece
deshabilitado cuando el veredicto es VENCIDA o NO EVALUABLE, y al lado, en texto
pequeño, el motivo por el que está bloqueado.

## Identificadores obligatorios

Ponles exactamente estos `id`, que es por donde voy a cablearlo:

`#tomarFoto` `#subirArchivo` `#imagen` (input file oculto) `#estado` `#resultado`
`#veredicto` `#veredictoRotulo` `#veredictoTexto` `#campos` `#avisos` `#huerfanos`
`#textoLeido` `#continuar` `#motivoBloqueo`

## Muy importante: enséñame los tres estados a la vez

En vez de una sola pantalla, **repite el bloque de resultado tres veces**, una por
estado, cada una precedida de un rótulo pequeño que diga cuál es. Así los veo todos sin
tener que ejecutar nada. Usa estos datos reales, salidos de una medición de verdad:

**1. Vigente:** María Isabel Quintero Arjona · 8-912-3456 · 17-04-1988 · PANAMA, PANAMA ·
F · O+ · expedida 02-06-2021 · expira 02-06-2031. Sin avisos.

**2. Vencida:** Rodrigo ANTONIOBERNAL Saavedra · 3-701-2288 · 30-11-1974 · COLON, COLON ·
M · A- · expedida 11-02-2015 · expira 11-02-2025. Aviso: el nombre trae palabras pegadas.
Escribe el nombre tal cual, con las letras pegadas: es lo que leyó el modelo y no se
corrige solo.

**3. No evaluable:** José Miguel Castillero Pinzón · 4-155-8830 · 23-01-1966 ·
DAVID, CHIRIQUIUT · M · sin tipo de sangre · expedida 08-10-2019 · **expira: no se pudo
leer**. Este es el caso importante: la fila de EXPIRA tiene que verse, con su marca
ámbar «no se pudo leer», no desaparecer.

Devuélveme solo el archivo HTML completo, sin explicaciones.
