/**
 * LA ADMINISTRACION DE CATEGORIAS.
 *
 * VIVE EN `ui/` Y NO EN UN MODULO porque la usan Servicios y Cursos por igual.
 * Dejarla dentro de Servicios obligaria a que Cursos importara de las tripas
 * de otro modulo — y esa es justo la dependencia que despues no se deshace.
 *
 * Sirve igual para los dos: cambia el `ambito` y nada mas. Dos
 * pantallas iguales con distinto titulo se acaban separando —una recibe un
 * arreglo y la otra no— y ese arreglo es justo el que despues nadie encuentra.
 *
 * ARCHIVAR NO ES BORRAR, Y ANTES SE DICE A QUIEN AFECTA. Una categoria que
 * usan siete servicios, archivada a ciegas, deja a los siete sin categoria sin
 * que nadie se entere. El numero de la izquierda es lo que convierte esa
 * decision en informada.
 */

import { Boton, Campo, Confirmacion, Modal } from '@neron/base/ui';
import { useState } from 'react';
import type { Categoria, DatosDeCategoria } from '../datos/categorias.js';
import { COLOR_POR_OMISION } from '../marca.js';
import { Icono } from './iconos.js';

export const CATEGORIA_VACIA: DatosDeCategoria = {
  nombre: '',
  descripcion: '',
  color: '',
  activo: true,
};

export function validarCategoria(datos: DatosDeCategoria): string | null {
  if (!datos.nombre.trim()) return 'Escribe el nombre de la categoría.';
  if (datos.nombre.trim().length > 60) return 'El nombre no puede pasar de 60 letras.';
  return null;
}

/** Como se dice a quién afecta archivarla. */
export function comoSeDiceElUso(enUso: number, que: string): string {
  if (enUso === 0) return `No la usa ningún ${que}.`;
  if (enUso === 1) return `La usa 1 ${que}, que se quedará sin categoría.`;
  return `La usan ${enUso} ${que}s, que se quedarán sin categoría.`;
}

export interface PropiedadesDeCategorias {
  readonly abierto: boolean;
  readonly titulo: string;
  /** "servicio" o "curso" — solo cambia como se lee el aviso de uso. */
  readonly que: string;
  readonly categorias: readonly Categoria[];
  readonly cargando: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(id: string | null, datos: DatosDeCategoria): void;
  onArchivar(id: string): void;
  onCerrar(): void;
}

export function AdministrarCategorias({
  abierto,
  titulo,
  que,
  categorias,
  cargando,
  trabajando,
  error,
  onGuardar,
  onArchivar,
  onCerrar,
}: PropiedadesDeCategorias) {
  const [editando, setEditando] = useState<{ id: string | null; datos: DatosDeCategoria } | null>(
    null,
  );
  const [fallo, setFallo] = useState<string | null>(null);
  const [aArchivar, setAArchivar] = useState<Categoria | null>(null);

  if (!abierto) return null;

  const poner = <K extends keyof DatosDeCategoria>(k: K, v: DatosDeCategoria[K]): void =>
    setEditando((a) => (a ? { ...a, datos: { ...a.datos, [k]: v } } : a));

  function guardar(): void {
    if (!editando) return;
    const problema = validarCategoria(editando.datos);
    setFallo(problema);
    if (problema) return;
    onGuardar(editando.id, editando.datos);
    setEditando(null);
  }

  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCerrar}>
      <div className="cat">
        {cargando ? (
          <div className="cli-cargando" aria-busy="true">
            <span className="neron-solo-lectores">Cargando las categorías</span>
            <div className="terapias-silueta cli-cargando__renglon" />
          </div>
        ) : categorias.length === 0 ? (
          <p className="cli-vacio__texto">
            Todavía no hay categorías. Sirven para agrupar y filtrar; un {que} puede vivir sin
            ninguna.
          </p>
        ) : (
          <ul className="cat__lista">
            {categorias.map((c) => (
              <li key={c.id} className="cat__renglon">
                <span
                  className="cat__color"
                  aria-hidden="true"
                  {...(c.color ? { style: { background: c.color } } : {})}
                />
                <span className="cat__texto">
                  <span className="cat__nombre">
                    {c.nombre}
                    {!c.activo ? <span className="cli-estado cli-estado--inactivo">Inactiva</span> : null}
                  </span>
                  {/* El numero de uso SIEMPRE visible: es lo que hace que
                      archivar sea una decision informada y no una sorpresa. */}
                  <span className="cat__uso">{comoSeDiceElUso(c.enUso, que)}</span>
                </span>
                <span className="cat__acciones">
                  <button
                    type="button"
                    className="cli-boton-suave"
                    onClick={() =>
                      setEditando({
                        id: c.id,
                        datos: {
                          nombre: c.nombre,
                          descripcion: c.descripcion ?? '',
                          color: c.color ?? '',
                          activo: c.activo,
                        },
                      })
                    }
                  >
                    <Icono nombre="lapiz" lado={14} /> Editar
                  </button>
                  <button
                    type="button"
                    className="cli-boton-suave"
                    onClick={() => setAArchivar(c)}
                  >
                    <Icono nombre="archivar" lado={14} /> Archivar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {editando ? (
          <div className="cat__forma">
            <Campo
              etiqueta="Nombre"
              value={editando.datos.nombre}
              onChange={(e) => poner('nombre', e.target.value)}
              obligatorio
              maxLength={60}
              {...(fallo ? { error: fallo } : {})}
            />
            <div className="cli-ficha__par">
              <Campo
                etiqueta="Descripción"
                value={editando.datos.descripcion}
                onChange={(e) => poner('descripcion', e.target.value)}
                maxLength={200}
              />
              <Campo
                etiqueta="Color"
                type="color"
                // Un campo de color no entiende una variable de CSS: el hex
                // literal sale de `marca.ts`, nunca escrito aqui.
                value={editando.datos.color || COLOR_POR_OMISION}
                onChange={(e) => poner('color', e.target.value)}
              />
            </div>
            <label className="srv-casilla">
              <input
                type="checkbox"
                checked={editando.datos.activo}
                onChange={(e) => poner('activo', e.target.checked)}
              />
              <span>Activa — se ofrece al capturar</span>
            </label>
            <div className="cli-ficha__pie">
              <Boton tono="contorno" type="button" onClick={() => setEditando(null)}>
                Cancelar
              </Boton>
              <Boton tono="principal" type="button" trabajando={trabajando} onClick={guardar}>
                Guardar
              </Boton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="cli-boton-principal"
            onClick={() => {
              setFallo(null);
              setEditando({ id: null, datos: CATEGORIA_VACIA });
            }}
          >
            <Icono nombre="mas" lado={16} /> Nueva categoría
          </button>
        )}

        {error ? (
          <p className="cli-ficha__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Confirmacion
        abierto={aArchivar !== null}
        titulo="Archivar categoría"
        confirmar="Archivar"
        destructivo
        onConfirmar={() => {
          if (aArchivar) onArchivar(aArchivar.id);
          setAArchivar(null);
        }}
        onCancelar={() => setAArchivar(null)}
      >
        <p>
          {aArchivar ? comoSeDiceElUso(aArchivar.enUso, que) : ''} No se borra nada: los que la
          usaban siguen existiendo y se les puede poner otra categoría cuando quieras.
        </p>
      </Confirmacion>
    </Modal>
  );
}
