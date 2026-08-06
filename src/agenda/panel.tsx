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
 *
 * LA SALA NO APARECE, y es a proposito. El diseño muestra "Sala 1 – Paz y
 * Luz"; en la base no hay tabla de salas ni columna que las guarde. Escribir
 * ese renglon con un texto fijo seria exactamente lo que este producto no
 * hace, y dejarlo vacio solo haria preguntarse que se rompio. Cuando existan
 * salas de verdad —con su tabla, sus reglas de acceso y su validacion de que
 * dos citas no ocupen la misma— el renglon entra aqui con datos reales.
 */

import { Boton } from '@neron/base/ui';
import { formatearMoneda } from '@neron/base/utils';
import type { ReactNode } from 'react';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { duracionEnPalabras, fechaLarga } from '../ui/fechas-en-palabras.js';
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
  /** Abre Mensajes con ESTE paciente y ESTA cita como contexto. */
  onEnviarMensaje(): void;
  /** Abre CURSOS con el curso de esta sesion. Solo aplica a las sesiones. */
  onVerCurso(): void;
  onCerrar(): void;
}

function Renglon({
  icono,
  titulo,
  children,
}: {
  readonly icono: NombreDeIcono;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="agenda-panel__renglon">
      <span className="agenda-panel__renglon-icono" aria-hidden="true">
        <Icono nombre={icono} lado={18} />
      </span>
      <div className="agenda-panel__renglon-cuerpo">
        <span className="agenda-panel__etiqueta">{titulo}</span>
        <div className="agenda-panel__valor">{children}</div>
      </div>
    </div>
  );
}

/**
 * Las iniciales, cuando no hay foto.
 *
 * NO HAY FOTOS DE PACIENTES en el sistema: la tabla `cliente` no guarda
 * ninguna. El diseño muestra retratos porque es un diseño; poner caras de
 * archivo seria inventar personas.
 */
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
  onEnviarMensaje,
  onVerCurso,
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
   * UNA SESION DE CURSO NO ES UNA CITA, y no se administra desde aqui.
   *
   * No tiene un paciente ni un servicio: tiene un grupo y un curso. Ofrecerle
   * "Confirmar" o "Reagendar" haria algo raro con el curso —o nada—, y las dos
   * cosas son peores que mandar a donde de verdad se administra.
   */
  if (cita.tipo === 'sesion') {
    return (
      <aside className="agenda-panel" aria-label="Sesión de curso seleccionada">
        <div className="agenda-panel__barra">
          <span className="agenda-panel__titulo">Sesión de curso</span>
          <span className="agenda-panel__estado agenda-estado--curso">Curso</span>
          <button
            type="button"
            className="agenda-panel__cerrar"
            onClick={onCerrar}
            aria-label="Cerrar el panel"
          >
            ×
          </button>
        </div>

        <div className="agenda-panel__cuerpo">
          <Renglon icono="birrete" titulo="Curso">
            {cita.servicio}
          </Renglon>
          <Renglon icono="reloj" titulo="Horario">
            {cita.horaInicio} – {cita.horaFin}
            <span className="agenda-panel__secundario">
              {' '}
              · {duracionEnPalabras(cita.servicioMinutos)}
            </span>
          </Renglon>
          <Renglon icono="calendario" titulo="Día">
            {fechaLarga(cita.fecha)}
          </Renglon>
          <Renglon icono="personas" titulo="Alumnos">
            {cita.cliente}
          </Renglon>
          <Renglon icono="persona" titulo="Instructor">
            {cita.profesional ?? 'Sin asignar'}
          </Renglon>
        </div>

        <div className="agenda-panel__acciones">
          <Boton tono="principal" onClick={onVerCurso}>
            Ver el curso
          </Boton>
        </div>
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
        <span className={`agenda-panel__estado agenda-estado--${cita.estado}`}>
          {etiquetaDeEstado(cita.estado)}
        </span>
        <button
          type="button"
          className="agenda-panel__cerrar"
          onClick={onCerrar}
          aria-label="Cerrar el detalle"
        >
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

      <Renglon icono="calendario" titulo={fechaLarga(cita.fecha)}>
        {cita.horaInicio} – {cita.horaFin}
        {cita.servicioMinutos > 0 ? ` (${duracionEnPalabras(cita.servicioMinutos)})` : ''}
      </Renglon>

      <Renglon icono="bolsa" titulo="Servicio">
        {cita.servicio}
        {cita.servicioPrecio > 0 ? (
          <span className="agenda-panel__secundario"> · {formatearMoneda(cita.servicioPrecio)}</span>
        ) : null}
      </Renglon>

      <Renglon icono="persona" titulo="Terapeuta">
        {cita.profesional ?? (
          <span className="agenda-panel__falta">Sin asignar</span>
        )}
      </Renglon>

      <Renglon icono="reloj" titulo="Estado">
        <span className={`agenda-panel__estado-texto agenda-estado-texto--${cita.estado}`}>
          {etiquetaDeEstado(cita.estado)}
        </span>
      </Renglon>

      {cita.notas ? (
        <Renglon icono="nota" titulo="Notas">
          {/* Se pinta como TEXTO, nunca como HTML: una nota es lo que alguien
              escribio, y si se interpretara, una nota con etiquetas podria
              romper la pantalla o algo peor. */}
          <span className="agenda-panel__notas">{cita.notas}</span>
        </Renglon>
      ) : null}

      <Renglon icono="barras" titulo="Historial del cliente">
        {cargandoHistorial ? (
          // Mientras carga NO se muestra un cero: "0 sesiones" es una
          // respuesta real y equivocada sobre un paciente que lleva años.
          <span className="agenda-panel__falta">Cargando…</span>
        ) : historial ? (
          <>
            <div>
              Total de citas: {historial.completadas}
            </div>
            {historial.canceladas > 0 || historial.noAsistio > 0 ? (
              <div className="agenda-panel__secundario">
                {historial.canceladas} canceladas · {historial.noAsistio} no asistió
              </div>
            ) : null}
            {historial.ultima ? (
              <div className="agenda-panel__secundario">
                Última cita: {historial.ultima.fecha} – {historial.ultima.servicio}
              </div>
            ) : null}
          </>
        ) : (
          <span className="agenda-panel__falta">No se pudo cargar el historial.</span>
        )}
      </Renglon>

      {historial?.proxima && historial.proxima.id !== cita.id ? (
        <Renglon icono="calendario" titulo="Próxima cita">
          {historial.proxima.fecha} · {historial.proxima.hora}
          <div className="agenda-panel__secundario">{historial.proxima.servicio}</div>
        </Renglon>
      ) : null}

      {puedeGestionar ? (
        <>
          {/*
            Las cuatro del diseño, en cuadricula. "Enviar mensaje" no manda
            nada desde aqui: abre Mensajes con el paciente y la cita como
            contexto. Agenda no es Mensajes.
          */}
          <div className="agenda-panel__acciones">
            {viva ? (
              <Boton tono="principal" onClick={onEditar}>
                <Icono nombre="lapiz" lado={16} /> Editar cita
              </Boton>
            ) : null}
            {viva ? (
              <Boton tono="contorno" onClick={onReagendar}>
                <Icono nombre="volver" lado={16} /> Reagendar
              </Boton>
            ) : null}
            {!terminada ? (
              <Boton tono="peligro" onClick={() => onCambiarEstado('cancelada')}>
                <Icono nombre="prohibido" lado={16} /> Cancelar cita
              </Boton>
            ) : null}
            <Boton tono="contorno" onClick={onEnviarMensaje}>
              <Icono nombre="mensaje" lado={16} /> Enviar mensaje
            </Boton>
          </div>

          {/*
            Los cambios de estado van aparte y debajo: son los que dejan huella
            en el historial y en los reportes, y mezclarlos con "Editar" hace
            que se aprieten sin pensar.
          */}
          {viva ? (
            <div className="agenda-panel__estados">
              {cita.estado === 'pendiente' ? (
                <button
                  type="button"
                  className="agenda-panel__cambio"
                  onClick={() => onCambiarEstado('confirmada')}
                >
                  <Icono nombre="palomita" lado={15} /> Confirmar
                </button>
              ) : null}
              <button
                type="button"
                className="agenda-panel__cambio"
                onClick={() => onCambiarEstado('completada')}
              >
                <Icono nombre="palomita" lado={15} /> Marcar completada
              </button>
              <button
                type="button"
                className="agenda-panel__cambio"
                onClick={() => onCambiarEstado('no_asistio')}
              >
                <Icono nombre="alerta" lado={15} /> No asistió
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
