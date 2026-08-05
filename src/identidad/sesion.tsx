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
  /**
   * Lo ultimo que fallo al hablar con el servidor.
   *
   * EXISTE POR UNA PANTALLA ATORADA: si la primera consulta no responde, el
   * portero se queda en 'cargando' para siempre y lo unico que se ve es la
   * silueta, sin fin. El error se guardaba solo en la consola del navegador
   * —que nadie abre— y desde afuera parecia que el sistema no arrancaba.
   */
  readonly fallo: string | null;
  cerrarSesion(): Promise<void>;
  refrescar(): Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

export function ProveedorDeSesion({ children }: { readonly children: ReactNode }) {
  // El portero se crea UNA VEZ. Recrearlo en cada render abriria una sesion
  // nueva por pulsacion de tecla en cualquier formulario de arriba.
  const [fallo, setFallo] = useState<string | null>(null);

  const portero = useMemo<Portero>(() => {
    const cliente = clienteParaLaBase();
    return crearPortero({
      proveedor: crearProveedorSupabase(cliente),
      directorio: crearDirectorioSupabase(cliente),
      /**
       * EL SEGUNDO FACTOR, APAGADO A PROPOSITO. ES DEUDA, NO AJUSTE.
       *
       * La base exige verificacion en dos pasos a dueño y administrador, y
       * hace bien: son las cuentas que mueven usuarios, permisos e historial.
       * Pero Terapias todavia no tiene la pantalla donde una persona da de
       * alta su segundo factor — eso llega con Configuracion.
       *
       * EL RESULTADO EN PRODUCCION FUE ESTE: el dueño entro con su correo y
       * contraseña, la conexion funciono, y el sistema le respondio "falta el
       * segundo paso". Un paso que no existia forma de completar. Quedo
       * encerrado afuera de su propio centro, con el sistema ya publicado.
       *
       * CUANDO SE QUITA: en cuanto Configuracion tenga la pantalla de alta del
       * segundo factor. No es opcional ni queda a criterio — hay una guardia
       * en `guardias/fronteras.ts` que revienta la publicacion en cuanto
       * aparezca `src/configuracion/`, justo para que esta linea no se quede
       * aqui para siempre.
       */
      segundoFactorApagado: true,
      alFallar: (error, que) => {
        console.error(`[sesion] ${que}: ${error.message}`);
        // Y ademas SE MUESTRA. Un error que solo vive en la consola es un
        // error que la persona nunca va a ver.
        setFallo(`${que}: ${error.message}`);
      },
    });
  }, []);

  useEffect(() => {
    portero.iniciar().catch((e: Error) => setFallo(`arrancar la sesion: ${e.message}`));
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
      fallo,
      cerrarSesion: () => portero.cerrarSesion(),
      refrescar: () => portero.refrescar(),
    }),
    [estado, acceso, llave, fallo, portero],
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

/**
 * ¿Ya lleva DEMASIADO cargando?
 *
 * Ocho segundos. Una conexion normal resuelve en menos de uno; si a los ocho
 * sigue esperando, algo esta mal —la direccion, la llave, la red— y hay que
 * decirlo. Quedarse en la silueta para siempre no es "cargando": es una
 * pantalla rota que finge que trabaja.
 */
export function useTardaDemasiado(segundos = 8): boolean {
  const [tarde, setTarde] = useState(false);
  const { estado } = useSesion();
  useEffect(() => {
    if (estado !== 'cargando') { setTarde(false); return; }
    const t = setTimeout(() => setTarde(true), segundos * 1000);
    return () => clearTimeout(t);
  }, [estado, segundos]);
  return tarde;
}
