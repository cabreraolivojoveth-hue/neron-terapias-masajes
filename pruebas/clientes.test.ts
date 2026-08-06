/**
 * La capa de datos de Clientes.
 *
 * Lo que se prueba aqui es lo que se puede probar sin base: normalizar antes
 * de guardar, ordenar lo que contesta el servidor, y que las llaves de cache
 * cambien con todo lo que cambia el resultado.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({}),
  clienteParaLaBase: () => ({}),
}));

const {
  LO_QUE_TOCA_UN_CLIENTE,
  RESUMEN_DE_CLIENTES_VACIO,
  etiquetaDeEstadoDeCliente,
  llaveDeClientes,
  llaveDelExpediente,
  normalizar,
  ordenarFila,
  ordenarResumenDeClientes,
} = await import('../src/datos/clientes.js');

const ficha = (c: Record<string, string> = {}) => ({
  nombre: '', telefono: '', correo: '', fechaNacimiento: '', notas: '', profesionalId: '',
  ...c,
});

describe('normalizar antes de guardar', () => {
  it('junta los espacios del nombre', () => {
    // "  Ana  María " y "Ana María" son la misma persona. Guardadas distinto,
    // la busqueda encuentra una y no la otra, y alguien la da de alta dos veces.
    expect(normalizar(ficha({ nombre: '  Ana   María ' })).nombre).toBe('Ana María');
  });

  it('el correo va en minusculas', () => {
    // Los servidores de correo no distinguen mayusculas; un `=` en una
    // consulta si. Sin bajarlo, el mismo correo entra dos veces.
    expect(normalizar(ficha({ correo: '  Persona@Correo.MX ' })).correo).toBe('persona@correo.mx');
  });

  it('un campo vacio se guarda como NULL, no como cadena vacia', () => {
    // Si no, "sin telefono" y "telefono en blanco" serian dos cosas distintas
    // en la base y ninguna consulta las trataria igual.
    const f = normalizar(ficha({ nombre: 'Alguien' }));
    expect(f.telefono).toBeNull();
    expect(f.correo).toBeNull();
    expect(f.fecha_nacimiento).toBeNull();
    expect(f.notas).toBeNull();
    expect(f.profesional_id).toBeNull();
  });

  it('las notas conservan sus saltos de linea', () => {
    // Aplanarlas convertiria una lista en un parrafo.
    const f = normalizar(ficha({ notas: '  una\ndos  ' }));
    expect(f.notas).toBe('una\ndos');
  });

  it('la fecha de nacimiento se traduce al formato de la base', () => {
    expect(normalizar(ficha({ fechaNacimiento: '10/07/1990' })).fecha_nacimiento).toBe('1990-07-10');
  });
});

describe('ordenar lo que contesta el servidor', () => {
  it('un resumen vacio no inventa ni un numero', () => {
    expect(RESUMEN_DE_CLIENTES_VACIO.total).toBe(0);
    expect(RESUMEN_DE_CLIENTES_VACIO.totalAdeudos).toBe(0);
    expect(RESUMEN_DE_CLIENTES_VACIO.cumpleanos).toEqual([]);
  });

  it('una respuesta rara cae al vacio en vez de reventar la pantalla', () => {
    expect(ordenarResumenDeClientes(null)).toEqual(RESUMEN_DE_CLIENTES_VACIO);
    expect(ordenarResumenDeClientes('lo que sea')).toEqual(RESUMEN_DE_CLIENTES_VACIO);
  });

  it('un numero que no es numero se vuelve cero, nunca NaN', () => {
    // Un NaN se propaga sin reventar y termina impreso en la tarjeta.
    const r = ordenarResumenDeClientes({ total: 'ocho', totalAdeudos: undefined });
    expect(r.total).toBe(0);
    expect(Number.isNaN(r.totalAdeudos)).toBe(false);
  });

  it('los cumpleaños llegan con la fecha en el formato de la aplicacion', () => {
    const r = ordenarResumenDeClientes({
      cumpleanos: [{ id: 'c1', nombre: 'Alguien', fecha: '2026-08-20', enDias: 14 }],
    });
    expect(r.cumpleanos[0]?.fecha).toBe('20/08/2026');
    expect(r.cumpleanos[0]?.enDias).toBe(14);
  });

  it('un cliente sin visitas llega con cero y sin ultima visita', () => {
    const f = ordenarFila({ id: 'c1', nombre: 'Alguien', estado: 'inactivo' });
    expect(f.visitas).toBe(0);
    expect(f.ultimaVisita).toBeNull();
    // Cadena vacia y null no son lo mismo: null es "no hay", y es lo que la
    // pantalla necesita para decir "Sin datos de contacto".
    expect(f.telefono).toBeNull();
  });
});

describe('las llaves de cache', () => {
  it('cambian con la PAGINA', () => {
    // Sin esto, pasar de pagina mostraria lo que ya estaba guardado y se veria
    // como si el boton no hiciera nada.
    expect(llaveDeClientes('t_c', {}, 1, 10)).not.toBe(llaveDeClientes('t_c', {}, 2, 10));
  });

  it('cambian con cada FILTRO', () => {
    const sin = llaveDeClientes('t_c', {}, 1, 10);
    expect(llaveDeClientes('t_c', { busqueda: 'ana' }, 1, 10)).not.toBe(sin);
    expect(llaveDeClientes('t_c', { estado: 'activo' }, 1, 10)).not.toBe(sin);
    expect(llaveDeClientes('t_c', { profesionalId: 'p1' }, 1, 10)).not.toBe(sin);
    expect(llaveDeClientes('t_c', { visitasMin: 6 }, 1, 10)).not.toBe(sin);
  });

  it('cambian con el CENTRO', () => {
    expect(llaveDeClientes('t_a', {}, 1, 10)).not.toBe(llaveDeClientes('t_b', {}, 1, 10));
  });

  it('empiezan con "clientes" para poder invalidarlas por prefijo', () => {
    expect(llaveDeClientes('t_c', {}, 1, 10).startsWith('clientes')).toBe(true);
    expect(llaveDelExpediente('c1').startsWith('clientes')).toBe(true);
  });
});

describe('lo que hay que refrescar al tocar un cliente', () => {
  it('incluye la lista Y el tablero', () => {
    /**
     * Es lo que hace que dar de alta a alguien lo deje disponible enseguida en
     * la agenda y en el buscador global. La guardia de fronteras exige que
     * toda operacion lo declare, justo porque es lo primero que se olvida.
     */
    expect(LO_QUE_TOCA_UN_CLIENTE).toContain('clientes');
    expect(LO_QUE_TOCA_UN_CLIENTE).toContain('inicio');
  });
});

describe('los estados del cliente', () => {
  it('se leen con palabras, no con claves', () => {
    expect(etiquetaDeEstadoDeCliente('activo')).toBe('Activo');
    expect(etiquetaDeEstadoDeCliente('archivado')).toBe('Archivado');
  });

  it('uno desconocido se muestra tal cual en vez de reventar', () => {
    expect(etiquetaDeEstadoDeCliente('lo_que_sea')).toBe('lo_que_sea');
  });
});
