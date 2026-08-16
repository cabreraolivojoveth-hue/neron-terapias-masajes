/**
 * @vitest-environment happy-dom
 *
 * El armazon: que se ve segun el estado de la sesion. La sesion se simula con
 * un proveedor de mentiras — lo que se prueba aqui es el REPARTIDOR, no el
 * portero, que ya esta probado en la base sin navegador.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

// El modulo de Supabase se reemplaza ANTES de importar nada que lo use: si no,
// el cliente de verdad intentaria conectarse durante la prueba.
vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => { throw new Error('no se usa en pruebas'); },
  clienteParaLaBase: () => { throw new Error('no se usa en pruebas'); },
}));

const sesionFalsa = vi.hoisted(() => ({
  valor: {
    estado: 'cargando' as string,
    acceso: null as unknown,
    llave: 'x',
    fallo: null as string | null,
    cerrarSesion: async () => {},
    refrescar: async () => {},
  },
}));

vi.mock('../../src/identidad/sesion.js', () => ({
  ProveedorDeSesion: ({ children }: { children: React.ReactNode }) => children,
  useSesion: () => sesionFalsa.valor,
  // Sin tardanza: lo que se prueba aqui es el repartidor de estados, no el
  // reloj. La pantalla de "no pudimos conectar" tiene su propia prueba.
  useTardaDemasiado: () => false,
}));

const { Aplicacion } = await import('../../src/aplicacion.js');

afterEach(cleanup);

const conEstado = (estado: string, acceso: unknown = null) => {
  sesionFalsa.valor = { ...sesionFalsa.valor, estado, acceso };
  return render(<Aplicacion />);
};

const ACCESO_DUENA = {
  negocioId: 't_centro',
  usuarioId: 'u1',
  correo: 'duena@centro.mx',
  nombre: 'Dueña del Centro',
  rol: 'dueno',
  rolEtiqueta: 'Dueña',
  permisos: {
    gestionarClientes: true, gestionarAgenda: true, gestionarCatalogo: true,
    gestionarInventario: true, cobrar: true, verFinanzas: true,
    gestionarConfiguracion: true,
  },
  modulos: [],
  esDueno: true,
};

describe('mientras carga', () => {
  it('NO parpadea la pantalla de entrar', () => {
    // El portero arranca en 'cargando' justo por esto: sin ese estado, quien
    // ya tenia sesion ve medio segundo el formulario de entrada, y eso se
    // siente roto aunque todo funcione.
    const { container } = conEstado('cargando');
    expect(screen.queryByLabelText('Correo')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('le avisa al lector de pantalla', () => {
    conEstado('cargando');
    expect(screen.getByText('Cargando tu sesión')).toBeDefined();
  });
});

describe('sin sesion', () => {
  it('pide correo y contraseña, con sus etiquetas', () => {
    conEstado('sin-sesion');
    expect(screen.getByLabelText('Correo')).toBeDefined();
    expect(screen.getByLabelText('Contraseña')).toBeDefined();
  });

  it('la contraseña va oculta y con autocompletado de contraseña', () => {
    conEstado('sin-sesion');
    const campo = screen.getByLabelText('Contraseña');
    expect(campo.getAttribute('type')).toBe('password');
    expect(campo.getAttribute('autocomplete')).toBe('current-password');
  });

  it('NO muestra nada del sistema', () => {
    conEstado('sin-sesion');
    expect(screen.queryByText('Agenda')).toBeNull();
    expect(screen.queryByText('Caja')).toBeNull();
  });
});

describe('los estados que dejan a medias', () => {
  it('sin negocio se explica que falta y como resolverlo', () => {
    conEstado('sin-negocio');
    expect(screen.getByText(/todavía no está en ningún centro/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Salir' })).toBeDefined();
  });

  it('falta segundo factor tambien se explica', () => {
    conEstado('falta-segundo-factor');
    expect(screen.getByText(/Falta el segundo paso/i)).toBeDefined();
  });

  it('y desde los dos se puede SALIR', () => {
    // Sin el boton, quien cae ahi con la cuenta equivocada queda atrapado y
    // la unica salida es borrar los datos del navegador.
    for (const e of ['sin-negocio', 'falta-segundo-factor']) {
      cleanup();
      conEstado(e);
      expect(screen.getByRole('button', { name: 'Salir' }), e).toBeDefined();
    }
  });
});

describe('ya dentro', () => {
  it('el menu sale de los permisos, no de una lista fija', () => {
    conEstado('listo', ACCESO_DUENA);
    for (const m of ['Inicio', 'Agenda', 'Clientes', 'Caja', 'Gastos', 'Reportes']) {
      expect(screen.getAllByText(m).length, m).toBeGreaterThan(0);
    }
  });

  it('la recepcionista ve Caja —ahi cobra— pero NO Gastos ni Reportes', () => {
    conEstado('listo', {
      ...ACCESO_DUENA,
      nombre: 'Recepción',
      rol: 'recepcion',
      rolEtiqueta: 'Recepción',
      esDueno: false,
      permisos: { gestionarClientes: true, gestionarAgenda: true, cobrar: true },
    });
    expect(screen.getAllByText('Agenda').length).toBeGreaterThan(0);
    /*
     * Caja SI le aparece, y es lo correcto desde que se unio con Ventas: cobrar
     * vive adentro. Lo que no ve son las pestañas del cajon y del corte —eso lo
     * vigila mostrador.test.tsx— ni los modulos de dinero que no le tocan.
     */
    expect(screen.getAllByText('Caja').length).toBeGreaterThan(0);
    expect(screen.queryByText('Gastos')).toBeNull();
    expect(screen.queryByText('Reportes')).toBeNull();
  });

  it('un grupo que se queda sin modulos DESAPARECE', () => {
    // Dejarlo vacio es peor que no tenerlo: la persona lo abre esperando algo
    // y no sabe si le falta un permiso o si el sistema se rompio.
    conEstado('listo', { ...ACCESO_DUENA, esDueno: false, permisos: {} });
    expect(screen.queryByText('Dinero')).toBeNull();
  });

  it('el nombre y el rol salen de la sesion, NO escritos a mano', () => {
    conEstado('listo', ACCESO_DUENA);
    expect(screen.getAllByText('Dueña del Centro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dueña').length).toBeGreaterThan(0);
    // El nombre de la captura de referencia no aparece por ningun lado.
    expect(screen.queryByText('María López')).toBeNull();
  });

  it('el nombre del centro se ve', () => {
    conEstado('listo', ACCESO_DUENA);
    expect(screen.getAllByText('Centro Holístico').length).toBeGreaterThan(0);
  });

  it('los modulos que no llegan lo DICEN, no inventan datos', async () => {
    /**
     * Se abre desde el menu uno de los que todavia no llegan —Mensajes— y
     * tiene que decir la verdad en vez de enseñar una tabla de mentiras.
     *
     * ANTES ERA REPORTES, despues MENSAJES, y cada vez que uno se construye hay
     * que mover esta prueba al siguiente. Vale la pena dejarlo escrito: vigila
     * el modulo PENDIENTE, no uno en concreto, asi que cuando el ultimo se
     * construya se borra — no se busca otro con que rellenarla.
     */
    const { container } = conEstado('listo', ACCESO_DUENA);
    await userEvent.click(screen.getByRole('button', { name: 'Recordatorios' }));
    expect(screen.getByText(/vacía a propósito/i)).toBeDefined();
    expect(container.textContent).not.toContain('$4,850');
  });

  it('Inicio arranca en ceros, sin una sola cifra del diseño', () => {
    // La captura de referencia trae "$4,850", "6 citas" y "28 sesiones". Ni
    // una de esas cifras puede aparecer en un centro recien creado.
    const { container } = conEstado('listo', ACCESO_DUENA);
    for (const delDiseño of ['$4,850', '28 sesiones', '23 unidades']) {
      expect(container.textContent).not.toContain(delDiseño);
    }
  });

  it('se puede salir desde el menu de la cuenta', async () => {
    // Se mudo de la barra superior a la ficha de la persona, abajo en la barra
    // lateral: es donde el diseño la pone y donde la gente la busca.
    conEstado('listo', ACCESO_DUENA);
    await userEvent.click(screen.getByRole('button', { name: /Dueña/ }));
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeDefined();
  });
});

describe('cuando la conexion no responde', () => {
  it('a los ocho segundos DEJA de fingir que carga', async () => {
    /**
     * El caso que la origino: la primera consulta no respondia, el portero se
     * quedaba en "cargando" para siempre, y lo unico que se veia era la
     * silueta. Desde afuera parecia que el sistema no arrancaba, y el error
     * vivia solo en la consola del navegador — que nadie abre.
     */
    vi.resetModules();
    vi.doMock('../../src/identidad/sesion.js', () => ({
      ProveedorDeSesion: ({ children }: { children: React.ReactNode }) => children,
      useSesion: () => ({ ...sesionFalsa.valor, estado: 'cargando', fallo: 'Invalid API key' }),
      useTardaDemasiado: () => true,
    }));
    const { Aplicacion: Otra } = await import('../../src/aplicacion.js');
    render(<Otra />);
    expect(screen.getByText('No pudimos conectar')).toBeDefined();
    // Y dice QUE fallo, con las palabras del servidor.
    expect(screen.getByText('Invalid API key')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDefined();
    vi.doUnmock('../../src/identidad/sesion.js');
  });
});
