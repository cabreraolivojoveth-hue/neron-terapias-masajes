/**
 * Las fechas y duraciones escritas en palabras.
 *
 * Las usan Inicio y Agenda por igual. Se prueban con texto y sin navegador
 * porque ninguna pasa por `new Date(texto)` — que es justo lo que mueve una
 * fecha un dia segun la zona horaria de quien abrio la pantalla.
 */
import { describe, expect, it } from 'vitest';
import {
  diaCorto,
  diaDeLaSemana,
  diaYMes,
  duracionEnPalabras,
  fechaConMes,
  fechaLarga,
  mesYAnio,
} from '../src/ui/fechas-en-palabras.js';

describe('la fecha larga', () => {
  it('se arma desde el texto, sin pasar por new Date(texto)', () => {
    expect(fechaLarga('06/08/2026')).toBe('Jueves, 6 de agosto de 2026');
  });

  it('calcula el dia de la semana, no lo supone', () => {
    expect(fechaLarga('01/01/2026')).toBe('Jueves, 1 de enero de 2026');
    expect(fechaLarga('29/02/2024')).toBe('Jueves, 29 de febrero de 2024');
  });

  it('una fecha imposible devuelve vacio en vez de reventar', () => {
    expect(fechaLarga('lo que sea')).toBe('');
    expect(fechaLarga('10/13/2026')).toBe('');
  });

  it('un 31 de febrero NO se desborda al 3 de marzo', () => {
    // `Date` acepta el 31 de febrero y lo corre a marzo sin avisar. Un dato
    // corrupto tiene que verse vacio, no convertirse en otra fecha creible.
    expect(fechaLarga('31/02/2026')).toBe('');
  });
});

describe('las otras formas de escribirla', () => {
  it('la barra de Agenda va sin el dia de la semana', () => {
    expect(fechaConMes('10/07/2025')).toBe('10 de julio de 2025');
  });

  it('el globito de la grafica dice dia y mes', () => {
    expect(diaYMes('06/08/2026')).toBe('Jueves 6 de agosto');
  });

  it('el dia corto son tres letras', () => {
    expect(diaCorto('03/08/2026')).toBe('Lun');
    expect(diaCorto('09/08/2026')).toBe('Dom');
  });

  it('el dia completo, para el encabezado de la vista de dia', () => {
    expect(diaDeLaSemana('10/07/2025')).toBe('Jueves');
  });

  it('el titulo del mes', () => {
    expect(mesYAnio('10/07/2025')).toBe('julio de 2025');
  });
});

describe('la duracion en palabras', () => {
  it('una hora se dice "1 hora", no "60 min"', () => {
    // En el panel va al lado del rango: "09:00 – 10:00 (60 min)" obliga a
    // hacer la cuenta para confirmar que cuadra; "(1 hora)" se lee de golpe.
    expect(duracionEnPalabras(60)).toBe('1 hora');
  });

  it('menos de una hora va en minutos', () => {
    expect(duracionEnPalabras(30)).toBe('30 min');
    expect(duracionEnPalabras(45)).toBe('45 min');
  });

  it('hora y media, y dos horas', () => {
    expect(duracionEnPalabras(90)).toBe('1 h 30 min');
    expect(duracionEnPalabras(120)).toBe('2 horas');
    expect(duracionEnPalabras(135)).toBe('2 h 15 min');
  });

  it('una duracion imposible no escribe nada', () => {
    expect(duracionEnPalabras(0)).toBe('');
    expect(duracionEnPalabras(-30)).toBe('');
    expect(duracionEnPalabras(Number.NaN)).toBe('');
  });
});
