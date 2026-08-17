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
/*
 * SE MOVIO LA FRONTERA EL 16/08/2026, POR SEGUNDA VEZ.
 *
 * Recordatorios ya corrio en `hgypobbanvkwnqmepqim` y esta comprobado: cuatro
 * tablas, diez columnas, veintiun funciones y las veinte funciones ensayadas
 * contra la base de verdad. Arrastrarlo otra vez dejaba el archivo en 3 821
 * lineas — y el troceador del editor de Supabase pierde el hilo de los `$$`
 * cuando el archivo crece, que fue lo que revento la vez pasada.
 *
 * Asi que la frontera pasa al bloque 10 y el archivo vuelve a ser corto. Para
 * eso se invento.
 */
/*
 * SE MOVIO LA FRONTERA EL 16/08/2026, POR TERCERA VEZ.
 *
 * El bloque 10 ya corrio en `hgypobbanvkwnqmepqim` y esta comprobado CONTRA LA
 * BASE —tabla `invitacion` con sus reglas, `licencia.plan`, las dieciseis
 * funciones y `registrar_venta` leyendo el impuesto—, asi que arrastrarlo otra
 * vez solo hacia el archivo mas largo. Y esta vez importa mas que nunca: el
 * bloque 11 trae UNA funcion de mil setecientas lineas que no se puede partir
 * por la mitad, asi que todo lo que se le sume delante acerca el archivo al
 * tamaño con el que el editor de Supabase pierde el hilo de los `$$`.
 */
const DESDE = '-- DATOS DE DEMOSTRACION — CINCO MESES DE USO, PARA ENSEÑAR EL SISTEMA (bloque 11)';

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
 * VACIO PARA EL BLOQUE 11, y es una comprobacion, no un descuido: los datos de
 * demostracion NO tocan ni una funcion de las que ya estaban. Todo lo suyo es
 * nuevo y vive al final del instalador. El dia que un bloque si corrija algo de
 * mas arriba, su nombre va aqui — que es como `registrar_venta` viajo con el
 * bloque 10.
 */
/*
 * `resumen_de_gastos` VIAJA AQUI PORQUE TIRABA LA PANTALLA DE GASTOS.
 *
 * Vive en el bloque 7, muy por encima de la frontera, y aun asi cambio: su
 * promedio diario salia con decimales —`sum()` de un bigint devuelve numeric—
 * y la guardia de la base rechaza cualquier dinero que no sea un entero de
 * centavos. Con el centro vacio la division daba cero clavado y no se veia.
 * Sin sacarla por aqui, el arreglo no llegaria a la base y Gastos seguiria
 * cayendose con datos de verdad dentro.
 */
const ADEMAS: string[] = ['public.resumen_de_gastos'];

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
-- ARRIBA, UNA CORRECCION DE LO QUE YA CORRIA:
--
--   · \`resumen_de_gastos\` VUELVE A CREARSE. Su promedio diario salia con
--     decimales —\`sum()\` de un bigint devuelve numeric— y la guardia del
--     dinero tira la pantalla de Gastos entera en cuanto hay gastos de verdad:
--     "formatearMoneda() recibio 67222.58066516129". Con el centro vacio la
--     division daba cero clavado y no se veia.
--
-- Y DESPUES, EL BLOQUE 11: los datos de demostracion.
--
--   · Nace \`dato_de_demostracion\`, con sus reglas de fila y su permiso. Es el
--     rastro de que fila nacio de una demostracion, y es lo unico que permite
--     QUITARLA despues sin tocar lo que hayas capturado tu.
--   · \`cargar_datos_de_demostracion\` siembra cinco meses de uso en NUEVE pasos
--     —catalogo, pacientes, un mes por paso, y al final cursos, mensajes,
--     recordatorios y bitacora—. Cada paso es su propia llamada: de un viaje,
--     el tiempo limite de PostgREST la cortaria a la mitad.
--   · \`quitar_datos_de_demostracion\` borra exactamente lo sembrado, en el
--     orden de las llaves foraneas.
--   · \`datos_de_demostracion\` dice si hay algo cargado y cuanto.
--
-- SOLO DESDE LA CUENTA \`cabreraolivojoveth@gmail.com\`. El correo se compara
-- en la base, no en la pantalla: esconder la tarjeta es cortesia, y aqui hacia
-- falta seguridad. Cualquier otra cuenta recibe un error de permisos aunque
-- llame a la base a mano.
--
-- NO TOCA NI UNA FILA DE LO QUE YA HAY. Todo lo que crea es nuevo, y hasta que
-- alguien apriete el boton no escribe ni un renglon de datos.
--
-- Sin correr esto, el sitio se publica igual y la seccion "Datos de
-- demostracion" falla pidiendo funciones que la base no tiene. Vercel publica
-- el navegador, no la base.
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
