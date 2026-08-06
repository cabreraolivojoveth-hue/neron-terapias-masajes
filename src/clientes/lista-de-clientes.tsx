/**
 * LA LISTA DE CLIENTES: buscador, filtros, tabla, cuadricula y paginacion.
 *
 * TRES COSAS QUE AQUI SE HACEN A PROPOSITO:
 *
 * 1. EL BUSCADOR NO PIERDE EL FOCO. El campo se pinta SIEMPRE, en el mismo
 *    lugar del arbol, y ningun componente se define dentro del render de otro.
 *    Definirlo adentro hace que React lo trate como un componente nuevo en
 *    cada pulsacion: destruye el campo, monta otro, y el cursor se sale. Es la
 *    queja de "escribo una letra y tengo que volver a hacer clic".
 *
 * 2. EL MENU DE ACCIONES SE CIERRA AL TOCAR FUERA Y CON ESCAPE, y va por
 *    encima de todo. Los menus que oscurecen el fondo y no aparecen salen de
 *    un z-index perdido en un contexto de apilamiento; aqui el panel es hijo
 *    directo de un contenedor posicionado y nada lo recorta.
 *
 * 3. LA PAGINACION ES DE VERDAD. El servidor devuelve la pagina Y el total: no
 *    se bajan mil clientes para enseñar diez.
 */

import { Confirmacion } from '@neron/base/ui';
import { useEffect, useRef, useState } from 'react';
import {
  ESTADOS_DE_CLIENTE,
  etiquetaDeEstadoDeCliente,
  type ClienteEnLista,
} from '../datos/clientes.js';
import type { ProfesionalBreve } from '../datos/citas.js';
import { Icono } from '../ui/iconos.js';

export type Vista = 'lista' | 'cuadricula';

export interface AccionDeCliente {
  readonly clave: string;
  readonly etiqueta: string;
  readonly capacidad: string | null;
}

/**
 * Lo que se puede hacer con un cliente, y con que permiso.
 *
 * Lo que no se puede hacer NO SE MUESTRA — ni en gris. Un menu lleno de
 * opciones apagadas es ruido, y de paso le cuenta a quien no debe que esas
 * operaciones existen.
 */
export const ACCIONES: readonly AccionDeCliente[] = [
  { clave: 'ver', etiqueta: 'Ver expediente', capacidad: null },
  { clave: 'editar', etiqueta: 'Editar', capacidad: 'gestionarClientes' },
  { clave: 'cita', etiqueta: 'Nueva cita', capacidad: 'gestionarAgenda' },
  { clave: 'venta', etiqueta: 'Registrar venta', capacidad: 'cobrar' },
  { clave: 'mensaje', etiqueta: 'Enviar mensaje', capacidad: null },
  { clave: 'recordatorio', etiqueta: 'Crear recordatorio', capacidad: null },
  { clave: 'curso', etiqueta: 'Inscribir a curso', capacidad: 'gestionarCatalogo' },
  { clave: 'archivar', etiqueta: 'Archivar', capacidad: 'gestionarClientes' },
];

export function accionesPara(
  permisos: Readonly<Record<string, boolean>>,
  cliente: ClienteEnLista,
): AccionDeCliente[] {
  return ACCIONES.filter((a) => a.capacidad === null || permisos[a.capacidad] === true).map((a) =>
    // Un expediente archivado no se archiva otra vez: se reactiva.
    a.clave === 'archivar' && cliente.estado === 'archivado'
      ? { ...a, etiqueta: 'Reactivar' }
      : a,
  );
}

/** Las iniciales del avatar. Nunca una foto de archivo. */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '·';
  return ((palabras[0]?.[0] ?? '') + (palabras.length > 1 ? (palabras[1]?.[0] ?? '') : ''))
    .toUpperCase();
}

/* ------------------------------------------------------------------ */
/* El menu de acciones de un renglon                                   */
/* ------------------------------------------------------------------ */

function MenuDeAcciones({
  cliente,
  permisos,
  onAccion,
}: {
  readonly cliente: ClienteEnLista;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly onAccion: (clave: string, cliente: ClienteEnLista) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const acciones = accionesPara(permisos, cliente);

  useEffect(() => {
    if (!abierto) return;
    // `mousedown` y no `click`: con `click` el menu se cierra despues de que
    // el navegador ya decidio a quien le tocaba el toque, y el primer clic
    // fuera se pierde.
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
        aria-label={`Acciones para ${cliente.nombre}`}
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
                onAccion(a.clave, cliente);
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

/* ------------------------------------------------------------------ */

export interface PropiedadesDeLista {
  readonly clientes: readonly ClienteEnLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly vista: Vista;
  readonly busqueda: string;
  readonly estado: string;
  readonly profesionalId: string;
  readonly profesionales: readonly ProfesionalBreve[];
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly cargando: boolean;
  readonly error: string | null;
  onBuscar(texto: string): void;
  onEstado(estado: string): void;
  onProfesional(id: string): void;
  onVista(vista: Vista): void;
  onPagina(pagina: number): void;
  onPorPagina(cuantos: number): void;
  onAccion(clave: string, cliente: ClienteEnLista): void;
  onNuevo(): void;
  onReintentar(): void;
  onArchivarVarios(ids: readonly string[]): void;
}

const POR_PAGINA = [10, 25, 50];

export function ListaDeClientes({
  clientes,
  total,
  pagina,
  porPagina,
  vista,
  busqueda,
  estado,
  profesionalId,
  profesionales,
  permisos,
  cargando,
  error,
  onBuscar,
  onEstado,
  onProfesional,
  onVista,
  onPagina,
  onPorPagina,
  onAccion,
  onNuevo,
  onReintentar,
  onArchivarVarios,
}: PropiedadesDeLista) {
  const [marcados, setMarcados] = useState<readonly string[]>([]);
  const [confirmar, setConfirmar] = useState(false);

  const paginas = Math.max(1, Math.ceil(total / Math.max(porPagina, 1)));
  const puedeGestionar = permisos['gestionarClientes'] === true;

  // Al cambiar de pagina o de filtro, la seleccion se limpia. Guardarla
  // llevaria a archivar gente que ya ni se ve en la pantalla.
  useEffect(() => setMarcados([]), [pagina, busqueda, estado, profesionalId, porPagina]);

  const alternar = (id: string): void =>
    setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const todosMarcados = clientes.length > 0 && marcados.length === clientes.length;

  return (
    <section className="cli-panel cli-lista" aria-labelledby="cli-lista-titulo">
      <header className="cli-panel__barra">
        <h3 className="cli-panel__titulo" id="cli-lista-titulo">
          Lista de clientes
        </h3>
      </header>

      <div className="cli-herramientas">
        <div className="cli-buscador">
          <span className="cli-buscador__lupa" aria-hidden="true">
            <Icono nombre="lupa" lado={16} />
          </span>
          {/*
            SIEMPRE PINTADO, en el mismo lugar. Es lo que sostiene el foco:
            lo unico que cambia debajo es la tabla.
          */}
          <input
            type="search"
            className="cli-buscador__campo"
            autoComplete="off"
            placeholder="Buscar cliente…"
            aria-label="Buscar cliente por nombre, teléfono o correo"
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
          />
        </div>

        <label className="cli-campo">
          <span className="neron-solo-lectores">Estado del cliente</span>
          <select value={estado} onChange={(e) => onEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS_DE_CLIENTE.map((e) => (
              <option key={e.clave} value={e.clave}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className="cli-campo">
          <span className="neron-solo-lectores">Terapeuta asignado</span>
          <select value={profesionalId} onChange={(e) => onProfesional(e.target.value)}>
            <option value="">Todos los terapeutas</option>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>

        <div className="cli-vistas" role="group" aria-label="Cómo ver la lista">
          <button
            type="button"
            className={`cli-vistas__boton${vista === 'lista' ? ' cli-vistas__boton--puesta' : ''}`}
            aria-pressed={vista === 'lista'}
            aria-label="Ver como lista"
            onClick={() => onVista('lista')}
          >
            <Icono nombre="renglones" lado={16} />
          </button>
          <button
            type="button"
            className={`cli-vistas__boton${vista === 'cuadricula' ? ' cli-vistas__boton--puesta' : ''}`}
            aria-pressed={vista === 'cuadricula'}
            aria-label="Ver como cuadrícula"
            onClick={() => onVista('cuadricula')}
          >
            <Icono nombre="cuadricula" lado={16} />
          </button>
        </div>
      </div>

      {marcados.length > 0 && puedeGestionar ? (
        <div className="cli-seleccion" role="status">
          <span>
            {marcados.length} {marcados.length === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
          <button type="button" className="cli-boton-suave" onClick={() => setConfirmar(true)}>
            <Icono nombre="archivar" lado={15} /> Archivar
          </button>
          <button type="button" className="cli-boton-suave" onClick={() => setMarcados([])}>
            Quitar selección
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="cli-error" role="alert">
          {/* VACIO y ERROR son estados distintos. Decir "no hay clientes"
              cuando lo que fallo fue la red hace que alguien los capture otra
              vez. */}
          <p className="cli-error__que">No pudimos cargar los clientes.</p>
          <p className="cli-error__detalle">{error}</p>
          <button type="button" className="cli-boton-suave" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="cli-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los clientes</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="terapias-silueta cli-cargando__renglon" />
          ))}
        </div>
      ) : clientes.length === 0 ? (
        <div className="cli-vacio">
          <span className="cli-vacio__icono" aria-hidden="true">
            <Icono nombre="personas" lado={44} />
          </span>
          <p className="cli-vacio__titulo">
            {busqueda || estado || profesionalId
              ? 'Ningún cliente coincide con lo que buscas'
              : 'No hay clientes registrados'}
          </p>
          <p className="cli-vacio__texto">
            {busqueda || estado || profesionalId
              ? 'Prueba con otro nombre o quita los filtros.'
              : 'Comienza agregando tu primer cliente'}
          </p>
          {puedeGestionar && !busqueda && !estado && !profesionalId ? (
            <button type="button" className="cli-boton-principal" onClick={onNuevo}>
              <Icono nombre="mas" lado={16} /> Nuevo cliente
            </button>
          ) : null}
        </div>
      ) : vista === 'lista' ? (
        // El scroll horizontal vive DENTRO de la tabla, nunca en la pagina.
        <div className="cli-tabla__marco">
          <table className="cli-tabla">
            <thead>
              <tr>
                <th className="cli-tabla__marca">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    aria-label="Seleccionar todos los de esta página"
                    onChange={(e) => setMarcados(e.target.checked ? clientes.map((c) => c.id) : [])}
                  />
                </th>
                <th>Cliente</th>
                <th>Contacto</th>
                <th>Última visita</th>
                <th className="cli-tabla__numero">Visitas</th>
                <th>Estado</th>
                <th className="cli-tabla__acciones">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className={marcados.includes(c.id) ? 'cli-tabla__fila--marcada' : ''}>
                  <td className="cli-tabla__marca">
                    <input
                      type="checkbox"
                      checked={marcados.includes(c.id)}
                      aria-label={`Seleccionar a ${c.nombre}`}
                      onChange={() => alternar(c.id)}
                    />
                  </td>
                  <td>
                    <button type="button" className="cli-persona" onClick={() => onAccion('ver', c)}>
                      <span className="cli-persona__inicial" aria-hidden="true">
                        {iniciales(c.nombre)}
                      </span>
                      <span className="cli-persona__nombre">{c.nombre}</span>
                    </button>
                  </td>
                  <td>
                    <Contacto cliente={c} />
                  </td>
                  <td>
                    {c.ultimaVisita ?? <span className="cli-falta">Sin visitas</span>}
                  </td>
                  <td className="cli-tabla__numero">{c.visitas}</td>
                  <td>
                    <span className={`cli-estado cli-estado--${c.estado}`}>
                      {etiquetaDeEstadoDeCliente(c.estado)}
                    </span>
                  </td>
                  <td className="cli-tabla__acciones">
                    <MenuDeAcciones cliente={c} permisos={permisos} onAccion={onAccion} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="cli-cuadricula">
          {clientes.map((c) => (
            <li key={c.id}>
              <button type="button" className="cli-carta" onClick={() => onAccion('ver', c)}>
                <span className="cli-carta__inicial" aria-hidden="true">
                  {iniciales(c.nombre)}
                </span>
                <span className="cli-carta__nombre">{c.nombre}</span>
                <Contacto cliente={c} />
                <span className={`cli-estado cli-estado--${c.estado}`}>
                  {etiquetaDeEstadoDeCliente(c.estado)}
                </span>
                <span className="cli-carta__dato">
                  {c.visitas} {c.visitas === 1 ? 'visita' : 'visitas'}
                  {c.ultimaVisita ? ` · última ${c.ultimaVisita}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer className="cli-pie">
        <span className="cli-pie__cuenta">
          Mostrando {clientes.length} de {total} {total === 1 ? 'cliente' : 'clientes'}
        </span>

        <div className="cli-paginas" role="group" aria-label="Páginas">
          <button
            type="button"
            className="cli-paginas__boton"
            aria-label="Primera página"
            disabled={pagina <= 1}
            onClick={() => onPagina(1)}
          >
            «
          </button>
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
          <button
            type="button"
            className="cli-paginas__boton"
            aria-label="Última página"
            disabled={pagina >= paginas}
            onClick={() => onPagina(paginas)}
          >
            »
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

      <Confirmacion
        abierto={confirmar}
        titulo="Archivar clientes"
        confirmar="Archivar"
        destructivo
        onConfirmar={() => {
          onArchivarVarios(marcados);
          setMarcados([]);
          setConfirmar(false);
        }}
        onCancelar={() => setConfirmar(false)}
      >
        {/* Se dice QUE pasa, no "¿estas seguro?". Y se dice que no se borra
            nada: es lo que quita el miedo a usar el boton. */}
        <p>
          Se van a archivar {marcados.length}{' '}
          {marcados.length === 1 ? 'expediente' : 'expedientes'}. Salen de la lista, pero su
          historial de citas, ventas y cursos queda intacto y se pueden reactivar cuando quieras.
        </p>
      </Confirmacion>
    </section>
  );
}

/** Teléfono y correo, y cuando falta alguno se DICE en vez de dejar un guion. */
function Contacto({ cliente }: { readonly cliente: ClienteEnLista }) {
  if (!cliente.telefono && !cliente.correo) {
    return <span className="cli-falta">Sin datos de contacto</span>;
  }
  return (
    <span className="cli-contacto">
      {cliente.telefono ? <span className="cli-contacto__tel">{cliente.telefono}</span> : null}
      {cliente.correo ? <span className="cli-contacto__correo">{cliente.correo}</span> : null}
    </span>
  );
}
