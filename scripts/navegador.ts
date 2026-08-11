/**
 * DONDE ESTA EL NAVEGADOR CON EL QUE SE MIRA LA PANTALLA.
 *
 * Lo usan las dos herramientas de mirar: `capturas.ts` y `medir.ts`.
 *
 * POR QUE ES UN ARCHIVO APARTE Y NO UNA LINEA EN CADA UNO: antes cada script
 * traia su propia copia apuntando siempre a "/opt/pw-browsers/chromium". En la
 * maquina donde se hizo la primera pasada visual ese archivo existia, asi que
 * funciono; en Windows —que es donde de verdad se trabaja— Playwright moria
 * diciendo que el ejecutable no existe. Y sin capturas no hay con que comparar:
 * se termina "arreglando" la pantalla de memoria, que es exactamente el error
 * que estas herramientas existen para impedir.
 *
 * Vive suelto porque `capturas.ts` corre su trabajo al ser importado. Si
 * `medir.ts` sacara la funcion de ahi, medir un selector dispararia de paso las
 * ocho capturas.
 */

import { existsSync } from 'node:fs';

/**
 * El orden es: lo que diga la variable CHROMIUM, luego el Chromium del sistema
 * si esta, y si no `undefined` para que Playwright use el que se bajo el mismo
 * con `npm install`. Devolver undefined NO es rendirse: es la ruta correcta —
 * Playwright sabe donde puso el suyo mejor que nosotros.
 */
export function rutaDelNavegador(): string | undefined {
  const pedido = process.env['CHROMIUM'];
  if (pedido) return pedido;
  const delSistema = '/opt/pw-browsers/chromium';
  if (existsSync(delSistema)) return delSistema;
  return undefined;
}
