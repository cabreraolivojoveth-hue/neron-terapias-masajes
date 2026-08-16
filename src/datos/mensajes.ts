/**
 * EL ACCESO A DATOS DE MENSAJES.
 *
 * MENSAJES NO ES UNA SEGUNDA BASE DE DATOS DEL SISTEMA. No guarda el nombre del
 * cliente, ni su teléfono, ni su saldo, ni la fecha de su cita: guarda
 * `clienteId` y todo lo demás se resuelve al leer, en el servidor. El día que
 * alguien cambie de apellido, las conversaciones viejas lo dicen al día sin
 * tocar nada — y no hay forma de que existan dos versiones de la misma persona.
 *
 * LAS CUATRO CAPAS, y la razón de que estén separadas:
 *
 *     mensaje  →  conversación  →  canal  →  proveedor
 *
 * El proveedor —WhatsApp, SMS, correo— es lo único que cambia entre canales, y
 * vive FUERA de este archivo. Si el módulo hablara de WhatsApp directamente,
 * agregar SMS obligaría a reescribirlo entero.
 *
 * GUARDAR Y ENVIAR SON DOS COSAS DISTINTAS, y aquí solo pasa la primera. Un
 * mensaje se guarda como `pendiente`; moverlo a `enviado` es cosa de quien de
 * verdad habló con el proveedor. Marcarlo enviado desde el navegador sería
 * decir que el cliente lo recibió cuando no ha salido de la base de datos.
 *
 * LOS PERMISOS NO SE COMPRUEBAN AQUÍ. Todo corre con los permisos de quien
 * llama, así que las reglas de fila deciden: un centro no ve los mensajes de
 * otro, y quien no tiene `gestionarMensajes` no obtiene ni una conversación
 * aunque llame a mano desde la consola.
 */

import type { Fecha } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, reventar } from './fechas-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

export type TipoDeCanal = 'whatsapp' | 'sms' | 'correo' | 'manual';
export type EstadoDeCanal = 'sin_conectar' | 'conectado' | 'error';
export type EstadoDeConversacion = 'abierta' | 'cerrada' | 'archivada';
export type DireccionDelMensaje = 'entrante' | 'saliente';

/**
 * El estado de un mensaje SALIENTE.
 *
 * `pendiente` es "guardado y todavía sin mandar a ningún proveedor", que es
 * donde se queda todo mientras no haya un canal conectado de verdad. Se dice
 * tal cual en la pantalla en vez de pintar una palomita que no significa nada.
 */
export type EstadoDelMensaje =
  | 'pendiente' | 'enviando' | 'enviado' | 'entregado' | 'leido' | 'fallido';

export type Bandeja = 'todas' | 'no_leidas' | 'pendientes' | 'archivadas';

export interface EtiquetaBreve {
  readonly id: string;
  readonly nombre: string;
  readonly color: string | null;
}

export interface UltimoDelHilo {
  readonly cuerpo: string;
  readonly direccion: DireccionDelMensaje;
  readonly estado: EstadoDelMensaje;
  readonly creadoEn: string;
}

export interface ConversacionEnLista {
  readonly id: string;
  /** `null` = todavía no se sabe de quién es. NO se inventa una ficha. */
  readonly clienteId: string | null;
  readonly cliente: string | null;
  /** El identificador EN EL CANAL: el número, el correo. Por donde entró. */
  readonly contacto: string;
  readonly canalId: string | null;
  readonly canal: string | null;
  readonly canalTipo: TipoDeCanal | null;
  readonly estado: EstadoDeConversacion;
  readonly favorita: boolean;
  readonly asignadaA: string | null;
  readonly asignada: string | null;
  readonly sinLeer: number;
  readonly pendiente: boolean;
  readonly ultimoEn: string;
  readonly ultimo: UltimoDelHilo | null;
  readonly etiquetas: readonly EtiquetaBreve[];
}

export interface CuentasDeBandeja {
  readonly todas: number;
  readonly noLeidas: number;
  readonly pendientes: number;
  readonly archivadas: number;
}

export interface PaginaDeConversaciones {
  readonly total: number;
  readonly cuentas: CuentasDeBandeja;
  readonly filas: readonly ConversacionEnLista[];
}

export interface MensajeDelHilo {
  readonly id: string;
  readonly direccion: DireccionDelMensaje;
  readonly cuerpo: string;
  readonly estado: EstadoDelMensaje;
  readonly error: string | null;
  readonly adjuntoUrl: string | null;
  readonly adjuntoTipo: string | null;
  readonly quien: string | null;
  readonly difusionId: string | null;
  readonly leidoEn: string | null;
  readonly creadoEn: string;
}

export interface ResumenDeMensajes {
  readonly activas: number;
  readonly clientesEnConversacion: number;
  readonly enviados: number;
  readonly enviadosAntes: number;
  readonly recibidos: number;
  readonly recibidosAntes: number;
  readonly pendientes: number;
  readonly hayComparacion: boolean;
  readonly pedianRespuesta: number;
  readonly respondidas: number;
  /** `null` sin nadie a quien responder: un 0% afirmaría que se dejó a todos sin contestar. */
  readonly tasaRespuesta: number | null;
  /** `null` sin pares de verdad: un cero se leería como "al instante". */
  readonly minutosDeRespuesta: number | null;
}

export interface PlantillaDeMensaje {
  readonly id: string;
  readonly nombre: string;
  readonly categoria: string;
  readonly cuerpo: string;
  readonly canalTipo: TipoDeCanal | null;
  readonly activa: boolean;
}

export interface CanalDeMensajes {
  readonly id: string;
  readonly tipo: TipoDeCanal;
  readonly nombre: string;
  readonly identificador: string | null;
  readonly estado: EstadoDeCanal;
  readonly detalleError: string | null;
  readonly ultimaSincronizacion: string | null;
  readonly activo: boolean;
}

export type EventoAutomatizable =
  | 'cita_nueva' | 'cita_confirmada' | 'cita_cancelada' | 'cita_reagendada'
  | 'cita_recordatorio' | 'inscripcion_nueva' | 'pago_registrado'
  | 'seguimiento' | 'cliente_inactivo';

export interface AutomatizacionDeMensajes {
  readonly id: string;
  readonly evento: EventoAutomatizable;
  readonly plantillaId: string | null;
  readonly plantilla: string | null;
  readonly canalId: string | null;
  readonly canal: string | null;
  readonly activa: boolean;
}

/* ------------------------------------------------------------------ */
/* Lo que se dice de cada cosa                                         */
/* ------------------------------------------------------------------ */

export const COMO_SE_DICE_EL_CANAL: Readonly<Record<TipoDeCanal, string>> = {
  whatsapp: 'WhatsApp Business',
  sms: 'SMS',
  correo: 'Correo',
  // "Manual" es el canal de quien anota lo que se habló por teléfono o en el
  // mostrador. No manda nada; deja constancia, que es lo que hace falta para
  // que el historial de alguien no tenga huecos.
  manual: 'Anotado a mano',
};

export const COMO_SE_DICE_EL_ESTADO_DEL_CANAL: Readonly<Record<EstadoDeCanal, string>> = {
  sin_conectar: 'Sin conectar',
  conectado: 'Conectado',
  error: 'Con problemas',
};

export const COMO_SE_DICE_EL_MENSAJE: Readonly<Record<EstadoDelMensaje, string>> = {
  pendiente: 'Sin enviar',
  enviando: 'Enviando…',
  enviado: 'Enviado',
  entregado: 'Entregado',
  leido: 'Leído',
  fallido: 'No se pudo enviar',
};

export const COMO_SE_DICE_EL_EVENTO: Readonly<Record<EventoAutomatizable, string>> = {
  cita_nueva: 'Se agenda una cita',
  cita_confirmada: 'Se confirma una cita',
  cita_cancelada: 'Se cancela una cita',
  cita_reagendada: 'Se reagenda una cita',
  cita_recordatorio: 'Recordatorio de cita',
  inscripcion_nueva: 'Alguien se inscribe a un curso',
  pago_registrado: 'Se registra un pago',
  seguimiento: 'Seguimiento después de una sesión',
  cliente_inactivo: 'Un cliente lleva tiempo sin venir',
};

export const BANDEJAS: ReadonlyArray<{ readonly clave: Bandeja; readonly etiqueta: string }> = [
  { clave: 'todas', etiqueta: 'Todas' },
  { clave: 'no_leidas', etiqueta: 'No leídos' },
  { clave: 'pendientes', etiqueta: 'Pendientes' },
  { clave: 'archivadas', etiqueta: 'Archivadas' },
];

/* ------------------------------------------------------------------ */
/* Lo que llega del servidor, ordenado                                 */
/* ------------------------------------------------------------------ */

const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const opcionalNumero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const opcional = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;
const bandera = (v: unknown): boolean => v === true;
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function ordenarEtiqueta(x: unknown): EtiquetaBreve {
  const y = objeto(x);
  return { id: texto(y['id']), nombre: texto(y['nombre']), color: opcional(y['color']) };
}

function ordenarUltimo(x: unknown): UltimoDelHilo | null {
  if (!x) return null;
  const y = objeto(x);
  return {
    cuerpo: texto(y['cuerpo']),
    direccion: texto(y['direccion']) === 'entrante' ? 'entrante' : 'saliente',
    estado: (texto(y['estado']) || 'pendiente') as EstadoDelMensaje,
    creadoEn: texto(y['creadoEn']),
  };
}

export function ordenarConversacion(x: unknown): ConversacionEnLista {
  const y = objeto(x);
  const tipo = texto(y['canalTipo']);
  return {
    id: texto(y['id']),
    clienteId: opcional(y['clienteId']),
    cliente: opcional(y['cliente']),
    contacto: texto(y['contacto']),
    canalId: opcional(y['canalId']),
    canal: opcional(y['canal']),
    canalTipo: tipo ? (tipo as TipoDeCanal) : null,
    estado: (texto(y['estado']) || 'abierta') as EstadoDeConversacion,
    favorita: bandera(y['favorita']),
    asignadaA: opcional(y['asignadaA']),
    asignada: opcional(y['asignada']),
    sinLeer: numero(y['sinLeer']),
    pendiente: bandera(y['pendiente']),
    ultimoEn: texto(y['ultimoEn']),
    ultimo: ordenarUltimo(y['ultimo']),
    etiquetas: lista(y['etiquetas']).map(ordenarEtiqueta),
  };
}

/**
 * La página de conversaciones.
 *
 * Una respuesta vacía sale en ceros y NO revienta: pasa de verdad el primer día
 * de uso, que es justo cuando alguien abre el módulo por primera vez.
 */
export function ordenarPaginaDeConversaciones(crudo: unknown): PaginaDeConversaciones {
  const r = objeto(crudo);
  const c = objeto(r['cuentas']);
  return {
    total: numero(r['total']),
    cuentas: {
      todas: numero(c['todas']),
      noLeidas: numero(c['noLeidas']),
      pendientes: numero(c['pendientes']),
      archivadas: numero(c['archivadas']),
    },
    filas: lista(r['filas']).map(ordenarConversacion),
  };
}

export function ordenarMensaje(x: unknown): MensajeDelHilo {
  const y = objeto(x);
  return {
    id: texto(y['id']),
    direccion: texto(y['direccion']) === 'entrante' ? 'entrante' : 'saliente',
    cuerpo: texto(y['cuerpo']),
    estado: (texto(y['estado']) || 'pendiente') as EstadoDelMensaje,
    error: opcional(y['error']),
    adjuntoUrl: opcional(y['adjuntoUrl']),
    adjuntoTipo: opcional(y['adjuntoTipo']),
    quien: opcional(y['quien']),
    difusionId: opcional(y['difusionId']),
    leidoEn: opcional(y['leidoEn']),
    creadoEn: texto(y['creadoEn']),
  };
}

export function ordenarResumen(crudo: unknown): ResumenDeMensajes {
  const r = objeto(crudo);
  return {
    activas: numero(r['activas']),
    clientesEnConversacion: numero(r['clientesEnConversacion']),
    enviados: numero(r['enviados']),
    enviadosAntes: numero(r['enviadosAntes']),
    recibidos: numero(r['recibidos']),
    recibidosAntes: numero(r['recibidosAntes']),
    pendientes: numero(r['pendientes']),
    hayComparacion: bandera(r['hayComparacion']),
    pedianRespuesta: numero(r['pedianRespuesta']),
    respondidas: numero(r['respondidas']),
    // Estos dos son `null` a propósito cuando no hay con qué calcularlos.
    tasaRespuesta: opcionalNumero(r['tasaRespuesta']),
    minutosDeRespuesta: opcionalNumero(r['minutosDeRespuesta']),
  };
}

export function ordenarPlantilla(x: unknown): PlantillaDeMensaje {
  const y = objeto(x);
  const tipo = texto(y['canalTipo']);
  return {
    id: texto(y['id']),
    nombre: texto(y['nombre']),
    categoria: texto(y['categoria']) || 'general',
    cuerpo: texto(y['cuerpo']),
    canalTipo: tipo ? (tipo as TipoDeCanal) : null,
    activa: bandera(y['activa']),
  };
}

export function ordenarCanal(x: unknown): CanalDeMensajes {
  const y = objeto(x);
  return {
    id: texto(y['id']),
    tipo: (texto(y['tipo']) || 'manual') as TipoDeCanal,
    nombre: texto(y['nombre']),
    identificador: opcional(y['identificador']),
    estado: (texto(y['estado']) || 'sin_conectar') as EstadoDeCanal,
    detalleError: opcional(y['detalleError']),
    ultimaSincronizacion: opcional(y['ultimaSincronizacion']),
    activo: bandera(y['activo']),
  };
}

export function ordenarAutomatizacion(x: unknown): AutomatizacionDeMensajes {
  const y = objeto(x);
  return {
    id: texto(y['id']),
    evento: (texto(y['evento']) || 'seguimiento') as EventoAutomatizable,
    plantillaId: opcional(y['plantillaId']),
    plantilla: opcional(y['plantilla']),
    canalId: opcional(y['canalId']),
    canal: opcional(y['canal']),
    activa: bandera(y['activa']),
  };
}

/* ------------------------------------------------------------------ */
/* Las llaves de cache                                                 */
/* ------------------------------------------------------------------ */

/**
 * TODO LO DEL MODULO CUELGA DEL PREFIJO "mensajes", y eso es lo que hace que
 * responder refresque a la vez la lista, los contadores de las cuatro pestañas
 * y las cifras de arriba. Con llaves sueltas, contestar un mensaje dejaba la
 * pestaña "Pendientes" diciendo 5 con cuatro conversaciones dentro.
 */
export function llaveDeConversaciones(
  negocio: string,
  bandeja: Bandeja,
  busqueda: string,
  etiqueta: string,
  pagina: number,
): string {
  return `mensajes:hilos:${negocio}:${bandeja}:${busqueda}:${etiqueta}:${pagina}`;
}

export function llaveDelHilo(conversacionId: string): string {
  return `mensajes:hilo:${conversacionId}`;
}

export function llaveDelResumenDeMensajes(negocio: string, desde: Fecha, hasta: Fecha): string {
  return `mensajes:resumen:${negocio}:${desde}:${hasta}`;
}

export function llaveDePlantillas(negocio: string): string {
  return `mensajes:plantillas:${negocio}`;
}

export function llaveDeCanales(negocio: string): string {
  return `mensajes:canales:${negocio}`;
}

export function llaveDeAutomatizaciones(negocio: string): string {
  return `mensajes:automatizaciones:${negocio}`;
}

/**
 * Lo que se refresca al tocar un mensaje.
 *
 * Va también `clientes` porque una conversación puede acabar de atarse a una
 * ficha, y `inicio` porque lo exige la guardia 11 — el buscador global y el
 * tablero leen de todos los módulos.
 */
export const LO_QUE_TOCA_UN_MENSAJE = ['mensajes', 'clientes', PREFIJO_DE_INICIO] as const;

/* ------------------------------------------------------------------ */
/* Lo que se le pide al servidor                                       */
/* ------------------------------------------------------------------ */

export async function traerConversaciones(
  negocio: string,
  bandeja: Bandeja,
  busqueda: string,
  etiqueta: string,
  pagina: number,
  porPagina: number,
): Promise<PaginaDeConversaciones> {
  const { data, error } = await supabase().rpc('conversaciones_del_centro', {
    p_negocio: negocio,
    p_bandeja: bandeja,
    p_busqueda: busqueda.trim() || null,
    p_etiqueta: etiqueta || null,
    p_pagina: pagina,
    p_por_pagina: porPagina,
  });
  reventar(error, 'cargar las conversaciones');
  return ordenarPaginaDeConversaciones(data);
}

export async function traerHilo(
  conversacionId: string,
  antesDe: string | null,
  limite: number,
): Promise<MensajeDelHilo[]> {
  const { data, error } = await supabase().rpc('mensajes_de_la_conversacion', {
    p_conversacion: conversacionId,
    p_antes_de: antesDe,
    p_limite: limite,
  });
  reventar(error, 'cargar la conversación');
  return lista(data).map(ordenarMensaje);
}

export async function traerResumenDeMensajes(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
): Promise<ResumenDeMensajes> {
  const { data, error } = await supabase().rpc('resumen_de_mensajes', {
    p_negocio: negocio,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
  });
  reventar(error, 'cargar el resumen de mensajes');
  return ordenarResumen(data);
}

/** Encuentra la conversación de ese contacto, o la abre. Ver la regla de oro. */
export async function abrirConversacion(
  negocio: string,
  contacto: string,
  canalId: string | null,
  clienteId: string | null,
): Promise<string> {
  const { data, error } = await supabase().rpc('abrir_conversacion', {
    p_negocio: negocio,
    p_contacto: contacto,
    p_canal: canalId,
    p_cliente: clienteId,
  });
  reventar(error, 'abrir la conversación');
  return String(data ?? '');
}

/**
 * Guarda un mensaje. NO lo envía.
 *
 * Queda en `pendiente` hasta que alguien hable con el proveedor. Es la
 * diferencia entre "lo tengo escrito" y "le llegó", y confundirlas es lo que
 * hace que alguien dé por avisado a un cliente que nunca supo nada.
 */
export async function guardarMensaje(
  negocio: string,
  conversacionId: string,
  direccion: DireccionDelMensaje,
  cuerpo: string,
  adjuntoUrl: string | null = null,
  adjuntoTipo: string | null = null,
): Promise<string> {
  const { data, error } = await supabase().rpc('guardar_mensaje', {
    p_negocio: negocio,
    p_conversacion: conversacionId,
    p_direccion: direccion,
    p_cuerpo: cuerpo,
    p_adjunto_url: adjuntoUrl,
    p_adjunto_tipo: adjuntoTipo,
    p_externo_id: null,
    p_difusion: null,
  });
  reventar(error, 'guardar el mensaje');
  return String(data ?? '');
}

export async function marcarConversacion(conversacionId: string, accion: string): Promise<void> {
  const { error } = await supabase().rpc('marcar_conversacion', {
    p_conversacion: conversacionId,
    p_accion: accion,
  });
  reventar(error, 'actualizar la conversación');
}

export async function asignarConversacion(
  conversacionId: string,
  membresiaId: string | null,
): Promise<void> {
  const { error } = await supabase().rpc('asignar_conversacion', {
    p_conversacion: conversacionId,
    p_membresia: membresiaId,
  });
  reventar(error, 'asignar la conversación');
}

export async function ligarClienteAConversacion(
  conversacionId: string,
  clienteId: string,
): Promise<void> {
  const { error } = await supabase().rpc('ligar_cliente_a_conversacion', {
    p_conversacion: conversacionId,
    p_cliente: clienteId,
  });
  reventar(error, 'ligar el cliente a la conversación');
}

export async function etiquetarConversacion(
  negocio: string,
  conversacionId: string,
  etiquetas: readonly string[],
): Promise<void> {
  const { error } = await supabase().rpc('etiquetar_conversacion', {
    p_negocio: negocio,
    p_conversacion: conversacionId,
    p_etiquetas: [...etiquetas],
  });
  reventar(error, 'guardar las etiquetas');
}

export async function traerPlantillas(negocio: string): Promise<PlantillaDeMensaje[]> {
  const { data, error } = await supabase().rpc('plantillas_del_centro', { p_negocio: negocio });
  reventar(error, 'cargar las plantillas');
  return lista(data).map(ordenarPlantilla);
}

export async function guardarPlantilla(
  negocio: string,
  id: string | null,
  datos: {
    nombre: string; categoria: string; cuerpo: string;
    canalTipo: TipoDeCanal | null; activa: boolean;
  },
): Promise<string> {
  const { data, error } = await supabase().rpc('guardar_plantilla', {
    p_negocio: negocio,
    p_id: id,
    p_nombre: datos.nombre,
    p_categoria: datos.categoria,
    p_cuerpo: datos.cuerpo,
    p_canal: datos.canalTipo,
    p_activa: datos.activa,
  });
  reventar(error, 'guardar la plantilla');
  return String(data ?? '');
}

export async function borrarPlantilla(plantillaId: string): Promise<void> {
  const { error } = await supabase().rpc('borrar_plantilla', { p_plantilla: plantillaId });
  reventar(error, 'quitar la plantilla');
}

export async function traerCanales(negocio: string): Promise<CanalDeMensajes[]> {
  const { data, error } = await supabase().rpc('canales_del_centro', { p_negocio: negocio });
  reventar(error, 'cargar los canales');
  return lista(data).map(ordenarCanal);
}

/**
 * Declara un canal. NO lo conecta.
 *
 * El estado lo mueve quien de verdad habló con el proveedor, que es un servidor
 * que todavía no existe. Poder marcarlo "conectado" desde aquí sería pintar un
 * candado cerrado en una puerta abierta: cada envío fallaría y la culpa
 * parecería del mensaje.
 */
export async function guardarCanal(
  negocio: string,
  id: string | null,
  datos: { tipo: TipoDeCanal; nombre: string; identificador: string; activo: boolean },
): Promise<string> {
  const { data, error } = await supabase().rpc('guardar_canal', {
    p_negocio: negocio,
    p_id: id,
    p_tipo: datos.tipo,
    p_nombre: datos.nombre,
    p_identificador: datos.identificador,
    p_activo: datos.activo,
  });
  reventar(error, 'guardar el canal');
  return String(data ?? '');
}

export async function traerAutomatizaciones(
  negocio: string,
): Promise<AutomatizacionDeMensajes[]> {
  const { data, error } = await supabase().rpc('automatizaciones_del_centro', {
    p_negocio: negocio,
  });
  reventar(error, 'cargar las automatizaciones');
  return lista(data).map(ordenarAutomatizacion);
}

export async function guardarAutomatizacion(
  negocio: string,
  id: string | null,
  datos: {
    evento: EventoAutomatizable; plantillaId: string | null;
    canalId: string | null; activa: boolean;
  },
): Promise<string> {
  const { data, error } = await supabase().rpc('guardar_automatizacion', {
    p_negocio: negocio,
    p_id: id,
    p_evento: datos.evento,
    p_plantilla: datos.plantillaId,
    p_canal: datos.canalId,
    p_activa: datos.activa,
  });
  reventar(error, 'guardar la automatización');
  return String(data ?? '');
}

export interface ResultadoDeDifusion {
  readonly id: string;
  readonly destinatarios: number;
  readonly fallidos: number;
}

/**
 * Manda una difusión SOLO a la lista que se le pasa.
 *
 * La lista llega ya revisada desde la pantalla y aquí no se amplía por ningún
 * motivo. Una difusión que "mejora" el conjunto por su cuenta es exactamente
 * como se le escribe a alguien que había pedido que no.
 */
export async function registrarDifusion(
  negocio: string,
  nombre: string,
  cuerpo: string,
  canalId: string | null,
  clientes: readonly string[],
): Promise<ResultadoDeDifusion> {
  const { data, error } = await supabase().rpc('registrar_difusion', {
    p_negocio: negocio,
    p_nombre: nombre,
    p_cuerpo: cuerpo,
    p_canal: canalId,
    p_clientes: [...clientes],
  });
  reventar(error, 'enviar la difusión');
  const r = objeto(data);
  return {
    id: texto(r['id']),
    destinatarios: numero(r['destinatarios']),
    fallidos: numero(r['fallidos']),
  };
}
