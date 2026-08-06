/**
 * LAS ACCIONES RAPIDAS.
 *
 * CADA BOTON ABRE EL MODULO DUEÑO Y LE DEJA DICHO QUE HACER. No abre un
 * formulario propio de Inicio: si "Nuevo cliente" guardara clientes desde
 * aqui, Inicio pasaria de resumir a escribir, y habria dos formularios de alta
 * que a los seis meses piden campos distintos. Inicio deriva; los dueños
 * escriben. Es la regla que sostiene todo lo demas.
 *
 * EL RECADO VIAJA APARTE DE LA DIRECCION, con la `intencion` de la base. Si
 * fuera un parametro de la direccion —`?nuevo=1`— quedaria pegado: la persona
 * cierra el formulario, recarga, y se le vuelve a abrir; y si comparte el
 * enlace, tambien se le abre a quien lo reciba. La intencion se consume UNA
 * vez y desaparece.
 *
 * LO QUE NO SE PUEDE HACER NO SE MUESTRA. Ni en gris: un boton apagado es
 * ruido, y de paso le cuenta a quien no debe que esa operacion existe. Es la
 * misma regla del menu lateral.
 *
 * MIENTRAS UN MODULO NO LLEGUE, el boton sigue funcionando: lleva a su
 * pantalla, que dice con todas sus letras que falta y en que bloque llega —y
 * ademas repite el recado, para que se vea que el boton hizo algo. El dia que
 * el modulo aterrice, la intencion ya esta puesta y no hay que tocar nada
 * aqui.
 */

import { Icono, type NombreDeIcono } from '../ui/iconos.js';

export interface AccionRapida {
  readonly clave: string;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly modulo: string;
  /** `modulo:accion` — lo que el modulo destino consume al llegar. */
  readonly intencion?: string;
  /** La capacidad que hace falta. `null` = cualquier miembro. */
  readonly capacidad: string | null;
}

const TODAS: readonly AccionRapida[] = [
  {
    clave: 'venta',
    etiqueta: 'Nueva venta',
    icono: 'bolsa',
    modulo: 'ventas',
    intencion: 'ventas:nueva',
    capacidad: 'cobrar',
  },
  {
    clave: 'cliente',
    etiqueta: 'Nuevo cliente',
    icono: 'personaMas',
    modulo: 'clientes',
    intencion: 'clientes:nuevo',
    capacidad: 'gestionarClientes',
  },
  {
    clave: 'cita',
    etiqueta: 'Nueva cita',
    icono: 'calendario',
    modulo: 'agenda',
    intencion: 'agenda:nueva',
    capacidad: 'gestionarAgenda',
  },
  {
    clave: 'pago',
    etiqueta: 'Registrar pago',
    icono: 'recibo',
    modulo: 'ventas',
    // Va a VENTAS, no a Caja. Un pago pertenece a una venta: la caja se mueve
    // sola cuando esa venta se cobra. Un ingreso capturado suelto en caja
    // dejaria de poder rastrearse hasta la operacion que lo produjo, y ahi se
    // acaba la posibilidad de auditarla.
    intencion: 'ventas:pago',
    capacidad: 'cobrar',
  },
  {
    clave: 'gasto',
    etiqueta: 'Nuevo gasto',
    icono: 'salida',
    modulo: 'gastos',
    intencion: 'gastos:nuevo',
    capacidad: 'verFinanzas',
  },
  {
    clave: 'reportes',
    etiqueta: 'Ver reportes',
    icono: 'barras',
    modulo: 'reportes',
    capacidad: 'verFinanzas',
  },
];

export function accionesRapidas(permisos: Readonly<Record<string, boolean>>): AccionRapida[] {
  return TODAS.filter((a) => a.capacidad === null || permisos[a.capacidad] === true);
}

export function AccionesRapidas({
  permisos,
  onAccion,
}: {
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly onAccion: (accion: AccionRapida) => void;
}) {
  const acciones = accionesRapidas(permisos);
  if (acciones.length === 0) return null;

  return (
    <section className="ini-panel ini-acciones" aria-labelledby="ini-acciones-titulo">
      <h3 className="ini-panel__titulo" id="ini-acciones-titulo">
        Acciones rápidas
      </h3>
      <div className="ini-acciones__fila">
        {acciones.map((a) => (
          <button
            key={a.clave}
            type="button"
            className={`ini-accion ini-accion--${a.clave}`}
            onClick={() => onAccion(a)}
          >
            <span className="ini-accion__icono" aria-hidden="true">
              <Icono nombre={a.icono} lado={18} />
            </span>
            <span className="ini-accion__texto">{a.etiqueta}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
