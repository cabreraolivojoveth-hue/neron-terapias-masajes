/**
 * LO QUE ES DE LA CUENTA DE CADA QUIEN, Y NO DEL CENTRO.
 *
 * Son las tres cosas que el diseño pone en los accesos rapidos del costado: mi
 * perfil, cambiar mi contraseña y la ayuda. Van juntas porque comparten algo
 * que las separa de todo lo demas de Configuracion: NO PIDEN NINGUN PERMISO.
 * Quien no administra nada tiene que poder cambiarse el nombre y la contraseña
 * igual que la dueña.
 *
 * EL NOMBRE VIVE EN `membresia` Y NO EN LA CUENTA. Es lo que sale en la
 * bitacora, en el corte de caja y al lado de cada cita: es quien eres EN ESTE
 * CENTRO. La misma persona puede llamarse distinto en dos centros, y el nombre
 * de la cuenta de Supabase no tiene por que aparecer en ningun lado.
 *
 * LA CONTRASEÑA LA CAMBIA EL PROVEEDOR DE IDENTIDAD, no nosotros. Aqui no se
 * guarda ni se compara ninguna: se le pide a Supabase Auth que la cambie. Una
 * contraseña que pasa por nuestro codigo es una contraseña que podemos
 * registrar por accidente en un `console.log`.
 */

import { Boton, Campo } from '@neron/base/ui';
import { useState } from 'react';
import { supabase } from '../supabase.js';
import { Modal } from '../ui/modal.js';

/** El mínimo que exige Supabase Auth por omisión. Menos, ni se intenta. */
export const LARGO_MINIMO_DE_CONTRASENA = 8;

/** Qué le falta a la contraseña nueva. Vacío = se puede intentar. */
export function loQueFaltaDeLaContrasena(nueva: string, repetida: string): string {
  if (nueva.length < LARGO_MINIMO_DE_CONTRASENA) {
    return `La contraseña tiene que tener al menos ${LARGO_MINIMO_DE_CONTRASENA} caracteres.`;
  }
  if (nueva !== repetida) return 'Las dos no coinciden.';
  return '';
}

/* ------------------------------------------------------------------ */
/* Mi perfil                                                           */
/* ------------------------------------------------------------------ */

export interface PropiedadesDeMiPerfil {
  readonly abierto: boolean;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: string;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(nombre: string): void;
  onCerrar(): void;
}

export function MiPerfil({
  abierto,
  nombre,
  correo,
  rol,
  trabajando,
  error,
  onGuardar,
  onCerrar,
}: PropiedadesDeMiPerfil) {
  const [escrito, setEscrito] = useState(nombre);
  const [fallo, setFallo] = useState<string | null>(null);

  if (!abierto) return null;

  return (
    <Modal
      abierto={abierto}
      titulo="Mi perfil"
      bloqueado={trabajando}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton tono="contorno" onClick={onCerrar}>
            Cerrar
          </Boton>
          <Boton
            tono="principal"
            trabajando={trabajando}
            onClick={() => {
              if (escrito.trim() === '') {
                setFallo('Escribe cómo te llamas.');
                return;
              }
              setFallo(null);
              onGuardar(escrito);
            }}
          >
            Guardar
          </Boton>
        </>
      }
    >
      <div className="cfg-forma">
        <Campo
          etiqueta="Cómo te llamas"
          value={escrito}
          onChange={(e) => setEscrito(e.target.value)}
          obligatorio
          maxLength={80}
          ayuda="Es el nombre que sale en la bitácora, en el corte de caja y al lado de cada cita."
          {...(fallo ? { error: fallo } : {})}
        />
        {/*
          EL CORREO Y EL ROL SE ENSEÑAN Y NO SE EDITAN, y se dice por qué: el
          correo es la llave con la que se entra —cambiarlo aquí dejaría la
          cuenta sin poder entrar— y el rol lo reparte quien administra.
        */}
        <dl className="pz-datos">
          <div className="pz-dato pz-dato--renglon">
            <dt className="tt-etiqueta">Correo</dt>
            <dd className="pz-dato__valor">{correo}</dd>
          </div>
          <div className="pz-dato pz-dato--renglon">
            <dt className="tt-etiqueta">Rol</dt>
            <dd className="pz-dato__valor">{rol}</dd>
          </div>
        </dl>
        <p className="tt-secundario">
          El correo es con lo que entras: no se cambia desde aquí. El rol lo reparte quien
          administra el equipo.
        </p>
        {error ? (
          <p className="pz-error__que" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Cambiar la contraseña                                               */
/* ------------------------------------------------------------------ */

export interface PropiedadesDeLaContrasena {
  readonly abierto: boolean;
  onCerrar(): void;
}

export function CambiarContrasena({ abierto, onCerrar }: PropiedadesDeLaContrasena) {
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState(false);

  if (!abierto) return null;

  async function cambiar(): Promise<void> {
    const problema = loQueFaltaDeLaContrasena(nueva, repetida);
    if (problema !== '') {
      setError(problema);
      return;
    }
    setTrabajando(true);
    setError(null);
    try {
      const { error: fallo } = await supabase().auth.updateUser({ password: nueva });
      if (fallo) throw new Error(fallo.message);
      setNueva('');
      setRepetida('');
      setLista(true);
    } catch (f) {
      setError((f as Error).message || 'No se pudo cambiar la contraseña.');
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Cambiar contraseña"
      bloqueado={trabajando}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton tono="contorno" onClick={onCerrar}>
            {lista ? 'Cerrar' : 'Cancelar'}
          </Boton>
          {lista ? null : (
            <Boton tono="principal" trabajando={trabajando} onClick={() => void cambiar()}>
              Cambiarla
            </Boton>
          )}
        </>
      }
    >
      <div className="cfg-forma">
        {lista ? (
          <p className="cfg-factor__puesta">
            Listo: la próxima vez que entres será con la contraseña nueva.
          </p>
        ) : (
          <>
            <Campo
              etiqueta="Contraseña nueva"
              type="password"
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              obligatorio
            />
            <Campo
              etiqueta="Escríbela otra vez"
              type="password"
              autoComplete="new-password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              obligatorio
            />
            {/* SE PIDE DOS VECES Y NO SE ENSEÑA. Una contraseña mal tecleada en
                un campo oculto deja fuera a quien la escribió, y el arreglo es
                un correo de recuperación que quizá no llegue. */}
            <p className="tt-secundario">
              La cambia el proveedor de identidad, no este sistema: aquí no se guarda ninguna
              contraseña. Si además quieres echar a quien esté dentro en otra computadora, eso se
              hace desde Seguridad.
            </p>
            {error ? (
              <p className="pz-error__que" role="alert">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Ayuda y soporte                                                     */
/* ------------------------------------------------------------------ */

/**
 * LOS TRES ACCESOS DE AYUDA DEL DISEÑO, EN UN SOLO SITIO.
 *
 * La captura pone "Centro de ayuda", "Soporte técnico" y "Novedades del
 * sistema" como si fueran tres destinos distintos. No lo son: los tres llevan a
 * la misma persona —quien instaló y mantiene el sistema— así que se abren en el
 * mismo panel, cada uno en su apartado.
 *
 * SE MANTIENEN LOS TRES NOMBRES porque es donde la gente los va a buscar. Lo
 * que NO se hace es inventarles un teléfono, un correo de soporte o una lista
 * de novedades: una dirección que nadie contesta es peor que no ponerla — quien
 * la use se queda esperando el día que de verdad tiene un problema.
 */
export type ApartadoDeAyuda = 'ayuda' | 'soporte' | 'novedades';

export const APARTADOS_DE_AYUDA: readonly {
  readonly clave: ApartadoDeAyuda;
  readonly etiqueta: string;
}[] = [
  { clave: 'ayuda', etiqueta: 'Centro de ayuda' },
  { clave: 'soporte', etiqueta: 'Soporte técnico' },
  { clave: 'novedades', etiqueta: 'Novedades del sistema' },
];

export interface PropiedadesDeLaAyuda {
  readonly abierto: boolean;
  /** Con cuál de los tres se abre. Los tres botones del costado llevan aquí. */
  readonly apartado: ApartadoDeAyuda;
  readonly version: string;
  readonly centro: string;
  /** Se llama al pedir el historial completo de cambios del centro. */
  onVerBitacora(): void;
  onCerrar(): void;
}

export function AyudaYSoporte({
  abierto,
  apartado,
  version,
  centro,
  onVerBitacora,
  onCerrar,
}: PropiedadesDeLaAyuda) {
  const [cual, setCual] = useState<ApartadoDeAyuda>(apartado);

  if (!abierto) return null;

  return (
    <Modal
      abierto={abierto}
      titulo="Ayuda y soporte"
      onCerrar={onCerrar}
      pie={
        <Boton tono="contorno" onClick={onCerrar}>
          Cerrar
        </Boton>
      }
    >
      <div className="cfg-forma">
        <div className="pz-segmentos" role="group" aria-label="Apartados de ayuda">
          {APARTADOS_DE_AYUDA.map((a) => (
            <button
              key={a.clave}
              type="button"
              className={`pz-segmento${cual === a.clave ? ' pz-segmento--puesto' : ''}`}
              aria-pressed={cual === a.clave}
              onClick={() => setCual(a.clave)}
            >
              {a.etiqueta}
            </button>
          ))}
        </div>

        {cual === 'ayuda' ? (
          <>
            <p className="tt-secundario">
              Cada pantalla del sistema explica lo suyo donde hace falta: por qué una cita fuera de
              horario solo avisa, por qué la caja no se puede corregir, o qué desbloquea cada
              permiso. No hay un manual aparte que se quede viejo.
            </p>
            <p className="tt-secundario">
              Si algo no se entiende en la pantalla donde está, eso es un fallo de la pantalla —
              vale la pena contarlo.
            </p>
          </>
        ) : null}

        {cual === 'soporte' ? (
          <>
            {/*
              NI UN TELEFONO NI UN CORREO INVENTADO. Ver la explicación de arriba.
            */}
            <p className="tt-secundario">
              Este sistema lo mantiene quien te lo instaló. No hay una línea de soporte a la que
              llamar: escríbele a esa persona.
            </p>
            <p className="tt-secundario">
              Cuando algo falle, lo que más ayuda es decir <strong>qué pantalla</strong>, qué botón
              se apretó y qué salió — y estos dos datos:
            </p>
            <dl className="pz-datos">
              <div className="pz-dato pz-dato--renglon">
                <dt className="tt-etiqueta">Versión del sistema</dt>
                <dd className="pz-dato__valor">v{version}</dd>
              </div>
              <div className="pz-dato pz-dato--renglon">
                <dt className="tt-etiqueta">Centro</dt>
                <dd className="pz-dato__valor">{centro}</dd>
              </div>
            </dl>
          </>
        ) : null}

        {cual === 'novedades' ? (
          <>
            <p className="tt-secundario">
              Este centro corre la versión <strong>v{version}</strong>. No hay una lista de
              novedades publicada: sería un texto escrito a mano que se queda viejo en la primera
              publicación que nadie recuerde actualizar.
            </p>
            {/*
              LO QUE SI ES VERDAD Y SI SIRVE: lo que cambió EN ESTE CENTRO. La
              bitácora lo tiene anotado solo, con quién y cuándo.
            */}
            <p className="tt-secundario">
              Lo que sí se puede mirar es qué cambió en tu centro: quién tocó qué y cuándo, anotado
              solo por el sistema.
            </p>
            <Boton tono="contorno" onClick={onVerBitacora}>
              Ver la bitácora del centro
            </Boton>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Las sesiones                                                        */
/* ------------------------------------------------------------------ */

/**
 * CERRAR SESION EN TODAS LAS COMPUTADORAS.
 *
 * LO QUE NO SE PUEDE, Y SE DICE: enseñar la lista de dispositivos con su
 * navegador, su ubicación y su última actividad. El proveedor de identidad no
 * le entrega esa lista al navegador —solo el servidor puede pedirla— y este
 * producto no tiene servidor propio. Pintar una tabla de sesiones inventada
 * sería exactamente la clase de mentira que hace dudar de todo lo demás.
 *
 * LO QUE SI SE PUEDE, Y ES LO QUE DE VERDAD HACE FALTA el día que se pierde un
 * teléfono: cerrar TODAS las sesiones de golpe, incluida la de aquí.
 */
export function SesionesActivas() {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerrarTodas(): Promise<void> {
    setTrabajando(true);
    setError(null);
    try {
      const { error: fallo } = await supabase().auth.signOut({ scope: 'global' });
      if (fallo) throw new Error(fallo.message);
      // No hace falta navegar: al cerrar la sesión, el portero se entera por su
      // suscripción y la aplicación entera vuelve a la pantalla de entrar.
    } catch (f) {
      setError((f as Error).message || 'No se pudieron cerrar las sesiones.');
      setTrabajando(false);
    }
  }

  return (
    <div className="cfg-forma">
      <p className="tt-secundario">
        <strong>No se puede enseñar la lista de dispositivos conectados.</strong> Esa lista solo se
        la entrega el proveedor de identidad a un servidor, y este sistema no tiene uno propio:
        pintar aquí una tabla de sesiones sería inventarla.
      </p>
      <p className="tt-secundario">
        Lo que sí se puede es lo que de verdad hace falta el día que se pierde un teléfono: cerrar
        todas las sesiones de golpe. Incluye esta, así que vas a tener que volver a entrar.
      </p>
      {error ? (
        <p className="pz-error__que" role="alert">
          {error}
        </p>
      ) : null}
      <Boton tono="peligro" trabajando={trabajando} onClick={() => void cerrarTodas()}>
        Cerrar sesión en todas las computadoras
      </Boton>
    </div>
  );
}
