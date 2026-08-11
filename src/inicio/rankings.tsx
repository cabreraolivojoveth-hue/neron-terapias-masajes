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

/**
 * EL NUMERITO DEL RANKING.
 *
 * Los tres primeros van en solido y el resto en tono suave. No es adorno: un
 * ranking en el que las cinco filas pesan igual obliga a leerlas todas para
 * saber cual va ganando, que es justo lo contrario de lo que hace un tablero.
 */
export function Puesto({ lugar }: { readonly lugar: number }) {
  return (
    <span className={`ini-puesto${lugar <= 3 ? ' ini-puesto--podio' : ''}`} aria-hidden="true">
      {lugar}
    </span>
  );
}

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
    <section className="pz-tarjeta ini-ranking" aria-labelledby="ini-servicios-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="ini-servicios-titulo">
          Servicios más vendidos
        </h3>
        <button type="button" className="pz-enlace pz-enlace--pelado" onClick={onVerTodos}>
          Ver todos
        </button>
      </header>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el ranking de servicios</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : servicios.length === 0 ? (
        <p className="pz-vacio__texto">Aún no hay suficientes datos.</p>
      ) : (
        <ol className="pz-lista mv-escalonado">
          {servicios.map((s, i) => (
            <li key={s.id} className="pz-renglon pz-renglon--quieto">
              {/*
                Un numero, no un icono de colores por servicio.
                Los servicios los captura cada centro: no hay forma de saber
                que dibujo le toca a "Constelaciones" sin inventarselo, y un
                icono inventado es exactamente lo que no va en este producto.
              */}
              <Puesto lugar={i + 1} />
              <span className="pz-renglon__cuerpo">
                <span className="pz-renglon__titulo">{s.nombre}</span>
                <span className="pz-renglon__pie">
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
    <section className="pz-tarjeta ini-productos" aria-labelledby="ini-productos-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="ini-productos-titulo">
          Productos más vendidos
        </h3>
        <button type="button" className="pz-enlace pz-enlace--pelado" onClick={onVerTodos}>
          Ver todos
        </button>
      </header>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el ranking de productos</span>
          <div className="pz-silueta" />
        </div>
      ) : productos.length === 0 ? (
        <p className="pz-vacio__texto">Aún no se han registrado ventas de productos.</p>
      ) : (
        /*
          EN RENGLON, NO EN CUADRICULA. Con la foto grande y en rejilla, cinco
          productos median mas de cuatrocientos pixeles de alto y dejaban la
          columna de al lado vacia — que fue el reclamo del blanco de sobra. En
          renglon este panel mide lo mismo que el de servicios, que es su
          hermano, y los dos se leen igual.
        */
        <ol className="pz-lista mv-escalonado">
          {productos.map((p, i) => (
            <li key={p.id} className="pz-renglon pz-renglon--quieto">
              <Puesto lugar={i + 1} />
              <ImagenDeProducto url={p.imagenUrl} nombre={p.nombre} />
              <span className="pz-renglon__cuerpo">
                <span className="pz-renglon__titulo">{p.nombre}</span>
                <span className="pz-renglon__pie">
                  {p.unidades} {p.unidades === 1 ? 'unidad' : 'unidades'}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
