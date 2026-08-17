/**
 * DATOS DE DEMOSTRACION — la pantalla desde la que se cargan.
 *
 * POR QUE ESTA TARJETA NO LA VE CASI NADIE. Solo aparece en la cuenta de
 * demostracion, y no porque sea un secreto: porque llenar de golpe un centro
 * con cinco meses de historia inventada es lo unico de este sistema que le
 * quitaria a alguien la confianza en sus propios numeros. La comprobacion de
 * verdad la hace la base —`app.es_la_cuenta_de_demostracion`—; esconder la
 * tarjeta aqui es cortesia, igual que con el resto del modulo.
 *
 * SE DICE LO QUE VA A PASAR ANTES DE QUE PASE, con numeros. "Cargar datos de
 * prueba" no dice si son tres renglones o seis mil, ni si se pueden quitar
 * despues. Los dos datos cambian por completo la decision de apretar el boton.
 *
 * LOS NUEVE PASOS SE VEN. La carga tarda cerca de un minuto: sin la lista, una
 * pantalla quieta durante un minuto se lee como una pantalla colgada, y quien
 * la mira recarga a media carga.
 *
 * QUITAR SE ESCRIBE, no se confirma con un boton. Es la misma regla de la zona
 * de peligro: un "¿estas seguro?" se contesta que si sin leerlo.
 */

import { Boton, Campo } from '@neron/base/ui';
import { useState } from 'react';
import type {
  EstadoDeLaDemostracion,
  PasoDeLaDemostracion,
} from '../datos/demostracion.js';
import { PASOS_DE_LA_DEMOSTRACION } from '../datos/demostracion.js';
import { Icono } from '../ui/iconos.js';

/**
 * Cuando se sembro, en `dd/mm/aaaa`.
 *
 * Se parte el texto de la base en vez de pasarlo por `new Date`: convertir y
 * volver a formatear le resta un dia a media America en cuanto el servidor
 * conteste en UTC. Es la misma leccion que `fechas-de-la-base.ts`.
 */
export function cuandoSeSembro(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  if (!a || !m || !d) return '';
  return `${d}/${m}/${a}`;
}

/** "6 812 filas" con separador de miles, que a cuatro cifras ya hace falta. */
export function comoSeCuentanLasFilas(cuantas: number): string {
  return `${cuantas.toLocaleString('es-MX')} ${cuantas === 1 ? 'renglón' : 'renglones'}`;
}

/** Lo que confirma el borrado. Sin tildes ni mayusculas: ya decidio. */
export function confirmaElQuitar(escrito: string): boolean {
  return escrito.trim().toLocaleLowerCase('es') === 'quitar';
}

export interface PropiedadesDeLaDemostracion {
  readonly correo: string;
  readonly estado: EstadoDeLaDemostracion | null;
  readonly cargando: boolean;
  readonly error: string | null;
  /** El paso que acaba de terminar. `null` = todavia no se ha cargado nada. */
  readonly progreso: PasoDeLaDemostracion | null;
  readonly trabajando: 'cargando' | 'quitando' | null;
  onCargar(): void;
  onQuitar(): void;
  onReintentar(): void;
}

export function DatosDeDemostracion({
  correo,
  estado,
  cargando,
  error,
  progreso,
  trabajando,
  onCargar,
  onQuitar,
  onReintentar,
}: PropiedadesDeLaDemostracion) {
  const [escrito, setEscrito] = useState('');

  if (cargando && estado === null) {
    return (
      <div className="pz-cargando" aria-busy="true">
        <span className="neron-solo-lectores">Viendo si ya hay datos de demostración</span>
        <div className="pz-silueta" />
      </div>
    );
  }

  if (error !== null && estado === null) {
    return (
      <div className="pz-vacio pz-vacio--chico">
        <p className="pz-vacio__titulo">No se pudo preguntar por la demostración</p>
        <p className="pz-vacio__texto">{error}</p>
        <Boton tono="contorno" onClick={onReintentar}>
          Volver a intentar
        </Boton>
      </div>
    );
  }

  /*
   * SIN LA CUENTA BUENA NO SE ESCONDE EL APARTADO: se explica. Llegar aqui
   * escribiendo la direccion a mano y encontrarse una pantalla en blanco hace
   * pensar que el sistema se rompio.
   */
  if (estado !== null && !estado.puede) {
    return (
      <div className="pz-vacio pz-vacio--chico">
        <p className="pz-vacio__titulo">Esta cuenta no carga datos de demostración</p>
        <p className="pz-vacio__texto">
          Los datos de demostración solo se cargan desde la cuenta con la que se enseña el
          producto. Estás dentro como <strong>{correo || 'otra cuenta'}</strong>, y la base
          rechaza la carga aunque se pida a mano.
        </p>
      </div>
    );
  }

  const cargada = estado?.cargada === true;
  const completa = estado?.completa === true;
  /*
   * "A MEDIAS" ES UN ESTADO PROPIO, y llamarlo "cargada" fue el primer error de
   * esta pantalla: la carga de verdad murio en el paso 3 —habia una caja
   * abierta— y la tarjeta dijo "Ya está cargada. Para volver a cargarla hay que
   * quitarla primero", que es la peor respuesta posible cuando faltan siete
   * novenas partes.
   */
  const aMedias = cargada && !completa;
  const corriendo = trabajando === 'cargando';
  /*
   * Los pasos hechos: el que acaba de terminar en esta pantalla, o el que la
   * base tenga anotado. Lo segundo es lo que hace que recargar la pagina no
   * borre el avance de la vista.
   */
  const hechos = Math.max(progreso?.paso ?? 0, estado?.ultimoPaso ?? 0);

  return (
    <div className="cfg-demo">
      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">
          <span className="cfg-peligro__icono" aria-hidden="true">
            <Icono nombre="estrella" lado={18} />
          </span>
          Cinco meses de uso, para poder enseñar el sistema
        </h3>

        <p className="tt-secundario">
          Llena este centro como si llevara cinco meses trabajando: catálogo, pacientes con su
          expediente, la agenda día por día, las ventas con su forma de pago, el corte de caja de
          cada día, los gastos, los cursos, las conversaciones y la bitácora. Sirve para enseñar
          el producto sin tener que capturar nada a mano.
        </p>

        <ul className="cfg-lista-honesta">
          <li>
            <strong>Son datos inventados y se ven como reales.</strong> Van a esta base, en este
            centro. Mientras estén cargados, ninguna cifra de ninguna pantalla es tuya.
          </li>
          <li>
            <strong>Se pueden quitar enteros.</strong> Cada renglón que se escribe queda anotado, y
            al quitarlos se borran exactamente esos — lo que tú captures después se queda.
          </li>
          <li>
            <strong>La ficha del centro solo se llena si estaba vacía.</strong> Si ya escribiste tu
            dirección y tu teléfono, no se tocan.
          </li>
          <li>
            <strong>Tarda cerca de un minuto</strong>, en nueve pasos. No cierres la pestaña a
            media carga: si se corta, quedan cargados los pasos que alcanzaron y hay que quitarlos
            para volver a empezar.
          </li>
        </ul>

        {cargada ? (
          <dl className="pz-datos">
            <div className="pz-dato pz-dato--renglon">
              <dt className="tt-etiqueta">Estado</dt>
              <dd className="pz-dato__valor">
                {aMedias ? (
                  <span className="pz-pastilla pz-pastilla--aviso">
                    A medias: {hechos} de {PASOS_DE_LA_DEMOSTRACION.length} pasos
                  </span>
                ) : (
                  <span className="pz-pastilla pz-pastilla--marca">Cargada</span>
                )}
              </dd>
            </div>
            <div className="pz-dato pz-dato--renglon">
              <dt className="tt-etiqueta">Cuánto se sembró</dt>
              <dd className="pz-dato__valor">{comoSeCuentanLasFilas(estado?.filas ?? 0)}</dd>
            </div>
            <div className="pz-dato pz-dato--renglon">
              <dt className="tt-etiqueta">Desde</dt>
              <dd className="pz-dato__valor">
                {cuandoSeSembro(estado?.sembradaEn ?? null) || 'Sin fecha'}
              </dd>
            </div>
          </dl>
        ) : null}

        {corriendo || progreso !== null ? (
          <ol className="cfg-pasos">
            {PASOS_DE_LA_DEMOSTRACION.map((titulo, i) => {
              const numero = i + 1;
              const yaEsta = numero <= hechos;
              const ahora = corriendo && numero === hechos + 1;
              return (
                <li
                  key={titulo}
                  className={`cfg-pasos__paso${yaEsta ? ' cfg-pasos__paso--hecho' : ''}${
                    ahora ? ' cfg-pasos__paso--corriendo' : ''
                  }`}
                >
                  <span className="cfg-pasos__marca" aria-hidden="true">
                    {yaEsta ? <Icono nombre="palomita" lado={14} /> : '·'}
                  </span>
                  {titulo}
                  {ahora ? ' — cargando…' : ''}
                </li>
              );
            })}
          </ol>
        ) : null}

        {error !== null ? (
          <p className="pz-error__que" role="alert">
            {error}
          </p>
        ) : null}

        {!cargada ? (
          <div className="pz-ficha__pie">
            <Boton trabajando={corriendo} disabled={trabajando !== null} onClick={onCargar}>
              Cargar los datos de demostración
            </Boton>
          </div>
        ) : aMedias && hechos >= 1 ? (
          <>
            {/*
              SE CONTINUA, NO SE EMPIEZA DE CERO. Cada paso es su propia
              transacción: los que entraron están completos y volver a
              sembrarlos duplicaría esos meses. Lo que falta es de ahí en
              adelante.
            */}
            <p className="cfg-respaldos__ultima" role="status">
              La carga se detuvo en el paso {hechos + 1}. Lo que ya entró está completo — cada
              paso es su propia transacción — así que se puede seguir desde ahí. Si el error de
              arriba dice que hay una caja abierta, haz su corte en Caja y vuelve a intentarlo.
            </p>
            <div className="pz-ficha__pie">
              <Boton trabajando={corriendo} disabled={trabajando !== null} onClick={onCargar}>
                Continuar desde el paso {hechos + 1}
              </Boton>
            </div>
          </>
        ) : aMedias ? (
          /*
            HAY FILAS PERO NINGUNA MARCA DE PASO: no se sabe hasta dónde llegó.
            Le pasa a una carga hecha con la versión anterior, que todavía no
            anotaba los pasos. Adivinar y seguir desde el uno sembraría dos
            veces lo que ya está; lo honesto es decir que no se sabe.
          */
          <p className="cfg-respaldos__ultima" role="status">
            Hay datos sembrados pero sin la marca de hasta dónde llegó la carga, así que no se
            puede continuar sin arriesgarse a sembrar dos veces lo mismo. Quítala aquí abajo y
            vuelve a cargarla desde el principio.
          </p>
        ) : (
          <p className="cfg-respaldos__ultima" role="status">
            Ya está cargada. Para volver a cargarla hay que quitarla primero: dos cargas encima
            duplicarían cinco meses de historia y ningún reporte volvería a cuadrar.
          </p>
        )}
      </section>

      {cargada ? (
        <section className="pz-tarjeta cfg-peligro__caja">
          <h3 className="tt-tarjeta">
            <span className="cfg-peligro__icono" aria-hidden="true">
              <Icono nombre="alerta" lado={18} />
            </span>
            Quitar los datos de demostración
          </h3>
          <p className="tt-secundario">
            Se borran los {comoSeCuentanLasFilas(estado?.filas ?? 0)} que sembró la demostración, en
            el orden en que se pueden borrar. Lo que hayas capturado tú se queda: se borra por
            identificador, uno por uno, contra la lista de lo sembrado.
          </p>

          <Campo
            etiqueta='Escribe "quitar" para confirmar'
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            ayuda="Se escribe a propósito: un botón de confirmar se aprieta sin leerlo."
          />

          <div className="pz-ficha__pie">
            <Boton
              tono="peligro"
              disabled={!confirmaElQuitar(escrito) || trabajando !== null}
              trabajando={trabajando === 'quitando'}
              onClick={() => {
                if (confirmaElQuitar(escrito)) {
                  setEscrito('');
                  onQuitar();
                }
              }}
            >
              Quitar la demostración
            </Boton>
          </div>
        </section>
      ) : null}
    </div>
  );
}
