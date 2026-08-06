/**
 * @vitest-environment happy-dom
 *
 * LA PESTAÑA DE INVENTARIO.
 *
 * Lo que mas importa: que el motivo sea obligatorio y que no se pueda sacar
 * mas de lo que hay.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AJUSTE_VACIO,
  Movimientos,
  comoSeLeeLaCantidad,
  esSalida,
  validarAjuste,
} from '../../src/productos/movimientos.js';
import type { FichaDeProducto } from '../../src/datos/productos.js';

afterEach(cleanup);

const FICHA: FichaDeProducto = {
  id: 'p1', nombre: 'Producto Uno', descripcion: null, sku: null, codigoBarras: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  precioCentavos: 35000, costoCentavos: 18000, puedeVerCostos: true,
  stockActual: 12, stockMinimo: 3, unidad: 'pieza', ubicacion: null,
  imagenUrl: null, notas: null, activo: true, inventario: 'disponible',
  valorCentavos: 216000, movimientos: [], ventas: [], proveedores: [],
};

function pintar(extra: Partial<React.ComponentProps<typeof Movimientos>> = {}) {
  const props: React.ComponentProps<typeof Movimientos> = {
    ficha: FICHA, permisos: { gestionarInventario: true }, trabajando: false, error: null,
    onAjustar: () => {},
    ...extra,
  };
  return render(<Movimientos {...props} />);
}

describe('lo que NO se deja ajustar', () => {
  it('sin MOTIVO: es exactamente el `update stock = 20` que esto evita', () => {
    expect(validarAjuste({ ...AJUSTE_VACIO, motivo: '   ' }, 12)).toBeTruthy();
  });

  it('cantidad en cero o negativa', () => {
    expect(validarAjuste({ ...AJUSTE_VACIO, cantidad: 0, motivo: 'X' }, 12)).toBeTruthy();
    expect(validarAjuste({ ...AJUSTE_VACIO, cantidad: -2, motivo: 'X' }, 12)).toBeTruthy();
  });

  it('sacar MAS de lo que hay', () => {
    const e = validarAjuste({ tipo: 'merma', cantidad: 50, motivo: 'Se cayó' }, 12);
    expect(e).toContain('Solo hay 12');
  });

  it('una ENTRADA de cualquier tamaño si pasa: no hay tope para lo que llega', () => {
    expect(validarAjuste({ tipo: 'entrada', cantidad: 500, motivo: 'Compra' }, 12)).toBeNull();
  });
});

describe('que tipos sacan piezas', () => {
  it('las salidas son merma, caducado y ajuste de salida', () => {
    expect(esSalida('merma')).toBe(true);
    expect(esSalida('caducado')).toBe(true);
    expect(esSalida('ajuste_salida')).toBe(true);
    expect(esSalida('entrada')).toBe(false);
    expect(esSalida('ajuste_entrada')).toBe(false);
  });
});

describe('la cantidad con signo', () => {
  it('lo que entra lleva mas, lo que sale lleva menos', () => {
    expect(comoSeLeeLaCantidad(5)).toBe('+5');
    expect(comoSeLeeLaCantidad(-2)).toBe('-2');
  });
});

describe('un producto sin movimientos', () => {
  it('lo dice, y explica que queda registrado', () => {
    pintar();
    expect(screen.getByText(/Todavía no hay movimientos/)).toBeTruthy();
  });

  it('enseña stock, minimo y valor', () => {
    pintar();
    expect(screen.getByText('12 pieza')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('el valor sin permiso de costos', () => {
  it('se dice con una raya, no con un cero', () => {
    pintar({ ficha: { ...FICHA, valorCentavos: null } });
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('con movimientos', () => {
  it('cada renglon enseña ANTES y DESPUES', () => {
    // Es lo que permite localizar un descuadre leyendo la lista.
    pintar({
      ficha: {
        ...FICHA,
        movimientos: [{
          id: 'm1', tipo: 'venta', cantidad: -2, stockAntes: 14, stockDespues: 12,
          motivo: 'Venta V-00001', referenciaTipo: 'venta', referenciaId: 'v1',
          quien: 'Dueña', cuando: '2026-08-06T10:00:00Z',
        }],
      },
    });
    expect(screen.getByText('-2')).toBeTruthy();
    expect(screen.getByText(/14 → 12/)).toBeTruthy();
    expect(screen.getByText('Venta')).toBeTruthy();
  });
});

describe('el ajuste', () => {
  it('NO guarda sin motivo, y dice por que', async () => {
    const ajustar = vi.fn();
    pintar({ onAjustar: ajustar });
    await userEvent.click(screen.getByRole('button', { name: /Ajustar inventario/ }));
    await userEvent.click(screen.getByRole('button', { name: /Registrar movimiento/ }));
    expect(ajustar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el motivo del ajuste.')).toBeTruthy();
  });

  it('con motivo si guarda', async () => {
    const ajustar = vi.fn();
    pintar({ onAjustar: ajustar });
    await userEvent.click(screen.getByRole('button', { name: /Ajustar inventario/ }));
    await userEvent.type(screen.getByLabelText(/Motivo/), 'Llegó pedido');
    await userEvent.click(screen.getByRole('button', { name: /Registrar movimiento/ }));
    expect(ajustar.mock.calls[0]?.[0]).toMatchObject({ motivo: 'Llegó pedido' });
  });
});

describe('los permisos', () => {
  it('sin permiso NO se ofrece ajustar', () => {
    pintar({ permisos: { gestionarInventario: false } });
    expect(screen.queryByRole('button', { name: /Ajustar inventario/ })).toBeNull();
  });
});
