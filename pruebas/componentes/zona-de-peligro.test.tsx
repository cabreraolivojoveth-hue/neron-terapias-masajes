/**
 * @vitest-environment happy-dom
 *
 * LA ZONA DE PELIGRO. Lo que se vigila: que la unica accion irreversible pida
 * escribir el nombre del centro —un "¿estás seguro?" se contesta que sí sin
 * leerlo— y que lo que NO se puede hacer se diga en vez de callarse.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZonaDePeligro, confirmaElNombre } from '../../src/configuracion/zona-de-peligro.js';
import type { MiembroDelCentro } from '../../src/datos/configuracion.js';

afterEach(cleanup);

const OTRA: MiembroDelCentro = {
  id: 'm2', usuarioId: 'u2', correo: 'otra@ejemplo.mx', nombre: 'Quien atiende',
  rol: 'terapeuta', rolEtiqueta: 'Terapeuta', activo: true, eliminado: false,
  permisos: null, soyYo: false, creadoEn: '',
};

const pintar = (extra: Record<string, unknown> = {}) => {
  const onTransferir = vi.fn();
  render(
    <ZonaDePeligro
      nombreDelCentro="Centro de prueba"
      candidatos={[OTRA]}
      soyDuena
      puedeEntrar
      trabajando={false}
      error={null}
      onTransferir={onTransferir}
      {...extra}
    />,
  );
  return { onTransferir };
};

describe('transferir la propiedad', () => {
  it('el boton NO se puede apretar hasta escribir el nombre del centro', async () => {
    /*
     * Un boton de confirmar se aprieta sin leerlo; escribir el nombre obliga a
     * mirar la pantalla y a estar en el centro que se cree.
     */
    const { onTransferir } = pintar();
    const boton = screen.getByRole('button', { name: 'Transferir el centro' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    await userEvent.selectOptions(screen.getByLabelText('A quién'), 'm2');
    expect((screen.getByRole('button', { name: 'Transferir el centro' }) as HTMLButtonElement).disabled)
      .toBe(true);

    await userEvent.type(screen.getByLabelText(/para confirmar/), 'Centro de prueba');
    await userEvent.click(screen.getByRole('button', { name: 'Transferir el centro' }));
    expect(onTransferir).toHaveBeenCalledWith('m2');
  });

  it('dice que no se puede deshacer desde aqui', () => {
    // Quien la usa deja de poder deshacerla en el mismo acto: despues de
    // transferir, ya no es dueño.
    pintar();
    expect(screen.getByText(/No se puede deshacer desde aquí/i)).toBeDefined();
  });

  it('sin nadie a quien darsela, lo dice y manda a invitar', () => {
    pintar({ candidatos: [] });
    expect(screen.getByText(/No hay a quién dársela/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Transferir el centro' })).toBeNull();
  });

  it('teniendo el permiso pero sin ser dueña, se explica', () => {
    pintar({ soyDuena: false });
    expect(screen.getByText(/Solo quien es dueño puede transferir/)).toBeDefined();
  });

  it('sin el permiso de zona de peligro, ni se entra', () => {
    pintar({ puedeEntrar: false });
    expect(screen.getByText(/no es para tu cuenta/i)).toBeDefined();
  });
});

describe('el nombre escrito', () => {
  it('no distingue mayusculas ni espacios de sobra', () => {
    // Exigir la caja exacta no protege mas: solo enfada a quien ya decidio.
    expect(confirmaElNombre('  centro de PRUEBA ', 'Centro de prueba')).toBe(true);
    expect(confirmaElNombre('Centro  de   prueba', 'Centro de prueba')).toBe(true);
  });

  it('vacio nunca confirma, aunque el centro se llame vacio', () => {
    expect(confirmaElNombre('', '')).toBe(false);
    expect(confirmaElNombre('   ', 'Centro de prueba')).toBe(false);
  });

  it('otro nombre no confirma', () => {
    expect(confirmaElNombre('Otro centro', 'Centro de prueba')).toBe(false);
  });
});

describe('lo que NO se puede hacer', () => {
  it('se dice entero, en vez de callarse', () => {
    /*
     * No hay "eliminar el centro" ni "borrar pacientes": el alta y la licencia
     * son del mundo B, y nada se borra en este sistema. Callarlo hace que
     * alguien lo busque durante media hora.
     */
    pintar();
    expect(screen.getByText(/Borrar el centro\./)).toBeDefined();
    expect(screen.getByText(/Corregir la bitácora\./)).toBeDefined();
  });
});
