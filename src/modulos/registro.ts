/**
 * EL REGISTRO DE MODULOS — la unica lista de lo que existe.
 *
 * De aqui salen tres cosas que en otros sistemas viven separadas y se
 * desincronizan: el menu lateral, las rutas y los permisos. Si un modulo se
 * agrega aqui, aparece en el menu, se puede navegar y respeta su permiso —
 * todo a la vez. Y si se olvida aqui, no existe en ningun lado, que es mucho
 * mejor que existir a medias.
 *
 * El error clasico que esto evita: agregar la pantalla nueva y olvidar el
 * menu, o agregar el menu y olvidar el permiso. Lo segundo es peor, porque
 * queda una pantalla accesible para quien no deberia verla.
 */

/** Las capacidades propias de Terapias. Las administrativas vienen de la base. */
import type { NombreDeIcono } from '../ui/iconos.js';

export const CAPACIDADES_DE_TERAPIAS = [
  'gestionarClientes',
  'gestionarAgenda',
  'gestionarCatalogo',
  'gestionarInventario',
  'cobrar',
  'verFinanzas',
  'verExpediente',
  // El costo y el margen no son para todo el mundo. Va aparte de `verFinanzas`
  // porque quien administra el almacen necesita ver costos sin ver la caja.
  'verCostos',
  /*
   * Los mensajes son informacion privada de un paciente: lo que pregunto, lo
   * que le duele, lo que se le contesto. Va con su propia capacidad y no con
   * `gestionarClientes` porque son dos trabajos distintos — quien captura
   * fichas en recepcion no tiene por que leer conversaciones.
   */
  'gestionarMensajes',
] as const;

export type CapacidadDeTerapias = (typeof CAPACIDADES_DE_TERAPIAS)[number];

export interface ModuloDelProducto {
  readonly id: string;
  readonly etiqueta: string;
  /**
   * Que capacidad hace falta para verlo. `null` = lo ve cualquier miembro.
   *
   * ES SOLO PARA EL MENU. Lo que de verdad se puede hacer lo deciden las
   * reglas de la base de datos: aunque alguien escriba la direccion a mano,
   * la base no le entrega nada. Esconder el boton es cortesia, no seguridad.
   */
  readonly capacidad: string | readonly string[] | null;
  /**
   * El dibujo del menu.
   *
   * Va AQUI y no en el marco por la misma razon que la etiqueta y el permiso:
   * una segunda lista en otro archivo se desincroniza, y el sintoma seria un
   * modulo sin icono que nadie sabe de donde sale.
   */
  readonly icono: NombreDeIcono;
  readonly sueltoArriba?: boolean;
  /** En que bloque llega. Mientras tanto, la pantalla lo dice con honestidad. */
  readonly bloque: number;
  /** Una linea de que va a hacer. Se muestra en la pantalla pendiente. */
  readonly promesa: string;
}

export const MODULOS: readonly ModuloDelProducto[] = [
  {
    id: 'inicio',
    etiqueta: 'Inicio',
    icono: 'casa',
    capacidad: null,
    sueltoArriba: true,
    bloque: 8,
    promesa:
      'El tablero del dia: citas de hoy, ventas, productos por acabarse y lo que necesita atencion.',
  },
  {
    id: 'agenda',
    etiqueta: 'Agenda',
    icono: 'calendario',
    capacidad: 'gestionarAgenda',
    bloque: 4,
    promesa: 'El calendario del centro. Agendar, mover, confirmar y marcar quien asistio.',
  },
  {
    id: 'clientes',
    etiqueta: 'Clientes',
    icono: 'personas',
    capacidad: 'gestionarClientes',
    bloque: 2,
    promesa: 'Los pacientes y su historial: datos de contacto, citas anteriores y notas.',
  },
  {
    id: 'servicios',
    etiqueta: 'Servicios',
    icono: 'flor',
    capacidad: 'gestionarCatalogo',
    bloque: 3,
    promesa: 'El catalogo: Reiki, Biomagnetismo, Limpieza Energetica. Duracion y precio de cada uno.',
  },
  {
    id: 'cursos',
    etiqueta: 'Cursos',
    icono: 'birrete',
    capacidad: 'gestionarCatalogo',
    bloque: 3,
    promesa: 'Los talleres con fecha, cupo y los inscritos.',
  },
  {
    id: 'productos',
    etiqueta: 'Productos',
    icono: 'paquete',
    capacidad: 'gestionarInventario',
    bloque: 5,
    promesa: 'Aceites, inciensos y velas. Existencias, costo, precio y el aviso de cuando se acaban.',
  },
  {
    id: 'caja',
    etiqueta: 'Caja',
    icono: 'cajon',
    /*
     * DOS CAPACIDADES, PORQUE AQUI TRABAJAN DOS PERSONAS DISTINTAS.
     *
     * Al unir Ventas con Caja, este modulo se quedo con los dos trabajos: cobrar
     * y cuadrar el cajon. Si pidiera solo `verFinanzas` —como pedia cuando solo
     * era el cajon— la cajera que puede cobrar pero no ve finanzas se quedaria
     * SIN LA PANTALLA DE COBRAR, o sea sin poder trabajar. Y si pidiera solo
     * `cobrar`, quien lleva las cuentas sin atender el mostrador perderia el
     * corte.
     *
     * Con las dos, entra quien pueda cualquiera de las dos cosas, y adentro cada
     * quien ve solo sus pestañas (ver `mostrador.tsx`).
     */
    capacidad: ['cobrar', 'verFinanzas'],
    bloque: 6,
    promesa: 'Cobrar, y el dinero que entra y sale con la operacion que lo produjo.',
  },
  {
    id: 'gastos',
    etiqueta: 'Gastos',
    icono: 'moneda',
    capacidad: 'verFinanzas',
    bloque: 7,
    promesa: 'Renta, insumos, servicios. Cada gasto alimenta la caja solo.',
  },
  {
    id: 'recordatorios',
    etiqueta: 'Recordatorios',
    icono: 'campana',
    capacidad: null,
    bloque: 7,
    promesa: 'Lo pendiente, ligado a la cita, el paciente o la venta de donde salio.',
  },
  /**
   * MENSAJES ESTA EN EL MENU Y TODAVIA NO TIENE NI TABLA.
   *
   * Aparece porque el diseño lo pide, y aparecer diciendo la verdad es mejor
   * que faltar sin explicacion: quien abre el sistema ve el mismo menu del
   * diseño, y al entrar lee en que bloque llega.
   *
   * LO QUE NO LLEVA ES INSIGNIA. El diseño muestra un "3" al lado; ese tres es
   * del diseño, no de nadie. No hay conversaciones que contar, y un contador
   * inventado en el menu es de las mentiras que mas caro salen: se ve en TODAS
   * las pantallas, todo el tiempo, y quien lo cree entra a buscar tres
   * mensajes que no existen. El dia que Mensajes tenga su tabla, el numero
   * sale de contar los no leidos y no de aqui.
   */
  {
    id: 'mensajes',
    etiqueta: 'Mensajes',
    icono: 'mensaje',
    capacidad: 'gestionarMensajes',
    bloque: 11,
    promesa:
      'Las conversaciones con los pacientes: recordatorios de cita, confirmaciones y avisos.',
  },
  {
    id: 'reportes',
    etiqueta: 'Reportes',
    icono: 'barras',
    capacidad: 'verFinanzas',
    bloque: 9,
    promesa: 'Ingresos por periodo, servicios mas dados, ticket promedio, comparaciones.',
  },
  {
    id: 'configuracion',
    etiqueta: 'Configuración',
    icono: 'engrane',
    capacidad: 'gestionarConfiguracion',
    bloque: 10,
    promesa: 'Datos del centro, horarios, usuarios, roles y permisos.',
  },
];

/**
 * Los grupos del menu lateral.
 *
 * Un grupo que se queda sin modulos visibles DESAPARECE — de eso se encarga
 * `resolverMenu` de la base. La recepcionista sin permiso de finanzas no ve
 * un apartado "Dinero" vacio, que solo la haria preguntarse que le falta.
 */
export const GRUPOS = [
  { id: 'atencion', etiqueta: 'Atención', modulos: ['agenda', 'clientes', 'servicios', 'cursos'] },
  { id: 'dinero', etiqueta: 'Dinero', modulos: ['productos', 'caja', 'gastos'] },
  { id: 'centro', etiqueta: 'El centro', modulos: ['reportes', 'mensajes', 'recordatorios', 'configuracion'] },
] as const;

/**
 * Si esta persona alcanza la capacidad que pide un modulo.
 *
 * Una LISTA significa "cualquiera de estas", no "todas": un modulo que sirve a
 * dos trabajos —como Caja, donde se cobra y se cuadra el cajon— tiene que
 * abrirse para quien pueda hacer alguno de los dos. Exigir las dos dejaria a la
 * cajera sin poder cobrar por no ver finanzas.
 */
export function puedeVerlo(
  capacidad: string | readonly string[] | null,
  permisos: Readonly<Record<string, boolean>>,
): boolean {
  if (capacidad === null) return true;
  if (typeof capacidad === 'string') return permisos[capacidad] === true;
  return capacidad.some((c) => permisos[c] === true);
}

/** Los modulos que esta persona puede ver, segun sus permisos reales. */
export function modulosVisibles(permisos: Readonly<Record<string, boolean>>): string[] {
  return MODULOS.filter((m) => puedeVerlo(m.capacidad, permisos)).map((m) => m.id);
}

export function moduloPorId(id: string): ModuloDelProducto | null {
  return MODULOS.find((m) => m.id === id) ?? null;
}

/**
 * A donde mandar a alguien cuando la direccion no lleva a ningun lado.
 *
 * Siempre 'inicio': lo ve cualquier miembro, asi que nadie puede quedarse
 * atorado en una pantalla en blanco por falta de permisos.
 */
export const MODULO_POR_OMISION = 'inicio';
