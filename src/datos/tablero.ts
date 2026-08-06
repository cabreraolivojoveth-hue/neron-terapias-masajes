/**
 * EL ACCESO A DATOS DE INICIO — todo derivado, nada propio.
 *
 * Inicio no es dueño de un solo dato. No guarda un contador de citas ni un
 * total del dia: los PREGUNTA a quien si los tiene. Por eso aqui no hay una
 * sola operacion de escritura, y no debe haberla nunca. El dia que Inicio
 * guarde un numero propio, ese numero se desincroniza — es cuestion de
 * semanas, y el sintoma es el peor posible: dos pantallas del mismo sistema
 * diciendo cifras distintas.
 *
 * UN VIAJE, NO ONCE. El tablero necesita cifras de nueve tablas. Una consulta
 * por tarjeta serian once viajes cada vez que alguien abre la pantalla —el
 * problema N+1 con otro disfraz—. La base ya trae `resumen_inicio`, escrita
 * en el bloque 0 justo para esto, y devuelve todo en una llamada.
 *
 * Y ES `security invoker`, que es la parte que importa de verdad: corre con
 * los permisos de QUIEN LLAMA. Una recepcionista sin `verFinanzas` recibe las
 * ventas en cero PORQUE LA BASE NO SE LAS DA, no porque la pantalla se las
 * esconda. Esconder el numero es un adorno; no entregarlo es un permiso.
 *
 * LAS LLAVES DE CACHE EMPIEZAN TODAS CON `inicio:`. Asi un solo
 * `invalidar('inicio')` refresca el tablero entero y el buscador global. Toda
 * operacion del producto lo declara —hay una guardia que lo exige— porque
 * cualquier cosa que se guarde en cualquier modulo puede cambiar una cifra de
 * aqui, y un tablero que se quedo viejo es peor que uno vacio: se ve normal.
 */

import { aISO, desdeISO, hoy as hoyDe, type Fecha } from '@neron/base/utils';
import { supabase } from '../supabase.js';
import { aBase, deBase, reventar } from './fechas-de-la-base.js';

/**
 * El prefijo de todo lo que Inicio y el buscador global leen.
 *
 * Se exporta para que las operaciones de los demas modulos lo declaren en su
 * lista de invalidacion en vez de escribir el texto a mano y equivocarse en
 * una letra — un fallo que no revienta: solo deja el tablero viejo.
 */
export const PREFIJO_DE_INICIO = 'inicio';

/* ------------------------------------------------------------------ */
/* Las formas de datos                                                 */
/* ------------------------------------------------------------------ */

export interface DiaConIngreso {
  readonly fecha: Fecha;
  /** Centavos enteros. El decimal solo aparece al pintar. */
  readonly total: number;
}

export interface ServicioVendido {
  readonly id: string;
  readonly nombre: string;
  readonly sesiones: number;
}

export interface ProductoVendido {
  readonly id: string;
  readonly nombre: string;
  readonly imagenUrl: string | null;
  readonly unidades: number;
}

export interface ResumenDeInicio {
  readonly citasHoy: number;
  readonly citasPendientes: number;
  readonly ventasHoy: number;
  /**
   * Ayer, o `null` cuando ayer no hubo NADA.
   *
   * `null` y `0` significan cosas distintas y la diferencia se ve en pantalla:
   * con `0` un tablero ingenuo anuncia "+∞%" o "+5000%"; con `null` se dice
   * "nuevo", que es lo que de verdad paso. La base ya manda `null` a
   * proposito, y aqui se respeta en vez de rellenarlo con un cero comodo.
   */
  readonly ventasAyer: number | null;
  readonly productosBajos: number;
  readonly cursosProximos: number;
  readonly recordatoriosPendientes: number;
  readonly ingresosSemana: readonly DiaConIngreso[];
  readonly topServicios: readonly ServicioVendido[];
  readonly topProductos: readonly ProductoVendido[];
}

export type PrioridadDeRecordatorio = 'baja' | 'normal' | 'alta';
export type EntidadDeRecordatorio = 'cliente' | 'cita' | 'venta' | 'curso' | 'producto';

export interface RecordatorioCercano {
  readonly id: string;
  readonly titulo: string;
  readonly detalle: string | null;
  readonly fecha: Fecha;
  readonly prioridad: PrioridadDeRecordatorio;
  /**
   * DE DONDE SALIO. Un recordatorio que solo lleva texto es texto muerto: no
   * se puede abrir la cita de la que nacio ni saber si ya se cancelo. La
   * columna existe en la base desde el bloque 0 y aqui se respeta.
   */
  readonly entidadTipo: EntidadDeRecordatorio | null;
  readonly entidadId: string | null;
}

/* ------------------------------------------------------------------ */
/* Lo que llega del servidor, ordenado                                 */
/* ------------------------------------------------------------------ */

const numero = (v: unknown): number => {
  const n = Number(v);
  // NaN NUNCA sale de aqui. Un NaN se propaga sin reventar: se suma, se
  // formatea, y termina impreso en la tarjeta del dueño como "$NaN".
  return Number.isFinite(n) ? n : 0;
};

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * El resumen vacio: TODO EN CERO, ninguna lista con nada dentro.
 *
 * Se usa cuando el servidor contesta con un hueco. No se inventa un solo
 * numero: un cero es una respuesta honesta —"no hay"— y una lista vacia
 * tambien. Lo que jamas se hace es rellenarlas para que la pantalla "se vea
 * completa".
 */
export const RESUMEN_VACIO: ResumenDeInicio = {
  citasHoy: 0,
  citasPendientes: 0,
  ventasHoy: 0,
  ventasAyer: null,
  productosBajos: 0,
  cursosProximos: 0,
  recordatoriosPendientes: 0,
  ingresosSemana: [],
  topServicios: [],
  topProductos: [],
};

export function ordenarResumen(crudo: unknown): ResumenDeInicio {
  if (!crudo || typeof crudo !== 'object') return RESUMEN_VACIO;
  const r = crudo as Record<string, unknown>;

  return {
    citasHoy: numero(r['citasHoy']),
    citasPendientes: numero(r['citasPendientes']),
    ventasHoy: numero(r['ventasHoy']),
    // El `null` de la base se conserva. Convertirlo a cero aqui reintroduce
    // exactamente el "+∞%" que la base se molesto en evitar.
    ventasAyer: r['ventasAyer'] === null || r['ventasAyer'] === undefined
      ? null
      : numero(r['ventasAyer']),
    productosBajos: numero(r['productosBajos']),
    cursosProximos: numero(r['cursosProximos']),
    recordatoriosPendientes: numero(r['recordatoriosPendientes']),
    ingresosSemana: lista(r['ingresosSemana']).map((d) => {
      const x = d as Record<string, unknown>;
      return { fecha: deBase(x['fecha']), total: numero(x['total']) };
    }),
    topServicios: lista(r['topServicios']).map((s) => {
      const x = s as Record<string, unknown>;
      return { id: texto(x['id']), nombre: texto(x['nombre']), sesiones: numero(x['sesiones']) };
    }),
    topProductos: lista(r['topProductos']).map((p) => {
      const x = p as Record<string, unknown>;
      return {
        id: texto(x['id']),
        nombre: texto(x['nombre']),
        // La base la manda en `imagen_url`; adentro se llama `imagenUrl`. La
        // traduccion pasa aqui, una vez, y no en cada componente que la pinte.
        imagenUrl: x['imagen_url'] ? texto(x['imagen_url']) : null,
        unidades: numero(x['unidades']),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

/**
 * La llave incluye el DIA.
 *
 * Sin eso, una pestaña abierta desde ayer seguiria mostrando "Citas hoy" de
 * ayer despues de la medianoche, con toda la cara de estar al dia.
 */
export function llaveDelResumen(negocio: string, dia: Fecha): string {
  return `${PREFIJO_DE_INICIO}:resumen:${negocio}:${dia}`;
}

export async function traerResumen(negocio: string, dia: Fecha): Promise<ResumenDeInicio> {
  const { data, error } = await supabase().rpc('resumen_inicio', {
    p_negocio: negocio,
    p_hoy: aBase(dia),
  });
  reventar(error, 'cargar el tablero de Inicio');
  return ordenarResumen(data);
}

export function llaveDeIngresos(negocio: string, desde: Fecha, hasta: Fecha): string {
  return `${PREFIJO_DE_INICIO}:ingresos:${negocio}:${desde}:${hasta}`;
}

/**
 * Los ingresos de un rango, un renglon por dia y SIN HUECOS.
 *
 * Los dias sin ventas van en cero, no ausentes. Un hueco en la serie hunde la
 * linea hasta el piso y se lee como una caida; un cero se lee como lo que es.
 * Es la misma decision que ya tomo `resumen_inicio` para la semana en curso, y
 * se repite aqui para que las dos graficas se comporten igual.
 *
 * Solo se pide cuando alguien cambia el periodo: la semana en curso ya viene
 * dentro del resumen y no cuesta un viaje mas.
 *
 * Cuenta UNICAMENTE las ventas `cobrada`. Un borrador es un carrito a medias y
 * una cancelada ya se revirtio: si contaran, la grafica mentiria hacia arriba
 * todos los dias. Y quien no puede ver finanzas no recibe ni una fila — lo
 * impide la regla de la tabla, no este archivo.
 */
export async function traerIngresosPorDia(
  negocio: string,
  desde: Fecha,
  hasta: Fecha,
): Promise<DiaConIngreso[]> {
  const { data, error } = await supabase()
    .from('venta')
    .select('fecha, total_centavos')
    .eq('negocio_id', negocio)
    .eq('estado', 'cobrada')
    .eq('eliminado', false)
    .gte('fecha', aBase(desde))
    .lte('fecha', aBase(hasta));
  reventar(error, 'cargar los ingresos del periodo');

  const porDia = new Map<string, number>();
  for (const fila of (data ?? []) as Record<string, unknown>[]) {
    const clave = aISO(deBase(fila['fecha']));
    porDia.set(clave, (porDia.get(clave) ?? 0) + numero(fila['total_centavos']));
  }
  return diasDelRango(desde, hasta).map((f) => ({ fecha: f, total: porDia.get(aISO(f)) ?? 0 }));
}

/**
 * Todos los dias entre dos fechas, inclusive.
 *
 * Se avanza sobre el mediodia UTC a proposito. Sumar 24 horas sobre la
 * medianoche local cae en el mismo dia dos veces —o se salta uno— en las dos
 * noches del año que cambia el horario de verano. A mediodia sobra margen para
 * cualquier salto de una hora.
 */
export function diasDelRango(desde: Fecha, hasta: Fecha): Fecha[] {
  const salida: Fecha[] = [];
  const fin = Date.parse(`${aISO(hasta)}T12:00:00Z`);
  let cursor = Date.parse(`${aISO(desde)}T12:00:00Z`);
  if (!Number.isFinite(cursor) || !Number.isFinite(fin)) return salida;

  // Un tope duro: un rango absurdo —o al reves— no cuelga la pestaña armando
  // una lista infinita. Dos años de dias es mas de lo que cabe en una grafica.
  let vueltas = 0;
  while (cursor <= fin && vueltas < 800) {
    salida.push(desdeISO(new Date(cursor).toISOString().slice(0, 10)));
    cursor += 24 * 60 * 60 * 1000;
    vueltas += 1;
  }
  return salida;
}

export function llaveDeRecordatorios(negocio: string, dia: Fecha): string {
  return `${PREFIJO_DE_INICIO}:recordatorios:${negocio}:${dia}`;
}

/**
 * Los recordatorios que de verdad urgen: vencidos primero, luego lo proximo.
 *
 * Se ordenan por FECHA, no por prioridad. Un recordatorio de prioridad alta
 * para dentro de tres semanas no es lo que hay que hacer hoy; uno normal que
 * vencio anteayer si.
 */
export async function traerRecordatoriosCercanos(
  negocio: string,
  limite = 4,
): Promise<RecordatorioCercano[]> {
  const { data, error } = await supabase()
    .from('recordatorio')
    .select('id, titulo, detalle, fecha, prioridad, entidad_tipo, entidad_id')
    .eq('negocio_id', negocio)
    .eq('eliminado', false)
    .eq('estado', 'pendiente')
    .order('fecha', { ascending: true })
    .limit(limite);
  reventar(error, 'cargar los recordatorios');

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: texto(r['id']),
    titulo: texto(r['titulo']),
    detalle: r['detalle'] ? texto(r['detalle']) : null,
    fecha: deBase(r['fecha']),
    prioridad: (texto(r['prioridad']) || 'normal') as PrioridadDeRecordatorio,
    entidadTipo: r['entidad_tipo'] ? (texto(r['entidad_tipo']) as EntidadDeRecordatorio) : null,
    entidadId: r['entidad_id'] ? texto(r['entidad_id']) : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Los periodos de la grafica                                          */
/* ------------------------------------------------------------------ */

export type ClaveDePeriodo = 'estaSemana' | 'semanaAnterior' | 'esteMes';

export interface PeriodoDeIngresos {
  readonly clave: ClaveDePeriodo;
  readonly etiqueta: string;
  readonly desde: Fecha;
  readonly hasta: Fecha;
}

/**
 * LA SEMANA EMPIEZA EN LUNES.
 *
 * No es gusto: en México el domingo es fin de semana. Una "semana" que empieza
 * en domingo parte el fin de semana en dos, las ventas del sabado y las del
 * domingo caen en semanas distintas, y ninguna comparacion cuadra. Es la misma
 * regla que usa `resumen_inicio` en la base — si las dos no coincidieran, la
 * grafica de "esta semana" cambiaria de forma al tocar el selector sin que
 * nadie entendiera por que.
 */
export function lunesDeLaSemana(dia: Fecha): Fecha {
  const d = new Date(`${aISO(dia)}T12:00:00Z`);
  // getUTCDay(): 0 es domingo. Se convierte a "cuantos dias van desde el lunes".
  const desdeElLunes = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - desdeElLunes);
  return desdeISO(d.toISOString().slice(0, 10));
}

export function periodosDeIngresos(dia: Fecha = hoyDe()): PeriodoDeIngresos[] {
  const lunes = lunesDeLaSemana(dia);
  const lunesPasado = desdeISO(
    new Date(Date.parse(`${aISO(lunes)}T12:00:00Z`) - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  );
  const finDeSemana = (l: Fecha): Fecha =>
    desdeISO(
      new Date(Date.parse(`${aISO(l)}T12:00:00Z`) + 6 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
    );

  const iso = aISO(dia);
  const primeroDelMes = desdeISO(`${iso.slice(0, 7)}-01`);
  const primeroDelSiguiente = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`);
  primeroDelSiguiente.setUTCMonth(primeroDelSiguiente.getUTCMonth() + 1);
  const ultimoDelMes = desdeISO(
    new Date(primeroDelSiguiente.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );

  return [
    { clave: 'estaSemana', etiqueta: 'Esta semana', desde: lunes, hasta: finDeSemana(lunes) },
    {
      clave: 'semanaAnterior',
      etiqueta: 'Semana anterior',
      desde: lunesPasado,
      hasta: finDeSemana(lunesPasado),
    },
    { clave: 'esteMes', etiqueta: 'Este mes', desde: primeroDelMes, hasta: ultimoDelMes },
  ];
}
