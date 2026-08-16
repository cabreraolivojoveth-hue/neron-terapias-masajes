/**
 * LOS CANALES: por dónde se habla con el cliente.
 *
 * ESTA PANTALLA DECLARA CANALES; NO LOS CONECTA. Y la diferencia es todo el
 * archivo.
 *
 * Conectar WhatsApp Business de verdad son cuatro cosas que no viven en un
 * navegador: una cuenta aprobada por Meta, un token permanente que NO puede
 * viajar al navegador —quien abra la consola lo lee y manda mensajes en nombre
 * del centro—, un servidor que llame a la API de envío, y una dirección pública
 * a la que Meta entregue los mensajes entrantes por webhook.
 *
 * ESTE PRODUCTO NO TIENE SERVIDOR. Es una aplicación de navegador contra
 * Supabase, publicada en Vercel: no hay ni una función de servidor donde
 * guardar ese token ni donde recibir ese webhook. Así que aquí un canal nace
 * "Sin conectar" y no hay forma de marcarlo conectado desde la pantalla.
 *
 * POR QUE NO SE FINGE: un canal que se dice conectado sin serlo hace que cada
 * envío falle, y la culpa parece del mensaje o del número del cliente. Se
 * buscaría el problema en el sitio equivocado durante horas. Diciendo la
 * verdad, lo que se escribe se guarda en el historial —que es lo que de verdad
 * hace falta— y se dice con todas sus letras que no le llega a nadie.
 *
 * QUE FALTA, EXACTAMENTE, para que esto envíe de verdad: está escrito abajo en
 * la propia pantalla, para que no haya que buscarlo en un archivo.
 */

import { useState } from 'react';
import type { CanalDeMensajes, TipoDeCanal } from '../datos/mensajes.js';
import { COMO_SE_DICE_EL_CANAL, COMO_SE_DICE_EL_ESTADO_DEL_CANAL } from '../datos/mensajes.js';
import { Modal } from '../ui/modal.js';
import { Icono } from '../ui/iconos.js';

export const CANAL_VACIO = {
  tipo: 'whatsapp' as TipoDeCanal,
  nombre: '',
  identificador: '',
  activo: true,
};

export type DatosDeCanal = typeof CANAL_VACIO;

/** Lo que hace falta para que un canal pueda enviar de verdad, por tipo. */
export const LO_QUE_FALTA: Readonly<Record<TipoDeCanal, string>> = {
  whatsapp:
    'Una cuenta de WhatsApp Business aprobada, su token permanente guardado EN UN SERVIDOR ' +
    '(nunca en el navegador) y una dirección pública donde Meta entregue los mensajes entrantes.',
  sms: 'Una cuenta con un proveedor de SMS y su llave guardada en un servidor.',
  correo: 'Un remitente verificado y la llave del proveedor de correo, en un servidor.',
  // El manual no necesita nada: es el único que ya funciona entero.
  manual: 'Nada. Sirve para dejar por escrito lo que se habló por teléfono o en el mostrador.',
};

export interface PropiedadesDeCanales {
  readonly abierto: boolean;
  readonly canales: readonly CanalDeMensajes[];
  readonly cargando: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(id: string | null, datos: DatosDeCanal): void;
  onCerrar(): void;
}

export function AdministrarCanales({
  abierto,
  canales,
  cargando,
  trabajando,
  error,
  onGuardar,
  onCerrar,
}: PropiedadesDeCanales) {
  const [editando, setEditando] = useState<{ id: string | null; datos: DatosDeCanal } | null>(null);

  return (
    <Modal abierto={abierto} titulo="Canales" ancho bloqueado={trabajando} onCerrar={onCerrar}>
      {editando ? (
        <div className="pz-columna">
          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Tipo</span>
            <select
              value={editando.datos.tipo}
              onChange={(e) =>
                setEditando((x) => (x
                  ? { ...x, datos: { ...x.datos, tipo: e.target.value as TipoDeCanal } }
                  : x))}
            >
              {(['whatsapp', 'sms', 'correo', 'manual'] as const).map((t) => (
                <option key={t} value={t}>{COMO_SE_DICE_EL_CANAL[t]}</option>
              ))}
            </select>
          </label>

          {/* LO QUE FALTA SE DICE AQUI, mientras se escoge. Enterarse después
              de guardar, al intentar enviar, es enterarse tarde. */}
          <div className="pz-aviso">
            <p>
              <strong>Para que este canal envíe de verdad hace falta:</strong>{' '}
              {LO_QUE_FALTA[editando.datos.tipo]}
            </p>
            {editando.datos.tipo !== 'manual' ? (
              <p className="tt-secundario">
                Este producto todavía no tiene servidor, así que el canal queda declarado y{' '}
                <em>Sin conectar</em>. Lo que se escriba se guarda en el historial del cliente.
              </p>
            ) : null}
          </div>

          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Nombre *</span>
            <input
              className="msj-campo__linea"
              autoComplete="off"
              placeholder="Cómo lo vas a reconocer"
              value={editando.datos.nombre}
              onChange={(e) =>
                setEditando((x) => (x ? { ...x, datos: { ...x.datos, nombre: e.target.value } } : x))}
            />
          </label>

          <label className="pz-campo pz-campo--bloque">
            <span className="tt-etiqueta">Número o cuenta</span>
            <input
              className="msj-campo__linea"
              autoComplete="off"
              placeholder="El que ve el cliente"
              value={editando.datos.identificador}
              onChange={(e) =>
                setEditando((x) => (x
                  ? { ...x, datos: { ...x.datos, identificador: e.target.value } }
                  : x))}
            />
            {/* Se dice qué NO va aquí. Es la clase de campo donde alguien pega
                un token porque parece el sitio. */}
            <span className="tt-secundario">
              Solo lo que es público. Las llaves y los tokens no se guardan aquí: esta tabla la lee
              el navegador.
            </span>
          </label>

          {error ? <p className="pz-error__detalle" role="alert">{error}</p> : null}

          <div className="pz-acciones">
            <button type="button" className="pz-boton" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="pz-boton pz-boton--principal"
              disabled={trabajando || editando.datos.nombre.trim() === ''}
              onClick={() => {
                onGuardar(editando.id, editando.datos);
                setEditando(null);
              }}
            >
              {trabajando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="pz-columna">
          <p className="pz-dato__valor">
            Un canal es por dónde le llegan los mensajes a tu cliente. Puedes declararlos desde ya;
            conectarlos de verdad necesita un servidor, y eso se explica al escoger el tipo.
          </p>

          {cargando ? (
            <div className="pz-cargando" aria-busy="true">
              <div className="pz-silueta pz-silueta--linea" />
            </div>
          ) : canales.length === 0 ? (
            <div className="pz-vacio pz-vacio--chico">
              <span className="pz-vacio__icono" aria-hidden="true">
                <Icono nombre="telefono" lado={22} />
              </span>
              <p className="pz-vacio__texto">
                No hay canales conectados. Conecta un canal para comenzar a recibir mensajes.
              </p>
            </div>
          ) : (
            <ul className="pz-lista">
              {canales.map((c) => (
                <li key={c.id} className="pz-dato pz-dato--renglon">
                  <span className="pz-renglon__cuerpo">
                    <span className="pz-renglon__titulo">{c.nombre}</span>
                    <span className="pz-renglon__pie">
                      {COMO_SE_DICE_EL_CANAL[c.tipo]}
                      {c.identificador ? ` · ${c.identificador}` : ''}
                    </span>
                    {c.detalleError ? (
                      <span className="pz-error__detalle">{c.detalleError}</span>
                    ) : null}
                    <span className="pz-renglon__pie">
                      {c.ultimaSincronizacion
                        ? `Última sincronización: ${c.ultimaSincronizacion.slice(0, 10)}`
                        : 'Nunca ha sincronizado'}
                    </span>
                  </span>
                  <span
                    className={`pz-pastilla ${
                      c.estado === 'conectado' ? 'pz-pastilla--exito'
                        : c.estado === 'error' ? 'pz-pastilla--peligro' : 'pz-pastilla--aviso'
                    }`}
                  >
                    {COMO_SE_DICE_EL_ESTADO_DEL_CANAL[c.estado]}
                  </span>
                  <button
                    type="button"
                    className="pz-boton"
                    onClick={() =>
                      setEditando({
                        id: c.id,
                        datos: {
                          tipo: c.tipo, nombre: c.nombre,
                          identificador: c.identificador ?? '', activo: c.activo,
                        },
                      })}
                  >
                    Configurar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="pz-boton pz-boton--principal pz-boton--ancho"
            onClick={() => setEditando({ id: null, datos: { ...CANAL_VACIO } })}
          >
            <Icono nombre="mas" lado={16} /> Agregar canal
          </button>
        </div>
      )}
    </Modal>
  );
}
