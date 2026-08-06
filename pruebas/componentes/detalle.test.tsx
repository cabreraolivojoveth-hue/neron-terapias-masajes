/**
 * @vitest-environment happy-dom
 *
 * EL PANEL DE DETALLE DE UN SERVICIO.
 *
 * Lo que mas se cuida aqui es NO INVENTAR. Sin dias marcados no se dice
 * "Lunes a Domingo" porque el diseño lo muestre: el horario del centro lo
 * administra Configuracion, que todavia no llega. Y una promocion guardada
 * pero vencida se dice vencida, no vigente.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DetalleDeServicio,
  comoSeLeeElCambio,
  comoSeLeeLaDisponibilidad,
  loQueCambio,
} from '../../src/servicios/detalle.js';
import type { FichaDeServicio } from '../../src/datos/servicios.js';

afterEach(cleanup);

const FICHA: FichaDeServicio = {
  id: 's1', nombre: 'Sesión Uno', descripcion: null, notas: null,
  categoriaId: null, categoria: null, categoriaColor: null,
  duracionMin: 60, precioCentavos: 50000,
  precioPromocionalCentavos: null, promocionDesde: null, promocionHasta: null,
  precioHoyCentavos: 50000, color: null,
  requierePreparacion: false, preparacion: null,
  diasDisponibles: null, horaDesde: null, horaHasta: null,
  activo: true, citasFuturas: 0, citasCompletadas: 0,
  puedeVerHistorial: true, historial: [],
};

describe('como se lee la disponibilidad', () => {
  it('sin dias marcados NO se inventa "Lunes a Domingo"', () => {
    // El diseño muestra un rango porque es un diseño. El horario del centro
    // lo administra Configuracion, que todavia no llega.
    expect(comoSeLeeLaDisponibilidad(null, null, null)).toBe('Según el horario del centro');
    expect(comoSeLeeLaDisponibilidad('', null, null)).toBe('Según el horario del centro');
  });

  it('con horas pero sin dias, se dicen las horas', () => {
    expect(comoSeLeeLaDisponibilidad(null, '09:00', '18:00')).toBe('Todos los días, de 09:00 a 18:00');
  });

  it('los siete dias se dicen "todos los días" en vez de listarlos', () => {
    expect(comoSeLeeLaDisponibilidad('1234567', null, null)).toBe('Todos los días');
  });

  it('unos cuantos dias se listan cortos', () => {
    expect(comoSeLeeLaDisponibilidad('135', null, null)).toBe('Lun, Mié, Vie');
    expect(comoSeLeeLaDisponibilidad('67', '10:00', '14:00')).toBe('Sáb, Dom, de 10:00 a 14:00');
  });

  it('una hora suelta no produce un rango a medias', () => {
    expect(comoSeLeeLaDisponibilidad('1', '09:00', null)).toBe('Lun');
  });
});

describe('la bitacora', () => {
  it('cada accion se dice en palabras', () => {
    expect(comoSeLeeElCambio('crear')).toBe('Servicio creado');
    expect(comoSeLeeElCambio('editar')).toBe('Servicio modificado');
  });

  it('una accion que no se conoce se enseña tal cual, sin inventar', () => {
    expect(comoSeLeeElCambio('lo_que_sea')).toBe('lo_que_sea');
  });

  it('solo se lista lo que de verdad cambio', () => {
    const cambios = loQueCambio(
      { nombre: 'A', precio: 100, duracion: 60 },
      { nombre: 'A', precio: 200, duracion: 60 },
    );
    expect(cambios).toEqual(['el precio']);
  });

  it('sin las dos versiones no se inventa una lista', () => {
    expect(loQueCambio(null, { precio: 1 })).toEqual([]);
    expect(loQueCambio({ precio: 1 }, null)).toEqual([]);
  });
});

describe('el panel sin nada escogido', () => {
  it('invita a tocar un servicio en vez de quedarse en blanco', () => {
    render(
      <DetalleDeServicio
        ficha={null} cargando={false} error={null} permisos={{}}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={() => {}}
      />,
    );
    expect(screen.getByText(/Toca un servicio/)).toBeTruthy();
  });
});

describe('un servicio recien creado, sin nada capturado', () => {
  function pintar(ficha: FichaDeServicio = FICHA, permisos = { gestionarCatalogo: true }) {
    return render(
      <DetalleDeServicio
        ficha={ficha} cargando={false} error={null} permisos={permisos}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={() => {}}
      />,
    );
  }

  it('cada hueco DICE que esta vacio en vez de dejarlo en blanco', () => {
    pintar();
    expect(screen.getByText('Sin categoría')).toBeTruthy();
    expect(screen.getByText('Sin promoción')).toBeTruthy();
    expect(screen.getByText('Según el horario del centro')).toBeTruthy();
    expect(screen.getByText('0 completadas · 0 agendadas')).toBeTruthy();
  });

  it('no aparece ni un dato de la captura de referencia', () => {
    pintar();
    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('NaN');
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('null');
  });

  it('las cuatro pestañas existen y las tres vacias lo dicen', async () => {
    pintar();
    await userEvent.click(screen.getByRole('tab', { name: 'Descripción' }));
    expect(screen.getByText(/todavía no tiene descripción/)).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Notas' }));
    expect(screen.getByText(/Sin notas internas/)).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    expect(screen.getByText('Todavía no hay cambios registrados.')).toBeTruthy();
  });
});

describe('"no puedes verlo" NO es lo mismo que "no existe"', () => {
  it('sin permiso de auditoria, el historial lo DICE en vez de fingir que esta vacio', async () => {
    /**
     * La regla de fila de la bitacora solo la entrega a quien tiene
     * `verAuditoria`: sin ese permiso la lista llega vacia. Decir "todavia no
     * hay cambios registrados" seria mentira —los hay— y una pantalla que
     * confunde las dos cosas enseña a desconfiar de todo lo demas que dice.
     */
    render(
      <DetalleDeServicio
        ficha={{ ...FICHA, puedeVerHistorial: false }}
        cargando={false} error={null} permisos={{}}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    expect(screen.getByText(/no tiene permiso para ver la bitácora/)).toBeTruthy();
    expect(screen.queryByText('Todavía no hay cambios registrados.')).toBeNull();
  });

  it('CON permiso y sin cambios, si dice que no hay nada', async () => {
    render(
      <DetalleDeServicio
        ficha={{ ...FICHA, puedeVerHistorial: true }}
        cargando={false} error={null} permisos={{}}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    expect(screen.getByText('Todavía no hay cambios registrados.')).toBeTruthy();
  });
});

describe('la promocion', () => {
  it('una promocion VENCIDA se dice vencida, no vigente', () => {
    // Sigue guardada, y verla sin fecha hace creer que se esta cobrando.
    render(
      <DetalleDeServicio
        ficha={{
          ...FICHA, precioPromocionalCentavos: 30000, precioHoyCentavos: 50000,
          promocionDesde: '01/01/2026', promocionHasta: '31/01/2026',
        }}
        cargando={false} error={null} permisos={{}}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={() => {}}
      />,
    );
    expect(screen.getByText(/Fuera de vigencia hoy/)).toBeTruthy();
  });

  it('una promocion vigente lo dice', () => {
    render(
      <DetalleDeServicio
        ficha={{ ...FICHA, precioPromocionalCentavos: 30000, precioHoyCentavos: 30000 }}
        cargando={false} error={null} permisos={{}}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={() => {}}
      />,
    );
    expect(screen.getByText(/Vigente hoy/)).toBeTruthy();
  });
});

describe('los permisos', () => {
  it('sin permiso de catalogo NO se ofrece editar ni apagar', () => {
    render(
      <DetalleDeServicio
        ficha={FICHA} cargando={false} error={null} permisos={{ gestionarCatalogo: false }}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /Editar servicio/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desactivar servicio/ })).toBeNull();
  });

  it('con permiso, el boton de estado se voltea segun el servicio', () => {
    const { rerender } = render(
      <DetalleDeServicio
        ficha={FICHA} cargando={false} error={null} permisos={{ gestionarCatalogo: true }}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Desactivar servicio/ })).toBeTruthy();
    rerender(
      <DetalleDeServicio
        ficha={{ ...FICHA, activo: false }} cargando={false} error={null}
        permisos={{ gestionarCatalogo: true }}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Activar servicio/ })).toBeTruthy();
  });

  it('se puede cerrar', async () => {
    const cerrar = vi.fn();
    render(
      <DetalleDeServicio
        ficha={FICHA} cargando={false} error={null} permisos={{}}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={cerrar}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar el detalle' }));
    expect(cerrar).toHaveBeenCalled();
  });
});

describe('vacio y error son estados DISTINTOS', () => {
  it('un fallo de red no se lee como "servicio sin datos"', () => {
    render(
      <DetalleDeServicio
        ficha={null} cargando={false} error="se cayó la conexión" permisos={{}}
        onEditar={() => {}} onCambiarEstado={() => {}} onCerrar={() => {}}
      />,
    );
    expect(screen.getByText('No pudimos cargar el servicio.')).toBeTruthy();
    expect(screen.queryByText(/Toca un servicio/)).toBeNull();
  });
});
