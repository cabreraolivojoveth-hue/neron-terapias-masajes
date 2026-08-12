/**
 * LAS DOS GRAFICAS DE GASTOS: el reparto por categoria y el dia a dia.
 *
 * SIN BIBLIOTECA DE GRAFICAS. Una pesa mas que todo el producto junto y trae
 * su propio calendario de parches de seguridad; lo que hace falta aqui son
 * cuarenta lineas de aritmetica.
 *
 * LOS PORCENTAJES SE REDONDEAN PARA VERSE, NO PARA SUMARSE. Tres categorias de
 * 33.3% se pintan "33%" y suman 99: por eso el centro de la dona lleva el
 * TOTAL en pesos y no la suma de los porcentajes, que no cuadraria.
 *
 * SIN DATOS NO SE DIBUJA UNA DONA VACIA NI UNA LINEA EN CERO. Un anillo gris
 * se lee como "todo es de una categoria" y una linea plana como "gaste cero
 * todos los dias" — las dos afirman algo que no se sabe. Se dice que no hay
 * nada.
 */

import { formatearMoneda } from '@neron/base/utils';
import type { CategoriaConGasto, DiaConGasto } from '../datos/gastos.js';
import { Icono } from '../ui/iconos.js';

/** El circulo completo, en unidades de trazo. */
const VUELTA = 100;

export interface Rebanada {
  readonly nombre: string;
  readonly color: string | null;
  readonly centavos: number;
  readonly parte: number;
  /** Cuanto ocupa del anillo, y desde donde empieza. */
  readonly largo: number;
  readonly desde: number;
}

/**
 * Las rebanadas del anillo, cada una con su arranque acumulado.
 *
 * Se calcula el arranque sumando las anteriores en vez de rotar cada rebanada:
 * asi no hay que pelearse con el angulo de inicio del SVG, que empieza a las
 * tres en punto y no arriba.
 */
export function rebanadas(
  categorias: readonly CategoriaConGasto[],
  total: number,
): Rebanada[] {
  if (total <= 0) return [];
  let acumulado = 0;
  return categorias.map((c) => {
    const largo = (c.centavos / total) * VUELTA;
    const desde = acumulado;
    acumulado += largo;
    return {
      nombre: c.nombre,
      color: c.color,
      centavos: c.centavos,
      parte: Math.round((c.centavos / total) * 100),
      largo,
      desde,
    };
  });
}

/**
 * El tono de cada rebanada.
 *
 * La categoria puede traer su color, escogido por quien la creo. Cuando no lo
 * trae se reparten los tonos de familia del Centro —que ya pasaron la prueba
 * de contraste— en vez de inventar un color: uno inventado puede salir
 * ilegible en tema oscuro y nadie lo comprueba.
 */
export function tonoDeLaRebanada(r: Rebanada, i: number): string {
  if (r.color) return r.color;
  const familias = ['cat-citas', 'cat-ventas', 'cat-productos', 'cat-cursos', 'cat-visitas'];
  return `var(--neron-${familias[i % familias.length]})`;
}

export function GastosPorCategoria({
  categorias,
  total,
  cargando,
}: {
  readonly categorias: readonly CategoriaConGasto[];
  readonly total: number;
  readonly cargando: boolean;
}) {
  const partes = rebanadas(categorias, total);

  return (
    <section className="pz-tarjeta" aria-labelledby="gto-pastel-titulo">
      <h3 className="tt-tarjeta" id="gto-pastel-titulo">
        Gastos por categoría
      </h3>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el reparto por categoría</span>
          <div className="pz-silueta pz-silueta--alta" />
        </div>
      ) : partes.length === 0 ? (
        <div className="pz-vacio pz-vacio--chico">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="pastel" lado={22} />
          </span>
          <p className="pz-vacio__texto">
            Aún no hay gastos en este periodo para repartir por categoría.
          </p>
        </div>
      ) : (
        <div className="caja-pastel">
          <div className="caja-anillo">
            <svg viewBox="0 0 42 42" role="img" aria-label="Reparto de gastos por categoría">
              {partes.map((r, i) => (
                <circle
                  key={r.nombre}
                  className="gto-rebanada"
                  cx="21"
                  cy="21"
                  r="15.9155"
                  fill="transparent"
                  stroke={tonoDeLaRebanada(r, i)}
                  strokeWidth="6"
                  // El primer numero es lo que se pinta y el segundo lo que se
                  // salta: juntos dan la vuelta entera.
                  strokeDasharray={`${r.largo} ${VUELTA - r.largo}`}
                  // El menos 25 lleva el arranque de las tres en punto a las
                  // doce, que es donde el ojo espera que empiece.
                  strokeDashoffset={String(VUELTA - r.desde + 25)}
                />
              ))}
            </svg>
            <div className="caja-anillo__centro">
              <span className="tt-pie">Total</span>
              <strong className="tt-dato">{formatearMoneda(total)}</strong>
            </div>
          </div>

          <ul className="caja-leyenda mv-escalonado">
            {partes.map((r, i) => (
              <li key={r.nombre}>
                <span
                  className="caja-punto"
                  aria-hidden="true"
                  style={{ background: tonoDeLaRebanada(r, i) }}
                />
                <span className="caja-leyenda__nombre">{r.nombre}</span>
                <span className="caja-leyenda__monto">{formatearMoneda(r.centavos)}</span>
                <span className="caja-leyenda__parte">{r.parte}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* El dia a dia                                                        */
/* ------------------------------------------------------------------ */

/** El techo de la grafica, redondeado hacia arriba a un numero legible. */
export function techoDeBarras(dias: readonly DiaConGasto[]): number {
  const maximo = dias.reduce((a, d) => (d.centavos > a ? d.centavos : a), 0);
  if (maximo <= 0) return 0;
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  for (const m of [1, 2, 2.5, 5]) {
    if (m * magnitud >= maximo) return m * magnitud;
  }
  return 10 * magnitud;
}

export function GastosPorDia({
  dias,
  cargando,
}: {
  readonly dias: readonly DiaConGasto[];
  readonly cargando: boolean;
}) {
  const techo = techoDeBarras(dias);
  const hayAlgo = techo > 0;
  // Con muchos dias las etiquetas se encimarian hasta ser una mancha: se
  // escribe una de cada tantas. Esconderlas es correcto; encimarlas no.
  const cada = Math.max(1, Math.ceil(dias.length / 10));

  return (
    <section className="pz-tarjeta" aria-labelledby="gto-dias-titulo">
      <h3 className="tt-tarjeta" id="gto-dias-titulo">
        Gastos por día
      </h3>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los gastos por día</span>
          <div className="pz-silueta pz-silueta--alta" />
        </div>
      ) : !hayAlgo ? (
        <div className="pz-vacio pz-vacio--chico">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="barras" lado={22} />
          </span>
          <p className="pz-vacio__texto">Aún no hay gastos registrados en este periodo.</p>
        </div>
      ) : (
        <>
          <ul className="gto-barras">
            {dias.map((d, i) => {
              const alto = techo > 0 ? Math.round((d.centavos / techo) * 100) : 0;
              return (
                <li key={d.fecha} className="gto-barras__dia">
                  {/* El titulo nativo da la cifra exacta al pasar el puntero.
                      El aria-label la da a quien no usa puntero. */}
                  <span
                    className="gto-barras__caja"
                    title={`${d.fecha}: ${formatearMoneda(d.centavos)}`}
                    aria-label={`${d.fecha}: ${formatearMoneda(d.centavos)}`}
                    role="img"
                  >
                    {/* Un minimo de dos por ciento para que un dia con un gasto
                        chico no se vea igual que uno sin gastos. */}
                    <span
                      className="gto-barras__lleno"
                      style={{ height: `${d.centavos > 0 ? Math.max(alto, 2) : 0}%` }}
                    />
                  </span>
                  <span className="gto-barras__etiqueta">
                    {i % cada === 0 ? (d.fecha.split('/')[0] ?? '') : ''}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="tt-secundario">
            El día más alto de este periodo llega a {formatearMoneda(techo)}.
          </p>
        </>
      )}
    </section>
  );
}
