/**
 * @vitest-environment happy-dom
 *
 * EL FORMULARIO DE UN GASTO.
 *
 * Lo que se vigila: que cada error salga DEBAJO de su campo, que el mixto no
 * deje guardar cuentas imposibles, y que se avise ANTES de intentar pagar en
 * efectivo sin caja abierta — porque enterarse al apretar "Guardar", con el
 * formulario lleno, es el peor momento.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GASTO_VACIO, loQueFaltaDelGasto, type DatosDeGasto } from '../../src/datos/gastos.js';
import {
  FormularioDeGasto,
  centavosAPesos,
  pesosACentavos,
} from '../../src/gastos/formulario-de-gasto.js';

afterEach(cleanup);

const BASE = {
  abierto: true,
  titulo: 'Nuevo gasto',
  montoEscrito: '',
  efectivoEscrito: '',
  categorias: [],
  proveedores: [],
  hayCajaAbierta: true,
  trabajando: false,
  error: null,
  mostrarErrores: false,
  onCambiar: () => {},
  onMonto: () => {},
  onEfectivo: () => {},
  onGuardar: () => {},
  onCerrar: () => {},
  onAdministrarCategorias: () => {},
};

const LLENO: DatosDeGasto = {
  ...GASTO_VACIO,
  concepto: 'Renta',
  montoCentavos: 100000,
  efectivoCentavos: 100000,
  fecha: '11/08/2026',
  categoriaId: 'c1',
};

describe('los pesos y los centavos', () => {
  it('convierte sin que el punto flotante muerda', () => {
    // 10.1 * 100 da 1009.9999 en punto flotante. Sin redondear, se guardarian
    // 1009 centavos y el corte no cuadraria por un centavo que nadie encuentra.
    expect(pesosACentavos('10.1')).toBe(1010);
    expect(pesosACentavos('0.1')).toBe(10);
    expect(pesosACentavos('1000')).toBe(100000);
  });

  it('lo que no es un numero vale cero, no NaN', () => {
    // Un NaN guardado como monto revienta la base con un mensaje que no dice
    // nada; aqui se convierte en un error legible de "mayor que cero".
    expect(pesosACentavos('')).toBe(0);
    expect(pesosACentavos('abc')).toBe(0);
    expect(pesosACentavos('-50')).toBe(5000);
  });

  it('la vuelta deja el campo vacio cuando es cero', () => {
    // Un "0" puesto de arranque obliga a borrarlo antes de escribir.
    expect(centavosAPesos(0)).toBe('');
    expect(centavosAPesos(1050)).toBe('10.5');
  });
});

describe('que le falta a un gasto', () => {
  it('un gasto completo no tiene faltas', () => {
    expect(Object.keys(loQueFaltaDelGasto(LLENO))).toHaveLength(0);
  });

  it('cada falta va con el nombre de SU campo', () => {
    // Es lo que permite pintarla debajo del campo en vez de un "revisa los
    // datos" que obliga a mirarlos todos.
    const falta = loQueFaltaDelGasto(GASTO_VACIO);
    expect(falta['concepto']).toBeTruthy();
    expect(falta['monto']).toBeTruthy();
    expect(falta['categoria']).toBeTruthy();
    expect(falta['fecha']).toBeTruthy();
  });

  it('el monto en cero o negativo no pasa', () => {
    expect(loQueFaltaDelGasto({ ...LLENO, montoCentavos: 0 })['monto']).toBeTruthy();
    expect(loQueFaltaDelGasto({ ...LLENO, montoCentavos: -100 })['monto']).toBeTruthy();
  });

  it('un mixto con mas efectivo que total no pasa', () => {
    // La base tiene la misma restriccion; aqui se dice antes y mejor.
    const malo: DatosDeGasto = {
      ...LLENO, metodo: 'mixto', efectivoCentavos: 200000, metodoResto: 'tarjeta',
    };
    expect(loQueFaltaDelGasto(malo)['efectivo']).toBeTruthy();
  });

  it('un mixto sin decir con que se pago el resto no pasa', () => {
    const malo: DatosDeGasto = {
      ...LLENO, metodo: 'mixto', efectivoCentavos: 30000, metodoResto: null,
    };
    expect(loQueFaltaDelGasto(malo)['metodoResto']).toBeTruthy();
  });

  it('un mixto que cuadra si pasa', () => {
    const bueno: DatosDeGasto = {
      ...LLENO, metodo: 'mixto', efectivoCentavos: 30000, metodoResto: 'tarjeta',
    };
    expect(Object.keys(loQueFaltaDelGasto(bueno))).toHaveLength(0);
  });
});

describe('cuando se enseñan los errores', () => {
  it('al abrir NO se regaña a quien no ha escrito nada', () => {
    render(<FormularioDeGasto {...BASE} datos={GASTO_VACIO} />);
    expect(screen.queryByText('Escribe de qué es el gasto.')).toBeNull();
  });

  it('al intentar guardar SI salen, y debajo de su campo', () => {
    render(<FormularioDeGasto {...BASE} datos={GASTO_VACIO} mostrarErrores />);
    expect(screen.getByText('Escribe de qué es el gasto.')).toBeTruthy();
    expect(screen.getByText('El monto tiene que ser mayor que cero.')).toBeTruthy();
  });
});

describe('la caja', () => {
  it('dice cuanto va a salir del cajon ANTES de guardar', () => {
    render(<FormularioDeGasto {...BASE} datos={LLENO} />);
    expect(screen.getByText(/Saldrán \$1,000\.00 del cajón/)).toBeTruthy();
  });

  it('con tarjeta avisa que NO sale efectivo', () => {
    // Es la conexion que mas confunde: por que un gasto no bajo el cajon.
    render(<FormularioDeGasto {...BASE} datos={{ ...LLENO, metodo: 'tarjeta', efectivoCentavos: 0 }} />);
    expect(screen.getByText(/No sale efectivo del cajón/)).toBeTruthy();
  });

  it('sin caja abierta avisa y NO deja guardar en efectivo', () => {
    render(<FormularioDeGasto {...BASE} datos={LLENO} hayCajaAbierta={false} />);
    expect(screen.getByText('No hay una caja abierta.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /guardar gasto/i }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('sin caja abierta SI deja guardar con transferencia', () => {
    // No toca el cajon, asi que no hay motivo para bloquearlo.
    render(
      <FormularioDeGasto
        {...BASE}
        datos={{ ...LLENO, metodo: 'transferencia', efectivoCentavos: 0 }}
        hayCajaAbierta={false}
      />,
    );
    expect(
      screen.getByRole('button', { name: /guardar gasto/i }).hasAttribute('disabled'),
    ).toBe(false);
  });
});

describe('sin categorias', () => {
  it('ofrece crear la primera en vez de dejar un desplegable vacio', async () => {
    const administrar = vi.fn();
    render(
      <FormularioDeGasto {...BASE} datos={GASTO_VACIO} onAdministrarCategorias={administrar} />,
    );
    await userEvent.click(screen.getByText(/crea la primera categoría/i));
    expect(administrar).toHaveBeenCalled();
  });
});
