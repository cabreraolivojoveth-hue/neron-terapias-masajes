/**
 * LOS AVISOS DE UN RECORDATORIO CUANDO LLEGA SU HORA.
 *
 * QUE HACE Y QUE NO HACE, PORQUE LA DIFERENCIA IMPORTA:
 *
 *   SI  — avisa con la notificación del navegador mientras la aplicación está
 *         abierta, con la anticipación configurada, una sola vez por
 *         recordatorio.
 *   NO  — no manda correos ni WhatsApp, y no avisa con la pestaña cerrada.
 *
 * Y ESO SE DICE EN LA PANTALLA DE CONFIGURACIÓN, con todas sus letras. Un
 * interruptor que promete "notificaciones" y solo funciona con la pestaña
 * abierta es peor que no tenerlo: alguien confía en él, cierra el navegador y
 * se pierde el aviso que sí importaba. Para avisar con todo cerrado hace falta
 * un servidor que corra solo —un cron o un worker— y eso todavía no existe en
 * esta infraestructura; el día que exista, esta misma anticipación y este mismo
 * `notificado_en` le sirven tal cual.
 *
 * EL PERMISO SE PIDE CUANDO SE ENCIENDE EL INTERRUPTOR, no al abrir la
 * pantalla. Pedir permiso de notificaciones sin que nadie lo haya pedido es la
 * forma más rápida de que alguien lo bloquee para siempre — y una vez
 * bloqueado, ya no hay manera de volver a preguntar.
 *
 * NO SE REPITE. Al avisar se marca `notificado_en` en la base, así que abrir la
 * aplicación en otra pestaña no vuelve a sonar. Y al mover la fecha o la hora,
 * la base limpia esa marca sola: un recordatorio pospuesto a mañana tiene que
 * volver a avisar.
 */

import type { Fecha, Hora24 } from '@neron/base/utils';
import type { RecordatorioEnLista } from '../datos/recordatorios.js';
import { cuandoAvisar, cuandoEnPalabras } from './plazos.js';

/** Lo que hace falta saber de un recordatorio para decidir si toca avisar. */
export interface Avisable {
  readonly id: string;
  readonly titulo: string;
  readonly fecha: Fecha;
  readonly hora: Hora24 | null;
  readonly estado: string;
  readonly anticipacionMin: number | null;
  readonly notificadoEn: string | null;
  readonly responsableId: string | null;
}

/**
 * Cuáles toca avisar en este momento.
 *
 * FUNCION PURA: recibe el reloj en vez de mirarlo. Es lo que deja probar "las
 * 9:29 no avisa y las 9:30 sí" sin tener que esperar un minuto.
 *
 * SOLO LOS PENDIENTES, y solo los que no se han avisado ya. Un recordatorio
 * completado que suena es exactamente el aviso falso que enseña a apagar los
 * avisos.
 *
 * NO SE AVISA DE LO MUY VIEJO. Un recordatorio de hace tres semanas que nadie
 * cerró no tiene que sonar en cuanto alguien abra la aplicación: si no, quien
 * vuelve de vacaciones recibe cuarenta notificaciones de golpe y las cierra
 * todas sin leer una.
 */
export function loQueTocaAvisar(
  recordatorios: readonly Avisable[],
  ahora: Date,
  horaPorOmision: Hora24,
  anticipacionDelCentro: number,
  soloDeEstaPersona: string | null,
): Avisable[] {
  const ahoraMs = ahora.getTime();
  const HACE_UN_DIA = ahoraMs - 24 * 60 * 60 * 1000;

  return recordatorios.filter((r) => {
    if (r.estado !== 'pendiente') return false;
    if (r.notificadoEn !== null) return false;
    // Con el aviso restringido al responsable, los que no son de nadie siguen
    // sonando: si no, un recordatorio sin asignar no le avisaria a nadie nunca
    // y seria justo el que se olvida.
    if (soloDeEstaPersona !== null && r.responsableId !== null) {
      if (r.responsableId !== soloDeEstaPersona) return false;
    }

    const cuando = cuandoAvisar(
      r.fecha,
      r.hora,
      horaPorOmision,
      r.anticipacionMin ?? anticipacionDelCentro,
    );
    if (cuando === null) return false;
    return cuando <= ahoraMs && cuando >= HACE_UN_DIA;
  });
}

/** Si el navegador de quien mira puede notificar. */
export function hayNotificaciones(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export type PermisoDeAviso = 'concedido' | 'negado' | 'sin-preguntar' | 'no-se-puede';

export function permisoDeAviso(): PermisoDeAviso {
  if (!hayNotificaciones()) return 'no-se-puede';
  const p = Notification.permission;
  if (p === 'granted') return 'concedido';
  if (p === 'denied') return 'negado';
  return 'sin-preguntar';
}

/**
 * Pide permiso. Se llama SOLO desde el interruptor de Configuración.
 *
 * Devuelve el estado final para poder decirlo en pantalla: un interruptor que
 * se queda encendido cuando el navegador dijo que no es un interruptor que
 * miente, y quien lo mira cree que va a recibir avisos.
 */
export async function pedirPermisoDeAviso(): Promise<PermisoDeAviso> {
  if (!hayNotificaciones()) return 'no-se-puede';
  if (Notification.permission === 'granted') return 'concedido';
  if (Notification.permission === 'denied') return 'negado';
  const r = await Notification.requestPermission();
  return r === 'granted' ? 'concedido' : r === 'denied' ? 'negado' : 'sin-preguntar';
}

/**
 * Lanza el aviso. Devuelve `true` si de verdad salió.
 *
 * DEVOLVER SI SALIO NO ES UN DETALLE: solo se marca `notificado_en` cuando el
 * aviso de verdad se lanzó. Marcarlo antes dejaría un recordatorio que consta
 * como avisado y del que nadie se enteró — y eso es peor que no avisar, porque
 * ya no va a volver a intentarlo.
 */
export function avisar(r: Avisable): boolean {
  if (permisoDeAviso() !== 'concedido') return false;
  try {
    // La etiqueta es el id: si el sistema operativo ya tiene una notificación
    // de este recordatorio en pantalla, la sustituye en vez de apilar dos.
    new Notification(r.titulo, {
      body: `Vence ${cuandoEnPalabras(r.fecha, r.hora)}`,
      tag: `recordatorio-${r.id}`,
    });
    return true;
  } catch {
    // Algunos navegadores revientan al construir una Notification fuera de un
    // gesto del usuario. Un aviso que no sale no puede tumbar la pantalla.
    return false;
  }
}

/** Lo que llega de la lista, con solo lo que el aviso necesita. */
export function comoAvisable(r: RecordatorioEnLista): Avisable {
  return {
    id: r.id,
    titulo: r.titulo,
    fecha: r.fecha,
    hora: r.hora,
    estado: r.estado,
    anticipacionMin: r.anticipacionMin,
    notificadoEn: r.notificadoEn,
    responsableId: r.responsableId,
  };
}

/**
 * Cada cuánto se comprueba si a alguno le tocó ya.
 *
 * UN MINUTO. Menos es gastar por gusto —la anticipación más fina que se puede
 * configurar son cinco minutos— y más haría que un aviso "al momento" saliera
 * tarde justo cuando más importa.
 */
export const CADA_CUANTO_SE_MIRA = 60_000;
