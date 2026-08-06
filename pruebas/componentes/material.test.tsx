/**
 * @vitest-environment happy-dom
 *
 * LA PESTAÑA DE MATERIAL.
 *
 * Se guarda el ENLACE, no el archivo. Y lo interno se distingue de lo que ve
 * el alumno: sin esa marca, las notas del instructor se le acaban mandando al
 * grupo.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MATERIAL_VACIO, Material, validarMaterial } from '../../src/cursos/material.js';
import type { MaterialDelCurso } from '../../src/datos/cursos.js';

afterEach(cleanup);

const material = (p: Partial<MaterialDelCurso> & { id: string }): MaterialDelCurso => ({
  titulo: 'Guía', tipo: 'enlace', url: 'https://ejemplo.mx/guia',
  descripcion: null, visibleParaAlumnos: true, ...p,
});

function pintar(extra: Partial<React.ComponentProps<typeof Material>> = {}) {
  const props: React.ComponentProps<typeof Material> = {
    material: [], permisos: { gestionarCatalogo: true }, trabajando: false, error: null,
    onGuardar: () => {}, onArchivar: () => {},
    ...extra,
  };
  return render(<Material {...props} />);
}

describe('lo que NO se deja guardar', () => {
  it('un titulo de puros espacios', () => {
    expect(validarMaterial({ ...MATERIAL_VACIO, titulo: '  ' })).toBeTruthy();
  });

  it('un enlace SIN direccion: no lleva a ningun lado', () => {
    expect(validarMaterial({ ...MATERIAL_VACIO, titulo: 'Guía', url: '' })).toBeTruthy();
  });

  it('una NOTA sin direccion si pasa: es texto, no un archivo', () => {
    expect(validarMaterial({ ...MATERIAL_VACIO, titulo: 'Recordar', tipo: 'nota', url: '' }))
      .toBeNull();
  });
});

describe('un curso sin material', () => {
  it('lo dice en vez de dejar la pestaña en blanco', () => {
    pintar();
    expect(screen.getByText(/todavía no tiene material/)).toBeTruthy();
  });
});

describe('con material', () => {
  it('el enlace se abre en otra pestaña, y sin filtrar de donde vino', () => {
    // Sin `noreferrer`, la pagina que se abre puede leer de donde vino.
    const { container } = pintar({ material: [material({ id: 'm1' })] });
    const a = container.querySelector('a');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toContain('noreferrer');
  });

  it('lo INTERNO se marca: si no, se le acaba mandando al grupo', () => {
    pintar({ material: [material({ id: 'm1', visibleParaAlumnos: false })] });
    expect(screen.getByText('Solo el equipo')).toBeTruthy();
  });

  it('lo visible para alumnos NO lleva la marca', () => {
    pintar({ material: [material({ id: 'm1', visibleParaAlumnos: true })] });
    expect(screen.queryByText('Solo el equipo')).toBeNull();
  });

  it('quitar PIDE confirmacion y dice que el archivo no se toca', async () => {
    const archivar = vi.fn();
    pintar({ material: [material({ id: 'm1' })], onArchivar: archivar });
    await userEvent.click(screen.getByRole('button', { name: /Quitar/ }));
    expect(archivar).not.toHaveBeenCalled();
    expect(screen.getByText(/aquí solo vive el enlace/)).toBeTruthy();
  });
});

describe('agregar material', () => {
  it('a una NOTA no se le pide direccion', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Agregar material/ }));
    expect(screen.getByLabelText(/Dirección/)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText(/Tipo/), 'nota');
    expect(screen.queryByLabelText(/Dirección/)).toBeNull();
  });

  it('NO guarda sin titulo, y dice por que', async () => {
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.click(screen.getByRole('button', { name: /Agregar material/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el título del material.')).toBeTruthy();
  });
});

describe('los permisos', () => {
  it('sin permiso NO se ofrece agregar', () => {
    pintar({ material: [material({ id: 'm1' })], permisos: { gestionarCatalogo: false } });
    expect(screen.queryByRole('button', { name: /Agregar material/ })).toBeNull();
  });
});
