/**
 * @vitest-environment happy-dom
 *
 * EL CARRITO: buscar en los tres catalogos y armar los renglones.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Carrito,
  FILTROS_DE_TIPO,
  comoSeDiceLoQueQueda,
  sePuedeAgregar,
} from '../../src/ventas/carrito.js';
import type { ConceptoVendible, RenglonDelCarrito } from '../../src/datos/ventas.js';

afterEach(cleanup);

const CONCEPTO: ConceptoVendible = {
  tipo: 'producto',
  id: 'p1',
  nombre: 'Concepto Uno',
  detalle: null,
  precioCentavos: 35000,
  disponible: 3,
  codigo: 'SKU1',
};

const RENGLON: RenglonDelCarrito = {
  tipo: 'producto',
  id: 'p1',
  nombre: 'Concepto Uno',
  precioCentavos: 35000,
  cantidad: 1,
  descuentoCentavos: 0,
  disponible: 3,
};

function pintar(extra: Partial<React.ComponentProps<typeof Carrito>> = {}) {
  const props: React.ComponentProps<typeof Carrito> = {
    renglones: [], catalogo: [], busqueda: '', tipo: '', notas: '', notaAbierta: false,
    cargando: false, error: null,
    onBuscar: () => {}, onTipo: () => {}, onAgregar: () => {},
    onCantidad: () => {}, onDescuento: () => {}, onQuitar: () => {},
    onNotas: () => {}, onAbrirNota: () => {},
    ...extra,
  };
  return render(<Carrito {...props} />);
}

describe('cuantos quedan', () => {
  it('un servicio sin limite no dice nada', () => {
    expect(comoSeDiceLoQueQueda({ ...CONCEPTO, disponible: null })).toBe('');
  });

  it('agotado se DICE, no se esconde', () => {
    // Esconderlo hace creer que nunca se dio de alta y alguien lo captura otra vez.
    expect(comoSeDiceLoQueQueda({ ...CONCEPTO, disponible: 0 })).toBe('Agotado');
  });

  it('con existencias dice cuantas', () => {
    expect(comoSeDiceLoQueQueda(CONCEPTO)).toBe('Quedan 3');
  });
});

describe('si se puede agregar', () => {
  it('sin limite, siempre', () => {
    expect(sePuedeAgregar({ ...CONCEPTO, disponible: null }, 99)).toBe(true);
  });

  it('con el stock ya en el carrito, ya no', () => {
    expect(sePuedeAgregar(CONCEPTO, 3)).toBe(false);
    expect(sePuedeAgregar(CONCEPTO, 2)).toBe(true);
  });
});

describe('los filtros de tipo', () => {
  it('son los cuatro del diseño y el primero es Todos', () => {
    expect(FILTROS_DE_TIPO.map((f) => f.etiqueta)).toEqual([
      'Todos', 'Servicios', 'Productos', 'Cursos',
    ]);
  });
});

describe('el carrito vacio', () => {
  it('dice que se pueden mezclar los tres, en vez de quedarse en blanco', () => {
    pintar();
    expect(screen.getByText(/mezclar servicios, productos y cursos/i)).toBeTruthy();
  });

  it('sin escribir nada NO se pinta el catalogo entero', () => {
    // Bajar los tres catalogos completos al abrir la pantalla tarda, y ademas
    // no sirve de nada: quien cobra sabe que busca.
    pintar({ catalogo: [CONCEPTO] });
    expect(screen.queryByText('Concepto Uno')).toBeNull();
  });
});

describe('buscar', () => {
  it('avisa letra por letra sin perder lo escrito', async () => {
    const escrito: string[] = [];
    pintar({ onBuscar: (t) => escrito.push(t) });
    const campo = screen.getByLabelText(/buscar servicio, producto o curso/i);
    await userEvent.type(campo, 'ace');
    expect(escrito).toEqual(['a', 'c', 'e']);
  });

  it('lo agotado se enseña, pero NO se puede agregar', async () => {
    const agregados: string[] = [];
    pintar({
      busqueda: 'con',
      catalogo: [{ ...CONCEPTO, disponible: 0 }],
      onAgregar: (c) => agregados.push(c.id),
    });
    const boton = screen.getByRole('button', { name: /Concepto Uno/ });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(boton);
    expect(agregados).toEqual([]);
  });

  it('sin coincidencias manda al modulo donde SI se dan de alta', () => {
    pintar({ busqueda: 'nada', catalogo: [] });
    expect(screen.getByText(/se dan de alta en su propio módulo/i)).toBeTruthy();
  });
});

describe('los renglones', () => {
  it('el + se apaga al llegar al stock, no al cobrar', () => {
    // El rechazo con el cliente enfrente y la cartera fuera es el peor momento.
    pintar({ renglones: [{ ...RENGLON, cantidad: 3 }] });
    const mas = screen.getByLabelText(/agregar uno de Concepto Uno/i) as HTMLButtonElement;
    expect(mas.disabled).toBe(true);
  });

  it('el − se apaga en uno: quitar del todo es la papelera', () => {
    pintar({ renglones: [RENGLON] });
    const menos = screen.getByLabelText(/quitar uno de Concepto Uno/i) as HTMLButtonElement;
    expect(menos.disabled).toBe(true);
  });

  it('el total del renglon ya trae su descuento', () => {
    pintar({ renglones: [{ ...RENGLON, cantidad: 2, descuentoCentavos: 5000 }] });
    // 350.00 x 2 − 50.00 = 650.00
    expect(screen.getByText(/650/)).toBeTruthy();
  });

  it('quitar avisa con el indice', async () => {
    const quitados: number[] = [];
    pintar({ renglones: [RENGLON], onQuitar: (i) => quitados.push(i) });
    await userEvent.click(screen.getByLabelText(/quitar Concepto Uno de la venta/i));
    expect(quitados).toEqual([0]);
  });
});

describe('la nota', () => {
  it('empieza cerrada, con su boton', () => {
    pintar();
    expect(screen.getByRole('button', { name: /agregar nota a la venta/i })).toBeTruthy();
  });

  it('una vez escrita se queda abierta aunque nadie la vuelva a abrir', () => {
    // Si se cerrara, la nota se veria perdida y se escribiria dos veces.
    pintar({ notas: 'Pendiente de agendar', notaAbierta: false });
    expect((screen.getByLabelText(/nota de la venta/i) as HTMLTextAreaElement).value)
      .toBe('Pendiente de agendar');
  });

  it('escribir avisa hacia arriba, no se queda en el navegador', async () => {
    const notas = vi.fn();
    pintar({ notaAbierta: true, onNotas: notas });
    await userEvent.type(screen.getByLabelText(/nota de la venta/i), 'x');
    expect(notas).toHaveBeenCalledWith('x');
  });
});

describe('cuando el catalogo falla', () => {
  it('lo dice con el mensaje del servidor, no con una lista vacia', () => {
    pintar({ busqueda: 'a', error: 'permission denied' });
    expect(screen.getByRole('alert').textContent).toContain('permission denied');
  });
});
