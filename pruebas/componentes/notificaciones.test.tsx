/**
 * @vitest-environment happy-dom
 *
 * La campana de avisos.
 *
 * Lo que se comprueba con mas cuidado es que NO SE INVENTA NINGUN AVISO: cada
 * uno sale de una cifra real, y sin cifras no hay avisos ni punto en la
 * campana.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESUMEN_VACIO, type ResumenDeInicio } from '../../src/datos/tablero.js';
import { Notificaciones, avisosDelResumen } from '../../src/marco/notificaciones.js';

afterEach(cleanup);

const HOY = '06/08/2026';
const TODO = { gestionarAgenda: true, gestionarInventario: true, verFinanzas: true };

const resumen = (c: Partial<ResumenDeInicio> = {}): ResumenDeInicio => ({ ...RESUMEN_VACIO, ...c });

describe('de donde sale cada aviso', () => {
  it('sin nada que atender no hay ni un aviso', () => {
    // No hay tabla de notificaciones y no hace falta: si el producto ya se
    // resurtio, el aviso desaparece solo.
    expect(avisosDelResumen(resumen(), TODO, HOY)).toEqual([]);
  });

  it('mientras el resumen no llega tampoco se inventa nada', () => {
    expect(avisosDelResumen(null, TODO, HOY)).toEqual([]);
  });

  it('cada cifra real produce su aviso', () => {
    const avisos = avisosDelResumen(
      resumen({ citasPendientes: 2, productosBajos: 3, recordatoriosPendientes: 1 }),
      TODO,
      HOY,
    );
    expect(avisos.map((a) => a.clave)).toEqual(['citas', 'productos', 'recordatorios']);
  });

  it('el aviso de citas lleva el filtro que hay que abrir', () => {
    const [aviso] = avisosDelResumen(resumen({ citasPendientes: 2 }), TODO, HOY);
    expect(aviso?.modulo).toBe('agenda');
    expect(aviso?.parametros).toEqual({ fecha: HOY, estado: 'pendiente' });
  });

  it('no se avisa de lo que esa persona no puede abrir', () => {
    // Avisarle del inventario a quien no puede entrar a Productos solo es una
    // frustracion con campanita.
    const avisos = avisosDelResumen(resumen({ productosBajos: 3 }), { gestionarAgenda: true }, HOY);
    expect(avisos).toEqual([]);
  });

  it('el singular y el plural estan escritos', () => {
    const [uno] = avisosDelResumen(resumen({ citasPendientes: 1 }), TODO, HOY);
    expect(uno?.texto).toContain('1 cita');
    const [dos] = avisosDelResumen(resumen({ citasPendientes: 2 }), TODO, HOY);
    expect(dos?.texto).toContain('2 citas');
  });
});

describe('la campana', () => {
  it('sin avisos no lleva punto, y lo dice para quien no lo ve', () => {
    const { container } = render(
      <Notificaciones resumen={resumen()} permisos={TODO} hoy={HOY} onIr={() => {}} />,
    );
    expect(container.querySelector('.ini-campana__punto')).toBeNull();
    expect(screen.getByLabelText(/nada requiere atención/i)).toBeTruthy();
  });

  it('con avisos lleva punto y dice cuantos', () => {
    const { container } = render(
      <Notificaciones
        resumen={resumen({ productosBajos: 3 })}
        permisos={TODO}
        hoy={HOY}
        onIr={() => {}}
      />,
    );
    expect(container.querySelector('.ini-campana__punto')).toBeTruthy();
    expect(screen.getByLabelText(/1 cosa que requiere atención/i)).toBeTruthy();
  });

  it('el panel se abre y SE VE — no se queda debajo de nada', async () => {
    // Ya nos paso con otro menu: se oscurecia el fondo y el menu no aparecia.
    render(
      <Notificaciones
        resumen={resumen({ productosBajos: 3 })}
        permisos={TODO}
        hoy={HOY}
        onIr={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/3 productos están por acabarse/)).toBeTruthy();
  });

  it('tocar un aviso lleva a su modulo con el filtro puesto, y cierra el panel', async () => {
    const ir = vi.fn();
    render(
      <Notificaciones
        resumen={resumen({ productosBajos: 3 })}
        permisos={TODO}
        hoy={HOY}
        onIr={ir}
      />,
    );
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    await userEvent.click(screen.getByText(/3 productos están por acabarse/));
    expect(ir).toHaveBeenCalledWith('productos', { existencia: 'baja' });
    expect(screen.queryByText(/3 productos están por acabarse/)).toBeNull();
  });

  it('Escape lo cierra y devuelve el foco a la campana', async () => {
    // Sin devolver el foco, quien cerro con teclado se queda en la nada y
    // tiene que tabular desde el principio.
    render(
      <Notificaciones
        resumen={resumen({ productosBajos: 1 })}
        permisos={TODO}
        hoy={HOY}
        onIr={() => {}}
      />,
    );
    const boton = screen.getByRole('button', { expanded: false });
    await userEvent.click(boton);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(/por acabarse/)).toBeNull();
    expect(document.activeElement).toBe(boton);
  });

  it('el panel vacio DICE que no hay nada, no se queda en blanco', async () => {
    render(<Notificaciones resumen={resumen()} permisos={TODO} hoy={HOY} onIr={() => {}} />);
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Nada requiere tu atención por ahora.')).toBeTruthy();
  });
});
