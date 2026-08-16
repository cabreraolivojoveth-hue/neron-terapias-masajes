/**
 * @vitest-environment happy-dom
 *
 * EL FORMULARIO DE UN CURSO.
 *
 * Lo que mas se cuida: que "sin cupo" se guarde como NULO y no como cero —cero
 * seria un curso al que nadie puede entrar—, y que el lugar solo se pida
 * cuando la modalidad lo necesita.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURSO_VACIO,
  FormularioDeCurso,
  aInputFecha,
  deInputFecha,
  necesitaEnlace,
  necesitaLugar,
  validarCurso,
} from '../../src/cursos/formulario-de-curso.js';
import type { DatosDeCurso } from '../../src/datos/cursos.js';

afterEach(cleanup);

const BUENO: DatosDeCurso = { ...CURSO_VACIO, nombre: 'Taller Uno', fechaInicio: '15/07/2026' };

describe('lo que NO se deja guardar', () => {
  it('un nombre de puros espacios', () => {
    expect(validarCurso({ ...BUENO, nombre: '   ' }).nombre).toBeTruthy();
  });

  it('un curso sin fecha de inicio', () => {
    expect(validarCurso({ ...BUENO, fechaInicio: '' }).fechaInicio).toBeTruthy();
  });

  it('un curso que termina antes de empezar', () => {
    // Se comparan como aaaa-mm-dd: comparar dd/mm/aaaa como texto diria que el
    // 02/01 va antes que el 15/12.
    const e = validarCurso({ ...BUENO, fechaInicio: '15/12/2026', fechaFin: '02/01/2026' });
    expect(e.fechaFin).toBeTruthy();
  });

  it('un cupo en CERO, que no es "sin limite" sino "no cabe nadie"', () => {
    expect(validarCurso({ ...BUENO, cupo: 0 }).cupo).toBeTruthy();
    expect(validarCurso({ ...BUENO, cupo: -3 }).cupo).toBeTruthy();
  });

  it('un precio negativo', () => {
    expect(validarCurso({ ...BUENO, precioCentavos: -1 }).precioCentavos).toBeTruthy();
  });

  it('un curso en linea sin enlace de conexion', () => {
    // "En linea" sin liga no le sirve a nadie: el alumno no sabe adonde entrar.
    expect(validarCurso({ ...BUENO, modalidad: 'en_linea' }).enlace).toBeTruthy();
  });
});

describe('lo que SI se deja guardar', () => {
  it('un curso minimo', () => {
    expect(validarCurso(BUENO)).toEqual({});
  });

  it('un curso SIN cupo: eso es "sin limite"', () => {
    expect(validarCurso({ ...BUENO, cupo: null })).toEqual({});
  });

  it('un curso GRATUITO', () => {
    // Cero no es un dato faltante: hay cursos de cortesia.
    expect(validarCurso({ ...BUENO, precioCentavos: 0 })).toEqual({});
  });

  it('un curso de un solo dia, sin fecha de fin', () => {
    expect(validarCurso({ ...BUENO, fechaFin: '' })).toEqual({});
  });
});

describe('que campo pide cada modalidad', () => {
  it('presencial pide lugar y NO enlace', () => {
    expect(necesitaLugar('presencial')).toBe(true);
    expect(necesitaEnlace('presencial')).toBe(false);
  });

  it('en linea pide enlace y NO lugar', () => {
    expect(necesitaLugar('en_linea')).toBe(false);
    expect(necesitaEnlace('en_linea')).toBe(true);
  });

  it('hibrido pide los dos', () => {
    expect(necesitaLugar('hibrido')).toBe(true);
    expect(necesitaEnlace('hibrido')).toBe(true);
  });
});

describe('las fechas del campo nativo', () => {
  it('van y vienen sin perder el dia', () => {
    expect(aInputFecha('15/07/2026')).toBe('2026-07-15');
    expect(deInputFecha('2026-07-15')).toBe('15/07/2026');
    expect(deInputFecha(aInputFecha('31/12/2026'))).toBe('31/12/2026');
  });

  it('lo que no es fecha se queda vacio en vez de romper el campo', () => {
    expect(aInputFecha('cualquier cosa')).toBe('');
    expect(deInputFecha('')).toBe('');
  });
});

describe('el formulario en pantalla', () => {
  function pintar(extra: Partial<React.ComponentProps<typeof FormularioDeCurso>> = {}) {
    const props: React.ComponentProps<typeof FormularioDeCurso> = {
      abierto: true, titulo: 'Nuevo curso', inicial: CURSO_VACIO,
      categorias: [], instructores: [], trabajando: false, error: null,
      onGuardar: () => {}, onCerrar: () => {},
      ...extra,
    };
    return render(<FormularioDeCurso {...props} />);
  }

  it('arranca VACIO, sin un dato de la captura de referencia', () => {
    pintar();
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('');
    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('Reiki Nivel 1');
    expect(texto).not.toContain('NaN');
  });

  it('el campo NO pierde el foco al escribir', async () => {
    pintar();
    const campo = screen.getByLabelText(/Nombre/);
    await userEvent.type(campo, 'Curso de Desarrollo Integral');
    expect((campo as HTMLInputElement).value).toBe('Curso de Desarrollo Integral');
    expect(document.activeElement).toBe(campo);
  });

  it('la informacion adicional viene PLEGADA', async () => {
    pintar();
    expect(screen.queryByLabelText(/Modalidad/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Lo demás del curso/ }));
    expect(screen.getByLabelText(/Modalidad/)).toBeTruthy();
  });

  it('el cupo vacio se guarda como NULO, no como cero', async () => {
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Taller');
    // `userEvent.type` no funciona con un campo de fecha nativo en happy-dom:
    // hay que empujarle el valor con `fireEvent.change`.
    fireEvent.change(screen.getByLabelText(/Empieza/), { target: { value: '2026-07-15' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect((guardar.mock.calls[0]?.[0] as DatosDeCurso).cupo).toBeNull();
  });

  it('NO guarda cuando algo esta mal, y dice que', async () => {
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el nombre del curso.')).toBeTruthy();
  });
});
