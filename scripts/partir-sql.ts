/**
 * PARTE `ACTUALIZAR-BASE.sql` EN TROZOS QUE SE PUEDEN PEGAR DE UNO EN UNO.
 *
 *   npx tsx scripts/partir-sql.ts
 *
 * POR QUE EXISTE, Y QUE COSTO NO TENERLO:
 *
 * El editor de SQL de Supabase trocea lo que le pegas en sentencias antes de
 * mandarlo, y con un archivo grande PIERDE EL HILO DE LOS `$$`. Lo que llego a
 * Postgres fue medio `resumen_inicio` —abierto en su `as $$` y sin su cierre— y
 * el error que salio fue:
 *
 *   ERROR: 42601: unterminated dollar-quoted string at or near "$$
 *
 * Que no dice absolutamente nada de la causa. Y de propina el editor se invento
 * un `ALTER TABLE v_ventas_hoy ENABLE ROW LEVEL SECURITY` sobre lo que en
 * realidad son VARIABLES de un `declare`: la prueba de que creia estar fuera de
 * un cuerpo de funcion cuando estaba dentro.
 *
 * EL ARCHIVO ESTABA BIEN. Lo comprueba `escanearDolares` mas abajo, que corre
 * sobre cada trozo antes de escribirlo. Lo que no aguanta es el tamaño.
 *
 * LA REGLA DEL CORTE, Y ES LA UNICA QUE IMPORTA: **nunca se parte dentro de un
 * cuerpo de funcion**. Se cuenta la profundidad de `$$` y solo se corta cuando
 * esta en cero y ademas la sentencia anterior ya cerro. Partir por numero de
 * lineas a secas produciria trozos que cada uno por su cuenta es SQL invalido —
 * el mismo fallo que se venia a arreglar, pero causado por nosotros.
 */

import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const ORIGEN = 'ACTUALIZAR-BASE.sql';

/** A partir de cuantas lineas se busca un sitio donde cortar. */
const LINEAS_POR_TROZO = 450;

/**
 * Recorre el texto como lo haria Postgres y dice si quedo algo abierto.
 *
 * Se miran las tres cosas que pueden tragarse un `$$`: el comentario de linea,
 * el de bloque y la comilla simple. Sin eso, un `$$` citado dentro de un texto
 * contaria como apertura y el corte caeria en el peor sitio posible.
 */
export function escanearDolares(sql: string): { dentro: boolean; comilla: boolean } {
  let i = 0;
  let dentro = false;
  let comilla = false;

  while (i < sql.length) {
    if (!dentro) {
      if (!comilla && sql.startsWith('--', i)) {
        const j = sql.indexOf('\n', i);
        i = j < 0 ? sql.length : j;
        continue;
      }
      if (!comilla && sql.startsWith('/*', i)) {
        const j = sql.indexOf('*/', i + 2);
        i = j < 0 ? sql.length : j + 2;
        continue;
      }
      if (sql[i] === "'") {
        comilla = !comilla;
        i += 1;
        continue;
      }
      if (!comilla && sql.startsWith('$$', i)) {
        dentro = true;
        i += 2;
        continue;
      }
      i += 1;
    } else {
      if (sql.startsWith('$$', i)) {
        dentro = false;
        i += 2;
        continue;
      }
      i += 1;
    }
  }

  return { dentro, comilla };
}

/**
 * Los trozos, cortados solo donde es seguro.
 *
 * Se acumulan lineas y en cuanto se pasa del tamaño se busca la primera linea
 * EN BLANCO con todo cerrado. Una linea en blanco entre dos sentencias es el
 * unico sitio donde partir no cambia el significado de nada.
 */
export function partir(sql: string, porTrozo = LINEAS_POR_TROZO): string[] {
  const fin = sql.includes('\r\n') ? '\r\n' : '\n';
  const lineas = sql.split(fin);
  const trozos: string[] = [];

  let desde = 0;
  for (let i = 0; i < lineas.length; i += 1) {
    if (i - desde < porTrozo) continue;
    if (lineas[i]!.trim() !== '') continue;

    const candidato = lineas.slice(desde, i).join(fin);
    const { dentro, comilla } = escanearDolares(candidato);
    // Si algo quedo abierto, este no era el sitio: se sigue acumulando hasta el
    // siguiente hueco. Mas vale un trozo largo que uno partido por la mitad.
    if (dentro || comilla) continue;

    trozos.push(candidato);
    desde = i + 1;
  }

  const resto = lineas.slice(desde).join(fin);
  if (resto.trim() !== '') trozos.push(resto);
  return trozos;
}

/* ------------------------------------------------------------------ */

const sql = readFileSync(join(RAIZ, ORIGEN), 'utf8');
const fin = sql.includes('\r\n') ? '\r\n' : '\n';

// Se borran los trozos de la vez pasada: si el archivo encogio, dejar los
// viejos haria que alguien pegara un "parte 6" que ya no existe.
for (const nombre of readdirSync(RAIZ)) {
  if (/^PEGAR-\d+-DE-\d+\.sql$/.test(nombre)) unlinkSync(join(RAIZ, nombre));
}

const trozos = partir(sql);
const total = trozos.length;

trozos.forEach((trozo, n) => {
  const cual = n + 1;
  const cabecera = [
    '-- =====================================================================',
    `-- PARTE ${cual} DE ${total} — pegar en Supabase -> SQL Editor -> Run`,
    '-- =====================================================================',
    '--',
    `-- Proyecto: hgypobbanvkwnqmepqim (neron-terapias). MIRA EL REF EN LA BARRA`,
    '-- DE DIRECCIONES: hay otro que se llama casi igual.',
    '--',
    '-- Va en orden: 1, luego 2, luego 3. Cada parte corta entre dos sentencias,',
    '-- nunca dentro de una funcion, asi que cada una es SQL valido por si sola.',
    '--',
    '-- Es seguro correrla las veces que haga falta: todo va con `if not exists`',
    '-- o `create or replace`.',
    '--',
    ...(cual < total
      ? [`-- CUANDO ESTA DIGA "Success", SIGUE CON LA PARTE ${cual + 1}.`, '--']
      : ['-- ESTA ES LA ULTIMA. Con esta ya esta todo.', '--']),
    '',
  ].join(fin);

  const contenido = cabecera + trozo + fin;
  const { dentro, comilla } = escanearDolares(contenido);
  if (dentro || comilla) {
    console.error(`  La parte ${cual} quedo con algo abierto. No se escribe nada.`);
    process.exit(1);
  }

  writeFileSync(join(RAIZ, `PEGAR-${cual}-DE-${total}.sql`), contenido);
  console.log(`  PEGAR-${cual}-DE-${total}.sql — ${trozo.split(fin).length} lineas`);
});

console.log(`\n  ${total} partes, todas cerradas. Se pegan EN ORDEN.`);
