/**
 * @vitest-environment happy-dom
 *
 * EL ANILLO DE FORMAS DE PAGO.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MetodosDePago, repartirElAnillo } from '../../src/caja/metodos-de-pago.js';
import type { PorMetodo } from '../../src/datos/caja.js';

afterEach(cleanup);

const METODOS: PorMetodo[] = [
  { metodo: 'efectivo', centavos: 265000, movimientos: 8 },
  { metodo: 'transferencia', centavos: 145000, movimientos: 3 },
  { metodo: 'tarjeta', centavos: 60000, movimientos: 2 },
];
const TOTAL = 470000;

describe('repartir el anillo', () => {
  it('cada rebanada empieza donde termina la anterior', () => {
    // Sin el desplazamiento acumulado, las rebanadas se encimarian y el
    // dibujo diria otra cosa que la lista de al lado.
    const r = repartirElAnillo(METODOS, TOTAL);
    expect(r[0]?.desde).toBe(0);
    expect(r[1]?.desde).toBeCloseTo(r[0]!.largo, 5);
    expect(r[2]?.desde).toBeCloseTo(r[0]!.largo + r[1]!.largo, 5);
  });

  it('las rebanadas suman la vuelta completa, ni mas ni menos', () => {
    const r = repartirElAnillo(METODOS, TOTAL);
    const vuelta = 2 * Math.PI * 42;
    expect(r.reduce((s, x) => s + x.largo, 0)).toBeCloseTo(vuelta, 5);
  });

  it('sin total NO hay anillo: cero rebanadas, no cuatro iguales', () => {
    // Un anillo repartido "para que se vea" es el peor dato posible.
    expect(repartirElAnillo(METODOS, 0)).toEqual([]);
    expect(repartirElAnillo([], 100)).toEqual([]);
  });

  it('un metodo en cero no ocupa rebanada', () => {
    const r = repartirElAnillo([...METODOS, { metodo: 'otro', centavos: 0, movimientos: 0 }], TOTAL);
    expect(r.map((x) => x.metodo)).not.toContain('otro');
  });

  it('los porcentajes salen del total real', () => {
    const r = repartirElAnillo(METODOS, TOTAL);
    expect(r[0]?.porcentaje).toBeCloseTo(56.4, 1);
  });
});

describe('la pantalla', () => {
  it('sin movimientos lo DICE, no pinta un pastel de mentiras', () => {
    render(<MetodosDePago metodos={[]} totalCentavos={0} cargando={false} />);
    expect(screen.getByText(/todavía no ha entrado dinero/i)).toBeTruthy();
  });

  it('cargando NO se ve igual que vacio', () => {
    render(<MetodosDePago metodos={[]} totalCentavos={0} cargando />);
    expect(screen.queryByText(/todavía no ha entrado dinero/i)).toBeNull();
  });

  it('al lado del dibujo va SIEMPRE la lista con nombre, importe y porcentaje', () => {
    // Quien no distingue los colores tiene que leer exactamente lo mismo.
    render(<MetodosDePago metodos={METODOS} totalCentavos={TOTAL} cargando={false} />);
    expect(screen.getByText('Efectivo')).toBeTruthy();
    expect(screen.getByText('Transferencia')).toBeTruthy();
    expect(screen.getByText('56.4%')).toBeTruthy();
  });

  it('el total va en el centro del anillo', () => {
    render(<MetodosDePago metodos={METODOS} totalCentavos={TOTAL} cargando={false} />);
    expect(screen.getByText('Total')).toBeTruthy();
  });
});
