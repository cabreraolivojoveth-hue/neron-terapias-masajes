/**
 * @vitest-environment happy-dom
 *
 * EL MODULO CAJA COMPLETO: abrir, mover, cortar y cerrar.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sesion = vi.hoisted(() => ({
  valor: {
    estado: 'listo',
    acceso: {
      negocioId: 't_centro', usuarioId: 'u1', correo: 'a@b.mx', nombre: 'Quien administra',
      rol: 'dueno', rolEtiqueta: 'Dueña', esDueno: true, modulos: [],
      permisos: { verFinanzas: true } as Record<string, boolean>,
    },
    llave: 'k', cerrarSesion: async () => {}, refrescar: async () => {},
  },
}));

const datos = vi.hoisted(() => ({
  caja: null as unknown,
  resumen: null as unknown,
  movimientos: { total: 0, filas: [] as unknown[] },
  historial: { total: 0, filas: [] as unknown[] },
  reporte: null as unknown,
  aperturas: [] as unknown[],
  cierres: [] as { sesion: string; contado: number }[],
  movidos: [] as unknown[],
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
      ruta: { modulo: 'caja', parametros: {} },
      ir: navegacion.ir, filtrar: () => {}, atras: () => {},
    }),
  };
});
vi.mock('../../src/datos/caja.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/caja.js')>(
    '../../src/datos/caja.js',
  );
  return {
    ...real,
    traerCajaAbierta: vi.fn(async () => real.ordenarCaja(datos.caja)),
    traerResumenDeCaja: vi.fn(async () => real.ordenarResumenDeCaja(datos.resumen)),
    traerMovimientos: vi.fn(async () => datos.movimientos as { total: number; filas: [] }),
    traerHistorialDeCajas: vi.fn(async () => datos.historial as { total: number; filas: [] }),
    traerReporteDeCaja: vi.fn(async () => real.ordenarReporteDeCaja(datos.reporte)),
    abrirCaja: vi.fn(async (_n: string, d: unknown) => { datos.aperturas.push(d); }),
    cerrarCaja: vi.fn(async (s: string, contado: number) => {
      datos.cierres.push({ sesion: s, contado });
    }),
    registrarMovimiento: vi.fn(async (_n: string, m: unknown) => { datos.movidos.push(m); }),
  };
});

const { olvidarTodo } = await import('../../src/datos/consulta.js');
const { Cajon, aCampo, deCampo, bajarArchivo } = await import('../../src/caja/cajon.js');

const CAJA = {
  id: 's1', nombre: 'Caja 1', estado: 'abierta', saldoInicialCentavos: 200000,
  abiertaEn: '2026-07-10T08:30:00Z', abiertaPor: 'Quien administra', observaciones: null,
  ingresosCentavos: 130000, egresosCentavos: 65000,
  efectivoEntroCentavos: 30000, efectivoSalioCentavos: 65000,
  efectivoEsperadoCentavos: 165000, movimientos: 4,
};

beforeEach(() => {
  olvidarTodo();
  datos.caja = null;
  datos.resumen = null;
  datos.movimientos = { total: 0, filas: [] };
  datos.historial = { total: 0, filas: [] };
  datos.reporte = null;
  datos.aperturas = [];
  datos.cierres = [];
  datos.movidos = [];
  navegacion.ir.mockClear();
  sesion.valor.acceso.permisos = { verFinanzas: true };
});
afterEach(cleanup);

describe('la fecha va y viene sin moverse un dia', () => {
  it('a lo que entiende un campo de fecha, y de vuelta', () => {
    expect(aCampo('10/07/2026')).toBe('2026-07-10');
    expect(deCampo('2026-07-10', '01/01/2020')).toBe('10/07/2026');
  });

  it('un valor vacio CONSERVA la que habia', () => {
    expect(deCampo('', '10/07/2026')).toBe('10/07/2026');
  });
});

describe('bajar el archivo', () => {
  it('sin soporte del navegador NO revienta: contesta que no se pudo', () => {
    // Reventar al exportar tumbaria la pantalla entera por un boton secundario.
    const antes = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { value: undefined, configurable: true });
    expect(bajarArchivo('x.csv', 'a,b')).toBe(false);
    if (antes) Object.defineProperty(URL, 'createObjectURL', antes);
  });
});

describe('sin caja abierta', () => {
  it('lo dice, y NO enseña cifras', async () => {
    render(<Cajon />);
    expect(await screen.findByText('Sin caja abierta')).toBeTruthy();
    expect(screen.queryByText('Efectivo en el cajón')).toBeNull();
  });

  it('el boton de abrir sale arriba y en el estado vacio', async () => {
    render(<Cajon />);
    await screen.findByText('Sin caja abierta');
    expect(screen.getAllByRole('button', { name: /abrir nueva caja/i })).toHaveLength(2);
  });

  it('abrir manda el saldo en CENTAVOS', async () => {
    render(<Cajon />);
    await screen.findByText('Sin caja abierta');
    await userEvent.click(screen.getAllByRole('button', { name: /abrir nueva caja/i })[0]!);
    await userEvent.type(screen.getByLabelText(/nombre de la caja/i), 'Mostrador');
    await userEvent.type(screen.getByLabelText(/saldo inicial/i), '2000');
    await userEvent.click(screen.getByRole('button', { name: /^abrir caja$/i }));

    await waitFor(() => expect(datos.aperturas).toHaveLength(1));
    expect(datos.aperturas[0]).toMatchObject({ nombre: 'Mostrador', saldoInicialCentavos: 200000 });
  });

  it('sin permiso de finanzas NO se ofrece abrir', async () => {
    sesion.valor.acceso.permisos = {};
    render(<Cajon />);
    await screen.findByText('Sin caja abierta');
    expect(screen.queryByRole('button', { name: /abrir nueva caja/i })).toBeNull();
  });
});

describe('con caja abierta', () => {
  beforeEach(() => {
    datos.caja = CAJA;
  });

  it('las cifras hablan de EFECTIVO, no de todo lo que entro', async () => {
    // 1300 entraron, pero solo 300 fueron en efectivo: en el cajon hay 1650.
    render(<Cajon />);
    await screen.findByRole('heading', { name: 'Resumen del turno' });
    expect(screen.getAllByText('Efectivo en el cajón').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,650\.00/).length).toBeGreaterThan(0);
  });

  it('ya no se ofrece abrir otra: solo hay una caja abierta a la vez', async () => {
    render(<Cajon />);
    await screen.findByRole('heading', { name: 'Resumen del turno' });
    expect(screen.queryByRole('button', { name: /abrir nueva caja/i })).toBeNull();
  });

  it('ENTRAR NO ABRE EL CORTE: primero se lee, despues se decide', async () => {
    /**
     * Antes, la pestaña "Corte de caja" montaba el dialogo del cierre sola —"es
     * lo unico que se hace ahi"—. Tocar una opcion del menu abria de golpe una
     * operacion, con su velo encima, antes de haber visto un solo numero: se
     * sentia como haber apretado algo por error, y para mirar cuanto habia en
     * el cajon habia que cerrar el dialogo primero.
     */
    render(<Cajon />);
    await screen.findByRole('heading', { name: 'Resumen del turno' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Y lo que hay que leer para cortar SI esta a la vista.
    expect(screen.getAllByText('Efectivo en el cajón').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /cerrar caja/i })).toBeTruthy();
  });

  it('un retiro viaja con su tipo y su metodo', async () => {
    render(<Cajon />);
    await screen.findByRole('heading', { name: 'Resumen del turno' });
    await userEvent.click(screen.getByRole('button', { name: /registrar retiro/i }));
    // El boton de la accion rapida y el de guardar se llaman igual: se busca
    // DENTRO del formulario, que es donde esta el que guarda.
    const formulario = within(screen.getByRole('dialog'));
    await userEvent.type(formulario.getByLabelText(/monto/i), '650');
    await userEvent.type(formulario.getByLabelText(/motivo/i), 'Pago de material');
    await userEvent.click(formulario.getByRole('button', { name: /^registrar retiro$/i }));

    await waitFor(() => expect(datos.movidos).toHaveLength(1));
    expect(datos.movidos[0]).toMatchObject({
      tipo: 'egreso', montoCentavos: 65000, metodo: 'efectivo', concepto: 'Pago de material',
    });
  });

  it('cerrar la caja manda lo CONTADO, no lo esperado', async () => {
    render(<Cajon />);
    await screen.findByRole('heading', { name: 'Resumen del turno' });
    await userEvent.click(screen.getByRole('button', { name: /cerrar caja/i }));
    await userEvent.click(screen.getByRole('button', { name: /contar el efectivo/i }));
    await userEvent.type(screen.getByLabelText(/efectivo contado/i), '1600');
    await userEvent.click(screen.getByRole('button', { name: /cerrar la caja/i }));

    await waitFor(() => expect(datos.cierres).toHaveLength(1));
    expect(datos.cierres[0]).toEqual({ sesion: 's1', contado: 160000 });
  });

  it('al cerrar avisa que el corte quedo en el historial', async () => {
    render(<Cajon />);
    await screen.findByRole('heading', { name: 'Resumen del turno' });
    await userEvent.click(screen.getByRole('button', { name: /cerrar caja/i }));
    await userEvent.click(screen.getByRole('button', { name: /contar el efectivo/i }));
    await userEvent.type(screen.getByLabelText(/efectivo contado/i), '1650');
    await userEvent.click(screen.getByRole('button', { name: /cerrar la caja/i }));
    expect(await screen.findByText(/el corte está en el historial/i)).toBeTruthy();
  });

  it('un movimiento de venta lleva a la pestaña del historial, sin salir del módulo', async () => {
    datos.movimientos = {
      total: 1,
      filas: [{
        id: 'm1', fecha: '2026-07-10', creadoEn: '2026-07-10T10:15:00Z',
        clase: 'venta', tipo: 'ingreso', concepto: 'Venta V-00001',
        metodo: 'efectivo', categoria: 'Servicios', montoCentavos: 115000,
        usuario: 'Quien cobro', notas: null, ventaId: 'v1', sesionId: 's1',
      }],
    };
    render(<Cajon />);
    await screen.findByRole('heading', { name: 'Resumen del turno' });
    await userEvent.click(await screen.findByLabelText(/ver la venta de Venta V-00001/i));
    /*
     * Se queda en "caja" —que ahora es el mostrador entero— y el recado sigue
     * siendo de "ventas" porque es el punto de venta quien lo lee. Antes esto
     * sacaba a la persona del modulo para ver su propia venta.
     */
    expect(navegacion.ir).toHaveBeenCalledWith('caja', { intencion: 'ventas:abrir:v1' });
  });

  it('sin permiso de finanzas se ve el resumen pero NO se mueve nada', async () => {
    sesion.valor.acceso.permisos = {};
    render(<Cajon />);
    await screen.findByRole('heading', { name: 'Resumen del turno' });
    expect(screen.queryByRole('button', { name: /registrar retiro/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /cerrar caja/i })).toBeNull();
  });
});

describe('el historial y los reportes', () => {
  it('el historial se abre desde arriba y desde las acciones', async () => {
    datos.caja = CAJA;
    render(<Cajon />);
    await screen.findByRole('heading', { name: 'Resumen del turno' });
    await userEvent.click(screen.getByRole('button', { name: /^historial de cajas$/i }));
    expect(await screen.findByText(/todavía no se ha cerrado ninguna caja/i)).toBeTruthy();
  });

  it('los reportes salen sin caja abierta: son de un periodo, no del turno', async () => {
    render(<Cajon />);
    await screen.findByText('Sin caja abierta');
    await userEvent.click(screen.getByRole('button', { name: /reportes de caja/i }));
    expect(await screen.findByText(/no hubo movimientos de caja en ese periodo/i)).toBeTruthy();
  });
});
