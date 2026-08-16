/**
 * @vitest-environment happy-dom
 *
 * LAS CUATRO CIFRAS DE ARRIBA.
 *
 * Lo que se vigila es la diferencia entre "todavia no se" y "no hay": mientras
 * carga va una raya, no un cero. Un cero mientras carga se lee como un dia
 * tranquilo, y es la clase de error que nadie reporta.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESUMEN_VACIO, type ResumenDeRecordatorios } from '../../src/datos/recordatorios.js';
import {
  CifrasDeRecordatorios,
  cifrasDeRecordatorios,
} from '../../src/recordatorios/cifras-de-recordatorios.js';

afterEach(cleanup);

const resumen = (r: Partial<ResumenDeRecordatorios> = {}): ResumenDeRecordatorios => ({
  ...RESUMEN_VACIO,
  ...r,
});

describe('mientras carga', () => {
  it('van rayas, NUNCA ceros', () => {
    const cifras = cifrasDeRecordatorios(null);
    expect(cifras.every((c) => c.valor === '—')).toBe(true);
    expect(cifras.every((c) => c.cargando)).toBe(true);
  });

  it('el pie se queda vacio pero reserva su sitio', () => {
    // Sin el hueco reservado, la fila da un brinco al terminar de cargar.
    render(<CifrasDeRecordatorios resumen={null} onIr={() => {}} />);
    expect(document.querySelectorAll('.pz-cifra__pie')).toHaveLength(4);
  });
});

describe('con datos de verdad', () => {
  it('cero es una respuesta, y el pie lo dice', () => {
    const cifras = cifrasDeRecordatorios(resumen());
    expect(cifras[0]!.valor).toBe('0');
    expect(cifras[0]!.pie).toBe('Sin recordatorios pendientes');
    expect(cifras[1]!.pie).toBe('Nada vence hoy');
    expect(cifras[2]!.pie).toBe('No hay recordatorios próximos');
    expect(cifras[3]!.pie).toBe('Ninguno este mes');
  });

  it('los vencidos se avisan en el pie de "pendientes"', () => {
    // Es donde de verdad hace falta: doce pendientes con tres vencidos no es lo
    // mismo que doce pendientes al dia.
    const cifras = cifrasDeRecordatorios(resumen({ pendientes: 12, vencidos: 3 }));
    expect(cifras[0]!.pie).toBe('3 ya vencieron');
  });

  it('un solo vencido se dice en singular', () => {
    const cifras = cifrasDeRecordatorios(resumen({ pendientes: 4, vencidos: 1 }));
    expect(cifras[0]!.pie).toBe('1 ya venció');
  });

  it('la ventana de "proximos" es la CONFIGURADA, no un 7 escrito a mano', () => {
    // Si el centro la sube a 30, la etiqueta tiene que decirlo o habria dos
    // numeros distintos de lo mismo en la misma pantalla.
    expect(cifrasDeRecordatorios(resumen({ diasDeProximos: 30 }))[2]!.etiqueta).toBe(
      'Próximos 30 días',
    );
  });
});

describe('se puede tocar cada una', () => {
  it('cada cifra lleva a su pestaña', async () => {
    const usuario = userEvent.setup();
    const ir = vi.fn();
    render(<CifrasDeRecordatorios resumen={resumen({ hoy: 5 })} onIr={ir} />);
    await usuario.click(screen.getByText('Hoy').closest('button')!);
    expect(ir).toHaveBeenCalledWith('hoy');
  });

  it('las cuatro son botones, no cajas muertas', () => {
    render(<CifrasDeRecordatorios resumen={resumen()} onIr={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });
});
