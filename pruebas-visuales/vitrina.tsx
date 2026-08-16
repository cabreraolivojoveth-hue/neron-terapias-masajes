/**
 * LA VITRINA — la aplicacion de verdad, para poder mirarla.
 *
 * Monta el MISMO arbol que produccion —el mismo marco, los mismos modulos, la
 * misma hoja de estilos— y solo cambia dos piezas por sus dobles: el servidor
 * y la sesion. Si aqui se ve mal, en produccion se ve mal.
 *
 * El modulo se escoge por la direccion: `?modulo=ventas`.
 */

import { generarCss } from '@neron/base/ui';
import { ProveedorDeNavegacion, resolverMenu, useNavegacion } from '@neron/base/marco';
import { createRoot } from 'react-dom/client';
import { Agenda } from '../src/agenda/agenda.js';
import { Inicio } from '../src/inicio/inicio.js';
import { Directorio } from '../src/clientes/directorio.js';
import { Catalogo } from '../src/servicios/catalogo.js';
import { Programa } from '../src/cursos/programa.js';
import { Almacen } from '../src/productos/almacen.js';
import { Mostrador } from '../src/caja/mostrador.js';
import { LibroDeGastos } from '../src/gastos/libro-de-gastos.js';
import { Analisis } from '../src/reportes/analisis.js';
import { Bandeja } from '../src/mensajes/bandeja.js';
import { CentroDeRecordatorios } from '../src/recordatorios/centro-de-recordatorios.js';
import { CentroDeConfiguracion } from '../src/configuracion/centro-de-configuracion.js';
import { Pendiente } from '../src/modulos/pendiente.js';
import { GRUPOS, MODULOS, modulosVisibles } from '../src/modulos/registro.js';
import { cssDeMarca } from '../src/marca.js';
import { LEMA_POR_OMISION, NOMBRE_POR_OMISION } from '../src/datos/configuracion.js';
import { MarcaVisible } from '../src/marco/marca-visible.js';
import { Buscador } from '../src/marco/buscador.js';
import { CampanaDeAvisos } from '../src/marco/notificaciones.js';
import { estilosDelProducto } from '../src/estilos.js';
import { Armazon } from '../src/marco/armazon.js';
import { useSesion } from '../src/identidad/sesion.js';

const hoja = document.createElement('style');
hoja.textContent = `${generarCss()}\n${cssDeMarca()}\n${estilosDelProducto()}`;
document.head.appendChild(hoja);

const PANTALLAS: Readonly<Record<string, () => React.JSX.Element>> = {
  inicio: () => <Inicio />,
  agenda: () => <Agenda />,
  clientes: () => <Directorio />,
  servicios: () => <Catalogo />,
  cursos: () => <Programa />,
  productos: () => <Almacen />,
  /* Cobrar y el cajon son la MISMA pantalla desde que se unieron. Se deja
     "ventas" apuntando al mismo sitio para no romper una foto vieja. */
  ventas: () => <Mostrador />,
  caja: () => <Mostrador />,
  gastos: () => <LibroDeGastos />,
  reportes: () => <Analisis />,
  mensajes: () => <Bandeja />,
  recordatorios: () => <CentroDeRecordatorios />,
  configuracion: () => <CentroDeConfiguracion />,
};

function Vitrina() {
  const { acceso } = useSesion();
  const { ruta } = useNavegacion();
  if (!acceso) return null;

  const cual = ruta.modulo;
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

  return (
    <Armazon
      menu={menu}
      nombreDeLaPersona={acceso.nombre}
      rolDeLaPersona={acceso.rolEtiqueta}
      logo={<MarcaVisible />}
      pintarModulo={() => (PANTALLAS[cual] ?? (() => <Pendiente modulo={cual} />))()}
      enLaBarraSuperior={
        <>
          <Buscador negocio={acceso.negocioId} onAbrir={() => {}} />
          <CampanaDeAvisos onIr={() => {}} />
        </>
      }
      alFallar={(error, donde) => console.error(`[${donde}] ${error.message}`)}
      onSalir={() => {}}
    />
  );
}

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta <div id="raiz">.');
document.title = `Vitrina · ${NOMBRE_POR_OMISION} · ${LEMA_POR_OMISION}`;

/**
 * SIN `StrictMode` a proposito.
 *
 * El doble montaje que hace en desarrollo dispara dos veces las animaciones de
 * entrada, y la foto sale a media transicion. Aqui se fotografia, no se
 * depura.
 */
/**
 * La direccion inicial sale de `?modulo=`, no del proveedor por omision: asi
 * cada foto se pide por su nombre y el marco marca bien el menu.
 */
const cual = new URLSearchParams(window.location.search).get('modulo') ?? 'inicio';

createRoot(raiz).render(
  <ProveedorDeNavegacion direccionInicial={`/${cual}`}>
    <Vitrina />
  </ProveedorDeNavegacion>,
);
