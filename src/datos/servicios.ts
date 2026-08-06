/**
 * EL ACCESO A DATOS DEL CATALOGO DE SERVICIOS.
 *
 * `servicio` es LA FUENTE DE VERDAD de lo que ofrece el centro: nombre,
 * duracion, precio, categoria, color, preparacion. Agenda, Ventas, Clientes y
 * Reportes lo REFERENCIAN por id; ninguno guarda una copia.
 *
 * DOS COSAS QUE SE SEPARAN A PROPOSITO Y QUE CASI SIEMPRE SE CONFUNDEN:
 *
 * 1. EL PRECIO DE HOY vs EL PRECIO QUE SE COBRO. `servicio.precio_centavos`
 *    es el del catalogo AHORA. Lo que se cobro en enero vive en el renglon de
 *    la venta, que guarda su propio precio. Si un reporte de enero leyera el
 *    catalogo de hoy, subir un precio reescribiria la historia.
 *
 * 2. LA DURACION DE HOY vs LA QUE DURO. La cita guarda su hora de inicio y de
 *    fin: esa resta es lo que duro. Cambiar el servicio de 60 a 90 minutos no
 *    alarga las citas del año pasado.
 *
 * Y LA PROMOCION SE RESUELVE EN LA BASE, en `app.precio_efectivo`. Si cada
 * pantalla la resolviera por su cuenta, el dia que cambie la regla habria que
 * corregirla en cuatro lugares y una se quedaria cobrando de mas.
 */

import type { Fecha } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, deBase, reventar } from './fechas-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

export type AmbitoDeCategoria = 'servicio' | 'curso';

export interface Categoria {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly color: string | null;
  readonly activo: boolean;
  /** Cuantos servicios o cursos la usan. Se cuenta, no se guarda. */
  readonly enUso: number;
}

export interface ServicioEnLista {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly categoriaColor: string | null;
  readonly duracionMin: number;
  readonly precioCentavos: number;
  /** Lo que cuesta HOY, con la promocion ya resuelta por la base. */
  readonly precioHoyCentavos: number;
  readonly enPromocion: boolean;
  readonly activo: boolean;
  readonly color: string | null;
}

export interface PaginaDeServicios {
  readonly total: number;
  readonly filas: readonly ServicioEnLista[];
}

export interface ResumenDeServicios {
  readonly total: number;
  readonly activos: number;
  readonly inactivos: number;
  /** `null` cuando no hay ni un servicio activo. Cero minutos seria falso. */
  readonly duracionPromedio: number | null;
}

export interface CambioEnHistorial {
  readonly accion: string;
  readonly quien: string;
  readonly cuando: string;
  readonly antes: Readonly<Record<string, unknown>> | null;
  readonly despues: Readonly<Record<string, unknown>> | null;
}

export interface FichaDeServicio {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly notas: string | null;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly categoriaColor: string | null;
  readonly duracionMin: number;
  readonly precioCentavos: number;
  readonly precioPromocionalCentavos: number | null;
  readonly promocionDesde: Fecha | null;
  readonly promocionHasta: Fecha | null;
  readonly precioHoyCentavos: number;
  readonly color: string | null;
  readonly requierePreparacion: boolean;
  readonly preparacion: string | null;
  readonly diasDisponibles: string | null;
  readonly horaDesde: string | null;
  readonly horaHasta: string | null;
  readonly activo: boolean;
  /** Cuantas citas futuras tiene. Es el impacto de apagarlo. */
  readonly citasFuturas: number;
  readonly citasCompletadas: number;
  readonly historial: readonly CambioEnHistorial[];
}

export interface FiltrosDeServicios {
  readonly busqueda?: string;
  readonly estado?: 'activo' | 'inactivo' | '';
  readonly categoriaId?: string;
}

export interface DatosDeServicio {
  readonly nombre: string;
  readonly descripcion: string;
  readonly categoriaId: string;
  readonly duracionMin: number;
  readonly precioCentavos: number;
  readonly precioPromocionalCentavos: number | null;
  readonly promocionDesde: string;
  readonly promocionHasta: string;
  readonly color: string;
  readonly requierePreparacion: boolean;
  readonly preparacion: string;
  readonly notas: string;
  readonly diasDisponibles: string;
  readonly horaDesde: string;
  readonly horaHasta: string;
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

export const RESUMEN_DE_SERVICIOS_VACIO: ResumenDeServicios = {
  total: 0,
  activos: 0,
  inactivos: 0,
  duracionPromedio: null,
};

export function ordenarResumenDeServicios(crudo: unknown): ResumenDeServicios {
  const r = objeto(crudo);
  if (!r) return RESUMEN_DE_SERVICIOS_VACIO;
  return {
    total: numero(r['total']),
    activos: numero(r['activos']),
    inactivos: numero(r['inactivos']),
    // `null` se CONSERVA: sin servicios activos no hay duracion promedio, y
    // "0 min" seria una respuesta falsa.
    duracionPromedio:
      r['duracionPromedio'] === null || r['duracionPromedio'] === undefined
        ? null
        : numero(r['duracionPromedio']),
  };
}

export function ordenarServicio(crudo: unknown): ServicioEnLista {
  const s = objeto(crudo) ?? {};
  return {
    id: texto(s['id']),
    nombre: texto(s['nombre']),
    descripcion: opcional(s['descripcion']),
    categoriaId: opcional(s['categoriaId']),
    categoria: opcional(s['categoria']),
    categoriaColor: opcional(s['categoriaColor']),
    duracionMin: numero(s['duracionMin']),
    precioCentavos: numero(s['precioCentavos']),
    precioHoyCentavos: numero(s['precioHoyCentavos']),
    enPromocion: Boolean(s['enPromocion']),
    activo: Boolean(s['activo']),
    color: opcional(s['color']),
  };
}

/**
 * El porcentaje que se enseña en las tarjetas.
 *
 * SIN CLIENTES NO HAY PORCENTAJE. Dividir entre cero da `Infinity` o `NaN` y
 * termina impreso como "NaN% del total" en la pantalla de la dueña. Devuelve
 * `null` y quien lo pinta decide que dice en su lugar.
 */
export function porcentajeDe(parte: number, total: number): number | null {
  if (!Number.isFinite(parte) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((parte / total) * 100);
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function llaveDeServicios(
  negocio: string,
  filtros: FiltrosDeServicios,
  pagina: number,
  porPagina: number,
): string {
  return [
    'servicios', negocio,
    filtros.busqueda ?? '', filtros.estado ?? '', filtros.categoriaId ?? '',
    pagina, porPagina,
  ].join(':');
}

export async function traerServiciosDelCentro(
  negocio: string,
  filtros: FiltrosDeServicios,
  pagina: number,
  porPagina: number,
): Promise<PaginaDeServicios> {
  const { data, error } = await supabase().rpc('servicios_del_centro', {
    p_negocio: negocio,
    p_busqueda: filtros.busqueda?.trim() || null,
    p_estado: filtros.estado || null,
    p_categoria: filtros.categoriaId || null,
    p_pagina: pagina,
    p_por_pagina: porPagina,
  });
  reventar(error, 'cargar los servicios');
  const r = objeto(data) ?? {};
  return { total: numero(r['total']), filas: lista(r['filas']).map(ordenarServicio) };
}

export function llaveDelResumenDeServicios(negocio: string): string {
  return `servicios:resumen:${negocio}`;
}

export async function traerResumenDeServicios(negocio: string): Promise<ResumenDeServicios> {
  const { data, error } = await supabase().rpc('resumen_servicios', { p_negocio: negocio });
  reventar(error, 'cargar el resumen de servicios');
  return ordenarResumenDeServicios(data);
}

export function llaveDeLaFicha(servicioId: string): string {
  return `servicios:ficha:${servicioId}`;
}

export async function traerFichaDeServicio(servicioId: string): Promise<FichaDeServicio | null> {
  const { data, error } = await supabase().rpc('ficha_del_servicio', { p_servicio: servicioId });
  reventar(error, 'cargar la ficha del servicio');
  const s = objeto(data);
  if (!s) return null;

  return {
    id: texto(s['id']),
    nombre: texto(s['nombre']),
    descripcion: opcional(s['descripcion']),
    notas: opcional(s['notas']),
    categoriaId: opcional(s['categoriaId']),
    categoria: opcional(s['categoria']),
    categoriaColor: opcional(s['categoriaColor']),
    duracionMin: numero(s['duracionMin']),
    precioCentavos: numero(s['precioCentavos']),
    precioPromocionalCentavos:
      s['precioPromocionalCentavos'] === null || s['precioPromocionalCentavos'] === undefined
        ? null
        : numero(s['precioPromocionalCentavos']),
    promocionDesde: s['promocionDesde'] ? deBase(s['promocionDesde']) : null,
    promocionHasta: s['promocionHasta'] ? deBase(s['promocionHasta']) : null,
    precioHoyCentavos: numero(s['precioHoyCentavos']),
    color: opcional(s['color']),
    requierePreparacion: Boolean(s['requierePreparacion']),
    preparacion: opcional(s['preparacion']),
    diasDisponibles: opcional(s['diasDisponibles']),
    horaDesde: s['horaDesde'] ? texto(s['horaDesde']).slice(0, 5) : null,
    horaHasta: s['horaHasta'] ? texto(s['horaHasta']).slice(0, 5) : null,
    activo: Boolean(s['activo']),
    citasFuturas: numero(s['citasFuturas']),
    citasCompletadas: numero(s['citasCompletadas']),
    historial: lista(s['historial']).map((h) => {
      const x = objeto(h) ?? {};
      return {
        accion: texto(x['accion']),
        quien: texto(x['quien']),
        cuando: texto(x['cuando']),
        antes: objeto(x['antes']),
        despues: objeto(x['despues']),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Categorias                                                          */
/* ------------------------------------------------------------------ */

export function llaveDeCategorias(negocio: string, ambito: AmbitoDeCategoria): string {
  return `categorias:${negocio}:${ambito}`;
}

/**
 * Las categorias con CUANTOS las usan.
 *
 * Ese numero es lo que impide un borrado a ciegas: antes de archivar una
 * categoria hay que poder decir "la usan siete servicios".
 */
export async function traerCategorias(
  negocio: string,
  ambito: AmbitoDeCategoria,
): Promise<Categoria[]> {
  const bd = supabase();
  const { data, error } = await bd
    .from('categoria')
    .select('id, nombre, descripcion, color, activo')
    .eq('negocio_id', negocio)
    .eq('ambito', ambito)
    .eq('eliminado', false)
    .order('nombre');
  reventar(error, 'cargar las categorías');

  const filas = (data ?? []) as Record<string, unknown>[];
  if (filas.length === 0) return [];

  const tabla = ambito === 'servicio' ? 'servicio' : 'curso';
  const { data: usos, error: errorUsos } = await bd
    .from(tabla)
    .select('categoria_id')
    .eq('negocio_id', negocio)
    .eq('eliminado', false);
  reventar(errorUsos, 'contar el uso de las categorías');

  const cuenta = new Map<string, number>();
  for (const u of (usos ?? []) as Record<string, unknown>[]) {
    const id = opcional(u['categoria_id']);
    if (id) cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }

  return filas.map((c) => ({
    id: texto(c['id']),
    nombre: texto(c['nombre']),
    descripcion: opcional(c['descripcion']),
    color: opcional(c['color']),
    activo: Boolean(c['activo']),
    enUso: cuenta.get(texto(c['id'])) ?? 0,
  }));
}

export interface DatosDeCategoria {
  readonly nombre: string;
  readonly descripcion: string;
  readonly color: string;
  readonly activo: boolean;
}

export async function guardarCategoria(
  negocio: string,
  ambito: AmbitoDeCategoria,
  id: string | null,
  datos: DatosDeCategoria,
): Promise<void> {
  const fila = {
    nombre: datos.nombre.trim().replace(/\s+/g, ' '),
    descripcion: datos.descripcion.trim() || null,
    color: datos.color.trim() || null,
    activo: datos.activo,
  };
  const bd = supabase();
  const { error } = id
    ? await bd.from('categoria').update(fila).eq('id', id)
    : await bd.from('categoria').insert([{ negocio_id: negocio, ambito, ...fila }]);
  // La base tiene un indice unico por nombre: dos categorias iguales no entran
  // ni aunque dos personas las creen a la vez.
  if (error && /categoria_nombre_unico/.test(error.message)) {
    throw new Error('Ya existe una categoría con ese nombre.');
  }
  reventar(error, 'guardar la categoría');
}

/**
 * ARCHIVAR una categoria, nunca borrarla.
 *
 * Los servicios que la usaban se quedan SIN categoria —la llave foranea es
 * `on delete set null`—, no desaparecen. Pero antes de llegar aqui la pantalla
 * dice cuantos son: archivar a ciegas una categoria que usan siete servicios
 * los deja a los siete sueltos sin que nadie se entere.
 */
export async function archivarCategoria(id: string): Promise<void> {
  const { error } = await supabase().from('categoria').update({ eliminado: true }).eq('id', id);
  reventar(error, 'archivar la categoría');
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

const aFechaBase = (f: string): string | null => (f ? aBase(f) : null);

export async function guardarServicio(
  negocio: string,
  id: string | null,
  datos: DatosDeServicio,
): Promise<void> {
  const { error } = await supabase().rpc('guardar_servicio', {
    p_negocio: negocio,
    p_id: id,
    p_nombre: datos.nombre.trim().replace(/\s+/g, ' '),
    p_descripcion: datos.descripcion.trim() || null,
    p_categoria: datos.categoriaId || null,
    p_duracion: datos.duracionMin,
    p_precio: datos.precioCentavos,
    p_promo: datos.precioPromocionalCentavos,
    p_promo_desde: aFechaBase(datos.promocionDesde),
    p_promo_hasta: aFechaBase(datos.promocionHasta),
    p_color: datos.color || null,
    p_requiere_preparacion: datos.requierePreparacion,
    p_preparacion: datos.preparacion.trim() || null,
    p_notas: datos.notas.trim() || null,
    p_dias: datos.diasDisponibles || null,
    p_hora_desde: datos.horaDesde || null,
    p_hora_hasta: datos.horaHasta || null,
    p_activo: datos.activo,
  });
  reventar(error, 'guardar el servicio');
}

/**
 * Apagar o encender un servicio. NO se borra.
 *
 * Un servicio apagado deja de ofrecerse para citas y ventas nuevas, pero las
 * citas y las ventas viejas lo siguen necesitando para que los reportes
 * historicos cuadren. Borrarlo de verdad dejaria huecos en la historia.
 */
export async function cambiarEstadoDeServicio(
  negocio: string,
  ficha: FichaDeServicio,
  activo: boolean,
): Promise<void> {
  await guardarServicio(negocio, ficha.id, {
    nombre: ficha.nombre,
    descripcion: ficha.descripcion ?? '',
    categoriaId: ficha.categoriaId ?? '',
    duracionMin: ficha.duracionMin,
    precioCentavos: ficha.precioCentavos,
    precioPromocionalCentavos: ficha.precioPromocionalCentavos,
    promocionDesde: ficha.promocionDesde ?? '',
    promocionHasta: ficha.promocionHasta ?? '',
    color: ficha.color ?? '',
    requierePreparacion: ficha.requierePreparacion,
    preparacion: ficha.preparacion ?? '',
    notas: ficha.notas ?? '',
    diasDisponibles: ficha.diasDisponibles ?? '',
    horaDesde: ficha.horaDesde ?? '',
    horaHasta: ficha.horaHasta ?? '',
    activo,
  });
}

/**
 * Busca un servicio que ya se llame igual.
 *
 * "Masaje Holistico" y "  masaje holistico " son el mismo. Dos renglones
 * iguales en el catalogo hacen que la mitad de las citas queden colgando de
 * uno y la mitad del otro, y ningun reporte por servicio vuelve a cuadrar.
 */
export async function buscarServicioParecido(
  negocio: string,
  nombre: string,
  exceptoId = '',
): Promise<{ id: string; nombre: string } | null> {
  const limpio = nombre.trim().replace(/\s+/g, ' ');
  if (!limpio) return null;

  let consulta = supabase()
    .from('servicio')
    .select('id, nombre')
    .eq('negocio_id', negocio)
    .eq('eliminado', false)
    .ilike('nombre', limpio)
    .limit(1);
  if (exceptoId) consulta = consulta.neq('id', exceptoId);

  const { data, error } = await consulta;
  reventar(error, 'comprobar si ya existe ese servicio');
  const encontrado = ((data ?? []) as Record<string, unknown>[])[0];
  return encontrado ? { id: texto(encontrado['id']), nombre: texto(encontrado['nombre']) } : null;
}

/**
 * Todo lo que hay que refrescar al tocar el catalogo.
 *
 * Incluye `citas` porque la Agenda ofrece los servicios activos en su
 * formulario: apagar uno tiene que quitarlo de esa lista sin recargar.
 */
export const LO_QUE_TOCA_UN_SERVICIO = ['servicios', 'categorias', 'citas', PREFIJO_DE_INICIO] as const;
