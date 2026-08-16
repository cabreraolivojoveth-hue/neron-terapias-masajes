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

import { useEffect, useState } from 'react';
import { formatearDinero } from '../datos/moneda.js';
import type { Categoria } from '../datos/categorias.js';
import type { EstadoDeStock, ProductoEnLista } from '../datos/productos.js';
import { COMO_SE_DICE_EL_STOCK } from '../datos/productos.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { MenuDeAcciones } from '../ui/menu.js';

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
  readonly icono?: NombreDeIcono;
  readonly peligro?: boolean;
}

/** Lo que no se puede hacer NO se muestra, ni en gris. */
export function accionesPara(
  permisos: Readonly<Record<string, boolean>>,
  producto: ProductoEnLista,
): AccionDeProducto[] {
  const todas: AccionDeProducto[] = [
    { clave: 'ver', etiqueta: 'Ver detalle', capacidad: null, icono: 'lupa' },
    { clave: 'editar', etiqueta: 'Editar', capacidad: 'gestionarInventario', icono: 'lapiz' },
    {
      clave: 'ajustar', etiqueta: 'Ajustar inventario',
      capacidad: 'gestionarInventario', icono: 'paquete',
    },
    {
      clave: 'estado',
      etiqueta: producto.activo ? 'Desactivar' : 'Activar',
      capacidad: 'gestionarInventario',
      icono: producto.activo ? 'prohibido' : 'palomita',
    },
    /*
     * ELIMINAR ES DISTINTO DE DESACTIVAR, y hasta ahora solo estaba lo segundo.
     *
     * Desactivar saca el producto del catalogo pero conserva su historial: lo que
     * ya se vendio sigue cuadrando. Eliminar es para lo que NUNCA debio existir
     * —un producto capturado por error, una prueba— y por eso la base solo lo
     * deja borrar cuando no tiene ni una venta detras. Si la tiene, contesta que
     * no y la pantalla ofrece desactivarlo.
     *
     * Va en rojo y separada del resto: pegada a "Editar" se aprieta por error.
     */
    {
      clave: 'eliminar', etiqueta: 'Eliminar',
      capacidad: 'gestionarInventario', icono: 'basura', peligro: true,
    },
  ];
  return todas.filter((a) => a.capacidad === null || permisos[a.capacidad] === true);
}

/** El costo listo para leerse. `null` es "no puedes verlo", no cero. */
export function textoDelCosto(costo: number | null): string {
  return costo === null ? '—' : formatearDinero(costo);
}

/* ------------------------------------------------------------------ */


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
    <section className="pz-tarjeta pz-tarjeta--lista" aria-labelledby="prd-lista-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="prd-lista-titulo">
          Lista de productos
        </h3>
        <button
          type="button"
          className={`pz-enlace${filtrosAbiertos ? ' pz-boton--puesto' : ''}`}
          aria-expanded={filtrosAbiertos}
          onClick={onFiltros}
        >
          <Icono nombre="filtros" lado={14} /> Filtrar
        </button>
        <label className="pz-campo pz-campo--corto">
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
      <div className="pz-pestanas" role="tablist" aria-label="Filtrar por inventario">
        {PESTANAS_DE_INVENTARIO.map((p) => (
          <button
            key={p.clave || 'todos'}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            className={`pz-pestana${pestana === p.clave ? ' pz-pestana--puesta' : ''}`}
            onClick={() => onPestana(p.clave)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {filtrosAbiertos ? (
        <div className="pz-filtros">
          <div className="pz-buscador">
            <span className="pz-buscador__lupa" aria-hidden="true">
              <Icono nombre="lupa" lado={16} />
            </span>
            {/* SIEMPRE pintado, en el mismo lugar del arbol: es lo que sostiene
                el foco mientras la tabla de abajo cambia. */}
            <input
              type="search"
              className="pz-buscador__campo"
              autoComplete="off"
              placeholder="Buscar producto…"
              aria-label="Buscar producto por nombre, SKU o código de barras"
              value={busqueda}
              onChange={(e) => onBuscar(e.target.value)}
            />
          </div>
          <label className="pz-campo">
            <span className="tt-etiqueta">Proveedor</span>
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
        <div className="pz-error" role="alert">
          {/* VACIO y ERROR son estados distintos. */}
          <p className="pz-error__que">No pudimos cargar los productos.</p>
          <p className="pz-error__detalle">{error}</p>
          <button type="button" className="pz-boton" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los productos</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : productos.length === 0 ? (
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="paquete" lado={44} />
          </span>
          <p className="pz-vacio__titulo">
            {hayFiltros ? 'Ningún producto coincide' : 'No hay productos registrados'}
          </p>
          <p className="pz-vacio__texto">
            {hayFiltros
              ? 'Prueba con otro nombre o quita los filtros.'
              : 'Agrega tu primer producto para comenzar.'}
          </p>
          {puedeGestionar && !hayFiltros ? (
            <button type="button" className="pz-boton pz-boton--principal" onClick={onNuevo}>
              <Icono nombre="mas" lado={16} /> Nuevo producto
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* El scroll horizontal vive DENTRO de la tabla, nunca en la pagina. */}
          <div className="pz-tabla__marco cur-solo-ancho">
            <table className="pz-tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="pz-tabla__numero">Precio venta</th>
                  <th className="pz-tabla__numero">Costo</th>
                  <th className="pz-tabla__numero">Stock</th>
                  <th>Estado</th>
                  <th className="pz-tabla__acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id} className={p.id === seleccionado ? 'pz-tabla__fila--marcada' : ''}>
                    <td>
                      <button type="button" className="pz-renglon" onClick={() => onAccion('ver', p)}>
                        <Miniatura producto={p} />
                        <span className="pz-renglon__cuerpo">
                          <span className="pz-renglon__titulo">{p.nombre}</span>
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
                        <span className="tt-falta">Sin categoría</span>
                      )}
                    </td>
                    <td className="pz-tabla__numero">{formatearDinero(p.precioCentavos)}</td>
                    <td className="pz-tabla__numero">{textoDelCosto(p.costoCentavos)}</td>
                    <td className="pz-tabla__numero">
                      <span className={`prd-stock prd-stock--${p.inventario}`}>
                        {p.stockActual}
                      </span>
                    </td>
                    <td>
                      <span className={`pz-pastilla prd-estado--${p.inventario}`}>
                        {COMO_SE_DICE_EL_STOCK[p.inventario]}
                      </span>
                      {/* Apagado es OTRA cosa que agotado, y se dice aparte. */}
                      {!p.activo ? (
                        <span className="pz-pastilla pz-pastilla">Desactivado</span>
                      ) : null}
                    </td>
                    <td className="pz-tabla__acciones">
                      <MenuDeAcciones
                      de={p.nombre}
                      opciones={accionesPara(permisos, p)}
                      onEscoger={(clave) => onAccion(clave, p)}
                    />
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
                    <span className="pz-renglon__cuerpo">
                      <span className="pz-renglon__titulo">{p.nombre}</span>
                      {p.sku ? <span className="prd-sku">SKU: {p.sku}</span> : null}
                    </span>
                    <span className={`pz-pastilla prd-estado--${p.inventario}`}>
                      {COMO_SE_DICE_EL_STOCK[p.inventario]}
                    </span>
                  </span>
                  <span className="cur-tarjeta__datos">
                    <span>{formatearDinero(p.precioCentavos)}</span>
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

      <footer className="pz-pie">
        <span className="pz-pie__cuenta">
          Mostrando {desde} a {desde === 0 ? 0 : desde + productos.length - 1} de {total}{' '}
          {total === 1 ? 'producto' : 'productos'}
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

        <label className="pz-campo pz-campo--corto">
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
