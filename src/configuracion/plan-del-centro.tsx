/**
 * EL PLAN Y LA LICENCIA.
 *
 * ESTA PANTALLA EXISTE PARA QUE LOS GUARDADOS NO FALLEN "PORQUE SI".
 *
 * `app.licencia_permite` corta la escritura cuando la licencia vence. Sin una
 * pantalla que lo explique, el sintoma es este: un martes cualquiera deja de
 * poder guardarse una cita, con un error de permisos que nadie relaciona con
 * una fecha — y se busca el problema en el codigo, en la conexion y en los
 * roles antes de mirar aqui.
 *
 * LA LICENCIA NO SE ARREGLA DESDE ADENTRO, Y ESO ES EL PUNTO. En Neron POS esta
 * llave vivia dentro del bloque que el cliente escribe, asi que no era una
 * licencia: era una sugerencia. Aqui se lee y no hay ningun camino para
 * tocarla, ni para el dueño. Por eso la pantalla dice a quien escribirle en vez
 * de ofrecer un boton.
 *
 * SIN RENGLON DE LICENCIA NO SE INVENTA UN PLAN. La base falla ABIERTO a
 * proposito —un centro jamas se queda afuera por un dato que todavia no
 * existe—, y la pantalla lo dice con esas palabras en vez de enseñar un plan
 * que nadie contrato.
 */

import {
  COMO_SE_DICE_LA_LICENCIA,
  VERSION_DEL_SISTEMA,
  type LicenciaDelCentro,
} from '../datos/configuracion.js';
import { Icono } from '../ui/iconos.js';

/**
 * La fecha de vencimiento, escrita.
 *
 * NO PASA POR `Intl` ni por `toLocaleDateString`: en el entorno de pruebas
 * devuelve otra cosa sin avisar, y una fecha de vencimiento que se lee distinta
 * según dónde se mire no sirve para nada. Lo que no se entiende sale vacío.
 */
export function cuandoVence(iso: string | null): string {
  if (!iso) return '';
  const marca = Date.parse(iso);
  if (!Number.isFinite(marca)) return '';
  const d = new Date(marca);
  const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${d.getDate()} de ${MESES[d.getMonth()] ?? ''} de ${d.getFullYear()}`;
}

/** Cuántos días faltan. `null` cuando no hay fecha: no es lo mismo que cero. */
export function diasQueFaltan(iso: string | null, ahora: Date = new Date()): number | null {
  if (!iso) return null;
  const marca = Date.parse(iso);
  if (!Number.isFinite(marca)) return null;
  return Math.ceil((marca - ahora.getTime()) / 86400000);
}

export interface PropiedadesDelPlan {
  readonly licencia: LicenciaDelCentro | null;
  readonly cargando: boolean;
  /** Cuántos días quedan, ya calculados fuera: aquí no se lee el reloj al pintar. */
  readonly dias: number | null;
}

export function PlanDelCentro({ licencia, cargando, dias }: PropiedadesDelPlan) {
  if (cargando || !licencia) {
    return (
      <div className="pz-cargando" aria-busy="true">
        <span className="neron-solo-lectores">Cargando el plan del centro</span>
        <div className="pz-silueta" />
      </div>
    );
  }

  const estado = licencia.estado ? (COMO_SE_DICE_LA_LICENCIA[licencia.estado] ?? licencia.estado) : '';

  return (
    <div className="cfg-plan">
      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">Plan y licencia</h3>

        {!licencia.administrada ? (
          <>
            <p className="tt-secundario">
              <strong>Este centro no tiene licencia administrada</strong>, y eso quiere decir que
              nada le corta el paso: se puede trabajar con normalidad. No es un error ni un dato que
              falte.
            </p>
            <p className="tt-secundario">
              El día que se contrate un plan, aquí van a salir su nombre, hasta cuándo llega y qué
              pasa al vencer.
            </p>
          </>
        ) : (
          <dl className="pz-datos">
            <div className="pz-dato pz-dato--renglon">
              <dt className="tt-etiqueta">Plan actual</dt>
              <dd className="pz-dato__valor">{licencia.plan ?? 'Sin plan administrado'}</dd>
            </div>
            <div className="pz-dato pz-dato--renglon">
              <dt className="tt-etiqueta">Estado de la licencia</dt>
              <dd className="pz-dato__valor">
                <span
                  className={`pz-pastilla pz-pastilla--${
                    licencia.permiteGuardar ? 'exito' : 'peligro'
                  }`}
                >
                  {estado}
                </span>
              </dd>
            </div>
            <div className="pz-dato pz-dato--renglon">
              <dt className="tt-etiqueta">Próxima renovación</dt>
              <dd className="pz-dato__valor">
                {/* SIN FECHA NO SE INVENTA UNA. "Sin vencimiento" es la verdad
                    de una licencia sin `expira_en`, y es distinto de "no se
                    sabe". */}
                {licencia.expiraEn ? cuandoVence(licencia.expiraEn) : 'Sin vencimiento'}
                {dias !== null && dias >= 0 ? (
                  <span className="cfg-plan__dias">
                    {dias === 0 ? 'Vence hoy' : dias === 1 ? 'Queda 1 día' : `Quedan ${dias} días`}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        )}

        {!licencia.permiteGuardar ? (
          <p className="pz-error__que" role="alert">
            <Icono nombre="alerta" lado={16} /> Mientras la licencia esté así, la base de datos no
            deja guardar nada nuevo: ni una cita, ni un cobro, ni un cambio aquí. Lo que ya está
            guardado se sigue viendo y se puede exportar.
          </p>
        ) : null}

        <p className="tt-secundario">
          La licencia la escribe la plataforma y no se puede cambiar desde dentro del centro — si se
          pudiera, no sería una licencia. Para renovar o cambiar de plan hay que hablar con quien
          administra la plataforma.
        </p>
      </section>

      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">Información del sistema</h3>
        <dl className="pz-datos">
          <div className="pz-dato pz-dato--renglon">
            <dt className="tt-etiqueta">Versión del sistema</dt>
            <dd className="pz-dato__valor">
              <span className="pz-pastilla">v{VERSION_DEL_SISTEMA}</span>
            </dd>
          </div>
          {licencia.actualizadaEn ? (
            <div className="pz-dato pz-dato--renglon">
              <dt className="tt-etiqueta">Licencia revisada</dt>
              <dd className="pz-dato__valor">{cuandoVence(licencia.actualizadaEn)}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  );
}
