/**
 * CREAR UNA CUENTA Y EL CENTRO QUE VIENE CON ELLA.
 *
 * Antes de esta pantalla el sistema tenia una puerta y ninguna llave: se pedia
 * correo y contraseña, y la unica forma de tener una era que alguien de ADENTRO
 * te invitara. Para entrar al primer centro hacia falta estar ya en un centro.
 *
 * SON DOS PASOS Y NO UNO, aunque se vean como un solo formulario:
 *
 *   1. la CUENTA la crea Supabase (`signUp`), y la contraseña se le entrega
 *      directo, igual que al entrar: el sistema nunca la ve;
 *   2. el CENTRO lo crea la base (`crear_mi_centro`), ya con sesion, porque la
 *      membresia solo puede nacer de una llamada que sepa quien esta hablando.
 *
 * EL SEGUNDO PASO PUEDE QUEDAR PARA DESPUES, Y HAY QUE CONTAR CON ELLO. Si el
 * proyecto de Supabase pide confirmar el correo, `signUp` NO devuelve sesion:
 * la cuenta existe y el centro todavia no. Por eso `CrearMiCentro` es un
 * componente aparte y se pinta TAMBIEN en la pantalla de "tu cuenta todavía no
 * está en ningún centro" — que es justo donde cae esa persona al volver.
 *
 * Es la misma leccion del segundo factor: una pantalla que solo existe del lado
 * de adentro no le sirve a quien se quedo afuera.
 */

import { Boton, Campo } from '@neron/base/ui';
import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase.js';
import { crearMiCentro } from '../datos/alta-de-centro.js';
import { LEMA_POR_OMISION, NOMBRE_POR_OMISION } from '../datos/configuracion.js';
import { Hoja } from '../marco/hoja.js';

/**
 * El minimo de la contraseña.
 *
 * Ocho, que es el que trae Supabase de fabrica. Se comprueba TAMBIEN aqui para
 * poder decirlo en español antes de mandar nada: el servidor contesta "Password
 * should be at least 6 characters" y ni el idioma ni el numero coinciden con lo
 * que la persona acaba de leer debajo del campo.
 */
const MINIMO_DE_CONTRASENA = 8;

/* ------------------------------------------------------------------ */
/* El centro, para quien ya entro y todavia no tiene ninguno           */
/* ------------------------------------------------------------------ */

/**
 * Pide los dos nombres y crea el centro.
 *
 * NO PIDE EL CORREO NI EL ROL, y eso no es por brevedad: los dos los saca la
 * base del token. El rol siempre es dueño, porque un centro cuyo primer miembro
 * no pudiera invitar naceria sin nadie que diera de alta al segundo.
 *
 * Al terminar RECARGA en vez de refrescar la sesion a mano. Es lo mismo que
 * hace "ya me invitaron", y por el mismo motivo: la membresia nueva cambia el
 * negocio, los roles y los permisos de golpe, y arrancar limpio es mas seguro
 * que ir avisando pieza por pieza.
 */
export function CrearMiCentro() {
  const [centro, setCentro] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (trabajando) return;
    setError(null);
    setTrabajando(true);
    try {
      await crearMiCentro(centro, nombre);
      window.location.reload();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : 'No se pudo crear el centro.');
      // El `finally` no sirve aqui: cuando sale bien, la pagina ya se esta
      // recargando y tocar el estado despues solo produce un aviso de React.
      setTrabajando(false);
    }
  }

  return (
    <form className="terapias-entrar__grupo" onSubmit={enviar} noValidate>
      <Campo
        etiqueta="Nombre del centro"
        ayuda="Es el que va a ver tu equipo y el que sale en los reportes. Se puede cambiar después."
        autoComplete="organization"
        maxLength={80}
        value={centro}
        onChange={(e) => setCentro(e.target.value)}
        required
      />
      <Campo
        etiqueta="Tu nombre"
        ayuda="Firma cada movimiento en la bitácora del centro."
        autoComplete="name"
        maxLength={80}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
      />

      {error ? (
        <p className="terapias-entrar__error" role="alert">
          {error}
        </p>
      ) : null}

      <Boton type="submit" tono="principal" trabajando={trabajando} completo>
        Crear mi centro
      </Boton>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* La pantalla completa: cuenta nueva desde cero                       */
/* ------------------------------------------------------------------ */

export function CrearCuenta({ onVolver }: { readonly onVolver: () => void }) {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [repetida, setRepetida] = useState('');
  const [centro, setCentro] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (enviando) return;
    setError(null);

    /**
     * Las dos comprobaciones que se hacen ANTES de llamar a nadie.
     *
     * Una contraseña mal repetida que se descubre despues de crear la cuenta ya
     * no tiene arreglo desde esta pantalla: la cuenta existe con la contraseña
     * equivocada y la persona no sabe cual escribio.
     */
    if (contrasena !== repetida) {
      setError('Las dos contraseñas no son iguales.');
      return;
    }
    if (contrasena.length < MINIMO_DE_CONTRASENA) {
      setError(`La contraseña necesita al menos ${MINIMO_DE_CONTRASENA} caracteres.`);
      return;
    }
    if (centro.trim() === '' || nombre.trim() === '') {
      setError('Falta el nombre del centro o el tuyo.');
      return;
    }

    setEnviando(true);
    try {
      const { data, error: fallo } = await supabase().auth.signUp({
        email: correo.trim(),
        password: contrasena,
      });
      if (fallo) {
        setError(fallo.message);
        setEnviando(false);
        return;
      }

      /**
       * SIN SESION, LA CUENTA EXISTE Y EL CENTRO NO.
       *
       * Pasa cuando el proyecto pide confirmar el correo, y tambien cuando ese
       * correo YA tenia cuenta —Supabase contesta igual a proposito, para no
       * confirmarle a nadie que direcciones estan registradas—. En los dos
       * casos lo honesto es decir "revisa tu correo" y no fingir que ya quedo.
       *
       * No se pierde nada: al volver y entrar, la aplicacion la manda a la
       * pantalla de "todavía no estás en ningún centro", que trae este mismo
       * formulario.
       */
      if (!data.session) {
        setConfirmar(true);
        setEnviando(false);
        return;
      }

      await crearMiCentro(centro, nombre);
      window.location.reload();
    } catch (falla) {
      setError(
        falla instanceof Error
          ? falla.message
          : 'No se pudo conectar. Revisa tu internet e intenta de nuevo.',
      );
      /**
       * SE LIBERA EN CADA SALIDA Y NO EN UN `finally`, que es lo que uno
       * escribe por costumbre.
       *
       * El `finally` correria TAMBIEN despues del camino bueno —justo despues
       * de pedir la recarga—, y la recarga no es instantanea: el boton se
       * volveria a encender durante ese instante y un segundo clic llamaria a
       * `signUp` otra vez con la cuenta ya creada. Es la misma razon por la que
       * `CrearMiCentro`, diez lineas mas arriba, tampoco lo usa.
       *
       * Lo que el `finally` protegia —que un error no deje el formulario
       * trabado para siempre— lo cubre esta linea y las de los `return` de
       * arriba, que son todas las salidas que no recargan.
       */
      setEnviando(false);
    }
  }

  return (
    <main className="terapias-entrar">
      <form className="terapias-entrar__caja" onSubmit={enviar} noValidate>
        <div className="terapias-entrar__marca">
          <Hoja pequena />
          <div>
            <h1 className="terapias-entrar__titulo">Crear tu centro</h1>
            <p className="terapias-entrar__lema">
              {NOMBRE_POR_OMISION} · {LEMA_POR_OMISION}
            </p>
          </div>
        </div>

        {confirmar ? (
          <>
            <p className="terapias-entrar__aviso" role="status">
              Te mandamos un correo a <strong>{correo.trim()}</strong>. Ábrelo para confirmar tu
              cuenta y vuelve a entrar aquí: te vamos a pedir el nombre del centro para terminar.
            </p>
            {/* `type="button"` NO SOBRA: dentro de un <form>, un boton sin tipo
                es de envio, y este mandaria el formulario otra vez en vez de
                volver. */}
            <Boton type="button" tono="contorno" completo onClick={onVolver}>
              Volver a entrar
            </Boton>
          </>
        ) : (
          <>
            <Campo
              etiqueta="Nombre del centro"
              ayuda="Es el que va a ver tu equipo. Se puede cambiar después."
              autoComplete="organization"
              maxLength={80}
              value={centro}
              onChange={(e) => setCentro(e.target.value)}
              required
            />
            <Campo
              etiqueta="Tu nombre"
              ayuda="Firma cada movimiento en la bitácora del centro."
              autoComplete="name"
              maxLength={80}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
            <Campo
              etiqueta="Correo"
              type="email"
              autoComplete="username"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              required
            />
            <Campo
              etiqueta="Contraseña"
              type="password"
              ayuda={`Al menos ${MINIMO_DE_CONTRASENA} caracteres.`}
              autoComplete="new-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              required
            />
            <Campo
              etiqueta="Repite la contraseña"
              type="password"
              autoComplete="new-password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              required
            />

            {/* El error se ANUNCIA, no solo se pinta de rojo: quien usa lector
                de pantalla tiene que enterarse de que fallo algo. */}
            {error ? (
              <p className="terapias-entrar__error" role="alert">
                {error}
              </p>
            ) : null}

            <Boton type="submit" tono="principal" trabajando={enviando} completo>
              Crear cuenta
            </Boton>
            <p className="terapias-entrar__pie">
              ¿Ya tienes cuenta?{' '}
              <Boton type="button" tono="tenue" onClick={onVolver}>
                Entrar
              </Boton>
            </p>
          </>
        )}
      </form>
    </main>
  );
}
