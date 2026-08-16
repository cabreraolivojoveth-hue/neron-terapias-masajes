/**
 * LAS VARIABLES DE UNA PLANTILLA, rellenadas con datos de verdad.
 *
 * Una plantilla dice `Hola {{cliente.nombre}}, te esperamos el {{cita.fecha}}`.
 * Aquí se sustituye por lo que de verdad hay en Clientes y en Agenda — nunca
 * por un ejemplo.
 *
 * QUÉ PASA CUANDO FALTA UN DATO, que es la única decisión interesante de este
 * archivo: la variable SE QUEDA ESCRITA y se avisa cuáles faltan.
 *
 * Las otras dos opciones son peores y las dos se ven a diario en otros
 * sistemas:
 *
 *   · Sustituir por vacío manda "Hola , te esperamos el ." Sale sin fallar,
 *     llega al cliente, y quien lo mandó se entera cuando le contestan
 *     preguntando qué quiso decir.
 *   · Sustituir por un ejemplo —"Hola Ana"— manda el nombre de otra persona.
 *
 * Dejándola escrita, quien va a enviar VE `{{cita.fecha}}` en el cuadro de
 * texto antes de tocar el botón. Es imposible que se le pase.
 *
 * LO QUE NO SE GUARDA NUNCA es el texto ya rellenado dentro de la plantilla:
 * eso sería una copia del nombre de alguien que envejece sola. La plantilla
 * guarda la pregunta; el mensaje guarda la respuesta de ese momento.
 */

/** Lo que se sabe al rellenar. Todo opcional: casi nunca se sabe todo. */
export interface ContextoDePlantilla {
  readonly cliente?: {
    readonly nombre?: string | null;
    readonly telefono?: string | null;
    readonly correo?: string | null;
  };
  readonly cita?: {
    readonly fecha?: string | null;
    readonly hora?: string | null;
    readonly servicio?: string | null;
    readonly profesional?: string | null;
  };
  readonly servicio?: { readonly nombre?: string | null; readonly precio?: string | null };
  readonly curso?: { readonly nombre?: string | null; readonly inicio?: string | null };
  readonly centro?: { readonly nombre?: string | null };
}

/**
 * Las variables que existen, con lo que significan.
 *
 * La lista está aquí y no repartida por las pantallas: es lo que se le enseña a
 * quien escribe una plantilla, y si viviera en dos sitios uno se quedaría corto
 * el día que se agregue una.
 */
export const VARIABLES: ReadonlyArray<{ readonly llave: string; readonly que: string }> = [
  { llave: 'cliente.nombre', que: 'Cómo se llama' },
  { llave: 'cliente.telefono', que: 'Su teléfono' },
  { llave: 'cliente.correo', que: 'Su correo' },
  { llave: 'cita.fecha', que: 'La fecha de su próxima cita' },
  { llave: 'cita.hora', que: 'La hora de su próxima cita' },
  { llave: 'cita.servicio', que: 'Qué se le va a dar' },
  { llave: 'cita.profesional', que: 'Quién la atiende' },
  { llave: 'servicio.nombre', que: 'El servicio del que se habla' },
  { llave: 'servicio.precio', que: 'Su precio' },
  { llave: 'curso.nombre', que: 'El curso del que se habla' },
  { llave: 'curso.inicio', que: 'Cuándo empieza' },
  { llave: 'centro.nombre', que: 'El nombre del centro' },
];

/** Un grupo del contexto, ya como bolsa de textos. */
type Bolsa = Readonly<Record<string, string | null | undefined>> | undefined;

/**
 * Se escoge el grupo A MANO y no con un índice sobre el objeto.
 *
 * Indexar el contexto con una cadena obligaría a convertirlo a la fuerza
 * (`as unknown as`), que la guardia 5 prohíbe con razón: una conversión suelta
 * es la puerta por la que entra un `undefined` disfrazado de texto. Escritas
 * una por una, el compilador comprueba que los grupos existen — y si mañana se
 * agrega uno y se olvida aquí, la variable simplemente no se rellena y se
 * reporta como faltante, que es el fallo seguro.
 */
function grupoDelContexto(c: ContextoDePlantilla, grupo: string): Bolsa {
  if (grupo === 'cliente') return c.cliente;
  if (grupo === 'cita') return c.cita;
  if (grupo === 'servicio') return c.servicio;
  if (grupo === 'curso') return c.curso;
  if (grupo === 'centro') return c.centro;
  return undefined;
}

/** El valor de una llave dentro del contexto, o `null` si no se sabe. */
export function valorDeLaVariable(llave: string, c: ContextoDePlantilla): string | null {
  const [grupo, campo] = llave.split('.');
  if (!grupo || !campo) return null;
  const bolsa = grupoDelContexto(c, grupo);
  if (!bolsa) return null;
  const valor = bolsa[campo];
  // Un valor vacío cuenta como que NO se sabe: mandar "Hola  " es el mismo
  // problema que mandar "Hola {{cliente.nombre}}", pero sin avisar.
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

export interface PlantillaRellenada {
  readonly texto: string;
  /** Las que se quedaron escritas porque no había con qué rellenarlas. */
  readonly faltantes: readonly string[];
}

export function rellenarPlantilla(cuerpo: string, contexto: ContextoDePlantilla): PlantillaRellenada {
  const faltantes: string[] = [];
  const texto = cuerpo.replace(/\{\{\s*([a-zA-Z]+\.[a-zA-Z]+)\s*\}\}/g, (entera, llave: string) => {
    const valor = valorDeLaVariable(llave, contexto);
    if (valor !== null) return valor;
    if (!faltantes.includes(llave)) faltantes.push(llave);
    // Se devuelve la variable TAL CUAL, para que se vea en el cuadro de texto
    // antes de enviar.
    return entera;
  });
  return { texto, faltantes };
}

/** Las variables que usa una plantilla, para poder avisar de las que no existen. */
export function variablesDe(cuerpo: string): string[] {
  const vistas: string[] = [];
  for (const m of cuerpo.matchAll(/\{\{\s*([a-zA-Z]+\.[a-zA-Z]+)\s*\}\}/g)) {
    const llave = m[1]!;
    if (!vistas.includes(llave)) vistas.push(llave);
  }
  return vistas;
}

/**
 * Las que están escritas y no existen.
 *
 * Se avisa AL EDITAR la plantilla, no al enviarla: una variable mal escrita
 * —`{{cliente.nombe}}`— no falla nunca, simplemente viaja tal cual hasta el
 * teléfono del cliente.
 */
export function variablesDesconocidas(cuerpo: string): string[] {
  const conocidas = new Set(VARIABLES.map((v) => v.llave));
  return variablesDe(cuerpo).filter((v) => !conocidas.has(v));
}
