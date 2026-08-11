/**
 * LA SESION DE LA VITRINA.
 *
 * Sustituye al portero de identidad para que la pantalla se pueda ver sin
 * tener que entrar de verdad. Los permisos van todos en `true` a proposito:
 * asi la foto enseña la pantalla COMPLETA, con todos los botones, que es lo
 * que hay que comparar contra el diseño.
 */

import type { ReactNode } from 'react';

const ACCESO = {
  negocioId: 't_vitrina',
  usuarioId: '00000000-0000-4000-8000-000000000001',
  correo: 'vitrina@ejemplo.mx',
  nombre: 'Quien administra',
  rol: 'dueno',
  rolEtiqueta: 'Administradora',
  permisos: {
    gestionarClientes: true, gestionarAgenda: true, gestionarCatalogo: true,
    gestionarInventario: true, cobrar: true, verFinanzas: true, verExpediente: true,
    verCostos: true, gestionarUsuarios: true, gestionarConfiguracion: true,
    verAuditoria: true, exportarDatos: true,
  } as Readonly<Record<string, boolean>>,
  modulos: [] as readonly string[],
  esDueno: true,
};

export function useSesion() {
  return {
    estado: 'listo' as const,
    acceso: ACCESO,
    llave: 'vitrina',
    fallo: null,
    cerrarSesion: async () => {},
    refrescar: async () => {},
  };
}

export function useTardaDemasiado(): boolean {
  return false;
}

export function ProveedorDeSesion({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
