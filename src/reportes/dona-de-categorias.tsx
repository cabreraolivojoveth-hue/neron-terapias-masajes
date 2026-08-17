/**
 * INGRESOS POR CATEGORIA — la dona.
 *
 * LAS CATEGORIAS SON LAS QUE DE VERDAD SE VENDIERON, no una lista fija. El
 * servidor devuelve `servicio`, `producto` y `curso` solo si hubo ingresos de
 * ese tipo; un centro que todavia no da cursos no ve una rebanada de cursos en
 * cero, que se leeria como "los cursos no funcionan" en vez de "no hay cursos".
 *
 * LOS PORCENTAJES SE REDONDEAN PARA VERSE, NO PARA SUMARSE. Tres categorias de
 * 33.3% se pintan "33%" y suman 99: por eso el centro de la dona lleva el TOTAL
 * en pesos y no la suma de los porcentajes, que no cuadraria.
 *
 * SIN DATOS NO SE DIBUJA UN ANILLO GRIS. Un anillo de un solo tono se lee como
 * "todo viene de una categoria" — otra afirmacion falsa. Se dice que no hay
 * nada.
 */

import { useState } from 'react';
import { formatearDinero } from '../datos/moneda.js';
import type { CategoriaDeIngreso } from '../datos/reportes.js';
import { Icono } from '../ui/iconos.js';
import { claseDeCifra } from './cifras-que-caben.js';

/** El circulo completo, en unidades de trazo. */
const VUELTA = 100;

/**
 * Como se llama cada clave en la pantalla.
 *
 * La base habla de `servicio`/`producto`/`curso` porque es lo que dice la
 * columna `tipo` de un renglon de venta. Traducirlo aqui —y no en la base—
 * deja que el dia que el centro le quiera llamar "Terapias" a los servicios se
 * cambie una linea, sin migrar ni un dato.
 */
export const NOMBRE_DE_LA_CLAVE: Readonly<Record<string, string>> = {
  servicio: 'Servicios',
  producto: 'Productos',
  curso: 'Cursos',
};

export function nombreDeCategoria(clave: string): string {
  return NOMBRE_DE_LA_CLAVE[clave] ?? (clave === '' ? 'Otros' : clave);
}

export interface RebanadaDelReporte {
  readonly clave: string;
  readonly nombre: string;
  readonly monto: number;
  readonly parte: number;
  readonly largo: number;
  readonly desde: number;
}

/**
 * Las rebanadas del anillo, cada una con su arranque acumulado.
 *
 * El arranque se calcula sumando las anteriores en vez de rotar cada rebanada:
 * asi no hay que pelearse con el angulo de inicio del SVG, que empieza a las
 * tres en punto y no arriba.
 */
export function rebanadasDelReporte(
  categorias: readonly CategoriaDeIngreso[],
  total: number,
): RebanadaDelReporte[] {
  if (total <= 0) return [];
  let acumulado = 0;
  return categorias.map((c) => {
    const largo = (c.monto / total) * VUELTA;
    const desde = acumulado;
    acumulado += largo;
    return {
      clave: c.clave,
      nombre: nombreDeCategoria(c.clave),
      monto: c.monto,
      parte: Math.round((c.monto / total) * 100),
      largo,
      desde,
    };
  });
}

/**
 * El tono de cada rebanada.
 *
 * Salen de los tonos de familia del Centro, que ya pasaron la prueba de
 * contraste. Inventar un color aqui es lo que deja una rebanada ilegible en
 * tema oscuro sin que nadie lo compruebe — y la guardia 3 lo revienta.
 */
export function tonoDeLaRebanada(i: number): string {
  const familias = ['cat-citas', 'cat-cursos', 'cat-ventas', 'cat-productos', 'cat-visitas'];
  return `var(--neron-${familias[i % familias.length]})`;
}

export function DonaDeCategorias({
  categorias,
  cargando,
}: {
  readonly categorias: readonly CategoriaDeIngreso[];
  readonly cargando: boolean;
}) {
  const total = categorias.reduce((s, c) => s + c.monto, 0);
  const partes = rebanadasDelReporte(categorias, total);
  /**
   * QUE REBANADA ESTA SEÑALADA. `null` = ninguna, y entonces el centro dice el
   * total.
   *
   * El anillo no tenia ninguna forma de saber que rebanada era cual mas que
   * cruzar el color con la leyenda de abajo — y con cinco tonos parecidos eso
   * es exactamente lo que nadie hace. Al pasar por encima, el centro contesta.
   */
  const [senalada, setSenalada] = useState<number | null>(null);
  const viva = senalada !== null ? partes[senalada] : null;

  return (
    <section className="pz-tarjeta" aria-labelledby="rep-dona-titulo">
      <h3 className="tt-tarjeta" id="rep-dona-titulo">
        Ingresos por categoría
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
            Todavía no hay ingresos en este período para repartir por categoría.
          </p>
        </div>
      ) : (
        <div className="caja-pastel">
          <div className="caja-anillo" onMouseLeave={() => setSenalada(null)}>
            <svg viewBox="0 0 42 42" role="img" aria-label="Reparto de ingresos por categoría">
              {partes.map((r, i) => (
                <circle
                  key={r.clave}
                  className={`rep-rebanada${senalada === i ? ' rep-rebanada--viva' : ''}`}
                  cx="21"
                  cy="21"
                  r="15.9155"
                  fill="transparent"
                  stroke={tonoDeLaRebanada(i)}
                  // La señalada engorda hacia adentro y hacia afuera: es la
                  // unica forma de destacar un arco sin moverlo de sitio, y
                  // mover algo que se esta apuntando hace fallar el clic.
                  strokeWidth={senalada === i ? 8 : 6}
                  // El primer numero es lo que se pinta y el segundo lo que se
                  // salta: juntos dan la vuelta entera.
                  strokeDasharray={`${r.largo} ${VUELTA - r.largo}`}
                  // El menos 25 lleva el arranque de las tres en punto a las
                  // doce, que es donde el ojo espera que empiece.
                  strokeDashoffset={String(VUELTA - r.desde + 25)}
                  onMouseEnter={() => setSenalada(i)}
                />
              ))}
            </svg>
            {/*
              EL CENTRO CONTESTA LO QUE SE ESTA SEÑALANDO.

              Sin esto, saber que rebanada es cual obligaba a cruzar un color
              con la leyenda de abajo, y con cinco tonos de la misma familia eso
              no lo hace nadie. Al salir el puntero vuelve el total.

              LA CLASE DE LA CIFRA SALE DEL LARGO DEL TEXTO, y ese es el arreglo
              de "$44,575.00 se sale del anillo": el tamaño no puede estar
              escrito para una longitud cuando el centro que hoy factura
              cuarenta mil facturara medio millon.
            */}
            <div className="caja-anillo__centro" role="status">
              <span className="tt-pie">{viva ? viva.nombre : 'Total'}</span>
              <strong
                className={`tt-dato ${claseDeCifra(formatearDinero(viva ? viva.monto : total))}`}
              >
                {formatearDinero(viva ? viva.monto : total)}
              </strong>
              {viva ? <span className="tt-pie">{viva.parte}% del total</span> : null}
            </div>
          </div>

          {/* LOS NOMBRES DE CLASE SON LOS DE LA HOJA, uno por uno. Con
              `caja-punto` y `caja-leyenda__nombre` —que NO existen— la leyenda
              salia como texto pegado sin punto de color: "Servicios$12,450.0050%".
              No fallaba nada; solo se veia rota. La guardia 17 lo vigila. */}
          {/* La leyenda tambien señala: apuntar el nombre resalta su rebanada.
              Es el mismo puente en los dos sentidos, y cuesta una linea. */}
          <ul className="caja-leyenda mv-escalonado" onMouseLeave={() => setSenalada(null)}>
            {partes.map((r, i) => (
              <li
                key={r.clave}
                className={`caja-leyenda__renglon${senalada === i ? ' caja-leyenda__renglon--viva' : ''}`}
                onMouseEnter={() => setSenalada(i)}
              >
                <span
                  className="caja-leyenda__punto"
                  aria-hidden="true"
                  style={{ background: tonoDeLaRebanada(i) }}
                />
                <span className="caja-leyenda__que">{r.nombre}</span>
                <span className="caja-leyenda__cuanto">{formatearDinero(r.monto)}</span>
                <span className="caja-leyenda__parte">{r.parte}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
