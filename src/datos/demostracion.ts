/**
 * LOS DATOS DE DEMOSTRACION — cinco meses de uso, para poder enseñar el sistema.
 *
 * AQUI NO HAY NI UN DATO INVENTADO, Y ESO ES EL PUNTO. Este archivo llama a dos
 * funciones de la base y ordena lo que contestan; los cuarenta y cinco
 * pacientes, las setecientas citas y los cinco meses de cortes de caja viven
 * dentro de `cargar_datos_de_demostracion`, en el instalador. La regla numero
 * uno del producto —cero datos de ejemplo en `src/`— sigue en pie, y la guardia
 * 1 la vigila.
 *
 * POR QUE SE CARGA POR PASOS Y NO DE UN VIAJE: son unas seis mil filas y
 * PostgREST corta las llamadas largas. Una carga cortada a la mitad deja el
 * centro con dos meses de historia y ninguna explicacion. Nueve llamadas, cada
 * una su propia transaccion, y la pantalla enseñando por donde va.
 *
 * QUIEN PUEDE: una sola cuenta, y lo decide LA BASE. Aqui se sabe el correo
 * para no ofrecer un boton que va a fallar —eso es cortesia— pero quien no lo
 * sea recibe un error de permisos aunque llame a la base a mano.
 */

import { supabase } from '../supabase.js';
import { reventar } from './fechas-de-la-base.js';
import { PREFIJO_DE_INICIO } from './tablero.js';

/**
 * LA CUENTA DE LAS DEMOSTRACIONES.
 *
 * Esta escrito igual en `app.correo_de_demostracion()`, y no es una copia que
 * se pueda desincronizar sin que se note: si los dos dejan de coincidir, la
 * tarjeta aparece y la base rechaza la carga con un mensaje que lo dice.
 * Al reves —que la base acepte a quien la pantalla esconde— es imposible,
 * porque la que decide es ella.
 */
export const CORREO_DE_LA_DEMOSTRACION = 'cabreraolivojoveth@gmail.com';

/** ¿Esta cuenta es la de las demostraciones? Sin espacios ni mayusculas. */
export function esLaCuentaDeDemostracion(correo: string | null | undefined): boolean {
  return (correo ?? '').trim().toLocaleLowerCase('es') === CORREO_DE_LA_DEMOSTRACION;
}

/** Los nueve pasos, como se llaman al enseñarlos. */
export const PASOS_DE_LA_DEMOSTRACION: readonly string[] = [
  'El catálogo del centro',
  'Los pacientes y su expediente',
  'El primer mes de trabajo',
  'El segundo mes',
  'El tercer mes',
  'El cuarto mes',
  'El quinto mes',
  'Este mes, hasta hoy',
  'Cursos, mensajes, recordatorios y bitácora',
];

/**
 * TODO LO QUE SE INVALIDA DESPUES DE CARGAR O DE QUITAR.
 *
 * Es la lista entera de prefijos del sistema, y tiene que serlo: una carga de
 * demostracion toca los doce modulos a la vez. Refrescar solo el tablero
 * dejaria la agenda vacia y las ventas en cero en la misma pantalla donde
 * Inicio ya enseña quinientas citas — y quien lo vea va a creer que la carga
 * fallo a medias.
 */
export const LO_QUE_TOCA_LA_DEMOSTRACION = [
  PREFIJO_DE_INICIO,
  'configuracion',
  'clientes',
  'citas',
  'servicios',
  'cursos',
  'productos',
  'proveedores',
  'ventas',
  'cotizaciones',
  'caja',
  'gastos',
  'recordatorios',
  'mensajes',
  'reportes',
  'categorias',
  'demostracion',
] as const;

export interface EstadoDeLaDemostracion {
  /** Si la cuenta que pregunta es la que puede cargarla. Lo dice la base. */
  readonly puede: boolean;
  readonly cargada: boolean;
  readonly filas: number;
  readonly sembradaEn: string | null;
  readonly pasos: number;
  /** Cuantas filas por tabla. Es lo que se enseña al ofrecer quitarla. */
  readonly porTabla: Readonly<Record<string, number>>;
}

export interface PasoDeLaDemostracion {
  readonly paso: number;
  readonly pasos: number;
  readonly titulo: string;
  readonly hechas: number;
  /** `null` en el ultimo: es lo que corta el ciclo. */
  readonly siguiente: number | null;
  readonly filas: number;
}

export const DEMOSTRACION_VACIA: EstadoDeLaDemostracion = {
  puede: false,
  cargada: false,
  filas: 0,
  sembradaEn: null,
  pasos: PASOS_DE_LA_DEMOSTRACION.length,
  porTabla: {},
};

export function llaveDeLaDemostracion(negocio: string): string {
  return `demostracion:${negocio}`;
}

function comoNumero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export function ordenarEstado(dato: unknown): EstadoDeLaDemostracion {
  const d = (dato ?? {}) as Record<string, unknown>;
  const porTabla: Record<string, number> = {};
  for (const [tabla, cuantas] of Object.entries((d['porTabla'] ?? {}) as Record<string, unknown>)) {
    porTabla[tabla] = comoNumero(cuantas);
  }
  return {
    puede: d['puede'] === true,
    cargada: d['cargada'] === true,
    filas: comoNumero(d['filas']),
    sembradaEn: d['sembradaEn'] === null || d['sembradaEn'] === undefined
      ? null
      : String(d['sembradaEn']),
    pasos: comoNumero(d['pasos']) || PASOS_DE_LA_DEMOSTRACION.length,
    porTabla,
  };
}

export function ordenarPaso(dato: unknown): PasoDeLaDemostracion {
  const d = (dato ?? {}) as Record<string, unknown>;
  const paso = comoNumero(d['paso']);
  return {
    paso,
    pasos: comoNumero(d['pasos']) || PASOS_DE_LA_DEMOSTRACION.length,
    titulo: String(d['titulo'] ?? PASOS_DE_LA_DEMOSTRACION[paso - 1] ?? ''),
    hechas: comoNumero(d['hechas']),
    siguiente: d['siguiente'] === null || d['siguiente'] === undefined
      ? null
      : comoNumero(d['siguiente']),
    filas: comoNumero(d['filas']),
  };
}

export async function traerDemostracion(negocio: string): Promise<EstadoDeLaDemostracion> {
  const { data, error } = await supabase().rpc('datos_de_demostracion', { p_negocio: negocio });
  reventar(error, 'ver si hay datos de demostración');
  return ordenarEstado(data);
}

export async function cargarPasoDeDemostracion(
  negocio: string,
  paso: number,
): Promise<PasoDeLaDemostracion> {
  const { data, error } = await supabase().rpc('cargar_datos_de_demostracion', {
    p_negocio: negocio,
    p_paso: paso,
  });
  reventar(error, `cargar el paso ${paso} de la demostración`);
  return ordenarPaso(data);
}

/**
 * Los nueve pasos, uno detras de otro, avisando de cada uno.
 *
 * EL CICLO LO CORTA LA BASE, no un contador de aqui: cada paso contesta cual es
 * el siguiente y el ultimo contesta que no hay. Contarlos en el navegador
 * significaria que el dia que se agregue un paso decimo, la pantalla se pare en
 * el noveno y deje la carga a medias sin fallar.
 *
 * El tope de vueltas es un seguro contra una base que contestara siempre lo
 * mismo: un ciclo infinito en el navegador cuelga la pestaña entera.
 */
export async function cargarDemostracionCompleta(
  negocio: string,
  avisar: (paso: PasoDeLaDemostracion) => void,
  /*
   * QUIEN DA CADA PASO SE PUEDE CAMBIAR, y es lo unico que permite probar este
   * ciclo sin una base de datos. No es un adorno de pruebas: el ciclo es la
   * pieza que decide cuando parar, y probarlo contra Supabase de verdad
   * significaria no probarlo nunca.
   */
  pedir: (negocio: string, paso: number) => Promise<PasoDeLaDemostracion> =
    cargarPasoDeDemostracion,
): Promise<number> {
  let cual: number | null = 1;
  let vueltas = 0;
  let filas = 0;

  while (cual !== null && vueltas < 20) {
    const hecho: PasoDeLaDemostracion = await pedir(negocio, cual);
    avisar(hecho);
    filas = hecho.filas;
    cual = hecho.siguiente;
    vueltas += 1;
  }

  return filas;
}

export async function quitarDemostracion(negocio: string): Promise<number> {
  const { data, error } = await supabase().rpc('quitar_datos_de_demostracion', {
    p_negocio: negocio,
  });
  reventar(error, 'quitar los datos de demostración');
  return comoNumero((data as Record<string, unknown> | null)?.['quitadas']);
}
