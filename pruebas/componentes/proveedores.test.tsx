/**
 * @vitest-environment happy-dom
 *
 * LA PESTAÑA DE PROVEEDORES.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Proveedores, costoEnPesos, elPreferido } from '../../src/productos/proveedores.js';
import type { FichaDeProducto, ProveedorDelProducto } from '../../src/datos/productos.js';

afterEach(cleanup);

const prov = (p: Partial<ProveedorDelProducto> & { id: string }): ProveedorDelProducto => ({
  proveedorId: 'pr' + p.id, nombre: 'Proveedor ' + p.id, telefono: null, correo: null,
  codigo: null, preferido: false, costoCentavos: null, ...p,
});

const FICHA: FichaDeProducto = {
  id: 'p1', nombre: 'Producto Uno', descripcion: null, sku: null, codigoBarras: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  precioCentavos: 35000, costoCentavos: 18000, puedeVerCostos: true,
  stockActual: 12, stockMinimo: 3, unidad: 'pieza', ubicacion: null,
  imagenUrl: null, notas: null, activo: true, inventario: 'disponible',
  valorCentavos: 216000, movimientos: [], ventas: [], proveedores: [],
};

function pintar(extra: Partial<React.ComponentProps<typeof Proveedores>> = {}) {
  const props: React.ComponentProps<typeof Proveedores> = {
    ficha: FICHA, proveedores: [], permisos: { gestionarInventario: true },
    trabajando: false, error: null,
    onLigar: () => {}, onDesligar: () => {}, onNuevoProveedor: () => {},
    ...extra,
  };
  return render(<Proveedores {...props} />);
}

describe('el proveedor principal', () => {
  it('sale el marcado como preferido', () => {
    const lista = [prov({ id: '1' }), prov({ id: '2', preferido: true })];
    expect(elPreferido(lista)?.id).toBe('2');
  });

  it('sin ninguno marcado devuelve null, no el primero', () => {
    expect(elPreferido([prov({ id: '1' })])).toBeNull();
  });
});

describe('el costo en pesos', () => {
  it('null se queda vacio, no en cero', () => {
    expect(costoEnPesos(null)).toBe('');
    expect(costoEnPesos(18000)).toBe('180');
  });
});

describe('un producto sin proveedores', () => {
  it('lo dice en vez de dejar la pestaña en blanco', () => {
    pintar();
    expect(screen.getByText(/todavía no tiene proveedores/)).toBeTruthy();
  });

  it('no aparece ni un proveedor de la captura de referencia', () => {
    pintar();
    expect(document.body.textContent ?? '').not.toContain('Esencias del Alma');
  });
});

describe('con proveedores', () => {
  it('el principal se marca', () => {
    pintar({ ficha: { ...FICHA, proveedores: [prov({ id: '1', preferido: true })] } });
    expect(screen.getByText('Principal')).toBeTruthy();
  });

  it('sin costo registrado lo DICE, no enseña cero', () => {
    pintar({ ficha: { ...FICHA, proveedores: [prov({ id: '1' })] } });
    expect(screen.getByText(/Sin costo registrado/)).toBeTruthy();
  });

  it('quitar PIDE confirmacion', async () => {
    const desligar = vi.fn();
    pintar({ ficha: { ...FICHA, proveedores: [prov({ id: '1' })] }, onDesligar: desligar });
    await userEvent.click(screen.getByRole('button', { name: /Quitar/ }));
    expect(desligar).not.toHaveBeenCalled();
    expect(screen.getByText(/no cambian/)).toBeTruthy();
  });
});

describe('la deuda que NO se finge', () => {
  it('se DICE que no hay modulo de compras, en vez de simular uno', () => {
    pintar();
    expect(screen.getByText(/todavía no existe en el sistema/)).toBeTruthy();
  });
});

describe('los permisos', () => {
  it('sin permiso NO se ofrece ligar ni quitar', () => {
    pintar({
      ficha: { ...FICHA, proveedores: [prov({ id: '1' })] },
      permisos: { gestionarInventario: false },
    });
    expect(screen.queryByRole('button', { name: /Ligar un proveedor/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull();
  });
});
