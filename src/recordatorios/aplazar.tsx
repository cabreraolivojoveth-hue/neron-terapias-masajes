/**
 * POSPONER — con opciones rápidas y una fecha a mano.
 *
 * POSPONER MUEVE LA FECHA DE VERDAD Y QUEDA ANOTADO. Un "posponer" que solo
 * esconde el renglón un rato es lo que más rápido destruye la confianza en una
 * lista de pendientes: al día siguiente vuelve a aparecer y nadie sabe si se
 * movió o no. Aquí se ve la fecha nueva antes de aceptar, y el historial guarda
 * de qué día a qué día.
 *
 * "MÁS TARDE" ES HOY, unas horas después — no mañana. Casi todas las listas de
 * pendientes lo traducen a mañana, y eso hace que quien solo quería quitárselo
 * de encima un rato lo pierda de vista todo el día. El cálculo vive en
 * `plazos.ts`, que es puro y se prueba sin navegador.
 */

import { Boton } from '@neron/base/ui';
import { useState } from 'react';
import type { Fecha, Hora24 } from '@neron/base/utils';
import type { RecordatorioEnLista } from '../datos/recordatorios.js';
import { Modal } from '../ui/modal.js';
import { cuandoEnPalabras, opcionesDeAplazamiento } from './plazos.js';
import { aISOSeguro, deISOSeguro } from './tabla-de-recordatorios.js';

export interface PropiedadesDeAplazar {
  readonly recordatorio: RecordatorioEnLista | null;
  readonly hoy: Fecha;
  readonly ahora: Date;
  readonly trabajando: boolean;
  readonly error: string | null;
  onAplazar(fecha: Fecha, hora: Hora24 | null): void;
  onCerrar(): void;
}

export function Aplazar({
  recordatorio: r,
  hoy,
  ahora,
  trabajando,
  error,
  onAplazar,
  onCerrar,
}: PropiedadesDeAplazar) {
  const [fechaLibre, setFechaLibre] = useState('');
  const [horaLibre, setHoraLibre] = useState('');

  if (r === null) return null;

  const rapidas = opcionesDeAplazamiento(hoy, ahora, r.hora);

  return (
    <Modal
      abierto
      titulo="Posponer recordatorio"
      bloqueado={trabajando}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton tono="contorno" type="button" onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </Boton>
          <Boton
            tono="principal"
            type="button"
            trabajando={trabajando}
            disabled={fechaLibre === ''}
            onClick={() => onAplazar(fechaLibre as Fecha, horaLibre === '' ? r.hora : horaLibre)}
          >
            Posponer a esa fecha
          </Boton>
        </>
      }
    >
      <div className="rec-aplazar">
        <p className="pz-dato__valor">
          <strong>{r.titulo}</strong>
          <br />
          <span className="tt-secundario">Ahora está para {cuandoEnPalabras(r.fecha, r.hora)}.</span>
        </p>

        <h4 className="tt-etiqueta">Rápido</h4>
        <div className="rec-aplazar__rapidas">
          {rapidas.map((o) => (
            <button
              key={o.clave}
              type="button"
              className="pz-boton"
              disabled={trabajando}
              onClick={() => onAplazar(o.fecha, o.hora)}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>

        <h4 className="tt-etiqueta">O escoge la fecha</h4>
        <div className="pz-dos">
          <label className="pz-campo">
            <span className="tt-etiqueta">Fecha</span>
            <input
              type="date"
              value={aISOSeguro(fechaLibre)}
              onChange={(e) => setFechaLibre(deISOSeguro(e.target.value))}
            />
          </label>
          <label className="pz-campo">
            <span className="tt-etiqueta">Hora</span>
            <input
              type="time"
              value={horaLibre}
              onChange={(e) => setHoraLibre(e.target.value)}
            />
            {/* Sin tocar la hora se CONSERVA la que tenia. Ponerla en blanco al
                posponer convertiria un recordatorio de las 10 en uno de todo el
                dia sin que nadie lo pidiera. */}
            <span className="tt-secundario">
              {r.hora === null ? 'Ahora es de todo el día.' : `Si la dejas vacía, sigue a las ${r.hora}.`}
            </span>
          </label>
        </div>

        {error ? (
          <p className="pz-error__que" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
