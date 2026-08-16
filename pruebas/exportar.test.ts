/**
 * EXPORTAR EL REPORTE.
 *
 * El fallo clasico de exportar a mano —un nombre con una coma que parte la fila
 * en dos y descuadra el archivo entero— es invisible hasta que alguien abre la
 * hoja de calculo, y para entonces ya se mando por correo. Aqui se comprueba el
 * escapado y que el archivo diga de que periodo es.
 */

import { describe, expect, it } from 'vitest';
import type { Fecha } from '@neron/base/utils';
import { ordenarReporte, SIN_FILTROS, type Reporte } from '../src/datos/reportes.js';
import { nombreDelArchivo, reporteComoCsv } from '../src/reportes/exportar.js';

/** Un reporte con lo minimo, para no repetir veinte campos en cada prueba. */
function reporteCon(parte: Record<string, unknown>): Reporte {
  return ordenarReporte({
    periodo: { desde: '2026-08-01', hasta: '2026-08-31', dias: 31, paso: 'dia' },
    ...parte,
  });
}

describe('la cabecera del archivo', () => {
  it('dice la sección, el periodo y los filtros', () => {
    // Una hoja con cifras y sin fechas es una hoja que dentro de un mes nadie
    // sabe de cuando es — y es la que se acaba imprimiendo y llevando a una
    // reunion.
    const csv = reporteComoCsv(reporteCon({}), 'resumen', SIN_FILTROS);
    expect(csv).toContain('"Período","01/08/2026 a 31/08/2026"');
    expect(csv).toContain('"Filtros","sin filtros"');
  });

  it('los filtros puestos se escriben con todas sus letras', () => {
    const csv = reporteComoCsv(reporteCon({}), 'ventas', {
      tipo: 'servicio', metodo: 'efectivo', vendedorId: '',
    });
    expect(csv).toContain('tipo: servicio');
    expect(csv).toContain('forma de pago: efectivo');
  });
});

describe('el escapado', () => {
  it('una coma en un nombre NO parte la fila', () => {
    const csv = reporteComoCsv(
      reporteCon({
        servicios: {
          ranking: [{ id: 'a', nombre: 'Masaje, 90 minutos', cantidad: 3, ingresos: 90000 }],
        },
      }),
      'servicios',
      SIN_FILTROS,
    );
    const fila = csv.split('\n').find((l) => l.includes('Masaje'));
    expect(fila).toBe('"Masaje, 90 minutos","3","900.00"');
  });

  it('unas comillas en un nombre se duplican', () => {
    const csv = reporteComoCsv(
      reporteCon({
        servicios: {
          ranking: [{ id: 'a', nombre: 'Sesión "profunda"', cantidad: 1, ingresos: 5000 }],
        },
      }),
      'servicios',
      SIN_FILTROS,
    );
    expect(csv).toContain('"Sesión ""profunda"""');
  });
});

describe('lo que va en cada celda', () => {
  it('el dinero va en pesos, no en centavos', () => {
    // Lo abre una persona en una hoja de calculo, no un programa. "9600000" en
    // una columna de dinero se lee mal antes de que a nadie se le ocurra
    // dividir.
    const csv = reporteComoCsv(
      reporteCon({ finanzas: { ingresos: 2485000 } }),
      'resumen',
      SIN_FILTROS,
    );
    expect(csv).toContain('"Ingresos totales","24850.00"');
  });

  it('un margen sin ingresos lo DICE en vez de escribir 0%', () => {
    const csv = reporteComoCsv(reporteCon({ finanzas: {} }), 'resumen', SIN_FILTROS);
    expect(csv).toContain('sin ingresos con los que calcularlo');
  });

  it('un curso sin cupo lo dice en vez de inventarle uno', () => {
    const csv = reporteComoCsv(
      reporteCon({
        cursos: {
          ranking: [{ id: 'a', nombre: 'Reiki', cantidad: 2, ingresos: 1000, inscritos: 5 }],
        },
      }),
      'cursos',
      SIN_FILTROS,
    );
    expect(csv).toContain('"sin cupo"');
  });

  it('una sección vacía lo dice: un título seguido de nada parece un corte', () => {
    const csv = reporteComoCsv(reporteCon({}), 'productos', SIN_FILTROS);
    expect(csv).toContain('"Sin registros en este período"');
  });
});

describe('el nombre del archivo', () => {
  it('lleva la sección y las fechas al revés, para que se ordenen solos', () => {
    expect(nombreDelArchivo(reporteCon({}), 'ventas'))
      .toBe('reporte-ventas-2026-08-01-a-2026-08-31.csv');
  });

  it('sin periodo no arma un nombre con basura', () => {
    const vacio = ordenarReporte({});
    expect(nombreDelArchivo(vacio, 'resumen'))
      .toBe('reporte-resumen-sin-fecha-a-sin-fecha.csv');
  });
});

/** Sirve para recordar que las fechas del producto son `dd/mm/aaaa`. */
const _formato: Fecha = '01/08/2026' as Fecha;
void _formato;
