/**
 * LA BARRA DE CONTROLES DE LA AGENDA.
 *
 * Nueva cita · Hoy · ‹ › · la fecha con su calendario · Día/Semana/Mes ·
 * Filtros. Vive aparte de `agenda.tsx` porque ahi lo que queda es coordinar
 * datos, y una barra de nueve controles metida en medio esconde esa
 * coordinacion.
 *
 * EL SELECTOR DE FECHA ES UN `<input type="date">` DEL SISTEMA, escondido
 * encima del texto. Es la decision que evita de raiz el fallo que ya nos costo
 * tiempo —el menu que oscurece el fondo y no aparece—: el calendario del
 * sistema operativo no puede quedar debajo de nada, no tiene z-index, funciona
 * con teclado sin escribir una linea, y en celular abre la rueda nativa en vez
 * de una cuadricula de treinta y un botones de doce pixeles.
 *
 * Se pone TRANSPARENTE encima del texto en vez de dibujarlo: asi tocar la
 * fecha abre el calendario, que es lo que todo el mundo intenta primero.
 */

import { aISO, desdeISO, esFecha, type Fecha } from '@neron/base/utils';
import { Icono } from '../ui/iconos.js';
import { tituloDe, type Vista } from './rangos.js';

const VISTAS: readonly { clave: Vista; etiqueta: string }[] = [
  { clave: 'dia', etiqueta: 'Día' },
  { clave: 'semana', etiqueta: 'Semana' },
  { clave: 'mes', etiqueta: 'Mes' },
];

export interface PropiedadesDeControles {
  readonly vista: Vista;
  readonly fecha: Fecha;
  readonly puedeCrear: boolean;
  readonly filtrosAbiertos: boolean;
  /** Cuantos filtros hay puestos. Se dice con un numero, no solo con color. */
  readonly filtrosPuestos: number;
  onNueva(): void;
  onHoy(): void;
  onMover(pasos: number): void;
  onFecha(fecha: Fecha): void;
  onVista(vista: Vista): void;
  onFiltros(): void;
}

export function ControlesDeAgenda({
  vista,
  fecha,
  puedeCrear,
  filtrosAbiertos,
  filtrosPuestos,
  onNueva,
  onHoy,
  onMover,
  onFecha,
  onVista,
  onFiltros,
}: PropiedadesDeControles) {
  return (
    <div className="agenda-barra">
      {puedeCrear ? (
        <button type="button" className="agenda-barra__nueva" onClick={onNueva}>
          <Icono nombre="mas" lado={18} />
          <span>Nueva cita</span>
        </button>
      ) : null}

      <div className="agenda-barra__grupo" role="group" aria-label="Navegar por fechas">
        <button type="button" className="agenda-barra__boton" onClick={onHoy}>
          Hoy
        </button>
        <span className="agenda-barra__division" aria-hidden="true" />
        <button
          type="button"
          className="agenda-barra__boton agenda-barra__boton--flecha"
          onClick={() => onMover(-1)}
          aria-label={vista === 'dia' ? 'Día anterior' : vista === 'semana' ? 'Semana anterior' : 'Mes anterior'}
        >
          ‹
        </button>
        <button
          type="button"
          className="agenda-barra__boton agenda-barra__boton--flecha"
          onClick={() => onMover(1)}
          aria-label={vista === 'dia' ? 'Día siguiente' : vista === 'semana' ? 'Semana siguiente' : 'Mes siguiente'}
        >
          ›
        </button>
      </div>

      {/*
        El texto se anuncia con `aria-live` porque cambia solo al navegar: sin
        eso, quien usa lector aprieta "siguiente" y no se entera de a que dia
        llego.
      */}
      <label className="agenda-barra__fecha">
        <span className="agenda-barra__fecha-texto" aria-live="polite">
          {tituloDe(vista, fecha)}
        </span>
        <span className="agenda-barra__fecha-icono" aria-hidden="true">
          <Icono nombre="calendario" lado={18} />
        </span>
        <input
          type="date"
          className="agenda-barra__fecha-campo"
          aria-label="Ir a una fecha"
          value={esFecha(fecha) ? aISO(fecha) : ''}
          onChange={(e) => {
            const v = e.target.value;
            // Vaciar el campo NO manda la agenda a una fecha vacia: se ignora
            // y se queda donde estaba, que es lo unico razonable.
            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) onFecha(desdeISO(v));
          }}
        />
      </label>

      <div className="agenda-barra__vistas" role="group" aria-label="Vista del calendario">
        {VISTAS.map((v) => (
          <button
            key={v.clave}
            type="button"
            className={`agenda-barra__vista${v.clave === vista ? ' agenda-barra__vista--puesta' : ''}`}
            aria-pressed={v.clave === vista}
            onClick={() => onVista(v.clave)}
          >
            {v.etiqueta}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`agenda-barra__filtros${filtrosPuestos > 0 ? ' agenda-barra__filtros--puestos' : ''}`}
        aria-expanded={filtrosAbiertos}
        aria-label={
          filtrosPuestos > 0
            ? `Filtros: ${filtrosPuestos} ${filtrosPuestos === 1 ? 'puesto' : 'puestos'}`
            : 'Filtros'
        }
        onClick={onFiltros}
      >
        <Icono nombre="filtros" lado={18} />
        {/* El numero se ESCRIBE, no solo se pinta el boton de otro color:
            quien no distingue los tonos tambien tiene que saber que esta
            viendo una agenda filtrada y no una agenda vacia. */}
        {filtrosPuestos > 0 ? (
          <span className="agenda-barra__filtros-cuantos" aria-hidden="true">
            {filtrosPuestos}
          </span>
        ) : null}
      </button>
    </div>
  );
}
