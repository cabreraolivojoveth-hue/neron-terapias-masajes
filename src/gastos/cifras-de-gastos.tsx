/**
 * LAS CUATRO CIFRAS DE ARRIBA.
 *
 * `null` es "todavia no llega" y se pinta con una raya; CERO es una respuesta
 * real. Si mientras carga se mostrara $0, quien lo mira lee que este mes no ha
 * gastado nada — y es la clase de error que nadie reporta porque no parece un
 * error.
 *
 * EL PROMEDIO SE SACA ENTRE LOS DIAS DEL PERIODO, no entre los gastos. La
 * pregunta que se hace quien mira un tablero es "cuanto me esta costando al
 * dia", no "cuanto vale un gasto tipico". Los dos numeros son legitimos y
 * distintos, y por eso la tarjeta dice cual es.
 *
 * EL MAYOR GASTO LLEVA SU CONCEPTO. Un numero solo —"$10,000"— obliga a ir a
 * buscar de que fue; con el concepto al lado, la tarjeta ya contesto.
 */

import { formatearMoneda } from '@neron/base/utils';
import type { Categoria } from '../marca.js';
import type { ResumenDeGastos } from '../datos/gastos.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { compararGasto } from './periodos.js';

export interface CifraDeGasto {
  readonly clave: string;
  readonly categoria: Categoria;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly valor: string;
  readonly pie: string;
  /** Verde cuando gastar menos; rojo cuando mas. `null` = no aplica. */
  readonly esBueno: boolean | null;
  readonly cargando: boolean;
}

export function cifrasDeGastos(r: ResumenDeGastos | null): CifraDeGasto[] {
  const cargando = r === null;
  const raya = '—';

  const cambio = r && r.hayComparacion ? compararGasto(r.totalCentavos, r.anteriorCentavos) : null;

  return [
    {
      clave: 'total',
      categoria: 'ventas',
      etiqueta: 'Total gastos',
      icono: 'moneda',
      valor: cargando ? raya : formatearMoneda(r.totalCentavos),
      // SIN PERIODO ANTERIOR SE DICE, no se inventa un porcentaje contra cero.
      pie: cargando
        ? ''
        : cambio
          ? `${cambio.sube ? '↑' : '↓'} ${cambio.texto} vs periodo anterior`
          : 'Sin comparación disponible',
      esBueno: cambio ? cambio.esBueno : null,
      cargando,
    },
    {
      clave: 'promedio',
      categoria: 'citas',
      etiqueta: 'Gasto promedio diario',
      icono: 'barras',
      valor: cargando ? raya : formatearMoneda(r.promedioDiarioCentavos),
      pie: cargando ? '' : `Entre ${r.dias} ${r.dias === 1 ? 'día' : 'días'} del periodo`,
      esBueno: null,
      cargando,
    },
    {
      clave: 'cuantos',
      categoria: 'productos',
      etiqueta: 'Gastos este periodo',
      icono: 'recibo',
      valor: cargando ? raya : String(r.cuantos),
      pie: cargando ? '' : r.cuantos === 0 ? 'Sin gastos registrados' : 'Registrados',
      esBueno: null,
      cargando,
    },
    {
      clave: 'mayor',
      categoria: 'cursos',
      etiqueta: 'Mayor gasto',
      icono: 'alerta',
      valor: cargando ? raya : r.mayor ? formatearMoneda(r.mayor.centavos) : 'Sin datos',
      pie: cargando ? '' : (r.mayor?.concepto ?? ''),
      esBueno: null,
      cargando,
    },
  ];
}

export function CifrasDeGastos({ resumen }: { readonly resumen: ResumenDeGastos | null }) {
  return (
    <section className="pz-cifras mv-escalonado" aria-label="Resumen de gastos del periodo">
      {cifrasDeGastos(resumen).map((c) => (
        <div
          key={c.clave}
          className={[
            'pz-cifra',
            `pz-cifra--${c.categoria}`,
            c.esBueno === true ? 'gto-cifra--baja' : '',
            c.esBueno === false ? 'gto-cifra--sube' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
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
            {/* El hueco se reserva aunque el pie este vacio: sin eso, la fila
                da un brinco al terminar de cargar. */}
            <span className="pz-cifra__pie">{c.pie || ' '}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
