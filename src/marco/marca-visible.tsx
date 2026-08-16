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
 *
 * EL NOMBRE SE RESUELVE AL LEER, NO SE COPIA. Hasta el bloque 10 estaba escrito
 * en `marca.ts`; ahora sale de `negocio.nombre` y el lema del bloque de
 * configuracion, que es lo que administra Configuracion. Renombrar el centro
 * cambia la barra lateral sin tocar una linea de codigo — que es exactamente la
 * regla del §5 del acuerdo aplicada al propio producto.
 *
 * Y EL LOGO, SI EL CENTRO SUBIO UNO, SUSTITUYE A LA HOJA. La hoja es el simbolo
 * del producto; el logo es el del centro, y cuando existe manda el suyo.
 *
 * COMPARTE LA MISMA LLAVE DE CACHE QUE CONFIGURACION, asi que esto no agrega un
 * viaje al servidor: la pantalla de Configuracion, Agenda y la barra lateral
 * piden lo mismo y se hace UNA consulta. Mientras no llega, se pinta el nombre
 * por omision en vez de un hueco: una barra lateral que parpadea vacia al
 * arrancar se ve rota aunque no lo este.
 */

import { useConsulta } from '../datos/consulta.js';
import {
  LEMA_POR_OMISION,
  NOMBRE_POR_OMISION,
  llaveDeLaConfiguracion,
  traerConfiguracion,
  type ConfiguracionDelCentro,
} from '../datos/configuracion.js';
import { useSesion } from '../identidad/sesion.js';
import { Hoja } from './hoja.js';

export function MarcaVisible() {
  const { acceso } = useSesion();
  const negocio = acceso?.negocioId ?? '';

  const configuracion = useConsulta<ConfiguracionDelCentro>(
    negocio ? llaveDeLaConfiguracion(negocio) : null,
    () => traerConfiguracion(negocio),
  );

  const nombre = configuracion.datos?.datos.nombre || NOMBRE_POR_OMISION;
  const lema = configuracion.datos?.datos.lema || LEMA_POR_OMISION;
  const logo = configuracion.datos?.datos.logoUrl ?? '';

  return (
    <span className="terapias-marca">
      {logo ? (
        /* El texto alternativo va VACIO y el nombre se lee al lado: un lector
           de pantalla que dijera "logo de Centro Holístico, Centro Holístico"
           repite la misma cosa dos veces. */
        <img className="terapias-marca__logo" src={logo} alt="" />
      ) : (
        <Hoja />
      )}
      <span className="terapias-marca__texto">
        <span className="terapias-marca__nombre">{nombre}</span>
        <span className="terapias-marca__lema">{lema}</span>
      </span>
    </span>
  );
}
