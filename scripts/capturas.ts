/**
 * LAS FOTOS DE LA PANTALLA.
 *
 *   npx tsx scripts/capturas.ts               todos los modulos
 *   npx tsx scripts/capturas.ts ventas        solo uno
 *   npx tsx scripts/capturas.ts --completa    la pantalla entera, no solo lo
 *                                             que se ve sin bajar
 *   npx tsx scripts/capturas.ts --ancho=430   a otro ancho, para el celular
 *
 * POR QUE EXISTE: los tipos, las guardias y las pruebas no MIRAN. Se puede
 * tener todo en verde y una pantalla que no se parece al diseño — que es
 * exactamente lo que paso. Esto levanta la vitrina, abre cada modulo en el
 * mismo tamaño de la referencia y guarda una imagen en `capturas/`.
 *
 * El tamaño es el de las capturas de diseño: 1536 x 1024. Comparar a otro
 * ancho no sirve de nada — la mitad de las diferencias serian del ancho.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const RAIZ = join(import.meta.dirname, '..');
const DESTINO = join(RAIZ, 'capturas');
const PUERTO = 5199;

/** El mismo tamaño de las capturas de referencia. */
const ANCHO = 1536;
const ALTO = 1024;

const MODULOS = [
  'inicio', 'agenda', 'clientes', 'servicios', 'cursos', 'productos', 'ventas', 'caja',
];

/**
 * Como se llama la foto.
 *
 * El ancho y el "completa" van en el nombre para que una foto de celular no
 * pise la de escritorio: comparar sin saber a que ancho se tomo cada una es
 * peor que no comparar.
 */
export function nombreDeLaFoto(modulo: string, ancho: number, completa: boolean): string {
  const partes = [modulo];
  if (ancho !== ANCHO) partes.push(String(ancho));
  if (completa) partes.push('completa');
  return partes.join('-');
}

/** Espera a que el servidor conteste. Sin esto, la primera foto sale en blanco. */
async function esperarAlServidor(intentos = 60): Promise<void> {
  for (let i = 0; i < intentos; i += 1) {
    try {
      const r = await fetch(`http://localhost:${PUERTO}/pruebas-visuales/index.html`);
      if (r.ok) return;
    } catch {
      /* todavia no levanta */
    }
    await new Promise((s) => setTimeout(s, 500));
  }
  throw new Error('La vitrina no levanto.');
}

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const completa = argumentos.includes('--completa');
  const anchoPedido = argumentos.find((a) => a.startsWith('--ancho='));
  const ancho = anchoPedido ? Number(anchoPedido.slice('--ancho='.length)) : ANCHO;
  const pedidos = argumentos.filter((a) => !a.startsWith('--'));
  const cuales = pedidos.length > 0 ? pedidos : MODULOS;

  /**
   * SOLO SE BORRA LO QUE SE VA A VOLVER A ESCRIBIR.
   *
   * Vaciar la carpeta entera al pedir un modulo suelto tiraba las fotos de los
   * otros siete, y con ellas la posibilidad de comparar antes y despues sin
   * volver a correr los ocho.
   */
  mkdirSync(DESTINO, { recursive: true });
  for (const modulo of cuales) {
    rmSync(join(DESTINO, `${nombreDeLaFoto(modulo, ancho, completa)}.png`), { force: true });
  }

  const servidor: ChildProcess = spawn(
    'npx',
    ['vite', '--config', 'pruebas-visuales/vite.config.ts', '--port', String(PUERTO)],
    { cwd: RAIZ, stdio: 'ignore', detached: false },
  );

  try {
    await esperarAlServidor();
    /**
     * SE USA EL CHROMIUM QUE YA ESTA EN LA MAQUINA.
     *
     * Playwright espera la version exacta que le toca y se pone a bajarla si
     * no la encuentra; en una maquina sin salida a internet eso deja el
     * comando colgado sin explicar nada. Apuntarle al que ya existe es una
     * linea y funciona igual.
     */
    const navegador = await chromium.launch({
      executablePath: process.env['CHROMIUM'] ?? '/opt/pw-browsers/chromium',
    });
    const pagina = await navegador.newPage({
      viewport: { width: ancho, height: ALTO },
      deviceScaleFactor: 1,
    });

    const quejas: string[] = [];
    pagina.on('console', (m) => {
      // El icono de la pestaña no existe en la vitrina y no va a existir: el
      // navegador lo pide solo y da un 404 en cada foto. Anotarlo entre las
      // quejas hace que se ignoren TODAS, incluidas las que si importan.
      if (m.type() === 'error' && !m.text().includes('favicon')) quejas.push(m.text());
    });
    pagina.on('pageerror', (e) => quejas.push(e.message));

    for (const modulo of cuales) {
      await pagina.goto(
        `http://localhost:${PUERTO}/pruebas-visuales/index.html?modulo=${modulo}`,
        { waitUntil: 'networkidle' },
      );
      // Un respiro para que terminen las animaciones de entrada: una foto a
      // media transicion no se puede comparar con nada.
      await pagina.waitForTimeout(900);
      const nombre = nombreDeLaFoto(modulo, ancho, completa);
      await pagina.screenshot({ path: join(DESTINO, `${nombre}.png`), fullPage: completa });
      console.log(`  ${nombre}`);
    }

    await navegador.close();

    if (quejas.length > 0) {
      console.log('\n  La consola del navegador se quejo:');
      for (const q of [...new Set(quejas)].slice(0, 12)) console.log(`    ${q}`);
    }
    console.log(
      `\n  Fotos en capturas/ — ${ancho}x${completa ? 'entera' : ALTO}${
        ancho === ANCHO ? ', el mismo tamaño del diseño' : ''
      }.`,
    );
  } finally {
    servidor.kill('SIGTERM');
  }
}

principal().catch((e) => {
  console.error(`  No se pudieron tomar las fotos: ${(e as Error).message}`);
  process.exit(1);
});
