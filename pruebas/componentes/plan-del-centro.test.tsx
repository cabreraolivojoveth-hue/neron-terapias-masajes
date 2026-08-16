/**
 * @vitest-environment happy-dom
 *
 * EL PLAN Y LA LICENCIA. Lo que se vigila: que sin licencia administrada no se
 * invente un plan, y que cuando la licencia corta la escritura se diga con
 * todas sus letras — porque el sintoma de no decirlo es un martes cualquiera en
 * el que deja de poder guardarse una cita y nadie lo relaciona con una fecha.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PlanDelCentro,
  cuandoVence,
  diasQueFaltan,
} from '../../src/configuracion/plan-del-centro.js';
import type { LicenciaDelCentro } from '../../src/datos/configuracion.js';

afterEach(cleanup);

const SIN_LICENCIA: LicenciaDelCentro = {
  administrada: false, plan: null, estado: null, expiraEn: null,
  actualizadaEn: null, permiteGuardar: true,
};

const ACTIVA: LicenciaDelCentro = {
  administrada: true, plan: 'Plan de ejemplo', estado: 'activa',
  expiraEn: '2026-09-13T00:00:00.000Z', actualizadaEn: null, permiteGuardar: true,
};

describe('sin licencia administrada', () => {
  it('lo DICE, en vez de enseñar un plan inventado', () => {
    /*
     * La base falla ABIERTO a proposito: un centro jamas se queda afuera por un
     * dato que todavia no existe. La captura de referencia enseña "Profesional"
     * arriba a la derecha; ese texto es del diseño y no de ningun centro.
     */
    render(<PlanDelCentro licencia={SIN_LICENCIA} cargando={false} dias={null} />);
    expect(screen.getByText(/no tiene licencia administrada/i)).toBeDefined();
    expect(screen.queryByText('Profesional')).toBeNull();
  });

  it('y aclara que eso NO impide trabajar', () => {
    render(<PlanDelCentro licencia={SIN_LICENCIA} cargando={false} dias={null} />);
    expect(screen.getByText(/nada le corta el paso/i)).toBeDefined();
  });
});

describe('con licencia', () => {
  it('enseña plan, estado y vencimiento', () => {
    render(<PlanDelCentro licencia={ACTIVA} cargando={false} dias={28} />);
    expect(screen.getByText('Plan de ejemplo')).toBeDefined();
    expect(screen.getByText('Activa')).toBeDefined();
    expect(screen.getByText('Quedan 28 días')).toBeDefined();
  });

  it('cuando NO deja guardar, lo avisa con lo que significa de verdad', () => {
    /*
     * "Ni una cita, ni un cobro, ni un cambio aqui" es lo que hace que alguien
     * relacione el error de permisos con la fecha, en vez de buscar el problema
     * en el codigo durante una mañana.
     */
    render(
      <PlanDelCentro
        licencia={{ ...ACTIVA, estado: 'expirada', permiteGuardar: false }}
        cargando={false}
        dias={-3}
      />,
    );
    expect(screen.getByText(/no deja guardar nada nuevo/i)).toBeDefined();
    expect(screen.getByText('Vencida')).toBeDefined();
  });

  it('dice que no se arregla desde adentro, y a quien hay que hablarle', () => {
    // En Neron POS esta llave vivia dentro del bloque que el cliente escribe:
    // no era una licencia, era una sugerencia.
    render(<PlanDelCentro licencia={ACTIVA} cargando={false} dias={28} />);
    expect(screen.getByText(/no se puede cambiar desde dentro del centro/i)).toBeDefined();
  });

  it('sin fecha de vencimiento dice "Sin vencimiento", no un hueco', () => {
    render(
      <PlanDelCentro licencia={{ ...ACTIVA, expiraEn: null }} cargando={false} dias={null} />,
    );
    expect(screen.getByText('Sin vencimiento')).toBeDefined();
  });
});

describe('las fechas', () => {
  it('NO pasan por Intl: lo ilegible sale vacio', () => {
    // Una fecha de vencimiento que se lee distinta segun donde se mire no sirve
    // para nada.
    expect(cuandoVence('no es una fecha')).toBe('');
    expect(cuandoVence(null)).toBe('');
  });

  it('se escriben en español y con el mes en palabras', () => {
    expect(cuandoVence('2026-09-13T12:00:00.000Z')).toContain('septiembre');
  });

  it('sin fecha, los dias que faltan son null y NO cero', () => {
    // Cero significaria "vence hoy", que es una alarma que nadie pidio.
    expect(diasQueFaltan(null)).toBeNull();
    expect(diasQueFaltan('cualquier cosa')).toBeNull();
  });

  it('cuenta los dias hacia adelante y hacia atras', () => {
    const ahora = new Date('2026-08-16T12:00:00.000Z');
    expect(diasQueFaltan('2026-08-26T12:00:00.000Z', ahora)).toBe(10);
    expect(diasQueFaltan('2026-08-06T12:00:00.000Z', ahora)).toBe(-10);
  });
});
