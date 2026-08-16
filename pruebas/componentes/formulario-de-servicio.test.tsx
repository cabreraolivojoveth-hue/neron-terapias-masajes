/**
 * @vitest-environment happy-dom
 *
 * EL FORMULARIO DE UN SERVICIO.
 *
 * Casi todo lo que se prueba aqui son fallos que costaron caro en otros
 * modulos: un nombre de puros espacios, una duracion en cero que la base
 * rechaza con un mensaje que no ayuda en un mostrador, una "promocion" mas
 * cara que el precio de lista, y el foco que se pierde despues de cada letra.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DIAS_DE_LA_SEMANA,
  FormularioDeServicio,
  SERVICIO_VACIO,
  aInput,
  deInput,
  validarServicio,
} from '../../src/servicios/formulario-de-servicio.js';
import type { DatosDeServicio } from '../../src/datos/servicios.js';

afterEach(cleanup);

const BUENO: DatosDeServicio = { ...SERVICIO_VACIO, nombre: 'Sesión Uno', precioCentavos: 50000 };

describe('lo que NO se deja guardar', () => {
  it('un nombre de puros espacios', () => {
    // Pasa cualquier "no vacio" y deja un renglon en blanco en la agenda que
    // nadie sabe que servicio es.
    expect(validarServicio({ ...BUENO, nombre: '   ' }).nombre).toBeTruthy();
  });

  it('una duracion en cero o negativa', () => {
    // La duracion calcula la hora de fin de cada cita.
    expect(validarServicio({ ...BUENO, duracionMin: 0 }).duracionMin).toBeTruthy();
    expect(validarServicio({ ...BUENO, duracionMin: -30 }).duracionMin).toBeTruthy();
  });

  it('una sesion mas larga que un dia', () => {
    expect(validarServicio({ ...BUENO, duracionMin: 24 * 60 + 1 }).duracionMin).toBeTruthy();
  });

  it('un precio negativo', () => {
    expect(validarServicio({ ...BUENO, precioCentavos: -1 }).precioCentavos).toBeTruthy();
  });

  it('una promocion MAS CARA que el precio normal', () => {
    // No es capricho: significa que alguien escribio el numero en el campo
    // equivocado, y asi se cobra de mas todos los dias hasta que alguien note.
    const e = validarServicio({ ...BUENO, precioCentavos: 50000, precioPromocionalCentavos: 90000 });
    expect(e.precioPromocionalCentavos).toBeTruthy();
  });

  it('una promocion que termina antes de empezar', () => {
    const e = validarServicio({
      ...BUENO, promocionDesde: '10/08/2026', promocionHasta: '01/08/2026',
    });
    expect(e.promocionHasta).toBeTruthy();
  });

  it('un horario que cierra antes de abrir', () => {
    expect(validarServicio({ ...BUENO, horaDesde: '18:00', horaHasta: '09:00' }).horaHasta).toBeTruthy();
    expect(validarServicio({ ...BUENO, horaDesde: '09:00', horaHasta: '09:00' }).horaHasta).toBeTruthy();
  });

  it('"requiere preparacion: si" sin decir cual', () => {
    // Quien recibe al paciente no sabe que pedirle.
    const e = validarServicio({ ...BUENO, requierePreparacion: true, preparacion: '  ' });
    expect(e.preparacion).toBeTruthy();
  });
});

describe('lo que SI se deja guardar', () => {
  it('un servicio minimo, sin promocion ni disponibilidad', () => {
    expect(validarServicio(BUENO)).toEqual({});
  });

  it('un servicio de CORTESIA, en cero', () => {
    // Un servicio gratis existe: cero no es lo mismo que "sin precio".
    expect(validarServicio({ ...BUENO, precioCentavos: 0 })).toEqual({});
  });

  it('una promocion igual al precio normal', () => {
    const e = validarServicio({ ...BUENO, precioPromocionalCentavos: 50000 });
    expect(e.precioPromocionalCentavos).toBeUndefined();
  });

  it('una promocion sin fechas: vale desde siempre y hasta siempre', () => {
    const e = validarServicio({ ...BUENO, precioPromocionalCentavos: 30000 });
    expect(e).toEqual({});
  });
});

describe('las fechas del campo nativo', () => {
  it('van y vienen sin perder el dia', () => {
    expect(aInput('06/08/2026')).toBe('2026-08-06');
    expect(deInput('2026-08-06')).toBe('06/08/2026');
    expect(deInput(aInput('31/12/2026'))).toBe('31/12/2026');
  });

  it('lo que no es fecha se queda vacio en vez de romper el campo', () => {
    expect(aInput('')).toBe('');
    expect(aInput('cualquier cosa')).toBe('');
    expect(deInput('')).toBe('');
  });
});

describe('los dias de la semana', () => {
  it('son siete y van en digitos ISO: 1 es lunes y 7 domingo', () => {
    // El mismo criterio que usa la base para `extract(isodow)`. Con domingo en
    // cero, un servicio de domingo se ofreceria en lunes.
    expect(DIAS_DE_LA_SEMANA).toHaveLength(7);
    expect(DIAS_DE_LA_SEMANA[0]?.clave).toBe('1');
    expect(DIAS_DE_LA_SEMANA[0]?.largo).toBe('lunes');
    expect(DIAS_DE_LA_SEMANA[6]?.clave).toBe('7');
    expect(DIAS_DE_LA_SEMANA[6]?.largo).toBe('domingo');
  });
});

describe('el formulario en pantalla', () => {
  function pintar(extra: Partial<React.ComponentProps<typeof FormularioDeServicio>> = {}) {
    const props: React.ComponentProps<typeof FormularioDeServicio> = {
      abierto: true, titulo: 'Nuevo servicio', inicial: SERVICIO_VACIO,
      categorias: [], trabajando: false, error: null,
      onGuardar: () => {}, onBuscarParecido: async () => null, onCerrar: () => {},
      ...extra,
    };
    return render(<FormularioDeServicio {...props} />);
  }

  it('arranca VACIO: ni un nombre ni una cifra de la captura de referencia', () => {
    pintar();
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('');
    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('Masaje Relajante');
    expect(texto).not.toContain('NaN');
  });

  it('el campo NO pierde el foco al escribir', async () => {
    // Definir un componente dentro del render de otro hace que React lo trate
    // como nuevo en cada pulsacion y el cursor se salga.
    pintar();
    const campo = screen.getByLabelText(/Nombre/);
    await userEvent.type(campo, 'Sesión de prueba');
    expect((campo as HTMLInputElement).value).toBe('Sesión de prueba');
    expect(document.activeElement).toBe(campo);
  });

  it('la informacion adicional viene PLEGADA', async () => {
    // Quince campos a la vista hacen que se capture menos, no mas.
    pintar();
    expect(screen.queryByLabelText(/Precio promocional/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Lo demás del servicio/ }));
    expect(screen.getByLabelText(/Precio promocional/)).toBeTruthy();
  });

  it('la preparacion solo se pide cuando se marca que hace falta', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: /Lo demás del servicio/ }));
    expect(screen.queryByLabelText(/En qué consiste/)).toBeNull();
    await userEvent.click(screen.getByLabelText(/Requiere preparación/));
    expect(screen.getByLabelText(/En qué consiste/)).toBeTruthy();
  });

  it('el precio se captura en PESOS y se guarda en CENTAVOS', async () => {
    // Guardar dinero con decimales acaba en totales que no cuadran por un
    // centavo, y esos son los que nadie encuentra.
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Sesión');
    await userEvent.clear(screen.getByLabelText(/^Precio/));
    await userEvent.type(screen.getByLabelText(/^Precio/), '450.50');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect((guardar.mock.calls[0]?.[0] as DatosDeServicio).precioCentavos).toBe(45050);
  });

  it('NO guarda cuando algo esta mal, y dice que', async () => {
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el nombre del servicio.')).toBeTruthy();
  });

  it('avisa cuando ya existe uno que se llama igual', async () => {
    // Dos renglones iguales dejan la mitad de las citas colgando de uno y la
    // mitad del otro, y ningun reporte por servicio vuelve a cuadrar.
    pintar({ onBuscarParecido: async () => ({ id: 's9', nombre: 'Sesión Uno' }) });
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Sesión Uno');
    expect(await screen.findByText('Sesión Uno', { selector: 'strong' })).toBeTruthy();
  });

  it('los dias se prenden y se apagan, y se guardan ordenados', async () => {
    const guardar = vi.fn();
    pintar({ onGuardar: guardar });
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Sesión');
    await userEvent.click(screen.getByRole('button', { name: /Lo demás del servicio/ }));
    await userEvent.click(screen.getByRole('button', { name: 'miércoles' }));
    await userEvent.click(screen.getByRole('button', { name: 'lunes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect((guardar.mock.calls[0]?.[0] as DatosDeServicio).diasDisponibles).toBe('13');
  });
});
