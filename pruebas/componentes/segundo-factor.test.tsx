/**
 * @vitest-environment happy-dom
 *
 * LA VERIFICACION EN DOS PASOS — la deuda mas vieja del producto.
 *
 * Lo que de verdad se vigila: que existan LOS DOS caminos. Quien no tiene
 * ningun factor tiene que poder darlo de alta; quien ya lo tiene pero no lo ha
 * usado en esta sesion tiene que poder escribir su codigo. Confundirlos es el
 * error facil, y el sintoma seria una pantalla que le pide el QR a alguien que
 * ya lo escaneo hace meses.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mfa = vi.hoisted(() => ({
  factores: [] as { id: string; status: string }[],
  nivel: 'aal1' as string,
  alta: null as unknown,
  verificado: null as { message: string } | null,
  quitados: [] as string[],
}));

vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({
    auth: {
      mfa: {
        listFactors: () =>
          Promise.resolve({ data: { all: mfa.factores, totp: mfa.factores }, error: null }),
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: mfa.nivel, nextLevel: mfa.nivel }, error: null }),
        enroll: () => Promise.resolve({ data: mfa.alta, error: null }),
        challengeAndVerify: () => Promise.resolve({ data: null, error: mfa.verificado }),
        unenroll: ({ factorId }: { factorId: string }) => {
          mfa.quitados.push(factorId);
          return Promise.resolve({ data: null, error: null });
        },
      },
    },
  }),
  clienteParaLaBase: () => { throw new Error('no se usa en pruebas'); },
}));

const { SegundoFactor, soloDigitos } = await import('../../src/configuracion/segundo-factor.js');

afterEach(() => {
  cleanup();
  mfa.factores = [];
  mfa.nivel = 'aal1';
  mfa.alta = null;
  mfa.verificado = null;
  mfa.quitados = [];
});

describe('sin ningun factor dado de alta', () => {
  it('ofrece activarla y dice que hace falta una aplicacion de autenticacion', async () => {
    render(<SegundoFactor />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Activar la verificación/ })).toBeDefined(),
    );
    // El codigo NO viaja por correo ni por mensaje, y se dice: quien espera un
    // SMS que no llega se queda fuera creyendo que el sistema falla.
    expect(screen.getByText(/aplicación de autenticación/)).toBeDefined();
    expect(screen.getByText(/no viaja por correo ni por mensaje/)).toBeDefined();
  });

  it('al activarla enseña el QR Y el secreto escrito', async () => {
    /*
     * EL SECRETO ESCRITO NO SOBRA: quien entra desde el mismo telefono no puede
     * escanear la pantalla en la que esta, y sin el se queda sin forma de dar
     * de alta nada.
     */
    mfa.alta = { id: 'f1', totp: { qr_code: 'data:image/svg+xml;utf8,x', secret: 'ABCD1234' } };
    render(<SegundoFactor />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Activar la verificación/ })).toBeDefined(),
    );
    await userEvent.click(screen.getByRole('button', { name: /Activar la verificación/ }));
    await waitFor(() => expect(screen.getByText('ABCD1234')).toBeDefined());
    expect(screen.getByAltText(/Código QR/)).toBeDefined();
  });

  it('antes de dar de alta limpia lo que quedo a medias', async () => {
    /*
     * Un alta abandonada —se cierra la pestaña con el QR en pantalla— deja un
     * factor sin verificar que ocupa el nombre. El siguiente intento falla con
     * un error de nombre repetido que no dice nada de la causa.
     */
    mfa.factores = [{ id: 'viejo', status: 'unverified' }];
    mfa.alta = { id: 'f1', totp: { qr_code: '', secret: 'X' } };
    render(<SegundoFactor />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Activar la verificación/ })).toBeDefined(),
    );
    await userEvent.click(screen.getByRole('button', { name: /Activar la verificación/ }));
    await waitFor(() => expect(mfa.quitados).toContain('viejo'));
  });
});

describe('con el factor ya dado de alta pero sin usarlo en esta sesion', () => {
  it('solo pide los seis digitos, NO el QR otra vez', async () => {
    mfa.factores = [{ id: 'f1', status: 'verified' }];
    mfa.nivel = 'aal1';
    render(<SegundoFactor />);
    await waitFor(() => expect(screen.getByLabelText(/seis dígitos/)).toBeDefined());
    expect(screen.queryByAltText(/Código QR/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDefined();
  });

  it('un codigo que no coincide se explica mirando el reloj del telefono', async () => {
    // Es la causa real la mitad de las veces: el reloj del telefono desfasado.
    mfa.factores = [{ id: 'f1', status: 'verified' }];
    mfa.verificado = { message: '' };
    render(<SegundoFactor />);
    await waitFor(() => expect(screen.getByLabelText(/seis dígitos/)).toBeDefined());
    await userEvent.type(screen.getByLabelText(/seis dígitos/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByText(/reloj del teléfono/)).toBeDefined());
  });
});

describe('cuando ya se uso en esta sesion', () => {
  it('lo dice y ofrece quitarla, avisando de lo que pasa si se hace mal', async () => {
    mfa.factores = [{ id: 'f1', status: 'verified' }];
    mfa.nivel = 'aal2';
    render(<SegundoFactor />);
    await waitFor(() => expect(screen.getByText(/está activada/)).toBeDefined());
    expect(screen.getByText(/pidiendo un código que ya nadie puede generar/)).toBeDefined();
  });
});

describe('cuando es lo unico que se puede hacer', () => {
  it('el texto cambia de tono: explica por que se lo estan pidiendo', async () => {
    render(<SegundoFactor bloqueando />);
    await waitFor(() =>
      expect(screen.getByText(/administra usuarios, permisos e historial/)).toBeDefined(),
    );
  });
});

describe('el codigo que se escribe', () => {
  it('se queda solo con los digitos y con seis', () => {
    // Pegarlo con espacios es lo normal, y un espacio de mas lo rechazaba.
    expect(soloDigitos('123 456')).toBe('123456');
    expect(soloDigitos('12345678')).toBe('123456');
    expect(soloDigitos('abc')).toBe('');
  });
});
