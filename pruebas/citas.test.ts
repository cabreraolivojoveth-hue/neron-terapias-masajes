import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({}),
  clienteParaLaBase: () => ({}),
}));

const { ESTADOS, etiquetaDeEstado, llaveDeCitas } = await import('../src/datos/citas.js');

describe('los estados de una cita', () => {
  it('son exactamente los CINCO del sistema', () => {
    // Los mismos en agenda, inicio, clientes y reportes. Inventar un sexto en
    // una pantalla hace que las demas dejen de contarlo.
    expect(ESTADOS.map((e) => e.clave)).toEqual([
      'pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio',
    ]);
  });

  it('cada uno se lee con PALABRAS, no solo con color', () => {
    expect(etiquetaDeEstado('no_asistio')).toBe('No asistió');
    expect(etiquetaDeEstado('confirmada')).toBe('Confirmada');
  });

  it('un estado desconocido se muestra tal cual, sin reventar', () => {
    expect(etiquetaDeEstado('lo_que_sea')).toBe('lo_que_sea');
  });
});

describe('la llave de cache', () => {
  it('cambia con el rango: dia y semana no comparten resultado', () => {
    const a = llaveDeCitas('t_c', '10/07/2026', '10/07/2026');
    const b = llaveDeCitas('t_c', '06/07/2026', '12/07/2026');
    expect(a).not.toBe(b);
  });

  it('cambia con los FILTROS', () => {
    // Sin esto, filtrar por terapeuta devolveria lo que estaba guardado sin
    // filtrar, y la pantalla mostraria citas que se acaban de excluir.
    const sin = llaveDeCitas('t_c', '10/07/2026', '10/07/2026');
    const con = llaveDeCitas('t_c', '10/07/2026', '10/07/2026', { profesionalId: 'p1' });
    expect(sin).not.toBe(con);
  });

  it('cambia con el CENTRO', () => {
    // La proteccion de verdad son las reglas de la base, pero si dos centros
    // compartieran llave, al cambiar de cuenta se veria un instante la
    // agenda del anterior.
    expect(llaveDeCitas('t_a', '10/07/2026', '10/07/2026'))
      .not.toBe(llaveDeCitas('t_b', '10/07/2026', '10/07/2026'));
  });

  it('la misma consulta da la MISMA llave', () => {
    expect(llaveDeCitas('t_c', '10/07/2026', '10/07/2026', { estado: 'pendiente' }))
      .toBe(llaveDeCitas('t_c', '10/07/2026', '10/07/2026', { estado: 'pendiente' }));
  });

  it('empieza con "citas" para que invalidar por prefijo la alcance', () => {
    expect(llaveDeCitas('t_c', '10/07/2026', '10/07/2026').startsWith('citas')).toBe(true);
  });
});
