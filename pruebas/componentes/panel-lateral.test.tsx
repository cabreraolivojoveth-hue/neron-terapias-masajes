/**
 * @vitest-environment happy-dom
 *
 * Los filtros de la lista y el panel de apoyo de Clientes.
 *
 * Se separaron a proposito: los filtros hacen falta SIEMPRE —tambien con un
 * expediente abierto— y el panel de apoyo solo mientras no se lee a nadie.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FiltrosRapidos,
  PanelLateral,
  RANGOS_DE_VISITAS,
  cuandoEsElCumple,
  rangoPorClave,
} from '../../src/clientes/panel-lateral.js';

afterEach(cleanup);

const props = {
  seguimientos: [], cargandoSeguimientos: false,
  cumpleanos: [], cargandoCumpleanos: false,
  onVerRecordatorios: () => {}, onAbrirSeguimiento: () => {},
  onVerCumpleanos: () => {}, onAbrirCliente: () => {},
};

const deFiltros = {
  estado: '', profesionalId: '', rango: '',
  profesionales: [{ id: 'p1', nombre: 'Terapeuta A', rol: 'dueno', usuarioId: 'u1' }],
  onEstado: () => {}, onProfesional: () => {}, onRango: () => {}, onLimpiar: () => {},
};

describe('el rango de visitas', () => {
  it('se traduce a numeros para la consulta', () => {
    expect(rangoPorClave('1-5')).toEqual({ min: 1, max: 5 });
    expect(rangoPorClave('cero')).toEqual({ min: 0, max: 0 });
  });

  it('"10 o más" NO tiene tope', () => {
    // Un tope arbitrario —999— se queda corto el dia que alguien lo pase, y
    // ese cliente desaparece del filtro sin que nadie entienda por que.
    expect(rangoPorClave('10+')).toEqual({ min: 10, max: null });
  });

  it('sin rango escogido no filtra nada', () => {
    expect(rangoPorClave('')).toEqual({ min: null, max: null });
    expect(rangoPorClave('lo que sea')).toEqual({ min: null, max: null });
  });

  it('estan los rangos del diseño', () => {
    expect(RANGOS_DE_VISITAS.map((r) => r.clave)).toEqual(['', 'cero', '1-5', '6-10', '10+']);
  });
});

describe('cuando cae un cumpleaños', () => {
  it('hoy se dice HOY, no "en 0 días"', () => {
    expect(cuandoEsElCumple(0)).toBe('Hoy');
    expect(cuandoEsElCumple(1)).toBe('Mañana');
    expect(cuandoEsElCumple(14)).toBe('En 14 días');
  });
});

describe('los estados vacios', () => {
  it('sin seguimientos lo dice, sin inventar ninguno', () => {
    render(<PanelLateral {...props} />);
    expect(screen.getByText('No hay recordatorios')).toBeTruthy();
    expect(screen.getByText('No tienes seguimientos pendientes')).toBeTruthy();
  });

  it('sin cumpleaños proximos lo dice', () => {
    render(<PanelLateral {...props} />);
    expect(screen.getByText('No hay cumpleaños próximos')).toBeTruthy();
    expect(screen.getByText('Los cumpleaños aparecerán aquí')).toBeTruthy();
  });

  it('mientras cargan NO afirma que no hay nada', () => {
    render(<PanelLateral {...props} cargandoCumpleanos cargandoSeguimientos />);
    expect(screen.queryByText('No hay cumpleaños próximos')).toBeNull();
    expect(screen.queryByText('No hay recordatorios')).toBeNull();
  });
});

describe('los filtros', () => {
  it('"Limpiar filtros" esta apagado cuando no hay ninguno', () => {
    render(<FiltrosRapidos {...deFiltros} />);
    expect((screen.getByRole('button', { name: /Limpiar filtros/ }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('con un filtro puesto se enciende y avisa', async () => {
    const limpiar = vi.fn();
    render(<FiltrosRapidos {...deFiltros} estado="activo" onLimpiar={limpiar} />);
    await userEvent.click(screen.getByRole('button', { name: /Limpiar filtros/ }));
    expect(limpiar).toHaveBeenCalled();
  });

  it('los terapeutas salen de las personas REALES del centro', () => {
    // No hay una lista de nombres escrita: son las mismas membresias que
    // ofrece la Agenda.
    render(<FiltrosRapidos {...deFiltros} />);
    expect(screen.getByRole('option', { name: 'Terapeuta A' })).toBeTruthy();
  });

  it('los tres filtros viven en UN solo sitio', () => {
    /**
     * Estaban tambien en el panel de la derecha. Dos juegos de controles para
     * los mismos tres filtros, cada uno con su estado, es como se acaba con una
     * pantalla que enseña algo que no cuadra con ninguno de los dos.
     */
    render(<PanelLateral {...props} />);
    expect(screen.queryByRole('button', { name: /Limpiar filtros/ })).toBeNull();
    expect(screen.queryByText('Rango de visitas')).toBeNull();
  });
});

describe('los cumpleaños de verdad', () => {
  it('se pintan con cuando faltan, y abren su expediente', async () => {
    const abrir = vi.fn();
    render(
      <PanelLateral
        {...props}
        cumpleanos={[{ id: 'c7', nombre: 'Alguien', fecha: '20/08/2026', enDias: 14 }]}
        onAbrirCliente={abrir}
      />,
    );
    expect(screen.getByText(/En 14 días/)).toBeTruthy();
    await userEvent.click(screen.getByText('Alguien'));
    expect(abrir).toHaveBeenCalledWith('c7');
  });
});
