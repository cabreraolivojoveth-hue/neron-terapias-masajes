/**
 * UNA DIFUSIÓN: el mismo mensaje a varias personas.
 *
 * SE ESCOGE UNO POR UNO Y SE VE LA LISTA ANTES DE MANDAR. No hay un botón de
 * "todos mis clientes" y es a propósito: una difusión es lo único de este
 * módulo que no se puede deshacer, y la diferencia entre 12 personas y 400 es
 * un clic distraído. Quien confirma ve exactamente a quién le va a llegar.
 *
 * QUIEN PIDIÓ NO RECIBIR PROMOCIONES NO SALE EN LA LISTA. Ni siquiera
 * apagado — no aparece. Un renglón desmarcado invita a marcarlo.
 *
 * SIN CANAL CONECTADO SE DICE ANTES. Los mensajes se guardan en el hilo de cada
 * persona y quedan «Sin enviar»: sirve para dejar constancia, no para avisar a
 * nadie. Confundir las dos cosas es dar por avisada a cuatrocientas personas
 * que no supieron nada.
 */

import { useState } from 'react';
import type { ClienteEnLista } from '../datos/clientes.js';
import type { CanalDeMensajes, PlantillaDeMensaje } from '../datos/mensajes.js';
import { Modal } from '../ui/modal.js';
import { Icono } from '../ui/iconos.js';

export type PasoDeLaDifusion = 'a-quien' | 'que' | 'confirmar';

/**
 * Quién puede recibir una difusión.
 *
 * Dos condiciones y las dos son obligatorias: que haya por dónde escribirle, y
 * que no haya pedido que no. Sin teléfono no es que falle: es que no existe
 * destino.
 */
export function puedeRecibir(c: ClienteEnLista): boolean {
  return Boolean(c.telefono && c.telefono.trim() !== '') && c.aceptaPromociones !== false;
}

/** Los que quedan fuera y por qué, para poder decirlo en vez de esconderlo. */
export function losQueQuedanFuera(clientes: readonly ClienteEnLista[]): {
  readonly sinContacto: number;
  readonly noQuieren: number;
} {
  return {
    sinContacto: clientes.filter((c) => !c.telefono || c.telefono.trim() === '').length,
    noQuieren: clientes.filter(
      (c) => c.aceptaPromociones === false && Boolean(c.telefono),
    ).length,
  };
}

export interface PropiedadesDeLaDifusion {
  readonly abierto: boolean;
  readonly clientes: readonly ClienteEnLista[];
  readonly busqueda: string;
  readonly cargando: boolean;
  readonly canales: readonly CanalDeMensajes[];
  readonly plantillas: readonly PlantillaDeMensaje[];
  readonly trabajando: boolean;
  readonly error: string | null;
  onBuscar(texto: string): void;
  onEnviar(datos: {
    nombre: string; cuerpo: string; canalId: string | null; clientes: readonly string[];
  }): void;
  onCerrar(): void;
}

export function EnviarDifusion({
  abierto,
  clientes,
  busqueda,
  cargando,
  canales,
  plantillas,
  trabajando,
  error,
  onBuscar,
  onEnviar,
  onCerrar,
}: PropiedadesDeLaDifusion) {
  const [paso, setPaso] = useState<PasoDeLaDifusion>('a-quien');
  const [escogidos, setEscogidos] = useState<readonly string[]>([]);
  const [nombre, setNombre] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [canalId, setCanalId] = useState('');

  const elegibles = clientes.filter(puedeRecibir);
  const fuera = losQueQuedanFuera(clientes);
  const canal = canales.find((c) => c.id === canalId) ?? null;
  const conectado = canal?.estado === 'conectado';

  function alternar(id: string): void {
    setEscogidos((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  }

  return (
    <Modal abierto={abierto} titulo="Enviar difusión" ancho bloqueado={trabajando} onCerrar={onCerrar}>
      <div className="pz-columna">
        {paso === 'a-quien' ? (
          <>
            <p className="pz-dato__valor">
              Escoge a quién le llega. Solo aparecen quienes tienen teléfono y no han pedido dejar
              de recibir promociones.
            </p>

            <div className="pz-buscador">
              <span className="pz-buscador__lupa" aria-hidden="true">
                <Icono nombre="lupa" lado={16} />
              </span>
              <input
                type="search"
                className="pz-buscador__campo"
                autoComplete="off"
                placeholder="Buscar cliente…"
                aria-label="Buscar cliente"
                value={busqueda}
                onChange={(e) => onBuscar(e.target.value)}
              />
            </div>

            {cargando ? (
              <div className="pz-cargando" aria-busy="true">
                <div className="pz-silueta pz-silueta--linea" />
                <div className="pz-silueta pz-silueta--linea" />
              </div>
            ) : elegibles.length === 0 ? (
              <div className="pz-vacio pz-vacio--chico">
                <span className="pz-vacio__icono" aria-hidden="true">
                  <Icono nombre="personas" lado={22} />
                </span>
                <p className="pz-vacio__texto">
                  {clientes.length === 0
                    ? 'Todavía no hay clientes a quienes escribir.'
                    : 'Ninguno de los que coinciden tiene teléfono, o pidieron no recibir promociones.'}
                </p>
              </div>
            ) : (
              <ul className="pz-lista msj-destinatarios">
                {elegibles.map((c) => (
                  <li key={c.id}>
                    <label className="msj-destinatario">
                      <input
                        type="checkbox"
                        checked={escogidos.includes(c.id)}
                        onChange={() => alternar(c.id)}
                      />
                      <span className="pz-renglon__cuerpo">
                        <span className="pz-renglon__titulo">{c.nombre}</span>
                        <span className="pz-renglon__pie">{c.telefono}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {/* LOS QUE QUEDAN FUERA SE CUENTAN. Saltarlos en silencio deja
                creyendo que llegó a todo el mundo. */}
            {fuera.sinContacto > 0 || fuera.noQuieren > 0 ? (
              <p className="tt-secundario">
                {fuera.sinContacto > 0
                  ? `${fuera.sinContacto} sin teléfono. ` : ''}
                {fuera.noQuieren > 0
                  ? `${fuera.noQuieren} pidieron no recibir promociones. ` : ''}
                No aparecen en la lista.
              </p>
            ) : null}

            <div className="pz-acciones">
              <button type="button" className="pz-boton" onClick={onCerrar}>Cancelar</button>
              <button
                type="button"
                className="pz-boton pz-boton--principal"
                disabled={escogidos.length === 0}
                onClick={() => setPaso('que')}
              >
                Siguiente ({escogidos.length})
              </button>
            </div>
          </>
        ) : paso === 'que' ? (
          <>
            <label className="pz-campo pz-campo--bloque">
              <span className="tt-etiqueta">Nombre de la difusión *</span>
              <input
                className="msj-campo__linea"
                autoComplete="off"
                placeholder="Para encontrarla después"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </label>

            <label className="pz-campo pz-campo--bloque">
              <span className="tt-etiqueta">Por dónde</span>
              <select value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                <option value="">Escoge un canal</option>
                {canales.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}{c.estado === 'conectado' ? '' : ' (sin conectar)'}
                  </option>
                ))}
              </select>
            </label>

            {plantillas.filter((p) => p.activa).length > 0 ? (
              <label className="pz-campo pz-campo--bloque">
                <span className="tt-etiqueta">Partir de una plantilla</span>
                <select
                  value=""
                  onChange={(e) => {
                    const p = plantillas.find((x) => x.id === e.target.value);
                    if (p) setCuerpo(p.cuerpo);
                  }}
                >
                  <option value="">Escribir desde cero</option>
                  {plantillas.filter((p) => p.activa).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                {/* LAS VARIABLES NO SE RELLENAN EN UNA DIFUSION. Cada persona
                    tiene su nombre y aquí el texto es uno solo: dejarlas
                    escritas mandaría "{{cliente.nombre}}" a cuatrocientas
                    personas. Se avisa para que se quiten. */}
                <span className="tt-secundario">
                  En una difusión el texto es el mismo para todos: las variables no se rellenan.
                  Quita las que copies de la plantilla.
                </span>
              </label>
            ) : null}

            <label className="pz-campo pz-campo--bloque">
              <span className="tt-etiqueta">Mensaje *</span>
              <textarea
                className="msj-campo__texto msj-campo__texto--alto"
                rows={5}
                placeholder="Lo que le va a llegar a todos"
                value={cuerpo}
                onChange={(e) => setCuerpo(e.target.value)}
              />
            </label>

            <div className="pz-acciones">
              <button type="button" className="pz-boton" onClick={() => setPaso('a-quien')}>
                Atrás
              </button>
              <button
                type="button"
                className="pz-boton pz-boton--principal"
                disabled={nombre.trim() === '' || cuerpo.trim() === ''}
                onClick={() => setPaso('confirmar')}
              >
                Revisar
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="tt-tarjeta">Revisa antes de mandar</h3>

            <div className="pz-datos">
              <div className="pz-dato pz-dato--renglon">
                <span className="tt-etiqueta">Le llega a</span>
                <strong className="tt-dato">{escogidos.length} personas</strong>
              </div>
              <div className="pz-dato pz-dato--renglon">
                <span className="tt-etiqueta">Por</span>
                <span className="pz-dato__valor">{canal?.nombre ?? 'Sin canal'}</span>
              </div>
            </div>

            <p className="pz-dato__valor msj-vista-previa">{cuerpo}</p>

            {/* La lista completa, no un resumen. Es la última oportunidad de
                ver un nombre que no debía estar. */}
            <details className="pz-plegable">
              <summary className="pz-plegable__tirador">
                Ver los {escogidos.length} destinatarios
              </summary>
              <ul className="pz-lista">
                {escogidos.map((id) => {
                  const c = clientes.find((x) => x.id === id);
                  return <li key={id} className="pz-dato__valor">{c?.nombre ?? id}</li>;
                })}
              </ul>
            </details>

            {!conectado ? (
              <div className="pz-aviso" role="status">
                <p>
                  <strong>Ese canal no está conectado.</strong> Los mensajes se guardan en el
                  historial de cada persona y quedan <em>Sin enviar</em>: no le llegan a nadie.
                </p>
              </div>
            ) : null}

            {error ? <p className="pz-error__detalle" role="alert">{error}</p> : null}

            <div className="pz-acciones">
              <button type="button" className="pz-boton" onClick={() => setPaso('que')}>
                Atrás
              </button>
              <button
                type="button"
                className="pz-boton pz-boton--principal"
                disabled={trabajando}
                onClick={() =>
                  onEnviar({ nombre, cuerpo, canalId: canalId || null, clientes: escogidos })}
              >
                {trabajando ? 'Mandando…' : `Mandar a ${escogidos.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
