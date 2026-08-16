/**
 * EL COSTADO DERECHO: el resumen, lo que viene, las acciones rápidas y el
 * consejo.
 *
 * LA DONA SE DIBUJA CON LOS CUATRO NUMEROS DE VERDAD, y si los cuatro son cero
 * NO SE DIBUJA. Un anillo repartido a partes iguales sobre un centro sin
 * recordatorios es un grafico que miente en la unica dirección que importa:
 * hacia arriba. En su lugar se dice que todavía no hay nada.
 *
 * ES UN SVG A MANO, sin biblioteca. Cuatro arcos caben en treinta lineas de
 * `stroke-dasharray`, y una biblioteca de graficas son doscientos kilobytes y
 * un modelo mental que hay que mantener seis años. La regla del producto: cada
 * dependencia nueva se paga todos los meses.
 *
 * NINGUNA ACCION RAPIDA ES DECORATIVA. Las cuatro del diseño hacen las cuatro
 * cosas que prometen; si alguna no se pudiera, no estaria.
 */

import type { Fecha } from '@neron/base/utils';
import {
  COMO_SE_DICE_LA_ENTIDAD,
  type ProximoRecordatorio,
  type ResumenDeRecordatorios,
} from '../datos/recordatorios.js';
import { Icono } from '../ui/iconos.js';
import { cuandoEnPalabras, urgenciaDe } from './plazos.js';
import { iconoDeEntidad } from './tabla-de-recordatorios.js';

/* ------------------------------------------------------------------ */
/* La dona                                                             */
/* ------------------------------------------------------------------ */

export interface TrozoDeLaDona {
  readonly clave: string;
  readonly etiqueta: string;
  readonly cuantos: number;
  /** La clase que le pone el color. Los colores viven en la hoja, no aquí. */
  readonly tono: string;
}

/**
 * Los cuatro trozos, en el orden del diseño.
 *
 * SON LOS MISMOS CUATRO NUMEROS DE LAS TARJETAS DE ARRIBA. Si la dona contara
 * otra cosa —por ejemplo, incluyendo los cancelados en "pendientes"— habría dos
 * cifras distintas de lo mismo en la misma pantalla, y quien la mire no sabrá
 * cuál creer.
 */
export function trozosDeLaDona(r: ResumenDeRecordatorios): TrozoDeLaDona[] {
  return [
    { clave: 'pendientes', etiqueta: 'Pendientes', cuantos: r.pendientes, tono: 'ventas' },
    { clave: 'hoy', etiqueta: 'Hoy', cuantos: r.hoy, tono: 'productos' },
    { clave: 'proximos', etiqueta: 'Próximos', cuantos: r.proximos, tono: 'cursos' },
    { clave: 'completados', etiqueta: 'Completados', cuantos: r.completados, tono: 'citas' },
  ];
}

/** El perímetro del anillo. Se usa para repartir los arcos. */
const VUELTA = 2 * Math.PI * 42;

export function Dona({ trozos }: { readonly trozos: readonly TrozoDeLaDona[] }) {
  const suma = trozos.reduce((s, t) => s + t.cuantos, 0);
  if (suma === 0) return null;

  let recorrido = 0;

  return (
    <svg
      className="rec-dona"
      viewBox="0 0 100 100"
      role="img"
      aria-label={trozos.map((t) => `${t.etiqueta}: ${t.cuantos}`).join(', ')}
    >
      {trozos.map((t) => {
        if (t.cuantos === 0) return null;
        const largo = (t.cuantos / suma) * VUELTA;
        // El arco empieza donde termino el anterior. Se gira -90 grados para
        // que el primero arranque arriba y no a la derecha, que es como se lee.
        const desfase = -recorrido;
        recorrido += largo;
        return (
          <circle
            key={t.clave}
            className={`rec-dona__arco rec-dona__arco--${t.tono}`}
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="14"
            strokeDasharray={`${largo} ${VUELTA - largo}`}
            strokeDashoffset={desfase}
            transform="rotate(-90 50 50)"
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* El costado entero                                                   */
/* ------------------------------------------------------------------ */

export interface PropiedadesDelCostado {
  readonly resumen: ResumenDeRecordatorios | null;
  readonly hoy: Fecha;
  readonly cargando: boolean;
  readonly puedeGestionar: boolean;
  readonly puedeConfigurar: boolean;
  onAbrir(r: ProximoRecordatorio): void;
  onVerTodos(): void;
  onNuevo(): void;
  onNuevoRecurrente(): void;
  onCategorias(): void;
  onHistorialCompletado(): void;
}

/**
 * EL CONSEJO DEL DIA NO FINGE INTELIGENCIA.
 *
 * O es el texto que el centro configuro, o es una frase fija del producto. Lo
 * que NO hace es presentarse como un analisis: un sistema que dice "detecté que
 * sueles posponer los martes" sin haber mirado nada es la clase de mentira que,
 * cuando se descubre, hace dudar de las cifras de al lado.
 */
export const CONSEJO_DEL_PRODUCTO =
  'Organiza tus recordatorios por prioridad para no perder de vista lo más importante.';

export function CostadoDeRecordatorios({
  resumen,
  hoy,
  cargando,
  puedeGestionar,
  puedeConfigurar,
  onAbrir,
  onVerTodos,
  onNuevo,
  onNuevoRecurrente,
  onCategorias,
  onHistorialCompletado,
}: PropiedadesDelCostado) {
  const trozos = resumen ? trozosDeLaDona(resumen) : [];
  const hayAlgo = trozos.some((t) => t.cuantos > 0);
  const proximos = resumen?.proximosRecordatorios ?? [];

  return (
    <div className="rec-costado">
      <section className="pz-tarjeta" aria-labelledby="rec-resumen-titulo">
        <h3 className="tt-tarjeta" id="rec-resumen-titulo">
          Resumen de recordatorios
        </h3>

        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <span className="neron-solo-lectores">Cargando el resumen</span>
            <div className="pz-silueta pz-silueta--alta" />
          </div>
        ) : !hayAlgo ? (
          // ESTADO VACIO EN LUGAR DE UN GRAFICO FALSO. Ver la cabecera.
          <div className="pz-vacio pz-vacio--chico">
            <span className="pz-vacio__icono" aria-hidden="true">
              <Icono nombre="pastel" lado={22} />
            </span>
            <p className="pz-vacio__texto">
              Cuando tengas recordatorios, aquí verás cómo se reparten.
            </p>
          </div>
        ) : (
          <div className="rec-resumen">
            <Dona trozos={trozos} />
            <ul className="rec-leyenda">
              {trozos.map((t) => (
                <li key={t.clave} className="rec-leyenda__renglon">
                  <span
                    className={`rec-leyenda__punto rec-leyenda__punto--${t.tono}`}
                    aria-hidden="true"
                  />
                  <span className="rec-leyenda__que">{t.etiqueta}</span>
                  <strong className="rec-leyenda__cuanto">{t.cuantos}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {resumen && hayAlgo ? (
          <p className="pz-totales">
            <span className="pz-totales__total">Total</span>
            <strong>{resumen.total}</strong>
          </p>
        ) : null}

        {/* EL PROMEDIO SOLO SALE CUANDO HAY CON QUE CALCULARLO. Ver el `null`
            del resumen: un "0 h" de un centro que no ha cerrado ni uno se lee
            como que todo se resuelve al instante. */}
        {resumen?.horasPromedio !== null && resumen !== null ? (
          <p className="tt-secundario">
            Se resuelven en {resumen.horasPromedio} h de promedio.
          </p>
        ) : null}
      </section>

      <section className="pz-tarjeta" aria-labelledby="rec-proximos-titulo">
        <header className="pz-cabecera">
          <h3 className="tt-tarjeta" id="rec-proximos-titulo">
            Próximos recordatorios
          </h3>
        </header>

        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <span className="neron-solo-lectores">Cargando lo que viene</span>
            {[0, 1].map((i) => (
              <div key={i} className="pz-silueta" />
            ))}
          </div>
        ) : proximos.length === 0 ? (
          <p className="pz-vacio__texto">No hay recordatorios próximos.</p>
        ) : (
          <>
            <ul className="pz-lista mv-escalonado">
              {proximos.map((p) => {
                const urgencia = urgenciaDe('pendiente', p.fecha, hoy);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="pz-renglon"
                      onClick={() => onAbrir(p)}
                    >
                      <span className={`pz-ficha rec-ficha--${urgencia}`} aria-hidden="true">
                        <Icono nombre={iconoDeEntidad(p.entidadTipo)} lado={18} />
                      </span>
                      <span className="pz-renglon__cuerpo">
                        <span className="pz-renglon__titulo">{p.titulo}</span>
                        <span className="pz-renglon__pie">
                          {p.entidadNombre ??
                            (p.entidadTipo ? COMO_SE_DICE_LA_ENTIDAD[p.entidadTipo] : null) ??
                            p.categoria ??
                            'Sin relación'}
                        </span>
                      </span>
                      <span
                        className={
                          urgencia === 'vencido' || urgencia === 'hoy'
                            ? 'rec-cuando rec-cuando--urge'
                            : 'rec-cuando'
                        }
                      >
                        {cuandoEnPalabras(p.fecha, p.hora)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="pz-boton pz-boton--ancho" onClick={onVerTodos}>
              Ver todos
            </button>
          </>
        )}
      </section>

      <section className="pz-tarjeta" aria-labelledby="rec-rapidas-titulo">
        <h3 className="tt-tarjeta" id="rec-rapidas-titulo">
          Acciones rápidas
        </h3>
        <div className="rec-rapidas">
          {puedeGestionar ? (
            <>
              <button type="button" className="pz-boton" onClick={onNuevo}>
                <Icono nombre="mas" lado={16} /> Nuevo recordatorio
              </button>
              <button type="button" className="pz-boton" onClick={onNuevoRecurrente}>
                <Icono nombre="volver" lado={16} /> Recordatorio recurrente
              </button>
            </>
          ) : null}
          {puedeConfigurar ? (
            <button type="button" className="pz-boton" onClick={onCategorias}>
              <Icono nombre="renglones" lado={16} /> Categorías
            </button>
          ) : null}
          <button type="button" className="pz-boton" onClick={onHistorialCompletado}>
            <Icono nombre="archivar" lado={16} /> Historial completado
          </button>
        </div>
      </section>

      <section className="pz-tarjeta rec-consejo" aria-labelledby="rec-consejo-titulo">
        <div>
          <h3 className="tt-tarjeta" id="rec-consejo-titulo">
            Consejo del día
          </h3>
          <p className="tt-secundario">{resumen?.consejo ?? CONSEJO_DEL_PRODUCTO}</p>
        </div>
        <span className="rec-consejo__hoja" aria-hidden="true">
          <Icono nombre="flor" lado={30} />
        </span>
      </section>
    </div>
  );
}
