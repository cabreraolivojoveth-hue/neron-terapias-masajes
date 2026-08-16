/**
 * @vitest-environment happy-dom
 *
 * EL HILO ABIERTO.
 *
 * Lo que se vigila es lo que separa este módulo de una maqueta bonita: que un
 * mensaje sin enviar NO se pinte como enviado, que sin canal conectado se diga
 * ANTES de escribir, y que un fallo deje reintentar en vez de desaparecer.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ordenarConversacion,
  ordenarMensaje,
  type ConversacionEnLista,
  type MensajeDelHilo,
} from '../../src/datos/mensajes.js';
import { Hilo, accionesDelHilo, diaDelMensaje, horaDelMensaje } from '../../src/mensajes/hilo.js';

afterEach(cleanup);

const CON = (sobre: Record<string, unknown> = {}): ConversacionEnLista =>
  ordenarConversacion({
    id: 'c1', contacto: '646 000 0000', clienteId: 'cl1', cliente: 'Quien viene',
    ultimoEn: '2026-08-16T10:00:00Z', ...sobre,
  });

const MSJ = (sobre: Record<string, unknown> = {}): MensajeDelHilo =>
  ordenarMensaje({
    id: 'm1', direccion: 'entrante', cuerpo: 'Hola', estado: 'entregado',
    creadoEn: '2026-08-16T10:00:00Z', ...sobre,
  });

function pintar(sobre: Record<string, unknown> = {}) {
  const props = {
    conversacion: CON(),
    mensajes: [] as readonly MensajeDelHilo[],
    cargando: false,
    hayMasAtras: false,
    enviando: false,
    error: null,
    canalConectado: true,
    puedeEscribir: true,
    onEnviar: () => {},
    onAccion: () => {},
    onFavorita: () => {},
    onVerCliente: () => {},
    onMasAtras: () => {},
    onReintentarMensaje: () => {},
    ...sobre,
  };
  return render(<Hilo {...(props as React.ComponentProps<typeof Hilo>)} />);
}

describe('las horas', () => {
  it('salen en dos cifras y dos cifras', () => {
    expect(horaDelMensaje('2026-08-16T10:15:00Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('lo que no se entiende sale VACIO, nunca inventado', () => {
    expect(horaDelMensaje('mañana')).toBe('');
    expect(diaDelMensaje('')).toBe('');
  });
});

describe('sin conversación escogida', () => {
  it('lo dice en vez de dejar un hueco', () => {
    pintar({ conversacion: null });
    expect(screen.getByText('Escoge una conversación')).toBeTruthy();
  });
});

describe('el estado de un mensaje NO se inventa', () => {
  it('lo pendiente dice "Sin enviar", no una palomita', () => {
    /**
     * Es la diferencia entre "lo tengo escrito" y "le llegó". Pintar una
     * palomita que nadie confirmó da por avisado a un cliente que nunca supo
     * nada.
     */
    pintar({ mensajes: [MSJ({ direccion: 'saliente', estado: 'pendiente', cuerpo: 'Te esperamos' })] });
    expect(screen.getByText('Sin enviar')).toBeTruthy();
  });

  it('a lo que ENTRA no se le pinta estado: ya llegó', () => {
    pintar({ mensajes: [MSJ({ cuerpo: 'Hola' })] });
    expect(screen.queryByText('Entregado')).toBeNull();
  });

  it('un fallo dice por qué y deja reintentar', () => {
    const onReintentarMensaje = vi.fn();
    pintar({
      mensajes: [MSJ({
        direccion: 'saliente', estado: 'fallido', cuerpo: 'Hola',
        error: 'El número no existe en WhatsApp.',
      })],
      onReintentarMensaje,
    });
    expect(screen.getByText(/El número no existe en WhatsApp/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
});

describe('sin canal conectado se dice ANTES de escribir', () => {
  it('avisa de que no le llega a nadie', () => {
    // Enterarse después de mandar es enterarse tarde: el mensaje se guarda,
    // parece que salió, y el cliente nunca supo nada.
    pintar({ canalConectado: false });
    expect(screen.getByText(/Ningún canal está conectado/)).toBeTruthy();
    expect(screen.getByText(/no le llega a nadie/)).toBeTruthy();
  });

  it('con canal conectado no se avisa de nada', () => {
    pintar({ canalConectado: true });
    expect(screen.queryByText(/Ningún canal está conectado/)).toBeNull();
  });
});

describe('escribir', () => {
  it('manda lo escrito y limpia el cuadro', async () => {
    const onEnviar = vi.fn();
    pintar({ onEnviar });
    const campo = screen.getByLabelText('Escribe un mensaje');
    await userEvent.type(campo, 'Buenos días');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onEnviar).toHaveBeenCalledWith('Buenos días');
    expect((campo as HTMLTextAreaElement).value).toBe('');
  });

  it('vacío no se manda', async () => {
    const onEnviar = vi.fn();
    pintar({ onEnviar });
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('sin permiso no hay cuadro, y se dice por qué', () => {
    pintar({ puedeEscribir: false });
    expect(screen.queryByLabelText('Escribe un mensaje')).toBeNull();
    expect(screen.getByText(/Tu rol no escribe mensajes/)).toBeTruthy();
  });

  it('los adjuntos están apagados y dicen por qué', () => {
    // Un botón que abre un selector y después falla es peor que uno apagado
    // con su motivo.
    pintar();
    const clip = screen.getByLabelText('Adjuntar un archivo') as HTMLButtonElement;
    expect(clip.disabled).toBe(true);
    expect(clip.title).toContain('canal conectado');
  });

  it('los emojis se meten en el texto', async () => {
    pintar();
    await userEvent.click(screen.getByLabelText('Emojis'));
    const botones = screen.getAllByRole('button', { name: '🙂' });
    await userEvent.click(botones[0]!);
    expect((screen.getByLabelText('Escribe un mensaje') as HTMLTextAreaElement).value).toBe('🙂');
  });
});

describe('las acciones del menú se calculan, no se escriben fijas', () => {
  it('con sin leer se ofrece marcar leída; sin ellos, no leída', () => {
    // Ofrecer las dos a la vez deja un botón que no hace nada, y un botón que
    // no hace nada hace creer que la pantalla se trabó.
    expect(accionesDelHilo(CON({ sinLeer: 2 })).map((a) => a.clave)).toContain('leida');
    expect(accionesDelHilo(CON({ sinLeer: 0 })).map((a) => a.clave)).toContain('no_leida');
  });

  it('lo archivado ofrece sacarlo, no archivarlo otra vez', () => {
    const claves = accionesDelHilo(CON({ estado: 'archivada' })).map((a) => a.clave);
    expect(claves).toContain('desarchivar');
    expect(claves).not.toContain('archivar');
  });

  it('solo un hilo SIN ficha ofrece ligarlo', () => {
    expect(accionesDelHilo(CON({ clienteId: null })).map((a) => a.clave)).toContain('ligar');
    expect(accionesDelHilo(CON()).map((a) => a.clave)).not.toContain('ligar');
  });

  it('solo lo pendiente ofrece marcarlo atendido', () => {
    expect(accionesDelHilo(CON({ pendiente: true })).map((a) => a.clave)).toContain('atendida');
    expect(accionesDelHilo(CON({ pendiente: false })).map((a) => a.clave)).not.toContain('atendida');
  });
});

describe('la estrella', () => {
  it('se anuncia como puesta o no', async () => {
    const onFavorita = vi.fn();
    pintar({ conversacion: CON({ favorita: true }), onFavorita });
    const estrella = screen.getByLabelText('Quitar de favoritas');
    expect(estrella.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(estrella);
    expect(onFavorita).toHaveBeenCalled();
  });
});
