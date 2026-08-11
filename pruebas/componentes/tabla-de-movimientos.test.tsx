/**
 * @vitest-environment happy-dom
 *
 * LA TABLA DE MOVIMIENTOS.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TablaDeMovimientos,
  comoSeEscribeElMonto,
  csvDeMovimientos,
  horaDelMovimiento,
} from '../../src/caja/tabla-de-movimientos.js';
import type { MovimientoDeCaja } from '../../src/datos/caja.js';

afterEach(cleanup);

const MOVIMIENTO: MovimientoDeCaja = {
  id: 'm1', fecha: '10/07/2026', creadoEn: '2026-07-10T10:15:00Z',
  clase: 'venta', tipo: 'ingreso', concepto: 'Venta V-00001',
  metodo: 'efectivo', categoria: 'Servicios / Productos',
  montoCentavos: 115000, usuario: 'Quien cobro', notas: null,
  ventaId: 'v1', sesionId: 's1',
};

function pintar(extra: Partial<React.ComponentProps<typeof TablaDeMovimientos>> = {}) {
  const props: React.ComponentProps<typeof TablaDeMovimientos> = {
    movimientos: [], total: 0, pagina: 1, porPagina: 5,
    busqueda: '', clase: '', metodo: '', filtrosAbiertos: false,
    cargando: false, error: null,
    onBuscar: () => {}, onClase: () => {}, onMetodo: () => {}, onFiltros: () => {},
    onPagina: () => {}, onAbrirVenta: () => {}, onReintentar: () => {},
    ...extra,
  };
  return render(<TablaDeMovimientos {...props} />);
}

describe('como se escribe un monto', () => {
  it('lo que sale lleva signo delante', () => {
    expect(comoSeEscribeElMonto({ ...MOVIMIENTO, tipo: 'egreso' })).toMatch(/^−/);
  });

  it('lo que entra no', () => {
    expect(comoSeEscribeElMonto(MOVIMIENTO)).not.toMatch(/^−/);
  });
});

describe('la hora', () => {
  it('sale en dos cifras y dos cifras', () => {
    expect(horaDelMovimiento('2026-07-10T10:15:00Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('una marca ilegible sale VACIA, nunca inventada', () => {
    expect(horaDelMovimiento('mañana')).toBe('');
  });
});

describe('el archivo que se baja', () => {
  it('lleva cabecera y un renglon por movimiento', () => {
    const csv = csvDeMovimientos([MOVIMIENTO]);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('"Concepto"');
  });

  it('una coma dentro del concepto NO parte el renglon', () => {
    // Sin escapar, la hoja sale corrida a partir de ese renglon.
    const csv = csvDeMovimientos([{ ...MOVIMIENTO, concepto: 'Material, velas' }]);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('"Material, velas"');
  });

  it('unas comillas dentro del concepto tampoco', () => {
    const csv = csvDeMovimientos([{ ...MOVIMIENTO, concepto: 'Aceite "premium"' }]);
    expect(csv).toContain('"Aceite ""premium"""');
  });

  it('el monto va en PESOS con decimales, no en centavos', () => {
    // Quien abre el archivo espera leer 1150.00, no 115000.
    expect(csvDeMovimientos([MOVIMIENTO])).toContain('"1150.00"');
  });

  it('un egreso lleva el signo', () => {
    expect(csvDeMovimientos([{ ...MOVIMIENTO, tipo: 'egreso' }])).toContain('"-1150.00"');
  });
});

describe('la tabla vacia', () => {
  it('sin filtros invita a esperar los movimientos', () => {
    pintar();
    expect(screen.getByText('Todavía no hay movimientos')).toBeTruthy();
  });

  it('con filtro puesto dice que es el FILTRO, no que no haya nada', () => {
    // Es la diferencia entre "no hay caja" y "no encontré con este filtro".
    pintar({ clase: 'retiro' });
    expect(screen.getByText('Nada coincide con el filtro')).toBeTruthy();
  });

  it('cargando no se ve igual que vacio', () => {
    pintar({ cargando: true });
    expect(screen.queryByText('Todavía no hay movimientos')).toBeNull();
  });
});

describe('la tabla con movimientos', () => {
  it('NO hay editar ni borrar: la caja es un libro', () => {
    pintar({ movimientos: [MOVIMIENTO], total: 1 });
    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /eliminar|borrar/i })).toBeNull();
  });

  it('lo unico que se ofrece es ir a la operacion que lo produjo', async () => {
    const abiertas: string[] = [];
    pintar({ movimientos: [MOVIMIENTO], total: 1, onAbrirVenta: (id) => abiertas.push(id) });
    await userEvent.click(screen.getByLabelText(/ver la venta de Venta V-00001/i));
    expect(abiertas).toEqual(['v1']);
  });

  it('un movimiento sin venta detras no ofrece nada, no un boton muerto', () => {
    pintar({ movimientos: [{ ...MOVIMIENTO, ventaId: null }], total: 1 });
    expect(screen.queryByLabelText(/ver la venta/i)).toBeNull();
  });

  it('un movimiento sin categoria la dice con una raya', () => {
    pintar({ movimientos: [{ ...MOVIMIENTO, categoria: null }], total: 1 });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('la paginacion cuenta el total del servidor, no lo que se ve', () => {
    pintar({ movimientos: [MOVIMIENTO], total: 14, pagina: 1, porPagina: 5 });
    expect(screen.getByText(/de 14 movimientos/)).toBeTruthy();
    expect(screen.getByText('1 de 3')).toBeTruthy();
  });
});

describe('los filtros', () => {
  it('cerrados no estorban', () => {
    pintar();
    expect(screen.queryByLabelText(/buscar movimiento/i)).toBeNull();
  });

  it('abiertos ofrecen tipo y forma de pago', async () => {
    const clases: string[] = [];
    pintar({ filtrosAbiertos: true, onClase: (c) => clases.push(c) });
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'retiro');
    expect(clases).toEqual(['retiro']);
  });

  it('buscar avisa letra por letra sin perder lo escrito', async () => {
    const escrito: string[] = [];
    pintar({ filtrosAbiertos: true, onBuscar: (t) => escrito.push(t) });
    await userEvent.type(screen.getByLabelText(/buscar movimiento/i), 'vel');
    expect(escrito).toEqual(['v', 'e', 'l']);
  });
});

describe('cuando falla', () => {
  it('trae el mensaje del servidor y un boton para reintentar', async () => {
    const reintentar = vi.fn();
    pintar({ error: 'permission denied', onReintentar: reintentar });
    expect(screen.getByRole('alert').textContent).toContain('permission denied');
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(reintentar).toHaveBeenCalled();
  });
});
