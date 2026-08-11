/**
 * EL MENU DE ACCIONES DE UN RENGLON — uno para todo el programa.
 *
 * POR QUE EXISTE ESTE ARCHIVO, Y COMO SE VEIA NO TENERLO:
 *
 * Servicios, Cursos y Productos tenian cada uno su propia copia de este menu:
 * la misma logica de cerrar al tocar fuera, la misma de Escape, el mismo panel
 * — tres veces, y las tres apuntando a unas clases CSS que vivian en la hoja de
 * OTRO modulo. El dia que esa hoja se limpio, los tres menus se quedaron sin
 * estilo a la vez: texto pelon, sin caja, sin sombra y encimado contra el borde
 * de la tabla. Y no fallo nada: ni los tipos, ni las guardias, ni las pruebas.
 *
 * Ahora hay UNO. Cambiarlo cambia los tres a la vez, y no puede volver a
 * quedarse sin vestir porque su ropa —"pz-menu"— vive con las demas piezas
 * compartidas.
 *
 * LO QUE RESUELVE, Y QUE CASI NUNCA SE RESUELVE EN UN MENU:
 *
 *   1. Se cierra al tocar FUERA, con `mousedown` y no con `click`. Con `click`
 *      el navegador ya decidio a quien le tocaba el toque antes de que el menu
 *      se cierre, y el primer clic de afuera se pierde.
 *   2. Escape cierra Y DEVUELVE EL FOCO al boton. Sin lo segundo, quien navega
 *      con teclado se queda flotando en la nada.
 *   3. Las flechas recorren las opciones, que es como se espera que funcione un
 *      menu y lo unico que lo hace usable sin raton.
 *   4. Se abre hacia arriba si no cabe abajo. Un menu que se sale por el pie de
 *      la pagina obliga a desplazar para leer la ultima opcion — y la ultima
 *      opcion suele ser la de borrar.
 *
 * LO QUE NO SE PUEDE HACER NO SE MUESTRA, ni en gris: quien llama filtra por
 * permiso antes de pasar la lista. Un menu de opciones apagadas es ruido y de
 * paso le cuenta a quien no debe que esas operaciones existen.
 */

import { useEffect, useRef, useState } from 'react';
import { Icono, type NombreDeIcono } from './iconos.js';

export interface OpcionDeMenu {
  readonly clave: string;
  readonly etiqueta: string;
  readonly icono?: NombreDeIcono;
  /**
   * Marca la opcion que no se puede deshacer sola. Se pinta en rojo y va
   * separada del resto: "Eliminar" pegado a "Editar" se aprieta por error.
   */
  readonly peligro?: boolean;
}

export interface PropiedadesDelMenu {
  /** Para el lector de pantalla: "Acciones para Aceite de lavanda". */
  readonly de: string;
  readonly opciones: readonly OpcionDeMenu[];
  onEscoger(clave: string): void;
}

/** Cuanto sitio hace falta debajo para abrirlo hacia abajo. */
const ALTO_DE_UNA_OPCION = 40;
const AIRE = 24;

/** Donde se planta el panel, en coordenadas de la ventana. */
interface Sitio {
  readonly derecha: number;
  readonly arriba?: number;
  readonly abajo?: number;
}

export function MenuDeAcciones({ de, opciones, onEscoger }: PropiedadesDelMenu) {
  const [abierto, setAbierto] = useState(false);
  const [sitio, setSitio] = useState<Sitio | null>(null);
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  function cerrar(devolverFoco = true): void {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  /**
   * SE PLANTA EN COORDENADAS DE LA VENTANA, y no pegado al tirador.
   *
   * ESTO ES UN FALLO QUE SE VIO EN UNA FOTO: el panel colgaba del tirador con
   * "position: absolute", y el tirador vive dentro del marco de la tabla — que
   * lleva "overflow-x: auto" para que una tabla ancha se desplace sin mover la
   * pagina. Un contenedor que desplaza RECORTA, y no se puede recortar solo en
   * un eje: el navegador recorta los dos. Resultado: en el ultimo renglon de la
   * tabla, la ultima opcion del menu salia cortada por la mitad — y la ultima
   * opcion es justo la de eliminar.
   *
   * Con "position: fixed" el panel ya no le pertenece a ningun contenedor que
   * recorte. Puede hacerlo porque ya no queda ningun antepasado con transform:
   * eso se arreglo al cambiar el relleno de las animaciones a "backwards"
   * (§7 del acuerdo). Si alguien vuelve a poner un transform arriba, este menu
   * se rompe igual que los velos — y por eso hay guardia.
   *
   * ¿ARRIBA O ABAJO? Se mide al abrir y no al montar: la fila cambia de sitio al
   * filtrar o al paginar, y un menu que decide su lado una sola vez acaba
   * saliendose por el pie de la pagina.
   */
  function abrir(): void {
    const desde = boton.current?.getBoundingClientRect();
    if (desde) {
      const necesita = opciones.length * ALTO_DE_UNA_OPCION + AIRE;
      const cabeAbajo = window.innerHeight - desde.bottom >= necesita || desde.top < necesita;
      setSitio({
        derecha: Math.max(AIRE, window.innerWidth - desde.right),
        ...(cabeAbajo
          ? { arriba: desde.bottom + 6 }
          : { abajo: window.innerHeight - desde.top + 6 }),
      });
    }
    setAbierto(true);
  }

  useEffect(() => {
    if (!abierto) return;

    // `mousedown` y no `click`: con `click` el menu se cierra despues de que el
    // navegador ya decidio a quien le tocaba el toque, y el primer clic de
    // afuera se pierde.
    const afuera = (e: MouseEvent): void => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };

    const alTeclear = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrar();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      // Las flechas recorren las opciones. Sin esto el menu no se puede usar sin
      // raton, que es justo cuando mas falta hace.
      e.preventDefault();
      const items = [...(panel.current?.querySelectorAll('[role="menuitem"]') ?? [])];
      if (items.length === 0) return;
      const dondeEstoy = items.indexOf(document.activeElement as Element);
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      const siguiente = (dondeEstoy + paso + items.length) % items.length;
      (items[dondeEstoy < 0 ? 0 : siguiente] as HTMLElement).focus();
    };

    /*
     * AL DESPLAZAR SE CIERRA. Plantado en coordenadas de la ventana, el panel no
     * sigue a su renglon: quedarse abierto lo dejaria flotando al lado de otra
     * fila, apuntando a un producto que no es. Cerrarlo es lo honesto.
     */
    const alDesplazar = (): void => setAbierto(false);

    document.addEventListener('mousedown', afuera);
    document.addEventListener('keydown', alTeclear, true);
    window.addEventListener('scroll', alDesplazar, true);
    window.addEventListener('resize', alDesplazar);
    return () => {
      document.removeEventListener('mousedown', afuera);
      document.removeEventListener('keydown', alTeclear, true);
      window.removeEventListener('scroll', alDesplazar, true);
      window.removeEventListener('resize', alDesplazar);
    };
  }, [abierto]);

  if (opciones.length === 0) return null;

  return (
    <div className="pz-menu" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="pz-icono-boton pz-menu__tirador"
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={`Acciones para ${de}`}
        onClick={() => (abierto ? cerrar(false) : abrir())}
      >
        <Icono nombre="puntos" lado={18} />
      </button>

      {abierto ? (
        <div
          ref={panel}
          className={`pz-menu__panel${sitio?.abajo !== undefined ? ' pz-menu__panel--arriba' : ''}`}
          role="menu"
          aria-label={`Acciones para ${de}`}
          style={{
            right: `${sitio?.derecha ?? AIRE}px`,
            ...(sitio?.arriba !== undefined ? { top: `${sitio.arriba}px` } : {}),
            ...(sitio?.abajo !== undefined ? { bottom: `${sitio.abajo}px` } : {}),
          }}
        >
          {opciones.map((o) => (
            <button
              key={o.clave}
              type="button"
              role="menuitem"
              className={`pz-menu__opcion${o.peligro ? ' pz-menu__opcion--peligro' : ''}`}
              onClick={() => {
                cerrar(false);
                onEscoger(o.clave);
              }}
            >
              {o.icono ? (
                <span className="pz-menu__icono" aria-hidden="true">
                  <Icono nombre={o.icono} lado={16} />
                </span>
              ) : null}
              {o.etiqueta}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
