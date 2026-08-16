/**
 * @vitest-environment happy-dom
 *
 * LA TABLA DE RECORDATORIOS: buscador, filtros, estados vacios y acciones.
 *
 * LA PRUEBA QUE MAS IMPORTA ES LA DEL FOCO. Escribir "HOLA" letra a letra tiene
 * que dejar el cursor donde estaba y el texto entero — es el fallo que ya costo
 * caro en otros modulos y el unico que no se ve leyendo el codigo.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaginaDeRecordatorios, RecordatorioEnLista } from '../../src/datos/recordatorios.js';
import {
  FILTROS_VACIOS,
  TablaDeRecordatorios,
  accionesDe,
  aISOSeguro,
  cuantosFiltros,
  deISOSeguro,
  hayFiltroPuesto,
  iconoDeEntidad,
  inicialDe,
} from '../../src/recordatorios/tabla-de-recordatorios.js';

afterEach(cleanup);

const HOY = '16/08/2026';

const fila = (r: Partial<RecordatorioEnLista> = {}): RecordatorioEnLista => ({
  id: 'r1',
  titulo: 'Llamar al proveedor',
  detalle: null,
  notas: null,
  fecha: HOY,
  hora: '10:00',
  prioridad: 'normal',
  estado: 'pendiente',
  vencido: false,
  categoriaId: null,
  categoria: null,
  categoriaColor: null,
  responsableId: null,
  responsable: null,
  entidadTipo: null,
  entidadId: null,
  entidadNombre: null,
  entidadContacto: null,
  recurrenteId: null,
  recurrencia: null,
  automatizacionId: null,
  origenTipo: null,
  anticipacionMin: null,
  notificadoEn: null,
  completadoEn: null,
  completadoPor: null,
  creadoPor: null,
  creadoEn: '2026-08-16T08:00:00Z',
  actualizadoEn: null,
  ...r,
});

const pagina = (filas: RecordatorioEnLista[], total = filas.length): PaginaDeRecordatorios => ({
  filas,
  total,
  pagina: 1,
  porPagina: 10,
});

const props = {
  pagina: pagina([]),
  hoy: HOY,
  busqueda: '',
  filtros: FILTROS_VACIOS,
  filtrosAbiertos: false,
  orden: 'urgencia' as const,
  descendente: false,
  porPagina: 10,
  categorias: [],
  responsables: [],
  seleccionado: null,
  cargando: false,
  error: null,
  puedeGestionar: true,
  centroVacio: true,
  onBusqueda: () => {},
  onFiltros: () => {},
  onAbrirFiltros: () => {},
  onOrden: () => {},
  onDescendente: () => {},
  onPagina: () => {},
  onPorPagina: () => {},
  onAbrir: () => {},
  onMarcar: () => {},
  onAccion: () => {},
  onNuevo: () => {},
  onExportar: () => {},
  onReintentar: () => {},
};

describe('el estado vacio', () => {
  it('sin NI UNO en el centro se invita a crear el primero', () => {
    render(<TablaDeRecordatorios {...props} />);
    expect(screen.getByText('No hay recordatorios')).toBeTruthy();
    expect(screen.getByText('Los recordatorios que crees aparecerán aquí.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nuevo recordatorio/ })).toBeTruthy();
  });

  it('con recordatorios pero sin coincidencias se dice OTRA cosa', () => {
    // Enseñar "No hay recordatorios" cuando en realidad hay cuarenta y el
    // filtro dejo cero hace creer que se perdio el trabajo.
    render(<TablaDeRecordatorios {...props} centroVacio={false} busqueda="zzz" />);
    expect(screen.getByText('Ningún recordatorio coincide')).toBeTruthy();
    expect(screen.queryByText('No hay recordatorios')).toBeNull();
  });

  it('quien no gestiona no ve el boton de crear', () => {
    render(<TablaDeRecordatorios {...props} puedeGestionar={false} />);
    expect(screen.queryByRole('button', { name: /Nuevo recordatorio/ })).toBeNull();
  });
});

describe('el buscador', () => {
  it('SE QUEDA PINTADO aunque no haya ni un renglon', () => {
    // Si viviera dentro del `{vacio ? … : …}`, React lo destruiria al aparecer
    // el primer resultado y el foco se perderia a media palabra.
    render(<TablaDeRecordatorios {...props} />);
    expect(screen.getByPlaceholderText('Buscar recordatorio…')).toBeTruthy();
  });

  it('sigue pintado mientras carga', () => {
    render(<TablaDeRecordatorios {...props} cargando pagina={null} />);
    expect(screen.getByPlaceholderText('Buscar recordatorio…')).toBeTruthy();
  });

  it('NO PIERDE EL FOCO al escribir H-O-L-A, y no se come ni una letra', async () => {
    const usuario = userEvent.setup();
    let texto = '';
    const { rerender } = render(
      <TablaDeRecordatorios {...props} busqueda={texto} onBusqueda={(v) => { texto = v; }} />,
    );

    const campo = screen.getByPlaceholderText('Buscar recordatorio…');
    campo.focus();

    for (const letra of ['H', 'O', 'L', 'A']) {
      await usuario.type(campo, letra);
      // Se repinta con lo escrito, que es lo que hace la pantalla de verdad:
      // ahi es donde un componente mal montado se desmonta y pierde el foco.
      rerender(
        <TablaDeRecordatorios {...props} busqueda={texto} onBusqueda={(v) => { texto = v; }} />,
      );
      expect(document.activeElement).toBe(screen.getByPlaceholderText('Buscar recordatorio…'));
    }

    expect(texto).toBe('HOLA');
    expect((screen.getByPlaceholderText('Buscar recordatorio…') as HTMLInputElement).value).toBe('HOLA');
  });

  it('el campo no se desmonta al pasar de vacio a con datos', async () => {
    const { rerender } = render(<TablaDeRecordatorios {...props} />);
    const antes = screen.getByPlaceholderText('Buscar recordatorio…');
    rerender(
      <TablaDeRecordatorios {...props} centroVacio={false} pagina={pagina([fila()])} />,
    );
    expect(screen.getByPlaceholderText('Buscar recordatorio…')).toBe(antes);
  });
});

describe('los filtros', () => {
  it('el panel se abre y se cierra con el boton', async () => {
    const abrir = vi.fn();
    const usuario = userEvent.setup();
    render(<TablaDeRecordatorios {...props} onAbrirFiltros={abrir} />);
    await usuario.click(screen.getByRole('button', { name: /Filtros/ }));
    expect(abrir).toHaveBeenCalled();
  });

  it('con el panel abierto salen los filtros de verdad', () => {
    render(<TablaDeRecordatorios {...props} filtrosAbiertos />);
    expect(screen.getByLabelText('Prioridad')).toBeTruthy();
    expect(screen.getByLabelText('Relacionado con')).toBeTruthy();
    expect(screen.getByLabelText('Fecha')).toBeTruthy();
    expect(screen.getByLabelText('Ordenar por')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeTruthy();
  });

  it('"Limpiar filtros" esta apagado si no hay ninguno puesto', () => {
    render(<TablaDeRecordatorios {...props} filtrosAbiertos />);
    const boton = screen.getByRole('button', { name: 'Limpiar filtros' });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });

  it('limpiar los devuelve TODOS al vacio', async () => {
    const usuario = userEvent.setup();
    const puesto = vi.fn();
    render(
      <TablaDeRecordatorios
        {...props}
        filtrosAbiertos
        filtros={{ ...FILTROS_VACIOS, prioridad: 'alta', soloRecurrentes: true }}
        onFiltros={puesto}
      />,
    );
    await usuario.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(puesto).toHaveBeenCalledWith(FILTROS_VACIOS);
  });

  it('los dos campos del rango solo salen con "rango personalizado"', () => {
    const { rerender } = render(<TablaDeRecordatorios {...props} filtrosAbiertos />);
    expect(screen.queryByText('Desde')).toBeNull();
    rerender(
      <TablaDeRecordatorios
        {...props}
        filtrosAbiertos
        filtros={{ ...FILTROS_VACIOS, rango: 'personalizado' }}
      />,
    );
    expect(screen.getByText('Desde')).toBeTruthy();
    expect(screen.getByText('Hasta')).toBeTruthy();
  });

  it('cambiar un filtro vuelve a la primera pagina', async () => {
    const usuario = userEvent.setup();
    const aPagina = vi.fn();
    render(<TablaDeRecordatorios {...props} filtrosAbiertos onPagina={aPagina} />);
    await usuario.selectOptions(screen.getByLabelText('Prioridad'), 'alta');
    expect(aPagina).toHaveBeenCalledWith(1);
  });

  it('se cuenta cuantos hay puestos, y con cero no hay filtro', () => {
    expect(hayFiltroPuesto(FILTROS_VACIOS)).toBe(false);
    expect(cuantosFiltros(FILTROS_VACIOS)).toBe(0);
    expect(cuantosFiltros({ ...FILTROS_VACIOS, prioridad: 'alta', rango: 'hoy' })).toBe(2);
  });
});

describe('los renglones', () => {
  it('se pinta el titulo, la fecha y el estado', () => {
    render(
      <TablaDeRecordatorios
        {...props}
        centroVacio={false}
        pagina={pagina([fila({ categoria: 'Créditos' })])}
      />,
    );
    expect(screen.getByText('Llamar al proveedor')).toBeTruthy();
    expect(screen.getByText('Créditos')).toBeTruthy();
    expect(screen.getByText('Hoy')).toBeTruthy();
  });

  it('sin categoria se DICE, no se deja el hueco', () => {
    render(<TablaDeRecordatorios {...props} centroVacio={false} pagina={pagina([fila()])} />);
    expect(screen.getByText('Sin categoría')).toBeTruthy();
    expect(screen.getByText('Sin asignar')).toBeTruthy();
  });

  it('marcar la casilla COMPLETA y desmarcarla REABRE', async () => {
    const usuario = userEvent.setup();
    const marcar = vi.fn();
    const { rerender } = render(
      <TablaDeRecordatorios {...props} centroVacio={false} pagina={pagina([fila()])} onMarcar={marcar} />,
    );
    await usuario.click(screen.getByRole('checkbox', { name: /Marcar .* como completado/ }));
    expect(marcar).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), true);

    rerender(
      <TablaDeRecordatorios
        {...props}
        centroVacio={false}
        pagina={pagina([fila({ estado: 'hecho' })])}
        onMarcar={marcar}
      />,
    );
    await usuario.click(screen.getByRole('checkbox', { name: /Reabrir/ }));
    expect(marcar).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'r1' }), false);
  });

  it('quien no gestiona no puede marcar', () => {
    render(
      <TablaDeRecordatorios
        {...props}
        centroVacio={false}
        puedeGestionar={false}
        pagina={pagina([fila()])}
      />,
    );
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('lo relacionado es un ENLACE, no un texto', async () => {
    const usuario = userEvent.setup();
    const accion = vi.fn();
    render(
      <TablaDeRecordatorios
        {...props}
        centroVacio={false}
        pagina={pagina([fila({ entidadTipo: 'cliente', entidadId: 'c1', entidadNombre: 'Quien sea' })])}
        onAccion={accion}
      />,
    );
    await usuario.click(screen.getByRole('button', { name: 'Quien sea' }));
    expect(accion).toHaveBeenCalledWith('abrirEntidad', expect.objectContaining({ id: 'r1' }));
  });
});

describe('el pie', () => {
  it('dice el total DEL SERVIDOR, no los renglones que se ven', () => {
    // Contar la pagina diria "de 10" sobre un filtro que dejo cuarenta.
    render(
      <TablaDeRecordatorios {...props} centroVacio={false} pagina={pagina([fila()], 42)} />,
    );
    // El texto va partido en varios nodos por las interpolaciones: se compara
    // el contenido junto, que es lo que de verdad se lee en pantalla.
    const pie = document.querySelector('.pz-pie__cuenta');
    expect(pie?.textContent?.replace(/\s+/g, ' ')).toBe('Mostrando 1 a 10 de 42 recordatorios');
  });

  it('en la primera pagina no se puede ir atras', () => {
    render(<TablaDeRecordatorios {...props} centroVacio={false} pagina={pagina([fila()], 42)} />);
    expect((screen.getByLabelText('Página anterior') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Página siguiente') as HTMLButtonElement).disabled).toBe(false);
  });

  it('un solo recordatorio se dice en singular', () => {
    render(<TablaDeRecordatorios {...props} centroVacio={false} pagina={pagina([fila()], 1)} />);
    const pie = document.querySelector('.pz-pie__cuenta');
    expect(pie?.textContent?.replace(/\s+/g, ' ')).toBe('Mostrando 1 a 1 de 1 recordatorio');
  });
});

describe('las acciones que se ofrecen', () => {
  it('lo pendiente se completa y se pospone; lo cerrado se reabre', () => {
    const claves = (r: RecordatorioEnLista): string[] =>
      accionesDe(r, true).map((o) => o.clave);

    expect(claves(fila())).toContain('completar');
    expect(claves(fila())).toContain('posponer');
    expect(claves(fila())).not.toContain('reabrir');

    expect(claves(fila({ estado: 'hecho' }))).toContain('reabrir');
    expect(claves(fila({ estado: 'hecho' }))).not.toContain('completar');
    // LO QUE NO SE PUEDE HACER NO SE OFRECE: uno cerrado no se pospone.
    expect(claves(fila({ estado: 'hecho' }))).not.toContain('posponer');
  });

  it('quien no gestiona solo puede mirar', () => {
    expect(accionesDe(fila(), false).map((o) => o.clave)).toEqual(['ver']);
  });

  it('"Enviar mensaje" solo sale si hay a quien escribirle', () => {
    // En un recordatorio de inventario abriria Mensajes sin destinatario.
    expect(accionesDe(fila(), true).map((o) => o.clave)).not.toContain('mensaje');
    expect(
      accionesDe(fila({ entidadContacto: '6640000000' }), true).map((o) => o.clave),
    ).toContain('mensaje');
  });

  it('eliminar va marcado como peligroso y de ultimo', () => {
    const opciones = accionesDe(fila(), true);
    expect(opciones[opciones.length - 1]!.clave).toBe('eliminar');
    expect(opciones[opciones.length - 1]!.peligro).toBe(true);
  });
});

describe('las ayudas de pintado', () => {
  it('cada relacion tiene su dibujo, y sin relacion una campana', () => {
    expect(iconoDeEntidad('cliente')).toBe('persona');
    expect(iconoDeEntidad('cita')).toBe('calendario');
    expect(iconoDeEntidad(null)).toBe('campana');
  });

  it('la inicial aguanta un nombre vacio sin reventar', () => {
    expect(inicialDe('Quien sea')).toBe('Q');
    expect(inicialDe('   ')).toBe('?');
  });

  it('la fecha va y vuelve del selector del navegador sin perderse', () => {
    expect(aISOSeguro('16/08/2026')).toBe('2026-08-16');
    expect(deISOSeguro('2026-08-16')).toBe('16/08/2026');
  });

  it('una fecha vacia se queda VACIA, no en basura', () => {
    // Mandarle basura a un input de fecha lo deja en blanco sin decir nada, y
    // quien lo mira cree que se le borro lo que escribio.
    expect(aISOSeguro('')).toBe('');
    expect(deISOSeguro('')).toBe('');
  });
});
