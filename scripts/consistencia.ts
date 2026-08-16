/**
 * LA ORDEN UNICA DE NERON TERAPIAS.
 *
 *   npm run consistencia
 *
 * Corre todo en orden y TERMINA EN VERDE O NO SE PUBLICA. Es la misma
 * disciplina de la base, con los pasos del producto.
 *
 * Si algo falla: se busca la causa raiz, se corrige, y se vuelve a correr
 * TODA la bateria — nunca solo el paso que fallo. Un paso que pasa solo no
 * dice nada de los que van despues.
 */

import { spawnSync } from 'node:child_process';

const PASOS = [
  { titulo: 'Tipos', porque: 'que no haya nada mal escrito ni mal conectado', orden: 'npx tsc -p tsconfig.json --noEmit' },
  { titulo: 'Fronteras', porque: 'que no se haya colado un dato de ejemplo ni un color suelto', orden: 'npx tsx guardias/fronteras.ts' },
  { titulo: 'Pruebas', porque: 'que las reglas del producto sigan cumpliendose', orden: 'npx vitest run' },
  /**
   * EL UNICO PASO QUE MIRA UNA PANTALLA DE VERDAD, y esta aqui porque los otros
   * cuatro dejaron salir a produccion un modal que se veia roto.
   *
   * El velo de "Categorias de cursos" salio encerrado en la caja del modulo:
   * una plancha oscura pegada en medio de la pantalla, sin tapar la barra
   * lateral. Con tipos, guardias, mil doscientas pruebas y la compilacion en
   * verde — porque ninguna de esas cuatro cosas abre un modal y lo mide.
   *
   * Abre un navegador y tarda unos treinta segundos. Es el paso mas lento de la
   * bateria y el unico que habria cachado ese fallo.
   */
  { titulo: 'Velos', porque: 'que todo lo que se abre encima tape la pantalla y no la tache', orden: 'npx tsx scripts/velos.ts' },
  /**
   * EL SEGUNDO PASO QUE MIRA, y vigila lo contrario que los velos: no lo que se
   * abre encima, sino lo que se queda debajo.
   *
   * La queja fue "meto productos y la zona de cobrar se va de la pantalla y no
   * puedo bajar". Los tipos no miran; las guardias leen texto; las pruebas de
   * componentes corren en un DOM sin diseño, donde `position: sticky` no
   * existe y todo mide cero, asi que encuentran el boton y lo tocan tan
   * campantes; y la captura retrata la pantalla VACIA, que es justo cuando el
   * fallo no aparece.
   *
   * Esto abre cada modulo en cuatro tamaños —telefono, tablet, escritorio y un
   * portatil bajo—, LLENA el carrito, y comprueba que a cada boton se llega
   * desplazando.
   */
  { titulo: 'Alcance', porque: 'que nada quede fuera de alcance al crecer el contenido', orden: 'npx tsx scripts/alcance.ts' },
  { titulo: 'Compilacion', porque: 'que lo que se va a publicar de verdad compile', orden: 'npx vite build' },
  { titulo: 'Ataques', porque: 'que las reglas de acceso de verdad muerdan', orden: 'npx tsx pruebas-bd/ataques.ts' },
];

const HAY_BASE = Boolean(process.env['DATABASE_URL'] || process.env['PGDATABASE']);
const arranque = Date.now();

for (let i = 0; i < PASOS.length; i += 1) {
  const paso = PASOS[i]!;

  if (paso.titulo === 'Ataques' && !HAY_BASE) continue;

  console.log(`\n  [${i + 1}/${PASOS.length}] ${paso.titulo} — ${paso.porque}`);
  const r = spawnSync(paso.orden, { shell: true, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n  SE DETUVO EN: ${paso.titulo}`);
    console.error('  No se publica. Busca la causa raiz, corrigela, y vuelve a correr');
    console.error('  TODA la bateria — nunca solo el paso que fallo.');
    process.exit(1);
  }
}

const segundos = ((Date.now() - arranque) / 1000).toFixed(1);

if (!HAY_BASE) {
  /**
   * SIN BASE DE DATOS NO SE DICE "VERDE" A SECAS.
   *
   * Es la mentira mas facil de contar: la bateria pasa, sale en verde, y
   * nadie recuerda que los ataques —lo unico que comprueba que los datos de
   * los pacientes estan protegidos— ni siquiera corrieron.
   */
  console.log(`\n  Verde en ${segundos} segundos — PERO LOS ATAQUES NO CORRIERON.`);
  console.log('  Falta la base de datos. Sigue CONFIGURAR-CONEXION.md: son cuatro pasos,');
  console.log('  y hasta entonces nadie ha comprobado que las reglas de acceso muerdan.');
  process.exit(0);
}

console.log(`\n  TODO EN VERDE en ${segundos} segundos, ataques incluidos. Se puede publicar.`);
