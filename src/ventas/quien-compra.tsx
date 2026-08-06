/**
 * QUIEN COMPRA, CUANDO, Y QUIEN COBRA.
 *
 * EL CLIENTE SE ESCOGE, NO SE ESCRIBE. Ventas no guarda ni un nombre: guarda
 * `cliente_id`. El dia que esa persona se cambie el apellido, todos los
 * tickets viejos lo dicen al dia sin tocar nada — y no hay forma de que
 * queden dos fichas de la misma persona porque alguien la volvio a teclear.
 *
 * SE PUEDE VENDER SIN CLIENTE. Una venta de mostrador no obliga a inventar un
 * "Cliente general": el campo se queda vacio y ya. La UNICA excepcion es el
 * curso, porque una inscripcion sin persona deja un lugar ocupado por nadie —
 * y eso lo exige el servidor, no esta pantalla.
 *
 * LO QUE SE VE DEL CLIENTE SALE DE SU EXPEDIENTE, no de aqui: visitas,
 * compras, lo que lleva gastado. Copiar esas cifras a Ventas es como empiezan
 * los numeros que no cuadran entre dos pantallas.
 */

import { formatearMoneda } from '@neron/base/utils';
import type { Fecha } from '@neron/base/utils';
import type { ProfesionalBreve } from '../datos/citas.js';
import type { ClienteEnLista, ExpedienteDeCliente } from '../datos/clientes.js';
import { etiquetaDeEstadoDeCliente } from '../datos/clientes.js';
import { fechaLarga } from '../ui/fechas-en-palabras.js';
import { Icono } from '../ui/iconos.js';

export interface PropiedadesDeQuienCompra {
  readonly clienteId: string;
  readonly clienteNombre: string;
  readonly busqueda: string;
  readonly encontrados: readonly ClienteEnLista[];
  readonly buscando: boolean;
  readonly fecha: Fecha;
  readonly vendedorId: string;
  readonly vendedores: readonly ProfesionalBreve[];
  readonly puedeCambiarVendedor: boolean;
  readonly puedeCrearCliente: boolean;
  onBuscarCliente(texto: string): void;
  onEscogerCliente(c: ClienteEnLista): void;
  onQuitarCliente(): void;
  onNuevoCliente(): void;
  onFecha(f: Fecha): void;
  onVendedor(id: string): void;
}

export function QuienCompra({
  clienteId,
  clienteNombre,
  busqueda,
  encontrados,
  buscando,
  fecha,
  vendedorId,
  vendedores,
  puedeCambiarVendedor,
  puedeCrearCliente,
  onBuscarCliente,
  onEscogerCliente,
  onQuitarCliente,
  onNuevoCliente,
  onFecha,
  onVendedor,
}: PropiedadesDeQuienCompra) {
  return (
    <section className="cli-panel vta-quien" aria-label="Cliente, fecha y vendedor">
      <div className="vta-quien__campo">
        <span className="cli-campo__etiqueta" id="vta-cliente-titulo">
          Cliente
        </span>
        {clienteId ? (
          <div className="vta-escogido">
            <span className="cli-exp__renglon-icono" aria-hidden="true">
              <Icono nombre="persona" lado={16} />
            </span>
            <span className="cli-persona__nombre">{clienteNombre}</span>
            <button
              type="button"
              className="cli-menu__boton"
              aria-label={`Quitar a ${clienteNombre} de la venta`}
              onClick={onQuitarCliente}
            >
              ×
            </button>
          </div>
        ) : (
          <div className="vta-buscar-cliente">
            <div className="cli-buscador">
              <span className="cli-buscador__lupa" aria-hidden="true">
                <Icono nombre="persona" lado={16} />
              </span>
              {/* SIEMPRE en el mismo lugar del arbol: es lo que sostiene el
                  foco mientras la lista de abajo cambia con cada letra. */}
              <input
                type="search"
                className="cli-buscador__campo"
                autoComplete="off"
                placeholder="Buscar cliente…"
                aria-labelledby="vta-cliente-titulo"
                value={busqueda}
                onChange={(e) => onBuscarCliente(e.target.value)}
              />
            </div>
            {busqueda ? (
              buscando ? (
                <div className="cli-cargando" aria-busy="true">
                  <span className="neron-solo-lectores">Buscando clientes</span>
                  <div className="terapias-silueta cli-cargando__renglon" />
                </div>
              ) : encontrados.length === 0 ? (
                <p className="cli-vacio__texto">
                  Nadie coincide.{' '}
                  {puedeCrearCliente
                    ? 'Puedes darlo de alta sin salir de la venta.'
                    : 'Los pacientes se dan de alta en Clientes.'}
                </p>
              ) : (
                <ul className="vta-encontrados">
                  {encontrados.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="vta-concepto"
                        onClick={() => onEscogerCliente(c)}
                      >
                        <span className="srv-nombre">
                          <span className="cli-persona__nombre">{c.nombre}</span>
                          <span className="srv-descripcion">
                            {c.telefono ?? c.correo ?? 'Sin contacto'}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
            {puedeCrearCliente ? (
              <button type="button" className="cli-boton-suave" onClick={onNuevoCliente}>
                <Icono nombre="personaMas" lado={16} /> Nuevo cliente
              </button>
            ) : null}
          </div>
        )}
        {/* VENDER SIN CLIENTE ES VALIDO. Se dice, para que nadie invente uno. */}
        {!clienteId ? (
          <span className="cli-exp__secundario">
            Sin cliente es una venta de mostrador. Los cursos sí necesitan a quién inscribir.
          </span>
        ) : null}
      </div>

      <label className="vta-quien__campo">
        <span className="cli-campo__etiqueta">Fecha</span>
        <span className="vta-fecha">
          <span className="cli-exp__renglon-icono" aria-hidden="true">
            <Icono nombre="calendario" lado={16} />
          </span>
          <input
            type="date"
            className="vta-fecha__campo"
            value={aValorDeCampo(fecha)}
            onChange={(e) => onFecha(deValorDeCampo(e.target.value, fecha))}
          />
        </span>
        <span className="cli-exp__secundario">{fechaLarga(fecha)}</span>
      </label>

      <label className="vta-quien__campo">
        <span className="cli-campo__etiqueta">Vendedor</span>
        <span className="cli-campo cli-campo--bloque">
          <select
            aria-label="Vendedor de la venta"
            value={vendedorId}
            disabled={!puedeCambiarVendedor}
            onChange={(e) => onVendedor(e.target.value)}
          >
            <option value="">Sin vendedor</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        </span>
        {/* QUIEN NO PUEDE CAMBIARLO VE POR QUE, en vez de un campo muerto. */}
        {!puedeCambiarVendedor ? (
          <span className="cli-exp__secundario">
            La venta queda a tu nombre. Cambiar de vendedor es de quien administra.
          </span>
        ) : null}
      </label>
    </section>
  );
}

/** `dd/mm/aaaa` → `aaaa-mm-dd`, que es lo que entiende un campo de fecha. */
export function aValorDeCampo(fecha: Fecha): string {
  const [d, m, a] = fecha.split('/');
  if (!d || !m || !a) return '';
  return `${a}-${m}-${d}`;
}

/** Lo que devuelve el campo → `dd/mm/aaaa`. Vacio conserva la que habia. */
export function deValorDeCampo(valor: string, anterior: Fecha): Fecha {
  const [a, m, d] = valor.split('-');
  if (!a || !m || !d) return anterior;
  return `${d}/${m}/${a}`;
}

/* ------------------------------------------------------------------ */
/* El panel de arriba a la derecha                                     */
/* ------------------------------------------------------------------ */

export interface PropiedadesDeInformacionDelCliente {
  readonly expediente: ExpedienteDeCliente | null;
  readonly cargando: boolean;
  readonly puedeEditar: boolean;
  onEditar(): void;
  onVerExpediente(): void;
}

export function InformacionDelCliente({
  expediente,
  cargando,
  puedeEditar,
  onEditar,
  onVerExpediente,
}: PropiedadesDeInformacionDelCliente) {
  return (
    <section className="cli-panel" aria-labelledby="vta-cliente-panel">
      <header className="cli-panel__barra">
        <h3 className="cli-panel__titulo" id="vta-cliente-panel">
          Información del cliente
        </h3>
        {expediente && puedeEditar ? (
          <button type="button" className="cli-panel__enlace" onClick={onEditar}>
            <Icono nombre="lapiz" lado={14} /> Editar
          </button>
        ) : null}
      </header>

      {cargando ? (
        <div className="cli-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el expediente</span>
          <div className="terapias-silueta cli-cargando__renglon" />
        </div>
      ) : !expediente ? (
        <div className="cli-vacio cli-vacio--chico">
          <span className="cli-vacio__icono" aria-hidden="true">
            <Icono nombre="persona" lado={32} />
          </span>
          <p className="cli-vacio__texto">
            Escoge un cliente para ver su ficha. Sin cliente la venta se cobra igual, como venta de
            mostrador.
          </p>
        </div>
      ) : (
        <div className="cli-exp">
          <div className="vta-quien-es">
            <span className="cli-persona__inicial" aria-hidden="true">
              {expediente.nombre.trim().charAt(0).toUpperCase()}
            </span>
            <span className="srv-nombre">
              <span className="cli-persona__nombre">{expediente.nombre}</span>
              <span className={`cli-estado cli-estado--${expediente.archivado ? 'archivado' : 'activo'}`}>
                {etiquetaDeEstadoDeCliente(expediente.archivado ? 'archivado' : 'activo')}
              </span>
            </span>
          </div>

          <p className="cli-exp__valor">
            <Icono nombre="mensaje" lado={14} />{' '}
            {expediente.telefono ?? <span className="cli-falta">Sin teléfono</span>}
          </p>
          <p className="cli-exp__valor">
            <Icono nombre="nota" lado={14} />{' '}
            {expediente.correo ?? <span className="cli-falta">Sin correo</span>}
          </p>

          {/*
            AQUI NO VA "SALDO A FAVOR". El diseño lo enseña, pero el sistema no
            tiene todavia un libro de creditos: un numero de saldo sin
            movimientos que lo expliquen es dinero que aparece de la nada y que
            nadie puede auditar. Lo que si existe —lo que lleva gastado y lo
            que debe— sale de sus ventas, y eso si se puede rastrear.
          */}
          <dl className="cli-exp__cuentas">
            <div className="cli-exp__cuenta">
              <dt className="cli-exp__cuenta-que">Compras</dt>
              <dd className="cli-exp__cuenta-numero">{expediente.compras}</dd>
            </div>
            <div className="cli-exp__cuenta">
              <dt className="cli-exp__cuenta-que">Gastado</dt>
              <dd className="cli-exp__cuenta-numero">
                {formatearMoneda(expediente.totalGastado)}
              </dd>
            </div>
            <div className="cli-exp__cuenta">
              <dt className="cli-exp__cuenta-que">Visitas</dt>
              <dd className="cli-exp__cuenta-numero">{expediente.visitas}</dd>
            </div>
          </dl>

          {expediente.adeudo > 0 ? (
            <p className="cli-exp__adeudo">Debe {formatearMoneda(expediente.adeudo)}</p>
          ) : null}

          <button type="button" className="cli-boton-suave cli-boton-suave--ancho" onClick={onVerExpediente}>
            Ver expediente completo
          </button>
        </div>
      )}
    </section>
  );
}
