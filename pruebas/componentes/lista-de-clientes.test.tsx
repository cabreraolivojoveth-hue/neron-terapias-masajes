/**
 * @vitest-environment happy-dom
 *
 * El indice de clientes: buscador, renglones, paginacion y acciones.
 *
 * Dejo de ser una tabla de siete columnas con tres formas de dibujarse. Ahora
 * es UNA lista angosta al lado del expediente, que es lo que enseña el diseño.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClienteEnLista } from '../../src/datos/clientes.js';
import { ListaDeClientes, iniciales } from '../../src/clientes/lista-de-clientes.js';

afterEach(cleanup);

const cliente = (c: Partial<ClienteEnLista> = {}): ClienteEnLista => ({
  id: 'c1', nombre: 'Persona Uno', telefono: '6641234567', correo: 'uno@correo.mx',
  fechaNacimiento: null, profesionalId: null, profesional: null,
  visitas: 3, ultimaVisita: '10/07/2026', estado: 'activo',
  ...c,
});

const TODO = {
  gestionarClientes: true, gestionarAgenda: true, cobrar: true, gestionarCatalogo: true,
};

const props = {
  clientes: [] as ClienteEnLista[],
  total: 0,
  pagina: 1,
  porPagina: 10,
  busqueda: '',
  estado: '',
  profesionalId: '',
  permisos: TODO,
  cargando: false,
  error: null as string | null,
  seleccionado: null as string | null,
  onBuscar: () => {}, onPagina: () => {}, onAccion: () => {}, onNuevo: () => {},
  onReintentar: () => {}, onArchivarVarios: () => {},
};

/** Las casillas se piden: no estan puestas todo el tiempo. */
async function pedirSeleccion(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));
}

describe('las iniciales del avatar', () => {
  it('son las de los dos primeros nombres', () => {
    // No hay fotos de clientes en el sistema, y poner caras de archivo seria
    // inventar personas.
    expect(iniciales('Persona Uno')).toBe('PU');
    expect(iniciales('Alguien')).toBe('A');
    expect(iniciales('   ')).toBe('·');
  });
});

describe('VACIO y ERROR son estados distintos', () => {
  it('sin clientes invita a crear el primero', () => {
    render(<ListaDeClientes {...props} />);
    expect(screen.getByText('Todavía no hay clientes')).toBeTruthy();
    expect(screen.getByText('En cuanto des de alta al primero, aparece aquí.')).toBeTruthy();
  });

  it('con filtros puestos NO dice "no hay clientes": dice que no coinciden', () => {
    // Decir "todavia no hay clientes" con un filtro puesto hace pensar que se
    // borraron, y alguien los captura otra vez.
    render(<ListaDeClientes {...props} busqueda="zzz" />);
    expect(screen.getByText('Nadie coincide con lo que buscas')).toBeTruthy();
  });

  it('si falla la red se dice que fallo, NO que no hay clientes', () => {
    render(<ListaDeClientes {...props} error="se cayó la red" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('se cayó la red')).toBeTruthy();
    expect(screen.queryByText('Todavía no hay clientes')).toBeNull();
  });

  it('mientras carga muestra siluetas, no una lista vacia', () => {
    const { container } = render(<ListaDeClientes {...props} cargando />);
    expect(container.querySelectorAll('.pz-silueta').length).toBeGreaterThan(0);
    expect(screen.queryByText('Todavía no hay clientes')).toBeNull();
  });
});

describe('el renglon del indice', () => {
  it('lleva el nombre y como contactar, no siete columnas', () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} />);
    expect(screen.getByText('Persona Uno')).toBeTruthy();
    expect(screen.getByText('6641234567')).toBeTruthy();
    // La tabla ya no existe: lo que se lee de una persona esta en su ficha.
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sin telefono cae al correo antes de rendirse', () => {
    render(<ListaDeClientes {...props} clientes={[cliente({ telefono: null })]} total={1} />);
    expect(screen.getByText('uno@correo.mx')).toBeTruthy();
  });

  it('sin nada de contacto lo DICE, no deja un guion', () => {
    render(
      <ListaDeClientes {...props} clientes={[cliente({ telefono: null, correo: null })]} total={1} />,
    );
    expect(screen.getByText('Sin datos de contacto')).toBeTruthy();
  });

  it('el estado lleva PALABRA, no solo color', () => {
    const { container } = render(
      <ListaDeClientes {...props} clientes={[cliente({ estado: 'inactivo' })]} total={1} />,
    );
    expect(container.querySelector('.pz-pastilla')?.textContent).toBe('Inactivo');
  });

  it('el que se esta leyendo se marca, y se anuncia', () => {
    // Sin la marca, en una lista de diez nombres no se sabe cual esta abierto.
    const { container } = render(
      <ListaDeClientes {...props} clientes={[cliente()]} total={1} seleccionado="c1" />,
    );
    expect(container.querySelector('.cli-indice__renglon--puesto')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Persona Uno/ }).getAttribute('aria-current'))
      .toBe('true');
  });

  it('tocar un renglon pide abrir SU expediente', async () => {
    const accion = vi.fn();
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} onAccion={accion} />);
    await userEvent.click(screen.getByRole('button', { name: /^Persona Uno/ }));
    expect(accion.mock.calls[0]?.[0]).toBe('ver');
    expect(accion.mock.calls[0]?.[1]?.id).toBe('c1');
  });
});

describe('el total dice con que filtros se conto', () => {
  it('sin filtros es el total del directorio', () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={37} />);
    expect(screen.getByText('37 clientes')).toBeTruthy();
  });

  it('con filtros lo AVISA: si no, el numero hace dudar del otro', () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={3} busqueda="per" />);
    expect(screen.getByText('3 clientes con estos filtros')).toBeTruthy();
  });
});

describe('el indice solo escoge: no hace', () => {
  it('el renglon NO lleva menu de tres puntitos', () => {
    /**
     * Sus ocho opciones viven en la ficha y en su columna de apoyo, que es
     * donde se esta cuando se decide hacer algo. Repetidas aqui costaban los
     * pixeles que le faltaban al nombre: salia "Adriana V…".
     */
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} />);
    expect(screen.queryByRole('button', { name: /Acciones para/ })).toBeNull();
  });

  it('la flecha solo aparece en el que esta abierto', () => {
    const sin = render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} />);
    expect(sin.container.querySelectorAll('.pz-renglon__flecha').length).toBe(0);
    cleanup();

    const con = render(
      <ListaDeClientes {...props} clientes={[cliente()]} total={1} seleccionado="c1" />,
    );
    expect(con.container.querySelectorAll('.pz-renglon__flecha').length).toBe(1);
  });
});

describe('la paginacion', () => {
  it('con una sola pagina NO se pintan botones apagados', () => {
    // Dos flechas muertas debajo de seis nombres son ruido que ocupa un renglon.
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={4} />);
    expect(screen.queryByRole('group', { name: 'Páginas' })).toBeNull();
  });

  it('calcula cuantas paginas hay con el total del servidor', () => {
    // El total viene sin paginar: es lo que sostiene "3 de 4".
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={37} pagina={3} />);
    expect(screen.getByText('Página 3 de 4')).toBeTruthy();
  });

  it('en la primera pagina no se puede retroceder', () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={37} pagina={1} />);
    // `toBeDisabled` es de jest-dom, que este proyecto no instala: se
    // pregunta por la propiedad directa, que dice lo mismo.
    expect((screen.getByRole('button', { name: 'Página anterior' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it('avanzar pide la siguiente', async () => {
    const ir = vi.fn();
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={37} onPagina={ir} />);
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(ir).toHaveBeenCalledWith(2);
  });
});

describe('la seleccion multiple se PIDE', () => {
  it('de entrada no hay casillas: se le quitan pixeles al nombre por nada', () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} />);
    expect(screen.queryByLabelText('Seleccionar a Persona Uno')).toBeNull();
  });

  it('al pedirla aparecen las casillas y la accion masiva', async () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} />);
    await pedirSeleccion();
    await userEvent.click(screen.getByLabelText('Seleccionar a Persona Uno'));
    expect(screen.getByText('1 seleccionado')).toBeTruthy();
  });

  it('archivar en lote PIDE confirmacion y dice que no se borra nada', async () => {
    const archivar = vi.fn();
    render(
      <ListaDeClientes {...props} clientes={[cliente()]} total={1} onArchivarVarios={archivar} />,
    );
    await pedirSeleccion();
    await userEvent.click(screen.getByLabelText('Seleccionar a Persona Uno'));
    await userEvent.click(screen.getByRole('button', { name: /Archivar/ }));
    expect(screen.getByText(/su historial de citas, ventas y cursos queda intacto/i)).toBeTruthy();
    expect(archivar).not.toHaveBeenCalled();
  });

  it('sin permiso de gestionar clientes no se ofrece seleccionar', () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} permisos={{}} />);
    expect(screen.queryByRole('button', { name: 'Seleccionar' })).toBeNull();
  });
});
