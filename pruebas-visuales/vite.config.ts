/**
 * La vitrina: la aplicacion de verdad con el servidor y la sesion cambiados.
 *
 * Los alias son lo unico que cambia. Todo lo demas —componentes, estilos,
 * marco— es exactamente lo que se publica, que es el punto: si aqui se ve
 * mal, en produccion se ve mal.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');

export default defineConfig({
  root: raiz,
  plugins: [react()],
  server: { port: 5199 },
  resolve: {
    alias: [
      { find: /^(.*)\/src\/supabase\.js$/, replacement: resolve(raiz, 'pruebas-visuales/servidor-de-mentiras.ts') },
      { find: /^(.*)\/identidad\/sesion\.js$/, replacement: resolve(raiz, 'pruebas-visuales/sesion-de-mentiras.tsx') },
      { find: /^\.\.\/supabase\.js$/, replacement: resolve(raiz, 'pruebas-visuales/servidor-de-mentiras.ts') },
      { find: /^\.\/supabase\.js$/, replacement: resolve(raiz, 'pruebas-visuales/servidor-de-mentiras.ts') },
    ],
  },
});
