/**
 * @vitest-environment happy-dom
 *
 * SIN CAJA ABIERTA, Y COMO SE ABRE.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FormularioDeApertura,
  SinCajaAbierta,
  porQueNoSePuedeAbrir,
} from '../../src/caja/abrir-caja.js';

afterEach(cleanup);

describe('lo que impide abrir', () => {
  it('sin nombre no se puede, y se dice por que', () => {
    expect(porQueNoSePuedeAbrir('')).toContain('nombre');
    expect(porQueNoSePuedeAbrir('   ')).toContain('nombre');
  });

  it('con nombre si', () => {
    expect(porQueNoSePuedeAbrir('Mostrador')).toBe('');
  });
});

describe('el estado vacio', () => {
  it('NO enseña ceros: dice que no hay caja abierta', () => {
    // Ceros ahi se leerian como "hoy no se vendio nada".
    render(<SinCajaAbierta puedeAbrir onAbrir={() => {}} />);
    expect(screen.getByText('Sin caja abierta')).toBeTruthy();
  });

  it('avisa que sin caja no se cobra en efectivo, ANTES de que pase', () => {
    render(<SinCajaAbierta puedeAbrir onAbrir={() => {}} />);
    expect(screen.getByText(/no se puede cobrar en efectivo/i)).toBeTruthy();
  });

  it('y que la tarjeta SI se puede cobrar: ese dinero no pasa por el cajon', () => {
    render(<SinCajaAbierta puedeAbrir onAbrir={() => {}} />);
    expect(screen.getByText(/tarjeta y transferencia sí se pueden cobrar/i)).toBeTruthy();
  });

  it('sin permiso no se ofrece el boton, y se dice de quien es', () => {
    render(<SinCajaAbierta puedeAbrir={false} onAbrir={() => {}} />);
    expect(screen.queryByRole('button', { name: /abrir nueva caja/i })).toBeNull();
    expect(screen.getByText(/tu rol no abre caja/i)).toBeTruthy();
  });

  it('con permiso, el boton avisa', async () => {
    const abrir = vi.fn();
    render(<SinCajaAbierta puedeAbrir onAbrir={abrir} />);
    await userEvent.click(screen.getByRole('button', { name: /abrir nueva caja/i }));
    expect(abrir).toHaveBeenCalled();
  });
});

describe('el formulario de apertura', () => {
  function pintar(extra: Partial<React.ComponentProps<typeof FormularioDeApertura>> = {}) {
    const props: React.ComponentProps<typeof FormularioDeApertura> = {
      abierto: true, quien: 'Quien abre', trabajando: false, error: null,
      onAbrir: () => {}, onCerrar: () => {},
      ...extra,
    };
    return render(<FormularioDeApertura {...props} />);
  }

  it('el responsable sale de la SESION, no de un campo que se pueda teclear', () => {
    // Escribirlo a mano dejaria abrir la caja a nombre de otra persona.
    pintar();
    expect(screen.getByText('Quien abre')).toBeTruthy();
    expect(screen.queryByLabelText(/responsable/i)).toBeNull();
  });

  it('el boton esta apagado hasta que haya nombre', async () => {
    pintar();
    const boton = screen.getByRole('button', { name: /abrir caja/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/nombre de la caja/i), 'Mostrador');
    expect((screen.getByRole('button', { name: /abrir caja/i }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it('el saldo inicial viaja en CENTAVOS, no en pesos', async () => {
    const abiertas: { saldoInicialCentavos: number; nombre: string }[] = [];
    pintar({ onAbrir: (d) => abiertas.push(d) });
    await userEvent.type(screen.getByLabelText(/nombre de la caja/i), 'Mostrador');
    await userEvent.type(screen.getByLabelText(/saldo inicial/i), '2000');
    await userEvent.click(screen.getByRole('button', { name: /abrir caja/i }));
    expect(abiertas[0]).toMatchObject({ nombre: 'Mostrador', saldoInicialCentavos: 200000 });
  });

  it('avisa que el saldo inicial NO se puede cambiar despues', () => {
    pintar();
    expect(screen.getByText(/no se puede cambiar después de abrir/i)).toBeTruthy();
  });

  it('el error del servidor se pinta tal cual', () => {
    pintar({ error: 'Ya hay una caja abierta. Cierrala antes de abrir otra.' });
    expect(screen.getByRole('alert').textContent).toContain('Ya hay una caja abierta');
  });

  it('mientras trabaja no se puede volver a apretar', () => {
    pintar({ trabajando: true });
    expect((screen.getByRole('button', { name: /abrir caja/i }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});
