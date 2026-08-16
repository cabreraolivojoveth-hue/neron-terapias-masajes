/**
 * @vitest-environment happy-dom
 *
 * LA COLUMNA DE LA DERECHA.
 *
 * Lo que se vigila: que el dinero no se enseñe sin permiso, que una tasa sin
 * denominador diga "Sin datos" en vez de 0%, y que un hilo sin ficha ofrezca
 * atarlo en vez de rellenarlo con nada.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExpedienteDeCliente } from '../../src/datos/clientes.js';
import {
  ordenarCanal,
  ordenarConversacion,
  ordenarResumen,
} from '../../src/datos/mensajes.js';
import { PanelDelContacto } from '../../src/mensajes/panel-del-contacto.js';

afterEach(cleanup);

const EXPEDIENTE: ExpedienteDeCliente = {
  id: 'cl1', nombre: 'Quien viene', telefono: '646 000 0000', correo: 'a@b.mx',
  fechaNacimiento: null, notas: null, clienteDesde: null, archivado: false,
  profesionalId: null, profesional: null,
  visitas: 4, canceladas: 0, noAsistio: 0, ultimaVisita: null, proximaCita: null,
  compras: 2, totalGastado: 150000, adeudo: 30000, cursos: 0, servicios: [],
  padecimientos: null, alergias: null, medicamentos: null, cirugias: null,
  embarazo: null, contraindicaciones: null, presionPreferida: null, aromasEvitar: null,
  direccion: null, ocupacion: null, contactoEmergencia: null, telefonoEmergencia: null,
  comoNosConocio: null, referidoPor: null, sesiones: [],
};

function pintar(sobre: Record<string, unknown> = {}) {
  const props = {
    conversacion: ordenarConversacion({
      id: 'c1', contacto: '646 000 0000', clienteId: 'cl1', cliente: 'Quien viene',
    }),
    expediente: EXPEDIENTE,
    cargandoExpediente: false,
    resumen: ordenarResumen({}),
    canales: [],
    puedeVerFinanzas: true,
    onVerCliente: () => {}, onVerCitas: () => {}, onVerCompras: () => {},
    onCrearCliente: () => {}, onLigarCliente: () => {}, onNuevoMensaje: () => {},
    onDifusion: () => {}, onAutomatizaciones: () => {}, onEtiquetas: () => {},
    onCanales: () => {},
    ...sobre,
  };
  return render(<PanelDelContacto {...(props as React.ComponentProps<typeof PanelDelContacto>)} />);
}

describe('lo financiero no se enseña sin permiso', () => {
  it('con verFinanzas se ve lo gastado y el adeudo', () => {
    pintar();
    expect(screen.getByText('Ha gastado')).toBeTruthy();
    expect(screen.getByText('Debe')).toBeTruthy();
  });

  it('sin verFinanzas NO se enseña, ni con una raya', () => {
    /**
     * Un "—" haría pensar que el cliente no debe nada, que es una afirmación.
     * Directamente no se pinta.
     */
    pintar({ puedeVerFinanzas: false });
    expect(screen.queryByText('Ha gastado')).toBeNull();
    expect(screen.queryByText('Debe')).toBeNull();
    expect(screen.queryByRole('button', { name: /Ver sus compras/ })).toBeNull();
  });
});

describe('un hilo sin ficha', () => {
  it('ofrece atarlo o crearlo, y no inventa un nombre', () => {
    pintar({
      conversacion: ordenarConversacion({ id: 'c1', contacto: '646 111 2222' }),
      expediente: null,
    });
    expect(screen.getByText('646 111 2222')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Buscar en Clientes/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Crear cliente/ })).toBeTruthy();
  });

  it('crear avisa a quien lo pinta', async () => {
    const onCrearCliente = vi.fn();
    pintar({
      conversacion: ordenarConversacion({ id: 'c1', contacto: '646 111 2222' }),
      expediente: null,
      onCrearCliente,
    });
    await userEvent.click(screen.getByRole('button', { name: /Crear cliente/ }));
    expect(onCrearCliente).toHaveBeenCalled();
  });
});

describe('el resumen', () => {
  it('sin nadie a quien responder, la tasa dice "Sin datos" y no 0%', () => {
    // Un 0% afirmaría que se dejó a todo el mundo sin contestar; lo cierto es
    // que no había a quién.
    pintar();
    expect(screen.getByText('Sin datos')).toBeTruthy();
  });

  it('sin pares de mensajes, el tiempo lo dice en vez de enseñar un cero', () => {
    pintar();
    expect(screen.getByText('Sin datos suficientes')).toBeTruthy();
  });

  it('con datos se escribe el porcentaje', () => {
    pintar({ resumen: ordenarResumen({ tasaRespuesta: 93.5, minutosDeRespuesta: 12 }) });
    expect(screen.getByText('93.5%')).toBeTruthy();
    expect(screen.getByText('12 min')).toBeTruthy();
  });
});

describe('los canales', () => {
  it('sin ninguno lo dice y explica para qué sirven', () => {
    pintar();
    expect(screen.getByText(/No hay canales conectados/)).toBeTruthy();
  });

  it('el estado que se enseña es el DE VERDAD, no "Conectado" por defecto', () => {
    // Pintar "Conectado" sin serlo haría fallar cada envío culpando al mensaje.
    pintar({ canales: [ordenarCanal({ id: 'k1', tipo: 'whatsapp', nombre: 'WhatsApp' })] });
    expect(screen.getByText('Sin conectar')).toBeTruthy();
  });
});

describe('los atajos', () => {
  it('están los cuatro del diseño', () => {
    pintar();
    for (const t of [/Nuevo mensaje/, /Enviar difusión/, /Mensajes automáticos/, /Etiquetas/]) {
      expect(screen.getByRole('button', { name: t })).toBeTruthy();
    }
  });

  it('llevan al módulo, no abren una copia aquí', async () => {
    // La cita vive en Agenda y la venta en Caja: duplicarlas sería tener dos
    // versiones de la misma cita.
    const onVerCitas = vi.fn();
    pintar({ onVerCitas });
    await userEvent.click(screen.getByRole('button', { name: /Ver sus citas/ }));
    expect(onVerCitas).toHaveBeenCalled();
  });
});
