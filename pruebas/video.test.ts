/**
 * EL VIDEO DE PRESENTACION DE UN CURSO.
 *
 * Estas pruebas existen porque el mismo video llega escrito de seis formas
 * distintas y todas son legitimas: la de la barra de direcciones, la del boton
 * de compartir, la de insertar, la de los verticales, la de las transmisiones,
 * y cualquiera de ellas con parametros pegados detras.
 *
 * Y porque lo que NO se reconoce tiene que devolver `null` y no algo parecido:
 * inventar un identificador ante un enlace raro pone un video ajeno dentro de
 * la ficha de un curso, y eso nadie lo revisa despues de guardar.
 */

import { describe, expect, it } from 'vitest';
import {
  direccionDelReproductor,
  direccionEnYoutube,
  elVideoSirve,
  identificadorDeYoutube,
  miniaturaDelVideo,
} from '../src/cursos/video.js';

/* Once caracteres inventados aqui, no de ningun video real. */
const ID = 'aB3_dE6-hI9';

describe('las formas en que llega un enlace de YouTube', () => {
  it('la de la barra de direcciones', () => {
    expect(identificadorDeYoutube(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it('la del botón de compartir', () => {
    expect(identificadorDeYoutube(`https://youtu.be/${ID}`)).toBe(ID);
  });

  it('la de insertar', () => {
    expect(identificadorDeYoutube(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
  });

  it('los verticales y las transmisiones', () => {
    expect(identificadorDeYoutube(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(identificadorDeYoutube(`https://www.youtube.com/live/${ID}`)).toBe(ID);
  });

  it('con los parámetros que se pegan detrás', () => {
    // El "?si=" lo agrega el propio boton de compartir, asi que es lo que mas
    // veces se va a pegar de verdad.
    expect(identificadorDeYoutube(`https://youtu.be/${ID}?si=abcdefg`)).toBe(ID);
    expect(identificadorDeYoutube(`https://www.youtube.com/watch?v=${ID}&t=90s`)).toBe(ID);
    expect(identificadorDeYoutube(`https://www.youtube.com/watch?v=${ID}&list=PL123`)).toBe(ID);
  });

  it('ya pelado — que es como vuelve de la base al reabrir el curso', () => {
    expect(identificadorDeYoutube(ID)).toBe(ID);
  });

  it('con espacios alrededor, que es como se pega desde el portapapeles', () => {
    expect(identificadorDeYoutube(`  https://youtu.be/${ID}  `)).toBe(ID);
  });
});

describe('lo que NO se reconoce devuelve nulo', () => {
  it('vacío y nulo', () => {
    expect(identificadorDeYoutube('')).toBeNull();
    expect(identificadorDeYoutube('   ')).toBeNull();
    expect(identificadorDeYoutube(null)).toBeNull();
    expect(identificadorDeYoutube(undefined)).toBeNull();
  });

  it('otro sitio de video', () => {
    expect(identificadorDeYoutube('https://vimeo.com/123456789')).toBeNull();
  });

  it('un identificador que no mide once', () => {
    expect(identificadorDeYoutube('https://youtu.be/corto')).toBeNull();
  });

  it('el punto de "youtu.be" no es un comodín', () => {
    // Sin escapar el punto en la expresion, esto se daria por bueno.
    expect(identificadorDeYoutube(`https://youtuXbe/${ID}`)).toBeNull();
  });

  it('texto suelto que no es un enlace', () => {
    expect(identificadorDeYoutube('el taller de reiki nivel dos')).toBeNull();
  });
});

describe('elVideoSirve: vacío SÍ sirve, porque es quitar el video', () => {
  it('acepta el vacío', () => {
    expect(elVideoSirve('')).toBe(true);
    expect(elVideoSirve('   ')).toBe(true);
  });

  it('acepta un enlace bueno y rechaza uno que no lo es', () => {
    expect(elVideoSirve(`https://youtu.be/${ID}`)).toBe(true);
    expect(elVideoSirve('https://vimeo.com/123')).toBe(false);
  });
});

describe('las direcciones las arma el producto', () => {
  it('el reproductor va por nocookie y sin sugeridos de fuera', () => {
    const d = direccionDelReproductor(ID);
    // Es la razon de que exista esta funcion: un centro de terapias no tiene
    // por que rastrear a sus pacientes para que vean de que va un taller.
    expect(d).toContain('youtube-nocookie.com');
    expect(d).toContain('rel=0');
    expect(d).toContain(ID);
  });

  it('la miniatura usa hqdefault, que existe para todos los videos', () => {
    // `maxresdefault` falta cuando el original no se subio en alta, y entonces
    // YouTube devuelve un gris de 120x90 que parece una foto rota.
    expect(miniaturaDelVideo(ID)).toContain('hqdefault');
  });

  it('la de abrirlo en YouTube es la normal', () => {
    expect(direccionEnYoutube(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});
