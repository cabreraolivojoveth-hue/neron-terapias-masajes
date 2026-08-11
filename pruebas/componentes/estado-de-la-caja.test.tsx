/**
 * @vitest-environment happy-dom
 *
 * EL PANEL DE LA DERECHA Y LAS CUATRO CIFRAS.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CifrasDeLaCaja,
  EstadoDeLaCaja,
  cuandoSeAbrio,
} from '../../src/caja/estado-de-la-caja.js';
import type { CajaAbierta } from '../../src/datos/caja.js';

afterEach(cleanup);

const CAJA: CajaAbierta = {
  id: 'c1', nombre: 'Caja 1', estado: 'abierta',
  saldoInicialCentavos: 200000,
  abiertaEn: '2026-07-10T08:30:00Z', abiertaPor: 'Quien abrio', observaciones: null,
  ingresosCentavos: 130000, egresosCentavos: 65000,
  efectivoEntroCentavos: 30000, efectivoSalioCentavos: 65000,
  efectivoEsperadoCentavos: 165000, movimientos: 4,
};

function pintar(extra: Partial<React.ComponentProps<typeof EstadoDeLaCaja>> = {}) {
  const props: React.ComponentProps<typeof EstadoDeLaCaja> = {
    caja: CAJA, puedeMover: true,
    onIngreso: () => {}, onRetiro: () => {}, onCerrarCaja: () => {}, onHistorial: () => {},
    ...extra,
  };
  return render(<EstadoDeLaCaja {...props} />);
}

describe('la hora de apertura', () => {
  it('sale legible', () => {
    expect(cuandoSeAbrio('2026-07-10T08:30:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  });

  it('una marca ilegible sale VACIA, nunca inventada', () => {
    expect(cuandoSeAbrio('mañana')).toBe('');
  });
});

describe('el resumen del turno', () => {
  it('las cifras del cajon SOLO hablan de efectivo, y cuadran entre si', () => {
    // 2000 inicial + 300 entró − 650 salió = 1650 en el cajón.
    pintar();
    expect(screen.getByText('Efectivo en el cajón')).toBeTruthy();
    expect(screen.getAllByText(/1,650\.00/).length).toBeGreaterThan(0);
  });

  it('lo cobrado por otras vias se enseña APARTE, con su explicacion', () => {
    // 1300 entraron, 300 en efectivo → 1000 por tarjeta/transferencia.
    pintar();
    expect(screen.getByText('Cobrado por otras vías')).toBeTruthy();
    expect(screen.getByText(/1,000\.00/)).toBeTruthy();
    expect(screen.getByText(/no están en el cajón/i)).toBeTruthy();
  });

  it('mientras la caja esta abierta NO hay diferencia que enseñar', () => {
    // Un cero ahi haria creer que ya cuadro, y nadie ha contado nada.
    pintar();
    expect(screen.getByText(/la diferencia aparece al cerrar/i)).toBeTruthy();
    expect(screen.queryByText('Diferencia')).toBeNull();
  });
});

describe('las acciones', () => {
  it('con permiso salen las tres y cerrar caja', async () => {
    const ingreso = vi.fn();
    const retiro = vi.fn();
    const cerrar = vi.fn();
    pintar({ onIngreso: ingreso, onRetiro: retiro, onCerrarCaja: cerrar });
    await userEvent.click(screen.getByRole('button', { name: /registrar ingreso/i }));
    await userEvent.click(screen.getByRole('button', { name: /registrar retiro/i }));
    await userEvent.click(screen.getByRole('button', { name: /cerrar caja/i }));
    expect(ingreso).toHaveBeenCalled();
    expect(retiro).toHaveBeenCalled();
    expect(cerrar).toHaveBeenCalled();
  });

  it('sin permiso NO se pinta un boton apagado: no se pinta', () => {
    // Un boton que nunca se va a poder usar es ruido, y de paso le cuenta a
    // quien no debe que esa funcion existe.
    pintar({ puedeMover: false });
    expect(screen.queryByRole('button', { name: /cerrar caja/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /registrar retiro/i })).toBeNull();
  });

  it('pero el resumen SI se ve sin permiso de mover', () => {
    pintar({ puedeMover: false });
    expect(screen.getByText('Resumen del turno')).toBeTruthy();
  });
});

describe('las cuatro cifras de arriba', () => {
  it('las cuatro hablan de efectivo y encajan entre si', () => {
    render(<CifrasDeLaCaja caja={CAJA} />);
    expect(screen.getByText('Saldo inicial')).toBeTruthy();
    expect(screen.getByText('Entró en efectivo')).toBeTruthy();
    expect(screen.getByText('Salió en efectivo')).toBeTruthy();
    expect(screen.getByText('Efectivo en el cajón')).toBeTruthy();
  });

  it('lo que salio lleva el signo escrito', () => {
    render(<CifrasDeLaCaja caja={CAJA} />);
    expect(screen.getByText(/^−.*650\.00/)).toBeTruthy();
  });

  it('una caja recien abierta enseña ceros de VERDAD', () => {
    render(
      <CifrasDeLaCaja
        caja={{
          ...CAJA, saldoInicialCentavos: 0, ingresosCentavos: 0, egresosCentavos: 0,
          efectivoEntroCentavos: 0, efectivoSalioCentavos: 0, efectivoEsperadoCentavos: 0,
        }}
      />,
    );
    expect(screen.getAllByText(/\$0\.00/).length).toBeGreaterThanOrEqual(3);
  });
});
