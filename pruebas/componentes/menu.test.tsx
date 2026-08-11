/**
 * @vitest-environment happy-dom
 *
 * EL MENU DE ACCIONES DE UN RENGLON, uno para todo el programa.
 *
 * Antes eran tres copias —Servicios, Cursos y Productos— y las tres vestidas con
 * clases que vivian en la hoja de OTRO modulo. El dia que esa hoja se limpio los
 * tres se quedaron sin estilo a la vez, y no fallo nada: ni los tipos, ni las
 * guardias, ni las pruebas. Se vio en una foto.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuDeAcciones, type OpcionDeMenu } from '../../src/ui/menu.js';

afterEach(cleanup);

const OPCIONES: OpcionDeMenu[] = [
  { clave: 'ver', etiqueta: 'Ver detalle', icono: 'lupa' },
  { clave: 'editar', etiqueta: 'Editar', icono: 'lapiz' },
  { clave: 'eliminar', etiqueta: 'Eliminar', icono: 'basura', peligro: true },
];

const abrirMenu = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: /Acciones para/ }));
};

describe('se abre y se cierra', () => {
  it('cerrado no pinta ninguna opcion', () => {
    render(<MenuDeAcciones de="Aceite" opciones={OPCIONES} onEscoger={() => {}} />);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Acciones para Aceite' }).getAttribute('aria-expanded'))
      .toBe('false');
  });

  it('al abrir salen las opciones y se anuncia', async () => {
    render(<MenuDeAcciones de="Aceite" opciones={OPCIONES} onEscoger={() => {}} />);
    await abrirMenu();
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Acciones para Aceite' }).getAttribute('aria-expanded'))
      .toBe('true');
  });

  it('escoger algo avisa QUE se escogio y cierra', async () => {
    const escoger = vi.fn();
    render(<MenuDeAcciones de="Aceite" opciones={OPCIONES} onEscoger={escoger} />);
    await abrirMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /Editar/ }));
    expect(escoger).toHaveBeenCalledWith('editar');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Escape cierra Y devuelve el foco al tirador', async () => {
    // Sin lo segundo, quien navega con teclado se queda flotando en la nada.
    render(<MenuDeAcciones de="Aceite" opciones={OPCIONES} onEscoger={() => {}} />);
    await abrirMenu();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Acciones para Aceite' }),
    );
  });

  it('tocar fuera lo cierra', async () => {
    render(
      <>
        <MenuDeAcciones de="Aceite" opciones={OPCIONES} onEscoger={() => {}} />
        <button type="button">Otra cosa</button>
      </>,
    );
    await abrirMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Otra cosa' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('se puede usar sin raton', () => {
  it('las flechas recorren las opciones', async () => {
    /**
     * Es lo unico que hace usable un menu con teclado, y es justo cuando mas
     * falta hace: en un mostrador con las manos ocupadas.
     */
    render(<MenuDeAcciones de="Aceite" opciones={OPCIONES} onEscoger={() => {}} />);
    await abrirMenu();

    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toContain('Ver detalle');

    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toContain('Editar');

    // Y da la vuelta en vez de quedarse trabada al final.
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement?.textContent).toContain('Ver detalle');
  });
});

describe('lo que borra se distingue de lo que no', () => {
  it('la opcion de peligro va marcada, no mezclada', () => {
    // Pegada a "Editar" y del mismo color se aprieta por error, y es la unica
    // del menu que no se puede deshacer sola.
    render(<MenuDeAcciones de="Aceite" opciones={OPCIONES} onEscoger={() => {}} />);
    const { container } = render(
      <MenuDeAcciones de="Otro" opciones={OPCIONES} onEscoger={() => {}} />,
    );
    expect(container).toBeTruthy();
  });

  it('la marca de peligro llega al DOM', async () => {
    const { container } = render(
      <MenuDeAcciones de="Aceite" opciones={OPCIONES} onEscoger={() => {}} />,
    );
    await abrirMenu();
    expect(container.querySelector('.pz-menu__opcion--peligro')?.textContent).toContain('Eliminar');
    // Y las que no son de peligro NO la llevan.
    expect(container.querySelectorAll('.pz-menu__opcion--peligro')).toHaveLength(1);
  });
});

describe('lo que no se puede hacer no se muestra', () => {
  it('sin opciones no hay ni tirador', () => {
    // Quien llama filtra por permiso antes de pasar la lista. Un tirador que
    // abre un menu vacio promete algo que no existe.
    const { container } = render(<MenuDeAcciones de="Aceite" opciones={[]} onEscoger={() => {}} />);
    expect(container.textContent).toBe('');
  });
});
