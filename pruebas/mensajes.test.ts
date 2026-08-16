/**
 * LA CAPA DE DATOS DE MENSAJES.
 *
 * Lo que se prueba no es que la base cuente bien —eso lo hace ella— sino que el
 * navegador NO INVENTE nada cuando falta algo. Un módulo de mensajería a medias
 * tiene que salir vacío de verdad, no reventar y no rellenar huecos con cifras
 * que nadie calculó.
 */

import { describe, expect, it } from 'vitest';
import {
  BANDEJAS,
  COMO_SE_DICE_EL_CANAL,
  COMO_SE_DICE_EL_MENSAJE,
  LO_QUE_TOCA_UN_MENSAJE,
  llaveDeConversaciones,
  llaveDelHilo,
  ordenarCanal,
  ordenarConversacion,
  ordenarMensaje,
  ordenarPaginaDeConversaciones,
  ordenarPlantilla,
  ordenarResumen,
} from '../src/datos/mensajes.js';

describe('una respuesta vacía sale vacía, no revienta', () => {
  it('la página de conversaciones', () => {
    // Pasa el primer día de uso, que es justo cuando alguien abre el módulo por
    // primera vez. Si esto tirara la pantalla, el módulo estaría roto para
    // quien lo estrena.
    const p = ordenarPaginaDeConversaciones(null);
    expect(p.total).toBe(0);
    expect(p.filas).toEqual([]);
    expect(p.cuentas).toEqual({ todas: 0, noLeidas: 0, pendientes: 0, archivadas: 0 });
  });

  it('el resumen', () => {
    const r = ordenarResumen(null);
    expect(r.activas).toBe(0);
    expect(r.enviados).toBe(0);
    expect(r.hayComparacion).toBe(false);
  });

  it('una conversación sin nada', () => {
    const c = ordenarConversacion({});
    expect(c.cliente).toBeNull();
    expect(c.etiquetas).toEqual([]);
    expect(c.ultimo).toBeNull();
    expect(c.sinLeer).toBe(0);
  });
});

describe('lo que puede no saberse llega como null, NO como cero', () => {
  it('la tasa y el tiempo de respuesta', () => {
    /**
     * "0% de respuesta" afirma que no se contestó a nadie. Sin conversaciones
     * que respondieran, lo cierto es que no había a quién — y son dos cosas
     * distintas que se leen igual.
     */
    const r = ordenarResumen({ enviados: 3 });
    expect(r.tasaRespuesta).toBeNull();
    expect(r.minutosDeRespuesta).toBeNull();
    // Y lo que SIEMPRE tiene respuesta sigue siendo un número.
    expect(r.enviados).toBe(3);
  });

  it('un cero de verdad se conserva', () => {
    const r = ordenarResumen({ tasaRespuesta: 0, minutosDeRespuesta: 0 });
    expect(r.tasaRespuesta).toBe(0);
    expect(r.minutosDeRespuesta).toBe(0);
  });

  it('una conversación sin cliente identificado no se rellena', () => {
    // Inventarle una ficha llenaría el directorio de personas llamadas como su
    // teléfono.
    const c = ordenarConversacion({ contacto: '646 000 0000' });
    expect(c.clienteId).toBeNull();
    expect(c.cliente).toBeNull();
    expect(c.contacto).toBe('646 000 0000');
  });
});

describe('lo que llega raro se cae del lado seguro', () => {
  it('una dirección desconocida se trata como saliente', () => {
    expect(ordenarMensaje({ direccion: 'vete a saber' }).direccion).toBe('saliente');
    expect(ordenarMensaje({ direccion: 'entrante' }).direccion).toBe('entrante');
  });

  it('un mensaje sin estado queda PENDIENTE, nunca enviado', () => {
    // Es la caída segura: dar por enviado algo que no lo está es dar por
    // avisado a alguien que nunca supo nada.
    expect(ordenarMensaje({}).estado).toBe('pendiente');
  });

  it('un canal sin estado queda SIN CONECTAR', () => {
    // Igual: un canal que se dice conectado sin serlo hace fallar cada envío
    // culpando al mensaje.
    expect(ordenarCanal({}).estado).toBe('sin_conectar');
    expect(ordenarCanal({}).tipo).toBe('manual');
  });

  it('una plantilla sin categoría cae en "general"', () => {
    expect(ordenarPlantilla({ nombre: 'X' }).categoria).toBe('general');
  });
});

describe('las llaves de cache', () => {
  it('cambian con la bandeja, el texto, la etiqueta y la tanda', () => {
    /**
     * Sin esto, pasar de "Todas" a "Pendientes" devolvería la lista anterior
     * desde la cache: las mismas conversaciones con otra pestaña marcada, sin
     * error y sin aviso.
     */
    const base = llaveDeConversaciones('n', 'todas', '', '', 12);
    expect(base).not.toBe(llaveDeConversaciones('n', 'pendientes', '', '', 12));
    expect(base).not.toBe(llaveDeConversaciones('n', 'todas', 'ana', '', 12));
    expect(base).not.toBe(llaveDeConversaciones('n', 'todas', '', 'e1', 12));
    expect(base).not.toBe(llaveDeConversaciones('n', 'todas', '', '', 24));
  });

  it('separa centros', () => {
    expect(llaveDeConversaciones('n1', 'todas', '', '', 12))
      .not.toBe(llaveDeConversaciones('n2', 'todas', '', '', 12));
  });

  it('todo cuelga del prefijo "mensajes"', () => {
    // Es lo que hace que responder refresque a la vez la lista, los contadores
    // de las cuatro pestañas y las cifras de arriba.
    expect(llaveDeConversaciones('n', 'todas', '', '', 12).startsWith('mensajes')).toBe(true);
    expect(llaveDelHilo('c1').startsWith('mensajes')).toBe(true);
    expect(LO_QUE_TOCA_UN_MENSAJE).toContain('mensajes');
  });

  it('toda operación refresca Clientes y el tablero de Inicio', () => {
    // Clientes porque una conversación puede acabar de atarse a una ficha;
    // Inicio porque lo exige la guardia 11.
    expect(LO_QUE_TOCA_UN_MENSAJE).toContain('clientes');
    expect(LO_QUE_TOCA_UN_MENSAJE).toContain('inicio');
  });
});

describe('lo que se dice de cada cosa', () => {
  it('un mensaje pendiente NO se llama enviado', () => {
    expect(COMO_SE_DICE_EL_MENSAJE.pendiente).toBe('Sin enviar');
    expect(COMO_SE_DICE_EL_MENSAJE.fallido).toBe('No se pudo enviar');
  });

  it('las cuatro bandejas del diseño, en su orden', () => {
    expect(BANDEJAS.map((b) => b.clave))
      .toEqual(['todas', 'no_leidas', 'pendientes', 'archivadas']);
  });

  it('el canal manual dice que solo deja constancia', () => {
    expect(COMO_SE_DICE_EL_CANAL.manual).toBe('Anotado a mano');
  });
});
