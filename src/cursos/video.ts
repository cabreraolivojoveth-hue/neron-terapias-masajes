/**
 * EL VIDEO DE PRESENTACION DE UN CURSO.
 *
 * QUE SE GUARDA, Y POR QUE NO ES LO QUE SE PEGA:
 *
 * Se guarda el IDENTIFICADOR de once caracteres, nunca la direccion completa.
 * Dos razones, y la segunda es la que de verdad importa:
 *
 *   · El mismo video llega escrito de seis formas y todas son legitimas:
 *     `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`, con `&t=90`,
 *     con el `?si=` que agrega el boton de compartir, con `&list=` si salio de
 *     una lista. Guardar la cadena entera obligaria a que cada pantalla que la
 *     use las entienda todas, y la que se olvide de una enseña un video roto.
 *
 *   · Guardar una URL cualquiera y meterla despues en un `iframe` es dejar que
 *     quien pueda editar un curso incruste el sitio que quiera DENTRO del
 *     sistema, con la sesion de quien lo mire. Con el identificador, la
 *     direccion la ARMA el producto: siempre apunta a YouTube y no hay forma
 *     de que apunte a otra cosa.
 *
 * LO MISMO ESTA ESCRITO EN LA BASE (`app.identificador_de_youtube`) y no es
 * una copia por descuido: esta comprobacion es para decirlo bien y a tiempo
 * mientras alguien escribe; la de alla es para que sea VERDAD aunque llamen a
 * la funcion a mano desde la consola. La pantalla siempre se puede saltar.
 */

/** Los once caracteres que YouTube usa como identificador. */
const IDENTIFICADOR = /^[A-Za-z0-9_-]{11}$/;

/**
 * Las formas en que llega un enlace. El orden no importa: son excluyentes.
 *
 * `youtu.be/` va con su punto escapado a proposito — sin escapar, un punto
 * cualquiera casaria y `youtuXbe/ID` se daria por bueno.
 */
const FORMAS = /(?:v=|\/embed\/|\/shorts\/|\/live\/|youtu\.be\/|\/v\/)([A-Za-z0-9_-]{11})/;

/**
 * El identificador de lo que sea que hayan pegado. `null` si no lo reconoce.
 *
 * NUNCA SE INVENTA UNO. Devolver algo parecido ante un enlace que no se
 * entiende produce un reproductor con un video ajeno dentro de la ficha de un
 * curso — y nadie lo revisa despues de guardar.
 */
export function identificadorDeYoutube(texto: string | null | undefined): string | null {
  const limpio = (texto ?? '').trim();
  if (limpio === '') return null;
  // Ya viene pelado. Es lo que devuelve la base, asi que este caso es el que
  // se da al reabrir un curso guardado.
  if (IDENTIFICADOR.test(limpio)) return limpio;
  const encontrado = FORMAS.exec(limpio);
  return encontrado?.[1] ?? null;
}

/** ¿Esto se puede guardar? Vacio SI se puede: es quitar el video. */
export function elVideoSirve(texto: string): boolean {
  return texto.trim() === '' || identificadorDeYoutube(texto) !== null;
}

/**
 * LA DIRECCION DEL REPRODUCTOR, armada aqui y con `nocookie`.
 *
 * `youtube-nocookie.com` es el dominio de YouTube que no deja cookies de
 * seguimiento hasta que alguien le da al play. Un centro de terapias enseña
 * esta pagina a sus pacientes: no tiene por que rastrearlos para que vean de
 * que va un taller.
 *
 * `rel=0` mantiene los videos sugeridos del final dentro del mismo canal. Sin
 * eso, al terminar el video de presentacion del taller de Reiki, YouTube
 * ofrece lo que le da la gana encima de la ficha del curso.
 */
export function direccionDelReproductor(identificador: string): string {
  return `https://www.youtube-nocookie.com/embed/${identificador}?rel=0`;
}

/**
 * LA MINIATURA, para las listas.
 *
 * `hqdefault` existe para TODOS los videos. `maxresdefault` no —solo si el
 * original se subio en alta— y cuando falta, YouTube devuelve una imagen gris
 * de 120x90 que en una tarjeta se ve como si el curso tuviera la foto rota.
 */
export function miniaturaDelVideo(identificador: string): string {
  return `https://i.ytimg.com/vi/${identificador}/hqdefault.jpg`;
}

/** La direccion para ABRIRLO en YouTube, cuando alguien prefiere verlo alla. */
export function direccionEnYoutube(identificador: string): string {
  return `https://www.youtube.com/watch?v=${identificador}`;
}
