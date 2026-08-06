/**
 * @vitest-environment happy-dom
 *
 * LAS CUATRO TARJETAS DE INVENTARIO.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CifrasDeInventario, cifrasDeInventario } from '../../src/productos/cifras-de-inventario.js';
import type { ResumenDeProductos } from '../../src/datos/productos.js';

afterEach(cleanup);

const VACIO: ResumenDeProductos = { total: 0, valorCentavos: 0, bajos: 0, agotados: 0 };

describe('un centro sin un solo producto', () => {
  it('las cuatro tarjetas salen en cero', () => {
    const c = cifrasDeInventario(VACIO);
    expect(c).toHaveLength(4);
    expect(c[0]?.valor).toBe('0');
    expect(c[2]?.valor).toBe('0');
    expect(c[3]?.valor).toBe('0');
  });

  it('no aparece ni una cifra de la captura de referencia', () => {
    render(<CifrasDeInventario resumen={VACIO} />);
    const texto = document.body.textContent ?? '';
    for (const delDiseño of ['128', '24,850', 'NaN', 'undefined']) {
      expect(texto).not.toContain(delDiseño);
    }
  });

  it('el pie explica el cero en vez de dejarlo mudo', () => {
    const c = cifrasDeInventario(VACIO);
    expect(c[0]?.pie).toBe('Sin productos registrados');
    expect(c[2]?.pie).toBe('Todo por encima del mínimo');
    expect(c[3]?.pie).toBe('Nada agotado');
  });
});

describe('el costo y los permisos', () => {
  it('sin permiso, el valor DICE que no se ve — no enseña un cero', () => {
    // Un cero se leeria como "el inventario no vale nada", que es mentira.
    const c = cifrasDeInventario({ total: 8, valorCentavos: null, bajos: 1, agotados: 0 });
    expect(c[1]?.valor).toBe('—');
    expect(c[1]?.pie).toBe('Tu rol no ve costos');
  });

  it('con permiso se enseña el valor, calculado con COSTO', () => {
    const c = cifrasDeInventario({ total: 8, valorCentavos: 100000, bajos: 0, agotados: 0 });
    expect(c[1]?.valor).toContain('1,000');
    expect(c[1]?.pie).toBe('Costo total');
  });
});

describe('mientras carga', () => {
  it('NO se enseña un cero: se dice que esta cargando', () => {
    const c = cifrasDeInventario(null);
    expect(c.every((x) => x.valor === '—')).toBe(true);
    expect(c.every((x) => x.cargando)).toBe(true);
  });

  it('el lector de pantalla se entera', () => {
    render(<CifrasDeInventario resumen={null} />);
    expect(screen.getAllByLabelText(/cargando/i).length).toBe(4);
  });
});
