/**
 * LA MONEDA DEL CENTRO — una sola fuente de verdad para TODO el dinero.
 *
 * POR QUE EXISTE ESTE ARCHIVO, Y CUAL ERA EL PROBLEMA:
 *
 * `formatearMoneda` de la base escribe el signo `$` y dos decimales a fuerza.
 * Es correcto para la base —no puede saber en que pais vive cada producto— pero
 * en el producto lo llamaban 197 sitios de 41 archivos: Ventas, Caja, Gastos,
 * Reportes, Inicio, Productos, Servicios, Cursos. Configurar la moneda en una
 * pantalla y que las otras cuarenta siguieran escribiendo `$` habria sido
 * exactamente lo que este proyecto no hace: una configuracion que solo cambia
 * la pantalla donde se configura.
 *
 * COMO SE RESUELVE SIN TOCAR CUARENTA ARCHIVOS A MANO: la funcion se sustituye,
 * no se envuelve. Todo el producto importa `formatearDinero` DE AQUI, y aqui
 * hay un valor —el del centro— que se pone UNA vez al arrancar la sesion.
 *
 * POR QUE ES UN VALOR SUELTO Y NO UN CONTEXTO DE REACT:
 *
 * Porque no todo el que formatea dinero es un componente. Lo llaman funciones
 * puras que arman un CSV, que escriben una etiqueta de grafica o que ordenan
 * una tabla, y ninguna de esas puede pedir un contexto. Un contexto habria
 * obligado a partir cada una en dos: la que calcula y la que pinta.
 *
 * LO QUE NO CAMBIA: el dinero se guarda y se opera SIEMPRE en centavos enteros.
 * Esto solo decide como se ESCRIBE al final. Los decimales de configuracion no
 * tocan ni una operacion — cambiar de dos decimales a cero no redondea nada
 * guardado, solo deja de enseñar los centavos.
 */

import { formatearMoneda } from '@neron/base/utils';

export interface FormaDeLaMoneda {
  /** El código de tres letras. Es lo que se guarda. */
  readonly codigo: string;
  /** El signo que se pinta delante. */
  readonly simbolo: string;
  readonly decimales: number;
}

/**
 * LOS SIGNOS QUE SE CONOCEN.
 *
 * No es un catalogo de monedas del mundo: son las que un centro de por aqui
 * puede llegar a usar. Una moneda que no este en la lista se escribe con su
 * codigo delante —`MXN 1,200.00`— que es feo pero es VERDAD, y es mejor que
 * ponerle un `$` a una moneda que no lo usa.
 */
export const SIGNOS: Readonly<Record<string, string>> = {
  MXN: '$',
  USD: '$',
  CAD: '$',
  ARS: '$',
  CLP: '$',
  COP: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  BRL: 'R$',
  PEN: 'S/',
  GTQ: 'Q',
};

export const MONEDA_POR_OMISION: FormaDeLaMoneda = {
  codigo: 'MXN',
  simbolo: '$',
  decimales: 2,
};

/** El signo de un código. Sin signo conocido, el propio código y un espacio. */
export function signoDe(codigo: string): string {
  const limpio = codigo.trim().toUpperCase();
  return SIGNOS[limpio] ?? `${limpio} `;
}

/**
 * La moneda puesta AHORA MISMO.
 *
 * Arranca en la de omisión y la cambia `ponerLaMoneda` en cuanto llega la
 * configuración del centro. Mientras tanto se escribe con el signo de siempre:
 * un importe sin signo durante el primer segundo se lee como un número suelto.
 */
let puesta: FormaDeLaMoneda = MONEDA_POR_OMISION;

/** Los que quieren enterarse de que cambió. Sirve para repintar sin recargar. */
const oyentes = new Set<() => void>();

export function laMoneda(): FormaDeLaMoneda {
  return puesta;
}

/**
 * Cambia la moneda de todo el sistema.
 *
 * SOLO AVISA SI DE VERDAD CAMBIO. Repintar la aplicación entera cada vez que
 * una consulta revalida —aunque conteste lo mismo— es lo que hace que una
 * pantalla parpadee sin motivo aparente.
 */
export function ponerLaMoneda(codigo: string, decimales: number): void {
  const nueva: FormaDeLaMoneda = {
    codigo: codigo.trim().toUpperCase() || MONEDA_POR_OMISION.codigo,
    simbolo: signoDe(codigo),
    decimales:
      Number.isFinite(decimales) && decimales >= 0 && decimales <= 4
        ? Math.trunc(decimales)
        : MONEDA_POR_OMISION.decimales,
  };
  if (
    nueva.codigo === puesta.codigo &&
    nueva.simbolo === puesta.simbolo &&
    nueva.decimales === puesta.decimales
  ) {
    return;
  }
  puesta = nueva;
  for (const o of oyentes) o();
}

/** Vuelve a la de omisión. Al cambiar de cuenta, la del centro anterior no se queda. */
export function olvidarLaMoneda(): void {
  puesta = MONEDA_POR_OMISION;
  for (const o of oyentes) o();
}

export function suscribirALaMoneda(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/**
 * EL DINERO ESCRITO. Es lo que llama todo el producto.
 *
 * Se apoya en `formatearMoneda` de la base para los separadores de miles y el
 * signo negativo —que ya estan probados ahi— y encima le cambia el signo y los
 * decimales del centro. Reescribir la separacion de miles aqui habria sido
 * copiar codigo probado para que se desincronizara.
 */
export function formatearDinero(
  centavos: number,
  opciones: { conSimbolo?: boolean } = {},
): string {
  const { conSimbolo = true } = opciones;
  const { simbolo, decimales } = puesta;

  const base = formatearMoneda(centavos, { conSimbolo: false });

  let cuerpo = base;
  if (decimales === 0) {
    // Se QUITAN los centavos, no se redondea el guardado: el dato sigue igual,
    // solo deja de enseñarse. Un centro que cobra en pesos enteros no quiere
    // ver ",00" en cada renglón.
    cuerpo = base.slice(0, base.lastIndexOf('.'));
  } else if (decimales !== 2) {
    const punto = base.lastIndexOf('.');
    const enteros = base.slice(0, punto);
    const fraccion = base.slice(punto + 1);
    cuerpo = `${enteros}.${fraccion.padEnd(decimales, '0').slice(0, decimales)}`;
  }

  // El negativo va DELANTE del signo, como se escribe de verdad: `-$120.00`.
  if (!conSimbolo) return cuerpo;
  return cuerpo.startsWith('-') ? `-${simbolo}${cuerpo.slice(1)}` : `${simbolo}${cuerpo}`;
}

/**
 * El desglose del impuesto de un total, con la tasa del centro.
 *
 * DOS CUENTAS DISTINTAS, y confundirlas cambia todos los totales:
 *
 *   · Si el precio YA LLEVA el impuesto dentro, se saca hacia atrás:
 *     impuesto = total × tasa / (100 + tasa). El total no se toca.
 *   · Si NO lo lleva, se suma encima: impuesto = base × tasa / 100.
 *
 * Devuelve centavos enteros, redondeados como el resto del sistema.
 */
export function impuestoDe(
  baseCentavos: number,
  tasa: number,
  incluido: boolean,
): number {
  if (!Number.isFinite(tasa) || tasa <= 0 || baseCentavos === 0) return 0;
  const bruto = incluido
    ? (baseCentavos * tasa) / (100 + tasa)
    : (baseCentavos * tasa) / 100;
  return Math.round(bruto);
}
