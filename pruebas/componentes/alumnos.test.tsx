/**
 * @vitest-environment happy-dom
 *
 * LA PESTAÑA DE ALUMNOS.
 *
 * Lo que mas importa: que INSCRIPCION y PAGO se lean como dos cosas distintas,
 * y que la lista de espera NO se cuente como lugar ocupado.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Alumnos,
  alumnosDeBaja,
  alumnosEnEspera,
  alumnosQueOcupan,
  avisoDeCupo,
} from '../../src/cursos/alumnos.js';
import type { AlumnoDelCurso, FichaDeCurso } from '../../src/datos/cursos.js';

afterEach(cleanup);

const alumno = (p: Partial<AlumnoDelCurso> & { id: string }): AlumnoDelCurso => ({
  clienteId: 'c' + p.id, nombre: 'Persona ' + p.id, telefono: null, correo: null,
  estado: 'inscrito', origen: 'manual', inscritoEn: '2026-07-01', pagada: false, ...p,
});

const FICHA: FichaDeCurso = {
  id: 'k1', nombre: 'Taller', subtitulo: null, descripcion: null, notas: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  instructorId: null, instructor: null,
  fechaInicio: '15/07/2026', fechaFin: null, precioCentavos: 0,
  cupo: 2, ocupados: 0, enEspera: 0,
  modalidad: 'presencial', lugar: null, enlace: null, imagenUrl: null,
  estado: 'programado', activo: true, vida: 'proximo',
  alumnos: [], sesiones: [], material: [],
};

function pintar(extra: Partial<React.ComponentProps<typeof Alumnos>> = {}) {
  const props: React.ComponentProps<typeof Alumnos> = {
    ficha: FICHA, permisos: { gestionarCatalogo: true }, clientes: [],
    trabajando: false, error: null,
    onBuscarCliente: () => {}, onInscribir: () => {}, onCambiarEstado: () => {},
    onNuevoCliente: () => {}, onAbrirCliente: () => {},
    ...extra,
  };
  return render(<Alumnos {...props} />);
}

describe('quien ocupa lugar', () => {
  it('la LISTA DE ESPERA no ocupa: para eso existe', () => {
    // Contarla como ocupada dejaria fuera a quien si cabe.
    const todos = [
      alumno({ id: '1' }),
      alumno({ id: '2', estado: 'lista_espera' }),
      alumno({ id: '3', estado: 'cancelado' }),
      alumno({ id: '4', estado: 'asistio' }),
    ];
    expect(alumnosQueOcupan(todos).map((a) => a.id)).toEqual(['1', '4']);
    expect(alumnosEnEspera(todos).map((a) => a.id)).toEqual(['2']);
    expect(alumnosDeBaja(todos).map((a) => a.id)).toEqual(['3']);
  });
});

describe('el aviso de cupo', () => {
  it('con lugares no se avisa nada', () => {
    expect(avisoDeCupo({ ...FICHA, cupo: 12, ocupados: 3 })).toBe('');
  });

  it('lleno DICE que entra a lista de espera, no que se rechaza', () => {
    expect(avisoDeCupo({ ...FICHA, cupo: 2, ocupados: 2 })).toContain('lista de espera');
  });

  it('sin cupo NUNCA esta lleno', () => {
    expect(avisoDeCupo({ ...FICHA, cupo: null, ocupados: 999 })).toBe('');
  });
});

describe('un curso sin nadie inscrito', () => {
  it('lo dice, y explica de donde salen los alumnos', () => {
    pintar();
    expect(screen.getByText(/Todavía no hay nadie inscrito/)).toBeTruthy();
    // Ni un nombre de la captura de referencia.
    expect(document.body.textContent ?? '').not.toContain('María López');
  });
});

describe('inscripcion y pago son DOS cosas', () => {
  it('un inscrito que no ha pagado lo dice en dos etiquetas distintas', () => {
    // Una sola etiqueta que mezclara las dos haria imposible saber a quien hay
    // que cobrarle.
    pintar({ ficha: { ...FICHA, alumnos: [alumno({ id: '1', pagada: false })] } });
    expect(screen.getByText('Inscrito')).toBeTruthy();
    expect(screen.getByText('Sin pago')).toBeTruthy();
  });

  it('un cancelado que YA habia pagado sigue diciendo que pago', () => {
    pintar({
      ficha: { ...FICHA, alumnos: [alumno({ id: '1', estado: 'cancelado', pagada: true })] },
    });
    expect(screen.getByText('Cancelado')).toBeTruthy();
    expect(screen.getByText('Pagado')).toBeTruthy();
  });
});

describe('inscribir', () => {
  it('busca en CLIENTES: no hay una lista de alumnos aparte', async () => {
    pintar({ clientes: [{ id: 'c9', nombre: 'Persona Nueva', telefono: '6641234567' }] });
    await userEvent.click(screen.getByRole('button', { name: /Inscribir alumno/ }));
    expect(screen.getByLabelText(/Buscar cliente/)).toBeTruthy();
    expect(screen.getByText('Persona Nueva')).toBeTruthy();
  });

  it('a quien YA esta inscrito no se le ofrece otra vez', async () => {
    // La base lo rechazaria y el mensaje llegaria despues del clic.
    pintar({
      ficha: { ...FICHA, alumnos: [alumno({ id: '1', clienteId: 'c9' })] },
      clientes: [{ id: 'c9', nombre: 'Persona Nueva', telefono: null }],
    });
    await userEvent.click(screen.getByRole('button', { name: /Inscribir alumno/ }));
    expect(screen.getByText('Ya inscrito')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Inscribir' })).toBeNull();
  });

  it('avisa cuando llenaria la lista de espera', async () => {
    pintar({ ficha: { ...FICHA, cupo: 1, ocupados: 1 } });
    await userEvent.click(screen.getByRole('button', { name: /Inscribir alumno/ }));
    expect(screen.getByText(/lista de espera/)).toBeTruthy();
  });

  it('dar de alta a alguien nuevo manda a CLIENTES', async () => {
    const nuevo = vi.fn();
    pintar({ onNuevoCliente: nuevo });
    await userEvent.click(screen.getByRole('button', { name: /Inscribir alumno/ }));
    await userEvent.click(screen.getByRole('button', { name: /darlo de alta/ }));
    expect(nuevo).toHaveBeenCalled();
  });
});

describe('dar de baja', () => {
  it('PIDE confirmacion y dice que no se borra nada', async () => {
    const cambiar = vi.fn();
    pintar({
      ficha: { ...FICHA, alumnos: [alumno({ id: '1' })] },
      onCambiarEstado: cambiar,
    });
    await userEvent.click(screen.getByRole('button', { name: /Dar de baja/ }));
    expect(cambiar).not.toHaveBeenCalled();
    expect(screen.getByText(/No se borra nada/)).toBeTruthy();
  });
});

describe('los permisos', () => {
  it('sin permiso NO se ofrece inscribir ni dar de baja', () => {
    pintar({
      permisos: { gestionarCatalogo: false },
      ficha: { ...FICHA, alumnos: [alumno({ id: '1' })] },
    });
    expect(screen.queryByRole('button', { name: /Inscribir alumno/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Dar de baja/ })).toBeNull();
  });
});
