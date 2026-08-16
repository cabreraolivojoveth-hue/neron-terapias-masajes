/**
 * @vitest-environment happy-dom
 *
 * EL COSTADO: la dona, lo que viene, las acciones rápidas y el consejo.
 *
 * LA PRUEBA QUE MAS IMPORTA: con todo en cero NO se dibuja el anillo. Un
 * grafico repartido a partes iguales sobre un centro sin recordatorios miente
 * en la unica direccion que importa — hacia arriba.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESUMEN_VACIO, type ResumenDeRecordatorios } from '../../src/datos/recordatorios.js';
import {
  CONSEJO_DEL_PRODUCTO,
  CostadoDeRecordatorios,
  Dona,
  trozosDeLaDona,
} from '../../src/recordatorios/costado-de-recordatorios.js';

afterEach(cleanup);

const HOY = '16/08/2026';

const resumen = (r: Partial<ResumenDeRecordatorios> = {}): ResumenDeRecordatorios => ({
  ...RESUMEN_VACIO,
  ...r,
});

const props = {
  resumen: resumen(),
  hoy: HOY,
  cargando: false,
  puedeGestionar: true,
  puedeConfigurar: true,
  onAbrir: () => {},
  onVerTodos: () => {},
  onNuevo: () => {},
  onNuevoRecurrente: () => {},
  onCategorias: () => {},
  onHistorialCompletado: () => {},
};

describe('la dona', () => {
  it('con todo en cero NO se dibuja', () => {
    expect(Dona({ trozos: trozosDeLaDona(resumen()) })).toBeNull();
  });

  it('con datos se dibuja un arco por trozo que tenga algo', () => {
    render(<Dona trozos={trozosDeLaDona(resumen({ pendientes: 3, completados: 2 }))} />);
    expect(document.querySelectorAll('.rec-dona__arco')).toHaveLength(2);
  });

  it('los arcos se reparten proporcionalmente, no a partes iguales', () => {
    render(<Dona trozos={trozosDeLaDona(resumen({ pendientes: 3, completados: 1 }))} />);
    const arcos = [...document.querySelectorAll('.rec-dona__arco')];
    const largo = (i: number): number =>
      Number(arcos[i]!.getAttribute('stroke-dasharray')!.split(' ')[0]);
    expect(largo(0)).toBeCloseTo(largo(1) * 3, 1);
  });

  it('lleva su descripcion para quien no ve el dibujo', () => {
    render(<Dona trozos={trozosDeLaDona(resumen({ pendientes: 3 }))} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Pendientes: 3');
  });

  it('los cuatro trozos son los MISMOS numeros de las tarjetas de arriba', () => {
    // Si contaran otra cosa habria dos cifras distintas de lo mismo en la misma
    // pantalla, y quien la mire no sabria cual creer.
    const r = resumen({ pendientes: 12, hoy: 5, proximos: 8, completados: 27 });
    expect(trozosDeLaDona(r).map((t) => t.cuantos)).toEqual([12, 5, 8, 27]);
  });
});

describe('el resumen', () => {
  it('sin nada se dice, en vez de pintar un grafico falso', () => {
    render(<CostadoDeRecordatorios {...props} />);
    expect(screen.getByText('Cuando tengas recordatorios, aquí verás cómo se reparten.')).toBeTruthy();
    expect(document.querySelector('.rec-dona')).toBeNull();
  });

  it('con datos sale la dona, la leyenda y el total', () => {
    render(
      <CostadoDeRecordatorios
        {...props}
        resumen={resumen({ pendientes: 12, completados: 27, total: 39 })}
      />,
    );
    expect(document.querySelector('.rec-dona')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('39')).toBeTruthy();
  });

  it('el promedio NO sale si no hay con que calcularlo', () => {
    // Un "0 h" de un centro que no ha cerrado ni uno se lee como que todo se
    // resuelve al instante.
    render(<CostadoDeRecordatorios {...props} resumen={resumen({ horasPromedio: null })} />);
    expect(screen.queryByText(/de promedio/)).toBeNull();
  });

  it('con promedio, se dice', () => {
    render(
      <CostadoDeRecordatorios
        {...props}
        resumen={resumen({ pendientes: 1, horasPromedio: 3.5 })}
      />,
    );
    expect(screen.getByText(/3.5 h de promedio/)).toBeTruthy();
  });
});

describe('los proximos', () => {
  it('sin ninguno se dice, no se deja el hueco', () => {
    render(<CostadoDeRecordatorios {...props} />);
    expect(screen.getByText('No hay recordatorios próximos.')).toBeTruthy();
  });

  it('al tocar uno se abre ese, no otro', async () => {
    const usuario = userEvent.setup();
    const abrir = vi.fn();
    render(
      <CostadoDeRecordatorios
        {...props}
        onAbrir={abrir}
        resumen={resumen({
          pendientes: 1,
          proximosRecordatorios: [
            {
              id: 'r7',
              titulo: 'Confirmar la sesión',
              fecha: HOY,
              hora: '14:00',
              prioridad: 'normal',
              entidadTipo: 'cita',
              entidadNombre: 'Quien sea',
              categoria: null,
              vencido: false,
            },
          ],
        })}
      />,
    );
    await usuario.click(screen.getByText('Confirmar la sesión').closest('button')!);
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ id: 'r7' }));
  });
});

describe('las acciones rapidas', () => {
  it('las cuatro del diseño estan, y ninguna es decorativa', async () => {
    const usuario = userEvent.setup();
    const nuevo = vi.fn();
    const recurrente = vi.fn();
    const categorias = vi.fn();
    const historial = vi.fn();
    render(
      <CostadoDeRecordatorios
        {...props}
        onNuevo={nuevo}
        onNuevoRecurrente={recurrente}
        onCategorias={categorias}
        onHistorialCompletado={historial}
      />,
    );
    await usuario.click(screen.getByRole('button', { name: /Nuevo recordatorio/ }));
    await usuario.click(screen.getByRole('button', { name: /Recordatorio recurrente/ }));
    await usuario.click(screen.getByRole('button', { name: /Categorías/ }));
    await usuario.click(screen.getByRole('button', { name: /Historial completado/ }));
    expect(nuevo).toHaveBeenCalled();
    expect(recurrente).toHaveBeenCalled();
    expect(categorias).toHaveBeenCalled();
    expect(historial).toHaveBeenCalled();
  });

  it('quien no puede configurar no ve el boton de categorias', () => {
    render(<CostadoDeRecordatorios {...props} puedeConfigurar={false} />);
    expect(screen.queryByRole('button', { name: /Categorías/ })).toBeNull();
    // El historial si: es solo mirar.
    expect(screen.getByRole('button', { name: /Historial completado/ })).toBeTruthy();
  });
});

describe('el consejo del dia', () => {
  it('sin uno configurado va el del producto', () => {
    render(<CostadoDeRecordatorios {...props} />);
    expect(screen.getByText(CONSEJO_DEL_PRODUCTO)).toBeTruthy();
  });

  it('el del centro manda sobre el del producto', () => {
    render(<CostadoDeRecordatorios {...props} resumen={resumen({ consejo: 'Lo nuestro' })} />);
    expect(screen.getByText('Lo nuestro')).toBeTruthy();
    expect(screen.queryByText(CONSEJO_DEL_PRODUCTO)).toBeNull();
  });
});
