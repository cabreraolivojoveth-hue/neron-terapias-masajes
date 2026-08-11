/**
 * LAS PIEZAS COMPARTIDAS.
 *
 * Este archivo existe por el error mas caro del proyecto: ocho modulos que se
 * escribieron cada uno su propia tarjeta, y ninguna acabo igual a la de al
 * lado. Lo que se vigila aqui es que las piezas SIGAN siendo una sola y que no
 * pierdan lo que las hace usables.
 */

import { describe, expect, it } from 'vitest';
import { piezas } from '../src/estilo/piezas.js';

const css = piezas();

/** El cuerpo de una regla, para poder mirarla entera. */
function regla(selector: string): string {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) return '';
  return css.slice(i, css.indexOf('}', i));
}

describe('ni un color escrito a mano', () => {
  it('nada de hex ni de rgb', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });
});

describe('estan las piezas del juego completo', () => {
  it('la tarjeta, la pastilla, la cifra, el renglon, la tabla y las pestañas', () => {
    for (const c of [
      '.pz-tarjeta', '.pz-pastilla', '.pz-cifra', '.pz-renglon',
      '.pz-tabla', '.pz-pestanas', '.pz-segmentos', '.pz-buscador',
      '.pz-vacio', '.pz-error', '.pz-cargando', '.pz-boton',
    ]) {
      expect(css, `falta ${c}`).toContain(c);
    }
  });
});

describe('la pastilla de estado', () => {
  it('cada variante lleva FONDO tintado y color, no solo color', () => {
    // Solo con color, quien no distingue el verde del ambar no distingue
    // "Confirmada" de "Pendiente". El fondo tintado es la segunda señal.
    const variantes = [...css.matchAll(/\.pz-pastilla--[a-z]+\s*\{([^}]*)\}/g)];
    expect(variantes.length).toBeGreaterThanOrEqual(5);
    for (const v of variantes) {
      expect(v[1], `esta variante no tinta el fondo: ${v[0]}`).toContain('background:');
      expect(v[1]).toContain('color:');
    }
  });

  it('NO lleva borde: el diseño la usa sin marco', () => {
    expect(regla('.pz-pastilla')).toContain('border: none');
  });
});

describe('la tarjeta de cifra', () => {
  it('el cuadro del icono es grande y solido, no un cuadrito desvaido', () => {
    // Es lo que separa las cuatro tarjetas de un vistazo. Chico, las cuatro se
    // leen como una sola lista.
    const icono = regla('.pz-cifra__icono');
    expect(icono).toContain('width: 48px');
    expect(icono).toContain('height: 48px');
  });

  it('cada familia pinta su cuadro con su tono', () => {
    // El espaciado del archivo esta alineado a mano, asi que se busca la
    // RELACION entre las dos clases, no un texto con un solo espacio.
    for (const familia of ['citas', 'ventas', 'productos', 'cursos', 'visitas']) {
      const tiene = new RegExp(`\\.pz-cifra--${familia}\\s+\\.pz-cifra__icono\\s*\\{[^}]*background:`);
      expect(tiene.test(css), `falta el tono de ${familia}`).toBe(true);
    }
  });

  it('el numero va con cifras de ancho fijo', () => {
    expect(regla('.pz-cifra__valor')).toContain('font-variant-numeric');
  });
});

describe('lo que se puede tocar dice donde esta el foco', () => {
  it('cada pieza interactiva tiene su :focus-visible', () => {
    // Sin esto, quien navega con teclado no sabe donde esta parado — y eso
    // deja el sistema inservible sin raton.
    for (const c of [
      '.pz-boton', '.pz-enlace', '.pz-renglon', '.pz-pestana',
      '.pz-segmento', '.pz-pagina', '.pz-icono-boton',
    ]) {
      expect(css, `${c} no marca el foco`).toContain(`${c}:focus-visible`);
    }
  });
});

describe('nada crece de mas', () => {
  it('las piezas que contienen texto declaran min-width cero', () => {
    // Sin `min-width: 0`, un correo largo dentro de una rejilla estira la
    // columna entera y saca scroll horizontal a toda la pagina.
    for (const c of ['.pz-tarjeta', '.pz-cabecera', '.pz-renglon', '.pz-cifra']) {
      expect(regla(c), `${c} deja que un texto largo lo estire`).toContain('min-width: 0');
    }
  });
});

describe('la tabla', () => {
  it('se desplaza dentro de su marco, no empujando la pagina', () => {
    expect(regla('.pz-tabla__marco')).toContain('overflow-x: auto');
  });

  it('las cifras van a la derecha y con ancho fijo', () => {
    expect(regla('.pz-tabla__numero')).toContain('text-align: right');
    expect(regla('.pz-tabla__numero')).toContain('font-variant-numeric');
  });
});

describe('la pestaña puesta', () => {
  it('lleva color Y subrayado', () => {
    // Solo con color, quien no distingue verde de gris no sabe cual escogio.
    expect(css).toContain('.pz-pestana--puesta');
    expect(css).toContain('.pz-pestana--puesta::after');
  });
});

describe('nada mide su ALTO con una medida pensada para el ancho', () => {
  it('el buscador no lleva un flex-basis en pixeles', () => {
    /*
     * Tenia "flex: 1 1 220px". En una barra de filtros —una fila— ese 220 es
     * el ancho de partida. En una columna es el ALTO: el buscador de cliente
     * de Ventas medía doscientos veinte pixeles con un campo de cuarenta y dos
     * flotando en medio, y era medio hueco del "espacio en blanco en ventas".
     */
    const bloque = css.match(/\.pz-buscador\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(bloque).not.toBe('');
    expect(bloque).not.toMatch(/flex\s*:[^;]*\d+px/);
    expect(bloque).not.toMatch(/flex-basis\s*:\s*\d+px/);
  });

  it('el titulo crece solo dentro de la cabecera, que es una fila', () => {
    expect(css).toMatch(/\.pz-cabecera\s+\.tt-tarjeta\s*\{[^}]*flex:\s*1/s);
  });

  it('el texto del encabezado no lleva un flex-basis en pixeles', () => {
    /*
     * LA TERCERA VEZ DE LA MISMA TRAMPA, y la mas visible de las tres.
     *
     * Tenia "flex: 1 1 240px" para repartirse el renglon con los botones. En
     * "pz-encabezado" —una fila— esos 240 son el ancho de partida. Pero Inicio
     * la usa suelta, hija de una COLUMNA, y ahi son el ALTO: el saludo medía
     * 240 pixeles con 64 de texto adentro y dejaba un hueco de 176 entre
     * "¡Buenos días!" y las cuatro cifras. No era aire: era sobra.
     */
    const bloque = css.match(/\.pz-encabezado__texto\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(bloque).not.toBe('');
    expect(bloque).not.toMatch(/flex\s*:[^;]*\d+px/);
    expect(bloque).not.toMatch(/flex-basis\s*:\s*\d+px/);
  });
});
