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

/** Una marca de tiempo completa, para las columnas de "cuando se capturo". */
const enHoras = (n: number): string => {
  const d = new Date(hoy);
  d.setHours(d.getHours() + n);
  return d.toISOString();
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

/**
 * Los pendientes de la vitrina.
 *
 * SIRVEN PARA MEDIR LA PANTALLA, no para contar nada: hay uno vencido, uno de
 * hoy, uno de mañana y uno cerrado, que son los cuatro estados que se pintan
 * distinto. Los titulos son largos a proposito — es como se descubre que la
 * columna se queda corta.
 */
const RECORDATORIOS = [
  {
    id: uuid(940), titulo: 'Recordar el pago del crédito', detalle: 'Llamar para recordar su pago',
    notas: null, fecha: enDias(-2), hora: '10:00', prioridad: 'alta', estado: 'pendiente',
    vencido: true, categoriaId: uuid(620), categoria: 'Créditos', categoriaColor: null,
    responsableId: uuid(400), responsable: 'Quien administra',
    entidadTipo: 'cliente', entidadId: uuid(200), entidadNombre: PERSONAS[0],
    entidadContacto: '6640000000', recurrenteId: null, recurrencia: null,
    automatizacionId: null, origenTipo: null, anticipacionMin: null, notificadoEn: null,
    completadoEn: null, completadoPor: null, creadoPor: 'Quien administra',
    creadoEn: enHoras(-72), actualizadoEn: null,
  },
  {
    id: uuid(941), titulo: 'Confirmar la cita de terapia', detalle: 'Confirmar el masaje terapéutico',
    notas: null, fecha: iso(hoy), hora: '14:00', prioridad: 'normal', estado: 'pendiente',
    vencido: false, categoriaId: uuid(621), categoria: 'Agenda', categoriaColor: null,
    responsableId: uuid(400), responsable: 'Quien administra',
    entidadTipo: 'cita', entidadId: uuid(100), entidadNombre: PERSONAS[1],
    entidadContacto: '6640000001', recurrenteId: null, recurrencia: null,
    automatizacionId: null, origenTipo: null, anticipacionMin: null, notificadoEn: null,
    completadoEn: null, completadoPor: null, creadoPor: 'Quien administra',
    creadoEn: enHoras(-20), actualizadoEn: null,
  },
  {
    id: uuid(942), titulo: 'Vencimiento de pago del curso', detalle: 'Pago pendiente de inscripción',
    notas: null, fecha: enDias(1), hora: '09:00', prioridad: 'urgente', estado: 'pendiente',
    vencido: false, categoriaId: null, categoria: null, categoriaColor: null,
    responsableId: uuid(401), responsable: 'Quien atiende',
    entidadTipo: 'curso', entidadId: uuid(320), entidadNombre: 'Formación en Reiki',
    entidadContacto: null, recurrenteId: uuid(950), recurrencia: 'semanal',
    automatizacionId: null, origenTipo: null, anticipacionMin: null, notificadoEn: null,
    completadoEn: null, completadoPor: null, creadoPor: 'Quien atiende',
    creadoEn: enHoras(-10), actualizadoEn: null,
  },
  {
    id: uuid(943), titulo: 'Reponer los aceites esenciales', detalle: 'Comprar lavanda y árbol de té',
    notas: null, fecha: enDias(3), hora: null, prioridad: 'normal', estado: 'pendiente',
    vencido: false, categoriaId: uuid(622), categoria: 'Inventario', categoriaColor: null,
    responsableId: null, responsable: null,
    entidadTipo: 'producto', entidadId: uuid(500), entidadNombre: 'Aceite esencial de romero',
    entidadContacto: null, recurrenteId: null, recurrencia: null,
    automatizacionId: uuid(970), origenTipo: 'stock_bajo', anticipacionMin: null,
    notificadoEn: null, completadoEn: null, completadoPor: null, creadoPor: 'Quien administra',
    creadoEn: enHoras(-6), actualizadoEn: null,
  },
  {
    id: uuid(944), titulo: 'Enviar el reporte mensual del centro', detalle: null,
    notas: null, fecha: enDias(-6), hora: '17:00', prioridad: 'baja', estado: 'hecho',
    vencido: false, categoriaId: uuid(621), categoria: 'Agenda', categoriaColor: null,
    responsableId: uuid(400), responsable: 'Quien administra',
    entidadTipo: null, entidadId: null, entidadNombre: null, entidadContacto: null,
    recurrenteId: null, recurrencia: null, automatizacionId: null, origenTipo: null,
    anticipacionMin: null, notificadoEn: null, completadoEn: enHoras(-140),
    completadoPor: 'Quien administra', creadoPor: 'Quien administra',
    creadoEn: enHoras(-200), actualizadoEn: enHoras(-140),
  },
];

const RESPUESTAS: Readonly<Record<string, unknown>> = {
  /* --- Gastos ------------------------------------------------------ */
  gastos_del_rango: [
    {
      id: uuid(700), fecha: enDias(-1), descripcion: 'Renta del local', detalle: null,
      monto_centavos: 1000000, metodo: 'transferencia', efectivo_centavos: 0, metodo_resto: null,
      categoria_id: uuid(610), categoria: 'Renta', categoria_color: null, categoria_icono: null,
      proveedor_id: null, proveedor: null, referencia: 'F-2291', notas: null,
      recurrente_id: uuid(800), frecuencia: 'mensual',
      creado_por: uuid(1), usuario: 'Quien administra', creado_en: enHoras(-30),
      actualizado_en: null, eliminado: false, anulado_motivo: null, anulado_en: null,
      sustituye_a: null,
    },
    {
      id: uuid(701), fecha: enDias(-2), descripcion: 'Luz y agua', detalle: null,
      monto_centavos: 240000, metodo: 'transferencia', efectivo_centavos: 0, metodo_resto: null,
      categoria_id: uuid(611), categoria: 'Servicios', categoria_color: null, categoria_icono: null,
      proveedor_id: null, proveedor: null, referencia: null, notas: null,
      recurrente_id: null, frecuencia: null,
      creado_por: uuid(1), usuario: 'Quien administra', creado_en: enHoras(-54),
      actualizado_en: null, eliminado: false, anulado_motivo: null, anulado_en: null,
      sustituye_a: null,
    },
    {
      id: uuid(702), fecha: enDias(-3), descripcion: 'Aceites esenciales', detalle: null,
      monto_centavos: 185000, metodo: 'efectivo', efectivo_centavos: 185000, metodo_resto: null,
      categoria_id: uuid(612), categoria: 'Insumos', categoria_color: null, categoria_icono: null,
      proveedor_id: uuid(500), proveedor: 'Aromas del Valle', referencia: null, notas: null,
      recurrente_id: null, frecuencia: null,
      creado_por: uuid(1), usuario: 'Quien administra', creado_en: enHoras(-78),
      actualizado_en: null, eliminado: false, anulado_motivo: null, anulado_en: null,
      sustituye_a: null,
    },
    {
      id: uuid(703), fecha: enDias(-5), descripcion: 'Toallas y batas', detalle: null,
      monto_centavos: 320000, metodo: 'mixto', efectivo_centavos: 120000, metodo_resto: 'tarjeta',
      categoria_id: uuid(612), categoria: 'Insumos', categoria_color: null, categoria_icono: null,
      proveedor_id: null, proveedor: null, referencia: null, notas: null,
      recurrente_id: null, frecuencia: null,
      creado_por: uuid(2), usuario: 'Quien atiende', creado_en: enHoras(-126),
      actualizado_en: null, eliminado: false, anulado_motivo: null, anulado_en: null,
      sustituye_a: null,
    },
    {
      id: uuid(704), fecha: enDias(-8), descripcion: 'Reparación del calentador', detalle: null,
      monto_centavos: 450000, metodo: 'tarjeta', efectivo_centavos: 0, metodo_resto: null,
      categoria_id: uuid(613), categoria: 'Mantenimiento', categoria_color: null, categoria_icono: null,
      proveedor_id: null, proveedor: null, referencia: null, notas: null,
      recurrente_id: null, frecuencia: null,
      creado_por: uuid(1), usuario: 'Quien administra', creado_en: enHoras(-198),
      actualizado_en: null, eliminado: false, anulado_motivo: null, anulado_en: null,
      sustituye_a: null,
    },
  ],
  resumen_de_gastos: {
    totalCentavos: 2195000,
    cuantos: 5,
    dias: 31,
    promedioDiarioCentavos: 70806,
    mayor: { descripcion: 'Renta del local', centavos: 1000000 },
    anteriorCentavos: 1880000,
    hayComparacion: true,
    porCategoria: [
      { id: uuid(610), nombre: 'Renta', color: null, centavos: 1000000, cuantos: 1 },
      { id: uuid(612), nombre: 'Insumos', color: null, centavos: 505000, cuantos: 2 },
      { id: uuid(613), nombre: 'Mantenimiento', color: null, centavos: 450000, cuantos: 1 },
      { id: uuid(611), nombre: 'Servicios', color: null, centavos: 240000, cuantos: 1 },
    ],
    porMetodo: [
      { metodo: 'transferencia', centavos: 1240000, cuantos: 2 },
      { metodo: 'tarjeta', centavos: 450000, cuantos: 1 },
      { metodo: 'mixto', centavos: 320000, cuantos: 1 },
      { metodo: 'efectivo', centavos: 185000, cuantos: 1 },
    ],
    porDia: Array.from({ length: 12 }, (_, i) => ({
      fecha: enDias(-11 + i),
      centavos: [0, 0, 0, 450000, 0, 0, 320000, 0, 185000, 240000, 1000000, 0][i] ?? 0,
    })),
    efectivoCentavos: 305000,
  },
  gastos_recurrentes_del_centro: [
    {
      id: uuid(800), descripcion: 'Renta del local', detalle: null,
      monto_centavos: 1000000, metodo: 'transferencia', efectivo_centavos: 0, metodo_resto: null,
      categoria_id: uuid(610), categoria: 'Renta', categoria_color: null,
      proveedor_id: null, proveedor: null,
      frecuencia: 'mensual', fecha_inicio: enDias(-40), proxima_fecha: enDias(20),
      fecha_fin: null, estado: 'activo', notas: null, generados: 2,
    },
    {
      id: uuid(801), descripcion: 'Internet y teléfono', detalle: null,
      monto_centavos: 89000, metodo: 'transferencia', efectivo_centavos: 0, metodo_resto: null,
      categoria_id: uuid(611), categoria: 'Servicios', categoria_color: null,
      proveedor_id: null, proveedor: null,
      frecuencia: 'mensual', fecha_inicio: enDias(-70), proxima_fecha: enDias(4),
      fecha_fin: null, estado: 'activo', notas: null, generados: 3,
    },
  ],
  generar_gastos_recurrentes: 0,
  gastos_de_la_categoria: 0,

  /* --- Recordatorios ---------------------------------------------- */
  recordatorios_del_centro: { total: RECORDATORIOS.length, pagina: 1, porPagina: 10, filas: RECORDATORIOS },
  resumen_de_recordatorios: {
    diasDeProximos: 7,
    pendientes: 12, hoy: 5, vencidos: 2, proximos: 8, completados: 27, cancelados: 1, total: 40,
    horasPromedio: 18.4,
    porCategoria: [
      { id: uuid(620), nombre: 'Créditos', color: null, cuantos: 4, hechos: 1 },
      { id: uuid(621), nombre: 'Agenda', color: null, cuantos: 9, hechos: 6 },
      { id: uuid(622), nombre: 'Inventario', color: null, cuantos: 3, hechos: 2 },
    ],
    porResponsable: [
      { id: uuid(400), nombre: 'Quien administra', cuantos: 24, hechos: 18, vencidos: 1 },
      { id: uuid(401), nombre: 'Quien atiende', cuantos: 16, hechos: 9, vencidos: 1 },
    ],
    proximosRecordatorios: RECORDATORIOS.slice(0, 5).map((r) => ({
      id: r.id, titulo: r.titulo, fecha: r.fecha, hora: r.hora, prioridad: r.prioridad,
      entidadTipo: r.entidadTipo, entidadNombre: r.entidadNombre,
      categoria: r.categoria, vencido: r.vencido,
    })),
    consejo: null,
  },
  recordatorios_recurrentes_del_centro: [
    {
      id: uuid(950), titulo: 'Corte de caja del lunes', detalle: null, notas: null,
      hora: '20:00', prioridad: 'normal',
      categoriaId: uuid(621), categoria: 'Agenda',
      responsableId: uuid(400), responsable: 'Quien administra',
      entidadTipo: null, entidadId: null,
      frecuencia: 'semanal', intervalo: 1, diasSemana: [1],
      fechaInicio: enDias(-30), fechaFin: null, repeticiones: null,
      generados: 4, proximaFecha: enDias(3), estado: 'activo', anticipacionMin: null,
    },
  ],
  ajustes_de_recordatorios: {
    avisarEnNavegador: false, anticipacionMin: 30, horaPorOmision: '09:00',
    avisarAlResponsable: true, avisarAlReasignar: true, diasDeProximos: 7,
    ordenPorOmision: 'urgencia', consejo: null,
  },
  automatizaciones_de_recordatorios: [],
  historial_del_recordatorio: [
    { id: uuid(960), accion: 'creado', antes: null, despues: null,
      usuario: 'Quien administra', creado_en: enHoras(-30) },
  ],
  recordatorios_de_la_entidad: [],
  generar_recordatorios_recurrentes: 0,
  generar_recordatorios_automaticos: 0,

  /* --- Inicio ---------------------------------------------------- */
  resumen_inicio: {
    citasHoy: 6, citasPendientes: 2,
    ventasHoy: 485000, ventasAyer: 432000,
    productosBajos: 3, cursosProximos: 1,
    recordatoriosPendientes: 7, recordatoriosHoy: 5, recordatoriosVencidos: 2,
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
  /**
   * EL CATALOGO TRAE OCHO, y no cinco, a proposito.
   *
   * `npm run alcance` llena el carrito tocando esta lista para comprobar que
   * con una venta larga se sigue llegando al boton de Cobrar — que es el fallo
   * que tuvo la pantalla. Con cinco renglones el carrito no crecia lo bastante
   * como para que apareciera, y el chequeo salia en verde sin haber probado
   * nada. Un chequeo que no revisa nada es peor que no tenerlo.
   */
  catalogo_vendible: [
    ...SERVICIOS,
    { nombre: 'Ventosas y Movimiento', detalle: 'Sesión de 60 minutos' },
    { nombre: 'Reflexología Podal', detalle: 'Sesión de 45 minutos' },
    { nombre: 'Baño de Sonido Grupal', detalle: 'Sesión colectiva' },
  ].map((s, i) => ({
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
  /*
   * EL EXPEDIENTE TIENE QUE CONTESTAR ALGO, o media pantalla de Clientes no se
   * puede fotografiar.
   *
   * Estaba en `null` y el efecto era peor que no tener foto: la columna de en
   * medio se quedaba con siluetas grises latiendo para siempre. Ese hallazgo
   * destapo un fallo del producto —el expediente no distinguia "cargando" de
   * "no llego nada"— que se corrigio en `expediente.tsx`.
   *
   * Contesta SIEMPRE el mismo, sin mirar el id que le pidieron: lo que se
   * compara con el diseño es la forma de la ficha, no de quien es.
   */
  expediente_del_cliente: {
    id: uuid(200),
    nombre: PERSONAS[0],
    telefono: '646 100 2000',
    correo: 'contacto0@ejemplo.mx',
    fechaNacimiento: '1990-03-15',
    notas:
      'Prefiere sesiones por la mañana y camilla baja. Trae su propia toalla.\n' +
      'Le sienta bien el aroma de lavanda; el de eucalipto le da tos.',
    clienteDesde: enDias(-540),
    archivado: false,
    profesionalId: uuid(900),
    profesional: 'Quien atiende',
    visitas: 12,
    canceladas: 1,
    noAsistio: 0,
    ultimaVisita: { fecha: enDias(-9), servicio: 'Terapia de Relajación' },
    proximaCita: {
      id: uuid(810),
      fecha: enDias(4),
      hora: '10:00:00',
      servicio: 'Alineación Energética',
    },
    compras: 7,
    totalGastado: 625000,
    adeudo: 0,
    cursos: 2,
    servicios: [
      { nombre: 'Terapia de Relajación', veces: 6 },
      { nombre: 'Alineación Energética', veces: 4 },
      { nombre: 'Masaje Descontracturante', veces: 2 },
    ],
  },
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

  /* --- Reportes -------------------------------------------------- */
  /**
   * TODO EL REPORTE EN UNA RESPUESTA, igual que la funcion de verdad. Si aqui
   * se partiera en varias, la vitrina no probaria lo unico que de verdad hay
   * que mirar: que las ocho pestañas hablen del mismo periodo.
   *
   * La serie va con TREINTA puntos y no con cinco, y varios en cero: es la
   * forma que de verdad tiene un mes, y es la unica manera de ver si los
   * rotulos del eje se enciman o si un dia sin ventas parte la linea.
   */
  reporte_del_periodo: {
    periodo: {
      desde: enDias(-29), hasta: iso(hoy), dias: 30,
      desdeAnterior: enDias(-59), hastaAnterior: enDias(-30), paso: 'dia',
    },
    hayComparacion: true,
    metricas: {
      ingresos: 2485000, ingresosAntes: 2096000,
      ventas: 46, ventasAntes: 41,
      clientes: 32, clientesAntes: 29,
      servicios: 58, serviciosAntes: 50,
    },
    finanzas: {
      ingresos: 2485000, egresos: 625000, utilidad: 1860000, margen: 74.8,
      promedioDiario: 82833, clientesNuevos: 12, serviciosRealizados: 58, cursosVendidos: 16,
    },
    serie: Array.from({ length: 30 }, (_, i) => ({
      punto: enDias(-29 + i),
      ingresos: [
        62000, 78000, 95000, 41000, 88000, 120000, 0, 74000, 99000, 132000,
        58000, 86000, 110000, 0, 92000, 145000, 67000, 104000, 81000, 128000,
        49000, 97000, 136000, 0, 73000, 118000, 90000, 152000, 84000, 121000,
      ][i] ?? 0,
      egresos: [
        18000, 22000, 0, 31000, 19000, 45000, 0, 24000, 0, 38000,
        21000, 0, 29000, 0, 26000, 41000, 0, 33000, 18000, 47000,
        0, 28000, 39000, 0, 22000, 35000, 0, 44000, 25000, 30000,
      ][i] ?? 0,
    })),
    categorias: [
      { clave: 'servicio', monto: 1245000, cuantos: 58 },
      { clave: 'curso', monto: 640000, cuantos: 16 },
      { clave: 'producto', monto: 600000, cuantos: 71 },
    ],
    ventas: {
      cobradas: 46, canceladas: 3, ticket: 54021, maxima: 185000, minima: 12000,
      porMetodo: [
        { metodo: 'efectivo', monto: 1180000, operaciones: 24 },
        { metodo: 'tarjeta', monto: 795000, operaciones: 14 },
        { metodo: 'transferencia', monto: 480000, operaciones: 7 },
        { metodo: 'otro', monto: 30000, operaciones: 1 },
      ],
    },
    servicios: {
      realizados: 58, ingresos: 1245000,
      ranking: SERVICIOS.map((s, i) => ({
        id: uuid(300 + i), nombre: s.nombre,
        cantidad: [12, 10, 8, 7, 5][i] ?? 1,
        ingresos: [396000, 285000, 216000, 189000, 159000][i] ?? 0,
      })),
    },
    clientes: {
      totales: 128, nuevos: 12, atendidos: 32, recurrentes: 20,
      ranking: PERSONAS.slice(0, 5).map((n, i) => ({
        id: uuid(200 + i), nombre: n,
        visitas: [7, 6, 5, 4, 3][i] ?? 1,
        compras: [9, 6, 6, 4, 3][i] ?? 1,
        gastado: [248000, 196000, 174000, 132000, 98000][i] ?? 0,
      })),
    },
    productos: {
      unidades: 71, ingresos: 600000, bajos: 1, agotados: 1,
      ranking: [
        { id: uuid(500), nombre: 'Aceite esencial de romero', cantidad: 18, ingresos: 163000 },
        { id: uuid(501), nombre: 'Incienso de sándalo', cantidad: 12, ingresos: 138000 },
        { id: uuid(502), nombre: 'Cuarzo natural pulido', cantidad: 10, ingresos: 128000 },
        { id: uuid(503), nombre: 'Vela de cera de soya', cantidad: 9, ingresos: 98000 },
        { id: uuid(504), nombre: 'Aceite de almendras dulces', cantidad: 8, ingresos: 73000 },
      ],
    },
    cursos: {
      vendidos: 16, ingresos: 640000, inscritos: 34, proximos: 2, terminados: 1,
      ranking: [
        { id: uuid(400), nombre: 'Formación en Sonoterapia', cantidad: 6, ingresos: 285000, inscritos: 14, cupo: 20 },
        { id: uuid(401), nombre: 'Aromaterapia Aplicada', cantidad: 4, ingresos: 168000, inscritos: 9, cupo: 12 },
        { id: uuid(402), nombre: 'Introducción al Reiki', cantidad: 3, ingresos: 112000, inscritos: 7, cupo: null },
        { id: uuid(403), nombre: 'Masaje Terapéutico I', cantidad: 3, ingresos: 75000, inscritos: 4, cupo: 10 },
      ],
    },
    gastos: {
      total: 625000, cuantos: 9, promedio: 69444, mayor: 185000, menor: 12000,
      categorias: [
        { categoria: 'Renta', monto: 250000, cuantos: 1 },
        { categoria: 'Insumos', monto: 185000, cuantos: 4 },
        { categoria: 'Mantenimiento', monto: 120000, cuantos: 2 },
        { categoria: 'Servicios', monto: 70000, cuantos: 2 },
      ],
    },
    caja: {
      ventas: 1180000, ingresosManuales: 45000, retiros: 320000, gastosDeCaja: 185000,
      movimientos: 38, descuadre: -4500,
      cortes: [
        {
          id: uuid(900), nombre: 'Caja del mostrador', cerradaEn: enHoras(-30),
          saldoInicial: 100000, esperado: 742000, contado: 739500, diferencia: -2500,
        },
        {
          id: uuid(901), nombre: 'Caja del mostrador', cerradaEn: enHoras(-102),
          saldoInicial: 100000, esperado: 518000, contado: 516000, diferencia: -2000,
        },
      ],
    },
  },
  reportes_guardados: [
    {
      id: uuid(950), nombre: 'Cierre del mes anterior', tipo: 'resumen',
      desde: enDias(-59), hasta: enDias(-30), filtros: {},
      creadoEn: enHoras(-200), creadoPor: 'Quien administra',
    },
    {
      id: uuid(951), nombre: 'Servicios de la temporada', tipo: 'servicios',
      desde: enDias(-89), hasta: enDias(-30), filtros: { tipo: 'servicio' },
      creadoEn: enHoras(-320), creadoPor: 'Quien administra',
    },
    {
      id: uuid(952), nombre: 'Cobros en efectivo', tipo: 'ventas',
      desde: enDias(-29), hasta: iso(hoy), filtros: { metodo: 'efectivo' },
      creadoEn: enHoras(-48), creadoPor: 'Quien atiende',
    },
  ],

  /* --- Configuracion ---------------------------------------------- */
  /**
   * EL CENTRO DE MENTIRAS SE LLAMA COMO EL DE VERDAD, y es el unico caso.
   *
   * El nombre y el lema del producto son los que salen en la barra lateral de
   * TODAS las fotos: cambiarlos aqui haria que las trece capturas anteriores
   * dejaran de parecerse al diseño por un motivo que no tiene nada que ver con
   * lo que se esta revisando. Todo lo demas de este bloque —telefono,
   * direccion, RFC— es utileria, y se nota que lo es.
   */
  configuracion_del_centro: {
    nombre: 'Centro Holístico',
    centro: {
      lema: 'Bienestar & Terapias',
      telefono: '646 000 0000',
      correo: 'contacto@ejemplo.mx',
      sitio: 'ejemplo.mx',
      direccion: 'Avenida de ejemplo 100',
      ciudad: 'Ensenada',
      zonaHoraria: 'America/Tijuana',
      moneda: 'MXN',
      decimales: 2,
      impuestoNombre: 'IVA',
      impuestoTasa: 16,
      impuestoIncluido: true,
      metodosDePago: ['efectivo', 'tarjeta', 'transferencia'],
      rfc: '',
      razonSocial: '',
      regimenFiscal: '',
      direccionFiscal: '',
      pieDeComprobante: '',
      tema: 'sistema',
      menosMovimiento: false,
      horarios: [
        { dia: 1, cerrado: false, abre: '09:00', cierra: '19:00' },
        { dia: 2, cerrado: false, abre: '09:00', cierra: '19:00' },
        { dia: 3, cerrado: false, abre: '09:00', cierra: '19:00' },
        { dia: 4, cerrado: false, abre: '09:00', cierra: '19:00' },
        { dia: 5, cerrado: false, abre: '09:00', cierra: '19:00' },
        { dia: 6, cerrado: false, abre: '09:00', cierra: '14:00' },
        { dia: 7, cerrado: true, abre: '09:00', cierra: '19:00' },
      ],
    },
    creadoEn: enHoras(-8000),
    miembros: 2,
  },
  /**
   * LA DEMOSTRACION, SIN CARGAR.
   *
   * `puede` va en true por la misma razon que todos los permisos de la vitrina:
   * la foto tiene que enseñar la pantalla COMPLETA. En la aplicacion de verdad
   * lo decide la base comparando el correo del token, y aqui no hay token.
   */
  datos_de_demostracion: {
    puede: true,
    cargada: false,
    filas: 0,
    sembradaEn: null,
    ultimoPaso: 0,
    completa: false,
    pasos: 9,
    porTabla: {},
  },
  licencia_del_centro: {
    administrada: true,
    plan: 'Plan de ejemplo',
    estado: 'activa',
    expiraEn: enDias(28),
    actualizadaEn: enHoras(-200),
    permiteGuardar: true,
  },
  actividad_reciente_del_centro: [
    {
      id: uuid(980), ocurridoEn: enHoras(-2), usuario: 'Quien administra',
      modulo: 'configuracion', accion: 'editar', entidad: 't_vitrina',
    },
    {
      id: uuid(981), ocurridoEn: enHoras(-20), usuario: 'Quien administra',
      modulo: 'clientes', accion: 'crear', entidad: uuid(200),
    },
    {
      id: uuid(982), ocurridoEn: enHoras(-30), usuario: 'Quien atiende',
      modulo: 'caja', accion: 'cobrar', entidad: uuid(701),
    },
  ],
  equipo_del_centro: {
    miembros: [
      {
        id: uuid(400), usuarioId: uuid(1), correo: 'administra@ejemplo.mx',
        nombre: 'Quien administra', rol: 'dueno', rolEtiqueta: 'Dueña',
        activo: true, eliminado: false, permisos: null, soyYo: true, creadoEn: enHoras(-8000),
      },
      {
        id: uuid(401), usuarioId: uuid(2), correo: 'atiende@ejemplo.mx',
        nombre: 'Quien atiende', rol: 'terapeuta', rolEtiqueta: 'Terapeuta',
        activo: true, eliminado: false, permisos: null, soyYo: false, creadoEn: enHoras(-4000),
      },
    ],
    invitaciones: [
      {
        id: uuid(402), correo: 'recepcion@ejemplo.mx', nombre: 'Quien recibe',
        rol: 'recepcion', rolEtiqueta: 'Recepción', creadaEn: enHoras(-10),
      },
    ],
    duenosActivos: 1,
  },
  roles_del_centro: [
    { id: 'dueno', etiqueta: 'Dueña', permisos: {}, activo: true, cuantos: 1 },
    {
      id: 'recepcion', etiqueta: 'Recepción', activo: true, cuantos: 0,
      permisos: { gestionarClientes: true, gestionarAgenda: true, cobrar: true },
    },
    {
      id: 'terapeuta', etiqueta: 'Terapeuta', activo: true, cuantos: 1,
      permisos: { gestionarClientes: true, gestionarAgenda: true, verExpediente: true },
    },
  ],
  bitacora_del_centro: {
    total: 3,
    pagina: 1,
    porPagina: 20,
    modulos: ['caja', 'clientes', 'configuracion'],
    gente: [
      { id: uuid(1), nombre: 'Quien administra' },
      { id: uuid(2), nombre: 'Quien atiende' },
    ],
    filas: [
      {
        id: uuid(980), ocurridoEn: enHoras(-2), usuarioId: uuid(1),
        usuario: 'Quien administra', rol: 'Dueña', modulo: 'configuracion',
        accion: 'editar', detalle: null, entidad: 't_vitrina',
        antes: null, despues: null, motivo: null,
      },
      {
        id: uuid(981), ocurridoEn: enHoras(-20), usuarioId: uuid(1),
        usuario: 'Quien administra', rol: 'Dueña', modulo: 'clientes',
        accion: 'crear', detalle: null, entidad: uuid(200),
        antes: null, despues: null, motivo: null,
      },
      {
        id: uuid(982), ocurridoEn: enHoras(-30), usuarioId: uuid(2),
        usuario: 'Quien atiende', rol: 'Terapeuta', modulo: 'caja',
        accion: 'cobrar', detalle: null, entidad: uuid(701),
        antes: null, despues: null, motivo: null,
      },
    ],
  },
  exportar_del_centro: { que: 'clientes', total: 0, entregadas: 0, tope: 5000, filas: [] },

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
    { id: uuid(610), nombre: 'Renta', color: null, ambito: 'gasto', orden: 0, usos: 1 },
    { id: uuid(611), nombre: 'Servicios', color: null, ambito: 'gasto', orden: 1, usos: 3 },
    { id: uuid(612), nombre: 'Insumos', color: null, ambito: 'gasto', orden: 2, usos: 2 },
    { id: uuid(613), nombre: 'Mantenimiento', color: null, ambito: 'gasto', orden: 3, usos: 1 },
    { id: uuid(620), nombre: 'Créditos', color: null, ambito: 'recordatorio', orden: 0, usos: 4 },
    { id: uuid(621), nombre: 'Agenda', color: null, ambito: 'recordatorio', orden: 1, usos: 9 },
    { id: uuid(622), nombre: 'Inventario', color: null, ambito: 'recordatorio', orden: 2, usos: 3 },
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
      updateUser: () => Promise.resolve({ data: { user: null }, error: null }),
      /*
       * EL SEGUNDO FACTOR, DE MENTIRAS Y VACIO A PROPOSITO.
       *
       * La pantalla de Seguridad pregunta que factores hay antes de pintar
       * nada. Sin esta pieza, la vitrina revienta al abrirla y la foto sale de
       * una pantalla en blanco — que es exactamente el fallo que la vitrina
       * existe para cachar, pero causado por la propia vitrina.
       *
       * Contesta que NO hay ninguno: es el estado en el que se ve el camino
       * completo de dar de alta, que es lo que hay que poder mirar.
       */
      mfa: {
        listFactors: () => Promise.resolve({ data: { all: [], totp: [] }, error: null }),
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }),
        enroll: () => Promise.resolve({ data: null, error: { message: 'La vitrina no da de alta nada.' } }),
        challengeAndVerify: () =>
          Promise.resolve({ data: null, error: { message: 'La vitrina no verifica nada.' } }),
        unenroll: () => Promise.resolve({ data: null, error: null }),
      },
    },
  };
}

export function clienteParaLaBase(): unknown {
  return supabase();
}
