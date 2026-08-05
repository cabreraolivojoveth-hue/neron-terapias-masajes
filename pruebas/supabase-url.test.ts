import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); });

const conUrl = async (valor: string) => {
  // Se reinicia el registro de modulos en CADA llamada: el cliente se guarda
  // una sola vez por modulo, asi que sin esto la segunda comprobacion de una
  // misma prueba leeria el cliente creado en la primera.
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', valor);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_loquesea');
  const createClient = vi.fn((_url: string, _llave: string, _op?: unknown) => ({}));
  vi.doMock('@supabase/supabase-js', () => ({ createClient }));
  const { supabase } = await import('../src/supabase.js');
  supabase();
  vi.doUnmock('@supabase/supabase-js');
  return String(createClient.mock.calls[0]?.[0] ?? '');
};

describe('la direccion se endereza pase lo que pase', () => {
  it('la buena se queda igual', async () => {
    expect(await conUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co');
  });

  it('SIN la primera letra tambien sirve', async () => {
    // Caso real: la consola de Windows se comio la "h" al pegar y quedo
    // guardado "ttps://". El cliente lo rechazaba y la pantalla salia en
    // blanco, sin ninguna pista de por que.
    expect(await conUrl('ttps://abc.supabase.co')).toBe('https://abc.supabase.co');
    expect(await conUrl('tps://abc.supabase.co')).toBe('https://abc.supabase.co');
  });

  it('sin nada adelante tambien: es lo que escribe media la gente', async () => {
    expect(await conUrl('abc.supabase.co')).toBe('https://abc.supabase.co');
  });

  it('en http se convierte a https', async () => {
    expect(await conUrl('http://abc.supabase.co')).toBe('https://abc.supabase.co');
  });

  it('con espacios de sobra al pegar', async () => {
    expect(await conUrl('  https://abc.supabase.co  ')).toBe('https://abc.supabase.co');
  });

  it('con comillas, que es como se escribe en otros formatos', async () => {
    expect(await conUrl('"https://abc.supabase.co"')).toBe('https://abc.supabase.co');
  });

  it('con la diagonal del final', async () => {
    expect(await conUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co');
  });

  it('vacia sigue contando como SIN configurar', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '   ');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'x');
    const { HAY_CONEXION } = await import('../src/supabase.js');
    expect(HAY_CONEXION).toBe(false);
  });
});
