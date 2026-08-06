/**
 * @vitest-environment happy-dom
 *
 * Los iconos. Poco que probar y una cosa importante: que sean decoracion de
 * verdad y tomen el color de quien los contiene.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icono, type NombreDeIcono } from '../../src/ui/iconos.js';

afterEach(cleanup);

const TODOS: NombreDeIcono[] = [
  'calendario', 'dinero', 'paquete', 'birrete', 'campana', 'lupa', 'flecha', 'mas',
  'persona', 'personaMas', 'bolsa', 'recibo', 'salida', 'barras', 'reloj', 'imagen', 'alerta',
];

describe('los iconos', () => {
  it('todos dibujan algo: ninguno sale vacio', () => {
    for (const nombre of TODOS) {
      const { container, unmount } = render(<Icono nombre={nombre} />);
      expect(container.querySelectorAll('path').length, nombre).toBeGreaterThan(0);
      unmount();
    }
  });

  it('son DECORACION: no se le anuncian a quien usa lector de pantalla', () => {
    // Al lado de cada icono siempre hay una palabra escrita. Anunciarlo haria
    // que el lector dijera la misma cosa dos veces seguidas.
    const { container } = render(<Icono nombre="calendario" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
  });

  it('toman el color de quien los contiene, no uno propio', () => {
    // Es lo que los hace funcionar igual en tema claro y en oscuro sin tener
    // dos juegos de archivos que alguien olvida cambiar a la vez.
    const { container } = render(<Icono nombre="dinero" />);
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
  });

  it('el tamaño se puede pedir', () => {
    const { container } = render(<Icono nombre="lupa" lado={32} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('32');
  });
});
