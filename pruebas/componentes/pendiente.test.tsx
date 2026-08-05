/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Pendiente } from '../../src/modulos/pendiente.js';
import { MODULOS } from '../../src/modulos/registro.js';

afterEach(cleanup);

describe('un modulo que todavia no llega', () => {
  it('dice cual es y en que bloque llega', () => {
    render(<Pendiente modulo="agenda" />);
    expect(screen.getByText('Agenda todavía no está')).toBeDefined();
    expect(screen.getByText('Bloque 4')).toBeDefined();
  });

  it('explica que va a hacer, en vez de dejar la pantalla muda', () => {
    render(<Pendiente modulo="clientes" />);
    expect(screen.getByText(/pacientes y su historial/i)).toBeDefined();
  });

  it('DICE que esta vacia a proposito', () => {
    // Es la diferencia entre "todavia no lo hacemos" y "esta roto". Sin esta
    // linea, quien la abre no sabe cual de las dos es.
    render(<Pendiente modulo="ventas" />);
    expect(screen.getByText(/vacía a propósito/i)).toBeDefined();
  });

  it('NUNCA pinta datos de ejemplo', () => {
    for (const m of MODULOS) {
      cleanup();
      const { container } = render(<Pendiente modulo={m.id} />);
      const texto = container.textContent ?? '';
      for (const inventado of ['Ana López', 'José Pérez', '$4,850', '28 sesiones', 'Reiki 28']) {
        expect(texto, `${m.id} trae "${inventado}"`).not.toContain(inventado);
      }
      // Ni tablas ni graficas de mentiras esperando datos.
      expect(container.querySelector('table'), m.id).toBeNull();
      expect(container.querySelector('svg'), m.id).toBeNull();
    }
  });

  it('una direccion que no existe se explica, no revienta', () => {
    render(<Pendiente modulo="facturacion" />);
    expect(screen.getByText('Esa pantalla no existe')).toBeDefined();
  });

  it('todos los modulos del registro tienen algo que mostrar', () => {
    for (const m of MODULOS) {
      cleanup();
      render(<Pendiente modulo={m.id} />);
      expect(screen.getByRole('heading'), m.id).toBeDefined();
    }
  });
});
