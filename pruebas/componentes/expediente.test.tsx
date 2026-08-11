/**
 * @vitest-environment happy-dom
 *
 * El expediente de una persona, que ahora es la COLUMNA DE EN MEDIO de
 * Clientes y no un modal encima de una tabla.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExpedienteDeCliente } from '../../src/datos/clientes.js';
import { Expediente, edadEnAnios } from '../../src/clientes/expediente.js';

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
  cargando: false,
  error: null as string | null,
  permisos: TODO,
  momento: new Date('2026-08-11T12:00:00'),
  onAccion: () => {},
};

/** El historial no se ve de entrada: vive en su pestaña. */
async function abrirHistorial(): Promise<void> {
  await userEvent.click(screen.getByRole('tab', { name: /Historial/ }));
}

describe('la edad se calcula, no se guarda', () => {
  it('resta el año y corrige si todavia no ha sido su cumpleaños', () => {
    // Nacio en julio; en agosto ya cumplio.
    expect(edadEnAnios('10/07/1990', new Date('2026-08-11T12:00:00'))).toBe(36);
    // En junio todavia no: sin la correccion saldria 36 y seria un año de mas.
    expect(edadEnAnios('10/07/1990', new Date('2026-06-11T12:00:00'))).toBe(35);
  });

  it('una fecha que no se entiende no inventa una edad', () => {
    expect(edadEnAnios('no es fecha', new Date('2026-08-11T12:00:00'))).toBeNull();
  });
});

describe('lo que une el expediente', () => {
  it('el nombre es el titulo de la ficha, no una celda mas', () => {
    render(<Expediente {...props} />);
    expect(screen.getByRole('heading', { name: 'Persona Uno' })).toBeTruthy();
  });

  it('las tres cuentas de citas salen de Agenda, no de una columna', async () => {
    render(<Expediente {...props} />);
    await abrirHistorial();
    expect(screen.getByText('Historial de citas')).toBeTruthy();
    expect(screen.getByText('visitas')).toBeTruthy();
    expect(screen.getByText('canceladas')).toBeTruthy();
    expect(screen.getByText('no asistió')).toBeTruthy();
  });

  it('sin visitas lo DICE en vez de dejarlo en blanco', async () => {
    render(<Expediente {...props} expediente={exp({ visitas: 0, ultimaVisita: null })} />);
    await abrirHistorial();
    expect(screen.getByText('Todavía no ha tenido una sesión completada.')).toBeTruthy();
  });

  it('sin terapeuta asignado lo dice', () => {
    render(<Expediente {...props} />);
    expect(screen.getByText('Sin asignar')).toBeTruthy();
  });

  it('sin notas lo dice en vez de dejar la tarjeta muda', () => {
    render(<Expediente {...props} />);
    expect(screen.getByText('Todavía no hay notas de esta persona.')).toBeTruthy();
  });
});

describe('las pestañas', () => {
  it('solo estan las que la base puede llenar', () => {
    /**
     * El diseño enseña Pagos y Documentos. Ninguna de las dos tiene tabla en el
     * sistema: una pestaña vacia promete un dato que nadie puede meter.
     */
    render(<Expediente {...props} />);
    expect(screen.getByRole('tab', { name: /Resumen/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Historial/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Notas/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Pagos/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Documentos/ })).toBeNull();
  });

  it('se abre en Resumen', () => {
    render(<Expediente {...props} />);
    expect(screen.getByRole('tab', { name: /Resumen/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Información personal')).toBeTruthy();
  });
});

describe('el dinero solo se le enseña a quien puede verlo', () => {
  it('sin permiso de finanzas NO aparece el adeudo ni lo gastado', async () => {
    /**
     * Esconderlo aqui es cortesia; lo que de verdad protege es que la base no
     * le entrega las ventas a quien no tiene `verFinanzas`.
     */
    render(<Expediente {...props} permisos={{ gestionarClientes: true }} />);
    await abrirHistorial();
    expect(screen.queryByText('Compras y adeudo')).toBeNull();
    expect(document.body.textContent).not.toContain('$1,500.00');
  });

  it('con permiso se ve, y el adeudo se distingue del total', async () => {
    render(<Expediente {...props} />);
    await abrirHistorial();
    expect(screen.getByText('Compras y adeudo')).toBeTruthy();
    expect(screen.getByText('$1,500.00')).toBeTruthy();
    expect(screen.getByText('$500.00')).toBeTruthy();
  });

  it('sin adeudo lo dice en vez de mostrar $0.00 suelto', async () => {
    render(<Expediente {...props} expediente={exp({ adeudo: 0 })} />);
    await abrirHistorial();
    expect(screen.getByText('Sin adeudos')).toBeTruthy();
  });
});

describe('lo que se puede hacer desde la ficha', () => {
  it('sin permiso de gestionar no se ofrece editar', () => {
    render(<Expediente {...props} permisos={{}} />);
    expect(screen.queryByRole('button', { name: /Editar cliente/ })).toBeNull();
  });

  it('editar avisa cual se escogio', async () => {
    const accion = vi.fn();
    render(<Expediente {...props} onAccion={accion} />);
    await userEvent.click(screen.getByRole('button', { name: /Editar cliente/ }));
    expect(accion).toHaveBeenCalledWith('editar');
  });

  it('un archivado se ve archivado', () => {
    render(<Expediente {...props} expediente={exp({ archivado: true })} />);
    expect(screen.getByText('Archivado')).toBeTruthy();
  });
});

describe('los estados de la pantalla', () => {
  it('mientras carga muestra siluetas', () => {
    const { container } = render(<Expediente {...props} cargando expediente={null} />);
    expect(container.querySelectorAll('.pz-silueta').length).toBeGreaterThan(0);
  });

  it('si falla se dice, en vez de mostrar un expediente a medias', () => {
    render(<Expediente {...props} expediente={null} error="sin conexión" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('sin conexión')).toBeTruthy();
  });
});
