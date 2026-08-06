/**
 * @vitest-environment happy-dom
 *
 * Las cinco tarjetas de arriba y el resumen del pie.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RESUMEN_DE_CLIENTES_VACIO, type ResumenDeClientes } from '../../src/datos/clientes.js';
import {
  CifrasDeArriba,
  ResumenGeneral,
  cifrasDeArriba,
  cifrasDelPie,
  textoDeLaCifra,
} from '../../src/clientes/cifras-de-clientes.js';

afterEach(cleanup);

const con = (c: Partial<ResumenDeClientes> = {}): ResumenDeClientes => ({
  ...RESUMEN_DE_CLIENTES_VACIO,
  ...c,
});

describe('cargando NO es cero', () => {
  it('mientras no llega el resumen, el valor es una raya', () => {
    /**
     * Un tablero que muestra 0 mientras carga le dice a la dueña que no tiene
     * clientes. Es la clase de error que nadie reporta porque no parece uno.
     */
    render(<CifrasDeArriba resumen={null} />);
    expect(screen.getAllByText('—').length).toBe(5);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('cuando SI hay cero, se dice cero y se explica que falta', () => {
    render(<CifrasDeArriba resumen={con()} />);
    expect(screen.getByText('Sin clientes registrados')).toBeTruthy();
    expect(screen.getByText('Sin visitas registradas')).toBeTruthy();
  });
});

describe('el pie de cada tarjeta explica la REGLA', () => {
  it('con datos, dice como se cuentan los activos y los frecuentes', () => {
    // Sin eso, el numero es un misterio y cada quien le supone una regla
    // distinta — y a la siguiente pantalla ya no cuadra con este.
    const cs = cifrasDeArriba(con({ activos: 3, frecuentes: 2 }));
    expect(cs.find((c) => c.clave === 'activos')?.pie).toMatch(/últimos 6 meses/);
    expect(cs.find((c) => c.clave === 'frecuentes')?.pie).toMatch(/5 sesiones o más/);
  });

  it('mientras carga el pie va vacio, no con una regla suelta', () => {
    expect(cifrasDeArriba(null).every((c) => c.pie === '')).toBe(true);
  });
});

describe('las cifras del pie', () => {
  it('son las cinco del diseño', () => {
    expect(cifrasDelPie(con()).map((c) => c.etiqueta)).toEqual([
      'Citas programadas', 'Servicios contratados', 'Compras realizadas',
      'Cursos inscritos', 'Total adeudos',
    ]);
  });

  it('las citas programadas dicen que son de los proximos 7 dias', () => {
    // El numero sin el plazo no significa nada: "12 citas" puede ser esta
    // semana o el año entero.
    expect(cifrasDelPie(con()).find((c) => c.clave === 'citas')?.pie).toBe('Próximos 7 días');
  });

  it('el adeudo se pinta como dinero, no como un numero suelto', () => {
    render(<ResumenGeneral resumen={con({ totalAdeudos: 125050 })} />);
    expect(screen.getByText('$1,250.50')).toBeTruthy();
  });

  it('sin adeudos lo dice', () => {
    render(<ResumenGeneral resumen={con()} />);
    expect(screen.getByText('$0.00')).toBeTruthy();
    expect(screen.getByText('Sin adeudos')).toBeTruthy();
  });
});

describe('como se escribe una cifra', () => {
  it('null jamas se convierte en cero', () => {
    expect(textoDeLaCifra(null)).toBe('—');
    expect(textoDeLaCifra(null, true)).toBe('—');
  });

  it('el dinero va completo, sin recortar centavos', () => {
    expect(textoDeLaCifra(485050, true)).toBe('$4,850.50');
    expect(textoDeLaCifra(7)).toBe('7');
  });
});
