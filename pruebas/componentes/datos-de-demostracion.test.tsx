/**
 * @vitest-environment happy-dom
 *
 * LA TARJETA DE LOS DATOS DE DEMOSTRACION.
 *
 * Lo que se vigila es lo que hace que apretar el boton no sea una sorpresa: que
 * se diga ANTES que los datos son inventados y que van a esta base, que quitar
 * se escriba en vez de confirmarse con un clic, y que la cuenta equivocada
 * reciba una explicacion en vez de una pantalla en blanco.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DatosDeDemostracion,
  comoSeCuentanLasFilas,
  confirmaElQuitar,
  cuandoSeSembro,
} from '../../src/configuracion/datos-de-demostracion.js';
import { DEMOSTRACION_VACIA } from '../../src/datos/demostracion.js';

afterEach(cleanup);

const pintar = (extra: Record<string, unknown> = {}) => {
  const onCargar = vi.fn();
  const onQuitar = vi.fn();
  const onReintentar = vi.fn();
  render(
    <DatosDeDemostracion
      correo="quien.sea@correo.mx"
      estado={{ ...DEMOSTRACION_VACIA, puede: true }}
      cargando={false}
      error={null}
      progreso={null}
      trabajando={null}
      onCargar={onCargar}
      onQuitar={onQuitar}
      onReintentar={onReintentar}
      {...extra}
    />,
  );
  return { onCargar, onQuitar, onReintentar };
};

describe('antes de cargar nada', () => {
  it('dice que los datos son INVENTADOS y que van a esta base', () => {
    /*
     * Es lo unico que impide que alguien cargue una demostracion en el centro
     * donde de verdad trabaja y despues crea que las cifras son suyas.
     */
    pintar();
    expect(screen.getByText(/datos inventados y se ven como reales/i)).toBeDefined();
    expect(screen.getByText(/ninguna cifra de ninguna pantalla es tuya/i)).toBeDefined();
  });

  it('dice que se pueden quitar enteros, antes de cargarlos', () => {
    // Saber que hay vuelta atras cambia por completo la decision de apretar.
    pintar();
    expect(screen.getByText(/Se pueden quitar enteros/i)).toBeDefined();
  });

  it('avisa de que tarda, y de que no se cierre a media carga', () => {
    pintar();
    expect(screen.getByText(/Tarda cerca de un minuto/i)).toBeDefined();
  });

  it('el boton pide cargar una vez', async () => {
    const { onCargar } = pintar();
    await userEvent.click(screen.getByRole('button', { name: /Cargar los datos/i }));
    expect(onCargar).toHaveBeenCalledTimes(1);
  });

  it('no ofrece quitar lo que todavia no existe', () => {
    pintar();
    expect(screen.queryByRole('button', { name: /Quitar la demostración/i })).toBeNull();
  });
});

describe('mientras carga', () => {
  it('enseña los nueve pasos y cual va corriendo', () => {
    /*
     * La carga tarda cerca de un minuto. Sin la lista, una pantalla quieta
     * durante un minuto se lee como una pantalla colgada y alguien recarga a
     * media carga.
     */
    pintar({
      trabajando: 'cargando',
      progreso: { paso: 2, pasos: 9, titulo: 'Los pacientes', hechas: 45, siguiente: 3, filas: 300 },
    });
    expect(screen.getByText(/El catálogo del centro/)).toBeDefined();
    expect(screen.getByText(/El primer mes de trabajo — cargando…/)).toBeDefined();
  });

  it('con la carga en marcha, el boton no se puede apretar otra vez', () => {
    pintar({ trabajando: 'cargando' });
    const boton = screen.getByRole('button', { name: /Cargar los datos/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });
});

describe('cuando la carga se quedo a MEDIAS', () => {
  /*
   * Paso con la carga de verdad: murio en el paso 3 —habia una caja abierta del
   * uso normal— y la tarjeta dijo "Ya está cargada. Para volver a cargarla hay
   * que quitarla primero", que es la peor respuesta posible cuando faltan siete
   * novenas partes.
   */
  const aMedias = {
    ...DEMOSTRACION_VACIA,
    puede: true,
    cargada: true,
    completa: false,
    ultimoPaso: 2,
    filas: 172,
    sembradaEn: '2026-08-17T02:40:00Z',
  };

  it('lo dice con esas palabras, y no "cargada"', () => {
    pintar({ estado: aMedias });
    expect(screen.getByText(/A medias: 2 de 9 pasos/)).toBeDefined();
    expect(screen.queryByText(/Ya está cargada/)).toBeNull();
  });

  it('ofrece CONTINUAR desde donde se quedo, no volver a empezar', () => {
    // Cada paso es su propia transacción: lo que entró está completo y volver a
    // sembrarlo duplicaría esos meses.
    pintar({ estado: aMedias });
    expect(screen.getByRole('button', { name: /Continuar desde el paso 3/ })).toBeDefined();
  });

  it('sin marca de paso NO adivina: pide quitarla y empezar de nuevo', () => {
    /*
     * Le pasa a una carga hecha con la version que todavia no anotaba los
     * pasos. Seguir desde el uno sembraria dos veces el catalogo y los
     * pacientes, y eso no se ve hasta que un reporte no cuadra.
     */
    pintar({ estado: { ...aMedias, ultimoPaso: 0 } });
    expect(screen.queryByRole('button', { name: /Continuar/ })).toBeNull();
    expect(screen.getByText(/sin la marca de hasta dónde llegó/i)).toBeDefined();
  });

  it('el avance sobrevive a recargar la pagina', () => {
    // El numero de pasos hechos sale de la base, no de lo que vio esta
    // pantalla: sin eso, recargar borraria las palomitas y parecería que no se
    // hizo nada.
    pintar({ estado: aMedias, progreso: null });
    expect(screen.getByText(/A medias: 2 de 9 pasos/)).toBeDefined();
  });
});

describe('cuando ya esta cargada', () => {
  const cargada = {
    ...DEMOSTRACION_VACIA,
    puede: true,
    cargada: true,
    completa: true,
    ultimoPaso: 9,
    filas: 6812,
    sembradaEn: '2026-08-16T10:00:00Z',
  };

  it('dice cuanto se sembro y desde cuando', () => {
    pintar({ estado: cargada });
    expect(screen.getByText('6,812 renglones')).toBeDefined();
    expect(screen.getByText('16/08/2026')).toBeDefined();
  });

  it('NO deja volver a cargarla encima, y explica por que', () => {
    // Dos cargas duplicarian cinco meses de historia y ningun reporte volveria
    // a cuadrar. La base tambien lo rechaza; aqui se dice antes.
    pintar({ estado: cargada });
    expect(screen.queryByRole('button', { name: /Cargar los datos/i })).toBeNull();
    expect(screen.getByText(/duplicarían cinco meses de historia/i)).toBeDefined();
  });

  it('quitar se ESCRIBE: el boton no se activa con cualquier cosa', async () => {
    const { onQuitar } = pintar({ estado: cargada });
    const boton = screen.getByRole('button', { name: /Quitar la demostración/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/Escribe "quitar"/i), 'si');
    expect(boton.disabled).toBe(true);

    await userEvent.clear(screen.getByLabelText(/Escribe "quitar"/i));
    await userEvent.type(screen.getByLabelText(/Escribe "quitar"/i), 'QUITAR');
    expect(boton.disabled).toBe(false);
    await userEvent.click(boton);
    expect(onQuitar).toHaveBeenCalledTimes(1);
  });

  it('promete que lo capturado de verdad se queda', () => {
    pintar({ estado: cargada });
    expect(screen.getByText(/Lo que hayas capturado tú se queda/i)).toBeDefined();
  });
});

describe('la cuenta equivocada', () => {
  it('recibe una explicacion, no una pantalla en blanco', () => {
    /*
     * Llegar aqui escribiendo la direccion a mano y encontrarse un hueco hace
     * pensar que el sistema se rompio. Y se dice con que cuenta esta dentro,
     * que es lo unico que le sirve para entenderlo.
     */
    pintar({ estado: { ...DEMOSTRACION_VACIA, puede: false }, correo: 'otra@correo.mx' });
    expect(screen.getByText(/Esta cuenta no carga datos de demostración/i)).toBeDefined();
    expect(screen.getByText('otra@correo.mx')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Cargar los datos/i })).toBeNull();
  });
});

describe('los textos sueltos', () => {
  it('la fecha se parte, no se pasa por new Date', () => {
    // Convertir y volver a formatear le resta un dia a media America en cuanto
    // el servidor conteste en UTC.
    expect(cuandoSeSembro('2026-01-05T23:40:00Z')).toBe('05/01/2026');
    expect(cuandoSeSembro(null)).toBe('');
  });

  it('los renglones llevan separador de miles, y uno va en singular', () => {
    expect(comoSeCuentanLasFilas(1)).toBe('1 renglón');
    expect(comoSeCuentanLasFilas(6812)).toBe('6,812 renglones');
  });

  it('la palabra de confirmar no distingue mayusculas ni espacios', () => {
    expect(confirmaElQuitar('  Quitar ')).toBe(true);
    expect(confirmaElQuitar('quitarlo')).toBe(false);
    expect(confirmaElQuitar('')).toBe(false);
  });
});
