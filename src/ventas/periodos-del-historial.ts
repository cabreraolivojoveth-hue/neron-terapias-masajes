/**
 * EL HISTORIAL, POR MES → SEMANA → DIA.
 *
 * QUE PROBLEMA RESUELVE. El historial acumula cientos de ventas y hasta ahora
 * solo se podia recorrer de diez en diez o buscar por texto. Buscar sirve
 * cuando ya se sabe QUE se busca; para "a ver que se hizo la segunda semana de
 * agosto" no sirve de nada, y bajar por quinientos renglones tampoco.
 *
 * EL BUSCADOR NO SE SUSTITUYE, SE COMPLEMENTA. Son dos preguntas distintas:
 * una es "dónde está la venta de Roberto" y la otra "cómo fue esa semana". Cada
 * una tiene su herramienta y ninguna hace el trabajo de la otra.
 *
 * TODO ESTO ES ARITMETICA PURA sobre los dias que devuelve `ventas_por_dia`:
 * recibe una lista de dias con venta y devuelve el arbol. Sin React, sin
 * consultas y sin `new Date(texto)` — que mueve el dia segun la zona horaria de
 * quien abrio la pantalla, y el dia que se ve mal es justo el que se esta
 * mirando. Se parte el texto `dd/mm/aaaa` a mano y se pregunta a mediodia UTC.
 *
 * LOS MESES Y LAS SEMANAS VACIAS NO EXISTEN. Solo se arman a partir de dias que
 * tienen ventas: un centro que cerro en enero no ve un "Enero 2026" que al
 * abrirlo esta vacio. La lista dice lo que hay.
 */

import type { Fecha } from '@neron/base/utils';
import type { DiaConVentas } from '../datos/ventas.js';

const DIAS = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
] as const;

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
] as const;

export interface DiaDelHistorial {
  readonly fecha: Fecha;
  /** `Lunes 10`. */
  readonly etiqueta: string;
  readonly cuantas: number;
  readonly totalCentavos: number;
}

export interface SemanaDelHistorial {
  readonly clave: string;
  /** `Semana 2`. Se numeran dentro del mes, empezando en 1. */
  readonly etiqueta: string;
  /** `10 Ago — 16 Ago`. El rango REAL, recortado al mes. */
  readonly rango: string;
  readonly cuantas: number;
  readonly totalCentavos: number;
  readonly dias: readonly DiaDelHistorial[];
}

export interface MesDelHistorial {
  readonly clave: string;
  /** `Agosto 2026`. */
  readonly etiqueta: string;
  readonly cuantas: number;
  readonly totalCentavos: number;
  readonly semanas: readonly SemanaDelHistorial[];
}

interface Partida {
  readonly dia: number;
  readonly mes: number;
  readonly anio: number;
  /** 0 = domingo, como `getUTCDay`. */
  readonly diaDeLaSemana: number;
}

/**
 * Parte `dd/mm/aaaa`. `null` si no se entiende — nunca una fecha inventada.
 *
 * Se pregunta a MEDIODIA UTC: a medianoche, un salto de horario de verano
 * cambia el dia y la semana entera se corre una casilla.
 */
function partir(fecha: string): Partida | null {
  const partes = fecha.split('/');
  const dia = Number(partes[0]);
  const mes = Number(partes[1]);
  const anio = Number(partes[2]);
  if (!Number.isInteger(dia) || !Number.isInteger(mes) || !Number.isInteger(anio)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const iso = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const marca = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(marca)) return null;
  const d = new Date(marca);
  // Un 31 de febrero se desborda al 3 de marzo: si el dia que vuelve no es el
  // que entro, la fecha no existia.
  if (d.getUTCDate() !== dia || d.getUTCMonth() + 1 !== mes) return null;

  return { dia, mes, anio, diaDeLaSemana: d.getUTCDay() };
}

/**
 * EN QUE SEMANA DEL MES CAE UN DIA, contando de lunes a domingo.
 *
 * La semana 1 es la del dia 1 del mes, aunque empiece en jueves. Se cuenta
 * cuantos LUNES han pasado desde el dia 1 incluyendo el de la propia semana:
 * es lo que hace que el 1, el 2 y el 3 de un mes que empieza en viernes caigan
 * los tres en la semana 1 y el 4 —lunes— abra la semana 2.
 *
 * NO se usa la semana ISO del año: "Semana 33" no le dice nada a nadie mirando
 * agosto. Lo que se busca es "la segunda semana del mes".
 */
export function semanaDelMes(p: Partida): number {
  // Lunes = 0, domingo = 6. `getUTCDay` da domingo = 0, y con eso la semana
  // arrancaria en domingo — que no es como se lee un calendario aqui.
  const desdeLunes = (p.diaDeLaSemana + 6) % 7;

  // En que dia de la semana cayo el 1 del mes. Se deduce del dia que se tiene
  // en vez de armar otra fecha: una fecha mas es una conversion mas donde
  // equivocarse de zona horaria.
  const desdeLunesDelUno = (((desdeLunes - (p.dia - 1)) % 7) + 7) % 7;

  // Si el mes arranca en lunes, la semana 1 empieza el dia 1. Si no, el dia 1
  // cae en una semana que empezo el mes pasado: esos primeros dias son la
  // semana 1 igual, y el primer lunes abre la 2.
  const arrancaEnLunes = desdeLunesDelUno === 0;
  const primerLunes = arrancaEnLunes ? 1 : 1 + (7 - desdeLunesDelUno);

  if (p.dia < primerLunes) return 1;
  return Math.floor((p.dia - primerLunes) / 7) + (arrancaEnLunes ? 1 : 2);
}

/** `10 Ago`. Lo que se lee en el rango de una semana. */
export function diaCortoConMes(fecha: string): string {
  const p = partir(fecha);
  return p ? `${p.dia} ${MESES_CORTOS[p.mes - 1]}` : fecha;
}

/**
 * EL ARBOL DEL HISTORIAL, de lo mas reciente a lo mas viejo.
 *
 * El orden importa: quien abre el historial casi siempre busca algo cercano.
 * Empezar por el mes mas viejo obliga a bajar hasta el fondo cada vez.
 */
export function mesesDelHistorial(dias: readonly DiaConVentas[]): MesDelHistorial[] {
  /* Se agrupa en dos pasadas y con mapas para no recorrer la lista una vez por
     mes: con un año de ventas son trescientos dias y doce meses, y el bucle
     anidado es el que se nota al escribir en el buscador. */
  const porMes = new Map<string, { p: Partida; d: DiaConVentas }[]>();

  for (const d of dias) {
    const p = partir(d.fecha);
    // Una fecha que no se entiende se DESCARTA, no se mete en un mes inventado:
    // un renglon en "Diciembre 1970" hace pensar que se corrompio la base.
    if (!p) continue;
    const clave = `${p.anio}-${String(p.mes).padStart(2, '0')}`;
    const ya = porMes.get(clave);
    if (ya) ya.push({ p, d });
    else porMes.set(clave, [{ p, d }]);
  }

  const meses: MesDelHistorial[] = [];

  for (const [claveMes, delMes] of porMes) {
    const porSemana = new Map<number, { p: Partida; d: DiaConVentas }[]>();
    for (const x of delMes) {
      const n = semanaDelMes(x.p);
      const ya = porSemana.get(n);
      if (ya) ya.push(x);
      else porSemana.set(n, [x]);
    }

    const semanas: SemanaDelHistorial[] = [];
    for (const [numero, deLaSemana] of porSemana) {
      const ordenados = [...deLaSemana].sort((a, b) => b.p.dia - a.p.dia);
      const primero = ordenados[ordenados.length - 1]!;
      const ultimo = ordenados[0]!;
      semanas.push({
        clave: `${claveMes}-s${numero}`,
        etiqueta: `Semana ${numero}`,
        /* EL RANGO SE ARMA CON LOS DIAS QUE HAY, no con el lunes y el domingo
           teoricos. Si un centro solo abrio martes y jueves, decir "10 Ago —
           16 Ago" prometeria cinco dias que al abrir no estan. */
        rango:
          primero.d.fecha === ultimo.d.fecha
            ? diaCortoConMes(primero.d.fecha)
            : `${diaCortoConMes(primero.d.fecha)} — ${diaCortoConMes(ultimo.d.fecha)}`,
        cuantas: ordenados.reduce((s, x) => s + x.d.cuantas, 0),
        totalCentavos: ordenados.reduce((s, x) => s + x.d.totalCentavos, 0),
        dias: ordenados.map((x) => ({
          fecha: x.d.fecha,
          etiqueta: `${DIAS[x.p.diaDeLaSemana]} ${x.p.dia}`,
          cuantas: x.d.cuantas,
          totalCentavos: x.d.totalCentavos,
        })),
      });
    }

    // La semana mas reciente primero, igual que los meses y los dias.
    semanas.sort((a, b) => b.clave.localeCompare(a.clave, 'es'));

    const p = delMes[0]!.p;
    meses.push({
      clave: claveMes,
      etiqueta: `${MESES[p.mes - 1]} ${p.anio}`,
      cuantas: delMes.reduce((s, x) => s + x.d.cuantas, 0),
      totalCentavos: delMes.reduce((s, x) => s + x.d.totalCentavos, 0),
      semanas,
    });
  }

  meses.sort((a, b) => b.clave.localeCompare(a.clave, 'es'));
  return meses;
}

/** `3 ventas` / `1 venta`. Se dice la palabra: un numero suelto no se lee. */
export function comoSeCuentan(cuantas: number): string {
  return cuantas === 1 ? '1 venta' : `${cuantas} ventas`;
}
