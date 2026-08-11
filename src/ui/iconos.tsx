/**
 * LOS ICONOS, en SVG y escritos aqui.
 *
 * Ni una biblioteca de iconos ni un archivo de imagenes. Las razones son las
 * mismas por las que la hoja de la marca ya vive en codigo: pesan unos cientos
 * de bytes, no piden un viaje mas al servidor, se ven nitidos en cualquier
 * pantalla y —lo que de verdad importa— TOMAN EL COLOR DE QUIEN LOS CONTIENE.
 * Con `currentColor` funcionan igual en tema claro y en oscuro sin tener dos
 * juegos de archivos que despues alguien olvida cambiar a la vez.
 *
 * Una biblioteca de iconos habria sido la dependencia mas pesada del producto
 * para usar quince dibujos.
 *
 * TODOS SON DECORACION. Van con `aria-hidden`: al lado siempre hay una
 * palabra escrita. Un icono anunciado a un lector de pantalla que ademas lee
 * la etiqueta de al lado dice la cosa dos veces.
 */

export type NombreDeIcono =
  | 'calendario'
  | 'dinero'
  | 'paquete'
  | 'birrete'
  | 'campana'
  | 'lupa'
  | 'flecha'
  | 'mas'
  | 'persona'
  | 'personaMas'
  | 'bolsa'
  | 'recibo'
  | 'salida'
  | 'barras'
  | 'reloj'
  | 'imagen'
  | 'alerta'
  | 'filtros'
  | 'lugar'
  | 'nota'
  | 'mensaje'
  | 'telefono'
  | 'sobre'
  | 'lapiz'
  | 'volver'
  | 'prohibido'
  | 'palomita'
  | 'personas'
  | 'estrella'
  | 'corazon'
  | 'pastel'
  | 'cuadricula'
  | 'renglones'
  | 'archivar'
  | 'puntos'
  | 'casa'
  | 'engrane'
  | 'flor'
  | 'moneda'
  | 'soporte'
  | 'carrito'
  | 'cajon';

/**
 * Todo en una rejilla de 24 y con trazo, no relleno.
 *
 * El trazo se ve igual de nitido en 18 que en 40 pixeles; un icono relleno se
 * emborrona al achicarlo y se ve tosco al agrandarlo.
 */
const TRAZOS: Readonly<Record<NombreDeIcono, string[]>> = {
  calendario: [
    'M8 2v4M16 2v4M3 10h18',
    'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  ],
  dinero: [
    'M12 2v20',
    'M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.8 5 3.4 5 1.5 5 3.6-2.2 3-5 3-5-1.1-5-3',
  ],
  paquete: ['M21 8l-9-5-9 5 9 5 9-5z', 'M3 8v8l9 5 9-5V8', 'M12 13v8'],
  birrete: ['M22 9l-10-5L2 9l10 5 10-5z', 'M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5'],
  campana: ['M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7', 'M13.7 20a2 2 0 0 1-3.4 0'],
  lupa: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4'],
  flecha: ['M9 5l7 7-7 7'],
  mas: ['M12 5v14M5 12h14'],
  persona: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  personaMas: [
    'M15 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M8.5 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    'M19 8v6M22 11h-6',
  ],
  bolsa: ['M6 2h12l2 5H4l2-5z', 'M4 7v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7', 'M9 11a3 3 0 0 0 6 0'],
  recibo: ['M6 2h12v20l-3-2-3 2-3-2-3 2V2z', 'M9 7h6M9 11h6M9 15h4'],
  salida: ['M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z', 'M12 8v8M8.5 12.5L12 16l3.5-3.5'],
  barras: ['M4 20V10M10 20V4M16 20v-7', 'M22 20H2'],
  reloj: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6.5V12l3.5 2'],
  imagen: [
    'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
    'M3 16l5-5 4 4 3-3 6 6',
  ],
  alerta: ['M12 3l9 16H3l9-16z', 'M12 9v5M12 17.4v.2'],
  filtros: ['M21 5h-7M10 5H3M21 12h-9M8 12H3M21 19h-5M12 19H3', 'M14 3v4M8 10v4M16 17v4'],
  lugar: [
    'M12 21.5s7-6.4 7-11.5a7 7 0 1 0-14 0c0 5.1 7 11.5 7 11.5z',
    'M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  ],
  nota: [
    'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M14 3v5h5',
    'M9 13h6M9 17h4',
  ],
  mensaje: ['M21 12a8 8 0 0 1-11.7 7.1L3 21l1.9-6.3A8 8 0 1 1 21 12z'],
  /* El telefono y el sobre: los dos rotulos de contacto de una ficha. Antes se
     usaba el globo de "mensaje" para las dos cosas, y un correo con globo de
     chat se lee como un mensaje enviado, no como una direccion. */
  telefono: [
    'M7.5 3.5h-2A2 2 0 0 0 3.5 5.7c.3 3.2 1.6 6.2 3.7 8.6a20 20 0 0 0 6 4.8 2 2 0 0 0 2.4-.4l1.4-1.4a1.3 1.3 0 0 0-.1-1.9l-2-1.6a1.3 1.3 0 0 0-1.6 0l-1 .8a15 15 0 0 1-4.3-4.3l.8-1a1.3 1.3 0 0 0 0-1.6l-1.6-2a1.3 1.3 0 0 0-.7-.4z',
  ],
  sobre: ['M3.5 6h17v12h-17z', 'M3.5 6.8 12 13l8.5-6.2'],
  lapiz: ['M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z', 'M14.5 5.5l3 3'],
  volver: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20 4v4h-4'],
  prohibido: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M5.5 5.5l13 13'],
  palomita: ['M20 6L9 17l-5-5'],
  personas: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  ],
  estrella: ['M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.6l6.5-.9z'],
  corazon: ['M12 20.5l-8-7.7a4.9 4.9 0 0 1 0-7 4.9 4.9 0 0 1 7 0l1 1 1-1a4.9 4.9 0 0 1 7 0 4.9 4.9 0 0 1 0 7z'],
  pastel: [
    'M4 20h16v-6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3z',
    'M8 11V8M12 11V7M16 11V8',
    'M8 5.5V5M12 4.5V4M16 5.5V5',
  ],
  cuadricula: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
  renglones: ['M4 6h16M4 12h16M4 18h16'],
  archivar: ['M3 4h18v4H3z', 'M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8', 'M10 12h4'],
  puntos: ['M12 5.5v.01M12 12v.01M12 18.5v.01'],
  casa: ['M3 10.6 12 3.5l9 7.1', 'M5.5 9.6V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.6'],
  engrane: [
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
    'M19.1 13.9a1.4 1.4 0 0 0 .3 1.5l.1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.4 1.4 0 0 0-1.5-.3 1.4 1.4 0 0 0-.9 1.3v.2a1.7 1.7 0 1 1-3.4 0v-.1a1.4 1.4 0 0 0-.9-1.3 1.4 1.4 0 0 0-1.5.3l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.4 1.4 0 0 0 .3-1.5 1.4 1.4 0 0 0-1.3-.9h-.2a1.7 1.7 0 1 1 0-3.4h.1a1.4 1.4 0 0 0 1.3-.9 1.4 1.4 0 0 0-.3-1.5l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.4 1.4 0 0 0 1.5.3h.1a1.4 1.4 0 0 0 .9-1.3v-.2a1.7 1.7 0 1 1 3.4 0v.1a1.4 1.4 0 0 0 .9 1.3 1.4 1.4 0 0 0 1.5-.3l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.4 1.4 0 0 0-.3 1.5v.1a1.4 1.4 0 0 0 1.3.9h.2a1.7 1.7 0 1 1 0 3.4h-.1a1.4 1.4 0 0 0-1.3.9z',
  ],
  /* La flor de loto de la marca, reducida a tres trazos. */
  flor: [
    'M12 4.2c1.7 1.7 2.5 3.5 2.5 5.4 0 1.7-.8 3.2-2.5 4.4-1.7-1.2-2.5-2.7-2.5-4.4 0-1.9.8-3.7 2.5-5.4z',
    'M4.4 11.9c2.3-.4 4.2.1 5.6 1.5 1.1 1.1 1.7 2.5 1.9 4.2-2.3.4-4.2-.1-5.6-1.5-1.1-1.1-1.7-2.5-1.9-4.2z',
    'M19.6 11.9c-.2 1.7-.8 3.1-1.9 4.2-1.4 1.4-3.3 1.9-5.6 1.5.2-1.7.8-3.1 1.9-4.2 1.4-1.4 3.3-1.9 5.6-1.5z',
  ],
  moneda: [
    'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19z',
    'M14.6 9.3a2.7 2.7 0 0 0-2.6-1.6c-1.4 0-2.6 1-2.6 2.2s1.2 2.2 2.6 2.2 2.6 1 2.6 2.2-1.2 2.2-2.6 2.2a2.7 2.7 0 0 1-2.6-1.6',
    'M12 6.2v11.6',
  ],
  soporte: [
    'M4.5 14.5v-2.2a7.5 7.5 0 0 1 15 0v2.2',
    'M4.5 13.5h1.2a1 1 0 0 1 1 1v2.6a1 1 0 0 1-1 1H5.6a1.1 1.1 0 0 1-1.1-1.1z',
    'M19.5 13.5h-1.2a1 1 0 0 0-1 1v2.6a1 1 0 0 0 1 1h.1a1.1 1.1 0 0 0 1.1-1.1z',
    'M17.3 18.2v.4a2.4 2.4 0 0 1-2.4 2.4h-1.7',
  ],
  carrito: [
    'M2.8 3.5h2.1l2.2 10.2a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.2l1.4-6.1H6',
    'M9.2 19.4v.01M17 19.4v.01',
  ],
  cajon: [
    'M3.2 8.4h17.6v10.2a1.4 1.4 0 0 1-1.4 1.4H4.6a1.4 1.4 0 0 1-1.4-1.4z',
    'M3.2 8.4 5.4 4.2h13.2l2.2 4.2',
    'M9.6 12.4h4.8',
  ],
};

export function Icono({
  nombre,
  lado = 20,
}: {
  readonly nombre: NombreDeIcono;
  readonly lado?: number;
}) {
  return (
    <svg
      className="ini-icono"
      width={lado}
      height={lado}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRAZOS[nombre].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
