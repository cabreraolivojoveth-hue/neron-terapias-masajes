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

export function estilosDelProducto(): string {
  return [cimientos(), piezas(), armadura(), movimiento(), loQueTodaviaEsDeUnModulo()].join('\n');
}

function loQueTodaviaEsDeUnModulo(): string {
  return `

.terapias-hoja { color: ${v('marca')}; flex: none; }

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
.agenda-cita__estado {
  flex: none;
  font-size: ${v('texto-micro')};
  padding: 3px ${v('espacio-2')};
  border-radius: ${v('radio-redondo')};
  white-space: nowrap;
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
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
.agenda-estado--pendiente { color: ${v('advertencia')}; border-color: ${v('advertencia')}; }
.agenda-estado--confirmada { color: ${v('exito')}; border-color: ${v('exito')}; }
.agenda-estado--completada { color: ${v('cat-ventas')}; border-color: ${v('cat-ventas')}; }
.agenda-estado--cancelada { color: ${v('peligro')}; border-color: ${v('peligro')}; }
.agenda-estado--no_asistio { color: ${v('texto-suave')}; border-color: ${v('borde')}; }

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
.agenda-form__pie { display: flex; justify-content: flex-end; gap: ${v('espacio-2')}; flex-wrap: wrap; }

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
 */
.ini { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

.ini-icono { flex: none; }

/* ---------------------------------------------------------------- */
/* El encabezado: saludo y fecha                                     */
/* ---------------------------------------------------------------- */
.ini-encabezado { min-width: 0; }
.ini-encabezado__saludo {
  margin: 0;
  font-size: ${v('texto-titulo-grande')};
  font-weight: ${v('peso-fuerte')};
  /* Un nombre largo parte en dos lineas en vez de salirse de la pantalla. */
  overflow-wrap: anywhere;
}
.ini-encabezado__fecha {
  margin: ${v('espacio-1')} 0 0;
  color: ${v('texto-suave')};
  font-size: ${v('texto-chico')};
}

/* ---------------------------------------------------------------- */
/* Las cuatro tarjetas                                               */
/* ---------------------------------------------------------------- */
/*
 * "auto-fit" con un minimo: cuatro en una laptop, dos en tableta, una en
 * celular. Sin escribir un solo punto de corte, y sin que ninguna se
 * comprima hasta que el numero no quepa.
 */
.ini-tarjetas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${v('espacio-3')};
  min-width: 0;
}
.ini-tarjeta {
  display: flex;
  flex-direction: column;
  gap: ${v('espacio-1')};
  padding: ${v('espacio-4')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-tarjeta')};
  background: ${v('superficie-elevada')};
  box-shadow: ${v('sombra-sutil')};
  min-width: 0;
}
.ini-tarjeta__abrir {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: ${v('espacio-3')};
  width: 100%;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: ${v('familia')};
  color: ${v('texto')};
  min-width: 0;
}
.ini-tarjeta__abrir:focus-visible { outline: ${v('foco')}; outline-offset: 3px; border-radius: ${v('radio-sistema')}; }
.ini-tarjeta__icono {
  width: 44px; height: 44px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${v('radio-sistema')};
}
.ini-tarjeta__texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ini-tarjeta__etiqueta {
  color: ${v('texto-suave')};
  font-size: ${v('texto-chico')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ini-tarjeta__valor {
  font-size: ${v('texto-titulo')};
  font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
  /* Un total de seis cifras no debe estirar la tarjeta. */
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ini-tarjeta__pie {
  margin: 0;
  font-size: ${v('texto-micro')};
  color: ${v('texto-suave')};
  /* El hueco se reserva aunque no haya pie: sin esto las tarjetas cambian de
     alto al terminar de cargar y la fila entera da un brinco. */
  min-height: 20px;
  display: flex; align-items: center;
  background: transparent; border: none; padding: 0;
  font-family: ${v('familia')};
  text-align: left;
}
.ini-tarjeta__pie--accion {
  color: ${v('marca')};
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ini-tarjeta__pie--accion:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.ini-tarjeta--bien .ini-tarjeta__pie--cambio { color: ${v('exito')}; }
.ini-tarjeta--mal .ini-tarjeta__pie--cambio { color: ${v('peligro')}; }

/*
 * Los cuatro tonos de categoria. Salen de marca.ts, que es el unico archivo
 * del producto con colores escritos, y los cuatro pasaron la prueba de
 * contraste en tema claro y en oscuro.
 */
.ini-tarjeta--citas { background: ${v('cat-citas-tenue')}; border-color: transparent; }
.ini-tarjeta--citas .ini-tarjeta__icono { background: ${v('cat-citas')}; color: ${v('cat-citas-encima')}; }
.ini-tarjeta--ventas { background: ${v('cat-ventas-tenue')}; border-color: transparent; }
.ini-tarjeta--ventas .ini-tarjeta__icono { background: ${v('cat-ventas')}; color: ${v('cat-ventas-encima')}; }
.ini-tarjeta--productos { background: ${v('cat-productos-tenue')}; border-color: transparent; }
.ini-tarjeta--productos .ini-tarjeta__icono { background: ${v('cat-productos')}; color: ${v('cat-productos-encima')}; }
.ini-tarjeta--cursos { background: ${v('cat-cursos-tenue')}; border-color: transparent; }
.ini-tarjeta--cursos .ini-tarjeta__icono { background: ${v('cat-cursos')}; color: ${v('cat-cursos-encima')}; }

/* ---------------------------------------------------------------- */
/* El cuerpo: los paneles                                            */
/* ---------------------------------------------------------------- */
.ini-cuerpo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: ${v('espacio-3')};
  /* Cada panel mide lo que necesita en vez de estirarse al alto del mas
     largo: una lista de dos recordatorios no debe dejar medio metro vacio. */
  align-items: start;
  min-width: 0;
}
/*
 * En pantalla ancha, la distribucion del diseño: la agenda alta a la
 * izquierda, y a su derecha dos filas.
 *
 * Solo se aplica cuando ESTAN LOS CINCO PANELES —de ahi "--completo", que se
 * pone cuando la persona puede ver finanzas—. Si se colocaran a mano siempre,
 * a una recepcionista sin esos paneles le quedarian huecos en la rejilla.
 */
@media (min-width: 1180px) {
  .ini-cuerpo--completo {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 0.95fr);
  }
  .ini-cuerpo--completo .ini-agenda { grid-column: 1; grid-row: 1 / span 2; }
  .ini-cuerpo--completo .ini-grafica { grid-column: 2; grid-row: 1; }
  .ini-cuerpo--completo .ini-ranking { grid-column: 3; grid-row: 1; }
  .ini-cuerpo--completo .ini-productos { grid-column: 2; grid-row: 2; }
  .ini-cuerpo--completo .ini-recordatorios { grid-column: 3; grid-row: 2; }
}

.ini-panel {
  display: flex;
  flex-direction: column;
  gap: ${v('espacio-3')};
  padding: ${v('espacio-4')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-tarjeta')};
  box-shadow: ${v('sombra-sutil')};
  min-width: 0;
}
.ini-panel__barra { display: flex; align-items: center; gap: ${v('espacio-2')}; min-width: 0; }
.ini-panel__titulo {
  margin: 0;
  font-size: ${v('texto-grande')};
  font-weight: ${v('peso-fuerte')};
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ini-panel__enlace {
  flex: none;
  min-height: 36px;
  padding: 0 ${v('espacio-3')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  color: ${v('marca')};
  font-family: ${v('familia')};
  font-size: ${v('texto-micro')};
  cursor: pointer;
  white-space: nowrap;
}
.ini-panel__enlace:hover { background: ${v('superficie-tenue')}; }
.ini-panel__enlace:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

/* ---------------------------------------------------------------- */
/* Estados compartidos: vacio, error, cargando                       */
/* ---------------------------------------------------------------- */
.ini-vacio {
  margin: 0;
  padding: ${v('espacio-5')} ${v('espacio-3')};
  text-align: center;
  color: ${v('texto-suave')};
  font-size: ${v('texto-chico')};
  background: ${v('superficie-tenue')};
  border-radius: ${v('radio-sistema')};
}
.ini-error {
  display: flex; flex-direction: column; align-items: flex-start;
  gap: ${v('espacio-2')};
  padding: ${v('espacio-3')};
  border-left: 3px solid ${v('peligro')};
  background: ${v('peligro-tenue')};
  border-radius: ${v('radio-sistema')};
}
.ini-error--ancho { align-items: flex-start; }
.ini-error__que { margin: 0; font-size: ${v('texto-chico')}; color: ${v('texto')}; }
.ini-error__detalle {
  margin: 0; font-size: ${v('texto-micro')}; color: ${v('texto-suave')};
  /* Un mensaje del servidor puede ser larguisimo y sin espacios. */
  overflow-wrap: anywhere;
}
.ini-boton-suave {
  min-height: 36px;
  padding: 0 ${v('espacio-3')};
  border: 1px solid ${v('borde')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-micro')};
  cursor: pointer;
}
.ini-boton-suave:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.ini-cargando { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.ini-cargando__renglon { height: 44px; }
.ini-cargando__grafica { height: 180px; }

/* ---------------------------------------------------------------- */
/* Agenda de hoy                                                     */
/* ---------------------------------------------------------------- */
.ini-agenda__lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ini-cita {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: ${v('espacio-3')};
  width: 100%;
  min-height: 56px;
  padding: ${v('espacio-2')};
  background: transparent;
  border: none;
  border-radius: ${v('radio-sistema')};
  cursor: pointer;
  text-align: left;
  font-family: ${v('familia')};
  color: ${v('texto')};
}
.ini-cita:hover { background: ${v('superficie-tenue')}; }
.ini-cita:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }
.ini-cita__horas { display: flex; flex-direction: column; font-variant-numeric: ${v('cifra-numeros')}; }
.ini-cita__inicio { font-weight: ${v('peso-fuerte')}; font-size: ${v('texto-chico')}; }
.ini-cita__fin { color: ${v('texto-tenue')}; font-size: ${v('texto-micro')}; }
.ini-cita__inicial {
  width: 36px; height: 36px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${v('radio-redondo')};
  background: ${v('marca-tenue')};
  color: ${v('marca')};
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-fuerte')};
}
.ini-cita__quien { display: flex; flex-direction: column; min-width: 0; }
.ini-cita__nombre {
  font-weight: ${v('peso-medio')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ini-cita__servicio {
  color: ${v('texto-suave')}; font-size: ${v('texto-micro')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* El estado lleva color Y palabra. El color solo no le sirve a quien no lo
   distingue, ni a quien mira la pantalla con el sol encima. */
.ini-cita__estado {
  flex: none;
  font-size: ${v('texto-micro')};
  padding: 3px ${v('espacio-2')};
  border-radius: ${v('radio-redondo')};
  white-space: nowrap;
  border: 1px solid transparent;
}
.ini-cita__estado--pendiente { background: ${v('advertencia-tenue')}; border-color: ${v('advertencia')}; }
.ini-cita__estado--confirmada { background: ${v('exito-tenue')}; border-color: ${v('exito')}; }
.ini-cita__estado--completada { background: ${v('marca-tenue')}; border-color: ${v('marca')}; }
.ini-cita__estado--cancelada { background: ${v('peligro-tenue')}; border-color: ${v('peligro')}; }
.ini-cita__estado--no_asistio { background: ${v('superficie-tenue')}; border-color: ${v('borde')}; }
.ini-cita__flecha { color: ${v('texto-tenue')}; display: flex; flex: none; }
.ini-agenda__nueva {
  display: flex; align-items: center; justify-content: center; gap: ${v('espacio-2')};
  min-height: 44px;
  border: 1px dashed ${v('borde')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie-tenue')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
  cursor: pointer;
}
.ini-agenda__nueva:hover { border-color: ${v('marca')}; color: ${v('marca')}; }
.ini-agenda__nueva:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

/*
 * En celular el renglon se aprieta: se van el circulo de iniciales y la
 * flecha, que son adorno, y se queda lo que se necesita para decidir —hora,
 * quien, que servicio y en que estado—.
 */
@media (max-width: 560px) {
  .ini-cita { grid-template-columns: auto minmax(0, 1fr) auto; gap: ${v('espacio-2')}; }
  .ini-cita__inicial, .ini-cita__flecha { display: none; }
}

/* ---------------------------------------------------------------- */
/* La grafica de ingresos                                            */
/* ---------------------------------------------------------------- */
.ini-grafica__periodo { display: flex; align-items: center; flex: none; }
.ini-grafica__periodo select {
  min-height: 36px;
  padding: 0 ${v('espacio-2')};
  border: 1px solid ${v('borde')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-micro')};
  max-width: 160px;
}
.ini-grafica__periodo select:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

.ini-grafica__cuerpo { display: flex; gap: ${v('espacio-2')}; min-width: 0; }
.ini-grafica__eje {
  list-style: none; margin: 0; padding: 0;
  width: 46px; flex: none; height: 180px;
  display: flex; flex-direction: column; justify-content: space-between;
  text-align: right;
  font-size: ${v('texto-micro')};
  color: ${v('texto-tenue')};
  font-variant-numeric: ${v('cifra-numeros')};
}
.ini-grafica__lienzo { position: relative; flex: 1; min-width: 0; height: 180px; }
.ini-grafica__svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.ini-grafica__guia { stroke: ${v('borde-suave')}; stroke-width: 1; vector-effect: non-scaling-stroke; }
.ini-grafica__area { fill: ${v('marca-tenue')}; stroke: none; }
.ini-grafica__linea {
  fill: none;
  stroke: ${v('marca')};
  stroke-width: 2;
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
  width: 10px; height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: ${v('radio-redondo')};
  background: ${v('superficie-elevada')};
  border: 2px solid ${v('marca')};
}
.ini-grafica__columna--activa .ini-grafica__punto { background: ${v('marca')}; }
.ini-grafica__globo {
  position: absolute; top: ${v('espacio-2')};
  transform: translateX(-50%);
  z-index: 3;
  display: flex; flex-direction: column;
  padding: ${v('espacio-1')} ${v('espacio-2')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  box-shadow: ${v('sombra-flotante')};
  white-space: nowrap;
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
  margin-left: calc(46px + ${v('espacio-2')});
  font-size: ${v('texto-micro')};
  color: ${v('texto-tenue')};
}
.ini-grafica__dias li {
  flex: 1; min-width: 0; text-align: center;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ---------------------------------------------------------------- */
/* Rankings                                                          */
/* ---------------------------------------------------------------- */
.ini-ranking__lista {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: ${v('espacio-3')};
}
.ini-ranking__renglon { display: flex; align-items: center; gap: ${v('espacio-3')}; min-width: 0; }
.ini-ranking__puesto {
  width: 28px; height: 28px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${v('radio-redondo')};
  background: ${v('marca-tenue')};
  color: ${v('marca')};
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
}
.ini-ranking__texto { display: flex; flex-direction: column; min-width: 0; }
.ini-ranking__nombre {
  font-weight: ${v('peso-medio')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ini-ranking__dato { color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }

.ini-productos__lista {
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
  gap: ${v('espacio-3')};
}
.ini-producto {
  display: flex; flex-direction: column; align-items: center; gap: ${v('espacio-1')};
  min-width: 0; text-align: center;
}
.ini-producto__foto, .ini-producto__hueco {
  width: 100%; max-width: 76px; aspect-ratio: 1;
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie-tenue')};
  border: 1px solid ${v('borde-suave')};
}
/* "contain" y no "cover": la foto de un frasco recortada por los lados deja
   de parecerse al frasco que esta en el estante. */
.ini-producto__foto { object-fit: contain; }
.ini-producto__hueco {
  display: flex; align-items: center; justify-content: center;
  color: ${v('texto-tenue')};
}
.ini-producto__nombre {
  font-size: ${v('texto-micro')};
  font-weight: ${v('peso-medio')};
  overflow-wrap: anywhere;
}
.ini-producto__dato { font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }

/* ---------------------------------------------------------------- */
/* Recordatorios                                                     */
/* ---------------------------------------------------------------- */
.ini-recordatorios__lista {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: ${v('espacio-2')};
}
.ini-recordatorio {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: ${v('espacio-3')};
  width: 100%;
  min-height: 56px;
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border: 1px solid ${v('borde-suave')};
  border-left-width: 3px;
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  cursor: pointer;
  text-align: left;
  font-family: ${v('familia')};
  color: ${v('texto')};
}
.ini-recordatorio:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.ini-recordatorio--vencido { border-left-color: ${v('peligro')}; background: ${v('peligro-tenue')}; }
.ini-recordatorio--hoy { border-left-color: ${v('advertencia')}; background: ${v('advertencia-tenue')}; }
.ini-recordatorio--proximo { border-left-color: ${v('borde')}; }
.ini-recordatorio__icono {
  width: 34px; height: 34px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${v('radio-redondo')};
  background: ${v('superficie-elevada')};
  color: ${v('texto-suave')};
  border: 1px solid ${v('borde-suave')};
}
.ini-recordatorio__texto { display: flex; flex-direction: column; min-width: 0; }
.ini-recordatorio__titulo {
  font-weight: ${v('peso-medio')}; font-size: ${v('texto-chico')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ini-recordatorio__detalle {
  color: ${v('texto-suave')}; font-size: ${v('texto-micro')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ini-recordatorio__cuando {
  flex: none; font-size: ${v('texto-micro')}; color: ${v('texto-suave')};
  white-space: nowrap;
}
.ini-recordatorio__flecha { color: ${v('texto-tenue')}; display: flex; flex: none; }
@media (max-width: 560px) {
  .ini-recordatorio { grid-template-columns: auto minmax(0, 1fr) auto; }
  .ini-recordatorio__flecha { display: none; }
}

/* ---------------------------------------------------------------- */
/* Acciones rapidas                                                  */
/* ---------------------------------------------------------------- */
.ini-acciones__fila {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
  gap: ${v('espacio-2')};
}
.ini-accion {
  display: flex; align-items: center; justify-content: center; gap: ${v('espacio-2')};
  min-height: 52px; min-width: 0;
  padding: 0 ${v('espacio-3')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
  cursor: pointer;
}
.ini-accion:hover { background: ${v('superficie-tenue')}; }
.ini-accion:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.ini-accion__icono { display: flex; flex: none; }
.ini-accion__texto { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* El icono toma el tono de la familia a la que pertenece la accion. El gasto
   va en rojo a proposito: es lo unico de la fila que saca dinero. */
.ini-accion--venta .ini-accion__icono { color: ${v('cat-citas')}; }
.ini-accion--cliente .ini-accion__icono { color: ${v('cat-cursos')}; }
.ini-accion--cita .ini-accion__icono { color: ${v('cat-citas')}; }
.ini-accion--pago .ini-accion__icono { color: ${v('cat-citas')}; }
.ini-accion--gasto .ini-accion__icono { color: ${v('peligro')}; }
.ini-accion--reportes .ini-accion__icono { color: ${v('cat-ventas')}; }

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
 * Todo va en rejillas que se reacomodan solas y cada hijo lleva su
 * "min-width: 0". Sin eso, un correo largo estira su columna, la rejilla
 * crece, y aparece scroll horizontal en TODA la aplicacion.
 */
.cli { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }

.cli-encabezado {
  display: flex; align-items: flex-start; gap: ${v('espacio-3')};
  flex-wrap: wrap; min-width: 0;
}
.cli-encabezado__texto { flex: 1; min-width: 0; }
.cli-encabezado__titulo { margin: 0; font-size: ${v('texto-titulo-grande')}; font-weight: ${v('peso-fuerte')}; }
.cli-encabezado__lema { margin: 0; color: ${v('texto-suave')}; font-size: ${v('texto-chico')}; }

/* ---------------------------------------------------------------- */
/* Botones propios del modulo                                        */
/* ---------------------------------------------------------------- */
.cli-boton-principal {
  display: inline-flex; align-items: center; justify-content: center; gap: ${v('espacio-2')};
  min-height: 44px; flex: none;
  padding: 0 ${v('espacio-4')};
  border: none; border-radius: ${v('radio-sistema')};
  background: ${v('marca')}; color: ${v('sobre-marca')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')}; font-weight: ${v('peso-fuerte')};
  cursor: pointer;
}
.cli-boton-principal:hover { background: ${v('marca-fuerte')}; }
.cli-boton-principal:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.cli-boton-suave {
  display: inline-flex; align-items: center; justify-content: center; gap: ${v('espacio-1')};
  min-height: 38px;
  padding: 0 ${v('espacio-3')};
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-micro')};
  cursor: pointer;
}
.cli-boton-suave:hover:not(:disabled) { background: ${v('superficie-tenue')}; }
.cli-boton-suave:disabled { opacity: 0.5; cursor: default; }
.cli-boton-suave:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.cli-boton-suave--ancho { width: 100%; }

/* ---------------------------------------------------------------- */
/* Las cifras                                                        */
/* ---------------------------------------------------------------- */
.cli-cifras {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: ${v('espacio-3')};
  min-width: 0;
}
.cli-cifra {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: ${v('espacio-3')};
  padding: ${v('espacio-4')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-tarjeta')};
  background: ${v('superficie-elevada')};
  box-shadow: ${v('sombra-sutil')};
  min-width: 0;
}
.cli-cifra__icono {
  width: 42px; height: 42px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${v('radio-sistema')};
}
.cli-cifra__texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cli-cifra__etiqueta {
  color: ${v('texto-suave')}; font-size: ${v('texto-chico')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cli-cifra__valor {
  font-size: ${v('texto-titulo')}; font-weight: ${v('peso-fuerte')};
  font-variant-numeric: ${v('cifra-numeros')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* El hueco se reserva siempre: sin el, la fila brinca al terminar de cargar. */
.cli-cifra__pie {
  font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; min-height: 18px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* El tono va SOLO en el cuadro del icono. En el diseño el fondo de la tarjeta
   es blanco; teñir las cinco haria una pantalla de colores sin jerarquia. */
.cli-cifra--citas .cli-cifra__icono { background: ${v('cat-citas-tenue')}; color: ${v('cat-citas')}; }
.cli-cifra--ventas .cli-cifra__icono { background: ${v('cat-ventas-tenue')}; color: ${v('cat-ventas')}; }
.cli-cifra--productos .cli-cifra__icono { background: ${v('cat-productos-tenue')}; color: ${v('cat-productos')}; }
.cli-cifra--cursos .cli-cifra__icono { background: ${v('cat-cursos-tenue')}; color: ${v('cat-cursos')}; }
.cli-cifra--visitas .cli-cifra__icono { background: ${v('cat-visitas-tenue')}; color: ${v('cat-visitas')}; }
.cli-cifra--citas .cli-cifra__pie { color: ${v('cat-citas')}; }
.cli-cifra--ventas .cli-cifra__pie { color: ${v('cat-ventas')}; }
.cli-cifra--productos .cli-cifra__pie { color: ${v('cat-productos')}; }
.cli-cifra--cursos .cli-cifra__pie { color: ${v('cat-cursos')}; }
.cli-cifra--visitas .cli-cifra__pie { color: ${v('cat-visitas')}; }
.cli-cifras--pie .cli-cifra { box-shadow: none; background: ${v('superficie')}; }

/* ---------------------------------------------------------------- */
/* El cuerpo: lista y panel                                          */
/* ---------------------------------------------------------------- */
.cli-cuerpo {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${v('espacio-4')};
  align-items: start;
  min-width: 0;
}
@media (min-width: 1180px) {
  /* El panel es fijo y la lista toma lo que sobra. El minmax de cero a una
     fraccion impide que un correo largo estire la columna. */
  .cli-cuerpo { grid-template-columns: minmax(0, 1fr) 320px; }
}

.cli-panel {
  display: flex; flex-direction: column; gap: ${v('espacio-3')};
  padding: ${v('espacio-4')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-tarjeta')};
  box-shadow: ${v('sombra-sutil')};
  min-width: 0;
}
.cli-panel__barra { display: flex; align-items: center; gap: ${v('espacio-2')}; min-width: 0; }
.cli-panel__titulo {
  margin: 0; font-size: ${v('texto-grande')}; font-weight: ${v('peso-fuerte')};
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cli-panel__enlace {
  flex: none; min-height: 32px; padding: 0 ${v('espacio-2')};
  border: 1px solid ${v('borde-suave')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('marca')};
  font-family: ${v('familia')}; font-size: ${v('texto-micro')};
  cursor: pointer; white-space: nowrap;
}
.cli-panel__enlace:hover { background: ${v('superficie-tenue')}; }
.cli-panel__enlace:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

/* ---------------------------------------------------------------- */
/* Herramientas de la lista                                          */
/* ---------------------------------------------------------------- */
.cli-herramientas {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-2')};
  min-width: 0;
}
.cli-buscador { position: relative; display: flex; align-items: center; flex: 1 1 200px; min-width: 0; }
.cli-buscador__lupa {
  position: absolute; left: ${v('espacio-3')};
  display: flex; color: ${v('texto-tenue')};
  /* No intercepta el clic: tocar la lupa tiene que enfocar el campo. */
  pointer-events: none;
}
.cli-buscador__campo {
  width: 100%; min-width: 0; min-height: 40px;
  padding-left: calc(${v('espacio-3')} + 16px + ${v('espacio-2')});
  padding-right: ${v('espacio-3')};
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
}
.cli-buscador__campo:focus-visible { outline: ${v('foco')}; outline-offset: 1px; }

.cli-campo { display: flex; flex-direction: column; gap: ${v('espacio-1')}; min-width: 0; }
.cli-campo__etiqueta { font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }
.cli-campo select {
  min-height: 40px; padding: 0 ${v('espacio-2')};
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  max-width: 100%;
}
.cli-campo select:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.cli-campo--bloque { width: 100%; }
.cli-campo--corto select { min-height: 36px; font-size: ${v('texto-micro')}; }

.cli-vistas { display: flex; gap: 2px; padding: 2px; background: ${v('superficie-tenue')}; border-radius: ${v('radio-sistema')}; flex: none; }
.cli-vistas__boton {
  min-width: 36px; min-height: 36px;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: ${v('radio-chico')};
  background: transparent; color: ${v('texto-suave')}; cursor: pointer;
}
.cli-vistas__boton--puesta {
  background: ${v('superficie-elevada')}; color: ${v('marca')};
  box-shadow: ${v('sombra-sutil')};
}
.cli-vistas__boton:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }

.cli-seleccion {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-2')};
  padding: ${v('espacio-2')} ${v('espacio-3')};
  background: ${v('marca-tenue')};
  border-radius: ${v('radio-sistema')};
  font-size: ${v('texto-chico')};
}

/* ---------------------------------------------------------------- */
/* La tabla                                                          */
/* ---------------------------------------------------------------- */
/* El scroll vive DENTRO de la tabla, nunca en la pagina. */
.cli-tabla__marco { overflow-x: auto; min-width: 0; }
.cli-tabla { width: 100%; border-collapse: collapse; font-size: ${v('texto-chico')}; }
.cli-tabla th {
  text-align: left; font-weight: ${v('peso-medio')}; color: ${v('texto-suave')};
  font-size: ${v('texto-micro')};
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border-bottom: 1px solid ${v('borde-suave')};
  white-space: nowrap;
}
.cli-tabla td {
  padding: ${v('espacio-2')} ${v('espacio-3')};
  border-bottom: 1px solid ${v('borde-suave')};
  vertical-align: middle;
}
.cli-tabla tr:last-child td { border-bottom: none; }
.cli-tabla__fila--marcada { background: ${v('marca-tenue')}; }
.cli-tabla__marca { width: 36px; }
.cli-tabla__numero { text-align: right; font-variant-numeric: ${v('cifra-numeros')}; }
.cli-tabla__acciones { width: 56px; text-align: right; }

.cli-persona {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  background: transparent; border: none; padding: 0; cursor: pointer;
  font-family: ${v('familia')}; font-size: ${v('texto-chico')}; color: ${v('texto')};
  text-align: left; min-width: 0; max-width: 100%;
}
.cli-persona:focus-visible { outline: ${v('foco')}; outline-offset: 2px; border-radius: ${v('radio-sistema')}; }
.cli-persona__inicial, .cli-carta__inicial {
  width: 34px; height: 34px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${v('radio-redondo')};
  background: ${v('marca-tenue')}; color: ${v('marca')};
  font-size: ${v('texto-micro')}; font-weight: ${v('peso-fuerte')};
}
.cli-persona__nombre {
  font-weight: ${v('peso-medio')}; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cli-contacto { display: flex; flex-direction: column; min-width: 0; }
.cli-contacto__tel { font-variant-numeric: ${v('cifra-numeros')}; }
.cli-contacto__correo {
  color: ${v('texto-suave')}; font-size: ${v('texto-micro')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 22ch;
}
.cli-falta { color: ${v('texto-tenue')}; font-size: ${v('texto-micro')}; }

/* El estado lleva color Y palabra. */
.cli-estado {
  display: inline-block;
  font-size: ${v('texto-micro')};
  padding: 3px ${v('espacio-2')};
  border-radius: ${v('radio-redondo')};
  border: 1px solid ${v('borde-suave')};
  background: ${v('superficie')};
  white-space: nowrap;
}
.cli-estado--activo { color: ${v('exito')}; border-color: ${v('exito')}; }
.cli-estado--inactivo { color: ${v('texto-suave')}; border-color: ${v('borde')}; }
.cli-estado--archivado { color: ${v('advertencia')}; border-color: ${v('advertencia')}; }

/* ---------------------------------------------------------------- */
/* El menu de acciones                                               */
/* ---------------------------------------------------------------- */
.cli-menu { position: relative; display: inline-flex; }
.cli-menu__boton {
  min-width: 34px; min-height: 34px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: ${v('radio-sistema')};
  background: transparent; color: ${v('texto-suave')}; cursor: pointer;
}
.cli-menu__boton:hover { background: ${v('superficie-tenue')}; }
.cli-menu__boton:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.cli-menu__panel {
  position: absolute; top: calc(100% + 4px); right: 0;
  /* Por encima del velo (40) y de la barra lateral (50) de la base: si
     quedara debajo se veria el fondo oscurecerse y el menu no aparecer. */
  z-index: 60;
  min-width: 190px;
  padding: ${v('espacio-1')};
  background: ${v('superficie-elevada')};
  border: 1px solid ${v('borde-suave')};
  border-radius: ${v('radio-sistema')};
  box-shadow: ${v('sombra-flotante')};
  display: flex; flex-direction: column;
}
.cli-menu__opcion {
  min-height: 38px; padding: 0 ${v('espacio-3')};
  border: none; border-radius: ${v('radio-sistema')};
  background: transparent; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  text-align: left; cursor: pointer; white-space: nowrap;
}
.cli-menu__opcion:hover { background: ${v('superficie-tenue')}; }
.cli-menu__opcion:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }

/* ---------------------------------------------------------------- */
/* La cuadricula                                                     */
/* ---------------------------------------------------------------- */
.cli-cuadricula {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${v('espacio-3')};
}
.cli-carta {
  display: flex; flex-direction: column; align-items: flex-start; gap: ${v('espacio-1')};
  width: 100%; min-width: 0;
  padding: ${v('espacio-3')};
  border: 1px solid ${v('borde-suave')}; border-radius: ${v('radio-tarjeta')};
  background: ${v('superficie')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')}; color: ${v('texto')};
  text-align: left; cursor: pointer;
}
.cli-carta:hover { border-color: ${v('marca')}; }
.cli-carta:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.cli-carta__nombre {
  font-weight: ${v('peso-fuerte')}; min-width: 0; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cli-carta__dato { color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }

/* ---------------------------------------------------------------- */
/* Pie y paginacion                                                  */
/* ---------------------------------------------------------------- */
.cli-pie {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-3')};
  padding-top: ${v('espacio-3')};
  border-top: 1px solid ${v('borde-suave')};
  font-size: ${v('texto-micro')}; color: ${v('texto-suave')};
}
.cli-pie__cuenta { flex: 1; min-width: 0; }
.cli-paginas { display: flex; align-items: center; gap: ${v('espacio-1')}; }
.cli-paginas__boton {
  min-width: 34px; min-height: 34px;
  border: 1px solid ${v('borde-suave')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')}; color: ${v('texto')};
  font-family: ${v('familia')}; cursor: pointer;
}
.cli-paginas__boton:disabled { opacity: 0.4; cursor: default; }
.cli-paginas__boton:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.cli-paginas__actual { padding: 0 ${v('espacio-2')}; font-variant-numeric: ${v('cifra-numeros')}; }

/* ---------------------------------------------------------------- */
/* Vacio, error y cargando                                           */
/* ---------------------------------------------------------------- */
.cli-vacio {
  display: flex; flex-direction: column; align-items: center; gap: ${v('espacio-2')};
  padding: ${v('espacio-8')} ${v('espacio-4')};
  text-align: center;
}
.cli-vacio--chico { padding: ${v('espacio-5')} ${v('espacio-3')}; }
.cli-vacio__icono { color: ${v('borde')}; display: flex; }
.cli-vacio__titulo { margin: 0; font-weight: ${v('peso-fuerte')}; color: ${v('texto')}; }
.cli-vacio__texto { margin: 0; color: ${v('texto-suave')}; font-size: ${v('texto-chico')}; }
.cli-error {
  display: flex; flex-direction: column; align-items: flex-start; gap: ${v('espacio-2')};
  padding: ${v('espacio-3')};
  border-left: 3px solid ${v('peligro')};
  background: ${v('peligro-tenue')};
  border-radius: ${v('radio-sistema')};
}
.cli-error__que { margin: 0; font-size: ${v('texto-chico')}; }
.cli-error__detalle {
  margin: 0; font-size: ${v('texto-micro')}; color: ${v('texto-suave')};
  overflow-wrap: anywhere;
}
.cli-cargando { display: flex; flex-direction: column; gap: ${v('espacio-2')}; }
.cli-cargando__renglon { height: 44px; }

/* ---------------------------------------------------------------- */
/* El panel de la derecha                                            */
/* ---------------------------------------------------------------- */
.cli-lateral { display: flex; flex-direction: column; gap: ${v('espacio-4')}; min-width: 0; }
.cli-lateral__lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: ${v('espacio-1')}; }
.cli-lateral__renglon {
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  align-items: center; gap: ${v('espacio-2')};
  width: 100%; min-height: 48px;
  padding: ${v('espacio-2')};
  border: 1px solid ${v('borde-suave')}; border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  font-family: ${v('familia')}; text-align: left; cursor: pointer;
  color: ${v('texto')};
}
.cli-lateral__renglon:hover { background: ${v('superficie-tenue')}; }
.cli-lateral__renglon:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.cli-lateral__texto { display: flex; flex-direction: column; min-width: 0; }
.cli-lateral__titulo {
  font-size: ${v('texto-chico')}; font-weight: ${v('peso-medio')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cli-lateral__nota {
  font-size: ${v('texto-micro')}; color: ${v('texto-suave')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cli-lateral__flecha { color: ${v('texto-tenue')}; display: flex; flex: none; }

/* ---------------------------------------------------------------- */
/* La ficha                                                          */
/* ---------------------------------------------------------------- */
.cli-ficha { display: flex; flex-direction: column; gap: ${v('espacio-3')}; }
.cli-ficha__par { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: ${v('espacio-3')}; }
.cli-ficha__duplicado {
  display: flex; flex-direction: column; align-items: flex-start; gap: ${v('espacio-2')};
  padding: ${v('espacio-3')};
  border-left: 3px solid ${v('advertencia')};
  background: ${v('advertencia-tenue')};
  border-radius: ${v('radio-sistema')};
  font-size: ${v('texto-chico')};
}
.cli-ficha__duplicado p { margin: 0; }
.cli-ficha__duplicado-nota { color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }
.cli-ficha__mas {
  align-self: flex-start;
  background: transparent; border: none; padding: ${v('espacio-1')} 0;
  color: ${v('marca')}; font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  cursor: pointer;
}
.cli-ficha__mas:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
.cli-ficha__error {
  margin: 0; color: ${v('peligro')}; font-size: ${v('texto-chico')};
  border-left: 3px solid ${v('peligro')}; background: ${v('peligro-tenue')};
  padding: ${v('espacio-2')} ${v('espacio-3')}; border-radius: ${v('radio-sistema')};
}
.cli-ficha__pie { display: flex; justify-content: flex-end; gap: ${v('espacio-2')}; flex-wrap: wrap; }

/* ---------------------------------------------------------------- */
/* El expediente                                                     */
/* ---------------------------------------------------------------- */
.cli-exp { display: flex; flex-direction: column; gap: ${v('espacio-3')}; min-width: 0; }
.cli-exp__barra { display: flex; }
.cli-exp__renglon {
  display: grid; grid-template-columns: auto minmax(0, 1fr);
  gap: ${v('espacio-3')}; align-items: start;
  padding-top: ${v('espacio-3')};
  border-top: 1px solid ${v('borde-suave')};
}
.cli-exp__renglon-icono { display: flex; flex: none; color: ${v('texto-tenue')}; padding-top: 2px; }
.cli-exp__renglon-cuerpo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cli-exp__etiqueta { font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; }
.cli-exp__valor { font-size: ${v('texto-chico')}; color: ${v('texto')}; overflow-wrap: anywhere; }
.cli-exp__secundario { color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }
.cli-exp__adeudo { color: ${v('peligro')}; font-size: ${v('texto-micro')}; font-weight: ${v('peso-fuerte')}; }
.cli-exp__enlace { color: ${v('marca')}; overflow-wrap: anywhere; }
.cli-exp__notas { white-space: pre-wrap; overflow-wrap: anywhere; }
.cli-exp__cuentas { display: flex; flex-wrap: wrap; gap: ${v('espacio-4')}; }
.cli-exp__cuenta { display: flex; flex-direction: column; }
.cli-exp__cuenta-numero { font-size: ${v('texto-grande')}; font-weight: ${v('peso-fuerte')}; font-variant-numeric: ${v('cifra-numeros')}; }
.cli-exp__cuenta-que { font-size: ${v('texto-micro')}; color: ${v('texto-suave')}; }
.cli-exp__servicios { list-style: none; margin: 0; padding: 0; }
.cli-exp__acciones {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: ${v('espacio-2')};
  padding-top: ${v('espacio-3')};
  border-top: 1px solid ${v('borde-suave')};
}

/* En celular la tabla se aprieta: se van las columnas que no deciden nada. */
@media (max-width: 640px) {
  .cli-tabla__acciones, .cli-tabla th:nth-child(4), .cli-tabla td:nth-child(4) { display: none; }
  .cli-contacto__correo { display: none; }
}

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
.srv-categoria {
  display: inline-block;
  padding: 3px ${v('espacio-2')};
  border: 1px solid ${v('borde')}; border-radius: ${v('radio-redondo')};
  background: ${v('superficie')};
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

/* Dos tarjetas lado a lado que en pantalla chica se apilan solas. */
.vta-dos {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: ${v('espacio-4')}; min-width: 0;
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
.vta-cobro { position: sticky; top: ${v('espacio-4')}; }

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

.vta-descuento-general {
  display: flex; align-items: center; gap: ${v('espacio-2')}; flex-wrap: wrap; min-width: 0;
}
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
.vta-cifras {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: ${v('espacio-2')}; min-width: 0;
}
.vta-cifra { padding: ${v('espacio-3')}; }

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

/* ---------------------------------------------------------------- */
/* El anillo de formas de pago                                       */
/* ---------------------------------------------------------------- */
.caja-pastel {
  display: flex; flex-wrap: wrap; align-items: center; gap: ${v('espacio-4')}; min-width: 0;
}
.caja-anillo { position: relative; flex: none; width: 150px; height: 150px; }
.caja-anillo svg { width: 100%; height: 100%; }
.caja-anillo__centro {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; pointer-events: none;
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
}
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

.caja-veredicto {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  padding: ${v('espacio-3')};
  border-radius: ${v('radio-sistema')};
  border: 1px solid ${v('borde')};
  background: ${v('superficie-tenue')};
  min-width: 0;
}
.caja-veredicto--cuadra { border-color: ${v('exito')};       background: ${v('exito-tenue')}; }
.caja-veredicto--sobra  { border-color: ${v('advertencia')}; background: ${v('advertencia-tenue')}; }
.caja-veredicto--falta  { border-color: ${v('peligro')};     background: ${v('peligro-tenue')}; }

`;
}
