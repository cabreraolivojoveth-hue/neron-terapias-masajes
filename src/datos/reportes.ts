/**
 * EL ACCESO A DATOS DE REPORTES.
 *
 * REPORTES NO ES DUEÑO DE NI UN DATO. No hay tabla de reportes, no hay copia de
 * las ventas, no hay totales guardados. Todo se cuenta en el momento desde las
 * tablas de cada modulo — venta, venta_item, pago, gasto, movimiento_caja,
 * cliente, cita, producto, curso e inscripcion— y por eso una venta cancelada
 * hace cinco minutos ya no suma aqui.
 *
 * TODO SE CALCULA EN EL SERVIDOR Y EN UNA SOLA LLAMADA.
 *
 * Bajar mil ventas al navegador para sumarlas seria lento hoy e imposible en dos
 * años. Y una llamada por pestaña —que era la otra opcion— habria dejado que una
 * seccion se quedara con el periodo viejo mientras las demas ya cambiaron: la
 * pantalla se contradiria a si misma sin avisar. Con una sola llamada, las ocho
 * pestañas hablan por construccion del mismo periodo y los mismos filtros.
 *
 * LOS PERMISOS NO SE COMPRUEBAN AQUI. La funcion de la base corre con los
 * permisos de quien llama (`security invoker`), asi que las reglas de acceso por
 * fila deciden: un centro no ve los datos de otro, y quien no tiene
 * `verFinanzas` no obtiene cifras aunque llame a mano desde la consola.
 * Esconder la pantalla es cortesia; la regla de fila es la seguridad.
 */

import type { Fecha } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, deBase, reventar } from './fechas-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

export type PasoDeLaSerie = 'dia' | 'mes';

export interface PeriodoDelReporte {
  readonly desde: Fecha;
  readonly hasta: Fecha;
  readonly dias: number;
  readonly desdeAnterior: Fecha;
  readonly hastaAnterior: Fecha;
  readonly paso: PasoDeLaSerie;
}

export interface MetricasDelReporte {
  readonly ingresos: number;
  readonly ingresosAntes: number;
  readonly ventas: number;
  readonly ventasAntes: number;
  readonly clientes: number;
  readonly clientesAntes: number;
  readonly servicios: number;
  readonly serviciosAntes: number;
}

export interface FinanzasDelReporte {
  readonly ingresos: number;
  readonly egresos: number;
  readonly utilidad: number;
  /** `null` sin ingresos: no se divide entre cero. */
  readonly margen: number | null;
  readonly promedioDiario: number;
  readonly clientesNuevos: number;
  readonly serviciosRealizados: number;
  readonly cursosVendidos: number;
}

export interface PuntoDeLaSerie {
  readonly punto: Fecha;
  readonly ingresos: number;
  readonly egresos: number;
}

export interface CategoriaDeIngreso {
  /** `servicio`, `producto` o `curso`: los tipos que de verdad se vendieron. */
  readonly clave: string;
  readonly monto: number;
  readonly cuantos: number;
}

export interface PorMetodoDePago {
  readonly metodo: string;
  readonly monto: number;
  readonly operaciones: number;
}

export interface VentasDelReporte {
  readonly cobradas: number;
  readonly canceladas: number;
  /** `null` sin ventas: "$0 de ticket" se leeria como que se regalo. */
  readonly ticket: number | null;
  readonly maxima: number | null;
  readonly minima: number | null;
  readonly porMetodo: readonly PorMetodoDePago[];
}

export interface EnElRanking {
  readonly id: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly ingresos: number;
}

export interface ServiciosDelReporte {
  readonly realizados: number;
  readonly ingresos: number;
  readonly ranking: readonly EnElRanking[];
}

export interface ClienteDelRanking {
  readonly id: string;
  readonly nombre: string;
  readonly visitas: number;
  readonly compras: number;
  readonly gastado: number;
}

export interface ClientesDelReporte {
  readonly totales: number;
  readonly nuevos: number;
  readonly atendidos: number;
  readonly recurrentes: number;
  readonly ranking: readonly ClienteDelRanking[];
}

export interface ProductosDelReporte {
  readonly unidades: number;
  readonly ingresos: number;
  readonly bajos: number;
  readonly agotados: number;
  readonly ranking: readonly EnElRanking[];
}

export interface CursoDelRanking extends EnElRanking {
  readonly inscritos: number;
  /** `null` = el curso no tiene cupo: no se inventa una ocupacion. */
  readonly cupo: number | null;
}

export interface CursosDelReporte {
  readonly vendidos: number;
  readonly ingresos: number;
  readonly inscritos: number;
  readonly proximos: number;
  readonly terminados: number;
  readonly ranking: readonly CursoDelRanking[];
}

export interface CategoriaDeGasto {
  readonly categoria: string;
  readonly monto: number;
  readonly cuantos: number;
}

export interface GastosDelReporte {
  readonly total: number;
  readonly cuantos: number;
  readonly promedio: number | null;
  readonly mayor: number | null;
  readonly menor: number | null;
  readonly categorias: readonly CategoriaDeGasto[];
}

export interface CorteDelPeriodo {
  readonly id: string;
  readonly nombre: string;
  readonly cerradaEn: string;
  readonly saldoInicial: number;
  readonly esperado: number | null;
  readonly contado: number | null;
  readonly diferencia: number | null;
}

export interface CajaDelReporte {
  readonly ventas: number;
  readonly ingresosManuales: number;
  readonly retiros: number;
  readonly gastosDeCaja: number;
  readonly movimientos: number;
  readonly cortes: readonly CorteDelPeriodo[];
  readonly descuadre: number;
}

export interface Reporte {
  readonly periodo: PeriodoDelReporte;
  /**
   * Si hubo actividad ANTES del periodo. Sin ella no se compara: un "+100%"
   * contra la nada es el numero mas facil de creerse y el mas falso.
   */
  readonly hayComparacion: boolean;
  readonly metricas: MetricasDelReporte;
  readonly finanzas: FinanzasDelReporte;
  readonly serie: readonly PuntoDeLaSerie[];
  readonly categorias: readonly CategoriaDeIngreso[];
  readonly ventas: VentasDelReporte;
  readonly servicios: ServiciosDelReporte;
  readonly clientes: ClientesDelReporte;
  readonly productos: ProductosDelReporte;
  readonly cursos: CursosDelReporte;
  readonly gastos: GastosDelReporte;
  readonly caja: CajaDelReporte;
}

export interface FiltrosDelReporte {
  /** `servicio`, `producto` o `curso`. Vacio = sin filtrar. */
  readonly tipo: string;
  readonly metodo: string;
  readonly vendedorId: string;
}

export const SIN_FILTROS: FiltrosDelReporte = { tipo: '', metodo: '', vendedorId: '' };

export interface ReporteGuardado {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: string;
  readonly desde: Fecha;
  readonly hasta: Fecha;
  readonly filtros: FiltrosDelReporte;
  readonly creadoEn: string;
  readonly creadoPor: string | null;
}

/* ------------------------------------------------------------------ */
/* Ordenar lo que contesta el servidor                                 */
/* ------------------------------------------------------------------ */

const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const opcionalNumero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Una fecha de la base, ya en el formato del producto. Vacia si no llega. */
const fecha = (v: unknown): Fecha => (v ? deBase(String(v).slice(0, 10)) : ('' as Fecha));

export function ordenarReporte(crudo: unknown): Reporte {
  const r = objeto(crudo);
  const p = objeto(r['periodo']);
  const m = objeto(r['metricas']);
  const f = objeto(r['finanzas']);
  const ve = objeto(r['ventas']);
  const se = objeto(r['servicios']);
  const cl = objeto(r['clientes']);
  const pr = objeto(r['productos']);
  const cu = objeto(r['cursos']);
  const ga = objeto(r['gastos']);
  const ca = objeto(r['caja']);

  const enRanking = (v: unknown): EnElRanking[] =>
    lista(v).map((x) => {
      const y = objeto(x);
      return {
        id: texto(y['id']),
        nombre: texto(y['nombre']),
        cantidad: numero(y['cantidad']),
        ingresos: numero(y['ingresos']),
      };
    });

  return {
    periodo: {
      desde: fecha(p['desde']),
      hasta: fecha(p['hasta']),
      dias: numero(p['dias']),
      desdeAnterior: fecha(p['desdeAnterior']),
      hastaAnterior: fecha(p['hastaAnterior']),
      paso: p['paso'] === 'mes' ? 'mes' : 'dia',
    },
    hayComparacion: r['hayComparacion'] === true,
    metricas: {
      ingresos: numero(m['ingresos']),
      ingresosAntes: numero(m['ingresosAntes']),
      ventas: numero(m['ventas']),
      ventasAntes: numero(m['ventasAntes']),
      clientes: numero(m['clientes']),
      clientesAntes: numero(m['clientesAntes']),
      servicios: numero(m['servicios']),
      serviciosAntes: numero(m['serviciosAntes']),
    },
    finanzas: {
      ingresos: numero(f['ingresos']),
      egresos: numero(f['egresos']),
      utilidad: numero(f['utilidad']),
      margen: opcionalNumero(f['margen']),
      promedioDiario: numero(f['promedioDiario']),
      clientesNuevos: numero(f['clientesNuevos']),
      serviciosRealizados: numero(f['serviciosRealizados']),
      cursosVendidos: numero(f['cursosVendidos']),
    },
    serie: lista(r['serie']).map((x) => {
      const y = objeto(x);
      return {
        punto: fecha(y['punto']),
        ingresos: numero(y['ingresos']),
        egresos: numero(y['egresos']),
      };
    }),
    categorias: lista(r['categorias']).map((x) => {
      const y = objeto(x);
      return {
        clave: texto(y['clave']),
        monto: numero(y['monto']),
        cuantos: numero(y['cuantos']),
      };
    }),
    ventas: {
      cobradas: numero(ve['cobradas']),
      canceladas: numero(ve['canceladas']),
      ticket: opcionalNumero(ve['ticket']),
      maxima: opcionalNumero(ve['maxima']),
      minima: opcionalNumero(ve['minima']),
      porMetodo: lista(ve['porMetodo']).map((x) => {
        const y = objeto(x);
        return {
          metodo: texto(y['metodo']),
          monto: numero(y['monto']),
          operaciones: numero(y['operaciones']),
        };
      }),
    },
    servicios: {
      realizados: numero(se['realizados']),
      ingresos: numero(se['ingresos']),
      ranking: enRanking(se['ranking']),
    },
    clientes: {
      totales: numero(cl['totales']),
      nuevos: numero(cl['nuevos']),
      atendidos: numero(cl['atendidos']),
      recurrentes: numero(cl['recurrentes']),
      ranking: lista(cl['ranking']).map((x) => {
        const y = objeto(x);
        return {
          id: texto(y['id']),
          nombre: texto(y['nombre']),
          visitas: numero(y['visitas']),
          compras: numero(y['compras']),
          gastado: numero(y['gastado']),
        };
      }),
    },
    productos: {
      unidades: numero(pr['unidades']),
      ingresos: numero(pr['ingresos']),
      bajos: numero(pr['bajos']),
      agotados: numero(pr['agotados']),
      ranking: enRanking(pr['ranking']),
    },
    cursos: {
      vendidos: numero(cu['vendidos']),
      ingresos: numero(cu['ingresos']),
      inscritos: numero(cu['inscritos']),
      proximos: numero(cu['proximos']),
      terminados: numero(cu['terminados']),
      ranking: lista(cu['ranking']).map((x) => {
        const y = objeto(x);
        return {
          id: texto(y['id']),
          nombre: texto(y['nombre']),
          cantidad: numero(y['cantidad']),
          ingresos: numero(y['ingresos']),
          inscritos: numero(y['inscritos']),
          cupo: opcionalNumero(y['cupo']),
        };
      }),
    },
    gastos: {
      total: numero(ga['total']),
      cuantos: numero(ga['cuantos']),
      promedio: opcionalNumero(ga['promedio']),
      mayor: opcionalNumero(ga['mayor']),
      menor: opcionalNumero(ga['menor']),
      categorias: lista(ga['categorias']).map((x) => {
        const y = objeto(x);
        return {
          categoria: texto(y['categoria']),
          monto: numero(y['monto']),
          cuantos: numero(y['cuantos']),
        };
      }),
    },
    caja: {
      ventas: numero(ca['ventas']),
      ingresosManuales: numero(ca['ingresosManuales']),
      retiros: numero(ca['retiros']),
      gastosDeCaja: numero(ca['gastosDeCaja']),
      movimientos: numero(ca['movimientos']),
      descuadre: numero(ca['descuadre']),
      cortes: lista(ca['cortes']).map((x) => {
        const y = objeto(x);
        return {
          id: texto(y['id']),
          nombre: texto(y['nombre']),
          cerradaEn: texto(y['cerradaEn']),
          saldoInicial: numero(y['saldoInicial']),
          esperado: opcionalNumero(y['esperado']),
          contado: opcionalNumero(y['contado']),
          diferencia: opcionalNumero(y['diferencia']),
        };
      }),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Lo que se le pide al servidor                                       */
/* ------------------------------------------------------------------ */

/**
 * La llave de cache lleva TODO lo que cambia el resultado.
 *
 * Si faltara el filtro, cambiarlo devolveria el reporte anterior desde la cache
 * — con los numeros de otro filtro y sin avisar de nada.
 */
export function llaveDelReporte(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
  f: FiltrosDelReporte,
): string {
  return `reportes:${negocio}:${desde}:${hasta}:${f.tipo}:${f.metodo}:${f.vendedorId}`;
}

export async function traerReporte(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
  f: FiltrosDelReporte,
): Promise<Reporte> {
  const { data, error } = await supabase().rpc('reporte_del_periodo', {
    p_negocio: negocio,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
    p_tipo: f.tipo || null,
    p_metodo: f.metodo || null,
    p_vendedor: f.vendedorId || null,
  });
  reventar(error, 'cargar el reporte');
  return ordenarReporte(data);
}

export function llaveDeReportesGuardados(negocio: string): string {
  return `reportes:guardados:${negocio}`;
}

export async function traerReportesGuardados(negocio: string): Promise<ReporteGuardado[]> {
  const { data, error } = await supabase().rpc('reportes_guardados', { p_negocio: negocio });
  reventar(error, 'cargar los reportes guardados');
  return lista(data).map((x) => {
    const y = objeto(x);
    const fl = objeto(y['filtros']);
    return {
      id: texto(y['id']),
      nombre: texto(y['nombre']),
      tipo: texto(y['tipo']) || 'resumen',
      desde: fecha(y['desde']),
      hasta: fecha(y['hasta']),
      filtros: {
        tipo: texto(fl['tipo']),
        metodo: texto(fl['metodo']),
        vendedorId: texto(fl['vendedorId']),
      },
      creadoEn: texto(y['creadoEn']),
      creadoPor: y['creadoPor'] ? texto(y['creadoPor']) : null,
    };
  });
}

export async function guardarReporte(
  negocio: string,
  nombre: string,
  tipo: string,
  desde: Fecha,
  hasta: Fecha,
  filtros: FiltrosDelReporte,
): Promise<void> {
  const { error } = await supabase().rpc('guardar_reporte', {
    p_negocio: negocio,
    p_nombre: nombre,
    p_tipo: tipo,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
    p_filtros: filtros,
  });
  reventar(error, 'guardar el reporte');
}

export async function borrarReporte(reporteId: string): Promise<void> {
  const { error } = await supabase().rpc('borrar_reporte', { p_reporte: reporteId });
  reventar(error, 'borrar el reporte');
}

/**
 * TODO lo que toca un reporte guardado.
 *
 * Guardar o borrar uno solo cambia la lista de guardados — no las cifras, que se
 * vuelven a contar solas. Pero el prefijo de Inicio va igual: la guardia 11 lo
 * exige de TODA operacion, y tiene razon en no dejar decidir caso por caso.
 */
export const LO_QUE_TOCA_UN_REPORTE = ['reportes', PREFIJO_DE_INICIO] as const;
