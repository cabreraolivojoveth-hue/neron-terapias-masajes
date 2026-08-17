/**
 * LA FRONTERA DE LECTURA: todo lo que entra desde la base pasa por aqui.
 *
 * POR QUE EXISTE, Y QUE COSTO NO TENERLO:
 *
 * Cada archivo de `src/datos/` se habia escrito su propio `numero`, su propio
 * `texto` y su propio `lista`. Once copias, todas parecidas, ninguna igual del
 * todo: `reportes.ts` y `mensajes.ts` exigian `typeof v === 'number'` —asi que
 * un `numeric` que PostgREST decida mandar entre comillas se leia como cero— y
 * las otras nueve aceptaban cualquier cosa que `Number()` entendiera.
 *
 * Y NINGUNA DE LAS ONCE GARANTIZABA CENTAVOS ENTEROS. Eso fue lo que tumbo la
 * pantalla de Gastos entera: `resumen_de_gastos` devolvia el promedio diario
 * como `67222.58066516129` —`sum()` de un bigint es `numeric`, y dividir un
 * `numeric` da decimales—, la frontera lo copiaba tal cual a
 * `promedioDiarioCentavos`, y la guardia de dinero de la base reventaba al
 * pintarlo: "formatearMoneda() recibio 67222.58066516129, que no son centavos
 * enteros". Con el centro vacio la division daba cero clavado y no se veia; con
 * gastos de verdad, la pantalla dejo de existir.
 *
 * EL SERVIDOR TAMBIEN SE ARREGLO —`resumen_de_gastos` redondea ahora en la
 * base— y las dos cosas hacen falta. El servidor, porque el dinero debe salir
 * entero de donde vive. Y esta frontera, porque una pantalla no puede depender
 * de que las ciento y pico de funciones de la base acierten todas: hoy es el
 * promedio de Gastos, mañana es cualquier `avg()`, `/` o `* 1.16` que alguien
 * escriba dentro de un `jsonb_build_object`. Un modulo que muere entero por un
 * decimal es una fragilidad de arquitectura, no un error de una funcion.
 *
 * LA REGLA: los campos de dinero se leen con `centavos()`, nunca con
 * `numero()`. `numero()` es para cantidades, conteos y porcentajes.
 */

/**
 * Un numero de la base. NaN NUNCA sale de aqui.
 *
 * Un NaN no revienta: se suma, se formatea y termina impreso como "NaN" en la
 * tarjeta de alguien. Se corta en la puerta.
 */
export const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Un numero que puede NO existir. `null` no se convierte en cero. */
export const numeroONulo = (v: unknown): number | null =>
  v === null || v === undefined ? null : numero(v);

/**
 * DINERO. Centavos ENTEROS, siempre, pase lo que pase.
 *
 * Se redondea al centavo mas cercano, que es la misma cuenta que hace la base
 * con `round()`. No es "decidir por cuenta propia cuantos centavos son un
 * centavo": es negarse a dejar entrar medio centavo al sistema. Medio centavo
 * no existe en ninguna caja del mundo.
 */
export const centavos = (v: unknown): number => Math.round(numero(v));

/** Dinero que puede NO existir —un corte sin contar todavia, por ejemplo—. */
export const centavosONulos = (v: unknown): number | null =>
  v === null || v === undefined ? null : centavos(v);

export const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Texto que puede faltar. La cadena vacia cuenta como faltar. */
export const opcional = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

export const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
