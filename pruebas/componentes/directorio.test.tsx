/**
 * @vitest-environment happy-dom
 *
 * EL MODULO CLIENTES COMPLETO.
 *
 * Lo que se simula es el servidor; lo que se prueba es que la pantalla pida lo
 * correcto, no invente nada con la base vacia, y mande a cada modulo dueño con
 * el id del cliente por delante.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sesion = vi.hoisted(() => ({
  valor: {
    estado: 'listo',
    acceso: {
      negocioId: 't_centro', usuarioId: 'u1', correo: 'a@b.mx', nombre: 'Dueña',
      rol: 'dueno', rolEtiqueta: 'Dueña', esDueno: true, modulos: [],
      permisos: {
        gestionarClientes: true, gestionarAgenda: true, gestionarCatalogo: true,
        cobrar: true, verFinanzas: true,
      } as Record<string, boolean>,
    },
    llave: 'k',
    cerrarSesion: async () => {},
    refrescar: async () => {},
  },
}));

const datos = vi.hoisted(() => ({
  pagina: { total: 0, filas: [] as unknown[] },
  resumen: null as unknown,
  creados: [] as unknown[],
  pedidos: [] as { pagina: number; porPagina: number; busqueda?: string }[],
  expediente: null as unknown,
}));

const navegacion = vi.hoisted(() => ({ ir: (() => {}) as (m: string, o?: unknown) => void }));

vi.mock('../../src/identidad/sesion.js', () => ({ useSesion: () => sesion.valor }));

vi.mock('@neron/base/marco', async () => {
  const real = await vi.importActual<typeof import('@neron/base/marco')>('@neron/base/marco');
  return {
    ...real,
    useNavegacion: () => ({
      ruta: { modulo: 'clientes', parametros: {} },
      ir: navegacion.ir, filtrar: () => {}, atras: () => {},
    }),
  };
});

vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true, supabase: () => ({}), clienteParaLaBase: () => ({}),
}));

vi.mock('../../src/datos/citas.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/citas.js')>(
    '../../src/datos/citas.js',
  );
  return { ...real, traerProfesionales: vi.fn(async () => [{ id: 'p1', nombre: 'Terapeuta A', rol: 'dueno' }]) };
});

vi.mock('../../src/datos/clientes.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/clientes.js')>(
    '../../src/datos/clientes.js',
  );
  return {
    ...real,
    traerClientes: vi.fn(async (_n: string, f: { busqueda?: string }, pagina: number, porPagina: number) => {
      datos.pedidos.push({ pagina, porPagina, ...(f.busqueda ? { busqueda: f.busqueda } : {}) });
      return datos.pagina;
    }),
    traerResumenDeClientes: vi.fn(async () => real.ordenarResumenDeClientes(datos.resumen)),
    traerSeguimientos: vi.fn(async () => []),
    traerExpediente: vi.fn(async () => datos.expediente),
    buscarPosibleDuplicado: vi.fn(async () => null),
    crearCliente: vi.fn(async (_n: string, d: unknown) => {
      datos.creados.push(d);
      return { id: 'nuevo', nombre: 'X', telefono: null, correo: null, fechaNacimiento: null,
               profesionalId: null, profesional: null, visitas: 0, ultimaVisita: null,
               estado: 'inactivo' };
    }),
    editarCliente: vi.fn(async () => undefined),
    archivarCliente: vi.fn(async () => undefined),
  };
});

const { olvidarTodo } = await import('../../src/datos/consulta.js');
const { Directorio } = await import('../../src/clientes/directorio.js');

afterEach(() => { cleanup(); olvidarTodo(); });
beforeEach(() => {
  datos.pagina = { total: 0, filas: [] };
  datos.resumen = null;
  datos.creados = [];
  datos.pedidos = [];
  datos.expediente = null;
  navegacion.ir = () => {};
});

const FILA = {
  id: 'c1', nombre: 'Persona Uno', telefono: '6641234567', correo: 'uno@correo.mx',
  fechaNacimiento: null, profesionalId: null, profesional: null,
  visitas: 3, ultimaVisita: '10/07/2026', estado: 'activo',
};

describe('un centro recien creado, sin un solo cliente', () => {
  it('se ve en ceros y sin inventar ni una fila', async () => {
    /**
     * LA PRUEBA QUE MAS IMPORTA.
     *
     * Rellenar la pantalla con nombres de mentira "para que se vea completa"
     * contamina la confianza en todos los numeros que si son reales.
     */
    render(<Directorio />);

    expect(await screen.findByText('Todavía no hay clientes')).toBeTruthy();
    expect(screen.getByText('Sin clientes registrados')).toBeTruthy();
    expect(screen.getByText('No hay cumpleaños próximos')).toBeTruthy();
    expect(screen.getByText('No hay recordatorios')).toBeTruthy();
    expect(screen.getByText('0 clientes')).toBeTruthy();

    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('NaN');
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('Infinity');
  });
});

describe('la busqueda', () => {
  it('NO consulta en cada tecla', async () => {
    render(<Directorio />);
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
    const antes = datos.pedidos.length;

    await userEvent.type(screen.getByLabelText(/Buscar cliente/), 'Fernanda');
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(antes));
    // Ocho teclas no son ocho consultas: las respuestas llegarian desordenadas
    // y la lista mostraria el resultado de lo que se escribio antes.
    expect(datos.pedidos.length - antes).toBeLessThan(3);
    expect(datos.pedidos.at(-1)?.busqueda).toBe('Fernanda');
  });

  it('el campo NO pierde el foco al escribir', async () => {
    render(<Directorio />);
    const campo = screen.getByLabelText(/Buscar cliente/);
    await userEvent.type(campo, 'María Fernanda');
    expect((campo as HTMLInputElement).value).toBe('María Fernanda');
    expect(document.activeElement).toBe(campo);
  });
});

describe('dar de alta', () => {
  it('guarda en CLIENTES y normaliza lo capturado', async () => {
    render(<Directorio />);
    await screen.findByText('Todavía no hay clientes');

    await userEvent.click(screen.getAllByRole('button', { name: /Nuevo cliente/ })[0]!);
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Persona Nueva');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(datos.creados.length).toBe(1));
    expect((datos.creados[0] as { nombre: string }).nombre).toBe('Persona Nueva');
  });
});

/** El expediente que contesta el servidor de mentiras al abrir a alguien. */
const EXPEDIENTE = {
  id: 'c1', nombre: 'Persona Uno', telefono: '6641234567', correo: 'uno@correo.mx',
  fechaNacimiento: null, notas: null, clienteDesde: null, archivado: false,
  profesionalId: null, profesional: null,
  visitas: 3, canceladas: 0, noAsistio: 0, ultimaVisita: null, proximaCita: null,
  compras: 0, totalGastado: 0, adeudo: 0, cursos: 0, servicios: [],
};

/**
 * Abre a alguien y espera su ficha.
 *
 * LAS ACCIONES YA NO VIVEN EN EL INDICE. El renglon solo escoge; lo que se hace
 * con una persona esta en su ficha y en la columna de apoyo, que es donde se
 * esta cuando se decide hacerlo. Por eso la prueba tiene que abrirla primero:
 * es el camino de verdad.
 */
async function abrirA(nombre: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${nombre}`) }));
}

describe('a donde lleva cada accion', () => {
  it('"Nueva cita" abre AGENDA con el id del cliente por delante', async () => {
    /**
     * Va el ID, no el nombre ni el telefono: un telefono copiado deja de ser
     * el bueno en cuanto alguien lo corrige en su expediente.
     */
    datos.pagina = { total: 1, filas: [FILA] };
    datos.expediente = EXPEDIENTE;
    const ir = vi.fn();
    navegacion.ir = ir;
    render(<Directorio />);

    await abrirA('Persona Uno');
    await userEvent.click(await screen.findByRole('button', { name: /Agendar/ }));

    expect(ir.mock.calls[0]?.[0]).toBe('agenda');
    expect((ir.mock.calls[0]?.[1] as { intencion?: string })?.intencion).toBe('agenda:nueva:c1');
  });

  it('"Enviar mensaje" abre MENSAJES con el id del cliente', async () => {
    datos.pagina = { total: 1, filas: [FILA] };
    datos.expediente = EXPEDIENTE;
    const ir = vi.fn();
    navegacion.ir = ir;
    render(<Directorio />);

    await abrirA('Persona Uno');
    await userEvent.click(await screen.findByRole('button', { name: /Enviar mensaje/ }));

    expect(ir.mock.calls[0]?.[0]).toBe('mensajes');
    expect((ir.mock.calls[0]?.[1] as { intencion?: string })?.intencion)
      .toBe('mensajes:escribir:c1');
  });

  it('Clientes NO importa nada de Agenda ni de Ventas: navega con un recado', async () => {
    // Que dos modulos esten conectados no significa que uno conozca las tripas
    // del otro. El unico contrato es la direccion y el recado.
    const fuente = await import('node:fs').then((fs) =>
      fs.readFileSync('src/clientes/directorio.tsx', 'utf8'),
    );
    expect(fuente).not.toContain("from '../agenda/");
    expect(fuente).not.toContain("from '../inicio/");
  });
});

describe('las cifras con datos', () => {
  it('salen del resumen del servidor, no de contar las filas de la pagina', async () => {
    // Contar las filas visibles daria "10 clientes" en una pagina de diez,
    // aunque haya trescientos.
    datos.resumen = { total: 340, activos: 120, totalVisitas: 900 };
    datos.pagina = { total: 340, filas: [FILA] };
    render(<Directorio />);

    expect(await screen.findByText('340')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText('340 clientes')).toBeTruthy();
  });
});
