/**
 * LAS CUATRO TARJETAS DEL CATALOGO.
 *
 * Ninguna esta guardada: las cuatro salen de `resumen_servicios`, que las
 * cuenta desde la tabla. Guardar un `duracion_promedio` en algun lado obliga a
 * recalcularlo cada vez que alguien edita un servicio, y el dia que ese
 * recalculo falle el numero se queda viejo sin que nada avise.
 *
 * DOS DISTINCIONES QUE IMPORTAN:
 *
 * · `null` es "todavia no llega" y se pinta con una raya. CERO es una
 *   respuesta real.
 *
 * · La duracion promedio devuelve `null` cuando no hay ni un servicio activo.
 *   "0 min" seria mentira: no es que las sesiones duren cero, es que no hay
 *   sesiones que promediar.
 */

import type { Categoria } from '../marca.js';
import type { ResumenDeServicios } from '../datos/servicios.js';
import { porcentajeDe } from '../datos/servicios.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

export interface CifraDeServicio {
  readonly clave: string;
  readonly categoria: Categoria;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly valor: string;
  readonly pie: string;
  readonly cargando: boolean;
}

/** El numero listo para leerse. `null` nunca se convierte en cero. */
export function textoDelNumero(valor: number | null, sufijo = ''): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  return sufijo ? `${valor} ${sufijo}` : String(valor);
}

export function cifrasDeServicios(r: ResumenDeServicios | null): CifraDeServicio[] {
  const cargando = r === null;
  const pctActivos = r ? porcentajeDe(r.activos, r.total) : null;
  const pctInactivos = r ? porcentajeDe(r.inactivos, r.total) : null;

  return [
    {
      clave: 'total',
      categoria: 'citas',
      etiqueta: 'Total servicios',
      icono: 'bolsa',
      valor: textoDelNumero(r?.total ?? null),
      pie: cargando ? '' : r!.total === 0 ? 'Sin servicios registrados' : 'En el catálogo',
      cargando,
    },
    {
      clave: 'activos',
      categoria: 'ventas',
      etiqueta: 'Servicios activos',
      icono: 'palomita',
      valor: textoDelNumero(r?.activos ?? null),
      // El porcentaje SOLO cuando hay de que sacarlo: sin servicios,
      // dividir daria NaN y terminaria impreso como "NaN% del total".
      pie: cargando ? '' : pctActivos === null ? 'Sin servicios activos' : `${pctActivos}% del total`,
      cargando,
    },
    {
      clave: 'inactivos',
      categoria: 'productos',
      etiqueta: 'Servicios inactivos',
      icono: 'prohibido',
      valor: textoDelNumero(r?.inactivos ?? null),
      pie: cargando
        ? ''
        : pctInactivos === null
          ? 'Sin servicios apagados'
          : `${pctInactivos}% del total`,
      cargando,
    },
    {
      clave: 'duracion',
      categoria: 'cursos',
      etiqueta: 'Duración promedio',
      icono: 'reloj',
      valor: textoDelNumero(r?.duracionPromedio ?? null, 'min'),
      pie: cargando
        ? ''
        : r!.duracionPromedio === null
          ? 'Sin datos todavía'
          : 'De los servicios activos',
      cargando,
    },
  ];
}

export function CifrasDeServicios({ resumen }: { readonly resumen: ResumenDeServicios | null }) {
  return (
    <section className="pz-cifras" aria-label="Resumen del catálogo">
      {cifrasDeServicios(resumen).map((c) => (
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
