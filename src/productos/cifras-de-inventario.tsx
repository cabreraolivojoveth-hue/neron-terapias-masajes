/**
 * LAS CUATRO TARJETAS DE INVENTARIO.
 *
 * EL VALOR DEL INVENTARIO VA CON EL COSTO, no con el precio de venta. Con el
 * precio, el numero sale inflado y se lee como si el centro tuviera ese
 * dinero: lo que hay en la vitrina vale lo que costo, y lo demas es una
 * ganancia que todavia no ocurre.
 *
 * Y EL COSTO NO ES PARA TODO EL MUNDO. Quien no tiene permiso recibe `null`
 * desde la base —no cero— y aqui la tarjeta lo DICE, en vez de enseñar un cero
 * que se leeria como "no hay inventario".
 */

import { formatearMoneda } from '@neron/base/utils';
import type { Categoria } from '../marca.js';
import type { ResumenDeProductos } from '../datos/productos.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

export interface CifraDeInventario {
  readonly clave: string;
  readonly categoria: Categoria;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly valor: string;
  readonly pie: string;
  readonly cargando: boolean;
}

export function cifrasDeInventario(r: ResumenDeProductos | null): CifraDeInventario[] {
  const cargando = r === null;

  return [
    {
      clave: 'total',
      categoria: 'citas',
      etiqueta: 'Total productos',
      icono: 'paquete',
      valor: cargando ? '—' : String(r!.total),
      pie: cargando ? '' : r!.total === 0 ? 'Sin productos registrados' : 'Productos activos',
      cargando,
    },
    {
      clave: 'valor',
      categoria: 'ventas',
      etiqueta: 'Valor de inventario',
      icono: 'dinero',
      // `null` es "no puedes verlo", que es OTRA cosa que "vale cero".
      valor: cargando ? '—' : r!.valorCentavos === null ? '—' : formatearMoneda(r!.valorCentavos),
      pie: cargando
        ? ''
        : r!.valorCentavos === null
          ? 'Tu rol no ve costos'
          : 'Costo total',
      cargando,
    },
    {
      clave: 'bajos',
      categoria: 'productos',
      etiqueta: 'Stock bajo',
      icono: 'alerta',
      valor: cargando ? '—' : String(r!.bajos),
      pie: cargando ? '' : r!.bajos === 0 ? 'Todo por encima del mínimo' : 'Requieren atención',
      cargando,
    },
    {
      clave: 'agotados',
      categoria: 'cursos',
      etiqueta: 'Agotados',
      icono: 'prohibido',
      valor: cargando ? '—' : String(r!.agotados),
      pie: cargando ? '' : r!.agotados === 0 ? 'Nada agotado' : 'Sin existencias',
      cargando,
    },
  ];
}

export function CifrasDeInventario({ resumen }: { readonly resumen: ResumenDeProductos | null }) {
  return (
    <section className="pz-cifras" aria-label="Resumen del inventario">
      {cifrasDeInventario(resumen).map((c) => (
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
            <span className="pz-cifra__pie">{c.pie || ' '}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
