/**
 * @vitest-environment happy-dom
 *
 * EL COBRO: totales, metodos, pago mixto y cambio.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AplicarDescuento,
  BOTONES_DE_PAGO,
  Cobro,
  descuentoEscrito,
  porQueNoSePuedeCobrar,
  sePuedeCobrar,
} from '../../src/ventas/cobro.js';
import type { PagoDelCarrito, RenglonDelCarrito } from '../../src/datos/ventas.js';

afterEach(cleanup);

const RENGLON: RenglonDelCarrito = {
  tipo: 'producto', id: 'p1', nombre: 'Concepto Uno',
  precioCentavos: 100000, cantidad: 1, descuentoCentavos: 0, disponible: null,
};

function pintar(extra: Partial<React.ComponentProps<typeof Cobro>> = {}) {
  const props: React.ComponentProps<typeof Cobro> = {
    renglones: [], descuentoCentavos: 0, pagos: [], metodoPuesto: '',
    efectivoRecibido: '',
    // Lo que manda Configuracion. Por omision, todo aceptado y sin impuesto:
    // es lo que ve un centro que todavia no lo configuro.
    metodosAceptados: ['efectivo', 'tarjeta', 'transferencia', 'otro'],
    impuestoNombre: 'IVA',
    impuestoTasa: 0,
    impuestoIncluido: true, trabajando: false, error: null,
    onMetodo: () => {}, onAgregarPago: () => {}, onMontoDelPago: () => {},
    onQuitarPago: () => {}, onEfectivoRecibido: () => {},
    onCobrar: () => {}, onCotizar: () => {}, onIrACaja: () => {},
    ...extra,
  };
  return render(<Cobro {...props} />);
}

describe('cuando se puede cobrar', () => {
  const pago = (m: number): PagoDelCarrito[] => [{ metodo: 'efectivo', montoCentavos: m }];

  it('sin renglones, no', () => {
    expect(sePuedeCobrar([], 0, pago(0))).toBe(false);
    expect(porQueNoSePuedeCobrar([], 0, [])).toBe('Agrega algo a la venta.');
  });

  it('con los pagos exactos, si', () => {
    expect(sePuedeCobrar([RENGLON], 0, pago(100000))).toBe(true);
  });

  it('si falta o si se pasa, NO — y se dice cuanto', () => {
    expect(sePuedeCobrar([RENGLON], 0, pago(60000))).toBe(false);
    expect(porQueNoSePuedeCobrar([RENGLON], 0, pago(60000))).toContain('400');
    expect(sePuedeCobrar([RENGLON], 0, pago(120000))).toBe(false);
    expect(porQueNoSePuedeCobrar([RENGLON], 0, pago(120000))).toContain('200');
  });

  it('un total en cero por descuentos NO se cobra, y se explica', () => {
    expect(sePuedeCobrar([RENGLON], 100000, [])).toBe(false);
    expect(porQueNoSePuedeCobrar([RENGLON], 100000, [])).toContain('descuentos');
  });

  it('un pago mixto de dos renglones cuadra igual que uno solo', () => {
    const dos: PagoDelCarrito[] = [
      { metodo: 'efectivo', montoCentavos: 40000 },
      { metodo: 'tarjeta', montoCentavos: 60000 },
    ];
    expect(sePuedeCobrar([RENGLON], 0, dos)).toBe(true);
  });
});

describe('el descuento escrito', () => {
  it('en pesos son centavos', () => {
    expect(descuentoEscrito('250', false, 500000)).toBe(25000);
  });

  it('en porcentaje se calcula UNA vez sobre el subtotal', () => {
    expect(descuentoEscrito('10', true, 500000)).toBe(50000);
  });

  it('nunca pasa del subtotal, ni escribiendo una barbaridad', () => {
    expect(descuentoEscrito('99999', false, 500000)).toBe(500000);
  });

  it('vacio no descuenta nada', () => {
    expect(descuentoEscrito('', false, 500000)).toBe(0);
  });
});

describe('los cuatro botones de la foto', () => {
  it('Mixto esta, pero NO es un metodo que se guarde', () => {
    expect(BOTONES_DE_PAGO.map((b) => b.etiqueta)).toEqual([
      'Efectivo', 'Tarjeta', 'Transferencia', 'Mixto',
    ]);
  });

  it('escoger uno avisa con su clave', async () => {
    const escogidos: string[] = [];
    pintar({ renglones: [RENGLON], onMetodo: (c) => escogidos.push(c) });
    await userEvent.click(screen.getByRole('button', { name: /Tarjeta/ }));
    expect(escogidos).toEqual(['tarjeta']);
  });

  it('el reparto SOLO sale con Mixto, no estorba en una venta simple', () => {
    const { unmount } = pintar({ renglones: [RENGLON], metodoPuesto: 'efectivo' });
    expect(screen.queryByLabelText(/agregar forma de pago/i)).toBeNull();
    unmount();
    pintar({ renglones: [RENGLON], metodoPuesto: 'mixto' });
    expect(screen.getByLabelText(/agregar forma de pago/i)).toBeTruthy();
  });
});

describe('el resumen', () => {
  it('los impuestos salen en CERO y se dice cual se aplico', () => {
    // No se inventan: el dia que Configuracion los declare, salen de ahi.
    pintar({ renglones: [RENGLON] });
    expect(screen.getByText('IVA (0%)')).toBeTruthy();
  });

  it('el descuento se pinta con el signo delante, no solo con color', () => {
    pintar({ renglones: [RENGLON], descuentoCentavos: 25000 });
    expect(screen.getByText(/−.*250/)).toBeTruthy();
  });

  it('el total a pagar sale aparte, que es lo que se dice en voz alta', () => {
    pintar({ renglones: [RENGLON], descuentoCentavos: 25000 });
    expect(screen.getByText('Total a pagar')).toBeTruthy();
  });
});

describe('el cambio', () => {
  it('se calcula sobre el EFECTIVO, no sobre el total de la venta', () => {
    // En un pago mixto, el cambio sale de lo que se dio en efectivo: si se
    // calculara sobre el total, se devolveria dinero que nunca entro.
    pintar({
      renglones: [RENGLON],
      pagos: [
        { metodo: 'efectivo', montoCentavos: 40000 },
        { metodo: 'tarjeta', montoCentavos: 60000 },
      ],
      efectivoRecibido: '500',
    });
    // Recibio 500.00 y se aplicaron 400.00 en efectivo: cambio 100.00.
    expect(screen.getByText(/^\$?\s?100\.00/)).toBeTruthy();
  });

  it('DICE que el cambio no es una salida de caja', () => {
    pintar({
      renglones: [RENGLON],
      pagos: [{ metodo: 'efectivo', montoCentavos: 100000 }],
      efectivoRecibido: '1200',
    });
    expect(screen.getByText(/no se registra como salida/i)).toBeTruthy();
  });

  it('sin efectivo no se pregunta por lo recibido', () => {
    pintar({ renglones: [RENGLON], pagos: [{ metodo: 'tarjeta', montoCentavos: 100000 }] });
    expect(screen.queryByLabelText(/efectivo recibido/i)).toBeNull();
  });
});

describe('finalizar', () => {
  it('esta apagado mientras no cuadre', () => {
    pintar({ renglones: [RENGLON], pagos: [{ metodo: 'efectivo', montoCentavos: 1 }] });
    const boton = screen.getByRole('button', { name: /finalizar venta/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });

  it('mientras procesa dice Procesando y no se puede volver a apretar', () => {
    pintar({
      renglones: [RENGLON],
      pagos: [{ metodo: 'efectivo', montoCentavos: 100000 }],
      trabajando: true,
    });
    const boton = screen.getByRole('button', { name: /procesando/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });

  it('cotizar se puede sin haber pagado nada', async () => {
    const cotizar = vi.fn();
    pintar({ renglones: [RENGLON], onCotizar: cotizar });
    await userEvent.click(screen.getByRole('button', { name: /guardar como cotización/i }));
    expect(cotizar).toHaveBeenCalled();
  });

  it('el error del servidor se pinta tal cual', () => {
    pintar({ renglones: [RENGLON], error: 'Solo quedan 3 de Aceite: no se pueden sacar 5.' });
    expect(screen.getByRole('alert').textContent).toContain('Solo quedan 3');
  });

  it('si lo que falta es la CAJA, se ofrece ir a abrirla', async () => {
    // Dejar a quien cobra releyendo el error, con el cliente enfrente, es el
    // peor momento para tener que adivinar a donde ir.
    const irACaja = vi.fn();
    pintar({
      renglones: [RENGLON],
      error: 'No hay una caja abierta: no se puede cobrar en efectivo.',
      onIrACaja: irACaja,
    });
    await userEvent.click(screen.getByRole('button', { name: /ir a caja/i }));
    expect(irACaja).toHaveBeenCalled();
  });

  it('con cualquier otro error NO aparece ese boton', () => {
    pintar({ renglones: [RENGLON], error: 'Solo quedan 3 de Aceite.' });
    expect(screen.queryByRole('button', { name: /ir a caja/i })).toBeNull();
  });
});

describe('aplicar descuento', () => {
  function pintarDescuento(extra: Partial<React.ComponentProps<typeof AplicarDescuento>> = {}) {
    const props: React.ComponentProps<typeof AplicarDescuento> = {
      escrito: '', comoPorcentaje: false, subtotalCentavos: 500000, puede: true,
      onEscrito: () => {}, onComoPorcentaje: () => {}, onAplicar: () => {},
      ...extra,
    };
    return render(<AplicarDescuento {...props} />);
  }

  it('sin permiso NO se esconde el panel: se dice por que', () => {
    // Un panel que desaparece hace pensar que el sistema esta incompleto.
    pintarDescuento({ puede: false });
    expect(screen.getByText(/tu rol no aplica descuentos/i)).toBeTruthy();
  });

  it('el signo cambia con la unidad', () => {
    const { unmount } = pintarDescuento({ comoPorcentaje: true });
    expect(screen.getByText('%')).toBeTruthy();
    unmount();
    pintarDescuento({ comoPorcentaje: false });
    expect(screen.getByText('$')).toBeTruthy();
  });

  it('aplica en centavos, no en pesos', async () => {
    const aplicados: number[] = [];
    pintarDescuento({ escrito: '250', onAplicar: (c) => aplicados.push(c) });
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(aplicados).toEqual([25000]);
  });

  it('sin nada escrito el boton esta apagado', () => {
    pintarDescuento({ escrito: '' });
    expect((screen.getByRole('button', { name: 'Aplicar' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});
