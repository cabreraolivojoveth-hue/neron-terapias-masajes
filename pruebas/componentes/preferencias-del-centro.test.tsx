/**
 * @vitest-environment happy-dom
 *
 * LAS CUATRO PREFERENCIAS que escriben el mismo bloque. Lo que se vigila es lo
 * que se PROMETE en cada una: facturación guarda datos y no timbra nada, y el
 * tema es del centro y no de cada quien. Prometer de más en una pantalla de
 * configuración es como alguien descubre en el peor momento que no tenía lo que
 * creía.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreferenciasDelCentro } from '../../src/configuracion/preferencias-del-centro.js';
import { CENTRO_VACIO } from '../../src/datos/configuracion.js';

afterEach(cleanup);

const pintar = (cual: string, extra: Record<string, unknown> = {}) => {
  const onCambiar = vi.fn();
  const onGuardar = vi.fn();
  render(
    <PreferenciasDelCentro
      cual={cual as 'dinero'}
      datos={CENTRO_VACIO}
      loQueFalta={{}}
      mostrarErrores={false}
      trabajando={false}
      error={null}
      puedeGuardar
      onCambiar={onCambiar}
      onGuardar={onGuardar}
      {...extra}
    />,
  );
  return { onCambiar, onGuardar };
};

describe('impuestos y moneda', () => {
  it('explica que significa "el precio ya lleva el impuesto"', () => {
    /*
     * NO ES COSMETICO: si los precios lo llevan dentro, el desglose se calcula
     * hacia atras; si no, se suma encima. Equivocarlo cambia TODOS los totales
     * del centro.
     */
    pintar('dinero');
    expect(screen.getByText(/un servicio de \$500 son \$500 en total/i)).toBeDefined();
  });

  it('la moneda se manda en mayusculas aunque se escriba abajo', async () => {
    const { onCambiar } = pintar('dinero', { datos: { ...CENTRO_VACIO, moneda: '' } });
    await userEvent.type(screen.getByLabelText(/Moneda/), 'u');
    expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ moneda: 'U' }));
  });
});

describe('metodos de pago', () => {
  it('ofrece SOLO los que sabe cobrar la base', () => {
    // Un metodo inventado produciria cobros que la base rechaza con un error de
    // restriccion que no dice nada.
    pintar('pagos');
    for (const m of ['Efectivo', 'Tarjeta', 'Transferencia', 'Otro']) {
      expect(screen.getByLabelText(m), m).toBeDefined();
    }
  });

  it('avisa de que cobrar en efectivo exige la caja abierta', () => {
    // Billetes en un cajon que ningun corte va a contar son un descuadre
    // garantizado.
    pintar('pagos');
    expect(screen.getByText(/exige tener la caja abierta/i)).toBeDefined();
  });

  it('quitar uno conserva el ORDEN del producto, no el de los clics', async () => {
    /*
     * Con el orden de los clics, el mostrador pintaria los botones en un orden
     * distinto cada vez que alguien toca esta pantalla.
     */
    const { onCambiar } = pintar('pagos', {
      datos: { ...CENTRO_VACIO, metodosDePago: ['transferencia'] },
    });
    await userEvent.click(screen.getByLabelText('Efectivo'));
    expect(onCambiar).toHaveBeenCalledWith(
      expect.objectContaining({ metodosDePago: ['efectivo', 'transferencia'] }),
    );
  });
});

describe('facturacion', () => {
  it('dice que aqui NO se timbra nada', () => {
    /*
     * Emitir una factura electronica necesita un proveedor autorizado y los
     * sellos del centro. Un boton de "facturar" que guarda un RFC y ya es la
     * clase de promesa que se descubre rota con el cliente delante.
     */
    pintar('facturacion');
    expect(screen.getByText(/se guardan los datos, no se timbra nada/i)).toBeDefined();
  });

  it('lo que si sirve tambien se dice: salen en los comprobantes', () => {
    pintar('facturacion');
    expect(screen.getByText(/salen en los comprobantes que se imprimen/i)).toBeDefined();
  });
});

describe('apariencia', () => {
  it('avisa de que el tema es DEL CENTRO, no de cada quien', () => {
    /*
     * No hay donde guardar una preferencia por persona sin inventarle una tabla
     * a `membresia`. Una pantalla que promete "tu tema" y en realidad se lo
     * cambia a todos es peor que una que dice la verdad.
     */
    pintar('apariencia');
    expect(screen.getByText(/se lo cambia a todo el equipo/i)).toBeDefined();
  });

  it('ofrece las tres opciones, incluida la del sistema', () => {
    // Mucha gente tiene su computadora en automatico: sin la tercera, esta
    // seria la unica ventana que no acompaña al resto al anochecer.
    pintar('apariencia');
    for (const t of ['El del sistema', 'Claro', 'Oscuro']) {
      expect(screen.getByRole('button', { name: t }), t).toBeDefined();
    }
  });

  it('NO deja escoger colores, y explica por que', () => {
    // El primer verde del producto se cayo en 4.06:1 de contraste y hubo que
    // bajarlo. Un color a ojo deja la pantalla ilegible con el sol encima.
    pintar('apariencia');
    expect(screen.getByText(/prueba de contraste antes de entrar/i)).toBeDefined();
    expect(screen.queryByLabelText(/^Color/)).toBeNull();
  });
});

describe('guardar', () => {
  it('sin permiso el boton esta apagado', () => {
    pintar('dinero', { puedeGuardar: false });
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});
