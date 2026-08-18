/**
 * DARSE DE ALTA UNO MISMO: el centro nace aqui.
 *
 * Es la unica llamada del producto que crea una membresia sin que nadie de
 * adentro invite, y por eso vive sola en su archivo en vez de perderse entre
 * las cuarenta funciones de `configuracion.ts`.
 *
 * LO QUE NO VIAJA DESDE AQUI, Y ES LO IMPORTANTE: ni el id del centro, ni el
 * correo, ni el rol. Los tres los saca la base del token de la sesion. Si el
 * id viniera de esta capa, cualquiera escribiria el del centro de otro y se
 * daria de alta ahi de dueño — que es exactamente el fallo que `membresia`
 * existe para impedir. Lo unico que se manda son los dos nombres.
 */

import { supabase } from '../supabase.js';

/**
 * El mensaje que sale cuando la base todavia no tiene la funcion.
 *
 * PASA DE VERDAD Y ES EL PRIMER TROPIEZO: Vercel publica el navegador, no la
 * base. Quien suba esta version sin pegar `PEGAR-CREAR-CUENTA.sql` ve el boton,
 * lo aprieta, y recibe un "Could not find the function" que no le dice a nadie
 * que el archivo que falta esta en el repositorio, con nombre y todo.
 *
 * EL MENSAJE CUBRE LOS DOS CASOS A PROPOSITO. PostgREST contesta exactamente lo
 * mismo cuando la funcion SI existe pero los nombres de sus parametros no
 * coinciden —una version vieja instalada encima—. Decir solo "pega el archivo"
 * a quien ya lo pego lo deja sin salida; decir "vuelve a pegarlo, la que quedo
 * es de otra epoca" arregla las dos.
 */
const FALTA_EN_LA_BASE =
  'Tu base de datos no reconoce la función para crear centros. ' +
  'Vuelve a pegar PEGAR-CREAR-CUENTA.sql en Supabase → SQL Editor: si ya lo hiciste, ' +
  'la versión que quedó instalada es de otra época y hay que reemplazarla.';

export interface CentroRecienNacido {
  readonly negocio: string;
  readonly centro: string;
}

/**
 * Crea el centro y deja a quien llama dentro, de dueño.
 *
 * Devuelve el id para poder decirlo en la bitacora del navegador; la pantalla
 * no lo usa para nada mas, porque quien manda es la membresia que acaba de
 * nacer y esa la vuelve a leer el portero al recargar.
 */
export async function crearMiCentro(
  centro: string,
  miNombre: string,
): Promise<CentroRecienNacido> {
  const { data, error } = await supabase().rpc('crear_mi_centro', {
    p_centro: centro.trim().replace(/\s+/g, ' '),
    p_mi_nombre: miNombre.trim().replace(/\s+/g, ' '),
  });

  if (error) {
    /**
     * Los mensajes de la base YA VIENEN REDACTADOS en español y explican que
     * hacer ("Usa 'Ya me invitaron' en vez de crear uno nuevo"). Envolverlos en
     * "crear tu centro: ..." como hace `reventar` los dejaria peor, asi que
     * aqui se pasan tal cual. La unica traduccion es la de arriba, porque ese
     * error no lo escribio nadie pensando en quien lo iba a leer.
     */
    const dijo = error.message;
    if (/crear_mi_centro/.test(dijo) && /(does not exist|Could not find)/i.test(dijo)) {
      throw new Error(FALTA_EN_LA_BASE);
    }
    throw new Error(dijo);
  }

  const r = (data ?? {}) as Record<string, unknown>;
  return {
    negocio: typeof r['negocio'] === 'string' ? r['negocio'] : '',
    centro: typeof r['centro'] === 'string' ? r['centro'] : centro.trim(),
  };
}
