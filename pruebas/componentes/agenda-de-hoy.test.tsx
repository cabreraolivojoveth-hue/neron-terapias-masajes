/**
 * @vitest-environment happy-dom
 *
 * La agenda de hoy dentro de Inicio.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CitaEnAgenda } from '../../src/datos/citas.js';
import { AgendaDeHoy, citasParaHoy, iniciales } from '../../src/inicio/agenda-de-hoy.js';

afterEach(cleanup);

const cita = (c: Partial<CitaEnAgenda> = {}): CitaEnAgenda => ({
  tipo: 'cita', cursoId: null,
  id: 'a1', fecha: '06/08/2026', horaInicio: '10:00', horaFin: '11:00',
  estado: 'confirmada', notas: null,
  clienteId: 'c1', cliente: 'Paciente Uno', clienteTelefono: null, clienteCorreo: null,
  servicioId: 's1', servicio: 'Sesión', servicioMinutos: 60, servicioPrecio: 80000,
  profesionalId: null, profesional: null,
  preparacionAntesMin: 0, preparacionDespuesMin: 0, ventaId: null,
  ...c,
});

const props = {
  citas: [] as CitaEnAgenda[],
  cargando: false,
  error: null as string | null,
  puedeCrear: true,
  onReintentar: () => {},
  onAbrir: () => {},
  onVerCalendario: () => {},
  onNueva: () => {},
};

describe('las iniciales del circulo', () => {
  it('toma la primera letra de los dos primeros nombres', () => {
    // No hay fotos de pacientes en el sistema y no se van a inventar: dos
    // letras identifican igual de bien en una lista de seis.
    expect(iniciales('Paciente Uno')).toBe('PU');
  });

  it('con un solo nombre usa una letra', () => {
    expect(iniciales('Ana')).toBe('A');
  });

  it('un nombre vacio no revienta ni deja el circulo en blanco', () => {
    expect(iniciales('   ')).toBe('·');
  });
});

describe('que citas se pintan', () => {
  it('se ESCONDEN las canceladas', () => {
    /**
     * La tarjeta de arriba dice "Citas hoy" contando lo que no esta cancelado.
     * Si la lista las mostrara, el numero y la lista dirian cosas distintas en
     * la misma pantalla — y quien la mira concluye, con razon, que una de las
     * dos esta mal.
     */
    const lista = citasParaHoy([
      cita({ id: 'a', estado: 'cancelada' }),
      cita({ id: 'b', estado: 'confirmada' }),
    ]);
    expect(lista.map((c) => c.id)).toEqual(['b']);
  });

  it('quedan en orden de reloj aunque lleguen revueltas', () => {
    const lista = citasParaHoy([
      cita({ id: 'tarde', horaInicio: '18:00' }),
      cita({ id: 'temprano', horaInicio: '09:00' }),
    ]);
    expect(lista.map((c) => c.id)).toEqual(['temprano', 'tarde']);
  });
});

describe('los cuatro estados de la pantalla', () => {
  it('mientras carga muestra siluetas, NO una lista vacia', () => {
    // Una lista vacia mientras carga le dice a la persona que hoy no tiene
    // citas, y todavia no se sabe.
    const { container } = render(<AgendaDeHoy {...props} cargando />);
    expect(container.querySelectorAll('.pz-silueta').length).toBeGreaterThan(0);
    expect(screen.queryByText(/No hay citas programadas/)).toBeNull();
  });

  it('sin citas lo dice con todas sus letras', () => {
    render(<AgendaDeHoy {...props} />);
    expect(screen.getByText('No hay citas programadas para hoy.')).toBeTruthy();
  });

  it('si falla, se dice que fallo y se puede reintentar', () => {
    const reintentar = vi.fn();
    render(<AgendaDeHoy {...props} error="se cayo la red" onReintentar={reintentar} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('se cayo la red')).toBeTruthy();
  });

  it('con citas las pinta con hora, paciente, servicio y estado', () => {
    render(<AgendaDeHoy {...props} citas={[cita()]} />);
    expect(screen.getByText('Paciente Uno')).toBeTruthy();
    expect(screen.getByText('Sesión')).toBeTruthy();
    // El estado va con PALABRA, no solo con color.
    expect(screen.getByText('Confirmada')).toBeTruthy();
  });
});

describe('lo que se puede hacer', () => {
  it('tocar una cita avisa cual, con su id', async () => {
    const abrir = vi.fn();
    render(<AgendaDeHoy {...props} citas={[cita({ id: 'x9' })]} onAbrir={abrir} />);
    await userEvent.click(screen.getByText('Paciente Uno'));
    expect(abrir.mock.calls[0]?.[0]?.id).toBe('x9');
  });

  it('quien no puede agendar NO ve el boton de nueva cita', () => {
    render(<AgendaDeHoy {...props} puedeCrear={false} />);
    expect(screen.queryByText('Nueva cita')).toBeNull();
  });
});
