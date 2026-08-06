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
  | 'alerta';

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
