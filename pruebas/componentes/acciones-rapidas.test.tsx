/**
 * @vitest-environment happy-dom
 *
 * Las acciones rapidas del pie de Inicio.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccionesRapidas, accionesRapidas } from '../../src/inicio/acciones-rapidas.js';

afterEach(cleanup);

const TODO = {
  cobrar: true, gestionarClientes: true, gestionarAgenda: true, verFinanzas: true,
};

describe('que acciones ve cada quien', () => {
  it('quien puede todo ve las seis del diseño', () => {
    expect(accionesRapidas(TODO).map((a) => a.etiqueta)).toEqual([
      'Nueva venta', 'Nuevo cliente', 'Nueva cita', 'Registrar pago', 'Nuevo gasto', 'Ver reportes',
    ]);
  });

  it('lo que no se puede hacer NO se muestra, ni en gris', () => {
    // Un boton apagado es ruido, y de paso le cuenta a quien no debe que esa
    // operacion existe. Es la misma regla del menu lateral.
    const claves = accionesRapidas({ gestionarAgenda: true }).map((a) => a.clave);
    expect(claves).toEqual(['cita']);
  });

  it('sin permisos no se pinta la fila entera', () => {
    const { container } = render(<AccionesRapidas permisos={{}} onAccion={() => {}} />);
    expect(container.querySelector('.ini-acciones')).toBeNull();
  });
});

describe('a donde lleva cada una', () => {
  it('cada boton apunta al modulo DUEÑO de esa operacion', () => {
    /**
     * Inicio no guarda nada: si "Nuevo cliente" diera de alta desde aqui,
     * habria dos formularios de alta que a los seis meses piden campos
     * distintos.
     */
    const por = (clave: string) => accionesRapidas(TODO).find((a) => a.clave === clave);
    expect(por('cliente')?.modulo).toBe('clientes');
    expect(por('cita')?.modulo).toBe('agenda');
    expect(por('gasto')?.modulo).toBe('gastos');
    expect(por('reportes')?.modulo).toBe('reportes');
  });

  it('registrar un pago abre COBRAR, no el cajón', () => {
    /**
     * Un pago pertenece a una venta: la caja se mueve sola cuando esa venta se
     * cobra. Un ingreso capturado suelto en el cajon dejaria de poder rastrearse
     * hasta la operacion que lo produjo, y ahi se acaba la auditoria.
     *
     * El modulo es "caja" desde que se unio con Ventas, pero el RECADO sigue
     * siendo de "ventas": es el punto de venta quien lo consume, y por eso cae
     * en la pestaña de cobrar y no en la del cajon.
     */
    const pago = accionesRapidas(TODO).find((a) => a.clave === 'pago');
    expect(pago?.modulo).toBe('caja');
    expect(pago?.intencion).toBe('ventas:nueva');
  });

  it('lleva el recado de QUE hacer al llegar', async () => {
    const hacer = vi.fn();
    render(<AccionesRapidas permisos={TODO} onAccion={hacer} />);
    await userEvent.click(screen.getByText('Nueva cita'));
    expect(hacer.mock.calls[0]?.[0]?.intencion).toBe('agenda:nueva');
  });

  it('"Ver reportes" no lleva recado: solo abre la pantalla', () => {
    const reportes = accionesRapidas(TODO).find((a) => a.clave === 'reportes');
    expect(reportes?.intencion).toBeUndefined();
  });
});
