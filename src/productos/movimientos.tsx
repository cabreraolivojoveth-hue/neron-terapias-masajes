/**
 * LA PESTAÑA DE INVENTARIO — el stock y POR QUE es el que es.
 *
 * Esta es la pestaña que justifica todo el modulo. Un numero suelto no dice
 * nada: "18" no explica por que no son 20. La lista de movimientos sí.
 *
 * CADA AJUSTE EXIGE UN MOTIVO. Un ajuste sin motivo es exactamente el
 * `update stock = 20` que este modulo existe para evitar — solo que con mas
 * pasos.
 *
 * Y NO SE PUEDE SACAR MAS DE LO QUE HAY. Lo rechaza la base, no esta pantalla:
 * comprobar aqui es una comodidad, comprobar alla es lo que de verdad impide
 * que el inventario quede en negativo.
 */

import { Boton, Campo, Seleccion } from '@neron/base/ui';
import { useState } from 'react';
import { formatearDinero } from '../datos/moneda.js';
import type { DatosDeAjuste, FichaDeProducto } from '../datos/productos.js';
import { COMO_SE_DICE_EL_MOVIMIENTO } from '../datos/productos.js';
import { Icono } from '../ui/iconos.js';

export const AJUSTE_VACIO: DatosDeAjuste = { tipo: 'entrada', cantidad: 1, motivo: '' };

export const TIPOS_DE_AJUSTE: readonly { valor: DatosDeAjuste['tipo']; texto: string }[] = [
  { valor: 'entrada', texto: 'Entrada — llegó mercancía' },
  { valor: 'ajuste_entrada', texto: 'Corrección — había más de lo registrado' },
  { valor: 'ajuste_salida', texto: 'Corrección — había menos de lo registrado' },
  { valor: 'merma', texto: 'Merma — se dañó o se perdió' },
  { valor: 'caducado', texto: 'Caducado — se venció' },
];

/** Si ese tipo saca piezas del inventario. */
export const esSalida = (t: DatosDeAjuste['tipo']): boolean =>
  t === 'ajuste_salida' || t === 'merma' || t === 'caducado';

export function validarAjuste(d: DatosDeAjuste, stockActual: number): string | null {
  if (!Number.isFinite(d.cantidad) || d.cantidad <= 0) {
    return 'La cantidad tiene que ser mayor que cero.';
  }
  // El motivo es OBLIGATORIO. Sin el, tres meses despues nadie sabe por que
  // faltaban dos piezas.
  if (!d.motivo.trim()) return 'Escribe el motivo del ajuste.';
  // Se avisa aqui para no hacer el viaje, pero quien de verdad lo impide es la
  // base: esta comprobacion es una cortesia, no la defensa.
  if (esSalida(d.tipo) && d.cantidad > stockActual) {
    return `Solo hay ${stockActual}: no se pueden sacar ${d.cantidad}.`;
  }
  return null;
}

/** Cómo se lee la cantidad de un movimiento, con su signo. */
export function comoSeLeeLaCantidad(cantidad: number): string {
  return cantidad > 0 ? `+${cantidad}` : String(cantidad);
}

export interface PropiedadesDeMovimientos {
  readonly ficha: FichaDeProducto;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly trabajando: boolean;
  readonly error: string | null;
  onAjustar(datos: DatosDeAjuste): void;
}

export function Movimientos({
  ficha,
  permisos,
  trabajando,
  error,
  onAjustar,
}: PropiedadesDeMovimientos) {
  const [ajustando, setAjustando] = useState(false);
  const [v, setV] = useState<DatosDeAjuste>(AJUSTE_VACIO);
  const [fallo, setFallo] = useState<string | null>(null);
  const puedeGestionar = permisos['gestionarInventario'] === true;

  const poner = <K extends keyof DatosDeAjuste>(k: K, valor: DatosDeAjuste[K]): void =>
    setV((a) => ({ ...a, [k]: valor }));

  function guardar(): void {
    const problema = validarAjuste(v, ficha.stockActual);
    setFallo(problema);
    if (problema) return;
    onAjustar(v);
    setV(AJUSTE_VACIO);
    setAjustando(false);
  }

  return (
    <div className="srv-detalle__cuerpo">
      <div className="prd-cifras">
        <span className="prd-cifra">
          <span className="tt-etiqueta">Stock actual</span>
          <span className="prd-cifra__valor">
            {ficha.stockActual} {ficha.unidad}
          </span>
        </span>
        <span className="prd-cifra">
          <span className="tt-etiqueta">Stock mínimo</span>
          <span className="prd-cifra__valor">{ficha.stockMinimo}</span>
        </span>
        <span className="prd-cifra">
          <span className="tt-etiqueta">Valor</span>
          {/* `null` es "no puedes ver costos", no "vale cero". */}
          <span className="prd-cifra__valor">
            {ficha.valorCentavos === null ? '—' : formatearDinero(ficha.valorCentavos)}
          </span>
        </span>
      </div>

      {puedeGestionar ? (
        ajustando ? (
          <div className="cat__forma">
            <Seleccion
              etiqueta="Qué pasó"
              value={v.tipo}
              onChange={(e) => poner('tipo', e.target.value as DatosDeAjuste['tipo'])}
              opciones={TIPOS_DE_AJUSTE.map((t) => ({ valor: t.valor, texto: t.texto }))}
            />
            <Campo
              etiqueta="Cantidad"
              type="text"
              inputMode="numeric"
              value={String(v.cantidad)}
              onChange={(e) => poner('cantidad', Number(e.target.value.replace(/[^\d]/g, '') || 0))}
              obligatorio
            />
            <Campo
              etiqueta="Motivo"
              value={v.motivo}
              onChange={(e) => poner('motivo', e.target.value)}
              obligatorio
              maxLength={200}
              ayuda="Queda registrado. Tres meses después esto es lo único que explica el número."
            />

            {fallo ? (
              <p className="pz-error__que" role="alert">
                {fallo}
              </p>
            ) : null}
            {error ? (
              <p className="pz-error__que" role="alert">
                {error}
              </p>
            ) : null}

            <div className="pz-ficha__pie">
              <Boton tono="contorno" type="button" onClick={() => setAjustando(false)}>
                Cancelar
              </Boton>
              <Boton tono="principal" type="button" trabajando={trabajando} onClick={guardar}>
                Registrar movimiento
              </Boton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="pz-boton pz-boton--principal"
            onClick={() => {
              setFallo(null);
              setAjustando(true);
            }}
          >
            <Icono nombre="mas" lado={16} /> Ajustar inventario
          </button>
        )
      ) : null}

      {ficha.movimientos.length === 0 ? (
        <p className="pz-vacio__texto">
          Todavía no hay movimientos. Cada entrada, salida y venta queda aquí con su fecha, su
          motivo y quién la hizo.
        </p>
      ) : (
        <ul className="prd-movimientos">
          {ficha.movimientos.map((m) => (
            <li key={m.id} className="prd-movimiento">
              <span
                className={`prd-movimiento__cantidad${m.cantidad > 0 ? ' prd-movimiento__cantidad--entra' : ' prd-movimiento__cantidad--sale'}`}
              >
                {comoSeLeeLaCantidad(m.cantidad)}
              </span>
              <span className="pz-renglon__cuerpo">
                <span className="pz-renglon__titulo">
                  {COMO_SE_DICE_EL_MOVIMIENTO[m.tipo] ?? m.tipo}
                </span>
                <span className="pz-renglon__pie">
                  {/* ANTES y DESPUES, los dos: es lo que permite localizar un
                      descuadre leyendo la lista. */}
                  {m.stockAntes} → {m.stockDespues}
                  {m.motivo ? ` · ${m.motivo}` : ''}
                </span>
                <span className="pz-renglon__pie">
                  {m.quien ?? 'El sistema'} · {m.cuando.slice(0, 10).split('-').reverse().join('/')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
