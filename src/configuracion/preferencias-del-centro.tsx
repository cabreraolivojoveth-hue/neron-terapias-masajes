/**
 * LAS CUATRO PREFERENCIAS QUE SE GUARDAN EN EL MISMO SITIO.
 *
 * Impuestos y monedas, metodos de pago, facturacion y apariencia son cuatro
 * tarjetas distintas en el diseño y UN SOLO formulario por debajo: las cuatro
 * escriben el mismo bloque `estado.data.centro`. Por eso viven en un archivo
 * con un interruptor y no en cuatro casi iguales — cuatro copias de "cambia un
 * campo, valida, guarda" es exactamente como nacieron las ocho tarjetas
 * distintas que costaron el sistema de diseño.
 *
 * Lo que NO comparten es lo que se puede prometer:
 *
 *   · Impuestos y monedas → se guarda y se usa al imprimir importes.
 *   · Metodos de pago     → se guarda y lo consume el mostrador.
 *   · Facturacion         → se guardan los DATOS FISCALES. Timbrar una factura
 *                           electronica pide un proveedor autorizado y sellos,
 *                           y eso no existe: la pantalla lo dice en vez de
 *                           poner un boton de "facturar".
 *   · Apariencia          → el tema es DEL CENTRO, no de cada quien, y tambien
 *                           se dice: no hay donde guardar una preferencia por
 *                           persona sin inventarle una tabla.
 */

import { AreaDeTexto, Boton, Campo } from '@neron/base/ui';
import {
  METODOS_DE_PAGO,
  TEMAS,
  type DatosDelCentro,
  type TemaDelCentro,
} from '../datos/configuracion.js';

export type PreferenciaEditable = 'dinero' | 'pagos' | 'facturacion' | 'apariencia';

export interface PropiedadesDeLasPreferencias {
  readonly cual: PreferenciaEditable;
  readonly datos: DatosDelCentro;
  readonly loQueFalta: Readonly<Record<string, string>>;
  readonly mostrarErrores: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  readonly puedeGuardar: boolean;
  onCambiar(datos: DatosDelCentro): void;
  onGuardar(): void;
}

export function PreferenciasDelCentro({
  cual,
  datos,
  loQueFalta,
  mostrarErrores,
  trabajando,
  error,
  puedeGuardar,
  onCambiar,
  onGuardar,
}: PropiedadesDeLasPreferencias) {
  const poner = <K extends keyof DatosDelCentro>(k: K, v: DatosDelCentro[K]): void =>
    onCambiar({ ...datos, [k]: v });

  const falla = (campo: string): string | undefined =>
    mostrarErrores ? loQueFalta[campo] : undefined;

  function alternarMetodo(clave: string, puesto: boolean): void {
    const puestos = puesto
      ? [...datos.metodosDePago, clave]
      : datos.metodosDePago.filter((m) => m !== clave);
    // El orden se toma de la lista del producto y no del orden en que se
    // fueron marcando: si no, el mostrador pintaria los botones en un orden
    // distinto cada vez que alguien toca esta pantalla.
    onCambiar({
      ...datos,
      metodosDePago: METODOS_DE_PAGO.filter((m) => puestos.includes(m.clave)).map((m) => m.clave),
    });
  }

  return (
    <div className="cfg-forma">
      {cual === 'dinero' ? (
        <section className="pz-tarjeta">
          <h3 className="tt-tarjeta">Impuestos y moneda</h3>
          <div className="pz-dos">
            <Campo
              etiqueta="Moneda"
              value={datos.moneda}
              onChange={(e) => poner('moneda', e.target.value.toUpperCase())}
              maxLength={3}
              ayuda="El código de tres letras: MXN, USD, EUR."
              {...(falla('moneda') ? { error: falla('moneda') } : {})}
            />
            <Campo
              etiqueta="Decimales"
              type="number"
              numerico
              min={0}
              max={4}
              value={String(datos.decimales)}
              onChange={(e) => poner('decimales', Number(e.target.value))}
              {...(falla('decimales') ? { error: falla('decimales') } : {})}
            />
          </div>
          <div className="pz-dos">
            <Campo
              etiqueta="Cómo se llama el impuesto"
              value={datos.impuestoNombre}
              onChange={(e) => poner('impuestoNombre', e.target.value)}
              maxLength={20}
            />
            <Campo
              etiqueta="Tasa (%)"
              type="number"
              numerico
              min={0}
              max={100}
              step="0.01"
              value={String(datos.impuestoTasa)}
              onChange={(e) => poner('impuestoTasa', Number(e.target.value))}
              {...(falla('impuestoTasa') ? { error: falla('impuestoTasa') } : {})}
            />
          </div>
          <label className="cfg-casilla">
            <input
              type="checkbox"
              checked={datos.impuestoIncluido}
              onChange={(e) => poner('impuestoIncluido', e.target.checked)}
            />
            <span>Los precios que capturo ya llevan el impuesto dentro</span>
          </label>
          {/*
            ESTA CASILLA NO ES COSMETICA. Si los precios llevan el impuesto
            dentro, el desglose se calcula hacia atras; si no, se suma encima.
            Equivocarla cambia todos los totales del centro, asi que se dice qué
            significa en vez de dejar el nombre suelto.
          */}
          <p className="tt-secundario">
            Con la casilla puesta, un servicio de $500 son $500 en total. Sin ella, se le suma el
            impuesto encima al cobrar.
          </p>
        </section>
      ) : null}

      {cual === 'pagos' ? (
        <section className="pz-tarjeta">
          <h3 className="tt-tarjeta">Métodos de pago aceptados</h3>
          <p className="tt-secundario">
            Es lo que ofrece el mostrador al cobrar. La lista es la que sabe cobrar el sistema: un
            método inventado aquí produciría cobros que la base rechaza.
          </p>
          <ul className="cfg-metodos">
            {METODOS_DE_PAGO.map((m) => (
              <li key={m.clave}>
                <label className="cfg-casilla">
                  <input
                    type="checkbox"
                    checked={datos.metodosDePago.includes(m.clave)}
                    onChange={(e) => alternarMetodo(m.clave, e.target.checked)}
                  />
                  <span>{m.etiqueta}</span>
                </label>
              </li>
            ))}
          </ul>
          {falla('metodosDePago') ? (
            <p className="pz-error__que" role="alert">
              {falla('metodosDePago')}
            </p>
          ) : null}
          {/* EL EFECTIVO TIENE UNA CONSECUENCIA QUE NADIE ESPERA, y por eso se
              escribe: cobrar en efectivo exige una caja abierta, porque
              billetes en un cajón que ningún corte va a contar son un descuadre
              garantizado. */}
          <p className="tt-secundario">
            Cobrar en efectivo exige tener la caja abierta: es lo que hace que el corte del día
            pueda cuadrar.
          </p>
        </section>
      ) : null}

      {cual === 'facturacion' ? (
        <section className="pz-tarjeta">
          <h3 className="tt-tarjeta">Datos fiscales</h3>
          <p className="tt-secundario">
            <strong>Aquí se guardan los datos, no se timbra nada.</strong> Emitir una factura
            electrónica necesita un proveedor autorizado y los sellos del centro, y eso todavía no
            existe en el sistema. Lo que sí sirve: estos datos salen en los comprobantes que se
            imprimen.
          </p>
          <div className="pz-dos">
            <Campo
              etiqueta="RFC"
              value={datos.rfc}
              onChange={(e) => poner('rfc', e.target.value.toUpperCase())}
              maxLength={20}
            />
            <Campo
              etiqueta="Razón social"
              value={datos.razonSocial}
              onChange={(e) => poner('razonSocial', e.target.value)}
              maxLength={160}
            />
          </div>
          <Campo
            etiqueta="Régimen fiscal"
            value={datos.regimenFiscal}
            onChange={(e) => poner('regimenFiscal', e.target.value)}
            maxLength={120}
          />
          <AreaDeTexto
            etiqueta="Dirección fiscal"
            rows={2}
            value={datos.direccionFiscal}
            onChange={(e) => poner('direccionFiscal', e.target.value)}
            maxLength={240}
          />
          <AreaDeTexto
            etiqueta="Pie del comprobante"
            rows={2}
            value={datos.pieDeComprobante}
            onChange={(e) => poner('pieDeComprobante', e.target.value)}
            maxLength={240}
            ayuda="Lo que se imprime abajo de cada ticket: gracias, política de cancelación, lo que haga falta."
          />
        </section>
      ) : null}

      {cual === 'apariencia' ? (
        <section className="pz-tarjeta">
          <h3 className="tt-tarjeta">Apariencia</h3>
          {/*
            EL TEMA ES DEL CENTRO Y SE DICE. No hay donde guardar una
            preferencia por persona sin inventarle una tabla a `membresia`, y
            una pantalla que promete "tu tema" y en realidad se lo cambia a
            todos es peor que una que dice la verdad.
          */}
          <p className="tt-secundario">
            El tema es del centro: se lo cambia a todo el equipo, no solo a ti.
          </p>
          <div className="pz-segmentos" role="group" aria-label="Tema del sistema">
            {TEMAS.map((t) => (
              <button
                key={t.clave}
                type="button"
                className={`pz-segmento${datos.tema === t.clave ? ' pz-segmento--puesto' : ''}`}
                aria-pressed={datos.tema === t.clave}
                onClick={() => poner('tema', t.clave as TemaDelCentro)}
              >
                {t.etiqueta}
              </button>
            ))}
          </div>

          <label className="cfg-casilla">
            <input
              type="checkbox"
              checked={datos.menosMovimiento}
              onChange={(e) => poner('menosMovimiento', e.target.checked)}
            />
            <span>Menos movimiento en todo el sistema</span>
          </label>
          <p className="tt-secundario">
            Las animaciones ya se apagan solas para quien lo pide en su sistema operativo. Esto lo
            apaga para todo el centro, aunque nadie lo haya pedido ahí: para algunas personas no es
            un detalle bonito, es mareo.
          </p>

          {/* LOS COLORES NO SE OFRECEN, Y NO ES PEREZA. El verde del producto
              pasó una prueba de contraste antes de entrar —el primer candidato
              se cayó en 4.06:1 y hubo que bajarlo—, y dejar escoger un color a
              ojo produce una pantalla ilegible con el sol encima de la que
              nadie sabe volver. */}
          <p className="tt-secundario">
            Los colores del Centro no se cambian desde aquí: cada uno pasó una prueba de contraste
            antes de entrar, y uno escogido a ojo deja de leerse con el sol encima —que es como se
            ve la pantalla del mostrador a mediodía—.
          </p>
        </section>
      ) : null}

      {error ? (
        <p className="pz-error__que" role="alert">
          {error}
        </p>
      ) : null}

      <div className="pz-ficha__pie">
        <Boton tono="principal" trabajando={trabajando} disabled={!puedeGuardar} onClick={onGuardar}>
          Guardar
        </Boton>
      </div>
    </div>
  );
}
