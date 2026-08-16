/**
 * EMPEZAR UNA CONVERSACIÓN.
 *
 * SE ESCOGE AL CLIENTE, NO SE ESCRIBE SU NOMBRE. Lo que se guarda es el hilo
 * contra su `clienteId`; teclear el nombre a mano crearía dos historiales de la
 * misma persona sin que nadie lo note.
 *
 * SE PUEDE ESCRIBIR A UN NÚMERO SUELTO, y hace falta: alguien pregunta por un
 * precio antes de ser cliente de nadie. Esa conversación queda sin ficha y la
 * pantalla ofrece atarla después — lo que NO se hace es crear una ficha vacía
 * para tener a quién colgarla.
 *
 * SI EL NÚMERO YA ES DE ALGUIEN, LA CONVERSACIÓN SE VA A SU HILO. Lo resuelve
 * la base comparando los últimos diez dígitos, que es lo que hace que
 * "+52 646 123 4567" y "6461234567" sean la misma persona — que es como los
 * teléfonos se capturan de verdad.
 */

import { useState } from 'react';
import type { ClienteEnLista } from '../datos/clientes.js';
import type { CanalDeMensajes, PlantillaDeMensaje } from '../datos/mensajes.js';
import { COMO_SE_DICE_EL_CANAL } from '../datos/mensajes.js';
import { Modal } from '../ui/modal.js';
import { Icono } from '../ui/iconos.js';
import { rellenarPlantilla } from './variables.js';

export interface PropiedadesDelNuevoMensaje {
  readonly abierto: boolean;
  readonly clientes: readonly ClienteEnLista[];
  readonly busqueda: string;
  readonly buscando: boolean;
  readonly canales: readonly CanalDeMensajes[];
  readonly plantillas: readonly PlantillaDeMensaje[];
  readonly trabajando: boolean;
  readonly error: string | null;
  readonly nombreDelCentro: string;
  onBuscar(texto: string): void;
  onCrearCliente(): void;
  onEnviar(datos: {
    clienteId: string | null; contacto: string; canalId: string | null; cuerpo: string;
  }): void;
  onCerrar(): void;
}

export function NuevoMensaje({
  abierto,
  clientes,
  busqueda,
  buscando,
  canales,
  plantillas,
  trabajando,
  error,
  nombreDelCentro,
  onBuscar,
  onCrearCliente,
  onEnviar,
  onCerrar,
}: PropiedadesDelNuevoMensaje) {
  const [escogido, setEscogido] = useState<ClienteEnLista | null>(null);
  const [suelto, setSuelto] = useState('');
  const [canalId, setCanalId] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [faltantes, setFaltantes] = useState<readonly string[]>([]);

  const contacto = escogido?.telefono ?? suelto;
  const canal = canales.find((c) => c.id === canalId) ?? null;
  const listo = contacto.trim() !== '' && cuerpo.trim() !== '';

  /** Rellena la plantilla con lo que de verdad se sabe de quien está escogido. */
  function usarPlantilla(p: PlantillaDeMensaje): void {
    const { texto, faltantes: faltan } = rellenarPlantilla(p.cuerpo, {
      cliente: escogido
        ? { nombre: escogido.nombre, telefono: escogido.telefono, correo: escogido.correo }
        : {},
      centro: { nombre: nombreDelCentro },
    });
    setCuerpo(texto);
    setFaltantes(faltan);
  }

  return (
    <Modal abierto={abierto} titulo="Nuevo mensaje" ancho bloqueado={trabajando} onCerrar={onCerrar}>
      <div className="pz-columna">
        <div className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">A quién</span>
          {escogido ? (
            <div className="vta-escogido">
              <span className="pz-ficha" aria-hidden="true">
                <Icono nombre="persona" lado={16} />
              </span>
              <span className="pz-renglon__titulo">{escogido.nombre}</span>
              <span className="pz-renglon__pie">{escogido.telefono ?? 'Sin teléfono'}</span>
              <button
                type="button"
                className="pz-icono-boton"
                aria-label={`Quitar a ${escogido.nombre}`}
                onClick={() => setEscogido(null)}
              >
                ×
              </button>
            </div>
          ) : (
            <>
              {/* El campo vive SIEMPRE aquí, fuera de cualquier rama que cambie
                  al llegar los resultados: es lo que sostiene el foco mientras
                  la lista de abajo se rehace con cada letra. */}
              <div className="pz-buscador">
                <span className="pz-buscador__lupa" aria-hidden="true">
                  <Icono nombre="persona" lado={16} />
                </span>
                <input
                  type="search"
                  className="pz-buscador__campo"
                  autoComplete="off"
                  placeholder="Buscar cliente…"
                  aria-label="Buscar cliente"
                  value={busqueda}
                  onChange={(e) => onBuscar(e.target.value)}
                />
              </div>

              {busqueda ? (
                buscando ? (
                  <div className="pz-cargando" aria-busy="true">
                    <div className="pz-silueta" />
                  </div>
                ) : clientes.length === 0 ? (
                  <p className="pz-vacio__texto">
                    Nadie coincide. Puedes escribirle a un número suelto aquí abajo, o darlo de alta.
                  </p>
                ) : (
                  <ul className="vta-encontrados">
                    {clientes.slice(0, 6).map((c) => (
                      <li key={c.id}>
                        <button type="button" className="vta-concepto" onClick={() => setEscogido(c)}>
                          <span className="pz-renglon__cuerpo">
                            <span className="pz-renglon__titulo">{c.nombre}</span>
                            <span className="pz-renglon__pie">
                              {c.telefono ?? c.correo ?? 'Sin contacto'}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}

              <label className="pz-campo pz-campo--bloque">
                <span className="tt-etiqueta">…o a un número suelto</span>
                <input
                  className="msj-campo__linea"
                  autoComplete="off"
                  placeholder="Teléfono o correo"
                  value={suelto}
                  onChange={(e) => setSuelto(e.target.value)}
                />
                <span className="tt-secundario">
                  Si ese número ya es de un cliente, la conversación se va a su historial. No se crea
                  otra ficha.
                </span>
              </label>

              <button type="button" className="pz-boton" onClick={onCrearCliente}>
                <Icono nombre="personaMas" lado={16} /> Dar de alta un cliente
              </button>
            </>
          )}
        </div>

        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Por dónde</span>
          <select value={canalId} onChange={(e) => setCanalId(e.target.value)}>
            <option value="">Sin canal</option>
            {canales.map((c) => (
              <option key={c.id} value={c.id}>
                {COMO_SE_DICE_EL_CANAL[c.tipo]} · {c.nombre}
                {c.estado === 'conectado' ? '' : ' (sin conectar)'}
              </option>
            ))}
          </select>
        </label>

        {plantillas.filter((p) => p.activa).length > 0 ? (
          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Partir de una plantilla</span>
            <select
              value=""
              onChange={(e) => {
                const p = plantillas.find((x) => x.id === e.target.value);
                if (p) usarPlantilla(p);
              }}
            >
              <option value="">Escribir desde cero</option>
              {plantillas.filter((p) => p.activa).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
        ) : null}

        {/* LO QUE NO SE PUDO RELLENAR SE DICE, y la variable se queda escrita en
            el cuadro. Sustituirla por vacío mandaría "Hola , te esperamos el ."
            sin que nadie se entere hasta que el cliente pregunte. */}
        {faltantes.length > 0 ? (
          <div className="pz-aviso" role="status">
            <p>
              No se pudo rellenar: <strong>{faltantes.join(', ')}</strong>. Quedan escritas en el
              texto — cámbialas a mano antes de mandar.
            </p>
          </div>
        ) : null}

        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Mensaje *</span>
          <textarea
            className="msj-campo__texto msj-campo__texto--alto"
            rows={4}
            placeholder="Lo que le quieres decir"
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
          />
        </label>

        {canal && canal.estado !== 'conectado' ? (
          <p className="tt-secundario">
            Ese canal no está conectado: el mensaje se guarda en el historial y queda «Sin enviar».
          </p>
        ) : null}

        {error ? <p className="pz-error__detalle" role="alert">{error}</p> : null}

        <div className="pz-acciones">
          <button type="button" className="pz-boton" onClick={onCerrar}>Cancelar</button>
          <button
            type="button"
            className="pz-boton pz-boton--principal"
            disabled={trabajando || !listo}
            onClick={() =>
              onEnviar({
                clienteId: escogido?.id ?? null,
                contacto: contacto.trim(),
                canalId: canalId || null,
                cuerpo: cuerpo.trim(),
              })}
          >
            {trabajando ? 'Guardando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
