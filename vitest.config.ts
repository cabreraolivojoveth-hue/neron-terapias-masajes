/**
 * Configuracion de las pruebas.
 *
 * El entorno se declara ARCHIVO POR ARCHIVO, con un comentario arriba de cada
 * prueba de componentes. Se hizo asi a proposito: la opcion global que hacia
 * lo mismo cambio de nombre entre versiones de la herramienta y se rompio en
 * silencio —las pruebas fallaban con "document is not defined"—, mientras que
 * el comentario funciona igual en todas.
 *
 * La regla de fondo: casi todo el sistema es logica pura y NO necesita un
 * navegador. Solo lo paga quien de verdad lo necesita.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
  },
});
