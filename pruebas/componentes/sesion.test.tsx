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
    /** Con que se armo el portero. Se revisa abajo, no se ignora. */
    opciones: null as Record<string, unknown> | null,
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
  crearPortero: (opciones: Record<string, unknown>) => {
    porteroFalso.opciones = opciones;
    return porteroFalso.obj;
  },
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

  it('arma el portero con el segundo factor APAGADO, y eso es a proposito', () => {
    /**
     * Lo que paso en produccion: el dueño entro con su correo y contraseña,
     * la conexion funciono, y el sistema le contesto "falta el segundo paso"
     * — un paso que Terapias todavia no tiene pantalla para completar. Quedo
     * afuera de su propio centro.
     *
     * Esta prueba NO celebra el apagado. Lo fija por escrito para que se vea
     * en la lista de pruebas, y para que el dia que se quite falle aqui y no
     * en la cara de alguien que intenta entrar. La otra mitad la hace la
     * guardia que revienta en cuanto exista `src/configuracion/`.
     */
    pintar();
    expect(porteroFalso.opciones?.['segundoFactorApagado']).toBe(true);
    // Y jamas las dos cosas a la vez: seria configuracion contradictoria, y
    // la base resuelve eso cerrando la puerta — de vuelta al mismo encierro.
    expect(porteroFalso.opciones?.['segundoFactorParaTodos']).toBeUndefined();
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
