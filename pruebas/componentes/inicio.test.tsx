/**
 * @vitest-environment happy-dom
 *
 * LA PANTALLA DE INICIO COMPLETA.
 *
 * Lo que se simula es el servidor; lo que se prueba es que la pantalla pida lo
 * correcto, respete el rol, y no invente ni un dato cuando no hay nada.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sesion = vi.hoisted(() => ({
  valor: {
    estado: 'listo',
    acceso: {
      negocioId: 't_centro', usuarioId: 'u1', correo: 'a@b.mx', nombre: 'Dueña Del Centro',
      rol: 'dueno', rolEtiqueta: 'Dueña', esDueno: true, modulos: [],
      permisos: {
        gestionarAgenda: true, gestionarClientes: true, gestionarCatalogo: true,
        gestionarInventario: true, cobrar: true, verFinanzas: true,
      } as Record<string, boolean>,
    },
    llave: 'k',
    cerrarSesion: async () => {},
    refrescar: async () => {},
  },
}));

const datos = vi.hoisted(() => ({
  resumen: null as unknown,
  citas: [] as unknown[],
  recordatorios: [] as unknown[],
  ingresosPedidos: [] as { desde: string; hasta: string }[],
}));

const navegacion = vi.hoisted(() => ({ ir: (() => {}) as (m: string, o?: unknown) => void }));

vi.mock('../../src/identidad/sesion.js', () => ({ useSesion: () => sesion.valor }));

vi.mock('@neron/base/marco', async () => {
  const real = await vi.importActual<typeof import('@neron/base/marco')>('@neron/base/marco');
  return { ...real, useNavegacion: () => ({ ruta: { modulo: 'inicio', parametros: {} }, ir: navegacion.ir, filtrar: () => {}, atras: () => {} }) };
});

vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true, supabase: () => ({}), clienteParaLaBase: () => ({}),
}));

vi.mock('../../src/datos/citas.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/citas.js')>(
    '../../src/datos/citas.js',
  );
  return { ...real, traerCitas: vi.fn(async () => datos.citas) };
});

vi.mock('../../src/datos/tablero.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/tablero.js')>(
    '../../src/datos/tablero.js',
  );
  return {
    ...real,
    traerResumen: vi.fn(async () => real.ordenarResumen(datos.resumen)),
    traerRecordatoriosCercanos: vi.fn(async () => datos.recordatorios),
    traerIngresosPorDia: vi.fn(async (_n: string, desde: string, hasta: string) => {
      datos.ingresosPedidos.push({ desde, hasta });
      return [];
    }),
  };
});

const { olvidarTodo } = await import('../../src/datos/consulta.js');
const { Inicio } = await import('../../src/inicio/inicio.js');

afterEach(() => { cleanup(); olvidarTodo(); });
beforeEach(() => {
  datos.resumen = null;
  datos.citas = [];
  datos.recordatorios = [];
  datos.ingresosPedidos = [];
  navegacion.ir = () => {};
  sesion.valor.acceso.permisos = {
    gestionarAgenda: true, gestionarClientes: true, gestionarCatalogo: true,
    gestionarInventario: true, cobrar: true, verFinanzas: true,
  };
});

describe('el encabezado', () => {
  it('saluda con el PRIMER nombre de quien entro, no con uno escrito a mano', async () => {
    render(<Inicio />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Dueña');
    expect(screen.getByRole('heading', { level: 2 }).textContent).not.toContain('Del Centro');
  });

  it('la fecha es la de hoy, calculada', () => {
    render(<Inicio />);
    // No se comprueba el texto exacto —cambia cada dia— sino que tenga la
    // forma de una fecha larga en español y no una escrita en el codigo.
    expect(screen.getByText(/ de .+ de \d{4}$/)).toBeTruthy();
  });
});

describe('un centro recien creado, sin un solo registro', () => {
  it('se ve profesional y en ceros, sin inventar ni una fila', async () => {
    /**
     * ES LA PRUEBA QUE MAS IMPORTA DEL PRODUCTO ENTERO.
     *
     * Una cuenta nueva tiene que verse bien vacia. Rellenar la pantalla con
     * datos de mentira "para que se vea completa" contamina la confianza en
     * todos los numeros que si son reales.
     */
    render(<Inicio />);

    expect(await screen.findByText('No hay citas programadas para hoy.')).toBeTruthy();
    expect(screen.getByText('No tienes recordatorios pendientes.')).toBeTruthy();
    expect(screen.getByText('Aún no hay suficientes datos.')).toBeTruthy();
    expect(screen.getByText('Aún no se han registrado ventas de productos.')).toBeTruthy();

    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('NaN');
    expect(texto).not.toContain('Infinity');
    expect(texto).not.toContain('undefined');
  });
});

describe('el rol decide lo que se ve', () => {
  it('sin permiso de finanzas no hay ventas, ni grafica, ni rankings', async () => {
    /**
     * No es solo que se escondan: `resumen_inicio` corre con los permisos de
     * quien llama, asi que la base tampoco le entrega esos numeros. Aqui se
     * comprueba lo que le toca a la pantalla — que no le muestre un "$0" que
     * esa persona leeria como "hoy no se ha vendido nada".
     */
    sesion.valor.acceso.permisos = { gestionarAgenda: true };
    render(<Inicio />);

    await screen.findByText('No hay citas programadas para hoy.');
    expect(screen.queryByText('Ventas hoy')).toBeNull();
    expect(screen.queryByText(/Ingresos/)).toBeNull();
    expect(screen.queryByText('Servicios más vendidos')).toBeNull();
    expect(screen.queryByText('Productos más vendidos')).toBeNull();
    // Lo suyo si lo ve.
    expect(screen.getByText('Citas hoy')).toBeTruthy();
    expect(screen.getByText('Recordatorios')).toBeTruthy();
  });
});

describe('la grafica y su periodo', () => {
  it('la semana en curso NO cuesta un viaje extra: viene en el resumen', async () => {
    datos.resumen = {
      ingresosSemana: [{ fecha: '2026-08-03', total: 12345 }],
    };
    render(<Inicio />);
    await screen.findByText('Servicios más vendidos');
    expect(datos.ingresosPedidos).toEqual([]);
  });

  it('cambiar a otro periodo si pide sus dias', async () => {
    render(<Inicio />);
    await userEvent.selectOptions(
      await screen.findByLabelText('Periodo de la gráfica'),
      'semanaAnterior',
    );
    await waitFor(() => expect(datos.ingresosPedidos.length).toBe(1));
  });
});

describe('a donde llevan las cosas', () => {
  it('"Nueva cita" abre la Agenda Y le deja dicho que abra el formulario', async () => {
    const ir = vi.fn();
    navegacion.ir = ir;
    render(<Inicio />);
    await userEvent.click(await screen.findByText('Nueva cita', { selector: '.ini-agenda__nueva span' }));
    expect(ir.mock.calls[0]?.[0]).toBe('agenda');
    expect((ir.mock.calls[0]?.[1] as { intencion?: string })?.intencion).toBe('agenda:nueva');
  });

  it('una cita de la lista abre la Agenda en su dia y con ella señalada', async () => {
    datos.citas = [{
      id: 'cita-9', fecha: '06/08/2026', horaInicio: '10:00', horaFin: '11:00',
      estado: 'confirmada', notas: null,
      clienteId: 'c1', cliente: 'Persona', clienteTelefono: null, clienteCorreo: null,
      servicioId: 's1', servicio: 'Sesión', servicioMinutos: 60, servicioPrecio: 0,
      profesionalId: null, profesional: null,
    }];
    const ir = vi.fn();
    navegacion.ir = ir;
    render(<Inicio />);
    await userEvent.click(await screen.findByText('Persona'));
    expect(ir.mock.calls[0]?.[0]).toBe('agenda');
    expect((ir.mock.calls[0]?.[1] as { intencion?: string })?.intencion).toBe('agenda:abrir:cita-9');
  });
});
