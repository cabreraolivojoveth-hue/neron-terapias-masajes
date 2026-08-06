/**
 * EL ACCESO A DATOS DEL CATALOGO.
 *
 * Lo que se prueba aqui es lo que NO se ve: que un resumen a medias no se
 * convierta en ceros que mienten, que dividir entre cero no acabe impreso como
 * "NaN% del total", y que la lista de invalidacion incluya a Agenda —porque
 * apagar un servicio tiene que quitarlo de su formulario sin recargar.
 */
import { describe, expect, it } from 'vitest';
import {
  ordenarResumenDeServicios,
  ordenarServicio,
  porcentajeDe,
  llaveDeCategorias,
  llaveDeLaFicha,
  llaveDelResumenDeServicios,
  llaveDeServicios,
  LO_QUE_TOCA_UN_SERVICIO,
  RESUMEN_DE_SERVICIOS_VACIO,
} from '../src/datos/servicios.js';

describe('el porcentaje que se enseña en las tarjetas', () => {
  it('SIN servicios devuelve null, no NaN', () => {
    // Dividir entre cero da NaN y termina impreso como "NaN% del total" en la
    // pantalla de la dueña. `null` deja que quien pinta diga otra cosa.
    expect(porcentajeDe(0, 0)).toBeNull();
    expect(porcentajeDe(5, 0)).toBeNull();
    expect(porcentajeDe(5, -3)).toBeNull();
  });

  it('con datos redondea a entero', () => {
    expect(porcentajeDe(1, 3)).toBe(33);
    expect(porcentajeDe(2, 3)).toBe(67);
    expect(porcentajeDe(12, 12)).toBe(100);
  });

  it('un valor que no es numero tampoco produce NaN', () => {
    expect(porcentajeDe(Number.NaN, 10)).toBeNull();
    expect(porcentajeDe(3, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('el resumen que contesta el servidor', () => {
  it('sin respuesta se queda en ceros, con la duracion en null', () => {
    expect(ordenarResumenDeServicios(null)).toEqual(RESUMEN_DE_SERVICIOS_VACIO);
    expect(ordenarResumenDeServicios(undefined).total).toBe(0);
    expect(ordenarResumenDeServicios('cualquier cosa').duracionPromedio).toBeNull();
  });

  it('CONSERVA el null de la duracion promedio: "0 min" seria mentira', () => {
    // No es que las sesiones duren cero, es que no hay sesiones que promediar.
    const r = ordenarResumenDeServicios({ total: 0, activos: 0, inactivos: 0, duracionPromedio: null });
    expect(r.duracionPromedio).toBeNull();
  });

  it('un cero de verdad SI es cero', () => {
    const r = ordenarResumenDeServicios({ total: 4, activos: 4, inactivos: 0, duracionPromedio: 60 });
    expect(r.inactivos).toBe(0);
    expect(r.duracionPromedio).toBe(60);
  });
});

describe('un renglon de la lista', () => {
  it('un campo que no llega NO se inventa', () => {
    const s = ordenarServicio({ id: 's1', nombre: 'Uno' });
    expect(s.descripcion).toBeNull();
    expect(s.categoria).toBeNull();
    expect(s.color).toBeNull();
    expect(s.activo).toBe(false);
    // Un precio que no llego es cero, nunca NaN: NaN se propaga a los totales.
    expect(Number.isFinite(s.precioCentavos)).toBe(true);
  });

  it('la cadena vacia cuenta como "no hay", no como texto', () => {
    const s = ordenarServicio({ id: 's1', nombre: 'Uno', categoria: '', color: '' });
    expect(s.categoria).toBeNull();
    expect(s.color).toBeNull();
  });

  it('el precio de hoy viene aparte del de lista', () => {
    // La promocion la resuelve la base en `app.precio_efectivo`. Si cada
    // pantalla la resolviera, el dia que cambie la regla una cobraria de mas.
    const s = ordenarServicio({
      id: 's1', nombre: 'Uno', precioCentavos: 90000, precioHoyCentavos: 70000, enPromocion: true,
    });
    expect(s.precioCentavos).toBe(90000);
    expect(s.precioHoyCentavos).toBe(70000);
    expect(s.enPromocion).toBe(true);
  });
});

describe('las llaves de la memoria', () => {
  it('cambian con cada filtro: dos filtros distintos NO comparten resultado', () => {
    const a = llaveDeServicios('n1', { busqueda: 'masaje' }, 1, 10);
    const b = llaveDeServicios('n1', { busqueda: 'facial' }, 1, 10);
    const c = llaveDeServicios('n1', { busqueda: 'masaje' }, 2, 10);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('la misma consulta produce la MISMA llave: un solo viaje', () => {
    expect(llaveDeServicios('n1', { estado: 'activo' }, 1, 10)).toBe(
      llaveDeServicios('n1', { estado: 'activo' }, 1, 10),
    );
  });

  it('todas empiezan por su prefijo, que es lo que las invalida en bloque', () => {
    expect(llaveDeServicios('n1', {}, 1, 10).startsWith('servicios')).toBe(true);
    expect(llaveDelResumenDeServicios('n1').startsWith('servicios')).toBe(true);
    expect(llaveDeLaFicha('s1').startsWith('servicios')).toBe(true);
    expect(llaveDeCategorias('n1', 'servicio').startsWith('categorias')).toBe(true);
  });

  it('dos centros NUNCA comparten llave', () => {
    expect(llaveDeServicios('n1', {}, 1, 10)).not.toBe(llaveDeServicios('n2', {}, 1, 10));
    expect(llaveDeCategorias('n1', 'servicio')).not.toBe(llaveDeCategorias('n2', 'servicio'));
  });

  it('servicios y cursos no comparten categorias', () => {
    expect(llaveDeCategorias('n1', 'servicio')).not.toBe(llaveDeCategorias('n1', 'curso'));
  });
});

describe('lo que se refresca al tocar el catalogo', () => {
  it('incluye a AGENDA: apagar un servicio lo quita de su formulario', () => {
    // Sin esto, un servicio apagado sigue ofreciendose al agendar hasta que
    // alguien recargue la pagina — y se agenda algo que ya no se da.
    expect(LO_QUE_TOCA_UN_SERVICIO).toContain('citas');
    expect(LO_QUE_TOCA_UN_SERVICIO).toContain('servicios');
    expect(LO_QUE_TOCA_UN_SERVICIO).toContain('categorias');
  });

  it('incluye a INICIO: el tablero cuenta servicios', () => {
    expect(LO_QUE_TOCA_UN_SERVICIO.length).toBeGreaterThan(3);
  });
});
