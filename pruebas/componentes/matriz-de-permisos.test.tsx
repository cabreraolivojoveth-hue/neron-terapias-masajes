/**
 * @vitest-environment happy-dom
 *
 * LA MATRIZ DE ROL x CAPACIDAD. Lo importante que vigila: que el rol de dueño
 * no se pueda editar —es la proteccion anti-bloqueo entera— y que cada
 * capacidad se lea en palabras y no como una clave tecnica.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MatrizDePermisos,
  ROL_INTOCABLE,
  tienePermiso,
} from '../../src/configuracion/matriz-de-permisos.js';
import type { RolDelCentro } from '../../src/datos/configuracion.js';

afterEach(cleanup);

const DUENA: RolDelCentro = {
  id: 'dueno', etiqueta: 'Dueña', permisos: {}, activo: true, cuantos: 1,
};
const RECEPCION: RolDelCentro = {
  id: 'recepcion', etiqueta: 'Recepción', activo: true, cuantos: 2,
  permisos: { gestionarClientes: true, verFinanzas: false },
};

const pintar = (extra: Record<string, unknown> = {}) => {
  const onGuardar = vi.fn();
  const onReintentar = vi.fn();
  render(
    <MatrizDePermisos
      roles={[DUENA, RECEPCION]}
      cargando={false}
      puedeEditar
      trabajando={false}
      error={null}
      onGuardar={onGuardar}
      onReintentar={onReintentar}
      {...extra}
    />,
  );
  return { onGuardar, onReintentar };
};

describe('el rol de dueño', () => {
  it('sale con TODO encendido aunque su lista este vacia', () => {
    /*
     * Se guarda con la lista de permisos VACIA a proposito: `app.tiene_permiso`
     * devuelve true en cuanto ve ese rol, sin mirar nada mas. Si aqui se dijera
     * otra cosa, la pantalla y el servidor discreparian sobre el unico rol que
     * no puede quedarse fuera.
     */
    expect(tienePermiso(DUENA, 'zonaDePeligro')).toBe(true);
    expect(tienePermiso(RECEPCION, 'zonaDePeligro')).toBe(false);
    expect(tienePermiso(RECEPCION, 'gestionarClientes')).toBe(true);
  });

  it('NO se puede editar, y la pantalla dice por que', () => {
    // Escribirle permisos —aunque fueran todos encendidos— haria que el dia que
    // alguien apague uno por error, la dueña se quede sin entrar a su centro.
    pintar();
    expect(screen.getByText(/Puede todo · no se edita/)).toBeDefined();
    const casilla = screen.getByLabelText('Dueña: Las acciones que no se pueden deshacer.');
    expect((casilla as HTMLInputElement).disabled).toBe(true);
    expect(ROL_INTOCABLE).toBe('dueno');
  });
});

describe('la matriz', () => {
  it('cada capacidad se lee en palabras, no como clave', () => {
    // "verExpediente" no significa nada hasta que dice "leer las notas clinicas
    // de un paciente".
    pintar();
    expect(screen.getByText('Leer las notas clínicas de un paciente.')).toBeDefined();
    expect(screen.getByText('Invitar gente, cambiar roles y dar de baja.')).toBeDefined();
  });

  it('dice cuanta gente usa cada rol', () => {
    // Es lo que convierte apagar un rol en una decision informada: uno que usan
    // cuatro personas las deja a las cuatro en el rol de respaldo.
    pintar();
    expect(screen.getByText('2 personas')).toBeDefined();
    expect(screen.getByText('1 persona')).toBeDefined();
  });

  it('marcar una casilla guarda ese rol con la capacidad puesta', async () => {
    const { onGuardar } = pintar();
    await userEvent.click(screen.getByLabelText('Recepción: Ver el dinero: caja, gastos y reportes.'));
    expect(onGuardar).toHaveBeenCalledWith(
      'recepcion', 'Recepción', expect.objectContaining({ verFinanzas: true }), true,
    );
  });

  it('sin permiso de administrar usuarios, todo esta apagado y se explica', () => {
    cleanup();
    pintar({ puedeEditar: false });
    expect(screen.getByText(/Para cambiar los permisos hace falta administrar usuarios/))
      .toBeDefined();
    const casilla = screen.getByLabelText('Recepción: Cobrar en el mostrador.');
    expect((casilla as HTMLInputElement).disabled).toBe(true);
  });

  it('avisa de que estos son los roles QUE CONSULTA LA BASE', () => {
    /*
     * Un rol de fabrica que no este guardado en la tabla de este centro le
     * devuelve falso a todo, por muy bien que el navegador lo mezcle para
     * dibujar el menu. Enseñarlo aqui seria enseñar permisos que el servidor no
     * aplica — y el sintoma es un boton que se ve, se aprieta, y falla.
     */
    pintar();
    expect(screen.getByText(/roles que consulta la base de datos de este centro/i)).toBeDefined();
  });
});

describe('crear un rol', () => {
  it('nace SIN ningun permiso, y lo dice', async () => {
    const { onGuardar } = pintar();
    await userEvent.click(screen.getByRole('button', { name: /Crear un rol/ }));
    expect(screen.getByText(/Nace sin ningún permiso/)).toBeDefined();
    await userEvent.type(screen.getByLabelText(/Cómo se llama el rol/), 'Aseo');
    await userEvent.click(screen.getByRole('button', { name: 'Crear el rol' }));
    expect(onGuardar).toHaveBeenCalledWith('Aseo', 'Aseo', {}, true);
  });

  it('sin nombre no se crea', async () => {
    const { onGuardar } = pintar();
    await userEvent.click(screen.getByRole('button', { name: /Crear un rol/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear el rol' }));
    expect(onGuardar).not.toHaveBeenCalled();
  });
});
