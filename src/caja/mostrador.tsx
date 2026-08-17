/**
 * EL MOSTRADOR — cobrar y el cajón en UNA sola pantalla.
 *
 * POR QUE SE UNIERON VENTAS Y CAJA, que es la razón de que este archivo exista:
 *
 * Eran dos módulos del menú, y quien los usa es UNA persona parada en el
 * mostrador todo el día. Cobrar estaba en Ventas y el cajón en Caja, así que
 * atender a alguien y luego cuadrar el efectivo obligaba a saltar de pantalla en
 * pantalla, todo el día, para hacer un solo trabajo.
 *
 * LO QUE NO SE UNIO, Y NO SE PODIA: el corte. Ventas sabe cuánto se cobró; el
 * cajón sabe cuánto hay físicamente en el cajón. Compararlos es lo ÚNICO en todo
 * el sistema que detecta que falta dinero, y para eso los dos tienen que seguir
 * existiendo por dentro. Se juntó la pantalla, no las cuentas.
 *
 * TAMPOCO SE DUPLICO NADA. Este archivo no reimplementa el punto de venta ni el
 * cajón: los monta y les pone un solo encabezado y una sola barra de pestañas.
 * Reescribirlos habría sido copiar cuatro mil líneas para que después se
 * desviaran una de la otra — el error más caro del proyecto, otra vez.
 *
 * LAS PESTAÑAS SE FILTRAN POR PERMISO, no se apagan. Quien solo puede cobrar no
 * ve el cajón ni el corte: no le aparecen. Media barra en gris le cuenta a quien
 * no debe que esas cuentas existen. Y no es la única protección — la base
 * tampoco le entrega esos números.
 */

import { ponerIntencion, tomarIntencion, type Intencion } from '@neron/base/marco';
import { useEffect, useRef, useState } from 'react';
import { useSesion } from '../identidad/sesion.js';
import { Cajon } from './cajon.js';
import { PuntoDeVenta } from '../ventas/punto-de-venta.js';

/**
 * Las pestañas del mostrador, en el orden en que se trabaja.
 *
 * "Cobrar" va primera y es la que abre: es donde se pasa el día. Las otras se
 * visitan de vez en cuando — al cerrar el turno, al buscar una venta de la
 * semana pasada.
 *
 * `capacidad` es el permiso que hace falta para que la pestaña EXISTA. `de` dice
 * quién la pinta y `dentro` en qué se traduce para ese componente.
 */
export const PESTANAS_DEL_MOSTRADOR: readonly {
  clave: string;
  etiqueta: string;
  capacidad: string;
  de: 'venta' | 'cajon';
  dentro: string;
}[] = [
  { clave: 'cobrar', etiqueta: 'Cobrar', capacidad: 'cobrar', de: 'venta', dentro: 'nueva' },
  { clave: 'dia', etiqueta: 'Ventas del día', capacidad: 'cobrar', de: 'venta', dentro: 'dia' },
  { clave: 'historial', etiqueta: 'Historial', capacidad: 'cobrar', de: 'venta', dentro: 'historial' },
  {
    clave: 'cotizaciones', etiqueta: 'Cotizaciones', capacidad: 'cobrar',
    de: 'venta', dentro: 'cotizaciones',
  },
  /*
   * "EL CAJON" DEJO DE SER UNA PESTAÑA APARTE, y se fue solo la pestaña.
   *
   * Eran dos entradas para una sola cuenta: el cajon enseñaba el efectivo, los
   * metodos de pago y los movimientos, y el corte volvia a pedir exactamente
   * eso para cuadrar. Quien cierra el turno tenia que ir a una, mirar, y pasar
   * a la otra a escribir lo que acababa de leer.
   *
   * Ahora "Corte de caja" ES esa pantalla: el efectivo esperado, los metodos,
   * los movimientos del turno y, desde ahi, el boton de cerrar. NO SE QUITO NI
   * UNA CUENTA — el saldo esperado, el fondo inicial, los movimientos y el
   * historial siguen calculandose igual, en `cajon.tsx`. Se quito una entrada
   * del menu, no una funcion.
   */
  {
    clave: 'corte', etiqueta: 'Corte de caja', capacidad: 'verFinanzas',
    de: 'cajon', dentro: 'corte',
  },
];

export function pestanasQuePuedeVer(
  permisos: Readonly<Record<string, boolean>>,
): typeof PESTANAS_DEL_MOSTRADOR {
  return PESTANAS_DEL_MOSTRADOR.filter((p) => permisos[p.capacidad] === true);
}

/**
 * A que pestaña lleva un recado, venga del cobro o del cajón.
 *
 * Los dos espacios de nombres siguen vivos a proposito: `ventas:` lo consume el
 * punto de venta y `caja:` el cajón, cada uno con el lector que ya tenia. El
 * nombre dice QUIEN lo consume, no de que menu salio — y por eso unir los dos
 * modulos no obligo a tocar ni un lector.
 */
export function pestanaDelRecado(recado: Intencion): string | null {
  if (recado.modulo === 'ventas') {
    // `cobrar-cita` llega desde la Agenda al completar una sesion. Cae en la
    // misma pestaña que una venta nueva porque ES una venta nueva: lo unico
    // distinto es que llega con el carrito ya armado.
    if (recado.accion === 'nueva' || recado.accion === 'pago' || recado.accion === 'cobrar-cita') {
      return 'cobrar';
    }
    if (recado.accion === 'abrir') return 'historial';
    if (recado.accion === 'cotizar') return 'cotizaciones';
    return null;
  }
  /*
   * TODO LO DE CAJA CAE EN "CORTE DE CAJA" desde que el cajon dejo de ser una
   * pestaña. Los recados siguen llamandose igual —`caja:movimientos`,
   * `caja:ingreso`, `caja:abrir`— porque el nombre dice QUIEN los consume, no
   * de que pestaña salieron: cambiarlos habria obligado a tocar a los cinco
   * modulos que navegan hasta aqui.
   */
  if (recado.modulo === 'caja') return 'corte';
  return null;
}

/**
 * MIRA EL RECADO SIN CONSUMIRLO, y esta funcion existe por un fallo que habria
 * sido invisible.
 *
 * `tomarIntencion` LEE Y BORRA — es lo correcto: un recado que sobrevive abre el
 * mismo formulario cada vez que alguien vuelve a la pantalla. Pero aqui hacen
 * falta las dos cosas: el Mostrador necesita la ACCION para escoger la pestaña,
 * y el hijo necesita el recado ENTERO para saber que abrir.
 *
 * Y no se puede resolver leyendolo en un efecto del padre: React monta de abajo
 * hacia arriba, asi que el efecto del HIJO corre ANTES. El hijo lo leeria vacio
 * y "Nueva venta" desde el expediente de un cliente abriria la pestaña correcta
 * con el carrito en blanco — sin fallar, sin avisar, y con toda la cara de estar
 * bien.
 *
 * Asi que se toma y se devuelve tal cual. Es idempotente, que importa porque en
 * desarrollo React monta dos veces: la segunda vuelve a encontrar el recado
 * intacto.
 */
export function espiarIntencion(modulo: string): Intencion | null {
  const recado = tomarIntencion(modulo);
  if (recado) ponerIntencion(recado);
  return recado;
}

/** El recado pendiente para esta pantalla, del cobro o del cajón. */
export function recadoDelMostrador(): Intencion | null {
  return espiarIntencion('ventas') ?? espiarIntencion('caja');
}

export function Mostrador() {
  const { acceso } = useSesion();
  const permisos = acceso?.permisos ?? {};

  const puedeVer = pestanasQuePuedeVer(permisos);
  const primera = puedeVer[0]?.clave ?? 'cobrar';
  const [pestana, setPestana] = useState(primera);

  /**
   * La pestaña que pide el recado se escoge UNA vez, al montar.
   *
   * Va en un efecto y no en el render porque `espiarIntencion` toca el almacen
   * de recados, y eso no se hace mientras se pinta. El hijo lo lee en su propio
   * efecto —que corre antes— y lo consume; aqui solo se decide donde cae, asi
   * que el orden ya no importa: el espia no se lo quita a nadie.
   */
  const yaSeLeyo = useRef(false);
  useEffect(() => {
    if (yaSeLeyo.current) return;
    yaSeLeyo.current = true;
    const recado = recadoDelMostrador();
    if (!recado) return;
    const destino = pestanaDelRecado(recado);
    if (destino && puedeVer.some((p) => p.clave === destino)) setPestana(destino);
    // Solo al montar: despues manda lo que toque la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Si le quitan un permiso mientras esta abierto no se queda en una pestaña que
     ya no existe: se cae a la primera que si puede ver. */
  const puesta = puedeVer.some((p) => p.clave === pestana) ? pestana : primera;
  const actual = PESTANAS_DEL_MOSTRADOR.find((p) => p.clave === puesta);

  if (puedeVer.length === 0) return null;

  return (
    <div className="pz-pantalla mos mv-pantalla">
      <header className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">Caja</h2>
          <p className="tt-lema">Cobra, registra el efectivo y cuadra tu turno</p>
        </div>
      </header>

      {/*
        UNA SOLA BARRA PARA LAS SEIS. Antes eran dos barras en dos pantallas
        distintas, y pasar del cobro al cajon costaba salir del modulo.
      */}
      <div className="pz-pestanas" role="tablist" aria-label="Secciones del mostrador">
        {puedeVer.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={puesta === p.clave}
            className={`pz-pestana${puesta === p.clave ? ' pz-pestana--puesta' : ''}`}
            onClick={() => setPestana(p.clave)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {/*
        LA LLAVE NO ES LA PESTAÑA, ES QUIEN PINTA.

        Con la pestaña como llave, moverse de "Cobrar" a "Ventas del dia"
        desmontaba el punto de venta entero y el carrito a medio armar se
        perdia — cobrar es justo lo que no puede perder su estado. Con la llave
        en "de", las cuatro pestañas del cobro comparten el mismo componente y
        solo cambia su seccion; la animacion de "esto es otro contenido" se
        dispara al saltar del cobro al cajon, que es cuando de verdad cambia
        todo.
      */}
      <div className="mos-cuerpo mv-cambia" key={actual?.de ?? 'venta'} role="tabpanel">
        {actual?.de === 'cajon' ? (
          <Cajon sinEncabezado />
        ) : (
          <PuntoDeVenta
            sinEncabezado
            pestana={actual?.dentro ?? 'nueva'}
            onPestana={(dentro) => {
              // El hijo se mueve solo al guardar una cotizacion o al leer un
              // recado. Se traduce a la pestaña de aqui para que la barra de
              // arriba no se quede marcando otra cosa.
              const equivalente = PESTANAS_DEL_MOSTRADOR.find(
                (p) => p.de === 'venta' && p.dentro === dentro,
              );
              if (equivalente) setPestana(equivalente.clave);
            }}
          />
        )}
      </div>
    </div>
  );
}
