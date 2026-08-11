/**
 * LA PESTAÑA DE ALUMNOS.
 *
 * UN ALUMNO ES UN CLIENTE CON UNA INSCRIPCION. No hay lista de alumnos aparte:
 * se busca en Clientes, que es la fuente de verdad de quien es alguien. Con
 * dos listas de personas, la misma señora acaba capturada dos veces —una
 * porque vino a un masaje y otra porque tomo el taller— y su historial queda
 * partido en dos mitades que ya no se vuelven a juntar.
 *
 * INSCRIPCION Y PAGO SE ENSEÑAN APARTE, porque son cosas distintas: se puede
 * estar inscrito y deber, y se puede haber pagado y despues cancelar. Una sola
 * etiqueta que mezclara las dos haria imposible saber a quien hay que cobrarle.
 *
 * LA LISTA DE ESPERA NO OCUPA LUGAR y se enseña en su propio grupo: mezclarla
 * con los inscritos haria creer que el curso esta mas lleno de lo que esta.
 */

import { Boton, Confirmacion } from '@neron/base/ui';
import { useEffect, useRef, useState } from 'react';
import type { AlumnoDelCurso, EstadoDeInscripcion, FichaDeCurso } from '../datos/cursos.js';
import { estaLleno } from '../datos/cursos.js';
import { Icono } from '../ui/iconos.js';

export const COMO_SE_DICE_LA_INSCRIPCION: Readonly<Record<EstadoDeInscripcion, string>> = {
  inscrito: 'Inscrito',
  asistio: 'Asistió',
  cancelado: 'Cancelado',
  lista_espera: 'En espera',
};

/** Los que de verdad ocupan lugar. La espera y las bajas no cuentan. */
export function alumnosQueOcupan(alumnos: readonly AlumnoDelCurso[]): AlumnoDelCurso[] {
  return alumnos.filter((a) => a.estado === 'inscrito' || a.estado === 'asistio');
}

export function alumnosEnEspera(alumnos: readonly AlumnoDelCurso[]): AlumnoDelCurso[] {
  return alumnos.filter((a) => a.estado === 'lista_espera');
}

export function alumnosDeBaja(alumnos: readonly AlumnoDelCurso[]): AlumnoDelCurso[] {
  return alumnos.filter((a) => a.estado === 'cancelado');
}

/** Lo que se le dice a quien va a inscribir en un curso lleno. */
export function avisoDeCupo(ficha: FichaDeCurso): string {
  if (!estaLleno(ficha.cupo, ficha.ocupados)) return '';
  return 'El curso está lleno: quien se inscriba ahora entra en lista de espera, no ocupa lugar.';
}

interface ClienteBuscable {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
}

export interface PropiedadesDeAlumnos {
  readonly ficha: FichaDeCurso;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly clientes: readonly ClienteBuscable[];
  readonly trabajando: boolean;
  readonly error: string | null;
  onBuscarCliente(texto: string): void;
  onInscribir(clienteId: string): void;
  onCambiarEstado(inscripcionId: string, estado: EstadoDeInscripcion): void;
  onNuevoCliente(): void;
  onAbrirCliente(clienteId: string): void;
}

export function Alumnos({
  ficha,
  permisos,
  clientes,
  trabajando,
  error,
  onBuscarCliente,
  onInscribir,
  onCambiarEstado,
  onNuevoCliente,
  onAbrirCliente,
}: PropiedadesDeAlumnos) {
  const [inscribiendo, setInscribiendo] = useState(false);
  const [escrito, setEscrito] = useState('');
  const [aDarDeBaja, setADarDeBaja] = useState<AlumnoDelCurso | null>(null);
  const puedeGestionar = permisos['gestionarCatalogo'] === true;

  // El buscador de clientes espera a que dejen de escribir, igual que el de
  // Clientes: sin la espera cada tecla es un viaje y las respuestas llegan
  // desordenadas.
  const primero = useRef(true);
  useEffect(() => {
    if (primero.current) {
      primero.current = false;
      return;
    }
    const t = setTimeout(() => onBuscarCliente(escrito.trim()), 300);
    return () => clearTimeout(t);
  }, [escrito, onBuscarCliente]);

  const ocupan = alumnosQueOcupan(ficha.alumnos);
  const esperan = alumnosEnEspera(ficha.alumnos);
  const bajas = alumnosDeBaja(ficha.alumnos);
  const yaInscritos = new Set(
    ficha.alumnos.filter((a) => a.estado !== 'cancelado').map((a) => a.clienteId),
  );

  function Renglon({ a }: { readonly a: AlumnoDelCurso }) {
    return (
      <li className="cur-alumno">
        <button type="button" className="cur-alumno__quien" onClick={() => onAbrirCliente(a.clienteId)}>
          <span className="pz-inicial" aria-hidden="true">
            {a.nombre.slice(0, 1).toUpperCase()}
          </span>
          <span className="pz-renglon__cuerpo">
            <span className="pz-renglon__titulo">{a.nombre}</span>
            {a.telefono ? <span className="pz-renglon__pie">{a.telefono}</span> : null}
          </span>
        </button>
        <span className="cur-alumno__estados">
          <span className={`pz-pastilla cur-insc--${a.estado}`}>
            {COMO_SE_DICE_LA_INSCRIPCION[a.estado]}
          </span>
          {/* El dinero se dice APARTE: se puede estar inscrito y deber. */}
          <span className={`pz-pastilla ${a.pagada ? 'pz-pastilla--exito' : 'cur-insc--debe'}`}>
            {a.pagada ? 'Pagado' : 'Sin pago'}
          </span>
        </span>
        {puedeGestionar ? (
          <span className="pz-encabezado__acciones">
            {a.estado === 'lista_espera' ? (
              <button
                type="button"
                className="pz-boton"
                onClick={() => onCambiarEstado(a.id, 'inscrito')}
              >
                Confirmar
              </button>
            ) : null}
            {a.estado === 'inscrito' ? (
              <button
                type="button"
                className="pz-boton"
                onClick={() => onCambiarEstado(a.id, 'asistio')}
              >
                Asistió
              </button>
            ) : null}
            {a.estado !== 'cancelado' ? (
              <button type="button" className="pz-boton" onClick={() => setADarDeBaja(a)}>
                Dar de baja
              </button>
            ) : null}
          </span>
        ) : null}
      </li>
    );
  }

  return (
    <div className="srv-detalle__cuerpo">
      <div className="cur-alumnos__cabeza">
        <span className="tt-etiqueta">
          {ficha.cupo === null
            ? `${ocupan.length} inscritos · sin límite de cupo`
            : `${ocupan.length} de ${ficha.cupo} lugares`}
        </span>
        {puedeGestionar ? (
          <button
            type="button"
            className="pz-boton"
            onClick={() => setInscribiendo((a) => !a)}
          >
            <Icono nombre="personaMas" lado={14} /> Inscribir alumno
          </button>
        ) : null}
      </div>

      {inscribiendo ? (
        <div className="cat__forma">
          {avisoDeCupo(ficha) ? (
            <p className="tt-secundario" role="status">
              {avisoDeCupo(ficha)}
            </p>
          ) : null}
          <div className="pz-buscador">
            <span className="pz-buscador__lupa" aria-hidden="true">
              <Icono nombre="lupa" lado={16} />
            </span>
            {/* Se busca en CLIENTES. No hay una lista de alumnos aparte. */}
            <input
              type="search"
              className="pz-buscador__campo"
              autoComplete="off"
              placeholder="Buscar cliente por nombre o teléfono…"
              aria-label="Buscar cliente para inscribir"
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
            />
          </div>

          {clientes.length === 0 ? (
            <p className="pz-vacio__texto">
              {escrito
                ? 'Ningún cliente coincide. Puedes darlo de alta y volver.'
                : 'Escribe un nombre para buscarlo en tu lista de clientes.'}
            </p>
          ) : (
            <ul className="pz-lista">
              {clientes.map((c) => (
                <li key={c.id} className="pz-renglon pz-renglon--quieto">
                  <span className="pz-inicial" aria-hidden="true">
                    {c.nombre.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="pz-renglon__cuerpo">
                    <span className="pz-renglon__titulo">{c.nombre}</span>
                    {c.telefono ? <span className="pz-renglon__pie">{c.telefono}</span> : null}
                  </span>
                  <span className="pz-encabezado__acciones">
                    {/* Ya inscrito NO se ofrece otra vez: la base lo rechazaria
                        y el mensaje llegaria despues del clic. */}
                    {yaInscritos.has(c.id) ? (
                      <span className="tt-falta">Ya inscrito</span>
                    ) : (
                      <Boton
                        tono="principal"
                        type="button"
                        trabajando={trabajando}
                        onClick={() => onInscribir(c.id)}
                      >
                        Inscribir
                      </Boton>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="pz-boton" onClick={onNuevoCliente}>
            <Icono nombre="mas" lado={14} /> Es alguien nuevo: darlo de alta
          </button>

          {error ? (
            <p className="pz-error__que" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {ficha.alumnos.length === 0 ? (
        <p className="pz-vacio__texto">
          Todavía no hay nadie inscrito. Los alumnos salen de tu lista de clientes: quien toma un
          curso y quien viene a una sesión son la misma persona.
        </p>
      ) : (
        <>
          {ocupan.length > 0 ? (
            <ul className="cur-alumnos">
              {ocupan.map((a) => (
                <Renglon key={a.id} a={a} />
              ))}
            </ul>
          ) : null}

          {/* La espera va en su propio grupo: mezclarla con los inscritos haria
              creer que el curso esta mas lleno de lo que esta. */}
          {esperan.length > 0 ? (
            <>
              <span className="tt-etiqueta">En lista de espera ({esperan.length})</span>
              <ul className="cur-alumnos">
                {esperan.map((a) => (
                  <Renglon key={a.id} a={a} />
                ))}
              </ul>
            </>
          ) : null}

          {bajas.length > 0 ? (
            <>
              <span className="tt-etiqueta">Bajas ({bajas.length})</span>
              <ul className="cur-alumnos">
                {bajas.map((a) => (
                  <Renglon key={a.id} a={a} />
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      <Confirmacion
        abierto={aDarDeBaja !== null}
        titulo="Dar de baja"
        confirmar="Dar de baja"
        destructivo
        onConfirmar={() => {
          if (aDarDeBaja) onCambiarEstado(aDarDeBaja.id, 'cancelado');
          setADarDeBaja(null);
        }}
        onCancelar={() => setADarDeBaja(null)}
      >
        <p>
          {aDarDeBaja?.nombre} deja de ocupar lugar en este curso. No se borra nada: su expediente,
          su historial y lo que haya pagado siguen igual, y se puede volver a inscribir.
        </p>
      </Confirmacion>
    </div>
  );
}
