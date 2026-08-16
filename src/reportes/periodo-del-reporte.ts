/**
 * EL PERIODO GLOBAL DE REPORTES.
 *
 * TODA LA PANTALLA MIRA EL MISMO RANGO, Y ESO ES LA MITAD DEL MODULO. Las
 * cuatro cifras de arriba, las ocho pestañas, las dos graficas, los rankings y
 * el resumen del costado salen del MISMO `desde`/`hasta`. Si una parte
 * calculara el suyo, dos numeros de la misma pantalla se contradirian y quien
 * los mira concluye —con razon— que el sistema miente. Por eso el periodo vive
 * arriba del todo y baja por propiedades; ninguna seccion escoge el suyo.
 *
 * LAS FECHAS SE MUEVEN CON ARITMETICA DE TEXTO, no con `new Date(texto)`.
 * Pasar "01/08/2026" por `new Date` lo interpreta en UTC y a quien esta en
 * Mexico le devuelve el 31 de julio: la venta del primero se saldria del mes
 * sin que nadie entienda por que. Es la misma leccion de `gastos/periodos.ts`,
 * y se repiten las funciones a proposito: importarlas de Gastos ataria el
 * periodo de Reportes a los cinco rangos que Gastos necesita, que no son los
 * seis que pide el diseño de aqui.
 */

import { hoy as hoyDe, type Fecha } from '@neron/base/utils';

export type ClaveDePeriodo =
  | 'hoy'
  | 'ayer'
  | 'estaSemana'
  | 'esteMes'
  | 'mesAnterior'
  | 'personalizado';

export interface PeriodoDelCentro {
  readonly clave: ClaveDePeriodo;
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

function partes(f: Fecha): { d: number; m: number; a: number } {
  const [d, m, a] = f.split('/').map(Number);
  return { d: d ?? 1, m: m ?? 1, a: a ?? 1970 };
}

/** Arma una fecha del calendario, normalizando: el 32 de enero es el 1 de febrero. */
function armar(a: number, m: number, d: number): Fecha {
  // El mediodia en UTC, y no la medianoche, es lo que impide que un cambio de
  // horario de verano corra el dia una casilla.
  return deISO(new Date(Date.UTC(a, m - 1, d, 12)).toISOString().slice(0, 10));
}

/** Esa fecha, tantos dias despues. Negativo va hacia atras. */
export function masDias(f: Fecha, dias: number): Fecha {
  const { d, m, a } = partes(f);
  const t = new Date(Date.UTC(a, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + dias);
  return deISO(t.toISOString().slice(0, 10));
}

/** El lunes de esa semana. La semana del centro empieza en lunes. */
export function lunesDe(f: Fecha): Fecha {
  const { d, m, a } = partes(f);
  const t = new Date(Date.UTC(a, m - 1, d, 12));
  // getUTCDay: 0 es domingo, y el domingo cierra SU semana en vez de abrir la
  // siguiente. Es como cuenta la semana quien trabaja aqui.
  const dia = t.getUTCDay();
  t.setUTCDate(t.getUTCDate() - (dia === 0 ? 6 : dia - 1));
  return deISO(t.toISOString().slice(0, 10));
}

/** El ultimo dia del mes de esa fecha: 28, 29, 30 o 31 segun toque. */
export function ultimoDelMes(f: Fecha): Fecha {
  const { m, a } = partes(f);
  // El dia cero del mes SIGUIENTE es el ultimo del actual, y asi los bisiestos
  // salen bien sin tener que saber cuales son.
  return armar(a, m + 1, 0);
}

/**
 * Los cinco rangos con fecha fija del diseño, en su orden.
 *
 * "Personalizado" no esta aqui porque no tiene fechas propias: las escoge la
 * persona y por eso vive en el estado de la pantalla.
 */
export function periodosDelCentro(dia: Fecha = hoyDe()): PeriodoDelCentro[] {
  const { m, a } = partes(dia);
  const primeroDeEsteMes = armar(a, m, 1);
  const primeroDelAnterior = armar(a, m - 1, 1);
  const lunes = lunesDe(dia);

  return [
    { clave: 'hoy', etiqueta: 'Hoy', desde: dia, hasta: dia },
    { clave: 'ayer', etiqueta: 'Ayer', desde: masDias(dia, -1), hasta: masDias(dia, -1) },
    { clave: 'estaSemana', etiqueta: 'Esta semana', desde: lunes, hasta: masDias(lunes, 6) },
    { clave: 'esteMes', etiqueta: 'Este mes', desde: primeroDeEsteMes, hasta: ultimoDelMes(dia) },
    {
      clave: 'mesAnterior',
      etiqueta: 'Mes anterior',
      desde: primeroDelAnterior,
      hasta: ultimoDelMes(primeroDelAnterior),
    },
  ];
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * El periodo escrito como lo lee una persona, que es lo que va en el boton de
 * arriba: "1 – 10 de julio, 2025".
 *
 * SE ABREVIA CUANDO EL MES Y EL AÑO SE REPITEN. "1 de julio, 2025 – 10 de
 * julio, 2025" es la misma informacion escrita dos veces, y en un boton de
 * ciento ochenta pixeles obliga a cortar justo la parte que distingue los dos
 * extremos. Un solo dia se escribe entero: "10 de julio, 2025".
 */
export function periodoEnPalabras(desde: Fecha, hasta: Fecha): string {
  if (!desde || !hasta) return 'Sin periodo';
  const d = partes(desde);
  const h = partes(hasta);
  const mesD = MESES[d.m - 1] ?? '';
  const mesH = MESES[h.m - 1] ?? '';

  if (desde === hasta) return `${d.d} de ${mesD}, ${d.a}`;
  if (d.a === h.a && d.m === h.m) return `${d.d} – ${h.d} de ${mesH}, ${h.a}`;
  if (d.a === h.a) return `${d.d} de ${mesD} – ${h.d} de ${mesH}, ${h.a}`;
  return `${d.d} de ${mesD}, ${d.a} – ${h.d} de ${mesH}, ${h.a}`;
}

/**
 * El cambio contra el periodo anterior.
 *
 * `null` CUANDO NO HAY CON QUE COMPARAR, y es la regla que mas veces se ve rota
 * en un tablero. Dividir entre cero no da cero: no da nada. Un "+100%" contra
 * la nada es el numero mas facil de creerse y el mas falso, y en cuanto alguien
 * lo cacha deja de creerse tambien los que si eran ciertos. Quien lo pinta dice
 * "Sin comparación disponible".
 */
export interface CambioDelPeriodo {
  readonly porcentaje: number;
  readonly sube: boolean;
  readonly texto: string;
}

export function compararConAntes(actual: number, anterior: number): CambioDelPeriodo | null {
  if (!Number.isFinite(actual) || !Number.isFinite(anterior) || anterior <= 0) return null;
  const porcentaje = ((actual - anterior) / anterior) * 100;
  return {
    porcentaje,
    sube: porcentaje > 0,
    texto: `${porcentaje >= 0 ? '↑' : '↓'} ${Math.abs(porcentaje).toFixed(1)}%`,
  };
}
