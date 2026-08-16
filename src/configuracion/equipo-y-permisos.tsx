/**
 * QUIEN ENTRA AL CENTRO Y CON QUE ROL.
 *
 * LA PROTECCION ANTI-BLOQUEO NO SE TOCA, y no se comprueba aqui: se comprueba
 * en la base. Estas tres reglas las aplican `cambiar_rol_en_el_centro` y
 * `cambiar_acceso_en_el_centro` antes de escribir nada:
 *
 *   · nadie se cambia el rol ni se quita el acceso a si mismo,
 *   · el centro no se queda sin ningun dueño activo,
 *   · solo quien ya es dueño puede nombrar a otro dueño.
 *
 * Aqui se APAGAN los botones que van a fallar y se dice por que. Eso es
 * cortesia —evita el intento y el error feo—, pero si alguien mandara la
 * peticion a mano la base la rechazaria igual. Las dos capas hacen falta: sin
 * la de abajo no hay seguridad, y sin la de arriba la pantalla ofrece cosas que
 * no se pueden hacer.
 *
 * INVITAR NO CREA LA CUENTA, y la pantalla lo dice con esas palabras. La cuenta
 * la crea el proveedor de identidad; aqui queda la invitacion pendiente y la
 * persona la reclama al entrar por primera vez con ese correo. Fingir que el
 * correo salio disparado seria la peor clase de mentira: se da por avisado a
 * alguien que nunca supo nada.
 */

import { Boton, Campo, Confirmacion } from '@neron/base/ui';
import { useState } from 'react';
import {
  loQueFaltaDeLaInvitacion,
  type EquipoDelCentro,
  type InvitacionPendiente,
  type MiembroDelCentro,
  type RolDelCentro,
} from '../datos/configuracion.js';
import { Icono } from '../ui/iconos.js';
import { MenuDeAcciones } from '../ui/menu.js';

/**
 * Por que NO se puede tocar a esta persona. Vacío = sí se puede.
 *
 * DEVUELVE LA RAZON Y NO UN `false`. Un botón apagado sin explicación hace que
 * quien lo mira crea que el sistema está roto; con la razón al lado, entiende
 * que es la protección y sabe qué hacer antes.
 */
export function porQueNoSePuede(m: MiembroDelCentro, duenosActivos: number): string {
  if (m.soyYo) {
    return 'Es tu propia cuenta: nadie puede quitarse a sí mismo el acceso ni bajarse de rol.';
  }
  if (m.rol === 'dueno' && duenosActivos <= 1) {
    return 'Es el único dueño activo. Nombra a otro dueño antes de tocar a este.';
  }
  return '';
}

export interface PropiedadesDelEquipo {
  readonly equipo: EquipoDelCentro | null;
  readonly roles: readonly RolDelCentro[];
  readonly cargando: boolean;
  readonly error: string | null;
  readonly trabajando: boolean;
  readonly errorAlGuardar: string | null;
  /** Solo quien ya es dueño puede ofrecer el rol de dueño. Lo repite la base. */
  readonly soyDuena: boolean;
  onInvitar(correo: string, nombre: string, rol: string): void;
  onCambiarRol(m: MiembroDelCentro, rol: string): void;
  onCambiarAcceso(m: MiembroDelCentro, activo: boolean): void;
  onDarDeBaja(m: MiembroDelCentro): void;
  onCancelarInvitacion(i: InvitacionPendiente): void;
  onReintentar(): void;
}

export function EquipoYPermisos({
  equipo,
  roles,
  cargando,
  error,
  trabajando,
  errorAlGuardar,
  soyDuena,
  onInvitar,
  onCambiarRol,
  onCambiarAcceso,
  onDarDeBaja,
  onCancelarInvitacion,
  onReintentar,
}: PropiedadesDelEquipo) {
  const [invitando, setInvitando] = useState(false);
  const [correo, setCorreo] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState('');
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [aDarDeBaja, setADarDeBaja] = useState<MiembroDelCentro | null>(null);

  if (cargando) {
    return (
      <div className="pz-cargando" aria-busy="true">
        <span className="neron-solo-lectores">Cargando el equipo del centro</span>
        <div className="pz-silueta" />
        <div className="pz-silueta" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="pz-error" role="alert">
        <p className="pz-error__que">No se pudo cargar el equipo.</p>
        <p className="pz-error__detalle">{error}</p>
        <Boton tono="contorno" onClick={onReintentar}>
          Reintentar
        </Boton>
      </div>
    );
  }

  const miembros = equipo?.miembros ?? [];
  const invitaciones = equipo?.invitaciones ?? [];
  const duenos = equipo?.duenosActivos ?? 0;
  /* Los roles que se pueden ofrecer al invitar. El de dueño solo si quien
     invita ya lo es: con `gestionarUsuarios` a secas, quien administra podría
     meter a un cómodo suyo como dueño y quedarse con el centro. */
  const ofrecibles = roles.filter((r) => r.activo && (r.id !== 'dueno' || soyDuena));
  const falta = loQueFaltaDeLaInvitacion(correo, nombre, rol);

  function invitar(): void {
    setMostrarErrores(true);
    if (Object.keys(loQueFaltaDeLaInvitacion(correo, nombre, rol)).length > 0) return;
    onInvitar(correo, nombre, rol);
    setCorreo('');
    setNombre('');
    setRol('');
    setMostrarErrores(false);
    setInvitando(false);
  }

  return (
    <div className="cfg-equipo">
      <div className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h3 className="tt-tarjeta">Quién entra al centro</h3>
          <p className="tt-secundario">
            {miembros.filter((m) => m.activo && !m.eliminado).length} con acceso ·{' '}
            {invitaciones.length} invitación{invitaciones.length === 1 ? '' : 'es'} pendiente
            {invitaciones.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="pz-encabezado__acciones">
          <button
            type="button"
            className="pz-boton pz-boton--principal"
            onClick={() => {
              setInvitando((a) => !a);
              setMostrarErrores(false);
            }}
          >
            <Icono nombre="personaMas" lado={16} /> Invitar a alguien
          </button>
        </div>
      </div>

      {invitando ? (
        <section className="pz-tarjeta cfg-invitar">
          <h4 className="tt-tarjeta">Invitar a alguien</h4>
          {/*
            SE DICE LO QUE DE VERDAD PASA. Esto NO manda un correo ni crea la
            cuenta: deja la invitación esperando. Quien lea "invitación enviada"
            va a dar por avisada a una persona que no sabe nada.
          */}
          <p className="tt-secundario">
            Esto deja la invitación esperando; no manda ningún correo ni crea la cuenta. La persona
            tiene que tener cuenta con ese mismo correo: al entrar, su invitación se aplica sola.
          </p>
          <div className="pz-dos">
            <Campo
              etiqueta="Correo"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              obligatorio
              {...(mostrarErrores && falta['correo'] ? { error: falta['correo'] } : {})}
            />
            <Campo
              etiqueta="Cómo se llama"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              obligatorio
              {...(mostrarErrores && falta['nombre'] ? { error: falta['nombre'] } : {})}
            />
          </div>
          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Qué va a poder hacer</span>
            <select value={rol} onChange={(e) => setRol(e.target.value)}>
              <option value="">Escoge un rol</option>
              {ofrecibles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </label>
          {mostrarErrores && falta['rol'] ? (
            <p className="pz-error__que" role="alert">
              {falta['rol']}
            </p>
          ) : null}
          {errorAlGuardar ? (
            <p className="pz-error__que" role="alert">
              {errorAlGuardar}
            </p>
          ) : null}
          <div className="pz-ficha__pie">
            <Boton tono="contorno" onClick={() => setInvitando(false)}>
              Cancelar
            </Boton>
            <Boton tono="principal" trabajando={trabajando} onClick={invitar}>
              Dejar la invitación
            </Boton>
          </div>
        </section>
      ) : null}

      {invitaciones.length > 0 ? (
        <section className="pz-tarjeta">
          <h4 className="tt-tarjeta">Invitaciones pendientes</h4>
          <ul className="pz-lista">
            {invitaciones.map((i) => (
              <li key={i.id} className="pz-renglon pz-renglon--quieto">
                <span className="pz-renglon__cuerpo">
                  <span className="pz-renglon__titulo">{i.nombre}</span>
                  <span className="pz-renglon__pie">
                    {i.correo} · {i.rolEtiqueta}
                  </span>
                </span>
                <button
                  type="button"
                  className="pz-boton"
                  onClick={() => onCancelarInvitacion(i)}
                >
                  <Icono nombre="prohibido" lado={14} /> Cancelar
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="pz-tarjeta">
        <h4 className="tt-tarjeta">El equipo</h4>
        {miembros.length === 0 ? (
          <p className="pz-vacio__texto">Todavía no hay nadie más en el centro.</p>
        ) : (
          <ul className="pz-lista">
            {miembros.map((m) => {
              const trabado = porQueNoSePuede(m, duenos);
              const dadoDeBaja = m.eliminado;
              return (
                <li
                  key={m.id}
                  className={`pz-renglon pz-renglon--quieto${dadoDeBaja ? ' cfg-miembro--baja' : ''}`}
                >
                  <span className="pz-inicial" aria-hidden="true">
                    {m.nombre.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="pz-renglon__cuerpo">
                    <span className="pz-renglon__titulo">
                      {m.nombre}
                      {m.soyYo ? <span className="pz-pastilla pz-pastilla--marca">Tú</span> : null}
                      {dadoDeBaja ? (
                        <span className="pz-pastilla pz-pastilla--inactivo">Dado de baja</span>
                      ) : !m.activo ? (
                        <span className="pz-pastilla pz-pastilla--inactivo">Sin acceso</span>
                      ) : null}
                    </span>
                    <span className="pz-renglon__pie">{m.correo}</span>
                    {trabado ? <span className="pz-renglon__pie">{trabado}</span> : null}
                  </span>

                  <label className="pz-campo pz-campo--corto">
                    <span className="neron-solo-lectores">Rol de {m.nombre}</span>
                    <select
                      value={m.rol}
                      disabled={trabado !== '' || dadoDeBaja}
                      onChange={(e) => onCambiarRol(m, e.target.value)}
                    >
                      {/* El rol actual SIEMPRE aparece, aunque ya no se ofrezca:
                          sin esto, quien tiene un rol apagado sale con el
                          selector marcando otro y parece que se le cambió. */}
                      {ofrecibles.some((r) => r.id === m.rol) ? null : (
                        <option value={m.rol}>{m.rolEtiqueta}</option>
                      )}
                      {ofrecibles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.etiqueta}
                        </option>
                      ))}
                    </select>
                  </label>

                  {dadoDeBaja ? null : (
                    <MenuDeAcciones
                      de={m.nombre}
                      opciones={[
                        m.activo
                          ? { clave: 'quitar', etiqueta: 'Quitarle el acceso', icono: 'prohibido' }
                          : { clave: 'devolver', etiqueta: 'Devolverle el acceso', icono: 'palomita' },
                        { clave: 'baja', etiqueta: 'Dar de baja', icono: 'archivar', peligro: true },
                      ]}
                      onEscoger={(clave) => {
                        if (trabado !== '') return;
                        if (clave === 'quitar') onCambiarAcceso(m, false);
                        else if (clave === 'devolver') onCambiarAcceso(m, true);
                        else if (clave === 'baja') setADarDeBaja(m);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {errorAlGuardar && !invitando ? (
          <p className="pz-error__que" role="alert">
            {errorAlGuardar}
          </p>
        ) : null}
      </section>

      <Confirmacion
        abierto={aDarDeBaja !== null}
        titulo="¿Dar de baja a esta persona?"
        confirmar="Dar de baja"
        destructivo
        trabajando={trabajando}
        onConfirmar={() => {
          if (aDarDeBaja) onDarDeBaja(aDarDeBaja);
          setADarDeBaja(null);
        }}
        onCancelar={() => setADarDeBaja(null)}
      >
        <p className="pz-dato__valor">
          <strong>{aDarDeBaja?.nombre}</strong>
        </p>
        {/* NO SE BORRA, Y SE DICE. Sus ventas, sus movimientos de caja y su
            rastro en la bitácora tienen que seguir teniendo un nombre: un
            renglón menos convierte media historia del centro en "usuario
            desconocido". */}
        <p className="tt-secundario">
          Pierde el acceso, pero su renglón se queda: sus ventas, sus cortes de caja y lo que hizo
          en la bitácora siguen teniendo un nombre. No se borra nada.
        </p>
      </Confirmacion>
    </div>
  );
}
