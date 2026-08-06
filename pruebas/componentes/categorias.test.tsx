/**
 * @vitest-environment happy-dom
 *
 * LA ADMINISTRACION DE CATEGORIAS.
 *
 * ARCHIVAR NO ES BORRAR, Y ANTES SE DICE A QUIEN AFECTA. Una categoria que
 * usan siete servicios, archivada a ciegas, deja a los siete sin categoria sin
 * que nadie se entere. El numero de uso es lo que convierte esa decision en
 * informada, y por eso se prueba que este SIEMPRE.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdministrarCategorias,
  CATEGORIA_VACIA,
  comoSeDiceElUso,
  validarCategoria,
} from '../../src/servicios/categorias.js';
import type { Categoria } from '../../src/datos/servicios.js';

afterEach(cleanup);

const UNA: Categoria = {
  id: 'k1', nombre: 'Categoría Uno', descripcion: null, color: null, activo: true, enUso: 0,
};

function pintar(extra: Partial<React.ComponentProps<typeof AdministrarCategorias>> = {}) {
  const props: React.ComponentProps<typeof AdministrarCategorias> = {
    abierto: true, titulo: 'Categorías de servicios', que: 'servicio',
    categorias: [], cargando: false, trabajando: false, error: null,
    onGuardar: () => {}, onArchivar: () => {}, onCerrar: () => {},
    ...extra,
  };
  return render(<AdministrarCategorias {...props} />);
}

describe('lo que NO se deja guardar', () => {
  it('un nombre de puros espacios', () => {
    expect(validarCategoria({ ...CATEGORIA_VACIA, nombre: '   ' })).toBeTruthy();
  });

  it('un nombre larguisimo, que rompe el ancho de la columna', () => {
    expect(validarCategoria({ ...CATEGORIA_VACIA, nombre: 'x'.repeat(61) })).toBeTruthy();
  });

  it('una categoria con nombre esta bien: lo demas es opcional', () => {
    expect(validarCategoria({ ...CATEGORIA_VACIA, nombre: 'Terapias' })).toBeNull();
  });
});

describe('a quien afecta archivar', () => {
  it('sin uso lo dice claro', () => {
    expect(comoSeDiceElUso(0, 'servicio')).toBe('No la usa ningún servicio.');
  });

  it('uno solo se dice en singular', () => {
    expect(comoSeDiceElUso(1, 'servicio')).toBe('La usa 1 servicio, que se quedará sin categoría.');
  });

  it('varios se dicen en plural, con el numero por delante', () => {
    expect(comoSeDiceElUso(7, 'servicio')).toBe(
      'La usan 7 servicios, que se quedarán sin categoría.',
    );
  });

  it('sirve igual para cursos: solo cambia la palabra', () => {
    expect(comoSeDiceElUso(3, 'curso')).toContain('3 cursos');
  });
});

describe('un centro sin una sola categoria', () => {
  it('lo dice, y explica para que sirven', () => {
    pintar();
    expect(screen.getByText(/Todavía no hay categorías/)).toBeTruthy();
    // Ni un nombre de la captura de referencia.
    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('Masajes');
    expect(texto).not.toContain('undefined');
  });

  it('ofrece crear la primera', () => {
    pintar();
    expect(screen.getByRole('button', { name: /Nueva categoría/ })).toBeTruthy();
  });
});

describe('con categorias', () => {
  it('el numero de uso va SIEMPRE visible, no escondido tras un clic', () => {
    pintar({ categorias: [{ ...UNA, enUso: 7 }] });
    expect(screen.getByText('La usan 7 servicios, que se quedarán sin categoría.')).toBeTruthy();
  });

  it('una categoria apagada se marca', () => {
    const { container } = pintar({ categorias: [{ ...UNA, activo: false }] });
    expect(container.querySelector('.cli-estado--inactivo')?.textContent).toBe('Inactiva');
  });

  it('archivar PIDE confirmacion y repite a quien afecta', async () => {
    const archivar = vi.fn();
    pintar({ categorias: [{ ...UNA, enUso: 7 }], onArchivar: archivar });
    await userEvent.click(screen.getByRole('button', { name: /Archivar/ }));
    expect(screen.getByText('Archivar categoría')).toBeTruthy();
    expect(archivar).not.toHaveBeenCalled();
    // El aviso repite el numero: es la ultima oportunidad de reconsiderar.
    expect(screen.getAllByText(/La usan 7 servicios/).length).toBeGreaterThan(1);
  });

  it('confirmar archiva; cancelar NO', async () => {
    const archivar = vi.fn();
    pintar({ categorias: [UNA], onArchivar: archivar });
    await userEvent.click(screen.getByRole('button', { name: /Archivar/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(archivar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Archivar/ }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Archivar' }).at(-1)!);
    expect(archivar).toHaveBeenCalledWith('k1');
  });

  it('editar carga lo que ya estaba, no un formulario en blanco', async () => {
    pintar({ categorias: [{ ...UNA, descripcion: 'Un texto' }] });
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }));
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('Categoría Uno');
    expect((screen.getByLabelText(/Descripción/) as HTMLInputElement).value).toBe('Un texto');
  });
});

describe('crear una categoria', () => {
  it('NO guarda sin nombre, y dice por que', async () => {
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el nombre de la categoría.')).toBeTruthy();
  });

  it('con nombre guarda, y sin id porque es nueva', async () => {
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }));
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Terapias');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(guardar.mock.calls[0]?.[0]).toBeNull();
    expect((guardar.mock.calls[0]?.[1] as { nombre: string }).nombre).toBe('Terapias');
  });

  it('editar guarda CON el id de la que se estaba editando', async () => {
    const guardar = vi.fn();
    pintar({ categorias: [UNA], onGuardar: guardar });
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(guardar.mock.calls[0]?.[0]).toBe('k1');
  });
});

describe('cerrado', () => {
  it('no pinta nada', () => {
    const { container } = pintar({ abierto: false });
    expect(container.textContent).toBe('');
  });
});
