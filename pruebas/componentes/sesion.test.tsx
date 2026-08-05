/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const porteroFalso = vi.hoisted(() => {
  let oyente: (() => void) | null = null;
  return {
    estado: 'cargando' as string,
    acceso: null as unknown,
    iniciado: 0,
    detenido: 0,
    cambiar(estado: string, acceso: unknown = null) {
      this.estado = estado;
      this.acceso = acceso;
      oyente?.();
    },
    obj: {
      estado: () => porteroFalso.estado,
      acceso: () => porteroFalso.acceso,
      llaveDeReinicio: () => 'llave',
      roles: () => [],
      sesion: () => null,
      suscribir: (o: () => void) => { oyente = o; return () => { oyente = null; }; },
      iniciar: async () => { porteroFalso.iniciado += 1; },
      refrescar: async () => {},
      cerrarSesion: async () => {},
      detener: () => { porteroFalso.detenido += 1; },
    },
  };
});

vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({}),
  clienteParaLaBase: () => ({}),
}));
vi.mock('@neron/base/identidad', () => ({
  crearPortero: () => porteroFalso.obj,
  crearProveedorSupabase: () => ({}),
  crearDirectorioSupabase: () => ({}),
}));

const { ProveedorDeSesion, useSesion, usePermisos, usePuede } = await import(
  '../../src/identidad/sesion.js'
);

afterEach(cleanup);

function Espia() {
  const { estado } = useSesion();
  const permisos = usePermisos();
  const puedeCobrar = usePuede('cobrar');
  return (
    <div>
      <span data-testid="estado">{estado}</span>
      <span data-testid="cuantos">{Object.keys(permisos).length}</span>
      <span data-testid="cobrar">{String(puedeCobrar)}</span>
    </div>
  );
}

const pintar = () =>
  render(
    <ProveedorDeSesion>
      <Espia />
    </ProveedorDeSesion>,
  );

describe('el enganche con el portero', () => {
  it('arranca el portero al montar y lo detiene al desmontar', () => {
    const antes = porteroFalso.iniciado;
    const { unmount } = pintar();
    expect(porteroFalso.iniciado).toBe(antes + 1);
    const detenidos = porteroFalso.detenido;
    unmount();
    // Sin el `detener`, cada vez que se remonta queda una suscripcion viva y
    // el sistema se va llenando de oyentes que nadie apaga.
    expect(porteroFalso.detenido).toBe(detenidos + 1);
  });

  it('reparte el estado que dice el portero', () => {
    porteroFalso.estado = 'sin-sesion';
    pintar();
    expect(screen.getByTestId('estado').textContent).toBe('sin-sesion');
  });
});

describe('los permisos, cuando no hay sesion', () => {
  it('llegan VACIOS, no completos', () => {
    // Si el dato se pierde o llega a medias, la persona cae al minimo de
    // permisos, jamas al maximo. Es la misma regla que aplica la base de datos.
    porteroFalso.estado = 'cargando';
    porteroFalso.acceso = null;
    pintar();
    expect(screen.getByTestId('cuantos').textContent).toBe('0');
    expect(screen.getByTestId('cobrar').textContent).toBe('false');
  });

  it('un permiso ausente NO cuenta como concedido', () => {
    porteroFalso.estado = 'listo';
    porteroFalso.acceso = { permisos: { verFinanzas: true } };
    pintar();
    expect(screen.getByTestId('cobrar').textContent).toBe('false');
  });
});

describe('usarlo fuera del proveedor', () => {
  it('lanza un error que dice como arreglarlo', () => {
    const callar = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Espia />)).toThrowError(/ProveedorDeSesion/);
    callar.mockRestore();
  });
});
