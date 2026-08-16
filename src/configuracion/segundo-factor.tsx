/**
 * LA VERIFICACION EN DOS PASOS — la deuda mas vieja del producto, pagada.
 *
 * QUE PASABA HASTA HOY, y esta escrito en `guardias/fronteras.ts` para que no
 * se olvidara: la base exige segundo factor a dueño y administrador —hace bien,
 * son las cuentas que mueven usuarios, permisos e historial— pero Terapias no
 * tenia ninguna pantalla donde darlo de alta. El dueño entro con su correo y su
 * contraseña, la conexion funciono, y el sistema le contesto "falta el segundo
 * paso": un paso que no existia forma de completar. Quedo encerrado afuera de
 * su propio centro, con el sistema ya publicado.
 *
 * El atajo fue `segundoFactorApagado: true` en `src/identidad/sesion.tsx`, con
 * una guardia atada a que existiera `src/configuracion/` para que la razon no
 * se olvidara y el atajo se quedara. Esta pantalla es lo que permite quitarlo.
 *
 * SE PINTA EN DOS SITIOS, Y LOS DOS HACEN FALTA:
 *
 *   1. Dentro de Configuracion → Seguridad, para darlo de alta con calma.
 *   2. En la pantalla de "falta el segundo paso" de `aplicacion.tsx`.
 *
 * El segundo es el que de verdad cierra el agujero. Sin el, quitar el apagado
 * habria repetido el fallo exacto: quien todavia no tiene segundo factor NO
 * PUEDE ENTRAR, asi que jamas llegaria a la pantalla de Configuracion donde
 * darlo de alta. La pantalla de alta tiene que vivir del lado de afuera.
 *
 * DOS CAMINOS, Y SE DISTINGUEN SOLOS:
 *
 *   · Sin ningun factor dado de alta → se da de alta: se enseña el codigo QR,
 *     se escanea con la aplicacion de autenticacion y se confirma con los seis
 *     digitos. Al confirmar, la sesion sube a "aal2" y ya se entra.
 *   · Con un factor ya dado de alta pero sin haberlo usado en ESTA sesion →
 *     solo se piden los seis digitos.
 *
 * NO SE GUARDA NADA EN NUESTRA BASE. El secreto vive en Supabase Auth, que es
 * quien verifica. Un segundo factor guardado al lado de los datos que protege
 * no protege de nada.
 */

import { Boton } from '@neron/base/ui';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase.js';
import { Icono } from '../ui/iconos.js';

/** En que punto del alta estamos. */
type Paso = 'cargando' | 'sin-factor' | 'dando-de-alta' | 'pide-codigo' | 'listo';

interface FactorEnAlta {
  readonly id: string;
  /** La imagen del QR, tal como la manda el proveedor. */
  readonly qr: string;
  /** El mismo secreto escrito, para quien no puede escanear. */
  readonly secreto: string;
}

/** Los seis digitos, sin nada mas. Pegarlos con espacios es lo normal. */
export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, 6);
}

export interface PropiedadesDelSegundoFactor {
  /**
   * `true` cuando esto es lo unico que se puede hacer: la persona no ha
   * entrado y el sistema le esta pidiendo el segundo paso. Cambia el tono de
   * los textos, no el mecanismo.
   */
  readonly bloqueando?: boolean;
  /** Se llama cuando la sesión ya pasó el segundo paso. */
  onListo?(): void;
}

export function SegundoFactor({ bloqueando = false, onListo }: PropiedadesDelSegundoFactor) {
  const [paso, setPaso] = useState<Paso>('cargando');
  const [factor, setFactor] = useState<FactorEnAlta | null>(null);
  const [factorId, setFactorId] = useState<string>('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  /** `true` cuando ESTA sesión ya pasó el segundo paso. */
  const [verificada, setVerificada] = useState(false);

  /**
   * Que hay ya dado de alta, y si esta sesion ya lo uso.
   *
   * SON DOS PREGUNTAS DISTINTAS y confundirlas es el error facil: tener el
   * segundo factor puesto no es lo mismo que haberlo usado hoy. La primera
   * decide si hay que enseñar el QR; la segunda, si hay que pedir el codigo.
   */
  const mirar = useCallback(async (): Promise<void> => {
    try {
      const bd = supabase();
      const [factores, nivel] = await Promise.all([
        bd.auth.mfa.listFactors(),
        bd.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (factores.error) throw new Error(factores.error.message);

      const puestos = (factores.data?.totp ?? []).filter((f) => f.status === 'verified');
      const yaPaso = nivel.data?.currentLevel === 'aal2';
      setVerificada(yaPaso);

      if (puestos.length === 0) {
        setPaso('sin-factor');
        return;
      }
      setFactorId(puestos[0]!.id);
      setPaso(yaPaso ? 'listo' : 'pide-codigo');
    } catch (fallo) {
      setError((fallo as Error).message || 'No se pudo consultar la verificación en dos pasos.');
      setPaso('sin-factor');
    }
  }, []);

  useEffect(() => {
    void mirar();
  }, [mirar]);

  async function darDeAlta(): Promise<void> {
    setTrabajando(true);
    setError(null);
    try {
      const bd = supabase();
      /*
       * SE LIMPIA LO QUE QUEDO A MEDIAS ANTES DE EMPEZAR.
       *
       * Un alta que se abandona —se cierra la pestaña con el QR en pantalla—
       * deja un factor en estado "sin verificar" que ocupa el nombre. El
       * siguiente intento falla con un error de nombre repetido que no dice
       * absolutamente nada de la causa, y quien lo ve solo sabe que no puede
       * entrar.
       */
      const previos = await bd.auth.mfa.listFactors();
      for (const f of previos.data?.totp ?? []) {
        if (f.status !== 'verified') await bd.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error: fallo } = await bd.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Neron Terapias',
      });
      if (fallo) throw new Error(fallo.message);
      if (!data) throw new Error('El proveedor no devolvió el código para dar de alta.');

      setFactor({
        id: data.id,
        qr: data.totp?.qr_code ?? '',
        secreto: data.totp?.secret ?? '',
      });
      setFactorId(data.id);
      setCodigo('');
      setPaso('dando-de-alta');
    } catch (f) {
      setError((f as Error).message || 'No se pudo empezar el alta.');
    } finally {
      setTrabajando(false);
    }
  }

  async function confirmar(): Promise<void> {
    const limpio = soloDigitos(codigo);
    if (limpio.length !== 6) {
      setError('El código son seis dígitos.');
      return;
    }
    setTrabajando(true);
    setError(null);
    try {
      const { error: fallo } = await supabase().auth.mfa.challengeAndVerify({
        factorId,
        code: limpio,
      });
      if (fallo) throw new Error(fallo.message);
      setFactor(null);
      setCodigo('');
      setVerificada(true);
      setPaso('listo');
      /*
       * Se avisa hacia arriba, pero la pantalla NO depende de eso: al verificar,
       * la sesion cambia y el portero se entera solo por su suscripcion. El
       * aviso sirve para cerrar el dialogo, no para dejar entrar a nadie.
       */
      onListo?.();
    } catch (f) {
      setError(
        (f as Error).message ||
          'Ese código no coincide. Fíjate en que el reloj del teléfono esté en hora.',
      );
    } finally {
      setTrabajando(false);
    }
  }

  async function quitar(): Promise<void> {
    setTrabajando(true);
    setError(null);
    try {
      const { error: fallo } = await supabase().auth.mfa.unenroll({ factorId });
      if (fallo) throw new Error(fallo.message);
      setFactorId('');
      setPaso('sin-factor');
      setVerificada(false);
    } catch (f) {
      setError((f as Error).message || 'No se pudo quitar la verificación.');
    } finally {
      setTrabajando(false);
    }
  }

  if (paso === 'cargando') {
    return (
      <div className="pz-cargando" aria-busy="true">
        <span className="neron-solo-lectores">Consultando la verificación en dos pasos</span>
        <div className="pz-silueta" />
      </div>
    );
  }

  return (
    <div className="cfg-factor">
      {paso === 'sin-factor' ? (
        <>
          <p className="tt-secundario">
            {bloqueando
              ? 'Tu cuenta administra usuarios, permisos e historial, así que el sistema pide un ' +
                'segundo paso además de la contraseña. Se da de alta aquí mismo, una sola vez.'
              : 'Además de tu contraseña, para entrar hará falta un código que cambia cada treinta ' +
                'segundos. La base lo exige a quien es dueño o administrador.'}
          </p>
          <p className="tt-secundario">
            Necesitas una aplicación de autenticación en el teléfono —Google Authenticator, Authy,
            1Password o la que ya uses—. El código sale de ahí y no viaja por correo ni por mensaje.
          </p>
          {error ? (
            <p className="pz-error__que" role="alert">
              {error}
            </p>
          ) : null}
          <Boton tono="principal" trabajando={trabajando} onClick={() => void darDeAlta()}>
            Activar la verificación en dos pasos
          </Boton>
        </>
      ) : null}

      {paso === 'dando-de-alta' && factor ? (
        <>
          <p className="tt-secundario">
            Escanea este código con tu aplicación de autenticación y escribe los seis dígitos que te
            enseñe.
          </p>
          {factor.qr ? (
            <img
              className="cfg-factor__qr"
              src={factor.qr}
              alt="Código QR para la aplicación de autenticación"
            />
          ) : null}
          {/*
            EL SECRETO ESCRITO NO SOBRA. Quien entra desde el mismo telefono no
            puede escanear la pantalla en la que esta, y sin esto se queda sin
            forma de dar de alta nada.
          */}
          {factor.secreto ? (
            <p className="cfg-factor__secreto">
              <span className="tt-etiqueta">O escríbelo a mano</span>
              <code>{factor.secreto}</code>
            </p>
          ) : null}
          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Los seis dígitos</span>
            <input
              className="cfg-campo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(soloDigitos(e.target.value))}
            />
          </label>
          {error ? (
            <p className="pz-error__que" role="alert">
              {error}
            </p>
          ) : null}
          <div className="pz-ficha__pie">
            <Boton
              tono="contorno"
              onClick={() => {
                setFactor(null);
                setPaso('sin-factor');
              }}
            >
              Cancelar
            </Boton>
            <Boton tono="principal" trabajando={trabajando} onClick={() => void confirmar()}>
              Confirmar
            </Boton>
          </div>
        </>
      ) : null}

      {paso === 'pide-codigo' ? (
        <>
          <p className="tt-secundario">
            Ya tienes la verificación en dos pasos activada. Escribe los seis dígitos de tu
            aplicación de autenticación para terminar de entrar.
          </p>
          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Los seis dígitos</span>
            <input
              className="cfg-campo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(soloDigitos(e.target.value))}
            />
          </label>
          {error ? (
            <p className="pz-error__que" role="alert">
              {error}
            </p>
          ) : null}
          <Boton tono="principal" trabajando={trabajando} onClick={() => void confirmar()}>
            Entrar
          </Boton>
        </>
      ) : null}

      {paso === 'listo' ? (
        <>
          <p className="cfg-factor__puesta">
            <span className="cfg-factor__palomita" aria-hidden="true">
              <Icono nombre="palomita" lado={18} />
            </span>
            La verificación en dos pasos está activada{verificada ? ' y ya la usaste en esta sesión' : ''}.
          </p>
          <p className="tt-secundario">
            Si cambias de teléfono, quítala aquí antes y vuelve a darla de alta en el nuevo. Quitarla
            sin tener el otro listo deja la cuenta pidiendo un código que ya nadie puede generar.
          </p>
          {error ? (
            <p className="pz-error__que" role="alert">
              {error}
            </p>
          ) : null}
          <Boton tono="contorno" trabajando={trabajando} onClick={() => void quitar()}>
            Quitar la verificación en dos pasos
          </Boton>
        </>
      ) : null}
    </div>
  );
}
