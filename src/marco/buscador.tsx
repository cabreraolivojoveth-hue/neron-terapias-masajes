/**
 * EL BUSCADOR GLOBAL de la barra superior.
 *
 * EL PROBLEMA QUE ESTE ARCHIVO ESTA ESCRITO PARA NO REPETIR: un campo que
 * pierde el foco despues de cada tecla. Escribes "A", el componente se vuelve
 * a montar, el cursor se sale, y hay que volver a hacer clic para escribir la
 * "n". Se siente como un sistema roto y casi siempre es la misma causa:
 *
 *  1. El componente del campo se DEFINE dentro del render de otro. Cada render
 *     del padre crea una funcion distinta, React la ve como un componente
 *     nuevo, tira el nodo del DOM y monta otro. Por eso aqui todo esta
 *     definido en el nivel del archivo y nada se define adentro de nada.
 *
 *  2. El campo se pinta CONDICIONALMENTE —`{abierto ? <input/> : null}`— o
 *     cambia de lugar en el arbol al aparecer los resultados. Por eso el
 *     `<input>` de abajo se pinta SIEMPRE, en el mismo sitio, pase lo que
 *     pase; lo unico que aparece y desaparece es la lista, que va debajo.
 *
 *  3. Una `key` que cambia. Aqui el campo no lleva ninguna.
 *
 * NO SE CONSULTA EN CADA TECLA. Se espera a que la persona deje de escribir un
 * cuarto de segundo. Sin eso, "Fernanda" son ocho consultas de las que siete
 * no le importan a nadie, y las respuestas pueden llegar desordenadas: la de
 * "Fer" contesta despues que la de "Fernanda" y la lista termina mostrando el
 * resultado de lo que se escribio antes.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useConsulta } from '../datos/consulta.js';
import {
  agruparPorTipo,
  buscarEnTodo,
  LETRAS_MINIMAS,
  llaveDeBusqueda,
  normalizarBusqueda,
  type Encontrado,
} from '../datos/busqueda.js';
import { Icono } from '../ui/iconos.js';

/** Cuanto se espera a que dejen de escribir. */
const ESPERA_MS = 250;

export function Buscador({
  negocio,
  onAbrir,
}: {
  readonly negocio: string;
  /** El buscador NO navega: avisa quien encontro y a donde pertenece. */
  readonly onAbrir: (cosa: Encontrado) => void;
}) {
  const [texto, setTexto] = useState('');
  const [buscado, setBuscado] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const caja = useRef<HTMLDivElement | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);
  const idLista = useId();

  /* --- El retraso: se consulta cuando deja de escribir --------------- */
  useEffect(() => {
    const t = setTimeout(() => setBuscado(normalizarBusqueda(texto)), ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto]);

  const listo = buscado.length >= LETRAS_MINIMAS;

  const resultados = useConsulta<Encontrado[]>(
    listo && negocio ? llaveDeBusqueda(negocio, buscado) : null,
    () => buscarEnTodo(negocio, buscado),
  );

  const cosas = listo ? (resultados.datos ?? []) : [];
  const grupos = agruparPorTipo(cosas);
  const buscando = listo && resultados.estado === 'cargando' && resultados.datos === null;

  /* --- Cerrar al tocar fuera ---------------------------------------- */
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: MouseEvent): void => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', afuera);
    return () => document.removeEventListener('mousedown', afuera);
  }, [abierto]);

  // Al cambiar los resultados, la marca vuelve al primero. Sin esto queda
  // apuntando al quinto de una lista que ahora tiene dos.
  useEffect(() => setMarcado(0), [buscado]);

  function escoger(cosa: Encontrado | undefined): void {
    if (!cosa) return;
    setAbierto(false);
    // El texto SE QUEDA. Borrarlo al escoger obliga a escribirlo otra vez
    // cuando lo que se queria era ver el segundo resultado.
    onAbrir(cosa);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape') {
      setAbierto(false);
      return;
    }
    if (!abierto || cosas.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMarcado((m) => (m + 1) % cosas.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMarcado((m) => (m - 1 + cosas.length) % cosas.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      escoger(cosas[marcado]);
    }
  }

  let posicion = -1;

  return (
    <div className="ini-buscador" ref={caja}>
      <span className="ini-buscador__lupa" aria-hidden="true">
        <Icono nombre="lupa" lado={18} />
      </span>

      {/*
        SIEMPRE PINTADO, en el mismo lugar del arbol. Es lo que sostiene el
        foco: lo unico que aparece y desaparece es la lista de abajo.
      */}
      <input
        ref={campo}
        type="search"
        className="ini-buscador__campo"
        // `type=search` en Safari pone su propia crucecita que borra el texto
        // sin avisar a React; el autocompletado del navegador tapaba la lista.
        autoComplete="off"
        placeholder="Buscar clientes, citas, productos…"
        aria-label="Buscar en todo el centro"
        role="combobox"
        aria-expanded={abierto && listo}
        aria-controls={idLista}
        aria-autocomplete="list"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclear}
      />

      {abierto && texto.trim().length > 0 ? (
        <div className="ini-buscador__panel" id={idLista} role="listbox" aria-label="Resultados">
          {!listo ? (
            <p className="ini-buscador__pista">
              Escribe al menos {LETRAS_MINIMAS} letras.
            </p>
          ) : resultados.error ? (
            <p className="ini-buscador__pista" role="alert">
              No pudimos buscar: {resultados.error}
            </p>
          ) : buscando ? (
            <p className="ini-buscador__pista" aria-live="polite">
              Buscando…
            </p>
          ) : grupos.length === 0 ? (
            // Se dice QUE se busco. "Sin resultados" a secas deja la duda de
            // si el sistema busco de verdad o si algo fallo.
            <p className="ini-buscador__pista">No encontramos nada con «{buscado}».</p>
          ) : (
            grupos.map((g) => (
              <div key={g.tipo} className="ini-buscador__grupo">
                <p className="ini-buscador__grupo-titulo">{g.titulo}</p>
                <ul className="ini-buscador__lista">
                  {g.cosas.map((c) => {
                    posicion += 1;
                    const esta = posicion === marcado;
                    return (
                      <li key={`${c.tipo}:${c.id}`} role="option" aria-selected={esta}>
                        <button
                          type="button"
                          className={`ini-buscador__cosa${esta ? ' ini-buscador__cosa--marcada' : ''}`}
                          // `mousedown` y no `click`: al hacer clic, el campo
                          // pierde el foco ANTES del click, el panel se cierra
                          // por el cierre-al-tocar-fuera, y el clic cae en el
                          // vacio. Con mousedown se escoge antes de eso.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            escoger(c);
                          }}
                        >
                          <span className="ini-buscador__nombre">{c.nombre}</span>
                          {c.pista ? (
                            <span className="ini-buscador__pista-corta">{c.pista}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
