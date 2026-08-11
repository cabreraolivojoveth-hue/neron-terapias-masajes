/**
 * LA PISTA: "toca una fila para ver su ficha".
 *
 * POR QUE EXISTE, que es lo que se vio en las capturas y no en el codigo.
 *
 * Cinco modulos —Agenda, Clientes, Servicios, Cursos y Productos— tienen una
 * lista a la izquierda y una ficha a la derecha. Mientras no hay nada
 * escogido, la ficha se pintaba igual: una tarjeta de trescientos cuarenta
 * pixeles con UNA frase adentro, ocupando la cuarta parte de la pantalla.
 *
 * Y no era solo feo. La tabla se quedaba con lo que sobraba, y en Cursos las
 * columnas no cabian: el precio salia cortado —"$2,500.0"— y aparecia una
 * barra de desplazamiento horizontal dentro de la tarjeta. Un precio a medias
 * en un sistema de cobro es de las cosas que no se pueden entregar.
 *
 * Asi que mientras no hay nada escogido, la lista se lleva el ancho entero y
 * la frase baja a una tira. La rejilla lo nota sola —`.pz-cuerpo:has(>
 * .pz-pista)`—, sin que los cinco modulos tengan que avisar de nada: quien
 * pinta la ficha ya sabe si esta vacia, y es el unico que lo sabe.
 */

import { Icono, type NombreDeIcono } from './iconos.js';

export function Pista({
  texto,
  icono = 'nota',
}: {
  readonly texto: string;
  readonly icono?: NombreDeIcono;
}) {
  return (
    <aside className="pz-pista">
      <span className="pz-pista__icono" aria-hidden="true">
        <Icono nombre={icono} lado={16} />
      </span>
      <span>{texto}</span>
    </aside>
  );
}
