/**
 * @vitest-environment happy-dom
 *
 * LA LISTA DEL CATALOGO.
 *
 * Lo que se prueba: que VACIO y ERROR se digan distinto, que el menu de
 * acciones ofrezca solo lo que la persona puede hacer, que la etiqueta del
 * estado se voltee segun el servicio, y que la promocion se vea como
 * promocion —con el precio de lista tachado al lado— y no como precio normal.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TablaDeServicios, accionesPara } from '../../src/servicios/tabla-de-servicios.js';
import type { ServicioEnLista } from '../../src/datos/servicios.js';

afterEach(cleanup);

const SERVICIO: ServicioEnLista = {
  id: 's1', nombre: 'Sesión Uno', descripcion: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  duracionMin: 60, precioCentavos: 50000, precioHoyCentavos: 50000,
  enPromocion: false, activo: true, color: null,
};

const TODO = { gestionarCatalogo: true };
const SOLO_VER = { gestionarCatalogo: false };

function pintar(extra: Partial<React.ComponentProps<typeof TablaDeServicios>> = {}) {
  const props: React.ComponentProps<typeof TablaDeServicios> = {
    servicios: [], total: 0, pagina: 1, porPagina: 10,
    busqueda: '', estado: '', categoriaId: '', categorias: [],
    filtrosAbiertos: false, seleccionado: null, permisos: TODO,
    cargando: false, error: null,
    onBuscar: () => {}, onEstado: () => {}, onCategoria: () => {}, onFiltros: () => {},
    onPagina: () => {}, onPorPagina: () => {}, onAccion: () => {},
    onNuevo: () => {}, onReintentar: () => {},
    ...extra,
  };
  return render(<TablaDeServicios {...props} />);
}

describe('las acciones que se ofrecen', () => {
  it('lo que no se puede hacer NO se muestra, ni en gris', () => {
    // Un boton gris que no explica por que esta gris manda a preguntar. Sin
    // permiso de catalogo solo queda ver.
    const claves = accionesPara(SOLO_VER, SERVICIO).map((a) => a.clave);
    expect(claves).toEqual(['ver']);
  });

  it('con permiso salen las cuatro', () => {
    expect(accionesPara(TODO, SERVICIO).map((a) => a.clave)).toEqual([
      'ver', 'editar', 'duplicar', 'estado',
    ]);
  });

  it('la etiqueta del estado se VOLTEA: un servicio apagado se enciende', () => {
    // Ofrecer "Desactivar" sobre uno ya inactivo produce un error que se pudo
    // evitar leyendo el propio servicio.
    const activo = accionesPara(TODO, SERVICIO).find((a) => a.clave === 'estado');
    const apagado = accionesPara(TODO, { ...SERVICIO, activo: false }).find((a) => a.clave === 'estado');
    expect(activo?.etiqueta).toBe('Desactivar');
    expect(apagado?.etiqueta).toBe('Activar');
  });
});

describe('un catalogo vacio', () => {
  it('lo dice, y ofrece crear el primero', () => {
    pintar();
    expect(screen.getByText('No hay servicios registrados')).toBeTruthy();
    expect(screen.getByText('Mostrando 0 a 0 de 0 servicios')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Nuevo servicio/ }).length).toBe(1);
  });

  it('con filtros puestos dice OTRA cosa: no es lo mismo vacio que sin coincidencias', () => {
    // "No hay servicios" con un filtro puesto hace que alguien capture uno que
    // ya existe.
    pintar({ busqueda: 'masaje' });
    expect(screen.getByText('Ningún servicio coincide')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nuevo servicio/ })).toBeNull();
  });

  it('sin permiso NO se ofrece crear', () => {
    pintar({ permisos: SOLO_VER });
    expect(screen.queryByRole('button', { name: /Nuevo servicio/ })).toBeNull();
  });
});

describe('vacio y error son estados DISTINTOS', () => {
  it('un fallo de red no se lee como "no hay servicios"', () => {
    // Decir "no hay servicios" cuando lo que fallo fue la red hace que alguien
    // los capture otra vez.
    pintar({ error: 'se cayó la conexión' });
    expect(screen.getByText('No pudimos cargar los servicios.')).toBeTruthy();
    expect(screen.getByText('se cayó la conexión')).toBeTruthy();
    expect(screen.queryByText('No hay servicios registrados')).toBeNull();
  });

  it('el reintento se puede tocar', async () => {
    const reintentar = vi.fn();
    pintar({ error: 'x', onReintentar: reintentar });
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reintentar).toHaveBeenCalled();
  });

  it('mientras carga no se dice que no hay nada', () => {
    pintar({ cargando: true });
    expect(screen.queryByText('No hay servicios registrados')).toBeNull();
    expect(screen.getByText('Cargando los servicios')).toBeTruthy();
  });
});

describe('el renglon de un servicio', () => {
  it('sin categoria lo DICE en vez de dejar el hueco', () => {
    pintar({ servicios: [SERVICIO], total: 1 });
    expect(screen.getByText('Sin categoría')).toBeTruthy();
    expect(screen.getByText('60 min')).toBeTruthy();
  });

  it('la promocion enseña el precio de hoy Y el de lista tachado', () => {
    // Sin el precio de lista al lado, nadie sabe que hay una promocion puesta
    // y el numero parece el precio normal.
    const { container } = pintar({
      servicios: [{ ...SERVICIO, enPromocion: true, precioHoyCentavos: 35000 }],
      total: 1,
    });
    expect(container.querySelector('.srv-precio__hoy')?.textContent).toContain('350');
    expect(container.querySelector('.srv-precio__antes')?.textContent).toContain('500');
  });

  it('sin promocion NO se pinta un tachado', () => {
    const { container } = pintar({ servicios: [SERVICIO], total: 1 });
    expect(container.querySelector('.srv-precio__antes')).toBeNull();
  });

  it('el estado lleva palabra, no solo color', () => {
    const { container } = pintar({ servicios: [{ ...SERVICIO, activo: false }], total: 1 });
    expect(container.querySelector('.pz-pastilla')?.textContent).toBe('Inactivo');
  });
});

describe('el menu de acciones', () => {
  it('se abre y avisa que se escogio', async () => {
    const hacer = vi.fn();
    pintar({ servicios: [SERVICIO], total: 1, onAccion: hacer });
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Sesión Uno' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(hacer.mock.calls[0]?.[0]).toBe('editar');
    expect((hacer.mock.calls[0]?.[1] as ServicioEnLista).id).toBe('s1');
  });

  it('se cierra con Escape', async () => {
    pintar({ servicios: [SERVICIO], total: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Sesión Uno' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('tocar el nombre abre el detalle', async () => {
    const hacer = vi.fn();
    pintar({ servicios: [SERVICIO], total: 1, onAccion: hacer });
    await userEvent.click(screen.getByText('Sesión Uno'));
    expect(hacer.mock.calls[0]?.[0]).toBe('ver');
  });
});

describe('la paginacion', () => {
  it('cuenta con el TOTAL del servidor, no con las filas visibles', () => {
    // Contar las filas daria "10 servicios" en una pagina de diez aunque haya
    // trescientos.
    pintar({ servicios: [SERVICIO], total: 340, pagina: 1, porPagina: 10 });
    expect(screen.getByText('Mostrando 1 a 1 de 340 servicios')).toBeTruthy();
    expect(screen.getByText('1 de 34')).toBeTruthy();
  });

  it('en la primera pagina no se puede ir hacia atras', () => {
    pintar({ servicios: [SERVICIO], total: 340 });
    const atras = screen.getByRole('button', { name: 'Página anterior' }) as HTMLButtonElement;
    expect(atras.disabled).toBe(true);
  });

  it('en la ultima no se puede avanzar', () => {
    pintar({ servicios: [SERVICIO], total: 5, pagina: 1, porPagina: 10 });
    const adelante = screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement;
    expect(adelante.disabled).toBe(true);
  });
});

describe('los filtros', () => {
  it('el buscador solo aparece con los filtros abiertos, y conserva lo escrito', () => {
    pintar({ filtrosAbiertos: true, busqueda: 'masaje' });
    const campo = screen.getByLabelText(/Buscar servicio/) as HTMLInputElement;
    expect(campo.value).toBe('masaje');
  });

  it('el estado se escoge con un select NATIVO', async () => {
    // Un menu propio para tres opciones es lo que se queda oscureciendo el
    // fondo sin aparecer. El nativo siempre se ve.
    const cambiar = vi.fn();
    pintar({ onEstado: cambiar });
    await userEvent.selectOptions(screen.getByLabelText('Estado del servicio'), 'inactivo');
    expect(cambiar).toHaveBeenCalledWith('inactivo');
  });
});
