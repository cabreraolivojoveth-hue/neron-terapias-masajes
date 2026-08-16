/**
 * @vitest-environment happy-dom
 *
 * POSPONER.
 *
 * Lo que se vigila: que se VEA la fecha nueva antes de aceptar, que las
 * opciones rápidas manden la fecha correcta, y que dejar la hora vacía CONSERVE
 * la que tenía en vez de convertirlo en uno de todo el día.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecordatorioEnLista } from '../../src/datos/recordatorios.js';
import { Aplazar } from '../../src/recordatorios/aplazar.js';

afterEach(cleanup);

const HOY = '16/08/2026';
const ALAS_DIEZ = new Date(2026, 7, 16, 10, 0, 0);

const uno = (r: Partial<RecordatorioEnLista> = {}): RecordatorioEnLista => ({
  id: 'r1',
  titulo: 'Llamar al proveedor',
  detalle: null,
  notas: null,
  fecha: HOY,
  hora: '10:00',
  prioridad: 'normal',
  estado: 'pendiente',
  vencido: false,
  categoriaId: null,
  categoria: null,
  categoriaColor: null,
  responsableId: null,
  responsable: null,
  entidadTipo: null,
  entidadId: null,
  entidadNombre: null,
  entidadContacto: null,
  recurrenteId: null,
  recurrencia: null,
  automatizacionId: null,
  origenTipo: null,
  anticipacionMin: null,
  notificadoEn: null,
  completadoEn: null,
  completadoPor: null,
  creadoPor: null,
  creadoEn: '2026-08-16T08:00:00Z',
  actualizadoEn: null,
  ...r,
});

const props = {
  recordatorio: uno(),
  hoy: HOY,
  ahora: ALAS_DIEZ,
  trabajando: false,
  error: null,
  onAplazar: () => {},
  onCerrar: () => {},
};

describe('sin nada escogido', () => {
  it('no se pinta nada', () => {
    const { container } = render(<Aplazar {...props} recordatorio={null} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('lo que se ve', () => {
  it('se DICE para cuando esta ahora, antes de moverlo', () => {
    // Sin esto, posponer es un salto a ciegas: no se sabe de que fecha se viene.
    render(<Aplazar {...props} />);
    expect(screen.getByText(/Ahora está para 16\/08\/2026/)).toBeTruthy();
  });

  it('salen las tres opciones rapidas', () => {
    render(<Aplazar {...props} />);
    expect(screen.getByRole('button', { name: /Más tarde/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mañana' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'La próxima semana' })).toBeTruthy();
  });
});

describe('las opciones rapidas', () => {
  it('"mas tarde" pospone a HOY, no a mañana', async () => {
    const usuario = userEvent.setup();
    const aplazar = vi.fn();
    render(<Aplazar {...props} onAplazar={aplazar} />);
    await usuario.click(screen.getByRole('button', { name: /Más tarde/ }));
    expect(aplazar).toHaveBeenCalledWith(HOY, '13:00');
  });

  it('"mañana" conserva la hora que tenia', async () => {
    const usuario = userEvent.setup();
    const aplazar = vi.fn();
    render(<Aplazar {...props} onAplazar={aplazar} />);
    await usuario.click(screen.getByRole('button', { name: 'Mañana' }));
    expect(aplazar).toHaveBeenCalledWith('17/08/2026', '10:00');
  });
});

describe('la fecha a mano', () => {
  it('el boton esta apagado hasta que se escoge una fecha', () => {
    render(<Aplazar {...props} />);
    const boton = screen.getByRole('button', { name: 'Posponer a esa fecha' });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });

  it('sin tocar la hora se conserva la que tenia', () => {
    // Ponerla en blanco convertiria un recordatorio de las 10 en uno de todo el
    // dia sin que nadie lo pidiera.
    render(<Aplazar {...props} />);
    expect(screen.getByText('Si la dejas vacía, sigue a las 10:00.')).toBeTruthy();
  });

  it('en uno de todo el dia se dice que es de todo el dia', () => {
    render(<Aplazar {...props} recordatorio={uno({ hora: null })} />);
    expect(screen.getByText('Ahora es de todo el día.')).toBeTruthy();
  });
});
