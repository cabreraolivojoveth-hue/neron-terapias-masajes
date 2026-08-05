/**
 * La sesion, enchufada a React.
 *
 * Toda la logica —los cinco estados, la mezcla de roles, las tres capas de
 * permiso— vive en el portero de `@neron/base/identidad` y ya esta probada
 * sin navegador. Aqui solo queda el enganche: suscribirse a sus cambios y
 * repartirlos por el arbol.
 */

import {
  crearPortero,
  crearProveedorSupabase,
  crearDirectorioSupabase,
  type Portero,
} from '@neron/base/identidad';
import type { Acceso, EstadoDelPortero } from '@neron/base/contratos';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { clienteParaLaBase } from '../supabase.js';

export interface Sesion {
  readonly estado: EstadoDelPortero;
  readonly acceso: Acceso | null;
  /**
   * Cambia cuando cambia la CUENTA.
   *
   * Se usa como `key` del arbol de datos: al entrar con otra cuenta, todo se
   * destruye y se vuelve a montar limpio. Sin eso quedan restos del negocio
   * anterior en memoria — la peor clase de fuga, porque los numeros se
   * mezclan y nadie sospecha de la pantalla.
   */
  readonly llave: string;
  cerrarSesion(): Promise<void>;
  refrescar(): Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

export function ProveedorDeSesion({ children }: { readonly children: ReactNode }) {
  // El portero se crea UNA VEZ. Recrearlo en cada render abriria una sesion
  // nueva por pulsacion de tecla en cualquier formulario de arriba.
  const portero = useMemo<Portero>(() => {
    const cliente = clienteParaLaBase();
    return crearPortero({
      proveedor: crearProveedorSupabase(cliente),
      directorio: crearDirectorioSupabase(cliente),
      alFallar: (error, que) => {
        console.error(`[sesion] ${que}: ${error.message}`);
      },
    });
  }, []);

  useEffect(() => {
    void portero.iniciar();
    return () => portero.detener();
  }, [portero]);

  // `useSyncExternalStore` es lo correcto para un almacen de afuera: React se
  // entera del cambio sin que haya que copiar el estado a un useState y
  // mantener las dos copias sincronizadas.
  const estado = useSyncExternalStore(
    (avisar) => portero.suscribir(avisar),
    () => portero.estado(),
    () => 'cargando' as EstadoDelPortero,
  );

  const acceso = useSyncExternalStore(
    (avisar) => portero.suscribir(avisar),
    () => portero.acceso(),
    () => null,
  );

  const llave = useSyncExternalStore(
    (avisar) => portero.suscribir(avisar),
    () => portero.llaveDeReinicio(),
    () => 'inicial',
  );

  const valor = useMemo<Sesion>(
    () => ({
      estado,
      acceso,
      llave,
      cerrarSesion: () => portero.cerrarSesion(),
      refrescar: () => portero.refrescar(),
    }),
    [estado, acceso, llave, portero],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const valor = useContext(Contexto);
  if (!valor) {
    throw new Error(
      'useSesion se uso fuera del ProveedorDeSesion. Envuelve la aplicacion con ' +
        '<ProveedorDeSesion>, que normalmente va hasta arriba de todo.',
    );
  }
  return valor;
}

/**
 * Los permisos de quien esta dentro. Vacio si todavia no hay sesion.
 *
 * DEVUELVE VACIO, NO TODO. Si el dato se pierde o llega a medias, la persona
 * cae al minimo de permisos, jamas al maximo. Es la misma regla que aplica la
 * base de datos, y por el mismo motivo.
 */
export function usePermisos(): Readonly<Record<string, boolean>> {
  const { acceso } = useSesion();
  return acceso?.permisos ?? {};
}

/** Un interruptor sencillo para pintar u ocultar algo. */
export function usePuede(capacidad: string): boolean {
  return usePermisos()[capacidad] === true;
}

export function useEstadoDeCarga(): boolean {
  const [tardando, setTardando] = useState(false);
  const { estado } = useSesion();
  useEffect(() => {
    if (estado !== 'cargando') { setTardando(false); return; }
    // Solo se avisa que va lento despues de un rato. Poner "cargando..." de
    // inmediato hace que una carga de 200 ms se sienta lenta.
    const t = setTimeout(() => setTardando(true), 1200);
    return () => clearTimeout(t);
  }, [estado]);
  return tardando;
}
