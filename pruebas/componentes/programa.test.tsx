/**
 * @vitest-environment happy-dom
 *
 * EL MODULO CURSOS COMPLETO.
 *
 * Lo que se simula es el servidor; lo que se prueba es que la pantalla pida lo
 * correcto, no invente nada con la base vacia, y que las conexiones —Clientes
 * para los alumnos, Agenda para las sesiones— pasen por donde deben.
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
      permisos: { gestionarCatalogo: true, gestionarAgenda: true } as Record<string, boolean>,
    },
    llave: 'k', cerrarSesion: async () => {}, refrescar: async () => {},
  },
}));

const datos = vi.hoisted(() => ({
  pagina: { total: 0, filas: [] as unknown[] },
  resumen: null as unknown,
  ficha: null as unknown,
  guardados: [] as unknown[],
  inscritos: [] as { curso: string; cliente: string }[],
  pedidos: [] as { pagina: number; busqueda?: string }[],
}));

const navegacion = vi.hoisted(() => ({ ir: (() => {}) as (m: string, o?: unknown) => void }));

vi.mock('../../src/identidad/sesion.js', () => ({ useSesion: () => sesion.valor }));
vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true, supabase: () => ({}), clienteParaLaBase: () => ({}),
}));

vi.mock('@neron/base/marco', async () => {
  const real = await vi.importActual<typeof import('@neron/base/marco')>('@neron/base/marco');
  return {
    ...real,
    useNavegacion: () => ({
      ruta: { modulo: 'cursos', parametros: {} },
      ir: navegacion.ir, filtrar: () => {}, atras: () => {},
    }),
  };
});

vi.mock('../../src/datos/citas.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/citas.js')>(
    '../../src/datos/citas.js',
  );
  return {
    ...real,
    traerProfesionales: vi.fn(async () => [{ id: 'p1', nombre: 'Terapeuta A', rol: 'dueno' }]),
    traerClientes: vi.fn(async () => [
      { id: 'c1', nombre: 'Persona Uno', telefono: '6641234567', correo: null },
    ]),
  };
});

vi.mock('../../src/datos/categorias.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/categorias.js')>(
    '../../src/datos/categorias.js',
  );
  return { ...real, traerCategorias: vi.fn(async () => []) };
});

vi.mock('../../src/datos/cursos.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/cursos.js')>(
    '../../src/datos/cursos.js',
  );
  return {
    ...real,
    traerCursosDelCentro: vi.fn(async (_n: string, f: { busqueda?: string }, pagina: number) => {
      datos.pedidos.push({ pagina, ...(f.busqueda ? { busqueda: f.busqueda } : {}) });
      return datos.pagina as { total: number; filas: [] };
    }),
    traerResumenDeCursos: vi.fn(async () => real.ordenarResumenDeCursos(datos.resumen)),
    traerFichaDeCurso: vi.fn(async () => datos.ficha),
    guardarCurso: vi.fn(async (_n: string, _id: string | null, d: unknown) => {
      datos.guardados.push(d);
    }),
    cambiarEstadoDeCurso: vi.fn(async () => undefined),
    inscribirEnCurso: vi.fn(async (_n: string, curso: string, cliente: string) => {
      datos.inscritos.push({ curso, cliente });
      return 'inscrito';
    }),
    cambiarEstadoDeInscripcion: vi.fn(async () => undefined),
    guardarSesion: vi.fn(async () => undefined),
    archivarSesion: vi.fn(async () => undefined),
    guardarMaterial: vi.fn(async () => undefined),
    archivarMaterial: vi.fn(async () => undefined),
  };
});

const { olvidarTodo } = await import('../../src/datos/consulta.js');
const { Programa, comoSeDuplicaElCurso, fichaAFormularioDeCurso } = await import(
  '../../src/cursos/programa.js'
);
type FichaDeCurso = import('../../src/datos/cursos.js').FichaDeCurso;

afterEach(() => { cleanup(); olvidarTodo(); });
beforeEach(() => {
  datos.pagina = { total: 0, filas: [] };
  datos.resumen = null;
  datos.ficha = null;
  datos.guardados = [];
  datos.inscritos = [];
  datos.pedidos = [];
  navegacion.ir = () => {};
});

const FILA = {
  id: 'k1', nombre: 'Taller Uno', subtitulo: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  instructorId: null, instructor: null,
  fechaInicio: '15/07/2026', fechaFin: '16/07/2026', sesiones: 2,
  precioCentavos: 250000, cupo: 12, ocupados: 8,
  modalidad: 'presencial', imagenUrl: null, vida: 'proximo', activo: true,
};

const FICHA: FichaDeCurso = {
  id: 'k1', nombre: 'Taller Uno', subtitulo: 'Un subtítulo', descripcion: 'Texto',
  notas: 'Algo interno',
  categoriaId: null, categoria: null, categoriaColor: null,
  instructorId: null, instructor: null,
  fechaInicio: '15/07/2026', fechaFin: '16/07/2026', precioCentavos: 250000,
  cupo: 12, ocupados: 8, enEspera: 0,
  modalidad: 'presencial', lugar: 'Sala', enlace: null, imagenUrl: null,
  estado: 'programado', activo: true, vida: 'proximo',
  alumnos: [], sesiones: [], material: [],
};

describe('un centro recien creado, sin un solo curso', () => {
  it('se ve en ceros y sin inventar ni una fila', async () => {
    /**
     * LA PRUEBA QUE MAS IMPORTA.
     *
     * Rellenar la pantalla con cursos de mentira "para que se vea completa"
     * contamina la confianza en todos los numeros que si son reales.
     */
    render(<Programa />);

    expect(await screen.findByText('No hay cursos registrados')).toBeTruthy();
    expect(screen.getByText('Sin cursos registrados')).toBeTruthy();
    expect(screen.getByText('Mostrando 0 a 0 de 0 cursos')).toBeTruthy();

    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('NaN');
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('Infinity');
    // Ni un nombre ni una cifra de la captura de referencia.
    for (const delDiseño of ['Reiki Nivel 1', 'Biomagnetismo Médico', '$2,500', '42']) {
      expect(texto).not.toContain(delDiseño);
    }
  });
});

describe('la busqueda', () => {
  it('NO consulta en cada tecla', async () => {
    render(<Programa />);
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
    const antes = datos.pedidos.length;

    await userEvent.click(screen.getByRole('button', { name: /Filtrar/ }));
    await userEvent.type(screen.getByLabelText(/Buscar curso/), 'Reiki');
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(antes));
    expect(datos.pedidos.length - antes).toBeLessThan(3);
    expect(datos.pedidos.at(-1)?.busqueda).toBe('Reiki');
  });

  it('el campo NO pierde el foco al escribir', async () => {
    render(<Programa />);
    await userEvent.click(screen.getByRole('button', { name: /Filtrar/ }));
    const campo = screen.getByLabelText(/Buscar curso/);
    await userEvent.type(campo, 'Curso de Desarrollo Integral y Bienestar');
    expect((campo as HTMLInputElement).value).toBe('Curso de Desarrollo Integral y Bienestar');
    expect(document.activeElement).toBe(campo);
  });
});

describe('dar de alta', () => {
  it('guarda en CURSOS lo capturado', async () => {
    render(<Programa />);
    await screen.findByText('No hay cursos registrados');

    await userEvent.click(screen.getAllByRole('button', { name: /Nuevo curso/ })[0]!);
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Taller Nuevo');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(screen.getByLabelText(/Empieza/), { target: { value: '2026-07-15' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(datos.guardados.length).toBe(1));
    expect((datos.guardados[0] as { nombre: string }).nombre).toBe('Taller Nuevo');
  });
});

describe('editar y duplicar traen la ficha COMPLETA', () => {
  it('la ficha entera pasa al formulario sin perder ni un campo', () => {
    const f = fichaAFormularioDeCurso(FICHA);
    expect(f.notas).toBe('Algo interno');
    expect(f.lugar).toBe('Sala');
    expect(f.cupo).toBe(12);
    // Los nulos se vuelven cadena vacia, que es lo que come un campo de texto.
    expect(f.enlace).toBe('');
    expect(f.imagenUrl).toBe('');
  });

  it('un duplicado sale con OTRO nombre y APAGADO', () => {
    const copia = comoSeDuplicaElCurso(FICHA);
    expect(copia.nombre).toBe('Taller Uno (copia)');
    expect(copia.activo).toBe(false);
    expect(copia.cupo).toBe(12);
  });

  it('editar no pierde las notas, que no vienen en la lista', async () => {
    datos.pagina = { total: 1, filas: [FILA] };
    datos.ficha = FICHA;
    render(<Programa />);

    await userEvent.click(await screen.findByRole('button', { name: 'Acciones para Taller Uno' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    await userEvent.click(await screen.findByRole('button', { name: /Lo demás del curso/ }));
    expect((screen.getByLabelText(/Notas internas/) as HTMLTextAreaElement).value).toBe(
      'Algo interno',
    );
  });
});

describe('los alumnos salen de CLIENTES', () => {
  it('inscribir busca en la lista de clientes del centro', async () => {
    datos.pagina = { total: 1, filas: [FILA] };
    datos.ficha = FICHA;
    render(<Programa />);

    // La tabla y las tarjetas de celular pintan el mismo nombre: se abre por
    // el menu de acciones, que es unico.
    await userEvent.click(await screen.findByRole('button', { name: 'Acciones para Taller Uno' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ver detalle' }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Alumnos' }));
    await userEvent.click(screen.getByRole('button', { name: /Inscribir alumno/ }));

    expect(await screen.findByText('Persona Uno')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Inscribir' }));
    await waitFor(() => expect(datos.inscritos.length).toBe(1));
    expect(datos.inscritos[0]).toEqual({ curso: 'k1', cliente: 'c1' });
  });

  it('dar de alta a alguien nuevo manda a CLIENTES con un recado', async () => {
    datos.pagina = { total: 1, filas: [FILA] };
    datos.ficha = FICHA;
    const ir = vi.fn();
    navegacion.ir = ir;
    render(<Programa />);

    // La tabla y las tarjetas de celular pintan el mismo nombre: se abre por
    // el menu de acciones, que es unico.
    await userEvent.click(await screen.findByRole('button', { name: 'Acciones para Taller Uno' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ver detalle' }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Alumnos' }));
    await userEvent.click(screen.getByRole('button', { name: /Inscribir alumno/ }));
    await userEvent.click(screen.getByRole('button', { name: /darlo de alta/ }));

    expect(ir.mock.calls[0]?.[0]).toBe('clientes');
    expect((ir.mock.calls[0]?.[1] as { intencion?: string })?.intencion).toBe('clientes:nuevo');
  });
});

describe('las cifras con datos', () => {
  it('salen del resumen del servidor, no de contar las filas de la pagina', async () => {
    datos.resumen = { total: 340, activos: 300, proximos: 12, alumnos: 900, ocupacionPromedio: 70 };
    datos.pagina = { total: 340, filas: [FILA] };
    render(<Programa />);

    expect(await screen.findByText('340')).toBeTruthy();
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.getByText('900')).toBeTruthy();
    expect(screen.getByText('Mostrando 1 a 1 de 340 cursos')).toBeTruthy();
  });
});

describe('lo que Cursos NO conoce', () => {
  it('no importa nada de Clientes, Agenda ni Servicios', async () => {
    // Que dos modulos esten conectados no significa que uno tenga que conocer
    // las tripas del otro. El unico contrato es la tabla y su id.
    const fuente = await import('node:fs').then((fs) =>
      fs.readFileSync('src/cursos/programa.tsx', 'utf8'),
    );
    expect(fuente).not.toContain("from '../clientes/");
    expect(fuente).not.toContain("from '../agenda/");
    expect(fuente).not.toContain("from '../servicios/");
    expect(fuente).not.toContain("from '../inicio/");
  });
});
