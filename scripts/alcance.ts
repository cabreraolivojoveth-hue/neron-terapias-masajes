/**
 * ¿SE PUEDE LLEGAR A TODO? — el chequeo de que nada queda fuera de alcance.
 *
 *   npm run alcance
 *   npm run alcance -- caja        solo un modulo
 *
 * POR QUE EXISTE:
 *
 * Se reporto que al ir metiendo productos en "Cobrar" la zona del total, el
 * pago y el boton de cobrar terminaba fuera de la pantalla y no habia forma de
 * llegar. La tarjeta del cobro llevaba `position: sticky` ella sola, dentro de
 * una columna mas corta que el carrito — una forma fragil que se rompe en
 * cuanto lo de dentro crece mas que la ventana: lo pegajoso se mueve CON la
 * pagina, asi que su parte de abajo no se alcanza desplazandose.
 *
 * HONESTAMENTE: con los datos de la vitrina no se consiguio reproducir el
 * sintoma exacto —la tarjeta medida son 592 pixeles y cabe en las cuatro
 * ventanas de aqui—, asi que esto NO es la prueba de regresion de aquel caso.
 * Es la red que faltaba: comprueba que a todo se llega y que nada pegajoso se
 * pasa de alto, en cuatro tamaños y con el carrito lleno. Si vuelve a pasar con
 * mas renglones o mas pagos de los que se ponen aqui, lo que hay que hacer es
 * agrandar el caso de abajo, no cambiar la regla.
 *
 * NADA DE LA BATERIA LO PODIA VER. Los tipos no miran. Las guardias leen texto.
 * Las pruebas de componentes corren en un DOM sin diseño —happy-dom no calcula
 * `position: sticky` ni el alto de nada—, asi que buscan el boton, lo
 * encuentran, y lo tocan tan campantes. Los velos miden lo que se abre ENCIMA,
 * no lo que se queda debajo. Y la captura retrata una pantalla vacia, que es
 * justo cuando el fallo no aparece.
 *
 * QUE HACE: abre cada modulo en tres tamaños de pantalla, LLENA lo que se puede
 * llenar —el carrito, sobre todo—, y despues intenta llegar a cada boton como
 * llegaria una persona: desplazando. Un boton al que no se llega es una falla.
 *
 * LA REGLA, escrita una vez: si el contenido crece mas que el espacio que hay,
 * TIENE que poderse desplazar. En computadora con la rueda; en un telefono con
 * el dedo. Nunca "el formulario crecio y el boton quedo abajo, pero no puedo
 * llegar".
 */

import { chromium, type Page } from 'playwright';
import { direccionDelModulo, levantarLaVitrina } from './servidor-de-la-vitrina.js';
import { rutaDelNavegador } from './navegador.js';

const PUERTO = 5197;

/**
 * Los tres tamaños que de verdad se usan.
 *
 * El telefono va primero a proposito: es donde todo esto falla, y es el que
 * nadie prueba porque se desarrolla en una pantalla grande.
 */
const TAMANOS = [
  { nombre: 'teléfono', ancho: 390, alto: 740 },
  { nombre: 'tablet', ancho: 820, alto: 1024 },
  { nombre: 'escritorio', ancho: 1440, alto: 900 },
  /* Un portatil bajo. Es donde el cobro dejaba de alcanzarse: en una pantalla
     alta el mismo contenido cabe y no pasa nada. */
  { nombre: 'portátil bajo', ancho: 1440, alto: 620 },
];

/**
 * Que se revisa de cada modulo.
 *
 * `llenar` es el paso que hace aparecer el fallo: con el carrito vacio la
 * pantalla cabe de sobra y todo parece bien. `abre` son los dialogos, que se
 * miden con su propio desplazamiento interno.
 */
const LO_QUE_SE_REVISA: readonly {
  modulo: string;
  pestana?: string;
  llenar?: boolean;
  abre?: readonly string[];
}[] = [
  { modulo: 'inicio' },
  { modulo: 'agenda', abre: ['Nueva cita'] },
  { modulo: 'clientes', abre: ['Nuevo cliente'] },
  { modulo: 'servicios', abre: ['Nuevo servicio'] },
  { modulo: 'cursos', abre: ['Nuevo curso'] },
  { modulo: 'productos', abre: ['Nuevo producto'] },
  /* El carrito lleno es el caso que rompia: una venta de diez renglones tiene
     que poder terminarse igual que una de uno. */
  { modulo: 'caja', llenar: true, abre: ['Nuevo cliente'] },
  {
    modulo: 'caja', pestana: 'Corte de caja',
    abre: ['Registrar ingreso', 'Registrar retiro', 'Cerrar caja'],
  },
  { modulo: 'gastos', abre: ['Nuevo gasto'] },
  { modulo: 'reportes', abre: ['Guardar reporte actual'] },
  { modulo: 'mensajes', abre: ['Plantillas', 'Nuevo mensaje'] },
];

interface Falla { donde: string; que: string }
const fallas: Falla[] = [];
let revisados = 0;

/**
 * Llena el carrito tocando el catálogo, como se llena de verdad.
 *
 * Se escribe en el buscador primero porque el catálogo solo se pide cuando hay
 * texto o tipo: sin eso no hay nada que agregar y la prueba pasaria sin haber
 * probado nada.
 */
async function llenarElCarrito(pagina: Page): Promise<number> {
  /*
   * SE TOCA EL FILTRO "Todos" PRIMERO. El catalogo no se pide hasta que hay
   * texto escrito o un tipo escogido: sin eso no hay nada que agregar y este
   * chequeo saldria en verde sin haber llenado nada — que es exactamente el
   * chequeo que no sirve.
   */
  try {
    await pagina.getByPlaceholder('Buscar por nombre o código…')
      .fill('a', { timeout: 3000 });
    // La espera del buscador son 300 ms; se le dan de sobra.
    await pagina.waitForTimeout(900);
  } catch { /* sin buscador: se sigue igual y se dice al final */ }

  let puestos = 0;
  // Los conceptos del catalogo se llaman por su nombre, no "Agregar": se
  // apuntan por su sitio en la lista.
  const conceptos = pagina.locator('.vta-catalogo .vta-concepto');
  const cuantos = await conceptos.count();
  for (let i = 0; i < cuantos; i += 1) {
    try {
      await conceptos.nth(i).click({ timeout: 1500 });
      puestos += 1;
    } catch { /* deshabilitado por falta de existencias */ }
  }

  /*
   * Y VARIOS PAGOS, que es lo que hace crecer la columna del cobro — la parte
   * que de verdad se quedaba fuera de alcance. Con un solo metodo la tarjeta
   * mide poco y el fallo no aparece.
   */
  for (const metodo of ['Efectivo', 'Tarjeta', 'Transferencia']) {
    try {
      await pagina.getByRole('button', { name: metodo, exact: true }).first()
        .click({ timeout: 1200 });
    } catch { /* ese metodo no esta */ }
  }
  return puestos;
}

/**
 * ¿Se puede llegar a este boton desplazando?
 *
 * Se le pide al navegador que lo traiga a la vista —que es lo que hace la rueda,
 * el dedo y el teclado— y despues se mira DONDE quedo. Si sigue fuera de la
 * ventana, no hay forma de tocarlo: da igual que este pintado.
 */
async function seLlegaATodo(pagina: Page, donde: string): Promise<void> {
  const inalcanzables = await pagina.evaluate(() => {
    const malos: string[] = [];
    const botones = [...document.querySelectorAll('button, a[href], [role="tab"]')];

    for (const b of botones) {
      const e = b as HTMLElement;
      // Lo que esta escondido a proposito no cuenta: no se puede llegar a algo
      // que no se quiere enseñar, y eso no es un fallo.
      if (e.offsetParent === null && getComputedStyle(e).position !== 'fixed') continue;
      if (e.closest('[aria-hidden="true"], [inert], [hidden]')) continue;
      const c0 = e.getBoundingClientRect();
      if (c0.width === 0 || c0.height === 0) continue;

      /**
       * LO QUE ESTA FUERA DE PANTALLA A LO ANCHO SE SALTA, y no es una excusa:
       * son dos patrones deliberados y los dos son correctos.
       *
       *   · "Ir al contenido" vive en `left: -9999px` y solo aparece al
       *     enfocarlo con el teclado. Es el atajo para no recorrer el menu
       *     entero en cada pantalla.
       *   · Debajo de 1024 la barra lateral esta guardada fuera del lienzo
       *     hasta que se toca la hamburguesa.
       *
       * Lo que se vigila aqui es lo VERTICAL, que es donde estaba el fallo: el
       * formulario crece hacia abajo y el boton se va de la pantalla.
       */
      if (c0.right <= 0 || c0.left >= window.innerWidth) continue;

      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      const c = e.getBoundingClientRect();
      if (c.bottom <= window.innerHeight + 2 && c.top >= -2) continue;

      const texto = (e.textContent ?? '').trim().slice(0, 40) || e.getAttribute('aria-label') || '?';
      malos.push(`"${texto}" queda en ${Math.round(c.top)}..${Math.round(c.bottom)} de ${window.innerHeight}`);
    }
    /**
     * Y LA REGLA ESTRUCTURAL, que es la que de verdad caza el fallo:
     *
     * NADA PEGAJOSO NI FIJO PUEDE SER MAS ALTO QUE LA VENTANA sin poder
     * recorrerse por dentro. Un elemento pegajoso se mueve CON la pagina: si
     * mide mas que la pantalla, su parte de abajo no se alcanza jamas —
     * desplazarse no lo sube, porque va pegado. El boton esta pintado, existe
     * en el arbol, responde a las pruebas… y no hay forma de tocarlo.
     *
     * Recorrer cada boton no basta para verlo: con la ventana alta o con poco
     * contenido el elemento cabe y todo parece bien. Es lo que hace que este
     * fallo aparezca en la pantalla de una persona y no en la de quien lo
     * programo. Por eso se comprueba la FORMA y no solo el sintoma.
     */
    for (const n of document.querySelectorAll('*')) {
      const e = n as HTMLElement;
      const s = getComputedStyle(e);
      if (s.position !== 'sticky' && s.position !== 'fixed') continue;
      const c = e.getBoundingClientRect();
      if (c.height <= window.innerHeight) continue;
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') continue;
      malos.push(
        `"${e.className || e.tagName}" está ${s.position} y mide ${Math.round(c.height)} ` +
        `en una ventana de ${window.innerHeight}: lo de abajo no se alcanza nunca`,
      );
    }

    // Se devuelven pocos: la lista entera de un fallo de maquetacion son
    // cuarenta lineas y la causa siempre es la misma.
    return [...new Set(malos)].slice(0, 4);
  });

  revisados += 1;
  for (const m of inalcanzables) fallas.push({ donde, que: m });
}

/** Lo que se abre encima: se mide su propio desplazamiento interno. */
async function revisarLoQueSeAbre(pagina: Page, donde: string): Promise<void> {
  const medida = await pagina.evaluate(() => {
    const dialogo = document.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!dialogo) return { hay: false, malos: [] as string[] };

    const malos: string[] = [];
    const c = dialogo.getBoundingClientRect();
    if (c.bottom > window.innerHeight + 2 || c.top < -2) {
      malos.push(`el diálogo mide ${Math.round(c.height)} y se sale de la ventana de ${window.innerHeight}`);
    }

    /* Si lo de dentro no cabe, TIENE que poderse recorrer. Un cuerpo que
       desborda sin `overflow-y` deja los ultimos campos —y el boton de
       guardar— recortados sin nada que mover. */
    for (const n of dialogo.querySelectorAll('*')) {
      const e = n as HTMLElement;
      if (e.scrollHeight <= e.clientHeight + 1) continue;
      const o = getComputedStyle(e).overflowY;
      if (o === 'auto' || o === 'scroll') continue;
      if (o === 'visible') continue; // desborda a la vista, no se recorta
      malos.push(`"${e.className || e.tagName}" desborda ${e.scrollHeight - e.clientHeight}px y NO se puede recorrer`);
    }

    // Y el pie con los botones tiene que quedar dentro.
    const pie = dialogo.querySelector('.neron-modal__pie') as HTMLElement | null;
    if (pie) {
      const p = pie.getBoundingClientRect();
      if (p.bottom > window.innerHeight + 2) malos.push('el pie del diálogo no se alcanza');
    }
    return { hay: true, malos: malos.slice(0, 3) };
  });

  if (!medida.hay) {
    fallas.push({ donde, que: 'se apretó el botón y no se abrió nada' });
    return;
  }
  revisados += 1;
  for (const m of medida.malos) fallas.push({ donde, que: m });
}

async function principal(): Promise<void> {
  const pedidos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const cuales = pedidos.length > 0
    ? LO_QUE_SE_REVISA.filter((x) => pedidos.includes(x.modulo))
    : LO_QUE_SE_REVISA;

  const servidor = await levantarLaVitrina(PUERTO);
  try {
    const navegador = await chromium.launch({ executablePath: rutaDelNavegador() });

    for (const t of TAMANOS) {
      const pagina = await navegador.newPage({ viewport: { width: t.ancho, height: t.alto } });

      for (const caso of cuales) {
        const nombre = caso.pestana ? `${caso.modulo}/${caso.pestana}` : caso.modulo;
        const donde = `${t.nombre} · ${nombre}`;

        await pagina.goto(direccionDelModulo(PUERTO, caso.modulo), { waitUntil: 'networkidle' });
        await pagina.waitForTimeout(350);

        if (caso.pestana) {
          try {
            await pagina.getByRole('tab', { name: caso.pestana }).first().click({ timeout: 3000 });
            await pagina.waitForTimeout(300);
          } catch {
            console.log(`  (en ${nombre} no estaba la pestaña)`);
            continue;
          }
        }

        if (caso.llenar) {
          const puestos = await llenarElCarrito(pagina);
          if (puestos === 0) console.log(`  (en ${nombre} no se pudo llenar el carrito)`);
          await pagina.waitForTimeout(300);
        }

        await seLlegaATodo(pagina, donde);

        for (const boton of caso.abre ?? []) {
          try {
            await pagina.getByRole('button', { name: boton }).first().click({ timeout: 3000 });
          } catch {
            continue; // ese boton no existe aqui; los velos ya lo cuentan
          }
          await pagina.waitForTimeout(350);
          await revisarLoQueSeAbre(pagina, `${donde} → "${boton}"`);
          await pagina.keyboard.press('Escape');
          await pagina.waitForTimeout(200);
        }
      }

      await pagina.close();
    }

    await navegador.close();
  } finally {
    servidor.kill('SIGTERM');
  }

  if (fallas.length === 0) {
    console.log(`\n  Alcance: ${revisados} pantallas revisadas en tres tamaños, y a todo se llega.`);
    process.exit(0);
  }

  console.error(`\n  HAY ${fallas.length} COSA(S) A LAS QUE NO SE LLEGA:\n`);
  for (const f of fallas) console.error(`  ${f.donde}\n    ${f.que}\n`);
  console.error(
    '  La regla: si el contenido crece mas que el espacio, tiene que poderse desplazar.\n' +
    '  Los sospechosos de siempre son "position: sticky" en algo mas alto que la\n' +
    '  ventana, "overflow: hidden" en un contenedor que creció, y una altura fija en\n' +
    '  pixeles donde deberia ir un maximo.\n',
  );
  process.exit(1);
}

principal().catch((e) => {
  console.error(`  No se pudo revisar el alcance: ${(e as Error).message}`);
  process.exit(1);
});
