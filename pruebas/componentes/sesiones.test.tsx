/**
 * @vitest-environment happy-dom
 *
 * LA PESTAÑA DE SESIONES.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESION_VACIA, Sesiones, tituloDeLaSesion, validarSesion } from '../../src/cursos/sesiones.js';
import type { SesionDelCurso } from '../../src/datos/cursos.js';

afterEach(cleanup);

const sesion = (p: Partial<SesionDelCurso> & { id: string }): SesionDelCurso => ({
  titulo: null, fecha: '15/07/2026', horaInicio: '09:00', horaFin: '15:00',
  instructorId: null, instructor: null, lugar: null, estado: 'programada', ...p,
});

function pintar(extra: Partial<React.ComponentProps<typeof Sesiones>> = {}) {
  const props: React.ComponentProps<typeof Sesiones> = {
    sesiones: [], instructores: [], permisos: { gestionarCatalogo: true },
    trabajando: false, error: null,
    onGuardar: () => {}, onArchivar: () => {},
    ...extra,
  };
  return render(<Sesiones {...props} />);
}

describe('lo que NO se deja guardar', () => {
  it('una sesion sin fecha', () => {
    expect(validarSesion({ ...SESION_VACIA, fecha: '' })).toBeTruthy();
  });

  it('una sesion que termina antes de empezar', () => {
    expect(
      validarSesion({ ...SESION_VACIA, fecha: '15/07/2026', horaInicio: '15:00', horaFin: '09:00' }),
    ).toBeTruthy();
  });

  it('una sesion de duracion cero', () => {
    expect(
      validarSesion({ ...SESION_VACIA, fecha: '15/07/2026', horaInicio: '09:00', horaFin: '09:00' }),
    ).toBeTruthy();
  });

  it('una sesion bien puesta SI pasa', () => {
    expect(validarSesion({ ...SESION_VACIA, fecha: '15/07/2026' })).toBeNull();
  });
});

describe('el titulo', () => {
  it('sin titulo se NUMERA, no se inventa un nombre', () => {
    expect(tituloDeLaSesion(sesion({ id: 'a' }), 0)).toBe('Sesión 1');
    expect(tituloDeLaSesion(sesion({ id: 'b' }), 3)).toBe('Sesión 4');
  });

  it('con titulo se respeta el que pusieron', () => {
    expect(tituloDeLaSesion(sesion({ id: 'a', titulo: 'Práctica' }), 0)).toBe('Práctica');
  });

  it('un titulo de puros espacios se trata como vacio', () => {
    expect(tituloDeLaSesion(sesion({ id: 'a', titulo: '   ' }), 0)).toBe('Sesión 1');
  });
});

describe('un curso sin sesiones', () => {
  it('lo dice, y explica que salen en la Agenda', () => {
    pintar();
    expect(screen.getByText(/todavía no tiene sesiones/)).toBeTruthy();
    expect(screen.getByText(/aparece en la Agenda/)).toBeTruthy();
  });
});

describe('con sesiones', () => {
  it('sin instructor propio DICE que hereda el del curso', () => {
    // Dejar el hueco se leeria como si faltara el dato.
    pintar({ sesiones: [sesion({ id: 'a' })] });
    expect(screen.getByText(/El instructor del curso/)).toBeTruthy();
  });

  it('el estado lleva palabra, no solo color', () => {
    const { container } = pintar({ sesiones: [sesion({ id: 'a', estado: 'impartida' })] });
    expect(container.querySelector('.cur-ses--impartida')?.textContent).toBe('Impartida');
  });

  it('quitar PIDE confirmacion y dice que no se borra de la historia', async () => {
    const archivar = vi.fn();
    pintar({ sesiones: [sesion({ id: 'a' })], onArchivar: archivar });
    await userEvent.click(screen.getByRole('button', { name: /Quitar/ }));
    expect(archivar).not.toHaveBeenCalled();
    expect(screen.getByText(/No se borra de la historia/)).toBeTruthy();
  });
});

describe('los permisos', () => {
  it('sin permiso NO se ofrece agregar ni editar', () => {
    pintar({ sesiones: [sesion({ id: 'a' })], permisos: { gestionarCatalogo: false } });
    expect(screen.queryByRole('button', { name: /Agregar sesión/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  });
});

describe('agregar una sesion', () => {
  it('NO guarda sin fecha, y dice por que', async () => {
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.click(screen.getByRole('button', { name: /Agregar sesión/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByText('La sesión necesita una fecha.')).toBeTruthy();
  });
});
