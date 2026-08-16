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
    // El modulo es "caja" desde que se unio con Ventas; el recado sigue siendo
    // de "ventas" porque es el punto de venta quien lo consume.
    modulo: 'caja',
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
    modulo: 'caja',
    // Abre COBRAR, no el cajon. Un pago pertenece a una venta: la caja se mueve
    // sola cuando esa venta se cobra. Un ingreso capturado suelto en el cajon
    // dejaria de poder rastrearse hasta la operacion que lo produjo, y ahi se
    // acaba la posibilidad de auditarla.
    intencion: 'ventas:nueva',
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
    <section className="pz-tarjeta" aria-labelledby="ini-acciones-titulo">
      <h3 className="tt-tarjeta" id="ini-acciones-titulo">
        Acciones rápidas
      </h3>
      <div className="pz-acciones mv-escalonado">
        {acciones.map((a) => (
          <button
            key={a.clave}
            type="button"
            className={`pz-boton ini-accion ini-accion--${a.clave}`}
            onClick={() => onAccion(a)}
          >
            <span className="pz-ficha" aria-hidden="true">
              <Icono nombre={a.icono} lado={18} />
            </span>
            <span className="pz-renglon__titulo">{a.etiqueta}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
