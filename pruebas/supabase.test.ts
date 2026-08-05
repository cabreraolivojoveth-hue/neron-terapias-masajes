import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); });

describe('cuando falta configurar la conexion', () => {
  it('lo DICE en vez de arrancar a medias', async () => {
    // Es lo primero que le pasa a quien clona el repositorio. Sin esto, el
    // cliente revienta en algun lugar profundo y lo que se ve es una pantalla
    // en blanco con un error en la consola que nadie va a abrir.
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { HAY_CONEXION, supabase } = await import('../src/supabase.js');
    expect(HAY_CONEXION).toBe(false);
    expect(() => supabase()).toThrowError(/CONFIGURAR-CONEXION\.md/);
  });

  it('el error dice QUE archivo leer, no solo que fallo', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { supabase } = await import('../src/supabase.js');
    try {
      supabase();
      expect.unreachable('deberia haber lanzado');
    } catch (e) {
      expect((e as Error).message).toContain('VITE_SUPABASE_URL');
      expect((e as Error).message).toContain('VITE_SUPABASE_ANON_KEY');
    }
  });

  it('con una sola de las dos llaves TAMPOCO se da por configurado', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://algo.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { HAY_CONEXION } = await import('../src/supabase.js');
    expect(HAY_CONEXION).toBe(false);
  });
});

describe('cuando si esta configurada', () => {
  it('el cliente se crea UNA SOLA VEZ', async () => {
    // Uno por pantalla abre conexiones de mas y —lo grave— cada uno lleva su
    // propia copia de la sesion: cerrar sesion en una pantalla no la cierra
    // en la otra.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://algo.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'llave-de-prueba');
    const { supabase } = await import('../src/supabase.js');
    expect(supabase()).toBe(supabase());
  });

  it('la sesion sobrevive a cerrar la pestaña', async () => {
    // Sin `persistSession`, la persona tiene que volver a entrar cada vez que
    // abre el sistema.
    const createClient = vi.fn((_url: string, _llave: string, _opciones?: unknown) => ({}));
    vi.doMock('@supabase/supabase-js', () => ({ createClient }));
    vi.stubEnv('VITE_SUPABASE_URL', 'https://algo.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'llave-de-prueba');
    const { supabase } = await import('../src/supabase.js');
    supabase();
    expect(createClient.mock.calls[0]?.[2] as object).toMatchObject({
      auth: { persistSession: true, autoRefreshToken: true },
    });
    vi.doUnmock('@supabase/supabase-js');
  });
});
