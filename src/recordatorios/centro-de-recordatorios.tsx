/**
 * RECORDATORIOS — el seguimiento de lo pendiente del centro.
 *
 * NO ES DUEÑO DE NINGUNA OTRA ENTIDAD. Guarda a que cosa se refiere
 * —`entidad_tipo` y `entidad_id`— y el nombre lo resuelve la base al leer. Por
 * eso desde aqui se puede abrir el paciente, la cita o el producto de verdad, y
 * por eso el dia que una paciente se cambie el apellido todos sus recordatorios
 * lo dicen al dia sin tocar nada.
 *
 * DE DONDE SALE CADA COSA:
 *   las cuatro cifras, la dona y los proximos → `resumen_de_recordatorios`
 *   la tabla                                  → `recordatorios_del_centro`
 *   las repeticiones                          → su propia consulta
 *   las categorias y los responsables         → SUS modulos, no una copia
 *
 * LA BUSQUEDA VA RETRASADA CONTRA EL SERVIDOR Y AL INSTANTE EN EL CAMPO. Lo que
 * se escribe se ve al momento porque vive en `escrito`; lo que viaja es
 * `busqueda`, que se pone al dia medio segundo despues. Asi escribir "HOLA"
 * dispara UNA consulta y no cuatro, y ninguna respuesta tardia repinta la lista
 * debajo del dedo. El campo esta siempre pintado en el mismo sitio del arbol,
 * que es lo que sostiene el foco.
 *
 * LAS REPETICIONES Y LAS AUTOMATIZACIONES SE PONEN AL DIA AL ENTRAR, y es
 * seguro llamarlas cada vez porque las dos son idempotentes en la BASE: un
 * indice unico por regla y fecha, y otro por automatizacion y fila de origen.
 * Dos pestañas abiertas a la vez no pueden crear el mismo recordatorio dos
 * veces.
 */

import { tomarIntencion, useNavegacion } from '@neron/base/marco';
import { Confirmacion } from '@neron/base/ui';
import { hoy as hoyDe, type Fecha, type Hora24 } from '@neron/base/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  archivarCategoria,
  guardarCategoria,
  llaveDeCategorias,
  traerCategorias,
  type Categoria,
  type DatosDeCategoria,
} from '../datos/categorias.js';
import { traerProfesionales, type ProfesionalBreve } from '../datos/citas.js';
import { abrirConversacion } from '../datos/mensajes.js';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  AJUSTES_DE_ARRANQUE,
  LO_QUE_TOCA_UN_RECORDATORIO,
  MODULO_DE_LA_ENTIDAD,
  PESTANAS,
  RECORDATORIO_VACIO,
  ajustarRecordatorio,
  buscarParaRelacionar,
  cancelarRecordatorio,
  completarRecordatorio,
  duplicarRecordatorio,
  eliminarRecordatorio,
  generarAutomaticos,
  generarRepeticiones,
  guardarAjustes,
  guardarAutomatizacion,
  guardarRecordatorio,
  guardarRepeticion,
  llaveDeAjustes,
  llaveDeAutomatizaciones,
  llaveDeLaLista,
  llaveDeRelaciones,
  llaveDeRepeticiones,
  llaveDelHistorial,
  llaveDelResumenDeRecordatorios,
  loQueFaltaDelRecordatorio,
  marcarRepeticion,
  posponerRecordatorio,
  traerAjustes,
  traerAutomatizaciones,
  traerHistorial,
  traerRecordatorios,
  traerRepeticiones,
  traerResumenDeRecordatorios,
  type AjustesDeRecordatorios,
  type AutomatizacionDeRecordatorios,
  type ColumnaDeOrden,
  type ConsultaDeLista,
  type DatosDeAutomatizacion,
  type DatosDeRecordatorio,
  type EntidadDeRecordatorio,
  type EstadoDeRepeticion,
  type EventoDelHistorial,
  type OpcionDeRelacion,
  type PaginaDeRecordatorios,
  type PestanaDeRecordatorios,
  type RecordatorioEnLista,
  type RepeticionDeRecordatorio,
  type ResumenDeRecordatorios,
} from '../datos/recordatorios.js';
import { useSesion } from '../identidad/sesion.js';
import { AdministrarCategorias } from '../ui/administrar-categorias.js';
import { Icono } from '../ui/iconos.js';
import { AjustesDeRecordatoriosModal } from './ajustes-de-recordatorios.js';
import { Aplazar } from './aplazar.js';
import { CADA_CUANTO_SE_MIRA, avisar, comoAvisable, loQueTocaAvisar, pedirPermisoDeAviso } from './avisos.js';
import { rangoEnFechas } from './plazos.js';
import { CifrasDeRecordatorios } from './cifras-de-recordatorios.js';
import { CostadoDeRecordatorios } from './costado-de-recordatorios.js';
import { FormularioDeRecordatorio } from './formulario-de-recordatorio.js';
import { PanelDelRecordatorio } from './panel-del-recordatorio.js';
import { Repeticiones } from './repeticiones.js';
import {
  FILTROS_VACIOS,
  TablaDeRecordatorios,
  type FiltrosDeRecordatorios,
} from './tabla-de-recordatorios.js';

/** Cuánto se espera antes de mandar lo escrito al servidor. */
const RETRASO_DEL_BUSCADOR = 400;

/** Lo que se pone en el archivo que se descarga. */
export function comoCsv(filas: readonly RecordatorioEnLista[]): string {
  const cabeceras = [
    'Titulo', 'Descripcion', 'Fecha', 'Hora', 'Categoria', 'Relacionado con',
    'Responsable', 'Prioridad', 'Estado', 'Se repite', 'Completado', 'Creado por',
  ];
  /*
   * LAS COMILLAS SE DUPLICAN Y TODO VA ENTRECOMILLADO. Un titulo con una coma
   * —"Llamar a la clienta, urgente"— parte la fila en dos y el archivo entero
   * se descuadra a partir de ahi. Es el fallo clasico de exportar a mano.
   */
  const escapar = (v: string | null): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const renglones = filas.map((r) =>
    [
      r.titulo, r.detalle, r.fecha, r.hora, r.categoria, r.entidadNombre,
      r.responsable, r.prioridad,
      r.estado === 'hecho' ? 'Completado' : r.estado === 'descartado' ? 'Cancelado' : 'Pendiente',
      r.recurrencia, r.completadoEn, r.creadoPor,
    ].map(escapar).join(','),
  );

  return [cabeceras.map((c) => escapar(c)).join(','), ...renglones].join('\n');
}

export function CentroDeRecordatorios() {
  const { acceso } = useSesion();
  const { ir, ruta } = useNavegacion();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  /*
   * TODO MIEMBRO PUEDE CREAR Y CERRAR RECORDATORIOS: es la lista de pendientes
   * del equipo, no un modulo administrativo. Lo que si esta acotado es TOCAR EL
   * DE OTRO —solo su responsable, quien lo creo, o quien administra— y eso lo
   * decide la base en `app.puede_tocar_recordatorio`, no esta linea. Aqui solo
   * se esconden botones, que es cortesia.
   */
  const puedeGestionar = acceso !== null;
  const puedeConfigurar = permisos['gestionarConfiguracion'] === true;

  /* --- El dia, y que no se quede viejo ------------------------------ */

  /**
   * UNA PESTAÑA SE QUEDA ABIERTA DIAS. Sin esto, la del mostrador amanece
   * contando como "de hoy" los de ayer, con toda la cara de estar al dia.
   *
   * SOLO SE CAMBIA EL ESTADO SI DE VERDAD CAMBIO EL DIA. Poner una fecha nueva
   * cada minuto repintaria la pantalla entera sesenta veces por hora sin que
   * nada se viera distinto — y de paso tiraria la llave de cache de la lista,
   * o sea un viaje al servidor por minuto.
   */
  const [hoy, setHoy] = useState<Fecha>(() => hoyDe());
  useEffect(() => {
    const t = setInterval(() => {
      const dia = hoyDe();
      setHoy((antes) => (antes === dia ? antes : dia));
    }, CADA_CUANTO_SE_MIRA);
    return () => clearInterval(t);
  }, []);

  /* --- Lo que se ve ------------------------------------------------- */

  const [pestana, setPestana] = useState<PestanaDeRecordatorios>('todos');
  const [vistaRepeticiones, setVistaRepeticiones] = useState(false);
  const [escrito, setEscrito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState<FiltrosDeRecordatorios>(FILTROS_VACIOS);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [orden, setOrden] = useState<ColumnaDeOrden>('urgencia');
  const [descendente, setDescendente] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [abierto, setAbierto] = useState<string | null>(null);

  /**
   * LO ESCRITO SE RETRASA ANTES DE VIAJAR.
   *
   * El campo lee `escrito` y responde al instante; la consulta usa `busqueda`,
   * que se pone al dia medio segundo despues de dejar de teclear. Sin esto,
   * escribir "HOLA" son cuatro viajes y cuatro repintados de la lista debajo
   * del dedo — y el ultimo en llegar no tiene por que ser el de la ultima letra.
   */
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(escrito);
      setPagina(1);
    }, RETRASO_DEL_BUSCADOR);
    return () => clearTimeout(t);
  }, [escrito]);

  /* --- Los dialogos ------------------------------------------------- */

  const [formulario, setFormulario] = useState<{
    id: string | null;
    repeticionId: string | null;
    datos: DatosDeRecordatorio;
    relacionado: string | null;
  } | null>(null);
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [buscandoRelacion, setBuscandoRelacion] = useState('');
  /**
   * El momento se captura AL ABRIR el dialogo, no en cada repintado.
   *
   * "Mas tarde" son tres horas desde ahora; con un reloj que se actualizara
   * solo, esa opcion cambiaria de etiqueta debajo del dedo mientras alguien la
   * lee.
   */
  const [aAplazar, setAAplazar] = useState<
    { readonly r: RecordatorioEnLista; readonly ahora: Date } | null
  >(null);
  const [aEliminar, setAEliminar] = useState<RecordatorioEnLista | null>(null);
  const [aCancelar, setACancelar] = useState<RecordatorioEnLista | null>(null);
  const [motivo, setMotivo] = useState('');
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false);
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  /** Un cambio suelto desde el menu de tres puntos: responsable, prioridad o categoría. */
  const [aAjustar, setAAjustar] = useState<{
    r: RecordatorioEnLista;
    que: 'responsable' | 'prioridad' | 'categoria';
  } | null>(null);

  /* --- Lo que se le pide al servidor -------------------------------- */

  const rango = useMemo(() => rangoEnFechas(filtros.rango, filtros.desde, filtros.hasta, hoy), [
    filtros.rango,
    filtros.desde,
    filtros.hasta,
    hoy,
  ]);

  const consulta: ConsultaDeLista = {
    pestana,
    busqueda,
    categoriaId: filtros.categoriaId,
    responsableId: filtros.responsableId,
    prioridad: filtros.prioridad,
    entidadTipo: filtros.entidadTipo,
    desde: rango.desde,
    hasta: rango.hasta,
    soloRecurrentes: filtros.soloRecurrentes,
    soloAutomaticos: filtros.soloAutomaticos,
    orden,
    descendente,
    pagina,
    porPagina,
  };

  const lista = useConsulta<PaginaDeRecordatorios>(
    negocio ? llaveDeLaLista(negocio, hoy, consulta) : null,
    () => traerRecordatorios(negocio, hoy, consulta),
  );

  const resumen = useConsulta<ResumenDeRecordatorios>(
    negocio ? llaveDelResumenDeRecordatorios(negocio, hoy) : null,
    () => traerResumenDeRecordatorios(negocio, hoy),
  );

  const repeticiones = useConsulta<RepeticionDeRecordatorio[]>(
    negocio ? llaveDeRepeticiones(negocio) : null,
    () => traerRepeticiones(negocio),
  );

  // LAS CATEGORIAS Y LOS RESPONSABLES SALEN DE SUS MODULOS. Recordatorios no
  // mantiene copias: el dia que se renombre a alguien, aqui se ve renombrado.
  const categorias = useConsulta<Categoria[]>(
    negocio ? llaveDeCategorias(negocio, 'recordatorio') : null,
    () => traerCategorias(negocio, 'recordatorio'),
  );

  /*
   * LA MISMA LLAVE QUE USA AGENDA. No es ahorro de lineas: al compartirla,
   * abrir Agenda y luego Recordatorios es UN viaje al servidor en vez de dos, y
   * dar de alta a alguien en el centro refresca las dos listas sin recargar.
   */
  const responsables = useConsulta<ProfesionalBreve[]>(
    negocio ? `profesionales:${negocio}` : null,
    () => traerProfesionales(negocio),
  );

  const ajustes = useConsulta<AjustesDeRecordatorios>(
    negocio ? llaveDeAjustes(negocio) : null,
    () => traerAjustes(negocio),
  );

  const automatizaciones = useConsulta<AutomatizacionDeRecordatorios[]>(
    negocio ? llaveDeAutomatizaciones(negocio) : null,
    () => traerAutomatizaciones(negocio),
  );

  // EL HISTORIAL SE PIDE SOLO DEL QUE SE ABRIO. Traerlo con la lista serian
  // cuarenta consultas para enseñar diez renglones.
  const historial = useConsulta<EventoDelHistorial[]>(
    abierto ? llaveDelHistorial(abierto) : null,
    () => traerHistorial(abierto!),
  );

  // Las opciones para relacionar solo se piden si el formulario esta abierto y
  // ya hay dos letras escritas: sin eso seria una consulta por tecla.
  const relaciones = useConsulta<OpcionDeRelacion[]>(
    formulario && formulario.datos.entidadTipo !== '' && buscandoRelacion.trim().length >= 2
      ? llaveDeRelaciones(negocio, formulario.datos.entidadTipo, buscandoRelacion)
      : null,
    () =>
      buscarParaRelacionar(
        negocio,
        formulario!.datos.entidadTipo as EntidadDeRecordatorio,
        buscandoRelacion,
      ),
  );

  const ajustesPuestos = ajustes.datos ?? AJUSTES_DE_ARRANQUE;

  /**
   * MI MEMBRESIA, que no es lo mismo que mi cuenta.
   *
   * El responsable de un recordatorio es una `membresia` —quien trabaja en ESTE
   * centro— y la sesion solo trae el `usuarioId` de la cuenta. La misma cuenta
   * puede tener membresia en dos centros, asi que comparar cuenta contra
   * responsable haria que un aviso de otro centro sonara aqui.
   */
  const miMembresia = useMemo(
    () =>
      (responsables.datos ?? []).find((m) => m.usuarioId === acceso?.usuarioId)?.id ?? null,
    [responsables.datos, acceso?.usuarioId],
  );

  /* --- Lo que se pone al dia al entrar ------------------------------ */

  /**
   * LAS REPETICIONES Y LAS AUTOMATIZACIONES SE PONEN AL DIA AL ABRIR.
   *
   * Es seguro llamarlas cada vez: la unicidad la ponen dos indices de la base,
   * no estas lineas. Sin esto, el recordatorio semanal solo existiria si
   * alguien abriera la pantalla el dia exacto — que es justo lo que una
   * repeticion viene a evitar.
   *
   * Y NO CREAN NADA si no hay reglas encendidas, que es lo que permite hacerlo
   * al entrar sin llenarle la lista a nadie.
   */
  const puestoAlDia = useRef('');
  useEffect(() => {
    if (!negocio || !puedeGestionar) return;
    // Una vez por centro y por dia: repetirlo en cada repintado seria un par de
    // viajes al servidor por cada tecla del buscador.
    const marca = `${negocio}:${hoy}`;
    if (puestoAlDia.current === marca) return;
    puestoAlDia.current = marca;

    let vivo = true;
    void Promise.all([generarRepeticiones(negocio, hoy), generarAutomaticos(negocio, hoy)])
      .then(([deRepeticion, deAutomatizacion]) => {
        if (vivo && deRepeticion + deAutomatizacion > 0) {
          lista.recargar();
          resumen.recargar();
          repeticiones.recargar();
        }
      })
      // Un fallo aqui NO puede tumbar la pantalla: lo ya capturado se ve igual.
      // El caso normal es no tener permiso, y eso se resuelve solo.
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocio, hoy, puedeGestionar]);

  /* --- Lo que pide la direccion ------------------------------------- */

  /**
   * `?ver=vencidos` LLEGA EN LA DIRECCION, no en un recado.
   *
   * Es la diferencia que el marco ya tenia resuelta: un recado se consume una
   * vez y desaparece —correcto para "abre el formulario"—, pero un FILTRO tiene
   * que sobrevivir a recargar la pagina y poder mandarse por WhatsApp. La
   * campana avisa de dos vencidos, se toca, y el enlace que queda en la barra
   * sigue llevando a los dos vencidos mañana.
   */
  const pedido = ruta.parametros['ver'] ?? '';
  useEffect(() => {
    if (pedido === '') return;
    setVistaRepeticiones(false);
    if (pedido === 'vencidos') {
      // "Vencido" no es una pestaña: es pendiente con la fecha pasada. Se
      // resuelve con el filtro de fecha, que es lo que de verdad significa.
      setPestana('pendientes');
      setFiltros({ ...FILTROS_VACIOS, rango: 'vencidos' });
    } else if (
      pedido === 'hoy' || pedido === 'proximos' || pedido === 'completados' ||
      pedido === 'pendientes' || pedido === 'todos'
    ) {
      setPestana(pedido);
    }
    setPagina(1);
  }, [pedido]);

  /* --- El recado que llega de otro modulo --------------------------- */

  const recadoLeido = useRef(false);
  useEffect(() => {
    if (recadoLeido.current) return;
    recadoLeido.current = true;
    const recado = tomarIntencion('recordatorios');
    if (!recado) return;

    if (recado.accion === 'abrir' && recado.detalle) {
      setAbierto(recado.detalle);
    } else if (recado.accion === 'nuevo') {
      /*
       * `recordatorios:nuevo:<id>` YA LO MANDABA CLIENTES antes de que este
       * modulo existiera, y ese id es el de un paciente. Se respeta tal cual en
       * vez de pedirle a Clientes que cambie: un recado viejo que deja de
       * entenderse no falla, solo abre el formulario vacio — y quien venia de
       * una ficha tiene que volver a buscarla aqui.
       */
      abrirNuevo(false, recado.detalle ? 'cliente' : '', recado.detalle ?? '');
    } else if (recado.accion === 'recurrente') {
      abrirNuevo(true);
    } else if (recado.accion === 'para' && recado.detalle) {
      // `recordatorios:para:cliente-<id>` — quien viene de otro modulo trae la
      // relacion puesta. Sin esto tendria que volver a buscar ahi mismo la
      // ficha que estaba mirando.
      const corte = recado.detalle.indexOf('-');
      const tipo = corte > 0 ? recado.detalle.slice(0, corte) : '';
      const id = corte > 0 ? recado.detalle.slice(corte + 1) : '';
      if (tipo !== '' && id !== '') abrirNuevo(false, tipo, id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Los avisos del navegador ------------------------------------- */

  /**
   * SE MIRA CADA MINUTO LO QUE YA ESTA CARGADO, sin pedir nada nuevo.
   *
   * Recorre la pagina que se esta viendo. No es un servicio de avisos: es lo
   * que se puede hacer honestamente con la pestaña abierta, y la pantalla de
   * Configuración lo dice con todas sus letras.
   */
  const marcarAvisado = useOperacion(
    (id: string) => ajustarRecordatorio(id, 'avisado', ''),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );

  useEffect(() => {
    if (!ajustesPuestos.avisarEnNavegador) return;
    const filas = lista.datos?.filas ?? [];
    if (filas.length === 0) return;

    const mirar = (): void => {
      const tocan = loQueTocaAvisar(
        filas.map(comoAvisable),
        new Date(),
        ajustesPuestos.horaPorOmision,
        ajustesPuestos.anticipacionMin,
        ajustesPuestos.avisarAlResponsable ? miMembresia : null,
      );
      for (const r of tocan) {
        // SOLO SE MARCA SI EL AVISO DE VERDAD SALIO. Marcarlo antes dejaria uno
        // que consta como avisado y del que nadie se entero.
        if (avisar(r)) void marcarAvisado.ejecutar(r.id);
      }
    };

    mirar();
    const t = setInterval(mirar, CADA_CUANTO_SE_MIRA);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.datos, ajustesPuestos, miMembresia]);

  /* --- Las operaciones ---------------------------------------------- */

  const alta = useOperacion(
    (id: string | null, d: DatosDeRecordatorio) => guardarRecordatorio(negocio, id, d),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const regla = useOperacion(
    (id: string | null, d: DatosDeRecordatorio) => guardarRepeticion(negocio, id, d),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const cierre = useOperacion(
    (id: string, hecho: boolean) => completarRecordatorio(id, hecho),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const aplazo = useOperacion(
    (id: string, fecha: Fecha, hora: Hora24 | null) => posponerRecordatorio(id, fecha, hora),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const ajuste = useOperacion(
    (id: string, que: 'responsable' | 'prioridad' | 'categoria', valor: string) =>
      ajustarRecordatorio(id, que, valor),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const anulacion = useOperacion(
    (id: string, m: string) => cancelarRecordatorio(id, m),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const borrado = useOperacion(
    (id: string) => eliminarRecordatorio(id),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const copia = useOperacion(
    (id: string) => duplicarRecordatorio(id, hoy),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const repeticion = useOperacion(
    (id: string, estado: EstadoDeRepeticion) => marcarRepeticion(id, estado),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const configuracion = useOperacion(
    (a: AjustesDeRecordatorios) => guardarAjustes(negocio, a),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const automatizacion = useOperacion(
    (d: DatosDeAutomatizacion) => guardarAutomatizacion(negocio, d),
    [...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const categoria = useOperacion(
    (id: string | null, d: DatosDeCategoria) => guardarCategoria(negocio, 'recordatorio', id, d),
    ['categorias', ...LO_QUE_TOCA_UN_RECORDATORIO],
  );
  const archivo = useOperacion((id: string) => archivarCategoria(id), [
    'categorias',
    ...LO_QUE_TOCA_UN_RECORDATORIO,
  ]);

  /* --- Las acciones ------------------------------------------------- */

  function abrirNuevo(repetir: boolean, entidadTipo = '', entidadId = ''): void {
    setFormulario({
      id: null,
      repeticionId: null,
      datos: {
        ...RECORDATORIO_VACIO,
        fecha: hoyDe(),
        repetir,
        entidadTipo,
        entidadId,
      },
      relacionado: null,
    });
    setBuscandoRelacion('');
    setMostrarErrores(false);
    alta.limpiarError();
    regla.limpiarError();
  }

  function abrirEdicion(r: RecordatorioEnLista): void {
    setFormulario({
      id: r.id,
      repeticionId: null,
      datos: {
        ...RECORDATORIO_VACIO,
        titulo: r.titulo,
        detalle: r.detalle ?? '',
        fecha: r.fecha,
        hora: r.hora ?? '',
        prioridad: r.prioridad,
        categoriaId: r.categoriaId ?? '',
        responsableId: r.responsableId ?? '',
        entidadTipo: r.entidadTipo ?? '',
        entidadId: r.entidadId ?? '',
        notas: r.notas ?? '',
        anticipacionMin: r.anticipacionMin === null ? '' : String(r.anticipacionMin),
        // EDITAR UNA OCURRENCIA NO EDITA LA REGLA. Cambiar aqui la frecuencia
        // dejaria dos verdades sobre cada cuanto se repite: la regla se edita
        // desde su pestaña.
        repetir: false,
      },
      relacionado: r.entidadNombre,
    });
    setBuscandoRelacion('');
    setMostrarErrores(false);
    alta.limpiarError();
    regla.limpiarError();
  }

  function abrirEdicionDeRegla(r: RepeticionDeRecordatorio): void {
    setFormulario({
      id: null,
      repeticionId: r.id,
      datos: {
        titulo: r.titulo,
        detalle: r.detalle ?? '',
        fecha: r.fechaInicio,
        hora: r.hora ?? '',
        prioridad: r.prioridad,
        categoriaId: r.categoriaId ?? '',
        responsableId: r.responsableId ?? '',
        entidadTipo: r.entidadTipo ?? '',
        entidadId: r.entidadId ?? '',
        notas: r.notas ?? '',
        anticipacionMin: r.anticipacionMin === null ? '' : String(r.anticipacionMin),
        repetir: true,
        frecuencia: r.frecuencia,
        intervalo: String(r.intervalo),
        diasSemana: [...r.diasSemana],
        fechaFin: r.fechaFin ?? '',
        repeticiones: r.repeticiones === null ? '' : String(r.repeticiones),
      },
      relacionado: null,
    });
    setBuscandoRelacion('');
    setMostrarErrores(false);
  }

  async function guardar(): Promise<void> {
    if (!formulario) return;
    setMostrarErrores(true);
    if (Object.keys(loQueFaltaDelRecordatorio(formulario.datos)).length > 0) return;

    // LA CASILLA DE REPETIR DECIDE QUE ENTIDAD SE GUARDA: una regla o un
    // recordatorio suelto. El pie del dialogo lo dice antes de apretarlo.
    if (formulario.datos.repetir) {
      const id = await regla.ejecutar(formulario.repeticionId, formulario.datos);
      if (id) {
        setFormulario(null);
        setVistaRepeticiones(true);
        // La regla nace con su proxima fecha en el inicio: se pone al dia para
        // que la primera ocurrencia aparezca sin tener que recargar.
        void generarRepeticiones(negocio, hoy).then(() => {
          lista.recargar();
          resumen.recargar();
          repeticiones.recargar();
        });
      }
      return;
    }

    const id = await alta.ejecutar(formulario.id, formulario.datos);
    if (id) {
      setFormulario(null);
      setAbierto(String(id));
    }
  }

  function abrirEntidad(r: RecordatorioEnLista): void {
    if (!r.entidadTipo || !r.entidadId) return;
    const modulo = MODULO_DE_LA_ENTIDAD[r.entidadTipo];
    /*
     * CADA MODULO ESCUCHA SU PROPIO RECADO, y por eso el prefijo es el suyo y no
     * el nuestro. Ventas vive dentro de Caja desde que se unieron en el
     * mostrador, asi que su recado sigue diciendo `ventas:` — el nombre dice
     * QUIEN LO CONSUME, no de que menu salio.
     */
    const recado: Readonly<Record<string, string>> = {
      cliente: `clientes:abrir:${r.entidadId}`,
      cita: `agenda:abrir:${r.entidadId}`,
      venta: `ventas:abrir:${r.entidadId}`,
      curso: `cursos:abrir:${r.entidadId}`,
      producto: `productos:abrir:${r.entidadId}`,
      servicio: `servicios:abrir:${r.entidadId}`,
      gasto: `gastos:abrir:${r.entidadId}`,
    };
    ir(modulo, { intencion: recado[r.entidadTipo] ?? '' });
  }

  /**
   * ESCRIBIRLE AL PACIENTE DESDE EL RECORDATORIO.
   *
   * Se abre (o se encuentra) su conversacion en Mensajes y se navega a ella con
   * el recado que Mensajes ya sabe leer. NO se manda nada: `guardar_mensaje`
   * deja el texto en `pendiente` hasta que alguien hable con el proveedor, y esa
   * diferencia entre "lo tengo escrito" y "le llego" es la que hace que nadie de
   * por avisado a un paciente que nunca supo nada.
   */
  async function escribirle(r: RecordatorioEnLista): Promise<void> {
    if (!r.entidadContacto) return;
    const clienteId = r.entidadTipo === 'cliente' ? r.entidadId : null;
    try {
      const conversacion = await abrirConversacion(negocio, r.entidadContacto, null, clienteId);
      ir('mensajes', { intencion: `mensajes:abrir:${conversacion}` });
    } catch {
      // Si no se pudo abrir el hilo se entra a Mensajes igual: es mejor llegar
      // a la bandeja que quedarse sin respuesta al tocar el boton.
      ir('mensajes', { intencion: 'mensajes:nuevo' });
    }
  }

  function exportar(): void {
    /*
     * SE EXPORTA LO QUE SE VE. El archivo respeta la pestaña, el buscador y los
     * filtros — descargar trescientos renglones cuando en pantalla hay doce hace
     * que el archivo no cuadre con lo que se estaba mirando.
     */
    const csv = comoCsv(lista.datos?.filas ?? []);
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `recordatorios-${hoy.split('/').reverse().join('-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function hacer(clave: string, r: RecordatorioEnLista): void {
    if (clave === 'ver') setAbierto(r.id);
    else if (clave === 'editar') abrirEdicion(r);
    else if (clave === 'completar') void cierre.ejecutar(r.id, true);
    else if (clave === 'reabrir') void cierre.ejecutar(r.id, false);
    else if (clave === 'posponer') setAAplazar({ r, ahora: new Date() });
    else if (clave === 'duplicar') void copia.ejecutar(r.id);
    else if (clave === 'responsable') setAAjustar({ r, que: 'responsable' });
    else if (clave === 'prioridad') setAAjustar({ r, que: 'prioridad' });
    else if (clave === 'categoria') setAAjustar({ r, que: 'categoria' });
    else if (clave === 'abrirEntidad') abrirEntidad(r);
    else if (clave === 'mensaje') void escribirle(r);
    else if (clave === 'cancelar') {
      setACancelar(r);
      setMotivo('');
    } else if (clave === 'eliminar') setAEliminar(r);
  }

  /* --- Lo que se pinta ---------------------------------------------- */

  const filas = lista.datos?.filas ?? [];
  const elAbierto = filas.find((r) => r.id === abierto) ?? null;
  const cargandoLista = lista.estado === 'cargando' && lista.datos === null;
  /**
   * "NO HAY NADA" SE DISTINGUE DE "NADA COINCIDE" con el total del resumen, que
   * no depende de los filtros. Sin eso, un filtro que deja cero renglones
   * enseñaria "No hay recordatorios" y quien lo lea va a creer que perdio su
   * trabajo.
   */
  const centroVacio = (resumen.datos?.total ?? 0) === 0;

  return (
    <div className="cli rec mv-pantalla">
      <header className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">
            <span className="rec-titulo__icono" aria-hidden="true">
              <Icono nombre="campana" lado={22} />
            </span>
            Recordatorios
          </h2>
          <p className="tt-lema">Gestiona y da seguimiento a tus recordatorios y tareas importantes</p>
        </div>
        <div className="pz-encabezado__acciones">
          {/*
            SE VE "Configuración" Y SE LLAMA "Configuración de recordatorios".
            En la barra lateral hay un modulo que se llama igual, asi que un
            boton con ese solo nombre es ambiguo para quien navega por voz o con
            lector de pantalla — y para el guion de velos, que apretaba el del
            menu y se iba de la pantalla. El nombre accesible CONTIENE el texto
            visible, que es lo que hace que decir "configuración" siga
            funcionando.
          */}
          <button
            type="button"
            className="pz-boton"
            aria-label="Configuración de recordatorios"
            onClick={() => setAjustesAbiertos(true)}
          >
            <Icono nombre="engrane" lado={16} /> Configuración
          </button>
          {puedeGestionar ? (
            <button
              type="button"
              className="pz-boton pz-boton--principal"
              onClick={() => abrirNuevo(false)}
            >
              <Icono nombre="mas" lado={16} /> Nuevo recordatorio
            </button>
          ) : null}
          {/* EL SELECTOR GENERAL DEL DISEÑO ES UN FILTRO DE VERDAD: cambia la
              consulta igual que las pestañas, y las dos se mantienen a la par. */}
          <label className="pz-campo pz-campo--corto">
            <span className="neron-solo-lectores">Qué recordatorios ver</span>
            <select
              value={vistaRepeticiones ? 'repeticiones' : pestana}
              onChange={(e) => {
                if (e.target.value === 'repeticiones') {
                  setVistaRepeticiones(true);
                  return;
                }
                setVistaRepeticiones(false);
                setPestana(e.target.value as PestanaDeRecordatorios);
                setPagina(1);
              }}
            >
              {PESTANAS.map((p) => (
                <option key={p.clave} value={p.clave}>
                  {p.etiqueta}
                </option>
              ))}
              <option value="repeticiones">Los que se repiten</option>
            </select>
          </label>
        </div>
      </header>

      <CifrasDeRecordatorios
        resumen={resumen.datos}
        onIr={(p) => {
          setVistaRepeticiones(false);
          setPestana(p);
          setPagina(1);
        }}
      />

      <div className="pz-pestanas" role="tablist" aria-label="Secciones de Recordatorios">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={!vistaRepeticiones && pestana === p.clave}
            className={`pz-pestana${
              !vistaRepeticiones && pestana === p.clave ? ' pz-pestana--puesta' : ''
            }`}
            onClick={() => {
              setVistaRepeticiones(false);
              setPestana(p.clave);
              setPagina(1);
            }}
          >
            {p.etiqueta}
            {/* EL CONTADOR SALE DEL RESUMEN, no de contar la pagina que se ve.
                Contar diez renglones para escribir "10" al lado de una pestaña
                que filtra cuarenta es la mentira mas facil de colar. */}
            {contadorDe(p.clave, resumen.datos) !== null ? (
              <span className="rec-cuenta">{contadorDe(p.clave, resumen.datos)}</span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={vistaRepeticiones}
          className={`pz-pestana${vistaRepeticiones ? ' pz-pestana--puesta' : ''}`}
          onClick={() => setVistaRepeticiones(true)}
        >
          Se repiten
        </button>
      </div>

      <div className="pz-cuerpo rec-cuerpo">
        {/* La llave es la vista: es lo que hace que lo nuevo ENTRE en vez de
            sustituirse de golpe. */}
        <div className="mv-cambia rec-principal" key={vistaRepeticiones ? 'repeticiones' : pestana}>
          {vistaRepeticiones ? (
            <Repeticiones
              repeticiones={repeticiones.datos ?? []}
              hoy={hoy}
              cargando={repeticiones.estado === 'cargando' && repeticiones.datos === null}
              error={repeticiones.error}
              puedeGestionar={puedeGestionar}
              onNueva={() => abrirNuevo(true)}
              onEditar={abrirEdicionDeRegla}
              onMarcar={(r, estado) => void repeticion.ejecutar(r.id, estado)}
              onVerGenerados={() => {
                setVistaRepeticiones(false);
                setPestana('todos');
                setFiltros({ ...FILTROS_VACIOS, soloRecurrentes: true });
                setPagina(1);
              }}
              onReintentar={repeticiones.recargar}
            />
          ) : (
            <TablaDeRecordatorios
              pagina={lista.datos}
              hoy={hoy}
              busqueda={escrito}
              filtros={filtros}
              filtrosAbiertos={filtrosAbiertos}
              orden={orden}
              descendente={descendente}
              porPagina={porPagina}
              categorias={categorias.datos ?? []}
              responsables={responsables.datos ?? []}
              seleccionado={abierto}
              cargando={cargandoLista}
              error={lista.error}
              puedeGestionar={puedeGestionar}
              centroVacio={centroVacio}
              onBusqueda={setEscrito}
              onFiltros={setFiltros}
              onAbrirFiltros={() => setFiltrosAbiertos((a) => !a)}
              onOrden={setOrden}
              onDescendente={setDescendente}
              onPagina={setPagina}
              onPorPagina={(n) => {
                setPorPagina(n);
                setPagina(1);
              }}
              onAbrir={setAbierto}
              onMarcar={(r, hecho) => void cierre.ejecutar(r.id, hecho)}
              onAccion={hacer}
              onNuevo={() => abrirNuevo(false)}
              onExportar={exportar}
              onReintentar={lista.recargar}
            />
          )}

          <PanelDelRecordatorio
            recordatorio={elAbierto}
            hoy={hoy}
            historial={historial.datos ?? []}
            cargandoHistorial={historial.estado === 'cargando' && historial.datos === null}
            puedeGestionar={puedeGestionar}
            onEditar={() => elAbierto && abrirEdicion(elAbierto)}
            onCompletar={(hecho) => elAbierto && void cierre.ejecutar(elAbierto.id, hecho)}
            onPosponer={() => elAbierto && setAAplazar({ r: elAbierto, ahora: new Date() })}
            onDuplicar={() => elAbierto && void copia.ejecutar(elAbierto.id)}
            onCancelar={() => {
              setACancelar(elAbierto);
              setMotivo('');
            }}
            onEliminar={() => setAEliminar(elAbierto)}
            onAbrirEntidad={() => elAbierto && abrirEntidad(elAbierto)}
            onEnviarMensaje={() => elAbierto && void escribirle(elAbierto)}
            onCerrar={() => setAbierto(null)}
          />
        </div>

        <CostadoDeRecordatorios
          resumen={resumen.datos}
          hoy={hoy}
          cargando={resumen.estado === 'cargando' && resumen.datos === null}
          puedeGestionar={puedeGestionar}
          puedeConfigurar={puedeConfigurar}
          onAbrir={(p) => {
            setVistaRepeticiones(false);
            setAbierto(p.id);
          }}
          onVerTodos={() => {
            setVistaRepeticiones(false);
            setPestana('pendientes');
            setPagina(1);
          }}
          onNuevo={() => abrirNuevo(false)}
          onNuevoRecurrente={() => abrirNuevo(true)}
          onCategorias={() => setCategoriasAbiertas(true)}
          onHistorialCompletado={() => {
            setVistaRepeticiones(false);
            setPestana('completados');
            setPagina(1);
          }}
        />
      </div>

      {formulario ? (
        <FormularioDeRecordatorio
          abierto
          titulo={
            formulario.repeticionId !== null
              ? 'Editar la repetición'
              : formulario.datos.repetir
                ? 'Recordatorio que se repite'
                : formulario.id === null
                  ? 'Nuevo recordatorio'
                  : 'Editar recordatorio'
          }
          datos={formulario.datos}
          relacionado={formulario.relacionado}
          buscandoRelacion={buscandoRelacion}
          opcionesDeRelacion={relaciones.datos ?? []}
          buscandoRelacionEnCurso={relaciones.estado === 'cargando' && relaciones.datos === null}
          categorias={categorias.datos ?? []}
          responsables={responsables.datos ?? []}
          anticipacionDelCentro={ajustesPuestos.anticipacionMin}
          puedeAdministrarCategorias={puedeConfigurar}
          trabajando={alta.trabajando || regla.trabajando}
          error={alta.error ?? regla.error}
          mostrarErrores={mostrarErrores}
          loQueFalta={loQueFaltaDelRecordatorio(formulario.datos)}
          onCambiar={(d) =>
            setFormulario((f) =>
              f
                ? {
                    ...f,
                    datos: d,
                    // Al cambiar de tipo o quitar la relacion, el nombre
                    // resuelto deja de valer: si se quedara, el plegable
                    // seguiria diciendo el nombre de algo que ya no esta.
                    relacionado: d.entidadId === f.datos.entidadId ? f.relacionado : null,
                  }
                : f,
            )
          }
          onBuscarRelacion={setBuscandoRelacion}
          onGuardar={() => void guardar()}
          onCerrar={() => setFormulario(null)}
          onAdministrarCategorias={() => {
            setFormulario(null);
            setCategoriasAbiertas(true);
          }}
        />
      ) : null}

      {aAplazar ? (
        <Aplazar
          recordatorio={aAplazar.r}
          hoy={hoy}
          ahora={aAplazar.ahora}
          trabajando={aplazo.trabajando}
          error={aplazo.error}
          onAplazar={(fecha, hora) => {
            void aplazo.ejecutar(aAplazar.r.id, fecha, hora).then(() => setAAplazar(null));
          }}
          onCerrar={() => setAAplazar(null)}
        />
      ) : null}

      <AjustesDeRecordatoriosModal
        abierto={ajustesAbiertos}
        ajustes={ajustesPuestos}
        automatizaciones={automatizaciones.datos ?? []}
        categorias={categorias.datos ?? []}
        responsables={responsables.datos ?? []}
        puedeConfigurar={puedeConfigurar}
        trabajando={configuracion.trabajando || automatizacion.trabajando}
        error={configuracion.error ?? automatizacion.error}
        onGuardar={(a) => void configuracion.ejecutar(a).then(() => setAjustesAbiertos(false))}
        onGuardarAutomatizacion={(d) => void automatizacion.ejecutar(d)}
        onEncenderAvisos={() => void pedirPermisoDeAviso()}
        onCategorias={() => {
          setAjustesAbiertos(false);
          setCategoriasAbiertas(true);
        }}
        onCerrar={() => setAjustesAbiertos(false)}
      />

      <AdministrarCategorias
        abierto={categoriasAbiertas}
        titulo="Categorías de recordatorios"
        que="recordatorio"
        categorias={categorias.datos ?? []}
        cargando={categorias.estado === 'cargando' && categorias.datos === null}
        trabajando={categoria.trabajando || archivo.trabajando}
        error={categoria.error ?? archivo.error}
        onGuardar={(id, d) => void categoria.ejecutar(id, d)}
        onArchivar={(id) => void archivo.ejecutar(id)}
        onCerrar={() => setCategoriasAbiertas(false)}
      />

      {/* ELIMINAR PIDE CONFIRMACION Y DICE QUE NO SE PIERDE NADA. Sin lo
          segundo, quien tiene dudas no lo aprieta y la lista se llena de cosas
          que nadie se atreve a quitar. */}
      <Confirmacion
        abierto={aEliminar !== null}
        titulo="¿Eliminar este recordatorio?"
        confirmar="Eliminar"
        destructivo
        trabajando={borrado.trabajando}
        onConfirmar={() => {
          if (!aEliminar) return;
          void borrado.ejecutar(aEliminar.id).then(() => {
            if (abierto === aEliminar.id) setAbierto(null);
            setAEliminar(null);
          });
        }}
        onCancelar={() => setAEliminar(null)}
      >
        <p className="pz-dato__valor">
          <strong>{aEliminar?.titulo}</strong>
        </p>
        <p className="tt-secundario">
          No se borra de verdad: se marca como eliminado y su historial se queda. Si lo creó una
          automatización, esa regla podrá volver a avisarte de lo mismo.
        </p>
        {borrado.error ? <p className="pz-error__detalle">{borrado.error}</p> : null}
      </Confirmacion>

      <Confirmacion
        abierto={aCancelar !== null}
        titulo="¿Cancelar este recordatorio?"
        confirmar="Cancelarlo"
        trabajando={anulacion.trabajando}
        onConfirmar={() => {
          if (!aCancelar) return;
          void anulacion.ejecutar(aCancelar.id, motivo).then(() => {
            setACancelar(null);
            setMotivo('');
          });
        }}
        onCancelar={() => setACancelar(null)}
      >
        {/* CANCELAR NO ES COMPLETAR, y se dice: uno se hizo y el otro ya no
            aplica. Contarlos juntos convertiria "completados este mes" en un
            numero que nadie puede usar. */}
        <p className="tt-secundario">
          Cancelar quiere decir "ya no aplica", no "ya se hizo": no cuenta como completado.
        </p>
        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Motivo</span>
          <input
            className="rec-campo"
            autoComplete="off"
            placeholder="Por qué ya no aplica (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
        {anulacion.error ? <p className="pz-error__detalle">{anulacion.error}</p> : null}
      </Confirmacion>

      {aAjustar ? (
        <Confirmacion
          abierto
          titulo={
            aAjustar.que === 'responsable'
              ? 'Cambiar responsable'
              : aAjustar.que === 'prioridad'
                ? 'Cambiar prioridad'
                : 'Cambiar categoría'
          }
          confirmar="Listo"
          trabajando={ajuste.trabajando}
          onConfirmar={() => setAAjustar(null)}
          onCancelar={() => setAAjustar(null)}
        >
          <p className="pz-dato__valor">
            <strong>{aAjustar.r.titulo}</strong>
          </p>
          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">
              {aAjustar.que === 'responsable'
                ? 'Quién lo hace'
                : aAjustar.que === 'prioridad'
                  ? 'Qué tan urgente es'
                  : 'De qué grupo es'}
            </span>
            <select
              defaultValue={
                aAjustar.que === 'responsable'
                  ? (aAjustar.r.responsableId ?? '')
                  : aAjustar.que === 'prioridad'
                    ? aAjustar.r.prioridad
                    : (aAjustar.r.categoriaId ?? '')
              }
              onChange={(e) => void ajuste.ejecutar(aAjustar.r.id, aAjustar.que, e.target.value)}
            >
              {aAjustar.que === 'responsable' ? (
                <>
                  <option value="">Sin asignar</option>
                  {(responsables.datos ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </>
              ) : aAjustar.que === 'prioridad' ? (
                <>
                  <option value="baja">Baja</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </>
              ) : (
                <>
                  <option value="">Sin categoría</option>
                  {(categorias.datos ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          {ajuste.error ? <p className="pz-error__detalle">{ajuste.error}</p> : null}
        </Confirmacion>
      ) : null}
    </div>
  );
}

/**
 * El numero que va al lado de cada pestaña.
 *
 * SALE DEL RESUMEN, que cuenta contra la tabla entera. "Todos" no lleva
 * contador a proposito: seria el total de la base, y un numero de cuatro cifras
 * al lado de una pestaña no informa de nada.
 */
export function contadorDe(
  pestana: PestanaDeRecordatorios,
  r: ResumenDeRecordatorios | null,
): number | null {
  if (r === null) return null;
  if (pestana === 'pendientes') return r.pendientes;
  if (pestana === 'hoy') return r.hoy;
  if (pestana === 'proximos') return r.proximos;
  if (pestana === 'completados') return r.completados;
  return null;
}
