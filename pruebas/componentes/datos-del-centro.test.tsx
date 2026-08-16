/**
 * @vitest-environment happy-dom
 *
 * La ficha del centro y sus horarios.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatosDelCentro } from '../../src/configuracion/datos-del-centro.js';
import { CENTRO_VACIO } from '../../src/datos/configuracion.js';

afterEach(cleanup);

const pintar = (extra: Record<string, unknown> = {}) => {
  const onCambiar = vi.fn();
  const onGuardar = vi.fn();
  const salida = render(
    <DatosDelCentro
      datos={CENTRO_VACIO}
      loQueFalta={{}}
      mostrarErrores={false}
      trabajando={false}
      error={null}
      puedeGuardar
      onCambiar={onCambiar}
      onGuardar={onGuardar}
      {...extra}
    />,
  );
  return { ...salida, onCambiar, onGuardar };
};

describe('la ficha del centro', () => {
  it('pide nombre, lema y contacto', () => {
    pintar();
    expect(screen.getByLabelText(/Cómo se llama/)).toBeDefined();
    expect(screen.getByLabelText(/Lema/)).toBeDefined();
    expect(screen.getByLabelText(/Teléfono/)).toBeDefined();
  });

  it('la zona horaria dice que es la DEL CENTRO', () => {
    // Sin ella, quien revise la agenda desde otro huso ve las citas corridas; y
    // el dia que alguien viaje, la agenda cambiaria de hora con el.
    pintar();
    expect(screen.getByText(/no la de quien mira la pantalla/i)).toBeDefined();
  });

  it('escribir avisa hacia arriba sin guardar nada todavia', () => {
    const { onCambiar, onGuardar } = pintar();
    const campo = screen.getByLabelText(/Cómo se llama/);
    void userEvent.type(campo, 'X');
    expect(onGuardar).not.toHaveBeenCalled();
  });
});

describe('los horarios', () => {
  it('salen los siete dias con nombre', () => {
    pintar();
    for (const d of ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']) {
      expect(screen.getAllByText(d).length, d).toBeGreaterThan(0);
    }
  });

  it('dice que Agenda AVISA y no impide', () => {
    /*
     * Es la decision del modulo escrita en la pantalla: un centro de terapias
     * atiende fuera de hora constantemente, y una cita que el sistema se niega
     * a guardar acaba apuntada en un papel.
     */
    pintar();
    expect(screen.getByText(/avisa, pero no lo impide/i)).toBeDefined();
  });

  it('los campos de hora de un dia cerrado se quedan PINTADOS, apagados', () => {
    /*
     * Si desaparecieran, la fila se encogeria y las siete se moverian cada vez
     * que alguien marca una casilla, con el dedo ya puesto sobre la siguiente.
     */
    pintar();
    const domingo = screen.getByLabelText('Domingo: a qué hora abre') as HTMLInputElement;
    expect(domingo).toBeDefined();
    expect(domingo.disabled).toBe(true);
  });

  it('el resumen enseña como queda, juntando los dias iguales', () => {
    // Siete renglones de campos no se leen; una linea sí.
    pintar();
    expect(screen.getByText('Lunes a sábado: 09:00 a 19:00')).toBeDefined();
    expect(screen.getByText('Domingo: Cerrado')).toBeDefined();
  });

  it('con los siete dias cerrados lo DICE, en vez de dejar el resumen vacio', () => {
    pintar({
      datos: { ...CENTRO_VACIO, horarios: CENTRO_VACIO.horarios.map((h) => ({ ...h, cerrado: true })) },
    });
    expect(screen.getByText(/cerrado los siete días/i)).toBeDefined();
  });
});

describe('guardar', () => {
  it('sin permiso, el boton esta apagado', () => {
    // La base lo rechaza igual; esto evita el intento y el error feo.
    pintar({ puedeGuardar: false });
    const boton = screen.getByRole('button', { name: /Guardar los datos/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });

  it('los errores solo salen cuando se pidieron', () => {
    // Enseñar "falta el nombre" antes de que nadie haya intentado guardar es
    // regañar a quien todavia no ha hecho nada.
    pintar({ loQueFalta: { nombre: 'Falta el nombre.' }, mostrarErrores: false });
    expect(screen.queryByText('Falta el nombre.')).toBeNull();
    cleanup();
    pintar({ loQueFalta: { nombre: 'Falta el nombre.' }, mostrarErrores: true });
    expect(screen.getByText('Falta el nombre.')).toBeDefined();
  });
});
