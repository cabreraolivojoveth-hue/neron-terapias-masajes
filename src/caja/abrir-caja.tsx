/**
 * SIN CAJA ABIERTA, Y COMO SE ABRE.
 *
 * EL ESTADO VACIO NO ES UN ERROR. Un centro que todavia no abre caja es lo
 * normal a las ocho de la mañana: la pantalla lo dice y ofrece abrirla, en vez
 * de enseñar ceros que se leen como "hoy no se vendio nada".
 *
 * Y DICE QUE PASA MIENTRAS TANTO, porque es lo que de verdad importa saber:
 * sin caja abierta no se puede cobrar en efectivo. Enterarse de eso con el
 * cliente enfrente y el billete en la mano es el peor momento.
 */

import { Boton, Campo } from '@neron/base/ui';
import { Modal } from '../ui/modal.js';
import { formatearMoneda } from '@neron/base/utils';
import { useState } from 'react';
import { centavosDeLoEscrito, type LoQueAbreUnaCaja } from '../datos/caja.js';
import { Icono } from '../ui/iconos.js';

/** Lo que impide abrir la caja. Cadena vacia = se puede. */
export function porQueNoSePuedeAbrir(nombre: string): string {
  if (!nombre.trim()) return 'Ponle un nombre para distinguirla en el historial.';
  return '';
}

export function SinCajaAbierta({
  puedeAbrir,
  onAbrir,
}: {
  readonly puedeAbrir: boolean;
  onAbrir(): void;
}) {
  return (
    <section className="pz-tarjeta" aria-label="Sin caja abierta">
      <div className="pz-vacio">
        <span className="pz-vacio__icono" aria-hidden="true">
          <Icono nombre="dinero" lado={44} />
        </span>
        <p className="pz-vacio__titulo">Sin caja abierta</p>
        <p className="pz-vacio__texto">
          Abre una caja para empezar el turno. Mientras no haya una abierta no se puede cobrar en
          efectivo ni registrar gastos en efectivo — ese dinero quedaría fuera de todos los cortes.
        </p>
        <p className="pz-vacio__texto">
          Las ventas con tarjeta y transferencia sí se pueden cobrar: ese dinero no pasa por el
          cajón.
        </p>
        {puedeAbrir ? (
          <button type="button" className="pz-boton pz-boton--principal" onClick={onAbrir}>
            <Icono nombre="mas" lado={16} /> Abrir nueva caja
          </button>
        ) : (
          <p className="tt-secundario">
            Tu rol no abre caja. Quien administra las finanzas del centro puede hacerlo.
          </p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export interface PropiedadesDeAbrir {
  readonly abierto: boolean;
  readonly quien: string;
  readonly trabajando: boolean;
  readonly error: string | null;
  onAbrir(datos: LoQueAbreUnaCaja): void;
  onCerrar(): void;
}

export function FormularioDeApertura({
  abierto,
  quien,
  trabajando,
  error,
  onAbrir,
  onCerrar,
}: PropiedadesDeAbrir) {
  const [nombre, setNombre] = useState('');
  const [saldo, setSaldo] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const problema = porQueNoSePuedeAbrir(nombre);
  const saldoCentavos = centavosDeLoEscrito(saldo);

  return (
    <Modal abierto={abierto} titulo="Abrir nueva caja" onCerrar={onCerrar}>
      <div className="pz-columna">
        <Campo
          etiqueta="Nombre de la caja"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          obligatorio
          maxLength={60}
          ayuda="Para distinguirla en el historial: “Mostrador”, “Turno de la tarde”."
        />

        <Campo
          etiqueta="Saldo inicial"
          type="text"
          inputMode="numeric"
          value={saldo}
          onChange={(e) => setSaldo(e.target.value.replace(/[^\d]/g, ''))}
          numerico
          ayuda={`El efectivo con el que empieza el cajón. Ahora mismo: ${formatearMoneda(saldoCentavos)}.`}
        />

        <Campo
          etiqueta="Observaciones"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          maxLength={300}
        />

        {/* EL RESPONSABLE SALE DE LA SESION, no de un campo. Escribirlo a mano
            dejaria abrir la caja a nombre de otra persona. */}
        <div className="pz-renglon pz-renglon--quieto">
          <span className="pz-ficha" aria-hidden="true">
            <Icono nombre="persona" lado={18} />
          </span>
          <div className="pz-dato">
            <span className="tt-etiqueta">Responsable</span>
            <span className="pz-dato__valor">{quien}</span>
            <span className="tt-secundario">
              Queda a tu nombre: es tu sesión la que abre la caja.
            </span>
          </div>
        </div>

        <p className="tt-secundario">
          El saldo inicial no se puede cambiar después de abrir. Si te equivocas, se corrige con un
          ingreso o un retiro — que sí deja rastro.
        </p>

        {error ? (
          <p className="pz-error__que" role="alert">
            {error}
          </p>
        ) : null}

        <div className="pz-ficha__pie">
          <Boton tono="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            tono="principal"
            type="button"
            trabajando={trabajando}
            disabled={problema !== '' || trabajando}
            onClick={() =>
              onAbrir({
                nombre,
                saldoInicialCentavos: saldoCentavos,
                observaciones,
              })
            }
          >
            Abrir caja
          </Boton>
        </div>

        {problema ? <p className="tt-secundario">{problema}</p> : null}
      </div>
    </Modal>
  );
}
