/**
 * @vitest-environment happy-dom
 *
 * La ficha de alta y edicion de un cliente.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FICHA_VACIA, FichaDeCliente, aInput, deInput, validarCliente } from '../../src/clientes/ficha.js';

afterEach(cleanup);

const ficha = (c: Record<string, string> = {}) => ({ ...FICHA_VACIA, ...c });
const HOY = new Date(2026, 7, 6);

describe('las validaciones', () => {
  it('un nombre de PUROS ESPACIOS no pasa', () => {
    /**
     * Pasa cualquier comprobacion de "no vacio" y deja un renglon en blanco en
     * la lista que nadie sabe de quien es.
     */
    expect(validarCliente(ficha({ nombre: '     ' })).nombre).toBeTruthy();
    expect(validarCliente(ficha({ nombre: 'Alguien' })).nombre).toBeUndefined();
  });

  it('todo lo demas es OPCIONAL', () => {
    // Obligar a capturar correo en un mostrador produce correos inventados, y
    // uno inventado es peor que ninguno: el sistema le va a escribir.
    expect(validarCliente(ficha({ nombre: 'Alguien' }))).toEqual({});
  });

  it('un correo sin dominio se reclama', () => {
    expect(validarCliente(ficha({ nombre: 'A', correo: 'algo@algo' })).correo).toBeTruthy();
    expect(validarCliente(ficha({ nombre: 'A', correo: 'algo@algo.mx' })).correo).toBeUndefined();
  });

  it('un telefono demasiado corto se reclama', () => {
    expect(validarCliente(ficha({ nombre: 'A', telefono: '123' })).telefono).toBeTruthy();
    expect(validarCliente(ficha({ nombre: 'A', telefono: '664 123 4567' })).telefono).toBeUndefined();
  });

  it('el telefono acepta los signos que la gente escribe', () => {
    expect(validarCliente(ficha({ nombre: 'A', telefono: '+52 (664) 123-4567' })).telefono)
      .toBeUndefined();
  });

  it('una fecha de nacimiento FUTURA no pasa', () => {
    // Siempre es un error de captura, y ademas rompe el calculo del proximo
    // cumpleaños.
    expect(validarCliente(ficha({ nombre: 'A', fechaNacimiento: '01/01/2030' }), HOY)
      .fechaNacimiento).toBeTruthy();
  });

  it('una fecha imposible tampoco', () => {
    expect(validarCliente(ficha({ nombre: 'A', fechaNacimiento: '31/02/1990' }), HOY)
      .fechaNacimiento).toBeTruthy();
  });

  it('una fecha normal si', () => {
    expect(validarCliente(ficha({ nombre: 'A', fechaNacimiento: '10/07/1990' }), HOY)
      .fechaNacimiento).toBeUndefined();
  });
});

describe('la traduccion del campo de fecha', () => {
  it('va y vuelve sin moverse un dia', () => {
    expect(aInput('10/07/1990')).toBe('1990-07-10');
    expect(deInput('1990-07-10')).toBe('10/07/1990');
  });

  it('vaciarlo deja la fecha vacia, no "hoy" a escondidas', () => {
    expect(deInput('')).toBe('');
  });
});

/* ------------------------------------------------------------------ */

const props = {
  abierta: true,
  titulo: 'Nuevo cliente',
  inicial: FICHA_VACIA,
  profesionales: [{ id: 'p1', nombre: 'Terapeuta A', rol: 'dueno', usuarioId: 'u1' }],
  trabajando: false,
  error: null as string | null,
  onGuardar: () => {},
  onBuscarDuplicado: async () => null,
  onAbrirDuplicado: () => {},
  onCerrar: () => {},
};

describe('escribir sin perder el foco', () => {
  it('se puede escribir un nombre completo de un tiron', async () => {
    /**
     * LA PRUEBA IMPORTANTE.
     *
     * Si el campo se desmontara en cada tecla, el valor se quedaria en la
     * primera letra y el elemento activo dejaria de ser el campo.
     */
    render(<FichaDeCliente {...props} />);
    const campo = screen.getByLabelText(/Nombre/);
    await userEvent.type(campo, 'José Antonio Ramírez Hernández');

    expect((campo as HTMLInputElement).value).toBe('José Antonio Ramírez Hernández');
    expect(document.activeElement).toBe(campo);
  });

  it('el telefono y el correo tambien', async () => {
    render(<FichaDeCliente {...props} />);
    const tel = screen.getByLabelText(/Teléfono/);
    await userEvent.type(tel, '6641234567');
    expect((tel as HTMLInputElement).value).toBe('6641234567');
    expect(document.activeElement).toBe(tel);
  });
});

describe('el aviso de duplicado', () => {
  it('avisa cuando ya hay alguien con ese telefono, y deja abrirlo', async () => {
    const abrir = vi.fn();
    render(
      <FichaDeCliente
        {...props}
        onBuscarDuplicado={async () => ({ id: 'c9', nombre: 'Persona Ya Dada De Alta', porque: 'telefono' })}
        onAbrirDuplicado={abrir}
      />,
    );
    await userEvent.type(screen.getByLabelText(/Teléfono/), '6641234567');
    expect(await screen.findByText('Persona Ya Dada De Alta')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Abrir su expediente' }));
    expect(abrir).toHaveBeenCalledWith('c9');
  });

  it('AVISA, no bloquea: el boton de guardar sigue vivo', async () => {
    // A veces una madre da su telefono para la ficha de su hija. Quien
    // captura decide — pero decide viendo la coincidencia.
    const guardar = vi.fn();
    render(
      <FichaDeCliente
        {...props}
        onBuscarDuplicado={async () => ({ id: 'c9', nombre: 'Otra Persona', porque: 'telefono' })}
        onGuardar={guardar}
      />,
    );
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Alguien');
    await userEvent.type(screen.getByLabelText(/Teléfono/), '6641234567');
    await screen.findByText('Otra Persona');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(guardar).toHaveBeenCalled();
  });

  it('no se consulta en cada tecla', async () => {
    const buscar = vi.fn(async () => null);
    render(<FichaDeCliente {...props} onBuscarDuplicado={buscar} />);
    await userEvent.type(screen.getByLabelText(/Teléfono/), '6641234567');
    await waitFor(() => expect(buscar.mock.calls.length).toBeGreaterThan(0));
    // Diez teclas no son diez consultas: las respuestas llegarian desordenadas
    // y el aviso terminaria hablando de otra persona.
    expect(buscar.mock.calls.length).toBeLessThan(4);
  });
});

describe('guardar', () => {
  it('sin nombre NO se guarda, y se dice cual falta', async () => {
    const guardar = vi.fn();
    render(<FichaDeCliente {...props} onGuardar={guardar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el nombre del cliente.')).toBeTruthy();
  });

  it('lo secundario empieza plegado', () => {
    // Un formulario de alta con diez campos visibles hace que se capture
    // menos, no mas.
    render(<FichaDeCliente {...props} />);
    expect(screen.queryByLabelText(/Notas/)).toBeNull();
    expect(screen.getByRole('button', { name: /Información adicional/ })).toBeTruthy();
  });
});
