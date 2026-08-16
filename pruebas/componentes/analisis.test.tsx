/**
 * @vitest-environment happy-dom
 *
 * LA PANTALLA DE REPORTES ENTERA.
 *
 * Lo que se vigila aqui no se ve en ninguna pieza por separado:
 *
 *   · Que el periodo sea UNO SOLO para toda la pantalla. Es la mitad del
 *     modulo: con dos periodos vivos, dos numeros de la misma pantalla se
 *     contradicen sin fallar y sin avisar.
 *   · Que cambiar un FILTRO vuelva a preguntar. Con la llave de cache mal
 *     hecha, cambiar un filtro devolveria el reporte anterior — los mismos
 *     numeros con otro filtro puesto, que es el fallo mas caro posible aqui
 *     porque se ve exactamente igual que la verdad.
 *   · Que abrir un guardado reponga la pregunta ENTERA, no solo el periodo.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fecha } from '@neron/base/utils';

const sesion = vi.hoisted(() => ({
  valor: {
    estado: 'listo',
    acceso: {
      negocioId: 't_centro', usuarioId: 'u1', correo: 'a@b.mx', nombre: 'Dueña',
      rol: 'dueno', rolEtiqueta: 'Dueña', esDueno: true, modulos: [],
      permisos: { verFinanzas: true } as Record<string, boolean>,
    },
    llave: 'k', cerrarSesion: async () => {}, refrescar: async () => {},
  },
}));

const datos = vi.hoisted(() => ({
  /** Cada llamada al servidor, para poder mirar CON QUE se pregunto. */
  pedidos: [] as Array<{ desde: string; hasta: string; filtros: unknown }>,
  guardados: [] as unknown[],
  guardadosNuevos: [] as unknown[],
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
      ruta: { modulo: 'reportes', parametros: {} },
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
vi.mock('../../src/datos/reportes.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/reportes.js')>(
    '../../src/datos/reportes.js',
  );
  return {
    ...real,
    traerReporte: vi.fn(async (_n: string, desde: string, hasta: string, filtros: unknown) => {
      datos.pedidos.push({ desde, hasta, filtros });
      return real.ordenarReporte({});
    }),
    traerReportesGuardados: vi.fn(async () => datos.guardados),
    guardarReporte: vi.fn(async (...args: unknown[]) => { datos.guardadosNuevos.push(args); }),
    borrarReporte: vi.fn(async () => undefined),
  };
});

const { olvidarTodo } = await import('../../src/datos/consulta.js');
const { Analisis } = await import('../../src/reportes/analisis.js');

afterEach(() => { cleanup(); olvidarTodo(); });
beforeEach(() => {
  datos.pedidos = [];
  datos.guardados = [];
  datos.guardadosNuevos = [];
  navegacion.ir = vi.fn();
});

const ultimo = () => datos.pedidos[datos.pedidos.length - 1];

describe('el periodo manda sobre toda la pantalla', () => {
  it('arranca en "Este mes" y pregunta una sola vez', async () => {
    render(<Analisis />);
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Este mes' }).getAttribute('aria-pressed'))
      .toBe('true');
    // UNA llamada para toda la pantalla, no una por pestaña.
    expect(datos.pedidos).toHaveLength(1);
  });

  it('cambiar de periodo vuelve a preguntar con las fechas nuevas', async () => {
    render(<Analisis />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));
    const antes = ultimo();

    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(1));

    // "Hoy" es un solo dia: las dos fechas coinciden y son distintas de las del mes.
    expect(ultimo()?.desde).toBe(ultimo()?.hasta);
    expect(ultimo()?.desde).not.toBe(antes?.desde);
  });

  it('cambiar de pestaña NO vuelve a preguntar: las ocho salen de la misma respuesta', async () => {
    // Es lo que garantiza que no se contradigan. Si aqui apareciera una llamada
    // nueva, es que alguien partio el reporte en consultas por pestaña.
    render(<Analisis />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));
    await userEvent.click(screen.getByRole('tab', { name: 'Gastos' }));
    await waitFor(() => expect(screen.getByText('Gastos del período')).toBeTruthy());
    expect(datos.pedidos).toHaveLength(1);
  });
});

describe('los filtros', () => {
  it('cambiar uno vuelve a preguntar: la cache no devuelve el anterior', async () => {
    render(<Analisis />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    await userEvent.selectOptions(screen.getByLabelText('Forma de pago'), 'efectivo');

    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(1));
    expect(ultimo()?.filtros).toMatchObject({ metodo: 'efectivo' });
  });

  it('con un filtro puesto aparece cómo quitarlo', async () => {
    render(<Analisis />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    expect(screen.queryByRole('button', { name: 'Quitar los filtros' })).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Qué se vendió'), 'servicio');
    expect(screen.getByRole('button', { name: 'Quitar los filtros' })).toBeTruthy();
  });
});

describe('los reportes guardados', () => {
  it('abrir uno repone el periodo, la pestaña Y los filtros', async () => {
    /**
     * Reponer solo el periodo dejaria las cifras del mes correcto con los
     * filtros de lo que se estaba viendo antes: un reporte que no es ni el
     * guardado ni el de la pantalla, y que no se ve raro.
     */
    datos.guardados = [{
      id: 'r1', nombre: 'Cobros en efectivo', tipo: 'ventas',
      desde: '01/07/2026' as Fecha, hasta: '31/07/2026' as Fecha,
      filtros: { tipo: '', metodo: 'efectivo', vendedorId: '' },
      creadoEn: '2026-08-01T10:00:00Z', creadoPor: 'Quien administra',
    }];

    render(<Analisis />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));
    await waitFor(() => expect(screen.getAllByText('Cobros en efectivo').length).toBeGreaterThan(0));

    await userEvent.click(screen.getAllByText('Cobros en efectivo')[0]!);

    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(1));
    expect(ultimo()?.desde).toBe('01/07/2026');
    expect(ultimo()?.hasta).toBe('31/07/2026');
    expect(ultimo()?.filtros).toMatchObject({ metodo: 'efectivo' });
    expect(screen.getByRole('tab', { name: 'Ventas' }).getAttribute('aria-selected')).toBe('true');
  });

  it('guardar manda la pestaña y el periodo que se está viendo', async () => {
    render(<Analisis />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));

    await userEvent.click(screen.getByRole('tab', { name: 'Clientes' }));
    await userEvent.click(screen.getByRole('button', { name: /Guardar reporte actual/ }));
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Clientes de agosto');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(datos.guardadosNuevos).toHaveLength(1));
    const [negocio, nombre, tipo] = datos.guardadosNuevos[0] as unknown[];
    expect(negocio).toBe('t_centro');
    expect(nombre).toBe('Clientes de agosto');
    expect(tipo).toBe('clientes');
  });
});

describe('los permisos', () => {
  it('sin verFinanzas no se ofrece guardar', async () => {
    // La regla de fila de `reporte_guardado` lo exige igual. Esconder el boton
    // es cortesia; la regla es la seguridad.
    sesion.valor = {
      ...sesion.valor,
      acceso: { ...sesion.valor.acceso, permisos: {} },
    };
    render(<Analisis />);
    await waitFor(() => expect(datos.pedidos).toHaveLength(1));
    expect(screen.queryByRole('button', { name: /Guardar reporte actual/ })).toBeNull();

    sesion.valor = {
      ...sesion.valor,
      acceso: { ...sesion.valor.acceso, permisos: { verFinanzas: true } },
    };
  });
});
