/**
 * REGISTRAR UN INGRESO O UN RETIRO A MANO.
 *
 * ES LO UNICO QUE SE CAPTURA A MANO EN TODA LA CAJA. Los movimientos de venta
 * los escribe `registrar_venta` y los de gasto un disparador — si aqui se
 * pudieran meter ingresos sueltos, la caja dejaria de cuadrar con las ventas
 * el primer dia y nadie sabria por que.
 *
 * NO SE RETIRA MAS EFECTIVO DEL QUE HAY, y se avisa ANTES de apretar. El
 * servidor lo vuelve a comprobar —es el que manda— pero enterarse al final,
 * con el dinero ya contado, es el peor momento.
 *
 * UN RETIRO POR TRANSFERENCIA NO TOCA EL CAJON. Se permite porque existe
 * —mandar dinero al banco es un egreso real— pero no baja el efectivo, y la
 * pantalla lo dice para que nadie lo busque en el corte.
 */

import { Boton, Campo } from '@neron/base/ui';
import { Modal } from '../ui/modal.js';
import { formatearMoneda } from '@neron/base/utils';
import { useState } from 'react';
import type { LoQueSeMueve, MetodoDeCaja } from '../datos/caja.js';
import {
  COMO_SE_DICE_EL_METODO_DE_CAJA,
  METODOS_DE_CAJA,
  centavosDeLoEscrito,
} from '../datos/caja.js';

/**
 * Lo que impide guardar. Cadena vacia = se puede.
 *
 * El orden importa: se dice el primer problema, no los tres a la vez. Una
 * lista de tres errores sobre un formulario de cuatro campos se lee como que
 * todo esta mal.
 */
export function porQueNoSePuedeGuardar(
  tipo: 'ingreso' | 'egreso',
  montoCentavos: number,
  concepto: string,
  metodo: MetodoDeCaja,
  efectivoDisponible: number,
): string {
  if (montoCentavos <= 0) return 'El monto tiene que ser mayor que cero.';
  if (!concepto.trim()) {
    return 'Escribe de qué es. Dentro de seis meses es lo único que lo explica.';
  }
  if (tipo === 'egreso' && metodo === 'efectivo' && montoCentavos > efectivoDisponible) {
    return `En la caja hay ${formatearMoneda(efectivoDisponible)}: no se pueden retirar ${formatearMoneda(montoCentavos)}.`;
  }
  return '';
}

export interface PropiedadesDeMovimiento {
  readonly abierto: boolean;
  readonly tipo: 'ingreso' | 'egreso';
  readonly efectivoDisponible: number;
  readonly quien: string;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(m: LoQueSeMueve): void;
  onCerrar(): void;
}

export function RegistrarMovimiento({
  abierto,
  tipo,
  efectivoDisponible,
  quien,
  trabajando,
  error,
  onGuardar,
  onCerrar,
}: PropiedadesDeMovimiento) {
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [metodo, setMetodo] = useState<MetodoDeCaja>('efectivo');
  const [notas, setNotas] = useState('');

  const montoCentavos = centavosDeLoEscrito(monto);
  const problema = porQueNoSePuedeGuardar(
    tipo, montoCentavos, concepto, metodo, efectivoDisponible,
  );
  const esRetiro = tipo === 'egreso';

  return (
    <Modal
      abierto={abierto}
      titulo={esRetiro ? 'Registrar retiro' : 'Registrar ingreso'}
      onCerrar={onCerrar}
    >
      <div className="pz-columna">
        <Campo
          etiqueta="Monto"
          type="text"
          inputMode="numeric"
          value={monto}
          onChange={(e) => setMonto(e.target.value.replace(/[^\d]/g, ''))}
          numerico
          obligatorio
          ayuda={`En pesos. Ahora mismo: ${formatearMoneda(montoCentavos)}.`}
        />

        <Campo
          etiqueta={esRetiro ? 'Motivo' : 'Concepto'}
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          obligatorio
          maxLength={200}
        />

        <Campo
          etiqueta="Categoría"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          maxLength={60}
          ayuda="Para agrupar en reportes: “Gastos operativos”, “Fondo fijo”."
        />

        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Método de pago</span>
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoDeCaja)}>
            {METODOS_DE_CAJA.map((m) => (
              <option key={m} value={m}>
                {COMO_SE_DICE_EL_METODO_DE_CAJA[m]}
              </option>
            ))}
          </select>
        </label>

        {/* SOLO EL EFECTIVO TOCA EL CAJON, y se dice por adelantado. */}
        <p className="tt-secundario">
          {metodo === 'efectivo'
            ? esRetiro
              ? `Sale del cajón. Ahora hay ${formatearMoneda(efectivoDisponible)}.`
              : 'Entra al cajón y cuenta para el corte.'
            : 'No toca el efectivo del cajón: ese dinero no pasa por ahí. Sí cuenta como movimiento del negocio.'}
        </p>

        <Campo
          etiqueta="Nota"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          maxLength={300}
        />

        <div className="pz-renglon pz-renglon--quieto">
          <div className="pz-dato">
            <span className="tt-etiqueta">Responsable</span>
            <span className="pz-dato__valor">{quien}</span>
          </div>
        </div>

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
            tono={esRetiro ? 'peligro' : 'principal'}
            type="button"
            trabajando={trabajando}
            disabled={problema !== '' || trabajando}
            onClick={() =>
              onGuardar({ tipo, montoCentavos, concepto, metodo, categoria, notas })
            }
          >
            {esRetiro ? 'Registrar retiro' : 'Registrar ingreso'}
          </Boton>
        </div>

        {problema ? (
          <p className="tt-secundario" role="status">
            {problema}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
