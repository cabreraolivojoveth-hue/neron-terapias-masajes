/**
 * EL PANEL DE LA DERECHA: en qué estado está la caja y qué se puede hacer.
 *
 * "SALDO ACTUAL" AQUI SIGNIFICA EFECTIVO, y la pantalla lo dice. En la
 * referencia visual las cuatro cifras se suman entre sí incluyendo la tarjeta,
 * pero eso no puede ser: si la tarjeta contara como saldo del cajón, al cerrar
 * el turno el sistema pediría contar miles de pesos que están en el banco. Lo
 * que se enseña aquí es lo que de verdad hay en el cajón, y el resto se lee al
 * lado, para que la diferencia entre "ingresó" y "está en el cajón" quede
 * clara antes del corte y no durante.
 *
 * LA DIFERENCIA SOLO EXISTE DESPUES DEL CORTE. Mientras la caja está abierta
 * no hay diferencia que enseñar —nadie ha contado nada todavía— y pintar un
 * cero ahí haría creer que ya cuadró.
 */

import { formatearDinero } from '../datos/moneda.js';
import type { CajaAbierta } from '../datos/caja.js';
import { Icono } from '../ui/iconos.js';

/** La fecha y hora de apertura, legible. Un valor ilegible sale vacío. */
export function cuandoSeAbrio(abiertaEn: string): string {
  const marca = Date.parse(abiertaEn);
  if (!Number.isFinite(marca)) return '';
  const d = new Date(marca);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}, ${hh}:${mi}`;
}

export interface PropiedadesDelEstado {
  readonly caja: CajaAbierta;
  readonly puedeMover: boolean;
  onIngreso(): void;
  onRetiro(): void;
  onCerrarCaja(): void;
  onHistorial(): void;
}

export function EstadoDeLaCaja({
  caja,
  puedeMover,
  onIngreso,
  onRetiro,
  onCerrarCaja,
  onHistorial,
}: PropiedadesDelEstado) {
  const noEfectivo = caja.ingresosCentavos - caja.efectivoEntroCentavos;

  return (
    <>
      <section className="pz-tarjeta" aria-labelledby="caja-estado-titulo">
        <header className="pz-cabecera">
          <h3 className="tt-tarjeta" id="caja-estado-titulo">
            Estado de la caja
          </h3>
          <span className="pz-pastilla caja-estado--abierta">Abierta</span>
        </header>

        <div className="pz-columna">
          <p className="pz-renglon__titulo">{caja.nombre}</p>

          <div className="caja-dato">
            <span className="tt-etiqueta">Abierta por</span>
            <span className="pz-dato__valor">
              {caja.abiertaPor ?? <span className="tt-falta">—</span>}
            </span>
          </div>
          <div className="caja-dato">
            <span className="tt-etiqueta">Apertura</span>
            <span className="pz-dato__valor">{cuandoSeAbrio(caja.abiertaEn)}</span>
          </div>
          <div className="caja-dato">
            <span className="tt-etiqueta">Saldo inicial</span>
            <span className="pz-dato__valor">
              {formatearDinero(caja.saldoInicialCentavos)}
            </span>
          </div>

          {puedeMover ? (
            <button type="button" className="pz-boton pz-boton--ancho" onClick={onCerrarCaja}>
              <Icono nombre="prohibido" lado={16} /> Cerrar caja
            </button>
          ) : null}
        </div>
      </section>

      <section className="pz-tarjeta" aria-labelledby="caja-resumen-titulo">
        <h3 className="tt-tarjeta" id="caja-resumen-titulo">
          Resumen del turno
        </h3>

        <dl className="vta-totales">
          <div>
            <dt>Saldo inicial</dt>
            <dd>{formatearDinero(caja.saldoInicialCentavos)}</dd>
          </div>
          <div>
            <dt>Entró en efectivo</dt>
            <dd className="caja-entra">+ {formatearDinero(caja.efectivoEntroCentavos)}</dd>
          </div>
          <div>
            <dt>Salió en efectivo</dt>
            <dd className="caja-sale">− {formatearDinero(caja.efectivoSalioCentavos)}</dd>
          </div>
          <div className="vta-totales__total">
            <dt>Efectivo en el cajón</dt>
            <dd>{formatearDinero(caja.efectivoEsperadoCentavos)}</dd>
          </div>
        </dl>

        {/* LO QUE NO ESTA EN EL CAJON. Se enseña aparte a proposito: es la
            cifra que hace que un corte cuadre o no. */}
        <div className="caja-aparte">
          <span className="tt-etiqueta">Cobrado por otras vías</span>
          <span className="pz-dato__valor">{formatearDinero(noEfectivo)}</span>
          <span className="tt-secundario">
            Tarjeta y transferencia. Son ingresos del centro, pero no están en el cajón: no se
            cuentan en el corte.
          </span>
        </div>

        {/* LA DIFERENCIA NO EXISTE HASTA QUE ALGUIEN CUENTA. */}
        <p className="tt-secundario">
          La diferencia aparece al cerrar, cuando se compare con lo que se cuente en el cajón.
        </p>
      </section>

      {puedeMover ? (
        <section className="pz-tarjeta" aria-labelledby="caja-acciones-titulo">
          <h3 className="tt-tarjeta" id="caja-acciones-titulo">
            Acciones rápidas
          </h3>
          {/*
            CADA ACCION CON SU TONO, como en el diseño. No es adorno: entrar
            dinero y sacarlo son opuestos y en gris se leian igual — en un
            mostrador con prisa, apretar "retiro" creyendo que era "ingreso"
            descuadra el corte y nadie sabe por que.
          */}
          <div className="caja-acciones mv-escalonado">
            <button
              type="button"
              className="pz-boton pz-boton--ancho mv-levanta caja-accion--entra"
              onClick={onIngreso}
            >
              <Icono nombre="mas" lado={16} /> Registrar ingreso
            </button>
            <button
              type="button"
              className="pz-boton pz-boton--ancho mv-levanta caja-accion--sale"
              onClick={onRetiro}
            >
              <Icono nombre="salida" lado={16} /> Registrar retiro
            </button>
            <button
              type="button"
              className="pz-boton pz-boton--ancho mv-levanta"
              onClick={onHistorial}
            >
              <Icono nombre="reloj" lado={16} /> Ver historial de cajas
            </button>
          </div>
        </section>
      ) : null}

      {/*
        EL CONSEJO DEL DIA, y es el unico texto de la pantalla que no es un dato.
        Va al final y en tono callado a proposito: recuerda lo unico que se
        olvida de verdad —cerrar la caja— sin competir con las cifras. Es fijo,
        no un dato: no hay tabla de consejos ni la va a haber.
      */}
      <aside className="caja-consejo" aria-label="Consejo del día">
        <span className="pz-ficha pz-ficha--cursos" aria-hidden="true">
          <Icono nombre="flor" lado={18} />
        </span>
        <p className="tt-secundario">
          Cierra tu caja al terminar el día. El corte compara lo que se cobró con lo que
          cuentas, y es lo único que avisa si falta dinero.
        </p>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Las cuatro cifras de arriba.
 *
 * Las cuatro hablan de EFECTIVO y encajan entre sí: inicial + entró − salió =
 * en el cajón. Que cuadren a la vista es justo lo que hace que alguien confíe
 * en el número que va a comparar con los billetes.
 */
export function CifrasDeLaCaja({ caja }: { readonly caja: CajaAbierta }) {
  const cifras = [
    {
      clave: 'inicial', etiqueta: 'Saldo inicial', icono: 'cajon' as const,
      valor: formatearDinero(caja.saldoInicialCentavos), pie: 'Con lo que abrió',
    },
    {
      clave: 'entro', etiqueta: 'Entró en efectivo', icono: 'dinero' as const,
      valor: formatearDinero(caja.efectivoEntroCentavos), pie: 'Solo lo cobrado en efectivo',
    },
    {
      clave: 'salio', etiqueta: 'Salió en efectivo', icono: 'salida' as const,
      valor: `−${formatearDinero(caja.efectivoSalioCentavos)}`, pie: 'Retiros y gastos en efectivo',
    },
    {
      clave: 'actual', etiqueta: 'Efectivo en el cajón', icono: 'moneda' as const,
      valor: formatearDinero(caja.efectivoEsperadoCentavos), pie: 'Lo que debería haber ahora',
    },
  ];

  return (
    /*
     * LA TARJETA DE "CAJA ACTUAL", como en el diseño.
     *
     * Antes eran cuatro tarjetas sueltas de colores, y la identidad del turno
     * —que caja es, quien la abrio y a que hora— estaba escondida en la columna
     * de la derecha. Dos problemas a la vez: las cuatro cifras se leian como
     * cuatro cosas sin relacion cuando en realidad son UNA cuenta
     * (inicial + entro − salio = en el cajon), y lo primero que hay que saber al
     * llegar al mostrador estaba en el ultimo sitio donde se mira.
     *
     * Juntas en una sola tarjeta, la cuenta se lee de corrido y el turno tiene
     * nombre. La ultima va marcada porque es la que se compara al cerrar.
     */
    <section className="caja-actual pz-tarjeta mv-entra" aria-label="Caja actual">
      <div className="caja-actual__quien">
        <span className="tt-etiqueta">Caja actual</span>
        <h3 className="tt-pagina caja-actual__nombre">{caja.nombre}</h3>
        <p className="tt-secundario">
          {caja.abiertaPor ? `Abierta por ${caja.abiertaPor}` : 'Abierta'}
          {caja.abiertaEn ? ` · ${cuandoSeAbrio(caja.abiertaEn)}` : ''}
        </p>
      </div>

      <div className="caja-actual__cifras mv-escalonado">
        {cifras.map((c) => (
          <div
            key={c.clave}
            className={`caja-actual__cifra${
              c.clave === 'actual' ? ' caja-actual__cifra--marcada' : ''
            }`}
          >
            <span className="pz-ficha pz-ficha--ventas" aria-hidden="true">
              <Icono nombre={c.icono} lado={18} />
            </span>
            <span className="pz-cifra__texto">
              <span className="pz-cifra__etiqueta">{c.etiqueta}</span>
              <span className="pz-cifra__valor caja-actual__valor">{c.valor}</span>
              <span className="pz-cifra__pie">{c.pie}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
