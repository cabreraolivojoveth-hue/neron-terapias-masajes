/**
 * EL INDICE DE CONFIGURACION — las catorce tarjetas y lo que abre cada una.
 *
 * ESTA EN SU PROPIO ARCHIVO Y NO DENTRO DE LA PANTALLA, por la misma razon que
 * `src/modulos/registro.ts` esta fuera del marco: de aqui salen a la vez la
 * rejilla que se pinta, el permiso que respeta cada tarjeta y el titulo que se
 * ve al abrirla. Una segunda lista en otro archivo se desincroniza, y el
 * sintoma seria una tarjeta que dice una cosa y abre otra.
 *
 * CADA SECCION RESPETA SU CAPACIDAD, y no porque aqui se esconda el boton: eso
 * es cortesia. Lo que de verdad decide es la base — quien no tiene
 * `verAuditoria` recibe una bitacora vacia aunque escriba la direccion a mano,
 * porque la politica de la tabla no le entrega ni una fila.
 *
 * DOS SECCIONES NO TIENEN TARJETA, y es a proposito: `plan` y `bitacora` se
 * abren desde el costado, que es donde el diseño las pone —"Ver detalles de mi
 * plan" y "Ver toda la actividad"—. Existen aqui igual para que su titulo y su
 * permiso vivan en la misma lista que los demas.
 */

import type { NombreDeIcono } from '../ui/iconos.js';

/** Los tres grupos del diseño, en su orden. */
export const GRUPOS_DE_CONFIGURACION = [
  { id: 'general', etiqueta: 'Configuración general' },
  { id: 'personalizacion', etiqueta: 'Personalización' },
  { id: 'sistema', etiqueta: 'Sistema y seguridad' },
] as const;

export type GrupoDeConfiguracion = (typeof GRUPOS_DE_CONFIGURACION)[number]['id'];

/**
 * El tono del cuadrito del icono.
 *
 * SON LOS CINCO DE `marca.ts` Y NO CATORCE. El diseño pinta cada tarjeta de un
 * color distinto, y catorce colores nuevos habrian sido catorce colores sin
 * prueba de contraste — que es justo lo que la guardia 3 impide y lo que le
 * paso al primer verde del producto, que se cayo en 4.06:1. Los cinco tonos de
 * categoria ya pasaron esa prueba en los dos temas, asi que se reparten entre
 * las tarjetas: separan igual de bien y ninguno se ve mal con el sol encima.
 */
export type TonoDeSeccion = 'citas' | 'ventas' | 'productos' | 'cursos' | 'visitas';

export interface SeccionDeConfiguracion {
  readonly id: string;
  readonly titulo: string;
  /** La linea de abajo. Es la del diseño, palabra por palabra. */
  readonly descripcion: string;
  readonly icono: NombreDeIcono;
  readonly tono: TonoDeSeccion;
  readonly grupo: GrupoDeConfiguracion | null;
  /**
   * Que capacidad hace falta. `null` = la ve cualquier miembro.
   *
   * ES SOLO PARA LA REJILLA. Lo que de verdad se puede hacer lo deciden las
   * reglas de la base y las funciones que comprueban el permiso antes de
   * escribir. Esconder la tarjeta es cortesia, no seguridad.
   */
  readonly capacidad: string | null;
}

export const SECCIONES: readonly SeccionDeConfiguracion[] = [
  /* ---- Configuración general ------------------------------------- */
  {
    id: 'centro',
    titulo: 'Información del centro',
    descripcion: 'Edita los datos de tu centro, logo, dirección, teléfono y más.',
    icono: 'casa',
    tono: 'citas',
    grupo: 'general',
    capacidad: 'gestionarConfiguracion',
  },
  {
    id: 'equipo',
    titulo: 'Usuarios y permisos',
    descripcion: 'Gestiona los usuarios del sistema y sus permisos de acceso.',
    icono: 'personas',
    tono: 'ventas',
    grupo: 'general',
    capacidad: 'gestionarUsuarios',
  },
  {
    id: 'dinero',
    titulo: 'Impuestos y monedas',
    descripcion: 'Configura impuestos, moneda principal y decimales.',
    icono: 'moneda',
    tono: 'cursos',
    grupo: 'general',
    capacidad: 'gestionarConfiguracion',
  },
  {
    id: 'pagos',
    titulo: 'Métodos de pago',
    descripcion: 'Administra los métodos de pago aceptados en tu centro.',
    icono: 'cajon',
    tono: 'productos',
    grupo: 'general',
    capacidad: 'gestionarConfiguracion',
  },
  {
    id: 'facturacion',
    titulo: 'Facturación',
    descripcion: 'Configura la facturación, datos fiscales y plantillas.',
    icono: 'recibo',
    tono: 'visitas',
    grupo: 'general',
    capacidad: 'gestionarConfiguracion',
  },
  {
    id: 'notificaciones',
    titulo: 'Notificaciones',
    descripcion: 'Personaliza las notificaciones por correo, SMS y sistema.',
    icono: 'campana',
    tono: 'citas',
    grupo: 'general',
    capacidad: null,
  },

  /* ---- Personalización -------------------------------------------- */
  {
    id: 'apariencia',
    titulo: 'Apariencia',
    descripcion: 'Personaliza los colores, tema y apariencia del sistema.',
    icono: 'imagen',
    tono: 'visitas',
    grupo: 'personalizacion',
    capacidad: 'gestionarConfiguracion',
  },
  {
    id: 'plantillas',
    titulo: 'Plantillas y documentos',
    descripcion: 'Administra plantillas de comprobantes y documentos.',
    icono: 'nota',
    tono: 'cursos',
    grupo: 'personalizacion',
    capacidad: 'gestionarConfiguracion',
  },
  {
    id: 'categorias',
    titulo: 'Etiquetas y categorías',
    descripcion: 'Gestiona las categorías, etiquetas y clasificaciones.',
    icono: 'cuadricula',
    tono: 'productos',
    grupo: 'personalizacion',
    capacidad: null,
  },
  {
    id: 'campos',
    titulo: 'Campos personalizados',
    descripcion: 'Crea y administra campos personalizados.',
    icono: 'renglones',
    tono: 'ventas',
    grupo: 'personalizacion',
    capacidad: 'gestionarConfiguracion',
  },

  /* ---- Sistema y seguridad ---------------------------------------- */
  {
    /**
     * SEGURIDAD LA VE TODO EL MUNDO, y no es un descuido.
     *
     * Aqui vive la verificacion en dos pasos y el cambio de contraseña, que son
     * de la CUENTA de cada quien y no del centro. Pedir `gestionarConfiguracion`
     * para llegar dejaria a media plantilla sin poder cambiar su propia
     * contraseña, que es lo contrario de lo que hace una pantalla de seguridad.
     */
    id: 'seguridad',
    titulo: 'Seguridad',
    descripcion: 'Cambia contraseñas, sesiones activas y autenticación.',
    icono: 'escudo',
    tono: 'cursos',
    grupo: 'sistema',
    capacidad: null,
  },
  {
    id: 'respaldos',
    titulo: 'Respaldos',
    descripcion: 'Administra respaldos automáticos y restauraciones.',
    icono: 'nube',
    tono: 'citas',
    grupo: 'sistema',
    capacidad: 'exportarDatos',
  },
  {
    id: 'integraciones',
    titulo: 'Integraciones',
    descripcion: 'Conecta tu sistema con otras plataformas y servicios.',
    icono: 'bloques',
    tono: 'ventas',
    grupo: 'sistema',
    capacidad: 'gestionarConfiguracion',
  },
  {
    id: 'avanzada',
    titulo: 'Configuración avanzada',
    descripcion: 'Ajustes técnicos, límite de datos y funciones avanzadas.',
    icono: 'engrane',
    tono: 'productos',
    grupo: 'sistema',
    capacidad: 'gestionarConfiguracion',
  },

  /* ---- Las dos que se abren desde el costado ---------------------- */
  {
    id: 'plan',
    titulo: 'Plan y licencia',
    descripcion: 'Qué plan tiene el centro, hasta cuándo y qué pasa al vencer.',
    icono: 'estrella',
    tono: 'cursos',
    grupo: null,
    capacidad: 'verFacturacion',
  },
  {
    id: 'bitacora',
    titulo: 'Bitácora',
    descripcion: 'Quién hizo qué y cuándo. Solo se lee.',
    icono: 'renglones',
    tono: 'visitas',
    grupo: null,
    capacidad: 'verAuditoria',
  },
];

export function seccionPorId(id: string): SeccionDeConfiguracion | null {
  return SECCIONES.find((s) => s.id === id) ?? null;
}

/**
 * Las tarjetas de un grupo que ESTA persona puede abrir.
 *
 * Se filtra por permiso y no se pinta apagada: una tarjeta gris que no se
 * puede tocar solo sirve para que alguien pregunte que le falta, y la respuesta
 * —"un permiso que no controlas"— no le sirve de nada.
 */
export function seccionesDelGrupo(
  grupo: GrupoDeConfiguracion,
  permisos: Readonly<Record<string, boolean>>,
): SeccionDeConfiguracion[] {
  return SECCIONES.filter(
    (s) => s.grupo === grupo && (s.capacidad === null || permisos[s.capacidad] === true),
  );
}

/** ¿Puede esta persona abrir esta sección? La base lo vuelve a decidir. */
export function puedeAbrir(
  seccion: SeccionDeConfiguracion,
  permisos: Readonly<Record<string, boolean>>,
): boolean {
  return seccion.capacidad === null || permisos[seccion.capacidad] === true;
}
