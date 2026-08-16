/**
 * @vitest-environment happy-dom
 *
 * LA CONFIGURACION DE RECORDATORIOS.
 *
 * Lo que se vigila:
 *   1. Que las automatizaciones se enseñen TODAS y APAGADAS aunque no exista ni
 *      una fila guardada — y que encenderlas pida confirmación.
 *   2. Que el aviso del navegador diga lo que de verdad hace, en vez de
 *      prometer notificaciones a secas.
 *   3. Que quien no puede configurar pueda mirar sin poder tocar.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AJUSTES_DE_ARRANQUE,
  EVENTOS,
  type AutomatizacionDeRecordatorios,
} from '../../src/datos/recordatorios.js';
import {
  AjustesDeRecordatoriosModal,
  QUE_SIGNIFICAN_LOS_DIAS,
  TITULO_QUE_SE_PROPONE,
  automatizacionEnBlanco,
  comoSeExplicaElPermiso,
  todosLosEventos,
} from '../../src/recordatorios/ajustes-de-recordatorios.js';

afterEach(cleanup);

const props = {
  abierto: true,
  ajustes: AJUSTES_DE_ARRANQUE,
  automatizaciones: [] as AutomatizacionDeRecordatorios[],
  categorias: [],
  responsables: [],
  puedeConfigurar: true,
  trabajando: false,
  error: null,
  onGuardar: () => {},
  onGuardarAutomatizacion: () => {},
  onEncenderAvisos: () => {},
  onCategorias: () => {},
  onCerrar: () => {},
};

describe('las automatizaciones', () => {
  it('sin NI UNA guardada se enseñan las cinco, apagadas', () => {
    // La tabla nace vacia a proposito: un sistema que empieza creando
    // recordatorios solos le llena la lista a quien nunca los pidio.
    const todas = todosLosEventos([]);
    expect(todas).toHaveLength(EVENTOS.length);
    expect(todas.every((a) => !a.activa)).toBe(true);
  });

  it('cada evento propone un titulo que ya sirve', () => {
    for (const e of EVENTOS) {
      expect(TITULO_QUE_SE_PROPONE[e]).toBeTruthy();
      expect(QUE_SIGNIFICAN_LOS_DIAS[e]).toBeTruthy();
    }
  });

  it('lo guardado manda sobre lo propuesto', () => {
    const guardada: AutomatizacionDeRecordatorios = {
      id: 'a1',
      evento: 'cita_nueva',
      activa: true,
      plantillaTitulo: 'Lo nuestro',
      plantillaDetalle: null,
      diasAntes: 2,
      hora: null,
      prioridad: 'alta',
      categoriaId: null,
      categoria: null,
      responsableId: null,
      responsable: null,
      creados: 4,
    };
    const cita = todosLosEventos([guardada]).find((a) => a.evento === 'cita_nueva')!;
    expect(cita.plantillaTitulo).toBe('Lo nuestro');
    expect(cita.activa).toBe(true);
    expect(cita.diasAntes).toBe(2);
  });

  it('la de stock bajo arranca en cero dias: el aviso es para hoy', () => {
    expect(automatizacionEnBlanco('stock_bajo').diasAntes).toBe(0);
    expect(automatizacionEnBlanco('cita_nueva').diasAntes).toBe(1);
  });

  it('se pintan las cinco con su estado', () => {
    render(<AjustesDeRecordatoriosModal {...props} />);
    expect(screen.getByText('Se agenda una cita')).toBeTruthy();
    expect(screen.getByText('Un producto llega a su mínimo')).toBeTruthy();
    expect(screen.getAllByText('Apagada')).toHaveLength(EVENTOS.length);
  });

  it('ENCENDER pide confirmacion; apagar no', async () => {
    // Encender puede crear treinta recordatorios de golpe —uno por cita
    // futura— y eso hay que saberlo antes, no despues.
    const usuario = userEvent.setup();
    const guardar = vi.fn();
    render(<AjustesDeRecordatoriosModal {...props} onGuardarAutomatizacion={guardar} />);
    await usuario.click(screen.getAllByRole('button', { name: 'Encender' })[0]!);
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByText('¿Encender esta automatización?')).toBeTruthy();
  });

  it('al confirmar, se guarda encendida', async () => {
    const usuario = userEvent.setup();
    const guardar = vi.fn();
    render(<AjustesDeRecordatoriosModal {...props} onGuardarAutomatizacion={guardar} />);
    await usuario.click(screen.getAllByRole('button', { name: 'Encender' })[0]!);
    await usuario.click(screen.getByRole('button', { name: 'Encenderla' }));
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ activa: true }));
  });
});

describe('el aviso del navegador', () => {
  it('DICE que solo funciona con la pestaña abierta', () => {
    // Prometer "notificaciones" a secas es peor que no tener el interruptor:
    // alguien confia, cierra el navegador, y se pierde el aviso que importaba.
    render(<AjustesDeRecordatoriosModal {...props} />);
    expect(screen.getByText(/Funciona con esta pestaña abierta/)).toBeTruthy();
    expect(screen.getByText(/todavía no existe/)).toBeTruthy();
  });

  it('cada estado del permiso se explica distinto', () => {
    expect(comoSeExplicaElPermiso('no-se-puede')).toContain('no sabe mostrar');
    expect(comoSeExplicaElPermiso('negado')).toContain('Bloqueaste');
    expect(comoSeExplicaElPermiso('sin-preguntar')).toContain('pedir permiso');
    expect(comoSeExplicaElPermiso('concedido')).toContain('ya tiene permiso');
  });

  it('en un navegador que no sabe notificar, el interruptor esta apagado', () => {
    // Un interruptor que se puede encender cuando el navegador no puede avisar
    // es un interruptor que miente, y quien lo mira cree que va a recibir algo.
    render(<AjustesDeRecordatoriosModal {...props} />);
    expect(
      (screen.getByRole('checkbox', { name: /Avisarme en el navegador/ }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  it('encenderlo pide permiso antes que nada', async () => {
    /*
     * El permiso se pide AQUI, con el gesto de la persona delante. Pedirlo al
     * abrir la pantalla es como se acaba bloqueado para siempre — y una vez
     * bloqueado ya no hay forma de volver a preguntar.
     *
     * `happy-dom` no trae `Notification`, asi que se pone una de mentira para
     * poder llegar al interruptor. Es utileria de prueba y vive solo aqui.
     */
    const original = (globalThis as Record<string, unknown>)['Notification'];
    (globalThis as Record<string, unknown>)['Notification'] = { permission: 'default' };
    try {
      const usuario = userEvent.setup();
      const encender = vi.fn();
      render(<AjustesDeRecordatoriosModal {...props} onEncenderAvisos={encender} />);
      await usuario.click(screen.getByRole('checkbox', { name: /Avisarme en el navegador/ }));
      expect(encender).toHaveBeenCalled();
    } finally {
      if (original === undefined) delete (globalThis as Record<string, unknown>)['Notification'];
      else (globalThis as Record<string, unknown>)['Notification'] = original;
    }
  });
});

describe('el comportamiento', () => {
  it('se avisa que la ventana de "proximos" cambia dos sitios a la vez', () => {
    render(<AjustesDeRecordatoriosModal {...props} />);
    expect(screen.getByText(/Cambia la tarjeta de arriba y la pestaña/)).toBeTruthy();
  });

  it('el consejo dice que es un texto fijo, no un analisis', () => {
    // Un sistema que dice "detecte que sueles posponer los martes" sin haber
    // mirado nada hace dudar de las cifras de al lado.
    render(<AjustesDeRecordatoriosModal {...props} />);
    expect(screen.getByText(/no inventa consejos/)).toBeTruthy();
  });
});

describe('los permisos', () => {
  it('quien no puede configurar mira pero no toca', () => {
    render(<AjustesDeRecordatoriosModal {...props} puedeConfigurar={false} />);
    expect(screen.getByText(/pide permiso de configuración/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Guardar configuración' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Encender' })).toBeNull();
    expect(
      (screen.getByRole('checkbox', { name: /Avisarme en el navegador/ }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  it('quien si puede, guarda', async () => {
    const usuario = userEvent.setup();
    const guardar = vi.fn();
    render(<AjustesDeRecordatoriosModal {...props} onGuardar={guardar} />);
    await usuario.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    expect(guardar).toHaveBeenCalledWith(AJUSTES_DE_ARRANQUE);
  });
});
