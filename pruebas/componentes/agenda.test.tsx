/**
 * @vitest-environment happy-dom
 *
 * La pantalla completa de Agenda: navegacion, vistas, seleccion y las
 * conexiones con la capa de datos. Lo que se consulta esta simulado; lo que
 * se prueba aqui es que la pantalla pida lo correcto y reaccione bien.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { olvidarTodo } from '../../src/datos/consulta.js';

const sesion = vi.hoisted(() => ({
  valor: {
    estado: 'listo',
    acceso: {
      negocioId: 't_centro', usuarioId: 'u1', correo: 'a@b.mx', nombre: 'Dueña',
      rol: 'dueno', rolEtiqueta: 'Dueña', esDueno: true, modulos: [],
      permisos: { gestionarAgenda: true, gestionarClientes: true } as Record<string, boolean>,
    },
    llave: 'k',
    cerrarSesion: async () => {},
    refrescar: async () => {},
  },
}));

const datos = vi.hoisted(() => ({
  citas: [] as unknown[],
  pedidos: [] as { desde: string; hasta: string }[],
  creadas: [] as unknown[],
}));

vi.mock('../../src/identidad/sesion.js', () => ({ useSesion: () => sesion.valor }));

vi.mock('../../src/datos/citas.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/citas.js')>(
    '../../src/datos/citas.js',
  );
  return {
    ...real,
    traerCitas: vi.fn(async (_n: string, desde: string, hasta: string) => {
      datos.pedidos.push({ desde, hasta });
      return datos.citas;
    }),
    traerClientes: vi.fn(async () => [
      { id: 'c1', nombre: 'Paciente Uno', telefono: '6461112222', correo: null },
    ]),
    traerServicios: vi.fn(async () => [
      { id: 's1', nombre: 'Sesión', duracionMin: 60, precioCentavos: 80000, activo: true },
    ]),
    traerProfesionales: vi.fn(async () => [{ id: 'p1', nombre: 'Terapeuta A', rol: 'dueno' }]),
    traerHistorial: vi.fn(async () => ({
      completadas: 2, canceladas: 0, noAsistio: 0, ultima: null, proxima: null,
    })),
    crearCita: vi.fn(async (c: unknown) => { datos.creadas.push(c); return 'nueva'; }),
    crearCliente: vi.fn(async () => ({ id: 'c9', nombre: 'Nuevo', telefono: null, correo: null })),
    reagendar: vi.fn(async () => undefined),
    cambiarEstado: vi.fn(async () => undefined),
  };
});

vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true, supabase: () => ({}), clienteParaLaBase: () => ({}),
}));

const { Agenda } = await import('../../src/agenda/agenda.js');

afterEach(() => { cleanup(); olvidarTodo(); });
beforeEach(() => { datos.citas = []; datos.pedidos = []; datos.creadas = []; });

const CITA = {
  id: 'a', fecha: '', horaInicio: '09:00', horaFin: '10:00', estado: 'confirmada',
  notas: null, clienteId: 'c1', cliente: 'Paciente Uno', clienteTelefono: '6461112222',
  clienteCorreo: null, servicioId: 's1', servicio: 'Sesión', servicioMinutos: 60,
  servicioPrecio: 80000, profesionalId: 'p1', profesional: 'Terapeuta A',
};

const hoy = (): string => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

describe('lo primero que se ve', () => {
  it('el encabezado del modulo', async () => {
    render(<Agenda />);
    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeDefined();
    expect(screen.getByText('Gestiona tus citas y terapias')).toBeDefined();
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
  });

  it('con la base vacia la agenda sale VACIA, no con citas de ejemplo', async () => {
    const { container } = render(<Agenda />);
    await waitFor(() => expect(screen.getByText('No hay citas para este día.')).toBeDefined());
    for (const inventado of ['Ana López', 'José Pérez', 'Reiki', 'Biomagnetismo', 'Sala 1']) {
      expect(container.textContent, inventado).not.toContain(inventado);
    }
  });

  it('arranca en el dia de HOY', async () => {
    render(<Agenda />);
    await waitFor(() => expect(datos.pedidos[0]).toEqual({ desde: hoy(), hasta: hoy() }));
  });
});

describe('navegar', () => {
  it('cambiar a semana pide SIETE dias, no uno', async () => {
    // Es lo que evita treinta y un viajes al servidor en la vista de mes.
    render(<Agenda />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Semana' }));
    await waitFor(() => expect(datos.pedidos.length).toBe(2));
    const ultimo = datos.pedidos[datos.pedidos.length - 1]!;
    expect(ultimo.desde).not.toBe(ultimo.hasta);
  });

  it('el boton siguiente cambia el rango que se pide', async () => {
    render(<Agenda />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(datos.pedidos.length).toBe(2));
    expect(datos.pedidos[1]!.desde).not.toBe(datos.pedidos[0]!.desde);
  });

  it('"Hoy" regresa al dia actual, y lo hace SIN pedir de nuevo', async () => {
    /**
     * Dos cosas en una prueba, a proposito:
     *
     *  · la fecha del encabezado vuelve a la de hoy;
     *  · y NO se hace un viaje nuevo al servidor, porque lo de hoy ya estaba
     *    guardado. Es exactamente para lo que sirve la cache: ir y volver
     *    entre dias no debe costar una peticion cada vez.
     */
    const u = userEvent.setup();
    render(<Agenda />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));
    const titulo = screen.getByText(/de \w+ de \d{4}/);
    const deHoy = titulo.textContent;

    await u.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(datos.pedidos.length).toBe(2));
    expect(screen.getByText(/de \w+ de \d{4}/).textContent).not.toBe(deHoy);

    await u.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(screen.getByText(/de \w+ de \d{4}/).textContent).toBe(deHoy));
    expect(datos.pedidos).toHaveLength(2);
  });

  it('las tres vistas existen y se marcan para el lector de pantalla', async () => {
    render(<Agenda />);
    expect(screen.getByRole('button', { name: 'Día' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Mes' }).getAttribute('aria-pressed')).toBe('false');
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
  });
});

describe('seleccionar una cita', () => {
  it('abre el panel con los datos del paciente, sin navegar a otra pantalla', async () => {
    datos.citas = [{ ...CITA, fecha: hoy() }];
    render(<Agenda />);
    await waitFor(() => expect(screen.getByText('Paciente Uno')).toBeDefined());
    await userEvent.setup().click(screen.getByRole('button', { name: /Paciente Uno/ }));
    await waitFor(() => expect(screen.getByLabelText('Cita seleccionada')).toBeDefined());
    expect(screen.getByText('6461112222')).toBeDefined();
    // Sigue en Agenda: el encabezado no cambio.
    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeDefined();
  });

  it('el historial se pide al abrir el panel', async () => {
    datos.citas = [{ ...CITA, fecha: hoy() }];
    const { traerHistorial } = await import('../../src/datos/citas.js');
    render(<Agenda />);
    await waitFor(() => expect(screen.getByText('Paciente Uno')).toBeDefined());
    await userEvent.setup().click(screen.getByRole('button', { name: /Paciente Uno/ }));
    await waitFor(() => expect(traerHistorial).toHaveBeenCalledWith('c1'));
  });
});

describe('crear una cita', () => {
  it('el boton solo aparece con permiso de agenda', async () => {
    render(<Agenda />);
    expect(screen.getByRole('button', { name: '+ Nueva cita' })).toBeDefined();
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
  });

  it('sin permiso NO se puede crear', async () => {
    sesion.valor = {
      ...sesion.valor,
      acceso: { ...sesion.valor.acceso, permisos: { gestionarClientes: true } },
    };
    render(<Agenda />);
    expect(screen.queryByRole('button', { name: '+ Nueva cita' })).toBeNull();
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
    sesion.valor = {
      ...sesion.valor,
      acceso: { ...sesion.valor.acceso, permisos: { gestionarAgenda: true, gestionarClientes: true } },
    };
  });

  it('guarda con el centro, el paciente y el servicio reales', async () => {
    const u = userEvent.setup();
    render(<Agenda />);
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
    await u.click(screen.getByRole('button', { name: '+ Nueva cita' }));
    await u.click(await screen.findByRole('button', { name: /Paciente Uno/ }));
    await u.selectOptions(screen.getByLabelText('Servicio'), 's1');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(datos.creadas).toHaveLength(1));
    expect(datos.creadas[0]).toMatchObject({
      negocioId: 't_centro', clienteId: 'c1', servicioId: 's1',
    });
  });

  it('despues de guardar, la agenda se refresca SOLA', async () => {
    // Sin esto hay que apretar F5 y el sistema se siente muerto.
    const u = userEvent.setup();
    render(<Agenda />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));
    await u.click(screen.getByRole('button', { name: '+ Nueva cita' }));
    await u.click(await screen.findByRole('button', { name: /Paciente Uno/ }));
    await u.selectOptions(screen.getByLabelText('Servicio'), 's1');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(1));
  });
});

describe('filtros', () => {
  it('filtrar por terapeuta vuelve a pedir al servidor', async () => {
    // Si no cambiara la llave, la pantalla mostraria lo guardado sin filtrar.
    const u = userEvent.setup();
    render(<Agenda />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));
    await u.click(screen.getByRole('button', { name: 'Filtros' }));
    await u.selectOptions(await screen.findByLabelText('Terapeuta'), 'p1');
    await waitFor(() => expect(datos.pedidos.length).toBe(2));
  });
});
