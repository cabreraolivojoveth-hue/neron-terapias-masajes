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
 */

import { moduloPorId } from './registro.js';

export function Pendiente({ modulo }: { readonly modulo: string }) {
  const m = moduloPorId(modulo);

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

  return (
    <div className="terapias-pendiente">
      <span className="terapias-pendiente__marca">Bloque {m.bloque}</span>
      <h2 className="terapias-pendiente__titulo">{m.etiqueta} todavía no está</h2>
      <p className="terapias-pendiente__texto">{m.promesa}</p>
      <p className="terapias-pendiente__nota">
        Esta pantalla está vacía a propósito. Preferimos decirte que falta, a llenarla con
        información inventada que después te haga dudar de la que sí es real.
      </p>
    </div>
  );
}
