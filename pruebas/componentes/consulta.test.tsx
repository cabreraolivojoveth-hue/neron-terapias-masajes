/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidar, olvidarTodo, useConsulta, useOperacion } from '../../src/datos/consulta.js';

afterEach(() => { cleanup(); olvidarTodo(); });

function Espia({ llave, pedir }: { llave: string | null; pedir: () => Promise<string> }) {
  const r = useConsulta<string>(llave, pedir);
  return (
    <div>
      <span data-testid="estado">{r.estado}</span>
      <span data-testid="datos">{r.datos ?? '—'}</span>
      <span data-testid="error">{r.error ?? ''}</span>
      <button type="button" onClick={r.recargar}>Recargar</button>
    </div>
  );
}

describe('pedir datos', () => {
  it('arranca cargando y termina con los datos', async () => {
    render(<Espia llave="a" pedir={async () => 'listo'} />);
    expect(screen.getByTestId('estado').textContent).toBe('cargando');
    await waitFor(() => expect(screen.getByTestId('datos').textContent).toBe('listo'));
    expect(screen.getByTestId('estado').textContent).toBe('listo');
  });

  it('dos pantallas que piden lo mismo hacen UN viaje', async () => {
    // Sin esto, tres tarjetas que necesitan la misma lista al montar hacen
    // tres peticiones identicas al mismo tiempo.
    const pedir = vi.fn(async () => 'x');
    render(<><Espia llave="b" pedir={pedir} /><Espia llave="b" pedir={pedir} /></>);
    await waitFor(() => expect(screen.getAllByTestId('datos')[0]?.textContent).toBe('x'));
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('con llave nula no pide nada', async () => {
    // Es el caso de "todavia no se que paciente": pedir con un id vacio
    // traeria un error del servidor por algo que ni siquiera hacia falta.
    const pedir = vi.fn(async () => 'x');
    render(<Espia llave={null} pedir={pedir} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(pedir).not.toHaveBeenCalled();
    expect(screen.getByTestId('estado').textContent).toBe('listo');
  });
});

describe('cuando falla', () => {
  it('guarda el error y NO borra lo que ya se veia', async () => {
    // Si al perder la red la pantalla se vaciara, la persona veria la agenda
    // vacia y creeria que se borraron las citas.
    let fallar = false;
    const pedir = vi.fn(async () => {
      if (fallar) throw new Error('sin internet');
      return 'las citas';
    });
    render(<Espia llave="c" pedir={pedir} />);
    await waitFor(() => expect(screen.getByTestId('datos').textContent).toBe('las citas'));

    fallar = true;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Recargar' }));
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('sin internet'));
    expect(screen.getByTestId('datos').textContent).toBe('las citas');
  });
});

describe('invalidar', () => {
  it('un prefijo refresca TODAS las llaves que empiezan igual', async () => {
    // Es lo que hace que crear una cita actualice dia, semana, mes y las
    // vistas con filtros, sin tener que acordarse de cada llave.
    const p1 = vi.fn(async () => '1');
    const p2 = vi.fn(async () => '2');
    render(<><Espia llave="citas:a" pedir={p1} /><Espia llave="citas:b" pedir={p2} /></>);
    await waitFor(() => expect(p1).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(p2).toHaveBeenCalledTimes(1));

    invalidar('citas');
    await waitFor(() => expect(p1).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(p2).toHaveBeenCalledTimes(2));
  });

  it('no toca lo que no coincide con el prefijo', async () => {
    const otros = vi.fn(async () => 'z');
    render(<Espia llave="clientes:a" pedir={otros} />);
    await waitFor(() => expect(otros).toHaveBeenCalledTimes(1));
    invalidar('citas');
    await new Promise((r) => setTimeout(r, 20));
    expect(otros).toHaveBeenCalledTimes(1);
  });
});

function Boton({ correr }: { correr: (x: string) => Promise<string> }) {
  const op = useOperacion(correr, ['citas']);
  return (
    <div>
      <button type="button" disabled={op.trabajando} onClick={() => void op.ejecutar('x')}>
        Guardar
      </button>
      <span data-testid="error">{op.error ?? ''}</span>
    </div>
  );
}

describe('las operaciones que guardan', () => {
  it('el error se muestra, no se traga', async () => {
    // Un fallo silencioso al guardar es lo peor que puede pasar: la persona
    // cree que quedo y se entera cuando llega el paciente.
    render(<Boton correr={async () => { throw new Error('Ese horario acaba de ocuparse.'); }} />);
    await userEvent.setup().click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('Ese horario acaba de ocuparse.'));
  });

  it('el boton se DESTRABA despues de fallar', async () => {
    render(<Boton correr={async () => { throw new Error('x'); }} />);
    await userEvent.setup().click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('x'));
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('al guardar bien, invalida sola lo que le dijeron', async () => {
    const pedir = vi.fn(async () => 'v');
    render(<><Espia llave="citas:z" pedir={pedir} /><Boton correr={async () => 'ok'} /></>);
    await waitFor(() => expect(pedir).toHaveBeenCalledTimes(1));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(pedir).toHaveBeenCalledTimes(2));
  });
});
