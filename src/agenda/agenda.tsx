/**
 * LA AGENDA.
 *
 * Es la fuente de verdad de las citas del centro. Inicio, Clientes, Reportes
 * y Recordatorios CONSULTAN estas citas; ninguno guarda su propia copia.
 *
 * Este archivo solo coordina: decide que se pide, que se pinta y que pasa al
 * tocar. La aritmetica del calendario vive en `rangos.ts` y `disposicion.ts`,
 * el acceso a datos en `datos/agenda.ts`, y las reglas duras —choques de
 * horario, permisos, aislamiento entre centros— en la base de datos.
 */

import { tomarIntencion, useNavegacion } from '@neron/base/marco';
import { Boton } from '@neron/base/ui';
import { desdeDate, esFecha, type Fecha } from '@neron/base/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import { PREFIJO_DE_INICIO } from '../datos/tablero.js';
import {
  cambiarEstado,
  crearCita,
  llaveDeCitas,
  reagendar,
  traerCitas,
  traerClientes,
  traerHistorial,
  traerProfesionales,
  traerServicios,
  type CitaEnAgenda,
  type ClienteBreve,
  type EstadoDeCita,
  type FiltrosDeAgenda,
  type Historial,
  type ProfesionalBreve,
  type ServicioBreve,
} from '../datos/citas.js';
import { buscarPosibleDuplicado, crearCliente } from '../datos/clientes.js';
import { useSesion } from '../identidad/sesion.js';
import { ControlesDeAgenda } from './controles.js';
import { ventanaDelDia } from './disposicion.js';
import { FormularioDeCita, type ValoresDeCita } from './formulario.js';
import { PanelDeCita } from './panel.js';
import { mover, rangoDe, type Vista } from './rangos.js';
import { Leyenda, VistaDia, VistaMes, VistaSemana } from './vistas.js';
import { Icono } from '../ui/iconos.js';

/**
 * La franja de horas de la que se PARTE. Es provisional y esta marcada.
 *
 * Cuando exista Configuracion (bloque 10) el horario del centro sale de ahi,
 * por dia de la semana. Mientras tanto se arranca en una franja normal de
 * consultorio y `ventanaDelDia` la ESTIRA sola para que quepa cualquier cita
 * que se salga — asi una cita de las siete de la mañana se ve a las siete y no
 * recortada contra el borde fingiendo que empieza a las ocho.
 */
const ABRE = 8 * 60;
const CIERRA = 20 * 60;

export function Agenda() {
  const { acceso } = useSesion();
  const { ruta, ir } = useNavegacion();
  const negocio = acceso?.negocioId ?? '';
  const puedeGestionar = acceso?.permisos['gestionarAgenda'] === true;

  const [vista, setVista] = useState<Vista>('dia');
  const [fecha, setFecha] = useState<Fecha>(() => desdeDate(new Date()));
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosDeAgenda>({});
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [formulario, setFormulario] = useState<{
    modo: 'nueva' | 'editar' | 'reagendar';
    inicial: ValoresDeCita;
    citaId?: string;
  } | null>(null);

  const rango = useMemo(() => rangoDe(vista, fecha), [vista, fecha]);

  /* --- Lo que se pide al servidor ---------------------------------- */

  const citas = useConsulta<CitaEnAgenda[]>(
    negocio ? llaveDeCitas(negocio, rango.desde, rango.hasta, filtros) : null,
    () => traerCitas(negocio, rango.desde, rango.hasta, filtros),
  );

  const clientes = useConsulta<ClienteBreve[]>(
    negocio ? `clientes:${negocio}` : null,
    () => traerClientes(negocio),
  );

  const servicios = useConsulta<ServicioBreve[]>(
    negocio ? `servicios:${negocio}` : null,
    () => traerServicios(negocio),
  );

  const profesionales = useConsulta<ProfesionalBreve[]>(
    negocio ? `profesionales:${negocio}` : null,
    () => traerProfesionales(negocio),
  );

  const cita = (citas.datos ?? []).find((c) => c.id === seleccionada) ?? null;

  const historial = useConsulta<Historial>(
    cita ? `historial:${cita.clienteId}` : null,
    () => traerHistorial(cita!.clienteId),
  );

  /* --- Lo que cambia datos ----------------------------------------- */

  /**
   * Al terminar bien, se invalida 'citas' entero: dia, semana, mes y todas las
   * combinaciones de filtros se refrescan solas. Nadie aprieta F5.
   *
   * Y TAMBIEN INICIO. El tablero cuenta estas mismas citas: sin esta linea,
   * agendar una y volver a Inicio mostraria el numero de antes, con toda la
   * cara de estar al dia. Hay una guardia que exige que toda operacion lo
   * declare, justo porque es lo primero que se olvida.
   */
  const guardar = useOperacion(crearCita, ['citas', 'historial', PREFIJO_DE_INICIO]);
  const mover_ = useOperacion(reagendar, ['citas', 'historial', PREFIJO_DE_INICIO]);
  const estado = useOperacion(cambiarEstado, ['citas', 'historial', PREFIJO_DE_INICIO]);
  // Un paciente nuevo no cambia ninguna cifra del tablero, pero SI tiene que
  // aparecer en el buscador global, que cuelga de la misma llave.
  const altaCliente = useOperacion(crearCliente, ['clientes', PREFIJO_DE_INICIO]);

  const vacio: ValoresDeCita = {
    clienteId: '', servicioId: '', profesionalId: '', fecha, horaInicio: '09:00', notas: '',
  };

  function abrirNueva(f: Fecha = fecha, hora = '09:00'): void {
    if (!puedeGestionar) return;
    setFormulario({ modo: 'nueva', inicial: { ...vacio, fecha: f, horaInicio: hora } });
  }

  /* --- Lo que se pide desde fuera de la Agenda ---------------------- */

  /**
   * LOS FILTROS LLEGAN EN LA DIRECCION, no en la memoria.
   *
   * Es lo que hace que "2 pendientes" del tablero abra la Agenda de HOY ya
   * filtrada en pendientes, que ese enlace se pueda mandar por WhatsApp, y que
   * recargar no pierda el filtro.
   *
   * Se depende de los VALORES, no del objeto de parametros: ese objeto es uno
   * nuevo en cada render, y usarlo de dependencia dispararia el efecto sin
   * parar hasta trabar la pestaña.
   */
  const fechaPedida = ruta.parametros['fecha'] ?? '';
  const estadoPedido = ruta.parametros['estado'] ?? '';

  useEffect(() => {
    if (fechaPedida && esFecha(fechaPedida)) {
      setFecha(fechaPedida);
      setVista('dia');
    }
    if (estadoPedido) {
      setFiltros((f) => ({ ...f, estado: estadoPedido }));
      // Se ABREN los filtros. Una agenda que muestra tres citas de veinte sin
      // decir que hay un filtro puesto se lee como una agenda vacia.
      setFiltrosAbiertos(true);
    }
  }, [fechaPedida, estadoPedido]);

  /**
   * EL RECADO DE QUIEN NOS MANDO, que se consume UNA sola vez.
   *
   * "Nueva cita" desde Inicio abre la Agenda Y el formulario. Va aparte de la
   * direccion a proposito: como parametro se quedaria pegado y el formulario
   * volveria a abrirse en cada recarga, y tambien a quien reciba el enlace.
   *
   * El candado del `useRef` es por el modo estricto de React, que monta,
   * desmonta y vuelve a montar en desarrollo: sin el, la intencion se
   * consumiria en el primer montaje y el segundo no encontraria nada.
   */
  const recadoLeido = useRef(false);
  useEffect(() => {
    if (recadoLeido.current) return;
    recadoLeido.current = true;

    const recado = tomarIntencion('agenda');
    if (!recado) return;
    if (recado.accion === 'nueva') abrirNueva(fechaPedida && esFecha(fechaPedida) ? fechaPedida : fecha);
    else if (recado.accion === 'abrir' && recado.detalle) setSeleccionada(recado.detalle);
    // Las dependencias se dejan fuera a proposito: esto corre UNA vez al
    // llegar. Volver a correrlo al cambiar de dia reabriria el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function alGuardar(v: ValoresDeCita): Promise<void> {
    if (formulario?.modo === 'reagendar' && formulario.citaId) {
      const r = await mover_.ejecutar(
        formulario.citaId, v.fecha, v.horaInicio, v.profesionalId || null, undefined,
      );
      if (r !== null) setFormulario(null);
      return;
    }
    const r = await guardar.ejecutar({
      negocioId: negocio,
      clienteId: v.clienteId,
      servicioId: v.servicioId,
      profesionalId: v.profesionalId || null,
      fecha: v.fecha,
      horaInicio: v.horaInicio,
      notas: v.notas,
    });
    // Solo se cierra si de verdad guardo. Cerrar y perder lo escrito cuando
    // el horario estaba ocupado es la peor combinacion posible.
    if (r !== null) setFormulario(null);
  }

  const cargando = citas.estado === 'cargando' && citas.datos === null;

  /**
   * La franja visible se calcula con las citas QUE YA LLEGARON.
   *
   * Mientras cargan se usa la de por omision: recalcularla al llegar hace que
   * la regla se reacomode una vez, que es infinitamente mejor que recortar una
   * cita y mostrarla en la hora equivocada.
   */
  const ventana = useMemo(
    () => ventanaDelDia(citas.datos ?? [], ABRE, CIERRA),
    [citas.datos],
  );

  /** Cuantos filtros hay puestos. Se dice con un numero, no solo con color. */
  const filtrosPuestos = [filtros.profesionalId, filtros.servicioId, filtros.estado].filter(
    Boolean,
  ).length;

  const propiedadesDeVista = {
    fecha,
    citas: citas.datos ?? [],
    seleccionada,
    abre: ventana.abre,
    cierra: ventana.cierra,
    onSeleccionar: (c: CitaEnAgenda) => setSeleccionada(c.id),
    onHueco: (f: Fecha, hora: string) => abrirNueva(f, hora),
    onIrAlDia: (f: Fecha) => { setFecha(f); setVista('dia'); },
  };

  return (
    <div className="agenda mv-pantalla">
      <header className="agenda-encabezado">
        <span className="agenda-encabezado__icono" aria-hidden="true">
          <Icono nombre="calendario" lado={26} />
        </span>
        <div className="agenda-encabezado__texto">
          <h2 className="agenda-encabezado__titulo">Agenda</h2>
          <p className="agenda-encabezado__lema">Gestiona tus citas y terapias</p>
        </div>
      </header>

      <ControlesDeAgenda
        vista={vista}
        fecha={fecha}
        puedeCrear={puedeGestionar}
        filtrosAbiertos={filtrosAbiertos}
        filtrosPuestos={filtrosPuestos}
        onNueva={() => abrirNueva()}
        onHoy={() => setFecha(desdeDate(new Date()))}
        onMover={(pasos) => setFecha(mover(vista, fecha, pasos))}
        onFecha={(f) => setFecha(f)}
        onVista={setVista}
        onFiltros={() => setFiltrosAbiertos((a) => !a)}
      />

      {filtrosAbiertos ? (
        <div className="agenda-filtros">
          <label className="agenda-filtros__campo">
            <span>Terapeuta</span>
            <select
              value={filtros.profesionalId ?? ''}
              onChange={(e) => setFiltros((f) => ({ ...f, profesionalId: e.target.value || null }))}
            >
              <option value="">Todas</option>
              {(profesionales.datos ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <label className="agenda-filtros__campo">
            <span>Servicio</span>
            <select
              value={filtros.servicioId ?? ''}
              onChange={(e) => setFiltros((f) => ({ ...f, servicioId: e.target.value || null }))}
            >
              <option value="">Todos</option>
              {(servicios.datos ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </label>
          <label className="agenda-filtros__campo">
            <span>Estado</span>
            <select
              value={filtros.estado ?? ''}
              onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value || null }))}
            >
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="confirmada">Confirmada</option>
              <option value="completada">Completada</option>
              <option value="cancelada">Cancelada</option>
              <option value="no_asistio">No asistió</option>
            </select>
          </label>
          <Boton tono="contorno" onClick={() => setFiltros({})}>Quitar filtros</Boton>
        </div>
      ) : null}

      <div className="agenda-cuerpo">
        <div className="agenda-calendario">
          {citas.error ? (
            <div className="agenda-error" role="alert">
              <p>No pudimos cargar la agenda.</p>
              <p className="agenda-error__detalle">{citas.error}</p>
              <Boton tono="contorno" onClick={citas.recargar}>Reintentar</Boton>
            </div>
          ) : cargando ? (
            // Siluetas, no una agenda vacia: una agenda vacia mientras carga
            // le dice a la persona que no tiene citas, y no es verdad.
            <div className="agenda-cargando" aria-busy="true">
              <span className="neron-solo-lectores">Cargando la agenda</span>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="terapias-silueta agenda-cargando__bloque" />
              ))}
            </div>
          ) : vista === 'dia' ? (
            <VistaDia {...propiedadesDeVista} />
          ) : vista === 'semana' ? (
            <VistaSemana {...propiedadesDeVista} />
          ) : (
            <VistaMes {...propiedadesDeVista} />
          )}
          <Leyenda />
        </div>

        <PanelDeCita
          cita={cita}
          historial={historial.datos}
          cargandoHistorial={historial.estado === 'cargando'}
          puedeGestionar={puedeGestionar}
          onCerrar={() => setSeleccionada(null)}
          onEditar={() =>
            cita &&
            setFormulario({
              modo: 'editar',
              citaId: cita.id,
              inicial: {
                clienteId: cita.clienteId, servicioId: cita.servicioId,
                profesionalId: cita.profesionalId ?? '', fecha: cita.fecha,
                horaInicio: cita.horaInicio, notas: cita.notas ?? '',
              },
            })
          }
          onReagendar={() =>
            cita &&
            setFormulario({
              modo: 'reagendar',
              citaId: cita.id,
              inicial: {
                clienteId: cita.clienteId, servicioId: cita.servicioId,
                profesionalId: cita.profesionalId ?? '', fecha: cita.fecha,
                horaInicio: cita.horaInicio, notas: '',
              },
            })
          }
          onCambiarEstado={(e: EstadoDeCita) => void estado.ejecutar(cita!.id, e)}
          // La sesion se administra en CURSOS, no aqui: se navega con un
          // recado con su id. La agenda no conoce las tripas de Cursos.
          onVerCurso={() => {
            if (cita?.cursoId) ir('cursos', { intencion: `cursos:abrir:${cita.cursoId}` });
          }}
          onEnviarMensaje={() => {
            if (!cita) return;
            /**
             * AGENDA NO MANDA MENSAJES: abre Mensajes con el contexto.
             *
             * Va el ID DEL PACIENTE, no su telefono. Un telefono copiado deja
             * de ser el bueno en cuanto alguien lo corrige en Clientes, y
             * ademas no permite reconocer una conversacion que ya existe. El
             * id de la cita viaja detras para que la conversacion sepa de que
             * cita salio.
             */
            ir('mensajes', {
              intencion: `mensajes:escribir:${cita.clienteId}:${cita.id}`,
            });
          }}
        />
      </div>

      {estado.error ? (
        <p className="agenda-form__error" role="alert">{estado.error}</p>
      ) : null}

      {formulario ? (
        <FormularioDeCita
          // La llave fuerza un formulario limpio al abrirlo con otros valores.
          key={`${formulario.modo}:${formulario.citaId ?? ''}:${formulario.inicial.fecha}:${formulario.inicial.horaInicio}`}
          abierto
          titulo={
            formulario.modo === 'nueva' ? 'Nueva cita'
              : formulario.modo === 'editar' ? 'Editar cita'
              : 'Reagendar cita'
          }
          inicial={formulario.inicial}
          clientes={clientes.datos ?? []}
          servicios={servicios.datos ?? []}
          profesionales={profesionales.datos ?? []}
          soloHorario={formulario.modo === 'reagendar'}
          trabajando={guardar.trabajando || mover_.trabajando}
          error={guardar.error ?? mover_.error}
          onGuardar={(v) => void alGuardar(v)}
          onCrearCliente={(datos) =>
            /**
             * UNA PERSONA, UN REGISTRO. Guarda en CLIENTES con la misma funcion
             * que usa el modulo Clientes: no hay un "paciente de agenda". Lo
             * que se capture aqui —incluida la ficha de salud— aparece en
             * Clientes al instante, y al reves igual.
             *
             * Ya no se rellena con `DATOS_VACIOS`: la ficha que llega es la
             * COMPLETA, porque es el mismo formulario. Mezclarla con el vacio
             * era lo que hacia falta cuando aqui solo se preguntaban tres
             * campos.
             */
            altaCliente.ejecutar(negocio, datos)
          }
          onBuscarDuplicado={(telefono, correo) =>
            buscarPosibleDuplicado(negocio, telefono, correo)
          }
          onAbrirDuplicado={(id) => ir('clientes', { intencion: `clientes:abrir:${id}` })}
          onCerrar={() => setFormulario(null)}
        />
      ) : null}
    </div>
  );
}
