/**
 * @vitest-environment happy-dom
 *
 * LA TABLA DE GASTOS.
 *
 * Lo que mas se vigila aqui es el FOCO DEL BUSCADOR. Es el fallo que ya nos
 * costo en otros modulos —se escribe una letra y el campo se desmarca— y no
 * lo cacha ningun tipo ni ninguna guardia: solo una prueba que escriba de
 * verdad y compruebe que el cursor sigue ahi.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GastoEnLista } from '../../src/datos/gastos.js';
import {
  FILTROS_VACIOS,
  TablaDeGastos,
  agruparPorCategoria,
  agruparPorMetodo,
  comoCentavos,
  filtrarGastos,
  gastoCoincide,
  hayFiltroPuesto,
  ordenarGastos,
} from '../../src/gastos/tabla-de-gastos.js';

afterEach(cleanup);

/** Un gasto de prueba. Los datos son de la PRUEBA, no del producto. */
function gasto(sobre: Partial<GastoEnLista> = {}): GastoEnLista {
  return {
    id: 'g1',
    fecha: '11/08/2026',
    concepto: 'Concepto',
    detalle: null,
    montoCentavos: 10000,
    metodo: 'efectivo',
    efectivoCentavos: 10000,
    metodoResto: null,
    categoriaId: 'c1',
    categoria: 'Servicios',
    categoriaColor: null,
    proveedorId: null,
    proveedor: null,
    referencia: null,
    notas: null,
    recurrenteId: null,
    frecuencia: 'unico',
    usuario: 'Quien administra',
    creadoEn: '2026-08-11T10:00:00Z',
    anulado: false,
    anuladoMotivo: null,
    sustituyeA: null,
    ...sobre,
  };
}

const PROPIEDADES = {
  categorias: [],
  proveedores: [],
  usuarios: [],
  filtros: FILTROS_VACIOS,
  filtrosAbiertos: false,
  columna: 'fecha' as const,
  descendente: true,
  pagina: 1,
  porPagina: 10,
  seleccionado: null,
  cargando: false,
  error: null,
  puedeGestionar: true,
  onFiltros: () => {},
  onAbrirFiltros: () => {},
  onOrden: () => {},
  onPagina: () => {},
  onPorPagina: () => {},
  onAbrir: () => {},
  onAccion: () => {},
  onNuevo: () => {},
  onExportar: () => {},
  onReintentar: () => {},
};

describe('el buscador NO pierde el foco', () => {
  it('se puede escribir un nombre entero sin que se desmarque', async () => {
    /*
     * EL FALLO QUE ESTA PRUEBA EXISTE PARA IMPEDIR: en otros modulos el campo
     * vivia dentro de un `{cargando ? … : …}`, asi que React lo destruia y lo
     * volvia a crear con cada tecla. Un campo destruido pierde el foco, el
     * cursor y la seleccion, y hay que volver a tocarlo para escribir la
     * segunda letra.
     */
    let texto = '';
    const { rerender } = render(
      <TablaDeGastos
        {...PROPIEDADES}
        gastos={[gasto()]}
        filtros={{ ...FILTROS_VACIOS, texto }}
        onFiltros={(f) => {
          texto = f.texto;
        }}
      />,
    );

    const campo = screen.getByLabelText(/buscar por concepto/i);
    campo.focus();
    expect(document.activeElement).toBe(campo);

    for (const letra of 'Renta') {
      await userEvent.type(campo, letra);
      rerender(
        <TablaDeGastos
          {...PROPIEDADES}
          gastos={[gasto()]}
          filtros={{ ...FILTROS_VACIOS, texto }}
          onFiltros={(f) => {
            texto = f.texto;
          }}
        />,
      );
      // Despues de CADA letra: sigue siendo el mismo elemento y sigue enfocado.
      expect(document.activeElement).toBe(screen.getByLabelText(/buscar por concepto/i));
    }
    expect(texto).toBe('Renta');
  });

  it('el campo sigue puesto mientras carga, no desaparece', () => {
    // Si desapareciera al cargar, volveria a nacer al terminar — y ahi es
    // donde se pierde el foco.
    render(<TablaDeGastos {...PROPIEDADES} gastos={[]} cargando />);
    expect(screen.getByLabelText(/buscar por concepto/i)).toBeTruthy();
  });
});

describe('donde busca el buscador', () => {
  it('encuentra por concepto, proveedor, categoria y referencia', () => {
    const g = gasto({ proveedor: 'Aromas del Valle', referencia: 'F-8891' });
    expect(gastoCoincide(g, 'concepto')).toBe(true);
    expect(gastoCoincide(g, 'aromas')).toBe(true);
    expect(gastoCoincide(g, 'servicios')).toBe(true);
    expect(gastoCoincide(g, 'F-8891')).toBe(true);
    expect(gastoCoincide(g, 'nada de esto')).toBe(false);
  });

  it('no exige acentos: quien escribe rapido no los pone', () => {
    const g = gasto({ concepto: 'Alineación Energética' });
    expect(gastoCoincide(g, 'energetica')).toBe(true);
    expect(gastoCoincide(g, 'ALINEACION')).toBe(true);
  });

  it('sin texto, todo coincide', () => {
    expect(gastoCoincide(gasto(), '   ')).toBe(true);
  });
});

describe('los filtros', () => {
  it('se combinan entre si', () => {
    const lista = [
      gasto({ id: 'a', categoriaId: 'c1', metodo: 'efectivo', montoCentavos: 10000 }),
      gasto({ id: 'b', categoriaId: 'c1', metodo: 'tarjeta', montoCentavos: 90000 }),
      gasto({ id: 'c', categoriaId: 'c2', metodo: 'efectivo', montoCentavos: 50000 }),
    ];
    const salida = filtrarGastos(lista, {
      ...FILTROS_VACIOS,
      categoriaId: 'c1',
      metodo: 'efectivo',
    });
    expect(salida.map((g) => g.id)).toEqual(['a']);
  });

  it('el rango de monto recorta por los dos lados', () => {
    const lista = [
      gasto({ id: 'a', montoCentavos: 5000 }),
      gasto({ id: 'b', montoCentavos: 50000 }),
      gasto({ id: 'c', montoCentavos: 500000 }),
    ];
    const salida = filtrarGastos(lista, { ...FILTROS_VACIOS, montoMin: '100', montoMax: '1000' });
    expect(salida.map((g) => g.id)).toEqual(['b']);
  });

  it('los anulados NO se ven salvo que se pidan', () => {
    // Sumados a la vista, la tabla dejaria de cuadrar con las cifras de arriba.
    const lista = [gasto({ id: 'a' }), gasto({ id: 'b', anulado: true })];
    expect(filtrarGastos(lista, FILTROS_VACIOS).map((g) => g.id)).toEqual(['a']);
    expect(
      filtrarGastos(lista, { ...FILTROS_VACIOS, incluirAnulados: true }).map((g) => g.id),
    ).toEqual(['a', 'b']);
  });

  it('el texto solo no cuenta como filtro puesto', () => {
    // El boton "Limpiar filtros" no debe encenderse por escribir en el
    // buscador: son dos cosas distintas.
    expect(hayFiltroPuesto({ ...FILTROS_VACIOS, texto: 'renta' })).toBe(false);
    expect(hayFiltroPuesto({ ...FILTROS_VACIOS, metodo: 'efectivo' })).toBe(true);
  });

  it('los pesos escritos se leen como centavos', () => {
    expect(comoCentavos('1000')).toBe(100000);
    expect(comoCentavos('10.50')).toBe(1050);
    expect(comoCentavos('')).toBeNull();
    expect(comoCentavos('abc')).toBeNull();
  });
});

describe('el orden', () => {
  it('por fecha compara el calendario, no el texto', () => {
    // "02/01" es mayor que "01/12" como texto, y menor como fecha. Sin
    // convertir, el orden sale al reves dentro del mismo año.
    const lista = [
      gasto({ id: 'ene', fecha: '02/01/2026' }),
      gasto({ id: 'dic', fecha: '01/12/2026' }),
    ];
    expect(ordenarGastos(lista, 'fecha', true).map((g) => g.id)).toEqual(['dic', 'ene']);
  });

  it('por monto, de mayor a menor y al reves', () => {
    const lista = [
      gasto({ id: 'chico', montoCentavos: 100 }),
      gasto({ id: 'grande', montoCentavos: 900 }),
    ];
    expect(ordenarGastos(lista, 'monto', true).map((g) => g.id)).toEqual(['grande', 'chico']);
    expect(ordenarGastos(lista, 'monto', false).map((g) => g.id)).toEqual(['chico', 'grande']);
  });

  it('no muta la lista que recibe', () => {
    // Ordenar en el sitio haria que React no viera un array nuevo y a veces no
    // repintara — un fallo que aparece y desaparece sin explicacion.
    const lista = [gasto({ id: 'a', montoCentavos: 1 }), gasto({ id: 'b', montoCentavos: 2 })];
    ordenarGastos(lista, 'monto', true);
    expect(lista.map((g) => g.id)).toEqual(['a', 'b']);
  });
});

describe('los agrupados', () => {
  it('suman por categoria y ordenan por lo que mas pesa', () => {
    const lista = [
      gasto({ categoriaId: 'c1', categoria: 'Renta', montoCentavos: 100000 }),
      gasto({ categoriaId: 'c2', categoria: 'Luz', montoCentavos: 20000 }),
      gasto({ categoriaId: 'c1', categoria: 'Renta', montoCentavos: 50000 }),
    ];
    const grupos = agruparPorCategoria(lista);
    expect(grupos[0]?.nombre).toBe('Renta');
    expect(grupos[0]?.centavos).toBe(150000);
    expect(grupos[0]?.cuantos).toBe(2);
  });

  it('un gasto sin categoria se agrupa aparte, no se pierde', () => {
    const grupos = agruparPorCategoria([gasto({ categoriaId: null, categoria: null })]);
    expect(grupos[0]?.nombre).toBe('Sin categoría');
  });

  it('suman por forma de pago', () => {
    const grupos = agruparPorMetodo([
      gasto({ metodo: 'efectivo', montoCentavos: 100 }),
      gasto({ metodo: 'tarjeta', montoCentavos: 900 }),
    ]);
    expect(grupos[0]?.nombre).toBe('Tarjeta');
    expect(grupos[0]?.centavos).toBe(900);
  });
});

describe('lo que se ve y lo que no', () => {
  it('sin gastos invita a registrar el primero', () => {
    render(<TablaDeGastos {...PROPIEDADES} gastos={[]} />);
    expect(screen.getByText('Sin gastos registrados')).toBeTruthy();
  });

  it('con filtro que no deja nada, NO dice que no hay gastos', () => {
    // Son dos cosas distintas: "no hay" invita a capturar; "no coincide"
    // invita a quitar el filtro.
    render(
      <TablaDeGastos
        {...PROPIEDADES}
        gastos={[gasto()]}
        filtros={{ ...FILTROS_VACIOS, texto: 'no existe' }}
      />,
    );
    expect(screen.getByText('Ningún gasto coincide')).toBeTruthy();
  });

  it('quien no gestiona no ve el boton de nuevo gasto', () => {
    // Esconderlo es cortesia; la regla de fila de la base es el permiso.
    render(<TablaDeGastos {...PROPIEDADES} gastos={[gasto()]} puedeGestionar={false} />);
    expect(screen.queryByRole('button', { name: /nuevo gasto/i })).toBeNull();
  });

  it('se pagina sobre lo FILTRADO, no sobre el total', () => {
    // "1 a 10 de 340" con doce en pantalla hace pensar que el filtro no se
    // aplico.
    const lista = Array.from({ length: 12 }, (_, i) =>
      gasto({ id: `g${i}`, concepto: i < 3 ? 'Renta' : 'Otro' }),
    );
    render(
      <TablaDeGastos
        {...PROPIEDADES}
        gastos={lista}
        filtros={{ ...FILTROS_VACIOS, texto: 'Renta' }}
      />,
    );
    expect(screen.getByText(/de 3 gastos/)).toBeTruthy();
  });

  it('exportar se apaga cuando no hay nada que exportar', () => {
    render(<TablaDeGastos {...PROPIEDADES} gastos={[]} />);
    expect(screen.getByRole('button', { name: /exportar/i }).hasAttribute('disabled')).toBe(true);
  });

  it('si falla, se dice que fallo y se puede reintentar', () => {
    const reintentar = vi.fn();
    render(
      <TablaDeGastos
        {...PROPIEDADES}
        gastos={[]}
        error="se cayo la red"
        onReintentar={reintentar}
      />,
    );
    expect(screen.getByText('No pudimos cargar los gastos.')).toBeTruthy();
  });
});
