/**
 * LOS DOS RANKINGS: servicios mas dados y productos mas vendidos.
 *
 * SE CALCULAN, NO SE GUARDAN. Los dos salen de contar renglones de ventas
 * COBRADAS en la base. No existe ningun contador "veces_vendido" en la tabla
 * de servicios, y no debe existir: un contador a mano se desincroniza a la
 * primera venta cancelada y ya nadie sabe cual de los dos numeros creer.
 *
 * SOLO CUENTAN LAS VENTAS COBRADAS. Un borrador es un carrito a medias y una
 * cancelada ya se revirtio.
 *
 * POCOS Y CORTOS —cinco servicios, cuatro productos—. Inicio responde "que
 * esta pasando hoy"; el ranking completo es una pregunta de Reportes, y para
 * eso esta "Ver todos".
 */

import { useState } from 'react';
import type { ProductoVendido, ServicioVendido } from '../datos/tablero.js';
import { Icono } from '../ui/iconos.js';

/* ------------------------------------------------------------------ */
/* Servicios                                                           */
/* ------------------------------------------------------------------ */

export function ServiciosMasVendidos({
  servicios,
  cargando,
  onVerTodos,
}: {
  readonly servicios: readonly ServicioVendido[];
  readonly cargando: boolean;
  readonly onVerTodos: () => void;
}) {
  return (
    <section className="ini-panel ini-ranking" aria-labelledby="ini-servicios-titulo">
      <header className="ini-panel__barra">
        <h3 className="ini-panel__titulo" id="ini-servicios-titulo">
          Servicios más vendidos
        </h3>
        <button type="button" className="ini-panel__enlace" onClick={onVerTodos}>
          Ver todos
        </button>
      </header>

      {cargando ? (
        <div className="ini-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el ranking de servicios</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="terapias-silueta ini-cargando__renglon" />
          ))}
        </div>
      ) : servicios.length === 0 ? (
        <p className="ini-vacio">Aún no hay suficientes datos.</p>
      ) : (
        <ol className="ini-ranking__lista">
          {servicios.map((s, i) => (
            <li key={s.id} className="ini-ranking__renglon">
              {/*
                Un numero, no un icono de colores por servicio.
                Los servicios los captura cada centro: no hay forma de saber
                que dibujo le toca a "Constelaciones" sin inventarselo, y un
                icono inventado es exactamente lo que no va en este producto.
              */}
              <span className="ini-ranking__puesto" aria-hidden="true">
                {i + 1}
              </span>
              <span className="ini-ranking__texto">
                <span className="ini-ranking__nombre">{s.nombre}</span>
                <span className="ini-ranking__dato">
                  {s.sesiones} {s.sesiones === 1 ? 'sesión' : 'sesiones'}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */

/**
 * La foto del producto, o un icono en su lugar.
 *
 * LA FOTO ES LA QUE ESTE GUARDADA EN EL PRODUCTO, si la hay. No se busca una
 * imagen bonita en internet para rellenar: una foto que no es la del frasco
 * que esta en el estante confunde mas de lo que adorna.
 *
 * Y si la direccion guardada ya no responde —el proveedor movio la imagen, se
 * cayo el servidor— se cae al icono en vez de dejar el simbolo de imagen rota,
 * que se ve como un sistema descompuesto.
 */
function ImagenDeProducto({ url, nombre }: { readonly url: string | null; readonly nombre: string }) {
  const [fallo, setFallo] = useState(false);

  if (!url || fallo) {
    return (
      <span className="ini-producto__hueco" aria-hidden="true">
        <Icono nombre="imagen" lado={22} />
      </span>
    );
  }
  return (
    <img
      className="ini-producto__foto"
      src={url}
      // Vacio a proposito: el nombre va escrito justo debajo. Repetirlo en el
      // alt hace que un lector de pantalla lo diga dos veces seguidas.
      alt=""
      loading="lazy"
      onError={() => setFallo(true)}
      title={nombre}
    />
  );
}

export function ProductosMasVendidos({
  productos,
  cargando,
  onVerTodos,
}: {
  readonly productos: readonly ProductoVendido[];
  readonly cargando: boolean;
  readonly onVerTodos: () => void;
}) {
  return (
    <section className="ini-panel ini-productos" aria-labelledby="ini-productos-titulo">
      <header className="ini-panel__barra">
        <h3 className="ini-panel__titulo" id="ini-productos-titulo">
          Productos más vendidos
        </h3>
        <button type="button" className="ini-panel__enlace" onClick={onVerTodos}>
          Ver todos
        </button>
      </header>

      {cargando ? (
        <div className="ini-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el ranking de productos</span>
          <div className="terapias-silueta ini-cargando__renglon" />
        </div>
      ) : productos.length === 0 ? (
        <p className="ini-vacio">Aún no se han registrado ventas de productos.</p>
      ) : (
        <ul className="ini-productos__lista">
          {productos.map((p) => (
            <li key={p.id} className="ini-producto">
              <ImagenDeProducto url={p.imagenUrl} nombre={p.nombre} />
              <span className="ini-producto__nombre">{p.nombre}</span>
              <span className="ini-producto__dato">
                {p.unidades} {p.unidades === 1 ? 'unidad' : 'unidades'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
