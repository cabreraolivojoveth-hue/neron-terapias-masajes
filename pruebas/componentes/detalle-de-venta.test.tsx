/**
 * @vitest-environment happy-dom
 *
 * EL TICKET DE UNA VENTA, tal como se cobro.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DetalleDeVenta,
  sePuedeCancelar,
  utilidadDelRenglon,
} from '../../src/ventas/detalle-de-venta.js';
import type { FichaDeVenta } from '../../src/datos/ventas.js';

afterEach(cleanup);

const VENTA: FichaDeVenta = {
  id: 'v1', folio: 'V-00001', fecha: '15/07/2026', estado: 'cobrada',
  clienteId: null, cliente: null, clienteTelefono: null,
  vendedorId: null, vendedor: null,
  subtotalCentavos: 100000, descuentoCentavos: 0, impuestoCentavos: 0, totalCentavos: 100000,
  efectivoRecibidoCentavos: null, notas: null, canceladaMotivo: null,
  creadoEn: '2026-07-15T10:15:00Z', canceladaEn: null,
  items: [
    {
      id: 'i1', tipo: 'producto', descripcion: 'Concepto Uno', cantidad: 2,
      precioUnitario: 35000, descuento: 0, subtotal: 70000, costoUnitario: 18000,
    },
  ],
  pagos: [{ id: 'g1', metodo: 'efectivo', montoCentavos: 100000 }],
};

function pintar(extra: Partial<React.ComponentProps<typeof DetalleDeVenta>> = {}) {
  const props: React.ComponentProps<typeof DetalleDeVenta> = {
    venta: VENTA, cargando: false, error: null,
    permisos: { cobrar: true, verCostos: true },
    trabajando: false, errorDeOperacion: null,
    onCerrar: () => {}, onCancelar: () => {}, onVerCliente: () => {},
    ...extra,
  };
  return render(<DetalleDeVenta {...props} />);
}

describe('quien puede cancelar', () => {
  it('solo una venta COBRADA, y solo con permiso de cobrar', () => {
    expect(sePuedeCancelar(VENTA, { cobrar: true })).toBe(true);
    expect(sePuedeCancelar(VENTA, { cobrar: false })).toBe(false);
    expect(sePuedeCancelar({ ...VENTA, estado: 'cancelada' }, { cobrar: true })).toBe(false);
    expect(sePuedeCancelar(null, { cobrar: true })).toBe(false);
  });
});

describe('la utilidad', () => {
  it('sale del costo HISTORICO, no del de hoy', () => {
    // 700.00 vendido − 180.00 x 2 de costo = 340.00
    expect(utilidadDelRenglon(70000, 18000, 2)).toBe(34000);
  });

  it('sin permiso el costo llega nulo y NO se calcula una utilidad falsa', () => {
    expect(utilidadDelRenglon(70000, null, 2)).toBeNull();
  });
});

describe('sin venta abierta', () => {
  it('invita a abrir una, no se queda en blanco', () => {
    pintar({ venta: null });
    expect(screen.getByText(/abre una venta de la lista/i)).toBeTruthy();
  });
});

describe('el ticket', () => {
  it('enseña el precio de ESE dia, no el del catalogo de hoy', () => {
    pintar();
    // 350.00 unitario, 700.00 el renglon.
    expect(screen.getByText(/350\.00/)).toBeTruthy();
    expect(screen.getByText(/700\.00/)).toBeTruthy();
  });

  it('sin cliente dice que fue de mostrador', () => {
    pintar();
    expect(screen.getByText(/sin cliente/i)).toBeTruthy();
  });

  it('la utilidad solo sale a quien ve costos', () => {
    const { unmount } = pintar({ permisos: { cobrar: true, verCostos: true } });
    expect(screen.getByText(/utilidad/i)).toBeTruthy();
    unmount();
    pintar({
      permisos: { cobrar: true },
      venta: { ...VENTA, items: [{ ...VENTA.items[0]!, costoUnitario: null }] },
    });
    expect(screen.queryByText(/utilidad/i)).toBeNull();
  });

  it('el efectivo recibido explica que el cambio NO fue una salida', () => {
    pintar({ venta: { ...VENTA, efectivoRecibidoCentavos: 120000 } });
    expect(screen.getByText(/no se registró como salida/i)).toBeTruthy();
  });

  it('una venta sin pago lo DICE, no deja el hueco', () => {
    pintar({ venta: { ...VENTA, pagos: [] } });
    expect(screen.getByText('Sin pago registrado')).toBeTruthy();
  });
});

describe('una venta cancelada', () => {
  it('sigue en pantalla y explica que nada se borro', () => {
    pintar({
      venta: { ...VENTA, estado: 'cancelada', canceladaMotivo: 'Se arrepintió' },
    });
    expect(screen.getByText('Se arrepintió')).toBeTruthy();
    expect(screen.getByText(/movimiento contrario/i)).toBeTruthy();
  });

  it('ya no se puede volver a cancelar', () => {
    pintar({ venta: { ...VENTA, estado: 'cancelada' } });
    expect(screen.queryByRole('button', { name: /cancelar venta/i })).toBeNull();
  });
});

describe('cancelar', () => {
  it('pide confirmar, y dice EXACTAMENTE lo que va a pasar', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /cancelar venta/i }));
    expect(screen.getByText(/vuelven al inventario/i)).toBeTruthy();
    expect(screen.getByText(/egreso contrario/i)).toBeTruthy();
  });

  it('manda el motivo escrito', async () => {
    const motivos: string[] = [];
    pintar({ onCancelar: (m) => motivos.push(m) });
    await userEvent.click(screen.getByRole('button', { name: /cancelar venta/i }));
    await userEvent.type(screen.getByLabelText(/motivo/i), 'Producto dañado');
    await userEvent.click(screen.getByRole('button', { name: /^cancelar la venta$/i }));
    expect(motivos).toEqual(['Producto dañado']);
  });

  it('el error del servidor se pinta tal cual', () => {
    pintar({ errorDeOperacion: 'No tienes permiso para cancelar ventas.' });
    expect(screen.getByRole('alert').textContent).toContain('No tienes permiso');
  });
});

describe('cuando no carga', () => {
  it('el error lleva el mensaje del servidor', () => {
    pintar({ venta: null, error: 'permission denied' });
    expect(screen.getByRole('alert').textContent).toContain('permission denied');
  });

  it('cargando NO se ve igual que "no hay venta"', () => {
    pintar({ venta: null, cargando: true });
    expect(screen.queryByText(/abre una venta de la lista/i)).toBeNull();
  });
});

describe('el cliente', () => {
  it('con cliente, su nombre lleva a su expediente', async () => {
    const vistos: string[] = [];
    pintar({
      venta: { ...VENTA, clienteId: 'c1', cliente: 'Paciente Uno' },
      onVerCliente: (id) => vistos.push(id),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Paciente Uno' }));
    expect(vistos).toEqual(['c1']);
  });

  it('cerrar avisa', async () => {
    const cerrar = vi.fn();
    pintar({ onCerrar: cerrar });
    await userEvent.click(screen.getByLabelText(/cerrar la venta/i));
    expect(cerrar).toHaveBeenCalled();
  });
});
