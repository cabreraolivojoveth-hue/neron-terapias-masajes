/**
 * @vitest-environment happy-dom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Hoja } from '../../src/marco/hoja.js';

afterEach(cleanup);

describe('la hoja del centro', () => {
  it('esta escondida del lector de pantalla: es decoracion', () => {
    // El nombre del centro va escrito al lado. Anunciar tambien la hoja solo
    // estorbaria a quien navega con lector.
    const { container } = render(<Hoja />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('toma el color de la marca, no uno propio', () => {
    // Asi funciona igual en tema claro y en oscuro sin tener dos archivos que
    // despues alguien olvida cambiar a la vez.
    const { container } = render(<Hoja />);
    const relleno = container.querySelector('path')?.getAttribute('fill');
    expect(relleno).toBe('currentColor');
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('la version pequeña es mas chica', () => {
    const grande = render(<Hoja />).container.querySelector('svg')?.getAttribute('width');
    cleanup();
    const chica = render(<Hoja pequena />).container.querySelector('svg')?.getAttribute('width');
    expect(Number(chica)).toBeLessThan(Number(grande));
  });

  it('no se puede enfocar con el tabulador', () => {
    // En Internet Explorer y algunos navegadores viejos los SVG entran en el
    // recorrido del tabulador y aparece una parada que no lleva a nada.
    const { container } = render(<Hoja />);
    expect(container.querySelector('svg')?.getAttribute('focusable')).toBe('false');
  });
});
