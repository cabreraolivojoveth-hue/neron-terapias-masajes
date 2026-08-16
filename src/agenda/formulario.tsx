/**
 * El formulario de nueva cita y de reagendar.
 *
 * DOS COSAS QUE AQUI SE HACEN A PROPOSITO Y SUELEN SALIR MAL:
 *
 * 1. LOS CAMPOS NO SE RECREAN. Todos los componentes viven FUERA de la
 *    funcion que los pinta. Definir un componente dentro de otro hace que
 *    React lo trate como uno nuevo en cada render: destruye el campo, lo
 *    vuelve a crear, y el foco se pierde despues de cada letra. Es
 *    exactamente la queja de "escribo Ana y tengo que volver a hacer clic".
 *
 * 2. CREAR UN PACIENTE NO BORRA LO YA ESCRITO. El alta rapida guarda en la
 *    tabla de CLIENTES —la de verdad— y al volver deja seleccionado al
 *    paciente nuevo conservando servicio, fecha y hora.
 */

import { Boton, Campo, AreaDeTexto, Seleccion } from '@neron/base/ui';
import { Modal } from '../ui/modal.js';
import { sumarDias, type Fecha } from '@neron/base/utils';
import { useMemo, useState, type FormEvent } from 'react';
import type { ClienteBreve, ProfesionalBreve, ServicioBreve } from '../datos/citas.js';
import { comoHora, minutosDe } from './disposicion.js';

export interface ValoresDeCita {
  clienteId: string;
  servicioId: string;
  profesionalId: string;
  fecha: Fecha;
  horaInicio: string;
  notas: string;
}

export interface PropiedadesDelFormulario {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly inicial: ValoresDeCita;
  readonly clientes: readonly ClienteBreve[];
  readonly servicios: readonly ServicioBreve[];
  readonly profesionales: readonly ProfesionalBreve[];
  readonly trabajando: boolean;
  readonly error: string | null;
  /** Solo se puede mover fecha, hora y terapeuta. Es el modo reagendar. */
  readonly soloHorario?: boolean;
  onGuardar(valores: ValoresDeCita): void;
  onCrearCliente(datos: { nombre: string; telefono: string; correo: string }): Promise<ClienteBreve | null>;
  onCerrar(): void;
}

export function FormularioDeCita({
  abierto,
  titulo,
  inicial,
  clientes,
  servicios,
  profesionales,
  trabajando,
  error,
  soloHorario = false,
  onGuardar,
  onCrearCliente,
  onCerrar,
}: PropiedadesDelFormulario) {
  const [v, setV] = useState<ValoresDeCita>(inicial);
  const [buscado, setBuscado] = useState('');
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: '', telefono: '', correo: '' });
  const [faltan, setFaltan] = useState<string[]>([]);

  // Al abrir con otros valores —otra cita, otro hueco— el formulario se
  // rellena de nuevo. La llave del Modal fuerza el remontaje limpio.
  const poner = <K extends keyof ValoresDeCita>(k: K, valor: ValoresDeCita[K]): void =>
    setV((a) => ({ ...a, [k]: valor }));

  const servicio = servicios.find((s) => s.id === v.servicioId) ?? null;

  /**
   * Un servicio APAGADO no se ofrece para citas nuevas, pero si sigue
   * escogido en una cita vieja se deja ver: si desapareciera de la lista, al
   * editar esa cita el campo saldria vacio y guardaria mal.
   */
  const serviciosVisibles = useMemo(
    () => servicios.filter((s) => s.activo || s.id === v.servicioId),
    [servicios, v.servicioId],
  );

  const encontrados = useMemo(() => {
    const aguja = buscado.trim().toLowerCase();
    if (!aguja) return clientes.slice(0, 30);
    return clientes
      .filter((c) =>
        [c.nombre, c.telefono ?? '', c.correo ?? '']
          .join(' ')
          .toLowerCase()
          .includes(aguja),
      )
      .slice(0, 30);
  }, [clientes, buscado]);

  const horaFin = useMemo(() => {
    const inicioMin = minutosDe(v.horaInicio);
    if (inicioMin === null) return null;
    return comoHora(inicioMin + (servicio?.duracionMin ?? 60));
  }, [v.horaInicio, servicio]);

  function enviar(e: FormEvent): void {
    e.preventDefault();
    const faltantes: string[] = [];
    if (!v.clienteId) faltantes.push('el paciente');
    if (!v.servicioId) faltantes.push('el servicio');
    if (!v.fecha) faltantes.push('la fecha');
    if (minutosDe(v.horaInicio) === null) faltantes.push('la hora');
    setFaltan(faltantes);
    // Se dice CUALES faltan, por su nombre. Pintarlos de rojo no sirve si el
    // que falla quedo tres campos mas arriba y no se ve.
    if (faltantes.length > 0) return;
    onGuardar(v);
  }

  async function guardarNuevoCliente(): Promise<void> {
    if (!nuevo.nombre.trim()) return;
    const creado = await onCrearCliente(nuevo);
    if (!creado) return;
    // Se selecciona el paciente nuevo Y SE CONSERVA todo lo demas.
    poner('clienteId', creado.id);
    setBuscado(creado.nombre);
    setAltaAbierta(false);
    setNuevo({ nombre: '', telefono: '', correo: '' });
  }

  if (!abierto) return null;

  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCerrar}>
      <form className="agenda-form" onSubmit={enviar} noValidate>
        {!soloHorario ? (
          <>
            <div className="agenda-form__paciente">
              <Campo
                etiqueta="Paciente"
                value={buscado}
                onChange={(e) => setBuscado(e.target.value)}
                placeholder="Busca por nombre, teléfono o correo"
                ayuda={
                  v.clienteId
                    ? `Seleccionado: ${clientes.find((c) => c.id === v.clienteId)?.nombre ?? ''}`
                    : 'Escribe para buscar entre tus pacientes'
                }
                obligatorio
              />
              {clientes.length === 0 ? (
                <p className="agenda-form__vacio">
                  Todavía no tienes pacientes registrados. Da de alta al primero aquí abajo.
                </p>
              ) : null}
              <ul className="agenda-form__resultados">
                {encontrados.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`agenda-form__resultado${c.id === v.clienteId ? ' agenda-form__resultado--puesto' : ''}`}
                      aria-pressed={c.id === v.clienteId}
                      onClick={() => { poner('clienteId', c.id); setBuscado(c.nombre); }}
                    >
                      <span className="agenda-form__resultado-nombre">{c.nombre}</span>
                      {c.telefono ? <span className="agenda-form__resultado-dato">{c.telefono}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
              <Boton tono="contorno" type="button" onClick={() => setAltaAbierta(true)}>
                + Nuevo paciente
              </Boton>
            </div>

            <Seleccion
              etiqueta="Servicio"
              value={v.servicioId}
              onChange={(e) => poner('servicioId', e.target.value)}
              obligatorio
              opciones={[
                { valor: '', texto: 'Escoge un servicio' },
                ...serviciosVisibles.map((s) => ({
                  valor: s.id,
                  texto: `${s.nombre} · ${s.duracionMin} min${s.activo ? '' : ' (apagado)'}`,
                })),
              ]}
            />
            {servicios.length === 0 ? (
              <p className="agenda-form__vacio">
                No hay servicios en el catálogo todavía. El módulo Servicios llega en el bloque 3.
              </p>
            ) : null}
          </>
        ) : null}

        <Seleccion
          etiqueta="Terapeuta"
          value={v.profesionalId}
          onChange={(e) => poner('profesionalId', e.target.value)}
          ayuda="Si no la asignas, el horario se reserva para el centro entero."
          opciones={[
            { valor: '', texto: 'Sin asignar' },
            ...profesionales.map((p) => ({ valor: p.id, texto: p.nombre })),
          ]}
        />

        <div className="agenda-form__par">
          <Campo
            etiqueta="Fecha"
            type="date"
            value={aInput(v.fecha)}
            onChange={(e) => poner('fecha', deInput(e.target.value))}
            obligatorio
          />
          <Campo
            etiqueta="Hora de inicio"
            type="time"
            value={v.horaInicio}
            onChange={(e) => poner('horaInicio', e.target.value)}
            obligatorio
            ayuda={
              horaFin
                ? `Termina a las ${horaFin} — la duración la pone el servicio`
                : undefined
            }
          />
        </div>

        {!soloHorario ? (
          <AreaDeTexto
            etiqueta="Notas"
            value={v.notas}
            onChange={(e) => poner('notas', e.target.value)}
            rows={3}
            maxLength={2000}
            ayuda="Lo que necesites recordar de esta sesión."
          />
        ) : null}

        {faltan.length > 0 ? (
          <p className="agenda-form__error" role="alert">
            Falta {faltan.join(', ')}.
          </p>
        ) : null}
        {error ? (
          <p className="agenda-form__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="agenda-form__pie">
          <Boton tono="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton tono="principal" type="submit" trabajando={trabajando}>
            Guardar
          </Boton>
        </div>
      </form>

      {/* El alta rápida va en su propio modal ENCIMA, para que el formulario
          de la cita siga vivo detrás y no se pierda nada de lo escrito. */}
      {altaAbierta ? (
        <Modal abierto titulo="Nuevo paciente" onCerrar={() => setAltaAbierta(false)}>
          <div className="agenda-form">
            <Campo
              etiqueta="Nombre"
              value={nuevo.nombre}
              onChange={(e) => setNuevo((a) => ({ ...a, nombre: e.target.value }))}
              obligatorio
            />
            <Campo
              etiqueta="Teléfono"
              type="tel"
              value={nuevo.telefono}
              onChange={(e) => setNuevo((a) => ({ ...a, telefono: e.target.value }))}
            />
            <Campo
              etiqueta="Correo"
              type="email"
              value={nuevo.correo}
              onChange={(e) => setNuevo((a) => ({ ...a, correo: e.target.value }))}
            />
            <div className="agenda-form__pie">
              <Boton tono="contorno" type="button" onClick={() => setAltaAbierta(false)}>
                Cancelar
              </Boton>
              <Boton
                tono="principal"
                type="button"
                disabled={!nuevo.nombre.trim()}
                onClick={() => void guardarNuevoCliente()}
              >
                Guardar y usar
              </Boton>
            </div>
          </div>
        </Modal>
      ) : null}
    </Modal>
  );
}

/** `dd/mm/aaaa` → `aaaa-mm-dd`, que es lo que quiere un campo de fecha. */
function aInput(f: Fecha): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function deInput(v: string): Fecha {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  // Una fecha vacía no se convierte en "hoy" a escondidas: se deja vacía para
  // que la validación la reclame por su nombre.
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Un dia despues, para el valor por omision de reagendar. */
export const manana = (f: Fecha): Fecha => sumarDias(f, 1);
