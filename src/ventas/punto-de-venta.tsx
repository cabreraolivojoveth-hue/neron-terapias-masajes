/**
 * VENTAS — el punto de venta.
 *
 * ES EL ORQUESTADOR DE LA OPERACION, Y NO ES DUEÑO DE CASI NADA. El cliente es
 * de Clientes, el servicio de Servicios, el producto y su stock de Productos,
 * el cupo de Cursos, el dinero de Caja. Aqui no hay ni un catalogo propio: se
 * piden los tres a la vez con `catalogo_vendible`. Mantener copias obligaria a
 * sincronizarlas, y el dia que fallara se venderia algo que ya no existe.
 *
 * COBRAR ES UNA SOLA LLAMADA. `registrar_venta` valida stock y cupo, calcula
 * los totales EN EL SERVIDOR, guarda la foto de cada renglon, mueve el
 * inventario, inscribe en el curso, registra los pagos y mete el dinero a la
 * caja — todo en una transaccion. Diez llamadas desde aqui dejarian el sistema
 * partido en cuanto una fallara: venta cobrada sin bajar stock, o stock bajado
 * sin ingreso en caja. Y nadie se entera hasta que el inventario no cuadra
 * tres meses despues.
 *
 * EL PRECIO NO VIAJA DESDE AQUI. Se manda QUE se vende y CUANTO se paga; el
 * precio lo pone el servidor. Aceptar el del navegador es dejar que el cliente
 * decida cuanto paga.
 *
 * LA LLAVE DE IDEMPOTENCIA SE GENERA UNA VEZ POR CARRITO, no por clic. El
 * boton deshabilitado ayuda, pero no es la defensa: una red lenta reintenta
 * sola y la pestaña de al lado no sabe de este boton.
 *
 * EL CARRITO NO SE VACIA HASTA QUE EL SERVIDOR CONFIRMA. Si falla, se queda
 * todo puesto con el mensaje exacto —"Solo quedan 3 de X"— y se vuelve a
 * intentar sin recapturar.
 */

import { tomarIntencion, useNavegacion } from '@neron/base/marco';
import { hoy, uid, type Fecha } from '@neron/base/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  traerCitaParaCobrar,
  traerProfesionales,
  type CitaParaCobrar,
  type ProfesionalBreve,
} from '../datos/citas.js';
import {
  LO_QUE_TOCA_UN_CLIENTE,
  buscarPosibleDuplicado,
  crearCliente,
  llaveDeClientes,
  llaveDelExpediente,
  traerClientes,
  traerExpediente,
  type ClienteEnLista,
  type DatosDeCliente,
  type ExpedienteDeCliente,
  type PaginaDeClientes,
} from '../datos/clientes.js';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  METODOS_DE_PAGO,
  llaveDeLaConfiguracion,
  traerConfiguracion,
  type ConfiguracionDelCentro,
} from '../datos/configuracion.js';
import {
  LO_QUE_TOCA_UNA_VENTA,
  cancelarVenta,
  guardarCotizacion,
  llaveDelCalendarioDeVentas,
  llaveDeCotizaciones,
  llaveDeLaFichaDeVenta,
  llaveDelCatalogo,
  llaveDelResumenDeVentas,
  llaveDeVentas,
  marcarCotizacion,
  marcarCotizacionConvertida,
  registrarVenta,
  traerCalendarioDeVentas,
  traerCatalogoVendible,
  traerCotizaciones,
  traerFichaDeVenta,
  traerItemsDeCotizacion,
  traerResumenDeVentas,
  traerVentas,
  totalDelCarrito,
  type ConceptoVendible,
  type CotizacionEnLista,
  type DiaConVentas,
  type FichaDeVenta,
  type MetodoDePago,
  type PagoDelCarrito,
  type PaginaDeVentas,
  type RenglonDelCarrito,
  type ResumenDeVentas,
} from '../datos/ventas.js';
import { FICHA_VACIA, FichaDeCliente } from '../clientes/ficha.js';
import { useSesion } from '../identidad/sesion.js';
import { Icono } from '../ui/iconos.js';
import { Carrito } from './carrito.js';
import { AplicarDescuento, Cobro } from './cobro.js';
import { EstadisticasDelDia } from './cifras-del-dia.js';
import { DetalleDeVenta } from './detalle-de-venta.js';
import { CalendarioDelHistorial, EN_NINGUN_LADO, type DondeEstoy } from './calendario-del-historial.js';
import { Cotizaciones, Historial } from './historial.js';
import { InformacionDelCliente, QuienCompra } from './quien-compra.js';

/** Cuanto se espera antes de consultar mientras alguien escribe. */
const ESPERA_MS = 300;

/** Hasta donde llega el historial hacia atras. */
const DIAS_DE_HISTORIAL = 365;

export const PESTANAS: readonly { clave: string; etiqueta: string }[] = [
  { clave: 'nueva', etiqueta: 'Nueva venta' },
  { clave: 'dia', etiqueta: 'Ventas del día' },
  { clave: 'historial', etiqueta: 'Historial de ventas' },
  { clave: 'cotizaciones', etiqueta: 'Cotizaciones' },
];

/** Un concepto del catalogo, convertido en renglon del carrito. */
export function comoRenglon(c: ConceptoVendible): RenglonDelCarrito {
  return {
    tipo: c.tipo,
    id: c.id,
    nombre: c.nombre,
    precioCentavos: c.precioCentavos,
    cantidad: 1,
    descuentoCentavos: 0,
    disponible: c.disponible,
  };
}

/**
 * Mete un concepto en el carrito.
 *
 * Si ya estaba, SUBE la cantidad en vez de repetir el renglon: dos renglones
 * del mismo producto se ven como un error de captura y ademas hacen imposible
 * saber de un vistazo cuantos se llevan.
 */
export function agregarAlCarrito(
  renglones: readonly RenglonDelCarrito[],
  c: ConceptoVendible,
): RenglonDelCarrito[] {
  const i = renglones.findIndex((r) => r.tipo === c.tipo && r.id === c.id);
  if (i < 0) return [...renglones, comoRenglon(c)];
  const antes = renglones[i]!;
  if (antes.disponible !== null && antes.cantidad >= antes.disponible) return [...renglones];
  return renglones.map((r, j) => (j === i ? { ...r, cantidad: r.cantidad + 1 } : r));
}

/** Una fecha, tantos dias antes. Sin `new Date(texto)`, que mueve el dia. */
export function diasAntes(fecha: Fecha, dias: number): Fecha {
  const [d, m, a] = fecha.split('/').map(Number);
  if (!d || !m || !a) return fecha;
  const t = new Date(Date.UTC(a, m - 1, d));
  t.setUTCDate(t.getUTCDate() - dias);
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${t.getUTCFullYear()}`;
}

export interface PropiedadesDelPuntoDeVenta {
  /**
   * Puesto por el Mostrador, que ya pinta el encabezado y la barra de pestañas
   * de la pantalla entera. Sin esto saldrian DOS titulos y DOS barras, una
   * debajo de la otra.
   */
  readonly sinEncabezado?: boolean;
  /** Cual seccion enseñar. Cuando la manda el padre, el padre es el dueño. */
  readonly pestana?: string;
  /**
   * Para avisarle al padre que aqui adentro hizo falta cambiar de seccion —al
   * guardar una cotizacion, o al leer un recado que pide abrir una venta. Sin
   * esto, la barra de arriba se quedaria marcando una pestaña y el contenido
   * enseñando otra.
   */
  onPestana?: (pestana: string) => void;
}

export function PuntoDeVenta({
  sinEncabezado = false,
  pestana: pestanaDeArriba,
  onPestana,
}: PropiedadesDelPuntoDeVenta = {}) {
  const { acceso } = useSesion();
  const { ir } = useNavegacion();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  const puedeCobrar = permisos['cobrar'] === true;
  const puedeCrearCliente = permisos['gestionarClientes'] === true;
  // Cambiar de vendedor mueve a quien se le atribuye la comision: es de quien
  // administra a las personas, no de quien cobra.
  const puedeCambiarVendedor = permisos['gestionarUsuarios'] === true || acceso?.esDueno === true;
  // El descuento cambia lo que el cliente paga. Va con las finanzas.
  const puedeDescontar = permisos['verFinanzas'] === true || acceso?.esDueno === true;

  const [dia] = useState<Fecha>(() => hoy());

  /* --- La pestaña y la venta abierta -------------------------------- */

  /**
   * LA PESTAÑA PUEDE SER DE AQUI O DE ARRIBA, y funciona igual en los dos casos.
   *
   * Suelto —como se uso hasta ahora— este componente manda su seccion. Dentro
   * del Mostrador la manda el padre, porque la barra de pestañas es una sola
   * para el cobro y para el cajon. `setPestana` sirve para las dos: si hay padre
   * le avisa, y si no se lo guarda. Asi las veinte llamadas a `setPestana` que
   * ya habia siguen valiendo sin tocarlas — que es lo que evito reescribir
   * seiscientas lineas al unir Ventas con Caja.
   */
  const [pestanaPropia, setPestanaPropia] = useState('nueva');
  const laManadaArriba = pestanaDeArriba !== undefined;
  const pestana = laManadaArriba ? pestanaDeArriba : pestanaPropia;
  const setPestana = (p: string): void => {
    if (onPestana) onPestana(p);
    if (!laManadaArriba) setPestanaPropia(p);
  };
  const [abierta, setAbierta] = useState<string | null>(null);

  /* --- El carrito --------------------------------------------------- */

  const [renglones, setRenglones] = useState<readonly RenglonDelCarrito[]>([]);
  const [escrito, setEscrito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [notas, setNotas] = useState('');
  const [notaAbierta, setNotaAbierta] = useState(false);

  const [clienteId, setClienteId] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [escritoCliente, setEscritoCliente] = useState('');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [nuevoCliente, setNuevoCliente] = useState(false);

  const [fecha, setFecha] = useState<Fecha>(() => hoy());
  const [vendedorId, setVendedorId] = useState('');
  const [vendedorTocado, setVendedorTocado] = useState(false);

  const [descuentoCentavos, setDescuentoCentavos] = useState(0);
  const [descuentoEscrito, setDescuentoEscrito] = useState('');
  const [descuentoEnPorcentaje, setDescuentoEnPorcentaje] = useState(false);
  const [pagos, setPagos] = useState<readonly PagoDelCarrito[]>([]);
  const [metodoPuesto, setMetodoPuesto] = useState('');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [cotizacionDeOrigen, setCotizacionDeOrigen] = useState<string | null>(null);
  const [cobrada, setCobrada] = useState<string | null>(null);

  /**
   * LA CITA DE LA QUE SALE ESTE COBRO. Vacio en una venta de mostrador.
   *
   * Viaja hasta `cobrar_cita`, que en la misma transaccion ata la venta a la
   * cita y la deja completada. Es lo que impide que la misma sesion se cobre
   * dos veces: sin el id, la segunda venta seria una venta suelta mas y nada
   * la relacionaria con la primera.
   */
  const [citaDeOrigen, setCitaDeOrigen] = useState<string | null>(null);
  const [cargandoCita, setCargandoCita] = useState(false);
  /** Lo que se enseña arriba del carrito: de que sesion salio esto. */
  const [citaCargada, setCitaCargada] = useState<CitaParaCobrar | null>(null);

  /**
   * LA LLAVE DE IDEMPOTENCIA, UNA POR CARRITO.
   *
   * Se genera al montar y se renueva SOLO cuando la venta se cobro de verdad.
   * Si se generara en cada clic, el doble clic mandaria dos llaves distintas y
   * el servidor no tendria como saber que son la misma venta.
   */
  const llave = useRef(uid('venta'));

  /* --- Los filtros del historial ------------------------------------ */

  const [escritoEnLista, setEscritoEnLista] = useState('');
  const [busquedaEnLista, setBusquedaEnLista] = useState('');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);

  /**
   * DONDE ESTOY DENTRO DEL HISTORIAL: mes, semana y dia.
   *
   * Vive aqui y no dentro del panel porque de esto depende QUE se le pide al
   * servidor: escoger un dia cambia el rango de la consulta de ventas. Con el
   * estado dentro del panel habria que subirlo por un callback para lo mismo,
   * y ademas se perderia al cambiar de pestaña y volver.
   */
  const [donde, setDonde] = useState<DondeEstoy>(EN_NINGUN_LADO);

  /**
   * CUANTAS SE VEN DE GOLPE EN "VENTAS DEL DIA".
   *
   * Arranca en CUATRO y crece de cuatro en cuatro. Un dia normal son treinta o
   * cuarenta ventas: soltarlas todas al entrar convierte la pestaña en un muro
   * de renglones donde no se distingue nada, y lo que casi siempre se busca es
   * "la de hace un rato" — que esta arriba.
   *
   * El buscador NO depende de esto: filtra sobre el dia completo en el
   * servidor, no sobre las cuatro que se ven. Filtrar sobre lo visible seria
   * decirle a alguien que su venta no existe porque estaba en la quinta fila.
   *
   * El HISTORIAL conserva sus diez por pagina: ahi se busca entre un año y
   * paginar de cuatro en cuatro seria interminable.
   */
  const [cuantasDelDia, setCuantasDelDia] = useState(4);
  const porPagina = pestana === 'dia' ? cuantasDelDia : 10;

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(escrito.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [escrito]);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaCliente(escritoCliente.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [escritoCliente]);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaEnLista(escritoEnLista.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [escritoEnLista]);

  useEffect(() => setPagina(1), [busquedaEnLista, estado, pestana]);

  /* --- Lo que se le pide al servidor -------------------------------- */

  /*
   * LO QUE MANDA CONFIGURACION SOBRE EL MOSTRADOR.
   *
   * De aqui salen los metodos de pago que se ofrecen y el impuesto que se
   * desglosa. Ventas NO guarda copia de ninguno de los dos: los pregunta. Con
   * una copia, apagar la tarjeta en Configuracion no cambiaria nada aqui — que
   * es justo la configuracion aislada que el encargo prohibe.
   *
   * Comparte llave de cache con la barra lateral, con Agenda y con el propio
   * modulo de Configuracion: es UNA consulta para todos.
   */
  const configuracion = useConsulta<ConfiguracionDelCentro>(
    negocio ? llaveDeLaConfiguracion(negocio) : null,
    () => traerConfiguracion(negocio),
  );

  const catalogo = useConsulta<ConceptoVendible[]>(
    negocio && (busqueda || tipo) ? llaveDelCatalogo(negocio, busqueda, tipo) : null,
    () => traerCatalogoVendible(negocio, busqueda, tipo),
  );

  const clientes = useConsulta<PaginaDeClientes>(
    negocio && busquedaCliente
      ? llaveDeClientes(negocio, { busqueda: busquedaCliente }, 1, 6)
      : null,
    () => traerClientes(negocio, { busqueda: busquedaCliente }, 1, 6),
  );

  /**
   * LOS ULTIMOS CLIENTES, para que el buscador no arranque en blanco.
   *
   * Es la misma consulta de siempre SIN texto: los que devuelve `clientes_del_centro`
   * por omision, que vienen del propio centro. Un centro recien abierto no
   * tiene ninguno y entonces no se enseña nada — no se rellena con nadie.
   *
   * Se piden TRES, que es lo que cabe sin tapar el resto del formulario, y solo
   * mientras no hay cliente escogido: con uno puesto la lista no se pinta y
   * pedirla seria un viaje al servidor por algo que nadie va a ver.
   */
  const recientes = useConsulta<PaginaDeClientes>(
    negocio && !clienteId ? llaveDeClientes(negocio, {}, 1, 3) : null,
    () => traerClientes(negocio, {}, 1, 3),
  );

  const vendedores = useConsulta<ProfesionalBreve[]>(
    negocio ? `profesionales:${negocio}` : null,
    () => traerProfesionales(negocio),
  );

  const expediente = useConsulta<ExpedienteDeCliente | null>(
    clienteId ? llaveDelExpediente(clienteId) : null,
    () => traerExpediente(clienteId, dia),
  );

  const resumen = useConsulta<ResumenDeVentas>(
    negocio ? llaveDelResumenDeVentas(negocio, dia) : null,
    () => traerResumenDeVentas(negocio, dia),
  );

  const desdeHistorial = useMemo(() => diasAntes(dia, DIAS_DE_HISTORIAL), [dia]);
  const filtrosDeLista = useMemo(
    () => ({ busqueda: busquedaEnLista, estado: estado as '' | 'cobrada' | 'cancelada' }),
    [busquedaEnLista, estado],
  );

  /**
   * EL CALENDARIO DEL HISTORIAL: un renglon por dia CON ventas.
   *
   * Un año de un centro ocupado son unos trescientos renglones minusculos, y
   * de ahi salen los tres niveles —mes, semana y dia— sumando hacia arriba. La
   * alternativa era traerse las quinientas ventas enteras para pintar doce
   * renglones de meses.
   *
   * NO depende del buscador ni del filtro de estado: el calendario dice lo que
   * HAY en cada periodo, y si se recortara con lo que hay escrito arriba, las
   * cifras de los meses cambiarian mientras alguien escribe.
   */
  const calendario = useConsulta<DiaConVentas[]>(
    negocio && pestana === 'historial'
      ? llaveDelCalendarioDeVentas(negocio, desdeHistorial, dia)
      : null,
    () => traerCalendarioDeVentas(negocio, desdeHistorial, dia),
  );

  /*
   * CON UN DIA ESCOGIDO SE LE PIDE AL SERVIDOR ESE DIA, no se filtra lo que ya
   * llego: lo que llego son diez ventas de una pagina, y filtrar sobre eso
   * diria que un dia no tiene ventas porque cayeron en la pagina cuatro.
   */
  const desdeLista = donde.dia || desdeHistorial;
  const hastaLista = donde.dia || dia;

  const historial = useConsulta<PaginaDeVentas>(
    negocio && pestana === 'historial'
      ? llaveDeVentas(negocio, desdeLista, hastaLista, filtrosDeLista, pagina, porPagina)
      : null,
    () => traerVentas(negocio, desdeLista, hastaLista, filtrosDeLista, pagina, porPagina),
  );

  const delDiaFiltrado = useConsulta<PaginaDeVentas>(
    negocio && pestana === 'dia'
      ? llaveDeVentas(negocio, dia, dia, filtrosDeLista, pagina, porPagina)
      : null,
    () => traerVentas(negocio, dia, dia, filtrosDeLista, pagina, porPagina),
  );

  const cotizaciones = useConsulta<CotizacionEnLista[]>(
    negocio && pestana === 'cotizaciones' ? llaveDeCotizaciones(negocio) : null,
    () => traerCotizaciones(negocio),
  );

  const ficha = useConsulta<FichaDeVenta | null>(
    abierta ? llaveDeLaFichaDeVenta(abierta) : null,
    () => traerFichaDeVenta(abierta!),
  );

  /* --- Lo que cambia datos ------------------------------------------ */

  const cobro = useOperacion(registrarVenta, [...LO_QUE_TOCA_UNA_VENTA]);
  const cancelacion = useOperacion(cancelarVenta, [...LO_QUE_TOCA_UNA_VENTA]);
  const cotizacion = useOperacion(guardarCotizacion, [...LO_QUE_TOCA_UNA_VENTA]);
  const marcada = useOperacion(marcarCotizacion, [...LO_QUE_TOCA_UNA_VENTA]);
  const conversion = useOperacion(marcarCotizacionConvertida, [...LO_QUE_TOCA_UNA_VENTA]);
  const alta = useOperacion(crearCliente, [...LO_QUE_TOCA_UN_CLIENTE]);

  /** El vendedor arranca en QUIEN ESTA COBRANDO, no vacio. */
  useEffect(() => {
    if (vendedorTocado || vendedorId) return;
    const yo = (vendedores.datos ?? []).find((v) => v.usuarioId === acceso?.usuarioId);
    if (yo) setVendedorId(yo.id);
  }, [vendedores.datos, acceso?.usuarioId, vendedorId, vendedorTocado]);

  /** EL RECADO DE QUIEN NOS MANDO, que se consume UNA sola vez. */
  const recadoLeido = useRef(false);
  useEffect(() => {
    if (recadoLeido.current) return;
    recadoLeido.current = true;
    const recado = tomarIntencion('ventas');
    if (!recado) return;
    if (recado.accion === 'abrir' && recado.detalle) {
      setPestana('historial');
      setAbierta(recado.detalle);
    } else if (recado.accion === 'nueva') {
      setPestana('nueva');
    } else if (recado.accion === 'cotizar') {
      setPestana('cotizaciones');
    } else if (recado.accion === 'cobrar-cita' && recado.detalle) {
      // Llega desde la Agenda, al completar una sesion. El carrito se arma
      // solo con lo que la cita ya sabia.
      setPestana('nueva');
      void cargarLaCita(recado.detalle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Las acciones del carrito ------------------------------------- */

  const total = totalDelCarrito(renglones, descuentoCentavos);

  function limpiarCarrito(): void {
    setRenglones([]);
    setPagos([]);
    setMetodoPuesto('');
    setDescuentoCentavos(0);
    setDescuentoEscrito('');
    setEfectivoRecibido('');
    setNotas('');
    setNotaAbierta(false);
    setClienteId('');
    setClienteNombre('');
    setEscritoCliente('');
    setEscrito('');
    setCotizacionDeOrigen(null);
    setCitaDeOrigen(null);
    setCitaCargada(null);
    // Carrito nuevo, llave nueva: si no, la venta siguiente se confundiria con
    // la anterior y el servidor devolveria la vieja sin cobrar nada.
    llave.current = uid('venta');
  }

  /**
   * ARMA EL CARRITO CON LO QUE LA CITA YA SABIA.
   *
   * Es la mitad de Caja del encargo "Agenda → cita completada → cobro". Se
   * vuelve a preguntar a la base en vez de recibir los datos en el recado, y
   * eso importa: asi el precio es el de HOY —con su promocion si la hay— y no
   * el que la Agenda tenia cargado desde hace media hora.
   *
   * SI YA SE COBRO, NO SE ARMA NADA. Se dice con el folio delante y se deja el
   * carrito vacio: llenarlo invitaria a cobrar la misma sesion dos veces, y
   * aunque la base lo rechaza, el mejor error es el que no llega a intentarse.
   */
  async function cargarLaCita(citaId: string): Promise<void> {
    setCargandoCita(true);
    try {
      const c = await traerCitaParaCobrar(citaId, dia);
      if (!c) return;
      setCitaCargada(c);
      if (c.ventaId) return;

      setRenglones([{
        tipo: 'servicio',
        id: c.servicioId,
        nombre: c.servicio,
        precioCentavos: c.precioCentavos,
        cantidad: 1,
        descuentoCentavos: 0,
        // Un servicio no se agota: no hay un numero de sesiones en existencia.
        disponible: null,
      }]);
      setClienteId(c.clienteId);
      setClienteNombre(c.cliente);
      setEscritoCliente(c.cliente);
      setCitaDeOrigen(c.id);
      /*
       * EL VENDEDOR ARRANCA EN QUIEN DIO LA SESION, no en quien esta cobrando.
       *
       * Es lo que casi siempre es verdad —y lo que hace que la comision caiga
       * donde toca—. Se marca como "tocado" para que el efecto que pone al
       * usuario de la sesion no lo pise medio segundo despues.
       */
      if (c.profesionalId) {
        setVendedorId(c.profesionalId);
        setVendedorTocado(true);
      }
    } finally {
      setCargandoCita(false);
    }
  }

  /** Escoger un metodo pone el total completo en ese metodo. */
  function escogerMetodo(clave: string): void {
    setMetodoPuesto(clave);
    if (clave === 'mixto') {
      // El reparto arranca con lo que ya hubiera; si no hay nada, en blanco.
      if (pagos.length === 0) setPagos([{ metodo: 'efectivo', montoCentavos: 0 }]);
      return;
    }
    setPagos([{ metodo: clave as MetodoDePago, montoCentavos: total }]);
  }

  async function cobrar(): Promise<void> {
    const r = await cobro.ejecutar(negocio, {
      renglones,
      pagos,
      clienteId,
      vendedorId,
      descuentoCentavos,
      efectivoRecibidoCentavos:
        efectivoRecibido === '' ? null : Number(efectivoRecibido.replace(/[^\d]/g, '')) * 100,
      notas,
      llave: llave.current,
      // Con cita, el servidor cobra con `cobrar_cita`: misma transaccion, mas
      // el enlace con la cita y el estado completada.
      ...(citaDeOrigen ? { citaId: citaDeOrigen } : {}),
    });
    // NO SE VACIA NADA hasta que el servidor confirma. Si fallo, todo sigue
    // puesto y el mensaje exacto —"Solo quedan 3 de X"— esta en pantalla.
    if (r === null) return;
    if (cotizacionDeOrigen) await conversion.ejecutar(cotizacionDeOrigen, r);
    setCobrada(r);
    limpiarCarrito();
  }

  async function cotizar(): Promise<void> {
    const r = await cotizacion.ejecutar(
      negocio,
      renglones,
      clienteId,
      vendedorId,
      descuentoCentavos,
      notas,
    );
    if (r === null) return;
    limpiarCarrito();
    setPestana('cotizaciones');
  }

  async function convertir(c: CotizacionEnLista): Promise<void> {
    // SE VUELVE A CONSULTAR EL CATALOGO al convertir: entre la propuesta y el
    // si pudo subir el precio o acabarse el producto. Los precios los vuelve a
    // poner el servidor al cobrar; aqui solo se arma el carrito.
    const items = await traerItemsDeCotizacion(c.id);
    setRenglones(items);
    setClienteId(c.clienteId ?? '');
    setClienteNombre(c.cliente ?? '');
    setCotizacionDeOrigen(c.id);
    setPagos([]);
    setMetodoPuesto('');
    setPestana('nueva');
  }

  async function darDeAlta(datos: DatosDeCliente): Promise<void> {
    const r = await alta.ejecutar(negocio, datos);
    if (r === null) return;
    setClienteId(r.id);
    setClienteNombre(r.nombre);
    setNuevoCliente(false);
    setEscritoCliente('');
  }

  const listaDeLaPestana = pestana === 'dia' ? delDiaFiltrado : historial;

  return (
    /* Dentro del Mostrador no es una pantalla: es el cuerpo de una pestaña. Sin
       "mv-pantalla" no vuelve a animar la entrada encima de la del padre. */
    <div
      className={
        sinEncabezado ? 'pz-pantalla vta' : 'pz-pantalla vta mv-pantalla'
      }
    >
      {/*
        DENTRO DEL MOSTRADOR SE VA EL TITULO, PERO NO LAS ACCIONES.

        El titulo lo pinta el padre. El buscador de ventas y los dos botones si
        son de aqui, y esconderlos junto con el encabezado los habria dejado
        inalcanzables. Sin el bloque de texto al lado, la fila se acomoda sola.
      */}
      <header className="pz-encabezado">
        {sinEncabezado ? null : (
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">Ventas</h2>
          <p className="tt-lema">Registra ventas de servicios, productos y cursos</p>
        </div>
        )}
        {/*
          AQUI HABIA DOS BOTONES QUE HACIAN LO MISMO.

          "Nueva cotizacion" y "Nueva venta" corrian EXACTAMENTE el mismo codigo
          —limpiar el carrito e ir a Cobrar—, uno pegado al otro. De ahi que
          "Nueva venta" pareciera un boton sin funcion: estando ya en Cobrar con
          el carrito vacio, limpiar nada y quedarse donde estas no se ve.

          Se queda uno. Y no se perdio nada: una cotizacion es una venta que se
          guarda como cotizacion, y ese boton ya vive al final del cobro, que es
          donde se decide — cuando ya esta armado lo que se va a cotizar.
        */}
        <div className="pz-encabezado__acciones">
          <div className="pz-buscador">
            <span className="pz-buscador__lupa" aria-hidden="true">
              <Icono nombre="lupa" lado={16} />
            </span>
            <input
              type="search"
              className="pz-buscador__campo"
              autoComplete="off"
              placeholder="Buscar venta..."
              aria-label="Buscar venta por folio, cliente o concepto"
              value={escritoEnLista}
              onChange={(e) => {
                setEscritoEnLista(e.target.value);
                if (e.target.value) setPestana('historial');
              }}
            />
          </div>
          <button
            type="button"
            className="pz-boton pz-boton--principal"
            onClick={() => {
              limpiarCarrito();
              setPestana('nueva');
            }}
          >
            <Icono nombre="mas" lado={16} /> Nueva venta
          </button>
        </div>
      </header>

      {/* La barra tambien es del padre cuando hay padre: seis pestañas arriba y
          cuatro aqui debajo serian dos barras diciendo cosas distintas. */}
      {sinEncabezado ? null : (
      <div className="pz-pestanas" role="tablist" aria-label="Secciones de Ventas">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            className={`pz-pestana${pestana === p.clave ? ' pz-pestana--puesta' : ''}`}
            onClick={() => setPestana(p.clave)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      )}

      {/* LA CONFIRMACION DE QUE SI QUEDO. Sin ella, la pantalla se vacia y
          quien cobro no sabe si paso o si perdio la captura. */}
      {cobrada ? (
        <div className="vta-listo" role="status">
          <span className="pz-ficha" aria-hidden="true">
            <Icono nombre="palomita" lado={18} />
          </span>
          <p className="pz-dato__valor">Venta registrada. Ya está en la caja y en el inventario.</p>
          <button
            type="button"
            className="pz-boton"
            onClick={() => {
              setPestana('historial');
              setAbierta(cobrada);
              setCobrada(null);
            }}
          >
            Ver la venta
          </button>
          <button type="button" className="pz-boton" onClick={() => setCobrada(null)}>
            Nueva venta
          </button>
        </div>
      ) : null}

      {/*
        LA LLAVE ES LA PESTAÑA, y por eso lo de abajo se vuelve a montar al
        cambiarla: es lo que hace que la entrada se dispare sola. Sin ella,
        React reaprovecha los nodos, la animacion no se repite y la pantalla se
        sustituye de golpe — hay que releerla entera para saber que cambio.
      */}
      <div className="mv-cambia" key={pestana}>
      {pestana === 'nueva' ? (
        <div className="pz-cuerpo">
          <div className="vta-columna">
            {/*
              DE DONDE VIENE ESTE COBRO, cuando viene de la Agenda.

              No es decoracion: es lo que deja comprobar de un vistazo que el
              carrito armado solo corresponde a la sesion que se acaba de dar
              —el dia, la hora y la terapeuta— antes de apretar cobrar. Sin
              esto, quien cobra ve un carrito que aparecio lleno y no sabe si
              es el de la cita de las 10:30 o el de la de las 11:00.
            */}
            {cargandoCita ? (
              <div className="vta-cita vta-cita--cargando" aria-busy="true">
                Cargando los datos de la cita…
              </div>
            ) : citaCargada ? (
              <div
                className={`vta-cita${citaCargada.ventaId ? ' vta-cita--cobrada' : ''}`}
                role="status"
              >
                <span className="vta-cita__icono" aria-hidden="true">
                  <Icono nombre="calendario" lado={18} />
                </span>
                <div className="vta-cita__texto">
                  {citaCargada.ventaId ? (
                    <>
                      <span className="vta-cita__titulo">Esta cita ya se cobró</span>
                      <span className="vta-cita__pie">
                        Venta {citaCargada.ventaFolio ?? ''} · {citaCargada.servicio} ·{' '}
                        {citaCargada.cliente}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="vta-cita__titulo">
                        Cobro de la cita del {citaCargada.fecha}, {citaCargada.horaInicio}
                      </span>
                      <span className="vta-cita__pie">
                        {citaCargada.servicio} · {citaCargada.cliente}
                        {citaCargada.profesional ? ` · ${citaCargada.profesional}` : ''}
                      </span>
                    </>
                  )}
                </div>
                {citaCargada.ventaId ? (
                  <button
                    type="button"
                    className="pz-boton"
                    onClick={() => {
                      setPestana('historial');
                      setAbierta(citaCargada.ventaId);
                    }}
                  >
                    Ver la venta
                  </button>
                ) : (
                  <button
                    type="button"
                    className="vta-cita__quitar"
                    onClick={limpiarCarrito}
                    aria-label="Quitar la cita y empezar una venta en blanco"
                  >
                    ×
                  </button>
                )}
              </div>
            ) : null}

            <QuienCompra
              clienteId={clienteId}
              clienteNombre={clienteNombre}
              busqueda={escritoCliente}
              encontrados={clientes.datos?.filas ?? []}
              recientes={recientes.datos?.filas ?? []}
              buscando={clientes.estado === 'cargando' && clientes.datos === null}
              fecha={fecha}
              vendedorId={vendedorId}
              vendedores={vendedores.datos ?? []}
              puedeCambiarVendedor={puedeCambiarVendedor}
              puedeCrearCliente={puedeCrearCliente}
              onBuscarCliente={setEscritoCliente}
              onEscogerCliente={(c: ClienteEnLista) => {
                setClienteId(c.id);
                setClienteNombre(c.nombre);
                setEscritoCliente('');
              }}
              onQuitarCliente={() => {
                setClienteId('');
                setClienteNombre('');
              }}
              onNuevoCliente={() => setNuevoCliente(true)}
              onFecha={setFecha}
              onVendedor={(id) => {
                setVendedorTocado(true);
                setVendedorId(id);
              }}
            />

            <Carrito
              renglones={renglones}
              catalogo={catalogo.datos ?? []}
              busqueda={escrito}
              tipo={tipo}
              notas={notas}
              notaAbierta={notaAbierta}
              cargando={catalogo.estado === 'cargando' && catalogo.datos === null}
              error={catalogo.error}
              onBuscar={setEscrito}
              onTipo={setTipo}
              onAgregar={(c) => setRenglones((rs) => agregarAlCarrito(rs, c))}
              onCantidad={(i, n) =>
                setRenglones((rs) =>
                  rs.map((r, j) => (j === i ? { ...r, cantidad: Math.max(1, n) } : r)),
                )
              }
              onDescuento={(i, c) =>
                setRenglones((rs) =>
                  rs.map((r, j) => (j === i ? { ...r, descuentoCentavos: Math.max(0, c) } : r)),
                )
              }
              onQuitar={(i) => setRenglones((rs) => rs.filter((_, j) => j !== i))}
              onNotas={setNotas}
              onAbrirNota={() => setNotaAbierta(true)}
            />

            {/*
              AQUI YA NO SE REPITEN LAS VENTAS DEL DIA.

              Habia una tarjeta de "Ultimas ventas del dia" justo debajo del
              carrito, y una pestaña entera llamada "Ventas del dia" al lado.
              Las dos leian lo mismo y ninguna era la buena: la de aqui enseñaba
              cinco sin buscador, la otra todas. Con dos listas de lo mismo en
              la misma pantalla, la pregunta "¿cuantas llevo hoy?" tiene dos
              respuestas que no coinciden en cuanto una se queda sin recargar.

              Se queda el RESUMEN, que no es la misma informacion: cuatro cifras
              del dia, no una lista. Para ver las ventas esta su pestaña.
            */}
            <EstadisticasDelDia
              resumen={resumen.datos}
              onVerReporte={() => ir('reportes')}
            />
            <button
              type="button"
              className="pz-boton"
              onClick={() => setPestana('dia')}
            >
              <Icono nombre="renglones" lado={16} /> Ver las ventas del día
            </button>
          </div>

          <div className="vta-lateral">
            <InformacionDelCliente
              expediente={clienteId ? expediente.datos : null}
              cargando={Boolean(clienteId) && expediente.estado === 'cargando' && expediente.datos === null}
              puedeEditar={puedeCrearCliente}
              onEditar={() => ir('clientes', { intencion: `clientes:abrir:${clienteId}` })}
              onVerExpediente={() => ir('clientes', { intencion: `clientes:abrir:${clienteId}` })}
            />
            {/* EL DESCUENTO VA JUNTO AL TOTAL, no en la otra punta de la
                pantalla. Estaba abajo a la derecha de la columna izquierda,
                lejos de la cifra que modifica: se aplicaba un descuento y
                habia que cruzar la pantalla para comprobar que si bajo. */}
            <AplicarDescuento
              escrito={descuentoEscrito}
              comoPorcentaje={descuentoEnPorcentaje}
              subtotalCentavos={renglones.reduce(
                (s, r) => s + Math.max(0, r.precioCentavos * r.cantidad - r.descuentoCentavos),
                0,
              )}
              puede={puedeDescontar}
              onEscrito={setDescuentoEscrito}
              onComoPorcentaje={setDescuentoEnPorcentaje}
              onAplicar={setDescuentoCentavos}
            />
            <Cobro
              renglones={renglones}
              descuentoCentavos={descuentoCentavos}
              pagos={pagos}
              metodoPuesto={metodoPuesto}
              efectivoRecibido={efectivoRecibido}
              /* LO QUE MANDA CONFIGURACION. No es una copia: es la misma lista,
                 resuelta al leer. Desactivar la tarjeta alli la quita de aqui
                 sin tocar una linea, y las ventas de ayer conservan la suya. */
              metodosAceptados={configuracion.datos?.datos.metodosDePago ?? METODOS_DE_PAGO.map((m) => m.clave)}
              impuestoNombre={configuracion.datos?.datos.impuestoNombre ?? ''}
              impuestoTasa={configuracion.datos?.datos.impuestoTasa ?? 0}
              impuestoIncluido={configuracion.datos?.datos.impuestoIncluido ?? true}
              trabajando={cobro.trabajando || cotizacion.trabajando}
              error={cobro.error ?? cotizacion.error}
              onMetodo={escogerMetodo}
              onAgregarPago={(m) => setPagos((ps) => [...ps, { metodo: m, montoCentavos: 0 }])}
              onMontoDelPago={(i, c) =>
                setPagos((ps) =>
                  ps.map((p, j) => (j === i ? { ...p, montoCentavos: Math.max(0, c) } : p)),
                )
              }
              onQuitarPago={(i) => setPagos((ps) => ps.filter((_, j) => j !== i))}
              onEfectivoRecibido={setEfectivoRecibido}
              onCobrar={() => void cobrar()}
              onCotizar={() => void cotizar()}
              onIrACaja={() => ir('caja', { intencion: 'caja:abrir' })}
            />
          </div>
        </div>
      ) : pestana === 'cotizaciones' ? (
        <Cotizaciones
          cotizaciones={cotizaciones.datos ?? []}
          cargando={cotizaciones.estado === 'cargando' && cotizaciones.datos === null}
          error={cotizaciones.error}
          onConvertir={(c) => void convertir(c)}
          onCancelar={(c) => void marcada.ejecutar(c.id, 'cancelada')}
        />
      ) : (
        <div className="pz-cuerpo">
          {/*
            EL CALENDARIO Y LA LISTA VAN JUNTOS EN UNA COLUMNA, y esto no es
            maquetacion caprichosa: `pz-cuerpo` es una rejilla de DOS columnas
            —contenido y ficha de 340— y meterle un tercer hijo mandaba la lista
            de ventas al hueco de la ficha. Envueltos, siguen siendo dos.
          */}
          <div className="vta-historial">
          {/*
            LA NAVEGACION POR PERIODOS, solo en el Historial.

            En "Ventas del día" no pinta nada: ahi ya hay un solo dia, y una
            columna para escoger entre un dia es ruido.

            SE APARTA MIENTRAS SE BUSCA. Una busqueda ya es un recorte; dos
            recortes encima —"agosto" y "Roberto"— se leen como una lista vacia
            y hacen dudar de las dos herramientas. Al borrar el texto vuelve, y
            vuelve donde estaba.
          */}
          {pestana === 'historial' && busquedaEnLista === '' ? (
            <CalendarioDelHistorial
              dias={calendario.datos ?? []}
              donde={donde}
              cargando={calendario.estado === 'cargando' && calendario.datos === null}
              onIr={(d) => {
                setDonde(d);
                // Cambiar de periodo vuelve a la primera pagina: quedarse en la
                // pagina cuatro de un dia que tiene tres ventas enseña un hueco.
                setPagina(1);
              }}
            />
          ) : null}

          <Historial
            ventas={listaDeLaPestana.datos?.filas ?? []}
            total={listaDeLaPestana.datos?.total ?? 0}
            pagina={pagina}
            porPagina={porPagina}
            busqueda={escritoEnLista}
            estado={estado}
            seleccionada={abierta}
            cargando={listaDeLaPestana.estado === 'cargando' && listaDeLaPestana.datos === null}
            error={listaDeLaPestana.error}
            vacioTexto={
              pestana === 'dia'
                ? 'No hay ventas registradas hoy.'
                : donde.dia
                  // Con un dia escogido, "Todavia no hay ventas" se lee como que
                  // el centro nunca ha vendido nada. Se dice de que dia se habla.
                  ? `No hay ventas el ${donde.dia}.`
                  : 'Todavía no hay ventas.'
            }
            onBuscar={setEscritoEnLista}
            onEstado={setEstado}
            onPagina={setPagina}
            onAbrir={setAbierta}
            onReintentar={listaDeLaPestana.recargar}
            {...(pestana === 'dia' &&
            (listaDeLaPestana.datos?.total ?? 0) > cuantasDelDia
              ? {
                  /* SE CRECE LA LISTA, no se pagina. En el dia lo que se busca
                     es "la de hace un rato": partirla en paginas obliga a
                     acordarse de en cual estaba. En el Historial es al reves y
                     por eso alli si pagina. */
                  onVerMas: () => setCuantasDelDia((n) => n + 4),
                }
              : {})}
          />
          </div>
          <DetalleDeVenta
            venta={abierta ? ficha.datos : null}
            cargando={Boolean(abierta) && ficha.estado === 'cargando' && ficha.datos === null}
            error={abierta ? ficha.error : null}
            permisos={permisos}
            trabajando={cancelacion.trabajando}
            errorDeOperacion={cancelacion.error}
            onCerrar={() => setAbierta(null)}
            onCancelar={(motivo) => {
              if (abierta) void cancelacion.ejecutar(abierta, motivo);
            }}
            onVerCliente={(id) => ir('clientes', { intencion: `clientes:abrir:${id}` })}
          />
        </div>
      )}
      </div>

      {/* DAR DE ALTA USA LA FICHA DE CLIENTES, no un formulario propio: si
          fueran dos, uno se quedaria sin la comprobacion de duplicados. */}
      {nuevoCliente ? (
        <FichaDeCliente
          abierta
          titulo="Nuevo cliente"
          inicial={FICHA_VACIA}
          profesionales={vendedores.datos ?? []}
          trabajando={alta.trabajando}
          error={alta.error}
          onGuardar={(d) => void darDeAlta(d)}
          onBuscarDuplicado={(telefono, correo) =>
            buscarPosibleDuplicado(negocio, telefono, correo)
          }
          onAbrirDuplicado={(id) => ir('clientes', { intencion: `clientes:abrir:${id}` })}
          onCerrar={() => setNuevoCliente(false)}
        />
      ) : null}

      {!puedeCobrar ? (
        <p className="tt-secundario">
          Tu rol no cobra. Puedes ver las ventas, pero finalizar una es de quien tiene ese permiso —
          y lo decide la base de datos, no esta pantalla.
        </p>
      ) : null}
    </div>
  );
}
