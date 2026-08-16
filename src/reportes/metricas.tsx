/**
 * LAS CUATRO CIFRAS DE ARRIBA, CON SU COMPARACION.
 *
 * `null` es "todavia no llega" y se pinta con una raya; CERO es una respuesta
 * real. Si mientras carga se mostrara $0, quien lo mira lee que este periodo no
 * entro nada — y es la clase de error que nadie reporta porque no parece un
 * error.
 *
 * SIN PERIODO ANTERIOR SE DICE "Sin comparación disponible", nunca 0% ni +100%.
 * Es la regla que el encargo pedia por su nombre y la que mas veces se ve rota
 * en un tablero: dividir entre cero no da cero, no da nada. Un "+100%" contra
 * la nada es el numero mas facil de creerse y el mas falso, y en cuanto alguien
 * lo cacha deja de creerse tambien los que si eran ciertos.
 *
 * LAS CUATRO SALEN DE LA MISMA LLAMADA que el resto de la pantalla, asi que no
 * pueden estar hablando de otro periodo que las pestañas de abajo.
 */

import { formatearMoneda } from '@neron/base/utils';
import type { Categoria } from '../marca.js';
import type { Reporte } from '../datos/reportes.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { compararConAntes } from './periodo-del-reporte.js';

export interface CifraDelReporte {
  readonly clave: string;
  readonly categoria: Categoria;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly valor: string;
  readonly pie: string;
  /** `null` = no hay con que comparar, y entonces no se pinta flecha. */
  readonly sube: boolean | null;
  readonly cargando: boolean;
}

export function cifrasDelReporte(r: Reporte | null): CifraDelReporte[] {
  const cargando = r === null;
  const raya = '—';

  /**
   * La comparacion se pide DOS VECES: que haya periodo anterior con actividad
   * (`hayComparacion`, que lo dice el servidor mirando todas las tablas) y que
   * esta metrica en concreto tuviera algo. Sin la segunda, un centro que el mes
   * pasado vendio pero no dio de alta clientes veria "Sin comparación" en
   * ingresos y un porcentaje inventado en clientes.
   */
  const comparar = (ahora: number, antes: number): { texto: string; sube: boolean | null } => {
    if (cargando) return { texto: '', sube: null };
    const c = r.hayComparacion ? compararConAntes(ahora, antes) : null;
    return c
      ? { texto: `${c.texto} vs. período anterior`, sube: c.sube }
      : { texto: 'Sin comparación disponible', sube: null };
  };

  const ingresos = comparar(r?.metricas.ingresos ?? 0, r?.metricas.ingresosAntes ?? 0);
  const ventas = comparar(r?.metricas.ventas ?? 0, r?.metricas.ventasAntes ?? 0);
  const clientes = comparar(r?.metricas.clientes ?? 0, r?.metricas.clientesAntes ?? 0);
  const servicios = comparar(r?.metricas.servicios ?? 0, r?.metricas.serviciosAntes ?? 0);

  return [
    {
      clave: 'ingresos',
      categoria: 'ventas',
      etiqueta: 'Ingresos totales',
      icono: 'moneda',
      valor: cargando ? raya : formatearMoneda(r.metricas.ingresos),
      pie: ingresos.texto,
      sube: ingresos.sube,
      cargando,
    },
    {
      clave: 'ventas',
      categoria: 'productos',
      etiqueta: 'Ventas realizadas',
      icono: 'carrito',
      valor: cargando ? raya : String(r.metricas.ventas),
      pie: ventas.texto,
      sube: ventas.sube,
      cargando,
    },
    {
      clave: 'clientes',
      categoria: 'visitas',
      etiqueta: 'Clientes atendidos',
      icono: 'personas',
      valor: cargando ? raya : String(r.metricas.clientes),
      pie: clientes.texto,
      sube: clientes.sube,
      cargando,
    },
    {
      clave: 'servicios',
      categoria: 'citas',
      etiqueta: 'Servicios realizados',
      icono: 'recibo',
      valor: cargando ? raya : String(r.metricas.servicios),
      pie: servicios.texto,
      sube: servicios.sube,
      cargando,
    },
  ];
}

export function MetricasDelReporte({ reporte }: { readonly reporte: Reporte | null }) {
  return (
    <section className="pz-cifras mv-escalonado" aria-label="Resumen del período">
      {cifrasDelReporte(reporte).map((c) => (
        <div key={c.clave} className={`pz-cifra pz-cifra--${c.categoria}`}>
          <span className="pz-cifra__icono" aria-hidden="true">
            <Icono nombre={c.icono} lado={20} />
          </span>
          <span className="pz-cifra__texto">
            <span className="pz-cifra__etiqueta">{c.etiqueta}</span>
            <span
              className="pz-cifra__valor"
              aria-busy={c.cargando ? 'true' : undefined}
              aria-label={c.cargando ? `${c.etiqueta}: cargando` : undefined}
            >
              {c.valor}
            </span>
            {/* El hueco se reserva aunque el pie este vacio: sin eso, la fila da
                un brinco al terminar de cargar. */}
            <span
              className={[
                'pz-cifra__pie',
                c.sube === true ? 'rep-pie--sube' : '',
                c.sube === false ? 'rep-pie--baja' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {c.pie || ' '}
            </span>
          </span>
        </div>
      ))}
    </section>
  );
}
