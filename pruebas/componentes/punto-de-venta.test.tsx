/**
 * @vitest-environment happy-dom
 *
 * EL MODULO VENTAS COMPLETO: cobrar, no cobrar dos veces, y no perder la
 * captura cuando el servidor dice que no.
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
      permisos: { cobrar: true, gestionarClientes: true, verFinanzas: true } as Record<
        string,
        boolean
      >,
    },
    llave: 'k', cerrarSesion: async () => {}, refrescar: async () => {},
  },
}));

const datos = vi.hoisted(() => ({
  catalogo: [] as unknown[],
  ventas: { total: 0, filas: [] as unknown[] },
  resumen: null as unknown,
  cotizaciones: [] as unknown[],
  ficha: null as unknown,
  /** Cada llamada a `registrar_venta`, con su llave de idempotencia. */
  cobros: [] as { llave: string; renglones: number; pagos: unknown[] }[],
  /** Lo que va a contestar el proximo cobro: `null` cobra bien. */
  falla: null as string | null,
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
      ruta: { modulo: 'ventas', parametros: {} },
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
    traerProfesionales: vi.fn(async () => [
      { id: 'm1', nombre: 'Quien cobra', rol: 'dueno', usuarioId: 'u1' },
      { id: 'm2', nombre: 'Otra persona', rol: 'admin', usuarioId: 'u2' },
    ]),
  };
});
vi.mock('../../src/datos/clientes.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/clientes.js')>(
    '../../src/datos/clientes.js',
  );
  return {
    ...real,
    traerClientes: vi.fn(async () => ({ total: 0, filas: [] })),
    traerExpediente: vi.fn(async () => null),
    crearCliente: vi.fn(async () => ({ id: 'c9', nombre: 'Nuevo' })),
    buscarPosibleDuplicado: vi.fn(async () => null),
  };
});
vi.mock('../../src/datos/ventas.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/ventas.js')>(
    '../../src/datos/ventas.js',
  );
  return {
    ...real,
    traerCatalogoVendible: vi.fn(async () => datos.catalogo),
    traerVentas: vi.fn(async () => datos.ventas),
    traerResumenDeVentas: vi.fn(async () => real.ordenarResumenDeVentas(datos.resumen)),
    traerCotizaciones: vi.fn(async () => datos.cotizaciones),
    traerFichaDeVenta: vi.fn(async () => datos.ficha),
    traerItemsDeCotizacion: vi.fn(async () => []),
    registrarVenta: vi.fn(async (_n: string, v: { llave: string; renglones: unknown[]; pagos: unknown[] }) => {
      datos.cobros.push({ llave: v.llave, renglones: v.renglones.length, pagos: v.pagos });
      if (datos.falla) throw new Error(datos.falla);
      return 'v-nueva';
    }),
    cancelarVenta: vi.fn(async () => undefined),
    guardarCotizacion: vi.fn(async () => undefined),
    marcarCotizacion: vi.fn(async () => undefined),
    marcarCotizacionConvertida: vi.fn(async () => undefined),
  };
});

const { olvidarTodo } = await import('../../src/datos/consulta.js');
const { PuntoDeVenta, PESTANAS, agregarAlCarrito, comoRenglon, diasAntes } = await import(
  '../../src/ventas/punto-de-venta.js'
);
type ConceptoVendible = import('../../src/datos/ventas.js').ConceptoVendible;

const CONCEPTO: ConceptoVendible = {
  tipo: 'producto', id: 'p1', nombre: 'Concepto Uno', detalle: null,
  precioCentavos: 100000, disponible: 3, codigo: 'SKU1',
};

beforeEach(() => {
  olvidarTodo();
  datos.catalogo = [];
  datos.ventas = { total: 0, filas: [] };
  datos.resumen = null;
  datos.cotizaciones = [];
  datos.ficha = null;
  datos.cobros = [];
  datos.falla = null;
  sesion.valor.acceso.permisos = { cobrar: true, gestionarClientes: true, verFinanzas: true };
});
afterEach(cleanup);

/** Busca un concepto y lo mete al carrito. */
async function meterAlCarrito(nombre = 'Concepto Uno'): Promise<void> {
  datos.catalogo = [CONCEPTO];
  await userEvent.type(screen.getByLabelText(/buscar servicio, producto o curso/i), 'con');
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(nombre) }));
}

describe('las pestañas', () => {
  it('son las cuatro del diseño, en su orden', () => {
    expect(PESTANAS.map((p) => p.etiqueta)).toEqual([
      'Nueva venta', 'Ventas del día', 'Historial de ventas', 'Cotizaciones',
    ]);
  });
});

describe('meter cosas al carrito', () => {
  it('lo mismo dos veces SUBE la cantidad en vez de repetir el renglon', () => {
    // Dos renglones del mismo producto se leen como un error de captura.
    const una = agregarAlCarrito([], CONCEPTO);
    const dos = agregarAlCarrito(una, CONCEPTO);
    expect(dos).toHaveLength(1);
    expect(dos[0]?.cantidad).toBe(2);
  });

  it('NO se pasa del stock aunque se aprente muchas veces', () => {
    let carrito = agregarAlCarrito([], CONCEPTO);
    for (let i = 0; i < 10; i += 1) carrito = agregarAlCarrito(carrito, CONCEPTO);
    expect(carrito[0]?.cantidad).toBe(3);
  });

  it('un servicio sin limite si sube', () => {
    let carrito = agregarAlCarrito([], { ...CONCEPTO, tipo: 'servicio', disponible: null });
    carrito = agregarAlCarrito(carrito, { ...CONCEPTO, tipo: 'servicio', disponible: null });
    expect(carrito[0]?.cantidad).toBe(2);
  });

  it('un concepto entra con cantidad uno y sin descuento', () => {
    expect(comoRenglon(CONCEPTO)).toMatchObject({ cantidad: 1, descuentoCentavos: 0 });
  });
});

describe('restar dias sin que la fecha se mueva', () => {
  it('cruza el cambio de mes y de año', () => {
    expect(diasAntes('05/01/2026', 10)).toBe('26/12/2025');
    expect(diasAntes('01/03/2026', 1)).toBe('28/02/2026');
  });
});

describe('la pantalla vacia', () => {
  it('arranca en Nueva venta, con el resumen del dia en cero', async () => {
    render(<PuntoDeVenta />);
    expect(screen.getByRole('heading', { name: 'Ventas' })).toBeTruthy();
    expect(await screen.findByText('No hay ventas registradas hoy.')).toBeTruthy();
  });

  it('el vendedor arranca en QUIEN ESTA COBRANDO', async () => {
    render(<PuntoDeVenta />);
    await waitFor(() => {
      expect((screen.getByLabelText(/vendedor de la venta/i) as HTMLSelectElement).value)
        .toBe('m1');
    });
  });
});

describe('cobrar', () => {
  it('manda los renglones y los pagos en UNA sola llamada', async () => {
    render(<PuntoDeVenta />);
    await meterAlCarrito();
    await userEvent.click(screen.getAllByRole('button', { name: /^Efectivo$/ })[0]!);
    await userEvent.click(screen.getByRole('button', { name: /finalizar venta/i }));

    await waitFor(() => expect(datos.cobros).toHaveLength(1));
    expect(datos.cobros[0]?.renglones).toBe(1);
    expect(datos.cobros[0]?.pagos).toEqual([{ metodo: 'efectivo', montoCentavos: 100000 }]);
  });

  it('EL DOBLE CLIC MANDA LA MISMA LLAVE, que es lo que impide la venta doble', async () => {
    // El boton deshabilitado ayuda, pero no es la defensa: una red lenta
    // reintenta sola y la pestaña de al lado no sabe de este boton.
    render(<PuntoDeVenta />);
    await meterAlCarrito();
    await userEvent.click(screen.getAllByRole('button', { name: /^Efectivo$/ })[0]!);

    const boton = screen.getByRole('button', { name: /finalizar venta/i });
    datos.falla = 'red caida';
    await userEvent.click(boton);
    await waitFor(() => expect(datos.cobros).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: /finalizar venta/i }));
    await waitFor(() => expect(datos.cobros).toHaveLength(2));

    expect(datos.cobros[0]?.llave).toBe(datos.cobros[1]?.llave);
  });

  it('SI FALLA, el carrito NO se vacia y el mensaje exacto queda en pantalla', async () => {
    render(<PuntoDeVenta />);
    await meterAlCarrito();
    await userEvent.click(screen.getAllByRole('button', { name: /^Efectivo$/ })[0]!);
    datos.falla = 'Solo quedan 3 de Concepto Uno: no se pueden sacar 5.';
    await userEvent.click(screen.getByRole('button', { name: /finalizar venta/i }));

    expect(await screen.findByText(/Solo quedan 3 de Concepto Uno/)).toBeTruthy();
    // El renglon sigue puesto: no hay que volver a capturar nada.
    expect(screen.getByLabelText(/agregar uno de Concepto Uno/i)).toBeTruthy();
  });

  it('cuando SI cobra, avisa que quedo y vacia el carrito', async () => {
    render(<PuntoDeVenta />);
    await meterAlCarrito();
    await userEvent.click(screen.getAllByRole('button', { name: /^Efectivo$/ })[0]!);
    await userEvent.click(screen.getByRole('button', { name: /finalizar venta/i }));

    expect(await screen.findByText(/venta registrada/i)).toBeTruthy();
    expect(screen.queryByLabelText(/agregar uno de Concepto Uno/i)).toBeNull();
  });

  it('la venta SIGUIENTE lleva una llave distinta, o el servidor devolveria la anterior', async () => {
    render(<PuntoDeVenta />);
    await meterAlCarrito();
    await userEvent.click(screen.getAllByRole('button', { name: /^Efectivo$/ })[0]!);
    await userEvent.click(screen.getByRole('button', { name: /finalizar venta/i }));
    await waitFor(() => expect(datos.cobros).toHaveLength(1));

    await screen.findByText(/venta registrada/i);
    await meterAlCarrito();
    await userEvent.click(screen.getAllByRole('button', { name: /^Efectivo$/ })[0]!);
    await userEvent.click(screen.getByRole('button', { name: /finalizar venta/i }));
    await waitFor(() => expect(datos.cobros).toHaveLength(2));

    expect(datos.cobros[0]?.llave).not.toBe(datos.cobros[1]?.llave);
  });
});

describe('el pago mixto', () => {
  it('sale con DOS renglones, no con un metodo "mixto"', async () => {
    render(<PuntoDeVenta />);
    await meterAlCarrito();
    /*
     * "getByRole" y no "getAllByRole()[1]": ahora hay UN solo boton "Mixto" en
     * toda la pantalla. Habia dos —una tarjeta de "metodo de pago rapido" con
     * los mismos cuatro botones que el panel de cobro, llamando a la misma
     * funcion— y se quito: dos juegos identicos del mismo control confunden a
     * quien cobra. Si alguien lo vuelve a duplicar, esta linea revienta.
     */
    await userEvent.click(screen.getByRole('button', { name: /^Mixto$/ }));
    const reparto = screen.getByLabelText(/agregar forma de pago/i);
    await userEvent.click(
      (await screen.findAllByRole('button', { name: /^Tarjeta$/ })).find((b) =>
        reparto.contains(b),
      )!,
    );

    const montos = screen.getAllByLabelText(/monto en/i) as HTMLInputElement[];
    expect(montos).toHaveLength(2);
    await userEvent.type(montos[0]!, '400');
    await userEvent.type(montos[1]!, '600');
    await userEvent.click(screen.getByRole('button', { name: /finalizar venta/i }));

    await waitFor(() => expect(datos.cobros).toHaveLength(1));
    expect(datos.cobros[0]?.pagos).toEqual([
      { metodo: 'efectivo', montoCentavos: 40000 },
      { metodo: 'tarjeta', montoCentavos: 60000 },
    ]);
  });
});

describe('los permisos', () => {
  it('sin verFinanzas no se aplican descuentos, y se dice por que', async () => {
    sesion.valor.acceso.permisos = { cobrar: true };
    sesion.valor.acceso.esDueno = false;
    render(<PuntoDeVenta />);
    expect(screen.getByText(/tu rol no aplica descuentos/i)).toBeTruthy();
    sesion.valor.acceso.esDueno = true;
  });

  it('sin permiso de cobrar se puede mirar, y se dice que finalizar no es de este rol', () => {
    sesion.valor.acceso.permisos = { verFinanzas: true };
    render(<PuntoDeVenta />);
    expect(screen.getByText(/tu rol no cobra/i)).toBeTruthy();
  });
});

describe('las cotizaciones', () => {
  it('la pestaña vacia explica que una cotizacion NO mueve nada', async () => {
    render(<PuntoDeVenta />);
    await userEvent.click(screen.getByRole('tab', { name: 'Cotizaciones' }));
    expect(await screen.findByText(/no mueve inventario ni caja/i)).toBeTruthy();
  });
});

describe('el historial', () => {
  it('la pestaña del dia y la del historial usan la misma tabla', async () => {
    render(<PuntoDeVenta />);
    await userEvent.click(screen.getByRole('tab', { name: 'Ventas del día' }));
    expect(await screen.findByText('No hay ventas registradas hoy.')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Historial de ventas' }));
    expect(await screen.findByText('Todavía no hay ventas.')).toBeTruthy();
  });
});
