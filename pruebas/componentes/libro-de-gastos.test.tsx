/**
 * @vitest-environment happy-dom
 *
 * GASTOS — lo que se puede probar sin navegador.
 *
 * La exportacion es lo que mas se rompe en silencio: un concepto con una coma
 * parte la fila y el archivo entero se descuadra a partir de ahi, sin que nada
 * falle. Por eso tiene prueba propia.
 */

import { describe, expect, it } from 'vitest';
import type { GastoEnLista } from '../../src/datos/gastos.js';
import { comoCsv } from '../../src/gastos/libro-de-gastos.js';

function gasto(sobre: Partial<GastoEnLista> = {}): GastoEnLista {
  return {
    id: 'g1', fecha: '11/08/2026', concepto: 'Renta', detalle: null,
    montoCentavos: 100000, metodo: 'efectivo', efectivoCentavos: 100000,
    metodoResto: null, categoriaId: null, categoria: 'Local', categoriaColor: null,
    proveedorId: null, proveedor: null, referencia: null, notas: null,
    recurrenteId: null, frecuencia: 'unico', usuario: 'Quien administra',
    creadoEn: '2026-08-11T10:00:00Z', anulado: false, anuladoMotivo: null,
    sustituyeA: null, ...sobre,
  };
}

describe('la exportacion', () => {
  it('lleva cabecera y una fila por gasto', () => {
    const csv = comoCsv([gasto(), gasto({ id: 'g2' })]);
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv.split('\n')[0]).toContain('"Concepto"');
  });

  it('una coma en el concepto NO parte la fila', () => {
    // Es el fallo clasico de exportar a mano: a partir de esa fila, todas las
    // columnas quedan corridas una casilla y nadie lo nota hasta que el
    // contador se queja.
    const csv = comoCsv([gasto({ concepto: 'Renta, agosto' })]);
    const fila = csv.split('\n')[1]!;
    expect(fila).toContain('"Renta, agosto"');
    // Diez comas separadoras entre once columnas, mas la de dentro del texto.
    expect(fila.split('","')).toHaveLength(11);
  });

  it('unas comillas dentro del texto se duplican', () => {
    const csv = comoCsv([gasto({ concepto: 'Renta "del local"' })]);
    expect(csv).toContain('"Renta ""del local"""');
  });

  it('el monto va en pesos con dos decimales, no en centavos', () => {
    // En centavos, quien abra el archivo lee 100000 y entiende cien mil pesos.
    const csv = comoCsv([gasto({ montoCentavos: 100000 })]);
    expect(csv).toContain('"1000.00"');
  });

  it('el efectivo va aparte del monto', () => {
    // Es lo que deja cuadrar el archivo contra el corte de caja.
    const csv = comoCsv([
      gasto({ montoCentavos: 100000, metodo: 'mixto', efectivoCentavos: 30000 }),
    ]);
    const fila = csv.split('\n')[1]!;
    expect(fila).toContain('"1000.00"');
    expect(fila).toContain('"300.00"');
  });

  it('sin gastos deja solo la cabecera, no un archivo roto', () => {
    expect(comoCsv([]).split('\n')).toHaveLength(1);
  });

  it('lo anulado se marca, no se esconde', () => {
    // Si se exporta, se dice en que estado esta: un anulado que parece
    // registrado descuadra cualquier suma que haga quien lo reciba.
    expect(comoCsv([gasto({ anulado: true })])).toContain('"Anulado"');
  });
});
