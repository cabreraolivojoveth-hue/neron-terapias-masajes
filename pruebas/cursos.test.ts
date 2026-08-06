/**
 * EL ACCESO A DATOS DE CURSOS.
 *
 * Lo que se prueba aqui es lo que no se ve: que "sin cupo" no se convierta en
 * cero —que significaria justo lo contrario—, que dividir entre cero no acabe
 * impreso como "NaN%", y que la lista de invalidacion incluya a Agenda y a
 * Clientes, porque las sesiones salen en una y las inscripciones en la otra.
 */
import { describe, expect, it } from 'vitest';
import {
  estaLleno,
  llaveDeCursos,
  llaveDeCursosDelCliente,
  llaveDeLaFichaDelCurso,
  llaveDelResumenDeCursos,
  lugaresLibres,
  ocupacionDe,
  ordenarCurso,
  ordenarResumenDeCursos,
  LO_QUE_TOCA_UN_CURSO,
  RESUMEN_DE_CURSOS_VACIO,
} from '../src/datos/cursos.js';

describe('el cupo: "sin limite" NO es cero', () => {
  it('sin cupo no hay lugares que contar, y eso es null — no cero', () => {
    // Cero diria que no cabe nadie, que es exactamente lo contrario.
    expect(lugaresLibres(null, 5)).toBeNull();
    expect(estaLleno(null, 9999)).toBe(false);
    expect(ocupacionDe(null, 5)).toBeNull();
  });

  it('con cupo se restan los ocupados', () => {
    expect(lugaresLibres(12, 8)).toBe(4);
    expect(lugaresLibres(12, 12)).toBe(0);
  });

  it('NUNCA baja de cero', () => {
    // "-2 lugares" no le sirve a nadie en un mostrador.
    expect(lugaresLibres(10, 13)).toBe(0);
  });

  it('lleno es a partir de que se alcanza el cupo', () => {
    expect(estaLleno(12, 11)).toBe(false);
    expect(estaLleno(12, 12)).toBe(true);
    expect(estaLleno(12, 13)).toBe(true);
  });
});

describe('la ocupacion', () => {
  it('un cupo en cero NO produce NaN ni Infinity', () => {
    expect(ocupacionDe(0, 3)).toBeNull();
    expect(ocupacionDe(-4, 3)).toBeNull();
  });

  it('con datos redondea a entero', () => {
    expect(ocupacionDe(12, 8)).toBe(67);
    expect(ocupacionDe(12, 12)).toBe(100);
    expect(ocupacionDe(12, 0)).toBe(0);
  });
});

describe('el resumen que contesta el servidor', () => {
  it('sin respuesta se queda en ceros, con la ocupacion en null', () => {
    expect(ordenarResumenDeCursos(null)).toEqual(RESUMEN_DE_CURSOS_VACIO);
    expect(ordenarResumenDeCursos('cualquier cosa').ocupacionPromedio).toBeNull();
  });

  it('CONSERVA el null de la ocupacion: "0%" seria mentira', () => {
    // No es que los cursos esten vacios: es que ninguno tiene cupo del que
    // sacar un porcentaje.
    const r = ordenarResumenDeCursos({
      total: 2, activos: 2, proximos: 1, alumnos: 5, ocupacionPromedio: null,
    });
    expect(r.ocupacionPromedio).toBeNull();
    expect(r.alumnos).toBe(5);
  });

  it('un cero de verdad SI es cero', () => {
    const r = ordenarResumenDeCursos({
      total: 3, activos: 0, proximos: 0, alumnos: 0, ocupacionPromedio: 0,
    });
    expect(r.activos).toBe(0);
    expect(r.ocupacionPromedio).toBe(0);
  });
});

describe('un renglon de la lista', () => {
  it('un campo que no llega NO se inventa', () => {
    const c = ordenarCurso({ id: 'k1', nombre: 'Uno' });
    expect(c.subtitulo).toBeNull();
    expect(c.categoria).toBeNull();
    expect(c.instructor).toBeNull();
    expect(c.imagenUrl).toBeNull();
    expect(c.fechaInicio).toBeNull();
    // El cupo que no llega es "sin limite", no cero.
    expect(c.cupo).toBeNull();
    expect(Number.isFinite(c.precioCentavos)).toBe(true);
  });

  it('un cupo de verdad se conserva', () => {
    expect(ordenarCurso({ id: 'k1', nombre: 'Uno', cupo: 12 }).cupo).toBe(12);
  });

  it('una modalidad rara cae en presencial, no en undefined', () => {
    expect(ordenarCurso({ id: 'k1', nombre: 'U', modalidad: 'lo_que_sea' }).modalidad).toBe(
      'presencial',
    );
    expect(ordenarCurso({ id: 'k1', nombre: 'U', modalidad: 'en_linea' }).modalidad).toBe(
      'en_linea',
    );
  });

  it('un estado de vida raro cae en proximo, no rompe la pantalla', () => {
    expect(ordenarCurso({ id: 'k1', nombre: 'U', vida: 'inventado' }).vida).toBe('proximo');
    expect(ordenarCurso({ id: 'k1', nombre: 'U', vida: 'finalizado' }).vida).toBe('finalizado');
  });

  it('la fecha llega de la base en ISO y sale en dd/mm/aaaa', () => {
    const c = ordenarCurso({ id: 'k1', nombre: 'U', fechaInicio: '2026-07-15' });
    expect(c.fechaInicio).toBe('15/07/2026');
  });
});

describe('las llaves de la memoria', () => {
  it('cambian con cada filtro: dos filtros distintos NO comparten resultado', () => {
    const a = llaveDeCursos('n1', { busqueda: 'reiki' }, 1, 10);
    const b = llaveDeCursos('n1', { busqueda: 'aroma' }, 1, 10);
    const c = llaveDeCursos('n1', { busqueda: 'reiki' }, 2, 10);
    const d = llaveDeCursos('n1', { busqueda: 'reiki', conLugares: true }, 1, 10);
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it('la misma consulta produce la MISMA llave: un solo viaje', () => {
    expect(llaveDeCursos('n1', { vida: 'activo' }, 1, 10)).toBe(
      llaveDeCursos('n1', { vida: 'activo' }, 1, 10),
    );
  });

  it('dos centros NUNCA comparten llave', () => {
    expect(llaveDeCursos('n1', {}, 1, 10)).not.toBe(llaveDeCursos('n2', {}, 1, 10));
  });

  it('todas empiezan por su prefijo, que es lo que las invalida en bloque', () => {
    expect(llaveDeCursos('n1', {}, 1, 10).startsWith('cursos')).toBe(true);
    expect(llaveDelResumenDeCursos('n1').startsWith('cursos')).toBe(true);
    expect(llaveDeLaFichaDelCurso('k1').startsWith('cursos')).toBe(true);
    expect(llaveDeCursosDelCliente('c1').startsWith('cursos')).toBe(true);
  });
});

describe('lo que se refresca al tocar un curso', () => {
  it('incluye AGENDA: las sesiones salen ahi', () => {
    // Sin esto, mover una sesion la deja con la fecha vieja en la agenda hasta
    // que alguien recargue la pagina.
    expect(LO_QUE_TOCA_UN_CURSO).toContain('citas');
  });

  it('incluye CLIENTES: el expediente de cada inscrito enseña sus cursos', () => {
    expect(LO_QUE_TOCA_UN_CURSO).toContain('clientes');
  });

  it('incluye cursos y categorias', () => {
    expect(LO_QUE_TOCA_UN_CURSO).toContain('cursos');
    expect(LO_QUE_TOCA_UN_CURSO).toContain('categorias');
  });
});
