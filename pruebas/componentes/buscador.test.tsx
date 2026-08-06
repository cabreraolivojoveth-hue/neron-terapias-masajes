/**
 * @vitest-environment happy-dom
 *
 * EL BUSCADOR GLOBAL.
 *
 * La prueba que justifica este archivo entero es la del foco. Un campo que se
 * desmonta en cada tecla se siente como un sistema roto —escribes "A" y el
 * cursor se sale—, y es un fallo que vuelve solo en cuanto alguien reacomoda
 * el componente sin saber por que estaba asi.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const datos = vi.hoisted(() => ({
  resultados: [] as unknown[],
  llamadas: [] as string[],
}));

vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true, supabase: () => ({}), clienteParaLaBase: () => ({}),
}));

vi.mock('../../src/datos/busqueda.js', async () => {
  const real = await vi.importActual<typeof import('../../src/datos/busqueda.js')>(
    '../../src/datos/busqueda.js',
  );
  return {
    ...real,
    buscarEnTodo: vi.fn(async (_n: string, texto: string) => {
      datos.llamadas.push(texto);
      return datos.resultados;
    }),
  };
});

const { olvidarTodo } = await import('../../src/datos/consulta.js');
const { Buscador } = await import('../../src/marco/buscador.js');

afterEach(() => { cleanup(); olvidarTodo(); });
beforeEach(() => { datos.resultados = []; datos.llamadas = []; });

const campo = () => screen.getByRole('combobox');

describe('el foco no se pierde', () => {
  it('se puede escribir una palabra entera sin volver a hacer clic', async () => {
    /**
     * LA PRUEBA IMPORTANTE.
     *
     * Si el campo se desmontara en cada tecla, `userEvent` escribiria la
     * primera letra sobre un nodo que ya no existe y el valor se quedaria en
     * una sola letra. Que el valor llegue completo Y el campo siga siendo el
     * elemento activo es exactamente lo que se rompe cuando alguien define el
     * componente dentro de otro render.
     */
    render(<Buscador negocio="t_c" onAbrir={() => {}} />);
    const antes = campo();
    await userEvent.type(antes, 'Fernanda');

    expect((campo() as HTMLInputElement).value).toBe('Fernanda');
    expect(document.activeElement).toBe(campo());
    // Y ademas es EL MISMO nodo del DOM: no se remonto por el camino.
    expect(campo()).toBe(antes);
  });

  it('el campo se pinta SIEMPRE, tambien antes de escribir nada', () => {
    // Pintarlo solo cuando hay texto lo haria aparecer y desaparecer del
    // arbol, que es la otra forma clasica de perder el foco.
    render(<Buscador negocio="t_c" onAbrir={() => {}} />);
    expect(campo()).toBeTruthy();
  });
});

describe('cuando se consulta al servidor', () => {
  it('NO se consulta en cada tecla: se espera a que dejes de escribir', async () => {
    // "Fernanda" serian ocho consultas de las que siete no le importan a
    // nadie, y las respuestas pueden llegar desordenadas.
    render(<Buscador negocio="t_c" onAbrir={() => {}} />);
    await userEvent.type(campo(), 'Fernanda');
    await waitFor(() => expect(datos.llamadas.length).toBeGreaterThan(0));
    expect(datos.llamadas.length).toBeLessThan(3);
    expect(datos.llamadas.at(-1)).toBe('fernanda');
  });

  it('con una sola letra ni se molesta al servidor', async () => {
    render(<Buscador negocio="t_c" onAbrir={() => {}} />);
    await userEvent.type(campo(), 'a');
    await screen.findByText(/Escribe al menos/);
    expect(datos.llamadas).toEqual([]);
  });
});

describe('los resultados', () => {
  it('se agrupan por tipo y se pueden escoger', async () => {
    datos.resultados = [
      { tipo: 'cliente', id: 'c1', nombre: 'Persona Buscada', pista: '6461112222', modulo: 'clientes' },
    ];
    const abrir = vi.fn();
    render(<Buscador negocio="t_c" onAbrir={abrir} />);
    await userEvent.type(campo(), 'per');

    const encontrado = await screen.findByText('Persona Buscada');
    expect(screen.getByText('Clientes')).toBeTruthy();

    await userEvent.click(encontrado);
    expect(abrir.mock.calls[0]?.[0]?.id).toBe('c1');
  });

  it('sin resultados dice QUE se busco', async () => {
    // "Sin resultados" a secas deja la duda de si el sistema busco de verdad.
    render(<Buscador negocio="t_c" onAbrir={() => {}} />);
    await userEvent.type(campo(), 'zzz');
    expect(await screen.findByText(/No encontramos nada con «zzz»/)).toBeTruthy();
  });

  it('se puede escoger con el teclado, sin tocar el raton', async () => {
    datos.resultados = [
      { tipo: 'cliente', id: 'c1', nombre: 'Uno', pista: null, modulo: 'clientes' },
      { tipo: 'cliente', id: 'c2', nombre: 'Dos', pista: null, modulo: 'clientes' },
    ];
    const abrir = vi.fn();
    render(<Buscador negocio="t_c" onAbrir={abrir} />);
    await userEvent.type(campo(), 'os');
    await screen.findByText('Dos');

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(abrir.mock.calls[0]?.[0]?.id).toBe('c2');
  });

  it('al escoger NO se borra lo escrito', async () => {
    // Borrarlo obliga a escribirlo otra vez cuando lo que se queria era ver el
    // segundo resultado.
    datos.resultados = [
      { tipo: 'cliente', id: 'c1', nombre: 'Uno', pista: null, modulo: 'clientes' },
    ];
    render(<Buscador negocio="t_c" onAbrir={() => {}} />);
    await userEvent.type(campo(), 'uno');
    await userEvent.click(await screen.findByText('Uno'));
    expect((campo() as HTMLInputElement).value).toBe('uno');
  });
});
