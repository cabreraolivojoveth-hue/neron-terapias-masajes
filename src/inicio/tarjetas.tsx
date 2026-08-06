/**
 * LAS CUATRO TARJETAS DE ARRIBA: citas, ventas, inventario y cursos.
 *
 * QUE SE PINTA SE DECIDE EN UNA FUNCION PURA (`tarjetasDeInicio`) y el
 * componente solo pinta. Asi se puede probar sin navegador que una
 * recepcionista sin permiso de finanzas NO recibe la tarjeta de ventas — que
 * es una regla del producto, no un detalle de dibujo.
 *
 * DOS COSAS QUE PARECEN IGUALES Y NO LO SON:
 *
 *  · `null` es "todavia no llega" y se pinta con una raya. CERO es una
 *    respuesta real. Si mientras carga se mostrara `$0`, el dueño lee que hoy
 *    no ha vendido nada — y es la clase de error que nadie reporta porque no
 *    parece un error.
 *
 *  · La comparacion contra ayer sale de `comparar()` de la base, no de una
 *    division escrita aqui. Cuando ayer fue cero no hay porcentaje que sacar:
 *    dice "nuevo", no "+∞%" ni "+5000%". Es el numero que mas veces se ve mal
 *    hecho en un tablero.
 */

import { comparar, comoSeDice } from '@neron/base/tablero';
import { formatearMoneda } from '@neron/base/utils';
import type { Categoria } from '../marca.js';
import type { ResumenDeInicio } from '../datos/tablero.js';
import { Icono, type NombreDeIcono } from './iconos.js';

export interface Destino {
  readonly modulo: string;
  readonly parametros?: Readonly<Record<string, string>>;
}

export interface DescripcionDeTarjeta {
  readonly clave: string;
  readonly categoria: Categoria;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  /** `null` = todavia no llega. Distinto de cero, y a proposito. */
  readonly valor: number | null;
  readonly moneda: boolean;
  readonly ir: Destino;
  /** El mismo numero antes, para comparar. `null` = no hubo, no se compara. */
  readonly anterior?: number | null;
  /** El acceso del pie: "2 pendientes", "Revisar inventario". */
  readonly acceso?: { readonly texto: string; readonly ir: Destino };
}

/**
 * Que tarjetas ve ESTA persona.
 *
 * El permiso decide si la tarjeta EXISTE, no si se ve en gris. Una tarjeta
 * apagada es ruido y de paso le cuenta a quien no debe que esa cifra existe.
 *
 * Y no es la unica proteccion, ni la de verdad: aunque alguien borrara este
 * filtro, `resumen_inicio` corre con los permisos de quien llama y la base le
 * devuelve las ventas en cero. Esconder el boton es cortesia; la regla de fila
 * es el permiso.
 */
export function tarjetasDeInicio(
  resumen: ResumenDeInicio | null,
  permisos: Readonly<Record<string, boolean>>,
  hoy: string,
): DescripcionDeTarjeta[] {
  const salida: DescripcionDeTarjeta[] = [];
  const puede = (c: string): boolean => permisos[c] === true;

  if (puede('gestionarAgenda')) {
    const pendientes = resumen?.citasPendientes ?? 0;
    salida.push({
      clave: 'citas',
      categoria: 'citas',
      etiqueta: 'Citas hoy',
      icono: 'calendario',
      valor: resumen ? resumen.citasHoy : null,
      moneda: false,
      ir: { modulo: 'agenda', parametros: { fecha: hoy } },
      // Sin pendientes no se escribe "0 pendientes": no hay nada que atender y
      // un cero ahi solo ocupa una linea.
      ...(resumen && pendientes > 0
        ? {
            acceso: {
              texto: `${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}`,
              ir: { modulo: 'agenda', parametros: { fecha: hoy, estado: 'pendiente' } },
            },
          }
        : {}),
    });
  }

  if (puede('verFinanzas')) {
    salida.push({
      clave: 'ventas',
      categoria: 'ventas',
      etiqueta: 'Ventas hoy',
      icono: 'dinero',
      valor: resumen ? resumen.ventasHoy : null,
      moneda: true,
      anterior: resumen ? resumen.ventasAyer : null,
      ir: { modulo: 'ventas', parametros: { periodo: 'hoy' } },
    });
  }

  if (puede('gestionarInventario')) {
    salida.push({
      clave: 'productos',
      categoria: 'productos',
      etiqueta: 'Productos bajos',
      icono: 'paquete',
      valor: resumen ? resumen.productosBajos : null,
      moneda: false,
      ir: { modulo: 'productos', parametros: { existencia: 'baja' } },
      acceso: {
        texto: 'Revisar inventario',
        ir: { modulo: 'productos', parametros: { existencia: 'baja' } },
      },
    });
  }

  if (puede('gestionarCatalogo')) {
    salida.push({
      clave: 'cursos',
      categoria: 'cursos',
      etiqueta: 'Cursos próximos',
      icono: 'birrete',
      valor: resumen ? resumen.cursosProximos : null,
      moneda: false,
      ir: { modulo: 'cursos', parametros: { cuando: 'proximos' } },
      acceso: { texto: 'Ver calendario', ir: { modulo: 'cursos', parametros: { cuando: 'proximos' } } },
    });
  }

  return salida;
}

/** El numero, ya listo para leerse. `null` no se convierte en cero jamas. */
export function textoDelValor(valor: number | null, moneda: boolean): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  return moneda ? formatearMoneda(valor) : String(valor);
}

function Tarjeta({
  t,
  onIr,
}: {
  readonly t: DescripcionDeTarjeta;
  readonly onIr: (destino: Destino) => void;
}) {
  const cargando = t.valor === null;
  const comparacion =
    t.anterior === undefined ? null : comparar(t.valor, t.anterior, 'masEsMejor');

  const clases = [
    'ini-tarjeta',
    `ini-tarjeta--${t.categoria}`,
    comparacion?.esBueno === true ? 'ini-tarjeta--bien' : '',
    comparacion?.esBueno === false ? 'ini-tarjeta--mal' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={clases}>
      {/*
        La tarjeta entera es UN boton, y el pie es OTRO al lado — no uno dentro
        del otro. Un boton dentro de un boton es HTML invalido: el navegador lo
        desarma, y con teclado se vuelve imposible llegar al de adentro.
      */}
      <button type="button" className="ini-tarjeta__abrir" onClick={() => onIr(t.ir)}>
        <span className="ini-tarjeta__icono" aria-hidden="true">
          <Icono nombre={t.icono} lado={22} />
        </span>
        <span className="ini-tarjeta__texto">
          <span className="ini-tarjeta__etiqueta">{t.etiqueta}</span>
          <span
            className="ini-tarjeta__valor"
            aria-busy={cargando ? 'true' : undefined}
            aria-label={cargando ? `${t.etiqueta}: cargando` : undefined}
          >
            {textoDelValor(t.valor, t.moneda)}
          </span>
        </span>
      </button>

      {!cargando && comparacion?.hay ? (
        <p className="ini-tarjeta__pie ini-tarjeta__pie--cambio">
          {/* La flecha y el porcentaje son adorno para quien ve el color; la
              frase completa es lo que oye quien usa lector de pantalla. */}
          <span aria-hidden="true">
            {comparacion.direccion === 'sube' ? '↑' : comparacion.direccion === 'baja' ? '↓' : '='}{' '}
            {comparacion.texto} vs ayer
          </span>
          <span className="neron-solo-lectores">{comoSeDice(comparacion)} contra ayer</span>
        </p>
      ) : t.acceso && !cargando ? (
        <button
          type="button"
          className="ini-tarjeta__pie ini-tarjeta__pie--accion"
          onClick={() => onIr(t.acceso!.ir)}
        >
          {t.acceso.texto}
        </button>
      ) : (
        // El hueco se reserva SIEMPRE. Sin el, las tarjetas cambian de alto al
        // terminar de cargar y la fila entera da un brinco.
        <p className="ini-tarjeta__pie ini-tarjeta__pie--hueco" aria-hidden="true" />
      )}
    </div>
  );
}

export function Tarjetas({
  resumen,
  permisos,
  hoy,
  onIr,
}: {
  readonly resumen: ResumenDeInicio | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly hoy: string;
  readonly onIr: (destino: Destino) => void;
}) {
  const tarjetas = tarjetasDeInicio(resumen, permisos, hoy);
  if (tarjetas.length === 0) return null;

  return (
    <section className="ini-tarjetas" aria-label="Resumen del día">
      {tarjetas.map((t) => (
        <Tarjeta key={t.clave} t={t} onIr={onIr} />
      ))}
    </section>
  );
}
