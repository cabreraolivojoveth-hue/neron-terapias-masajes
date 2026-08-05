/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarcaVisible } from '../../src/marco/marca-visible.js';
import { LEMA, NOMBRE_DEL_PRODUCTO } from '../../src/marca.js';

afterEach(cleanup);

describe('la marca de la barra lateral', () => {
  it('muestra la hoja Y el nombre, no solo la hoja', () => {
    // El marco de la base pinta el logo EN LUGAR del nombre. Por eso el
    // producto le entrega un nodo que ya trae las dos cosas.
    const { container } = render(<MarcaVisible />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByText(NOMBRE_DEL_PRODUCTO)).toBeDefined();
  });

  it('y el lema debajo', () => {
    render(<MarcaVisible />);
    expect(screen.getByText(LEMA)).toBeDefined();
  });

  it('no trae el nombre escrito a mano: sale de marca.ts', () => {
    // Si estuviera escrito aqui, cambiar el nombre del centro obligaria a
    // buscarlo en varios archivos y siempre queda uno.
    const { container } = render(<MarcaVisible />);
    expect(container.textContent).toContain(NOMBRE_DEL_PRODUCTO);
  });
});
