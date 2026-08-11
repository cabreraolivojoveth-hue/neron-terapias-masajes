/**
 * @vitest-environment happy-dom
 *
 * UNA SECCION QUE SE PLIEGA.
 *
 * Sustituye al boton pelon que decia "+ Información adicional": un `button` sin
 * una sola clase del sistema, al lado de campos y botones que si estaban
 * vestidos. Y era la puerta a la mitad del formulario de un cliente.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Plegable } from '../../src/ui/plegable.js';

afterEach(cleanup);

describe('dice que hay dentro sin abrirlo', () => {
  it('el titulo y el detalle se leen cerrado', () => {
    // "Información adicional" no dice nada; "Ficha de salud — lo que hay que
    // saber antes de una sesion" es lo que decide si vale la pena abrirlo.
    render(
      <Plegable
        titulo="Ficha de salud"
        detalle="Lo que hay que saber antes de una sesión"
        abierto={false}
        onAlternar={() => {}}
      >
        <p>Contenido</p>
      </Plegable>,
    );
    expect(screen.getByText('Ficha de salud')).toBeTruthy();
    expect(screen.getByText('Lo que hay que saber antes de una sesión')).toBeTruthy();
  });
});

describe('se pliega de VERDAD', () => {
  it('cerrado NO pinta su contenido', () => {
    /**
     * No se esconde con CSS: un formulario con veinte campos ocultos manda
     * veinte campos al guardar aunque no se hayan visto, y el foco de teclado se
     * cae dentro de algo invisible.
     */
    render(
      <Plegable titulo="Salud" abierto={false} onAlternar={() => {}}>
        <p>Contenido secreto</p>
      </Plegable>,
    );
    expect(screen.queryByText('Contenido secreto')).toBeNull();
  });

  it('abierto lo pinta', () => {
    render(
      <Plegable titulo="Salud" abierto onAlternar={() => {}}>
        <p>Contenido secreto</p>
      </Plegable>,
    );
    expect(screen.getByText('Contenido secreto')).toBeTruthy();
  });
});

describe('se anuncia a quien no ve la pantalla', () => {
  it('el tirador dice si esta abierto y a QUE controla', () => {
    const { container } = render(
      <Plegable titulo="Salud" abierto onAlternar={() => {}}>
        <p>Contenido</p>
      </Plegable>,
    );
    const tirador = screen.getByRole('button', { name: /Salud/ });
    expect(tirador.getAttribute('aria-expanded')).toBe('true');

    // Lo que controla existe de verdad y lleva ese id: un `aria-controls` que
    // apunta a la nada es peor que no ponerlo.
    const id = tirador.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(id!)}`)).toBeTruthy();
  });

  it('cerrado lo dice tambien', () => {
    render(
      <Plegable titulo="Salud" abierto={false} onAlternar={() => {}}>
        <p>Contenido</p>
      </Plegable>,
    );
    expect(screen.getByRole('button', { name: /Salud/ }).getAttribute('aria-expanded'))
      .toBe('false');
  });
});

describe('avisa cuando se toca', () => {
  it('el tirador entero es el boton, no solo la flecha', async () => {
    // Una flecha de dieciséis pixeles es un blanco imposible en una tableta.
    const alternar = vi.fn();
    render(
      <Plegable titulo="Salud" detalle="Antes de la sesión" abierto={false} onAlternar={alternar}>
        <p>Contenido</p>
      </Plegable>,
    );
    await userEvent.click(screen.getByText('Antes de la sesión'));
    expect(alternar).toHaveBeenCalledTimes(1);
  });
});
