// Los cuatro casos de la demostración. Nada de esto está inventado del lado del
// documento: `textoLeido` es, palabra por palabra, lo que VisionPsy devolvió el 9 sep
// sobre las cuatro cédulas sintéticas, copiado de `rendimiento/cedulas.json`.
//
// Lo que sí está guionizado es el dictado del oficial, porque es la mitad que en una
// demostración pone el humano. Cada uno busca un resultado distinto del cotejo:
//
//   vigente-limpia   coincide     -> confirmado, el trámite sigue
//   vencida          discrepa     -> conflicto, y además la cédula está vencida
//   extranjero       contenido    -> dijo un apellido de menos; gana el del documento
//   gastada          coincide     -> pero no se pudo leer la expiración: no evaluable
//
// El caso «vencida» merece una nota. El apellido que no cuadra es un guion: el cliente
// dice «Sánchez» y el documento dice «Saavedra». Pasa en ventanilla con los segundos
// apellidos y por teléfono con mala línea, y es exactamente para lo que existe esto.
export const CASOS = [
  {
    id: "vigente-limpia",
    boton: "1 · Todo cuadra",
    resumen: "El cliente dicta, la cédula lo confirma, el trámite sigue.",
    dictado: "María Isabel Quintero Arjona, cédula 8-912-3456, quiere abrir una cuenta de ahorros. Gana 1,200 balboas al mes, vive en Betania, el teléfono es 6123-4567 y es enfermera.",
    textoLeido: "This card is a national ID card.\nNOMBRE  \nMARIA ISABEL QUINTERO ARJONA  \nCEDula  \n8-912-3456  \nFecha de Nacimiento  \n17-04-1988  \nLUGAR DE NACIMIENTO  \nPANAMA, PANAMA  \nSEXO  \nF   O+  \nEXPEDIDA  \n02-06-2021  \nEXPIRA  \n02-06-2031",
    // Solo para la copia sin servidor: es lo que Qwen3 propone de la frase. Con el
    // servidor arriba esto no se usa, lo produce el modelo de verdad.
    crudo: { nombre: "María Isabel Quintero Arjona", producto: "cuenta de ahorros", domicilio: "Betania", ocupacion: "enfermera" },
  },
  {
    id: "vencida",
    boton: "2 · Vencida y el apellido no cuadra",
    resumen: "Dos motivos para detenerse, y ninguno se resuelve solo.",
    dictado: "Rodrigo Bernal Sánchez, cédula 3-701-2288, quiere un préstamo personal. Gana como 900 al mes y vive en Colón.",
    textoLeido: "NOMBRE  \nRODRIGO ANTONIO BERNAL SAAVEDRA  \n\nCEDULA  \n3-701-2288  \n\nFECHA DE NACIMIENTO  \n30-11-1974  \n\nLUGAR DE NACIMIENTO  \nCOLON, COLON  \n\nSEXO  \nM  \n\nTIPO DE SANGRE  \nA-  \n\nEXPEDIDA  \n11-02-2015  \n\nEXPIRA  \n11-02-2025",
    crudo: { nombre: "Rodrigo Bernal Sánchez", producto: "préstamo personal", domicilio: "Colón", ocupacion: "" },
  },
  {
    id: "extranjero",
    boton: "3 · Dijo un apellido de menos",
    resumen: "No es un conflicto: es un nombre incompleto, y gana el del documento.",
    dictado: "Ana Lucía Ferreira, cédula E-8-145097, quiere abrir una cuenta de ahorros. Vive en Santiago y es diseñadora.",
    textoLeido: "This is a national ID card.\nNOMBRE  \nANA LUCIA FERREIRA DOS SANTOS\nCEDULA  \nE-8-145097  \nFECHA DE NACIMIENTO  \n05-09-1993  \nLUGAR DE NACIMIENTO  \nSAO PAULO, BRASIL  \nSEXO  \nF   B+  \nTIPO DE SANGRE  \nEXPEDIDA  \n19-08-2022  \nEXPIRA  \n19-08-2032",
    crudo: { nombre: "Ana Lucía Ferreira", producto: "cuenta de ahorros", domicilio: "Santiago", ocupacion: "diseñadora" },
  },
  {
    id: "gastada",
    boton: "4 · No se pudo leer la expiración",
    resumen: "El campo que más le importa al banco es el primero que el modelo pierde.",
    dictado: "José Castillero, cédula 4-155-8830, quiere abrir una cuenta de ahorros. Vive en David.",
    textoLeido: "Republic of Panama  \n\nTribal Electoral  \n\nCEDULA DE IDENTIDAD PERSONAL  \n\nNOMBRE  \n\nJOSE MIGUEL CASTILLERO PINZON  \n\nCEDula  \n\n4-155-8830  \n\nFECA DE NACIMIENTO  \n\n23-01-1966  \n\nLUARDE DE NACIMIENTO  \n\nDAVID, CHIRIQUI  \n\nSEXO  \n\nM  \n\nTIPO DE SANGRE  \n\nEXPEDIDA  \n\n08-10-2019  \n\nEXPIRA  \n\nNO ES UNA CEDula REAL",
    crudo: { nombre: "José Castillero", producto: "cuenta de ahorros", domicilio: "David", ocupacion: "" },
  },
];
