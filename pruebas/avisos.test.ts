/**
 * LOS AVISOS: a quien le toca sonar, y cuando.
 *
 * Se prueba la DECISION —cual de la lista toca ahora mismo— y no el disparo,
 * que depende del navegador. Es lo que deja comprobar "las 9:29 no y las 9:30
 * sí" sin esperar un minuto.
 */

import { describe, expect, it } from 'vitest';
import { CADA_CUANTO_SE_MIRA, loQueTocaAvisar, type Avisable } from '../src/recordatorios/avisos.js';

const uno = (a: Partial<Avisable> = {}): Avisable => ({
  id: 'r1',
  titulo: 'Llamar',
  fecha: '16/08/2026',
  hora: '10:00',
  estado: 'pendiente',
  anticipacionMin: null,
  notificadoEn: null,
  responsableId: null,
  ...a,
});

/** Las 9:30 del 16/08/2026, media hora antes de un recordatorio de las 10. */
const JUSTO = new Date(2026, 7, 16, 9, 30, 0);
const ANTES = new Date(2026, 7, 16, 9, 29, 0);

describe('a quien le toca sonar', () => {
  it('un minuto antes de la anticipacion, todavia no', () => {
    expect(loQueTocaAvisar([uno()], ANTES, '09:00', 30, null)).toEqual([]);
  });

  it('al llegar la anticipacion, si', () => {
    expect(loQueTocaAvisar([uno()], JUSTO, '09:00', 30, null)).toHaveLength(1);
  });

  it('el completado NO suena', () => {
    // Un aviso de algo ya resuelto es exactamente lo que enseña a apagar los
    // avisos.
    expect(loQueTocaAvisar([uno({ estado: 'hecho' })], JUSTO, '09:00', 30, null)).toEqual([]);
    expect(loQueTocaAvisar([uno({ estado: 'descartado' })], JUSTO, '09:00', 30, null)).toEqual([]);
  });

  it('no se repite: el que ya se aviso se salta', () => {
    const ya = uno({ notificadoEn: '2026-08-16T09:30:00Z' });
    expect(loQueTocaAvisar([ya], JUSTO, '09:00', 30, null)).toEqual([]);
  });

  it('la anticipacion propia manda sobre la del centro', () => {
    // Un recordatorio puede pedir un dia de antelacion sin cambiarselo a los
    // demas.
    const suyo = uno({ anticipacionMin: 0 });
    expect(loQueTocaAvisar([suyo], JUSTO, '09:00', 30, null)).toEqual([]);
    expect(loQueTocaAvisar([suyo], new Date(2026, 7, 16, 10, 0, 0), '09:00', 30, null)).toHaveLength(1);
  });

  it('los de todo el dia usan la hora del centro', () => {
    const todoElDia = uno({ hora: null, anticipacionMin: 0 });
    expect(loQueTocaAvisar([todoElDia], new Date(2026, 7, 16, 8, 59, 0), '09:00', 30, null)).toEqual([]);
    expect(loQueTocaAvisar([todoElDia], new Date(2026, 7, 16, 9, 0, 0), '09:00', 30, null)).toHaveLength(1);
  });

  it('lo muy viejo NO suena al abrir la aplicacion', () => {
    // Quien vuelve de vacaciones recibiria cuarenta notificaciones de golpe y
    // las cerraria todas sin leer una.
    const viejo = uno({ fecha: '01/07/2026' });
    expect(loQueTocaAvisar([viejo], JUSTO, '09:00', 30, null)).toEqual([]);
  });

  it('con el aviso restringido, el de otra persona no suena', () => {
    const ajeno = uno({ responsableId: 'm2' });
    expect(loQueTocaAvisar([ajeno], JUSTO, '09:00', 30, 'm1')).toEqual([]);
    expect(loQueTocaAvisar([ajeno], JUSTO, '09:00', 30, 'm2')).toHaveLength(1);
  });

  it('pero el que no es de nadie SI suena, aunque este restringido', () => {
    // Si no, un recordatorio sin asignar no le avisaria a nadie nunca — y seria
    // justo el que se olvida.
    expect(loQueTocaAvisar([uno({ responsableId: null })], JUSTO, '09:00', 30, 'm1')).toHaveLength(1);
  });

  it('una fecha rota no dispara nada', () => {
    expect(loQueTocaAvisar([uno({ fecha: 'roto' })], JUSTO, '09:00', 30, null)).toEqual([]);
  });
});

describe('cada cuanto se mira', () => {
  it('un minuto: ni mas fino que la anticipacion mas corta, ni tan grueso que llegue tarde', () => {
    expect(CADA_CUANTO_SE_MIRA).toBe(60_000);
  });
});
