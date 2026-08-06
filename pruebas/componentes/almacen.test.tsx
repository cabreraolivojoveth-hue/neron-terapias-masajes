/**
 * @vitest-environment happy-dom
 *
 * EL MODULO PRODUCTOS COMPLETO.
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
      permisos: { gestionarInventario: true, verCostos: true } as Record<string, boolean>,
    },
    llave: 'k', cerrarSesion: async () => {}, refrescar: async () => {},
  },
}));

const datos = vi.hoisted(() => ({
  pagina: { total: 0, filas: [] as unknown[] },
  resumen: null as unknown,
  ficha: null as unknown,
  guardados: [] as unknown[],
  ajustes: [] as unknown[],
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
      ruta: { modulo: 'productos', parametros: {} },
      ir: navegacion.ir, filtrar: () => {}, atras: () => {},
    }),
  };
});
vi.mock('../../src/datos/categorias.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/categorias.js')>(
    '../../src/datos/categorias.js',
  );
  return { ...real, traerCategorias: vi.fn(async () => []) };
});
vi.mock('../../src/datos/productos.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/productos.js')>(
    '../../src/datos/productos.js',
  );
  return {
    ...real,
    traerProductosDelCentro: vi.fn(async (_n: string, f: { busqueda?: string }, pagina: number) => {
      datos.pedidos.push({ pagina, ...(f.busqueda ? { busqueda: f.busqueda } : {}) });
      return datos.pagina as { total: number; filas: [] };
    }),
    traerResumenDeProductos: vi.fn(async () => real.ordenarResumenDeProductos(datos.resumen)),
    traerProveedores: vi.fn(async () => []),
    traerFichaDeProducto: vi.fn(async () => datos.ficha),
    guardarProducto: vi.fn(async (_n: string, _id: string | null, d: unknown) => {
      datos.guardados.push(d);
    }),
    cambiarEstadoDeProducto: vi.fn(async () => undefined),
    ajustarInventario: vi.fn(async (_id: string, d: unknown) => { datos.ajustes.push(d); }),
    ligarProveedor: vi.fn(async () => undefined),
    desligarProveedor: vi.fn(async () => undefined),
    guardarProveedor: vi.fn(async () => undefined),
  };
});

const { olvidarTodo } = await import('../../src/datos/consulta.js');
const { Almacen, fichaAFormularioDeProducto } = await import('../../src/productos/almacen.js');
type FichaDeProducto = import('../../src/datos/productos.js').FichaDeProducto;

afterEach(() => { cleanup(); olvidarTodo(); });
beforeEach(() => {
  datos.pagina = { total: 0, filas: [] };
  datos.resumen = null;
  datos.ficha = null;
  datos.guardados = [];
  datos.ajustes = [];
  datos.pedidos = [];
  navegacion.ir = () => {};
});

const FILA = {
  id: 'p1', nombre: 'Producto Uno', sku: 'SKU1', codigoBarras: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  precioCentavos: 35000, costoCentavos: 18000,
  stockActual: 12, stockMinimo: 3, unidad: 'pieza',
  imagenUrl: null, ubicacion: null, inventario: 'disponible', activo: true,
};

const FICHA: FichaDeProducto = {
  id: 'p1', nombre: 'Producto Uno', descripcion: 'Texto', sku: 'SKU1', codigoBarras: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  precioCentavos: 35000, costoCentavos: 18000, puedeVerCostos: true,
  stockActual: 12, stockMinimo: 3, unidad: 'pieza', ubicacion: 'Estante',
  imagenUrl: null, notas: 'Algo interno', activo: true, inventario: 'disponible',
  valorCentavos: 216000, movimientos: [], ventas: [], proveedores: [],
};

describe('un centro recien creado, sin un solo producto', () => {
  it('se ve en ceros y sin inventar ni una fila', async () => {
    render(<Almacen />);
    expect(await screen.findByText('No hay productos registrados')).toBeTruthy();
    expect(screen.getByText('Sin productos registrados')).toBeTruthy();
    expect(screen.getByText('Mostrando 0 a 0 de 0 productos')).toBeTruthy();

    const t = document.body.textContent ?? '';
    for (const d of ['NaN', 'undefined', 'Infinity', 'Aceite Esencial', '128', '24,850']) {
      expect(t).not.toContain(d);
    }
  });
});

describe('la busqueda', () => {
  it('NO consulta en cada tecla', async () => {
    render(<Almacen />);
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(0));
    const antes = datos.pedidos.length;
    await userEvent.click(screen.getByRole('button', { name: /Filtrar/ }));
    await userEvent.type(screen.getByLabelText(/Buscar producto/), 'Aceite');
    await waitFor(() => expect(datos.pedidos.length).toBeGreaterThan(antes));
    expect(datos.pedidos.length - antes).toBeLessThan(3);
    expect(datos.pedidos.at(-1)?.busqueda).toBe('Aceite');
  });

  it('el campo NO pierde el foco al escribir', async () => {
    render(<Almacen />);
    await userEvent.click(screen.getByRole('button', { name: /Filtrar/ }));
    const campo = screen.getByLabelText(/Buscar producto/);
    await userEvent.type(campo, 'Aceite Esencial Natural de Lavanda');
    expect((campo as HTMLInputElement).value).toBe('Aceite Esencial Natural de Lavanda');
    expect(document.activeElement).toBe(campo);
  });
});

describe('dar de alta', () => {
  it('guarda con su stock inicial, que producirá un movimiento', async () => {
    render(<Almacen />);
    await screen.findByText('No hay productos registrados');
    await userEvent.click(screen.getAllByRole('button', { name: /Nuevo producto/ })[0]!);
    await userEvent.type(await screen.findByLabelText(/Nombre/), 'Producto Nuevo');
    await userEvent.clear(screen.getByLabelText(/Stock inicial/));
    await userEvent.type(screen.getByLabelText(/Stock inicial/), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(datos.guardados.length).toBe(1));
    expect(datos.guardados[0]).toMatchObject({ nombre: 'Producto Nuevo', stockInicial: 10 });
  });
});

describe('editar NUNCA arrastra stock', () => {
  it('la ficha pasa al formulario con stockInicial en cero', () => {
    // Editar no mueve inventario: para eso esta el ajuste.
    const f = fichaAFormularioDeProducto(FICHA);
    expect(f.stockInicial).toBe(0);
    expect(f.notas).toBe('Algo interno');
    expect(f.ubicacion).toBe('Estante');
  });
});

describe('el ajuste de inventario', () => {
  it('se hace desde el detalle, junto a la lista de movimientos', async () => {
    datos.pagina = { total: 1, filas: [FILA] };
    datos.ficha = FICHA;
    render(<Almacen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Acciones para Producto Uno' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ver detalle' }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Inventario' }));
    await userEvent.click(screen.getByRole('button', { name: /Ajustar inventario/ }));
    await userEvent.type(screen.getByLabelText(/Motivo/), 'Llegó pedido');
    await userEvent.click(screen.getByRole('button', { name: /Registrar movimiento/ }));
    await waitFor(() => expect(datos.ajustes.length).toBe(1));
    expect(datos.ajustes[0]).toMatchObject({ motivo: 'Llegó pedido' });
  });
});

describe('las cifras con datos', () => {
  it('salen del resumen del servidor, no de contar las filas', async () => {
    datos.resumen = { total: 128, valorCentavos: 2485000, bajos: 7, agotados: 3 };
    datos.pagina = { total: 128, filas: [FILA] };
    render(<Almacen />);
    expect(await screen.findByText('128')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Mostrando 1 a 1 de 128 productos')).toBeTruthy();
  });
});

describe('lo que Productos NO conoce', () => {
  it('no importa nada de Ventas, Clientes ni Caja', async () => {
    const fuente = await import('node:fs').then((fs) =>
      fs.readFileSync('src/productos/almacen.tsx', 'utf8'),
    );
    for (const m of ['../ventas/', '../clientes/', '../agenda/', '../inicio/', '../cursos/']) {
      expect(fuente).not.toContain(`from '${m}`);
    }
  });
});
