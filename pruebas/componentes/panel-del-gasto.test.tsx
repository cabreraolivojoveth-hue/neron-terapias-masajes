/**
 * @vitest-environment happy-dom
 *
 * EL DETALLE DE UN GASTO.
 *
 * Lo que se vigila: que diga EN QUE SE CONVIRTIO EN LA CAJA —que es lo que
 * mas se pregunta de un gasto— y que no ofrezca botones que no se pueden
 * apretar.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GastoEnLista } from '../../src/datos/gastos.js';
import { PanelDelGasto, horaDeCaptura } from '../../src/gastos/panel-del-gasto.js';

afterEach(cleanup);

function gasto(sobre: Partial<GastoEnLista> = {}): GastoEnLista {
  return {
    id: 'g1', fecha: '11/08/2026', concepto: 'Renta', detalle: null,
    montoCentavos: 1000000, metodo: 'efectivo', efectivoCentavos: 1000000,
    metodoResto: null, categoriaId: 'c1', categoria: 'Renta', categoriaColor: null,
    proveedorId: null, proveedor: null, referencia: null, notas: null,
    recurrenteId: null, frecuencia: 'unico', usuario: 'Quien administra',
    creadoEn: '2026-08-11T15:30:00Z', anulado: false, anuladoMotivo: null,
    sustituyeA: null, ...sobre,
  };
}

const ACCIONES = {
  puedeGestionar: true,
  onEditar: () => {}, onAnular: () => {}, onDuplicar: () => {},
  onVerProveedor: () => {}, onVerCaja: () => {}, onCerrar: () => {},
};

describe('sin nada escogido', () => {
  it('invita a tocar un gasto en vez de dejar una caja vacia', () => {
    render(<PanelDelGasto {...ACCIONES} gasto={null} />);
    expect(screen.getByText(/Toca un gasto para ver su ficha/)).toBeTruthy();
  });
});

describe('en que se convirtio en la caja', () => {
  it('el efectivo dice cuanto salio del cajon', () => {
    render(<PanelDelGasto {...ACCIONES} gasto={gasto()} />);
    expect(screen.getByText(/Salieron \$10,000\.00 del cajón/)).toBeTruthy();
  });

  it('la tarjeta explica POR QUE no bajo el cajon', () => {
    // Sin la explicacion parece que la caja se equivoco.
    render(
      <PanelDelGasto
        {...ACCIONES}
        gasto={gasto({ metodo: 'tarjeta', efectivoCentavos: 0 })}
      />,
    );
    expect(screen.getByText('No salió efectivo del cajón')).toBeTruthy();
    expect(screen.getByText(/es egreso del negocio, no del cajón/)).toBeTruthy();
  });

  it('el mixto dice cuanto en efectivo y con que el resto', () => {
    render(
      <PanelDelGasto
        {...ACCIONES}
        gasto={gasto({ metodo: 'mixto', efectivoCentavos: 300000, metodoResto: 'tarjeta' })}
      />,
    );
    expect(screen.getByText(/Salieron \$3,000\.00 del cajón/)).toBeTruthy();
    expect(screen.getByText(/el resto con tarjeta/)).toBeTruthy();
  });
});

describe('lo que se ofrece y lo que no', () => {
  it('un gasto anulado no se edita ni se vuelve a anular', () => {
    render(
      <PanelDelGasto {...ACCIONES} gasto={gasto({ anulado: true, anuladoMotivo: 'Error' })} />,
    );
    expect(screen.getByText('Este gasto está anulado.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Editar$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Anular$/ })).toBeNull();
  });

  it('quien no gestiona solo mira', () => {
    render(<PanelDelGasto {...ACCIONES} gasto={gasto()} puedeGestionar={false} />);
    expect(screen.queryByRole('button', { name: /^Editar$/ })).toBeNull();
  });

  it('sin proveedor no se ofrece "ver proveedor"', () => {
    // Un boton que lleva a ningun sitio promete algo que no existe.
    render(<PanelDelGasto {...ACCIONES} gasto={gasto()} />);
    expect(screen.queryByRole('button', { name: /ver proveedor/i })).toBeNull();
  });

  it('sin efectivo no se ofrece "ver el movimiento en Caja"', () => {
    render(
      <PanelDelGasto {...ACCIONES} gasto={gasto({ metodo: 'tarjeta', efectivoCentavos: 0 })} />,
    );
    expect(screen.queryByRole('button', { name: /movimiento en Caja/i })).toBeNull();
  });
});

describe('de donde vino', () => {
  it('un gasto generado por un recurrente lo dice', () => {
    // Uno que aparecio solo, sin que nadie lo capture, confunde hasta que se
    // explica.
    render(
      <PanelDelGasto
        {...ACCIONES}
        gasto={gasto({ recurrenteId: 'r1', frecuencia: 'mensual' })}
      />,
    );
    expect(screen.getByText(/Lo generó un gasto recurrente/)).toBeTruthy();
  });

  it('una correccion dice que hay un original anulado', () => {
    render(<PanelDelGasto {...ACCIONES} gasto={gasto({ sustituyeA: 'g0' })} />);
    expect(screen.getByText(/Corrige a un gasto anterior/)).toBeTruthy();
  });
});

describe('la hora de captura', () => {
  it('una marca ilegible no se convierte en una hora inventada', () => {
    expect(horaDeCaptura('cualquier cosa')).toBe('');
  });
});
