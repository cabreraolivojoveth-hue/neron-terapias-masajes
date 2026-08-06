/**
 * LA AGENDA DE HOY, dentro de Inicio.
 *
 * NO ES OTRA AGENDA. Pide las mismas citas por la misma via que el modulo
 * Agenda —`traerCitas` con la misma llave de cache—, asi que abrir Inicio y
 * abrir Agenda en el dia de hoy es UN viaje al servidor, no dos, y crear una
 * cita refresca las dos pantallas sin que nadie apriete F5.
 *
 * LOS NOMBRES NO SE GUARDAN AQUI. Cada renglon lleva `clienteId` y
 * `servicioId`; el nombre se resuelve al leer, en la base. El dia que una
 * paciente se cambie el apellido, esta lista lo muestra al dia sin tocar una
 * linea — porque nunca guardo una copia.
 *
 * SE ESCONDEN LAS CANCELADAS, y hay una razon concreta: la tarjeta de arriba
 * dice "Citas hoy" contando lo que NO esta cancelado. Si la lista las
 * mostrara, el numero y la lista dirian cosas distintas en la misma pantalla,
 * y quien la mira concluye —con razon— que una de las dos esta mal.
 */

import { hora24aLegible } from '@neron/base/utils';
import type { CitaEnAgenda } from '../datos/citas.js';
import { etiquetaDeEstado } from '../datos/citas.js';
import { Icono } from './iconos.js';

/**
 * Las iniciales, para el circulo del renglon.
 *
 * NO HAY FOTOS DE PACIENTES en el sistema: la tabla `cliente` no guarda
 * ninguna, y ponerlas de adorno seria inventar. Dos letras identifican igual
 * de bien en una lista de seis y no pesan nada.
 */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '·';
  const primera = palabras[0]?.[0] ?? '';
  const segunda = palabras.length > 1 ? (palabras[1]?.[0] ?? '') : '';
  return (primera + segunda).toUpperCase();
}

/** Lo que se pinta: sin canceladas y en orden de reloj. */
export function citasParaHoy(citas: readonly CitaEnAgenda[]): CitaEnAgenda[] {
  return citas
    .filter((c) => c.estado !== 'cancelada')
    .slice()
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
}

export interface PropiedadesDeAgendaDeHoy {
  readonly citas: readonly CitaEnAgenda[];
  readonly cargando: boolean;
  readonly error: string | null;
  readonly puedeCrear: boolean;
  readonly onReintentar: () => void;
  readonly onAbrir: (cita: CitaEnAgenda) => void;
  readonly onVerCalendario: () => void;
  readonly onNueva: () => void;
}

export function AgendaDeHoy({
  citas,
  cargando,
  error,
  puedeCrear,
  onReintentar,
  onAbrir,
  onVerCalendario,
  onNueva,
}: PropiedadesDeAgendaDeHoy) {
  const lista = citasParaHoy(citas);

  return (
    <section className="ini-panel ini-agenda" aria-labelledby="ini-agenda-titulo">
      <header className="ini-panel__barra">
        <h3 className="ini-panel__titulo" id="ini-agenda-titulo">
          Agenda de hoy
        </h3>
        <button type="button" className="ini-panel__enlace" onClick={onVerCalendario}>
          Ver calendario
        </button>
      </header>

      {error ? (
        <div className="ini-error" role="alert">
          <p className="ini-error__que">No pudimos cargar la agenda de hoy.</p>
          <p className="ini-error__detalle">{error}</p>
          <button type="button" className="ini-boton-suave" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        // Siluetas, NO una lista vacia. Una lista vacia mientras carga le dice
        // a la persona que hoy no tiene citas, y todavia no se sabe.
        <div className="ini-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando las citas de hoy</span>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="terapias-silueta ini-cargando__renglon" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <p className="ini-vacio">No hay citas programadas para hoy.</p>
      ) : (
        <ul className="ini-agenda__lista">
          {lista.map((c) => (
            <li key={c.id}>
              <button type="button" className="ini-cita" onClick={() => onAbrir(c)}>
                <span className="ini-cita__horas">
                  <span className="ini-cita__inicio">{hora24aLegible(c.horaInicio)}</span>
                  <span className="ini-cita__fin">{hora24aLegible(c.horaFin)}</span>
                </span>
                <span className="ini-cita__inicial" aria-hidden="true">
                  {iniciales(c.cliente)}
                </span>
                <span className="ini-cita__quien">
                  <span className="ini-cita__nombre">{c.cliente}</span>
                  <span className="ini-cita__servicio">{c.servicio}</span>
                </span>
                {/* El estado lleva SIEMPRE la palabra escrita, no solo el
                    color: una de cada doce personas no distingue el verde del
                    ambar, y con el sol encima no lo distingue nadie. */}
                <span className={`ini-cita__estado ini-cita__estado--${c.estado}`}>
                  {etiquetaDeEstado(c.estado)}
                </span>
                <span className="ini-cita__flecha" aria-hidden="true">
                  <Icono nombre="flecha" lado={16} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {puedeCrear ? (
        <button type="button" className="ini-agenda__nueva" onClick={onNueva}>
          <Icono nombre="mas" lado={16} />
          <span>Nueva cita</span>
        </button>
      ) : null}
    </section>
  );
}
