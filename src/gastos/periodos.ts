/**
 * LOS PERIODOS DE GASTOS.
 *
 * TODA LA PANTALLA MIRA EL MISMO RANGO. Las cuatro cifras, la tabla, las dos
 * graficas, el reparto por forma de pago y la comparacion contra el periodo
 * anterior salen de `desde`/`hasta`. Si cada parte calculara el suyo, la
 * grafica diria una cosa y la tarjeta de arriba otra en la misma pantalla — y
 * quien la mira concluye, con razon, que una de las dos esta mal.
 *
 * LAS FECHAS SE MUEVEN CON ARITMETICA DE TEXTO, no con `new Date(texto)`.
 * Pasar "01/08/2026" por `new Date` lo interpreta en UTC y a quien esta en
 * Mexico le devuelve el 31 de julio: el gasto de la renta se saldria del mes
 * sin que nadie entienda por que.
 */

import { hoy as hoyDe, type Fecha } from '@neron/base/utils';

export type ClaveDePeriodoDeGasto =
  | 'hoy'
  | 'estaSemana'
  | 'esteMes'
  | 'mesAnterior'
  | 'esteAno'
  | 'personalizado';

export interface PeriodoDeGasto {
  readonly clave: ClaveDePeriodoDeGasto;
  readonly etiqueta: string;
  readonly desde: Fecha;
  readonly hasta: Fecha;
}

/** `dd/mm/aaaa` → `aaaa-mm-dd`. Vacio si no se entiende: nunca una fecha inventada. */
export function aISO(f: Fecha): string {
  const [d, m, a] = f.split('/');
  if (!d || !m || !a) return '';
  return `${a}-${m}-${d}`;
}

/** `aaaa-mm-dd` → `dd/mm/aaaa`. */
export function deISO(iso: string): Fecha {
  const [a, m, d] = iso.split('-');
  if (!a || !m || !d) return '' as Fecha;
  return `${d}/${m}/${a}` as Fecha;
}

/** Los tres numeros de una fecha, ya como enteros. */
function partes(f: Fecha): { d: number; m: number; a: number } {
  const [d, m, a] = f.split('/').map(Number);
  return { d: d ?? 1, m: m ?? 1, a: a ?? 1970 };
}

/** Arma una fecha del calendario, normalizando de paso: el 32 de enero es el 1 de febrero. */
function armar(a: number, m: number, d: number): Fecha {
  // El mediodia en UTC, y no la medianoche, es lo que impide que un cambio de
  // horario de verano corra el dia una casilla.
  const t = new Date(Date.UTC(a, m - 1, d, 12));
  return deISO(t.toISOString().slice(0, 10));
}

/** El lunes de la semana de esa fecha. La semana del centro empieza en lunes. */
export function lunesDe(f: Fecha): Fecha {
  const { d, m, a } = partes(f);
  const t = new Date(Date.UTC(a, m - 1, d, 12));
  // getUTCDay: 0 es domingo. Se corre al lunes anterior, y el domingo cuenta
  // como final de SU semana, no como principio de la siguiente.
  const dia = t.getUTCDay();
  const atras = dia === 0 ? 6 : dia - 1;
  t.setUTCDate(t.getUTCDate() - atras);
  return deISO(t.toISOString().slice(0, 10));
}

/** Esa fecha, tantos dias despues. Negativo va hacia atras. */
export function masDias(f: Fecha, dias: number): Fecha {
  const { d, m, a } = partes(f);
  const t = new Date(Date.UTC(a, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + dias);
  return deISO(t.toISOString().slice(0, 10));
}

/** El ultimo dia del mes de esa fecha: 28, 29, 30 o 31 segun toque. */
export function ultimoDelMes(f: Fecha): Fecha {
  const { m, a } = partes(f);
  // El dia cero del mes SIGUIENTE es el ultimo del actual, y asi los bisiestos
  // salen bien sin tener que saber cuales son.
  return armar(a, m + 1, 0);
}

/** Los cinco periodos con fecha fija. "Personalizado" lo escoge la persona. */
export function periodosDeGasto(dia: Fecha = hoyDe()): PeriodoDeGasto[] {
  const { m, a } = partes(dia);
  const primeroDeEsteMes = armar(a, m, 1);
  const primeroDelAnterior = armar(a, m - 1, 1);

  return [
    { clave: 'hoy', etiqueta: 'Hoy', desde: dia, hasta: dia },
    { clave: 'estaSemana', etiqueta: 'Esta semana', desde: lunesDe(dia), hasta: masDias(lunesDe(dia), 6) },
    { clave: 'esteMes', etiqueta: 'Este mes', desde: primeroDeEsteMes, hasta: ultimoDelMes(dia) },
    {
      clave: 'mesAnterior',
      etiqueta: 'Mes anterior',
      desde: primeroDelAnterior,
      hasta: ultimoDelMes(primeroDelAnterior),
    },
    { clave: 'esteAno', etiqueta: 'Este año', desde: armar(a, 1, 1), hasta: armar(a, 12, 31) },
  ];
}

/**
 * El cambio contra el periodo anterior.
 *
 * `null` cuando no hubo nada antes. Es a proposito y es la cifra que mas veces
 * se ve mal hecha en un tablero: dividir entre cero no da cero, no da nada, y
 * "+∞%" o "+5000%" hacen desconfiar del resto de los numeros. Se dice que no
 * hay con que comparar.
 *
 * En GASTOS el signo se lee al reves que en ventas: gastar MAS es peor. Por
 * eso `esBueno` sale de bajar, no de subir.
 */
export interface CambioDeGasto {
  readonly porcentaje: number;
  readonly sube: boolean;
  readonly esBueno: boolean;
  readonly texto: string;
}

export function compararGasto(actual: number, anterior: number): CambioDeGasto | null {
  if (!Number.isFinite(actual) || !Number.isFinite(anterior) || anterior <= 0) return null;
  const porcentaje = ((actual - anterior) / anterior) * 100;
  const sube = porcentaje > 0;
  return {
    porcentaje,
    sube,
    // Gastar menos es bueno. Es lo contrario de la tarjeta de ventas, y por eso
    // se decide aqui y no se copia de alli.
    esBueno: porcentaje <= 0,
    texto: `${sube ? '+' : ''}${porcentaje.toFixed(1)}%`,
  };
}
