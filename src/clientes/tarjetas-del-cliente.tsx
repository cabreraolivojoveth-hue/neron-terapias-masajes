/**
 * LA COLUMNA DE APOYO DE UN EXPEDIENTE: proxima cita, estadisticas y acciones.
 *
 * POR QUE ESTAS TRES COSAS ESTAN AQUI Y NO DENTRO DE LA FICHA. Son lo que se
 * MIRA sin leer: cuando es la proxima cita, cuanto ha venido, cuanto ha
 * dejado, y los cuatro botones que se aprietan de verdad. Metidas dentro de la
 * ficha quedaban al final, debajo del historial, y habia que bajar para
 * apretar "Nueva cita" — que es la accion mas usada de la pantalla.
 *
 * NINGUNA CIFRA SE CALCULA AQUI. Todas vienen ya contadas del expediente, que
 * a su vez las cuenta en la base desde citas, ventas, pagos e inscripciones. Un
 * total sumado en el navegador se desincroniza del que enseña Reportes y a
 * partir de ahi hay dos numeros y nadie sabe cual creer.
 */

import { formatearDinero } from '../datos/moneda.js';
import type { ExpedienteDeCliente } from '../datos/clientes.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { fechaLarga } from '../ui/fechas-en-palabras.js';

export interface AccionDelPanel {
  readonly clave: string;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly capacidad: string | null;
  /** El tono de la accion. Solo la baja es de peligro. */
  readonly tono?: 'peligro';
}

/**
 * Los botones de la columna, en el orden del diseño.
 *
 * Lo que no se puede hacer NO SE PINTA — ni en gris. Un boton apagado promete
 * una accion que no existe y de paso le cuenta a quien no debe que existe.
 */
export const ACCIONES_DEL_PANEL: readonly AccionDelPanel[] = [
  { clave: 'cita', etiqueta: 'Nueva cita', icono: 'calendario', capacidad: 'gestionarAgenda' },
  { clave: 'venta', etiqueta: 'Nueva venta', icono: 'bolsa', capacidad: 'cobrar' },
  { clave: 'mensaje', etiqueta: 'Enviar mensaje', icono: 'mensaje', capacidad: null },
  { clave: 'recordatorio', etiqueta: 'Crear recordatorio', icono: 'reloj', capacidad: null },
  { clave: 'curso', etiqueta: 'Inscribir a curso', icono: 'birrete', capacidad: 'gestionarCatalogo' },
  {
    clave: 'archivar',
    etiqueta: 'Dar de baja',
    icono: 'archivar',
    capacidad: 'gestionarClientes',
    tono: 'peligro',
  },
];

export function accionesDelPanel(
  permisos: Readonly<Record<string, boolean>>,
  archivado: boolean,
): AccionDelPanel[] {
  return ACCIONES_DEL_PANEL.filter(
    (a) => a.capacidad === null || permisos[a.capacidad] === true,
  ).map((a) =>
    // Un expediente dado de baja no se da de baja otra vez: se reactiva. Y al
    // reactivar deja de ser una accion de peligro.
    a.clave === 'archivar' && archivado
      ? { clave: a.clave, etiqueta: 'Reactivar', icono: a.icono, capacidad: a.capacidad }
      : a,
  );
}

/** Un renglon de "esto se llama asi / esto vale esto". */
function Linea({ que, valor }: { readonly que: string; readonly valor: string }) {
  return (
    <div>
      <dt>{que}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

export interface PropiedadesDeLasTarjetas {
  readonly expediente: ExpedienteDeCliente;
  readonly permisos: Readonly<Record<string, boolean>>;
  onAccion(clave: string): void;
  onVerEnAgenda(): void;
}

export function TarjetasDelCliente({
  expediente: e,
  permisos,
  onAccion,
  onVerEnAgenda,
}: PropiedadesDeLasTarjetas) {
  const acciones = accionesDelPanel(permisos, e.archivado);
  const masUsado = e.servicios[0]?.nombre ?? null;

  return (
    <div className="pz-apoyo mv-escalonado">
      <section className="pz-tarjeta pz-tarjeta--apretada">
        <h4 className="tt-tarjeta">Próxima cita</h4>
        {e.proximaCita ? (
          <>
            <div className="cli-proxima">
              <span className="pz-ficha pz-ficha--citas" aria-hidden="true">
                <Icono nombre="flor" lado={18} />
              </span>
              <span className="pz-renglon__cuerpo">
                <span className="pz-renglon__titulo">{e.proximaCita.servicio}</span>
                <span className="pz-renglon__pie">{fechaLarga(e.proximaCita.fecha)}</span>
              </span>
            </div>
            <p className="tt-secundario">
              <Icono nombre="reloj" lado={14} /> {e.proximaCita.hora}
            </p>
            <button type="button" className="pz-boton pz-boton--ancho mv-levanta" onClick={onVerEnAgenda}>
              <Icono nombre="calendario" lado={16} /> Ver en agenda
            </button>
          </>
        ) : (
          /*
           * El vacio es una NOTA, no media pantalla. Con el aire grande, "no
           * tiene citas" dejaba un hueco de doscientos pixeles en la columna y
           * se leia como algo que todavia esta cargando.
           */
          <div className="pz-vacio pz-vacio--chico">
            <span className="pz-vacio__icono" aria-hidden="true">
              <Icono nombre="calendario" lado={22} />
            </span>
            <p className="pz-vacio__titulo">Sin cita agendada</p>
            {permisos['gestionarAgenda'] === true ? (
              <button type="button" className="pz-boton mv-levanta" onClick={() => onAccion('cita')}>
                <Icono nombre="mas" lado={15} /> Agendar
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section className="pz-tarjeta pz-tarjeta--apretada">
        <div className="pz-cabecera">
          <span className="pz-ficha pz-ficha--visitas" aria-hidden="true">
            <Icono nombre="barras" lado={16} />
          </span>
          <h4 className="tt-tarjeta">Estadísticas del cliente</h4>
        </div>
        <dl className="pz-totales">
          <Linea que="Citas realizadas" valor={String(e.visitas)} />
          <Linea que="Citas canceladas" valor={String(e.canceladas)} />
          <Linea que="No asistió" valor={String(e.noAsistio)} />
          {masUsado ? <Linea que="Servicio más usado" valor={masUsado} /> : null}
          {/* El dinero solo a quien puede verlo. Lo que de verdad protege es que
              la base no le entrega las ventas a quien no tiene "verFinanzas". */}
          {permisos['verFinanzas'] === true ? (
            <Linea que="Total invertido" valor={formatearDinero(e.totalGastado)} />
          ) : null}
          <Linea
            que="Última visita"
            valor={e.ultimaVisita ? fechaLarga(e.ultimaVisita.fecha) : 'Sin visitas'}
          />
        </dl>
      </section>

      {acciones.length > 0 ? (
        <section className="pz-tarjeta pz-tarjeta--apretada">
          <h4 className="tt-tarjeta">Acciones rápidas</h4>
          <div className="cli-acciones">
            {acciones.map((a) => (
              <button
                key={a.clave}
                type="button"
                className={`pz-boton pz-boton--ancho mv-levanta${
                  a.tono === 'peligro' ? ' pz-boton--peligro' : ''
                }`}
                onClick={() => onAccion(a.clave)}
              >
                <Icono nombre={a.icono} lado={16} /> {a.etiqueta}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
