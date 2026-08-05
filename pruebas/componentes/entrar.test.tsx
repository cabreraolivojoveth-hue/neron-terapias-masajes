/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));
vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({ auth }),
  clienteParaLaBase: () => ({ auth }),
}));

const { Entrar } = await import('../../src/pantallas/entrar.js');

afterEach(cleanup);
beforeEach(() => {
  auth.signInWithPassword.mockReset();
  auth.signInWithPassword.mockResolvedValue({ error: null });
});

describe('escribir en el formulario', () => {
  it('EL CAMPO NO PIERDE EL FOCO al teclear', () => {
    /**
     * La queja que dio origen a esta prueba: escribir "Ana" y tener que
     * volver a hacer clic en el campo despues de cada letra.
     *
     * Pasa cuando el estado esta mal puesto y React destruye el input en cada
     * pulsacion. Aqui se escribe una palabra entera y se comprueba que el
     * foco siguio en el mismo elemento todo el tiempo.
     */
    render(<Entrar />);
    const campo = screen.getByLabelText('Correo') as HTMLInputElement;
    campo.focus();
    return userEvent.setup().type(campo, 'ana@centro.mx').then(() => {
      expect(document.activeElement).toBe(campo);
      expect(campo.value).toBe('ana@centro.mx');
    });
  });

  it('no se borra lo escrito al escribir en el otro campo', () => {
    render(<Entrar />);
    const correo = screen.getByLabelText('Correo') as HTMLInputElement;
    const clave = screen.getByLabelText('Contraseña') as HTMLInputElement;
    const u = userEvent.setup();
    return u.type(correo, 'ana@centro.mx')
      .then(() => u.type(clave, 'secreta'))
      .then(() => {
        expect(correo.value).toBe('ana@centro.mx');
        expect(clave.value).toBe('secreta');
      });
  });
});

describe('cuando falla la entrada', () => {
  it('el mensaje es el MISMO se equivoque en el correo o en la clave', async () => {
    // Decir "ese correo no existe" le confirma a quien prueba cuentas cuales
    // si existen, y eso es la mitad del trabajo de entrar por la fuerza.
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<Entrar />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Correo'), 'quien@sea.mx');
    await u.type(screen.getByLabelText('Contraseña'), 'loquesea');
    await u.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toBe('El correo o la contraseña no coinciden.');
  });

  it('el error se ANUNCIA, no solo se pinta de rojo', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'x' } });
    render(<Entrar />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Correo'), 'a@b.mx');
    await u.type(screen.getByLabelText('Contraseña'), 'x');
    await u.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });

  it('si truena la red, tampoco se queda mudo', async () => {
    auth.signInWithPassword.mockRejectedValue(new Error('offline'));
    render(<Entrar />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Correo'), 'a@b.mx');
    await u.type(screen.getByLabelText('Contraseña'), 'x');
    await u.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/conectar/i));
  });

  it('el boton se DESTRABA despues de fallar', async () => {
    // Sin el `finally`, un error deja el formulario trabado y la unica salida
    // es recargar la pagina.
    auth.signInWithPassword.mockRejectedValue(new Error('offline'));
    render(<Entrar />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Correo'), 'a@b.mx');
    await u.type(screen.getByLabelText('Contraseña'), 'x');
    await u.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect((screen.getByRole('button', { name: 'Entrar' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('lo que se le manda al servidor', () => {
  it('el correo va sin espacios de sobra', async () => {
    // Copiar y pegar un correo arrastra un espacio al final mas veces de las
    // que uno creeria, y el servidor lo rechaza sin explicar por que.
    render(<Entrar />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Correo'), '  ana@centro.mx  ');
    await u.type(screen.getByLabelText('Contraseña'), 'clave');
    await u.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalled());
    expect(auth.signInWithPassword.mock.calls[0]?.[0]).toEqual({
      email: 'ana@centro.mx',
      password: 'clave',
    });
  });

  it('la contraseña NO se recorta: los espacios pueden ser parte de ella', async () => {
    render(<Entrar />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Correo'), 'a@b.mx');
    await u.type(screen.getByLabelText('Contraseña'), ' con espacio ');
    await u.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalled());
    expect(auth.signInWithPassword.mock.calls[0]?.[0].password).toBe(' con espacio ');
  });
});
