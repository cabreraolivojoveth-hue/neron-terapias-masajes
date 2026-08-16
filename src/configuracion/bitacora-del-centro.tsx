/**
 * LA BITACORA — quien hizo que y cuando. SOLO SE LEE.
 *
 * NO HAY BOTON DE BORRAR NI DE CORREGIR, y no es que se escondan: la base le
 * quita el permiso de `update` y `delete` sobre `auditoria` a todo el mundo,
 * incluido el servidor. Una bitacora que el auditado puede editar no es una
 * bitacora. Aqui esa decision se nota en que la pantalla entera es de lectura.
 *
 * QUIEN NO TIENE `verAuditoria` NO VE NADA, y tampoco porque aqui se le esconda
 * el boton: la politica de la tabla no le entrega ni una fila. Por eso la
 * pantalla distingue "no hay nada" de "no te toca" con las palabras exactas —
 * un vacio sin explicacion hace que alguien crea que el centro no ha hecho nada
 * en tres meses.
 *
 * LOS FILTROS SALEN DE LO QUE HAY. Los modulos y la gente los devuelve la misma
 * consulta, contando lo que de verdad esta guardado: una lista escrita a mano
 * ofreceria filtrar por un modulo del que no hay ni un renglon, y quien lo use
 * se queda buscando algo que nunca existio.
 */

import { Boton } from '@neron/base/ui';
import {
  comoSeDiceLaAccion,
  type AnotacionDeLaBitacora,
  type ConsultaDeLaBitacora,
  type PaginaDeLaBitacora,
} from '../datos/configuracion.js';
import { Icono } from '../ui/iconos.js';

/**
 * Una anotación en una línea.
 *
 * SE ARMA AQUI Y NO EN LA BASE. La bitácora guarda verbos cortos —`crear`,
 * `dar-de-baja`— porque son estables y se filtran bien; convertirlos en español
 * al leer es lo que permite renombrar la frase sin migrar tres años de
 * historia.
 */
export function comoSeLee(a: AnotacionDeLaBitacora): string {
  const que = comoSeDiceLaAccion(a.accion);
  return `${a.usuario} · ${que} en ${a.modulo}`;
}

/**
 * Cuándo ocurrió, escrito corto: "Hoy, 10:30" · "Ayer, 16:15" · "12 ago, 09:00".
 *
 * SE PARTE EL TEXTO EN VEZ DE FORMATEAR CON `Intl`, que es la regla del
 * producto: en una compilación recortada de Node —o en el entorno de pruebas—
 * `Intl` devuelve "August" sin avisar de nada. Lo que no se entiende sale
 * vacío, nunca una hora inventada.
 */
export function cuandoOcurrio(iso: string, ahora: Date = new Date()): string {
  const marca = Date.parse(iso);
  if (!Number.isFinite(marca)) return '';
  const d = new Date(marca);
  const reloj = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  if (d.toDateString() === ahora.toDateString()) return `Hoy, ${reloj}`;

  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${reloj}`;

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${MESES[d.getMonth()] ?? ''}, ${reloj}`;
}

export interface PropiedadesDeLaBitacora {
  readonly pagina: PaginaDeLaBitacora | null;
  readonly consulta: ConsultaDeLaBitacora;
  readonly cargando: boolean;
  readonly error: string | null;
  /** `false` = la base no le entrega nada a esta persona. Se dice, no se calla. */
  readonly puedeVerla: boolean;
  onConsulta(c: ConsultaDeLaBitacora): void;
  onReintentar(): void;
}

export function BitacoraDelCentro({
  pagina,
  consulta,
  cargando,
  error,
  puedeVerla,
  onConsulta,
  onReintentar,
}: PropiedadesDeLaBitacora) {
  if (!puedeVerla) {
    return (
      <div className="pz-vacio">
        <span className="pz-vacio__icono" aria-hidden="true">
          <Icono nombre="escudo" lado={28} />
        </span>
        <p className="pz-vacio__titulo">La bitácora no es para tu cuenta</p>
        <p className="pz-vacio__texto">
          Leerla necesita el permiso de ver la auditoría. No es que aquí se esconda: la base de
          datos no le entrega estos renglones a tu cuenta aunque los pida a mano.
        </p>
      </div>
    );
  }

  const filas = pagina?.filas ?? [];
  const total = pagina?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / Math.max(1, consulta.porPagina)));
  const conFiltro =
    consulta.modulo !== '' ||
    consulta.usuarioId !== '' ||
    consulta.desde !== '' ||
    consulta.hasta !== '' ||
    consulta.busqueda.trim() !== '';

  return (
    <div className="cfg-bitacora">
      <div className="cfg-filtros">
        <label className="pz-buscador">
          <span className="neron-solo-lectores">Buscar en la bitácora</span>
          <span className="pz-buscador__lupa" aria-hidden="true">
            <Icono nombre="lupa" lado={16} />
          </span>
          <input
            className="pz-buscador__campo"
            placeholder="Buscar por persona o acción…"
            value={consulta.busqueda}
            onChange={(e) => onConsulta({ ...consulta, busqueda: e.target.value, pagina: 1 })}
          />
        </label>

        <label className="pz-campo pz-campo--corto">
          <span className="neron-solo-lectores">Módulo</span>
          <select
            value={consulta.modulo}
            onChange={(e) => onConsulta({ ...consulta, modulo: e.target.value, pagina: 1 })}
          >
            <option value="">Todos los módulos</option>
            {(pagina?.modulos ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="pz-campo pz-campo--corto">
          <span className="neron-solo-lectores">Persona</span>
          <select
            value={consulta.usuarioId}
            onChange={(e) => onConsulta({ ...consulta, usuarioId: e.target.value, pagina: 1 })}
          >
            <option value="">Todo el equipo</option>
            {(pagina?.gente ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="pz-campo pz-campo--corto">
          <span className="neron-solo-lectores">Desde</span>
          <input
            className="cfg-campo"
            type="date"
            value={consulta.desde}
            onChange={(e) => onConsulta({ ...consulta, desde: e.target.value, pagina: 1 })}
          />
        </label>
        <label className="pz-campo pz-campo--corto">
          <span className="neron-solo-lectores">Hasta</span>
          <input
            className="cfg-campo"
            type="date"
            value={consulta.hasta}
            onChange={(e) => onConsulta({ ...consulta, hasta: e.target.value, pagina: 1 })}
          />
        </label>
      </div>

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No se pudo cargar la bitácora.</p>
          <p className="pz-error__detalle">{error}</p>
          <Boton tono="contorno" onClick={onReintentar}>
            Reintentar
          </Boton>
        </div>
      ) : cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando la bitácora</span>
          <div className="pz-silueta" />
          <div className="pz-silueta" />
        </div>
      ) : filas.length === 0 ? (
        <div className="pz-vacio pz-vacio--chico">
          <p className="pz-vacio__titulo">
            {/* "NO HAY NADA" NO ES LO MISMO QUE "NADA COINCIDE", y confundirlos
                hace que quien filtró crea que perdió su historial. */}
            {conFiltro ? 'Nada coincide con esos filtros' : 'Todavía no hay nada anotado'}
          </p>
          <p className="pz-vacio__texto">
            {conFiltro
              ? 'Prueba con otro módulo, otra persona u otras fechas.'
              : 'Aquí se va anotando sola cada cosa que se guarda, se cobra o se cancela.'}
          </p>
        </div>
      ) : (
        <ul className="pz-lista">
          {filas.map((a) => (
            <li key={a.id} className="pz-renglon pz-renglon--quieto cfg-anotacion">
              <span className="pz-renglon__cuerpo">
                <span className="pz-renglon__titulo">{comoSeLee(a)}</span>
                <span className="pz-renglon__pie">
                  {a.rol}
                  {a.entidad ? ` · ${a.entidad}` : ''}
                  {a.motivo ? ` · ${a.motivo}` : ''}
                </span>
              </span>
              <span className="cfg-anotacion__cuando">{cuandoOcurrio(a.ocurridoEn)}</span>
            </li>
          ))}
        </ul>
      )}

      {paginas > 1 ? (
        <div className="pz-paginas">
          <button
            type="button"
            className="pz-pagina"
            disabled={consulta.pagina <= 1}
            onClick={() => onConsulta({ ...consulta, pagina: consulta.pagina - 1 })}
          >
            Anterior
          </button>
          <span className="pz-paginas__actual">
            {consulta.pagina} de {paginas}
          </span>
          <button
            type="button"
            className="pz-pagina"
            disabled={consulta.pagina >= paginas}
            onClick={() => onConsulta({ ...consulta, pagina: consulta.pagina + 1 })}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </div>
  );
}
