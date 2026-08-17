/**
 * @vitest-environment happy-dom
 *
 * LA NAVEGACION DEL HISTORIAL: mes → semana → día → ventas.
 *
 * Lo que se comprueba aquí es que la ruta funcione en los dos sentidos: que
 * bajar un nivel enseñe el siguiente, y que la miga de pan devuelva. Perderse
 * un nivel sin poder volver es lo primero que pasa en una lista jerárquica, y
 * la única salida sería recargar la pantalla.
 *
 * Las fechas y las cifras son inventadas para la prueba.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CalendarioDelHistorial,
  EN_NINGUN_LADO,
  type DondeEstoy,
} from '../src/ventas/calendario-del-historial.js';
import type { DiaConVentas } from '../src/datos/ventas.js';

afterEach(cleanup);

const DIAS: DiaConVentas[] = [
  { fecha: '03/08/2026', cuantas: 2, totalCentavos: 50000 },
  { fecha: '04/08/2026', cuantas: 1, totalCentavos: 30000 },
  { fecha: '11/08/2026', cuantas: 3, totalCentavos: 20000 },
  { fecha: '15/07/2026', cuantas: 1, totalCentavos: 90000 },
];

function pintar(donde: DondeEstoy = EN_NINGUN_LADO, extra: Partial<{ dias: DiaConVentas[] }> = {}) {
  const onIr = vi.fn();
  render(
    <CalendarioDelHistorial
      dias={extra.dias ?? DIAS}
      donde={donde}
      cargando={false}
      onIr={onIr}
    />,
  );
  return onIr;
}

describe('el primer nivel son los meses', () => {
  it('enseña los meses que HAY, del más nuevo al más viejo', () => {
    pintar();
    expect(screen.getByText('Agosto 2026')).toBeTruthy();
    expect(screen.getByText('Julio 2026')).toBeTruthy();
    // Un mes sin ventas no aparece: al abrirlo estaría vacío.
    expect(screen.queryByText('Junio 2026')).toBeNull();
  });

  it('cada mes dice cuántas ventas y cuánto', () => {
    pintar();
    expect(screen.getByText('6 ventas')).toBeTruthy();
    // 500 + 300 + 200 de agosto. La suma sube de día a semana y de semana a mes.
    expect(screen.getByText('$1,000.00')).toBeTruthy();
  });

  it('tocar un mes pide bajar a sus semanas', async () => {
    const onIr = pintar();
    await userEvent.click(screen.getByText('Agosto 2026'));
    expect(onIr).toHaveBeenCalledWith({ mes: '2026-08', semana: '', dia: '' });
  });
});

describe('el segundo nivel son las semanas, con su rango', () => {
  it('el rango se lee, porque "Semana 2" a secas no ubica a nadie', () => {
    pintar({ mes: '2026-08', semana: '', dia: '' });
    expect(screen.getByText(/3 Ago — 4 Ago/)).toBeTruthy();
  });

  it('tocar una semana pide bajar a sus días', async () => {
    const onIr = pintar({ mes: '2026-08', semana: '', dia: '' });
    await userEvent.click(screen.getByText('Semana 2'));
    expect(onIr).toHaveBeenCalledWith({ mes: '2026-08', semana: '2026-08-s2', dia: '' });
  });
});

describe('el tercer nivel son los días', () => {
  it('cada día lleva su nombre y su fecha completa', () => {
    pintar({ mes: '2026-08', semana: '2026-08-s2', dia: '' });
    expect(screen.getByText('Martes 4')).toBeTruthy();
    expect(screen.getByText(/03\/08\/2026/)).toBeTruthy();
  });

  it('tocar un día lo escoge', async () => {
    const onIr = pintar({ mes: '2026-08', semana: '2026-08-s2', dia: '' });
    await userEvent.click(screen.getByText('Lunes 3'));
    expect(onIr).toHaveBeenCalledWith({
      mes: '2026-08', semana: '2026-08-s2', dia: '03/08/2026',
    });
  });

  /**
   * VOLVER A TOCAR EL DIA PUESTO LO QUITA.
   *
   * Es la salida más corta de un filtro, y la que se busca justo cuando uno se
   * da cuenta de que era otro día.
   */
  it('volver a tocarlo lo quita', async () => {
    const onIr = pintar({ mes: '2026-08', semana: '2026-08-s2', dia: '03/08/2026' });
    await userEvent.click(screen.getByText('Lunes 3'));
    expect(onIr).toHaveBeenCalledWith({ mes: '2026-08', semana: '2026-08-s2', dia: '' });
  });

  it('y se dice en palabras que la lista está recortada a ese día', () => {
    pintar({ mes: '2026-08', semana: '2026-08-s2', dia: '03/08/2026' });
    expect(screen.getByText(/Viendo solo las ventas del 03\/08\/2026/)).toBeTruthy();
  });
});

describe('la miga de pan devuelve', () => {
  it('desde los días se puede volver al mes y a todo', async () => {
    const onIr = pintar({ mes: '2026-08', semana: '2026-08-s2', dia: '' });
    await userEvent.click(screen.getByRole('button', { name: 'Todo' }));
    expect(onIr).toHaveBeenCalledWith(EN_NINGUN_LADO);

    await userEvent.click(screen.getByRole('button', { name: 'Agosto 2026' }));
    expect(onIr).toHaveBeenCalledWith({ mes: '2026-08', semana: '', dia: '' });
  });

  it('el paso donde estás parado se apaga: no lleva a ningún lado', () => {
    pintar();
    expect((screen.getByRole('button', { name: 'Todo' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('sin nada que enseñar no se pinta una tarjeta vacía', () => {
  it('la lista de ventas de al lado ya lo dice, y dos avisos parecen dos problemas', () => {
    const { container } = render(
      <CalendarioDelHistorial dias={[]} donde={EN_NINGUN_LADO} cargando={false} onIr={vi.fn()} />,
    );
    expect(container.querySelector('.vta-calendario')).toBeNull();
  });
});
