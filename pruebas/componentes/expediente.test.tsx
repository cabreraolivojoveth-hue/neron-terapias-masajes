/**
 * @vitest-environment happy-dom
 *
 * El expediente de una persona.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExpedienteDeCliente } from '../../src/datos/clientes.js';
import { Expediente } from '../../src/clientes/expediente.js';

afterEach(cleanup);

const exp = (c: Partial<ExpedienteDeCliente> = {}): ExpedienteDeCliente => ({
  id: 'c1', nombre: 'Persona Uno', telefono: '6641234567', correo: 'uno@correo.mx',
  fechaNacimiento: '10/07/1990', notas: null, clienteDesde: '01/02/2026', archivado: false,
  profesionalId: null, profesional: null,
  visitas: 3, canceladas: 1, noAsistio: 0,
  ultimaVisita: { fecha: '10/07/2026', servicio: 'Sesión' },
  proximaCita: null, compras: 2, totalGastado: 150000, adeudo: 50000, cursos: 1,
  servicios: [{ nombre: 'Sesión', veces: 3 }],
  ...c,
});

const TODO = {
  gestionarClientes: true, gestionarAgenda: true, cobrar: true,
  gestionarCatalogo: true, verFinanzas: true,
};

const props = {
  abierto: true,
  expediente: exp(),
  cargando: false,
  error: null as string | null,
  permisos: TODO,
  onAccion: () => {},
  onCerrar: () => {},
};

describe('lo que une el expediente', () => {
  it('las tres cuentas de citas salen de Agenda, no de una columna', () => {
    render(<Expediente {...props} />);
    expect(screen.getByText('Historial de citas')).toBeTruthy();
    expect(screen.getByText('visitas')).toBeTruthy();
    expect(screen.getByText('canceladas')).toBeTruthy();
    expect(screen.getByText('no asistió')).toBeTruthy();
  });

  it('sin visitas lo DICE en vez de dejarlo en blanco', () => {
    render(<Expediente {...props} expediente={exp({ visitas: 0, ultimaVisita: null })} />);
    expect(screen.getByText('Todavía no ha tenido una sesión completada.')).toBeTruthy();
  });

  it('sin terapeuta asignado lo dice', () => {
    render(<Expediente {...props} />);
    expect(screen.getByText('Sin asignar')).toBeTruthy();
  });
});

describe('el dinero solo se le enseña a quien puede verlo', () => {
  it('sin permiso de finanzas NO aparece el adeudo ni lo gastado', () => {
    /**
     * Esconderlo aqui es cortesia; lo que de verdad protege es que la base no
     * le entrega las ventas a quien no tiene `verFinanzas`.
     */
    render(<Expediente {...props} permisos={{ gestionarClientes: true }} />);
    expect(screen.queryByText('Compras y adeudo')).toBeNull();
    expect(document.body.textContent).not.toContain('$1,500.00');
  });

  it('con permiso se ve, y el adeudo se distingue del total gastado', () => {
    render(<Expediente {...props} />);
    expect(screen.getByText('Total gastado: $1,500.00')).toBeTruthy();
    expect(screen.getByText('Adeudo: $500.00')).toBeTruthy();
  });

  it('sin adeudo lo dice en vez de mostrar $0.00 suelto', () => {
    render(<Expediente {...props} expediente={exp({ adeudo: 0 })} />);
    expect(screen.getByText('Sin adeudos')).toBeTruthy();
  });
});

describe('las acciones', () => {
  it('solo salen las que esa persona puede hacer', () => {
    render(<Expediente {...props} permisos={{}} />);
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Registrar venta/ })).toBeNull();
    // Escribirle a alguien no necesita permiso especial.
    expect(screen.getByRole('button', { name: /Enviar mensaje/ })).toBeTruthy();
  });

  it('un archivado se REACTIVA', () => {
    render(<Expediente {...props} expediente={exp({ archivado: true })} />);
    expect(screen.getByRole('button', { name: /Reactivar/ })).toBeTruthy();
  });

  it('avisan cual se escogio', async () => {
    const accion = vi.fn();
    render(<Expediente {...props} onAccion={accion} />);
    await userEvent.click(screen.getByRole('button', { name: /Nueva cita/ }));
    expect(accion).toHaveBeenCalledWith('cita');
  });
});

describe('los estados de la pantalla', () => {
  it('mientras carga muestra siluetas', () => {
    const { container } = render(<Expediente {...props} cargando expediente={null} />);
    expect(container.querySelectorAll('.terapias-silueta').length).toBeGreaterThan(0);
  });

  it('si falla se dice, en vez de mostrar un expediente a medias', () => {
    render(<Expediente {...props} expediente={null} error="sin conexión" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('sin conexión')).toBeTruthy();
  });

  it('cerrado no pinta nada', () => {
    const { container } = render(<Expediente {...props} abierto={false} />);
    expect(container.textContent).toBe('');
  });
});
