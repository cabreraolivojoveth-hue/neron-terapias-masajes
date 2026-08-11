/**
 * EL ESTILO DEL ARMAZON.
 *
 * Es lo que se ve en las ocho pantallas todo el tiempo, asi que un fallo aqui
 * se multiplica por ocho.
 */

import { describe, expect, it } from 'vitest';
import { armadura } from '../src/estilo/armadura.js';

const css = armadura();

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

describe('la barra lateral en el celular', () => {
  it('empieza fuera de pantalla y entra deslizando', () => {
    expect(regla('.arm-lateral')).toContain('transform: translateX(-100%)');
  });

  it('y en pantalla grande esta siempre puesta', () => {
    expect(css).toMatch(/@media \(min-width: 1024px\)[^}]*\{[^}]*\.arm-lateral \{ transform: none/s);
  });

  it('el velo que la acompaña desaparece en pantalla grande', () => {
    expect(css).toMatch(/\.arm-velo \{ display: none/);
  });

  it('el boton de hamburguesa tambien', () => {
    expect(css).toMatch(/\.arm-hamburguesa \{ display: none/);
  });
});

describe('el modulo activo', () => {
  it('lleva FONDO tintado y color, no solo color', () => {
    // Solo el color no alcanza cuando la pantalla se ve con sol encima, que es
    // como se ve la del mostrador.
    const activo = regla('.arm-enlace--activo');
    expect(activo).toContain('background:');
    expect(activo).toContain('color:');
  });

  it('y su icono se pinta tambien', () => {
    expect(css).toContain('.arm-enlace--activo .arm-enlace__icono');
  });
});

describe('el renglon del menu', () => {
  it('deja hueco fijo para el icono aunque el texto sea corto', () => {
    expect(regla('.arm-enlace__icono')).toContain('flex: none');
  });

  it('un nombre largo se recorta, no rompe la barra', () => {
    expect(regla('.arm-enlace__texto')).toContain('text-overflow: ellipsis');
  });

  it('marca el foco para quien navega con teclado', () => {
    expect(css).toContain('.arm-enlace:focus-visible');
  });
});

describe('el ancho de la barra sale de un solo lugar', () => {
  it('lo usan la barra y el contenido, no dos numeros sueltos', () => {
    // Dos numeros se desincronizan al primer ajuste y el contenido queda
    // debajo de la barra sin que se vea por que.
    expect(regla('.arm-lateral')).toContain('var(--centro-lateral)');
    expect(css).toMatch(/\.arm-principal \{ margin-left: var\(--centro-lateral\)/);
  });
});

describe('el salto al contenido', () => {
  it('existe y solo aparece con el foco', () => {
    // Sin el, quien navega con teclado pasa por los trece modulos antes de
    // llegar a lo que vino a ver, en cada pantalla.
    expect(css).toContain('.arm-saltar');
    expect(css).toContain('.arm-saltar:focus');
  });
});
