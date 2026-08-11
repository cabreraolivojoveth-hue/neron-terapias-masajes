/**
 * @vitest-environment happy-dom
 *
 * Los dos rankings: servicios y productos.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductosMasVendidos, ServiciosMasVendidos } from '../../src/inicio/rankings.js';

afterEach(cleanup);

describe('servicios mas vendidos', () => {
  it('sin datos lo dice, en vez de dejar el panel en blanco', () => {
    render(<ServiciosMasVendidos servicios={[]} cargando={false} onVerTodos={() => {}} />);
    expect(screen.getByText('Aún no hay suficientes datos.')).toBeTruthy();
  });

  it('mientras carga no dice que no hay datos', () => {
    // "Aun no hay suficientes datos" mientras carga es una afirmacion que
    // todavia no se puede hacer.
    render(<ServiciosMasVendidos servicios={[]} cargando onVerTodos={() => {}} />);
    expect(screen.queryByText('Aún no hay suficientes datos.')).toBeNull();
  });

  it('numera el ranking y dice cuantas sesiones', () => {
    render(
      <ServiciosMasVendidos
        servicios={[
          { id: 's1', nombre: 'Servicio A', sesiones: 28 },
          { id: 's2', nombre: 'Servicio B', sesiones: 1 },
        ]}
        cargando={false}
        onVerTodos={() => {}}
      />,
    );
    expect(screen.getByText('Servicio A')).toBeTruthy();
    expect(screen.getByText('28 sesiones')).toBeTruthy();
    // El singular tambien: "1 sesiones" se lee como un sistema descuidado.
    expect(screen.getByText('1 sesión')).toBeTruthy();
  });

  it('"Ver todos" avisa, no navega por su cuenta', async () => {
    const ver = vi.fn();
    render(<ServiciosMasVendidos servicios={[]} cargando={false} onVerTodos={ver} />);
    await userEvent.click(screen.getByText('Ver todos'));
    expect(ver).toHaveBeenCalled();
  });
});

describe('productos mas vendidos', () => {
  it('sin ventas de productos lo dice con precision', () => {
    render(<ProductosMasVendidos productos={[]} cargando={false} onVerTodos={() => {}} />);
    expect(screen.getByText('Aún no se han registrado ventas de productos.')).toBeTruthy();
  });

  it('usa la foto GUARDADA en el producto, no una de relleno', () => {
    const { container } = render(
      <ProductosMasVendidos
        productos={[{ id: 'p1', nombre: 'Producto A', imagenUrl: 'https://x/a.png', unidades: 3 }]}
        cargando={false}
        onVerTodos={() => {}}
      />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://x/a.png');
  });

  it('sin foto pone un icono, nunca una imagen inventada', () => {
    const { container } = render(
      <ProductosMasVendidos
        productos={[{ id: 'p1', nombre: 'Producto A', imagenUrl: null, unidades: 3 }]}
        cargando={false}
        onVerTodos={() => {}}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.ini-producto__hueco')).toBeTruthy();
  });

  it('si la direccion de la foto ya no responde, cae al icono', () => {
    // El proveedor movio la imagen, se cayo su servidor. Dejar el simbolo de
    // imagen rota se ve como un sistema descompuesto.
    const { container } = render(
      <ProductosMasVendidos
        productos={[{ id: 'p1', nombre: 'Producto A', imagenUrl: 'https://x/roto.png', unidades: 3 }]}
        cargando={false}
        onVerTodos={() => {}}
      />,
    );
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.ini-producto__hueco')).toBeTruthy();
  });

  it('la foto no se le repite al lector de pantalla', () => {
    // El nombre va escrito justo debajo: repetirlo en el alt hace que se diga
    // dos veces seguidas.
    const { container } = render(
      <ProductosMasVendidos
        productos={[{ id: 'p1', nombre: 'Producto A', imagenUrl: 'https://x/a.png', unidades: 3 }]}
        cargando={false}
        onVerTodos={() => {}}
      />,
    );
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });
});

describe('el podio se distingue del resto', () => {
  it('los tres primeros van en solido y del cuarto en adelante no', () => {
    // Un ranking donde las cinco filas pesan igual obliga a leerlas todas para
    // saber cual va ganando, que es lo contrario de lo que hace un tablero.
    const { container } = render(
      <ServiciosMasVendidos
        servicios={[1, 2, 3, 4, 5].map((n) => ({
          id: `s${n}`,
          nombre: `Servicio ${n}`,
          sesiones: 10 - n,
        }))}
        cargando={false}
        onVerTodos={() => {}}
      />,
    );
    expect(container.querySelectorAll('.ini-puesto').length).toBe(5);
    expect(container.querySelectorAll('.ini-puesto--podio').length).toBe(3);
  });
});
