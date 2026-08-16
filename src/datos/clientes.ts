/**
 * EL ACCESO A DATOS DE CLIENTES.
 *
 * `cliente` es LA FUENTE DE VERDAD de una persona: su nombre, su telefono, su
 * correo, su cumpleaños. Ninguna otra tabla guarda una copia — la referencian
 * por id y resuelven el nombre al leer. Por eso corregir un telefono aqui lo
 * corrige a la vez en Agenda, en Ventas y en el buscador global, sin tocar
 * cinco tablas.
 *
 * LO QUE NO ES DE CLIENTES NO SE GUARDA EN CLIENTES. Visitas, ultima visita,
 * proxima cita, compras, adeudo y cursos NO son columnas: se cuentan en la
 * base, desde citas, ventas, pagos e inscripciones. Un contador a mano se
 * desincroniza a la primera cita cancelada, y a partir de ahi hay dos numeros
 * y nadie sabe cual creer.
 *
 * LA LISTA SE BUSCA, SE FILTRA Y SE PAGINA EN LA BASE. Traerse la tabla entera
 * y filtrar en el navegador funciona con veinte clientes y se cae con dos mil;
 * y para pintar "ultima visita" habria que pedir el historial de cada renglon,
 * que es el problema N+1 en su forma mas cara.
 */

import type { Fecha } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, deBase, reventar } from './fechas-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

/**
 * Los tres estados, y ninguno se guarda en una columna.
 *
 * `archivado` sale de `eliminado`, que ya existia. `activo` e `inactivo` se
 * deducen de la ultima cita completada contra el plazo que define la base
 * (`app.meses_de_actividad`). Guardar un `estado` a mano obligaria a alguien a
 * recorrer la tabla cada noche para apagarlo, y el dia que ese proceso falle,
 * medio directorio diria "activo" sin serlo.
 */
export type EstadoDeCliente = 'activo' | 'inactivo' | 'archivado';

export const ESTADOS_DE_CLIENTE: readonly { clave: EstadoDeCliente; etiqueta: string }[] = [
  { clave: 'activo', etiqueta: 'Activo' },
  { clave: 'inactivo', etiqueta: 'Inactivo' },
  { clave: 'archivado', etiqueta: 'Archivado' },
];

export function etiquetaDeEstadoDeCliente(estado: string): string {
  return ESTADOS_DE_CLIENTE.find((e) => e.clave === estado)?.etiqueta ?? estado;
}

export interface ClienteEnLista {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly fechaNacimiento: Fecha | null;
  readonly profesionalId: string | null;
  readonly profesional: string | null;
  readonly visitas: number;
  readonly ultimaVisita: Fecha | null;
  readonly estado: EstadoDeCliente;
  /**
   * Si se le pueden mandar difusiones promocionales.
   *
   * `undefined` es una base que todavia no tiene la columna, y cuenta como que
   * SI acepta: si contara como que no, una base sin actualizar dejaria a todo
   * el mundo fuera de cualquier difusion sin decir por que. Quien pida dejar de
   * recibirlas se apaga desde su ficha.
   */
  readonly aceptaPromociones?: boolean;
}

export interface PaginaDeClientes {
  /** Cuantos hay en total CON los filtros puestos, sin paginar. */
  readonly total: number;
  readonly filas: readonly ClienteEnLista[];
}

export interface CumpleanosProximo {
  readonly id: string;
  readonly nombre: string;
  readonly fecha: Fecha;
  /** Cuantos dias faltan. Cero es hoy. */
  readonly enDias: number;
}

export interface ResumenDeClientes {
  readonly total: number;
  readonly activos: number;
  readonly nuevosEsteMes: number;
  readonly frecuentes: number;
  readonly totalVisitas: number;
  readonly citasProximas: number;
  readonly serviciosContratados: number;
  readonly comprasRealizadas: number;
  readonly cursosInscritos: number;
  /** Centavos enteros. */
  readonly totalAdeudos: number;
  readonly cumpleanos: readonly CumpleanosProximo[];
}

export interface ServicioRecibido {
  readonly nombre: string;
  readonly veces: number;
}

/** Una sesion ya dada, con lo que se anoto de ella. */
export interface SesionDelExpediente {
  readonly id: string;
  readonly fecha: Fecha;
  readonly servicio: string;
  readonly profesional: string | null;
  readonly notas: string;
}

export interface ExpedienteDeCliente {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly fechaNacimiento: Fecha | null;
  readonly notas: string | null;
  readonly clienteDesde: Fecha | null;
  readonly archivado: boolean;
  readonly profesionalId: string | null;
  readonly profesional: string | null;
  readonly visitas: number;
  readonly canceladas: number;
  readonly noAsistio: number;
  readonly ultimaVisita: { readonly fecha: Fecha; readonly servicio: string } | null;
  readonly proximaCita: {
    readonly id: string;
    readonly fecha: Fecha;
    readonly hora: string;
    readonly servicio: string;
  } | null;
  readonly compras: number;
  readonly totalGastado: number;
  readonly adeudo: number;
  readonly cursos: number;
  readonly servicios: readonly ServicioRecibido[];

  /* --- Lo clinico. Se lee ANTES de la sesion ----------------------- */
  readonly padecimientos: string | null;
  readonly alergias: string | null;
  readonly medicamentos: string | null;
  readonly cirugias: string | null;
  readonly embarazo: string | null;
  readonly contraindicaciones: string | null;
  readonly presionPreferida: string | null;
  readonly aromasEvitar: string | null;
  readonly direccion: string | null;
  readonly ocupacion: string | null;
  readonly contactoEmergencia: string | null;
  readonly telefonoEmergencia: string | null;
  readonly comoNosConocio: string | null;
  readonly referidoPor: string | null;

  /**
   * LAS NOTAS DE CADA SESION, de la mas reciente a la mas vieja.
   *
   * No viven en el cliente: son de la CITA, donde se escribieron. Es lo que deja
   * llegar a la cuarta sesion sabiendo que se hizo en las tres anteriores en vez
   * de volver a preguntar.
   */
  readonly sesiones: readonly SesionDelExpediente[];
}

export interface FiltrosDeClientes {
  readonly busqueda?: string;
  readonly estado?: EstadoDeCliente | '';
  readonly profesionalId?: string;
  /** El rango de visitas, ya resuelto en numeros. */
  readonly visitasMin?: number | null;
  readonly visitasMax?: number | null;
}

/* ------------------------------------------------------------------ */
/* Ordenar lo que contesta el servidor                                 */
/* ------------------------------------------------------------------ */

const numero = (v: unknown): number => {
  const n = Number(v);
  // NaN NUNCA sale de aqui: se propaga sin reventar y termina impreso.
  return Number.isFinite(n) ? n : 0;
};

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const opcional = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const fechaOpcional = (v: unknown): Fecha | null => (v === null || v === undefined ? null : deBase(v));
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const RESUMEN_DE_CLIENTES_VACIO: ResumenDeClientes = {
  total: 0,
  activos: 0,
  nuevosEsteMes: 0,
  frecuentes: 0,
  totalVisitas: 0,
  citasProximas: 0,
  serviciosContratados: 0,
  comprasRealizadas: 0,
  cursosInscritos: 0,
  totalAdeudos: 0,
  cumpleanos: [],
};

export function ordenarResumenDeClientes(crudo: unknown): ResumenDeClientes {
  if (!crudo || typeof crudo !== 'object') return RESUMEN_DE_CLIENTES_VACIO;
  const r = crudo as Record<string, unknown>;
  return {
    total: numero(r['total']),
    activos: numero(r['activos']),
    nuevosEsteMes: numero(r['nuevosEsteMes']),
    frecuentes: numero(r['frecuentes']),
    totalVisitas: numero(r['totalVisitas']),
    citasProximas: numero(r['citasProximas']),
    serviciosContratados: numero(r['serviciosContratados']),
    comprasRealizadas: numero(r['comprasRealizadas']),
    cursosInscritos: numero(r['cursosInscritos']),
    totalAdeudos: numero(r['totalAdeudos']),
    cumpleanos: lista(r['cumpleanos']).map((c) => {
      const x = c as Record<string, unknown>;
      return {
        id: texto(x['id']),
        nombre: texto(x['nombre']),
        fecha: deBase(x['fecha']),
        enDias: numero(x['enDias']),
      };
    }),
  };
}

export function ordenarFila(crudo: unknown): ClienteEnLista {
  const c = (crudo ?? {}) as Record<string, unknown>;
  return {
    id: texto(c['id']),
    nombre: texto(c['nombre']),
    telefono: opcional(c['telefono']),
    correo: opcional(c['correo']),
    fechaNacimiento: fechaOpcional(c['fechaNacimiento']),
    profesionalId: opcional(c['profesionalId']),
    profesional: opcional(c['profesional']),
    visitas: numero(c['visitas']),
    ultimaVisita: fechaOpcional(c['ultimaVisita']),
    estado: (texto(c['estado']) || 'inactivo') as EstadoDeCliente,
    ...(typeof c['aceptaPromociones'] === 'boolean'
      ? { aceptaPromociones: c['aceptaPromociones'] }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

/**
 * La llave incluye TODO lo que cambia el resultado.
 *
 * Si la pagina o un filtro faltaran aqui, cambiarlos mostraria lo que ya
 * estaba guardado de la consulta anterior — y se veria como si el filtro no
 * hiciera nada.
 */
export function llaveDeClientes(
  negocio: string,
  filtros: FiltrosDeClientes,
  pagina: number,
  porPagina: number,
): string {
  return [
    'clientes', negocio,
    filtros.busqueda ?? '',
    filtros.estado ?? '',
    filtros.profesionalId ?? '',
    filtros.visitasMin ?? '',
    filtros.visitasMax ?? '',
    pagina, porPagina,
  ].join(':');
}

export async function traerClientes(
  negocio: string,
  filtros: FiltrosDeClientes,
  pagina: number,
  porPagina: number,
): Promise<PaginaDeClientes> {
  const { data, error } = await supabase().rpc('clientes_del_centro', {
    p_negocio: negocio,
    p_busqueda: filtros.busqueda?.trim() || null,
    p_estado: filtros.estado || null,
    p_profesional: filtros.profesionalId || null,
    p_visitas_min: filtros.visitasMin ?? null,
    p_visitas_max: filtros.visitasMax ?? null,
    p_pagina: pagina,
    p_por_pagina: porPagina,
  });
  reventar(error, 'cargar los clientes');

  const r = (data ?? {}) as Record<string, unknown>;
  return { total: numero(r['total']), filas: lista(r['filas']).map(ordenarFila) };
}

export function llaveDelResumenDeClientes(negocio: string, dia: Fecha): string {
  return `clientes:resumen:${negocio}:${dia}`;
}

export async function traerResumenDeClientes(
  negocio: string,
  dia: Fecha,
): Promise<ResumenDeClientes> {
  const { data, error } = await supabase().rpc('resumen_clientes', {
    p_negocio: negocio,
    p_hoy: aBase(dia),
  });
  reventar(error, 'cargar el resumen de clientes');
  return ordenarResumenDeClientes(data);
}

export function llaveDelExpediente(clienteId: string): string {
  return `clientes:expediente:${clienteId}`;
}

export async function traerExpediente(
  clienteId: string,
  dia: Fecha,
): Promise<ExpedienteDeCliente | null> {
  const { data, error } = await supabase().rpc('expediente_del_cliente', {
    p_cliente: clienteId,
    p_hoy: aBase(dia),
  });
  reventar(error, 'cargar el expediente');
  if (!data || typeof data !== 'object') return null;

  const c = data as Record<string, unknown>;
  const sub = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : null;

  const ultima = sub(c['ultimaVisita']);
  const proxima = sub(c['proximaCita']);

  return {
    id: texto(c['id']),
    nombre: texto(c['nombre']),
    telefono: opcional(c['telefono']),
    correo: opcional(c['correo']),
    fechaNacimiento: fechaOpcional(c['fechaNacimiento']),
    notas: opcional(c['notas']),
    clienteDesde: c['clienteDesde'] ? deBase(String(c['clienteDesde']).slice(0, 10)) : null,
    archivado: Boolean(c['archivado']),
    profesionalId: opcional(c['profesionalId']),
    profesional: opcional(c['profesional']),
    visitas: numero(c['visitas']),
    canceladas: numero(c['canceladas']),
    noAsistio: numero(c['noAsistio']),
    ultimaVisita: ultima
      ? { fecha: deBase(ultima['fecha']), servicio: texto(ultima['servicio']) }
      : null,
    proximaCita: proxima
      ? {
          id: texto(proxima['id']),
          fecha: deBase(proxima['fecha']),
          hora: texto(proxima['hora']).slice(0, 5),
          servicio: texto(proxima['servicio']),
        }
      : null,
    compras: numero(c['compras']),
    totalGastado: numero(c['totalGastado']),
    adeudo: numero(c['adeudo']),
    cursos: numero(c['cursos']),
    servicios: lista(c['servicios']).map((s) => {
      const x = s as Record<string, unknown>;
      return { nombre: texto(x['nombre']), veces: numero(x['veces']) };
    }),

    padecimientos: opcional(c['padecimientos']),
    alergias: opcional(c['alergias']),
    medicamentos: opcional(c['medicamentos']),
    cirugias: opcional(c['cirugias']),
    embarazo: opcional(c['embarazo']),
    contraindicaciones: opcional(c['contraindicaciones']),
    presionPreferida: opcional(c['presionPreferida']),
    aromasEvitar: opcional(c['aromasEvitar']),
    direccion: opcional(c['direccion']),
    ocupacion: opcional(c['ocupacion']),
    contactoEmergencia: opcional(c['contactoEmergencia']),
    telefonoEmergencia: opcional(c['telefonoEmergencia']),
    comoNosConocio: opcional(c['comoNosConocio']),
    referidoPor: opcional(c['referidoPor']),

    sesiones: lista(c['sesiones']).map((x) => {
      const z = x as Record<string, unknown>;
      return {
        id: texto(z['id']),
        fecha: deBase(String(z['fecha']).slice(0, 10)),
        servicio: texto(z['servicio']),
        profesional: opcional(z['profesional']),
        notas: texto(z['notas']),
      };
    }),
  };
}

/**
 * Los recordatorios de SEGUIMIENTO: los que nacieron de un cliente.
 *
 * Se filtran por `entidad_tipo = 'cliente'`. No hay una lista de seguimientos
 * guardada dentro de Clientes: son los mismos recordatorios del modulo
 * Recordatorios, mirados por su origen.
 */
export function llaveDeSeguimientos(negocio: string): string {
  return `clientes:seguimientos:${negocio}`;
}

export interface Seguimiento {
  readonly id: string;
  readonly titulo: string;
  readonly detalle: string | null;
  readonly fecha: Fecha;
  readonly clienteId: string | null;
}

export async function traerSeguimientos(negocio: string, limite = 4): Promise<Seguimiento[]> {
  const { data, error } = await supabase()
    .from('recordatorio')
    .select('id, titulo, detalle, fecha, entidad_id')
    .eq('negocio_id', negocio)
    .eq('eliminado', false)
    .eq('estado', 'pendiente')
    .eq('entidad_tipo', 'cliente')
    .order('fecha', { ascending: true })
    .limit(limite);
  reventar(error, 'cargar los seguimientos');

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: texto(r['id']),
    titulo: texto(r['titulo']),
    detalle: opcional(r['detalle']),
    fecha: deBase(r['fecha']),
    clienteId: opcional(r['entidad_id']),
  }));
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

/**
 * LO QUE SE CAPTURA DE UNA PERSONA, y por que la mitad es clinico.
 *
 * En un centro de terapias, lo que alguien TIENE no es informacion adicional:
 * es lo primero que hay que saber. Dar un descontracturante a quien trae una
 * hernia reciente, usar lavanda con quien es alergico, o presion firme a quien
 * toma anticoagulantes son daños de verdad, y ninguno se ve en la cara.
 *
 * Todo es texto libre y no listas cerradas a proposito: un catalogo de
 * padecimientos hay que mantenerlo, y el dia que llegue uno que no esta se
 * captura en el campo equivocado o no se captura. Lo que importa es que QUEDE
 * ESCRITO y que se lea antes de la sesion.
 */
export interface DatosDeCliente {
  readonly nombre: string;
  readonly telefono: string;
  readonly correo: string;
  readonly fechaNacimiento: string;
  readonly notas: string;
  readonly profesionalId: string;
  /* --- Lo clinico: se lee ANTES de tocar a alguien ----------------- */
  readonly padecimientos: string;
  readonly alergias: string;
  readonly medicamentos: string;
  readonly cirugias: string;
  /** "", "no", "si" o "lactancia". Cambia aceites y posiciones. */
  readonly embarazo: string;
  readonly contraindicaciones: string;
  /* --- Como se le atiende ------------------------------------------ */
  /** "", "suave", "media" o "firme". */
  readonly presionPreferida: string;
  readonly aromasEvitar: string;
  /* --- Quien es y como llegó --------------------------------------- */
  readonly direccion: string;
  readonly ocupacion: string;
  readonly contactoEmergencia: string;
  readonly telefonoEmergencia: string;
  readonly comoNosConocio: string;
  readonly referidoPor: string;
}

/**
 * UNA FICHA EN BLANCO, y vive aqui junto al tipo y no en el formulario.
 *
 * Con veinte campos, cada sitio que necesitaba una ficha vacia la escribia a
 * mano — y al agregar un campo habia que acordarse de todos. Aqui es uno solo:
 * el que falte lo caza el compilador.
 */
export const DATOS_VACIOS: DatosDeCliente = {
  nombre: '', telefono: '', correo: '', fechaNacimiento: '', notas: '', profesionalId: '',
  padecimientos: '', alergias: '', medicamentos: '', cirugias: '', embarazo: '',
  contraindicaciones: '', presionPreferida: '', aromasEvitar: '',
  direccion: '', ocupacion: '', contactoEmergencia: '', telefonoEmergencia: '',
  comoNosConocio: '', referidoPor: '',
};

/**
 * Se NORMALIZA antes de guardar, y no es cosmetica.
 *
 * "  Ana  María " y "Ana María" son la misma persona; guardadas distinto, la
 * busqueda encuentra una y no la otra, y alguien acaba dando de alta a la
 * misma paciente dos veces. El correo va en minusculas por lo mismo: los
 * servidores de correo no distinguen mayusculas, pero un `=` si.
 *
 * Un campo vacio se guarda como NULL, no como cadena vacia. Si no, "sin
 * telefono" y "telefono en blanco" serian dos cosas distintas en la base y
 * ninguna consulta las trataria igual.
 */
export function normalizar(datos: DatosDeCliente): Record<string, string | null> {
  const limpio = (v: string): string => v.trim().replace(/\s+/g, ' ');
  /* Lo clinico conserva sus saltos de linea, igual que las notas: aplanar
     "hernia L4
rodilla derecha" en un parrafo lo vuelve ilegible justo cuando
     hay que leerlo rapido. */
  const libre = (v: string): string | null => v.trim() || null;
  return {
    nombre: limpio(datos.nombre),
    telefono: limpio(datos.telefono) || null,
    correo: limpio(datos.correo).toLowerCase() || null,
    fecha_nacimiento: datos.fechaNacimiento ? aBase(datos.fechaNacimiento) : null,
    // Las notas conservan sus saltos de linea: solo se recorta lo de las
    // orillas. Aplanarlas convertiria una lista en un parrafo.
    notas: datos.notas.trim() || null,
    profesional_id: datos.profesionalId || null,

    padecimientos: libre(datos.padecimientos),
    alergias: libre(datos.alergias),
    medicamentos: libre(datos.medicamentos),
    cirugias: libre(datos.cirugias),
    embarazo: datos.embarazo || null,
    contraindicaciones: libre(datos.contraindicaciones),
    presion_preferida: datos.presionPreferida || null,
    aromas_evitar: libre(datos.aromasEvitar),
    direccion: libre(datos.direccion),
    ocupacion: limpio(datos.ocupacion) || null,
    contacto_emergencia: limpio(datos.contactoEmergencia) || null,
    telefono_emergencia: limpio(datos.telefonoEmergencia) || null,
    como_nos_conocio: limpio(datos.comoNosConocio) || null,
    referido_por: limpio(datos.referidoPor) || null,
  };
}

export async function crearCliente(negocio: string, datos: DatosDeCliente): Promise<ClienteEnLista> {
  const fila = normalizar(datos);
  const { data, error } = await supabase()
    .from('cliente')
    .insert([{ negocio_id: negocio, ...fila }])
    .select('id, nombre, telefono, correo');
  reventar(error, 'dar de alta al cliente');

  const creado = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  return {
    id: texto(creado['id']),
    nombre: texto(creado['nombre']),
    telefono: opcional(creado['telefono']),
    correo: opcional(creado['correo']),
    fechaNacimiento: null,
    profesionalId: fila['profesional_id'] ?? null,
    profesional: null,
    visitas: 0,
    ultimaVisita: null,
    // Recien creado no tiene una sola visita: es INACTIVO, no activo. Decir
    // "activo" seria el primer numero inventado del modulo.
    estado: 'inactivo',
  };
}

export async function editarCliente(
  clienteId: string,
  datos: DatosDeCliente,
): Promise<void> {
  const { error } = await supabase()
    .from('cliente')
    .update({ ...normalizar(datos), actualizado_en: new Date().toISOString() })
    .eq('id', clienteId);
  reventar(error, 'guardar los cambios del cliente');
}

/**
 * ARCHIVAR, no borrar.
 *
 * Un expediente tiene citas, ventas, pagos, cursos y mensajes colgando. La
 * base ya lo impide —las llaves foraneas son `on delete restrict`— pero la
 * razon de fondo es otra: un expediente medico borrado de verdad es un
 * problema legal, no un renglon menos.
 *
 * Se marca `eliminado`, la persona sale de la lista, y su historial queda
 * intacto para los reportes y para volver a abrirlo.
 */
export async function archivarCliente(clienteId: string, archivar: boolean): Promise<void> {
  const { error } = await supabase()
    .from('cliente')
    .update({ eliminado: archivar, actualizado_en: new Date().toISOString() })
    .eq('id', clienteId);
  reventar(error, archivar ? 'archivar al cliente' : 'reactivar al cliente');
}

/* ------------------------------------------------------------------ */
/* Duplicados                                                          */
/* ------------------------------------------------------------------ */

export interface PosibleDuplicado {
  readonly id: string;
  readonly nombre: string;
  readonly porque: 'telefono' | 'correo';
}

/**
 * Busca a alguien que ya este dado de alta con ese telefono o ese correo.
 *
 * NO SE BLOQUEA POR NOMBRE. Dos personas se pueden llamar igual, y un centro
 * chico tiene hermanas con el mismo apellido. El telefono y el correo si son
 * identificadores: si coinciden, casi siempre es la misma persona capturada
 * dos veces.
 *
 * Y se ADVIERTE, no se prohibe: a veces una madre da su telefono para la
 * ficha de su hija. Quien captura decide, pero decide viendo la coincidencia
 * en vez de enterarse tres meses despues con el historial partido en dos.
 */
export async function buscarPosibleDuplicado(
  negocio: string,
  telefono: string,
  correo: string,
  exceptoId = '',
): Promise<PosibleDuplicado | null> {
  const tel = telefono.trim().replace(/\s+/g, ' ');
  const cor = correo.trim().toLowerCase();
  if (!tel && !cor) return null;

  const bd = supabase();
  const buscar = async (columna: 'telefono' | 'correo', valor: string) => {
    if (!valor) return null;
    let consulta = bd
      .from('cliente')
      .select('id, nombre')
      .eq('negocio_id', negocio)
      .eq('eliminado', false)
      .eq(columna, valor)
      .limit(1);
    // Al EDITAR, la persona coincide consigo misma. Sin esto, guardar sin
    // cambiar nada avisaria de un duplicado que es ella.
    if (exceptoId) consulta = consulta.neq('id', exceptoId);
    const { data, error } = await consulta;
    reventar(error, 'comprobar si ya existe ese cliente');
    const encontrado = ((data ?? []) as Record<string, unknown>[])[0];
    return encontrado
      ? { id: texto(encontrado['id']), nombre: texto(encontrado['nombre']), porque: columna }
      : null;
  };

  return (await buscar('telefono', tel)) ?? (await buscar('correo', cor));
}

/**
 * Todo lo que hay que refrescar al tocar un cliente.
 *
 * Se exporta para que ningun modulo escriba la lista a mano y se le olvide
 * una: el buscador global y el tablero cuelgan de `inicio:`, y la lista y el
 * expediente de `clientes:`.
 */
export const LO_QUE_TOCA_UN_CLIENTE = ['clientes', PREFIJO_DE_INICIO] as const;
