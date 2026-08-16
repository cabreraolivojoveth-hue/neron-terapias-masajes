/**
 * LA COLUMNA DE LA DERECHA: filtros rápidos, resumen del período y guardados.
 *
 * POR QUE VIVE FUERA DE LAS PESTAÑAS: los tres bloques hablan del PERIODO, no
 * de la seccion. Meterlos dentro de "Resumen" obligaria a volver a esa pestaña
 * para cambiar de periodo, y quien esta comparando ventas contra gastos cambia
 * de periodo mucho mas seguido que de pestaña.
 *
 * EL RESUMEN DEL PERIODO ES EL UNICO SITIO DONDE SE VE LA GANANCIA NETA, y por
 * eso esta siempre a la vista. Es la cifra que de verdad se busca al abrir
 * Reportes; escondida en una pestaña, se calcularia a mano restando dos
 * numeros de dos pantallas — que es exactamente lo que este modulo viene a
 * evitar.
 *
 * EL MARGEN ES `null` SIN INGRESOS, no cero. Dividir entre cero no da cero: un
 * "0% de margen" afirma que se trabajo a perdida total, cuando lo que pasa es
 * que no se vendio nada.
 */

import { formatearMoneda } from '@neron/base/utils';
import type { Fecha } from '@neron/base/utils';
import type { Reporte, ReporteGuardado } from '../datos/reportes.js';
import { Icono } from '../ui/iconos.js';
import { MenuDeAcciones } from '../ui/menu.js';
import {
  aISO,
  deISO,
  periodosDelCentro,
  type ClaveDePeriodo,
  type PeriodoDelCentro,
} from './periodo-del-reporte.js';

export interface PropiedadesDelCostado {
  readonly periodos: readonly PeriodoDelCentro[];
  readonly clave: ClaveDePeriodo;
  readonly desde: Fecha;
  readonly hasta: Fecha;
  readonly reporte: Reporte | null;
  readonly cargando: boolean;
  readonly guardados: readonly ReporteGuardado[];
  readonly puedeGuardar: boolean;
  onPeriodo(clave: ClaveDePeriodo): void;
  onDesde(f: Fecha): void;
  onHasta(f: Fecha): void;
  onGuardar(): void;
  onAbrirGuardado(r: ReporteGuardado): void;
  onBorrarGuardado(r: ReporteGuardado): void;
}

export function CostadoDelReporte({
  periodos,
  clave,
  desde,
  hasta,
  reporte,
  cargando,
  guardados,
  puedeGuardar,
  onPeriodo,
  onDesde,
  onHasta,
  onGuardar,
  onAbrirGuardado,
  onBorrarGuardado,
}: PropiedadesDelCostado) {
  const f = reporte?.finanzas;
  const raya = '—';

  return (
    <aside className="rep-costado" aria-label="Filtros rápidos y resumen del período">
      <section className="pz-tarjeta pz-tarjeta--apretada" aria-label="Filtros rápidos">
        <h3 className="tt-tarjeta">Filtros rápidos</h3>
        <ul className="rep-rapidos">
          {periodos.map((p) => (
            <li key={p.clave}>
              <button
                type="button"
                className={`rep-rapido${clave === p.clave ? ' rep-rapido--puesto' : ''}`}
                aria-pressed={clave === p.clave}
                onClick={() => onPeriodo(p.clave)}
              >
                <Icono nombre={p.clave === 'hoy' ? 'calendario' : p.clave === 'ayer' ? 'reloj' : 'calendario'} lado={16} />
                {p.etiqueta}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={`rep-rapido${clave === 'personalizado' ? ' rep-rapido--puesto' : ''}`}
              aria-pressed={clave === 'personalizado'}
              onClick={() => onPeriodo('personalizado')}
            >
              <Icono nombre="calendario" lado={16} />
              Personalizado
              <span className="rep-rapido__flecha" aria-hidden="true">
                <Icono nombre="flecha" lado={14} />
              </span>
            </button>
          </li>
        </ul>

        {/* Los dos campos solo existen cuando hacen falta: dos campos de fecha
            permanentes al lado de cinco atajos hacen dudar de cual manda. */}
        {clave === 'personalizado' ? (
          <div className="pz-filtros">
            <label className="pz-campo">
              <span className="tt-etiqueta">Desde</span>
              <input
                type="date"
                value={aISO(desde)}
                onChange={(e) => {
                  const f2 = deISO(e.target.value);
                  if (f2) onDesde(f2);
                }}
              />
            </label>
            <label className="pz-campo">
              <span className="tt-etiqueta">Hasta</span>
              <input
                type="date"
                value={aISO(hasta)}
                onChange={(e) => {
                  const f2 = deISO(e.target.value);
                  if (f2) onHasta(f2);
                }}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="pz-tarjeta pz-tarjeta--apretada" aria-label="Resumen del período">
        <h3 className="tt-tarjeta">Resumen del período</h3>
        <div className="pz-datos">
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Ingresos</span>
            <span className="pz-dato__valor">
              {cargando ? raya : formatearMoneda(f?.ingresos ?? 0)}
            </span>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Egresos</span>
            <span className="pz-dato__valor rep-egreso">
              {cargando ? raya : formatearMoneda(f?.egresos ?? 0)}
            </span>
          </div>
          {/* LA GANANCIA NETA SE DERIVA, no se guarda. Un total guardado se
              desincroniza a la primera venta cancelada y a partir de ahi hay dos
              numeros verdaderos y nadie sabe cual creer. */}
          <div className="pz-dato pz-dato--renglon rep-neta">
            <span className="tt-etiqueta">Ganancia neta</span>
            <strong className="tt-dato">
              {cargando ? raya : formatearMoneda(f?.utilidad ?? 0)}
            </strong>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Margen de ganancia</span>
            <span className="pz-dato__valor">
              {cargando || !f
                ? raya
                : f.margen === null
                  ? 'Sin ingresos'
                  : `${f.margen.toFixed(1)}%`}
            </span>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Ventas promedio por día</span>
            <span className="pz-dato__valor">
              {cargando ? raya : formatearMoneda(f?.promedioDiario ?? 0)}
            </span>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Clientes nuevos</span>
            <span className="pz-dato__valor">{cargando ? raya : String(f?.clientesNuevos ?? 0)}</span>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Servicios realizados</span>
            <span className="pz-dato__valor">
              {cargando ? raya : String(f?.serviciosRealizados ?? 0)}
            </span>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Cursos vendidos</span>
            <span className="pz-dato__valor">{cargando ? raya : String(f?.cursosVendidos ?? 0)}</span>
          </div>
        </div>
      </section>

      <section className="pz-tarjeta pz-tarjeta--apretada" aria-label="Reportes guardados">
        <h3 className="tt-tarjeta">Reportes guardados</h3>
        {guardados.length === 0 ? (
          <div className="pz-vacio pz-vacio--chico">
            <span className="pz-vacio__icono" aria-hidden="true">
              <Icono nombre="nota" lado={20} />
            </span>
            <p className="pz-vacio__texto">
              Todavía no has guardado ninguno. Guardar uno recuerda el período y los filtros para
              volver a verlo sin armarlo otra vez.
            </p>
          </div>
        ) : (
          <ul className="pz-lista mv-escalonado">
            {guardados.map((g) => (
              <li key={g.id} className="rep-guardado">
                <span className="rep-guardado__icono" aria-hidden="true">
                  <Icono nombre="nota" lado={16} />
                </span>
                <button
                  type="button"
                  className="rep-guardado__texto"
                  onClick={() => onAbrirGuardado(g)}
                >
                  <span className="pz-renglon__titulo">{g.nombre}</span>
                  <span className="pz-renglon__pie">
                    {g.desde} – {g.hasta}
                  </span>
                </button>
                <MenuDeAcciones
                  de={g.nombre}
                  opciones={[
                    { clave: 'abrir', etiqueta: 'Volver a verlo', icono: 'lupa' },
                    { clave: 'borrar', etiqueta: 'Quitarlo', icono: 'basura', peligro: true },
                  ]}
                  onEscoger={(c) => (c === 'abrir' ? onAbrirGuardado(g) : onBorrarGuardado(g))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Solo aparece con permiso de finanzas: la tabla lo exige igual en su
          regla de fila, y un boton que siempre falla es peor que no tenerlo. */}
      {puedeGuardar ? (
        <button type="button" className="pz-boton pz-boton--ancho" onClick={onGuardar}>
          <Icono nombre="archivar" lado={16} /> Guardar reporte actual
        </button>
      ) : null}
    </aside>
  );
}
