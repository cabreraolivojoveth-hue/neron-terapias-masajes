/**
 * EL ARMAZON DEL CENTRO — barra lateral, barra superior y contenido.
 *
 * POR QUE ESTE MARCO EXISTE SI LA BASE YA TRAE UNO, que es la pregunta justa:
 *
 * El marco de `@neron/base` pinta el menu como una lista de TEXTO. No tiene
 * hueco para el icono de cada modulo, ni para la ficha de la persona con su
 * foto, ni para la tarjeta de soporte — y el diseño del Centro las lleva las
 * tres. No es un capricho visual: el icono es lo que deja encontrar "Ventas"
 * de un vistazo en una lista de trece.
 *
 * Lo que NO se reescribio es lo que de verdad cuesta: la navegacion, el menu
 * resuelto por permisos y la barrera que atrapa lo que revienta siguen siendo
 * los de la base. Aqui solo cambia el DIBUJO. Por eso Terapias sigue sintiendose
 * el mismo sistema y a la vez se ve como su diseño.
 *
 * LA BARRERA VA ALREDEDOR DE UN COMPONENTE APARTE, y esa leccion viene de la
 * base con su bug ya pagado: si el marco llamara a `pintarModulo(...)` dentro
 * de su propio render, lo que reventara ocurriria en el render DEL MARCO —
 * fuera de la barrera, que solo atrapa lo de sus HIJOS. La barrera se veria
 * puesta en el codigo y no protegeria nada.
 */

import { Barrera, useNavegacion, type MenuResuelto } from '@neron/base/marco';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { moduloPorId } from '../modulos/registro.js';
import { Icono } from '../ui/iconos.js';

/** Ver la nota de arriba: existe SOLO para quedar dentro de la barrera. */
function ModuloActivo({
  pintar,
  modulo,
}: {
  readonly pintar: (modulo: string) => ReactNode;
  readonly modulo: string;
}) {
  return <>{pintar(modulo)}</>;
}

/** Las iniciales de alguien. Nunca mas de dos, o dejan de leerse. */
export function inicialesDe(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/**
 * Todos los modulos del menu, en una sola lista y sin encabezados de grupo.
 *
 * El diseño los enseña corridos. Los grupos de la base —"Atencion", "Dinero",
 * "El centro"— parten trece renglones en tres bloques con tres titulos, y en
 * una lista de trece eso es mas ruido que ayuda: se lee igual de rapido de
 * corrido y la barra queda mas corta, que importa en una laptop de 13".
 */
export function moduloEnOrden(menu: MenuResuelto): { id: string; etiqueta: string }[] {
  return [...menu.directos, ...menu.grupos.flatMap((g) => g.modulos)].map((m) => ({
    id: m.id,
    etiqueta: m.etiqueta,
  }));
}

export interface PropiedadesDelArmazon {
  readonly menu: MenuResuelto;
  readonly pintarModulo: (modulo: string) => ReactNode;
  readonly nombreDeLaPersona: string;
  readonly rolDeLaPersona?: string;
  readonly logo?: ReactNode;
  readonly enLaBarraSuperior?: ReactNode;
  readonly alFallar?: (error: Error, donde: string) => void;
  onSalir?: () => void;
}

export function Armazon({
  menu,
  pintarModulo,
  nombreDeLaPersona,
  rolDeLaPersona,
  logo,
  enLaBarraSuperior,
  alFallar,
  onSalir,
}: PropiedadesDelArmazon) {
  const { ruta, ir } = useNavegacion();
  const [abierto, setAbierto] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const cajaDeLaCuenta = useRef<HTMLDivElement | null>(null);
  const botonDeLaCuenta = useRef<HTMLButtonElement | null>(null);

  const modulos = moduloEnOrden(menu);

  /**
   * El panel de la cuenta se cierra al tocar fuera y con Escape — el mismo
   * trato que la campana de notificaciones.
   *
   * Va con `mousedown` y no con `click` por la razon de siempre: con `click` el
   * panel se cierra DESPUES de que el navegador ya decidio a quien le tocaba el
   * toque, asi que el primer clic fuera se pierde. Eso se sentia como que el
   * menu estaba descuadrado — le picabas a "Configuracion" y no pasaba nada
   * hasta el segundo intento.
   */
  useEffect(() => {
    if (!cuentaAbierta) return;

    const afuera = (e: MouseEvent): void => {
      if (cajaDeLaCuenta.current && !cajaDeLaCuenta.current.contains(e.target as Node)) {
        setCuentaAbierta(false);
      }
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setCuentaAbierta(false);
      // El foco vuelve al boton: quien cerro con teclado no se queda en la nada.
      botonDeLaCuenta.current?.focus();
    };

    document.addEventListener('mousedown', afuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', afuera);
      document.removeEventListener('keydown', escape);
    };
  }, [cuentaAbierta]);

  /**
   * En el celular el menu TAPA la pantalla. Se cierra al escoger algo y al
   * cambiar de modulo por cualquier otra via —un recado de otra pantalla, por
   * ejemplo—, o se queda encima del contenido que acaba de pedirse.
   */
  useEffect(() => setAbierto(false), [ruta.modulo]);

  return (
    <div className="arm">
      <a className="arm-saltar" href="#contenido">
        Ir al contenido
      </a>

      <aside className={`arm-lateral${abierto ? ' arm-lateral--abierta' : ''}`}>
        <div className="arm-marca">{logo}</div>

        <nav className="arm-menu" aria-label="Menú principal">
          <ul className="arm-menu__lista">
            {modulos.map((m) => {
              const declarado = moduloPorId(m.id);
              const activo = ruta.modulo === m.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`arm-enlace${activo ? ' arm-enlace--activo' : ''}`}
                    aria-current={activo ? 'page' : undefined}
                    onClick={() => ir(m.id)}
                  >
                    <span className="arm-enlace__icono" aria-hidden="true">
                      <Icono nombre={declarado?.icono ?? 'cuadricula'} lado={20} />
                    </span>
                    <span className="arm-enlace__texto">{m.etiqueta}</span>
                    {/*
                      AQUI NO VA NINGUN CONTADOR. El diseño enseña un "3" al
                      lado de Mensajes; ese tres es del diseño, no de nadie. Un
                      numero inventado en el menu es de las mentiras que mas
                      caro salen: se ve en TODAS las pantallas, todo el tiempo,
                      y quien lo cree entra a buscar tres mensajes que no
                      existen. Cuando ese modulo tenga su tabla, el numero
                      saldra de contar los no leidos.
                    */}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="arm-pie">
          {/*
            LA CAJA EXISTE PARA QUE EL PANEL FLOTE.

            El panel de "Cerrar sesion" NO puede empujar ni encimarse en el
            menu. Antes vivia suelto en el pie: al abrirlo, el pie crecia, el
            menu se encogia y la lista se salia por abajo y quedaba DEBAJO del
            recuadro de la cuenta. Se veia encimado, y peor: el clic en
            "Configuracion" se lo comia el recuadro, porque el pie va posicionado
            y gana el clic. Con esta caja, el panel se ancla a la cuenta y flota
            encima sin mover un pixel de lo demas.
          */}
          <div className="arm-cuenta__caja" ref={cajaDeLaCuenta}>
            <button
              type="button"
              className="arm-cuenta"
              ref={botonDeLaCuenta}
              aria-expanded={cuentaAbierta}
              onClick={() => setCuentaAbierta((a) => !a)}
            >
              <span className="arm-cuenta__inicial" aria-hidden="true">
                {inicialesDe(nombreDeLaPersona)}
              </span>
              <span className="arm-cuenta__texto">
                <span className="arm-cuenta__nombre">{nombreDeLaPersona}</span>
                {rolDeLaPersona ? (
                  <span className="arm-cuenta__rol">{rolDeLaPersona}</span>
                ) : null}
              </span>
              <span className={`arm-cuenta__flecha${cuentaAbierta ? ' arm-cuenta__flecha--abierta' : ''}`} aria-hidden="true">
                <Icono nombre="flecha" lado={16} />
              </span>
            </button>

            {cuentaAbierta && onSalir ? (
              <div className="arm-cuenta__panel">
                <button type="button" className="arm-cuenta__opcion" onClick={onSalir}>
                  <Icono nombre="salida" lado={16} /> Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>

          <div className="arm-soporte">
            <span className="arm-soporte__icono" aria-hidden="true">
              <Icono nombre="soporte" lado={20} />
            </span>
            <span className="arm-soporte__texto">
              <span className="arm-soporte__titulo">¿Necesitas ayuda?</span>
              <span className="arm-soporte__pie">Soporte técnico</span>
            </span>
          </div>
        </div>
      </aside>

      {abierto ? (
        <div className="arm-velo" onClick={() => setAbierto(false)} aria-hidden="true" />
      ) : null}

      <div className="arm-principal">
        <header className="arm-superior">
          <button
            type="button"
            className="arm-hamburguesa"
            aria-label={abierto ? 'Cerrar el menú' : 'Abrir el menú'}
            aria-expanded={abierto}
            onClick={() => setAbierto((a) => !a)}
          >
            <Icono nombre="renglones" lado={20} />
          </button>
          {/*
            SIN TITULO DE MODULO AQUI. El diseño no lo lleva: cada pantalla ya
            dice su nombre en grande, y repetirlo arriba gasta el renglon mas
            valioso de la aplicacion diciendo dos veces lo mismo.
          */}
          <div className="arm-superior__acciones">{enLaBarraSuperior}</div>
        </header>

        <main className="arm-contenido" id="contenido" tabIndex={-1}>
          <Barrera llave={ruta.modulo} {...(alFallar ? { alFallar } : {})}>
            <ModuloActivo pintar={pintarModulo} modulo={ruta.modulo} />
          </Barrera>
        </main>
      </div>
    </div>
  );
}
