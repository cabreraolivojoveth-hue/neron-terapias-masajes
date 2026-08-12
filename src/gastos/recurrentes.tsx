/**
 * LOS GASTOS RECURRENTES: la plantilla, no el gasto.
 *
 * GUARDAR UNA PLANTILLA NO MUEVE NI UN PESO. La renta de diez mil al mes es
 * una configuracion; el gasto nace cuando llega su fecha. Si guardarla creara
 * el gasto de una vez, un centro que configura sus seis recurrentes un martes
 * amaneceria con seis gastos que nadie hizo.
 *
 * QUIEN LOS CREA ES LA BASE, y es idempotente: `(recurrente_id, periodo)` es
 * un indice unico, asi que correr la generacion diez veces —o dos pestañas a
 * la vez— crea el gasto de agosto UNA sola vez. Por eso se puede llamar al
 * abrir la pantalla sin miedo, y no hace falta un proceso aparte.
 *
 * PAUSAR NO ES FINALIZAR. Pausado se reanuda y conserva su proxima fecha;
 * finalizado se acabo. Con un solo interruptor "activo/inactivo" no habria
 * forma de distinguir "este mes no" de "ya no va mas".
 */

import { formatearMoneda } from '@neron/base/utils';
import {
  COMO_SE_DICE_EL_ESTADO,
  COMO_SE_DICE_LA_FRECUENCIA,
  type EstadoDeRecurrente,
  type GastoRecurrente,
} from '../datos/gastos.js';
import { Icono } from '../ui/iconos.js';
import { MenuDeAcciones } from '../ui/menu.js';

const TONO: Readonly<Record<EstadoDeRecurrente, string>> = {
  activo: 'exito',
  pausado: 'aviso',
  finalizado: 'peligro',
};

/**
 * Cuantos dias faltan para que toque. Negativo = ya se paso.
 *
 * Se compara texto contra texto con aritmetica de calendario, sin pasar por
 * `new Date(texto)`: eso interpreta en UTC y a quien esta en Mexico le corre
 * el dia una casilla.
 */
export function diasParaQueToque(proxima: string, hoy: string): number {
  const aNumero = (f: string): number => {
    const [d, m, a] = f.split('/').map(Number);
    if (!d || !m || !a) return NaN;
    return Date.UTC(a, m - 1, d);
  };
  const p = aNumero(proxima);
  const h = aNumero(hoy);
  if (!Number.isFinite(p) || !Number.isFinite(h)) return NaN;
  return Math.round((p - h) / 86_400_000);
}

/** Como se dice cuando toca, en palabras. */
export function cuandoToca(proxima: string, hoy: string): string {
  const dias = diasParaQueToque(proxima, hoy);
  if (!Number.isFinite(dias)) return proxima;
  if (dias < 0) return `Vencido desde el ${proxima}`;
  if (dias === 0) return 'Toca hoy';
  if (dias === 1) return 'Toca mañana';
  if (dias <= 30) return `En ${dias} días`;
  return `El ${proxima}`;
}

export interface PropiedadesDeRecurrentes {
  readonly recurrentes: readonly GastoRecurrente[];
  readonly hoy: string;
  readonly cargando: boolean;
  readonly puedeGestionar: boolean;
  /** `true` en el panel de la derecha: solo los proximos y sin acciones. */
  readonly resumido?: boolean;
  onNuevo(): void;
  onEditar(r: GastoRecurrente): void;
  onMarcar(r: GastoRecurrente, estado: EstadoDeRecurrente): void;
  onVerTodos?(): void;
}

export function Recurrentes({
  recurrentes,
  hoy,
  cargando,
  puedeGestionar,
  resumido = false,
  onNuevo,
  onEditar,
  onMarcar,
  onVerTodos,
}: PropiedadesDeRecurrentes) {
  // EN EL PANEL SOLO LOS QUE SIGUEN VIVOS. Un recurrente finalizado en la
  // barra lateral ocupa sitio para decir que ya no pasa nada.
  const lista = resumido
    ? recurrentes.filter((r) => r.estado === 'activo').slice(0, 5)
    : recurrentes;

  return (
    <section className="pz-tarjeta" aria-labelledby="gto-recurrentes-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="gto-recurrentes-titulo">
          Gastos recurrentes
        </h3>
        {resumido && onVerTodos ? (
          <button type="button" className="pz-enlace pz-enlace--pelado" onClick={onVerTodos}>
            Ver todos
          </button>
        ) : puedeGestionar ? (
          <button type="button" className="pz-enlace" onClick={onNuevo}>
            <Icono nombre="mas" lado={14} /> Nuevo
          </button>
        ) : null}
      </header>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando los gastos recurrentes</span>
          {[0, 1].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <div className="pz-vacio pz-vacio--chico">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="reloj" lado={22} />
          </span>
          <p className="pz-vacio__titulo">No hay gastos recurrentes</p>
          <p className="pz-vacio__texto">
            Configura un gasto recurrente para automatizar su seguimiento.
          </p>
          {puedeGestionar && !resumido ? (
            <button type="button" className="pz-boton" onClick={onNuevo}>
              <Icono nombre="mas" lado={16} /> Nuevo recurrente
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="pz-lista mv-escalonado">
          {lista.map((r) => (
            <li key={r.id} className="pz-renglon pz-renglon--quieto">
              <span className="pz-renglon__cuerpo">
                <span className="pz-renglon__titulo">{r.concepto}</span>
                <span className="pz-renglon__pie">
                  {formatearMoneda(r.montoCentavos)} ·{' '}
                  {COMO_SE_DICE_LA_FRECUENCIA[r.frecuencia]} ·{' '}
                  {r.estado === 'activo' ? cuandoToca(r.proximaFecha, hoy) : 'Sin próxima fecha'}
                </span>
              </span>

              {!resumido ? (
                <span className={`pz-pastilla pz-pastilla--${TONO[r.estado]}`}>
                  {COMO_SE_DICE_EL_ESTADO[r.estado]}
                </span>
              ) : null}

              {!resumido && puedeGestionar ? (
                <MenuDeAcciones
                  de={r.concepto}
                  opciones={[
                    { clave: 'editar', etiqueta: 'Editar', icono: 'lapiz' },
                    ...(r.estado === 'activo'
                      ? ([{ clave: 'pausado', etiqueta: 'Pausar', icono: 'prohibido' }] as const)
                      : []),
                    ...(r.estado === 'pausado'
                      ? ([{ clave: 'activo', etiqueta: 'Reanudar', icono: 'palomita' }] as const)
                      : []),
                    ...(r.estado !== 'finalizado'
                      ? ([
                          {
                            clave: 'finalizado',
                            etiqueta: 'Finalizar',
                            icono: 'archivar',
                            peligro: true,
                          },
                        ] as const)
                      : []),
                  ]}
                  onEscoger={(clave) => {
                    if (clave === 'editar') onEditar(r);
                    else onMarcar(r, clave as EstadoDeRecurrente);
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
