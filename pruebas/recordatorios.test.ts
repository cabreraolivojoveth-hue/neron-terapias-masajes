/**
 * LA CAPA DE DATOS DE RECORDATORIOS.
 *
 * Lo que se vigila aqui son las DECISIONES que se toman sin base de datos: que
 * se valida antes de guardar, que llega traducido de la base y que la llave de
 * cache cambie con todo lo que cambia la respuesta.
 *
 * Que las reglas de acceso muerdan es cosa de los ataques, que corren contra una
 * base de verdad.
 */

import { describe, expect, it } from 'vitest';
import {
  AJUSTES_DE_ARRANQUE,
  ANTICIPACIONES,
  COMO_SE_DICE_EL_ESTADO,
  COMO_SE_DICE_LA_PRIORIDAD,
  ENTIDADES,
  LO_QUE_TOCA_UN_RECORDATORIO,
  MODULO_DE_LA_ENTIDAD,
  PESO_DE_LA_PRIORIDAD,
  PRIORIDADES,
  RECORDATORIO_VACIO,
  RESUMEN_VACIO,
  comoHora,
  esAntes,
  horaEnPalabras,
  llaveDeLaLista,
  llaveDelResumenDeRecordatorios,
  loQueFaltaDelRecordatorio,
  ordenarAjustes,
  ordenarPagina,
  ordenarRecordatorio,
  ordenarResumenDeRecordatorios,
  type ConsultaDeLista,
  type DatosDeRecordatorio,
} from '../src/datos/recordatorios.js';

const LLENO: DatosDeRecordatorio = {
  ...RECORDATORIO_VACIO,
  titulo: 'Llamar al proveedor',
  fecha: '20/08/2026',
};

const CONSULTA: ConsultaDeLista = {
  pestana: 'todos',
  busqueda: '',
  categoriaId: '',
  responsableId: '',
  prioridad: '',
  entidadTipo: '',
  desde: '',
  hasta: '',
  soloRecurrentes: false,
  soloAutomaticos: false,
  orden: 'urgencia',
  descendente: false,
  pagina: 1,
  porPagina: 10,
};

describe('lo que le falta a un recordatorio', () => {
  it('sin titulo no se guarda', () => {
    expect(loQueFaltaDelRecordatorio({ ...LLENO, titulo: '' })['titulo']).toBeDefined();
  });

  it('un titulo de puros espacios TAMPOCO vale', () => {
    // Es el hueco clasico de validar con `=== ''`: tres espacios pasan, y en la
    // lista queda un renglon en blanco que nadie sabe que hacia ahi.
    expect(loQueFaltaDelRecordatorio({ ...LLENO, titulo: '   ' })['titulo']).toBeDefined();
  });

  it('un titulo larguisimo se rechaza aqui y no en la base', () => {
    const largo = 'a'.repeat(200);
    expect(loQueFaltaDelRecordatorio({ ...LLENO, titulo: largo })['titulo']).toBeDefined();
  });

  it('sin fecha no se guarda', () => {
    expect(loQueFaltaDelRecordatorio({ ...LLENO, fecha: '' })['fecha']).toBeDefined();
  });

  it('lo completo pasa sin una sola queja', () => {
    expect(loQueFaltaDelRecordatorio(LLENO)).toEqual({});
  });

  it('la hora es OPCIONAL', () => {
    expect(loQueFaltaDelRecordatorio({ ...LLENO, hora: '' })['hora']).toBeUndefined();
  });

  it('pero una hora a medias se rechaza', () => {
    // Una hora ilegible acaba guardada como medianoche, y el aviso sale de
    // madrugada — justo cuando nadie lo va a leer.
    expect(loQueFaltaDelRecordatorio({ ...LLENO, hora: '9' })['hora']).toBeDefined();
    expect(loQueFaltaDelRecordatorio({ ...LLENO, hora: '14:30' })['hora']).toBeUndefined();
  });

  it('una relacion a medias se rechaza', () => {
    // Un tipo sin id deja un renglon que dice "relacionado con una cita" y no
    // puede abrir ninguna.
    const falta = loQueFaltaDelRecordatorio({ ...LLENO, entidadTipo: 'cita', entidadId: '' });
    expect(falta['entidad']).toBeDefined();
  });

  it('sin relacion ninguna no se queja', () => {
    const falta = loQueFaltaDelRecordatorio({ ...LLENO, entidadTipo: '', entidadId: '' });
    expect(falta['entidad']).toBeUndefined();
  });
});

describe('lo que le falta a una repeticion', () => {
  const REPITE: DatosDeRecordatorio = { ...LLENO, repetir: true, frecuencia: 'semanal' };

  it('un intervalo de cero no vale', () => {
    expect(loQueFaltaDelRecordatorio({ ...REPITE, intervalo: '0' })['intervalo']).toBeDefined();
  });

  it('personalizado sin dias escogidos no vale', () => {
    const falta = loQueFaltaDelRecordatorio({
      ...REPITE,
      frecuencia: 'personalizado',
      diasSemana: [],
    });
    expect(falta['diasSemana']).toBeDefined();
  });

  it('no puede terminar antes de empezar', () => {
    const falta = loQueFaltaDelRecordatorio({
      ...REPITE,
      fecha: '20/08/2026',
      fechaFin: '10/08/2026',
    });
    expect(falta['fechaFin']).toBeDefined();
  });

  it('terminar el mismo dia SI vale', () => {
    const falta = loQueFaltaDelRecordatorio({
      ...REPITE,
      fecha: '20/08/2026',
      fechaFin: '20/08/2026',
    });
    expect(falta['fechaFin']).toBeUndefined();
  });

  it('sin repetir, las reglas de la repeticion no se comprueban', () => {
    // Un recordatorio suelto con basura en los campos de repeticion no puede
    // quedarse sin guardar por eso: esos campos ni se mandan.
    const falta = loQueFaltaDelRecordatorio({ ...LLENO, intervalo: '0', diasSemana: [] });
    expect(falta).toEqual({});
  });
});

describe('comparar fechas sin pasar por Date', () => {
  it('ordena bien dentro del mismo año', () => {
    // Como texto `dd/mm/aaaa`, "02/01" seria mayor que "01/12". Se compara en
    // `aaaa-mm-dd`, que si ordena.
    expect(esAntes('01/12/2026', '02/01/2027')).toBe(true);
    expect(esAntes('02/01/2027', '01/12/2026')).toBe(false);
  });

  it('el mismo dia no es antes', () => {
    expect(esAntes('20/08/2026', '20/08/2026')).toBe(false);
  });
});

describe('la hora que llega de la base', () => {
  it('se recorta a HH:mm', () => {
    // Un `HH:mm:ss` metido en un input de hora funciona en unos navegadores y
    // en otros deja el campo vacio sin decir nada.
    expect(comoHora('09:00:00')).toBe('09:00');
  });

  it('vacia o nula es null, no cadena vacia', () => {
    expect(comoHora(null)).toBeNull();
    expect(comoHora('')).toBeNull();
  });

  it('sin hora se dice que es de todo el dia', () => {
    expect(horaEnPalabras(null)).toBe('Todo el día');
  });
});

describe('lo que llega del servidor, ordenado', () => {
  it('un renglon con huecos no revienta y cae en lo razonable', () => {
    const r = ordenarRecordatorio({ id: 'r1', titulo: 'Algo', fecha: '2026-08-20' });
    expect(r.prioridad).toBe('normal');
    expect(r.estado).toBe('pendiente');
    expect(r.vencido).toBe(false);
    expect(r.fecha).toBe('20/08/2026');
    expect(r.categoria).toBeNull();
  });

  it('"vencido" llega calculado del servidor, no se deduce aqui', () => {
    const r = ordenarRecordatorio({ id: 'r1', titulo: 'x', fecha: '2020-01-01', vencido: true });
    expect(r.vencido).toBe(true);
  });

  it('una respuesta vacia da una pagina vacia con total cero', () => {
    const p = ordenarPagina({});
    expect(p.filas).toEqual([]);
    expect(p.total).toBe(0);
    expect(p.pagina).toBe(1);
  });

  it('el promedio de horas conserva el null de la base', () => {
    // Convertirlo a cero diria "se resuelven al instante" de un centro que no
    // ha cerrado ni uno.
    expect(ordenarResumenDeRecordatorios({ horasPromedio: null }).horasPromedio).toBeNull();
    expect(ordenarResumenDeRecordatorios({ horasPromedio: 3.5 }).horasPromedio).toBe(3.5);
  });

  it('un resumen que no es objeto cae en el vacio, todo en cero', () => {
    expect(ordenarResumenDeRecordatorios(null)).toEqual(RESUMEN_VACIO);
    expect(ordenarResumenDeRecordatorios('nada')).toEqual(RESUMEN_VACIO);
  });

  it('un numero corrupto no se propaga como NaN', () => {
    // Un NaN se suma, se formatea y termina impreso en la tarjeta del dueño.
    expect(ordenarResumenDeRecordatorios({ pendientes: 'x' }).pendientes).toBe(0);
  });
});

describe('los ajustes', () => {
  it('sin fila se usan los de arranque', () => {
    expect(ordenarAjustes(null)).toEqual(AJUSTES_DE_ARRANQUE);
  });

  it('el aviso al responsable solo se apaga con un false EXPLICITO', () => {
    // Una base sin actualizar manda `undefined`, y eso no puede dejar a nadie
    // sin enterarse de lo que le asignaron.
    expect(ordenarAjustes({}).avisarAlResponsable).toBe(true);
    expect(ordenarAjustes({ avisarAlResponsable: false }).avisarAlResponsable).toBe(false);
  });

  it('el aviso del navegador arranca APAGADO', () => {
    // Pedir permiso de notificaciones sin que nadie lo pida es la forma mas
    // rapida de que alguien lo bloquee para siempre.
    expect(AJUSTES_DE_ARRANQUE.avisarEnNavegador).toBe(false);
    expect(ordenarAjustes({}).avisarEnNavegador).toBe(false);
  });
});

describe('las llaves del cache', () => {
  it('cambian con TODO lo que cambia la respuesta', () => {
    const base = llaveDeLaLista('n1', '16/08/2026', CONSULTA);
    expect(llaveDeLaLista('n1', '16/08/2026', { ...CONSULTA, pestana: 'hoy' })).not.toBe(base);
    expect(llaveDeLaLista('n1', '16/08/2026', { ...CONSULTA, busqueda: 'ho' })).not.toBe(base);
    expect(llaveDeLaLista('n1', '16/08/2026', { ...CONSULTA, pagina: 2 })).not.toBe(base);
    expect(llaveDeLaLista('n1', '16/08/2026', { ...CONSULTA, orden: 'fecha' })).not.toBe(base);
    expect(llaveDeLaLista('n1', '16/08/2026', { ...CONSULTA, descendente: true })).not.toBe(base);
  });

  it('llevan el DIA: una pestaña abierta desde ayer no puede seguir contando lo de ayer', () => {
    expect(llaveDeLaLista('n1', '17/08/2026', CONSULTA)).not.toBe(
      llaveDeLaLista('n1', '16/08/2026', CONSULTA),
    );
    expect(llaveDelResumenDeRecordatorios('n1', '17/08/2026')).not.toBe(
      llaveDelResumenDeRecordatorios('n1', '16/08/2026'),
    );
  });

  it('todas cuelgan del mismo prefijo, para poder refrescarlas de una', () => {
    expect(llaveDeLaLista('n1', '16/08/2026', CONSULTA).startsWith('recordatorios:')).toBe(true);
    expect(llaveDelResumenDeRecordatorios('n1', '16/08/2026').startsWith('recordatorios:')).toBe(true);
  });

  it('guardar algo refresca TAMBIEN el tablero de Inicio', () => {
    // Sin esto, completar un recordatorio deja la campana con el punto puesto
    // hasta que alguien recargue — y una campana que avisa de algo resuelto es
    // la que se deja de mirar.
    expect(LO_QUE_TOCA_UN_RECORDATORIO).toContain('inicio');
  });
});

describe('los vocabularios', () => {
  it('cada prioridad tiene su palabra y su peso', () => {
    for (const p of PRIORIDADES) {
      expect(COMO_SE_DICE_LA_PRIORIDAD[p]).toBeTruthy();
      expect(typeof PESO_DE_LA_PRIORIDAD[p]).toBe('number');
    }
  });

  it('lo urgente pesa MENOS que lo alto, o sea que va antes', () => {
    // Alfabeticamente "alta" va antes que "urgente": ordenar por nombre pondria
    // lo urgente debajo, que es justo al reves de lo unico que la prioridad
    // tiene que conseguir.
    expect(PESO_DE_LA_PRIORIDAD['urgente']).toBeLessThan(PESO_DE_LA_PRIORIDAD['alta']);
    expect(PESO_DE_LA_PRIORIDAD['alta']).toBeLessThan(PESO_DE_LA_PRIORIDAD['normal']);
  });

  it('los tres estados de la base se leen como los llama quien los usa', () => {
    expect(COMO_SE_DICE_EL_ESTADO['hecho']).toBe('Completado');
    expect(COMO_SE_DICE_EL_ESTADO['descartado']).toBe('Cancelado');
  });

  it('cada entidad sabe a que modulo lleva, y ninguna a uno inventado', () => {
    const MODULOS_REALES = [
      'clientes', 'agenda', 'caja', 'cursos', 'productos', 'servicios', 'gastos',
    ];
    for (const e of ENTIDADES) {
      expect(MODULOS_REALES).toContain(MODULO_DE_LA_ENTIDAD[e]);
    }
  });

  it('una venta lleva a Caja, que es donde vive Ventas desde que se unieron', () => {
    expect(MODULO_DE_LA_ENTIDAD['venta']).toBe('caja');
  });

  it('las anticipaciones son las seis que pide el diseño, en minutos', () => {
    expect(ANTICIPACIONES.map((a) => a.minutos)).toEqual([0, 5, 15, 30, 60, 1440]);
  });
});
