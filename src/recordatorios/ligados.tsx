/**
 * LOS RECORDATORIOS DE UNA COSA — lo que ven los DEMAS modulos.
 *
 * ESTA ES LA MITAD DE LA CONEXION QUE CASI SIEMPRE FALTA. Poder abrir el
 * paciente desde el recordatorio es lo facil y lo que se hace primero; poder ver
 * los recordatorios desde el expediente del paciente es lo que hace que el
 * modulo sirva de verdad. Sin esta pieza, quien abre una ficha no tiene forma de
 * saber que hay algo pendiente con esa persona, y el recordatorio solo existe
 * para quien se acuerde de ir a buscarlo.
 *
 * VIVE EN `recordatorios/` Y SE MONTA DESDE FUERA. Al reves —cada modulo
 * escribiendose su propia listita— serian seis listas parecidas y ninguna igual,
 * que es el error mas caro que ya pago este proyecto.
 *
 * NO ES DUEÑO DE NADA NI SABE NAVEGAR. Recibe a que entidad mira y avisa
 * hacia arriba cuando alguien toca algo: quien lo monta decide si abre el modulo
 * de Recordatorios o el detalle de la ficha.
 */

import type { Fecha } from '@neron/base/utils';
import {
  COMO_SE_DICE_LA_PRIORIDAD,
  type EntidadDeRecordatorio,
  type RecordatorioLigado,
} from '../datos/recordatorios.js';
import { Icono } from '../ui/iconos.js';
import { cuandoEnPalabras, etiquetaDeEstado } from './plazos.js';

export interface PropiedadesDeLigados {
  readonly tipo: EntidadDeRecordatorio;
  /** Como se llama esa cosa, para que el vacio se lea bien. */
  readonly deQuien: string;
  readonly recordatorios: readonly RecordatorioLigado[];
  readonly hoy: Fecha;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly puedeGestionar: boolean;
  onAbrir(id: string): void;
  onNuevo(): void;
  onVerTodos(): void;
  onReintentar(): void;
}

export function RecordatoriosLigados({
  deQuien,
  recordatorios,
  hoy,
  cargando,
  error,
  puedeGestionar,
  onAbrir,
  onNuevo,
  onVerTodos,
  onReintentar,
}: PropiedadesDeLigados) {
  return (
    <section className="pz-tarjeta" aria-labelledby="rec-ligados-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="rec-ligados-titulo">
          Recordatorios
        </h3>
        {puedeGestionar ? (
          <button type="button" className="pz-enlace pz-enlace--pelado" onClick={onNuevo}>
            <Icono nombre="mas" lado={14} /> Nuevo
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar los recordatorios.</p>
          <p className="pz-error__detalle">{error}</p>
          <button type="button" className="pz-boton" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los recordatorios</span>
          <div className="pz-silueta" />
        </div>
      ) : recordatorios.length === 0 ? (
        // EL VACIO DICE DE QUIEN ESTA HABLANDO. "No hay recordatorios" a secas,
        // dentro de un expediente, hace dudar de si mira a esta persona o al
        // centro entero.
        <p className="pz-vacio__texto">No hay nada pendiente con {deQuien}.</p>
      ) : (
        <>
          <ul className="pz-lista mv-escalonado">
            {recordatorios.map((r) => {
              const estado = etiquetaDeEstado(r.estado, r.fecha, hoy);
              return (
                <li key={r.id}>
                  <button type="button" className="pz-renglon" onClick={() => onAbrir(r.id)}>
                    <span className="pz-renglon__cuerpo">
                      <span className="pz-renglon__titulo">{r.titulo}</span>
                      <span className="pz-renglon__pie">
                        {cuandoEnPalabras(r.fecha, r.hora)}
                        {r.responsable ? ` · ${r.responsable}` : ''}
                        {r.prioridad !== 'normal'
                          ? ` · ${COMO_SE_DICE_LA_PRIORIDAD[r.prioridad]}`
                          : ''}
                      </span>
                    </span>
                    <span className={`pz-pastilla pz-pastilla--${estado.tono}`}>
                      {estado.texto}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="pz-enlace pz-enlace--pelado" onClick={onVerTodos}>
            Ver en Recordatorios
          </button>
        </>
      )}
    </section>
  );
}
