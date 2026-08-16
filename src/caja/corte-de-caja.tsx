/**
 * EL CORTE — primero el resumen, después el conteo, y al final el cierre.
 *
 * SE COMPARA SOLO EFECTIVO. Lo que se cuenta al cerrar son los billetes del
 * cajón: una venta con tarjeta es un ingreso del negocio y CERO efectivo. Si
 * el esperado incluyera la tarjeta, el sistema pediría contar dinero que nunca
 * estuvo ahí y todos los cortes saldrían con un faltante inventado.
 *
 * EL NUMERO ESPERADO SE ENSEÑA ANTES DE PEDIR EL CONTEO, y a propósito: quien
 * ya vio la cifra objetivo tiende a "encontrar" justo esa cantidad. Por eso el
 * flujo es en dos pasos y el esperado no aparece hasta que el conteo ya está
 * escrito.
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
  const [paso, setPaso] = useState<'resumen' | 'conteo' | 'confirmar'>('resumen');
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');

  const esperado = caja.efectivoEsperadoCentavos;
  const contadoCentavos = centavosDeLoEscrito(contado);
  const diferencia = diferenciaDelCorte(contadoCentavos, esperado);
  const como = comoSeLeeLaDiferencia(diferencia);

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
        ) : paso === 'conteo' ? (
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

            {/* EL ESPERADO NO SE ENSEÑA TODAVIA: ver la cifra objetivo antes de
                contar hace que se "encuentre" justo esa cantidad. */}
            <p className="tt-secundario">
              Cuenta primero. El sistema te dice la diferencia después — así el conteo es de verdad.
            </p>

            <Campo
              etiqueta="Notas del cierre"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={300}
            />

            <div className="pz-ficha__pie">
              <Boton tono="contorno" type="button" onClick={() => setPaso('resumen')}>
                Atrás
              </Boton>
              <Boton
                tono="principal"
                type="button"
                disabled={contado === ''}
                onClick={() => setPaso('confirmar')}
              >
                Ver la diferencia
              </Boton>
            </div>
          </>
        ) : (
          <>
            {/*
              EL VEREDICTO ES EL PROTAGONISTA DEL PASO, no una tirita al final.
              Antes la diferencia era un renglon mas de una lista de tres y la
              frase iba debajo en letra chica: quien acaba de contar el cajon
              tenia que leer tres numeros y restarlos con la vista para saber lo
              unico que le importa — si cuadra, si sobra o si falta.
              Ahora se lee de un golpe y sin restar nada.
            */}
            <div className={`caja-veredicto caja-veredicto--${como} mv-entra`} role="status">
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

            {/* El detalle queda, pero debajo y en pequeño: es la comprobacion de
                donde salio el veredicto, no la noticia. */}
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
              <Boton tono="contorno" type="button" onClick={() => setPaso('conteo')}>
                Atrás
              </Boton>
              <Boton
                tono="principal"
                type="button"
                trabajando={trabajando}
                disabled={trabajando}
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
