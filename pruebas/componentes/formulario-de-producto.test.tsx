/**
 * @vitest-environment happy-dom
 *
 * EL FORMULARIO DE UN PRODUCTO.
 *
 * LO MAS IMPORTANTE: que el stock NO se pueda editar al editar. Cambiar 18 por
 * 20 en un formulario no dice de donde salieron las dos piezas.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FormularioDeProducto,
  PRODUCTO_VACIO,
  validarProducto,
} from '../../src/productos/formulario-de-producto.js';
import type { DatosDeProducto } from '../../src/datos/productos.js';

afterEach(cleanup);

const BUENO: DatosDeProducto = { ...PRODUCTO_VACIO, nombre: 'Producto Uno' };

describe('lo que NO se deja guardar', () => {
  it('un nombre de puros espacios', () => {
    expect(validarProducto({ ...BUENO, nombre: '  ' }, true).nombre).toBeTruthy();
  });

  it('precio o costo negativos', () => {
    expect(validarProducto({ ...BUENO, precioCentavos: -1 }, true).precioCentavos).toBeTruthy();
    expect(validarProducto({ ...BUENO, costoCentavos: -1 }, true).costoCentavos).toBeTruthy();
  });

  it('un minimo negativo', () => {
    expect(validarProducto({ ...BUENO, stockMinimo: -3 }, true).stockMinimo).toBeTruthy();
  });

  it('un stock inicial negativo: no se empieza debiendo piezas', () => {
    expect(validarProducto({ ...BUENO, stockInicial: -5 }, true).stockInicial).toBeTruthy();
  });
});

describe('lo que SI se deja guardar', () => {
  it('un producto minimo', () => {
    expect(validarProducto(BUENO, true)).toEqual({});
  });

  it('uno de CORTESIA, en cero', () => {
    expect(validarProducto({ ...BUENO, precioCentavos: 0, costoCentavos: 0 }, true)).toEqual({});
  });

  it('uno sin stock inicial', () => {
    expect(validarProducto({ ...BUENO, stockInicial: 0 }, true)).toEqual({});
  });
});

describe('el formulario en pantalla', () => {
  function pintar(extra: Partial<React.ComponentProps<typeof FormularioDeProducto>> = {}) {
    const props: React.ComponentProps<typeof FormularioDeProducto> = {
      abierto: true, titulo: 'Nuevo producto', inicial: PRODUCTO_VACIO,
      creando: true, puedeVerCostos: true, categorias: [],
      trabajando: false, error: null,
      onGuardar: () => {}, onCerrar: () => {},
      ...extra,
    };
    return render(<FormularioDeProducto {...props} />);
  }

  it('arranca VACIO, sin un dato de la captura de referencia', () => {
    pintar();
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('');
    const t = document.body.textContent ?? '';
    expect(t).not.toContain('Aceite Esencial');
    expect(t).not.toContain('NaN');
  });

  it('el campo NO pierde el foco al escribir', async () => {
    pintar();
    const campo = screen.getByLabelText(/Nombre/);
    await userEvent.type(campo, 'Aceite Esencial Natural de Lavanda');
    expect((campo as HTMLInputElement).value).toBe('Aceite Esencial Natural de Lavanda');
    expect(document.activeElement).toBe(campo);
  });

  it('AL CREAR se pide stock inicial', () => {
    pintar({ creando: true });
    expect(screen.getByLabelText(/Stock inicial/)).toBeTruthy();
  });

  it('AL EDITAR el stock NO se puede tocar, y se DICE por que', () => {
    // Cambiar 18 por 20 en un formulario no dice de donde salieron las dos.
    pintar({ creando: false, titulo: 'Editar producto' });
    expect(screen.queryByLabelText(/Stock inicial/)).toBeNull();
    expect(screen.getByText(/Ajustar inventario/)).toBeTruthy();
  });

  it('SIN permiso de costos, el campo de costo NO se pinta', () => {
    // Enseñarlo en gris igual lo enseña.
    pintar({ puedeVerCostos: false });
    expect(screen.queryByLabelText(/^Costo/)).toBeNull();
    expect(screen.getByLabelText(/Precio de venta/)).toBeTruthy();
  });

  it('sin permiso de costos NO se borra el costo que ya tenia', async () => {
    const guardar = vi.fn();
    pintar({
      puedeVerCostos: false,
      inicial: { ...PRODUCTO_VACIO, costoCentavos: 18000 },
      onGuardar: guardar,
    });
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Producto');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect((guardar.mock.calls[0]?.[0] as DatosDeProducto).costoCentavos).toBe(18000);
  });

  it('el precio se captura en PESOS y se guarda en CENTAVOS', async () => {
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Producto');
    await userEvent.clear(screen.getByLabelText(/Precio de venta/));
    await userEvent.type(screen.getByLabelText(/Precio de venta/), '350.50');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect((guardar.mock.calls[0]?.[0] as DatosDeProducto).precioCentavos).toBe(35050);
  });

  it('NO guarda sin nombre, y dice por que', async () => {
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el nombre del producto.')).toBeTruthy();
  });
});
