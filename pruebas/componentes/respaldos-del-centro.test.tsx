/**
 * @vitest-environment happy-dom
 *
 * EXPORTAR Y RESTAURAR. Lo que se vigila es lo que NO hay: que restaurar no
 * tenga ningun boton, porque un boton que no hace nada le hace creer a alguien
 * que tiene un respaldo el dia que de verdad lo necesita.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RespaldosDelCentro,
  comoSeCuentaLoExportado,
} from '../../src/configuracion/respaldos-del-centro.js';

afterEach(cleanup);

const pintar = (extra: Record<string, unknown> = {}) => {
  const onExportar = vi.fn();
  render(
    <RespaldosDelCentro
      puedeExportar
      puedeRestaurar
      trabajando={null}
      ultima={null}
      error={null}
      onExportar={onExportar}
      {...extra}
    />,
  );
  return { onExportar };
};

describe('restaurar', () => {
  it('NO tiene ningun boton, y se explica entero por que', () => {
    /*
     * Volver a meter datos no es exportar al reves: un paciente con su id ya
     * ocupado obliga a decidir si se pisa lo de ahora o se duplica, y las dos
     * respuestas estan mal en un expediente. Ademas la caja y la bitacora no se
     * pueden reescribir ni desde el servidor.
     */
    pintar();
    expect(screen.getByText(/Todavía no se puede restaurar desde aquí/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Restaurar/i })).toBeNull();
  });

  it('dice donde SI se hace la copia de verdad', () => {
    // Decir "no se puede" sin decir que hacer deja a alguien sin respaldo.
    pintar();
    expect(screen.getByText(/la hace Supabase sobre la base entera/i)).toBeDefined();
  });
});

describe('exportar', () => {
  it('ofrece las ocho cosas que se pueden bajar', () => {
    pintar();
    for (const q of ['Pacientes', 'Servicios', 'Cursos', 'Productos', 'Citas', 'Ventas',
      'Gastos', 'Recordatorios']) {
      expect(screen.getByRole('button', { name: q }), q).toBeDefined();
    }
  });

  it('dice que se baja SOLO lo que esta cuenta puede ver', () => {
    // Las reglas de fila deciden que renglones salen: quien no ve el expediente
    // clinico tampoco lo exporta.
    pintar();
    expect(screen.getByText(/Se baja lo que tu cuenta puede ver/i)).toBeDefined();
  });

  it('sin permiso lo dice, en vez de esconder los botones sin mas', () => {
    pintar({ puedeExportar: false });
    expect(screen.getByText(/necesita el permiso de exportar datos/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Pacientes' })).toBeNull();
  });

  it('tocar uno pide bajar ese, no todos', async () => {
    const { onExportar } = pintar();
    await userEvent.click(screen.getByRole('button', { name: 'Ventas' }));
    expect(onExportar).toHaveBeenCalledWith('ventas');
  });
});

describe('lo que se cuenta despues de bajar', () => {
  it('cuando el tope recorto, LO DICE', () => {
    /*
     * Un archivo recortado sin avisar tiene exactamente la misma cara que uno
     * completo. Quien lo abra va a creer que su centro tiene 5000 pacientes.
     */
    const dicho = comoSeCuentaLoExportado({
      que: 'clientes', total: 12000, entregadas: 5000, tope: 5000, filas: [],
    });
    expect(dicho).toContain('5000 de 12000');
    expect(dicho).toContain('tope');
  });

  it('cuando salio todo, lo dice tambien', () => {
    expect(
      comoSeCuentaLoExportado({ que: 'gastos', total: 12, entregadas: 12, tope: 5000, filas: [] }),
    ).toContain('todos');
  });

  it('con cero no se felicita a nadie: dice que no habia nada', () => {
    expect(
      comoSeCuentaLoExportado({ que: 'citas', total: 0, entregadas: 0, tope: 5000, filas: [] }),
    ).toBe('No había nada que exportar.');
  });
});
