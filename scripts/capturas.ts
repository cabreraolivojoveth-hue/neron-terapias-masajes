/**
 * LAS FOTOS DE LA PANTALLA.
 *
 *   npx tsx scripts/capturas.ts               todos los modulos
 *   npx tsx scripts/capturas.ts ventas        solo uno
 *   npx tsx scripts/capturas.ts --completa    la pantalla entera, no solo lo
 *                                             que se ve sin bajar
 *   npx tsx scripts/capturas.ts --ancho=430   a otro ancho, para el celular
 *   npx tsx scripts/capturas.ts clientes --toca=".pz-renglon"
 *                                             toca lo primero que coincida
 *                                             ANTES de disparar
 *
 * POR QUE EXISTE: los tipos, las guardias y las pruebas no MIRAN. Se puede
 * tener todo en verde y una pantalla que no se parece al diseño — que es
 * exactamente lo que paso. Esto levanta la vitrina, abre cada modulo en el
 * mismo tamaño de la referencia y guarda una imagen en `capturas/`.
 *
 * El tamaño es el de las capturas de diseño: 1536 x 1024. Comparar a otro
 * ancho no sirve de nada — la mitad de las diferencias serian del ancho.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { rutaDelNavegador } from './navegador.js';
import { direccionDelModulo, levantarLaVitrina } from './servidor-de-la-vitrina.js';

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
export function nombreDeLaFoto(
  modulo: string,
  ancho: number,
  completa: boolean,
  toca = '',
): string {
  const partes = [modulo];
  if (ancho !== ANCHO) partes.push(String(ancho));
  if (completa) partes.push('completa');
  /*
   * Lo tocado tambien va en el nombre, y por la misma razon que el ancho: la
   * foto de Clientes con un expediente abierto y la de Clientes vacio son dos
   * pantallas distintas. Con un solo nombre, la segunda pisaba la primera y no
   * habia con que comparar.
   */
  if (toca) partes.push('tocado');
  return partes.join('-');
}

/**
 * ESPERA A QUE LA PANTALLA SE QUEDE QUIETA.
 *
 * Antes eran 900 ms a pelo. El problema de un plazo fijo no es que sea corto:
 * es que no sabe de que esta esperando. Aqui se le pregunta al navegador si
 * queda alguna animacion corriendo —que es justo lo que dice el §10 del
 * acuerdo— y solo entonces se dispara. Si algo se quedo moviendose para
 * siempre, el plazo maximo corta y la foto sale igual, pero al menos sale.
 */
async function esperarQuietud(pagina: Page, plazo = 3000): Promise<void> {
  try {
    await pagina.waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== 'running'),
      undefined,
      { timeout: plazo },
    );
  } catch {
    /* algo se quedo moviendose; la foto lo va a enseñar */
  }
  // Un cuadro mas para que el navegador pinte el estado final ya calculado.
  await pagina.waitForTimeout(120);
}

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const completa = argumentos.includes('--completa');
  const anchoPedido = argumentos.find((a) => a.startsWith('--ancho='));
  const ancho = anchoPedido ? Number(anchoPedido.slice('--ancho='.length)) : ANCHO;
  const tocaPedido = argumentos.find((a) => a.startsWith('--toca='));
  const toca = tocaPedido ? tocaPedido.slice('--toca='.length) : '';
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
    rmSync(join(DESTINO, `${nombreDeLaFoto(modulo, ancho, completa, toca)}.png`), { force: true });
  }

  const servidor = await levantarLaVitrina(PUERTO);

  try {
    const navegador = await chromium.launch({ executablePath: rutaDelNavegador() });
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
      await pagina.setViewportSize({ width: ancho, height: ALTO });
      await pagina.goto(direccionDelModulo(PUERTO, modulo), { waitUntil: 'networkidle' });
      await esperarQuietud(pagina);

      /**
       * TOCAR ALGO ANTES DE DISPARAR, Y POR QUE HACIA FALTA.
       *
       * Media pantalla de este sistema solo existe DESPUES de escoger algo: el
       * expediente de Clientes, la ficha de un servicio, el panel de una cita.
       * Sin esto, las fotos retrataban siempre el estado vacio, y lo que se
       * acababa de construir se publicaba sin haberlo visto nunca — que es
       * exactamente lo que el §8 del acuerdo prohibe.
       *
       * Se toca LO PRIMERO que coincida y da igual cual sea: lo que se compara
       * es la forma de la pantalla, no de quien es la ficha.
       */
      if (toca) {
        const primero = pagina.locator(toca).first();
        try {
          await primero.click({ timeout: 4000 });
          await esperarQuietud(pagina);
        } catch {
          console.log(`  (en ${modulo} no habia nada que coincidiera con "${toca}")`);
        }
      }

      /**
       * LA PANTALLA ENTERA SE TOMA AGRANDANDO LA VENTANA, NO CON "fullPage".
       *
       * ESTO COSTO UNA MAÑANA DE PERSEGUIR UN FANTASMA. Con `fullPage: true`
       * las ocho fotos salian lavadas, como con un velo encima: se leian
       * apenas y comparar con el diseño era imposible. La sonda decia que a
       * los 900 ms no quedaba ni una animacion corriendo y que la opacidad
       * era 1 — o sea, la pantalla estaba bien y la FOTO estaba mal.
       *
       * Lo que pasa: `fullPage` le pide a Chromium capturar mas alla de la
       * ventana, y eso redimensiona la superficie de dibujo. Ese cambio de
       * tamaño vuelve a montar el arbol, las animaciones de entrada arrancan
       * otra vez desde `opacity: 0`, y el disparo cae encima. La foto no
       * mentia: retrataba una pantalla que acababa de empezar a aparecer.
       *
       * Asi que se hace al reves y a proposito: primero se agranda la ventana
       * al alto del documento, DESPUES se espera a que se quede quieta, y
       * recien entonces se dispara una foto normal. Sin capturar mas alla de
       * la ventana no hay redimension a espaldas de nadie.
       */
      if (completa) {
        const alto = await pagina.evaluate(
          () => Math.ceil(document.documentElement.scrollHeight),
        );
        await pagina.setViewportSize({ width: ancho, height: alto });
        await esperarQuietud(pagina);
      }

      const nombre = nombreDeLaFoto(modulo, ancho, completa, toca);
      await pagina.screenshot({ path: join(DESTINO, `${nombre}.png`) });
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
