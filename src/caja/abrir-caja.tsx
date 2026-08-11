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

import { Boton, Campo, Modal } from '@neron/base/ui';
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
    <section className="cli-panel" aria-label="Sin caja abierta">
      <div className="cli-vacio">
        <span className="cli-vacio__icono" aria-hidden="true">
          <Icono nombre="dinero" lado={44} />
        </span>
        <p className="cli-vacio__titulo">Sin caja abierta</p>
        <p className="cli-vacio__texto">
          Abre una caja para empezar el turno. Mientras no haya una abierta no se puede cobrar en
          efectivo ni registrar gastos en efectivo — ese dinero quedaría fuera de todos los cortes.
        </p>
        <p className="cli-vacio__texto">
          Las ventas con tarjeta y transferencia sí se pueden cobrar: ese dinero no pasa por el
          cajón.
        </p>
        {puedeAbrir ? (
          <button type="button" className="cli-boton-principal" onClick={onAbrir}>
            <Icono nombre="mas" lado={16} /> Abrir nueva caja
          </button>
        ) : (
          <p className="cli-exp__secundario">
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
      <div className="cli-ficha">
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
        <div className="cli-exp__renglon">
          <span className="cli-exp__renglon-icono" aria-hidden="true">
            <Icono nombre="persona" lado={18} />
          </span>
          <div className="cli-exp__renglon-cuerpo">
            <span className="cli-exp__etiqueta">Responsable</span>
            <span className="cli-exp__valor">{quien}</span>
            <span className="cli-exp__secundario">
              Queda a tu nombre: es tu sesión la que abre la caja.
            </span>
          </div>
        </div>

        <p className="cli-ficha__duplicado-nota">
          El saldo inicial no se puede cambiar después de abrir. Si te equivocas, se corrige con un
          ingreso o un retiro — que sí deja rastro.
        </p>

        {error ? (
          <p className="cli-ficha__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="cli-ficha__pie">
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

        {problema ? <p className="cli-exp__secundario">{problema}</p> : null}
      </div>
    </Modal>
  );
}
