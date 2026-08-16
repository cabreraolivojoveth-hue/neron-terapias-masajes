/**
 * @vitest-environment happy-dom
 *
 * EMPEZAR UNA CONVERSACIÓN.
 *
 * Lo que se vigila: que el cliente se ESCOJA y no se teclee —teclearlo crearía
 * dos historiales de la misma persona—, que se pueda escribir a un número
 * suelto, y que una plantilla con datos que no se saben avise en vez de mandar
 * "Hola , te esperamos el .".
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClienteEnLista } from '../../src/datos/clientes.js';
import { ordenarCanal, ordenarPlantilla } from '../../src/datos/mensajes.js';
import { NuevoMensaje } from '../../src/mensajes/nuevo-mensaje.js';

afterEach(cleanup);

const CL: ClienteEnLista = {
  id: 'cl1', nombre: 'Quien viene', telefono: '646 000 0000', correo: null,
  fechaNacimiento: null, profesionalId: null, profesional: null,
  visitas: 1, ultimaVisita: null, estado: 'activo',
};

function pintar(sobre: Record<string, unknown> = {}) {
  const props = {
    abierto: true,
    clientes: [] as readonly ClienteEnLista[],
    busqueda: '',
    buscando: false,
    canales: [ordenarCanal({ id: 'k1', tipo: 'whatsapp', nombre: 'WhatsApp' })],
    plantillas: [],
    trabajando: false,
    error: null,
    nombreDelCentro: 'Centro',
    onBuscar: () => {},
    onCrearCliente: () => {},
    onEnviar: () => {},
    onCerrar: () => {},
    ...sobre,
  };
  return render(<NuevoMensaje {...(props as React.ComponentProps<typeof NuevoMensaje>)} />);
}

describe('a quién', () => {
  it('el cliente se escoge de la lista, con su id', async () => {
    // Ventas guarda `cliente_id`; teclear el nombre crearía dos historiales de
    // la misma persona sin que nadie lo note.
    const onEnviar = vi.fn();
    const u = userEvent.setup();
    pintar({ clientes: [CL], busqueda: 'quien', onEnviar });
    await u.click(screen.getByRole('button', { name: /Quien viene/ }));
    await u.type(screen.getByLabelText(/^Mensaje/), 'Hola');
    await u.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onEnviar.mock.calls[0]?.[0]).toMatchObject({
      clienteId: 'cl1', contacto: '646 000 0000',
    });
  });

  it('se puede escribir a un número suelto, sin ficha', async () => {
    /**
     * Hace falta: alguien pregunta por un precio antes de ser cliente de nadie.
     * Lo que NO se hace es crear una ficha vacía para tener a quién colgarlo.
     */
    const onEnviar = vi.fn();
    const u = userEvent.setup();
    pintar({ onEnviar });
    await u.type(screen.getByLabelText(/número suelto/), '646 111 2222');
    await u.type(screen.getByLabelText(/^Mensaje/), 'Hola');
    await u.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onEnviar.mock.calls[0]?.[0]).toMatchObject({
      clienteId: null, contacto: '646 111 2222',
    });
  });

  it('avisa de que un número conocido se va a su historial', () => {
    // Es la regla de oro del módulo, dicha donde se puede dudar de ella.
    pintar();
    expect(screen.getByText(/se va a su historial/)).toBeTruthy();
  });

  it('sin destinatario o sin texto no se manda', () => {
    pintar();
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('las plantillas', () => {
  it('lo que no se pudo rellenar se DICE y se queda escrito', async () => {
    /**
     * Sustituirlo por vacío mandaría "te esperamos el ." sin que nadie se entere
     * hasta que el cliente pregunte qué quiso decir.
     */
    const u = userEvent.setup();
    pintar({
      plantillas: [ordenarPlantilla({
        id: 'p1', nombre: 'Recordatorio', activa: true,
        cuerpo: 'Hola {{cliente.nombre}}, te esperamos el {{cita.fecha}}.',
      })],
    });
    await u.selectOptions(screen.getByLabelText(/Partir de una plantilla/), 'p1');
    expect(screen.getByText(/No se pudo rellenar/)).toBeTruthy();
    expect(screen.getByText('cliente.nombre, cita.fecha')).toBeTruthy();
    expect((screen.getByLabelText(/^Mensaje/) as HTMLTextAreaElement).value)
      .toContain('{{cita.fecha}}');
  });

  it('con el cliente escogido, su nombre SÍ se rellena', async () => {
    const u = userEvent.setup();
    pintar({
      clientes: [CL], busqueda: 'quien',
      plantillas: [ordenarPlantilla({
        id: 'p1', nombre: 'Saludo', activa: true, cuerpo: 'Hola {{cliente.nombre}}.',
      })],
    });
    await u.click(screen.getByRole('button', { name: /Quien viene/ }));
    await u.selectOptions(screen.getByLabelText(/Partir de una plantilla/), 'p1');
    expect((screen.getByLabelText(/^Mensaje/) as HTMLTextAreaElement).value)
      .toBe('Hola Quien viene.');
  });
});

describe('el canal', () => {
  it('sin conectar se avisa de que quedará sin enviar', async () => {
    const u = userEvent.setup();
    pintar();
    await u.selectOptions(screen.getByLabelText(/Por dónde/), 'k1');
    expect(screen.getByText(/queda «Sin enviar»/)).toBeTruthy();
  });
});
