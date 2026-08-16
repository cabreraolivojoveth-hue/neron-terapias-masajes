/**
 * EL ACCESO A DATOS DE CONFIGURACION.
 *
 * CONFIGURACION NO ES DUEÑA DE CASI NADA, y esa es la decision del modulo. Las
 * siete tablas de la base ya existen y son las suyas —`negocio`, `estado`,
 * `membresia`, `rol`, `licencia`, `auditoria`, `diario`—: aqui se ADMINISTRAN,
 * no se duplican. Una segunda tabla de usuarios o una segunda copia de los
 * horarios acabaria diciendo algo distinto de la primera, y nadie sabria cual
 * creer.
 *
 * Y TAMPOCO ABSORBE LA CONFIGURACION DE LOS DEMAS MODULOS. Los avisos de
 * Recordatorios viven en `recordatorio_ajustes`, los canales y las plantillas
 * en Mensajes, y las categorias se administran con `AdministrarCategorias`
 * desde cada catalogo. Configuracion ENLAZA a todo eso. Dos pantallas que
 * guardan lo mismo acaban diciendo cosas distintas.
 *
 * DONDE VIVE CADA COSA, que es la division del bloque 0:
 *
 *   · el NOMBRE del centro          → `negocio.nombre`
 *   · lo demas de la ficha          → `estado.data.centro`, que es poca y se
 *                                     lee entera — para eso sigue existiendo
 *                                     el bloque JSON
 *   · quien entra y con que rol     → `membresia` y `rol`, que el navegador NO
 *                                     puede escribir: se pasa por funciones que
 *                                     comprueban `gestionarUsuarios` primero
 *   · el rastro                     → `auditoria`, que solo se agrega
 *   · el plan                       → `licencia`, que escribe la plataforma
 *
 * LOS VALORES POR OMISION VIVEN AQUI Y EN NINGUN OTRO SITIO. La base devuelve
 * el bloque tal cual, con sus huecos; rellenarlos tambien alli dejaria dos
 * verdades sobre a que hora abre un centro que nunca configuro nada.
 */

import type { Fecha, Hora24 } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, reventar } from './fechas-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Como se llama el centro mientras nadie lo ha cambiado               */
/* ------------------------------------------------------------------ */

/**
 * EL NOMBRE Y EL LEMA DE ARRANQUE — se mudaron de `marca.ts` a proposito.
 *
 * Vivian alli con un comentario que decia "hasta que Configuracion lo
 * administre". Ya lo administra: el nombre sale de `negocio.nombre` y el lema
 * del bloque de configuracion, y los dos se resuelven AL LEER como manda la
 * regla de las conexiones. `marca.ts` se quedo solo con los colores, que es lo
 * unico que de verdad cambia entre un producto NERON y otro.
 *
 * Estos dos siguen existiendo porque hay tres pantallas que se pintan SIN
 * SESION —la de entrar, la de "falta configurar la conexion" y la de error de
 * arranque— y en ninguna hay a quien preguntarle como se llama el centro.
 */
export const NOMBRE_POR_OMISION = 'Centro Holístico';
export const LEMA_POR_OMISION = 'Bienestar & Terapias';

/**
 * LA VERSION DEL SISTEMA, que la pantalla enseña arriba a la derecha.
 *
 * Se escribe aqui y hay una prueba que la compara contra `package.json`: sin
 * ella, el numero se queda viejo el dia que alguien publique sin acordarse, y
 * una version que miente es peor que no enseñar ninguna — es lo primero que se
 * pregunta cuando algo falla y no cuadra con lo que hay publicado.
 */
export const VERSION_DEL_SISTEMA = '0.1.0';

/* ------------------------------------------------------------------ */
/* Los vocabularios                                                    */
/* ------------------------------------------------------------------ */

/**
 * LAS SIETE CAPACIDADES DE PLATAFORMA.
 *
 * Son las que define la base y las que ordenan este modulo entero: cada
 * seccion respeta la suya. Se repiten aqui —y no se importan del paquete—
 * porque ademas hay que decir QUE DESBLOQUEA cada una, y eso es del producto:
 * "ver la bitacora" no significa nada hasta que existe una bitacora que mirar.
 */
export const CAPACIDADES_DE_PLATAFORMA = [
  'gestionarUsuarios',
  'gestionarConfiguracion',
  'verAuditoria',
  'exportarDatos',
  'restaurarRespaldo',
  'zonaDePeligro',
  'verFacturacion',
] as const;

export type CapacidadDePlataforma = (typeof CAPACIDADES_DE_PLATAFORMA)[number];

/** Que desbloquea cada capacidad, dicho con lo que de verdad se puede hacer. */
export const QUE_DESBLOQUEA: Readonly<Record<string, string>> = {
  gestionarUsuarios: 'Invitar gente, cambiar roles y dar de baja.',
  gestionarConfiguracion: 'Cambiar los datos del centro, los horarios y las preferencias.',
  verAuditoria: 'Leer la bitácora: quién hizo qué y cuándo.',
  exportarDatos: 'Descargar la información del centro en archivos.',
  restaurarRespaldo: 'Volver a meter datos desde un respaldo.',
  zonaDePeligro: 'Las acciones que no se pueden deshacer.',
  verFacturacion: 'Ver el plan contratado y lo que se paga por él.',
  gestionarClientes: 'Dar de alta pacientes y editar su ficha.',
  gestionarAgenda: 'Agendar, mover y cancelar citas.',
  gestionarCatalogo: 'Administrar servicios y cursos.',
  gestionarInventario: 'Administrar productos, existencias y proveedores.',
  cobrar: 'Cobrar en el mostrador.',
  verFinanzas: 'Ver el dinero: caja, gastos y reportes.',
  verExpediente: 'Leer las notas clínicas de un paciente.',
  verCostos: 'Ver el costo y el margen de lo que se vende.',
  gestionarMensajes: 'Leer y contestar las conversaciones con pacientes.',
};

/**
 * LOS DIAS, EN NUMERO ISO: 1 es lunes y 7 domingo.
 *
 * Se guardan como numero y no como texto porque el dia de una fecha se calcula,
 * y comparar "Miércoles" contra lo que devuelva el navegador —que depende del
 * idioma del sistema— es como un horario deja de aplicarse en la computadora de
 * alguien sin que nadie entienda por que.
 */
export const DIAS_DE_LA_SEMANA: readonly { readonly dia: number; readonly nombre: string }[] = [
  { dia: 1, nombre: 'Lunes' },
  { dia: 2, nombre: 'Martes' },
  { dia: 3, nombre: 'Miércoles' },
  { dia: 4, nombre: 'Jueves' },
  { dia: 5, nombre: 'Viernes' },
  { dia: 6, nombre: 'Sábado' },
  { dia: 7, nombre: 'Domingo' },
];

export interface HorarioDelDia {
  readonly dia: number;
  readonly cerrado: boolean;
  readonly abre: Hora24;
  readonly cierra: Hora24;
}

/**
 * LOS METODOS DE PAGO QUE EL SISTEMA SABE COBRAR.
 *
 * La lista es del producto, no del centro: `pago.metodo` los tiene escritos en
 * una restriccion de la base. Lo que el centro decide es CUALES acepta, y eso
 * es lo que se guarda. Dejar que se inventaran metodos nuevos aqui produciria
 * cobros que la base rechaza con un error de restriccion que no dice nada.
 */
export const METODOS_DE_PAGO: readonly { readonly clave: string; readonly etiqueta: string }[] = [
  { clave: 'efectivo', etiqueta: 'Efectivo' },
  { clave: 'tarjeta', etiqueta: 'Tarjeta' },
  { clave: 'transferencia', etiqueta: 'Transferencia' },
  { clave: 'otro', etiqueta: 'Otro' },
];

export type TemaDelCentro = 'sistema' | 'claro' | 'oscuro';

export const TEMAS: readonly { readonly clave: TemaDelCentro; readonly etiqueta: string }[] = [
  { clave: 'sistema', etiqueta: 'El del sistema' },
  { clave: 'claro', etiqueta: 'Claro' },
  { clave: 'oscuro', etiqueta: 'Oscuro' },
];

/** Lo que se puede bajar, y como se llama en la pantalla. */
export const LO_QUE_SE_EXPORTA: readonly { readonly clave: string; readonly etiqueta: string }[] = [
  { clave: 'clientes', etiqueta: 'Pacientes' },
  { clave: 'servicios', etiqueta: 'Servicios' },
  { clave: 'cursos', etiqueta: 'Cursos' },
  { clave: 'productos', etiqueta: 'Productos' },
  { clave: 'citas', etiqueta: 'Citas' },
  { clave: 'ventas', etiqueta: 'Ventas' },
  { clave: 'gastos', etiqueta: 'Gastos' },
  { clave: 'recordatorios', etiqueta: 'Recordatorios' },
];

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

export interface DatosDelCentro {
  readonly nombre: string;
  readonly lema: string;
  /** Una o dos líneas de qué es el centro. Sale en documentos y comprobantes. */
  readonly descripcion: string;
  /**
   * La dirección del logotipo del centro.
   *
   * SE GUARDA LA DIRECCIÓN, NO EL ARCHIVO. Meter la imagen dentro del bloque de
   * configuración —como texto en base64— lo haría crecer cientos de kilobytes,
   * y ese bloque se lee ENTERO en cada arranque de cada pantalla del sistema.
   * El archivo vive en el almacenamiento; aquí solo su dirección.
   */
  readonly logoUrl: string;
  readonly telefono: string;
  readonly correo: string;
  readonly sitio: string;
  readonly direccion: string;
  readonly ciudad: string;
  readonly estado: string;
  readonly pais: string;
  readonly codigoPostal: string;
  readonly facebook: string;
  readonly instagram: string;
  readonly whatsapp: string;
  readonly zonaHoraria: string;
  readonly moneda: string;
  readonly decimales: number;
  readonly impuestoNombre: string;
  /** En porcentaje: 16 son dieciséis por ciento. */
  readonly impuestoTasa: number;
  readonly impuestoIncluido: boolean;
  readonly metodosDePago: readonly string[];
  readonly rfc: string;
  readonly razonSocial: string;
  readonly regimenFiscal: string;
  readonly direccionFiscal: string;
  readonly pieDeComprobante: string;
  readonly tema: TemaDelCentro;
  readonly menosMovimiento: boolean;
  readonly horarios: readonly HorarioDelDia[];
}

export interface ConfiguracionDelCentro {
  readonly datos: DatosDelCentro;
  readonly creadoEn: string | null;
  readonly miembros: number;
}

export interface MiembroDelCentro {
  readonly id: string;
  readonly usuarioId: string;
  readonly correo: string;
  readonly nombre: string;
  readonly rol: string;
  readonly rolEtiqueta: string;
  readonly activo: boolean;
  readonly eliminado: boolean;
  readonly permisos: Readonly<Record<string, boolean>> | null;
  /** La base lo resuelve: comparar contra la cuenta desde aquí sería otra copia. */
  readonly soyYo: boolean;
  readonly creadoEn: string;
}

export interface InvitacionPendiente {
  readonly id: string;
  readonly correo: string;
  readonly nombre: string;
  readonly rol: string;
  readonly rolEtiqueta: string;
  readonly creadaEn: string;
}

export interface EquipoDelCentro {
  readonly miembros: readonly MiembroDelCentro[];
  readonly invitaciones: readonly InvitacionPendiente[];
  readonly duenosActivos: number;
}

export interface RolDelCentro {
  readonly id: string;
  readonly etiqueta: string;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly activo: boolean;
  readonly cuantos: number;
}

export interface AnotacionDeLaBitacora {
  readonly id: string;
  readonly ocurridoEn: string;
  readonly usuarioId: string | null;
  readonly usuario: string;
  readonly rol: string;
  readonly modulo: string;
  readonly accion: string;
  readonly detalle: string | null;
  readonly entidad: string | null;
  readonly antes: Readonly<Record<string, unknown>> | null;
  readonly despues: Readonly<Record<string, unknown>> | null;
  readonly motivo: string | null;
}

export interface PaginaDeLaBitacora {
  readonly filas: readonly AnotacionDeLaBitacora[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly modulos: readonly string[];
  readonly gente: readonly { readonly id: string; readonly nombre: string }[];
}

export interface ActividadReciente {
  readonly id: string;
  readonly ocurridoEn: string;
  readonly usuario: string;
  readonly modulo: string;
  readonly accion: string;
  readonly entidad: string | null;
}

export interface LicenciaDelCentro {
  /**
   * `false` cuando no hay renglón de licencia.
   *
   * NO es lo mismo que "vencida": la base falla ABIERTO a propósito —sin
   * licencia se entra normal— y la pantalla tiene que poder decir "este centro
   * no tiene licencia administrada" en vez de enseñar un plan inventado.
   */
  readonly administrada: boolean;
  readonly plan: string | null;
  readonly estado: string | null;
  readonly expiraEn: string | null;
  readonly actualizadaEn: string | null;
  readonly permiteGuardar: boolean;
}

export interface Exportacion {
  readonly que: string;
  readonly total: number;
  readonly entregadas: number;
  readonly tope: number;
  readonly filas: readonly Readonly<Record<string, unknown>>[];
}

/* ------------------------------------------------------------------ */
/* Los valores de arranque                                             */
/* ------------------------------------------------------------------ */

/**
 * EL HORARIO DE UN CENTRO QUE NUNCA CONFIGURO NADA.
 *
 * Abierto de lunes a sábado y cerrado el domingo. No es un dato inventado del
 * diseño: es el valor de arranque que hace que Agenda tenga contra que avisar
 * desde el primer dia, y se puede cambiar entero desde la pantalla. Sin
 * ninguno, la comprobacion de "fuera de horario" no diria nunca nada — que es
 * lo mismo que no tenerla.
 */
export const HORARIO_DE_ARRANQUE: readonly HorarioDelDia[] = DIAS_DE_LA_SEMANA.map((d) => ({
  dia: d.dia,
  cerrado: d.dia === 7,
  abre: '09:00',
  cierra: '19:00',
}));

export const CENTRO_VACIO: DatosDelCentro = {
  nombre: NOMBRE_POR_OMISION,
  lema: LEMA_POR_OMISION,
  descripcion: '',
  logoUrl: '',
  telefono: '',
  correo: '',
  sitio: '',
  direccion: '',
  ciudad: '',
  estado: '',
  pais: '',
  codigoPostal: '',
  facebook: '',
  instagram: '',
  whatsapp: '',
  zonaHoraria: 'America/Mexico_City',
  moneda: 'MXN',
  decimales: 2,
  impuestoNombre: 'IVA',
  impuestoTasa: 0,
  impuestoIncluido: true,
  metodosDePago: ['efectivo', 'tarjeta', 'transferencia'],
  rfc: '',
  razonSocial: '',
  regimenFiscal: '',
  direccionFiscal: '',
  pieDeComprobante: '',
  tema: 'sistema',
  menosMovimiento: false,
  horarios: HORARIO_DE_ARRANQUE,
};

export const CONFIGURACION_VACIA: ConfiguracionDelCentro = {
  datos: CENTRO_VACIO,
  creadoEn: null,
  miembros: 0,
};

/* ------------------------------------------------------------------ */
/* Las validaciones — aqui para decirlo bien, y en la base para que sea
   verdad                                                              */
/* ------------------------------------------------------------------ */

/**
 * Que le falta a la ficha del centro para poder guardarse.
 *
 * DEVUELVE UN ERROR POR CAMPO. "Revisa los datos" obliga a mirarlos todos
 * buscando cual esta mal.
 *
 * ESTO NO ES LA DEFENSA: `guardar_configuracion_del_centro` vuelve a
 * comprobarlo en el servidor y ademas exige el permiso. Aqui se valida para
 * decirlo a tiempo; alli para que sea verdad aunque alguien mande la peticion
 * a mano.
 */
export function loQueFaltaDelCentro(d: DatosDelCentro): Readonly<Record<string, string>> {
  const falta: Record<string, string> = {};

  if (d.nombre.trim() === '') falta['nombre'] = 'El centro tiene que llamarse de alguna forma.';
  else if (d.nombre.trim().length > 80) falta['nombre'] = 'El nombre no puede pasar de 80 letras.';

  if (d.correo.trim() !== '' && !d.correo.includes('@')) {
    falta['correo'] = 'Ese correo no parece un correo.';
  }

  if (d.moneda.trim().length !== 3) {
    // Tres letras es el codigo de moneda de siempre (MXN, USD, EUR). Si aqui
    // entra cualquier cosa, los importes se imprimen con una etiqueta que no
    // significa nada en ningun sitio.
    falta['moneda'] = 'La moneda va con su código de tres letras, como MXN.';
  }

  if (!Number.isFinite(d.decimales) || d.decimales < 0 || d.decimales > 4) {
    falta['decimales'] = 'Los decimales van de 0 a 4.';
  }

  if (!Number.isFinite(d.impuestoTasa) || d.impuestoTasa < 0 || d.impuestoTasa > 100) {
    falta['impuestoTasa'] = 'El impuesto va de 0 a 100 por ciento.';
  }

  if (d.metodosDePago.length === 0) {
    // Sin ningun metodo no se puede cobrar nada, y el sintoma seria un
    // mostrador donde el boton de cobrar no ofrece con que.
    falta['metodosDePago'] = 'Deja por lo menos un método de pago encendido.';
  }

  for (const h of d.horarios) {
    if (h.cerrado) continue;
    if (!/^\d{2}:\d{2}$/.test(h.abre) || !/^\d{2}:\d{2}$/.test(h.cierra)) {
      falta['horarios'] = 'Las horas van como 09:00.';
      break;
    }
    if (h.cierra <= h.abre) {
      // Se comparan como texto a proposito: `HH:mm` ordena bien, y pasarlas
      // por Date es como una hora se mueve segun la zona de quien mire.
      falta['horarios'] = 'Un día no puede cerrar antes de abrir.';
      break;
    }
  }

  return falta;
}

/** Que le falta a una invitación. El correo es lo único que no se puede adivinar. */
export function loQueFaltaDeLaInvitacion(
  correo: string,
  nombre: string,
  rol: string,
): Readonly<Record<string, string>> {
  const falta: Record<string, string> = {};
  if (correo.trim() === '') falta['correo'] = 'Escribe el correo con el que va a entrar.';
  else if (!correo.includes('@')) falta['correo'] = 'Ese correo no parece un correo.';
  if (nombre.trim() === '') falta['nombre'] = 'Escribe cómo se llama.';
  if (rol.trim() === '') falta['rol'] = 'Escoge qué va a poder hacer.';
  return falta;
}

/* ------------------------------------------------------------------ */
/* La traduccion de lo que llega                                       */
/* ------------------------------------------------------------------ */

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const opcional = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);
const numero = (v: unknown, siNo: number): number => {
  const n = Number(v);
  // NaN NUNCA sale de aqui: se propaga sin reventar y termina impreso como
  // "NaN" en la pantalla de alguien.
  return Number.isFinite(n) ? n : siNo;
};

/** Una hora de la base o del formulario, siempre como `HH:mm`. */
function comoHora(v: unknown, siNo: Hora24): Hora24 {
  const t = texto(v);
  return /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : siNo;
}

/**
 * Los siete dias, SIEMPRE los siete y en orden.
 *
 * Lo guardado se superpone a lo de arranque, dia por dia. Es lo mismo que hace
 * el motor de roles de la base y por la misma razon: si mañana se guardara solo
 * el lunes, los otros seis tienen que seguir existiendo — una lista a medias
 * dejaria la pantalla pintando cuatro dias y el resto desaparecido.
 */
export function ordenarHorarios(crudo: unknown): HorarioDelDia[] {
  const guardados = new Map<number, Record<string, unknown>>();
  if (Array.isArray(crudo)) {
    for (const x of crudo as Record<string, unknown>[]) {
      const dia = numero(x['dia'], 0);
      if (dia >= 1 && dia <= 7) guardados.set(dia, x);
    }
  }
  return HORARIO_DE_ARRANQUE.map((base) => {
    const g = guardados.get(base.dia);
    if (!g) return base;
    return {
      dia: base.dia,
      cerrado: g['cerrado'] === true,
      abre: comoHora(g['abre'], base.abre),
      cierra: comoHora(g['cierra'], base.cierra),
    };
  });
}

export function ordenarConfiguracion(crudo: unknown): ConfiguracionDelCentro {
  if (!crudo || typeof crudo !== 'object') return CONFIGURACION_VACIA;
  const r = crudo as Record<string, unknown>;
  const c = (r['centro'] ?? {}) as Record<string, unknown>;

  const metodos = Array.isArray(c['metodosDePago'])
    ? (c['metodosDePago'] as unknown[]).map(texto).filter((m) => m !== '')
    : null;

  return {
    datos: {
      // El nombre sale de `negocio.nombre`, que es su unica fuente de verdad.
      nombre: texto(r['nombre']) || NOMBRE_POR_OMISION,
      lema: c['lema'] === undefined ? LEMA_POR_OMISION : texto(c['lema']),
      descripcion: texto(c['descripcion']),
      logoUrl: texto(c['logoUrl']),
      telefono: texto(c['telefono']),
      correo: texto(c['correo']),
      sitio: texto(c['sitio']),
      direccion: texto(c['direccion']),
      ciudad: texto(c['ciudad']),
      estado: texto(c['estado']),
      pais: texto(c['pais']),
      codigoPostal: texto(c['codigoPostal']),
      facebook: texto(c['facebook']),
      instagram: texto(c['instagram']),
      whatsapp: texto(c['whatsapp']),
      zonaHoraria: texto(c['zonaHoraria']) || CENTRO_VACIO.zonaHoraria,
      moneda: texto(c['moneda']) || CENTRO_VACIO.moneda,
      decimales: numero(c['decimales'], CENTRO_VACIO.decimales),
      impuestoNombre: texto(c['impuestoNombre']) || CENTRO_VACIO.impuestoNombre,
      impuestoTasa: numero(c['impuestoTasa'], CENTRO_VACIO.impuestoTasa),
      // Solo un `false` explicito lo apaga: un `undefined` de un centro que
      // nunca lo configuro no puede cambiar como se calculan los precios.
      impuestoIncluido: c['impuestoIncluido'] !== false,
      metodosDePago: metodos && metodos.length > 0 ? metodos : CENTRO_VACIO.metodosDePago,
      rfc: texto(c['rfc']),
      razonSocial: texto(c['razonSocial']),
      regimenFiscal: texto(c['regimenFiscal']),
      direccionFiscal: texto(c['direccionFiscal']),
      pieDeComprobante: texto(c['pieDeComprobante']),
      tema: (texto(c['tema']) || 'sistema') as TemaDelCentro,
      menosMovimiento: c['menosMovimiento'] === true,
      horarios: ordenarHorarios(c['horarios']),
    },
    creadoEn: opcional(r['creadoEn']),
    miembros: numero(r['miembros'], 0),
  };
}

/** Lo que de verdad viaja al guardar: el bloque, sin el nombre. */
export function comoBloque(d: DatosDelCentro): Readonly<Record<string, unknown>> {
  return {
    lema: d.lema.trim(),
    descripcion: d.descripcion.trim(),
    logoUrl: d.logoUrl.trim(),
    telefono: d.telefono.trim(),
    correo: d.correo.trim(),
    sitio: d.sitio.trim(),
    direccion: d.direccion.trim(),
    ciudad: d.ciudad.trim(),
    estado: d.estado.trim(),
    pais: d.pais.trim(),
    codigoPostal: d.codigoPostal.trim(),
    facebook: d.facebook.trim(),
    instagram: d.instagram.trim(),
    whatsapp: d.whatsapp.trim(),
    zonaHoraria: d.zonaHoraria.trim(),
    moneda: d.moneda.trim().toUpperCase(),
    decimales: d.decimales,
    impuestoNombre: d.impuestoNombre.trim(),
    impuestoTasa: d.impuestoTasa,
    impuestoIncluido: d.impuestoIncluido,
    metodosDePago: [...d.metodosDePago],
    rfc: d.rfc.trim().toUpperCase(),
    razonSocial: d.razonSocial.trim(),
    regimenFiscal: d.regimenFiscal.trim(),
    direccionFiscal: d.direccionFiscal.trim(),
    pieDeComprobante: d.pieDeComprobante.trim(),
    tema: d.tema,
    menosMovimiento: d.menosMovimiento,
    horarios: d.horarios.map((h) => ({
      dia: h.dia,
      cerrado: h.cerrado,
      abre: h.abre,
      cierra: h.cierra,
    })),
  };
}

export function ordenarMiembro(crudo: unknown): MiembroDelCentro {
  const m = (crudo ?? {}) as Record<string, unknown>;
  const permisos = m['permisos'];
  return {
    id: texto(m['id']),
    usuarioId: texto(m['usuarioId']),
    correo: texto(m['correo']),
    nombre: texto(m['nombre']),
    rol: texto(m['rol']),
    rolEtiqueta: texto(m['rolEtiqueta']) || texto(m['rol']),
    activo: m['activo'] === true,
    eliminado: m['eliminado'] === true,
    permisos:
      permisos && typeof permisos === 'object'
        ? (permisos as Readonly<Record<string, boolean>>)
        : null,
    soyYo: m['soyYo'] === true,
    creadoEn: texto(m['creadoEn']),
  };
}

export function ordenarEquipo(crudo: unknown): EquipoDelCentro {
  if (!crudo || typeof crudo !== 'object') return { miembros: [], invitaciones: [], duenosActivos: 0 };
  const r = crudo as Record<string, unknown>;
  const lista = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

  return {
    miembros: lista(r['miembros']).map(ordenarMiembro),
    invitaciones: lista(r['invitaciones']).map((i) => ({
      id: texto(i['id']),
      correo: texto(i['correo']),
      nombre: texto(i['nombre']),
      rol: texto(i['rol']),
      rolEtiqueta: texto(i['rolEtiqueta']) || texto(i['rol']),
      creadaEn: texto(i['creadaEn']),
    })),
    duenosActivos: numero(r['duenosActivos'], 0),
  };
}

export function ordenarRoles(crudo: unknown): RolDelCentro[] {
  if (!Array.isArray(crudo)) return [];
  return (crudo as Record<string, unknown>[]).map((r) => ({
    id: texto(r['id']),
    etiqueta: texto(r['etiqueta']) || texto(r['id']),
    permisos:
      r['permisos'] && typeof r['permisos'] === 'object'
        ? (r['permisos'] as Readonly<Record<string, boolean>>)
        : {},
    activo: r['activo'] !== false,
    cuantos: numero(r['cuantos'], 0),
  }));
}

export function ordenarBitacora(crudo: unknown): PaginaDeLaBitacora {
  const p = (crudo ?? {}) as Record<string, unknown>;
  const filas = Array.isArray(p['filas']) ? (p['filas'] as Record<string, unknown>[]) : [];
  const gente = Array.isArray(p['gente']) ? (p['gente'] as Record<string, unknown>[]) : [];
  return {
    filas: filas.map((a) => ({
      id: texto(a['id']),
      ocurridoEn: texto(a['ocurridoEn']),
      usuarioId: opcional(a['usuarioId']),
      usuario: texto(a['usuario']),
      rol: texto(a['rol']),
      modulo: texto(a['modulo']),
      accion: texto(a['accion']),
      detalle: opcional(a['detalle']),
      entidad: opcional(a['entidad']),
      antes: (a['antes'] ?? null) as Readonly<Record<string, unknown>> | null,
      despues: (a['despues'] ?? null) as Readonly<Record<string, unknown>> | null,
      motivo: opcional(a['motivo']),
    })),
    total: numero(p['total'], 0),
    pagina: Math.max(1, numero(p['pagina'], 1)),
    porPagina: Math.max(1, numero(p['porPagina'], 20)),
    modulos: Array.isArray(p['modulos']) ? (p['modulos'] as unknown[]).map(texto) : [],
    gente: gente.map((g) => ({ id: texto(g['id']), nombre: texto(g['nombre']) })),
  };
}

export function ordenarLicencia(crudo: unknown): LicenciaDelCentro {
  const l = (crudo ?? {}) as Record<string, unknown>;
  return {
    administrada: l['administrada'] === true,
    plan: opcional(l['plan']),
    estado: opcional(l['estado']),
    expiraEn: opcional(l['expiraEn']),
    actualizadaEn: opcional(l['actualizadaEn']),
    // Ante la duda, que NO se pueda: decir que si y que el guardado falle
    // despues es peor que avisar de mas.
    permiteGuardar: l['permiteGuardar'] !== false,
  };
}

/* ------------------------------------------------------------------ */
/* Como se dicen las cosas                                             */
/* ------------------------------------------------------------------ */

export const COMO_SE_DICE_LA_LICENCIA: Readonly<Record<string, string>> = {
  activa: 'Activa',
  suspendida: 'Suspendida',
  expirada: 'Vencida',
  baja: 'Dada de baja',
};

/**
 * Como se lee una anotacion de la bitacora.
 *
 * SE TRADUCE AQUI Y EN UN SOLO SITIO. La bitacora guarda verbos cortos
 * —`crear`, `cobrar`, `dar-de-baja`— porque son estables y se filtran bien;
 * pero "dar-de-baja" en la pantalla de alguien no es español. Traducirlo en
 * cada pantalla que la lea acabaria con dos redacciones del mismo hecho.
 */
export const COMO_SE_DICE_LA_ACCION: Readonly<Record<string, string>> = {
  crear: 'Creó',
  editar: 'Editó',
  eliminar: 'Eliminó',
  cobrar: 'Cobró',
  cancelar: 'Canceló',
  invitar: 'Invitó',
  'cambiar-rol': 'Cambió el rol',
  'cambiar-acceso': 'Cambió el acceso',
  'dar-de-baja': 'Dio de baja',
  'aceptar-invitacion': 'Aceptó la invitación',
  'transferir-propiedad': 'Transfirió el centro',
  abrir: 'Abrió',
  cerrar: 'Cerró',
  ajustar: 'Ajustó',
};

export function comoSeDiceLaAccion(accion: string): string {
  return COMO_SE_DICE_LA_ACCION[accion] ?? accion;
}

/* ------------------------------------------------------------------ */
/* Las llaves del cache                                                */
/* ------------------------------------------------------------------ */

/**
 * TODAS EMPIEZAN CON `configuracion:`.
 *
 * Asi un solo `invalidar('configuracion')` refresca la ficha del centro, el
 * equipo, los roles, la bitacora y la licencia a la vez. Sin el prefijo comun
 * habria que acordarse de cada llave — y de la que se olvide nadie se entera:
 * solo se queda vieja.
 */
export const PREFIJO_DE_CONFIGURACION = 'configuracion';

export function llaveDeLaConfiguracion(negocio: string): string {
  return `${PREFIJO_DE_CONFIGURACION}:centro:${negocio}`;
}

export function llaveDelEquipo(negocio: string): string {
  return `${PREFIJO_DE_CONFIGURACION}:equipo:${negocio}`;
}

export function llaveDeLosRoles(negocio: string): string {
  return `${PREFIJO_DE_CONFIGURACION}:roles:${negocio}`;
}

export function llaveDeLaLicencia(negocio: string): string {
  return `${PREFIJO_DE_CONFIGURACION}:licencia:${negocio}`;
}

export function llaveDeLaActividad(negocio: string): string {
  return `${PREFIJO_DE_CONFIGURACION}:actividad:${negocio}`;
}

export interface ConsultaDeLaBitacora {
  readonly modulo: string;
  readonly usuarioId: string;
  readonly desde: string;
  readonly hasta: string;
  readonly busqueda: string;
  readonly pagina: number;
  readonly porPagina: number;
}

export const BITACORA_SIN_FILTROS: ConsultaDeLaBitacora = {
  modulo: '',
  usuarioId: '',
  desde: '',
  hasta: '',
  busqueda: '',
  pagina: 1,
  porPagina: 20,
};

export function llaveDeLaBitacora(negocio: string, c: ConsultaDeLaBitacora): string {
  // La llave lleva TODO lo que cambia la respuesta. Una llave corta hace que
  // cambiar de filtro enseñe la pagina del filtro anterior con toda la cara de
  // estar al dia.
  return [
    PREFIJO_DE_CONFIGURACION,
    'bitacora',
    negocio,
    c.modulo,
    c.usuarioId,
    c.desde,
    c.hasta,
    c.busqueda,
    String(c.pagina),
    String(c.porPagina),
  ].join(':');
}

/**
 * QUE SE REFRESCA CUANDO ALGO CAMBIA EN CONFIGURACION.
 *
 * `inicio` esta en la lista —lo exige la guardia 11 y ademas hace falta de
 * verdad—: el nombre del centro se pinta en la barra lateral y el saludo de
 * Inicio lee la sesion. Sin ese prefijo, renombrar el centro lo dejaria con el
 * nombre viejo hasta que alguien recargue.
 */
export const LO_QUE_TOCA_LA_CONFIGURACION = [
  PREFIJO_DE_CONFIGURACION,
  PREFIJO_DE_INICIO,
] as const;

/* ------------------------------------------------------------------ */
/* Traer                                                               */
/* ------------------------------------------------------------------ */

export async function traerConfiguracion(negocio: string): Promise<ConfiguracionDelCentro> {
  const { data, error } = await supabase().rpc('configuracion_del_centro', {
    p_negocio: negocio,
  });
  reventar(error, 'cargar la configuración del centro');
  return ordenarConfiguracion(data);
}

export async function traerEquipo(negocio: string): Promise<EquipoDelCentro> {
  const { data, error } = await supabase().rpc('equipo_del_centro', { p_negocio: negocio });
  reventar(error, 'cargar el equipo del centro');
  return ordenarEquipo(data);
}

export async function traerRoles(negocio: string): Promise<RolDelCentro[]> {
  const { data, error } = await supabase().rpc('roles_del_centro', { p_negocio: negocio });
  reventar(error, 'cargar los roles del centro');
  return ordenarRoles(data);
}

export async function traerLicencia(negocio: string): Promise<LicenciaDelCentro> {
  const { data, error } = await supabase().rpc('licencia_del_centro', { p_negocio: negocio });
  reventar(error, 'cargar el plan del centro');
  return ordenarLicencia(data);
}

export async function traerBitacora(
  negocio: string,
  c: ConsultaDeLaBitacora,
): Promise<PaginaDeLaBitacora> {
  const { data, error } = await supabase().rpc('bitacora_del_centro', {
    p_negocio: negocio,
    p_modulo: c.modulo || null,
    p_usuario: c.usuarioId || null,
    p_desde: c.desde ? aBase(c.desde as Fecha) : null,
    p_hasta: c.hasta ? aBase(c.hasta as Fecha) : null,
    p_busqueda: c.busqueda.trim() || null,
    p_pagina: c.pagina,
    p_por_pagina: c.porPagina,
  });
  reventar(error, 'cargar la bitácora');
  return ordenarBitacora(data);
}

export async function traerActividadReciente(
  negocio: string,
  cuantas = 3,
): Promise<ActividadReciente[]> {
  const { data, error } = await supabase().rpc('actividad_reciente_del_centro', {
    p_negocio: negocio,
    p_cuantas: cuantas,
  });
  reventar(error, 'cargar la actividad reciente');
  return (Array.isArray(data) ? (data as Record<string, unknown>[]) : []).map((a) => ({
    id: texto(a['id']),
    ocurridoEn: texto(a['ocurridoEn']),
    usuario: texto(a['usuario']),
    modulo: texto(a['modulo']),
    accion: texto(a['accion']),
    entidad: opcional(a['entidad']),
  }));
}

/* ------------------------------------------------------------------ */
/* Escribir                                                            */
/* ------------------------------------------------------------------ */

export async function guardarConfiguracion(
  negocio: string,
  d: DatosDelCentro,
): Promise<ConfiguracionDelCentro> {
  const { data, error } = await supabase().rpc('guardar_configuracion_del_centro', {
    p_negocio: negocio,
    p_nombre: d.nombre.trim().replace(/\s+/g, ' '),
    p_datos: comoBloque(d),
  });
  reventar(error, 'guardar la configuración del centro');
  return ordenarConfiguracion(data);
}

export async function guardarMiPerfil(negocio: string, nombre: string): Promise<void> {
  const { error } = await supabase().rpc('guardar_mi_perfil', {
    p_negocio: negocio,
    p_nombre: nombre.trim().replace(/\s+/g, ' '),
  });
  reventar(error, 'guardar tu perfil');
}

export async function invitarAlCentro(
  negocio: string,
  correo: string,
  nombre: string,
  rol: string,
): Promise<void> {
  const { error } = await supabase().rpc('invitar_al_centro', {
    p_negocio: negocio,
    p_correo: correo.trim(),
    p_nombre: nombre.trim().replace(/\s+/g, ' '),
    p_rol: rol,
    p_permisos: null,
  });
  reventar(error, 'invitar a esta persona');
}

export async function cancelarInvitacion(id: string): Promise<void> {
  const { error } = await supabase().rpc('cancelar_invitacion_del_centro', { p_id: id });
  reventar(error, 'cancelar la invitación');
}

/**
 * Convierte en membresía las invitaciones al correo de quien está dentro.
 *
 * LA LLAMA QUIEN ENTRO Y NO PERTENECE A NINGUN CENTRO, desde la pantalla de
 * "tu cuenta todavía no está en ningún centro". El correo no viaja como
 * parámetro a propósito: lo saca la base del token. Si viniera de aquí,
 * cualquiera se daría de alta en el centro de cualquiera.
 */
export async function reclamarInvitaciones(): Promise<number> {
  const { data, error } = await supabase().rpc('reclamar_invitaciones', {});
  reventar(error, 'buscar tus invitaciones');
  const r = (data ?? {}) as Record<string, unknown>;
  return numero(r['aceptadas'], 0);
}

export async function cambiarRol(membresia: string, rol: string): Promise<void> {
  const { error } = await supabase().rpc('cambiar_rol_en_el_centro', {
    p_membresia: membresia,
    p_rol: rol,
    p_permisos: null,
  });
  reventar(error, 'cambiar el rol');
}

export async function cambiarAcceso(
  membresia: string,
  activo: boolean,
  darDeBaja = false,
): Promise<void> {
  const { error } = await supabase().rpc('cambiar_acceso_en_el_centro', {
    p_membresia: membresia,
    p_activo: activo,
    p_dar_de_baja: darDeBaja,
  });
  reventar(error, darDeBaja ? 'dar de baja a esta persona' : 'cambiar el acceso');
}

export async function guardarRol(
  negocio: string,
  id: string,
  etiqueta: string,
  permisos: Readonly<Record<string, boolean>>,
  activo: boolean,
): Promise<void> {
  const { error } = await supabase().rpc('guardar_rol_del_centro', {
    p_negocio: negocio,
    p_id: id,
    p_etiqueta: etiqueta.trim(),
    p_permisos: permisos,
    p_activo: activo,
  });
  reventar(error, 'guardar el rol');
}

export async function transferirPropiedad(negocio: string, membresia: string): Promise<void> {
  const { error } = await supabase().rpc('transferir_propiedad_del_centro', {
    p_negocio: negocio,
    p_membresia: membresia,
  });
  reventar(error, 'transferir la propiedad del centro');
}

export async function exportarDelCentro(negocio: string, que: string): Promise<Exportacion> {
  const { data, error } = await supabase().rpc('exportar_del_centro', {
    p_negocio: negocio,
    p_que: que,
    p_limite: 5000,
  });
  reventar(error, `exportar ${que}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    que: texto(r['que']) || que,
    total: numero(r['total'], 0),
    entregadas: numero(r['entregadas'], 0),
    tope: numero(r['tope'], 0),
    filas: Array.isArray(r['filas']) ? (r['filas'] as Record<string, unknown>[]) : [],
  };
}

/* ------------------------------------------------------------------ */
/* El archivo que se descarga                                          */
/* ------------------------------------------------------------------ */

/**
 * Filas cualesquiera, convertidas a CSV.
 *
 * LAS COMILLAS SE DUPLICAN Y TODO VA ENTRECOMILLADO. Un nombre con una coma
 * parte la fila en dos y el archivo entero se descuadra a partir de ahí. Es el
 * fallo clásico de exportar a mano, y el mismo que ya se pagó en Recordatorios.
 *
 * LAS COLUMNAS SALEN DE TODAS LAS FILAS, no de la primera: dos filas de la
 * misma tabla pueden traer llaves distintas cuando alguna venía en nulo, y con
 * la primera como plantilla esas columnas desaparecen del archivo sin avisar.
 */
export function comoCsvDeExportacion(filas: readonly Readonly<Record<string, unknown>>[]): string {
  if (filas.length === 0) return '';
  const columnas: string[] = [];
  for (const f of filas) {
    for (const k of Object.keys(f)) if (!columnas.includes(k)) columnas.push(k);
  }
  const escapar = (v: unknown): string => {
    if (v === null || v === undefined) return '""';
    const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${t.replace(/"/g, '""')}"`;
  };
  return [
    columnas.map(escapar).join(','),
    ...filas.map((f) => columnas.map((c) => escapar(f[c])).join(',')),
  ].join('\n');
}
