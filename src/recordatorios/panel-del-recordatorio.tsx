/**
 * LA FICHA DE UN RECORDATORIO — lo que se ve al escoger uno.
 *
 * ENTRA DESDE LA DERECHA (`mv-panel`) porque el movimiento dice de donde viene:
 * esto es el detalle de lo que acabas de tocar, no una pantalla nueva.
 *
 * EL HISTORIAL SE PIDE APARTE Y SOLO AL ABRIR. Traerlo con la lista serian
 * cuarenta consultas de historial para enseñar diez renglones —el problema N+1
 * con otro disfraz— y nadie mira el rastro de cuarenta recordatorios a la vez.
 *
 * LO QUE NO SE PUEDE HACER NO SE OFRECE. Un recordatorio cerrado no se pospone,
 * uno cancelado no se completa, y quien no puede tocarlo solo lo mira. La
 * pantalla lo esconde por cortesia; quien de verdad lo impide es
 * `app.puede_tocar_recordatorio` en el servidor.
 */

import { Boton } from '@neron/base/ui';
import type { Fecha } from '@neron/base/utils';
import {
  COMO_SE_DICE_LA_ENTIDAD,
  COMO_SE_DICE_LA_FRECUENCIA,
  COMO_SE_DICE_LA_PRIORIDAD,
  type EventoDelHistorial,
  type RecordatorioEnLista,
} from '../datos/recordatorios.js';
import { Icono } from '../ui/iconos.js';
import { cuandoEnPalabras, etiquetaDeEstado } from './plazos.js';
import { iconoDeEntidad } from './tabla-de-recordatorios.js';

/**
 * Como se lee cada renglon del rastro.
 *
 * SE TRADUCE AQUI Y NO SE GUARDA TRADUCIDO. La base anota `pospuesto`, que es
 * corto, no cambia y se puede filtrar; la frase en español es cosa de la
 * pantalla y puede mejorarse sin migrar una sola fila.
 */
export function comoSeLeeLaAccion(accion: string): string {
  const dicho: Readonly<Record<string, string>> = {
    creado: 'Se creó',
    editado: 'Se editó',
    completado: 'Se marcó como completado',
    reabierto: 'Se reabrió',
    pospuesto: 'Se pospuso',
    cancelado: 'Se canceló',
    eliminado: 'Se eliminó',
    reasignado: 'Cambió de responsable',
    prioridad: 'Cambió de prioridad',
    categoria: 'Cambió de categoría',
    programado: 'Lo programó una repetición',
    automatico: 'Lo creó una automatización',
  };
  return dicho[accion] ?? accion;
}

/** El momento del rastro, legible. Un ISO crudo en pantalla no lo lee nadie. */
export function momentoEnPalabras(iso: string): string {
  if (iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${d.getFullYear()} · ${hora}:${min}`;
}

export interface PropiedadesDelPanel {
  readonly recordatorio: RecordatorioEnLista | null;
  readonly hoy: Fecha;
  readonly historial: readonly EventoDelHistorial[];
  readonly cargandoHistorial: boolean;
  readonly puedeGestionar: boolean;
  onEditar(): void;
  onCompletar(hecho: boolean): void;
  onPosponer(): void;
  onDuplicar(): void;
  onCancelar(): void;
  onEliminar(): void;
  onAbrirEntidad(): void;
  onEnviarMensaje(): void;
  onCerrar(): void;
}

export function PanelDelRecordatorio({
  recordatorio: r,
  hoy,
  historial,
  cargandoHistorial,
  puedeGestionar,
  onEditar,
  onCompletar,
  onPosponer,
  onDuplicar,
  onCancelar,
  onEliminar,
  onAbrirEntidad,
  onEnviarMensaje,
  onCerrar,
}: PropiedadesDelPanel) {
  // SIN NADA ESCOGIDO NO SE PINTA UN PANEL VACIO. Un marco con rayas donde
  // deberian ir los datos se lee como algo que fallo al cargar.
  if (r === null) return null;

  const estado = etiquetaDeEstado(r.estado, r.fecha, hoy);

  return (
    <aside className="pz-tarjeta rec-panel mv-panel" aria-label={`Detalle de ${r.titulo}`}>
      <header className="pz-cabecera">
        <span className="pz-ficha" aria-hidden="true">
          <Icono nombre={iconoDeEntidad(r.entidadTipo)} lado={18} />
        </span>
        <h3 className="tt-tarjeta">{r.titulo}</h3>
        <button
          type="button"
          className="pz-icono-boton"
          aria-label="Cerrar el detalle"
          onClick={onCerrar}
        >
          <Icono nombre="prohibido" lado={16} />
        </button>
      </header>

      <p>
        <span className={`pz-pastilla pz-pastilla--${estado.tono}`}>{estado.texto}</span>{' '}
        <span className={`pz-pastilla rec-prioridad--${r.prioridad}`}>
          {COMO_SE_DICE_LA_PRIORIDAD[r.prioridad]}
        </span>
      </p>

      {r.detalle ? <p className="tt-libre">{r.detalle}</p> : null}

      <dl className="pz-datos">
        <div className="pz-dato">
          <dt className="tt-etiqueta">Cuándo</dt>
          <dd className="pz-dato__valor">{cuandoEnPalabras(r.fecha, r.hora)}</dd>
        </div>
        <div className="pz-dato">
          <dt className="tt-etiqueta">Categoría</dt>
          <dd className="pz-dato__valor">
            {r.categoria ?? <span className="tt-falta">Sin categoría</span>}
          </dd>
        </div>
        <div className="pz-dato">
          <dt className="tt-etiqueta">Responsable</dt>
          <dd className="pz-dato__valor">
            {r.responsable ?? <span className="tt-falta">Sin asignar</span>}
          </dd>
        </div>
        {r.recurrencia ? (
          <div className="pz-dato">
            <dt className="tt-etiqueta">Se repite</dt>
            <dd className="pz-dato__valor">{COMO_SE_DICE_LA_FRECUENCIA[r.recurrencia]}</dd>
          </div>
        ) : null}
        {r.automatizacionId ? (
          <div className="pz-dato">
            <dt className="tt-etiqueta">Lo creó</dt>
            {/* SE DICE QUE NACIO SOLO. Sin esto, quien no recuerda haberlo
                escrito cree que otra persona se lo puso. */}
            <dd className="pz-dato__valor">Una automatización</dd>
          </div>
        ) : null}
        {r.completadoEn ? (
          <div className="pz-dato">
            <dt className="tt-etiqueta">Completado</dt>
            <dd className="pz-dato__valor">
              {momentoEnPalabras(r.completadoEn)}
              {r.completadoPor ? ` · ${r.completadoPor}` : ''}
            </dd>
          </div>
        ) : null}
        <div className="pz-dato">
          <dt className="tt-etiqueta">Lo capturó</dt>
          <dd className="pz-dato__valor">
            {r.creadoPor ?? <span className="tt-falta">—</span>}
            {r.creadoEn ? ` · ${momentoEnPalabras(r.creadoEn)}` : ''}
          </dd>
        </div>
      </dl>

      {/* LA RELACION ES UN ENLACE DE VERDAD, no un texto. Todo el sentido del
          modulo es que desde "Confirmar cita" se llegue a la cita. */}
      {r.entidadTipo && r.entidadId ? (
        <section className="rec-relacionado">
          <h4 className="tt-etiqueta">Relacionado con</h4>
          <button type="button" className="pz-renglon" onClick={onAbrirEntidad}>
            <span className="pz-ficha" aria-hidden="true">
              <Icono nombre={iconoDeEntidad(r.entidadTipo)} lado={16} />
            </span>
            <span className="pz-renglon__cuerpo">
              <span className="pz-renglon__titulo">
                {r.entidadNombre ?? COMO_SE_DICE_LA_ENTIDAD[r.entidadTipo]}
              </span>
              <span className="pz-renglon__pie">
                Abrir {COMO_SE_DICE_LA_ENTIDAD[r.entidadTipo].toLowerCase()}
              </span>
            </span>
            <span className="pz-renglon__flecha" aria-hidden="true">
              <Icono nombre="flecha" lado={16} />
            </span>
          </button>
          {r.entidadContacto ? (
            <button type="button" className="pz-boton pz-boton--ancho" onClick={onEnviarMensaje}>
              <Icono nombre="mensaje" lado={16} /> Enviar mensaje
            </button>
          ) : null}
        </section>
      ) : null}

      {r.notas ? (
        <section className="rec-notas">
          <h4 className="tt-etiqueta">Notas</h4>
          <p className="tt-libre">{r.notas}</p>
        </section>
      ) : null}

      {puedeGestionar ? (
        <div className="pz-ficha__pie rec-acciones">
          {r.estado === 'pendiente' ? (
            <>
              <Boton tono="principal" type="button" onClick={() => onCompletar(true)}>
                Completar
              </Boton>
              <Boton tono="contorno" type="button" onClick={onPosponer}>
                Posponer
              </Boton>
            </>
          ) : (
            <Boton tono="principal" type="button" onClick={() => onCompletar(false)}>
              Reabrir
            </Boton>
          )}
          <Boton tono="contorno" type="button" onClick={onEditar}>
            Editar
          </Boton>
          <Boton tono="contorno" type="button" onClick={onDuplicar}>
            Duplicar
          </Boton>
          {r.estado === 'pendiente' ? (
            <Boton tono="contorno" type="button" onClick={onCancelar}>
              Cancelar
            </Boton>
          ) : null}
          <Boton tono="peligro" type="button" onClick={onEliminar}>
            Eliminar
          </Boton>
        </div>
      ) : null}

      <section className="rec-historial">
        <h4 className="tt-etiqueta">Historial</h4>
        {cargandoHistorial ? (
          <div className="pz-cargando" aria-busy="true">
            <span className="neron-solo-lectores">Cargando el historial</span>
            <div className="pz-silueta pz-silueta--linea" />
          </div>
        ) : historial.length === 0 ? (
          <p className="pz-vacio__texto">Todavía no hay movimientos que contar.</p>
        ) : (
          <ol className="pz-lista rec-rastro">
            {historial.map((e) => (
              <li key={e.id} className="rec-rastro__paso">
                <span className="rec-rastro__que">{comoSeLeeLaAccion(e.accion)}</span>
                <span className="rec-rastro__quien">
                  {e.usuario ?? 'alguien'} · {momentoEnPalabras(e.creadoEn)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
