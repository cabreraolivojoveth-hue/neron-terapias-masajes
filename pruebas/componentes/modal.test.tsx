/**
 * @vitest-environment happy-dom
 *
 * EL MODAL DEL CENTRO — la prueba del fallo que hacia imposible capturar.
 *
 * Lo que se sentia: estabas escribiendo el telefono de un cliente nuevo y el
 * cursor SALTABA SOLO al campo de arriba, sin tocar nada. Seguias escribiendo y
 * las letras se iban al campo equivocado. Pasaba en todos los campos y en todos
 * los formularios del sistema.
 *
 * La causa estaba a dos capas de distancia del sintoma: el `Modal` de la base
 * enfoca su primer control al abrirse, pero ese efecto depende de `onCerrar`, y
 * todas las pantallas le pasan una flecha escrita en linea —una funcion NUEVA
 * en cada render del padre—. Cada repintado del padre volvia a enfocar.
 *
 * Estas pruebas montan el MODAL DE VERDAD (el envoltorio encima de la base),
 * porque lo que hay que comprobar no es que el envoltorio memorice bien: es que
 * el foco no se mueva. Un envoltorio correcto contra una base que cambie de
 * comportamiento seguiria pasando una prueba de memorizacion y devolviendo el
 * fallo a la pantalla.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from '../../src/ui/modal.js';

afterEach(cleanup);

/**
 * Una pantalla como las de verdad: escribe su `onCerrar` en linea y se repinta
 * por un motivo que no tiene nada que ver con el dialogo. `tic` es ese motivo
 * —una consulta que revalida, un contador, otro estado suelto— y se mueve desde
 * fuera para repintar SIN tocar la pantalla, que es la unica forma de mirar el
 * foco: un clic para forzar el repintado se lleva el foco al boton y la prueba
 * dejaria de medir lo que importa.
 */
function PantallaConFicha({ tic, huella }: { readonly tic: number; readonly huella: string[] }) {
  const [ficha, setFicha] = useState<string | null>('nuevo');
  return (
    <div>
      <span>{tic}</span>
      <Modal
        abierto={ficha !== null}
        titulo="Nuevo cliente"
        onCerrar={() => {
          huella.push(`cerrado en el tic ${tic}`);
          setFicha(null);
        }}
      >
        <input aria-label="Nombre" />
        <input aria-label="Teléfono" />
      </Modal>
    </div>
  );
}

describe('el foco se queda donde la persona lo dejo', () => {
  it('al abrir entra al primer campo de verdad', () => {
    // Esto NO se toca: quien navega con teclado tiene que entrar al dialogo, y
    // tiene que caer en un campo, no en la X —su primer Enter lo cerraria.
    render(<PantallaConFicha tic={0} huella={[]} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'));
  });

  it('un repintado del padre NO devuelve el cursor al primer campo', async () => {
    const { rerender } = render(<PantallaConFicha tic={0} huella={[]} />);

    const telefono = screen.getByLabelText('Teléfono');
    telefono.focus();
    await userEvent.type(telefono, '55');

    // El repintado del padre: nace un `onCerrar` nuevo, como en la aplicacion.
    rerender(<PantallaConFicha tic={1} huella={[]} />);

    expect(document.activeElement).toBe(telefono);
    expect((telefono as HTMLInputElement).value).toBe('55');
  });

  it('aguanta repintados seguidos, que es como pasaba de verdad', async () => {
    // No era un salto: era uno por cada revalidacion, o sea, todo el tiempo.
    const { rerender } = render(<PantallaConFicha tic={0} huella={[]} />);
    const telefono = screen.getByLabelText('Teléfono');
    telefono.focus();

    for (let i = 1; i <= 5; i += 1) rerender(<PantallaConFicha tic={i} huella={[]} />);

    await userEvent.type(telefono, '5512345678');
    expect((telefono as HTMLInputElement).value).toBe('5512345678');
    expect(document.activeElement).toBe(telefono);
  });
});

describe('y aun asi cierra con la version de HOY', () => {
  /**
   * La otra mitad del arreglo, y la que se rompe si alguien "optimiza" el
   * envoltorio guardando la funcion en un estado o en un efecto: la identidad
   * es estable, pero lo que corre al cerrar tiene que ser el callback del
   * ultimo render. Uno viejo cerraria sobre un estado que ya no existe.
   */
  it('Escape llama al callback del ultimo render, no al del primero', async () => {
    const huella: string[] = [];
    const { rerender } = render(<PantallaConFicha tic={0} huella={huella} />);
    rerender(<PantallaConFicha tic={7} huella={huella} />);

    await userEvent.keyboard('{Escape}');

    expect(huella).toEqual(['cerrado en el tic 7']);
  });

  it('la X tambien cierra', async () => {
    const huella: string[] = [];
    render(<PantallaConFicha tic={3} huella={huella} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(huella).toEqual(['cerrado en el tic 3']);
  });
});

describe('bloqueado sigue bloqueando', () => {
  it('mientras se guarda, Escape no cierra ni aparece la X', async () => {
    const huella: string[] = [];
    render(
      <Modal abierto titulo="Guardando" bloqueado onCerrar={() => huella.push('cerro')}>
        <input aria-label="Nombre" />
      </Modal>,
    );

    await userEvent.keyboard('{Escape}');

    expect(huella).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
  });
});
