/**
 * @vitest-environment happy-dom
 *
 * LOS REPORTES GUARDADOS.
 *
 * LO QUE SE GUARDA ES LA PREGUNTA, NO LA RESPUESTA, y eso hay que decirlo en la
 * pantalla: quien espera un PDF con las cifras congeladas y recibe una consulta
 * que se recalcula tiene que enterarse al guardarlo, no la primera vez que un
 * total no coincide con el papel que imprimio.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fecha } from '@neron/base/utils';
import type { ReporteGuardado } from '../../src/datos/reportes.js';
import {
  GuardarReporte,
  HistorialDeReportes,
  cuandoSeGuardo,
  tipoEnPalabras,
} from '../../src/reportes/guardados.js';

afterEach(cleanup);

const GUARDADO: ReporteGuardado = {
  id: 'r1', nombre: 'Cierre del mes', tipo: 'ventas',
  desde: '01/07/2026' as Fecha, hasta: '31/07/2026' as Fecha,
  filtros: { tipo: '', metodo: 'efectivo', vendedorId: '' },
  creadoEn: '2026-08-01T10:30:00Z', creadoPor: 'Quien administra',
};

describe('cómo se escribe la fecha de guardado', () => {
  it('se corta el texto en vez de pasarlo por new Date', () => {
    /**
     * `new Date(iso).toLocaleDateString()` mueve la marca a la zona del
     * navegador: un reporte guardado a las once de la noche saldria con la
     * fecha del dia siguiente para quien lo abra desde otro huso.
     */
    expect(cuandoSeGuardo('2026-08-01T10:30:00Z')).toBe('01/08/2026 10:30');
  });

  it('una marca sin hora no escribe basura', () => {
    expect(cuandoSeGuardo('2026-08-01')).toBe('01/08/2026');
    expect(cuandoSeGuardo('')).toBe('');
  });

  it('el tipo se escribe como se llama la pestaña', () => {
    expect(tipoEnPalabras('ventas')).toBe('Ventas');
    expect(tipoEnPalabras('resumen')).toBe('Resumen');
    // Un tipo viejo que ya no existe se enseña tal cual en vez de desaparecer.
    expect(tipoEnPalabras('inventado')).toBe('inventado');
  });
});

describe('el historial', () => {
  type DelHistorial = Parameters<typeof HistorialDeReportes>[0];
  function pintar(sobre: Partial<DelHistorial> = {}) {
    return render(
      <HistorialDeReportes
        guardados={[]}
        cargando={false}
        puedeGestionar
        onAbrir={() => {}}
        onExportar={() => {}}
        onBorrar={() => {}}
        {...sobre}
      />,
    );
  }

  it('sin ninguno explica qué se guarda y para qué', () => {
    pintar();
    expect(screen.getByText(/con su período y sus filtros/)).toBeTruthy();
  });

  it('la columna dice "Guardado el" y no "Generado el"', () => {
    /**
     * Lo que tiene fecha es cuando alguien decidio guardar esa pregunta, no
     * cuando se contesto: la respuesta es de ahora mismo, cada vez.
     */
    pintar({ guardados: [GUARDADO] });
    expect(screen.getByText('Guardado el')).toBeTruthy();
    expect(screen.queryByText('Generado el')).toBeNull();
  });

  it('lista el nombre, el tipo y el periodo', () => {
    pintar({ guardados: [GUARDADO] });
    expect(screen.getByRole('button', { name: 'Cierre del mes' })).toBeTruthy();
    expect(screen.getByText('Ventas')).toBeTruthy();
    expect(screen.getByText('01/07/2026 – 31/07/2026')).toBeTruthy();
  });

  it('tocar el nombre lo abre', async () => {
    const onAbrir = vi.fn();
    pintar({ guardados: [GUARDADO], onAbrir });
    await userEvent.click(screen.getByRole('button', { name: 'Cierre del mes' }));
    expect(onAbrir).toHaveBeenCalledWith(GUARDADO);
  });
});

describe('el diálogo de guardar', () => {
  type DelDialogo = Parameters<typeof GuardarReporte>[0];
  function pintar(sobre: Partial<DelDialogo> = {}) {
    return render(
      <GuardarReporte
        abierto
        pestana="resumen"
        periodo="1 – 31 de agosto, 2026"
        trabajando={false}
        error={null}
        onGuardar={() => {}}
        onCerrar={() => {}}
        {...sobre}
      />,
    );
  }

  it('avisa que se guarda la pregunta y no las cifras', () => {
    pintar();
    expect(screen.getByText(/no las cifras/)).toBeTruthy();
  });

  it('dice qué sección y qué periodo se va a guardar', () => {
    pintar();
    expect(screen.getByText('Resumen')).toBeTruthy();
    expect(screen.getByText('1 – 31 de agosto, 2026')).toBeTruthy();
  });

  it('sin nombre NO deja guardar', () => {
    // Un reporte sin nombre no se vuelve a encontrar, que es lo unico para lo
    // que sirve guardarlo.
    pintar();
    expect(screen.getByRole('button', { name: 'Guardar' }).hasAttribute('disabled')).toBe(true);
  });

  it('con nombre guarda lo escrito, sin espacios de sobra', async () => {
    const onGuardar = vi.fn();
    pintar({ onGuardar });
    await userEvent.type(screen.getByLabelText(/Nombre/), '  Cierre de agosto  ');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onGuardar).toHaveBeenCalledWith('Cierre de agosto');
  });

  it('mientras guarda no se puede cerrar a medias', () => {
    // `bloqueado` quita la X y Escape: cerrar a media escritura pierde el
    // nombre y deja sin saber si se guardo.
    pintar({ trabajando: true });
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
  });

  it('un fallo del servidor se enseña, no se traga', () => {
    pintar({ error: 'El reporte necesita un nombre' });
    expect(screen.getByText('El reporte necesita un nombre')).toBeTruthy();
  });
});
