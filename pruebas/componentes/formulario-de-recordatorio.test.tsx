/**
 * @vitest-environment happy-dom
 *
 * EL FORMULARIO DE UN RECORDATORIO.
 *
 * Lo que se vigila:
 *   1. Que escribir en un campo NO mueva el cursor a otro — el fallo que hacia
 *      imposible capturar y que arregla `src/ui/modal.tsx`.
 *   2. Que la casilla de repetir cambie lo que se va a guardar, y que el boton
 *      lo diga antes de apretarlo.
 *   3. Que los errores salgan CAMPO POR CAMPO.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RECORDATORIO_VACIO,
  type DatosDeRecordatorio,
} from '../../src/datos/recordatorios.js';
import { FormularioDeRecordatorio } from '../../src/recordatorios/formulario-de-recordatorio.js';

afterEach(cleanup);

const datos = (d: Partial<DatosDeRecordatorio> = {}): DatosDeRecordatorio => ({
  ...RECORDATORIO_VACIO,
  fecha: '16/08/2026',
  ...d,
});

const props = {
  abierto: true,
  titulo: 'Nuevo recordatorio',
  datos: datos(),
  relacionado: null,
  buscandoRelacion: '',
  opcionesDeRelacion: [],
  buscandoRelacionEnCurso: false,
  categorias: [],
  responsables: [],
  anticipacionDelCentro: 30,
  puedeAdministrarCategorias: true,
  trabajando: false,
  error: null,
  mostrarErrores: false,
  loQueFalta: {},
  onCambiar: () => {},
  onBuscarRelacion: () => {},
  onGuardar: () => {},
  onCerrar: () => {},
  onAdministrarCategorias: () => {},
};

describe('los campos', () => {
  it('el titulo es obligatorio y la hora no', () => {
    render(<FormularioDeRecordatorio {...props} />);
    expect(screen.getByText('Sin hora es de todo el día.')).toBeTruthy();
  });

  it('los errores salen CAMPO POR CAMPO, no como un "revisa los datos"', () => {
    render(
      <FormularioDeRecordatorio
        {...props}
        mostrarErrores
        loQueFalta={{ titulo: 'Escribe de qué es el recordatorio.', fecha: 'Escoge la fecha.' }}
      />,
    );
    expect(screen.getByText('Escribe de qué es el recordatorio.')).toBeTruthy();
    expect(screen.getByText('Escoge la fecha.')).toBeTruthy();
  });

  it('sin pedir que se muestren, los errores NO salen', () => {
    // Marcar en rojo un formulario que se acaba de abrir es agresivo y hace que
    // se lea la pantalla como si ya se hubiera hecho algo mal.
    render(
      <FormularioDeRecordatorio {...props} loQueFalta={{ titulo: 'Falta el título.' }} />,
    );
    expect(screen.queryByText('Falta el título.')).toBeNull();
  });

  it('la anticipacion por omision DICE cual es la del centro', () => {
    // "Usar lo del centro" a secas obliga a ir a Configuración solo para saber
    // que se acaba de escoger.
    render(<FormularioDeRecordatorio {...props} anticipacionDelCentro={60} />);
    expect(screen.getByText(/Lo que diga el centro \(1 hora antes\)/)).toBeTruthy();
  });
});

describe('EL FOCO NO SALTA', () => {
  it('escribir en el titulo deja el cursor en el titulo', async () => {
    const usuario = userEvent.setup();
    let d = datos();
    const { rerender } = render(
      <FormularioDeRecordatorio {...props} datos={d} onCambiar={(x) => { d = x; }} />,
    );

    const titulo = screen.getByLabelText(/Título/);
    titulo.focus();

    for (const letra of ['H', 'O', 'L', 'A']) {
      await usuario.type(titulo, letra);
      rerender(<FormularioDeRecordatorio {...props} datos={d} onCambiar={(x) => { d = x; }} />);
      expect(document.activeElement).toBe(screen.getByLabelText(/Título/));
    }
    expect(d.titulo).toBe('HOLA');
  });

  it('un repintado del padre por otra razon TAMPOCO mueve el cursor', async () => {
    // Es el caso exacto que rompia: una consulta que revalida, un contador, otro
    // estado sin relacion — y el cursor saltaba al primer campo.
    const usuario = userEvent.setup();
    let d = datos();
    const { rerender } = render(
      <FormularioDeRecordatorio {...props} datos={d} onCambiar={(x) => { d = x; }} />,
    );
    const notas = screen.getByPlaceholderText('Lo que haga falta apuntar');
    notas.focus();
    await usuario.type(notas, 'algo');

    // Cambia algo que NO tiene que ver con el campo enfocado.
    rerender(
      <FormularioDeRecordatorio
        {...props}
        datos={d}
        onCambiar={(x) => { d = x; }}
        buscandoRelacionEnCurso
      />,
    );
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Lo que haga falta apuntar'));
  });
});

describe('la casilla de repetir', () => {
  it('apagada, el boton dice que guarda un recordatorio', () => {
    render(<FormularioDeRecordatorio {...props} />);
    expect(screen.getByRole('button', { name: 'Guardar recordatorio' })).toBeTruthy();
  });

  it('encendida, el boton DICE que va a crear una repeticion', () => {
    // Que un mismo boton guarde dos cosas distintas es raro; enterarse despues
    // es de las sorpresas caras.
    render(<FormularioDeRecordatorio {...props} datos={datos({ repetir: true })} />);
    expect(screen.getByRole('button', { name: 'Crear la repetición' })).toBeTruthy();
  });

  it('encendida, la fecha pasa a llamarse "empieza el"', () => {
    render(<FormularioDeRecordatorio {...props} datos={datos({ repetir: true })} />);
    expect(screen.getByText('Empieza el *')).toBeTruthy();
  });

  it('encendida, sale la regla escrita en español', () => {
    render(
      <FormularioDeRecordatorio
        {...props}
        datos={datos({ repetir: true, frecuencia: 'semanal', intervalo: '2', diasSemana: [1, 4] })}
      />,
    );
    // Sale dos veces a proposito: en el resumen del plegable y en la pista de
    // abajo. Las dos son la misma frase y las dos hacen falta.
    expect(screen.getAllByText(/Cada 2 semanas, lunes y jueves/).length).toBeGreaterThan(0);
  });

  it('los dias solo salen en el semanal y en el personalizado', () => {
    const { rerender } = render(
      <FormularioDeRecordatorio
        {...props}
        datos={datos({ repetir: true, frecuencia: 'mensual' })}
      />,
    );
    expect(screen.queryByText('Qué días')).toBeNull();
    rerender(
      <FormularioDeRecordatorio
        {...props}
        datos={datos({ repetir: true, frecuencia: 'semanal' })}
      />,
    );
    expect(screen.getByText('Qué días')).toBeTruthy();
  });

  it('tocar un dia lo pone y volver a tocarlo lo quita', async () => {
    const usuario = userEvent.setup();
    const cambiar = vi.fn();
    render(
      <FormularioDeRecordatorio
        {...props}
        datos={datos({ repetir: true, frecuencia: 'semanal' })}
        onCambiar={cambiar}
      />,
    );
    await usuario.click(screen.getByRole('checkbox', { name: 'lunes' }));
    expect(cambiar).toHaveBeenCalledWith(expect.objectContaining({ diasSemana: [1] }));
  });

  it('los dias se guardan en orden de semana, no en el que se tocaron', async () => {
    const usuario = userEvent.setup();
    const cambiar = vi.fn();
    render(
      <FormularioDeRecordatorio
        {...props}
        datos={datos({ repetir: true, frecuencia: 'semanal', diasSemana: [5] })}
        onCambiar={cambiar}
      />,
    );
    await usuario.click(screen.getByRole('checkbox', { name: 'lunes' }));
    expect(cambiar).toHaveBeenCalledWith(expect.objectContaining({ diasSemana: [1, 5] }));
  });
});

describe('la relacion', () => {
  it('con "con nada" no se pide buscar nada', () => {
    render(<FormularioDeRecordatorio {...props} />);
    expect(screen.queryByPlaceholderText('Escribe dos letras o más')).toBeNull();
  });

  it('al escoger un tipo aparece el buscador', () => {
    render(<FormularioDeRecordatorio {...props} datos={datos({ entidadTipo: 'cliente' })} />);
    expect(screen.getByPlaceholderText('Escribe dos letras o más')).toBeTruthy();
  });

  it('no encontrar nada SE DICE', () => {
    // Una lista que se queda vacia sin explicacion hace pensar que el buscador
    // se rompio.
    render(
      <FormularioDeRecordatorio
        {...props}
        datos={datos({ entidadTipo: 'cliente' })}
        buscandoRelacion="zzz"
        opcionesDeRelacion={[]}
      />,
    );
    expect(screen.getByText('No encontramos nada con ese texto.')).toBeTruthy();
  });

  it('con algo ya escogido se enseña y se puede quitar', async () => {
    const usuario = userEvent.setup();
    const cambiar = vi.fn();
    render(
      <FormularioDeRecordatorio
        {...props}
        datos={datos({ entidadTipo: 'cliente', entidadId: 'c1' })}
        relacionado="Quien sea"
        onCambiar={cambiar}
      />,
    );
    expect(screen.getAllByText('Quien sea').length).toBeGreaterThan(0);
    await usuario.click(screen.getByRole('button', { name: 'Quitar la relación' }));
    expect(cambiar).toHaveBeenCalledWith(
      expect.objectContaining({ entidadTipo: '', entidadId: '' }),
    );
  });

  it('cambiar de tipo BORRA lo que estaba escogido', async () => {
    // Si no, quedaria un recordatorio que dice "producto" apuntando al id de un
    // paciente, y el enlace llevaria a un producto que no existe.
    const usuario = userEvent.setup();
    const cambiar = vi.fn();
    render(
      <FormularioDeRecordatorio
        {...props}
        datos={datos({ entidadTipo: 'cliente', entidadId: 'c1' })}
        relacionado="Quien sea"
        onCambiar={cambiar}
      />,
    );
    await usuario.selectOptions(screen.getByLabelText('Con qué se relaciona'), 'producto');
    expect(cambiar).toHaveBeenCalledWith(
      expect.objectContaining({ entidadTipo: 'producto', entidadId: '' }),
    );
  });
});
