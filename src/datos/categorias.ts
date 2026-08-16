/**
 * LAS CATEGORIAS DEL CATALOGO — compartidas por Servicios y por Cursos.
 *
 * UNA SOLA TABLA PARA LOS DOS. Un centro llama "Terapias Energeticas" tanto a
 * un servicio como a un curso, y con dos tablas ese nombre existiria dos
 * veces: se renombra en una y la otra se queda vieja. La columna `ambito`
 * separa los dos catalogos sin duplicar tabla, reglas de acceso ni pantalla.
 *
 * VIVE APARTE de `servicios.ts` y de `cursos.ts` porque no es de ninguno de
 * los dos. Dejarla dentro de uno obligaria al otro a importar de sus tripas.
 */

import { supabase } from '../supabase.js';
import { reventar } from './fechas-de-la-base.js';

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const opcional = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

/**
 * A que catalogo pertenece una categoria.
 *
 * UNA SOLA TABLA para los tres. Un centro llama "Aceites" a un grupo y no
 * quiere tres listas distintas de grupos que se renombren por separado.
 */
// Gastos reusa la MISMA tabla que servicios, cursos y productos: lo unico
// que cambia es el ambito. Una tabla aparte para las categorias de gasto
// habria sido el error que costo el sistema de diseño — cuatro parecidas y
// ninguna igual.
export type AmbitoDeCategoria =
  | 'servicio'
  | 'curso'
  | 'producto'
  | 'gasto'
  | 'conversacion'
  | 'recordatorio';

export interface Categoria {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly color: string | null;
  readonly activo: boolean;
  /** Cuantos servicios o cursos la usan. Se cuenta, no se guarda. */
  readonly enUso: number;
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

  // La tabla que hay que contar depende del ambito: son tres catalogos
  // distintos compartiendo una sola lista de grupos.
  const tabla = ambito;
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
