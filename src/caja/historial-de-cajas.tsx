/**
 * EL HISTORIAL DE CAJAS Y EL REPORTE DEL PERIODO.
 *
 * EL ESPERADO DE UNA CAJA CERRADA SALE DEL CORTE, no de volver a sumar los
 * movimientos. Recalcularlo haría que un corte firmado cambiara solo el día
 * que alguien agregara un movimiento con fecha vieja — y entonces no serviría
 * para explicarle un faltante a nadie.
 *
 * UNA CAJA ABIERTA NO TIENE DIFERENCIA. Todavía nadie ha contado: se dice, en
 * vez de pintar un cero que se leería como "cuadró".
 */

import { Modal } from '@neron/base/ui';
import { formatearMoneda } from '@neron/base/utils';
import type { CajaDelHistorial, ReporteDeCaja } from '../datos/caja.js';
import {
  COMO_SE_DICE_EL_METODO_DE_CAJA,
  COMO_SE_DICE_LA_CLASE,
  comoSeLeeLaDiferencia,
} from '../datos/caja.js';
import { cuandoSeAbrio } from './estado-de-la-caja.js';
import { Icono } from '../ui/iconos.js';

export function HistorialDeCajas({
  abierto,
  cajas,
  total,
  pagina,
  porPagina,
  cargando,
  error,
  onPagina,
  onCerrar,
}: {
  readonly abierto: boolean;
  readonly cajas: readonly CajaDelHistorial[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly cargando: boolean;
  readonly error: string | null;
  onPagina(pagina: number): void;
  onCerrar(): void;
}) {
  const paginas = Math.max(1, Math.ceil(total / Math.max(porPagina, 1)));

  return (
    <Modal abierto={abierto} titulo="Historial de cajas" onCerrar={onCerrar}>
      {error ? (
        <div className="cli-error" role="alert">
          <p className="cli-error__que">No pudimos cargar el historial.</p>
          <p className="cli-error__detalle">{error}</p>
        </div>
      ) : cargando ? (
        <div className="cli-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el historial</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="terapias-silueta cli-cargando__renglon" />
          ))}
        </div>
      ) : cajas.length === 0 ? (
        <div className="cli-vacio cli-vacio--chico">
          <span className="cli-vacio__icono" aria-hidden="true">
            <Icono nombre="reloj" lado={36} />
          </span>
          <p className="cli-vacio__texto">
            Todavía no se ha cerrado ninguna caja. Cada corte queda aquí con lo que se esperaba, lo
            que se contó y la diferencia.
          </p>
        </div>
      ) : (
        <div className="cli-tabla__marco">
          <table className="cli-tabla">
            <thead>
              <tr>
                <th>Caja</th>
                <th>Apertura</th>
                <th>Cierre</th>
                <th className="cli-tabla__numero">Inicial</th>
                <th className="cli-tabla__numero">Esperado</th>
                <th className="cli-tabla__numero">Contado</th>
                <th className="cli-tabla__numero">Diferencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cajas.map((c) => {
                const como = comoSeLeeLaDiferencia(c.diferenciaCentavos);
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="srv-nombre">
                        <span className="cli-persona__nombre">{c.nombre}</span>
                        <span className="srv-descripcion">
                          {c.abiertaPor ?? '—'} · {c.movimientos}{' '}
                          {c.movimientos === 1 ? 'movimiento' : 'movimientos'}
                        </span>
                      </span>
                    </td>
                    <td>{cuandoSeAbrio(c.abiertaEn)}</td>
                    <td>
                      {c.cerradaEn ? (
                        cuandoSeAbrio(c.cerradaEn)
                      ) : (
                        <span className="cli-falta">Sigue abierta</span>
                      )}
                    </td>
                    <td className="cli-tabla__numero">
                      {formatearMoneda(c.saldoInicialCentavos)}
                    </td>
                    <td className="cli-tabla__numero">{formatearMoneda(c.esperadoCentavos)}</td>
                    {/* Nulo = todavia nadie conto. Cero seria decir que se
                        conto y el cajon estaba vacio. */}
                    <td className="cli-tabla__numero">
                      {c.contadoCentavos === null ? (
                        <span className="cli-falta">Sin contar</span>
                      ) : (
                        formatearMoneda(c.contadoCentavos)
                      )}
                    </td>
                    <td className={`cli-tabla__numero caja-diferencia--${como}`}>
                      {c.diferenciaCentavos === null ? (
                        <span className="cli-falta">—</span>
                      ) : c.diferenciaCentavos < 0 ? (
                        `−${formatearMoneda(-c.diferenciaCentavos)}`
                      ) : (
                        formatearMoneda(c.diferenciaCentavos)
                      )}
                    </td>
                    <td>
                      <span className={`cli-estado caja-estado--${c.estado}`}>
                        {c.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="cli-pie">
        <span className="cli-pie__cuenta">
          {total} {total === 1 ? 'caja' : 'cajas'}
        </span>
        <div className="cli-paginas" role="group" aria-label="Páginas del historial">
          <button
            type="button"
            className="cli-paginas__boton"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            ‹
          </button>
          <span className="cli-paginas__actual">
            {pagina} de {paginas}
          </span>
          <button
            type="button"
            className="cli-paginas__boton"
            aria-label="Página siguiente"
            disabled={pagina >= paginas}
            onClick={() => onPagina(pagina + 1)}
          >
            ›
          </button>
        </div>
      </footer>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function ReportesDeCaja({
  abierto,
  desde,
  hasta,
  metodo,
  reporte,
  cargando,
  error,
  onDesde,
  onHasta,
  onMetodo,
  onCerrar,
}: {
  readonly abierto: boolean;
  readonly desde: string;
  readonly hasta: string;
  readonly metodo: string;
  readonly reporte: ReporteDeCaja | null;
  readonly cargando: boolean;
  readonly error: string | null;
  onDesde(v: string): void;
  onHasta(v: string): void;
  onMetodo(v: string): void;
  onCerrar(): void;
}) {
  return (
    <Modal abierto={abierto} titulo="Reportes de caja" onCerrar={onCerrar}>
      <div className="cli-ficha">
        <div className="srv-filtros">
          <label className="cli-campo">
            <span className="cli-campo__etiqueta">Desde</span>
            <input type="date" value={desde} onChange={(e) => onDesde(e.target.value)} />
          </label>
          <label className="cli-campo">
            <span className="cli-campo__etiqueta">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => onHasta(e.target.value)} />
          </label>
          <label className="cli-campo">
            <span className="cli-campo__etiqueta">Método de pago</span>
            <select value={metodo} onChange={(e) => onMetodo(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(COMO_SE_DICE_EL_METODO_DE_CAJA).map(([clave, texto]) => (
                <option key={clave} value={clave}>
                  {texto}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <div className="cli-error" role="alert">
            <p className="cli-error__que">No pudimos cargar el reporte.</p>
            <p className="cli-error__detalle">{error}</p>
          </div>
        ) : cargando ? (
          <div className="cli-cargando" aria-busy="true">
            <span className="neron-solo-lectores">Cargando el reporte</span>
            {[0, 1].map((i) => (
              <div key={i} className="terapias-silueta cli-cargando__renglon" />
            ))}
          </div>
        ) : !reporte || reporte.movimientos === 0 ? (
          <p className="cli-vacio__texto">
            No hubo movimientos de caja en ese periodo. Los ceros son ceros porque no hay registros.
          </p>
        ) : (
          <>
            <dl className="vta-totales">
              <div>
                <dt>Ingresos</dt>
                <dd className="caja-entra">{formatearMoneda(reporte.ingresosCentavos)}</dd>
              </div>
              <div>
                <dt>Egresos</dt>
                <dd className="caja-sale">−{formatearMoneda(reporte.egresosCentavos)}</dd>
              </div>
              <div className="vta-totales__total">
                <dt>Neto</dt>
                <dd>
                  {formatearMoneda(reporte.ingresosCentavos - reporte.egresosCentavos)}
                </dd>
              </div>
              <div>
                <dt>Movimientos</dt>
                <dd>{reporte.movimientos}</dd>
              </div>
            </dl>

            <div className="cli-exp__renglon">
              <div className="cli-exp__renglon-cuerpo">
                <span className="cli-exp__etiqueta">Por forma de pago</span>
                <ul className="caja-leyenda">
                  {reporte.porMetodo.map((m) => (
                    <li key={m.metodo} className="caja-leyenda__renglon">
                      <span className="caja-leyenda__que">
                        {COMO_SE_DICE_EL_METODO_DE_CAJA[m.metodo] ?? m.metodo}
                      </span>
                      <span className="caja-leyenda__cuanto">{formatearMoneda(m.centavos)}</span>
                      <span className="caja-leyenda__parte">{m.movimientos}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="cli-exp__renglon">
              <div className="cli-exp__renglon-cuerpo">
                <span className="cli-exp__etiqueta">Por tipo</span>
                <ul className="caja-leyenda">
                  {reporte.porClase.map((c) => (
                    <li key={c.clase} className="caja-leyenda__renglon">
                      <span className="caja-leyenda__que">
                        {COMO_SE_DICE_LA_CLASE[c.clase] ?? c.clase}
                      </span>
                      <span className="caja-leyenda__cuanto">{formatearMoneda(c.centavos)}</span>
                      <span className="caja-leyenda__parte">{c.movimientos}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="cli-exp__renglon">
              <div className="cli-exp__renglon-cuerpo">
                <span className="cli-exp__etiqueta">Por usuario</span>
                <ul className="caja-leyenda">
                  {reporte.porUsuario.map((u) => (
                    <li key={u.usuario} className="caja-leyenda__renglon">
                      <span className="caja-leyenda__que">{u.usuario}</span>
                      <span className="caja-leyenda__cuanto">{formatearMoneda(u.centavos)}</span>
                      <span className="caja-leyenda__parte">{u.movimientos}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* LAS DIFERENCIAS SALEN DE LOS CORTES, no de los movimientos: son
                lo que alguien conto contra lo que el sistema esperaba. */}
            <div className="cli-exp__renglon">
              <div className="cli-exp__renglon-cuerpo">
                <span className="cli-exp__etiqueta">Diferencias de corte</span>
                {reporte.cortes.length === 0 ? (
                  <span className="cli-falta">No se cerró ninguna caja en el periodo</span>
                ) : (
                  <ul className="caja-leyenda">
                    {reporte.cortes.map((c) => (
                      <li key={c.id} className="caja-leyenda__renglon">
                        <span className="caja-leyenda__que">{c.nombre}</span>
                        <span
                          className={`caja-leyenda__cuanto caja-diferencia--${comoSeLeeLaDiferencia(c.diferenciaCentavos)}`}
                        >
                          {c.diferenciaCentavos === null
                            ? '—'
                            : c.diferenciaCentavos < 0
                              ? `−${formatearMoneda(-c.diferenciaCentavos)}`
                              : formatearMoneda(c.diferenciaCentavos)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
