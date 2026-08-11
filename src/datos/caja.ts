/**
 * EL ACCESO A DATOS DE CAJA.
 *
 * LA DISTINCION QUE SOSTIENE EL MODULO, y la que casi nadie hace:
 *
 *   INGRESO DEL NEGOCIO   toda venta cobrada, con el metodo que sea.
 *   EFECTIVO EN EL CAJON  solo lo que se pago en efectivo.
 *
 * Una venta de mil pesos con tarjeta es un ingreso de mil pesos y CERO
 * efectivo. Si se suman juntos, al cerrar el dia el sistema pide contar seis
 * mil y en el cajon hay dos mil — y nadie sabe si falto dinero o falto
 * entender el numero. Por eso el corte compara SOLO efectivo.
 *
 * CAJA NO ES DUEÑA DE NINGUN MOVIMIENTO. Los de venta los escribe
 * `registrar_venta`, los de gasto un disparador, y los unicos que se capturan
 * a mano son los ajustes. Si aqui se pudieran meter ingresos sueltos, la caja
 * dejaria de cuadrar con las ventas el primer dia.
 *
 * Y NADA SE GUARDA CALCULADO. Ni el saldo de la caja ni los totales del dia:
 * se suman de los movimientos cada vez que se piden. Un saldo guardado se
 * desincroniza, y cuando lo hace nadie sabe cual de los dos numeros creer.
 */

import type { Fecha } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, deBase, reventar } from './fechas-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

export type MetodoDeCaja = 'efectivo' | 'tarjeta' | 'transferencia' | 'otro';

/**
 * Lo que ve la persona en la columna "Tipo".
 *
 * NO es la columna `tipo` de la base —que solo dice si entra o sale— sino la
 * combinacion de origen y direccion. Se deduce al leer: guardada seria un
 * cuarto dato que puede contradecir a los otros tres.
 */
export type ClaseDeMovimiento =
  | 'venta'
  | 'ingreso'
  | 'retiro'
  | 'gasto'
  | 'cancelacion'
  | 'devolucion';

export interface CajaAbierta {
  readonly id: string;
  readonly nombre: string;
  readonly estado: 'abierta' | 'cerrada';
  readonly saldoInicialCentavos: number;
  readonly abiertaEn: string;
  readonly abiertaPor: string | null;
  readonly observaciones: string | null;
  /** Todo lo que entro, con cualquier forma de pago. */
  readonly ingresosCentavos: number;
  readonly egresosCentavos: number;
  /** Solo lo que entro y salio EN EFECTIVO. Es lo unico que hay en el cajon. */
  readonly efectivoEntroCentavos: number;
  readonly efectivoSalioCentavos: number;
  readonly efectivoEsperadoCentavos: number;
  readonly movimientos: number;
}

export interface MovimientoDeCaja {
  readonly id: string;
  readonly fecha: Fecha;
  readonly creadoEn: string;
  readonly clase: ClaseDeMovimiento;
  readonly tipo: 'ingreso' | 'egreso';
  readonly concepto: string;
  readonly metodo: MetodoDeCaja;
  readonly categoria: string | null;
  readonly montoCentavos: number;
  readonly usuario: string | null;
  readonly notas: string | null;
  /** De que venta salio, si salio de una. Movimiento → venta → cliente. */
  readonly ventaId: string | null;
  readonly sesionId: string | null;
}

export interface PaginaDeMovimientos {
  readonly total: number;
  readonly filas: readonly MovimientoDeCaja[];
}

export interface PorMetodo {
  readonly metodo: MetodoDeCaja;
  readonly centavos: number;
  readonly movimientos: number;
}

export interface PorClase {
  readonly clase: ClaseDeMovimiento;
  readonly movimientos: number;
  readonly centavos: number;
}

export interface ResumenDeCaja {
  readonly totalEntradasCentavos: number;
  readonly metodos: readonly PorMetodo[];
  readonly clases: readonly PorClase[];
  readonly movimientos: number;
  readonly netoCentavos: number;
}

export interface CajaDelHistorial {
  readonly id: string;
  readonly nombre: string;
  readonly estado: 'abierta' | 'cerrada';
  readonly abiertaEn: string;
  readonly cerradaEn: string | null;
  readonly abiertaPor: string | null;
  readonly cerradaPor: string | null;
  readonly saldoInicialCentavos: number;
  readonly ingresosCentavos: number;
  readonly egresosCentavos: number;
  readonly esperadoCentavos: number;
  readonly contadoCentavos: number | null;
  readonly diferenciaCentavos: number | null;
  readonly movimientos: number;
  readonly observaciones: string | null;
  readonly notasCierre: string | null;
}

export interface PaginaDeCajas {
  readonly total: number;
  readonly filas: readonly CajaDelHistorial[];
}

export interface CorteDelReporte {
  readonly id: string;
  readonly nombre: string;
  readonly cerradaEn: string | null;
  readonly esperadoCentavos: number | null;
  readonly contadoCentavos: number | null;
  readonly diferenciaCentavos: number | null;
}

export interface PorUsuario {
  readonly usuario: string;
  readonly centavos: number;
  readonly movimientos: number;
}

export interface ReporteDeCaja {
  readonly ingresosCentavos: number;
  readonly egresosCentavos: number;
  readonly movimientos: number;
  readonly porMetodo: readonly PorMetodo[];
  readonly porClase: readonly PorClase[];
  readonly porUsuario: readonly PorUsuario[];
  readonly cortes: readonly CorteDelReporte[];
}

export interface FiltrosDeMovimientos {
  readonly busqueda?: string;
  readonly clase?: string;
  readonly metodo?: string;
  readonly usuarioId?: string;
  readonly desde?: Fecha | '';
  readonly hasta?: Fecha | '';
}

/* ------------------------------------------------------------------ */
/* Como se dicen las cosas                                             */
/* ------------------------------------------------------------------ */

export const COMO_SE_DICE_LA_CLASE: Readonly<Record<string, string>> = {
  venta: 'Venta',
  ingreso: 'Ingreso',
  retiro: 'Retiro',
  gasto: 'Gasto',
  cancelacion: 'Cancelación',
  devolucion: 'Devolución',
};

export const COMO_SE_DICE_EL_METODO_DE_CAJA: Readonly<Record<string, string>> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otro: 'Otro',
};

export const METODOS_DE_CAJA: readonly MetodoDeCaja[] = [
  'efectivo', 'tarjeta', 'transferencia', 'otro',
];

/** Las clases que se pueden filtrar. Salen de los movimientos que existen. */
export const CLASES_DE_MOVIMIENTO: readonly ClaseDeMovimiento[] = [
  'venta', 'ingreso', 'retiro', 'gasto', 'cancelacion', 'devolucion',
];

/* ------------------------------------------------------------------ */
/* Aritmetica — toda en centavos ENTEROS                               */
/* ------------------------------------------------------------------ */

/**
 * El efectivo que deberia haber en el cajon.
 *
 * SOLO EFECTIVO, y por eso existe esta funcion en vez de restar los totales:
 * `ingresos - egresos` incluiria la tarjeta, y el corte pediria contar dinero
 * que nunca estuvo en el cajon.
 */
export function efectivoEsperado(caja: CajaAbierta | null): number {
  if (!caja) return 0;
  return caja.saldoInicialCentavos + caja.efectivoEntroCentavos - caja.efectivoSalioCentavos;
}

/**
 * La diferencia del corte. Positiva sobra, negativa falta.
 *
 * Se conserva el signo: "diferencia de 200" sin signo no dice si el dia salio
 * bien o mal, que es justo lo unico que importa de ese numero.
 */
export function diferenciaDelCorte(contadoCentavos: number, esperadoCentavos: number): number {
  return contadoCentavos - esperadoCentavos;
}

export function comoSeLeeLaDiferencia(centavos: number | null): 'cuadra' | 'sobra' | 'falta' {
  if (centavos === null || centavos === 0) return 'cuadra';
  return centavos > 0 ? 'sobra' : 'falta';
}

/**
 * El porcentaje de una forma de pago sobre el total.
 *
 * Sin movimientos devuelve CERO, no NaN: dividir entre cero pintaria "NaN%"
 * en la pantalla de una caja recien abierta.
 */
export function porcentajeDelMetodo(centavos: number, totalCentavos: number): number {
  if (totalCentavos <= 0) return 0;
  return Math.round((centavos / totalCentavos) * 1000) / 10;
}

/** Un texto escrito por alguien, en centavos. Vacio es cero, no NaN. */
export function centavosDeLoEscrito(texto: string): number {
  const n = Number(texto.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n * 100 : 0;
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

export function ordenarCaja(crudo: unknown): CajaAbierta | null {
  const c = objeto(crudo);
  if (!c || !c['id']) return null;
  return {
    id: texto(c['id']),
    nombre: texto(c['nombre']),
    estado: (texto(c['estado']) || 'abierta') as 'abierta' | 'cerrada',
    saldoInicialCentavos: numero(c['saldoInicialCentavos']),
    abiertaEn: texto(c['abiertaEn']),
    abiertaPor: opcional(c['abiertaPor']),
    observaciones: opcional(c['observaciones']),
    ingresosCentavos: numero(c['ingresosCentavos']),
    egresosCentavos: numero(c['egresosCentavos']),
    efectivoEntroCentavos: numero(c['efectivoEntroCentavos']),
    efectivoSalioCentavos: numero(c['efectivoSalioCentavos']),
    efectivoEsperadoCentavos: numero(c['efectivoEsperadoCentavos']),
    movimientos: numero(c['movimientos']),
  };
}

export function ordenarMovimiento(crudo: unknown): MovimientoDeCaja {
  const m = objeto(crudo) ?? {};
  return {
    id: texto(m['id']),
    fecha: deBase(m['fecha']),
    creadoEn: texto(m['creadoEn']),
    clase: (texto(m['clase']) || 'ingreso') as ClaseDeMovimiento,
    tipo: (texto(m['tipo']) || 'ingreso') as 'ingreso' | 'egreso',
    concepto: texto(m['concepto']),
    metodo: (texto(m['metodo']) || 'efectivo') as MetodoDeCaja,
    categoria: opcional(m['categoria']),
    montoCentavos: numero(m['montoCentavos']),
    usuario: opcional(m['usuario']),
    notas: opcional(m['notas']),
    ventaId: opcional(m['ventaId']),
    sesionId: opcional(m['sesionId']),
  };
}

export const RESUMEN_DE_CAJA_VACIO: ResumenDeCaja = {
  totalEntradasCentavos: 0,
  metodos: [],
  clases: [],
  movimientos: 0,
  netoCentavos: 0,
};

export function ordenarResumenDeCaja(crudo: unknown): ResumenDeCaja {
  const r = objeto(crudo);
  if (!r) return RESUMEN_DE_CAJA_VACIO;
  return {
    totalEntradasCentavos: numero(r['totalEntradasCentavos']),
    metodos: lista(r['metodos']).map((m) => {
      const x = objeto(m) ?? {};
      return {
        metodo: (texto(x['metodo']) || 'efectivo') as MetodoDeCaja,
        centavos: numero(x['centavos']),
        movimientos: numero(x['movimientos']),
      };
    }),
    clases: lista(r['clases']).map((c) => {
      const x = objeto(c) ?? {};
      return {
        clase: (texto(x['clase']) || 'ingreso') as ClaseDeMovimiento,
        movimientos: numero(x['movimientos']),
        centavos: numero(x['centavos']),
      };
    }),
    movimientos: numero(r['movimientos']),
    netoCentavos: numero(r['netoCentavos']),
  };
}

export function ordenarCajaDelHistorial(crudo: unknown): CajaDelHistorial {
  const c = objeto(crudo) ?? {};
  return {
    id: texto(c['id']),
    nombre: texto(c['nombre']),
    estado: (texto(c['estado']) || 'cerrada') as 'abierta' | 'cerrada',
    abiertaEn: texto(c['abiertaEn']),
    cerradaEn: opcional(c['cerradaEn']),
    abiertaPor: opcional(c['abiertaPor']),
    cerradaPor: opcional(c['cerradaPor']),
    saldoInicialCentavos: numero(c['saldoInicialCentavos']),
    ingresosCentavos: numero(c['ingresosCentavos']),
    egresosCentavos: numero(c['egresosCentavos']),
    esperadoCentavos: numero(c['esperadoCentavos']),
    // Se CONSERVA el nulo: una caja abierta todavia no se conto, y cero seria
    // decir que se conto y estaba vacia.
    contadoCentavos: numeroONulo(c['contadoCentavos']),
    diferenciaCentavos: numeroONulo(c['diferenciaCentavos']),
    movimientos: numero(c['movimientos']),
    observaciones: opcional(c['observaciones']),
    notasCierre: opcional(c['notasCierre']),
  };
}

export const REPORTE_DE_CAJA_VACIO: ReporteDeCaja = {
  ingresosCentavos: 0,
  egresosCentavos: 0,
  movimientos: 0,
  porMetodo: [],
  porClase: [],
  porUsuario: [],
  cortes: [],
};

export function ordenarReporteDeCaja(crudo: unknown): ReporteDeCaja {
  const r = objeto(crudo);
  if (!r) return REPORTE_DE_CAJA_VACIO;
  return {
    ingresosCentavos: numero(r['ingresosCentavos']),
    egresosCentavos: numero(r['egresosCentavos']),
    movimientos: numero(r['movimientos']),
    porMetodo: lista(r['porMetodo']).map((m) => {
      const x = objeto(m) ?? {};
      return {
        metodo: (texto(x['metodo']) || 'efectivo') as MetodoDeCaja,
        centavos: numero(x['centavos']),
        movimientos: numero(x['movimientos']),
      };
    }),
    porClase: lista(r['porClase']).map((c) => {
      const x = objeto(c) ?? {};
      return {
        clase: (texto(x['clase']) || 'ingreso') as ClaseDeMovimiento,
        movimientos: numero(x['movimientos']),
        centavos: numero(x['centavos']),
      };
    }),
    porUsuario: lista(r['porUsuario']).map((u) => {
      const x = objeto(u) ?? {};
      return {
        usuario: texto(x['usuario']),
        centavos: numero(x['centavos']),
        movimientos: numero(x['movimientos']),
      };
    }),
    cortes: lista(r['cortes']).map((c) => {
      const x = objeto(c) ?? {};
      return {
        id: texto(x['id']),
        nombre: texto(x['nombre']),
        cerradaEn: opcional(x['cerradaEn']),
        esperadoCentavos: numeroONulo(x['esperadoCentavos']),
        contadoCentavos: numeroONulo(x['contadoCentavos']),
        diferenciaCentavos: numeroONulo(x['diferenciaCentavos']),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function llaveDeLaCaja(negocio: string): string {
  return `caja:actual:${negocio}`;
}

export async function traerCajaAbierta(negocio: string): Promise<CajaAbierta | null> {
  const { data, error } = await supabase().rpc('caja_actual', { p_negocio: negocio });
  reventar(error, 'cargar la caja');
  return ordenarCaja(data);
}

export function llaveDelResumenDeCaja(sesionId: string): string {
  return `caja:resumen:${sesionId}`;
}

export async function traerResumenDeCaja(sesionId: string): Promise<ResumenDeCaja> {
  const { data, error } = await supabase().rpc('resumen_de_caja', { p_sesion: sesionId });
  reventar(error, 'cargar el resumen de la caja');
  return ordenarResumenDeCaja(data);
}

export function llaveDeMovimientos(
  negocio: string,
  sesionId: string,
  filtros: FiltrosDeMovimientos,
  pagina: number,
  porPagina: number,
): string {
  return [
    'caja:movimientos', negocio, sesionId,
    filtros.busqueda ?? '', filtros.clase ?? '', filtros.metodo ?? '',
    filtros.usuarioId ?? '', filtros.desde ?? '', filtros.hasta ?? '',
    pagina, porPagina,
  ].join(':');
}

export async function traerMovimientos(
  negocio: string,
  sesionId: string,
  filtros: FiltrosDeMovimientos,
  pagina: number,
  porPagina: number,
): Promise<PaginaDeMovimientos> {
  const { data, error } = await supabase().rpc('movimientos_de_caja', {
    p_negocio: negocio,
    p_sesion: sesionId || null,
    p_desde: filtros.desde ? aBase(filtros.desde) : null,
    p_hasta: filtros.hasta ? aBase(filtros.hasta) : null,
    p_busqueda: filtros.busqueda?.trim() || null,
    p_clase: filtros.clase || null,
    p_metodo: filtros.metodo || null,
    p_usuario: filtros.usuarioId || null,
    p_pagina: pagina,
    p_por_pagina: porPagina,
  });
  reventar(error, 'cargar los movimientos');
  const r = objeto(data) ?? {};
  return { total: numero(r['total']), filas: lista(r['filas']).map(ordenarMovimiento) };
}

export function llaveDelHistorialDeCajas(negocio: string, pagina: number): string {
  return `caja:historial:${negocio}:${pagina}`;
}

export async function traerHistorialDeCajas(
  negocio: string,
  pagina: number,
  porPagina = 10,
): Promise<PaginaDeCajas> {
  const { data, error } = await supabase().rpc('historial_de_cajas', {
    p_negocio: negocio,
    p_pagina: pagina,
    p_por_pagina: porPagina,
  });
  reventar(error, 'cargar el historial de cajas');
  const r = objeto(data) ?? {};
  return { total: numero(r['total']), filas: lista(r['filas']).map(ordenarCajaDelHistorial) };
}

export function llaveDelReporteDeCaja(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
  sesionId: string,
  metodo: string,
): string {
  return `caja:reporte:${negocio}:${desde}:${hasta}:${sesionId}:${metodo}`;
}

export async function traerReporteDeCaja(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
  sesionId: string,
  metodo: string,
): Promise<ReporteDeCaja> {
  const { data, error } = await supabase().rpc('reporte_de_caja', {
    p_negocio: negocio,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
    p_sesion: sesionId || null,
    p_usuario: null,
    p_metodo: metodo || null,
  });
  reventar(error, 'cargar el reporte de caja');
  return ordenarReporteDeCaja(data);
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

export interface LoQueAbreUnaCaja {
  readonly nombre: string;
  readonly saldoInicialCentavos: number;
  readonly observaciones: string;
}

export async function abrirCaja(negocio: string, datos: LoQueAbreUnaCaja): Promise<void> {
  const { error } = await supabase().rpc('abrir_caja', {
    p_negocio: negocio,
    p_nombre: datos.nombre.trim(),
    p_saldo_inicial: datos.saldoInicialCentavos,
    p_observaciones: datos.observaciones.trim() || null,
  });
  reventar(error, 'abrir la caja');
}

export async function cerrarCaja(
  sesionId: string,
  contadoCentavos: number,
  notas: string,
): Promise<void> {
  const { error } = await supabase().rpc('cerrar_caja', {
    p_sesion: sesionId,
    p_contado: contadoCentavos,
    p_notas: notas.trim() || null,
  });
  reventar(error, 'cerrar la caja');
}

export interface LoQueSeMueve {
  readonly tipo: 'ingreso' | 'egreso';
  readonly montoCentavos: number;
  readonly concepto: string;
  readonly metodo: MetodoDeCaja;
  readonly categoria: string;
  readonly notas: string;
}

export async function registrarMovimiento(
  negocio: string,
  m: LoQueSeMueve,
): Promise<void> {
  const { error } = await supabase().rpc('registrar_movimiento_de_caja', {
    p_negocio: negocio,
    p_tipo: m.tipo,
    p_monto: m.montoCentavos,
    p_concepto: m.concepto.trim(),
    p_metodo: m.metodo,
    p_categoria: m.categoria.trim() || null,
    p_notas: m.notas.trim() || null,
  });
  reventar(error, m.tipo === 'ingreso' ? 'registrar el ingreso' : 'registrar el retiro');
}

/**
 * Todo lo que hay que refrescar al mover la caja.
 *
 * Ventas entra en la lista porque una caja cerrada bloquea el cobro en
 * efectivo: si no se refrescara, el punto de venta seguiria creyendo que
 * puede cobrar y el rechazo llegaria con el cliente enfrente.
 */
export const LO_QUE_TOCA_LA_CAJA = ['caja', 'ventas', 'gastos', PREFIJO_DE_INICIO] as const;
