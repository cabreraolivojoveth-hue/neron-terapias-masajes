/**
 * LA TABLA DE MOVIMIENTOS.
 *
 * NO SE PUEDE EDITAR NI BORRAR UN RENGLON, y no es un olvido: la caja es un
 * libro. Revertir algo es AGREGAR el movimiento contrario, nunca tachar el
 * original. Un registro financiero que se puede editar no sirve para auditar
 * nada — asi que aqui no hay lapiz ni papelera, solo la ventana a la operacion
 * que produjo cada peso.
 *
 * LOS FILTROS VAN AL SERVIDOR. Filtrar en el navegador obliga a bajar todos
 * los movimientos del turno, y ademas la paginacion mentiria: diria "1 a 10 de
 * 200" enseñando los 10 de una lista ya recortada.
 */

import { formatearDinero } from '../datos/moneda.js';
import type { MovimientoDeCaja } from '../datos/caja.js';
import {
  CLASES_DE_MOVIMIENTO,
  COMO_SE_DICE_EL_METODO_DE_CAJA,
  COMO_SE_DICE_LA_CLASE,
  METODOS_DE_CAJA,
} from '../datos/caja.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

const ICONO_DEL_METODO: Readonly<Record<string, NombreDeIcono>> = {
  efectivo: 'dinero',
  tarjeta: 'recibo',
  transferencia: 'barras',
  otro: 'nota',
};

/** Como se escribe el monto de un movimiento. Los que salen llevan signo. */
export function comoSeEscribeElMonto(m: MovimientoDeCaja): string {
  return m.tipo === 'egreso'
    ? `−${formatearDinero(m.montoCentavos)}`
    : formatearDinero(m.montoCentavos);
}

/**
 * Los movimientos como texto separado por comas, para abrirlos en una hoja.
 *
 * SE ESCAPA CADA CAMPO. Un concepto con una coma —"Pago de material, velas"—
 * partiria el renglon en dos y la hoja saldria corrida a partir de ahi.
 *
 * Y VA EN PESOS CON PUNTO DECIMAL, no en centavos: quien abre el archivo
 * espera leer 650.00, no 65000.
 */
export function csvDeMovimientos(movimientos: readonly MovimientoDeCaja[]): string {
  const escapar = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  const cabecera = [
    'Fecha', 'Hora', 'Tipo', 'Concepto', 'Metodo', 'Categoria', 'Monto', 'Usuario', 'Notas',
  ];
  const renglones = movimientos.map((m) =>
    [
      m.fecha,
      horaDelMovimiento(m.creadoEn),
      COMO_SE_DICE_LA_CLASE[m.clase] ?? m.clase,
      m.concepto,
      COMO_SE_DICE_EL_METODO_DE_CAJA[m.metodo] ?? m.metodo,
      m.categoria ?? '',
      `${m.tipo === 'egreso' ? '-' : ''}${(m.montoCentavos / 100).toFixed(2)}`,
      m.usuario ?? '',
      m.notas ?? '',
    ].map(escapar).join(','),
  );
  return [cabecera.map(escapar).join(','), ...renglones].join('\n');
}

/** La hora del movimiento, en local. Un valor ilegible sale vacio. */
export function horaDelMovimiento(creadoEn: string): string {
  const marca = Date.parse(creadoEn);
  if (!Number.isFinite(marca)) return '';
  const d = new Date(marca);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface PropiedadesDeLaTabla {
  readonly movimientos: readonly MovimientoDeCaja[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly busqueda: string;
  readonly clase: string;
  readonly metodo: string;
  readonly filtrosAbiertos: boolean;
  readonly cargando: boolean;
  readonly error: string | null;
  onBuscar(texto: string): void;
  onClase(clase: string): void;
  onMetodo(metodo: string): void;
  onFiltros(): void;
  onPagina(pagina: number): void;
  onAbrirVenta(ventaId: string): void;
  onReintentar(): void;
}

export function TablaDeMovimientos({
  movimientos,
  total,
  pagina,
  porPagina,
  busqueda,
  clase,
  metodo,
  filtrosAbiertos,
  cargando,
  error,
  onBuscar,
  onClase,
  onMetodo,
  onFiltros,
  onPagina,
  onAbrirVenta,
  onReintentar,
}: PropiedadesDeLaTabla) {
  const paginas = Math.max(1, Math.ceil(total / Math.max(porPagina, 1)));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hayFiltro = Boolean(busqueda || clase || metodo);

  return (
    <section className="pz-tarjeta pz-tarjeta--lista" aria-labelledby="caja-tabla-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="caja-tabla-titulo">
          Últimos movimientos
        </h3>
        <button
          type="button"
          className={`pz-boton${filtrosAbiertos || hayFiltro ? ' pz-boton--puesto' : ''}`}
          aria-expanded={filtrosAbiertos}
          onClick={onFiltros}
        >
          <Icono nombre="filtros" lado={16} /> Filtrar
        </button>
      </header>

      {filtrosAbiertos ? (
        <div className="pz-filtros">
          <div className="pz-buscador">
            <span className="pz-buscador__lupa" aria-hidden="true">
              <Icono nombre="lupa" lado={16} />
            </span>
            {/* SIEMPRE en el mismo lugar del arbol: es lo que sostiene el foco
                mientras la tabla de abajo se vuelve a pintar con cada letra. */}
            <input
              type="search"
              className="pz-buscador__campo"
              autoComplete="off"
              placeholder="Buscar por concepto…"
              aria-label="Buscar movimiento por concepto"
              value={busqueda}
              onChange={(e) => onBuscar(e.target.value)}
            />
          </div>
          <label className="pz-campo">
            <span className="tt-etiqueta">Tipo</span>
            <select value={clase} onChange={(e) => onClase(e.target.value)}>
              <option value="">Todos los tipos</option>
              {CLASES_DE_MOVIMIENTO.map((c) => (
                <option key={c} value={c}>
                  {COMO_SE_DICE_LA_CLASE[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="pz-campo">
            <span className="tt-etiqueta">Método de pago</span>
            <select value={metodo} onChange={(e) => onMetodo(e.target.value)}>
              <option value="">Todos los métodos</option>
              {METODOS_DE_CAJA.map((m) => (
                <option key={m} value={m}>
                  {COMO_SE_DICE_EL_METODO_DE_CAJA[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar los movimientos.</p>
          <p className="pz-error__detalle">{error}</p>
          <button type="button" className="pz-boton" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los movimientos</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : movimientos.length === 0 ? (
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="dinero" lado={44} />
          </span>
          <p className="pz-vacio__titulo">
            {hayFiltro ? 'Nada coincide con el filtro' : 'Todavía no hay movimientos'}
          </p>
          <p className="pz-vacio__texto">
            {hayFiltro
              ? 'Prueba con otro tipo o con otra forma de pago.'
              : 'Cada venta cobrada y cada gasto aparecen aquí solos, con la operación que los produjo.'}
          </p>
        </div>
      ) : (
        <div className="pz-tabla__marco">
          <table className="pz-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th>Método de pago</th>
                <th>Categoría</th>
                <th className="pz-tabla__numero">Monto</th>
                <th className="pz-tabla__opcional">Usuario</th>
                <th className="pz-tabla__acciones">Origen</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td>
                    <span className="pz-renglon__cuerpo">
                      <span className="pz-renglon__titulo">{m.fecha}</span>
                      <span className="pz-renglon__pie">{horaDelMovimiento(m.creadoEn)}</span>
                    </span>
                  </td>
                  <td>
                    <span className={`pz-pastilla caja-clase--${m.clase}`}>
                      {COMO_SE_DICE_LA_CLASE[m.clase] ?? m.clase}
                    </span>
                  </td>
                  <td>
                    <span className="pz-renglon__cuerpo">
                      <span className="pz-renglon__titulo">{m.concepto}</span>
                      {m.notas ? <span className="pz-renglon__pie">{m.notas}</span> : null}
                    </span>
                  </td>
                  <td>
                    <span className={`pz-pastilla caja-metodo--${m.metodo}`}>
                      <Icono nombre={ICONO_DEL_METODO[m.metodo] ?? 'nota'} lado={14} />{' '}
                      {COMO_SE_DICE_EL_METODO_DE_CAJA[m.metodo] ?? m.metodo}
                    </span>
                  </td>
                  {/* La categoria se resuelve al leer. Sin una, se dice. */}
                  <td>{m.categoria ?? <span className="tt-falta">—</span>}</td>
                  <td
                    className={`pz-tabla__numero${m.tipo === 'egreso' ? ' caja-clase__monto--sale' : ''}`}
                  >
                    {comoSeEscribeElMonto(m)}
                  </td>
                  {/* La cabecera y la celda llevan la MISMA marca: escondiendo
                      solo una de las dos, la tabla se descuadra entera. */}
                  <td className="pz-tabla__opcional">
                    {m.usuario ?? <span className="tt-falta">—</span>}
                  </td>
                  <td className="pz-tabla__acciones">
                    {/* NO HAY EDITAR NI BORRAR: la caja es un libro. Lo unico
                        que se ofrece es ir a la operacion que lo produjo. */}
                    {m.ventaId ? (
                      <button
                        type="button"
                        className="pz-icono-boton"
                        aria-label={`Ver la venta de ${m.concepto}`}
                        onClick={() => onAbrirVenta(m.ventaId!)}
                      >
                        <Icono nombre="flecha" lado={16} />
                      </button>
                    ) : (
                      <span className="tt-falta">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="pz-pie">
        <span className="pz-pie__cuenta">
          Mostrando {desde} a {desde === 0 ? 0 : desde + movimientos.length - 1} de {total}{' '}
          {total === 1 ? 'movimiento' : 'movimientos'}
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
