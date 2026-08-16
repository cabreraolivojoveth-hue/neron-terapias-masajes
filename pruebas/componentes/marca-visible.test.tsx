/**
 * @vitest-environment happy-dom
 *
 * La marca de la barra lateral. Desde el bloque 10 el nombre y el lema NO
 * estan escritos aqui: se resuelven al leer, igual que el nombre de un
 * paciente en una cita. Estas pruebas vigilan las dos mitades — que se pinte
 * lo que dice el centro, y que mientras no llega no se quede un hueco.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const traido = vi.hoisted(() => ({ valor: null as unknown }));

vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({
    rpc: () => Promise.resolve({ data: traido.valor, error: null }),
  }),
  clienteParaLaBase: () => { throw new Error('no se usa en pruebas'); },
}));

vi.mock('../../src/identidad/sesion.js', () => ({
  useSesion: () => ({
    estado: 'listo',
    acceso: { negocioId: 't_centro', permisos: {} },
    llave: 'x',
    fallo: null,
    cerrarSesion: async () => {},
    refrescar: async () => {},
  }),
}));

const { MarcaVisible } = await import('../../src/marco/marca-visible.js');
const { LEMA_POR_OMISION, NOMBRE_POR_OMISION } = await import('../../src/datos/configuracion.js');
const { olvidarTodo } = await import('../../src/datos/consulta.js');

afterEach(() => {
  cleanup();
  olvidarTodo();
  traido.valor = null;
});

describe('la marca de la barra lateral', () => {
  it('muestra la hoja Y el nombre, no solo la hoja', () => {
    // El marco de la base pinta el logo EN LUGAR del nombre. Por eso el
    // producto le entrega un nodo que ya trae las dos cosas.
    const { container } = render(<MarcaVisible />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByText(NOMBRE_POR_OMISION)).toBeDefined();
  });

  it('mientras no llega la respuesta, pinta el nombre de arranque', () => {
    /*
     * Un hueco en la barra lateral durante el primer segundo se ve exactamente
     * como una barra rota. El nombre por omisión es el del producto, no un
     * dato inventado de nadie.
     */
    render(<MarcaVisible />);
    expect(screen.getByText(NOMBRE_POR_OMISION)).toBeDefined();
    expect(screen.getByText(LEMA_POR_OMISION)).toBeDefined();
  });

  it('cuando el centro tiene otro nombre, pinta ESE', async () => {
    // Es la regla del §5 aplicada al propio producto: el nombre se resuelve al
    // leer, jamás se copia. Renombrar el centro cambia la barra lateral sin
    // tocar una línea de código.
    traido.valor = { nombre: 'Otro centro', centro: { lema: 'Otro lema' } };
    render(<MarcaVisible />);
    await waitFor(() => expect(screen.getByText('Otro centro')).toBeDefined());
    expect(screen.getByText('Otro lema')).toBeDefined();
  });
});
