/**
 * EL ACCESO A DATOS DE GASTOS.
 *
 * GASTOS NO ES DUEÑO DEL DINERO QUE SALE DEL CAJON. Registra la obligacion
 * —cuanto se debe, a quien, de que— y un disparador de la base mueve la caja
 * si hubo efectivo. Aqui no se escribe ni un movimiento de caja a mano: si se
 * pudiera, el dia que alguien capturara uno suelto la caja dejaria de cuadrar
 * con los gastos y nadie sabria cual de los dos numeros creer.
 *
 * LA DISTINCION QUE MANDA, la misma que en Caja:
 *
 *   EGRESO DEL NEGOCIO    todo gasto, con la forma de pago que sea.
 *   EFECTIVO QUE SALIO    solo la parte que se pago en efectivo.
 *
 * La renta pagada por transferencia son diez mil pesos de egreso y CERO
 * efectivo. Sumarlas juntas hace que al cerrar el dia falte justo la renta, y
 * quien cuenta los billetes no sabe si es un faltante de verdad.
 *
 * EL MONTO EN EFECTIVO LO DECIDE LA BASE, no esta capa. `registrar_gasto`
 * recibe el metodo y el total, y calcula cuanto de eso sale del cajon.
 * Dejarlo aqui seria dejar que el navegador decida cuanto dinero falta.
 *
 * TODO EN CENTAVOS ENTEROS. Los pesos con decimales en punto flotante hacen
 * que 0.1 + 0.2 no sea 0.3, y en dinero eso se acumula hasta que un corte no
 * cuadra por unos centavos que nadie encuentra.
 */

import type { Fecha } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, deBase, reventar } from './fechas-de-la-base.js';
import { centavos } from './lo-que-llega-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

export type MetodoDeGasto = 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

export const METODOS_DE_GASTO: readonly MetodoDeGasto[] = [
  'efectivo',
  'tarjeta',
  'transferencia',
  'mixto',
];

export const COMO_SE_DICE_EL_METODO: Readonly<Record<MetodoDeGasto, string>> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

export type Frecuencia =
  | 'unico'
  | 'diario'
  | 'semanal'
  | 'quincenal'
  | 'mensual'
  | 'bimestral'
  | 'trimestral'
  | 'semestral'
  | 'anual';

/**
 * "Unico" NO viaja a la base.
 *
 * Un gasto suelto es simplemente un gasto sin plantilla detras: `frecuencia`
 * es de la plantilla, no del gasto. Guardar "unico" en cada renglon seria un
 * dato que puede contradecir al que ya dice lo mismo —tener o no
 * `recurrente_id`— y esos dos son los que acaban discrepando.
 */
export const FRECUENCIAS_RECURRENTES: readonly Exclude<Frecuencia, 'unico'>[] = [
  'diario',
  'semanal',
  'quincenal',
  'mensual',
  'bimestral',
  'trimestral',
  'semestral',
  'anual',
];

export const COMO_SE_DICE_LA_FRECUENCIA: Readonly<Record<Frecuencia, string>> = {
  unico: 'Único',
  diario: 'Diario',
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export type EstadoDeRecurrente = 'activo' | 'pausado' | 'finalizado';

export const COMO_SE_DICE_EL_ESTADO: Readonly<Record<EstadoDeRecurrente, string>> = {
  activo: 'Activo',
  pausado: 'Pausado',
  finalizado: 'Finalizado',
};

export interface GastoEnLista {
  readonly id: string;
  readonly fecha: Fecha;
  /** El concepto corto. En la base se llama `descripcion` desde el bloque 6. */
  readonly concepto: string;
  readonly detalle: string | null;
  readonly montoCentavos: number;
  readonly metodo: MetodoDeGasto;
  /** Cuanto de este gasto salio del cajon. Cero si no fue en efectivo. */
  readonly efectivoCentavos: number;
  readonly metodoResto: MetodoDeGasto | null;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly categoriaColor: string | null;
  readonly proveedorId: string | null;
  readonly proveedor: string | null;
  readonly referencia: string | null;
  readonly notas: string | null;
  readonly recurrenteId: string | null;
  readonly frecuencia: Frecuencia;
  readonly usuario: string | null;
  readonly creadoEn: string;
  readonly anulado: boolean;
  readonly anuladoMotivo: string | null;
  /** A que gasto corrige. Editar no pisa: encadena. */
  readonly sustituyeA: string | null;
}

export interface CategoriaConGasto {
  readonly id: string | null;
  readonly nombre: string;
  readonly color: string | null;
  readonly centavos: number;
  readonly cuantos: number;
}

export interface MetodoConGasto {
  readonly metodo: MetodoDeGasto;
  readonly centavos: number;
  readonly cuantos: number;
}

export interface DiaConGasto {
  readonly fecha: Fecha;
  readonly centavos: number;
}

export interface ResumenDeGastos {
  readonly totalCentavos: number;
  readonly cuantos: number;
  readonly dias: number;
  readonly promedioDiarioCentavos: number;
  readonly mayor: { readonly concepto: string; readonly centavos: number } | null;
  readonly anteriorCentavos: number;
  /** `false` = no hubo nada antes. NO se inventa un porcentaje contra cero. */
  readonly hayComparacion: boolean;
  readonly porCategoria: readonly CategoriaConGasto[];
  readonly porMetodo: readonly MetodoConGasto[];
  readonly porDia: readonly DiaConGasto[];
  readonly efectivoCentavos: number;
}

export interface GastoRecurrente {
  readonly id: string;
  readonly concepto: string;
  readonly detalle: string | null;
  readonly montoCentavos: number;
  readonly metodo: MetodoDeGasto;
  readonly efectivoCentavos: number;
  readonly metodoResto: MetodoDeGasto | null;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly categoriaColor: string | null;
  readonly proveedorId: string | null;
  readonly proveedor: string | null;
  readonly frecuencia: Exclude<Frecuencia, 'unico'>;
  readonly fechaInicio: Fecha;
  readonly proximaFecha: Fecha;
  readonly fechaFin: Fecha | null;
  readonly estado: EstadoDeRecurrente;
  readonly notas: string | null;
  /** Cuantos gastos ha producido ya. Se cuenta, no se guarda. */
  readonly generados: number;
}

/* ------------------------------------------------------------------ */
/* Lo que se manda al guardar                                          */
/* ------------------------------------------------------------------ */

export interface DatosDeGasto {
  readonly concepto: string;
  readonly detalle: string;
  readonly montoCentavos: number;
  readonly metodo: MetodoDeGasto;
  /** Solo para el mixto: cuanto de ese total se pago en efectivo. */
  readonly efectivoCentavos: number;
  readonly metodoResto: MetodoDeGasto | null;
  readonly fecha: Fecha;
  readonly categoriaId: string;
  readonly proveedorId: string;
  readonly referencia: string;
  readonly notas: string;
}

export const GASTO_VACIO: DatosDeGasto = {
  concepto: '',
  detalle: '',
  montoCentavos: 0,
  metodo: 'efectivo',
  efectivoCentavos: 0,
  metodoResto: null,
  fecha: '',
  categoriaId: '',
  proveedorId: '',
  referencia: '',
  notas: '',
};

export interface DatosDeRecurrente {
  readonly concepto: string;
  readonly detalle: string;
  readonly montoCentavos: number;
  readonly metodo: MetodoDeGasto;
  readonly efectivoCentavos: number;
  readonly metodoResto: MetodoDeGasto | null;
  readonly frecuencia: Exclude<Frecuencia, 'unico'>;
  readonly fechaInicio: Fecha;
  readonly fechaFin: Fecha | null;
  readonly categoriaId: string;
  readonly proveedorId: string;
  readonly notas: string;
}

/* ------------------------------------------------------------------ */
/* Las validaciones, aqui y tambien en la base                         */
/* ------------------------------------------------------------------ */

/**
 * Que le falta a un gasto para poder guardarse.
 *
 * DEVUELVE UN ERROR POR CAMPO, no un mensaje suelto: "Revisa los datos" hace
 * que la persona los mire todos buscando cual esta mal.
 *
 * Esto NO es la defensa. `registrar_gasto` valida lo mismo en el servidor y
 * las restricciones de la tabla lo vuelven a comprobar. Aqui se valida para
 * decirlo bien y a tiempo; alli para que sea verdad.
 */
export function loQueFaltaDelGasto(d: DatosDeGasto): Readonly<Record<string, string>> {
  const falta: Record<string, string> = {};

  if (d.concepto.trim() === '') falta['concepto'] = 'Escribe de qué es el gasto.';
  if (!Number.isFinite(d.montoCentavos) || d.montoCentavos <= 0) {
    falta['monto'] = 'El monto tiene que ser mayor que cero.';
  }
  if (d.categoriaId === '') falta['categoria'] = 'Escoge una categoría.';
  if (d.fecha === '') falta['fecha'] = 'Escoge la fecha del gasto.';

  if (d.metodo === 'mixto') {
    if (d.efectivoCentavos <= 0) {
      falta['efectivo'] = 'Di cuánto se pagó en efectivo.';
    } else if (d.efectivoCentavos >= d.montoCentavos) {
      // Si el efectivo es TODO, no es mixto: es efectivo. Decirlo asi evita
      // que alguien guarde un "mixto" que la base va a rechazar.
      falta['efectivo'] = 'En un pago mixto el efectivo tiene que ser menos que el total.';
    }
    if (d.metodoResto === null) falta['metodoResto'] = 'Di con qué se pagó el resto.';
  }

  return falta;
}

/** Cuanto de este gasto sale del cajon. La base calcula lo mismo. */
export function efectivoQueSale(d: DatosDeGasto): number {
  if (d.metodo === 'efectivo') return d.montoCentavos;
  if (d.metodo === 'mixto') return d.efectivoCentavos;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Las llaves del cache                                                */
/* ------------------------------------------------------------------ */

export function llaveDeGastos(negocio: string, desde: Fecha, hasta: Fecha): string {
  return `gastos:lista:${negocio}:${desde}:${hasta}`;
}

export function llaveDelResumenDeGastos(negocio: string, desde: Fecha, hasta: Fecha): string {
  return `gastos:resumen:${negocio}:${desde}:${hasta}`;
}

export function llaveDeRecurrentes(negocio: string): string {
  return `gastos:recurrentes:${negocio}`;
}

/* ------------------------------------------------------------------ */
/* Traer                                                               */
/* ------------------------------------------------------------------ */

interface FilaDeGasto {
  id: string;
  fecha: string;
  descripcion: string;
  detalle: string | null;
  monto_centavos: number;
  metodo: string;
  efectivo_centavos: number;
  metodo_resto: string | null;
  categoria_id: string | null;
  categoria: string | null;
  categoria_color: string | null;
  proveedor_id: string | null;
  proveedor: string | null;
  referencia: string | null;
  notas: string | null;
  recurrente_id: string | null;
  frecuencia: string | null;
  usuario: string | null;
  creado_en: string;
  eliminado: boolean;
  anulado_motivo: string | null;
  sustituye_a: string | null;
}

function ordenarGasto(f: FilaDeGasto): GastoEnLista {
  return {
    id: f.id,
    fecha: deBase(f.fecha),
    concepto: f.descripcion,
    detalle: f.detalle,
    montoCentavos: centavos(f.monto_centavos),
    metodo: (f.metodo as MetodoDeGasto) ?? 'efectivo',
    efectivoCentavos: centavos(f.efectivo_centavos ?? 0),
    metodoResto: (f.metodo_resto as MetodoDeGasto | null) ?? null,
    categoriaId: f.categoria_id,
    categoria: f.categoria,
    categoriaColor: f.categoria_color,
    proveedorId: f.proveedor_id,
    proveedor: f.proveedor,
    referencia: f.referencia,
    notas: f.notas,
    recurrenteId: f.recurrente_id,
    // Sin plantilla detras, el gasto es unico. No se guarda: se deduce.
    frecuencia: (f.frecuencia as Frecuencia | null) ?? 'unico',
    usuario: f.usuario,
    creadoEn: f.creado_en,
    anulado: f.eliminado === true,
    anuladoMotivo: f.anulado_motivo,
    sustituyeA: f.sustituye_a,
  };
}

export async function traerGastos(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
  incluirAnulados = false,
): Promise<GastoEnLista[]> {
  const { data, error } = await supabase().rpc('gastos_del_rango', {
    p_negocio: negocio,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
    p_incluir_anulados: incluirAnulados,
  });
  reventar(error, 'traer los gastos');
  return ((data ?? []) as FilaDeGasto[]).map(ordenarGasto);
}

export async function traerResumenDeGastos(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
): Promise<ResumenDeGastos> {
  const { data, error } = await supabase().rpc('resumen_de_gastos', {
    p_negocio: negocio,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
  });
  reventar(error, 'traer el resumen de gastos');

  const r = (data ?? {}) as Record<string, unknown>;
  const mayor = r['mayor'] as { descripcion?: string; centavos?: number } | null | undefined;

  return {
    totalCentavos: centavos(r['totalCentavos'] ?? 0),
    cuantos: Number(r['cuantos'] ?? 0),
    dias: Number(r['dias'] ?? 1),
    promedioDiarioCentavos: centavos(r['promedioDiarioCentavos'] ?? 0),
    mayor:
      mayor && mayor.descripcion
        ? { concepto: mayor.descripcion, centavos: centavos(mayor.centavos ?? 0) }
        : null,
    anteriorCentavos: centavos(r['anteriorCentavos'] ?? 0),
    hayComparacion: r['hayComparacion'] === true,
    porCategoria: ((r['porCategoria'] ?? []) as Record<string, unknown>[]).map((c) => ({
      id: (c['id'] as string | null) ?? null,
      nombre: String(c['nombre'] ?? 'Sin categoría'),
      color: (c['color'] as string | null) ?? null,
      centavos: centavos(c['centavos'] ?? 0),
      cuantos: Number(c['cuantos'] ?? 0),
    })),
    porMetodo: ((r['porMetodo'] ?? []) as Record<string, unknown>[]).map((m) => ({
      metodo: (m['metodo'] as MetodoDeGasto) ?? 'efectivo',
      centavos: centavos(m['centavos'] ?? 0),
      cuantos: Number(m['cuantos'] ?? 0),
    })),
    porDia: ((r['porDia'] ?? []) as Record<string, unknown>[]).map((d) => ({
      fecha: deBase(d['fecha']),
      centavos: centavos(d['centavos'] ?? 0),
    })),
    efectivoCentavos: centavos(r['efectivoCentavos'] ?? 0),
  };
}

interface FilaDeRecurrente {
  id: string;
  descripcion: string;
  detalle: string | null;
  monto_centavos: number;
  metodo: string;
  efectivo_centavos: number;
  metodo_resto: string | null;
  categoria_id: string | null;
  categoria: string | null;
  categoria_color: string | null;
  proveedor_id: string | null;
  proveedor: string | null;
  frecuencia: string;
  fecha_inicio: string;
  proxima_fecha: string;
  fecha_fin: string | null;
  estado: string;
  notas: string | null;
  generados: number;
}

export async function traerRecurrentes(negocio: string): Promise<GastoRecurrente[]> {
  const { data, error } = await supabase().rpc('gastos_recurrentes_del_centro', {
    p_negocio: negocio,
  });
  reventar(error, 'traer los gastos recurrentes');

  return ((data ?? []) as FilaDeRecurrente[]).map((f) => ({
    id: f.id,
    concepto: f.descripcion,
    detalle: f.detalle,
    montoCentavos: centavos(f.monto_centavos),
    metodo: (f.metodo as MetodoDeGasto) ?? 'efectivo',
    efectivoCentavos: centavos(f.efectivo_centavos ?? 0),
    metodoResto: (f.metodo_resto as MetodoDeGasto | null) ?? null,
    categoriaId: f.categoria_id,
    categoria: f.categoria,
    categoriaColor: f.categoria_color,
    proveedorId: f.proveedor_id,
    proveedor: f.proveedor,
    frecuencia: f.frecuencia as Exclude<Frecuencia, 'unico'>,
    fechaInicio: deBase(f.fecha_inicio),
    proximaFecha: deBase(f.proxima_fecha),
    fechaFin: f.fecha_fin ? deBase(f.fecha_fin) : null,
    estado: (f.estado as EstadoDeRecurrente) ?? 'activo',
    notas: f.notas,
    generados: Number(f.generados ?? 0),
  }));
}

/* ------------------------------------------------------------------ */
/* Escribir                                                            */
/* ------------------------------------------------------------------ */

export async function registrarGasto(negocio: string, d: DatosDeGasto): Promise<string> {
  const { data, error } = await supabase().rpc('registrar_gasto', {
    p_negocio: negocio,
    p_descripcion: d.concepto.trim(),
    p_monto: d.montoCentavos,
    p_metodo: d.metodo,
    p_fecha: aBase(d.fecha),
    p_categoria: d.categoriaId || null,
    p_proveedor: d.proveedorId || null,
    p_detalle: d.detalle.trim() || null,
    p_referencia: d.referencia.trim() || null,
    p_notas: d.notas.trim() || null,
    // Solo el mixto manda su parte; en los demas la base la calcula sola.
    p_efectivo: d.metodo === 'mixto' ? d.efectivoCentavos : null,
    p_metodo_resto: d.metodo === 'mixto' ? d.metodoResto : null,
  });
  reventar(error, 'registrar el gasto');
  return String(data);
}

/**
 * Editar ANULA Y ENCADENA: no pisa el gasto viejo.
 *
 * La caja es un libro que se escribe y no se corrige, y su indice unico solo
 * deja UN egreso por gasto. Asi que la base anula el viejo —su ingreso
 * contrario entra a caja— y crea uno nuevo que apunta al anterior. El neto
 * queda exactamente como si se hubiera corregido, y ademas se puede
 * reconstruir que se capturo primero.
 *
 * DEVUELVE EL ID NUEVO. Quien tenga abierto el detalle del viejo tiene que
 * seguir al nuevo, o se quedaria mirando un gasto anulado.
 */
export async function editarGasto(gastoId: string, d: DatosDeGasto): Promise<string> {
  const { data, error } = await supabase().rpc('editar_gasto', {
    p_gasto: gastoId,
    p_descripcion: d.concepto.trim(),
    p_monto: d.montoCentavos,
    p_metodo: d.metodo,
    p_fecha: aBase(d.fecha),
    p_categoria: d.categoriaId || null,
    p_proveedor: d.proveedorId || null,
    p_detalle: d.detalle.trim() || null,
    p_referencia: d.referencia.trim() || null,
    p_notas: d.notas.trim() || null,
    p_efectivo: d.metodo === 'mixto' ? d.efectivoCentavos : null,
    p_metodo_resto: d.metodo === 'mixto' ? d.metodoResto : null,
  });
  reventar(error, 'editar el gasto');
  return String(data);
}

export async function anularGasto(gastoId: string, motivo: string): Promise<void> {
  const { error } = await supabase().rpc('anular_gasto', {
    p_gasto: gastoId,
    p_motivo: motivo.trim(),
  });
  reventar(error, 'anular el gasto');
}

export async function guardarRecurrente(
  negocio: string,
  id: string | null,
  d: DatosDeRecurrente,
): Promise<string> {
  const { data, error } = await supabase().rpc('guardar_gasto_recurrente', {
    p_negocio: negocio,
    p_id: id,
    p_descripcion: d.concepto.trim(),
    p_monto: d.montoCentavos,
    p_metodo: d.metodo,
    p_frecuencia: d.frecuencia,
    p_fecha_inicio: aBase(d.fechaInicio),
    p_categoria: d.categoriaId || null,
    p_proveedor: d.proveedorId || null,
    p_detalle: d.detalle.trim() || null,
    p_notas: d.notas.trim() || null,
    p_efectivo: d.metodo === 'mixto' ? d.efectivoCentavos : null,
    p_metodo_resto: d.metodo === 'mixto' ? d.metodoResto : null,
    p_fecha_fin: d.fechaFin ? aBase(d.fechaFin) : null,
  });
  reventar(error, 'guardar el gasto recurrente');
  return String(data);
}

export async function marcarRecurrente(
  id: string,
  estado: EstadoDeRecurrente,
): Promise<void> {
  const { error } = await supabase().rpc('marcar_gasto_recurrente', {
    p_id: id,
    p_estado: estado,
  });
  reventar(error, 'cambiar el estado del gasto recurrente');
}

/**
 * Crea los gastos recurrentes que ya tocaban.
 *
 * SE PUEDE LLAMAR CUANTAS VECES SE QUIERA. La unicidad no la pone esta
 * llamada: la pone un indice unico `(recurrente_id, periodo)` en la base. Dos
 * pestañas abiertas a la vez, o diez, no pueden crear dos veces la renta de
 * agosto — la segunda choca contra el indice y se descarta sola.
 *
 * Por eso se llama al abrir Gastos y no hace falta un proceso aparte. Si un
 * dia se quiere un cron de verdad, la funcion ya esta lista para el: es la
 * misma, y sigue siendo idempotente.
 */
export async function generarRecurrentes(negocio: string): Promise<number> {
  const { data, error } = await supabase().rpc('generar_gastos_recurrentes', {
    p_negocio: negocio,
  });
  reventar(error, 'generar los gastos recurrentes');
  return Number(data ?? 0);
}

/** Cuantos gastos usan esa categoria. Cero = se puede borrar sin romper nada. */
export async function gastosDeLaCategoria(categoriaId: string): Promise<number> {
  const { data, error } = await supabase().rpc('gastos_de_la_categoria', {
    p_categoria: categoriaId,
  });
  reventar(error, 'contar los gastos de la categoría');
  return Number(data ?? 0);
}

/**
 * QUE SE REFRESCA CUANDO ALGO CAMBIA EN GASTOS.
 *
 * `caja` esta en la lista porque un gasto en efectivo mueve el cajon en el
 * mismo instante, e Inicio porque el tablero cuenta los egresos del dia. Sin
 * estos dos prefijos, alguien registra la renta y la caja sigue diciendo el
 * saldo de antes hasta que recargue — y con un numero de caja viejo en
 * pantalla se cuentan mal los billetes.
 */
export const LO_QUE_TOCA_UN_GASTO = ['gastos', 'caja', PREFIJO_DE_INICIO] as const;
