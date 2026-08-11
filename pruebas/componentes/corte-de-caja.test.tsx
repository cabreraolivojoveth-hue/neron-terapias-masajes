/**
 * @vitest-environment happy-dom
 *
 * EL CORTE: resumen, conteo y cierre.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CorteDeCaja, comoSeDiceLaDiferencia } from '../../src/caja/corte-de-caja.js';
import type { CajaAbierta } from '../../src/datos/caja.js';

afterEach(cleanup);

const CAJA: CajaAbierta = {
  id: 'c1', nombre: 'Caja 1', estado: 'abierta',
  saldoInicialCentavos: 200000,
  abiertaEn: '2026-07-10T08:30:00Z', abiertaPor: 'Quien abrio', observaciones: null,
  // 1300 en total, pero SOLO 300 en efectivo: el resto fue tarjeta.
  ingresosCentavos: 130000, egresosCentavos: 65000,
  efectivoEntroCentavos: 30000, efectivoSalioCentavos: 65000,
  efectivoEsperadoCentavos: 165000, movimientos: 4,
};

function pintar(extra: Partial<React.ComponentProps<typeof CorteDeCaja>> = {}) {
  const props: React.ComponentProps<typeof CorteDeCaja> = {
    abierto: true, caja: CAJA, trabajando: false, error: null,
    onCerrarCaja: () => {}, onCerrar: () => {},
    ...extra,
  };
  return render(<CorteDeCaja {...props} />);
}

/** Avanza del resumen al conteo y escribe una cantidad. */
async function contar(cuanto: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /contar el efectivo/i }));
  await userEvent.type(screen.getByLabelText(/efectivo contado/i), cuanto);
  await userEvent.click(screen.getByRole('button', { name: /ver la diferencia/i }));
}

describe('como se dice una diferencia', () => {
  it('sin diferencia se CELEBRA, no se calla', () => {
    expect(comoSeDiceLaDiferencia(0)).toBe('La caja cuadra.');
  });

  it('sobrar y faltar se dicen distinto, y con la cantidad', () => {
    expect(comoSeDiceLaDiferencia(5000)).toContain('Sobran');
    expect(comoSeDiceLaDiferencia(-5000)).toContain('Faltan');
    expect(comoSeDiceLaDiferencia(-5000)).toContain('50');
  });
});

describe('el resumen, antes de contar', () => {
  it('el esperado SOLO cuenta efectivo, no los 1300 que entraron', () => {
    // Si el esperado incluyera la tarjeta, el sistema pediria contar dinero
    // que esta en el banco.
    pintar();
    expect(screen.getByText('Efectivo esperado')).toBeTruthy();
    expect(screen.getByText(/1,650\.00/)).toBeTruthy();
  });

  it('y DICE que la tarjeta no se cuenta en el cajon', () => {
    pintar();
    expect(screen.getByText(/no se cuentan en el cajón/i)).toBeTruthy();
  });
});

describe('el conteo', () => {
  it('el esperado NO se enseña mientras se cuenta', async () => {
    // Ver la cifra objetivo antes de contar hace que se "encuentre" justo esa
    // cantidad, y entonces el conteo no comprueba nada.
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /contar el efectivo/i }));
    expect(screen.queryByText('Efectivo esperado')).toBeNull();
    expect(screen.getByText(/cuenta primero/i)).toBeTruthy();
  });

  it('sin escribir nada no se avanza', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /contar el efectivo/i }));
    expect((screen.getByRole('button', { name: /ver la diferencia/i }) as HTMLButtonElement)
      .disabled).toBe(true);
  });
});

describe('la diferencia', () => {
  it('un faltante se dice con palabras, no solo en rojo', async () => {
    pintar();
    await contar('1600');
    expect(screen.getByText('Faltan $50.00.')).toBeTruthy();
  });

  it('un sobrante tambien', async () => {
    pintar();
    await contar('1700');
    expect(screen.getByText('Sobran $50.00.')).toBeTruthy();
  });

  it('cuando cuadra, lo dice', async () => {
    pintar();
    await contar('1650');
    expect(screen.getByText('La caja cuadra.')).toBeTruthy();
  });

  it('avisa que despues de cerrar no se puede cobrar en efectivo', async () => {
    pintar();
    await contar('1650');
    expect(screen.getByText(/no se podrá cobrar en efectivo/i)).toBeTruthy();
  });

  it('cerrar manda lo CONTADO en centavos, no lo esperado', async () => {
    const cerrados: number[] = [];
    pintar({ onCerrarCaja: (c) => cerrados.push(c) });
    await contar('1600');
    await userEvent.click(screen.getByRole('button', { name: /cerrar la caja/i }));
    expect(cerrados).toEqual([160000]);
  });

  it('se puede volver atras a recontar', async () => {
    pintar();
    await contar('1600');
    await userEvent.click(screen.getByRole('button', { name: /atrás/i }));
    expect(screen.getByLabelText(/efectivo contado/i)).toBeTruthy();
  });

  it('el error del servidor se pinta tal cual', async () => {
    pintar({ error: 'Esa caja ya se cerro el 10/07/2026 21:00.' });
    await contar('1650');
    expect(screen.getByRole('alert').textContent).toContain('ya se cerro');
  });

  it('mientras cierra no se puede volver a apretar', async () => {
    const cerrar = vi.fn();
    pintar({ trabajando: true, onCerrarCaja: cerrar });
    await contar('1650');
    expect((screen.getByRole('button', { name: /cerrando/i }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});
