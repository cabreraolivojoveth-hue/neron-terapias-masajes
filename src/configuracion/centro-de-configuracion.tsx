/**
 * CONFIGURACION — el centro, su equipo, su rastro y su plan.
 *
 * ES EL ULTIMO MODULO, Y EL QUE MENOS TABLAS TRAE. Las siete de la base ya
 * existen y son las suyas: aqui se administran, no se duplican. La unica tabla
 * nueva del bloque es `invitacion`, y existe porque `membresia.usuario_id` es
 * `not null` y no se puede dar de alta a quien todavia no tiene cuenta.
 *
 * DE DONDE SALE CADA COSA:
 *   la ficha del centro y los horarios  → `configuracion_del_centro`
 *   el equipo y las invitaciones        → `equipo_del_centro`
 *   los roles y sus permisos            → `roles_del_centro`
 *   el rastro                           → `bitacora_del_centro`
 *   el plan                             → `licencia_del_centro`
 *   las categorias                      → SU tabla, con la pantalla compartida
 *
 * LA REJILLA SE FILTRA POR PERMISO, no se pinta apagada. Una tarjeta gris que
 * no se puede tocar solo sirve para que alguien pregunte que le falta, y la
 * respuesta —"un permiso que no controlas"— no le sirve de nada. Y lo que de
 * verdad decide no es esto: quien escriba la direccion a mano se encuentra con
 * que la base no le entrega nada.
 *
 * EL MODULO ENTERO LO VE CUALQUIER MIEMBRO, y es a proposito. Aqui vive la
 * verificacion en dos pasos y el cambio de contraseña, que son de la CUENTA de
 * cada quien. Pedir `gestionarConfiguracion` para entrar dejaria a media
 * plantilla sin poder cambiar su propia contraseña — y al dueño sin poder dar
 * de alta el segundo factor, que es justo la deuda que este bloque paga.
 */

import { tomarIntencion, useNavegacion } from '@neron/base/marco';
import { Boton, Confirmacion } from '@neron/base/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  archivarCategoria,
  guardarCategoria,
  llaveDeCategorias,
  traerCategorias,
  type AmbitoDeCategoria,
  type Categoria,
  type DatosDeCategoria,
} from '../datos/categorias.js';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  LO_QUE_TOCA_LA_DEMOSTRACION,
  cargarDemostracionCompleta,
  llaveDeLaDemostracion,
  quitarDemostracion,
  traerDemostracion,
  type EstadoDeLaDemostracion,
  type PasoDeLaDemostracion,
} from '../datos/demostracion.js';
import {
  BITACORA_SIN_FILTROS,
  COMO_SE_DICE_LA_LICENCIA,
  CONFIGURACION_VACIA,
  LO_QUE_TOCA_LA_CONFIGURACION,
  VERSION_DEL_SISTEMA,
  cambiarAcceso,
  cambiarRol,
  cancelarInvitacion,
  comoCsvDeExportacion,
  exportarDelCentro,
  guardarConfiguracion,
  guardarMiPerfil,
  guardarRol,
  invitarAlCentro,
  llaveDeLaActividad,
  llaveDeLaBitacora,
  llaveDeLaConfiguracion,
  llaveDeLaLicencia,
  llaveDelEquipo,
  llaveDeLosRoles,
  loQueFaltaDelCentro,
  traerActividadReciente,
  traerBitacora,
  traerConfiguracion,
  traerEquipo,
  traerLicencia,
  traerRoles,
  transferirPropiedad,
  type ActividadReciente,
  type ConfiguracionDelCentro,
  type ConsultaDeLaBitacora,
  type DatosDelCentro,
  type EquipoDelCentro,
  type Exportacion,
  type LicenciaDelCentro,
  type MiembroDelCentro,
  type PaginaDeLaBitacora,
  type RolDelCentro,
} from '../datos/configuracion.js';
import { useSesion } from '../identidad/sesion.js';
import { AdministrarCategorias } from '../ui/administrar-categorias.js';
import { Icono } from '../ui/iconos.js';
import { BitacoraDelCentro, comoSeLee, cuandoOcurrio } from './bitacora-del-centro.js';
import { DatosDeDemostracion } from './datos-de-demostracion.js';
import { DatosDelCentro as FichaDelCentro } from './datos-del-centro.js';
import { EquipoYPermisos } from './equipo-y-permisos.js';
import { LoQueViveEnOtroLado, type SeccionEnlazada } from './lo-que-vive-en-otro-lado.js';
import { MatrizDePermisos } from './matriz-de-permisos.js';
import {
  AyudaYSoporte,
  CambiarContrasena,
  MiPerfil,
  SesionesActivas,
  type ApartadoDeAyuda,
} from './mi-cuenta.js';
import { PlanDelCentro, diasQueFaltan } from './plan-del-centro.js';
import { PreferenciasDelCentro, type PreferenciaEditable } from './preferencias-del-centro.js';
import { RespaldosDelCentro } from './respaldos-del-centro.js';
import {
  GRUPOS_DE_CONFIGURACION,
  seccionPorId,
  seccionesDelGrupo,
} from './secciones-de-configuracion.js';
import { SegundoFactor } from './segundo-factor.js';
import { ZonaDePeligro } from './zona-de-peligro.js';

/** Los catálogos que comparten la tabla de categorías, con su nombre visible. */
const AMBITOS: readonly { readonly clave: AmbitoDeCategoria; readonly etiqueta: string }[] = [
  { clave: 'servicio', etiqueta: 'Servicios' },
  { clave: 'curso', etiqueta: 'Cursos' },
  { clave: 'producto', etiqueta: 'Productos' },
  { clave: 'gasto', etiqueta: 'Gastos' },
  { clave: 'recordatorio', etiqueta: 'Recordatorios' },
  { clave: 'conversacion', etiqueta: 'Conversaciones' },
];

export function CentroDeConfiguracion() {
  const { acceso } = useSesion();
  const { ir, ruta } = useNavegacion();

  const negocio = acceso?.negocioId ?? '';
  const correo = acceso?.correo ?? '';
  const permisos = acceso?.permisos ?? {};
  const soyDuena = acceso?.rol === 'dueno';
  const puedeConfigurar = permisos['gestionarConfiguracion'] === true;
  const puedeUsuarios = permisos['gestionarUsuarios'] === true;
  const puedeAuditar = permisos['verAuditoria'] === true;
  const puedeExportar = permisos['exportarDatos'] === true;

  /* --- Que se esta mirando ----------------------------------------- */

  const [seccion, setSeccion] = useState<string | null>(null);
  /** Con cuál de los tres apartados se abre la ayuda. `null` = cerrada. */
  const [ayuda, setAyuda] = useState<ApartadoDeAyuda | null>(null);
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const [contrasenaAbierta, setContrasenaAbierta] = useState(false);
  const [categorias, setCategorias] = useState<{ ambito: AmbitoDeCategoria; titulo: string } | null>(
    null,
  );

  /** Lo que se está editando de la ficha. `null` = todavía no se ha tocado. */
  const [borrador, setBorrador] = useState<DatosDelCentro | null>(null);
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [consultaBitacora, setConsultaBitacora] =
    useState<ConsultaDeLaBitacora>(BITACORA_SIN_FILTROS);
  const [ultimaExportacion, setUltimaExportacion] = useState<Exportacion | null>(null);
  /**
   * POR DONDE VA LA CARGA DE DEMOSTRACION, y por que vive en el padre.
   *
   * La carga son nueve llamadas seguidas de casi un minuto en total. El aviso
   * de cada paso llega desde `cargarDemostracionCompleta`, que no es un
   * componente: si el progreso viviera dentro de la tarjeta, habria que
   * pasarle una funcion que la propia tarjeta se llama a si misma. Aqui es un
   * estado normal que baja como propiedad.
   */
  const [progresoDemo, setProgresoDemo] = useState<PasoDeLaDemostracion | null>(null);
  /**
   * "Guardado", y solo cuando el servidor de verdad lo acepto.
   *
   * Es la otra mitad de `trabajando`: sin un aviso al terminar, guardar una
   * ficha larga se siente como si no hubiera pasado nada y la gente le da tres
   * veces al boton. Y se pone DESPUES de la respuesta, nunca antes: decir
   * "guardado" y que el servidor lo haya rechazado es la peor mentira que puede
   * contar una pantalla de configuracion.
   */
  const [guardado, setGuardado] = useState(false);
  const [bajando, setBajando] = useState<string | null>(null);
  const [transferido, setTransferido] = useState(false);

  /* --- Lo que se le pide al servidor -------------------------------- */

  const configuracion = useConsulta<ConfiguracionDelCentro>(
    negocio ? llaveDeLaConfiguracion(negocio) : null,
    () => traerConfiguracion(negocio),
  );

  /*
   * EL EQUIPO Y LOS ROLES SOLO SE PIDEN CUANDO HACEN FALTA. Traerlos al abrir
   * la rejilla serian dos viajes al servidor para pintar catorce tarjetas que
   * no los usan — y uno de los dos revienta con un error de permisos para quien
   * no administra usuarios, que es la mayoria del equipo.
   */
  const quiereEquipo = seccion === 'equipo' || seccion === 'avanzada';
  const equipo = useConsulta<EquipoDelCentro>(
    negocio && quiereEquipo && puedeUsuarios ? llaveDelEquipo(negocio) : null,
    () => traerEquipo(negocio),
  );

  const roles = useConsulta<RolDelCentro[]>(
    negocio && (seccion === 'equipo' || seccion === 'avanzada') ? llaveDeLosRoles(negocio) : null,
    () => traerRoles(negocio),
  );

  const licencia = useConsulta<LicenciaDelCentro>(
    negocio ? llaveDeLaLicencia(negocio) : null,
    () => traerLicencia(negocio),
  );

  const actividad = useConsulta<ActividadReciente[]>(
    negocio ? llaveDeLaActividad(negocio) : null,
    () => traerActividadReciente(negocio, 3),
  );

  const bitacora = useConsulta<PaginaDeLaBitacora>(
    negocio && seccion === 'bitacora' && puedeAuditar
      ? llaveDeLaBitacora(negocio, consultaBitacora)
      : null,
    () => traerBitacora(negocio, consultaBitacora),
  );

  const lasCategorias = useConsulta<Categoria[]>(
    negocio && categorias ? llaveDeCategorias(negocio, categorias.ambito) : null,
    () => traerCategorias(negocio, categorias!.ambito),
  );

  /*
   * LA DEMOSTRACION SOLO SE PREGUNTA AL ABRIRLA. Es un viaje al servidor que a
   * casi nadie le importa —la tarjeta ni siquiera existe fuera de la cuenta que
   * enseña el producto— y hacerlo al pintar la rejilla seria pagarlo catorce
   * veces al dia por nada.
   */
  const demostracion = useConsulta<EstadoDeLaDemostracion>(
    negocio && seccion === 'demostracion' ? llaveDeLaDemostracion(negocio) : null,
    () => traerDemostracion(negocio),
  );

  /* --- El recado y la direccion ------------------------------------- */

  /**
   * `?ver=bitacora` LLEGA EN LA DIRECCION, no en un recado.
   *
   * Es la misma distincion que ya estaba resuelta en Recordatorios: un recado
   * se consume una vez y desaparece —correcto para "abre este dialogo"— pero
   * una SECCION tiene que sobrevivir a recargar la pagina y poder mandarse por
   * mensaje. "Mira la bitacora del centro" es un enlace, no un gesto.
   */
  const pedida = ruta.parametros['ver'] ?? '';
  useEffect(() => {
    if (pedida === '') return;
    const s = seccionPorId(pedida);
    if (s) setSeccion(s.id);
  }, [pedida]);

  const recadoLeido = useRef(false);
  useEffect(() => {
    if (recadoLeido.current) return;
    recadoLeido.current = true;
    const recado = tomarIntencion('configuracion');
    if (!recado) return;
    if (recado.accion === 'abrir' && recado.detalle) {
      const s = seccionPorId(recado.detalle);
      if (s) setSeccion(s.id);
    } else if (recado.accion === 'perfil') {
      setPerfilAbierto(true);
    }
  }, []);

  /* --- Las operaciones ---------------------------------------------- */

  const ficha = useOperacion(
    (d: DatosDelCentro) => guardarConfiguracion(negocio, d),
    [...LO_QUE_TOCA_LA_CONFIGURACION],
  );
  const perfil = useOperacion(
    (nombre: string) => guardarMiPerfil(negocio, nombre),
    [...LO_QUE_TOCA_LA_CONFIGURACION],
  );
  const invitacion = useOperacion(
    (correo: string, nombre: string, rol: string) => invitarAlCentro(negocio, correo, nombre, rol),
    [...LO_QUE_TOCA_LA_CONFIGURACION],
  );
  const anulacion = useOperacion(
    (id: string) => cancelarInvitacion(id),
    [...LO_QUE_TOCA_LA_CONFIGURACION],
  );
  const rol = useOperacion(
    (membresia: string, cual: string) => cambiarRol(membresia, cual),
    [...LO_QUE_TOCA_LA_CONFIGURACION],
  );
  const acceso2 = useOperacion(
    (membresia: string, activo: boolean, baja: boolean) =>
      cambiarAcceso(membresia, activo, baja),
    [...LO_QUE_TOCA_LA_CONFIGURACION],
  );
  const permiso = useOperacion(
    (id: string, etiqueta: string, p: Readonly<Record<string, boolean>>, activo: boolean) =>
      guardarRol(negocio, id, etiqueta, p, activo),
    [...LO_QUE_TOCA_LA_CONFIGURACION],
  );
  const traspaso = useOperacion(
    (membresia: string) => transferirPropiedad(negocio, membresia),
    [...LO_QUE_TOCA_LA_CONFIGURACION],
  );
  const categoria = useOperacion(
    (id: string | null, d: DatosDeCategoria) =>
      guardarCategoria(negocio, categorias!.ambito, id, d),
    ['categorias', ...LO_QUE_TOCA_LA_CONFIGURACION],
  );
  const archivo = useOperacion((id: string) => archivarCategoria(id), [
    'categorias',
    ...LO_QUE_TOCA_LA_CONFIGURACION,
  ]);

  /*
   * CARGAR Y QUITAR REFRESCAN EL SISTEMA ENTERO, no solo Configuracion. Una
   * demostracion toca los doce modulos a la vez: sin invalidarlos todos, Inicio
   * enseñaria quinientas citas y la Agenda seguiria vacia en la misma pantalla.
   */
  const siembra = useOperacion(
    (desde: number) => cargarDemostracionCompleta(negocio, setProgresoDemo, desde),
    [...LO_QUE_TOCA_LA_DEMOSTRACION],
  );
  const retiro = useOperacion(() => quitarDemostracion(negocio), [
    ...LO_QUE_TOCA_LA_DEMOSTRACION,
  ]);

  /* --- Lo que se pinta ---------------------------------------------- */

  const puesta = configuracion.datos ?? CONFIGURACION_VACIA;
  const datos = borrador ?? puesta.datos;
  const loQueFalta = loQueFaltaDelCentro(datos);
  const laSeccion = seccion ? seccionPorId(seccion) : null;

  /**
   * LOS DIAS QUE FALTAN SE CALCULAN AQUI Y NO AL PINTAR.
   *
   * Leer el reloj dentro de un componente lo vuelve impredecible: la misma
   * pantalla da un numero distinto en cada repintado, y una prueba que la mire
   * dos veces ve dos cosas. Se calcula una vez por licencia.
   */
  const dias = useMemo(
    () => diasQueFaltan(licencia.datos?.expiraEn ?? null),
    [licencia.datos?.expiraEn],
  );

  function abrir(id: string): void {
    setSeccion(id);
    setMostrarErrores(false);
    setGuardado(false);
    ficha.limpiarError();
  }

  function volver(): void {
    setSeccion(null);
    setBorrador(null);
    setMostrarErrores(false);
  }

  function guardarFicha(): void {
    setMostrarErrores(true);
    if (Object.keys(loQueFaltaDelCentro(datos)).length > 0) return;
    setGuardado(false);
    void ficha.ejecutar(datos).then((r) => {
      // El borrador se suelta SOLO si de verdad se guardo: al fallar, lo
      // escrito tiene que seguir en pantalla o se pierde el trabajo.
      if (r) {
        setBorrador(null);
        setGuardado(true);
      }
    });
  }

  async function exportar(que: string): Promise<void> {
    setBajando(que);
    try {
      const salida = await exportarDelCentro(negocio, que);
      setUltimaExportacion(salida);
      if (salida.filas.length === 0) return;
      /*
       * LA MARCA DE ORDEN AL PRINCIPIO NO SOBRA: sin ella, Excel abre el
       * archivo en su codificacion vieja y los acentos salen rotos. Es el mismo
       * detalle que ya se pago al exportar Recordatorios.
       */
      const csv = comoCsvDeExportacion(salida.filas);
      const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${que}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (fallo) {
      setUltimaExportacion(null);
      throw fallo;
    } finally {
      setBajando(null);
    }
  }

  /* --- Lo que puede recibir el centro ------------------------------- */

  const candidatos = (equipo.datos?.miembros ?? []).filter(
    (m) => !m.soyYo && m.activo && !m.eliminado,
  );

  return (
    <div className="cfg mv-pantalla">
      <header className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">
            <span className="cfg-titulo__icono" aria-hidden="true">
              <Icono nombre="engrane" lado={22} />
            </span>
            Configuración
          </h2>
          <p className="tt-lema">Administra y personaliza tu centro</p>
        </div>
        <div className="pz-encabezado__acciones">
          <button
            type="button"
            className="pz-boton"
            onClick={() => setAyuda('ayuda')}
          >
            <Icono nombre="soporte" lado={16} /> Ayuda y soporte
          </button>
        </div>
      </header>

      {laSeccion === null ? (
        <div className="pz-cuerpo cfg-cuerpo">
          <div className="cfg-principal mv-cambia">
            {GRUPOS_DE_CONFIGURACION.map((g) => {
              const suyas = seccionesDelGrupo(g.id, permisos, correo);
              /* UN GRUPO SIN TARJETAS DESAPARECE. Dejarlo con su titulo y
                 vacio hace que quien lo mira crea que el sistema se rompio —
                 es la misma regla del menu lateral. */
              if (suyas.length === 0) return null;
              return (
                <section key={g.id} className="pz-tarjeta cfg-grupo">
                  <h3 className="tt-tarjeta">{g.etiqueta}</h3>
                  <div className="cfg-rejilla mv-escalonado">
                    {suyas.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="cfg-tarjeta mv-levanta"
                        onClick={() => abrir(s.id)}
                      >
                        <span className={`cfg-icono cfg-icono--${s.tono}`} aria-hidden="true">
                          <Icono nombre={s.icono} lado={20} />
                        </span>
                        <span className="cfg-tarjeta__texto">
                          <span className="cfg-tarjeta__titulo">{s.titulo}</span>
                          <span className="cfg-tarjeta__pie">{s.descripcion}</span>
                        </span>
                        <span className="cfg-tarjeta__flecha" aria-hidden="true">
                          <Icono nombre="flecha" lado={16} />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="cfg-costado">
            <section className="pz-tarjeta">
              <h3 className="tt-tarjeta">Información del sistema</h3>
              <dl className="pz-datos">
                <div className="pz-dato pz-dato--renglon">
                  <dt className="tt-etiqueta">Versión del sistema</dt>
                  <dd className="pz-dato__valor">
                    <span className="pz-pastilla pz-pastilla--marca">v{VERSION_DEL_SISTEMA}</span>
                  </dd>
                </div>
                <div className="pz-dato pz-dato--renglon">
                  <dt className="tt-etiqueta">Plan actual</dt>
                  <dd className="pz-dato__valor">
                    {/* SIN PLAN ADMINISTRADO SE DICE ESO, no un plan inventado.
                        La captura de referencia enseña "Profesional"; ese texto
                        es del diseño y no de este centro. */}
                    {licencia.datos?.plan ?? 'Sin plan administrado'}
                  </dd>
                </div>
                <div className="pz-dato pz-dato--renglon">
                  <dt className="tt-etiqueta">Estado de la licencia</dt>
                  <dd className="pz-dato__valor">
                    <span
                      className={`pz-pastilla pz-pastilla--${
                        licencia.datos?.permiteGuardar === false ? 'peligro' : 'exito'
                      }`}
                    >
                      {/* SE TRADUCE, no se pinta el valor crudo de la base.
                          "activa" en minuscula es como se guarda; "Activa" es
                          como se lee. Lo cacho la captura al lado del diseño,
                          que es justo para lo que existe mirarla. */}
                      {licencia.datos?.administrada
                        ? (COMO_SE_DICE_LA_LICENCIA[licencia.datos.estado ?? ''] ??
                           licencia.datos.estado ??
                           'Sin estado')
                        : 'Sin licencia'}
                    </span>
                  </dd>
                </div>
                <div className="pz-dato pz-dato--renglon">
                  <dt className="tt-etiqueta">Próxima renovación</dt>
                  <dd className="pz-dato__valor">
                    {dias === null ? 'Sin vencimiento' : `${dias} días`}
                  </dd>
                </div>
              </dl>
              {permisos['verFacturacion'] === true ? (
                <Boton tono="contorno" completo onClick={() => abrir('plan')}>
                  Ver detalles de mi plan
                </Boton>
              ) : null}
            </section>

            <section className="pz-tarjeta">
              <h3 className="tt-tarjeta">Accesos rápidos</h3>
              {/*
                LOS CINCO DEL DISEÑO, PERO TODOS LLEVAN A ALGO QUE EXISTE.
                La captura pone "Centro de ayuda", "Soporte técnico" y
                "Novedades del sistema" como tres sitios distintos; no hay
                ninguno de los tres, y tres botones que abren la misma
                explicación son tres promesas rotas en vez de una. Se quedan
                las cosas que de verdad se pueden hacer desde aquí.
              */}
              <ul className="cfg-rapidos">
                <li>
                  <button type="button" className="cfg-rapido" onClick={() => setPerfilAbierto(true)}>
                    <Icono nombre="persona" lado={16} /> Mi perfil
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="cfg-rapido"
                    onClick={() => setContrasenaAbierta(true)}
                  >
                    <Icono nombre="escudo" lado={16} /> Cambiar contraseña
                  </button>
                </li>
                {/*
                  LOS TRES DE AYUDA DEL DISEÑO, y los tres llevan a algo.
                  "Centro de ayuda", "Soporte técnico" y "Novedades del sistema"
                  no son tres destinos distintos —los tres acaban en la misma
                  persona— así que abren el mismo panel en su apartado. Lo que
                  NO se hace es inventarles un teléfono ni una lista de
                  novedades escrita a mano que se quede vieja.
                */}
                <li>
                  <button type="button" className="cfg-rapido" onClick={() => setAyuda('ayuda')}>
                    <Icono nombre="soporte" lado={16} /> Centro de ayuda
                  </button>
                </li>
                <li>
                  <button type="button" className="cfg-rapido" onClick={() => setAyuda('soporte')}>
                    <Icono nombre="mensaje" lado={16} /> Soporte técnico
                  </button>
                </li>
                <li>
                  <button type="button" className="cfg-rapido" onClick={() => setAyuda('novedades')}>
                    <Icono nombre="estrella" lado={16} /> Novedades del sistema
                  </button>
                </li>
              </ul>
            </section>

            <section className="pz-tarjeta">
              <h3 className="tt-tarjeta">Actividad reciente</h3>
              {actividad.estado === 'cargando' && actividad.datos === null ? (
                <div className="pz-cargando" aria-busy="true">
                  <span className="neron-solo-lectores">Cargando la actividad reciente</span>
                  <div className="pz-silueta" />
                </div>
              ) : (actividad.datos ?? []).length === 0 ? (
                <p className="pz-vacio__texto">
                  {/* DOS RAZONES DISTINTAS PARA UN MISMO VACIO, y se separan:
                      sin `verAuditoria` la base no entrega nada, y eso no es
                      lo mismo que un centro donde todavia no ha pasado nada. */}
                  {puedeAuditar
                    ? 'Todavía no hay nada anotado. Aquí va apareciendo lo que se guarda, se cobra y se cancela.'
                    : 'Ver la actividad del centro necesita el permiso de auditoría.'}
                </p>
              ) : (
                <ul className="cfg-actividad">
                  {(actividad.datos ?? []).map((a) => (
                    <li key={a.id} className="cfg-actividad__renglon">
                      <span className="cfg-icono cfg-icono--citas" aria-hidden="true">
                        <Icono nombre="reloj" lado={16} />
                      </span>
                      <span className="cfg-actividad__texto">
                        <span className="cfg-actividad__que">
                          {comoSeLee({
                            id: a.id,
                            ocurridoEn: a.ocurridoEn,
                            usuarioId: null,
                            usuario: a.usuario,
                            rol: '',
                            modulo: a.modulo,
                            accion: a.accion,
                            detalle: null,
                            entidad: a.entidad,
                            antes: null,
                            despues: null,
                            motivo: null,
                          })}
                        </span>
                        <span className="cfg-actividad__cuando">{cuandoOcurrio(a.ocurridoEn)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {puedeAuditar ? (
                <button type="button" className="pz-enlace" onClick={() => abrir('bitacora')}>
                  Ver toda la actividad <Icono nombre="flecha" lado={14} />
                </button>
              ) : null}
            </section>
          </aside>
        </div>
      ) : (
        <div className="pz-cuerpo cfg-cuerpo cfg-cuerpo--seccion">
          <div className="cfg-principal mv-cambia" key={laSeccion.id}>
            <div className="cfg-volver">
              <button type="button" className="pz-boton" onClick={volver}>
                <Icono nombre="volver" lado={16} /> Volver a Configuración
              </button>
              <h3 className="tt-pagina cfg-seccion__titulo">{laSeccion.titulo}</h3>
              <p className="tt-secundario">{laSeccion.descripcion}</p>
            </div>

            {guardado ? (
              <p className="cfg-guardado" role="status">
                <Icono nombre="palomita" lado={16} /> Guardado. El cambio ya aplica en todo el
                sistema.
              </p>
            ) : null}

            {laSeccion.id === 'centro' ? (
              <FichaDelCentro
                datos={datos}
                loQueFalta={loQueFalta}
                mostrarErrores={mostrarErrores}
                trabajando={ficha.trabajando}
                error={ficha.error}
                puedeGuardar={puedeConfigurar}
                onCambiar={setBorrador}
                onGuardar={guardarFicha}
              />
            ) : null}

            {laSeccion.id === 'dinero' ||
            laSeccion.id === 'pagos' ||
            laSeccion.id === 'facturacion' ||
            laSeccion.id === 'apariencia' ? (
              <PreferenciasDelCentro
                cual={laSeccion.id as PreferenciaEditable}
                datos={datos}
                loQueFalta={loQueFalta}
                mostrarErrores={mostrarErrores}
                trabajando={ficha.trabajando}
                error={ficha.error}
                puedeGuardar={puedeConfigurar}
                onCambiar={setBorrador}
                onGuardar={guardarFicha}
              />
            ) : null}

            {laSeccion.id === 'equipo' ? (
              <>
                <EquipoYPermisos
                  equipo={equipo.datos}
                  roles={roles.datos ?? []}
                  cargando={equipo.estado === 'cargando' && equipo.datos === null}
                  error={equipo.error}
                  trabajando={
                    invitacion.trabajando ||
                    rol.trabajando ||
                    acceso2.trabajando ||
                    anulacion.trabajando
                  }
                  errorAlGuardar={
                    invitacion.error ?? rol.error ?? acceso2.error ?? anulacion.error
                  }
                  soyDuena={soyDuena}
                  onInvitar={(correo, nombre, cual) =>
                    void invitacion.ejecutar(correo, nombre, cual)
                  }
                  onCambiarRol={(m, cual) => void rol.ejecutar(m.id, cual)}
                  onCambiarAcceso={(m, activo) => void acceso2.ejecutar(m.id, activo, false)}
                  onDarDeBaja={(m) => void acceso2.ejecutar(m.id, false, true)}
                  onCancelarInvitacion={(i) => void anulacion.ejecutar(i.id)}
                  onReintentar={equipo.recargar}
                />
                <section className="pz-tarjeta">
                  <h3 className="tt-tarjeta">Qué puede cada rol</h3>
                  <MatrizDePermisos
                    roles={roles.datos ?? []}
                    cargando={roles.estado === 'cargando' && roles.datos === null}
                    puedeEditar={puedeUsuarios}
                    trabajando={permiso.trabajando}
                    error={roles.error ?? permiso.error}
                    onGuardar={(id, etiqueta, p, activo) =>
                      void permiso.ejecutar(id, etiqueta, p, activo)
                    }
                    onReintentar={roles.recargar}
                  />
                </section>
              </>
            ) : null}

            {laSeccion.id === 'seguridad' ? (
              <>
                <section className="pz-tarjeta">
                  <h3 className="tt-tarjeta">Verificación en dos pasos</h3>
                  <SegundoFactor />
                </section>
                <section className="pz-tarjeta">
                  <h3 className="tt-tarjeta">Mi contraseña</h3>
                  <p className="tt-secundario">
                    La cambia el proveedor de identidad: este sistema no guarda ninguna contraseña.
                  </p>
                  <Boton tono="contorno" onClick={() => setContrasenaAbierta(true)}>
                    Cambiar mi contraseña
                  </Boton>
                </section>
                <section className="pz-tarjeta">
                  <h3 className="tt-tarjeta">Sesiones activas</h3>
                  <SesionesActivas />
                </section>
              </>
            ) : null}

            {laSeccion.id === 'respaldos' ? (
              <RespaldosDelCentro
                puedeExportar={puedeExportar}
                puedeRestaurar={permisos['restaurarRespaldo'] === true}
                trabajando={bajando}
                ultima={ultimaExportacion}
                error={null}
                onExportar={(que) => void exportar(que)}
              />
            ) : null}

            {laSeccion.id === 'demostracion' ? (
              <DatosDeDemostracion
                correo={correo}
                estado={demostracion.datos}
                cargando={demostracion.estado === 'cargando' && demostracion.datos === null}
                error={demostracion.error ?? siembra.error ?? retiro.error}
                progreso={progresoDemo}
                trabajando={
                  siembra.trabajando ? 'cargando' : retiro.trabajando ? 'quitando' : null
                }
                onCargar={() => {
                  /*
                   * SE SIGUE DESDE DONDE SE QUEDO, y el numero lo da la base.
                   * Empezar siempre en el uno volveria a sembrar los meses que
                   * ya entraron: cada paso es su propia transaccion, asi que lo
                   * que esta, esta completo.
                   */
                  setProgresoDemo(null);
                  void siembra
                    .ejecutar((demostracion.datos?.ultimoPaso ?? 0) + 1)
                    .then(() => demostracion.recargar());
                }}
                onQuitar={() => {
                  void retiro.ejecutar().then(() => {
                    // El progreso se tira: con la demostracion fuera, una lista
                    // de nueve pasos en verde diria que sigue cargada.
                    setProgresoDemo(null);
                    demostracion.recargar();
                  });
                }}
                onReintentar={demostracion.recargar}
              />
            ) : null}

            {laSeccion.id === 'plan' ? (
              <PlanDelCentro
                licencia={licencia.datos}
                cargando={licencia.estado === 'cargando' && licencia.datos === null}
                dias={dias}
              />
            ) : null}

            {laSeccion.id === 'bitacora' ? (
              <BitacoraDelCentro
                pagina={bitacora.datos}
                consulta={consultaBitacora}
                cargando={bitacora.estado === 'cargando' && bitacora.datos === null}
                error={bitacora.error}
                puedeVerla={puedeAuditar}
                onConsulta={setConsultaBitacora}
                onReintentar={bitacora.recargar}
              />
            ) : null}

            {laSeccion.id === 'avanzada' ? (
              <>
                <section className="pz-tarjeta">
                  <h3 className="tt-tarjeta">Límites y tamaño</h3>
                  <dl className="pz-datos">
                    <div className="pz-dato pz-dato--renglon">
                      <dt className="tt-etiqueta">Gente con acceso</dt>
                      <dd className="pz-dato__valor">{puesta.miembros}</dd>
                    </div>
                    <div className="pz-dato pz-dato--renglon">
                      <dt className="tt-etiqueta">Tope al exportar</dt>
                      <dd className="pz-dato__valor">5000 renglones por archivo</dd>
                    </div>
                  </dl>
                  <p className="tt-secundario">
                    No hay límite de pacientes, citas ni ventas: el sistema guarda todo y nada se
                    borra. El único tope es el de exportar, y está para que la pestaña no se congele
                    con tres años de historia.
                  </p>
                </section>

                <ZonaDePeligro
                  nombreDelCentro={puesta.datos.nombre}
                  candidatos={candidatos}
                  soyDuena={soyDuena}
                  puedeEntrar={permisos['zonaDePeligro'] === true}
                  trabajando={traspaso.trabajando}
                  error={traspaso.error}
                  onTransferir={(m) => {
                    void traspaso.ejecutar(m).then((r) => {
                      if (r !== null) setTransferido(true);
                    });
                  }}
                />
              </>
            ) : null}

            {laSeccion.id === 'notificaciones' ||
            laSeccion.id === 'plantillas' ||
            laSeccion.id === 'categorias' ||
            laSeccion.id === 'campos' ||
            laSeccion.id === 'integraciones' ? (
              <LoQueViveEnOtroLado
                cual={laSeccion.id as SeccionEnlazada}
                ambitos={AMBITOS.map((a) => ({ clave: a.clave, etiqueta: a.etiqueta }))}
                onIr={(modulo, intencion) =>
                  ir(modulo, intencion ? { intencion } : {})
                }
                onCategorias={(ambito, titulo) =>
                  setCategorias({ ambito: ambito as AmbitoDeCategoria, titulo })
                }
              />
            ) : null}
          </div>
        </div>
      )}

      <MiPerfil
        abierto={perfilAbierto}
        nombre={acceso?.nombre ?? ''}
        correo={acceso?.correo ?? ''}
        rol={acceso?.rolEtiqueta ?? ''}
        trabajando={perfil.trabajando}
        error={perfil.error}
        onGuardar={(nombre) => {
          void perfil.ejecutar(nombre).then((r) => {
            if (r !== null) setPerfilAbierto(false);
          });
        }}
        onCerrar={() => setPerfilAbierto(false)}
      />

      <CambiarContrasena
        abierto={contrasenaAbierta}
        onCerrar={() => setContrasenaAbierta(false)}
      />

      <AyudaYSoporte
        /* LA LLAVE FUERZA UN PANEL LIMPIO. Sin ella, el apartado escogido se
           queda pegado al primero con el que se abrio: el estado interno solo
           se inicializa en el primer montaje, y este componente vive montado
           todo el tiempo aunque no se vea. Se abre por "Soporte técnico" y
           enseña "Centro de ayuda", sin fallar y sin avisar. */
        key={ayuda ?? 'cerrada'}
        abierto={ayuda !== null}
        apartado={ayuda ?? 'ayuda'}
        version={VERSION_DEL_SISTEMA}
        centro={puesta.datos.nombre}
        onVerBitacora={() => {
          setAyuda(null);
          abrir('bitacora');
        }}
        onCerrar={() => setAyuda(null)}
      />

      <AdministrarCategorias
        abierto={categorias !== null}
        titulo={categorias?.titulo ?? ''}
        que={categorias?.ambito ?? ''}
        categorias={lasCategorias.datos ?? []}
        cargando={lasCategorias.estado === 'cargando' && lasCategorias.datos === null}
        trabajando={categoria.trabajando || archivo.trabajando}
        error={categoria.error ?? archivo.error}
        onGuardar={(id, d) => void categoria.ejecutar(id, d)}
        onArchivar={(id) => void archivo.ejecutar(id)}
        onCerrar={() => setCategorias(null)}
      />

      {/*
        DESPUES DE TRANSFERIR HAY QUE VOLVER A LEER LA SESION, y por eso se
        avisa en vez de dejar la pantalla como estaba: quien acaba de regalar el
        centro ya no es dueño, pero su navegador todavía cree que sí hasta que
        el portero vuelva a preguntar. Sin este aviso, los botones siguen ahí y
        fallan uno por uno con errores de permiso.
      */}
      <Confirmacion
        abierto={transferido}
        titulo="El centro ya es de otra persona"
        confirmar="Recargar"
        onConfirmar={() => window.location.reload()}
        onCancelar={() => setTransferido(false)}
      >
        <p className="tt-secundario">
          Tú te quedaste como administrador. Hay que recargar para que el sistema vuelva a leer qué
          puedes hacer ahora: hasta entonces, algunos botones van a fallar.
        </p>
      </Confirmacion>
    </div>
  );
}
