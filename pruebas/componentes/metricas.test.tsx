/**
 * @vitest-environment happy-dom
 *
 * LAS CUATRO CIFRAS DE REPORTES.
 *
 * Lo que se vigila es lo mismo que en Gastos y por lo mismo: que `null` no se
 * convierta en cero —la afirmacion falsa mas facil de colar en un tablero— y
 * que sin periodo anterior se diga, en vez de inventar un porcentaje contra la
 * nada.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ordenarReporte, type Reporte } from '../../src/datos/reportes.js';
import { MetricasDelReporte, cifrasDelReporte } from '../../src/reportes/metricas.js';

afterEach(cleanup);

const reporte = (parte: Record<string, unknown>): Reporte => ordenarReporte(parte);

describe('mientras carga no se afirma nada', () => {
  it('sin datos pinta rayas, NUNCA ceros', () => {
    const c = cifrasDelReporte(null);
    expect(c.every((x) => x.valor === '—')).toBe(true);
    expect(c.every((x) => x.cargando)).toBe(true);
  });

  it('con el centro vacío SÍ dice cero, porque eso ya se sabe', () => {
    // La diferencia importa: cero es una respuesta, la raya es "todavia no se".
    const c = cifrasDelReporte(reporte({}));
    expect(c[0]?.valor).toBe('$0.00');
    expect(c[1]?.valor).toBe('0');
  });
});

describe('la comparación contra el periodo anterior', () => {
  it('sin nada antes lo DICE en vez de inventar un porcentaje', () => {
    const c = cifrasDelReporte(reporte({ metricas: { ingresos: 50000 } }));
    expect(c[0]?.pie).toBe('Sin comparación disponible');
    expect(c[0]?.sube).toBeNull();
  });

  it('con periodo anterior escribe la flecha y el porcentaje', () => {
    const c = cifrasDelReporte(
      reporte({
        hayComparacion: true,
        metricas: { ingresos: 120000, ingresosAntes: 100000 },
      }),
    );
    expect(c[0]?.pie).toBe('↑ 20.0% vs. período anterior');
    expect(c[0]?.sube).toBe(true);
  });

  it('cada métrica se compara con LA SUYA, no con la del vecino', () => {
    /**
     * Pasa de verdad: un centro que el mes pasado vendio pero no dio de alta ni
     * un cliente. Si la comparacion se decidiera una sola vez para las cuatro,
     * clientes saldria con un porcentaje inventado contra cero.
     */
    const c = cifrasDelReporte(
      reporte({
        hayComparacion: true,
        metricas: {
          ingresos: 120000, ingresosAntes: 100000,
          clientes: 8, clientesAntes: 0,
        },
      }),
    );
    expect(c[0]?.pie).toContain('vs. período anterior');
    expect(c[2]?.pie).toBe('Sin comparación disponible');
  });
});

describe('lo que se pinta', () => {
  it('están las cuatro del diseño, con su etiqueta', () => {
    render(<MetricasDelReporte reporte={reporte({})} />);
    expect(screen.getByText('Ingresos totales')).toBeTruthy();
    expect(screen.getByText('Ventas realizadas')).toBeTruthy();
    expect(screen.getByText('Clientes atendidos')).toBeTruthy();
    expect(screen.getByText('Servicios realizados')).toBeTruthy();
  });

  it('mientras carga se anuncia a quien no ve la pantalla', () => {
    // Una raya sola no dice nada a un lector de pantalla: podria ser un guion.
    render(<MetricasDelReporte reporte={null} />);
    expect(screen.getByLabelText('Ingresos totales: cargando')).toBeTruthy();
  });

  it('"Sin comparación" NO se pinta de color de buena noticia', () => {
    const { container } = render(<MetricasDelReporte reporte={reporte({ metricas: { ingresos: 1 } })} />);
    const pies = [...container.querySelectorAll('.pz-cifra__pie')];
    expect(pies.every((p) => !p.classList.contains('rep-pie--sube'))).toBe(true);
  });
});
