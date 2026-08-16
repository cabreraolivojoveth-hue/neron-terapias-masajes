/**
 * LOS MOVIMIENTOS DE LA CAJA, AGRUPADOS POR CLASE.
 *
 * CADA RENGLON DICE CUANTOS Y CUANTO. "Ventas 12" son doce operaciones;
 * "$4,850" es lo que sumaron. Sin el par, dos personas leen el mismo panel y
 * entienden cosas distintas.
 *
 * LOS EGRESOS VAN EN NEGATIVO Y CON SIGNO, no solo en rojo: quien no
 * distingue el rojo del negro tiene que poder saber cual resta.
 *
 * EL TOTAL DE ABAJO ES EL NETO, y se dice que lo es. Un total que sume
 * entradas y salidas sin decirlo se lee como "lo que se vendio hoy" y no lo es.
 */

import { formatearDinero } from '../datos/moneda.js';
import type { PorClase } from '../datos/caja.js';
import { COMO_SE_DICE_LA_CLASE } from '../datos/caja.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

const ICONO_DE_LA_CLASE: Readonly<Record<string, NombreDeIcono>> = {
  venta: 'bolsa',
  ingreso: 'dinero',
  retiro: 'salida',
  gasto: 'recibo',
  cancelacion: 'prohibido',
  devolucion: 'volver',
};

/** El orden en que se leen. El resto va detrás, en el orden que llegue. */
const ORDEN: readonly string[] = ['venta', 'retiro', 'ingreso', 'gasto', 'cancelacion', 'devolucion'];

export function ordenarPorClase(clases: readonly PorClase[]): PorClase[] {
  return [...clases].sort((a, b) => {
    const ia = ORDEN.indexOf(a.clase);
    const ib = ORDEN.indexOf(b.clase);
    return (ia < 0 ? ORDEN.length : ia) - (ib < 0 ? ORDEN.length : ib);
  });
}

export function MovimientosDelDia({
  clases,
  movimientos,
  netoCentavos,
  cargando,
  onExportar,
}: {
  readonly clases: readonly PorClase[];
  readonly movimientos: number;
  readonly netoCentavos: number;
  readonly cargando: boolean;
  onExportar(): void;
}) {
  const ordenadas = ordenarPorClase(clases);

  return (
    <section className="pz-tarjeta" aria-labelledby="caja-dia-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="caja-dia-titulo">
          Movimientos de la caja
        </h3>
        <button
          type="button"
          className="pz-enlace"
          disabled={movimientos === 0}
          onClick={onExportar}
        >
          <Icono nombre="archivar" lado={14} /> Exportar
        </button>
      </header>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los movimientos</span>
          {[0, 1].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : ordenadas.length === 0 ? (
        <p className="pz-vacio__texto">
          Todavía no hay movimientos en esta caja. Aparecen solos en cuanto se cobre una venta o se
          registre un gasto.
        </p>
      ) : (
        <ul className="caja-clases">
          {ordenadas.map((c) => (
            <li key={c.clase} className="caja-clase">
              <span className="pz-cifra__icono" aria-hidden="true">
                <Icono nombre={ICONO_DE_LA_CLASE[c.clase] ?? 'nota'} lado={18} />
              </span>
              <span className="caja-clase__que">
                {COMO_SE_DICE_LA_CLASE[c.clase] ?? c.clase}
              </span>
              <span className="caja-clase__cuantos">
                {c.movimientos} {c.movimientos === 1 ? 'movimiento' : 'movimientos'}
              </span>
              {/* El signo va escrito, no solo el color. */}
              <span
                className={`caja-clase__monto${c.centavos < 0 ? ' caja-clase__monto--sale' : ''}`}
              >
                {c.centavos < 0 ? `−${formatearDinero(-c.centavos)}` : formatearDinero(c.centavos)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <footer className="caja-clases__pie">
        <span className="caja-clase__que">Total movimientos</span>
        <span className="caja-clase__cuantos">{movimientos}</span>
        <span className={`caja-clase__monto${netoCentavos < 0 ? ' caja-clase__monto--sale' : ''}`}>
          {netoCentavos < 0
            ? `−${formatearDinero(-netoCentavos)}`
            : formatearDinero(netoCentavos)}
        </span>
      </footer>
      <p className="tt-secundario">
        El total es el neto: lo que entró menos lo que salió, con todas las formas de pago.
      </p>
      {/*
        SE DICE DE DONDE VIENE CADA RENGLON, y esta linea no es un adorno.
        Mirando la pantalla no habia forma de saber que las ventas se anotan
        SOLAS —la base las mete en la misma operacion que cobra— y Caja parecia
        un modulo que repetia lo de Ventas. Solo se captura a mano lo que no es
        una venta: poner cambio, sacar efectivo para pagar algo.
      */}
      <p className="tt-secundario">
        Las ventas se anotan solas al cobrarlas en Ventas. Aquí solo se captura a mano lo
        que no es una venta.
      </p>
    </section>
  );
}
