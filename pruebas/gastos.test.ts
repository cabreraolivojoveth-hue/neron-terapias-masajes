/**
 * LA CAPA DE DATOS DE GASTOS.
 *
 * Lo que se vigila aqui es la ARITMETICA DEL DINERO —cuanto sale del cajon— y
 * las validaciones. Que las reglas de acceso muerdan es cosa de los ataques,
 * que corren contra una base de verdad.
 */

import { describe, expect, it } from 'vitest';
import {
  COMO_SE_DICE_EL_METODO,
  COMO_SE_DICE_LA_FRECUENCIA,
  FRECUENCIAS_RECURRENTES,
  GASTO_VACIO,
  LO_QUE_TOCA_UN_GASTO,
  METODOS_DE_GASTO,
  efectivoQueSale,
  llaveDeGastos,
  llaveDelResumenDeGastos,
  loQueFaltaDelGasto,
  type DatosDeGasto,
} from '../src/datos/gastos.js';

const LLENO: DatosDeGasto = {
  ...GASTO_VACIO,
  concepto: 'Renta',
  montoCentavos: 100000,
  efectivoCentavos: 100000,
  fecha: '11/08/2026',
  categoriaId: 'c1',
};

describe('cuanto sale del cajon', () => {
  it('el efectivo sale entero', () => {
    expect(efectivoQueSale({ ...LLENO, metodo: 'efectivo' })).toBe(100000);
  });

  it('la tarjeta y la transferencia NO sacan nada', () => {
    // Son egresos del negocio y CERO efectivo. Sin esta distincion, al cerrar
    // el dia falta justo la renta y nadie sabe si es un faltante de verdad.
    expect(efectivoQueSale({ ...LLENO, metodo: 'tarjeta', efectivoCentavos: 0 })).toBe(0);
    expect(efectivoQueSale({ ...LLENO, metodo: 'transferencia', efectivoCentavos: 0 })).toBe(0);
  });

  it('el mixto saca SOLO su parte en efectivo', () => {
    // $1,000 con $300 en efectivo sacan $300, no $1,000.
    expect(
      efectivoQueSale({ ...LLENO, metodo: 'mixto', efectivoCentavos: 30000, metodoResto: 'tarjeta' }),
    ).toBe(30000);
  });
});

describe('las validaciones', () => {
  it('un gasto completo pasa', () => {
    expect(Object.keys(loQueFaltaDelGasto(LLENO))).toHaveLength(0);
  });

  it('un concepto de puros espacios no cuenta como concepto', () => {
    expect(loQueFaltaDelGasto({ ...LLENO, concepto: '   ' })['concepto']).toBeTruthy();
  });

  it('el monto tiene que ser mayor que cero', () => {
    expect(loQueFaltaDelGasto({ ...LLENO, montoCentavos: 0 })['monto']).toBeTruthy();
    expect(loQueFaltaDelGasto({ ...LLENO, montoCentavos: -1 })['monto']).toBeTruthy();
  });

  it('un mixto con TODO en efectivo no es mixto', () => {
    // Es efectivo, y la base lo rechazaria. Se dice antes y mejor.
    const malo = { ...LLENO, metodo: 'mixto' as const, efectivoCentavos: 100000, metodoResto: 'tarjeta' as const };
    expect(loQueFaltaDelGasto(malo)['efectivo']).toBeTruthy();
  });

  it('un mixto sin efectivo tampoco', () => {
    const malo = { ...LLENO, metodo: 'mixto' as const, efectivoCentavos: 0, metodoResto: 'tarjeta' as const };
    expect(loQueFaltaDelGasto(malo)['efectivo']).toBeTruthy();
  });
});

describe('las llaves del cache', () => {
  it('cambian con el periodo: dos rangos no comparten respuesta', () => {
    // Compartiendo llave, cambiar de mes enseñaria los gastos del anterior.
    expect(llaveDeGastos('n1', '01/08/2026', '31/08/2026')).not.toBe(
      llaveDeGastos('n1', '01/07/2026', '31/07/2026'),
    );
  });

  it('cambian con el centro: nunca se cruzan dos negocios', () => {
    expect(llaveDeGastos('n1', '01/08/2026', '31/08/2026')).not.toBe(
      llaveDeGastos('n2', '01/08/2026', '31/08/2026'),
    );
  });

  it('la lista y el resumen tienen llaves distintas', () => {
    expect(llaveDeGastos('n1', 'a', 'b')).not.toBe(llaveDelResumenDeGastos('n1', 'a', 'b'));
  });
});

describe('lo que se refresca al mover un gasto', () => {
  it('incluye la caja: un gasto en efectivo mueve el cajon en el acto', () => {
    // Sin esto, se registra la renta y la caja sigue diciendo el saldo de
    // antes hasta que alguien recargue — y con un numero viejo en pantalla se
    // cuentan mal los billetes.
    expect(LO_QUE_TOCA_UN_GASTO).toContain('caja');
  });

  it('e Inicio, que cuenta los egresos del dia', () => {
    expect(LO_QUE_TOCA_UN_GASTO).toContain('inicio');
  });
});

describe('los catalogos', () => {
  it('las cuatro formas de pago tienen su nombre en palabras', () => {
    for (const m of METODOS_DE_GASTO) {
      expect(COMO_SE_DICE_EL_METODO[m]).toBeTruthy();
    }
  });

  it('"unico" NO es una frecuencia recurrente', () => {
    // Un gasto suelto es uno sin plantilla detras: la frecuencia es de la
    // plantilla, no del gasto. Ofrecer "unico" al configurar un recurrente
    // seria configurar algo que no se repite.
    expect(FRECUENCIAS_RECURRENTES).not.toContain('unico');
    expect(COMO_SE_DICE_LA_FRECUENCIA['unico']).toBe('Único');
  });

  it('las ocho frecuencias tienen nombre', () => {
    for (const f of FRECUENCIAS_RECURRENTES) {
      expect(COMO_SE_DICE_LA_FRECUENCIA[f]).toBeTruthy();
    }
  });
});
