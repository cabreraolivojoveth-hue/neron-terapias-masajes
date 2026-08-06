/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CitaEnAgenda } from '../../src/datos/citas.js';
import { VistaDia, VistaMes, VistaSemana } from '../../src/agenda/vistas.js';

afterEach(cleanup);

const cita = (p: Partial<CitaEnAgenda> & { id: string }): CitaEnAgenda => ({
  tipo: 'cita', cursoId: null,
  fecha: '10/07/2026', horaInicio: '09:00', horaFin: '10:00', estado: 'confirmada',
  notas: null, clienteId: 'c1', cliente: 'Paciente Uno', clienteTelefono: null,
  clienteCorreo: null, servicioId: 's1', servicio: 'Sesión', servicioMinutos: 60,
  servicioPrecio: 0, profesionalId: null, profesional: null, ...p,
});

const base = {
  fecha: '10/07/2026', seleccionada: null, abre: 7 * 60, cierra: 21 * 60,
  onSeleccionar: vi.fn(), onHueco: vi.fn(), onIrAlDia: vi.fn(),
};

describe('vista de dia', () => {
  it('sin citas lo DICE, no deja la columna muda', () => {
    render(<VistaDia {...base} citas={[]} />);
    expect(screen.getByText('No hay citas para este día.')).toBeDefined();
  });

  it('NUNCA inventa citas para llenar el dia', () => {
    const { container } = render(<VistaDia {...base} citas={[]} />);
    expect(container.querySelectorAll('.agenda-cita')).toHaveLength(0);
    for (const inventado of ['Ana López', 'José Pérez', 'Reiki', 'Biomagnetismo']) {
      expect(container.textContent, inventado).not.toContain(inventado);
    }
  });

  it('pinta la cita con hora, paciente y servicio', () => {
    render(<VistaDia {...base} citas={[cita({ id: 'a' })]} />);
    expect(screen.getByText('Paciente Uno')).toBeDefined();
    expect(screen.getByText('Sesión')).toBeDefined();
    expect(screen.getByText('09:00 – 10:00')).toBeDefined();
  });

  it('el estado va con PALABRA, no solo con color', () => {
    // Una de cada doce personas no distingue el rojo del verde.
    render(<VistaDia {...base} citas={[cita({ id: 'a', estado: 'pendiente' })]} />);
    expect(screen.getByText('Pendiente')).toBeDefined();
  });

  it('el lector de pantalla oye TODO lo que en pantalla se ve por posicion', () => {
    render(<VistaDia {...base} citas={[cita({ id: 'a', profesional: 'Terapeuta A' })]} />);
    expect(screen.getByRole('button', {
      name: '09:00 a 10:00, Paciente Uno, Sesión, Confirmada, con Terapeuta A',
    })).toBeDefined();
  });

  it('solo muestra las citas de ESE dia', () => {
    render(<VistaDia {...base} citas={[
      cita({ id: 'a' }), cita({ id: 'b', fecha: '11/07/2026', cliente: 'De otro día' }),
    ]} />);
    expect(screen.queryByText('De otro día')).toBeNull();
  });

  it('tocar una cita la selecciona; no navega a otra pantalla', async () => {
    const onSeleccionar = vi.fn();
    render(<VistaDia {...base} onSeleccionar={onSeleccionar} citas={[cita({ id: 'a' })]} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Paciente Uno/ }));
    expect(onSeleccionar).toHaveBeenCalledTimes(1);
    expect(onSeleccionar.mock.calls[0]?.[0].id).toBe('a');
  });

  it('dos citas encimadas se ven las DOS', () => {
    const { container } = render(<VistaDia {...base} citas={[
      cita({ id: 'a', horaInicio: '09:00', horaFin: '10:00' }),
      cita({ id: 'b', horaInicio: '09:30', horaFin: '10:30', cliente: 'Paciente Dos' }),
    ]} />);
    const bloques = container.querySelectorAll('.agenda-cita');
    expect(bloques).toHaveLength(2);
    // Y en columnas distintas: si compartieran el mismo left, una taparia a
    // la otra y la de abajo dejaria de existir para quien mira.
    const izquierdas = [...bloques].map((b) => (b as HTMLElement).style.left);
    expect(new Set(izquierdas).size).toBe(2);
  });
});

describe('vista de semana', () => {
  it('muestra los siete dias', () => {
    render(<VistaSemana {...base} citas={[]} />);
    for (const d of ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']) {
      expect(screen.getByText(d), d).toBeDefined();
    }
  });

  it('reparte cada cita en su dia', () => {
    render(<VistaSemana {...base} citas={[
      cita({ id: 'a', fecha: '06/07/2026', cliente: 'Del lunes' }),
      cita({ id: 'b', fecha: '10/07/2026', cliente: 'Del viernes' }),
    ]} />);
    expect(screen.getByText('Del lunes')).toBeDefined();
    expect(screen.getByText('Del viernes')).toBeDefined();
  });

  it('tocar el encabezado de un dia abre ese dia', async () => {
    const onIrAlDia = vi.fn();
    render(<VistaSemana {...base} onIrAlDia={onIrAlDia} citas={[]} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /lun/ }));
    expect(onIrAlDia).toHaveBeenCalledWith('06/07/2026');
  });
});

describe('vista de mes', () => {
  it('trae semanas completas: 35 o 42 casillas', () => {
    const { container } = render(<VistaMes {...base} citas={[]} />);
    const celdas = container.querySelectorAll('.agenda-mes__celda').length;
    expect(celdas % 7).toBe(0);
  });

  it('los dias de relleno se distinguen de los del mes', () => {
    const { container } = render(<VistaMes {...base} citas={[]} />);
    expect(container.querySelectorAll('.agenda-mes__celda--fuera').length).toBeGreaterThan(0);
  });

  it('con muchas citas dice cuantas faltan en vez de apretarlas', () => {
    const muchas = Array.from({ length: 6 }, (_, i) =>
      cita({ id: `c${i}`, horaInicio: `0${8 + i}:00`, horaFin: `0${9 + i}:00`, cliente: `P${i}` }));
    render(<VistaMes {...base} citas={muchas} />);
    expect(screen.getByText('+3 más')).toBeDefined();
  });

  it('un mes sin citas no inventa ninguna', () => {
    const { container } = render(<VistaMes {...base} citas={[]} />);
    expect(container.querySelectorAll('.agenda-mes__cita')).toHaveLength(0);
  });
});
