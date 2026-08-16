/**
 * EL INDICE DE CONFIGURACION.
 *
 * Lo que se vigila aqui es lo que la pantalla no puede enseñar sola: que las
 * catorce tarjetas del diseño esten completas y en su orden, que cada una
 * respete su capacidad, y que las dos que se abren desde el costado existan en
 * la misma lista que las demas.
 */
import { describe, expect, it } from 'vitest';
import {
  GRUPOS_DE_CONFIGURACION,
  SECCIONES,
  puedeAbrir,
  seccionPorId,
  seccionesDelGrupo,
} from '../src/configuracion/secciones-de-configuracion.js';

const TODO: Readonly<Record<string, boolean>> = {
  gestionarUsuarios: true, gestionarConfiguracion: true, verAuditoria: true,
  exportarDatos: true, restaurarRespaldo: true, zonaDePeligro: true, verFacturacion: true,
};

describe('las tarjetas del diseño', () => {
  it('estan las catorce, en los tres grupos y en su orden', () => {
    /*
     * La captura de referencia es la especificacion: seis tarjetas en
     * "Configuración general", cuatro en "Personalización" y cuatro en
     * "Sistema y seguridad". Si alguna se cae, la pantalla deja de parecerse a
     * la foto y eso no lo mira ninguna otra prueba.
     */
    expect(seccionesDelGrupo('general', TODO).map((s) => s.titulo)).toEqual([
      'Información del centro',
      'Usuarios y permisos',
      'Impuestos y monedas',
      'Métodos de pago',
      'Facturación',
      'Notificaciones',
    ]);
    expect(seccionesDelGrupo('personalizacion', TODO).map((s) => s.titulo)).toEqual([
      'Apariencia',
      'Plantillas y documentos',
      'Etiquetas y categorías',
      'Campos personalizados',
    ]);
    expect(seccionesDelGrupo('sistema', TODO).map((s) => s.titulo)).toEqual([
      'Seguridad',
      'Respaldos',
      'Integraciones',
      'Configuración avanzada',
    ]);
  });

  it('los tres grupos van en el orden del diseño', () => {
    expect(GRUPOS_DE_CONFIGURACION.map((g) => g.etiqueta)).toEqual([
      'Configuración general',
      'Personalización',
      'Sistema y seguridad',
    ]);
  });

  it('cada una lleva su descripcion, que es la del diseño', () => {
    for (const s of SECCIONES) {
      expect(s.descripcion.length, s.id).toBeGreaterThan(15);
      expect(s.titulo.length, s.id).toBeGreaterThan(0);
    }
  });

  it('ningun id se repite', () => {
    // Dos secciones con el mismo id harian que la segunda no se pudiera abrir
    // nunca, sin fallar ni avisar.
    const ids = SECCIONES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('los permisos de cada seccion', () => {
  it('SEGURIDAD la ve todo el mundo, y no es un descuido', () => {
    /*
     * Aqui vive la verificacion en dos pasos y el cambio de contraseña, que son
     * de la CUENTA de cada quien. Pedir un permiso para llegar dejaria a media
     * plantilla sin poder cambiar su propia contraseña.
     */
    expect(seccionPorId('seguridad')!.capacidad).toBeNull();
    expect(puedeAbrir(seccionPorId('seguridad')!, {})).toBe(true);
  });

  it('la bitacora pide verAuditoria y el equipo pide gestionarUsuarios', () => {
    expect(seccionPorId('bitacora')!.capacidad).toBe('verAuditoria');
    expect(seccionPorId('equipo')!.capacidad).toBe('gestionarUsuarios');
    expect(puedeAbrir(seccionPorId('bitacora')!, {})).toBe(false);
  });

  it('quien no tiene ningun permiso administrativo ve MUY poco', () => {
    /*
     * No cero: seguridad, notificaciones y categorias no piden nada. Es lo que
     * hace que el modulo sirva para cualquier miembro sin enseñarle de mas.
     */
    const suyas = SECCIONES.filter((s) => s.grupo !== null && puedeAbrir(s, {}));
    expect(suyas.map((s) => s.id).sort()).toEqual(['categorias', 'notificaciones', 'seguridad']);
  });

  it('un grupo se puede quedar SIN tarjetas, y entonces desaparece', () => {
    // Es la misma regla del menu lateral: un apartado vacio solo hace que
    // alguien se pregunte que le falta.
    expect(seccionesDelGrupo('general', {}).map((s) => s.id)).toEqual(['notificaciones']);
  });
});

describe('las dos que se abren desde el costado', () => {
  it('existen en la misma lista, sin grupo', () => {
    /*
     * "Ver detalles de mi plan" y "Ver toda la actividad" no son tarjetas de la
     * rejilla, pero su titulo y su permiso tienen que vivir donde los demas: en
     * dos listas se desincronizan, y el sintoma es un boton que abre algo que
     * dice otra cosa.
     */
    expect(seccionPorId('plan')!.grupo).toBeNull();
    expect(seccionPorId('bitacora')!.grupo).toBeNull();
    expect(seccionPorId('plan')!.capacidad).toBe('verFacturacion');
  });
});

describe('buscar una seccion', () => {
  it('una que no existe devuelve null, no una inventada', () => {
    // Es lo que permite que `?ver=cualquiercosa` en la direccion no abra nada
    // raro en vez de reventar.
    expect(seccionPorId('no-existe')).toBeNull();
  });
});

describe('los tonos de los cuadritos', () => {
  it('son los CINCO de la marca, no catorce colores nuevos', () => {
    /*
     * Catorce colores nuevos habrian sido catorce colores sin prueba de
     * contraste — que es lo que la guardia 3 impide, y lo que le paso al primer
     * verde del producto, que se cayo en 4.06:1 y hubo que bajarlo.
     */
    const tonos = new Set(SECCIONES.map((s) => s.tono));
    expect([...tonos].sort()).toEqual(['citas', 'cursos', 'productos', 'ventas', 'visitas']);
  });
});
