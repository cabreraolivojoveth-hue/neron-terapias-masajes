# Cómo trabajamos en Neron Terapias

Este archivo es el acuerdo de trabajo. No es documentación del producto —para eso
están `BLOQUE-0-ARQUITECTURA.md` y `README.md`— sino **cómo se recibe una orden y
qué se hace con ella**, sin tener que volver a explicarlo en cada chat.

---

## 1. El ciclo: mandas, se hace, se sube, te aviso

No se pregunta antes de ejecutar. Tú mandas la foto y la descripción, y lo que
regresa es el trabajo hecho y publicado, con un resumen corto de qué se agregó y
qué pasó. Nada de listas de opciones ni de "¿quieres que…?".

**Se empuja directo a `main`.** Es lo que dispara el despliegue de producción en
Vercel, el de la dirección de siempre. Una rama aparte solo genera una URL de
Preview distinta y obliga a mezclar un PR a mano cada vez — eso rompe el "lo veo
en dos minutos".

Antes de empujar corre la orden única. **Verde o no se publica:**

```bash
npm run consistencia
```

Tipos → fronteras → pruebas → compilación → ataques. Si algo se cae, se busca la
causa raíz, se corrige y se corre **toda** la batería otra vez — nunca solo el
paso que falló. Un paso que pasa solo no dice nada de los que van después.

## 2. Si la base cambia, el SQL llega por el chat

Cuando un bloque necesita algo nuevo de la base de datos —una columna, una
función, un índice— no basta con empujar el código: Vercel publica el
navegador, no la base.

Así que **cada vez que cambie el esquema se regenera `ACTUALIZAR-BASE.sql` y se
manda por el chat**, listo para pegar en Supabase → SQL Editor → Run. Sin ese
paso el sitio se publica y las pantallas nuevas salen con un error que no dice
nada útil.

Ese archivo es **solo lo nuevo**, y es seguro correrlo las veces que haga
falta: no borra datos, no reescribe filas y todo va con `if not exists` o
`create or replace`. El archivo completo con todas las explicaciones sigue
siendo `INSTALAR-EN-TERAPIAS.sql` — pegar dos mil líneas cada vez no es
razonable.

## 3. La foto es la ley del diseño

Cada módulo llega como **foto + descripción detallada**. La foto no es
inspiración: es la especificación. Se replica **exacta** — la misma distribución,
las mismas columnas, los mismos botones, los mismos textos, el mismo orden, los
mismos estados. Si algo de la foto no se puede reproducir tal cual, se dice
claramente en el resumen en lugar de aproximarlo en silencio.

**Y se replica MIRÁNDOLA, no recordándola.** Esa es la regla que faltaba y que
costó rehacer ocho pantallas: se puede tener los tipos, las guardias y las mil
doscientas pruebas en verde y entregar una pantalla que no se parece a la foto,
porque **nada de eso mira**. Cómo se mira está en el §8.

## 4. Los datos de la foto NUNCA se copian al código

La foto viene llena para que se vea **cómo debe lucir cuando alguien ya la usó**:
qué tan anchas quedan las columnas, dónde cae cada dato, cómo se ve una fila
larga. Esos nombres y esas cifras son referencia visual y **se quedan fuera del
código**.

El módulo se entrega **vacío**, con su estado de "todavía no hay nada" bien
resuelto. Los números en cero tienen que estar en cero **porque no hay registros**,
no porque falte código.

Esto no es preferencia: `guardias/fronteras.ts` revienta la publicación si se cuela
un dato de ejemplo. La guardia y esta regla dicen lo mismo.

## 4.b Caja y Ventas son UN módulo: el mostrador

Eran dos entradas del menú, y quien las usa es **una persona parada en el
mostrador todo el día**. Cobrar estaba en Ventas y el cajón en Caja, así que
atender a alguien y luego cuadrar el efectivo obligaba a saltar de pantalla en
pantalla para hacer un solo trabajo. Ahora es **`caja`**, con seis pestañas:

`Cobrar · Ventas del día · Historial · Cotizaciones · El cajón · Corte de caja`

- **Cobrar es la que abre.** Es donde se pasa el día.
- Las cuatro primeras piden `cobrar`; las dos últimas `verFinanzas`. **Se filtran,
  no se apagan**: quien solo cobra no ve el cajón ni el corte.
- Por eso el módulo declara **dos capacidades** (`['cobrar', 'verFinanzas']`) y
  entra quien pueda cualquiera de las dos. Con una sola, la recepcionista se
  quedaba sin poder cobrar.
- `mostrador.tsx` **no reimplementa nada**: monta `PuntoDeVenta` y `Cajon` y les
  pone un encabezado y una barra únicos. Los dos aceptan `sinEncabezado`.
- **La llave del cuerpo es quién pinta, no la pestaña.** Con la pestaña como
  llave, pasar a "Ventas del día" y volver tiraba el carrito a medio armar.
- **Lo que NO se unió es el corte**, y no se podía: Ventas sabe cuánto se cobró y
  el cajón cuánto hay físicamente. Compararlos es lo único que detecta que falta
  dinero.

**Los recados conservan su espacio de nombres:** `ventas:` lo consume el punto de
venta y `caja:` el cajón. El nombre dice **quién lo consume**, no de qué menú
salió — y por eso unir los módulos no obligó a tocar ni un lector. Quien navegue
aquí va a `caja` con el recado del consumidor: `ir('caja', { intencion: 'ventas:nueva' })`.

**Y el recado se ESPIA, no se consume** (`espiarIntencion`). El Mostrador necesita
la acción para escoger la pestaña y el hijo el recado entero. React monta de abajo
hacia arriba, así que si el padre lo consumiera, el hijo lo leería vacío: "Nueva
venta" desde un expediente abriría la pestaña correcta **con el carrito en
blanco**, sin fallar y sin avisar.

## 4.c El expediente clínico manda

En un centro de terapias, **lo que alguien tiene no es «información adicional»**:
es lo primero que hay que saber. Dar un descontracturante a quien trae una hernia
reciente, usar lavanda con quien es alérgico o presión firme a quien toma
anticoagulantes son daños de verdad, y ninguno se ve en la cara.

- `cliente` guarda **padecimientos, alergias, medicamentos, cirugías, embarazo,
  contraindicaciones, presión preferida y aromas a evitar**, más contacto de
  emergencia, dirección, ocupación y cómo llegó.
- Todo es **texto libre, no listas cerradas**: un catálogo de padecimientos hay
  que mantenerlo, y el día que llegue uno que no está se captura en el campo
  equivocado o no se captura.
- **Las contraindicaciones y las alergias se enseñan ARRIBA y fuera de las
  pestañas** (`AvisoClinico`). Escondidas en una pestaña, quien va a dar la sesión
  tendría que acordarse de buscarlas — y el día que no se acuerde es el que
  importaba. El aviso solo aparece si hay algo que avisar: una franja permanente
  y casi siempre vacía se deja de mirar en una semana.
- **Las notas de cada sesión son de la CITA**, no del cliente: se escriben al
  completarla y el expediente las junta en su pestaña, de la más reciente a la más
  vieja. Es lo que deja llegar a la cuarta sesión sabiendo qué se hizo en las tres
  anteriores.
- **Editar a alguien desde la lista parte de `DATOS_VACIOS` y solo copia lo que
  de verdad viene.** Un renglón de la lista trae cuatro campos y el expediente
  veinte: escribirlos a mano hacía que editar desde la lista **borrara la ficha
  clínica** mandando cadenas vacías.

## 4.d Nada de controles genéricos

Si un control se ve como HTML sin vestir, está mal — y la causa casi siempre es
que alguien lo escribió a mano en vez de usar la pieza compartida:

- **Menú de tres puntitos** → `MenuDeAcciones` (`src/ui/menu.tsx`), vestido con
  `pz-menu`. Hubo tres copias, y las tres se quedaron sin estilo el día que se
  limpió la hoja del módulo donde vivían sus clases.
- **Sección que se pliega** → `Plegable` (`src/ui/plegable.tsx`), con `pz-plegable`.
  Sustituye a un `button` pelón que decía «+ Información adicional».
- **Selectores** → se visten por etiqueta (`select`) en `piezas.ts`, no por clase:
  así no depende de que veintisiete sitios se acuerden de ponerla, y el próximo
  sale bien sin que nadie haga nada.
- **Un panel flotante dentro de una tabla va `position: fixed`**. El marco de la
  tabla lleva `overflow-x: auto`, y un contenedor que desplaza **recorta en los
  dos ejes** aunque solo se le pida uno: en el último renglón, la última opción
  del menú salía cortada — y la última opción es la de eliminar.

## 5. Las conexiones entre módulos son parte del encargo

Un módulo suelto no sirve. Agenda necesita Clientes, Ventas necesita Productos y
Servicios, Caja nace de Ventas y Gastos. Con cada módulo viene **con qué se
conecta y cómo**, y eso se implementa igual de en serio que la pantalla.

Las reglas que no se rompen al conectar:

- **Una sola fuente de verdad por entidad.** La tabla dueña está en
  `BLOQUE-0-ARQUITECTURA.md` §3.
- **Los nombres se resuelven al leer, jamás se copian.** Una cita guarda
  `cliente_id`, nunca el nombre del paciente. El día que cambie un apellido, todo
  el sistema lo muestra al día sin tocar nada.
- **Toda relación entre tablas va por llave foránea compuesta**
  `(negocio_id, x_id)` contra `(negocio_id, id)`. Una llave simple deja crear una
  cita apuntando al paciente de otro centro: las llaves foráneas no obedecen las
  reglas de fila. Está contado completo en `BLOQUE-0-ARQUITECTURA.md` §4.
- **Un módulo nuevo se declara en `src/modulos/registro.ts`.** De ahí salen a la
  vez el menú, las rutas y los permisos. Si se olvida ahí, no existe en ninguno
  de los tres — que es mucho mejor que existir a medias.

Si al leer el encargo falta una conexión, o hay una mejor forma de amarrar dos
módulos, **se dice en el resumen** — pero después de haber entregado lo pedido, no
en lugar de entregarlo.

## 6. Reglas del código que no se discuten

- Todo en español: nombres, archivos, comentarios.
- Los comentarios dicen **por qué** existe algo y qué se rompió antes. No repiten
  lo que el código ya dice.
- Cero datos de ejemplo. Ni un nombre, ni una cifra, ni una cita inventada.
- Toda tabla nueva lleva reglas de acceso por fila encendidas y forzadas, y su
  propio ataque escrito.
- Nada de llaves ni secretos en el repositorio. Van en `.env`, que `.gitignore`
  excluye, y en las variables de entorno de Vercel.

## 7. Trampas ya pagadas — no volver a caer

- **Redeploy en Vercel recompila el MISMO commit** que estás viendo. Para publicar
  código nuevo hay que empujar un commit y buscar ese despliegue en la lista.
  Para que tome VARIABLES nuevas sin cambiar código, en cambio, basta con
  Redeploy **desmarcando "Use existing Build Cache"**: sin cache, Vite vuelve a
  incrustar los valores. Probado el 13/08/2026 en la migracion.
- **Supabase del producto:** `hgypobbanvkwnqmepqim.supabase.co`, proyecto
  `neron-terapias`, organizacion `Neron Terapias` (plan Free). La cuenta que lo
  posee es **neroncenterserv@gmail.com** — apuntala, que perder el acceso a la
  cuenta es justo lo que costo el proyecto anterior.
- **El correo para ENTRAR a la aplicacion es otro:** `cabreraolivojoveth@gmail.com`.
  Vive en Authentication -> Users del proyecto, y no tiene nada que ver con el
  correo dueño de la cuenta de Supabase.
- **Proyecto viejo, perdido:** `cxldnxdfhxipckvduzpk` — quedo en una cuenta sin
  acceso. Sigue vivo pero es inalcanzable; no volver a apuntar nada ahi. Lo que
  tenia rescatado esta en el volcado del 13/08/2026 (solo datos de ensayo).
  El proyecto `zykqzykjlrjqsbrwpucc` es solo para probar la base — no se usa.
- **El limite de 2 proyectos gratis de Supabase es POR CUENTA, no por
  organizacion.** Crear una organizacion nueva no lo esquiva: hay que pausar,
  borrar o pagar. Por eso el producto vive en una cuenta aparte.
- **La base se instala por `git+https://`**, no por `github:usuario/repo`: npm
  resuelve eso a SSH y Vercel no tiene llave.
- **`onAuthStateChange` de Supabase avisa sosteniendo un candado interno.** Llamar
  a otra función de autenticación desde adentro cuelga la pantalla para siempre,
  sin error y sin nada en la consola.
- **`src/estilos.ts` y los cuatro `src/estilo/*.ts` son literales de plantilla.**
  Un acento grave dentro —hasta en un comentario— cierra la cadena y el archivo
  deja de compilar. Para citar una clase en un comentario se usan comillas
  dobles.
- **Postgres NO valida el cuerpo de una función `plpgsql` al crearla**, solo el
  de las `sql`. Por eso los ataques aplican el instalador de verdad: es la única
  forma de que un error de tipeo dentro de una función salga antes de producción.
- **`animation-fill-mode: both` encierra todo lo que flota.** Una animación con
  `both` se queda **en efecto** para siempre al terminar, y una animación de
  `transform` en efecto hace que su elemento compute la matriz identidad en vez
  de `none`. Un transform que no es `none` convierte al elemento en **bloque
  contenedor** de todo lo que lleve `position: fixed`. Como cada módulo lleva
  `mv-pantalla`, cada módulo era una jaula: el velo del modal de «Categorías de
  cursos» medía 1228×683 en vez de 1536×1024 y salió a producción como una
  plancha oscura pegada en medio de la pantalla, sin tapar la barra lateral. El
  relleno es **`backwards`** y el estado final de cada animación tiene que ser el
  estado natural del elemento. Lo vigilan la guardia 13, `pruebas/movimiento.test.ts`
  y `npm run velos`.
- **Lo que flota se viste UNA vez**, en `piezas.ts`, sobre las clases del modal
  de la base (`.neron-velo`, `[role='dialog']`) — porque todo lo que se abre en
  el producto pasa por ahí. Un velo por módulo es el error de las ocho tarjetas
  distintas, pero en lo que más se nota. La vigila la guardia 14.

---

## 8. Cómo se mira la pantalla

Los tipos, las guardias y las pruebas **no miran**. Todo puede estar en verde y
la pantalla no parecerse a la foto. Por eso existen tres herramientas, y usarlas
no es opcional cuando se toca lo visual.

```bash
npm run capturas                    # los 8 módulos, 1536x1024 (el tamaño de las fotos)
npm run capturas -- ventas          # solo uno
npm run capturas -- ventas --completa    # la pantalla entera, no solo lo que se ve
npm run capturas -- ventas --ancho=430   # el celular
npm run capturas -- clientes --toca=".pz-renglon"   # tocando algo antes de disparar
```

**`--toca` no es un extra.** Media pantalla de este sistema solo existe *después*
de escoger algo: el expediente de Clientes, la ficha de un servicio, el panel de
una cita, cualquier modal. Sin tocar, las fotos retratan siempre el estado vacío
y lo que se acabó de construir se publica sin haberlo visto nunca.

Y lo que se abre encima se comprueba solo:

```bash
npm run velos                       # abre todo lo que se abre, en los 8, y lo mide
```

Exige tres cosas de cada velo: que **tape la ventana entera** (si mide menos está
encerrado — ver §7), que **no tape de más** (más del 45% borra lo de atrás y el
diálogo queda flotando en un agujero negro) y que el **diálogo quepa** en la
pantalla. Va dentro de `npm run consistencia`, y es el único paso que mira. Si
se agrega algo que se abra, se agrega a la lista de `scripts/velos.ts`: un
chequeo que no revisa nada sale en verde y no dice nada.

Las fotos salen en `capturas/` —que `.gitignore` excluye— y **se abren y se
miran**, al lado de la foto de referencia. La comparación es de una y otra, no de
memoria.

Cuando una captura enseña que algo está mal pero no por qué, se **mide**:

```bash
npx tsx scripts/medir.ts ventas ".pz-tarjeta" ".pz-buscador"
```

Devuelve la caja de cada elemento, su padre, y las propiedades que casi siempre
son la causa. Un hueco de ciento setenta píxeles puede ser un `flex-basis` que en
una columna significa alto, o una tarjeta estirada por su vecina — y adivinar
cuál de las dos cuesta más que medirlo.

Debajo de las dos está la **vitrina** (`npm run vitrina`, puerto 5199): monta la
aplicación de verdad contra un Supabase de mentiras que vive en
`pruebas-visuales/servidor-de-mentiras.ts`. **Los datos de mentira viven SOLO
ahí** — la guardia 12 revienta la publicación si `src/` importa algo de esa
carpeta. Es lo que deja ver una pantalla llena sin meter ni un dato inventado al
producto.

El ciclo de un módulo es: mirar la foto → captura → comparar → corregir →
captura otra vez. Hasta que se parezcan. **No se dice que un módulo está listo
sin haber visto su última captura.**

## 9. El sistema de diseño: no se reinventa, se usa

El error más caro del proyecto fue dejar que cada módulo se escribiera su propia
tarjeta. Ocho tarjetas parecidas y ninguna igual — ni entre ellas ni al diseño.
Ahora hay **una** de cada cosa, y cambiarla cambia las ocho pantallas a la vez.

| Archivo | Prefijo | Qué vive ahí |
|---|---|---|
| `src/estilo/cimientos.ts` | `tt-` | los tokens del Centro y la tipografía de pantalla |
| `src/estilo/piezas.ts` | `pz-` | tarjeta, pastilla, cifra, renglón, tabla, buscador, vacío… |
| `src/estilo/armadura.ts` | `arm-` | la barra lateral y la barra superior |
| `src/estilo/movimiento.ts` | `mv-` | las animaciones, y su apagado |
| `src/estilos.ts` | `ini- vta- caja-…` | **solo** lo que de verdad es de un módulo |

Antes de escribir una regla nueva se busca si la pieza ya existe. Una tarjeta es
`pz-tarjeta`; un estado es `pz-pastilla`; una cifra de arriba es `pz-cifra`; una
fila de lista es `pz-renglon`; un título de tarjeta es `tt-tarjeta`. Si de verdad
falta una pieza, se agrega **a `piezas.ts`** —para las ocho pantallas— y no al
módulo que la pidió primero.

**Ni un color escrito a mano.** Todos salen de `src/marca.ts`, y la guardia 3 lo
vigila. La única excepción es el icono de la pestaña, que va incrustado en el
HTML porque el navegador lo pide antes de que exista una línea de JavaScript —
y por eso lleva su propia prueba de que sigue siendo el mismo verde.

### Dos trampas de maquetación que ya costaron caro

Las dos son invisibles leyendo el CSS: en las dos, el culpable es **dónde cae**
la regla, no la regla.

- **Crecer es cosa del sitio, no del elemento.** `flex: 1` dentro de una fila
  crece a lo ancho; dentro de una columna crece a lo **alto**. El título de
  tarjeta lo tenía y medía 162 píxeles de alto, hundiendo la lista hasta el fondo
  de su tarjeta.
- **Un `flex-basis` en píxeles mide el ALTO si el padre es una columna.** El
  buscador tenía `flex: 1 1 220px` y en Ventas era una caja de 220 píxeles de
  alto con un campo de 42 flotando en medio.

Las dos tienen prueba propia en `pruebas/cimientos.test.ts` y
`pruebas/piezas.test.ts`. Si vuelven, revientan.

## 10. Las animaciones

Están en `src/estilo/movimiento.ts` y se ponen con clases: `mv-pantalla` (la
pantalla entra), `mv-escalonado` (los hijos entran de 40 en 40 ms), `mv-panel`
(la ficha entra desde la derecha), `mv-cambia` (al cambiar de pestaña),
`mv-levanta` (se levanta al pasar el puntero), `mv-late` (el punto de aviso).

Tres reglas, y ninguna es decorativa:

1. **El movimiento explica de dónde viene algo.** Una ficha que entra desde la
   derecha dice "esto es el detalle de lo que tocaste".
2. **Rápido o no sirve.** Nada pasa de 240 ms, y las duraciones salen de los
   tokens — hay prueba de que no se escriben a mano, para que alargar algo
   obligue a mover el token y ahí se piense dos veces.
3. **Se apaga entero** para quien pide menos movimiento. Para algunas personas
   no es un detalle bonito, es mareo.

4. **El relleno es `backwards`, nunca `both` ni `forwards`**, y el último
   fotograma tiene que dejar el elemento en su estado natural. `backwards` da lo
   único que hace falta —estar en el estado inicial *antes* de arrancar, que es
   lo que impide el parpadeo de los hijos escalonados durante su retraso— y al
   terminar deja de aplicarse. Con `both` la animación se queda en efecto y
   encierra todo lo que flote: está contado en el §7. Si alguna vez hace falta
   que algo quede distinto de como empieza, eso se escribe en la **regla** del
   elemento y la animación arranca desde el otro lado (lo hace `mv-rayita`).

**Lo que no se anima, a propósito:** nada que cambie de sitio mientras alguien lo
está leyendo o apuntando con el dedo. Un renglón de tabla que se acomoda solo
mientras vas a tocarlo hace que toques el de al lado — y en Ventas eso es cobrar
otra cosa.

Para comprobar que de verdad corren no basta con leer el CSS: se abre la vitrina
y se cuentan las animaciones vivas a los 70 ms y a los 1.3 s. Si a los 1.3 s
queda alguna, algo se quedó moviéndose.
