/**
 * La capa de datos del tablero.
 *
 * Todo lo de aqui es aritmetica y ordenamiento de lo que contesta el servidor:
 * se prueba sin base de datos y sin navegador. Lo que las reglas de acceso de
 * verdad entreguen se comprueba en `pruebas-bd/ataques.ts`, con una base
 * enfrente.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({}),
  clienteParaLaBase: () => ({}),
}));

const {
  RESUMEN_VACIO,
  PREFIJO_DE_INICIO,
  diasDelRango,
  llaveDeIngresos,
  llaveDeRecordatorios,
  llaveDelResumen,
  lunesDeLaSemana,
  ordenarResumen,
  periodosDeIngresos,
} = await import('../src/datos/tablero.js');

describe('ordenar lo que contesta el servidor', () => {
  it('un resumen vacio no inventa ni un numero', () => {
    expect(RESUMEN_VACIO.citasHoy).toBe(0);
    expect(RESUMEN_VACIO.ventasHoy).toBe(0);
    expect(RESUMEN_VACIO.ingresosSemana).toEqual([]);
    expect(RESUMEN_VACIO.topServicios).toEqual([]);
    expect(RESUMEN_VACIO.topProductos).toEqual([]);
  });

  it('una respuesta rara no revienta la pantalla: cae al vacio', () => {
    // Preferimos un tablero en ceros a una pantalla en blanco con un error en
    // la consola que nadie va a abrir.
    expect(ordenarResumen(null)).toEqual(RESUMEN_VACIO);
    expect(ordenarResumen('lo que sea')).toEqual(RESUMEN_VACIO);
    expect(ordenarResumen(undefined)).toEqual(RESUMEN_VACIO);
  });

  it('CONSERVA el null de "ayer no hubo nada"', () => {
    /**
     * LA PRUEBA QUE PROTEGE EL NUMERO MAS FACIL DE ARRUINAR.
     *
     * Si el null se convirtiera en cero aqui, la tarjeta calcularia el cambio
     * dividiendo entre cero y anunciaria "+∞%" o "+5000%". La base manda null
     * a proposito para que la pantalla diga "nuevo".
     */
    const r = ordenarResumen({ ventasHoy: 5000, ventasAyer: null });
    expect(r.ventasAyer).toBeNull();
    expect(r.ventasHoy).toBe(5000);
  });

  it('un ayer de cero SI es cero, y es distinto de no haber', () => {
    expect(ordenarResumen({ ventasAyer: 0 }).ventasAyer).toBe(0);
  });

  it('un numero que no es numero se vuelve cero, nunca NaN', () => {
    // Un NaN no revienta: se suma, se formatea, y termina impreso como "$NaN"
    // en la tarjeta del dueño.
    const r = ordenarResumen({ citasHoy: 'ocho', ventasHoy: undefined });
    expect(r.citasHoy).toBe(0);
    expect(r.ventasHoy).toBe(0);
    expect(Number.isNaN(r.citasHoy)).toBe(false);
  });

  it('traduce imagen_url de la base a imagenUrl, una sola vez', () => {
    const r = ordenarResumen({
      topProductos: [{ id: 'p1', nombre: 'Aceite', imagen_url: 'https://x/y.png', unidades: 3 }],
    });
    expect(r.topProductos[0]?.imagenUrl).toBe('https://x/y.png');
  });

  it('un producto sin foto llega con null, no con cadena vacia', () => {
    const r = ordenarResumen({
      topProductos: [{ id: 'p1', nombre: 'Vela', imagen_url: null, unidades: 1 }],
    });
    expect(r.topProductos[0]?.imagenUrl).toBeNull();
  });

  it('las fechas de la grafica llegan en el formato de la aplicacion', () => {
    const r = ordenarResumen({ ingresosSemana: [{ fecha: '2026-08-03', total: 1500 }] });
    expect(r.ingresosSemana[0]?.fecha).toBe('03/08/2026');
    expect(r.ingresosSemana[0]?.total).toBe(1500);
  });

  it('una lista que no es lista se vuelve lista vacia', () => {
    expect(ordenarResumen({ topServicios: 'nada' }).topServicios).toEqual([]);
  });
});

describe('las llaves de cache', () => {
  it('todas cuelgan del prefijo de Inicio', () => {
    // Es lo que hace que un solo invalidar('inicio') refresque el tablero
    // entero y el buscador global.
    for (const llave of [
      llaveDelResumen('t_c', '06/08/2026'),
      llaveDeIngresos('t_c', '03/08/2026', '09/08/2026'),
      llaveDeRecordatorios('t_c', '06/08/2026'),
    ]) {
      expect(llave.startsWith(PREFIJO_DE_INICIO)).toBe(true);
    }
  });

  it('la del resumen CAMBIA con el dia', () => {
    // Sin esto, una pestaña abierta desde ayer seguiria mostrando las citas de
    // ayer bajo el titulo "Citas hoy", con toda la cara de estar al dia.
    expect(llaveDelResumen('t_c', '06/08/2026')).not.toBe(llaveDelResumen('t_c', '07/08/2026'));
  });

  it('cambia con el CENTRO', () => {
    expect(llaveDelResumen('t_a', '06/08/2026')).not.toBe(llaveDelResumen('t_b', '06/08/2026'));
  });

  it('la de ingresos cambia con el rango', () => {
    expect(llaveDeIngresos('t_c', '03/08/2026', '09/08/2026'))
      .not.toBe(llaveDeIngresos('t_c', '27/07/2026', '02/08/2026'));
  });
});

describe('los dias de un rango', () => {
  it('incluye los dos extremos', () => {
    const d = diasDelRango('03/08/2026', '09/08/2026');
    expect(d).toHaveLength(7);
    expect(d[0]).toBe('03/08/2026');
    expect(d[6]).toBe('09/08/2026');
  });

  it('un solo dia devuelve un solo dia', () => {
    expect(diasDelRango('06/08/2026', '06/08/2026')).toEqual(['06/08/2026']);
  });

  it('un rango al reves devuelve vacio, no una lista infinita', () => {
    expect(diasDelRango('09/08/2026', '03/08/2026')).toEqual([]);
  });

  it('cruza el cambio de mes sin saltarse ni repetir un dia', () => {
    const d = diasDelRango('29/01/2026', '02/02/2026');
    expect(d).toEqual(['29/01/2026', '30/01/2026', '31/01/2026', '01/02/2026', '02/02/2026']);
  });

  it('cuenta bien el 29 de febrero de un año bisiesto', () => {
    const d = diasDelRango('27/02/2024', '01/03/2024');
    expect(d).toContain('29/02/2024');
    expect(d).toHaveLength(4);
  });

  it('un mes completo son sus dias, ni uno mas', () => {
    expect(diasDelRango('01/08/2026', '31/08/2026')).toHaveLength(31);
  });
});

describe('la semana empieza en LUNES', () => {
  it('el lunes es el mismo lunes', () => {
    expect(lunesDeLaSemana('03/08/2026')).toBe('03/08/2026');
  });

  it('el domingo pertenece a la semana que ACABA, no a la que empieza', () => {
    /**
     * En México el domingo es fin de semana. Con la semana empezando en
     * domingo, el sabado y el domingo caen en semanas distintas y ninguna
     * comparacion cuadra. Es la misma regla que aplica `resumen_inicio` en la
     * base: si las dos no coincidieran, la grafica cambiaria de forma al tocar
     * el selector sin que nadie entendiera por que.
     */
    expect(lunesDeLaSemana('09/08/2026')).toBe('03/08/2026');
  });

  it('cruza hacia el mes anterior cuando toca', () => {
    expect(lunesDeLaSemana('01/08/2026')).toBe('27/07/2026');
  });
});

describe('los periodos de la grafica', () => {
  it('son los tres del diseño y en ese orden', () => {
    expect(periodosDeIngresos('06/08/2026').map((p) => p.clave)).toEqual([
      'estaSemana', 'semanaAnterior', 'esteMes',
    ]);
  });

  it('la semana en curso va de lunes a domingo', () => {
    const p = periodosDeIngresos('06/08/2026')[0]!;
    expect(p.desde).toBe('03/08/2026');
    expect(p.hasta).toBe('09/08/2026');
  });

  it('la semana anterior son los siete dias de antes, sin encimarse', () => {
    const [actual, anterior] = periodosDeIngresos('06/08/2026');
    expect(anterior!.desde).toBe('27/07/2026');
    expect(anterior!.hasta).toBe('02/08/2026');
    expect(diasDelRango(anterior!.desde, anterior!.hasta)).toHaveLength(7);
    expect(anterior!.hasta < actual!.desde).toBe(true);
  });

  it('el mes va del dia uno al ultimo, calculado y no supuesto', () => {
    const mes = periodosDeIngresos('15/02/2024')[2]!;
    expect(mes.desde).toBe('01/02/2024');
    // Febrero bisiesto: 29, no 28 ni un 30 escrito a mano en una tabla.
    expect(mes.hasta).toBe('29/02/2024');
  });

  it('en un mes de 31 dias termina el 31', () => {
    expect(periodosDeIngresos('06/08/2026')[2]!.hasta).toBe('31/08/2026');
  });
});
