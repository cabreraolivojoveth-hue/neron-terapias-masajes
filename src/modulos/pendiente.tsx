/**
 * La pantalla de un modulo que todavia no llega.
 *
 * ESTO ES LO CONTRARIO DE DATOS DE EJEMPLO, y es a proposito.
 *
 * La tentacion obvia es dejar cada modulo con una tabla de mentiras y unas
 * graficas bonitas "para que se vea completo". Es la peor decision posible:
 * quien lo abre no sabe si el sistema ya funciona o no, prueba a guardar algo,
 * no se guarda, y a partir de ahi desconfia tambien de los numeros que SI son
 * reales. Un dato inventado en una pantalla contamina todas las demas.
 *
 * Aqui se dice la verdad completa: que hace falta, que va a hacer, y cuando
 * llega. Es mas util y no cuesta credibilidad.
 *
 * Y SE RECOGE EL RECADO. Si alguien llego apretando "Nuevo gasto" en las
 * acciones rapidas, la pantalla lo dice: el boton SI hizo algo, lo que falta
 * es el modulo. Sin esto, ese boton se siente roto — se aprieta, cambia la
 * pantalla, y no hay ni rastro de lo que se pidio.
 */

import { tomarIntencion, type Intencion } from '@neron/base/marco';
import { useEffect, useRef, useState } from 'react';
import { moduloPorId } from './registro.js';

/** Como se lee cada recado. Uno que no este aqui simplemente no se anuncia. */
const LO_QUE_IBAS_A_HACER: Readonly<Record<string, string>> = {
  nueva: 'crear un registro nuevo',
  nuevo: 'crear un registro nuevo',
  pago: 'registrar un pago',
  abrir: 'abrir un registro',
};

export function Pendiente({ modulo }: { readonly modulo: string }) {
  const m = moduloPorId(modulo);
  const [recado, setRecado] = useState<Intencion | null>(null);

  /**
   * Se consume UNA vez. El candado del `useRef` es por el modo estricto de
   * React, que en desarrollo monta, desmonta y vuelve a montar: sin el, el
   * recado se consumiria en el primer montaje y el segundo lo veria vacio.
   */
  const leido = useRef(false);
  useEffect(() => {
    if (leido.current) return;
    leido.current = true;
    setRecado(tomarIntencion(modulo));
  }, [modulo]);

  if (!m) {
    return (
      <div className="terapias-pendiente">
        <h2 className="terapias-pendiente__titulo">Esa pantalla no existe</h2>
        <p className="terapias-pendiente__texto">
          La direccion no lleva a ningun modulo del sistema. Puede que el enlace este viejo.
        </p>
      </div>
    );
  }

  const queIbas = recado ? LO_QUE_IBAS_A_HACER[recado.accion] : undefined;

  return (
    <div className="terapias-pendiente">
      <span className="terapias-pendiente__marca">Bloque {m.bloque}</span>
      <h2 className="terapias-pendiente__titulo">{m.etiqueta} todavía no está</h2>
      {queIbas ? (
        <p className="terapias-pendiente__recado">
          Ibas a <strong>{queIbas}</strong> en {m.etiqueta}. El botón funciona; lo que falta es
          esta pantalla.
        </p>
      ) : null}
      <p className="terapias-pendiente__texto">{m.promesa}</p>
      <p className="terapias-pendiente__nota">
        Esta pantalla está vacía a propósito. Preferimos decirte que falta, a llenarla con
        información inventada que después te haga dudar de la que sí es real.
      </p>
    </div>
  );
}
