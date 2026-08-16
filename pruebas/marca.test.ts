import { contraste } from '@neron/base/ui';
import { CLARO, OSCURO } from '@neron/base/ui';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cssDeMarca, MARCA_CLARO, MARCA_OSCURO } from '../src/marca.js';
import { LEMA_POR_OMISION, NOMBRE_POR_OMISION } from '../src/datos/configuracion.js';

/** El minimo de la norma AA para texto normal. */
const AA = 4.5;
/** El minimo para bordes y elementos que no son texto. */
const AA_NO_TEXTO = 3;

describe('el verde del Centro se lee de verdad', () => {
  it('en claro: lo que va encima del verde pasa AA', () => {
    // El primer candidato, #5a8a4a, se cayo en 4.06:1. Se bajo el tono hasta
    // que paso. Un verde bonito que no se lee con el sol encima no sirve.
    expect(contraste(MARCA_CLARO.sobreMarca, MARCA_CLARO.marca)).toBeGreaterThanOrEqual(AA);
  });

  it('en claro: el texto normal se lee sobre el fondo tenue de marca', () => {
    expect(contraste(CLARO.texto, MARCA_CLARO.marcaTenue)).toBeGreaterThanOrEqual(AA);
  });

  it('en claro: el verde se distingue del fondo de la pagina', () => {
    // Es lo que hace visible la pastilla del modulo activo en el menu.
    expect(contraste(MARCA_CLARO.marca, CLARO.fondo)).toBeGreaterThanOrEqual(AA_NO_TEXTO);
  });

  it('el verde fuerte es MAS oscuro que el normal, no mas claro', () => {
    // Se usa para el paso del raton. Si fuera mas claro, el boton pareceria
    // apagarse al tocarlo.
    expect(contraste(MARCA_CLARO.marcaFuerte, CLARO.fondo))
      .toBeGreaterThan(contraste(MARCA_CLARO.marca, CLARO.fondo));
  });

  it('en oscuro: el verde se aclara, no se apaga', () => {
    // No es el mismo color con otro brillo. Sobre fondo oscuro un verde
    // oscuro desaparece: se invierte la relacion.
    expect(contraste(MARCA_OSCURO.marca, OSCURO.fondo)).toBeGreaterThanOrEqual(AA);
    expect(contraste(MARCA_OSCURO.sobreMarca, MARCA_OSCURO.marca)).toBeGreaterThanOrEqual(AA);
  });

  it('en oscuro: el texto se lee sobre el fondo tenue de marca', () => {
    expect(contraste(OSCURO.texto, MARCA_OSCURO.marcaTenue)).toBeGreaterThanOrEqual(AA);
  });
});

describe('las variables que se le pegan al documento', () => {
  it('pone los cuatro tokens de marca, en los dos temas', () => {
    const css = cssDeMarca();
    for (const t of ['marca', 'marca-fuerte', 'marca-tenue', 'sobre-marca']) {
      expect(css.match(new RegExp(`--neron-${t}:`, 'g'))?.length, t).toBe(2);
    }
  });

  it('el tema oscuro va DESPUES, para que gane cuando aplica', () => {
    const css = cssDeMarca();
    expect(css.indexOf('[data-tema="oscuro"]')).toBeGreaterThan(css.indexOf(':root'));
  });

  it('usa los mismos nombres de variable que la base', () => {
    // Si el producto inventara `--terapias-marca`, la base seguiria pintando
    // con su verde neutro y nadie entenderia por que.
    expect(cssDeMarca()).toContain('--neron-marca:');
    expect(cssDeMarca()).not.toContain('--terapias-');
  });
});

describe('el nombre del centro', () => {
  it('YA NO VIVE EN marca.ts: lo administra Configuracion', () => {
    /*
     * Estuvieron aqui con un comentario que decia "hasta que Configuracion lo
     * administre". Ya lo administra: el nombre sale de `negocio.nombre` y el
     * lema del bloque de configuracion. Lo que queda son los valores de
     * ARRANQUE, para las pantallas que se pintan SIN sesion —entrar y "falta
     * configurar la conexion"—, donde no hay a quien preguntarle como se llama
     * el centro.
     */
    expect(NOMBRE_POR_OMISION.length).toBeGreaterThan(0);
    expect(LEMA_POR_OMISION.length).toBeGreaterThan(0);
  });

  it('y marca.ts se quedo SOLO con los colores', async () => {
    const marca: Record<string, unknown> = await import('../src/marca.js');
    expect(marca['NOMBRE_DEL_PRODUCTO']).toBeUndefined();
    expect(marca['LEMA']).toBeUndefined();
  });
});

describe('el icono de la pestaña', () => {
  /*
   * El unico color del producto que vive FUERA de este archivo: va incrustado
   * en el HTML porque el navegador pide el icono antes de que exista una linea
   * de JavaScript, asi que no puede salir de una variable.
   *
   * Que este fuera es justo el motivo de esta prueba: es el sitio donde el
   * verde se quedaria desfasado sin que nadie lo notara —una pestaña de un
   * verde y una pantalla de otro— porque ninguna guardia mira el HTML.
   */
  const paginas = ['index.html', 'pruebas-visuales/index.html'];

  it('existe en las dos paginas', () => {
    for (const p of paginas) {
      expect(readFileSync(p, 'utf8'), `${p} no lleva icono`).toContain('rel="icon"');
    }
  });

  it('y va del mismo verde que la marca', () => {
    const verde = MARCA_CLARO.marca.replace('#', '%23');
    for (const p of paginas) {
      expect(readFileSync(p, 'utf8'), `${p} tiene otro verde`).toContain(verde);
    }
  });
});
