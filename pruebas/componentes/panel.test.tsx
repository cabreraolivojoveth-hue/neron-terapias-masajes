/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelDeCita } from '../../src/agenda/panel.js';
import type { CitaEnAgenda, Historial } from '../../src/datos/citas.js';

afterEach(cleanup);

const CITA: CitaEnAgenda = {
  tipo: 'cita', cursoId: null,
  id: 'a', fecha: '10/07/2026', horaInicio: '09:00', horaFin: '10:00', estado: 'confirmada',
  notas: null, clienteId: 'c1', cliente: 'Paciente Uno', clienteTelefono: '6461234567',
  clienteCorreo: 'uno@correo.mx', servicioId: 's1', servicio: 'Sesión', servicioMinutos: 60,
  servicioPrecio: 80000, profesionalId: 'p1', profesional: 'Terapeuta A',
  preparacionAntesMin: 0, preparacionDespuesMin: 0, ventaId: null,
};

const HISTORIAL: Historial = {
  completadas: 3, canceladas: 1, noAsistio: 0,
  ultima: { fecha: '03/07/2026', servicio: 'Sesión' },
  proxima: { id: 'z', fecha: '17/07/2026', hora: '11:00', servicio: 'Sesión' },
};

const pintar = (props: Record<string, unknown> = {}) =>
  render(
    <PanelDeCita
      cita={CITA} historial={HISTORIAL} cargandoHistorial={false} puedeGestionar
      onEditar={vi.fn()} onReagendar={vi.fn()} onCambiarEstado={vi.fn()}
      onEnviarMensaje={vi.fn()} onVerCurso={vi.fn()} onCerrar={vi.fn()}
      onCobrar={vi.fn()} onVerLaVenta={vi.fn()} onAhoraNo={vi.fn()}
      {...props}
    />,
  );

describe('sin cita seleccionada', () => {
  it('invita a tocar una, no muestra una cita de mentiras', () => {
    pintar({ cita: null });
    expect(screen.getByText(/Toca una cita/)).toBeDefined();
    expect(screen.queryByText('Paciente Uno')).toBeNull();
  });
});

describe('con una cita', () => {
  it('el contacto sale de la FICHA del paciente', () => {
    // Si se corrige el telefono en Clientes, aqui aparece corregido. No hay
    // ninguna copia guardada dentro de la cita.
    pintar();
    expect(screen.getByText('Paciente Uno')).toBeDefined();
    expect(screen.getByText('6461234567')).toBeDefined();
    expect(screen.getByText('uno@correo.mx')).toBeDefined();
  });

  it('el telefono se puede tocar para llamar', () => {
    pintar();
    expect(screen.getByText('6461234567').getAttribute('href')).toBe('tel:6461234567');
  });

  it('sin telefono lo DICE, no deja un hueco', () => {
    pintar({ cita: { ...CITA, clienteTelefono: null } });
    expect(screen.getByText('Sin teléfono registrado')).toBeDefined();
  });

  it('sin terapeuta asignada tambien lo dice', () => {
    pintar({ cita: { ...CITA, profesional: null } });
    expect(screen.getByText('Sin asignar')).toBeDefined();
  });

  it('la duracion sale del servicio', () => {
    pintar();
    expect(screen.getByText(/09:00 – 10:00 \(1 hora\)/)).toBeDefined();
  });

  it('no trae ningun dato de la captura de referencia', () => {
    const { container } = pintar();
    for (const inventado of ['Ana López', 'María López', 'Sala 1', 'Paz y Luz', '(646) 123-4567']) {
      expect(container.textContent, inventado).not.toContain(inventado);
    }
  });
});

describe('el historial', () => {
  it('cuenta las sesiones COMPLETADAS', () => {
    pintar();
    expect(screen.getByText('Total de citas: 3')).toBeDefined();
  });

  it('mientras carga NO muestra un cero', () => {
    // "0 sesiones" es una respuesta real y equivocada sobre un paciente que
    // lleva años viniendo.
    pintar({ historial: null, cargandoHistorial: true });
    expect(screen.getByText('Cargando…')).toBeDefined();
    expect(screen.queryByText(/0 sesiones/)).toBeNull();
  });

  it('muestra la proxima cita cuando NO es esta misma', () => {
    pintar();
    expect(screen.getByText(/17\/07\/2026 · 11:00/)).toBeDefined();
  });

  it('no repite "proxima cita" si la proxima es la que se esta viendo', () => {
    pintar({ historial: { ...HISTORIAL, proxima: { ...HISTORIAL.proxima!, id: 'a' } } });
    expect(screen.queryByText('Próxima cita')).toBeNull();
  });
});

describe('las acciones dependen del estado', () => {
  it('una cita PENDIENTE se puede confirmar', () => {
    pintar({ cita: { ...CITA, estado: 'pendiente' } });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDefined();
  });

  it('una confirmada ya NO ofrece confirmar', () => {
    pintar();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
  });

  it('una CANCELADA no se vuelve a cancelar ni se reagenda', () => {
    // Ofrecerlo produce errores que la base rechaza — y un error que se pudo
    // evitar apagando un boton es un error que no debio llegar a la base.
    pintar({ cita: { ...CITA, estado: 'cancelada' } });
    expect(screen.queryByRole('button', { name: 'Cancelar cita' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reagendar' })).toBeNull();
  });

  it('una COMPLETADA no se reagenda', () => {
    pintar({ cita: { ...CITA, estado: 'completada' } });
    expect(screen.queryByRole('button', { name: 'Reagendar' })).toBeNull();
  });

  it('sin permiso de agenda NO hay ninguna accion', () => {
    pintar({ puedeGestionar: false });
    expect(screen.queryByRole('button', { name: 'Reagendar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar cita' })).toBeNull();
    // Pero los datos si se ven: puede consultar, no puede cambiar.
    expect(screen.getByText('Paciente Uno')).toBeDefined();
  });

  it('cancelar avisa con el estado correcto', async () => {
    const onCambiarEstado = vi.fn();
    pintar({ onCambiarEstado });
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar cita' }));
    expect(onCambiarEstado).toHaveBeenCalledWith('cancelada');
  });
});

describe('la conexion con Mensajes', () => {
  it('"Enviar mensaje" avisa: Agenda no manda nada por su cuenta', async () => {
    /**
     * El panel no abre WhatsApp ni escribe una conversacion. Avisa, y quien lo
     * usa decide a donde lleva — que es como Agenda se conecta con Mensajes
     * sin convertirse en Mensajes.
     */
    const enviar = vi.fn();
    pintar({ onEnviarMensaje: enviar });
    await userEvent.click(screen.getByRole('button', { name: /Enviar mensaje/ }));
    expect(enviar).toHaveBeenCalled();
  });

  it('el boton esta aunque la cita ya termino: escribirle al paciente siempre se puede', () => {
    pintar({ cita: { ...CITA, estado: 'completada' } });
    expect(screen.getByRole('button', { name: /Enviar mensaje/ })).toBeDefined();
  });
});

describe('la sala del diseño', () => {
  it('NO se escribe una sala inventada', () => {
    // El diseño muestra "Sala 1 – Paz y Luz". En la base no hay tabla de salas:
    // escribir ese renglon con un texto fijo seria justo lo que este producto
    // no hace.
    pintar();
    expect(screen.queryByText(/Sala/)).toBeNull();
    expect(screen.queryByText(/Paz y Luz/)).toBeNull();
  });
});
