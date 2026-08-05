/**
 * GUARDIAS DE NERON TERAPIAS
 *
 * Las de la base vigilan la base. Estas vigilan lo que solo puede salir mal
 * en el producto — y cada una existe por una razon concreta, no por gusto.
 *
 * Regla del mensaje de error, heredada de la base: tiene que explicar el POR
 * QUE, no solo el que. "Falta la capacidad en el registro" sirve; "patron
 * prohibido" no sirve para nada seis meses despues.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');

interface Falla { archivo: string; regla: string; porque: string }
const fallas: Falla[] = [];
const fallar = (archivo: string, regla: string, porque: string): void => {
  fallas.push({ archivo: relative(RAIZ, archivo), regla, porque });
};

function archivosDe(dir: string): string[] {
  const salida: string[] = [];
  let entradas: string[];
  try { entradas = readdirSync(dir); } catch { return salida; }
  for (const nombre of entradas) {
    if (nombre === 'node_modules' || nombre === 'dist' || nombre.startsWith('.')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosDe(ruta));
    else if (nombre.endsWith('.d.ts')) continue;
    else if (nombre.endsWith('.ts') || nombre.endsWith('.tsx')) salida.push(ruta);
  }
  return salida;
}

/** Quita comentarios antes de analizar. Leccion pagada en la base: una
 *  guardia que se cree los comentarios grita en falso, y una guardia que
 *  grita en falso se termina apagando. */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p) => p);
}

const FUENTE = archivosDe(join(RAIZ, 'src'));

/* ------------------------------------------------------------------ */
/* 1 — Ni un dato de ejemplo escondido en el codigo                    */
/* ------------------------------------------------------------------ */
/**
 * ES LA REGLA NUMERO UNO DEL PRODUCTO y la mas facil de romper sin querer:
 * alguien pone tres clientes de mentiras "para ver como queda", se le olvida
 * quitarlos, y a partir de ahi nadie sabe si los numeros de la pantalla son
 * reales. Un dato inventado contamina la confianza en todos los demas.
 *
 * Se buscan los nombres exactos de la captura de referencia, que son los que
 * de verdad se cuelan al copiar del diseño.
 */
function guardiaSinDatosDeEjemplo(): void {
  const DEL_DISEÑO = [
    'Ana López', 'José Pérez', 'María Torres', 'Carla Ramírez', 'Daniela Castro',
    'Laura Méndez', 'María López',
  ];
  for (const archivo of FUENTE) {
    const limpio = sinComentarios(readFileSync(archivo, 'utf8'));
    for (const nombre of DEL_DISEÑO) {
      if (limpio.includes(nombre)) {
        fallar(archivo, `trae "${nombre}", que es un dato de la captura de referencia`,
          'La captura es una guia visual, no contenido. Un nombre inventado en el codigo ' +
          'termina en la pantalla de alguien, y a partir de ahi duda tambien de lo que si es real.');
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2 — Todo modulo del menu esta en el registro, y al reves            */
/* ------------------------------------------------------------------ */
/**
 * El error que evita: agregar la pantalla y olvidar el permiso. Queda una
 * pantalla accesible para quien no deberia verla, y no se nota nunca porque
 * quien la prueba es el dueño, que puede todo.
 */
function guardiaRegistroCompleto(): void {
  const registro = readFileSync(join(RAIZ, 'src', 'modulos', 'registro.ts'), 'utf8');
  const enGrupos = [...registro.matchAll(/modulos: \[([^\]]+)\]/g)]
    .flatMap((m) => [...m[1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]!));
  const declarados = [...registro.matchAll(/^\s{4}id: '([a-z]+)',$/gm)].map((m) => m[1]!);

  for (const id of enGrupos) {
    if (!declarados.includes(id)) {
      fallar('src/modulos/registro.ts', `el grupo menciona "${id}" y no esta declarado`,
        'Un modulo mencionado en un grupo pero sin declarar simplemente no aparece, sin avisar. ' +
        'Se busca durante media hora antes de mirar aqui.');
    }
  }
  for (const id of declarados) {
    if (id === 'inicio') continue; // va suelto arriba, fuera de los grupos
    if (!enGrupos.includes(id)) {
      fallar('src/modulos/registro.ts', `"${id}" esta declarado pero no vive en ningun grupo`,
        'Un modulo fuera de todo grupo no sale en el menu lateral: existe y es inalcanzable.');
    }
  }
}

/* ------------------------------------------------------------------ */
/* 3 — Ni un color suelto: todo sale de los tokens                     */
/* ------------------------------------------------------------------ */
/**
 * El producto SOLO puede escribir colores en `marca.ts`, que son los cuatro
 * de la identidad. Cualquier otro color a mano no pasa por la prueba de
 * contraste, se ve bien en la laptop de quien lo escribio, y desaparece en la
 * tableta del mostrador con el sol encima.
 */
/**
 * LA UNICA EXCEPCION, y esta nombrada a proposito.
 *
 * `barrera-raiz.tsx` es la red de seguridad de hasta arriba: lo que se pinta
 * cuando el arranque revienta. Si usara las variables del sistema de diseño,
 * y lo que fallo fue justamente la hoja de estilos, la pantalla de error
 * saldria sin estilos — o sea, otra pantalla en blanco.
 *
 * Por eso sus colores van en linea. Es el unico archivo del producto que
 * tiene permiso, y la lista se queda corta a proposito: en cuanto crezca,
 * la regla deja de significar algo.
 */
const PUEDEN_LLEVAR_COLOR = ['marca.ts', 'barrera-raiz.tsx'];

function guardiaSinColoresSueltos(): void {
  for (const archivo of FUENTE) {
    if (PUEDEN_LLEVAR_COLOR.some((n) => archivo.endsWith(n))) continue;
    const limpio = sinComentarios(readFileSync(archivo, 'utf8'));
    const lineas = limpio.split('\n');
    for (let i = 0; i < lineas.length; i += 1) {
      const l = lineas[i]!;
      if (/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/.test(l) || /\brgba?\(/.test(l)) {
        fallar(archivo, `color escrito a mano en la linea ${i + 1}`,
          'Los colores del producto viven en marca.ts y pasan la prueba de contraste. Uno suelto ' +
          'no la pasa, y ademas rompe el tema oscuro sin que nadie lo note hasta que alguien lo usa.');
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 4 — La conexion se crea en un solo lugar                            */
/* ------------------------------------------------------------------ */
/**
 * Un cliente de Supabase por pantalla abre una conexion nueva cada vez y —lo
 * grave— cada uno lleva su propia copia de la sesion: la persona cierra
 * sesion en una pantalla y sigue dentro en la otra.
 */
function guardiaUnSoloCliente(): void {
  for (const archivo of FUENTE) {
    if (archivo.endsWith('supabase.ts')) continue;
    const limpio = sinComentarios(readFileSync(archivo, 'utf8'));
    if (/createClient\s*\(/.test(limpio)) {
      fallar(archivo, 'crea su propio cliente de Supabase',
        'El cliente se crea UNA VEZ en src/supabase.ts. Uno por pantalla abre conexiones de mas ' +
        'y cada uno lleva su propia sesion: cerrar sesion en una pantalla no la cierra en la otra.');
    }
  }
}

/* ------------------------------------------------------------------ */
/* 5 — La conversion de tipos vive donde esta explicada                */
/* ------------------------------------------------------------------ */
function guardiaSinConversionesSueltas(): void {
  for (const archivo of FUENTE) {
    if (archivo.endsWith('supabase.ts')) continue;
    const limpio = sinComentarios(readFileSync(archivo, 'utf8'));
    if (/\bas unknown as\b/.test(limpio)) {
      fallar(archivo, 'convierte tipos a la fuerza',
        'La unica conversion permitida es la del cliente de Supabase, en src/supabase.ts, donde ' +
        'esta explicada. Repartida por el codigo es la misma inseguridad en veinte lugares que ' +
        'nadie revisa.');
    }
  }
}

/* ------------------------------------------------------------------ */
/* 6 — Dos archivos no se llaman igual                                 */
/* ------------------------------------------------------------------ */
/**
 * LA CACHO LA GUARDIA DE PRUEBAS, y es la razon de que exista.
 *
 * Habia `src/agenda/agenda.tsx` y `src/datos/agenda.ts`. La guardia de
 * completitud empareja por NOMBRE, asi que los dos buscaban `agenda.test.ts`:
 * una sola prueba habria contado por los dos y uno se iba sin probar.
 *
 * Es la misma leccion que la base aprendio con tres archivos llamados
 * `supabase.ts`. Un nombre que dice que hace el archivo vale mas que uno
 * corto.
 */
function guardiaNombresUnicos(): void {
  const vistos = new Map<string, string>();
  for (const archivo of FUENTE) {
    const nombre = archivo.replace(/\\/g, '/').split('/').pop()!.replace(/\.tsx?$/, '');
    if (nombre === 'index') continue;
    const antes = vistos.get(nombre);
    if (antes) {
      fallar(archivo, `ya hay otro archivo llamado "${nombre}" en ${relative(RAIZ, antes)}`,
        'La guardia de pruebas empareja por nombre, asi que dos archivos iguales comparten una ' +
        'sola prueba y uno de los dos se va sin probar. Ponles nombres que digan que hacen.');
    } else {
      vistos.set(nombre, archivo);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 7 — Todo archivo de src tiene su prueba                             */
/* ------------------------------------------------------------------ */
function guardiaTodoTienePrueba(): void {
  const conPruebas = new Set(
    archivosDe(join(RAIZ, 'pruebas')).map((f) =>
      f.replace(/\\/g, '/').split('/').pop()!.replace(/\.test\.tsx?$/, '')),
  );
  for (const archivo of FUENTE) {
    const nombre = archivo.replace(/\\/g, '/').split('/').pop()!.replace(/\.tsx?$/, '');
    // `main` solo enchufa el arbol al documento: no hay decision que probar.
    if (nombre === 'main' || nombre === 'vite-env') continue;
    if (!conPruebas.has(nombre)) {
      fallar(archivo, `no tiene archivo de pruebas (falta pruebas/${nombre}.test.ts)`,
        'La advertencia del manual: si las pruebas se dejan para el final, no se escriben nunca.');
    }
  }
}

/* ------------------------------------------------------------------ */

const GUARDIAS = [
  { nombre: 'ni un dato de ejemplo', correr: guardiaSinDatosDeEjemplo },
  { nombre: 'el registro de modulos cuadra con el menu', correr: guardiaRegistroCompleto },
  { nombre: 'ni un color fuera de la marca', correr: guardiaSinColoresSueltos },
  { nombre: 'un solo cliente de Supabase', correr: guardiaUnSoloCliente },
  { nombre: 'sin conversiones de tipo sueltas', correr: guardiaSinConversionesSueltas },
  { nombre: 'dos archivos no se llaman igual', correr: guardiaNombresUnicos },
  { nombre: 'todo archivo tiene su prueba', correr: guardiaTodoTienePrueba },
];

for (const g of GUARDIAS) g.correr();

if (fallas.length === 0) {
  console.log(`  Fronteras: ${GUARDIAS.length} guardias en verde.`);
  for (const g of GUARDIAS) console.log(`    · ${g.nombre}`);
  process.exit(0);
}

console.error(`\n  FRONTERAS ROTAS — ${fallas.length} ${fallas.length === 1 ? 'falla' : 'fallas'}:\n`);
for (const f of fallas) {
  console.error(`  ${f.archivo}`);
  console.error(`    ${f.regla}`);
  console.error(`    Por que importa: ${f.porque}\n`);
}
process.exit(1);
