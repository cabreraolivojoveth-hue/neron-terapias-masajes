/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarreraDeRaiz } from '../../src/pantallas/barrera-raiz.js';

afterEach(cleanup);

function Revienta({ mensaje }: { readonly mensaje: string }): never {
  throw new Error(mensaje);
}

const callado = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('cuando el arranque revienta', () => {
  it('NUNCA deja la pantalla en blanco', () => {
    // Es el caso real que la origino: un error antes del primer render dejaba
    // la pagina vacia, sin mensaje y sin nada que la persona pudiera hacer.
    const c = callado();
    const { container } = render(
      <BarreraDeRaiz><Revienta mensaje="Invalid URL" /></BarreraDeRaiz>,
    );
    expect(container.textContent?.length ?? 0).toBeGreaterThan(50);
    expect(screen.getByRole('heading', { name: 'El sistema no pudo arrancar' })).toBeDefined();
    c.mockRestore();
  });

  it('muestra el mensaje del error, no uno generico', () => {
    const c = callado();
    render(<BarreraDeRaiz><Revienta mensaje="Invalid URL" /></BarreraDeRaiz>);
    expect(screen.getByText('Invalid URL')).toBeDefined();
    c.mockRestore();
  });

  it('dice QUE hacer, no solo que fallo', () => {
    const c = callado();
    render(<BarreraDeRaiz><Revienta mensaje="x" /></BarreraDeRaiz>);
    expect(screen.getByText(/CONECTAR\.bat/)).toBeDefined();
    c.mockRestore();
  });

  it('no depende de la hoja de estilos que pudo ser la que fallo', () => {
    // Una pantalla de error que necesita los estilos que reventaron es una
    // pantalla en blanco con otro nombre.
    const c = callado();
    const { container } = render(<BarreraDeRaiz><Revienta mensaje="x" /></BarreraDeRaiz>);
    expect(container.querySelector('main')?.getAttribute('style')).toContain('min-height');
    c.mockRestore();
  });
});

describe('cuando todo va bien', () => {
  it('no estorba: pinta lo de adentro tal cual', () => {
    render(<BarreraDeRaiz><p>la aplicacion</p></BarreraDeRaiz>);
    expect(screen.getByText('la aplicacion')).toBeDefined();
    expect(screen.queryByText('El sistema no pudo arrancar')).toBeNull();
  });
});
