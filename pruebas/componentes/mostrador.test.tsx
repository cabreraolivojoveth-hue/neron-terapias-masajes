/**
 * @vitest-environment happy-dom
 *
 * EL MOSTRADOR: cobrar y el cajón en una sola pantalla.
 *
 * Lo que se vigila aquí es lo que se rompe EN SILENCIO al unir dos módulos: que
 * una cajera sin permiso de finanzas siga pudiendo cobrar, que el recado de otro
 * módulo caiga en la pestaña correcta Y le llegue entero al hijo, y que cambiar
 * de pestaña no le tire el carrito a medio armar.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { olvidarIntencion, ponerIntencion, tomarIntencion } from '@neron/base/marco';
import {
  PESTANAS_DEL_MOSTRADOR,
  espiarIntencion,
  pestanaDelRecado,
  pestanasQuePuedeVer,
  recadoDelMostrador,
} from '../../src/caja/mostrador.js';

beforeEach(() => olvidarIntencion());
afterEach(() => {
  olvidarIntencion();
  vi.restoreAllMocks();
});

const COBRA = { cobrar: true };
const FINANZAS = { verFinanzas: true };
const TODO = { cobrar: true, verFinanzas: true };

describe('las pestañas se filtran por permiso, no se apagan', () => {
  it('quien cobra ve el cobro y las ventas, pero NO el cajón ni el corte', () => {
    /**
     * Media barra en gris le cuenta a quien no debe que esas cuentas existen. Y
     * si el cajón se le enseñara, la base tampoco le entregaria los numeros:
     * veria una pantalla vacia sin entender por que.
     */
    const claves = pestanasQuePuedeVer(COBRA).map((p) => p.clave);
    expect(claves).toEqual(['cobrar', 'dia', 'historial', 'cotizaciones']);
  });

  it('quien lleva las cuentas sin atender el mostrador ve el cajón y el corte', () => {
    const claves = pestanasQuePuedeVer(FINANZAS).map((p) => p.clave);
    expect(claves).toEqual(['cajon', 'corte']);
  });

  it('la dueña ve las seis', () => {
    expect(pestanasQuePuedeVer(TODO)).toHaveLength(6);
  });

  it('quien no puede ninguna de las dos cosas no ve ninguna', () => {
    expect(pestanasQuePuedeVer({})).toHaveLength(0);
  });

  it('COBRAR es la primera, porque es donde se pasa el día', () => {
    // Si abriera en otra, la cajera tendria que tocar una pestaña cada vez que
    // entra — todo el dia, para el trabajo mas repetido del centro.
    expect(PESTANAS_DEL_MOSTRADOR[0]?.clave).toBe('cobrar');
    expect(pestanasQuePuedeVer(COBRA)[0]?.clave).toBe('cobrar');
  });

  it('las dos capacidades que se usan son las que existen de verdad', () => {
    // `gestionarCaja` no existe en el producto: las capacidades son `cobrar` y
    // `verFinanzas`. Pedir una que no existe esconderia la pestaña para todos.
    const capacidades = new Set(PESTANAS_DEL_MOSTRADOR.map((p) => p.capacidad));
    expect([...capacidades].sort()).toEqual(['cobrar', 'verFinanzas']);
  });
});

describe('a donde cae el recado de cada modulo', () => {
  it('cobrar desde Inicio o desde un expediente abre COBRAR', () => {
    expect(pestanaDelRecado({ modulo: 'ventas', accion: 'nueva' })).toBe('cobrar');
    expect(pestanaDelRecado({ modulo: 'ventas', accion: 'pago' })).toBe('cobrar');
  });

  it('abrir una venta desde Productos cae en el HISTORIAL, que es donde se ve', () => {
    expect(pestanaDelRecado({ modulo: 'ventas', accion: 'abrir', detalle: 'v1' }))
      .toBe('historial');
  });

  it('una cotizacion cae en Cotizaciones', () => {
    expect(pestanaDelRecado({ modulo: 'ventas', accion: 'cotizar' })).toBe('cotizaciones');
  });

  it('cerrar la caja cae en el CORTE, y lo demas del cajón en el cajón', () => {
    expect(pestanaDelRecado({ modulo: 'caja', accion: 'cerrar' })).toBe('corte');
    expect(pestanaDelRecado({ modulo: 'caja', accion: 'corte' })).toBe('corte');
    expect(pestanaDelRecado({ modulo: 'caja', accion: 'ingreso' })).toBe('cajon');
    expect(pestanaDelRecado({ modulo: 'caja', accion: 'historial' })).toBe('cajon');
  });

  it('un recado de otro modulo no mueve nada', () => {
    expect(pestanaDelRecado({ modulo: 'agenda', accion: 'nueva' })).toBeNull();
  });
});

describe('el recado se ESPIA, no se consume', () => {
  /**
   * ES LA PIEZA QUE EVITA UN FALLO INVISIBLE.
   *
   * `tomarIntencion` lee Y BORRA. El Mostrador necesita la accion para escoger
   * la pestaña, y el hijo necesita el recado ENTERO para saber que abrir. Si el
   * padre lo consumiera, "Nueva venta" desde el expediente de un cliente
   * abriria la pestaña correcta con el carrito EN BLANCO — sin fallar, sin
   * avisar y con toda la cara de estar bien.
   */
  it('despues de espiarlo, el hijo todavia lo encuentra', () => {
    ponerIntencion('ventas:abrir:v7');

    const espiado = espiarIntencion('ventas');
    expect(espiado?.accion).toBe('abrir');
    expect(espiado?.detalle).toBe('v7');

    // Lo que haria el punto de venta al montar:
    const delHijo = tomarIntencion('ventas');
    expect(delHijo?.detalle).toBe('v7');
  });

  it('espiar dos veces lo deja igual: React monta dos veces en desarrollo', () => {
    ponerIntencion('caja:cerrar');
    expect(espiarIntencion('caja')?.accion).toBe('cerrar');
    expect(espiarIntencion('caja')?.accion).toBe('cerrar');
    expect(tomarIntencion('caja')?.accion).toBe('cerrar');
  });

  it('sin recado no inventa ninguno', () => {
    expect(espiarIntencion('ventas')).toBeNull();
    expect(recadoDelMostrador()).toBeNull();
  });

  it('mira los dos espacios de nombres, el del cobro y el del cajón', () => {
    // `ventas:` lo consume el punto de venta y `caja:` el cajon. El nombre dice
    // QUIEN lo consume, no de que menu salio.
    ponerIntencion('caja:ingreso');
    expect(recadoDelMostrador()?.modulo).toBe('caja');
    olvidarIntencion();

    ponerIntencion('ventas:nueva');
    expect(recadoDelMostrador()?.modulo).toBe('ventas');
  });
});

describe('cambiar de pestaña no tira el trabajo a medias', () => {
  it('las cuatro del cobro las pinta el MISMO componente', () => {
    /**
     * Es lo que sostiene el carrito. Si cada pestaña montara su propio punto de
     * venta, pasar a "Ventas del día" para consultar algo y volver dejaria el
     * carrito vacio — y cobrar es justo lo que no puede perder su estado.
     *
     * Por eso la llave del cuerpo es `de` y no la pestaña.
     */
    const delCobro = PESTANAS_DEL_MOSTRADOR.filter((p) => p.de === 'venta');
    expect(delCobro).toHaveLength(4);
    expect(new Set(delCobro.map((p) => p.de)).size).toBe(1);
  });

  it('cada pestaña del cobro se traduce a una seccion distinta del punto de venta', () => {
    const dentro = PESTANAS_DEL_MOSTRADOR.filter((p) => p.de === 'venta').map((p) => p.dentro);
    expect(dentro).toEqual(['nueva', 'dia', 'historial', 'cotizaciones']);
    // Sin repetidos: dos pestañas que enseñan lo mismo son una de mas.
    expect(new Set(dentro).size).toBe(dentro.length);
  });

  it('ninguna pestaña se repite ni se queda sin quien la pinte', () => {
    const claves = PESTANAS_DEL_MOSTRADOR.map((p) => p.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const p of PESTANAS_DEL_MOSTRADOR) {
      expect(['venta', 'cajon'], `${p.clave} no tiene quien la pinte`).toContain(p.de);
    }
  });
});
