/**
 * LOS FILTROS DE LA LISTA Y EL PANEL DE APOYO DE CLIENTES.
 *
 * Aqui viven dos cosas que antes eran una sola tarjeta pegada a la derecha, y
 * se separaron porque no se usan en el mismo momento: los filtros hacen falta
 * SIEMPRE —tambien con un expediente abierto— y el panel de apoyo solo tiene
 * sentido MIENTRAS no se esta leyendo a nadie. Cada una explica su motivo
 * arriba de su funcion.
 *
 * LOS DOS CONSULTAN, NINGUNO GUARDA.
 *
 * · Los seguimientos son los recordatorios del modulo Recordatorios cuyo
 *   origen es un cliente. No hay una lista de seguimientos guardada aqui: seria
 *   una segunda copia que a la primera falla deja de coincidir.
 *
 * · Los cumpleaños se CALCULAN desde la fecha de nacimiento de cada cliente.
 *   No hay recordatorios de cumpleaños creados de antemano — habria que
 *   crearlos cada año y borrarlos al dar de baja a alguien, y el dia que ese
 *   proceso falle el sistema felicitaria a quien ya no viene.
 */

import { ESTADOS_DE_CLIENTE, type CumpleanosProximo, type Seguimiento } from '../datos/clientes.js';
import type { ProfesionalBreve } from '../datos/citas.js';
import { Icono } from '../ui/iconos.js';

/**
 * Los rangos de visitas del filtro.
 *
 * `null` en el tope significa "sin tope": es lo que hace que "10 o más"
 * funcione sin escribir un numero grande arbitrario que algun dia se quede
 * corto.
 */
export const RANGOS_DE_VISITAS: readonly {
  clave: string;
  etiqueta: string;
  min: number | null;
  max: number | null;
}[] = [
  { clave: '', etiqueta: 'Todos', min: null, max: null },
  { clave: 'cero', etiqueta: 'Sin visitas', min: 0, max: 0 },
  { clave: '1-5', etiqueta: 'De 1 a 5', min: 1, max: 5 },
  { clave: '6-10', etiqueta: 'De 6 a 10', min: 6, max: 10 },
  { clave: '10+', etiqueta: '10 o más', min: 10, max: null },
];

export function rangoPorClave(clave: string): { min: number | null; max: number | null } {
  const r = RANGOS_DE_VISITAS.find((x) => x.clave === clave);
  return { min: r?.min ?? null, max: r?.max ?? null };
}

/** Como se lee cuando falta un cumpleaños. Hoy es hoy, no "en 0 días". */
export function cuandoEsElCumple(enDias: number): string {
  if (enDias <= 0) return 'Hoy';
  if (enDias === 1) return 'Mañana';
  return `En ${enDias} días`;
}

export interface PropiedadesDeLosFiltros {
  readonly estado: string;
  readonly profesionalId: string;
  readonly rango: string;
  readonly profesionales: readonly ProfesionalBreve[];
  onEstado(estado: string): void;
  onProfesional(id: string): void;
  onRango(clave: string): void;
  onLimpiar(): void;
}

/**
 * LOS FILTROS VIVEN EN UN SOLO SITIO, y ese sitio es la cabecera de la
 * pantalla — no la columna de la derecha.
 *
 * Estaban en el panel lateral, que ahora solo aparece cuando NO se esta leyendo
 * a nadie: con un expediente abierto no habia forma de filtrar la lista sin
 * cerrarlo primero. Y ponerlos en los dos lados era peor: dos juegos de
 * controles para los mismos tres filtros, cada uno con su propio estado, es
 * como se acaba con una pantalla que enseña algo que no cuadra con ninguno.
 *
 * Se despliegan al apretar "Filtrar", como en el diseño. Tres selectores
 * puestos siempre ocupan un renglon entero para algo que se usa de vez en
 * cuando.
 */
export function FiltrosRapidos({
  estado,
  profesionalId,
  rango,
  profesionales,
  onEstado,
  onProfesional,
  onRango,
  onLimpiar,
}: PropiedadesDeLosFiltros) {
  const hayFiltros = Boolean(estado || profesionalId || rango);

  return (
    <div className="pz-filtros" role="group" aria-label="Filtros de la lista">
      <label className="pz-campo">
        <span className="tt-etiqueta">Estado del cliente</span>
        <select value={estado} onChange={(e) => onEstado(e.target.value)}>
          <option value="">Todos</option>
          {ESTADOS_DE_CLIENTE.map((e) => (
            <option key={e.clave} value={e.clave}>
              {e.etiqueta}
            </option>
          ))}
        </select>
      </label>

      <label className="pz-campo">
        <span className="tt-etiqueta">Terapeuta asignado</span>
        <select value={profesionalId} onChange={(e) => onProfesional(e.target.value)}>
          <option value="">Todos</option>
          {profesionales.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="pz-campo">
        <span className="tt-etiqueta">Rango de visitas</span>
        <select value={rango} onChange={(e) => onRango(e.target.value)}>
          {RANGOS_DE_VISITAS.map((r) => (
            <option key={r.clave} value={r.clave}>
              {r.etiqueta}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="pz-boton" onClick={onLimpiar} disabled={!hayFiltros}>
        <Icono nombre="volver" lado={15} /> Limpiar filtros
      </button>
    </div>
  );
}

export interface PropiedadesDelPanel {
  readonly seguimientos: readonly Seguimiento[];
  readonly cargandoSeguimientos: boolean;
  readonly cumpleanos: readonly CumpleanosProximo[];
  readonly cargandoCumpleanos: boolean;
  onVerRecordatorios(): void;
  onAbrirSeguimiento(s: Seguimiento): void;
  onVerCumpleanos(): void;
  onAbrirCliente(id: string): void;
}

/**
 * Lo que se enseña en la columna de apoyo MIENTRAS NO se lee a nadie.
 *
 * Es la respuesta al hueco: sin cliente escogido, esa columna quedaba vacia y
 * la pantalla se veia a medio cargar. Aqui va lo que de verdad sirve para
 * decidir a quien abrir — a quien hay que darle seguimiento y quien cumple
 * años esta semana.
 */
export function PanelLateral({
  seguimientos,
  cargandoSeguimientos,
  cumpleanos,
  cargandoCumpleanos,
  onVerRecordatorios,
  onAbrirSeguimiento,
  onVerCumpleanos,
  onAbrirCliente,
}: PropiedadesDelPanel) {
  /* Devuelve sus tarjetas SUELTAS, sin envoltorio: la columna la arma quien lo
     llama, que es quien sabe si abajo va algo mas. Con su propio "pz-apoyo"
     adentro quedaban dos columnas anidadas y el aire se contaba dos veces. */
  return (
    <>
      <section className="pz-tarjeta pz-tarjeta--apretada" aria-labelledby="cli-seguimientos-titulo">
        <header className="pz-cabecera">
          <h3 className="tt-tarjeta" id="cli-seguimientos-titulo">
            Recordatorios de seguimiento
          </h3>
          <button type="button" className="pz-enlace" onClick={onVerRecordatorios}>
            Ver todos
          </button>
        </header>

        {cargandoSeguimientos ? (
          <div className="pz-cargando" aria-busy="true">
            <span className="neron-solo-lectores">Cargando los seguimientos</span>
            <div className="pz-silueta" />
          </div>
        ) : seguimientos.length === 0 ? (
          <div className="pz-vacio pz-vacio--chico">
            <span className="pz-vacio__icono" aria-hidden="true">
              <Icono nombre="campana" lado={22} />
            </span>
            <p className="pz-vacio__titulo">No hay recordatorios</p>
            <p className="pz-vacio__texto">No tienes seguimientos pendientes</p>
          </div>
        ) : (
          <ul className="pz-lista">
            {seguimientos.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="pz-renglon"
                  onClick={() => onAbrirSeguimiento(s)}
                >
                  <span className="pz-renglon__cuerpo">
                    <span className="pz-renglon__titulo">{s.titulo}</span>
                    <span className="pz-renglon__pie">{s.detalle ?? s.fecha}</span>
                  </span>
                  <span className="pz-renglon__flecha" aria-hidden="true">
                    <Icono nombre="flecha" lado={15} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pz-tarjeta pz-tarjeta--apretada" aria-labelledby="cli-cumples-titulo">
        <header className="pz-cabecera">
          <h3 className="tt-tarjeta" id="cli-cumples-titulo">
            Cumpleaños próximos
          </h3>
          <button type="button" className="pz-enlace" onClick={onVerCumpleanos}>
            Ver todos
          </button>
        </header>

        {cargandoCumpleanos ? (
          <div className="pz-cargando" aria-busy="true">
            <span className="neron-solo-lectores">Cargando los cumpleaños</span>
            <div className="pz-silueta" />
          </div>
        ) : cumpleanos.length === 0 ? (
          <div className="pz-vacio pz-vacio--chico">
            <span className="pz-vacio__icono" aria-hidden="true">
              <Icono nombre="pastel" lado={22} />
            </span>
            <p className="pz-vacio__titulo">No hay cumpleaños próximos</p>
            <p className="pz-vacio__texto">Los cumpleaños aparecerán aquí</p>
          </div>
        ) : (
          <ul className="pz-lista">
            {cumpleanos.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="pz-renglon"
                  onClick={() => onAbrirCliente(c.id)}
                >
                  <span className="pz-renglon__cuerpo">
                    <span className="pz-renglon__titulo">{c.nombre}</span>
                    <span className="pz-renglon__pie">
                      {cuandoEsElCumple(c.enDias)} · {c.fecha}
                    </span>
                  </span>
                  <span className="pz-renglon__flecha" aria-hidden="true">
                    <Icono nombre="flecha" lado={15} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
