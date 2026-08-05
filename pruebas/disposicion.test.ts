import { describe, expect, it } from 'vitest';
import {
  colocar, comoHora, horaDelClic, horasDe, lineaDeAhora, minutosDe,
} from '../src/agenda/disposicion.js';

const ABRE = 8 * 60;   // 08:00
const CIERRA = 20 * 60; // 20:00
const cita = (id: string, horaInicio: string, horaFin: string) => ({ id, horaInicio, horaFin });

describe('leer y escribir horas', () => {
  it('convierte en los dos sentidos', () => {
    expect(minutosDe('09:30')).toBe(570);
    expect(comoHora(570)).toBe('09:30');
  });

  it('una hora imposible devuelve null, no un numero raro', () => {
    for (const mala of ['25:00', '09:99', 'mañana', '', '9']) {
      expect(minutosDe(mala), mala).toBeNull();
    }
  });

  it('acepta la hora sin cero a la izquierda', () => {
    expect(minutosDe('9:05')).toBe(545);
  });
});

describe('donde va cada cita', () => {
  it('una cita de 09:00 a 10:00 en un dia de 08:00 a 20:00', () => {
    const [c] = colocar([cita('a', '09:00', '10:00')], ABRE, CIERRA);
    expect(c!.arriba).toBeCloseTo((60 / 720) * 100, 5);
    expect(c!.alto).toBeCloseTo((60 / 720) * 100, 5);
  });

  it('respeta CUALQUIER duracion, no solo la hora completa', () => {
    // 30, 45, 75, 90 minutos: el bloque tiene que medir lo que dura.
    const puestas = colocar([
      cita('a', '08:00', '08:30'), cita('b', '09:00', '09:45'),
      cita('c', '11:00', '12:15'), cita('d', '14:00', '15:30'),
    ], ABRE, CIERRA);
    const alto = (id: string) => puestas.find((p) => p.cita.id === id)!.alto;
    expect(alto('a')).toBeCloseTo((30 / 720) * 100, 5);
    expect(alto('b')).toBeCloseTo((45 / 720) * 100, 5);
    expect(alto('c')).toBeCloseTo((75 / 720) * 100, 5);
    expect(alto('d')).toBeCloseTo((90 / 720) * 100, 5);
  });

  it('una cita muy corta conserva un alto tocable con el dedo', () => {
    const [c] = colocar([cita('a', '09:00', '09:05')], ABRE, CIERRA);
    expect(c!.alto).toBeGreaterThanOrEqual(1.5);
  });

  it('una hora ilegible NO tumba el dia: se salta esa cita', () => {
    const puestas = colocar([cita('mala', 'x', 'y'), cita('buena', '09:00', '10:00')], ABRE, CIERRA);
    expect(puestas).toHaveLength(1);
    expect(puestas[0]!.cita.id).toBe('buena');
  });
});

describe('citas encimadas', () => {
  it('dos que no se tocan van las dos en el carril 0', () => {
    const p = colocar([cita('a', '09:00', '10:00'), cita('b', '10:00', '11:00')], ABRE, CIERRA);
    expect(p.every((x) => x.carril === 0 && x.carriles === 1)).toBe(true);
  });

  it('dos encimadas se reparten el ancho', () => {
    // Si no, una tapa a la otra y la de abajo deja de existir para quien mira.
    const p = colocar([cita('a', '09:00', '10:00'), cita('b', '09:30', '10:30')], ABRE, CIERRA);
    expect(p.map((x) => x.carril).sort()).toEqual([0, 1]);
    expect(p.every((x) => x.carriles === 2)).toBe(true);
  });

  it('la cadena A-B-C comparte ancho, pero A y C REUSAN el mismo carril', () => {
    /**
     * A(9-10) choca con B(9:30-10:30); B choca con C(10:15-11:15); A y C no
     * se tocan.
     *
     * Las tres tienen que repartirse el ancho JUNTAS —si se comparara de dos
     * en dos, A y C quedarian las dos en el carril 0 y encimadas visualmente
     * con distinto ancho— pero no hacen falta tres carriles: C cabe donde ya
     * termino A. Dos carriles dejan los bloques mas anchos y mas legibles.
     */
    const p = colocar([
      cita('a', '09:00', '10:00'), cita('b', '09:30', '10:30'), cita('c', '10:15', '11:15'),
    ], ABRE, CIERRA);
    expect(p.every((x) => x.carriles === 2)).toBe(true);
    const carril = (id: string) => p.find((x) => x.cita.id === id)!.carril;
    expect(carril('a')).toBe(0);
    expect(carril('b')).toBe(1);
    expect(carril('c')).toBe(0);
  });

  it('cuando de verdad hacen falta tres carriles, se abren los tres', () => {
    const p = colocar([
      cita('a', '09:00', '11:00'), cita('b', '09:30', '11:30'), cita('c', '10:00', '12:00'),
    ], ABRE, CIERRA);
    expect(p.every((x) => x.carriles === 3)).toBe(true);
    expect(new Set(p.map((x) => x.carril)).size).toBe(3);
  });

  it('un carril se REUSA cuando ya se desocupo', () => {
    // Tres seguidas encadenadas no deben abrir tres carriles: la tercera cabe
    // donde termino la primera.
    const p = colocar([
      cita('a', '09:00', '10:00'), cita('b', '09:30', '10:30'), cita('c', '10:00', '11:00'),
    ], ABRE, CIERRA);
    expect(p.every((x) => x.carriles === 2)).toBe(true);
  });

  it('grupos separados no se contagian el ancho', () => {
    const p = colocar([
      cita('a', '09:00', '10:00'), cita('b', '09:30', '10:30'),
      cita('c', '15:00', '16:00'),
    ], ABRE, CIERRA);
    expect(p.find((x) => x.cita.id === 'c')!.carriles).toBe(1);
  });
});

describe('lo que se sale del horario', () => {
  it('una cita que empieza antes de abrir NO se esconde: se recorta', () => {
    // Esconderla seria peor: alguien la agendo, existe, y no verla hace pensar
    // que se perdio.
    const [c] = colocar([cita('a', '07:00', '09:00')], ABRE, CIERRA);
    expect(c).toBeDefined();
    expect(c!.arriba).toBe(0);
    expect(c!.alto).toBeCloseTo((60 / 720) * 100, 5);
  });

  it('una que termina despues de cerrar tambien', () => {
    const [c] = colocar([cita('a', '19:00', '22:00')], ABRE, CIERRA);
    expect(c!.arriba + c!.alto).toBeLessThanOrEqual(100.01);
  });
});

describe('la linea de la hora actual', () => {
  it('cae donde debe', () => {
    const l = lineaDeAhora(new Date(2026, 6, 10, 11, 15), ABRE, CIERRA);
    expect(l?.hora).toBe('11:15');
    expect(l?.arriba).toBeCloseTo((195 / 720) * 100, 5);
  });

  it('NO se pinta si la hora quedo fuera del horario del centro', () => {
    // Una linea a las 06:00 en una agenda que abre a las 08:00 seria mentira.
    expect(lineaDeAhora(new Date(2026, 6, 10, 6, 0), ABRE, CIERRA)).toBeNull();
    expect(lineaDeAhora(new Date(2026, 6, 10, 23, 0), ABRE, CIERRA)).toBeNull();
  });

  it('no viene con una hora escrita a mano', () => {
    // La captura de referencia decia 11:15. Aqui se calcula del momento.
    const l = lineaDeAhora(new Date(2026, 6, 10, 16, 42), ABRE, CIERRA);
    expect(l?.hora).toBe('16:42');
  });
});

describe('las marcas de la columna', () => {
  it('una por hora, desde que abre hasta que cierra', () => {
    const h = horasDe(ABRE, CIERRA);
    expect(h[0]).toBe('08:00');
    expect(h[h.length - 1]).toBe('20:00');
    expect(h).toHaveLength(13);
  });

  it('sirven horarios que no empiezan en hora en punto', () => {
    expect(horasDe(8 * 60 + 30, 11 * 60)[0]).toBe('09:00');
  });
});

describe('tocar un hueco para agendar ahi', () => {
  it('redondea al cuarto de hora', () => {
    // Nadie agenda a las 10:07. Sin redondear, cada clic daria una hora
    // distinta e irrepetible.
    // 25% de un dia de 08:00 a 20:00 son 180 minutos: las 11:00 en punto.
    expect(horaDelClic(0.25, ABRE, CIERRA)).toBe('11:00');
    // 27% son 194.4 minutos — las 11:14 — y se redondea al cuarto: 11:15.
    expect(horaDelClic(0.27, ABRE, CIERRA)).toBe('11:15');
    // 26% son 187.2 — las 11:07 — y cae para el lado de las 11:00.
    expect(horaDelClic(0.26, ABRE, CIERRA)).toBe('11:00');
  });

  it('un clic fuera de la columna no da una hora imposible', () => {
    expect(horaDelClic(-5, ABRE, CIERRA)).toBe('08:00');
    expect(horaDelClic(99, ABRE, CIERRA)).toBe('20:00');
  });
});
