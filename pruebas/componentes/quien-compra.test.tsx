/**
 * @vitest-environment happy-dom
 *
 * QUIEN COMPRA, CUANDO Y QUIEN COBRA.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InformacionDelCliente,
  QuienCompra,
  aValorDeCampo,
  deValorDeCampo,
} from '../../src/ventas/quien-compra.js';
import type { ClienteEnLista, ExpedienteDeCliente } from '../../src/datos/clientes.js';

afterEach(cleanup);

const CLIENTE: ClienteEnLista = {
  id: 'c1', nombre: 'Paciente Uno', telefono: '646 000 0000', correo: null,
  fechaNacimiento: null, profesionalId: null, profesional: null,
  visitas: 3, ultimaVisita: null, estado: 'activo',
};

const EXPEDIENTE: ExpedienteDeCliente = {
  id: 'c1', nombre: 'Paciente Uno', telefono: '646 000 0000', correo: 'uno@ejemplo.mx',
  fechaNacimiento: null, notas: null, clienteDesde: null, archivado: false,
  profesionalId: null, profesional: null,
  visitas: 3, canceladas: 0, noAsistio: 0, ultimaVisita: null, proximaCita: null,
  compras: 2, totalGastado: 150000, adeudo: 0, cursos: 0, servicios: [],
};

function pintar(extra: Partial<React.ComponentProps<typeof QuienCompra>> = {}) {
  const props: React.ComponentProps<typeof QuienCompra> = {
    clienteId: '', clienteNombre: '', busqueda: '', encontrados: [], buscando: false,
    fecha: '15/07/2026', vendedorId: '', vendedores: [],
    puedeCambiarVendedor: true, puedeCrearCliente: true,
    onBuscarCliente: () => {}, onEscogerCliente: () => {}, onQuitarCliente: () => {},
    onNuevoCliente: () => {}, onFecha: () => {}, onVendedor: () => {},
    ...extra,
  };
  return render(<QuienCompra {...props} />);
}

describe('la fecha va y viene sin moverse un dia', () => {
  it('a lo que entiende un campo de fecha, y de vuelta', () => {
    expect(aValorDeCampo('15/07/2026')).toBe('2026-07-15');
    expect(deValorDeCampo('2026-07-15', '01/01/2020')).toBe('15/07/2026');
  });

  it('un valor vacio CONSERVA la que habia, no la borra', () => {
    // Borrar la fecha al vaciar el campo cobra la venta en otro dia.
    expect(deValorDeCampo('', '15/07/2026')).toBe('15/07/2026');
  });
});

describe('el cliente', () => {
  it('sin cliente se DICE que la venta es de mostrador', () => {
    // Para que nadie invente un "Cliente general" en cada venta.
    pintar();
    expect(screen.getByText(/venta de mostrador/i)).toBeTruthy();
  });

  it('sin escribir nada NO se baja la lista de clientes', () => {
    pintar({ encontrados: [CLIENTE] });
    expect(screen.queryByText('Paciente Uno')).toBeNull();
  });

  it('escoger avisa con el cliente entero, no con el nombre', async () => {
    // Ventas guarda `cliente_id`; copiar el nombre lo dejaria viejo el dia que
    // esa persona se cambie el apellido.
    const escogidos: ClienteEnLista[] = [];
    pintar({ busqueda: 'pac', encontrados: [CLIENTE], onEscogerCliente: (c) => escogidos.push(c) });
    await userEvent.click(screen.getByRole('button', { name: /Paciente Uno/ }));
    expect(escogidos[0]?.id).toBe('c1');
  });

  it('ya escogido se puede quitar', async () => {
    const quitar = vi.fn();
    pintar({ clienteId: 'c1', clienteNombre: 'Paciente Uno', onQuitarCliente: quitar });
    await userEvent.click(screen.getByLabelText(/quitar a Paciente Uno/i));
    expect(quitar).toHaveBeenCalled();
  });

  it('sin permiso de clientes no se ofrece darlo de alta, y se dice donde', () => {
    pintar({ busqueda: 'nadie', encontrados: [], puedeCrearCliente: false });
    expect(screen.queryByRole('button', { name: /nuevo cliente/i })).toBeNull();
    expect(screen.getByText(/se dan de alta en Clientes/i)).toBeTruthy();
  });
});

describe('el vendedor', () => {
  it('quien no puede cambiarlo ve POR QUE, no un campo muerto', () => {
    pintar({ puedeCambiarVendedor: false });
    expect(screen.getByText(/cambiar de vendedor es de quien administra/i)).toBeTruthy();
  });

  it('cambiarlo avisa con el id de la membresia', async () => {
    const puestos: string[] = [];
    pintar({
      vendedores: [{ id: 'm1', nombre: 'Terapeuta A', rol: 'dueno', usuarioId: 'u1' }],
      onVendedor: (id) => puestos.push(id),
    });
    await userEvent.selectOptions(screen.getByLabelText(/vendedor de la venta/i), 'm1');
    expect(puestos).toEqual(['m1']);
  });
});

describe('la fecha en la pantalla', () => {
  it('cambiarla avisa en dd/mm/aaaa', () => {
    const fechas: string[] = [];
    pintar({ onFecha: (f) => fechas.push(f) });
    const campo = document.querySelector('input[type="date"]')!;
    fireEvent.change(campo, { target: { value: '2026-08-01' } });
    expect(fechas).toEqual(['01/08/2026']);
  });
});

describe('la ficha del cliente', () => {
  function pintarFicha(
    extra: Partial<React.ComponentProps<typeof InformacionDelCliente>> = {},
  ) {
    const props: React.ComponentProps<typeof InformacionDelCliente> = {
      expediente: null, cargando: false, puedeEditar: true,
      onEditar: () => {}, onVerExpediente: () => {},
      ...extra,
    };
    return render(<InformacionDelCliente {...props} />);
  }

  it('sin cliente explica que se puede cobrar igual', () => {
    pintarFicha();
    expect(screen.getByText(/venta de mostrador/i)).toBeTruthy();
  });

  it('NO inventa un saldo a favor', () => {
    // El diseño lo enseña, pero no hay libro de creditos: un saldo sin
    // movimientos que lo expliquen es dinero que aparece de la nada.
    pintarFicha({ expediente: EXPEDIENTE });
    expect(screen.queryByText(/saldo a favor/i)).toBeNull();
  });

  it('enseña lo que SI existe: compras, gastado y visitas', () => {
    pintarFicha({ expediente: EXPEDIENTE });
    expect(screen.getByText('Compras')).toBeTruthy();
    expect(screen.getByText('Gastado')).toBeTruthy();
    expect(screen.getByText('Visitas')).toBeTruthy();
  });

  it('sin telefono lo dice, no deja el renglon en blanco', () => {
    pintarFicha({ expediente: { ...EXPEDIENTE, telefono: null } });
    expect(screen.getByText('Sin teléfono')).toBeTruthy();
  });

  it('un adeudo se enseña; sin adeudo no se pinta un cero rojo', () => {
    const { unmount } = pintarFicha({ expediente: { ...EXPEDIENTE, adeudo: 50000 } });
    expect(screen.getByText(/debe/i)).toBeTruthy();
    unmount();
    pintarFicha({ expediente: EXPEDIENTE });
    expect(screen.queryByText(/debe/i)).toBeNull();
  });

  it('editar manda a Clientes, no abre otro formulario', async () => {
    const editar = vi.fn();
    pintarFicha({ expediente: EXPEDIENTE, onEditar: editar });
    await userEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(editar).toHaveBeenCalled();
  });

  it('sin permiso de clientes no sale el boton de editar', () => {
    pintarFicha({ expediente: EXPEDIENTE, puedeEditar: false });
    expect(screen.queryByRole('button', { name: /^editar$/i })).toBeNull();
  });
});
