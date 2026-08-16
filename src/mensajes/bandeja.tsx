/**
 * MENSAJES — el centro de comunicación con los clientes.
 *
 * NO ES UNA SEGUNDA BASE DE DATOS DEL SISTEMA, y eso decide todo lo demás. Aquí
 * no vive el nombre de nadie, ni su teléfono, ni su adeudo, ni la fecha de su
 * cita: vive `clienteId`, y el resto se resuelve leyendo Clientes, Agenda y
 * Ventas. Copiar esas cifras sería como empiezan los números que no cuadran
 * entre dos pantallas — y aquí serían números sobre dinero y sobre salud.
 *
 * GUARDAR Y ENVIAR SON DOS COSAS DISTINTAS. Escribir aquí guarda el mensaje en
 * el historial del cliente y lo deja en «Sin enviar». Que le llegue depende de
 * un canal conectado de verdad, y eso necesita un servidor que este producto
 * todavía no tiene. La pantalla lo dice con todas sus letras en vez de pintar
 * una palomita: dar por avisado a alguien que nunca supo nada es peor que no
 * haber escrito.
 *
 * LAS TRES COLUMNAS SON UNA SOLA CONSULTA POR COSA. La lista se pagina, el hilo
 * se pide hacia atrás y el resumen sale aparte: bajar todos los mensajes del
 * centro para enseñar ocho conversaciones es lento hoy e imposible en dos años.
 */

import { tomarIntencion, useNavegacion } from '@neron/base/marco';
import { hoy as hoyDe, type Fecha } from '@neron/base/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  llaveDeCategorias,
  traerCategorias,
  type Categoria as EtiquetaDelCentro,
} from '../datos/categorias.js';
import {
  DATOS_VACIOS,
  buscarPosibleDuplicado,
  crearCliente,
  llaveDeClientes,
  llaveDelExpediente,
  traerClientes,
  traerExpediente,
  type ClienteEnLista,
  type ExpedienteDeCliente,
  type PaginaDeClientes,
} from '../datos/clientes.js';
import { traerProfesionales, type ProfesionalBreve } from '../datos/citas.js';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  LO_QUE_TOCA_UN_MENSAJE,
  abrirConversacion,
  asignarConversacion,
  borrarPlantilla,
  etiquetarConversacion,
  guardarAutomatizacion,
  guardarCanal,
  guardarMensaje,
  guardarPlantilla,
  ligarClienteAConversacion,
  llaveDeAutomatizaciones,
  llaveDeCanales,
  llaveDeConversaciones,
  llaveDelHilo,
  llaveDePlantillas,
  llaveDelResumenDeMensajes,
  marcarConversacion,
  registrarDifusion,
  traerAutomatizaciones,
  traerCanales,
  traerConversaciones,
  traerHilo,
  traerPlantillas,
  traerResumenDeMensajes,
  type Bandeja,
  type ConversacionEnLista,
  type MensajeDelHilo,
  type PaginaDeConversaciones,
  type PlantillaDeMensaje,
  type CanalDeMensajes,
  type AutomatizacionDeMensajes,
  type ResumenDeMensajes,
} from '../datos/mensajes.js';
import { FICHA_VACIA, FichaDeCliente } from '../clientes/ficha.js';
import { useSesion } from '../identidad/sesion.js';
import { AdministrarCategorias } from '../ui/administrar-categorias.js';
import { Modal } from '../ui/modal.js';
import { Icono } from '../ui/iconos.js';
import { NOMBRE_DEL_PRODUCTO } from '../marca.js';
import { periodosDelCentro } from '../reportes/periodo-del-reporte.js';
import { AdministrarAutomatizaciones } from './automatizaciones.js';
import { AdministrarCanales } from './canales.js';
import { CifrasDeMensajes } from './cifras-de-mensajes.js';
import { EnviarDifusion } from './difusion.js';
import { Hilo } from './hilo.js';
import { ListaDeConversaciones } from './lista-de-conversaciones.js';
import { NuevoMensaje } from './nuevo-mensaje.js';
import { PanelDelContacto } from './panel-del-contacto.js';
import { AdministrarPlantillas, type DatosDePlantilla } from './plantillas.js';

/** Cuánto se espera antes de consultar mientras alguien escribe. */
const ESPERA_MS = 300;

/** Cuántas conversaciones se traen de golpe, y de cuántas en cuántas crece. */
const POR_TANDA = 12;

/** Cuántos mensajes del hilo se piden cada vez. */
const MENSAJES_POR_TANDA = 30;

/** Qué modal está abierto. Uno solo a la vez: dos velos encimados no se leen. */
type Ventana =
  | null | 'nuevo' | 'plantillas' | 'etiquetas' | 'canales' | 'automatizaciones'
  | 'difusion' | 'cliente' | 'ligar';

export function Bandeja() {
  const { acceso } = useSesion();
  const { ir } = useNavegacion();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  const puedeEscribir = permisos['gestionarMensajes'] === true;
  const puedeVerFinanzas = permisos['verFinanzas'] === true;
  const puedeCrearCliente = permisos['gestionarClientes'] === true;

  const [hoy] = useState<Fecha>(() => hoyDe());
  // El resumen mira el mes en curso, que es el periodo del diseño. Se congela
  // al entrar: recalcularlo en cada render movería el periodo a medianoche.
  const periodo = useMemo(() => {
    const mes = periodosDelCentro(hoy).find((p) => p.clave === 'esteMes');
    return { desde: mes?.desde ?? hoy, hasta: mes?.hasta ?? hoy };
  }, [hoy]);

  const [bandeja, setBandeja] = useState<Bandeja>('todas');
  const [escrito, setEscrito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [cuantas, setCuantas] = useState(POR_TANDA);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [ventana, setVentana] = useState<Ventana>(null);
  const [escritoCliente, setEscritoCliente] = useState('');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [desdeCuando, setDesdeCuando] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<readonly MensajeDelHilo[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(escrito.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [escrito]);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaCliente(escritoCliente.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [escritoCliente]);

  // Al cambiar de bandeja o de filtro se vuelve al principio: quedarse en la
  // tanda cuarenta de otra búsqueda enseña una lista vacía sin decir por qué.
  useEffect(() => setCuantas(POR_TANDA), [bandeja, busqueda, etiqueta]);

  /* --- Lo que se le pide al servidor -------------------------------- */

  const hilos = useConsulta<PaginaDeConversaciones>(
    negocio ? llaveDeConversaciones(negocio, bandeja, busqueda, etiqueta, cuantas) : null,
    () => traerConversaciones(negocio, bandeja, busqueda, etiqueta, 1, cuantas),
  );

  const resumen = useConsulta<ResumenDeMensajes>(
    negocio ? llaveDelResumenDeMensajes(negocio, periodo.desde, periodo.hasta) : null,
    () => traerResumenDeMensajes(negocio, periodo.desde, periodo.hasta),
  );

  // LAS ETIQUETAS SON CATEGORIAS DEL CENTRO, del ámbito "conversacion". No hay
  // una tabla de etiquetas de mensajes: sería el mismo concepto con dos nombres.
  const etiquetas = useConsulta<EtiquetaDelCentro[]>(
    negocio ? llaveDeCategorias(negocio, 'conversacion') : null,
    () => traerCategorias(negocio, 'conversacion'),
  );

  const plantillas = useConsulta<PlantillaDeMensaje[]>(
    negocio ? llaveDePlantillas(negocio) : null,
    () => traerPlantillas(negocio),
  );

  const canales = useConsulta<CanalDeMensajes[]>(
    negocio ? llaveDeCanales(negocio) : null,
    () => traerCanales(negocio),
  );

  const automatizaciones = useConsulta<AutomatizacionDeMensajes[]>(
    negocio && ventana === 'automatizaciones' ? llaveDeAutomatizaciones(negocio) : null,
    () => traerAutomatizaciones(negocio),
  );

  const conversacion = (hilos.datos?.filas ?? []).find((c) => c.id === abierta) ?? null;

  const expediente = useConsulta<ExpedienteDeCliente | null>(
    conversacion?.clienteId ? llaveDelExpediente(conversacion.clienteId) : null,
    () => traerExpediente(conversacion?.clienteId ?? '', hoy),
  );

  const clientes = useConsulta<PaginaDeClientes>(
    negocio && (ventana === 'nuevo' || ventana === 'difusion' || ventana === 'ligar')
      ? llaveDeClientes(negocio, { busqueda: busquedaCliente }, 1, 50)
      : null,
    () => traerClientes(negocio, { busqueda: busquedaCliente }, 1, 50),
  );

  const gente = useConsulta<ProfesionalBreve[]>(
    negocio ? `profesionales:${negocio}` : null,
    () => traerProfesionales(negocio),
  );

  /* --- El hilo abierto ---------------------------------------------- */

  /**
   * EL HILO SE PIDE APARTE DE LA LISTA, y se guarda en estado en vez de en la
   * cache: "ver mensajes anteriores" añade al principio de lo que ya hay, y una
   * consulta cacheada por llave devolvería solo la última tanda.
   */
  useEffect(() => {
    if (!abierta) {
      setMensajes([]);
      return;
    }
    let vivo = true;
    void traerHilo(abierta, null, MENSAJES_POR_TANDA).then((ms) => {
      if (vivo) setMensajes(ms);
    }).catch(() => undefined);
    return () => { vivo = false; };
  }, [abierta]);

  /* --- El recado de quien nos mandó --------------------------------- */

  const recadoLeido = useRef(false);
  useEffect(() => {
    if (recadoLeido.current) return;
    recadoLeido.current = true;
    const recado = tomarIntencion('mensajes');
    if (recado?.accion === 'nuevo') setVentana('nuevo');
    else if (recado?.accion === 'abrir' && recado.detalle) setAbierta(recado.detalle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Lo que cambia datos ------------------------------------------ */

  const envio = useOperacion(
    (conversacionId: string, cuerpo: string) =>
      guardarMensaje(negocio, conversacionId, 'saliente', cuerpo),
    [...LO_QUE_TOCA_UN_MENSAJE],
  );
  const accion = useOperacion(
    (id: string, que: string) => marcarConversacion(id, que),
    [...LO_QUE_TOCA_UN_MENSAJE],
  );
  const etiquetado = useOperacion(
    (id: string, ids: readonly string[]) => etiquetarConversacion(negocio, id, ids),
    [...LO_QUE_TOCA_UN_MENSAJE],
  );
  const asignacion = useOperacion(
    (id: string, membresia: string | null) => asignarConversacion(id, membresia),
    [...LO_QUE_TOCA_UN_MENSAJE],
  );
  const ligado = useOperacion(
    (id: string, clienteId: string) => ligarClienteAConversacion(id, clienteId),
    [...LO_QUE_TOCA_UN_MENSAJE],
  );
  const alta = useOperacion(crearCliente, [...LO_QUE_TOCA_UN_MENSAJE]);
  const plantilla = useOperacion(
    (id: string | null, d: DatosDePlantilla) => guardarPlantilla(negocio, id, d),
    [...LO_QUE_TOCA_UN_MENSAJE],
  );
  const bajaDePlantilla = useOperacion(borrarPlantilla, [...LO_QUE_TOCA_UN_MENSAJE]);
  const canal = useOperacion(
    (id: string | null, d: { tipo: 'whatsapp' | 'sms' | 'correo' | 'manual'; nombre: string; identificador: string; activo: boolean }) =>
      guardarCanal(negocio, id, d),
    [...LO_QUE_TOCA_UN_MENSAJE],
  );
  const automatizacion = useOperacion(
    (id: string | null, d: Parameters<typeof guardarAutomatizacion>[2]) =>
      guardarAutomatizacion(negocio, id, d),
    [...LO_QUE_TOCA_UN_MENSAJE],
  );
  const difusion = useOperacion(
    (nombre: string, cuerpo: string, canalId: string | null, ids: readonly string[]) =>
      registrarDifusion(negocio, nombre, cuerpo, canalId, ids),
    [...LO_QUE_TOCA_UN_MENSAJE],
  );
  const apertura = useOperacion(
    (contacto: string, canalId: string | null, clienteId: string | null) =>
      abrirConversacion(negocio, contacto, canalId, clienteId),
    [...LO_QUE_TOCA_UN_MENSAJE],
  );

  /* --- Lo que se ve ------------------------------------------------- */

  const lista = hilos.datos?.filas ?? [];
  const cargando = hilos.estado === 'cargando' && hilos.datos === null;
  const hayCanalConectado = (canales.datos ?? []).some((c) => c.estado === 'conectado');

  /** Abrir una conversación la marca leída: es lo que hace cualquier bandeja. */
  function abrir(c: ConversacionEnLista): void {
    setAbierta(c.id);
    setDesdeCuando(null);
    if (c.sinLeer > 0) void accion.ejecutar(c.id, 'leida').then(() => hilos.recargar());
  }

  async function mandar(cuerpo: string): Promise<void> {
    if (!abierta) return;
    const id = await envio.ejecutar(abierta, cuerpo);
    if (id === null) return;
    const ms = await traerHilo(abierta, null, MENSAJES_POR_TANDA);
    setMensajes(ms);
    hilos.recargar();
    resumen.recargar();
  }

  async function masAtras(): Promise<void> {
    if (!abierta || mensajes.length === 0) return;
    const primero = mensajes[0]?.creadoEn ?? null;
    const antiguos = await traerHilo(abierta, primero, MENSAJES_POR_TANDA);
    if (antiguos.length === 0) {
      setDesdeCuando('fin');
      return;
    }
    setMensajes([...antiguos, ...mensajes]);
  }

  async function empezarConversacion(datos: {
    clienteId: string | null; contacto: string; canalId: string | null; cuerpo: string;
  }): Promise<void> {
    const id = await apertura.ejecutar(datos.contacto, datos.canalId, datos.clienteId);
    if (!id) return;
    const guardado = await envio.ejecutar(id, datos.cuerpo);
    if (guardado === null) return;
    setVentana(null);
    setAbierta(id);
    hilos.recargar();
    resumen.recargar();
  }

  return (
    <div className="msj mv-pantalla">
      <header className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">Mensajes</h2>
          <p className="tt-lema">Comunícate con tus clientes y da seguimiento a tus conversaciones</p>
        </div>
        <div className="pz-encabezado__acciones">
          <button type="button" className="pz-boton" onClick={() => setVentana('plantillas')}>
            <Icono nombre="nota" lado={16} /> Plantillas
          </button>
          {/* EL NOMBRE ACCESIBLE DICE DE QUE CONFIGURACION SE TRATA, y no es
              un detalle: la barra lateral ya tiene una entrada llamada
              "Configuración". Con el mismo nombre, quien navega con lector de
              pantalla oye dos botones idénticos y no puede saber cuál abre los
              canales — y el chequeo de velos tampoco: tocaba el del menú y se
              iba de la pantalla. */}
          <button
            type="button"
            className="pz-boton"
            aria-label="Configuración de mensajes"
            onClick={() => setVentana('canales')}
          >
            <Icono nombre="engrane" lado={16} /> Configuración
          </button>
          {puedeEscribir ? (
            <button
              type="button"
              className="pz-boton pz-boton--principal"
              onClick={() => setVentana('nuevo')}
            >
              <Icono nombre="mas" lado={16} /> Nuevo mensaje
            </button>
          ) : null}
        </div>
      </header>

      {aviso ? (
        <div className="vta-listo" role="status">
          <span className="pz-ficha" aria-hidden="true">
            <Icono nombre="palomita" lado={18} />
          </span>
          <p className="pz-dato__valor">{aviso}</p>
          <button type="button" className="pz-boton" onClick={() => setAviso(null)}>Entendido</button>
        </div>
      ) : null}

      <CifrasDeMensajes resumen={resumen.datos} />

      <div className="msj-cuerpo">
        <ListaDeConversaciones
          conversaciones={lista}
          cuentas={hilos.datos?.cuentas ?? { todas: 0, noLeidas: 0, pendientes: 0, archivadas: 0 }}
          bandeja={bandeja}
          busqueda={escrito}
          etiqueta={etiqueta}
          etiquetas={etiquetas.datos ?? []}
          escogida={abierta}
          cargando={cargando}
          error={hilos.error}
          hayMas={(hilos.datos?.total ?? 0) > lista.length}
          puedeEscribir={puedeEscribir}
          onBandeja={setBandeja}
          onBuscar={setEscrito}
          onEtiqueta={setEtiqueta}
          onEscoger={abrir}
          onVerMas={() => setCuantas((n) => n + POR_TANDA)}
          onNuevo={() => setVentana('nuevo')}
          onReintentar={hilos.recargar}
        />

        <Hilo
          conversacion={conversacion}
          mensajes={mensajes}
          cargando={Boolean(abierta) && mensajes.length === 0 && hilos.estado === 'cargando'}
          hayMasAtras={mensajes.length >= MENSAJES_POR_TANDA && desdeCuando !== 'fin'}
          enviando={envio.trabajando}
          error={envio.error ?? accion.error}
          canalConectado={hayCanalConectado}
          puedeEscribir={puedeEscribir}
          onEnviar={(t) => void mandar(t)}
          onAccion={(que) => {
            if (!conversacion) return;
            if (que === 'etiquetas') { setVentana('etiquetas'); return; }
            if (que === 'ligar') { setVentana('ligar'); return; }
            if (que === 'asignar') { setVentana('ligar'); return; }
            void accion.ejecutar(conversacion.id, que).then(() => {
              hilos.recargar();
              resumen.recargar();
            });
          }}
          onFavorita={() => {
            if (!conversacion) return;
            void accion.ejecutar(conversacion.id, 'favorita').then(() => hilos.recargar());
          }}
          onVerCliente={() => {
            if (conversacion?.clienteId) {
              ir('clientes', { intencion: `clientes:abrir:${conversacion.clienteId}` });
            }
          }}
          onMasAtras={() => void masAtras()}
          onReintentarMensaje={(m) => void mandar(m.cuerpo)}
        />

        <PanelDelContacto
          conversacion={conversacion}
          expediente={expediente.datos ?? null}
          cargandoExpediente={
            Boolean(conversacion?.clienteId)
            && expediente.estado === 'cargando' && expediente.datos === null
          }
          resumen={resumen.datos}
          canales={canales.datos ?? []}
          puedeVerFinanzas={puedeVerFinanzas}
          onVerCliente={() => {
            if (conversacion?.clienteId) {
              ir('clientes', { intencion: `clientes:abrir:${conversacion.clienteId}` });
            }
          }}
          // LA CITA VIVE EN AGENDA y la venta en Caja. Se navega hasta ellas; no
          // se pinta una copia aquí, que sería una segunda versión de la misma
          // cita esperando a desincronizarse.
          onVerCitas={() => ir('agenda')}
          onVerCompras={() => ir('caja', { intencion: 'ventas:historial' })}
          onCrearCliente={() => setVentana('cliente')}
          onLigarCliente={() => setVentana('ligar')}
          onNuevoMensaje={() => setVentana('nuevo')}
          onDifusion={() => setVentana('difusion')}
          onAutomatizaciones={() => setVentana('automatizaciones')}
          onEtiquetas={() => setVentana('etiquetas')}
          onCanales={() => setVentana('canales')}
        />
      </div>

      <NuevoMensaje
        abierto={ventana === 'nuevo'}
        clientes={clientes.datos?.filas ?? []}
        busqueda={escritoCliente}
        buscando={clientes.estado === 'cargando' && clientes.datos === null}
        canales={canales.datos ?? []}
        plantillas={plantillas.datos ?? []}
        trabajando={apertura.trabajando || envio.trabajando}
        error={apertura.error ?? envio.error}
        nombreDelCentro={NOMBRE_DEL_PRODUCTO}
        onBuscar={setEscritoCliente}
        onCrearCliente={() => setVentana('cliente')}
        onEnviar={(d) => void empezarConversacion(d)}
        onCerrar={() => setVentana(null)}
      />

      <AdministrarPlantillas
        abierto={ventana === 'plantillas'}
        plantillas={plantillas.datos ?? []}
        cargando={plantillas.estado === 'cargando' && plantillas.datos === null}
        trabajando={plantilla.trabajando || bajaDePlantilla.trabajando}
        error={plantilla.error ?? bajaDePlantilla.error}
        onGuardar={(id, d) => void plantilla.ejecutar(id, d).then(() => plantillas.recargar())}
        onBorrar={(p) => void bajaDePlantilla.ejecutar(p.id).then(() => plantillas.recargar())}
        onCerrar={() => setVentana(null)}
      />

      {/* LAS ETIQUETAS SE ADMINISTRAN CON LA PIEZA COMPARTIDA, la misma que usan
          Servicios, Cursos, Productos y Gastos. Una copia aquí sería la sexta
          pantalla parecida a las otras cinco. */}
      <AdministrarCategorias
        abierto={ventana === 'etiquetas'}
        titulo="Etiquetas de conversación"
        que="conversacion"
        categorias={etiquetas.datos ?? []}
        cargando={etiquetas.estado === 'cargando' && etiquetas.datos === null}
        trabajando={etiquetado.trabajando}
        error={etiquetado.error}
        onGuardar={() => etiquetas.recargar()}
        onArchivar={() => etiquetas.recargar()}
        onCerrar={() => setVentana(null)}
      />

      <AdministrarCanales
        abierto={ventana === 'canales'}
        canales={canales.datos ?? []}
        cargando={canales.estado === 'cargando' && canales.datos === null}
        trabajando={canal.trabajando}
        error={canal.error}
        onGuardar={(id, d) => void canal.ejecutar(id, d).then(() => canales.recargar())}
        onCerrar={() => setVentana(null)}
      />

      <AdministrarAutomatizaciones
        abierto={ventana === 'automatizaciones'}
        automatizaciones={automatizaciones.datos ?? []}
        plantillas={plantillas.datos ?? []}
        canales={canales.datos ?? []}
        cargando={automatizaciones.estado === 'cargando' && automatizaciones.datos === null}
        trabajando={automatizacion.trabajando}
        error={automatizacion.error}
        onGuardar={(id, d) =>
          void automatizacion.ejecutar(id, d).then(() => automatizaciones.recargar())}
        onCerrar={() => setVentana(null)}
      />

      <EnviarDifusion
        abierto={ventana === 'difusion'}
        clientes={clientes.datos?.filas ?? []}
        busqueda={escritoCliente}
        cargando={clientes.estado === 'cargando' && clientes.datos === null}
        canales={canales.datos ?? []}
        plantillas={plantillas.datos ?? []}
        trabajando={difusion.trabajando}
        error={difusion.error}
        onBuscar={setEscritoCliente}
        onEnviar={(d) => {
          void difusion.ejecutar(d.nombre, d.cuerpo, d.canalId, d.clientes).then((r) => {
            if (!r) return;
            setVentana(null);
            hilos.recargar();
            resumen.recargar();
            setAviso(
              r.fallidos > 0
                ? `Se guardó para ${r.destinatarios}. ${r.fallidos} quedaron fuera por no tener teléfono.`
                : `Se guardó para ${r.destinatarios} personas.`,
            );
          });
        }}
        onCerrar={() => setVentana(null)}
      />

      {/* Dar de alta usa LA FICHA DE CLIENTES, la misma de siempre: si fueran
          dos, una se quedaría sin la ficha de salud y sin el aviso de duplicados. */}
      {ventana === 'cliente' && puedeCrearCliente ? (
        <FichaDeCliente
          abierta
          titulo="Nuevo cliente"
          inicial={FICHA_VACIA}
          profesionales={gente.datos ?? []}
          trabajando={alta.trabajando}
          error={alta.error}
          onGuardar={(d) => {
            void alta.ejecutar(negocio, { ...DATOS_VACIOS, ...d }).then((creado) => {
              if (!creado) return;
              setVentana(null);
              // Si venía de un hilo sin ficha, se ata al recién creado: es todo
              // el objetivo de haberlo dado de alta desde aquí.
              if (abierta && conversacion && conversacion.clienteId === null) {
                void ligado.ejecutar(abierta, creado.id).then(() => hilos.recargar());
              }
            });
          }}
          onBuscarDuplicado={(telefono, correo) =>
            buscarPosibleDuplicado(negocio, telefono, correo)}
          onAbrirDuplicado={(id) => ir('clientes', { intencion: `clientes:abrir:${id}` })}
          onCerrar={() => setVentana(null)}
        />
      ) : null}

      {/* Atar el hilo a una ficha que YA existe, o asignarle un responsable. Los
          dos son "escoger a alguien de una lista" y comparten el mismo cuadro. */}
      {ventana === 'ligar' && conversacion ? (
        <LigarOAsignar
          conversacion={conversacion}
          clientes={clientes.datos?.filas ?? []}
          gente={gente.datos ?? []}
          busqueda={escritoCliente}
          onBuscar={setEscritoCliente}
          onLigar={(clienteId) => {
            void ligado.ejecutar(conversacion.id, clienteId).then(() => {
              setVentana(null);
              hilos.recargar();
            });
          }}
          onAsignar={(membresiaId) => {
            void asignacion.ejecutar(conversacion.id, membresiaId).then(() => {
              setVentana(null);
              hilos.recargar();
            });
          }}
          onCerrar={() => setVentana(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Atar el hilo a un cliente, o darle responsable.
 *
 * Van juntos porque son la misma pregunta —¿a quién?— y separarlos habría
 * dejado dos cuadros casi iguales. El de arriba solo aparece si el hilo todavía
 * no tiene ficha: ofrecerlo con una puesta invita a cambiársela por error.
 */
function LigarOAsignar({
  conversacion,
  clientes,
  gente,
  busqueda,
  onBuscar,
  onLigar,
  onAsignar,
  onCerrar,
}: {
  readonly conversacion: ConversacionEnLista;
  readonly clientes: readonly ClienteEnLista[];
  readonly gente: readonly ProfesionalBreve[];
  readonly busqueda: string;
  onBuscar(t: string): void;
  onLigar(clienteId: string): void;
  onAsignar(membresiaId: string | null): void;
  onCerrar(): void;
}) {
  return (
    <Modal abierto titulo="Quién es y quién lo lleva" onCerrar={onCerrar}>
      <div className="pz-columna">
        {conversacion.clienteId === null ? (
          <>
            <p className="pz-dato__valor">
              Este hilo entró por <strong>{conversacion.contacto}</strong> y todavía no está ligado a
              ninguna ficha.
            </p>
            <div className="pz-buscador">
              <span className="pz-buscador__lupa" aria-hidden="true">
                <Icono nombre="persona" lado={16} />
              </span>
              <input
                type="search"
                className="pz-buscador__campo"
                autoComplete="off"
                placeholder="Buscar cliente…"
                aria-label="Buscar cliente para ligar"
                value={busqueda}
                onChange={(e) => onBuscar(e.target.value)}
              />
            </div>
            <ul className="vta-encontrados">
              {clientes.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <button type="button" className="vta-concepto" onClick={() => onLigar(c.id)}>
                    <span className="pz-renglon__cuerpo">
                      <span className="pz-renglon__titulo">{c.nombre}</span>
                      <span className="pz-renglon__pie">{c.telefono ?? c.correo ?? 'Sin contacto'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Quién lo lleva</span>
          <select
            value={conversacion.asignadaA ?? ''}
            onChange={(e) => onAsignar(e.target.value || null)}
          >
            <option value="">Sin responsable</option>
            {gente.map((g) => (
              <option key={g.id} value={g.id}>{g.nombre}</option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}

