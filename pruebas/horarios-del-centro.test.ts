/**
 * LOS HORARIOS, Y LA PREGUNTA QUE AGENDA LE HACE A CONFIGURACION.
 *
 * Lo que se vigila: que el dia de la semana no se corra —que es el fallo que
 * aparece en la computadora de una sola persona—, que el aviso salga cuando
 * toca y solo cuando toca, y que un centro sin horarios configurados no vea una
 * advertencia en cada cita.
 */
import { describe, expect, it } from 'vitest';
import {
  avisoDeHorario,
  diaIsoDeLaFecha,
  diasQueAbre,
  horarioDelDia,
  horarioEnPalabras,
  resumirHorarios,
} from '../src/configuracion/horarios-del-centro.js';
import { HORARIO_DE_ARRANQUE, type HorarioDelDia } from '../src/datos/configuracion.js';

const ABIERTO: readonly HorarioDelDia[] = [
  { dia: 1, cerrado: false, abre: '09:00', cierra: '19:00' },
  { dia: 2, cerrado: false, abre: '09:00', cierra: '19:00' },
  { dia: 3, cerrado: false, abre: '09:00', cierra: '19:00' },
  { dia: 4, cerrado: false, abre: '09:00', cierra: '19:00' },
  { dia: 5, cerrado: false, abre: '09:00', cierra: '19:00' },
  { dia: 6, cerrado: false, abre: '09:00', cierra: '14:00' },
  { dia: 7, cerrado: true, abre: '09:00', cierra: '19:00' },
];

describe('el dia de la semana', () => {
  it('cuenta el lunes como 1 y el domingo como 7, no como 0', () => {
    /*
     * `getDay()` cuenta el domingo como cero. Todo el resto del sistema usa el
     * ISO, donde el domingo es siete: mezclarlos hace que el horario del lunes
     * se aplique el domingo, y solo en algunas fechas.
     */
    // El 17 de agosto de 2026 es lunes.
    expect(diaIsoDeLaFecha('17/08/2026')).toBe(1);
    // Y el 23, domingo.
    expect(diaIsoDeLaFecha('23/08/2026')).toBe(7);
  });

  it('una fecha ilegible devuelve cero, no un dia inventado', () => {
    expect(diaIsoDeLaFecha('')).toBe(0);
    expect(diaIsoDeLaFecha('mañana')).toBe(0);
  });
});

describe('el aviso de fuera de horario', () => {
  it('no dice nada dentro del horario', () => {
    // Lunes a las once.
    expect(avisoDeHorario(ABIERTO, '17/08/2026', '11:00').fuera).toBe(false);
  });

  it('avisa el dia que el centro cierra', () => {
    const a = avisoDeHorario(ABIERTO, '23/08/2026', '11:00');
    expect(a.fuera).toBe(true);
    expect(a.aviso).toContain('domingo');
  });

  it('avisa antes de abrir y dice a que hora abre', () => {
    const a = avisoDeHorario(ABIERTO, '17/08/2026', '07:30');
    expect(a.fuera).toBe(true);
    expect(a.aviso).toContain('09:00');
  });

  it('avisa a la hora exacta de cierre, no un minuto despues', () => {
    /*
     * Una cita que EMPIEZA a la hora de cierre ya no cabe: la sesion dura una
     * hora. Comparar con "mayor que" en vez de "mayor o igual" dejaba pasar en
     * silencio justo el caso mas comun.
     */
    expect(avisoDeHorario(ABIERTO, '17/08/2026', '19:00').fuera).toBe(true);
    expect(avisoDeHorario(ABIERTO, '17/08/2026', '18:59').fuera).toBe(false);
  });

  it('el sabado se cierra antes, y lo respeta', () => {
    // El 22 de agosto de 2026 es sábado: cierra a las 14:00.
    expect(avisoDeHorario(ABIERTO, '22/08/2026', '15:00').fuera).toBe(true);
    expect(avisoDeHorario(ABIERTO, '22/08/2026', '13:00').fuera).toBe(false);
  });

  it('SIN horarios guardados no avisa de nada', () => {
    /*
     * Un centro que nunca los configuro no tiene por que ver una advertencia en
     * cada cita que agenda. Un aviso que sale siempre se deja de leer, y con el
     * se dejan de leer los que si importan.
     */
    expect(avisoDeHorario([], '23/08/2026', '11:00').fuera).toBe(false);
  });

  it('sin fecha o sin hora tampoco avisa: no hay nada que comparar', () => {
    expect(avisoDeHorario(ABIERTO, '', '11:00').fuera).toBe(false);
    expect(avisoDeHorario(ABIERTO, '17/08/2026', '').fuera).toBe(false);
    // Una hora a medias mientras se escribe no puede disparar el aviso.
    expect(avisoDeHorario(ABIERTO, '17/08/2026', '1').fuera).toBe(false);
  });
});

describe('el horario escrito', () => {
  it('un dia cerrado dice CERRADO, no un guion', () => {
    // Un guion en una tabla de horarios se lee como "todavia no lo han
    // puesto", y las dos cosas llevan a llamar por telefono para preguntar.
    expect(horarioEnPalabras(ABIERTO[6]!)).toBe('Cerrado');
    expect(horarioEnPalabras(ABIERTO[0]!)).toBe('09:00 a 19:00');
  });

  it('junta los dias seguidos que abren igual', () => {
    // Siete renglones sueltos hay que leerlos uno por uno para descubrir que
    // seis son iguales.
    const lineas = resumirHorarios(ABIERTO);
    expect(lineas.length).toBe(3);
    expect(lineas[0]).toBe('Lunes a viernes: 09:00 a 19:00');
    expect(lineas[1]).toBe('Sábado: 09:00 a 14:00');
    expect(lineas[2]).toBe('Domingo: Cerrado');
  });

  it('con los siete iguales sale una sola linea', () => {
    const todos = ABIERTO.map((h) => ({ ...h, cerrado: false, cierra: '19:00' }));
    expect(resumirHorarios(todos)).toEqual(['Lunes a domingo: 09:00 a 19:00']);
  });
});

describe('cuantos dias abre', () => {
  it('el horario de arranque abre seis y cierra el domingo', () => {
    expect(diasQueAbre(HORARIO_DE_ARRANQUE)).toBe(6);
  });

  it('cero es una respuesta valida', () => {
    expect(diasQueAbre(ABIERTO.map((h) => ({ ...h, cerrado: true })))).toBe(0);
  });
});

describe('buscar el horario de un dia', () => {
  it('devuelve null si ese dia no esta, en vez de inventarlo', () => {
    expect(horarioDelDia(ABIERTO, 1)).not.toBeNull();
    expect(horarioDelDia([], 1)).toBeNull();
  });
});
