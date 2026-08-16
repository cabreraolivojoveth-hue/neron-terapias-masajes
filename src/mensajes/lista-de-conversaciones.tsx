/**
 * LA LISTA DE CONVERSACIONES: buscador, filtro por etiqueta y los hilos.
 *
 * EL BUSCADOR NO PIERDE EL FOCO, y eso no sale gratis. El campo vive SIEMPRE en
 * el mismo sitio del árbol —fuera de cualquier rama condicional— porque si se
 * pintara dentro de un `if` que cambia al llegar los resultados, React lo
 * destruiría y lo volvería a crear en cada letra: la queja de "escribo Ana y
 * tengo que volver a hacer clic". Lo que cambia debajo es la lista, no el campo.
 *
 * LO QUE SE ESCRIBE NO SE FILTRA AQUÍ. El texto viaja al servidor y busca en el
 * hilo entero: por quién es, por su contacto, por lo que se dijo y por cómo se
 * etiquetó. Filtrar sobre las veinte que se bajaron sería decirle a alguien que
 * su conversación no existe porque estaba en la página tres.
 *
 * UN HILO SIN CLIENTE SE DICE, no se rellena. Llega un mensaje de un número
 * desconocido y se enseña el número: inventarle una ficha llenaría el
 * directorio de fantasmas llamados como su teléfono.
 */

import type { Categoria as CategoriaDeEtiqueta } from '../datos/categorias.js';
import type { Bandeja, ConversacionEnLista, CuentasDeBandeja } from '../datos/mensajes.js';
import { BANDEJAS, COMO_SE_DICE_EL_CANAL } from '../datos/mensajes.js';
import { Icono } from '../ui/iconos.js';

/**
 * Cuándo llegó, escrito corto.
 *
 * Se parte del texto en vez de formatear con `Intl`: en una compilación
 * recortada de Node —o en el entorno de pruebas— `Intl` devuelve otra cosa sin
 * avisar. Lo que no se entiende sale vacío, nunca una hora inventada.
 */
export function cuandoFue(iso: string, ahora: Date = new Date()): string {
  const marca = Date.parse(iso);
  if (!Number.isFinite(marca)) return '';
  const d = new Date(marca);
  const mismoDia = d.toDateString() === ahora.toDateString();
  if (mismoDia) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${MESES[d.getMonth()] ?? ''}`;
}

/** Con quién se está hablando. Sin cliente identificado, el contacto. */
export function comoSeLlama(c: ConversacionEnLista): string {
  return c.cliente ?? c.contacto;
}

export interface PropiedadesDeLaLista {
  readonly conversaciones: readonly ConversacionEnLista[];
  readonly cuentas: CuentasDeBandeja;
  readonly bandeja: Bandeja;
  readonly busqueda: string;
  readonly etiqueta: string;
  readonly etiquetas: readonly CategoriaDeEtiqueta[];
  readonly escogida: string | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly hayMas: boolean;
  /** Ofrecer empezar una conversacion a quien no puede escribir es un boton
   *  que la base va a rechazar. Se esconde. */
  readonly puedeEscribir: boolean;
  onBandeja(b: Bandeja): void;
  onBuscar(texto: string): void;
  onEtiqueta(id: string): void;
  onEscoger(c: ConversacionEnLista): void;
  onVerMas(): void;
  onNuevo(): void;
  onReintentar(): void;
}

export function ListaDeConversaciones({
  conversaciones,
  cuentas,
  bandeja,
  busqueda,
  etiqueta,
  etiquetas,
  escogida,
  cargando,
  error,
  hayMas,
  puedeEscribir,
  onBandeja,
  onBuscar,
  onEtiqueta,
  onEscoger,
  onVerMas,
  onNuevo,
  onReintentar,
}: PropiedadesDeLaLista) {
  const cuantas = (b: Bandeja): number =>
    b === 'todas' ? cuentas.todas
      : b === 'no_leidas' ? cuentas.noLeidas
        : b === 'pendientes' ? cuentas.pendientes
          : cuentas.archivadas;

  return (
    <section className="msj-lista" aria-label="Conversaciones">
      <div className="pz-pestanas" role="tablist" aria-label="Bandejas">
        {BANDEJAS.map((b) => (
          <button
            key={b.clave}
            type="button"
            role="tab"
            aria-selected={bandeja === b.clave}
            className={`pz-pestana${bandeja === b.clave ? ' pz-pestana--puesta' : ''}`}
            onClick={() => onBandeja(b.clave)}
          >
            {b.etiqueta}
            {/* El contador solo aparece si hay algo que contar. Un "0" al lado
                de cada pestaña es ruido que se deja de leer en un día. */}
            {cuantas(b.clave) > 0 ? (
              <span className="pz-pastilla pz-pastilla--marca">{cuantas(b.clave)}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* SIEMPRE en el mismo sitio del árbol: es lo que sostiene el foco
          mientras la lista de abajo cambia con cada letra. */}
      <div className="msj-filtros">
        <div className="pz-buscador">
          <span className="pz-buscador__lupa" aria-hidden="true">
            <Icono nombre="lupa" lado={16} />
          </span>
          <input
            type="search"
            className="pz-buscador__campo"
            autoComplete="off"
            placeholder="Buscar conversación…"
            aria-label="Buscar conversación"
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
          />
        </div>
        <label className="pz-campo pz-campo--corto">
          <span className="neron-solo-lectores">Filtrar por etiqueta</span>
          <select value={etiqueta} onChange={(e) => onEtiqueta(e.target.value)}>
            <option value="">Todas las etiquetas</option>
            {/* SALEN DE LAS ETIQUETAS DE VERDAD del centro. Si no hay ninguna,
                el desplegable trae solo "Todas": no se inventan cinco de
                ejemplo para que se vea lleno. */}
            {etiquetas.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No se pudieron cargar las conversaciones.</p>
          <p className="pz-error__detalle">{error}</p>
          <button type="button" className="pz-boton" onClick={onReintentar}>Reintentar</button>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando las conversaciones</span>
          {[0, 1, 2].map((i) => <div key={i} className="pz-silueta" />)}
        </div>
      ) : conversaciones.length === 0 ? (
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="mensaje" lado={44} />
          </span>
          <p className="pz-vacio__titulo">
            {busqueda || etiqueta
              ? 'Nada coincide con eso.'
              : bandeja === 'archivadas'
                ? 'No has archivado ninguna conversación.'
                : bandeja === 'no_leidas'
                  ? 'No tienes mensajes sin leer.'
                  : bandeja === 'pendientes'
                    ? 'No hay nadie esperando respuesta.'
                    : 'No hay conversaciones.'}
          </p>
          <p className="pz-vacio__texto">
            {busqueda || etiqueta
              ? 'Prueba con otro texto, o quita el filtro de etiqueta.'
              : 'Cuando tus clientes te escriban, aparecerán aquí.'}
          </p>
          {!busqueda && !etiqueta && bandeja === 'todas' && puedeEscribir ? (
            <button type="button" className="pz-boton pz-boton--principal" onClick={onNuevo}>
              <Icono nombre="mas" lado={16} /> Nuevo mensaje
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="msj-hilos mv-escalonado">
            {conversaciones.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`msj-hilo${escogida === c.id ? ' msj-hilo--puesto' : ''}`}
                  aria-current={escogida === c.id ? 'true' : undefined}
                  onClick={() => onEscoger(c)}
                >
                  <span className="pz-inicial pz-inicial--chica" aria-hidden="true">
                    {comoSeLlama(c).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="msj-hilo__cuerpo">
                    <span className="msj-hilo__arriba">
                      <span className="pz-renglon__titulo">{comoSeLlama(c)}</span>
                      <span className="msj-hilo__cuando">{cuandoFue(c.ultimoEn)}</span>
                    </span>
                    <span className="msj-hilo__abajo">
                      <span className="msj-hilo__ultimo">
                        {c.ultimo
                          ? `${c.ultimo.direccion === 'saliente' ? 'Tú: ' : ''}${c.ultimo.cuerpo}`
                          : 'Sin mensajes todavía'}
                      </span>
                      {c.sinLeer > 0 ? (
                        <span className="msj-sin-leer" aria-label={`${c.sinLeer} sin leer`}>
                          {c.sinLeer}
                        </span>
                      ) : null}
                    </span>
                    <span className="msj-hilo__marcas">
                      {c.favorita ? (
                        <span className="pz-pastilla pz-pastilla--aviso">Favorita</span>
                      ) : null}
                      {c.etiquetas.map((e) => (
                        <span
                          key={e.id}
                          className="pz-pastilla"
                          style={e.color ? { background: `${e.color}22`, color: e.color } : undefined}
                        >
                          {e.nombre}
                        </span>
                      ))}
                      {/* De qué canal viene. Sin canal se dice: un hilo suelto
                          no se puede contestar y hay que verlo antes de
                          escribir. */}
                      <span className="msj-hilo__canal">
                        {c.canalTipo ? COMO_SE_DICE_EL_CANAL[c.canalTipo] : 'Sin canal'}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {hayMas ? (
            <button type="button" className="pz-boton pz-boton--ancho" onClick={onVerMas}>
              Ver más conversaciones
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
