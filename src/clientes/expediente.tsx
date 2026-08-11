/**
 * EL EXPEDIENTE DE UNA PERSONA.
 *
 * ES LO QUE CLIENTES UNE, NO LO QUE CLIENTES GUARDA. Las visitas vienen de
 * Agenda, las compras y el adeudo de Ventas y Pagos, los cursos de
 * Inscripciones, los servicios recibidos de las citas completadas. La tabla
 * `cliente` solo guarda quien es y como contactarlo.
 *
 * Va en un MODAL del sistema de diseño y no en una pantalla aparte: quien
 * revisa expedientes abre cinco seguidos, y volver atras cinco veces cansa. Y
 * de paso hereda un overlay que ya funciona, en vez de estrenar uno que puede
 * quedarse debajo de otra capa.
 *
 * LO QUE NO SE PUEDE HACER NO SE MUESTRA. Los botones se filtran por permiso
 * real; ademas, lo que de verdad se puede escribir lo decide la base.
 */

import { Modal } from '@neron/base/ui';
import { formatearMoneda } from '@neron/base/utils';
import type { ReactNode } from 'react';
import { etiquetaDeEstadoDeCliente, type ExpedienteDeCliente } from '../datos/clientes.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { fechaLarga } from '../ui/fechas-en-palabras.js';

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
    <div className="pz-renglon pz-renglon--quieto">
      <span className="pz-ficha" aria-hidden="true">
        <Icono nombre={icono} lado={18} />
      </span>
      <div className="pz-dato">
        <span className="tt-etiqueta">{titulo}</span>
        <div className="pz-dato__valor">{children}</div>
      </div>
    </div>
  );
}

function Cuenta({ n, que }: { readonly n: number; readonly que: string }) {
  return (
    <span className="pz-dato">
      <span className="tt-dato">{n}</span>
      <span className="tt-pie">{que}</span>
    </span>
  );
}

export interface PropiedadesDelExpediente {
  readonly abierto: boolean;
  readonly expediente: ExpedienteDeCliente | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  onAccion(clave: string): void;
  onCerrar(): void;
}

export function Expediente({
  abierto,
  expediente,
  cargando,
  error,
  permisos,
  onAccion,
  onCerrar,
}: PropiedadesDelExpediente) {
  if (!abierto) return null;

  const puede = (c: string): boolean => permisos[c] === true;
  const e = expediente;

  return (
    <Modal abierto={abierto} titulo={e?.nombre ?? 'Expediente'} onCerrar={onCerrar} ancho>
      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar el expediente.</p>
          <p className="pz-error__detalle">{error}</p>
        </div>
      ) : cargando || !e ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el expediente</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : (
        <div className="pz-columna">
          <div className="pz-cabecera">
            <span
              className={`pz-pastilla pz-pastilla--${e.archivado ? 'archivado' : 'activo'}`}
            >
              {e.archivado ? etiquetaDeEstadoDeCliente('archivado') : 'En el directorio'}
            </span>
          </div>

          <Renglon icono="persona" titulo="Contacto">
            {e.telefono ? (
              <a className="pz-renglon__enlace" href={`tel:${e.telefono}`}>
                {e.telefono}
              </a>
            ) : (
              <span className="tt-falta">Sin teléfono registrado</span>
            )}
            {e.correo ? (
              <div>
                <a className="pz-renglon__enlace" href={`mailto:${e.correo}`}>
                  {e.correo}
                </a>
              </div>
            ) : null}
          </Renglon>

          {e.fechaNacimiento ? (
            <Renglon icono="pastel" titulo="Fecha de nacimiento">
              {fechaLarga(e.fechaNacimiento)}
            </Renglon>
          ) : null}

          <Renglon icono="calendario" titulo="Cliente desde">
            {e.clienteDesde ? fechaLarga(e.clienteDesde) : <span className="tt-falta">—</span>}
          </Renglon>

          <Renglon icono="persona" titulo="Terapeuta asignado">
            {e.profesional ?? <span className="tt-falta">Sin asignar</span>}
          </Renglon>

          {/*
            Las tres cuentas juntas, y las tres desde Agenda. "No asistió" va
            aparte de "cancelada" porque para el negocio no son lo mismo: una
            se reagenda, la otra ya costó.
          */}
          <Renglon icono="barras" titulo="Historial de citas">
            <div className="pz-tres">
              <Cuenta n={e.visitas} que={e.visitas === 1 ? 'visita' : 'visitas'} />
              <Cuenta n={e.canceladas} que="canceladas" />
              <Cuenta n={e.noAsistio} que="no asistió" />
            </div>
            {e.ultimaVisita ? (
              <div className="tt-secundario">
                Última visita: {e.ultimaVisita.fecha} – {e.ultimaVisita.servicio}
              </div>
            ) : (
              <div className="tt-secundario">Todavía no ha tenido una sesión completada.</div>
            )}
          </Renglon>

          {e.proximaCita ? (
            <Renglon icono="reloj" titulo="Próxima cita">
              {e.proximaCita.fecha} · {e.proximaCita.hora}
              <div className="tt-secundario">{e.proximaCita.servicio}</div>
            </Renglon>
          ) : null}

          {e.servicios.length > 0 ? (
            <Renglon icono="bolsa" titulo="Servicios recibidos">
              <ul className="pz-columna__servicios">
                {e.servicios.map((s) => (
                  <li key={s.nombre}>
                    {s.nombre} <span className="tt-secundario">× {s.veces}</span>
                  </li>
                ))}
              </ul>
            </Renglon>
          ) : null}

          {/*
            El dinero solo se le enseña a quien puede verlo. Esconderlo aqui es
            cortesia; lo que de verdad protege es que la base no le entrega las
            ventas a quien no tiene `verFinanzas`.
          */}
          {puede('verFinanzas') ? (
            <Renglon icono="recibo" titulo="Compras y adeudo">
              <div className="pz-tres">
                <Cuenta n={e.compras} que={e.compras === 1 ? 'compra' : 'compras'} />
                <Cuenta n={e.cursos} que={e.cursos === 1 ? 'curso' : 'cursos'} />
              </div>
              <div className="tt-secundario">
                Total gastado: {formatearMoneda(e.totalGastado)}
              </div>
              <div
                className={e.adeudo > 0 ? 'pz-columna__adeudo' : 'tt-secundario'}
              >
                {e.adeudo > 0 ? `Adeudo: ${formatearMoneda(e.adeudo)}` : 'Sin adeudos'}
              </div>
            </Renglon>
          ) : null}

          {e.notas ? (
            <Renglon icono="nota" titulo="Notas">
              {/* Como TEXTO, nunca como HTML: una nota es lo que alguien
                  escribio, y si se interpretara podria romper la pantalla. */}
              <span className="tt-libre">{e.notas}</span>
            </Renglon>
          ) : null}

          <div className="pz-encabezado__acciones">
            {puede('gestionarClientes') ? (
              <button type="button" className="pz-boton pz-boton--principal" onClick={() => onAccion('editar')}>
                <Icono nombre="lapiz" lado={16} /> Editar
              </button>
            ) : null}
            {puede('gestionarAgenda') ? (
              <button type="button" className="pz-boton" onClick={() => onAccion('cita')}>
                <Icono nombre="calendario" lado={16} /> Nueva cita
              </button>
            ) : null}
            {puede('cobrar') ? (
              <button type="button" className="pz-boton" onClick={() => onAccion('venta')}>
                <Icono nombre="bolsa" lado={16} /> Registrar venta
              </button>
            ) : null}
            <button type="button" className="pz-boton" onClick={() => onAccion('mensaje')}>
              <Icono nombre="mensaje" lado={16} /> Enviar mensaje
            </button>
            <button
              type="button"
              className="pz-boton"
              onClick={() => onAccion('recordatorio')}
            >
              <Icono nombre="reloj" lado={16} /> Crear recordatorio
            </button>
            {puede('gestionarCatalogo') ? (
              <button type="button" className="pz-boton" onClick={() => onAccion('curso')}>
                <Icono nombre="birrete" lado={16} /> Inscribir a curso
              </button>
            ) : null}
            {puede('gestionarClientes') ? (
              <button type="button" className="pz-boton" onClick={() => onAccion('archivar')}>
                <Icono nombre="archivar" lado={16} /> {e.archivado ? 'Reactivar' : 'Archivar'}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
