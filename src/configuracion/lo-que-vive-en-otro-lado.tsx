/**
 * LAS SECCIONES QUE CONFIGURACION NO SE QUEDA.
 *
 * ESTA ES LA REGLA MAS IMPORTANTE DEL MODULO, y es la que se rompe sola si
 * nadie la escribe: Configuracion NO absorbe la configuracion de los demas.
 * Recordatorios ya tiene sus avisos, Mensajes sus canales y sus plantillas, y
 * las categorias se administran desde cada catalogo con `AdministrarCategorias`.
 * Aqui se ENLAZA a todo eso.
 *
 * POR QUE IMPORTA TANTO: dos pantallas que guardan lo mismo acaban diciendo
 * cosas distintas. La segunda nace copiando a la primera, luego una recibe un
 * arreglo, y a partir de ahi el centro tiene dos verdades sobre a que hora
 * avisar de una cita — y quien las mira no sabe cual manda.
 *
 * Y LAS QUE NO EXISTEN SE DICEN. "Campos personalizados" e "Integraciones" son
 * dos tarjetas del diseño que todavia no tienen nada detras. Se pintan igual,
 * diciendo la verdad completa, que es exactamente lo que hace la pantalla de un
 * modulo pendiente: mas util que llenarlas de botones que no hacen nada, y sin
 * costar credibilidad.
 */

import { Boton } from '@neron/base/ui';
import { Icono } from '../ui/iconos.js';

export type SeccionEnlazada =
  | 'notificaciones'
  | 'plantillas'
  | 'categorias'
  | 'campos'
  | 'integraciones';

export interface PropiedadesDeLoQueViveFuera {
  readonly cual: SeccionEnlazada;
  /** Los ámbitos de categoría que se pueden administrar desde aquí. */
  readonly ambitos: readonly { readonly clave: string; readonly etiqueta: string }[];
  onIr(modulo: string, intencion?: string): void;
  onCategorias(ambito: string, titulo: string): void;
}

export function LoQueViveEnOtroLado({
  cual,
  ambitos,
  onIr,
  onCategorias,
}: PropiedadesDeLoQueViveFuera) {
  if (cual === 'notificaciones') {
    return (
      <div className="cfg-enlaces">
        <p className="tt-secundario">
          Los avisos no se configuran aquí, y es a propósito: cada uno vive donde se produce. Dos
          pantallas que guardan lo mismo acaban diciendo cosas distintas.
        </p>

        <section className="pz-tarjeta">
          <h3 className="tt-tarjeta">Avisos de recordatorios</h3>
          <p className="tt-secundario">
            Con cuánta anticipación avisar, a qué hora suponer los que no la traen, y si avisar al
            responsable. Se guardan en Recordatorios.
          </p>
          {/*
            SE DICE LA LIMITACION DE VERDAD, con las mismas palabras que usa la
            pantalla de Recordatorios: el aviso del navegador solo funciona con
            la pestaña abierta. Prometer avisos con todo cerrado es prometer que
            nadie va a olvidarse de una cita, y eso hoy es mentira.
          */}
          <p className="tt-secundario">
            El aviso del navegador solo funciona con la pestaña abierta. Para avisar con todo
            cerrado haría falta un servicio que corra solo, y todavía no existe.
          </p>
          <Boton tono="contorno" onClick={() => onIr('recordatorios')}>
            Abrir la configuración de recordatorios
          </Boton>
        </section>

        <section className="pz-tarjeta">
          <h3 className="tt-tarjeta">Mensajes a pacientes</h3>
          <p className="tt-secundario">
            Los canales —WhatsApp, SMS, correo— y las plantillas de confirmación y recordatorio de
            cita viven en Mensajes, junto a las conversaciones que producen.
          </p>
          <Boton tono="contorno" onClick={() => onIr('mensajes')}>
            Abrir Mensajes
          </Boton>
        </section>
      </div>
    );
  }

  if (cual === 'plantillas') {
    return (
      <div className="cfg-enlaces">
        <section className="pz-tarjeta">
          <h3 className="tt-tarjeta">Plantillas de mensajes</h3>
          <p className="tt-secundario">
            Lo que se le escribe a un paciente —confirmar, recordar, agradecer— se edita en
            Mensajes, con las variables que rellena el sistema.
          </p>
          <Boton tono="contorno" onClick={() => onIr('mensajes')}>
            Abrir las plantillas
          </Boton>
        </section>

        <section className="pz-tarjeta">
          <h3 className="tt-tarjeta">Comprobantes</h3>
          <p className="tt-secundario">
            El pie que se imprime en cada ticket se escribe en Facturación, junto a los datos
            fiscales, porque salen juntos en el mismo papel.
          </p>
        </section>
      </div>
    );
  }

  if (cual === 'categorias') {
    return (
      <div className="cfg-enlaces">
        <p className="tt-secundario">
          Las categorías son <strong>una sola tabla</strong> para todo el sistema: lo que las separa
          es a qué catálogo pertenecen. Por eso se administran con la misma pantalla desde aquí y
          desde cada módulo — no hay dos listas que se puedan desincronizar.
        </p>
        <ul className="pz-lista">
          {ambitos.map((a) => (
            <li key={a.clave} className="pz-renglon pz-renglon--quieto">
              <span className="pz-renglon__cuerpo">
                <span className="pz-renglon__titulo">{a.etiqueta}</span>
              </span>
              <button
                type="button"
                className="pz-boton"
                onClick={() => onCategorias(a.clave, `Categorías de ${a.etiqueta.toLowerCase()}`)}
              >
                <Icono nombre="lapiz" lado={14} /> Administrar
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (cual === 'campos') {
    return (
      <div className="cfg-enlaces">
        <section className="pz-tarjeta">
          <h3 className="tt-tarjeta">Campos personalizados</h3>
          {/*
            NO EXISTE, Y SE DICE ENTERO: qué haría, por qué no está y qué hacer
            mientras. Es lo mismo que hace `modulos/pendiente.tsx`, y por la
            misma razón: una pantalla que finge estar lista hace dudar de las
            que sí lo están.
          */}
          <p className="tt-secundario">
            <strong>Todavía no existen.</strong> Servirían para agregarle campos propios a la ficha
            de un paciente o de un servicio sin tocar el código.
          </p>
          <p className="tt-secundario">
            Mientras tanto, el expediente ya guarda como texto libre lo que de verdad hacía falta en
            un centro de terapias: padecimientos, alergias, medicamentos, cirugías, embarazo,
            contraindicaciones, presión preferida y aromas a evitar. Es texto libre a propósito — un
            catálogo cerrado hay que mantenerlo, y el día que llegue algo que no está se captura en
            el campo equivocado.
          </p>
          <Boton tono="contorno" onClick={() => onIr('clientes')}>
            Ver el expediente de un paciente
          </Boton>
        </section>
      </div>
    );
  }

  return (
    <div className="cfg-enlaces">
      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">Integraciones</h3>
        <p className="tt-secundario">
          <strong>No hay ninguna conectada, y no hay ninguna a medias.</strong> Lo que existe hoy es
          la parte de Mensajes: las conversaciones se guardan y quedan en <em>pendiente</em> hasta
          que alguien las manda. Esa diferencia entre "lo tengo escrito" y "le llegó" es a propósito
          — sin ella se da por avisado a un paciente que nunca supo nada.
        </p>
        <p className="tt-secundario">
          Conectar un proveedor de WhatsApp o de SMS necesita llaves que no pueden vivir en el
          navegador: cualquiera las vería abriendo las herramientas de desarrollador. Hace falta un
          servicio que corra aparte, y todavía no existe.
        </p>
        <Boton tono="contorno" onClick={() => onIr('mensajes')}>
          Ver los canales de Mensajes
        </Boton>
      </section>
    </div>
  );
}
