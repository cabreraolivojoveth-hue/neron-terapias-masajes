/**
 * EXPORTAR EL REPORTE A UN ARCHIVO.
 *
 * SE EXPORTA LO QUE SE ESTA VIENDO: el periodo, los filtros y la pestaña
 * abierta. Descargar el reporte entero cuando en pantalla hay una pestaña hace
 * que el archivo no cuadre con lo que se estaba mirando, y quien lo abre
 * despues no sabe cual de los dos es el bueno.
 *
 * EL ARCHIVO LLEVA EL PERIODO EN LA PRIMERA LINEA. Una hoja de calculo con
 * cifras y sin fechas es una hoja que dentro de un mes nadie sabe de cuando es
 * — y es exactamente lo que se acaba imprimiendo y llevando a una reunion.
 *
 * TODO VA ENTRECOMILLADO Y LAS COMILLAS SE DUPLICAN. Un nombre con una coma
 * —"Masaje, 90 min"— parte la fila en dos y el archivo entero se descuadra a
 * partir de ahi. Es el fallo clasico de exportar a mano, y ya se pago en
 * Gastos.
 */

import type { FiltrosDelReporte, Reporte } from '../datos/reportes.js';
import { nombreDeCategoria } from './dona-de-categorias.js';
import type { PestanaDelReporte } from './secciones.js';

const escapar = (v: string | number | null): string =>
  `"${String(v ?? '').replace(/"/g, '""')}"`;

const fila = (...celdas: Array<string | number | null>): string =>
  celdas.map(escapar).join(',');

/** El dinero va en PESOS con dos decimales, no en centavos: el archivo lo abre
 *  una persona en una hoja de calculo, no un programa. */
const pesos = (centavos: number | null): string =>
  centavos === null ? '' : (centavos / 100).toFixed(2);

/** Como se lee un filtro puesto. Vacio = sin filtrar, y se dice asi. */
function filtrosEnPalabras(f: FiltrosDelReporte): string {
  const puestos = [
    f.tipo ? `tipo: ${f.tipo}` : '',
    f.metodo ? `forma de pago: ${f.metodo}` : '',
    f.vendedorId ? 'quien vendió: uno en concreto' : '',
  ].filter(Boolean);
  return puestos.length === 0 ? 'sin filtros' : puestos.join(' · ');
}

export function reporteComoCsv(
  reporte: Reporte,
  pestana: PestanaDelReporte,
  filtros: FiltrosDelReporte,
): string {
  const lineas: string[] = [
    fila('Reporte', pestana),
    fila('Período', `${reporte.periodo.desde} a ${reporte.periodo.hasta}`),
    fila('Filtros', filtrosEnPalabras(filtros)),
    '',
  ];

  const seccion = (titulo: string, cabeceras: string[], filas: string[]): void => {
    lineas.push(fila(titulo));
    lineas.push(cabeceras.map(escapar).join(','));
    // UNA SECCION SIN FILAS LO DICE. Un titulo seguido de nada se lee como que
    // el archivo se corto a medias.
    lineas.push(...(filas.length > 0 ? filas : [fila('Sin registros en este período')]));
    lineas.push('');
  };

  if (pestana === 'resumen') {
    seccion('Cifras del período', ['Concepto', 'Valor'], [
      fila('Ingresos totales', pesos(reporte.finanzas.ingresos)),
      fila('Egresos totales', pesos(reporte.finanzas.egresos)),
      fila('Ganancia neta', pesos(reporte.finanzas.utilidad)),
      fila('Margen de ganancia', reporte.finanzas.margen === null
        ? 'sin ingresos con los que calcularlo'
        : `${reporte.finanzas.margen.toFixed(1)}%`),
      fila('Ventas promedio por día', pesos(reporte.finanzas.promedioDiario)),
      fila('Clientes nuevos', reporte.finanzas.clientesNuevos),
      fila('Servicios realizados', reporte.finanzas.serviciosRealizados),
      fila('Cursos vendidos', reporte.finanzas.cursosVendidos),
    ]);
    seccion('Ingresos y egresos', ['Punto', 'Ingresos', 'Egresos'],
      reporte.serie.map((p) => fila(p.punto, pesos(p.ingresos), pesos(p.egresos))));
    seccion('Ingresos por categoría', ['Categoría', 'Monto', 'Operaciones'],
      reporte.categorias.map((c) =>
        fila(nombreDeCategoria(c.clave), pesos(c.monto), c.cuantos)));
    return lineas.join('\n');
  }

  if (pestana === 'ventas') {
    seccion('Ventas', ['Concepto', 'Valor'], [
      fila('Cobradas', reporte.ventas.cobradas),
      fila('Canceladas', reporte.ventas.canceladas),
      fila('Ticket promedio', pesos(reporte.ventas.ticket)),
      fila('Venta más alta', pesos(reporte.ventas.maxima)),
      fila('Venta más baja', pesos(reporte.ventas.minima)),
    ]);
    seccion('Por forma de pago', ['Forma de pago', 'Monto', 'Cobros'],
      reporte.ventas.porMetodo.map((m) => fila(m.metodo, pesos(m.monto), m.operaciones)));
    return lineas.join('\n');
  }

  if (pestana === 'servicios') {
    seccion('Servicios más realizados', ['Servicio', 'Cantidad', 'Ingresos'],
      reporte.servicios.ranking.map((s) => fila(s.nombre, s.cantidad, pesos(s.ingresos))));
    return lineas.join('\n');
  }

  if (pestana === 'clientes') {
    seccion('Clientes', ['Concepto', 'Valor'], [
      fila('Atendidos', reporte.clientes.atendidos),
      fila('Nuevos', reporte.clientes.nuevos),
      fila('Recurrentes', reporte.clientes.recurrentes),
      fila('En el directorio', reporte.clientes.totales),
    ]);
    seccion('Quienes más gastaron', ['Cliente', 'Visitas', 'Compras', 'Gastado'],
      reporte.clientes.ranking.map((c) =>
        fila(c.nombre, c.visitas, c.compras, pesos(c.gastado))));
    return lineas.join('\n');
  }

  if (pestana === 'productos') {
    seccion('Productos más vendidos', ['Producto', 'Unidades', 'Ingresos'],
      reporte.productos.ranking.map((p) => fila(p.nombre, p.cantidad, pesos(p.ingresos))));
    return lineas.join('\n');
  }

  if (pestana === 'cursos') {
    seccion('Cursos más vendidos', ['Curso', 'Ventas', 'Inscritos', 'Cupo', 'Ingresos'],
      reporte.cursos.ranking.map((c) =>
        fila(c.nombre, c.cantidad, c.inscritos, c.cupo === null ? 'sin cupo' : c.cupo,
          pesos(c.ingresos))));
    return lineas.join('\n');
  }

  if (pestana === 'gastos') {
    seccion('Gastos por categoría', ['Categoría', 'Monto', 'Gastos'],
      reporte.gastos.categorias.map((c) => fila(c.categoria, pesos(c.monto), c.cuantos)));
    return lineas.join('\n');
  }

  seccion('Caja', ['Concepto', 'Valor'], [
    fila('Cobros que entraron', pesos(reporte.caja.ventas)),
    fila('Ingresos capturados a mano', pesos(reporte.caja.ingresosManuales)),
    fila('Retiros', pesos(reporte.caja.retiros)),
    fila('Gastos pagados del cajón', pesos(reporte.caja.gastosDeCaja)),
    fila('Movimientos', reporte.caja.movimientos),
    fila('Descuadre', pesos(reporte.caja.descuadre)),
  ]);
  seccion('Cortes firmados', ['Caja', 'Cerrada', 'Esperado', 'Contado', 'Diferencia'],
    reporte.caja.cortes.map((s) =>
      fila(s.nombre, s.cerradaEn, pesos(s.esperado), pesos(s.contado), pesos(s.diferencia))));
  return lineas.join('\n');
}

/** `dd/mm/aaaa` → `aaaa-mm-dd`, para que los archivos se ordenen solos. */
function paraElNombre(f: string): string {
  const [d, m, a] = f.split('/');
  return d && m && a ? `${a}-${m}-${d}` : 'sin-fecha';
}

export function nombreDelArchivo(reporte: Reporte, pestana: PestanaDelReporte): string {
  return `reporte-${pestana}-${paraElNombre(reporte.periodo.desde)}-a-${paraElNombre(reporte.periodo.hasta)}.csv`;
}

/**
 * La descarga.
 *
 * EL ARCHIVO ARRANCA CON LA MARCA DE ORDEN DE BYTES. Sin ella, Excel en
 * Windows abre el CSV en la codificacion del sistema y "Aromaterapia" sale
 * "AromaterapÃ­a". No es cosmetico: quien lo recibe cree que el dato esta mal
 * guardado.
 */
export function descargarCsv(nombre: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
