/**
 * @vitest-environment happy-dom
 *
 * LAS OCHO PESTAÑAS DEL REPORTE.
 *
 * Lo que se vigila: que cada una resuelva SU vacio —un "no hay datos" generico
 * es una pantalla rota con otra letra— y que lo que puede no existir se pinte
 * con una raya en vez de con un cero que afirma algo falso.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ordenarReporte, type Reporte } from '../../src/datos/reportes.js';
import {
  PESTANAS_DEL_REPORTE,
  SeccionDelReporte,
  type PestanaDelReporte,
} from '../../src/reportes/secciones.js';

afterEach(cleanup);

const reporte = (parte: Record<string, unknown> = {}): Reporte => ordenarReporte(parte);

function pintar(
  pestana: PestanaDelReporte,
  r: Reporte | null = reporte(),
  onIr: (m: string, i?: string) => void = () => {},
) {
  return render(
    <SeccionDelReporte pestana={pestana} reporte={r} cargando={false} onIr={onIr} />,
  );
}

describe('las pestañas', () => {
  it('son las ocho del diseño, en su orden', () => {
    expect(PESTANAS_DEL_REPORTE.map((p) => p.clave)).toEqual([
      'resumen', 'ventas', 'servicios', 'clientes',
      'productos', 'cursos', 'gastos', 'caja',
    ]);
  });

  it('una pestaña desconocida cae en el resumen, no en una pantalla en blanco', () => {
    // Puede llegar de un reporte guardado con un tipo viejo. Vale mas enseñar
    // el resumen que dejar el hueco.
    pintar('inventada' as PestanaDelReporte);
    expect(screen.getByText('Ingresos vs. Egresos')).toBeTruthy();
  });
});

describe('cada vacío dice QUÉ falta', () => {
  const esperados: ReadonlyArray<[PestanaDelReporte, RegExp]> = [
    ['servicios', /no se ha completado ninguna sesión/],
    ['clientes', /nadie ha comprado en este período/],
    ['productos', /no se ha vendido ningún producto/],
    ['cursos', /no se ha vendido ningún curso/],
    ['gastos', /no hay gastos registrados/],
    ['caja', /no se ha cerrado ninguna caja/],
    ['ventas', /no se ha cobrado nada/],
  ];

  for (const [pestana, texto] of esperados) {
    it(`${pestana} lo dice con sus palabras`, () => {
      pintar(pestana);
      expect(screen.getByText(texto)).toBeTruthy();
    });
  }
});

describe('lo que puede no existir sale con raya, no con cero', () => {
  it('sin ventas el ticket promedio es una raya', () => {
    /**
     * "$0.00 de ticket promedio" afirma que se cobro cero por venta. La raya
     * dice que no hubo ventas con las que sacar un promedio, que es lo que de
     * verdad pasa.
     */
    pintar('ventas', reporte({ ventas: { cobradas: 0 } }));
    const fila = screen.getByText('Ticket promedio').parentElement;
    expect(fila?.textContent).toContain('—');
  });

  it('un curso sin cupo no recibe una ocupación inventada', () => {
    pintar('cursos', reporte({
      cursos: { ranking: [{ id: 'c1', nombre: 'Reiki', cantidad: 2, ingresos: 1000, inscritos: 5 }] },
    }));
    expect(screen.getByText('5 · sin cupo')).toBeTruthy();
  });

  it('un curso con cupo enseña inscritos sobre cupo', () => {
    pintar('cursos', reporte({
      cursos: {
        ranking: [{ id: 'c1', nombre: 'Reiki', cantidad: 2, ingresos: 1000, inscritos: 5, cupo: 12 }],
      },
    }));
    expect(screen.getByText('5/12')).toBeTruthy();
  });
});

describe('las existencias son de HOY, no del periodo', () => {
  it('lo dice en la etiqueta', () => {
    /**
     * Un reporte de junio abierto en agosto no puede decir cuanto stock habia
     * en junio: eso no se guarda. Fingirlo seria inventar, asi que se marca
     * cual de los dos numeros es de ahora.
     */
    pintar('productos');
    expect(screen.getByText('Con existencia baja (hoy)')).toBeTruthy();
    expect(screen.getByText('Agotados (hoy)')).toBeTruthy();
  });
});

describe('el paso al módulo del que sale cada cifra', () => {
  it('"Ver todos" de servicios lleva a Servicios', async () => {
    const ir = vi.fn();
    pintar('servicios', reporte(), ir);
    await userEvent.click(screen.getAllByRole('button', { name: 'Ver todos' })[0]!);
    expect(ir).toHaveBeenCalledWith('servicios');
  });

  it('el nombre de un cliente abre SU expediente, no una ficha de Reportes', async () => {
    // Lo que hace falta saber de alguien —sus alergias, lo que se le hizo— ya
    // vive completo alla. Una ficha propia aqui seria una segunda verdad.
    const ir = vi.fn();
    pintar('clientes', reporte({
      clientes: { ranking: [{ id: 'cl1', nombre: 'Quien compra', visitas: 3, compras: 4, gastado: 900 }] },
    }), ir);
    await userEvent.click(screen.getByRole('button', { name: 'Quien compra' }));
    expect(ir).toHaveBeenCalledWith('clientes', 'clientes:abrir:cl1');
  });

  it('la caja lleva a sus movimientos con el recado del consumidor', async () => {
    const ir = vi.fn();
    pintar('caja', reporte(), ir);
    await userEvent.click(screen.getByRole('button', { name: 'Ver los movimientos' }));
    expect(ir).toHaveBeenCalledWith('caja', 'caja:movimientos');
  });
});
