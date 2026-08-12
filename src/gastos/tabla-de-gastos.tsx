/**
 * LA TABLA DE GASTOS: buscador, filtros, pestañas, orden y paginas.
 *
 * EL BUSCADOR NO PIERDE EL FOCO, y no es casualidad. Se cumplen tres reglas:
 *
 *  1. El campo esta SIEMPRE pintado, en el mismo sitio del arbol. Si viviera
 *     dentro de un `{cargando ? … : …}`, React lo destruiria y lo volveria a
 *     crear en cuanto cambiara el estado — y un campo destruido pierde el
 *     foco, el cursor y la seleccion. Es el fallo que ya nos costo en otros
 *     modulos.
 *  2. No lleva `key` que cambie. Una llave nueva es un elemento nuevo.
 *  3. Filtrar y ordenar pasa AQUI, sobre lo que ya se trajo, sin volver a
 *     consultar. Escribir una letra no dispara un viaje al servidor, asi que
 *     no hay respuesta tardia que repinte la lista debajo del dedo.
 *
 * LOS RENGLONES NO SE ANIMAN, a proposito. Uno que se acomoda solo mientras
 * alguien va a tocarlo hace que toque el de al lado — y aqui el de al lado
 * puede ser "Anular".
 *
 * SE PAGINA SOBRE LO FILTRADO, no sobre el total. Ver "1 a 10 de 340" cuando
 * el filtro dejo 12 hace pensar que el filtro no se aplico.
 */

import { formatearMoneda } from '@neron/base/utils';
import { useMemo, useState } from 'react';
import type { Fecha } from '@neron/base/utils';
import type { Categoria } from '../datos/categorias.js';
import type { ProveedorEnLista } from '../datos/productos.js';
import {
  COMO_SE_DICE_EL_METODO,
  COMO_SE_DICE_LA_FRECUENCIA,
  METODOS_DE_GASTO,
  type GastoEnLista,
  type MetodoDeGasto,
} from '../datos/gastos.js';
import { Icono } from '../ui/iconos.js';
import { MenuDeAcciones } from '../ui/menu.js';

export type PestanaDeGastos = 'todos' | 'categoria' | 'metodo' | 'recurrentes';

export const PESTANAS_DE_GASTOS: readonly { clave: PestanaDeGastos; etiqueta: string }[] = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'categoria', etiqueta: 'Por categoría' },
  { clave: 'metodo', etiqueta: 'Por método de pago' },
  { clave: 'recurrentes', etiqueta: 'Recurrentes' },
];

export type ColumnaDeOrden = 'fecha' | 'monto' | 'concepto' | 'categoria';

export interface FiltrosDeGastos {
  readonly texto: string;
  readonly categoriaId: string;
  readonly metodo: string;
  readonly proveedorId: string;
  readonly usuario: string;
  readonly soloRecurrentes: boolean;
  readonly incluirAnulados: boolean;
  readonly montoMin: string;
  readonly montoMax: string;
}

export const FILTROS_VACIOS: FiltrosDeGastos = {
  texto: '',
  categoriaId: '',
  metodo: '',
  proveedorId: '',
  usuario: '',
  soloRecurrentes: false,
  incluirAnulados: false,
  montoMin: '',
  montoMax: '',
};

export function hayFiltroPuesto(f: FiltrosDeGastos): boolean {
  return (
    f.categoriaId !== '' ||
    f.metodo !== '' ||
    f.proveedorId !== '' ||
    f.usuario !== '' ||
    f.soloRecurrentes ||
    f.incluirAnulados ||
    f.montoMin !== '' ||
    f.montoMax !== ''
  );
}

/**
 * DONDE BUSCA EL BUSCADOR: concepto, detalle, proveedor, categoria,
 * referencia y el principio del identificador.
 *
 * Se compara en minusculas y sin acentos: quien teclea "energetica" tiene que
 * encontrar "Energética". Buscar con acentos exactos es una trampa para quien
 * escribe rapido.
 */
export function comoSeBusca(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function gastoCoincide(g: GastoEnLista, texto: string): boolean {
  if (texto.trim() === '') return true;
  const aguja = comoSeBusca(texto.trim());
  const pajar = comoSeBusca(
    [g.concepto, g.detalle ?? '', g.proveedor ?? '', g.categoria ?? '', g.referencia ?? '', g.id]
      .join(' '),
  );
  return pajar.includes(aguja);
}

/** Los pesos escritos a mano, en centavos. Vacio o ilegible = sin limite. */
export function comoCentavos(escrito: string): number | null {
  const limpio = escrito.replace(/[^\d.]/g, '');
  if (limpio === '') return null;
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function filtrarGastos(
  gastos: readonly GastoEnLista[],
  f: FiltrosDeGastos,
): GastoEnLista[] {
  const min = comoCentavos(f.montoMin);
  const max = comoCentavos(f.montoMax);

  return gastos.filter((g) => {
    // LOS ANULADOS NO SE VEN salvo que se pidan: un gasto anulado sumado a la
    // vista hace que la tabla no cuadre con las cifras de arriba.
    if (!f.incluirAnulados && g.anulado) return false;
    if (!gastoCoincide(g, f.texto)) return false;
    if (f.categoriaId !== '' && g.categoriaId !== f.categoriaId) return false;
    if (f.metodo !== '' && g.metodo !== f.metodo) return false;
    if (f.proveedorId !== '' && g.proveedorId !== f.proveedorId) return false;
    if (f.usuario !== '' && (g.usuario ?? '') !== f.usuario) return false;
    if (f.soloRecurrentes && g.recurrenteId === null) return false;
    if (min !== null && g.montoCentavos < min) return false;
    if (max !== null && g.montoCentavos > max) return false;
    return true;
  });
}

export function ordenarGastos(
  gastos: readonly GastoEnLista[],
  columna: ColumnaDeOrden,
  descendente: boolean,
): GastoEnLista[] {
  const signo = descendente ? -1 : 1;
  return [...gastos].sort((a, b) => {
    let d = 0;
    if (columna === 'monto') d = a.montoCentavos - b.montoCentavos;
    else if (columna === 'concepto') d = a.concepto.localeCompare(b.concepto, 'es');
    else if (columna === 'categoria') {
      d = (a.categoria ?? '').localeCompare(b.categoria ?? '', 'es');
    } else {
      // La fecha se compara en aaaa-mm-dd, no como texto dd/mm/aaaa: "02/01"
      // seria mayor que "01/12" y el orden saldria al reves dentro del año.
      const iso = (f: Fecha): string => f.split('/').reverse().join('-');
      d = iso(a.fecha).localeCompare(iso(b.fecha));
      // A igual dia, lo capturado despues va despues. Sin esto el orden baila
      // entre repintados y la fila que ibas a tocar se mueve.
      if (d === 0) d = a.creadoEn.localeCompare(b.creadoEn);
    }
    return d * signo;
  });
}

export interface PropiedadesDeLaTabla {
  readonly gastos: readonly GastoEnLista[];
  readonly categorias: readonly Categoria[];
  readonly proveedores: readonly ProveedorEnLista[];
  readonly usuarios: readonly string[];
  readonly filtros: FiltrosDeGastos;
  readonly filtrosAbiertos: boolean;
  readonly columna: ColumnaDeOrden;
  readonly descendente: boolean;
  readonly pagina: number;
  readonly porPagina: number;
  readonly seleccionado: string | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly puedeGestionar: boolean;
  onFiltros(f: FiltrosDeGastos): void;
  onAbrirFiltros(): void;
  onOrden(c: ColumnaDeOrden): void;
  onPagina(n: number): void;
  onPorPagina(n: number): void;
  onAbrir(id: string): void;
  onAccion(clave: string, g: GastoEnLista): void;
  onNuevo(): void;
  onExportar(): void;
  onReintentar(): void;
}

export function TablaDeGastos({
  gastos,
  categorias,
  proveedores,
  usuarios,
  filtros,
  filtrosAbiertos,
  columna,
  descendente,
  pagina,
  porPagina,
  seleccionado,
  cargando,
  error,
  puedeGestionar,
  onFiltros,
  onAbrirFiltros,
  onOrden,
  onPagina,
  onPorPagina,
  onAbrir,
  onAccion,
  onNuevo,
  onExportar,
  onReintentar,
}: PropiedadesDeLaTabla) {
  const filtrados = useMemo(() => filtrarGastos(gastos, filtros), [gastos, filtros]);
  const ordenados = useMemo(
    () => ordenarGastos(filtrados, columna, descendente),
    [filtrados, columna, descendente],
  );

  const total = ordenados.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  // Si el filtro dejo menos paginas de las que habia, se cae a la ultima que
  // existe en vez de enseñar una pagina vacia con "no hay gastos".
  const enPagina = Math.min(pagina, paginas);
  const visibles = ordenados.slice((enPagina - 1) * porPagina, enPagina * porPagina);

  const poner = <K extends keyof FiltrosDeGastos>(k: K, v: FiltrosDeGastos[K]): void => {
    onFiltros({ ...filtros, [k]: v });
    // Cambiar un filtro vuelve a la primera pagina: quedarse en la 4 de una
    // lista que ahora tiene 2 enseña un vacio que parece un error.
    if (k !== 'texto') onPagina(1);
  };

  const cabecera = (c: ColumnaDeOrden, etiqueta: string, numero = false) => (
    <th className={numero ? 'pz-tabla__numero' : ''} aria-sort={
      columna === c ? (descendente ? 'descending' : 'ascending') : 'none'
    }>
      <button type="button" className="gto-ordenar" onClick={() => onOrden(c)}>
        {etiqueta}
        <span className="gto-ordenar__flecha" aria-hidden="true">
          {columna === c ? (descendente ? '↓' : '↑') : ''}
        </span>
      </button>
    </th>
  );

  return (
    <section className="pz-tarjeta pz-tarjeta--lista" aria-labelledby="gto-lista-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="gto-lista-titulo">
          Lista de gastos
        </h3>
        <button type="button" className="pz-enlace" onClick={onExportar} disabled={total === 0}>
          <Icono nombre="archivar" lado={14} /> Exportar
        </button>
      </header>

      <div className="gto-barra">
        {/* SIEMPRE pintado y en el mismo sitio del arbol. Es lo que sostiene
            el foco mientras la lista de abajo cambia con cada letra. */}
        <div className="pz-buscador">
          <span className="pz-buscador__lupa" aria-hidden="true">
            <Icono nombre="lupa" lado={16} />
          </span>
          <input
            type="search"
            className="pz-buscador__campo"
            autoComplete="off"
            placeholder="Buscar gasto…"
            aria-label="Buscar por concepto, proveedor, categoría o referencia"
            value={filtros.texto}
            onChange={(e) => poner('texto', e.target.value)}
          />
        </div>
        <button
          type="button"
          className={`pz-boton${hayFiltroPuesto(filtros) ? ' pz-boton--puesto' : ''}`}
          aria-expanded={filtrosAbiertos}
          onClick={onAbrirFiltros}
        >
          <Icono nombre="filtros" lado={16} /> Filtrar
        </button>
        {puedeGestionar ? (
          <button type="button" className="pz-boton pz-boton--principal" onClick={onNuevo}>
            <Icono nombre="mas" lado={16} /> Nuevo gasto
          </button>
        ) : null}
      </div>

      {filtrosAbiertos ? (
        <div className="pz-filtros">
          <label className="pz-campo">
            <span className="tt-etiqueta">Categoría</span>
            <select value={filtros.categoriaId} onChange={(e) => poner('categoriaId', e.target.value)}>
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="pz-campo">
            <span className="tt-etiqueta">Método de pago</span>
            <select value={filtros.metodo} onChange={(e) => poner('metodo', e.target.value)}>
              <option value="">Todos</option>
              {METODOS_DE_GASTO.map((m) => (
                <option key={m} value={m}>
                  {COMO_SE_DICE_EL_METODO[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="pz-campo">
            <span className="tt-etiqueta">Proveedor</span>
            <select value={filtros.proveedorId} onChange={(e) => poner('proveedorId', e.target.value)}>
              <option value="">Todos</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="pz-campo">
            <span className="tt-etiqueta">Quién lo registró</span>
            <select value={filtros.usuario} onChange={(e) => poner('usuario', e.target.value)}>
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="pz-campo">
            <span className="tt-etiqueta">Monto desde</span>
            <input
              className="gto-campo"
              inputMode="decimal"
              placeholder="0"
              value={filtros.montoMin}
              onChange={(e) => poner('montoMin', e.target.value)}
            />
          </label>
          <label className="pz-campo">
            <span className="tt-etiqueta">Monto hasta</span>
            <input
              className="gto-campo"
              inputMode="decimal"
              placeholder="Sin límite"
              value={filtros.montoMax}
              onChange={(e) => poner('montoMax', e.target.value)}
            />
          </label>
          <label className="pz-campo gto-casilla">
            <input
              type="checkbox"
              checked={filtros.soloRecurrentes}
              onChange={(e) => poner('soloRecurrentes', e.target.checked)}
            />
            <span>Solo los que vienen de un recurrente</span>
          </label>
          <label className="pz-campo gto-casilla">
            <input
              type="checkbox"
              checked={filtros.incluirAnulados}
              onChange={(e) => poner('incluirAnulados', e.target.checked)}
            />
            <span>Incluir anulados</span>
          </label>
          <button
            type="button"
            className="pz-boton"
            disabled={!hayFiltroPuesto(filtros)}
            onClick={() => onFiltros({ ...FILTROS_VACIOS, texto: filtros.texto })}
          >
            Limpiar filtros
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar los gastos.</p>
          <p className="pz-error__detalle">{error}</p>
          <button type="button" className="pz-boton" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los gastos</span>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="moneda" lado={26} />
          </span>
          <p className="pz-vacio__titulo">
            {gastos.length === 0 ? 'Sin gastos registrados' : 'Ningún gasto coincide'}
          </p>
          <p className="pz-vacio__texto">
            {gastos.length === 0
              ? 'Registra tu primer gasto para comenzar a controlar tus egresos.'
              : 'Prueba con otro texto o quita algún filtro.'}
          </p>
          {gastos.length === 0 && puedeGestionar ? (
            <button type="button" className="pz-boton pz-boton--principal" onClick={onNuevo}>
              <Icono nombre="mas" lado={16} /> Nuevo gasto
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="pz-tabla__marco">
            <table className="pz-tabla">
              <thead>
                <tr>
                  {cabecera('fecha', 'Fecha')}
                  {cabecera('concepto', 'Concepto')}
                  {cabecera('categoria', 'Categoría')}
                  <th>Método</th>
                  {cabecera('monto', 'Monto', true)}
                  <th className="pz-tabla__opcional">Frecuencia</th>
                  <th className="pz-tabla__opcional">Proveedor</th>
                  <th className="pz-tabla__opcional">Registró</th>
                  <th>Estado</th>
                  <th className="pz-tabla__acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((g) => (
                  <tr
                    key={g.id}
                    className={seleccionado === g.id ? 'pz-tabla__fila--marcada' : ''}
                  >
                    <td>{g.fecha}</td>
                    <td>
                      <button
                        type="button"
                        className="pz-renglon__enlace"
                        onClick={() => onAbrir(g.id)}
                      >
                        {g.concepto}
                      </button>
                    </td>
                    <td>
                      {g.categoria ? (
                        <span className="srv-categoria">{g.categoria}</span>
                      ) : (
                        <span className="tt-falta">Sin categoría</span>
                      )}
                    </td>
                    <td>
                      <span className={`pz-pastilla gto-metodo--${g.metodo}`}>
                        {COMO_SE_DICE_EL_METODO[g.metodo]}
                      </span>
                    </td>
                    <td className="pz-tabla__numero">{formatearMoneda(g.montoCentavos)}</td>
                    <td className="pz-tabla__opcional">
                      {COMO_SE_DICE_LA_FRECUENCIA[g.frecuencia]}
                    </td>
                    <td className="pz-tabla__opcional">
                      {g.proveedor ?? <span className="tt-falta">—</span>}
                    </td>
                    <td className="pz-tabla__opcional">
                      {g.usuario ?? <span className="tt-falta">—</span>}
                    </td>
                    <td>
                      <span className={`pz-pastilla pz-pastilla--${g.anulado ? 'peligro' : 'exito'}`}>
                        {g.anulado ? 'Anulado' : 'Registrado'}
                      </span>
                    </td>
                    <td className="pz-tabla__acciones">
                      {/* LO QUE NO SE PUEDE HACER NO SE OFRECE. Un gasto
                          anulado no se edita ni se vuelve a anular, y quien no
                          gestiona finanzas solo puede mirarlo. */}
                      <MenuDeAcciones
                        de={g.concepto}
                        opciones={[
                          { clave: 'ver', etiqueta: 'Ver detalle', icono: 'lupa' },
                          ...(puedeGestionar && !g.anulado
                            ? ([
                                { clave: 'editar', etiqueta: 'Editar', icono: 'lapiz' },
                                { clave: 'duplicar', etiqueta: 'Duplicar', icono: 'cuadricula' },
                                {
                                  clave: 'recurrente',
                                  etiqueta: 'Convertir en recurrente',
                                  icono: 'reloj',
                                },
                                {
                                  clave: 'anular',
                                  etiqueta: 'Anular',
                                  icono: 'prohibido',
                                  peligro: true,
                                },
                              ] as const)
                            : []),
                        ]}
                        onEscoger={(clave) => onAccion(clave, g)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pz-pie">
            <span className="pz-pie__cuenta">
              Mostrando {(enPagina - 1) * porPagina + 1} a{' '}
              {Math.min(enPagina * porPagina, total)} de {total}{' '}
              {total === 1 ? 'gasto' : 'gastos'}
            </span>
            <div className="pz-paginas">
              <button
                type="button"
                className="pz-pagina"
                aria-label="Página anterior"
                disabled={enPagina <= 1}
                onClick={() => onPagina(enPagina - 1)}
              >
                ‹
              </button>
              <span className="pz-paginas__actual">
                {enPagina} de {paginas}
              </span>
              <button
                type="button"
                className="pz-pagina"
                aria-label="Página siguiente"
                disabled={enPagina >= paginas}
                onClick={() => onPagina(enPagina + 1)}
              >
                ›
              </button>
            </div>
            <label className="pz-campo pz-campo--corto">
              <span className="neron-solo-lectores">Gastos por página</span>
              <select value={porPagina} onChange={(e) => onPorPagina(Number(e.target.value))}>
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} por página
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Los agrupados: por categoria y por forma de pago                    */
/* ------------------------------------------------------------------ */

export interface Grupo {
  readonly clave: string;
  readonly nombre: string;
  readonly color: string | null;
  readonly centavos: number;
  readonly cuantos: number;
}

/**
 * Agrupa lo que YA se filtro, no lo que trajo el servidor.
 *
 * Es lo que hace que las pestañas respeten el buscador y los filtros: sin
 * esto, "Por categoría" enseñaria el mes entero mientras la pestaña de al lado
 * enseña doce gastos, y las dos dirian ser del mismo periodo.
 */
export function agruparPorCategoria(gastos: readonly GastoEnLista[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const g of gastos) {
    const clave = g.categoriaId ?? 'sin';
    const antes = mapa.get(clave);
    mapa.set(clave, {
      clave,
      nombre: g.categoria ?? 'Sin categoría',
      color: g.categoriaColor,
      centavos: (antes?.centavos ?? 0) + g.montoCentavos,
      cuantos: (antes?.cuantos ?? 0) + 1,
    });
  }
  return [...mapa.values()].sort((a, b) => b.centavos - a.centavos);
}

export function agruparPorMetodo(gastos: readonly GastoEnLista[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const g of gastos) {
    const antes = mapa.get(g.metodo);
    mapa.set(g.metodo, {
      clave: g.metodo,
      nombre: COMO_SE_DICE_EL_METODO[g.metodo as MetodoDeGasto],
      color: null,
      centavos: (antes?.centavos ?? 0) + g.montoCentavos,
      cuantos: (antes?.cuantos ?? 0) + 1,
    });
  }
  return [...mapa.values()].sort((a, b) => b.centavos - a.centavos);
}

export function ListaAgrupada({
  grupos,
  total,
  vacio,
}: {
  readonly grupos: readonly Grupo[];
  readonly total: number;
  readonly vacio: string;
}) {
  if (grupos.length === 0) {
    return (
      <div className="pz-vacio pz-vacio--chico">
        <p className="pz-vacio__texto">{vacio}</p>
      </div>
    );
  }
  return (
    <ul className="pz-lista mv-escalonado">
      {grupos.map((g) => {
        // Sin gastos el total es cero, y dividir daria NaN: se dice 0%.
        const parte = total > 0 ? Math.round((g.centavos / total) * 100) : 0;
        return (
          <li key={g.clave} className="pz-renglon pz-renglon--quieto gto-grupo">
            <span className="pz-renglon__cuerpo">
              <span className="pz-renglon__titulo">{g.nombre}</span>
              <span className="pz-renglon__pie">
                {g.cuantos} {g.cuantos === 1 ? 'gasto' : 'gastos'} · {parte}%
              </span>
            </span>
            {/* La barra es adorno del porcentaje que ya esta escrito al lado:
                quien no la vea no se pierde nada. */}
            <span className="gto-barra-parte" aria-hidden="true">
              <span className="gto-barra-parte__lleno" style={{ width: `${parte}%` }} />
            </span>
            <strong className="gto-grupo__monto">{formatearMoneda(g.centavos)}</strong>
          </li>
        );
      })}
    </ul>
  );
}
