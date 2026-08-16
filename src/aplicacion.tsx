/**
 * EL ARMAZON.
 *
 * Decide que se ve segun el estado de la sesion, y cuando hay sesion, arma el
 * marco con los modulos que ESA persona puede ver.
 *
 * Nada de aqui sabe que es una cita ni un paciente: recibe permisos, resuelve
 * el menu y le pasa el modulo activo a quien lo pinta. Por eso agregar un
 * modulo nuevo no obliga a tocar este archivo.
 */

import { ProveedorDeNavegacion, resolverMenu, useNavegacion } from '@neron/base/marco';
import { Boton } from '@neron/base/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { ProveedorDeSesion, useSesion, useTardaDemasiado } from './identidad/sesion.js';
import { Armazon } from './marco/armazon.js';
import { Hoja } from './marco/hoja.js';
import { MarcaVisible } from './marco/marca-visible.js';
import { Buscador } from './marco/buscador.js';
import { CampanaDeAvisos } from './marco/notificaciones.js';
import { Agenda } from './agenda/agenda.js';
import { Inicio } from './inicio/inicio.js';
import { Directorio } from './clientes/directorio.js';
import { Catalogo } from './servicios/catalogo.js';
import { Programa } from './cursos/programa.js';
import { Almacen } from './productos/almacen.js';
import { LibroDeGastos } from './gastos/libro-de-gastos.js';
import { Analisis } from './reportes/analisis.js';
import { Bandeja } from './mensajes/bandeja.js';
import { CentroDeRecordatorios } from './recordatorios/centro-de-recordatorios.js';
import { CentroDeConfiguracion } from './configuracion/centro-de-configuracion.js';
import { SegundoFactor } from './configuracion/segundo-factor.js';
import { Mostrador } from './caja/mostrador.js';
import { Pendiente } from './modulos/pendiente.js';
import { GRUPOS, MODULOS, MODULO_POR_OMISION, modulosVisibles } from './modulos/registro.js';
import { useConsulta } from './datos/consulta.js';
import {
  LEMA_POR_OMISION,
  NOMBRE_POR_OMISION,
  llaveDeLaConfiguracion,
  reclamarInvitaciones,
  traerConfiguracion,
  type ConfiguracionDelCentro,
} from './datos/configuracion.js';
import { ponerLaMoneda } from './datos/moneda.js';
import { Entrar } from './pantallas/entrar.js';
import { HAY_CONEXION } from './supabase.js';

/* ------------------------------------------------------------------ */
/* Las pantallas de los estados que no son "listo"                     */
/* ------------------------------------------------------------------ */

function Aviso({
  titulo,
  children,
  accion,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
  readonly accion?: ReactNode;
}) {
  return (
    <main className="terapias-aviso">
      <div className="terapias-aviso__caja">
        <Hoja />
        <h1 className="terapias-aviso__titulo">{titulo}</h1>
        <div className="terapias-aviso__texto">{children}</div>
        {accion}
      </div>
    </main>
  );
}

function Cargando() {
  const tarde = useTardaDemasiado();
  const { fallo } = useSesion();

  /**
   * A los ocho segundos se deja de fingir que carga.
   *
   * Una conexion normal responde en menos de un segundo. Si a los ocho sigue
   * esperando, algo esta mal y quedarse en la silueta para siempre no ayuda a
   * nadie: la persona no sabe si tardar es normal, si se colgo, o si tiene
   * que hacer algo.
   */
  if (tarde) {
    return (
      <main className="terapias-aviso">
        <div className="terapias-aviso__caja">
          <Hoja />
          <h1 className="terapias-aviso__titulo">No pudimos conectar</h1>
          <div className="terapias-aviso__texto">
            {fallo ? (
              <p>
                Esto fue lo que dijo el servidor: <code>{fallo}</code>
              </p>
            ) : (
              <p>La conexión con la base de datos no respondió.</p>
            )}
            <p>
              Lo más común es que la <strong>dirección</strong> o la <strong>llave</strong> del
              archivo <code>.env</code> no sean las de este proyecto. Vuelve a correr{' '}
              <strong>CONECTAR.bat</strong> con los datos de Supabase → Settings → API.
            </p>
          </div>
          <Boton tono="contorno" onClick={() => window.location.reload()}>
            Reintentar
          </Boton>
        </div>
      </main>
    );
  }

  return (
    <main className="terapias-cargando" aria-busy="true" aria-live="polite">
      {/**
       * Una silueta, no un mensaje ni un giro.
       *
       * El portero arranca en 'cargando' a proposito: sin ese estado, la
       * aplicacion parpadea mostrando la pantalla de entrada medio segundo
       * antes de dejar pasar a quien ya tenia sesion — y eso se siente roto
       * aunque todo funcione.
       */}
      <div className="terapias-silueta terapias-silueta--barra" />
      <div className="terapias-silueta terapias-silueta--bloque" />
      <span className="neron-solo-lectores">Cargando tu sesión</span>
    </main>
  );
}

/**
 * "Ya me invitaron": convierte la invitación pendiente en membresía.
 *
 * El correo NO viaja como parámetro: lo saca la base del token de la sesión. Si
 * viniera de aquí, cualquiera se daría de alta en el centro de cualquiera
 * escribiendo el correo del invitado.
 *
 * Al encontrar algo se recarga en vez de refrescar la sesión a mano: la
 * membresía nueva cambia el negocio, los roles y los permisos de golpe, y
 * arrancar limpio es más seguro que ir avisando pieza por pieza.
 */
function BuscarMiInvitacion() {
  const [buscando, setBuscando] = useState(false);
  const [dijo, setDijo] = useState<string | null>(null);

  return (
    <>
      <Boton
        tono="contorno"
        trabajando={buscando}
        onClick={() => {
          setBuscando(true);
          setDijo(null);
          void reclamarInvitaciones()
            .then((cuantas) => {
              if (cuantas > 0) window.location.reload();
              else setDijo('No hay ninguna invitación pendiente para tu correo.');
            })
            .catch((e: Error) => setDijo(e.message))
            .finally(() => setBuscando(false));
        }}
      >
        Ya me invitaron, buscar mi invitación
      </Boton>
      {dijo ? <p>{dijo}</p> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* El interior, ya con sesion                                          */
/* ------------------------------------------------------------------ */

/**
 * LO QUE CONFIGURACION LE IMPONE A TODO EL SISTEMA.
 *
 * VIVE AQUI Y NO DENTRO DEL MODULO DE CONFIGURACION, y esa es la diferencia
 * entre una configuracion de verdad y una que solo cambia la pantalla donde se
 * configura. Con el efecto dentro del modulo, el sistema se pondria oscuro al
 * abrir Configuracion y volveria a claro al salir; y la moneda solo seria la
 * del centro mientras se estuviera mirando la pantalla que la define.
 *
 * SON LAS TRES COSAS QUE NO PERTENECEN A NINGUN MODULO:
 *
 *   · el TEMA, que pinta las trece pantallas,
 *   · el MENOS MOVIMIENTO, por la misma razon,
 *   · la MONEDA, que escriben Ventas, Caja, Gastos, Reportes, Inicio,
 *     Productos, Servicios y Cursos.
 *
 * "El del sistema" NO escribe el atributo del tema: lo deja quitado y manda la
 * media query de la hoja, que es la que sigue al sistema operativo. Ponerle
 * "claro" a la fuerza dejaria al centro con la unica ventana que no acompaña al
 * resto de la computadora al anochecer.
 */
function useLoQueMandaEnTodo(negocio: string): void {
  const configuracion = useConsulta<ConfiguracionDelCentro>(
    negocio ? llaveDeLaConfiguracion(negocio) : null,
    () => traerConfiguracion(negocio),
  );
  const tema = configuracion.datos?.datos.tema ?? 'sistema';
  const menos = configuracion.datos?.datos.menosMovimiento ?? false;
  const moneda = configuracion.datos?.datos.moneda ?? '';
  const decimales = configuracion.datos?.datos.decimales ?? 2;

  useEffect(() => {
    const raiz = document.documentElement;
    if (tema === 'sistema') raiz.removeAttribute('data-tema');
    else raiz.setAttribute('data-tema', tema);
    if (menos) raiz.setAttribute('data-menos-movimiento', 'si');
    else raiz.removeAttribute('data-menos-movimiento');
  }, [tema, menos]);

  useEffect(() => {
    // Mientras no llega la configuracion NO se toca: dejar la de omision
    // durante medio segundo es mejor que escribir todos los importes dos
    // veces, una con cada signo.
    if (moneda !== '') ponerLaMoneda(moneda, decimales);
  }, [moneda, decimales]);
}

function Interior() {
  const { acceso, cerrarSesion } = useSesion();
  const { ruta, ir } = useNavegacion();
  useLoQueMandaEnTodo(acceso?.negocioId ?? '');
  if (!acceso) return null;

  const visibles = modulosVisibles(acceso.permisos);

  const menu = resolverMenu({
    grupos: GRUPOS.map((g) => ({ ...g, modulos: [...g.modulos] })),
    modulos: MODULOS.map((m) => ({
      id: m.id,
      etiqueta: m.etiqueta,
      ...(m.sueltoArriba ? { sueltoArriba: true } : {}),
    })),
    visibles,
  });

  /**
   * Una direccion a la que esta persona no llega la manda a Inicio.
   *
   * Pasa de verdad: alguien comparte por WhatsApp un enlace a Reportes y quien
   * lo recibe no tiene permiso de finanzas. Sin esto veria una pantalla en
   * blanco y creeria que el sistema se rompio.
   *
   * El redirigir va en un EFECTO, nunca dentro del render. Navegar mientras se
   * pinta es cambiar estado a media pintada: React avisa con un error feo, y
   * en el mejor de los casos queda un ciclo de renders que traba la pestaña.
   */
  const alcanzable = visibles.includes(ruta.modulo);
  useEffect(() => {
    if (!alcanzable) ir(MODULO_POR_OMISION);
  }, [alcanzable, ir]);

  return (
    <Armazon
      menu={menu}
      nombreDeLaPersona={acceso.nombre}
      rolDeLaPersona={acceso.rolEtiqueta}
      logo={<MarcaVisible />}
      onSalir={() => void cerrarSesion()}
      pintarModulo={(modulo) =>
        // Cada modulo que llega se engancha aqui. Los que faltan siguen
        // diciendo la verdad en vez de fingir con datos inventados.
        modulo === 'inicio' ? (
          <Inicio />
        ) : modulo === 'agenda' ? (
          <Agenda />
        ) : modulo === 'clientes' ? (
          <Directorio />
        ) : modulo === 'servicios' ? (
          <Catalogo />
        ) : modulo === 'cursos' ? (
          <Programa />
        ) : modulo === 'productos' ? (
          <Almacen />
        ) : modulo === 'caja' ? (
          /* COBRAR Y EL CAJON SON LA MISMA PANTALLA. Eran dos modulos del menu
             y quien los usa es una sola persona parada en el mostrador: ver
             `mostrador.tsx`. */
          <Mostrador />
        ) : modulo === 'gastos' ? (
          <LibroDeGastos />
        ) : modulo === 'mensajes' ? (
          /* MENSAJES NO ES DUEÑO DE NI UN DATO DEL CLIENTE: guarda el hilo
             contra su ficha y lo demas lo lee de Clientes, Agenda y Ventas. */
          <Bandeja />
        ) : modulo === 'recordatorios' ? (
          /* RECORDATORIOS NO ES DUEÑO DE NINGUNA OTRA ENTIDAD: guarda a que
             cosa se refiere y el nombre lo resuelve la base al leer. */
          <CentroDeRecordatorios />
        ) : modulo === 'configuracion' ? (
          /* CONFIGURACION ADMINISTRA LAS SIETE TABLAS DE LA BASE y no duplica
             ninguna. Lo que se guarda ahi manda sobre los demas modulos: la
             moneda, los metodos de pago, el impuesto, los horarios y el tema. */
          <CentroDeConfiguracion />
        ) : modulo === 'reportes' ? (
          /* REPORTES NO ES UN MODULO MAS: no tiene tabla propia ni escribe una
             cifra. Lee de los otros ocho y los suma en el servidor. */
          <Analisis />
        ) : (
          <Pendiente modulo={modulo} />
        )
      }
      enLaBarraSuperior={
        <>
          {/*
            El buscador y la campana van en la barra SUPERIOR, no dentro de
            Inicio: sirven igual desde Agenda o desde Ventas, y tenerlos en un
            solo modulo obligaria a volver a Inicio para buscar a alguien.
          */}
          <Buscador negocio={acceso.negocioId} onAbrir={(c) =>
            ir(c.modulo, { intencion: `${c.modulo}:abrir:${c.id}` })
          } />
          <CampanaDeAvisos onIr={(modulo, parametros) =>
            ir(modulo, parametros ? { parametros: { ...parametros } } : {})
          } />
        </>
      }
      alFallar={(error, donde) => {
        // Se registra donde revento, no solo que revento. "Se cayo la
        // aplicacion" no sirve para nada tres semanas despues.
        console.error(`[pantalla ${donde}] ${error.message}`);
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* El repartidor de estados                                            */
/* ------------------------------------------------------------------ */

function Segun() {
  const { estado, llave, cerrarSesion } = useSesion();

  if (estado === 'cargando') return <Cargando />;
  if (estado === 'sin-sesion') return <Entrar />;

  /**
   * EL SEGUNDO PASO SE DA DE ALTA AQUI MISMO, Y ESO ES LO QUE PAGA LA DEUDA.
   *
   * Antes esta pantalla decia "termina de configurarla desde tu correo" — y no
   * habia ningun correo ni ninguna pantalla: el dueño quedaba encerrado afuera
   * de su propio centro, con el sistema publicado. Ese fue el fallo que obligo
   * a poner `segundoFactorApagado: true` y la guardia que ataba quitarlo a que
   * existiera `src/configuracion/`.
   *
   * La pantalla de alta TIENE que vivir de este lado. Ponerla solo dentro de
   * Configuracion habria repetido el fallo exacto: quien no tiene segundo
   * factor no entra, asi que jamas llegaria al modulo donde darlo de alta.
   */
  if (estado === 'falta-segundo-factor') {
    return (
      <Aviso
        titulo="Falta el segundo paso"
        accion={<Boton tono="contorno" onClick={() => void cerrarSesion()}>Salir</Boton>}
      >
        <SegundoFactor bloqueando />
      </Aviso>
    );
  }

  if (estado === 'sin-negocio') {
    return (
      <Aviso
        titulo="Tu cuenta todavía no está en ningún centro"
        accion={<Boton tono="contorno" onClick={() => void cerrarSesion()}>Salir</Boton>}
      >
        <p>
          Entraste bien, pero nadie te ha dado de alta en un centro. Pídele a quien administra el
          sistema que te invite con este correo.
        </p>
        {/*
          Y SI YA TE INVITARON, AQUI SE APLICA. Una invitacion se guarda contra
          un correo porque la membresia necesita una cuenta que todavia no
          existe; este boton es el momento en que las dos se juntan. Sin el, la
          invitacion se queda esperando para siempre y quien la recibio ve esta
          misma pantalla cada vez que entra, sin nada que hacer.
        */}
        <BuscarMiInvitacion />
      </Aviso>
    );
  }

  /**
   * LA LLAVE DE REINICIO.
   *
   * Al cambiar de cuenta, todo el arbol de abajo se destruye y se vuelve a
   * montar limpio. Sin esto quedan restos del centro anterior en memoria — y
   * esa es la peor clase de fuga, porque los numeros se mezclan y la pantalla
   * se ve perfectamente normal.
   */
  return (
    <ProveedorDeNavegacion key={llave}>
      <Interior />
    </ProveedorDeNavegacion>
  );
}

/* ------------------------------------------------------------------ */

export function Aplicacion() {
  /**
   * Sin conexion configurada NO se arranca a medias.
   *
   * Es lo primero que le pasa a quien clona el repositorio: sin `.env`, el
   * cliente de Supabase revienta en algun lugar profundo y lo que se ve es una
   * pantalla en blanco con un error en la consola que nadie va a abrir. Mejor
   * decirlo aqui, con el nombre del archivo que hay que leer.
   */
  if (!HAY_CONEXION) {
    return (
      <Aviso titulo="Falta configurar la conexión">
        <p>
          {NOMBRE_POR_OMISION} · {LEMA_POR_OMISION} todavía no sabe con qué base de datos hablar.
        </p>
        <p>
          Crea el archivo <code>.env</code> con <code>VITE_SUPABASE_URL</code> y{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>. Los pasos completos están en{' '}
          <strong>CONFIGURAR-CONEXION.md</strong>.
        </p>
      </Aviso>
    );
  }

  return (
    <ProveedorDeSesion>
      <Segun />
    </ProveedorDeSesion>
  );
}
