/**
 * EL DETALLE DE UNA VENTA — el ticket, tal como se cobro.
 *
 * LOS PRECIOS SON LOS DE ESE DIA, no los del catalogo de hoy. Si Reiki costaba
 * $800 y hoy cuesta $900, este ticket sigue diciendo $800: lo dice la foto que
 * `venta_item` guardo al cobrar. Si se leyera el catalogo actual, todos los
 * tickets del año pasado cambiarian solos y ningun corte volveria a cuadrar.
 *
 * CANCELAR NO BORRA. La venta se queda en la lista, marcada; el stock vuelve
 * con un movimiento CONTRARIO, y la caja recibe el egreso contrario. Un
 * registro financiero que se puede tachar no sirve para auditar nada.
 */

import { Boton, Campo, Confirmacion } from '@neron/base/ui';
import { useState } from 'react';
import { formatearDinero } from '../datos/moneda.js';
import type { FichaDeVenta } from '../datos/ventas.js';
import { COMO_SE_DICE_EL_METODO, COMO_SE_DICE_EL_TIPO } from '../datos/ventas.js';
import { Icono } from '../ui/iconos.js';
import { COMO_SE_DICE_LA_VENTA } from './historial.js';

/** Que se puede hacer con una venta, segun su estado y quien la mira. */
export function sePuedeCancelar(
  venta: FichaDeVenta | null,
  permisos: Readonly<Record<string, boolean>>,
): boolean {
  if (!venta) return false;
  if (venta.estado !== 'cobrada') return false;
  return permisos['cobrar'] === true;
}

/** La utilidad de un renglon. `null` cuando no hay costo que ver. */
export function utilidadDelRenglon(
  subtotalCentavos: number,
  costoUnitario: number | null,
  cantidad: number,
): number | null {
  if (costoUnitario === null) return null;
  return subtotalCentavos - costoUnitario * cantidad;
}

export interface PropiedadesDelDetalle {
  readonly venta: FichaDeVenta | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly trabajando: boolean;
  readonly errorDeOperacion: string | null;
  onCerrar(): void;
  onCancelar(motivo: string): void;
  onVerCliente(clienteId: string): void;
}

export function DetalleDeVenta({
  venta,
  cargando,
  error,
  permisos,
  trabajando,
  errorDeOperacion,
  onCerrar,
  onCancelar,
  onVerCliente,
}: PropiedadesDelDetalle) {
  const [aCancelar, setACancelar] = useState(false);
  const [motivo, setMotivo] = useState('');

  if (cargando) {
    return (
      <aside className="pz-tarjeta" aria-busy="true">
        <span className="neron-solo-lectores">Cargando la venta</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="pz-silueta" />
        ))}
      </aside>
    );
  }

  if (error) {
    return (
      <aside className="pz-tarjeta">
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar la venta.</p>
          <p className="pz-error__detalle">{error}</p>
        </div>
      </aside>
    );
  }

  if (!venta) {
    return (
      <aside className="pz-tarjeta">
        <div className="pz-vacio pz-vacio--chico">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="recibo" lado={36} />
          </span>
          <p className="pz-vacio__texto">
            Abre una venta de la lista para ver su ticket: lo que se llevó, a qué precio se cobró y
            con qué se pagó.
          </p>
        </div>
      </aside>
    );
  }

  const verCostos = permisos['verCostos'] === true || permisos['verFinanzas'] === true;

  return (
    <aside className="pz-tarjeta vta-detalle" aria-label={`Venta ${venta.folio}`}>
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta">{venta.folio}</h3>
        <span className={`pz-pastilla vta-estado--${venta.estado}`}>
          {COMO_SE_DICE_LA_VENTA[venta.estado] ?? venta.estado}
        </span>
        <button type="button" className="pz-icono-boton" aria-label="Cerrar la venta" onClick={onCerrar}>
          ×
        </button>
      </header>

      <div className="pz-columna">
        <p className="pz-dato__valor">
          {venta.fecha}
          {venta.vendedor ? ` · ${venta.vendedor}` : ''}
        </p>

        <p className="pz-dato__valor">
          {venta.clienteId ? (
            <button
              type="button"
              className="pz-renglon__enlace pz-renglon"
              onClick={() => onVerCliente(venta.clienteId!)}
            >
              {venta.cliente ?? 'Cliente'}
            </button>
          ) : (
            <span className="tt-falta">Venta de mostrador, sin cliente</span>
          )}
        </p>

        <div className="pz-tabla__marco">
          <table className="pz-tabla">
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Tipo</th>
                <th className="pz-tabla__numero">Cant.</th>
                <th className="pz-tabla__numero">Precio</th>
                <th className="pz-tabla__numero">Total</th>
              </tr>
            </thead>
            <tbody>
              {venta.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <span className="pz-renglon__cuerpo">
                      <span className="pz-renglon__titulo">{i.descripcion}</span>
                      {/* SOLO A QUIEN PUEDE VERLO. El costo llega nulo desde la
                          base cuando el rol no lo alcanza: no se esconde aqui. */}
                      {verCostos && i.costoUnitario !== null ? (
                        <span className="pz-renglon__pie">
                          Utilidad{' '}
                          {formatearDinero(
                            utilidadDelRenglon(i.subtotal, i.costoUnitario, i.cantidad) ?? 0,
                          )}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    <span className={`pz-pastilla vta-tipo--${i.tipo}`}>
                      {COMO_SE_DICE_EL_TIPO[i.tipo] ?? i.tipo}
                    </span>
                  </td>
                  <td className="pz-tabla__numero">{i.cantidad}</td>
                  {/* EL PRECIO DE ESE DIA. */}
                  <td className="pz-tabla__numero">{formatearDinero(i.precioUnitario)}</td>
                  <td className="pz-tabla__numero">{formatearDinero(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="vta-totales">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatearDinero(venta.subtotalCentavos)}</dd>
          </div>
          <div>
            <dt>Descuento</dt>
            <dd className={venta.descuentoCentavos > 0 ? 'vta-totales__resta' : ''}>
              {venta.descuentoCentavos > 0
                ? `−${formatearDinero(venta.descuentoCentavos)}`
                : formatearDinero(0)}
            </dd>
          </div>
          <div>
            <dt>Impuestos</dt>
            <dd>{formatearDinero(venta.impuestoCentavos)}</dd>
          </div>
          <div className="vta-totales__total">
            <dt>Total</dt>
            <dd>{formatearDinero(venta.totalCentavos)}</dd>
          </div>
        </dl>

        <div className="pz-renglon pz-renglon--quieto">
          <span className="pz-ficha" aria-hidden="true">
            <Icono nombre="dinero" lado={18} />
          </span>
          <div className="pz-dato">
            <span className="tt-etiqueta">Pagos</span>
            {venta.pagos.length === 0 ? (
              <span className="tt-falta">Sin pago registrado</span>
            ) : (
              <ul className="vta-pagos">
                {venta.pagos.map((p) => (
                  <li key={p.id} className="vta-pago">
                    <span className="vta-pago__metodo">
                      {COMO_SE_DICE_EL_METODO[p.metodo] ?? p.metodo}
                    </span>
                    <span className="vta-pago__monto">{formatearDinero(p.montoCentavos)}</span>
                  </li>
                ))}
              </ul>
            )}
            {/* LO RECIBIDO SE GUARDA APARTE del pago aplicado: el cambio no es
                un egreso, y a la caja entro lo aplicado. */}
            {venta.efectivoRecibidoCentavos !== null ? (
              <span className="tt-secundario">
                Recibió {formatearDinero(venta.efectivoRecibidoCentavos)} en efectivo. El cambio no
                se registró como salida.
              </span>
            ) : null}
          </div>
        </div>

        {venta.notas ? (
          <div className="pz-renglon pz-renglon--quieto">
            <span className="pz-ficha" aria-hidden="true">
              <Icono nombre="nota" lado={18} />
            </span>
            <div className="pz-dato">
              <span className="tt-etiqueta">Nota</span>
              <p className="tt-libre">{venta.notas}</p>
            </div>
          </div>
        ) : null}

        {venta.estado === 'cancelada' ? (
          <div className="pz-renglon pz-renglon--quieto">
            <span className="pz-ficha" aria-hidden="true">
              <Icono nombre="prohibido" lado={18} />
            </span>
            <div className="pz-dato">
              <span className="tt-etiqueta">Cancelada</span>
              <span className="pz-dato__valor">
                {venta.canceladaMotivo ?? 'Sin motivo anotado'}
              </span>
              <span className="tt-secundario">
                El inventario volvió con un movimiento contrario y la caja recibió el egreso. Nada
                se borró.
              </span>
            </div>
          </div>
        ) : null}

        {errorDeOperacion ? (
          <p className="pz-error__que" role="alert">
            {errorDeOperacion}
          </p>
        ) : null}

        {sePuedeCancelar(venta, permisos) ? (
          <div className="pz-encabezado__acciones">
            <Boton tono="contorno" type="button" onClick={() => setACancelar(true)}>
              Cancelar venta
            </Boton>
          </div>
        ) : null}
      </div>

      <Confirmacion
        abierto={aCancelar}
        titulo={`Cancelar la venta ${venta.folio}`}
        confirmar="Cancelar la venta"
        destructivo
        trabajando={trabajando}
        onConfirmar={() => {
          onCancelar(motivo);
          setACancelar(false);
          setMotivo('');
        }}
        onCancelar={() => setACancelar(false)}
      >
        <p>
          La venta NO se borra: se queda en el historial marcada como cancelada. Los productos
          vuelven al inventario con un movimiento contrario, la inscripción a curso que haya pagado
          se da de baja, y la caja recibe el egreso contrario por {formatearDinero(venta.totalCentavos)}.
        </p>
        <Campo
          etiqueta="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={200}
          ayuda="Queda guardado con la venta. Dentro de seis meses es lo único que explica por qué."
        />
      </Confirmacion>
    </aside>
  );
}
