/**
 * Que dias se piden al servidor, segun la vista.
 *
 * Funciones puras: reciben una fecha y devuelven un rango. Toda la navegacion
 * —hoy, anterior, siguiente— vive aqui y se prueba sin pintar nada.
 *
 * POR QUE IMPORTA EL RANGO: la vista de mes NO pide una consulta por dia.
 * Serian treinta y un viajes al servidor cada vez que alguien cambia de mes,
 * y cada uno resolviendo por su cuenta el nombre del paciente. Se pide el mes
 * entero de un jalon y se reparte en el navegador.
 */

import {
  desdeDate,
  diasEntre,
  finDeMes,
  inicioDeMes,
  leerFecha,
  sumarDias,
  sumarMeses,
  type Fecha,
} from '@neron/base/utils';
import { inicioDeSemana } from '@neron/base/tablero';

export type Vista = 'dia' | 'semana' | 'mes';

export interface Rango {
  readonly desde: Fecha;
  readonly hasta: Fecha;
}

/** El rango de dias que hay que traer para pintar esa vista. */
export function rangoDe(vista: Vista, fecha: Fecha): Rango {
  if (vista === 'dia') return { desde: fecha, hasta: fecha };
  if (vista === 'semana') {
    const lunes = inicioDeSemana(fecha);
    return { desde: lunes, hasta: sumarDias(lunes, 6) };
  }
  /**
   * El mes se pide COMPLETO, de lunes a domingo de las semanas que lo tocan.
   *
   * Una cuadricula de mes muestra los ultimos dias del mes anterior y los
   * primeros del siguiente para no dejar huecos. Si solo se pidiera del 1 al
   * 31, esas casillas saldrian vacias aunque tengan citas — y nadie relaciona
   * "el 30 de abril se ve vacio en la vista de mayo" con un rango mal pedido.
   */
  const primero = inicioDeMes(fecha);
  const ultimo = finDeMes(fecha);
  return { desde: inicioDeSemana(primero), hasta: sumarDias(inicioDeSemana(ultimo), 6) };
}

/** Los dias que se pintan en la cuadricula, ya listos para recorrer. */
export function diasDe(vista: Vista, fecha: Fecha): Fecha[] {
  const { desde, hasta } = rangoDe(vista, fecha);
  const total = diasEntre(desde, hasta);
  const dias: Fecha[] = [];
  for (let i = 0; i <= total; i += 1) dias.push(sumarDias(desde, i));
  return dias;
}

/** El paso hacia atras o hacia adelante, segun la vista. */
export function mover(vista: Vista, fecha: Fecha, pasos: number): Fecha {
  if (vista === 'dia') return sumarDias(fecha, pasos);
  if (vista === 'semana') return sumarDias(fecha, pasos * 7);
  // En mes se salta al dia 1, no al mismo dia del mes siguiente: partiendo
  // del 31 de marzo, "siguiente" daria 28 de febrero por el ajuste de dias
  // que no existen, y la navegacion se sentiria rota.
  return inicioDeMes(sumarMeses(fecha, pasos));
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** El nombre del dia de la semana. `null` si la fecha no se entiende. */
export function nombreDelDia(fecha: Fecha): string | null {
  const d = leerFecha(fecha);
  return d ? (DIAS[d.getDay()] ?? null) : null;
}

/** Como se lee el encabezado, segun la vista: "10 de julio de 2026". */
export function tituloDe(vista: Vista, fecha: Fecha): string {
  const d = leerFecha(fecha);
  if (!d) return '';
  const dia = d.getDate();
  const mes = MESES[d.getMonth()] ?? '';
  const anio = d.getFullYear();

  if (vista === 'dia') return `${dia} de ${mes} de ${anio}`;
  if (vista === 'mes') return `${mes} de ${anio}`;

  const { desde, hasta } = rangoDe('semana', fecha);
  const a = leerFecha(desde);
  const b = leerFecha(hasta);
  if (!a || !b) return '';
  // Una semana que cruza de mes dice los dos meses; si no, se repetiria
  // "1 de septiembre al 7 de septiembre", que sobra.
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} al ${b.getDate()} de ${MESES[a.getMonth()]} de ${b.getFullYear()}`;
  }
  return `${a.getDate()} de ${MESES[a.getMonth()]} al ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`;
}

/** ¿Esta fecha es hoy? Recibe el momento para poder probarse. */
export function esHoy(fecha: Fecha, momento: Date = new Date()): boolean {
  return fecha === desdeDate(momento);
}

/** ¿Cae dentro del mes que se esta viendo? Los dias de relleno se ven apagados. */
export function esDelMes(fecha: Fecha, referencia: Fecha): boolean {
  return inicioDeMes(fecha) === inicioDeMes(referencia);
}
