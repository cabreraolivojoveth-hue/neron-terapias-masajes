/**
 * LA LISTA DE PRODUCTOS: pestañas, buscador, filtros, tabla y paginacion.
 *
 * EL BUSCADOR MIRA EL SKU Y EL CODIGO DE BARRAS, no solo el nombre. En un
 * mostrador se busca por lo que diga la etiqueta.
 *
 * EL COSTO SOLO A QUIEN PUEDE VERLO. Llega `null` desde la base —no cero— y la
 * columna lo dice con una raya. Esconderlo con CSS no lo esconde: quien abra
 * la consola lo ve igual, por eso la decision esta en el servidor.
 *
 * EN CELULAR LA TABLA SE VUELVE TARJETAS. Siete columnas en cuatrocientos
 * pixeles no se leen: se adivinan.
 */

import { formatearMoneda } from '@neron/base/utils';
import { useEffect, useRef, useState } from 'react';
import type { Categoria } from '../datos/categorias.js';
import type { EstadoDeStock, ProductoEnLista } from '../datos/productos.js';
import { COMO_SE_DICE_EL_STOCK } from '../datos/productos.js';
import { Icono } from '../ui/iconos.js';

export const PESTANAS_DE_INVENTARIO: readonly { clave: string; etiqueta: string }[] = [
  { clave: '', etiqueta: 'Todos' },
  { clave: 'disponible', etiqueta: 'Disponibles' },
  { clave: 'bajo', etiqueta: 'Stock bajo' },
  { clave: 'agotado', etiqueta: 'Agotados' },
];

export interface AccionDeProducto {
  readonly clave: string;
  readonly etiqueta: string;
  readonly capacidad: string | null;
}

/** Lo que no se puede hacer NO se muestra, ni en gris. */
export function accionesPara(
  permisos: Readonly<Record<string, boolean>>,
  producto: ProductoEnLista,
): AccionDeProducto[] {
  const todas: AccionDeProducto[] = [
    { clave: 'ver', etiqueta: 'Ver detalle', capacidad: null },
    { clave: 'editar', etiqueta: 'Editar', capacidad: 'gestionarInventario' },
    { clave: 'ajustar', etiqueta: 'Ajustar inventario', capacidad: 'gestionarInventario' },
    {
      clave: 'estado',
      etiqueta: producto.activo ? 'Desactivar' : 'Activar',
      capacidad: 'gestionarInventario',
    },
  ];
  return todas.filter((a) => a.capacidad === null || permisos[a.capacidad] === true);
}

/** El costo listo para leerse. `null` es "no puedes verlo", no cero. */
export function textoDelCosto(costo: number | null): string {
  return costo === null ? '—' : formatearMoneda(costo);
}

/* ------------------------------------------------------------------ */

function MenuDeAcciones({
  producto,
  permisos,
  onAccion,
}: {
  readonly producto: ProductoEnLista;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly onAccion: (clave: string, p: ProductoEnLista) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const acciones = accionesPara(permisos, producto);

  useEffect(() => {
    if (!abierto) return;
    // `mousedown` y no `click`: con `click` el primer toque fuera se pierde.
    const afuera = (e: MouseEvent): void => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      boton.current?.focus();
    };
    document.addEventListener('mousedown', afuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', afuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  if (acciones.length === 0) return null;

  return (
    <div className="cli-menu" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="cli-menu__boton"
        aria-expanded={abierto}
        aria-label={`Acciones para ${producto.nombre}`}
        onClick={() => setAbierto((a) => !a)}
      >
        <Icono nombre="puntos" lado={18} />
      </button>
      {abierto ? (
        <div className="cli-menu__panel" role="menu">
          {acciones.map((a) => (
            <button
              key={a.clave}
              type="button"
              role="menuitem"
              className="cli-menu__opcion"
              onClick={() => {
                setAbierto(false);
                onAccion(a.clave, producto);
              }}
            >
              {a.etiqueta}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** La miniatura. Sin imagen NO se carga una de ejemplo: va un icono neutro. */
function Miniatura({ producto }: { readonly producto: ProductoEnLista }) {
  if (producto.imagenUrl) {
    return (
      <img
        className="prd-foto"
        src={producto.imagenUrl}
        alt=""
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return (
    <span className="prd-foto prd-foto--vacia" aria-hidden="true">
      <Icono nombre="paquete" lado={18} />
    </span>
  );
}

/* ------------------------------------------------------------------ */

export interface PropiedadesDeTablaDeProductos {
  readonly productos: readonly ProductoEnLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly busqueda: string;
  readonly pestana: string;
  readonly categoriaId: string;
  readonly proveedorId: string;
  readonly soloInactivos: boolean;
  readonly categorias: readonly Categoria[];
  readonly proveedores: readonly { id: string; nombre: string }[];
  readonly filtrosAbiertos: boolean;
  readonly seleccionado: string | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly cargando: boolean;
  readonly error: string | null;
  onBuscar(texto: string): void;
  onPestana(clave: string): void;
  onCategoria(id: string): void;
  onProveedor(id: string): void;
  onSoloInactivos(v: boolean): void;
  onFiltros(): void;
  onPagina(pagina: number): void;
  onPorPagina(cuantos: number): void;
  onAccion(clave: string, producto: ProductoEnLista): void;
  onNuevo(): void;
  onReintentar(): void;
}

const POR_PAGINA = [10, 25, 50];

export function TablaDeProductos({
  productos,
  total,
  pagina,
  porPagina,
  busqueda,
  pestana,
  categoriaId,
  proveedorId,
  soloInactivos,
  categorias,
  proveedores,
  filtrosAbiertos,
  seleccionado,
  permisos,
  cargando,
  error,
  onBuscar,
  onPestana,
  onCategoria,
  onProveedor,
  onSoloInactivos,
  onFiltros,
  onPagina,
  onPorPagina,
  onAccion,
  onNuevo,
  onReintentar,
}: PropiedadesDeTablaDeProductos) {
  const paginas = Math.max(1, Math.ceil(total / Math.max(porPagina, 1)));
  const puedeGestionar = permisos['gestionarInventario'] === true;
  const hayFiltros = Boolean(busqueda || pestana || categoriaId || proveedorId || soloInactivos);
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;

  return (
    <section className="cli-panel cli-lista" aria-labelledby="prd-lista-titulo">
      <header className="cli-panel__barra">
        <h3 className="cli-panel__titulo" id="prd-lista-titulo">
          Lista de productos
        </h3>
        <button
          type="button"
          className={`cli-panel__enlace${filtrosAbiertos ? ' srv-filtro--puesto' : ''}`}
          aria-expanded={filtrosAbiertos}
          onClick={onFiltros}
        >
          <Icono nombre="filtros" lado={14} /> Filtrar
        </button>
        <label className="cli-campo cli-campo--corto">
          <span className="neron-solo-lectores">Categoría</span>
          <select value={categoriaId} onChange={(e) => onCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* Las pestañas FILTRAN de verdad: no son decoracion sobre la misma lista. */}
      <div className="cur-pestanas" role="tablist" aria-label="Filtrar por inventario">
        {PESTANAS_DE_INVENTARIO.map((p) => (
          <button
            key={p.clave || 'todos'}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            className={`cur-pestana${pestana === p.clave ? ' cur-pestana--puesta' : ''}`}
            onClick={() => onPestana(p.clave)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {filtrosAbiertos ? (
        <div className="srv-filtros">
          <div className="cli-buscador">
            <span className="cli-buscador__lupa" aria-hidden="true">
              <Icono nombre="lupa" lado={16} />
            </span>
            {/* SIEMPRE pintado, en el mismo lugar del arbol: es lo que sostiene
                el foco mientras la tabla de abajo cambia. */}
            <input
              type="search"
              className="cli-buscador__campo"
              autoComplete="off"
              placeholder="Buscar producto…"
              aria-label="Buscar producto por nombre, SKU o código de barras"
              value={busqueda}
              onChange={(e) => onBuscar(e.target.value)}
            />
          </div>
          <label className="cli-campo">
            <span className="cli-campo__etiqueta">Proveedor</span>
            <select value={proveedorId} onChange={(e) => onProveedor(e.target.value)}>
              <option value="">Todos</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          {/* Un producto apagado no sale por omision, pero hay que poder
              encontrarlo: si no, se captura otra vez el que ya existia. */}
          <label className="srv-casilla">
            <input
              type="checkbox"
              checked={soloInactivos}
              onChange={(e) => onSoloInactivos(e.target.checked)}
            />
            <span>Ver los desactivados</span>
          </label>
        </div>
      ) : null}

      {error ? (
        <div className="cli-error" role="alert">
          {/* VACIO y ERROR son estados distintos. */}
          <p className="cli-error__que">No pudimos cargar los productos.</p>
          <p className="cli-error__detalle">{error}</p>
          <button type="button" className="cli-boton-suave" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="cli-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los productos</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="terapias-silueta cli-cargando__renglon" />
          ))}
        </div>
      ) : productos.length === 0 ? (
        <div className="cli-vacio">
          <span className="cli-vacio__icono" aria-hidden="true">
            <Icono nombre="paquete" lado={44} />
          </span>
          <p className="cli-vacio__titulo">
            {hayFiltros ? 'Ningún producto coincide' : 'No hay productos registrados'}
          </p>
          <p className="cli-vacio__texto">
            {hayFiltros
              ? 'Prueba con otro nombre o quita los filtros.'
              : 'Agrega tu primer producto para comenzar.'}
          </p>
          {puedeGestionar && !hayFiltros ? (
            <button type="button" className="cli-boton-principal" onClick={onNuevo}>
              <Icono nombre="mas" lado={16} /> Nuevo producto
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* El scroll horizontal vive DENTRO de la tabla, nunca en la pagina. */}
          <div className="cli-tabla__marco cur-solo-ancho">
            <table className="cli-tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="cli-tabla__numero">Precio venta</th>
                  <th className="cli-tabla__numero">Costo</th>
                  <th className="cli-tabla__numero">Stock</th>
                  <th>Estado</th>
                  <th className="cli-tabla__acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id} className={p.id === seleccionado ? 'cli-tabla__fila--marcada' : ''}>
                    <td>
                      <button type="button" className="cli-persona" onClick={() => onAccion('ver', p)}>
                        <Miniatura producto={p} />
                        <span className="srv-nombre">
                          <span className="cli-persona__nombre">{p.nombre}</span>
                          {/* Sin SKU NO se inventa uno: se deja el renglon limpio. */}
                          {p.sku ? <span className="prd-sku">SKU: {p.sku}</span> : null}
                        </span>
                      </button>
                    </td>
                    <td>
                      {p.categoria ? (
                        <span
                          className="srv-categoria"
                          {...(p.categoriaColor
                            ? { style: { color: p.categoriaColor, borderColor: p.categoriaColor } }
                            : {})}
                        >
                          {p.categoria}
                        </span>
                      ) : (
                        <span className="cli-falta">Sin categoría</span>
                      )}
                    </td>
                    <td className="cli-tabla__numero">{formatearMoneda(p.precioCentavos)}</td>
                    <td className="cli-tabla__numero">{textoDelCosto(p.costoCentavos)}</td>
                    <td className="cli-tabla__numero">
                      <span className={`prd-stock prd-stock--${p.inventario}`}>
                        {p.stockActual}
                      </span>
                    </td>
                    <td>
                      <span className={`cli-estado prd-estado--${p.inventario}`}>
                        {COMO_SE_DICE_EL_STOCK[p.inventario]}
                      </span>
                      {/* Apagado es OTRA cosa que agotado, y se dice aparte. */}
                      {!p.activo ? (
                        <span className="cli-estado cli-estado--inactivo">Desactivado</span>
                      ) : null}
                    </td>
                    <td className="cli-tabla__acciones">
                      <MenuDeAcciones producto={p} permisos={permisos} onAccion={onAccion} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* En celular, tarjetas con lo que de verdad decide algo. */}
          <ul className="cur-tarjetas">
            {productos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`cur-tarjeta${p.id === seleccionado ? ' cur-tarjeta--marcada' : ''}`}
                  onClick={() => onAccion('ver', p)}
                >
                  <span className="cur-tarjeta__cabeza">
                    <Miniatura producto={p} />
                    <span className="srv-nombre">
                      <span className="cli-persona__nombre">{p.nombre}</span>
                      {p.sku ? <span className="prd-sku">SKU: {p.sku}</span> : null}
                    </span>
                    <span className={`cli-estado prd-estado--${p.inventario}`}>
                      {COMO_SE_DICE_EL_STOCK[p.inventario]}
                    </span>
                  </span>
                  <span className="cur-tarjeta__datos">
                    <span>{formatearMoneda(p.precioCentavos)}</span>
                    <span>
                      {p.stockActual} {p.unidad}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <footer className="cli-pie">
        <span className="cli-pie__cuenta">
          Mostrando {desde} a {desde === 0 ? 0 : desde + productos.length - 1} de {total}{' '}
          {total === 1 ? 'producto' : 'productos'}
        </span>

        <div className="cli-paginas" role="group" aria-label="Páginas">
          <button
            type="button"
            className="cli-paginas__boton"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            ‹
          </button>
          <span className="cli-paginas__actual" aria-live="polite">
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

        <label className="cli-campo cli-campo--corto">
          <span className="neron-solo-lectores">Cuántos por página</span>
          <select value={porPagina} onChange={(e) => onPorPagina(Number(e.target.value))}>
            {POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n} por página
              </option>
            ))}
          </select>
        </label>
      </footer>
    </section>
  );
}
