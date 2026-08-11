/**
 * UNA SECCION QUE SE PLIEGA — una para todo el programa.
 *
 * POR QUE EXISTE: el alta de cliente tenia un boton pelon que decia
 * "+ Información adicional". Era un `button` sin una sola clase del sistema:
 * texto suelto con un signo de mas escrito a mano, al lado de campos y botones
 * que si estaban vestidos. Se veia como algo que se quedo a medias — y encima
 * era la puerta a la mitad del formulario.
 *
 * QUE PIDE UNA SECCION PLEGABLE PARA SER USABLE, y ninguna de las cuatro se
 * cumplia:
 *
 *   1. Que se vea que SE PUEDE ABRIR antes de tocarla: de ahi la flecha, que
 *      gira al abrir en vez de cambiar el texto del boton.
 *   2. Que diga QUE HAY DENTRO sin abrirla. "Información adicional" no dice
 *      nada; "Ficha de salud — lo que hay que saber antes de una sesión" si.
 *   3. Que el lector de pantalla sepa que lo de abajo depende de ella
 *      (`aria-expanded` y `aria-controls`).
 *   4. Que lo de dentro ENTRE, en vez de aparecer de golpe y empujar el resto.
 *
 * SE PLIEGA DE VERDAD —el contenido no se pinta cuando esta cerrado— y no se
 * esconde con CSS. Un formulario con veinte campos ocultos manda veinte campos
 * al guardar aunque no se hayan visto, y ademas el foco de teclado se cae dentro
 * de algo invisible.
 */

import { useId, type ReactNode } from 'react';
import { Icono } from './iconos.js';

export interface PropiedadesDelPlegable {
  readonly titulo: string;
  /** Que hay dentro, para no tener que abrirlo para saberlo. */
  readonly detalle?: string;
  readonly abierto: boolean;
  onAlternar(): void;
  readonly children: ReactNode;
}

export function Plegable({
  titulo,
  detalle,
  abierto,
  onAlternar,
  children,
}: PropiedadesDelPlegable) {
  const id = useId();

  return (
    <section className={`pz-plegable${abierto ? ' pz-plegable--abierto' : ''}`}>
      <button
        type="button"
        className="pz-plegable__tirador"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={onAlternar}
      >
        <span className="pz-plegable__texto">
          <span className="pz-plegable__titulo">{titulo}</span>
          {detalle ? <span className="pz-plegable__detalle">{detalle}</span> : null}
        </span>
        {/* La flecha gira: es lo que dice "esto se abre" sin gastar palabras. */}
        <span className="pz-plegable__flecha" aria-hidden="true">
          <Icono nombre="flecha" lado={16} />
        </span>
      </button>

      {abierto ? (
        <div className="pz-plegable__cuerpo" id={id}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
