/**
 * LEVANTAR LA VITRINA PARA MIRARLA.
 *
 * Lo usan las dos herramientas de mirar: `capturas.ts` y `medir.ts`. Las dos
 * necesitan exactamente lo mismo —la vitrina en pie y contestando— y las dos
 * lo tenian escrito por separado.
 *
 * POR QUE SE ARRANCA CON `node`, Y NO CON `npx`: antes era
 * `spawn('npx', ['vite', ...])`. En Linux funciona; en Windows `npx` no es un
 * ejecutable sino `npx.cmd`, asi que `spawn` fallaba con "spawn npx ENOENT"
 * antes de tomar la primera foto. Se podria pasar `shell: true`, pero eso mete
 * al medio un interprete de comandos que hay que citar bien y que se queda
 * vivo cuando se mata al hijo. Llamar al ejecutable de Vite con el mismo Node
 * que ya esta corriendo no depende del sistema ni de como este el PATH.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const VITE = join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js');

/** La direccion que se le pide al navegador para ver un modulo. */
export function direccionDelModulo(puerto: number, modulo: string): string {
  return `http://localhost:${puerto}/pruebas-visuales/index.html?modulo=${modulo}`;
}

/**
 * Espera a que el servidor conteste. Sin esto la primera foto sale en blanco:
 * Vite tarda en compilar y el navegador llega antes que la pantalla.
 */
async function esperarAlServidor(puerto: number, intentos = 60): Promise<void> {
  for (let i = 0; i < intentos; i += 1) {
    try {
      const r = await fetch(`http://localhost:${puerto}/pruebas-visuales/index.html`);
      if (r.ok) return;
    } catch {
      /* todavia no levanta */
    }
    await new Promise((s) => setTimeout(s, 500));
  }
  throw new Error(
    'La vitrina no levanto. Comprueba que `npm run vitrina` arranca a mano y que ' +
    'nada mas este usando el puerto.',
  );
}

/** Devuelve el proceso ya en pie. Quien lo pide es quien lo mata. */
export async function levantarLaVitrina(puerto: number): Promise<ChildProcess> {
  const servidor: ChildProcess = spawn(
    process.execPath,
    [VITE, '--config', 'pruebas-visuales/vite.config.ts', '--port', String(puerto)],
    { cwd: RAIZ, stdio: 'ignore', detached: false },
  );
  await esperarAlServidor(puerto);
  return servidor;
}
