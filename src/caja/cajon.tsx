/**
 * CAJA — el cajón, y lo que de verdad hay dentro.
 *
 * LA DISTINCION QUE SOSTIENE EL MODULO: un ingreso del negocio no es lo mismo
 * que efectivo en el cajón. Una venta de mil pesos con tarjeta es un ingreso
 * de mil pesos y CERO efectivo. Si el sistema los sumara juntos, al cerrar el
 * turno pediría contar seis mil y en el cajón habría dos mil — y nadie sabría
 * si faltó dinero o faltó entender el número.
 *
 * CAJA NO ES DUEÑA DE NINGUN MOVIMIENTO. Los de venta los escribe
 * `registrar_venta`, los de gasto un disparador de la base, y lo único que se
 * captura aquí a mano son los ajustes: ingresos y retiros. Por eso no hay
 * botón de editar ni de borrar en toda la pantalla — la caja es un libro, y
 * revertir algo es agregar el movimiento contrario.
 *
 * SIN CAJA ABIERTA NO SE COBRA EN EFECTIVO. Lo impide la base, no esta
 * pantalla: billetes en un cajón que ningún corte va a contar son un descuadre
 * garantizado. La tarjeta y la transferencia sí se pueden cobrar — ese dinero
 * va al banco, no al cajón.
 */

import { tomarIntencion, useNavegacion } from '@neron/base/marco';
import { hoy, type Fecha } from '@neron/base/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LO_QUE_TOCA_LA_CAJA,
  abrirCaja,
  cerrarCaja,
  llaveDeLaCaja,
  llaveDeMovimientos,
  llaveDelHistorialDeCajas,
  llaveDelReporteDeCaja,
  llaveDelResumenDeCaja,
  registrarMovimiento,
  traerCajaAbierta,
  traerHistorialDeCajas,
  traerMovimientos,
  traerReporteDeCaja,
  traerResumenDeCaja,
  type CajaAbierta,
  type FiltrosDeMovimientos,
  type PaginaDeCajas,
  type PaginaDeMovimientos,
  type ReporteDeCaja,
  type ResumenDeCaja,
} from '../datos/caja.js';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import { useSesion } from '../identidad/sesion.js';
import { Icono } from '../ui/iconos.js';
import { FormularioDeApertura, SinCajaAbierta } from './abrir-caja.js';
import { CorteDeCaja } from './corte-de-caja.js';
import { CifrasDeLaCaja, EstadoDeLaCaja } from './estado-de-la-caja.js';
import { HistorialDeCajas, ReportesDeCaja } from './historial-de-cajas.js';
import { MetodosDePago } from './metodos-de-pago.js';
import { MovimientosDelDia } from './movimientos-del-dia.js';
import { RegistrarMovimiento } from './registrar-movimiento.js';
import { TablaDeMovimientos, csvDeMovimientos } from './tabla-de-movimientos.js';

/** Cuanto se espera antes de consultar mientras alguien escribe. */
const ESPERA_MS = 300;

/** `dd/mm/aaaa` → `aaaa-mm-dd`, que es lo que entiende un campo de fecha. */
export function aCampo(f: Fecha): string {
  const [d, m, a] = f.split('/');
  if (!d || !m || !a) return '';
  return `${a}-${m}-${d}`;
}

/** Lo que devuelve el campo → `dd/mm/aaaa`. Vacio conserva la que habia. */
export function deCampo(v: string, anterior: Fecha): Fecha {
  const [a, m, d] = v.split('-');
  if (!a || !m || !d) return anterior;
  return `${d}/${m}/${a}`;
}

/**
 * Baja un archivo al equipo.
 *
 * Va aparte y con guardia porque `URL.createObjectURL` no existe en todos los
 * entornos —el de pruebas es uno— y reventar al exportar tumbaria la pantalla
 * entera por un boton secundario.
 */
export function bajarArchivo(nombre: string, contenido: string): boolean {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const sitio = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = sitio;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(sitio);
  return true;
}

export function Cajon() {
  const { acceso } = useSesion();
  const { ir } = useNavegacion();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  // Ver la caja y moverla son el mismo permiso: quien ve el dinero del centro
  // es quien lo administra. La base exige lo mismo, no solo esta pantalla.
  const puedeMover = permisos['verFinanzas'] === true;
  const quien = acceso?.nombre ?? '';

  const [dia] = useState<Fecha>(() => hoy());

  /* --- Lo que la persona abrió ------------------------------------- */

  const [abriendo, setAbriendo] = useState(false);
  const [moviendo, setMoviendo] = useState<'ingreso' | 'egreso' | null>(null);
  const [cortando, setCortando] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [reportesAbiertos, setReportesAbiertos] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  /* --- Los filtros de la tabla ------------------------------------- */

  const [escrito, setEscrito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [clase, setClase] = useState('');
  const [metodo, setMetodo] = useState('');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const porPagina = 5;

  const [paginaDelHistorial, setPaginaDelHistorial] = useState(1);
  const [desde, setDesde] = useState<Fecha>(() => hoy());
  const [hasta, setHasta] = useState<Fecha>(() => hoy());
  const [metodoDelReporte, setMetodoDelReporte] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(escrito.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [escrito]);

  useEffect(() => setPagina(1), [busqueda, clase, metodo]);

  /* --- Lo que se le pide al servidor ------------------------------- */

  const caja = useConsulta<CajaAbierta | null>(
    negocio ? llaveDeLaCaja(negocio) : null,
    () => traerCajaAbierta(negocio),
  );

  const sesionId = caja.datos?.id ?? '';

  const resumen = useConsulta<ResumenDeCaja>(
    sesionId ? llaveDelResumenDeCaja(sesionId) : null,
    () => traerResumenDeCaja(sesionId),
  );

  const filtros: FiltrosDeMovimientos = useMemo(
    () => ({ busqueda, clase, metodo }),
    [busqueda, clase, metodo],
  );

  const movimientos = useConsulta<PaginaDeMovimientos>(
    negocio && sesionId ? llaveDeMovimientos(negocio, sesionId, filtros, pagina, porPagina) : null,
    () => traerMovimientos(negocio, sesionId, filtros, pagina, porPagina),
  );

  const historial = useConsulta<PaginaDeCajas>(
    negocio && historialAbierto ? llaveDelHistorialDeCajas(negocio, paginaDelHistorial) : null,
    () => traerHistorialDeCajas(negocio, paginaDelHistorial),
  );

  const reporte = useConsulta<ReporteDeCaja>(
    negocio && reportesAbiertos
      ? llaveDelReporteDeCaja(negocio, desde, hasta, '', metodoDelReporte)
      : null,
    () => traerReporteDeCaja(negocio, desde, hasta, '', metodoDelReporte),
  );

  /* --- Lo que cambia datos ----------------------------------------- */

  const apertura = useOperacion(abrirCaja, [...LO_QUE_TOCA_LA_CAJA]);
  const cierre = useOperacion(cerrarCaja, [...LO_QUE_TOCA_LA_CAJA]);
  const movimiento = useOperacion(registrarMovimiento, [...LO_QUE_TOCA_LA_CAJA]);

  /** EL RECADO DE QUIEN NOS MANDO, que se consume UNA sola vez. */
  const recadoLeido = useRef(false);
  useEffect(() => {
    if (recadoLeido.current) return;
    recadoLeido.current = true;
    const recado = tomarIntencion('caja');
    if (!recado) return;
    if (recado.accion === 'abrir') setAbriendo(true);
    else if (recado.accion === 'historial') setHistorialAbierto(true);
  }, []);

  const cargandoCaja = caja.estado === 'cargando' && caja.datos === null;
  const laCaja = caja.datos;

  function exportar(): void {
    const filas = movimientos.datos?.filas ?? [];
    if (filas.length === 0) return;
    const quedo = bajarArchivo(
      `caja-${laCaja?.nombre ?? 'movimientos'}.csv`,
      csvDeMovimientos(filas),
    );
    setAviso(
      quedo
        ? 'Se bajó el archivo con los movimientos de esta página.'
        : 'Este navegador no deja bajar archivos. Copia los movimientos de la tabla.',
    );
  }

  return (
    <div className="cli srv caja">
      <header className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">Caja</h2>
          <p className="tt-lema">
            Administra tu caja y controla los movimientos de efectivo
          </p>
        </div>
        <div className="pz-encabezado__acciones">
          <button
            type="button"
            className="pz-boton"
            onClick={() => setHistorialAbierto(true)}
          >
            <Icono nombre="reloj" lado={16} /> Historial de cajas
          </button>
          <button
            type="button"
            className="pz-boton"
            onClick={() => setReportesAbiertos(true)}
          >
            <Icono nombre="barras" lado={16} /> Reportes de caja
          </button>
          {puedeMover && !laCaja ? (
            <button
              type="button"
              className="pz-boton pz-boton--principal"
              onClick={() => setAbriendo(true)}
            >
              <Icono nombre="mas" lado={16} /> Abrir nueva caja
            </button>
          ) : null}
        </div>
      </header>

      {caja.error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar la caja.</p>
          <p className="pz-error__detalle">{caja.error}</p>
          <button type="button" className="pz-boton" onClick={caja.recargar}>
            Reintentar
          </button>
        </div>
      ) : null}

      {aviso ? (
        <div className="vta-listo" role="status">
          <span className="pz-ficha" aria-hidden="true">
            <Icono nombre="palomita" lado={18} />
          </span>
          <p className="pz-dato__valor">{aviso}</p>
          <button type="button" className="pz-boton" onClick={() => setAviso(null)}>
            Entendido
          </button>
        </div>
      ) : null}

      {cargandoCaja ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando la caja</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : !laCaja ? (
        <SinCajaAbierta puedeAbrir={puedeMover} onAbrir={() => setAbriendo(true)} />
      ) : (
        <>
          <CifrasDeLaCaja caja={laCaja} />

          <div className="pz-cuerpo">
            <div className="caja-columna">
              <div className="vta-dos">
                <MetodosDePago
                  metodos={resumen.datos?.metodos ?? []}
                  totalCentavos={resumen.datos?.totalEntradasCentavos ?? 0}
                  cargando={resumen.estado === 'cargando' && resumen.datos === null}
                />
                <MovimientosDelDia
                  clases={resumen.datos?.clases ?? []}
                  movimientos={resumen.datos?.movimientos ?? 0}
                  netoCentavos={resumen.datos?.netoCentavos ?? 0}
                  cargando={resumen.estado === 'cargando' && resumen.datos === null}
                  onExportar={exportar}
                />
              </div>

              <TablaDeMovimientos
                movimientos={movimientos.datos?.filas ?? []}
                total={movimientos.datos?.total ?? 0}
                pagina={pagina}
                porPagina={porPagina}
                busqueda={escrito}
                clase={clase}
                metodo={metodo}
                filtrosAbiertos={filtrosAbiertos}
                cargando={movimientos.estado === 'cargando' && movimientos.datos === null}
                error={movimientos.error}
                onBuscar={setEscrito}
                onClase={setClase}
                onMetodo={setMetodo}
                onFiltros={() => setFiltrosAbiertos((a) => !a)}
                onPagina={setPagina}
                // La venta se abre en VENTAS, que es donde se administra.
                onAbrirVenta={(id) => ir('ventas', { intencion: `ventas:abrir:${id}` })}
                onReintentar={movimientos.recargar}
              />
            </div>

            <div className="vta-lateral">
              <EstadoDeLaCaja
                caja={laCaja}
                puedeMover={puedeMover}
                onIngreso={() => setMoviendo('ingreso')}
                onRetiro={() => setMoviendo('egreso')}
                onCerrarCaja={() => setCortando(true)}
                onHistorial={() => setHistorialAbierto(true)}
              />
            </div>
          </div>
        </>
      )}

      <FormularioDeApertura
        key={laCaja ? 'con' : 'sin'}
        abierto={abriendo}
        quien={quien}
        trabajando={apertura.trabajando}
        error={apertura.error}
        onAbrir={(datos) => {
          void apertura.ejecutar(negocio, datos).then((r) => {
            if (r !== null) setAbriendo(false);
          });
        }}
        onCerrar={() => setAbriendo(false)}
      />

      {/* La `key` fuerza un formulario limpio entre un ingreso y un retiro: sin
          ella, el monto del anterior se queda escrito y se registra de más. */}
      {moviendo && laCaja ? (
        <RegistrarMovimiento
          key={moviendo}
          abierto
          tipo={moviendo}
          efectivoDisponible={laCaja.efectivoEsperadoCentavos}
          quien={quien}
          trabajando={movimiento.trabajando}
          error={movimiento.error}
          onGuardar={(m) => {
            void movimiento.ejecutar(negocio, m).then((r) => {
              if (r !== null) setMoviendo(null);
            });
          }}
          onCerrar={() => setMoviendo(null)}
        />
      ) : null}

      {cortando && laCaja ? (
        <CorteDeCaja
          abierto
          caja={laCaja}
          trabajando={cierre.trabajando}
          error={cierre.error}
          onCerrarCaja={(contado, notas) => {
            void cierre.ejecutar(laCaja.id, contado, notas).then((r) => {
              if (r !== null) {
                setCortando(false);
                setAviso('La caja quedó cerrada. El corte está en el historial.');
              }
            });
          }}
          onCerrar={() => setCortando(false)}
        />
      ) : null}

      <HistorialDeCajas
        abierto={historialAbierto}
        cajas={historial.datos?.filas ?? []}
        total={historial.datos?.total ?? 0}
        pagina={paginaDelHistorial}
        porPagina={10}
        cargando={historialAbierto && historial.estado === 'cargando' && historial.datos === null}
        error={historial.error}
        onPagina={setPaginaDelHistorial}
        onCerrar={() => setHistorialAbierto(false)}
      />

      <ReportesDeCaja
        abierto={reportesAbiertos}
        desde={aCampo(desde)}
        hasta={aCampo(hasta)}
        metodo={metodoDelReporte}
        reporte={reporte.datos}
        cargando={reportesAbiertos && reporte.estado === 'cargando' && reporte.datos === null}
        error={reporte.error}
        onDesde={(v) => setDesde(deCampo(v, desde))}
        onHasta={(v) => setHasta(deCampo(v, hasta))}
        onMetodo={setMetodoDelReporte}
        onCerrar={() => setReportesAbiertos(false)}
      />
    </div>
  );
}
