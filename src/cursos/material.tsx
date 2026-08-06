/**
 * LA PESTAÑA DE MATERIAL.
 *
 * SE GUARDA EL ENLACE, NO EL ARCHIVO. Un PDF de veinte megas metido en la base
 * infla cada respaldo, se baja entero en cada consulta y acaba tumbando la
 * pantalla. El archivo vive donde viven los archivos; aqui vive donde
 * encontrarlo.
 *
 * INTERNO Y PARA ALUMNOS SE DISTINGUEN. Sin esa marca, las notas del
 * instructor —"a este grupo hay que repetirle el modulo 2"— se le acaban
 * mandando a los alumnos.
 */

import { AreaDeTexto, Boton, Campo, Confirmacion, Seleccion } from '@neron/base/ui';
import { useState } from 'react';
import type { DatosDeMaterial, MaterialDelCurso } from '../datos/cursos.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

export const MATERIAL_VACIO: DatosDeMaterial = {
  titulo: '',
  tipo: 'enlace',
  url: '',
  descripcion: '',
  visibleParaAlumnos: true,
};

export const COMO_SE_DICE_EL_TIPO: Readonly<Record<MaterialDelCurso['tipo'], string>> = {
  enlace: 'Enlace',
  archivo: 'Archivo',
  nota: 'Nota',
};

const ICONO_DEL_TIPO: Readonly<Record<MaterialDelCurso['tipo'], NombreDeIcono>> = {
  enlace: 'mensaje',
  archivo: 'recibo',
  nota: 'nota',
};

export function validarMaterial(d: DatosDeMaterial): string | null {
  if (!d.titulo.trim()) return 'Escribe el título del material.';
  // Una nota es texto y no necesita direccion; un enlace sin direccion no
  // lleva a ningun lado y se descubre cuando alguien lo toca.
  if (d.tipo !== 'nota' && !d.url.trim()) return 'Pon la dirección del material.';
  return null;
}

export interface PropiedadesDeMaterial {
  readonly material: readonly MaterialDelCurso[];
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(id: string | null, datos: DatosDeMaterial): void;
  onArchivar(id: string): void;
}

export function Material({
  material,
  permisos,
  trabajando,
  error,
  onGuardar,
  onArchivar,
}: PropiedadesDeMaterial) {
  const [editando, setEditando] = useState<{ id: string | null; datos: DatosDeMaterial } | null>(
    null,
  );
  const [fallo, setFallo] = useState<string | null>(null);
  const [aQuitar, setAQuitar] = useState<MaterialDelCurso | null>(null);
  const puedeGestionar = permisos['gestionarCatalogo'] === true;

  const poner = <K extends keyof DatosDeMaterial>(k: K, v: DatosDeMaterial[K]): void =>
    setEditando((a) => (a ? { ...a, datos: { ...a.datos, [k]: v } } : a));

  function guardar(): void {
    if (!editando) return;
    const problema = validarMaterial(editando.datos);
    setFallo(problema);
    if (problema) return;
    onGuardar(editando.id, editando.datos);
    setEditando(null);
  }

  return (
    <div className="srv-detalle__cuerpo">
      {material.length === 0 ? (
        <p className="cli-vacio__texto">
          Este curso todavía no tiene material. Aquí van las guías, las presentaciones y los
          enlaces que se reparten.
        </p>
      ) : (
        <ul className="cur-material">
          {material.map((m) => (
            <li key={m.id} className="cur-material__renglon">
              <span className="cli-exp__renglon-icono" aria-hidden="true">
                <Icono nombre={ICONO_DEL_TIPO[m.tipo]} lado={18} />
              </span>
              <span className="cat__texto">
                <span className="cat__nombre">
                  {m.url ? (
                    <a
                      className="cli-exp__enlace"
                      href={m.url}
                      target="_blank"
                      // `noreferrer` va junto con `noopener`: sin el, la pagina
                      // que se abre puede leer de donde vino.
                      rel="noopener noreferrer"
                    >
                      {m.titulo}
                    </a>
                  ) : (
                    m.titulo
                  )}
                  {/* La marca de "interno" SIEMPRE visible: es lo que impide
                      mandarle al grupo las notas del instructor. */}
                  {!m.visibleParaAlumnos ? (
                    <span className="cli-estado cur-insc--debe">Solo el equipo</span>
                  ) : null}
                </span>
                <span className="cat__uso">
                  {COMO_SE_DICE_EL_TIPO[m.tipo]}
                  {m.descripcion ? ` · ${m.descripcion}` : ''}
                </span>
              </span>
              {puedeGestionar ? (
                <span className="cat__acciones">
                  <button
                    type="button"
                    className="cli-boton-suave"
                    onClick={() =>
                      setEditando({
                        id: m.id,
                        datos: {
                          titulo: m.titulo,
                          tipo: m.tipo,
                          url: m.url ?? '',
                          descripcion: m.descripcion ?? '',
                          visibleParaAlumnos: m.visibleParaAlumnos,
                        },
                      })
                    }
                  >
                    <Icono nombre="lapiz" lado={14} /> Editar
                  </button>
                  <button type="button" className="cli-boton-suave" onClick={() => setAQuitar(m)}>
                    <Icono nombre="archivar" lado={14} /> Quitar
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {puedeGestionar ? (
        editando ? (
          <div className="cat__forma">
            <Campo
              etiqueta="Título"
              value={editando.datos.titulo}
              onChange={(e) => poner('titulo', e.target.value)}
              obligatorio
              maxLength={160}
              {...(fallo ? { error: fallo } : {})}
            />
            <div className="cli-ficha__par">
              <Seleccion
                etiqueta="Tipo"
                value={editando.datos.tipo}
                onChange={(e) => poner('tipo', e.target.value as DatosDeMaterial['tipo'])}
                opciones={[
                  { valor: 'enlace', texto: 'Enlace' },
                  { valor: 'archivo', texto: 'Archivo' },
                  { valor: 'nota', texto: 'Nota' },
                ]}
              />
              {/* La nota es texto: no se le pide direccion. */}
              {editando.datos.tipo !== 'nota' ? (
                <Campo
                  etiqueta="Dirección"
                  value={editando.datos.url}
                  onChange={(e) => poner('url', e.target.value)}
                  maxLength={500}
                  ayuda="Dónde está el archivo. No se guarda aquí dentro."
                />
              ) : null}
            </div>
            <AreaDeTexto
              etiqueta="Descripción"
              value={editando.datos.descripcion}
              onChange={(e) => poner('descripcion', e.target.value)}
              rows={2}
              maxLength={500}
            />
            <label className="srv-casilla">
              <input
                type="checkbox"
                checked={editando.datos.visibleParaAlumnos}
                onChange={(e) => poner('visibleParaAlumnos', e.target.checked)}
              />
              <span>Los alumnos pueden verlo</span>
            </label>

            {error ? (
              <p className="cli-ficha__error" role="alert">
                {error}
              </p>
            ) : null}

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
              setEditando({ id: null, datos: MATERIAL_VACIO });
            }}
          >
            <Icono nombre="mas" lado={16} /> Agregar material
          </button>
        )
      ) : null}

      <Confirmacion
        abierto={aQuitar !== null}
        titulo="Quitar material"
        confirmar="Quitar"
        destructivo
        onConfirmar={() => {
          if (aQuitar) onArchivar(aQuitar.id);
          setAQuitar(null);
        }}
        onCancelar={() => setAQuitar(null)}
      >
        <p>Deja de aparecer en el curso. El archivo en sí no se toca: aquí solo vive el enlace.</p>
      </Confirmacion>
    </div>
  );
}
