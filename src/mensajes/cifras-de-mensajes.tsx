/**
 * LAS CUATRO CIFRAS DE MENSAJES.
 *
 * Mismas dos reglas que en Reportes y en Gastos, porque son las mismas dos
 * formas de mentir con un tablero:
 *
 *   · `null` es "todavía no llega" y se pinta con una raya. CERO es una
 *     respuesta real. Si mientras carga se enseñara 0, quien lo mira lee que
 *     hoy no le escribió nadie — y todavía no se sabe.
 *   · Sin periodo anterior con actividad se dice "Sin comparación disponible",
 *     nunca 0% ni +100%. Dividir entre cero no da cero: no da nada.
 *
 * LA COMPARACIÓN SE REUSA de `reportes/periodo-del-reporte.js`. Es exactamente
 * la misma pregunta —cuánto cambió esto contra el periodo anterior— y escribirla
 * dos veces es como se acaba con dos redondeos distintos en dos pantallas.
 */

import type { Categoria } from '../marca.js';
import type { ResumenDeMensajes } from '../datos/mensajes.js';
import { compararConAntes } from '../reportes/periodo-del-reporte.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';

export interface CifraDeMensajes {
  readonly clave: string;
  readonly categoria: Categoria;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly valor: string;
  readonly pie: string;
  /** `null` = no hay con qué comparar, y entonces no se pinta flecha. */
  readonly sube: boolean | null;
  readonly cargando: boolean;
}

export function cifrasDeMensajes(r: ResumenDeMensajes | null): CifraDeMensajes[] {
  const cargando = r === null;
  const raya = '—';

  const comparar = (ahora: number, antes: number): { texto: string; sube: boolean | null } => {
    if (cargando) return { texto: '', sube: null };
    const c = r.hayComparacion ? compararConAntes(ahora, antes) : null;
    return c
      ? { texto: `${c.texto} vs. período anterior`, sube: c.sube }
      : { texto: 'Sin comparación disponible', sube: null };
  };

  const enviados = comparar(r?.enviados ?? 0, r?.enviadosAntes ?? 0);
  const recibidos = comparar(r?.recibidos ?? 0, r?.recibidosAntes ?? 0);

  return [
    {
      clave: 'activas',
      categoria: 'citas',
      etiqueta: 'Conversaciones activas',
      icono: 'mensaje',
      valor: cargando ? raya : String(r.activas),
      // No es una comparación: es QUÉ cuenta esa cifra. Una conversación puede
      // no tener cliente identificado todavía, así que los dos números no
      // coinciden y decirlo evita que parezca un error.
      pie: cargando
        ? ''
        : r.activas === 0
          ? 'Nadie te ha escrito todavía'
          : `${r.clientesEnConversacion} ${r.clientesEnConversacion === 1 ? 'cliente' : 'clientes'} identificados`,
      sube: null,
      cargando,
    },
    {
      clave: 'enviados',
      categoria: 'ventas',
      etiqueta: 'Mensajes enviados',
      icono: 'sobre',
      valor: cargando ? raya : String(r.enviados),
      pie: enviados.texto,
      sube: enviados.sube,
      cargando,
    },
    {
      clave: 'recibidos',
      categoria: 'visitas',
      etiqueta: 'Mensajes recibidos',
      icono: 'palomita',
      valor: cargando ? raya : String(r.recibidos),
      pie: recibidos.texto,
      sube: recibidos.sube,
      cargando,
    },
    {
      clave: 'pendientes',
      categoria: 'productos',
      etiqueta: 'Pendientes de respuesta',
      icono: 'reloj',
      valor: cargando ? raya : String(r.pendientes),
      pie: cargando
        ? ''
        : r.pendientes === 0
          ? 'No hay nadie esperando'
          : 'Requieren tu atención',
      sube: null,
      cargando,
    },
  ];
}

export function CifrasDeMensajes({ resumen }: { readonly resumen: ResumenDeMensajes | null }) {
  return (
    <section className="pz-cifras mv-escalonado" aria-label="Resumen de la mensajería">
      {cifrasDeMensajes(resumen).map((c) => (
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
            {/* El hueco se reserva aunque el pie esté vacío: sin eso, la fila
                da un brinco al terminar de cargar. */}
            <span
              className={[
                'pz-cifra__pie',
                c.sube === true ? 'rep-pie--sube' : '',
                c.sube === false ? 'rep-pie--baja' : '',
              ].filter(Boolean).join(' ')}
            >
              {c.pie || ' '}
            </span>
          </span>
        </div>
      ))}
    </section>
  );
}
