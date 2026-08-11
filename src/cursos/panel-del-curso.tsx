/**
 * EL PANEL DE DETALLE DE UN CURSO, con sus cuatro pestañas.
 *
 * Las cuatro tienen contenido REAL o dicen que no lo hay. Una pestaña que
 * existe solo porque estaba en el diseño y adentro no tiene nada es peor que
 * no tenerla: se abre esperando algo y no se sabe si falta el dato o el codigo.
 *
 * · Informacion — lo que define el curso hoy.
 * · Alumnos     — quienes son, en que estado, y si deben.
 * · Sesiones    — cuando se imparte. Lo mismo que sale en la Agenda.
 * · Material    — lo que se reparte.
 */

import { formatearMoneda } from '@neron/base/utils';
import { useState, type ReactNode } from 'react';
import type {
  DatosDeMaterial,
  DatosDeSesion,
  EstadoDeInscripcion,
  FichaDeCurso,
} from '../datos/cursos.js';
import { ocupacionDe } from '../datos/cursos.js';
import { fechaConMes } from '../ui/fechas-en-palabras.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { Pista } from '../ui/pista.js';
import { Alumnos } from './alumnos.js';
import { Material } from './material.js';
import { Sesiones } from './sesiones.js';
import { COMO_SE_DICE_LA_VIDA, comoSeLeeLaFecha } from './tabla-de-cursos.js';

export type PestanaDeCurso = 'informacion' | 'alumnos' | 'sesiones' | 'material';

const PESTANAS: readonly { clave: PestanaDeCurso; etiqueta: string }[] = [
  { clave: 'informacion', etiqueta: 'Información' },
  { clave: 'alumnos', etiqueta: 'Alumnos' },
  { clave: 'sesiones', etiqueta: 'Sesiones' },
  { clave: 'material', etiqueta: 'Material' },
];

const COMO_SE_DICE_LA_MODALIDAD: Readonly<Record<string, string>> = {
  presencial: 'Presencial',
  en_linea: 'En línea',
  hibrido: 'Híbrido',
};

/**
 * Como se lee el horario del curso.
 *
 * Sale de las SESIONES, no de un campo del curso: es donde vive la hora de
 * verdad. Con horarios distintos entre sesiones se dice que varian, en vez de
 * enseñar el de la primera como si fuera el de todas.
 */
export function comoSeLeeElHorario(ficha: FichaDeCurso): string {
  const vivas = ficha.sesiones.filter((s) => s.estado !== 'cancelada');
  if (vivas.length === 0) return 'Sin sesiones programadas';
  const primera = vivas[0]!;
  const iguales = vivas.every(
    (s) => s.horaInicio === primera.horaInicio && s.horaFin === primera.horaFin,
  );
  return iguales
    ? `${primera.horaInicio} – ${primera.horaFin}`
    : 'Varía según la sesión';
}

/** Lo que dice la confirmacion de apagar, con el impacto real. */
export function loQuePasaAlApagarElCurso(f: FichaDeCurso | null): string {
  if (!f) return '';
  if (!f.activo) {
    return 'Volverá a ofrecerse. Las inscripciones que ya existían no cambian.';
  }
  if (f.ocupados === 0) {
    return 'Dejará de ofrecerse. Todavía no tiene a nadie inscrito.';
  }
  const cuantos =
    f.ocupados === 1 ? 'Tiene 1 alumno inscrito' : `Tiene ${f.ocupados} alumnos inscritos`;
  return `${cuantos}: esas inscripciones se respetan y el curso se imparte igual. Lo que cambia es que deja de ofrecerse para inscripciones NUEVAS.`;
}

function Renglon({
  icono,
  titulo,
  children,
}: {
  readonly icono: NombreDeIcono;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="pz-renglon pz-renglon--quieto">
      <span className="pz-ficha" aria-hidden="true">
        <Icono nombre={icono} lado={18} />
      </span>
      <div className="pz-dato">
        <span className="tt-etiqueta">{titulo}</span>
        <div className="pz-dato__valor">{children}</div>
      </div>
    </div>
  );
}

export interface PropiedadesDelPanelDeCurso {
  readonly ficha: FichaDeCurso | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly instructores: readonly { id: string; nombre: string }[];
  readonly clientes: readonly { id: string; nombre: string; telefono: string | null }[];
  readonly trabajando: boolean;
  readonly errorDeOperacion: string | null;
  onEditar(): void;
  onCambiarEstado(): void;
  onCerrar(): void;
  onBuscarCliente(texto: string): void;
  onInscribir(clienteId: string): void;
  onCambiarInscripcion(inscripcionId: string, estado: EstadoDeInscripcion): void;
  onNuevoCliente(): void;
  onAbrirCliente(clienteId: string): void;
  onGuardarSesion(id: string | null, datos: DatosDeSesion): void;
  onArchivarSesion(id: string): void;
  onGuardarMaterial(id: string | null, datos: DatosDeMaterial): void;
  onArchivarMaterial(id: string): void;
}

export function PanelDelCurso({
  ficha,
  cargando,
  error,
  permisos,
  instructores,
  clientes,
  trabajando,
  errorDeOperacion,
  onEditar,
  onCambiarEstado,
  onCerrar,
  onBuscarCliente,
  onInscribir,
  onCambiarInscripcion,
  onNuevoCliente,
  onAbrirCliente,
  onGuardarSesion,
  onArchivarSesion,
  onGuardarMaterial,
  onArchivarMaterial,
}: PropiedadesDelPanelDeCurso) {
  const [pestana, setPestana] = useState<PestanaDeCurso>('informacion');
  const puedeGestionar = permisos['gestionarCatalogo'] === true;

  if (!ficha && !cargando && !error) {
    return <Pista texto="Toca un curso para ver su ficha, sus alumnos, sus sesiones y su material." icono="birrete" />;
  }

  return (
    <aside className="pz-tarjeta srv-detalle mv-panel" aria-label="Detalle del curso">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta">Detalle del curso</h3>
        <button
          type="button"
          className="srv-detalle__cerrar"
          onClick={onCerrar}
          aria-label="Cerrar el detalle"
        >
          ×
        </button>
      </header>

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar el curso.</p>
          <p className="pz-error__detalle">{error}</p>
        </div>
      ) : cargando || !ficha ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el curso</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : (
        <>
          {/* La portada con el estado encima, como en el diseño. Sin imagen va
              un icono neutro: no se carga una de ejemplo. */}
          <div className="cur-cabecera">
            {ficha.imagenUrl ? (
              <img
                className="cur-cabecera__imagen"
                src={ficha.imagenUrl}
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="cur-cabecera__imagen cur-cabecera__imagen--vacia" aria-hidden="true">
                <Icono nombre="birrete" lado={36} />
              </span>
            )}
            <span className={`pz-pastilla cur-estado--${ficha.vida} cur-cabecera__estado`}>
              {COMO_SE_DICE_LA_VIDA[ficha.vida]}
            </span>
          </div>

          <div className="srv-detalle__quien">
            <span className="srv-detalle__nombre">{ficha.nombre}</span>
            {ficha.subtitulo ? (
              <span className="srv-detalle__lema">{ficha.subtitulo}</span>
            ) : null}
          </div>

          <div className="pz-segmentos" role="tablist" aria-label="Secciones del curso">
            {PESTANAS.map((p) => (
              <button
                key={p.clave}
                type="button"
                role="tab"
                aria-selected={pestana === p.clave}
                className={`pz-segmento${pestana === p.clave ? ' pz-segmento--puesto' : ''}`}
                onClick={() => setPestana(p.clave)}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>

          {pestana === 'informacion' ? (
            <div className="srv-detalle__cuerpo">
              <Renglon icono="cuadricula" titulo="Categoría">
                {ficha.categoria ? (
                  <span
                    className="srv-categoria"
                    {...(ficha.categoriaColor
                      ? { style: { color: ficha.categoriaColor, borderColor: ficha.categoriaColor } }
                      : {})}
                  >
                    {ficha.categoria}
                  </span>
                ) : (
                  <span className="tt-falta">Sin categoría</span>
                )}
              </Renglon>

              <Renglon icono="persona" titulo="Instructor">
                {ficha.instructor ?? <span className="tt-falta">Sin asignar</span>}
              </Renglon>

              <Renglon icono="calendario" titulo="Fecha">
                {ficha.fechaInicio ? (
                  comoSeLeeLaFecha({
                    fechaInicio: ficha.fechaInicio,
                    fechaFin: ficha.fechaFin,
                    sesiones: ficha.sesiones.length,
                  }).cuando
                ) : (
                  <span className="tt-falta">Sin fecha</span>
                )}
              </Renglon>

              <Renglon icono="reloj" titulo="Duración">
                {
                  comoSeLeeLaFecha({
                    fechaInicio: ficha.fechaInicio,
                    fechaFin: ficha.fechaFin,
                    sesiones: ficha.sesiones.length,
                  }).cuanto || <span className="tt-falta">Sin definir</span>
                }
              </Renglon>

              <Renglon icono="reloj" titulo="Horario">
                {/* Sale de las SESIONES, que es donde vive la hora de verdad. */}
                {comoSeLeeElHorario(ficha)}
              </Renglon>

              <Renglon icono="lugar" titulo="Modalidad">
                {COMO_SE_DICE_LA_MODALIDAD[ficha.modalidad] ?? ficha.modalidad}
              </Renglon>

              {/* El lugar solo cuando la modalidad lo necesita: enseñar "Lugar:
                  —" en un curso en linea hace pensar que falta un dato. */}
              {ficha.modalidad !== 'en_linea' ? (
                <Renglon icono="lugar" titulo="Lugar">
                  {ficha.lugar ?? <span className="tt-falta">Sin definir</span>}
                </Renglon>
              ) : null}

              {ficha.modalidad !== 'presencial' ? (
                <Renglon icono="mensaje" titulo="Enlace">
                  {ficha.enlace ? (
                    <a
                      className="pz-renglon__enlace"
                      href={ficha.enlace}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {ficha.enlace}
                    </a>
                  ) : (
                    <span className="tt-falta">Sin definir</span>
                  )}
                </Renglon>
              ) : null}

              <Renglon icono="personas" titulo="Cupo máximo">
                {/* Sin cupo se DICE "sin límite". Nunca un numero enorme. */}
                {ficha.cupo === null ? (
                  'Sin límite'
                ) : (
                  <>
                    {ficha.cupo} alumnos
                    <div className="tt-secundario">
                      {ficha.ocupados} inscritos
                      {ocupacionDe(ficha.cupo, ficha.ocupados) !== null
                        ? ` · ${ocupacionDe(ficha.cupo, ficha.ocupados)}% de ocupación`
                        : ''}
                      {ficha.enEspera > 0 ? ` · ${ficha.enEspera} en espera` : ''}
                    </div>
                  </>
                )}
              </Renglon>

              <Renglon icono="dinero" titulo="Precio">
                {formatearMoneda(ficha.precioCentavos)}
              </Renglon>

              <Renglon icono="nota" titulo="Descripción">
                {ficha.descripcion ? (
                  // Como TEXTO, nunca como HTML: es lo que alguien escribio.
                  <p className="tt-libre">{ficha.descripcion}</p>
                ) : (
                  <span className="tt-falta">Sin descripción</span>
                )}
              </Renglon>

              {ficha.fechaInicio ? (
                <Renglon icono="calendario" titulo="Empieza">
                  {fechaConMes(ficha.fechaInicio)}
                </Renglon>
              ) : null}
            </div>
          ) : null}

          {pestana === 'alumnos' ? (
            <Alumnos
              ficha={ficha}
              permisos={permisos}
              clientes={clientes}
              trabajando={trabajando}
              error={errorDeOperacion}
              onBuscarCliente={onBuscarCliente}
              onInscribir={onInscribir}
              onCambiarEstado={onCambiarInscripcion}
              onNuevoCliente={onNuevoCliente}
              onAbrirCliente={onAbrirCliente}
            />
          ) : null}

          {pestana === 'sesiones' ? (
            <Sesiones
              sesiones={ficha.sesiones}
              instructores={instructores}
              permisos={permisos}
              trabajando={trabajando}
              error={errorDeOperacion}
              onGuardar={onGuardarSesion}
              onArchivar={onArchivarSesion}
            />
          ) : null}

          {pestana === 'material' ? (
            <Material
              material={ficha.material}
              permisos={permisos}
              trabajando={trabajando}
              error={errorDeOperacion}
              onGuardar={onGuardarMaterial}
              onArchivar={onArchivarMaterial}
            />
          ) : null}

          {puedeGestionar ? (
            <div className="srv-detalle__acciones">
              <button type="button" className="pz-boton pz-boton--principal" onClick={onEditar}>
                <Icono nombre="lapiz" lado={16} /> Editar curso
              </button>
              <button
                type="button"
                className={ficha.activo ? 'srv-boton-peligro' : 'pz-boton'}
                onClick={onCambiarEstado}
              >
                <Icono nombre={ficha.activo ? 'prohibido' : 'palomita'} lado={16} />{' '}
                {ficha.activo ? 'Desactivar curso' : 'Activar curso'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}
