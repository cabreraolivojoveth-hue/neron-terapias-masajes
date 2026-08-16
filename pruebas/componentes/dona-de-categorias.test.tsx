/**
 * @vitest-environment happy-dom
 *
 * LA DONA DE INGRESOS POR CATEGORIA.
 *
 * Lo que se vigila: que sin ingresos no se pinte un anillo de un solo tono
 * —que se lee como "todo viene de una categoria"— y que el centro lleve el
 * TOTAL en pesos, porque los porcentajes redondeados no suman cien.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CategoriaDeIngreso } from '../../src/datos/reportes.js';
import {
  DonaDeCategorias,
  nombreDeCategoria,
  rebanadasDelReporte,
} from '../../src/reportes/dona-de-categorias.js';

afterEach(cleanup);

const cat = (clave: string, monto: number): CategoriaDeIngreso => ({ clave, monto, cuantos: 1 });

describe('los nombres de las claves', () => {
  it('la base habla en singular y la pantalla en plural', () => {
    expect(nombreDeCategoria('servicio')).toBe('Servicios');
    expect(nombreDeCategoria('producto')).toBe('Productos');
    expect(nombreDeCategoria('curso')).toBe('Cursos');
  });

  it('una clave desconocida se enseña tal cual, no se traga', () => {
    // Si la base gana un tipo nuevo, es mejor verlo con su nombre crudo que
    // verlo desaparecer del reparto y que los porcentajes no cuadren.
    expect(nombreDeCategoria('membresia')).toBe('membresia');
    expect(nombreDeCategoria('')).toBe('Otros');
  });
});

describe('las rebanadas', () => {
  it('sin total no hay rebanadas', () => {
    expect(rebanadasDelReporte([cat('servicio', 0)], 0)).toEqual([]);
  });

  it('cada una arranca donde termina la anterior y juntas dan la vuelta', () => {
    const r = rebanadasDelReporte([cat('servicio', 50), cat('curso', 30), cat('producto', 20)], 100);
    expect(r[0]?.desde).toBe(0);
    expect(r[1]?.desde).toBeCloseTo(50);
    expect(r[2]?.desde).toBeCloseTo(80);
    expect(r.reduce((s, x) => s + x.largo, 0)).toBeCloseTo(100);
  });

  it('los porcentajes se redondean para verse: pueden no sumar cien', () => {
    /**
     * Tres de 33.3% se pintan "33%" y suman 99. Es correcto y es la razon de
     * que el centro del anillo lleve el TOTAL en pesos: la suma de los
     * porcentajes no cuadraria y quien la hiciera pensaria que falta dinero.
     */
    const r = rebanadasDelReporte(
      [cat('servicio', 100), cat('curso', 100), cat('producto', 100)],
      300,
    );
    expect(r.reduce((s, x) => s + x.parte, 0)).toBe(99);
  });
});

describe('lo que se pinta', () => {
  it('sin ingresos lo DICE en vez de pintar un anillo gris', () => {
    render(<DonaDeCategorias categorias={[]} cargando={false} />);
    expect(screen.getByText(/Todavía no hay ingresos/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Reparto de ingresos/ })).toBeNull();
  });

  it('con ingresos el centro lleva el total en pesos', () => {
    render(
      <DonaDeCategorias
        categorias={[cat('servicio', 150000), cat('curso', 50000)]}
        cargando={false}
      />,
    );
    expect(screen.getByText('$2,000.00')).toBeTruthy();
    expect(screen.getByText('Servicios')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('una categoría en cero no se pinta como un anillo entero', () => {
    // Con total cero, `monto / total` seria una division entre cero.
    render(<DonaDeCategorias categorias={[cat('servicio', 0)]} cargando={false} />);
    expect(screen.getByText(/Todavía no hay ingresos/)).toBeTruthy();
  });
});
