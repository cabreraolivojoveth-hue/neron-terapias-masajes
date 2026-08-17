/**
 * LAS CIFRAS GRANDES TIENEN QUE CABER, HOY Y CON UN CERO MAS.
 *
 * EL FALLO, TAL COMO SE VEIA: el centro de la dona de Reportes decia
 * "$44,575.00" y el texto se salia del anillo. No es un problema de esa cifra
 * concreta —bajarle dos puntos al tamaño lo tapaba— sino de que el tamaño
 * estaba escrito para UNA longitud. El centro que hoy factura cuarenta mil
 * factura mañana medio millon, y `$1,500,000.00` son cinco caracteres mas.
 *
 * POR QUE NO SE RESUELVE SOLO CON CSS: `clamp()` adapta al ancho del
 * CONTENEDOR, no al largo del TEXTO. Dos cifras distintas en la misma caja
 * reciben el mismo tamaño, y la larga se sale igual. Hace falta mirar cuanto
 * mide lo que se va a escribir.
 *
 * POR QUE NO SE MIDE CON JAVASCRIPT: medir el ancho real obliga a pintar,
 * medir, y volver a pintar mas chico — un parpadeo en cada carga y un bucle de
 * reflow por cada tarjeta. Contar caracteres acierta lo suficiente porque la
 * tipografia de las cifras es de ancho fijo (`tabular-nums`): todos los digitos
 * miden igual, asi que el largo del texto SI predice el ancho.
 *
 * LOS CORTES SE ESCOGIERON CON LA MONEDA MAS LARGA QUE EL SISTEMA CONOCE
 * —`MXN 1,500,000.00`, la que se escribe con el codigo delante porque no tiene
 * signo propio—, no con el peso.
 */

/**
 * El grado de aprieto de una cifra, por cuanto ocupa escrita.
 *
 * Devuelve el sufijo de la clase: `''` cuando cabe holgada, y despues tres
 * escalones. Se devuelve una CLASE y no un tamaño para que los tamaños sigan
 * viviendo en la hoja de estilos, con sus tokens — un `style` con pixeles
 * dentro del componente es justo lo que la guardia del color impide para los
 * colores, y por la misma razon.
 */
export function claseDeCifra(texto: string): string {
  const largo = texto.length;
  // Hasta "$99,999.00" —diez caracteres— cabe sin tocar nada. Tambien la raya
  // de "todavia no llega", que mide uno.
  if (largo <= 10) return '';
  // Los cientos de miles: "$100,000.00", "$999,999.00".
  if (largo <= 12) return 'pz-cifra--larga';
  // El millon: "$1,500,000.00", y hasta "MXN 1,500,000.00" — la moneda sin
  // signo propio, que se escribe con su codigo delante y es el caso mas largo
  // que el sistema produce con cifras normales.
  if (largo <= 16) return 'pz-cifra--muy-larga';
  // De aqui para arriba ya son miles de millones. Se lee chico, que es
  // infinitamente mejor que salirse de la tarjeta.
  return 'pz-cifra--enorme';
}

/**
 * LA MISMA CIFRA, ACORTADA, para donde de verdad no cabe.
 *
 * `1234567` → `1.2 M`. Se usa SOLO en los ejes de las graficas y en las
 * etiquetas apretadas, nunca en un total que alguien vaya a apuntar o a
 * cuadrar: un corte de caja con "1.2 M" no sirve para nada.
 *
 * Recibe CENTAVOS, como todo el dinero del sistema, y el simbolo se pasa desde
 * fuera para no duplicar la logica de la moneda del centro.
 */
export function cifraCorta(centavos: number, simbolo: string): string {
  const pesos = Math.round(centavos / 100);
  const signo = pesos < 0 ? '-' : '';
  const n = Math.abs(pesos);
  if (n >= 1_000_000) return `${signo}${simbolo}${recortar(n / 1_000_000)} M`;
  if (n >= 10_000) return `${signo}${simbolo}${recortar(n / 1_000)} k`;
  return `${signo}${simbolo}${n.toLocaleString('es-MX')}`;
}

/**
 * Un decimal, y solo si aporta.
 *
 * `1.0 M` se lee peor que `1 M` y ocupa dos caracteres mas para no decir nada.
 */
function recortar(n: number): string {
  const uno = Math.round(n * 10) / 10;
  return Number.isInteger(uno) ? String(uno) : uno.toFixed(1);
}
