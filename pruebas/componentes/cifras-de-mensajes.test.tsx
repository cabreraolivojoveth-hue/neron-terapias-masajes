/**
 * @vitest-environment happy-dom
 *
 * LAS CUATRO CIFRAS DE MENSAJES.
 *
 * Las mismas dos formas de mentir con un tablero, vigiladas otra vez: `null` no
 * se convierte en cero, y sin periodo anterior se dice en vez de inventar un
 * porcentaje contra la nada.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ordenarResumen, type ResumenDeMensajes } from '../../src/datos/mensajes.js';
import { CifrasDeMensajes, cifrasDeMensajes } from '../../src/mensajes/cifras-de-mensajes.js';

afterEach(cleanup);

const resumen = (parte: Record<string, unknown>): ResumenDeMensajes => ordenarResumen(parte);

describe('mientras carga no se afirma nada', () => {
  it('sin datos pinta rayas, NUNCA ceros', () => {
    // Un 0 mientras carga dice que hoy no te escribió nadie, y todavía no se
    // sabe. Es la clase de error que nadie reporta.
    const c = cifrasDeMensajes(null);
    expect(c.every((x) => x.valor === '—')).toBe(true);
    expect(c.every((x) => x.cargando)).toBe(true);
  });

  it('con el centro vacío SÍ dice cero, porque eso ya se sabe', () => {
    const c = cifrasDeMensajes(resumen({}));
    expect(c[0]?.valor).toBe('0');
    expect(c[1]?.valor).toBe('0');
  });
});

describe('la comparación contra el periodo anterior', () => {
  it('sin nada antes lo DICE en vez de inventar un porcentaje', () => {
    const c = cifrasDeMensajes(resumen({ enviados: 40 }));
    expect(c[1]?.pie).toBe('Sin comparación disponible');
    expect(c[1]?.sube).toBeNull();
  });

  it('con periodo anterior escribe flecha y porcentaje', () => {
    const c = cifrasDeMensajes(
      resumen({ hayComparacion: true, enviados: 120, enviadosAntes: 100 }),
    );
    expect(c[1]?.pie).toBe('↑ 20.0% vs. período anterior');
    expect(c[1]?.sube).toBe(true);
  });
});

describe('lo que dice cada cifra', () => {
  it('sin conversaciones lo explica en vez de dejar el pie vacío', () => {
    const c = cifrasDeMensajes(resumen({}));
    expect(c[0]?.pie).toBe('Nadie te ha escrito todavía');
    expect(c[3]?.pie).toBe('No hay nadie esperando');
  });

  it('con conversaciones dice cuántos clientes están identificados', () => {
    /**
     * Los dos números no coinciden a propósito: un hilo puede no tener ficha
     * todavía. Decirlo evita que la diferencia parezca un error de cuentas.
     */
    const c = cifrasDeMensajes(resumen({ activas: 5, clientesEnConversacion: 3 }));
    expect(c[0]?.valor).toBe('5');
    expect(c[0]?.pie).toBe('3 clientes identificados');
  });

  it('están las cuatro del diseño', () => {
    render(<CifrasDeMensajes resumen={resumen({})} />);
    for (const t of ['Conversaciones activas', 'Mensajes enviados', 'Mensajes recibidos', 'Pendientes de respuesta']) {
      expect(screen.getByText(t)).toBeTruthy();
    }
  });

  it('mientras carga se anuncia a quien no ve la pantalla', () => {
    render(<CifrasDeMensajes resumen={null} />);
    expect(screen.getByLabelText('Mensajes enviados: cargando')).toBeTruthy();
  });
});
