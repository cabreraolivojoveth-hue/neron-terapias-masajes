/**
 * LAS CIFRAS DE CLIENTES: las cinco tarjetas de arriba y el resumen del pie.
 *
 * NINGUNA ESTA GUARDADA. Las once salen de `resumen_clientes`, que las cuenta
 * desde su modulo dueño: las visitas desde Agenda, las compras desde Ventas,
 * el adeudo desde Ventas menos Pagos, los cursos desde Inscripciones.
 *
 * Guardar un `total_visitas` en la tabla del cliente parece mas rapido y es la
 * decision que rompe el modulo: a la primera cita cancelada el contador y la
 * realidad dejan de coincidir, y a partir de ahi hay dos numeros verdaderos.
 *
 * `null` es "todavia no llega" y se pinta con una raya; CERO es una respuesta
 * real. Un tablero que muestra 0 mientras carga le dice a la dueña que no
 * tiene clientes, y es la clase de error que nadie reporta.
 *
 * LA LINEA DE ABAJO DE CADA TARJETA EXPLICA LA REGLA. "Activo" e "inactivo" no
 * son opiniones: la base las define en `app.meses_de_actividad()` y
 * `app.visitas_para_ser_frecuente()`, y la tarjeta dice cual se aplico. Sin
 * eso, el numero es un misterio y cada quien le supone una regla distinta.
 */

import { formatearMoneda } from '@neron/base/utils';
import type { Categoria } from '../marca.js';
import type { ResumenDeClientes } from '../datos/clientes.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

export interface Cifra {
  readonly clave: string;
  readonly categoria: Categoria;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  /** `null` = todavia no llega. Distinto de cero, y a proposito. */
  readonly valor: number | null;
  readonly moneda?: boolean;
  /** Que significa el numero, o que falta cuando esta en cero. */
  readonly pie: string;
}

const MESES_DE_ACTIVIDAD = 6;
const VISITAS_PARA_SER_FRECUENTE = 5;

/** Las cinco de arriba. El texto del pie cambia segun haya datos o no. */
export function cifrasDeArriba(r: ResumenDeClientes | null): Cifra[] {
  const v = <K extends keyof ResumenDeClientes>(k: K): number | null =>
    r ? (r[k] as number) : null;
  const pie = (n: number | null, sin: string, con: string): string =>
    n === null ? '' : n === 0 ? sin : con;

  return [
    {
      clave: 'total',
      categoria: 'citas',
      etiqueta: 'Clientes totales',
      icono: 'personas',
      valor: v('total'),
      pie: pie(v('total'), 'Sin clientes registrados', 'En el directorio'),
    },
    {
      clave: 'activos',
      categoria: 'ventas',
      etiqueta: 'Clientes activos',
      icono: 'persona',
      valor: v('activos'),
      pie: pie(
        v('activos'),
        'Sin clientes activos',
        `Con visita en los últimos ${MESES_DE_ACTIVIDAD} meses`,
      ),
    },
    {
      clave: 'nuevos',
      categoria: 'cursos',
      etiqueta: 'Nuevos este mes',
      icono: 'calendario',
      valor: v('nuevosEsteMes'),
      pie: pie(v('nuevosEsteMes'), 'Sin nuevos registros', 'Dados de alta este mes'),
    },
    {
      clave: 'frecuentes',
      categoria: 'productos',
      etiqueta: 'Clientes frecuentes',
      icono: 'estrella',
      valor: v('frecuentes'),
      pie: pie(
        v('frecuentes'),
        'Sin datos',
        `Con ${VISITAS_PARA_SER_FRECUENTE} sesiones o más`,
      ),
    },
    {
      clave: 'visitas',
      categoria: 'visitas',
      etiqueta: 'Total de visitas',
      icono: 'corazon',
      valor: v('totalVisitas'),
      pie: pie(v('totalVisitas'), 'Sin visitas registradas', 'Sesiones completadas'),
    },
  ];
}

/** Las cinco del pie. Cada una vive en otro modulo y aqui solo se consulta. */
export function cifrasDelPie(r: ResumenDeClientes | null): Cifra[] {
  const v = <K extends keyof ResumenDeClientes>(k: K): number | null =>
    r ? (r[k] as number) : null;

  return [
    {
      clave: 'citas',
      categoria: 'citas',
      etiqueta: 'Citas programadas',
      icono: 'calendario',
      valor: v('citasProximas'),
      pie: 'Próximos 7 días',
    },
    {
      clave: 'servicios',
      categoria: 'ventas',
      etiqueta: 'Servicios contratados',
      icono: 'bolsa',
      valor: v('serviciosContratados'),
      pie: 'Total',
    },
    {
      clave: 'compras',
      categoria: 'cursos',
      etiqueta: 'Compras realizadas',
      icono: 'paquete',
      valor: v('comprasRealizadas'),
      pie: 'Total',
    },
    {
      clave: 'cursos',
      categoria: 'productos',
      etiqueta: 'Cursos inscritos',
      icono: 'birrete',
      valor: v('cursosInscritos'),
      pie: 'Total',
    },
    {
      clave: 'adeudos',
      categoria: 'visitas',
      etiqueta: 'Total adeudos',
      icono: 'recibo',
      valor: v('totalAdeudos'),
      moneda: true,
      pie: v('totalAdeudos') === 0 ? 'Sin adeudos' : 'Cobrado menos pagado',
    },
  ];
}

/** El numero listo para leerse. `null` nunca se convierte en cero. */
export function textoDeLaCifra(valor: number | null, moneda = false): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  return moneda ? formatearMoneda(valor) : String(valor);
}

function Tarjeta({ c }: { readonly c: Cifra }) {
  const cargando = c.valor === null;
  return (
    <div className={`pz-cifra pz-cifra--${c.categoria}`}>
      <span className="pz-cifra__icono" aria-hidden="true">
        <Icono nombre={c.icono} lado={20} />
      </span>
      <span className="pz-cifra__texto">
        <span className="pz-cifra__etiqueta">{c.etiqueta}</span>
        <span
          className="pz-cifra__valor"
          aria-busy={cargando ? 'true' : undefined}
          aria-label={cargando ? `${c.etiqueta}: cargando` : undefined}
        >
          {textoDeLaCifra(c.valor, c.moneda)}
        </span>
        {/* El hueco se reserva aunque el pie este vacio: sin eso, la fila da un
            brinco al terminar de cargar. */}
        <span className="pz-cifra__pie">{c.pie || ' '}</span>
      </span>
    </div>
  );
}

export function CifrasDeArriba({ resumen }: { readonly resumen: ResumenDeClientes | null }) {
  return (
    <section className="pz-cifras mv-escalonado" aria-label="Resumen de clientes">
      {cifrasDeArriba(resumen).map((c) => (
        <Tarjeta key={c.clave} c={c} />
      ))}
    </section>
  );
}

export function ResumenGeneral({ resumen }: { readonly resumen: ResumenDeClientes | null }) {
  return (
    <section className="pz-tarjeta cli-resumen" aria-labelledby="cli-resumen-titulo">
      <h3 className="tt-tarjeta" id="cli-resumen-titulo">
        Resumen general
      </h3>
      {/* Cinco cifras, y por eso "cli-resumen__cifras" y no la rejilla de
          siempre: con el minimo de doscientos treinta caben cuatro y la quinta
          se quedaba sola en una fila, con tres huecos al lado. */}
      <div className="pz-cifras cli-resumen__cifras mv-escalonado">
        {cifrasDelPie(resumen).map((c) => (
          <Tarjeta key={c.clave} c={c} />
        ))}
      </div>
    </section>
  );
}
