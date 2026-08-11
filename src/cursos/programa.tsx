/**
 * CURSOS — el programa de talleres y formaciones.
 *
 * ES LA FUENTE DE VERDAD DE LO QUE SE IMPARTE, y de nada mas. Los alumnos son
 * de Clientes, el dinero de Ventas, las sesiones salen en Agenda, la
 * rentabilidad la calcula Reportes. Aqui se PREGUNTAN y se unen.
 *
 * Este archivo SOLO COORDINA: que se pide, que se pinta y que pasa al tocar.
 * Las cifras las cuenta la base, las validaciones viven en
 * `formulario-de-curso.tsx`, y las reglas duras —cupo, sobreventa, choque de
 * instructor, aislamiento entre centros— en la base de datos.
 *
 * NO IMPORTA NADA DE CLIENTES NI DE AGENDA. Para dar de alta a alguien nuevo se
 * navega con un recado, igual que hace Inicio. Que dos modulos esten conectados
 * no significa que uno tenga que conocer las tripas del otro.
 */

import { tomarIntencion, useNavegacion } from '@neron/base/marco';
import { Confirmacion } from '@neron/base/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Categoria } from '../datos/categorias.js';
import { llaveDeCategorias, traerCategorias } from '../datos/categorias.js';
import type { ProfesionalBreve } from '../datos/citas.js';
import { traerProfesionales } from '../datos/citas.js';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  archivarCategoria,
  guardarCategoria,
} from '../datos/categorias.js';
import {
  archivarMaterial,
  archivarSesion,
  cambiarEstadoDeCurso,
  cambiarEstadoDeInscripcion,
  guardarCurso,
  guardarMaterial,
  guardarSesion,
  inscribirEnCurso,
  llaveDeCursos,
  llaveDeLaFichaDelCurso,
  llaveDelResumenDeCursos,
  traerCursosDelCentro,
  traerFichaDeCurso,
  traerResumenDeCursos,
  LO_QUE_TOCA_UN_CURSO,
  type CursoEnLista,
  type DatosDeCurso,
  type FichaDeCurso,
  type FiltrosDeCursos,
  type PaginaDeCursos,
  type ResumenDeCursos,
  type VidaDeCurso,
} from '../datos/cursos.js';
import { traerClientes } from '../datos/citas.js';
import type { ClienteBreve } from '../datos/citas.js';
import { useSesion } from '../identidad/sesion.js';
import { AdministrarCategorias } from '../ui/administrar-categorias.js';
import { Icono } from '../ui/iconos.js';
import { CifrasDeCursos } from './cifras-de-cursos.js';
import { CURSO_VACIO, FormularioDeCurso } from './formulario-de-curso.js';
import { PanelDelCurso, loQuePasaAlApagarElCurso } from './panel-del-curso.js';
import { TablaDeCursos } from './tabla-de-cursos.js';

/** Cuanto se espera antes de consultar mientras alguien escribe. */
const ESPERA_MS = 300;

/** La ficha del servidor, lista para el formulario. */
export function fichaAFormularioDeCurso(f: FichaDeCurso): DatosDeCurso {
  return {
    nombre: f.nombre,
    subtitulo: f.subtitulo ?? '',
    descripcion: f.descripcion ?? '',
    categoriaId: f.categoriaId ?? '',
    instructorId: f.instructorId ?? '',
    fechaInicio: f.fechaInicio ?? '',
    fechaFin: f.fechaFin ?? '',
    precioCentavos: f.precioCentavos,
    cupo: f.cupo,
    modalidad: f.modalidad,
    lugar: f.lugar ?? '',
    enlace: f.enlace ?? '',
    imagenUrl: f.imagenUrl ?? '',
    notas: f.notas ?? '',
    activo: f.activo,
  };
}

/**
 * Un duplicado sale con OTRO nombre y APAGADO.
 *
 * Con el mismo nombre quedan dos renglones identicos en la lista y las
 * inscripciones se reparten entre los dos sin que nadie lo note. Apagado,
 * porque una copia a medio ajustar que ya se ofrece se acaba vendiendo.
 */
export function comoSeDuplicaElCurso(f: FichaDeCurso): DatosDeCurso {
  return { ...fichaAFormularioDeCurso(f), nombre: `${f.nombre} (copia)`, activo: false };
}

export function Programa() {
  const { acceso } = useSesion();
  const { ir } = useNavegacion();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  const puedeGestionar = permisos['gestionarCatalogo'] === true;

  /* --- Lo que la persona escogio ------------------------------------ */

  const [escrito, setEscrito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pestana, setPestana] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [conLugares, setConLugares] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);

  const [formulario, setFormulario] = useState<{ inicial: DatosDeCurso; id?: string } | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false);
  const [aCambiarEstado, setACambiarEstado] = useState(false);
  const [buscandoCliente, setBuscandoCliente] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(escrito.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [escrito]);

  /**
   * Cualquier filtro nuevo devuelve a la PAGINA UNO.
   *
   * Sin esto, alguien parado en la pagina 3 escribe un nombre, el resultado
   * tiene una sola pagina, y la lista sale vacia — con toda la cara de que ese
   * curso no existe.
   */
  useEffect(
    () => setPagina(1),
    [busqueda, pestana, categoriaId, instructorId, modalidad, conLugares, porPagina],
  );

  const filtros: FiltrosDeCursos = useMemo(
    () => ({
      busqueda,
      vida: pestana as VidaDeCurso | '',
      categoriaId,
      instructorId,
      modalidad,
      conLugares,
    }),
    [busqueda, pestana, categoriaId, instructorId, modalidad, conLugares],
  );

  /* --- Lo que se le pide al servidor -------------------------------- */

  const lista = useConsulta<PaginaDeCursos>(
    negocio ? llaveDeCursos(negocio, filtros, pagina, porPagina) : null,
    () => traerCursosDelCentro(negocio, filtros, pagina, porPagina),
  );

  const resumen = useConsulta<ResumenDeCursos>(
    negocio ? llaveDelResumenDeCursos(negocio) : null,
    () => traerResumenDeCursos(negocio),
  );

  const categorias = useConsulta<Categoria[]>(
    negocio ? llaveDeCategorias(negocio, 'curso') : null,
    () => traerCategorias(negocio, 'curso'),
  );

  // El MISMO equipo que ofrece la Agenda, por la MISMA llave: no hay dos listas
  // de personal que puedan decir cosas distintas.
  const instructores = useConsulta<ProfesionalBreve[]>(
    negocio ? `profesionales:${negocio}` : null,
    () => traerProfesionales(negocio),
  );

  const ficha = useConsulta<FichaDeCurso | null>(
    abierto ? llaveDeLaFichaDelCurso(abierto) : null,
    () => traerFichaDeCurso(abierto!),
  );

  // Los alumnos salen de CLIENTES, por la MISMA llave que usa la Agenda para
  // escoger a quien se le agenda: una sola lista de personas en todo el
  // sistema, y un solo viaje aunque las dos pantallas la pidan.
  const clientes = useConsulta<ClienteBreve[]>(
    negocio ? `clientes:breve:${negocio}` : null,
    () => traerClientes(negocio),
  );

  /**
   * El filtro del buscador de alumnos se hace AQUI, sobre la lista ya traida.
   *
   * Son los clientes del centro, no un catalogo de miles: pedirle al servidor
   * una consulta por cada letra seria mas lento que filtrar en memoria, y ya
   * esta pagado el viaje que hizo la Agenda.
   */
  const clientesQueCoinciden = useMemo(() => {
    const t = buscandoCliente.trim().toLowerCase();
    const todos = clientes.datos ?? [];
    if (!t) return todos.slice(0, 8);
    return todos
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(t) || (c.telefono ?? '').includes(t),
      )
      .slice(0, 8);
  }, [clientes.datos, buscandoCliente]);

  /* --- Lo que cambia datos ------------------------------------------ */

  const guardado = useOperacion(guardarCurso, [...LO_QUE_TOCA_UN_CURSO]);
  const cambioDeEstado = useOperacion(cambiarEstadoDeCurso, [...LO_QUE_TOCA_UN_CURSO]);
  const inscripcion = useOperacion(inscribirEnCurso, [...LO_QUE_TOCA_UN_CURSO]);
  const cambioDeInscripcion = useOperacion(cambiarEstadoDeInscripcion, [...LO_QUE_TOCA_UN_CURSO]);
  const sesion = useOperacion(guardarSesion, [...LO_QUE_TOCA_UN_CURSO]);
  const bajaDeSesion = useOperacion(archivarSesion, [...LO_QUE_TOCA_UN_CURSO]);
  const material = useOperacion(guardarMaterial, [...LO_QUE_TOCA_UN_CURSO]);
  const bajaDeMaterial = useOperacion(archivarMaterial, [...LO_QUE_TOCA_UN_CURSO]);
  const categoria = useOperacion(guardarCategoria, [...LO_QUE_TOCA_UN_CURSO]);
  const bajaDeCategoria = useOperacion(archivarCategoria, [...LO_QUE_TOCA_UN_CURSO]);

  /**
   * EL RECADO DE QUIEN NOS MANDO, que se consume UNA sola vez.
   *
   * "Inscribir en un curso" desde el expediente de un cliente llega aqui con su
   * id. El candado del `useRef` es por el modo estricto de React, que monta,
   * desmonta y vuelve a montar en desarrollo.
   */
  const recadoLeido = useRef(false);
  useEffect(() => {
    if (recadoLeido.current) return;
    recadoLeido.current = true;

    const recado = tomarIntencion('cursos');
    if (!recado) return;
    if (recado.accion === 'nuevo') setFormulario({ inicial: CURSO_VACIO });
    else if (recado.accion === 'abrir' && recado.detalle) setAbierto(recado.detalle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar(datos: DatosDeCurso): Promise<void> {
    const r = await guardado.ejecutar(negocio, formulario?.id ?? null, datos);
    // Solo se cierra si de verdad guardo. Cerrar y perder lo escrito cuando la
    // base rechazo es la peor combinacion posible.
    if (r !== null) setFormulario(null);
  }

  /**
   * Cada accion de la tabla necesita la ficha COMPLETA, no el renglon.
   *
   * El renglon trae quince campos; editar necesita los dieciseis y guardar con
   * lo que hay en la lista borraria en silencio las notas y el enlace.
   */
  async function hacer(clave: string, curso: CursoEnLista): Promise<void> {
    if (clave === 'ver') {
      setAbierto(curso.id);
      return;
    }
    const completa = await traerFichaDeCurso(curso.id);
    if (!completa) return;
    if (clave === 'editar') {
      setFormulario({ id: completa.id, inicial: fichaAFormularioDeCurso(completa) });
    } else if (clave === 'duplicar') {
      setFormulario({ inicial: comoSeDuplicaElCurso(completa) });
    } else if (clave === 'estado') {
      setAbierto(curso.id);
      setACambiarEstado(true);
    }
  }

  const cargandoLista = lista.estado === 'cargando' && lista.datos === null;
  const enFicha = ficha.datos;
  const trabajandoEnPanel =
    inscripcion.trabajando ||
    cambioDeInscripcion.trabajando ||
    sesion.trabajando ||
    material.trabajando;
  const errorEnPanel =
    inscripcion.error ??
    cambioDeInscripcion.error ??
    sesion.error ??
    bajaDeSesion.error ??
    material.error ??
    bajaDeMaterial.error;

  return (
    <div className="cli srv cur">
      <header className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">Cursos</h2>
          <p className="tt-lema">
            Gestiona los cursos, talleres y formaciones que ofreces
          </p>
        </div>
        {puedeGestionar ? (
          <div className="pz-encabezado__acciones">
            <button
              type="button"
              className="pz-boton"
              onClick={() => setCategoriasAbiertas(true)}
            >
              <Icono nombre="cuadricula" lado={16} /> Categorías
            </button>
            <button
              type="button"
              className="pz-boton pz-boton--principal"
              onClick={() => setFormulario({ inicial: CURSO_VACIO })}
            >
              <Icono nombre="mas" lado={16} /> Nuevo curso
            </button>
          </div>
        ) : null}
      </header>

      {resumen.error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar el resumen de cursos.</p>
          <p className="pz-error__detalle">{resumen.error}</p>
          <button type="button" className="pz-boton" onClick={resumen.recargar}>
            Reintentar
          </button>
        </div>
      ) : null}

      <CifrasDeCursos resumen={resumen.datos} />

      <div className="pz-cuerpo">
        <TablaDeCursos
          cursos={lista.datos?.filas ?? []}
          total={lista.datos?.total ?? 0}
          pagina={pagina}
          porPagina={porPagina}
          busqueda={escrito}
          pestana={pestana}
          categoriaId={categoriaId}
          instructorId={instructorId}
          modalidad={modalidad}
          conLugares={conLugares}
          categorias={categorias.datos ?? []}
          instructores={instructores.datos ?? []}
          filtrosAbiertos={filtrosAbiertos}
          seleccionado={abierto}
          permisos={permisos}
          cargando={cargandoLista}
          error={lista.error}
          onBuscar={setEscrito}
          onPestana={setPestana}
          onCategoria={setCategoriaId}
          onInstructor={setInstructorId}
          onModalidad={setModalidad}
          onConLugares={setConLugares}
          onFiltros={() => setFiltrosAbiertos((a) => !a)}
          onPagina={setPagina}
          onPorPagina={setPorPagina}
          onAccion={(clave, c) => void hacer(clave, c)}
          onNuevo={() => setFormulario({ inicial: CURSO_VACIO })}
          onReintentar={lista.recargar}
        />

        <PanelDelCurso
          ficha={abierto ? enFicha : null}
          cargando={Boolean(abierto) && ficha.estado === 'cargando' && enFicha === null}
          error={abierto ? ficha.error : null}
          permisos={permisos}
          instructores={instructores.datos ?? []}
          clientes={clientesQueCoinciden}
          trabajando={trabajandoEnPanel}
          errorDeOperacion={errorEnPanel}
          onEditar={() => {
            if (enFicha) {
              setFormulario({ id: enFicha.id, inicial: fichaAFormularioDeCurso(enFicha) });
            }
          }}
          onCambiarEstado={() => setACambiarEstado(true)}
          onCerrar={() => setAbierto(null)}
          onBuscarCliente={setBuscandoCliente}
          onInscribir={(clienteId) => {
            if (enFicha) void inscripcion.ejecutar(negocio, enFicha.id, clienteId, 'manual');
          }}
          onCambiarInscripcion={(id, estado) => void cambioDeInscripcion.ejecutar(id, estado)}
          // Dar de alta a alguien nuevo es de CLIENTES: se manda alla con un
          // recado, no se abre aqui un formulario de persona.
          onNuevoCliente={() => ir('clientes', { intencion: 'clientes:nuevo' })}
          onAbrirCliente={(clienteId) =>
            ir('clientes', { intencion: `clientes:abrir:${clienteId}` })
          }
          onGuardarSesion={(id, datos) => {
            if (enFicha) void sesion.ejecutar(enFicha.id, id, datos);
          }}
          onArchivarSesion={(id) => void bajaDeSesion.ejecutar(id)}
          onGuardarMaterial={(id, datos) => {
            if (enFicha) void material.ejecutar(enFicha.id, id, datos);
          }}
          onArchivarMaterial={(id) => void bajaDeMaterial.ejecutar(id)}
        />
      </div>

      {formulario ? (
        <FormularioDeCurso
          // La llave fuerza un formulario limpio al abrirlo con otro curso.
          key={formulario.id ?? 'nuevo'}
          abierto
          titulo={formulario.id ? 'Editar curso' : 'Nuevo curso'}
          inicial={formulario.inicial}
          categorias={categorias.datos ?? []}
          instructores={instructores.datos ?? []}
          trabajando={guardado.trabajando}
          error={guardado.error}
          onGuardar={(d) => void guardar(d)}
          onCerrar={() => setFormulario(null)}
        />
      ) : null}

      <AdministrarCategorias
        abierto={categoriasAbiertas}
        titulo="Categorías de cursos"
        que="curso"
        categorias={categorias.datos ?? []}
        cargando={categorias.estado === 'cargando' && categorias.datos === null}
        trabajando={categoria.trabajando || bajaDeCategoria.trabajando}
        error={categoria.error ?? bajaDeCategoria.error}
        onGuardar={(id, datos) => void categoria.ejecutar(negocio, 'curso', id, datos)}
        onArchivar={(id) => void bajaDeCategoria.ejecutar(id)}
        onCerrar={() => setCategoriasAbiertas(false)}
      />

      {/* La confirmacion espera a que la ficha llegue: sin el numero de
          inscritos, apagar seria una decision a ciegas. */}
      <Confirmacion
        abierto={aCambiarEstado && enFicha !== null}
        titulo={enFicha?.activo ? 'Desactivar curso' : 'Activar curso'}
        confirmar={enFicha?.activo ? 'Desactivar' : 'Activar'}
        destructivo={enFicha?.activo === true}
        onConfirmar={() => {
          if (enFicha) void cambioDeEstado.ejecutar(negocio, enFicha, !enFicha.activo);
          setACambiarEstado(false);
        }}
        onCancelar={() => setACambiarEstado(false)}
      >
        <p>
          {loQuePasaAlApagarElCurso(enFicha)} No se borra nada: las inscripciones, las sesiones y
          los reportes lo siguen encontrando.
        </p>
      </Confirmacion>
    </div>
  );
}
