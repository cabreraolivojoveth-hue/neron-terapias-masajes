/**
 * UN SERVIDOR DE MENTIRAS, SOLO PARA MIRAR LA PANTALLA.
 *
 * POR QUE EXISTE ESTO, Y ES LA LECCION MAS CARA DEL PROYECTO:
 *
 * Los primeros ocho modulos se escribieron LEYENDO la foto y escribiendo el
 * CSS a ciegas, sin ver nunca el resultado al lado de la referencia. El
 * parecido se fue perdiendo modulo a modulo hasta que la pantalla dejo de
 * parecerse al diseño — y nadie lo noto porque los tipos pasaban, las pruebas
 * pasaban y la compilacion pasaba. Ninguna de esas tres cosas mira.
 *
 * Esta carpeta arregla eso: levanta la aplicacion DE VERDAD —los mismos
 * componentes, los mismos estilos, el mismo marco— y le enchufa un servidor
 * falso para poder fotografiarla y compararla contra la foto.
 *
 * NADA DE AQUI SE PUBLICA. `tsconfig.build.json` solo compila `src`, y hay una
 * guardia que impide que `src` importe cualquier cosa de esta carpeta. Los
 * datos de abajo son utileria de revision, como los de una prueba — nunca
 * llegan al navegador de nadie.
 *
 * LOS NOMBRES NO SON LOS DE LA FOTO a proposito. Sirven para medir que tan
 * anchas quedan las columnas y como cae un texto largo, y por eso tienen
 * largos parecidos; pero si algun dia esto se colara a produccion, se veria
 * de inmediato que es utileria y no un paciente real.
 */

/* ------------------------------------------------------------------ */
/* Las respuestas, por nombre de funcion del servidor                  */
/* ------------------------------------------------------------------ */

const hoy = new Date();
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const enDias = (n: number): string => {
  const d = new Date(hoy);
  d.setDate(d.getDate() + n);
  return iso(d);
};

const PERSONAS = [
  'Adriana Villalobos', 'Ignacio Serrano', 'Rosalía Estrada',
  'Fernando Aguilar', 'Мarcela Quintero', 'Teodoro Bustamante',
];

const SERVICIOS = [
  { nombre: 'Terapia de Relajación', detalle: 'Sesión de cuerpo completo' },
  { nombre: 'Alineación Energética', detalle: 'Equilibrio de centros' },
  { nombre: 'Masaje Descontracturante', detalle: 'Espalda y cervicales' },
  { nombre: 'Aromaterapia Profunda', detalle: 'Aceites esenciales' },
  { nombre: 'Sonoterapia con Cuencos', detalle: 'Vibración y descanso' },
];

const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** La caja de la vitrina. Se deja abierta para poder ver el modulo lleno. */
const CAJA = {
  id: uuid(900),
  nombre: 'Caja mostrador',
  estado: 'abierta',
  saldoInicialCentavos: 200000,
  abiertaEn: `${iso(hoy)}T08:30:00`,
  abiertaPor: 'Quien administra',
  observaciones: null,
  ingresosCentavos: 485000,
  egresosCentavos: 65000,
  efectivoEntroCentavos: 265000,
  efectivoSalioCentavos: 65000,
  efectivoEsperadoCentavos: 400000,
  movimientos: 14,
};

const MOVIMIENTOS = [
  {
    id: uuid(801), fecha: iso(hoy), creadoEn: `${iso(hoy)}T10:15:00`,
    clase: 'venta', tipo: 'ingreso', concepto: 'Venta V-00003',
    metodo: 'efectivo', categoria: 'Servicios / Productos', montoCentavos: 115000,
    usuario: 'Quien administra', notas: null, ventaId: uuid(701), sesionId: CAJA.id,
  },
  {
    id: uuid(802), fecha: iso(hoy), creadoEn: `${iso(hoy)}T09:30:00`,
    clase: 'venta', tipo: 'ingreso', concepto: 'Venta V-00002',
    metodo: 'transferencia', categoria: 'Servicios', montoCentavos: 85000,
    usuario: 'Quien administra', notas: null, ventaId: uuid(702), sesionId: CAJA.id,
  },
  {
    id: uuid(803), fecha: iso(hoy), creadoEn: `${iso(hoy)}T09:00:00`,
    clase: 'venta', tipo: 'ingreso', concepto: 'Venta V-00001',
    metodo: 'tarjeta', categoria: 'Cursos', montoCentavos: 250000,
    usuario: 'Quien administra', notas: null, ventaId: uuid(703), sesionId: CAJA.id,
  },
  {
    id: uuid(804), fecha: iso(hoy), creadoEn: `${iso(hoy)}T11:45:00`,
    clase: 'ingreso', tipo: 'ingreso', concepto: 'Venta de productos varios',
    metodo: 'efectivo', categoria: 'Productos', montoCentavos: 20000,
    usuario: 'Quien administra', notas: null, ventaId: null, sesionId: CAJA.id,
  },
  {
    id: uuid(805), fecha: iso(hoy), creadoEn: `${iso(hoy)}T12:30:00`,
    clase: 'retiro', tipo: 'egreso', concepto: 'Pago de material y velas',
    metodo: 'efectivo', categoria: 'Gastos operativos', montoCentavos: 65000,
    usuario: 'Quien administra', notas: null, ventaId: null, sesionId: CAJA.id,
  },
];

const CITAS = SERVICIOS.slice(0, 5).map((s, i) => ({
  id: uuid(100 + i),
  fecha: iso(hoy),
  horaInicio: ['09:00', '10:30', '12:00', '14:00', '17:30'][i],
  horaFin: ['10:00', '11:30', '13:00', '15:00', '18:30'][i],
  clienteId: uuid(200 + i),
  cliente: PERSONAS[i],
  servicioId: uuid(300 + i),
  servicio: s.nombre,
  duracionMin: 60,
  profesionalId: uuid(400),
  profesional: 'Quien atiende',
  estado: ['confirmada', 'confirmada', 'pendiente', 'confirmada', 'completada'][i],
  precioCentavos: 80000,
  notas: null,
  sala: 'Sala 1',
}));

const RESPUESTAS: Readonly<Record<string, unknown>> = {
  /* --- Inicio ---------------------------------------------------- */
  resumen_inicio: {
    citasHoy: 6, citasPendientes: 2,
    ventasHoy: 485000, ventasAyer: 432000,
    productosBajos: 3, cursosProximos: 1,
    proximaCita: null,
    agendaDeHoy: CITAS,
    ingresosSemana: [
      { fecha: enDias(-6), total: 320000 }, { fecha: enDias(-5), total: 540000 },
      { fecha: enDias(-4), total: 410000 }, { fecha: enDias(-3), total: 485000 },
      { fecha: enDias(-2), total: 380000 }, { fecha: enDias(-1), total: 620000 },
      { fecha: iso(hoy), total: 485000 },
    ],
    topServicios: SERVICIOS.map((s, i) => ({
      id: uuid(300 + i), nombre: s.nombre, sesiones: 28 - i * 5,
    })),
    topProductos: [
      { id: uuid(500), nombre: 'Aceite esencial de romero', unidades: 23, centavos: 80000 },
      { id: uuid(501), nombre: 'Incienso de sándalo', unidades: 18, centavos: 54000 },
      { id: uuid(502), nombre: 'Aceite de almendras dulces', unidades: 15, centavos: 45000 },
      { id: uuid(503), nombre: 'Vela de cera de soya', unidades: 12, centavos: 36000 },
    ],
  },

  /* --- Agenda ---------------------------------------------------- */
  citas_del_rango: CITAS,

  /* --- Caja ------------------------------------------------------ */
  caja_actual: CAJA,
  resumen_de_caja: {
    totalEntradasCentavos: 485000,
    metodos: [
      { metodo: 'efectivo', centavos: 265000, movimientos: 8 },
      { metodo: 'transferencia', centavos: 145000, movimientos: 3 },
      { metodo: 'tarjeta', centavos: 60000, movimientos: 2 },
      { metodo: 'otro', centavos: 15000, movimientos: 1 },
    ],
    clases: [
      { clase: 'venta', movimientos: 12, centavos: 485000 },
      { clase: 'retiro', movimientos: 1, centavos: -65000 },
      { clase: 'ingreso', movimientos: 1, centavos: 20000 },
    ],
    movimientos: 14,
    netoCentavos: 440000,
  },
  movimientos_de_caja: { total: 14, filas: MOVIMIENTOS },
  historial_de_cajas: { total: 0, filas: [] },
  reporte_de_caja: null,

  /* --- Ventas ---------------------------------------------------- */
  resumen_de_ventas: {
    ventas: 5, totalCentavos: 685000,
    servicios: 3, serviciosCentavos: 245000,
    productos: 6, productosCentavos: 190000,
    cursos: 1, cursosCentavos: 250000,
    ticketPromedio: 137000,
  },
  ventas_del_rango: {
    total: 3,
    filas: [0, 1, 2].map((i) => ({
      id: uuid(701 + i), folio: `V-0000${3 - i}`, fecha: iso(hoy),
      clienteId: uuid(200 + i), cliente: PERSONAS[i], vendedor: 'Quien administra',
      renglones: 2 - (i % 2), subtotalCentavos: 115000, descuentoCentavos: 0,
      totalCentavos: [115000, 85000, 250000][i],
      metodos: ['efectivo', 'transferencia', 'tarjeta'][i],
      estado: 'cobrada', creadoEn: `${iso(hoy)}T1${i}:15:00`,
    })),
  },
  catalogo_vendible: SERVICIOS.map((s, i) => ({
    tipo: ['servicio', 'producto', 'curso'][i % 3],
    id: uuid(300 + i), nombre: s.nombre, detalle: s.detalle,
    precioCentavos: 80000 + i * 15000,
    disponible: i % 3 === 1 ? 12 : null,
    codigo: i % 3 === 1 ? `SKU-00${i}` : null,
  })),
  cotizaciones_del_centro: [],
  ficha_de_venta: null,
  items_de_cotizacion: [],

  /* --- Clientes -------------------------------------------------- */
  clientes_del_centro: {
    total: 6,
    filas: PERSONAS.map((nombre, i) => ({
      id: uuid(200 + i), nombre,
      telefono: `646 1${String(i)}0 ${String(2000 + i)}`,
      correo: `contacto${i}@ejemplo.mx`,
      fechaNacimiento: null, profesionalId: null, profesional: 'Quien atiende',
      visitas: 12 - i, ultimaVisita: enDias(-i * 3),
      estado: i < 4 ? 'activo' : 'inactivo',
    })),
  },
  resumen_clientes: {
    total: 6, activos: 4, nuevosDelMes: 2, frecuentes: 3,
    visitasParaSerFrecuente: 5, cumpleanos: [],
  },
  expediente_del_cliente: null,
  historial_del_cliente: { completadas: 0, canceladas: 0, noAsistio: 0, ultima: null, proxima: null },

  /* --- Servicios y Cursos ---------------------------------------- */
  servicios_del_centro: {
    total: 5,
    filas: SERVICIOS.map((s, i) => ({
      id: uuid(300 + i), nombre: s.nombre, descripcion: s.detalle,
      categoriaId: uuid(600), categoria: 'Terapias', categoriaColor: null,
      duracionMin: 60 + i * 15, precioCentavos: 80000 + i * 20000,
      precioPromocionalCentavos: i === 1 ? 65000 : null,
      promocionDesde: null, promocionHasta: null,
      imagenUrl: null, activo: i !== 4, veces: 28 - i * 5,
    })),
  },
  resumen_servicios: { total: 5, activos: 4, categorias: 3, precioPromedio: 96000 },
  ficha_del_servicio: null,
  cursos_del_centro: {
    total: 3,
    filas: [0, 1, 2].map((i) => ({
      id: uuid(650 + i),
      nombre: ['Formación en Terapias Holísticas', 'Taller de Respiración Consciente',
        'Introducción a la Sonoterapia'][i],
      subtitulo: ['Nivel inicial, ocho módulos', 'Fin de semana intensivo',
        'Cuencos y diapasones'][i],
      categoriaId: uuid(601), categoria: 'Formación', categoriaColor: null,
      fechaInicio: enDias(7 + i * 10), fechaFin: enDias(8 + i * 10),
      horaInicio: '09:00', horaFin: '15:00',
      precioCentavos: 250000 + i * 70000, cupo: 12, inscritos: 8 - i * 2,
      modalidad: 'presencial', lugar: 'Sala grande',
      instructorId: null, instructor: 'Quien enseña',
      imagenUrl: null, estado: 'programado', activo: true, sesiones: 2,
    })),
  },
  resumen_cursos: { total: 3, activos: 3, proximos: 2, inscritos: 18 },
  ficha_del_curso: null,
  sesiones_del_rango: [],
  cursos_del_cliente: [],

  /* --- Productos ------------------------------------------------- */
  productos_del_centro: {
    total: 4,
    filas: [
      { nombre: 'Aceite esencial de romero', sku: 'ACE-001', stock: 23, precio: 35000, costo: 18000 },
      { nombre: 'Incienso de sándalo', sku: 'INC-002', stock: 18, precio: 12000, costo: 6000 },
      { nombre: 'Aceite de almendras dulces', sku: 'ACE-003', stock: 2, precio: 28000, costo: 14000 },
      { nombre: 'Vela de cera de soya', sku: 'VEL-004', stock: 0, precio: 22000, costo: 11000 },
    ].map((p, i) => ({
      id: uuid(500 + i), nombre: p.nombre, sku: p.sku, codigoBarras: null,
      categoriaId: uuid(602), categoria: 'Aromaterapia', categoriaColor: null,
      precioCentavos: p.precio, costoCentavos: p.costo,
      stockActual: p.stock, stockMinimo: 3, unidad: 'pieza',
      imagenUrl: null, ubicacion: 'Vitrina',
      inventario: p.stock === 0 ? 'agotado' : p.stock <= 3 ? 'bajo' : 'disponible',
      activo: true,
    })),
  },
  resumen_productos: { total: 4, valorCentavos: 640000, bajos: 1, agotados: 1 },
  ficha_del_producto: null,
  proveedores_del_centro: [],

  /* --- Compartido ------------------------------------------------ */
  buscar_en_todo: [],
  siguiente_folio: 'V-00004',
};

/* ------------------------------------------------------------------ */
/* El cliente falso                                                    */
/* ------------------------------------------------------------------ */

/** Las filas que devuelve un `from(tabla).select(...)`, por tabla. */
const TABLAS: Readonly<Record<string, unknown[]>> = {
  membresia: [
    { id: uuid(400), nombre: 'Quien administra', rol: 'dueno', usuario_id: uuid(1) },
    { id: uuid(401), nombre: 'Quien atiende', rol: 'admin', usuario_id: uuid(2) },
  ],
  categoria: [
    { id: uuid(600), nombre: 'Terapias', color: null, ambito: 'servicio', orden: 0, usos: 3 },
    { id: uuid(601), nombre: 'Formación', color: null, ambito: 'curso', orden: 1, usos: 2 },
    { id: uuid(602), nombre: 'Aromaterapia', color: null, ambito: 'producto', orden: 2, usos: 4 },
  ],
  servicio: SERVICIOS.map((s, i) => ({
    id: uuid(300 + i), nombre: s.nombre, duracion_min: 60, precio_centavos: 80000, activo: true,
  })),
  cliente: PERSONAS.map((nombre, i) => ({ id: uuid(200 + i), nombre })),
};

/**
 * Una consulta encadenable que siempre contesta lo mismo.
 *
 * Devuelve un objeto que es a la vez encadenable Y esperable, que es
 * exactamente como se comporta el cliente de verdad: `from(x).select().eq()`
 * se puede seguir encadenando o se puede esperar tal cual.
 */
function consulta(filas: unknown[]): Record<string, unknown> {
  const respuesta = { data: filas, error: null };
  const objeto: Record<string, unknown> = {
    then: (resolver: (v: unknown) => unknown) => Promise.resolve(respuesta).then(resolver),
  };
  for (const metodo of [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
    'order', 'limit', 'range', 'filter', 'not', 'or', 'match',
  ]) {
    objeto[metodo] = () => objeto;
  }
  objeto['single'] = () => Promise.resolve({ data: filas[0] ?? null, error: null });
  objeto['maybeSingle'] = () => Promise.resolve({ data: filas[0] ?? null, error: null });
  objeto['insert'] = () => objeto;
  objeto['update'] = () => objeto;
  objeto['delete'] = () => objeto;
  return objeto;
}

export const HAY_CONEXION = true;

export function supabase(): unknown {
  return {
    rpc: (nombre: string) =>
      Promise.resolve({ data: RESPUESTAS[nombre] ?? null, error: null }),
    from: (tabla: string) => consulta(TABLAS[tabla] ?? []),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
  };
}

export function clienteParaLaBase(): unknown {
  return supabase();
}
