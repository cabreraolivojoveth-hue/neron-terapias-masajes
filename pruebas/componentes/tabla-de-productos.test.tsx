/**
 * @vitest-environment happy-dom
 *
 * LA LISTA DE PRODUCTOS.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TablaDeProductos,
  accionesPara,
  textoDelCosto,
} from '../../src/productos/tabla-de-productos.js';
import type { ProductoEnLista } from '../../src/datos/productos.js';

afterEach(cleanup);

const PRODUCTO: ProductoEnLista = {
  id: 'p1', nombre: 'Producto Uno', sku: 'SKU1', codigoBarras: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  precioCentavos: 35000, costoCentavos: 18000,
  stockActual: 12, stockMinimo: 3, unidad: 'pieza',
  imagenUrl: null, ubicacion: null, inventario: 'disponible', activo: true,
};

function pintar(extra: Partial<React.ComponentProps<typeof TablaDeProductos>> = {}) {
  const props: React.ComponentProps<typeof TablaDeProductos> = {
    productos: [], total: 0, pagina: 1, porPagina: 10,
    busqueda: '', pestana: '', categoriaId: '', proveedorId: '', soloInactivos: false,
    categorias: [], proveedores: [], filtrosAbiertos: false, seleccionado: null,
    permisos: { gestionarInventario: true }, cargando: false, error: null,
    onBuscar: () => {}, onPestana: () => {}, onCategoria: () => {}, onProveedor: () => {},
    onSoloInactivos: () => {}, onFiltros: () => {}, onPagina: () => {}, onPorPagina: () => {},
    onAccion: () => {}, onNuevo: () => {}, onReintentar: () => {},
    ...extra,
  };
  return render(<TablaDeProductos {...props} />);
}

describe('el costo sin permiso', () => {
  it('se pinta con una raya, NO con un cero', () => {
    // Cero haria creer que el margen es del 100%.
    expect(textoDelCosto(null)).toBe('—');
  });

  it('un costo de cero SI se pinta como cero', () => {
    expect(textoDelCosto(0)).toContain('0');
  });
});

describe('las acciones', () => {
  it('sin permiso solo queda ver', () => {
    expect(accionesPara({ gestionarInventario: false }, PRODUCTO).map((a) => a.clave))
      .toEqual(['ver']);
  });

  it('con permiso salen las cuatro, y el estado se voltea', () => {
    const con = accionesPara({ gestionarInventario: true }, PRODUCTO);
    expect(con.map((a) => a.clave)).toEqual(['ver', 'editar', 'ajustar', 'estado']);
    expect(con.find((a) => a.clave === 'estado')?.etiqueta).toBe('Desactivar');
    const apagado = accionesPara({ gestionarInventario: true }, { ...PRODUCTO, activo: false });
    expect(apagado.find((a) => a.clave === 'estado')?.etiqueta).toBe('Activar');
  });
});

describe('un almacen vacio', () => {
  it('lo dice, y ofrece crear el primero', () => {
    pintar();
    expect(screen.getByText('No hay productos registrados')).toBeTruthy();
    expect(screen.getByText('Mostrando 0 a 0 de 0 productos')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Nuevo producto/ }).length).toBe(1);
  });

  it('no aparece ni un nombre de la captura de referencia', () => {
    pintar();
    const t = document.body.textContent ?? '';
    for (const d of ['Aceite Esencial de Lavanda', 'Amatista', 'AELV15', '$350']) {
      expect(t).not.toContain(d);
    }
  });

  it('con filtros dice OTRA cosa', () => {
    pintar({ busqueda: 'aceite' });
    expect(screen.getByText('Ningún producto coincide')).toBeTruthy();
  });
});

describe('vacio y error son estados DISTINTOS', () => {
  it('un fallo de red no se lee como "no hay productos"', () => {
    pintar({ error: 'se cayó la conexión' });
    expect(screen.getByText('No pudimos cargar los productos.')).toBeTruthy();
    expect(screen.queryByText('No hay productos registrados')).toBeNull();
  });

  it('mientras carga no se dice que no hay nada', () => {
    pintar({ cargando: true });
    expect(screen.getByText('Cargando los productos')).toBeTruthy();
    expect(screen.queryByText('No hay productos registrados')).toBeNull();
  });
});

describe('el renglon', () => {
  it('sin SKU no se inventa uno', () => {
    pintar({ productos: [{ ...PRODUCTO, sku: null }], total: 1 });
    expect(screen.queryByText(/SKU:/)).toBeNull();
  });

  it('el stock bajo se marca con color Y palabra', () => {
    const { container } = pintar({
      productos: [{ ...PRODUCTO, stockActual: 2, inventario: 'bajo' }], total: 1,
    });
    expect(container.querySelector('.prd-stock--bajo')).toBeTruthy();
    expect(screen.getAllByText('Stock bajo').length).toBeGreaterThan(0);
  });

  it('DESACTIVADO es otra cosa que AGOTADO, y se dice aparte', () => {
    // Un producto activo con cero piezas esta agotado, no inactivo.
    pintar({
      productos: [{ ...PRODUCTO, activo: false, stockActual: 5, inventario: 'disponible' }],
      total: 1,
    });
    expect(screen.getAllByText('Disponible').length).toBeGreaterThan(0);
    expect(screen.getByText('Desactivado')).toBeTruthy();
  });
});

describe('las pestañas', () => {
  it('son cuatro, como en el diseño, y filtran de verdad', async () => {
    const cambiar = vi.fn();
    pintar({ onPestana: cambiar });
    for (const p of ['Todos', 'Disponibles', 'Stock bajo', 'Agotados']) {
      expect(screen.getByRole('tab', { name: p })).toBeTruthy();
    }
    await userEvent.click(screen.getByRole('tab', { name: 'Agotados' }));
    expect(cambiar).toHaveBeenCalledWith('agotado');
  });
});

describe('el buscador', () => {
  it('dice que busca por SKU y codigo de barras, no solo por nombre', () => {
    pintar({ filtrosAbiertos: true, busqueda: 'aceite' });
    const campo = screen.getByLabelText(/Buscar producto/) as HTMLInputElement;
    expect(campo.value).toBe('aceite');
    expect(campo.getAttribute('aria-label')).toContain('SKU');
  });
});

describe('el menu de acciones', () => {
  it('se cierra con Escape', async () => {
    pintar({ productos: [PRODUCTO], total: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Producto Uno' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
