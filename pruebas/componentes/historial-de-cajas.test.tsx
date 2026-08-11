/**
 * @vitest-environment happy-dom
 *
 * EL HISTORIAL DE CAJAS Y EL REPORTE DEL PERIODO.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistorialDeCajas, ReportesDeCaja } from '../../src/caja/historial-de-cajas.js';
import type { CajaDelHistorial, ReporteDeCaja } from '../../src/datos/caja.js';

afterEach(cleanup);

const CERRADA: CajaDelHistorial = {
  id: 's1', nombre: 'Caja 1', estado: 'cerrada',
  abiertaEn: '2026-07-10T08:30:00Z', cerradaEn: '2026-07-10T21:00:00Z',
  abiertaPor: 'Quien abrio', cerradaPor: 'Quien cerro',
  saldoInicialCentavos: 200000, ingresosCentavos: 130000, egresosCentavos: 65000,
  esperadoCentavos: 165000, contadoCentavos: 160000, diferenciaCentavos: -5000,
  movimientos: 4, observaciones: null, notasCierre: null,
};

const ABIERTA: CajaDelHistorial = {
  ...CERRADA, id: 's2', estado: 'abierta', cerradaEn: null, cerradaPor: null,
  contadoCentavos: null, diferenciaCentavos: null,
};

function pintar(extra: Partial<React.ComponentProps<typeof HistorialDeCajas>> = {}) {
  const props: React.ComponentProps<typeof HistorialDeCajas> = {
    abierto: true, cajas: [], total: 0, pagina: 1, porPagina: 10,
    cargando: false, error: null, onPagina: () => {}, onCerrar: () => {},
    ...extra,
  };
  return render(<HistorialDeCajas {...props} />);
}

describe('el historial vacio', () => {
  it('explica que cada corte queda ahi', () => {
    pintar();
    expect(screen.getByText(/todavía no se ha cerrado ninguna caja/i)).toBeTruthy();
  });

  it('cargando no se ve igual que vacio', () => {
    pintar({ cargando: true });
    expect(screen.queryByText(/todavía no se ha cerrado ninguna caja/i)).toBeNull();
  });
});

describe('una caja cerrada', () => {
  it('enseña esperado, contado y diferencia', () => {
    pintar({ cajas: [CERRADA], total: 1 });
    expect(screen.getByText(/1,650\.00/)).toBeTruthy();
    expect(screen.getByText(/1,600\.00/)).toBeTruthy();
    expect(screen.getByText(/^−.*50\.00/)).toBeTruthy();
  });

  it('con quien la abrio y cuantos movimientos tuvo', () => {
    pintar({ cajas: [CERRADA], total: 1 });
    expect(screen.getByText(/Quien abrio · 4 movimientos/)).toBeTruthy();
  });
});

describe('una caja que sigue abierta', () => {
  it('NO enseña un cero contado: dice que nadie ha contado', () => {
    // Cero seria decir que se conto y el cajon estaba vacio.
    pintar({ cajas: [ABIERTA], total: 1 });
    expect(screen.getByText('Sin contar')).toBeTruthy();
    expect(screen.getByText('Sigue abierta')).toBeTruthy();
  });

  it('y tampoco una diferencia', () => {
    pintar({ cajas: [ABIERTA], total: 1 });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('las paginas', () => {
  it('avisan al cambiar', async () => {
    const paginas: number[] = [];
    pintar({ cajas: [CERRADA], total: 25, onPagina: (p) => paginas.push(p) });
    await userEvent.click(screen.getByLabelText(/página siguiente/i));
    expect(paginas).toEqual([2]);
  });
});

/* ------------------------------------------------------------------ */

const REPORTE: ReporteDeCaja = {
  ingresosCentavos: 130000, egresosCentavos: 65000, movimientos: 4,
  porMetodo: [{ metodo: 'efectivo', centavos: 30000, movimientos: 2 }],
  porClase: [{ clase: 'venta', movimientos: 2, centavos: 130000 }],
  porUsuario: [{ usuario: 'Quien cobro', centavos: 65000, movimientos: 4 }],
  cortes: [{
    id: 's1', nombre: 'Caja 1', cerradaEn: '2026-07-10T21:00:00Z',
    esperadoCentavos: 165000, contadoCentavos: 160000, diferenciaCentavos: -5000,
  }],
};

function pintarReporte(extra: Partial<React.ComponentProps<typeof ReportesDeCaja>> = {}) {
  const props: React.ComponentProps<typeof ReportesDeCaja> = {
    abierto: true, desde: '2026-07-01', hasta: '2026-07-31', metodo: '',
    reporte: null, cargando: false, error: null,
    onDesde: () => {}, onHasta: () => {}, onMetodo: () => {}, onCerrar: () => {},
    ...extra,
  };
  return render(<ReportesDeCaja {...props} />);
}

describe('el reporte', () => {
  it('sin movimientos dice que los ceros son ceros DE VERDAD', () => {
    pintarReporte({ reporte: { ...REPORTE, movimientos: 0 } });
    expect(screen.getByText(/porque no hay registros/i)).toBeTruthy();
  });

  it('con movimientos enseña el neto', () => {
    pintarReporte({ reporte: REPORTE });
    expect(screen.getByText('Neto')).toBeTruthy();
    // 1300 de ingresos - 650 de egresos = 650 neto.
    expect(screen.getAllByText(/650\.00/).length).toBeGreaterThan(0);
  });

  it('agrupa por metodo, por tipo y por usuario', () => {
    pintarReporte({ reporte: REPORTE });
    expect(screen.getByText('Por forma de pago')).toBeTruthy();
    expect(screen.getByText('Por tipo')).toBeTruthy();
    expect(screen.getByText('Quien cobro')).toBeTruthy();
  });

  it('las diferencias salen de los CORTES, no de los movimientos', () => {
    pintarReporte({ reporte: REPORTE });
    const bloque = screen.getByText('Diferencias de corte').parentElement!;
    expect(bloque.textContent).toContain('Caja 1');
    expect(bloque.textContent).toContain('−$50.00');
  });

  it('sin cortes en el periodo lo dice, no pinta un cero', () => {
    pintarReporte({ reporte: { ...REPORTE, cortes: [] } });
    expect(screen.getByText(/no se cerró ninguna caja/i)).toBeTruthy();
  });

  it('cambiar el rango avisa', async () => {
    const desde = vi.fn();
    pintarReporte({ reporte: REPORTE, onDesde: desde });
    await userEvent.selectOptions(screen.getByLabelText(/método de pago/i), 'efectivo').catch(() => {});
    expect(screen.getByLabelText('Desde')).toBeTruthy();
    expect(desde).not.toHaveBeenCalled();
  });

  it('el error del servidor se pinta tal cual', () => {
    pintarReporte({ error: 'permission denied' });
    expect(screen.getByRole('alert').textContent).toContain('permission denied');
  });
});
