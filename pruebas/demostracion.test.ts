/**
 * LA CAPA DE DATOS DE LA DEMOSTRACION.
 *
 * Lo que se vigila aqui es lo que no se ve mirando la pantalla: que la cuenta
 * que puede cargarla sea EXACTAMENTE una, que el ciclo de los nueve pasos lo
 * corte la base y no un contador de aqui, y que al terminar se refresque el
 * sistema entero — no solo Configuracion.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({}),
  clienteParaLaBase: () => ({}),
}));

const {
  CORREO_DE_LA_DEMOSTRACION,
  DEMOSTRACION_VACIA,
  LO_QUE_TOCA_LA_DEMOSTRACION,
  PASOS_DE_LA_DEMOSTRACION,
  esLaCuentaDeDemostracion,
  llaveDeLaDemostracion,
  ordenarEstado,
  ordenarPaso,
  cargarDemostracionCompleta,
} = await import('../src/datos/demostracion.js');

describe('quien puede cargarla', () => {
  it('una sola cuenta, y se compara sin espacios ni mayusculas', () => {
    expect(esLaCuentaDeDemostracion(CORREO_DE_LA_DEMOSTRACION)).toBe(true);
    expect(esLaCuentaDeDemostracion(`  ${CORREO_DE_LA_DEMOSTRACION.toUpperCase()} `)).toBe(true);
  });

  it('cualquier otra, no. Ni una parecida', () => {
    expect(esLaCuentaDeDemostracion('otra@correo.mx')).toBe(false);
    expect(esLaCuentaDeDemostracion(`x${CORREO_DE_LA_DEMOSTRACION}`)).toBe(false);
  });

  it('sin correo tampoco: el hueco cae al lado seguro', () => {
    /*
     * Es la misma regla que los permisos: si el dato falta o llega a medias, la
     * persona cae al minimo. Dar por buena la cuenta porque falta el correo
     * seria ofrecerle a cualquiera el boton que llena su centro de datos
     * inventados.
     */
    expect(esLaCuentaDeDemostracion(null)).toBe(false);
    expect(esLaCuentaDeDemostracion(undefined)).toBe(false);
    expect(esLaCuentaDeDemostracion('')).toBe(false);
  });

  it('el correo escrito aqui es el MISMO que comprueba la base', async () => {
    /*
     * Si los dos dejan de coincidir, la tarjeta aparece y la carga falla con un
     * error de permisos. Al reves es imposible —la que decide es la base— pero
     * este es el fallo que se ve como "el boton no sirve".
     */
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const sql = readFileSync(
      join(import.meta.dirname, '..', 'INSTALAR-EN-TERAPIAS.sql'),
      'utf8',
    );
    expect(sql).toContain(`select '${CORREO_DE_LA_DEMOSTRACION}'::text`);
  });
});

describe('lo que se invalida al terminar', () => {
  it('incluye el tablero de Inicio', () => {
    // Sin esto, quien cargue la demostracion vuelve a Inicio y ve ceros encima
    // de quinientas citas recien sembradas.
    expect(LO_QUE_TOCA_LA_DEMOSTRACION).toContain('inicio');
  });

  it('incluye TODOS los modulos, porque una carga los toca todos', () => {
    for (const p of ['clientes', 'citas', 'ventas', 'caja', 'gastos', 'cursos',
      'productos', 'mensajes', 'recordatorios', 'reportes', 'configuracion']) {
      expect(LO_QUE_TOCA_LA_DEMOSTRACION, p).toContain(p);
    }
  });
});

describe('la llave de cache', () => {
  it('cambia con el centro: dos centros no comparten respuesta', () => {
    expect(llaveDeLaDemostracion('t_a')).not.toBe(llaveDeLaDemostracion('t_b'));
  });
});

describe('lo que contesta la base', () => {
  it('un hueco no se convierte en "si": todo lo dudoso cae en false y cero', () => {
    expect(ordenarEstado(null)).toEqual(DEMOSTRACION_VACIA);
    expect(ordenarEstado({}).puede).toBe(false);
    expect(ordenarEstado({}).cargada).toBe(false);
  });

  it('los conteos llegan como texto desde Postgres y se vuelven numeros', () => {
    // `count(*)` viaja como cadena en JSON. Sin convertirlo, "0" es verdadero y
    // la pantalla diria que hay datos cargados cuando no hay ninguno.
    const e = ordenarEstado({ puede: true, cargada: true, filas: '6812', pasos: '9',
      porTabla: { cita: '712', venta: '604' }, sembradaEn: '2026-08-16T10:00:00Z' });
    expect(e.filas).toBe(6812);
    expect(e.porTabla['cita']).toBe(712);
    expect(e.sembradaEn).toBe('2026-08-16T10:00:00Z');
  });

  it('un paso sin titulo se llama como le toca, no con un hueco', () => {
    expect(ordenarPaso({ paso: 2, siguiente: 3 }).titulo).toBe(PASOS_DE_LA_DEMOSTRACION[1]);
  });

  it('el ultimo paso no tiene siguiente, y eso es lo que corta el ciclo', () => {
    expect(ordenarPaso({ paso: 9, siguiente: null }).siguiente).toBeNull();
  });
});

describe('el ciclo de los nueve pasos', () => {
  it('lo corta la BASE, no un contador del navegador', async () => {
    /*
     * Cada paso contesta cual es el siguiente. Si el navegador contara hasta
     * nueve, el dia que se agregue un paso decimo la carga se pararia en el
     * noveno — sin fallar y dejando el centro a medias.
     */
    const vistos: number[] = [];
    const avisos: number[] = [];

    const filas = await cargarDemostracionCompleta(
      't_c',
      (p) => avisos.push(p.paso),
      async (_negocio, paso) => {
        vistos.push(paso);
        return {
          paso, pasos: 9, titulo: 'x', hechas: 10,
          siguiente: paso < 3 ? paso + 1 : null,
          filas: paso * 100,
        };
      },
    );

    expect(vistos).toEqual([1, 2, 3]);
    expect(avisos).toEqual([1, 2, 3]);
    expect(filas).toBe(300);
  });

  it('tiene tope de vueltas: una base que conteste siempre lo mismo no cuelga la pestaña', async () => {
    const pedir = vi.fn(async () => ({
      paso: 1, pasos: 9, titulo: 'x', hechas: 1, siguiente: 1, filas: 1,
    }));

    await cargarDemostracionCompleta('t_c', () => {}, pedir);
    expect(pedir.mock.calls.length).toBeLessThanOrEqual(20);
    expect(pedir.mock.calls.length).toBeGreaterThan(1);
  });
});
