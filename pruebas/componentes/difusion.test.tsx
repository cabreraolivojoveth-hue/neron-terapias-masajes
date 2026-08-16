/**
 * @vitest-environment happy-dom
 *
 * UNA DIFUSIÓN.
 *
 * Es lo único de este módulo que no se puede deshacer, y lo que se vigila es
 * eso: que solo le llegue a quien se escogió uno por uno, que quien pidió no
 * recibir promociones NI SIQUIERA APAREZCA, y que la lista completa se vea
 * antes de confirmar.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClienteEnLista } from '../../src/datos/clientes.js';
import { ordenarCanal } from '../../src/datos/mensajes.js';
import { EnviarDifusion, losQueQuedanFuera, puedeRecibir } from '../../src/mensajes/difusion.js';

afterEach(cleanup);

const CL = (sobre: Partial<ClienteEnLista> = {}): ClienteEnLista => ({
  id: 'cl1', nombre: 'Quien viene', telefono: '646 000 0000', correo: null,
  fechaNacimiento: null, profesionalId: null, profesional: null,
  visitas: 1, ultimaVisita: null, estado: 'activo', ...sobre,
});

function pintar(sobre: Record<string, unknown> = {}) {
  const props = {
    abierto: true,
    clientes: [CL()],
    busqueda: '',
    cargando: false,
    canales: [ordenarCanal({ id: 'k1', tipo: 'whatsapp', nombre: 'WhatsApp' })],
    plantillas: [],
    trabajando: false,
    error: null,
    onBuscar: () => {},
    onEnviar: () => {},
    onCerrar: () => {},
    ...sobre,
  };
  return render(<EnviarDifusion {...(props as React.ComponentProps<typeof EnviarDifusion>)} />);
}

describe('quién puede recibir', () => {
  it('hace falta por dónde escribirle', () => {
    // Sin teléfono no es que falle: es que no existe destino.
    expect(puedeRecibir(CL())).toBe(true);
    expect(puedeRecibir(CL({ telefono: null }))).toBe(false);
    expect(puedeRecibir(CL({ telefono: '   ' }))).toBe(false);
  });

  it('quien pidió no recibir promociones NO recibe', () => {
    expect(puedeRecibir(CL({ aceptaPromociones: false }))).toBe(false);
  });

  it('sin el dato, cuenta como que sí acepta', () => {
    /**
     * Es una base que todavía no tiene la columna. Si contara como que no,
     * una base sin actualizar dejaría a todo el mundo fuera de cualquier
     * difusión sin decir por qué.
     */
    expect(puedeRecibir(CL({ aceptaPromociones: undefined }))).toBe(true);
  });

  it('se cuenta a los que quedan fuera, y por qué', () => {
    // Saltarlos en silencio deja creyendo que llegó a todo el mundo.
    const fuera = losQueQuedanFuera([
      CL(), CL({ id: 'b', telefono: null }), CL({ id: 'c', aceptaPromociones: false }),
    ]);
    expect(fuera).toEqual({ sinContacto: 1, noQuieren: 1 });
  });
});

describe('el primer paso: a quién', () => {
  it('quien no puede recibir NI SIQUIERA APARECE', () => {
    // Un renglón desmarcado invita a marcarlo.
    pintar({ clientes: [CL({ aceptaPromociones: false })] });
    expect(screen.queryByText('Quien viene')).toBeNull();
    // Sale dos veces: en el vacio de la lista y en el recuento de abajo.
    expect(screen.getAllByText(/pidieron no recibir promociones/).length).toBeGreaterThan(0);
  });

  it('sin nadie escogido no se puede seguir', () => {
    pintar();
    const siguiente = screen.getByRole('button', { name: /Siguiente/ }) as HTMLButtonElement;
    expect(siguiente.disabled).toBe(true);
  });

  it('el botón dice a cuántos va', async () => {
    pintar();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Siguiente (1)' })).toBeTruthy();
  });

  it('sin clientes lo dice', () => {
    pintar({ clientes: [] });
    expect(screen.getByText(/Todavía no hay clientes/)).toBeTruthy();
  });
});

describe('antes de mandar se revisa', () => {
  it('se ve el número, el canal y la lista completa', async () => {
    const u = userEvent.setup();
    pintar();
    await u.click(screen.getByRole('checkbox'));
    await u.click(screen.getByRole('button', { name: /Siguiente/ }));
    await u.type(screen.getByLabelText(/Nombre de la difusión/), 'Promo de agosto');
    await u.type(screen.getByLabelText(/^Mensaje/), 'Tenemos promoción');
    await u.click(screen.getByRole('button', { name: 'Revisar' }));

    expect(screen.getByText('1 personas')).toBeTruthy();
    expect(screen.getByText('Tenemos promoción')).toBeTruthy();
    // La lista entera, no un resumen: es la última oportunidad de ver un
    // nombre que no debía estar.
    expect(screen.getByText(/Ver los 1 destinatarios/)).toBeTruthy();
  });

  it('con el canal sin conectar se avisa de que no le llega a nadie', async () => {
    const u = userEvent.setup();
    pintar();
    await u.click(screen.getByRole('checkbox'));
    await u.click(screen.getByRole('button', { name: /Siguiente/ }));
    await u.selectOptions(screen.getByLabelText(/Por dónde/), 'k1');
    await u.type(screen.getByLabelText(/Nombre de la difusión/), 'Promo');
    await u.type(screen.getByLabelText(/^Mensaje/), 'Hola');
    await u.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText(/Ese canal no está conectado/)).toBeTruthy();
  });

  it('manda SOLO a los escogidos', async () => {
    const onEnviar = vi.fn();
    const u = userEvent.setup();
    pintar({ clientes: [CL(), CL({ id: 'cl2', nombre: 'Otra persona' })], onEnviar });
    await u.click(screen.getAllByRole('checkbox')[0]!);
    await u.click(screen.getByRole('button', { name: /Siguiente/ }));
    await u.type(screen.getByLabelText(/Nombre de la difusión/), 'Promo');
    await u.type(screen.getByLabelText(/^Mensaje/), 'Hola');
    await u.click(screen.getByRole('button', { name: 'Revisar' }));
    await u.click(screen.getByRole('button', { name: /Mandar a 1/ }));

    expect(onEnviar.mock.calls[0]?.[0]).toMatchObject({ clientes: ['cl1'] });
  });
});
