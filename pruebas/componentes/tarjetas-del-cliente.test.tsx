/**
 * @vitest-environment happy-dom
 *
 * La columna de apoyo de un expediente: proxima cita, estadisticas y acciones.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExpedienteDeCliente } from '../../src/datos/clientes.js';
import {
  TarjetasDelCliente,
  accionesDelPanel,
} from '../../src/clientes/tarjetas-del-cliente.js';

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
  expediente: exp(),
  permisos: TODO,
  onAccion: () => {},
  onVerEnAgenda: () => {},
};

describe('las acciones del panel', () => {
  it('quien puede todo ve las seis', () => {
    expect(accionesDelPanel(TODO, false).map((a) => a.clave)).toEqual([
      'cita', 'venta', 'mensaje', 'recordatorio', 'curso', 'archivar',
    ]);
  });

  it('lo que no se puede hacer NO se pinta, ni en gris', () => {
    // Un boton apagado promete una accion que no existe, y de paso le cuenta a
    // quien no debe que existe.
    expect(accionesDelPanel({}, false).map((a) => a.clave)).toEqual(['mensaje', 'recordatorio']);
  });

  it('dar de baja es de peligro; reactivar no', () => {
    const baja = accionesDelPanel(TODO, false).find((a) => a.clave === 'archivar');
    expect(baja?.etiqueta).toBe('Dar de baja');
    expect(baja?.tono).toBe('peligro');

    const alta = accionesDelPanel(TODO, true).find((a) => a.clave === 'archivar');
    expect(alta?.etiqueta).toBe('Reactivar');
    expect(alta?.tono).toBeUndefined();
  });

  it('avisan cual se escogio', async () => {
    const accion = vi.fn();
    render(<TarjetasDelCliente {...props} onAccion={accion} />);
    await userEvent.click(screen.getByRole('button', { name: /Enviar mensaje/ }));
    expect(accion).toHaveBeenCalledWith('mensaje');
  });
});

describe('la proxima cita', () => {
  it('sin cita lo dice y ofrece agendarla, en vez de dejar un hueco', () => {
    render(<TarjetasDelCliente {...props} />);
    expect(screen.getByText('Sin cita agendada')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Agendar/ })).toBeTruthy();
  });

  it('sin permiso de agenda no se ofrece agendar', () => {
    render(<TarjetasDelCliente {...props} permisos={{}} />);
    expect(screen.queryByRole('button', { name: /Agendar/ })).toBeNull();
  });

  it('con cita se enseña el servicio y lleva a la agenda de ESE dia', async () => {
    const ver = vi.fn();
    render(
      <TarjetasDelCliente
        {...props}
        expediente={exp({
          proximaCita: { id: 'x1', fecha: '20/08/2026', hora: '10:00', servicio: 'Sesión larga' },
        })}
        onVerEnAgenda={ver}
      />,
    );
    expect(screen.getByText('Sesión larga')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Ver en agenda/ }));
    expect(ver).toHaveBeenCalled();
  });
});

describe('las estadisticas', () => {
  it('ninguna se calcula aqui: se enseñan las que vienen contadas', () => {
    render(<TarjetasDelCliente {...props} />);
    expect(screen.getByText('Citas realizadas')).toBeTruthy();
    expect(screen.getByText('Citas canceladas')).toBeTruthy();
    expect(screen.getByText('Servicio más usado')).toBeTruthy();
  });

  it('el dinero solo se le enseña a quien puede verlo', () => {
    render(<TarjetasDelCliente {...props} permisos={{ gestionarClientes: true }} />);
    expect(screen.queryByText('Total invertido')).toBeNull();
    expect(document.body.textContent).not.toContain('$1,500.00');
  });

  it('con permiso se ve el total invertido', () => {
    render(<TarjetasDelCliente {...props} />);
    expect(screen.getByText('Total invertido')).toBeTruthy();
    expect(screen.getByText('$1,500.00')).toBeTruthy();
  });

  it('sin visitas lo DICE en vez de dejar la linea vacia', () => {
    render(<TarjetasDelCliente {...props} expediente={exp({ ultimaVisita: null })} />);
    expect(screen.getByText('Sin visitas')).toBeTruthy();
  });
});
