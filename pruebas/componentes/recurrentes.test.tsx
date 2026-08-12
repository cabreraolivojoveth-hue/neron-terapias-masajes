/**
 * @vitest-environment happy-dom
 *
 * LOS GASTOS RECURRENTES.
 *
 * La regla que sostiene el modulo y que se vigila aqui: la plantilla NO es el
 * gasto. Guardar la renta mensual no mueve un peso; el gasto nace cuando llega
 * su fecha, y lo crea la base de forma idempotente.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GastoRecurrente } from '../../src/datos/gastos.js';
import { Recurrentes, cuandoToca, diasParaQueToque } from '../../src/gastos/recurrentes.js';

afterEach(cleanup);

function rec(sobre: Partial<GastoRecurrente> = {}): GastoRecurrente {
  return {
    id: 'r1', concepto: 'Renta', detalle: null, montoCentavos: 1000000,
    metodo: 'transferencia', efectivoCentavos: 0, metodoResto: null,
    categoriaId: null, categoria: null, categoriaColor: null,
    proveedorId: null, proveedor: null, frecuencia: 'mensual',
    fechaInicio: '01/08/2026', proximaFecha: '01/09/2026', fechaFin: null,
    estado: 'activo', notas: null, generados: 1, ...sobre,
  };
}

const ACCIONES = {
  hoy: '11/08/2026',
  cargando: false,
  puedeGestionar: true,
  onNuevo: () => {}, onEditar: () => {}, onMarcar: () => {},
};

describe('cuando toca', () => {
  it('cuenta los dias sin pasar por new Date(texto)', () => {
    // `new Date("01/09/2026")` lo interpreta en UTC y a quien esta en Mexico
    // le corre el dia una casilla — la renta se saldria del mes.
    expect(diasParaQueToque('12/08/2026', '11/08/2026')).toBe(1);
    expect(diasParaQueToque('11/08/2026', '11/08/2026')).toBe(0);
    expect(diasParaQueToque('01/08/2026', '11/08/2026')).toBe(-10);
  });

  it('lo dice en palabras', () => {
    expect(cuandoToca('11/08/2026', '11/08/2026')).toBe('Toca hoy');
    expect(cuandoToca('12/08/2026', '11/08/2026')).toBe('Toca mañana');
    expect(cuandoToca('16/08/2026', '11/08/2026')).toBe('En 5 días');
  });

  it('lo vencido se dice vencido, no "en -3 días"', () => {
    expect(cuandoToca('08/08/2026', '11/08/2026')).toContain('Vencido');
  });

  it('una fecha ilegible no revienta ni inventa', () => {
    expect(cuandoToca('roto', '11/08/2026')).toBe('roto');
  });
});

describe('lo que se ve', () => {
  it('sin recurrentes invita a configurar el primero', () => {
    render(<Recurrentes {...ACCIONES} recurrentes={[]} />);
    expect(screen.getByText('No hay gastos recurrentes')).toBeTruthy();
    expect(screen.getByText(/automatizar su seguimiento/)).toBeTruthy();
  });

  it('cada uno dice cuanto, cada cuando y cuando toca', () => {
    render(<Recurrentes {...ACCIONES} recurrentes={[rec()]} />);
    expect(screen.getByText('Renta')).toBeTruthy();
    expect(screen.getByText(/\$10,000\.00 · Mensual/)).toBeTruthy();
  });

  it('el estado se ve con palabra, no solo con color', () => {
    render(<Recurrentes {...ACCIONES} recurrentes={[rec({ estado: 'pausado' })]} />);
    expect(screen.getByText('Pausado')).toBeTruthy();
  });

  it('en el panel resumido SOLO salen los activos', () => {
    // Uno finalizado en la barra lateral ocupa sitio para decir que ya no pasa
    // nada.
    render(
      <Recurrentes
        {...ACCIONES}
        resumido
        recurrentes={[rec({ id: 'a' }), rec({ id: 'b', estado: 'finalizado' })]}
      />,
    );
    expect(screen.getAllByText('Renta')).toHaveLength(1);
  });

  it('quien no gestiona no ve el boton de nuevo', () => {
    render(<Recurrentes {...ACCIONES} recurrentes={[]} puedeGestionar={false} />);
    expect(screen.queryByRole('button', { name: /nuevo/i })).toBeNull();
  });

  it('mientras carga no dice que no hay ninguno', () => {
    render(<Recurrentes {...ACCIONES} recurrentes={[]} cargando />);
    expect(screen.queryByText('No hay gastos recurrentes')).toBeNull();
  });
});
