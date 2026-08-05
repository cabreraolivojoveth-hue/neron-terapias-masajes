import { describe, expect, it } from 'vitest';
import { estilosDelProducto } from '../src/estilos.js';

const css = estilosDelProducto();

describe('los estilos del producto no traen colores propios', () => {
  it('ni un color escrito a mano', () => {
    // Los cuatro de la identidad viven en marca.ts y pasan la prueba de
    // contraste. Cualquier otro se saltaria esa prueba sin que nadie lo note.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });

  it('todo lo que es color sale de una variable de la base', () => {
    const declaraciones = css.match(/(?:^|\s)(?:color|background|border-color):[^;]+;/g) ?? [];
    expect(declaraciones.length).toBeGreaterThan(5);
    for (const d of declaraciones) {
      const valor = d.slice(d.indexOf(':') + 1, -1).trim().toLowerCase();
      if (['transparent', 'inherit', 'currentcolor', 'none'].includes(valor)) continue;
      expect(d, `no sale de un token: ${d.trim()}`).toContain('var(--neron-');
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
});
