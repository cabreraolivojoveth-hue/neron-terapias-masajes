/**
 * LA COLUMNA DE LA DERECHA: quién es, cómo va la mensajería y los atajos.
 *
 * LO QUE SE SABE DEL CLIENTE SALE DE SU EXPEDIENTE, no de aquí. Visitas,
 * compras, lo que lleva gastado, su próxima cita y su adeudo se leen del módulo
 * de Clientes y de Ventas. Copiar esas cifras a Mensajes es exactamente como
 * empiezan los números que no cuadran entre dos pantallas — y aquí serían
 * números sobre dinero.
 *
 * LO FINANCIERO SE ESCONDE SIN `verFinanzas`. No es cortesía: la base tampoco
 * se lo entrega a quien no lo tiene. Pero enseñar el hueco con un "—" haría
 * pensar que el cliente no debe nada, así que directamente no se pinta.
 *
 * UN HILO SIN CLIENTE NO SE RELLENA. Se ofrece atarlo a una ficha que ya exista
 * o crear una: inventarle un cliente al vuelo llenaría el directorio de
 * personas llamadas como su teléfono.
 */

import { formatearDinero } from '../datos/moneda.js';
import type { ExpedienteDeCliente } from '../datos/clientes.js';
import type {
  CanalDeMensajes,
  ConversacionEnLista,
  ResumenDeMensajes,
} from '../datos/mensajes.js';
import { COMO_SE_DICE_EL_CANAL, COMO_SE_DICE_EL_ESTADO_DEL_CANAL } from '../datos/mensajes.js';
import { Icono } from '../ui/iconos.js';

export interface PropiedadesDelPanel {
  readonly conversacion: ConversacionEnLista | null;
  readonly expediente: ExpedienteDeCliente | null;
  readonly cargandoExpediente: boolean;
  readonly resumen: ResumenDeMensajes | null;
  readonly canales: readonly CanalDeMensajes[];
  readonly puedeVerFinanzas: boolean;
  onVerCliente(): void;
  onVerCitas(): void;
  onVerCompras(): void;
  onCrearCliente(): void;
  onLigarCliente(): void;
  onNuevoMensaje(): void;
  onDifusion(): void;
  onAutomatizaciones(): void;
  onEtiquetas(): void;
  onCanales(): void;
}

export function PanelDelContacto({
  conversacion,
  expediente,
  cargandoExpediente,
  resumen,
  canales,
  puedeVerFinanzas,
  onVerCliente,
  onVerCitas,
  onVerCompras,
  onCrearCliente,
  onLigarCliente,
  onNuevoMensaje,
  onDifusion,
  onAutomatizaciones,
  onEtiquetas,
  onCanales,
}: PropiedadesDelPanel) {
  const raya = '—';

  return (
    <aside className="msj-costado" aria-label="Información y resumen">
      {conversacion ? (
        <section className="pz-tarjeta pz-tarjeta--apretada" aria-label="Quién es">
          <h3 className="tt-tarjeta">Quién es</h3>

          {conversacion.clienteId === null ? (
            <>
              {/* SIN FICHA NO SE INVENTA UNA. Se enseña por dónde entró y se
                  ofrecen las dos salidas honestas. */}
              <div className="pz-datos">
                <div className="pz-dato pz-dato--renglon">
                  <span className="tt-etiqueta">Contacto</span>
                  <span className="pz-dato__valor">{conversacion.contacto}</span>
                </div>
              </div>
              <p className="tt-secundario">
                Este contacto todavía no está en Clientes. Átalo a una ficha que ya exista, o crea
                una — la conversación se queda ligada sola.
              </p>
              <button type="button" className="pz-boton pz-boton--ancho" onClick={onLigarCliente}>
                <Icono nombre="lupa" lado={16} /> Buscar en Clientes
              </button>
              <button
                type="button"
                className="pz-boton pz-boton--principal pz-boton--ancho"
                onClick={onCrearCliente}
              >
                <Icono nombre="personaMas" lado={16} /> Crear cliente
              </button>
            </>
          ) : cargandoExpediente ? (
            <div className="pz-cargando" aria-busy="true">
              <div className="pz-silueta pz-silueta--linea" />
              <div className="pz-silueta pz-silueta--linea" />
            </div>
          ) : (
            <>
              <div className="pz-datos">
                <div className="pz-dato pz-dato--renglon">
                  <span className="tt-etiqueta">Nombre</span>
                  <button type="button" className="pz-enlace" onClick={onVerCliente}>
                    {expediente?.nombre ?? conversacion.cliente ?? conversacion.contacto}
                  </button>
                </div>
                <div className="pz-dato pz-dato--renglon">
                  <span className="tt-etiqueta">Teléfono</span>
                  <span className="pz-dato__valor">{expediente?.telefono ?? raya}</span>
                </div>
                <div className="pz-dato pz-dato--renglon">
                  <span className="tt-etiqueta">Correo</span>
                  <span className="pz-dato__valor">{expediente?.correo ?? raya}</span>
                </div>
                <div className="pz-dato pz-dato--renglon">
                  <span className="tt-etiqueta">Visitas</span>
                  <span className="pz-dato__valor">{expediente ? expediente.visitas : raya}</span>
                </div>
                {/* El dinero solo con permiso. Ver la cabecera del archivo. */}
                {puedeVerFinanzas && expediente ? (
                  <>
                    <div className="pz-dato pz-dato--renglon">
                      <span className="tt-etiqueta">Ha gastado</span>
                      <span className="pz-dato__valor">
                        {formatearDinero(expediente.totalGastado)}
                      </span>
                    </div>
                    {expediente.adeudo > 0 ? (
                      <div className="pz-dato pz-dato--renglon">
                        <span className="tt-etiqueta">Debe</span>
                        <span className="pz-pastilla pz-pastilla--peligro">
                          {formatearDinero(expediente.adeudo)}
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>

              {/* LOS ATAJOS LLEVAN AL MODULO, no abren una copia aquí. La cita
                  vive en Agenda y la venta en Caja: duplicarlas sería tener dos
                  versiones de la misma cita. */}
              <button type="button" className="pz-boton pz-boton--ancho" onClick={onVerCliente}>
                <Icono nombre="persona" lado={16} /> Ver su expediente
              </button>
              <button type="button" className="pz-boton pz-boton--ancho" onClick={onVerCitas}>
                <Icono nombre="calendario" lado={16} /> Ver sus citas
              </button>
              {puedeVerFinanzas ? (
                <button type="button" className="pz-boton pz-boton--ancho" onClick={onVerCompras}>
                  <Icono nombre="recibo" lado={16} /> Ver sus compras
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <section className="pz-tarjeta pz-tarjeta--apretada" aria-label="Resumen de mensajes">
        <h3 className="tt-tarjeta">Resumen de mensajes</h3>
        <div className="pz-datos">
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Enviados</span>
            <span className="pz-dato__valor">{resumen ? resumen.enviados : raya}</span>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Recibidos</span>
            <span className="pz-dato__valor">{resumen ? resumen.recibidos : raya}</span>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Pendientes</span>
            <span className="pz-dato__valor">{resumen ? resumen.pendientes : raya}</span>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Tasa de respuesta</span>
            {/* SIN NADIE A QUIEN RESPONDER NO HAY TASA. Un 0% afirmaría que se
                dejó a todo el mundo sin contestar; lo cierto es que no había a
                quién. */}
            <span className="pz-dato__valor">
              {!resumen ? raya
                : resumen.tasaRespuesta === null ? 'Sin datos'
                  : `${resumen.tasaRespuesta.toFixed(1)}%`}
            </span>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <span className="tt-etiqueta">Tiempo de respuesta</span>
            <span className="pz-dato__valor">
              {!resumen ? raya
                : resumen.minutosDeRespuesta === null ? 'Sin datos suficientes'
                  : resumen.minutosDeRespuesta < 60
                    ? `${resumen.minutosDeRespuesta} min`
                    : `${Math.round(resumen.minutosDeRespuesta / 60)} h`}
            </span>
          </div>
        </div>
      </section>

      <section className="pz-tarjeta pz-tarjeta--apretada" aria-label="Acciones rápidas">
        <h3 className="tt-tarjeta">Acciones rápidas</h3>
        <div className="msj-atajos">
          <button type="button" className="pz-boton" onClick={onNuevoMensaje}>
            <Icono nombre="mensaje" lado={16} /> Nuevo mensaje
          </button>
          <button type="button" className="pz-boton" onClick={onDifusion}>
            <Icono nombre="personas" lado={16} /> Enviar difusión
          </button>
          <button type="button" className="pz-boton" onClick={onAutomatizaciones}>
            <Icono nombre="reloj" lado={16} /> Mensajes automáticos
          </button>
          <button type="button" className="pz-boton" onClick={onEtiquetas}>
            <Icono nombre="cuadricula" lado={16} /> Etiquetas
          </button>
        </div>
      </section>

      <section className="pz-tarjeta pz-tarjeta--apretada" aria-label="Canales conectados">
        <div className="rep-tarjeta__cabeza">
          <h3 className="tt-tarjeta">Canales</h3>
          <button type="button" className="pz-enlace pz-enlace--pelado" onClick={onCanales}>
            Administrar
          </button>
        </div>

        {canales.length === 0 ? (
          <div className="pz-vacio pz-vacio--chico">
            <span className="pz-vacio__icono" aria-hidden="true">
              <Icono nombre="telefono" lado={20} />
            </span>
            <p className="pz-vacio__texto">
              No hay canales conectados. Conecta uno para empezar a recibir mensajes.
            </p>
          </div>
        ) : (
          <ul className="pz-lista">
            {canales.map((c) => (
              <li key={c.id} className="pz-dato pz-dato--renglon">
                <span className="pz-dato__valor">{COMO_SE_DICE_EL_CANAL[c.tipo]}</span>
                {/* EL ESTADO ES EL DE VERDAD. Mientras nadie haya hablado con
                    el proveedor dice "Sin conectar", y eso es lo correcto:
                    pintar "Conectado" haría fallar cada envío culpando al
                    mensaje. */}
                <span
                  className={`pz-pastilla ${
                    c.estado === 'conectado' ? 'pz-pastilla--exito'
                      : c.estado === 'error' ? 'pz-pastilla--peligro' : 'pz-pastilla--aviso'
                  }`}
                >
                  {COMO_SE_DICE_EL_ESTADO_DEL_CANAL[c.estado]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
