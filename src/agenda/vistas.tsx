/**
 * Las tres vistas del calendario: dia, semana y mes.
 *
 * Solo pintan. Donde va cada bloque lo decide `disposicion.ts` y que dias se
 * ven lo decide `rangos.ts` — las dos puras y probadas sin navegador.
 */

import { useEffect, useState, type ReactNode } from 'react';
import type { Fecha } from '@neron/base/utils';
import { Hoja } from '../marco/hoja.js';
import type { CitaEnAgenda } from '../datos/citas.js';
import { etiquetaDeEstado } from '../datos/citas.js';
import { colocar, horaDelClic, horasDe, lineaDeAhora, minutosDe } from './disposicion.js';
import { diasDe, esDelMes, esHoy, nombreDelDia } from './rangos.js';

export interface PropiedadesDeVista {
  readonly fecha: Fecha;
  readonly citas: readonly CitaEnAgenda[];
  readonly seleccionada: string | null;
  readonly abre: number;
  readonly cierra: number;
  onSeleccionar(cita: CitaEnAgenda): void;
  /** Tocar un hueco abre "Nueva cita" con esa fecha y hora ya puestas. */
  onHueco(fecha: Fecha, hora: string): void;
  onIrAlDia(fecha: Fecha): void;
}

const clasesDe = (c: CitaEnAgenda, puesta: boolean, compacta: boolean): string =>
  [
    'agenda-cita',
    compacta ? 'agenda-cita--compacta' : 'agenda-cita--ancha',
    `agenda-cita--${c.estado}`,
    // Una sesion de curso se ve DISTINTA de una cita: es otro tipo de evento,
    // y pintarlas igual hace que nadie distinga una clase de veinte personas
    // de una sesion individual.
    c.tipo === 'sesion' ? 'agenda-cita--curso' : '',
    puesta ? 'agenda-cita--puesta' : '',
  ]
    .filter(Boolean)
    .join(' ');

/**
 * El texto que oye quien usa lector de pantalla.
 *
 * Lleva TODO lo que en pantalla se ve por posicion y color: la hora, quien,
 * que servicio y en que estado. Sin esto, un bloque de color en una columna
 * no comunica absolutamente nada.
 */
const comoSeLee = (c: CitaEnAgenda): string =>
  (c.tipo === 'sesion'
    ? `Sesión de curso, ${c.horaInicio} a ${c.horaFin}, ${c.servicio}, ${c.cliente}`
    : `${c.horaInicio} a ${c.horaFin}, ${c.cliente}, ${c.servicio}, ${etiquetaDeEstado(c.estado)}`) +
  (c.profesional ? `, con ${c.profesional}` : '');

/* ------------------------------------------------------------------ */
/* La columna de un dia — la comparten dia y semana                    */
/* ------------------------------------------------------------------ */

function ColumnaDelDia({
  dia,
  citas,
  seleccionada,
  abre,
  cierra,
  ahora,
  onSeleccionar,
  onHueco,
  compacta = false,
}: {
  readonly dia: Fecha;
  readonly citas: readonly CitaEnAgenda[];
  readonly seleccionada: string | null;
  readonly abre: number;
  readonly cierra: number;
  readonly ahora: Date;
  onSeleccionar(c: CitaEnAgenda): void;
  onHueco(f: Fecha, h: string): void;
  /** La semana aprieta cinco columnas: cabe menos texto y ningun icono. */
  readonly compacta?: boolean;
}) {
  const puestas = colocar(citas, abre, cierra);
  const linea = esHoy(dia, ahora) ? lineaDeAhora(ahora, abre, cierra) : null;
  /*
   * CUANTO MIDE UN MINUTO EN ESTA COLUMNA. Sirve para pintar la franja de
   * preparacion con la misma escala que los bloques, sin recalcular la ventana
   * dentro del bucle.
   */
  const porMinuto = 100 / Math.max(1, cierra - abre);

  return (
    <div
      className="agenda-columna"
      onClick={(e) => {
        // Solo cuenta el clic en el FONDO. Si contara también sobre un bloque,
        // tocar una cita abriría "Nueva cita" encima del detalle.
        if (e.target !== e.currentTarget) return;
        const caja = e.currentTarget.getBoundingClientRect();
        onHueco(dia, horaDelClic((e.clientY - caja.top) / caja.height, abre, cierra));
      }}
    >
      {/*
        LA FRANJA DE PREPARACION, rayada y sin poder tocarse.

        No es adorno: es la respuesta a "por que no puedo agendar a las 11:00
        si la sesion termina a las 11:00". Ese rato la sala esta ocupada
        limpiando y preparando, la base se niega a poner nada ahi, y hasta
        ahora la pantalla no daba ninguna pista de por que.

        Va DEBAJO del bloque de la cita —se pinta antes— y con `aria-hidden`:
        quien navega con lector de pantalla ya lo escucha en el panel, y una
        franja repetida por cada cita seria ruido.
      */}
      {puestas.map(({ cita, arriba, alto, carril, carriles }) =>
        cita.preparacionAntesMin > 0 || cita.preparacionDespuesMin > 0 ? (
          <span
            key={`prep:${cita.id}`}
            className="agenda-preparacion"
            aria-hidden="true"
            style={{
              top: `${arriba - cita.preparacionAntesMin * porMinuto}%`,
              height: `${alto + (cita.preparacionAntesMin + cita.preparacionDespuesMin) * porMinuto}%`,
              left: `${(carril / carriles) * 100}%`,
              width: `${(1 / carriles) * 100}%`,
            }}
          />
        ) : null,
      )}

      {puestas.map(({ cita, arriba, alto, carril, carriles }) => (
        <button
          key={cita.id}
          type="button"
          className={clasesDe(cita, cita.id === seleccionada, compacta)}
          style={{
            top: `${arriba}%`,
            height: `${alto}%`,
            left: `${(carril / carriles) * 100}%`,
            width: `${(1 / carriles) * 100}%`,
          }}
          aria-label={comoSeLee(cita)}
          aria-pressed={cita.id === seleccionada}
          onClick={() => onSeleccionar(cita)}
        >
          {/*
            La hoja de la marca, teñida del color del estado.
            El diseño pone un dibujo distinto por terapia; los servicios los
            captura cada centro, asi que no hay forma de saber que dibujo le
            toca a uno nuevo sin inventarselo. Una sola marca teñida da el
            mismo golpe de vista y no miente.
          */}
          {!compacta ? (
            <span className="agenda-cita__marca" aria-hidden="true">
              <Hoja pequena />
            </span>
          ) : null}

          {/*
            DOS RENGLONES, NO TRES. El alto del bloque lo fija la DURACION de la
            cita —media hora son cincuenta y tres pixeles— y tres renglones de
            texto piden sesenta y dos: el nombre del servicio salia cortado por
            la mitad, tapado por el borde de abajo. Con la hora y el nombre en el
            mismo renglon caben los dos y ya no se recorta nada.
          */}
          <span className="agenda-cita__cuerpo">
            {/* En 24 horas, como el diseño. "09:00 a. m. – 10:00 a. m." ocupa
                el doble en un bloque que ya va apretado, y en una agenda de
                trabajo nadie duda de si las nueve son de la mañana. */}
            <span className="agenda-cita__linea">
            <span className="agenda-cita__hora">
              {cita.horaInicio} – {cita.horaFin}
            </span>
            <span className="agenda-cita__quien">{cita.cliente}</span>
            </span>
            {!compacta ? <span className="agenda-cita__que">{cita.servicio}</span> : null}
          </span>

          {/* El estado va con PALABRA, no solo con el color del bloque. En una
              sesion de curso la palabra es "Curso": su estado propio se
              administra en Cursos, y enseñar "Confirmada" aqui haria pensar
              que se confirma como una cita. */}
          <span
            className={`agenda-cita__estado agenda-estado--${cita.estado}${
              cita.tipo === 'sesion' ? ' agenda-estado--curso' : ''
            }`}
          >
            {cita.tipo === 'sesion' ? 'Curso' : etiquetaDeEstado(cita.estado)}
          </span>
        </button>
      ))}

      {linea ? (
        <div className="agenda-ahora" style={{ top: `${linea.arriba}%` }} aria-hidden="true">
          {/* La hora se escribe SOBRE la regla de la izquierda, como en el
              diseño, y el punto marca donde empieza la linea. */}
          <span className="agenda-ahora__hora">{linea.hora}</span>
          <span className="agenda-ahora__punto" />
        </div>
      ) : null}
    </div>
  );
}

/** La regla de horas de la izquierda. */
function Regla({ abre, cierra }: { readonly abre: number; readonly cierra: number }) {
  const horas = horasDe(abre, cierra);
  const ventana = Math.max(1, cierra - abre);
  return (
    <div className="agenda-regla" aria-hidden="true">
      {horas.map((h) => (
        <span
          key={h}
          className="agenda-regla__marca"
          style={{ top: `${(((minutosDe(h) ?? abre) - abre) / ventana) * 100}%` }}
        >
          {h}
        </span>
      ))}
    </div>
  );
}

/** Las lineas horizontales del fondo. Decoracion pura. */
function Rejilla({ abre, cierra }: { readonly abre: number; readonly cierra: number }) {
  const horas = horasDe(abre, cierra);
  const ventana = Math.max(1, cierra - abre);
  return (
    <div className="agenda-rejilla" aria-hidden="true">
      {horas.map((h) => (
        <div
          key={h}
          className="agenda-rejilla__linea"
          style={{ top: `${(((minutosDe(h) ?? abre) - abre) / ventana) * 100}%` }}
        />
      ))}
    </div>
  );
}

/** Un reloj que avanza sin repintar toda la pantalla cada segundo. */
function useAhora(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    // Cada 30 segundos: la linea se mueve medio pixel y no se nota, pero
    // repintar cada segundo gasta bateria para nada en una pantalla que
    // alguien deja abierta ocho horas.
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

/* ------------------------------------------------------------------ */
/* Vista de dia                                                        */
/* ------------------------------------------------------------------ */

export function VistaDia(p: PropiedadesDeVista) {
  const ahora = useAhora();
  const delDia = p.citas.filter((c) => c.fecha === p.fecha);

  return (
    <div className="agenda-lienzo">
      <div className="agenda-lienzo__encabezado">
        <span className="agenda-lienzo__hueco" />
        <span className={`agenda-dia__titulo${esHoy(p.fecha, ahora) ? ' agenda-dia__titulo--hoy' : ''}`}>
          {nombreDelDia(p.fecha)} {p.fecha.slice(0, 2)}
        </span>
      </div>
      <div className="agenda-lienzo__cuerpo">
        <Regla abre={p.abre} cierra={p.cierra} />
        <div className="agenda-lienzo__pista">
          <Rejilla abre={p.abre} cierra={p.cierra} />
          <ColumnaDelDia
            dia={p.fecha}
            citas={delDia}
            seleccionada={p.seleccionada}
            abre={p.abre}
            cierra={p.cierra}
            ahora={ahora}
            onSeleccionar={p.onSeleccionar}
            onHueco={p.onHueco}
          />
        </div>
      </div>
      {delDia.length === 0 ? (
        <p className="agenda-vacio">No hay citas para este día.</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vista de semana                                                     */
/* ------------------------------------------------------------------ */

export function VistaSemana(p: PropiedadesDeVista) {
  const ahora = useAhora();
  const dias = diasDe('semana', p.fecha);

  return (
    <div className="agenda-lienzo">
      <div className="agenda-lienzo__encabezado">
        <span className="agenda-lienzo__hueco" />
        {dias.map((d) => (
          <button
            key={d}
            type="button"
            className={`agenda-dia__titulo agenda-dia__titulo--tocable${esHoy(d, ahora) ? ' agenda-dia__titulo--hoy' : ''}`}
            onClick={() => p.onIrAlDia(d)}
          >
            <span className="agenda-dia__nombre">{nombreDelDia(d)?.slice(0, 3)}</span>
            <span className="agenda-dia__numero">{d.slice(0, 2)}</span>
          </button>
        ))}
      </div>
      <div className="agenda-lienzo__cuerpo">
        <Regla abre={p.abre} cierra={p.cierra} />
        <div className="agenda-lienzo__pista agenda-lienzo__pista--semana">
          <Rejilla abre={p.abre} cierra={p.cierra} />
          {dias.map((d) => (
            <ColumnaDelDia
              key={d}
              dia={d}
              citas={p.citas.filter((c) => c.fecha === d)}
              seleccionada={p.seleccionada}
              abre={p.abre}
              cierra={p.cierra}
              ahora={ahora}
              onSeleccionar={p.onSeleccionar}
              onHueco={p.onHueco}
              compacta
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vista de mes                                                        */
/* ------------------------------------------------------------------ */

const CUANTAS_CABEN = 3;

export function VistaMes(p: PropiedadesDeVista) {
  const ahora = useAhora();
  const dias = diasDe('mes', p.fecha);

  return (
    <div className="agenda-mes">
      <div className="agenda-mes__encabezado" aria-hidden="true">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <span key={d} className="agenda-mes__dia-semana">{d}</span>
        ))}
      </div>
      <div className="agenda-mes__cuadricula">
        {dias.map((d) => {
          const delDia = p.citas.filter((c) => c.fecha === d);
          const sobran = delDia.length - CUANTAS_CABEN;
          return (
            <div
              key={d}
              className={[
                'agenda-mes__celda',
                esDelMes(d, p.fecha) ? '' : 'agenda-mes__celda--fuera',
                esHoy(d, ahora) ? 'agenda-mes__celda--hoy' : '',
              ].filter(Boolean).join(' ')}
            >
              <button
                type="button"
                className="agenda-mes__numero"
                onClick={() => p.onIrAlDia(d)}
                aria-label={`Ver el ${d}, ${delDia.length} citas`}
              >
                {d.slice(0, 2)}
              </button>
              {delDia.slice(0, CUANTAS_CABEN).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`agenda-mes__cita agenda-cita--${c.estado}`}
                  aria-label={comoSeLee(c)}
                  onClick={() => p.onSeleccionar(c)}
                >
                  <span className="agenda-mes__hora">{c.horaInicio}</span> {c.cliente}
                </button>
              ))}
              {sobran > 0 ? (
                // No se aprietan seis citas en una casilla de mes: se dice
                // cuantas faltan y se abre el dia, que es donde caben.
                <button type="button" className="agenda-mes__mas" onClick={() => p.onIrAlDia(d)}>
                  +{sobran} más
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * La leyenda de estados.
 *
 * Estan los CINCO, no los cuatro del diseño: "No asistió" existe aparte de
 * "Cancelada" porque para el negocio no son lo mismo —una se reagenda, la otra
 * ya costó— y dejarlo fuera de la leyenda haria que su color no significara
 * nada para quien lo ve por primera vez.
 */
export function Leyenda(): ReactNode {
  return (
    <ul className="agenda-leyenda">
      {['confirmada', 'pendiente', 'cancelada', 'completada', 'no_asistio'].map((e) => (
        <li key={e} className="agenda-leyenda__punto">
          <span className={`agenda-leyenda__color agenda-punto--${e}`} aria-hidden="true" />
          {etiquetaDeEstado(e)}
        </li>
      ))}
    </ul>
  );
}
