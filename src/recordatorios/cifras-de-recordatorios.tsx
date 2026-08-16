/**
 * LAS CUATRO CIFRAS DE ARRIBA.
 *
 * `null` es "todavia no llega" y se pinta con una raya; CERO es una respuesta
 * real. Si mientras carga se mostrara 0, quien lo mira lee que no tiene nada
 * pendiente — y es la clase de error que nadie reporta porque no parece un
 * error: parece un dia tranquilo.
 *
 * EL PIE DE CADA TARJETA CAMBIA CON EL NUMERO. "Recordatorios por hacer" sobre
 * un cero es una etiqueta muerta; "Sin recordatorios pendientes" es una
 * respuesta. Es la diferencia entre una pantalla que informa y una que solo
 * tiene huecos rellenos.
 *
 * SE PUEDE TOCAR CADA UNA. Una cifra que cuenta doce cosas y no lleva a
 * ninguna obliga a ir a buscarlas a mano en la lista de abajo — y la primera
 * vez que alguien lo intenta y no pasa nada, deja de intentarlo.
 */

import type { Categoria } from '../marca.js';
import type { PestanaDeRecordatorios, ResumenDeRecordatorios } from '../datos/recordatorios.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

export interface CifraDeRecordatorios {
  readonly clave: string;
  readonly categoria: Categoria;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly valor: string;
  readonly pie: string;
  readonly cargando: boolean;
  /** A que pestaña lleva al tocarla. */
  readonly pestana: PestanaDeRecordatorios;
}

export function cifrasDeRecordatorios(
  r: ResumenDeRecordatorios | null,
): CifraDeRecordatorios[] {
  const cargando = r === null;
  const raya = '—';
  const cuantos = (n: number): string => (cargando ? raya : String(n));

  return [
    {
      clave: 'pendientes',
      categoria: 'ventas',
      etiqueta: 'Pendientes',
      icono: 'campana',
      valor: cuantos(r?.pendientes ?? 0),
      pie: cargando
        ? ''
        : r!.pendientes === 0
          ? 'Sin recordatorios pendientes'
          : r!.vencidos > 0
            ? `${r!.vencidos} ${r!.vencidos === 1 ? 'ya venció' : 'ya vencieron'}`
            : 'Recordatorios por hacer',
      cargando,
      pestana: 'pendientes',
    },
    {
      clave: 'hoy',
      categoria: 'productos',
      etiqueta: 'Hoy',
      icono: 'reloj',
      valor: cuantos(r?.hoy ?? 0),
      pie: cargando ? '' : r!.hoy === 0 ? 'Nada vence hoy' : 'Vencen hoy',
      cargando,
      pestana: 'hoy',
    },
    {
      clave: 'proximos',
      categoria: 'cursos',
      // LA VENTANA ES LA CONFIGURADA, no un 7 escrito a mano. Si el centro la
      // sube a 30, la etiqueta lo dice y la cifra cuenta lo mismo que la
      // pestaña — que es lo unico que impide dos numeros distintos en la misma
      // pantalla.
      etiqueta: `Próximos ${r?.diasDeProximos ?? 7} días`,
      icono: 'calendario',
      valor: cuantos(r?.proximos ?? 0),
      pie: cargando ? '' : r!.proximos === 0 ? 'No hay recordatorios próximos' : 'Recordatorios próximos',
      cargando,
      pestana: 'proximos',
    },
    {
      clave: 'completados',
      categoria: 'citas',
      etiqueta: 'Completados',
      icono: 'palomita',
      valor: cuantos(r?.completados ?? 0),
      pie: cargando ? '' : r!.completados === 0 ? 'Ninguno este mes' : 'Este mes',
      cargando,
      pestana: 'completados',
    },
  ];
}

export function CifrasDeRecordatorios({
  resumen,
  onIr,
}: {
  readonly resumen: ResumenDeRecordatorios | null;
  onIr(pestana: PestanaDeRecordatorios): void;
}) {
  return (
    <section className="pz-cifras mv-escalonado" aria-label="Resumen de recordatorios">
      {cifrasDeRecordatorios(resumen).map((c) => (
        <button
          key={c.clave}
          type="button"
          className={`pz-cifra pz-cifra--${c.categoria} rec-cifra`}
          onClick={() => onIr(c.pestana)}
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
        </button>
      ))}
    </section>
  );
}
