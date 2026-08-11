/**
 * @vitest-environment happy-dom
 *
 * La grafica de ingresos.
 *
 * Casi todo lo que puede salir mal aqui es aritmetica —el eje, la escala, las
 * etiquetas— y se prueba con numeros, sin mirar la pantalla.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiaConIngreso, PeriodoDeIngresos } from '../../src/datos/tablero.js';
import {
  GraficaDeIngresos,
  escalarDesdeCero,
  etiquetaCorta,
  etiquetasDeAbajo,
  pasoBonito,
  puntosDelRelleno,
  techoDelEje,
} from '../../src/inicio/grafica-de-ingresos.js';

afterEach(cleanup);

const PERIODOS: PeriodoDeIngresos[] = [
  { clave: 'estaSemana', etiqueta: 'Esta semana', desde: '03/08/2026', hasta: '09/08/2026' },
  { clave: 'semanaAnterior', etiqueta: 'Semana anterior', desde: '27/07/2026', hasta: '02/08/2026' },
  { clave: 'esteMes', etiqueta: 'Este mes', desde: '01/08/2026', hasta: '31/08/2026' },
];

const semana = (totales: number[]): DiaConIngreso[] =>
  totales.map((total, i) => ({ fecha: `0${3 + i}/08/2026`, total }));

const props = {
  dias: [] as DiaConIngreso[],
  periodos: PERIODOS,
  periodo: 'estaSemana' as const,
  cargando: false,
  error: null as string | null,
  onCambiarPeriodo: () => {},
  onReintentar: () => {},
};

describe('el eje se redondea a numeros que se leen', () => {
  it('con $4,850 de maximo el eje llega a $8k, no a $4,850', () => {
    // El escalon crudo seria $1,212.50 y el eje diria "$1.2k · $2.4k · $3.6k".
    // Nadie lee un eje asi.
    const techo = techoDelEje([485000, 300000, 120000]);
    expect(techo).toBe(800000);
    expect(etiquetaCorta(techo / 4)).toBe('$2k');
    expect(etiquetaCorta(techo)).toBe('$8k');
  });

  it('sin ventas el techo es cero y no se dibuja una linea inventada', () => {
    expect(techoDelEje([0, 0, 0])).toBe(0);
    expect(pasoBonito(0)).toBe(0);
  });

  it('nunca devuelve NaN ni infinito, aunque le llegue basura', () => {
    expect(Number.isFinite(techoDelEje([]))).toBe(true);
    expect(Number.isFinite(pasoBonito(Number.NaN))).toBe(true);
  });
});

describe('las etiquetas del eje', () => {
  it('los miles se abrevian y los pesos sueltos no', () => {
    expect(etiquetaCorta(0)).toBe('$0');
    expect(etiquetaCorta(50000)).toBe('$500');
    expect(etiquetaCorta(150000)).toBe('$1.5k');
    expect(etiquetaCorta(250000000)).toBe('$2.5M');
  });
});

describe('la escala', () => {
  it('el cero queda ABAJO y el techo arriba', () => {
    // En SVG el eje Y crece hacia abajo. Es el error de signo que saca la
    // grafica de cabeza y solo se nota mirandola.
    const p = escalarDesdeCero([0, 100], 100);
    expect(p[0]?.y).toBe(100);
    expect(p[1]?.y).toBe(0);
  });

  it('EL EJE EMPIEZA EN CERO, no en el minimo de los datos', () => {
    /**
     * Con ventas de $4,800 y $5,000, una escala entre minimo y maximo subiria
     * la linea de piso a techo y se leeria como que el negocio se duplico. Un
     * eje de dinero que no empieza en cero exagera cualquier variacion.
     */
    const p = escalarDesdeCero([480000, 500000], 500000);
    expect(p[0]!.y).toBeGreaterThan(0);
    expect(p[0]!.y).toBeLessThan(10);
  });

  it('cada dia cae en el CENTRO de su franja', () => {
    // Es lo que alinea el punto, la columna que se toca y la etiqueta de
    // abajo. Repartidos de borde a borde se ven corridos.
    const p = escalarDesdeCero([1, 1], 1);
    expect(p[0]?.x).toBe(25);
    expect(p[1]?.x).toBe(75);
  });

  it('con un techo de cero no sale ni un NaN', () => {
    // Un NaN dentro del atributo `points` no dibuja absolutamente nada.
    const p = escalarDesdeCero([0, 0], 0);
    expect(p.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
  });
});

describe('las etiquetas de abajo', () => {
  it('una semana lleva el nombre de cada dia', () => {
    const e = etiquetasDeAbajo(['03/08/2026', '04/08/2026', '09/08/2026']);
    expect(e).toEqual(['Lun', 'Mar', 'Dom']);
  });

  it('un mes se numera y se escribe uno de cada varios', () => {
    // Treinta y un nombres de dia se encimarian hasta volverse una mancha.
    // Esconder etiquetas es correcto; encimarlas no.
    const mes = Array.from({ length: 31 }, (_, i) => `${String(i + 1).padStart(2, '0')}/08/2026`);
    const e = etiquetasDeAbajo(mes);
    expect(e.filter(Boolean).length).toBeLessThan(12);
    expect(e[0]).toBe('01');
    // El ultimo dia SIEMPRE se escribe: sin el, el eje parece terminar antes.
    expect(e[30]).toBe('31');
  });
});

describe('la pantalla', () => {
  it('sin ventas deja el eje puesto y lo DICE', () => {
    render(<GraficaDeIngresos {...props} dias={semana([0, 0, 0, 0, 0, 0, 0])} />);
    expect(screen.getByText('Aún no hay ventas cobradas en este periodo.')).toBeTruthy();
  });

  it('con ventas dibuja la linea', () => {
    const { container } = render(<GraficaDeIngresos {...props} dias={semana([100, 200, 0, 300, 0, 0, 0])} />);
    expect(container.querySelector('.ini-grafica__linea')).toBeTruthy();
  });

  it('cada dia se puede alcanzar con TECLADO y dice su cifra exacta', () => {
    // El globito se ve al pasar el raton; quien navega con teclado tiene que
    // enterarse igual, y por eso las columnas son botones de verdad.
    render(<GraficaDeIngresos {...props} dias={semana([485050, 0, 0, 0, 0, 0, 0])} />);
    expect(screen.getByRole('button', { name: /Lunes 3 de agosto: \$4,850\.50/ })).toBeTruthy();
  });

  it('al señalar un dia sale el globito con la cifra completa', async () => {
    render(<GraficaDeIngresos {...props} dias={semana([485050, 0, 0, 0, 0, 0, 0])} />);
    await userEvent.tab();
    // El primer tabulador cae en el selector de periodo; el segundo, en el
    // primer dia.
    await userEvent.tab();
    expect(screen.getByText('$4,850.50')).toBeTruthy();
  });

  it('el periodo se cambia con un select del sistema, no con un menu propio', async () => {
    /**
     * Es la decision que evita de raiz el fallo que ya nos costo tiempo: el
     * menu que oscurece el fondo y no aparece. El del sistema no puede quedar
     * debajo de nada y funciona con teclado sin escribir una linea.
     */
    const cambiar = vi.fn();
    render(<GraficaDeIngresos {...props} onCambiarPeriodo={cambiar} />);
    const select = screen.getByLabelText('Periodo de la gráfica');
    expect(select.tagName).toBe('SELECT');
    await userEvent.selectOptions(select, 'esteMes');
    expect(cambiar).toHaveBeenCalledWith('esteMes');
  });
});

describe('el relleno llega a los dos bordes, la linea no', () => {
  it('se le agrega un punto en cada canto, a la altura de su vecino', () => {
    // Sin esto el area queda como una losa flotando, con dos cantos verticales
    // a los lados: se ve como un error de dibujo, y asi salio en la captura.
    const puntos = escalarDesdeCero([100, 50, 100], 100);
    const relleno = puntosDelRelleno(puntos);

    expect(relleno).toHaveLength(puntos.length + 2);
    expect(relleno[0]?.x).toBe(0);
    expect(relleno[0]?.y).toBe(puntos[0]?.y);
    expect(relleno[relleno.length - 1]?.x).toBe(100);
    expect(relleno[relleno.length - 1]?.y).toBe(puntos[puntos.length - 1]?.y);
  });

  it('sin puntos no inventa un relleno', () => {
    expect(puntosDelRelleno([])).toEqual([]);
  });
});
