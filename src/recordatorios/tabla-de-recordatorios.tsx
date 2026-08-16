/**
 * LA TABLA DE RECORDATORIOS: buscador, filtros, orden, paginas y acciones.
 *
 * EL BUSCADOR NO PIERDE EL FOCO, y no es casualidad. Se cumplen cuatro reglas:
 *
 *  1. El campo esta SIEMPRE pintado, en el mismo sitio del arbol. Si viviera
 *     dentro de un `{cargando ? … : …}`, React lo destruiria y lo volveria a
 *     crear en cuanto cambiara el estado — y un campo destruido pierde el foco,
 *     el cursor y la seleccion. Es el fallo que ya costo en otros modulos.
 *  2. No lleva `key` que cambie. Una llave nueva es un elemento nuevo.
 *  3. El valor lo sostiene la PANTALLA, no esta tabla, y viaja hacia abajo. Un
 *     estado propio aqui se reiniciaria cada vez que el padre repintara.
 *  4. Lo que va al servidor es una copia RETRASADA de lo escrito (lo hace la
 *     pantalla). Escribir "HOLA" dispara una consulta, no cuatro, y ninguna
 *     respuesta tardia llega a repintar la lista debajo del dedo.
 *
 * LOS RENGLONES NO SE ANIMAN, a proposito. Uno que se acomoda solo mientras
 * alguien va a tocarlo hace que toque el de al lado — y aqui el de al lado
 * puede ser "Eliminar".
 *
 * LA PAGINACION ES DEL SERVIDOR. El pie dice el total de lo FILTRADO, que es lo
 * que llega en la misma respuesta: calcularlo aparte es como se acaba diciendo
 * "1 a 10 de 340" sobre una lista de doce.
 */

import { useId } from 'react';
import type { Fecha } from '@neron/base/utils';
import type { Categoria } from '../datos/categorias.js';
import type { ProfesionalBreve } from '../datos/citas.js';
import {
  COMO_SE_DICE_LA_ENTIDAD,
  COMO_SE_DICE_LA_PRIORIDAD,
  ENTIDADES,
  ORDENES,
  PRIORIDADES,
  horaEnPalabras,
  type ColumnaDeOrden,
  type PaginaDeRecordatorios,
  type RecordatorioEnLista,
} from '../datos/recordatorios.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { MenuDeAcciones, type OpcionDeMenu } from '../ui/menu.js';
import { etiquetaDeEstado, urgenciaDe } from './plazos.js';

/* ------------------------------------------------------------------ */
/* Los filtros                                                         */
/* ------------------------------------------------------------------ */

export type RangoDeFechas =
  | ''
  | 'hoy'
  | 'manana'
  | 'siete'
  | 'treinta'
  | 'vencidos'
  | 'personalizado';

export const RANGOS: readonly { readonly clave: RangoDeFechas; readonly etiqueta: string }[] = [
  { clave: '', etiqueta: 'Cualquier fecha' },
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: 'manana', etiqueta: 'Mañana' },
  { clave: 'siete', etiqueta: 'Próximos 7 días' },
  { clave: 'treinta', etiqueta: 'Próximos 30 días' },
  { clave: 'vencidos', etiqueta: 'Vencidos' },
  { clave: 'personalizado', etiqueta: 'Rango personalizado' },
];

export interface FiltrosDeRecordatorios {
  readonly categoriaId: string;
  readonly responsableId: string;
  readonly prioridad: string;
  readonly entidadTipo: string;
  readonly rango: RangoDeFechas;
  readonly desde: string;
  readonly hasta: string;
  readonly soloRecurrentes: boolean;
  readonly soloAutomaticos: boolean;
}

export const FILTROS_VACIOS: FiltrosDeRecordatorios = {
  categoriaId: '',
  responsableId: '',
  prioridad: '',
  entidadTipo: '',
  rango: '',
  desde: '',
  hasta: '',
  soloRecurrentes: false,
  soloAutomaticos: false,
};

export function hayFiltroPuesto(f: FiltrosDeRecordatorios): boolean {
  return (
    f.categoriaId !== '' ||
    f.responsableId !== '' ||
    f.prioridad !== '' ||
    f.entidadTipo !== '' ||
    f.rango !== '' ||
    f.soloRecurrentes ||
    f.soloAutomaticos
  );
}

/** Cuantos filtros hay puestos. Va en el boton para que se vea sin abrirlo. */
export function cuantosFiltros(f: FiltrosDeRecordatorios): number {
  return [
    f.categoriaId !== '',
    f.responsableId !== '',
    f.prioridad !== '',
    f.entidadTipo !== '',
    f.rango !== '',
    f.soloRecurrentes,
    f.soloAutomaticos,
  ].filter(Boolean).length;
}

/* ------------------------------------------------------------------ */
/* El icono de la relacion                                             */
/* ------------------------------------------------------------------ */

/**
 * El dibujo dice de que modulo nacio. Sin relacion, una campana.
 *
 * VIVE AQUI Y SE EXPORTA porque lo usan la tabla, el costado y el panel de
 * detalle. Tres copias es como los tres menus de tres puntos se quedaron sin
 * estilo el mismo dia.
 */
export function iconoDeEntidad(tipo: string | null): NombreDeIcono {
  if (tipo === 'cliente') return 'persona';
  if (tipo === 'cita') return 'calendario';
  if (tipo === 'venta') return 'bolsa';
  if (tipo === 'curso') return 'birrete';
  if (tipo === 'producto') return 'paquete';
  if (tipo === 'servicio') return 'flor';
  if (tipo === 'gasto') return 'moneda';
  return 'campana';
}

/**
 * Las acciones que se pueden hacer con ESE recordatorio, en ESE estado.
 *
 * LO QUE NO SE PUEDE HACER NO SE OFRECE, ni en gris. Un menu de opciones
 * apagadas es ruido, y de paso le cuenta a quien no debe que esas operaciones
 * existen. Reabrir solo aparece en lo cerrado; completar solo en lo abierto.
 */
export function accionesDe(r: RecordatorioEnLista, puedeGestionar: boolean): OpcionDeMenu[] {
  const opciones: OpcionDeMenu[] = [{ clave: 'ver', etiqueta: 'Ver detalle', icono: 'lupa' }];
  if (!puedeGestionar) return opciones;

  if (r.estado === 'pendiente') {
    opciones.push(
      { clave: 'completar', etiqueta: 'Marcar como completado', icono: 'palomita' },
      { clave: 'posponer', etiqueta: 'Posponer', icono: 'reloj' },
    );
  } else {
    opciones.push({ clave: 'reabrir', etiqueta: 'Reabrir', icono: 'volver' });
  }

  opciones.push(
    { clave: 'editar', etiqueta: 'Editar', icono: 'lapiz' },
    { clave: 'duplicar', etiqueta: 'Duplicar', icono: 'cuadricula' },
    { clave: 'responsable', etiqueta: 'Cambiar responsable', icono: 'personas' },
    { clave: 'prioridad', etiqueta: 'Cambiar prioridad', icono: 'alerta' },
    { clave: 'categoria', etiqueta: 'Cambiar categoría', icono: 'renglones' },
  );

  // ESCRIBIRLE SOLO APARECE SI HAY A QUIEN. Un "Enviar mensaje" en un
  // recordatorio de inventario abre Mensajes sin destinatario y deja a quien lo
  // toco preguntandose que hizo mal.
  if (r.entidadContacto !== null) {
    opciones.push({ clave: 'mensaje', etiqueta: 'Enviar mensaje', icono: 'mensaje' });
  }
  if (r.entidadTipo !== null && r.entidadId !== null) {
    opciones.push({
      clave: 'abrirEntidad',
      etiqueta: `Ver ${COMO_SE_DICE_LA_ENTIDAD[r.entidadTipo].toLowerCase()}`,
      icono: 'flecha',
    });
  }

  if (r.estado === 'pendiente') {
    opciones.push({ clave: 'cancelar', etiqueta: 'Cancelar', icono: 'prohibido' });
  }
  opciones.push({ clave: 'eliminar', etiqueta: 'Eliminar', icono: 'basura', peligro: true });
  return opciones;
}

/* ------------------------------------------------------------------ */
/* La tabla                                                            */
/* ------------------------------------------------------------------ */

export interface PropiedadesDeLaTabla {
  readonly pagina: PaginaDeRecordatorios | null;
  readonly hoy: Fecha;
  readonly busqueda: string;
  readonly filtros: FiltrosDeRecordatorios;
  readonly filtrosAbiertos: boolean;
  readonly orden: ColumnaDeOrden;
  readonly descendente: boolean;
  readonly porPagina: number;
  readonly categorias: readonly Categoria[];
  readonly responsables: readonly ProfesionalBreve[];
  readonly seleccionado: string | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly puedeGestionar: boolean;
  /** `true` cuando no hay NI UNO en todo el centro, no solo en este filtro. */
  readonly centroVacio: boolean;
  onBusqueda(texto: string): void;
  onFiltros(f: FiltrosDeRecordatorios): void;
  onAbrirFiltros(): void;
  onOrden(c: ColumnaDeOrden): void;
  onDescendente(v: boolean): void;
  onPagina(n: number): void;
  onPorPagina(n: number): void;
  onAbrir(id: string): void;
  onMarcar(r: RecordatorioEnLista, hecho: boolean): void;
  onAccion(clave: string, r: RecordatorioEnLista): void;
  onNuevo(): void;
  onExportar(): void;
  onReintentar(): void;
}

export function TablaDeRecordatorios({
  pagina,
  hoy,
  busqueda,
  filtros,
  filtrosAbiertos,
  orden,
  descendente,
  porPagina,
  categorias,
  responsables,
  seleccionado,
  cargando,
  error,
  puedeGestionar,
  centroVacio,
  onBusqueda,
  onFiltros,
  onAbrirFiltros,
  onOrden,
  onDescendente,
  onPagina,
  onPorPagina,
  onAbrir,
  onMarcar,
  onAccion,
  onNuevo,
  onExportar,
  onReintentar,
}: PropiedadesDeLaTabla) {
  const idFiltros = useId();

  const filas = pagina?.filas ?? [];
  const total = pagina?.total ?? 0;
  const enPagina = pagina?.pagina ?? 1;
  const paginas = Math.max(1, Math.ceil(total / Math.max(1, porPagina)));
  const desde = total === 0 ? 0 : (enPagina - 1) * porPagina + 1;
  const hasta = Math.min(enPagina * porPagina, total);

  const poner = <K extends keyof FiltrosDeRecordatorios>(
    k: K,
    v: FiltrosDeRecordatorios[K],
  ): void => {
    onFiltros({ ...filtros, [k]: v });
    // Cambiar un filtro vuelve a la primera pagina: quedarse en la 4 de una
    // lista que ahora tiene 2 enseña un vacio que parece un error.
    onPagina(1);
  };

  return (
    <section className="pz-tarjeta pz-tarjeta--lista" aria-labelledby="rec-lista-titulo">
      <h3 className="neron-solo-lectores" id="rec-lista-titulo">
        Lista de recordatorios
      </h3>

      {/* LA BARRA VA SIEMPRE PINTADA, cargue o no. Es lo que sostiene el foco
          del buscador mientras la lista de abajo cambia con cada letra. */}
      <div className="rec-barra">
        <div className="pz-buscador">
          <span className="pz-buscador__lupa" aria-hidden="true">
            <Icono nombre="lupa" lado={16} />
          </span>
          <input
            type="search"
            className="pz-buscador__campo"
            autoComplete="off"
            placeholder="Buscar recordatorio…"
            aria-label="Buscar por título, descripción, categoría, responsable o con qué se relaciona"
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
          />
        </div>

        {/* Los dos selectores que el diseño pone en la barra. Son filtros de
            verdad: cambian la consulta, no solo lo que se ve. */}
        <label className="pz-campo pz-campo--corto">
          <span className="neron-solo-lectores">Categoría</span>
          <select
            value={filtros.categoriaId}
            onChange={(e) => poner('categoriaId', e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="pz-campo pz-campo--corto">
          <span className="neron-solo-lectores">Responsable</span>
          <select
            value={filtros.responsableId}
            onChange={(e) => poner('responsableId', e.target.value)}
          >
            <option value="">Todos los responsables</option>
            {responsables.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={`pz-boton${hayFiltroPuesto(filtros) ? ' pz-boton--puesto' : ''}`}
          aria-expanded={filtrosAbiertos}
          aria-controls={idFiltros}
          onClick={onAbrirFiltros}
        >
          <Icono nombre="filtros" lado={16} /> Filtros
          {cuantosFiltros(filtros) > 0 ? (
            <span className="rec-cuenta">{cuantosFiltros(filtros)}</span>
          ) : null}
        </button>
      </div>

      {filtrosAbiertos ? (
        <div className="pz-filtros" id={idFiltros}>
          <label className="pz-campo">
            <span className="tt-etiqueta">Prioridad</span>
            <select value={filtros.prioridad} onChange={(e) => poner('prioridad', e.target.value)}>
              <option value="">Cualquiera</option>
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {COMO_SE_DICE_LA_PRIORIDAD[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="pz-campo">
            <span className="tt-etiqueta">Relacionado con</span>
            <select
              value={filtros.entidadTipo}
              onChange={(e) => poner('entidadTipo', e.target.value)}
            >
              <option value="">Cualquier cosa</option>
              {ENTIDADES.map((e) => (
                <option key={e} value={e}>
                  {COMO_SE_DICE_LA_ENTIDAD[e]}
                </option>
              ))}
            </select>
          </label>

          <label className="pz-campo">
            <span className="tt-etiqueta">Fecha</span>
            <select
              value={filtros.rango}
              onChange={(e) => poner('rango', e.target.value as RangoDeFechas)}
            >
              {RANGOS.map((r) => (
                <option key={r.clave} value={r.clave}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </label>

          {/* Los dos campos del rango solo aparecen cuando hacen falta. Dos
              campos de fecha vacios y sin efecto al lado de un selector que ya
              dice "Hoy" hacen dudar de cual manda. */}
          {filtros.rango === 'personalizado' ? (
            <>
              <label className="pz-campo">
                <span className="tt-etiqueta">Desde</span>
                <input
                  type="date"
                  value={aISOSeguro(filtros.desde)}
                  onChange={(e) => poner('desde', deISOSeguro(e.target.value))}
                />
              </label>
              <label className="pz-campo">
                <span className="tt-etiqueta">Hasta</span>
                <input
                  type="date"
                  value={aISOSeguro(filtros.hasta)}
                  onChange={(e) => poner('hasta', deISOSeguro(e.target.value))}
                />
              </label>
            </>
          ) : null}

          <label className="pz-campo">
            <span className="tt-etiqueta">Ordenar por</span>
            <select value={orden} onChange={(e) => onOrden(e.target.value as ColumnaDeOrden)}>
              {ORDENES.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="pz-campo rec-casilla">
            <input
              type="checkbox"
              checked={descendente}
              onChange={(e) => onDescendente(e.target.checked)}
            />
            <span>De lo más nuevo a lo más viejo</span>
          </label>

          <label className="pz-campo rec-casilla">
            <input
              type="checkbox"
              checked={filtros.soloRecurrentes}
              onChange={(e) => poner('soloRecurrentes', e.target.checked)}
            />
            <span>Solo los que se repiten</span>
          </label>

          <label className="pz-campo rec-casilla">
            <input
              type="checkbox"
              checked={filtros.soloAutomaticos}
              onChange={(e) => poner('soloAutomaticos', e.target.checked)}
            />
            <span>Solo los que creó una automatización</span>
          </label>

          <div className="pz-acciones">
            <button
              type="button"
              className="pz-boton"
              disabled={!hayFiltroPuesto(filtros)}
              onClick={() => {
                onFiltros(FILTROS_VACIOS);
                onPagina(1);
              }}
            >
              Limpiar filtros
            </button>
            <button type="button" className="pz-enlace" onClick={onExportar} disabled={total === 0}>
              <Icono nombre="archivar" lado={14} /> Exportar lo que se ve
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar los recordatorios.</p>
          <p className="pz-error__detalle">{error}</p>
          <button type="button" className="pz-boton" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los recordatorios</span>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="campana" lado={26} />
          </span>
          {/* SE DISTINGUE "NO HAY NADA" DE "NADA COINCIDE". Enseñar "No hay
              recordatorios" cuando en realidad hay cuarenta y el filtro dejo
              cero hace que alguien crea que perdio su trabajo. */}
          <p className="pz-vacio__titulo">
            {centroVacio ? 'No hay recordatorios' : 'Ningún recordatorio coincide'}
          </p>
          <p className="pz-vacio__texto">
            {centroVacio
              ? 'Los recordatorios que crees aparecerán aquí.'
              : 'Prueba con otro texto o quita algún filtro.'}
          </p>
          {centroVacio && puedeGestionar ? (
            <button type="button" className="pz-boton pz-boton--principal" onClick={onNuevo}>
              <Icono nombre="mas" lado={16} /> Nuevo recordatorio
            </button>
          ) : !centroVacio ? (
            <button
              type="button"
              className="pz-boton"
              onClick={() => {
                onFiltros(FILTROS_VACIOS);
                onBusqueda('');
                onPagina(1);
              }}
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="pz-tabla__marco">
            <table className="pz-tabla rec-tabla">
              <thead>
                <tr>
                  <th className="rec-tabla__marca">
                    <span className="neron-solo-lectores">Completado</span>
                  </th>
                  <th>Recordatorio</th>
                  <th>Categoría</th>
                  <th>Fecha y hora</th>
                  {/*
                    RELACIONADO Y RESPONSABLE NO SE RETIRAN: son dos de las ocho
                    columnas del diseño y las dos contestan la pregunta que se
                    hace quien mira la lista ("¿de quién es esto y de qué va?").
                    La que si se retira al estrecharse es PRIORIDAD, que es la
                    columna que se agrego despues y cuya informacion ya se ve en
                    la rayita del renglon.
                  */}
                  <th>Relacionado con</th>
                  <th>Responsable</th>
                  <th className="pz-tabla__opcional">Prioridad</th>
                  <th>Estado</th>
                  <th className="pz-tabla__acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r) => {
                  const estado = etiquetaDeEstado(r.estado, r.fecha, hoy);
                  const urgencia = urgenciaDe(r.estado, r.fecha, hoy);
                  return (
                    <tr
                      key={r.id}
                      className={[
                        seleccionado === r.id ? 'pz-tabla__fila--marcada' : '',
                        `rec-fila--${r.prioridad}`,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td className="rec-tabla__marca">
                        {/* MARCAR COMPLETA, DESMARCAR REABRE. Es la accion que
                            mas se usa y por eso esta a un solo toque; la
                            confirmacion se pide solo al eliminar, que es lo
                            unico que no se puede deshacer desde aqui. */}
                        <input
                          type="checkbox"
                          checked={r.estado === 'hecho'}
                          disabled={!puedeGestionar || r.estado === 'descartado'}
                          aria-label={
                            r.estado === 'hecho'
                              ? `Reabrir ${r.titulo}`
                              : `Marcar ${r.titulo} como completado`
                          }
                          onChange={(e) => onMarcar(r, e.target.checked)}
                        />
                      </td>

                      <td>
                        <span className="rec-titulo">
                          <span
                            className={`pz-ficha rec-ficha--${urgencia}`}
                            aria-hidden="true"
                          >
                            <Icono nombre={iconoDeEntidad(r.entidadTipo)} lado={18} />
                          </span>
                          <span className="rec-titulo__texto">
                            <button
                              type="button"
                              className="pz-renglon__enlace"
                              onClick={() => onAbrir(r.id)}
                            >
                              {r.titulo}
                            </button>
                            {r.detalle ? (
                              <span className="pz-renglon__pie">{r.detalle}</span>
                            ) : null}
                          </span>
                          {r.recurrenteId ? (
                            <span className="rec-marca" title="Se repite">
                              <Icono nombre="volver" lado={13} />
                              <span className="neron-solo-lectores">Se repite</span>
                            </span>
                          ) : null}
                        </span>
                      </td>

                      <td>
                        {r.categoria ? (
                          <span className="srv-categoria">{r.categoria}</span>
                        ) : (
                          <span className="tt-falta">Sin categoría</span>
                        )}
                      </td>

                      <td>
                        {/*
                          LA FECHA ARRIBA Y LA HORA DEBAJO, como en el diseño.
                          En una sola linea, "16/08/2026 · 02:00 p. m." mide
                          ciento cincuenta pixeles y empuja las dos ultimas
                          columnas fuera del marco — que lleva "overflow-x:
                          auto" y las RECORTA. La ultima columna es la de las
                          acciones.

                          El rojo es la SEGUNDA señal: la pastilla de estado ya
                          lo dice con palabras para quien no distinga el color.
                        */}
                        <span
                          className={
                            urgencia === 'vencido' || urgencia === 'hoy'
                              ? 'rec-cuando rec-cuando--urge'
                              : 'rec-cuando'
                          }
                        >
                          <span className="rec-cuando__dia">{r.fecha}</span>
                          {r.hora !== null ? (
                            <span className="rec-cuando__hora">{horaEnPalabras(r.hora)}</span>
                          ) : (
                            <span className="rec-cuando__hora">Todo el día</span>
                          )}
                        </span>
                      </td>

                      <td>
                        {r.entidadTipo && r.entidadId ? (
                          <button
                            type="button"
                            className="pz-renglon__enlace"
                            onClick={() => onAccion('abrirEntidad', r)}
                          >
                            {r.entidadNombre ?? COMO_SE_DICE_LA_ENTIDAD[r.entidadTipo]}
                          </button>
                        ) : (
                          <span className="tt-falta">—</span>
                        )}
                      </td>

                      <td>
                        {r.responsable ? (
                          <span className="rec-persona">
                            <span className="pz-inicial pz-inicial--chica" aria-hidden="true">
                              {inicialDe(r.responsable)}
                            </span>
                            {r.responsable}
                          </span>
                        ) : (
                          <span className="tt-falta">Sin asignar</span>
                        )}
                      </td>

                      <td className="pz-tabla__opcional">
                        <span className={`pz-pastilla rec-prioridad--${r.prioridad}`}>
                          {COMO_SE_DICE_LA_PRIORIDAD[r.prioridad]}
                        </span>
                      </td>

                      <td>
                        <span className={`pz-pastilla pz-pastilla--${estado.tono}`}>
                          {estado.texto}
                        </span>
                      </td>

                      <td className="pz-tabla__acciones">
                        <MenuDeAcciones
                          de={r.titulo}
                          opciones={accionesDe(r, puedeGestionar)}
                          onEscoger={(clave) => onAccion(clave, r)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pz-pie">
            <span className="pz-pie__cuenta">
              Mostrando {desde} a {hasta} de {total}{' '}
              {total === 1 ? 'recordatorio' : 'recordatorios'}
            </span>
            <div className="pz-paginas">
              <button
                type="button"
                className="pz-pagina"
                aria-label="Página anterior"
                disabled={enPagina <= 1}
                onClick={() => onPagina(enPagina - 1)}
              >
                ‹
              </button>
              <span className="pz-paginas__actual">
                {enPagina} de {paginas}
              </span>
              <button
                type="button"
                className="pz-pagina"
                aria-label="Página siguiente"
                disabled={enPagina >= paginas}
                onClick={() => onPagina(enPagina + 1)}
              >
                ›
              </button>
            </div>
            <label className="pz-campo pz-campo--corto">
              <span className="neron-solo-lectores">Recordatorios por página</span>
              <select value={porPagina} onChange={(e) => onPorPagina(Number(e.target.value))}>
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} por página
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ayudas de pintado                                                   */
/* ------------------------------------------------------------------ */

/** La inicial del nombre, para el circulito del responsable. */
export function inicialDe(nombre: string): string {
  const limpio = nombre.trim();
  return limpio === '' ? '?' : limpio[0]!.toUpperCase();
}

/**
 * `dd/mm/aaaa` → `aaaa-mm-dd` para el selector del navegador, sin reventar.
 *
 * Un campo vacio tiene que quedarse vacio: mandarle basura a un
 * `<input type="date">` lo deja en blanco sin decir nada y quien lo mira cree
 * que se le borro lo que escribio.
 */
export function aISOSeguro(fecha: string): string {
  const partes = fecha.split('/');
  if (partes.length !== 3) return '';
  const [d, m, a] = partes;
  if (!d || !m || !a) return '';
  return `${a}-${m}-${d}`;
}

export function deISOSeguro(iso: string): string {
  const partes = iso.split('-');
  if (partes.length !== 3) return '';
  const [a, m, d] = partes;
  if (!a || !m || !d) return '';
  return `${d}/${m}/${a}`;
}
