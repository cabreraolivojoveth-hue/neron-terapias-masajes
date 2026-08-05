/**
 * El cliente de Supabase.
 *
 * Se crea UNA VEZ para toda la aplicacion. Crear uno por pantalla abre una
 * conexion nueva cada vez y, peor, cada uno lleva su propia copia de la
 * sesion: la persona cierra sesion en una pantalla y sigue dentro en la otra.
 *
 * LAS LLAVES NO ESTAN AQUI. Vienen del archivo `.env` de la maquina, que
 * `.gitignore` deja fuera del repositorio. La `anon key` va en el navegador y
 * cualquiera la puede ver abriendo las herramientas de desarrollador — no hay
 * forma de esconderla, y por eso lo que protege los datos son las reglas de
 * acceso por fila de la base de datos, no el secreto de esa llave.
 */

import type { ClienteSupabase } from '@neron/base/contratos';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Se RECORTAN los espacios, y no es un detalle.
 *
 * El archivo .env se escribe pegando valores copiados del portapapeles. Un
 * espacio o un salto de linea al final se cuela sin que nadie lo vea, y
 * `createClient("https://algo.supabase.co ")` revienta con "Invalid URL"
 * durante el primer render — pantalla en blanco, sin ninguna pista.
 *
 * Tambien se quitan las comillas: mucha gente escribe VITE_SUPABASE_URL="..."
 * porque asi se hace en otros formatos, y aqui las comillas viajan dentro del
 * valor.
 */
const limpiar = (v: unknown): string =>
  String(v ?? '').trim().replace(/^["']|["']$/g, '');

/**
 * ENDEREZA LA DIRECCION, y esto salio de un caso real.
 *
 * Al pegar la direccion en la consola de Windows se perdio la primera letra y
 * quedo guardado `ttps://algo.supabase.co`. El cliente de Supabase la rechazo
 * con "Invalid supabaseUrl" y la pantalla se quedaba en blanco.
 *
 * En vez de confiar en que se pegue perfecto, se reconstruye: se le quita
 * cualquier cosa que parezca un prefijo de direccion —bien o mal escrito— y
 * se le pone `https://` a lo que queda. Asi funciona igual si alguien escribe
 * solo `algo.supabase.co`, que es lo que la mitad de la gente hace.
 */
function enderezar(direccion: string): string {
  if (!direccion) return '';
  const host = direccion
    /**
     * Solo se quita el prefijo cuando de verdad HAY dobles diagonales.
     *
     * La primera version decia `^[a-zA-Z]*:?\/*` y era demasiado glotona:
     * con `abc.supabase.co` —sin nada adelante— se comia el `abc` y dejaba
     * `.supabase.co`. Una prueba lo cacho antes de salir.
     */
    .replace(/^([a-zA-Z]*:)?\/\/+/, '')
    .replace(/\/+$/, '');
  return host ? `https://${host}` : '';
}

const URL = enderezar(limpiar(import.meta.env['VITE_SUPABASE_URL']));
const LLAVE = limpiar(import.meta.env['VITE_SUPABASE_ANON_KEY']);

/**
 * ¿Esta configurada la conexion?
 *
 * Se pregunta en vez de reventar al arrancar: asi la aplicacion puede decir
 * "falta configurar la conexion, mira CONFIGURAR-CONEXION.md" en vez de una
 * pantalla en blanco con un error en la consola que nadie va a abrir.
 */
export const HAY_CONEXION = Boolean(URL && LLAVE);

let cliente: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!HAY_CONEXION) {
    throw new Error(
      'Falta la conexion con Supabase. Crea el archivo .env con VITE_SUPABASE_URL y ' +
        'VITE_SUPABASE_ANON_KEY — los pasos estan en CONFIGURAR-CONEXION.md.',
    );
  }
  cliente ??= createClient(URL, LLAVE, {
    auth: {
      // La sesion sobrevive a cerrar la pestaña, y se renueva sola. Sin esto
      // la persona tiene que volver a entrar cada vez que abre el sistema.
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cliente;
}

/**
 * EL UNICO PUNTO DONDE EL CLIENTE DE VERDAD SE ENCHUFA A LA BASE.
 *
 * La base declara `ClienteSupabase`: la forma minima de lo que usa, sin
 * instalar `supabase-js`. Eso es lo que le permite tener cero dependencias y
 * servir a dos productos con versiones distintas de la biblioteca.
 *
 * El cliente autentico cumple esa forma, pero su tipo lleva encima seis
 * parametros genericos y capas de inferencia sobre el esquema de tablas.
 * TypeScript se rinde al compararlos y avisa "type instantiation is
 * excessively deep" — no porque sea incompatible, sino porque el trabajo de
 * comprobarlo no cabe.
 *
 * Por eso el ajuste se hace AQUI, en una sola linea, con su explicacion. La
 * alternativa —una conversion suelta en cada lugar que reciba el cliente— es
 * la misma inseguridad repartida en veinte archivos donde nadie la revisa.
 */
export function clienteParaLaBase(): ClienteSupabase {
  return supabase() as unknown as ClienteSupabase;
}
