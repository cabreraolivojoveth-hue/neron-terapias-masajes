/**
 * EL ACCESO A DATOS DE PRODUCTOS.
 *
 * Lo que mas se cuida: que `null` en el costo signifique "no puedes verlo" y
 * NO "cuesta cero". Un cero ahi haria creer que el margen es del 100% y que el
 * inventario no vale nada.
 */
import { describe, expect, it } from 'vitest';
import {
  llaveDeLaFichaDelProducto,
  llaveDelResumenDeProductos,
  llaveDeProductos,
  llaveDeProveedores,
  margenDe,
  ordenarProducto,
  ordenarResumenDeProductos,
  COMO_SE_DICE_EL_MOVIMIENTO,
  COMO_SE_DICE_EL_STOCK,
  LO_QUE_TOCA_UN_PRODUCTO,
  RESUMEN_DE_PRODUCTOS_VACIO,
} from '../src/datos/productos.js';

describe('el costo: null NO es cero', () => {
  it('sin permiso, el costo llega null y se CONSERVA null', () => {
    const p = ordenarProducto({ id: 'p1', nombre: 'X', precioCentavos: 35000, costoCentavos: null });
    expect(p.costoCentavos).toBeNull();
    expect(p.precioCentavos).toBe(35000);
  });

  it('un costo de CERO si es cero: hay productos de cortesía', () => {
    const p = ordenarProducto({ id: 'p1', nombre: 'X', costoCentavos: 0 });
    expect(p.costoCentavos).toBe(0);
  });

  it('el valor del inventario conserva el null', () => {
    const r = ordenarResumenDeProductos({ total: 3, valorCentavos: null, bajos: 1, agotados: 0 });
    expect(r.valorCentavos).toBeNull();
    expect(r.total).toBe(3);
  });
});

describe('el margen', () => {
  it('sin costo visible NO se inventa un margen', () => {
    expect(margenDe(35000, null)).toBeNull();
  });

  it('con precio cero NO da NaN ni Infinity', () => {
    // Dividir entre cero acaba impreso como "NaN%" en la pantalla de la dueña.
    expect(margenDe(0, 10000)).toBeNull();
    expect(margenDe(-5, 10000)).toBeNull();
  });

  it('con datos sale el porcentaje sobre el precio de venta', () => {
    expect(margenDe(35000, 18000)).toBe(49);
    expect(margenDe(20000, 10000)).toBe(50);
    expect(margenDe(10000, 10000)).toBe(0);
  });
});

describe('un renglon de la lista', () => {
  it('un campo que no llega NO se inventa', () => {
    const p = ordenarProducto({ id: 'p1', nombre: 'X' });
    expect(p.sku).toBeNull();
    expect(p.codigoBarras).toBeNull();
    expect(p.categoria).toBeNull();
    expect(p.imagenUrl).toBeNull();
    expect(p.unidad).toBe('pieza');
    expect(Number.isFinite(p.stockActual)).toBe(true);
  });

  it('un estado de inventario raro cae en disponible, no rompe la pantalla', () => {
    expect(ordenarProducto({ id: 'p1', nombre: 'X', inventario: 'lo_que_sea' }).inventario)
      .toBe('disponible');
    expect(ordenarProducto({ id: 'p1', nombre: 'X', inventario: 'agotado' }).inventario)
      .toBe('agotado');
  });
});

describe('el resumen', () => {
  it('sin respuesta se queda en ceros, con el valor en null', () => {
    expect(ordenarResumenDeProductos(null)).toEqual(RESUMEN_DE_PRODUCTOS_VACIO);
    expect(ordenarResumenDeProductos('nada').valorCentavos).toBeNull();
  });

  it('un valor de CERO si es cero', () => {
    const r = ordenarResumenDeProductos({ total: 2, valorCentavos: 0, bajos: 0, agotados: 2 });
    expect(r.valorCentavos).toBe(0);
    expect(r.agotados).toBe(2);
  });
});

describe('los textos', () => {
  it('los tres estados de inventario tienen palabra', () => {
    expect(COMO_SE_DICE_EL_STOCK.disponible).toBe('Disponible');
    expect(COMO_SE_DICE_EL_STOCK.bajo).toBe('Stock bajo');
    expect(COMO_SE_DICE_EL_STOCK.agotado).toBe('Agotado');
  });

  it('los ocho tipos de movimiento tienen palabra', () => {
    // Un tipo sin traducir sale como `ajuste_entrada` en la pantalla.
    expect(Object.keys(COMO_SE_DICE_EL_MOVIMIENTO)).toHaveLength(8);
    for (const t of Object.values(COMO_SE_DICE_EL_MOVIMIENTO)) {
      expect(t).not.toContain('_');
    }
  });
});

describe('las llaves de la memoria', () => {
  it('cambian con cada filtro', () => {
    const a = llaveDeProductos('n1', { busqueda: 'aceite' }, 1, 10);
    const b = llaveDeProductos('n1', { estado: 'bajo' }, 1, 10);
    const c = llaveDeProductos('n1', { busqueda: 'aceite' }, 2, 10);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('dos centros NUNCA comparten llave', () => {
    expect(llaveDeProductos('n1', {}, 1, 10)).not.toBe(llaveDeProductos('n2', {}, 1, 10));
    expect(llaveDeProveedores('n1')).not.toBe(llaveDeProveedores('n2'));
  });

  it('todas empiezan por su prefijo, que es lo que las invalida en bloque', () => {
    expect(llaveDeProductos('n1', {}, 1, 10).startsWith('productos')).toBe(true);
    expect(llaveDelResumenDeProductos('n1').startsWith('productos')).toBe(true);
    expect(llaveDeLaFichaDelProducto('p1').startsWith('productos')).toBe(true);
    expect(llaveDeProveedores('n1').startsWith('proveedores')).toBe(true);
  });
});

describe('lo que se refresca al tocar un producto', () => {
  it('incluye VENTAS: el buscador de la venta ofrece productos con su stock', () => {
    // Sin esto, un producto agotado sigue ofreciendose al vender hasta que
    // alguien recargue — y la venta revienta al final.
    expect(LO_QUE_TOCA_UN_PRODUCTO).toContain('ventas');
    expect(LO_QUE_TOCA_UN_PRODUCTO).toContain('productos');
    expect(LO_QUE_TOCA_UN_PRODUCTO).toContain('proveedores');
  });
});
