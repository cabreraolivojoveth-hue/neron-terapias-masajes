/**
 * @vitest-environment happy-dom
 *
 * LOS MOVIMIENTOS AGRUPADOS POR CLASE.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MovimientosDelDia, ordenarPorClase } from '../../src/caja/movimientos-del-dia.js';
import type { PorClase } from '../../src/datos/caja.js';

afterEach(cleanup);

const CLASES: PorClase[] = [
  { clase: 'ingreso', movimientos: 1, centavos: 20000 },
  { clase: 'venta', movimientos: 12, centavos: 485000 },
  { clase: 'retiro', movimientos: 1, centavos: -65000 },
];

describe('el orden', () => {
  it('se leen ventas, retiros e ingresos en ese orden', () => {
    expect(ordenarPorClase(CLASES).map((c) => c.clase)).toEqual(['venta', 'retiro', 'ingreso']);
  });

  it('una clase que no esta en la lista va al final, no se pierde', () => {
    const con = ordenarPorClase([...CLASES, { clase: 'devolucion', movimientos: 1, centavos: 100 }]);
    expect(con).toHaveLength(4);
    expect(con[3]?.clase).toBe('devolucion');
  });
});

function pintar(extra: Partial<React.ComponentProps<typeof MovimientosDelDia>> = {}) {
  const props: React.ComponentProps<typeof MovimientosDelDia> = {
    clases: [], movimientos: 0, netoCentavos: 0, cargando: false, onExportar: () => {},
    ...extra,
  };
  return render(<MovimientosDelDia {...props} />);
}

describe('sin movimientos', () => {
  it('lo dice, y explica que aparecen solos', () => {
    pintar();
    expect(screen.getByText(/todavía no hay movimientos/i)).toBeTruthy();
    expect(screen.getByText(/aparecen solos/i)).toBeTruthy();
  });

  it('el total sale en cero de verdad', () => {
    pintar();
    expect(screen.getByText('Total movimientos')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('exportar esta apagado: no hay nada que bajar', () => {
    pintar();
    expect((screen.getByRole('button', { name: /exportar/i }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});

describe('con movimientos', () => {
  it('cada renglon dice CUANTOS y CUANTO', () => {
    pintar({ clases: CLASES, movimientos: 14, netoCentavos: 440000 });
    expect(screen.getByText('12 movimientos')).toBeTruthy();
    expect(screen.getAllByText('1 movimiento')).toHaveLength(2);
  });

  it('lo que sale lleva el signo ESCRITO, no solo el color', () => {
    // Quien no distingue el rojo del negro tiene que poder saber cual resta.
    pintar({ clases: CLASES, movimientos: 14, netoCentavos: 440000 });
    expect(screen.getByText(/^−.*650/)).toBeTruthy();
  });

  it('el total se explica: es el NETO, con todas las formas de pago', () => {
    pintar({ clases: CLASES, movimientos: 14, netoCentavos: 440000 });
    expect(screen.getByText(/lo que entró menos lo que salió/i)).toBeTruthy();
  });

  it('un neto negativo tambien lleva signo', () => {
    pintar({ clases: CLASES, movimientos: 2, netoCentavos: -45000 });
    expect(screen.getByText(/^−.*450/)).toBeTruthy();
  });

  it('exportar avisa', async () => {
    const exportar = vi.fn();
    pintar({ clases: CLASES, movimientos: 14, netoCentavos: 440000, onExportar: exportar });
    await userEvent.click(screen.getByRole('button', { name: /exportar/i }));
    expect(exportar).toHaveBeenCalled();
  });
});
