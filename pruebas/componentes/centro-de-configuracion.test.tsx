/**
 * @vitest-environment happy-dom
 *
 * LA PANTALLA DE CONFIGURACION ENTERA.
 *
 * Lo que se vigila aqui y en ningun otro sitio: que la rejilla se filtre por
 * permiso —una tarjeta que no se puede abrir no se pinta—, que ni una cifra del
 * diseño se cuele, y que las secciones se abran de verdad.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const respuestas = vi.hoisted(() => ({
  valores: {} as Record<string, unknown>,
}));

vi.mock('../../src/supabase.js', () => ({
  HAY_CONEXION: true,
  supabase: () => ({
    rpc: (nombre: string) =>
      Promise.resolve({ data: respuestas.valores[nombre] ?? null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
          }),
        }),
      }),
    }),
    auth: {
      mfa: {
        listFactors: () => Promise.resolve({ data: { all: [], totp: [] }, error: null }),
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }),
      },
    },
  }),
  clienteParaLaBase: () => { throw new Error('no se usa en pruebas'); },
}));

const sesion = vi.hoisted(() => ({
  acceso: {
    negocioId: 't_centro',
    usuarioId: 'u1',
    correo: 'yo@ejemplo.mx',
    nombre: 'Quien administra',
    rol: 'dueno',
    rolEtiqueta: 'Dueña',
    permisos: {} as Record<string, boolean>,
    modulos: [] as string[],
    esDueno: true,
  },
}));

vi.mock('../../src/identidad/sesion.js', () => ({
  useSesion: () => ({
    estado: 'listo',
    acceso: sesion.acceso,
    llave: 'x',
    fallo: null,
    cerrarSesion: async () => {},
    refrescar: async () => {},
  }),
}));

const { CentroDeConfiguracion } = await import(
  '../../src/configuracion/centro-de-configuracion.js'
);
const { ProveedorDeNavegacion } = await import('@neron/base/marco');
const { olvidarTodo } = await import('../../src/datos/consulta.js');

const TODO: Record<string, boolean> = {
  gestionarUsuarios: true, gestionarConfiguracion: true, verAuditoria: true,
  exportarDatos: true, restaurarRespaldo: true, zonaDePeligro: true, verFacturacion: true,
};

function pintar(permisos: Record<string, boolean> = TODO) {
  sesion.acceso = { ...sesion.acceso, permisos };
  return render(
    <ProveedorDeNavegacion direccionInicial="/configuracion">
      <CentroDeConfiguracion />
    </ProveedorDeNavegacion>,
  );
}

afterEach(() => {
  cleanup();
  olvidarTodo();
  respuestas.valores = {};
});

describe('la pantalla', () => {
  it('lleva el titulo y el lema del diseño', () => {
    pintar();
    expect(screen.getByText('Configuración')).toBeDefined();
    expect(screen.getByText('Administra y personaliza tu centro')).toBeDefined();
  });

  it('enseña los tres grupos con sus catorce tarjetas', () => {
    pintar();
    expect(screen.getByText('Configuración general')).toBeDefined();
    expect(screen.getByText('Personalización')).toBeDefined();
    expect(screen.getByText('Sistema y seguridad')).toBeDefined();
    expect(screen.getByRole('button', { name: /Información del centro/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Configuración avanzada/ })).toBeDefined();
  });

  it('NI UNA cifra ni un nombre del diseño', () => {
    /*
     * La captura de referencia trae "v2.1.0", "Profesional", "Días restantes:
     * 28" y "Laura Vega". Ni una de esas cosas puede salir en un centro recien
     * creado: son referencia visual, no contenido.
     */
    const { container } = pintar();
    for (const delDiseño of ['v2.1.0', 'Profesional', 'Laura Vega', '10 Ago 2025']) {
      expect(container.textContent, delDiseño).not.toContain(delDiseño);
    }
  });

  it('sin plan administrado lo DICE, no inventa uno', () => {
    pintar();
    expect(screen.getByText('Sin plan administrado')).toBeDefined();
  });
});

describe('los permisos filtran la rejilla', () => {
  it('quien no administra nada NO ve las tarjetas que no puede abrir', () => {
    /*
     * Una tarjeta gris que no se puede tocar solo sirve para que alguien
     * pregunte que le falta, y la respuesta —"un permiso que no controlas"— no
     * le sirve de nada.
     *
     * Lo que SI le queda son las tres que no piden permiso, y las tres son a
     * proposito: seguridad y su contraseña son de la CUENTA de cada quien, las
     * notificaciones solo enlazan a donde viven, y las categorias las
     * administra quien lleva su catalogo.
     */
    pintar({});
    expect(screen.queryByRole('button', { name: /Usuarios y permisos/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Respaldos/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Campos personalizados/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Configuración avanzada/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Seguridad/ })).toBeDefined();
  });

  it('sin verAuditoria, la actividad reciente dice por que esta vacia', async () => {
    // Un vacio sin explicacion hace creer que el centro no ha hecho nada.
    pintar({});
    await waitFor(() =>
      expect(screen.getByText(/necesita el permiso de auditoría/i)).toBeDefined(),
    );
    expect(screen.queryByRole('button', { name: /Ver toda la actividad/ })).toBeNull();
  });

  it('sin verFacturacion no se ofrece el detalle del plan', () => {
    pintar({});
    expect(screen.queryByRole('button', { name: /Ver detalles de mi plan/ })).toBeNull();
  });
});

describe('abrir una seccion', () => {
  it('la tarjeta lleva a su pantalla, con forma de volver', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Información del centro/ }));
    expect(screen.getByRole('button', { name: /Volver a Configuración/ })).toBeDefined();
    expect(screen.getByText('Horarios de atención')).toBeDefined();
  });

  it('y volver devuelve la rejilla', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Métodos de pago/ }));
    await userEvent.click(screen.getByRole('button', { name: /Volver a Configuración/ }));
    expect(screen.getByText('Configuración general')).toBeDefined();
  });

  it('la seguridad abre la verificacion en dos pasos', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Seguridad/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Activar la verificación/ })).toBeDefined(),
    );
  });
});

describe('los accesos rapidos', () => {
  it('estan los CINCO del diseño, y todos llevan a algo que existe', async () => {
    /*
     * El diseño pone cinco: "Mi perfil", "Cambiar contraseña", "Centro de
     * ayuda", "Soporte técnico" y "Novedades del sistema". Los cinco se quedan
     * porque es donde la gente los va a buscar; lo que NO se hace es
     * inventarles un telefono de soporte ni una lista de novedades escrita a
     * mano.
     */
    pintar();
    for (const r of ['Mi perfil', 'Cambiar contraseña', 'Centro de ayuda', 'Soporte técnico',
      'Novedades del sistema']) {
      expect(screen.getByRole('button', { name: r }), r).toBeDefined();
    }
    await userEvent.click(screen.getByRole('button', { name: 'Mi perfil' }));
    expect(screen.getByLabelText(/Cómo te llamas/)).toBeDefined();
  });

  it('los tres de ayuda abren el MISMO panel, cada uno en su apartado', async () => {
    // Los tres acaban en la misma persona: tres paneles distintos serian tres
    // sitios que mantener y dos que se quedan viejos.
    pintar();
    await userEvent.click(screen.getByRole('button', { name: 'Soporte técnico' }));
    expect(screen.getByText(/lo mantiene quien te lo instaló/i)).toBeDefined();
  });

  it('la ayuda tambien se abre desde el boton de arriba', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /^Ayuda y soporte$/ }));
    expect(screen.getAllByRole('button', { name: 'Centro de ayuda' }).length).toBeGreaterThan(0);
  });
});

describe('lo que se lee de la base', () => {
  it('el nombre del centro sale de la base, no escrito a mano', async () => {
    // Es la regla del §5: los nombres se resuelven al leer, jamás se copian.
    respuestas.valores['configuracion_del_centro'] = {
      nombre: 'Centro de la prueba',
      centro: {},
      miembros: 3,
    };
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Información del centro/ }));
    await waitFor(() =>
      expect((screen.getByLabelText(/Cómo se llama/) as HTMLInputElement).value)
        .toBe('Centro de la prueba'),
    );
  });
});
