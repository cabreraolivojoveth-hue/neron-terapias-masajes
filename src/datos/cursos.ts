/**
 * EL ACCESO A DATOS DE CURSOS.
 *
 * `curso` es LA FUENTE DE VERDAD de lo que se imparte. Pero se apoya en cuatro
 * entidades separadas a proposito, porque juntarlas es lo que despues no se
 * puede deshacer:
 *
 *   curso           la DEFINICION: que se enseña, cuanto cuesta, cuanto cabe.
 *   sesion_curso    la EJECUCION: que dia, a que hora, con quien, donde.
 *   inscripcion     la RELACION de una persona con un curso.
 *   material_curso  lo que se reparte.
 *
 * EL ALUMNO ES UN CLIENTE. No hay tabla de alumnos: hay `cliente` con una
 * `inscripcion`. Con dos tablas de personas, la misma señora acaba capturada
 * dos veces —una porque vino a un masaje y otra porque tomo el taller— y su
 * historial queda partido en dos mitades que ya no se vuelven a juntar.
 *
 * INSCRIPCION Y PAGO SON COSAS DISTINTAS. Se puede estar inscrito y deber; se
 * puede haber pagado y despues cancelar. Por eso `estado` habla de la
 * inscripcion y `pagada` del dinero: son dos campos, no uno.
 *
 * Y EL CUPO SE COMPRUEBA EN LA BASE, dentro de la transaccion. Contar aqui y
 * luego insertar deja una ventana en la que dos personas compran el ultimo
 * lugar y el sabado llegan trece a un salon de doce sillas.
 */

import type { Fecha } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, deBase, reventar } from './fechas-de-la-base.js';
import { numero, numeroONulo, texto, opcional, lista, objeto, centavos } from './lo-que-llega-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

/**
 * El ciclo de vida de un curso.
 *
 * Se DERIVA de las fechas en la base; solo `cancelado` e `inactivo` se
 * guardan, porque no se deducen de un calendario. Un curso cancelado y uno que
 * simplemente termino no son lo mismo para nadie.
 */
export type VidaDeCurso = 'proximo' | 'activo' | 'finalizado' | 'cancelado' | 'inactivo';

export type Modalidad = 'presencial' | 'en_linea' | 'hibrido';

export type EstadoDeInscripcion = 'inscrito' | 'asistio' | 'cancelado' | 'lista_espera';

export interface CursoEnLista {
  readonly id: string;
  readonly nombre: string;
  readonly subtitulo: string | null;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly categoriaColor: string | null;
  readonly instructorId: string | null;
  readonly instructor: string | null;
  readonly fechaInicio: Fecha | null;
  readonly fechaFin: Fecha | null;
  /** Cuantas reuniones tiene programadas. Cero = todavia no se programaron. */
  readonly sesiones: number;
  readonly precioCentavos: number;
  /** `null` = sin limite de cupo. NUNCA 999999. */
  readonly cupo: number | null;
  readonly ocupados: number;
  readonly modalidad: Modalidad;
  readonly imagenUrl: string | null;
  /** El identificador de once caracteres, NUNCA la URL. Ver `cursos/video.ts`. */
  readonly videoYoutube: string | null;
  readonly vida: VidaDeCurso;
  readonly activo: boolean;
}

export interface PaginaDeCursos {
  readonly total: number;
  readonly filas: readonly CursoEnLista[];
}

export interface ResumenDeCursos {
  readonly total: number;
  readonly activos: number;
  readonly proximos: number;
  readonly alumnos: number;
  /** `null` cuando ningun curso vigente tiene cupo. Cero seria falso. */
  readonly ocupacionPromedio: number | null;
}

export interface AlumnoDelCurso {
  readonly id: string;
  readonly clienteId: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly estado: EstadoDeInscripcion;
  readonly origen: string;
  readonly inscritoEn: string;
  /** Si hay una venta detras. Es OTRA cosa que el estado de inscripcion. */
  readonly pagada: boolean;
}

export interface SesionDelCurso {
  readonly id: string;
  readonly titulo: string | null;
  readonly fecha: Fecha;
  readonly horaInicio: string;
  readonly horaFin: string;
  readonly instructorId: string | null;
  readonly instructor: string | null;
  readonly lugar: string | null;
  readonly estado: 'programada' | 'impartida' | 'cancelada';
}

export interface MaterialDelCurso {
  readonly id: string;
  readonly titulo: string;
  readonly tipo: 'enlace' | 'archivo' | 'nota';
  readonly url: string | null;
  readonly descripcion: string | null;
  readonly visibleParaAlumnos: boolean;
}

export interface FichaDeCurso {
  readonly id: string;
  readonly nombre: string;
  readonly subtitulo: string | null;
  readonly descripcion: string | null;
  readonly notas: string | null;
  readonly categoriaId: string | null;
  readonly categoria: string | null;
  readonly categoriaColor: string | null;
  readonly instructorId: string | null;
  readonly instructor: string | null;
  readonly fechaInicio: Fecha | null;
  readonly fechaFin: Fecha | null;
  readonly precioCentavos: number;
  readonly cupo: number | null;
  readonly ocupados: number;
  readonly enEspera: number;
  readonly modalidad: Modalidad;
  readonly lugar: string | null;
  readonly enlace: string | null;
  readonly imagenUrl: string | null;
  /**
   * EL IDENTIFICADOR DEL VIDEO, no su direccion.
   *
   * La direccion la arma la pantalla con `direccionDelReproductor`, y por eso
   * siempre apunta a YouTube: guardar una URL cualquiera y meterla en un
   * `iframe` dejaria incrustar el sitio que fuera dentro del sistema.
   */
  readonly videoYoutube: string | null;
  readonly estado: string;
  readonly activo: boolean;
  readonly vida: VidaDeCurso;
  readonly alumnos: readonly AlumnoDelCurso[];
  readonly sesiones: readonly SesionDelCurso[];
  readonly material: readonly MaterialDelCurso[];
}

export interface FiltrosDeCursos {
  readonly busqueda?: string;
  readonly vida?: VidaDeCurso | '';
  readonly categoriaId?: string;
  readonly instructorId?: string;
  readonly modalidad?: string;
  readonly conLugares?: boolean;
}

export interface DatosDeCurso {
  readonly nombre: string;
  readonly subtitulo: string;
  readonly descripcion: string;
  readonly categoriaId: string;
  readonly instructorId: string;
  readonly fechaInicio: string;
  readonly fechaFin: string;
  readonly precioCentavos: number;
  /** Vacio = sin limite. Se guarda como `null`, jamas como un numero enorme. */
  readonly cupo: number | null;
  readonly modalidad: Modalidad;
  readonly lugar: string;
  readonly enlace: string;
  readonly imagenUrl: string;
  /** Lo que la persona PEGO. La base lo convierte en identificador al guardar. */
  readonly videoUrl: string;
  readonly notas: string;
  readonly activo: boolean;
}

export interface DatosDeSesion {
  readonly titulo: string;
  readonly fecha: string;
  readonly horaInicio: string;
  readonly horaFin: string;
  readonly instructorId: string;
  readonly lugar: string;
  readonly estado: 'programada' | 'impartida' | 'cancelada';
}

export interface DatosDeMaterial {
  readonly titulo: string;
  readonly tipo: 'enlace' | 'archivo' | 'nota';
  readonly url: string;
  readonly descripcion: string;
  readonly visibleParaAlumnos: boolean;
}

/** Un curso visto desde el expediente de un cliente. */
export interface CursoDelCliente {
  readonly inscripcionId: string;
  readonly cursoId: string;
  readonly nombre: string;
  readonly subtitulo: string | null;
  readonly fechaInicio: Fecha | null;
  readonly fechaFin: Fecha | null;
  readonly estado: EstadoDeInscripcion;
  readonly pagada: boolean;
  readonly vida: VidaDeCurso;
}

/* ------------------------------------------------------------------ */
/* Ordenar lo que contesta el servidor                                 */
/* ------------------------------------------------------------------ */

const fecha = (v: unknown): Fecha | null => (v ? deBase(v) : null);

export const RESUMEN_DE_CURSOS_VACIO: ResumenDeCursos = {
  total: 0,
  activos: 0,
  proximos: 0,
  alumnos: 0,
  ocupacionPromedio: null,
};

export function ordenarResumenDeCursos(crudo: unknown): ResumenDeCursos {
  const r = objeto(crudo);
  if (!r) return RESUMEN_DE_CURSOS_VACIO;
  return {
    total: numero(r['total']),
    activos: numero(r['activos']),
    proximos: numero(r['proximos']),
    alumnos: numero(r['alumnos']),
    // Se CONSERVA el nulo: sin cursos con cupo no hay ocupacion promedio, y
    // "0%" seria una respuesta falsa.
    ocupacionPromedio: numeroONulo(r['ocupacionPromedio']),
  };
}

const VIDAS: readonly VidaDeCurso[] = ['proximo', 'activo', 'finalizado', 'cancelado', 'inactivo'];

const comoVida = (v: unknown): VidaDeCurso => {
  const t = texto(v);
  return (VIDAS as readonly string[]).includes(t) ? (t as VidaDeCurso) : 'proximo';
};

const comoModalidad = (v: unknown): Modalidad => {
  const t = texto(v);
  return t === 'en_linea' || t === 'hibrido' ? t : 'presencial';
};

export function ordenarCurso(crudo: unknown): CursoEnLista {
  const c = objeto(crudo) ?? {};
  return {
    id: texto(c['id']),
    nombre: texto(c['nombre']),
    subtitulo: opcional(c['subtitulo']),
    categoriaId: opcional(c['categoriaId']),
    categoria: opcional(c['categoria']),
    categoriaColor: opcional(c['categoriaColor']),
    instructorId: opcional(c['instructorId']),
    instructor: opcional(c['instructor']),
    fechaInicio: fecha(c['fechaInicio']),
    fechaFin: fecha(c['fechaFin']),
    sesiones: numero(c['sesiones']),
    precioCentavos: centavos(c['precioCentavos']),
    // El cupo nulo es "sin limite" y se CONSERVA nulo: convertirlo en cero
    // diria que no cabe nadie, que es justo lo contrario.
    cupo: numeroONulo(c['cupo']),
    ocupados: numero(c['ocupados']),
    modalidad: comoModalidad(c['modalidad']),
    imagenUrl: opcional(c['imagenUrl']),
    videoYoutube: opcional(c['videoYoutube']),
    vida: comoVida(c['vida']),
    activo: Boolean(c['activo']),
  };
}

/**
 * Los lugares que quedan.
 *
 * `null` cuando el curso NO tiene limite — que no es lo mismo que cero. Nunca
 * baja de cero: si por lo que sea hubiera mas inscritos que cupo, decir "-2
 * lugares" no le sirve a nadie en un mostrador.
 */
export function lugaresLibres(cupo: number | null, ocupados: number): number | null {
  if (cupo === null || !Number.isFinite(cupo)) return null;
  return Math.max(0, cupo - ocupados);
}

/** Si ya no cabe nadie. Sin cupo NUNCA esta lleno. */
export function estaLleno(cupo: number | null, ocupados: number): boolean {
  return cupo !== null && ocupados >= cupo;
}

/**
 * El porcentaje de ocupacion.
 *
 * `null` sin cupo: un curso sin limite no tiene porcentaje de ocupacion, y
 * dividir entre cero acaba impreso como "NaN%" en la pantalla de la dueña.
 */
export function ocupacionDe(cupo: number | null, ocupados: number): number | null {
  if (cupo === null || !Number.isFinite(cupo) || cupo <= 0) return null;
  return Math.round((ocupados / cupo) * 100);
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function llaveDeCursos(
  negocio: string,
  filtros: FiltrosDeCursos,
  pagina: number,
  porPagina: number,
): string {
  return [
    'cursos', negocio,
    filtros.busqueda ?? '', filtros.vida ?? '', filtros.categoriaId ?? '',
    filtros.instructorId ?? '', filtros.modalidad ?? '', filtros.conLugares ? '1' : '',
    pagina, porPagina,
  ].join(':');
}

export async function traerCursosDelCentro(
  negocio: string,
  filtros: FiltrosDeCursos,
  pagina: number,
  porPagina: number,
): Promise<PaginaDeCursos> {
  const { data, error } = await supabase().rpc('cursos_del_centro', {
    p_negocio: negocio,
    p_busqueda: filtros.busqueda?.trim() || null,
    p_estado: filtros.vida || null,
    p_categoria: filtros.categoriaId || null,
    p_instructor: filtros.instructorId || null,
    p_modalidad: filtros.modalidad || null,
    p_con_lugares: filtros.conLugares ? true : null,
    p_pagina: pagina,
    p_por_pagina: porPagina,
  });
  reventar(error, 'cargar los cursos');
  const r = objeto(data) ?? {};
  return { total: numero(r['total']), filas: lista(r['filas']).map(ordenarCurso) };
}

export function llaveDelResumenDeCursos(negocio: string): string {
  return `cursos:resumen:${negocio}`;
}

export async function traerResumenDeCursos(negocio: string): Promise<ResumenDeCursos> {
  const { data, error } = await supabase().rpc('resumen_cursos', { p_negocio: negocio });
  reventar(error, 'cargar el resumen de cursos');
  return ordenarResumenDeCursos(data);
}

export function llaveDeLaFichaDelCurso(cursoId: string): string {
  return `cursos:ficha:${cursoId}`;
}

export async function traerFichaDeCurso(cursoId: string): Promise<FichaDeCurso | null> {
  const { data, error } = await supabase().rpc('ficha_del_curso', { p_curso: cursoId });
  reventar(error, 'cargar la ficha del curso');
  const c = objeto(data);
  if (!c) return null;

  return {
    id: texto(c['id']),
    nombre: texto(c['nombre']),
    subtitulo: opcional(c['subtitulo']),
    descripcion: opcional(c['descripcion']),
    notas: opcional(c['notas']),
    categoriaId: opcional(c['categoriaId']),
    categoria: opcional(c['categoria']),
    categoriaColor: opcional(c['categoriaColor']),
    instructorId: opcional(c['instructorId']),
    instructor: opcional(c['instructor']),
    fechaInicio: fecha(c['fechaInicio']),
    fechaFin: fecha(c['fechaFin']),
    precioCentavos: centavos(c['precioCentavos']),
    cupo: numeroONulo(c['cupo']),
    ocupados: numero(c['ocupados']),
    enEspera: numero(c['enEspera']),
    modalidad: comoModalidad(c['modalidad']),
    lugar: opcional(c['lugar']),
    enlace: opcional(c['enlace']),
    imagenUrl: opcional(c['imagenUrl']),
    videoYoutube: opcional(c['videoYoutube']),
    estado: texto(c['estado']),
    activo: Boolean(c['activo']),
    vida: comoVida(c['vida']),
    alumnos: lista(c['alumnos']).map((a) => {
      const x = objeto(a) ?? {};
      return {
        id: texto(x['id']),
        clienteId: texto(x['clienteId']),
        nombre: texto(x['nombre']),
        telefono: opcional(x['telefono']),
        correo: opcional(x['correo']),
        estado: texto(x['estado']) as EstadoDeInscripcion,
        origen: texto(x['origen']),
        inscritoEn: texto(x['inscritoEn']),
        pagada: Boolean(x['pagada']),
      };
    }),
    sesiones: lista(c['sesiones']).map((s) => {
      const x = objeto(s) ?? {};
      return {
        id: texto(x['id']),
        titulo: opcional(x['titulo']),
        fecha: deBase(x['fecha']),
        // La base contesta `09:00:00`; en pantalla se leen cinco caracteres.
        horaInicio: texto(x['horaInicio']).slice(0, 5),
        horaFin: texto(x['horaFin']).slice(0, 5),
        instructorId: opcional(x['instructorId']),
        instructor: opcional(x['instructor']),
        lugar: opcional(x['lugar']),
        estado: (texto(x['estado']) || 'programada') as SesionDelCurso['estado'],
      };
    }),
    material: lista(c['material']).map((m) => {
      const x = objeto(m) ?? {};
      return {
        id: texto(x['id']),
        titulo: texto(x['titulo']),
        tipo: (texto(x['tipo']) || 'enlace') as MaterialDelCurso['tipo'],
        url: opcional(x['url']),
        descripcion: opcional(x['descripcion']),
        visibleParaAlumnos: Boolean(x['visibleParaAlumnos']),
      };
    }),
  };
}

export function llaveDeCursosDelCliente(clienteId: string): string {
  return `cursos:cliente:${clienteId}`;
}

export async function traerCursosDelCliente(clienteId: string): Promise<CursoDelCliente[]> {
  const { data, error } = await supabase().rpc('cursos_del_cliente', { p_cliente: clienteId });
  reventar(error, 'cargar los cursos del cliente');
  return lista(data).map((c) => {
    const x = objeto(c) ?? {};
    return {
      inscripcionId: texto(x['inscripcionId']),
      cursoId: texto(x['cursoId']),
      nombre: texto(x['nombre']),
      subtitulo: opcional(x['subtitulo']),
      fechaInicio: fecha(x['fechaInicio']),
      fechaFin: fecha(x['fechaFin']),
      estado: texto(x['estado']) as EstadoDeInscripcion,
      pagada: Boolean(x['pagada']),
      vida: comoVida(x['vida']),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

const aFechaBase = (f: string): string | null => (f ? aBase(f) : null);

export async function guardarCurso(
  negocio: string,
  id: string | null,
  datos: DatosDeCurso,
): Promise<void> {
  const { error } = await supabase().rpc('guardar_curso', {
    p_negocio: negocio,
    p_id: id,
    p_nombre: datos.nombre.trim().replace(/\s+/g, ' '),
    p_subtitulo: datos.subtitulo.trim() || null,
    p_descripcion: datos.descripcion.trim() || null,
    p_categoria: datos.categoriaId || null,
    p_instructor: datos.instructorId || null,
    p_inicio: aFechaBase(datos.fechaInicio),
    p_fin: aFechaBase(datos.fechaFin),
    p_precio: datos.precioCentavos,
    p_cupo: datos.cupo,
    p_modalidad: datos.modalidad,
    p_lugar: datos.lugar.trim() || null,
    p_enlace: datos.enlace.trim() || null,
    p_imagen: datos.imagenUrl.trim() || null,
    p_video: datos.videoUrl.trim() || null,
    p_notas: datos.notas.trim() || null,
    p_activo: datos.activo,
  });
  reventar(error, 'guardar el curso');
}

/**
 * Apagar o encender un curso. NO se borra.
 *
 * Un curso tiene inscripciones, ventas y sesiones colgando. Borrarlo de verdad
 * dejaria a los inscritos apuntando a un hueco y a los reportes sin de donde
 * sacar los ingresos del trimestre.
 */
export async function cambiarEstadoDeCurso(
  negocio: string,
  ficha: FichaDeCurso,
  activo: boolean,
): Promise<void> {
  await guardarCurso(negocio, ficha.id, {
    nombre: ficha.nombre,
    subtitulo: ficha.subtitulo ?? '',
    descripcion: ficha.descripcion ?? '',
    categoriaId: ficha.categoriaId ?? '',
    instructorId: ficha.instructorId ?? '',
    fechaInicio: ficha.fechaInicio ?? '',
    fechaFin: ficha.fechaFin ?? '',
    precioCentavos: ficha.precioCentavos,
    cupo: ficha.cupo,
    modalidad: ficha.modalidad,
    lugar: ficha.lugar ?? '',
    enlace: ficha.enlace ?? '',
    imagenUrl: ficha.imagenUrl ?? '',
    // Vuelve el IDENTIFICADOR, no la direccion. El campo lo acepta tal cual
    // —es una de las formas que entiende— y asi reabrir y guardar sin tocar
    // nada no pierde el video.
    videoUrl: ficha.videoYoutube ?? '',
    notas: ficha.notas ?? '',
    activo,
  });
}

/**
 * Inscribir a alguien.
 *
 * El cupo lo comprueba la BASE con el renglon del curso bloqueado. Si esta
 * lleno NO rechaza: manda a lista de espera, porque rechazar pierde al cliente
 * y apuntarlo deja constancia de cuanta demanda hubo de verdad.
 */
export async function inscribirEnCurso(
  negocio: string,
  cursoId: string,
  clienteId: string,
  origen = 'manual',
): Promise<EstadoDeInscripcion> {
  const { data, error } = await supabase().rpc('inscribir_en_curso', {
    p_negocio: negocio,
    p_curso: cursoId,
    p_cliente: clienteId,
    p_origen: origen,
  });
  reventar(error, 'inscribir al alumno');
  return (objeto(data)?.['estado'] as EstadoDeInscripcion) ?? 'inscrito';
}

export async function cambiarEstadoDeInscripcion(
  inscripcionId: string,
  estado: EstadoDeInscripcion,
  motivo?: string,
): Promise<void> {
  const { error } = await supabase().rpc('cambiar_estado_inscripcion', {
    p_inscripcion: inscripcionId,
    p_estado: estado,
    p_motivo: motivo ?? null,
  });
  reventar(error, 'cambiar la inscripción');
}

export async function guardarSesion(
  cursoId: string,
  id: string | null,
  datos: DatosDeSesion,
): Promise<void> {
  const { error } = await supabase().rpc('guardar_sesion_curso', {
    p_curso: cursoId,
    p_id: id,
    p_fecha: aFechaBase(datos.fecha),
    p_hora_inicio: datos.horaInicio,
    p_hora_fin: datos.horaFin,
    p_titulo: datos.titulo.trim() || null,
    p_instructor: datos.instructorId || null,
    p_lugar: datos.lugar.trim() || null,
    p_estado: datos.estado,
  });
  reventar(error, 'guardar la sesión');
}

export async function archivarSesion(id: string): Promise<void> {
  const { error } = await supabase().rpc('archivar_sesion_curso', { p_id: id });
  reventar(error, 'quitar la sesión');
}

export async function guardarMaterial(
  cursoId: string,
  id: string | null,
  datos: DatosDeMaterial,
): Promise<void> {
  const { error } = await supabase().rpc('guardar_material_curso', {
    p_curso: cursoId,
    p_id: id,
    p_titulo: datos.titulo.trim(),
    p_tipo: datos.tipo,
    p_url: datos.url.trim() || null,
    p_descripcion: datos.descripcion.trim() || null,
    p_visible: datos.visibleParaAlumnos,
  });
  reventar(error, 'guardar el material');
}

export async function archivarMaterial(id: string): Promise<void> {
  const { error } = await supabase().rpc('archivar_material_curso', { p_id: id });
  reventar(error, 'quitar el material');
}

/**
 * Todo lo que hay que refrescar al tocar un curso.
 *
 * Incluye `citas` porque las SESIONES salen en la Agenda: mover una sesion
 * tiene que moverla ahi tambien sin recargar. Y `clientes` porque el
 * expediente de cada inscrito enseña sus cursos.
 */
export const LO_QUE_TOCA_UN_CURSO = [
  'cursos', 'categorias', 'citas', 'clientes', PREFIJO_DE_INICIO,
] as const;
