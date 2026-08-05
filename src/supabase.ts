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

const URL = import.meta.env['VITE_SUPABASE_URL'];
const LLAVE = import.meta.env['VITE_SUPABASE_ANON_KEY'];

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
  cliente ??= createClient(URL as string, LLAVE as string, {
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
