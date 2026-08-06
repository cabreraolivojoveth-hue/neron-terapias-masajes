/**
 * LAS FECHAS Y DURACIONES ESCRITAS EN PALABRAS.
 *
 * Vive fuera de Inicio y fuera de Agenda porque las dos pantallas escriben la
 * misma fecha —"Jueves 10 de julio de 2025"— y si cada una la armara por su
 * cuenta terminarian escribiendola distinto. Que Agenda importara este texto
 * desde Inicio seria peor todavia: dos modulos que solo comparten una forma de
 * escribir no tienen por que depender uno del otro.
 *
 * LOS NOMBRES ESTAN ESCRITOS, no salen de `toLocaleDateString`.
 *
 * `Intl` depende de los datos de idioma que traiga el entorno. En un navegador
 * normal sobran, pero en una compilacion recortada de Node —o en el entorno de
 * pruebas— la misma llamada devuelve "Thursday" sin avisar de nada. Doce
 * palabras escritas a mano no se equivocan nunca y se leen igual en todos
 * lados.
 *
 * NADA DE AQUI PASA POR `new Date(texto)`. Se parte el texto `dd/mm/aaaa` a
 * mano y, cuando hace falta saber el dia de la semana, se pregunta a mediodia
 * UTC: a mediodia sobra margen para cualquier salto de horario de verano, que
 * a medianoche cambia el dia. Es lo que evita que la fecha se mueva un dia
 * segun la zona horaria de quien abrio la pantalla — y el dia que se ve mal es
 * justo el que la persona esta mirando.
 */

import type { Fecha } from '@neron/base/utils';

const DIAS = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
] as const;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

interface Partida {
  readonly dia: number;
  readonly mes: number;
  readonly anio: number;
  /** 0 = domingo, como `getUTCDay`. */
  readonly diaDeLaSemana: number;
}

/** Parte `dd/mm/aaaa`. `null` si no se entiende — nunca una fecha inventada. */
function partir(fecha: Fecha): Partida | null {
  const partes = fecha.split('/');
  const dia = Number(partes[0]);
  const mes = Number(partes[1]);
  const anio = Number(partes[2]);
  if (!Number.isInteger(dia) || !Number.isInteger(mes) || !Number.isInteger(anio)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const iso = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const marca = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(marca)) return null;

  const d = new Date(marca);
  // Un 31 de febrero se desborda al 3 de marzo: si el dia que vuelve no es el
  // que entro, la fecha no existia.
  if (d.getUTCDate() !== dia || d.getUTCMonth() + 1 !== mes) return null;

  return { dia, mes, anio, diaDeLaSemana: d.getUTCDay() };
}

/** `10/07/2025` → `Jueves, 10 de julio de 2025`. Vacio si no se entiende. */
export function fechaLarga(fecha: Fecha): string {
  const p = partir(fecha);
  if (!p) return '';
  return `${DIAS[p.diaDeLaSemana]}, ${p.dia} de ${MESES[p.mes - 1]} de ${p.anio}`;
}

/** `10 de julio de 2025` — sin el dia de la semana, para la barra de Agenda. */
export function fechaConMes(fecha: Fecha): string {
  const p = partir(fecha);
  if (!p) return '';
  return `${p.dia} de ${MESES[p.mes - 1]} de ${p.anio}`;
}

/** `Jueves 10 de julio` — lo que dice el globito de la grafica. */
export function diaYMes(fecha: Fecha): string {
  const p = partir(fecha);
  if (!p) return fecha;
  return `${DIAS[p.diaDeLaSemana]} ${p.dia} de ${MESES[p.mes - 1]}`;
}

/** `Lun`, `Mar`… para el eje de la grafica y el encabezado de la semana. */
export function diaCorto(fecha: Fecha): string {
  const p = partir(fecha);
  return p ? (DIAS[p.diaDeLaSemana] ?? '').slice(0, 3) : '';
}

/** `Jueves` completo, para el encabezado de la vista de dia. */
export function diaDeLaSemana(fecha: Fecha): string {
  const p = partir(fecha);
  return p ? (DIAS[p.diaDeLaSemana] ?? '') : '';
}

/** `julio de 2025` — el titulo de la vista de mes. */
export function mesYAnio(fecha: Fecha): string {
  const p = partir(fecha);
  if (!p) return '';
  return `${MESES[p.mes - 1]} de ${p.anio}`;
}

/**
 * `60` → `1 hora`, `90` → `1 h 30 min`, `45` → `45 min`.
 *
 * Se escribe en palabras y no "60 min" porque en el panel de la cita esta al
 * lado del rango de horas: "09:00 – 10:00 (60 min)" obliga a hacer la cuenta
 * para confirmar que cuadra; "(1 hora)" se lee de un golpe.
 */
export function duracionEnPalabras(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return '';
  const enteros = Math.round(minutos);
  const horas = Math.floor(enteros / 60);
  const resto = enteros % 60;
  if (horas === 0) return `${resto} min`;
  const parteHoras = horas === 1 ? '1 hora' : `${horas} horas`;
  return resto === 0 ? parteHoras : `${horas} h ${resto} min`;
}
