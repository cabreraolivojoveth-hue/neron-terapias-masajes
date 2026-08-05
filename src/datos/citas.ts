/**
 * El acceso a los datos de la agenda.
 *
 * Todo pasa por aqui. Ninguna pantalla habla directo con Supabase: si lo
 * hiciera, la misma consulta acabaria escrita de tres formas distintas y una
 * de las tres se olvidaria de filtrar por centro.
 *
 * LAS FECHAS VAN COMO TEXTO `dd/mm/aaaa` en toda la aplicacion y como `date`
 * en la base. La conversion ocurre SOLO aqui, en dos funciones. Es la leccion
 * mas cara de las fechas: en cuanto la conversion se reparte, alguien usa un
 * `new Date(texto)` y la cita se mueve un dia segun la zona horaria de quien
 * abrio la pantalla.
 */

import { aISO, desdeISO, type Fecha } from '@neron/base/utils';
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
/* Fechas: la conversion vive en DOS funciones y en ningun lado mas    */
/* ------------------------------------------------------------------ */

/** `dd/mm/aaaa` → `aaaa-mm-dd`, que es lo que entiende la base. */
const aBase = (f: Fecha): string => aISO(f);

/**
 * Lo que devuelve la base → `dd/mm/aaaa`.
 *
 * El controlador de Postgres puede devolver una columna `date` como texto o
 * como objeto Date segun la version. Se aceptan las dos: convertir un Date a
 * texto con `toISOString()` lo pasa por UTC y en México le resta un dia.
 */
function deBase(valor: unknown): Fecha {
  if (valor instanceof Date) {
    const a = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return desdeISO(`${a}-${m}-${d}`);
  }
  return desdeISO(String(valor).slice(0, 10));
}

function reventar(error: { message: string } | null, donde: string): void {
  if (error) throw new Error(`${donde}: ${error.message}`);
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
  return ((data ?? []) as CitaEnAgenda[]).map((c) => ({ ...c, fecha: deBase(c.fecha) }));
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
    .select('id, nombre, rol')
    .eq('negocio_id', negocio)
    .eq('activo', true)
    .eq('eliminado', false)
    .order('nombre');
  reventar(error, 'cargar a las terapeutas');
  return (data ?? []) as ProfesionalBreve[];
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
