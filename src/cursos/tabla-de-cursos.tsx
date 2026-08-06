/**
 * LA LISTA DE CURSOS: pestañas, buscador, filtros, tabla y paginacion.
 *
 * EN CELULAR NO SE APRIETAN SIETE COLUMNAS. La tabla se convierte en tarjetas
 * con lo que de verdad decide algo —nombre, fecha, alumnos, estado, precio—.
 * Siete columnas en cuatrocientos pixeles no se leen: se adivinan.
 *
 * EL BUSCADOR NO PIERDE EL FOCO. El campo se pinta SIEMPRE, en el mismo lugar
 * del arbol, y ningun componente se define dentro del render de otro.
 *
 * LA FECHA SE LEE DISTINTO SEGUN EL CURSO. Dos dias seguidos son un rango;
 * cinco sabados salteados NO son un rango, y fingir que lo son hace creer que
 * el curso dura cinco semanas corridas.
 */

import { formatearMoneda } from '@neron/base/utils';
import { useEffect, useRef, useState } from 'react';
import type { Categoria } from '../datos/categorias.js';
import type { CursoEnLista, VidaDeCurso } from '../datos/cursos.js';
import { estaLleno } from '../datos/cursos.js';
import { diaYMes, diasEntreInclusive, fechaConMes } from '../ui/fechas-en-palabras.js';
import { Icono } from '../ui/iconos.js';

/** Como se lee el estado de un curso. */
export const COMO_SE_DICE_LA_VIDA: Readonly<Record<VidaDeCurso, string>> = {
  proximo: 'Próximo',
  activo: 'Activo',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
  inactivo: 'Inactivo',
};

export const PESTANAS_DE_LISTA: readonly { clave: string; etiqueta: string }[] = [
  { clave: '', etiqueta: 'Todos' },
  { clave: 'activo', etiqueta: 'Activos' },
  { clave: 'inactivo', etiqueta: 'Inactivos' },
  { clave: 'finalizado', etiqueta: 'Finalizados' },
];

/**
 * Como se lee la fecha y la duracion de un curso.
 *
 * Con mas sesiones que dias del rango, o con sesiones salteadas, se dice
 * "N sesiones" en vez de un rango: un curso de cinco sabados NO dura cinco
 * semanas seguidas, y enseñarlo como rango hace creer justo eso.
 */
export function comoSeLeeLaFecha(c: {
  fechaInicio: string | null;
  fechaFin: string | null;
  sesiones: number;
}): { cuando: string; cuanto: string } {
  if (!c.fechaInicio) return { cuando: 'Sin fecha', cuanto: '' };

  const dias = c.fechaFin ? diasEntreInclusive(c.fechaInicio, c.fechaFin) : 1;

  // Sesiones sueltas dentro de un rango largo: se cuentan, no se estiran.
  if (c.sesiones > 1 && dias > c.sesiones) {
    return {
      cuando: `${diaYMes(c.fechaInicio)} – ${fechaConMes(c.fechaFin ?? c.fechaInicio)}`,
      cuanto: `${c.sesiones} sesiones`,
    };
  }

  if (!c.fechaFin || c.fechaFin === c.fechaInicio) {
    return {
      cuando: fechaConMes(c.fechaInicio),
      cuanto: c.sesiones > 1 ? `${c.sesiones} sesiones` : '1 día',
    };
  }

  return {
    cuando: `${diaYMes(c.fechaInicio)} – ${fechaConMes(c.fechaFin)}`,
    cuanto: dias === 1 ? '1 día' : `${dias} días`,
  };
}

/** Como se leen los lugares. Sin cupo NO se inventa un denominador. */
export function comoSeLeenLosLugares(cupo: number | null, ocupados: number): string {
  if (cupo === null) return `${ocupados}`;
  return `${ocupados} / ${cupo}`;
}

export interface AccionDeCurso {
  readonly clave: string;
  readonly etiqueta: string;
  readonly capacidad: string | null;
}

/** Lo que no se puede hacer NO se muestra, ni en gris. */
export function accionesPara(
  permisos: Readonly<Record<string, boolean>>,
  curso: CursoEnLista,
): AccionDeCurso[] {
  const todas: AccionDeCurso[] = [
    { clave: 'ver', etiqueta: 'Ver detalle', capacidad: null },
    { clave: 'editar', etiqueta: 'Editar', capacidad: 'gestionarCatalogo' },
    { clave: 'duplicar', etiqueta: 'Duplicar', capacidad: 'gestionarCatalogo' },
    {
      clave: 'estado',
      etiqueta: curso.activo ? 'Desactivar' : 'Activar',
      capacidad: 'gestionarCatalogo',
    },
  ];
  return todas.filter((a) => a.capacidad === null || permisos[a.capacidad] === true);
}

/* ------------------------------------------------------------------ */

function MenuDeAcciones({
  curso,
  permisos,
  onAccion,
}: {
  readonly curso: CursoEnLista;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly onAccion: (clave: string, c: CursoEnLista) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const acciones = accionesPara(permisos, curso);

  useEffect(() => {
    if (!abierto) return;
    // `mousedown` y no `click`: con `click` el primer toque fuera se pierde.
    const afuera = (e: MouseEvent): void => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      boton.current?.focus();
    };
    document.addEventListener('mousedown', afuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', afuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  if (acciones.length === 0) return null;

  return (
    <div className="cli-menu" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="cli-menu__boton"
        aria-expanded={abierto}
        aria-label={`Acciones para ${curso.nombre}`}
        onClick={() => setAbierto((a) => !a)}
      >
        <Icono nombre="puntos" lado={18} />
      </button>
      {abierto ? (
        <div className="cli-menu__panel" role="menu">
          {acciones.map((a) => (
            <button
              key={a.clave}
              type="button"
              role="menuitem"
              className="cli-menu__opcion"
              onClick={() => {
                setAbierto(false);
                onAccion(a.clave, curso);
              }}
            >
              {a.etiqueta}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** La miniatura. Sin imagen NO se carga una de ejemplo: va un icono neutro. */
function Portada({ curso }: { readonly curso: CursoEnLista }) {
  if (curso.imagenUrl) {
    return (
      <img
        className="cur-portada"
        src={curso.imagenUrl}
        alt=""
        loading="lazy"
        // Si el enlace se rompe, se esconde en vez de dejar el icono partido
        // del navegador, que se lee como un error del sistema.
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return (
    <span className="cur-portada cur-portada--vacia" aria-hidden="true">
      <Icono nombre="birrete" lado={18} />
    </span>
  );
}

/* ------------------------------------------------------------------ */

export interface PropiedadesDeTablaDeCursos {
  readonly cursos: readonly CursoEnLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly busqueda: string;
  readonly pestana: string;
  readonly categoriaId: string;
  readonly instructorId: string;
  readonly modalidad: string;
  readonly conLugares: boolean;
  readonly categorias: readonly Categoria[];
  readonly instructores: readonly { id: string; nombre: string }[];
  readonly filtrosAbiertos: boolean;
  readonly seleccionado: string | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly cargando: boolean;
  readonly error: string | null;
  onBuscar(texto: string): void;
  onPestana(clave: string): void;
  onCategoria(id: string): void;
  onInstructor(id: string): void;
  onModalidad(m: string): void;
  onConLugares(v: boolean): void;
  onFiltros(): void;
  onPagina(pagina: number): void;
  onPorPagina(cuantos: number): void;
  onAccion(clave: string, curso: CursoEnLista): void;
  onNuevo(): void;
  onReintentar(): void;
}

const POR_PAGINA = [10, 25, 50];

export function TablaDeCursos({
  cursos,
  total,
  pagina,
  porPagina,
  busqueda,
  pestana,
  categoriaId,
  instructorId,
  modalidad,
  conLugares,
  categorias,
  instructores,
  filtrosAbiertos,
  seleccionado,
  permisos,
  cargando,
  error,
  onBuscar,
  onPestana,
  onCategoria,
  onInstructor,
  onModalidad,
  onConLugares,
  onFiltros,
  onPagina,
  onPorPagina,
  onAccion,
  onNuevo,
  onReintentar,
}: PropiedadesDeTablaDeCursos) {
  const paginas = Math.max(1, Math.ceil(total / Math.max(porPagina, 1)));
  const puedeGestionar = permisos['gestionarCatalogo'] === true;
  const hayFiltros = Boolean(
    busqueda || pestana || categoriaId || instructorId || modalidad || conLugares,
  );
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;

  return (
    <section className="cli-panel cli-lista" aria-labelledby="cur-lista-titulo">
      <header className="cli-panel__barra">
        <h3 className="cli-panel__titulo" id="cur-lista-titulo">
          Lista de cursos
        </h3>
        <button
          type="button"
          className={`cli-panel__enlace${filtrosAbiertos ? ' srv-filtro--puesto' : ''}`}
          aria-expanded={filtrosAbiertos}
          onClick={onFiltros}
        >
          <Icono nombre="filtros" lado={14} /> Filtrar
        </button>
        <label className="cli-campo cli-campo--corto">
          <span className="neron-solo-lectores">Estado del curso</span>
          <select value={pestana} onChange={(e) => onPestana(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="proximo">Próximos</option>
            <option value="activo">Activos</option>
            <option value="finalizado">Finalizados</option>
            <option value="cancelado">Cancelados</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </label>
      </header>

      {/* Las pestañas FILTRAN de verdad: no son decoracion sobre la misma lista. */}
      <div className="cur-pestanas" role="tablist" aria-label="Filtrar por estado">
        {PESTANAS_DE_LISTA.map((p) => (
          <button
            key={p.clave || 'todos'}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            className={`cur-pestana${pestana === p.clave ? ' cur-pestana--puesta' : ''}`}
            onClick={() => onPestana(p.clave)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {filtrosAbiertos ? (
        <div className="srv-filtros">
          <div className="cli-buscador">
            <span className="cli-buscador__lupa" aria-hidden="true">
              <Icono nombre="lupa" lado={16} />
            </span>
            {/* SIEMPRE pintado, en el mismo lugar del arbol: es lo que sostiene
                el foco mientras la tabla de abajo cambia. */}
            <input
              type="search"
              className="cli-buscador__campo"
              autoComplete="off"
              placeholder="Buscar curso…"
              aria-label="Buscar curso por nombre, subtítulo o descripción"
              value={busqueda}
              onChange={(e) => onBuscar(e.target.value)}
            />
          </div>
          <label className="cli-campo">
            <span className="cli-campo__etiqueta">Categoría</span>
            <select value={categoriaId} onChange={(e) => onCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="cli-campo">
            <span className="cli-campo__etiqueta">Instructor</span>
            <select value={instructorId} onChange={(e) => onInstructor(e.target.value)}>
              <option value="">Todos</option>
              {instructores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="cli-campo">
            <span className="cli-campo__etiqueta">Modalidad</span>
            <select value={modalidad} onChange={(e) => onModalidad(e.target.value)}>
              <option value="">Todas</option>
              <option value="presencial">Presencial</option>
              <option value="en_linea">En línea</option>
              <option value="hibrido">Híbrido</option>
            </select>
          </label>
          {/* Pregunta real de mostrador: a quien todavia se le puede ofrecer. */}
          <label className="srv-casilla">
            <input
              type="checkbox"
              checked={conLugares}
              onChange={(e) => onConLugares(e.target.checked)}
            />
            <span>Solo con lugares disponibles</span>
          </label>
        </div>
      ) : null}

      {error ? (
        <div className="cli-error" role="alert">
          {/* VACIO y ERROR son estados distintos: decir "no hay cursos" cuando
              lo que fallo fue la red hace que alguien los capture otra vez. */}
          <p className="cli-error__que">No pudimos cargar los cursos.</p>
          <p className="cli-error__detalle">{error}</p>
          <button type="button" className="cli-boton-suave" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="cli-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los cursos</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="terapias-silueta cli-cargando__renglon" />
          ))}
        </div>
      ) : cursos.length === 0 ? (
        <div className="cli-vacio">
          <span className="cli-vacio__icono" aria-hidden="true">
            <Icono nombre="birrete" lado={44} />
          </span>
          <p className="cli-vacio__titulo">
            {hayFiltros ? 'Ningún curso coincide' : 'No hay cursos registrados'}
          </p>
          <p className="cli-vacio__texto">
            {hayFiltros
              ? 'Prueba con otro nombre o quita los filtros.'
              : 'Crea tu primer curso para comenzar.'}
          </p>
          {puedeGestionar && !hayFiltros ? (
            <button type="button" className="cli-boton-principal" onClick={onNuevo}>
              <Icono nombre="mas" lado={16} /> Nuevo curso
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* El scroll horizontal vive DENTRO de la tabla, nunca en la pagina. */}
          <div className="cli-tabla__marco cur-solo-ancho">
            <table className="cli-tabla">
              <thead>
                <tr>
                  <th>Curso</th>
                  <th>Categoría</th>
                  <th>Fecha / Duración</th>
                  <th className="cli-tabla__numero">Precio</th>
                  <th>Alumnos</th>
                  <th>Estado</th>
                  <th className="cli-tabla__acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cursos.map((c) => {
                  const f = comoSeLeeLaFecha(c);
                  return (
                    <tr key={c.id} className={c.id === seleccionado ? 'cli-tabla__fila--marcada' : ''}>
                      <td>
                        <button
                          type="button"
                          className="cli-persona"
                          onClick={() => onAccion('ver', c)}
                        >
                          <Portada curso={c} />
                          <span className="srv-nombre">
                            <span className="cli-persona__nombre">{c.nombre}</span>
                            {/* Sin subtitulo NO se inventa un texto. */}
                            {c.subtitulo ? (
                              <span className="srv-descripcion">{c.subtitulo}</span>
                            ) : null}
                          </span>
                        </button>
                      </td>
                      <td>
                        {c.categoria ? (
                          <span
                            className="srv-categoria"
                            {...(c.categoriaColor
                              ? { style: { color: c.categoriaColor, borderColor: c.categoriaColor } }
                              : {})}
                          >
                            {c.categoria}
                          </span>
                        ) : (
                          <span className="cli-falta">Sin categoría</span>
                        )}
                      </td>
                      <td>
                        <span className="cur-fecha">
                          <span>{f.cuando}</span>
                          {f.cuanto ? <span className="cur-fecha__cuanto">{f.cuanto}</span> : null}
                        </span>
                      </td>
                      <td className="cli-tabla__numero">{formatearMoneda(c.precioCentavos)}</td>
                      <td>
                        <span
                          className={`cur-lugares${estaLleno(c.cupo, c.ocupados) ? ' cur-lugares--lleno' : ''}`}
                        >
                          {comoSeLeenLosLugares(c.cupo, c.ocupados)}
                        </span>
                        {/* Sin cupo se DICE, en vez de dejar un numero suelto
                            que se lee como si faltara el denominador. */}
                        {c.cupo === null ? (
                          <span className="cli-falta"> sin límite</span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`cli-estado cur-estado--${c.vida}`}>
                          {COMO_SE_DICE_LA_VIDA[c.vida]}
                        </span>
                      </td>
                      <td className="cli-tabla__acciones">
                        <MenuDeAcciones curso={c} permisos={permisos} onAccion={onAccion} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* En celular, tarjetas. Siete columnas en cuatrocientos pixeles no se
              leen: se adivinan. */}
          <ul className="cur-tarjetas">
            {cursos.map((c) => {
              const f = comoSeLeeLaFecha(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`cur-tarjeta${c.id === seleccionado ? ' cur-tarjeta--marcada' : ''}`}
                    onClick={() => onAccion('ver', c)}
                  >
                    <span className="cur-tarjeta__cabeza">
                      <Portada curso={c} />
                      <span className="srv-nombre">
                        <span className="cli-persona__nombre">{c.nombre}</span>
                        {c.subtitulo ? (
                          <span className="srv-descripcion">{c.subtitulo}</span>
                        ) : null}
                      </span>
                      <span className={`cli-estado cur-estado--${c.vida}`}>
                        {COMO_SE_DICE_LA_VIDA[c.vida]}
                      </span>
                    </span>
                    <span className="cur-tarjeta__datos">
                      <span>{f.cuando}</span>
                      <span>{comoSeLeenLosLugares(c.cupo, c.ocupados)} alumnos</span>
                      <span>{formatearMoneda(c.precioCentavos)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <footer className="cli-pie">
        <span className="cli-pie__cuenta">
          Mostrando {desde} a {desde === 0 ? 0 : desde + cursos.length - 1} de {total}{' '}
          {total === 1 ? 'curso' : 'cursos'}
        </span>

        <div className="cli-paginas" role="group" aria-label="Páginas">
          <button
            type="button"
            className="cli-paginas__boton"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            ‹
          </button>
          <span className="cli-paginas__actual" aria-live="polite">
            {pagina} de {paginas}
          </span>
          <button
            type="button"
            className="cli-paginas__boton"
            aria-label="Página siguiente"
            disabled={pagina >= paginas}
            onClick={() => onPagina(pagina + 1)}
          >
            ›
          </button>
        </div>

        <label className="cli-campo cli-campo--corto">
          <span className="neron-solo-lectores">Cuántos por página</span>
          <select value={porPagina} onChange={(e) => onPorPagina(Number(e.target.value))}>
            {POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n} por página
              </option>
            ))}
          </select>
        </label>
      </footer>
    </section>
  );
}
