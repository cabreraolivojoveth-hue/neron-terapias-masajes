/**
 * La pantalla de entrada.
 *
 * NO ESCRIBE LA CONTRASEÑA EN NINGUN LADO NUESTRO: se la entrega directo a
 * Supabase, que la verifica y devuelve un token. El sistema nunca la ve, ni
 * la guarda, ni la registra en la bitacora.
 */

import { Boton, Campo } from '@neron/base/ui';
import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase.js';
import { LEMA_POR_OMISION, NOMBRE_POR_OMISION } from '../datos/configuracion.js';
import { Hoja } from '../marco/hoja.js';
import { CrearCuenta } from './crear-cuenta.js';

export function Entrar() {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /**
   * LAS DOS PANTALLAS SON UNA SOLA, y no es por ahorrar un archivo.
   *
   * Aqui todavia no hay sesion, asi que tampoco hay navegacion —el
   * `ProveedorDeNavegacion` vive del lado de adentro—. Mandar la direccion a
   * `?crear` obligaria a montar rutas antes de entrar solo para esto, y una
   * direccion que se puede compartir a media alta es una invitacion a recargar
   * en el peor momento. Con un interruptor local, volver es volver.
   */
  const [creando, setCreando] = useState(false);

  if (creando) return <CrearCuenta onVolver={() => setCreando(false)} />;

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const { error: fallo } = await supabase().auth.signInWithPassword({
        email: correo.trim(),
        password: contrasena,
      });
      /**
       * El mensaje es el MISMO se equivoque en el correo o en la contraseña.
       *
       * Decir "ese correo no existe" le confirma a quien prueba cuentas cuales
       * si existen, y eso es la mitad del trabajo de entrar por la fuerza.
       */
      if (fallo) setError('El correo o la contraseña no coinciden.');
    } catch {
      setError('No se pudo conectar. Revisa tu internet e intenta de nuevo.');
    } finally {
      // El `finally` libera el boton pase lo que pase. Sin el, un error deja
      // el formulario trabado y la unica salida es recargar la pagina.
      setEnviando(false);
    }
  }

  return (
    <main className="terapias-entrar">
      <form className="terapias-entrar__caja" onSubmit={enviar} noValidate>
        <div className="terapias-entrar__marca">
          <Hoja pequena />
          <div>
            <h1 className="terapias-entrar__titulo">{NOMBRE_POR_OMISION}</h1>
            <p className="terapias-entrar__lema">{LEMA_POR_OMISION}</p>
          </div>
        </div>

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
          autoComplete="current-password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          required
        />

        {/* El error se ANUNCIA, no solo se pinta de rojo: quien usa lector de
            pantalla tiene que enterarse de que fallo algo. */}
        {error ? (
          <p className="terapias-entrar__error" role="alert">
            {error}
          </p>
        ) : null}

        <Boton type="submit" tono="principal" trabajando={enviando} completo>
          Entrar
        </Boton>

        {/*
          LA SALIDA PARA QUIEN TODAVIA NO TIENE NADA.
          Sin este renglon, la unica forma de tener una cuenta era que alguien
          de adentro invitara — y para entrar al primer centro habria que estar
          ya en un centro.
        */}
        <p className="terapias-entrar__pie">
          ¿Es tu primera vez?{' '}
          <Boton type="button" tono="tenue" onClick={() => setCreando(true)}>
            Crear una cuenta
          </Boton>
        </p>
      </form>
    </main>
  );
}
