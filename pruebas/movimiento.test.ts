/**
 * EL MOVIMIENTO.
 *
 * Lo que se vigila aqui es lo que hace daño de verdad: una animacion que no se
 * apaga para quien pide menos movimiento —que para algunas personas no es un
 * detalle bonito, es mareo— y una animacion larga, que se disfruta tres veces
 * y estorba las otras doscientas del dia.
 */

import { describe, expect, it } from 'vitest';
import { movimiento } from '../src/estilo/movimiento.js';

const css = movimiento();

describe('se apaga entero para quien lo pida', () => {
  it('hay un bloque de reducir movimiento', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('y apaga TODO de un golpe, no regla por regla', () => {
    // Apagarlas una por una garantiza que la proxima se olvide.
    const bloque = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    expect(bloque).toContain('*, *::before, *::after');
    expect(bloque).toContain('animation-duration');
    expect(bloque).toContain('transition-duration');
    expect(bloque).toContain('scroll-behavior: auto');
  });

  it('lo apaga con !important, o las reglas de arriba le ganan', () => {
    const bloque = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    expect(bloque.match(/!important/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

describe('rapido o no sirve', () => {
  it('ninguna animacion escrita a mano pasa de 900ms', () => {
    // Quien cobra en un mostrador no esta viendo una presentacion. El unico
    // valor alto es el brillo del esqueleto, que se repite mientras carga.
    const duraciones = [...css.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
    for (const d of duraciones) expect(d).toBeLessThanOrEqual(900);
  });

  it('el escalonado no deja al ultimo esperando eternamente', () => {
    const retrasos = [...css.matchAll(/animation-delay: (\d+)ms/g)].map((m) => Number(m[1]));
    expect(retrasos.length).toBeGreaterThan(4);
    expect(Math.max(...retrasos)).toBeLessThanOrEqual(300);
  });
});

describe('cada animacion que se usa existe', () => {
  it('no se referencia ningun fotograma que no este declarado', () => {
    // Una animacion con nombre mal escrito no revienta: simplemente no pasa
    // nada, y eso se descubre semanas despues.
    const declarados = new Set(
      [...css.matchAll(/@keyframes ([a-z-]+)/g)].map((m) => m[1]!),
    );
    const usados = [...css.matchAll(/animation: ([a-z-]+)/g)].map((m) => m[1]!);
    expect(usados.length).toBeGreaterThan(3);
    for (const u of usados) {
      expect(declarados.has(u), `se usa "${u}" y no esta declarado`).toBe(true);
    }
  });
});

describe('solo se levanta lo que se puede tocar', () => {
  it('el hover vive dentro de una consulta de puntero', () => {
    // En una tableta no hay puntero: sin esto, el "levantar" se queda pegado
    // despues de tocar y la tarjeta se ve rota.
    const i = css.indexOf('.mv-levanta:hover');
    const antes = css.slice(0, i);
    expect(antes.lastIndexOf('@media (hover: hover)')).toBeGreaterThan(
      antes.lastIndexOf('}\n\n/*'),
    );
  });
});

describe('ni un color escrito a mano', () => {
  it('nada de hex ni de rgb', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });
});
