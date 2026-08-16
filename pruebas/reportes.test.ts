/**
 * LA CAPA DE DATOS DE REPORTES.
 *
 * Lo que se prueba aqui no es que la aritmetica salga bien —esa la hace la
 * base—, sino que el navegador NO INVENTE nada cuando al servidor le falta
 * algo. Un reporte a medias tiene que salir en ceros de verdad, no reventar la
 * pantalla ni rellenar huecos con numeros que nadie calculo.
 */

import { describe, expect, it } from 'vitest';
import {
  SIN_FILTROS,
  llaveDelReporte,
  llaveDeReportesGuardados,
  ordenarReporte,
  LO_QUE_TOCA_UN_REPORTE,
} from '../src/datos/reportes.js';

describe('ordenar lo que contesta el servidor', () => {
  it('una respuesta vacía sale en ceros, no revienta', () => {
    // Pasa de verdad: la funcion existe pero el centro todavia no tiene ni una
    // venta. Si esto tirara la pantalla, el primer dia de uso el modulo estaria
    // roto justo para quien lo abre por primera vez.
    const r = ordenarReporte(null);
    expect(r.metricas.ingresos).toBe(0);
    expect(r.serie).toEqual([]);
    expect(r.hayComparacion).toBe(false);
    expect(r.ventas.porMetodo).toEqual([]);
    expect(r.caja.cortes).toEqual([]);
  });

  it('lo que puede no existir llega como null y NO como cero', () => {
    /**
     * ES LA REGLA DEL MODULO. "$0 de ticket promedio" afirma que se cobro cero
     * por venta; "—" dice que no hubo ventas con las que sacar un promedio. Los
     * dos se ven parecidos y solo uno es cierto.
     */
    const r = ordenarReporte({ ventas: {}, finanzas: {}, gastos: {} });
    expect(r.ventas.ticket).toBeNull();
    expect(r.ventas.maxima).toBeNull();
    expect(r.finanzas.margen).toBeNull();
    expect(r.gastos.promedio).toBeNull();
    // Y lo que SIEMPRE tiene respuesta sigue siendo un numero.
    expect(r.ventas.cobradas).toBe(0);
  });

  it('las fechas llegan en el formato del producto', () => {
    const r = ordenarReporte({
      periodo: { desde: '2026-08-01', hasta: '2026-08-31', dias: 31, paso: 'dia' },
    });
    expect(r.periodo.desde).toBe('01/08/2026');
    expect(r.periodo.hasta).toBe('31/08/2026');
  });

  it('un paso que no es "mes" se trata como día', () => {
    // Un valor raro de la base no puede dejar la grafica sin rotulos: se cae del
    // lado seguro, que es el que sirve para los rangos cortos.
    expect(ordenarReporte({ periodo: { paso: 'trimestre' } }).periodo.paso).toBe('dia');
    expect(ordenarReporte({ periodo: { paso: 'mes' } }).periodo.paso).toBe('mes');
  });

  it('un cupo ausente es null: no se le inventa una ocupación al curso', () => {
    const r = ordenarReporte({
      cursos: { ranking: [{ id: 'a', nombre: 'Curso', cantidad: 2, ingresos: 100, inscritos: 4 }] },
    });
    expect(r.cursos.ranking[0]?.cupo).toBeNull();
  });
});

describe('la llave de cache', () => {
  it('lleva los filtros', () => {
    /**
     * SIN LOS FILTROS EN LA LLAVE, cambiar un filtro devolveria el reporte
     * anterior desde la cache: los mismos numeros con otro filtro puesto, sin
     * error y sin aviso. Es el fallo mas caro posible en un modulo de analisis,
     * porque se ve exactamente igual que la verdad.
     */
    const base = llaveDelReporte('n1', '01/08/2026', '31/08/2026', SIN_FILTROS);
    const conTipo = llaveDelReporte('n1', '01/08/2026', '31/08/2026', {
      ...SIN_FILTROS, tipo: 'servicio',
    });
    const conMetodo = llaveDelReporte('n1', '01/08/2026', '31/08/2026', {
      ...SIN_FILTROS, metodo: 'efectivo',
    });
    expect(base).not.toBe(conTipo);
    expect(base).not.toBe(conMetodo);
    expect(conTipo).not.toBe(conMetodo);
  });

  it('separa centros y periodos', () => {
    expect(llaveDelReporte('n1', '01/08/2026', '31/08/2026', SIN_FILTROS))
      .not.toBe(llaveDelReporte('n2', '01/08/2026', '31/08/2026', SIN_FILTROS));
    expect(llaveDelReporte('n1', '01/08/2026', '31/08/2026', SIN_FILTROS))
      .not.toBe(llaveDelReporte('n1', '01/07/2026', '31/07/2026', SIN_FILTROS));
  });

  it('los guardados cuelgan del mismo prefijo que invalida la operación', () => {
    // Si no colgaran de "reportes", guardar uno no refrescaria la lista y la
    // persona guardaria dos veces creyendo que el primero no se guardo.
    expect(llaveDeReportesGuardados('n1').startsWith('reportes')).toBe(true);
    expect(LO_QUE_TOCA_UN_REPORTE).toContain('reportes');
  });

  it('toda operación refresca también el tablero de Inicio', () => {
    // Lo exige la guardia 11 y tiene razon en no dejar decidir caso por caso.
    expect(LO_QUE_TOCA_UN_REPORTE).toContain('inicio');
  });
});
