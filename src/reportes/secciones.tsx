/**
 * LAS OCHO PESTAÑAS DEL REPORTE.
 *
 * TODAS LEEN DEL MISMO OBJETO `Reporte`, que vino de UNA sola llamada. Es lo
 * que garantiza que cambiar el periodo las mueva a las ocho a la vez: con una
 * consulta por pestaña, basta que una se quede con el periodo viejo para que la
 * pantalla se contradiga a si misma sin avisar — y no avisaria, porque cada
 * numero por separado se ve perfectamente normal.
 *
 * CADA PESTAÑA LLEVA AL MODULO DEL QUE SALE. Un reporte que solo enseña
 * numeros obliga a abrir otra pantalla, buscar el mismo periodo a mano y
 * esperar que coincida. El enlace es lo que convierte "los servicios cayeron"
 * en "que paso con los servicios".
 *
 * LOS VACIOS SE RESUELVEN UNO POR UNO, no con un "no hay datos" generico. Cada
 * seccion dice que le falta y donde se captura: un vacio que no dice que hacer
 * es una pantalla rota con otra letra.
 */

import { formatearMoneda } from '@neron/base/utils';
import type {
  CategoriaDeGasto,
  ClienteDelRanking,
  CursoDelRanking,
  EnElRanking,
  PorMetodoDePago,
  Reporte,
} from '../datos/reportes.js';
import type { CumplimientoDeRecordatorios } from '../datos/recordatorios.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { DonaDeCategorias } from './dona-de-categorias.js';
import { LineasDeIngresos } from './lineas-de-ingresos.js';

export type PestanaDelReporte =
  | 'resumen' | 'ventas' | 'servicios' | 'clientes'
  | 'productos' | 'cursos' | 'gastos' | 'caja' | 'recordatorios';

export const PESTANAS_DEL_REPORTE: ReadonlyArray<{
  readonly clave: PestanaDelReporte;
  readonly etiqueta: string;
}> = [
  { clave: 'resumen', etiqueta: 'Resumen' },
  { clave: 'ventas', etiqueta: 'Ventas' },
  { clave: 'servicios', etiqueta: 'Servicios' },
  { clave: 'clientes', etiqueta: 'Clientes' },
  { clave: 'productos', etiqueta: 'Productos' },
  { clave: 'cursos', etiqueta: 'Cursos' },
  { clave: 'gastos', etiqueta: 'Gastos' },
  { clave: 'caja', etiqueta: 'Caja' },
  { clave: 'recordatorios', etiqueta: 'Recordatorios' },
];

/** A que modulo lleva cada pestaña cuando alguien quiere ver el detalle. */
export const MODULO_DE_LA_PESTANA: Readonly<Record<PestanaDelReporte, string>> = {
  resumen: 'inicio',
  ventas: 'caja',
  servicios: 'servicios',
  clientes: 'clientes',
  productos: 'productos',
  cursos: 'cursos',
  gastos: 'gastos',
  caja: 'caja',
  recordatorios: 'recordatorios',
};

/* ------------------------------------------------------------------ */
/* Piezas que se repiten en varias pestañas                            */
/* ------------------------------------------------------------------ */

/**
 * Un dato suelto de una lista.
 *
 * `null` se pinta con una raya y NO con un cero. "Ticket promedio: $0" se lee
 * como que se regalo la mercancia; "—" se lee como que no hubo ventas con las
 * que sacar un promedio, que es lo que pasa de verdad.
 */
export function Dato({
  etiqueta,
  valor,
  fuerte = false,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly fuerte?: boolean;
}) {
  return (
    <div className="pz-dato pz-dato--renglon">
      <span className="tt-etiqueta">{etiqueta}</span>
      <span className={fuerte ? 'tt-dato' : 'pz-dato__valor'}>{valor}</span>
    </div>
  );
}

export function Vacio({ icono, texto }: { readonly icono: NombreDeIcono; readonly texto: string }) {
  return (
    <div className="pz-vacio pz-vacio--chico">
      <span className="pz-vacio__icono" aria-hidden="true">
        <Icono nombre={icono} lado={22} />
      </span>
      <p className="pz-vacio__texto">{texto}</p>
    </div>
  );
}

/**
 * Una tarjeta de ranking: nombre, cantidad e ingresos.
 *
 * EL ENLACE "Ver todos" LLEVA AL MODULO, no abre otra vista aqui. Reportes no
 * es dueño de ni un dato: la lista completa, con su buscador y sus filtros, ya
 * existe en su modulo y mantener una segunda seria tener dos listas que se
 * separan.
 */
export function TarjetaDeRanking({
  titulo,
  columna,
  filas,
  cargando,
  vacio,
  onVerTodos,
}: {
  readonly titulo: string;
  readonly columna: string;
  readonly filas: readonly EnElRanking[];
  readonly cargando: boolean;
  readonly vacio: string;
  onVerTodos(): void;
}) {
  return (
    <section className="pz-tarjeta" aria-label={titulo}>
      <div className="rep-tarjeta__cabeza">
        <h3 className="tt-tarjeta">{titulo}</h3>
        <button type="button" className="pz-enlace pz-enlace--pelado" onClick={onVerTodos}>
          Ver todos
        </button>
      </div>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <div className="pz-silueta pz-silueta--linea" />
          <div className="pz-silueta pz-silueta--linea" />
          <div className="pz-silueta pz-silueta--linea" />
        </div>
      ) : filas.length === 0 ? (
        <Vacio icono="renglones" texto={vacio} />
      ) : (
        <div className="pz-tabla__marco">
          <table className="pz-tabla">
            <thead>
              <tr>
                <th scope="col">{columna}</th>
                <th scope="col" className="pz-tabla__numero">Cantidad</th>
                <th scope="col" className="pz-tabla__numero">Ingresos</th>
              </tr>
            </thead>
            <tbody className="mv-escalonado">
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{f.nombre}</td>
                  <td className="pz-tabla__numero">{f.cantidad}</td>
                  <td className="pz-tabla__numero">{formatearMoneda(f.ingresos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Cada pestaña                                                        */
/* ------------------------------------------------------------------ */

export interface PropiedadesDeLaSeccion {
  readonly reporte: Reporte | null;
  readonly cargando: boolean;
  /**
   * EL CUMPLIMIENTO DE LOS PENDIENTES, que NO viene de `reporte_del_periodo`.
   *
   * Es la unica seccion que consulta aparte, y a proposito: Recordatorios
   * define que cuenta como vencido y que como cumplido. Si Reportes lo contara
   * por su cuenta, el dia que alli cambie la definicion —por ejemplo, que los
   * cancelados dejen de restar— las dos pantallas dirian cifras distintas del
   * mismo mes y nadie sabria cual creer.
   *
   * `null` es "todavia no llega" y se pinta con rayas.
   */
  readonly cumplimiento?: CumplimientoDeRecordatorios | null;
  onIr(modulo: string, intencion?: string): void;
}

function Resumen({ reporte, cargando, onIr }: PropiedadesDeLaSeccion) {
  return (
    <>
      <div className="rep-dos">
        <LineasDeIngresos
          serie={reporte?.serie ?? []}
          paso={reporte?.periodo.paso ?? 'dia'}
          cargando={cargando}
        />
        <DonaDeCategorias categorias={reporte?.categorias ?? []} cargando={cargando} />
      </div>

      <div className="pz-tres">
        <TarjetaDeRanking
          titulo="Servicios más realizados"
          columna="Servicio"
          filas={reporte?.servicios.ranking ?? []}
          cargando={cargando}
          vacio="Todavía no se ha completado ninguna sesión en este período."
          onVerTodos={() => onIr('servicios')}
        />
        <TarjetaDeRanking
          titulo="Cursos más vendidos"
          columna="Curso"
          filas={reporte?.cursos.ranking ?? []}
          cargando={cargando}
          vacio="Todavía no se ha vendido ningún curso en este período."
          onVerTodos={() => onIr('cursos')}
        />
        <TarjetaDeRanking
          titulo="Productos más vendidos"
          columna="Producto"
          filas={reporte?.productos.ranking ?? []}
          cargando={cargando}
          vacio="Todavía no se ha vendido ningún producto en este período."
          onVerTodos={() => onIr('productos')}
        />
      </div>
    </>
  );
}

function Ventas({ reporte, cargando, onIr }: PropiedadesDeLaSeccion) {
  const v = reporte?.ventas;
  const raya = '—';
  const moneda = (n: number | null | undefined): string =>
    n === null || n === undefined ? raya : formatearMoneda(n);

  return (
    <div className="rep-dos">
      <section className="pz-tarjeta" aria-label="Resumen de ventas del período">
        <div className="rep-tarjeta__cabeza">
          <h3 className="tt-tarjeta">Ventas del período</h3>
          <button
            type="button"
            className="pz-enlace pz-enlace--pelado"
            onClick={() => onIr('caja', 'ventas:historial')}
          >
            Ver el historial
          </button>
        </div>
        <div className="pz-datos">
          <Dato etiqueta="Ventas cobradas" valor={cargando ? raya : String(v?.cobradas ?? 0)} fuerte />
          <Dato etiqueta="Ventas canceladas" valor={cargando ? raya : String(v?.canceladas ?? 0)} />
          {/* SIN VENTAS EL TICKET ES `null`, no cero: "$0 de ticket promedio"
              afirma que se cobro cero por venta, que es distinto de no haber
              vendido. */}
          <Dato etiqueta="Ticket promedio" valor={cargando ? raya : moneda(v?.ticket)} />
          <Dato etiqueta="Venta más alta" valor={cargando ? raya : moneda(v?.maxima)} />
          <Dato etiqueta="Venta más baja" valor={cargando ? raya : moneda(v?.minima)} />
        </div>
      </section>

      <section className="pz-tarjeta" aria-label="Ventas por forma de pago">
        <h3 className="tt-tarjeta">Por forma de pago</h3>
        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <div className="pz-silueta pz-silueta--linea" />
            <div className="pz-silueta pz-silueta--linea" />
          </div>
        ) : (v?.porMetodo.length ?? 0) === 0 ? (
          <Vacio icono="moneda" texto="Todavía no se ha cobrado nada en este período." />
        ) : (
          <ul className="pz-lista mv-escalonado">
            {(v?.porMetodo ?? []).map((m: PorMetodoDePago) => (
              <li key={m.metodo} className="pz-dato pz-dato--renglon">
                <span className="pz-dato__valor">{m.metodo}</span>
                <span className="tt-secundario">
                  {m.operaciones} {m.operaciones === 1 ? 'cobro' : 'cobros'}
                </span>
                <strong className="tt-dato">{formatearMoneda(m.monto)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Servicios({ reporte, cargando, onIr }: PropiedadesDeLaSeccion) {
  const s = reporte?.servicios;
  return (
    <div className="rep-dos">
      <section className="pz-tarjeta" aria-label="Resumen de servicios del período">
        <h3 className="tt-tarjeta">Servicios del período</h3>
        <div className="pz-datos">
          <Dato
            etiqueta="Sesiones realizadas"
            valor={cargando ? '—' : String(s?.realizados ?? 0)}
            fuerte
          />
          <Dato
            etiqueta="Ingresos por servicios"
            valor={cargando ? '—' : formatearMoneda(s?.ingresos ?? 0)}
          />
        </div>
      </section>
      <TarjetaDeRanking
        titulo="Servicios más realizados"
        columna="Servicio"
        filas={s?.ranking ?? []}
        cargando={cargando}
        vacio="Todavía no se ha completado ninguna sesión en este período."
        onVerTodos={() => onIr('servicios')}
      />
    </div>
  );
}

function Clientes({ reporte, cargando, onIr }: PropiedadesDeLaSeccion) {
  const c = reporte?.clientes;
  const filas: readonly ClienteDelRanking[] = c?.ranking ?? [];

  return (
    <div className="rep-dos">
      <section className="pz-tarjeta" aria-label="Resumen de clientes del período">
        <h3 className="tt-tarjeta">Clientes del período</h3>
        <div className="pz-datos">
          <Dato etiqueta="Atendidos" valor={cargando ? '—' : String(c?.atendidos ?? 0)} fuerte />
          <Dato etiqueta="Nuevos" valor={cargando ? '—' : String(c?.nuevos ?? 0)} />
          {/* RECURRENTE ES QUIEN VOLVIO, y por eso se cuenta aparte de "nuevos":
              los dos numeros juntos dicen si el centro crece o se sostiene. */}
          <Dato etiqueta="Recurrentes" valor={cargando ? '—' : String(c?.recurrentes ?? 0)} />
          <Dato
            etiqueta="En el directorio"
            valor={cargando ? '—' : String(c?.totales ?? 0)}
          />
        </div>
      </section>

      <section className="pz-tarjeta" aria-label="Clientes que más gastaron">
        <div className="rep-tarjeta__cabeza">
          <h3 className="tt-tarjeta">Quienes más gastaron</h3>
          <button
            type="button"
            className="pz-enlace pz-enlace--pelado"
            onClick={() => onIr('clientes')}
          >
            Ver todos
          </button>
        </div>
        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <div className="pz-silueta pz-silueta--linea" />
            <div className="pz-silueta pz-silueta--linea" />
          </div>
        ) : filas.length === 0 ? (
          <Vacio icono="personas" texto="Todavía nadie ha comprado en este período." />
        ) : (
          <div className="pz-tabla__marco">
            <table className="pz-tabla">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col" className="pz-tabla__numero">Visitas</th>
                  <th scope="col" className="pz-tabla__numero">Compras</th>
                  <th scope="col" className="pz-tabla__numero">Gastado</th>
                </tr>
              </thead>
              <tbody className="mv-escalonado">
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      {/* AL EXPEDIENTE, no a una ficha propia de Reportes: lo que
                          hace falta saber de alguien —sus alergias, lo que se le
                          hizo— ya vive completo alla. */}
                      <button
                        type="button"
                        className="pz-enlace"
                        onClick={() => onIr('clientes', `clientes:abrir:${f.id}`)}
                      >
                        {f.nombre}
                      </button>
                    </td>
                    <td className="pz-tabla__numero">{f.visitas}</td>
                    <td className="pz-tabla__numero">{f.compras}</td>
                    <td className="pz-tabla__numero">{formatearMoneda(f.gastado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Productos({ reporte, cargando, onIr }: PropiedadesDeLaSeccion) {
  const p = reporte?.productos;
  return (
    <div className="rep-dos">
      <section className="pz-tarjeta" aria-label="Resumen de productos del período">
        <div className="rep-tarjeta__cabeza">
          <h3 className="tt-tarjeta">Inventario y ventas</h3>
          <button
            type="button"
            className="pz-enlace pz-enlace--pelado"
            onClick={() => onIr('productos')}
          >
            Ver el almacén
          </button>
        </div>
        <div className="pz-datos">
          <Dato etiqueta="Unidades vendidas" valor={cargando ? '—' : String(p?.unidades ?? 0)} fuerte />
          <Dato
            etiqueta="Ingresos por productos"
            valor={cargando ? '—' : formatearMoneda(p?.ingresos ?? 0)}
          />
          {/* EXISTENCIAS BAJAS Y AGOTADOS NO SON DEL PERIODO: son de HOY. Un
              reporte de junio abierto en agosto no puede decir cuanto stock
              habia en junio, porque eso no se guarda — y fingirlo seria
              inventar. Se dice cual es cual. */}
          <Dato etiqueta="Con existencia baja (hoy)" valor={cargando ? '—' : String(p?.bajos ?? 0)} />
          <Dato etiqueta="Agotados (hoy)" valor={cargando ? '—' : String(p?.agotados ?? 0)} />
        </div>
      </section>
      <TarjetaDeRanking
        titulo="Productos más vendidos"
        columna="Producto"
        filas={p?.ranking ?? []}
        cargando={cargando}
        vacio="Todavía no se ha vendido ningún producto en este período."
        onVerTodos={() => onIr('productos')}
      />
    </div>
  );
}

function Cursos({ reporte, cargando, onIr }: PropiedadesDeLaSeccion) {
  const c = reporte?.cursos;
  const filas: readonly CursoDelRanking[] = c?.ranking ?? [];

  return (
    <div className="rep-dos">
      <section className="pz-tarjeta" aria-label="Resumen de cursos del período">
        <h3 className="tt-tarjeta">Cursos del período</h3>
        <div className="pz-datos">
          <Dato etiqueta="Inscripciones vendidas" valor={cargando ? '—' : String(c?.vendidos ?? 0)} fuerte />
          <Dato
            etiqueta="Ingresos por cursos"
            valor={cargando ? '—' : formatearMoneda(c?.ingresos ?? 0)}
          />
          <Dato etiqueta="Personas inscritas" valor={cargando ? '—' : String(c?.inscritos ?? 0)} />
          <Dato etiqueta="Por empezar" valor={cargando ? '—' : String(c?.proximos ?? 0)} />
          <Dato etiqueta="Terminados" valor={cargando ? '—' : String(c?.terminados ?? 0)} />
        </div>
      </section>

      <section className="pz-tarjeta" aria-label="Cursos más vendidos">
        <div className="rep-tarjeta__cabeza">
          <h3 className="tt-tarjeta">Cursos más vendidos</h3>
          <button type="button" className="pz-enlace pz-enlace--pelado" onClick={() => onIr('cursos')}>
            Ver todos
          </button>
        </div>
        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <div className="pz-silueta pz-silueta--linea" />
            <div className="pz-silueta pz-silueta--linea" />
          </div>
        ) : filas.length === 0 ? (
          <Vacio icono="birrete" texto="Todavía no se ha vendido ningún curso en este período." />
        ) : (
          <div className="pz-tabla__marco">
            <table className="pz-tabla">
              <thead>
                <tr>
                  <th scope="col">Curso</th>
                  <th scope="col" className="pz-tabla__numero">Ventas</th>
                  <th scope="col" className="pz-tabla__numero">Ocupación</th>
                  <th scope="col" className="pz-tabla__numero">Ingresos</th>
                </tr>
              </thead>
              <tbody className="mv-escalonado">
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td>{f.nombre}</td>
                    <td className="pz-tabla__numero">{f.cantidad}</td>
                    {/* SIN CUPO NO HAY OCUPACION. Un curso sin limite de lugares
                        no tiene porcentaje que enseñar, y poner "100%" o "0%"
                        seria inventarle un cupo que nadie fijo. */}
                    <td className="pz-tabla__numero">
                      {f.cupo === null
                        ? `${f.inscritos} · sin cupo`
                        : `${f.inscritos}/${f.cupo}`}
                    </td>
                    <td className="pz-tabla__numero">{formatearMoneda(f.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Gastos({ reporte, cargando, onIr }: PropiedadesDeLaSeccion) {
  const g = reporte?.gastos;
  const raya = '—';
  const moneda = (n: number | null | undefined): string =>
    n === null || n === undefined ? raya : formatearMoneda(n);
  const categorias: readonly CategoriaDeGasto[] = g?.categorias ?? [];

  return (
    <div className="rep-dos">
      <section className="pz-tarjeta" aria-label="Resumen de gastos del período">
        <div className="rep-tarjeta__cabeza">
          <h3 className="tt-tarjeta">Gastos del período</h3>
          <button type="button" className="pz-enlace pz-enlace--pelado" onClick={() => onIr('gastos')}>
            Ver el libro
          </button>
        </div>
        <div className="pz-datos">
          <Dato etiqueta="Total gastado" valor={cargando ? raya : formatearMoneda(g?.total ?? 0)} fuerte />
          <Dato etiqueta="Gastos registrados" valor={cargando ? raya : String(g?.cuantos ?? 0)} />
          <Dato etiqueta="Gasto promedio" valor={cargando ? raya : moneda(g?.promedio)} />
          <Dato etiqueta="Mayor gasto" valor={cargando ? raya : moneda(g?.mayor)} />
          <Dato etiqueta="Menor gasto" valor={cargando ? raya : moneda(g?.menor)} />
        </div>
      </section>

      <section className="pz-tarjeta" aria-label="Gastos por categoría">
        <h3 className="tt-tarjeta">Por categoría</h3>
        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <div className="pz-silueta pz-silueta--linea" />
            <div className="pz-silueta pz-silueta--linea" />
          </div>
        ) : categorias.length === 0 ? (
          <Vacio icono="recibo" texto="Todavía no hay gastos registrados en este período." />
        ) : (
          <ul className="pz-lista mv-escalonado">
            {categorias.map((c) => (
              <li key={c.categoria} className="pz-dato pz-dato--renglon">
                <span className="pz-dato__valor">{c.categoria}</span>
                <span className="tt-secundario">
                  {c.cuantos} {c.cuantos === 1 ? 'gasto' : 'gastos'}
                </span>
                <strong className="tt-dato">{formatearMoneda(c.monto)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Caja({ reporte, cargando, onIr }: PropiedadesDeLaSeccion) {
  const c = reporte?.caja;
  const cortes = c?.cortes ?? [];

  return (
    <div className="rep-dos">
      <section className="pz-tarjeta" aria-label="Movimientos de caja del período">
        <div className="rep-tarjeta__cabeza">
          <h3 className="tt-tarjeta">El cajón</h3>
          <button
            type="button"
            className="pz-enlace pz-enlace--pelado"
            onClick={() => onIr('caja', 'caja:movimientos')}
          >
            Ver los movimientos
          </button>
        </div>
        <div className="pz-datos">
          <Dato etiqueta="Cobros que entraron" valor={cargando ? '—' : formatearMoneda(c?.ventas ?? 0)} fuerte />
          <Dato etiqueta="Ingresos capturados a mano" valor={cargando ? '—' : formatearMoneda(c?.ingresosManuales ?? 0)} />
          <Dato etiqueta="Retiros" valor={cargando ? '—' : formatearMoneda(c?.retiros ?? 0)} />
          <Dato etiqueta="Gastos pagados del cajón" valor={cargando ? '—' : formatearMoneda(c?.gastosDeCaja ?? 0)} />
          <Dato etiqueta="Movimientos" valor={cargando ? '—' : String(c?.movimientos ?? 0)} />
        </div>
        {/* EL DESCUADRE ES LO UNICO QUE DETECTA QUE FALTA DINERO, y por eso se
            escribe aparte y con su explicacion: sale de comparar lo que Ventas
            dice que se cobro contra lo que se conto fisicamente al cerrar. */}
        <p className="tt-secundario">
          El descuadre del período suma las diferencias de los cortes ya firmados:{' '}
          <strong>{cargando ? '—' : formatearMoneda(c?.descuadre ?? 0)}</strong>.
        </p>
      </section>

      <section className="pz-tarjeta" aria-label="Cortes de caja del período">
        <h3 className="tt-tarjeta">Cortes firmados</h3>
        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <div className="pz-silueta pz-silueta--linea" />
            <div className="pz-silueta pz-silueta--linea" />
          </div>
        ) : cortes.length === 0 ? (
          <Vacio icono="cajon" texto="Todavía no se ha cerrado ninguna caja en este período." />
        ) : (
          <div className="pz-tabla__marco">
            <table className="pz-tabla">
              <thead>
                <tr>
                  <th scope="col">Caja</th>
                  <th scope="col" className="pz-tabla__numero">Esperado</th>
                  <th scope="col" className="pz-tabla__numero">Contado</th>
                  <th scope="col" className="pz-tabla__numero">Diferencia</th>
                </tr>
              </thead>
              <tbody className="mv-escalonado">
                {cortes.map((s) => (
                  <tr key={s.id}>
                    <td>{s.nombre}</td>
                    <td className="pz-tabla__numero">
                      {s.esperado === null ? '—' : formatearMoneda(s.esperado)}
                    </td>
                    <td className="pz-tabla__numero">
                      {s.contado === null ? '—' : formatearMoneda(s.contado)}
                    </td>
                    <td className="pz-tabla__numero">
                      {s.diferencia === null ? '—' : formatearMoneda(s.diferencia)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * EL SEGUIMIENTO DE LO PENDIENTE.
 *
 * Es la unica seccion que no sale de `reporte_del_periodo`, y esta explicado en
 * `PropiedadesDeLaSeccion`: la definicion de "vencido" y de "cumplido" vive en
 * Recordatorios, y contarlo aqui por separado seria la segunda fuente de verdad
 * que todo el proyecto se molesta en evitar.
 *
 * EL CUMPLIMIENTO POR PERSONA NO ES UN RANKING. Se ordena por cuantos le
 * tocaron y no por porcentaje: una lista de personas ordenada por "quien
 * cumple menos" convierte una herramienta de trabajo en un tablero de
 * señalamientos, y lo primero que se aprende entonces es a no aceptar
 * recordatorios.
 */
function SeguimientoDePendientes({ cumplimiento, cargando, onIr }: PropiedadesDeLaSeccion) {
  const c = cumplimiento ?? null;
  const raya = '—';
  const cifra = (n: number | null | undefined): string =>
    cargando || n === null || n === undefined ? raya : String(n);

  return (
    <div className="rep-dos">
      <section className="pz-tarjeta" aria-label="Cumplimiento de los recordatorios">
        <div className="rep-tarjeta__cabeza">
          <h3 className="tt-tarjeta">Pendientes del período</h3>
          <button
            type="button"
            className="pz-enlace pz-enlace--pelado"
            onClick={() => onIr('recordatorios')}
          >
            Ver la lista
          </button>
        </div>
        <div className="pz-datos">
          <Dato etiqueta="Creados" valor={cifra(c?.creados)} fuerte />
          <Dato etiqueta="Completados" valor={cifra(c?.completados)} />
          <Dato etiqueta="Siguen pendientes" valor={cifra(c?.pendientes)} />
          <Dato etiqueta="Vencidos" valor={cifra(c?.vencidos)} />
          <Dato etiqueta="Cancelados" valor={cifra(c?.cancelados)} />
          {/* SIN NADA CREADO NO HAY PORCENTAJE. Un "0% de cumplimiento" de un
              mes sin trabajo es un reproche inventado, no un dato. */}
          <Dato
            etiqueta="Cumplimiento"
            valor={
              cargando || c === null || c.cumplimiento === null
                ? raya
                : `${c.cumplimiento}%`
            }
          />
          <Dato
            etiqueta="Tiempo hasta cerrarlos"
            valor={
              cargando || c === null || c.horasPromedio === null
                ? raya
                : `${c.horasPromedio} h`
            }
          />
        </div>
      </section>

      <section className="pz-tarjeta" aria-label="Cumplimiento por responsable">
        <h3 className="tt-tarjeta">Por responsable</h3>
        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <div className="pz-silueta pz-silueta--linea" />
            <div className="pz-silueta pz-silueta--linea" />
          </div>
        ) : (c?.porResponsable ?? []).length === 0 ? (
          <Vacio icono="personas" texto="Todavía no hay recordatorios en este período." />
        ) : (
          <ul className="pz-lista mv-escalonado">
            {(c?.porResponsable ?? []).map((m) => (
              <li key={m.nombre} className="pz-dato pz-dato--renglon">
                <span className="pz-dato__valor">{m.nombre}</span>
                <span className="tt-secundario">
                  {m.hechos} de {m.cuantos} cerrados
                  {(m.vencidos ?? 0) > 0 ? ` · ${m.vencidos} vencidos` : ''}
                </span>
                <strong className="tt-dato">
                  {m.cuantos === 0 ? raya : `${Math.round((m.hechos / m.cuantos) * 100)}%`}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pz-tarjeta" aria-label="Cumplimiento por categoría">
        <h3 className="tt-tarjeta">Por categoría</h3>
        {cargando ? (
          <div className="pz-cargando" aria-busy="true">
            <div className="pz-silueta pz-silueta--linea" />
          </div>
        ) : (c?.porCategoria ?? []).length === 0 ? (
          <Vacio icono="renglones" texto="Todavía no hay recordatorios agrupados." />
        ) : (
          <ul className="pz-lista mv-escalonado">
            {(c?.porCategoria ?? []).map((g) => (
              <li key={g.nombre} className="pz-dato pz-dato--renglon">
                <span className="pz-dato__valor">{g.nombre}</span>
                <span className="tt-secundario">
                  {g.cuantos} {g.cuantos === 1 ? 'recordatorio' : 'recordatorios'}
                </span>
                <strong className="tt-dato">
                  {g.cuantos === 0 ? raya : `${Math.round((g.hechos / g.cuantos) * 100)}%`}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function SeccionDelReporte({
  pestana,
  ...resto
}: PropiedadesDeLaSeccion & { readonly pestana: PestanaDelReporte }) {
  if (pestana === 'ventas') return <Ventas {...resto} />;
  if (pestana === 'servicios') return <Servicios {...resto} />;
  if (pestana === 'clientes') return <Clientes {...resto} />;
  if (pestana === 'productos') return <Productos {...resto} />;
  if (pestana === 'cursos') return <Cursos {...resto} />;
  if (pestana === 'gastos') return <Gastos {...resto} />;
  if (pestana === 'caja') return <Caja {...resto} />;
  if (pestana === 'recordatorios') return <SeguimientoDePendientes {...resto} />;
  return <Resumen {...resto} />;
}
