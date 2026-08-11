/**
 * EL EXPEDIENTE DE UNA PERSONA.
 *
 * ES LO QUE CLIENTES UNE, NO LO QUE CLIENTES GUARDA. Las visitas vienen de
 * Agenda, las compras y el adeudo de Ventas y Pagos, los cursos de
 * Inscripciones, los servicios recibidos de las citas completadas. La tabla
 * `cliente` solo guarda quien es y como contactarlo.
 *
 * POR QUE YA NO ES UN MODAL, que es el cambio grande de este repaso:
 *
 * El diseño no enseña un expediente que se asoma encima de una tabla: enseña
 * una pantalla de TRES COLUMNAS donde el expediente ES el contenido y la lista
 * de nombres es el indice de al lado. La diferencia no es de gusto. Con el
 * modal, la pantalla de Clientes era una tabla de siete columnas —casillas,
 * contacto, ultima visita, visitas, estado, acciones— y para leer a una persona
 * habia que tapar todo lo demas. Con las tres columnas se escoge un nombre y se
 * lee su ficha sin perder de vista donde estaba uno, que es como se revisan
 * cinco expedientes seguidos.
 *
 * Y de paso desaparecio el hueco: la tabla dejaba trescientos pixeles de blanco
 * debajo porque ninguna fila los llenaba.
 *
 * LO QUE EL DISEÑO PIDE Y LA BASE NO GUARDA se queda fuera en vez de
 * inventarse. La foto enseña domicilio, RFC, "como nos conocio", "referido
 * por", etiquetas y pestañas de Pagos y Documentos: ninguna de esas seis cosas
 * es una columna de `cliente` ni una tabla del sistema. Poner el rotulo con un
 * guion al lado seria prometer un dato que nadie puede llenar.
 *
 * LO QUE NO SE PUEDE HACER NO SE MUESTRA. Los botones se filtran por permiso
 * real; ademas, lo que de verdad se puede escribir lo decide la base.
 */

import { formatearMoneda } from '@neron/base/utils';
import { useState, type ReactNode } from 'react';
import { etiquetaDeEstadoDeCliente, type ExpedienteDeCliente } from '../datos/clientes.js';
import { Icono, type NombreDeIcono } from '../ui/iconos.js';
import { fechaLarga } from '../ui/fechas-en-palabras.js';
import { iniciales } from './lista-de-clientes.js';

/** Las pestañas que EXISTEN. Pagos y Documentos no: ver la nota de arriba. */
export const PESTANAS_DEL_EXPEDIENTE: readonly { clave: string; etiqueta: string; icono: NombreDeIcono }[] = [
  { clave: 'resumen', etiqueta: 'Resumen', icono: 'persona' },
  { clave: 'historial', etiqueta: 'Historial', icono: 'reloj' },
  { clave: 'sesiones', etiqueta: 'Sesiones', icono: 'flor' },
  { clave: 'notas', etiqueta: 'Notas', icono: 'nota' },
];

/**
 * Los años que tiene alguien hoy.
 *
 * DOS COSAS QUE PARECEN DETALLE Y NO LO SON:
 *
 * · Se resta el año Y se corrige si todavia no ha sido su cumpleaños. Sin esa
 *   correccion, de enero a su cumpleaños medio directorio aparece un año mas
 *   viejo de lo que es.
 *
 * · El texto se parte a mano, como en el resto del sistema, y NO pasa por
 *   `new Date(texto)`: las fechas del producto son "dd/mm/aaaa" y ese
 *   constructor las lee como mes/dia cuando le da la gana, asi que el 10 de
 *   julio se vuelve 7 de octubre sin avisar.
 */
export function edadEnAnios(nacimiento: string, hoy: Date): number | null {
  const [dia, mes, anio] = nacimiento.split('/').map(Number);
  if (!anio || !mes || !dia) return null;
  let edad = hoy.getFullYear() - anio;
  const yaFueSuCumple =
    hoy.getMonth() + 1 > mes || (hoy.getMonth() + 1 === mes && hoy.getDate() >= dia);
  if (!yaFueSuCumple) edad -= 1;
  return edad >= 0 && edad < 130 ? edad : null;
}

/** Un dato con su rotulo. Sin dato no se pinta el par: un guion no informa. */
function Dato({ que, children }: { readonly que: string; readonly children: ReactNode }) {
  return (
    <div className="pz-dato">
      <span className="tt-etiqueta">{que}</span>
      <div className="pz-dato__valor">{children}</div>
    </div>
  );
}

function Cuenta({ n, que }: { readonly n: number; readonly que: string }) {
  return (
    <span className="pz-dato">
      <span className="tt-dato">{n}</span>
      <span className="tt-pie">{que}</span>
    </span>
  );
}

/**
 * EL AVISO CLINICO — lo que hay que saber ANTES de tocar a alguien.
 *
 * Va arriba, fuera de las pestañas y sin un solo toque, porque escondido en una
 * pestaña quien va a dar la sesion tendria que acordarse de ir a buscarlo. El
 * dia que no se acuerde es justo el dia que importaba.
 *
 * Y solo aparece SI HAY ALGO QUE AVISAR. Una franja permanente que casi siempre
 * esta vacia se deja de mirar en una semana, y entonces no avisa de nada.
 */
export function AvisoClinico({ e }: { readonly e: ExpedienteDeCliente }) {
  const hay = [
    e.contraindicaciones ? { que: 'No se le puede', valor: e.contraindicaciones } : null,
    e.alergias ? { que: 'Alergias', valor: e.alergias } : null,
    e.embarazo === 'si' ? { que: 'Embarazo', valor: 'Cambia aceites y posiciones' } : null,
    e.embarazo === 'lactancia' ? { que: 'Lactancia', valor: 'Cambia aceites' } : null,
  ].filter((x): x is { que: string; valor: string } => x !== null);

  if (hay.length === 0) return null;

  return (
    <aside className="cli-aviso" role="note" aria-label="Antes de atenderla">
      <span className="cli-aviso__marca" aria-hidden="true">
        <Icono nombre="alerta" lado={20} />
      </span>
      <div className="cli-aviso__cuerpo">
        <span className="cli-aviso__titulo">Antes de atenderla</span>
        {hay.map((x) => (
          <p key={x.que} className="cli-aviso__linea">
            <strong>{x.que}:</strong> {x.valor}
          </p>
        ))}
      </div>
    </aside>
  );
}

/** Como se lee lo que se guardo en el selector. */
export function comoSeLeeElEmbarazo(v: string | null): string | null {
  if (v === 'si') return 'Embarazo';
  if (v === 'lactancia') return 'Lactancia';
  if (v === 'no') return 'No';
  return null;
}

/**
 * LA FICHA DE SALUD, completa.
 *
 * Solo se pintan los datos que EXISTEN. Nueve rotulos con un guion al lado no
 * informan de nada y hacen creer que la ficha esta llena. Si no hay ninguno, se
 * dice que falta capturarla — que es una accion, no un hueco.
 */
export function FichaDeSalud({ e }: { readonly e: ExpedienteDeCliente }) {
  const datos = [
    { que: 'Padecimientos', valor: e.padecimientos },
    { que: 'Alergias', valor: e.alergias },
    { que: 'Medicamentos', valor: e.medicamentos },
    { que: 'Cirugías o lesiones', valor: e.cirugias },
    { que: 'Embarazo o lactancia', valor: comoSeLeeElEmbarazo(e.embarazo) },
    { que: 'No se le puede', valor: e.contraindicaciones },
    { que: 'Presión preferida', valor: e.presionPreferida },
    { que: 'Aromas que evitar', valor: e.aromasEvitar },
    { que: 'Contacto de emergencia', valor: e.contactoEmergencia },
    { que: 'Teléfono de emergencia', valor: e.telefonoEmergencia },
  ].filter((d) => d.valor);

  return (
    <section className="pz-tarjeta pz-tarjeta--apretada">
      <h4 className="tt-tarjeta">Ficha de salud</h4>
      {datos.length === 0 ? (
        <p className="tt-falta">
          Todavía no se ha capturado. Es lo que hay que saber antes de una sesión: padecimientos,
          alergias, medicamentos y lo que no se le puede hacer.
        </p>
      ) : (
        <div className="pz-datos">
          {datos.map((d) => (
            <Dato key={d.que} que={d.que}>
              <span className="tt-libre">{d.valor}</span>
            </Dato>
          ))}
        </div>
      )}
    </section>
  );
}

export interface PropiedadesDelExpediente {
  readonly expediente: ExpedienteDeCliente | null;
  readonly cargando: boolean;
  readonly error: string | null;
  readonly permisos: Readonly<Record<string, boolean>>;
  /** Para calcular la edad. Se recibe, no se lee del reloj: asi se puede probar. */
  readonly momento: Date;
  onAccion(clave: string): void;
}

export function Expediente({
  expediente,
  cargando,
  error,
  permisos,
  momento,
  onAccion,
}: PropiedadesDelExpediente) {
  const [pestana, setPestana] = useState('resumen');
  const puede = (c: string): boolean => permisos[c] === true;
  const e = expediente;

  if (error) {
    return (
      <section className="pz-tarjeta">
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar el expediente.</p>
          <p className="pz-error__detalle">{error}</p>
        </div>
      </section>
    );
  }

  if (cargando) {
    return (
      <section className="pz-tarjeta">
        <div className="pz-cargando" aria-busy="true">
          <span className="neron-solo-lectores">Cargando el expediente</span>
          <div className="pz-silueta pz-silueta--alta" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="pz-silueta" />
          ))}
        </div>
      </section>
    );
  }

  /**
   * NO LLEGO NADA Y NO ES UN ERROR NI ES QUE ESTE CARGANDO.
   *
   * Pasa cuando el servidor contesta "no hay tal expediente": el cliente se
   * archivo desde otra pestaña, o el recado traia un id que ya no existe.
   *
   * Antes esta rama caia en las siluetas, y eso es lo peor que podia hacer: la
   * pantalla se quedaba con cuatro barras grises LATIENDO PARA SIEMPRE, sin
   * error y sin nada en la consola, con toda la cara de estar a punto de
   * cargar. Se descubrio al fotografiar la vitrina, donde ese id no existe.
   */
  if (!e) {
    return (
      <section className="pz-tarjeta cli-exp--vacio">
        <div className="pz-vacio">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="personas" lado={26} />
          </span>
          <p className="pz-vacio__titulo">No encontramos este expediente</p>
          <p className="pz-vacio__texto">
            Puede que se haya archivado desde otro lado. Escoge a alguien de la lista.
          </p>
        </div>
      </section>
    );
  }

  const edad = e.fechaNacimiento ? edadEnAnios(e.fechaNacimiento, momento) : null;

  return (
    /*
     * LA LLAVE ES EL ID, y no sobra: hace que React monte una ficha NUEVA al
     * escoger otro nombre. Sin ella se reusa la misma caja, la animacion de
     * entrada no se dispara y cambiar de persona no se nota — que en una
     * pantalla de expedientes es justo lo que no puede pasar.
     */
    <section className="cli-exp pz-tarjeta mv-panel" key={e.id} aria-labelledby="cli-exp-nombre">
      <header className="pz-identidad">
        <span className="pz-inicial pz-inicial--grande" aria-hidden="true">
          {iniciales(e.nombre)}
        </span>

        <div className="pz-identidad__cuerpo">
          <div className="pz-identidad__nombre">
            <h3 className="tt-pagina cli-exp__nombre" id="cli-exp-nombre">
              {e.nombre}
            </h3>
            {/* La MISMA pastilla que usa la lista de al lado: si el estado se
                pintara distinto aqui, la ficha y el indice contarian lo mismo
                de dos maneras. */}
            <span className={`pz-pastilla pz-pastilla--${e.archivado ? 'archivado' : 'activo'}`}>
              {etiquetaDeEstadoDeCliente(e.archivado ? 'archivado' : 'activo')}
            </span>
          </div>

          <div className="pz-identidad__contacto">
            <span className="pz-identidad__renglon">
              <Icono nombre="telefono" lado={15} />
              {e.telefono ? (
                <a className="pz-renglon__enlace" href={`tel:${e.telefono}`}>
                  {e.telefono}
                </a>
              ) : (
                <span className="tt-falta">Sin teléfono registrado</span>
              )}
            </span>
            <span className="pz-identidad__renglon">
              <Icono nombre="sobre" lado={15} />
              {e.correo ? (
                <a className="pz-renglon__enlace" href={`mailto:${e.correo}`}>
                  {e.correo}
                </a>
              ) : (
                <span className="tt-falta">Sin correo registrado</span>
              )}
            </span>
            {e.fechaNacimiento ? (
              <span className="pz-identidad__renglon">
                <Icono nombre="pastel" lado={15} />
                {fechaLarga(e.fechaNacimiento)}
                {edad !== null ? <span className="tt-secundario">({edad} años)</span> : null}
              </span>
            ) : null}
          </div>
        </div>

        {puede('gestionarClientes') ? (
          <button
            type="button"
            className="pz-boton mv-levanta"
            onClick={() => onAccion('editar')}
          >
            <Icono nombre="lapiz" lado={16} /> Editar cliente
          </button>
        ) : null}
      </header>

      {/*
        LO QUE NO SE PUEDE HACER VA ARRIBA Y FUERA DE LAS PESTAÑAS.
        Escondido en una pestaña, quien va a dar la sesion tendria que acordarse
        de ir a buscarlo — y el dia que no se acuerde es el dia que importaba.
        Aqui se ve en cuanto se abre la ficha, sin un solo toque.
      */}
      <AvisoClinico e={e} />

      <div className="pz-pestanas" role="tablist" aria-label="Secciones del expediente">
        {PESTANAS_DEL_EXPEDIENTE.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            className={`pz-pestana${pestana === p.clave ? ' pz-pestana--puesta' : ''}`}
            onClick={() => setPestana(p.clave)}
          >
            <Icono nombre={p.icono} lado={16} /> {p.etiqueta}
          </button>
        ))}
      </div>

      {/* La llave vuelve a montar el cuerpo al cambiar de pestaña, y por eso la
          animacion de "esto es otro contenido" se dispara sola. */}
      <div className="cli-exp__cuerpo mv-cambia" key={pestana} role="tabpanel">
        {pestana === 'resumen' ? (
          <>
            <section className="pz-tarjeta pz-tarjeta--apretada">
              <h4 className="tt-tarjeta">Información personal</h4>
              <div className="pz-datos">
                <Dato que="Nombre completo">{e.nombre}</Dato>
                <Dato que="Teléfono">
                  {e.telefono ?? <span className="tt-falta">Sin registrar</span>}
                </Dato>
                <Dato que="Correo electrónico">
                  {e.correo ?? <span className="tt-falta">Sin registrar</span>}
                </Dato>
                <Dato que="Fecha de nacimiento">
                  {e.fechaNacimiento ? (
                    fechaLarga(e.fechaNacimiento)
                  ) : (
                    <span className="tt-falta">Sin registrar</span>
                  )}
                </Dato>
                <Dato que="Cliente desde">
                  {e.clienteDesde ? (
                    fechaLarga(e.clienteDesde)
                  ) : (
                    <span className="tt-falta">Sin registrar</span>
                  )}
                </Dato>
                <Dato que="Terapeuta asignado">
                  {e.profesional ?? <span className="tt-falta">Sin asignar</span>}
                </Dato>
              </div>
            </section>

            <FichaDeSalud e={e} />

            <section className="pz-tarjeta pz-tarjeta--apretada">
              <div className="pz-cabecera">
                <h4 className="tt-tarjeta">Notas generales</h4>
                {puede('gestionarClientes') ? (
                  <button
                    type="button"
                    className="pz-enlace"
                    onClick={() => onAccion('editar')}
                  >
                    Editar nota
                  </button>
                ) : null}
              </div>
              {e.notas ? (
                /* Como TEXTO, nunca como HTML: una nota es lo que alguien
                   escribio, y si se interpretara podria romper la pantalla. */
                <p className="tt-libre">{e.notas}</p>
              ) : (
                <p className="tt-falta">
                  Todavía no hay notas de esta persona.
                </p>
              )}
            </section>
          </>
        ) : pestana === 'sesiones' ? (
          <section className="pz-tarjeta pz-tarjeta--apretada">
            <h4 className="tt-tarjeta">Notas de cada sesión</h4>
            {/*
              NO VIVEN EN EL CLIENTE: son de la CITA, donde se escribieron. Es lo
              que deja llegar a la cuarta sesion sabiendo que se hizo en las tres
              anteriores, en vez de volver a preguntar lo mismo.
            */}
            {e.sesiones.length === 0 ? (
              <div className="pz-vacio pz-vacio--chico">
                <span className="pz-vacio__icono" aria-hidden="true">
                  <Icono nombre="nota" lado={22} />
                </span>
                <p className="pz-vacio__titulo">Todavía no hay notas de sesión</p>
                <p className="pz-vacio__texto">
                  Lo que se escriba en la cita al completarla aparece aquí, de la más reciente
                  a la más antigua.
                </p>
              </div>
            ) : (
              <ol className="cli-sesiones">
                {e.sesiones.map((ses) => (
                  <li key={ses.id} className="cli-sesion">
                    <div className="cli-sesion__cuando">
                      <span className="pz-renglon__titulo">{fechaLarga(ses.fecha)}</span>
                      <span className="pz-renglon__pie">
                        {ses.servicio}
                        {ses.profesional ? ` · ${ses.profesional}` : ''}
                      </span>
                    </div>
                    <p className="tt-libre">{ses.notas}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : pestana === 'historial' ? (
          <>
            <section className="pz-tarjeta pz-tarjeta--apretada">
              <h4 className="tt-tarjeta">Historial de citas</h4>
              {/*
                "No asistio" va aparte de "cancelada" porque para el negocio no
                son lo mismo: una se reagenda, la otra ya costo.
              */}
              <div className="pz-tres">
                <Cuenta n={e.visitas} que={e.visitas === 1 ? 'visita' : 'visitas'} />
                <Cuenta n={e.canceladas} que="canceladas" />
                <Cuenta n={e.noAsistio} que="no asistió" />
              </div>
              {e.ultimaVisita ? (
                <p className="tt-secundario">
                  Última visita: {fechaLarga(e.ultimaVisita.fecha)} – {e.ultimaVisita.servicio}
                </p>
              ) : (
                <p className="tt-secundario">Todavía no ha tenido una sesión completada.</p>
              )}
            </section>

            {e.servicios.length > 0 ? (
              <section className="pz-tarjeta pz-tarjeta--apretada">
                <h4 className="tt-tarjeta">Servicios recibidos</h4>
                <ul className="pz-lista">
                  {e.servicios.map((s) => (
                    <li key={s.nombre} className="pz-renglon pz-renglon--quieto">
                      <span className="pz-ficha" aria-hidden="true">
                        <Icono nombre="flor" lado={18} />
                      </span>
                      <span className="pz-renglon__cuerpo">
                        <span className="pz-renglon__titulo">{s.nombre}</span>
                      </span>
                      <span className="tt-secundario">
                        {s.veces} {s.veces === 1 ? 'vez' : 'veces'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/*
              El dinero solo se le enseña a quien puede verlo. Esconderlo aqui es
              cortesia; lo que de verdad protege es que la base no le entrega las
              ventas a quien no tiene "verFinanzas".
            */}
            {puede('verFinanzas') ? (
              <section className="pz-tarjeta pz-tarjeta--apretada">
                <h4 className="tt-tarjeta">Compras y adeudo</h4>
                <div className="pz-tres">
                  <Cuenta n={e.compras} que={e.compras === 1 ? 'compra' : 'compras'} />
                  <Cuenta n={e.cursos} que={e.cursos === 1 ? 'curso' : 'cursos'} />
                </div>
                <dl className="pz-totales">
                  <div>
                    <dt>Total invertido</dt>
                    <dd>{formatearMoneda(e.totalGastado)}</dd>
                  </div>
                  <div>
                    <dt>Adeudo</dt>
                    <dd className={e.adeudo > 0 ? 'cli-exp__adeudo' : ''}>
                      {e.adeudo > 0 ? formatearMoneda(e.adeudo) : 'Sin adeudos'}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}
          </>
        ) : (
          <section className="pz-tarjeta pz-tarjeta--apretada">
            <div className="pz-cabecera">
              <h4 className="tt-tarjeta">Notas</h4>
              {puede('gestionarClientes') ? (
                <button type="button" className="pz-enlace" onClick={() => onAccion('editar')}>
                  Editar nota
                </button>
              ) : null}
            </div>
            {e.notas ? (
              <p className="tt-libre">{e.notas}</p>
            ) : (
              <div className="pz-vacio pz-vacio--chico">
                <span className="pz-vacio__icono" aria-hidden="true">
                  <Icono nombre="nota" lado={22} />
                </span>
                <p className="pz-vacio__titulo">Sin notas</p>
                <p className="pz-vacio__texto">
                  Lo que se escriba aquí lo ve todo el equipo al abrir el expediente.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
