/**
 * EL CARRITO — buscador de conceptos y renglones.
 *
 * UNA SOLA VENTA CON VARIOS RENGLONES, no tres ventas. Un servicio, dos
 * productos y un curso son una operacion: partirla en tres rompe el ticket, el
 * corte de caja y el historial del cliente.
 *
 * EL BUSCADOR PIDE LOS TRES CATALOGOS A LA VEZ. Ventas no mantiene los suyos:
 * mantener `salesProducts[]` obligaria a sincronizarlo con Productos, y el dia
 * que fallara se venderia algo que ya no existe.
 *
 * SOLO SE OFRECE LO VENDIBLE, y con cuantos quedan. Ofrecer un producto
 * agotado hace que el rechazo llegue al final, cuando el cliente ya sacó la
 * cartera.
 */

import { formatearDinero } from '../datos/moneda.js';
import type {
  ConceptoVendible,
  RenglonDelCarrito,
  TipoDeConcepto,
} from '../datos/ventas.js';
import { COMO_SE_DICE_EL_TIPO, importeDelRenglon, puedeSubir } from '../datos/ventas.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

const ICONO_DEL_TIPO: Readonly<Record<TipoDeConcepto, NombreDeIcono>> = {
  servicio: 'bolsa',
  producto: 'paquete',
  curso: 'birrete',
};

export const FILTROS_DE_TIPO: readonly { clave: string; etiqueta: string }[] = [
  { clave: '', etiqueta: 'Todos' },
  { clave: 'servicio', etiqueta: 'Servicios' },
  { clave: 'producto', etiqueta: 'Productos' },
  { clave: 'curso', etiqueta: 'Cursos' },
];

/** Como se dice cuantos quedan. `null` = sin límite, y no se dice nada. */
export function comoSeDiceLoQueQueda(c: ConceptoVendible): string {
  if (c.disponible === null) return '';
  if (c.disponible <= 0) return 'Agotado';
  return `Quedan ${c.disponible}`;
}

/** Si ese concepto se puede agregar al carrito. */
export function sePuedeAgregar(c: ConceptoVendible, yaEnElCarrito: number): boolean {
  if (c.disponible === null) return true;
  return yaEnElCarrito < c.disponible;
}

export interface PropiedadesDelCarrito {
  readonly renglones: readonly RenglonDelCarrito[];
  readonly catalogo: readonly ConceptoVendible[];
  readonly busqueda: string;
  readonly tipo: string;
  readonly notas: string;
  readonly notaAbierta: boolean;
  readonly cargando: boolean;
  readonly error: string | null;
  onBuscar(texto: string): void;
  onTipo(t: string): void;
  onAgregar(c: ConceptoVendible): void;
  onCantidad(indice: number, cantidad: number): void;
  onDescuento(indice: number, centavos: number): void;
  onQuitar(indice: number): void;
  onNotas(texto: string): void;
  onAbrirNota(): void;
}

export function Carrito({
  renglones,
  catalogo,
  busqueda,
  tipo,
  notas,
  notaAbierta,
  cargando,
  error,
  onBuscar,
  onTipo,
  onAgregar,
  onCantidad,
  onDescuento,
  onQuitar,
  onNotas,
  onAbrirNota,
}: PropiedadesDelCarrito) {
  const enElCarrito = (id: string): number =>
    renglones.filter((r) => r.id === id).reduce((n, r) => n + r.cantidad, 0);

  return (
    <section className="pz-tarjeta" aria-labelledby="vta-carrito-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="vta-carrito-titulo">
          Agregar productos, servicios o cursos
        </h3>
      </header>

      <div className="vta-buscar">
        <div className="pz-buscador">
          <span className="pz-buscador__lupa" aria-hidden="true">
            <Icono nombre="lupa" lado={16} />
          </span>
          {/* SIEMPRE pintado, en el mismo lugar del arbol: es lo que sostiene
              el foco mientras la lista de abajo cambia. */}
          <input
            type="search"
            className="pz-buscador__campo"
            autoComplete="off"
            placeholder="Buscar por nombre o código…"
            aria-label="Buscar servicio, producto o curso"
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
          />
        </div>
        <div className="vta-tipos" role="group" aria-label="Filtrar por tipo">
          {FILTROS_DE_TIPO.map((f) => (
            <button
              key={f.clave || 'todos'}
              type="button"
              className={`vta-tipo${tipo === f.clave ? ' vta-tipo--puesto' : ''}`}
              aria-pressed={tipo === f.clave}
              onClick={() => onTipo(f.clave)}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar el catálogo.</p>
          <p className="pz-error__detalle">{error}</p>
        </div>
      ) : busqueda || tipo ? (
        cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <span className="neron-solo-lectores">Buscando</span>
            <div className="pz-silueta" />
          </div>
        ) : catalogo.length === 0 ? (
          <p className="pz-vacio__texto">
            Nada coincide. Los servicios, productos y cursos se dan de alta en su propio módulo.
          </p>
        ) : (
          <ul className="vta-catalogo">
            {catalogo.slice(0, 8).map((c) => {
              const puede = sePuedeAgregar(c, enElCarrito(c.id));
              return (
                <li key={`${c.tipo}:${c.id}`}>
                  <button
                    type="button"
                    className="vta-concepto"
                    disabled={!puede}
                    onClick={() => onAgregar(c)}
                  >
                    <span className="pz-ficha" aria-hidden="true">
                      <Icono nombre={ICONO_DEL_TIPO[c.tipo]} lado={18} />
                    </span>
                    <span className="pz-renglon__cuerpo">
                      <span className="pz-renglon__titulo">{c.nombre}</span>
                      <span className="pz-renglon__pie">
                        {COMO_SE_DICE_EL_TIPO[c.tipo]}
                        {c.codigo ? ` · ${c.codigo}` : ''}
                        {/* CUANTOS QUEDAN, aqui y no al final: el rechazo
                            despues de sacar la cartera es el peor momento. */}
                        {comoSeDiceLoQueQueda(c) ? ` · ${comoSeDiceLoQueQueda(c)}` : ''}
                      </span>
                    </span>
                    <span className="vta-concepto__precio">
                      {formatearDinero(c.precioCentavos)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {renglones.length === 0 ? (
        <div className="pz-vacio pz-vacio--chico">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="bolsa" lado={36} />
          </span>
          <p className="pz-vacio__texto">
            Busca arriba lo que se lleva. Puedes mezclar servicios, productos y cursos en una
            misma venta.
          </p>
        </div>
      ) : (
        <div className="pz-tabla__marco">
          <table className="pz-tabla">
            <thead>
              <tr>
                <th>Producto / Servicio / Curso</th>
                <th>Tipo</th>
                <th className="pz-tabla__numero">Precio</th>
                <th>Cantidad</th>
                <th className="pz-tabla__numero">Descuento</th>
                <th className="pz-tabla__numero">Total</th>
                <th className="pz-tabla__acciones">Quitar</th>
              </tr>
            </thead>
            <tbody>
              {renglones.map((r, i) => (
                <tr key={`${r.tipo}:${r.id}:${i}`}>
                  <td>
                    <span className="pz-renglon">
                      <span className="pz-ficha" aria-hidden="true">
                        <Icono nombre={ICONO_DEL_TIPO[r.tipo]} lado={18} />
                      </span>
                      <span className="pz-renglon__titulo">{r.nombre}</span>
                    </span>
                  </td>
                  <td>
                    <span className={`pz-pastilla vta-tipo--${r.tipo}`}>
                      {COMO_SE_DICE_EL_TIPO[r.tipo]}
                    </span>
                  </td>
                  <td className="pz-tabla__numero">{formatearDinero(r.precioCentavos)}</td>
                  <td>
                    <span className="vta-cantidad">
                      <button
                        type="button"
                        className="pz-pagina"
                        aria-label={`Quitar uno de ${r.nombre}`}
                        disabled={r.cantidad <= 1}
                        onClick={() => onCantidad(i, r.cantidad - 1)}
                      >
                        −
                      </button>
                      <span className="vta-cantidad__valor">{r.cantidad}</span>
                      <button
                        type="button"
                        className="pz-pagina"
                        aria-label={`Agregar uno de ${r.nombre}`}
                        // No se deja pasar del stock: el rechazo al final, con
                        // el cliente enfrente, es el peor momento.
                        disabled={!puedeSubir(r)}
                        onClick={() => onCantidad(i, r.cantidad + 1)}
                      >
                        +
                      </button>
                    </span>
                  </td>
                  <td className="pz-tabla__numero">
                    <input
                      className="vta-descuento"
                      type="text"
                      inputMode="numeric"
                      aria-label={`Descuento de ${r.nombre}, en pesos`}
                      value={r.descuentoCentavos === 0 ? '' : String(r.descuentoCentavos / 100)}
                      onChange={(e) =>
                        onDescuento(i, Number(e.target.value.replace(/[^\d]/g, '') || 0) * 100)
                      }
                      placeholder="0"
                    />
                  </td>
                  <td className="pz-tabla__numero">
                    <strong>{formatearDinero(importeDelRenglon(r))}</strong>
                  </td>
                  <td className="pz-tabla__acciones">
                    <button
                      type="button"
                      className="pz-icono-boton"
                      aria-label={`Quitar ${r.nombre} de la venta`}
                      onClick={() => onQuitar(i)}
                    >
                      <Icono nombre="archivar" lado={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LA NOTA VIVE EN LA VENTA, no en el navegador. Guardarla en
          localStorage la perderia al cambiar de equipo — y es justo donde se
          escribe "pendiente de agendar" o "pago en dos partes". */}
      {notaAbierta || notas ? (
        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Nota de la venta</span>
          <textarea
            className="vta-nota"
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => onNotas(e.target.value)}
            placeholder="Lo que haya que recordar de esta venta"
          />
        </label>
      ) : (
        <div className="vta-nota__pie">
          <button type="button" className="pz-boton" onClick={onAbrirNota}>
            <Icono nombre="mas" lado={16} /> Agregar nota a la venta
            <Icono nombre="nota" lado={16} />
          </button>
        </div>
      )}
    </section>
  );
}
