/**
 * REGENERA `ACTUALIZAR-BASE.sql` A PARTIR DEL INSTALADOR.
 *
 *   npx tsx scripts/actualizar-base.ts
 *
 * POR QUE EXISTE, Y QUE COSTO NO TENERLO:
 *
 * `ACTUALIZAR-BASE.sql` es "solo lo nuevo": lo que hay que pegar en Supabase
 * cuando ya se corrio el instalador completo alguna vez. Se venia armando a
 * mano, y a mano pasaron las dos cosas que este guion impide:
 *
 *   1. Se REGENERO PARA GASTOS y en el camino perdio los bloques de eliminar
 *      producto y del expediente clinico, que nadie habia corrido todavia. El
 *      archivo se veia bien y le faltaba la mitad.
 *   2. Al pegar la seccion de Reportes en el instalador, el texto entro EN
 *      MEDIO de dos funciones de Gastos y las partio. Salio publicado en verde
 *      porque nada de la bateria abre ese archivo. Lo vigila la guardia 16.
 *
 * COMO DECIDE QUE ES "LO NUEVO": desde el bloque marcado como frontera hasta el
 * final del instalador. No hay recortes a mano ni numeros de linea escritos en
 * ningun lado — que es justo lo que se descuadra en cuanto alguien agrega algo.
 *
 * Cuando el usuario confirme que ya corrio todo esto, se mueve la frontera al
 * siguiente titulo y el archivo vuelve a ser corto.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');

/**
 * El primer bloque que el usuario TODAVIA NO HA CORRIDO.
 *
 * Va por el titulo y no por el numero de linea a proposito: el numero se
 * desplaza en cuanto se agrega un comentario tres mil lineas mas arriba, y
 * nadie se entera hasta que el archivo sale cortado por la mitad.
 */
const DESDE = '-- ELIMINAR UN PRODUCTO — y por que no es lo mismo que desactivarlo';

/**
 * FUNCIONES QUE VIVEN ANTES DE LA FRONTERA Y AUN ASI CAMBIARON.
 *
 * Pasa cuando se corrige algo de un bloque que el usuario YA corrio: la
 * correccion no entra por la frontera y el archivo sale sin ella. Se sacan por
 * nombre y se pegan al principio; son `create or replace`, asi que volver a
 * correrlas encima de las que ya estan no hace nada raro.
 *
 * Lo que NO se hace es moverlas al final del instalador para que entren solas:
 * eso desordena el archivo y es como se partio la seccion de Reportes en dos.
 */
const ADEMAS = ['public.ventas_del_rango', 'public.resumen_inicio'];

const CABECERA = `-- =====================================================================
-- ACTUALIZAR-BASE.sql — SOLO LO NUEVO
-- =====================================================================
--
-- Pegar en Supabase -> SQL Editor -> Run. Una sola vez basta.
--
-- Es seguro correrlo las veces que haga falta: no borra datos, no reescribe
-- filas, y todo va con \`if not exists\` o \`create or replace\`. Si ya corriste
-- una version anterior de este archivo, correr esta otra vez no hace daño.
--
-- QUE TRAE, en orden:
--
--   1. ELIMINAR UN PRODUCTO. Sin esto, el boton Eliminar de un producto
--      contesta que la funcion no existe.
--   2. EL EXPEDIENTE CLINICO DEL CLIENTE. Sin esto, la ficha de salud se
--      guarda pero no se vuelve a leer: padecimientos, alergias y
--      contraindicaciones salen vacias la siguiente vez que se abre — y son
--      justo las que hay que mirar ANTES de dar una sesion.
--   3. EL MODULO GASTOS COMPLETO: la tabla \`gasto\` completada, los
--      recurrentes, el disparador a caja con el efectivo aparte y sus ocho
--      funciones.
--   4. LA CAPA DE REPORTES: \`reporte_del_periodo\` —todo el reporte en UNA
--      llamada— y la tabla \`reporte_guardado\` con sus reglas de fila.
--   5. LA CAPA DE MENSAJES: conversaciones, hilos, canales, plantillas,
--      automatizaciones y difusiones, con sus permisos de tabla.
--   6. RECORDATORIOS COMPLETO: la tabla \`recordatorio\` del bloque 0 se
--      completa —hora, categoria, responsable, notas, recurrencia, origen y
--      quien lo cerro— y llegan \`recordatorio_recurrente\`,
--      \`recordatorio_evento\`, \`recordatorio_ajustes\` y
--      \`recordatorio_automatizacion\` con sus reglas de fila y sus veinte
--      funciones. Sin esto, Recordatorios abre y contesta que las funciones no
--      existen.
--
-- Y ARRIBA, EN LAS CORRECCIONES: \`resumen_inicio\` vuelve a crearse para
-- separar los recordatorios de hoy de los vencidos. Sin ella, Inicio sigue
-- funcionando pero sus dos tarjetas nuevas salen en cero.
--
-- POR QUE VAN LOS CUATRO Y NO SOLO EL ULTIMO: la version anterior de este
-- archivo se regenero para Gastos y en el camino perdio los dos primeros
-- bloques, que nunca se llegaron a correr. Al ser todo idempotente, la
-- respuesta correcta es incluirlos otra vez en vez de pedirte que recuerdes
-- cual corriste.
--
-- Sin correr esto, el sitio se publica igual y las pantallas nuevas salen con
-- un error que no dice nada util: el navegador pide funciones que la base
-- todavia no tiene. Vercel publica el navegador, no la base.
--
-- Este archivo lo genera \`scripts/actualizar-base.ts\` a partir de
-- INSTALAR-EN-TERAPIAS.sql. No se edita a mano: se corre el guion.
`;

const instalador = readFileSync(join(RAIZ, 'INSTALAR-EN-TERAPIAS.sql'), 'utf8');
const fin = instalador.includes('\r\n') ? '\r\n' : '\n';
const lineas = instalador.split(fin);

const iTitulo = lineas.findIndex((l) => l.trim() === DESDE);
if (iTitulo < 0) {
  console.error(`  No se encontro la frontera en el instalador:\n    ${DESDE}`);
  console.error('  Si el titulo cambio, cambialo tambien aqui — cortar por numero de linea');
  console.error('  es exactamente como se partio la seccion de Reportes en dos.');
  process.exit(1);
}

// Se arranca en la raya de "=====" de arriba del titulo, no en el titulo: sin
// ella el bloque empieza a media caja de comentario.
const desde = lineas[iTitulo - 1]?.startsWith('-- ===') ? iTitulo - 1 : iTitulo;

/** Saca una funcion entera del instalador, de su `create` a su `$$;`. */
function funcionSuelta(nombre: string): string[] {
  const arranque = lineas.findIndex((l) => l.startsWith(`create or replace function ${nombre}`));
  if (arranque < 0) {
    console.error(`  No se encontro la funcion "${nombre}" en el instalador.`);
    process.exit(1);
  }
  const cierre = lineas.findIndex((l, i) => i > arranque && l.startsWith('$$;'));
  if (cierre < 0) {
    console.error(`  La funcion "${nombre}" no cierra. Lo dice tambien la guardia 16.`);
    process.exit(1);
  }
  return lineas.slice(arranque, cierre + 1);
}

const extras = ADEMAS.length === 0 ? [] : [
  '-- =====================================================================',
  '-- CORRECCIONES A LO QUE YA HABIAS CORRIDO',
  '-- =====================================================================',
  '--',
  '-- Son `create or replace`: se pueden correr encima de las que ya existen.',
  '',
  ...ADEMAS.flatMap((n) => [...funcionSuelta(n), '']),
];

const salida = [...CABECERA.split('\n'), ...extras, ...lineas.slice(desde)];
writeFileSync(join(RAIZ, 'ACTUALIZAR-BASE.sql'), salida.join(fin));

console.log(`  ACTUALIZAR-BASE.sql regenerado: ${salida.length} lineas`);
console.log(`  desde la linea ${desde + 1} del instalador hasta el final`);
if (ADEMAS.length > 0) console.log(`  mas ${ADEMAS.length} funcion(es) corregidas: ${ADEMAS.join(', ')}`);
