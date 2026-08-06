/**
 * EL ACCESO A DATOS DE VENTAS.
 *
 * VENTAS ORQUESTA; NO ES DUEÑA DE CASI NADA. El cliente es de Clientes, el
 * servicio de Servicios, el producto y su stock de Productos, el cupo de
 * Cursos, el dinero de Caja. Por eso aqui NO hay catalogos propios: hay
 * `traerCatalogoVendible`, que pide los tres a la vez.
 *
 * Y TODO EL COBRO ES UNA SOLA LLAMADA. `registrarVenta` manda QUE se vende y
 * COMO se paga; el servidor resuelve los precios, valida el stock y el cupo,
 * calcula los totales, guarda, mueve inventario, inscribe, cobra y mete el
 * dinero a la caja — en una transaccion. Varias llamadas desde aqui dejarian
 * el sistema partido en cuanto una fallara.
 *
 * EL PRECIO NO SE MANDA. Aceptar el precio del navegador es dejar que el
 * cliente decida cuanto paga.
 */

import type { Fecha } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, deBase, reventar } from './fechas-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

export type TipoDeConcepto = 'servicio' | 'producto' | 'curso';
export type MetodoDePago = 'efectivo' | 'tarjeta' | 'transferencia' | 'otro';
export type EstadoDeVenta = 'borrador' | 'cobrada' | 'cancelada';

/** Un concepto que se puede vender, de cualquiera de los tres catalogos. */
export interface ConceptoVendible {
  readonly tipo: TipoDeConcepto;
  readonly id: string;
  readonly nombre: string;
  readonly detalle: string | null;
  readonly precioCentavos: number;
  /** Cuantos quedan. `null` = sin limite (servicios, cursos sin cupo). */
  readonly disponible: number | null;
  readonly codigo: string | null;
}

/** Un renglon del carrito, antes de cobrar. */
export interface RenglonDelCarrito {
  readonly tipo: TipoDeConcepto;
  readonly id: string;
  readonly nombre: string;
  readonly precioCentavos: number;
  readonly cantidad: number;
  readonly descuentoCentavos: number;
  readonly disponible: number | null;
}

export interface PagoDelCarrito {
  readonly metodo: MetodoDePago;
  readonly montoCentavos: number;
}

export interface VentaEnLista {
  readonly id: string;
  readonly folio: string;
  readonly fecha: Fecha;
  readonly clienteId: string | null;
  readonly cliente: string | null;
  readonly vendedor: string | null;
  readonly renglones: number;
  readonly subtotalCentavos: number;
  readonly descuentoCentavos: number;
  readonly totalCentavos: number;
  /** Los metodos juntados al leer. "efectivo, tarjeta" en un pago mixto. */
  readonly metodos: string | null;
  readonly estado: EstadoDeVenta;
  readonly creadoEn: string;
}

export interface PaginaDeVentas {
  readonly total: number;
  readonly filas: readonly VentaEnLista[];
}

export interface ResumenDeVentas {
  readonly ventas: number;
  readonly totalCentavos: number;
  readonly servicios: number;
  readonly serviciosCentavos: number;
  readonly productos: number;
  readonly productosCentavos: number;
  readonly cursos: number;
  readonly cursosCentavos: number;
  /** `null` sin ventas. Dividir entre cero daria NaN. */
  readonly ticketPromedio: number | null;
}

export interface ItemDeVenta {
  readonly id: string;
  readonly tipo: TipoDeConcepto;
  readonly descripcion: string;
  readonly cantidad: number;
  /** El precio que se COBRO ese dia, no el del catalogo de hoy. */
  readonly precioUnitario: number;
  readonly descuento: number;
  readonly subtotal: number;
  readonly costoUnitario: number | null;
}

export interface PagoDeVenta {
  readonly id: string;
  readonly metodo: MetodoDePago;
  readonly montoCentavos: number;
}

export interface FichaDeVenta {
  readonly id: string;
  readonly folio: string;
  readonly fecha: Fecha;
  readonly estado: EstadoDeVenta;
  readonly clienteId: string | null;
  readonly cliente: string | null;
  readonly clienteTelefono: string | null;
  readonly vendedorId: string | null;
  readonly vendedor: string | null;
  readonly subtotalCentavos: number;
  readonly descuentoCentavos: number;
  readonly impuestoCentavos: number;
  readonly totalCentavos: number;
  readonly efectivoRecibidoCentavos: number | null;
  readonly notas: string | null;
  readonly canceladaMotivo: string | null;
  readonly creadoEn: string;
  readonly canceladaEn: string | null;
  readonly items: readonly ItemDeVenta[];
  readonly pagos: readonly PagoDeVenta[];
}

export interface CotizacionEnLista {
  readonly id: string;
  readonly folio: string;
  readonly fecha: Fecha;
  readonly vence: Fecha | null;
  readonly clienteId: string | null;
  readonly cliente: string | null;
  readonly vendedor: string | null;
  readonly totalCentavos: number;
  readonly estado: 'abierta' | 'aceptada' | 'vencida' | 'cancelada' | 'convertida';
  readonly ventaId: string | null;
  readonly renglones: number;
}

export interface FiltrosDeVentas {
  readonly busqueda?: string;
  readonly estado?: EstadoDeVenta | '';
  readonly vendedorId?: string;
  readonly clienteId?: string;
  readonly metodo?: string;
}

/* ------------------------------------------------------------------ */
/* Aritmetica del carrito — toda en centavos ENTEROS                   */
/* ------------------------------------------------------------------ */
/*
 * El dinero NUNCA es decimal. `0.1 + 0.2` no da `0.3` en ningun lenguaje que
 * use coma flotante, y en un total de veinte renglones eso se convierte en un
 * peso que nadie encuentra. Todo son centavos enteros hasta el momento de
 * pintar.
 */

/** El importe de un renglon, ya con su descuento. Nunca negativo. */
export function importeDelRenglon(r: RenglonDelCarrito): number {
  const bruto = r.precioCentavos * r.cantidad;
  return Math.max(0, bruto - r.descuentoCentavos);
}

export function subtotalDelCarrito(renglones: readonly RenglonDelCarrito[]): number {
  return renglones.reduce((suma, r) => suma + importeDelRenglon(r), 0);
}

/**
 * El total, ya con el descuento general.
 *
 * El descuento nunca deja el total por debajo de cero: un total negativo
 * significaria que el centro le debe dinero al cliente, y eso es una
 * devolucion, no una venta.
 */
export function totalDelCarrito(
  renglones: readonly RenglonDelCarrito[],
  descuentoGeneral: number,
): number {
  return Math.max(0, subtotalDelCarrito(renglones) - Math.max(0, descuentoGeneral));
}

export function sumaDeLosPagos(pagos: readonly PagoDelCarrito[]): number {
  return pagos.reduce((suma, p) => suma + Math.max(0, p.montoCentavos), 0);
}

/** Lo que falta por cubrir. Negativo = se pago de mas. */
export function faltaPorPagar(
  renglones: readonly RenglonDelCarrito[],
  descuentoGeneral: number,
  pagos: readonly PagoDelCarrito[],
): number {
  return totalDelCarrito(renglones, descuentoGeneral) - sumaDeLosPagos(pagos);
}

/**
 * El cambio que se le devuelve al cliente.
 *
 * NO ES UN EGRESO NI RESTA DEL INGRESO: si alguien paga mil por una venta de
 * novecientos, entraron novecientos y cien eran suyos desde el principio.
 * Nunca es negativo — si dio de menos, no hay cambio, falta dinero.
 */
export function cambioDe(totalCentavos: number, efectivoRecibido: number): number {
  if (!Number.isFinite(efectivoRecibido) || efectivoRecibido <= 0) return 0;
  return Math.max(0, efectivoRecibido - totalCentavos);
}

/**
 * Un descuento en porcentaje, convertido a centavos.
 *
 * Se redondea UNA vez, sobre el total: aplicar el porcentaje renglon por
 * renglon y sumar da un peso de diferencia con lo que dice la calculadora del
 * cliente, y esa diferencia es imposible de explicar en un mostrador.
 */
export function descuentoPorcentual(baseCentavos: number, porcentaje: number): number {
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) return 0;
  const tope = Math.min(porcentaje, 100);
  return Math.round((baseCentavos * tope) / 100);
}

/** Si ese renglon se puede subir de cantidad. */
export function puedeSubir(r: RenglonDelCarrito): boolean {
  return r.disponible === null || r.cantidad < r.disponible;
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
const numeroONulo = (v: unknown): number | null =>
  v === null || v === undefined ? null : numero(v);

export const RESUMEN_DE_VENTAS_VACIO: ResumenDeVentas = {
  ventas: 0,
  totalCentavos: 0,
  servicios: 0,
  serviciosCentavos: 0,
  productos: 0,
  productosCentavos: 0,
  cursos: 0,
  cursosCentavos: 0,
  ticketPromedio: null,
};

export function ordenarResumenDeVentas(crudo: unknown): ResumenDeVentas {
  const r = objeto(crudo);
  if (!r) return RESUMEN_DE_VENTAS_VACIO;
  return {
    ventas: numero(r['ventas']),
    totalCentavos: numero(r['totalCentavos']),
    servicios: numero(r['servicios']),
    serviciosCentavos: numero(r['serviciosCentavos']),
    productos: numero(r['productos']),
    productosCentavos: numero(r['productosCentavos']),
    cursos: numero(r['cursos']),
    cursosCentavos: numero(r['cursosCentavos']),
    // Se CONSERVA el nulo: sin ventas no hay ticket promedio, y cero seria
    // una respuesta falsa.
    ticketPromedio: numeroONulo(r['ticketPromedio']),
  };
}

export function ordenarConcepto(crudo: unknown): ConceptoVendible {
  const c = objeto(crudo) ?? {};
  const t = texto(c['tipo']);
  return {
    tipo: (t === 'producto' || t === 'curso' ? t : 'servicio') as TipoDeConcepto,
    id: texto(c['id']),
    nombre: texto(c['nombre']),
    detalle: opcional(c['detalle']),
    precioCentavos: numero(c['precioCentavos']),
    // `null` = sin limite. Cero SI es cero: agotado.
    disponible: numeroONulo(c['disponible']),
    codigo: opcional(c['codigo']),
  };
}

export function ordenarVenta(crudo: unknown): VentaEnLista {
  const v = objeto(crudo) ?? {};
  return {
    id: texto(v['id']),
    folio: texto(v['folio']),
    fecha: deBase(v['fecha']),
    clienteId: opcional(v['clienteId']),
    cliente: opcional(v['cliente']),
    vendedor: opcional(v['vendedor']),
    renglones: numero(v['renglones']),
    subtotalCentavos: numero(v['subtotalCentavos']),
    descuentoCentavos: numero(v['descuentoCentavos']),
    totalCentavos: numero(v['totalCentavos']),
    metodos: opcional(v['metodos']),
    estado: (texto(v['estado']) || 'borrador') as EstadoDeVenta,
    creadoEn: texto(v['creadoEn']),
  };
}

/** Como se lee cada metodo de pago. */
export const COMO_SE_DICE_EL_METODO: Readonly<Record<string, string>> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otro: 'Otro',
};

export const METODOS: readonly MetodoDePago[] = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

/** Como se lee el tipo de un concepto. */
export const COMO_SE_DICE_EL_TIPO: Readonly<Record<TipoDeConcepto, string>> = {
  servicio: 'Servicio',
  producto: 'Producto',
  curso: 'Curso',
};

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function llaveDelCatalogo(negocio: string, busqueda: string, tipo: string): string {
  return `ventas:catalogo:${negocio}:${busqueda}:${tipo}`;
}

export async function traerCatalogoVendible(
  negocio: string,
  busqueda: string,
  tipo: string,
): Promise<ConceptoVendible[]> {
  const { data, error } = await supabase().rpc('catalogo_vendible', {
    p_negocio: negocio,
    p_busqueda: busqueda.trim() || null,
    p_tipo: tipo || null,
  });
  reventar(error, 'cargar el catálogo');
  return lista(data).map(ordenarConcepto);
}

export function llaveDeVentas(
  negocio: string,
  desde: string,
  hasta: string,
  filtros: FiltrosDeVentas,
  pagina: number,
  porPagina: number,
): string {
  return [
    'ventas', negocio, desde, hasta,
    filtros.busqueda ?? '', filtros.estado ?? '', filtros.vendedorId ?? '',
    filtros.clienteId ?? '', filtros.metodo ?? '',
    pagina, porPagina,
  ].join(':');
}

export async function traerVentas(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
  filtros: FiltrosDeVentas,
  pagina: number,
  porPagina: number,
): Promise<PaginaDeVentas> {
  const { data, error } = await supabase().rpc('ventas_del_rango', {
    p_negocio: negocio,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
    p_busqueda: filtros.busqueda?.trim() || null,
    p_estado: filtros.estado || null,
    p_vendedor: filtros.vendedorId || null,
    p_cliente: filtros.clienteId || null,
    p_metodo: filtros.metodo || null,
    p_pagina: pagina,
    p_por_pagina: porPagina,
  });
  reventar(error, 'cargar las ventas');
  const r = objeto(data) ?? {};
  return { total: numero(r['total']), filas: lista(r['filas']).map(ordenarVenta) };
}

export function llaveDelResumenDeVentas(negocio: string, dia: Fecha): string {
  return `ventas:resumen:${negocio}:${dia}`;
}

export async function traerResumenDeVentas(negocio: string, dia: Fecha): Promise<ResumenDeVentas> {
  const { data, error } = await supabase().rpc('resumen_de_ventas', {
    p_negocio: negocio,
    p_dia: aBase(dia),
  });
  reventar(error, 'cargar el resumen de ventas');
  return ordenarResumenDeVentas(data);
}

export function llaveDeLaFichaDeVenta(ventaId: string): string {
  return `ventas:ficha:${ventaId}`;
}

export async function traerFichaDeVenta(ventaId: string): Promise<FichaDeVenta | null> {
  const { data, error } = await supabase().rpc('ficha_de_venta', { p_venta: ventaId });
  reventar(error, 'cargar la venta');
  const v = objeto(data);
  if (!v) return null;
  return {
    id: texto(v['id']),
    folio: texto(v['folio']),
    fecha: deBase(v['fecha']),
    estado: (texto(v['estado']) || 'borrador') as EstadoDeVenta,
    clienteId: opcional(v['clienteId']),
    cliente: opcional(v['cliente']),
    clienteTelefono: opcional(v['clienteTelefono']),
    vendedorId: opcional(v['vendedorId']),
    vendedor: opcional(v['vendedor']),
    subtotalCentavos: numero(v['subtotalCentavos']),
    descuentoCentavos: numero(v['descuentoCentavos']),
    impuestoCentavos: numero(v['impuestoCentavos']),
    totalCentavos: numero(v['totalCentavos']),
    efectivoRecibidoCentavos: numeroONulo(v['efectivoRecibidoCentavos']),
    notas: opcional(v['notas']),
    canceladaMotivo: opcional(v['canceladaMotivo']),
    creadoEn: texto(v['creadoEn']),
    canceladaEn: opcional(v['canceladaEn']),
    items: lista(v['items']).map((i) => {
      const x = objeto(i) ?? {};
      return {
        id: texto(x['id']),
        tipo: texto(x['tipo']) as TipoDeConcepto,
        descripcion: texto(x['descripcion']),
        cantidad: numero(x['cantidad']),
        precioUnitario: numero(x['precioUnitario']),
        descuento: numero(x['descuento']),
        subtotal: numero(x['subtotal']),
        costoUnitario: numeroONulo(x['costoUnitario']),
      };
    }),
    pagos: lista(v['pagos']).map((p) => {
      const x = objeto(p) ?? {};
      return {
        id: texto(x['id']),
        metodo: texto(x['metodo']) as MetodoDePago,
        montoCentavos: numero(x['montoCentavos']),
      };
    }),
  };
}

export function llaveDeCotizaciones(negocio: string): string {
  return `cotizaciones:${negocio}`;
}

export async function traerCotizaciones(negocio: string): Promise<CotizacionEnLista[]> {
  const { data, error } = await supabase().rpc('cotizaciones_del_centro', { p_negocio: negocio });
  reventar(error, 'cargar las cotizaciones');
  return lista(data).map((c) => {
    const x = objeto(c) ?? {};
    return {
      id: texto(x['id']),
      folio: texto(x['folio']),
      fecha: deBase(x['fecha']),
      vence: x['vence'] ? deBase(x['vence']) : null,
      clienteId: opcional(x['clienteId']),
      cliente: opcional(x['cliente']),
      vendedor: opcional(x['vendedor']),
      totalCentavos: numero(x['totalCentavos']),
      estado: (texto(x['estado']) || 'abierta') as CotizacionEnLista['estado'],
      ventaId: opcional(x['ventaId']),
      renglones: numero(x['renglones']),
    };
  });
}

export async function traerItemsDeCotizacion(cotizacionId: string): Promise<RenglonDelCarrito[]> {
  const { data, error } = await supabase().rpc('items_de_cotizacion', {
    p_cotizacion: cotizacionId,
  });
  reventar(error, 'cargar la cotización');
  return lista(data).map((i) => {
    const x = objeto(i) ?? {};
    return {
      tipo: texto(x['tipo']) as TipoDeConcepto,
      id: texto(x['id']),
      nombre: texto(x['descripcion']),
      precioCentavos: numero(x['precioUnitario']),
      cantidad: numero(x['cantidad']),
      descuentoCentavos: numero(x['descuento']),
      // Al convertir se vuelve a consultar el catalogo: entre la propuesta y
      // el sí pudo acabarse el producto.
      disponible: null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

export interface LoQueSeCobra {
  readonly renglones: readonly RenglonDelCarrito[];
  readonly pagos: readonly PagoDelCarrito[];
  readonly clienteId: string;
  readonly vendedorId: string;
  readonly descuentoCentavos: number;
  readonly efectivoRecibidoCentavos: number | null;
  readonly notas: string;
  /** La llave que impide que el doble clic cobre dos veces. */
  readonly llave: string;
}

/**
 * Cobrar. UNA sola llamada, UNA sola transaccion.
 *
 * Se manda QUE se vende y COMO se paga. El precio lo resuelve el servidor: si
 * viajara desde aqui, el cliente decidiria cuanto paga.
 */
export async function registrarVenta(negocio: string, v: LoQueSeCobra): Promise<string> {
  const { data, error } = await supabase().rpc('registrar_venta', {
    p_negocio: negocio,
    p_items: v.renglones.map((r) => ({
      tipo: r.tipo,
      id: r.id,
      cantidad: r.cantidad,
      descuento: r.descuentoCentavos,
    })),
    p_pagos: v.pagos.map((p) => ({ metodo: p.metodo, monto: p.montoCentavos })),
    p_cliente: v.clienteId || null,
    p_vendedor: v.vendedorId || null,
    p_descuento: v.descuentoCentavos,
    p_efectivo_recibido: v.efectivoRecibidoCentavos,
    p_notas: v.notas.trim() || null,
    p_llave: v.llave,
  });
  reventar(error, 'registrar la venta');
  return texto(objeto(data)?.['id']);
}

export async function cancelarVenta(ventaId: string, motivo: string): Promise<void> {
  const { error } = await supabase().rpc('cancelar_venta', {
    p_venta: ventaId,
    p_motivo: motivo.trim() || null,
  });
  reventar(error, 'cancelar la venta');
}

export async function guardarCotizacion(
  negocio: string,
  renglones: readonly RenglonDelCarrito[],
  clienteId: string,
  vendedorId: string,
  descuentoCentavos: number,
  notas: string,
): Promise<void> {
  const { error } = await supabase().rpc('guardar_cotizacion', {
    p_negocio: negocio,
    p_items: renglones.map((r) => ({
      tipo: r.tipo,
      id: r.id,
      cantidad: r.cantidad,
      descuento: r.descuentoCentavos,
    })),
    p_cliente: clienteId || null,
    p_vendedor: vendedorId || null,
    p_descuento: descuentoCentavos,
    p_notas: notas.trim() || null,
  });
  reventar(error, 'guardar la cotización');
}

export async function marcarCotizacion(id: string, estado: string): Promise<void> {
  const { error } = await supabase().rpc('marcar_cotizacion', {
    p_cotizacion: id,
    p_estado: estado,
  });
  reventar(error, 'cambiar la cotización');
}

export async function marcarCotizacionConvertida(id: string, ventaId: string): Promise<void> {
  const { error } = await supabase().rpc('marcar_cotizacion_convertida', {
    p_cotizacion: id,
    p_venta: ventaId,
  });
  reventar(error, 'marcar la cotización');
}

/**
 * Todo lo que hay que refrescar al cobrar.
 *
 * Es la lista mas larga del sistema, y con razon: una venta toca el
 * inventario, los cursos, el expediente del cliente, la caja y el tablero.
 */
export const LO_QUE_TOCA_UNA_VENTA = [
  'ventas', 'cotizaciones', 'productos', 'cursos', 'clientes', 'caja', PREFIJO_DE_INICIO,
] as const;
