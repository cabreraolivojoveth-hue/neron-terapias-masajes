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

import { formatearMoneda } from '@neron/base/utils';
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
              {formatearMoneda(caja.saldoInicialCentavos)}
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
            <dd>{formatearMoneda(caja.saldoInicialCentavos)}</dd>
          </div>
          <div>
            <dt>Entró en efectivo</dt>
            <dd className="caja-entra">+ {formatearMoneda(caja.efectivoEntroCentavos)}</dd>
          </div>
          <div>
            <dt>Salió en efectivo</dt>
            <dd className="caja-sale">− {formatearMoneda(caja.efectivoSalioCentavos)}</dd>
          </div>
          <div className="vta-totales__total">
            <dt>Efectivo en el cajón</dt>
            <dd>{formatearMoneda(caja.efectivoEsperadoCentavos)}</dd>
          </div>
        </dl>

        {/* LO QUE NO ESTA EN EL CAJON. Se enseña aparte a proposito: es la
            cifra que hace que un corte cuadre o no. */}
        <div className="caja-aparte">
          <span className="tt-etiqueta">Cobrado por otras vías</span>
          <span className="pz-dato__valor">{formatearMoneda(noEfectivo)}</span>
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
          <div className="caja-acciones mv-escalonado">
            <button type="button" className="pz-boton pz-boton--ancho" onClick={onIngreso}>
              <Icono nombre="mas" lado={16} /> Registrar ingreso
            </button>
            <button type="button" className="pz-boton pz-boton--ancho" onClick={onRetiro}>
              <Icono nombre="salida" lado={16} /> Registrar retiro
            </button>
            <button type="button" className="pz-boton pz-boton--ancho" onClick={onHistorial}>
              <Icono nombre="reloj" lado={16} /> Ver historial de cajas
            </button>
          </div>
        </section>
      ) : null}
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
      clave: 'inicial', etiqueta: 'Saldo inicial', categoria: 'visitas',
      valor: formatearMoneda(caja.saldoInicialCentavos), pie: 'Con lo que abrió',
    },
    {
      clave: 'entro', etiqueta: 'Entró en efectivo', categoria: 'citas',
      valor: formatearMoneda(caja.efectivoEntroCentavos), pie: 'Solo lo cobrado en efectivo',
    },
    {
      clave: 'salio', etiqueta: 'Salió en efectivo', categoria: 'productos',
      valor: `−${formatearMoneda(caja.efectivoSalioCentavos)}`, pie: 'Retiros y gastos en efectivo',
    },
    {
      clave: 'actual', etiqueta: 'Efectivo en el cajón', categoria: 'ventas',
      valor: formatearMoneda(caja.efectivoEsperadoCentavos), pie: 'Lo que debería haber ahora',
    },
  ];

  return (
    <section className="pz-cifras mv-escalonado" aria-label="Cifras de la caja">
      {cifras.map((c) => (
        <div key={c.clave} className={`pz-cifra pz-cifra--${c.categoria}`}>
          <span className="pz-cifra__icono" aria-hidden="true">
            <Icono nombre="dinero" lado={20} />
          </span>
          <span className="pz-cifra__texto">
            <span className="pz-cifra__etiqueta">{c.etiqueta}</span>
            <span className="pz-cifra__valor">{c.valor}</span>
            <span className="pz-cifra__pie">{c.pie}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
