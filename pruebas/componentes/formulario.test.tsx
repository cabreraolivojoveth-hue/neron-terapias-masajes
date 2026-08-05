/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormularioDeCita, type ValoresDeCita } from '../../src/agenda/formulario.js';

afterEach(cleanup);

const CLIENTES = [
  { id: 'c1', nombre: 'Alejandra Hernández', telefono: '6461112222', correo: null },
  { id: 'c2', nombre: 'Beatriz Soto', telefono: null, correo: 'bea@correo.mx' },
];
const SERVICIOS = [
  { id: 's1', nombre: 'Sesión larga', duracionMin: 90, precioCentavos: 120000, activo: true },
  { id: 's2', nombre: 'Servicio apagado', duracionMin: 60, precioCentavos: 0, activo: false },
];
const PROFESIONALES = [{ id: 'p1', nombre: 'Terapeuta A', rol: 'dueno' }];

const VACIO: ValoresDeCita = {
  clienteId: '', servicioId: '', profesionalId: '', fecha: '10/07/2026',
  horaInicio: '09:00', notas: '',
};

const pintar = (props: Record<string, unknown> = {}) =>
  render(
    <FormularioDeCita
      abierto titulo="Nueva cita" inicial={VACIO}
      clientes={CLIENTES} servicios={SERVICIOS} profesionales={PROFESIONALES}
      trabajando={false} error={null}
      onGuardar={vi.fn()} onCrearCliente={vi.fn()} onCerrar={vi.fn()}
      {...props}
    />,
  );

describe('EL FOCO NO SE PIERDE AL ESCRIBIR', () => {
  it('se puede escribir un nombre completo de corrido', async () => {
    /**
     * La queja concreta: escribir "Alejandra Hernández" y tener que volver a
     * hacer clic despues de cada letra. Pasa cuando un componente se define
     * dentro de otro y React lo destruye en cada render.
     */
    pintar();
    const campo = screen.getByLabelText('Paciente') as HTMLInputElement;
    campo.focus();
    await userEvent.setup().type(campo, 'Alejandra Hernández');
    expect(document.activeElement).toBe(campo);
    expect(campo.value).toBe('Alejandra Hernández');
  });

  it('tampoco en las notas', async () => {
    pintar();
    const notas = screen.getByLabelText('Notas') as HTMLTextAreaElement;
    notas.focus();
    await userEvent.setup().type(notas, 'Primera sesión, revisar postura');
    expect(document.activeElement).toBe(notas);
    expect(notas.value).toBe('Primera sesión, revisar postura');
  });

  it('escribir en un campo no borra lo de otro', async () => {
    pintar();
    const u = userEvent.setup();
    const buscar = screen.getByLabelText('Paciente') as HTMLInputElement;
    const notas = screen.getByLabelText('Notas') as HTMLTextAreaElement;
    await u.type(buscar, 'Bea');
    await u.type(notas, 'nota');
    expect(buscar.value).toBe('Bea');
    expect(notas.value).toBe('nota');
  });
});

describe('buscar al paciente', () => {
  it('filtra por nombre', async () => {
    pintar();
    await userEvent.setup().type(screen.getByLabelText('Paciente'), 'beat');
    expect(screen.getByText('Beatriz Soto')).toBeDefined();
    expect(screen.queryByText('Alejandra Hernández')).toBeNull();
  });

  it('tambien por telefono y por correo', async () => {
    const u = userEvent.setup();
    pintar();
    await u.type(screen.getByLabelText('Paciente'), '6461112222');
    expect(screen.getByText('Alejandra Hernández')).toBeDefined();
    cleanup();
    pintar();
    await u.type(screen.getByLabelText('Paciente'), 'bea@');
    expect(screen.getByText('Beatriz Soto')).toBeDefined();
  });

  it('sin pacientes lo DICE en vez de dejar la lista muda', () => {
    pintar({ clientes: [] });
    expect(screen.getByText(/Todavía no tienes pacientes registrados/)).toBeDefined();
  });
});

describe('el servicio manda la duracion', () => {
  it('la hora de fin se calcula sola', async () => {
    // Servicio de 90 minutos desde las 09:00 termina a las 10:30. No hay
    // ninguna duracion escrita a mano.
    pintar();
    await userEvent.setup().selectOptions(screen.getByLabelText('Servicio'), 's1');
    await waitFor(() => expect(screen.getByText(/Termina a las 10:30/)).toBeDefined());
  });

  it('un servicio APAGADO no se ofrece para citas nuevas', () => {
    pintar();
    const opciones = [...(screen.getByLabelText('Servicio') as HTMLSelectElement).options];
    expect(opciones.map((o) => o.value)).not.toContain('s2');
  });

  it('pero SI se ve si ya estaba escogido en una cita vieja', () => {
    // Si desapareciera de la lista, al editar esa cita el campo saldria vacio
    // y guardaria mal.
    pintar({ inicial: { ...VACIO, servicioId: 's2' } });
    const opciones = [...(screen.getByLabelText('Servicio') as HTMLSelectElement).options];
    expect(opciones.map((o) => o.value)).toContain('s2');
  });
});

describe('lo que falta se dice por su nombre', () => {
  it('nombra los campos vacios en vez de pintarlos de rojo', async () => {
    // Si el que falla quedo tres campos mas arriba y no se ve, para la
    // persona no paso nada.
    const onGuardar = vi.fn();
    pintar({ onGuardar });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('alert').textContent).toContain('el paciente');
    expect(screen.getByRole('alert').textContent).toContain('el servicio');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('con todo puesto, guarda', async () => {
    const onGuardar = vi.fn();
    const u = userEvent.setup();
    pintar({ onGuardar });
    await u.click(screen.getByRole('button', { name: /Alejandra Hernández/ }));
    await u.selectOptions(screen.getByLabelText('Servicio'), 's1');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onGuardar).toHaveBeenCalledTimes(1);
    expect(onGuardar.mock.calls[0]?.[0]).toMatchObject({ clienteId: 'c1', servicioId: 's1' });
  });

  it('el error del servidor se ANUNCIA', () => {
    pintar({ error: 'Ese horario acaba de ocuparse con esa terapeuta.' });
    expect(screen.getByRole('alert').textContent)
      .toBe('Ese horario acaba de ocuparse con esa terapeuta.');
  });
});

describe('dar de alta un paciente sin salir de la cita', () => {
  it('el alta rapida NO borra lo que ya se habia escrito', async () => {
    /**
     * Es el caso completo: la persona ya escogio servicio y hora, no encuentra
     * al paciente, lo da de alta, y al volver TODO sigue ahi con el paciente
     * nuevo seleccionado. Resetear el formulario aqui es de las cosas que mas
     * enojan de un sistema.
     */
    const onCrearCliente = vi.fn(async () => ({
      id: 'c9', nombre: 'Paciente Nuevo', telefono: '6469998877', correo: null,
    }));
    const onGuardar = vi.fn();
    const u = userEvent.setup();
    pintar({ onCrearCliente, onGuardar });

    await u.selectOptions(screen.getByLabelText('Servicio'), 's1');
    await u.type(screen.getByLabelText('Notas'), 'trae receta');

    await u.click(screen.getByRole('button', { name: '+ Nuevo paciente' }));
    await u.type(screen.getByLabelText('Nombre'), 'Paciente Nuevo');
    await u.click(screen.getByRole('button', { name: 'Guardar y usar' }));

    await waitFor(() => expect(onCrearCliente).toHaveBeenCalled());
    await u.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onGuardar).toHaveBeenCalledTimes(1);
    expect(onGuardar.mock.calls[0]?.[0]).toMatchObject({
      clienteId: 'c9', servicioId: 's1', notas: 'trae receta',
    });
  });

  it('sin nombre no se puede guardar el paciente', async () => {
    pintar();
    await userEvent.setup().click(screen.getByRole('button', { name: '+ Nuevo paciente' }));
    expect((screen.getByRole('button', { name: 'Guardar y usar' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});

describe('reagendar', () => {
  it('solo deja mover fecha, hora y terapeuta', () => {
    // Reagendar no es editar: cambiar el servicio ahi cambiaria la duracion y
    // el precio de una cita que la persona solo queria mover.
    pintar({ soloHorario: true, titulo: 'Reagendar cita' });
    expect(screen.queryByLabelText('Paciente')).toBeNull();
    expect(screen.queryByLabelText('Servicio')).toBeNull();
    expect(screen.getByLabelText('Fecha')).toBeDefined();
    expect(screen.getByLabelText('Hora de inicio')).toBeDefined();
  });
});
