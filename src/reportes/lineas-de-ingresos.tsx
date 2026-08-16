/**
 * INGRESOS VS. EGRESOS — la grafica de dos lineas.
 *
 * SIN BIBLIOTECA DE GRAFICAS, igual que en Gastos. Una pesa mas que todo el
 * producto junto y trae su propio calendario de parches de seguridad; lo que
 * hace falta aqui son cuarenta lineas de aritmetica.
 *
 * EL EJE LO MANDA EL SERVIDOR, incluidos los dias sin nada. Un dia sin ventas
 * llega en cero y no ausente: un hueco en la linea se lee como una caida, y una
 * caida que no existe es peor que no dibujar nada.
 *
 * SIN DATOS NO SE PINTA UNA LINEA EN CERO. Una raya plana pegada al suelo
 * afirma "no entro nada ningun dia", y eso es una afirmacion, no un vacio. Se
 * dice que todavia no hay con que dibujar.
 *
 * EL PASO —dia o mes— LO DECIDE LA BASE por el largo del rango, y aqui solo se
 * rotula. Un año por dia son trescientos sesenta y cinco puntos ilegibles; una
 * semana por mes es un solo punto inutil.
 */

import { formatearDinero } from '../datos/moneda.js';
import type { PasoDeLaSerie, PuntoDeLaSerie } from '../datos/reportes.js';
import { Icono } from '../ui/iconos.js';

/** El ancho y el alto del lienzo. Son unidades del SVG, no pixeles. */
const ANCHO = 640;
const ALTO = 220;
const MARGEN = { arriba: 12, derecha: 8, abajo: 26, izquierda: 56 };

/**
 * El techo de la grafica, redondeado hacia arriba a un numero legible.
 *
 * Sin redondear, el eje sale con rotulos como "$4,873" que nadie compara de un
 * vistazo. Con el redondeo, la linea de arriba siempre cae en una cifra
 * redonda.
 */
export function techoDeLaSerie(serie: readonly PuntoDeLaSerie[]): number {
  const maximo = serie.reduce((a, p) => Math.max(a, p.ingresos, p.egresos), 0);
  if (maximo <= 0) return 0;
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  for (const m of [1, 2, 2.5, 5]) {
    if (m * magnitud >= maximo) return m * magnitud;
  }
  return 10 * magnitud;
}

/**
 * Los puntos de una linea, ya en coordenadas del lienzo.
 *
 * CON UN SOLO PUNTO SE PINTA EN MEDIO y no en el borde izquierdo: dividir entre
 * `largo - 1` con largo uno es una division entre cero, y el punto salia en
 * `NaN` — o sea, no salia, y la grafica aparecia vacia sin decir por que. Pasa
 * de verdad cada vez que alguien escoge el periodo "Hoy".
 */
export function puntosDeLaLinea(
  valores: readonly number[],
  techo: number,
): Array<{ x: number; y: number }> {
  const ancho = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const alto = ALTO - MARGEN.arriba - MARGEN.abajo;
  const largo = valores.length;

  return valores.map((v, i) => ({
    x: MARGEN.izquierda + (largo === 1 ? ancho / 2 : (i / (largo - 1)) * ancho),
    y: MARGEN.arriba + alto - (techo > 0 ? (v / techo) * alto : 0),
  }));
}

/** El rotulo del eje de abajo, segun agrupe por dia o por mes. */
export function rotuloDelPunto(punto: string, paso: PasoDeLaSerie): string {
  const [d, m] = punto.split('/');
  if (!d || !m) return '';
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mes = MESES[Number(m) - 1] ?? '';
  return paso === 'mes' ? mes : `${Number(d)} ${mes}`;
}

export function LineasDeIngresos({
  serie,
  paso,
  cargando,
}: {
  readonly serie: readonly PuntoDeLaSerie[];
  readonly paso: PasoDeLaSerie;
  readonly cargando: boolean;
}) {
  const techo = techoDeLaSerie(serie);
  const hayAlgo = techo > 0;
  const ingresos = puntosDeLaLinea(serie.map((p) => p.ingresos), techo);
  const egresos = puntosDeLaLinea(serie.map((p) => p.egresos), techo);

  // Con muchos puntos los rotulos se encimarian hasta ser una mancha: se
  // escribe uno de cada tantos. Esconderlos es correcto; encimarlos no.
  const cada = Math.max(1, Math.ceil(serie.length / 10));
  const rayas = [0, 0.25, 0.5, 0.75, 1];
  const alto = ALTO - MARGEN.arriba - MARGEN.abajo;

  const camino = (ps: Array<{ x: number; y: number }>): string =>
    ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <section className="pz-tarjeta" aria-labelledby="rep-lineas-titulo">
      <div className="rep-tarjeta__cabeza">
        <h3 className="tt-tarjeta" id="rep-lineas-titulo">
          Ingresos vs. Egresos
        </h3>
        {/* El paso NO se escoge a mano: lo decide el largo del periodo, en la
            base, y las dos partes tienen que coincidir. Un selector aqui dejaria
            pedir "diario" en un rango de un año y devolver una mancha. */}
        <span className="pz-pastilla pz-pastilla--marca">
          {paso === 'mes' ? 'Mensual' : 'Diario'}
        </span>
      </div>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando ingresos y egresos</span>
          <div className="pz-silueta pz-silueta--alta" />
        </div>
      ) : !hayAlgo ? (
        <div className="pz-vacio pz-vacio--chico">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="barras" lado={22} />
          </span>
          <p className="pz-vacio__texto">
            Todavía no hay movimientos en este período para dibujar.
          </p>
        </div>
      ) : (
        <>
          <ul className="rep-leyenda">
            <li>
              <span className="rep-punto rep-punto--ingresos" aria-hidden="true" /> Ingresos
            </li>
            <li>
              <span className="rep-punto rep-punto--egresos" aria-hidden="true" /> Egresos
            </li>
          </ul>

          <svg
            className="rep-lienzo"
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            role="img"
            aria-label={`Ingresos y egresos del período, con un máximo de ${formatearDinero(techo)}`}
          >
            {rayas.map((r) => {
              const y = MARGEN.arriba + alto - r * alto;
              return (
                <g key={r}>
                  <line
                    className="rep-raya"
                    x1={MARGEN.izquierda}
                    y1={y}
                    x2={ANCHO - MARGEN.derecha}
                    y2={y}
                  />
                  <text className="rep-eje" x={MARGEN.izquierda - 8} y={y + 4} textAnchor="end">
                    {formatearDinero(Math.round(techo * r))}
                  </text>
                </g>
              );
            })}

            <path className="rep-linea rep-linea--egresos" d={camino(egresos)} fill="none" />
            <path className="rep-linea rep-linea--ingresos" d={camino(ingresos)} fill="none" />

            {serie.map((p, i) => (
              <g key={p.punto}>
                <circle
                  className="rep-marca rep-marca--egresos"
                  cx={egresos[i]?.x ?? 0}
                  cy={egresos[i]?.y ?? 0}
                  r="3"
                >
                  <title>{`${p.punto}: ${formatearDinero(p.egresos)} de egresos`}</title>
                </circle>
                <circle
                  className="rep-marca rep-marca--ingresos"
                  cx={ingresos[i]?.x ?? 0}
                  cy={ingresos[i]?.y ?? 0}
                  r="3"
                >
                  <title>{`${p.punto}: ${formatearDinero(p.ingresos)} de ingresos`}</title>
                </circle>
                {i % cada === 0 ? (
                  <text
                    className="rep-eje"
                    x={ingresos[i]?.x ?? 0}
                    y={ALTO - 8}
                    textAnchor="middle"
                  >
                    {rotuloDelPunto(p.punto, paso)}
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
        </>
      )}
    </section>
  );
}
