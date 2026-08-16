/**
 * EXPORTAR Y RESTAURAR.
 *
 * EXPORTAR FUNCIONA. RESTAURAR NO, Y SE DICE.
 *
 * Es la regla que pidio el arquitecto con todas sus letras: si restaurar no se
 * puede hacer bien todavia, se dice en la pantalla en vez de poner un boton que
 * no hace nada. Un boton que no hace nada es peor que su ausencia — quien lo
 * aprieta se queda esperando, y el dia que de verdad necesite el respaldo va a
 * creer que lo tiene.
 *
 * POR QUE RESTAURAR NO ES "LO MISMO AL REVES", que es lo que parece:
 *
 *   · Meter de vuelta un paciente con su id ya tomado obliga a decidir si se
 *     pisa lo de ahora o se duplica, y las dos respuestas estan mal en un
 *     expediente clinico.
 *   · Las llaves foraneas compuestas exigen que TODO lo relacionado vuelva a la
 *     vez y en orden. Un archivo de citas sin sus pacientes no entra.
 *   · La caja y la bitacora no se pueden reescribir NI DESDE EL SERVIDOR: la
 *     base les quita el permiso de `update` y `delete` a proposito. Un
 *     "restaurar" que las saltara dejaria el dinero cuadrando contra una
 *     historia que ya no existe.
 *
 * Eso no se resuelve con un boton; se resuelve con una copia de la base entera,
 * que es lo que Supabase ya hace y lo que la pantalla explica.
 *
 * LO EXPORTADO SALE CON TOPE Y SE AVISA. La funcion devuelve cuantas filas hay
 * de verdad y cuantas entrego: un archivo recortado sin decirlo tiene
 * exactamente la misma cara que uno completo.
 */

import { Boton } from '@neron/base/ui';
import { LO_QUE_SE_EXPORTA, type Exportacion } from '../datos/configuracion.js';
import { Icono } from '../ui/iconos.js';

/** Cómo se cuenta lo que se acaba de bajar. El tope se dice, no se calla. */
export function comoSeCuentaLoExportado(e: Exportacion): string {
  if (e.total === 0) return 'No había nada que exportar.';
  if (e.entregadas < e.total) {
    return `Se bajaron ${e.entregadas} de ${e.total}: el tope por archivo son ${e.tope} renglones.`;
  }
  return `Se bajaron ${e.entregadas} renglones, que son todos.`;
}

export interface PropiedadesDeLosRespaldos {
  readonly puedeExportar: boolean;
  readonly puedeRestaurar: boolean;
  readonly trabajando: string | null;
  readonly ultima: Exportacion | null;
  readonly error: string | null;
  onExportar(que: string): void;
}

export function RespaldosDelCentro({
  puedeExportar,
  puedeRestaurar,
  trabajando,
  ultima,
  error,
  onExportar,
}: PropiedadesDeLosRespaldos) {
  return (
    <div className="cfg-respaldos">
      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">Bajar los datos</h3>
        <p className="tt-secundario">
          Cada archivo sale en formato CSV, que abre Excel y cualquier hoja de cálculo. Se baja lo
          que tu cuenta puede ver: si no ves el expediente clínico, tampoco se exporta.
        </p>

        {puedeExportar ? (
          <ul className="cfg-exportables">
            {LO_QUE_SE_EXPORTA.map((x) => (
              <li key={x.clave}>
                <button
                  type="button"
                  className="pz-boton"
                  disabled={trabajando !== null}
                  onClick={() => onExportar(x.clave)}
                >
                  <Icono nombre="salida" lado={16} />{' '}
                  {trabajando === x.clave ? 'Bajando…' : x.etiqueta}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pz-vacio__texto">
            Exportar necesita el permiso de exportar datos. No es que aquí se esconda el botón: la
            base rechaza la petición aunque se mande a mano.
          </p>
        )}

        {ultima ? (
          <p className="cfg-respaldos__ultima" role="status">
            {comoSeCuentaLoExportado(ultima)}
          </p>
        ) : null}
        {error ? (
          <p className="pz-error__que" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">Restaurar</h3>
        {/*
          AQUI NO HAY BOTON, Y ES LA DECISION. Ver la explicación de la cabecera:
          un botón que no hace nada le hace creer a alguien que tiene un
          respaldo el día que de verdad lo necesita.
        */}
        <p className="tt-secundario">
          <strong>Todavía no se puede restaurar desde aquí, y no es un olvido.</strong> Volver a
          meter datos no es exportar al revés: un paciente con su identificador ya ocupado obliga a
          decidir si se pisa lo de ahora o se duplica, y las dos respuestas están mal en un
          expediente. Además, la caja y la bitácora no se pueden reescribir ni desde el servidor —
          eso es a propósito, y es lo que hace que sirvan para auditar.
        </p>
        <p className="tt-secundario">
          La copia de seguridad de verdad la hace Supabase sobre la base entera, con su propio
          historial de recuperación. Para volver atrás se restaura ahí, no desde esta pantalla.
        </p>
        {!puedeRestaurar ? (
          <p className="tt-secundario">
            Tu cuenta tampoco tiene el permiso de restaurar respaldos, así que cuando exista esta
            pantalla seguirá diciéndote esto.
          </p>
        ) : null}
      </section>
    </div>
  );
}
