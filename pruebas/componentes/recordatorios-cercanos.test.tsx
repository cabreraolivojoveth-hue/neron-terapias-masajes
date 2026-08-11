/**
 * @vitest-environment happy-dom
 *
 * Los recordatorios de Inicio.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecordatorioCercano } from '../../src/datos/tablero.js';
import {
  RecordatoriosCercanos,
  TONO_DE_LA_URGENCIA,
  iconoDeEntidad,
  urgenciaDe,
} from '../../src/inicio/recordatorios-cercanos.js';

afterEach(cleanup);

const HOY = '06/08/2026';

const r = (c: Partial<RecordatorioCercano> = {}): RecordatorioCercano => ({
  id: 'r1', titulo: 'Un pendiente', detalle: null, fecha: HOY,
  prioridad: 'normal', entidadTipo: null, entidadId: null,
  ...c,
});

const props = {
  recordatorios: [] as RecordatorioCercano[],
  hoy: HOY,
  cargando: false,
  error: null as string | null,
  onAbrir: () => {},
  onVerTodos: () => {},
  onReintentar: () => {},
};

describe('que tan urgente es', () => {
  it('antes de hoy esta vencido', () => {
    expect(urgenciaDe('05/08/2026', HOY)).toBe('vencido');
  });

  it('hoy es hoy', () => {
    expect(urgenciaDe(HOY, HOY)).toBe('hoy');
  });

  it('mañana es proximo', () => {
    expect(urgenciaDe('07/08/2026', HOY)).toBe('proximo');
  });

  it('una fecha ilegible no revienta la lista', () => {
    expect(urgenciaDe('lo que sea', HOY)).toBe('proximo');
  });
});

describe('de donde salio el recordatorio', () => {
  it('cada entidad tiene su icono', () => {
    // Un recordatorio que solo lleva texto es texto muerto: no se puede abrir
    // la cita de la que nacio ni saber si ya se cancelo.
    expect(iconoDeEntidad('cita')).toBe('calendario');
    expect(iconoDeEntidad('cliente')).toBe('persona');
    expect(iconoDeEntidad('venta')).toBe('bolsa');
    expect(iconoDeEntidad('curso')).toBe('birrete');
    expect(iconoDeEntidad('producto')).toBe('paquete');
  });

  it('sin entidad se pone un reloj, no se esconde el renglon', () => {
    expect(iconoDeEntidad(null)).toBe('reloj');
  });
});

describe('la pantalla', () => {
  it('sin pendientes lo dice', () => {
    render(<RecordatoriosCercanos {...props} />);
    expect(screen.getByText('No tienes recordatorios pendientes.')).toBeTruthy();
  });

  it('mientras carga NO afirma que no hay nada', () => {
    render(<RecordatoriosCercanos {...props} cargando />);
    expect(screen.queryByText('No tienes recordatorios pendientes.')).toBeNull();
  });

  it('la urgencia va con PALABRA, no solo con el color del renglon', () => {
    // Quien no distingue los tonos tambien tiene que saber cual ya vencio.
    render(<RecordatoriosCercanos {...props} recordatorios={[r({ fecha: '01/08/2026' })]} />);
    expect(screen.getByText('Vencido')).toBeTruthy();
  });

  it('tocar uno avisa cual, con su id', async () => {
    const abrir = vi.fn();
    render(
      <RecordatoriosCercanos {...props} recordatorios={[r({ id: 'z9' })]} onAbrir={abrir} />,
    );
    await userEvent.click(screen.getByText('Un pendiente'));
    expect(abrir.mock.calls[0]?.[0]?.id).toBe('z9');
  });

  it('si falla, se dice y se puede reintentar', () => {
    render(<RecordatoriosCercanos {...props} error="sin conexión" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });
});

describe('la urgencia se ve Y se lee', () => {
  it('cada urgencia tiene su tono de pastilla, y ninguno se repite', () => {
    // El color solo no le sirve a quien no lo distingue: al lado va siempre la
    // palabra. Y tres urgencias con el mismo tono serian tres iguales.
    const tonos = Object.values(TONO_DE_LA_URGENCIA);
    expect(tonos).toHaveLength(3);
    expect(new Set(tonos).size).toBe(3);
  });

  it('lo vencido va en el tono de peligro, no en uno cualquiera', () => {
    expect(TONO_DE_LA_URGENCIA.vencido).toBe('peligro');
    expect(TONO_DE_LA_URGENCIA.hoy).toBe('aviso');
  });
});
