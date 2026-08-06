/**
 * SERVICIOS — el catálogo.
 *
 * ES LA FUENTE DE VERDAD DE LO QUE OFRECE EL CENTRO. Agenda toma de aqui la
 * duracion y el color de cada cita, Ventas el precio, Reportes el nombre para
 * agrupar. Ninguno guarda una copia: todos preguntan por `servicio_id`.
 *
 * Este archivo SOLO COORDINA: que se pide, que se pinta y que pasa al tocar.
 * Las cifras las cuenta la base, las validaciones viven en
 * `formulario-de-servicio.tsx`, y las reglas duras —aislamiento entre centros,
 * permisos, promocion vigente— en la base de datos.
 *
 * APAGAR NO ES BORRAR, Y ANTES SE DICE A QUIEN AFECTA. Un servicio con citas
 * futuras apagado a ciegas deja esas citas apuntando a algo que ya no se
 * ofrece. El numero de citas futuras es lo que convierte esa decision en
 * informada; por eso la confirmacion espera a que la ficha llegue.
 */

import { tomarIntencion } from '@neron/base/marco';
import { Confirmacion } from '@neron/base/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  archivarCategoria,
  buscarServicioParecido,
  cambiarEstadoDeServicio,
  guardarCategoria,
  guardarServicio,
  llaveDeCategorias,
  llaveDeLaFicha,
  llaveDelResumenDeServicios,
  llaveDeServicios,
  traerCategorias,
  traerFichaDeServicio,
  traerResumenDeServicios,
  traerServiciosDelCentro,
  LO_QUE_TOCA_UN_SERVICIO,
  type Categoria,
  type DatosDeCategoria,
  type DatosDeServicio,
  type FichaDeServicio,
  type FiltrosDeServicios,
  type PaginaDeServicios,
  type ResumenDeServicios,
  type ServicioEnLista,
} from '../datos/servicios.js';
import { useSesion } from '../identidad/sesion.js';
import { Icono } from '../ui/iconos.js';
import { AdministrarCategorias } from '../ui/administrar-categorias.js';
import { CifrasDeServicios } from './cifras-de-servicios.js';
import { DetalleDeServicio } from './detalle.js';
import { FormularioDeServicio, SERVICIO_VACIO } from './formulario-de-servicio.js';
import { TablaDeServicios } from './tabla-de-servicios.js';

/** Cuanto se espera antes de consultar mientras alguien escribe. */
const ESPERA_MS = 300;

/** La ficha del servidor, lista para el formulario. */
export function fichaAFormulario(f: FichaDeServicio): DatosDeServicio {
  return {
    nombre: f.nombre,
    descripcion: f.descripcion ?? '',
    categoriaId: f.categoriaId ?? '',
    duracionMin: f.duracionMin,
    precioCentavos: f.precioCentavos,
    precioPromocionalCentavos: f.precioPromocionalCentavos,
    promocionDesde: f.promocionDesde ?? '',
    promocionHasta: f.promocionHasta ?? '',
    color: f.color ?? '',
    requierePreparacion: f.requierePreparacion,
    preparacion: f.preparacion ?? '',
    notas: f.notas ?? '',
    diasDisponibles: f.diasDisponibles ?? '',
    horaDesde: f.horaDesde ?? '',
    horaHasta: f.horaHasta ?? '',
    activo: f.activo,
  };
}

/**
 * Un duplicado sale con OTRO nombre y APAGADO.
 *
 * Con el mismo nombre, el catalogo queda con dos renglones identicos y la
 * mitad de las citas cuelga de uno y la mitad del otro: ningun reporte por
 * servicio vuelve a cuadrar. Apagado, porque una copia a medio ajustar que ya
 * se ofrece en la agenda se acaba agendando por error.
 */
export function comoSeDuplica(f: FichaDeServicio): DatosDeServicio {
  return { ...fichaAFormulario(f), nombre: `${f.nombre} (copia)`, activo: false };
}

/** Lo que dice la confirmacion de apagar, con el impacto real. */
export function loQuePasaAlApagar(f: FichaDeServicio | null): string {
  if (!f) return '';
  if (!f.activo) {
    return 'Volverá a ofrecerse al agendar y al vender. Las citas que ya existían no cambian.';
  }
  if (f.citasFuturas === 0) {
    return 'Dejará de ofrecerse al agendar y al vender. No tiene ninguna cita agendada por delante.';
  }
  const cuantas =
    f.citasFuturas === 1 ? 'Tiene 1 cita agendada' : `Tiene ${f.citasFuturas} citas agendadas`;
  return `${cuantas} por delante: esas se respetan y se atienden igual. Lo que cambia es que deja de ofrecerse para citas y ventas NUEVAS.`;
}

export function Catalogo() {
  const { acceso } = useSesion();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  const puedeGestionar = permisos['gestionarCatalogo'] === true;

  /* --- Lo que la persona escogio ------------------------------------ */

  const [escrito, setEscrito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);

  const [formulario, setFormulario] = useState<{ inicial: DatosDeServicio; id?: string } | null>(
    null,
  );
  const [abierto, setAbierto] = useState<string | null>(null);
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false);
  const [aCambiarEstado, setACambiarEstado] = useState(false);

  /**
   * El texto se consulta cuando la persona deja de escribir.
   *
   * Sin la espera, "Masaje" son seis consultas de las que cinco no le importan
   * a nadie — y las respuestas pueden llegar desordenadas, dejando la lista
   * mostrando el resultado de lo que se escribio antes.
   */
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(escrito.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [escrito]);

  /**
   * Cualquier filtro nuevo devuelve a la PAGINA UNO.
   *
   * Sin esto, alguien parado en la pagina 3 escribe un nombre, el resultado
   * tiene una sola pagina, y la lista sale vacia — con toda la cara de que ese
   * servicio no existe.
   */
  useEffect(() => setPagina(1), [busqueda, estado, categoriaId, porPagina]);

  const filtros: FiltrosDeServicios = useMemo(
    () => ({ busqueda, estado: estado as FiltrosDeServicios['estado'], categoriaId }),
    [busqueda, estado, categoriaId],
  );

  /* --- Lo que se le pide al servidor -------------------------------- */

  const lista = useConsulta<PaginaDeServicios>(
    negocio ? llaveDeServicios(negocio, filtros, pagina, porPagina) : null,
    () => traerServiciosDelCentro(negocio, filtros, pagina, porPagina),
  );

  const resumen = useConsulta<ResumenDeServicios>(
    negocio ? llaveDelResumenDeServicios(negocio) : null,
    () => traerResumenDeServicios(negocio),
  );

  const categorias = useConsulta<Categoria[]>(
    negocio ? llaveDeCategorias(negocio, 'servicio') : null,
    () => traerCategorias(negocio, 'servicio'),
  );

  const ficha = useConsulta<FichaDeServicio | null>(
    abierto ? llaveDeLaFicha(abierto) : null,
    () => traerFichaDeServicio(abierto!),
  );

  /* --- Lo que cambia datos ------------------------------------------ */

  const guardado = useOperacion(guardarServicio, [...LO_QUE_TOCA_UN_SERVICIO]);
  const cambioDeEstado = useOperacion(cambiarEstadoDeServicio, [...LO_QUE_TOCA_UN_SERVICIO]);
  const categoria = useOperacion(guardarCategoria, [...LO_QUE_TOCA_UN_SERVICIO]);
  const archivo = useOperacion(archivarCategoria, [...LO_QUE_TOCA_UN_SERVICIO]);

  /**
   * EL RECADO DE QUIEN NOS MANDO, que se consume UNA sola vez.
   *
   * El candado del `useRef` es por el modo estricto de React, que monta,
   * desmonta y vuelve a montar en desarrollo: sin el, la intencion se
   * consumiria en el primer montaje y el segundo no encontraria nada.
   */
  const recadoLeido = useRef(false);
  useEffect(() => {
    if (recadoLeido.current) return;
    recadoLeido.current = true;

    const recado = tomarIntencion('servicios');
    if (!recado) return;
    if (recado.accion === 'nuevo') setFormulario({ inicial: SERVICIO_VACIO });
    else if (recado.accion === 'abrir' && recado.detalle) setAbierto(recado.detalle);
    // Las dependencias se dejan fuera a proposito: esto corre UNA vez al
    // llegar. Volver a correrlo reabriria el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar(datos: DatosDeServicio): Promise<void> {
    const r = await guardado.ejecutar(negocio, formulario?.id ?? null, datos);
    // Solo se cierra si de verdad guardo. Cerrar y perder lo escrito cuando la
    // base rechazo es la peor combinacion posible.
    if (r !== null) setFormulario(null);
  }

  /**
   * Cada accion de la tabla necesita la ficha COMPLETA, no el renglon.
   *
   * El renglon de la lista trae seis campos; editar o duplicar necesita los
   * dieciseis. Abrir el formulario con lo que hay en la lista y guardar
   * borraria en silencio las notas, la preparacion y la disponibilidad.
   */
  async function hacer(clave: string, servicio: ServicioEnLista): Promise<void> {
    if (clave === 'ver') {
      setAbierto(servicio.id);
      return;
    }
    const completa = await traerFichaDeServicio(servicio.id);
    if (!completa) return;
    if (clave === 'editar') setFormulario({ id: completa.id, inicial: fichaAFormulario(completa) });
    else if (clave === 'duplicar') setFormulario({ inicial: comoSeDuplica(completa) });
    else if (clave === 'estado') {
      setAbierto(servicio.id);
      setACambiarEstado(true);
    }
  }

  const cargandoLista = lista.estado === 'cargando' && lista.datos === null;
  const enFicha = ficha.datos;

  return (
    <div className="cli srv">
      <header className="cli-encabezado">
        <div className="cli-encabezado__texto">
          <h2 className="cli-encabezado__titulo">Servicios</h2>
          <p className="cli-encabezado__lema">Administra el catálogo de servicios de tu centro</p>
        </div>
        {puedeGestionar ? (
          <div className="srv-encabezado__acciones">
            <button
              type="button"
              className="cli-boton-suave"
              onClick={() => setCategoriasAbiertas(true)}
            >
              <Icono nombre="cuadricula" lado={16} /> Categorías
            </button>
            <button
              type="button"
              className="cli-boton-principal"
              onClick={() => setFormulario({ inicial: SERVICIO_VACIO })}
            >
              <Icono nombre="mas" lado={16} /> Nuevo servicio
            </button>
          </div>
        ) : null}
      </header>

      {resumen.error ? (
        <div className="cli-error" role="alert">
          <p className="cli-error__que">No pudimos cargar el resumen del catálogo.</p>
          <p className="cli-error__detalle">{resumen.error}</p>
          <button type="button" className="cli-boton-suave" onClick={resumen.recargar}>
            Reintentar
          </button>
        </div>
      ) : null}

      <CifrasDeServicios resumen={resumen.datos} />

      <div className="cli-cuerpo">
        <TablaDeServicios
          servicios={lista.datos?.filas ?? []}
          total={lista.datos?.total ?? 0}
          pagina={pagina}
          porPagina={porPagina}
          busqueda={escrito}
          estado={estado}
          categoriaId={categoriaId}
          categorias={categorias.datos ?? []}
          filtrosAbiertos={filtrosAbiertos}
          seleccionado={abierto}
          permisos={permisos}
          cargando={cargandoLista}
          error={lista.error}
          onBuscar={setEscrito}
          onEstado={setEstado}
          onCategoria={setCategoriaId}
          onFiltros={() => setFiltrosAbiertos((a) => !a)}
          onPagina={setPagina}
          onPorPagina={setPorPagina}
          onAccion={(clave, s) => void hacer(clave, s)}
          onNuevo={() => setFormulario({ inicial: SERVICIO_VACIO })}
          onReintentar={lista.recargar}
        />

        <DetalleDeServicio
          ficha={abierto ? enFicha : null}
          cargando={Boolean(abierto) && ficha.estado === 'cargando' && enFicha === null}
          error={abierto ? ficha.error : null}
          permisos={permisos}
          onEditar={() => {
            if (enFicha) setFormulario({ id: enFicha.id, inicial: fichaAFormulario(enFicha) });
          }}
          onCambiarEstado={() => setACambiarEstado(true)}
          onCerrar={() => setAbierto(null)}
        />
      </div>

      {formulario ? (
        <FormularioDeServicio
          // La llave fuerza un formulario limpio al abrirlo con otro servicio.
          key={formulario.id ?? 'nuevo'}
          abierto
          titulo={formulario.id ? 'Editar servicio' : 'Nuevo servicio'}
          inicial={formulario.inicial}
          categorias={categorias.datos ?? []}
          trabajando={guardado.trabajando}
          error={guardado.error}
          onGuardar={(d) => void guardar(d)}
          onBuscarParecido={(nombre) =>
            buscarServicioParecido(negocio, nombre, formulario.id ?? '')
          }
          onCerrar={() => setFormulario(null)}
        />
      ) : null}

      <AdministrarCategorias
        abierto={categoriasAbiertas}
        titulo="Categorías de servicios"
        que="servicio"
        categorias={categorias.datos ?? []}
        cargando={categorias.estado === 'cargando' && categorias.datos === null}
        trabajando={categoria.trabajando || archivo.trabajando}
        error={categoria.error ?? archivo.error}
        onGuardar={(id, datos: DatosDeCategoria) =>
          void categoria.ejecutar(negocio, 'servicio', id, datos)
        }
        onArchivar={(id) => void archivo.ejecutar(id)}
        onCerrar={() => setCategoriasAbiertas(false)}
      />

      {/* La confirmacion espera a que la ficha llegue: sin el numero de citas
          futuras, apagar seria una decision a ciegas. */}
      <Confirmacion
        abierto={aCambiarEstado && enFicha !== null}
        titulo={enFicha?.activo ? 'Desactivar servicio' : 'Activar servicio'}
        confirmar={enFicha?.activo ? 'Desactivar' : 'Activar'}
        destructivo={enFicha?.activo === true}
        onConfirmar={() => {
          if (enFicha) void cambioDeEstado.ejecutar(negocio, enFicha, !enFicha.activo);
          setACambiarEstado(false);
        }}
        onCancelar={() => setACambiarEstado(false)}
      >
        <p>
          {loQuePasaAlApagar(enFicha)} No se borra nada: el historial y los reportes lo siguen
          encontrando.
        </p>
      </Confirmacion>
    </div>
  );
}
