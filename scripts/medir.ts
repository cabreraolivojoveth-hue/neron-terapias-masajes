/**
 * LA CINTA METRICA DE LA PANTALLA.
 *
 *   npx tsx scripts/medir.ts ventas ".vta-quien" ".pz-buscador"
 *
 * POR QUE EXISTE: una captura enseña QUE algo esta mal, no POR QUE. Un hueco
 * de ciento setenta pixeles puede ser un `flex-basis` que en una columna
 * significa alto, un `align-items` heredado o una tarjeta estirada por su
 * vecina — y adivinar cual de los tres cuesta mas que medirlo.
 *
 * Devuelve, por cada elemento que coincida: su caja, su padre, y las
 * propiedades que mas veces son la causa. Nada de esto se puede saber leyendo
 * la hoja de estilos, porque casi siempre el culpable es la HERENCIA.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from 'playwright';

const RAIZ = join(import.meta.dirname, '..');
const PUERTO = 5198;
const ANCHO = 1536;
const ALTO = 1024;

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
  const [modulo, ...selectores] = process.argv.slice(2);
  if (!modulo || selectores.length === 0) {
    console.error('  Uso: npx tsx scripts/medir.ts <modulo> <selector> [selector...]');
    process.exit(1);
  }

  const servidor: ChildProcess = spawn(
    'npx',
    ['vite', '--config', 'pruebas-visuales/vite.config.ts', '--port', String(PUERTO)],
    { cwd: RAIZ, stdio: 'ignore' },
  );

  try {
    await esperarAlServidor();
    const navegador = await chromium.launch({
      executablePath: process.env['CHROMIUM'] ?? '/opt/pw-browsers/chromium',
    });
    const pagina = await navegador.newPage({
      viewport: { width: ANCHO, height: ALTO },
      deviceScaleFactor: 1,
    });
    await pagina.goto(
      `http://localhost:${PUERTO}/pruebas-visuales/index.html?modulo=${modulo}`,
      { waitUntil: 'networkidle' },
    );
    await pagina.waitForTimeout(900);

    for (const selector of selectores) {
      const medidas = await pagina.evaluate((sel) => {
        const interesa = [
          'display', 'flex', 'flexDirection', 'flexBasis', 'flexGrow',
          'alignItems', 'alignSelf', 'justifyContent', 'gap',
          'gridTemplateColumns', 'minHeight', 'height', 'padding',
        ] as const;
        return [...document.querySelectorAll(sel)].slice(0, 6).map((n) => {
          const e = n as HTMLElement;
          const caja = e.getBoundingClientRect();
          const c = getComputedStyle(e);
          const propio: Record<string, string> = {};
          for (const p of interesa) propio[p] = c[p];
          const padre = e.parentElement;
          const dePadre: Record<string, string> = {};
          if (padre) {
            const cp = getComputedStyle(padre);
            for (const p of interesa) dePadre[p] = cp[p];
          }
          return {
            clase: e.className,
            caja: {
              x: Math.round(caja.x), y: Math.round(caja.y),
              ancho: Math.round(caja.width), alto: Math.round(caja.height),
            },
            propio,
            padre: padre ? `${padre.tagName.toLowerCase()}.${padre.className}` : '—',
            dePadre,
          };
        });
      }, selector);

      console.log(`\n${selector} — ${medidas.length} encontrados`);
      for (const m of medidas) {
        console.log(`  ${m.caja.ancho}x${m.caja.alto} en (${m.caja.x},${m.caja.y})  ${m.clase}`);
        console.log(`    propio: ${resumir(m.propio)}`);
        console.log(`    padre : ${m.padre}`);
        console.log(`            ${resumir(m.dePadre)}`);
      }
    }

    await navegador.close();
  } finally {
    servidor.kill('SIGTERM');
  }
}

/** Solo lo que no es el valor por defecto: lo demas es ruido. */
function resumir(props: Record<string, string>): string {
  const aburrido = new Set(['normal', 'auto', 'none', '0px', 'stretch', 'flex-start', '0']);
  return Object.entries(props)
    .filter(([, valor]) => !aburrido.has(valor))
    .map(([nombre, valor]) => `${nombre}=${valor}`)
    .join('  ');
}

principal().catch((e) => {
  console.error(`  No se pudo medir: ${(e as Error).message}`);
  process.exit(1);
});
