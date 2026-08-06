/**
 * @vitest-environment happy-dom
 *
 * LA LISTA DE CURSOS.
 *
 * Lo que mas se cuida: que la fecha NO mienta. Cinco sábados salteados no son
 * un rango de cinco semanas, y enseñarlos como rango hace creer justo eso.
 * Y que "sin cupo" se diga, en vez de dejar un numero suelto que se lee como
 * si faltara el denominador.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TablaDeCursos,
  accionesPara,
  comoSeLeeLaFecha,
  comoSeLeenLosLugares,
} from '../../src/cursos/tabla-de-cursos.js';
import type { CursoEnLista } from '../../src/datos/cursos.js';

afterEach(cleanup);

const CURSO: CursoEnLista = {
  id: 'k1', nombre: 'Taller Uno', subtitulo: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  instructorId: null, instructor: null,
  fechaInicio: '15/07/2026', fechaFin: '16/07/2026', sesiones: 2,
  precioCentavos: 250000, cupo: 12, ocupados: 8,
  modalidad: 'presencial', imagenUrl: null, vida: 'proximo', activo: true,
};

const TODO = { gestionarCatalogo: true };
const SOLO_VER = { gestionarCatalogo: false };

function pintar(extra: Partial<React.ComponentProps<typeof TablaDeCursos>> = {}) {
  const props: React.ComponentProps<typeof TablaDeCursos> = {
    cursos: [], total: 0, pagina: 1, porPagina: 10,
    busqueda: '', pestana: '', categoriaId: '', instructorId: '', modalidad: '',
    conLugares: false, categorias: [], instructores: [],
    filtrosAbiertos: false, seleccionado: null, permisos: TODO,
    cargando: false, error: null,
    onBuscar: () => {}, onPestana: () => {}, onCategoria: () => {}, onInstructor: () => {},
    onModalidad: () => {}, onConLugares: () => {}, onFiltros: () => {},
    onPagina: () => {}, onPorPagina: () => {}, onAccion: () => {},
    onNuevo: () => {}, onReintentar: () => {},
    ...extra,
  };
  return render(<TablaDeCursos {...props} />);
}

describe('como se lee la fecha y la duracion', () => {
  it('dos dias seguidos son un rango de dos dias', () => {
    // Del 15 al 16 son DOS dias, no uno: la resta pelona daria uno.
    const f = comoSeLeeLaFecha({ fechaInicio: '15/07/2026', fechaFin: '16/07/2026', sesiones: 2 });
    expect(f.cuanto).toBe('2 días');
  });

  it('un solo dia se dice "1 día", no un rango a medias', () => {
    const f = comoSeLeeLaFecha({ fechaInicio: '05/08/2026', fechaFin: null, sesiones: 1 });
    expect(f.cuanto).toBe('1 día');
    expect(f.cuando).not.toContain('–');
  });

  it('sesiones SALTEADAS se cuentan, NO se estiran a un rango', () => {
    // Cinco sabados en dos meses no son sesenta dias de curso. Enseñarlo como
    // rango hace creer que dura dos meses corridos.
    const f = comoSeLeeLaFecha({ fechaInicio: '04/07/2026', fechaFin: '01/08/2026', sesiones: 5 });
    expect(f.cuanto).toBe('5 sesiones');
  });

  it('sin fecha NO se inventa una', () => {
    const f = comoSeLeeLaFecha({ fechaInicio: null, fechaFin: null, sesiones: 0 });
    expect(f.cuando).toBe('Sin fecha');
    expect(f.cuanto).toBe('');
  });
});

describe('como se leen los lugares', () => {
  it('con cupo va la fraccion', () => {
    expect(comoSeLeenLosLugares(12, 8)).toBe('8 / 12');
  });

  it('SIN cupo no se inventa un denominador', () => {
    expect(comoSeLeenLosLugares(null, 8)).toBe('8');
  });
});

describe('las acciones que se ofrecen', () => {
  it('lo que no se puede hacer NO se muestra, ni en gris', () => {
    expect(accionesPara(SOLO_VER, CURSO).map((a) => a.clave)).toEqual(['ver']);
  });

  it('la etiqueta del estado se VOLTEA segun el curso', () => {
    const activo = accionesPara(TODO, CURSO).find((a) => a.clave === 'estado');
    const apagado = accionesPara(TODO, { ...CURSO, activo: false }).find((a) => a.clave === 'estado');
    expect(activo?.etiqueta).toBe('Desactivar');
    expect(apagado?.etiqueta).toBe('Activar');
  });
});

describe('un programa vacio', () => {
  it('lo dice, y ofrece crear el primero', () => {
    pintar();
    expect(screen.getByText('No hay cursos registrados')).toBeTruthy();
    expect(screen.getByText('Mostrando 0 a 0 de 0 cursos')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Nuevo curso/ }).length).toBe(1);
  });

  it('con filtros puestos dice OTRA cosa', () => {
    // "No hay cursos" con un filtro puesto hace que alguien capture uno que ya
    // existe.
    pintar({ busqueda: 'reiki' });
    expect(screen.getByText('Ningún curso coincide')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nuevo curso/ })).toBeNull();
  });

  it('no aparece ni un nombre de la captura de referencia', () => {
    pintar();
    const texto = document.body.textContent ?? '';
    for (const delDiseño of ['Reiki Nivel 1', 'Biomagnetismo', 'Péndulo Hebreo', '$2,500']) {
      expect(texto).not.toContain(delDiseño);
    }
  });
});

describe('vacio y error son estados DISTINTOS', () => {
  it('un fallo de red no se lee como "no hay cursos"', () => {
    pintar({ error: 'se cayó la conexión' });
    expect(screen.getByText('No pudimos cargar los cursos.')).toBeTruthy();
    expect(screen.queryByText('No hay cursos registrados')).toBeNull();
  });

  it('mientras carga no se dice que no hay nada', () => {
    pintar({ cargando: true });
    expect(screen.queryByText('No hay cursos registrados')).toBeNull();
    expect(screen.getByText('Cargando los cursos')).toBeTruthy();
  });
});

describe('el renglon de un curso', () => {
  it('sin categoria e sin instructor lo DICE', () => {
    pintar({ cursos: [CURSO], total: 1 });
    expect(screen.getAllByText('Sin categoría').length).toBeGreaterThan(0);
  });

  it('un curso sin cupo dice "sin límite" en vez de dejar el numero suelto', () => {
    pintar({ cursos: [{ ...CURSO, cupo: null, ocupados: 4 }], total: 1 });
    expect(screen.getAllByText(/sin límite/).length).toBeGreaterThan(0);
  });

  it('un curso lleno se marca', () => {
    const { container } = pintar({ cursos: [{ ...CURSO, ocupados: 12 }], total: 1 });
    expect(container.querySelector('.cur-lugares--lleno')).toBeTruthy();
  });

  it('el estado lleva palabra, no solo color', () => {
    const { container } = pintar({ cursos: [{ ...CURSO, vida: 'finalizado' }], total: 1 });
    expect(container.querySelector('.cur-estado--finalizado')?.textContent).toBe('Finalizado');
  });
});

describe('las pestañas', () => {
  it('son cuatro, como en el diseño', () => {
    pintar();
    for (const p of ['Todos', 'Activos', 'Inactivos', 'Finalizados']) {
      expect(screen.getByRole('tab', { name: p })).toBeTruthy();
    }
  });

  it('FILTRAN de verdad: no son decoracion sobre la misma lista', () => {
    const cambiar = vi.fn();
    pintar({ onPestana: cambiar });
    return userEvent.click(screen.getByRole('tab', { name: 'Finalizados' })).then(() => {
      expect(cambiar).toHaveBeenCalledWith('finalizado');
    });
  });
});

describe('el menu de acciones', () => {
  it('se abre y avisa que se escogio', async () => {
    const hacer = vi.fn();
    pintar({ cursos: [CURSO], total: 1, onAccion: hacer });
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Taller Uno' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(hacer.mock.calls[0]?.[0]).toBe('editar');
  });

  it('se cierra con Escape', async () => {
    pintar({ cursos: [CURSO], total: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Taller Uno' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('el buscador', () => {
  it('conserva lo escrito y se puede leer por su etiqueta', () => {
    pintar({ filtrosAbiertos: true, busqueda: 'reiki' });
    expect((screen.getByLabelText(/Buscar curso/) as HTMLInputElement).value).toBe('reiki');
  });
});

describe('la paginacion', () => {
  it('cuenta con el TOTAL del servidor, no con las filas visibles', () => {
    pintar({ cursos: [CURSO], total: 340, pagina: 1, porPagina: 10 });
    expect(screen.getByText('Mostrando 1 a 1 de 340 cursos')).toBeTruthy();
    expect(screen.getByText('1 de 34')).toBeTruthy();
  });

  it('en la primera pagina no se puede ir hacia atras', () => {
    pintar({ cursos: [CURSO], total: 340 });
    expect((screen.getByRole('button', { name: 'Página anterior' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});
