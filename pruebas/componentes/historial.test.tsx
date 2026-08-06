/**
 * @vitest-environment happy-dom
 *
 * EL HISTORIAL DE VENTAS Y LAS COTIZACIONES.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMO_SE_DICE_LA_COTIZACION,
  COMO_SE_DICE_LA_VENTA,
  Cotizaciones,
  Historial,
  comoSeLeenLosMetodos,
} from '../../src/ventas/historial.js';
import type { CotizacionEnLista, VentaEnLista } from '../../src/datos/ventas.js';

afterEach(cleanup);

const VENTA: VentaEnLista = {
  id: 'v1', folio: 'V-00001', fecha: '15/07/2026',
  clienteId: null, cliente: null, vendedor: null,
  renglones: 2, subtotalCentavos: 100000, descuentoCentavos: 0, totalCentavos: 100000,
  metodos: 'efectivo, tarjeta', estado: 'cobrada', creadoEn: '2026-07-15T10:15:00Z',
};

const COTIZACION: CotizacionEnLista = {
  id: 'c1', folio: 'C-00001', fecha: '15/07/2026', vence: null,
  clienteId: null, cliente: null, vendedor: null,
  totalCentavos: 105000, estado: 'abierta', ventaId: null, renglones: 1,
};

function pintar(extra: Partial<React.ComponentProps<typeof Historial>> = {}) {
  const props: React.ComponentProps<typeof Historial> = {
    ventas: [], total: 0, pagina: 1, porPagina: 10,
    busqueda: '', estado: '', seleccionada: null,
    cargando: false, error: null, vacioTexto: 'Todavía no hay ventas.',
    onBuscar: () => {}, onEstado: () => {}, onPagina: () => {},
    onAbrir: () => {}, onReintentar: () => {},
    ...extra,
  };
  return render(<Historial {...props} />);
}

describe('los metodos de pago', () => {
  it('un pago mixto se lee entero, que es lo que hace falta al cuadrar el cajon', () => {
    expect(comoSeLeenLosMetodos('efectivo, tarjeta')).toBe('Efectivo + Tarjeta');
  });

  it('sin pago se DICE, no se deja en blanco', () => {
    expect(comoSeLeenLosMetodos(null)).toBe('Sin pago registrado');
  });

  it('un metodo que no conocemos se enseña tal cual, no se traga', () => {
    expect(comoSeLeenLosMetodos('vale')).toBe('vale');
  });
});

describe('los estados', () => {
  it('una venta cobrada se lee "Completada"; una cancelada lo dice', () => {
    expect(COMO_SE_DICE_LA_VENTA['cobrada']).toBe('Completada');
    expect(COMO_SE_DICE_LA_VENTA['cancelada']).toBe('Cancelada');
  });

  it('una cotizacion convertida dice que ya hay una venta detras', () => {
    expect(COMO_SE_DICE_LA_COTIZACION['convertida']).toBe('Convertida en venta');
  });
});

describe('la lista vacia', () => {
  it('dice el texto que le toca a esa pestaña, no uno solo para las dos', () => {
    pintar({ vacioTexto: 'No hay ventas registradas hoy.' });
    expect(screen.getByText('No hay ventas registradas hoy.')).toBeTruthy();
  });

  it('cargando NO se ve igual que vacio', () => {
    // "No hay ventas" mientras carga es una lista que miente.
    pintar({ cargando: true });
    expect(screen.queryByText('Todavía no hay ventas.')).toBeNull();
  });
});

describe('la lista con ventas', () => {
  it('una venta sin cliente dice MOSTRADOR, no inventa uno', () => {
    pintar({ ventas: [VENTA], total: 1 });
    expect(screen.getByText('Mostrador')).toBeTruthy();
  });

  it('abrir avisa con el id de la venta', async () => {
    const abiertas: string[] = [];
    pintar({ ventas: [VENTA], total: 1, onAbrir: (id) => abiertas.push(id) });
    await userEvent.click(screen.getByRole('button', { name: /V-00001/ }));
    expect(abiertas).toEqual(['v1']);
  });

  it('la cancelada se queda en la lista, marcada', () => {
    // Borrarla seria reescribir la historia.
    pintar({ ventas: [{ ...VENTA, estado: 'cancelada' }], total: 1 });
    expect(screen.getByText('Cancelada')).toBeTruthy();
  });

  it('el error trae el mensaje del servidor y un boton para reintentar', async () => {
    const reintentar = vi.fn();
    pintar({ error: 'permission denied', onReintentar: reintentar });
    expect(screen.getByRole('alert').textContent).toContain('permission denied');
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(reintentar).toHaveBeenCalled();
  });
});

describe('las cotizaciones', () => {
  function pintarCot(extra: Partial<React.ComponentProps<typeof Cotizaciones>> = {}) {
    const props: React.ComponentProps<typeof Cotizaciones> = {
      cotizaciones: [], cargando: false, error: null,
      onConvertir: () => {}, onCancelar: () => {},
      ...extra,
    };
    return render(<Cotizaciones {...props} />);
  }

  it('vacio explica que una cotizacion NO mueve inventario ni caja', () => {
    pintarCot();
    expect(screen.getByText(/no mueve inventario ni caja/i)).toBeTruthy();
  });

  it('una abierta se puede convertir', async () => {
    const convertidas: string[] = [];
    pintarCot({ cotizaciones: [COTIZACION], onConvertir: (c) => convertidas.push(c.id) });
    await userEvent.click(screen.getByRole('button', { name: /convertir en venta/i }));
    expect(convertidas).toEqual(['c1']);
  });

  it('una YA convertida no se vuelve a convertir: cobraria dos veces', () => {
    pintarCot({ cotizaciones: [{ ...COTIZACION, estado: 'convertida' }] });
    expect(screen.queryByRole('button', { name: /convertir en venta/i })).toBeNull();
  });

  it('una cancelada tampoco', () => {
    pintarCot({ cotizaciones: [{ ...COTIZACION, estado: 'cancelada' }] });
    expect(screen.queryByRole('button', { name: /convertir en venta/i })).toBeNull();
  });
});
