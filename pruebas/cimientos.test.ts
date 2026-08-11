/**
 * LOS CIMIENTOS VISUALES.
 *
 * Lo que se vigila aqui no es que el CSS "se vea bien" —eso lo dicen las
 * capturas— sino las reglas que, rotas, no las cacha nadie: un color a mano
 * que se salta la prueba de contraste, o un token que alguien pisa y de paso
 * despinta los formularios de la base.
 */

import { describe, expect, it } from 'vitest';
import { cimientos } from '../src/estilo/cimientos.js';

const css = cimientos();

describe('ni un color escrito a mano', () => {
  it('nada de hex ni de rgb', () => {
    // Los colores del producto viven en marca.ts y pasan la prueba de
    // contraste. Uno suelto no la pasa, y ademas rompe el tema oscuro sin que
    // nadie lo note hasta que alguien lo usa.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });

  it('todo color sale de una variable o se mezcla desde una', () => {
    const declaraciones = css.match(/(?:^|\s)(?:color|background|border-color):[^;]+;/g) ?? [];
    expect(declaraciones.length).toBeGreaterThan(3);
    for (const d of declaraciones) {
      const valor = d.slice(d.indexOf(':') + 1, -1).trim().toLowerCase();
      if (['transparent', 'inherit', 'currentcolor', 'none'].includes(valor)) continue;
      expect(d, `no sale de un token: ${d.trim()}`).toContain('var(--');
    }
  });
});

describe('los tokens del Centro NO pisan los de la base', () => {
  it('se declaran con su propio prefijo', () => {
    // Pisar `--neron-borde` despintaria tambien los campos de la base, y de
    // pronto los formularios se verian sin marco sin que nadie entienda por que.
    const declarados = [...css.matchAll(/^\s*(--[a-z-]+):/gm)].map((m) => m[1]!);
    expect(declarados.length).toBeGreaterThan(5);
    for (const d of declarados) {
      expect(d, `${d} pisaria un token de la base`).toMatch(/^--centro-/);
    }
  });

  it('estan los tres radios, las dos sombras y el ancho de la barra', () => {
    for (const t of [
      '--centro-radio-pastilla', '--centro-radio-control', '--centro-radio-tarjeta',
      '--centro-sombra', '--centro-sombra-alta', '--centro-lateral',
      '--centro-borde-tarjeta', '--centro-borde-tenue',
    ]) {
      expect(css, `falta ${t}`).toContain(`${t}:`);
    }
  });
});

describe('lo que evita que la pantalla se rompa', () => {
  it('la aplicacion NUNCA tiene scroll horizontal', () => {
    // Es de las cosas que mas se sienten rotas en el celular: la pagina se
    // corre de lado y el menu queda a medias.
    expect(css).toMatch(/body\s*\{[^}]*overflow-x: hidden/s);
  });

  it('los titulos largos parten en lugar de salirse de la caja', () => {
    expect(css).toContain('overflow-wrap: anywhere');
  });

  it('un nombre largo se recorta con puntos, no estira la columna', () => {
    expect(css).toContain('text-overflow: ellipsis');
  });
});

describe('la tipografia de pantalla vive en un solo lugar', () => {
  it('hay una clase por trabajo, y no cuatro tamaños de titulo sueltos', () => {
    // En la primera version cada modulo escogia el suyo y acabaron conviviendo
    // cuatro tamaños de titulo de tarjeta en la misma pantalla.
    for (const c of ['.tt-pagina', '.tt-lema', '.tt-tarjeta', '.tt-dato', '.tt-etiqueta']) {
      expect(css, `falta ${c}`).toContain(c);
    }
  });

  it('las cifras van con numeros de ancho fijo', () => {
    // Sin esto, un total que cambia de 999 a 1000 mueve la columna entera.
    expect(css).toMatch(/\.tt-dato\s*\{[^}]*font-variant-numeric/s);
  });
});

describe('crecer es cosa del sitio, no del texto', () => {
  it('el titulo de tarjeta NO crece por su cuenta', () => {
    /*
     * La trampa mas cara del repaso visual. Con "flex: 1" el titulo empujaba
     * el "Ver todos" a la derecha dentro de la cabecera —que es una fila— pero
     * dentro de una tarjeta —que es una columna— crecia a lo ALTO: el titulo
     * de "Ultimas ventas del dia" medía ciento sesenta y dos pixeles y hundia
     * la lista hasta el fondo de la tarjeta.
     *
     * Crecer se declara donde hace falta (.pz-cabecera .tt-tarjeta), no aqui.
     */
    const bloque = css.match(/\.tt-tarjeta\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(bloque).not.toBe('');
    expect(bloque).not.toMatch(/flex(-grow)?\s*:/);
  });

  it('ninguna clase de tipografia se pone a crecer', () => {
    // Un texto que crece dentro de una columna deja un hueco que nadie
    // relaciona con la hoja de estilos, y se acaba culpando al diseño.
    for (const bloque of css.match(/\.tt-[a-z-]+\s*\{[^}]*\}/gs) ?? []) {
      expect(bloque, `un .tt- no puede crecer solo: ${bloque}`).not.toMatch(/flex-grow\s*:\s*[1-9]/);
    }
  });
});
