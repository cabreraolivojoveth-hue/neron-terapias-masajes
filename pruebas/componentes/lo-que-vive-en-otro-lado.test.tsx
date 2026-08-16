/**
 * @vitest-environment happy-dom
 *
 * LO QUE CONFIGURACION NO SE QUEDA.
 *
 * Es la regla mas importante del modulo y la que se rompe sola si nadie la
 * vigila: Configuracion NO absorbe la configuracion de los demas. Estas pruebas
 * comprueban que estas pantallas ENLAZAN y no reimplementan — que no hay ni un
 * campo que guarde algo que ya se guarda en otro sitio.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoQueViveEnOtroLado } from '../../src/configuracion/lo-que-vive-en-otro-lado.js';

afterEach(cleanup);

const AMBITOS = [
  { clave: 'servicio', etiqueta: 'Servicios' },
  { clave: 'gasto', etiqueta: 'Gastos' },
];

const pintar = (cual: string) => {
  const onIr = vi.fn();
  const onCategorias = vi.fn();
  render(
    <LoQueViveEnOtroLado
      cual={cual as 'notificaciones'}
      ambitos={AMBITOS}
      onIr={onIr}
      onCategorias={onCategorias}
    />,
  );
  return { onIr, onCategorias };
};

describe('notificaciones', () => {
  it('NO trae ni un campo que guarde nada: solo enlaza', () => {
    /*
     * Dos pantallas que guardan lo mismo acaban diciendo cosas distintas. La
     * segunda nace copiando a la primera, luego una recibe un arreglo, y a
     * partir de ahi el centro tiene dos verdades sobre a que hora avisar.
     */
    const { container } = render(
      <LoQueViveEnOtroLado cual="notificaciones" ambitos={[]} onIr={vi.fn()} onCategorias={vi.fn()} />,
    );
    expect(container.querySelectorAll('input').length).toBe(0);
    expect(container.querySelectorAll('select').length).toBe(0);
  });

  it('manda a Recordatorios y a Mensajes, que es donde viven', async () => {
    const { onIr } = pintar('notificaciones');
    await userEvent.click(screen.getByRole('button', { name: /configuración de recordatorios/i }));
    expect(onIr).toHaveBeenCalledWith('recordatorios');
  });

  it('repite la limitacion de verdad del aviso del navegador', () => {
    /*
     * Solo funciona con la pestaña abierta. Prometer avisos con todo cerrado es
     * prometer que nadie va a olvidarse de una cita, y eso hoy es mentira.
     */
    pintar('notificaciones');
    expect(screen.getByText(/solo funciona con la pestaña abierta/i)).toBeDefined();
  });
});

describe('etiquetas y categorias', () => {
  it('explica que son UNA SOLA tabla para todo el sistema', () => {
    // Lo que las separa es a que catalogo pertenecen: por eso no hay dos listas
    // que se puedan desincronizar.
    pintar('categorias');
    expect(screen.getByText(/una sola tabla/i)).toBeDefined();
  });

  it('abre la MISMA pantalla compartida, con su ambito', async () => {
    const { onCategorias } = pintar('categorias');
    const botones = screen.getAllByRole('button', { name: /Administrar/ });
    await userEvent.click(botones[1]!);
    expect(onCategorias).toHaveBeenCalledWith('gasto', 'Categorías de gastos');
  });
});

describe('campos personalizados', () => {
  it('dice que NO existen, y que hay mientras tanto', () => {
    /*
     * Es lo mismo que hace la pantalla de un modulo pendiente: decir la verdad
     * completa —que haria, por que no esta y que hacer— es mas util que llenarla
     * de botones que no hacen nada, y no cuesta credibilidad.
     */
    pintar('campos');
    expect(screen.getByText(/Todavía no existen\./)).toBeDefined();
    expect(screen.getByText(/padecimientos, alergias, medicamentos/i)).toBeDefined();
  });
});

describe('integraciones', () => {
  it('dice que no hay ninguna, y por que no puede haberla todavia', () => {
    // Las llaves de un proveedor no pueden vivir en el navegador: cualquiera
    // las veria abriendo las herramientas de desarrollador.
    pintar('integraciones');
    expect(screen.getByText(/No hay ninguna conectada/)).toBeDefined();
    expect(screen.getByText(/no pueden vivir en el navegador/i)).toBeDefined();
  });

  it('y explica la diferencia entre "lo tengo escrito" y "le llegó"', () => {
    // Sin ella se da por avisado a un paciente que nunca supo nada.
    pintar('integraciones');
    expect(screen.getByText(/lo tengo escrito/)).toBeDefined();
  });
});
