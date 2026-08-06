/**
 * EL BUSCADOR GLOBAL — encontrar cualquier cosa desde cualquier pantalla.
 *
 * Busca sobre las TABLAS DE VERDAD de cada modulo. No hay un indice aparte que
 * alguien tenga que acordarse de actualizar: un indice propio empieza bien y
 * se desincroniza el dia que alguien edita un nombre por otro camino, y
 * entonces el buscador no encuentra a un paciente que si existe — que es la
 * peor forma de fallar, porque la persona concluye que el paciente no esta
 * dado de alta y lo captura otra vez.
 *
 * QUIEN NO PUEDE VER ALGO NO LO ENCUENTRA. No hay ni un filtro de permisos en
 * este archivo: las reglas de fila de la base deciden que filas se entregan.
 * Un buscador que filtra en el navegador ya bajo los datos — y quien sepa
 * abrir la pestaña de red los ve igual.
 *
 * LAS CUATRO CONSULTAS VAN EN PARALELO. En serie son cuatro idas y vueltas
 * seguidas y se siente lento justo donde mas se nota, escribiendo.
 */

import { supabase } from '../supabase.js';
import { reventar } from './fechas-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

export type TipoEncontrado = 'cliente' | 'servicio' | 'producto' | 'curso';

export interface Encontrado {
  readonly tipo: TipoEncontrado;
  readonly id: string;
  readonly nombre: string;
  /** Una linea corta que ayuda a distinguir dos que se llaman parecido. */
  readonly pista: string | null;
  /** El modulo dueño de esa entidad. El buscador no navega: lo dice. */
  readonly modulo: string;
}

/** Como se llama cada grupo en la lista de resultados. */
export const NOMBRE_DEL_TIPO: Readonly<Record<TipoEncontrado, string>> = {
  cliente: 'Clientes',
  servicio: 'Servicios',
  producto: 'Productos',
  curso: 'Cursos',
};

/**
 * Desde cuantas letras se busca.
 *
 * Con una sola letra medio centro entra en el resultado: no ayuda a nadie y
 * manda una consulta por cada tecla desde la primera.
 */
export const LETRAS_MINIMAS = 2;

/**
 * El texto, listo para comparar y para usar de llave.
 *
 * Se recorta y se pasa a minusculas para que "  Ana " y "ana" no sean dos
 * consultas distintas con el mismo resultado.
 */
export function normalizarBusqueda(texto: string): string {
  return texto.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Escapa lo que en `ilike` significa otra cosa.
 *
 * Sin esto, escribir `%` trae la tabla entera y `_` casa con cualquier letra.
 * No es un problema de seguridad —la consulta va parametrizada— pero si de
 * resultados que nadie entiende.
 */
export function paraContiene(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * La llave cuelga de `inicio:` a proposito.
 *
 * Un solo `invalidar('inicio')` refresca el tablero Y el buscador. Sin eso,
 * quien da de alta un paciente y lo busca medio minuto despues no lo
 * encuentra, porque el resultado de esa misma palabra quedo guardado de antes.
 */
export function llaveDeBusqueda(negocio: string, texto: string): string {
  return `${PREFIJO_DE_INICIO}:busqueda:${negocio}:${normalizarBusqueda(texto)}`;
}

const POR_TIPO = 4;

export async function buscarEnTodo(negocio: string, texto: string): Promise<Encontrado[]> {
  const limpio = normalizarBusqueda(texto);
  if (limpio.length < LETRAS_MINIMAS) return [];
  const patron = paraContiene(limpio);
  const bd = supabase();

  const [clientes, servicios, productos, cursos] = await Promise.all([
    bd.from('cliente').select('id, nombre, telefono').eq('negocio_id', negocio)
      .eq('eliminado', false).ilike('nombre', patron).order('nombre').limit(POR_TIPO),
    bd.from('servicio').select('id, nombre, duracion_min').eq('negocio_id', negocio)
      .eq('eliminado', false).ilike('nombre', patron).order('nombre').limit(POR_TIPO),
    bd.from('producto').select('id, nombre, stock_actual').eq('negocio_id', negocio)
      .eq('eliminado', false).ilike('nombre', patron).order('nombre').limit(POR_TIPO),
    bd.from('curso').select('id, nombre, estado').eq('negocio_id', negocio)
      .eq('eliminado', false).ilike('nombre', patron).order('fecha_inicio').limit(POR_TIPO),
  ]);

  reventar(clientes.error, 'buscar pacientes');
  reventar(servicios.error, 'buscar servicios');
  reventar(productos.error, 'buscar productos');
  reventar(cursos.error, 'buscar cursos');

  const filas = (r: { data: unknown }): Record<string, unknown>[] =>
    Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [];

  const salida: Encontrado[] = [];

  for (const c of filas(clientes)) {
    salida.push({
      tipo: 'cliente',
      id: String(c['id']),
      nombre: String(c['nombre']),
      pista: c['telefono'] ? String(c['telefono']) : null,
      modulo: 'clientes',
    });
  }
  for (const s of filas(servicios)) {
    salida.push({
      tipo: 'servicio',
      id: String(s['id']),
      nombre: String(s['nombre']),
      pista: s['duracion_min'] ? `${Number(s['duracion_min'])} min` : null,
      modulo: 'servicios',
    });
  }
  for (const p of filas(productos)) {
    const stock = Number(p['stock_actual']);
    salida.push({
      tipo: 'producto',
      id: String(p['id']),
      nombre: String(p['nombre']),
      // Se dice la existencia real aunque sea cero o negativa. Un numero
      // incomodo y visible vale mas que uno bonito y falso.
      pista: Number.isFinite(stock) ? `${stock} en existencia` : null,
      modulo: 'productos',
    });
  }
  for (const k of filas(cursos)) {
    salida.push({
      tipo: 'curso',
      id: String(k['id']),
      nombre: String(k['nombre']),
      pista: k['estado'] ? String(k['estado']) : null,
      modulo: 'cursos',
    });
  }

  return salida;
}

/** Los resultados agrupados por tipo, en el orden en que se muestran. */
export function agruparPorTipo(
  resultados: readonly Encontrado[],
): { tipo: TipoEncontrado; titulo: string; cosas: Encontrado[] }[] {
  const orden: TipoEncontrado[] = ['cliente', 'servicio', 'producto', 'curso'];
  return orden
    .map((tipo) => ({
      tipo,
      titulo: NOMBRE_DEL_TIPO[tipo],
      cosas: resultados.filter((r) => r.tipo === tipo),
    }))
    // Un grupo vacio DESAPARECE. Un encabezado "Productos" sin nada debajo
    // solo hace preguntarse si se rompio algo.
    .filter((g) => g.cosas.length > 0);
}
