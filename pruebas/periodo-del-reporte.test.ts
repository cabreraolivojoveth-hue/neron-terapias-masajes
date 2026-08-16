/**
 * EL PERIODO GLOBAL DE REPORTES.
 *
 * Las fechas son donde este proyecto se ha equivocado mas veces, siempre por lo
 * mismo: `new Date("01/08/2026")` interpreta en UTC y a quien esta en Mexico le
 * devuelve el dia anterior. Aqui se comprueba que los rangos caigan donde
 * tienen que caer, incluidos los bordes que es donde falla.
 */

import { describe, expect, it } from 'vitest';
import type { Fecha } from '@neron/base/utils';
import {
  aISO,
  compararConAntes,
  deISO,
  lunesDe,
  masDias,
  periodoEnPalabras,
  periodosDelCentro,
  ultimoDelMes,
} from '../src/reportes/periodo-del-reporte.js';

const f = (s: string): Fecha => s as Fecha;

describe('ida y vuelta del formato', () => {
  it('convierte en los dos sentidos sin perder nada', () => {
    expect(aISO(f('01/08/2026'))).toBe('2026-08-01');
    expect(deISO('2026-08-01')).toBe('01/08/2026');
  });

  it('lo que no se entiende sale vacío, nunca una fecha inventada', () => {
    // Una fecha inventada se cuela en la consulta y devuelve un periodo
    // equivocado sin fallar. Vacia hace que la consulta ni se lance.
    expect(aISO(f('agosto'))).toBe('');
    expect(deISO('')).toBe('');
  });
});

describe('los bordes del calendario', () => {
  it('el último día del mes acierta en los de 30, 31 y en febrero bisiesto', () => {
    expect(ultimoDelMes(f('05/04/2026'))).toBe('30/04/2026');
    expect(ultimoDelMes(f('05/01/2026'))).toBe('31/01/2026');
    expect(ultimoDelMes(f('05/02/2026'))).toBe('28/02/2026');
    expect(ultimoDelMes(f('05/02/2028'))).toBe('29/02/2028');
  });

  it('el lunes de un domingo es el de SU semana, no el del día siguiente', () => {
    // El 2 de agosto de 2026 es domingo. Contarlo como principio de la semana
    // siguiente movia "Esta semana" un dia entero cada domingo.
    expect(lunesDe(f('02/08/2026'))).toBe('27/07/2026');
    expect(lunesDe(f('03/08/2026'))).toBe('03/08/2026');
  });

  it('sumar días cruza de mes y de año', () => {
    expect(masDias(f('31/12/2026'), 1)).toBe('01/01/2027');
    expect(masDias(f('01/01/2027'), -1)).toBe('31/12/2026');
  });
});

describe('los rangos del diseño', () => {
  const periodos = periodosDelCentro(f('15/08/2026'));
  const de = (clave: string) => periodos.find((p) => p.clave === clave);

  it('están los cinco, en el orden del diseño', () => {
    expect(periodos.map((p) => p.clave)).toEqual([
      'hoy', 'ayer', 'estaSemana', 'esteMes', 'mesAnterior',
    ]);
  });

  it('hoy y ayer son un solo día', () => {
    expect(de('hoy')?.desde).toBe('15/08/2026');
    expect(de('hoy')?.hasta).toBe('15/08/2026');
    expect(de('ayer')?.desde).toBe('14/08/2026');
    expect(de('ayer')?.hasta).toBe('14/08/2026');
  });

  it('este mes va del uno al último, no de hoy a hoy', () => {
    expect(de('esteMes')?.desde).toBe('01/08/2026');
    expect(de('esteMes')?.hasta).toBe('31/08/2026');
  });

  it('el mes anterior toma SU último día, no el de este mes', () => {
    // Julio tiene 31 y agosto tambien, pero el error clasico —restar un mes y
    // conservar el dia— parte en cuanto el mes anterior es mas corto.
    expect(de('mesAnterior')?.desde).toBe('01/07/2026');
    expect(de('mesAnterior')?.hasta).toBe('31/07/2026');
    const desdeMarzo = periodosDelCentro(f('31/03/2026'));
    expect(desdeMarzo.find((p) => p.clave === 'mesAnterior')?.hasta).toBe('28/02/2026');
  });
});

describe('el periodo escrito', () => {
  it('un solo día se escribe entero', () => {
    expect(periodoEnPalabras(f('10/07/2025'), f('10/07/2025'))).toBe('10 de julio, 2025');
  });

  it('dentro del mismo mes no repite mes ni año', () => {
    // Es lo que cabe en el boton: repetirlo obliga a cortar justo la parte que
    // distingue los dos extremos.
    expect(periodoEnPalabras(f('01/07/2025'), f('10/07/2025'))).toBe('1 – 10 de julio, 2025');
  });

  it('cruzando meses dice los dos; cruzando años dice los dos años', () => {
    expect(periodoEnPalabras(f('25/06/2025'), f('10/07/2025')))
      .toBe('25 de junio – 10 de julio, 2025');
    expect(periodoEnPalabras(f('25/12/2025'), f('10/01/2026')))
      .toBe('25 de diciembre, 2025 – 10 de enero, 2026');
  });

  it('sin fechas lo dice en vez de escribir basura', () => {
    expect(periodoEnPalabras(f(''), f(''))).toBe('Sin periodo');
  });
});

describe('la comparación contra el periodo anterior', () => {
  it('sin nada antes NO hay porcentaje', () => {
    /**
     * LA REGLA QUE MAS SE VE ROTA EN UN TABLERO. Dividir entre cero no da cero:
     * no da nada. Un "+100%" contra la nada es el numero mas facil de creerse y
     * el mas falso, y en cuanto alguien lo cacha deja de creerse los que si
     * eran ciertos.
     */
    expect(compararConAntes(1000, 0)).toBeNull();
    expect(compararConAntes(1000, -5)).toBeNull();
  });

  it('sube y baja se distinguen, con una cifra decimal', () => {
    expect(compararConAntes(120, 100)?.texto).toBe('↑ 20.0%');
    expect(compararConAntes(120, 100)?.sube).toBe(true);
    expect(compararConAntes(80, 100)?.texto).toBe('↓ 20.0%');
    expect(compararConAntes(80, 100)?.sube).toBe(false);
  });

  it('sin cambio no dice que subió', () => {
    // Un "↑ 0.0%" es una flecha verde afirmando una mejora que no existe.
    expect(compararConAntes(100, 100)?.sube).toBe(false);
    expect(compararConAntes(100, 100)?.texto).toBe('↑ 0.0%');
  });

  it('un valor que no es número no produce un porcentaje', () => {
    expect(compararConAntes(Number.NaN, 100)).toBeNull();
    expect(compararConAntes(100, Number.NaN)).toBeNull();
  });
});
