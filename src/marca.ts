/**
 * La identidad visual del Centro Holistico.
 *
 * Esto es TODO lo que cambia entre un producto NERON y otro: cuatro colores
 * por tema. La paleta neutra, los tamaños, los espacios, las sombras y la
 * formula de contraste vienen de la base y no se tocan.
 *
 * LOS VERDES NO SE ESCOGIERON A OJO. Cada uno paso la prueba de contraste
 * antes de entrar, y hay una prueba que vuelve a comprobarlo en cada
 * publicacion. Un verde bonito que no se lee con el sol encima —que es como
 * se ve la pantalla del mostrador a mediodia— no sirve, por muy de la marca
 * que sea.
 *
 * El primer candidato era `#5a8a4a`, mas cerca del verde del diseño. Se cayo
 * en 4.06:1 contra el blanco, debajo del minimo de 4.5. Se bajo el tono hasta
 * `#4a7c3f`, que da 4.95:1 y se ve practicamente igual.
 */

export interface ColoresDeMarca {
  readonly marca: string;
  readonly marcaFuerte: string;
  readonly marcaTenue: string;
  readonly sobreMarca: string;
}

/** El verde del Centro en tema claro. */
export const MARCA_CLARO: ColoresDeMarca = {
  marca: '#4a7c3f',
  marcaFuerte: '#3b6532',
  marcaTenue: '#eaf3e3',
  sobreMarca: '#ffffff',
};

/**
 * El mismo verde en oscuro, mas claro a proposito.
 *
 * No es el mismo color con otro brillo: sobre fondo oscuro, un verde oscuro
 * desaparece. Se invierte la relacion — el color se aclara y lo que va encima
 * se oscurece.
 */
export const MARCA_OSCURO: ColoresDeMarca = {
  marca: '#8fd47a',
  marcaFuerte: '#a8e096',
  marcaTenue: '#1e2f19',
  sobreMarca: '#0a1a06',
};

/* ------------------------------------------------------------------ */
/* LOS TONOS DE CATEGORIA — para DISTINGUIR, no para decorar           */
/* ------------------------------------------------------------------ */

/**
 * Cuatro tonos que separan las tarjetas de Inicio de un vistazo.
 *
 * POR QUE EXISTEN Y POR QUE SON SOLO CUATRO. El tablero pone cuatro cifras de
 * naturaleza distinta una junto a otra —citas, dinero, inventario, cursos—.
 * Todas del mismo color se leen como una sola lista y hay que detenerse a leer
 * cada etiqueta. Un tono por familia deja encontrar la que se busca sin leer.
 *
 * NO SON SEMANTICOS. No significan bien ni mal: para eso estan `exito`,
 * `advertencia` y `peligro` de la base, y usarlos aqui pintaria de rojo una
 * tarjeta que solo cuenta cursos. Estos solo separan.
 *
 * LOS CUATRO PASARON LA MISMA PRUEBA DE CONTRASTE QUE EL VERDE, en los dos
 * temas: el icono blanco sobre el cuadro de color, y el texto de la tarjeta
 * sobre el fondo tenue. Hay una prueba que lo vuelve a comprobar en cada
 * publicacion — igual que con el verde, que se cayo en el primer intento.
 *
 * El icono en oscuro NO es el `sobreMarca` verde: es un neutro casi negro. El
 * verde oscuro de la marca sobre un cuadro violeta se ve sucio.
 */
export type Categoria = 'citas' | 'ventas' | 'productos' | 'cursos' | 'visitas';

export interface TonoDeCategoria {
  /** El cuadro del icono. Solido, como en el diseño. */
  readonly tono: string;
  /** Lo que va ENCIMA del cuadro. */
  readonly sobreTono: string;
  /** El fondo de la tarjeta entera: el mismo tono, apenas insinuado. */
  readonly tenue: string;
}

export const CATEGORIAS_CLARO: Readonly<Record<Categoria, TonoDeCategoria>> = {
  // Citas usa el verde del Centro: es la tarjeta principal del dia.
  citas: { tono: '#4a7c3f', sobreTono: '#ffffff', tenue: '#eaf3e3' },
  ventas: { tono: '#6b46c1', sobreTono: '#ffffff', tenue: '#efe9fb' },
  productos: { tono: '#b45309', sobreTono: '#ffffff', tenue: '#fbf0e2' },
  cursos: { tono: '#1d6fa5', sobreTono: '#ffffff', tenue: '#e6f1f8' },
  visitas: { tono: '#0f766e', sobreTono: '#ffffff', tenue: '#e2f2f0' },
};

export const CATEGORIAS_OSCURO: Readonly<Record<Categoria, TonoDeCategoria>> = {
  citas: { tono: '#8fd47a', sobreTono: '#16150f', tenue: '#1e2f19' },
  ventas: { tono: '#c3a5f7', sobreTono: '#16150f', tenue: '#241c33' },
  productos: { tono: '#f2bd7a', sobreTono: '#16150f', tenue: '#31240f' },
  cursos: { tono: '#82c8ee', sobreTono: '#16150f', tenue: '#152a35' },
  visitas: { tono: '#79d8cd', sobreTono: '#16150f', tenue: '#122b28' },
};

export const CATEGORIAS: readonly Categoria[] = [
  'citas', 'ventas', 'productos', 'cursos', 'visitas',
];

/**
 * Las variables que hay que pegarle al documento.
 *
 * Se escriben ENCIMA de las de la base, en el mismo `:root`. Por eso cambiar
 * la identidad del producto son estas lineas y no una caceria por trescientos
 * archivos.
 *
 * Los tonos de categoria van con el prefijo `--neron-cat-`: es un nombre
 * NUEVO, no pisa ninguna variable de la base. Inventar otro prefijo
 * —`--terapias-`— dejaria la mitad del sistema pintando con un juego de
 * variables y la otra mitad con el otro, y nadie entenderia por que un boton
 * no cambia de color.
 */
export function cssDeMarca(): string {
  const linea = (c: ColoresDeMarca): string =>
    [
      `--neron-marca: ${c.marca};`,
      `--neron-marca-fuerte: ${c.marcaFuerte};`,
      `--neron-marca-tenue: ${c.marcaTenue};`,
      `--neron-sobre-marca: ${c.sobreMarca};`,
    ].join('\n  ');

  const categorias = (mapa: Readonly<Record<Categoria, TonoDeCategoria>>): string =>
    CATEGORIAS.flatMap((c) => [
      `--neron-cat-${c}: ${mapa[c].tono};`,
      `--neron-cat-${c}-encima: ${mapa[c].sobreTono};`,
      `--neron-cat-${c}-tenue: ${mapa[c].tenue};`,
    ]).join('\n  ');

  return [
    ':root, [data-tema="claro"] {',
    `  ${linea(MARCA_CLARO)}`,
    `  ${categorias(CATEGORIAS_CLARO)}`,
    '}',
    '[data-tema="oscuro"] {',
    `  ${linea(MARCA_OSCURO)}`,
    `  ${categorias(CATEGORIAS_OSCURO)}`,
    '}',
    '',
  ].join('\n');
}

/** El nombre del centro. Vive aqui hasta que Configuracion lo administre. */
export const NOMBRE_DEL_PRODUCTO = 'Centro Holístico';
export const LEMA = 'Bienestar & Terapias';
