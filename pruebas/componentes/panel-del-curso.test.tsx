/**
 * @vitest-environment happy-dom
 *
 * EL PANEL DE DETALLE DE UN CURSO.
 *
 * Las cuatro pestañas tienen contenido REAL o dicen que no lo hay. Y el
 * horario sale de las SESIONES, no de un campo del curso: con horarios
 * distintos entre sesiones se dice que varian, en vez de enseñar el de la
 * primera como si fuera el de todas.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PanelDelCurso,
  comoSeLeeElHorario,
  loQuePasaAlApagarElCurso,
} from '../../src/cursos/panel-del-curso.js';
import type { FichaDeCurso, SesionDelCurso } from '../../src/datos/cursos.js';

afterEach(cleanup);

const sesion = (p: Partial<SesionDelCurso> & { id: string }): SesionDelCurso => ({
  titulo: null, fecha: '15/07/2026', horaInicio: '09:00', horaFin: '15:00',
  instructorId: null, instructor: null, lugar: null, estado: 'programada', ...p,
});

const FICHA: FichaDeCurso = {
  id: 'k1', nombre: 'Taller Uno', subtitulo: null, descripcion: null, notas: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  instructorId: null, instructor: null,
  fechaInicio: '15/07/2026', fechaFin: '16/07/2026', precioCentavos: 250000,
  cupo: 12, ocupados: 0, enEspera: 0,
  modalidad: 'presencial', lugar: null, enlace: null, imagenUrl: null,
  estado: 'programado', activo: true, vida: 'proximo',
  alumnos: [], sesiones: [], material: [],
};

function pintar(extra: Partial<React.ComponentProps<typeof PanelDelCurso>> = {}) {
  const props: React.ComponentProps<typeof PanelDelCurso> = {
    ficha: FICHA, cargando: false, error: null, permisos: { gestionarCatalogo: true },
    instructores: [], clientes: [], trabajando: false, errorDeOperacion: null,
    onEditar: () => {}, onCambiarEstado: () => {}, onCerrar: () => {},
    onBuscarCliente: () => {}, onInscribir: () => {}, onCambiarInscripcion: () => {},
    onNuevoCliente: () => {}, onAbrirCliente: () => {},
    onGuardarSesion: () => {}, onArchivarSesion: () => {},
    onGuardarMaterial: () => {}, onArchivarMaterial: () => {},
    ...extra,
  };
  return render(<PanelDelCurso {...props} />);
}

describe('el horario sale de las SESIONES', () => {
  it('sin sesiones lo dice, en vez de inventar un horario', () => {
    expect(comoSeLeeElHorario(FICHA)).toBe('Sin sesiones programadas');
  });

  it('con sesiones iguales se dice el horario', () => {
    const f = { ...FICHA, sesiones: [sesion({ id: 'a' }), sesion({ id: 'b' })] };
    expect(comoSeLeeElHorario(f)).toBe('09:00 – 15:00');
  });

  it('con horarios DISTINTOS se dice que varian', () => {
    // Enseñar el de la primera como si fuera el de todas hace que alguien
    // llegue a la hora equivocada a la segunda.
    const f = {
      ...FICHA,
      sesiones: [sesion({ id: 'a' }), sesion({ id: 'b', horaInicio: '16:00', horaFin: '20:00' })],
    };
    expect(comoSeLeeElHorario(f)).toBe('Varía según la sesión');
  });

  it('una sesion CANCELADA no cuenta para el horario', () => {
    const f = {
      ...FICHA,
      sesiones: [sesion({ id: 'a' }), sesion({ id: 'b', horaInicio: '16:00', estado: 'cancelada' })],
    };
    expect(comoSeLeeElHorario(f)).toBe('09:00 – 15:00');
  });
});

describe('apagar un curso', () => {
  it('dice CUANTOS alumnos tiene antes de decidir', () => {
    expect(loQuePasaAlApagarElCurso({ ...FICHA, ocupados: 12 })).toContain('12 alumnos inscritos');
    expect(loQuePasaAlApagarElCurso({ ...FICHA, ocupados: 1 })).toContain('1 alumno inscrito');
    expect(loQuePasaAlApagarElCurso({ ...FICHA, ocupados: 0 })).toContain('nadie inscrito');
  });

  it('encender dice otra cosa', () => {
    expect(loQuePasaAlApagarElCurso({ ...FICHA, activo: false })).toContain('Volverá a ofrecerse');
  });

  it('sin ficha no se inventa un aviso', () => {
    expect(loQuePasaAlApagarElCurso(null)).toBe('');
  });
});

describe('el panel sin nada escogido', () => {
  it('invita a tocar un curso en vez de quedarse en blanco', () => {
    pintar({ ficha: null });
    expect(screen.getByText(/Toca un curso/)).toBeTruthy();
  });
});

describe('un curso recien creado', () => {
  it('cada hueco DICE que esta vacio', () => {
    pintar();
    expect(screen.getByText('Sin categoría')).toBeTruthy();
    expect(screen.getByText('Sin asignar')).toBeTruthy();
    expect(screen.getByText('Sin descripción')).toBeTruthy();
  });

  it('no aparece ni un dato de la captura de referencia', () => {
    pintar();
    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('NaN');
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('María López');
  });

  it('las cuatro pestañas existen y las tres vacias lo dicen', async () => {
    pintar();
    await userEvent.click(screen.getByRole('tab', { name: 'Alumnos' }));
    expect(screen.getByText(/Todavía no hay nadie inscrito/)).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Sesiones' }));
    expect(screen.getByText(/todavía no tiene sesiones/)).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Material' }));
    expect(screen.getByText(/todavía no tiene material/)).toBeTruthy();
  });
});

describe('el campo se pide segun la modalidad', () => {
  it('un curso PRESENCIAL enseña lugar y NO enlace', () => {
    pintar({ ficha: { ...FICHA, modalidad: 'presencial' } });
    expect(screen.getByText('Lugar')).toBeTruthy();
    expect(screen.queryByText('Enlace')).toBeNull();
  });

  it('un curso EN LINEA enseña enlace y NO lugar', () => {
    // "Lugar: —" en un curso en linea hace pensar que falta un dato.
    pintar({ ficha: { ...FICHA, modalidad: 'en_linea' } });
    expect(screen.queryByText('Lugar')).toBeNull();
    expect(screen.getByText('Enlace')).toBeTruthy();
  });
});

describe('el cupo', () => {
  it('sin limite se DICE, nunca un numero enorme', () => {
    pintar({ ficha: { ...FICHA, cupo: null } });
    expect(screen.getByText('Sin límite')).toBeTruthy();
    expect(document.body.textContent ?? '').not.toContain('999999');
  });

  it('con cupo se enseña la ocupacion calculada', () => {
    pintar({ ficha: { ...FICHA, cupo: 12, ocupados: 9 } });
    expect(screen.getByText(/75% de ocupación/)).toBeTruthy();
  });
});

describe('los permisos', () => {
  it('sin permiso NO se ofrece editar ni apagar', () => {
    pintar({ permisos: { gestionarCatalogo: false } });
    expect(screen.queryByRole('button', { name: /Editar curso/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desactivar curso/ })).toBeNull();
  });

  it('se puede cerrar', async () => {
    const cerrar = vi.fn();
    pintar({ onCerrar: cerrar });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar el detalle' }));
    expect(cerrar).toHaveBeenCalled();
  });
});

describe('vacio y error son estados DISTINTOS', () => {
  it('un fallo de red no se lee como "curso sin datos"', () => {
    pintar({ ficha: null, error: 'se cayó la conexión' });
    expect(screen.getByText('No pudimos cargar el curso.')).toBeTruthy();
    expect(screen.queryByText(/Toca un curso/)).toBeNull();
  });
});
