/**
 * La traduccion de fechas entre la aplicacion y la base.
 *
 * Se prueba con saña porque es el punto donde una fecha se mueve un dia sin
 * que nada falle: el sintoma es una cita que aparece el lunes para una persona
 * y el domingo para otra, y se busca durante horas en el lugar equivocado.
 */
import { describe, expect, it } from 'vitest';
import { aBase, deBase, reventar } from '../src/datos/fechas-de-la-base.js';

describe('de la aplicacion a la base', () => {
  it('convierte dd/mm/aaaa al formato de la base', () => {
    expect(aBase('10/07/2025')).toBe('2025-07-10');
  });

  it('conserva el dia en el cambio de mes', () => {
    expect(aBase('01/01/2026')).toBe('2026-01-01');
    expect(aBase('31/12/2025')).toBe('2025-12-31');
  });
});

describe('de la base a la aplicacion', () => {
  it('acepta el texto que devuelve Postgres', () => {
    expect(deBase('2025-07-10')).toBe('10/07/2025');
  });

  it('acepta tambien una marca de tiempo completa', () => {
    // Segun la version del controlador, una columna `date` puede llegar con
    // la hora pegada. Se recortan los primeros diez caracteres.
    expect(deBase('2025-07-10T00:00:00.000Z')).toBe('10/07/2025');
  });

  it('un objeto Date se lee en HORA LOCAL, no en UTC', () => {
    /**
     * ES LA PRUEBA IMPORTANTE DE TODO EL ARCHIVO.
     *
     * `toISOString()` pasa por UTC. En México, un Date de la medianoche local
     * del 10 de julio sale como el 9 en UTC — la cita se muestra un dia antes
     * y nadie sospecha de la conversion.
     */
    const d = new Date(2025, 6, 10, 0, 30, 0);
    expect(deBase(d)).toBe('10/07/2025');
  });

  it('ida y vuelta no cambia la fecha', () => {
    for (const f of ['01/01/2026', '29/02/2024', '31/12/2025', '15/08/2026']) {
      expect(deBase(aBase(f))).toBe(f);
    }
  });
});

describe('el grito cuando la base contesta mal', () => {
  it('sin error no pasa nada', () => {
    expect(() => reventar(null, 'cargar el tablero')).not.toThrow();
  });

  it('el mensaje dice QUE se estaba haciendo, no solo que fallo', () => {
    // "column does not exist" a secas no le dice a nadie que fue al cargar el
    // tablero. Con el nombre de la operacion, se sabe donde mirar.
    expect(() => reventar({ message: 'column does not exist' }, 'cargar el tablero')).toThrow(
      /cargar el tablero: column does not exist/,
    );
  });
});
