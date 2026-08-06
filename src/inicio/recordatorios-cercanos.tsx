/**
 * LOS RECORDATORIOS QUE URGEN.
 *
 * SE ORDENAN POR FECHA, NO POR PRIORIDAD. Uno de prioridad alta para dentro de
 * tres semanas no es lo que hay que hacer hoy; uno normal que vencio
 * anteayer si. La prioridad se muestra, pero no manda en el orden.
 *
 * CADA UNO SABE DE DONDE SALIO. La base guarda `entidad_tipo` y `entidad_id`
 * desde el bloque 0, asi que un recordatorio nacido de una cita puede abrir esa
 * cita. Un recordatorio que solo lleva el texto "recordar la cita" es texto
 * muerto: no se puede abrir nada, ni saber si esa cita ya se cancelo.
 */

import { diasEntre, esFecha, type Fecha } from '@neron/base/utils';
import type { EntidadDeRecordatorio, RecordatorioCercano } from '../datos/tablero.js';
import { Icono, type NombreDeIcono } from './iconos.js';

export type Urgencia = 'vencido' | 'hoy' | 'proximo';

/**
 * Que tan urgente es, contado en dias contra hoy.
 *
 * Se compara texto de fecha contra texto de fecha con la aritmetica de la
 * base. Pasarlo por `new Date` es lo que hace que un recordatorio de hoy
 * aparezca como vencido para quien abre el sistema desde otra zona horaria.
 */
export function urgenciaDe(fecha: Fecha, hoy: Fecha): Urgencia {
  /**
   * Una fecha ilegible cae en "proximo", nunca en "vencido" ni en "hoy".
   *
   * `diasEntre` con texto que no es fecha devuelve cero, y cero significa
   * "hoy": un renglon con la fecha corrupta se pintaria en ambar gritando que
   * urge. Se prefiere que un dato roto pase desapercibido a que dispare una
   * alarma falsa — una alarma falsa enseña a ignorar las de verdad.
   */
  if (!esFecha(fecha) || !esFecha(hoy)) return 'proximo';
  const dias = diasEntre(hoy, fecha);
  if (!Number.isFinite(dias)) return 'proximo';
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'hoy';
  return 'proximo';
}

export function comoSeLlamaLaUrgencia(u: Urgencia): string {
  if (u === 'vencido') return 'Vencido';
  if (u === 'hoy') return 'Hoy';
  return 'Próximo';
}

/** El icono dice de que modulo nacio. Sin entidad, un reloj. */
export function iconoDeEntidad(tipo: EntidadDeRecordatorio | null): NombreDeIcono {
  if (tipo === 'cliente') return 'persona';
  if (tipo === 'cita') return 'calendario';
  if (tipo === 'venta') return 'bolsa';
  if (tipo === 'curso') return 'birrete';
  if (tipo === 'producto') return 'paquete';
  return 'reloj';
}

export interface PropiedadesDeRecordatorios {
  readonly recordatorios: readonly RecordatorioCercano[];
  readonly hoy: Fecha;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly onAbrir: (r: RecordatorioCercano) => void;
  readonly onVerTodos: () => void;
  readonly onReintentar: () => void;
}

export function RecordatoriosCercanos({
  recordatorios,
  hoy,
  cargando,
  error,
  onAbrir,
  onVerTodos,
  onReintentar,
}: PropiedadesDeRecordatorios) {
  return (
    <section className="ini-panel ini-recordatorios" aria-labelledby="ini-recordatorios-titulo">
      <header className="ini-panel__barra">
        <h3 className="ini-panel__titulo" id="ini-recordatorios-titulo">
          Recordatorios
        </h3>
        <button type="button" className="ini-panel__enlace" onClick={onVerTodos}>
          Ver todos
        </button>
      </header>

      {error ? (
        <div className="ini-error" role="alert">
          <p className="ini-error__que">No pudimos cargar los recordatorios.</p>
          <p className="ini-error__detalle">{error}</p>
          <button type="button" className="ini-boton-suave" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="ini-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los recordatorios</span>
          {[0, 1].map((i) => (
            <div key={i} className="terapias-silueta ini-cargando__renglon" />
          ))}
        </div>
      ) : recordatorios.length === 0 ? (
        <p className="ini-vacio">No tienes recordatorios pendientes.</p>
      ) : (
        <ul className="ini-recordatorios__lista">
          {recordatorios.map((r) => {
            const urgencia = urgenciaDe(r.fecha, hoy);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className={`ini-recordatorio ini-recordatorio--${urgencia}`}
                  onClick={() => onAbrir(r)}
                >
                  <span className="ini-recordatorio__icono" aria-hidden="true">
                    <Icono nombre={iconoDeEntidad(r.entidadTipo)} lado={18} />
                  </span>
                  <span className="ini-recordatorio__texto">
                    <span className="ini-recordatorio__titulo">{r.titulo}</span>
                    {r.detalle ? (
                      <span className="ini-recordatorio__detalle">{r.detalle}</span>
                    ) : null}
                  </span>
                  {/* La urgencia va con PALABRA, no solo con el tono del
                      renglon: quien no distingue los colores tambien tiene que
                      saber cual ya vencio. */}
                  <span className="ini-recordatorio__cuando">
                    {comoSeLlamaLaUrgencia(urgencia)}
                  </span>
                  <span className="ini-recordatorio__flecha" aria-hidden="true">
                    <Icono nombre="flecha" lado={16} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
