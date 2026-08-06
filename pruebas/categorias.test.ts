/**
 * LAS CATEGORIAS COMPARTIDAS.
 *
 * UNA SOLA TABLA para servicios y para cursos, separadas por `ambito`. Lo que
 * se prueba aqui es que esa separacion no se pierda en la memoria: si los dos
 * catalogos compartieran llave, abrir Cursos enseñaria las categorias de
 * Servicios.
 */
import { describe, expect, it } from 'vitest';
import { llaveDeCategorias } from '../src/datos/categorias.js';

describe('la llave de las categorias', () => {
  it('servicios y cursos NO comparten resultado', () => {
    expect(llaveDeCategorias('n1', 'servicio')).not.toBe(llaveDeCategorias('n1', 'curso'));
  });

  it('dos centros NUNCA comparten llave', () => {
    expect(llaveDeCategorias('n1', 'curso')).not.toBe(llaveDeCategorias('n2', 'curso'));
  });

  it('la misma pregunta produce la MISMA llave: un solo viaje', () => {
    expect(llaveDeCategorias('n1', 'curso')).toBe(llaveDeCategorias('n1', 'curso'));
  });

  it('empieza por el prefijo que las invalida en bloque', () => {
    expect(llaveDeCategorias('n1', 'servicio').startsWith('categorias')).toBe(true);
  });
});
