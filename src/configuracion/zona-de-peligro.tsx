/**
 * LA ZONA DE PELIGRO — lo que no se puede deshacer.
 *
 * TIENE UNA SOLA ACCION, Y ES A PROPOSITO. En este sistema casi nada se puede
 * romper de verdad: nada se borra (§9 del bloque 0), la caja y la bitacora no
 * se pueden reescribir ni desde el servidor, y la licencia la escribe la
 * plataforma. Llenar esta seccion de botones rojos para que "se vea completa"
 * habria sido inventar peligros — y una zona de peligro llena de cosas
 * inofensivas se deja de leer, que es justo cuando la unica de verdad se
 * aprieta sin pensar.
 *
 * TRANSFERIR LA PROPIEDAD ES LA UNICA IRREVERSIBLE desde dentro: al terminar,
 * quien la aprieta ya no es dueño y no puede devolverse el centro.
 *
 * SE CONFIRMA ESCRIBIENDO EL NOMBRE DEL CENTRO. Un "¿estas seguro?" con un
 * boton se contesta que si sin leerlo; escribir el nombre obliga a mirar la
 * pantalla y a estar en el centro que se cree. Es la unica confirmacion que de
 * verdad frena un clic distraido.
 *
 * LO QUE NO ESTA AQUI Y POR QUE: no hay "eliminar el centro". La licencia y el
 * alta del negocio son del mundo B —los escribe la plataforma— y meter un
 * camino para darse de baja desde adentro seria abrir justo la puerta que la
 * base cerro. La pantalla lo dice en vez de callarlo.
 */

import { Boton, Campo } from '@neron/base/ui';
import { useState } from 'react';
import type { MiembroDelCentro } from '../datos/configuracion.js';
import { Icono } from '../ui/iconos.js';

/**
 * ¿El texto escrito confirma de verdad?
 *
 * Se comparan sin espacios de sobra y sin mayúsculas: exigir la tilde exacta y
 * la caja correcta no protege más, solo enfada a quien ya decidió.
 */
export function confirmaElNombre(escrito: string, nombre: string): boolean {
  const limpiar = (t: string): string => t.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
  return limpiar(escrito) !== '' && limpiar(escrito) === limpiar(nombre);
}

export interface PropiedadesDeLaZona {
  readonly nombreDelCentro: string;
  /** A quién se le puede dar: gente con acceso, sin contarme a mí. */
  readonly candidatos: readonly MiembroDelCentro[];
  readonly soyDuena: boolean;
  readonly puedeEntrar: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  onTransferir(membresia: string): void;
}

export function ZonaDePeligro({
  nombreDelCentro,
  candidatos,
  soyDuena,
  puedeEntrar,
  trabajando,
  error,
  onTransferir,
}: PropiedadesDeLaZona) {
  const [aQuien, setAQuien] = useState('');
  const [escrito, setEscrito] = useState('');

  if (!puedeEntrar) {
    return (
      <div className="pz-vacio pz-vacio--chico">
        <p className="pz-vacio__titulo">La zona de peligro no es para tu cuenta</p>
        <p className="pz-vacio__texto">
          Hace falta el permiso de zona de peligro. La base rechaza estas acciones aunque se pidan a
          mano.
        </p>
      </div>
    );
  }

  const listo = aQuien !== '' && confirmaElNombre(escrito, nombreDelCentro);

  return (
    <div className="cfg-peligro">
      <section className="pz-tarjeta cfg-peligro__caja">
        <h3 className="tt-tarjeta">
          <span className="cfg-peligro__icono" aria-hidden="true">
            <Icono nombre="alerta" lado={18} />
          </span>
          Transferir la propiedad del centro
        </h3>

        {!soyDuena ? (
          <p className="tt-secundario">
            Solo quien es dueño puede transferir el centro. Tienes el permiso de zona de peligro,
            pero esta acción concreta la reserva la base para el dueño actual.
          </p>
        ) : candidatos.length === 0 ? (
          <p className="tt-secundario">
            No hay a quién dársela: hace falta que otra persona tenga acceso al centro. Invítala
            primero desde Usuarios y permisos.
          </p>
        ) : (
          <>
            <p className="tt-secundario">
              La otra persona pasa a ser dueña y tú te quedas como administrador. No se puede
              deshacer desde aquí: después de esto, quien te devuelva el centro tiene que ser quien
              lo recibió.
            </p>

            <label className="pz-campo pz-campo--bloque">
              <span className="tt-etiqueta">A quién</span>
              <select value={aQuien} onChange={(e) => setAQuien(e.target.value)}>
                <option value="">Escoge a alguien del equipo</option>
                {candidatos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} · {m.correo}
                  </option>
                ))}
              </select>
            </label>

            <Campo
              etiqueta={`Escribe "${nombreDelCentro}" para confirmar`}
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              ayuda="Se escribe el nombre a propósito: un botón de confirmar se aprieta sin leerlo."
            />

            {error ? (
              <p className="pz-error__que" role="alert">
                {error}
              </p>
            ) : null}

            <div className="pz-ficha__pie">
              <Boton
                tono="peligro"
                disabled={!listo}
                trabajando={trabajando}
                onClick={() => {
                  if (listo) onTransferir(aQuien);
                }}
              >
                Transferir el centro
              </Boton>
            </div>
          </>
        )}
      </section>

      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">Lo que no se puede hacer desde aquí</h3>
        <ul className="cfg-lista-honesta">
          <li>
            <strong>Borrar el centro.</strong> El alta y la licencia las escribe la plataforma. Un
            camino para darse de baja desde dentro sería justo la puerta que la base cerró a
            propósito.
          </li>
          <li>
            <strong>Borrar pacientes, ventas o movimientos de caja.</strong> Nada se borra en este
            sistema: se archiva. Un expediente clínico borrado de verdad es un problema legal, no un
            renglón menos.
          </li>
          <li>
            <strong>Corregir la bitácora.</strong> La base le quita el permiso de modificar y borrar
            a todo el mundo, incluido el servidor. Es lo único que hace que sirva para auditar.
          </li>
        </ul>
      </section>
    </div>
  );
}
