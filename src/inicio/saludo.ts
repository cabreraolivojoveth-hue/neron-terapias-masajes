/**
 * EL SALUDO DEL ENCABEZADO DE INICIO. Aritmetica pura, sin pantalla.
 *
 * Vive aparte para poder probarlo a cualquier hora del dia sin tocar el reloj
 * de la maquina: las funciones RECIBEN el momento en vez de preguntarselo al
 * sistema. Una prueba que dice "a las ocho de la noche saluda con buenas
 * noches" tiene que poder correr a las tres de la tarde.
 *
 * Las fechas escritas en palabras se fueron a `ui/fechas-en-palabras.ts`
 * cuando Agenda empezo a escribir la misma fecha en su barra: dos pantallas
 * que escriben "Jueves 10 de julio de 2025" tienen que escribirlo con el mismo
 * codigo, y Agenda no tiene por que depender de Inicio para eso.
 */

export type Saludo = 'Buenos días' | 'Buenas tardes' | 'Buenas noches';

/**
 * El saludo segun la hora, con los cortes de aqui.
 *
 * De 5 a 11:59 es mañana, de 12 a 18:59 tarde, y de 19 en adelante noche —
 * incluida la madrugada, que sigue siendo "buenas noches" para quien cierra
 * caja a la una. Los cortes de la escuela (6 y 20) dejan un "buenos días" a
 * las siete y media de la noche en invierno, que se lee raro.
 */
export function saludoSegunLaHora(momento: Date = new Date()): Saludo {
  const hora = momento.getHours();
  if (hora >= 5 && hora < 12) return 'Buenos días';
  if (hora >= 12 && hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * El primer nombre de quien entro.
 *
 * Se saluda con el nombre, no con el nombre completo: "¡Buenos días, María
 * Guadalupe Hernández del Río!" no lo dice nadie. Si el nombre viene vacio se
 * devuelve vacio y quien lo pinta decide — nunca un "Usuario" inventado.
 */
export function primerNombre(nombreCompleto: string | null | undefined): string {
  const limpio = (nombreCompleto ?? '').trim().replace(/\s+/g, ' ');
  if (!limpio) return '';
  // Un correo de nombre —pasa cuando la cuenta todavia no tiene nombre
  // puesto— se corta antes de la arroba en vez de saludar a "ana@centro.mx".
  const sinCorreo = limpio.includes('@') ? (limpio.split('@')[0] ?? limpio) : limpio;
  return sinCorreo.split(' ')[0] ?? '';
}

/** `¡Buenos días, María!` — o sin nombre si todavia no se sabe cual es. */
export function encabezadoDeSaludo(
  nombreCompleto: string | null | undefined,
  momento: Date = new Date(),
): string {
  const saludo = saludoSegunLaHora(momento);
  const nombre = primerNombre(nombreCompleto);
  return nombre ? `¡${saludo}, ${nombre}!` : `¡${saludo}!`;
}
