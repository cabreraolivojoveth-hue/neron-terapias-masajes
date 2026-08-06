/**
 * El saludo y la fecha del encabezado.
 *
 * Todas las funciones reciben el momento como parametro: por eso esta prueba
 * corre igual a las tres de la tarde que a las once de la noche, sin tocar el
 * reloj de la maquina.
 */
import { describe, expect, it } from 'vitest';
import {
  diaCorto,
  diaYMes,
  encabezadoDeSaludo,
  fechaLarga,
  primerNombre,
  saludoSegunLaHora,
} from '../src/inicio/saludo.js';

const alas = (hora: number): Date => new Date(2026, 7, 6, hora, 0, 0);

describe('el saludo cambia con la hora', () => {
  it('de madrugada es de noche', () => {
    expect(saludoSegunLaHora(alas(1))).toBe('Buenas noches');
    expect(saludoSegunLaHora(alas(4))).toBe('Buenas noches');
  });

  it('desde las cinco es de dia', () => {
    expect(saludoSegunLaHora(alas(5))).toBe('Buenos días');
    expect(saludoSegunLaHora(alas(11))).toBe('Buenos días');
  });

  it('a las doce en punto ya es tarde', () => {
    // El corte exacto: a las 11:59 todavia es mañana y a las 12:00 ya no.
    expect(saludoSegunLaHora(alas(12))).toBe('Buenas tardes');
    expect(saludoSegunLaHora(alas(18))).toBe('Buenas tardes');
  });

  it('desde las siete de la noche es de noche', () => {
    expect(saludoSegunLaHora(alas(19))).toBe('Buenas noches');
    expect(saludoSegunLaHora(alas(23))).toBe('Buenas noches');
  });
});

describe('con quien se saluda', () => {
  it('usa el PRIMER nombre, no el nombre completo', () => {
    // "¡Buenos días, María Guadalupe Hernández del Río!" no lo dice nadie.
    expect(primerNombre('María Guadalupe Hernández')).toBe('María');
  });

  it('aguanta espacios de mas', () => {
    expect(primerNombre('   Ana   Sofía ')).toBe('Ana');
  });

  it('un correo se corta antes de la arroba', () => {
    // Pasa cuando la cuenta todavia no tiene nombre puesto: saludar a
    // "ana@centro.mx" se ve como un sistema a medio hacer.
    expect(primerNombre('ana@centro.mx')).toBe('ana');
  });

  it('sin nombre devuelve vacio, NUNCA un nombre inventado', () => {
    expect(primerNombre('')).toBe('');
    expect(primerNombre(null)).toBe('');
    expect(primerNombre(undefined)).toBe('');
  });

  it('el encabezado saluda igual aunque no se sepa el nombre', () => {
    expect(encabezadoDeSaludo('Ana Ruiz', alas(9))).toBe('¡Buenos días, Ana!');
    expect(encabezadoDeSaludo(null, alas(9))).toBe('¡Buenos días!');
  });
});

describe('la fecha larga', () => {
  it('se arma desde el texto, sin pasar por new Date(texto)', () => {
    // Es lo que evita que la fecha se mueva un dia segun la zona horaria de
    // quien abrio la pantalla — y el dia que se ve mal es justo el que la
    // persona esta mirando.
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
});

describe('las etiquetas cortas', () => {
  it('el dia corto son tres letras', () => {
    expect(diaCorto('03/08/2026')).toBe('Lun');
    expect(diaCorto('09/08/2026')).toBe('Dom');
  });

  it('el globito de la grafica dice dia y mes', () => {
    expect(diaYMes('06/08/2026')).toBe('Jueves 6 de agosto');
  });
});
