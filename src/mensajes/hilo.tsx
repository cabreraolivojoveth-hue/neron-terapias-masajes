/**
 * EL HILO: la conversación abierta, y el cuadro para escribir.
 *
 * LO QUE ENTRA Y LO QUE SALE SE DISTINGUEN POR SITIO Y POR COLOR, no solo por
 * color: quien no distingue los tonos tiene que poder saber quién dijo qué, y
 * el lado de la burbuja lo dice sin depender de la vista.
 *
 * EL ESTADO DE UN MENSAJE NO SE INVENTA. Mientras no haya un canal conectado de
 * verdad, todo lo que sale se queda en "Sin enviar" y se dice con esas palabras.
 * Pintar una palomita de "entregado" que nadie confirmó es peor que no pintar
 * nada: se da por avisado a un cliente que nunca supo nada.
 *
 * EL HISTORIAL SE PIDE HACIA ATRÁS. Se traen los últimos treinta y se piden más
 * al llegar arriba. Un hilo de dos años son miles de mensajes y bajarlos de
 * golpe cuelga la pestaña.
 */

import { useEffect, useRef, useState } from 'react';
import type {
  ConversacionEnLista,
  MensajeDelHilo,
  EstadoDelMensaje,
} from '../datos/mensajes.js';
import { COMO_SE_DICE_EL_CANAL, COMO_SE_DICE_EL_MENSAJE } from '../datos/mensajes.js';
import { Icono } from '../ui/iconos.js';
import { MenuDeAcciones } from '../ui/menu.js';
import { comoSeLlama, cuandoFue } from './lista-de-conversaciones.js';

/**
 * Los emojis que de verdad se usan al hablar con un cliente de un centro de
 * terapias. No es un catálogo completo a propósito: un selector de tres mil
 * emojis es una biblioteca de medio mega para poner una carita.
 */
export const EMOJIS = [
  '🙂', '😊', '🙏', '👍', '💚', '✨', '🌿', '💆', '🧘', '🕯️',
  '📅', '⏰', '✅', '❌', '💰', '📍', '📞', '👋', '🎉', '❤️',
] as const;

/** La hora de un mensaje. Lo que no se entiende sale vacío, nunca inventado. */
export function horaDelMensaje(iso: string): string {
  const marca = Date.parse(iso);
  if (!Number.isFinite(marca)) return '';
  const d = new Date(marca);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** El día de un mensaje, para las separaciones del hilo. */
export function diaDelMensaje(iso: string): string {
  const marca = Date.parse(iso);
  if (!Number.isFinite(marca)) return '';
  return new Date(marca).toDateString();
}

/**
 * Las opciones del menú de tres puntos, según cómo esté la conversación.
 *
 * Se calculan y no se escriben fijas porque las mitades se excluyen: ofrecer
 * "Archivar" en algo ya archivado es un botón que no hace nada, y un botón que
 * no hace nada hace creer que la pantalla se trabó.
 */
export function accionesDelHilo(c: ConversacionEnLista): ReadonlyArray<{
  readonly clave: string; readonly etiqueta: string; readonly icono: 'palomita' | 'sobre' | 'archivar' | 'volver' | 'prohibido' | 'persona' | 'cuadricula';
}> {
  const hayCliente = c.clienteId !== null;
  return [
    c.sinLeer > 0
      ? { clave: 'leida', etiqueta: 'Marcar como leída', icono: 'palomita' as const }
      : { clave: 'no_leida', etiqueta: 'Marcar como no leída', icono: 'sobre' as const },
    ...(c.pendiente
      ? [{ clave: 'atendida', etiqueta: 'Marcar como atendida', icono: 'palomita' as const }]
      : []),
    { clave: 'etiquetas', etiqueta: 'Administrar etiquetas', icono: 'cuadricula' as const },
    { clave: 'asignar', etiqueta: 'Asignar responsable', icono: 'persona' as const },
    ...(hayCliente
      ? []
      : [{ clave: 'ligar', etiqueta: 'Ligar con un cliente', icono: 'persona' as const }]),
    c.estado === 'archivada'
      ? { clave: 'desarchivar', etiqueta: 'Sacar del archivo', icono: 'volver' as const }
      : { clave: 'archivar', etiqueta: 'Archivar', icono: 'archivar' as const },
    c.estado === 'cerrada'
      ? { clave: 'reabrir', etiqueta: 'Reabrir', icono: 'volver' as const }
      : { clave: 'cerrar', etiqueta: 'Cerrar conversación', icono: 'prohibido' as const },
  ];
}

export interface PropiedadesDelHilo {
  readonly conversacion: ConversacionEnLista | null;
  readonly mensajes: readonly MensajeDelHilo[];
  readonly cargando: boolean;
  readonly hayMasAtras: boolean;
  readonly enviando: boolean;
  readonly error: string | null;
  /** Sin un canal conectado no se puede enviar de verdad, y se dice. */
  readonly canalConectado: boolean;
  readonly puedeEscribir: boolean;
  onEnviar(texto: string): void;
  onAccion(clave: string): void;
  onFavorita(): void;
  onVerCliente(): void;
  onMasAtras(): void;
  onReintentarMensaje(m: MensajeDelHilo): void;
}

export function Hilo({
  conversacion,
  mensajes,
  cargando,
  hayMasAtras,
  enviando,
  error,
  canalConectado,
  puedeEscribir,
  onEnviar,
  onAccion,
  onFavorita,
  onVerCliente,
  onMasAtras,
  onReintentarMensaje,
}: PropiedadesDelHilo) {
  const [escrito, setEscrito] = useState('');
  const [emojisAbiertos, setEmojisAbiertos] = useState(false);
  const fondo = useRef<HTMLDivElement>(null);

  /**
   * Al llegar un mensaje se baja al final.
   *
   * Solo cuando cambia el número de mensajes o la conversación: si se hiciera
   * en cada repintado, leer algo de arriba sería imposible — la pantalla se
   * escaparía hacia abajo sola mientras se lee.
   */
  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' });
  }, [mensajes.length, conversacion?.id]);

  if (!conversacion) {
    return (
      <section className="pz-tarjeta msj-hilo-abierto" aria-label="Conversación">
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="mensaje" lado={44} />
          </span>
          <p className="pz-vacio__titulo">Escoge una conversación</p>
          <p className="pz-vacio__texto">
            Toca una de la lista para ver lo que se ha hablado y responder.
          </p>
        </div>
      </section>
    );
  }

  function mandar(): void {
    const texto = escrito.trim();
    if (texto === '') return;
    onEnviar(texto);
    // SE LIMPIA AL MANDAR, no al confirmar: si el envío falla, el mensaje se
    // queda en el hilo marcado como fallido y se puede reintentar desde ahí. Es
    // mejor que devolverlo al cuadro, donde se pierde con el siguiente que se
    // escriba.
    setEscrito('');
    setEmojisAbiertos(false);
  }

  let diaAnterior = '';

  return (
    <section className="pz-tarjeta msj-hilo-abierto" aria-label={`Conversación con ${comoSeLlama(conversacion)}`}>
      <header className="msj-cabeza">
        <span className="pz-inicial" aria-hidden="true">
          {comoSeLlama(conversacion).slice(0, 1).toUpperCase()}
        </span>
        <div className="msj-cabeza__quien">
          <button type="button" className="pz-enlace pz-enlace--pelado" onClick={onVerCliente}>
            {comoSeLlama(conversacion)}
          </button>
          <span className="pz-renglon__pie">
            {conversacion.contacto}
            {conversacion.canalTipo ? ` · ${COMO_SE_DICE_EL_CANAL[conversacion.canalTipo]}` : ''}
          </span>
        </div>
        <button
          type="button"
          className="pz-icono-boton"
          aria-pressed={conversacion.favorita}
          aria-label={conversacion.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
          onClick={onFavorita}
        >
          <Icono nombre="estrella" lado={18} />
        </button>
        <MenuDeAcciones
          de={comoSeLlama(conversacion)}
          opciones={accionesDelHilo(conversacion)}
          onEscoger={onAccion}
        />
      </header>

      <div className="msj-mensajes">
        {hayMasAtras ? (
          <button type="button" className="pz-boton" onClick={onMasAtras}>
            Ver mensajes anteriores
          </button>
        ) : null}

        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <span className="neron-solo-lectores">Cargando la conversación</span>
            {[0, 1].map((i) => <div key={i} className="pz-silueta" />)}
          </div>
        ) : mensajes.length === 0 ? (
          <div className="pz-vacio pz-vacio--chico">
            <span className="pz-vacio__icono" aria-hidden="true">
              <Icono nombre="mensaje" lado={22} />
            </span>
            <p className="pz-vacio__texto">No hay mensajes todavía.</p>
          </div>
        ) : (
          mensajes.map((m) => {
            const dia = diaDelMensaje(m.creadoEn);
            const nuevoDia = dia !== diaAnterior;
            diaAnterior = dia;
            return (
              <div key={m.id}>
                {/* La separación por día es lo que deja leer un hilo largo sin
                    perderse: sin ella, "10:28" no dice de cuándo. */}
                {nuevoDia ? <p className="msj-dia">{cuandoFue(m.creadoEn)}</p> : null}
                <div
                  className={`msj-globo msj-globo--${m.direccion}${
                    m.estado === 'fallido' ? ' msj-globo--fallido' : ''
                  }`}
                >
                  <p className="msj-globo__texto">{m.cuerpo}</p>
                  <p className="msj-globo__pie">
                    <span>{horaDelMensaje(m.creadoEn)}</span>
                    {m.direccion === 'saliente' ? (
                      <span className={`msj-estado msj-estado--${m.estado}`}>
                        {COMO_SE_DICE_EL_MENSAJE[m.estado as EstadoDelMensaje]}
                      </span>
                    ) : null}
                    {m.quien ? <span className="tt-secundario">· {m.quien}</span> : null}
                  </p>
                  {/* UN FALLO DICE POR QUE Y DEJA REINTENTAR. "No se pudo
                      enviar" a secas obliga a adivinar entre el número mal
                      escrito, el canal caído y la plantilla no aprobada. */}
                  {m.estado === 'fallido' ? (
                    <p className="msj-globo__error">
                      {m.error ?? 'No se pudo enviar.'}{' '}
                      <button
                        type="button"
                        className="pz-enlace pz-enlace--pelado"
                        onClick={() => onReintentarMensaje(m)}
                      >
                        Reintentar
                      </button>
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        <div ref={fondo} />
      </div>

      {error ? <p className="pz-error__detalle" role="alert">{error}</p> : null}

      {/*
        SIN CANAL CONECTADO SE DICE ANTES DE ESCRIBIR, no después de mandar.
        El mensaje se guarda igual —queda en el historial del cliente, que es
        lo que hace falta— pero nadie lo recibe, y eso hay que saberlo antes.
      */}
      {!canalConectado ? (
        <p className="pz-aviso" role="status">
          <strong>Ningún canal está conectado.</strong> Lo que escribas se guarda en el historial de
          esta persona y queda como <em>Sin enviar</em>: no le llega a nadie hasta que se conecte un
          canal de verdad.
        </p>
      ) : null}

      {puedeEscribir ? (
        <div className="msj-escribir">
          <button
            type="button"
            className="pz-icono-boton"
            aria-label="Adjuntar un archivo"
            // EL CLIP ESTA APAGADO Y DICE POR QUE. Adjuntar necesita dos cosas
            // que todavía no existen: un sitio donde guardar el archivo y un
            // canal que sepa mandarlo. Un botón que abre un selector y después
            // falla es peor que uno apagado con su motivo.
            disabled
            title="Los adjuntos necesitan un canal conectado que sepa enviarlos."
          >
            <Icono nombre="paquete" lado={18} />
          </button>

          <label className="msj-campo">
            <span className="neron-solo-lectores">Escribe un mensaje</span>
            <textarea
              className="msj-campo__texto"
              rows={1}
              placeholder="Escribe un mensaje…"
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              onKeyDown={(e) => {
                // Enter manda; Shift+Enter hace párrafo. Es lo que la mano ya
                // sabe de cualquier otro chat.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  mandar();
                }
              }}
            />
          </label>

          <button
            type="button"
            className="pz-icono-boton"
            aria-expanded={emojisAbiertos}
            aria-label="Emojis"
            onClick={() => setEmojisAbiertos((a) => !a)}
          >
            <Icono nombre="corazon" lado={18} />
          </button>

          <button
            type="button"
            className="pz-boton pz-boton--principal"
            disabled={enviando || escrito.trim() === ''}
            onClick={mandar}
          >
            {enviando ? 'Guardando…' : 'Enviar'}
          </button>

          {emojisAbiertos ? (
            <div className="msj-emojis" role="group" aria-label="Emojis">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="msj-emoji"
                  onClick={() => setEscrito((t) => t + e)}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="tt-secundario">
          Tu rol no escribe mensajes. Puedes leer las conversaciones — y lo decide la base de datos,
          no esta pantalla.
        </p>
      )}
    </section>
  );
}
