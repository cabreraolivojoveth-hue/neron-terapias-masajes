/**
 * @vitest-environment happy-dom
 *
 * RECORDATORIOS — lo que se puede probar sin navegador.
 *
 * La pantalla entera necesita sesion, navegacion y base de datos: eso se mira
 * con la vitrina y las capturas (`npm run capturas -- recordatorios`), que es la
 * unica herramienta del proyecto que MIRA. Aqui se prueban las decisiones que
 * viven en este archivo y que se rompen en silencio:
 *
 *   · La exportacion, donde una coma en el titulo descuadra el archivo entero.
 *   · El contador de cada pestaña, que sale del resumen y no de contar la
 *     pagina que se ve.
 */

import { describe, expect, it } from 'vitest';
import { RESUMEN_VACIO, type RecordatorioEnLista } from '../../src/datos/recordatorios.js';
import { comoCsv, contadorDe } from '../../src/recordatorios/centro-de-recordatorios.js';

const uno = (r: Partial<RecordatorioEnLista> = {}): RecordatorioEnLista => ({
  id: 'r1',
  titulo: 'Llamar al proveedor',
  detalle: null,
  notas: null,
  fecha: '16/08/2026',
  hora: '10:00',
  prioridad: 'normal',
  estado: 'pendiente',
  vencido: false,
  categoriaId: null,
  categoria: 'Créditos',
  categoriaColor: null,
  responsableId: null,
  responsable: 'Quien administra',
  entidadTipo: null,
  entidadId: null,
  entidadNombre: null,
  entidadContacto: null,
  recurrenteId: null,
  recurrencia: null,
  automatizacionId: null,
  origenTipo: null,
  anticipacionMin: null,
  notificadoEn: null,
  completadoEn: null,
  completadoPor: null,
  creadoPor: 'Quien administra',
  creadoEn: '2026-08-16T08:00:00Z',
  actualizadoEn: null,
  ...r,
});

describe('la exportacion', () => {
  it('lleva cabecera y una fila por recordatorio', () => {
    const csv = comoCsv([uno(), uno({ id: 'r2' })]);
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv.split('\n')[0]).toContain('"Titulo"');
  });

  it('una coma en el titulo NO parte la fila', () => {
    // Es el fallo clasico de exportar a mano: a partir de esa fila todas las
    // columnas quedan corridas una casilla, y nadie lo nota hasta que alguien
    // intenta usar el archivo.
    const csv = comoCsv([uno({ titulo: 'Llamar a la clienta, urgente' })]);
    const fila = csv.split('\n')[1]!;
    expect(fila).toContain('"Llamar a la clienta, urgente"');
    // Doce columnas: once separadores mas la coma de dentro del texto.
    expect(fila.split('","')).toHaveLength(12);
  });

  it('unas comillas dentro del texto se duplican', () => {
    const csv = comoCsv([uno({ titulo: 'Pedir el "descuento"' })]);
    expect(csv).toContain('"Pedir el ""descuento"""');
  });

  it('un salto de linea en la descripcion no rompe el archivo', () => {
    // Va entrecomillado, asi que el salto queda DENTRO de la celda: el archivo
    // sigue teniendo una fila de datos, no dos.
    const csv = comoCsv([uno({ detalle: 'Primero esto\ny luego lo otro' })]);
    expect(csv).toContain('"Primero esto\ny luego lo otro"');
  });

  it('el estado se escribe como se lee, no como lo guarda la base', () => {
    // "hecho" y "descartado" son los nombres internos; quien abra el archivo
    // espera "Completado" y "Cancelado".
    expect(comoCsv([uno({ estado: 'hecho' })])).toContain('"Completado"');
    expect(comoCsv([uno({ estado: 'descartado' })])).toContain('"Cancelado"');
    expect(comoCsv([uno({ estado: 'pendiente' })])).toContain('"Pendiente"');
  });

  it('lo que falta sale vacio, no como "null"', () => {
    const csv = comoCsv([uno({ categoria: null, responsable: null })]);
    expect(csv).not.toContain('null');
  });

  it('sin nada deja solo la cabecera, no un archivo roto', () => {
    expect(comoCsv([]).split('\n')).toHaveLength(1);
  });
});

describe('el contador de las pestañas', () => {
  it('sale del resumen, que cuenta contra la tabla ENTERA', () => {
    // Contar los diez renglones que se ven para escribir "10" al lado de una
    // pestaña que filtra cuarenta es la mentira mas facil de colar.
    const r = { ...RESUMEN_VACIO, pendientes: 12, hoy: 5, proximos: 8, completados: 27 };
    expect(contadorDe('pendientes', r)).toBe(12);
    expect(contadorDe('hoy', r)).toBe(5);
    expect(contadorDe('proximos', r)).toBe(8);
    expect(contadorDe('completados', r)).toBe(27);
  });

  it('"Todos" NO lleva contador', () => {
    // Seria el total de la base: un numero de cuatro cifras al lado de una
    // pestaña no informa de nada.
    expect(contadorDe('todos', { ...RESUMEN_VACIO, total: 1200 })).toBeNull();
  });

  it('sin resumen todavia no se inventa un cero', () => {
    // Un cero mientras carga se lee como "no tienes nada", que es distinto de
    // "todavia no se".
    expect(contadorDe('pendientes', null)).toBeNull();
  });

  it('un cero de verdad SI se enseña', () => {
    expect(contadorDe('hoy', RESUMEN_VACIO)).toBe(0);
  });
});
