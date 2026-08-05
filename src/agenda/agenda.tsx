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

import { Boton } from '@neron/base/ui';
import { desdeDate, type Fecha } from '@neron/base/utils';
import { useMemo, useState } from 'react';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  cambiarEstado,
  crearCita,
  crearCliente,
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
import { useSesion } from '../identidad/sesion.js';
import { FormularioDeCita, type ValoresDeCita } from './formulario.js';
import { PanelDeCita } from './panel.js';
import { mover, rangoDe, tituloDe, type Vista } from './rangos.js';
import { Leyenda, VistaDia, VistaMes, VistaSemana } from './vistas.js';

/**
 * El horario que se ve en la columna.
 *
 * Vive aqui de forma provisional y ESTA MARCADO: cuando exista el modulo de
 * Configuracion (bloque 10) sale de ahi, por dia de la semana. No es un
 * numero escogido para que se parezca a la captura — es el rango que abarca
 * cualquier horario razonable, y una cita fuera de el se recorta pero NO se
 * esconde.
 */
const ABRE = 7 * 60;
const CIERRA = 21 * 60;

const VISTAS: readonly { clave: Vista; etiqueta: string }[] = [
  { clave: 'dia', etiqueta: 'Día' },
  { clave: 'semana', etiqueta: 'Semana' },
  { clave: 'mes', etiqueta: 'Mes' },
];

export function Agenda() {
  const { acceso } = useSesion();
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

  // Al terminar bien, se invalida 'citas' entero: dia, semana, mes y todas
  // las combinaciones de filtros se refrescan solas. Nadie aprieta F5.
  const guardar = useOperacion(crearCita, ['citas', 'historial']);
  const mover_ = useOperacion(reagendar, ['citas', 'historial']);
  const estado = useOperacion(cambiarEstado, ['citas', 'historial']);
  const altaCliente = useOperacion(crearCliente, ['clientes']);

  const vacio: ValoresDeCita = {
    clienteId: '', servicioId: '', profesionalId: '', fecha, horaInicio: '09:00', notas: '',
  };

  function abrirNueva(f: Fecha = fecha, hora = '09:00'): void {
    if (!puedeGestionar) return;
    setFormulario({ modo: 'nueva', inicial: { ...vacio, fecha: f, horaInicio: hora } });
  }

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

  const propiedadesDeVista = {
    fecha,
    citas: citas.datos ?? [],
    seleccionada,
    abre: ABRE,
    cierra: CIERRA,
    onSeleccionar: (c: CitaEnAgenda) => setSeleccionada(c.id),
    onHueco: (f: Fecha, hora: string) => abrirNueva(f, hora),
    onIrAlDia: (f: Fecha) => { setFecha(f); setVista('dia'); },
  };

  return (
    <div className="agenda">
      <header className="agenda-encabezado">
        <div>
          <h2 className="agenda-encabezado__titulo">Agenda</h2>
          <p className="agenda-encabezado__lema">Gestiona tus citas y terapias</p>
        </div>
      </header>

      <div className="agenda-controles">
        {puedeGestionar ? (
          <Boton tono="principal" onClick={() => abrirNueva()}>
            + Nueva cita
          </Boton>
        ) : null}

        <div className="agenda-controles__grupo" role="group" aria-label="Navegar">
          <Boton tono="contorno" onClick={() => setFecha(desdeDate(new Date()))}>
            Hoy
          </Boton>
          <Boton tono="contorno" onClick={() => setFecha(mover(vista, fecha, -1))} aria-label="Anterior">
            ‹
          </Boton>
          <Boton tono="contorno" onClick={() => setFecha(mover(vista, fecha, 1))} aria-label="Siguiente">
            ›
          </Boton>
        </div>

        {/* Un aria-live para que quien usa lector se entere de que cambio la
            fecha: el texto cambia sin que nada mas lo anuncie. */}
        <span className="agenda-controles__fecha" aria-live="polite">
          {tituloDe(vista, fecha)}
        </span>

        <div className="agenda-controles__vistas" role="group" aria-label="Vista">
          {VISTAS.map((v) => (
            <button
              key={v.clave}
              type="button"
              className={`agenda-vista${v.clave === vista ? ' agenda-vista--puesta' : ''}`}
              aria-pressed={v.clave === vista}
              onClick={() => setVista(v.clave)}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>

        <Boton
          tono="contorno"
          onClick={() => setFiltrosAbiertos((a) => !a)}
          aria-expanded={filtrosAbiertos}
        >
          Filtros
        </Boton>
      </div>

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
          onCrearCliente={(datos) => altaCliente.ejecutar(negocio, datos)}
          onCerrar={() => setFormulario(null)}
        />
      ) : null}
    </div>
  );
}
