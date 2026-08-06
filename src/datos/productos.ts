/**
 * EL ACCESO A DATOS DE PRODUCTOS E INVENTARIO.
 *
 * LA DECISION QUE SOSTIENE ESTE MODULO: el stock no es un numero que se edita.
 * Es la consecuencia de una lista de movimientos.
 *
 *   producto               QUE existe: nombre, sku, precio, costo, minimo.
 *   movimiento_inventario  POR QUE cambio: entrada, venta, ajuste, merma.
 *   proveedor              DE DONDE llega.
 *
 * Por eso aqui NO hay una funcion `ponerStock`. Hay `ajustarInventario`, que
 * exige un motivo. Un `update stock = 20` no dice nada tres meses despues: ni
 * quien lo hizo, ni por que faltaban dos.
 *
 * EL COSTO NO ES PARA TODO EL MUNDO, y esconderlo con CSS no lo esconde: quien
 * abra la consola lo ve igual. La base devuelve `null` a quien no tiene
 * `verCostos`, y aqui ese `null` se conserva — nunca se convierte en cero, que
 * seria un dato falso y ademas haria creer que el margen es del 100%.
 */

import { supabase } from '../supabase.js';
import { reventar } from './fechas-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

/**
 * El estado de INVENTARIO, que es otra cosa que `activo`.
 *
 * Un producto activo con cero piezas esta agotado, no inactivo: apagarlo solo
 * porque se acabo lo escondería de la lista justo cuando hay que resurtirlo.
 */
export type EstadoDeStock = 'disponible' | 'bajo' | 'agotado';

export type TipoDeMovimiento =
  | 'inicial'
  | 'entrada'
  | 'venta'
  | 'devolucion'
  | 'ajuste_entrada'
  | 'ajuste_salida'
  | 'merma'
  | 'caducado';

export interface ProductoEnLista {
  readonly id: string;
  readonly nombre: string;
  readonly sku: string | null;
  readonly codigoBarras: string | null;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly categoriaColor: string | null;
  readonly precioCentavos: number;
  /** `null` = esta persona no puede ver costos. NUNCA cero. */
  readonly costoCentavos: number | null;
  readonly stockActual: number;
  readonly stockMinimo: number;
  readonly unidad: string;
  readonly imagenUrl: string | null;
  readonly ubicacion: string | null;
  readonly inventario: EstadoDeStock;
  readonly activo: boolean;
}

export interface PaginaDeProductos {
  readonly total: number;
  readonly filas: readonly ProductoEnLista[];
}

export interface ResumenDeProductos {
  readonly total: number;
  /** `null` = esta persona no puede ver costos. El valor va con COSTO. */
  readonly valorCentavos: number | null;
  readonly bajos: number;
  readonly agotados: number;
}

export interface MovimientoDeInventario {
  readonly id: string;
  readonly tipo: TipoDeMovimiento;
  readonly cantidad: number;
  readonly stockAntes: number;
  readonly stockDespues: number;
  readonly motivo: string | null;
  readonly referenciaTipo: string | null;
  readonly referenciaId: string | null;
  readonly quien: string | null;
  readonly cuando: string;
}

export interface VentaDelProducto {
  readonly ventaId: string;
  readonly folio: string;
  readonly fecha: string;
  readonly cantidad: number;
  /** El precio que se COBRO ese dia, no el del catalogo de hoy. */
  readonly precioUnitario: number;
  readonly total: number;
  readonly clienteId: string | null;
  readonly cliente: string | null;
}

export interface ProveedorDelProducto {
  readonly id: string;
  readonly proveedorId: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly codigo: string | null;
  readonly preferido: boolean;
  readonly costoCentavos: number | null;
}

export interface FichaDeProducto {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly sku: string | null;
  readonly codigoBarras: string | null;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly categoriaColor: string | null;
  readonly precioCentavos: number;
  readonly costoCentavos: number | null;
  /** Si esta persona puede ver costos. Sin esto, un nulo se lee como "no hay". */
  readonly puedeVerCostos: boolean;
  readonly stockActual: number;
  readonly stockMinimo: number;
  readonly unidad: string;
  readonly ubicacion: string | null;
  readonly imagenUrl: string | null;
  readonly notas: string | null;
  readonly activo: boolean;
  readonly inventario: EstadoDeStock;
  readonly valorCentavos: number | null;
  readonly movimientos: readonly MovimientoDeInventario[];
  readonly ventas: readonly VentaDelProducto[];
  readonly proveedores: readonly ProveedorDelProducto[];
}

export interface ProveedorEnLista {
  readonly id: string;
  readonly nombre: string;
  readonly contacto: string | null;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly activo: boolean;
  readonly productos: number;
}

export interface FiltrosDeProductos {
  readonly busqueda?: string;
  readonly estado?: EstadoDeStock | '';
  readonly categoriaId?: string;
  readonly proveedorId?: string;
  readonly activo?: boolean | null;
}

export interface DatosDeProducto {
  readonly nombre: string;
  readonly descripcion: string;
  readonly sku: string;
  readonly codigoBarras: string;
  readonly categoriaId: string;
  readonly precioCentavos: number;
  readonly costoCentavos: number;
  readonly stockMinimo: number;
  readonly unidad: string;
  readonly ubicacion: string;
  readonly imagenUrl: string;
  readonly notas: string;
  readonly activo: boolean;
  /** Solo al crear. Al editar se ignora: el stock se mueve, no se escribe. */
  readonly stockInicial: number;
}

export interface DatosDeAjuste {
  readonly tipo: 'entrada' | 'ajuste_entrada' | 'ajuste_salida' | 'merma' | 'caducado';
  readonly cantidad: number;
  readonly motivo: string;
}

export interface DatosDeProveedor {
  readonly nombre: string;
  readonly contacto: string;
  readonly telefono: string;
  readonly correo: string;
  readonly notas: string;
  readonly activo: boolean;
}

/* ------------------------------------------------------------------ */
/* Ordenar lo que contesta el servidor                                 */
/* ------------------------------------------------------------------ */

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const opcional = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
/** Un numero que puede NO existir. `null` no se convierte en cero. */
const numeroONulo = (v: unknown): number | null =>
  v === null || v === undefined ? null : numero(v);

export const RESUMEN_DE_PRODUCTOS_VACIO: ResumenDeProductos = {
  total: 0,
  valorCentavos: null,
  bajos: 0,
  agotados: 0,
};

export function ordenarResumenDeProductos(crudo: unknown): ResumenDeProductos {
  const r = objeto(crudo);
  if (!r) return RESUMEN_DE_PRODUCTOS_VACIO;
  return {
    total: numero(r['total']),
    // Se CONSERVA el nulo: significa "no puedes ver costos", que es otra cosa
    // que "el inventario vale cero".
    valorCentavos: numeroONulo(r['valorCentavos']),
    bajos: numero(r['bajos']),
    agotados: numero(r['agotados']),
  };
}

const ESTADOS: readonly EstadoDeStock[] = ['disponible', 'bajo', 'agotado'];

const comoEstado = (v: unknown): EstadoDeStock => {
  const t = texto(v);
  return (ESTADOS as readonly string[]).includes(t) ? (t as EstadoDeStock) : 'disponible';
};

export function ordenarProducto(crudo: unknown): ProductoEnLista {
  const p = objeto(crudo) ?? {};
  return {
    id: texto(p['id']),
    nombre: texto(p['nombre']),
    sku: opcional(p['sku']),
    codigoBarras: opcional(p['codigoBarras']),
    categoriaId: opcional(p['categoriaId']),
    categoria: opcional(p['categoria']),
    categoriaColor: opcional(p['categoriaColor']),
    precioCentavos: numero(p['precioCentavos']),
    costoCentavos: numeroONulo(p['costoCentavos']),
    stockActual: numero(p['stockActual']),
    stockMinimo: numero(p['stockMinimo']),
    unidad: texto(p['unidad']) || 'pieza',
    imagenUrl: opcional(p['imagenUrl']),
    ubicacion: opcional(p['ubicacion']),
    inventario: comoEstado(p['inventario']),
    activo: Boolean(p['activo']),
  };
}

/**
 * El margen de un producto, en porcentaje sobre el precio de venta.
 *
 * `null` cuando no se puede ver el costo o cuando el precio es cero: dividir
 * entre cero acaba impreso como "NaN%" en la pantalla de la dueña, y un margen
 * inventado es peor que ninguno.
 */
export function margenDe(precio: number, costo: number | null): number | null {
  if (costo === null || !Number.isFinite(precio) || !Number.isFinite(costo)) return null;
  if (precio <= 0) return null;
  return Math.round(((precio - costo) / precio) * 100);
}

/** Como se lee el estado de inventario. */
export const COMO_SE_DICE_EL_STOCK: Readonly<Record<EstadoDeStock, string>> = {
  disponible: 'Disponible',
  bajo: 'Stock bajo',
  agotado: 'Agotado',
};

/** Como se lee cada tipo de movimiento. */
export const COMO_SE_DICE_EL_MOVIMIENTO: Readonly<Record<TipoDeMovimiento, string>> = {
  inicial: 'Inventario inicial',
  entrada: 'Entrada',
  venta: 'Venta',
  devolucion: 'Devolución',
  ajuste_entrada: 'Ajuste (entrada)',
  ajuste_salida: 'Ajuste (salida)',
  merma: 'Merma',
  caducado: 'Caducado',
};

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function llaveDeProductos(
  negocio: string,
  filtros: FiltrosDeProductos,
  pagina: number,
  porPagina: number,
): string {
  return [
    'productos', negocio,
    filtros.busqueda ?? '', filtros.estado ?? '', filtros.categoriaId ?? '',
    filtros.proveedorId ?? '',
    filtros.activo === null || filtros.activo === undefined ? '' : String(filtros.activo),
    pagina, porPagina,
  ].join(':');
}

export async function traerProductosDelCentro(
  negocio: string,
  filtros: FiltrosDeProductos,
  pagina: number,
  porPagina: number,
): Promise<PaginaDeProductos> {
  const { data, error } = await supabase().rpc('productos_del_centro', {
    p_negocio: negocio,
    p_busqueda: filtros.busqueda?.trim() || null,
    p_estado: filtros.estado || null,
    p_categoria: filtros.categoriaId || null,
    p_proveedor: filtros.proveedorId || null,
    p_activo: filtros.activo === undefined ? null : filtros.activo,
    p_pagina: pagina,
    p_por_pagina: porPagina,
  });
  reventar(error, 'cargar los productos');
  const r = objeto(data) ?? {};
  return { total: numero(r['total']), filas: lista(r['filas']).map(ordenarProducto) };
}

export function llaveDelResumenDeProductos(negocio: string): string {
  return `productos:resumen:${negocio}`;
}

export async function traerResumenDeProductos(negocio: string): Promise<ResumenDeProductos> {
  const { data, error } = await supabase().rpc('resumen_productos', { p_negocio: negocio });
  reventar(error, 'cargar el resumen de inventario');
  return ordenarResumenDeProductos(data);
}

export function llaveDeLaFichaDelProducto(productoId: string): string {
  return `productos:ficha:${productoId}`;
}

export async function traerFichaDeProducto(productoId: string): Promise<FichaDeProducto | null> {
  const { data, error } = await supabase().rpc('ficha_del_producto', { p_producto: productoId });
  reventar(error, 'cargar la ficha del producto');
  const p = objeto(data);
  if (!p) return null;

  return {
    id: texto(p['id']),
    nombre: texto(p['nombre']),
    descripcion: opcional(p['descripcion']),
    sku: opcional(p['sku']),
    codigoBarras: opcional(p['codigoBarras']),
    categoriaId: opcional(p['categoriaId']),
    categoria: opcional(p['categoria']),
    categoriaColor: opcional(p['categoriaColor']),
    precioCentavos: numero(p['precioCentavos']),
    costoCentavos: numeroONulo(p['costoCentavos']),
    puedeVerCostos: Boolean(p['puedeVerCostos']),
    stockActual: numero(p['stockActual']),
    stockMinimo: numero(p['stockMinimo']),
    unidad: texto(p['unidad']) || 'pieza',
    ubicacion: opcional(p['ubicacion']),
    imagenUrl: opcional(p['imagenUrl']),
    notas: opcional(p['notas']),
    activo: Boolean(p['activo']),
    inventario: comoEstado(p['inventario']),
    valorCentavos: numeroONulo(p['valorCentavos']),
    movimientos: lista(p['movimientos']).map((m) => {
      const x = objeto(m) ?? {};
      return {
        id: texto(x['id']),
        tipo: texto(x['tipo']) as TipoDeMovimiento,
        cantidad: numero(x['cantidad']),
        stockAntes: numero(x['stockAntes']),
        stockDespues: numero(x['stockDespues']),
        motivo: opcional(x['motivo']),
        referenciaTipo: opcional(x['referenciaTipo']),
        referenciaId: opcional(x['referenciaId']),
        quien: opcional(x['quien']),
        cuando: texto(x['cuando']),
      };
    }),
    ventas: lista(p['ventas']).map((v) => {
      const x = objeto(v) ?? {};
      return {
        ventaId: texto(x['ventaId']),
        folio: texto(x['folio']),
        fecha: texto(x['fecha']),
        cantidad: numero(x['cantidad']),
        precioUnitario: numero(x['precioUnitario']),
        total: numero(x['total']),
        clienteId: opcional(x['clienteId']),
        cliente: opcional(x['cliente']),
      };
    }),
    proveedores: lista(p['proveedores']).map((v) => {
      const x = objeto(v) ?? {};
      return {
        id: texto(x['id']),
        proveedorId: texto(x['proveedorId']),
        nombre: texto(x['nombre']),
        telefono: opcional(x['telefono']),
        correo: opcional(x['correo']),
        codigo: opcional(x['codigo']),
        preferido: Boolean(x['preferido']),
        costoCentavos: numeroONulo(x['costoCentavos']),
      };
    }),
  };
}

export function llaveDeProveedores(negocio: string): string {
  return `proveedores:${negocio}`;
}

export async function traerProveedores(negocio: string): Promise<ProveedorEnLista[]> {
  const { data, error } = await supabase().rpc('proveedores_del_centro', { p_negocio: negocio });
  reventar(error, 'cargar los proveedores');
  return lista(data).map((p) => {
    const x = objeto(p) ?? {};
    return {
      id: texto(x['id']),
      nombre: texto(x['nombre']),
      contacto: opcional(x['contacto']),
      telefono: opcional(x['telefono']),
      correo: opcional(x['correo']),
      activo: Boolean(x['activo']),
      productos: numero(x['productos']),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

export async function guardarProducto(
  negocio: string,
  id: string | null,
  datos: DatosDeProducto,
): Promise<void> {
  const { error } = await supabase().rpc('guardar_producto', {
    p_negocio: negocio,
    p_id: id,
    p_nombre: datos.nombre.trim().replace(/\s+/g, ' '),
    p_descripcion: datos.descripcion.trim() || null,
    p_sku: datos.sku.trim() || null,
    p_codigo_barras: datos.codigoBarras.trim() || null,
    p_categoria: datos.categoriaId || null,
    p_precio: datos.precioCentavos,
    p_costo: datos.costoCentavos,
    p_stock_minimo: datos.stockMinimo,
    p_unidad: datos.unidad || 'pieza',
    p_ubicacion: datos.ubicacion.trim() || null,
    p_imagen: datos.imagenUrl.trim() || null,
    p_notas: datos.notas.trim() || null,
    p_activo: datos.activo,
    // Solo cuenta al crear. La base lo ignora al editar, porque editar no
    // mueve inventario: para eso esta `ajustarInventario`.
    p_stock_inicial: id ? 0 : datos.stockInicial,
  });
  if (error && /producto_sku_unico/.test(error.message)) {
    throw new Error('Ya hay un producto con ese SKU en este centro.');
  }
  if (error && /producto_barras_unico/.test(error.message)) {
    throw new Error('Ya hay un producto con ese código de barras.');
  }
  reventar(error, 'guardar el producto');
}

/**
 * Apagar o encender un producto. NO se borra.
 *
 * Un producto apagado deja de ofrecerse en ventas nuevas, pero las ventas
 * viejas, sus movimientos y los reportes lo siguen necesitando. Y apagarlo NO
 * es lo mismo que agotarlo: se puede estar activo con cero piezas.
 */
export async function cambiarEstadoDeProducto(
  negocio: string,
  ficha: FichaDeProducto,
  activo: boolean,
): Promise<void> {
  await guardarProducto(negocio, ficha.id, {
    nombre: ficha.nombre,
    descripcion: ficha.descripcion ?? '',
    sku: ficha.sku ?? '',
    codigoBarras: ficha.codigoBarras ?? '',
    categoriaId: ficha.categoriaId ?? '',
    precioCentavos: ficha.precioCentavos,
    // Sin permiso de costos llega nulo; se manda cero para no reventar la
    // llamada, y la base lo rechazaria si no tuviera permiso de todos modos.
    costoCentavos: ficha.costoCentavos ?? 0,
    stockMinimo: ficha.stockMinimo,
    unidad: ficha.unidad,
    ubicacion: ficha.ubicacion ?? '',
    imagenUrl: ficha.imagenUrl ?? '',
    notas: ficha.notas ?? '',
    activo,
    stockInicial: 0,
  });
}

/**
 * Mover el inventario. La UNICA forma de cambiar el stock desde la pantalla.
 *
 * El motivo es obligatorio a proposito: un ajuste sin motivo es exactamente el
 * `update stock = 20` que este modulo existe para evitar.
 */
export async function ajustarInventario(
  productoId: string,
  datos: DatosDeAjuste,
): Promise<void> {
  const { error } = await supabase().rpc('ajustar_inventario', {
    p_producto: productoId,
    p_tipo: datos.tipo,
    p_cantidad: datos.cantidad,
    p_motivo: datos.motivo.trim(),
  });
  reventar(error, 'ajustar el inventario');
}

export async function guardarProveedor(
  negocio: string,
  id: string | null,
  datos: DatosDeProveedor,
): Promise<void> {
  const { error } = await supabase().rpc('guardar_proveedor', {
    p_negocio: negocio,
    p_id: id,
    p_nombre: datos.nombre.trim(),
    p_contacto: datos.contacto.trim() || null,
    p_telefono: datos.telefono.trim() || null,
    p_correo: datos.correo.trim() || null,
    p_notas: datos.notas.trim() || null,
    p_activo: datos.activo,
  });
  reventar(error, 'guardar el proveedor');
}

export async function ligarProveedor(
  productoId: string,
  proveedorId: string,
  costoCentavos: number | null,
  codigo: string,
  preferido: boolean,
): Promise<void> {
  const { error } = await supabase().rpc('ligar_proveedor', {
    p_producto: productoId,
    p_proveedor: proveedorId,
    p_costo: costoCentavos,
    p_codigo: codigo.trim() || null,
    p_preferido: preferido,
  });
  reventar(error, 'ligar el proveedor');
}

export async function desligarProveedor(id: string): Promise<void> {
  const { error } = await supabase().rpc('desligar_proveedor', { p_id: id });
  reventar(error, 'quitar el proveedor');
}

/**
 * Todo lo que hay que refrescar al tocar un producto.
 *
 * Incluye `ventas` porque el buscador de la venta ofrece productos activos con
 * su stock: apagar uno o agotarlo tiene que quitarlo de esa lista sin recargar.
 */
export const LO_QUE_TOCA_UN_PRODUCTO = [
  'productos', 'proveedores', 'categorias', 'ventas', PREFIJO_DE_INICIO,
] as const;
