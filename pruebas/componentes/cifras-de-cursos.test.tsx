/**
 * @vitest-environment happy-dom
 *
 * LAS CUATRO TARJETAS DE CURSOS.
 *
 * `null` es "todavia no llega" y se pinta con una raya; CERO es una respuesta
 * real. Enseñar un cero mientras carga hace que alguien capture un curso que
 * ya estaba.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CifrasDeCursos, cifrasDeCursos, textoDeLaCifra } from '../../src/cursos/cifras-de-cursos.js';
import type { ResumenDeCursos } from '../../src/datos/cursos.js';

afterEach(cleanup);

const VACIO: ResumenDeCursos = {
  total: 0, activos: 0, proximos: 0, alumnos: 0, ocupacionPromedio: null,
};

describe('el numero listo para leerse', () => {
  it('null se pinta con una raya, NUNCA con un cero', () => {
    expect(textoDeLaCifra(null)).toBe('—');
    expect(textoDeLaCifra(Number.NaN)).toBe('—');
  });

  it('el cero de verdad se pinta como cero', () => {
    expect(textoDeLaCifra(0)).toBe('0');
  });
});

describe('un centro sin un solo curso', () => {
  it('las cuatro tarjetas salen en cero, y ninguna dice NaN', () => {
    const cifras = cifrasDeCursos(VACIO);
    expect(cifras).toHaveLength(4);
    expect(cifras.map((c) => c.valor)).toEqual(['0', '0', '0', '0']);
    for (const c of cifras) {
      expect(c.pie).not.toContain('NaN');
      expect(c.pie).not.toContain('Infinity');
    }
  });

  it('el pie DICE por que no hay porcentaje en vez de imprimir NaN%', () => {
    expect(cifrasDeCursos(VACIO)[1]?.pie).toBe('Sin cursos en marcha');
    expect(cifrasDeCursos(VACIO)[3]?.pie).toBe('Sin inscripciones todavía');
  });

  it('en la pantalla no aparece ni un dato de la captura de referencia', () => {
    render(<CifrasDeCursos resumen={VACIO} />);
    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('NaN');
    expect(texto).not.toContain('undefined');
    // La captura trae 8, 6, 3 y 42. Ninguno puede salir en un centro nuevo.
    expect(texto).not.toContain('42');
    expect(texto).toContain('Total cursos');
  });
});

describe('mientras carga', () => {
  it('NO se enseña un cero: se dice que esta cargando', () => {
    const cifras = cifrasDeCursos(null);
    expect(cifras.every((c) => c.valor === '—')).toBe(true);
    expect(cifras.every((c) => c.cargando)).toBe(true);
    // El pie va vacio pero el hueco se reserva: sin el, la fila brinca.
    expect(cifras.every((c) => c.pie === '')).toBe(true);
  });

  it('el lector de pantalla se entera de que carga', () => {
    render(<CifrasDeCursos resumen={null} />);
    expect(screen.getAllByLabelText(/cargando/i).length).toBe(4);
  });
});

describe('con datos', () => {
  it('el porcentaje sale del total, no de contar filas', () => {
    const cifras = cifrasDeCursos({
      total: 8, activos: 6, proximos: 3, alumnos: 42, ocupacionPromedio: 70,
    });
    expect(cifras[0]?.valor).toBe('8');
    expect(cifras[1]?.pie).toBe('75% del total');
    expect(cifras[2]?.pie).toBe('En los próximos 30 días');
  });

  it('"alumnos inscritos" DICE que cuenta, no deja el numero suelto', () => {
    // "42" sin decir que cuenta deja a cada quien suponiendo una cosa distinta.
    const cifras = cifrasDeCursos({
      total: 8, activos: 6, proximos: 3, alumnos: 42, ocupacionPromedio: 70,
    });
    expect(cifras[3]?.pie).toBe('En cursos vigentes y próximos');
  });
});
