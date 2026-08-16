/**
 * @vitest-environment happy-dom
 *
 * LOS MENSAJES AUTOMÁTICOS.
 *
 * Lo que se vigila es lo único de este módulo que no se puede deshacer: que una
 * automatización NO nazca encendida, y que no se pueda encender sin saber qué
 * mandar ni por dónde. Un mensaje que sale solo ya llegó.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ordenarAutomatizacion,
  ordenarCanal,
  ordenarPlantilla,
} from '../../src/datos/mensajes.js';
import {
  AdministrarAutomatizaciones,
  EVENTOS,
  porQueNoSePuedeEncender,
} from '../../src/mensajes/automatizaciones.js';

afterEach(cleanup);

const PLANTILLA = ordenarPlantilla({ id: 'p1', nombre: 'Recordatorio', cuerpo: 'Hola', activa: true });
const CANAL = ordenarCanal({ id: 'k1', tipo: 'whatsapp', nombre: 'WhatsApp' });

function pintar(sobre: Record<string, unknown> = {}) {
  const props = {
    abierto: true,
    automatizaciones: [],
    plantillas: [PLANTILLA],
    canales: [CANAL],
    cargando: false,
    trabajando: false,
    error: null,
    onGuardar: () => {},
    onCerrar: () => {},
    ...sobre,
  };
  return render(
    <AdministrarAutomatizaciones
      {...(props as React.ComponentProps<typeof AdministrarAutomatizaciones>)}
    />,
  );
}

describe('no se enciende a ciegas', () => {
  it('sin plantilla y sin canal se dice qué falta', () => {
    // Una automatización activa sin qué mandar y por dónde es un fallo
    // silencioso que se descubre el día que alguien pregunta por qué no llegó
    // su recordatorio.
    expect(porQueNoSePuedeEncender(null, null)).toContain('plantilla');
    expect(porQueNoSePuedeEncender(null, 'k1')).toContain('plantilla');
    expect(porQueNoSePuedeEncender('p1', null)).toContain('dónde');
    expect(porQueNoSePuedeEncender('p1', 'k1')).toBeNull();
  });

  it('el botón de encender está apagado hasta tener las dos cosas', () => {
    pintar();
    expect((screen.getByRole('button', { name: 'Guardar y encender' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});

describe('guardar apagada siempre se puede', () => {
  it('y lo que se manda lleva activa en false', async () => {
    /**
     * Es la regla del archivo: nacen apagadas SIEMPRE. Mandar mensajes a los
     * clientes de alguien sin que esa persona lo haya pedido explícitamente no
     * se puede deshacer.
     */
    const onGuardar = vi.fn();
    pintar({ onGuardar });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar apagada' }));
    expect(onGuardar.mock.calls[0]?.[1]).toMatchObject({ activa: false });
  });
});

describe('se dice que todavía no disparan', () => {
  it('antes de configurar nada', () => {
    // Enterarse después de haber armado cinco es enterarse tarde.
    pintar();
    expect(screen.getByText(/Todavía no disparan solas/)).toBeTruthy();
  });

  it('sin plantillas se dice que hay que crear una primero', () => {
    pintar({ plantillas: [] });
    expect(screen.getByText(/Crea una primero/)).toBeTruthy();
  });

  it('con canales pero ninguno conectado, se dice', () => {
    pintar();
    expect(screen.getByText(/Ningún canal está conectado/)).toBeTruthy();
  });
});

describe('la lista', () => {
  it('sin ninguna explica qué es una automatización', () => {
    pintar();
    expect(screen.getByText(/manda una plantilla sola cuando pasa algo/)).toBeTruthy();
  });

  it('una sin plantilla no se puede encender desde la lista', () => {
    pintar({
      automatizaciones: [ordenarAutomatizacion({ id: 'a1', evento: 'cita_recordatorio' })],
    });
    const boton = screen.getByRole('button', { name: 'Encender' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.title).toContain('falta');
  });

  it('están los nueve eventos del encargo', () => {
    expect(EVENTOS).toHaveLength(9);
  });
});
