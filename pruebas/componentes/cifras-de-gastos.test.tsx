/**
 * @vitest-environment happy-dom
 *
 * LAS CUATRO CIFRAS DE GASTOS.
 *
 * Lo que se vigila: que `null` no se convierta en cero —que es la afirmacion
 * falsa mas facil de colar en un tablero— y que el signo se lea al reves que
 * en ventas, porque gastar mas es la mala noticia.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResumenDeGastos } from '../../src/datos/gastos.js';
import { CifrasDeGastos, cifrasDeGastos } from '../../src/gastos/cifras-de-gastos.js';

afterEach(cleanup);

function resumen(sobre: Partial<ResumenDeGastos> = {}): ResumenDeGastos {
  return {
    totalCentavos: 0,
    cuantos: 0,
    dias: 31,
    promedioDiarioCentavos: 0,
    mayor: null,
    anteriorCentavos: 0,
    hayComparacion: false,
    porCategoria: [],
    porMetodo: [],
    porDia: [],
    efectivoCentavos: 0,
    ...sobre,
  };
}

describe('mientras carga no se afirma nada', () => {
  it('sin datos pinta rayas, NUNCA ceros', () => {
    // Un $0 mientras carga le dice a quien mira que este mes no ha gastado
    // nada, y todavia no se sabe. Es la clase de error que nadie reporta.
    const c = cifrasDeGastos(null);
    expect(c.every((x) => x.valor === '—')).toBe(true);
    expect(c.every((x) => x.cargando)).toBe(true);
  });

  it('con la base vacia SI dice cero, porque eso si se sabe', () => {
    const c = cifrasDeGastos(resumen());
    expect(c[0]?.valor).toBe('$0.00');
    expect(c[2]?.valor).toBe('0');
  });
});

describe('la comparacion contra el periodo anterior', () => {
  it('sin nada antes, lo dice en vez de inventar un porcentaje', () => {
    const c = cifrasDeGastos(resumen({ totalCentavos: 50000 }));
    expect(c[0]?.pie).toBe('Sin comparación disponible');
    expect(c[0]?.esBueno).toBeNull();
  });

  it('gastar MAS que antes se marca como malo', () => {
    const c = cifrasDeGastos(
      resumen({ totalCentavos: 15000, anteriorCentavos: 10000, hayComparacion: true }),
    );
    expect(c[0]?.pie).toContain('↑');
    expect(c[0]?.pie).toContain('50.0%');
    expect(c[0]?.esBueno).toBe(false);
  });

  it('gastar MENOS se marca como bueno — al reves que en ventas', () => {
    const c = cifrasDeGastos(
      resumen({ totalCentavos: 5000, anteriorCentavos: 10000, hayComparacion: true }),
    );
    expect(c[0]?.esBueno).toBe(true);
  });
});

describe('el mayor gasto', () => {
  it('sin gastos dice "Sin datos", no cero', () => {
    // Un "$0.00" ahi se leeria como que hubo un gasto de cero pesos.
    expect(cifrasDeGastos(resumen())[3]?.valor).toBe('Sin datos');
  });

  it('con gastos dice cuanto Y de que', () => {
    const c = cifrasDeGastos(
      resumen({ mayor: { concepto: 'Renta del local', centavos: 1000000 } }),
    );
    expect(c[3]?.valor).toBe('$10,000.00');
    expect(c[3]?.pie).toBe('Renta del local');
  });
});

describe('el promedio', () => {
  it('dice entre cuantos dias se saco', () => {
    // Sin decirlo, nadie sabe si es "por gasto" o "por dia", que son dos
    // numeros distintos y los dos legitimos.
    const c = cifrasDeGastos(resumen({ dias: 31, promedioDiarioCentavos: 1000 }));
    expect(c[1]?.pie).toContain('31 días');
  });
});

describe('se pinta', () => {
  it('las cuatro tarjetas salen', () => {
    render(<CifrasDeGastos resumen={resumen()} />);
    expect(screen.getByText('Total gastos')).toBeTruthy();
    expect(screen.getByText('Gasto promedio diario')).toBeTruthy();
    expect(screen.getByText('Gastos este periodo')).toBeTruthy();
    expect(screen.getByText('Mayor gasto')).toBeTruthy();
  });
});
