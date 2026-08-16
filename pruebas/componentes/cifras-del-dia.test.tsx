/**
 * @vitest-environment happy-dom
 *
 * LAS CIFRAS DEL DIA Y LAS ULTIMAS VENTAS.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EstadisticasDelDia,
  cifrasDelDia,
  horaDeLaVenta,
} from '../../src/ventas/cifras-del-dia.js';
import { RESUMEN_DE_VENTAS_VACIO, type VentaEnLista } from '../../src/datos/ventas.js';

afterEach(cleanup);

const VENTA: VentaEnLista = {
  id: 'v1', folio: 'V-00001', fecha: '15/07/2026',
  clienteId: null, cliente: null, vendedor: null,
  renglones: 1, subtotalCentavos: 100000, descuentoCentavos: 0, totalCentavos: 100000,
  metodos: 'efectivo', estado: 'cobrada', creadoEn: '2026-07-15T10:15:00Z',
};

describe('las cuatro cifras', () => {
  it('con la base vacia, TODAS en cero — y son ceros de verdad', () => {
    const cifras = cifrasDelDia(RESUMEN_DE_VENTAS_VACIO);
    expect(cifras.map((c) => c.valor)).toEqual(['0', '0', '0', '0']);
  });

  it('mientras carga sale una raya, NO un cero', () => {
    // Un cero mientras carga se lee como "no se vendio nada hoy".
    expect(cifrasDelDia(null).map((c) => c.valor)).toEqual(['—', '—', '—', '—']);
  });

  it('cada cifra DICE que cuenta: ventas son transacciones, productos son piezas', () => {
    const cifras = cifrasDelDia(RESUMEN_DE_VENTAS_VACIO);
    expect(cifras[0]?.queCuenta).toMatch(/transacciones/i);
    expect(cifras[2]?.queCuenta).toMatch(/piezas/i);
  });

  it('el orden es el del diseño', () => {
    expect(cifrasDelDia(null).map((c) => c.etiqueta)).toEqual([
      'Ventas', 'Servicios', 'Productos', 'Cursos',
    ]);
  });
});

describe('el ticket promedio', () => {
  it('sin ventas NO se pinta un cero: se explica cuando aparece', () => {
    render(<EstadisticasDelDia resumen={RESUMEN_DE_VENTAS_VACIO} onVerReporte={() => {}} />);
    expect(screen.getByText(/aparece cuando haya al menos una venta/i)).toBeTruthy();
  });

  it('con ventas se enseña, y se dice como se calcula', () => {
    render(
      <EstadisticasDelDia
        resumen={{ ...RESUMEN_DE_VENTAS_VACIO, ventas: 2, ticketPromedio: 68500 }}
        onVerReporte={() => {}}
      />,
    );
    expect(screen.getByText(/entre las ventas cobradas/i)).toBeTruthy();
  });

  it('el enlace lleva a Reportes', async () => {
    const ver = vi.fn();
    render(<EstadisticasDelDia resumen={null} onVerReporte={ver} />);
    await userEvent.click(screen.getByRole('button', { name: /ver reporte completo/i }));
    expect(ver).toHaveBeenCalled();
  });
});


describe('la hora de una venta', () => {
  it('sale en dos cifras y dos cifras', () => {
    expect(horaDeLaVenta('2026-07-15T10:15:00Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('una marca que no se entiende sale VACIA, nunca inventada', () => {
    expect(horaDeLaVenta('mañana')).toBe('');
    expect(horaDeLaVenta('')).toBe('');
  });
});
