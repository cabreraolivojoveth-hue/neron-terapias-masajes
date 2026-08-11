/**
 * LAS PIEZAS COMPARTIDAS — una tarjeta, una pastilla, una cifra.
 *
 * ESTE ARCHIVO ES LA CORRECCION DEL ERROR MAS CARO DEL PROYECTO.
 *
 * La primera version dejo que cada modulo se escribiera lo suyo: Clientes tenia
 * `cli-panel`, Servicios copio y le puso `srv-`, Cursos copio otra vez con
 * `cur-`, y asi ocho veces. Cada copia se desvio un poco —un radio distinto, un
 * borde mas oscuro, dos pixeles mas de aire— y al final ninguna pantalla se
 * parecia a la de al lado ni al diseño.
 *
 * Ahora hay UNA tarjeta. Cambiarla cambia las ocho pantallas a la vez, que es
 * exactamente lo que se quiere de un sistema de diseño: si el diseño mueve el
 * radio, se mueve aqui y ya.
 *
 * NADA DE AQUI SABE DE NEGOCIO. Ni una clase se llama `venta` ni `paciente`:
 * son tarjetas, pastillas y renglones. Por eso sirven igual en las ocho.
 */

const v = (nombre: string): string => `var(--neron-${nombre})`;
const c = (nombre: string): string => `var(--centro-${nombre})`;

export function piezas(): string {
  return `
/* ================================================================ */
/* LA TARJETA                                                        */
/* ================================================================ */
.pz-tarjeta {
  display: flex;
  flex-direction: column;
  gap: ${v('espacio-4')};
  padding: ${v('espacio-5')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-tarjeta')};
  box-shadow: ${c('sombra')};
  min-width: 0;
}
.pz-tarjeta--apretada { padding: ${v('espacio-4')}; gap: ${v('espacio-3')}; }
.pz-tarjeta--limpia { padding: 0; overflow: hidden; }

.pz-cabecera {
  display: flex;
  align-items: center;
  gap: ${v('espacio-3')};
  min-width: 0;
}
/* AQUI —y solo aqui— el titulo crece: la cabecera es una fila, y crecer es lo
   que empuja el "Ver todos" hasta la derecha. Puesto en el propio titulo, en
   una tarjeta (que es una columna) crecia a lo ALTO y hundia el contenido. */
.pz-cabecera .tt-tarjeta { flex: 1; }
/*
 * Y CUANDO NO CABEN LOS DOS, se envuelve — no se corta el titulo.
 *
 * En el panel de trescientos cuarenta pixeles de Clientes, "Recordatorios de
 * seguimiento" salia como "Recordatorios de segui…" para dejarle sitio a un
 * boton de "Ver todos" que igual cabia debajo. El titulo dice de que es la
 * tarjeta: es lo ultimo que se recorta.
 */
.pz-cabecera { flex-wrap: wrap; }
.pz-cabecera .tt-tarjeta {
  flex: 1 1 60%;
  /* En dos lineas, no con puntos suspensivos: "Recordatorios de seguimiento"
     partido es legible; "Recordatorios de segui…" parece un error. */
  white-space: normal;
  overflow: visible;
}

/* El enlace de la esquina de una tarjeta: "Ver todos", "Ver calendario". */
.pz-enlace {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: ${v('espacio-1')};
  min-height: 32px;
  padding: 0 ${v('espacio-3')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-pastilla')};
  background: ${v('superficie')};
  color: ${v('texto-suave')};
  font-family: ${v('familia')};
  font-size: ${v('texto-micro')};
  cursor: pointer;
  white-space: nowrap;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              color ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              border-color ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.pz-enlace:hover:not(:disabled) {
  background: ${v('marca-tenue')};
  border-color: ${v('marca-tenue')};
  color: ${v('marca')};
}
.pz-enlace:disabled { opacity: 0.45; cursor: default; }
.pz-enlace:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
/* Sin marco: para el "Ver todos" que en el diseño va suelto, sin caja. */
.pz-enlace--pelado {
  border-color: transparent;
  background: transparent;
  color: ${v('marca')};
}

/* ================================================================ */
/* LOS BOTONES DE PANTALLA                                           */
/* ================================================================ */
.pz-boton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${v('espacio-2')};
  min-height: 42px;
  flex: none;
  padding: 0 ${v('espacio-4')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
  font-weight: ${v('peso-medio')};
  cursor: pointer;
  white-space: nowrap;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              border-color ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              box-shadow ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              transform ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.pz-boton:hover:not(:disabled) { background: ${v('superficie-tenue')}; }
.pz-boton:active:not(:disabled) { transform: translateY(1px); }
.pz-boton:disabled { opacity: 0.5; cursor: default; }
.pz-boton:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

.pz-boton--principal {
  background: ${v('marca')};
  border-color: ${v('marca')};
  color: ${v('sobre-marca')};
  box-shadow: ${c('sombra')};
}
.pz-boton--principal:hover:not(:disabled) {
  background: ${v('marca-fuerte')};
  border-color: ${v('marca-fuerte')};
}
.pz-boton--peligro { color: ${v('peligro')}; border-color: ${v('peligro-tenue')}; }
.pz-boton--peligro:hover:not(:disabled) { background: ${v('peligro-tenue')}; }
.pz-boton--ancho { width: 100%; }

/* ================================================================ */
/* LA PASTILLA DE ESTADO                                             */
/* ================================================================ */
/*
 * FONDO TINTADO, SIN BORDE, y el color NUNCA solo: al lado va siempre la
 * palabra. Quien no distingue el verde del ambar tiene que poder leer
 * "Confirmada" igual que todos.
 */
.pz-pastilla {
  display: inline-flex;
  align-items: center;
  gap: ${v('espacio-1')};
  flex: none;
  padding: 3px ${v('espacio-3')};
  border: none;
  border-radius: ${c('radio-pastilla')};
  background: ${v('superficie-tenue')};
  color: ${v('texto-suave')};
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-medio')};
  white-space: nowrap;
}
.pz-pastilla--exito       { background: ${v('exito-tenue')};       color: ${v('exito')}; }
.pz-pastilla--aviso       { background: ${v('advertencia-tenue')}; color: ${v('advertencia')}; }
.pz-pastilla--peligro     { background: ${v('peligro-tenue')};     color: ${v('peligro')}; }
.pz-pastilla--marca       { background: ${v('marca-tenue')};       color: ${v('marca')}; }
.pz-pastilla--citas       { background: ${v('cat-citas-tenue')};      color: ${v('cat-citas')}; }
.pz-pastilla--ventas      { background: ${v('cat-ventas-tenue')};     color: ${v('cat-ventas')}; }
.pz-pastilla--productos   { background: ${v('cat-productos-tenue')};  color: ${v('cat-productos')}; }
.pz-pastilla--cursos      { background: ${v('cat-cursos-tenue')};     color: ${v('cat-cursos')}; }
.pz-pastilla--visitas     { background: ${v('cat-visitas-tenue')};    color: ${v('cat-visitas')}; }

/* ================================================================ */
/* LA TARJETA DE CIFRA                                               */
/* ================================================================ */
/*
 * El cuadro del icono es SOLIDO y grande —48px— porque es lo que separa las
 * cuatro tarjetas de un vistazo. En la primera version era un cuadrito
 * desvaido y las cuatro se leian como una sola lista.
 */
.pz-cifras {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: ${v('espacio-4')};
  min-width: 0;
}
.pz-cifra {
  display: flex;
  align-items: flex-start;
  gap: ${v('espacio-4')};
  padding: ${v('espacio-5')};
  border: 1px solid ${c('borde-tenue')};
  border-radius: ${c('radio-tarjeta')};
  background: ${v('superficie-elevada')};
  min-width: 0;
  transition: transform ${v('movimiento-curva')} ${v('movimiento-pausado')},
              box-shadow ${v('movimiento-curva')} ${v('movimiento-pausado')};
}
.pz-cifra__icono {
  flex: none;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
}
.pz-cifra__texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pz-cifra__etiqueta { font-size: ${v('texto-chico')}; color: ${v('texto-suave')}; }
.pz-cifra__valor {
  font-size: ${v('texto-titulo')};
  font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.pz-cifra__pie {
  font-size: ${v('texto-micro')};
  display: inline-flex;
  align-items: center;
  gap: ${v('espacio-1')};
  min-height: 18px;
}
.pz-cifra__punto {
  width: 6px; height: 6px; border-radius: ${c('radio-pastilla')};
  flex: none;
  background: currentColor;
}

/* Cada familia con su tono: el cuadro solido, y la tarjeta apenas insinuada. */
.pz-cifra--citas     { background: ${v('cat-citas-tenue')}; }
.pz-cifra--citas     .pz-cifra__icono { background: ${v('cat-citas')};     color: ${v('cat-citas-encima')}; }
.pz-cifra--citas     .pz-cifra__pie   { color: ${v('cat-citas')}; }
.pz-cifra--ventas    { background: ${v('cat-ventas-tenue')}; }
.pz-cifra--ventas    .pz-cifra__icono { background: ${v('cat-ventas')};    color: ${v('cat-ventas-encima')}; }
.pz-cifra--ventas    .pz-cifra__pie   { color: ${v('cat-ventas')}; }
.pz-cifra--productos { background: ${v('cat-productos-tenue')}; }
.pz-cifra--productos .pz-cifra__icono { background: ${v('cat-productos')}; color: ${v('cat-productos-encima')}; }
.pz-cifra--productos .pz-cifra__pie   { color: ${v('cat-productos')}; }
.pz-cifra--cursos    { background: ${v('cat-cursos-tenue')}; }
.pz-cifra--cursos    .pz-cifra__icono { background: ${v('cat-cursos')};    color: ${v('cat-cursos-encima')}; }
.pz-cifra--cursos    .pz-cifra__pie   { color: ${v('cat-cursos')}; }
.pz-cifra--visitas   { background: ${v('cat-visitas-tenue')}; }
.pz-cifra--visitas   .pz-cifra__icono { background: ${v('cat-visitas')};   color: ${v('cat-visitas-encima')}; }
.pz-cifra--visitas   .pz-cifra__pie   { color: ${v('cat-visitas')}; }

/* ================================================================ */
/* EL RENGLON DE LISTA                                               */
/* ================================================================ */
.pz-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.pz-renglon {
  display: flex;
  align-items: center;
  gap: ${v('espacio-3')};
  width: 100%;
  padding: ${v('espacio-3')} ${v('espacio-2')};
  border: none;
  border-radius: ${c('radio-control')};
  background: transparent;
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
  text-align: left;
  cursor: pointer;
  min-width: 0;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.pz-renglon:hover { background: ${v('superficie-tenue')}; }
.pz-renglon:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }
.pz-renglon--quieto { cursor: default; }
.pz-renglon--quieto:hover { background: transparent; }

.pz-renglon__cuerpo { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pz-renglon__titulo {
  font-weight: ${v('peso-medio')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pz-renglon__pie {
  font-size: ${v('texto-micro')};
  color: ${v('texto-suave')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pz-renglon__flecha { flex: none; color: ${v('texto-tenue')}; display: flex; }

/* El circulo con iniciales. Es el sustituto HONESTO de la foto: el diseño
   enseña retratos, y la base de datos no guarda foto de paciente. Inventar una
   cara seria peor que una inicial. */
.pz-inicial {
  flex: none;
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${c('radio-pastilla')};
  background: ${v('marca-tenue')};
  color: ${v('marca')};
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-fuerte')};
}
.pz-inicial--chica { width: 30px; height: 30px; }

/* El cuadro de icono suave, para renglones y listas. */
.pz-ficha {
  flex: none;
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${c('radio-control')};
  background: ${v('superficie-tenue')};
  color: ${v('texto-suave')};
}
.pz-ficha--citas     { background: ${v('cat-citas-tenue')};     color: ${v('cat-citas')}; }
.pz-ficha--ventas    { background: ${v('cat-ventas-tenue')};    color: ${v('cat-ventas')}; }
.pz-ficha--productos { background: ${v('cat-productos-tenue')}; color: ${v('cat-productos')}; }
.pz-ficha--cursos    { background: ${v('cat-cursos-tenue')};    color: ${v('cat-cursos')}; }
.pz-ficha--visitas   { background: ${v('cat-visitas-tenue')};   color: ${v('cat-visitas')}; }

/* ================================================================ */
/* LA TABLA                                                          */
/* ================================================================ */
/*
 * EL MARCO SE MIDE A SI MISMO, no a la ventana.
 *
 * Una columna sobra o no segun lo ancha que sea LA TARJETA, no la pantalla: la
 * misma tabla de movimientos tiene ochocientos treinta pixeles con el panel de
 * caja abierto y mil doscientos sin el. Preguntandole a la ventana se
 * escondian columnas que si cabian, y se dejaban puestas otras que no.
 */
.pz-tabla__marco { overflow-x: auto; min-width: 0; container-type: inline-size; }
/*
 * La columna que se retira primero cuando no cabe. Se marca la MENOS decisiva
 * —quien capturo el movimiento, que ademas se ve al abrirlo— para que lo que
 * quede sirva para decidir. Antes no se retiraba ninguna y el resultado era
 * peor: la ultima columna salia cortada a la mitad contra el borde.
 */
@container (max-width: 940px) {
  .pz-tabla__opcional { display: none; }
}
.pz-tabla { width: 100%; border-collapse: collapse; font-size: ${v('texto-chico')}; }
.pz-tabla th {
  text-align: left;
  padding: 0 ${v('espacio-3')} ${v('espacio-3')};
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-medio')};
  color: ${v('texto-tenue')};
  border-bottom: 1px solid ${c('borde-tarjeta')};
  white-space: nowrap;
}
.pz-tabla td {
  padding: ${v('espacio-3')};
  border-bottom: 1px solid ${c('borde-tenue')};
  vertical-align: middle;
}
.pz-tabla tbody tr { transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')}; }
.pz-tabla tbody tr:hover { background: ${v('superficie-tenue')}; }
.pz-tabla tbody tr:last-child td { border-bottom: none; }
/*
 * UN RENGLON DENTRO DE UNA CELDA NO VUELVE A PONER SU AIRE.
 *
 * La celda ya trae doce pixeles arriba y abajo, y el renglon otros doce: las
 * filas de Clientes medían ochenta y siete pixeles de alto por sumar dos veces
 * el mismo margen. Seis clientes ocupaban lo que deberian ocupar nueve, y la
 * tabla se veia inflada sin que nada estuviera "mal" en ninguno de los dos.
 */
.pz-tabla td > .pz-renglon { padding-top: 0; padding-bottom: 0; }
.pz-tabla__numero { text-align: right; font-variant-numeric: ${v('cifra-numeros')}; white-space: nowrap; }
.pz-tabla__acciones { width: 56px; text-align: right; }
.pz-tabla__fila--marcada { background: ${v('marca-tenue')}; }

/* ================================================================ */
/* PESTAÑAS                                                          */
/* ================================================================ */
/* La subrayada, para las secciones grandes de una pantalla. */
.pz-pestanas {
  display: flex;
  gap: ${v('espacio-1')};
  border-bottom: 1px solid ${c('borde-tarjeta')};
  overflow-x: auto;
  min-width: 0;
}
.pz-pestana {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: ${v('espacio-2')};
  min-height: 42px;
  padding: 0 ${v('espacio-3')};
  border: none;
  background: transparent;
  color: ${v('texto-suave')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
  font-weight: ${v('peso-medio')};
  cursor: pointer;
  white-space: nowrap;
  transition: color ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.pz-pestana:hover { color: ${v('texto')}; }
.pz-pestana:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }
/* La puesta lleva color Y linea: solo con color, quien no distingue verde de
   gris no sabe cual esta escogida. */
.pz-pestana--puesta { color: ${v('marca')}; }
.pz-pestana::after {
  content: '';
  position: absolute;
  left: ${v('espacio-3')}; right: ${v('espacio-3')}; bottom: -1px;
  height: 2px;
  border-radius: ${c('radio-pastilla')};
  background: ${v('marca')};
  transform: scaleX(0);
  transform-origin: center;
  transition: transform ${v('movimiento-curva')} ${v('movimiento-normal')};
}
.pz-pestana--puesta::after { transform: scaleX(1); }

/* La segmentada, para escoger entre pocas opciones: Día / Semana / Mes. */
.pz-segmentos {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: ${v('superficie-tenue')};
  border-radius: ${c('radio-control')};
  min-width: 0;
}
.pz-segmento {
  flex: none;
  min-height: 34px;
  padding: 0 ${v('espacio-3')};
  border: none;
  border-radius: 9px;
  background: transparent;
  color: ${v('texto-suave')};
  font-family: ${v('familia')};
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-medio')};
  cursor: pointer;
  white-space: nowrap;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              color ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              box-shadow ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.pz-segmento--puesto {
  background: ${v('superficie-elevada')};
  color: ${v('texto')};
  box-shadow: ${c('sombra')};
}
.pz-segmento:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }

/* ================================================================ */
/* BUSCADOR                                                          */
/* ================================================================ */
/*
 * LA MISMA TRAMPA QUE EL TITULO, y por eso va explicada dos veces.
 *
 * Tenia "flex: 1 1 220px" para ocupar lo que sobre en una barra de filtros. En
 * una FILA, ese 220px es el ancho de partida — correcto. En una COLUMNA es el
 * ALTO: el buscador de cliente de Ventas medía doscientos veinte pixeles de
 * alto con un campo de cuarenta y dos flotando en medio.
 *
 * Con "flex: 1 1 auto" el tamaño de partida lo pone el contenido, que en fila
 * sigue creciendo hasta llenar y en columna mide lo que mide el campo. El
 * minimo de 220 se conserva como ancho, que es donde de verdad importaba.
 */
.pz-buscador {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: min(220px, 100%);
}
.pz-buscador__lupa {
  position: absolute; left: ${v('espacio-3')};
  display: flex; color: ${v('texto-tenue')}; pointer-events: none;
}
.pz-buscador__campo {
  width: 100%;
  min-height: 42px;
  padding: 0 ${v('espacio-4')} 0 40px;
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-pastilla')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
  transition: border-color ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              box-shadow ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.pz-buscador__campo::placeholder { color: ${v('texto-tenue')}; }
.pz-buscador__campo:focus {
  outline: none;
  border-color: ${v('marca')};
  box-shadow: 0 0 0 3px ${v('marca-tenue')};
}

/* ================================================================ */
/* ESTADOS: vacio, cargando, error                                   */
/* ================================================================ */
/*
 * EL ESTADO VACIO ES UNA NOTA, NO UNA PANTALLA.
 *
 * Con el aire de "espacio-8" arriba y abajo, "todavia no hay nada en el
 * carrito" ocupaba doscientos pixeles en medio de Ventas. Un hueco asi se lee
 * como que falta algo por cargar, no como una explicacion — y era parte del
 * blanco de sobra que se reclamo.
 */
.pz-vacio {
  display: flex; flex-direction: column; align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-5')} ${v('espacio-4')};
  text-align: center;
}
.pz-vacio--chico { padding: ${v('espacio-3')} ${v('espacio-3')}; gap: ${v('espacio-2')}; }
/* El de una pantalla entera si respira: ahi el hueco ES la pantalla. */
.pz-vacio--pantalla { padding: ${v('espacio-8')} ${v('espacio-4')}; }
.pz-vacio__icono {
  display: flex; align-items: center; justify-content: center;
  width: 52px; height: 52px;
  border-radius: ${c('radio-pastilla')};
  background: ${v('superficie-tenue')};
  color: ${v('texto-tenue')};
}
.pz-vacio--chico .pz-vacio__icono { width: 44px; height: 44px; }
.pz-vacio__titulo { margin: 0; font-weight: ${v('peso-fuerte')}; color: ${v('texto')}; }
.pz-vacio__texto {
  margin: 0; color: ${v('texto-suave')}; font-size: ${v('texto-chico')};
  max-width: 46ch;
}

.pz-error {
  display: flex; flex-direction: column; gap: ${v('espacio-2')}; align-items: flex-start;
  padding: ${v('espacio-3')} ${v('espacio-4')};
  border-left: 3px solid ${v('peligro')};
  border-radius: ${c('radio-control')};
  background: ${v('peligro-tenue')};
}
.pz-error__que { margin: 0; font-size: ${v('texto-chico')}; color: ${v('peligro')}; font-weight: ${v('peso-medio')}; }
.pz-error__detalle { margin: 0; font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; overflow-wrap: anywhere; }

.pz-cargando { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.pz-silueta {
  height: 44px;
  border-radius: ${c('radio-control')};
  background: linear-gradient(
    90deg,
    ${v('superficie-tenue')} 0%,
    color-mix(in srgb, ${v('superficie-tenue')} 55%, ${v('superficie')}) 50%,
    ${v('superficie-tenue')} 100%
  );
  background-size: 200% 100%;
  animation: pz-brillo 1.4s ease-in-out infinite;
}
.pz-silueta--alta { height: 92px; }
.pz-silueta--linea { height: 14px; }

/* ================================================================ */
/* EL PIE DE UNA LISTA: cuenta y paginas                             */
/* ================================================================ */
.pz-pie {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-3')};
  padding-top: ${v('espacio-3')};
  border-top: 1px solid ${c('borde-tenue')};
  font-size: ${v('texto-micro')};
  color: ${v('texto-suave')};
}
.pz-pie__cuenta { flex: 1; min-width: 0; }
.pz-paginas { display: flex; align-items: center; gap: ${v('espacio-1')}; }
.pz-pagina {
  min-width: 34px; min-height: 34px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: 10px;
  background: ${v('superficie')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-micro')};
  cursor: pointer;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.pz-pagina:hover:not(:disabled) { background: ${v('superficie-tenue')}; }
.pz-pagina:disabled { opacity: 0.4; cursor: default; }
.pz-pagina:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.pz-pagina--puesta {
  background: ${v('marca')}; border-color: ${v('marca')}; color: ${v('sobre-marca')};
}

/* ================================================================ */
/* REJILLAS DE PANTALLA                                              */
/* ================================================================ */
.pz-pantalla { display: flex; flex-direction: column; gap: ${v('espacio-5')}; min-width: 0; }
.pz-encabezado {
  display: flex; align-items: flex-start; gap: ${v('espacio-4')};
  flex-wrap: wrap; min-width: 0;
}
/*
 * LA MISMA TRAMPA DEL "flex-basis", POR TERCERA VEZ — y aqui costo 176 pixeles
 * en la primera pantalla del sistema.
 *
 * Tenia "flex: 1 1 240px" para repartirse el renglon con los botones de la
 * derecha. Eso vale dentro de "pz-encabezado", que es una FILA. Pero Inicio usa
 * esta pieza suelta, como hija directa de una COLUMNA — y ahi 240px no es el
 * ancho de partida sino el ALTO: el saludo medía 240 pixeles de alto con 64 de
 * texto adentro, y entre "¡Buenos días!" y las cuatro cifras quedaba un hueco
 * de 176 que no era aire, era espacio sobrante.
 *
 * Es exactamente lo que ya paso con el titulo de tarjeta y con el buscador, y
 * la medicina es la misma: el tamaño de partida lo pone el contenido, y los
 * 240 se conservan como MINIMO DE ANCHO, que es donde de verdad importaban.
 * Asi la pieza sirve igual en fila y en columna, y no hay que acordarse de
 * cual es cual.
 */
.pz-encabezado__texto {
  flex: 1 1 auto;
  min-width: min(240px, 100%);
  display: flex; flex-direction: column; gap: 2px;
}
/*
 * LA FILA DE ACCIONES TIENE QUE PODER ENCOGER. Con "flex: none" medía lo que
 * midieran sus botones y en un telefono se salia ciento ochenta pixeles por la
 * derecha: la pagina ENTERA se corria de lado, que es el defecto que mas se
 * siente y el que mas veces vuelve.
 *
 * El "max-width" no sobra: sin el, el minimo del buscador de adentro empuja al
 * contenedor por encima de su sitio aunque pueda envolver.
 */
.pz-encabezado__acciones {
  display: flex; align-items: center; gap: ${v('espacio-2')}; flex-wrap: wrap;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
}
/*
 * EL BUSCADOR DE UNA CABECERA NO SE COME EL RENGLON.
 *
 * Suelto crece con "flex: 1 1 auto" —correcto en una barra de filtros, donde
 * tiene que llenar lo que sobre— pero en la fila de acciones se tragaba todo el
 * hueco libre y empujaba el boton principal a un segundo renglon: en Caja,
 * "Nueva venta" salia debajo de todo lo demas con el renglon de arriba medio
 * vacio. Con un tope se reparte el sitio y los tres caben.
 */
.pz-encabezado__acciones .pz-buscador { flex: 0 1 320px; }

/* Cuerpo con panel lateral: la lista toma lo que sobra. */
.pz-cuerpo {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${v('espacio-4')};
  align-items: start;
  min-width: 0;
}
@media (min-width: 1180px) {
  .pz-cuerpo { grid-template-columns: minmax(0, 1fr) 340px; }
  /*
   * SIN NADA ESCOGIDO, LA LISTA SE LLEVA TODO.
   *
   * Reservar la columna de la ficha para una sola frase le quitaba
   * trescientos cuarenta pixeles a la tabla, y en Cursos las columnas ya no
   * cabian: el precio salia cortado. La rejilla se entera sola de que lo que
   * hay a la derecha es una pista y no una ficha; los cinco modulos no tienen
   * que avisar de nada.
   */
  .pz-cuerpo:has(> .pz-pista) { grid-template-columns: minmax(0, 1fr); }
}

/*
 * EL CUERPO DE TRES COLUMNAS: lista estrecha, ficha ancha, panel de apoyo.
 *
 * Es la forma de "maestro y detalle" que enseña el diseño de Clientes: la lista
 * a la izquierda no es el contenido de la pantalla, es el INDICE — lo que se
 * lee es la ficha de en medio. Por eso la lista es angosta y fija: una lista de
 * nombres no necesita mas de trescientos pixeles, y cada uno que se le da se le
 * quita a lo que de verdad se esta leyendo.
 *
 * SE DESARMA POR PARTES, no de golpe. Primero cae el panel de apoyo debajo
 * —es apoyo, aguanta ir abajo—, y solo en pantalla de telefono la lista se
 * pone encima de la ficha. Desarmarlo todo a la vez deja la ficha en una
 * columna de 300 en una laptop, que es donde mas se usa.
 */
.pz-cuerpo--maestro { grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1100px) {
  .pz-cuerpo--maestro { grid-template-columns: 300px minmax(0, 1fr); }
  /* El panel de apoyo cruza las dos de arriba cuando todavia no cabe al lado. */
  .pz-cuerpo--maestro > .pz-apoyo { grid-column: 1 / -1; }
}
@media (min-width: 1400px) {
  .pz-cuerpo--maestro { grid-template-columns: 300px minmax(0, 1fr) 320px; }
  .pz-cuerpo--maestro > .pz-apoyo { grid-column: auto; }
}
.pz-apoyo { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

/*
 * LA CABECERA DE UNA FICHA: el retrato, el nombre y lo de contacto.
 *
 * El nombre va en grande porque es lo que dice DE QUIEN es todo lo demas. En la
 * version de tabla el nombre era una celda mas, del mismo tamaño que un
 * telefono, y la pantalla no tenia sujeto.
 */
.pz-identidad {
  display: flex; align-items: flex-start; gap: ${v('espacio-4')};
  flex-wrap: wrap; min-width: 0;
}
.pz-identidad__cuerpo { flex: 1 1 auto; min-width: min(240px, 100%); display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.pz-identidad__nombre { display: flex; align-items: center; gap: ${v('espacio-3')}; flex-wrap: wrap; min-width: 0; }
.pz-identidad__contacto {
  display: flex; flex-direction: column; gap: ${v('espacio-1')};
  font-size: ${v('texto-chico')}; color: ${v('texto-suave')};
}
.pz-identidad__renglon { display: flex; align-items: center; gap: ${v('espacio-2')}; min-width: 0; }
.pz-identidad__renglon > svg { flex: none; color: ${v('texto-tenue')}; }

/* El retrato grande. Sigue siendo iniciales: la base no guarda foto. */
.pz-inicial--grande {
  width: 76px; height: 76px;
  border-radius: ${c('radio-tarjeta')};
  font-size: ${v('texto-titulo')};
}

/*
 * UNA REJILLA DE DATOS CON SU ETIQUETA, para las fichas de detalle.
 *
 * Se usa en el expediente de Clientes y sirve igual en la ficha de un servicio
 * o de un producto: son pares de "esto se llama asi" y "esto vale esto". Que
 * sea rejilla y no lista es lo que deja leer nueve datos sin bajar la vista.
 */
/*
 * El minimo son 160 y no 200 para que en la ficha de en medio quepan TRES
 * columnas, como en el diseño. Con 200 salian dos, y nueve datos en dos
 * columnas obligan a bajar la vista para leer la mitad de una persona.
 */
.pz-datos {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: ${v('espacio-4')} ${v('espacio-5')}; min-width: 0;
}

/* La tira que sustituye a la ficha vacia. */
.pz-pista {
  grid-column: 1 / -1;
  display: flex; align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-3')} ${v('espacio-4')};
  border: 1px dashed ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie-tenue')};
  color: ${v('texto-suave')};
  font-size: ${v('texto-chico')};
  min-width: 0;
}
.pz-pista__icono { flex: none; display: flex; color: ${v('texto-tenue')}; }
.pz-columna { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

/* Dos o tres tarjetas lado a lado que se apilan solas. */
.pz-dos {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: ${v('espacio-4')}; min-width: 0;
}
.pz-tres {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: ${v('espacio-4')}; min-width: 0;
}

/* Un dato con su etiqueta, uno encima del otro. */
.pz-dato { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pz-dato--renglon {
  flex-direction: row; align-items: baseline; justify-content: space-between;
  gap: ${v('espacio-3')};
}
.pz-dato__valor { font-size: ${v('texto-chico')}; overflow-wrap: anywhere; }

/* Totales alineados, para resúmenes de dinero. */
.pz-totales { margin: 0; display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.pz-totales > div {
  display: flex; justify-content: space-between; gap: ${v('espacio-3')};
  font-size: ${v('texto-chico')};
}
.pz-totales dt { color: ${v('texto-suave')}; }
.pz-totales dd { margin: 0; font-variant-numeric: ${v('cifra-numeros')}; }
.pz-totales__total {
  padding-top: ${v('espacio-2')};
  border-top: 1px solid ${c('borde-tenue')};
  font-size: ${v('texto-normal')};
  font-weight: ${v('peso-fuerte')};
}
.pz-totales__total dt { color: ${v('texto')}; }
.pz-resta { color: ${v('exito')}; }

/* ================================================================ */
/* LO QUE FALTABA PARA COMPLETAR EL JUEGO                            */
/* ================================================================ */
/* Una tarjeta que ES una lista: sin aire interior, la tabla llega al borde. */
.pz-tarjeta--lista { gap: ${v('espacio-3')}; }

/* Los filtros que se despliegan sobre una lista. */
.pz-filtros {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: ${v('espacio-3')}; align-items: end;
  padding: ${v('espacio-3')};
  background: ${v('superficie-tenue')};
  border-radius: ${c('radio-control')};
  min-width: 0;
  animation: mv-sube ${v('movimiento-instantaneo')} ${v('movimiento-curva')} backwards;
}

/* Un campo con su etiqueta encima. */
.pz-campo { display: flex; flex-direction: column; gap: ${v('espacio-1')}; min-width: 0; }
.pz-campo--bloque { width: 100%; }
.pz-campo select, .pz-campo input[type='date'] {
  min-height: 42px;
  padding: 0 ${v('espacio-3')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
}
.pz-campo select:focus-visible, .pz-campo input:focus-visible {
  outline: ${v('foco')}; outline-offset: 2px;
}
.pz-campo--corto select { min-height: 36px; font-size: ${v('texto-micro')}; }

/* El boton que solo lleva un icono: menu de acciones, quitar, cerrar. */
.pz-icono-boton {
  flex: none;
  width: 34px; height: 34px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 10px;
  background: transparent; color: ${v('texto-suave')};
  cursor: pointer;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              color ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.pz-icono-boton:hover { background: ${v('superficie-tenue')}; color: ${v('texto')}; }
.pz-icono-boton:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

/* El pie de un formulario: las salidas a la derecha. */
.pz-ficha__pie {
  display: flex; justify-content: flex-end; gap: ${v('espacio-2')}; flex-wrap: wrap;
  padding-top: ${v('espacio-2')};
}

.pz-paginas__actual {
  padding: 0 ${v('espacio-2')};
  font-variant-numeric: ${v('cifra-numeros')};
  color: ${v('texto-suave')};
}

/* Un nombre dentro de un renglon que ademas lleva a otro lado. */
.pz-renglon__enlace {
  color: ${v('marca')};
  background: none; border: none; padding: 0;
  font-family: ${v('familia')}; font-size: inherit;
  cursor: pointer; text-align: left;
  overflow-wrap: anywhere;
}
.pz-renglon__enlace:hover { text-decoration: underline; }
.pz-renglon__enlace:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

/* El boton de filtros cuando hay uno puesto: una lista de tres de veinte sin
   decir que hay filtro se lee como una lista vacia. */
.pz-boton--puesto {
  background: ${v('marca-tenue')};
  border-color: ${v('marca')};
  color: ${v('marca')};
}

.pz-tabla__marca { width: 36px; }


/* La fila de acciones rapidas: botones iguales que se reparten el ancho. */
.pz-acciones {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${v('espacio-3')}; min-width: 0;
}

/* La cuadricula de tarjetas, para catalogos con foto. */
.pz-cuadricula {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: ${v('espacio-4')}; min-width: 0;
}

/* ================================================================ */
/* EL MENU DE ACCIONES DE UN RENGLON                                 */
/* ================================================================ */
/*
 * VIVE AQUI Y NO EN LA HOJA DE UN MODULO, y esa es toda la leccion.
 *
 * Servicios, Cursos y Productos usaban un menu cuyas clases vivian en la hoja de
 * CLIENTES. El dia que esa hoja se limpio —porque Clientes ya no lo usaba— los
 * tres menus se quedaron sin estilo a la vez: texto pelon, sin caja, sin sombra,
 * encimado contra el borde de la tabla. Y no fallo nada: ni los tipos, ni las
 * catorce guardias, ni las mil doscientas pruebas. Se vio en una foto.
 *
 * Una pieza que usan tres modulos es una pieza COMPARTIDA. Aqui no se la puede
 * llevar la limpieza de nadie.
 */
.pz-menu { position: relative; display: inline-flex; flex: none; }

/* El tirador gira un poco al abrir: dice "yo abri esto". */
.pz-menu__tirador[aria-expanded='true'] {
  background: ${v('superficie-tenue')};
  color: ${v('texto')};
}

.pz-menu__panel {
  /*
   * FIJO A LA VENTANA, no colgado del tirador. El tirador vive dentro del marco
   * de la tabla, que lleva "overflow-x: auto" para que una tabla ancha se
   * desplace sin mover la pagina — y un contenedor que desplaza RECORTA, en los
   * dos ejes, aunque solo se le pida uno. En el ultimo renglon de la tabla, la
   * ultima opcion del menu salia cortada por la mitad; y la ultima opcion es la
   * de eliminar. El sitio exacto lo pone "menu.tsx" al abrir.
   */
  position: fixed;
  /*
   * Por encima del velo (40) y de la barra lateral (50) de la base. Si quedara
   * debajo, el menu simplemente no aparece — y se busca el error en el
   * componente, que esta bien.
   */
  z-index: 60;
  min-width: 210px;
  padding: ${v('espacio-1')};
  display: flex; flex-direction: column; gap: 2px;
  background: ${v('superficie-elevada')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-tarjeta')};
  box-shadow: ${c('sombra-alta')};
  /* Entra desde el tirador, que es de donde parece que sale. */
  transform-origin: top right;
  animation: mv-brota ${v('movimiento-instantaneo')} ${v('movimiento-curva')} backwards;
}
/* Si no cabe abajo se abre hacia arriba: un menu que se sale por el pie obliga a
   desplazar para leer la ultima opcion, que suele ser la de borrar. */
.pz-menu__panel--arriba { transform-origin: bottom right; }

.pz-menu__opcion {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  min-height: 40px;
  padding: 0 ${v('espacio-3')};
  border: none; border-radius: 10px;
  background: transparent; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  text-align: left; cursor: pointer; white-space: nowrap;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              color ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.pz-menu__opcion:hover { background: ${v('marca-tenue')}; color: ${v('marca')}; }
.pz-menu__opcion:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }
.pz-menu__icono { display: flex; flex: none; color: ${v('texto-tenue')}; }
.pz-menu__opcion:hover .pz-menu__icono { color: ${v('marca')}; }

/*
 * LA DE BORRAR VA EN ROJO Y SEPARADA. Pegada a "Editar" se aprieta por error, y
 * es la unica del menu que no se puede deshacer sola.
 */
.pz-menu__opcion--peligro {
  color: ${v('peligro')};
  margin-top: ${v('espacio-1')};
  padding-top: ${v('espacio-2')};
  border-top: 1px solid ${c('borde-tenue')};
  border-radius: 0 0 10px 10px;
}
.pz-menu__opcion--peligro .pz-menu__icono { color: ${v('peligro')}; }
.pz-menu__opcion--peligro:hover {
  background: ${v('peligro-tenue')};
  color: ${v('peligro')};
}
.pz-menu__opcion--peligro:hover .pz-menu__icono { color: ${v('peligro')}; }

/* ================================================================ */
/* LO QUE FLOTA ENCIMA: velos, modales y confirmaciones              */
/* ================================================================ */
/*
 * ESTAS REGLAS VALEN PARA TODO LO QUE SE ABRA, HOY Y MAÑANA, y por eso viven
 * aqui y no en el modulo que estreno el primer modal.
 *
 * Se le ponen al modal de la BASE —"neron-velo" y "neron-modal"— porque todo lo
 * que se abre en el producto pasa por ahi: "Modal", "Confirmacion", la ficha de
 * cliente, el formulario de servicio, las categorias. Vestir la pieza de la
 * base una vez viste los ocho modulos; vestir cada modal por separado es como
 * se acabo con ocho tarjetas distintas.
 *
 * QUE SE ARREGLO AQUI, Y COMO SE VEIA: el velo salia como una PLANCHA NEGRA
 * pegada en medio de la pantalla —sin tapar la barra lateral ni la de arriba— y
 * lo de atras desaparecia del todo. Eran dos fallos a la vez:
 *
 *   1. El velo quedaba encerrado en la caja del modulo. La causa no estaba en
 *      el modal sino en el relleno de las animaciones; esta contada completa en
 *      "movimiento.ts" y la vigila la guardia 13.
 *   2. Tapaba demasiado. Ahora usa el velo suave del Centro y desenfoca lo de
 *      atras en vez de borrarlo.
 */
.neron-velo {
  background: ${c('velo')};
  /*
   * El desenfoque es lo que hace que se lea como "esto esta encima" en vez de
   * "lo de atras se apago". Y es lo que permite tapar MENOS: con lo de atras
   * desenfocado, el texto de abajo ya no compite con el del modal aunque se
   * siga viendo.
   */
  backdrop-filter: blur(8px);
  animation: mv-aparece ${v('movimiento-instantaneo')} ${v('movimiento-curva')} backwards;
  /* En pantalla chica el modal se pega abajo, que es donde llega el pulgar. */
  padding: ${v('espacio-4')};
}

/*
 * EL DIALOGO SE VISTE COMO UNA TARJETA DEL CENTRO: el mismo radio y la misma
 * sombra que todo lo demas. Con el radio del sistema se notaba que era una
 * pieza prestada de otro juego.
 */
.neron-velo > [role='dialog'] {
  border-radius: ${c('radio-tarjeta')};
  box-shadow: ${c('sombra-alta')};
  /*
   * LA ENTRADA VA AQUI, EN LA CAJA, y antes no iba en ninguna parte.
   *
   * La regla apuntaba a ".neron-modal__caja" y a "[role=dialog] > *": la
   * primera clase no existe, y la segunda animaba por separado el encabezado,
   * el cuerpo y el pie — tres piezas entrando cada una por su lado dentro de
   * una caja que aparecia de golpe. Se apunta al elemento que de verdad lleva
   * el papel de dialogo, que es el que hay que animar.
   */
  animation: mv-resorte ${v('movimiento-normal')} ${v('movimiento-curva')} backwards;
}

@media (max-width: 640px) {
  /* Pegado abajo y a todo el ancho: es donde alcanza el pulgar en un telefono. */
  .neron-velo { align-items: flex-end; padding: 0; }
  .neron-velo > [role='dialog'] {
    max-width: none;
    border-radius: ${c('radio-tarjeta')} ${c('radio-tarjeta')} 0 0;
    animation-name: mv-sube;
  }
}
`;
}
