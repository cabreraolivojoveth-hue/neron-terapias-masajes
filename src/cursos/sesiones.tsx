/**
 * LA PESTAÑA DE SESIONES.
 *
 * LA SESION ES LA EJECUCION del curso: que dia, a que hora, con quien, donde.
 * Un curso de un dia y uno de veinte sesiones son la misma tabla con distinto
 * numero de renglones.
 *
 * ESTAS SESIONES SON LAS QUE SALEN EN LA AGENDA. No hay una cita espejo por
 * cada una: la Agenda las CONSULTA. Una copia se quedaria con la fecha vieja
 * el dia que alguien reprograme la sesion de verdad, y entonces habria dos
 * calendarios diciendo cosas distintas.
 *
 * EL CHOQUE DE INSTRUCTOR LO RECHAZA LA BASE, contra las citas Y contra las
 * demas sesiones. Comprobar aqui seria una comodidad; comprobar alla es lo que
 * de verdad impide que una terapeuta quede en dos lados a la misma hora.
 */

import { Boton, Campo, Confirmacion, Seleccion } from '@neron/base/ui';
import { useState } from 'react';
import type { DatosDeSesion, SesionDelCurso } from '../datos/cursos.js';
import { fechaConMes } from '../ui/fechas-en-palabras.js';
import { Icono } from '../ui/iconos.js';
import { aInputFecha, deInputFecha } from './formulario-de-curso.js';

export const SESION_VACIA: DatosDeSesion = {
  titulo: '',
  fecha: '',
  horaInicio: '09:00',
  horaFin: '14:00',
  instructorId: '',
  lugar: '',
  estado: 'programada',
};

export const COMO_SE_DICE_LA_SESION: Readonly<Record<SesionDelCurso['estado'], string>> = {
  programada: 'Programada',
  impartida: 'Impartida',
  cancelada: 'Cancelada',
};

export function validarSesion(d: DatosDeSesion): string | null {
  if (!d.fecha) return 'La sesión necesita una fecha.';
  if (!d.horaInicio || !d.horaFin) return 'La sesión necesita hora de inicio y de fin.';
  // Las horas se comparan como `hh:mm`, que ordena bien como texto.
  if (d.horaFin <= d.horaInicio) return 'La sesión no puede terminar antes de empezar.';
  return null;
}

/** Como se numera una sesion sin titulo. No se inventa un nombre. */
export function tituloDeLaSesion(s: SesionDelCurso, indice: number): string {
  const puesto = (s.titulo ?? '').trim();
  return puesto || `Sesión ${indice + 1}`;
}

export interface PropiedadesDeSesiones {
  readonly sesiones: readonly SesionDelCurso[];
  readonly instructores: readonly { id: string; nombre: string }[];
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(id: string | null, datos: DatosDeSesion): void;
  onArchivar(id: string): void;
}

export function Sesiones({
  sesiones,
  instructores,
  permisos,
  trabajando,
  error,
  onGuardar,
  onArchivar,
}: PropiedadesDeSesiones) {
  const [editando, setEditando] = useState<{ id: string | null; datos: DatosDeSesion } | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [aQuitar, setAQuitar] = useState<SesionDelCurso | null>(null);
  const puedeGestionar = permisos['gestionarCatalogo'] === true;

  const poner = <K extends keyof DatosDeSesion>(k: K, v: DatosDeSesion[K]): void =>
    setEditando((a) => (a ? { ...a, datos: { ...a.datos, [k]: v } } : a));

  function guardar(): void {
    if (!editando) return;
    const problema = validarSesion(editando.datos);
    setFallo(problema);
    if (problema) return;
    onGuardar(editando.id, editando.datos);
    setEditando(null);
  }

  return (
    <div className="srv-detalle__cuerpo">
      {sesiones.length === 0 ? (
        <p className="pz-vacio__texto">
          Este curso todavía no tiene sesiones programadas. Cada sesión aparece en la Agenda del
          centro con su instructor y su horario.
        </p>
      ) : (
        <ul className="cur-sesiones">
          {sesiones.map((s, i) => (
            <li key={s.id} className="cur-sesion">
              <span className="cur-sesion__cuando">
                <span className="cur-sesion__titulo">{tituloDeLaSesion(s, i)}</span>
                <span className="tt-secundario">
                  {fechaConMes(s.fecha)} · {s.horaInicio}–{s.horaFin}
                </span>
                <span className="tt-secundario">
                  {/* Sin instructor propio se dice que hereda el del curso, en
                      vez de dejar el hueco como si faltara el dato. */}
                  {s.instructor ?? 'El instructor del curso'}
                  {s.lugar ? ` · ${s.lugar}` : ''}
                </span>
              </span>
              <span className={`pz-pastilla cur-ses--${s.estado}`}>
                {COMO_SE_DICE_LA_SESION[s.estado]}
              </span>
              {puedeGestionar ? (
                <span className="pz-encabezado__acciones">
                  <button
                    type="button"
                    className="pz-boton"
                    onClick={() =>
                      setEditando({
                        id: s.id,
                        datos: {
                          titulo: s.titulo ?? '',
                          fecha: s.fecha,
                          horaInicio: s.horaInicio,
                          horaFin: s.horaFin,
                          instructorId: s.instructorId ?? '',
                          lugar: s.lugar ?? '',
                          estado: s.estado,
                        },
                      })
                    }
                  >
                    <Icono nombre="lapiz" lado={14} /> Editar
                  </button>
                  <button
                    type="button"
                    className="pz-boton"
                    onClick={() => setAQuitar(s)}
                  >
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
              maxLength={120}
              ayuda="Vacío = se numera sola."
            />
            <div className="pz-dos">
              <Campo
                etiqueta="Fecha"
                type="date"
                value={aInputFecha(editando.datos.fecha)}
                onChange={(e) => poner('fecha', deInputFecha(e.target.value))}
                obligatorio
              />
              <Seleccion
                etiqueta="Instructor"
                value={editando.datos.instructorId}
                onChange={(e) => poner('instructorId', e.target.value)}
                ayuda="Vacío = el del curso."
                opciones={[
                  { valor: '', texto: 'El del curso' },
                  ...instructores.map((p) => ({ valor: p.id, texto: p.nombre })),
                ]}
              />
            </div>
            <div className="pz-dos">
              <Campo
                etiqueta="Empieza"
                type="time"
                value={editando.datos.horaInicio}
                onChange={(e) => poner('horaInicio', e.target.value)}
                obligatorio
              />
              <Campo
                etiqueta="Termina"
                type="time"
                value={editando.datos.horaFin}
                onChange={(e) => poner('horaFin', e.target.value)}
                obligatorio
              />
            </div>
            <div className="pz-dos">
              <Campo
                etiqueta="Lugar"
                value={editando.datos.lugar}
                onChange={(e) => poner('lugar', e.target.value)}
                maxLength={200}
                ayuda="Vacío = el del curso."
              />
              <Seleccion
                etiqueta="Estado"
                value={editando.datos.estado}
                onChange={(e) => poner('estado', e.target.value as DatosDeSesion['estado'])}
                opciones={[
                  { valor: 'programada', texto: 'Programada' },
                  { valor: 'impartida', texto: 'Impartida' },
                  { valor: 'cancelada', texto: 'Cancelada' },
                ]}
              />
            </div>

            {fallo ? (
              <p className="pz-error__que" role="alert">
                {fallo}
              </p>
            ) : null}
            {error ? (
              <p className="pz-error__que" role="alert">
                {error}
              </p>
            ) : null}

            <div className="pz-ficha__pie">
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
            className="pz-boton pz-boton--principal"
            onClick={() => {
              setFallo(null);
              setEditando({ id: null, datos: SESION_VACIA });
            }}
          >
            <Icono nombre="mas" lado={16} /> Agregar sesión
          </button>
        )
      ) : null}

      <Confirmacion
        abierto={aQuitar !== null}
        titulo="Quitar sesión"
        confirmar="Quitar"
        destructivo
        onConfirmar={() => {
          if (aQuitar) onArchivar(aQuitar.id);
          setAQuitar(null);
        }}
        onCancelar={() => setAQuitar(null)}
      >
        <p>
          La sesión deja de aparecer en la Agenda. No se borra de la historia: si ya se impartió,
          sigue contando en los reportes.
        </p>
      </Confirmacion>
    </div>
  );
}
