/**
 * @vitest-environment happy-dom
 *
 * La barra de controles de la Agenda.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlesDeAgenda } from '../../src/agenda/controles.js';

afterEach(cleanup);

const props = {
  vista: 'dia' as const,
  fecha: '10/07/2025',
  puedeCrear: true,
  filtrosAbiertos: false,
  filtrosPuestos: 0,
  onNueva: () => {},
  onHoy: () => {},
  onMover: () => {},
  onFecha: () => {},
  onVista: () => {},
  onFiltros: () => {},
};

describe('lo que se ve', () => {
  it('estan los nueve controles del diseño', () => {
    render(<ControlesDeAgenda {...props} />);
    for (const nombre of ['Nueva cita', 'Hoy', 'Día', 'Semana', 'Mes']) {
      expect(screen.getByRole('button', { name: nombre }), nombre).toBeDefined();
    }
    expect(screen.getByRole('button', { name: 'Día anterior' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Día siguiente' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeDefined();
    expect(screen.getByLabelText('Ir a una fecha')).toBeDefined();
  });

  it('la fecha se escribe con el mes en palabras', () => {
    render(<ControlesDeAgenda {...props} />);
    expect(screen.getByText('10 de julio de 2025')).toBeDefined();
  });

  it('sin permiso de agenda NO aparece "Nueva cita"', () => {
    render(<ControlesDeAgenda {...props} puedeCrear={false} />);
    expect(screen.queryByRole('button', { name: 'Nueva cita' })).toBeNull();
  });

  it('la vista puesta se marca para el lector de pantalla', () => {
    render(<ControlesDeAgenda {...props} vista="semana" />);
    expect(screen.getByRole('button', { name: 'Semana' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Día' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('las flechas dicen a donde llevan', () => {
  it('en vista de semana hablan de semanas, no de dias', () => {
    // "Anterior" a secas no dice si retrocede un dia, una semana o un mes.
    render(<ControlesDeAgenda {...props} vista="semana" />);
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Semana siguiente' })).toBeDefined();
  });

  it('en vista de mes hablan de meses', () => {
    render(<ControlesDeAgenda {...props} vista="mes" />);
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeDefined();
  });
});

describe('lo que hace cada control', () => {
  it('las flechas avisan hacia donde, con signo', async () => {
    const mover = vi.fn();
    render(<ControlesDeAgenda {...props} onMover={mover} />);
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    expect(mover.mock.calls.map((c) => c[0])).toEqual([1, -1]);
  });

  it('escoger en el calendario devuelve la fecha del sistema traducida', () => {
    const fecha = vi.fn();
    render(<ControlesDeAgenda {...props} onFecha={fecha} />);
    // Se escribe con `fireEvent` y no tecla por tecla: un campo de fecha no
    // acepta texto suelto, el navegador lo llena por segmentos.
    fireEvent.change(screen.getByLabelText('Ir a una fecha'), {
      target: { value: '2026-08-06' },
    });
    // El campo del sistema habla en aaaa-mm-dd; adentro todo va en dd/mm/aaaa.
    expect(fecha).toHaveBeenCalledWith('06/08/2026');
  });

  it('el selector de fecha es un campo del SISTEMA, no un menu propio', () => {
    /**
     * Es la decision que evita de raiz el fallo que ya nos costo tiempo: el
     * menu que oscurece el fondo y no aparece. El calendario del sistema
     * operativo no tiene z-index, no puede quedar debajo de nada, y en celular
     * abre la rueda nativa.
     */
    render(<ControlesDeAgenda {...props} />);
    const campo = screen.getByLabelText('Ir a una fecha');
    expect(campo.tagName).toBe('INPUT');
    expect(campo.getAttribute('type')).toBe('date');
  });

  it('cambiar de vista avisa cual', async () => {
    const vista = vi.fn();
    render(<ControlesDeAgenda {...props} onVista={vista} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mes' }));
    expect(vista).toHaveBeenCalledWith('mes');
  });
});

describe('los filtros puestos se NOTAN', () => {
  it('sin filtros el boton no lleva numero', () => {
    render(<ControlesDeAgenda {...props} />);
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeDefined();
  });

  it('con filtros se dice CUANTOS, no solo se pinta de otro color', () => {
    // Una agenda que muestra tres citas de veinte sin decir que hay un filtro
    // puesto se lee como una agenda vacia. Y el color solo no le sirve a quien
    // no lo distingue.
    render(<ControlesDeAgenda {...props} filtrosPuestos={2} />);
    expect(screen.getByRole('button', { name: 'Filtros: 2 puestos' })).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });

  it('uno solo se dice en singular', () => {
    render(<ControlesDeAgenda {...props} filtrosPuestos={1} />);
    expect(screen.getByRole('button', { name: 'Filtros: 1 puesto' })).toBeDefined();
  });
});
