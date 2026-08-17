/**
 * EL ACCESO A DATOS DE RECORDATORIOS.
 *
 * RECORDATORIOS NO ES DUEÑO DE NADIE. Guarda `entidad_tipo` y `entidad_id` —a
 * que cosa se refiere— y NUNCA el nombre, el telefono ni el correo de esa cosa.
 * El nombre se resuelve en el servidor, en cada lectura. Copiarlo aqui seria
 * exactamente el error que el bloque 0 se molesto en hacer imposible: el dia
 * que una paciente se cambie el apellido, sus recordatorios seguirian diciendo
 * el viejo y nadie sabria por que.
 *
 * "VENCIDO" NO ES UN ESTADO GUARDADO. Los estados de la base son tres
 * —`pendiente`, `hecho`, `descartado`— y vencido es `fecha < hoy` con el
 * primero. Se calcula en el servidor y llega en `vencido`. Guardarlo obligaria
 * a un proceso de medianoche que, el dia que no corra, dejaria la pantalla
 * diciendo "pendiente" de algo que vencio hace una semana.
 *
 * LA LISTA SE PAGINA EN EL SERVIDOR, no en el navegador. Bajarse los mil
 * doscientos recordatorios de tres años para enseñar diez es lo que hace que la
 * pantalla tarde en abrir justo cuando el centro ya lleva tiempo usandola.
 *
 * LAS FECHAS VIAJAN COMO `dd/mm/aaaa` y las horas como `HH:mm`, igual que en
 * todo el sistema. La traduccion contra la base vive en `fechas-de-la-base.ts`
 * y en ningun otro lado — un `new Date(texto)` suelto en una pantalla es lo que
 * mueve un recordatorio un dia segun quien lo abra.
 */

import { hora24aLegible, type Fecha, type Hora24 } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, deBase, reventar } from './fechas-de-la-base.js';
import { numero, texto, opcional, lista } from './lo-que-llega-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Los vocabularios                                                    */
/* ------------------------------------------------------------------ */

export type PrioridadDeRecordatorio = 'baja' | 'normal' | 'alta' | 'urgente';

export const PRIORIDADES: readonly PrioridadDeRecordatorio[] = [
  'baja',
  'normal',
  'alta',
  'urgente',
];

export const COMO_SE_DICE_LA_PRIORIDAD: Readonly<Record<PrioridadDeRecordatorio, string>> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

/**
 * Lo que pesa cada prioridad al ordenar. Menor va primero.
 *
 * SE ORDENA POR NUMERO Y NO POR NOMBRE porque alfabeticamente "alta" va antes
 * que "urgente" — y eso pondria lo urgente debajo de lo alto, que es justo al
 * reves de lo unico que la prioridad tiene que conseguir.
 */
export const PESO_DE_LA_PRIORIDAD: Readonly<Record<PrioridadDeRecordatorio, number>> = {
  urgente: 0,
  alta: 1,
  normal: 2,
  baja: 3,
};

/**
 * LOS ESTADOS SON LOS TRES DEL BLOQUE 0, y no se tocan.
 *
 * En la base se llaman `pendiente`, `hecho` y `descartado`. En la pantalla se
 * leen "Pendiente", "Completado" y "Cancelado", que es como los llama quien los
 * usa. La traduccion pasa AQUI, una vez: renombrarlos en la base habria roto
 * los dos disparadores del bloque 0 que ya escriben en esta tabla.
 */
export type EstadoDeRecordatorio = 'pendiente' | 'hecho' | 'descartado';

export const COMO_SE_DICE_EL_ESTADO: Readonly<Record<EstadoDeRecordatorio, string>> = {
  pendiente: 'Pendiente',
  hecho: 'Completado',
  descartado: 'Cancelado',
};

export type EntidadDeRecordatorio =
  | 'cliente'
  | 'cita'
  | 'venta'
  | 'curso'
  | 'producto'
  | 'servicio'
  | 'gasto';

export const ENTIDADES: readonly EntidadDeRecordatorio[] = [
  'cliente',
  'cita',
  'venta',
  'curso',
  'producto',
  'servicio',
  'gasto',
];

export const COMO_SE_DICE_LA_ENTIDAD: Readonly<Record<EntidadDeRecordatorio, string>> = {
  cliente: 'Cliente',
  cita: 'Cita',
  venta: 'Venta',
  curso: 'Curso',
  producto: 'Producto',
  servicio: 'Servicio',
  gasto: 'Gasto',
};

/**
 * A que modulo lleva cada relacion.
 *
 * VIVE EN UN SOLO SITIO porque lo consultan la tabla, el panel de detalle y el
 * costado. Con tres copias, el dia que Ventas se mudo dentro de Caja habrian
 * quedado dos enlaces llevando a un modulo que ya no existe — y un enlace
 * muerto no falla: solo manda a Inicio sin decir por que.
 */
export const MODULO_DE_LA_ENTIDAD: Readonly<Record<EntidadDeRecordatorio, string>> = {
  cliente: 'clientes',
  cita: 'agenda',
  // Ventas vive DENTRO de Caja desde que se unieron en el mostrador.
  venta: 'caja',
  curso: 'cursos',
  producto: 'productos',
  servicio: 'servicios',
  gasto: 'gastos',
};

export type FrecuenciaDeRepeticion = 'diario' | 'semanal' | 'mensual' | 'anual' | 'personalizado';

export const FRECUENCIAS: readonly FrecuenciaDeRepeticion[] = [
  'diario',
  'semanal',
  'mensual',
  'anual',
  'personalizado',
];

export const COMO_SE_DICE_LA_FRECUENCIA: Readonly<Record<FrecuenciaDeRepeticion, string>> = {
  diario: 'Diario',
  semanal: 'Semanal',
  mensual: 'Mensual',
  anual: 'Anual',
  personalizado: 'Personalizado',
};

export type EstadoDeRepeticion = 'activo' | 'pausado' | 'finalizado';

export const COMO_SE_DICE_LA_REPETICION: Readonly<Record<EstadoDeRepeticion, string>> = {
  activo: 'Activa',
  pausado: 'Pausada',
  finalizado: 'Terminada',
};

export type EventoAutomatizable =
  | 'cita_nueva'
  | 'cliente_nuevo'
  | 'venta_pendiente'
  | 'stock_bajo'
  | 'curso_proximo';

export const EVENTOS: readonly EventoAutomatizable[] = [
  'cita_nueva',
  'cliente_nuevo',
  'venta_pendiente',
  'stock_bajo',
  'curso_proximo',
];

export const COMO_SE_DICE_EL_EVENTO: Readonly<Record<EventoAutomatizable, string>> = {
  cita_nueva: 'Se agenda una cita',
  cliente_nuevo: 'Se da de alta un cliente',
  venta_pendiente: 'Una venta se queda en borrador',
  stock_bajo: 'Un producto llega a su mínimo',
  curso_proximo: 'Se acerca el inicio de un curso',
};

/** De que modulo sale cada evento. Se dice en Configuracion para que se entienda. */
export const DE_DONDE_SALE_EL_EVENTO: Readonly<Record<EventoAutomatizable, string>> = {
  cita_nueva: 'Agenda',
  cliente_nuevo: 'Clientes',
  venta_pendiente: 'Caja',
  stock_bajo: 'Productos',
  curso_proximo: 'Cursos',
};

/**
 * Cuanto antes puede avisar el sistema.
 *
 * `1440` es un dia. Se guarda en minutos y no en un texto ("un dia antes")
 * porque el calculo del aviso resta minutos: un texto obligaria a una tabla de
 * equivalencias en el navegador, que es donde se desincronizaria con la base.
 */
export const ANTICIPACIONES: readonly { readonly minutos: number; readonly etiqueta: string }[] = [
  { minutos: 0, etiqueta: 'Al momento' },
  { minutos: 5, etiqueta: '5 minutos antes' },
  { minutos: 15, etiqueta: '15 minutos antes' },
  { minutos: 30, etiqueta: '30 minutos antes' },
  { minutos: 60, etiqueta: '1 hora antes' },
  { minutos: 1440, etiqueta: '1 día antes' },
];

export type ColumnaDeOrden = 'urgencia' | 'fecha' | 'prioridad' | 'estado' | 'creacion' | 'responsable';

export const ORDENES: readonly { readonly clave: ColumnaDeOrden; readonly etiqueta: string }[] = [
  { clave: 'urgencia', etiqueta: 'Lo que urge primero' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'prioridad', etiqueta: 'Prioridad' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'creacion', etiqueta: 'Cuándo se creó' },
  { clave: 'responsable', etiqueta: 'Responsable' },
];

export type PestanaDeRecordatorios =
  | 'todos'
  | 'pendientes'
  | 'hoy'
  | 'proximos'
  | 'completados';

export const PESTANAS: readonly { readonly clave: PestanaDeRecordatorios; readonly etiqueta: string }[] = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'pendientes', etiqueta: 'Pendientes' },
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: 'proximos', etiqueta: 'Próximos' },
  { clave: 'completados', etiqueta: 'Completados' },
];

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

export interface RecordatorioEnLista {
  readonly id: string;
  readonly titulo: string;
  readonly detalle: string | null;
  readonly notas: string | null;
  readonly fecha: Fecha;
  /** `HH:mm`, o `null` cuando es un recordatorio de todo el día. */
  readonly hora: Hora24 | null;
  readonly prioridad: PrioridadDeRecordatorio;
  readonly estado: EstadoDeRecordatorio;
  /** Lo calcula el servidor. No se guarda: ver la cabecera del archivo. */
  readonly vencido: boolean;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly categoriaColor: string | null;
  readonly responsableId: string | null;
  readonly responsable: string | null;
  readonly entidadTipo: EntidadDeRecordatorio | null;
  readonly entidadId: string | null;
  /** Resuelto al leer. NUNCA se guarda una copia. */
  readonly entidadNombre: string | null;
  /** El teléfono o el correo del paciente, para poder escribirle sin otro viaje. */
  readonly entidadContacto: string | null;
  readonly recurrenteId: string | null;
  readonly recurrencia: FrecuenciaDeRepeticion | null;
  readonly automatizacionId: string | null;
  readonly origenTipo: string | null;
  readonly anticipacionMin: number | null;
  readonly notificadoEn: string | null;
  readonly completadoEn: string | null;
  readonly completadoPor: string | null;
  readonly creadoPor: string | null;
  readonly creadoEn: string;
  readonly actualizadoEn: string | null;
}

export interface PaginaDeRecordatorios {
  readonly filas: readonly RecordatorioEnLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
}

export interface GrupoDeRecordatorios {
  readonly id: string | null;
  readonly nombre: string;
  readonly color?: string | null;
  readonly cuantos: number;
  readonly hechos: number;
  readonly vencidos?: number;
}

export interface ProximoRecordatorio {
  readonly id: string;
  readonly titulo: string;
  readonly fecha: Fecha;
  readonly hora: Hora24 | null;
  readonly prioridad: PrioridadDeRecordatorio;
  readonly entidadTipo: EntidadDeRecordatorio | null;
  readonly entidadNombre: string | null;
  readonly categoria: string | null;
  readonly vencido: boolean;
}

export interface ResumenDeRecordatorios {
  readonly diasDeProximos: number;
  readonly pendientes: number;
  readonly hoy: number;
  readonly vencidos: number;
  readonly proximos: number;
  readonly completados: number;
  readonly cancelados: number;
  readonly total: number;
  /**
   * `null` cuando todavia no se ha completado nada.
   *
   * No es lo mismo que cero, y la diferencia se ve: con cero la tarjeta diria
   * "se resuelven al instante" de un centro que no ha cerrado ni uno.
   */
  readonly horasPromedio: number | null;
  readonly porCategoria: readonly GrupoDeRecordatorios[];
  readonly porResponsable: readonly GrupoDeRecordatorios[];
  readonly proximosRecordatorios: readonly ProximoRecordatorio[];
  readonly consejo: string | null;
}

export interface RepeticionDeRecordatorio {
  readonly id: string;
  readonly titulo: string;
  readonly detalle: string | null;
  readonly notas: string | null;
  readonly hora: Hora24 | null;
  readonly prioridad: PrioridadDeRecordatorio;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly responsableId: string | null;
  readonly responsable: string | null;
  readonly entidadTipo: EntidadDeRecordatorio | null;
  readonly entidadId: string | null;
  readonly frecuencia: FrecuenciaDeRepeticion;
  readonly intervalo: number;
  /** Días ISO: 1 lunes … 7 domingo. Vacío = el mismo día en que empezó. */
  readonly diasSemana: readonly number[];
  readonly fechaInicio: Fecha;
  readonly fechaFin: Fecha | null;
  readonly repeticiones: number | null;
  readonly generados: number;
  readonly proximaFecha: Fecha;
  readonly estado: EstadoDeRepeticion;
  readonly anticipacionMin: number | null;
}

export interface AjustesDeRecordatorios {
  readonly avisarEnNavegador: boolean;
  readonly anticipacionMin: number;
  readonly horaPorOmision: Hora24;
  readonly avisarAlResponsable: boolean;
  readonly avisarAlReasignar: boolean;
  readonly diasDeProximos: number;
  readonly ordenPorOmision: ColumnaDeOrden;
  readonly consejo: string | null;
}

export const AJUSTES_DE_ARRANQUE: AjustesDeRecordatorios = {
  avisarEnNavegador: false,
  anticipacionMin: 30,
  horaPorOmision: '09:00',
  avisarAlResponsable: true,
  avisarAlReasignar: true,
  diasDeProximos: 7,
  ordenPorOmision: 'urgencia',
  consejo: null,
};

export interface AutomatizacionDeRecordatorios {
  readonly id: string;
  readonly evento: EventoAutomatizable;
  readonly activa: boolean;
  readonly plantillaTitulo: string;
  readonly plantillaDetalle: string | null;
  readonly diasAntes: number;
  readonly hora: Hora24 | null;
  readonly prioridad: PrioridadDeRecordatorio;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly responsableId: string | null;
  readonly responsable: string | null;
  /** Cuántos recordatorios ha creado ya. Se cuenta, no se guarda. */
  readonly creados: number;
}

export interface EventoDelHistorial {
  readonly id: string;
  readonly accion: string;
  readonly antes: Readonly<Record<string, unknown>> | null;
  readonly despues: Readonly<Record<string, unknown>> | null;
  readonly usuario: string | null;
  readonly creadoEn: string;
}

/**
 * LO QUE REPORTES LE PREGUNTA A RECORDATORIOS.
 *
 * REPORTES NO CUENTA POR SU CUENTA. Si tuviera su propia consulta contra la
 * tabla, el dia que aqui cambie que significa "vencido" —o si los cancelados
 * cuentan— las dos pantallas dirian cifras distintas del mismo mes. La
 * definicion vive en un solo sitio: `cumplimiento_de_recordatorios`.
 *
 * `cumplimiento` y `horasPromedio` llegan en `null` cuando no hay con que
 * calcularlos. Un "0% de cumplimiento" en un mes sin trabajo no es un dato: es
 * un reproche inventado.
 */
export interface CumplimientoDeRecordatorios {
  readonly creados: number;
  readonly completados: number;
  readonly pendientes: number;
  readonly vencidos: number;
  readonly cancelados: number;
  readonly cumplimiento: number | null;
  readonly horasPromedio: number | null;
  readonly porResponsable: readonly GrupoDeRecordatorios[];
  readonly porCategoria: readonly GrupoDeRecordatorios[];
}

/** Un recordatorio visto desde OTRO modulo: el expediente, la ficha de la cita. */
export interface RecordatorioLigado {
  readonly id: string;
  readonly titulo: string;
  readonly detalle: string | null;
  readonly fecha: Fecha;
  readonly hora: Hora24 | null;
  readonly prioridad: PrioridadDeRecordatorio;
  readonly estado: EstadoDeRecordatorio;
  readonly categoria: string | null;
  readonly responsable: string | null;
}

/* ------------------------------------------------------------------ */
/* Lo que se manda al guardar                                          */
/* ------------------------------------------------------------------ */

export interface DatosDeRecordatorio {
  readonly titulo: string;
  readonly detalle: string;
  readonly fecha: Fecha;
  readonly hora: string;
  readonly prioridad: PrioridadDeRecordatorio;
  readonly categoriaId: string;
  readonly responsableId: string;
  readonly entidadTipo: string;
  readonly entidadId: string;
  readonly notas: string;
  /** Vacío = usar la anticipación del centro. */
  readonly anticipacionMin: string;
  /** Si el formulario está armando una regla en vez de un recordatorio suelto. */
  readonly repetir: boolean;
  readonly frecuencia: FrecuenciaDeRepeticion;
  readonly intervalo: string;
  readonly diasSemana: readonly number[];
  readonly fechaFin: string;
  readonly repeticiones: string;
}

export const RECORDATORIO_VACIO: DatosDeRecordatorio = {
  titulo: '',
  detalle: '',
  fecha: '',
  hora: '',
  prioridad: 'normal',
  categoriaId: '',
  responsableId: '',
  entidadTipo: '',
  entidadId: '',
  notas: '',
  anticipacionMin: '',
  repetir: false,
  frecuencia: 'semanal',
  intervalo: '1',
  diasSemana: [],
  fechaFin: '',
  repeticiones: '',
};

/* ------------------------------------------------------------------ */
/* Las validaciones — aqui para decirlo bien, y en la base para que sea
   verdad                                                              */
/* ------------------------------------------------------------------ */

/**
 * Que le falta a un recordatorio para poder guardarse.
 *
 * DEVUELVE UN ERROR POR CAMPO, no un mensaje suelto. "Revisa los datos" hace
 * que la persona los mire todos buscando cual esta mal.
 *
 * ESTO NO ES LA DEFENSA. `guardar_recordatorio` valida lo mismo en el servidor
 * y las restricciones de la tabla lo vuelven a comprobar. Aqui se valida para
 * decirlo bien y a tiempo; alli para que sea verdad aunque alguien mande la
 * peticion a mano.
 */
export function loQueFaltaDelRecordatorio(
  d: DatosDeRecordatorio,
): Readonly<Record<string, string>> {
  const falta: Record<string, string> = {};

  const titulo = d.titulo.trim();
  if (titulo === '') falta['titulo'] = 'Escribe de qué es el recordatorio.';
  else if (titulo.length > 160) falta['titulo'] = 'El título no puede pasar de 160 letras.';

  if (d.fecha.trim() === '') falta['fecha'] = 'Escoge la fecha del recordatorio.';

  // UNA HORA A MEDIAS NO SE GUARDA. `<input type="time">` puede quedarse en un
  // texto incompleto si alguien escribe a mano, y una hora ilegible acaba
  // guardandose como medianoche: el aviso saldria de madrugada.
  if (d.hora.trim() !== '' && !/^\d{2}:\d{2}$/.test(d.hora.trim())) {
    falta['hora'] = 'La hora tiene que ser como 14:30.';
  }

  // Una relacion a medias deja un renglon que dice "relacionado con una cita" y
  // no puede abrir ninguna.
  if (d.entidadTipo !== '' && d.entidadId === '') {
    falta['entidad'] = 'Escoge con cuál se relaciona, o quita la relación.';
  }

  if (d.repetir) {
    const intervalo = Number(d.intervalo);
    if (!Number.isFinite(intervalo) || intervalo < 1 || intervalo > 365) {
      falta['intervalo'] = 'Repite cada 1 vez como mínimo.';
    }
    if (d.frecuencia === 'personalizado' && d.diasSemana.length === 0) {
      falta['diasSemana'] = 'Escoge al menos un día de la semana.';
    }
    if (d.fechaFin !== '' && d.fecha !== '' && esAntes(d.fechaFin, d.fecha)) {
      falta['fechaFin'] = 'La repetición no puede terminar antes de empezar.';
    }
    if (d.repeticiones !== '') {
      const veces = Number(d.repeticiones);
      if (!Number.isFinite(veces) || veces < 1) {
        falta['repeticiones'] = 'El número de veces tiene que ser mayor que cero.';
      }
    }
  }

  return falta;
}

/**
 * Compara dos `dd/mm/aaaa` sin pasar por `new Date`.
 *
 * Pasarlas por `Date` es lo que hace que una fecha se mueva un dia segun la
 * zona horaria de quien abrio la pantalla. Se comparan como `aaaa-mm-dd`, que
 * ordena bien como texto.
 */
export function esAntes(a: Fecha, b: Fecha): boolean {
  const iso = (f: Fecha): string => f.split('/').reverse().join('-');
  return iso(a) < iso(b);
}

/* ------------------------------------------------------------------ */
/* La traduccion de lo que llega                                       */
/* ------------------------------------------------------------------ */

/**
 * La base devuelve `09:00:00`; adentro se usa `HH:mm`.
 *
 * El recorte pasa AQUI y no en cada componente, porque un `HH:mm:ss` metido en
 * un `<input type="time">` funciona en unos navegadores y en otros deja el
 * campo vacio sin decir nada.
 */
export function comoHora(v: unknown): Hora24 | null {
  const t = texto(v);
  if (t === '') return null;
  return t.slice(0, 5);
}

/** La hora legible del renglon. Sin hora se dice, no se inventa una. */
export function horaEnPalabras(hora: Hora24 | null): string {
  return hora === null ? 'Todo el día' : hora24aLegible(hora);
}

export function ordenarRecordatorio(crudo: unknown): RecordatorioEnLista {
  const r = (crudo ?? {}) as Record<string, unknown>;
  return {
    id: texto(r['id']),
    titulo: texto(r['titulo']),
    detalle: opcional(r['detalle']),
    notas: opcional(r['notas']),
    fecha: deBase(r['fecha']),
    hora: comoHora(r['hora']),
    prioridad: (opcional(r['prioridad']) ?? 'normal') as PrioridadDeRecordatorio,
    estado: (opcional(r['estado']) ?? 'pendiente') as EstadoDeRecordatorio,
    vencido: r['vencido'] === true,
    categoriaId: opcional(r['categoriaId']),
    categoria: opcional(r['categoria']),
    categoriaColor: opcional(r['categoriaColor']),
    responsableId: opcional(r['responsableId']),
    responsable: opcional(r['responsable']),
    entidadTipo: opcional(r['entidadTipo']) as EntidadDeRecordatorio | null,
    entidadId: opcional(r['entidadId']),
    entidadNombre: opcional(r['entidadNombre']),
    entidadContacto: opcional(r['entidadContacto']),
    recurrenteId: opcional(r['recurrenteId']),
    recurrencia: opcional(r['recurrencia']) as FrecuenciaDeRepeticion | null,
    automatizacionId: opcional(r['automatizacionId']),
    origenTipo: opcional(r['origenTipo']),
    anticipacionMin: r['anticipacionMin'] === null || r['anticipacionMin'] === undefined
      ? null
      : numero(r['anticipacionMin']),
    notificadoEn: opcional(r['notificadoEn']),
    completadoEn: opcional(r['completadoEn']),
    completadoPor: opcional(r['completadoPor']),
    creadoPor: opcional(r['creadoPor']),
    creadoEn: texto(r['creadoEn']),
    actualizadoEn: opcional(r['actualizadoEn']),
  };
}

export function ordenarPagina(crudo: unknown): PaginaDeRecordatorios {
  const p = (crudo ?? {}) as Record<string, unknown>;
  const filas = Array.isArray(p['filas']) ? (p['filas'] as unknown[]) : [];
  return {
    filas: filas.map(ordenarRecordatorio),
    total: numero(p['total']),
    pagina: Math.max(1, numero(p['pagina']) || 1),
    porPagina: Math.max(1, numero(p['porPagina']) || 10),
  };
}

/**
 * El resumen vacio: todo en cero y ninguna lista con nada dentro.
 *
 * Se usa cuando el servidor contesta con un hueco. No se inventa un solo
 * numero: un cero es una respuesta honesta y una lista vacia tambien.
 */
export const RESUMEN_VACIO: ResumenDeRecordatorios = {
  diasDeProximos: 7,
  pendientes: 0,
  hoy: 0,
  vencidos: 0,
  proximos: 0,
  completados: 0,
  cancelados: 0,
  total: 0,
  horasPromedio: null,
  porCategoria: [],
  porResponsable: [],
  proximosRecordatorios: [],
  consejo: null,
};

export function ordenarResumenDeRecordatorios(crudo: unknown): ResumenDeRecordatorios {
  if (!crudo || typeof crudo !== 'object') return RESUMEN_VACIO;
  const r = crudo as Record<string, unknown>;
  const lista = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

  return {
    diasDeProximos: numero(r['diasDeProximos']) || 7,
    pendientes: numero(r['pendientes']),
    hoy: numero(r['hoy']),
    vencidos: numero(r['vencidos']),
    proximos: numero(r['proximos']),
    completados: numero(r['completados']),
    cancelados: numero(r['cancelados']),
    total: numero(r['total']),
    // El `null` de la base se CONSERVA. Convertirlo a cero reintroduce el
    // "se resuelven al instante" que la base se molesto en evitar.
    horasPromedio:
      r['horasPromedio'] === null || r['horasPromedio'] === undefined
        ? null
        : numero(r['horasPromedio']),
    porCategoria: lista(r['porCategoria']).map((c) => ({
      id: opcional(c['id']),
      nombre: texto(c['nombre']) || 'Sin categoría',
      color: opcional(c['color']),
      cuantos: numero(c['cuantos']),
      hechos: numero(c['hechos']),
    })),
    porResponsable: lista(r['porResponsable']).map((m) => ({
      id: opcional(m['id']),
      nombre: texto(m['nombre']) || 'Sin responsable',
      cuantos: numero(m['cuantos']),
      hechos: numero(m['hechos']),
      vencidos: numero(m['vencidos']),
    })),
    proximosRecordatorios: lista(r['proximosRecordatorios']).map((p) => ({
      id: texto(p['id']),
      titulo: texto(p['titulo']),
      fecha: deBase(p['fecha']),
      hora: comoHora(p['hora']),
      prioridad: (opcional(p['prioridad']) ?? 'normal') as PrioridadDeRecordatorio,
      entidadTipo: opcional(p['entidadTipo']) as EntidadDeRecordatorio | null,
      entidadNombre: opcional(p['entidadNombre']),
      categoria: opcional(p['categoria']),
      vencido: p['vencido'] === true,
    })),
    consejo: opcional(r['consejo']),
  };
}

export function ordenarRepeticion(crudo: unknown): RepeticionDeRecordatorio {
  const r = (crudo ?? {}) as Record<string, unknown>;
  const dias = Array.isArray(r['diasSemana']) ? (r['diasSemana'] as unknown[]) : [];
  return {
    id: texto(r['id']),
    titulo: texto(r['titulo']),
    detalle: opcional(r['detalle']),
    notas: opcional(r['notas']),
    hora: comoHora(r['hora']),
    prioridad: (opcional(r['prioridad']) ?? 'normal') as PrioridadDeRecordatorio,
    categoriaId: opcional(r['categoriaId']),
    categoria: opcional(r['categoria']),
    responsableId: opcional(r['responsableId']),
    responsable: opcional(r['responsable']),
    entidadTipo: opcional(r['entidadTipo']) as EntidadDeRecordatorio | null,
    entidadId: opcional(r['entidadId']),
    frecuencia: (opcional(r['frecuencia']) ?? 'semanal') as FrecuenciaDeRepeticion,
    intervalo: numero(r['intervalo']) || 1,
    diasSemana: dias.map((d) => numero(d)).filter((d) => d >= 1 && d <= 7),
    fechaInicio: deBase(r['fechaInicio']),
    fechaFin: r['fechaFin'] ? deBase(r['fechaFin']) : null,
    repeticiones:
      r['repeticiones'] === null || r['repeticiones'] === undefined
        ? null
        : numero(r['repeticiones']),
    generados: numero(r['generados']),
    proximaFecha: deBase(r['proximaFecha']),
    estado: (opcional(r['estado']) ?? 'activo') as EstadoDeRepeticion,
    anticipacionMin:
      r['anticipacionMin'] === null || r['anticipacionMin'] === undefined
        ? null
        : numero(r['anticipacionMin']),
  };
}

export function ordenarAjustes(crudo: unknown): AjustesDeRecordatorios {
  if (!crudo || typeof crudo !== 'object') return AJUSTES_DE_ARRANQUE;
  const a = crudo as Record<string, unknown>;
  return {
    avisarEnNavegador: a['avisarEnNavegador'] === true,
    anticipacionMin: numero(a['anticipacionMin']),
    horaPorOmision: comoHora(a['horaPorOmision']) ?? '09:00',
    // Los dos avisos vienen encendidos de la base; solo un `false` explicito
    // los apaga. Un `undefined` de una base sin actualizar no puede dejar a
    // nadie sin enterarse de lo que le asignaron.
    avisarAlResponsable: a['avisarAlResponsable'] !== false,
    avisarAlReasignar: a['avisarAlReasignar'] !== false,
    diasDeProximos: numero(a['diasDeProximos']) || 7,
    ordenPorOmision: (opcional(a['ordenPorOmision']) ?? 'urgencia') as ColumnaDeOrden,
    consejo: opcional(a['consejo']),
  };
}

export function ordenarAutomatizacion(crudo: unknown): AutomatizacionDeRecordatorios {
  const a = (crudo ?? {}) as Record<string, unknown>;
  return {
    id: texto(a['id']),
    evento: (opcional(a['evento']) ?? 'cita_nueva') as EventoAutomatizable,
    activa: a['activa'] === true,
    plantillaTitulo: texto(a['plantillaTitulo']),
    plantillaDetalle: opcional(a['plantillaDetalle']),
    diasAntes: numero(a['diasAntes']),
    hora: comoHora(a['hora']),
    prioridad: (opcional(a['prioridad']) ?? 'normal') as PrioridadDeRecordatorio,
    categoriaId: opcional(a['categoriaId']),
    categoria: opcional(a['categoria']),
    responsableId: opcional(a['responsableId']),
    responsable: opcional(a['responsable']),
    creados: numero(a['creados']),
  };
}

/* ------------------------------------------------------------------ */
/* Las llaves del cache                                                */
/* ------------------------------------------------------------------ */

/**
 * TODAS EMPIEZAN CON `recordatorios:`.
 *
 * Asi un solo `invalidar('recordatorios')` refresca la lista, el resumen, las
 * repeticiones y los paneles ligados de los demas modulos a la vez. Sin el
 * prefijo comun habria que acordarse de cada llave — y de la que se olvide
 * nadie se entera: solo se queda vieja.
 */
export const PREFIJO_DE_RECORDATORIOS = 'recordatorios';

export interface ConsultaDeLista {
  readonly pestana: PestanaDeRecordatorios;
  readonly busqueda: string;
  readonly categoriaId: string;
  readonly responsableId: string;
  readonly prioridad: string;
  readonly entidadTipo: string;
  readonly desde: string;
  readonly hasta: string;
  readonly soloRecurrentes: boolean;
  readonly soloAutomaticos: boolean;
  readonly orden: ColumnaDeOrden;
  readonly descendente: boolean;
  readonly pagina: number;
  readonly porPagina: number;
}

export function llaveDeLaLista(negocio: string, hoy: Fecha, c: ConsultaDeLista): string {
  // La llave lleva TODO lo que cambia la respuesta, incluido el dia: sin el, una
  // pestaña abierta desde ayer seguiria enseñando los "de hoy" de ayer despues
  // de la medianoche, con toda la cara de estar al dia.
  return [
    PREFIJO_DE_RECORDATORIOS,
    'lista',
    negocio,
    hoy,
    c.pestana,
    c.busqueda,
    c.categoriaId,
    c.responsableId,
    c.prioridad,
    c.entidadTipo,
    c.desde,
    c.hasta,
    c.soloRecurrentes ? '1' : '0',
    c.soloAutomaticos ? '1' : '0',
    c.orden,
    c.descendente ? 'desc' : 'asc',
    String(c.pagina),
    String(c.porPagina),
  ].join(':');
}

export function llaveDelResumenDeRecordatorios(negocio: string, hoy: Fecha): string {
  return `${PREFIJO_DE_RECORDATORIOS}:resumen:${negocio}:${hoy}`;
}

export function llaveDeRepeticiones(negocio: string): string {
  return `${PREFIJO_DE_RECORDATORIOS}:repeticiones:${negocio}`;
}

export function llaveDeAjustes(negocio: string): string {
  return `${PREFIJO_DE_RECORDATORIOS}:ajustes:${negocio}`;
}

export function llaveDeAutomatizaciones(negocio: string): string {
  return `${PREFIJO_DE_RECORDATORIOS}:automatizaciones:${negocio}`;
}

export function llaveDelHistorial(recordatorioId: string): string {
  return `${PREFIJO_DE_RECORDATORIOS}:historial:${recordatorioId}`;
}

export function llaveDeLigados(negocio: string, tipo: string, entidadId: string): string {
  return `${PREFIJO_DE_RECORDATORIOS}:ligados:${negocio}:${tipo}:${entidadId}`;
}

/**
 * QUE SE REFRESCA CUANDO ALGO CAMBIA EN RECORDATORIOS.
 *
 * `inicio` esta en la lista porque el tablero cuenta los pendientes y la
 * campana los vencidos: sin ese prefijo, completar un recordatorio dejaria la
 * campana con el punto puesto hasta que alguien recargue — y una campana que
 * avisa de algo ya resuelto es la que se deja de mirar.
 */
export const LO_QUE_TOCA_UN_RECORDATORIO = [
  PREFIJO_DE_RECORDATORIOS,
  PREFIJO_DE_INICIO,
] as const;

/* ------------------------------------------------------------------ */
/* Traer                                                               */
/* ------------------------------------------------------------------ */

export async function traerRecordatorios(
  negocio: string,
  hoy: Fecha,
  c: ConsultaDeLista,
): Promise<PaginaDeRecordatorios> {
  const { data, error } = await supabase().rpc('recordatorios_del_centro', {
    p_negocio: negocio,
    p_hoy: aBase(hoy),
    p_pestana: c.pestana,
    p_busqueda: c.busqueda.trim() || null,
    p_categoria: c.categoriaId || null,
    p_responsable: c.responsableId || null,
    p_prioridad: c.prioridad || null,
    p_entidad: c.entidadTipo || null,
    p_desde: c.desde ? aBase(c.desde) : null,
    p_hasta: c.hasta ? aBase(c.hasta) : null,
    p_solo_recurrentes: c.soloRecurrentes,
    p_solo_automaticos: c.soloAutomaticos,
    p_orden: c.orden,
    p_desc: c.descendente,
    p_pagina: c.pagina,
    p_por_pagina: c.porPagina,
  });
  reventar(error, 'cargar los recordatorios');
  return ordenarPagina(data);
}

export async function traerResumenDeRecordatorios(
  negocio: string,
  hoy: Fecha,
): Promise<ResumenDeRecordatorios> {
  const { data, error } = await supabase().rpc('resumen_de_recordatorios', {
    p_negocio: negocio,
    p_hoy: aBase(hoy),
  });
  reventar(error, 'cargar el resumen de recordatorios');
  return ordenarResumenDeRecordatorios(data);
}

export async function traerRepeticiones(negocio: string): Promise<RepeticionDeRecordatorio[]> {
  const { data, error } = await supabase().rpc('recordatorios_recurrentes_del_centro', {
    p_negocio: negocio,
  });
  reventar(error, 'cargar las repeticiones');
  return (Array.isArray(data) ? data : []).map(ordenarRepeticion);
}

export async function traerAjustes(negocio: string): Promise<AjustesDeRecordatorios> {
  const { data, error } = await supabase().rpc('ajustes_de_recordatorios', { p_negocio: negocio });
  reventar(error, 'cargar la configuración de recordatorios');
  return ordenarAjustes(data);
}

export async function traerAutomatizaciones(
  negocio: string,
): Promise<AutomatizacionDeRecordatorios[]> {
  const { data, error } = await supabase().rpc('automatizaciones_de_recordatorios', {
    p_negocio: negocio,
  });
  reventar(error, 'cargar las automatizaciones');
  return (Array.isArray(data) ? data : []).map(ordenarAutomatizacion);
}

export async function traerHistorial(recordatorioId: string): Promise<EventoDelHistorial[]> {
  const { data, error } = await supabase().rpc('historial_del_recordatorio', {
    p_id: recordatorioId,
  });
  reventar(error, 'cargar el historial del recordatorio');
  return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: texto(e['id']),
    accion: texto(e['accion']),
    antes: (e['antes'] ?? null) as Readonly<Record<string, unknown>> | null,
    despues: (e['despues'] ?? null) as Readonly<Record<string, unknown>> | null,
    usuario: opcional(e['usuario']),
    creadoEn: texto(e['creado_en']),
  }));
}

/**
 * Los recordatorios de una cosa concreta — lo que leen los demas modulos.
 *
 * ES LA MITAD DE LA CONEXION QUE CASI SIEMPRE FALTA. Abrir el paciente desde el
 * recordatorio es lo facil; ver los recordatorios desde el expediente del
 * paciente es lo que hace que el modulo sirva de verdad.
 */
export async function traerLigados(
  negocio: string,
  tipo: EntidadDeRecordatorio,
  entidadId: string,
  incluirCerrados = false,
): Promise<RecordatorioLigado[]> {
  const { data, error } = await supabase().rpc('recordatorios_de_la_entidad', {
    p_negocio: negocio,
    p_tipo: tipo,
    p_entidad: entidadId,
    p_incluir_cerrados: incluirCerrados,
  });
  reventar(error, 'cargar los recordatorios relacionados');
  return (Array.isArray(data) ? data : []).map((x) => {
    const r = x as Record<string, unknown>;
    return {
      id: texto(r['id']),
      titulo: texto(r['titulo']),
      detalle: opcional(r['detalle']),
      fecha: deBase(r['fecha']),
      hora: comoHora(r['hora']),
      prioridad: (opcional(r['prioridad']) ?? 'normal') as PrioridadDeRecordatorio,
      estado: (opcional(r['estado']) ?? 'pendiente') as EstadoDeRecordatorio,
      categoria: opcional(r['categoria']),
      responsable: opcional(r['responsable']),
    };
  });
}

export function llaveDelCumplimiento(negocio: string, desde: Fecha, hasta: Fecha): string {
  // Cuelga de `recordatorios:` como todo lo demas: cerrar uno refresca tambien
  // la seccion de Reportes que lo estaba contando.
  return `${PREFIJO_DE_RECORDATORIOS}:cumplimiento:${negocio}:${desde}:${hasta}`;
}

export async function traerCumplimiento(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
  hoy: Fecha,
): Promise<CumplimientoDeRecordatorios> {
  const { data, error } = await supabase().rpc('cumplimiento_de_recordatorios', {
    p_negocio: negocio,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
    p_hoy: aBase(hoy),
  });
  reventar(error, 'calcular el cumplimiento de los recordatorios');

  const c = (data ?? {}) as Record<string, unknown>;
  const lista = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  const grupo = (g: Record<string, unknown>): GrupoDeRecordatorios => ({
    id: opcional(g['id']),
    nombre: texto(g['nombre']) || 'Sin asignar',
    color: opcional(g['color']),
    cuantos: numero(g['cuantos']),
    hechos: numero(g['hechos']),
    vencidos: numero(g['vencidos']),
  });

  return {
    creados: numero(c['creados']),
    completados: numero(c['completados']),
    pendientes: numero(c['pendientes']),
    vencidos: numero(c['vencidos']),
    cancelados: numero(c['cancelados']),
    // Los dos `null` de la base se CONSERVAN: ver el comentario del tipo.
    cumplimiento:
      c['cumplimiento'] === null || c['cumplimiento'] === undefined
        ? null
        : numero(c['cumplimiento']),
    horasPromedio:
      c['horasPromedio'] === null || c['horasPromedio'] === undefined
        ? null
        : numero(c['horasPromedio']),
    porResponsable: lista(c['porResponsable']).map(grupo),
    porCategoria: lista(c['porCategoria']).map(grupo),
  };
}

/* ------------------------------------------------------------------ */
/* Escoger con que se relaciona                                        */
/* ------------------------------------------------------------------ */

export interface OpcionDeRelacion {
  readonly id: string;
  readonly nombre: string;
  /** Una linea corta para distinguir dos que se llaman parecido. */
  readonly pista: string | null;
}

/**
 * SE BUSCA, NO SE DESPLIEGA UNA LISTA.
 *
 * Un `<select>` con los pacientes del centro es comodo con doce y es inservible
 * con mil doscientos: hay que bajarlos todos para pintar un desplegable en el
 * que nadie encuentra a nadie. Aqui se escriben tres letras y la base contesta
 * con cinco.
 *
 * QUIEN NO PUEDE VER ALGO NO LO ENCUENTRA. No hay ni un filtro de permisos en
 * esta funcion: las reglas de fila de la base deciden que filas se entregan.
 * Filtrar en el navegador seria filtrar despues de haber bajado los datos.
 *
 * LAS CITAS SE BUSCAN POR FECHA y no por nombre: la tabla `cita` no guarda el
 * nombre del paciente —guarda su id, que es justo la regla— y buscar por el
 * obligaria a un join que PostgREST resuelve mal cuando el paciente esta
 * archivado. Con la fecha se encuentra igual, porque asi es como alguien se
 * acuerda de una cita.
 */
export async function buscarParaRelacionar(
  negocio: string,
  tipo: EntidadDeRecordatorio,
  aguja: string,
): Promise<OpcionDeRelacion[]> {
  const limpio = aguja.trim();
  if (limpio.length < 2) return [];
  // Se escapa lo que en `ilike` significa otra cosa: sin esto, escribir `%`
  // trae la tabla entera y `_` casa con cualquier letra.
  const patron = `%${limpio.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const bd = supabase();

  if (tipo === 'cita') {
    const { data, error } = await bd
      .from('cita')
      .select('id, fecha, hora_inicio, estado')
      .eq('negocio_id', negocio)
      .eq('eliminado', false)
      .order('fecha', { ascending: false })
      .limit(8);
    reventar(error, 'buscar citas');
    return ((data ?? []) as Record<string, unknown>[])
      .map((c) => ({
        id: texto(c['id']),
        nombre: `${deBase(c['fecha'])} · ${comoHora(c['hora_inicio']) ?? ''}`.trim(),
        pista: opcional(c['estado']),
      }))
      // El filtrado por texto se hace sobre lo que ya llego porque la etiqueta
      // se arma aqui: la base no guarda "05/08/2026 · 10:00" en ninguna columna.
      .filter((c) => c.nombre.includes(limpio));
  }

  const donde: Readonly<Record<string, { tabla: string; campo: string; pista: string | null }>> = {
    cliente: { tabla: 'cliente', campo: 'nombre', pista: 'telefono' },
    servicio: { tabla: 'servicio', campo: 'nombre', pista: null },
    producto: { tabla: 'producto', campo: 'nombre', pista: 'sku' },
    curso: { tabla: 'curso', campo: 'nombre', pista: 'estado' },
    venta: { tabla: 'venta', campo: 'folio', pista: 'estado' },
    gasto: { tabla: 'gasto', campo: 'descripcion', pista: 'referencia' },
  };
  const q = donde[tipo];
  if (!q) return [];

  const columnas = q.pista ? `id, ${q.campo}, ${q.pista}` : `id, ${q.campo}`;
  const { data, error } = await bd
    .from(q.tabla)
    .select(columnas)
    .eq('negocio_id', negocio)
    .eq('eliminado', false)
    .ilike(q.campo, patron)
    .order(q.campo)
    .limit(8);
  reventar(error, 'buscar con qué relacionar el recordatorio');

  /*
   * Se comprueba que sea un arreglo en vez de forzar el tipo.
   *
   * `select()` con una lista de columnas ARMADA EN TIEMPO DE EJECUCION deja al
   * cliente de Supabase sin poder deducir la forma, y lo que devuelve no encaja
   * con nada. Forzarlo seria la conversion a la fuerza que la guardia 5 prohibe
   * —y con razon: es la misma inseguridad repartida por veinte sitios—. Mirar
   * si de verdad es un arreglo cuesta una linea y ademas aguanta que el
   * servidor conteste cualquier cosa.
   */
  const crudo: unknown = data;
  const filas: Record<string, unknown>[] = Array.isArray(crudo)
    ? (crudo as Record<string, unknown>[])
    : [];
  return filas.map((f) => ({
    id: texto(f['id']),
    nombre: texto(f[q.campo]),
    pista: q.pista ? opcional(f[q.pista]) : null,
  }));
}

export function llaveDeRelaciones(negocio: string, tipo: string, texto: string): string {
  return `${PREFIJO_DE_RECORDATORIOS}:relacion:${negocio}:${tipo}:${texto.trim().toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/* Escribir                                                            */
/* ------------------------------------------------------------------ */

/** Los minutos de anticipacion escritos en el formulario. Vacio = los del centro. */
function anticipacionDe(d: DatosDeRecordatorio): number | null {
  if (d.anticipacionMin.trim() === '') return null;
  const n = Number(d.anticipacionMin);
  return Number.isFinite(n) ? n : null;
}

export async function guardarRecordatorio(
  negocio: string,
  id: string | null,
  d: DatosDeRecordatorio,
): Promise<string> {
  const { data, error } = await supabase().rpc('guardar_recordatorio', {
    p_negocio: negocio,
    p_id: id,
    p_titulo: d.titulo.trim().replace(/\s+/g, ' '),
    p_fecha: aBase(d.fecha),
    p_detalle: d.detalle.trim() || null,
    p_hora: d.hora.trim() || null,
    p_prioridad: d.prioridad,
    p_categoria: d.categoriaId || null,
    p_responsable: d.responsableId || null,
    p_entidad_tipo: d.entidadTipo || null,
    p_entidad_id: d.entidadId || null,
    p_notas: d.notas.trim() || null,
    p_anticipacion: anticipacionDe(d),
  });
  reventar(error, 'guardar el recordatorio');
  return String(data);
}

export async function completarRecordatorio(id: string, hecho: boolean): Promise<void> {
  const { error } = await supabase().rpc('completar_recordatorio', { p_id: id, p_hecho: hecho });
  reventar(error, hecho ? 'completar el recordatorio' : 'reabrir el recordatorio');
}

export async function posponerRecordatorio(
  id: string,
  fecha: Fecha,
  hora: string | null,
): Promise<void> {
  const { error } = await supabase().rpc('posponer_recordatorio', {
    p_id: id,
    p_fecha: aBase(fecha),
    p_hora: hora && hora.trim() !== '' ? hora : null,
  });
  reventar(error, 'posponer el recordatorio');
}

/** Cambia UNA cosa: responsable, prioridad o categoria. La base anota cual. */
export async function ajustarRecordatorio(
  id: string,
  que: 'responsable' | 'prioridad' | 'categoria' | 'avisado',
  valor: string,
): Promise<void> {
  const { error } = await supabase().rpc('ajustar_recordatorio', {
    p_id: id,
    p_que: que,
    p_valor: valor,
  });
  reventar(error, 'cambiar el recordatorio');
}

export async function cancelarRecordatorio(id: string, motivo: string): Promise<void> {
  const { error } = await supabase().rpc('cancelar_recordatorio', {
    p_id: id,
    p_motivo: motivo.trim() || null,
  });
  reventar(error, 'cancelar el recordatorio');
}

export async function eliminarRecordatorio(id: string): Promise<void> {
  const { error } = await supabase().rpc('eliminar_recordatorio', { p_id: id });
  reventar(error, 'eliminar el recordatorio');
}

export async function duplicarRecordatorio(id: string, fecha: Fecha | null): Promise<string> {
  const { data, error } = await supabase().rpc('duplicar_recordatorio', {
    p_id: id,
    p_fecha: fecha ? aBase(fecha) : null,
  });
  reventar(error, 'duplicar el recordatorio');
  return String(data);
}

export async function guardarRepeticion(
  negocio: string,
  id: string | null,
  d: DatosDeRecordatorio,
): Promise<string> {
  const intervalo = Number(d.intervalo);
  const veces = d.repeticiones.trim() === '' ? null : Number(d.repeticiones);
  const { data, error } = await supabase().rpc('guardar_recordatorio_recurrente', {
    p_negocio: negocio,
    p_id: id,
    p_titulo: d.titulo.trim().replace(/\s+/g, ' '),
    p_frecuencia: d.frecuencia,
    p_fecha_inicio: aBase(d.fecha),
    p_detalle: d.detalle.trim() || null,
    p_notas: d.notas.trim() || null,
    p_hora: d.hora.trim() || null,
    p_prioridad: d.prioridad,
    p_categoria: d.categoriaId || null,
    p_responsable: d.responsableId || null,
    p_entidad_tipo: d.entidadTipo || null,
    p_entidad_id: d.entidadId || null,
    p_intervalo: Number.isFinite(intervalo) && intervalo >= 1 ? Math.trunc(intervalo) : 1,
    // Solo el semanal y el personalizado usan dias sueltos. Mandarlos en un
    // mensual dejaria una regla que dice una cosa y hace otra.
    p_dias_semana:
      (d.frecuencia === 'semanal' || d.frecuencia === 'personalizado') && d.diasSemana.length > 0
        ? [...d.diasSemana]
        : null,
    p_fecha_fin: d.fechaFin ? aBase(d.fechaFin) : null,
    p_repeticiones: veces !== null && Number.isFinite(veces) && veces > 0 ? Math.trunc(veces) : null,
    p_anticipacion: anticipacionDe(d),
  });
  reventar(error, 'guardar la repetición');
  return String(data);
}

export async function marcarRepeticion(id: string, estado: EstadoDeRepeticion): Promise<void> {
  const { error } = await supabase().rpc('marcar_recordatorio_recurrente', {
    p_id: id,
    p_estado: estado,
  });
  reventar(error, 'cambiar el estado de la repetición');
}

/**
 * Crea las ocurrencias que ya tocaban.
 *
 * SE PUEDE LLAMAR CUANTAS VECES SE QUIERA, y por eso se llama al abrir la
 * pantalla en vez de montar un proceso aparte. La unicidad no la pone esta
 * llamada: la pone el indice `(recurrente_id, fecha)` de la base. Diez pestañas
 * abiertas a la vez no pueden crear dos veces el recordatorio del lunes.
 */
export async function generarRepeticiones(negocio: string, hoy: Fecha): Promise<number> {
  const { data, error } = await supabase().rpc('generar_recordatorios_recurrentes', {
    p_negocio: negocio,
    p_hoy: aBase(hoy),
  });
  reventar(error, 'generar las repeticiones');
  return Number(data ?? 0);
}

/**
 * Aplica las automatizaciones ENCENDIDAS.
 *
 * Sin ninguna encendida no crea nada, y es lo que permite llamarla al abrir la
 * pantalla sin miedo: un centro que no ha configurado nada no ve aparecer ni un
 * renglon. Los duplicados los impide un indice unico de la base.
 */
export async function generarAutomaticos(negocio: string, hoy: Fecha): Promise<number> {
  const { data, error } = await supabase().rpc('generar_recordatorios_automaticos', {
    p_negocio: negocio,
    p_hoy: aBase(hoy),
  });
  reventar(error, 'aplicar las automatizaciones');
  return Number(data ?? 0);
}

export async function guardarAjustes(
  negocio: string,
  a: AjustesDeRecordatorios,
): Promise<void> {
  const { error } = await supabase().rpc('guardar_ajustes_de_recordatorios', {
    p_negocio: negocio,
    p_avisar_navegador: a.avisarEnNavegador,
    p_anticipacion: a.anticipacionMin,
    p_hora_por_omision: a.horaPorOmision,
    p_avisar_responsable: a.avisarAlResponsable,
    p_avisar_reasignar: a.avisarAlReasignar,
    p_dias_proximos: a.diasDeProximos,
    p_orden: a.ordenPorOmision,
    p_consejo: a.consejo,
  });
  reventar(error, 'guardar la configuración de recordatorios');
}

export interface DatosDeAutomatizacion {
  readonly evento: EventoAutomatizable;
  readonly activa: boolean;
  readonly plantillaTitulo: string;
  readonly plantillaDetalle: string;
  readonly diasAntes: number;
  readonly hora: string;
  readonly prioridad: PrioridadDeRecordatorio;
  readonly categoriaId: string;
  readonly responsableId: string;
}

export async function guardarAutomatizacion(
  negocio: string,
  d: DatosDeAutomatizacion,
): Promise<string> {
  const { data, error } = await supabase().rpc('guardar_automatizacion_de_recordatorios', {
    p_negocio: negocio,
    p_evento: d.evento,
    p_activa: d.activa,
    p_titulo: d.plantillaTitulo.trim(),
    p_detalle: d.plantillaDetalle.trim() || null,
    p_dias_antes: d.diasAntes,
    p_hora: d.hora.trim() || null,
    p_prioridad: d.prioridad,
    p_categoria: d.categoriaId || null,
    p_responsable: d.responsableId || null,
  });
  reventar(error, 'guardar la automatización');
  return String(data);
}
