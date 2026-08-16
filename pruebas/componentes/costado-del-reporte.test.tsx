/**
 * @vitest-environment happy-dom
 *
 * LA COLUMNA DE LA DERECHA.
 *
 * Es donde vive la unica cifra que de verdad se busca al abrir Reportes —la
 * ganancia neta— y el selector de periodo que manda sobre la pantalla entera.
 * Lo que se vigila: que el margen sin ingresos NO salga como 0% y que los
 * campos de fecha solo existan cuando hacen falta.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fecha } from '@neron/base/utils';
import { ordenarReporte, type ReporteGuardado } from '../../src/datos/reportes.js';
import {
  CostadoDelReporte,
  type PropiedadesDelCostado,
} from '../../src/reportes/costado-del-reporte.js';
import { periodosDelCentro } from '../../src/reportes/periodo-del-reporte.js';

afterEach(cleanup);

const HOY = '15/08/2026' as Fecha;
const PERIODOS = periodosDelCentro(HOY);

const GUARDADO: ReporteGuardado = {
  id: 'r1', nombre: 'Cierre del mes', tipo: 'resumen',
  desde: '01/07/2026' as Fecha, hasta: '31/07/2026' as Fecha,
  filtros: { tipo: '', metodo: '', vendedorId: '' },
  creadoEn: '2026-08-01T10:30:00Z', creadoPor: 'Quien administra',
};

function pintar(sobre: Partial<PropiedadesDelCostado> = {}) {
  const props: PropiedadesDelCostado = {
    periodos: PERIODOS,
    clave: 'esteMes' as const,
    desde: '01/08/2026' as Fecha,
    hasta: '31/08/2026' as Fecha,
    reporte: ordenarReporte({}),
    cargando: false,
    guardados: [] as readonly ReporteGuardado[],
    puedeGuardar: true,
    onPeriodo: () => {},
    onDesde: () => {},
    onHasta: () => {},
    onGuardar: () => {},
    onAbrirGuardado: () => {},
    onBorrarGuardado: () => {},
    ...sobre,
  };
  return render(<CostadoDelReporte {...props} />);
}

describe('los filtros rápidos', () => {
  it('están los cinco del diseño y el personalizado', () => {
    pintar();
    for (const e of ['Hoy', 'Ayer', 'Esta semana', 'Este mes', 'Mes anterior', 'Personalizado']) {
      expect(screen.getByRole('button', { name: new RegExp(e) })).toBeTruthy();
    }
  });

  it('el escogido se anuncia, no solo se pinta de otro color', () => {
    // Quien no distingue el verde tiene que poder saber cual esta puesto.
    pintar();
    expect(screen.getByRole('button', { name: 'Este mes' }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: 'Hoy' }).getAttribute('aria-pressed'))
      .toBe('false');
  });

  it('los campos de fecha solo aparecen en personalizado', () => {
    // Dos campos permanentes al lado de cinco atajos hacen dudar de cual manda.
    pintar();
    expect(screen.queryByText('Desde')).toBeNull();
    cleanup();
    pintar({ clave: 'personalizado' });
    expect(screen.getByText('Desde')).toBeTruthy();
    expect(screen.getByText('Hasta')).toBeTruthy();
  });

  it('tocar uno avisa con su clave', async () => {
    const onPeriodo = vi.fn();
    pintar({ onPeriodo });
    await userEvent.click(screen.getByRole('button', { name: 'Ayer' }));
    expect(onPeriodo).toHaveBeenCalledWith('ayer');
  });
});

describe('el resumen del periodo', () => {
  it('sin ingresos el margen lo DICE, no escribe 0%', () => {
    /**
     * Dividir entre cero no da cero. Un "0% de margen" afirma que se trabajo a
     * perdida total, cuando lo que pasa es que no se vendio nada.
     */
    pintar();
    expect(screen.getByText('Sin ingresos')).toBeTruthy();
  });

  it('con ingresos escribe el margen con una decimal', () => {
    pintar({ reporte: ordenarReporte({ finanzas: { ingresos: 100000, margen: 74.8 } }) });
    expect(screen.getByText('74.8%')).toBeTruthy();
  });

  it('mientras carga pinta rayas y no ceros', () => {
    pintar({ cargando: true });
    const fila = screen.getByText('Ingresos').parentElement;
    expect(fila?.textContent).toContain('—');
  });

  it('la ganancia neta está siempre a la vista', () => {
    // Es la cifra que de verdad se busca. Escondida en una pestaña, se
    // calcularia a mano restando dos numeros de dos pantallas.
    pintar();
    expect(screen.getByText('Ganancia neta')).toBeTruthy();
  });
});

describe('los reportes guardados', () => {
  it('sin ninguno explica para qué sirve guardarlos', () => {
    pintar();
    expect(screen.getByText(/recuerda el período y los filtros/)).toBeTruthy();
  });

  it('con guardados los lista con su periodo', () => {
    pintar({ guardados: [GUARDADO] });
    expect(screen.getByText('Cierre del mes')).toBeTruthy();
    expect(screen.getByText('01/07/2026 – 31/07/2026')).toBeTruthy();
  });

  it('tocar uno lo abre', async () => {
    const onAbrirGuardado = vi.fn();
    pintar({ guardados: [GUARDADO], onAbrirGuardado });
    await userEvent.click(screen.getByText('Cierre del mes'));
    expect(onAbrirGuardado).toHaveBeenCalledWith(GUARDADO);
  });
});

describe('guardar el reporte actual', () => {
  it('sin permiso de finanzas el botón NO aparece', () => {
    // La regla de fila de la tabla lo exige igual: un boton que siempre falla
    // es peor que no tenerlo.
    pintar({ puedeGuardar: false });
    expect(screen.queryByRole('button', { name: /Guardar reporte actual/ })).toBeNull();
  });

  it('con permiso aparece y avisa al tocarlo', async () => {
    const onGuardar = vi.fn();
    pintar({ onGuardar });
    await userEvent.click(screen.getByRole('button', { name: /Guardar reporte actual/ }));
    expect(onGuardar).toHaveBeenCalledTimes(1);
  });
});
