/**
 * @vitest-environment happy-dom
 *
 * LA PANTALLA DE MENSAJES ENTERA.
 *
 * Lo que se prueba aquí no se ve en ninguna pieza por separado: que el módulo
 * arranque VACÍO de verdad —sin una sola conversación, etiqueta ni estadística
 * inventada—, que cambiar de bandeja vuelva a preguntar, que abrir un hilo lo
 * marque leído, y que responder refresque los contadores.
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
        gestionarMensajes: true, gestionarClientes: true, verFinanzas: true,
      } as Record<string, boolean>,
    },
    llave: 'k', cerrarSesion: async () => {}, refrescar: async () => {},
  },
}));

const datos = vi.hoisted(() => ({
  pagina: {
    total: 0,
    cuentas: { todas: 0, noLeidas: 0, pendientes: 0, archivadas: 0 },
    filas: [] as unknown[],
  },
  resumen: null as unknown,
  hilo: [] as unknown[],
  /** Con qué bandeja se pidió cada vez, para poder mirar los filtros. */
  pedidos: [] as { bandeja: string; busqueda: string }[],
  acciones: [] as { id: string; que: string }[],
  guardados: [] as { conversacion: string; cuerpo: string }[],
}));

const navegacion = vi.hoisted(() => ({ ir: vi.fn() }));

vi.mock('../../src/identidad/sesion.js', () => ({ useSesion: () => sesion.valor }));
vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true, supabase: () => ({}), clienteParaLaBase: () => ({}),
}));
vi.mock('@neron/base/marco', async () => {
  const real = await vi.importActual<typeof import('@neron/base/marco')>('@neron/base/marco');
  return {
    ...real,
    useNavegacion: () => ({
      ruta: { modulo: 'mensajes', parametros: {} },
      ir: navegacion.ir, filtrar: () => {}, atras: () => {},
    }),
  };
});
vi.mock('../../src/datos/citas.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/citas.js')>(
    '../../src/datos/citas.js',
  );
  return { ...real, traerProfesionales: vi.fn(async () => []) };
});
vi.mock('../../src/datos/categorias.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/categorias.js')>(
    '../../src/datos/categorias.js',
  );
  return { ...real, traerCategorias: vi.fn(async () => []) };
});
vi.mock('../../src/datos/clientes.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/clientes.js')>(
    '../../src/datos/clientes.js',
  );
  return {
    ...real,
    traerClientes: vi.fn(async () => ({ total: 0, filas: [] })),
    traerExpediente: vi.fn(async () => null),
    crearCliente: vi.fn(async () => ({ id: 'cl9', nombre: 'Nuevo' })),
    buscarPosibleDuplicado: vi.fn(async () => null),
  };
});
vi.mock('../../src/datos/mensajes.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/mensajes.js')>(
    '../../src/datos/mensajes.js',
  );
  return {
    ...real,
    traerConversaciones: vi.fn(async (_n: string, bandeja: string, busqueda: string) => {
      datos.pedidos.push({ bandeja, busqueda });
      return real.ordenarPaginaDeConversaciones(datos.pagina);
    }),
    traerResumenDeMensajes: vi.fn(async () => real.ordenarResumen(datos.resumen)),
    traerHilo: vi.fn(async () => datos.hilo.map(real.ordenarMensaje)),
    traerPlantillas: vi.fn(async () => []),
    traerCanales: vi.fn(async () => []),
    traerAutomatizaciones: vi.fn(async () => []),
    marcarConversacion: vi.fn(async (id: string, que: string) => {
      datos.acciones.push({ id, que });
    }),
    guardarMensaje: vi.fn(async (_n: string, conversacion: string, _d: string, cuerpo: string) => {
      datos.guardados.push({ conversacion, cuerpo });
      return 'm-nuevo';
    }),
  };
});

const { olvidarTodo } = await import('../../src/datos/consulta.js');
const { Bandeja } = await import('../../src/mensajes/bandeja.js');

afterEach(() => { cleanup(); olvidarTodo(); });
beforeEach(() => {
  datos.pagina = {
    total: 0, cuentas: { todas: 0, noLeidas: 0, pendientes: 0, archivadas: 0 }, filas: [],
  };
  datos.resumen = null;
  datos.hilo = [];
  datos.pedidos = [];
  datos.acciones = [];
  datos.guardados = [];
  navegacion.ir = vi.fn();
});

const HILO = {
  id: 'c1', contacto: '646 000 0000', clienteId: 'cl1', cliente: 'Quien viene',
  estado: 'abierta', sinLeer: 2, pendiente: true, ultimoEn: '2026-08-16T10:00:00Z',
  ultimo: { cuerpo: '¿Cuánto cuesta?', direccion: 'entrante', estado: 'entregado', creadoEn: '2026-08-16T10:00:00Z' },
  etiquetas: [],
};

describe('un centro sin una sola conversación', () => {
  it('se ve vacío DE VERDAD: ni un hilo, ni una cifra inventada', async () => {
    /**
     * ES LA PRUEBA QUE MAS IMPORTA DE ESTE MODULO. La referencia visual venía
     * llena de conversaciones, clientes y estadísticas; ni una sola puede
     * aparecer aquí. Un módulo que se rellena solo contamina la confianza en
     * todos los números que sí son reales.
     */
    render(<Bandeja />);
    expect(await screen.findByText(/No hay conversaciones/)).toBeTruthy();
    expect(screen.getByText(/Cuando tus clientes te escriban/)).toBeTruthy();
    expect(screen.getByText('Escoge una conversación')).toBeTruthy();
    expect(screen.getByText(/No hay canales conectados/)).toBeTruthy();

    const texto = document.body.textContent ?? '';
    // Ni un nombre ni una cifra de la referencia visual.
    for (const delDiseño of ['Ana López', 'Juan Pérez', '142', '156', '93%', '18.5%']) {
      expect(texto, `se coló "${delDiseño}" del diseño`).not.toContain(delDiseño);
    }
    expect(texto).not.toContain('NaN');
    expect(texto).not.toContain('undefined');
  });

  it('sin etiquetas del centro no se inventan cinco', async () => {
    render(<Bandeja />);
    await screen.findByText(/No hay conversaciones/);
    const filtro = screen.getByLabelText('Filtrar por etiqueta') as HTMLSelectElement;
    expect([...filtro.options]).toHaveLength(1);
  });
});

describe('las bandejas', () => {
  it('cambiar de pestaña vuelve a preguntar al servidor', async () => {
    // Filtrar sobre lo que ya se bajó diría que una conversación no existe
    // porque estaba en la página tres.
    render(<Bandeja />);
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('tab', { name: /Archivadas/ }));
    await waitFor(() =>
      expect(datos.pedidos[datos.pedidos.length - 1]?.bandeja).toBe('archivadas'));
  });

  it('el buscador manda el texto al servidor', async () => {
    render(<Bandeja />);
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
    await userEvent.type(screen.getByLabelText('Buscar conversación'), 'ana');
    await waitFor(
      () => expect(datos.pedidos[datos.pedidos.length - 1]?.busqueda).toBe('ana'),
      { timeout: 2000 },
    );
  });
});

describe('abrir una conversación', () => {
  it('la marca leída sola: es lo que hace cualquier bandeja', async () => {
    datos.pagina = {
      total: 1, cuentas: { todas: 1, noLeidas: 1, pendientes: 1, archivadas: 0 }, filas: [HILO],
    };
    render(<Bandeja />);
    await userEvent.click(await screen.findByText('Quien viene'));
    await waitFor(() =>
      expect(datos.acciones).toContainEqual({ id: 'c1', que: 'leida' }));
  });

  it('el nombre lleva a SU expediente, no a una ficha de Mensajes', async () => {
    // Lo que hace falta saber de alguien ya vive completo en Clientes.
    datos.pagina = {
      total: 1, cuentas: { todas: 1, noLeidas: 0, pendientes: 0, archivadas: 0 },
      filas: [{ ...HILO, sinLeer: 0 }],
    };
    render(<Bandeja />);
    await userEvent.click(await screen.findByText('Quien viene'));
    const enElHilo = await screen.findAllByRole('button', { name: 'Quien viene' });
    await userEvent.click(enElHilo[enElHilo.length - 1]!);
    expect(navegacion.ir).toHaveBeenCalledWith('clientes', { intencion: 'clientes:abrir:cl1' });
  });
});

describe('responder', () => {
  it('guarda el mensaje contra esa conversación', async () => {
    datos.pagina = {
      total: 1, cuentas: { todas: 1, noLeidas: 0, pendientes: 1, archivadas: 0 },
      filas: [{ ...HILO, sinLeer: 0 }],
    };
    render(<Bandeja />);
    await userEvent.click(await screen.findByText('Quien viene'));
    await userEvent.type(screen.getByLabelText('Escribe un mensaje'), 'Son $850');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() =>
      expect(datos.guardados).toContainEqual({ conversacion: 'c1', cuerpo: 'Son $850' }));
  });
});

describe('los permisos', () => {
  it('sin gestionarMensajes no se ofrece escribir', async () => {
    // La regla de fila de la base tampoco le entrega nada; esconder el botón es
    // cortesía.
    sesion.valor = {
      ...sesion.valor,
      acceso: { ...sesion.valor.acceso, permisos: { gestionarClientes: true } },
    };
    render(<Bandeja />);
    await screen.findByText(/No hay conversaciones/);

    /*
     * Se mira el ENCABEZADO, que es donde vive el boton principal. Los atajos
     * del costado siguen ahi a proposito: quien llega a esta pantalla ya tiene
     * la capacidad —el modulo entero la exige en el registro— asi que este caso
     * es defensa en profundidad, no el camino normal. Lo que no puede pasar es
     * que el boton grande invite a escribir a quien la base va a rechazar.
     */
    const cabecera = document.querySelector('.pz-encabezado__acciones');
    expect(cabecera?.textContent).not.toContain('Nuevo mensaje');
    expect(cabecera?.textContent).toContain('Plantillas');

    sesion.valor = {
      ...sesion.valor,
      acceso: {
        ...sesion.valor.acceso,
        permisos: { gestionarMensajes: true, gestionarClientes: true, verFinanzas: true },
      },
    };
  });
});
