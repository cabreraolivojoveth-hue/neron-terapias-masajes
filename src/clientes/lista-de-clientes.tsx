/**
 * LA LISTA DE CLIENTES: el INDICE de la pantalla, no su contenido.
 *
 * POR QUE YA NO ES UNA TABLA, que es el cambio grande de este repaso:
 *
 * Habia tres formas de dibujar la misma lista —tabla de siete columnas,
 * cuadricula de tarjetas y un selector para cambiar entre ellas—. Tres maneras
 * de enseñar lo mismo es exactamente el error que el sistema de diseño existe
 * para evitar: cada una se desviaba un poco y ninguna era la del diseño.
 *
 * El diseño enseña UNA: una columna angosta de nombres, con la foto, el
 * telefono y el estado, al lado del expediente que se esta leyendo. La tabla
 * ancha obligaba a tapar la pantalla con un modal para leer a una persona, y
 * dejaba trescientos pixeles de blanco debajo porque ninguna fila los llenaba.
 *
 * Y POR ESO EL RENGLON YA NO LLEVA MENU DE TRES PUNTITOS. Sus ocho opciones
 * —editar, nueva cita, registrar venta, mensaje, recordatorio, curso,
 * archivar— viven todas en la ficha y en su columna de apoyo, que es donde se
 * esta cuando se decide hacer algo con alguien. Repetidas en el indice costaban
 * los pixeles que le faltaban al nombre: en trescientos de ancho salia "Adriana
 * V…", y un indice que no deja leer los nombres no es un indice.
 *
 * TRES COSAS QUE AQUI SE HACEN A PROPOSITO:
 *
 * 1. EL BUSCADOR NO PIERDE EL FOCO. El campo se pinta SIEMPRE, en el mismo
 *    lugar del arbol, y ningun componente se define dentro del render de otro.
 *    Definirlo adentro hace que React lo trate como un componente nuevo en
 *    cada pulsacion: destruye el campo, monta otro, y el cursor se sale. Es la
 *    queja de "escribo una letra y tengo que volver a hacer clic".
 *
 * 2. LAS CASILLAS DE SELECCION SE PIDEN. Archivar a diez de golpe es util y se
 *    conserva, pero seis casillas permanentes en una columna de trescientos
 *    pixeles se comen el sitio del nombre para una tarea que se hace una vez al
 *    mes. Se enseñan al apretar "Seleccionar".
 *
 * 3. LA PAGINACION ES DE VERDAD. El servidor devuelve la pagina Y el total: no
 *    se bajan mil clientes para enseñar diez.
 */

import { Confirmacion } from '@neron/base/ui';
import { useEffect, useState } from 'react';
import { etiquetaDeEstadoDeCliente, type ClienteEnLista } from '../datos/clientes.js';
import { Icono } from '../ui/iconos.js';

/** Las iniciales del avatar. Nunca una foto de archivo. */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '·';
  return ((palabras[0]?.[0] ?? '') + (palabras.length > 1 ? (palabras[1]?.[0] ?? '') : ''))
    .toUpperCase();
}

/* ------------------------------------------------------------------ */

export interface PropiedadesDeLista {
  readonly clientes: readonly ClienteEnLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly busqueda: string;
  readonly estado: string;
  readonly profesionalId: string;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly cargando: boolean;
  readonly error: string | null;
  /** Cual se esta leyendo, para marcarlo en el indice. */
  readonly seleccionado: string | null;
  onBuscar(texto: string): void;
  onPagina(pagina: number): void;
  onAccion(clave: string, cliente: ClienteEnLista): void;
  onNuevo(): void;
  onReintentar(): void;
  onArchivarVarios(ids: readonly string[]): void;
}

export function ListaDeClientes({
  clientes,
  total,
  pagina,
  porPagina,
  busqueda,
  estado,
  profesionalId,
  permisos,
  cargando,
  error,
  seleccionado,
  onBuscar,
  onPagina,
  onAccion,
  onNuevo,
  onReintentar,
  onArchivarVarios,
}: PropiedadesDeLista) {
  const [marcados, setMarcados] = useState<readonly string[]>([]);
  const [seleccionando, setSeleccionando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const paginas = Math.max(1, Math.ceil(total / Math.max(porPagina, 1)));
  const puedeGestionar = permisos['gestionarClientes'] === true;
  const hayFiltro = Boolean(busqueda || estado || profesionalId);

  // Al cambiar de pagina o de filtro, la seleccion se limpia. Guardarla
  // llevaria a archivar gente que ya ni se ve en la pantalla.
  useEffect(() => setMarcados([]), [pagina, busqueda, estado, profesionalId, porPagina]);

  const alternar = (id: string): void =>
    setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <section className="cli-indice pz-tarjeta" aria-labelledby="cli-indice-titulo">
      <header className="pz-cabecera">
        <div className="pz-dato">
          <h3 className="tt-tarjeta" id="cli-indice-titulo">
            Lista de clientes
          </h3>
          {/* El total sale del servidor CON los filtros puestos. Decir "156"
              cuando en pantalla hay tres filtrados haria dudar de los dos. */}
          <span className="tt-pie">
            {total} {total === 1 ? 'cliente' : 'clientes'}
            {hayFiltro ? ' con estos filtros' : ''}
          </span>
        </div>
        {puedeGestionar && clientes.length > 0 ? (
          <button
            type="button"
            className={`pz-enlace${seleccionando ? ' pz-boton--puesto' : ''}`}
            aria-pressed={seleccionando}
            onClick={() => {
              setSeleccionando((s) => !s);
              setMarcados([]);
            }}
          >
            {seleccionando ? 'Listo' : 'Seleccionar'}
          </button>
        ) : null}
      </header>

      <div className="pz-buscador">
        <span className="pz-buscador__lupa" aria-hidden="true">
          <Icono nombre="lupa" lado={16} />
        </span>
        {/*
          SIEMPRE PINTADO, en el mismo lugar. Es lo que sostiene el foco: lo
          unico que cambia debajo es la lista.
        */}
        <input
          type="search"
          className="pz-buscador__campo"
          autoComplete="off"
          placeholder="Buscar cliente…"
          aria-label="Buscar cliente por nombre, teléfono o correo"
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
        />
      </div>

      {seleccionando && marcados.length > 0 ? (
        <div className="cli-seleccion" role="status">
          <span>
            {marcados.length} {marcados.length === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
          <button type="button" className="pz-enlace" onClick={() => setConfirmar(true)}>
            <Icono nombre="archivar" lado={15} /> Archivar
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="pz-error" role="alert">
          {/* VACIO y ERROR son estados distintos. Decir "no hay clientes"
              cuando lo que fallo fue la red hace que alguien los capture otra
              vez. */}
          <p className="pz-error__que">No pudimos cargar los clientes.</p>
          <p className="pz-error__detalle">{error}</p>
          <button type="button" className="pz-boton" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los clientes</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : clientes.length === 0 ? (
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="personas" lado={26} />
          </span>
          <p className="pz-vacio__titulo">
            {hayFiltro ? 'Nadie coincide con lo que buscas' : 'Todavía no hay clientes'}
          </p>
          <p className="pz-vacio__texto">
            {hayFiltro
              ? 'Prueba con otro nombre o quita los filtros.'
              : 'En cuanto des de alta al primero, aparece aquí.'}
          </p>
          {puedeGestionar && !hayFiltro ? (
            <button type="button" className="pz-boton pz-boton--principal mv-levanta" onClick={onNuevo}>
              <Icono nombre="mas" lado={16} /> Nuevo cliente
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="pz-lista mv-escalonado">
          {clientes.map((c) => (
            <li key={c.id} className="cli-indice__fila">
              {seleccionando ? (
                <label className="cli-indice__marca">
                  <input
                    type="checkbox"
                    checked={marcados.includes(c.id)}
                    aria-label={`Seleccionar a ${c.nombre}`}
                    onChange={() => alternar(c.id)}
                  />
                </label>
              ) : null}

              <button
                type="button"
                className={`pz-renglon${seleccionado === c.id ? ' cli-indice__renglon--puesto' : ''}`}
                aria-current={seleccionado === c.id ? 'true' : undefined}
                onClick={() => onAccion('ver', c)}
              >
                <span className="pz-inicial" aria-hidden="true">
                  {iniciales(c.nombre)}
                </span>
                <span className="pz-renglon__cuerpo">
                  <span className="pz-renglon__titulo">{c.nombre}</span>
                  <span className="pz-renglon__pie">
                    {c.telefono ?? c.correo ?? 'Sin datos de contacto'}
                  </span>
                </span>
                {/*
                  LA PASTILLA Y LA FLECHA NO CABEN LAS DOS, y no hace falta que
                  quepan: en el renglon ABIERTO el estado ya se lee en grande al
                  lado del nombre de la ficha, asi que aqui sobra y su sitio se
                  lo queda la flecha. En los demas es al reves — no hay ficha
                  donde mirarlo, y la flecha no diria nada nuevo.

                  Es lo que arregla el nombre cortado: con las dos puestas, el
                  renglon abierto salia como "Adriana Villalob…".
                */}
                {seleccionado === c.id ? (
                  <span className="pz-renglon__flecha" aria-hidden="true">
                    <Icono nombre="flecha" lado={16} />
                  </span>
                ) : (
                  <span className={`pz-pastilla pz-pastilla--${c.estado}`}>
                    {etiquetaDeEstadoDeCliente(c.estado)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* El pie solo si hay mas de una pagina: unos botones apagados debajo de
          seis nombres son ruido que ademas ocupa un renglon. */}
      {paginas > 1 ? (
        <footer className="pz-pie">
          <span className="pz-pie__cuenta">
            Página {pagina} de {paginas}
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
        </footer>
      ) : null}

      <Confirmacion
        abierto={confirmar}
        titulo="Archivar clientes"
        confirmar="Archivar"
        destructivo
        onConfirmar={() => {
          onArchivarVarios(marcados);
          setMarcados([]);
          setSeleccionando(false);
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
