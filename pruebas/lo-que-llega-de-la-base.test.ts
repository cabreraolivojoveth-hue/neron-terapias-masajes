/**
 * LA FRONTERA DE LECTURA.
 *
 * Estas pruebas existen por un fallo que salio a produccion: la pantalla de
 * Gastos entera dejo de mostrarse porque `resumen_de_gastos` devolvia el
 * promedio diario como `67222.58066516129` —dividir un `numeric` da
 * decimales— y ninguna de las once fronteras de lectura del producto lo
 * redondeaba. Al pintarlo, la guardia de dinero de la base reventaba.
 *
 * Con el centro vacio la division daba cero clavado y no se veia. Por eso las
 * pruebas de aqui usan numeros feos a proposito.
 */

import { describe, expect, it } from 'vitest';
import { formatearDinero } from '../src/datos/moneda.js';
import {
  centavos,
  centavosONulos,
  lista,
  numero,
  numeroONulo,
  objeto,
  opcional,
  texto,
} from '../src/datos/lo-que-llega-de-la-base.js';

describe('centavos: el dinero entra entero o no entra', () => {
  it('redondea el decimal que tumbo la pantalla de Gastos', () => {
    expect(centavos(67222.58066516129)).toBe(67223);
  });

  it('lo que redondea SE PUEDE PINTAR — que es el punto entero', () => {
    // Sin la frontera, esta misma llamada lanzaba `ErrorDeDinero` y el modulo
    // se caia con "Esta pantalla no se pudo mostrar".
    expect(() => formatearDinero(centavos(67222.58066516129))).not.toThrow();
  });

  it('un entero no se toca', () => {
    expect(centavos(85000)).toBe(85000);
    expect(centavos(0)).toBe(0);
  });

  it('acepta el numero entre comillas que a veces manda PostgREST', () => {
    expect(centavos('1234')).toBe(1234);
    expect(centavos('1234.5')).toBe(1235);
  });

  it('el negativo redondea hacia el mismo lado que la base', () => {
    // `round()` de Postgres redondea el .5 alejandose del cero; Math.round lo
    // hace hacia arriba. Se comprueba el caso que de verdad llega —una
    // diferencia de corte— y no el empate exacto, que no ocurre con dinero.
    expect(centavos(-150.4)).toBe(-150);
    expect(centavos(-150.6)).toBe(-151);
  });

  it('lo que no es numero cae en cero y NO en NaN', () => {
    // Un NaN no revienta: se suma, se formatea y termina impreso como "$NaN".
    expect(centavos(undefined)).toBe(0);
    expect(centavos('nada')).toBe(0);
    expect(centavos(Infinity)).toBe(0);
  });
});

describe('centavosONulos: no existir no es cero', () => {
  it('un corte sin contar todavia se queda en nulo', () => {
    expect(centavosONulos(null)).toBeNull();
    expect(centavosONulos(undefined)).toBeNull();
  });

  it('y cuando existe, redondea igual', () => {
    expect(centavosONulos(99.7)).toBe(100);
  });
});

describe('numero: para cantidades y conteos, no para dinero', () => {
  it('conserva el decimal — una cantidad SI puede tener fraccion', () => {
    // `venta_item.cantidad` es `numeric(12,3)`: medio litro de aceite es 0.5.
    expect(numero(0.5)).toBe(0.5);
  });

  it('NaN nunca sale de aqui', () => {
    expect(numero('x')).toBe(0);
    expect(numero(null)).toBe(0);
  });

  it('numeroONulo distingue el cero real del hueco', () => {
    expect(numeroONulo(0)).toBe(0);
    expect(numeroONulo(null)).toBeNull();
  });
});

describe('texto, opcional, lista y objeto', () => {
  it('un nulo se lee como cadena vacia, no como "null"', () => {
    expect(texto(null)).toBe('');
    expect(texto(undefined)).toBe('');
    expect(texto(12)).toBe('12');
  });

  it('opcional trata la cadena vacia como faltar', () => {
    expect(opcional('')).toBeNull();
    expect(opcional('  ')).toBe('  ');
    expect(opcional('hola')).toBe('hola');
  });

  it('lista devuelve un arreglo aunque llegue cualquier cosa', () => {
    expect(lista(null)).toEqual([]);
    expect(lista({})).toEqual([]);
    expect(lista([1, 2])).toEqual([1, 2]);
  });

  it('objeto devuelve nulo cuando no hay objeto', () => {
    expect(objeto(null)).toBeNull();
    expect(objeto('x')).toBeNull();
    expect(objeto({ a: 1 })).toEqual({ a: 1 });
  });
});
