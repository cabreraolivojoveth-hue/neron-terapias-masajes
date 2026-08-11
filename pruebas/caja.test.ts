/**
 * LA ARITMETICA DE LA CAJA.
 *
 * Aqui se decide si un corte cuadra. Un peso de diferencia no es un detalle:
 * es alguien contando billetes tres veces a las nueve de la noche.
 */

import { describe, expect, it } from 'vitest';
import {
  CLASES_DE_MOVIMIENTO,
  COMO_SE_DICE_EL_METODO_DE_CAJA,
  COMO_SE_DICE_LA_CLASE,
  LO_QUE_TOCA_LA_CAJA,
  METODOS_DE_CAJA,
  REPORTE_DE_CAJA_VACIO,
  RESUMEN_DE_CAJA_VACIO,
  centavosDeLoEscrito,
  comoSeLeeLaDiferencia,
  diferenciaDelCorte,
  efectivoEsperado,
  llaveDeMovimientos,
  ordenarCaja,
  ordenarCajaDelHistorial,
  ordenarMovimiento,
  ordenarReporteDeCaja,
  ordenarResumenDeCaja,
  porcentajeDelMetodo,
  type CajaAbierta,
} from '../src/datos/caja.js';

const caja = (extra: Partial<CajaAbierta> = {}): CajaAbierta => ({
  id: 'c1', nombre: 'Caja 1', estado: 'abierta',
  saldoInicialCentavos: 200000,
  abiertaEn: '2026-07-10T08:30:00Z', abiertaPor: 'Quien abrio', observaciones: null,
  ingresosCentavos: 0, egresosCentavos: 0,
  efectivoEntroCentavos: 0, efectivoSalioCentavos: 0,
  efectivoEsperadoCentavos: 200000, movimientos: 0,
  ...extra,
});

describe('el efectivo del cajon', () => {
  it('es inicial mas lo que entro en efectivo menos lo que salio en efectivo', () => {
    expect(efectivoEsperado(caja({
      efectivoEntroCentavos: 30000, efectivoSalioCentavos: 65000,
    }))).toBe(165000);
  });

  it('LA TARJETA NO CUENTA, aunque sea un ingreso del negocio', () => {
    // Es la regla que sostiene el modulo: si la tarjeta contara, el corte
    // pediria contar dinero que esta en el banco.
    const conTarjeta = caja({
      ingresosCentavos: 130000,      // 300 efectivo + 1000 tarjeta
      efectivoEntroCentavos: 30000,  // solo los 300
    });
    expect(efectivoEsperado(conTarjeta)).toBe(230000);
    expect(efectivoEsperado(conTarjeta)).not.toBe(
      conTarjeta.saldoInicialCentavos + conTarjeta.ingresosCentavos,
    );
  });

  it('sin caja abierta no hay efectivo que esperar', () => {
    expect(efectivoEsperado(null)).toBe(0);
  });
});

describe('la diferencia del corte', () => {
  it('conserva el signo: sobrar y faltar no son lo mismo', () => {
    expect(diferenciaDelCorte(160000, 165000)).toBe(-5000);
    expect(diferenciaDelCorte(170000, 165000)).toBe(5000);
    expect(diferenciaDelCorte(165000, 165000)).toBe(0);
  });

  it('se lee con palabras, no solo con un numero', () => {
    expect(comoSeLeeLaDiferencia(0)).toBe('cuadra');
    expect(comoSeLeeLaDiferencia(5000)).toBe('sobra');
    expect(comoSeLeeLaDiferencia(-5000)).toBe('falta');
  });

  it('una caja sin cortar todavia NO tiene diferencia', () => {
    // Nulo es "nadie ha contado". Cero seria decir que ya cuadro.
    expect(comoSeLeeLaDiferencia(null)).toBe('cuadra');
    expect(ordenarCajaDelHistorial({ estado: 'abierta' }).diferenciaCentavos).toBeNull();
    expect(ordenarCajaDelHistorial({ estado: 'abierta' }).contadoCentavos).toBeNull();
  });
});

describe('los porcentajes del pastel', () => {
  it('salen de los movimientos reales, con un decimal', () => {
    expect(porcentajeDelMetodo(265000, 485000)).toBe(54.6);
    expect(porcentajeDelMetodo(145000, 485000)).toBe(29.9);
  });

  it('sin movimientos es CERO, no NaN', () => {
    // Dividir entre cero pintaria "NaN%" en una caja recien abierta.
    expect(porcentajeDelMetodo(0, 0)).toBe(0);
    expect(Number.isNaN(porcentajeDelMetodo(100, 0))).toBe(false);
  });
});

describe('lo que alguien escribe', () => {
  it('los pesos se vuelven centavos enteros', () => {
    expect(centavosDeLoEscrito('2000')).toBe(200000);
  });

  it('vacio es cero, y las letras se ignoran', () => {
    expect(centavosDeLoEscrito('')).toBe(0);
    expect(centavosDeLoEscrito('mil')).toBe(0);
    expect(centavosDeLoEscrito('1a2')).toBe(1200);
  });
});

describe('ordenar lo que contesta el servidor', () => {
  it('sin caja abierta contesta NULO, no una caja vacia', () => {
    // Una caja vacia con ceros se leeria como "hay caja y no se ha vendido".
    expect(ordenarCaja(null)).toBeNull();
    expect(ordenarCaja({})).toBeNull();
  });

  it('una caja abierta trae sus dos pares de cifras', () => {
    const c = ordenarCaja({
      id: 'c1', nombre: 'Caja 1', saldoInicialCentavos: 200000,
      ingresosCentavos: 130000, efectivoEntroCentavos: 30000,
      efectivoEsperadoCentavos: 230000,
    });
    expect(c?.ingresosCentavos).toBe(130000);
    expect(c?.efectivoEntroCentavos).toBe(30000);
  });

  it('un movimiento sin metodo se lee como EFECTIVO', () => {
    // Los movimientos de antes de Ventas no llevaban metodo. Darlos por
    // efectivo es lo conservador: ese dinero salio del cajon.
    expect(ordenarMovimiento({ id: 'm1' }).metodo).toBe('efectivo');
  });

  it('un movimiento sin categoria la deja NULA, no en cadena vacia', () => {
    expect(ordenarMovimiento({ id: 'm1', categoria: '' }).categoria).toBeNull();
  });

  it('un resumen vacio son ceros y listas vacias', () => {
    expect(ordenarResumenDeCaja(null)).toEqual(RESUMEN_DE_CAJA_VACIO);
    expect(ordenarResumenDeCaja({}).metodos).toEqual([]);
  });

  it('un reporte vacio tambien', () => {
    expect(ordenarReporteDeCaja(null)).toEqual(REPORTE_DE_CAJA_VACIO);
    expect(ordenarReporteDeCaja({}).cortes).toEqual([]);
  });

  it('el reporte conserva los cortes con su diferencia', () => {
    const r = ordenarReporteDeCaja({
      cortes: [{ id: 's1', nombre: 'Caja 1', diferenciaCentavos: -5000 }],
    });
    expect(r.cortes[0]?.diferenciaCentavos).toBe(-5000);
  });
});

describe('las llaves de cache', () => {
  it('cambian con cada filtro, o dos busquedas verian lo mismo', () => {
    const a = llaveDeMovimientos('n', 's', { clase: 'venta' }, 1, 10);
    const b = llaveDeMovimientos('n', 's', { clase: 'retiro' }, 1, 10);
    expect(a).not.toBe(b);
  });

  it('y separan una caja de otra', () => {
    expect(llaveDeMovimientos('n', 's1', {}, 1, 10))
      .not.toBe(llaveDeMovimientos('n', 's2', {}, 1, 10));
  });
});

describe('lo que se refresca al mover la caja', () => {
  it('incluye VENTAS, porque una caja cerrada bloquea el cobro en efectivo', () => {
    // Sin esto, el punto de venta seguiria creyendo que puede cobrar y el
    // rechazo llegaria con el cliente enfrente.
    expect(LO_QUE_TOCA_LA_CAJA).toContain('ventas');
    expect(LO_QUE_TOCA_LA_CAJA).toContain('caja');
    expect(LO_QUE_TOCA_LA_CAJA).toContain('inicio');
  });
});

describe('como se dicen las cosas', () => {
  it('las seis clases y los cuatro metodos tienen palabra', () => {
    for (const c of CLASES_DE_MOVIMIENTO) expect(COMO_SE_DICE_LA_CLASE[c]).toBeTruthy();
    for (const m of METODOS_DE_CAJA) expect(COMO_SE_DICE_EL_METODO_DE_CAJA[m]).toBeTruthy();
  });

  it('una venta cancelada NO se dice igual que un retiro', () => {
    expect(COMO_SE_DICE_LA_CLASE['cancelacion']).not.toBe(COMO_SE_DICE_LA_CLASE['retiro']);
  });
});
