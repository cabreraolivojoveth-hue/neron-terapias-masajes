/**
 * LA CAMPANA DE AVISOS.
 *
 * NO HAY UNA TABLA DE NOTIFICACIONES, Y NO HACE FALTA UNA. Cada aviso se
 * DEDUCE de una cifra real que ya vive en su modulo: productos por debajo de
 * su umbral, recordatorios vencidos, citas de hoy sin confirmar. Nada de esto
 * se guarda ni se marca como leido en ningun lado.
 *
 * Esa es la decision de fondo y merece explicarse, porque la alternativa se ve
 * mas completa: una tabla `notificacion` con su bandera de "leido" obliga a
 * escribir una fila cada vez que un producto baja del umbral, otra cuando
 * vuelve a subir, y a limpiarlas cuando el recordatorio se atiende. En cuanto
 * una de esas escrituras falla —o alguien cambia el stock por otro camino— la
 * campana avisa de algo que ya se resolvio. Un aviso falso enseña a ignorar la
 * campana, y una campana que se ignora no sirve para nada.
 *
 * Deducirlo de la cifra actual no puede desincronizarse: si el producto ya se
 * resurtio, el aviso desaparece solo.
 *
 * SI NO HAY NADA, NO SE INVENTA NADA. La campana se queda sin punto y el panel
 * lo dice.
 *
 * VIVE EN LA BARRA SUPERIOR, no dentro de Inicio: los avisos son de todo el
 * sistema y se ven igual desde Agenda o desde Ventas. Comparte la MISMA
 * consulta que el tablero —la misma llave de cache— asi que estar en Inicio
 * con la campana puesta sigue siendo un solo viaje al servidor.
 */

import { hoy as hoyDe } from '@neron/base/utils';
import { useEffect, useId, useRef, useState } from 'react';
import { useConsulta } from '../datos/consulta.js';
import { llaveDelResumen, traerResumen, type ResumenDeInicio } from '../datos/tablero.js';
import { useSesion } from '../identidad/sesion.js';
import { Icono, type NombreDeIcono } from '../inicio/iconos.js';

export interface Aviso {
  readonly clave: string;
  readonly texto: string;
  readonly detalle: string;
  readonly icono: NombreDeIcono;
  readonly modulo: string;
  readonly parametros?: Readonly<Record<string, string>>;
}

/**
 * Los avisos que le tocan a ESTA persona.
 *
 * Se filtran por permiso igual que el menu: no tiene sentido avisarle del
 * inventario a quien no puede abrir Productos — solo seria una frustracion con
 * campanita.
 */
export function avisosDelResumen(
  resumen: ResumenDeInicio | null,
  permisos: Readonly<Record<string, boolean>>,
  hoy: string,
): Aviso[] {
  if (!resumen) return [];
  const puede = (c: string): boolean => permisos[c] === true;
  const avisos: Aviso[] = [];

  if (puede('gestionarAgenda') && resumen.citasPendientes > 0) {
    const n = resumen.citasPendientes;
    avisos.push({
      clave: 'citas',
      texto: `${n} ${n === 1 ? 'cita' : 'citas'} de hoy sin confirmar`,
      detalle: 'Confírmalas antes de que llegue la hora',
      icono: 'calendario',
      modulo: 'agenda',
      parametros: { fecha: hoy, estado: 'pendiente' },
    });
  }

  if (puede('gestionarInventario') && resumen.productosBajos > 0) {
    const n = resumen.productosBajos;
    avisos.push({
      clave: 'productos',
      texto: `${n} ${n === 1 ? 'producto está' : 'productos están'} por acabarse`,
      detalle: 'Llegaron a su mínimo de existencia',
      icono: 'paquete',
      modulo: 'productos',
      parametros: { existencia: 'baja' },
    });
  }

  if (resumen.recordatoriosPendientes > 0) {
    const n = resumen.recordatoriosPendientes;
    avisos.push({
      clave: 'recordatorios',
      texto: `${n} ${n === 1 ? 'recordatorio' : 'recordatorios'} para hoy o antes`,
      detalle: 'Pendientes que ya vencieron o vencen hoy',
      icono: 'reloj',
      modulo: 'recordatorios',
    });
  }

  return avisos;
}

/**
 * La campana enchufada a los datos, que es lo que usa el marco.
 *
 * La parte de abajo —`Notificaciones`— no sabe pedir nada: recibe el resumen y
 * pinta. Asi se puede probar el panel entero sin levantar una base de datos, y
 * este envoltorio se queda con lo unico que necesita saber de la nube: que la
 * llave es LA MISMA que usa Inicio, para que tener la campana puesta no cueste
 * un viaje mas al servidor.
 */
export function CampanaDeAvisos({
  onIr,
}: {
  readonly onIr: (modulo: string, parametros?: Readonly<Record<string, string>>) => void;
}) {
  const { acceso } = useSesion();
  const negocio = acceso?.negocioId ?? '';
  const [dia] = useState(() => hoyDe());

  const resumen = useConsulta<ResumenDeInicio>(
    negocio ? llaveDelResumen(negocio, dia) : null,
    () => traerResumen(negocio, dia),
  );

  return (
    <Notificaciones
      resumen={resumen.datos}
      permisos={acceso?.permisos ?? {}}
      hoy={dia}
      onIr={onIr}
    />
  );
}

export function Notificaciones({
  resumen,
  permisos,
  hoy,
  onIr,
}: {
  readonly resumen: ResumenDeInicio | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly hoy: string;
  readonly onIr: (modulo: string, parametros?: Readonly<Record<string, string>>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const idPanel = useId();

  const avisos = avisosDelResumen(resumen, permisos, hoy);

  /**
   * Se cierra al tocar fuera y al apretar Escape.
   *
   * El `mousedown` y no el `click`: con `click` el panel se cierra DESPUES de
   * que el navegador ya decidio a quien le tocaba el toque, y el primer clic
   * fuera se pierde — hay que hacer dos para tocar cualquier otra cosa.
   */
  useEffect(() => {
    if (!abierto) return;

    const afuera = (e: MouseEvent): void => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      // El foco VUELVE a la campana. Sin esto, quien cerro con teclado se
      // queda con el foco en la nada y tiene que tabular desde el principio.
      boton.current?.focus();
    };

    document.addEventListener('mousedown', afuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', afuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  return (
    <div className="ini-campana" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="ini-campana__boton"
        aria-expanded={abierto}
        aria-controls={idPanel}
        aria-label={
          avisos.length > 0
            ? `Avisos: ${avisos.length} ${
                avisos.length === 1 ? 'cosa que requiere' : 'cosas que requieren'
              } atención`
            : 'Avisos: nada requiere atención'
        }
        onClick={() => setAbierto((a) => !a)}
      >
        <Icono nombre="campana" lado={20} />
        {avisos.length > 0 ? <span className="ini-campana__punto" aria-hidden="true" /> : null}
      </button>

      {abierto ? (
        <div className="ini-campana__panel" id={idPanel} role="group" aria-label="Avisos">
          {avisos.length === 0 ? (
            <p className="ini-campana__vacio">Nada requiere tu atención por ahora.</p>
          ) : (
            <ul className="ini-campana__lista">
              {avisos.map((a) => (
                <li key={a.clave}>
                  <button
                    type="button"
                    className="ini-campana__aviso"
                    onClick={() => {
                      setAbierto(false);
                      onIr(a.modulo, a.parametros);
                    }}
                  >
                    <span className="ini-campana__icono" aria-hidden="true">
                      <Icono nombre={a.icono} lado={18} />
                    </span>
                    <span className="ini-campana__texto">
                      <span className="ini-campana__que">{a.texto}</span>
                      <span className="ini-campana__porque">{a.detalle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
