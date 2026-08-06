/**
 * EL SALUDO Y LA FECHA DEL ENCABEZADO. Aritmetica pura, sin pantalla.
 *
 * Vive aparte para poder probarlo a cualquier hora del dia sin tocar el reloj
 * de la maquina: las funciones RECIBEN el momento en vez de preguntarselo al
 * sistema. Una prueba que dice "a las ocho de la noche saluda con buenas
 * noches" tiene que poder correr a las tres de la tarde.
 */

import type { Fecha } from '@neron/base/utils';

/**
 * LOS NOMBRES ESCRITOS, no `toLocaleDateString`.
 *
 * `Intl` depende de los datos de idioma que traiga el entorno. En un navegador
 * normal sobran, pero en una compilacion recortada de Node —o en el entorno de
 * pruebas— la misma llamada devuelve "Thursday" sin avisar de nada. Doce
 * palabras escritas a mano no se equivocan nunca y se leen igual en todos
 * lados.
 */
const DIAS = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
] as const;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

export type Saludo = 'Buenos días' | 'Buenas tardes' | 'Buenas noches';

/**
 * El saludo segun la hora, con los cortes de aqui.
 *
 * De 5 a 11:59 es mañana, de 12 a 18:59 tarde, y de 19 en adelante noche —
 * incluida la madrugada, que sigue siendo "buenas noches" para quien cierra
 * caja a la una. Los cortes de la escuela (6 y 20) dejan un "buenos días" a
 * las siete y media de la noche en invierno, que se lee raro.
 */
export function saludoSegunLaHora(momento: Date = new Date()): Saludo {
  const hora = momento.getHours();
  if (hora >= 5 && hora < 12) return 'Buenos días';
  if (hora >= 12 && hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * El primer nombre de quien entro.
 *
 * Se saluda con el nombre, no con el nombre completo: "¡Buenos días, María
 * Guadalupe Hernández del Río!" no lo dice nadie. Si el nombre viene vacio se
 * devuelve vacio y quien lo pinta decide — nunca un "Usuario" inventado.
 */
export function primerNombre(nombreCompleto: string | null | undefined): string {
  const limpio = (nombreCompleto ?? '').trim().replace(/\s+/g, ' ');
  if (!limpio) return '';
  // Un correo de nombre —pasa cuando la cuenta todavia no tiene nombre
  // puesto— se corta antes de la arroba en vez de saludar a "ana@centro.mx".
  const sinCorreo = limpio.includes('@') ? (limpio.split('@')[0] ?? limpio) : limpio;
  return sinCorreo.split(' ')[0] ?? '';
}

/** `¡Buenos días, María!` — o sin nombre si todavia no se sabe cual es. */
export function encabezadoDeSaludo(
  nombreCompleto: string | null | undefined,
  momento: Date = new Date(),
): string {
  const saludo = saludoSegunLaHora(momento);
  const nombre = primerNombre(nombreCompleto);
  return nombre ? `¡${saludo}, ${nombre}!` : `¡${saludo}!`;
}

/**
 * `10/07/2025` → `Jueves, 10 de julio de 2025`.
 *
 * Se arma a mano desde las tres partes del texto. Pasarlo por `new Date` es lo
 * que mueve la fecha un dia segun la zona horaria de quien abrio la pantalla,
 * y el dia que se ve mal es justo el que la persona esta mirando.
 *
 * Para saber QUE DIA DE LA SEMANA cae si hace falta un calendario, y ahi se
 * usa mediodia UTC: a mediodia sobra margen para cualquier salto de horario de
 * verano, que a medianoche cambia el dia.
 */
export function fechaLarga(fecha: Fecha): string {
  const partes = fecha.split('/');
  const dia = Number(partes[0]);
  const mes = Number(partes[1]);
  const anio = Number(partes[2]);
  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(anio)) return '';
  if (mes < 1 || mes > 12) return '';

  const iso = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const marca = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(marca)) return '';

  const nombreDelDia = DIAS[new Date(marca).getUTCDay()] ?? '';
  return `${nombreDelDia}, ${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/** `Lun`, `Mar`… para el eje de la grafica. Vacio si la fecha no se entiende. */
export function diaCorto(fecha: Fecha): string {
  const partes = fecha.split('/');
  const iso = `${partes[2] ?? ''}-${partes[1] ?? ''}-${partes[0] ?? ''}`;
  const marca = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(marca)) return '';
  return (DIAS[new Date(marca).getUTCDay()] ?? '').slice(0, 3);
}

/** `Jueves 10 de julio` — lo que dice el globito de la grafica. */
export function diaYMes(fecha: Fecha): string {
  const partes = fecha.split('/');
  const dia = Number(partes[0]);
  const mes = Number(partes[1]);
  if (!Number.isFinite(dia) || mes < 1 || mes > 12) return fecha;
  const largo = fechaLarga(fecha);
  const nombreDelDia = largo.split(',')[0] ?? '';
  return `${nombreDelDia} ${dia} de ${MESES[mes - 1]}`;
}
