/**
 * @vitest-environment happy-dom
 *
 * EL ARMAZON DEL CENTRO.
 *
 * Este marco existe porque el de la base pinta el menu como texto pelado. Lo
 * que se prueba aqui es justo lo que lo justifica: que cada modulo llegue con
 * su icono, que la lista vaya corrida sin encabezados de grupo, y que el
 * numero inventado del diseño NO se cuele.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProveedorDeNavegacion, resolverMenu } from '@neron/base/marco';
import { Armazon, inicialesDe, moduloEnOrden } from '../../src/marco/armazon.js';
import { GRUPOS, MODULOS } from '../../src/modulos/registro.js';

afterEach(cleanup);

const MENU = resolverMenu({
  grupos: GRUPOS.map((g) => ({ ...g, modulos: [...g.modulos] })),
  modulos: MODULOS.map((m) => ({
    id: m.id,
    etiqueta: m.etiqueta,
    ...(m.sueltoArriba ? { sueltoArriba: true } : {}),
  })),
  visibles: MODULOS.map((m) => m.id),
});

function pintar(extra: Partial<React.ComponentProps<typeof Armazon>> = {}, donde = '/inicio') {
  const props: React.ComponentProps<typeof Armazon> = {
    menu: MENU,
    pintarModulo: (m) => <p>Pantalla de {m}</p>,
    nombreDeLaPersona: 'Quien administra',
    rolDeLaPersona: 'Administradora',
    logo: <span>marca</span>,
    ...extra,
  };
  return render(
    <ProveedorDeNavegacion direccionInicial={donde}>
      <Armazon {...props} />
    </ProveedorDeNavegacion>,
  );
}

describe('las iniciales', () => {
  it('son dos como maximo: tres dejan de leerse', () => {
    expect(inicialesDe('Quien Administra Todo')).toBe('QA');
    expect(inicialesDe('Alguien')).toBe('A');
  });

  it('un nombre con espacios de mas no las rompe', () => {
    expect(inicialesDe('  Quien   Administra  ')).toBe('QA');
  });
});

describe('el orden del menu', () => {
  it('sale corrido, sin partirse en grupos', () => {
    // Trece renglones partidos en tres bloques con titulo es mas ruido que
    // ayuda: se leen igual de rapido de corrido y la barra queda mas corta.
    const orden = moduloEnOrden(MENU);
    expect(orden[0]?.id).toBe('inicio');
    expect(orden.length).toBe(MODULOS.length);
  });
});

describe('la barra lateral', () => {
  it('cada modulo llega con su icono, no solo con su palabra', () => {
    // Es lo que justifica este marco: en una lista de trece, el icono es lo
    // que deja encontrar "Ventas" sin leer las trece.
    const { container } = pintar();
    const enlaces = container.querySelectorAll('.arm-enlace');
    expect(enlaces.length).toBe(MODULOS.length);
    for (const e of enlaces) {
      expect(e.querySelector('svg'), 'un modulo se quedo sin icono').toBeTruthy();
    }
  });

  it('NO pinta los encabezados de grupo de la base', () => {
    pintar();
    for (const g of GRUPOS) {
      expect(screen.queryByText(g.etiqueta)).toBeNull();
    }
  });

  it('marca el modulo activo, y solo uno', () => {
    const { container } = pintar({}, '/ventas');
    const activos = container.querySelectorAll('.arm-enlace--activo');
    expect(activos.length).toBe(1);
    expect(activos[0]?.textContent).toContain('Ventas');
  });

  it('el activo se anuncia tambien a los lectores de pantalla', () => {
    // El color no llega a quien no ve la pantalla.
    pintar({}, '/caja');
    expect(screen.getByRole('button', { name: /Caja/ }).getAttribute('aria-current')).toBe('page');
  });

  it('NO inventa el contador del diseño', () => {
    // El "3" de Mensajes es del diseño, no de nadie. Un numero inventado en el
    // menu se ve en TODAS las pantallas, y quien lo cree entra a buscar tres
    // mensajes que no existen.
    const { container } = pintar();
    const mensajes = [...container.querySelectorAll('.arm-enlace')]
      .find((e) => e.textContent?.includes('Mensajes'));
    expect(mensajes?.textContent?.trim()).toBe('Mensajes');
  });
});

describe('la ficha de la persona', () => {
  it('enseña nombre y rol', () => {
    pintar();
    expect(screen.getByText('Quien administra')).toBeTruthy();
    expect(screen.getByText('Administradora')).toBeTruthy();
  });

  it('salir vive ahi dentro, no suelto en la barra superior', () => {
    const salir = vi.fn();
    pintar({ onSalir: salir });
    expect(screen.queryByRole('button', { name: /cerrar sesión/i })).toBeNull();
  });

  it('y aparece al abrirla', async () => {
    const salir = vi.fn();
    pintar({ onSalir: salir });
    await userEvent.click(screen.getByRole('button', { name: /Quien administra/ }));
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    expect(salir).toHaveBeenCalled();
  });

  it('sin forma de salir NO se pinta un boton muerto', () => {
    pintar();
    expect(screen.queryByRole('button', { name: /cerrar sesión/i })).toBeNull();
  });
});

describe('la barra superior', () => {
  it('NO repite el nombre del modulo', () => {
    // Cada pantalla ya lo dice en grande. Repetirlo arriba gasta el renglon
    // mas valioso de la aplicacion diciendo dos veces lo mismo.
    const { container } = pintar({}, '/ventas');
    expect(container.querySelector('.arm-superior')?.textContent).not.toContain('Ventas');
  });

  it('lleva lo que se le cuelgue', () => {
    pintar({ enLaBarraSuperior: <button type="button">Buscar</button> });
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeTruthy();
  });
});

describe('el contenido', () => {
  it('pinta el modulo de la ruta', () => {
    pintar({}, '/clientes');
    expect(screen.getByText('Pantalla de clientes')).toBeTruthy();
  });

  it('una pantalla que revienta NO tumba la aplicacion', () => {
    // La barrera va alrededor de un componente aparte a proposito: si el marco
    // llamara a pintarModulo en su propio render, el error ocurriria FUERA de
    // la barrera y se veria puesta sin proteger nada.
    const callado = vi.spyOn(console, 'error').mockImplementation(() => {});
    pintar({
      pintarModulo: () => {
        throw new Error('revento');
      },
      alFallar: () => {},
    });
    expect(screen.queryByText('Pantalla de inicio')).toBeNull();
    expect(document.querySelector('.arm-lateral')).toBeTruthy();
    callado.mockRestore();
  });

  it('hay salto al contenido para quien navega con teclado', () => {
    pintar();
    expect(screen.getByText('Ir al contenido')).toBeTruthy();
  });
});
