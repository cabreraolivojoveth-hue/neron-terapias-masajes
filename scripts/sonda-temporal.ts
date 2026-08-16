import { chromium } from 'playwright';
import { rutaDelNavegador } from './navegador.js';
import { levantarLaVitrina } from './servidor-de-la-vitrina.js';

const PUERTO = 5199;
const dir = (m: string) => `http://localhost:${PUERTO}/pruebas-visuales/index.html?modulo=${m}`;

const TAMANOS = [
  { nombre: 'telefono', ancho: 390, alto: 740 },
  { nombre: 'tablet', ancho: 820, alto: 1024 },
  { nombre: 'escritorio', ancho: 1440, alto: 900 },
];

const servidor = await levantarLaVitrina(PUERTO);
const navegador = await chromium.launch({ executablePath: rutaDelNavegador() });

for (const t of TAMANOS) {
  console.log(`\n=== ${t.nombre} (${t.ancho}x${t.alto})`);
  const pagina = await navegador.newPage({ viewport: { width: t.ancho, height: t.alto } });
  await pagina.goto(dir('caja'), { waitUntil: 'networkidle' });
  await pagina.waitForTimeout(600);

  // Se llena el carrito como se llena de verdad: tocando "Agregar" varias veces.
  const agregar = pagina.getByRole('button', { name: /Agregar/ });
  const cuantos = await agregar.count();
  console.log(`  botones "Agregar" en el catalogo: ${cuantos}`);
  for (let v = 0; v < 3; v += 1) {
    for (let i = 0; i < Math.min(cuantos, 6); i += 1) {
      try { await agregar.nth(i).click({ timeout: 1500 }); } catch { /* fuera de vista */ }
    }
  }
  await pagina.waitForTimeout(500);

  const medida = await pagina.evaluate(() => {
    const cobro = document.querySelector('.vta-cobro') as HTMLElement | null;
    const boton = [...document.querySelectorAll('button')]
      .find((b) => /Cobrar|Registrar la venta|Abrir caja/i.test(b.textContent ?? ''));
    const doc = document.documentElement;
    return {
      renglones: document.querySelectorAll('.vta-renglon, .pz-renglon, tbody tr').length,
      paginaAlta: doc.scrollHeight,
      ventana: window.innerHeight,
      sePuedeDesplazar: doc.scrollHeight > window.innerHeight + 1,
      cobroAlto: cobro ? Math.round(cobro.getBoundingClientRect().height) : -1,
      cobroPegajoso: cobro ? getComputedStyle(cobro).position : 'no hay',
      botonTexto: boton?.textContent?.trim() ?? 'NO HAY BOTON',
    };
  });
  console.log('  ' + JSON.stringify(medida));

  // Se baja hasta el fondo, como haria una persona con la rueda.
  await pagina.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await pagina.waitForTimeout(400);

  const alcance = await pagina.evaluate(() => {
    const boton = [...document.querySelectorAll('button')]
      .find((b) => /^Cobrar|Registrar la venta|Abrir caja/i.test(b.textContent ?? ''));
    if (!boton) return { hay: false };
    const c = boton.getBoundingClientRect();
    return {
      hay: true,
      texto: boton.textContent?.trim(),
      arriba: Math.round(c.top),
      abajo: Math.round(c.bottom),
      ventana: window.innerHeight,
      alcanzable: c.top >= -1 && c.bottom <= window.innerHeight + 1,
    };
  });
  console.log('  tras bajar del todo: ' + JSON.stringify(alcance));
  await pagina.close();
}

await navegador.close();
servidor.kill('SIGTERM');
