import { describe, expect, it } from 'vitest';
import { estilosDelProducto } from '../src/estilos.js';
import { cimientos } from '../src/estilo/cimientos.js';

/**
 * SE MIRA LA HOJA SIN COMENTARIOS, y esta linea existe porque la prueba me
 * grito en falso.
 *
 * El buscador de declaraciones encontro la palabra "color:" DENTRO de un
 * comentario —"a todo color: es una pista de que se puede abrir"— y acuso a un
 * texto en prosa de ser un color escrito a mano. Es exactamente la leccion que
 * las guardias ya tenian escrita: una guardia que se cree los comentarios grita
 * en falso, y una guardia que grita en falso se termina apagando.
 */
const css = estilosDelProducto().replace(/\/\*[\s\S]*?\*\//g, '');

describe('los estilos del producto no traen colores propios', () => {
  it('ni un color escrito a mano', () => {
    // Los cuatro de la identidad viven en marca.ts y pasan la prueba de
    // contraste. Cualquier otro se saltaria esa prueba sin que nadie lo note.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });

  it('todo lo que es color sale de una variable de la base', () => {
    /**
     * TAMBIEN VALE UN TOKEN "--centro-", pero no por su nombre: se comprueba
     * que su definicion en `cimientos.ts` salga de un token de la base.
     *
     * El Centro afina unas cuantas cosas que el diseño pide distintas —el borde
     * de tarjeta, la sombra, el velo— y lo hace con variables propias en vez de
     * pisar las de la base, porque pisar `--neron-borde` cambiaria tambien el
     * borde de los campos de los formularios. Pero cada una se DERIVA de un
     * token de la base con `color-mix`, asi que sigue heredando el tema y la
     * prueba de contraste.
     *
     * Aceptar "--centro-" a ciegas seria dejar una puerta abierta: bastaria
     * inventarse un `--centro-lo-que-sea: hotpink` para saltarse la regla.
     */
    const definiciones = new Map<string, string>();
    for (const m of cimientos().matchAll(/(--centro-[a-z-]+)\s*:\s*([^;]+);/g)) {
      definiciones.set(m[1]!, m[2]!);
    }

    const declaraciones = css.match(/(?:^|\s)(?:color|background|border-color):[^;]+;/g) ?? [];
    expect(declaraciones.length).toBeGreaterThan(5);
    for (const d of declaraciones) {
      const valor = d.slice(d.indexOf(':') + 1, -1).trim().toLowerCase();
      if (['transparent', 'inherit', 'currentcolor', 'none'].includes(valor)) continue;
      if (d.includes('var(--neron-')) continue;

      const propio = /var\((--centro-[a-z-]+)\)/.exec(d);
      expect(propio, `no sale de ningun token: ${d.trim()}`).not.toBeNull();

      const comoSeDefine = definiciones.get(propio![1]!);
      expect(comoSeDefine, `${propio![1]!} no esta definido en cimientos.ts`).toBeDefined();
      expect(
        comoSeDefine,
        `${propio![1]!} no se deriva de un token de la base: ${String(comoSeDefine)}`,
      ).toContain('var(--neron-');
    }
  });
});

describe('lo que evita que la pantalla se rompa', () => {
  it('la aplicacion NUNCA tiene scroll horizontal', () => {
    // Es de las cosas que mas se sienten rotas en el celular: la pagina se
    // corre de lado y el menu queda a medias.
    expect(css).toMatch(/body\s*\{[^}]*overflow-x: hidden/s);
  });

  it('los titulos largos parten en lugar de salirse de la caja', () => {
    expect(css).toContain('overflow-wrap: anywhere');
  });

  it('respeta el notch del celular', () => {
    expect(css).toContain('env(safe-area-inset-bottom)');
  });

  it('usa la altura real del celular, no la que miente con la barra', () => {
    // Con `100vh`, en el celular la caja queda debajo de la barra del
    // navegador y el boton de entrar no se alcanza.
    expect(css).toContain('100dvh');
    expect(css).not.toMatch(/min-height: 100vh/);
  });
});

describe('accesibilidad', () => {
  it('la animacion de carga se apaga para quien pide menos movimiento', () => {
    // Para algunas personas no es un detalle bonito: es un mareo.
    expect(css).toMatch(/prefers-reduced-motion[^}]*\{[^}]*animation: none/s);
  });

  it('el error de entrar no depende solo del color', () => {
    expect(css).toMatch(/\.terapias-entrar__error\s*\{[^}]*border-left/s);
  });

  it('la buena noticia del alta tampoco depende solo del color', () => {
    // El verde solo no le dice nada a quien no lo distingue, ni a quien mira
    // la tableta del mostrador con el sol encima.
    expect(css).toMatch(/\.terapias-entrar__aviso\s*\{[^}]*border-left/s);
  });
});
