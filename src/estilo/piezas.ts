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
.pz-tabla__marco { overflow-x: auto; min-width: 0; }
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
.pz-buscador { position: relative; display: flex; align-items: center; flex: 1 1 220px; min-width: 0; }
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
.pz-vacio {
  display: flex; flex-direction: column; align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-8')} ${v('espacio-4')};
  text-align: center;
}
.pz-vacio--chico { padding: ${v('espacio-5')} ${v('espacio-3')}; }
.pz-vacio__icono {
  display: flex; align-items: center; justify-content: center;
  width: 56px; height: 56px;
  border-radius: ${c('radio-pastilla')};
  background: ${v('superficie-tenue')};
  color: ${v('texto-tenue')};
}
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
.pz-encabezado__texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pz-encabezado__acciones {
  display: flex; align-items: center; gap: ${v('espacio-2')}; flex-wrap: wrap; flex: none;
}

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
}
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
  animation: mv-sube ${v('movimiento-instantaneo')} ${v('movimiento-curva')} both;
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
`;
}
