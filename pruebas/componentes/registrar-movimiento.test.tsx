/**
 * @vitest-environment happy-dom
 *
 * REGISTRAR UN INGRESO O UN RETIRO.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RegistrarMovimiento,
  porQueNoSePuedeGuardar,
} from '../../src/caja/registrar-movimiento.js';
import type { LoQueSeMueve } from '../../src/datos/caja.js';

afterEach(cleanup);

describe('lo que impide guardar', () => {
  it('un monto en cero, o negativo', () => {
    expect(porQueNoSePuedeGuardar('ingreso', 0, 'Algo', 'efectivo', 100000)).toContain('cero');
  });

  it('sin concepto — y explica POR QUE hace falta', () => {
    expect(porQueNoSePuedeGuardar('ingreso', 1000, '  ', 'efectivo', 100000))
      .toContain('seis meses');
  });

  it('RETIRAR MAS EFECTIVO DEL QUE HAY, con las dos cifras en el mensaje', () => {
    // Un cajon en negativo es la prueba de que el sistema dejo sacar lo que no
    // estaba. Y avisar sin decir cuanto hay obliga a adivinar.
    const m = porQueNoSePuedeGuardar('egreso', 200000, 'Retiro', 'efectivo', 165000);
    expect(m).toContain('1,650.00');
    expect(m).toContain('2,000.00');
  });

  it('pero un retiro por TRANSFERENCIA no mira el efectivo del cajon', () => {
    // Ese dinero no sale del cajon: sale del banco.
    expect(porQueNoSePuedeGuardar('egreso', 200000, 'Retiro', 'transferencia', 165000)).toBe('');
  });

  it('un retiro que cabe si se puede', () => {
    expect(porQueNoSePuedeGuardar('egreso', 65000, 'Material', 'efectivo', 165000)).toBe('');
  });

  it('un INGRESO nunca mira el efectivo disponible', () => {
    expect(porQueNoSePuedeGuardar('ingreso', 999999, 'Fondo', 'efectivo', 0)).toBe('');
  });
});

function pintar(extra: Partial<React.ComponentProps<typeof RegistrarMovimiento>> = {}) {
  const props: React.ComponentProps<typeof RegistrarMovimiento> = {
    abierto: true, tipo: 'ingreso', efectivoDisponible: 165000, quien: 'Quien cobra',
    trabajando: false, error: null, onGuardar: () => {}, onCerrar: () => {},
    ...extra,
  };
  return render(<RegistrarMovimiento {...props} />);
}

describe('el formulario', () => {
  it('un retiro se llama retiro, y pide MOTIVO, no concepto', () => {
    pintar({ tipo: 'egreso' });
    expect(screen.getByRole('heading', { name: /registrar retiro/i })).toBeTruthy();
    expect(screen.getByLabelText(/motivo/i)).toBeTruthy();
  });

  it('un ingreso pide concepto', () => {
    pintar({ tipo: 'ingreso' });
    expect(screen.getByLabelText(/concepto/i)).toBeTruthy();
  });

  it('el monto viaja en CENTAVOS', async () => {
    const guardados: LoQueSeMueve[] = [];
    pintar({ onGuardar: (m) => guardados.push(m) });
    await userEvent.type(screen.getByLabelText(/monto/i), '200');
    await userEvent.type(screen.getByLabelText(/concepto/i), 'Fondo fijo');
    await userEvent.click(screen.getByRole('button', { name: /registrar ingreso/i }));
    expect(guardados[0]).toMatchObject({
      montoCentavos: 20000, concepto: 'Fondo fijo', tipo: 'ingreso', metodo: 'efectivo',
    });
  });

  it('en efectivo DICE que toca el cajon', () => {
    pintar({ tipo: 'egreso' });
    expect(screen.getByText(/sale del cajón/i)).toBeTruthy();
  });

  it('en transferencia DICE que NO toca el cajon, antes de guardar', async () => {
    pintar({ tipo: 'egreso' });
    await userEvent.selectOptions(screen.getByLabelText(/método de pago/i), 'transferencia');
    expect(screen.getByText(/no toca el efectivo del cajón/i)).toBeTruthy();
  });

  it('el boton se apaga mientras no se pueda guardar', () => {
    pintar();
    expect((screen.getByRole('button', { name: /registrar ingreso/i }) as HTMLButtonElement)
      .disabled).toBe(true);
  });

  it('el responsable sale de la sesion', () => {
    pintar();
    expect(screen.getByText('Quien cobra')).toBeTruthy();
  });

  it('el error del servidor se pinta tal cual', () => {
    pintar({ error: 'No hay una caja abierta. Abre una antes de mover efectivo.' });
    expect(screen.getByRole('alert').textContent).toContain('No hay una caja abierta');
  });
});
