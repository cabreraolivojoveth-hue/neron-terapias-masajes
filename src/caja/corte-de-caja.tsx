/**
 * EL CORTE — primero el resumen, después el conteo, y al final el cierre.
 *
 * SE COMPARA SOLO EFECTIVO. Lo que se cuenta al cerrar son los billetes del
 * cajón: una venta con tarjeta es un ingreso del negocio y CERO efectivo. Si
 * el esperado incluyera la tarjeta, el sistema pediría contar dinero que nunca
 * estuvo ahí y todos los cortes saldrían con un faltante inventado.
 *
 * LA DIFERENCIA SE CALCULA MIENTRAS SE ESCRIBE, y esto cambió el 17/08/2026.
 *
 * Antes había un tercer paso con un botón "Ver la diferencia": se escribía
 * $8,000 sobre $850 esperados y había que apretar un botón para enterarse de
 * que sobraban $7,150 — un error de tecleo que se descubría un paso tarde y con
 * el formulario ya avanzado.
 *
 * Aquí había un argumento en contra que hay que dejar dicho, porque era bueno:
 * quien ve la cifra objetivo antes de contar tiende a "encontrar" justo esa
 * cantidad, y entonces el conteo no comprueba nada. Lo que pasa es que **ese
 * argumento ya no se sostenía en esta pantalla**: el paso del resumen enseña
 * "Efectivo esperado" en grande, y para llegar al conteo hay que pasar por ahí.
 * El número ya estaba a la vista. Esconder la RESTA de un número que sí se
 * enseña no protege de nada — solo cuesta un paso y un botón.
 *
 * UNA CAJA CERRADA NO SE REABRE. Lo impide la base, no esta pantalla: reabrir
 * un corte firmado para arreglar un faltante es exactamente lo que un registro
 * financiero tiene que hacer imposible.
 */

import { Boton, Campo } from '@neron/base/ui';
import { formatearDinero } from '../datos/moneda.js';
import { Modal } from '../ui/modal.js';
import { useState } from 'react';
import type { CajaAbierta } from '../datos/caja.js';
import {
  centavosDeLoEscrito,
  comoSeLeeLaDiferencia,
  diferenciaDelCorte,
} from '../datos/caja.js';
import { Icono } from '../ui/iconos.js';

/** Como se dice una diferencia. Sin diferencia se celebra, no se calla. */
export function comoSeDiceLaDiferencia(centavos: number): string {
  const como = comoSeLeeLaDiferencia(centavos);
  if (como === 'cuadra') return 'La caja cuadra.';
  if (como === 'sobra') return `Sobran ${formatearDinero(centavos)}.`;
  return `Faltan ${formatearDinero(-centavos)}.`;
}

/**
 * El titulo del veredicto: tres palabras y ninguna ambigua.
 *
 * "Diferencia: −$500" obliga a interpretar un signo. "Faltan" y "Sobran" se
 * entienden sin pensar, que es lo que hace falta al final del dia con prisa por
 * irse — y son las dos cosas que se atienden distinto: lo que sobra se investiga,
 * lo que falta se busca.
 */
export function tituloDelVeredicto(como: 'cuadra' | 'sobra' | 'falta'): string {
  if (como === 'cuadra') return 'La caja cuadra';
  return como === 'sobra' ? 'Sobra dinero' : 'Falta dinero';
}

export interface PropiedadesDelCorte {
  readonly abierto: boolean;
  readonly caja: CajaAbierta;
  readonly trabajando: boolean;
  readonly error: string | null;
  onCerrarCaja(contadoCentavos: number, notas: string): void;
  onCerrar(): void;
}

export function CorteDeCaja({
  abierto,
  caja,
  trabajando,
  error,
  onCerrarCaja,
  onCerrar,
}: PropiedadesDelCorte) {
  const [paso, setPaso] = useState<'resumen' | 'conteo'>('resumen');
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');

  const esperado = caja.efectivoEsperadoCentavos;
  const contadoCentavos = centavosDeLoEscrito(contado);
  const diferencia = diferenciaDelCorte(contadoCentavos, esperado);
  const como = comoSeLeeLaDiferencia(diferencia);
  /*
   * CON EL CAMPO VACIO NO SE DICE NADA.
   *
   * Sin esto, abrir el conteo enseñaria de entrada "Faltan $1,650" —porque cero
   * contra el esperado es un faltante completo—, y eso es una acusacion, no un
   * calculo. El veredicto aparece con la primera cifra escrita.
   */
  const hayConteo = contado !== '';

  return (
    <Modal abierto={abierto} titulo={`Corte de ${caja.nombre}`} onCerrar={onCerrar}>
      <div className="pz-columna">
        {paso === 'resumen' ? (
          <>
            <dl className="vta-totales">
              <div>
                <dt>Saldo inicial</dt>
                <dd>{formatearDinero(caja.saldoInicialCentavos)}</dd>
              </div>
              <div>
                <dt>Entró en efectivo</dt>
                <dd>{formatearDinero(caja.efectivoEntroCentavos)}</dd>
              </div>
              <div>
                <dt>Salió en efectivo</dt>
                <dd className="vta-totales__resta">
                  −{formatearDinero(caja.efectivoSalioCentavos)}
                </dd>
              </div>
              <div className="vta-totales__total">
                <dt>Efectivo esperado</dt>
                <dd>{formatearDinero(esperado)}</dd>
              </div>
            </dl>

            {/* LO QUE NO ESTA EN EL CAJON, dicho aparte para que nadie lo
                busque entre los billetes. */}
            <p className="tt-secundario">
              Entraron {formatearDinero(caja.ingresosCentavos)} en total, pero solo{' '}
              {formatearDinero(caja.efectivoEntroCentavos)} fueron en efectivo. La tarjeta y la
              transferencia van al banco: no se cuentan en el cajón.
            </p>

            <div className="pz-ficha__pie">
              <Boton tono="contorno" type="button" onClick={onCerrar}>
                Cancelar
              </Boton>
              <Boton tono="principal" type="button" onClick={() => setPaso('conteo')}>
                Contar el efectivo
              </Boton>
            </div>
          </>
        ) : (
          <>
            <Campo
              etiqueta="Efectivo contado"
              type="text"
              inputMode="numeric"
              value={contado}
              onChange={(e) => setContado(e.target.value.replace(/[^\d]/g, ''))}
              numerico
              obligatorio
              ayuda="Cuenta los billetes y las monedas del cajón y escribe el total."
            />

            {/*
              EL VEREDICTO, MIENTRAS SE ESCRIBE.

              Es el cambio del encargo: escribir $8,000 donde iban $850 se ve al
              teclear el primer cero de mas, no un paso despues. No hay boton
              que apretar y no hay nada que esperar — es la misma resta que ya
              se hacia, hecha en el momento en que sirve.

              `role="status"` y no `alert`: un lector de pantalla lo anuncia sin
              interrumpir lo que se esta escribiendo. Con `alert`, cada tecla
              cortaria a la anterior.
            */}
            {hayConteo ? (
              <>
                <div className={`caja-veredicto caja-veredicto--${como}`} role="status">
                  <span className="caja-veredicto__marca" aria-hidden="true">
                    <Icono
                      nombre={como === 'cuadra' ? 'palomita' : como === 'sobra' ? 'mas' : 'alerta'}
                      lado={26}
                    />
                  </span>
                  <span className="caja-veredicto__texto">
                    <span className="caja-veredicto__que">{tituloDelVeredicto(como)}</span>
                    {como === 'cuadra' ? (
                      <span className="tt-secundario">
                        Lo que contaste es exactamente lo que se esperaba.
                      </span>
                    ) : (
                      <>
                        <span className="caja-veredicto__cuanto">
                          {formatearDinero(Math.abs(diferencia))}
                        </span>
                        <span className="tt-secundario">
                          Contaste {formatearDinero(contadoCentavos)} y se esperaban{' '}
                          {formatearDinero(esperado)}.
                        </span>
                      </>
                    )}
                  </span>
                </div>

                {/* El detalle queda, pero debajo y en pequeño: es la
                    comprobacion de donde salio el veredicto, no la noticia. */}
                <dl className="vta-totales">
                  <div>
                    <dt>Esperado</dt>
                    <dd>{formatearDinero(esperado)}</dd>
                  </div>
                  <div>
                    <dt>Contado</dt>
                    <dd>{formatearDinero(contadoCentavos)}</dd>
                  </div>
                  <div className="vta-totales__total">
                    <dt>Diferencia</dt>
                    <dd className={`caja-diferencia--${como}`}>
                      {diferencia < 0
                        ? `−${formatearDinero(-diferencia)}`
                        : formatearDinero(diferencia)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="tt-secundario">
                Cuenta los billetes y escribe el total: la diferencia aparece sola.
              </p>
            )}

            <Campo
              etiqueta="Notas del cierre"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={300}
              {...(hayConteo && como !== 'cuadra'
                ? { ayuda: 'Si sabes de dónde sale la diferencia, escríbelo aquí. Después ya no se puede.' }
                : {})}
            />

            <p className="tt-secundario">
              Al cerrar, esta caja deja de recibir movimientos: no se podrá cobrar en efectivo hasta
              que se abra otra. El corte queda guardado tal cual y no se puede modificar después.
            </p>

            {error ? (
              <p className="pz-error__que" role="alert">
                {error}
              </p>
            ) : null}

            <div className="pz-ficha__pie">
              <Boton tono="contorno" type="button" onClick={() => setPaso('resumen')}>
                Atrás
              </Boton>
              <Boton
                tono="principal"
                type="button"
                trabajando={trabajando}
                disabled={trabajando || !hayConteo}
                onClick={() => onCerrarCaja(contadoCentavos, notas)}
              >
                {trabajando ? 'Cerrando…' : 'Cerrar la caja'}
              </Boton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
