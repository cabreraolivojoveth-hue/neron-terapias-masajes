/**
 * @vitest-environment happy-dom
 *
 * LA MITAD INVISIBLE DEL ARREGLO DEL FOCO: que la funcion que se le entrega a
 * la base sea SIEMPRE LA MISMA.
 *
 * Va aparte de `modal.test.tsx` porque aqui la base esta suplantada, y alla se
 * monta la de verdad. Las dos hacen falta y ninguna sustituye a la otra:
 *
 *   · `modal.test.tsx` mira el SINTOMA (el cursor no salta) contra la base real.
 *     Es lo que de verdad le pasaba a la persona escribiendo.
 *   · esta mira la CAUSA. Si el sintoma volviera, la de alla diria "el foco
 *     salta" y esta diria exactamente por que: porque el `onCerrar` cambio de
 *     identidad. Sin ella habria que volver a diagnosticarlo desde cero, que es
 *     lo que costo el fallo la primera vez.
 */
import { cleanup, render } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `vi.mock` se sube arriba del archivo antes de que exista cualquier variable,
 * asi que la lista de lo recibido tiene que nacer en `vi.hoisted` o el factory
 * revienta con un "cannot access before initialization" que no explica nada.
 */
const { recibidas } = vi.hoisted(() => ({ recibidas: [] as Array<() => void> }));

vi.mock('@neron/base/ui', async (importarReal) => {
  const real = await importarReal<typeof import('@neron/base/ui')>();
  return {
    ...real,
    Modal: ({
      abierto,
      onCerrar,
      children,
    }: {
      readonly abierto: boolean;
      readonly onCerrar: () => void;
      readonly children?: ReactNode;
    }) => {
      // Se apunta lo que llega en CADA render: es justo lo que la base mete en
      // las dependencias de su efecto de enfocar.
      recibidas.push(onCerrar);
      return abierto ? <div>{children}</div> : null;
    },
  };
});

const { Modal } = await import('../../src/ui/modal.js');

afterEach(() => {
  cleanup();
  recibidas.length = 0;
});

function Pantalla({ tic, huella }: { readonly tic: number; readonly huella: string[] }) {
  const [abierta, setAbierta] = useState(true);
  return (
    <Modal
      abierto={abierta}
      titulo="Nuevo cliente"
      onCerrar={() => {
        // Escrita en linea A PROPOSITO: es como estan las doce pantallas, y es
        // lo que hacia nacer una funcion nueva en cada render.
        huella.push(`tic ${tic}`);
        setAbierta(false);
      }}
    >
      <input aria-label="Nombre" />
    </Modal>
  );
}

describe('la base recibe siempre la misma funcion', () => {
  it('cinco repintados del padre y una sola identidad', () => {
    const { rerender } = render(<Pantalla tic={0} huella={[]} />);
    for (let i = 1; i <= 5; i += 1) rerender(<Pantalla tic={i} huella={[]} />);

    expect(recibidas.length).toBeGreaterThan(1);
    for (const fn of recibidas) expect(fn).toBe(recibidas[0]);
  });
});

describe('y esa funcion corre el callback del ultimo render', () => {
  it('llamar a la PRIMERA que recibio la base ejecuta la de hoy', () => {
    const huella: string[] = [];
    const { rerender } = render(<Pantalla tic={0} huella={huella} />);
    rerender(<Pantalla tic={9} huella={huella} />);

    // La base guardo la del primer render en su efecto. Tiene que llamar a la
    // de hoy — si no, cerraria sobre un estado que ya no existe.
    recibidas[0]!();

    expect(huella).toEqual(['tic 9']);
  });
});
