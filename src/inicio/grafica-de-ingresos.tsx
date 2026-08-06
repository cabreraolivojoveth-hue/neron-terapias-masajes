/**
 * INGRESOS DE LA SEMANA — la grafica.
 *
 * SIN BIBLIOTECA DE GRAFICAS, y no por ahorrar: una biblioteca de graficas
 * pesa mas que todo el resto del producto junto, trae su propio calendario de
 * actualizaciones de seguridad, y lo que hace falta aqui son cuarenta lineas
 * de aritmetica. La base ya trae `comoPolilinea` y `comoArea`, que son la
 * parte que se repite.
 *
 * EL EJE EMPIEZA EN CERO, SIEMPRE. `escalar` de la base ajusta la linea entre
 * el minimo y el maximo de los datos, que es lo correcto para el rayita de una
 * tarjeta pero MENTIRIA aqui: con ventas de $4,800 y $5,000 la linea subiria
 * de piso a techo y se leeria como que el negocio se duplico. Un eje de dinero
 * que no empieza en cero exagera cualquier variacion.
 *
 * LOS DIAS SIN VENTAS VAN EN CERO, no ausentes. Un hueco hundiria la linea
 * hasta el piso y se veria como una caida.
 *
 * LOS PUNTOS SON BOTONES DE VERDAD, no circulos de SVG. Asi se llega con
 * teclado y el globito sale igual al pasar el raton que al tabular — y ademas
 * un circulo dentro de un SVG estirado a lo ancho sale ovalado.
 */

import { comoArea, comoPolilinea } from '@neron/base/tablero';
import { formatearMoneda } from '@neron/base/utils';
import { useEffect, useRef, useState } from 'react';
import type { ClaveDePeriodo, DiaConIngreso, PeriodoDeIngresos } from '../datos/tablero.js';
import { diaCorto, diaYMes } from './saludo.js';

/** En cuantos tramos se parte el eje vertical. Cuatro deja cinco etiquetas. */
const DIVISIONES = 4;

/**
 * El escalon del eje: un numero redondo, no el maximo de los datos.
 *
 * Con un maximo de $4,850 y cuatro tramos, el escalon crudo seria $1,212.50 y
 * el eje diria `$1.2k · $2.4k · $3.6k`. Nadie lee un eje asi. Se redondea
 * hacia arriba al 1, 2, 2.5, 5 o 10 mas cercano, que da `$2k · $4k · $6k`.
 */
export function pasoBonito(maximo: number, divisiones = DIVISIONES): number {
  if (!Number.isFinite(maximo) || maximo <= 0 || divisiones <= 0) return 0;
  const bruto = maximo / divisiones;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  for (const m of [1, 2, 2.5, 5]) {
    if (m * magnitud >= bruto) return m * magnitud;
  }
  return 10 * magnitud;
}

/** El techo del eje: el escalon por los tramos. Cero cuando no hay nada. */
export function techoDelEje(valores: readonly number[], divisiones = DIVISIONES): number {
  const maximo = valores.reduce((a, v) => (Number.isFinite(v) && v > a ? v : a), 0);
  const paso = pasoBonito(maximo, divisiones);
  return paso * divisiones;
}

/**
 * Los valores en coordenadas de 0 a 100, con el cero ABAJO.
 *
 * En SVG el eje Y crece hacia abajo, al reves que en la escuela: por eso el
 * valor se resta de cien en vez de sumarse. Es el error de signo que hace que
 * la grafica salga de cabeza y que solo se nota mirandola.
 *
 * CADA DIA OCUPA UNA FRANJA Y EL PUNTO VA EN SU CENTRO, en vez de repartir los
 * puntos de borde a borde. La linea deja entonces un margen chico a los lados
 * —el diseño la lleva pegada— y se gana algo que vale mas: el punto, la
 * columna que se toca con el raton y la etiqueta de abajo caen exactamente en
 * el mismo sitio. Repartiendolos de borde a borde, el primer punto queda en la
 * esquina de su franja y la etiqueta en el centro: se ven corridos, y con
 * siete dias basta para notarlo.
 */
export function escalarDesdeCero(
  valores: readonly number[],
  techo: number,
): { readonly x: number; readonly y: number }[] {
  const n = valores.length;
  if (n === 0) return [];
  return valores.map((v, i) => {
    const x = ((i + 0.5) / n) * 100;
    const alto = techo > 0 && Number.isFinite(v) ? Math.min(Math.max(v / techo, 0), 1) : 0;
    return { x, y: 100 - alto * 100 };
  });
}

/** `$0`, `$2k`, `$1.5M`. Solo para el EJE: el globito dice la cifra exacta. */
export function etiquetaCorta(centavos: number): string {
  if (!Number.isFinite(centavos)) return '';
  const pesos = centavos / 100;
  const recorta = (n: number): string => String(Number(n.toFixed(1)));
  if (Math.abs(pesos) >= 1_000_000) return `$${recorta(pesos / 1_000_000)}M`;
  if (Math.abs(pesos) >= 1000) return `$${recorta(pesos / 1000)}k`;
  return `$${Math.round(pesos)}`;
}

/**
 * Que etiqueta lleva cada dia debajo.
 *
 * Una semana cabe con el nombre del dia. Un mes son treinta y un dias: los
 * nombres se encimarian hasta volverse una mancha, asi que se numeran y solo
 * se escribe uno de cada cinco. Esconder etiquetas es correcto; encimarlas no.
 */
export function etiquetasDeAbajo(fechas: readonly string[]): (string | null)[] {
  if (fechas.length <= 10) return fechas.map((f) => diaCorto(f));
  const cada = Math.ceil(fechas.length / 7);
  return fechas.map((f, i) =>
    i % cada === 0 || i === fechas.length - 1 ? (f.split('/')[0] ?? '') : null,
  );
}

export interface PropiedadesDeGrafica {
  readonly dias: readonly DiaConIngreso[];
  readonly periodos: readonly PeriodoDeIngresos[];
  readonly periodo: ClaveDePeriodo;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly onCambiarPeriodo: (clave: ClaveDePeriodo) => void;
  readonly onReintentar: () => void;
}

export function GraficaDeIngresos({
  dias,
  periodos,
  periodo,
  cargando,
  error,
  onCambiarPeriodo,
  onReintentar,
}: PropiedadesDeGrafica) {
  const [activo, setActivo] = useState<number | null>(null);
  const lienzo = useRef<HTMLDivElement | null>(null);

  /**
   * El globito se cierra al salir con Escape.
   *
   * Sin esto, quien llego con teclado se queda con el globito puesto tapando
   * la grafica y sin forma evidente de quitarlo.
   */
  useEffect(() => {
    if (activo === null) return;
    const alTeclear = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setActivo(null);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [activo]);

  const valores = dias.map((d) => d.total);
  const techo = techoDelEje(valores);
  const puntos = escalarDesdeCero(valores, techo);
  const hayAlgo = valores.some((v) => v > 0);
  const abajo = etiquetasDeAbajo(dias.map((d) => d.fecha));
  const marcas = Array.from({ length: DIVISIONES + 1 }, (_, i) => (techo / DIVISIONES) * i);

  const seleccion = periodos.find((p) => p.clave === periodo) ?? periodos[0];

  return (
    <section className="ini-panel ini-grafica" aria-labelledby="ini-grafica-titulo">
      <header className="ini-panel__barra">
        <h3 className="ini-panel__titulo" id="ini-grafica-titulo">
          Ingresos {seleccion?.clave === 'esteMes' ? 'este mes' : 'esta semana'}
        </h3>
        {/*
          Un <select> del sistema, no un menu propio. Es la decision que evita
          de raiz el problema que ya nos costo tiempo: el menu que oscurece el
          fondo y no aparece. El del sistema no puede quedar debajo de nada, se
          abre igual en celular, y funciona con teclado sin escribir una linea.
        */}
        <label className="ini-grafica__periodo">
          <span className="neron-solo-lectores">Periodo de la gráfica</span>
          <select
            value={periodo}
            onChange={(e) => onCambiarPeriodo(e.target.value as ClaveDePeriodo)}
          >
            {periodos.map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error ? (
        <div className="ini-error" role="alert">
          <p className="ini-error__que">No pudimos cargar los ingresos.</p>
          <p className="ini-error__detalle">{error}</p>
          <button type="button" className="ini-boton-suave" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="ini-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los ingresos</span>
          <div className="terapias-silueta ini-cargando__grafica" />
        </div>
      ) : (
        <div className="ini-grafica__cuerpo">
          <ul className="ini-grafica__eje" aria-hidden="true">
            {/* De arriba hacia abajo: el techo primero. */}
            {[...marcas].reverse().map((m) => (
              <li key={m}>{etiquetaCorta(m)}</li>
            ))}
          </ul>

          <div className="ini-grafica__lienzo" ref={lienzo}>
            <svg
              className="ini-grafica__svg"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {marcas.map((_, i) => {
                const y = 100 - (i / DIVISIONES) * 100;
                return <line key={i} className="ini-grafica__guia" x1="0" y1={y} x2="100" y2={y} />;
              })}
              {hayAlgo && puntos.length > 1 ? (
                <>
                  <path className="ini-grafica__area" d={comoArea(puntos, 100)} />
                  <polyline className="ini-grafica__linea" points={comoPolilinea(puntos)} />
                </>
              ) : null}
            </svg>

            {/* Una columna invisible por dia: es el blanco del raton Y del
                teclado. Cubrir toda la altura hace que no haya que atinarle a
                un punto de seis pixeles. */}
            <div className="ini-grafica__columnas">
              {dias.map((d, i) => {
                const punto = puntos[i];
                const ancho = 100 / Math.max(dias.length, 1);
                return (
                  <button
                    key={d.fecha}
                    type="button"
                    className={`ini-grafica__columna${activo === i ? ' ini-grafica__columna--activa' : ''}`}
                    // El ancho de la franja se calcula aqui porque depende de
                    // cuantos dias trae el periodo: siete en una semana,
                    // treinta y uno en un mes. En la hoja de estilos no se
                    // puede saber.
                    style={{ left: `${ancho * i}%`, width: `${ancho}%` }}
                    onMouseEnter={() => setActivo(i)}
                    onMouseLeave={() => setActivo((a) => (a === i ? null : a))}
                    onFocus={() => setActivo(i)}
                    onBlur={() => setActivo((a) => (a === i ? null : a))}
                    aria-label={`${diaYMes(d.fecha)}: ${formatearMoneda(d.total)}`}
                  >
                    {hayAlgo && punto ? (
                      <span className="ini-grafica__punto" style={{ top: `${punto.y}%` }} />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {activo !== null && dias[activo] ? (
              <div
                className={[
                  'ini-grafica__globo',
                  activo <= 0 ? 'ini-grafica__globo--izquierda' : '',
                  activo >= dias.length - 1 ? 'ini-grafica__globo--derecha' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: `${(100 / Math.max(dias.length, 1)) * (activo + 0.5)}%` }}
                role="presentation"
              >
                <span className="ini-grafica__globo-dia">{diaYMes(dias[activo]!.fecha)}</span>
                <span className="ini-grafica__globo-total">
                  {formatearMoneda(dias[activo]!.total)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {!error && !cargando ? (
        <ul className="ini-grafica__dias" aria-hidden="true">
          {abajo.map((e, i) => (
            <li key={dias[i]?.fecha ?? i}>{e ?? ''}</li>
          ))}
        </ul>
      ) : null}

      {!error && !cargando && !hayAlgo ? (
        // El eje se queda puesto y lo que falta se DICE. Inventar una linea
        // para que "se vea completo" es justo lo que hace desconfiar despues
        // de los numeros que si son reales.
        <p className="ini-vacio">Aún no hay ventas cobradas en este periodo.</p>
      ) : null}
    </section>
  );
}
