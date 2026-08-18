import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({ rpc }),
  clienteParaLaBase: () => ({ rpc }),
}));

const { crearMiCentro } = await import('../src/datos/alta-de-centro.js');

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { negocio: 't_abc', centro: 'Casa Zen' }, error: null });
});

describe('lo que viaja a la base', () => {
  it('SOLO van los dos nombres: ni el id del centro, ni el correo, ni el rol', async () => {
    /**
     * Es la prueba mas importante del archivo. Si el id del centro se pudiera
     * mandar desde aqui, cualquiera escribiria el del centro de otro y se
     * daria de alta ahi de dueño. Sale de `auth.uid()` en la base y de ningun
     * otro lado.
     */
    await crearMiCentro('Casa Zen', 'Ana Ruiz');
    expect(rpc).toHaveBeenCalledWith('crear_mi_centro', {
      p_centro: 'Casa Zen',
      p_mi_nombre: 'Ana Ruiz',
    });
  });

  it('los espacios de sobra se quitan antes de mandar', async () => {
    // "Casa Zen " y "Casa Zen" se ven iguales en una lista y no lo son.
    await crearMiCentro('  Casa   Zen  ', '  Ana   Ruiz ');
    expect(rpc.mock.calls[0]?.[1]).toEqual({ p_centro: 'Casa Zen', p_mi_nombre: 'Ana Ruiz' });
  });
});

describe('lo que devuelve', () => {
  it('entrega el id del centro recien nacido', async () => {
    const r = await crearMiCentro('Casa Zen', 'Ana Ruiz');
    expect(r).toEqual({ negocio: 't_abc', centro: 'Casa Zen' });
  });

  it('si la base contesta vacio, el nombre del centro sigue siendo el que se pidio', async () => {
    // Una respuesta a medias no puede dejar la pantalla diciendo "undefined".
    rpc.mockResolvedValue({ data: null, error: null });
    const r = await crearMiCentro('  Casa Zen  ', 'Ana Ruiz');
    expect(r.centro).toBe('Casa Zen');
    expect(r.negocio).toBe('');
  });
});

describe('cuando la base dice que no', () => {
  it('el mensaje de la base se respeta TAL CUAL', async () => {
    /**
     * Los mensajes de `crear_mi_centro` estan escritos en español y dicen que
     * hacer. Envolverlos en "crear tu centro: ..." los dejaria peor.
     */
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Te invitaron a un centro. Usa "Ya me invitaron" en vez de crear uno nuevo.' },
    });
    await expect(crearMiCentro('Casa Zen', 'Ana')).rejects.toThrow(
      'Te invitaron a un centro. Usa "Ya me invitaron" en vez de crear uno nuevo.',
    );
  });

  it('si la FUNCION no existe, se dice que archivo hay que pegar', async () => {
    /**
     * Vercel publica el navegador, no la base. Quien suba esta version sin
     * pegar el SQL recibe un "Could not find the function" que no menciona el
     * archivo que falta — y ese archivo esta en el repositorio, con nombre.
     */
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.crear_mi_centro(p_centro, p_mi_nombre)' },
    });
    await expect(crearMiCentro('Casa Zen', 'Ana')).rejects.toThrow(/PEGAR-CREAR-CUENTA\.sql/);
  });

  it('un error de red no se traga', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    await expect(crearMiCentro('Casa Zen', 'Ana')).rejects.toThrow('offline');
  });
});
