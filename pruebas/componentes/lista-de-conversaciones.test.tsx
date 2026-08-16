/**
 * @vitest-environment happy-dom
 *
 * LA LISTA DE CONVERSACIONES.
 *
 * Lo que se vigila: que cada bandeja diga QUE le falta —un "no hay datos"
 * genérico es una pantalla rota con otra letra—, que un hilo sin ficha enseñe
 * su contacto en vez de inventar un nombre, y que el buscador no pierda el foco
 * al escribir.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ordenarConversacion, type ConversacionEnLista } from '../../src/datos/mensajes.js';
import {
  ListaDeConversaciones,
  comoSeLlama,
  cuandoFue,
} from '../../src/mensajes/lista-de-conversaciones.js';

afterEach(cleanup);

const CON = (sobre: Record<string, unknown> = {}): ConversacionEnLista =>
  ordenarConversacion({
    id: 'c1', contacto: '646 000 0000', ultimoEn: '2026-08-16T10:00:00Z',
    ultimo: { cuerpo: 'Hola, ¿precio?', direccion: 'entrante', estado: 'entregado', creadoEn: '2026-08-16T10:00:00Z' },
    ...sobre,
  });

function pintar(sobre: Record<string, unknown> = {}) {
  const props = {
    conversaciones: [] as readonly ConversacionEnLista[],
    cuentas: { todas: 0, noLeidas: 0, pendientes: 0, archivadas: 0 },
    bandeja: 'todas' as const,
    busqueda: '',
    etiqueta: '',
    etiquetas: [],
    escogida: null,
    cargando: false,
    error: null,
    hayMas: false,
    puedeEscribir: true,
    onBandeja: () => {},
    onBuscar: () => {},
    onEtiqueta: () => {},
    onEscoger: () => {},
    onVerMas: () => {},
    onNuevo: () => {},
    onReintentar: () => {},
    ...sobre,
  };
  return render(<ListaDeConversaciones {...(props as React.ComponentProps<typeof ListaDeConversaciones>)} />);
}

describe('cuándo fue', () => {
  const ahora = new Date('2026-08-16T12:00:00');

  it('lo de hoy sale con la hora', () => {
    expect(cuandoFue(new Date('2026-08-16T10:30:00').toISOString(), ahora)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('lo de ayer lo dice con palabras', () => {
    expect(cuandoFue(new Date('2026-08-15T10:30:00').toISOString(), ahora)).toBe('Ayer');
  });

  it('lo que no se entiende sale VACIO, nunca una hora inventada', () => {
    expect(cuandoFue('mañana')).toBe('');
    expect(cuandoFue('')).toBe('');
  });
});

describe('con quién se está hablando', () => {
  it('sin ficha se enseña el contacto, no un nombre inventado', () => {
    // Inventarle una ficha llenaría el directorio de personas llamadas como su
    // teléfono.
    expect(comoSeLlama(CON())).toBe('646 000 0000');
  });

  it('con ficha, su nombre', () => {
    expect(comoSeLlama(CON({ clienteId: 'x', cliente: 'Quien viene' }))).toBe('Quien viene');
  });
});

describe('cada vacío dice QUE falta', () => {
  const casos: ReadonlyArray<[string, RegExp]> = [
    ['todas', /No hay conversaciones/],
    ['no_leidas', /No tienes mensajes sin leer/],
    ['pendientes', /No hay nadie esperando respuesta/],
    ['archivadas', /No has archivado ninguna/],
  ];

  for (const [bandeja, texto] of casos) {
    it(`${bandeja} lo dice con sus palabras`, () => {
      pintar({ bandeja });
      expect(screen.getByText(texto)).toBeTruthy();
    });
  }

  it('vacío por buscar NO ofrece "Nuevo mensaje": ofrece quitar el filtro', () => {
    // El botón principal ahí llevaría a empezar una conversación cuando lo que
    // se quería era encontrar una que existe.
    pintar({ busqueda: 'nadie' });
    expect(screen.getByText(/Nada coincide/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nuevo mensaje/ })).toBeNull();
  });

  it('vacío de verdad SÍ ofrece empezar una', () => {
    pintar();
    expect(screen.getByRole('button', { name: /Nuevo mensaje/ })).toBeTruthy();
  });
});

describe('los contadores de las pestañas', () => {
  it('solo aparecen si hay algo que contar', () => {
    // Un "0" al lado de cada pestaña es ruido que se deja de leer en un día.
    pintar({ cuentas: { todas: 3, noLeidas: 0, pendientes: 2, archivadas: 0 } });
    const noLeidos = screen.getByRole('tab', { name: /No leídos/ });
    expect(noLeidos.textContent).toBe('No leídos');
    expect(screen.getByRole('tab', { name: /Pendientes/ }).textContent).toContain('2');
  });
});

describe('el buscador', () => {
  it('no pierde el foco al escribir', () => {
    /**
     * El campo vive SIEMPRE en el mismo sitio del árbol, fuera de cualquier rama
     * que cambie al llegar los resultados. Si se pintara dentro de un `if`,
     * React lo destruiría en cada letra: la queja de "escribo Ana y tengo que
     * volver a hacer clic".
     */
    const { rerender } = pintar({ conversaciones: [] });
    const campo = screen.getByLabelText('Buscar conversación');
    campo.focus();
    rerender(
      <ListaDeConversaciones
        {...({
          conversaciones: [CON()], cuentas: { todas: 1, noLeidas: 0, pendientes: 0, archivadas: 0 },
          bandeja: 'todas', busqueda: 'a', etiqueta: '', etiquetas: [], escogida: null,
          cargando: false, error: null, hayMas: false, puedeEscribir: true,
          onBandeja: () => {}, onBuscar: () => {}, onEtiqueta: () => {}, onEscoger: () => {},
          onVerMas: () => {}, onNuevo: () => {}, onReintentar: () => {},
        } as React.ComponentProps<typeof ListaDeConversaciones>)}
      />,
    );
    expect(document.activeElement).toBe(campo);
  });

  it('sin etiquetas del centro, el filtro solo trae "Todas"', () => {
    // No se inventan cinco de ejemplo para que se vea lleno.
    pintar();
    const filtro = screen.getByLabelText('Filtrar por etiqueta') as HTMLSelectElement;
    expect([...filtro.options].map((o) => o.textContent)).toEqual(['Todas las etiquetas']);
  });
});

describe('un hilo de la lista', () => {
  it('enseña lo último, quién lo dijo y los sin leer', () => {
    pintar({
      conversaciones: [CON({ clienteId: 'x', cliente: 'Quien viene', sinLeer: 2 })],
      cuentas: { todas: 1, noLeidas: 1, pendientes: 0, archivadas: 0 },
    });
    expect(screen.getByText('Quien viene')).toBeTruthy();
    expect(screen.getByText('Hola, ¿precio?')).toBeTruthy();
    expect(screen.getByLabelText('2 sin leer')).toBeTruthy();
  });

  it('lo que salió del negocio se marca con "Tú:"', () => {
    pintar({
      conversaciones: [CON({
        ultimo: { cuerpo: 'Te esperamos', direccion: 'saliente', estado: 'pendiente', creadoEn: '2026-08-16T10:00:00Z' },
      })],
    });
    expect(screen.getByText('Tú: Te esperamos')).toBeTruthy();
  });

  it('sin canal se DICE: un hilo suelto no se puede contestar', () => {
    pintar({ conversaciones: [CON()] });
    expect(screen.getByText('Sin canal')).toBeTruthy();
  });

  it('tocarlo avisa con la conversación entera', async () => {
    const onEscoger = vi.fn();
    pintar({ conversaciones: [CON({ clienteId: 'x', cliente: 'Quien viene' })], onEscoger });
    await userEvent.click(screen.getByText('Quien viene'));
    expect(onEscoger.mock.calls[0]?.[0]).toMatchObject({ id: 'c1' });
  });
});
