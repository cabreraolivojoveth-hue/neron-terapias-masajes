/**
 * @vitest-environment happy-dom
 *
 * LAS CUATRO TARJETAS DEL CATALOGO.
 *
 * La distincion que se prueba: `null` es "todavia no llega" y se pinta con una
 * raya; CERO es una respuesta real. Enseñar un cero mientras carga hace que
 * alguien capture un servicio que ya estaba.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CifrasDeServicios, cifrasDeServicios, textoDelNumero } from '../../src/servicios/cifras-de-servicios.js';
import type { ResumenDeServicios } from '../../src/datos/servicios.js';

afterEach(cleanup);

const VACIO: ResumenDeServicios = { total: 0, activos: 0, inactivos: 0, duracionPromedio: null };

describe('el numero listo para leerse', () => {
  it('null se pinta con una raya, NUNCA con un cero', () => {
    expect(textoDelNumero(null)).toBe('—');
    expect(textoDelNumero(Number.NaN)).toBe('—');
  });

  it('el cero de verdad se pinta como cero', () => {
    expect(textoDelNumero(0)).toBe('0');
  });

  it('el sufijo solo se pega cuando hay numero', () => {
    expect(textoDelNumero(45, 'min')).toBe('45 min');
    expect(textoDelNumero(null, 'min')).toBe('—');
  });
});

describe('un centro sin un solo servicio', () => {
  it('las cuatro tarjetas salen en cero, y ninguna dice NaN', () => {
    const cifras = cifrasDeServicios(VACIO);
    expect(cifras).toHaveLength(4);
    expect(cifras.map((c) => c.valor)).toEqual(['0', '0', '0', '—']);
    for (const c of cifras) {
      expect(c.pie).not.toContain('NaN');
      expect(c.pie).not.toContain('Infinity');
    }
  });

  it('el pie DICE por que no hay porcentaje en vez de imprimir NaN%', () => {
    const cifras = cifrasDeServicios(VACIO);
    expect(cifras[1]?.pie).toBe('Sin servicios activos');
    expect(cifras[3]?.pie).toBe('Sin datos todavía');
  });

  it('en la pantalla no aparece ni un dato de la captura de referencia', () => {
    render(<CifrasDeServicios resumen={VACIO} />);
    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('NaN');
    expect(texto).not.toContain('undefined');
    expect(texto).toContain('Total servicios');
  });
});

describe('mientras carga', () => {
  it('NO se enseña un cero: se dice que esta cargando', () => {
    const cifras = cifrasDeServicios(null);
    expect(cifras.every((c) => c.valor === '—')).toBe(true);
    expect(cifras.every((c) => c.cargando)).toBe(true);
    // El pie va vacio pero el hueco se reserva: sin el, la fila brinca.
    expect(cifras.every((c) => c.pie === '')).toBe(true);
  });

  it('el lector de pantalla se entera de que carga', () => {
    render(<CifrasDeServicios resumen={null} />);
    expect(screen.getAllByLabelText(/cargando/i).length).toBe(4);
  });
});

describe('con datos', () => {
  it('el porcentaje sale del total, no de contar filas', () => {
    const cifras = cifrasDeServicios({ total: 12, activos: 9, inactivos: 3, duracionPromedio: 72 });
    expect(cifras[0]?.valor).toBe('12');
    expect(cifras[1]?.pie).toBe('75% del total');
    expect(cifras[2]?.pie).toBe('25% del total');
    expect(cifras[3]?.valor).toBe('72 min');
  });

  it('la duracion promedio se dice en minutos y de donde sale', () => {
    const cifras = cifrasDeServicios({ total: 2, activos: 2, inactivos: 0, duracionPromedio: 60 });
    expect(cifras[3]?.pie).toBe('De los servicios activos');
  });
});
