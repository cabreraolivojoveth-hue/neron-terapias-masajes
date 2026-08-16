/**
 * EL CHEQUEO DE TODO LO QUE SE ABRE ENCIMA.
 *
 *   npm run velos
 *   npm run velos -- cursos      solo un modulo
 *
 * POR QUE EXISTE, Y COMO SE VEIA LO QUE NO CACHO NADIE:
 *
 * El modal de "Categorias de cursos" salio a produccion con el velo encerrado
 * en la caja del modulo: una plancha oscura pegada en medio de la pantalla, sin
 * tapar la barra lateral ni la de arriba, con lo de atras desaparecido. Se veia
 * roto. Y estaba TODO en verde — tipos, catorce guardias, mil doscientas
 * pruebas y la compilacion. Ninguna de esas cosas mira una pantalla.
 *
 * La guardia 13 impide la causa que ya conocemos (el relleno "both" de una
 * animacion). Esto comprueba el EFECTO, que es lo unico que no se puede
 * enga�ar: abre de verdad cada cosa que se abre, en cada modulo, y mide el
 * velo contra la ventana. Si un dia aparece otra forma de encerrar un velo
 * —otra propiedad que cree un bloque contenedor, un componente nuevo que se
 * pinte en el sitio equivocado— la guardia no la va a conocer, y esto si.
 *
 * QUE SE EXIGE DE UN VELO, y las tres razones:
 *
 *   1. QUE TAPE LA VENTANA ENTERA. Si mide menos, esta encerrado: se lee como
 *      un recuadro oscuro dentro de la pagina en vez de como una capa encima.
 *   2. QUE NO TAPE DE MAS. Un velo casi opaco borra lo de atras y el modal
 *      queda flotando en un agujero negro, que es de lo que se quejo la dueña.
 *   3. QUE EL DIALOGO QUEPA. Un dialogo mas alto que la ventana esconde sus
 *      propios botones, y quien lo abre no encuentra como salir.
 */

import { chromium, type Page } from 'playwright';
import { direccionDelModulo, levantarLaVitrina } from './servidor-de-la-vitrina.js';
import { rutaDelNavegador } from './navegador.js';

const PUERTO = 5195;
const ANCHO = 1536;
const ALTO = 1024;

/**
 * Lo que se abre en cada modulo, por el NOMBRE de su boton.
 *
 * Se busca por nombre accesible y no por selector CSS a proposito: es lo que ve
 * quien usa la pantalla, y no se rompe al cambiar una clase. Lo que no exista
 * en un modulo se salta y se dice — un modulo sin nada que abrir no es un
 * fallo, pero un boton que se renombro y deja de comprobarse SI lo es, y por
 * eso se cuenta al final cuantos se revisaron de verdad.
 */
const LO_QUE_SE_ABRE: readonly {
  modulo: string;
  botones: readonly string[];
  /** Una pestaña que hay que abrir primero para llegar a esos botones. */
  pestana?: string;
}[] = [
  { modulo: 'inicio', botones: [] },
  { modulo: 'agenda', botones: ['Nueva cita'] },
  { modulo: 'clientes', botones: ['Nuevo cliente'] },
  { modulo: 'servicios', botones: ['Categorías', 'Nuevo servicio'] },
  { modulo: 'cursos', botones: ['Categorías', 'Nuevo curso'] },
  { modulo: 'productos', botones: ['Categorías', 'Nuevo producto'] },
  /*
   * CAJA SON DOS ENTRADAS PORQUE AHORA ES UNA SOLA PANTALLA CON PESTAÑAS.
   *
   * Al unir Ventas con Caja, el cobro y el cajon dejaron de ser dos modulos: los
   * dialogos del cajon quedaron detras de su pestaña. Sin abrirla primero, este
   * chequeo no los encontraba, los saltaba todos, y —lo peor— habria salido en
   * verde sin haber mirado ni uno. De ahi la pestaña previa.
   *
   * "Nueva cotizacion" no esta en la lista: no abre nada, solo limpia el carrito
   * y cambia de pestaña.
   */
  { modulo: 'caja', botones: ['Nuevo cliente'] },
  {
    modulo: 'caja', pestana: 'Corte de caja',
    botones: ['Registrar ingreso', 'Registrar retiro', 'Cerrar caja'],
  },
  /* Reportes solo abre uno: guardar la pregunta. Todo lo demas de la pantalla
     vive en la pantalla, que es lo que se pretendia. */
  { modulo: 'reportes', botones: ['Guardar reporte actual'] },
];

/** Lo mas oscuro que se le permite a un velo. Mas que esto borra lo de atras. */
const OPACIDAD_MAXIMA = 0.45;

interface Falla { donde: string; que: string; porque: string }
const fallas: Falla[] = [];

/**
 * La opacidad de un color, en cualquiera de las formas que devuelve el navegador.
 *
 * NO BASTA CON LEER "rgba(...)", y esto me engaño de verdad: al derivar el velo
 * con "color-mix", Chrome dejo de reportar "rgba(20, 18, 14, 0.45)" y empezo a
 * reportar "color(srgb 0.078 0.07 0.054 / 0.2616)". El lector viejo no
 * encontraba su patron, devolvia 1 por defecto, y el chequeo acusaba a los diez
 * velos de tapar al 100% cuando tapaban al 26%.
 *
 * Un valor por defecto que ACUSA es menos malo que uno que absuelve, pero
 * igualmente es mentira. Se leen las dos familias, y si no se entiende el color
 * se devuelve NaN para que quien lea el error sepa que no se pudo medir en vez
 * de creerse un numero inventado.
 */
export function opacidadDe(color: string): number {
  const moderno = /^(?:color|oklab|oklch|lab|lch|hsl|hwb)\([^)]*\/\s*([\d.]+%?)\s*\)/.exec(color);
  if (moderno) {
    const t = moderno[1]!;
    return t.endsWith('%') ? Number(t.slice(0, -1)) / 100 : Number(t);
  }
  // Sin barra y sin alfa declarada, estas familias son opacas.
  if (/^(?:color|oklab|oklch|lab|lch|hsl|hwb)\(/.test(color)) return 1;

  const clasico = /^rgba?\(([^)]+)\)/.exec(color);
  if (clasico) {
    const partes = clasico[1]!.split(/[,\s/]+/).filter(Boolean);
    return partes.length >= 4 ? Number(partes[3]!.replace('%', '')) : 1;
  }
  if (color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return 0;
  return Number.NaN;
}

async function revisarUnVelo(pagina: Page, donde: string): Promise<void> {
  const medida = await pagina.evaluate(() => {
    const velo = document.querySelector('.neron-velo') as HTMLElement | null;
    if (!velo) return null;
    const caja = velo.getBoundingClientRect();
    const c = getComputedStyle(velo);
    const dialogo = velo.querySelector('[role="dialog"]') as HTMLElement | null;
    const cajaDialogo = dialogo?.getBoundingClientRect() ?? null;

    /* Quien lo encierra, para que el error diga DONDE mirar y no solo que algo
       esta mal. Buscar esto a mano cuesta media mañana. */
    const jaulas: string[] = [];
    for (let n = velo.parentElement; n; n = n.parentElement) {
      const e = getComputedStyle(n);
      const razones: string[] = [];
      if (e.transform !== 'none') razones.push(`transform=${e.transform}`);
      if (e.filter !== 'none') razones.push('filter');
      if (e.perspective !== 'none') razones.push('perspective');
      if (e.willChange !== 'auto') razones.push(`will-change=${e.willChange}`);
      if (e.contain !== 'none') razones.push(`contain=${e.contain}`);
      if (e.containerType && e.containerType !== 'normal') razones.push('container-type');
      if (razones.length > 0) {
        jaulas.push(`${n.tagName.toLowerCase()}.${String(n.className).slice(0, 50)} (${razones.join(', ')})`);
      }
    }

    return {
      caja: { x: caja.x, y: caja.y, ancho: caja.width, alto: caja.height },
      fondo: c.backgroundColor,
      desenfoque: c.backdropFilter,
      ventana: { ancho: window.innerWidth, alto: window.innerHeight },
      dialogo: cajaDialogo ? { alto: cajaDialogo.height, ancho: cajaDialogo.width } : null,
      jaulas,
    };
  });

  if (!medida) {
    fallas.push({
      donde,
      que: 'se apreto el boton y NO se abrio ningun velo',
      porque:
        'O el boton dejo de abrir lo que abria, o lo que abre ya no pasa por el Modal de la base. ' +
        'Si es lo segundo, esa cosa nueva no hereda nada de lo que se arreglo aqui: revisala a mano ' +
        'y agregala a este chequeo.',
    });
    return;
  }

  const { caja, ventana, jaulas } = medida;

  /* 1 — Que tape la ventana entera. Un pixel de tolerancia por el redondeo. */
  const tapaTodo =
    caja.x <= 1 && caja.y <= 1 &&
    caja.ancho >= ventana.ancho - 1 && caja.alto >= ventana.alto - 1;

  if (!tapaTodo) {
    fallas.push({
      donde,
      que:
        `el velo mide ${Math.round(caja.ancho)}x${Math.round(caja.alto)} en ` +
        `(${Math.round(caja.x)},${Math.round(caja.y)}) y la ventana es ` +
        `${ventana.ancho}x${ventana.alto}`,
      porque:
        'Esta ENCERRADO. Pide "inset: 0" para tapar la ventana, asi que si mide menos es porque un ' +
        'antepasado se volvio su bloque contenedor, y entonces se ve como una plancha oscura pegada ' +
        'en medio de la pagina en vez de una capa encima. ' +
        (jaulas.length > 0
          ? `Lo encierra: ${jaulas.join(' / ')}`
          : 'No se encontro que lo encierre: mira si el velo se esta pintando dentro de un sitio raro.'),
    });
  }

  /* 2 — Que no tape de mas. */
  const opacidad = opacidadDe(medida.fondo);
  if (Number.isNaN(opacidad)) {
    fallas.push({
      donde,
      que: `no se pudo leer la opacidad del velo: el navegador dice "${medida.fondo}"`,
      porque:
        'Sin poder medirla, este chequeo no sabe si el velo tapa de mas. Agrega esa forma de color ' +
        'a "opacidadDe" en vez de dejar que el chequeo pase sin haber medido.',
    });
  } else if (opacidad > OPACIDAD_MAXIMA) {
    fallas.push({
      donde,
      que: `el velo tapa al ${Math.round(opacidad * 100)}%`,
      porque:
        `Mas del ${Math.round(OPACIDAD_MAXIMA * 100)}% borra lo de atras y el dialogo queda flotando ` +
        'en un agujero negro. El velo del Centro apaga y desenfoca; no tacha.',
    });
  }

  /* 3 — Que el dialogo quepa en la ventana. */
  if (medida.dialogo && medida.dialogo.alto > ventana.alto) {
    fallas.push({
      donde,
      que: `el dialogo mide ${Math.round(medida.dialogo.alto)} de alto y la ventana ${ventana.alto}`,
      porque:
        'Se sale de la pantalla, y lo que se sale por abajo son siempre los botones: quien lo abre ' +
        'no encuentra como guardar ni como salir.',
    });
  }
}

async function principal(): Promise<void> {
  const pedidos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const cuales =
    pedidos.length > 0 ? LO_QUE_SE_ABRE.filter((x) => pedidos.includes(x.modulo)) : LO_QUE_SE_ABRE;

  const servidor = await levantarLaVitrina(PUERTO);
  let revisados = 0;
  let saltados = 0;

  try {
    const navegador = await chromium.launch({ executablePath: rutaDelNavegador() });
    const pagina = await navegador.newPage({
      viewport: { width: ANCHO, height: ALTO },
      deviceScaleFactor: 1,
    });

    for (const { modulo, botones, pestana } of cuales) {
      for (const boton of botones) {
        // Se recarga entre cada uno: un modal que quedo abierto le cambia el
        // resultado al siguiente, y ese falso verde es peor que no revisar.
        await pagina.goto(direccionDelModulo(PUERTO, modulo), { waitUntil: 'networkidle' });
        await pagina.waitForTimeout(900);

        // Si lo que se abre vive detras de una pestaña, se abre primero.
        if (pestana) {
          try {
            await pagina.getByRole('tab', { name: pestana }).first().click({ timeout: 3000 });
            await pagina.waitForTimeout(600);
          } catch {
            console.log(`  · ${modulo}: no se encontro la pestaña "${pestana}"`);
            saltados += 1;
            continue;
          }
        }

        const destino = pagina.getByRole('button', { name: boton }).first();
        try {
          await destino.click({ timeout: 3000 });
        } catch {
          console.log(`  · ${modulo} → "${boton}": no esta en esta pantalla, se salta`);
          saltados += 1;
          continue;
        }
        await pagina.waitForTimeout(600);
        const donde = pestana ? `${modulo}/${pestana} → "${boton}"` : `${modulo} → "${boton}"`;
        await revisarUnVelo(pagina, donde);
        revisados += 1;
        console.log(`  · ${donde}`);
      }
    }

    await navegador.close();
  } finally {
    servidor.kill('SIGTERM');
  }

  console.log('');

  /*
   * UN CHEQUEO QUE NO REVISO NADA NO PASA, y esta linea existe porque ya me
   * enga�o a mi mismo: la primera vez que corrio, los doce botones fallaron al
   * apretarse, los doce se saltaron, y el resumen dijo "ninguno encerrado" en
   * verde. Era verdad y era inutil — no habia mirado ni uno.
   *
   * Un verde que puede significar "todo bien" o "no revise nada" no sirve para
   * decidir si se publica.
   */
  if (revisados === 0) {
    console.error('  VELOS: no se pudo abrir NI UNO de los que se iban a revisar.\n');
    console.error('    Por que importa: un chequeo que no revisa nada sale en verde y no dice nada.');
    console.error('    O la vitrina no esta pintando (mira si la hoja de estilos compila: npm run tipos),');
    console.error('    o los botones se renombraron y hay que actualizar la lista de este script.');
    process.exit(1);
  }

  if (fallas.length === 0) {
    console.log(`  Velos: ${revisados} revisados y ninguno encerrado ni de mas.`);
    if (saltados > 0) {
      console.log(`  (${saltados} no estaban en su pantalla; si alguno deberia estar, se renombro.)`);
    }
    process.exit(0);
  }

  console.error(`  VELOS ROTOS — ${fallas.length} ${fallas.length === 1 ? 'falla' : 'fallas'}:\n`);
  for (const f of fallas) {
    console.error(`  ${f.donde}`);
    console.error(`    ${f.que}`);
    console.error(`    Por que importa: ${f.porque}\n`);
  }
  process.exit(1);
}

principal().catch((e) => {
  console.error(`  No se pudo revisar los velos: ${(e as Error).message}`);
  process.exit(1);
});
