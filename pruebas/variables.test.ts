/**
 * LAS VARIABLES DE UNA PLANTILLA.
 *
 * Lo que se vigila es la decisión que sostiene el archivo: cuando falta un dato,
 * la variable SE QUEDA ESCRITA y se reporta. Las otras dos salidas mandan
 * mensajes de verdad a personas de verdad — "Hola , te esperamos el ." o, peor,
 * el nombre de otra.
 */

import { describe, expect, it } from 'vitest';
import {
  VARIABLES,
  rellenarPlantilla,
  valorDeLaVariable,
  variablesDe,
  variablesDesconocidas,
} from '../src/mensajes/variables.js';

describe('rellenar con lo que de verdad se sabe', () => {
  it('sustituye lo que hay', () => {
    const { texto } = rellenarPlantilla('Hola {{cliente.nombre}}, te esperamos.', {
      cliente: { nombre: 'Quien viene' },
    });
    expect(texto).toBe('Hola Quien viene, te esperamos.');
  });

  it('lo que NO se sabe se queda escrito y se reporta', () => {
    /**
     * Es la regla del archivo. Sustituir por vacío mandaría "te esperamos el ."
     * sin fallar, sin avisar, y llegando al cliente. Dejándola escrita, quien va
     * a enviar la ve en el cuadro de texto antes de tocar el botón.
     */
    const { texto, faltantes } = rellenarPlantilla(
      'Hola {{cliente.nombre}}, te esperamos el {{cita.fecha}}.',
      { cliente: { nombre: 'Quien viene' } },
    );
    expect(texto).toBe('Hola Quien viene, te esperamos el {{cita.fecha}}.');
    expect(faltantes).toEqual(['cita.fecha']);
  });

  it('un valor VACIO cuenta como que no se sabe', () => {
    // "Hola  " es el mismo problema que "Hola {{cliente.nombre}}", pero sin
    // avisar de nada.
    const { texto, faltantes } = rellenarPlantilla('Hola {{cliente.nombre}}.', {
      cliente: { nombre: '   ' },
    });
    expect(texto).toBe('Hola {{cliente.nombre}}.');
    expect(faltantes).toEqual(['cliente.nombre']);
  });

  it('un contexto vacío no revienta: todo se queda escrito', () => {
    const { faltantes } = rellenarPlantilla('{{cliente.nombre}} {{cita.hora}}', {});
    expect(faltantes).toEqual(['cliente.nombre', 'cita.hora']);
  });

  it('la misma variable dos veces se reporta una', () => {
    const { faltantes } = rellenarPlantilla('{{cita.fecha}} y {{cita.fecha}}', {});
    expect(faltantes).toEqual(['cita.fecha']);
  });

  it('aguanta espacios dentro de las llaves', () => {
    const { texto } = rellenarPlantilla('Hola {{ cliente.nombre }}', {
      cliente: { nombre: 'Alguien' },
    });
    expect(texto).toBe('Hola Alguien');
  });
});

describe('el valor de una llave', () => {
  it('lee el grupo y el campo', () => {
    expect(valorDeLaVariable('cliente.telefono', { cliente: { telefono: '646' } })).toBe('646');
  });

  it('un grupo que no existe da null, no revienta', () => {
    expect(valorDeLaVariable('inventado.cosa', { cliente: { nombre: 'X' } })).toBeNull();
    expect(valorDeLaVariable('sinpunto', {})).toBeNull();
  });
});

describe('las variables mal escritas se cazan al EDITAR', () => {
  it('una que no existe se reporta', () => {
    // `{{cliente.nombe}}` no falla nunca: viaja tal cual hasta el teléfono del
    // cliente. Por eso se avisa al escribir la plantilla, no al enviarla.
    expect(variablesDesconocidas('Hola {{cliente.nombe}}')).toEqual(['cliente.nombe']);
  });

  it('las buenas no se reportan', () => {
    expect(variablesDesconocidas('{{cliente.nombre}} {{cita.hora}}')).toEqual([]);
  });

  it('se listan las que usa una plantilla', () => {
    expect(variablesDe('{{cliente.nombre}} y {{curso.nombre}}'))
      .toEqual(['cliente.nombre', 'curso.nombre']);
  });
});

describe('el catálogo de variables', () => {
  it('todas las que se ofrecen se pueden resolver de verdad', () => {
    /**
     * Si se ofreciera una variable que `valorDeLaVariable` no sabe leer, quien
     * la toque en la pantalla se llevaría un texto que nunca se rellena. La
     * lista y el lector tienen que hablar del mismo juego.
     */
    const contexto = {
      cliente: { nombre: 'a', telefono: 'b', correo: 'c' },
      cita: { fecha: 'd', hora: 'e', servicio: 'f', profesional: 'g' },
      servicio: { nombre: 'h', precio: 'i' },
      curso: { nombre: 'j', inicio: 'k' },
      centro: { nombre: 'l' },
    };
    for (const v of VARIABLES) {
      expect(valorDeLaVariable(v.llave, contexto), `${v.llave} no se resuelve`).not.toBeNull();
    }
  });
});
