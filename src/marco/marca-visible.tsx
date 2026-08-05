/**
 * La marca del Centro en la barra lateral: hoja, nombre y lema.
 *
 * El marco de la base recibe `logo` y, si viene, pinta eso EN LUGAR del
 * nombre del negocio. Es un buen valor por omision —un logo suele traer el
 * nombre dentro— pero aqui la hoja es solo un simbolo.
 *
 * En vez de cambiar la base para que pinte las dos cosas, el producto le
 * entrega un nodo que ya trae las dos. Es la salida que el `logo: ReactNode`
 * deja abierta a proposito, y evita que la base tenga que adivinar como
 * quiere verse cada producto.
 */

import { LEMA, NOMBRE_DEL_PRODUCTO } from '../marca.js';
import { Hoja } from './hoja.js';

export function MarcaVisible() {
  return (
    <span className="terapias-marca">
      <Hoja />
      <span className="terapias-marca__texto">
        <span className="terapias-marca__nombre">{NOMBRE_DEL_PRODUCTO}</span>
        <span className="terapias-marca__lema">{LEMA}</span>
      </span>
    </span>
  );
}
