/**
 * @vitest-environment happy-dom
 *
 * LAS REPETICIONES: las reglas, no los recordatorios que producen.
 *
 * Lo que se vigila: que la regla se lea EN ESPAÑOL —"cada 2 semanas, lunes y
 * jueves" y no "semanal / 2 / [1,4]"—, y que no se ofrezca pausar una que ya
 * termino.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RepeticionDeRecordatorio } from '../../src/datos/recordatorios.js';
import { Repeticiones, TONO_DE_LA_REPETICION } from '../../src/recordatorios/repeticiones.js';

afterEach(cleanup);

const HOY = '16/08/2026';

const regla = (r: Partial<RepeticionDeRecordatorio> = {}): RepeticionDeRecordatorio => ({
  id: 'x1',
  titulo: 'Corte de caja',
  detalle: null,
  notas: null,
  hora: '20:00',
  prioridad: 'normal',
  categoriaId: null,
  categoria: null,
  responsableId: null,
  responsable: null,
  entidadTipo: null,
  entidadId: null,
  frecuencia: 'semanal',
  intervalo: 1,
  diasSemana: [1],
  fechaInicio: '10/08/2026',
  fechaFin: null,
  repeticiones: null,
  generados: 3,
  proximaFecha: '17/08/2026',
  estado: 'activo',
  anticipacionMin: null,
  ...r,
});

const props = {
  repeticiones: [] as RepeticionDeRecordatorio[],
  hoy: HOY,
  cargando: false,
  error: null,
  puedeGestionar: true,
  onNueva: () => {},
  onEditar: () => {},
  onMarcar: () => {},
  onVerGenerados: () => {},
  onReintentar: () => {},
};

describe('el estado vacio', () => {
  it('se explica QUE es una repeticion, no solo que no hay ninguna', () => {
    render(<Repeticiones {...props} />);
    expect(screen.getByText('Nada se repite todavía')).toBeTruthy();
    expect(screen.getByText(/crea el recordatorio sola cuando toca/)).toBeTruthy();
  });

  it('quien no gestiona no ve el boton de crear', () => {
    render(<Repeticiones {...props} puedeGestionar={false} />);
    expect(screen.queryByRole('button', { name: /Nueva repetición/ })).toBeNull();
  });
});

describe('cada regla', () => {
  it('se lee en español, no en jerga', () => {
    render(<Repeticiones {...props} repeticiones={[regla({ intervalo: 2, diasSemana: [1, 4] })]} />);
    expect(screen.getByText(/Cada 2 semanas, lunes y jueves/)).toBeTruthy();
  });

  it('dice su tope, o que no lo tiene', () => {
    const { rerender } = render(<Repeticiones {...props} repeticiones={[regla()]} />);
    expect(screen.getByText(/sin fecha de término/)).toBeTruthy();
    rerender(<Repeticiones {...props} repeticiones={[regla({ repeticiones: 10 })]} />);
    expect(screen.getByText(/10 veces/)).toBeTruthy();
  });

  it('dice cuantos ha creado, y se puede ir a verlos', async () => {
    const usuario = userEvent.setup();
    const ver = vi.fn();
    render(<Repeticiones {...props} repeticiones={[regla()]} onVerGenerados={ver} />);
    await usuario.click(screen.getByRole('button', { name: '3 recordatorios' }));
    expect(ver).toHaveBeenCalledWith(expect.objectContaining({ id: 'x1' }));
  });

  it('un solo generado se dice en singular', () => {
    render(<Repeticiones {...props} repeticiones={[regla({ generados: 1 })]} />);
    expect(screen.getByRole('button', { name: '1 recordatorio' })).toBeTruthy();
  });

  it('la activa dice cual es la siguiente; la parada dice donde se quedo', () => {
    const { rerender } = render(<Repeticiones {...props} repeticiones={[regla()]} />);
    expect(screen.getByText('La siguiente')).toBeTruthy();
    rerender(<Repeticiones {...props} repeticiones={[regla({ estado: 'pausado' })]} />);
    expect(screen.getByText('Quedó en')).toBeTruthy();
  });

  it('cada estado tiene su tono, y los tres son distintos', () => {
    const tonos = new Set(Object.values(TONO_DE_LA_REPETICION));
    expect(tonos.size).toBe(3);
  });
});

describe('lo que se puede hacer con cada regla', () => {
  it('la activa se puede pausar; la pausada, reanudar', async () => {
    const usuario = userEvent.setup();
    render(<Repeticiones {...props} repeticiones={[regla()]} />);
    await usuario.click(screen.getByRole('button', { name: /Acciones para Corte de caja/ }));
    expect(screen.getByRole('menuitem', { name: /Pausar/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Reanudar/ })).toBeNull();
  });

  it('la terminada NO se puede volver a terminar', async () => {
    // LO QUE NO SE PUEDE HACER NO SE OFRECE, ni en gris.
    const usuario = userEvent.setup();
    render(<Repeticiones {...props} repeticiones={[regla({ estado: 'finalizado' })]} />);
    await usuario.click(screen.getByRole('button', { name: /Acciones para Corte de caja/ }));
    expect(screen.queryByRole('menuitem', { name: /Terminar/ })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Reanudar/ })).toBeTruthy();
  });

  it('pausar avisa con el estado correcto', async () => {
    const usuario = userEvent.setup();
    const marcar = vi.fn();
    render(<Repeticiones {...props} repeticiones={[regla()]} onMarcar={marcar} />);
    await usuario.click(screen.getByRole('button', { name: /Acciones para Corte de caja/ }));
    await usuario.click(screen.getByRole('menuitem', { name: /Pausar/ }));
    expect(marcar).toHaveBeenCalledWith(expect.objectContaining({ id: 'x1' }), 'pausado');
  });

  it('quien no gestiona no ve el menu de acciones', () => {
    render(<Repeticiones {...props} puedeGestionar={false} repeticiones={[regla()]} />);
    expect(screen.queryByRole('button', { name: /Acciones para/ })).toBeNull();
  });
});

describe('la pista', () => {
  it('explica que no se crean todos de golpe, donde se usa', () => {
    // Es la pregunta que se hace todo el mundo la primera vez, y la respuesta
    // escondida en la documentacion no la lee nadie.
    render(<Repeticiones {...props} repeticiones={[regla()]} />);
    expect(screen.getByText(/No se crean todos de golpe/)).toBeTruthy();
  });

  it('sin ninguna regla, la pista sobra y no se pinta', () => {
    render(<Repeticiones {...props} />);
    expect(screen.queryByText(/No se crean todos de golpe/)).toBeNull();
  });
});
