/**
 * Los estilos propios del producto.
 *
 * Solo lo que la base no puede traer: las pantallas de estado, la hoja de la
 * marca y la pantalla de un modulo pendiente. Todo lo demas —botones, campos,
 * modales, tabla, tablero, el marco entero— viene de la base.
 *
 * NI UN COLOR ESCRITO A MANO. Todo sale de las variables, incluidas las cuatro
 * de marca que pone `marca.ts` encima. Hay una prueba que lo vigila.
 */

const v = (nombre: string): string => `var(--neron-${nombre})`;

export function estilosDelProducto(): string {
  return `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body {
  background: ${v('fondo')};
  color: ${v('texto')};
  font-family: ${v('familia')};
  font-size: ${v('texto-normal')};
  line-height: ${v('interlinea-normal')};
  /* NUNCA scroll horizontal en toda la aplicacion. Si algo no cabe, se
     resuelve dentro de ese componente, no empujando la pagina entera. */
  overflow-x: hidden;
}
#raiz { min-height: 100%; }

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
.agenda { display: flex; flex-direction: column; gap: ${v('espacio-4')}; padding: ${v('espacio-4')}; min-width: 0; }
.agenda-encabezado__titulo { margin: 0; font-size: ${v('texto-titulo-grande')}; font-weight: ${v('peso-fuerte')}; }
.agenda-encabezado__lema { margin: 0; color: ${v('texto-suave')}; font-size: ${v('texto-chico')}; }

.agenda-controles {
  display: flex;
  align-items: center;
  /* Se envuelven solos: en una laptop de 1280 caben en una linea, en tableta
     en dos, y en celular en tres. Sin esto empujarian el ancho de la pagina. */
  flex-wrap: wrap;
  gap: ${v('espacio-2')};
}
.agenda-controles__grupo, .agenda-controles__vistas { display: flex; gap: ${v('espacio-1')}; }
.agenda-controles__fecha {
  font-weight: ${v('peso-fuerte')};
  font-size: ${v('texto-normal')};
  /* Empuja los controles de vista hasta la derecha cuando hay lugar, y se
     acomoda arriba cuando no lo hay. */
  margin-inline: auto ${v('espacio-2')};
}
.agenda-vista {
  min-height: 44px;
  padding: 0 ${v('espacio-3')};
  border: 1px solid ${v('borde')};
  border-radius: ${v('radio-sistema')};
  background: ${v('superficie')};
  color: ${v('texto-suave')};
  font-family: ${v('familia')};
  font-size: ${v('texto-chico')};
  cursor: pointer;
}
.agenda-vista--puesta {
  background: ${v('marca-tenue')};
  color: ${v('texto')};
  border-color: ${v('marca')};
  border-width: 2px;
  font-weight: ${v('peso-fuerte')};
}
.agenda-vista:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }

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
  /* En tableta el panel baja debajo del calendario en vez de comprimirlo. */
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
  display: flex; flex-direction: column; gap: 1px;
  padding: ${v('espacio-1')} ${v('espacio-2')};
  border: 1px solid ${v('borde-suave')};
  border-left: 3px solid ${v('borde')};
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
.agenda-cita > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agenda-cita:focus-visible { outline: ${v('foco')}; outline-offset: 1px; z-index: 3; }
.agenda-cita--puesta { border-width: 2px; box-shadow: ${v('sombra-flotante')}; z-index: 2; }
.agenda-cita__hora { color: ${v('texto-tenue')}; font-variant-numeric: ${v('cifra-numeros')}; }
.agenda-cita__quien { font-weight: ${v('peso-fuerte')}; color: ${v('texto')}; }
.agenda-cita__que { color: ${v('texto-suave')}; }
.agenda-cita__estado { color: ${v('texto-tenue')}; }

/* El estado se distingue por color Y por palabra: el badge siempre lleva el
   nombre escrito, para quien no distingue los tonos. */
.agenda-cita--pendiente { border-left-color: ${v('advertencia')}; background: ${v('advertencia-tenue')}; }
.agenda-cita--confirmada { border-left-color: ${v('exito')}; background: ${v('exito-tenue')}; }
.agenda-cita--completada { border-left-color: ${v('marca')}; background: ${v('marca-tenue')}; }
.agenda-cita--cancelada { border-left-color: ${v('peligro')}; background: ${v('peligro-tenue')}; }
.agenda-cita--no_asistio { border-left-color: ${v('texto-tenue')}; background: ${v('superficie-tenue')}; }

.agenda-ahora { position: absolute; left: 0; right: 0; border-top: 2px solid ${v('peligro')}; z-index: 1; }
.agenda-ahora__hora {
  position: absolute; left: 0; top: -9px;
  background: ${v('peligro')}; color: ${v('sobre-semantico')};
  font-size: ${v('texto-micro')}; padding: 0 ${v('espacio-1')};
  border-radius: ${v('radio-redondo')};
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
.agenda-leyenda__color { width: 10px; height: 10px; border-radius: ${v('radio-redondo')}; border-left-width: 3px; border-left-style: solid; }

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
.agenda-panel__estado { font-size: ${v('texto-micro')}; padding: 2px ${v('espacio-2')}; border-radius: ${v('radio-redondo')}; border-left-width: 3px; border-left-style: solid; }
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
.agenda-panel__dato { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.agenda-panel__etiqueta { font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; text-transform: uppercase; letter-spacing: 0.04em; }
.agenda-panel__valor { font-size: ${v('texto-chico')}; color: ${v('texto')}; overflow-wrap: anywhere; }
.agenda-panel__secundario { color: ${v('texto-suave')}; font-size: ${v('texto-micro')}; }
.agenda-panel__acciones { display: flex; flex-wrap: wrap; gap: ${v('espacio-2')}; }

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
`;
}
