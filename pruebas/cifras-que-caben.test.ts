/**
 * LAS CIFRAS GRANDES TIENEN QUE CABER.
 *
 * El fallo que motivó esto: el centro de la dona de Reportes decía
 * "$44,575.00" y el texto se salía del anillo. No era problema de esa cifra
 * —bajarle dos puntos al tamaño lo tapaba— sino de que el tamaño estaba escrito
 * para UNA longitud. Por eso las pruebas de aquí no miran $44,575: miran lo que
 * el mismo centro va a facturar dentro de dos años.
 */

import { describe, expect, it } from 'vitest';
import { cifraCorta, claseDeCifra } from '../src/reportes/cifras-que-caben.js';

describe('claseDeCifra: el tamaño sale del largo del texto', () => {
  it('lo normal no lleva clase — no se toca lo que ya cabía', () => {
    expect(claseDeCifra('$0.00')).toBe('');
    expect(claseDeCifra('$1,200.00')).toBe('');
    expect(claseDeCifra('$99,999.00')).toBe('');
  });

  it('la que se salía del anillo baja un escalón', () => {
    // Diez caracteres justos siguen cabiendo; once ya no.
    expect(claseDeCifra('$100,000.00')).toBe('pz-cifra--larga');
    expect(claseDeCifra('$999,999.00')).toBe('pz-cifra--larga');
  });

  it('el millón baja dos', () => {
    expect(claseDeCifra('$1,500,000.00')).toBe('pz-cifra--muy-larga');
  });

  it('y una moneda sin signo propio —que se escribe con su código— también', () => {
    // `signoDe` devuelve "MXN " cuando la moneda no tiene símbolo conocido:
    // son tres caracteres más que un "$", y es el caso más largo del sistema.
    expect(claseDeCifra('MXN 1,500,000.00')).toBe('pz-cifra--muy-larga');
  });

  it('los miles de millones caben chicos, que es mejor que salirse', () => {
    expect(claseDeCifra('MXN 1,234,567,890.00')).toBe('pz-cifra--enorme');
  });

  it('una raya de "todavía no llega" no se encoge', () => {
    expect(claseDeCifra('—')).toBe('');
  });
});

describe('cifraCorta: solo para ejes y etiquetas apretadas', () => {
  it('recibe CENTAVOS, como todo el dinero del sistema', () => {
    // 150000 centavos son $1,500. No llega a diez mil, así que va entero.
    expect(cifraCorta(150000, '$')).toBe('$1,500');
  });

  it('a partir de diez mil se acorta con k', () => {
    expect(cifraCorta(1_200_000, '$')).toBe('$12 k');
  });

  it('el millón lleva un decimal solo si aporta', () => {
    // "1.0 M" se lee peor que "1 M" y ocupa dos caracteres más para nada.
    expect(cifraCorta(100_000_000, '$')).toBe('$1 M');
    expect(cifraCorta(123_000_000, '$')).toBe('$1.2 M');
  });

  it('el signo negativo va delante del símbolo, como se escribe de verdad', () => {
    expect(cifraCorta(-1_200_000, '$')).toBe('-$12 k');
  });

  it('el símbolo viene de fuera: la moneda la decide el centro', () => {
    expect(cifraCorta(100_000_000, '€')).toBe('€1 M');
  });
});
