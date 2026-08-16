/**
 * LOS PLAZOS DE UN RECORDATORIO: urgencia, aplazamientos y repeticiones.
 *
 * TODO ES FUNCION PURA, sin React y sin base de datos, y por eso se puede
 * probar entero. La regla del proyecto: si una decision se puede sacar de un
 * componente, se saca — dentro de un componente solo se prueba abriendo un
 * navegador.
 *
 * NUNCA SE PASA UNA FECHA POR `new Date(texto)`. El navegador lee
 * `'2026-08-05'` como UTC y en México eso retrocede al dia 4: un recordatorio
 * de hoy saldria como vencido, y solo para quien tenga el reloj de cierta
 * manera. Toda la aritmetica va con las utilidades de la base, que trabajan
 * sobre `dd/mm/aaaa` con numeros locales.
 */

import { diasEntre, esFecha, hora24aLegible, sumarDias, type Fecha, type Hora24 } from '@neron/base/utils';
import {
  COMO_SE_DICE_LA_FRECUENCIA,
  type EstadoDeRecordatorio,
  type FrecuenciaDeRepeticion,
} from '../datos/recordatorios.js';

/* ------------------------------------------------------------------ */
/* La urgencia                                                         */
/* ------------------------------------------------------------------ */

/**
 * Como se pinta un recordatorio.
 *
 * `cerrado` cubre completado y cancelado: los dos salieron de la lista de lo
 * que hay que hacer, y distinguirlos aqui pondria dos colores a algo que ya no
 * pide nada. La palabra del estado si los distingue.
 */
export type Urgencia = 'vencido' | 'hoy' | 'manana' | 'proximo' | 'cerrado';

export function urgenciaDe(
  estado: EstadoDeRecordatorio,
  fecha: Fecha,
  hoy: Fecha,
): Urgencia {
  if (estado !== 'pendiente') return 'cerrado';

  /**
   * Una fecha ilegible cae en "proximo", NUNCA en "vencido" ni en "hoy".
   *
   * `diasEntre` con texto que no es fecha devuelve cero, y cero significa hoy:
   * un renglon con la fecha corrupta se pintaria en ambar gritando que urge. Se
   * prefiere que un dato roto pase desapercibido a que dispare una alarma
   * falsa — una alarma falsa enseña a ignorar las de verdad.
   */
  if (!esFecha(fecha) || !esFecha(hoy)) return 'proximo';

  const dias = diasEntre(hoy, fecha);
  if (!Number.isFinite(dias)) return 'proximo';
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'manana';
  return 'proximo';
}

export function comoSeDiceLaUrgencia(u: Urgencia): string {
  if (u === 'vencido') return 'Vencido';
  if (u === 'hoy') return 'Hoy';
  if (u === 'manana') return 'Mañana';
  if (u === 'cerrado') return 'Cerrado';
  return 'Próximo';
}

/**
 * El tono de la pastilla compartida que le toca a cada urgencia.
 *
 * SON LOS TONOS NEUTROS DE LA BASE, no colores nuevos: `peligro` para lo
 * vencido, `aviso` para hoy y mañana, `marca` para lo proximo. Inventar un tono
 * por estado es como empezaron las ocho tarjetas distintas.
 */
export const TONO_DE_LA_URGENCIA: Readonly<Record<Urgencia, string>> = {
  vencido: 'peligro',
  hoy: 'aviso',
  manana: 'aviso',
  proximo: 'marca',
  cerrado: 'exito',
};

/**
 * Como se lee el estado en la pastilla de la tabla.
 *
 * MEZCLA ESTADO Y URGENCIA A PROPOSITO, porque es lo que hace falta saber de un
 * vistazo: "Vencido" y "Hoy" son mas utiles que repetir "Pendiente" ocho veces
 * seguidas. Lo que NO se hace es convertir vencido en un estado guardado — es
 * pendiente, y se puede completar, posponer y editar igual.
 */
export function etiquetaDeEstado(
  estado: EstadoDeRecordatorio,
  fecha: Fecha,
  hoy: Fecha,
): { readonly texto: string; readonly tono: string } {
  if (estado === 'hecho') return { texto: 'Completado', tono: 'exito' };
  if (estado === 'descartado') return { texto: 'Cancelado', tono: 'peligro' };
  const u = urgenciaDe(estado, fecha, hoy);
  if (u === 'vencido') return { texto: 'Vencido', tono: 'peligro' };
  if (u === 'hoy') return { texto: 'Hoy', tono: 'aviso' };
  if (u === 'manana') return { texto: 'Mañana', tono: 'aviso' };
  return { texto: 'Próximo', tono: 'marca' };
}

/** La fecha y la hora en una linea, como se leen en la tabla. */
export function cuandoEnPalabras(fecha: Fecha, hora: Hora24 | null): string {
  return hora === null ? fecha : `${fecha} · ${hora24aLegible(hora)}`;
}

/* ------------------------------------------------------------------ */
/* Posponer                                                            */
/* ------------------------------------------------------------------ */

export interface OpcionDeAplazamiento {
  readonly clave: string;
  readonly etiqueta: string;
  readonly fecha: Fecha;
  /** `null` = conserva la hora que ya tenia. */
  readonly hora: Hora24 | null;
}

/**
 * Las cuatro formas rapidas de posponer.
 *
 * "MAS TARDE" NO ES UNA FECHA DISTINTA: es hoy, unas horas despues. Y por eso
 * es la unica que toca la hora. Convertirla en "mañana" —que es lo que hacen
 * casi todas las listas de pendientes— hace que quien solo queria quitarselo de
 * enmedio un rato lo pierda de vista todo el dia.
 *
 * SE CALCULAN DESDE `hoy`, que llega de fuera: asi la funcion es pura y la
 * prueba puede fijar el dia sin tocar el reloj de la maquina.
 */
export function opcionesDeAplazamiento(
  hoy: Fecha,
  ahora: Date,
  horaActual: Hora24 | null,
): OpcionDeAplazamiento[] {
  // Tres horas mas tarde, redondeado a la hora en punto. Un "más tarde" que cae
  // a las 15:43 se lee como un accidente.
  const enTresHoras = new Date(ahora.getTime() + 3 * 60 * 60 * 1000);
  const masTarde = `${String(enTresHoras.getHours()).padStart(2, '0')}:00`;

  return [
    {
      clave: 'masTarde',
      etiqueta: `Más tarde (hoy, ${hora24aLegible(masTarde)})`,
      fecha: hoy,
      hora: masTarde,
    },
    { clave: 'manana', etiqueta: 'Mañana', fecha: sumarDias(hoy, 1), hora: horaActual },
    {
      clave: 'proximaSemana',
      etiqueta: 'La próxima semana',
      fecha: sumarDias(hoy, 7),
      hora: horaActual,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* El filtro por fecha                                                 */
/* ------------------------------------------------------------------ */

/**
 * Las fechas de cada rango del filtro, calculadas contra el dia de hoy.
 *
 * SE CALCULAN AQUI Y NO SE GUARDAN. Un "próximos 7 días" con las fechas
 * escritas al escoger el filtro se queda viejo en cuanto la pestaña pasa la
 * medianoche: seguiria enseñando la ventana de ayer con la etiqueta de hoy.
 *
 * "VENCIDOS" NO TIENE FECHA DE INICIO a proposito. Poner un tope —los ultimos
 * treinta dias, por ejemplo— escondería justo el que lleva mas tiempo sin
 * atenderse, que es el que hay que ver.
 */
export function rangoEnFechas(
  rango: string,
  desdeLibre: string,
  hastaLibre: string,
  hoy: Fecha,
): { readonly desde: string; readonly hasta: string } {
  if (rango === 'hoy') return { desde: hoy, hasta: hoy };
  if (rango === 'manana') {
    const m = sumarDias(hoy, 1);
    return { desde: m, hasta: m };
  }
  if (rango === 'siete') return { desde: hoy, hasta: sumarDias(hoy, 7) };
  if (rango === 'treinta') return { desde: hoy, hasta: sumarDias(hoy, 30) };
  if (rango === 'vencidos') return { desde: '', hasta: sumarDias(hoy, -1) };
  if (rango === 'personalizado') return { desde: desdeLibre, hasta: hastaLibre };
  return { desde: '', hasta: '' };
}

/* ------------------------------------------------------------------ */
/* Las repeticiones                                                    */
/* ------------------------------------------------------------------ */

/** Los dias de la semana en numeracion ISO, que es la que usa la base. */
export const DIAS_DE_LA_SEMANA: readonly { readonly iso: number; readonly corto: string; readonly largo: string }[] = [
  { iso: 1, corto: 'L', largo: 'lunes' },
  { iso: 2, corto: 'M', largo: 'martes' },
  { iso: 3, corto: 'X', largo: 'miércoles' },
  { iso: 4, corto: 'J', largo: 'jueves' },
  { iso: 5, corto: 'V', largo: 'viernes' },
  { iso: 6, corto: 'S', largo: 'sábado' },
  { iso: 7, corto: 'D', largo: 'domingo' },
];

/**
 * La regla escrita en español, para poder revisarla antes de guardarla.
 *
 * SIN ESTO NADIE SABE QUE ACABA DE CONFIGURAR. Un formulario con "frecuencia:
 * semanal, intervalo: 2, días: [1,4]" es legible para quien lo programo y para
 * nadie mas; "Cada 2 semanas, lunes y jueves" es lo que deja cachar que uno
 * queria decir otra cosa antes de que empiece a generar recordatorios.
 */
export function repeticionEnPalabras(
  frecuencia: FrecuenciaDeRepeticion,
  intervalo: number,
  diasSemana: readonly number[],
): string {
  const cada = intervalo > 1 ? `Cada ${intervalo} ` : 'Cada ';

  if (frecuencia === 'diario') return intervalo > 1 ? `${cada}días` : 'Todos los días';
  if (frecuencia === 'mensual') return intervalo > 1 ? `${cada}meses` : 'Cada mes';
  if (frecuencia === 'anual') return intervalo > 1 ? `${cada}años` : 'Cada año';

  const nombres = DIAS_DE_LA_SEMANA.filter((d) => diasSemana.includes(d.iso)).map((d) => d.largo);
  const base = intervalo > 1 ? `${cada}semanas` : 'Cada semana';
  if (nombres.length === 0) return base;
  if (nombres.length === 1) return `${base}, ${nombres[0]}`;

  const ultimo = nombres[nombres.length - 1]!;
  return `${base}, ${nombres.slice(0, -1).join(', ')} y ${ultimo}`;
}

/** Como se resume una repeticion en su renglon, con su tope si lo tiene. */
export function topeEnPalabras(fechaFin: Fecha | null, repeticiones: number | null): string {
  if (fechaFin !== null) return `hasta el ${fechaFin}`;
  if (repeticiones !== null) return `${repeticiones} ${repeticiones === 1 ? 'vez' : 'veces'}`;
  return 'sin fecha de término';
}

/* ------------------------------------------------------------------ */
/* Los avisos                                                          */
/* ------------------------------------------------------------------ */

/**
 * Cuando le toca sonar a un recordatorio, en milisegundos desde la epoca.
 *
 * LA HORA QUE FALTA LA PONE LA CONFIGURACION DEL CENTRO, no la medianoche. Un
 * recordatorio de todo el dia con hora 00:00 avisa a las doce de la noche, que
 * es exactamente cuando nadie lo va a leer y justo lo que enseña a apagar los
 * avisos.
 *
 * Devuelve `null` si la fecha no se puede leer: un dato roto no dispara nada.
 */
export function cuandoAvisar(
  fecha: Fecha,
  hora: Hora24 | null,
  horaPorOmision: Hora24,
  anticipacionMin: number,
): number | null {
  if (!esFecha(fecha)) return null;
  const [dia, mes, ano] = fecha.split('/').map((n) => Number(n));
  if (!dia || !mes || !ano) return null;

  const reloj = (hora ?? horaPorOmision).split(':');
  const h = Number(reloj[0] ?? 0);
  const m = Number(reloj[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;

  // Se construye con numeros locales, nunca con texto: `new Date('2026-08-05')`
  // lo leeria como UTC y en México restaria un dia.
  const momento = new Date(ano, mes - 1, dia, h, m, 0, 0);
  return momento.getTime() - anticipacionMin * 60 * 1000;
}
