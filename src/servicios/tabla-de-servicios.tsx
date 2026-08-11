/**
 * LA LISTA DEL CATALOGO: buscador, filtros, tabla y paginacion.
 *
 * EL BUSCADOR NO PIERDE EL FOCO. El campo se pinta SIEMPRE, en el mismo lugar
 * del arbol, y ningun componente se define dentro del render de otro —
 * definirlo adentro hace que React lo trate como nuevo en cada pulsacion y el
 * cursor se salga.
 *
 * EL MENU DE ACCIONES se cierra al tocar fuera y con Escape, y va por encima
 * de todo: el fallo del menu que oscurece el fondo y no aparece sale de un
 * z-index perdido en un contexto de apilamiento.
 *
 * LA PAGINACION ES DE VERDAD: el servidor devuelve la pagina Y el total.
 */

import { formatearMoneda } from '@neron/base/utils';
import { useEffect, useState } from 'react';
import type { Categoria, ServicioEnLista } from '../datos/servicios.js';
import { Icono } from '../ui/iconos.js';
import { MenuDeAcciones } from '../ui/menu.js';

export interface AccionDeServicio {
  readonly clave: string;
  readonly etiqueta: string;
  readonly capacidad: string | null;
}

/** Lo que no se puede hacer NO se muestra, ni en gris. */
export function accionesPara(
  permisos: Readonly<Record<string, boolean>>,
  servicio: ServicioEnLista,
): AccionDeServicio[] {
  const todas: AccionDeServicio[] = [
    { clave: 'ver', etiqueta: 'Ver detalle', capacidad: null },
    { clave: 'editar', etiqueta: 'Editar', capacidad: 'gestionarCatalogo' },
    { clave: 'duplicar', etiqueta: 'Duplicar', capacidad: 'gestionarCatalogo' },
    {
      clave: 'estado',
      // Un servicio apagado se enciende; uno encendido se apaga. Ofrecer
      // "Desactivar" sobre uno ya inactivo produce un error que se pudo evitar.
      etiqueta: servicio.activo ? 'Desactivar' : 'Activar',
      capacidad: 'gestionarCatalogo',
    },
  ];
  return todas.filter((a) => a.capacidad === null || permisos[a.capacidad] === true);
}

/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */

export interface PropiedadesDeTabla {
  readonly servicios: readonly ServicioEnLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly busqueda: string;
  readonly estado: string;
  readonly categoriaId: string;
  readonly categorias: readonly Categoria[];
  readonly filtrosAbiertos: boolean;
  readonly seleccionado: string | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly cargando: boolean;
  readonly error: string | null;
  onBuscar(texto: string): void;
  onEstado(estado: string): void;
  onCategoria(id: string): void;
  onFiltros(): void;
  onPagina(pagina: number): void;
  onPorPagina(cuantos: number): void;
  onAccion(clave: string, servicio: ServicioEnLista): void;
  onNuevo(): void;
  onReintentar(): void;
}

const POR_PAGINA = [10, 25, 50];

export function TablaDeServicios({
  servicios,
  total,
  pagina,
  porPagina,
  busqueda,
  estado,
  categoriaId,
  categorias,
  filtrosAbiertos,
  seleccionado,
  permisos,
  cargando,
  error,
  onBuscar,
  onEstado,
  onCategoria,
  onFiltros,
  onPagina,
  onPorPagina,
  onAccion,
  onNuevo,
  onReintentar,
}: PropiedadesDeTabla) {
  const paginas = Math.max(1, Math.ceil(total / Math.max(porPagina, 1)));
  const puedeGestionar = permisos['gestionarCatalogo'] === true;
  const hayFiltros = Boolean(busqueda || estado || categoriaId);
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;

  return (
    <section className="pz-tarjeta pz-tarjeta--lista" aria-labelledby="srv-lista-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="srv-lista-titulo">
          Lista de servicios
        </h3>
        <button
          type="button"
          className={`pz-enlace${filtrosAbiertos ? ' pz-boton--puesto' : ''}`}
          aria-expanded={filtrosAbiertos}
          onClick={onFiltros}
        >
          <Icono nombre="filtros" lado={14} /> Filtrar
        </button>
        <label className="pz-campo pz-campo--corto">
          <span className="neron-solo-lectores">Estado del servicio</span>
          <select value={estado} onChange={(e) => onEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </label>
      </header>

      {filtrosAbiertos ? (
        <div className="pz-filtros">
          <div className="pz-buscador">
            <span className="pz-buscador__lupa" aria-hidden="true">
              <Icono nombre="lupa" lado={16} />
            </span>
            {/* SIEMPRE pintado, en el mismo lugar del arbol: es lo que
                sostiene el foco mientras la tabla de abajo cambia. */}
            <input
              type="search"
              className="pz-buscador__campo"
              autoComplete="off"
              placeholder="Buscar servicio…"
              aria-label="Buscar servicio por nombre, descripción o categoría"
              value={busqueda}
              onChange={(e) => onBuscar(e.target.value)}
            />
          </div>
          <label className="pz-campo">
            <span className="tt-etiqueta">Categoría</span>
            <select value={categoriaId} onChange={(e) => onCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {error ? (
        <div className="pz-error" role="alert">
          {/* VACIO y ERROR son estados distintos: decir "no hay servicios"
              cuando lo que fallo fue la red hace que alguien los capture otra vez. */}
          <p className="pz-error__que">No pudimos cargar los servicios.</p>
          <p className="pz-error__detalle">{error}</p>
          <button type="button" className="pz-boton" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los servicios</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : servicios.length === 0 ? (
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="bolsa" lado={44} />
          </span>
          <p className="pz-vacio__titulo">
            {hayFiltros ? 'Ningún servicio coincide' : 'No hay servicios registrados'}
          </p>
          <p className="pz-vacio__texto">
            {hayFiltros
              ? 'Prueba con otro nombre o quita los filtros.'
              : 'Crea tu primer servicio para comenzar a gestionar citas y ventas.'}
          </p>
          {puedeGestionar && !hayFiltros ? (
            <button type="button" className="pz-boton pz-boton--principal" onClick={onNuevo}>
              <Icono nombre="mas" lado={16} /> Nuevo servicio
            </button>
          ) : null}
        </div>
      ) : (
        // El scroll horizontal vive DENTRO de la tabla, nunca en la pagina.
        <div className="pz-tabla__marco">
          <table className="pz-tabla">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Categoría</th>
                <th>Duración</th>
                <th className="pz-tabla__numero">Precio</th>
                <th>Estado</th>
                <th className="pz-tabla__acciones">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id} className={s.id === seleccionado ? 'pz-tabla__fila--marcada' : ''}>
                  <td>
                    <button type="button" className="pz-renglon" onClick={() => onAccion('ver', s)}>
                      <span
                        className="srv-marca"
                        aria-hidden="true"
                        // El color lo escoge quien captura el servicio: viene
                        // de la base, no de una paleta escrita aqui.
                        {...(s.color ? { style: { color: s.color } } : {})}
                      >
                        <Icono nombre="bolsa" lado={18} />
                      </span>
                      <span className="pz-renglon__cuerpo">
                        <span className="pz-renglon__titulo">{s.nombre}</span>
                        {/* Sin descripcion NO se inventa un texto: se deja el
                            renglon limpio. */}
                        {s.descripcion ? (
                          <span className="pz-renglon__pie">{s.descripcion}</span>
                        ) : null}
                      </span>
                    </button>
                  </td>
                  <td>
                    {s.categoria ? (
                      <span
                        className="srv-categoria"
                        {...(s.categoriaColor
                          ? { style: { color: s.categoriaColor, borderColor: s.categoriaColor } }
                          : {})}
                      >
                        {s.categoria}
                      </span>
                    ) : (
                      <span className="tt-falta">Sin categoría</span>
                    )}
                  </td>
                  <td>{s.duracionMin} min</td>
                  <td className="pz-tabla__numero">
                    {s.enPromocion ? (
                      <span className="srv-precio">
                        <span className="srv-precio__hoy">
                          {formatearMoneda(s.precioHoyCentavos)}
                        </span>
                        {/* El precio de lista tachado al lado: sin el, nadie
                            sabe que hay una promocion puesta. */}
                        <span className="srv-precio__antes">
                          {formatearMoneda(s.precioCentavos)}
                        </span>
                      </span>
                    ) : (
                      formatearMoneda(s.precioCentavos)
                    )}
                  </td>
                  <td>
                    <span className={`pz-pastilla pz-pastilla--${s.activo ? 'activo' : 'inactivo'}`}>
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="pz-tabla__acciones">
                    <MenuDeAcciones
                      de={s.nombre}
                      opciones={accionesPara(permisos, s)}
                      onEscoger={(clave) => onAccion(clave, s)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="pz-pie">
        <span className="pz-pie__cuenta">
          Mostrando {desde} a {desde === 0 ? 0 : desde + servicios.length - 1} de {total}{' '}
          {total === 1 ? 'servicio' : 'servicios'}
        </span>

        <div className="pz-paginas" role="group" aria-label="Páginas">
          <button
            type="button"
            className="pz-pagina"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            ‹
          </button>
          <span className="pz-paginas__actual" aria-live="polite">
            {pagina} de {paginas}
          </span>
          <button
            type="button"
            className="pz-pagina"
            aria-label="Página siguiente"
            disabled={pagina >= paginas}
            onClick={() => onPagina(pagina + 1)}
          >
            ›
          </button>
        </div>

        <label className="pz-campo pz-campo--corto">
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
