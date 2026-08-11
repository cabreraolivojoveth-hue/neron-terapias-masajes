/**
 * LAS CUATRO TARJETAS DE CURSOS.
 *
 * Ninguna esta guardada: las cuatro salen de `resumen_cursos`, que las cuenta
 * desde la tabla. Guardar `proximos = 3` deja el numero viejo en cuanto pasa
 * un dia, y nadie se entera.
 *
 * "ALUMNOS INSCRITOS" NECESITA UNA DEFINICION, y esta es la que se uso:
 * inscripciones VIVAS —ni canceladas ni en lista de espera— en cursos que
 * todavia no terminan. No es la suma de los cupos, que seria la capacidad; ni
 * el historico, que crece para siempre y no dice nada del mes que viene.
 *
 * Y `null` es "todavia no llega", que se pinta con una raya. CERO es una
 * respuesta real.
 */

import type { Categoria } from '../marca.js';
import type { ResumenDeCursos } from '../datos/cursos.js';
import { porcentajeDe } from '../datos/servicios.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

export interface CifraDeCurso {
  readonly clave: string;
  readonly categoria: Categoria;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly valor: string;
  readonly pie: string;
  readonly cargando: boolean;
}

/** El numero listo para leerse. `null` nunca se convierte en cero. */
export function textoDeLaCifra(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  return String(valor);
}

export function cifrasDeCursos(r: ResumenDeCursos | null): CifraDeCurso[] {
  const cargando = r === null;
  const pctActivos = r ? porcentajeDe(r.activos, r.total) : null;

  return [
    {
      clave: 'total',
      categoria: 'cursos',
      etiqueta: 'Total cursos',
      icono: 'birrete',
      valor: textoDeLaCifra(r?.total ?? null),
      pie: cargando ? '' : r!.total === 0 ? 'Sin cursos registrados' : 'Todos los cursos',
      cargando,
    },
    {
      clave: 'activos',
      categoria: 'ventas',
      etiqueta: 'Cursos activos',
      icono: 'personas',
      valor: textoDeLaCifra(r?.activos ?? null),
      // El porcentaje SOLO cuando hay de que sacarlo: sin cursos, dividir
      // daria NaN y terminaria impreso como "NaN% del total".
      pie: cargando
        ? ''
        : pctActivos === null
          ? 'Sin cursos en marcha'
          : `${pctActivos}% del total`,
      cargando,
    },
    {
      clave: 'proximos',
      categoria: 'productos',
      etiqueta: 'Próximos cursos',
      icono: 'calendario',
      valor: textoDeLaCifra(r?.proximos ?? null),
      pie: cargando ? '' : 'En los próximos 30 días',
      cargando,
    },
    {
      clave: 'alumnos',
      categoria: 'visitas',
      etiqueta: 'Alumnos inscritos',
      icono: 'persona',
      valor: textoDeLaCifra(r?.alumnos ?? null),
      // Se dice de DONDE sale el numero. "42" sin decir que cuenta deja a cada
      // quien suponiendo una cosa distinta.
      pie: cargando
        ? ''
        : r!.alumnos === 0
          ? 'Sin inscripciones todavía'
          : 'En cursos vigentes y próximos',
      cargando,
    },
  ];
}

export function CifrasDeCursos({ resumen }: { readonly resumen: ResumenDeCursos | null }) {
  return (
    <section className="pz-cifras mv-escalonado" aria-label="Resumen de cursos">
      {cifrasDeCursos(resumen).map((c) => (
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
