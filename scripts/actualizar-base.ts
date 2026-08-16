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
/*
 * SE MOVIO LA FRONTERA EL 16/08/2026, Y POR UNA RAZON QUE NO ES SOLO DE ORDEN.
 *
 * Antes empezaba en "ELIMINAR UN PRODUCTO", asi que el archivo arrastraba
 * eliminar-producto, el expediente clinico, Gastos, Reportes y Mensajes —todos
 * ya corridos— y salia de 5 419 lineas. Pegar eso en el editor de Supabase
 * REVENTO: su troceador de sentencias perdio el hilo de los `$$` y le mando a
 * Postgres un pedazo de `resumen_inicio` sin su cierre. El error que sale es
 * "unterminated dollar-quoted string", que no dice nada de la causa; y encima
 * el editor se invento un `ALTER TABLE v_ventas_hoy ENABLE ROW LEVEL SECURITY`
 * sobre lo que en realidad son VARIABLES de un `declare`.
 *
 * El archivo estaba bien —hay un escaneo que lo confirma: todos los `$$` y las
 * comillas cierran—. Lo que no aguanta es el tamaño. Asi que la frontera se
 * mueve en cuanto un bloque queda confirmado, que es para lo que se invento.
 */
const DESDE = '-- RECORDATORIOS — EL SEGUIMIENTO DE LO PENDIENTE (bloque 7)';

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
/*
 * `registrar_venta` ENTRA AQUI PORQUE EL BLOQUE 10 LA CAMBIO.
 *
 * Vive muy por encima de la frontera —es del bloque 6— y aun asi cambio: hasta
 * hoy escribia `impuesto_centavos = 0` a mano, y ahora lee la tasa que se
 * configura en Configuracion. Sin sacarla por aqui, el archivo saldria sin ella
 * y el impuesto configurado no se aplicaria a ninguna venta: la pantalla lo
 * enseñaria y el servidor seguiria guardando cero.
 */
const ADEMAS = ['public.ventas_del_rango', 'public.resumen_inicio', 'public.registrar_venta'];

const CABECERA = `-- =====================================================================
-- ACTUALIZAR-BASE.sql — SOLO LO NUEVO
-- =====================================================================
--
-- Pegar en Supabase -> SQL Editor -> Run. Una sola vez basta.
--
-- Va al proyecto \`hgypobbanvkwnqmepqim\` (neron-terapias). MIRA EL REF EN LA
-- BARRA DE DIRECCIONES: hay otro que se llama casi igual y correr esto alli ya
-- costo una mañana.
--
-- Es seguro correrlo las veces que haga falta: no borra datos, no reescribe
-- filas, y todo va con \`if not exists\` o \`create or replace\`.
--
-- QUE TRAE:
--
--   1. RECORDATORIOS (bloque 7). Si ya lo corriste, volver a correrlo no hace
--      daño.
--   2. CONFIGURACION (bloque 10), al final:
--      · \`licencia\` gana la columna \`plan\`, que escribe la plataforma.
--      · Nace \`invitacion\`, con sus reglas de fila y su permiso. Es la unica
--        tabla nueva del bloque: \`membresia.usuario_id\` es not null, asi que
--        no se puede dar de alta a quien todavia no tiene cuenta.
--      · Dieciseis funciones: la ficha del centro, el equipo, los roles, la
--        bitacora, la licencia, exportar y transferir la propiedad.
--
-- Y ARRIBA, EN LAS CORRECCIONES:
--
--   · \`registrar_venta\` VUELVE A CREARSE, y esto es lo importante del bloque:
--     hasta hoy escribia \`impuesto_centavos = 0\` a mano. Ahora lee la tasa que
--     se configura en Configuracion y la desglosa —hacia atras si el precio ya
--     la lleva dentro, encima si no—. Sin correr esto, la pantalla enseñaria el
--     impuesto configurado y el servidor seguiria guardando cero.
--   · \`resumen_inicio\` y \`ventas_del_rango\`, sin cambios de esta vez.
--
-- LO YA COBRADO NO SE TOCA: la cuenta del impuesto solo corre al registrar una
-- venta nueva. Cambiar la tasa hoy no reescribe el mes pasado.
--
-- Sin correr esto, el sitio se publica igual y Configuracion abre con un error
-- que no dice nada util: el navegador pide funciones que la base no tiene.
-- Vercel publica el navegador, no la base.
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
