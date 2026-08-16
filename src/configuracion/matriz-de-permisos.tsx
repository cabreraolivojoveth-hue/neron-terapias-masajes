/**
 * LA MATRIZ DE ROL x CAPACIDAD, y que desbloquea cada una.
 *
 * SE ENSEÑA LO QUE DE VERDAD CONSULTA LA BASE, que no es lo mismo que lo que
 * pinta el menu. `app.tiene_permiso` busca el rol en la tabla `rol` de ESTE
 * centro: un rol de fabrica que no este guardado ahi le devuelve falso a todo,
 * por muy bien que el navegador lo mezcle para dibujar el menu. Enseñar aqui
 * los de fabrica seria enseñar permisos que el servidor no aplica — y el
 * sintoma de esa mentira es el peor de todos: un boton que se ve, se aprieta, y
 * falla con un error de permisos.
 *
 * EL ROL `dueno` SALE PERO NO SE EDITA. Se guarda con la lista de permisos
 * VACIA a proposito: es la proteccion anti-bloqueo, y `app.tiene_permiso`
 * devuelve true en cuanto lo ve, sin mirar nada mas. Escribirle permisos
 * —aunque fueran todos encendidos— haria que el dia que alguien apague uno por
 * error, la dueña se quede sin poder entrar a su propio centro. La base se
 * niega a guardarlo; aqui se dice por que.
 *
 * CADA CAPACIDAD LLEVA ESCRITO QUE DESBLOQUEA. Una matriz de dieciseis palabras
 * tecnicas contra cinco columnas no la entiende nadie: "verExpediente" no
 * significa nada hasta que dice "leer las notas clinicas de un paciente".
 */

import { Boton, Campo } from '@neron/base/ui';
import { Fragment, useState } from 'react';
import {
  CAPACIDADES_DE_PLATAFORMA,
  QUE_DESBLOQUEA,
  type RolDelCentro,
} from '../datos/configuracion.js';
import { CAPACIDADES_DE_TERAPIAS } from '../modulos/registro.js';
import { Icono } from '../ui/iconos.js';

/** El rol que no se edita nunca. La razón está en la cabecera del archivo. */
export const ROL_INTOCABLE = 'dueno';

export const FAMILIAS: readonly {
  readonly titulo: string;
  readonly porque: string;
  readonly capacidades: readonly string[];
}[] = [
  {
    titulo: 'El centro',
    porque: 'Administrar el sistema: quién entra, cómo está configurado y qué se hizo.',
    capacidades: [...CAPACIDADES_DE_PLATAFORMA],
  },
  {
    titulo: 'El trabajo del día',
    porque: 'Lo que hace falta para atender, cobrar y llevar las cuentas.',
    capacidades: [...CAPACIDADES_DE_TERAPIAS],
  },
];

/**
 * ¿Este rol tiene esta capacidad?
 *
 * El dueño SIEMPRE la tiene aunque su lista esté vacía: es lo mismo que
 * contesta `app.tiene_permiso`, y si aquí se dijera otra cosa la pantalla y el
 * servidor discreparían sobre el único rol que no puede quedarse fuera.
 */
export function tienePermiso(rol: RolDelCentro, capacidad: string): boolean {
  if (rol.id === ROL_INTOCABLE) return true;
  return rol.permisos[capacidad] === true;
}

export interface PropiedadesDeLaMatriz {
  readonly roles: readonly RolDelCentro[];
  readonly cargando: boolean;
  readonly puedeEditar: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(
    id: string,
    etiqueta: string,
    permisos: Readonly<Record<string, boolean>>,
    activo: boolean,
  ): void;
  onReintentar(): void;
}

export function MatrizDePermisos({
  roles,
  cargando,
  puedeEditar,
  trabajando,
  error,
  onGuardar,
  onReintentar,
}: PropiedadesDeLaMatriz) {
  const [nuevo, setNuevo] = useState(false);
  const [etiqueta, setEtiqueta] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);

  if (cargando) {
    return (
      <div className="pz-cargando" aria-busy="true">
        <span className="neron-solo-lectores">Cargando los roles</span>
        <div className="pz-silueta" />
      </div>
    );
  }

  function alternar(rol: RolDelCentro, capacidad: string, puesta: boolean): void {
    if (rol.id === ROL_INTOCABLE) return;
    onGuardar(rol.id, rol.etiqueta, { ...rol.permisos, [capacidad]: puesta }, rol.activo);
  }

  function crear(): void {
    const limpio = etiqueta.trim();
    if (limpio === '') {
      setFallo('Escribe cómo se va a llamar el rol.');
      return;
    }
    /*
     * EL ID SALE DE LA ETIQUETA Y LO NORMALIZA LA BASE. El motor de permisos
     * compara textos opacos: "Recepción" y "recepcion" serían dos roles
     * distintos, y quien los mirara vería el mismo nombre dos veces.
     */
    setFallo(null);
    onGuardar(limpio, limpio, {}, true);
    setEtiqueta('');
    setNuevo(false);
  }

  return (
    <div className="cfg-permisos">
      <p className="tt-secundario">
        Estos son los roles que consulta la base de datos de este centro. Un rol que no esté aquí no
        concede nada, aunque su nombre suene conocido.
      </p>

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No se pudieron cargar los roles.</p>
          <p className="pz-error__detalle">{error}</p>
          <Boton tono="contorno" onClick={onReintentar}>
            Reintentar
          </Boton>
        </div>
      ) : null}

      <div className="pz-tabla__marco">
        <table className="pz-tabla cfg-matriz">
          <thead>
            <tr>
              <th scope="col">Qué desbloquea</th>
              {roles.map((r) => (
                <th key={r.id} scope="col">
                  <span className="cfg-matriz__rol">{r.etiqueta}</span>
                  <span className="cfg-matriz__cuantos">
                    {r.cuantos === 0
                      ? 'Nadie'
                      : r.cuantos === 1
                        ? '1 persona'
                        : `${r.cuantos} personas`}
                  </span>
                  {r.id === ROL_INTOCABLE ? (
                    <span className="cfg-matriz__fijo">Puede todo · no se edita</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FAMILIAS.map((f) => (
              /* La llave va en el Fragment y no en el primer `tr`: dos hermanos
                 sin envoltorio con llave hacen que React repinte el grupo
                 entero al cambiar cualquier casilla. */
              <Fragment key={f.titulo}>
                <tr className="cfg-matriz__familia">
                  <th scope="rowgroup" colSpan={roles.length + 1}>
                    {f.titulo}
                    <span className="cfg-matriz__porque">{f.porque}</span>
                  </th>
                </tr>
                {f.capacidades.map((c) => (
                  <tr key={c}>
                    <th scope="row">
                      <span className="cfg-matriz__que">{QUE_DESBLOQUEA[c] ?? c}</span>
                      <span className="cfg-matriz__clave">{c}</span>
                    </th>
                    {roles.map((r) => {
                      const puesta = tienePermiso(r, c);
                      const fijo = r.id === ROL_INTOCABLE || !puedeEditar;
                      return (
                        <td key={r.id}>
                          <label className="cfg-casilla cfg-casilla--sola">
                            <span className="neron-solo-lectores">
                              {r.etiqueta}: {QUE_DESBLOQUEA[c] ?? c}
                            </span>
                            <input
                              type="checkbox"
                              checked={puesta}
                              disabled={fijo || trabajando}
                              onChange={(e) => alternar(r, c, e.target.checked)}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {puedeEditar ? (
        nuevo ? (
          <section className="pz-tarjeta">
            <Campo
              etiqueta="Cómo se llama el rol"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              obligatorio
              maxLength={40}
              ayuda="Nace sin ningún permiso: se encienden uno por uno en la tabla de arriba."
              {...(fallo ? { error: fallo } : {})}
            />
            <div className="pz-ficha__pie">
              <Boton tono="contorno" onClick={() => setNuevo(false)}>
                Cancelar
              </Boton>
              <Boton tono="principal" trabajando={trabajando} onClick={crear}>
                Crear el rol
              </Boton>
            </div>
          </section>
        ) : (
          <button type="button" className="pz-boton" onClick={() => setNuevo(true)}>
            <Icono nombre="mas" lado={16} /> Crear un rol
          </button>
        )
      ) : (
        <p className="tt-secundario">
          Para cambiar los permisos hace falta administrar usuarios. Lo que ves es lo que aplica hoy
          la base de datos.
        </p>
      )}
    </div>
  );
}
