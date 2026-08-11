/**
 * LOS CIMIENTOS VISUALES — lo que gobierna las ocho pantallas.
 *
 * DE DONDE SALEN ESTOS NUMEROS: de medir las capturas de diseño, no de gusto.
 * Las ocho comparten un mismo lenguaje —el mismo radio, la misma sombra, el
 * mismo aire— y por eso vive aqui una sola vez en vez de repetido ocho veces
 * con ocho valores parecidos pero distintos. Ese fue justo el error de la
 * primera version: cada modulo se escribio su propia tarjeta y ninguna acabo
 * igual a la de al lado.
 *
 * LOS TOKENS DE LA BASE SE RESPETAN, y aqui solo se AFINAN los que el diseño
 * del Centro pide distintos:
 *
 *   · el borde de la base es visible a proposito —sirve para formularios—
 *     pero el diseño usa uno casi invisible en las tarjetas;
 *   · el radio de tarjeta del diseño es mas amplio que el de sistema;
 *   · la sombra es mas baja y mas suave, apenas para despegar del fondo.
 *
 * Se afinan con variables NUEVAS, no pisando las de la base: pisar `--neron-borde`
 * cambiaria tambien el borde de los campos de la base, y de pronto los
 * formularios se verian sin marco sin que nadie entienda por que.
 */

const v = (nombre: string): string => `var(--neron-${nombre})`;

export function cimientos(): string {
  return `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body {
  background: ${v('fondo')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-normal')};
  line-height: ${v('interlinea-normal')};
  -webkit-font-smoothing: antialiased;
  /* NUNCA scroll horizontal en toda la aplicacion. Si algo no cabe, se
     resuelve dentro de ese componente, no empujando la pagina entera. */
  overflow-x: hidden;
}
#raiz { min-height: 100%; }

/* ---------------------------------------------------------------- */
/* LO QUE EL DISEÑO DEL CENTRO PIDE DISTINTO                         */
/* ---------------------------------------------------------------- */
:root {
  /* El borde de una tarjeta: se INTUYE, no se ve. El de la base sigue
     sirviendo para campos y botones, donde si tiene que verse. */
  --centro-borde-tarjeta: color-mix(in srgb, ${v('borde-suave')} 55%, transparent);
  --centro-borde-tenue:   color-mix(in srgb, ${v('borde-suave')} 35%, transparent);

  /* Tres radios y ninguno mas. Cada radio adicional es una decision que
     alguien tiene que tomar cien veces al dia. */
  --centro-radio-pastilla: 999px;
  --centro-radio-control: 12px;
  --centro-radio-tarjeta: 18px;

  /* La sombra apenas despega del fondo: en el diseño las tarjetas no flotan,
     se apoyan. Una sombra fuerte hace que ocho tarjetas juntas se vean sucias. */
  --centro-sombra: 0 1px 2px color-mix(in srgb, ${v('texto')} 5%, transparent);
  --centro-sombra-alta: 0 6px 20px color-mix(in srgb, ${v('texto')} 9%, transparent);

  /* El ancho de la barra lateral, en un solo lugar: lo usan la barra, el velo
     y el contenido. Tres numeros sueltos se desincronizan al primer ajuste. */
  --centro-lateral: 260px;

  /*
   * EL VELO DE LO QUE FLOTA ENCIMA — mas suave que el de la base.
   *
   * El de la base tapa al 45% en claro y al 66% en oscuro. Es correcto para un
   * sistema que no puede suponer nada del fondo, pero en el Centro se veia como
   * una plancha negra: lo de atras desaparecia y el modal quedaba flotando en
   * un agujero. El diseño enseña lo contrario — lo de atras se sigue viendo,
   * apenas apagado y desenfocado, para que se entienda que sigue ahi.
   *
   * SE DERIVA DEL VELO DE LA BASE, no se escribe otro color: asi hereda el
   * valor que le toca a cada tema —en oscuro hace falta tapar mas— y no hay dos
   * decisiones de color que se puedan desincronizar.
   */
  --centro-velo: color-mix(in srgb, ${v('velo')} 58%, transparent);
}

/* ---------------------------------------------------------------- */
/* TIPOGRAFIA DE PANTALLA                                            */
/* ---------------------------------------------------------------- */
/*
 * Tres tamaños de titulo, y cada uno tiene un trabajo:
 *   pagina   el nombre de la pantalla, una vez y arriba
 *   tarjeta  el titulo de una tarjeta
 *   dato     una cifra grande
 * En la primera version cada modulo escogia el suyo y acabaron conviviendo
 * cuatro tamaños de titulo de tarjeta en la misma pantalla.
 */
.tt-pagina {
  margin: 0;
  font-size: ${v('texto-titulo-grande')};
  font-weight: ${v('peso-fuerte')};
  letter-spacing: -0.02em;
  color: ${v('texto')};
}
.tt-lema {
  margin: 0;
  color: ${v('texto-suave')};
  font-size: ${v('texto-chico')};
}
/*
 * EL TITULO DE UNA TARJETA. Y AQUI VA LA LECCION MAS CARA DEL REPASO VISUAL.
 *
 * Tenia flex-grow para que, dentro de la cabecera, empujara el enlace de "Ver
 * todos" hasta la derecha. La cabecera es una FILA, asi que ahi crecer
 * significa crecer a lo ancho — correcto.
 *
 * Pero muchas tarjetas llevan el titulo suelto, sin cabecera, y una tarjeta es
 * una COLUMNA: ahi crecer significa crecer a lo ALTO. El titulo de "Ultimas
 * ventas del dia" medía ciento sesenta y dos pixeles de alto, se comia todo el
 * hueco sobrante de la tarjeta y empujaba la lista hasta el fondo. Esa —y no
 * el diseño— es la mitad del "hay mucho espacio en blanco en ventas".
 *
 * Crecer es cosa del sitio donde esta, no del texto. Se movio a la regla
 * ".pz-cabecera .tt-tarjeta", que es el unico lugar donde hace falta.
 */
.tt-tarjeta {
  margin: 0;
  font-size: ${v('texto-normal')};
  font-weight: ${v('peso-fuerte')};
  color: ${v('texto')};
  letter-spacing: -0.01em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tt-dato {
  font-size: ${v('texto-titulo')};
  font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.tt-etiqueta {
  font-size: ${v('texto-chico')};
  color: ${v('texto-suave')};
}
.tt-pie {
  font-size: ${v('texto-micro')};
  color: ${v('texto-tenue')};
}
.tt-secundario { color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }
.tt-falta { color: ${v('texto-tenue')}; font-size: ${v('texto-micro')}; }

/* Lo escrito por alguien conserva sus renglones y NO desborda: un parrafo sin
   espacios estiraria la columna y sacaria scroll horizontal a toda la pagina. */
.tt-libre {
  margin: 0;
  font-size: ${v('texto-chico')};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
`;
}
