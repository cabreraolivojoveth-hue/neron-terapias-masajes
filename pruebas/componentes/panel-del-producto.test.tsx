/**
 * @vitest-environment happy-dom
 *
 * EL PANEL DE DETALLE DE UN PRODUCTO.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PanelDelProducto,
  loQuePasaAlApagarElProducto,
} from '../../src/productos/panel-del-producto.js';
import type { FichaDeProducto } from '../../src/datos/productos.js';

afterEach(cleanup);

const FICHA: FichaDeProducto = {
  id: 'p1', nombre: 'Producto Uno', descripcion: null, sku: 'SKU1', codigoBarras: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  precioCentavos: 35000, costoCentavos: 18000, puedeVerCostos: true,
  stockActual: 12, stockMinimo: 3, unidad: 'pieza', ubicacion: null,
  imagenUrl: null, notas: null, activo: true, inventario: 'disponible',
  valorCentavos: 216000, movimientos: [], ventas: [], proveedores: [],
};

function pintar(extra: Partial<React.ComponentProps<typeof PanelDelProducto>> = {}) {
  const props: React.ComponentProps<typeof PanelDelProducto> = {
    ficha: FICHA, cargando: false, error: null, permisos: { gestionarInventario: true },
    proveedores: [], trabajando: false, errorDeOperacion: null,
    onEditar: () => {}, onCambiarEstado: () => {}, onCerrar: () => {},
    onAjustar: () => {}, onLigar: () => {}, onDesligar: () => {},
    onNuevoProveedor: () => {}, onAbrirVenta: () => {},
    ...extra,
  };
  return render(<PanelDelProducto {...props} />);
}

describe('apagar un producto', () => {
  it('dice CUANTAS piezas quedan antes de decidir', () => {
    expect(loQuePasaAlApagarElProducto({ ...FICHA, stockActual: 12 })).toContain('Quedan 12 piezas');
    expect(loQuePasaAlApagarElProducto({ ...FICHA, stockActual: 1 })).toContain('Queda 1 pieza');
    expect(loQuePasaAlApagarElProducto({ ...FICHA, stockActual: 0 })).toContain('ninguna pieza');
  });

  it('encender dice otra cosa', () => {
    expect(loQuePasaAlApagarElProducto({ ...FICHA, activo: false })).toContain('Volverá a ofrecerse');
  });

  it('sin ficha no se inventa un aviso', () => {
    expect(loQuePasaAlApagarElProducto(null)).toBe('');
  });
});

describe('el panel sin nada escogido', () => {
  it('invita a tocar un producto', () => {
    pintar({ ficha: null });
    expect(screen.getByText(/Toca un producto/)).toBeTruthy();
  });
});

describe('el costo y los permisos', () => {
  it('SIN permiso, dice por que falta — no enseña una raya muda', () => {
    pintar({ ficha: { ...FICHA, costoCentavos: null, puedeVerCostos: false } });
    expect(screen.getByText('Tu rol no ve costos')).toBeTruthy();
  });

  it('CON permiso enseña el costo y el margen calculado', () => {
    pintar();
    expect(screen.getByText(/49% de margen/)).toBeTruthy();
  });
});

describe('un producto recien creado', () => {
  it('cada hueco DICE que esta vacio', () => {
    pintar();
    expect(screen.getByText('Sin categoría')).toBeTruthy();
    expect(screen.getByText('Sin proveedor')).toBeTruthy();
    expect(screen.getByText('Sin código')).toBeTruthy();
    expect(screen.getByText('Sin descripción')).toBeTruthy();
  });

  it('no aparece ni un dato de la captura de referencia', () => {
    pintar();
    const t = document.body.textContent ?? '';
    for (const d of ['NaN', 'undefined', 'Esencias del Alma', '7501234567890']) {
      expect(t).not.toContain(d);
    }
  });

  it('las cuatro pestañas existen y las vacias lo dicen', async () => {
    pintar();
    await userEvent.click(screen.getByRole('tab', { name: 'Inventario' }));
    expect(screen.getByText(/Todavía no hay movimientos/)).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Ventas' }));
    expect(screen.getByText(/todavía no se ha vendido/)).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Proveedores' }));
    expect(screen.getByText(/todavía no tiene proveedores/)).toBeTruthy();
  });
});

describe('la pestaña de ventas', () => {
  it('enseña el precio HISTORICO, no el del catalogo de hoy', async () => {
    pintar({
      ficha: {
        ...FICHA,
        precioCentavos: 40000,
        ventas: [{
          ventaId: 'v1', folio: 'V-00001', fecha: '2026-07-10',
          cantidad: 2, precioUnitario: 30000, total: 60000,
          clienteId: null, cliente: null,
        }],
      },
    });
    await userEvent.click(screen.getByRole('tab', { name: 'Ventas' }));
    // El catalogo dice 400; la venta sigue diciendo 300.
    expect(screen.getByText(/300/)).toBeTruthy();
    expect(screen.getByText('V-00001')).toBeTruthy();
  });

  it('una venta sin cliente dice "Mostrador", no inventa uno', () => {
    pintar({
      ficha: {
        ...FICHA,
        ventas: [{
          ventaId: 'v1', folio: 'V-00001', fecha: '2026-07-10',
          cantidad: 1, precioUnitario: 30000, total: 30000,
          clienteId: null, cliente: null,
        }],
      },
    });
    return userEvent.click(screen.getByRole('tab', { name: 'Ventas' })).then(() => {
      expect(screen.getByText(/Mostrador/)).toBeTruthy();
    });
  });
});

describe('los permisos', () => {
  it('sin permiso NO se ofrece editar ni apagar', () => {
    pintar({ permisos: { gestionarInventario: false } });
    expect(screen.queryByRole('button', { name: /Editar producto/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desactivar producto/ })).toBeNull();
  });

  it('se puede cerrar', async () => {
    const cerrar = vi.fn();
    pintar({ onCerrar: cerrar });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar el detalle' }));
    expect(cerrar).toHaveBeenCalled();
  });
});

describe('vacio y error son estados DISTINTOS', () => {
  it('un fallo de red no se lee como "producto sin datos"', () => {
    pintar({ ficha: null, error: 'se cayó la conexión' });
    expect(screen.getByText('No pudimos cargar el producto.')).toBeTruthy();
    expect(screen.queryByText(/Toca un producto/)).toBeNull();
  });
});
