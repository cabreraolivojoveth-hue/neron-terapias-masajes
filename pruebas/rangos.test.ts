import { describe, expect, it } from 'vitest';
import { diasDe, esDelMes, esHoy, mover, nombreDelDia, rangoDe, tituloDe } from '../src/agenda/rangos.js';

// Viernes 10 de julio de 2026.
const VIERNES = '10/07/2026';

describe('que dias se le piden al servidor', () => {
  it('la vista de dia pide un solo dia', () => {
    expect(rangoDe('dia', VIERNES)).toEqual({ desde: VIERNES, hasta: VIERNES });
  });

  it('la semana va de lunes a domingo', () => {
    expect(rangoDe('semana', VIERNES)).toEqual({ desde: '06/07/2026', hasta: '12/07/2026' });
  });

  it('el mes pide TAMBIEN los dias de relleno de la cuadricula', () => {
    // Una cuadricula de mes muestra los ultimos dias del mes anterior. Si solo
    // se pidiera del 1 al 31, esas casillas saldrian vacias aunque tengan
    // citas — y nadie relaciona eso con un rango mal pedido.
    const r = rangoDe('mes', VIERNES);
    expect(r.desde).toBe('29/06/2026');
    expect(r.hasta).toBe('02/08/2026');
  });

  it('la cuadricula del mes siempre trae semanas completas', () => {
    for (const f of ['01/01/2026', '15/02/2026', '31/03/2026', '01/11/2027']) {
      const dias = diasDe('mes', f);
      expect(dias.length % 7, f).toBe(0);
      expect(nombreDelDia(dias[0]!), f).toBe('lunes');
      expect(nombreDelDia(dias[dias.length - 1]!), f).toBe('domingo');
    }
  });

  it('la semana siempre son siete dias', () => {
    expect(diasDe('semana', VIERNES)).toHaveLength(7);
  });
});

describe('navegar', () => {
  it('en dia se mueve un dia', () => {
    expect(mover('dia', VIERNES, 1)).toBe('11/07/2026');
    expect(mover('dia', VIERNES, -1)).toBe('09/07/2026');
  });

  it('en semana se mueve siete dias', () => {
    expect(mover('semana', VIERNES, 1)).toBe('17/07/2026');
    expect(mover('semana', VIERNES, -1)).toBe('03/07/2026');
  });

  it('en mes salta al dia 1, no al mismo dia del mes siguiente', () => {
    // Partiendo del 31 de marzo, moverse "al mes siguiente" conservando el dia
    // daria 30 de abril, y otra vez daria 30 de mayo: la navegacion se siente
    // rota. Saltando al dia 1 siempre avanza un mes limpio.
    expect(mover('mes', '31/03/2026', 1)).toBe('01/04/2026');
    expect(mover('mes', '31/03/2026', -1)).toBe('01/02/2026');
  });

  it('avanzar y regresar deja la misma semana', () => {
    const ida = mover('semana', VIERNES, 3);
    expect(mover('semana', ida, -3)).toBe(VIERNES);
  });

  it('cruza el año sin perderse', () => {
    expect(mover('dia', '31/12/2026', 1)).toBe('01/01/2027');
    expect(mover('mes', '15/12/2026', 1)).toBe('01/01/2027');
  });

  it('febrero de año bisiesto tiene 29', () => {
    expect(mover('dia', '28/02/2024', 1)).toBe('29/02/2024');
    expect(mover('dia', '28/02/2026', 1)).toBe('01/03/2026');
  });
});

describe('como se lee el encabezado', () => {
  it('el dia, completo', () => {
    expect(tituloDe('dia', VIERNES)).toBe('10 de julio de 2026');
  });

  it('la semana no repite el mes cuando no hace falta', () => {
    expect(tituloDe('semana', VIERNES)).toBe('6 al 12 de julio de 2026');
  });

  it('pero SI lo dice cuando la semana cruza de mes', () => {
    expect(tituloDe('semana', '31/07/2026')).toBe('27 de julio al 2 de agosto de 2026');
  });

  it('el mes, con su año', () => {
    expect(tituloDe('mes', VIERNES)).toBe('julio de 2026');
  });

  it('una fecha ilegible devuelve vacio, no "Invalid Date"', () => {
    expect(tituloDe('dia', 'nada')).toBe('');
    expect(nombreDelDia('nada')).toBeNull();
  });
});

describe('hoy y los dias de relleno', () => {
  it('reconoce hoy contra el momento que se le da', () => {
    expect(esHoy('10/07/2026', new Date(2026, 6, 10, 15, 0))).toBe(true);
    expect(esHoy('11/07/2026', new Date(2026, 6, 10, 15, 0))).toBe(false);
  });

  it('los dias de relleno se distinguen de los del mes', () => {
    expect(esDelMes('29/06/2026', VIERNES)).toBe(false);
    expect(esDelMes('01/07/2026', VIERNES)).toBe(true);
    expect(esDelMes('02/08/2026', VIERNES)).toBe(false);
  });
});
