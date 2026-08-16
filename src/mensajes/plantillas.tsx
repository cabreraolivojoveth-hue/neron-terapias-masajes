/**
 * EL ADMINISTRADOR DE PLANTILLAS.
 *
 * UNA PLANTILLA GUARDA LA PREGUNTA, NO LA RESPUESTA: el texto lleva las
 * variables escritas —`{{cliente.nombre}}`— y se rellenan al usarla, contra el
 * cliente y la cita de verdad. Guardar el texto ya rellenado sería una copia
 * del nombre de alguien que envejece sola.
 *
 * SE AVISA DE LAS VARIABLES MAL ESCRITAS AL EDITAR, no al enviar. Un
 * `{{cliente.nombe}}` no falla nunca: viaja tal cual hasta el teléfono del
 * cliente, y quien lo escribió se entera cuando le preguntan qué significa.
 *
 * NO SE CREA NI UNA PLANTILLA DE EJEMPLO. Un centro nuevo abre esto vacío y con
 * una explicación de para qué sirve. Rellenarlo con tres plantillas inventadas
 * es como se acaba mandando "Hola {{cliente.nombre}}, gracias por tu visita a
 * NOMBRE DEL NEGOCIO" a alguien de verdad.
 */

import { useState } from 'react';
import type { PlantillaDeMensaje, TipoDeCanal } from '../datos/mensajes.js';
import { COMO_SE_DICE_EL_CANAL } from '../datos/mensajes.js';
import { Modal } from '../ui/modal.js';
import { Icono } from '../ui/iconos.js';
import { MenuDeAcciones } from '../ui/menu.js';
import { VARIABLES, variablesDesconocidas } from './variables.js';

export const PLANTILLA_VACIA = {
  nombre: '',
  categoria: 'general',
  cuerpo: '',
  canalTipo: null as TipoDeCanal | null,
  activa: true,
};

export type DatosDePlantilla = typeof PLANTILLA_VACIA;

/** Lo que se busca de una plantilla: su nombre, su categoría o lo que dice. */
export function filtrarPlantillas(
  plantillas: readonly PlantillaDeMensaje[],
  busqueda: string,
): PlantillaDeMensaje[] {
  const aguja = busqueda.trim().toLowerCase();
  if (!aguja) return [...plantillas];
  return plantillas.filter((p) =>
    [p.nombre, p.categoria, p.cuerpo].join(' ').toLowerCase().includes(aguja));
}

export interface PropiedadesDePlantillas {
  readonly abierto: boolean;
  readonly plantillas: readonly PlantillaDeMensaje[];
  readonly cargando: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(id: string | null, datos: DatosDePlantilla): void;
  onBorrar(p: PlantillaDeMensaje): void;
  onCerrar(): void;
}

export function AdministrarPlantillas({
  abierto,
  plantillas,
  cargando,
  trabajando,
  error,
  onGuardar,
  onBorrar,
  onCerrar,
}: PropiedadesDePlantillas) {
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<{ id: string | null; datos: DatosDePlantilla } | null>(null);

  const visibles = filtrarPlantillas(plantillas, busqueda);
  const malEscritas = editando ? variablesDesconocidas(editando.datos.cuerpo) : [];

  return (
    <Modal abierto={abierto} titulo="Plantillas de mensaje" ancho bloqueado={trabajando} onCerrar={onCerrar}>
      {editando ? (
        <div className="pz-columna">
          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Nombre *</span>
            <input
              className="msj-campo__linea"
              autoComplete="off"
              placeholder="Cómo la vas a encontrar"
              value={editando.datos.nombre}
              onChange={(e) =>
                setEditando((x) => (x ? { ...x, datos: { ...x.datos, nombre: e.target.value } } : x))}
            />
          </label>

          <div className="pz-dos">
            <label className="pz-campo pz-campo--bloque">
              <span className="tt-etiqueta">Categoría</span>
              <input
                className="msj-campo__linea"
                autoComplete="off"
                placeholder="general, citas, cobros…"
                value={editando.datos.categoria}
                onChange={(e) =>
                  setEditando((x) => (x ? { ...x, datos: { ...x.datos, categoria: e.target.value } } : x))}
              />
            </label>
            <label className="pz-campo pz-campo--bloque">
              <span className="tt-etiqueta">Canal</span>
              <select
                value={editando.datos.canalTipo ?? ''}
                onChange={(e) =>
                  setEditando((x) => (x
                    ? { ...x, datos: { ...x.datos, canalTipo: (e.target.value || null) as TipoDeCanal | null } }
                    : x))}
              >
                <option value="">Cualquiera</option>
                {(['whatsapp', 'sms', 'correo', 'manual'] as const).map((t) => (
                  <option key={t} value={t}>{COMO_SE_DICE_EL_CANAL[t]}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Texto *</span>
            <textarea
              className="msj-campo__texto msj-campo__texto--alto"
              rows={5}
              placeholder="Hola {{cliente.nombre}}, te esperamos el {{cita.fecha}} a las {{cita.hora}}."
              value={editando.datos.cuerpo}
              onChange={(e) =>
                setEditando((x) => (x ? { ...x, datos: { ...x.datos, cuerpo: e.target.value } } : x))}
            />
          </label>

          {/* Las variables se TOCAN para meterlas. Escribirlas a mano es como
              nacen los `{{cliente.nombe}}` que nunca fallan y nunca se rellenan. */}
          <div className="msj-variables">
            <span className="tt-etiqueta">Toca una para insertarla</span>
            <div className="msj-variables__lista">
              {VARIABLES.map((v) => (
                <button
                  key={v.llave}
                  type="button"
                  className="pz-pastilla msj-variable"
                  title={v.que}
                  onClick={() =>
                    setEditando((x) => (x
                      ? { ...x, datos: { ...x.datos, cuerpo: `${x.datos.cuerpo}{{${v.llave}}}` } }
                      : x))}
                >
                  {v.llave}
                </button>
              ))}
            </div>
          </div>

          {malEscritas.length > 0 ? (
            <div className="pz-aviso" role="alert">
              <p>
                Estas variables no existen y se van a enviar tal cual:{' '}
                <strong>{malEscritas.join(', ')}</strong>.
              </p>
              <p className="tt-secundario">
                Revisa cómo están escritas — una variable que no existe no falla, llega al cliente.
              </p>
            </div>
          ) : null}

          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">
              <input
                type="checkbox"
                checked={editando.datos.activa}
                onChange={(e) =>
                  setEditando((x) => (x ? { ...x, datos: { ...x.datos, activa: e.target.checked } } : x))}
              />{' '}
              Se puede usar
            </span>
          </label>

          {error ? <p className="pz-error__detalle" role="alert">{error}</p> : null}

          <div className="pz-acciones">
            <button type="button" className="pz-boton" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="pz-boton pz-boton--principal"
              disabled={trabajando || editando.datos.nombre.trim() === '' || editando.datos.cuerpo.trim() === ''}
              onClick={() => {
                onGuardar(editando.id, editando.datos);
                setEditando(null);
              }}
            >
              {trabajando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="pz-columna">
          <div className="rep-tarjeta__cabeza">
            <div className="pz-buscador">
              <span className="pz-buscador__lupa" aria-hidden="true">
                <Icono nombre="lupa" lado={16} />
              </span>
              <input
                type="search"
                className="pz-buscador__campo"
                autoComplete="off"
                placeholder="Buscar plantilla…"
                aria-label="Buscar plantilla"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="pz-boton pz-boton--principal"
              onClick={() => setEditando({ id: null, datos: { ...PLANTILLA_VACIA } })}
            >
              <Icono nombre="mas" lado={16} /> Nueva plantilla
            </button>
          </div>

          {cargando ? (
            <div className="pz-cargando" aria-busy="true">
              <div className="pz-silueta pz-silueta--linea" />
              <div className="pz-silueta pz-silueta--linea" />
            </div>
          ) : visibles.length === 0 ? (
            <div className="pz-vacio pz-vacio--chico">
              <span className="pz-vacio__icono" aria-hidden="true">
                <Icono nombre="nota" lado={22} />
              </span>
              <p className="pz-vacio__texto">
                {busqueda
                  ? 'Ninguna plantilla coincide.'
                  : 'Todavía no hay plantillas. Una plantilla es un texto que escribes una vez ' +
                    'y reutilizas, con el nombre del cliente y la fecha de su cita rellenados solos.'}
              </p>
            </div>
          ) : (
            <ul className="pz-lista">
              {visibles.map((p) => (
                <li key={p.id} className="msj-plantilla">
                  <span className="pz-renglon__cuerpo">
                    <span className="pz-renglon__titulo">
                      {p.nombre}
                      {p.activa ? null : (
                        <span className="pz-pastilla"> Apagada</span>
                      )}
                    </span>
                    <span className="pz-renglon__pie">
                      {p.categoria}
                      {p.canalTipo ? ` · ${COMO_SE_DICE_EL_CANAL[p.canalTipo]}` : ''}
                    </span>
                    <span className="msj-plantilla__texto">{p.cuerpo}</span>
                  </span>
                  <MenuDeAcciones
                    de={p.nombre}
                    opciones={[
                      { clave: 'editar', etiqueta: 'Editar', icono: 'lapiz' },
                      { clave: 'duplicar', etiqueta: 'Duplicar', icono: 'cuadricula' },
                      {
                        clave: 'apagar',
                        etiqueta: p.activa ? 'Apagarla' : 'Encenderla',
                        icono: 'prohibido',
                      },
                      { clave: 'borrar', etiqueta: 'Quitarla', icono: 'basura', peligro: true },
                    ]}
                    onEscoger={(c) => {
                      if (c === 'editar') {
                        setEditando({
                          id: p.id,
                          datos: {
                            nombre: p.nombre, categoria: p.categoria, cuerpo: p.cuerpo,
                            canalTipo: p.canalTipo, activa: p.activa,
                          },
                        });
                      } else if (c === 'duplicar') {
                        // Duplicar parte de los mismos datos pero SIN id: crea
                        // una nueva en vez de pisar la original.
                        setEditando({
                          id: null,
                          datos: {
                            nombre: `${p.nombre} (copia)`, categoria: p.categoria,
                            cuerpo: p.cuerpo, canalTipo: p.canalTipo, activa: p.activa,
                          },
                        });
                      } else if (c === 'apagar') {
                        onGuardar(p.id, {
                          nombre: p.nombre, categoria: p.categoria, cuerpo: p.cuerpo,
                          canalTipo: p.canalTipo, activa: !p.activa,
                        });
                      } else {
                        onBorrar(p);
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
