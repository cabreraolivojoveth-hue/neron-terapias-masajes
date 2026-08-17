/**
 * LA NAVEGACION DEL HISTORIAL: mes → semana → día → ventas.
 *
 * POR QUE EXISTE. El historial junta cientos de ventas —quinientas setenta y
 * nueve en un centro con medio año de uso— y hasta ahora solo se podía recorrer
 * de diez en diez o buscar por texto. Buscar sirve cuando ya se sabe QUÉ se
 * busca; para "a ver cómo fue la segunda semana de agosto" no sirve, y bajar
 * por quinientos renglones tampoco.
 *
 * EL BUSCADOR SE QUEDA Y NO COMPITE. Son dos preguntas distintas: "dónde está
 * la venta de fulano" y "cómo fue esa semana". Cuando hay algo escrito en el
 * buscador, este panel se aparta —lo decide quien lo monta— porque una búsqueda
 * ya es un recorte y dos recortes encima se leen como una lista vacía.
 *
 * NO ES UN ARBOL DE CASILLAS QUE SE ABREN Y SE QUEDAN ABIERTAS. Es una ruta:
 * un nivel a la vez, con miga de pan para volver. Con todo desplegado a la vez
 * se vuelve al mismo muro de renglones que este panel existe para evitar.
 *
 * LO QUE SE PINTA SALE DE `ventas_por_dia`: un renglón por día CON ventas. Un
 * mes sin nada no aparece — la lista dice lo que hay, no lo que podría haber.
 */

import { formatearDinero } from '../datos/moneda.js';
import type { Fecha } from '@neron/base/utils';
import type { DiaConVentas } from '../datos/ventas.js';
import { Icono } from '../ui/iconos.js';
import { comoSeCuentan, mesesDelHistorial } from './periodos-del-historial.js';

export interface DondeEstoy {
  /** `aaaa-mm`. Vacío = se están viendo los meses. */
  readonly mes: string;
  /** La clave de la semana. Vacío = se están viendo las semanas del mes. */
  readonly semana: string;
  /** El día escogido, `dd/mm/aaaa`. Vacío = no hay día escogido. */
  readonly dia: Fecha | '';
}

export const EN_NINGUN_LADO: DondeEstoy = { mes: '', semana: '', dia: '' };

export interface PropiedadesDelCalendario {
  readonly dias: readonly DiaConVentas[];
  readonly donde: DondeEstoy;
  readonly cargando: boolean;
  onIr(donde: DondeEstoy): void;
}

/** Un renglón del nivel que toque: mes, semana o día. */
function Escalon({
  titulo,
  pie,
  importe,
  puesto,
  onIr,
}: {
  readonly titulo: string;
  readonly pie: string;
  readonly importe: number;
  readonly puesto: boolean;
  onIr(): void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`vta-escalon${puesto ? ' vta-escalon--puesto' : ''}`}
        aria-pressed={puesto}
        onClick={onIr}
      >
        <span className="vta-escalon__cuerpo">
          <span className="vta-escalon__titulo">{titulo}</span>
          <span className="vta-escalon__pie">{pie}</span>
        </span>
        {/* El importe va a la derecha y alineado: es lo que deja comparar dos
            semanas de un vistazo sin leer los números uno por uno. */}
        <span className="vta-escalon__importe">{formatearDinero(importe)}</span>
        <span className="vta-escalon__flecha" aria-hidden="true">›</span>
      </button>
    </li>
  );
}

export function CalendarioDelHistorial({
  dias,
  donde,
  cargando,
  onIr,
}: PropiedadesDelCalendario) {
  const meses = mesesDelHistorial(dias);
  const mes = meses.find((m) => m.clave === donde.mes) ?? null;
  const semana = mes?.semanas.find((s) => s.clave === donde.semana) ?? null;

  if (cargando) {
    return (
      <section className="pz-tarjeta vta-calendario" aria-label="Periodos del historial">
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los periodos</span>
          <div className="pz-silueta" />
        </div>
      </section>
    );
  }

  if (meses.length === 0) {
    /* NO se pinta una tarjeta vacía: la lista de ventas de al lado ya dice que
       no hay nada, y dos avisos de lo mismo se leen como dos problemas. */
    return null;
  }

  return (
    <section className="pz-tarjeta vta-calendario" aria-label="Periodos del historial">
      {/*
        LA MIGA DE PAN ES LA FORMA DE VOLVER, y va arriba del todo.
        Sin ella, bajar tres niveles deja sin salida más que recargar — y en
        una lista jerárquica perderse un nivel es lo primero que pasa.
      */}
      <nav className="vta-miga" aria-label="Dónde estás">
        <button
          type="button"
          className="vta-miga__paso"
          onClick={() => onIr(EN_NINGUN_LADO)}
          disabled={!mes}
        >
          Todo
        </button>
        {mes ? (
          <>
            <span className="vta-miga__separa" aria-hidden="true">›</span>
            <button
              type="button"
              className="vta-miga__paso"
              onClick={() => onIr({ mes: mes.clave, semana: '', dia: '' })}
              disabled={!semana}
            >
              {mes.etiqueta}
            </button>
          </>
        ) : null}
        {semana ? (
          <>
            <span className="vta-miga__separa" aria-hidden="true">›</span>
            <button
              type="button"
              className="vta-miga__paso"
              onClick={() => onIr({ mes: mes!.clave, semana: semana.clave, dia: '' })}
              disabled={donde.dia === ''}
            >
              {semana.etiqueta}
            </button>
          </>
        ) : null}
      </nav>

      <ul className="pz-lista vta-escalones mv-escalonado">
        {!mes
          ? meses.map((m) => (
              <Escalon
                key={m.clave}
                titulo={m.etiqueta}
                pie={comoSeCuentan(m.cuantas)}
                importe={m.totalCentavos}
                puesto={false}
                onIr={() => onIr({ mes: m.clave, semana: '', dia: '' })}
              />
            ))
          : !semana
            ? mes.semanas.map((s) => (
                <Escalon
                  key={s.clave}
                  titulo={s.etiqueta}
                  // El rango va en el pie porque es lo que de verdad ubica:
                  // "Semana 2" sin fechas no le dice nada a nadie.
                  pie={`${s.rango} · ${comoSeCuentan(s.cuantas)}`}
                  importe={s.totalCentavos}
                  puesto={false}
                  onIr={() => onIr({ mes: mes.clave, semana: s.clave, dia: '' })}
                />
              ))
            : semana.dias.map((d) => (
                <Escalon
                  key={d.fecha}
                  titulo={d.etiqueta}
                  pie={`${d.fecha} · ${comoSeCuentan(d.cuantas)}`}
                  importe={d.totalCentavos}
                  puesto={donde.dia === d.fecha}
                  onIr={() =>
                    onIr({
                      // Volver a tocar el día que ya está puesto lo QUITA. Es la
                      // salida más corta de un filtro, y la que se busca cuando
                      // uno se dio cuenta de que era otro día.
                      mes: mes.clave,
                      semana: semana.clave,
                      dia: donde.dia === d.fecha ? '' : d.fecha,
                    })
                  }
                />
              ))}
      </ul>

      {donde.dia ? (
        <p className="vta-calendario__nota" role="status">
          <span className="vta-calendario__icono" aria-hidden="true">
            <Icono nombre="calendario" lado={14} />
          </span>
          Viendo solo las ventas del {donde.dia}.
        </p>
      ) : null}
    </section>
  );
}
