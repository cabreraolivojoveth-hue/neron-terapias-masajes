/**
 * EL MODAL DEL CENTRO — el de la base, con el foco amarrado.
 *
 * POR QUE EXISTE ESTE ENVOLTORIO, Y COMO SE SENTIA NO TENERLO:
 *
 * Estabas capturando un cliente nuevo, escribiendo el telefono, y de repente el
 * cursor SALTABA SOLO al campo de arriba. Sin tocar nada. Seguias escribiendo y
 * las letras se iban al campo equivocado. Pasaba en todos los formularios del
 * sistema y no habia forma de trabajar.
 *
 * LA CAUSA no estaba en los campos ni en los formularios. El `Modal` de la base
 * enfoca su primer control al abrirse —correcto y necesario: quien navega con
 * teclado tiene que entrar al dialogo— pero ese efecto depende de `onCerrar`:
 *
 *     const cerrarSiSePuede = useCallback(..., [bloqueado, onCerrar]);
 *     useEffect(() => { ...enfocarAdentro()... }, [abierto, cerrarSiSePuede]);
 *
 * Y todas las pantallas le pasan una flecha escrita en linea:
 *
 *     onCerrar={() => setFicha(null)}
 *
 * Una flecha en linea es una funcion NUEVA en cada render del padre. Asi que
 * cada vez que el padre se repintaba por cualquier motivo —una consulta que
 * revalida, un contador, otro estado sin relacion— el efecto creia que algo
 * habia cambiado, volvia a correr, y volvia a enfocar el primer campo. Con la
 * persona escribiendo en el tercero.
 *
 * EL ARREGLO: aqui la funcion que se le entrega a la base es SIEMPRE LA MISMA
 * —vive en una `ref` que se actualiza en silencio— asi que el efecto solo
 * depende de si el dialogo esta abierto, que es de lo unico que deberia
 * depender. Las pantallas siguen escribiendo sus flechas en linea como siempre
 * y ya no pasa nada.
 *
 * SE ARREGLA AQUI Y NO EN LAS DIECINUEVE PANTALLAS. Pedirle a cada una que
 * envuelva sus callbacks en `useCallback` habria funcionado hasta que alguien
 * escribiera la veinte sin acordarse — y el fallo no avisa: no falla, no sale en
 * la consola, solo hace imposible capturar. La guardia 15 impide importar el
 * `Modal` de la base directamente.
 */

import { Modal as ModalDeLaBase } from '@neron/base/ui';
import { useCallback, useRef, type ReactNode } from 'react';

export interface PropiedadesDelModal {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly children: ReactNode;
  readonly pie?: ReactNode;
  readonly ancho?: boolean;
  /** Mientras se guarda: ni Escape ni el velo lo cierran. */
  readonly bloqueado?: boolean;
  onCerrar(): void;
}

export function Modal({
  abierto,
  titulo,
  children,
  pie,
  ancho = false,
  bloqueado = false,
  onCerrar,
}: PropiedadesDelModal) {
  /**
   * La ultima version de la funcion, sin cambiar de identidad.
   *
   * Se actualiza EN CADA RENDER y no en un efecto: si se actualizara en un
   * efecto, un cierre disparado antes de que ese efecto corriera llamaria a la
   * version vieja — y esa version vieja podria cerrar sobre un estado que ya no
   * existe.
   */
  const ultimoCerrar = useRef(onCerrar);
  ultimoCerrar.current = onCerrar;

  // Sin dependencias A PROPOSITO: es lo que hace que la base no vuelva a
  // enfocar. La funcion siempre llama a la version de hoy a traves de la ref.
  const cerrarEstable = useCallback(() => ultimoCerrar.current(), []);

  return (
    <ModalDeLaBase
      abierto={abierto}
      titulo={titulo}
      ancho={ancho}
      bloqueado={bloqueado}
      onCerrar={cerrarEstable}
      {...(pie !== undefined ? { pie } : {})}
    >
      {children}
    </ModalDeLaBase>
  );
}
