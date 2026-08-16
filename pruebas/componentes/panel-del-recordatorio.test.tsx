/**
 * @vitest-environment happy-dom
 *
 * LA FICHA DE UN RECORDATORIO: datos, relacion, acciones e historial.
 *
 * Lo que se vigila es que NO SE OFREZCA LO QUE NO SE PUEDE HACER: uno cerrado no
 * se pospone, uno cancelado no se vuelve a cancelar, y quien no gestiona solo
 * mira.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventoDelHistorial, RecordatorioEnLista } from '../../src/datos/recordatorios.js';
import {
  PanelDelRecordatorio,
  comoSeLeeLaAccion,
  momentoEnPalabras,
} from '../../src/recordatorios/panel-del-recordatorio.js';

afterEach(cleanup);

const HOY = '16/08/2026';

const uno = (r: Partial<RecordatorioEnLista> = {}): RecordatorioEnLista => ({
  id: 'r1',
  titulo: 'Llamar al proveedor',
  detalle: 'Preguntar por el pedido',
  notas: null,
  fecha: HOY,
  hora: '10:00',
  prioridad: 'alta',
  estado: 'pendiente',
  vencido: false,
  categoriaId: null,
  categoria: null,
  categoriaColor: null,
  responsableId: null,
  responsable: null,
  entidadTipo: null,
  entidadId: null,
  entidadNombre: null,
  entidadContacto: null,
  recurrenteId: null,
  recurrencia: null,
  automatizacionId: null,
  origenTipo: null,
  anticipacionMin: null,
  notificadoEn: null,
  completadoEn: null,
  completadoPor: null,
  creadoPor: null,
  creadoEn: '2026-08-16T08:00:00Z',
  actualizadoEn: null,
  ...r,
});

const props = {
  recordatorio: uno(),
  hoy: HOY,
  historial: [] as EventoDelHistorial[],
  cargandoHistorial: false,
  puedeGestionar: true,
  onEditar: () => {},
  onCompletar: () => {},
  onPosponer: () => {},
  onDuplicar: () => {},
  onCancelar: () => {},
  onEliminar: () => {},
  onAbrirEntidad: () => {},
  onEnviarMensaje: () => {},
  onCerrar: () => {},
};

describe('sin nada escogido', () => {
  it('no se pinta un panel vacio', () => {
    // Un marco con rayas donde deberian ir los datos se lee como algo que fallo
    // al cargar.
    const { container } = render(<PanelDelRecordatorio {...props} recordatorio={null} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('lo que se ve', () => {
  it('el titulo, la descripcion, el estado y la prioridad', () => {
    render(<PanelDelRecordatorio {...props} />);
    expect(screen.getByText('Llamar al proveedor')).toBeTruthy();
    expect(screen.getByText('Preguntar por el pedido')).toBeTruthy();
    expect(screen.getByText('Hoy')).toBeTruthy();
    expect(screen.getByText('Alta')).toBeTruthy();
  });

  it('lo que falta se DICE, no se deja el hueco', () => {
    render(<PanelDelRecordatorio {...props} />);
    expect(screen.getByText('Sin categoría')).toBeTruthy();
    expect(screen.getByText('Sin asignar')).toBeTruthy();
  });

  it('el que nacio de una automatizacion lo dice', () => {
    // Sin esto, quien no recuerda haberlo escrito cree que se lo puso otra
    // persona.
    render(<PanelDelRecordatorio {...props} recordatorio={uno({ automatizacionId: 'a1' })} />);
    expect(screen.getByText('Una automatización')).toBeTruthy();
  });
});

describe('la relacion', () => {
  it('sin relacion no se pinta la seccion', () => {
    render(<PanelDelRecordatorio {...props} />);
    expect(screen.queryByText('Relacionado con')).toBeNull();
  });

  it('con relacion es un ENLACE que abre la cosa de verdad', async () => {
    const usuario = userEvent.setup();
    const abrir = vi.fn();
    render(
      <PanelDelRecordatorio
        {...props}
        recordatorio={uno({ entidadTipo: 'cliente', entidadId: 'c1', entidadNombre: 'Quien sea' })}
        onAbrirEntidad={abrir}
      />,
    );
    await usuario.click(screen.getByText('Quien sea').closest('button')!);
    expect(abrir).toHaveBeenCalled();
  });

  it('"Enviar mensaje" solo sale si hay a quien escribirle', () => {
    const { rerender } = render(
      <PanelDelRecordatorio
        {...props}
        recordatorio={uno({ entidadTipo: 'producto', entidadId: 'p1', entidadNombre: 'Aceite' })}
      />,
    );
    expect(screen.queryByRole('button', { name: /Enviar mensaje/ })).toBeNull();

    rerender(
      <PanelDelRecordatorio
        {...props}
        recordatorio={uno({
          entidadTipo: 'cliente',
          entidadId: 'c1',
          entidadNombre: 'Quien sea',
          entidadContacto: '6640000000',
        })}
      />,
    );
    expect(screen.getByRole('button', { name: /Enviar mensaje/ })).toBeTruthy();
  });
});

describe('las acciones', () => {
  it('lo pendiente se completa y se pospone', () => {
    render(<PanelDelRecordatorio {...props} />);
    expect(screen.getByRole('button', { name: 'Completar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Posponer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reabrir' })).toBeNull();
  });

  it('lo cerrado se REABRE, y ya no se pospone ni se cancela', () => {
    render(<PanelDelRecordatorio {...props} recordatorio={uno({ estado: 'hecho' })} />);
    expect(screen.getByRole('button', { name: 'Reabrir' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Completar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Posponer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  it('completar avisa con true y reabrir con false', async () => {
    const usuario = userEvent.setup();
    const completar = vi.fn();
    const { rerender } = render(<PanelDelRecordatorio {...props} onCompletar={completar} />);
    await usuario.click(screen.getByRole('button', { name: 'Completar' }));
    expect(completar).toHaveBeenCalledWith(true);

    rerender(
      <PanelDelRecordatorio
        {...props}
        recordatorio={uno({ estado: 'hecho' })}
        onCompletar={completar}
      />,
    );
    await usuario.click(screen.getByRole('button', { name: 'Reabrir' }));
    expect(completar).toHaveBeenLastCalledWith(false);
  });

  it('quien no gestiona no ve NI UNA accion', () => {
    render(<PanelDelRecordatorio {...props} puedeGestionar={false} />);
    expect(screen.queryByRole('button', { name: 'Completar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
    // Pero si puede cerrar el panel.
    expect(screen.getByLabelText('Cerrar el detalle')).toBeTruthy();
  });
});

describe('el historial', () => {
  it('sin movimientos se dice', () => {
    render(<PanelDelRecordatorio {...props} />);
    expect(screen.getByText('Todavía no hay movimientos que contar.')).toBeTruthy();
  });

  it('cada paso dice QUE paso y QUIEN lo hizo', () => {
    render(
      <PanelDelRecordatorio
        {...props}
        historial={[
          {
            id: 'e1',
            accion: 'pospuesto',
            antes: null,
            despues: null,
            usuario: 'Quien administra',
            creadoEn: '2026-08-16T14:05:00',
          },
        ]}
      />,
    );
    expect(screen.getByText('Se pospuso')).toBeTruthy();
    expect(screen.getByText(/Quien administra/)).toBeTruthy();
  });

  it('la accion se traduce aqui, no se guarda traducida', () => {
    // La base anota "pospuesto", que es corto y se puede filtrar; la frase en
    // español puede mejorarse sin migrar una sola fila.
    expect(comoSeLeeLaAccion('completado')).toBe('Se marcó como completado');
    expect(comoSeLeeLaAccion('automatico')).toBe('Lo creó una automatización');
  });

  it('una accion desconocida se enseña tal cual en vez de desaparecer', () => {
    expect(comoSeLeeLaAccion('algo_nuevo')).toBe('algo_nuevo');
  });
});

describe('el momento, legible', () => {
  it('un ISO se convierte a dd/mm/aaaa con la hora', () => {
    expect(momentoEnPalabras('2026-08-16T14:05:00')).toBe('16/08/2026 · 14:05');
  });

  it('un texto que no es fecha no revienta: se queda vacio', () => {
    expect(momentoEnPalabras('cualquier cosa')).toBe('');
    expect(momentoEnPalabras('')).toBe('');
  });
});
