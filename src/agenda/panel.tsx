/**
 * El panel de la cita seleccionada.
 *
 * TODO lo que muestra viene de la base y se resuelve al leer. El telefono es
 * el de la ficha del paciente, no una copia guardada dentro de la cita: si se
 * corrige el telefono en Clientes, aqui aparece corregido sin tocar nada.
 *
 * El historial y la proxima cita se CALCULAN. "Total de citas: 8" no existe
 * guardado en ningun lado — un contador a mano se desincroniza a la primera
 * cancelacion y despues nadie sabe cual de los dos numeros es el bueno.
 */

import { Boton } from '@neron/base/ui';
import { formatearMoneda } from '@neron/base/utils';
import type { CitaEnAgenda, EstadoDeCita, Historial } from '../datos/citas.js';
import { etiquetaDeEstado } from '../datos/citas.js';

export interface PropiedadesDelPanel {
  readonly cita: CitaEnAgenda | null;
  readonly historial: Historial | null;
  readonly cargandoHistorial: boolean;
  readonly puedeGestionar: boolean;
  onEditar(): void;
  onReagendar(): void;
  onCambiarEstado(estado: EstadoDeCita): void;
  onCerrar(): void;
}

function Dato({ titulo, children }: { readonly titulo: string; readonly children: React.ReactNode }) {
  return (
    <div className="agenda-panel__dato">
      <span className="agenda-panel__etiqueta">{titulo}</span>
      <div className="agenda-panel__valor">{children}</div>
    </div>
  );
}

/** Las iniciales, cuando no hay foto. Nunca una foto de ejemplo. */
function Inicial({ nombre }: { readonly nombre: string }) {
  const letras = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className="agenda-panel__inicial" aria-hidden="true">
      {letras || '—'}
    </span>
  );
}

export function PanelDeCita({
  cita,
  historial,
  cargandoHistorial,
  puedeGestionar,
  onEditar,
  onReagendar,
  onCambiarEstado,
  onCerrar,
}: PropiedadesDelPanel) {
  if (!cita) {
    return (
      <aside className="agenda-panel agenda-panel--vacio">
        <p className="agenda-panel__pista">
          Toca una cita para ver los datos del paciente, su historial y las acciones.
        </p>
      </aside>
    );
  }

  /**
   * LAS ACCIONES DEPENDEN DEL ESTADO.
   *
   * Ofrecer "Cancelar" en una cita ya cancelada, o "Reagendar" en una que ya
   * se dio, produce errores que la base rechaza — y un error que se pudo
   * evitar apagando un boton es un error que no debio llegar a la base.
   */
  const viva = cita.estado === 'pendiente' || cita.estado === 'confirmada';
  const terminada = cita.estado === 'completada' || cita.estado === 'cancelada';

  return (
    <aside className="agenda-panel" aria-label="Cita seleccionada">
      <div className="agenda-panel__barra">
        <span className="agenda-panel__titulo">Cita seleccionada</span>
        <span className={`agenda-panel__estado agenda-cita--${cita.estado}`}>
          {etiquetaDeEstado(cita.estado)}
        </span>
        <button type="button" className="agenda-panel__cerrar" onClick={onCerrar} aria-label="Cerrar el detalle">
          ×
        </button>
      </div>

      <div className="agenda-panel__persona">
        <Inicial nombre={cita.cliente} />
        <div className="agenda-panel__contacto">
          <span className="agenda-panel__nombre">{cita.cliente}</span>
          {/* Teléfono y correo tal como estén HOY en la ficha del paciente. */}
          {cita.clienteTelefono ? (
            <a className="agenda-panel__enlace" href={`tel:${cita.clienteTelefono}`}>
              {cita.clienteTelefono}
            </a>
          ) : (
            <span className="agenda-panel__falta">Sin teléfono registrado</span>
          )}
          {cita.clienteCorreo ? (
            <a className="agenda-panel__enlace" href={`mailto:${cita.clienteCorreo}`}>
              {cita.clienteCorreo}
            </a>
          ) : null}
        </div>
      </div>

      <Dato titulo="Cuándo">
        {cita.fecha} · {cita.horaInicio} a {cita.horaFin} ({cita.servicioMinutos} min)
      </Dato>

      <Dato titulo="Servicio">
        {cita.servicio}
        {cita.servicioPrecio > 0 ? (
          <span className="agenda-panel__secundario"> · {formatearMoneda(cita.servicioPrecio)}</span>
        ) : null}
      </Dato>

      <Dato titulo="Terapeuta">
        {cita.profesional ?? <span className="agenda-panel__falta">Sin asignar</span>}
      </Dato>

      {cita.notas ? <Dato titulo="Notas">{cita.notas}</Dato> : null}

      <Dato titulo="Historial del paciente">
        {cargandoHistorial ? (
          // Mientras carga NO se muestra un cero: "0 sesiones" es una
          // respuesta real y equivocada sobre un paciente que lleva años.
          <span className="agenda-panel__falta">Cargando…</span>
        ) : historial ? (
          <>
            <div>
              {historial.completadas} {historial.completadas === 1 ? 'sesión' : 'sesiones'} completadas
            </div>
            {historial.canceladas > 0 || historial.noAsistio > 0 ? (
              <div className="agenda-panel__secundario">
                {historial.canceladas} canceladas · {historial.noAsistio} no asistió
              </div>
            ) : null}
            {historial.ultima ? (
              <div className="agenda-panel__secundario">
                Última: {historial.ultima.fecha} · {historial.ultima.servicio}
              </div>
            ) : null}
          </>
        ) : (
          <span className="agenda-panel__falta">No se pudo cargar el historial.</span>
        )}
      </Dato>

      {historial?.proxima && historial.proxima.id !== cita.id ? (
        <Dato titulo="Próxima cita">
          {historial.proxima.fecha} · {historial.proxima.hora} · {historial.proxima.servicio}
        </Dato>
      ) : null}

      {puedeGestionar ? (
        <div className="agenda-panel__acciones">
          {cita.estado === 'pendiente' ? (
            <Boton tono="principal" onClick={() => onCambiarEstado('confirmada')}>
              Confirmar
            </Boton>
          ) : null}
          {viva ? <Boton tono="contorno" onClick={onEditar}>Editar</Boton> : null}
          {viva ? <Boton tono="contorno" onClick={onReagendar}>Reagendar</Boton> : null}
          {viva ? (
            <Boton tono="contorno" onClick={() => onCambiarEstado('completada')}>
              Marcar completada
            </Boton>
          ) : null}
          {viva ? (
            <Boton tono="contorno" onClick={() => onCambiarEstado('no_asistio')}>
              No asistió
            </Boton>
          ) : null}
          {!terminada ? (
            <Boton tono="peligro" onClick={() => onCambiarEstado('cancelada')}>
              Cancelar cita
            </Boton>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
