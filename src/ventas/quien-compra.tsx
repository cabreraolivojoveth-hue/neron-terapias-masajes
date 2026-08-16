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

import type { Fecha } from '@neron/base/utils';
import { formatearDinero } from '../datos/moneda.js';
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
  /**
   * Los ultimos que se dieron de alta, para no partir de una lista en blanco.
   *
   * SON CLIENTES DE VERDAD, los del propio centro: es la misma consulta de
   * siempre sin texto de busqueda. Un centro recien abierto no tiene ninguno y
   * entonces no se enseña nada — no se rellena con nadie inventado.
   */
  readonly recientes: readonly ClienteEnLista[];
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

/**
 * La lista de clientes que se puede tocar.
 *
 * Es la MISMA para lo encontrado y para los recientes, a proposito: si fueran
 * dos, una se quedaria sin el telefono debajo del nombre el dia que se cambie
 * la otra — y el telefono es justo lo que distingue a dos personas que se
 * llaman igual.
 */
function ListaDeClientesEncontrados({
  clientes,
  onEscoger,
}: {
  readonly clientes: readonly ClienteEnLista[];
  onEscoger(c: ClienteEnLista): void;
}) {
  return (
    <ul className="vta-encontrados">
      {clientes.map((c) => (
        <li key={c.id}>
          <button type="button" className="vta-concepto" onClick={() => onEscoger(c)}>
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
  );
}

export function QuienCompra({
  clienteId,
  clienteNombre,
  busqueda,
  encontrados,
  recientes,
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
    <section className="pz-tarjeta vta-quien" aria-label="Cliente, fecha y vendedor">
      <div className="vta-quien__campo">
        <span className="tt-etiqueta" id="vta-cliente-titulo">
          Cliente
        </span>
        {clienteId ? (
          <div className="vta-escogido">
            <span className="pz-ficha" aria-hidden="true">
              <Icono nombre="persona" lado={16} />
            </span>
            <span className="pz-renglon__titulo">{clienteNombre}</span>
            <button
              type="button"
              className="pz-icono-boton"
              aria-label={`Quitar a ${clienteNombre} de la venta`}
              onClick={onQuitarCliente}
            >
              ×
            </button>
          </div>
        ) : (
          <div className="vta-buscar-cliente">
            <div className="pz-buscador">
              <span className="pz-buscador__lupa" aria-hidden="true">
                <Icono nombre="persona" lado={16} />
              </span>
              {/* SIEMPRE en el mismo lugar del arbol: es lo que sostiene el
                  foco mientras la lista de abajo cambia con cada letra. */}
              <input
                type="search"
                className="pz-buscador__campo"
                autoComplete="off"
                placeholder="Buscar cliente…"
                aria-labelledby="vta-cliente-titulo"
                value={busqueda}
                onChange={(e) => onBuscarCliente(e.target.value)}
              />
            </div>
            {busqueda ? (
              buscando ? (
                <div className="pz-cargando" aria-busy="true">
                  <span className="neron-solo-lectores">Buscando clientes</span>
                  <div className="pz-silueta" />
                </div>
              ) : encontrados.length === 0 ? (
                <p className="pz-vacio__texto">
                  Nadie coincide.{' '}
                  {puedeCrearCliente
                    ? 'Puedes darlo de alta sin salir de la venta.'
                    : 'Los pacientes se dan de alta en Clientes.'}
                </p>
              ) : (
                <ListaDeClientesEncontrados
                  clientes={encontrados.slice(0, 6)}
                  onEscoger={onEscogerCliente}
                />
              )
            ) : recientes.length > 0 ? (
              /*
               * SIN ESCRIBIR NADA YA HAY A QUIEN TOCAR.
               *
               * El buscador arrancaba en blanco, asi que atender a alguien que
               * acaba de venir obligaba a teclear su nombre entero cada vez.
               * Con los ultimos a la vista, el caso mas comun —el paciente de
               * hace un rato, el que se acaba de dar de alta— es un toque.
               *
               * Se enseñan TRES. Con mas, la lista tapa el resto del formulario
               * y deja de ser un atajo para volverse otra cosa que leer.
               */
              <>
                <span className="tt-etiqueta">Clientes recientes</span>
                <ListaDeClientesEncontrados
                  clientes={recientes.slice(0, 3)}
                  onEscoger={onEscogerCliente}
                />
              </>
            ) : null}
            {puedeCrearCliente ? (
              <button type="button" className="pz-boton" onClick={onNuevoCliente}>
                <Icono nombre="personaMas" lado={16} /> Nuevo cliente
              </button>
            ) : null}
          </div>
        )}
        {/* VENDER SIN CLIENTE ES VALIDO. Se dice, para que nadie invente uno. */}
        {!clienteId ? (
          <span className="tt-secundario">
            Sin cliente es una venta de mostrador. Los cursos sí necesitan a quién inscribir.
          </span>
        ) : null}
      </div>

      <label className="vta-quien__campo">
        <span className="tt-etiqueta">Fecha</span>
        <span className="vta-fecha">
          <span className="pz-ficha" aria-hidden="true">
            <Icono nombre="calendario" lado={16} />
          </span>
          <input
            type="date"
            className="vta-fecha__campo"
            value={aValorDeCampo(fecha)}
            onChange={(e) => onFecha(deValorDeCampo(e.target.value, fecha))}
          />
        </span>
        <span className="tt-secundario">{fechaLarga(fecha)}</span>
      </label>

      <label className="vta-quien__campo">
        <span className="tt-etiqueta">Vendedor</span>
        <span className="pz-campo pz-campo--bloque">
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
          <span className="tt-secundario">
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
    <section className="pz-tarjeta" aria-labelledby="vta-cliente-panel">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="vta-cliente-panel">
          Información del cliente
        </h3>
        {expediente && puedeEditar ? (
          <button type="button" className="pz-enlace" onClick={onEditar}>
            <Icono nombre="lapiz" lado={14} /> Editar
          </button>
        ) : null}
      </header>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el expediente</span>
          <div className="pz-silueta" />
        </div>
      ) : !expediente ? (
        <div className="pz-vacio pz-vacio--chico">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="persona" lado={32} />
          </span>
          <p className="pz-vacio__texto">
            Escoge un cliente para ver su ficha. Sin cliente la venta se cobra igual, como venta de
            mostrador.
          </p>
        </div>
      ) : (
        <div className="pz-columna">
          <div className="pz-columna">
            <span className="pz-inicial" aria-hidden="true">
              {expediente.nombre.trim().charAt(0).toUpperCase()}
            </span>
            <span className="pz-renglon__cuerpo">
              <span className="pz-renglon__titulo">{expediente.nombre}</span>
              <span className={`pz-pastilla pz-pastilla--${expediente.archivado ? 'archivado' : 'activo'}`}>
                {etiquetaDeEstadoDeCliente(expediente.archivado ? 'archivado' : 'activo')}
              </span>
            </span>
          </div>

          <p className="pz-dato__valor">
            <Icono nombre="mensaje" lado={14} />{' '}
            {expediente.telefono ?? <span className="tt-falta">Sin teléfono</span>}
          </p>
          <p className="pz-dato__valor">
            <Icono nombre="nota" lado={14} />{' '}
            {expediente.correo ?? <span className="tt-falta">Sin correo</span>}
          </p>

          {/*
            AQUI NO VA "SALDO A FAVOR". El diseño lo enseña, pero el sistema no
            tiene todavia un libro de creditos: un numero de saldo sin
            movimientos que lo expliquen es dinero que aparece de la nada y que
            nadie puede auditar. Lo que si existe —lo que lleva gastado y lo
            que debe— sale de sus ventas, y eso si se puede rastrear.
          */}
          <dl className="pz-tres">
            <div className="pz-dato">
              <dt className="tt-pie">Compras</dt>
              <dd className="tt-dato">{expediente.compras}</dd>
            </div>
            <div className="pz-dato">
              <dt className="tt-pie">Gastado</dt>
              <dd className="tt-dato">
                {formatearDinero(expediente.totalGastado)}
              </dd>
            </div>
            <div className="pz-dato">
              <dt className="tt-pie">Visitas</dt>
              <dd className="tt-dato">{expediente.visitas}</dd>
            </div>
          </dl>

          {expediente.adeudo > 0 ? (
            <p className="pz-pastilla pz-pastilla--peligro">Debe {formatearDinero(expediente.adeudo)}</p>
          ) : null}

          <button type="button" className="pz-boton pz-boton--ancho" onClick={onVerExpediente}>
            Ver expediente completo
          </button>
        </div>
      )}
    </section>
  );
}
