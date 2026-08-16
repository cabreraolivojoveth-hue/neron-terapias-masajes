/**
 * @vitest-environment happy-dom
 *
 * EL MODULO SERVICIOS COMPLETO.
 *
 * Lo que se simula es el servidor; lo que se prueba es que la pantalla pida lo
 * correcto, no invente nada con la base vacia, y que las dos decisiones que
 * duelen —apagar un servicio y duplicar uno— lleguen con toda la informacion
 * por delante en vez de a ciegas.
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
      permisos: { gestionarCatalogo: true, gestionarAgenda: true, verFinanzas: true } as Record<
        string,
        boolean
      >,
    },
    llave: 'k',
    cerrarSesion: async () => {},
    refrescar: async () => {},
  },
}));

const datos = vi.hoisted(() => ({
  pagina: { total: 0, filas: [] as unknown[] },
  resumen: null as unknown,
  ficha: null as unknown,
  guardados: [] as unknown[],
  estados: [] as { activo: boolean }[],
  pedidos: [] as { pagina: number; porPagina: number; busqueda?: string }[],
}));

vi.mock('../../src/identidad/sesion.js', () => ({ useSesion: () => sesion.valor }));

vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true, supabase: () => ({}), clienteParaLaBase: () => ({}),
}));

vi.mock('../../src/datos/servicios.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/servicios.js')>(
    '../../src/datos/servicios.js',
  );
  return {
    ...real,
    traerServiciosDelCentro: vi.fn(
      async (_n: string, f: { busqueda?: string }, pagina: number, porPagina: number) => {
        datos.pedidos.push({ pagina, porPagina, ...(f.busqueda ? { busqueda: f.busqueda } : {}) });
        return datos.pagina as { total: number; filas: [] };
      },
    ),
    traerResumenDeServicios: vi.fn(async () => real.ordenarResumenDeServicios(datos.resumen)),
    traerCategorias: vi.fn(async () => []),
    traerFichaDeServicio: vi.fn(async () => datos.ficha),
    buscarServicioParecido: vi.fn(async () => null),
    guardarServicio: vi.fn(async (_n: string, _id: string | null, d: unknown) => {
      datos.guardados.push(d);
    }),
    cambiarEstadoDeServicio: vi.fn(async (_n: string, _f: unknown, activo: boolean) => {
      datos.estados.push({ activo });
    }),
    guardarCategoria: vi.fn(async () => undefined),
    archivarCategoria: vi.fn(async () => undefined),
  };
});

const { olvidarTodo } = await import('../../src/datos/consulta.js');
const { Catalogo, comoSeDuplica, fichaAFormulario, loQuePasaAlApagar } = await import(
  '../../src/servicios/catalogo.js'
);
type FichaDeServicio = import('../../src/datos/servicios.js').FichaDeServicio;

afterEach(() => { cleanup(); olvidarTodo(); });
beforeEach(() => {
  datos.pagina = { total: 0, filas: [] };
  datos.resumen = null;
  datos.ficha = null;
  datos.guardados = [];
  datos.estados = [];
  datos.pedidos = [];
});

const FILA = {
  id: 's1', nombre: 'Sesión Uno', descripcion: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  duracionMin: 60, precioCentavos: 50000, precioHoyCentavos: 50000,
  enPromocion: false, activo: true, color: null,
};

const FICHA: FichaDeServicio = {
  id: 's1', nombre: 'Sesión Uno', descripcion: 'Un texto', notas: 'Algo interno',
  categoriaId: null, categoria: null, categoriaColor: null,
  duracionMin: 60, precioCentavos: 50000,
  precioPromocionalCentavos: null, promocionDesde: null, promocionHasta: null,
  precioHoyCentavos: 50000, color: null,
  requierePreparacion: true, preparacion: 'Llegar sin comer',
  diasDisponibles: '135', horaDesde: '09:00', horaHasta: '18:00',
  activo: true, citasFuturas: 0, citasCompletadas: 0,
  puedeVerHistorial: true, historial: [],
};

describe('un centro recien creado, sin un solo servicio', () => {
  it('se ve en ceros y sin inventar ni una fila', async () => {
    /**
     * LA PRUEBA QUE MAS IMPORTA.
     *
     * Rellenar la pantalla con servicios de mentira "para que se vea completa"
     * contamina la confianza en todos los numeros que si son reales.
     */
    render(<Catalogo />);

    expect(await screen.findByText('No hay servicios registrados')).toBeTruthy();
    expect(screen.getByText('Sin servicios registrados')).toBeTruthy();
    expect(screen.getByText('Sin datos todavía')).toBeTruthy();
    expect(screen.getByText('Mostrando 0 a 0 de 0 servicios')).toBeTruthy();

    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('NaN');
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('Infinity');
    // Ni un nombre ni una cifra de la captura de referencia.
    expect(texto).not.toContain('Masaje Relajante');
    expect(texto).not.toContain('$850');
  });
});

describe('la busqueda', () => {
  it('NO consulta en cada tecla', async () => {
    render(<Catalogo />);
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
    const antes = datos.pedidos.length;

    await userEvent.click(screen.getByRole('button', { name: /Filtrar/ }));
    await userEvent.type(screen.getByLabelText(/Buscar servicio/), 'Masaje');
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(antes));
    // Seis teclas no son seis consultas: las respuestas llegarian desordenadas
    // y la lista mostraria el resultado de lo que se escribio antes.
    expect(datos.pedidos.length - antes).toBeLessThan(3);
    expect(datos.pedidos.at(-1)?.busqueda).toBe('Masaje');
  });

  it('el campo NO pierde el foco al escribir', async () => {
    render(<Catalogo />);
    await userEvent.click(screen.getByRole('button', { name: /Filtrar/ }));
    const campo = screen.getByLabelText(/Buscar servicio/);
    await userEvent.type(campo, 'Masaje profundo');
    expect((campo as HTMLInputElement).value).toBe('Masaje profundo');
    expect(document.activeElement).toBe(campo);
  });
});

describe('dar de alta', () => {
  it('guarda en SERVICIOS lo capturado', async () => {
    render(<Catalogo />);
    await screen.findByText('No hay servicios registrados');

    await userEvent.click(screen.getAllByRole('button', { name: /Nuevo servicio/ })[0]!);
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Sesión Nueva');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(datos.guardados.length).toBe(1));
    expect((datos.guardados[0] as { nombre: string }).nombre).toBe('Sesión Nueva');
  });
});

describe('editar y duplicar traen la ficha COMPLETA', () => {
  it('editar no pierde las notas ni la preparacion, que no vienen en la lista', async () => {
    // El renglon de la lista trae seis campos; editar necesita los dieciseis.
    // Abrir el formulario con lo que hay en la lista y guardar borraria en
    // silencio las notas, la preparacion y la disponibilidad.
    datos.pagina = { total: 1, filas: [FILA] };
    datos.ficha = FICHA;
    render(<Catalogo />);

    await userEvent.click(await screen.findByRole('button', { name: 'Acciones para Sesión Uno' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    await userEvent.click(await screen.findByRole('button', { name: /Lo demás del servicio/ }));
    expect((screen.getByLabelText(/En qué consiste/) as HTMLTextAreaElement).value).toBe(
      'Llegar sin comer',
    );
    expect((screen.getByLabelText(/Notas internas/) as HTMLTextAreaElement).value).toBe(
      'Algo interno',
    );
  });

  it('la ficha entera pasa al formulario sin perder ni un campo', () => {
    const f = fichaAFormulario(FICHA);
    expect(f.diasDisponibles).toBe('135');
    expect(f.horaDesde).toBe('09:00');
    expect(f.notas).toBe('Algo interno');
    // Los nulos se vuelven cadena vacia, que es lo que come un campo de texto.
    expect(f.color).toBe('');
    expect(f.promocionDesde).toBe('');
  });

  it('un duplicado sale con OTRO nombre y APAGADO', () => {
    // Con el mismo nombre, el catalogo queda con dos renglones identicos y
    // ningun reporte por servicio vuelve a cuadrar. Apagado, porque una copia
    // a medio ajustar que ya se ofrece se acaba agendando por error.
    const copia = comoSeDuplica(FICHA);
    expect(copia.nombre).toBe('Sesión Uno (copia)');
    expect(copia.activo).toBe(false);
    expect(copia.duracionMin).toBe(60);
  });
});

describe('apagar un servicio', () => {
  it('dice CUANTAS citas futuras hay antes de decidir', () => {
    // Apagar a ciegas uno con doce citas por delante deja doce personas
    // esperando algo que ya no se ofrece.
    expect(loQuePasaAlApagar({ ...FICHA, citasFuturas: 12 })).toContain('12 citas agendadas');
    expect(loQuePasaAlApagar({ ...FICHA, citasFuturas: 1 })).toContain('1 cita agendada');
    expect(loQuePasaAlApagar({ ...FICHA, citasFuturas: 0 })).toContain('ninguna cita agendada');
  });

  it('encender dice otra cosa, no el aviso de apagar', () => {
    expect(loQuePasaAlApagar({ ...FICHA, activo: false })).toContain('Volverá a ofrecerse');
  });

  it('sin ficha no se inventa un aviso', () => {
    expect(loQuePasaAlApagar(null)).toBe('');
  });

  it('PIDE confirmacion, y solo entonces cambia el estado', async () => {
    datos.pagina = { total: 1, filas: [FILA] };
    datos.ficha = { ...FICHA, citasFuturas: 3 };
    render(<Catalogo />);

    await userEvent.click(await screen.findByRole('button', { name: 'Acciones para Sesión Uno' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));

    expect(await screen.findByText(/3 citas agendadas/)).toBeTruthy();
    expect(datos.estados.length).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(datos.estados.length).toBe(1));
    expect(datos.estados[0]?.activo).toBe(false);
  });
});

describe('las cifras con datos', () => {
  it('salen del resumen del servidor, no de contar las filas de la pagina', async () => {
    // Contar las filas visibles daria "10 servicios" en una pagina de diez,
    // aunque haya trescientos.
    datos.resumen = { total: 340, activos: 300, inactivos: 40, duracionPromedio: 72 };
    datos.pagina = { total: 340, filas: [FILA] };
    render(<Catalogo />);

    expect(await screen.findByText('340')).toBeTruthy();
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.getByText('72 min')).toBeTruthy();
    expect(screen.getByText('Mostrando 1 a 1 de 340 servicios')).toBeTruthy();
  });
});

describe('lo que Servicios NO conoce', () => {
  it('no importa nada de Agenda, Ventas ni Inicio', async () => {
    // Que dos modulos esten conectados no significa que uno tenga que conocer
    // las tripas del otro. El unico contrato es la tabla y su id.
    const fuente = await import('node:fs').then((fs) =>
      fs.readFileSync('src/servicios/catalogo.tsx', 'utf8'),
    );
    expect(fuente).not.toContain("from '../agenda/");
    expect(fuente).not.toContain("from '../inicio/");
    expect(fuente).not.toContain("from '../clientes/");
  });
});
