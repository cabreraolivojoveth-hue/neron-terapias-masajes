/**
 * EL PASTEL DE FORMAS DE PAGO.
 *
 * SE CUENTA LO QUE ENTRO, no el neto. Mezclar entradas y salidas en el mismo
 * pastel da porcentajes que no significan nada: un retiro en efectivo no hace
 * que "el efectivo sea menos importante" como forma de cobro.
 *
 * EL DIBUJO NO ES LA INFORMACION. Al lado va siempre la lista con el nombre,
 * el importe y el porcentaje: quien no distingue los colores —y quien usa
 * lector de pantalla— lee exactamente lo mismo.
 *
 * SIN MOVIMIENTOS SE DICE, no se pinta un pastel de mentiras. Un anillo con
 * cuatro rebanadas iguales "para que se vea" es el peor dato posible.
 */

import { formatearMoneda } from '@neron/base/utils';
import type { PorMetodo } from '../datos/caja.js';
import { COMO_SE_DICE_EL_METODO_DE_CAJA, porcentajeDelMetodo } from '../datos/caja.js';

/** El tono de cada forma de pago. Los mismos cuatro del tablero. */
export const TONO_DEL_METODO: Readonly<Record<string, string>> = {
  efectivo: 'citas',
  transferencia: 'ventas',
  tarjeta: 'cursos',
  otro: 'productos',
};

/** El radio del anillo. La circunferencia sale de aqui, no de un numero suelto. */
const RADIO = 42;
const VUELTA = 2 * Math.PI * RADIO;

export interface Rebanada {
  readonly metodo: string;
  readonly centavos: number;
  readonly porcentaje: number;
  /** Cuanto ocupa del anillo, en unidades de trazo. */
  readonly largo: number;
  /** Donde empieza. Sin esto las rebanadas se encimarian. */
  readonly desde: number;
}

/**
 * Reparte el anillo.
 *
 * Se calcula sobre el total REAL, no normalizando a cien: si el total es cero
 * no hay rebanadas, y eso es lo correcto — no un anillo lleno.
 */
export function repartirElAnillo(
  metodos: readonly PorMetodo[],
  totalCentavos: number,
): Rebanada[] {
  if (totalCentavos <= 0) return [];
  let acumulado = 0;
  const salida: Rebanada[] = [];
  for (const m of metodos) {
    if (m.centavos <= 0) continue;
    const largo = (m.centavos / totalCentavos) * VUELTA;
    salida.push({
      metodo: m.metodo,
      centavos: m.centavos,
      porcentaje: porcentajeDelMetodo(m.centavos, totalCentavos),
      largo,
      desde: acumulado,
    });
    acumulado += largo;
  }
  return salida;
}

export function MetodosDePago({
  metodos,
  totalCentavos,
  cargando,
}: {
  readonly metodos: readonly PorMetodo[];
  readonly totalCentavos: number;
  readonly cargando: boolean;
}) {
  const rebanadas = repartirElAnillo(metodos, totalCentavos);

  return (
    <section className="pz-tarjeta" aria-labelledby="caja-metodos-titulo">
      <h3 className="tt-tarjeta" id="caja-metodos-titulo">
        Métodos de pago
      </h3>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando las formas de pago</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : rebanadas.length === 0 ? (
        <p className="pz-vacio__texto">
          Todavía no ha entrado dinero en esta caja. En cuanto se cobre algo, aquí se ve con qué se
          pagó.
        </p>
      ) : (
        <div className="caja-pastel">
          <div className="caja-anillo">
            <svg viewBox="0 0 100 100" role="img" aria-label="Reparto por forma de pago">
              {rebanadas.map((r) => (
                <circle
                  key={r.metodo}
                  className={`caja-anillo__parte caja-anillo__parte--${TONO_DEL_METODO[r.metodo] ?? 'productos'}`}
                  cx="50"
                  cy="50"
                  r={RADIO}
                  fill="none"
                  strokeWidth="12"
                  strokeDasharray={`${r.largo} ${VUELTA - r.largo}`}
                  strokeDashoffset={-r.desde}
                  /* Se arranca arriba, no a la derecha: es donde el ojo
                     empieza a leer un pastel. */
                  transform="rotate(-90 50 50)"
                />
              ))}
            </svg>
            <span className="caja-anillo__centro">
              <span className="caja-anillo__que">Total</span>
              <span className="caja-anillo__cuanto">{formatearMoneda(totalCentavos)}</span>
            </span>
          </div>

          {/* LA LISTA NO ES DECORACION: es la version legible del dibujo. */}
          <ul className="caja-leyenda mv-escalonado">
            {rebanadas.map((r) => (
              <li key={r.metodo} className="caja-leyenda__renglon">
                <span
                  className={`caja-leyenda__punto caja-leyenda__punto--${TONO_DEL_METODO[r.metodo] ?? 'productos'}`}
                  aria-hidden="true"
                />
                <span className="caja-leyenda__que">
                  {COMO_SE_DICE_EL_METODO_DE_CAJA[r.metodo] ?? r.metodo}
                </span>
                <span className="caja-leyenda__cuanto">{formatearMoneda(r.centavos)}</span>
                <span className="caja-leyenda__parte">{r.porcentaje}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
