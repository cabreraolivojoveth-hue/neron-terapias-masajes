/**
 * @vitest-environment happy-dom
 *
 * EL ADMINISTRADOR DE PLANTILLAS.
 *
 * Lo que se vigila: que no se cree ni una plantilla de ejemplo, que duplicar
 * cree una nueva en vez de pisar la original, y que una variable mal escrita se
 * avise AL EDITAR — porque al enviar ya es tarde: viaja tal cual al teléfono
 * del cliente.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ordenarPlantilla, type PlantillaDeMensaje } from '../../src/datos/mensajes.js';
import { AdministrarPlantillas, filtrarPlantillas } from '../../src/mensajes/plantillas.js';

afterEach(cleanup);

const P = (sobre: Record<string, unknown> = {}): PlantillaDeMensaje =>
  ordenarPlantilla({
    id: 'p1', nombre: 'Recordatorio', categoria: 'citas',
    cuerpo: 'Hola {{cliente.nombre}}', activa: true, ...sobre,
  });

function pintar(sobre: Record<string, unknown> = {}) {
  const props = {
    abierto: true,
    plantillas: [] as readonly PlantillaDeMensaje[],
    cargando: false,
    trabajando: false,
    error: null,
    onGuardar: () => {},
    onBorrar: () => {},
    onCerrar: () => {},
    ...sobre,
  };
  return render(
    <AdministrarPlantillas {...(props as React.ComponentProps<typeof AdministrarPlantillas>)} />,
  );
}

describe('el filtro', () => {
  it('busca por nombre, categoría y texto', () => {
    const todas = [P(), P({ id: 'p2', nombre: 'Bienvenida', categoria: 'general', cuerpo: 'Qué gusto' })];
    expect(filtrarPlantillas(todas, 'recor').map((p) => p.id)).toEqual(['p1']);
    expect(filtrarPlantillas(todas, 'gusto').map((p) => p.id)).toEqual(['p2']);
    expect(filtrarPlantillas(todas, '')).toHaveLength(2);
  });
});

describe('sin plantillas', () => {
  it('NO se crea ninguna de ejemplo: se explica para qué sirven', () => {
    /**
     * Rellenarlo con tres inventadas es como se acaba mandando "gracias por tu
     * visita a NOMBRE DEL NEGOCIO" a alguien de verdad.
     */
    pintar();
    expect(screen.getByText(/Todavía no hay plantillas/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nueva plantilla/ })).toBeTruthy();
  });
});

describe('crear y editar', () => {
  it('sin nombre o sin texto no se guarda', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Nueva plantilla/ }));
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('una variable se mete tocándola, no escribiéndola', async () => {
    // Escribirlas a mano es como nacen los `{{cliente.nombe}}` que nunca fallan
    // y nunca se rellenan.
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Nueva plantilla/ }));
    await userEvent.click(screen.getByRole('button', { name: 'cliente.nombre' }));
    expect((screen.getByLabelText(/Texto/) as HTMLTextAreaElement).value)
      .toBe('{{cliente.nombre}}');
  });

  it('una variable MAL ESCRITA se avisa al editar', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Nueva plantilla/ }));
    // Se PEGA en vez de teclear: `userEvent.type` trata las llaves como teclas
    // especiales y "{{" se convierte en una sola. El texto llegaria distinto de
    // lo que la prueba dice estar probando.
    const campo = screen.getByLabelText(/Texto/);
    campo.focus();
    await userEvent.paste('Hola {{cliente.nombe}}');
    expect(screen.getByText(/no existen y se van a enviar tal cual/)).toBeTruthy();
    expect(screen.getByText('cliente.nombe')).toBeTruthy();
  });

  it('guarda lo escrito', async () => {
    const onGuardar = vi.fn();
    pintar({ onGuardar });
    await userEvent.click(screen.getByRole('button', { name: /Nueva plantilla/ }));
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Bienvenida');
    await userEvent.type(screen.getByLabelText(/Texto/), 'Qué gusto verte');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onGuardar.mock.calls[0]?.[0]).toBeNull();
    expect(onGuardar.mock.calls[0]?.[1]).toMatchObject({
      nombre: 'Bienvenida', cuerpo: 'Qué gusto verte',
    });
  });
});

describe('la lista', () => {
  it('enseña la plantilla con su categoría y su texto', () => {
    pintar({ plantillas: [P()] });
    expect(screen.getByText('Recordatorio')).toBeTruthy();
    expect(screen.getByText(/citas/)).toBeTruthy();
  });

  it('una apagada se marca', () => {
    pintar({ plantillas: [P({ activa: false })] });
    expect(screen.getByText('Apagada')).toBeTruthy();
  });
});
