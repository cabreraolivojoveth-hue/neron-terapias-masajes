/**
 * LAS REPETICIONES — las REGLAS, no los recordatorios que producen.
 *
 * POR QUE TIENEN SU PROPIA PESTAÑA Y NO SE MEZCLAN CON LA LISTA: una regla
 * semanal no es un pendiente. No tiene fecha de vencimiento, no se completa y
 * no se pospone; lo que se completa son las ocurrencias que va creando. Verlas
 * juntas hacía que alguien "completara la regla" creyendo que cerraba el
 * recordatorio de esta semana, y con eso apagaba las cincuenta y una siguientes.
 *
 * PAUSAR NO ES BORRAR, y por eso hay tres estados. Una regla pausada deja de
 * generar y se puede volver a encender sin tener que acordarse de cómo estaba
 * configurada. Borrarla y rehacerla es como se pierde el "cada segundo martes".
 *
 * LO QUE YA GENERO SE QUEDA. Pausar la regla no toca los recordatorios que ya
 * creó: son pendientes de verdad que alguien tiene que atender o cancelar a
 * mano.
 */

import type { Fecha } from '@neron/base/utils';
import {
  COMO_SE_DICE_LA_REPETICION,
  type EstadoDeRepeticion,
  type RepeticionDeRecordatorio,
} from '../datos/recordatorios.js';
import { Icono } from '../ui/iconos.js';
import { MenuDeAcciones } from '../ui/menu.js';
import { repeticionEnPalabras, topeEnPalabras } from './plazos.js';

/** El tono de la pastilla de cada estado de regla. */
export const TONO_DE_LA_REPETICION: Readonly<Record<EstadoDeRepeticion, string>> = {
  activo: 'exito',
  pausado: 'aviso',
  finalizado: 'marca',
};

export interface PropiedadesDeRepeticiones {
  readonly repeticiones: readonly RepeticionDeRecordatorio[];
  readonly hoy: Fecha;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly puedeGestionar: boolean;
  onNueva(): void;
  onEditar(r: RepeticionDeRecordatorio): void;
  onMarcar(r: RepeticionDeRecordatorio, estado: EstadoDeRepeticion): void;
  onVerGenerados(r: RepeticionDeRecordatorio): void;
  onReintentar(): void;
}

export function Repeticiones({
  repeticiones,
  hoy,
  cargando,
  error,
  puedeGestionar,
  onNueva,
  onEditar,
  onMarcar,
  onVerGenerados,
  onReintentar,
}: PropiedadesDeRepeticiones) {
  return (
    <section className="pz-tarjeta pz-tarjeta--lista" aria-labelledby="rec-repeticiones-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="rec-repeticiones-titulo">
          Recordatorios que se repiten
        </h3>
        {puedeGestionar ? (
          <button type="button" className="pz-boton pz-boton--principal" onClick={onNueva}>
            <Icono nombre="mas" lado={16} /> Nueva repetición
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar las repeticiones.</p>
          <p className="pz-error__detalle">{error}</p>
          <button type="button" className="pz-boton" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando las repeticiones</span>
          {[0, 1].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : repeticiones.length === 0 ? (
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="volver" lado={26} />
          </span>
          <p className="pz-vacio__titulo">Nada se repite todavía</p>
          <p className="pz-vacio__texto">
            Una repetición crea el recordatorio sola cuando toca: el corte de caja de cada lunes, la
            revisión del equipo cada mes.
          </p>
          {puedeGestionar ? (
            <button type="button" className="pz-boton pz-boton--principal" onClick={onNueva}>
              <Icono nombre="mas" lado={16} /> Nueva repetición
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="pz-lista mv-escalonado">
          {repeticiones.map((r) => (
            <li key={r.id} className="pz-renglon pz-renglon--quieto rec-repeticion__renglon">
              <span className="pz-ficha" aria-hidden="true">
                <Icono nombre="volver" lado={18} />
              </span>
              <span className="pz-renglon__cuerpo">
                <span className="pz-renglon__titulo">{r.titulo}</span>
                {/* LA REGLA, ESCRITA. "semanal / 2 / [1,4]" es legible para quien
                    la programó; "Cada 2 semanas, lunes y jueves" es lo que deja
                    ver que uno quería decir otra cosa. */}
                <span className="pz-renglon__pie">
                  {repeticionEnPalabras(r.frecuencia, r.intervalo, r.diasSemana)} ·{' '}
                  {topeEnPalabras(r.fechaFin, r.repeticiones)}
                </span>
              </span>

              <span className="rec-repeticion__datos">
                <span className="tt-etiqueta">
                  {r.estado === 'activo' ? 'La siguiente' : 'Quedó en'}
                </span>
                <span className="pz-dato__valor">{r.proximaFecha}</span>
              </span>

              <span className="rec-repeticion__datos">
                <span className="tt-etiqueta">Ha creado</span>
                <button
                  type="button"
                  className="pz-renglon__enlace"
                  onClick={() => onVerGenerados(r)}
                >
                  {r.generados} {r.generados === 1 ? 'recordatorio' : 'recordatorios'}
                </button>
              </span>

              <span className={`pz-pastilla pz-pastilla--${TONO_DE_LA_REPETICION[r.estado]}`}>
                {COMO_SE_DICE_LA_REPETICION[r.estado]}
              </span>

              {puedeGestionar ? (
                <MenuDeAcciones
                  de={r.titulo}
                  opciones={[
                    { clave: 'editar', etiqueta: 'Editar la repetición', icono: 'lapiz' },
                    { clave: 'generados', etiqueta: 'Ver lo que ha creado', icono: 'lupa' },
                    // LO QUE NO APLICA NO SE OFRECE: una regla terminada no se
                    // pausa, y una pausada no se vuelve a pausar.
                    ...(r.estado === 'activo'
                      ? ([{ clave: 'pausar', etiqueta: 'Pausar', icono: 'prohibido' }] as const)
                      : []),
                    ...(r.estado !== 'activo'
                      ? ([{ clave: 'activar', etiqueta: 'Reanudar', icono: 'palomita' }] as const)
                      : []),
                    ...(r.estado !== 'finalizado'
                      ? ([
                          {
                            clave: 'terminar',
                            etiqueta: 'Terminar la repetición',
                            icono: 'archivar',
                            peligro: true,
                          },
                        ] as const)
                      : []),
                  ]}
                  onEscoger={(clave) => {
                    if (clave === 'editar') onEditar(r);
                    else if (clave === 'generados') onVerGenerados(r);
                    else if (clave === 'pausar') onMarcar(r, 'pausado');
                    else if (clave === 'activar') onMarcar(r, 'activo');
                    else if (clave === 'terminar') onMarcar(r, 'finalizado');
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* SE DICE COMO FUNCIONA, donde se usa. Que "no se crean todos de golpe"
          es la pregunta que se hace todo el mundo la primera vez, y la respuesta
          escondida en la documentacion no la lee nadie. */}
      {repeticiones.length > 0 ? (
        <p className="pz-pista">
          <span className="pz-pista__icono" aria-hidden="true">
            <Icono nombre="alerta" lado={16} />
          </span>
          No se crean todos de golpe. Al completar uno se programa el siguiente, y al abrir esta
          pantalla se ponen al día los que ya tocaban — hasta hoy ({hoy}), nunca más allá.
        </p>
      ) : null}
    </section>
  );
}
