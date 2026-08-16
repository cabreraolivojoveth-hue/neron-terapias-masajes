/**
 * @vitest-environment happy-dom
 *
 * LOS RECORDATORIOS DE UNA COSA — lo que ven los demas modulos.
 *
 * Es la mitad de la conexion que casi siempre falta: sin esta pieza, quien abre
 * un expediente no tiene forma de saber que hay algo pendiente con esa persona.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecordatorioLigado } from '../../src/datos/recordatorios.js';
import { RecordatoriosLigados } from '../../src/recordatorios/ligados.js';

afterEach(cleanup);

const HOY = '16/08/2026';

const uno = (r: Partial<RecordatorioLigado> = {}): RecordatorioLigado => ({
  id: 'r1',
  titulo: 'Dar seguimiento',
  detalle: null,
  fecha: HOY,
  hora: null,
  prioridad: 'normal',
  estado: 'pendiente',
  categoria: null,
  responsable: null,
  ...r,
});

const props = {
  tipo: 'cliente' as const,
  deQuien: 'esta persona',
  recordatorios: [] as RecordatorioLigado[],
  hoy: HOY,
  cargando: false,
  error: null,
  puedeGestionar: true,
  onAbrir: () => {},
  onNuevo: () => {},
  onVerTodos: () => {},
  onReintentar: () => {},
};

describe('el vacio', () => {
  it('DICE DE QUIEN esta hablando', () => {
    // "No hay recordatorios" a secas, dentro de un expediente, hace dudar de si
    // mira a esta persona o al centro entero.
    render(<RecordatoriosLigados {...props} />);
    expect(screen.getByText('No hay nada pendiente con esta persona.')).toBeTruthy();
  });

  it('quien no gestiona no ve el boton de crear', () => {
    render(<RecordatoriosLigados {...props} puedeGestionar={false} />);
    expect(screen.queryByRole('button', { name: /Nuevo/ })).toBeNull();
  });
});

describe('con recordatorios', () => {
  it('cada uno dice cuando vence y en que estado esta', () => {
    render(<RecordatoriosLigados {...props} recordatorios={[uno()]} />);
    expect(screen.getByText('Dar seguimiento')).toBeTruthy();
    expect(screen.getByText('Hoy')).toBeTruthy();
  });

  it('la prioridad normal NO se dice: solo estorba', () => {
    // Repetir "Normal" en cada renglon es ruido; lo que hace falta ver es lo que
    // se sale de lo normal.
    const { rerender } = render(<RecordatoriosLigados {...props} recordatorios={[uno()]} />);
    expect(screen.queryByText(/Normal/)).toBeNull();
    rerender(<RecordatoriosLigados {...props} recordatorios={[uno({ prioridad: 'urgente' })]} />);
    expect(screen.getByText(/Urgente/)).toBeTruthy();
  });

  it('tocar uno lo abre', async () => {
    const usuario = userEvent.setup();
    const abrir = vi.fn();
    render(<RecordatoriosLigados {...props} recordatorios={[uno()]} onAbrir={abrir} />);
    await usuario.click(screen.getByText('Dar seguimiento').closest('button')!);
    expect(abrir).toHaveBeenCalledWith('r1');
  });

  it('hay una salida hacia el modulo entero', async () => {
    const usuario = userEvent.setup();
    const ver = vi.fn();
    render(<RecordatoriosLigados {...props} recordatorios={[uno()]} onVerTodos={ver} />);
    await usuario.click(screen.getByRole('button', { name: 'Ver en Recordatorios' }));
    expect(ver).toHaveBeenCalled();
  });
});

describe('el error', () => {
  it('se dice que fallo y se puede reintentar', () => {
    const reintentar = vi.fn();
    render(
      <RecordatoriosLigados {...props} error="se cayo la red" onReintentar={reintentar} />,
    );
    expect(screen.getByText('se cayo la red')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
});
