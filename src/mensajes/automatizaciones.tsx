/**
 * LOS MENSAJES AUTOMÁTICOS.
 *
 * NACEN APAGADOS, SIEMPRE, y no hay forma de crear uno encendido. Mandar
 * mensajes a los clientes de alguien sin que esa persona lo haya pedido
 * explícitamente es de las pocas cosas de este sistema que no se pueden
 * deshacer: el mensaje ya llegó.
 *
 * NO SE PUEDE ENCENDER SIN PLANTILLA Y SIN CANAL. Lo exige también la base, y
 * por la misma razón: una automatización activa sin qué mandar y por dónde no
 * es una automatización, es un fallo silencioso que se descubre el día que
 * alguien pregunta por qué no llegó su recordatorio.
 *
 * TODAVÍA NO DISPARAN SOLAS, y se dice en la pantalla. Para que una
 * automatización corra hace falta algo que escuche los eventos —que se agendó
 * una cita, que se registró un pago— y eso vive en un servidor que este
 * producto no tiene. Quedan declaradas y listas; fingir que disparan haría
 * creer que el cliente ya fue avisado.
 */

import { useState } from 'react';
import type {
  AutomatizacionDeMensajes,
  CanalDeMensajes,
  EventoAutomatizable,
  PlantillaDeMensaje,
} from '../datos/mensajes.js';
import { COMO_SE_DICE_EL_CANAL, COMO_SE_DICE_EL_EVENTO } from '../datos/mensajes.js';
import { Modal } from '../ui/modal.js';
import { Icono } from '../ui/iconos.js';

/** Los eventos que se pueden automatizar, en el orden en que pasan de verdad. */
export const EVENTOS: readonly EventoAutomatizable[] = [
  'cita_nueva', 'cita_confirmada', 'cita_recordatorio', 'cita_reagendada', 'cita_cancelada',
  'inscripcion_nueva', 'pago_registrado', 'seguimiento', 'cliente_inactivo',
];

/** Por qué no se puede encender todavía. `null` = se puede. */
export function porQueNoSePuedeEncender(
  plantillaId: string | null,
  canalId: string | null,
): string | null {
  if (!plantillaId && !canalId) return 'Escoge una plantilla y un canal.';
  if (!plantillaId) return 'Escoge qué plantilla se manda.';
  if (!canalId) return 'Escoge por dónde se manda.';
  return null;
}

export interface PropiedadesDeAutomatizaciones {
  readonly abierto: boolean;
  readonly automatizaciones: readonly AutomatizacionDeMensajes[];
  readonly plantillas: readonly PlantillaDeMensaje[];
  readonly canales: readonly CanalDeMensajes[];
  readonly cargando: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(
    id: string | null,
    datos: {
      evento: EventoAutomatizable; plantillaId: string | null;
      canalId: string | null; activa: boolean;
    },
  ): void;
  onCerrar(): void;
}

export function AdministrarAutomatizaciones({
  abierto,
  automatizaciones,
  plantillas,
  canales,
  cargando,
  trabajando,
  error,
  onGuardar,
  onCerrar,
}: PropiedadesDeAutomatizaciones) {
  const [evento, setEvento] = useState<EventoAutomatizable>('cita_recordatorio');
  const [plantillaId, setPlantillaId] = useState('');
  const [canalId, setCanalId] = useState('');

  const falta = porQueNoSePuedeEncender(plantillaId || null, canalId || null);
  const hayCanalConectado = canales.some((c) => c.estado === 'conectado');

  return (
    <Modal
      abierto={abierto}
      titulo="Mensajes automáticos"
      ancho
      bloqueado={trabajando}
      onCerrar={onCerrar}
    >
      <div className="pz-columna">
        {/* SE DICE ANTES DE CONFIGURAR NADA. Enterarse de que no disparan
            después de haber armado cinco es enterarse tarde. */}
        <div className="pz-aviso">
          <p>
            <strong>Todavía no disparan solas.</strong> Para que una automatización corra hace falta
            algo que escuche los eventos del sistema, y eso vive en un servidor que este producto
            aún no tiene.
          </p>
          <p className="tt-secundario">
            Puedes dejarlas configuradas: el día que se conecte un canal de verdad, ya están.
          </p>
        </div>

        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <div className="pz-silueta pz-silueta--linea" />
          </div>
        ) : automatizaciones.length === 0 ? (
          <div className="pz-vacio pz-vacio--chico">
            <span className="pz-vacio__icono" aria-hidden="true">
              <Icono nombre="reloj" lado={22} />
            </span>
            <p className="pz-vacio__texto">
              No hay ninguna configurada. Una automatización manda una plantilla sola cuando pasa
              algo — por ejemplo, un recordatorio el día antes de una cita.
            </p>
          </div>
        ) : (
          <ul className="pz-lista">
            {automatizaciones.map((a) => (
              <li key={a.id} className="pz-dato pz-dato--renglon">
                <span className="pz-renglon__cuerpo">
                  <span className="pz-renglon__titulo">{COMO_SE_DICE_EL_EVENTO[a.evento]}</span>
                  <span className="pz-renglon__pie">
                    {a.plantilla ?? 'Sin plantilla'} · {a.canal ?? 'Sin canal'}
                  </span>
                </span>
                <span className={`pz-pastilla ${a.activa ? 'pz-pastilla--exito' : ''}`}>
                  {a.activa ? 'Encendida' : 'Apagada'}
                </span>
                <button
                  type="button"
                  className="pz-boton"
                  disabled={trabajando || (!a.activa && (a.plantillaId === null || a.canalId === null))}
                  title={
                    !a.activa && (a.plantillaId === null || a.canalId === null)
                      ? 'Le falta plantilla o canal.'
                      : undefined
                  }
                  onClick={() =>
                    onGuardar(a.id, {
                      evento: a.evento, plantillaId: a.plantillaId,
                      canalId: a.canalId, activa: !a.activa,
                    })}
                >
                  {a.activa ? 'Apagar' : 'Encender'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3 className="tt-tarjeta">Agregar una</h3>

        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Cuándo</span>
          <select value={evento} onChange={(e) => setEvento(e.target.value as EventoAutomatizable)}>
            {EVENTOS.map((ev) => (
              <option key={ev} value={ev}>{COMO_SE_DICE_EL_EVENTO[ev]}</option>
            ))}
          </select>
        </label>

        <div className="pz-dos">
          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Qué se manda</span>
            <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
              <option value="">Escoge una plantilla</option>
              {plantillas.filter((p) => p.activa).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Por dónde</span>
            <select value={canalId} onChange={(e) => setCanalId(e.target.value)}>
              <option value="">Escoge un canal</option>
              {canales.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.estado === 'conectado' ? '' : ' (sin conectar)'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {plantillas.length === 0 ? (
          <p className="tt-secundario">
            Todavía no hay plantillas. Crea una primero en <strong>Plantillas</strong>: es lo que se
            manda.
          </p>
        ) : null}
        {canales.length > 0 && !hayCanalConectado ? (
          <p className="tt-secundario">
            Ningún canal está conectado. Puedes dejarla configurada y encenderla cuando lo esté.
          </p>
        ) : null}

        {error ? <p className="pz-error__detalle" role="alert">{error}</p> : null}

        <div className="pz-acciones">
          <button
            type="button"
            className="pz-boton"
            disabled={trabajando}
            onClick={() =>
              onGuardar(null, {
                evento,
                plantillaId: plantillaId || null,
                canalId: canalId || null,
                // SIEMPRE APAGADA AL CREARLA. Ver la cabecera del archivo.
                activa: false,
              })}
          >
            Guardar apagada
          </button>
          <button
            type="button"
            className="pz-boton pz-boton--principal"
            disabled={trabajando || falta !== null}
            title={falta ?? undefined}
            onClick={() =>
              onGuardar(null, {
                evento, plantillaId: plantillaId || null, canalId: canalId || null, activa: true,
              })}
          >
            Guardar y encender
          </button>
        </div>
        {falta ? <p className="tt-secundario">{falta}</p> : null}
      </div>
    </Modal>
  );
}
