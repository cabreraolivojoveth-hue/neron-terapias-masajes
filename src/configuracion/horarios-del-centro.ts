/**
 * LOS HORARIOS DEL CENTRO, y la pregunta que Agenda le hace a Configuracion.
 *
 * ESTA APARTE DE LA PANTALLA a proposito: quien lo consume de verdad no es
 * Configuracion, es AGENDA. El formulario de una cita pregunta aqui si la hora
 * que se acaba de escoger cae dentro de lo que abre el centro, y avisa. Si la
 * respuesta viviera dentro del componente de Configuracion, Agenda tendria que
 * importar de las tripas de otro modulo — y esa es justo la dependencia que
 * despues no se deshace.
 *
 * AVISA, NO BLOQUEA, y es una decision:
 *
 * Un centro de terapias atiende fuera de horario constantemente. Una paciente
 * que solo puede a las ocho de la noche, una sesion que se alarga, un domingo
 * que se abre por un curso. Un sistema que se NIEGA a guardar esa cita no
 * protege nada: hace que la cita se apunte en un papel, y a partir de ahi la
 * agenda del sistema deja de ser la agenda del centro.
 *
 * Lo que si hace falta es que nadie agende un martes a las siete de la mañana
 * "sin darse cuenta". Por eso se avisa con todas sus letras y se deja guardar.
 *
 * LAS HORAS SE COMPARAN COMO TEXTO. `HH:mm` ordena bien alfabeticamente y no
 * pasa por `Date`, que es como una hora se mueve segun la zona de quien abrio
 * la pantalla. Es la misma regla de las fechas del resto del sistema.
 */

import type { Fecha, Hora24 } from '@neron/base/utils';
import { DIAS_DE_LA_SEMANA, type HorarioDelDia } from '../datos/configuracion.js';

/**
 * El dia ISO de una fecha `dd/mm/aaaa`: 1 lunes … 7 domingo.
 *
 * SE LLAMA ASI Y NO `diaDeLaSemana` porque ese nombre ya existe en
 * `ui/fechas-en-palabras.ts` y devuelve el NOMBRE del dia, no su numero. Dos
 * funciones con el mismo nombre y distinto tipo de respuesta es de las cosas
 * que se importan mal una vez y se buscan durante media hora.
 *
 * SE ARMA LA FECHA A MEDIODIA. Con `new Date(a, m, d)` a medianoche, un cambio
 * de horario de verano puede dejarla en el dia anterior a las 23:00 y el dia de
 * la semana sale corrido — que es exactamente el fallo que hace que un horario
 * de martes se aplique el lunes en la computadora de una sola persona.
 */
export function diaIsoDeLaFecha(fecha: Fecha): number {
  const [d, m, a] = fecha.split('/').map((n) => Number(n));
  if (!d || !m || !a) return 0;
  const cuando = new Date(a, m - 1, d, 12, 0, 0);
  const dia = cuando.getDay();
  // `getDay()` cuenta el domingo como 0; el resto del sistema usa el ISO, donde
  // el domingo es 7. Traducirlo aqui evita que cada pantalla lo recuerde.
  return dia === 0 ? 7 : dia;
}

export function horarioDelDia(
  horarios: readonly HorarioDelDia[],
  dia: number,
): HorarioDelDia | null {
  return horarios.find((h) => h.dia === dia) ?? null;
}

export interface AvisoDeHorario {
  /** `true` cuando la hora escogida cae fuera de lo que abre el centro. */
  readonly fuera: boolean;
  /** Que decir. Vacío cuando no hay nada que avisar. */
  readonly aviso: string;
}

const SIN_AVISO: AvisoDeHorario = { fuera: false, aviso: '' };

/**
 * ¿Esta cita cae fuera del horario del centro?
 *
 * Devuelve el aviso ya redactado y no un codigo: quien lo pinta no tiene que
 * saber si el problema es que el centro cierra ese dia o que es media hora
 * antes de abrir, y con un codigo cada pantalla escribiria su propia frase.
 */
export function avisoDeHorario(
  horarios: readonly HorarioDelDia[],
  fecha: Fecha,
  hora: Hora24 | string,
): AvisoDeHorario {
  if (!fecha || !/^\d{2}:\d{2}/.test(String(hora))) return SIN_AVISO;

  const dia = diaIsoDeLaFecha(fecha);
  if (dia === 0) return SIN_AVISO;

  const h = horarioDelDia(horarios, dia);
  // SIN HORARIO GUARDADO NO SE AVISA DE NADA. Un centro que no configuro sus
  // horarios no tiene por que ver una advertencia en cada cita que agenda.
  if (!h) return SIN_AVISO;

  const nombre = DIAS_DE_LA_SEMANA.find((d) => d.dia === dia)?.nombre ?? '';
  const cuando = String(hora).slice(0, 5);

  if (h.cerrado) {
    return { fuera: true, aviso: `El centro cierra los ${nombre.toLowerCase()}.` };
  }
  if (cuando < h.abre) {
    return { fuera: true, aviso: `Los ${nombre.toLowerCase()} el centro abre a las ${h.abre}.` };
  }
  if (cuando >= h.cierra) {
    return { fuera: true, aviso: `Los ${nombre.toLowerCase()} el centro cierra a las ${h.cierra}.` };
  }
  return SIN_AVISO;
}

/**
 * El horario de un dia, en una linea legible.
 *
 * "Cerrado" se dice con esa palabra y no con un guion: un guion en una tabla de
 * horarios se lee como "todavia no lo han puesto", y las dos cosas llevan a
 * llamar por telefono para preguntar.
 */
export function horarioEnPalabras(h: HorarioDelDia): string {
  return h.cerrado ? 'Cerrado' : `${h.abre} a ${h.cierra}`;
}

/**
 * Los siete dias resumidos, juntando los seguidos que abren igual.
 *
 * "Lunes a viernes 09:00 a 19:00 · Sábado 09:00 a 14:00 · Domingo cerrado" se
 * lee de un vistazo; los siete renglones sueltos hay que leerlos uno por uno
 * para descubrir que seis son iguales.
 */
export function resumirHorarios(horarios: readonly HorarioDelDia[]): string[] {
  const lineas: string[] = [];
  let i = 0;
  while (i < horarios.length) {
    const actual = horarios[i]!;
    const igual = (h: HorarioDelDia): boolean =>
      h.cerrado === actual.cerrado &&
      (actual.cerrado || (h.abre === actual.abre && h.cierra === actual.cierra));

    let fin = i;
    while (fin + 1 < horarios.length && igual(horarios[fin + 1]!)) fin += 1;

    const nombre = (dia: number): string =>
      DIAS_DE_LA_SEMANA.find((d) => d.dia === dia)?.nombre ?? '';

    const cuales =
      fin === i
        ? nombre(actual.dia)
        : `${nombre(actual.dia)} a ${nombre(horarios[fin]!.dia).toLowerCase()}`;

    lineas.push(`${cuales}: ${horarioEnPalabras(actual)}`);
    i = fin + 1;
  }
  return lineas;
}

/** Cuántos días de la semana abre el centro. Cero es una respuesta válida. */
export function diasQueAbre(horarios: readonly HorarioDelDia[]): number {
  return horarios.filter((h) => !h.cerrado).length;
}
