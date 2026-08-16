/**
 * LOS PLAZOS: urgencia, rangos, aplazamientos y repeticiones.
 *
 * TODO ES PURO, asi que se puede fijar el dia sin tocar el reloj de la maquina.
 * Es justo la clase de logica que, dentro de un componente, solo se probaria
 * abriendo un navegador — y por eso vive fuera.
 */

import { describe, expect, it } from 'vitest';
import {
  DIAS_DE_LA_SEMANA,
  TONO_DE_LA_URGENCIA,
  comoSeDiceLaUrgencia,
  cuandoAvisar,
  cuandoEnPalabras,
  etiquetaDeEstado,
  opcionesDeAplazamiento,
  rangoEnFechas,
  repeticionEnPalabras,
  topeEnPalabras,
  urgenciaDe,
} from '../src/recordatorios/plazos.js';

const HOY = '16/08/2026';

describe('que tan urgente es', () => {
  it('lo de ayer esta vencido', () => {
    expect(urgenciaDe('pendiente', '15/08/2026', HOY)).toBe('vencido');
  });

  it('lo de hoy es de hoy', () => {
    expect(urgenciaDe('pendiente', HOY, HOY)).toBe('hoy');
  });

  it('lo de mañana se distingue de lo proximo', () => {
    expect(urgenciaDe('pendiente', '17/08/2026', HOY)).toBe('manana');
    expect(urgenciaDe('pendiente', '25/08/2026', HOY)).toBe('proximo');
  });

  it('lo completado NO puede salir como vencido', () => {
    // Es el error que mas confunde: un recordatorio cerrado el mes pasado
    // aparecia en rojo gritando que urge.
    expect(urgenciaDe('hecho', '01/01/2020', HOY)).toBe('cerrado');
    expect(urgenciaDe('descartado', '01/01/2020', HOY)).toBe('cerrado');
  });

  it('una fecha rota cae en "proximo", nunca en vencido ni en hoy', () => {
    // Se prefiere que un dato roto pase desapercibido a que dispare una alarma
    // falsa: una alarma falsa enseña a ignorar las de verdad.
    expect(urgenciaDe('pendiente', 'no es fecha', HOY)).toBe('proximo');
    expect(urgenciaDe('pendiente', '', HOY)).toBe('proximo');
    expect(urgenciaDe('pendiente', HOY, 'roto')).toBe('proximo');
  });

  it('cada urgencia tiene palabra Y tono: el color nunca va solo', () => {
    for (const u of ['vencido', 'hoy', 'manana', 'proximo', 'cerrado'] as const) {
      expect(comoSeDiceLaUrgencia(u)).toBeTruthy();
      expect(TONO_DE_LA_URGENCIA[u]).toBeTruthy();
    }
  });
});

describe('la pastilla de estado', () => {
  it('mezcla estado y urgencia, que es lo que hace falta saber de un vistazo', () => {
    expect(etiquetaDeEstado('pendiente', '15/08/2026', HOY).texto).toBe('Vencido');
    expect(etiquetaDeEstado('pendiente', HOY, HOY).texto).toBe('Hoy');
    expect(etiquetaDeEstado('pendiente', '30/08/2026', HOY).texto).toBe('Próximo');
  });

  it('completado y cancelado se distinguen: uno se hizo, el otro ya no aplica', () => {
    expect(etiquetaDeEstado('hecho', HOY, HOY).texto).toBe('Completado');
    expect(etiquetaDeEstado('descartado', HOY, HOY).texto).toBe('Cancelado');
    expect(etiquetaDeEstado('hecho', HOY, HOY).tono).not.toBe(
      etiquetaDeEstado('descartado', HOY, HOY).tono,
    );
  });

  it('vencido sigue siendo PENDIENTE, no un cuarto estado', () => {
    // Lo comprueba el tono: si vencido fuera un estado cerrado, compartiria
    // tono con completado y la pantalla dejaria de ofrecer completarlo.
    expect(etiquetaDeEstado('pendiente', '01/01/2020', HOY).tono).toBe('peligro');
    expect(etiquetaDeEstado('hecho', '01/01/2020', HOY).tono).toBe('exito');
  });
});

describe('la fecha y la hora en una linea', () => {
  it('sin hora se enseña solo la fecha', () => {
    expect(cuandoEnPalabras(HOY, null)).toBe(HOY);
  });

  it('con hora se enseña legible, no en 24 horas', () => {
    expect(cuandoEnPalabras(HOY, '14:30')).toContain('p. m.');
  });
});

describe('el filtro por fecha', () => {
  it('hoy es un solo dia', () => {
    expect(rangoEnFechas('hoy', '', '', HOY)).toEqual({ desde: HOY, hasta: HOY });
  });

  it('los proximos siete arrancan HOY, no mañana', () => {
    // Si arrancaran mañana, lo de hoy no saldria en "próximos 7 días" y quien
    // filtre asi se perderia justo lo que vence en unas horas.
    expect(rangoEnFechas('siete', '', '', HOY).desde).toBe(HOY);
    expect(rangoEnFechas('siete', '', '', HOY).hasta).toBe('23/08/2026');
  });

  it('vencidos no tiene fecha de inicio', () => {
    // Un tope escondería justo el que lleva mas tiempo sin atenderse.
    const r = rangoEnFechas('vencidos', '', '', HOY);
    expect(r.desde).toBe('');
    expect(r.hasta).toBe('15/08/2026');
  });

  it('sin rango escogido no se filtra nada', () => {
    expect(rangoEnFechas('', '', '', HOY)).toEqual({ desde: '', hasta: '' });
  });

  it('el personalizado usa lo que se escribio', () => {
    expect(rangoEnFechas('personalizado', '01/08/2026', '31/08/2026', HOY)).toEqual({
      desde: '01/08/2026',
      hasta: '31/08/2026',
    });
  });

  it('se recalcula contra hoy: no se queda viejo al pasar la medianoche', () => {
    expect(rangoEnFechas('hoy', '', '', '17/08/2026').desde).toBe('17/08/2026');
  });
});

describe('posponer', () => {
  const ALAS_DIEZ = new Date(2026, 7, 16, 10, 0, 0);

  it('"mas tarde" es HOY, no mañana', () => {
    // Casi todas las listas de pendientes lo traducen a mañana, y eso hace que
    // quien solo queria quitarselo de encima un rato lo pierda todo el dia.
    const o = opcionesDeAplazamiento(HOY, ALAS_DIEZ, null);
    expect(o[0]!.fecha).toBe(HOY);
  });

  it('"mas tarde" cae en hora en punto, no a las 13:43', () => {
    const o = opcionesDeAplazamiento(HOY, new Date(2026, 7, 16, 10, 43, 0), null);
    expect(o[0]!.hora).toBe('13:00');
  });

  it('mañana y la proxima semana CONSERVAN la hora que tenia', () => {
    // Ponerla en blanco convertiria un recordatorio de las 10 en uno de todo el
    // dia sin que nadie lo pidiera.
    const o = opcionesDeAplazamiento(HOY, ALAS_DIEZ, '10:00');
    expect(o[1]!.fecha).toBe('17/08/2026');
    expect(o[1]!.hora).toBe('10:00');
    expect(o[2]!.fecha).toBe('23/08/2026');
    expect(o[2]!.hora).toBe('10:00');
  });
});

describe('la repeticion, escrita en español', () => {
  it('lo simple se dice simple', () => {
    expect(repeticionEnPalabras('diario', 1, [])).toBe('Todos los días');
    expect(repeticionEnPalabras('mensual', 1, [])).toBe('Cada mes');
    expect(repeticionEnPalabras('anual', 1, [])).toBe('Cada año');
  });

  it('el intervalo se dice', () => {
    expect(repeticionEnPalabras('diario', 3, [])).toBe('Cada 3 días');
    expect(repeticionEnPalabras('semanal', 2, [])).toBe('Cada 2 semanas');
  });

  it('los dias se nombran, y el ultimo va con "y"', () => {
    // Es lo unico que deja cachar que uno queria decir otra cosa ANTES de que
    // la regla empiece a crear recordatorios.
    expect(repeticionEnPalabras('semanal', 1, [1])).toBe('Cada semana, lunes');
    expect(repeticionEnPalabras('semanal', 1, [1, 4])).toBe('Cada semana, lunes y jueves');
    expect(repeticionEnPalabras('semanal', 2, [1, 3, 5])).toBe(
      'Cada 2 semanas, lunes, miércoles y viernes',
    );
  });

  it('los dias se leen en el orden de la semana, no en el que se tocaron', () => {
    expect(repeticionEnPalabras('semanal', 1, [5, 1])).toBe('Cada semana, lunes y viernes');
  });

  it('el tope se dice, y "sin fecha de termino" tambien', () => {
    expect(topeEnPalabras('31/12/2026', null)).toBe('hasta el 31/12/2026');
    expect(topeEnPalabras(null, 10)).toBe('10 veces');
    expect(topeEnPalabras(null, 1)).toBe('1 vez');
    expect(topeEnPalabras(null, null)).toBe('sin fecha de término');
  });

  it('los siete dias van en numeracion ISO, la misma que la base', () => {
    // Con la del navegador (0 = domingo) la regla "los lunes" acabaria creando
    // recordatorios los domingos.
    expect(DIAS_DE_LA_SEMANA.map((d) => d.iso)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(DIAS_DE_LA_SEMANA[0]!.largo).toBe('lunes');
    expect(DIAS_DE_LA_SEMANA[6]!.largo).toBe('domingo');
  });
});

describe('cuando toca avisar', () => {
  it('resta la anticipacion de la hora del recordatorio', () => {
    const cuando = cuandoAvisar('16/08/2026', '10:00', '09:00', 30);
    expect(cuando).toBe(new Date(2026, 7, 16, 9, 30, 0, 0).getTime());
  });

  it('sin hora usa la del centro, NO la medianoche', () => {
    // Con medianoche, un recordatorio de todo el dia avisa a las doce de la
    // noche: exactamente cuando nadie lo va a leer.
    const cuando = cuandoAvisar('16/08/2026', null, '09:00', 0);
    expect(cuando).toBe(new Date(2026, 7, 16, 9, 0, 0, 0).getTime());
  });

  it('se construye con numeros locales: no retrocede un dia', () => {
    // `new Date('2026-08-16')` se lee como UTC y en México cae el 15.
    const cuando = cuandoAvisar('16/08/2026', '00:30', '09:00', 0);
    expect(new Date(cuando!).getDate()).toBe(16);
  });

  it('una fecha rota no dispara nada', () => {
    expect(cuandoAvisar('no es fecha', '10:00', '09:00', 0)).toBeNull();
  });
});
