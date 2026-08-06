/**
 * INICIO — el tablero.
 *
 * NO ES DUEÑO DE NI UN DATO. Cada cifra de esta pantalla vive en otro modulo y
 * aqui solo se pregunta y se resume. Si Inicio guardara su propio "citas de
 * hoy", ese numero se desincronizaria del de Agenda en cuestion de semanas y
 * la pantalla seguiria viendose perfectamente normal — que es lo que la hace
 * peligrosa.
 *
 * POR ESO ES EL BLOQUE 8 Y NO EL 1. Un resumen necesita que exista lo que
 * resume. Construirlo primero habria obligado a inventarle los datos.
 *
 * DE DONDE SALE CADA COSA:
 *   tarjetas, grafica y rankings → `resumen_inicio`, UN viaje para todo
 *   agenda de hoy               → las MISMAS citas que pide Agenda
 *   recordatorios               → la tabla de Recordatorios
 *
 * LO QUE TODAVIA NO EXISTE SE VE EN CERO PORQUE NO HAY REGISTROS, no porque
 * falte codigo. Ventas, Productos y Cursos llegan en sus bloques; el dia que
 * alguien capture el primero, estas tarjetas lo cuentan solas.
 *
 * EL ROL MANDA. Quien no puede ver finanzas no recibe la tarjeta de ventas ni
 * la grafica — y no es que se le escondan: `resumen_inicio` corre con SUS
 * permisos y la base no le entrega esos numeros aunque los pida a mano.
 */

import { hoy as hoyDe, type Fecha } from '@neron/base/utils';
import { useEffect, useMemo, useState } from 'react';
import { useNavegacion } from '@neron/base/marco';
import { llaveDeCitas, traerCitas, type CitaEnAgenda } from '../datos/citas.js';
import { useConsulta } from '../datos/consulta.js';
import {
  llaveDeIngresos,
  llaveDeRecordatorios,
  llaveDelResumen,
  periodosDeIngresos,
  traerIngresosPorDia,
  traerRecordatoriosCercanos,
  traerResumen,
  type ClaveDePeriodo,
  type DiaConIngreso,
  type RecordatorioCercano,
  type ResumenDeInicio,
} from '../datos/tablero.js';
import { useSesion } from '../identidad/sesion.js';
import { AccionesRapidas, type AccionRapida } from './acciones-rapidas.js';
import { AgendaDeHoy } from './agenda-de-hoy.js';
import { GraficaDeIngresos } from './grafica-de-ingresos.js';
import { ProductosMasVendidos, ServiciosMasVendidos } from './rankings.js';
import { RecordatoriosCercanos } from './recordatorios-cercanos.js';
import { encabezadoDeSaludo } from './saludo.js';
import { fechaLarga } from '../ui/fechas-en-palabras.js';
import { Tarjetas, type Destino } from './tarjetas.js';

/**
 * Cada cuanto se comprueba si ya cambio el dia o el saludo.
 *
 * UNA PESTAÑA SE QUEDA ABIERTA DIAS. Sin esto, la del mostrador amanece
 * diciendo "Buenas noches" y mostrando las citas de ayer bajo el titulo "Citas
 * hoy" — con toda la cara de estar al dia, que es lo grave.
 *
 * Un minuto no cuesta nada: solo compara dos textos y, si son iguales, React
 * ni siquiera vuelve a pintar.
 */
const CADA_MINUTO = 60_000;

function useElDiaDeHoy(): { readonly dia: Fecha; readonly momento: Date } {
  const [reloj, setReloj] = useState(() => ({ dia: hoyDe(), momento: new Date() }));

  useEffect(() => {
    const t = setInterval(() => {
      const ahora = new Date();
      const dia = hoyDe(ahora);
      setReloj((antes) =>
        // Solo se cambia el estado si de verdad cambio algo que se ve. Poner un
        // objeto nuevo cada minuto repintaria la pantalla entera sesenta veces
        // por hora sin que nada se viera distinto.
        antes.dia === dia && antes.momento.getHours() === ahora.getHours()
          ? antes
          : { dia, momento: ahora },
      );
    }, CADA_MINUTO);
    return () => clearInterval(t);
  }, []);

  return reloj;
}

export function Inicio() {
  const { acceso } = useSesion();
  const { ir } = useNavegacion();
  const { dia, momento } = useElDiaDeHoy();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  const puede = (c: string): boolean => permisos[c] === true;

  const verFinanzas = puede('verFinanzas');
  const verAgenda = puede('gestionarAgenda');
  const crearCitas = verAgenda;

  const [periodo, setPeriodo] = useState<ClaveDePeriodo>('estaSemana');
  const periodos = useMemo(() => periodosDeIngresos(dia), [dia]);

  /* --- Lo que se le pide al servidor -------------------------------- */

  const resumen = useConsulta<ResumenDeInicio>(
    negocio ? llaveDelResumen(negocio, dia) : null,
    () => traerResumen(negocio, dia),
  );

  /**
   * LA MISMA LLAVE QUE USA AGENDA para el dia de hoy sin filtros.
   *
   * No es casualidad ni ahorro de lineas: al compartir llave, abrir Inicio y
   * luego Agenda es UN viaje al servidor, y crear una cita en cualquiera de
   * las dos refresca la otra sin que nadie recargue la pagina.
   */
  const citas = useConsulta<CitaEnAgenda[]>(
    negocio && verAgenda ? llaveDeCitas(negocio, dia, dia) : null,
    () => traerCitas(negocio, dia, dia),
  );

  const recordatorios = useConsulta<RecordatorioCercano[]>(
    negocio ? llaveDeRecordatorios(negocio, dia) : null,
    () => traerRecordatoriosCercanos(negocio),
  );

  /**
   * La semana en curso YA VIENE en el resumen: no se vuelve a pedir.
   *
   * Solo los otros periodos cuestan un viaje mas, y solo cuando alguien los
   * escoge. Pedir siempre los tres seria pagar por adelantado dos consultas
   * que casi nadie mira.
   */
  const otro = periodos.find((p) => p.clave === periodo && p.clave !== 'estaSemana') ?? null;

  const ingresosDeOtroPeriodo = useConsulta<DiaConIngreso[]>(
    negocio && verFinanzas && otro ? llaveDeIngresos(negocio, otro.desde, otro.hasta) : null,
    () => traerIngresosPorDia(negocio, otro!.desde, otro!.hasta),
  );

  const dias: readonly DiaConIngreso[] = otro
    ? (ingresosDeOtroPeriodo.datos ?? [])
    : (resumen.datos?.ingresosSemana ?? []);

  const cargandoIngresos = otro
    ? ingresosDeOtroPeriodo.estado === 'cargando' && ingresosDeOtroPeriodo.datos === null
    : resumen.estado === 'cargando' && resumen.datos === null;

  /* --- A donde lleva cada cosa -------------------------------------- */

  const irA = (d: Destino): void =>
    ir(d.modulo, d.parametros ? { parametros: { ...d.parametros } } : {});

  const abrirCita = (c: CitaEnAgenda): void =>
    ir('agenda', { parametros: { fecha: c.fecha }, intencion: `agenda:abrir:${c.id}` });

  const nuevaCita = (): void =>
    ir('agenda', { parametros: { fecha: dia }, intencion: 'agenda:nueva' });

  const hacerAccion = (a: AccionRapida): void =>
    ir(a.modulo, a.intencion ? { intencion: a.intencion } : {});

  const abrirRecordatorio = (r: RecordatorioCercano): void =>
    ir('recordatorios', { intencion: `recordatorios:abrir:${r.id}` });

  const cargandoResumen = resumen.estado === 'cargando' && resumen.datos === null;

  return (
    <div className="ini">
      <header className="ini-encabezado">
        <h2 className="ini-encabezado__saludo">
          {encabezadoDeSaludo(acceso?.nombre, momento)}
        </h2>
        <p className="ini-encabezado__fecha">{fechaLarga(dia)}</p>
      </header>

      {resumen.error ? (
        <div className="ini-error ini-error--ancho" role="alert">
          <p className="ini-error__que">No pudimos cargar el resumen del día.</p>
          <p className="ini-error__detalle">{resumen.error}</p>
          <button type="button" className="ini-boton-suave" onClick={resumen.recargar}>
            Reintentar
          </button>
        </div>
      ) : null}

      <Tarjetas resumen={resumen.datos} permisos={permisos} hoy={dia} onIr={irA} />

      <div className={`ini-cuerpo${verFinanzas ? ' ini-cuerpo--completo' : ''}`}>
        {verAgenda ? (
          <AgendaDeHoy
            citas={citas.datos ?? []}
            cargando={citas.estado === 'cargando' && citas.datos === null}
            error={citas.error}
            puedeCrear={crearCitas}
            onReintentar={citas.recargar}
            onAbrir={abrirCita}
            onVerCalendario={() => ir('agenda', { parametros: { fecha: dia } })}
            onNueva={nuevaCita}
          />
        ) : null}

        {verFinanzas ? (
          <GraficaDeIngresos
            dias={dias}
            periodos={periodos}
            periodo={periodo}
            cargando={cargandoIngresos}
            error={otro ? ingresosDeOtroPeriodo.error : resumen.error}
            onCambiarPeriodo={setPeriodo}
            onReintentar={otro ? ingresosDeOtroPeriodo.recargar : resumen.recargar}
          />
        ) : null}

        {verFinanzas ? (
          <ServiciosMasVendidos
            servicios={resumen.datos?.topServicios ?? []}
            cargando={cargandoResumen}
            onVerTodos={() => ir('reportes', { parametros: { ranking: 'servicios' } })}
          />
        ) : null}

        {verFinanzas ? (
          <ProductosMasVendidos
            productos={resumen.datos?.topProductos ?? []}
            cargando={cargandoResumen}
            onVerTodos={() => ir('reportes', { parametros: { ranking: 'productos' } })}
          />
        ) : null}

        <RecordatoriosCercanos
          recordatorios={recordatorios.datos ?? []}
          hoy={dia}
          cargando={recordatorios.estado === 'cargando' && recordatorios.datos === null}
          error={recordatorios.error}
          onAbrir={abrirRecordatorio}
          onVerTodos={() => ir('recordatorios')}
          onReintentar={recordatorios.recargar}
        />
      </div>

      <AccionesRapidas permisos={permisos} onAccion={hacerAccion} />
    </div>
  );
}
