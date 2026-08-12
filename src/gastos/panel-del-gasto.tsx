/**
 * EL DETALLE DE UN GASTO.
 *
 * DICE EN QUE SE CONVIRTIO EN LA CAJA, y es lo que mas se pregunta de un
 * gasto: "pagué la renta, ¿por qué el cajón no bajó?". Con la forma de pago
 * al lado del efectivo que salió, la respuesta esta escrita.
 *
 * LAS TRES FECHAS SON DISTINTAS Y SE ENSEÑAN LAS TRES. Un gasto del 1 de
 * agosto puede haberse capturado el 3 y corregido el 5. Enseñar solo una
 * obliga a adivinar cual es, y para el contador no es lo mismo.
 *
 * LO QUE NO SE PUEDE HACER NO SE PINTA, ni en gris. Un boton apagado promete
 * algo que no va a pasar y de paso le cuenta a quien no debe que existe.
 */

import { formatearMoneda } from '@neron/base/utils';
import {
  COMO_SE_DICE_EL_METODO,
  COMO_SE_DICE_LA_FRECUENCIA,
  type GastoEnLista,
} from '../datos/gastos.js';
import { fechaLarga } from '../ui/fechas-en-palabras.js';
import { Icono } from '../ui/iconos.js';
import { Pista } from '../ui/pista.js';

/** La hora de captura, en local. Vacio si no se entiende: nunca una inventada. */
export function horaDeCaptura(creadoEn: string): string {
  const marca = Date.parse(creadoEn);
  if (!Number.isFinite(marca)) return '';
  const d = new Date(marca);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface PropiedadesDelPanel {
  readonly gasto: GastoEnLista | null;
  readonly puedeGestionar: boolean;
  onEditar(): void;
  onAnular(): void;
  onDuplicar(): void;
  onVerProveedor(): void;
  onVerCaja(): void;
  onCerrar(): void;
}

export function PanelDelGasto({
  gasto,
  puedeGestionar,
  onEditar,
  onAnular,
  onDuplicar,
  onVerProveedor,
  onVerCaja,
  onCerrar,
}: PropiedadesDelPanel) {
  if (!gasto) {
    /*
     * SIN NADA ESCOGIDO, LA TABLA SE LLEVA EL ANCHO ENTERO.
     *
     * Reservar la columna de la ficha para una frase le quitaba trescientos
     * cuarenta pixeles a una tabla de diez columnas, y tres de ellas
     * —frecuencia, proveedor y quien lo registro— se escondian por no caber.
     * La misma leccion que costo el precio cortado en Cursos.
     */
    return (
      <Pista
        texto="Toca un gasto para ver su ficha, en qué se convirtió en la caja y sus acciones."
        icono="recibo"
      />
    );
  }

  const salioDelCajon = gasto.efectivoCentavos;

  return (
    <aside className="pz-tarjeta srv-detalle mv-panel" aria-label="Detalle del gasto">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta">{gasto.concepto}</h3>
        <button type="button" className="pz-icono-boton" aria-label="Cerrar" onClick={onCerrar}>
          ×
        </button>
      </header>

      {gasto.anulado ? (
        <div className="pz-error" role="status">
          <p className="pz-error__que">Este gasto está anulado.</p>
          {gasto.anuladoMotivo ? (
            <p className="pz-error__detalle">Motivo: {gasto.anuladoMotivo}</p>
          ) : null}
        </div>
      ) : null}

      <div className="gto-detalle__cifra">
        <span className="tt-etiqueta">Monto</span>
        <strong className="tt-dato">{formatearMoneda(gasto.montoCentavos)}</strong>
      </div>

      {/*
        EN QUE SE CONVIRTIO EN LA CAJA. Es la conexion que mas se pregunta y la
        que peor se entiende cuando no se explica: un gasto de tarjeta es un
        egreso del negocio y CERO efectivo, y sin decirlo parece que la caja
        se equivoco.
      */}
      <div className="gto-detalle__caja">
        <span className="pz-ficha" aria-hidden="true">
          <Icono nombre="cajon" lado={18} />
        </span>
        <span className="pz-renglon__cuerpo">
          <span className="pz-renglon__titulo">
            {salioDelCajon > 0
              ? `Salieron ${formatearMoneda(salioDelCajon)} del cajón`
              : 'No salió efectivo del cajón'}
          </span>
          <span className="pz-renglon__pie">
            {gasto.metodo === 'mixto' && gasto.metodoResto
              ? `${formatearMoneda(salioDelCajon)} en efectivo y el resto con ${COMO_SE_DICE_EL_METODO[gasto.metodoResto].toLowerCase()}`
              : gasto.metodo === 'efectivo'
                ? 'Pagado en efectivo'
                : `Pagado con ${COMO_SE_DICE_EL_METODO[gasto.metodo].toLowerCase()}: es egreso del negocio, no del cajón`}
          </span>
        </span>
      </div>

      <dl className="pz-totales">
        <div>
          <dt>Fecha del gasto</dt>
          <dd>{fechaLarga(gasto.fecha)}</dd>
        </div>
        <div>
          <dt>Categoría</dt>
          <dd>{gasto.categoria ?? <span className="tt-falta">Sin categoría</span>}</dd>
        </div>
        <div>
          <dt>Forma de pago</dt>
          <dd>{COMO_SE_DICE_EL_METODO[gasto.metodo]}</dd>
        </div>
        <div>
          <dt>Frecuencia</dt>
          <dd>{COMO_SE_DICE_LA_FRECUENCIA[gasto.frecuencia]}</dd>
        </div>
        <div>
          <dt>Proveedor</dt>
          <dd>{gasto.proveedor ?? <span className="tt-falta">Sin proveedor</span>}</dd>
        </div>
        <div>
          <dt>Referencia</dt>
          <dd>{gasto.referencia ?? <span className="tt-falta">—</span>}</dd>
        </div>
        <div>
          <dt>Lo registró</dt>
          <dd>{gasto.usuario ?? <span className="tt-falta">—</span>}</dd>
        </div>
        <div>
          <dt>Capturado</dt>
          <dd>
            {gasto.creadoEn.slice(8, 10)}/{gasto.creadoEn.slice(5, 7)}/
            {gasto.creadoEn.slice(0, 4)} {horaDeCaptura(gasto.creadoEn)}
          </dd>
        </div>
      </dl>

      {gasto.detalle ? (
        <div className="pz-dato">
          <span className="tt-etiqueta">Descripción</span>
          <p className="pz-dato__valor">{gasto.detalle}</p>
        </div>
      ) : null}

      {gasto.notas ? (
        <div className="pz-dato">
          <span className="tt-etiqueta">Notas</span>
          <p className="pz-dato__valor">{gasto.notas}</p>
        </div>
      ) : null}

      {/* DE DONDE VINO. Un gasto que aparecio solo, sin que nadie lo capture,
          confunde hasta que se dice que lo genero una plantilla. */}
      {gasto.recurrenteId ? (
        <p className="tt-secundario">
          <Icono nombre="reloj" lado={14} /> Lo generó un gasto recurrente{' '}
          {COMO_SE_DICE_LA_FRECUENCIA[gasto.frecuencia].toLowerCase()}.
        </p>
      ) : null}

      {gasto.sustituyeA ? (
        <p className="tt-secundario">
          <Icono nombre="lapiz" lado={14} /> Corrige a un gasto anterior, que quedó anulado en el
          historial.
        </p>
      ) : null}

      <div className="pz-columna">
        {gasto.proveedorId ? (
          <button type="button" className="pz-boton pz-boton--ancho" onClick={onVerProveedor}>
            <Icono nombre="paquete" lado={16} /> Ver proveedor
          </button>
        ) : null}
        {salioDelCajon > 0 ? (
          <button type="button" className="pz-boton pz-boton--ancho" onClick={onVerCaja}>
            <Icono nombre="cajon" lado={16} /> Ver el movimiento en Caja
          </button>
        ) : null}
        {puedeGestionar && !gasto.anulado ? (
          <>
            <button type="button" className="pz-boton pz-boton--ancho" onClick={onDuplicar}>
              <Icono nombre="cuadricula" lado={16} /> Duplicar
            </button>
            <button
              type="button"
              className="pz-boton pz-boton--ancho pz-boton--principal"
              onClick={onEditar}
            >
              <Icono nombre="lapiz" lado={16} /> Editar
            </button>
            <button
              type="button"
              className="pz-boton pz-boton--ancho pz-boton--peligro"
              onClick={onAnular}
            >
              <Icono nombre="prohibido" lado={16} /> Anular
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
