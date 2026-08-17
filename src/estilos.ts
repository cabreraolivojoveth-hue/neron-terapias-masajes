/**
 * LA HOJA DE ESTILOS DEL PRODUCTO, ARMADA POR CAPAS.
 *
 * El orden importa y es este:
 *
 *   1. cimientos    los tokens del Centro y la tipografia de pantalla
 *   2. piezas       la tarjeta, la pastilla, la cifra — lo COMPARTIDO
 *   3. armadura     la barra lateral y la barra superior
 *   4. movimiento   las animaciones, y su apagado para quien lo pida
 *   5. lo de abajo  lo que todavia es propio de un modulo concreto
 *
 * POR QUE ESTA PARTIDO ASI, que es la leccion cara de este proyecto: la
 * primera version era un solo archivo donde cada modulo se escribia su propia
 * tarjeta. Ocho tarjetas parecidas y ninguna igual — ni entre ellas ni al
 * diseño. Ahora lo compartido vive en `piezas` y cambiarlo cambia las ocho
 * pantallas a la vez.
 *
 * NI UN COLOR ESCRITO A MANO. Todo sale de las variables, incluidas las de
 * marca que pone `marca.ts` encima. Hay una prueba que lo vigila.
 */

import { armadura } from './estilo/armadura.js';
import { cimientos } from './estilo/cimientos.js';
import { movimiento } from './estilo/movimiento.js';
import { piezas } from './estilo/piezas.js';

const v = (nombre: string): string => `var(--neron-${nombre})`;
const c = (nombre: string): string => `var(--centro-${nombre})`;

export function estilosDelProducto(): string {
  return [cimientos(), piezas(), armadura(), movimiento(), loQueTodaviaEsDeUnModulo()].join('\n');
}

function loQueTodaviaEsDeUnModulo(): string {
  return `

/* ================================================================ */
/* LAS PASTILLAS DEL NEGOCIO                                        */
/* ================================================================ */
/*
 * La pastilla compartida trae los tonos NEUTROS —exito, aviso, peligro—. Aqui
 * se dice que estado del negocio usa cual, que si es propio del producto: la
 * base no sabe que una cita puede estar "pendiente".
 *
 * Y CADA UNA LLEVA SU PALABRA. El color es la segunda señal, nunca la unica:
 * quien no distingue el verde del ambar tiene que poder leer "Confirmada".
 */
.pz-pastilla--confirmada { background: ${v('exito-tenue')};       color: ${v('exito')}; }
.pz-pastilla--completada { background: ${v('cat-cursos-tenue')};  color: ${v('cat-cursos')}; }
.pz-pastilla--pendiente  { background: ${v('advertencia-tenue')}; color: ${v('advertencia')}; }
.pz-pastilla--cancelada  { background: ${v('peligro-tenue')};     color: ${v('peligro')}; }
.pz-pastilla--no_asistio { background: ${v('peligro-tenue')};     color: ${v('peligro')}; }
.pz-pastilla--cobrada    { background: ${v('exito-tenue')};       color: ${v('exito')}; }
.pz-pastilla--borrador   { background: ${v('superficie-tenue')};  color: ${v('texto-suave')}; }
.pz-pastilla--abierta    { background: ${v('exito-tenue')};       color: ${v('exito')}; }
.pz-pastilla--cerrada    { background: ${v('superficie-tenue')};  color: ${v('texto-suave')}; }
.pz-pastilla--activo     { background: ${v('exito-tenue')};       color: ${v('exito')}; }
.pz-pastilla--inactivo   { background: ${v('superficie-tenue')};  color: ${v('texto-suave')}; }
.pz-pastilla--archivado  { background: ${v('advertencia-tenue')}; color: ${v('advertencia')}; }
.pz-pastilla--proximo    { background: ${v('cat-cursos-tenue')};  color: ${v('cat-cursos')}; }
.pz-pastilla--finalizado { background: ${v('superficie-tenue')};  color: ${v('texto-suave')}; }
.pz-pastilla--disponible { background: ${v('exito-tenue')};       color: ${v('exito')}; }
.pz-pastilla--bajo       { background: ${v('advertencia-tenue')}; color: ${v('advertencia')}; }
.pz-pastilla--agotado    { background: ${v('peligro-tenue')};     color: ${v('peligro')}; }


.terapias-hoja { color: ${v('marca')}; flex: none; }
/* El logo del centro, cuando subieron uno. Cuadrado y recortado: un logo
   apaisado estiraria la barra lateral y uno alto la partiria. */
.terapias-marca__logo {
  width: 32px; height: 32px; flex: none;
  object-fit: contain; border-radius: ${v('radio-sistema')};
}

.terapias-marca { display: flex; align-items: center; gap: ${v('espacio-2')}; min-width: 0; }
.terapias-marca__texto { display: flex; flex-direction: column; min-width: 0; }
.terapias-marca__nombre {
  font-weight: ${v('peso-fuerte')};
  color: ${v('texto')};
  font-size: ${v('texto-normal')};
  /* El min-width cero de arriba mas esto: un nombre largo se recorta con
     puntos suspensivos en vez de empujar la barra lateral y romper el ancho. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.terapias-marca__lema {
  color: ${v('texto-tenue')};
  font-size: ${v('texto-micro')};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------------------------------------------------------- */
/* Pantallas de estado: entrar, avisos, cargando                     */
/* ---------------------------------------------------------------- */
.terapias-entrar, .terapias-aviso {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Respeta el notch del celular. Sin esto, en un iPhone la caja se mete
     debajo de la barra de gestos. */
  padding: max(${v('espacio-4')}, env(safe-area-inset-top)) ${v('espacio-4')}
           max(${v('espacio-4')}, env(safe-area-inset-bottom));
  background: ${v('fondo')};
}
.terapias-entrar__caja, .terapias-aviso__caja {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: ${v('espacio-4')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-tarjeta')};
  box-shadow: ${v('sombra-sutil')};
  padding: ${v('espacio-6')};
}
.terapias-entrar__marca { display: flex; align-items: center; gap: ${v('espacio-3')}; }
.terapias-entrar__titulo, .terapias-aviso__titulo {
  margin: 0;
  font-size: ${v('texto-titulo')};
  font-weight: ${v('peso-fuerte')};
  color: ${v('texto')};
  /* Nombres largos parten en varias lineas en vez de salirse de la caja. */
  overflow-wrap: anywhere;
}
.terapias-entrar__lema { margin: 0; color: ${v('texto-suave')}; font-size: ${v('texto-chico')}; }
.terapias-entrar__error {
  margin: 0;
  color: ${v('peligro')};
  font-size: ${v('texto-chico')};
  /* El color no va solo: tambien lleva borde y fondo, para quien no lo
     distingue y para quien mira con el sol encima. */
  border-left: 3px solid ${v('peligro')};
  background: ${v('peligro-tenue')};
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border-radius: ${v('radio-sistema')};
}
.terapias-aviso__caja { max-width: 460px; text-align: left; align-items: flex-start; }
.terapias-aviso__texto { color: ${v('texto-suave')}; font-size: ${v('texto-chico')}; }
.terapias-aviso__texto p { margin: 0 0 ${v('espacio-3')}; }
.terapias-aviso__texto p:last-child { margin-bottom: 0; }
.terapias-aviso__texto code {
  font-family: ${v('familia-numeros')};
  background: ${v('superficie-tenue')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  padding: 0 ${v('espacio-1')};
  /* Una variable de entorno larga no debe romper la caja. */
  overflow-wrap: anywhere;
}

.terapias-cargando {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: ${v('espacio-4')};
  padding: ${v('espacio-6')};
  background: ${v('fondo')};
}
/**
 * La silueta que respira.
 *
 * Se apaga sola con "prefiere menos movimiento": para algunas personas la
 * animacion continua no es un detalle bonito, es un mareo.
 */
.terapias-silueta {
  background: ${v('superficie-tenue')};
  border-radius: ${v('radio-sistema')};
  animation: terapias-respira 1.4s ease-in-out infinite;
}
.terapias-silueta--barra { height: 48px; max-width: 320px; }
.terapias-silueta--bloque { flex: 1; min-height: 200px; }
@keyframes terapias-respira { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) {
  .terapias-silueta { animation: none; }
}

/* ---------------------------------------------------------------- */
/* AGENDA                                                            */
/* ---------------------------------------------------------------- */
.agenda { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }
.agenda-encabezado { display: flex; align-items: center; gap: ${v('espacio-3')}; min-width: 0; }
.agenda-encabezado__icono { display: flex; flex: none; color: ${v('marca')}; }
.agenda-encabezado__texto { min-width: 0; }
.agenda-encabezado__titulo { margin: 0; font-size: ${v('texto-titulo-grande')}; font-weight: ${v('peso-fuerte')}; }
.agenda-encabezado__lema { margin: 0; color: ${v('texto-suave')}; font-size: ${v('texto-chico')}; }

/* ---------------------------------------------------------------- */
/* La barra de controles                                             */
/* ---------------------------------------------------------------- */
.agenda-barra {
  display: flex;
  align-items: center;
  /* Se envuelven solos: en una laptop de 1280 caben en una linea, en tableta
     en dos, y en celular en tres. Sin esto empujarian el ancho de la pagina. */
  flex-wrap: wrap;
  gap: ${v('espacio-2')};
  padding: ${v('espacio-3')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-tarjeta')};
  min-width: 0;
}
.agenda-barra__nueva {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  min-height: 44px; flex: none;
  padding: 0 ${v('espacio-4')};
  border: none;
  border-radius: ${v('radio-sistema')};
  background: ${v('marca')};
  color: ${v('sobre-marca')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
  font-weight: ${v('peso-fuerte')};
  cursor: pointer;
}
.agenda-barra__nueva:hover { background: ${v('marca-fuerte')}; }
.agenda-barra__nueva:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

.agenda-barra__grupo { display: flex; align-items: center; gap: ${v('espacio-1')}; flex: none; }
.agenda-barra__division {
  width: 1px; height: 24px;
  background: ${v('borde-suave')};
  margin: 0 ${v('espacio-1')};
}
.agenda-barra__boton {
  min-height: 40px; min-width: 44px;
  padding: 0 ${v('espacio-3')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
  cursor: pointer;
}
.agenda-barra__boton:hover { background: ${v('superficie-tenue')}; }
.agenda-barra__boton:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.agenda-barra__boton--flecha { font-size: ${v('texto-grande')}; line-height: 1; padding: 0; }

/*
 * La fecha con su calendario. El <input type=date> va TRANSPARENTE encima:
 * tocar el texto abre el calendario del sistema, que es lo que todo el mundo
 * intenta primero, y ese calendario no puede quedar debajo de nada.
 */
.agenda-barra__fecha {
  position: relative;
  display: flex; align-items: center; gap: ${v('espacio-2')};
  min-height: 40px; min-width: 0;
  padding: 0 ${v('espacio-3')};
  border-radius: ${v('radio-sistema')};
  /* Empuja los controles de vista a la derecha cuando hay lugar. */
  margin-inline: auto;
  cursor: pointer;
}
.agenda-barra__fecha:hover { background: ${v('superficie-tenue')}; }
.agenda-barra__fecha:focus-within { outline: ${v('foco')}; outline-offset: 2px; }
.agenda-barra__fecha-texto {
  font-weight: ${v('peso-fuerte')};
  font-size: ${v('texto-normal')};
  white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.agenda-barra__fecha-icono { display: flex; flex: none; color: ${v('texto-suave')}; }
.agenda-barra__fecha-campo {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  opacity: 0;
  cursor: pointer;
  /* Sin borde ni fondo: en Safari un input de fecha vacio dibuja igual su
     marco aunque sea transparente. */
  border: none; background: transparent; padding: 0;
}

.agenda-barra__vistas {
  display: flex; flex: none;
  padding: 2px;
  gap: 2px;
  background: ${v('superficie-tenue')};
  border-radius: ${v('radio-sistema')};
}
.agenda-barra__vista {
  min-height: 36px;
  padding: 0 ${v('espacio-3')};
  border: none;
  border-radius: ${v('radio-chico')};
  background: transparent;
  color: ${v('texto-suave')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
  cursor: pointer;
}
.agenda-barra__vista--puesta {
  background: ${v('superficie-elevada')};
  color: ${v('texto')};
  font-weight: ${v('peso-fuerte')};
  box-shadow: ${v('sombra-sutil')};
}
.agenda-barra__vista:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }

.agenda-barra__filtros {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  min-height: 40px; min-width: 44px; flex: none;
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  color: ${v('texto-suave')};
  cursor: pointer;
}
.agenda-barra__filtros:hover { background: ${v('superficie-tenue')}; }
.agenda-barra__filtros:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.agenda-barra__filtros--puestos { border-color: ${v('marca')}; color: ${v('marca')}; }
.agenda-barra__filtros-cuantos {
  position: absolute; top: -6px; right: -6px;
  min-width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${v('radio-redondo')};
  background: ${v('marca')};
  color: ${v('sobre-marca')};
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-fuerte')};
}

/*
 * En celular la barra se reacomoda en tres renglones en vez de encogerse.
 *
 * "Nueva cita" toma el ancho entero porque es lo que mas se aprieta en un
 * mostrador, y la fecha se lleva su propio renglon: con el nombre del mes
 * escrito no cabe al lado de las flechas sin recortarse.
 */
@media (max-width: 720px) {
  .agenda-barra__nueva { flex: 1 1 100%; justify-content: center; }
  .agenda-barra__fecha { flex: 1 1 100%; margin-inline: 0; justify-content: center; }
  .agenda-barra__vistas { flex: 1 1 auto; }
  .agenda-barra__vista { flex: 1; }
}

.agenda-filtros {
  display: flex; flex-wrap: wrap; gap: ${v('espacio-3')}; align-items: flex-end;
  padding: ${v('espacio-3')};
  background: ${v('superficie-tenue')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
}
.agenda-filtros__campo { display: flex; flex-direction: column; gap: ${v('espacio-1')}; font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }
.agenda-filtros__campo select {
  min-height: 44px; padding: 0 ${v('espacio-2')};
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('texto')}; font-family: ${v('familia')};
}

.agenda-cuerpo {
  display: grid;
  /* El panel es fijo y el calendario toma lo que sobra. El minmax de cero a
     una fraccion es lo que impide que una cita con nombre largo estire la
     columna y saque scroll horizontal a toda la aplicacion. */
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: ${v('espacio-4')};
  align-items: start;
}
/*
 * AQUI LA COLUMNA SE QUEDA, al reves que en los modulos de lista.
 *
 * Se probo quitarla cuando no hay cita escogida y se vio en la captura por que
 * no: una cita de una hora pasaba a medir mil ciento cincuenta pixeles de
 * ancho para decir un nombre y un servicio. Una agenda de dia necesita una
 * columna angosta, no toda la pantalla — a diferencia de una tabla de siete
 * columnas, que necesita justo lo contrario.
 *
 * Lo que si cambia es lo que se pinta ahi: antes una frase suelta en una caja,
 * ahora un estado vacio con su icono, que se lee como algo terminado.
 */
@media (max-width: 1100px) {
  /*
   * En tableta el panel baja DEBAJO del calendario en vez de comprimirlo.
   *
   * Comprimirlo a 200px parece la solucion obvia y es la peor: el nombre del
   * paciente, el servicio y los cuatro botones quedan en columnas de una
   * palabra. Abajo tiene el ancho entero y se lee igual que en escritorio.
   */
  .agenda-cuerpo { grid-template-columns: minmax(0, 1fr); }
}
.agenda-calendario {
  min-width: 0;
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-tarjeta')};
  padding: ${v('espacio-3')};
}

.agenda-lienzo { display: flex; flex-direction: column; min-width: 0; }
.agenda-lienzo__encabezado { display: flex; gap: ${v('espacio-1')}; padding-bottom: ${v('espacio-2')}; }
.agenda-lienzo__hueco { width: 52px; flex: none; }
.agenda-dia__titulo {
  flex: 1; text-align: center; min-width: 0;
  font-size: ${v('texto-chico')}; color: ${v('texto-suave')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agenda-dia__titulo--tocable {
  background: transparent; border: none; cursor: pointer;
  display: flex; flex-direction: column; gap: 2px; min-height: 44px;
  font-family: ${v('familia')};
}
.agenda-dia__titulo--hoy { color: ${v('marca')}; font-weight: ${v('peso-fuerte')}; }
.agenda-dia__numero { font-size: ${v('texto-normal')}; }

.agenda-lienzo__cuerpo { display: flex; gap: ${v('espacio-1')}; height: 62vh; min-height: 380px; }
.agenda-regla { width: 52px; flex: none; position: relative; }
.agenda-regla__marca {
  position: absolute; right: ${v('espacio-1')}; transform: translateY(-50%);
  font-size: ${v('texto-micro')}; color: ${v('texto-tenue')};
  font-variant-numeric: ${v('cifra-numeros')};
}
.agenda-lienzo__pista { position: relative; flex: 1; min-width: 0; display: flex; gap: 2px; }
.agenda-lienzo__pista--semana > .agenda-columna { flex: 1; min-width: 0; }
.agenda-rejilla { position: absolute; inset: 0; pointer-events: none; }
.agenda-rejilla__linea { position: absolute; left: 0; right: 0; border-top: 1px solid ${v('borde-suave')}; }

.agenda-columna { position: relative; flex: 1; min-width: 0; cursor: crosshair; }

/*
 * EL RATO EN QUE LA SALA SIGUE OCUPADA aunque la sesion ya termino.
 *
 * Es la respuesta visible a "por que no me deja agendar a las 11:00 si el
 * masaje acaba a las 11:00": esos quince minutos son de limpiar, recoger las
 * piedras y preparar la siguiente terapia. La base ya se negaba a poner nada
 * ahi; lo que faltaba era que la pantalla lo dijera.
 *
 * "pointer-events: none" es OBLIGATORIO. La franja se dibuja encima del fondo
 * de la columna, y sin esto se comeria el clic que abre "Nueva cita" en el
 * hueco de al lado — el rayado se vuelve una zona muerta sin explicacion.
 */
.agenda-preparacion {
  position: absolute;
  pointer-events: none;
  border-radius: ${v('radio-sistema')};
  background: repeating-linear-gradient(
    135deg,
    ${v('superficie-tenue')},
    ${v('superficie-tenue')} 5px,
    transparent 5px,
    transparent 10px
  );
  border: 1px dashed ${v('borde-suave')};
}

.agenda-cita {
  position: absolute;
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border: 1px solid ${v('borde-suave')};
  border-left: 4px solid ${v('borde')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  font-family: ${v('familia')};
  font-size: ${v('texto-micro')};
  text-align: left;
  cursor: pointer;
  /* Sin esto, un nombre largo estira el bloque fuera de la columna. */
  overflow: hidden;
  min-width: 0;
}
/* En DIA la cita es una tarjeta ancha: marca, texto y estado en una fila. */
.agenda-cita--ancha {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: ${v('espacio-3')};
}
/* En SEMANA cinco columnas comparten el ancho: solo cabe apilado. */
.agenda-cita--compacta {
  display: flex; flex-direction: column; gap: 1px;
  padding: ${v('espacio-1')} ${v('espacio-2')};
}
.agenda-cita--compacta > span,
.agenda-cita__cuerpo > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/*
 * LA HORA Y EL NOMBRE COMPARTEN RENGLON. El alto del bloque lo fija la duracion
 * de la cita, y con tres renglones el servicio salia cortado. La hora va antes y
 * en tono tenue: es la referencia, el nombre es lo que se busca.
 */
.agenda-cita__linea {
  display: flex; align-items: baseline; gap: ${v('espacio-2')}; min-width: 0;
}
.agenda-cita__linea .agenda-cita__hora { flex: none; }
.agenda-cita__linea .agenda-cita__quien {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agenda-cita__cuerpo { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.agenda-cita__marca {
  display: flex; flex: none;
  width: 30px; height: 30px;
  align-items: center; justify-content: center;
  border-radius: ${v('radio-redondo')};
  background: ${v('superficie-elevada')};
}
/* Una cita de media hora en una franja de doce horas mide treinta pixeles: sin
   este minimo, el texto se corta a media letra. Se prefiere que dos bloques
   cortos se rocen a que uno no se pueda leer. */
.agenda-cita--ancha { min-height: 48px; }
/* La hoja de la marca dentro del bloque toma el color del estado, no el verde
   de siempre: si no, una cita cancelada llevaria una hoja verde. */
.agenda-cita__marca .terapias-hoja { color: inherit; }
.agenda-cita:focus-visible { outline: ${v('foco')}; outline-offset: 1px; z-index: 3; }
.agenda-cita--puesta { border-width: 2px; border-left-width: 4px; box-shadow: ${v('sombra-flotante')}; z-index: 2; }
.agenda-cita__hora { color: ${v('texto-tenue')}; font-variant-numeric: ${v('cifra-numeros')}; }
.agenda-cita__quien { font-weight: ${v('peso-fuerte')}; color: ${v('texto')}; font-size: ${v('texto-chico')}; }
.agenda-cita__que { color: ${v('texto-suave')}; }

/* El estado se distingue por color Y por palabra: la pastilla siempre lleva
   el nombre escrito, para quien no distingue los tonos. */
/* Tintada y SIN MARCO, igual que la pastilla compartida. Con borde, la misma
   palabra —"Confirmada"— se dibujaba de dos maneras segun la pantalla en la
   que salia. */
.agenda-cita__estado {
  flex: none;
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-medio')};
  padding: 3px ${v('espacio-3')};
  border-radius: ${c('radio-pastilla')};
  white-space: nowrap;
  background: ${v('superficie-elevada')};
  border: none;
}
.agenda-cita--compacta .agenda-cita__estado {
  background: transparent; border: none; padding: 0;
  color: ${v('texto-tenue')};
}

.agenda-cita--pendiente { border-left-color: ${v('advertencia')}; background: ${v('advertencia-tenue')}; }
.agenda-cita--confirmada { border-left-color: ${v('exito')}; background: ${v('exito-tenue')}; }
.agenda-cita--completada { border-left-color: ${v('cat-ventas')}; background: ${v('cat-ventas-tenue')}; }
.agenda-cita--cancelada { border-left-color: ${v('peligro')}; background: ${v('peligro-tenue')}; }
.agenda-cita--no_asistio { border-left-color: ${v('texto-tenue')}; background: ${v('superficie-tenue')}; }

.agenda-cita--pendiente .agenda-cita__marca { color: ${v('advertencia')}; }
.agenda-cita--confirmada .agenda-cita__marca { color: ${v('exito')}; }
.agenda-cita--completada .agenda-cita__marca { color: ${v('cat-ventas')}; }
.agenda-cita--cancelada .agenda-cita__marca { color: ${v('peligro')}; }
.agenda-cita--no_asistio .agenda-cita__marca { color: ${v('texto-tenue')}; }

/* Las pastillas de estado, iguales en el bloque, en el panel y en la leyenda:
   un mismo estado no puede verse de dos colores en la misma pantalla. */
/*
 * SOLO EL COLOR DE LA LETRA: el fondo lo pone la pastilla y es BLANCO.
 *
 * Se probo tintarla como la pastilla compartida y en la captura se vio el
 * problema: el bloque de la cita ya esta tintado del mismo tono, asi que la
 * pastilla desaparecia dentro de el y "Confirmada" quedaba como texto suelto.
 * Sobre fondo tintado, lo que resalta es el blanco.
 */
.agenda-estado--pendiente { color: ${v('advertencia')}; }
.agenda-estado--confirmada { color: ${v('exito')}; }
.agenda-estado--completada { color: ${v('cat-ventas')}; }
.agenda-estado--cancelada { color: ${v('peligro')}; }
.agenda-estado--no_asistio { color: ${v('texto-suave')}; }

.agenda-estado-texto--pendiente { color: ${v('advertencia')}; }
.agenda-estado-texto--confirmada { color: ${v('exito')}; }
.agenda-estado-texto--completada { color: ${v('cat-ventas')}; }
.agenda-estado-texto--cancelada { color: ${v('peligro')}; }
.agenda-estado-texto--no_asistio { color: ${v('texto-suave')}; }

.agenda-punto--pendiente { background: ${v('advertencia')}; }
.agenda-punto--confirmada { background: ${v('exito')}; }
.agenda-punto--completada { background: ${v('cat-ventas')}; }
.agenda-punto--cancelada { background: ${v('peligro')}; }
.agenda-punto--no_asistio { background: ${v('texto-tenue')}; }

.agenda-ahora { position: absolute; left: 0; right: 0; border-top: 2px solid ${v('peligro')}; z-index: 1; }
/* La hora se escribe SOBRE la regla de la izquierda, como en el diseño: en
   rojo y sin pastilla, para no tapar la primera cita de esa franja. */
.agenda-ahora__hora {
  position: absolute; right: calc(100% + ${v('espacio-1')}); top: -9px;
  color: ${v('peligro')};
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
}
.agenda-ahora__punto {
  position: absolute; left: -4px; top: -4px;
  width: 8px; height: 8px;
  border-radius: ${v('radio-redondo')};
  background: ${v('peligro')};
}

.agenda-vacio, .agenda-panel__pista {
  margin: ${v('espacio-4')} 0 0;
  text-align: center; color: ${v('texto-suave')}; font-size: ${v('texto-chico')};
}
.agenda-cargando { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.agenda-cargando__bloque { height: 56px; }
.agenda-error { padding: ${v('espacio-6')}; text-align: center; color: ${v('texto-suave')}; }
.agenda-error__detalle { font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; overflow-wrap: anywhere; }

.agenda-leyenda {
  display: flex; flex-wrap: wrap; gap: ${v('espacio-3')};
  list-style: none; margin: ${v('espacio-3')} 0 0; padding: 0;
  font-size: ${v('texto-micro')}; color: ${v('texto-suave')};
}
.agenda-leyenda__punto { display: flex; align-items: center; gap: ${v('espacio-1')}; }
.agenda-leyenda__color { width: 9px; height: 9px; border-radius: ${v('radio-redondo')}; flex: none; }

/* ---------------------------------------------------------------- */
/* Vista de mes                                                      */
/* ---------------------------------------------------------------- */
.agenda-mes__encabezado, .agenda-mes__cuadricula { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.agenda-mes__dia-semana { text-align: center; font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; padding-bottom: ${v('espacio-1')}; }
.agenda-mes__celda {
  min-height: 92px; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
  padding: ${v('espacio-1')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
}
.agenda-mes__celda--fuera { background: ${v('superficie-tenue')}; }
.agenda-mes__celda--hoy { border-color: ${v('marca')}; border-width: 2px; }
.agenda-mes__numero {
  align-self: flex-start; min-height: 24px; min-width: 24px;
  background: transparent; border: none; cursor: pointer;
  font-family: ${v('familia')}; font-size: ${v('texto-micro')}; color: ${v('texto-suave')};
}
.agenda-mes__cita {
  display: block; width: 100%; text-align: left;
  border: none; border-left: 3px solid ${v('borde')};
  border-radius: ${v('radio-sistema')};
  padding: 1px ${v('espacio-1')};
  font-family: ${v('familia')}; font-size: ${v('texto-micro')};
  cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agenda-mes__hora { color: ${v('texto-tenue')}; font-variant-numeric: ${v('cifra-numeros')}; }
.agenda-mes__mas { background: transparent; border: none; cursor: pointer; font-family: ${v('familia')}; font-size: ${v('texto-micro')}; color: ${v('marca')}; text-align: left; }

/* ---------------------------------------------------------------- */
/* El panel de la cita                                               */
/* ---------------------------------------------------------------- */
.agenda-panel {
  display: flex; flex-direction: column; gap: ${v('espacio-3')};
  padding: ${v('espacio-4')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-tarjeta')};
  min-width: 0;
}
.agenda-panel--vacio { color: ${v('texto-suave')}; }
.agenda-panel__barra { display: flex; align-items: center; gap: ${v('espacio-2')}; }
.agenda-panel__titulo { font-weight: ${v('peso-fuerte')}; flex: 1; min-width: 0; }
.agenda-panel__estado {
  font-size: ${v('texto-micro')};
  padding: 3px ${v('espacio-2')};
  border-radius: ${v('radio-redondo')};
  border: 1px solid ${v('borde-suave')};
  background: ${v('superficie')};
  white-space: nowrap;
}
.agenda-panel__cerrar { background: transparent; border: none; cursor: pointer; font-size: ${v('texto-grande')}; color: ${v('texto-suave')}; min-height: 44px; min-width: 44px; }
.agenda-panel__persona { display: flex; align-items: center; gap: ${v('espacio-3')}; min-width: 0; }
.agenda-panel__inicial {
  width: 44px; height: 44px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${v('radio-redondo')};
  background: ${v('marca-tenue')}; color: ${v('marca')};
  font-weight: ${v('peso-fuerte')};
}
.agenda-panel__contacto { display: flex; flex-direction: column; min-width: 0; }
.agenda-panel__nombre { font-weight: ${v('peso-fuerte')}; overflow-wrap: anywhere; }
.agenda-panel__enlace { color: ${v('marca')}; font-size: ${v('texto-chico')}; overflow-wrap: anywhere; }
.agenda-panel__falta { color: ${v('texto-tenue')}; font-size: ${v('texto-chico')}; }
/*
 * Cada dato es un renglon con su icono, como en el diseño. El icono ayuda a
 * encontrar "Servicio" o "Notas" de un vistazo en un panel de ocho renglones;
 * la etiqueta escrita sigue estando, porque un icono solo no dice nada.
 */
.agenda-panel__renglon {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: ${v('espacio-3')};
  align-items: start;
  padding-top: ${v('espacio-3')};
  border-top: 1px solid ${v('borde-suave')};
}
.agenda-panel__renglon-icono { display: flex; flex: none; color: ${v('texto-tenue')}; padding-top: 2px; }
.agenda-panel__renglon-cuerpo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.agenda-panel__etiqueta { font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; }
.agenda-panel__valor { font-size: ${v('texto-chico')}; color: ${v('texto')}; overflow-wrap: anywhere; }
.agenda-panel__secundario { color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }
/* Una nota larga respeta los saltos de linea que escribio quien la capturo. */
.agenda-panel__notas { white-space: pre-wrap; overflow-wrap: anywhere; }

/*
 * Las cuatro acciones del diseño, en cuadricula de dos. En una sola fila se
 * aprietan hasta partir "Cancelar cita" en dos renglones dentro del boton.
 */
.agenda-panel__acciones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
  gap: ${v('espacio-2')};
  padding-top: ${v('espacio-3')};
  border-top: 1px solid ${v('borde-suave')};
}
/* Los botones de la base llevan icono y texto: sin esto salen uno debajo del
   otro y el icono queda a la izquierda del todo. */
.agenda-panel__acciones .neron-boton,
.agenda-panel__cambio {
  display: inline-flex; align-items: center; justify-content: center;
  gap: ${v('espacio-1')};
}
.agenda-panel__estados { display: flex; flex-wrap: wrap; gap: ${v('espacio-2')}; margin-top: -${v('espacio-1')}; }
.agenda-panel__cambio {
  display: flex; align-items: center; gap: ${v('espacio-1')};
  min-height: 36px;
  padding: 0 ${v('espacio-3')};
  border: 1px dashed ${v('borde')};
  border-radius: ${v('radio-sistema')};
  background: transparent;
  color: ${v('texto-suave')};
  font-family: ${v('familia')};
  font-size: ${v('texto-micro')};
  cursor: pointer;
}
.agenda-panel__cambio:hover { background: ${v('superficie-tenue')}; color: ${v('texto')}; }
.agenda-panel__cambio:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

/* ---------------------------------------------------------------- */
/* El cobro de la cita                                               */
/* ---------------------------------------------------------------- */
/*
 * LA PROPUESTA DE COBRO NO ES UN MODAL, Y ES LA DECISION DE DISEÑO DEL BLOQUE.
 *
 * Un modal tapa la agenda y obliga a contestar algo que muchas veces no toca
 * contestar todavia —la paciente sigue vistiendose, o paga al salir—. Esto se
 * lee, se aprieta o se ignora, y en los tres casos la cita queda marcada como
 * pendiente de cobro con su boton a mano.
 */
.agenda-cobro {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: ${v('espacio-2')};
  padding: ${v('espacio-3')};
  border: 1px solid ${v('exito')};
  border-radius: ${v('radio-sistema')};
  background: ${v('exito-tenue')};
}
.agenda-cobro__texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.agenda-cobro__titulo { font-weight: 600; color: ${v('texto')}; font-size: ${v('texto-normal')}; }
.agenda-cobro__pie { color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }
.agenda-cobro__botones { display: flex; flex-wrap: wrap; gap: ${v('espacio-2')}; }
.agenda-cobro__botones .neron-boton {
  display: inline-flex; align-items: center; gap: ${v('espacio-1')};
}
/* Sin la variante no hay a que colgar el modificador, y la guardia 17 pide que
   toda clase que se escribe exista aqui. Es la misma franja: la variante deja
   sitio para la del cobro ya hecho, que llegara con los recibos. */
.agenda-cobro--propuesta { border-style: solid; }

/* El renglon de "Pendiente de cobro" bajo el estado. Se distingue por color y
   TAMBIEN por la palabra: quien no distingue el verde del ambar lo lee igual. */
.agenda-panel__cobro { font-size: ${v('texto-micro')}; margin-top: 2px; }
.agenda-panel__cobro--pendiente { color: ${v('advertencia')}; font-weight: 600; }
.agenda-panel__cobro--cobrada { color: ${v('exito')}; font-weight: 600; }
.agenda-estado--por-cobrar { color: ${v('advertencia')}; }

/* ---------------------------------------------------------------- */
/* El formulario de cita                                             */
/* ---------------------------------------------------------------- */
.agenda-form { display: flex; flex-direction: column; gap: ${v('espacio-3')}; }
.agenda-form__par { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: ${v('espacio-3')}; }
.agenda-form__paciente { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.agenda-form__resultados {
  list-style: none; margin: 0; padding: 0;
  /* La lista tiene su propio scroll: cien pacientes no deben estirar el
     modal hasta salirse de la pantalla. */
  max-height: 168px; overflow-y: auto;
  border: 1px solid ${v('borde-suave')}; border-radius: ${v('radio-sistema')};
}
.agenda-form__resultado {
  display: flex; justify-content: space-between; gap: ${v('espacio-2')};
  width: 100%; min-height: 44px; padding: 0 ${v('espacio-3')};
  background: transparent; border: none; cursor: pointer;
  font-family: ${v('familia')}; font-size: ${v('texto-chico')}; color: ${v('texto')};
  text-align: left;
}
.agenda-form__resultado:hover { background: ${v('superficie-tenue')}; }
.agenda-form__resultado--puesta, .agenda-form__resultado--puesto { background: ${v('marca-tenue')}; font-weight: ${v('peso-fuerte')}; }
.agenda-form__resultado-nombre { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agenda-form__resultado-dato { color: ${v('texto-tenue')}; flex: none; }
.agenda-form__vacio { margin: 0; font-size: ${v('texto-chico')}; color: ${v('texto-suave')}; }
.agenda-form__error {
  margin: 0; color: ${v('peligro')}; font-size: ${v('texto-chico')};
  border-left: 3px solid ${v('peligro')}; background: ${v('peligro-tenue')};
  padding: ${v('espacio-2')} ${v('espacio-3')}; border-radius: ${v('radio-sistema')};
}
.vta-totales__nota { color: ${v('texto-tenue')}; font-size: ${v('texto-micro')}; font-weight: 400; }
.agenda-form__pie { display: flex; justify-content: flex-end; gap: ${v('espacio-2')}; flex-wrap: wrap; }
/* El aviso de "fuera del horario del centro". Es AMBAR y no rojo a proposito:
   no impide nada, solo dice algo que hay que saber. Un aviso rojo que no
   bloquea acaba ignorandose, y con el se ignoran los que si importan. */
.agenda-form__aviso {
  margin: 0; color: ${v('advertencia')}; font-size: ${v('texto-chico')};
  border-left: 3px solid ${v('advertencia')}; background: ${v('advertencia-tenue')};
  padding: ${v('espacio-2')} ${v('espacio-3')}; border-radius: ${v('radio-sistema')};
}

/* ---------------------------------------------------------------- */
/* El modulo que todavia no llega                                    */
/* ---------------------------------------------------------------- */
.terapias-pendiente {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${v('espacio-3')};
  max-width: 46rem;
  padding: ${v('espacio-8')} ${v('espacio-4')};
}
.terapias-pendiente__marca {
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-fuerte')};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${v('marca')};
  background: ${v('marca-tenue')};
  border-radius: ${v('radio-redondo')};
  padding: ${v('espacio-1')} ${v('espacio-3')};
}
.terapias-pendiente__titulo {
  margin: 0;
  font-size: ${v('texto-titulo')};
  font-weight: ${v('peso-fuerte')};
  color: ${v('texto')};
}
.terapias-pendiente__texto { margin: 0; color: ${v('texto-suave')}; }
.terapias-pendiente__nota {
  margin: 0;
  color: ${v('texto-tenue')};
  font-size: ${v('texto-chico')};
  border-left: 3px solid ${v('borde-suave')};
  padding-left: ${v('espacio-3')};
}
/* El recado que dejo el acceso rapido: el boton SI hizo algo. */
.terapias-pendiente__recado {
  margin: 0;
  color: ${v('texto')};
  font-size: ${v('texto-chico')};
  background: ${v('marca-tenue')};
  border-radius: ${v('radio-sistema')};
  padding: ${v('espacio-2')} ${v('espacio-3')};
}

/* ================================================================ */
/* INICIO — el tablero                                              */
/* ================================================================ */
/*
 * NI UN ANCHO FIJO EN PIXELES para las columnas. Todo va en rejillas que se
 * reacomodan solas, y cada hijo lleva su "min-width: 0" — sin eso, un nombre
 * de paciente largo estira su columna, la rejilla crece, y aparece scroll
 * horizontal en TODA la aplicacion. Es el defecto que mas veces vuelve.
 *
 * LO QUE ES DE TODOS YA NO VIVE AQUI. La tarjeta, la pastilla, el renglon y la
 * cifra son piezas compartidas ("pz-"). Lo que queda en este archivo es
 * unicamente lo que SOLO tiene sentido en el tablero: la fila de una cita con
 * sus dos horas, la grafica, y el numerito del ranking.
 */
.ini { display: flex; flex-direction: column; gap: ${v('espacio-5')}; min-width: 0; }

.ini-icono { flex: none; }

/* ---------------------------------------------------------------- */
/* El cuerpo: columnas que se llenan solas                           */
/* ---------------------------------------------------------------- */
/*
 * COLUMNAS DE VERDAD, NO CELDAS DE UNA REJILLA.
 *
 * La primera version colocaba cada panel en su fila y su columna con
 * "grid-row". El resultado se veia en la captura y era el reclamo principal:
 * la fila entera medía lo que el panel MAS ALTO, y debajo de la agenda quedaba
 * medio metro de blanco porque el panel de productos era gigante.
 *
 * Ahora cada columna es una pila independiente: nada se alinea de lado a lado,
 * asi que ningun panel corto arrastra un hueco. Y al ser "auto-fit", tres
 * columnas en escritorio, dos en tableta y una en celular sin escribir un solo
 * punto de corte.
 */
.ini-cuerpo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
  gap: ${v('espacio-4')};
  align-items: start;
  min-width: 0;
}
.ini-columna {
  display: flex;
  flex-direction: column;
  gap: ${v('espacio-4')};
  min-width: 0;
}
/*
 * Cuando estan las tres, no se reparten en partes iguales: la agenda lleva
 * nombre, servicio y estado en el mismo renglon y es la que mas ancho necesita.
 * Con tres tercios exactos, "Adriana Villalobos" se cortaba en "Adriana
 * Villal…" — y un nombre a medias en la pantalla principal se ve descuidado.
 *
 * Solo se aplica con las tres puestas: si a alguien le faltan paneles por
 * permiso, "auto-fit" reparte lo que haya y no queda una pista vacia.
 */
@media (min-width: 1240px) {
  .ini-cuerpo--tres {
    grid-template-columns: minmax(0, 1.22fr) minmax(0, 1.06fr) minmax(0, 0.92fr);
  }
}

/* El cambio contra ayer pinta su propio color, encima del tono de la familia:
   subir y bajar no son lo mismo y la flecha sola no basta. */
.ini-tarjeta--bien .pz-cifra__pie { color: ${v('exito')}; }
.ini-tarjeta--mal  .pz-cifra__pie { color: ${v('peligro')}; }
/* El pie que ADEMAS lleva a algun lado: se subraya, para que se note. */
.ini-tarjeta__accion { text-decoration: underline; text-underline-offset: 3px; }

/* ---------------------------------------------------------------- */
/* Agenda de hoy                                                     */
/* ---------------------------------------------------------------- */
/*
 * LA HORA MANDA EN LA FILA y por eso va primero y con ancho propio. Sin ese
 * ancho reservado, "09:00" y "17:30" ocupan distinto y la columna de nombres
 * baila de renglon en renglon.
 */
.ini-cita {
  align-items: center;
  gap: ${v('espacio-2')};
  padding: ${v('espacio-2')} ${v('espacio-2')};
}
.ini-cita__horas {
  flex: none;
  width: 46px;
  display: flex; flex-direction: column;
  font-variant-numeric: ${v('cifra-numeros')};
  line-height: 1.25;
}
.ini-cita__inicio { font-weight: ${v('peso-fuerte')}; font-size: ${v('texto-chico')}; }
.ini-cita__fin { color: ${v('texto-tenue')}; font-size: ${v('texto-micro')}; }

/*
 * En celular se va el circulo de iniciales, que es adorno, y se queda lo que
 * hace falta para decidir: hora, quien, que servicio y en que estado.
 */
@media (max-width: 560px) {
  .ini-cita .pz-inicial { display: none; }
  .ini-cita { gap: ${v('espacio-2')}; }
}

/* ---------------------------------------------------------------- */
/* La grafica de ingresos                                            */
/* ---------------------------------------------------------------- */
.ini-grafica__periodo { display: flex; align-items: center; flex: none; }
.ini-grafica__periodo select {
  min-height: 34px;
  padding: 0 ${v('espacio-3')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-pastilla')};
  background: ${v('superficie')};
  color: ${v('texto-suave')};
  font-family: ${v('familia')};
  font-size: ${v('texto-micro')};
  max-width: 160px;
  cursor: pointer;
}
.ini-grafica__periodo select:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

.ini-grafica__cuerpo { display: flex; gap: ${v('espacio-2')}; min-width: 0; }
.ini-grafica__eje {
  list-style: none; margin: 0; padding: 0;
  width: 44px; flex: none; height: 190px;
  display: flex; flex-direction: column; justify-content: space-between;
  text-align: right;
  font-size: ${v('texto-micro')};
  color: ${v('texto-tenue')};
  font-variant-numeric: ${v('cifra-numeros')};
}
.ini-grafica__lienzo { position: relative; flex: 1; min-width: 0; height: 190px; }
.ini-grafica__svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
/* Las guias son CASI invisibles a proposito: en el diseño se adivinan, no se
   leen. Una reja marcada compite con la linea, que es lo que importa. */
.ini-grafica__guia { stroke: ${c('borde-tenue')}; stroke-width: 1; vector-effect: non-scaling-stroke; }
/* El relleno va en degradado —fuerte pegado a la linea, transparente en el
   piso—. Plano se ve como una mancha; en degradado se lee como volumen, que es
   lo que enseña el diseño. */
.ini-grafica__area { fill: url(#ini-degradado); stroke: none; }
.ini-grafica__linea {
  fill: none;
  stroke: ${v('marca')};
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
  /* Sin esto, estirar el SVG a lo ancho engorda la linea horizontalmente y la
     adelgaza en vertical: se ve como un trazo mal hecho. */
  vector-effect: non-scaling-stroke;
}
.ini-grafica__columnas { position: absolute; inset: 0; }
.ini-grafica__columna {
  position: absolute; top: 0; bottom: 0;
  padding: 0; margin: 0;
  background: transparent; border: none; cursor: pointer;
}
.ini-grafica__columna:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }
/* La raya vertical del dia señalado, como en el diseño. */
.ini-grafica__columna--activa::before {
  content: '';
  position: absolute; left: 50%; top: 0; bottom: 0;
  border-left: 1px dashed ${v('borde')};
}
.ini-grafica__punto {
  position: absolute; left: 50%;
  width: 9px; height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: ${c('radio-pastilla')};
  background: ${v('superficie-elevada')};
  border: 2.5px solid ${v('marca')};
  transition: transform ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
/* El punto señalado crece: es la confirmacion de que el globito habla de ESE
   dia y no del de al lado. */
.ini-grafica__columna--activa .ini-grafica__punto {
  background: ${v('marca')};
  transform: scale(1.45);
}
.ini-grafica__globo {
  position: absolute; top: ${v('espacio-2')};
  transform: translateX(-50%);
  z-index: 3;
  display: flex; flex-direction: column;
  padding: ${v('espacio-2')} ${v('espacio-3')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  box-shadow: ${c('sombra-alta')};
  white-space: nowrap;
  animation: mv-aparece ${v('movimiento-instantaneo')} ${v('movimiento-curva')} backwards;
  /* No intercepta el raton: si lo hiciera, el globito taparia la columna de
     al lado y el señalado se quedaria pegado. */
  pointer-events: none;
}
/* En los extremos se ancla hacia adentro para no salirse del panel. */
.ini-grafica__globo--izquierda { transform: translateX(0); }
.ini-grafica__globo--derecha { transform: translateX(-100%); }
.ini-grafica__globo-dia { font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }
.ini-grafica__globo-total {
  font-size: ${v('texto-chico')};
  font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
}
.ini-grafica__dias {
  list-style: none; margin: 0; padding: 0;
  display: flex;
  /* El mismo hueco que ocupa el eje vertical, para que cada etiqueta caiga
     bajo su franja. */
  margin-left: calc(44px + ${v('espacio-2')});
  font-size: ${v('texto-micro')};
  color: ${v('texto-tenue')};
}
.ini-grafica__dias li {
  flex: 1; min-width: 0; text-align: center;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ---------------------------------------------------------------- */
/* Rankings: el puesto y la foto del producto                        */
/* ---------------------------------------------------------------- */
/*
 * Un numero, no un icono de colores por servicio. Los servicios los captura
 * cada centro: no hay forma de saber que dibujo le toca a "Constelaciones" sin
 * inventarselo, y un icono inventado es exactamente lo que no va aqui.
 */
.ini-puesto {
  flex: none;
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${c('radio-pastilla')};
  background: ${v('marca-tenue')};
  color: ${v('marca')};
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
}
/* Los tres primeros pesan mas que el resto: es un ranking, y el ojo tiene que
   poder quedarse en el podio sin leer las cinco filas. */
.ini-puesto--podio { background: ${v('marca')}; color: ${v('sobre-marca')}; }

/*
 * EL PRODUCTO VA EN RENGLON, NO EN CUADRICULA.
 *
 * Con foto grande y en rejilla, cinco productos median mas de cuatrocientos
 * pixeles de alto y dejaban la columna de al lado vacia. En renglon el panel
 * mide lo mismo que el de servicios —que es su hermano— y las dos columnas
 * quedan parejas.
 */
.ini-producto__foto, .ini-producto__hueco {
  flex: none;
  width: 40px; height: 40px;
  border-radius: ${c('radio-control')};
  background: ${v('superficie-tenue')};
  border: 1px solid ${c('borde-tenue')};
}
/* "contain" y no "cover": la foto de un frasco recortada por los lados deja
   de parecerse al frasco que esta en el estante. */
.ini-producto__foto { object-fit: contain; }
.ini-producto__hueco {
  display: flex; align-items: center; justify-content: center;
  color: ${v('texto-tenue')};
}

/* ---------------------------------------------------------------- */
/* Recordatorios                                                     */
/* ---------------------------------------------------------------- */
/*
 * La urgencia se ve en la raya de la izquierda Y se lee en la pastilla. Solo
 * con el color no le sirve a quien no lo distingue, ni a quien mira la
 * pantalla con el sol encima.
 */
.ini-recordatorio {
  border-left: 3px solid transparent;
  border-radius: ${c('radio-control')};
}
.ini-recordatorio--vencido { border-left-color: ${v('peligro')}; }
.ini-recordatorio--hoy { border-left-color: ${v('advertencia')}; }
.ini-recordatorio--proximo { border-left-color: ${c('borde-tarjeta')}; }

/* ---------------------------------------------------------------- */
/* Acciones rapidas                                                  */
/* ---------------------------------------------------------------- */
.ini-accion { justify-content: flex-start; min-height: 56px; gap: ${v('espacio-3')}; }
/* Se levanta al pasar: son los seis botones que mas se aprietan del producto y
   tienen que sentirse vivos. */
.ini-accion:hover:not(:disabled) {
  border-color: ${v('marca')};
  box-shadow: ${c('sombra-alta')};
  transform: translateY(-2px);
}
/* El icono toma el tono de la familia a la que pertenece la accion. El gasto
   va en rojo a proposito: es lo unico de la fila que saca dinero. */
.ini-accion--venta   .pz-ficha { background: ${v('cat-ventas-tenue')};    color: ${v('cat-ventas')}; }
.ini-accion--cliente .pz-ficha { background: ${v('cat-visitas-tenue')};   color: ${v('cat-visitas')}; }
.ini-accion--cita    .pz-ficha { background: ${v('cat-citas-tenue')};     color: ${v('cat-citas')}; }
.ini-accion--pago    .pz-ficha { background: ${v('cat-ventas-tenue')};    color: ${v('cat-ventas')}; }
.ini-accion--gasto   .pz-ficha { background: ${v('peligro-tenue')};       color: ${v('peligro')}; }
.ini-accion--reportes .pz-ficha { background: ${v('cat-cursos-tenue')};   color: ${v('cat-cursos')}; }

/* ================================================================ */
/* LA BARRA SUPERIOR: buscador y campana                            */
/* ================================================================ */
/*
 * Se ajusta la barra de la base para que quepan tres cosas mas.
 *
 * "flex-wrap" es lo que evita el scroll horizontal en celular: en vez de
 * apretarse hasta salirse, el buscador baja a su propio renglon. Es un ajuste
 * de acomodo, no un cambio del sistema de diseño: ni un color, ni un tamaño,
 * ni un espacio propio.
 */
.neron-superior { flex-wrap: wrap; }
.neron-superior__acciones { flex: 1 1 auto; min-width: 0; justify-content: flex-end; flex-wrap: wrap; }

.ini-buscador {
  position: relative;
  display: flex; align-items: center;
  flex: 1 1 190px; min-width: 0; max-width: 420px;
}
.ini-buscador__lupa {
  position: absolute; left: ${v('espacio-3')};
  display: flex; color: ${v('texto-tenue')};
  /* No intercepta el clic: si lo hiciera, tocar la lupa no enfocaria el
     campo, que es justo lo que todo el mundo intenta. */
  pointer-events: none;
}
.ini-buscador__campo {
  width: 100%; min-width: 0; min-height: 40px;
  padding-left: calc(${v('espacio-3')} + 18px + ${v('espacio-2')});
  padding-right: ${v('espacio-3')};
  border: 1px solid ${v('borde')};
  border-radius: ${v('radio-redondo')};
  background: ${v('superficie-tenue')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
}
.ini-buscador__campo:focus-visible { outline: ${v('foco')}; outline-offset: 1px; }
.ini-buscador__panel {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  /* Por encima del velo (40) y de la barra lateral (50) de la base: si
     quedara debajo, se veria el fondo oscurecerse y el panel no aparecer —
     que es exactamente el fallo que ya nos costo tiempo. */
  z-index: 60;
  max-height: 60vh; overflow-y: auto;
  padding: ${v('espacio-2')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  box-shadow: ${v('sombra-flotante')};
}
.ini-buscador__pista { margin: 0; padding: ${v('espacio-2')}; font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }
.ini-buscador__grupo + .ini-buscador__grupo { margin-top: ${v('espacio-2')}; }
.ini-buscador__grupo-titulo {
  margin: 0 0 ${v('espacio-1')};
  padding: 0 ${v('espacio-2')};
  font-size: ${v('texto-micro')};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${v('texto-tenue')};
}
.ini-buscador__lista { list-style: none; margin: 0; padding: 0; }
.ini-buscador__cosa {
  display: flex; align-items: baseline; justify-content: space-between; gap: ${v('espacio-2')};
  width: 100%; min-height: 40px;
  padding: 0 ${v('espacio-2')};
  background: transparent; border: none; border-radius: ${v('radio-sistema')};
  cursor: pointer; text-align: left;
  font-family: ${v('familia')}; font-size: ${v('texto-chico')}; color: ${v('texto')};
}
.ini-buscador__cosa:hover, .ini-buscador__cosa--marcada { background: ${v('marca-tenue')}; }
.ini-buscador__nombre { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ini-buscador__pista-corta { flex: none; font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; }

.ini-campana { position: relative; flex: none; }
.ini-campana__boton {
  position: relative;
  min-width: 40px; min-height: 40px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-redondo')};
  background: ${v('superficie')};
  color: ${v('texto-suave')};
  cursor: pointer;
}
.ini-campana__boton:hover { background: ${v('superficie-tenue')}; }
.ini-campana__boton:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.ini-campana__punto {
  position: absolute; top: 7px; right: 8px;
  width: 9px; height: 9px;
  border-radius: ${v('radio-redondo')};
  background: ${v('marca')};
  border: 2px solid ${v('superficie')};
}
.ini-campana__panel {
  position: absolute; top: calc(100% + 6px); right: 0;
  z-index: 60;
  width: min(320px, calc(100vw - 2rem));
  padding: ${v('espacio-2')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  box-shadow: ${v('sombra-flotante')};
}
.ini-campana__vacio { margin: 0; padding: ${v('espacio-3')}; font-size: ${v('texto-chico')}; color: ${v('texto-suave')}; }
.ini-campana__lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: ${v('espacio-1')}; }
.ini-campana__aviso {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  width: 100%; min-height: 52px;
  padding: ${v('espacio-2')};
  background: transparent; border: none; border-radius: ${v('radio-sistema')};
  cursor: pointer; text-align: left; font-family: ${v('familia')};
  color: ${v('texto')};
}
.ini-campana__aviso:hover { background: ${v('superficie-tenue')}; }
.ini-campana__aviso:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }
.ini-campana__icono { display: flex; flex: none; color: ${v('marca')}; }
.ini-campana__texto { display: flex; flex-direction: column; min-width: 0; }
.ini-campana__que { font-size: ${v('texto-chico')}; font-weight: ${v('peso-medio')}; }
.ini-campana__porque { font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }

/* ================================================================ */
/* CLIENTES                                                         */
/* ================================================================ */
/*
 * LO POCO QUE QUEDA AQUI ES LA MEDIDA DEL ARREGLO.
 *
 * Esta seccion tenia noventa y ocho clases: su propia tarjeta, su propia
 * cifra, su propio boton, su propia tabla, su propio buscador, su propia
 * paginacion, su propio vacio y su propio error. Todas eran copias de las
 * piezas compartidas con dos pixeles de diferencia — el error mas caro del
 * proyecto, escrito una vez mas.
 *
 * Ochenta y ocho ya no las usaba NADIE: los componentes se pasaron a "pz-" y el
 * CSS se quedo aqui, esperando a que alguien lo copiara para el modulo
 * siguiente. Un estilo muerto no es peso muerto, es una trampa: se ve
 * razonable, compila, y el dia que se reusa vuelve a partir el sistema en dos.
 *
 * Lo que sobrevive es SOLO lo que un directorio tiene y las otras siete
 * pantallas no.
 */
.cli { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

/* ---------------------------------------------------------------- */
/* EL INDICE DE LA IZQUIERDA                                         */
/* ---------------------------------------------------------------- */
/*
 * Es una lista, no una tabla, y por eso la tarjeta aprieta su aire: en una
 * columna de trescientos pixeles cada uno que se va en margen es uno que le
 * falta al nombre. Se pega arriba al desplazar para que el indice siga a la
 * vista mientras se lee un expediente largo.
 */
.cli-indice {
  gap: ${v('espacio-3')};
  padding: ${v('espacio-4')};
}
@media (min-width: 1100px) {
  .cli-indice { position: sticky; top: ${v('espacio-4')}; }
}

.cli-indice__fila { display: flex; align-items: center; min-width: 0; }
.cli-indice__fila > .pz-renglon { flex: 1; min-width: 0; }
.cli-indice__marca { flex: none; display: flex; align-items: center; padding-right: ${v('espacio-2')}; }

/*
 * EL RENGLON QUE SE ESTA LEYENDO lleva fondo Y una rayita, igual que el modulo
 * activo del menu. Solo el fondo no alcanza: en la tableta del mostrador, con
 * sol encima, un tinte claro no se distingue del blanco.
 */
.cli-indice__renglon--puesto {
  position: relative;
  background: ${v('marca-tenue')};
}
.cli-indice__renglon--puesto .pz-renglon__titulo { color: ${v('marca')}; font-weight: ${v('peso-fuerte')}; }
.cli-indice__renglon--puesto:hover { background: ${v('marca-tenue')}; }
.cli-indice__renglon--puesto::before {
  content: '';
  position: absolute; left: 0; top: 50%;
  width: 3px; height: 60%;
  border-radius: ${c('radio-pastilla')};
  background: ${v('marca')};
  /* EL ESTADO NATURAL ES LA RAYITA PUESTA, y la animacion arranca desde
     abajo. Al reves —natural en scaleY(0), animacion que la sube— hacia falta
     "both" para que se quedara puesta al terminar, y "both" es lo que
     encerraba los velos de los modales dentro de la caja del modulo. Esta
     contado en "movimiento.ts". */
  transform: translateY(-50%);
  animation: mv-rayita ${v('movimiento-normal')} ${v('movimiento-curva')} backwards;
}

/* La barra de "tantos seleccionados", solo mientras se selecciona. */
.cli-seleccion {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-2')};
  padding: ${v('espacio-2')} ${v('espacio-3')};
  background: ${v('marca-tenue')};
  border-radius: ${c('radio-control')};
  font-size: ${v('texto-micro')};
  color: ${v('marca')};
}
.cli-seleccion > span { flex: 1; min-width: 0; }

/* ---------------------------------------------------------------- */
/* EL EXPEDIENTE DE EN MEDIO                                         */
/* ---------------------------------------------------------------- */
/*
 * El nombre de la persona es el titulo de la pantalla mientras esta abierta, y
 * por eso pide su propio tamaño: con el de un titulo de tarjeta, la ficha no
 * tenia sujeto — se leia como una tarjeta mas de las quince que hay alrededor.
 */
.cli-exp__nombre { font-size: ${v('texto-titulo')}; }
.cli-exp__cuerpo { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

/*
 * LAS TARJETAS DE DENTRO NO LLEVAN SOMBRA NI FONDO PROPIO.
 *
 * Una tarjeta elevada dentro de otra tarjeta elevada se ve como un error de
 * maquetacion: dos bordes y dos sombras a dos pixeles de distancia. Aqui solo
 * separan secciones, asi que basta el borde tenue.
 */
.cli-exp__cuerpo > .pz-tarjeta {
  box-shadow: none;
  background: ${v('superficie')};
}

/*
 * LA FICHA VACIA SE ESTIRA HASTA LO QUE MIDA EL INDICE, no hasta un numero.
 *
 * Sin esto quedaba una tirita de ochenta pixeles con trescientos de blanco
 * debajo, y la pantalla se veia a medio cargar en vez de vacia a proposito. Con
 * un "min-height" fijo se arreglaba con seis nombres y volvia a descuadrar con
 * veinte, porque el indice crece y el numero no.
 *
 * "align-self: stretch" la hace medir lo que mide la fila de la rejilla —o sea,
 * lo que mide la columna mas alta— y se acomoda sola. La rejilla alinea arriba
 * a proposito, asi que esta es la unica que se estira: es la unica cuyo alto no
 * lo decide su contenido.
 */
.cli-exp--vacio { align-self: stretch; justify-content: center; min-height: 300px; }

/*
 * EL AVISO CLINICO. Va arriba de todo y solo aparece cuando hay algo que avisar:
 * una franja permanente que casi siempre esta vacia se deja de mirar en una
 * semana, y entonces no avisa de nada.
 */
.cli-aviso {
  display: flex; align-items: flex-start; gap: ${v('espacio-3')};
  padding: ${v('espacio-4')};
  border: 1px solid ${v('advertencia')};
  border-left-width: 4px;
  border-radius: ${c('radio-control')};
  background: ${v('advertencia-tenue')};
  min-width: 0;
  animation: mv-entra ${v('movimiento-normal')} ${v('movimiento-curva')} backwards;
}
.cli-aviso__marca { flex: none; display: flex; color: ${v('advertencia')}; }
.cli-aviso__cuerpo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cli-aviso__titulo {
  font-size: ${v('texto-micro')}; font-weight: ${v('peso-fuerte')};
  color: ${v('advertencia')}; text-transform: uppercase; letter-spacing: 0.04em;
}
.cli-aviso__linea {
  margin: 0; font-size: ${v('texto-chico')};
  overflow-wrap: anywhere;
}

/*
 * LAS NOTAS DE CADA SESION. Se leen de arriba hacia abajo como un diario, con
 * una linea de tiempo a la izquierda: sin ella, veinte notas seguidas se ven
 * como un solo parrafo largo y no se distingue donde acaba una sesion.
 */
.cli-sesiones {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: ${v('espacio-4')};
}
.cli-sesion {
  position: relative;
  padding-left: ${v('espacio-4')};
  border-left: 2px solid ${c('borde-tarjeta')};
  min-width: 0;
}
.cli-sesion::before {
  content: '';
  position: absolute; left: -5px; top: 4px;
  width: 8px; height: 8px;
  border-radius: ${c('radio-pastilla')};
  background: ${v('marca')};
}
.cli-sesion__cuenta { display: none; }
.cli-sesion__cuando { display: flex; flex-direction: column; gap: 1px; margin-bottom: ${v('espacio-2')}; }

.cli-exp__adeudo { color: ${v('peligro')}; font-weight: ${v('peso-fuerte')}; }

/* ---------------------------------------------------------------- */
/* LA COLUMNA DE APOYO                                               */
/* ---------------------------------------------------------------- */
.cli-proxima { display: flex; align-items: center; gap: ${v('espacio-3')}; min-width: 0; }

/* Las acciones en columna, una debajo de otra: en trescientos veinte pixeles,
   dos por renglon dejan las etiquetas cortadas. */
.cli-acciones { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }

/* En celular el buscador se lleva un renglon entero, que es lo unico que
   permite escribir comodo con el pulgar. */
@media (max-width: 700px) {
  .ini-buscador { flex: 1 1 100%; max-width: none; order: 3; }
}

/* ================================================================ */
/* SERVICIOS — el catalogo                                          */
/* ================================================================ */
/*
 * Reusa TODO el esqueleto de Clientes —tarjetas, tabla, menu, paginacion,
 * vacios, errores— y solo agrega lo que el catalogo tiene y un directorio no:
 * el precio con promocion, la disponibilidad por dias, y el detalle con
 * pestañas. Duplicar la tabla para cambiarle dos columnas obliga a arreglar
 * cada fallo dos veces, y siempre se arregla en una sola.
 */
.srv { min-width: 0; }
.srv-encabezado__acciones {
  display: flex; align-items: center; gap: ${v('espacio-2')}; flex-wrap: wrap; flex: none;
}

/* ---------------------------------------------------------------- */
/* Los filtros que se despliegan                                     */
/* ---------------------------------------------------------------- */
.srv-filtros {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: ${v('espacio-3')}; align-items: end;
  padding: ${v('espacio-3')};
  background: ${v('superficie-tenue')};
  border-radius: ${v('radio-sistema')};
  min-width: 0;
}
/* El boton se marca cuando los filtros estan abiertos: una lista de tres de
   veinte sin decir que hay un filtro puesto se lee como una lista vacia. */
.srv-filtro--puesto { background: ${v('marca-tenue')}; border-color: ${v('marca')}; }

/* ---------------------------------------------------------------- */
/* El renglon de la tabla                                            */
/* ---------------------------------------------------------------- */
/* El color lo escoge quien captura el servicio y llega por atributo de estilo.
   Aqui solo se reserva el hueco y se pone el color por omision. */
.srv-marca {
  width: 34px; height: 34px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie-tenue')};
  color: ${v('marca')};
}
.srv-nombre { display: flex; flex-direction: column; min-width: 0; }
.srv-descripcion {
  color: ${v('texto-suave')}; font-size: ${v('texto-micro')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 34ch;
}
/*
 * LA CATEGORIA ES UNA PASTILLA, COMO EL ESTADO — no una con marco propio.
 *
 * Tenia borde y fondo blanco mientras la pastilla de estado va tintada y sin
 * marco. En la misma fila de una tabla se veian dos cosas del mismo tamaño
 * dibujadas de dos maneras, y esa clase de descuido es la que hace que una
 * pantalla se sienta armada a pedazos.
 */
.srv-categoria {
  display: inline-block;
  padding: 3px ${v('espacio-3')};
  border: none; border-radius: ${c('radio-pastilla')};
  background: ${v('superficie-tenue')};
  color: ${v('texto-suave')};
  font-size: ${v('texto-micro')};
  white-space: nowrap; max-width: 20ch;
  overflow: hidden; text-overflow: ellipsis;
}

/* El precio de lista TACHADO al lado del de hoy: sin el, nadie sabe que hay
   una promocion puesta y el numero parece el precio normal. */
.srv-precio { display: inline-flex; flex-direction: column; align-items: flex-end; }
.srv-precio__hoy { color: ${v('exito')}; font-weight: ${v('peso-fuerte')}; }
.srv-precio__antes {
  color: ${v('texto-tenue')}; font-size: ${v('texto-micro')};
  text-decoration: line-through;
}

/* ---------------------------------------------------------------- */
/* El detalle de la derecha                                          */
/* ---------------------------------------------------------------- */
.srv-detalle { min-width: 0; position: sticky; top: ${v('espacio-4')}; }
.srv-detalle--vacio { color: ${v('texto-suave')}; text-align: center; }
.srv-detalle__cerrar {
  flex: none; min-width: 32px; min-height: 32px;
  border: none; border-radius: ${v('radio-sistema')};
  background: transparent; color: ${v('texto-suave')};
  font-family: ${v('familia')}; font-size: ${v('texto-grande')};
  line-height: 1; cursor: pointer;
}
.srv-detalle__cerrar:hover { background: ${v('superficie-tenue')}; }
.srv-detalle__cerrar:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.srv-detalle__cabeza {
  display: grid; grid-template-columns: auto minmax(0, 1fr);
  gap: ${v('espacio-3')}; align-items: center;
}
.srv-detalle__marca {
  width: 46px; height: 46px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${v('radio-tarjeta')};
  background: ${v('superficie-tenue')};
  color: ${v('marca')};
}
.srv-detalle__quien { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.srv-detalle__nombre {
  display: flex; align-items: center; flex-wrap: wrap; gap: ${v('espacio-2')};
  font-size: ${v('texto-grande')}; font-weight: ${v('peso-fuerte')};
  overflow-wrap: anywhere;
}
.srv-detalle__lema {
  color: ${v('texto-suave')}; font-size: ${v('texto-micro')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.srv-detalle__cuerpo { display: flex; flex-direction: column; gap: ${v('espacio-1')}; min-width: 0; }
.srv-detalle__acciones {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: ${v('espacio-2')};
  padding-top: ${v('espacio-3')};
  border-top: 1px solid ${v('borde-suave')};
}

.srv-pestanas {
  display: flex; gap: 2px; padding: 2px;
  background: ${v('superficie-tenue')};
  border-radius: ${v('radio-sistema')};
  overflow-x: auto;
}
.srv-pestana {
  flex: 1; min-height: 34px; padding: 0 ${v('espacio-2')};
  border: none; border-radius: ${v('radio-chico')};
  background: transparent; color: ${v('texto-suave')};
  font-family: ${v('familia')}; font-size: ${v('texto-micro')};
  cursor: pointer; white-space: nowrap;
}
.srv-pestana--puesta {
  background: ${v('superficie-elevada')}; color: ${v('marca')};
  font-weight: ${v('peso-fuerte')};
  box-shadow: ${v('sombra-sutil')};
}
.srv-pestana:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }

/* Lo escrito por alguien conserva sus renglones y NO desborda: un parrafo sin
   espacios estiraria la columna y sacaria scroll horizontal a toda la pagina. */
.srv-texto {
  margin: 0; font-size: ${v('texto-chico')}; color: ${v('texto')};
  white-space: pre-wrap; overflow-wrap: anywhere;
}

.srv-historial { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.srv-historial__renglon {
  display: flex; flex-direction: column; gap: 2px;
  padding: ${v('espacio-2')} 0;
  border-bottom: 1px solid ${v('borde-suave')};
  min-width: 0;
}
.srv-historial__renglon:last-child { border-bottom: none; }
.srv-historial__que { font-size: ${v('texto-chico')}; font-weight: ${v('peso-medio')}; }

.srv-color { display: inline-flex; align-items: center; gap: ${v('espacio-2')}; }
.srv-color__muestra {
  width: 16px; height: 16px; flex: none;
  border-radius: ${v('radio-chico')};
  border: 1px solid ${v('borde')};
}

/* Apagar un servicio es lo unico peligroso de esta pantalla, y se ve. */
.srv-boton-peligro {
  display: inline-flex; align-items: center; justify-content: center; gap: ${v('espacio-1')};
  min-height: 38px; padding: 0 ${v('espacio-3')};
  border: 1px solid ${v('peligro')}; border-radius: ${v('radio-sistema')};
  background: ${v('peligro-tenue')}; color: ${v('peligro')};
  font-family: ${v('familia')}; font-size: ${v('texto-micro')};
  cursor: pointer;
}
.srv-boton-peligro:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

/* ---------------------------------------------------------------- */
/* Los dias del formulario                                           */
/* ---------------------------------------------------------------- */
.srv-dias { border: none; margin: 0; padding: 0; min-width: 0; }
.srv-dias__fila { display: flex; flex-wrap: wrap; gap: ${v('espacio-1')}; margin-top: ${v('espacio-1')}; }
.srv-dia {
  min-width: 46px; min-height: 38px;
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('texto-suave')};
  font-family: ${v('familia')}; font-size: ${v('texto-micro')};
  cursor: pointer;
}
/* Marcado lleva color Y peso: solo con color, quien no distingue verde de gris
   no puede saber que dias escogio. */
.srv-dia--puesto {
  background: ${v('marca')}; color: ${v('sobre-marca')};
  border-color: ${v('marca')}; font-weight: ${v('peso-fuerte')};
}
.srv-dia:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.srv-dias__nota { margin: ${v('espacio-1')} 0 0; font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }

.srv-casilla {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  font-size: ${v('texto-chico')}; cursor: pointer;
}
.srv-casilla input { width: 18px; height: 18px; flex: none; accent-color: ${v('marca')}; }

/*
 * EL RESULTADO DE LA PREPARACION, EN PALABRAS.
 *
 * Se dice el total —"la agenda bloquea 75 minutos"— y no solo los sumandos,
 * porque la suma de tres campos es justo el calculo que nadie hace antes de
 * guardar, y equivocarse deja una agenda sin huecos que nadie sabe explicar.
 */
.srv-bloqueo {
  margin: -${v('espacio-1')} 0 0;
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border-left: 3px solid ${v('cat-citas')};
  border-radius: ${v('radio-sistema')};
  background: ${v('cat-citas-tenue')};
  color: ${v('texto-suave')};
  font-size: ${v('texto-micro')};
}

/* ---------------------------------------------------------------- */
/* Las categorias                                                    */
/* ---------------------------------------------------------------- */
.cat { display: flex; flex-direction: column; gap: ${v('espacio-3')}; min-width: 0; }
.cat__lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.cat__renglon {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-2')} 0;
  border-bottom: 1px solid ${v('borde-suave')};
}
.cat__renglon:last-child { border-bottom: none; }
.cat__color {
  width: 14px; height: 14px; flex: none;
  border-radius: ${v('radio-redondo')};
  border: 1px solid ${v('borde')};
  background: ${v('superficie-tenue')};
}
.cat__texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cat__nombre {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  font-size: ${v('texto-chico')}; font-weight: ${v('peso-medio')};
  overflow-wrap: anywhere;
}
/* El numero de uso SIEMPRE visible: es lo que hace que archivar sea una
   decision informada y no una sorpresa. */
.cat__uso { font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }
.cat__acciones { display: flex; gap: ${v('espacio-1')}; flex: none; flex-wrap: wrap; }
.cat__forma {
  display: flex; flex-direction: column; gap: ${v('espacio-3')};
  padding: ${v('espacio-3')};
  background: ${v('superficie-tenue')};
  border-radius: ${v('radio-sistema')};
}

/*
 * En celular la regla general de Clientes esconde la cuarta columna y las
 * acciones. Aqui la cuarta es el PRECIO y las acciones son la unica forma de
 * editar: esconderlos dejaria el catalogo de adorno. Se devuelven, y lo que se
 * va es la categoria, que no decide nada.
 */
@media (max-width: 640px) {
  .srv .cli-tabla__acciones,
  .srv .cli-tabla th:nth-child(4),
  .srv .cli-tabla td:nth-child(4) { display: table-cell; }
  .srv .cli-tabla th:nth-child(2), .srv .cli-tabla td:nth-child(2) { display: none; }
  .srv .cli-tabla__acciones { width: 48px; text-align: right; }
  .srv-descripcion { display: none; }
  .srv-detalle { position: static; }
}

/* ================================================================ */
/* CURSOS — el programa                                             */
/* ================================================================ */
/*
 * Reusa el esqueleto de Servicios —tarjetas, tabla, menu, paginacion, panel
 * con pestañas— y solo agrega lo suyo: la portada, las pestañas de la lista,
 * los lugares, los alumnos, las sesiones y el material.
 *
 * EN CELULAR LA TABLA SE VUELVE TARJETAS. Siete columnas en cuatrocientos
 * pixeles no se leen: se adivinan.
 */
.cur { min-width: 0; }

.cur-pestanas {
  display: flex; gap: 2px;
  border-bottom: 1px solid ${v('borde-suave')};
  overflow-x: auto;
  min-width: 0;
}
.cur-pestana {
  flex: none; min-height: 38px; padding: 0 ${v('espacio-3')};
  border: none; border-bottom: 2px solid transparent;
  background: transparent; color: ${v('texto-suave')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  cursor: pointer; white-space: nowrap;
}
/* La pestaña puesta lleva color Y linea: solo con color, quien no distingue
   verde de gris no sabe cual esta escogida. */
.cur-pestana--puesta {
  color: ${v('marca')}; border-bottom-color: ${v('marca')};
  font-weight: ${v('peso-fuerte')};
}
.cur-pestana:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }

/* ---------------------------------------------------------------- */
/* La portada                                                        */
/* ---------------------------------------------------------------- */
.cur-portada {
  width: 44px; height: 34px; flex: none;
  object-fit: cover;
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie-tenue')};
}
/* Sin imagen NO se carga una de ejemplo: va un icono neutro. */
.cur-portada--vacia {
  display: flex; align-items: center; justify-content: center;
  color: ${v('texto-tenue')};
}

.cur-fecha { display: flex; flex-direction: column; white-space: nowrap; }
.cur-fecha__cuanto { color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }

.cur-lugares { font-variant-numeric: ${v('cifra-numeros')}; white-space: nowrap; }
/* Lleno lleva color Y peso: el color solo no lo comunica a todo el mundo. */
.cur-lugares--lleno { color: ${v('advertencia')}; font-weight: ${v('peso-fuerte')}; }

/* ---------------------------------------------------------------- */
/* Los estados                                                       */
/* ---------------------------------------------------------------- */
.cur-estado--proximo    { color: ${v('cat-cursos')};  border-color: ${v('cat-cursos')}; }
.cur-estado--activo     { color: ${v('exito')};       border-color: ${v('exito')}; }
.cur-estado--finalizado { color: ${v('texto-suave')}; border-color: ${v('borde')}; }
.cur-estado--cancelado  { color: ${v('peligro')};     border-color: ${v('peligro')}; }
.cur-estado--inactivo   { color: ${v('texto-suave')}; border-color: ${v('borde')}; }

.cur-insc--inscrito     { color: ${v('exito')};       border-color: ${v('exito')}; }
.cur-insc--asistio      { color: ${v('cat-cursos')};  border-color: ${v('cat-cursos')}; }
.cur-insc--lista_espera { color: ${v('advertencia')}; border-color: ${v('advertencia')}; }
.cur-insc--cancelado    { color: ${v('texto-suave')}; border-color: ${v('borde')}; }
.cur-insc--debe         { color: ${v('advertencia')}; border-color: ${v('advertencia')}; }

.cur-ses--programada { color: ${v('cat-cursos')}; border-color: ${v('cat-cursos')}; }
.cur-ses--impartida  { color: ${v('exito')};      border-color: ${v('exito')}; }
.cur-ses--cancelada  { color: ${v('peligro')};    border-color: ${v('peligro')}; }

/* ---------------------------------------------------------------- */
/* La cabecera del panel                                             */
/* ---------------------------------------------------------------- */
.cur-cabecera { position: relative; min-width: 0; }
.cur-cabecera__imagen {
  width: 100%; height: 130px;
  object-fit: cover;
  border-radius: ${v('radio-tarjeta')};
  background: ${v('superficie-tenue')};
  display: block;
}

/*
 * EL VIDEO DE PRESENTACION, CON SU PROPORCION RESERVADA.
 *
 * "aspect-ratio: 16 / 9" con el marco en absoluto encima resuelve lo unico que
 * de verdad falla con un video incrustado: sin altura reservada, el hueco mide
 * cero hasta que YouTube contesta y toda la ficha da un brinco cuando el video
 * aparece — justo cuando alguien esta leyendo el renglon de abajo.
 */
.cur-video {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: ${v('radio-tarjeta')};
  overflow: hidden;
  background: ${v('superficie-tenue')};
}
.cur-video__marco {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  border: 0;
  display: block;
}
.cur-cabecera__imagen--vacia {
  display: flex; align-items: center; justify-content: center;
  color: ${v('texto-tenue')};
}
.cur-cabecera__estado {
  position: absolute; top: ${v('espacio-2')}; right: ${v('espacio-2')};
  background: ${v('superficie-elevada')};
}

/* ---------------------------------------------------------------- */
/* Alumnos                                                           */
/* ---------------------------------------------------------------- */
.cur-alumnos__cabeza {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  flex-wrap: wrap; min-width: 0;
}
.cur-alumnos__cabeza .cli-exp__etiqueta { flex: 1; min-width: 0; }
.cur-alumnos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.cur-alumno {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-2')};
  padding: ${v('espacio-2')} 0;
  border-bottom: 1px solid ${v('borde-suave')};
  min-width: 0;
}
.cur-alumno:last-child { border-bottom: none; }
.cur-alumno__quien {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  flex: 1 1 160px; min-width: 0;
  background: transparent; border: none; padding: 0; cursor: pointer;
  font-family: ${v('familia')}; font-size: ${v('texto-chico')}; color: ${v('texto')};
  text-align: left;
}
.cur-alumno__quien:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.cur-alumno__estados { display: flex; gap: ${v('espacio-1')}; flex-wrap: wrap; flex: none; }

/* ---------------------------------------------------------------- */
/* Sesiones y material                                               */
/* ---------------------------------------------------------------- */
.cur-sesiones, .cur-material {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column;
}
.cur-sesion, .cur-material__renglon {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-2')};
  padding: ${v('espacio-2')} 0;
  border-bottom: 1px solid ${v('borde-suave')};
  min-width: 0;
}
.cur-sesion:last-child, .cur-material__renglon:last-child { border-bottom: none; }
.cur-sesion__cuando { display: flex; flex-direction: column; flex: 1 1 160px; min-width: 0; }
.cur-sesion__titulo { font-size: ${v('texto-chico')}; font-weight: ${v('peso-medio')}; }

/* ---------------------------------------------------------------- */
/* Las tarjetas de celular                                           */
/* ---------------------------------------------------------------- */
/* En pantalla ancha manda la tabla; en angosta, las tarjetas. Nunca las dos. */
.cur-tarjetas { display: none; list-style: none; margin: 0; padding: 0; }

@media (max-width: 720px) {
  .cur-solo-ancho { display: none; }
  .cur-tarjetas { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
  .cur-tarjeta {
    display: flex; flex-direction: column; gap: ${v('espacio-2')};
    width: 100%; min-width: 0;
    padding: ${v('espacio-3')};
    border: 1px solid ${v('borde-suave')}; border-radius: ${v('radio-tarjeta')};
    background: ${v('superficie')};
    font-family: ${v('familia')}; font-size: ${v('texto-chico')}; color: ${v('texto')};
    text-align: left; cursor: pointer;
  }
  .cur-tarjeta--marcada { border-color: ${v('marca')}; background: ${v('marca-tenue')}; }
  .cur-tarjeta:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
  .cur-tarjeta__cabeza {
    display: flex; align-items: center; gap: ${v('espacio-2')}; min-width: 0;
  }
  .cur-tarjeta__cabeza .srv-nombre { flex: 1; min-width: 0; }
  .cur-tarjeta__datos {
    display: flex; flex-wrap: wrap; gap: ${v('espacio-3')};
    color: ${v('texto-suave')}; font-size: ${v('texto-micro')};
  }
}

/* ---------------------------------------------------------------- */
/* La sesion de curso DENTRO de la agenda                            */
/* ---------------------------------------------------------------- */
/*
 * Se ve distinta de una cita a proposito: es otro tipo de evento. Pintarlas
 * igual hace que nadie distinga una clase de veinte personas de una sesion
 * individual — y la diferencia importa para saber si la sala esta libre.
 */
.agenda-cita--curso {
  border-left-color: ${v('cat-cursos')};
  background: ${v('cat-cursos-tenue')};
}
.agenda-estado--curso {
  color: ${v('cat-cursos')};
  border-color: ${v('cat-cursos')};
  background: ${v('superficie')};
}


/* ================================================================ */
/* PRODUCTOS — el almacen                                           */
/* ================================================================ */
/*
 * Reusa el esqueleto de Servicios y Cursos. Lo suyo es la miniatura, el SKU,
 * el stock con su color, los movimientos y las ventas.
 */
.prd { min-width: 0; }

.prd-foto {
  width: 40px; height: 40px; flex: none;
  object-fit: cover;
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie-tenue')};
}
/* Sin imagen NO se carga una de ejemplo: va un icono neutro. */
.prd-foto--vacia {
  display: flex; align-items: center; justify-content: center;
  color: ${v('texto-tenue')};
}

.prd-sku {
  color: ${v('texto-suave')}; font-size: ${v('texto-micro')};
  font-variant-numeric: ${v('cifra-numeros')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* El numero del stock lleva color Y la palabra va al lado en su badge: solo
   con color, quien no distingue ambar de verde no sabe cual esta bajo. */
.prd-stock { font-variant-numeric: ${v('cifra-numeros')}; font-weight: ${v('peso-medio')}; }
.prd-stock--bajo    { color: ${v('advertencia')}; }
.prd-stock--agotado { color: ${v('peligro')}; }

.prd-estado--disponible { color: ${v('exito')};       border-color: ${v('exito')}; }
.prd-estado--bajo       { color: ${v('advertencia')}; border-color: ${v('advertencia')}; }
.prd-estado--agotado    { color: ${v('peligro')};     border-color: ${v('peligro')}; }

/* ---------------------------------------------------------------- */
/* La pestaña de inventario                                          */
/* ---------------------------------------------------------------- */
.prd-cifras {
  display: flex; flex-wrap: wrap; gap: ${v('espacio-4')};
  padding-bottom: ${v('espacio-3')};
  border-bottom: 1px solid ${v('borde-suave')};
}
.prd-cifra { display: flex; flex-direction: column; min-width: 0; }
.prd-cifra__valor {
  font-size: ${v('texto-grande')}; font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
}

.prd-movimientos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.prd-movimiento {
  display: flex; align-items: flex-start; gap: ${v('espacio-3')};
  padding: ${v('espacio-2')} 0;
  border-bottom: 1px solid ${v('borde-suave')};
  min-width: 0;
}
.prd-movimiento:last-child { border-bottom: none; }
.prd-movimiento__cantidad {
  flex: none; min-width: 48px; text-align: right;
  font-variant-numeric: ${v('cifra-numeros')};
  font-weight: ${v('peso-fuerte')};
  font-size: ${v('texto-chico')};
}
.prd-movimiento__cantidad--entra { color: ${v('exito')}; }
.prd-movimiento__cantidad--sale  { color: ${v('peligro')}; }

/* ---------------------------------------------------------------- */
/* La pestaña de ventas                                              */
/* ---------------------------------------------------------------- */
.prd-ventas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.prd-venta {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-2')};
  padding: ${v('espacio-2')} 0;
  border-bottom: 1px solid ${v('borde-suave')};
  min-width: 0;
}
.prd-venta:last-child { border-bottom: none; }
.prd-venta__cifras {
  display: flex; gap: ${v('espacio-3')}; flex: none;
  font-size: ${v('texto-chico')};
  font-variant-numeric: ${v('cifra-numeros')};
}


/* ================================================================ */
/* VENTAS — el punto de venta                                       */
/* ================================================================ */
/*
 * EN CELULAR EL PANEL DE LA DERECHA SE VA ABAJO, en el orden en que se cobra:
 * cliente, buscar, carrito, resumen, pago, finalizar. Un panel lateral de
 * trescientos veinte pixeles al lado de una tabla de siete columnas, en un
 * telefono, deja las dos cosas ilegibles.
 *
 * Y EL BOTON DE FINALIZAR ES EL ULTIMO DE LA COLUMNA a proposito: en un
 * mostrador se cobra de arriba hacia abajo, y tener el boton arriba hace que
 * se apriete antes de terminar de capturar.
 */
.vta { min-width: 0; }
.vta-columna, .vta-lateral {
  display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0;
}

/* ---------------------------------------------------------------- */
/* El historial por mes, semana y dia                                */
/* ---------------------------------------------------------------- */
/*
 * EL CALENDARIO A LA IZQUIERDA Y LA LISTA A LA DERECHA, y se apilan solos.
 *
 * En pantalla estrecha el calendario va ARRIBA a proposito: es el que decide
 * que se ve abajo, y debajo de una lista de diez ventas nadie lo encontraria.
 * En pantalla ancha son 240 y el resto, que es lo que hace falta para que
 * quepan "Semana 2 · 10 Ago — 16 Ago" y el importe en la misma linea.
 */
.vta-historial {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${v('espacio-4')};
  align-items: start;
  min-width: 0;
}
@media (min-width: 900px) {
  .vta-historial { grid-template-columns: 240px minmax(0, 1fr); }
}

.vta-calendario { display: flex; flex-direction: column; gap: ${v('espacio-3')}; }

/*
 * LA MIGA DE PAN: la forma de volver, y por eso va arriba del todo.
 *
 * Sin ella, bajar tres niveles deja sin salida mas que recargar — y perderse
 * un nivel es lo primero que pasa en una lista jerarquica.
 */
.vta-miga {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-1')};
  font-size: ${v('texto-micro')};
}
.vta-miga__paso {
  border: none; background: transparent; padding: 2px 4px;
  border-radius: ${v('radio-sistema')};
  color: ${v('marca')};
  font-family: ${v('familia')}; font-size: ${v('texto-micro')};
  cursor: pointer;
}
.vta-miga__paso:hover:not(:disabled) { background: ${v('marca-tenue')}; }
.vta-miga__paso:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
/* El paso donde estas parado no lleva a ningun lado: se apaga, y ademas deja
   de parecer un enlace. Un enlace que no navega enseña a no confiar en ellos. */
.vta-miga__paso:disabled { color: ${v('texto')}; font-weight: 600; cursor: default; }
.vta-miga__separa { color: ${v('texto-tenue')}; }

.vta-escalones { gap: 2px; }
.vta-escalon {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  width: 100%; min-height: 44px;
  padding: ${v('espacio-2')};
  border: 1px solid transparent;
  border-radius: ${v('radio-sistema')};
  background: transparent;
  text-align: left;
  font-family: ${v('familia')};
  cursor: pointer;
  min-width: 0;
}
.vta-escalon:hover { background: ${v('superficie-tenue')}; }
.vta-escalon:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }
.vta-escalon--puesto { border-color: ${v('marca')}; background: ${v('marca-tenue')}; }
.vta-escalon__cuerpo { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.vta-escalon__titulo {
  color: ${v('texto')}; font-size: ${v('texto-chico')}; font-weight: 600;
  overflow-wrap: anywhere;
}
.vta-escalon__pie {
  color: ${v('texto-suave')}; font-size: ${v('texto-micro')};
  overflow-wrap: anywhere;
}
/*
 * "font-variant-numeric: tabular-nums" alinea las cifras en columna aunque el
 * 1 sea mas angosto que el 8. Sin eso, dos importes de la misma longitud se ven
 * desalineados y comparar dos semanas de un vistazo deja de funcionar.
 */
.vta-escalon__importe {
  flex: none;
  color: ${v('texto')}; font-size: ${v('texto-micro')};
  font-variant-numeric: tabular-nums;
}
.vta-escalon__flecha { flex: none; color: ${v('texto-tenue')}; }

.vta-calendario__nota {
  display: flex; align-items: center; gap: ${v('espacio-1')};
  margin: 0;
  color: ${v('texto-suave')}; font-size: ${v('texto-micro')};
}
.vta-calendario__icono { display: inline-flex; color: ${v('marca')}; }

/*
 * Dos tarjetas lado a lado que en pantalla chica se apilan solas.
 *
 * "align-items: start" NO es un detalle: sin el, la tarjeta corta se estira al
 * alto de su vecina y le queda un pie de blanco que no significa nada. Es la
 * version en pequeño del reclamo del espacio en blanco.
 */
.vta-dos {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: ${v('espacio-4')}; min-width: 0;
  align-items: start;
}

/* ---------------------------------------------------------------- */
/* Cliente, fecha y vendedor                                         */
/* ---------------------------------------------------------------- */
.vta-quien {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${v('espacio-4')}; align-items: start;
}
.vta-quien__campo { display: flex; flex-direction: column; gap: ${v('espacio-1')}; min-width: 0; }
.vta-buscar-cliente { display: flex; flex-direction: column; gap: ${v('espacio-2')}; min-width: 0; }
.vta-escogido {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  min-height: 44px; padding: 0 ${v('espacio-2')};
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  min-width: 0;
}
.vta-escogido .cli-persona__nombre { flex: 1; min-width: 0; }

.vta-fecha {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  min-height: 44px; padding: 0 ${v('espacio-2')};
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  min-width: 0;
}
.vta-fecha__campo {
  flex: 1; min-width: 0;
  border: none; background: transparent; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
}
.vta-fecha__campo:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

/* ---------------------------------------------------------------- */
/* De que cita sale este cobro                                       */
/* ---------------------------------------------------------------- */
/*
 * NO ES DECORACION: es lo que deja comprobar de un vistazo que el carrito que
 * aparecio lleno corresponde a la sesion que se acaba de dar —el dia, la hora
 * y la terapeuta— antes de apretar cobrar. Sin esta franja, quien cobra ve un
 * carrito que se armo solo y no sabe si es el de las 10:30 o el de las 11:00.
 */
.vta-cita {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border: 1px solid ${v('cat-citas')};
  border-radius: ${v('radio-sistema')};
  background: ${v('cat-citas-tenue')};
  min-width: 0;
}
.vta-cita__icono { display: inline-flex; color: ${v('cat-citas')}; flex: none; }
.vta-cita__texto { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.vta-cita__titulo {
  font-weight: 600; color: ${v('texto')}; font-size: ${v('texto-chico')};
  overflow-wrap: anywhere;
}
.vta-cita__pie {
  color: ${v('texto-suave')}; font-size: ${v('texto-micro')};
  overflow-wrap: anywhere;
}
.vta-cita__quitar {
  flex: none; width: 28px; height: 28px;
  border: none; border-radius: ${v('radio-sistema')};
  background: transparent; color: ${v('texto-suave')};
  font-size: ${v('texto-normal')}; line-height: 1; cursor: pointer;
}
.vta-cita__quitar:hover { background: ${v('superficie-tenue')}; color: ${v('texto')}; }
.vta-cita__quitar:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
/* Ya cobrada: el aviso deja de ser una guia y pasa a ser un freno. */
.vta-cita--cobrada { border-color: ${v('advertencia')}; background: ${v('advertencia-tenue')}; }
.vta-cita--cobrada .vta-cita__icono { color: ${v('advertencia')}; }
.vta-cita--cargando { color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }

.vta-encontrados, .vta-catalogo {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 2px;
  min-width: 0;
}
.vta-concepto {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  width: 100%; min-height: 44px; padding: ${v('espacio-2')};
  border: 1px solid ${v('borde-suave')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  text-align: left; cursor: pointer;
  min-width: 0;
}
.vta-concepto:hover:not(:disabled) { background: ${v('superficie-tenue')}; }
/* Agotado NO se esconde: se enseña apagado, para que quien busca sepa que
   existe y que se acabo, en vez de creer que nunca se dio de alta. */
.vta-concepto:disabled { opacity: 0.5; cursor: default; }
.vta-concepto:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.vta-concepto .srv-nombre { flex: 1; min-width: 0; }
.vta-concepto__precio {
  flex: none; font-variant-numeric: ${v('cifra-numeros')}; font-weight: ${v('peso-fuerte')};
}

/* ---------------------------------------------------------------- */
/* El carrito                                                        */
/* ---------------------------------------------------------------- */
.vta-buscar {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-3')}; min-width: 0;
}
.vta-tipos {
  display: flex; gap: 2px; padding: 2px; flex: none;
  background: ${v('superficie-tenue')}; border-radius: ${v('radio-sistema')};
  overflow-x: auto;
}
.vta-tipo {
  min-height: 34px; padding: 0 ${v('espacio-3')};
  border: none; border-radius: ${v('radio-chico')};
  background: transparent; color: ${v('texto-suave')};
  font-family: ${v('familia')}; font-size: ${v('texto-micro')};
  cursor: pointer; white-space: nowrap;
}
.vta-tipo--puesto {
  background: ${v('superficie-elevada')}; color: ${v('marca')};
  font-weight: ${v('peso-fuerte')}; box-shadow: ${v('sombra-sutil')};
}
.vta-tipo:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }

/* Cada tipo con su tono, el mismo que en las tarjetas del tablero: se
   distinguen sin leer la palabra, y la palabra sigue estando. */
.vta-tipo--servicio { color: ${v('cat-citas')};      border-color: ${v('cat-citas')}; }
.vta-tipo--producto { color: ${v('cat-productos')};  border-color: ${v('cat-productos')}; }
.vta-tipo--curso    { color: ${v('cat-cursos')};     border-color: ${v('cat-cursos')}; }

.vta-cantidad { display: inline-flex; align-items: center; gap: ${v('espacio-1')}; }
.vta-cantidad__valor {
  min-width: 32px; text-align: center;
  font-variant-numeric: ${v('cifra-numeros')}; font-weight: ${v('peso-medio')};
}

.vta-nota {
  width: 100%; min-height: 60px; padding: ${v('espacio-2')};
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  resize: vertical;
}
.vta-nota:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.vta-nota__pie { display: flex; }

/* ---------------------------------------------------------------- */
/* Totales, metodos y cambio                                         */
/* ---------------------------------------------------------------- */
/*
 * LA COLUMNA DEL COBRO SE QUEDA A LA VISTA, Y SE PUEDE RECORRER POR DENTRO.
 *
 * QUE PASABA, Y ES EL PEOR FALLO DE USO QUE HA TENIDO EL PRODUCTO: la tarjeta
 * del cobro llevaba "position: sticky" ella sola. Un elemento pegajoso se pega
 * dentro de SU contenedor, y el contenedor —la columna de la derecha— es mas
 * corto que el carrito. Al meter productos, el carrito crecia, la pagina se
 * alargaba, y al bajar a buscar el boton de Cobrar la columna entera ya se
 * habia quedado arriba. Se veia como si la pantalla se hubiera comido el boton.
 *
 * Y ADEMAS, cuando la propia tarjeta de cobro era mas alta que la pantalla
 * —varios pagos, el desglose, el cambio— su parte de abajo no habia forma de
 * alcanzarla: lo pegajoso se mueve CON la pagina, asi que desplazarse no la
 * sube. El boton estaba ahi, pintado, y no se podia tocar.
 *
 * EL ARREGLO son dos reglas y las dos hacen falta:
 *
 *   · lo pegajoso es la COLUMNA, no una tarjeta suelta, para que acompañe al
 *     carrito entero mientras crece;
 *   · con "max-height" de la ventana y "overflow-y: auto", si lo de dentro no
 *     cabe se recorre DENTRO de la columna — con la rueda, con el dedo y con
 *     la barra. Sin el "max-height" el pegajoso simplemente se sale.
 *
 * SOLO EN LA REJILLA DE DOS COLUMNAS. Debajo de 1180 el cobro va apilado bajo
 * el carrito y la pagina entera se desplaza: dejarlo pegajoso ahi lo clavaria a
 * media pantalla tapando el carrito, que es justo lo contrario de lo que hace
 * falta en un telefono.
 */
@media (min-width: 1180px) {
  .vta-lateral {
    position: sticky;
    top: ${v('espacio-4')};
    max-height: calc(100dvh - ${v('espacio-8')});
    overflow-y: auto;
    /* Al llegar al final de la columna, la rueda NO sigue moviendo la pagina de
       atras: se estaba cobrando y la lista de productos se iba sola. */
    overscroll-behavior: contain;
    /* Un dedo tiene que poder arrastrar aqui dentro, no solo la rueda. */
    -webkit-overflow-scrolling: touch;
  }
}

.vta-totales { margin: 0; display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.vta-totales > div {
  display: flex; justify-content: space-between; gap: ${v('espacio-3')};
  font-size: ${v('texto-chico')};
}
.vta-totales dt { color: ${v('texto-suave')}; }
.vta-totales dd { margin: 0; font-variant-numeric: ${v('cifra-numeros')}; }
/* El descuento resta: se pinta como resta, y con el signo delante. Solo con
   color, quien no distingue verde de gris lo lee como si sumara. */
.vta-totales__resta { color: ${v('exito')}; }
.vta-totales__total {
  padding-top: ${v('espacio-2')};
  border-top: 1px solid ${v('borde-suave')};
  font-size: ${v('texto-normal')}; font-weight: ${v('peso-fuerte')};
}
.vta-totales__total dt { color: ${v('texto')}; }

.vta-apagar {
  display: flex; justify-content: space-between; align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-3')};
  border: 1px solid ${v('marca')}; border-radius: ${v('radio-sistema')};
  background: ${v('marca-tenue')};
  min-width: 0;
}
.vta-apagar__que { font-size: ${v('texto-chico')}; font-weight: ${v('peso-medio')}; }
.vta-apagar__cuanto {
  font-size: ${v('texto-grande')}; font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
  color: ${v('marca')};
}

.vta-metodos { display: flex; flex-direction: column; gap: ${v('espacio-2')}; min-width: 0; }
.vta-metodos__botones { display: flex; flex-wrap: wrap; gap: ${v('espacio-2')}; min-width: 0; }
.vta-metodos__rejilla {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: ${v('espacio-2')}; min-width: 0;
}
.vta-metodo {
  display: inline-flex; align-items: center; justify-content: center; gap: ${v('espacio-2')};
  min-height: 40px; padding: 0 ${v('espacio-3')};
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-micro')};
  cursor: pointer; white-space: nowrap; min-width: 0;
}
.vta-metodo:hover { background: ${v('superficie-tenue')}; }
/* El escogido lleva borde Y fondo: solo el borde no se ve en una tableta con
   sol encima, que es donde de verdad se cobra. */
.vta-metodo--puesto {
  border-color: ${v('marca')}; background: ${v('marca-tenue')}; color: ${v('marca')};
  font-weight: ${v('peso-fuerte')};
}
.vta-metodo:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

.vta-reparto { display: flex; flex-direction: column; gap: ${v('espacio-2')}; min-width: 0; }
.vta-pagos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.vta-pago {
  display: flex; align-items: center; gap: ${v('espacio-2')}; min-width: 0;
}
.vta-pago__metodo { flex: 1; min-width: 0; font-size: ${v('texto-chico')}; }
.vta-pago__monto {
  flex: none; font-variant-numeric: ${v('cifra-numeros')}; font-weight: ${v('peso-medio')};
}

/*
 * TRES COSAS ARRIBA Y EL BOTON ABAJO, DE LADO A LADO.
 *
 * En fila envuelta, "Aplicar" caia solo en la segunda linea y se quedaba a
 * media anchura, colgando: en el panel de trescientos cuarenta pixeles no
 * caben las cuatro piezas seguidas. Puesto en rejilla, la segunda linea es a
 * proposito y el boton ocupa el ancho entero, que ademas es mas facil de
 * apretar en una tableta.
 */
.vta-descuento-general {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: ${v('espacio-2')};
  min-width: 0;
}
.vta-descuento-general > .pz-boton { grid-column: 1 / -1; width: 100%; }
.vta-descuento__signo {
  flex: none; min-width: 34px; min-height: 40px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie-tenue')}; color: ${v('texto-suave')};
}
.vta-descuento__campo {
  flex: 1 1 90px; min-width: 0; min-height: 40px;
  padding: 0 ${v('espacio-2')};
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  text-align: right; font-variant-numeric: ${v('cifra-numeros')};
}
.vta-descuento__campo:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

.vta-efectivo { display: flex; flex-direction: column; gap: ${v('espacio-2')}; min-width: 0; }
.vta-cambio {
  display: flex; justify-content: space-between; align-items: center; gap: ${v('espacio-3')};
}
.vta-cambio__valor {
  font-weight: ${v('peso-fuerte')}; font-variant-numeric: ${v('cifra-numeros')};
  color: ${v('marca')};
}

.vta-acciones { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }

.vta-listo {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-3')};
  border: 1px solid ${v('exito')}; border-radius: ${v('radio-sistema')};
  background: ${v('exito-tenue')};
  min-width: 0;
}
.vta-listo .cli-exp__valor { flex: 1; min-width: 0; }

/* ---------------------------------------------------------------- */
/* Estados de la venta y de la cotizacion                            */
/* ---------------------------------------------------------------- */
.vta-estado--cobrada   { color: ${v('exito')};       border-color: ${v('exito')}; }
.vta-estado--borrador  { color: ${v('texto-suave')}; border-color: ${v('borde')}; }
.vta-estado--cancelada { color: ${v('peligro')};     border-color: ${v('peligro')}; }

.vta-cot--abierta    { color: ${v('cat-cursos')};    border-color: ${v('cat-cursos')}; }
.vta-cot--aceptada   { color: ${v('exito')};         border-color: ${v('exito')}; }
.vta-cot--vencida    { color: ${v('advertencia')};   border-color: ${v('advertencia')}; }
.vta-cot--cancelada  { color: ${v('peligro')};       border-color: ${v('peligro')}; }
.vta-cot--convertida { color: ${v('marca')};         border-color: ${v('marca')}; }

/* ---------------------------------------------------------------- */
/* Las cifras y las ultimas ventas del dia                           */
/* ---------------------------------------------------------------- */
/*
 * CUATRO CIFRAS EN UNA TARJETA DE CUATROCIENTOS PIXELES, no las cuatro grandes
 * de Inicio. Con el cuadro de icono de 48 y el aire de la tarjeta ancha, tres
 * columnas de ciento veintitres pixeles cortaban "$1,900.00" por la mitad.
 *
 * Dos por dos, y la cifra en version apretada: el icono baja a 34, el aire a la
 * mitad y el numero a tamaño de dato. Se sigue leyendo de un vistazo y ya no se
 * sale de su caja.
 */
.vta-cifras {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${v('espacio-2')}; min-width: 0;
}
.vta-cifra { padding: ${v('espacio-3')}; gap: ${v('espacio-3')}; }
.vta-cifra .pz-cifra__icono { width: 34px; height: 34px; border-radius: 10px; }
.vta-cifra .pz-cifra__valor { font-size: ${v('texto-grande')}; }
.vta-cifra .pz-cifra__pie {
  font-variant-numeric: ${v('cifra-numeros')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.vta-ultimas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.vta-ultima { border-bottom: 1px solid ${v('borde-suave')}; }
.vta-ultima:last-child { border-bottom: none; }
.vta-ultima__abrir {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-2')};
  width: 100%; padding: ${v('espacio-2')} 0;
  border: none; background: transparent; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  text-align: left; cursor: pointer; min-width: 0;
}
.vta-ultima__abrir:hover { background: ${v('superficie-tenue')}; }
.vta-ultima__abrir:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }
.vta-ultima__hora {
  flex: none; color: ${v('texto-suave')}; font-variant-numeric: ${v('cifra-numeros')};
}
.vta-ultima__quien { flex: 1 1 100px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.vta-ultima__folio { flex: none; color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }
.vta-ultima__total {
  flex: none; font-variant-numeric: ${v('cifra-numeros')}; font-weight: ${v('peso-medio')};
}

.vta-detalle { min-width: 0; }


/* ================================================================ */
/* CAJA — el cajon                                                  */
/* ================================================================ */
/*
 * Reusa el esqueleto de Ventas: las mismas tarjetas de cifra, el mismo cuerpo
 * de lista mas panel, los mismos totales. Lo suyo es el anillo de formas de
 * pago, los renglones por clase y los tres colores del corte.
 */
.caja { min-width: 0; }
.caja-columna { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

.caja-dato {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: ${v('espacio-3')}; min-width: 0;
}
.caja-dato .cli-exp__valor { text-align: right; }

.caja-aparte {
  display: flex; flex-direction: column; gap: 2px;
  padding: ${v('espacio-3')};
  border: 1px dashed ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie-tenue')};
  min-width: 0;
}

.caja-acciones { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }

/*
 * ENTRAR Y SACAR DINERO SON OPUESTOS, y en gris se leian igual. En un mostrador
 * con prisa, apretar "retiro" creyendo que era "ingreso" descuadra el corte y
 * despues nadie sabe por que. El color va en el borde y en el icono; la palabra
 * sigue ahi, que es lo que lee quien no distingue los tonos.
 */
.caja-accion--entra { border-color: ${v('exito')}; color: ${v('exito')}; }
.caja-accion--entra:hover:not(:disabled) { background: ${v('exito-tenue')}; }
.caja-accion--sale { border-color: ${v('advertencia')}; color: ${v('advertencia')}; }
.caja-accion--sale:hover:not(:disabled) { background: ${v('advertencia-tenue')}; }

/* ---------------------------------------------------------------- */
/* LA TARJETA DE "CAJA ACTUAL"                                       */
/* ---------------------------------------------------------------- */
/*
 * Antes eran cuatro tarjetas de cifra sueltas y la identidad del turno estaba en
 * la columna de la derecha. Las cuatro cifras son UNA cuenta
 * —inicial + entro − salio = en el cajon— y sueltas se leian como cuatro cosas
 * sin relacion. Juntas, la cuenta se lee de corrido.
 */
.caja-actual {
  /* EN FILA, Y HAY QUE DECIRLO: "pz-tarjeta" es una columna, asi que sin esta
     linea la identidad y las cifras se apilaban y "align-items: center" las
     centraba a lo ancho, dejando medio metro de blanco a la izquierda. */
  display: flex; flex-direction: row; flex-wrap: wrap; align-items: center;
  gap: ${v('espacio-4')} ${v('espacio-6')};
  min-width: 0;
}
/*
 * La identidad NO crece con "flex: 1": en una columna eso mide alto (la trampa
 * que ya se pago tres veces). Crece por ancho minimo y se envuelve cuando no
 * cabe, que es lo que hace falta.
 */
.caja-actual__quien {
  display: flex; flex-direction: column; gap: 2px;
  flex: 1 1 auto; min-width: min(220px, 100%);
}
.caja-actual__nombre { font-size: ${v('texto-titulo')}; }

.caja-actual__cifras {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: ${v('espacio-4')};
  flex: 2 1 auto; min-width: min(320px, 100%);
}
.caja-actual__cifra {
  display: flex; align-items: flex-start; gap: ${v('espacio-3')};
  padding: ${v('espacio-3')};
  border-radius: ${c('radio-control')};
  min-width: 0;
}
/* La ultima va marcada: es la que se compara con lo que se cuenta al cerrar. */
.caja-actual__cifra--marcada { background: ${v('marca-tenue')}; }
.caja-actual__cifra--marcada .caja-actual__valor { color: ${v('marca')}; }
.caja-actual__valor { font-size: ${v('texto-grande')}; }

/* El consejo: callado a proposito, para no competir con las cifras. */
.caja-consejo {
  display: flex; align-items: flex-start; gap: ${v('espacio-3')};
  padding: ${v('espacio-4')};
  border: 1px dashed ${c('borde-tarjeta')};
  border-radius: ${c('radio-tarjeta')};
  background: ${v('superficie-tenue')};
  min-width: 0;
}
.caja-consejo p { margin: 0; }

/* ---------------------------------------------------------------- */
/* El anillo de formas de pago                                       */
/* ---------------------------------------------------------------- */
/*
 * EL PASTEL LLENA SU TARJETA, y esto es la segunda mitad de un arreglo que a
 * medias quedo peor que antes.
 *
 * El par "Metodos de pago" y "Movimientos de la caja" va lado a lado, y el
 * segundo es bastante mas alto. Con las tarjetas de alto natural quedaban 190
 * pixeles de blanco DEBAJO del pastel; al igualarlas, el blanco se metio DENTRO
 * de su tarjeta — el mismo hueco, movido de sitio. Un hueco tiene que ser aire,
 * no espacio que sobro porque algo no lleno su caja.
 *
 * Asi que el contenido crece con la tarjeta y se centra: lo que sobra se
 * reparte arriba y abajo del pastel y se lee como aire alrededor de una
 * grafica, que es lo que de verdad es.
 */
.caja-pastel {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-4')}; min-width: 0;
  flex: 1;
  justify-content: center;
}
.caja-anillo { position: relative; flex: none; width: 150px; height: 150px; }
.caja-anillo svg { width: 100%; height: 100%; }
/*
 * LAS REBANADAS ESCUCHAN AL PUNTERO y el grosor cambia con una transicion.
 *
 * Solo se anima el grosor del trazo, que no mueve nada de sitio: engordar un
 * arco hacia adentro y hacia afuera lo destaca sin desplazarlo, y desplazar
 * algo que se esta apuntando hace fallar el clic.
 */
.rep-rebanada {
  transition: stroke-width ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
  cursor: default;
}
.rep-rebanada--viva { filter: brightness(1.05); }
.caja-anillo__centro {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; pointer-events: none;
  /*
   * EL CENTRO NO PUEDE PASAR DEL HUECO DEL ANILLO.
   *
   * El anillo mide 150 y su trazo se come 22 por lado: el cuadrado libre de
   * dentro tiene unos 106 de lado, y por la curva solo se puede escribir en la
   * franja central. 96 es ese ancho util. Sin este limite, "$44,575.00" se
   * salia por los dos lados y se leia encima del arco.
   */
  max-width: 104px;
  margin: 0 auto;
  padding: 0 2px;
}
/*
 * DENTRO DEL ANILLO LA CIFRA EMPIEZA MAS CHICA, y esto se midio.
 *
 * El hueco util son 104 pixeles. A "texto-titulo" —el tamaño de las tarjetas
 * de arriba— "$24,850.00" mide 92 de ancho Y CINCUENTA DE ALTO: se partia en
 * dos renglones a media cifra, "$24,850." arriba y "00" abajo. Que quepa
 * partiendo un numero por la mitad no es que quepa.
 *
 * Asi que aqui la escala es otra —la misma que en el diseño de referencia— y
 * "white-space: nowrap" impide el corte: si no cabe, encoge; nunca parte.
 * Los tres escalones son los mismos que pone "claseDeCifra"; lo unico que
 * cambia es de donde arrancan.
 */
.caja-anillo__centro .tt-dato {
  font-size: ${v('texto-normal')};
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.caja-anillo__centro .pz-cifra--larga { font-size: ${v('texto-chico')}; }
.caja-anillo__centro .pz-cifra--muy-larga { font-size: ${v('texto-micro')}; }
/* Miles de millones dentro de un anillo de ciento cincuenta pixeles: aqui si
   se deja partir, porque encogerlo mas seria ilegible. La leyenda de al lado
   repite la cifra entera de todas formas. */
.caja-anillo__centro .pz-cifra--enorme {
  font-size: ${v('texto-micro')};
  white-space: normal;
  overflow-wrap: anywhere;
}
.caja-anillo__que { font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }
.caja-anillo__cuanto {
  font-size: ${v('texto-chico')}; font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
}
.caja-anillo__parte--citas     { stroke: ${v('cat-citas')}; }
.caja-anillo__parte--ventas    { stroke: ${v('cat-ventas')}; }
.caja-anillo__parte--cursos    { stroke: ${v('cat-cursos')}; }
.caja-anillo__parte--productos { stroke: ${v('cat-productos')}; }

/* LA LEYENDA NO ES DECORACION: es la version legible del dibujo, para quien no
   distingue los colores y para quien usa lector de pantalla. */
.caja-leyenda {
  list-style: none; margin: 0; padding: 0; flex: 1 1 220px;
  display: flex; flex-direction: column; gap: ${v('espacio-2')}; min-width: 0;
}
.caja-leyenda__renglon {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  font-size: ${v('texto-chico')}; min-width: 0;
  padding: 2px ${v('espacio-2')};
  margin: 0 -${v('espacio-2')};
  border-radius: ${v('radio-sistema')};
}
/* Apuntar el nombre resalta su rebanada, y al reves. Es el mismo puente en los
   dos sentidos: sin el, saber que arco es cual obliga a cruzar cinco tonos de
   la misma familia con cinco puntos de color, y eso no lo hace nadie. */
.caja-leyenda__renglon--viva { background: ${v('superficie-tenue')}; }
.caja-leyenda__punto { width: 10px; height: 10px; border-radius: ${v('radio-redondo')}; flex: none; }
.caja-leyenda__punto--citas     { background: ${v('cat-citas')}; }
.caja-leyenda__punto--ventas    { background: ${v('cat-ventas')}; }
.caja-leyenda__punto--cursos    { background: ${v('cat-cursos')}; }
.caja-leyenda__punto--productos { background: ${v('cat-productos')}; }
.caja-leyenda__que { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.caja-leyenda__cuanto {
  flex: none; font-variant-numeric: ${v('cifra-numeros')}; font-weight: ${v('peso-medio')};
}
.caja-leyenda__parte {
  flex: none; min-width: 44px; text-align: right;
  color: ${v('texto-suave')}; font-variant-numeric: ${v('cifra-numeros')};
}

/* ---------------------------------------------------------------- */
/* Los movimientos agrupados por clase                               */
/* ---------------------------------------------------------------- */
.caja-clases { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.caja-clase {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-2')} 0;
  border-bottom: 1px solid ${v('borde-suave')};
  font-size: ${v('texto-chico')}; min-width: 0;
}
.caja-clase:last-child { border-bottom: none; }
.caja-clase__que { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.caja-clase__cuantos {
  flex: none; color: ${v('texto-suave')}; font-variant-numeric: ${v('cifra-numeros')};
}
.caja-clase__monto {
  flex: none; min-width: 90px; text-align: right;
  font-variant-numeric: ${v('cifra-numeros')}; font-weight: ${v('peso-medio')};
}
/* El que sale lleva color Y el signo delante: solo con color, quien no lo
   distingue no sabe cual resta. */
.caja-clase__monto--sale { color: ${v('peligro')}; }
.caja-clases__pie {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  padding-top: ${v('espacio-3')};
  border-top: 1px solid ${v('borde-suave')};
  font-size: ${v('texto-chico')}; font-weight: ${v('peso-fuerte')};
}

.caja-clase--venta       { color: ${v('exito')};       border-color: ${v('exito')}; }
.caja-clase--ingreso     { color: ${v('cat-visitas')}; border-color: ${v('cat-visitas')}; }
.caja-clase--retiro      { color: ${v('advertencia')}; border-color: ${v('advertencia')}; }
.caja-clase--gasto       { color: ${v('cat-productos')}; border-color: ${v('cat-productos')}; }
.caja-clase--cancelacion { color: ${v('peligro')};     border-color: ${v('peligro')}; }
.caja-clase--devolucion  { color: ${v('cat-cursos')};  border-color: ${v('cat-cursos')}; }

.caja-metodo--efectivo      { color: ${v('cat-citas')};     border-color: ${v('cat-citas')}; }
.caja-metodo--tarjeta       { color: ${v('cat-cursos')};    border-color: ${v('cat-cursos')}; }
.caja-metodo--transferencia { color: ${v('cat-ventas')};    border-color: ${v('cat-ventas')}; }
.caja-metodo--otro          { color: ${v('texto-suave')};   border-color: ${v('borde')}; }

.caja-entra { color: ${v('exito')}; }
.caja-sale  { color: ${v('peligro')}; }

/* ---------------------------------------------------------------- */
/* El corte                                                          */
/* ---------------------------------------------------------------- */
.caja-estado--abierta { color: ${v('exito')};       border-color: ${v('exito')}; }
.caja-estado--cerrada { color: ${v('texto-suave')}; border-color: ${v('borde')}; }

/* Los tres estados del corte llevan color Y palabra. Un numero rojo sin la
   frase "faltan 50" no le dice a nadie que hacer. */
.caja-diferencia--cuadra { color: ${v('exito')}; }
.caja-diferencia--sobra  { color: ${v('advertencia')}; }
.caja-diferencia--falta  { color: ${v('peligro')}; }

/*
 * EL VEREDICTO DEL CORTE. Es lo unico que le importa a quien acaba de contar el
 * cajon, asi que se lee de un golpe: la marca grande, la palabra, y la cifra.
 *
 * Antes era una tirita con la frase en letra normal debajo de una lista de tres
 * numeros: para saber si cuadraba habia que restar con la vista. Al final del
 * dia y con prisa, eso es justo cuando se equivoca uno.
 */
.caja-veredicto {
  display: flex; align-items: center; gap: ${v('espacio-4')};
  padding: ${v('espacio-5')};
  border-radius: ${c('radio-tarjeta')};
  border: 1px solid ${v('borde')};
  background: ${v('superficie-tenue')};
  min-width: 0;
}
.caja-veredicto__marca {
  flex: none;
  width: 52px; height: 52px;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${c('radio-pastilla')};
  background: ${v('superficie-elevada')};
}
.caja-veredicto__texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.caja-veredicto__que { font-size: ${v('texto-grande')}; font-weight: ${v('peso-fuerte')}; }
/* La cifra en grande: es el numero que se va a anotar o a buscar. */
.caja-veredicto__cuanto {
  font-size: ${v('texto-titulo')};
  font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.caja-veredicto--cuadra .caja-veredicto__que,
.caja-veredicto--cuadra .caja-veredicto__marca { color: ${v('exito')}; }
.caja-veredicto--sobra .caja-veredicto__que,
.caja-veredicto--sobra .caja-veredicto__cuanto,
.caja-veredicto--sobra .caja-veredicto__marca { color: ${v('advertencia')}; }
.caja-veredicto--falta .caja-veredicto__que,
.caja-veredicto--falta .caja-veredicto__cuanto,
.caja-veredicto--falta .caja-veredicto__marca { color: ${v('peligro')}; }
.caja-veredicto--cuadra { border-color: ${v('exito')};       background: ${v('exito-tenue')}; }
.caja-veredicto--sobra  { border-color: ${v('advertencia')}; background: ${v('advertencia-tenue')}; }
.caja-veredicto--falta  { border-color: ${v('peligro')};     background: ${v('peligro-tenue')}; }

/* ================================================================ */
/* GASTOS — lo que sale                                             */
/* ================================================================ */
/*
 * Reusa TODO lo compartido: la tarjeta, la pastilla, la cifra, la tabla, el
 * buscador y el anillo de Caja. Aqui solo vive lo que de verdad es de este
 * modulo — la barra de la lista, las barras del dia a dia y el aviso de lo que
 * le va a pasar a la caja.
 */
.gto { min-width: 0; }

/* La cifra que compara contra el periodo anterior. En GASTOS el signo se lee
   al reves que en ventas: gastar menos es la buena noticia. */
.gto-cifra--baja .pz-cifra__pie { color: ${v('exito')}; }
.gto-cifra--sube .pz-cifra__pie { color: ${v('peligro')}; }

.gto-barra {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  flex-wrap: wrap; min-width: 0;
}

/* El encabezado que ordena. Es un boton de verdad —no un th con onClick— para
   que se llegue con teclado y se anuncie como lo que es. */
.gto-ordenar {
  display: inline-flex; align-items: center; gap: ${v('espacio-1')};
  padding: 0; border: none; background: transparent;
  color: inherit; font: inherit; cursor: pointer;
}
.gto-ordenar:hover { color: ${v('texto')}; }
.gto-ordenar:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.gto-ordenar__flecha { color: ${v('marca')}; }

.gto-campo {
  width: 100%; min-height: 42px;
  padding: 0 ${v('espacio-3')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
}
.gto-campo--area { min-height: 64px; padding: ${v('espacio-2')} ${v('espacio-3')}; resize: vertical; }
.gto-campo:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.gto-campo::placeholder { color: ${v('texto-tenue')}; }

.gto-monto { position: relative; display: flex; align-items: center; min-width: 0; }
.gto-monto__signo {
  position: absolute; left: ${v('espacio-3')};
  color: ${v('texto-tenue')}; pointer-events: none;
}
.gto-monto .gto-campo {
  padding-left: 28px;
  font-variant-numeric: ${v('cifra-numeros')};
}

/* El error va DEBAJO de su campo y en rojo. Un mensaje suelto arriba obliga a
   mirar los diez campos buscando cual esta mal. */
.gto-error {
  color: ${v('peligro')};
  font-size: ${v('texto-micro')};
}

.gto-metodos { display: flex; flex-wrap: wrap; gap: ${v('espacio-2')}; }
.gto-mixto { align-items: start; }

.gto-casilla { flex-direction: row; align-items: center; gap: ${v('espacio-2')}; }

/* Lo que le va a pasar a la caja, dicho ANTES de guardar: es la conexion que
   mas confunde cuando no se explica. */
.gto-aviso-caja {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  margin: 0;
  padding: ${v('espacio-3')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie-tenue')};
  color: ${v('texto-suave')};
  font-size: ${v('texto-micro')};
}

.gto-formulario { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

/* Cada forma de pago con su tono, el mismo que usa Caja para que la misma
   palabra no se vea de dos colores en dos pantallas. */
.gto-metodo--efectivo      { background: ${v('exito-tenue')};       color: ${v('exito')}; }
.gto-metodo--tarjeta       { background: ${v('cat-ventas-tenue')};  color: ${v('cat-ventas')}; }
.gto-metodo--transferencia { background: ${v('cat-citas-tenue')};   color: ${v('cat-citas')}; }
.gto-metodo--mixto         { background: ${v('cat-cursos-tenue')};  color: ${v('cat-cursos')}; }

/* El renglon de un agrupado: nombre, barra y monto. */
.gto-grupo { gap: ${v('espacio-3')}; }
.gto-grupo__monto { flex: none; font-variant-numeric: ${v('cifra-numeros')}; }
.gto-barra-parte {
  flex: 0 1 120px; height: 6px; min-width: 40px;
  border-radius: ${c('radio-pastilla')};
  background: ${v('superficie-tenue')};
  overflow: hidden;
}
.gto-barra-parte__lleno {
  display: block; height: 100%;
  border-radius: ${c('radio-pastilla')};
  background: ${v('marca')};
  transition: width ${v('movimiento-curva')} ${v('movimiento-normal')};
}

/* ---------------------------------------------------------------- */
/* El dia a dia                                                      */
/* ---------------------------------------------------------------- */
.gto-barras {
  list-style: none; margin: 0; padding: 0;
  display: flex; align-items: flex-end; gap: 3px;
  height: 170px; min-width: 0;
}
.gto-barras__dia {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; align-items: center; gap: ${v('espacio-1')};
  height: 100%;
}
/* La caja ocupa el alto entero y la barra crece DENTRO: asi todas parten del
   mismo suelo y se pueden comparar de un vistazo. */
.gto-barras__caja {
  flex: 1; width: 100%; min-height: 0;
  display: flex; align-items: flex-end;
  border-radius: 4px;
  background: ${v('superficie-tenue')};
}
.gto-barras__lleno {
  width: 100%;
  border-radius: 4px;
  background: ${v('marca')};
  transition: height ${v('movimiento-curva')} ${v('movimiento-normal')};
}
.gto-barras__dia:hover .gto-barras__lleno { background: ${v('marca-fuerte')}; }
.gto-barras__etiqueta {
  flex: none;
  font-size: ${v('texto-micro')};
  color: ${v('texto-tenue')};
  font-variant-numeric: ${v('cifra-numeros')};
}

.gto-detalle__cifra {
  display: flex; flex-direction: column; gap: 2px;
  padding: ${v('espacio-3')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie-tenue')};
}
.gto-detalle__caja {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-3')};
  border-left: 3px solid ${v('marca')};
  border-radius: ${c('radio-control')};
  background: ${v('marca-tenue')};
}

/* La rebanada del anillo se dibuja girando: sin esto arranca a las tres en
   punto, que es donde el ojo NO espera que empiece. */
.gto-rebanada { transform: rotate(-90deg); transform-origin: 50% 50%; }

/* ================================================================ */
/* REPORTES — la capa de analisis                                   */
/* ================================================================ */

/* El cuerpo son DOS COLUMNAS: el reporte y el costado fijo.

   El costado no entra en las pestañas a proposito —el periodo, la ganancia
   neta y los guardados hablan de la pantalla entera, no de la seccion— y por
   eso la reja va aqui y no dentro de cada pestaña. */
.rep-cuerpo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: ${v('espacio-4')};
  align-items: start;
}
/* Debajo de mil cien, el costado pasa ABAJO en vez de encogerse: a 240 pixeles
   la ganancia neta parte el renglon y deja de leerse de un vistazo, que es lo
   unico que tenia que hacer. */
@media (max-width: 1100px) {
  .rep-cuerpo { grid-template-columns: minmax(0, 1fr); }
}
.rep-principal { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }
.rep-costado { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

/* La grafica y la dona, lado a lado. La grafica pesa mas porque una linea
   aplastada a la mitad del ancho no deja comparar dos series. */
.rep-dos {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: ${v('espacio-4')};
  align-items: start;
}
@media (max-width: 980px) {
  .rep-dos { grid-template-columns: minmax(0, 1fr); }
}

.rep-tarjeta__cabeza {
  display: flex; align-items: center; justify-content: space-between; gap: ${v('espacio-3')};
}

/* El periodo escrito, al lado de los botones de arriba. Es lo primero que hay
   que saber para creerse cualquier cifra de la pantalla. */
.rep-periodo {
  display: inline-flex; align-items: center; gap: ${v('espacio-2')};
  padding: 0 ${v('espacio-3')};
  height: 38px;
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font-size: ${v('texto-chico')};
  font-weight: ${v('peso-medio')};
  white-space: nowrap;
}

/* La comparacion contra el periodo anterior. Sin comparacion no lleva ninguna
   de las dos clases y se queda del color del pie: "Sin comparación disponible"
   en verde se leeria como una buena noticia. */
.rep-pie--sube { color: ${v('exito')}; }
.rep-pie--baja { color: ${v('peligro')}; }
.rep-egreso { color: ${v('peligro')}; }
.rep-neta { border-top: 1px solid ${c('borde-tenue')}; padding-top: ${v('espacio-3')}; }

/* ---------------------------------------------------------------- */
/* La grafica de lineas                                              */
/* ---------------------------------------------------------------- */
.rep-lienzo { width: 100%; height: auto; display: block; }
.rep-raya { stroke: ${c('borde-tenue')}; stroke-width: 1; }
.rep-eje {
  fill: ${v('texto-tenue')};
  font-size: 11px;
  font-family: ${v('familia')};
  font-variant-numeric: ${v('cifra-numeros')};
}
.rep-linea { stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.rep-linea--ingresos { stroke: ${v('exito')}; }
.rep-linea--egresos { stroke: ${v('peligro')}; }
.rep-marca--ingresos { fill: ${v('exito')}; }
.rep-marca--egresos { fill: ${v('peligro')}; }

/* ---------------------------------------------------------------- */
/* El globito de la grafica                                          */
/* ---------------------------------------------------------------- */
/*
 * POR QUE ES HTML ENCIMA DEL SVG Y NO TEXTO DENTRO.
 *
 * Un texto dentro del lienzo se escala con el: en una tarjeta angosta sale
 * diminuto y en una ancha desproporcionado. Y no puede llevar bordes
 * redondeados, sombra ni saltos de linea. Como el SVG conserva su proporcion,
 * la coordenada del punto dividida entre el ancho del lienzo ES su posicion
 * relativa, y el globito cae exactamente encima a cualquier tamaño.
 */
.rep-grafica { position: relative; min-width: 0; }

/* La guia ata el globito a una fecha cuando hay treinta puntos juntos. */
.rep-guia { stroke: ${v('borde')}; stroke-width: 1; stroke-dasharray: 3 3; }

/* La marca señalada engorda EN EL SITIO. Moverla hace fallar el clic. */
.rep-marca--viva { stroke: ${v('superficie')}; stroke-width: 2; }

/* Las zonas que escuchan al puntero no se ven, pero SI se enfocan: quien
   navega con el teclado recorre la serie punto por punto. */
.rep-lienzo rect:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }

.rep-globito {
  position: absolute;
  z-index: 2;
  /* NO RECIBE EL PUNTERO. Sin esto, el globito se mete debajo del cursor, la
     zona de abajo pierde el "mouseenter", y el globito parpadea sin parar. */
  pointer-events: none;
  display: flex; flex-direction: column; gap: 2px;
  min-width: 148px;
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  box-shadow: ${v('sombra-flotante')};
  font-size: ${v('texto-micro')};
  /* Se levanta sobre el punto para no taparlo: la cifra que se esta mirando no
     puede quedar debajo de la caja que la explica. */
  transform: translateY(-100%);
  margin-top: -10px;
}
.rep-globito--derecha { margin-left: 10px; }
/* A partir de la mitad se abre hacia la izquierda: pegado siempre al mismo
   lado, el ultimo punto de la serie se sale de la tarjeta y se corta. */
.rep-globito--izquierda { transform: translate(-100%, -100%); margin-left: -10px; }
.rep-globito__cuando {
  font-weight: 600; color: ${v('texto')};
  padding-bottom: 2px; margin-bottom: 2px;
  border-bottom: 1px solid ${v('borde-tenue')};
}
.rep-globito__renglon { display: flex; align-items: center; gap: ${v('espacio-2')}; }
.rep-globito__que { flex: 1; color: ${v('texto-suave')}; }
.rep-globito__cuanto {
  font-weight: 600; color: ${v('texto')};
  font-variant-numeric: ${v('cifra-numeros')};
}

.rep-leyenda {
  list-style: none; margin: 0; padding: 0;
  display: flex; gap: ${v('espacio-4')};
  font-size: ${v('texto-chico')};
  color: ${v('texto-suave')};
}
.rep-leyenda li { display: flex; align-items: center; gap: ${v('espacio-2')}; }
.rep-punto { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.rep-punto--ingresos { background: ${v('exito')}; }
.rep-punto--egresos { background: ${v('peligro')}; }

/* ---------------------------------------------------------------- */
/* Los filtros rapidos del costado                                   */
/* ---------------------------------------------------------------- */
.rep-rapidos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.rep-rapido {
  width: 100%;
  display: flex; align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border: 0;
  border-radius: ${c('radio-control')};
  background: transparent;
  color: ${v('texto-suave')};
  font: inherit;
  font-size: ${v('texto-chico')};
  text-align: left;
  cursor: pointer;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.rep-rapido:hover { background: ${v('superficie-tenue')}; }
.rep-rapido:focus-visible { outline: 2px solid ${v('foco')}; outline-offset: 2px; }
/* El puesto se distingue por FONDO Y PESO, no solo por color: quien no
   distingue el verde tiene que poder ver cual esta escogido. */
.rep-rapido--puesto {
  background: ${v('marca-tenue')};
  color: ${v('marca-fuerte')};
  font-weight: ${v('peso-medio')};
}
.rep-rapido__flecha { margin-left: auto; display: inline-flex; }

/* ---------------------------------------------------------------- */
/* Un reporte guardado del costado                                   */
/* ---------------------------------------------------------------- */
.rep-guardado { display: flex; align-items: center; gap: ${v('espacio-3')}; min-width: 0; }
.rep-guardado__icono { flex: none; display: inline-flex; color: ${v('texto-tenue')}; }
/* El texto es el boton entero y no solo el nombre: un blanco de doce pixeles
   de alto es imposible de tocar en una tableta. */
.rep-guardado__texto {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 1px;
  border: 0; background: transparent; padding: 0;
  font: inherit; text-align: left; cursor: pointer; color: inherit;
}
.rep-guardado__texto:focus-visible { outline: 2px solid ${v('foco')}; outline-offset: 2px; }

.rep-campo {
  width: 100%;
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font: inherit;
}
.rep-campo:focus-visible { outline: 2px solid ${v('foco')}; outline-offset: 1px; }


/* ================================================================ */
/* MENSAJES — la capa de comunicacion                               */
/* ================================================================ */

/* TRES COLUMNAS: la lista, el hilo y el costado. Se desarma por partes y no de
   golpe — primero cae el costado, que es apoyo, y solo en telefono la lista se
   pone encima del hilo. Desarmarlo todo a la vez deja el chat en una franja de
   trescientos pixeles con la lista arriba comiendose la pantalla. */
.msj-cuerpo {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${v('espacio-4')};
  align-items: start;
  min-width: 0;
}
@media (min-width: 1100px) {
  .msj-cuerpo { grid-template-columns: 340px minmax(0, 1fr); }
}
@media (min-width: 1400px) {
  .msj-cuerpo { grid-template-columns: 320px minmax(0, 1fr) 300px; }
}

.msj-lista { display: flex; flex-direction: column; gap: ${v('espacio-3')}; min-width: 0; }
.msj-costado { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }
/* APILADOS. Lado a lado en una columna de trescientos cuarenta pixeles, el
   buscador se quedaba en ciento cincuenta y el marcador de posición salía
   cortado a media palabra ("Buscar conversaci"). */
.msj-filtros { display: flex; flex-direction: column; gap: ${v('espacio-2')}; min-width: 0; }
.msj-filtros .pz-buscador { width: 100%; min-width: 0; }
.msj-filtros .pz-campo { width: 100%; }

.msj-hilos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }

/* Un hilo de la lista. El boton ocupa el renglon ENTERO: un blanco de doce
   pixeles de alto es imposible de tocar en una tableta. */
.msj-hilo {
  width: 100%;
  display: flex; align-items: flex-start; gap: ${v('espacio-3')};
  padding: ${v('espacio-3')};
  border: 0; border-radius: ${c('radio-control')};
  background: transparent; color: inherit; font: inherit; text-align: left;
  cursor: pointer; min-width: 0;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.msj-hilo:hover { background: ${v('superficie-tenue')}; }
.msj-hilo:focus-visible { outline: 2px solid ${v('foco')}; outline-offset: -2px; }
/* El escogido se distingue por FONDO y por barra, no solo por color: quien no
   distingue el verde tiene que poder ver cual esta abierto. */
.msj-hilo--puesto {
  background: ${v('marca-tenue')};
  box-shadow: inset 3px 0 0 ${v('marca')};
}

.msj-hilo__cuerpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.msj-hilo__arriba { display: flex; align-items: baseline; gap: ${v('espacio-2')}; min-width: 0; }
.msj-hilo__arriba .pz-renglon__titulo {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.msj-hilo__cuando { flex: none; font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; }
.msj-hilo__abajo { display: flex; align-items: center; gap: ${v('espacio-2')}; min-width: 0; }
/* Una linea y con puntos suspensivos: el ultimo mensaje es una pista, no el
   mensaje. Dejarlo envolver hace que un parrafo largo se coma la lista. */
.msj-hilo__ultimo {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: ${v('texto-chico')}; color: ${v('texto-suave')};
}
.msj-hilo__marcas { display: flex; flex-wrap: wrap; gap: ${v('espacio-1')}; align-items: center; }
.msj-hilo__canal { font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; }

.msj-sin-leer {
  flex: none; min-width: 20px; height: 20px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: ${c('radio-pastilla')};
  background: ${v('marca')}; color: ${v('sobre-marca')};
  font-size: ${v('texto-micro')}; font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
}

/* ---------------------------------------------------------------- */
/* El hilo abierto                                                   */
/* ---------------------------------------------------------------- */
/* ALTURA MAXIMA Y DESPLAZAMIENTO POR DENTRO. Sin el maximo, un hilo de
   trescientos mensajes estira la tarjeta hasta que el cuadro de escribir queda
   a diez pantallas del principio — y responder obliga a bajar todo. */
.msj-hilo-abierto {
  display: flex; flex-direction: column; gap: ${v('espacio-3')};
  min-height: 420px;
  max-height: calc(100dvh - ${v('espacio-8')});
}
.msj-cabeza {
  display: flex; align-items: center; gap: ${v('espacio-3')}; min-width: 0;
  padding-bottom: ${v('espacio-3')};
  border-bottom: 1px solid ${c('borde-tenue')};
}
.msj-cabeza__quien { flex: 1; min-width: 0; display: flex; flex-direction: column; }

.msj-mensajes {
  flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: ${v('espacio-2')};
  padding-right: ${v('espacio-2')};
}
.msj-dia {
  margin: ${v('espacio-3')} 0 ${v('espacio-2')};
  text-align: center;
  font-size: ${v('texto-micro')}; color: ${v('texto-tenue')};
}

/* LO QUE ENTRA A LA IZQUIERDA Y LO QUE SALE A LA DERECHA. El sitio dice quien
   hablo sin depender del color, que es lo que hace falta para quien no
   distingue los tonos. */
.msj-globo {
  max-width: 74%;
  padding: ${v('espacio-3')};
  border-radius: ${c('radio-tarjeta')};
  background: ${v('superficie-tenue')};
  font-size: ${v('texto-chico')};
}
.msj-globo--entrante { align-self: flex-start; border-bottom-left-radius: 4px; }
.msj-globo--saliente {
  align-self: flex-end;
  background: ${v('marca-tenue')};
  border-bottom-right-radius: 4px;
}
.msj-globo--fallido { background: ${v('peligro-tenue')}; }
.msj-globo__texto { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.msj-globo__pie {
  margin: ${v('espacio-1')} 0 0;
  display: flex; gap: ${v('espacio-2')}; align-items: center; flex-wrap: wrap;
  font-size: ${v('texto-micro')}; color: ${v('texto-tenue')};
}
.msj-globo__error { margin: ${v('espacio-1')} 0 0; font-size: ${v('texto-micro')}; color: ${v('peligro')}; }

/* El estado se lee CON PALABRAS. Una palomita gris y una azul son el mismo
   dibujo para media humanidad. */
.msj-estado--pendiente { color: ${v('texto-tenue')}; }
.msj-estado--enviando  { color: ${v('texto-tenue')}; }
.msj-estado--enviado   { color: ${v('texto-suave')}; }
.msj-estado--entregado { color: ${v('texto-suave')}; }
.msj-estado--leido     { color: ${v('exito')}; }
.msj-estado--fallido   { color: ${v('peligro')}; font-weight: ${v('peso-medio')}; }

/* ---------------------------------------------------------------- */
/* El cuadro de escribir                                             */
/* ---------------------------------------------------------------- */
.msj-escribir {
  position: relative;
  display: flex; align-items: flex-end; gap: ${v('espacio-2')};
  padding-top: ${v('espacio-3')};
  border-top: 1px solid ${c('borde-tenue')};
}
.msj-campo { flex: 1; min-width: 0; display: block; }
.msj-campo__texto {
  width: 100%; min-height: 44px; max-height: 160px;
  padding: ${v('espacio-3')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie')}; color: ${v('texto')};
  font: inherit; font-size: ${v('texto-chico')};
  resize: vertical;
}
.msj-campo__texto--alto { min-height: 120px; }
.msj-campo__texto:focus-visible { outline: 2px solid ${v('foco')}; outline-offset: 1px; }
.msj-campo__linea {
  width: 100%;
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie')}; color: ${v('texto')};
  font: inherit;
}
.msj-campo__linea:focus-visible { outline: 2px solid ${v('foco')}; outline-offset: 1px; }

/* El selector de emojis flota ENCIMA y no empuja: si empujara, el cuadro de
   texto saltaria hacia arriba justo mientras se escribe. */
.msj-emojis {
  position: absolute; right: 0; bottom: 100%;
  display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px;
  margin-bottom: ${v('espacio-2')}; padding: ${v('espacio-2')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie-elevada')};
  box-shadow: ${c('sombra-alta')};
  z-index: 20;
}
.msj-emoji {
  width: 32px; height: 32px;
  border: 0; border-radius: ${c('radio-control')};
  background: transparent; cursor: pointer; font-size: 18px; line-height: 1;
}
.msj-emoji:hover { background: ${v('superficie-tenue')}; }

/* ---------------------------------------------------------------- */
/* Plantillas, difusiones y atajos                                   */
/* ---------------------------------------------------------------- */
/* UNA COLUMNA, NO DOS. En dos, "Mensajes automáticos" no cabía en la mitad de
   una columna de trescientos pixeles y salía cortado a media palabra. Cuatro
   botones apilados se leen; cuatro cortados, no. */
.msj-atajos { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.msj-atajos .pz-boton { width: 100%; justify-content: flex-start; }

.msj-variables { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.msj-variables__lista { display: flex; flex-wrap: wrap; gap: ${v('espacio-1')}; }
.msj-variable { cursor: pointer; border: 1px dashed ${c('borde-tarjeta')}; }

.msj-plantilla { display: flex; align-items: flex-start; gap: ${v('espacio-3')}; min-width: 0; }
/* Dos lineas del texto y basta: la lista sirve para reconocerla, no para
   leerla entera. */
.msj-plantilla__texto {
  font-size: ${v('texto-micro')}; color: ${v('texto-suave')};
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.msj-destinatarios { max-height: 260px; overflow-y: auto; overscroll-behavior: contain; }
.msj-destinatario {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-2')}; cursor: pointer; min-width: 0;
}
.msj-destinatario:hover { background: ${v('superficie-tenue')}; }
.msj-vista-previa {
  padding: ${v('espacio-3')};
  border-left: 3px solid ${v('marca')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie-tenue')};
  white-space: pre-wrap;
}

/* ================================================================ */
/* RECORDATORIOS                                                    */
/* ================================================================ */
/*
 * Casi todo lo de esta pantalla ya existia: la tarjeta, la cifra, la tabla, la
 * pastilla, el buscador, el menu de tres puntos y el vacio salen de "piezas".
 * Aqui solo vive lo que de verdad es propio de este modulo — la urgencia, la
 * dona, los dias de la semana y el reparto de las tres columnas.
 *
 * NI UN COLOR ESCRITO A MANO: todos salen de los tokens, incluidos los cuatro
 * de categoria que ya usaban las tarjetas de Inicio. La guardia 3 lo vigila.
 */

.rec { display: flex; flex-direction: column; gap: ${v('espacio-5')}; }

/* El icono al lado del titulo, como en el diseño. */
.rec-titulo__icono {
  display: inline-flex; vertical-align: -3px; margin-right: ${v('espacio-2')};
  color: ${v('marca')};
}

/* Las cuatro cifras son BOTONES: cada una lleva a su pestaña. Se les quita la
   pinta de boton para que sigan leyendose como tarjetas. */
.rec-cifra {
  border: 0; width: 100%; text-align: left; cursor: pointer; font: inherit;
}

/* ---- La barra de arriba de la tabla ---- */
/*
 * El buscador crece y los dos selectores se quedan. Un "flex: 1 1 220px" en
 * columna mediria ALTO —la trampa que ya costo una caja de 220 px con un campo
 * de 42 flotando en medio—, asi que la fila declara su direccion.
 */
.rec-barra {
  display: flex; flex-direction: row; flex-wrap: wrap; align-items: center;
  gap: ${v('espacio-3')}; padding: ${v('espacio-4')} 0;
}
.rec-barra .pz-buscador { flex: 1 1 240px; min-width: 0; }

/* El numerito del boton de filtros y de las pestañas. */
.rec-cuenta {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 ${v('espacio-1')};
  margin-left: ${v('espacio-2')};
  border-radius: 999px;
  background: ${v('marca-tenue')}; color: ${v('marca')};
  font-size: ${v('texto-micro')}; font-weight: 600;
}

/* ---- La tabla ---- */
/*
 * ES LA TABLA MAS ANCHA DEL PRODUCTO: nueve columnas, y encima con el costado
 * de 300 px al lado. Con el aire de las demas pedia 885 px en un marco de 846 y
 * el marco —que lleva "overflow-x: auto"— RECORTABA las dos ultimas: el estado
 * y el menu de acciones. Un menu de acciones cortado no se ve roto, se ve
 * ausente, y quien lo busca concluye que la tabla no deja hacer nada.
 *
 * Se aprieta AQUI y no en "piezas": las otras siete tablas tienen menos
 * columnas y ese aire les sienta bien. Cambiarlo alla las apretaria todas para
 * arreglar una.
 */
.rec-tabla th, .rec-tabla td { padding-left: ${v('espacio-2')}; padding-right: ${v('espacio-2')}; }
.rec-tabla__marca { width: 36px; text-align: center; padding-left: 0; padding-right: 0; }

.rec-titulo { display: flex; align-items: center; gap: ${v('espacio-3')}; min-width: 0; }
.rec-titulo__texto { display: flex; flex-direction: column; min-width: 0; }

/*
 * LA FICHA DEL RENGLON SE TIÑE CON LA URGENCIA, y es la primera señal: el color
 * se ve antes de leer. La palabra sigue estando en la pastilla de estado para
 * quien no distinga los tonos.
 */
.rec-ficha--vencido { background: ${v('peligro-tenue')};     color: ${v('peligro')}; }
.rec-ficha--hoy     { background: ${v('advertencia-tenue')}; color: ${v('advertencia')}; }
.rec-ficha--manana  { background: ${v('advertencia-tenue')}; color: ${v('advertencia')}; }
.rec-ficha--proximo { background: ${v('marca-tenue')};       color: ${v('marca')}; }
.rec-ficha--cerrado { background: ${v('superficie-tenue')};  color: ${v('texto-suave')}; }

/* La fecha arriba y la hora debajo: en una linea empuja las dos ultimas
   columnas fuera del marco, que las recorta. */
.rec-cuando { display: flex; flex-direction: column; white-space: nowrap; }
.rec-cuando__dia { font-variant-numeric: tabular-nums; }
.rec-cuando__hora { font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }
.rec-cuando--urge .rec-cuando__dia { color: ${v('peligro')}; font-weight: 600; }
.rec-cuando--urge .rec-cuando__hora { color: ${v('peligro')}; }

.rec-persona { display: inline-flex; align-items: center; gap: ${v('espacio-2')}; min-width: 0; }

/* La marca de "se repite", discreta al lado del titulo. */
.rec-marca { display: inline-flex; color: ${v('texto-suave')}; }

/*
 * LA PRIORIDAD ES UNA RAYITA A LA IZQUIERDA, no un fondo de color.
 *
 * Pintar el renglon entero de rojo por ser urgente hace ilegible el texto y, con
 * cuatro urgentes seguidos, convierte la tabla en un semaforo donde ya no se
 * distingue nada. La rayita se ve de reojo y no compite con el contenido. La
 * pastilla de la columna dice la palabra.
 */
.rec-fila--urgente td:first-child { box-shadow: inset 3px 0 0 ${v('peligro')}; }
.rec-fila--alta td:first-child    { box-shadow: inset 3px 0 0 ${v('advertencia')}; }
.rec-fila--normal td:first-child  { box-shadow: none; }
.rec-fila--baja td:first-child    { box-shadow: none; }

.rec-prioridad--urgente { background: ${v('peligro-tenue')};     color: ${v('peligro')}; }
.rec-prioridad--alta    { background: ${v('advertencia-tenue')}; color: ${v('advertencia')}; }
.rec-prioridad--normal  { background: ${v('superficie-tenue')};  color: ${v('texto-suave')}; }
.rec-prioridad--baja    { background: ${v('superficie-tenue')};  color: ${v('texto-suave')}; }

/* ---- El reparto de la pantalla ---- */
/*
 * TRES COLUMNAS: la lista, la ficha de lo escogido y el costado.
 *
 * La ficha solo ocupa sitio cuando hay algo escogido — se pinta o no se pinta,
 * no se esconde con CSS —, asi que la rejilla se declara por columnas que
 * existan y no con huecos reservados.
 */
.rec-cuerpo {
  display: grid; grid-template-columns: minmax(0, 1fr) 300px;
  gap: ${v('espacio-5')}; align-items: start;
}
.rec-principal { display: grid; grid-template-columns: minmax(0, 1fr); gap: ${v('espacio-5')}; }
.rec-principal:has(.rec-panel) { grid-template-columns: minmax(0, 1fr) 320px; }

.rec-costado { display: flex; flex-direction: column; gap: ${v('espacio-5')}; }

/*
 * EN EL COSTADO, LA FECHA VA DEBAJO Y NO AL LADO.
 *
 * En 320 px de ancho, una fecha con hora al lado del titulo deja al titulo con
 * ochenta pixeles: se corta en "Recorda…" y el renglon deja de servir para
 * reconocer nada, que es lo unico que tiene que hacer. Debajo cabe entera y el
 * titulo se queda con la fila completa.
 */
.rec-costado .pz-renglon { flex-wrap: wrap; }
.rec-costado .pz-renglon__cuerpo { flex: 1 1 100%; min-width: 0; }
.rec-costado .rec-cuando {
  flex: 1 1 100%; padding-left: 42px;
  font-size: ${v('texto-micro')}; color: ${v('texto-suave')};
}

.rec-panel { display: flex; flex-direction: column; gap: ${v('espacio-4')}; }
.rec-panel .pz-cabecera { align-items: center; }
.rec-relacionado, .rec-notas, .rec-historial {
  display: flex; flex-direction: column; gap: ${v('espacio-2')};
}
.rec-acciones { flex-wrap: wrap; }

/* El rastro: una lista de pasos, del mas reciente al mas viejo. */
.rec-rastro { gap: ${v('espacio-2')}; }
.rec-rastro__paso {
  display: flex; flex-direction: column;
  padding-left: ${v('espacio-3')};
  border-left: 2px solid ${c('borde-tarjeta')};
}
.rec-rastro__que { font-size: ${v('texto-micro')}; }
.rec-rastro__quien { font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }

/* ---- La dona ---- */
.rec-resumen { display: flex; align-items: center; gap: ${v('espacio-4')}; }
.rec-dona { width: 110px; height: 110px; flex: 0 0 auto; }
/* La transicion del arco es de forma, no de sitio: no mueve nada que se este
   leyendo. Y no lleva relleno, asi que no encierra lo que flota (§7). */
.rec-dona__arco { transition: stroke-dasharray ${v('rapido')} ease; }
.rec-dona__arco--ventas    { stroke: ${v('cat-ventas')}; }
.rec-dona__arco--productos { stroke: ${v('cat-productos')}; }
.rec-dona__arco--cursos    { stroke: ${v('cat-cursos')}; }
.rec-dona__arco--citas     { stroke: ${v('cat-citas')}; }

.rec-leyenda { display: flex; flex-direction: column; gap: ${v('espacio-2')}; flex: 1 1 auto; }
.rec-leyenda__renglon { display: flex; align-items: center; gap: ${v('espacio-2')}; }
.rec-leyenda__punto { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.rec-leyenda__punto--ventas    { background: ${v('cat-ventas')}; }
.rec-leyenda__punto--productos { background: ${v('cat-productos')}; }
.rec-leyenda__punto--cursos    { background: ${v('cat-cursos')}; }
.rec-leyenda__punto--citas     { background: ${v('cat-citas')}; }
.rec-leyenda__que { flex: 1 1 auto; font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }
.rec-leyenda__cuanto { font-variant-numeric: tabular-nums; }

/* ---- Las acciones rapidas ---- */
.rec-rapidas { display: grid; grid-template-columns: 1fr 1fr; gap: ${v('espacio-2')}; }
/*
 * LOS BOTONES ENVUELVEN SU TEXTO. "Recordatorio recurrente" e "Historial
 * completado" no caben en media tarjeta de 320 px en una linea: sin envolver,
 * el texto se sale de la caja y la rejilla desborda hacia la derecha. Con
 * Un "min-width: 0" deja que la celda de la rejilla se encoja por debajo del
 * ancho de su contenido, que es lo que de verdad lo permite.
 */
.rec-rapidas .pz-boton {
  width: 100%; min-width: 0; justify-content: flex-start;
  white-space: normal; text-align: left; line-height: 1.25;
}

.rec-consejo { flex-direction: row; align-items: center; gap: ${v('espacio-3')}; }
.rec-consejo__hoja { color: ${v('marca')}; flex: 0 0 auto; opacity: 0.7; }

/* ---- Los formularios ---- */
.rec-forma { display: flex; flex-direction: column; gap: ${v('espacio-4')}; }
.rec-ajustes { display: flex; flex-direction: column; gap: ${v('espacio-5')}; }
.rec-ajustes section { display: flex; flex-direction: column; gap: ${v('espacio-3')}; }
.rec-relacion, .rec-repeticion { display: flex; flex-direction: column; gap: ${v('espacio-3')}; }
.rec-relacion__puesta { display: flex; align-items: center; gap: ${v('espacio-3')}; flex-wrap: wrap; }
.rec-opciones { max-height: 220px; overflow-y: auto; overscroll-behavior: contain; }

.rec-casilla { flex-direction: row; align-items: center; gap: ${v('espacio-2')}; }

.rec-area {
  width: 100%; resize: vertical; min-height: 64px;
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie')}; color: ${v('texto')};
  font: inherit; line-height: 1.5;
}
.rec-campo {
  width: 100%;
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie')}; color: ${v('texto')};
  font: inherit;
}

/* Los siete dias, como botones cuadrados. */
.rec-dias { display: flex; flex-wrap: wrap; gap: ${v('espacio-2')}; border: 0; padding: 0; }
.rec-dia {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; cursor: pointer;
  border: 1px solid ${c('borde-tarjeta')}; border-radius: ${c('radio-control')};
  font-size: ${v('texto-micro')}; font-weight: 600;
}
.rec-dia--puesto {
  background: ${v('marca-tenue')}; color: ${v('marca')}; border-color: ${v('marca')};
}
/* El foco del teclado se ve aunque la casilla este escondida: sin esto, quien
   navega con Tab no sabe en que dia esta parado. */
.rec-dia:focus-within { outline: 2px solid ${v('marca')}; outline-offset: 2px; }

.rec-aplazar { display: flex; flex-direction: column; gap: ${v('espacio-4')}; }
.rec-aplazar__rapidas { display: flex; flex-wrap: wrap; gap: ${v('espacio-2')}; }

.rec-repeticion__renglon { flex-wrap: wrap; }
.rec-repeticion__datos { display: flex; flex-direction: column; }
.rec-automatizaciones { gap: ${v('espacio-2')}; }

/* ---- Responsive ---- */
/*
 * EN TABLETA SE CAE EL COSTADO Y EN TELEFONO SE CAE TAMBIEN LA FICHA.
 *
 * Las columnas de 320 px no se encogen: dejarlas apretaria la tabla hasta que
 * la unica salida fuera desplazar la pagina de lado, y el desplazamiento
 * horizontal accidental es de lo que peor se siente en un telefono. Debajo de
 * 1200 el costado pasa a ir debajo; debajo de 900 la ficha ocupa el ancho
 * entero, que es el "detalle a pantalla completa" del diseño.
 */
@media (max-width: 1200px) {
  .rec-cuerpo { grid-template-columns: minmax(0, 1fr); }
  .rec-costado { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
}
@media (max-width: 900px) {
  .rec-principal:has(.rec-panel) { grid-template-columns: minmax(0, 1fr); }
  .rec-rapidas { grid-template-columns: 1fr; }
  .rec-barra { flex-direction: column; align-items: stretch; }
  .rec-barra .pz-buscador { flex: 1 1 auto; }
}

/* ---------------------------------------------------------------- */
/* CONFIGURACION                                                     */
/* ---------------------------------------------------------------- */
/*
 * TODO LO DE AQUI ES DEL MODULO Y DE NADIE MAS. Lo que se repite en otras
 * pantallas —la tarjeta, la pastilla, el renglon, la tabla, el vacio— sale de
 * "piezas.ts" y no se vuelve a escribir. El error mas caro del proyecto fue
 * que cada modulo se escribiera su propia tarjeta: ocho parecidas y ninguna
 * igual.
 */
.cfg { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }
.cfg-titulo__icono { display: inline-flex; vertical-align: -4px; margin-right: ${v('espacio-2')}; color: ${v('marca')}; }

/*
 * DOS COLUMNAS, Y LA DE LA DERECHA NO SE ENCOGE.
 *
 * El costado lleva cifras y pastillas de ancho fijo; dejarlo encoger apretaria
 * "Sin plan administrado" hasta partirlo en cuatro renglones. Debajo de 1200 se
 * cae debajo, que es lo mismo que hacen Recordatorios y Reportes.
 */
.cfg-cuerpo { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: ${v('espacio-4')}; align-items: start; }
.cfg-cuerpo--seccion { grid-template-columns: minmax(0, 1fr); }
.cfg-principal { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }
.cfg-costado { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

.cfg-grupo { display: flex; flex-direction: column; gap: ${v('espacio-3')}; }

/*
 * LA REJILLA ES DE DOS COLUMNAS Y LAS TARJETAS LLENAN EL ALTO.
 *
 * Con "align-items" por omision, una tarjeta con descripcion de dos renglones
 * queda mas alta que su vecina y la fila entera se ve desalineada. "stretch"
 * las iguala, que es como estan en el diseño.
 */
.cfg-rejilla { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: ${v('espacio-3')}; align-items: stretch; }

.cfg-tarjeta {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  width: 100%; text-align: left; cursor: pointer;
  padding: ${v('espacio-3')} ${v('espacio-4')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-tarjeta')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font: inherit;
  transition: border-color ${v('movimiento-normal')} ${v('movimiento-curva')},
              background ${v('movimiento-normal')} ${v('movimiento-curva')};
}
.cfg-tarjeta:hover { border-color: ${v('marca')}; background: ${v('superficie-elevada')}; }
.cfg-tarjeta:focus-visible { outline: 2px solid ${v('foco')}; outline-offset: 2px; }
.cfg-tarjeta__texto { display: flex; flex-direction: column; gap: ${v('espacio-1')}; min-width: 0; flex: 1; }
.cfg-tarjeta__titulo { font-weight: ${v('peso-medio')}; color: ${v('texto')}; font-size: ${v('texto-normal')}; }
.cfg-tarjeta__pie { color: ${v('texto-suave')}; font-size: ${v('texto-chico')}; }
.cfg-tarjeta__flecha { display: flex; flex: none; color: ${v('texto-tenue')}; }

/*
 * EL CUADRITO DEL ICONO, EN LOS CINCO TONOS QUE YA PASARON CONTRASTE.
 *
 * El diseño pinta cada tarjeta de un color distinto. Catorce colores nuevos
 * habrian sido catorce colores sin prueba de contraste — que es lo que la
 * guardia 3 impide, y lo que le paso al primer verde del producto, que se cayo
 * en 4.06:1. Los cinco de categoria se reparten entre las catorce.
 */
.cfg-icono {
  display: inline-flex; align-items: center; justify-content: center;
  flex: none; width: 40px; height: 40px;
  border-radius: 50%;
}
.cfg-icono--citas     { background: ${v('cat-citas-tenue')};     color: ${v('cat-citas')}; }
.cfg-icono--ventas    { background: ${v('cat-ventas-tenue')};    color: ${v('cat-ventas')}; }
.cfg-icono--productos { background: ${v('cat-productos-tenue')}; color: ${v('cat-productos')}; }
.cfg-icono--cursos    { background: ${v('cat-cursos-tenue')};    color: ${v('cat-cursos')}; }
.cfg-icono--visitas   { background: ${v('cat-visitas-tenue')};   color: ${v('cat-visitas')}; }

/* ---- El costado ---- */
.cfg-rapidos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: ${v('espacio-1')}; }
.cfg-rapido {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  width: 100%; padding: ${v('espacio-2')}; cursor: pointer;
  border: 0; border-radius: ${c('radio-control')};
  background: transparent; color: ${v('texto')};
  font: inherit; font-size: ${v('texto-chico')}; text-align: left;
}
.cfg-rapido:hover { background: ${v('superficie-tenue')}; }
.cfg-rapido:focus-visible { outline: 2px solid ${v('foco')}; outline-offset: 2px; }

.cfg-actividad { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: ${v('espacio-3')}; }
.cfg-actividad__renglon { display: flex; align-items: flex-start; gap: ${v('espacio-3')}; }
.cfg-actividad__texto { display: flex; flex-direction: column; gap: ${v('espacio-1')}; min-width: 0; }
.cfg-actividad__que { font-size: ${v('texto-chico')}; color: ${v('texto')}; }
.cfg-actividad__cuando { font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; }

/* ---- Dentro de una seccion ---- */
.cfg-volver { display: flex; flex-direction: column; gap: ${v('espacio-2')}; align-items: flex-start; }
.cfg-seccion__titulo { margin: 0; }
.cfg-forma { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

.cfg-campo {
  width: 100%;
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie')}; color: ${v('texto')};
  font: inherit;
}
.cfg-campo:disabled { background: ${v('superficie-tenue')}; color: ${v('texto-tenue')}; }

.cfg-casilla { display: flex; align-items: center; gap: ${v('espacio-2')}; cursor: pointer; font-size: ${v('texto-chico')}; }
.cfg-casilla--sola { justify-content: center; }

/* ---- Horarios ---- */
.cfg-horarios { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.cfg-horario {
  display: grid;
  /* Cada columna con su ancho: sin esto, "Miércoles" empuja su fila y los siete
     renglones quedan desalineados entre si. */
  grid-template-columns: 110px 92px minmax(0, 1fr) 16px minmax(0, 1fr);
  align-items: center; gap: ${v('espacio-2')};
}
.cfg-horario__dia { font-size: ${v('texto-chico')}; font-weight: ${v('peso-medio')}; }
.cfg-horario__hora { display: block; min-width: 0; }
.cfg-horario__a { color: ${v('texto-tenue')}; font-size: ${v('texto-chico')}; text-align: center; }

.cfg-resumen { display: flex; flex-direction: column; gap: ${v('espacio-1')}; padding: ${v('espacio-3')}; background: ${v('superficie-tenue')}; border-radius: ${c('radio-control')}; }
.cfg-resumen__lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: ${v('espacio-1')}; font-size: ${v('texto-chico')}; color: ${v('texto-suave')}; }

/* ---- Equipo ---- */
.cfg-equipo { display: flex; flex-direction: column; gap: ${v('espacio-4')}; }
.cfg-invitar { display: flex; flex-direction: column; gap: ${v('espacio-3')}; }
/* Quien esta dado de baja se ve APAGADO pero se sigue leyendo: su nombre
   aparece en ventas y en la bitacora, y esconderlo dejaria esos renglones
   hablando de alguien que no esta en ninguna lista. */
.cfg-miembro--baja { opacity: 0.6; }

.cfg-permisos { display: flex; flex-direction: column; gap: ${v('espacio-3')}; align-items: flex-start; }
.cfg-matriz th { vertical-align: top; }
.cfg-matriz td { text-align: center; }
.cfg-matriz__rol { display: block; font-weight: ${v('peso-medio')}; }
.cfg-matriz__cuantos { display: block; font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; font-weight: 400; }
.cfg-matriz__fijo { display: block; font-size: ${v('texto-micro')}; color: ${v('marca')}; font-weight: 400; }
.cfg-matriz__familia th { background: ${v('superficie-tenue')}; text-align: left; }
.cfg-matriz__porque { display: block; font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; font-weight: 400; }
.cfg-matriz__que { display: block; font-weight: 400; font-size: ${v('texto-chico')}; }
/* El nombre tecnico va debajo y en pequeño: sirve para buscarlo en el codigo,
   no para entender que hace. */
.cfg-matriz__clave { display: block; font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; font-family: ${v('cifra-numeros')}; font-weight: 400; }

/* ---- Bitacora ---- */
.cfg-bitacora { display: flex; flex-direction: column; gap: ${v('espacio-3')}; }
.cfg-filtros { display: flex; flex-wrap: wrap; gap: ${v('espacio-2')}; align-items: center; }
.cfg-anotacion { align-items: center; }
.cfg-anotacion__cuando { flex: none; font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; }

/* ---- Respaldos ---- */
.cfg-respaldos { display: flex; flex-direction: column; gap: ${v('espacio-4')}; }
.cfg-exportables { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: ${v('espacio-2')}; }
.cfg-respaldos__ultima { font-size: ${v('texto-chico')}; color: ${v('texto-suave')}; }

/* ---- Datos de demostracion ---- */
.cfg-demo { display: flex; flex-direction: column; gap: ${v('espacio-4')}; }
/* Los nueve pasos, con el que va corriendo marcado. La lista se queda EN
   PANTALLA al terminar: una barra que desaparece no deja ver que se cargo. */
.cfg-pasos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: ${v('espacio-1')}; }
.cfg-pasos__paso {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  font-size: ${v('texto-chico')}; color: ${v('texto-tenue')};
}
/* El estado NO se dice solo con color: delante va una palomita o un punto, y
   el que corre ademas lo escribe. Es la misma regla que la zona de peligro. */
.cfg-pasos__paso--hecho { color: ${v('texto-suave')}; }
.cfg-pasos__paso--corriendo { color: ${v('texto')}; font-weight: 600; }
.cfg-pasos__marca { flex: none; display: inline-flex; width: 18px; justify-content: center; }

/* ---- Plan ---- */
.cfg-plan { display: flex; flex-direction: column; gap: ${v('espacio-4')}; }
.cfg-plan__dias { display: block; font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; }

/* ---- Zona de peligro ---- */
.cfg-peligro { display: flex; flex-direction: column; gap: ${v('espacio-4')}; }
/* El borde rojo es la SEGUNDA señal, nunca la unica: al lado va la palabra
   "Transferir" y el aviso escrito, para quien no distingue el color. */
.cfg-peligro__caja { border-color: ${v('peligro')}; }
.cfg-peligro__icono { display: inline-flex; vertical-align: -3px; margin-right: ${v('espacio-2')}; color: ${v('peligro')}; }
.cfg-lista-honesta { margin: 0; padding-left: ${v('espacio-5')}; display: flex; flex-direction: column; gap: ${v('espacio-2')}; font-size: ${v('texto-chico')}; color: ${v('texto-suave')}; }

.cfg-logo { display: flex; align-items: flex-start; gap: ${v('espacio-4')}; flex-wrap: wrap; }
.cfg-logo__campos { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: ${v('espacio-2')}; align-items: flex-start; }
/* El hueco del logo mide lo mismo con imagen y sin ella: si no, la tarjeta
   entera daria un salto al pegar la direccion. */
.cfg-logo__vista, .cfg-logo__vacio {
  flex: none; width: 96px; height: 96px;
  border: 1px dashed ${c('borde-tarjeta')}; border-radius: ${c('radio-control')};
  display: flex; align-items: center; justify-content: center;
  object-fit: contain; padding: ${v('espacio-2')};
  color: ${v('texto-tenue')}; font-size: ${v('texto-micro')}; text-align: center;
}
.cfg-guardado {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  margin: 0; padding: ${v('espacio-2')} ${v('espacio-3')};
  color: ${v('exito')}; background: ${v('exito-tenue')};
  border-radius: ${c('radio-control')}; font-size: ${v('texto-chico')};
}
.cfg-enlaces { display: flex; flex-direction: column; gap: ${v('espacio-4')}; }
.cfg-metodos { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: ${v('espacio-4')}; }

/* ---- Segundo factor ---- */
.cfg-factor { display: flex; flex-direction: column; gap: ${v('espacio-3')}; align-items: flex-start; }
/* El QR con fondo blanco propio: sobre el fondo oscuro del tema nocturno, un
   codigo con el fondo transparente NO lo lee ninguna camara. */
.cfg-factor__qr { width: 180px; height: 180px; background: ${v('sobre-marca')}; padding: ${v('espacio-2')}; border-radius: ${c('radio-control')}; }
.cfg-factor__secreto { display: flex; flex-direction: column; gap: ${v('espacio-1')}; }
.cfg-factor__secreto code { font-family: ${v('cifra-numeros')}; background: ${v('superficie-tenue')}; padding: ${v('espacio-1')} ${v('espacio-2')}; border-radius: ${v('radio-sistema')}; overflow-wrap: anywhere; }
.cfg-factor__puesta { display: flex; align-items: center; gap: ${v('espacio-2')}; color: ${v('exito')}; font-size: ${v('texto-chico')}; }
.cfg-factor__palomita { display: inline-flex; }

/* ---- Responsive ---- */
@media (max-width: 1200px) {
  .cfg-cuerpo { grid-template-columns: minmax(0, 1fr); }
  .cfg-costado { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
}
@media (max-width: 720px) {
  /* En telefono el renglon de horario no cabe en cinco columnas: se parte en
     dos y la palabra "a" desaparece, porque entre dos campos de hora uno debajo
     del otro ya no significa nada. */
  .cfg-horario { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .cfg-horario__dia { grid-column: 1 / -1; }
  .cfg-horario__a { display: none; }
  .cfg-rejilla { grid-template-columns: minmax(0, 1fr); }
}

`;
}
