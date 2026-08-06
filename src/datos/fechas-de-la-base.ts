/**
 * LA CONVERSION DE FECHAS ENTRE LA APLICACION Y LA BASE, en un solo lugar.
 *
 * Las fechas viajan como texto `dd/mm/aaaa` por toda la aplicacion y como
 * `date` en la base de datos. La traduccion vive AQUI y en ningun otro lado.
 *
 * Es la leccion mas cara de las fechas: en cuanto la conversion se reparte,
 * alguien escribe un `new Date(texto)` en una pantalla y la cita se mueve un
 * dia segun la zona horaria de quien la abrio. No falla; solo queda mal, y en
 * un dia distinto para cada persona.
 *
 * Vivio dentro de `citas.ts` mientras la agenda era el unico modulo que
 * hablaba con la base. Al llegar Inicio —que lee ventas, cursos y
 * recordatorios— habia que copiarla o compartirla, y copiarla es exactamente
 * como empieza el problema de arriba.
 */

import { aISO, desdeISO, type Fecha } from '@neron/base/utils';

/** `dd/mm/aaaa` → `aaaa-mm-dd`, que es lo que entiende la base. */
export function aBase(f: Fecha): string {
  return aISO(f);
}

/**
 * Lo que devuelve la base → `dd/mm/aaaa`.
 *
 * El controlador de Postgres puede devolver una columna `date` como texto o
 * como objeto Date segun la version. Se aceptan las dos: convertir un Date a
 * texto con `toISOString()` lo pasa por UTC y en México le resta un dia.
 */
export function deBase(valor: unknown): Fecha {
  if (valor instanceof Date) {
    const a = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return desdeISO(`${a}-${m}-${d}`);
  }
  return desdeISO(String(valor).slice(0, 10));
}

/**
 * El grito cuando la base contesta con un error.
 *
 * Lleva el NOMBRE DE LA OPERACION delante. Un "column does not exist" pelado
 * en pantalla no le dice a nadie que fue al cargar el tablero.
 */
export function reventar(error: { message: string } | null, donde: string): void {
  if (error) throw new Error(`${donde}: ${error.message}`);
}
