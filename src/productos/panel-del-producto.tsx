/**
 * EL PANEL DE DETALLE DE UN PRODUCTO, con sus cuatro pestañas.
 *
 * · Informacion — lo que define el producto hoy.
 * · Inventario  — cuanto hay y POR QUE. La que justifica el modulo.
 * · Ventas      — con el precio HISTORICO, no con el de hoy.
 * · Proveedores — de donde llega.
 *
 * EL COSTO Y EL MARGEN SOLO A QUIEN PUEDE VERLOS. Llegan `null` desde la base
 * —no cero— y aqui se dice por que faltan, en vez de enseñar una raya que se
 * leeria como "no hay dato".
 */

import { formatearMoneda } from '@neron/base/utils';
import { useState, type ReactNode } from 'react';
import type { DatosDeAjuste, FichaDeProducto, ProveedorEnLista } from '../datos/productos.js';
import { COMO_SE_DICE_EL_STOCK, margenDe } from '../datos/productos.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { Pista } from '../ui/pista.js';
import { Movimientos } from './movimientos.js';
import { Proveedores } from './proveedores.js';

export type PestanaDeProducto = 'informacion' | 'inventario' | 'ventas' | 'proveedores';

const PESTANAS: readonly { clave: PestanaDeProducto; etiqueta: string }[] = [
  { clave: 'informacion', etiqueta: 'Información' },
  { clave: 'inventario', etiqueta: 'Inventario' },
  { clave: 'ventas', etiqueta: 'Ventas' },
  { clave: 'proveedores', etiqueta: 'Proveedores' },
];

/** Lo que dice la confirmacion de apagar, con el impacto real. */
export function loQuePasaAlApagarElProducto(f: FichaDeProducto | null): string {
  if (!f) return '';
  if (!f.activo) {
    return 'Volverá a ofrecerse al vender. Las ventas y los movimientos que ya existían no cambian.';
  }
  if (f.stockActual === 0) {
    return 'Dejará de ofrecerse al vender. No queda ninguna pieza en existencia.';
  }
  const cuantas =
    f.stockActual === 1 ? 'Queda 1 pieza' : `Quedan ${f.stockActual} piezas`;
  return `${cuantas} en existencia: no se pierden ni se dan de baja. Lo que cambia es que deja de ofrecerse en ventas NUEVAS.`;
}

function Renglon({
  icono,
  titulo,
  children,
}: {
  readonly icono: NombreDeIcono;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="pz-renglon pz-renglon--quieto">
      <span className="pz-ficha" aria-hidden="true">
        <Icono nombre={icono} lado={18} />
      </span>
      <div className="pz-dato">
        <span className="tt-etiqueta">{titulo}</span>
        <div className="pz-dato__valor">{children}</div>
      </div>
    </div>
  );
}

export interface PropiedadesDelPanelDeProducto {
  readonly ficha: FichaDeProducto | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly proveedores: readonly ProveedorEnLista[];
  readonly trabajando: boolean;
  readonly errorDeOperacion: string | null;
  onEditar(): void;
  onCambiarEstado(): void;
  onCerrar(): void;
  onAjustar(datos: DatosDeAjuste): void;
  onLigar(proveedorId: string, costo: number | null, codigo: string, preferido: boolean): void;
  onDesligar(id: string): void;
  onNuevoProveedor(): void;
  onAbrirVenta(ventaId: string): void;
}

export function PanelDelProducto({
  ficha,
  cargando,
  error,
  permisos,
  proveedores,
  trabajando,
  errorDeOperacion,
  onEditar,
  onCambiarEstado,
  onCerrar,
  onAjustar,
  onLigar,
  onDesligar,
  onNuevoProveedor,
  onAbrirVenta,
}: PropiedadesDelPanelDeProducto) {
  const [pestana, setPestana] = useState<PestanaDeProducto>('informacion');
  const puedeGestionar = permisos['gestionarInventario'] === true;

  if (!ficha && !cargando && !error) {
    return <Pista texto="Toca un producto para ver su ficha, sus movimientos, sus ventas y sus proveedores." icono="paquete" />;
  }

  const margen = ficha ? margenDe(ficha.precioCentavos, ficha.costoCentavos) : null;

  return (
    <aside className="pz-tarjeta srv-detalle" aria-label="Detalle del producto">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta">Detalle del producto</h3>
        <button
          type="button"
          className="srv-detalle__cerrar"
          onClick={onCerrar}
          aria-label="Cerrar el detalle"
        >
          ×
        </button>
      </header>

      {error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar el producto.</p>
          <p className="pz-error__detalle">{error}</p>
        </div>
      ) : cargando || !ficha ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el producto</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : (
        <>
          <div className="cur-cabecera">
            {ficha.imagenUrl ? (
              <img
                className="cur-cabecera__imagen"
                src={ficha.imagenUrl}
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="cur-cabecera__imagen cur-cabecera__imagen--vacia" aria-hidden="true">
                <Icono nombre="paquete" lado={36} />
              </span>
            )}
            <span className={`pz-pastilla prd-estado--${ficha.inventario} cur-cabecera__estado`}>
              {COMO_SE_DICE_EL_STOCK[ficha.inventario]}
            </span>
          </div>

          <div className="srv-detalle__quien">
            <span className="srv-detalle__nombre">{ficha.nombre}</span>
            {ficha.sku ? <span className="srv-detalle__lema">SKU: {ficha.sku}</span> : null}
          </div>

          <div className="pz-segmentos" role="tablist" aria-label="Secciones del producto">
            {PESTANAS.map((p) => (
              <button
                key={p.clave}
                type="button"
                role="tab"
                aria-selected={pestana === p.clave}
                className={`pz-segmento${pestana === p.clave ? ' pz-segmento--puesto' : ''}`}
                onClick={() => setPestana(p.clave)}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>

          {pestana === 'informacion' ? (
            <div className="srv-detalle__cuerpo">
              <Renglon icono="dinero" titulo="Precio de venta">
                {formatearMoneda(ficha.precioCentavos)}
              </Renglon>

              <Renglon icono="recibo" titulo="Costo">
                {/* `null` es "tu rol no ve costos", no "cuesta cero". */}
                {ficha.costoCentavos === null ? (
                  <span className="tt-falta">Tu rol no ve costos</span>
                ) : (
                  <>
                    {formatearMoneda(ficha.costoCentavos)}
                    {margen !== null ? (
                      <span className="tt-secundario"> · {margen}% de margen</span>
                    ) : null}
                  </>
                )}
              </Renglon>

              <Renglon icono="paquete" titulo="Stock actual">
                {ficha.stockActual} {ficha.unidad}
              </Renglon>

              <Renglon icono="alerta" titulo="Stock mínimo">
                {ficha.stockMinimo} {ficha.unidad}
              </Renglon>

              <Renglon icono="cuadricula" titulo="Categoría">
                {ficha.categoria ? (
                  <span
                    className="srv-categoria"
                    {...(ficha.categoriaColor
                      ? { style: { color: ficha.categoriaColor, borderColor: ficha.categoriaColor } }
                      : {})}
                  >
                    {ficha.categoria}
                  </span>
                ) : (
                  <span className="tt-falta">Sin categoría</span>
                )}
              </Renglon>

              <Renglon icono="bolsa" titulo="Proveedor principal">
                {ficha.proveedores.find((p) => p.preferido)?.nombre ?? (
                  <span className="tt-falta">Sin proveedor</span>
                )}
              </Renglon>

              <Renglon icono="renglones" titulo="Código de barras">
                {ficha.codigoBarras ?? <span className="tt-falta">Sin código</span>}
              </Renglon>

              <Renglon icono="lugar" titulo="Ubicación">
                {ficha.ubicacion ?? <span className="tt-falta">Sin ubicación</span>}
              </Renglon>

              <Renglon icono="nota" titulo="Descripción">
                {ficha.descripcion ? (
                  // Como TEXTO, nunca como HTML.
                  <p className="tt-libre">{ficha.descripcion}</p>
                ) : (
                  <span className="tt-falta">Sin descripción</span>
                )}
              </Renglon>
            </div>
          ) : null}

          {pestana === 'inventario' ? (
            <Movimientos
              ficha={ficha}
              permisos={permisos}
              trabajando={trabajando}
              error={errorDeOperacion}
              onAjustar={onAjustar}
            />
          ) : null}

          {pestana === 'ventas' ? (
            <div className="srv-detalle__cuerpo">
              {ficha.ventas.length === 0 ? (
                <p className="pz-vacio__texto">
                  Este producto todavía no se ha vendido. Aquí aparecerá cada venta con el precio
                  que se cobró ese día.
                </p>
              ) : (
                <ul className="prd-ventas">
                  {ficha.ventas.map((v) => (
                    <li key={`${v.ventaId}:${v.folio}`} className="prd-venta">
                      <button
                        type="button"
                        className="cur-alumno__quien"
                        onClick={() => onAbrirVenta(v.ventaId)}
                      >
                        <span className="pz-renglon__cuerpo">
                          <span className="pz-renglon__titulo">{v.folio}</span>
                          <span className="pz-renglon__pie">
                            {v.fecha.slice(0, 10).split('-').reverse().join('/')}
                            {v.cliente ? ` · ${v.cliente}` : ' · Mostrador'}
                          </span>
                        </span>
                      </button>
                      <span className="prd-venta__cifras">
                        <span>{v.cantidad}</span>
                        {/* EL PRECIO HISTORICO. Si el catalogo sube mañana,
                            este renglon sigue diciendo lo que se cobro. */}
                        <span>{formatearMoneda(v.precioUnitario)}</span>
                        <strong>{formatearMoneda(v.total)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {pestana === 'proveedores' ? (
            <Proveedores
              ficha={ficha}
              proveedores={proveedores}
              permisos={permisos}
              trabajando={trabajando}
              error={errorDeOperacion}
              onLigar={onLigar}
              onDesligar={onDesligar}
              onNuevoProveedor={onNuevoProveedor}
            />
          ) : null}

          {puedeGestionar ? (
            <div className="srv-detalle__acciones">
              <button type="button" className="pz-boton pz-boton--principal" onClick={onEditar}>
                <Icono nombre="lapiz" lado={16} /> Editar producto
              </button>
              <button
                type="button"
                className={ficha.activo ? 'srv-boton-peligro' : 'pz-boton'}
                onClick={onCambiarEstado}
              >
                <Icono nombre={ficha.activo ? 'prohibido' : 'palomita'} lado={16} />{' '}
                {ficha.activo ? 'Desactivar producto' : 'Activar producto'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}
