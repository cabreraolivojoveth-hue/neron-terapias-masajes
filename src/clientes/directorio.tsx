/**
 * CLIENTES — el directorio.
 *
 * ES LA FUENTE DE VERDAD DE UNA PERSONA, y solo de eso: quien es y como
 * contactarla. Sus citas son de Agenda, sus compras de Ventas, su adeudo de
 * Ventas menos Pagos, sus cursos de Inscripciones, sus recordatorios de
 * Recordatorios. Aqui se PREGUNTAN y se unen.
 *
 * Por eso corregir un telefono aqui lo corrige a la vez en la agenda, en el
 * panel de una cita y en el buscador global: nadie guardo una copia.
 *
 * ESTE ARCHIVO SOLO COORDINA: que se pide, que se pinta y que pasa al tocar.
 * Las cifras las calcula la base, las validaciones viven en `ficha.tsx`, y las
 * reglas duras —aislamiento entre centros, permisos— en las reglas de fila.
 *
 * NO IMPORTA NADA DE AGENDA NI DE VENTAS. Para mandar a alguien a crear una
 * cita se navega con un recado, igual que hace Inicio. Que dos modulos esten
 * conectados no significa que uno tenga que conocer las tripas del otro.
 */

import { useNavegacion } from '@neron/base/marco';
import { hoy as hoyDe, type Fecha } from '@neron/base/utils';
import { useEffect, useMemo, useState } from 'react';
import type { ProfesionalBreve } from '../datos/citas.js';
import { traerProfesionales } from '../datos/citas.js';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  archivarCliente,
  crearCliente,
  editarCliente,
  buscarPosibleDuplicado,
  llaveDeClientes,
  llaveDelExpediente,
  llaveDelResumenDeClientes,
  llaveDeSeguimientos,
  traerClientes,
  traerExpediente,
  traerResumenDeClientes,
  traerSeguimientos,
  LO_QUE_TOCA_UN_CLIENTE,
  type ClienteEnLista,
  type DatosDeCliente,
  type ExpedienteDeCliente,
  type FiltrosDeClientes,
  type PaginaDeClientes,
  type ResumenDeClientes,
  type Seguimiento,
} from '../datos/clientes.js';
import { useSesion } from '../identidad/sesion.js';
import { Icono } from '../ui/iconos.js';
import { CifrasDeArriba, ResumenGeneral } from './cifras-de-clientes.js';
import { Expediente } from './expediente.js';
import { FichaDeCliente, FICHA_VACIA } from './ficha.js';
import { ListaDeClientes, type Vista } from './lista-de-clientes.js';
import { PanelLateral, rangoPorClave } from './panel-lateral.js';

/** Cuanto se espera antes de consultar mientras alguien escribe. */
const ESPERA_MS = 300;

export function Directorio() {
  const { acceso } = useSesion();
  const { ir } = useNavegacion();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  const puedeGestionar = permisos['gestionarClientes'] === true;
  const [dia] = useState<Fecha>(() => hoyDe());

  /* --- Lo que la persona escogio ------------------------------------ */

  const [escrito, setEscrito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [profesionalId, setProfesionalId] = useState('');
  const [rango, setRango] = useState('');
  const [vista, setVista] = useState<Vista>('lista');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);

  const [ficha, setFicha] = useState<{ inicial: DatosDeCliente; id?: string } | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  /**
   * El texto se consulta cuando la persona deja de escribir.
   *
   * Sin la espera, "Fernanda" son ocho consultas de las que siete no le
   * importan a nadie — y las respuestas pueden llegar desordenadas, dejando la
   * lista mostrando el resultado de lo que se escribio antes.
   */
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(escrito.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [escrito]);

  /**
   * Cualquier filtro nuevo devuelve a la PAGINA UNO.
   *
   * Sin esto, alguien parado en la pagina 4 escribe un nombre, el resultado
   * tiene una sola pagina, y la lista sale vacia — con toda la cara de que ese
   * cliente no existe.
   */
  useEffect(() => setPagina(1), [busqueda, estado, profesionalId, rango, porPagina]);

  const filtros: FiltrosDeClientes = useMemo(() => {
    const r = rangoPorClave(rango);
    return { busqueda, estado: estado as FiltrosDeClientes['estado'], profesionalId,
             visitasMin: r.min, visitasMax: r.max };
  }, [busqueda, estado, profesionalId, rango]);

  /* --- Lo que se le pide al servidor -------------------------------- */

  const lista = useConsulta<PaginaDeClientes>(
    negocio ? llaveDeClientes(negocio, filtros, pagina, porPagina) : null,
    () => traerClientes(negocio, filtros, pagina, porPagina),
  );

  const resumen = useConsulta<ResumenDeClientes>(
    negocio ? llaveDelResumenDeClientes(negocio, dia) : null,
    () => traerResumenDeClientes(negocio, dia),
  );

  const seguimientos = useConsulta<Seguimiento[]>(
    negocio ? llaveDeSeguimientos(negocio) : null,
    () => traerSeguimientos(negocio),
  );

  // Las mismas terapeutas que ofrece la Agenda, por la MISMA llave: no hay dos
  // listas de personal que puedan decir cosas distintas.
  const profesionales = useConsulta<ProfesionalBreve[]>(
    negocio ? `profesionales:${negocio}` : null,
    () => traerProfesionales(negocio),
  );

  const expediente = useConsulta<ExpedienteDeCliente | null>(
    abierto ? llaveDelExpediente(abierto) : null,
    () => traerExpediente(abierto!, dia),
  );

  /* --- Lo que cambia datos ------------------------------------------ */

  const alta = useOperacion(crearCliente, [...LO_QUE_TOCA_UN_CLIENTE]);
  const cambio = useOperacion(editarCliente, [...LO_QUE_TOCA_UN_CLIENTE]);
  const archivo = useOperacion(archivarCliente, [...LO_QUE_TOCA_UN_CLIENTE]);

  async function guardarFicha(datos: DatosDeCliente): Promise<void> {
    const r = ficha?.id
      ? await cambio.ejecutar(ficha.id, datos)
      : await alta.ejecutar(negocio, datos);
    // Solo se cierra si de verdad guardo. Cerrar y perder lo escrito cuando la
    // base rechazo es la peor combinacion posible.
    if (r !== null) setFicha(null);
  }

  /* --- A donde lleva cada accion ------------------------------------ */

  /**
   * Cada accion abre el modulo DUEÑO con el cliente como recado.
   *
   * El recado lleva el ID, no el nombre ni el telefono: un telefono copiado
   * deja de ser el bueno en cuanto alguien lo corrige, y con el nombre no se
   * puede reconocer una conversacion que ya existe.
   */
  function hacer(clave: string, c: ClienteEnLista | ExpedienteDeCliente): void {
    if (clave === 'ver') {
      setAbierto(c.id);
      return;
    }
    if (clave === 'editar') {
      setFicha({
        id: c.id,
        inicial: {
          nombre: c.nombre,
          telefono: c.telefono ?? '',
          correo: c.correo ?? '',
          fechaNacimiento: c.fechaNacimiento ?? '',
          notas: 'notas' in c ? (c.notas ?? '') : '',
          profesionalId: c.profesionalId ?? '',
        },
      });
      return;
    }
    if (clave === 'archivar') {
      const archivada = 'archivado' in c ? c.archivado : c.estado === 'archivado';
      void archivo.ejecutar(c.id, !archivada);
      return;
    }

    const destinos: Readonly<Record<string, { modulo: string; accion: string }>> = {
      cita: { modulo: 'agenda', accion: 'nueva' },
      venta: { modulo: 'ventas', accion: 'nueva' },
      mensaje: { modulo: 'mensajes', accion: 'escribir' },
      recordatorio: { modulo: 'recordatorios', accion: 'nuevo' },
      curso: { modulo: 'cursos', accion: 'inscribir' },
    };
    const d = destinos[clave];
    if (d) ir(d.modulo, { intencion: `${d.modulo}:${d.accion}:${c.id}` });
  }

  const cargandoLista = lista.estado === 'cargando' && lista.datos === null;

  return (
    <div className="cli mv-pantalla">
      <header className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">Clientes</h2>
          <p className="tt-lema">Gestiona y da seguimiento a tus clientes</p>
        </div>
        {puedeGestionar ? (
          <button
            type="button"
            className="pz-boton pz-boton--principal"
            onClick={() => setFicha({ inicial: FICHA_VACIA })}
          >
            <Icono nombre="mas" lado={16} /> Nuevo cliente
          </button>
        ) : null}
      </header>

      {resumen.error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar el resumen de clientes.</p>
          <p className="pz-error__detalle">{resumen.error}</p>
          <button type="button" className="pz-boton" onClick={resumen.recargar}>
            Reintentar
          </button>
        </div>
      ) : null}

      <CifrasDeArriba resumen={resumen.datos} />

      <div className="pz-cuerpo">
        <ListaDeClientes
          clientes={lista.datos?.filas ?? []}
          total={lista.datos?.total ?? 0}
          pagina={pagina}
          porPagina={porPagina}
          vista={vista}
          busqueda={escrito}
          estado={estado}
          profesionalId={profesionalId}
          profesionales={profesionales.datos ?? []}
          permisos={permisos}
          cargando={cargandoLista}
          error={lista.error}
          onBuscar={setEscrito}
          onEstado={setEstado}
          onProfesional={setProfesionalId}
          onVista={setVista}
          onPagina={setPagina}
          onPorPagina={setPorPagina}
          onAccion={hacer}
          onNuevo={() => setFicha({ inicial: FICHA_VACIA })}
          onReintentar={lista.recargar}
          onArchivarVarios={(ids) => {
            for (const id of ids) void archivo.ejecutar(id, true);
          }}
        />

        <PanelLateral
          estado={estado}
          profesionalId={profesionalId}
          rango={rango}
          profesionales={profesionales.datos ?? []}
          seguimientos={seguimientos.datos ?? []}
          cargandoSeguimientos={seguimientos.estado === 'cargando' && seguimientos.datos === null}
          cumpleanos={resumen.datos?.cumpleanos ?? []}
          cargandoCumpleanos={resumen.estado === 'cargando' && resumen.datos === null}
          onEstado={setEstado}
          onProfesional={setProfesionalId}
          onRango={setRango}
          onLimpiar={() => {
            setEstado('');
            setProfesionalId('');
            setRango('');
            setEscrito('');
          }}
          onVerRecordatorios={() => ir('recordatorios', { parametros: { origen: 'cliente' } })}
          onAbrirSeguimiento={(s) => {
            // Si el recordatorio sabe de quien es, se abre ESE expediente. Si
            // no, se va al modulo donde vive.
            if (s.clienteId) setAbierto(s.clienteId);
            else ir('recordatorios', { intencion: `recordatorios:abrir:${s.id}` });
          }}
          onVerCumpleanos={() => {
            // "Ver todos" no abre una pantalla nueva: ordena la lista por lo
            // que se estaba viendo. Una pantalla mas para cinco nombres es una
            // pantalla que despues hay que mantener.
            setEstado('');
            setProfesionalId('');
            setRango('');
            setEscrito('');
            setVista('cuadricula');
          }}
          onAbrirCliente={(id) => setAbierto(id)}
        />
      </div>

      <ResumenGeneral resumen={resumen.datos} />

      {ficha ? (
        <FichaDeCliente
          // La llave fuerza un formulario limpio al abrirlo con otro cliente.
          key={ficha.id ?? 'nuevo'}
          abierta
          titulo={ficha.id ? 'Editar cliente' : 'Nuevo cliente'}
          inicial={ficha.inicial}
          profesionales={profesionales.datos ?? []}
          trabajando={alta.trabajando || cambio.trabajando}
          error={alta.error ?? cambio.error}
          {...(ficha.id ? { editandoId: ficha.id } : {})}
          onGuardar={(d) => void guardarFicha(d)}
          onBuscarDuplicado={(tel, cor) =>
            buscarPosibleDuplicado(negocio, tel, cor, ficha.id ?? '')
          }
          onAbrirDuplicado={(id) => {
            setFicha(null);
            setAbierto(id);
          }}
          onCerrar={() => setFicha(null)}
        />
      ) : null}

      <Expediente
        abierto={abierto !== null}
        expediente={expediente.datos}
        cargando={expediente.estado === 'cargando' && expediente.datos === null}
        error={expediente.error}
        permisos={permisos}
        onAccion={(clave) => {
          const e = expediente.datos;
          if (!e) return;
          if (clave !== 'ver') setAbierto(null);
          hacer(clave, e);
        }}
        onCerrar={() => setAbierto(null)}
      />
    </div>
  );
}
