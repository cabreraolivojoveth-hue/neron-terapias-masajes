/**
 * El arranque.
 *
 * Tres cosas y nada mas: la hoja de estilos de la base, encima los colores del
 * Centro, y el arbol de React. Toda decision vive mas adentro.
 */

import { generarCss } from '@neron/base/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Aplicacion } from './aplicacion.js';
import { BarreraDeRaiz } from './pantallas/barrera-raiz.js';
import { cssDeMarca } from './marca.js';
import { estilosDelProducto } from './estilos.js';

/**
 * Los estilos se inyectan desde codigo, en este orden exacto:
 *   1. la base (tokens neutros y componentes)
 *   2. la marca del Centro (encima, para ganar)
 *   3. lo propio del producto
 *
 * Van en una sola etiqueta y no en tres archivos sueltos porque el orden ES la
 * regla: si la marca cargara antes que la base, el verde del Centro quedaria
 * pisado por el neutro y nadie entenderia por que.
 */
const hoja = document.createElement('style');
hoja.textContent = `${generarCss()}\n${cssDeMarca()}\n${estilosDelProducto()}`;
document.head.appendChild(hoja);

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta <div id="raiz"> en index.html.');

createRoot(raiz).render(
  <StrictMode>
    {/* La barrera va POR FUERA de todo: si algo revienta al arrancar, la
        pantalla dice que paso en vez de quedarse en blanco. */}
    <BarreraDeRaiz>
      <Aplicacion />
    </BarreraDeRaiz>
  </StrictMode>,
);
