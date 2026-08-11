/**
 * EL MOVIMIENTO.
 *
 * Lo que se vigila aqui es lo que hace daño de verdad: una animacion que no se
 * apaga para quien pide menos movimiento —que para algunas personas no es un
 * detalle bonito, es mareo— y una animacion larga, que se disfruta tres veces
 * y estorba las otras doscientas del dia.
 */

import { describe, expect, it } from 'vitest';
import { movimiento } from '../src/estilo/movimiento.js';
import { armadura } from '../src/estilo/armadura.js';

const css = movimiento();

describe('se apaga entero para quien lo pida', () => {
  it('hay un bloque de reducir movimiento', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('y apaga TODO de un golpe, no regla por regla', () => {
    // Apagarlas una por una garantiza que la proxima se olvide.
    const bloque = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    expect(bloque).toContain('*, *::before, *::after');
    expect(bloque).toContain('animation-duration');
    expect(bloque).toContain('transition-duration');
    expect(bloque).toContain('scroll-behavior: auto');
  });

  it('lo apaga con !important, o las reglas de arriba le ganan', () => {
    const bloque = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    expect(bloque.match(/!important/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

describe('rapido o no sirve', () => {
  it('ninguna animacion escrita a mano pasa de 900ms', () => {
    // Quien cobra en un mostrador no esta viendo una presentacion. El unico
    // valor alto es el brillo del esqueleto, que se repite mientras carga.
    const duraciones = [...css.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
    for (const d of duraciones) expect(d).toBeLessThanOrEqual(900);
  });

  it('el escalonado no deja al ultimo esperando eternamente', () => {
    const retrasos = [...css.matchAll(/animation-delay: (\d+)ms/g)].map((m) => Number(m[1]));
    expect(retrasos.length).toBeGreaterThan(4);
    expect(Math.max(...retrasos)).toBeLessThanOrEqual(300);
  });
});

describe('cada animacion que se usa existe', () => {
  it('no se referencia ningun fotograma que no este declarado', () => {
    // Una animacion con nombre mal escrito no revienta: simplemente no pasa
    // nada, y eso se descubre semanas despues.
    const declarados = new Set(
      [...css.matchAll(/@keyframes ([a-z-]+)/g)].map((m) => m[1]!),
    );
    const usados = [...css.matchAll(/animation: ([a-z-]+)/g)].map((m) => m[1]!);
    expect(usados.length).toBeGreaterThan(3);
    for (const u of usados) {
      expect(declarados.has(u), `se usa "${u}" y no esta declarado`).toBe(true);
    }
  });
});

describe('solo se levanta lo que se puede tocar', () => {
  it('el hover vive dentro de una consulta de puntero', () => {
    // En una tableta no hay puntero: sin esto, el "levantar" se queda pegado
    // despues de tocar y la tarjeta se ve rota.
    const i = css.indexOf('.mv-levanta:hover');
    const antes = css.slice(0, i);
    expect(antes.lastIndexOf('@media (hover: hover)')).toBeGreaterThan(
      antes.lastIndexOf('}\n\n/*'),
    );
  });
});

describe('ni un color escrito a mano', () => {
  it('nada de hex ni de rgb', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });
});

describe('lo que se mueve, y lo que a proposito no', () => {
  it('todo lo que anima se declara con nombre', () => {
    // Se declaran con nombre para poder apagarlas TODAS de un golpe en el
    // bloque de prefers-reduced-motion, sin acordarse regla por regla.
    const nombres = [...css.matchAll(/@keyframes\s+([a-z-]+)/g)].map((m) => m[1]!);
    for (const usada of [...css.matchAll(/animation:\s*([a-z-]+)/g)].map((m) => m[1]!)) {
      expect(nombres, `se anima "${usada}" y no esta declarada`).toContain(usada);
    }
  });

  it('las duraciones salen de los tokens, no escritas a mano', () => {
    /*
     * Una animacion de medio segundo se disfruta las tres primeras veces y
     * estorba las otras doscientas del dia. El limite no se vigila numero por
     * numero: se vigila que NINGUNA duracion se escriba suelta, porque asi la
     * unica forma de alargar algo es mover el token — y ahi se piensa dos
     * veces.
     *
     * La unica excepcion es el latido del punto de aviso, que no es una
     * entrada sino un aviso que se repite.
     */
    for (const [decl] of css.matchAll(/animation:[^;]+;/g)) {
      if (decl.includes('mv-late')) continue;
      expect(decl, `duracion escrita a mano: ${decl.trim()}`).toMatch(/var\(--neron-movimiento-/);
    }
  });

  it('el ultimo escalon del escalonado no se hace esperar', () => {
    // Si el octavo renglon entrara medio segundo despues del primero, la lista
    // se sentiria lenta en vez de viva.
    const esperas = [...css.matchAll(/animation-delay:\s*(\d+)ms/g)].map((m) => Number(m[1]));
    expect(esperas.length).toBeGreaterThan(4);
    expect(Math.max(...esperas)).toBeLessThanOrEqual(300);
  });

  it('el escalonado no pasa de ocho pasos', () => {
    // Mas alla, el ultimo renglon tarda tanto que se siente lento en vez de
    // vivo. El octavo y los siguientes comparten el mismo retraso.
    expect(css).toContain('.mv-escalonado > *:nth-child(n+8)');
  });

  it('se apaga TODO para quien pide menos movimiento', () => {
    const apagado = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\}\s*\}/)?.[0] ?? '';
    expect(apagado).toContain('animation-duration: 0.001ms !important');
    expect(apagado).toContain('transition-duration: 0.001ms !important');
    // El selector universal: si se listaran las clases una por una, la
    // siguiente que se agregue se quedaria fuera y nadie lo notaria.
    expect(apagado).toMatch(/\*,\s*\*::before,\s*\*::after/);
  });

  it('levantar solo se ofrece donde hay puntero', () => {
    // En una tableta no hay "pasar por encima": la tarjeta se quedaria
    // levantada despues de tocarla.
    const conPuntero = css.match(/@media \(hover: hover\)\s*\{[\s\S]*?\n\}/g)?.join('\n') ?? '';
    expect(conPuntero).toContain('.mv-levanta:hover');
  });
});

describe('ninguna animacion se queda en efecto al terminar', () => {
  /**
   * ESTO YA SALIO A PRODUCCION Y SE VEIA ROTO, y la causa estaba a tres
   * pantallas del sintoma.
   *
   * `animation-fill-mode: both` deja la animacion EN EFECTO para siempre. Una
   * animacion de `transform` en efecto hace que su elemento compute la matriz
   * identidad en vez de `none`, y un transform que no es `none` convierte al
   * elemento en bloque contenedor de todo lo que lleve `position: fixed`.
   *
   * Cada modulo lleva `mv-pantalla`, asi que cada modulo era una jaula: el velo
   * del modal de "Categorias de cursos" medía 1228x683 en vez de 1536x1024 y
   * salia como una plancha oscura pegada en medio de la pantalla.
   *
   * La guardia 13 lo revienta en la publicacion y `npm run velos` lo comprueba
   * en un navegador de verdad. Esto lo fija en la hoja, que es donde se escribe
   * el error.
   */
  it('el relleno es "backwards" y nunca "both" ni "forwards"', () => {
    const conRelleno = [...css.matchAll(/animation:[^;]+;/g)].map((m) => m[0]);
    expect(conRelleno.length).toBeGreaterThan(4);
    for (const a of conRelleno) {
      expect(a, `esta animacion se queda en efecto: ${a}`).not.toMatch(/\bboth\b/);
      expect(a, `esta animacion se queda en efecto: ${a}`).not.toMatch(/\bforwards\b/);
    }
  });

  it('las entradas terminan en el estado NATURAL del elemento', () => {
    /*
     * Es lo que hace que "backwards" alcance: al terminar, la animacion deja de
     * aplicarse y el elemento vuelve a su regla. Si el ultimo fotograma dejara
     * algo distinto, se veria un salto al final de cada entrada.
     */
    for (const nombre of ['mv-sube', 'mv-entra-derecha', 'mv-resorte']) {
      const cuerpo = css.match(new RegExp(`@keyframes ${nombre}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
      expect(cuerpo, `falta ${nombre}`).not.toBe('');
      expect(cuerpo, `${nombre} no vuelve a transform: none`).toMatch(/to\s*\{[^}]*transform:\s*none/);
      expect(cuerpo, `${nombre} no vuelve a opacidad 1`).toMatch(/to\s*\{[^}]*opacity:\s*1/);
    }
  });

  it('la rayita del menu tiene su estado puesto en la REGLA, no en el relleno', () => {
    /*
     * Es la excepcion, y la unica: la rayita SI tiene que quedar distinta de
     * como empieza. Antes eso se conseguia con "both"; ahora el estado natural
     * de la regla es la rayita puesta y la animacion arranca desde scaleY(0).
     */
    const marco = armadura();
    expect(marco).toMatch(/\.arm-enlace--activo::before\s*\{[^}]*transform:\s*translateY\(-50%\);/);
    expect(css).toMatch(/@keyframes mv-rayita\s*\{[\s\S]*?from[^}]*scaleY\(0\)/);
  });
});
