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

import { Modal } from '../ui/modal.js';
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
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar el historial.</p>
          <p className="pz-error__detalle">{error}</p>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el historial</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : cajas.length === 0 ? (
        <div className="pz-vacio pz-vacio--chico">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="reloj" lado={36} />
          </span>
          <p className="pz-vacio__texto">
            Todavía no se ha cerrado ninguna caja. Cada corte queda aquí con lo que se esperaba, lo
            que se contó y la diferencia.
          </p>
        </div>
      ) : (
        <div className="pz-tabla__marco">
          <table className="pz-tabla">
            <thead>
              <tr>
                <th>Caja</th>
                <th>Apertura</th>
                <th>Cierre</th>
                <th className="pz-tabla__numero">Inicial</th>
                <th className="pz-tabla__numero">Esperado</th>
                <th className="pz-tabla__numero">Contado</th>
                <th className="pz-tabla__numero">Diferencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cajas.map((c) => {
                const como = comoSeLeeLaDiferencia(c.diferenciaCentavos);
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="pz-renglon__cuerpo">
                        <span className="pz-renglon__titulo">{c.nombre}</span>
                        <span className="pz-renglon__pie">
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
                        <span className="tt-falta">Sigue abierta</span>
                      )}
                    </td>
                    <td className="pz-tabla__numero">
                      {formatearMoneda(c.saldoInicialCentavos)}
                    </td>
                    <td className="pz-tabla__numero">{formatearMoneda(c.esperadoCentavos)}</td>
                    {/* Nulo = todavia nadie conto. Cero seria decir que se
                        conto y el cajon estaba vacio. */}
                    <td className="pz-tabla__numero">
                      {c.contadoCentavos === null ? (
                        <span className="tt-falta">Sin contar</span>
                      ) : (
                        formatearMoneda(c.contadoCentavos)
                      )}
                    </td>
                    <td className={`pz-tabla__numero caja-diferencia--${como}`}>
                      {c.diferenciaCentavos === null ? (
                        <span className="tt-falta">—</span>
                      ) : c.diferenciaCentavos < 0 ? (
                        `−${formatearMoneda(-c.diferenciaCentavos)}`
                      ) : (
                        formatearMoneda(c.diferenciaCentavos)
                      )}
                    </td>
                    <td>
                      <span className={`pz-pastilla caja-estado--${c.estado}`}>
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

      <footer className="pz-pie">
        <span className="pz-pie__cuenta">
          {total} {total === 1 ? 'caja' : 'cajas'}
        </span>
        <div className="pz-paginas" role="group" aria-label="Páginas del historial">
          <button
            type="button"
            className="pz-pagina"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            ‹
          </button>
          <span className="pz-paginas__actual">
            {pagina} de {paginas}
          </span>
          <button
            type="button"
            className="pz-pagina"
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
      <div className="pz-columna">
        <div className="pz-filtros">
          <label className="pz-campo">
            <span className="tt-etiqueta">Desde</span>
            <input type="date" value={desde} onChange={(e) => onDesde(e.target.value)} />
          </label>
          <label className="pz-campo">
            <span className="tt-etiqueta">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => onHasta(e.target.value)} />
          </label>
          <label className="pz-campo">
            <span className="tt-etiqueta">Método de pago</span>
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
          <div className="pz-error" role="alert">
            <p className="pz-error__que">No pudimos cargar el reporte.</p>
            <p className="pz-error__detalle">{error}</p>
          </div>
        ) : cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <span className="neron-solo-lectores">Cargando el reporte</span>
            {[0, 1].map((i) => (
              <div key={i} className="pz-silueta" />
            ))}
          </div>
        ) : !reporte || reporte.movimientos === 0 ? (
          <p className="pz-vacio__texto">
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

            <div className="pz-renglon pz-renglon--quieto">
              <div className="pz-dato">
                <span className="tt-etiqueta">Por forma de pago</span>
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

            <div className="pz-renglon pz-renglon--quieto">
              <div className="pz-dato">
                <span className="tt-etiqueta">Por tipo</span>
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

            <div className="pz-renglon pz-renglon--quieto">
              <div className="pz-dato">
                <span className="tt-etiqueta">Por usuario</span>
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
            <div className="pz-renglon pz-renglon--quieto">
              <div className="pz-dato">
                <span className="tt-etiqueta">Diferencias de corte</span>
                {reporte.cortes.length === 0 ? (
                  <span className="tt-falta">No se cerró ninguna caja en el periodo</span>
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
