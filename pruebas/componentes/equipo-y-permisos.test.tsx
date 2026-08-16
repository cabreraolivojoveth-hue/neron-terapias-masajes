/**
 * @vitest-environment happy-dom
 *
 * QUIEN ENTRA AL CENTRO. Lo que de verdad se vigila aqui es la proteccion
 * anti-bloqueo: que nadie pueda quitarse a si mismo el acceso ni dejar al
 * centro sin dueño. La base lo rechaza igual —esa es la seguridad—, pero una
 * pantalla que ofrece lo que va a fallar es una pantalla que enseña a
 * desconfiar de ella.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EquipoYPermisos,
  porQueNoSePuede,
} from '../../src/configuracion/equipo-y-permisos.js';
import type { MiembroDelCentro, RolDelCentro } from '../../src/datos/configuracion.js';

afterEach(cleanup);

const YO: MiembroDelCentro = {
  id: 'm1', usuarioId: 'u1', correo: 'yo@ejemplo.mx', nombre: 'Quien administra',
  rol: 'dueno', rolEtiqueta: 'Dueña', activo: true, eliminado: false,
  permisos: null, soyYo: true, creadoEn: '',
};

const OTRA: MiembroDelCentro = {
  id: 'm2', usuarioId: 'u2', correo: 'otra@ejemplo.mx', nombre: 'Quien atiende',
  rol: 'terapeuta', rolEtiqueta: 'Terapeuta', activo: true, eliminado: false,
  permisos: null, soyYo: false, creadoEn: '',
};

const ROLES: RolDelCentro[] = [
  { id: 'dueno', etiqueta: 'Dueña', permisos: {}, activo: true, cuantos: 1 },
  { id: 'terapeuta', etiqueta: 'Terapeuta', permisos: {}, activo: true, cuantos: 1 },
];

const pintar = (extra: Record<string, unknown> = {}) => {
  const espias = {
    onInvitar: vi.fn(), onCambiarRol: vi.fn(), onCambiarAcceso: vi.fn(),
    onDarDeBaja: vi.fn(), onCancelarInvitacion: vi.fn(), onReintentar: vi.fn(),
  };
  render(
    <EquipoYPermisos
      equipo={{ miembros: [YO, OTRA], invitaciones: [], duenosActivos: 1 }}
      roles={ROLES}
      cargando={false}
      error={null}
      trabajando={false}
      errorAlGuardar={null}
      soyDuena
      {...espias}
      {...extra}
    />,
  );
  return espias;
};

describe('la proteccion anti-bloqueo', () => {
  it('a mi misma no se me deja cambiar el rol, y se dice por que', () => {
    /*
     * Sin esto, la unica dueña puede cambiarse a "consulta" con un clic y
     * quedarse fuera de su propio centro sin forma de volver.
     */
    pintar();
    const selector = screen.getByLabelText('Rol de Quien administra') as HTMLSelectElement;
    expect(selector.disabled).toBe(true);
    expect(screen.getByText(/Es tu propia cuenta/)).toBeDefined();
  });

  it('al ULTIMO dueño tampoco, y dice que nombre a otro antes', () => {
    const soloDueno: MiembroDelCentro = { ...YO, id: 'm3', soyYo: false, nombre: 'Otra dueña' };
    expect(porQueNoSePuede(soloDueno, 1)).toContain('único dueño');
    expect(porQueNoSePuede(soloDueno, 2)).toBe('');
  });

  it('a quien no es ni yo ni el ultimo dueño, SI se le puede', () => {
    expect(porQueNoSePuede(OTRA, 1)).toBe('');
    pintar();
    const selector = screen.getByLabelText('Rol de Quien atiende') as HTMLSelectElement;
    expect(selector.disabled).toBe(false);
  });

  it('solo quien ya es dueña puede ofrecer el rol de dueña', () => {
    /*
     * Con `gestionarUsuarios` a secas, quien administra podria meter a un
     * comodo suyo como dueño y quedarse con el centro.
     */
    cleanup();
    pintar({ soyDuena: false });
    const selector = screen.getByLabelText('Rol de Quien atiende');
    expect(selector.textContent).not.toContain('Dueña');
  });
});

describe('invitar', () => {
  it('dice que NO manda ningun correo ni crea la cuenta', async () => {
    /*
     * Es la mentira mas facil de colar: quien lea "invitación enviada" va a dar
     * por avisada a una persona que no sabe nada.
     */
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Invitar a alguien/ }));
    expect(screen.getByText(/no manda ningún correo ni crea la cuenta/i)).toBeDefined();
  });

  it('sin correo no se invita', async () => {
    const { onInvitar } = pintar();
    await userEvent.click(screen.getByRole('button', { name: /Invitar a alguien/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Dejar la invitación' }));
    expect(onInvitar).not.toHaveBeenCalled();
    expect(screen.getByText(/Escribe el correo/)).toBeDefined();
  });
});

describe('dar de baja', () => {
  it('se confirma antes, y se dice que NO se borra nada', async () => {
    /*
     * Sus ventas, sus cortes de caja y su rastro en la bitacora tienen que
     * seguir teniendo un nombre: un renglon menos convierte media historia del
     * centro en "usuario desconocido".
     */
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Acciones para Quien atiende/ }));
    // El menu compartido pinta sus opciones con `role="menuitem"`, no como
    // botones sueltos: es lo que hace que se recorran con las flechas.
    await userEvent.click(screen.getByRole('menuitem', { name: /Dar de baja/ }));
    expect(screen.getByText(/No se borra nada/)).toBeDefined();
  });
});

describe('quien ya esta dado de baja', () => {
  it('se sigue viendo, apagado, y sin menu de acciones', () => {
    // Su nombre aparece en ventas y en la bitacora: esconderlo dejaria esos
    // renglones hablando de alguien que no esta en ninguna lista.
    cleanup();
    pintar({
      equipo: {
        miembros: [YO, { ...OTRA, activo: false, eliminado: true }],
        invitaciones: [],
        duenosActivos: 1,
      },
    });
    expect(screen.getByText('Quien atiende')).toBeDefined();
    expect(screen.getByText('Dado de baja')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Acciones para Quien atiende/ })).toBeNull();
  });
});

describe('cuando no se puede cargar', () => {
  it('lo dice y ofrece reintentar, en vez de una lista vacia', () => {
    // Una lista vacia por un fallo de red se lee como "no hay nadie en el
    // centro", que es de las cosas que mas asustan.
    cleanup();
    const { onReintentar } = pintar({ equipo: null, error: 'se cayo la red' });
    expect(screen.getByText(/No se pudo cargar el equipo/)).toBeDefined();
    void userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toBeDefined();
  });
});
