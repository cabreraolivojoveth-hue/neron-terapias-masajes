/**
 * @vitest-environment happy-dom
 *
 * LOS CANALES.
 *
 * ESTA ES LA PRUEBA MAS IMPORTANTE DEL MODULO, y no mide nada visual: mide que
 * la pantalla NO PUEDA MENTIR sobre si un canal está conectado.
 *
 * Un canal que se dice conectado sin serlo hace que cada envío falle, y la culpa
 * parece del mensaje o del número del cliente. Se buscaría el problema en el
 * sitio equivocado durante horas.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ordenarCanal, type CanalDeMensajes } from '../../src/datos/mensajes.js';
import { AdministrarCanales, CANAL_VACIO, LO_QUE_FALTA } from '../../src/mensajes/canales.js';

afterEach(cleanup);

function pintar(sobre: Record<string, unknown> = {}) {
  const props = {
    abierto: true,
    canales: [] as readonly CanalDeMensajes[],
    cargando: false,
    trabajando: false,
    error: null,
    onGuardar: () => {},
    onCerrar: () => {},
    ...sobre,
  };
  return render(
    <AdministrarCanales {...(props as React.ComponentProps<typeof AdministrarCanales>)} />,
  );
}

describe('un canal nace SIN CONECTAR y no hay forma de cambiarlo desde aquí', () => {
  it('el formulario no ofrece un campo de estado', () => {
    /**
     * Si lo ofreciera, alguien lo pondría en "conectado" porque es lo que
     * quiere que pase — y a partir de ahí el módulo mentiría en cada pantalla.
     */
    pintar();
    expect(screen.queryByLabelText(/estado/i)).toBeNull();
  });

  it('lo que se guarda no lleva estado', async () => {
    const onGuardar = vi.fn();
    pintar({ onGuardar });
    await userEvent.click(screen.getByRole('button', { name: /Agregar canal/ }));
    await userEvent.type(screen.getByLabelText(/Nombre/), 'El de siempre');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onGuardar.mock.calls[0]?.[1]).toEqual({
      ...CANAL_VACIO, nombre: 'El de siempre',
    });
    expect(Object.keys(onGuardar.mock.calls[0]?.[1] as object)).not.toContain('estado');
  });

  it('el estado que se enseña es el que llegó de la base', () => {
    pintar({ canales: [ordenarCanal({ id: 'k1', tipo: 'whatsapp', nombre: 'WhatsApp' })] });
    expect(screen.getByText('Sin conectar')).toBeTruthy();
  });
});

describe('se dice QUE FALTA antes de guardar, no después', () => {
  it('WhatsApp explica las tres cosas que hacen falta', () => {
    // Enterarse al intentar enviar es enterarse tarde.
    expect(LO_QUE_FALTA.whatsapp).toContain('token');
    expect(LO_QUE_FALTA.whatsapp).toContain('SERVIDOR');
  });

  it('el canal manual dice que no necesita nada', () => {
    // Es el único que ya funciona entero: sirve para dejar por escrito lo que
    // se habló por teléfono.
    expect(LO_QUE_FALTA.manual).toContain('Nada');
  });

  it('aparece en la pantalla al escoger el tipo', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Agregar canal/ }));
    expect(screen.getByText(/Para que este canal envíe de verdad hace falta/)).toBeTruthy();
  });

  it('avisa de que las llaves NO van en ese campo', async () => {
    // Es la clase de campo donde alguien pega un token porque parece el sitio.
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Agregar canal/ }));
    expect(screen.getByText(/no se guardan aquí/)).toBeTruthy();
  });
});

describe('sin canales', () => {
  it('lo dice y explica para qué sirve conectar uno', () => {
    pintar();
    expect(screen.getByText(/No hay canales conectados/)).toBeTruthy();
  });
});
