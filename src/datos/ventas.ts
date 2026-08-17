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
import { numero, numeroONulo, texto, opcional, lista, objeto, centavos, centavosONulos } from './lo-que-llega-de-la-base.js';
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
    totalCentavos: centavos(r['totalCentavos']),
    servicios: numero(r['servicios']),
    serviciosCentavos: centavos(r['serviciosCentavos']),
    productos: numero(r['productos']),
    productosCentavos: centavos(r['productosCentavos']),
    cursos: numero(r['cursos']),
    cursosCentavos: centavos(r['cursosCentavos']),
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
    precioCentavos: centavos(c['precioCentavos']),
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
    subtotalCentavos: centavos(v['subtotalCentavos']),
    descuentoCentavos: centavos(v['descuentoCentavos']),
    totalCentavos: centavos(v['totalCentavos']),
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

/* ------------------------------------------------------------------ */
/* El calendario del historial                                         */
/* ------------------------------------------------------------------ */

/**
 * UN DIA CON VENTAS. Es el ladrillo del historial por mes, semana y dia.
 *
 * Solo llegan los dias que TIENEN algo: un año son unos trescientos renglones
 * minusculos en vez de las quinientas ventas enteras, y los meses y las
 * semanas se suman a partir de estos sin volver al servidor.
 */
export interface DiaConVentas {
  readonly fecha: Fecha;
  readonly cuantas: number;
  readonly totalCentavos: number;
}

export function llaveDelCalendarioDeVentas(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
): string {
  return `ventas:calendario:${negocio}:${desde}:${hasta}`;
}

export async function traerCalendarioDeVentas(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
): Promise<DiaConVentas[]> {
  const { data, error } = await supabase().rpc('ventas_por_dia', {
    p_negocio: negocio,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
  });
  reventar(error, 'armar el calendario de ventas');
  return lista(data).map((d) => {
    const x = objeto(d) ?? {};
    return {
      fecha: deBase(x['fecha']),
      cuantas: numero(x['cuantas']),
      totalCentavos: centavos(x['totalCentavos']),
    };
  });
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
    subtotalCentavos: centavos(v['subtotalCentavos']),
    descuentoCentavos: centavos(v['descuentoCentavos']),
    impuestoCentavos: centavos(v['impuestoCentavos']),
    totalCentavos: centavos(v['totalCentavos']),
    efectivoRecibidoCentavos: centavosONulos(v['efectivoRecibidoCentavos']),
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
        precioUnitario: centavos(x['precioUnitario']),
        descuento: centavos(x['descuento']),
        subtotal: centavos(x['subtotal']),
        costoUnitario: centavosONulos(x['costoUnitario']),
      };
    }),
    pagos: lista(v['pagos']).map((p) => {
      const x = objeto(p) ?? {};
      return {
        id: texto(x['id']),
        metodo: texto(x['metodo']) as MetodoDePago,
        montoCentavos: centavos(x['montoCentavos']),
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
      totalCentavos: centavos(x['totalCentavos']),
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
      precioCentavos: centavos(x['precioUnitario']),
      cantidad: numero(x['cantidad']),
      descuentoCentavos: centavos(x['descuento']),
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
  /**
   * DE QUE CITA SALE ESTE COBRO. Vacio en una venta de mostrador.
   *
   * Con una cita puesta se llama a `cobrar_cita` en vez de a `registrar_venta`:
   * es la MISMA transaccion mas dos cosas —atar la venta a la cita y dejarla
   * completada—. Hacerlo con dos llamadas desde aqui dejaba el hueco de que la
   * segunda fallara: la venta cobrada y la cita diciendo que sigue pendiente,
   * que es exactamente como se cobra dos veces la misma sesion.
   */
  readonly citaId?: string;
}

/**
 * Cobrar. UNA sola llamada, UNA sola transaccion.
 *
 * Se manda QUE se vende y COMO se paga. El precio lo resuelve el servidor: si
 * viajara desde aqui, el cliente decidiria cuanto paga.
 */
export async function registrarVenta(negocio: string, v: LoQueSeCobra): Promise<string> {
  const comun = {
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
  };

  /*
   * DOS FUNCIONES, UNA SOLA LLAMADA DESDE AQUI.
   *
   * `cobrar_cita` ENVUELVE a `registrar_venta` en el servidor: mismos
   * argumentos, misma transaccion, y ademas ata la venta a la cita y la deja
   * completada. Por eso aqui solo cambia a cual se llama y no hay ni un
   * duplicado del armado de renglones — que es donde vive el error de mandar
   * el descuento en un sitio y no en el otro.
   */
  const { data, error } = v.citaId
    ? await supabase().rpc('cobrar_cita', { ...comun, p_cita: v.citaId })
    : await supabase().rpc('registrar_venta', comun);
  reventar(error, 'registrar la venta');
  return texto(objeto(data)?.['id']);
}

/**
 * Si lo que fallo fue que esa cita ya se habia cobrado.
 *
 * Pasa de verdad: dos pestañas abiertas, o alguien que ya cobro desde el
 * mostrador y despues aprieta "Cobrar ahora" en la agenda. La base lo impide
 * con un indice unico; la pantalla lo traduce a "esta cita ya se cobro" y
 * ofrece ver la venta en vez de dejar un error de base a la vista.
 */
export function citaYaCobrada(error: string | null): boolean {
  return error !== null && /ya se cobro|venta_una_por_cita/i.test(error);
}

/**
 * Si lo que fallo fue que no hay caja abierta.
 *
 * Se mira el mensaje del servidor en vez de un codigo porque el mensaje es lo
 * que ya viaja, y porque la pantalla no tiene que adivinar: cuando es esto,
 * ofrece ir a Caja en vez de dejar a quien cobra releyendo un error.
 */
export function faltaLaCaja(error: string | null): boolean {
  return error !== null && /caja abierta/i.test(error);
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
 *
 * `citas` ENTRO CON EL COBRO DESDE LA AGENDA. Sin ella, cobrar una cita
 * dejaba la agenda de la pestaña de al lado diciendo "pendiente de cobro"
 * hasta que alguien recargara — y el boton de cobrar seguia ahi, invitando a
 * cobrarla otra vez. La base lo habria impedido, pero el error correcto es el
 * que no llega a ocurrir.
 */
export const LO_QUE_TOCA_UNA_VENTA = [
  'ventas', 'cotizaciones', 'productos', 'cursos', 'clientes', 'caja', 'citas',
  PREFIJO_DE_INICIO,
] as const;
