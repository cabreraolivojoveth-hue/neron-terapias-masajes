/**
 * REPORTES — la capa de análisis del centro.
 *
 * NO ES DUEÑO DE NI UN DATO. No hay tabla de reportes, no hay copia de las
 * ventas, no hay totales guardados: todo se cuenta en el momento desde las
 * tablas de cada modulo. Por eso una venta cancelada hace cinco minutos ya no
 * suma aqui, y por eso este archivo no tiene ni una operacion de escritura que
 * no sea guardar o quitar un reporte guardado.
 *
 * UNA SOLA LLAMADA PARA TODA LA PANTALLA. `reporte_del_periodo` devuelve las
 * cuatro cifras, las ocho pestañas, las dos graficas y el resumen del costado.
 * Se hizo asi por dos razones y las dos importan:
 *
 *   · Bajar mil ventas al navegador para sumarlas seria lento hoy e imposible
 *     en dos años.
 *   · Con una consulta por pestaña, basta que UNA se quede con el periodo viejo
 *     para que la pantalla se contradiga a si misma — sin fallar, sin avisar, y
 *     con los dos numeros viendose perfectamente normales.
 *
 * EL PERIODO Y LOS FILTROS VIVEN AQUI ARRIBA y bajan por propiedades. Ninguna
 * seccion escoge el suyo; cambiarlos mueve la pantalla entera de golpe.
 *
 * LOS PERMISOS NO SE COMPRUEBAN EN EL NAVEGADOR. La funcion de la base es
 * `security invoker`: las reglas de acceso por fila dan gratis el aislamiento
 * entre centros y la exigencia de `verFinanzas`. Esconder la pantalla es
 * cortesia; la regla de fila es la seguridad.
 */

import { tomarIntencion, useNavegacion } from '@neron/base/marco';
import { hoy as hoyDe, type Fecha } from '@neron/base/utils';
import { Confirmacion } from '@neron/base/ui';
import { useEffect, useMemo, useState } from 'react';
import { traerProfesionales, type ProfesionalBreve } from '../datos/citas.js';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  LO_QUE_TOCA_UN_REPORTE,
  SIN_FILTROS,
  borrarReporte,
  guardarReporte,
  llaveDeReportesGuardados,
  llaveDelReporte,
  traerReporte,
  traerReportesGuardados,
  type FiltrosDelReporte,
  type Reporte,
  type ReporteGuardado,
} from '../datos/reportes.js';
import { useSesion } from '../identidad/sesion.js';
import { Icono } from '../ui/iconos.js';
import { CostadoDelReporte } from './costado-del-reporte.js';
import { GuardarReporte, HistorialDeReportes } from './guardados.js';
import { MetricasDelReporte } from './metricas.js';
import {
  periodoEnPalabras,
  periodosDelCentro,
  type ClaveDePeriodo,
} from './periodo-del-reporte.js';
import { descargarCsv, nombreDelArchivo, reporteComoCsv } from './exportar.js';
import {
  PESTANAS_DEL_REPORTE,
  SeccionDelReporte,
  type PestanaDelReporte,
} from './secciones.js';
import {
  llaveDelCumplimiento,
  traerCumplimiento,
  type CumplimientoDeRecordatorios,
} from '../datos/recordatorios.js';

/** Los tipos de ingreso que sabe filtrar la base. Vacio = sin filtrar. */
const TIPOS = [
  { valor: '', etiqueta: 'Todo' },
  { valor: 'servicio', etiqueta: 'Servicios' },
  { valor: 'producto', etiqueta: 'Productos' },
  { valor: 'curso', etiqueta: 'Cursos' },
];

const METODOS = [
  { valor: '', etiqueta: 'Todas' },
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'otro', etiqueta: 'Otro' },
];

export function Analisis() {
  const { acceso } = useSesion();
  const { ir } = useNavegacion();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  // Guardar un reporte exige lo mismo que verlo, porque la regla de fila de
  // `reporte_guardado` exige lo mismo. Esconder el boton es cortesia.
  const puedeGuardar = permisos['verFinanzas'] === true;

  // `hoy` se congela al entrar. Si se recalculara en cada render, una pestaña
  // abierta durante la medianoche cambiaria de periodo sola.
  const [hoy] = useState<Fecha>(() => hoyDe());
  const periodos = useMemo(() => periodosDelCentro(hoy), [hoy]);

  const [clave, setClave] = useState<ClaveDePeriodo>('esteMes');
  const [desdeLibre, setDesdeLibre] = useState<Fecha>(hoy);
  const [hastaLibre, setHastaLibre] = useState<Fecha>(hoy);

  const escogido = periodos.find((p) => p.clave === clave);
  const desde = escogido ? escogido.desde : desdeLibre;
  const hasta = escogido ? escogido.hasta : hastaLibre;

  const [pestana, setPestana] = useState<PestanaDelReporte>('resumen');
  const [filtros, setFiltros] = useState<FiltrosDelReporte>(SIN_FILTROS);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<ReporteGuardado | null>(null);

  /* --- Lo que se le pide al servidor -------------------------------- */

  const reporte = useConsulta<Reporte>(
    negocio ? llaveDelReporte(negocio, desde, hasta, filtros) : null,
    () => traerReporte(negocio, desde, hasta, filtros),
  );

  /**
   * EL CUMPLIMIENTO DE LOS PENDIENTES SE PIDE APARTE, Y SOLO EN SU PESTAÑA.
   *
   * Aparte, porque la definicion de "vencido" vive en Recordatorios y contarlo
   * aqui seria una segunda fuente de verdad. Solo en su pestaña, porque es un
   * viaje mas al servidor que a casi nadie le importa mientras mira ventas.
   */
  const cumplimiento = useConsulta<CumplimientoDeRecordatorios>(
    negocio && pestana === 'recordatorios'
      ? llaveDelCumplimiento(negocio, desde, hasta)
      : null,
    () => traerCumplimiento(negocio, desde, hasta, hoy),
  );

  const guardados = useConsulta<ReporteGuardado[]>(
    negocio ? llaveDeReportesGuardados(negocio) : null,
    () => traerReportesGuardados(negocio),
  );

  // QUIEN VENDIO SALE DE LAS MEMBRESIAS, no de una lista propia: el dia que
  // alguien cambie de nombre, el filtro lo dice al dia sin tocar nada.
  const gente = useConsulta<ProfesionalBreve[]>(
    // La misma llave que usa el punto de venta: la lista es la misma y no hay
    // por que traerla dos veces.
    negocio ? `profesionales:${negocio}` : null,
    () => traerProfesionales(negocio),
  );

  /* --- El recado que llega de otro modulo --------------------------- */

  useEffect(() => {
    const recado = tomarIntencion('reportes');
    // `reportes:ventas`, `reportes:gastos`… abre esa pestaña directamente. Sin
    // esto, llegar aqui desde otro modulo dejaba a la persona en "Resumen"
    // buscando a mano la seccion de la que venia.
    const seccion = recado?.accion ?? '';
    const encontrada = PESTANAS_DEL_REPORTE.find((p) => p.clave === seccion);
    if (encontrada) setPestana(encontrada.clave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Las operaciones ---------------------------------------------- */

  const alta = useOperacion(
    (nombre: string) =>
      guardarReporte(negocio, nombre, pestana, desde, hasta, filtros),
    LO_QUE_TOCA_UN_REPORTE,
  );
  const baja = useOperacion((id: string) => borrarReporte(id), LO_QUE_TOCA_UN_REPORTE);

  /* --- Lo que se ve ------------------------------------------------- */

  const cargando = reporte.estado === 'cargando' && reporte.datos === null;
  const hayFiltros = filtros.tipo !== '' || filtros.metodo !== '' || filtros.vendedorId !== '';

  /**
   * Abrir un guardado repone la PREGUNTA entera: periodo, pestaña y filtros.
   *
   * Reponer solo el periodo dejaria las cifras del mes correcto con los filtros
   * de lo que se estaba viendo antes — un reporte que no es ni el guardado ni
   * el de la pantalla, y que no se ve raro.
   */
  function abrirGuardado(g: ReporteGuardado): void {
    setClave('personalizado');
    setDesdeLibre(g.desde);
    setHastaLibre(g.hasta);
    setFiltros(g.filtros);
    const encontrada = PESTANAS_DEL_REPORTE.find((p) => p.clave === g.tipo);
    if (encontrada) setPestana(encontrada.clave);
  }

  function exportar(): void {
    if (!reporte.datos) return;
    descargarCsv(
      nombreDelArchivo(reporte.datos, pestana),
      reporteComoCsv(reporte.datos, pestana, filtros),
    );
  }

  return (
    <div className="rep mv-pantalla">
      <header className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">Reportes</h2>
          <p className="tt-lema">Analiza el rendimiento de tu centro</p>
        </div>
        <div className="pz-encabezado__acciones">
          {/* EL PERIODO SE LEE ANTES DE TOCAR NADA. Es lo primero que hay que
              saber para creerse cualquier cifra de la pantalla, y por eso va
              escrito con todas sus letras y no escondido en un desplegable. */}
          <span className="rep-periodo">
            <Icono nombre="calendario" lado={16} />
            {periodoEnPalabras(desde, hasta)}
          </span>
          <button
            type="button"
            className={`pz-boton${filtrosAbiertos || hayFiltros ? ' pz-boton--puesto' : ''}`}
            aria-expanded={filtrosAbiertos}
            onClick={() => setFiltrosAbiertos((a) => !a)}
          >
            <Icono nombre="filtros" lado={16} /> Filtros
          </button>
          <button
            type="button"
            className="pz-boton"
            disabled={reporte.datos === null}
            onClick={exportar}
          >
            <Icono nombre="salida" lado={16} /> Exportar
          </button>
        </div>
      </header>

      {filtrosAbiertos ? (
        <div className="pz-filtros">
          <label className="pz-campo pz-campo--corto">
            <span className="tt-etiqueta">Qué se vendió</span>
            <select
              value={filtros.tipo}
              onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
          </label>
          <label className="pz-campo pz-campo--corto">
            <span className="tt-etiqueta">Forma de pago</span>
            <select
              value={filtros.metodo}
              onChange={(e) => setFiltros((f) => ({ ...f, metodo: e.target.value }))}
            >
              {METODOS.map((m) => (
                <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
              ))}
            </select>
          </label>
          <label className="pz-campo pz-campo--corto">
            <span className="tt-etiqueta">Quién vendió</span>
            <select
              value={filtros.vendedorId}
              onChange={(e) => setFiltros((f) => ({ ...f, vendedorId: e.target.value }))}
            >
              <option value="">Todo el equipo</option>
              {(gente.datos ?? []).map((p) => (
                // Es el id de la CUENTA y no el de la membresia: la venta guarda
                // quien la creo, que es la cuenta. Mandar el otro devolvia cero
                // ventas sin fallar ni avisar.
                <option key={p.id} value={p.usuarioId}>{p.nombre}</option>
              ))}
            </select>
          </label>
          {hayFiltros ? (
            <button type="button" className="pz-boton" onClick={() => setFiltros(SIN_FILTROS)}>
              Quitar los filtros
            </button>
          ) : null}
        </div>
      ) : null}

      {reporte.error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No se pudo calcular el reporte.</p>
          <p className="pz-error__detalle">{reporte.error}</p>
          <button type="button" className="pz-boton" onClick={reporte.recargar}>
            Reintentar
          </button>
        </div>
      ) : null}

      <MetricasDelReporte reporte={reporte.datos} />

      <div className="rep-cuerpo">
        <div className="rep-principal">
          <div className="pz-pestanas" role="tablist" aria-label="Secciones del reporte">
            {PESTANAS_DEL_REPORTE.map((p) => (
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

          {/* La llave es la pestaña: es lo que hace que lo nuevo ENTRE en vez de
              sustituirse de golpe. */}
          <div className="mv-cambia" key={pestana}>
            <SeccionDelReporte
              pestana={pestana}
              reporte={reporte.datos}
              cumplimiento={cumplimiento.datos}
              cargando={cargando || (pestana === 'recordatorios' && cumplimiento.datos === null)}
              onIr={(modulo, intencion) =>
                ir(modulo, intencion ? { intencion } : {})
              }
            />
          </div>

          {/* El historial vive bajo el Resumen, como en el diseño: es sobre la
              pantalla entera, no sobre la seccion abierta, y repetirlo en las
              ocho seria la misma tabla ocho veces. */}
          {pestana === 'resumen' ? (
            <HistorialDeReportes
              guardados={guardados.datos ?? []}
              cargando={guardados.estado === 'cargando' && guardados.datos === null}
              puedeGestionar={puedeGuardar}
              onAbrir={abrirGuardado}
              onExportar={(g) => {
                // Se repone la pregunta y se deja que la pantalla la conteste:
                // exportar sin recalcular bajaria las cifras del periodo que
                // esta en pantalla con el nombre del reporte guardado.
                abrirGuardado(g);
              }}
              onBorrar={setABorrar}
            />
          ) : null}
        </div>

        <CostadoDelReporte
          periodos={periodos}
          clave={clave}
          desde={desde}
          hasta={hasta}
          reporte={reporte.datos}
          cargando={cargando}
          guardados={guardados.datos ?? []}
          puedeGuardar={puedeGuardar}
          onPeriodo={(c) => {
            setClave(c);
            // Al pasar a personalizado se arranca del periodo que se estaba
            // viendo: dos campos vacios obligarian a capturar de cero algo que
            // casi siempre solo se quiere mover unos dias.
            if (c === 'personalizado') {
              setDesdeLibre(desde);
              setHastaLibre(hasta);
            }
          }}
          onDesde={setDesdeLibre}
          onHasta={setHastaLibre}
          onGuardar={() => {
            alta.limpiarError();
            setGuardando(true);
          }}
          onAbrirGuardado={abrirGuardado}
          onBorrarGuardado={setABorrar}
        />
      </div>

      <GuardarReporte
        abierto={guardando}
        pestana={pestana}
        periodo={periodoEnPalabras(desde, hasta)}
        trabajando={alta.trabajando}
        error={alta.error}
        onGuardar={(nombre) => {
          void alta.ejecutar(nombre).then((r) => {
            // Solo se cierra si de verdad guardo: cerrar al fallar borra lo
            // escrito y deja a la persona sin saber que paso.
            if (r !== null) {
              setGuardando(false);
              guardados.recargar();
            }
          });
        }}
        onCerrar={() => setGuardando(false)}
      />

      <Confirmacion
        abierto={aBorrar !== null}
        titulo={`¿Quitar "${aBorrar?.nombre ?? ''}"?`}
        confirmar="Quitarlo"
        destructivo
        trabajando={baja.trabajando}
        onConfirmar={() => {
          if (!aBorrar) return;
          void baja.ejecutar(aBorrar.id).then(() => {
            setABorrar(null);
            guardados.recargar();
          });
        }}
        onCancelar={() => setABorrar(null)}
      >
        <p className="pz-dato__valor">
          Se quita de la lista el período y los filtros guardados. No se borra ni una venta ni un
          gasto: aquí nunca hubo cifras guardadas.
        </p>
        {baja.error ? <p className="pz-error__detalle">{baja.error}</p> : null}
      </Confirmacion>
    </div>
  );
}
