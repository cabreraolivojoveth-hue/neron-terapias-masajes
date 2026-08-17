/**
 * EL HISTORIAL POR MES, SEMANA Y DIA.
 *
 * Todo lo que se comprueba aqui es aritmetica de calendario, que es donde
 * viven los errores que nadie ve hasta que un mes concreto se pinta mal: el
 * mes que empieza en domingo, el que empieza en lunes, el dia que cae en la
 * semana anterior, y la fecha que no existe.
 *
 * Las cifras son inventadas para la prueba; no salen de ningun centro.
 */

import { describe, expect, it } from 'vitest';
import type { DiaConVentas } from '../src/datos/ventas.js';
import {
  comoSeCuentan,
  diaCortoConMes,
  mesesDelHistorial,
} from '../src/ventas/periodos-del-historial.js';

const dia = (fecha: string, cuantas = 1, totalCentavos = 10000): DiaConVentas => ({
  fecha: fecha as DiaConVentas['fecha'],
  cuantas,
  totalCentavos,
});

describe('el árbol se arma de lo más reciente a lo más viejo', () => {
  it('los meses bajan, no suben', () => {
    const meses = mesesDelHistorial([dia('05/06/2026'), dia('12/08/2026'), dia('03/07/2026')]);
    expect(meses.map((m) => m.etiqueta)).toEqual(['Agosto 2026', 'Julio 2026', 'Junio 2026']);
  });

  it('y los días dentro de una semana también', () => {
    const meses = mesesDelHistorial([dia('10/08/2026'), dia('12/08/2026'), dia('11/08/2026')]);
    expect(meses[0]!.semanas[0]!.dias.map((d) => d.fecha)).toEqual([
      '12/08/2026', '11/08/2026', '10/08/2026',
    ]);
  });

  it('un año entero cruza el cambio de año sin mezclarse', () => {
    const meses = mesesDelHistorial([dia('15/01/2026'), dia('15/12/2025')]);
    expect(meses.map((m) => m.etiqueta)).toEqual(['Enero 2026', 'Diciembre 2025']);
  });
});

describe('las semanas se cuentan DENTRO del mes, de lunes a domingo', () => {
  /*
   * Agosto de 2026 empieza en SABADO. Asi que el 1 y el 2 son la semana 1, y
   * el 3 —lunes— abre la semana 2. Es el caso que se pinta mal cuando alguien
   * divide los dias entre siete.
   */
  it('un mes que empieza en sábado deja el día 1 en la semana 1', () => {
    const meses = mesesDelHistorial([dia('01/08/2026')]);
    expect(meses[0]!.semanas[0]!.etiqueta).toBe('Semana 1');
  });

  it('y el primer lunes abre la semana 2', () => {
    const meses = mesesDelHistorial([dia('03/08/2026')]);
    expect(meses[0]!.semanas[0]!.etiqueta).toBe('Semana 2');
  });

  it('un mes que empieza en lunes arranca la semana 1 el día 1', () => {
    // Junio de 2026 empieza en lunes.
    const meses = mesesDelHistorial([dia('01/06/2026'), dia('07/06/2026'), dia('08/06/2026')]);
    const semanas = meses[0]!.semanas;
    // El 8 es el lunes siguiente: semana 2. El 1 y el 7 son la misma semana.
    expect(semanas.map((s) => s.etiqueta)).toEqual(['Semana 2', 'Semana 1']);
  });

  it('el domingo cierra la semana, no abre la siguiente', () => {
    // 09/08/2026 es domingo y 10/08/2026 es lunes.
    const meses = mesesDelHistorial([dia('09/08/2026'), dia('10/08/2026')]);
    expect(meses[0]!.semanas.map((s) => s.etiqueta)).toEqual(['Semana 3', 'Semana 2']);
  });
});

describe('el rango de una semana usa los días que HAY', () => {
  it('se lee de la más vieja a la más nueva aunque la lista baje', () => {
    const meses = mesesDelHistorial([dia('12/08/2026'), dia('10/08/2026')]);
    expect(meses[0]!.semanas[0]!.rango).toBe('10 Ago — 12 Ago');
  });

  it('con un solo día no se inventa un rango de siete', () => {
    // Prometer "10 Ago — 16 Ago" cuando solo hubo ventas el martes hace abrir
    // la semana esperando cinco días y encontrar uno.
    const meses = mesesDelHistorial([dia('11/08/2026')]);
    expect(meses[0]!.semanas[0]!.rango).toBe('11 Ago');
  });
});

describe('las sumas suben de día a semana y de semana a mes', () => {
  it('el mes suma lo de todas sus semanas', () => {
    const meses = mesesDelHistorial([
      dia('03/08/2026', 2, 50000),
      dia('04/08/2026', 1, 30000),
      dia('11/08/2026', 3, 20000),
    ]);
    const agosto = meses[0]!;
    expect(agosto.cuantas).toBe(6);
    expect(agosto.totalCentavos).toBe(100000);
    expect(agosto.semanas.reduce((s, x) => s + x.totalCentavos, 0)).toBe(100000);
  });
});

describe('lo que no se entiende se descarta, no se inventa un mes', () => {
  it('una fecha imposible no crea "Diciembre 1970"', () => {
    // Un renglón en un mes absurdo hace pensar que se corrompió la base.
    const meses = mesesDelHistorial([dia('31/02/2026'), dia('10/08/2026')]);
    expect(meses).toHaveLength(1);
    expect(meses[0]!.etiqueta).toBe('Agosto 2026');
  });

  it('una lista vacía devuelve una lista vacía, sin meses de relleno', () => {
    expect(mesesDelHistorial([])).toEqual([]);
  });
});

describe('los textos sueltos', () => {
  it('el día corto lleva el mes, porque una semana puede cruzarlo', () => {
    expect(diaCortoConMes('10/08/2026')).toBe('10 Ago');
    expect(diaCortoConMes('01/09/2026')).toBe('1 Sep');
  });

  it('se dice la palabra "venta", no solo el número', () => {
    expect(comoSeCuentan(1)).toBe('1 venta');
    expect(comoSeCuentan(0)).toBe('0 ventas');
    expect(comoSeCuentan(12)).toBe('12 ventas');
  });
});
