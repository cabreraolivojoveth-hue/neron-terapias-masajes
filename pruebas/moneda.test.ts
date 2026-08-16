/**
 * LA MONEDA DEL CENTRO — la que escriben los 41 archivos que enseñan dinero.
 *
 * Lo que se vigila aqui es lo que no se ve en ninguna pantalla suelta: que
 * cambiar la moneda en Configuracion cambie de verdad como se escribe el dinero
 * en Ventas, Caja, Gastos, Reportes, Inicio, Productos, Servicios y Cursos — y
 * que los decimales NO redondeen nada guardado.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  MONEDA_POR_OMISION,
  formatearDinero,
  impuestoDe,
  laMoneda,
  olvidarLaMoneda,
  ponerLaMoneda,
  signoDe,
  suscribirALaMoneda,
} from '../src/datos/moneda.js';

afterEach(olvidarLaMoneda);

describe('mientras nadie la ha configurado', () => {
  it('escribe con el signo de siempre y dos decimales', () => {
    // Un importe sin signo durante el primer segundo se lee como un numero
    // suelto: "1,200.00" no dice si son pesos, horas o piezas.
    expect(formatearDinero(120000)).toBe('$1,200.00');
    expect(laMoneda()).toEqual(MONEDA_POR_OMISION);
  });
});

describe('cuando el centro configura otra', () => {
  it('cambia el signo en TODO lo que escribe dinero', () => {
    ponerLaMoneda('EUR', 2);
    expect(formatearDinero(120000)).toBe('€1,200.00');
  });

  it('una moneda sin signo conocido se escribe con su codigo', () => {
    /*
     * Es feo y es VERDAD. Ponerle un `$` a una moneda que no lo usa es peor:
     * quien lo lea va a creer que su centro cobra en dolares.
     */
    ponerLaMoneda('CHF', 2);
    expect(formatearDinero(120000)).toBe('CHF 1,200.00');
    expect(signoDe('chf')).toBe('CHF ');
  });

  it('sin decimales deja de enseñar los centavos, pero NO redondea el dato', () => {
    /*
     * Es la distincion importante: el dinero se guarda y se opera SIEMPRE en
     * centavos enteros. Esto solo decide como se escribe al final. Un centro
     * que cobra en pesos enteros no quiere ver ",00" en cada renglon, y eso no
     * puede costarle un centavo en ningun total.
     */
    ponerLaMoneda('MXN', 0);
    expect(formatearDinero(120050)).toBe('$1,200');
    expect(formatearDinero(99)).toBe('$0');
  });

  it('con tres decimales rellena, sin inventar cifras', () => {
    ponerLaMoneda('MXN', 3);
    expect(formatearDinero(120050)).toBe('$1,200.500');
  });

  it('el negativo va DELANTE del signo, como se escribe de verdad', () => {
    // `$-120.00` se lee como un error de la pantalla; `-$120.00` se lee como
    // un retiro.
    ponerLaMoneda('MXN', 2);
    expect(formatearDinero(-12000)).toBe('-$120.00');
  });

  it('se puede pedir sin signo, para las columnas de una tabla', () => {
    ponerLaMoneda('EUR', 2);
    expect(formatearDinero(12000, { conSimbolo: false })).toBe('120.00');
  });

  it('unos decimales imposibles caen a los de siempre', () => {
    // Lo que viene de la base no es confiable, ni aqui: nueve decimales
    // producirian importes ilegibles en las cuarenta pantallas.
    ponerLaMoneda('MXN', 9);
    expect(laMoneda().decimales).toBe(2);
  });

  it('avisa a quien se suscribio, y SOLO si de verdad cambio', () => {
    /*
     * Repintar la aplicacion entera cada vez que una consulta revalida —aunque
     * conteste lo mismo— es lo que hace que una pantalla parpadee sin motivo
     * aparente.
     */
    let veces = 0;
    const soltar = suscribirALaMoneda(() => { veces += 1; });
    ponerLaMoneda('EUR', 2);
    ponerLaMoneda('EUR', 2);
    ponerLaMoneda('EUR', 2);
    soltar();
    expect(veces).toBe(1);
  });
});

describe('al cambiar de cuenta', () => {
  it('la moneda del centro anterior NO se queda', () => {
    // Es la misma regla que la llave de reinicio del arbol de datos: restos del
    // negocio anterior en memoria son la peor clase de fuga, porque los numeros
    // se mezclan y la pantalla se ve perfectamente normal.
    ponerLaMoneda('EUR', 2);
    olvidarLaMoneda();
    expect(formatearDinero(120000)).toBe('$1,200.00');
  });
});

describe('el impuesto', () => {
  it('INCLUIDO se saca hacia atras: el total no se toca', () => {
    /*
     * Es la cuenta normal en México: el precio de la lista es el que se cobra.
     * De $1,160.00 con 16% dentro, el impuesto son $160.00 — no $185.60, que
     * es lo que sale si se suma encima por error.
     */
    expect(impuestoDe(116000, 16, true)).toBe(16000);
  });

  it('NO INCLUIDO se suma encima', () => {
    expect(impuestoDe(100000, 16, false)).toBe(16000);
  });

  it('sin tasa configurada es cero, no un error', () => {
    // Un centro que no cobra impuesto es lo normal, no un dato que falte.
    expect(impuestoDe(100000, 0, true)).toBe(0);
    expect(impuestoDe(100000, Number.NaN, true)).toBe(0);
  });

  it('devuelve centavos ENTEROS', () => {
    // Un decimal suelto aqui se propaga a un total con fracción de centavo, y
    // eso es exactamente lo que el sistema de dinero entero existe para evitar.
    const r = impuestoDe(33333, 16, true);
    expect(Number.isInteger(r)).toBe(true);
  });
});
