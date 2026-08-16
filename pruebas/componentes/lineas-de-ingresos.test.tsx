/**
 * @vitest-environment happy-dom
 *
 * LA GRAFICA DE INGRESOS VS. EGRESOS.
 *
 * Lo que se vigila: que sin datos NO se dibuje una raya plana en cero —que
 * afirma "no entro nada ningun dia" en vez de decir que no hay con que
 * dibujar— y que un solo punto no produzca coordenadas invalidas, que es lo que
 * pasaba al escoger el periodo "Hoy".
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Fecha } from '@neron/base/utils';
import type { PuntoDeLaSerie } from '../../src/datos/reportes.js';
import {
  LineasDeIngresos,
  puntosDeLaLinea,
  rotuloDelPunto,
  techoDeLaSerie,
} from '../../src/reportes/lineas-de-ingresos.js';

afterEach(cleanup);

const punto = (p: string, ingresos: number, egresos: number): PuntoDeLaSerie => ({
  punto: p as Fecha, ingresos, egresos,
});

describe('el techo de la gráfica', () => {
  it('sin movimientos es cero, y eso apaga el dibujo', () => {
    expect(techoDeLaSerie([])).toBe(0);
    expect(techoDeLaSerie([punto('01/08/2026', 0, 0)])).toBe(0);
  });

  it('se redondea hacia arriba a una cifra que se lee de un vistazo', () => {
    // Sin redondear, el eje sale con rotulos como "$4,873" que nadie compara.
    expect(techoDeLaSerie([punto('01/08/2026', 487300, 0)])).toBe(500000);
    expect(techoDeLaSerie([punto('01/08/2026', 150000, 0)])).toBe(200000);
  });

  it('mira las DOS series, no solo los ingresos', () => {
    // Un mes con mas egresos que ingresos existe, y con el techo puesto solo
    // por ingresos la linea roja se saldria del lienzo sin avisar.
    expect(techoDeLaSerie([punto('01/08/2026', 10000, 90000)])).toBe(100000);
  });
});

describe('las coordenadas', () => {
  it('un solo punto se pinta en medio, no en NaN', () => {
    /**
     * Con `i / (largo - 1)` y largo uno, la division es entre cero: el punto
     * salia en NaN, o sea, no salia — y la grafica aparecia vacia sin decir por
     * que. Pasa cada vez que alguien escoge "Hoy".
     */
    const [p] = puntosDeLaLinea([50000], 100000);
    expect(Number.isFinite(p?.x)).toBe(true);
    expect(Number.isFinite(p?.y)).toBe(true);
  });

  it('un valor más alto queda MÁS ARRIBA', () => {
    // En SVG la y crece hacia abajo: es el error de signo clasico y deja la
    // grafica boca abajo sin que nada falle.
    const [bajo, alto] = puntosDeLaLinea([10000, 90000], 100000);
    expect((alto?.y ?? 0) < (bajo?.y ?? 0)).toBe(true);
  });

  it('con techo cero no divide entre cero', () => {
    const [p] = puntosDeLaLinea([0], 0);
    expect(Number.isFinite(p?.y)).toBe(true);
  });
});

describe('los rótulos del eje', () => {
  it('por día lleva día y mes; por mes solo el mes', () => {
    expect(rotuloDelPunto('05/08/2026', 'dia')).toBe('5 Ago');
    expect(rotuloDelPunto('01/08/2026', 'mes')).toBe('Ago');
  });

  it('una fecha que no se entiende no escribe basura', () => {
    expect(rotuloDelPunto('', 'dia')).toBe('');
  });
});

describe('lo que se pinta', () => {
  it('sin movimientos lo DICE en vez de dibujar una raya en cero', () => {
    render(<LineasDeIngresos serie={[]} paso="dia" cargando={false} />);
    expect(screen.getByText(/Todavía no hay movimientos/)).toBeTruthy();
  });

  it('mientras carga tampoco dibuja', () => {
    render(<LineasDeIngresos serie={[]} paso="dia" cargando />);
    expect(screen.queryByText(/Todavía no hay movimientos/)).toBeNull();
  });

  it('con datos dibuja y dice el paso que decidió la base', () => {
    render(
      <LineasDeIngresos
        serie={[punto('01/08/2026', 10000, 5000), punto('02/08/2026', 20000, 8000)]}
        paso="mes"
        cargando={false}
      />,
    );
    expect(screen.getByText('Mensual')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Ingresos y egresos/ })).toBeTruthy();
  });
});
