/**
 * La capa de consultas: pedir datos una vez, compartirlos, y refrescarlos
 * cuando algo cambia.
 *
 * POR QUE ESTA ESCRITA A MANO Y NO SE INSTALO UNA BIBLIOTECA.
 *
 * Lo que hace falta cabe en doscientas lineas: guardar lo pedido, no volver a
 * pedirlo si ya esta, y avisar a todas las pantallas cuando algo cambia. Una
 * biblioteca de consultas trae medio megabyte, su propio ciclo de
 * actualizaciones de seguridad, y un modelo mental que hay que aprender para
 * mantener el sistema seis años. La regla del producto: cada dependencia
 * nueva se paga todos los meses.
 *
 * LO QUE RESUELVE, que es la parte que se rompe si se hace a ojo:
 *
 *  · Dos pantallas que piden lo mismo hacen UN viaje, no dos.
 *  · Al crear una cita, la agenda Y el tablero se enteran solos. Sin esto hay
 *    que apretar F5, y el sistema se siente muerto.
 *  · Mientras carga NO se muestra un cero: se muestra que esta cargando. La
 *    diferencia entre "no hay citas" y "todavia no se" es la diferencia entre
 *    una agenda vacia y una agenda que miente.
 *  · Si falla la red, lo que ya se veia SE QUEDA. Vaciar la pantalla al
 *    perder conexion hace creer que se borraron los datos.
 *
 * EL ERROR QUE LO CASI TUMBA, y lo cacho una prueba:
 * la primera version guardaba un objeto por llave y lo MODIFICABA en su
 * sitio. `useSyncExternalStore` compara la instantanea por identidad: como el
 * objeto era siempre el mismo, React no veia ningun cambio y la pantalla se
 * quedaba en "cargando" para siempre. Ahora cada cambio produce un objeto
 * NUEVO — que es lo que ese enganche exige y casi nadie documenta.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export type EstadoDeConsulta = 'cargando' | 'listo' | 'error';

export interface Resultado<T> {
  readonly datos: T | null;
  readonly estado: EstadoDeConsulta;
  readonly error: string | null;
  recargar(): void;
}

/** Lo que ven las pantallas. INMUTABLE: cada cambio crea uno nuevo. */
interface Instantanea {
  readonly datos: unknown;
  readonly estado: EstadoDeConsulta;
  readonly error: string | null;
}

/** Lo que no se pinta: cuantos la usan y si hay un viaje en curso. */
interface Control {
  usos: number;
  enVuelo: Promise<void> | null;
}

const VACIA: Instantanea = { datos: null, estado: 'cargando', error: null };

const almacen = new Map<string, Instantanea>();
const controles = new Map<string, Control>();
const oyentes = new Map<string, Set<() => void>>();

function control(llave: string): Control {
  let c = controles.get(llave);
  if (!c) { c = { usos: 0, enVuelo: null }; controles.set(llave, c); }
  return c;
}

function poner(llave: string, cambio: Partial<Instantanea>): void {
  const antes = almacen.get(llave) ?? VACIA;
  almacen.set(llave, { ...antes, ...cambio });
  for (const o of oyentes.get(llave) ?? []) o();
}

async function traer(llave: string, pedir: () => Promise<unknown>): Promise<void> {
  const c = control(llave);
  // Si ya hay un viaje en curso para esta llave, se espera ese. Sin esto,
  // tres componentes que piden lo mismo al montar hacen tres peticiones.
  if (c.enVuelo) return c.enVuelo;

  c.enVuelo = (async () => {
    try {
      const datos = await pedir();
      poner(llave, { datos, estado: 'listo', error: null });
    } catch (fallo) {
      // Se conservan los datos viejos: solo cambia el estado y el mensaje.
      poner(llave, { estado: 'error', error: (fallo as Error).message || 'No se pudo cargar.' });
    } finally {
      c.enVuelo = null;
    }
  })();

  return c.enVuelo;
}

/**
 * Tira lo guardado y hace que se vuelva a pedir.
 *
 * Se le pasa un PREFIJO: `invalidar('citas')` refresca todas las vistas de
 * agenda —dia, semana, mes, con y sin filtros— sin tener que acordarse de
 * cada llave. Es lo que hace que crear una cita actualice la pantalla sola.
 */
export function invalidar(prefijo: string): void {
  for (const llave of [...almacen.keys()]) {
    if (!llave.startsWith(prefijo)) continue;
    if ((controles.get(llave)?.usos ?? 0) === 0) {
      // Nadie la esta mirando: se tira. Si alguien vuelve, se pide de nuevo.
      // Guardar para siempre lo que nadie usa es una fuga de memoria lenta.
      almacen.delete(llave);
      controles.delete(llave);
      continue;
    }
    poner(llave, { estado: 'cargando' });
  }
}

/** Olvida TODO. Al cambiar de cuenta, los datos del centro anterior no se mezclan. */
export function olvidarTodo(): void {
  const llaves = [...almacen.keys()];
  almacen.clear();
  controles.clear();
  for (const llave of llaves) for (const o of oyentes.get(llave) ?? []) o();
}

export function useConsulta<T>(llave: string | null, pedir: () => Promise<T>): Resultado<T> {
  // La funcion va en una referencia: definirla en linea la cambia en cada
  // render, y si fuera dependencia dispararia un viaje nuevo cada vez.
  const pedirRef = useRef(pedir);
  pedirRef.current = pedir;

  const suscribir = useCallback(
    (avisarme: () => void) => {
      if (!llave) return () => {};
      let set = oyentes.get(llave);
      if (!set) { set = new Set(); oyentes.set(llave, set); }
      set.add(avisarme);
      control(llave).usos += 1;
      return () => {
        set.delete(avisarme);
        const c = controles.get(llave);
        if (c) c.usos = Math.max(0, c.usos - 1);
      };
    },
    [llave],
  );

  const leer = useCallback(
    (): Instantanea => (llave ? (almacen.get(llave) ?? VACIA) : LISTA_VACIA),
    [llave],
  );

  const instantanea = useSyncExternalStore(suscribir, leer, leer);

  useEffect(() => {
    if (!llave) return;
    if (instantanea.estado === 'cargando' && !control(llave).enVuelo) {
      void traer(llave, () => pedirRef.current());
    }
  }, [llave, instantanea.estado]);

  const recargar = useCallback(() => {
    if (llave) poner(llave, { estado: 'cargando' });
  }, [llave]);

  return {
    datos: (instantanea.datos as T | null) ?? null,
    estado: instantanea.estado,
    error: instantanea.error,
    recargar,
  };
}

/** Sin llave no hay nada que pedir, y eso NO es "cargando": es que no aplica. */
const LISTA_VACIA: Instantanea = { datos: null, estado: 'listo', error: null };

/**
 * Una operacion que cambia datos.
 *
 * Devuelve `trabajando` para bloquear el boton mientras corre —es lo que
 * impide la doble cita por doble clic— y llama a `invalidar` sola al terminar
 * bien, para que nadie tenga que acordarse.
 */
export function useOperacion<A extends unknown[], R>(
  correr: (...args: A) => Promise<R>,
  aInvalidar: readonly string[] = [],
): {
  ejecutar(...args: A): Promise<R | null>;
  readonly trabajando: boolean;
  readonly error: string | null;
  limpiarError(): void;
} {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si la pantalla se cierra a media operacion, no se toca su estado: React
  // avisa con un error feo y ademas seria escribir en algo que ya no existe.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const correrRef = useRef(correr);
  correrRef.current = correr;
  const invalidarRef = useRef(aInvalidar);
  invalidarRef.current = aInvalidar;

  const ejecutar = useCallback(async (...args: A): Promise<R | null> => {
    setTrabajando(true);
    setError(null);
    try {
      const r = await correrRef.current(...args);
      for (const p of invalidarRef.current) invalidar(p);
      return r;
    } catch (fallo) {
      // El error se guarda para mostrarlo. Un fallo silencioso al guardar es
      // lo peor que puede pasar: la persona cree que quedo y se entera
      // cuando llega el paciente.
      if (vivo.current) setError((fallo as Error).message || 'No se pudo guardar.');
      return null;
    } finally {
      // El `finally` libera el boton pase lo que pase. Sin el, un error deja
      // el formulario trabado y la unica salida es recargar la pagina.
      if (vivo.current) setTrabajando(false);
    }
  }, []);

  const limpiarError = useCallback(() => setError(null), []);

  return { ejecutar, trabajando, error, limpiarError };
}
