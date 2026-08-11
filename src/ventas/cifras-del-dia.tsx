/**
 * LO QUE PASO HOY: las ultimas ventas y las cuatro cifras.
 *
 * CADA CIFRA DICE QUE CUENTA, y no cuenta lo mismo que la de al lado.
 * "Ventas 5" son cinco transacciones; "Productos 6" son seis piezas. Si las
 * cuatro dijeran solo un numero pelon, dos personas leerian el mismo tablero y
 * entenderian cosas distintas — una creeria que se vendieron cinco productos.
 *
 * Y SOLO CUENTAN LAS COBRADAS. Una cancelada no es un ingreso: contarla infla
 * el dia, y de ahi el mes.
 *
 * TODO SALE DE `resumen_de_ventas`, que suma en el servidor. Sumar aqui
 * obligaria a bajar el dia entero al navegador, y a los dos años de operacion
 * eso son varios segundos cada vez que alguien abre Ventas.
 */

import { formatearMoneda } from '@neron/base/utils';
import type { Categoria } from '../marca.js';
import type { ResumenDeVentas, VentaEnLista } from '../datos/ventas.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { COMO_SE_DICE_LA_VENTA } from './historial.js';

export interface CifraDelDia {
  readonly clave: string;
  readonly categoria: Categoria;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly valor: string;
  readonly pie: string;
  /** Que cuenta esa cifra. Se lee al pasar el puntero y con lector de pantalla. */
  readonly queCuenta: string;
  readonly cargando: boolean;
}

export function cifrasDelDia(r: ResumenDeVentas | null): CifraDelDia[] {
  const cargando = r === null;
  const n = (v: number): string => (cargando ? '—' : String(v));
  const m = (v: number): string => (cargando ? '' : formatearMoneda(v));

  return [
    {
      clave: 'ventas',
      categoria: 'ventas',
      etiqueta: 'Ventas',
      icono: 'bolsa',
      valor: n(r?.ventas ?? 0),
      pie: m(r?.totalCentavos ?? 0),
      queCuenta: 'Transacciones cobradas hoy, no piezas vendidas.',
      cargando,
    },
    {
      clave: 'servicios',
      categoria: 'citas',
      etiqueta: 'Servicios',
      icono: 'personas',
      valor: n(r?.servicios ?? 0),
      pie: m(r?.serviciosCentavos ?? 0),
      queCuenta: 'Servicios vendidos hoy, sumando las cantidades de cada renglón.',
      cargando,
    },
    {
      clave: 'productos',
      categoria: 'productos',
      etiqueta: 'Productos',
      icono: 'paquete',
      valor: n(r?.productos ?? 0),
      pie: m(r?.productosCentavos ?? 0),
      queCuenta: 'Piezas de producto vendidas hoy.',
      cargando,
    },
    {
      clave: 'cursos',
      categoria: 'cursos',
      etiqueta: 'Cursos',
      icono: 'birrete',
      valor: n(r?.cursos ?? 0),
      pie: m(r?.cursosCentavos ?? 0),
      queCuenta: 'Lugares de curso vendidos hoy.',
      cargando,
    },
  ];
}

export function EstadisticasDelDia({
  resumen,
  onVerReporte,
}: {
  readonly resumen: ResumenDeVentas | null;
  onVerReporte(): void;
}) {
  return (
    <section className="pz-tarjeta" aria-labelledby="vta-estadisticas-titulo">
      <header className="pz-cabecera">
        <h3 className="tt-tarjeta" id="vta-estadisticas-titulo">
          Estadísticas del día
        </h3>
        <button type="button" className="pz-enlace" onClick={onVerReporte}>
          Ver reporte completo
        </button>
      </header>

      <div className="vta-cifras mv-escalonado">
        {cifrasDelDia(resumen).map((c) => (
          <div key={c.clave} className={`pz-cifra pz-cifra--${c.categoria} vta-cifra`}>
            <span className="pz-cifra__icono" aria-hidden="true">
              <Icono nombre={c.icono} lado={18} />
            </span>
            <span className="pz-cifra__texto">
              <span className="pz-cifra__etiqueta" title={c.queCuenta}>
                {c.etiqueta}
              </span>
              <span
                className="pz-cifra__valor"
                aria-busy={c.cargando ? 'true' : undefined}
                aria-label={c.cargando ? `${c.etiqueta}: cargando` : `${c.etiqueta}: ${c.queCuenta}`}
              >
                {c.valor}
              </span>
              <span className="pz-cifra__pie">{c.pie || ' '}</span>
            </span>
          </div>
        ))}
      </div>

      {resumen && resumen.ticketPromedio !== null ? (
        <p className="tt-secundario">
          Ticket promedio: {formatearMoneda(resumen.ticketPromedio)} — lo cobrado entre las ventas
          cobradas.
        </p>
      ) : (
        // Sin ventas NO se pinta un ticket de cero: dividir entre cero no da
        // cero, no da nada. Se dice.
        <p className="tt-secundario">
          El ticket promedio aparece cuando haya al menos una venta cobrada hoy.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function UltimasDelDia({
  ventas,
  cargando,
  onAbrir,
}: {
  readonly ventas: readonly VentaEnLista[];
  readonly cargando: boolean;
  onAbrir(ventaId: string): void;
}) {
  return (
    <section className="pz-tarjeta" aria-labelledby="vta-ultimas-titulo">
      <h3 className="tt-tarjeta" id="vta-ultimas-titulo">
        Últimas ventas del día
      </h3>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando las ventas de hoy</span>
          {[0, 1].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      ) : ventas.length === 0 ? (
        <p className="pz-vacio__texto">No hay ventas registradas hoy.</p>
      ) : (
        <ul className="vta-ultimas mv-escalonado">
          {ventas.slice(0, 5).map((v) => (
            <li key={v.id} className="vta-ultima">
              <button type="button" className="vta-ultima__abrir" onClick={() => onAbrir(v.id)}>
                <span className="vta-ultima__hora">{horaDeLaVenta(v.creadoEn)}</span>
                <span className="vta-ultima__quien">
                  {v.cliente ?? <span className="tt-falta">Mostrador</span>}
                </span>
                <span className="vta-ultima__folio">{v.folio}</span>
                <span className="vta-ultima__total">{formatearMoneda(v.totalCentavos)}</span>
                <span className={`pz-pastilla vta-estado--${v.estado}`}>
                  {COMO_SE_DICE_LA_VENTA[v.estado] ?? v.estado}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * La hora de una venta, en local.
 *
 * Se parte del texto que manda el servidor en vez de formatearlo con `Intl`:
 * en una compilacion recortada de Node —o en el entorno de pruebas— `Intl`
 * devuelve otra cosa sin avisar. Un valor que no se entiende se dice vacio,
 * nunca una hora inventada.
 */
export function horaDeLaVenta(creadoEn: string): string {
  const marca = Date.parse(creadoEn);
  if (!Number.isFinite(marca)) return '';
  const d = new Date(marca);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
