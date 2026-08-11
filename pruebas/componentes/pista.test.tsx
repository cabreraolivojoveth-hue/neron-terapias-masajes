/**
 * @vitest-environment happy-dom
 *
 * LA PISTA — la tira que sustituye a la ficha vacia.
 *
 * Lo que se vigila aqui no es como se ve —eso lo dicen las capturas— sino la
 * CLASE, porque de ella depende que la rejilla colapse a una sola columna. Si
 * alguien la renombra, la lista de Cursos vuelve a perder trescientos cuarenta
 * pixeles y el precio vuelve a salir cortado, sin que nada mas se queje.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Pista } from '../../src/ui/pista.js';
import { piezas } from '../../src/estilo/piezas.js';

afterEach(cleanup);

describe('la pista', () => {
  it('dice lo que se le pide', () => {
    const { getByText } = render(<Pista texto="Toca una fila para ver su ficha." />);
    expect(getByText('Toca una fila para ver su ficha.')).toBeTruthy();
  });

  it('lleva la clase de la que depende que la rejilla colapse', () => {
    // El contrato con la hoja de estilos: `.pz-cuerpo:has(> .pz-pista)`.
    const { container } = render(<Pista texto="lo que sea" />);
    expect(container.querySelector('.pz-pista')).not.toBeNull();
  });

  it('y la hoja de estilos tiene la regla del otro lado', () => {
    const css = piezas();
    expect(css).toMatch(/\.pz-cuerpo:has\(>\s*\.pz-pista\)/);
    expect(css).toContain('.pz-pista {');
  });

  it('el icono es adorno: no lo lee un lector de pantalla', () => {
    const { container } = render(<Pista texto="lo que sea" icono="birrete" />);
    expect(container.querySelector('.pz-pista__icono')?.getAttribute('aria-hidden')).toBe('true');
  });
});
