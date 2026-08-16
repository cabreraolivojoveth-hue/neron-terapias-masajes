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

  it('arma el portero SIN apagar el segundo factor: la deuda esta pagada', () => {
    /**
     * ESTA PRUEBA ERA LA CONTRARIA HASTA EL BLOQUE 10, y vale la pena contarlo.
     *
     * Decia `expect(...segundoFactorApagado).toBe(true)` y fijaba por escrito
     * un atajo con su razon: la base exige verificacion en dos pasos a dueño y
     * administrador, y Terapias no tenia ninguna pantalla donde darla de alta.
     * Sin el apagado, el dueño entraba bien y el sistema le contestaba "falta
     * el segundo paso" — un paso imposible de completar. Quedo encerrado
     * afuera de su propio centro, con el sistema publicado.
     *
     * Configuracion trajo esa pantalla, y —lo que de verdad cierra el
     * agujero— la puso tambien del lado de AFUERA, en la pantalla de "falta el
     * segundo paso". Asi que el apagado se quito, y esta prueba lo vigila al
     * reves: si vuelve a aparecer, falla aqui.
     */
    pintar();
    expect(porteroFalso.opciones?.['segundoFactorApagado']).toBeUndefined();
    // Tampoco se exige a todos: la base ya decide a quien, segun su rol.
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
