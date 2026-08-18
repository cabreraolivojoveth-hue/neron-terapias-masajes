/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn() }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({ auth, rpc }),
  clienteParaLaBase: () => ({ auth, rpc }),
}));

const { CrearCuenta, CrearMiCentro } = await import('../../src/pantallas/crear-cuenta.js');

/** Recargar de verdad no se puede en la prueba, y tampoco hace falta verlo. */
const recargar = vi.fn();

afterEach(cleanup);
beforeEach(() => {
  auth.signUp.mockReset();
  rpc.mockReset();
  recargar.mockReset();
  auth.signUp.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  rpc.mockResolvedValue({ data: { negocio: 't_u1', centro: 'Casa Zen' }, error: null });
  /**
   * Se reemplaza el OBJETO ENTERO, no el metodo suelto.
   *
   * En vitest `window` es `globalThis`, y ahi `location` esta puesto como un
   * par get/set —no como un dato—, asi que `vi.spyOn(window.location, 'reload')`
   * no siempre agarra. Redefinir la propiedad completa si vale: se declaro
   * `configurable`, y la instancia de verdad de happy-dom se queda intacta
   * debajo, que es lo que necesita el cierre del entorno al terminar.
   */
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: 'http://localhost/', assign: vi.fn(), replace: vi.fn(), reload: recargar },
  });
});

async function llenarTodo(u: ReturnType<typeof userEvent.setup>, clave = 'unaclave123') {
  await u.type(screen.getByLabelText(/Nombre del centro/), 'Casa Zen');
  await u.type(screen.getByLabelText(/^Tu nombre/), 'Ana Ruiz');
  await u.type(screen.getByLabelText(/Correo/), 'ana@centro.mx');
  await u.type(screen.getByLabelText(/^Contraseña/), clave);
  await u.type(screen.getByLabelText(/Repite la contraseña/), clave);
}

describe('lo que se comprueba ANTES de crear la cuenta', () => {
  it('dos contraseñas distintas ni siquiera llegan al servidor', async () => {
    /**
     * Descubrirlo despues no tiene arreglo desde esta pantalla: la cuenta ya
     * existe con la contraseña equivocada y la persona no sabe cual escribio.
     */
    render(<CrearCuenta onVolver={() => {}} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/Nombre del centro/), 'Casa Zen');
    await u.type(screen.getByLabelText(/^Tu nombre/), 'Ana Ruiz');
    await u.type(screen.getByLabelText(/Correo/), 'ana@centro.mx');
    await u.type(screen.getByLabelText(/^Contraseña/), 'unaclave123');
    await u.type(screen.getByLabelText(/Repite la contraseña/), 'otraclave123');
    await u.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toMatch(/no son iguales/i);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('una contraseña corta se rechaza aqui, y en español', async () => {
    // El servidor contesta "Password should be at least 6 characters": ni el
    // idioma ni el numero coinciden con lo que se acaba de leer en pantalla.
    render(<CrearCuenta onVolver={() => {}} />);
    const u = userEvent.setup();
    await llenarTodo(u, 'corta');
    await u.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toMatch(/8 caracteres/);
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe('cuando sale bien', () => {
  it('crea la cuenta y ENSEGUIDA el centro, con los dos nombres', async () => {
    render(<CrearCuenta onVolver={() => {}} />);
    const u = userEvent.setup();
    await llenarTodo(u);
    await u.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(auth.signUp.mock.calls[0]?.[0]).toEqual({
      email: 'ana@centro.mx',
      password: 'unaclave123',
    });
    expect(rpc).toHaveBeenCalledWith('crear_mi_centro', {
      p_centro: 'Casa Zen',
      p_mi_nombre: 'Ana Ruiz',
    });
    await waitFor(() => expect(recargar).toHaveBeenCalled());
  });
});

describe('cuando el proyecto pide confirmar el correo', () => {
  it('NO finge que ya quedó: manda a revisar el correo', async () => {
    /**
     * Sin sesion, la cuenta existe y el centro no. Decir "listo" ahi dejaria a
     * la persona creyendo que tiene un centro que nadie creo.
     */
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u1' } }, error: null });
    render(<CrearCuenta onVolver={() => {}} />);
    const u = userEvent.setup();
    await llenarTodo(u);
    await u.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(screen.getByRole('status')).toBeDefined());
    expect(screen.getByRole('status').textContent).toMatch(/ana@centro\.mx/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('cuando falla', () => {
  it('el error del servidor se anuncia y el botón se destraba', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: { message: 'algo pasó' } });
    render(<CrearCuenta onVolver={() => {}} />);
    const u = userEvent.setup();
    await llenarTodo(u);
    await u.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('algo pasó'));
    const boton = screen.getByRole('button', { name: 'Crear cuenta' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
  });

  it('si truena la red, tampoco se queda mudo', async () => {
    auth.signUp.mockRejectedValue(new Error('offline'));
    render(<CrearCuenta onVolver={() => {}} />);
    const u = userEvent.setup();
    await llenarTodo(u);
    await u.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });
});

describe('volver a la pantalla de entrar', () => {
  it('el enlace de abajo no manda el formulario, solo vuelve', async () => {
    // Un boton sin `type` dentro de un <form> es de envio: mandaria el alta
    // otra vez en vez de volver.
    const volver = vi.fn();
    render(<CrearCuenta onVolver={volver} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Entrar' }));
    expect(volver).toHaveBeenCalled();
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe('el centro para quien ya entró y no tiene ninguno', () => {
  it('pide los dos nombres y nada más', () => {
    /**
     * Ni correo ni rol: los dos los saca la base del token. Preguntarlos aqui
     * seria dejar que la pantalla decida quien es quien.
     */
    render(<CrearMiCentro />);
    expect(screen.getByLabelText(/Nombre del centro/)).toBeDefined();
    expect(screen.getByLabelText(/^Tu nombre/)).toBeDefined();
    expect(screen.queryByLabelText(/Correo/)).toBeNull();
  });

  it('crea el centro y recarga', async () => {
    render(<CrearMiCentro />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/Nombre del centro/), 'Casa Zen');
    await u.type(screen.getByLabelText(/^Tu nombre/), 'Ana Ruiz');
    await u.click(screen.getByRole('button', { name: 'Crear mi centro' }));

    await waitFor(() => expect(recargar).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('crear_mi_centro', {
      p_centro: 'Casa Zen',
      p_mi_nombre: 'Ana Ruiz',
    });
  });

  it('si la base dice que ya perteneces a un centro, se lee tal cual', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Tu cuenta ya pertenece a un centro.' } });
    render(<CrearMiCentro />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/Nombre del centro/), 'Casa Zen');
    await u.type(screen.getByLabelText(/^Tu nombre/), 'Ana Ruiz');
    await u.click(screen.getByRole('button', { name: 'Crear mi centro' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Tu cuenta ya pertenece a un centro.'),
    );
    expect(recargar).not.toHaveBeenCalled();
  });
});
