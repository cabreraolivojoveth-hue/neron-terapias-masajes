/**
 * LA ARITMETICA DEL DINERO Y LO QUE CONTESTA EL SERVIDOR.
 *
 * Es la prueba mas importante del modulo: aqui se decide cuanto paga alguien.
 * Un peso de diferencia en un mostrador no es un detalle — es una discusion
 * con el cliente enfrente y un corte que no cuadra al cerrar.
 */

import { describe, expect, it } from 'vitest';
import {
  COMO_SE_DICE_EL_METODO,
  COMO_SE_DICE_EL_TIPO,
  LO_QUE_TOCA_UNA_VENTA,
  RESUMEN_DE_VENTAS_VACIO,
  cambioDe,
  descuentoPorcentual,
  faltaPorPagar,
  importeDelRenglon,
  llaveDeVentas,
  llaveDelCatalogo,
  ordenarConcepto,
  ordenarResumenDeVentas,
  ordenarVenta,
  puedeSubir,
  subtotalDelCarrito,
  sumaDeLosPagos,
  totalDelCarrito,
  type PagoDelCarrito,
  type RenglonDelCarrito,
} from '../src/datos/ventas.js';

const renglon = (extra: Partial<RenglonDelCarrito> = {}): RenglonDelCarrito => ({
  tipo: 'producto',
  id: 'x',
  nombre: 'Concepto',
  precioCentavos: 35000,
  cantidad: 1,
  descuentoCentavos: 0,
  disponible: null,
  ...extra,
});

describe('el importe de un renglon', () => {
  it('precio por cantidad, menos el descuento', () => {
    expect(importeDelRenglon(renglon({ cantidad: 2 }))).toBe(70000);
    expect(importeDelRenglon(renglon({ cantidad: 2, descuentoCentavos: 5000 }))).toBe(65000);
  });

  it('un descuento mayor que el renglon NO deja el renglon negativo', () => {
    // Un renglon negativo hace que el total mienta, y a partir de ahi todo lo
    // que se sume debajo tambien.
    expect(importeDelRenglon(renglon({ descuentoCentavos: 99999999 }))).toBe(0);
  });
});

describe('el dinero no pasa por decimales', () => {
  it('veinte renglones de un centavo suman exactamente veinte centavos', () => {
    // Con flotantes, 0.1 + 0.2 no da 0.3 en ningun lenguaje. En un total de
    // veinte renglones eso se convierte en un peso que nadie encuentra.
    const veinte = Array.from({ length: 20 }, () => renglon({ precioCentavos: 1 }));
    expect(subtotalDelCarrito(veinte)).toBe(20);
  });

  it('el subtotal de una venta mixta', () => {
    const carrito = [
      renglon({ tipo: 'producto', precioCentavos: 35000 }),
      renglon({ tipo: 'servicio', precioCentavos: 80000 }),
      renglon({ tipo: 'curso', precioCentavos: 250000 }),
    ];
    expect(subtotalDelCarrito(carrito)).toBe(365000);
  });
});

describe('el descuento general', () => {
  it('se resta del subtotal', () => {
    expect(totalDelCarrito([renglon()], 5000)).toBe(30000);
  });

  it('NUNCA deja el total por debajo de cero', () => {
    // Un total negativo significaria que el centro le debe al cliente, y eso
    // es una devolucion, no una venta.
    expect(totalDelCarrito([renglon()], 99999999)).toBe(0);
  });

  it('un descuento negativo se ignora en vez de sumar', () => {
    expect(totalDelCarrito([renglon()], -5000)).toBe(35000);
  });

  it('el porcentaje se redondea UNA vez, sobre el total', () => {
    // Renglon por renglon y sumando, da otra cifra: la diferencia es
    // imposible de explicar en un mostrador.
    expect(descuentoPorcentual(33333, 10)).toBe(3333);
    expect(descuentoPorcentual(100000, 15)).toBe(15000);
  });

  it('no pasa del cien por ciento aunque se escriba mas', () => {
    expect(descuentoPorcentual(100000, 500)).toBe(100000);
  });

  it('un porcentaje que no es numero no descuenta nada', () => {
    expect(descuentoPorcentual(100000, Number.NaN)).toBe(0);
    expect(descuentoPorcentual(100000, -5)).toBe(0);
  });
});

describe('los pagos', () => {
  const pagos = (...montos: number[]): PagoDelCarrito[] =>
    montos.map((m) => ({ metodo: 'efectivo', montoCentavos: m }));

  it('un pago mixto son DOS renglones que suman el total', () => {
    // Guardar "mixto" perderia el detalle, y el corte de caja no podria saber
    // cuanto entro en efectivo.
    const dos: PagoDelCarrito[] = [
      { metodo: 'efectivo', montoCentavos: 40000 },
      { metodo: 'tarjeta', montoCentavos: 60000 },
    ];
    expect(sumaDeLosPagos(dos)).toBe(100000);
    expect(faltaPorPagar([renglon({ precioCentavos: 100000 })], 0, dos)).toBe(0);
  });

  it('lo que falta es positivo, y lo que sobra es negativo', () => {
    expect(faltaPorPagar([renglon()], 0, pagos(30000))).toBe(5000);
    expect(faltaPorPagar([renglon()], 0, pagos(40000))).toBe(-5000);
  });

  it('un pago negativo no resta de lo pagado', () => {
    expect(sumaDeLosPagos(pagos(1000, -5000))).toBe(1000);
  });
});

describe('el cambio', () => {
  it('es lo recibido menos lo que se aplico', () => {
    expect(cambioDe(85000, 100000)).toBe(15000);
  });

  it('NUNCA es negativo: si dio de menos, falta dinero, no hay cambio', () => {
    expect(cambioDe(85000, 50000)).toBe(0);
  });

  it('sin efectivo recibido no hay cambio que calcular', () => {
    expect(cambioDe(85000, 0)).toBe(0);
    expect(cambioDe(85000, Number.NaN)).toBe(0);
  });
});

describe('cuantos se pueden llevar', () => {
  it('sin limite siempre se puede subir', () => {
    expect(puedeSubir(renglon({ disponible: null, cantidad: 99 }))).toBe(true);
  });

  it('con el stock justo ya no', () => {
    expect(puedeSubir(renglon({ disponible: 3, cantidad: 3 }))).toBe(false);
    expect(puedeSubir(renglon({ disponible: 3, cantidad: 2 }))).toBe(true);
  });
});

describe('ordenar lo que contesta el servidor', () => {
  it('un resumen vacio son ceros, y el ticket promedio es NULO, no cero', () => {
    // Sin ventas no hay ticket promedio: dividir entre cero no da cero.
    expect(ordenarResumenDeVentas(null)).toEqual(RESUMEN_DE_VENTAS_VACIO);
    expect(ordenarResumenDeVentas({ ventas: 0 }).ticketPromedio).toBeNull();
  });

  it('un ticket promedio que si llega se conserva', () => {
    expect(ordenarResumenDeVentas({ ticketPromedio: 68500 }).ticketPromedio).toBe(68500);
  });

  it('un concepto sin tipo reconocible cae en servicio, no revienta', () => {
    expect(ordenarConcepto({ tipo: 'loquesea', id: 'a' }).tipo).toBe('servicio');
    expect(ordenarConcepto({ tipo: 'producto', id: 'a' }).tipo).toBe('producto');
  });

  it('un producto agotado dice CERO disponible, no "sin limite"', () => {
    // `null` es "sin limite" y cero es "agotado": confundirlos ofrece un
    // producto que no existe.
    expect(ordenarConcepto({ tipo: 'producto', disponible: 0 }).disponible).toBe(0);
    expect(ordenarConcepto({ tipo: 'servicio' }).disponible).toBeNull();
  });

  it('una venta sin cliente deja el nombre en nulo, no en cadena vacia', () => {
    const v = ordenarVenta({ id: 'v1', folio: 'V-00001', fecha: '2026-07-15', cliente: '' });
    expect(v.cliente).toBeNull();
    expect(v.fecha).toBe('15/07/2026');
    expect(v.estado).toBe('borrador');
  });
});

describe('las llaves de cache', () => {
  it('cambian con cada filtro, o dos busquedas distintas verian lo mismo', () => {
    const a = llaveDeVentas('n', '01/01/2026', '31/01/2026', { busqueda: 'ana' }, 1, 10);
    const b = llaveDeVentas('n', '01/01/2026', '31/01/2026', { busqueda: 'jose' }, 1, 10);
    expect(a).not.toBe(b);
  });

  it('el catalogo separa por texto y por tipo', () => {
    expect(llaveDelCatalogo('n', 'aceite', '')).not.toBe(llaveDelCatalogo('n', 'aceite', 'curso'));
  });
});

describe('lo que se refresca al cobrar', () => {
  it('una venta toca inventario, cursos, clientes, caja y el tablero', () => {
    // Es la lista mas larga del sistema, y con razon: si falta una, alguien
    // vuelve a Productos y ve el stock de antes, sin ningun error a la vista.
    for (const p of ['ventas', 'productos', 'cursos', 'clientes', 'caja', 'inicio']) {
      expect(LO_QUE_TOCA_UNA_VENTA).toContain(p);
    }
  });
});

describe('como se leen las cosas', () => {
  it('los tres tipos y los cuatro metodos tienen palabra', () => {
    expect(COMO_SE_DICE_EL_TIPO.servicio).toBe('Servicio');
    expect(COMO_SE_DICE_EL_TIPO.producto).toBe('Producto');
    expect(COMO_SE_DICE_EL_TIPO.curso).toBe('Curso');
    for (const m of ['efectivo', 'tarjeta', 'transferencia', 'otro']) {
      expect(COMO_SE_DICE_EL_METODO[m]).toBeTruthy();
    }
  });
});
