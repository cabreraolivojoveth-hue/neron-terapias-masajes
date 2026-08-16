/**
 * @vitest-environment happy-dom
 *
 * LA BITACORA. Lo que se vigila: que no haya forma de editarla, que "no hay
 * nada" no se confunda con "nada coincide", y que a quien no le toca se le diga
 * con esas palabras en vez de enseñarle un vacio.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BitacoraDelCentro,
  comoSeLee,
  cuandoOcurrio,
} from '../../src/configuracion/bitacora-del-centro.js';
import {
  BITACORA_SIN_FILTROS,
  type AnotacionDeLaBitacora,
  type PaginaDeLaBitacora,
} from '../../src/datos/configuracion.js';

afterEach(cleanup);

const UNA: AnotacionDeLaBitacora = {
  id: 'a1', ocurridoEn: '2026-08-16T10:30:00.000Z', usuarioId: 'u1',
  usuario: 'Quien administra', rol: 'Dueña', modulo: 'caja', accion: 'cobrar',
  detalle: null, entidad: 'V-00001', antes: null, despues: null, motivo: null,
};

const PAGINA: PaginaDeLaBitacora = {
  filas: [UNA], total: 1, pagina: 1, porPagina: 20,
  modulos: ['caja', 'clientes'],
  gente: [{ id: 'u1', nombre: 'Quien administra' }],
};

const pintar = (extra: Record<string, unknown> = {}) => {
  const onConsulta = vi.fn();
  const onReintentar = vi.fn();
  render(
    <BitacoraDelCentro
      pagina={PAGINA}
      consulta={BITACORA_SIN_FILTROS}
      cargando={false}
      error={null}
      puedeVerla
      onConsulta={onConsulta}
      onReintentar={onReintentar}
      {...extra}
    />,
  );
  return { onConsulta, onReintentar };
};

describe('solo se lee', () => {
  it('NO hay ningun boton de editar ni de borrar', () => {
    /*
     * No es que se escondan: la base le quita el permiso de `update` y `delete`
     * sobre `auditoria` a todo el mundo, incluido el servidor. Una bitacora que
     * el auditado puede editar no es una bitacora, y esa decision tiene que
     * notarse en la pantalla.
     */
    pintar();
    for (const nombre of [/editar/i, /borrar/i, /eliminar/i, /corregir/i]) {
      expect(screen.queryByRole('button', { name: nombre })).toBeNull();
    }
  });
});

describe('a quien no le toca', () => {
  it('se le dice, en vez de enseñarle un vacio', () => {
    /*
     * Un vacio sin explicacion hace que alguien crea que el centro no ha hecho
     * nada en tres meses. La razon de verdad es que la base no le entrega ni
     * una fila.
     */
    pintar({ puedeVerla: false, pagina: null });
    expect(screen.getByText(/La bitácora no es para tu cuenta/)).toBeDefined();
    expect(screen.getByText(/no le entrega estos renglones a tu cuenta/i)).toBeDefined();
  });
});

describe('los dos vacios', () => {
  it('sin filtros dice "todavia no hay nada anotado"', () => {
    pintar({ pagina: { ...PAGINA, filas: [], total: 0 } });
    expect(screen.getByText('Todavía no hay nada anotado')).toBeDefined();
  });

  it('CON filtros dice "nada coincide", que no es lo mismo', () => {
    // Confundirlos hace que quien filtro crea que perdio su historial.
    pintar({
      pagina: { ...PAGINA, filas: [], total: 0 },
      consulta: { ...BITACORA_SIN_FILTROS, modulo: 'caja' },
    });
    expect(screen.getByText('Nada coincide con esos filtros')).toBeDefined();
  });
});

describe('los filtros', () => {
  it('las opciones salen de lo que HAY, no de una lista escrita', () => {
    /*
     * Una lista a mano ofreceria filtrar por un modulo del que no hay ni un
     * renglon, y quien lo use se queda buscando algo que nunca existio.
     */
    pintar();
    const modulos = screen.getByLabelText('Módulo');
    expect(modulos.textContent).toContain('caja');
    expect(modulos.textContent).toContain('clientes');
    expect(modulos.textContent).not.toContain('cursos');
  });

  it('cambiar un filtro vuelve a la pagina 1', async () => {
    // Sin esto, filtrar desde la pagina cuatro deja una lista vacia que parece
    // que el filtro no encontro nada.
    const { onConsulta } = pintar({ consulta: { ...BITACORA_SIN_FILTROS, pagina: 4 } });
    await userEvent.selectOptions(screen.getByLabelText('Módulo'), 'caja');
    expect(onConsulta).toHaveBeenCalledWith(expect.objectContaining({ modulo: 'caja', pagina: 1 }));
  });
});

describe('como se lee una anotacion', () => {
  it('junta quien, que y donde', () => {
    expect(comoSeLee(UNA)).toBe('Quien administra · Cobró en caja');
  });

  it('la fecha NO pasa por Intl: lo ilegible sale vacio', () => {
    /*
     * En una compilacion recortada de Node —o en el entorno de pruebas— `Intl`
     * devuelve "August" sin avisar de nada. Y una hora inventada es peor que
     * ninguna.
     */
    expect(cuandoOcurrio('no es una fecha')).toBe('');
  });

  it('lo de hoy dice "Hoy" y lo de ayer dice "Ayer"', () => {
    const ahora = new Date(2026, 7, 16, 18, 0, 0);
    const hoy = new Date(2026, 7, 16, 10, 30, 0).toISOString();
    const ayer = new Date(2026, 7, 15, 16, 15, 0).toISOString();
    expect(cuandoOcurrio(hoy, ahora)).toBe('Hoy, 10:30');
    expect(cuandoOcurrio(ayer, ahora)).toBe('Ayer, 16:15');
  });
});
