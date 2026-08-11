/**
 * @vitest-environment happy-dom
 *
 * Las cuatro tarjetas de arriba.
 *
 * Lo que mas se prueba aqui no es como se ven, sino DOS reglas del producto:
 * que el permiso decida si la tarjeta existe, y que "todavia no se" no se
 * confunda nunca con "cero".
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESUMEN_VACIO, type ResumenDeInicio } from '../../src/datos/tablero.js';
import { Tarjetas, tarjetasDeInicio, textoDelValor } from '../../src/inicio/tarjetas.js';

afterEach(cleanup);

const TODO = {
  gestionarAgenda: true, verFinanzas: true, gestionarInventario: true, gestionarCatalogo: true,
};
const HOY = '06/08/2026';

const resumen = (cambios: Partial<ResumenDeInicio> = {}): ResumenDeInicio => ({
  ...RESUMEN_VACIO,
  ...cambios,
});

describe('que tarjetas ve cada quien', () => {
  it('quien puede todo ve las cuatro', () => {
    expect(tarjetasDeInicio(resumen(), TODO, HOY).map((t) => t.clave)).toEqual([
      'citas', 'ventas', 'productos', 'cursos',
    ]);
  });

  it('SIN permiso de finanzas NO existe la tarjeta de ventas', () => {
    /**
     * No se muestra en gris ni vacia: no existe. Una tarjeta apagada es ruido
     * y de paso le cuenta a quien no debe que esa cifra existe.
     *
     * Y no es la proteccion de verdad: aunque alguien borrara este filtro,
     * `resumen_inicio` corre con los permisos de quien llama y la base le
     * devuelve las ventas en cero.
     */
    const claves = tarjetasDeInicio(resumen(), { gestionarAgenda: true }, HOY).map((t) => t.clave);
    expect(claves).not.toContain('ventas');
    expect(claves).toEqual(['citas']);
  });

  it('sin ningun permiso no se pinta la fila entera', () => {
    const { container } = render(
      <Tarjetas resumen={resumen()} permisos={{}} hoy={HOY} onIr={() => {}} />,
    );
    expect(container.querySelector('.ini-tarjetas')).toBeNull();
  });
});

describe('cargando NO es cero', () => {
  it('mientras no llega el resumen, el valor es una raya', () => {
    /**
     * ES LA PRUEBA MAS IMPORTANTE DE ESTE ARCHIVO.
     *
     * Si una tarjeta que esta cargando mostrara "$0.00", el dueño lee que hoy
     * no ha vendido nada. Cero es una respuesta real y alarmante; "todavia no
     * se" no lo es. Y es la clase de error que nadie reporta, porque no parece
     * un error.
     */
    render(<Tarjetas resumen={null} permisos={TODO} hoy={HOY} onIr={() => {}} />);
    expect(screen.getAllByText('—').length).toBe(4);
    expect(screen.queryByText('$0.00')).toBeNull();
  });

  it('cuando SI hay cero, se dice cero', () => {
    render(<Tarjetas resumen={resumen()} permisos={TODO} hoy={HOY} onIr={() => {}} />);
    expect(screen.getByText('$0.00')).toBeTruthy();
  });

  it('el valor de moneda se formatea completo, sin recortar centavos', () => {
    // El diseño escribe "$4,850"; un total real puede traer centavos y
    // truncarlos en la pantalla del dueño es perder dinero de la vista.
    expect(textoDelValor(485050, true)).toBe('$4,850.50');
    expect(textoDelValor(null, true)).toBe('—');
    expect(textoDelValor(6, false)).toBe('6');
  });
});

describe('la comparacion contra ayer', () => {
  it('cuando ayer fue CERO dice "nuevo", no un porcentaje imposible', () => {
    // El error clasico: dividir entre cero y anunciar "+∞%" o "+5000%" en la
    // pantalla del dueño.
    render(
      <Tarjetas
        resumen={resumen({ ventasHoy: 500000, ventasAyer: null })}
        permisos={TODO}
        hoy={HOY}
        onIr={() => {}}
      />,
    );
    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('Infinity');
    expect(texto).not.toContain('NaN');
    expect(texto).not.toContain('∞');
  });

  it('con ayer real se compara y se dice contra que', () => {
    render(
      <Tarjetas
        resumen={resumen({ ventasHoy: 112000, ventasAyer: 100000 })}
        permisos={TODO}
        hoy={HOY}
        onIr={() => {}}
      />,
    );
    expect(screen.getByText(/vs ayer/)).toBeTruthy();
  });
});

describe('a donde lleva cada tarjeta', () => {
  it('la de citas abre la agenda en el dia de hoy', async () => {
    const ir = vi.fn();
    render(<Tarjetas resumen={resumen()} permisos={TODO} hoy={HOY} onIr={ir} />);
    await userEvent.click(screen.getByText('Citas hoy'));
    expect(ir).toHaveBeenCalledWith({ modulo: 'agenda', parametros: { fecha: HOY } });
  });

  it('el pie de pendientes lleva a la agenda YA FILTRADA en pendientes', async () => {
    const ir = vi.fn();
    render(
      <Tarjetas
        resumen={resumen({ citasHoy: 6, citasPendientes: 2 })}
        permisos={TODO}
        hoy={HOY}
        onIr={ir}
      />,
    );
    await userEvent.click(screen.getByText('2 pendientes'));
    expect(ir).toHaveBeenCalledWith({
      modulo: 'agenda',
      parametros: { fecha: HOY, estado: 'pendiente' },
    });
  });

  it('sin pendientes no se escribe "0 pendientes"', () => {
    render(
      <Tarjetas resumen={resumen({ citasHoy: 3 })} permisos={TODO} hoy={HOY} onIr={() => {}} />,
    );
    expect(screen.queryByText(/pendientes/)).toBeNull();
  });

  it('la tarjeta entera es UN boton y el pie va de texto adentro', () => {
    /*
     * Un boton dentro de otro es HTML invalido: el navegador lo desarma y con
     * teclado se vuelve imposible llegar al de adentro. Antes se evitaba
     * poniendo el pie como boton HERMANO, y el precio se vio en la captura: la
     * tarjeta quedaba partida en dos columnas, con el numero a la izquierda y
     * "Revisar inventario" flotando a la derecha.
     *
     * Ahora la tarjeta entera es el boton y el pie es texto. No se pierde
     * nada: el pie llevaba al MISMO modulo con el mismo filtro.
     */
    const { container } = render(
      <Tarjetas resumen={resumen()} permisos={TODO} hoy={HOY} onIr={() => {}} />,
    );
    expect(container.querySelector('button button')).toBeNull();

    const pie = screen.getByText('Revisar inventario');
    expect(pie.tagName).toBe('SPAN');
    expect(pie.closest('button')).not.toBeNull();
  });
});
