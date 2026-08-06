/**
 * @vitest-environment happy-dom
 *
 * La lista de clientes: tabla, cuadricula, buscador, paginacion y acciones.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClienteEnLista } from '../../src/datos/clientes.js';
import { ListaDeClientes, accionesPara, iniciales } from '../../src/clientes/lista-de-clientes.js';

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
  vista: 'lista' as const,
  busqueda: '',
  estado: '',
  profesionalId: '',
  profesionales: [{ id: 'p1', nombre: 'Terapeuta A', rol: 'dueno', usuarioId: 'u1' }],
  permisos: TODO,
  cargando: false,
  error: null as string | null,
  onBuscar: () => {}, onEstado: () => {}, onProfesional: () => {}, onVista: () => {},
  onPagina: () => {}, onPorPagina: () => {}, onAccion: () => {}, onNuevo: () => {},
  onReintentar: () => {}, onArchivarVarios: () => {},
};

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
    expect(screen.getByText('No hay clientes registrados')).toBeTruthy();
    expect(screen.getByText('Comienza agregando tu primer cliente')).toBeTruthy();
  });

  it('con filtros puestos NO dice "no hay clientes": dice que no coinciden', () => {
    // Decir "no hay clientes registrados" con un filtro puesto hace pensar que
    // se borraron, y alguien los captura otra vez.
    render(<ListaDeClientes {...props} busqueda="zzz" />);
    expect(screen.getByText('Ningún cliente coincide con lo que buscas')).toBeTruthy();
  });

  it('si falla la red se dice que fallo, NO que no hay clientes', () => {
    render(<ListaDeClientes {...props} error="se cayó la red" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('se cayó la red')).toBeTruthy();
    expect(screen.queryByText('No hay clientes registrados')).toBeNull();
  });

  it('mientras carga muestra siluetas, no una lista vacia', () => {
    const { container } = render(<ListaDeClientes {...props} cargando />);
    expect(container.querySelectorAll('.terapias-silueta').length).toBeGreaterThan(0);
    expect(screen.queryByText('No hay clientes registrados')).toBeNull();
  });
});

describe('la tabla', () => {
  it('pinta las siete columnas del diseño', () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} />);
    for (const c of ['Cliente', 'Contacto', 'Última visita', 'Visitas', 'Estado', 'Acciones']) {
      expect(screen.getByText(c), c).toBeTruthy();
    }
  });

  it('un cliente sin contacto lo DICE, no deja un guion', () => {
    render(
      <ListaDeClientes
        {...props}
        clientes={[cliente({ telefono: null, correo: null })]}
        total={1}
      />,
    );
    expect(screen.getByText('Sin datos de contacto')).toBeTruthy();
  });

  it('un cliente sin visitas lo dice en vez de mostrar null', () => {
    render(
      <ListaDeClientes {...props} clientes={[cliente({ visitas: 0, ultimaVisita: null })]} total={1} />,
    );
    expect(screen.getByText('Sin visitas')).toBeTruthy();
    expect(document.body.textContent).not.toContain('null');
  });

  it('el estado lleva PALABRA, no solo color', () => {
    const { container } = render(
      <ListaDeClientes {...props} clientes={[cliente({ estado: 'inactivo' })]} total={1} />,
    );
    // La pastilla de la tabla, no la opcion del filtro que se llama igual.
    const pastilla = container.querySelector('.cli-estado--inactivo');
    expect(pastilla?.textContent).toBe('Inactivo');
  });
});

describe('la cuadricula', () => {
  it('muestra a la misma gente con otra forma', () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} vista="cuadricula" />);
    expect(screen.getByText('Persona Uno')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('el menu de acciones', () => {
  it('quien puede todo ve las ocho', () => {
    expect(accionesPara(TODO, cliente()).map((a) => a.clave)).toEqual([
      'ver', 'editar', 'cita', 'venta', 'mensaje', 'recordatorio', 'curso', 'archivar',
    ]);
  });

  it('lo que no se puede hacer NO se muestra, ni en gris', () => {
    // Un menu de opciones apagadas es ruido, y de paso le cuenta a quien no
    // debe que esas operaciones existen.
    const claves = accionesPara({}, cliente()).map((a) => a.clave);
    expect(claves).toEqual(['ver', 'mensaje', 'recordatorio']);
  });

  it('un archivado se REACTIVA, no se archiva otra vez', () => {
    const a = accionesPara(TODO, cliente({ estado: 'archivado' })).find((x) => x.clave === 'archivar');
    expect(a?.etiqueta).toBe('Reactivar');
  });

  it('se abre y avisa que se escogio', async () => {
    const accion = vi.fn();
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} onAccion={accion} />);
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Persona Uno' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Nueva cita' }));
    expect(accion.mock.calls[0]?.[0]).toBe('cita');
    expect(accion.mock.calls[0]?.[1]?.id).toBe('c1');
  });
});

describe('la paginacion', () => {
  it('dice cuantos se ven de cuantos hay', () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={37} />);
    expect(screen.getByText('Mostrando 1 de 37 clientes')).toBeTruthy();
  });

  it('en la primera pagina no se puede retroceder', () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={37} pagina={1} />);
    // `toBeDisabled` es de jest-dom, que este proyecto no instala: se
    // pregunta por la propiedad directa, que dice lo mismo.
    expect((screen.getByRole('button', { name: 'Primera página' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it('calcula cuantas paginas hay con el total del servidor', () => {
    // El total viene sin paginar: es lo que sostiene "3 de 4".
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={37} pagina={3} />);
    expect(screen.getByText('3 de 4')).toBeTruthy();
  });

  it('la ultima pagina lleva al final', async () => {
    const ir = vi.fn();
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={37} onPagina={ir} />);
    await userEvent.click(screen.getByRole('button', { name: 'Última página' }));
    expect(ir).toHaveBeenCalledWith(4);
  });
});

describe('la seleccion multiple', () => {
  it('los checkboxes funcionan y aparece la accion masiva', async () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} />);
    await userEvent.click(screen.getByLabelText('Seleccionar a Persona Uno'));
    expect(screen.getByText('1 seleccionado')).toBeTruthy();
  });

  it('archivar en lote PIDE confirmacion y dice que no se borra nada', async () => {
    const archivar = vi.fn();
    render(
      <ListaDeClientes {...props} clientes={[cliente()]} total={1} onArchivarVarios={archivar} />,
    );
    await userEvent.click(screen.getByLabelText('Seleccionar a Persona Uno'));
    await userEvent.click(screen.getByRole('button', { name: /Archivar/ }));
    expect(screen.getByText(/su historial de citas, ventas y cursos queda intacto/i)).toBeTruthy();
    expect(archivar).not.toHaveBeenCalled();
  });

  it('sin permiso de gestionar clientes no hay acciones masivas', async () => {
    render(<ListaDeClientes {...props} clientes={[cliente()]} total={1} permisos={{}} />);
    await userEvent.click(screen.getByLabelText('Seleccionar a Persona Uno'));
    expect(screen.queryByText('1 seleccionado')).toBeNull();
  });
});
