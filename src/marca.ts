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

/**
 * Las variables que hay que pegarle al documento.
 *
 * Se escriben ENCIMA de las de la base, en el mismo `:root`. Por eso cambiar
 * la identidad del producto son estas lineas y no una caceria por trescientos
 * archivos.
 */
export function cssDeMarca(): string {
  const linea = (c: ColoresDeMarca): string =>
    [
      `--neron-marca: ${c.marca};`,
      `--neron-marca-fuerte: ${c.marcaFuerte};`,
      `--neron-marca-tenue: ${c.marcaTenue};`,
      `--neron-sobre-marca: ${c.sobreMarca};`,
    ].join('\n  ');

  return [
    ':root, [data-tema="claro"] {',
    `  ${linea(MARCA_CLARO)}`,
    '}',
    '[data-tema="oscuro"] {',
    `  ${linea(MARCA_OSCURO)}`,
    '}',
    '',
  ].join('\n');
}

/** El nombre del centro. Vive aqui hasta que Configuracion lo administre. */
export const NOMBRE_DEL_PRODUCTO = 'Centro Holístico';
export const LEMA = 'Bienestar & Terapias';
