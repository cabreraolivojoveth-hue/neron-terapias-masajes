/**
 * @vitest-environment happy-dom
 *
 * LO QUE ES DE LA CUENTA DE CADA QUIEN. Lo que se vigila: que el correo no se
 * pueda cambiar desde aqui —es la llave con la que se entra—, que la contraseña
 * se pida dos veces y no la guarde este sistema, y que la ayuda NO invente un
 * telefono ni un correo de soporte que nadie contesta.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ cambiada: '' as string, fallo: null as { message: string } | null }));

vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({
    auth: {
      updateUser: ({ password }: { password: string }) => {
        auth.cambiada = password;
        return Promise.resolve({ data: null, error: auth.fallo });
      },
    },
  }),
  clienteParaLaBase: () => { throw new Error('no se usa en pruebas'); },
}));

const { AyudaYSoporte, CambiarContrasena, MiPerfil, loQueFaltaDeLaContrasena } = await import(
  '../../src/configuracion/mi-cuenta.js'
);

afterEach(() => {
  cleanup();
  auth.cambiada = '';
  auth.fallo = null;
});

describe('mi perfil', () => {
  it('deja cambiar el nombre y NO el correo ni el rol', () => {
    /*
     * El correo es la llave con la que se entra: cambiarlo aqui dejaria la
     * cuenta sin poder entrar. El rol lo reparte quien administra.
     */
    render(
      <MiPerfil
        abierto nombre="Quien administra" correo="yo@ejemplo.mx" rol="Dueña"
        trabajando={false} error={null} onGuardar={vi.fn()} onCerrar={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Cómo te llamas/)).toBeDefined();
    expect(screen.queryByLabelText(/^Correo/)).toBeNull();
    expect(screen.getByText('yo@ejemplo.mx')).toBeDefined();
    expect(screen.getByText(/no se cambia desde aquí/i)).toBeDefined();
  });

  it('dice DONDE se ve ese nombre', () => {
    // Es lo que sale en la bitacora, en el corte de caja y al lado de cada
    // cita: saberlo cambia lo que uno escribe.
    render(
      <MiPerfil
        abierto nombre="X" correo="yo@ejemplo.mx" rol="Dueña"
        trabajando={false} error={null} onGuardar={vi.fn()} onCerrar={vi.fn()}
      />,
    );
    expect(screen.getByText(/sale en la bitácora, en el corte de caja/i)).toBeDefined();
  });

  it('sin nombre no se guarda', async () => {
    const onGuardar = vi.fn();
    render(
      <MiPerfil
        abierto nombre="" correo="yo@ejemplo.mx" rol="Dueña"
        trabajando={false} error={null} onGuardar={onGuardar} onCerrar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onGuardar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe cómo te llamas.')).toBeDefined();
  });
});

describe('cambiar la contraseña', () => {
  it('se pide dos veces y no coincidir se dice antes de mandar nada', async () => {
    /*
     * Una contraseña mal tecleada en un campo oculto deja fuera a quien la
     * escribio, y el arreglo es un correo de recuperacion que quiza no llegue.
     */
    render(<CambiarContrasena abierto onCerrar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'unaclavelarga');
    await userEvent.type(screen.getByLabelText(/otra vez/), 'otradistinta');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiarla' }));
    expect(screen.getByText('Las dos no coinciden.')).toBeDefined();
    expect(auth.cambiada).toBe('');
  });

  it('se la pide al proveedor de identidad, no la guarda este sistema', async () => {
    // Una contraseña que pasa por nuestro codigo es una contraseña que podemos
    // registrar por accidente en un `console.log`.
    render(<CambiarContrasena abierto onCerrar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'unaclavelarga');
    await userEvent.type(screen.getByLabelText(/otra vez/), 'unaclavelarga');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiarla' }));
    await waitFor(() => expect(auth.cambiada).toBe('unaclavelarga'));
    expect(screen.getByText(/la próxima vez que entres será con la contraseña nueva/i))
      .toBeDefined();
  });

  it('una contraseña corta se rechaza antes de intentarlo', () => {
    expect(loQueFaltaDeLaContrasena('corta', 'corta')).toContain('8');
    expect(loQueFaltaDeLaContrasena('unaclavelarga', 'unaclavelarga')).toBe('');
  });
});

describe('ayuda y soporte', () => {
  it('NO inventa ningun telefono ni correo de soporte', () => {
    /*
     * La captura de referencia trae "Centro de ayuda", "Soporte técnico" y
     * "Novedades del sistema" como si existieran tres sitios donde ir. Escribir
     * una direccion que nadie contesta es peor que no ponerla: quien la use se
     * queda esperando el dia que de verdad tiene un problema.
     */
    const { container } = render(
      <AyudaYSoporte
        abierto apartado="soporte" version="0.1.0" centro="Centro de prueba"
        onVerBitacora={vi.fn()} onCerrar={vi.fn()}
      />,
    );
    expect(container.textContent).not.toMatch(/\d{3}[ -]?\d{3}[ -]?\d{4}/);
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(screen.getByText(/lo mantiene quien te lo instaló/i)).toBeDefined();
  });

  it('da los dos datos que de verdad sirven para pedir ayuda', () => {
    render(
      <AyudaYSoporte
        abierto apartado="soporte" version="0.1.0" centro="Centro de prueba"
        onVerBitacora={vi.fn()} onCerrar={vi.fn()}
      />,
    );
    expect(screen.getByText('v0.1.0')).toBeDefined();
    expect(screen.getByText('Centro de prueba')).toBeDefined();
  });

  it('los TRES apartados del diseño existen, y ninguno miente', async () => {
    /*
     * "Centro de ayuda", "Soporte técnico" y "Novedades del sistema" son los
     * tres nombres de la captura, y es donde la gente los va a buscar. Lo que
     * NO se hace es inventarles una lista de novedades escrita a mano que se
     * queda vieja en la primera publicación que nadie recuerde actualizar.
     */
    render(
      <AyudaYSoporte
        abierto apartado="ayuda" version="0.1.0" centro="Centro de prueba"
        onVerBitacora={vi.fn()} onCerrar={vi.fn()}
      />,
    );
    for (const a of ['Centro de ayuda', 'Soporte técnico', 'Novedades del sistema']) {
      expect(screen.getByRole('button', { name: a }), a).toBeDefined();
    }
    await userEvent.click(screen.getByRole('button', { name: 'Novedades del sistema' }));
    expect(screen.getByText(/No hay una lista de\s+novedades publicada/i)).toBeDefined();
  });

  it('desde novedades se llega a lo que SI cambió: la bitácora', async () => {
    const onVerBitacora = vi.fn();
    render(
      <AyudaYSoporte
        abierto apartado="novedades" version="0.1.0" centro="Centro de prueba"
        onVerBitacora={onVerBitacora} onCerrar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Ver la bitácora del centro/ }));
    expect(onVerBitacora).toHaveBeenCalled();
  });
});
