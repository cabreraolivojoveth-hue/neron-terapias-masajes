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
/* 8 — La deuda del segundo factor se paga cuando llegue Configuracion */
/* ------------------------------------------------------------------ */
/**
 * ESTA GUARDIA EXISTE PARA APAGAR UN ATAJO QUE YO MISMO ENCENDI.
 *
 * `src/identidad/sesion.tsx` apaga la verificacion en dos pasos porque el
 * producto todavia no tiene pantalla para darla de alta, y sin ese apagado el
 * dueño quedaba encerrado afuera de su propio centro.
 *
 * El problema de los atajos con buena razon es que la razon se olvida y el
 * atajo se queda. Asi que se ata a algo que no se puede olvidar: en cuanto
 * exista `src/configuracion/` —el modulo que trae esa pantalla— esta guardia
 * revienta la publicacion y obliga a decidir. No se confia en la memoria de
 * nadie, ni en la mia.
 *
 * Y mientras siga encendido, exige que la razon este escrita al lado. Un
 * `segundoFactorApagado: true` pelon, sin explicacion, es exactamente lo que
 * dentro de un año nadie se atreve a quitar por miedo a romper algo.
 */
function guardiaSegundoFactorEsDeudaConFecha(): void {
  const MARCA = 'ES DEUDA, NO AJUSTE';
  const hayConfiguracion = archivosDe(join(RAIZ, 'src', 'configuracion')).length > 0;

  for (const archivo of FUENTE) {
    const crudo = readFileSync(archivo, 'utf8');
    if (!/segundoFactorApagado\s*:\s*true/.test(sinComentarios(crudo))) continue;

    if (hayConfiguracion) {
      fallar(archivo, 'sigue apagando la verificacion en dos pasos',
        'Ya existe src/configuracion/, que es donde vive la pantalla para dar de alta el segundo ' +
        'factor. La razon por la que se apago —que no habia forma de completarlo— ya no aplica: ' +
        'quita `segundoFactorApagado` y deja que la base se lo exija a dueño y administrador.');
    }

    if (!crudo.includes(MARCA)) {
      fallar(archivo, 'apaga la verificacion en dos pasos sin decir por que',
        `Escribe al lado el comentario con "${MARCA}", que paso en produccion y cuando se quita. ` +
        'Un apagado de seguridad sin explicacion es el que nadie se atreve a tocar despues.');
    }
  }
}

/* ------------------------------------------------------------------ */
/* 9 — El candado apunta a la MISMA base que el package.json           */
/* ------------------------------------------------------------------ */
/**
 * ESTA CASI SE PUBLICA, Y HABRIA SIDO INVISIBLE.
 *
 * Lo que paso: `package.json` se actualizo a la base v1.0.3, pero el
 * `package-lock.json` que quedo en el repositorio seguia apuntando a v1.0.1.
 * npm le hace caso AL CANDADO: leyo, dijo "todo al dia" en menos de medio
 * segundo, y no bajo nada nuevo.
 *
 * Lo grave no es que falle. Es que NO falla. La compilacion sale en verde, el
 * sitio se publica, y adentro corre una version vieja de la base — sin los
 * arreglos que uno cree que acaba de subir. En este caso se habria ido sin el
 * arreglo del bloqueo de sesion, que deja la pantalla cargando para siempre
 * sin un solo error en la consola. Se hubiera buscado el problema en el codigo
 * nuevo durante horas.
 *
 * La comprobacion es tonta a proposito: el candado escribe el mismo texto que
 * pide el package.json. Si los dos textos no son identicos, el candado esta
 * viejo. No hace falta red ni resolver etiquetas.
 */
function guardiaCandadoAlDiaConLaBase(): void {
  const rutaPaquete = join(RAIZ, 'package.json');
  const rutaCandado = join(RAIZ, 'package-lock.json');

  let candado: { packages?: Record<string, { dependencies?: Record<string, string> }> };
  try {
    candado = JSON.parse(readFileSync(rutaCandado, 'utf8')) as typeof candado;
  } catch {
    fallar(rutaCandado, 'no existe o no se puede leer',
      'Sin candado, cada compilacion resuelve la base por su cuenta y dos despliegues del mismo ' +
      'commit pueden traer codigo distinto. Corre npm install y sube el package-lock.json.');
    return;
  }

  const paquete = JSON.parse(readFileSync(rutaPaquete, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const pedido = paquete.dependencies?.['@neron/base'];
  const trabado = candado.packages?.['']?.dependencies?.['@neron/base'];

  if (!pedido) return;
  if (pedido !== trabado) {
    fallar(rutaCandado, `pide "${String(trabado)}" pero el package.json pide "${pedido}"`,
      'npm le hace caso al candado, no al package.json: se compilaria una version vieja de la ' +
      'base sin que nada falle ni avise. Corre npm install (no npm ci) y sube el package-lock.json ' +
      'corregido junto con el cambio.');
  }
}

/* ------------------------------------------------------------------ */
/* 10 — Las capacidades del producto llegan hasta el portero           */
/* ------------------------------------------------------------------ */
/**
 * POR QUE EXISTE, Y CUANTO COSTO NO TENERLA.
 *
 * El rol de dueña se guarda con la lista de permisos vacia: es la proteccion
 * anti-bloqueo y la base de datos la entiende —`app.tiene_permiso` devuelve
 * true en cuanto ve el rol `dueno`, sin mirar nada mas—. El navegador no lo
 * puede deducir: para la base, `gestionarAgenda` es un texto sin significado.
 * Por eso hay que DECLARARLE al portero las capacidades del producto.
 *
 * Sin esa linea, la dueña entra a su propio sistema y el menu le muestra tres
 * opciones de doce. No hay error, no hay excepcion, no hay nada en la consola:
 * cada modulo pregunta por su permiso, le contestan que no, y desaparece. Se ve
 * exactamente igual que un sistema al que le falta la mitad del codigo.
 *
 * Y es un olvido facilisimo de repetir: basta con reescribir `sesion.tsx` sin
 * mirar el registro, o mover la creacion del portero a otro archivo. Por eso la
 * guardia tambien avisa si `crearPortero` ya no vive aqui: una guardia que deja
 * de encontrar lo que vigila y se queda callada es peor que no tenerla.
 */
function guardiaCapacidadesLleganAlPortero(): void {
  const registro = readFileSync(join(RAIZ, 'src', 'modulos', 'registro.ts'), 'utf8');

  if (!/CAPACIDADES_DE_TERAPIAS\s*=\s*\[/.test(registro)) {
    fallar('src/modulos/registro.ts', 'no se encontro CAPACIDADES_DE_TERAPIAS',
      'Es la lista de la que salen los permisos del producto. Si cambia de nombre o de forma, ' +
      'esta guardia deja de vigilar sin avisar, que es peor que no tenerla.');
    return;
  }

  /**
   * Se comprueba que la LISTA ENTERA llegue al portero, no capacidad por
   * capacidad. No todas cuelgan de un modulo del menu: `verExpediente` decide
   * si dentro de Clientes se ven las notas clinicas, y no es un modulo aparte.
   * Vigilar una por una obligaria a inventarle un modulo a cada permiso.
   */
  const archivo = join(RAIZ, 'src', 'identidad', 'sesion.tsx');
  const sesion = sinComentarios(readFileSync(archivo, 'utf8'));

  if (!/crearPortero\s*\(/.test(sesion)) {
    fallar('src/identidad/sesion.tsx', 'aqui ya no se crea el portero',
      'Esta guardia vigila la llamada a crearPortero. Si se mudo de archivo, hay que mudar la ' +
      'guardia con ella o deja de proteger nada.');
    return;
  }
  if (!/capacidadesDelProducto:\s*CAPACIDADES_DE_TERAPIAS/.test(sesion)) {
    fallar('src/identidad/sesion.tsx', 'el portero no recibe capacidadesDelProducto',
      'Sin esa linea la dueña entra a un sistema sin menu: cada modulo pregunta por su permiso, ' +
      'le contestan que no, y desaparece. Abre bien, no falla, y se ve vacio. Ya paso una vez, ' +
      'con el sistema publicado. Va: capacidadesDelProducto: CAPACIDADES_DE_TERAPIAS.');
  }
}

/* ------------------------------------------------------------------ */
/* 11 — Toda operacion refresca el tablero de Inicio                   */
/* ------------------------------------------------------------------ */
/**
 * EL FALLO QUE ESTA GUARDIA IMPIDE NO REVIENTA NADA, Y ESO ES LO PEOR.
 *
 * Inicio y el buscador global LEEN de todos los modulos: citas, ventas,
 * productos, cursos, gastos, recordatorios, pacientes. Sus llaves de cache
 * empiezan todas con `inicio:`, asi que un solo `invalidar('inicio')` los
 * refresca.
 *
 * Si una operacion nueva se olvida de declararlo, no falla la compilacion, no
 * falla ninguna prueba y no queda nada en la consola: simplemente, quien
 * agenda una cita y vuelve a Inicio ve el numero de antes. La pantalla se ve
 * perfectamente normal — y esa es justo la clase de error que se descubre
 * cuando alguien ya tomo una decision con el numero viejo.
 *
 * Se exige la lista SIEMPRE, aunque quien la escriba crea que su operacion no
 * toca el tablero. Dar de alta un paciente no cambia ninguna cifra, pero si
 * tiene que aparecer en el buscador; y adivinar de antemano que consulta
 * depende de que es exactamente lo que sale mal. Refrescar de mas cuesta una
 * consulta que ni siquiera se hace si nadie esta viendo Inicio.
 */
function guardiaTodaOperacionRefrescaInicio(): void {
  /**
   * Tambien vale una LISTA CON NOMBRE, si esa lista de verdad lo declara.
   *
   * `LO_QUE_TOCA_UN_CLIENTE` es mas legible que repetir tres textos en cada
   * llamada, y ademas evita el error de escribir mal uno. Pero la guardia no
   * se lo cree: busca su definicion y comprueba que ahi dentro este el
   * prefijo. Una guardia que acepta un nombre sin mirar que hay adentro deja
   * de proteger en cuanto alguien cambia la lista.
   */
  const listasBuenas = new Set<string>();
  for (const archivo of FUENTE) {
    const limpio = sinComentarios(readFileSync(archivo, 'utf8'));
    for (const m of limpio.matchAll(/export const ([A-Z_][A-Z0-9_]*)\s*=\s*\[([^\]]*)\]/g)) {
      if (/PREFIJO_DE_INICIO|'inicio'|"inicio"/.test(m[2] ?? '')) listasBuenas.add(m[1]!);
    }
  }
  const nombrada = listasBuenas.size > 0 ? [...listasBuenas].join('|') : '(?!)';
  const acepta = new RegExp(`PREFIJO_DE_INICIO|'inicio'|"inicio"|${nombrada}`);

  for (const archivo of FUENTE) {
    const limpio = sinComentarios(readFileSync(archivo, 'utf8'));
    let desde = 0;

    for (;;) {
      const inicio = limpio.indexOf('useOperacion(', desde);
      if (inicio < 0) break;

      // Se avanza contando parentesis hasta cerrar la llamada. Buscar el
      // primer ')' fallaria con `useOperacion((a) => ...)`, que es la forma
      // mas comun de escribirla.
      let nivel = 0;
      let fin = inicio + 'useOperacion('.length - 1;
      for (; fin < limpio.length; fin += 1) {
        const c = limpio[fin];
        if (c === '(') nivel += 1;
        else if (c === ')') {
          nivel -= 1;
          if (nivel === 0) break;
        }
      }

      const llamada = limpio.slice(inicio, fin + 1);
      desde = fin + 1;

      if (!acepta.test(llamada)) {
        fallar(archivo, 'una operacion no refresca el tablero de Inicio',
          'Inicio y el buscador leen de todos los modulos y su cache cuelga del prefijo "inicio". ' +
          'Sin declararlo, guardar algo aqui deja el tablero mostrando el numero de antes — sin ' +
          'error, sin aviso y con cara de estar al dia. Agrega PREFIJO_DE_INICIO (de ' +
          'src/datos/tablero.ts) a la lista de invalidacion de esa useOperacion.');
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 12 — La vitrina no se cuela al producto                             */
/* ------------------------------------------------------------------ */
/**
 * `pruebas-visuales/` levanta la aplicacion con un SERVIDOR FALSO para poder
 * fotografiarla y compararla contra el diseño. Es utileria de revision, como
 * los datos de una prueba.
 *
 * Si `src` importara cualquier cosa de ahi, esa utileria viajaria al navegador
 * de un centro de verdad: la pantalla ensañaria pacientes inventados y cifras
 * que no existen, y —lo peor— se veria perfectamente normal. Es exactamente el
 * fallo que la regla numero uno del producto existe para evitar.
 *
 * `tsconfig.build.json` ya solo compila `src`, asi que hoy no cabria. Esta
 * guardia esta para el dia que alguien agregue la carpeta a esa lista sin
 * pensar en esto.
 */
function guardiaLaVitrinaNoSeCuela(): void {
  for (const archivo of FUENTE) {
    const limpio = sinComentarios(readFileSync(archivo, 'utf8'));
    if (/pruebas-visuales/.test(limpio)) {
      fallar(archivo, 'importa algo de pruebas-visuales/',
        'Esa carpeta trae un servidor falso con datos inventados, para poder mirar la pantalla. ' +
        'Si viaja al producto, un centro de verdad ve pacientes que no existen — y se ve normal, ' +
        'que es lo que lo hace grave.');
    }
  }

  const paquete = JSON.parse(readFileSync(join(RAIZ, 'tsconfig.build.json'), 'utf8')) as {
    include?: string[];
  };
  if ((paquete.include ?? []).some((x) => x.includes('pruebas-visuales'))) {
    fallar('tsconfig.build.json', 'compila pruebas-visuales/ dentro del producto',
      'Lo que se publica sale de `src` y de nada mas. La vitrina es utileria de revision: ' +
      'quitala de la lista.');
  }
}

/* ------------------------------------------------------------------ */
/* 13 — Ninguna animacion se queda en efecto al terminar               */
/* ------------------------------------------------------------------ */
/**
 * ESTA GUARDIA EXISTE PORQUE EL FALLO YA SALIO A PRODUCCION, y porque la causa
 * estaba a tres pantallas de distancia del sintoma.
 *
 * QUE SE VEIA: al abrir "Categorias de cursos", el velo del modal salia como
 * una plancha negra pegada en medio de la pantalla. No tapaba la barra lateral
 * ni la barra de arriba, y lo de atras desaparecia. Se veia roto.
 *
 * QUE PASABA: `animation-fill-mode: both` deja la animacion EN EFECTO para
 * siempre despues de terminar. Una animacion de `transform` en efecto hace que
 * su elemento compute `transform: matrix(1, 0, 0, 1, 0, 0)` —la identidad— en
 * vez de `none`. Y un transform que no es `none` convierte al elemento en
 * BLOQUE CONTENEDOR de todo lo que lleve `position: fixed` adentro.
 *
 * Cada modulo lleva `mv-pantalla`, asi que cada modulo era una jaula: el velo
 * pedia `inset: 0` para tapar la ventana y se quedaba encerrado en la caja del
 * modulo. Medía 1228x683 en vez de 1536x1024.
 *
 * POR QUE NO BASTA CON HABERLO ARREGLADO: el sintoma aparece en el modal y la
 * causa vive en la hoja de animaciones. Quien vuelva a escribir `both` —porque
 * es lo que se escribe por costumbre para que algo "se quede como quedo"— va a
 * romper TODO lo que flote, incluido lo que todavia no existe, y va a buscar el
 * problema en el componente equivocado. Por eso se revienta la publicacion aqui
 * y no se confia en que alguien se acuerde.
 *
 * `backwards` da lo unico que hacia falta: el estado inicial ANTES de arrancar,
 * que es lo que impide el parpadeo de los hijos escalonados durante su retraso.
 */
function guardiaSinAnimacionesQueSeQuedanEnEfecto(): void {
  const HOJAS = [
    join(RAIZ, 'src', 'estilo', 'movimiento.ts'),
    join(RAIZ, 'src', 'estilo', 'piezas.ts'),
    join(RAIZ, 'src', 'estilo', 'armadura.ts'),
    join(RAIZ, 'src', 'estilo', 'cimientos.ts'),
    join(RAIZ, 'src', 'estilos.ts'),
  ];

  for (const archivo of HOJAS) {
    let crudo: string;
    try { crudo = readFileSync(archivo, 'utf8'); } catch { continue; }
    const limpio = sinComentarios(crudo);

    // `both` y `forwards` dejan la animacion en efecto; los dos sirven igual
    // para encerrar un velo. Se buscan como palabra dentro de una declaracion
    // de animacion, no en cualquier parte del texto.
    for (const modo of ['both', 'forwards'] as const) {
      const suelto = new RegExp(`animation(?:-fill-mode)?\\s*:[^;]*\\b${modo}\\b`);
      if (suelto.test(limpio)) {
        fallar(archivo, `una animacion rellena con "${modo}"`,
          'Eso la deja EN EFECTO al terminar, y una animacion de transform en efecto computa la ' +
          'matriz identidad en vez de "none". Un transform que no es "none" encierra dentro del ' +
          'elemento todo lo que lleve "position: fixed": el velo de cualquier modal deja de tapar ' +
          'la pantalla y sale como una plancha oscura en medio. Ya paso, publicado, en el modal de ' +
          'Categorias. Usa "backwards" y deja que el estado final de la animacion sea el estado ' +
          'natural del elemento.');
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 14 — Lo que flota se viste una sola vez, para las ocho pantallas    */
/* ------------------------------------------------------------------ */
/**
 * El velo y el dialogo se visten en `piezas.ts`, sobre las clases de la base,
 * porque TODO lo que se abre en el producto pasa por el `Modal` de la base.
 *
 * Si un modulo se pusiera a vestir su propio velo, volveriamos al error mas
 * caro del proyecto —ocho piezas parecidas y ninguna igual— pero en lo que mas
 * se nota: un modal que se ve distinto segun de que pantalla salio.
 */
function guardiaElVeloSeVisteUnaSolaVez(): void {
  const piezas = readFileSync(join(RAIZ, 'src', 'estilo', 'piezas.ts'), 'utf8');
  if (!/\.neron-velo\s*\{/.test(piezas)) {
    fallar('src/estilo/piezas.ts', 'ya no viste el velo de lo que flota encima',
      'Es donde se le pone al velo el tono suave del Centro y el desenfoque de lo de atras. Sin ' +
      'esa regla vuelve el velo de la base, que tapa al 45% y deja la pantalla como una plancha ' +
      'negra. Si se mudo de archivo, muda esta guardia con el.');
  }

  for (const archivo of FUENTE) {
    if (archivo.endsWith(join('estilo', 'piezas.ts'))) continue;
    const limpio = sinComentarios(readFileSync(archivo, 'utf8'));
    if (/\.neron-velo\s*\{/.test(limpio)) {
      fallar(archivo, 'viste el velo por su cuenta',
        'Lo que flota encima se viste UNA vez, en src/estilo/piezas.ts, para las ocho pantallas. ' +
        'Un velo por modulo es el error de las ocho tarjetas distintas, pero en lo que mas se nota: ' +
        'un modal que se ve distinto segun de que pantalla salio.');
    }
  }
}

/* ------------------------------------------------------------------ */
/* 15 — El Modal entra por el envoltorio, nunca directo de la base     */
/* ------------------------------------------------------------------ */
/**
 * EL FALLO QUE ESTA GUARDIA IMPIDE ES EL PEOR DE TODOS LOS QUE HA HABIDO:
 * no revienta, no sale en la consola, y hace imposible capturar.
 *
 * QUE SE SENTIA: estabas escribiendo el telefono de un cliente nuevo y el
 * cursor SALTABA SOLO al campo de arriba. Sin tocar nada. Las letras se iban al
 * campo equivocado. Pasaba en todos los campos y en todos los formularios.
 *
 * QUE PASABA: el `Modal` de la base enfoca su primer control al abrirse
 * —correcto: quien navega con teclado tiene que entrar al dialogo— pero ese
 * efecto depende de `onCerrar`:
 *
 *     const cerrarSiSePuede = useCallback(..., [bloqueado, onCerrar]);
 *     useEffect(() => { ...enfocarAdentro()... }, [abierto, cerrarSiSePuede]);
 *
 * Y las pantallas le pasan una flecha escrita en linea —`onCerrar={() =>
 * setFicha(null)}`—, que es una funcion NUEVA en cada render del padre. Asi que
 * cada repintado del padre, por cualquier motivo, volvia a enfocar el primer
 * campo con la persona escribiendo en el tercero.
 *
 * POR QUE UNA GUARDIA Y NO SOLO EL ARREGLO: `src/ui/modal.tsx` le entrega a la
 * base una funcion de identidad estable, asi que el efecto solo depende de
 * `abierto`. Pero el arreglo vive en el envoltorio, y la pantalla numero trece
 * la va a escribir alguien que importa `Modal` de donde vienen `Boton` y
 * `Campo` —que es lo natural— y el fallo vuelve solo en esa pantalla. Nadie lo
 * atribuye al import.
 *
 * `Confirmacion` NO tiene el fallo (su efecto depende solo de `[abierto]`) y
 * por eso puede seguir viniendo de la base.
 */
function guardiaElModalEntraPorElEnvoltorio(): void {
  const ENVOLTORIO = join('ui', 'modal.tsx');

  for (const archivo of FUENTE) {
    if (archivo.endsWith(ENVOLTORIO)) continue; // es el unico que puede
    const limpio = sinComentarios(readFileSync(archivo, 'utf8'));

    for (const m of limpio.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@neron\/base\/ui'/g)) {
      const nombres = (m[1] ?? '').split(',').map((n) => n.trim().split(/\s+as\s+/)[0]!.trim());
      if (!nombres.includes('Modal')) continue;

      fallar(archivo, 'importa `Modal` directo de @neron/base/ui',
        'El Modal del producto es src/ui/modal.tsx, que le amarra el foco. El de la base vuelve a ' +
        'enfocar su primer campo CADA VEZ que se repinta la pantalla de atras, porque su efecto ' +
        'depende de `onCerrar` y todas las pantallas le pasan una flecha en linea, que es una ' +
        'funcion nueva en cada render. Se siente asi: escribes en el tercer campo y el cursor salta ' +
        'solo al primero. No falla, no avisa y no sale en la consola — solo hace imposible capturar. ' +
        "Cambia el import a '../ui/modal.js' y deja a `Confirmacion` en la base, que si esta bien.");
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
  { nombre: 'el segundo factor apagado es deuda con fecha', correr: guardiaSegundoFactorEsDeudaConFecha },
  { nombre: 'el candado apunta a la misma base que el package.json', correr: guardiaCandadoAlDiaConLaBase },
  { nombre: 'las capacidades del producto llegan al portero', correr: guardiaCapacidadesLleganAlPortero },
  { nombre: 'toda operacion refresca el tablero de Inicio', correr: guardiaTodaOperacionRefrescaInicio },
  { nombre: 'la vitrina no se cuela al producto', correr: guardiaLaVitrinaNoSeCuela },
  {
    nombre: 'ninguna animacion se queda en efecto (o encierra los velos)',
    correr: guardiaSinAnimacionesQueSeQuedanEnEfecto,
  },
  { nombre: 'lo que flota se viste una sola vez', correr: guardiaElVeloSeVisteUnaSolaVez },
  {
    nombre: 'el Modal entra por el envoltorio que amarra el foco',
    correr: guardiaElModalEntraPorElEnvoltorio,
  },
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
