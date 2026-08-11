/**
 * EL HISTORIAL DE VENTAS, y las cotizaciones.
 *
 * SOLO LAS COBRADAS CUENTAN COMO INGRESO. Una cancelada se queda en la lista
 * —borrarla seria reescribir la historia— pero marcada, y no suma.
 *
 * LOS METODOS SE ENSEÑAN JUNTOS: "efectivo, tarjeta" es un pago mixto, y esa
 * es la informacion que hace falta al cuadrar el cajon.
 */

import { formatearMoneda } from '@neron/base/utils';
import type { CotizacionEnLista, VentaEnLista } from '../datos/ventas.js';
import { COMO_SE_DICE_EL_METODO } from '../datos/ventas.js';
import { Icono } from '../ui/iconos.js';

export const COMO_SE_DICE_LA_VENTA: Readonly<Record<string, string>> = {
  borrador: 'Borrador',
  cobrada: 'Completada',
  cancelada: 'Cancelada',
};

export const COMO_SE_DICE_LA_COTIZACION: Readonly<Record<string, string>> = {
  abierta: 'Abierta',
  aceptada: 'Aceptada',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  convertida: 'Convertida en venta',
};

/** Los metodos, ya legibles. Una lista vacia se dice, no se deja en blanco. */
export function comoSeLeenLosMetodos(metodos: string | null): string {
  if (!metodos) return 'Sin pago registrado';
  return metodos
    .split(',')
    .map((m) => COMO_SE_DICE_EL_METODO[m.trim()] ?? m.trim())
    .join(' + ');
}

export interface PropiedadesDelHistorial {
  readonly ventas: readonly VentaEnLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly busqueda: string;
  readonly estado: string;
  readonly seleccionada: string | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly vacioTexto: string;
  onBuscar(texto: string): void;
  onEstado(estado: string): void;
  onPagina(pagina: number): void;
  onAbrir(ventaId: string): void;
  onReintentar(): void;
}

export function Historial({
  ventas,
  total,
  pagina,
  porPagina,
  busqueda,
  estado,
  seleccionada,
  cargando,
  error,
  vacioTexto,
  onBuscar,
  onEstado,
  onPagina,
  onAbrir,
  onReintentar,
}: PropiedadesDelHistorial) {
  const paginas = Math.max(1, Math.ceil(total / Math.max(porPagina, 1)));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;

  return (
    <section className="pz-tarjeta pz-tarjeta--lista" aria-label="Ventas">
      <header className="pz-cabecera">
        <div className="pz-buscador">
          <span className="pz-buscador__lupa" aria-hidden="true">
            <Icono nombre="lupa" lado={16} />
          </span>
          <input
            type="search"
            className="pz-buscador__campo"
            autoComplete="off"
            placeholder="Buscar venta…"
            aria-label="Buscar venta por folio, cliente o concepto"
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
          />
        </div>
        <label className="pz-campo pz-campo--corto">
          <span className="neron-solo-lectores">Estado de la venta</span>
          <select value={estado} onChange={(e) => onEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="cobrada">Completadas</option>
            <option value="cancelada">Canceladas</option>
          </select>
        </label>
      </header>

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar las ventas.</p>
          <p className="pz-error__detalle">{error}</p>
          <button type="button" className="pz-boton" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando las ventas</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : ventas.length === 0 ? (
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="recibo" lado={44} />
          </span>
          <p className="pz-vacio__titulo">{vacioTexto}</p>
          <p className="pz-vacio__texto">
            Las ventas aparecen aquí en cuanto se cobran, con su folio y su forma de pago.
          </p>
        </div>
      ) : (
        <div className="pz-tabla__marco">
          <table className="pz-tabla">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th className="pz-tabla__numero">Total</th>
                <th>Pago</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id} className={v.id === seleccionada ? 'pz-tabla__fila--marcada' : ''}>
                  <td>
                    <button type="button" className="pz-renglon" onClick={() => onAbrir(v.id)}>
                      <span className="pz-renglon__cuerpo">
                        <span className="pz-renglon__titulo">{v.folio}</span>
                        <span className="pz-renglon__pie">
                          {v.fecha} · {v.renglones}{' '}
                          {v.renglones === 1 ? 'renglón' : 'renglones'}
                        </span>
                      </span>
                    </button>
                  </td>
                  {/* Sin cliente se dice MOSTRADOR, no se inventa uno. */}
                  <td>{v.cliente ?? <span className="tt-falta">Mostrador</span>}</td>
                  <td>{v.vendedor ?? <span className="tt-falta">—</span>}</td>
                  <td className="pz-tabla__numero">{formatearMoneda(v.totalCentavos)}</td>
                  <td>{comoSeLeenLosMetodos(v.metodos)}</td>
                  <td>
                    <span className={`pz-pastilla vta-estado--${v.estado}`}>
                      {COMO_SE_DICE_LA_VENTA[v.estado] ?? v.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="pz-pie">
        <span className="pz-pie__cuenta">
          Mostrando {desde} a {desde === 0 ? 0 : desde + ventas.length - 1} de {total}{' '}
          {total === 1 ? 'venta' : 'ventas'}
        </span>
        <div className="pz-paginas" role="group" aria-label="Páginas">
          <button
            type="button"
            className="pz-pagina"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            ‹
          </button>
          <span className="pz-paginas__actual" aria-live="polite">
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
    </section>
  );
}

/* ------------------------------------------------------------------ */

export interface PropiedadesDeCotizaciones {
  readonly cotizaciones: readonly CotizacionEnLista[];
  readonly cargando: boolean;
  readonly error: string | null;
  onConvertir(c: CotizacionEnLista): void;
  onCancelar(c: CotizacionEnLista): void;
}

export function Cotizaciones({
  cotizaciones,
  cargando,
  error,
  onConvertir,
  onCancelar,
}: PropiedadesDeCotizaciones) {
  return (
    <section className="pz-tarjeta pz-tarjeta--lista" aria-label="Cotizaciones">
      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar las cotizaciones.</p>
          <p className="pz-error__detalle">{error}</p>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando las cotizaciones</span>
          <div className="pz-silueta" />
        </div>
      ) : cotizaciones.length === 0 ? (
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="nota" lado={44} />
          </span>
          <p className="pz-vacio__titulo">No hay cotizaciones</p>
          <p className="pz-vacio__texto">
            Arma una venta y guárdala como cotización. No mueve inventario ni caja: es una
            propuesta.
          </p>
        </div>
      ) : (
        <ul className="pz-lista mv-escalonado">
          {cotizaciones.map((c) => (
            <li key={c.id} className="pz-renglon pz-renglon--quieto">
              <span className="pz-ficha" aria-hidden="true">
                <Icono nombre="nota" lado={18} />
              </span>
              <span className="pz-renglon__cuerpo">
                <span className="pz-renglon__titulo">
                  {c.folio}
                  <span className={`pz-pastilla vta-cot--${c.estado}`}>
                    {COMO_SE_DICE_LA_COTIZACION[c.estado] ?? c.estado}
                  </span>
                </span>
                <span className="pz-renglon__pie">
                  {c.fecha} · {c.cliente ?? 'Sin cliente'} ·{' '}
                  {formatearMoneda(c.totalCentavos)}
                  {c.vence ? ` · vence ${c.vence}` : ''}
                </span>
              </span>
              <span className="pz-encabezado__acciones">
                {/* Una cotizacion CONVERTIDA no se vuelve a convertir: ya hay
                    una venta detras, y hacerlo cobraria dos veces. */}
                {c.estado !== 'convertida' && c.estado !== 'cancelada' ? (
                  <>
                    <button
                      type="button"
                      className="pz-boton"
                      onClick={() => onConvertir(c)}
                    >
                      Convertir en venta
                    </button>
                    <button
                      type="button"
                      className="pz-boton"
                      onClick={() => onCancelar(c)}
                    >
                      Cancelar
                    </button>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
