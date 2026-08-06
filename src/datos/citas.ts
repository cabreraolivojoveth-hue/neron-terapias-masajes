/**
 * El acceso a los datos de la agenda.
 *
 * Todo pasa por aqui. Ninguna pantalla habla directo con Supabase: si lo
 * hiciera, la misma consulta acabaria escrita de tres formas distintas y una
 * de las tres se olvidaria de filtrar por centro.
 *
 * LAS FECHAS VAN COMO TEXTO `dd/mm/aaaa` en toda la aplicacion y como `date`
 * en la base. La conversion vive en `fechas-de-la-base.ts` y en ningun otro
 * lado — se saco de aqui cuando Inicio empezo a leer ventas y cursos, porque
 * la alternativa era copiarla, y copiarla es como empieza el problema que esa
 * conversion existe para evitar.
 */

import type { Fecha } from '@neron/base/utils';
import { aBase, deBase, reventar } from './fechas-de-la-base.js';
import { clienteParaLaBase, supabase } from '../supabase.js';

/* ------------------------------------------------------------------ */
/* Las formas de datos que devuelve la base                            */
/* ------------------------------------------------------------------ */

export type EstadoDeCita = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_asistio';

export const ESTADOS: readonly { clave: EstadoDeCita; etiqueta: string }[] = [
  { clave: 'pendiente', etiqueta: 'Pendiente' },
  { clave: 'confirmada', etiqueta: 'Confirmada' },
  { clave: 'completada', etiqueta: 'Completada' },
  { clave: 'cancelada', etiqueta: 'Cancelada' },
  { clave: 'no_asistio', etiqueta: 'No asistió' },
];

export function etiquetaDeEstado(estado: string): string {
  return ESTADOS.find((e) => e.clave === estado)?.etiqueta ?? estado;
}

export interface CitaEnAgenda {
  /**
   * QUE TIPO DE EVENTO ES.
   *
   * La agenda del centro contiene DOS cosas: citas individuales y sesiones de
   * curso. Fingir que una sesion es una cita mas obligaria a inventarle un
   * cliente y un servicio, y a que cancelarla desde la agenda hiciera algo
   * raro con el curso. Se pintan distinto y se abren distinto.
   */
  readonly tipo: 'cita' | 'sesion';
  /** Solo en las sesiones: a que curso pertenece. */
  readonly cursoId: string | null;
  readonly id: string;
  readonly fecha: Fecha;
  readonly horaInicio: string;
  readonly horaFin: string;
  readonly estado: EstadoDeCita;
  readonly notas: string | null;
  readonly clienteId: string;
  readonly cliente: string;
  readonly clienteTelefono: string | null;
  readonly clienteCorreo: string | null;
  readonly servicioId: string;
  readonly servicio: string;
  readonly servicioMinutos: number;
  readonly servicioPrecio: number;
  readonly profesionalId: string | null;
  readonly profesional: string | null;
}

export interface ClienteBreve {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly correo: string | null;
}

export interface ServicioBreve {
  readonly id: string;
  readonly nombre: string;
  readonly duracionMin: number;
  readonly precioCentavos: number;
  readonly activo: boolean;
}

export interface ProfesionalBreve {
  readonly id: string;
  readonly nombre: string;
  readonly rol: string;
  /**
   * La CUENTA detras de esa membresia.
   *
   * Existe porque Ventas necesita saber cual de estas personas es la que esta
   * cobrando: la sesion sabe el `usuarioId`, pero la venta guarda el id de la
   * MEMBRESIA. Sin este puente, el vendedor arrancaria vacio y cada ticket
   * saldria sin decir quien lo hizo.
   */
  readonly usuarioId: string;
}

export interface Historial {
  readonly completadas: number;
  readonly canceladas: number;
  readonly noAsistio: number;
  readonly ultima: { readonly fecha: string; readonly servicio: string } | null;
  readonly proxima: {
    readonly id: string;
    readonly fecha: string;
    readonly hora: string;
    readonly servicio: string;
  } | null;
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export interface FiltrosDeAgenda {
  readonly profesionalId?: string | null;
  readonly servicioId?: string | null;
  readonly estado?: string | null;
}

/** La llave de cache. Todo lo que cambia el resultado tiene que estar aqui. */
export function llaveDeCitas(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
  filtros: FiltrosDeAgenda = {},
): string {
  return [
    'citas', negocio, desde, hasta,
    filtros.profesionalId ?? '', filtros.servicioId ?? '', filtros.estado ?? '',
  ].join(':');
}

export async function traerCitas(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
  filtros: FiltrosDeAgenda = {},
): Promise<CitaEnAgenda[]> {
  const { data, error } = await supabase().rpc('citas_del_rango', {
    p_negocio: negocio,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
    p_profesional: filtros.profesionalId ?? null,
    p_servicio: filtros.servicioId ?? null,
    p_estado: filtros.estado ?? null,
  });
  reventar(error, 'cargar la agenda');
  const citas = ((data ?? []) as CitaEnAgenda[]).map((c) => ({
    ...c, tipo: 'cita' as const, cursoId: null, fecha: deBase(c.fecha),
  }));

  /**
   * LAS SESIONES DE CURSO SALEN EN LA MISMA AGENDA.
   *
   * Se CONSULTAN, no se copian. Crear una cita espejo por cada sesion
   * garantiza que el dia que alguien reprograme la sesion, la copia se quede
   * con la fecha vieja y haya dos calendarios diciendo cosas distintas.
   *
   * El filtro por servicio o por estado de cita NO aplica a las sesiones: son
   * otra cosa. Con uno de esos puesto, la agenda enseña citas y ya — que es lo
   * que alguien pidio.
   */
  if (filtros.servicioId || filtros.estado) return citas;

  const { data: crudas, error: fallo } = await supabase().rpc('sesiones_del_rango', {
    p_negocio: negocio,
    p_desde: aBase(desde),
    p_hasta: aBase(hasta),
    p_profesional: filtros.profesionalId ?? null,
  });
  reventar(fallo, 'cargar las sesiones de curso');

  const sesiones = (Array.isArray(crudas) ? crudas : []).map((s) =>
    comoCita(s as Record<string, unknown>),
  );
  return [...citas, ...sesiones];
}

/**
 * Una sesion de curso, con la forma que la agenda sabe pintar.
 *
 * Los huecos que una sesion no tiene se llenan con lo que SI significa algo:
 * en el renglon de "quien" van los alumnos, y en el de "que" va el curso. Se
 * deja `tipo` para que la pantalla no la trate como cita.
 */
export function comoCita(s: Record<string, unknown>): CitaEnAgenda {
  const t = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
  const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const alumnos = n(s['alumnos']);
  const inicio = t(s['horaInicio']).slice(0, 5);
  const fin = t(s['horaFin']).slice(0, 5);
  return {
    tipo: 'sesion',
    cursoId: t(s['cursoId']) || null,
    id: t(s['id']),
    fecha: deBase(s['fecha']),
    horaInicio: inicio,
    horaFin: fin,
    // El estado de una sesion se traduce al de una cita SOLO para el color.
    // La palabra que se lee sale de `tipo`, no de aqui.
    estado: (t(s['estado']) === 'cancelada'
      ? 'cancelada'
      : t(s['estado']) === 'impartida'
        ? 'completada'
        : 'confirmada') as EstadoDeCita,
    notas: null,
    clienteId: '',
    cliente: alumnos === 1 ? '1 alumno' : `${alumnos} alumnos`,
    clienteTelefono: null,
    clienteCorreo: null,
    servicioId: '',
    servicio: t(s['curso']),
    servicioMinutos: minutosEntre(inicio, fin),
    servicioPrecio: 0,
    profesionalId: t(s['profesionalId']) || null,
    profesional: t(s['profesional']) || null,
  };
}

/** `09:00` y `15:00` → 360. Sirve para que la sesion ocupe su alto real. */
export function minutosEntre(inicio: string, fin: string): number {
  const a = /^(\d{2}):(\d{2})$/.exec(inicio);
  const b = /^(\d{2}):(\d{2})$/.exec(fin);
  if (!a || !b) return 0;
  return Math.max(0, (Number(b[1]) * 60 + Number(b[2])) - (Number(a[1]) * 60 + Number(a[2])));
}

export async function traerClientes(negocio: string): Promise<ClienteBreve[]> {
  const { data, error } = await supabase()
    .from('cliente')
    .select('id, nombre, telefono, correo')
    .eq('negocio_id', negocio)
    .eq('eliminado', false)
    .order('nombre');
  reventar(error, 'cargar los pacientes');
  return (data ?? []) as ClienteBreve[];
}

export async function traerServicios(negocio: string): Promise<ServicioBreve[]> {
  const { data, error } = await supabase()
    .from('servicio')
    .select('id, nombre, duracion_min, precio_centavos, activo')
    .eq('negocio_id', negocio)
    .eq('eliminado', false)
    .order('nombre');
  reventar(error, 'cargar los servicios');
  return ((data ?? []) as Record<string, unknown>[]).map((s) => ({
    id: String(s['id']),
    nombre: String(s['nombre']),
    duracionMin: Number(s['duracion_min']),
    precioCentavos: Number(s['precio_centavos']),
    activo: Boolean(s['activo']),
  }));
}

/**
 * Las personas del centro que pueden atender.
 *
 * Salen de las membresias ACTIVAS: no hay una tabla de terapeutas aparte
 * porque en un centro chico son las mismas personas que usan el sistema.
 * Cuando el centro necesite terapeutas que no entran al sistema, sera un
 * bloque con su propia tabla — no un campo de texto suelto aqui.
 */
export async function traerProfesionales(negocio: string): Promise<ProfesionalBreve[]> {
  const { data, error } = await supabase()
    .from('membresia')
    .select('id, nombre, rol, usuario_id')
    .eq('negocio_id', negocio)
    .eq('activo', true)
    .eq('eliminado', false)
    .order('nombre');
  reventar(error, 'cargar a las terapeutas');
  return ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    id: String(m['id']),
    nombre: String(m['nombre']),
    rol: String(m['rol']),
    usuarioId: String(m['usuario_id']),
  }));
}

export async function traerHistorial(clienteId: string): Promise<Historial> {
  const { data, error } = await supabase().rpc('historial_del_cliente', { p_cliente: clienteId });
  reventar(error, 'cargar el historial');
  return (data ?? { completadas: 0, canceladas: 0, noAsistio: 0, ultima: null, proxima: null }) as Historial;
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

export interface CitaNueva {
  readonly negocioId: string;
  readonly clienteId: string;
  readonly servicioId: string;
  readonly profesionalId: string | null;
  readonly fecha: Fecha;
  readonly horaInicio: string;
  readonly notas?: string;
}

/**
 * El mensaje que ve la persona cuando la base rechaza por choque de horario.
 *
 * El error crudo dice `conflicting key value violates exclusion constraint
 * "cita_sin_choque"`. Eso no le sirve a nadie en un mostrador.
 */
function traducir(e: unknown): Error {
  const mensaje = (e as Error).message ?? '';
  if (mensaje.includes('cita_sin_choque')) {
    return new Error(
      'Ese horario acaba de ocuparse con esa terapeuta. Escoge otra hora u otra persona.',
    );
  }
  if (mensaje.includes('mismo_negocio')) {
    return new Error('El paciente o el servicio no son de este centro.');
  }
  return e as Error;
}

export async function crearCita(cita: CitaNueva): Promise<string> {
  try {
    const { data, error } = await supabase()
      .from('cita')
      .insert([{
        negocio_id: cita.negocioId,
        cliente_id: cita.clienteId,
        servicio_id: cita.servicioId,
        profesional_id: cita.profesionalId,
        fecha: aBase(cita.fecha),
        hora_inicio: cita.horaInicio,
        // La hora de fin la calcula el disparador de la base desde la
        // duracion del servicio. Se manda la de inicio para que la corrija.
        hora_fin: cita.horaInicio,
        notas: cita.notas ?? null,
      }])
      .select('id');
    reventar(error, 'guardar la cita');
    return String((data as { id: string }[] | null)?.[0]?.id ?? '');
  } catch (e) {
    throw traducir(e);
  }
}

export async function reagendar(
  citaId: string,
  fecha: Fecha,
  horaInicio: string,
  profesionalId?: string | null,
  motivo?: string,
): Promise<void> {
  try {
    const { error } = await supabase().rpc('reagendar_cita', {
      p_cita: citaId,
      p_fecha: aBase(fecha),
      p_hora_inicio: horaInicio,
      p_profesional: profesionalId ?? null,
      p_motivo: motivo ?? null,
    });
    reventar(error, 'mover la cita');
  } catch (e) {
    throw traducir(e);
  }
}

export async function cambiarEstado(
  citaId: string,
  estado: EstadoDeCita,
  motivo?: string,
): Promise<void> {
  const { error } = await supabase().rpc('cambiar_estado_cita', {
    p_cita: citaId,
    p_estado: estado,
    p_motivo: motivo ?? null,
  });
  reventar(error, 'cambiar el estado de la cita');
}

/**
 * Da de alta un paciente y devuelve su id.
 *
 * Existe para el flujo de "crear cliente sin salir de la cita": lo guarda en
 * CLIENTES —la tabla de verdad, la misma que usa todo el sistema— y devuelve
 * el id para dejarlo seleccionado. No hay ningun "cliente de agenda".
 */
export async function crearCliente(
  negocio: string,
  datos: { nombre: string; telefono?: string; correo?: string },
): Promise<ClienteBreve> {
  const { data, error } = await supabase()
    .from('cliente')
    .insert([{
      negocio_id: negocio,
      nombre: datos.nombre.trim(),
      telefono: datos.telefono?.trim() || null,
      correo: datos.correo?.trim() || null,
    }])
    .select('id, nombre, telefono, correo');
  reventar(error, 'dar de alta al paciente');
  return (data as ClienteBreve[])[0]!;
}

/** Se usa desde las pruebas para comprobar que el cliente esta enchufado. */
export const _cliente = clienteParaLaBase;
