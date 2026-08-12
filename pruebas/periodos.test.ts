/**
 * LOS PERIODOS DE GASTOS.
 *
 * Todo esto es aritmetica de calendario, que es donde se esconden los errores
 * que solo salen un dia del año: el 31, el 1, el 29 de febrero y el cambio de
 * horario. Se prueba con numeros, sin navegador.
 */

import { describe, expect, it } from 'vitest';
import type { Fecha } from '@neron/base/utils';
import {
  aISO,
  compararGasto,
  deISO,
  lunesDe,
  masDias,
  periodosDeGasto,
  ultimoDelMes,
} from '../src/gastos/periodos.js';

describe('el ida y vuelta de las fechas', () => {
  it('convierte en los dos sentidos sin perder nada', () => {
    expect(aISO('11/08/2026' as Fecha)).toBe('2026-08-11');
    expect(deISO('2026-08-11')).toBe('11/08/2026');
  });

  it('una fecha ilegible no se convierte en una inventada', () => {
    // Devolver "hoy" ante una fecha rota es peor que devolver vacio: el gasto
    // se guardaria en un dia que nadie escogio.
    expect(aISO('' as Fecha)).toBe('');
    expect(deISO('cualquier cosa')).toBe('');
  });
});

describe('moverse por el calendario', () => {
  it('cruza el fin de mes', () => {
    expect(masDias('31/08/2026' as Fecha, 1)).toBe('01/09/2026');
    expect(masDias('01/09/2026' as Fecha, -1)).toBe('31/08/2026');
  });

  it('cruza el fin de año', () => {
    expect(masDias('31/12/2026' as Fecha, 1)).toBe('01/01/2027');
  });

  it('el ultimo dia del mes sale bien en febrero, tambien bisiesto', () => {
    // 2028 es bisiesto; 2026 no. Es el caso que se escribe a mano y sale mal.
    expect(ultimoDelMes('05/02/2026' as Fecha)).toBe('28/02/2026');
    expect(ultimoDelMes('05/02/2028' as Fecha)).toBe('29/02/2028');
    expect(ultimoDelMes('05/04/2026' as Fecha)).toBe('30/04/2026');
    expect(ultimoDelMes('05/12/2026' as Fecha)).toBe('31/12/2026');
  });
});

describe('la semana empieza en lunes', () => {
  it('un miercoles cae en el lunes de esa semana', () => {
    // 12/08/2026 es miercoles.
    expect(lunesDe('12/08/2026' as Fecha)).toBe('10/08/2026');
  });

  it('el lunes se queda donde esta', () => {
    expect(lunesDe('10/08/2026' as Fecha)).toBe('10/08/2026');
  });

  it('el DOMINGO cierra su semana, no abre la siguiente', () => {
    // Es el error clasico: con la semana empezando en domingo, el domingo se
    // va a la semana que viene y el resumen de "esta semana" pierde un dia.
    expect(lunesDe('16/08/2026' as Fecha)).toBe('10/08/2026');
  });
});

describe('los periodos', () => {
  const p = periodosDeGasto('12/08/2026' as Fecha);
  const de = (clave: string) => p.find((x) => x.clave === clave)!;

  it('hoy es un solo dia', () => {
    expect(de('hoy').desde).toBe('12/08/2026');
    expect(de('hoy').hasta).toBe('12/08/2026');
  });

  it('esta semana son siete dias, de lunes a domingo', () => {
    expect(de('estaSemana').desde).toBe('10/08/2026');
    expect(de('estaSemana').hasta).toBe('16/08/2026');
  });

  it('este mes va del 1 al ultimo, no a hoy', () => {
    expect(de('esteMes').desde).toBe('01/08/2026');
    expect(de('esteMes').hasta).toBe('31/08/2026');
  });

  it('el mes anterior toma SU ultimo dia, no el de este mes', () => {
    // Julio tiene 31 y agosto 31, pero de marzo se compara contra febrero:
    // copiar el ultimo dia del mes actual daria el 31 de febrero.
    expect(de('mesAnterior').desde).toBe('01/07/2026');
    expect(de('mesAnterior').hasta).toBe('31/07/2026');
    const marzo = periodosDeGasto('15/03/2026' as Fecha).find((x) => x.clave === 'mesAnterior')!;
    expect(marzo.hasta).toBe('28/02/2026');
  });

  it('este año va de enero a diciembre', () => {
    expect(de('esteAno').desde).toBe('01/01/2026');
    expect(de('esteAno').hasta).toBe('31/12/2026');
  });
});

describe('la comparacion contra el periodo anterior', () => {
  it('sin periodo anterior NO inventa un porcentaje', () => {
    // Dividir entre cero no da cero: no da nada. "+∞%" o "+5000%" es el numero
    // que mas veces se ve mal hecho en un tablero.
    expect(compararGasto(50000, 0)).toBeNull();
  });

  it('gastar MAS sale como algo malo', () => {
    // Es al reves que en ventas, y por eso se decide aqui en vez de copiarlo.
    const c = compararGasto(15000, 10000)!;
    expect(c.sube).toBe(true);
    expect(c.esBueno).toBe(false);
    expect(c.texto).toBe('+50.0%');
  });

  it('gastar MENOS sale como algo bueno', () => {
    const c = compararGasto(5000, 10000)!;
    expect(c.sube).toBe(false);
    expect(c.esBueno).toBe(true);
    expect(c.texto).toBe('-50.0%');
  });

  it('gastar lo mismo no es malo', () => {
    const c = compararGasto(10000, 10000)!;
    expect(c.esBueno).toBe(true);
    expect(c.porcentaje).toBe(0);
  });
});
