/**
 * EL COBRO — resumen, metodos, cambio, y el descuento general.
 *
 * VARIOS PAGOS, NO UN METODO "MIXTO". "Mixto" es un boton de la pantalla, no
 * un valor que se guarde: al apretarlo se abre el reparto y salen DOS pagos.
 * Guardar `metodo = 'mixto'` perderia el detalle, y entonces el corte de caja
 * no puede saber cuanto entro en efectivo — que es justo lo que hay que
 * contar en el cajon al cerrar.
 *
 * EL CAMBIO NO ES UN EGRESO. Si el cliente da mil por una venta de
 * novecientos, entraron novecientos: los cien eran suyos desde el principio.
 * Por eso el pago registrado es lo APLICADO, y el efectivo recibido se guarda
 * aparte, solo para el ticket.
 *
 * EL BOTON SE BLOQUEA MIENTRAS COBRA, pero eso NO es la defensa contra el
 * doble clic: la defensa es la llave de idempotencia que viaja al servidor.
 * Una red lenta reintenta sola, y la pestaña de al lado no sabe de este boton.
 *
 * LOS IMPUESTOS SALEN EN CERO PORQUE NO HAY NINGUNO CONFIGURADO, no porque
 * falte codigo. El dia que Configuracion los declare, la cifra viene de ahi.
 */

import { Boton } from '@neron/base/ui';
import { formatearMoneda } from '@neron/base/utils';
import type { MetodoDePago, PagoDelCarrito, RenglonDelCarrito } from '../datos/ventas.js';
import {
  COMO_SE_DICE_EL_METODO,
  METODOS,
  cambioDe,
  descuentoPorcentual,
  faltaPorPagar,
  subtotalDelCarrito,
  sumaDeLosPagos,
  totalDelCarrito,
} from '../datos/ventas.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

/** El icono de cada metodo. Efectivo es el unico que de verdad es dinero. */
const ICONO_DEL_METODO: Readonly<Record<MetodoDePago, NombreDeIcono>> = {
  efectivo: 'dinero',
  tarjeta: 'recibo',
  transferencia: 'barras',
  otro: 'nota',
};

/** Los cuatro botones de la foto. "Mixto" NO es un metodo: abre el reparto. */
export const BOTONES_DE_PAGO: readonly { clave: string; etiqueta: string; icono: NombreDeIcono }[] =
  [
    { clave: 'efectivo', etiqueta: 'Efectivo', icono: 'dinero' },
    { clave: 'tarjeta', etiqueta: 'Tarjeta', icono: 'recibo' },
    { clave: 'transferencia', etiqueta: 'Transferencia', icono: 'barras' },
    { clave: 'mixto', etiqueta: 'Mixto', icono: 'cuadricula' },
  ];

/** Si la venta se puede cobrar ya. */
export function sePuedeCobrar(
  renglones: readonly RenglonDelCarrito[],
  descuento: number,
  pagos: readonly PagoDelCarrito[],
): boolean {
  if (renglones.length === 0) return false;
  if (totalDelCarrito(renglones, descuento) <= 0) return false;
  return faltaPorPagar(renglones, descuento, pagos) === 0;
}

/** Lo que se le dice a quien todavía no puede cobrar. */
export function porQueNoSePuedeCobrar(
  renglones: readonly RenglonDelCarrito[],
  descuento: number,
  pagos: readonly PagoDelCarrito[],
): string {
  if (renglones.length === 0) return 'Agrega algo a la venta.';
  const total = totalDelCarrito(renglones, descuento);
  if (total <= 0) return 'El total quedó en cero: revisa los descuentos.';
  const falta = faltaPorPagar(renglones, descuento, pagos);
  if (falta > 0) return `Faltan ${formatearMoneda(falta)} por cubrir.`;
  if (falta < 0) return `Los pagos se pasan por ${formatearMoneda(-falta)}.`;
  return '';
}

/**
 * Lo que vale un descuento escrito, ya en centavos.
 *
 * Se calcula UNA vez sobre el subtotal. Aplicar el porcentaje renglon por
 * renglon y sumar da un peso de diferencia con la calculadora del cliente, y
 * esa diferencia es imposible de explicar en un mostrador.
 */
export function descuentoEscrito(
  escrito: string,
  comoPorcentaje: boolean,
  subtotalCentavos: number,
): number {
  const n = Number(escrito.replace(/[^\d]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const bruto = comoPorcentaje ? descuentoPorcentual(subtotalCentavos, n) : n * 100;
  // Nunca mas que el subtotal: un total negativo seria una devolucion, no una
  // venta, y el servidor lo rechazaria al final con el cliente enfrente.
  return Math.min(bruto, subtotalCentavos);
}

/* ------------------------------------------------------------------ */
/* Los cuatro botones grandes, debajo de la tabla                      */
/* ------------------------------------------------------------------ */

export function PagoRapido({
  puesto,
  onEscoger,
}: {
  readonly puesto: string;
  onEscoger(clave: string): void;
}) {
  return (
    <section className="cli-panel" aria-labelledby="vta-rapido-titulo">
      <h3 className="cli-panel__titulo" id="vta-rapido-titulo">
        Método de pago rápido
      </h3>
      <div className="vta-metodos__botones" role="group" aria-label="Método de pago rápido">
        {BOTONES_DE_PAGO.map((b) => (
          <button
            key={b.clave}
            type="button"
            className={`vta-metodo vta-metodo--${b.clave}${
              puesto === b.clave ? ' vta-metodo--puesto' : ''
            }`}
            aria-pressed={puesto === b.clave}
            onClick={() => onEscoger(b.clave)}
          >
            <Icono nombre={b.icono} lado={16} /> {b.etiqueta}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Aplicar descuento                                                   */
/* ------------------------------------------------------------------ */

export function AplicarDescuento({
  escrito,
  comoPorcentaje,
  subtotalCentavos,
  puede,
  onEscrito,
  onComoPorcentaje,
  onAplicar,
}: {
  readonly escrito: string;
  readonly comoPorcentaje: boolean;
  readonly subtotalCentavos: number;
  readonly puede: boolean;
  onEscrito(texto: string): void;
  onComoPorcentaje(si: boolean): void;
  onAplicar(centavos: number): void;
}) {
  const valdria = descuentoEscrito(escrito, comoPorcentaje, subtotalCentavos);

  return (
    <section className="cli-panel" aria-labelledby="vta-descuento-titulo">
      <h3 className="cli-panel__titulo" id="vta-descuento-titulo">
        Aplicar descuento
      </h3>

      {/* SIN PERMISO NO SE ESCONDE EL PANEL: se dice por que no se puede. Un
          panel que desaparece hace pensar que el sistema esta incompleto. */}
      {puede ? (
        <div className="vta-descuento-general">
          <span className="vta-descuento__signo" aria-hidden="true">
            {comoPorcentaje ? '%' : '$'}
          </span>
          <input
            className="vta-descuento__campo"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={comoPorcentaje ? 'Descuento en porcentaje' : 'Descuento en pesos'}
            value={escrito}
            onChange={(e) => onEscrito(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="0"
          />
          <label className="cli-campo cli-campo--corto">
            <span className="neron-solo-lectores">Cómo se aplica el descuento</span>
            <select
              value={comoPorcentaje ? 'porcentaje' : 'monto'}
              onChange={(e) => onComoPorcentaje(e.target.value === 'porcentaje')}
            >
              <option value="monto">Monto</option>
              <option value="porcentaje">Porcentaje</option>
            </select>
          </label>
          <button
            type="button"
            className="cli-boton-suave"
            disabled={valdria <= 0}
            onClick={() => onAplicar(valdria)}
          >
            Aplicar
          </button>
        </div>
      ) : (
        <p className="cli-exp__secundario">
          Tu rol no aplica descuentos. Quien administra el centro puede hacerlo.
        </p>
      )}

      {puede && valdria > 0 ? (
        <p className="cli-ficha__duplicado-nota" role="status">
          Quedaría un descuento de {formatearMoneda(valdria)} sobre el subtotal.
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* El panel de la derecha                                              */
/* ------------------------------------------------------------------ */

export interface PropiedadesDelCobro {
  readonly renglones: readonly RenglonDelCarrito[];
  readonly descuentoCentavos: number;
  readonly pagos: readonly PagoDelCarrito[];
  readonly metodoPuesto: string;
  readonly efectivoRecibido: string;
  readonly trabajando: boolean;
  readonly error: string | null;
  onMetodo(clave: string): void;
  onAgregarPago(metodo: MetodoDePago): void;
  onMontoDelPago(indice: number, centavos: number): void;
  onQuitarPago(indice: number): void;
  onEfectivoRecibido(texto: string): void;
  onCobrar(): void;
  onCotizar(): void;
}

export function Cobro({
  renglones,
  descuentoCentavos,
  pagos,
  metodoPuesto,
  efectivoRecibido,
  trabajando,
  error,
  onMetodo,
  onAgregarPago,
  onMontoDelPago,
  onQuitarPago,
  onEfectivoRecibido,
  onCobrar,
  onCotizar,
}: PropiedadesDelCobro) {
  const subtotal = subtotalDelCarrito(renglones);
  const total = totalDelCarrito(renglones, descuentoCentavos);
  const pagado = sumaDeLosPagos(pagos);
  const falta = faltaPorPagar(renglones, descuentoCentavos, pagos);
  const enEfectivo = pagos
    .filter((p) => p.metodo === 'efectivo')
    .reduce((n, p) => n + p.montoCentavos, 0);
  const recibido = Number(efectivoRecibido.replace(/[^\d]/g, '') || 0) * 100;
  const cambio = cambioDe(enEfectivo, recibido);
  const listo = sePuedeCobrar(renglones, descuentoCentavos, pagos);

  return (
    <aside className="cli-panel vta-cobro" aria-labelledby="vta-resumen-titulo">
      <h3 className="cli-panel__titulo" id="vta-resumen-titulo">
        Resumen de la venta
      </h3>

      <dl className="vta-totales">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatearMoneda(subtotal)}</dd>
        </div>
        <div>
          <dt>Descuento</dt>
          <dd className={descuentoCentavos > 0 ? 'vta-totales__resta' : ''}>
            {descuentoCentavos > 0 ? `−${formatearMoneda(descuentoCentavos)}` : formatearMoneda(0)}
          </dd>
        </div>
        <div>
          {/* CERO PORQUE NO HAY NINGUNO CONFIGURADO, y se dice cual se aplico.
              Un "IVA (16%)" inventado cambia lo que el cliente paga. */}
          <dt>IVA (0%)</dt>
          <dd>{formatearMoneda(0)}</dd>
        </div>
        <div className="vta-totales__total">
          <dt>Total</dt>
          <dd>{formatearMoneda(total)}</dd>
        </div>
      </dl>

      <div className="vta-apagar">
        <span className="vta-apagar__que">Total a pagar</span>
        <span className="vta-apagar__cuanto">{formatearMoneda(total)}</span>
      </div>

      <div className="vta-metodos">
        <span className="cli-exp__etiqueta" id="vta-metodo-titulo">
          Método de pago
        </span>
        <div className="vta-metodos__rejilla" role="group" aria-labelledby="vta-metodo-titulo">
          {BOTONES_DE_PAGO.map((b) => (
            <button
              key={b.clave}
              type="button"
              className={`vta-metodo${metodoPuesto === b.clave ? ' vta-metodo--puesto' : ''}`}
              aria-pressed={metodoPuesto === b.clave}
              onClick={() => onMetodo(b.clave)}
            >
              <Icono nombre={b.icono} lado={16} /> {b.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* EL REPARTO. Sale al escoger "Mixto" —o en cuanto hay mas de un pago—
          porque es ahi donde dos renglones se convierten en el pago mixto. */}
      {metodoPuesto === 'mixto' || pagos.length > 1 ? (
        <div className="vta-reparto">
          <p className="cli-ficha__duplicado-nota">
            Agrega un renglón por cada forma en que te paguen. Dos renglones son el pago mixto: así
            el corte de caja sabe cuánto entró de cada cosa.
          </p>
          <div className="vta-metodos__botones" role="group" aria-label="Agregar forma de pago">
            {METODOS.map((m) => (
              <button
                key={m}
                type="button"
                className="cli-boton-suave"
                onClick={() => onAgregarPago(m)}
              >
                <Icono nombre={ICONO_DEL_METODO[m]} lado={14} /> {COMO_SE_DICE_EL_METODO[m]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {pagos.length > 0 ? (
        <ul className="vta-pagos">
          {pagos.map((p, i) => (
            <li key={`${p.metodo}:${i}`} className="vta-pago">
              <span className="vta-pago__metodo">{COMO_SE_DICE_EL_METODO[p.metodo]}</span>
              <input
                className="vta-descuento__campo"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`Monto en ${COMO_SE_DICE_EL_METODO[p.metodo]}, en pesos`}
                value={p.montoCentavos === 0 ? '' : String(p.montoCentavos / 100)}
                onChange={(e) =>
                  onMontoDelPago(i, Number(e.target.value.replace(/[^\d]/g, '') || 0) * 100)
                }
              />
              <button
                type="button"
                className="cli-menu__boton"
                aria-label={`Quitar el pago en ${COMO_SE_DICE_EL_METODO[p.metodo]}`}
                onClick={() => onQuitarPago(i)}
              >
                <Icono nombre="archivar" lado={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {enEfectivo > 0 ? (
        <div className="vta-efectivo">
          <label className="cli-campo cli-campo--bloque">
            <span className="cli-campo__etiqueta">Pago recibido</span>
            <span className="vta-descuento-general">
              <span className="vta-descuento__signo" aria-hidden="true">
                $
              </span>
              <input
                className="vta-descuento__campo"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label="Efectivo recibido, en pesos"
                value={efectivoRecibido}
                onChange={(e) => onEfectivoRecibido(e.target.value.replace(/[^\d]/g, ''))}
              />
            </span>
          </label>
          <div className="vta-cambio">
            <span className="cli-exp__etiqueta">Cambio</span>
            <span className="vta-cambio__valor">{formatearMoneda(cambio)}</span>
          </div>
          {/* EL CAMBIO NO ES UN EGRESO: a la caja entra lo aplicado. */}
          <p className="cli-ficha__duplicado-nota">
            El cambio no se registra como salida: a la caja entran{' '}
            {formatearMoneda(enEfectivo)} en efectivo.
          </p>
        </div>
      ) : null}

      {falta !== 0 && pagos.length > 0 ? (
        <p className="cli-ficha__duplicado-nota" role="status">
          {falta > 0
            ? `Faltan ${formatearMoneda(falta)}.`
            : `Se pasan ${formatearMoneda(-falta)}. Baja los montos: el cambio se calcula con el efectivo recibido, no pagando de más.`}
        </p>
      ) : null}

      {error ? (
        <p className="cli-ficha__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="vta-acciones">
        <Boton
          tono="principal"
          type="button"
          trabajando={trabajando}
          disabled={!listo || trabajando}
          onClick={onCobrar}
        >
          {trabajando ? 'Procesando…' : 'Finalizar venta'}
        </Boton>
        <Boton
          tono="contorno"
          type="button"
          disabled={renglones.length === 0 || trabajando}
          onClick={onCotizar}
        >
          Guardar como cotización
        </Boton>
      </div>

      {!listo && renglones.length > 0 ? (
        <p className="cli-exp__secundario">
          {porQueNoSePuedeCobrar(renglones, descuentoCentavos, pagos)}
        </p>
      ) : null}

      <span className="cli-exp__secundario">
        Pagado {formatearMoneda(pagado)} de {formatearMoneda(total)}
      </span>
    </aside>
  );
}
