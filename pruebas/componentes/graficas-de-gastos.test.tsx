/**
 * @vitest-environment happy-dom
 *
 * LAS DOS GRAFICAS DE GASTOS.
 *
 * Casi todo lo que puede salir mal aqui es aritmetica —el reparto del anillo y
 * el techo de las barras— y se prueba con numeros. Lo que NO se puede probar
 * con numeros es como se ve: eso lo dicen las capturas.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GastosPorCategoria,
  GastosPorDia,
  rebanadas,
  techoDeBarras,
  tonoDeLaRebanada,
} from '../../src/gastos/graficas-de-gastos.js';

afterEach(cleanup);

const CAT = (nombre: string, centavos: number, color: string | null = null) => ({
  id: nombre, nombre, color, centavos, cuantos: 1,
});

describe('el reparto del anillo', () => {
  it('cada rebanada arranca donde termino la anterior', () => {
    // Se acumula en vez de rotar cada una: asi no hay que pelearse con el
    // angulo de inicio del SVG, que empieza a las tres en punto.
    const r = rebanadas([CAT('a', 5000), CAT('b', 5000)], 10000);
    expect(r[0]?.desde).toBe(0);
    expect(r[0]?.largo).toBe(50);
    expect(r[1]?.desde).toBe(50);
  });

  it('las partes suman la vuelta entera', () => {
    const r = rebanadas([CAT('a', 3000), CAT('b', 3000), CAT('c', 4000)], 10000);
    expect(r.reduce((s, x) => s + x.largo, 0)).toBeCloseTo(100);
  });

  it('sin total no hay anillo: no se dibuja uno gris que afirme algo falso', () => {
    // Un anillo completo de un solo tono se lee como "todo es de una
    // categoria", que no es lo que se sabe.
    expect(rebanadas([CAT('a', 0)], 0)).toEqual([]);
  });

  it('respeta el color de la categoria si lo tiene', () => {
    const r = rebanadas([CAT('a', 100, 'var(--neron-marca)')], 100);
    expect(tonoDeLaRebanada(r[0]!, 0)).toBe('var(--neron-marca)');
  });

  it('sin color usa los tonos del Centro, no uno inventado', () => {
    // Un color inventado puede salir ilegible en tema oscuro y nadie lo
    // comprueba; los del Centro ya pasaron la prueba de contraste.
    const r = rebanadas([CAT('a', 100)], 100);
    expect(tonoDeLaRebanada(r[0]!, 0)).toContain('var(--neron-cat-');
  });
});

describe('el techo de las barras', () => {
  it('redondea hacia arriba a un numero legible', () => {
    // Con el maximo crudo, el eje diria cifras como 4,850 que nadie lee.
    expect(techoDeBarras([{ fecha: '01/08/2026', centavos: 4850 }])).toBe(5000);
    expect(techoDeBarras([{ fecha: '01/08/2026', centavos: 12000 }])).toBe(20000);
  });

  it('sin gastos el techo es cero', () => {
    expect(techoDeBarras([{ fecha: '01/08/2026', centavos: 0 }])).toBe(0);
    expect(techoDeBarras([])).toBe(0);
  });
});

describe('los estados vacios', () => {
  it('sin categorias lo dice, no pinta una dona vacia', () => {
    render(<GastosPorCategoria categorias={[]} total={0} cargando={false} />);
    expect(screen.getByText(/Aún no hay gastos en este periodo/)).toBeTruthy();
  });

  it('sin dias con gasto lo dice, no pinta una linea en cero', () => {
    // Una linea plana en cero afirma "gaste cero todos los dias", que no es lo
    // mismo que "no hay datos".
    render(
      <GastosPorDia dias={[{ fecha: '01/08/2026', centavos: 0 }]} cargando={false} />,
    );
    expect(screen.getByText(/Aún no hay gastos registrados/)).toBeTruthy();
  });

  it('mientras carga NO afirma que no hay datos', () => {
    render(<GastosPorCategoria categorias={[]} total={0} cargando />);
    expect(screen.queryByText(/Aún no hay gastos/)).toBeNull();
  });
});

describe('con datos', () => {
  it('el centro del anillo lleva el TOTAL en pesos', () => {
    // Y no la suma de los porcentajes: tres de 33% suman 99 y no cuadraria.
    render(
      <GastosPorCategoria
        categorias={[CAT('Renta', 100000), CAT('Luz', 50000)]}
        total={150000}
        cargando={false}
      />,
    );
    expect(screen.getByText('$1,500.00')).toBeTruthy();
  });

  it('cada dia lleva su cifra exacta para quien no usa puntero', () => {
    render(
      <GastosPorDia
        dias={[{ fecha: '01/08/2026', centavos: 50000 }]}
        cargando={false}
      />,
    );
    expect(screen.getByLabelText('01/08/2026: $500.00')).toBeTruthy();
  });
});
