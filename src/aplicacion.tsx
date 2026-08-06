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

import { Marco, ProveedorDeNavegacion, resolverMenu, useNavegacion } from '@neron/base/marco';
import { Boton } from '@neron/base/ui';
import { useEffect, type ReactNode } from 'react';
import { ProveedorDeSesion, useSesion, useTardaDemasiado } from './identidad/sesion.js';
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
import { Pendiente } from './modulos/pendiente.js';
import { GRUPOS, MODULOS, MODULO_POR_OMISION, modulosVisibles } from './modulos/registro.js';
import { LEMA, NOMBRE_DEL_PRODUCTO } from './marca.js';
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

/* ------------------------------------------------------------------ */
/* El interior, ya con sesion                                          */
/* ------------------------------------------------------------------ */

function Interior() {
  const { acceso, cerrarSesion } = useSesion();
  const { ruta, ir } = useNavegacion();
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
    <Marco
      menu={menu}
      nombreDelNegocio={NOMBRE_DEL_PRODUCTO}
      nombreDeLaPersona={acceso.nombre}
      rolDeLaPersona={acceso.rolEtiqueta}
      logo={<MarcaVisible />}
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
          <Boton tono="contorno" onClick={() => void cerrarSesion()}>
            Salir
          </Boton>
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

  if (estado === 'falta-segundo-factor') {
    return (
      <Aviso
        titulo="Falta el segundo paso"
        accion={<Boton tono="contorno" onClick={() => void cerrarSesion()}>Salir</Boton>}
      >
        <p>
          Tu cuenta tiene permisos que exigen verificación en dos pasos. Termina de configurarla
          desde tu correo para poder entrar.
        </p>
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
          {NOMBRE_DEL_PRODUCTO} · {LEMA} todavía no sabe con qué base de datos hablar.
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
