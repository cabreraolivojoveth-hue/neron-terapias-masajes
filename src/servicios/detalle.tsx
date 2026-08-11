/**
 * EL PANEL DE DETALLE DE UN SERVICIO, con sus cuatro pestañas.
 *
 * Las cuatro tienen contenido REAL o dicen que no lo hay. Una pestaña que
 * existe solo porque estaba en el diseño y adentro no tiene nada es peor que
 * no tenerla: se abre esperando algo y no se sabe si falta el dato o el codigo.
 *
 * · Informacion — lo que define el servicio hoy.
 * · Descripcion — lo que se le cuenta al paciente.
 * · Notas — lo interno, que al paciente no se le enseña.
 * · Historial — la BITACORA que ya existe, filtrada por este servicio. No hay
 *   una segunda auditoria: seria otra cosa mas que se puede desincronizar.
 */

import { formatearMoneda } from '@neron/base/utils';
import { useState, type ReactNode } from 'react';
import type { FichaDeServicio } from '../datos/servicios.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { Pista } from '../ui/pista.js';
import { duracionEnPalabras } from '../ui/fechas-en-palabras.js';
import { DIAS_DE_LA_SEMANA } from './formulario-de-servicio.js';

export type Pestana = 'informacion' | 'descripcion' | 'notas' | 'historial';

const PESTANAS: readonly { clave: Pestana; etiqueta: string }[] = [
  { clave: 'informacion', etiqueta: 'Información' },
  { clave: 'descripcion', etiqueta: 'Descripción' },
  { clave: 'notas', etiqueta: 'Notas' },
  { clave: 'historial', etiqueta: 'Historial' },
];

/**
 * Como se lee la disponibilidad.
 *
 * Sin dias marcados NO se inventa "Lunes a Domingo": se dice que sigue el
 * horario del centro. El diseño muestra un rango porque es un diseño; el
 * horario del centro lo administra Configuracion, que todavia no llega.
 */
export function comoSeLeeLaDisponibilidad(
  dias: string | null,
  desde: string | null,
  hasta: string | null,
): string {
  const marcados = DIAS_DE_LA_SEMANA.filter((d) => (dias ?? '').includes(d.clave));
  const horas = desde && hasta ? `${desde} a ${hasta}` : '';

  if (marcados.length === 0) {
    return horas
      ? `Todos los días, de ${horas}`
      : 'Según el horario del centro';
  }
  // Siete dias seguidos se dicen "todos los días" en vez de listar los siete.
  const nombres =
    marcados.length === 7 ? 'Todos los días' : marcados.map((d) => d.corto).join(', ');
  return horas ? `${nombres}, de ${horas}` : nombres;
}

/** Como se lee un renglon de la bitacora. */
export function comoSeLeeElCambio(accion: string): string {
  if (accion === 'crear') return 'Servicio creado';
  if (accion === 'editar') return 'Servicio modificado';
  return accion;
}

/** Que cambió de verdad entre dos versiones. Solo lo que cambio. */
export function loQueCambio(
  antes: Readonly<Record<string, unknown>> | null,
  despues: Readonly<Record<string, unknown>> | null,
): string[] {
  if (!antes || !despues) return [];
  const nombres: Readonly<Record<string, string>> = {
    nombre: 'el nombre',
    precio: 'el precio',
    duracion: 'la duración',
    activo: 'el estado',
    categoria: 'la categoría',
    promo: 'la promoción',
  };
  return Object.keys(nombres)
    .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
    .map((k) => nombres[k] ?? k);
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

export interface PropiedadesDelDetalle {
  readonly ficha: FichaDeServicio | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  onEditar(): void;
  onCambiarEstado(): void;
  onCerrar(): void;
}

export function DetalleDeServicio({
  ficha,
  cargando,
  error,
  permisos,
  onEditar,
  onCambiarEstado,
  onCerrar,
}: PropiedadesDelDetalle) {
  const [pestana, setPestana] = useState<Pestana>('informacion');
  const puedeGestionar = permisos['gestionarCatalogo'] === true;

  if (!ficha && !cargando && !error) {
    return <Pista texto="Toca un servicio para ver su ficha, su historial de cambios y las acciones." icono="flor" />;
  }

  return (
    <aside className="pz-tarjeta srv-detalle" aria-label="Detalle del servicio">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta">Detalle del servicio</h3>
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
          <p className="pz-error__que">No pudimos cargar el servicio.</p>
          <p className="pz-error__detalle">{error}</p>
        </div>
      ) : cargando || !ficha ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el servicio</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : (
        <>
          <div className="srv-detalle__cabeza">
            <span
              className="srv-detalle__marca"
              aria-hidden="true"
              {...(ficha.color ? { style: { color: ficha.color } } : {})}
            >
              <Icono nombre="bolsa" lado={24} />
            </span>
            <div className="srv-detalle__quien">
              <span className="srv-detalle__nombre">
                {ficha.nombre}
                <span className={`pz-pastilla pz-pastilla--${ficha.activo ? 'activo' : 'inactivo'}`}>
                  {ficha.activo ? 'Activo' : 'Inactivo'}
                </span>
              </span>
              {ficha.descripcion ? (
                <span className="srv-detalle__lema">{ficha.descripcion}</span>
              ) : null}
            </div>
          </div>

          <div className="pz-segmentos" role="tablist" aria-label="Secciones del servicio">
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

              <Renglon icono="reloj" titulo="Duración">
                {ficha.duracionMin} minutos
                <span className="tt-secundario"> · {duracionEnPalabras(ficha.duracionMin)}</span>
              </Renglon>

              <Renglon icono="dinero" titulo="Precio">
                {formatearMoneda(ficha.precioCentavos)}
              </Renglon>

              <Renglon icono="estrella" titulo="Precio promocional">
                {ficha.precioPromocionalCentavos === null ? (
                  <span className="tt-falta">Sin promoción</span>
                ) : (
                  <>
                    {formatearMoneda(ficha.precioPromocionalCentavos)}
                    {/* Se dice si la promocion esta VIGENTE hoy, no solo que
                        existe: una promocion que ya vencio sigue guardada, y
                        verla sin fecha hace creer que se esta cobrando. */}
                    <div className="tt-secundario">
                      {ficha.precioHoyCentavos === ficha.precioPromocionalCentavos
                        ? 'Vigente hoy'
                        : 'Fuera de vigencia hoy'}
                      {ficha.promocionDesde || ficha.promocionHasta
                        ? ` · ${ficha.promocionDesde ?? 'siempre'} a ${ficha.promocionHasta ?? 'sin fin'}`
                        : ' · sin fechas'}
                    </div>
                  </>
                )}
              </Renglon>

              <Renglon icono="calendario" titulo="Disponibilidad">
                {comoSeLeeLaDisponibilidad(ficha.diasDisponibles, ficha.horaDesde, ficha.horaHasta)}
              </Renglon>

              <Renglon icono="alerta" titulo="Requiere preparación">
                {ficha.requierePreparacion ? 'Sí' : 'No'}
                {ficha.requierePreparacion && ficha.preparacion ? (
                  <div className="tt-secundario">{ficha.preparacion}</div>
                ) : null}
              </Renglon>

              <Renglon icono="lugar" titulo="Color en agenda">
                {ficha.color ? (
                  <span className="srv-color">
                    <span
                      className="srv-color__muestra"
                      aria-hidden="true"
                      style={{ background: ficha.color }}
                    />
                    {ficha.color}
                  </span>
                ) : (
                  <span className="tt-falta">El del estado de la cita</span>
                )}
              </Renglon>

              <Renglon icono="barras" titulo="Citas">
                {ficha.citasCompletadas} completadas · {ficha.citasFuturas} agendadas
              </Renglon>
            </div>
          ) : null}

          {pestana === 'descripcion' ? (
            <div className="srv-detalle__cuerpo">
              {ficha.descripcion ? (
                // Como TEXTO, nunca como HTML: es lo que alguien escribio, y si
                // se interpretara podria romper la pantalla.
                <p className="tt-libre">{ficha.descripcion}</p>
              ) : (
                <p className="pz-vacio__texto">
                  Este servicio todavía no tiene descripción. Se ve en la lista y ayuda a quien
                  agenda a saber de qué se trata.
                </p>
              )}
            </div>
          ) : null}

          {pestana === 'notas' ? (
            <div className="srv-detalle__cuerpo">
              {ficha.notas ? (
                <p className="tt-libre">{ficha.notas}</p>
              ) : (
                <p className="pz-vacio__texto">
                  Sin notas internas. Aquí va lo que el equipo necesita recordar y al paciente no
                  se le enseña.
                </p>
              )}
            </div>
          ) : null}

          {pestana === 'historial' ? (
            <div className="srv-detalle__cuerpo">
              {/* "No puedes verlo" NO es lo mismo que "no existe". La bitacora
                  solo se le entrega a quien tiene permiso de auditoría; decir
                  "no hay cambios" a quien sí los tiene enseña a desconfiar de
                  todo lo demás que dice la pantalla. */}
              {!ficha.puedeVerHistorial ? (
                <p className="pz-vacio__texto">
                  Tu rol no tiene permiso para ver la bitácora del centro. Aquí van los cambios de
                  precio y de duración, con quién los hizo y cuándo.
                </p>
              ) : ficha.historial.length === 0 ? (
                <p className="pz-vacio__texto">Todavía no hay cambios registrados.</p>
              ) : (
                <ul className="srv-historial">
                  {ficha.historial.map((h, i) => {
                    const cambios = loQueCambio(h.antes, h.despues);
                    return (
                      <li key={`${h.cuando}:${i}`} className="srv-historial__renglon">
                        <span className="srv-historial__que">{comoSeLeeElCambio(h.accion)}</span>
                        {cambios.length > 0 ? (
                          <span className="tt-secundario">Cambió {cambios.join(', ')}</span>
                        ) : null}
                        <span className="tt-secundario">
                          {h.quien} · {h.cuando.slice(0, 10).split('-').reverse().join('/')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {puedeGestionar ? (
            <div className="srv-detalle__acciones">
              <button type="button" className="pz-boton pz-boton--principal" onClick={onEditar}>
                <Icono nombre="lapiz" lado={16} /> Editar servicio
              </button>
              <button
                type="button"
                className={ficha.activo ? 'srv-boton-peligro' : 'pz-boton'}
                onClick={onCambiarEstado}
              >
                <Icono nombre={ficha.activo ? 'prohibido' : 'palomita'} lado={16} />{' '}
                {ficha.activo ? 'Desactivar servicio' : 'Activar servicio'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}
