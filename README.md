# Neron Terapias

**Centro Holístico · Bienestar & Terapias**

Sistema de gestión para un centro de terapias: agenda, expedientes, catálogo de
servicios, cursos, inventario, ventas, caja, gastos y recordatorios.

Construido sobre **[`@neron/base`](https://github.com/cabreraolivojoveth-hue/base-neronprogramas) v1.0.1**,
que ya resuelve identidad, permisos, seguridad por fila, guardado en la nube,
sistema de diseño, formularios, marco, tabla y tablero. Nada de eso se
reescribe aquí.

---

## Antes de tocar nada

| Documento | Para qué |
|---|---|
| `BLOQUE-0-ARQUITECTURA.md` | **La ley del producto.** Quién es dueño de qué y por qué. |
| `CONFIGURAR-CONEXION.md` | Cómo conectar tu proyecto de Supabase. Son cuatro pasos. |
| `INSTALAR-EN-TERAPIAS.sql` | Se pega una vez en el SQL Editor y deja la base entera lista. |
| `COMPROBAR-EN-TERAPIAS.sql` | Se pega después y dice BIEN o MAL en cada punto. |

---

## Qué hay hasta ahora

**Bloque 0 — Los cimientos del producto.** Doce tablas con sus reglas de acceso
por fila, las operaciones que la base de datos hace sola, y 55 ataques que las
comprueban.

| Tabla | Es dueña de |
|---|---|
| `cliente` | los pacientes: nombre, contacto, notas clínicas |
| `servicio` | el catálogo: nombre, duración, precio |
| `curso` | talleres: fechas, cupo, precio |
| `producto` | inventario: precio, costo, existencias, umbral bajo |
| `cita` | la agenda: fecha, hora, estado, a quién y con quién |
| `venta` + `venta_item` | qué se vendió y en cuánto |
| `pago` | con qué se pagó |
| `gasto` | lo que sale |
| `movimiento_caja` | **derivada** — nace de una venta, un gasto o un ajuste |
| `inscripcion` | quién va a qué curso |
| `recordatorio` | qué falta hacer, y de qué entidad salió |

**Una sola fuente de verdad por entidad.** Ninguna tabla guarda el nombre de un
paciente: lo referencian por id. Cambiar un apellido se refleja en agenda,
ventas y reportes sin tocar nada más.

### Lo que la base de datos hace sola

Cobrar una venta no es cambiar un campo. Es sumar el total desde los renglones,
bajar el inventario con bloqueo de renglón, meter el ingreso a la caja y marcar
la venta — **todo en una transacción**. Si eso viviera en el navegador,
cualquier interrupción dejaría el sistema partido.

Y dos disparadores que no hay que acordarse de llamar: un gasto crea su egreso
en caja solo, y la hora de fin de una cita se calcula desde la duración del
servicio.

### La caja es un libro

No hay forma de editar ni borrar un movimiento. Ni la dueña, ni el servidor.
Cancelar una venta no tacha su ingreso: **agrega el egreso contrario.**

### El agujero que encontraron los ataques

`cliente_id uuid references cliente(id)` parece suficiente y no lo es: **las
llaves foráneas no obedecen las reglas de fila.** Con eso, un centro podía crear
en su agenda una cita apuntando al paciente de otro centro — y ver su nombre.

La solución fue una llave foránea **compuesta**, `(negocio_id, cliente_id)`
contra `(negocio_id, id)`. Ahora es imposible por construcción escribir la fila
mala. Hay doce de esas llaves. Lo encontraron dos ataques escritos antes que el
código.

---

## Los ataques

```bash
npm run ataques
```

77 ataques contra las tablas del producto: leer el expediente de otro centro,
cobrarse una venta ajena, meter dinero a la caja sin operación detrás, marcar
una venta como cobrada sin bajar inventario. **Están bien cuando fallan el
intento.**

Y hay control negativo: `NERON_SIN_REGLAS=1 npm run ataques` corre el mismo
ensayo sin las reglas de fila. Ahí **17 de los 77 tienen éxito**. Eso es lo que
prueba que las pruebas sirven — un juego que también pasa con la seguridad
quitada no vale nada.

---

**Bloque 1 — El armazón.** La aplicación que se abre y funciona: sesión, marco, menú, rutas y
la identidad visual del Centro.

**El menú sale de los permisos reales, no de una lista fija.** La recepcionista sin permiso de
finanzas no ve Caja, ni Gastos, ni Reportes — y el grupo "Dinero" desaparece entero en vez de
quedarse vacío, porque un apartado vacío solo hace preguntarse qué falta.

**Nada está escrito a mano.** El nombre, el rol y el avatar salen del usuario autenticado. Los
módulos salen de un solo registro (`src/modulos/registro.ts`) del que se derivan a la vez el
menú, las rutas y los permisos — si un módulo se agrega ahí, aparece en los tres; si se olvida,
no existe en ninguno, que es mucho mejor que existir a medias.

**Los cinco estados de la sesión tienen su pantalla:** cargando (silueta, no un parpadeo del
formulario de entrada), sin sesión, falta segundo factor, sin centro asignado, y dentro. Desde
los dos estados atorados se puede salir — sin ese botón, quien cae ahí con la cuenta equivocada
queda atrapado.

**Los módulos que aún no llegan lo dicen.** Nombre, qué van a hacer, en qué bloque llegan, y una
línea explicando que están vacíos a propósito. Cero tablas de mentiras. Hay una guardia que
revienta la publicación si alguien pega un nombre de la captura de referencia.

**El verde del Centro pasó la prueba de contraste antes de entrar.** El primer candidato,
`#5a8a4a`, se cayó en 4.06:1 contra el blanco. Se bajó hasta `#4a7c3f` — 4.95:1, y se ve
prácticamente igual. Hay una prueba que lo vuelve a comprobar en cada publicación, en claro y
en oscuro.

**Bloque 4 — Agenda.** La fuente de verdad de las citas. Vistas de día, semana y mes;
navegación; panel de detalle; crear, editar, reagendar, confirmar, completar, cancelar y marcar
no asistió.

**El choque de horarios lo impide la base de datos, no el navegador.** La forma obvia —buscar si
hay otra cita encimada y, si no hay, guardar— tiene una ventana entre las dos operaciones: si la
recepcionista y la terapeuta guardan al mismo tiempo, las dos consultas ven el horario libre, las
dos guardan, y el paciente llega a una sala ocupada.

Aquí hay una **restricción de exclusión** de PostgreSQL: la base se niega a guardar dos citas cuyos
rangos de tiempo se toquen para el mismo profesional. Es atómica, no hay ventana. Está probado con
dos conexiones guardando el mismo horario a la vez: **una guarda, la otra es rechazada.**

Dos terapeutas sí atienden en paralelo — eso no es conflicto. Cancelar libera el horario de
inmediato, y la cita cancelada se queda en el historial.

**Los nombres se resuelven al leer, nunca se copian.** Hay una prueba que cambia el apellido de un
paciente y comprueba que la agenda entera —incluidas las citas de hace meses— lo muestra
actualizado.

**El historial y la próxima cita se calculan.** "Total de citas: 8" no existe guardado en ningún
lado. Cuenta las completadas, y separa canceladas de no-asistió porque para el negocio no son lo
mismo.

**Reagendar mueve la cita, no crea otra**, y queda firmado en la bitácora con el antes y el después.

**La línea de la hora actual se calcula** y solo aparece cuando estás viendo hoy y la hora cae
dentro del horario. Las citas encimadas se reparten en carriles para que ninguna tape a la otra.
Tocar un hueco abre "Nueva cita" con esa fecha y hora ya puestas.

**Crear un paciente desde una cita no borra lo escrito:** se guarda en Clientes —la tabla de
verdad— y al volver queda seleccionado, conservando servicio, fecha, hora y notas.

**Los filtros viven en la dirección, no en la memoria.** Tocar "2 pendientes" en Inicio abre la
Agenda de hoy ya filtrada, ese enlace se puede mandar por WhatsApp, y recargar no pierde el
filtro. Cuando hay uno puesto, el botón lo dice **con un número** — una agenda que muestra tres
citas de veinte sin avisar del filtro se lee como una agenda vacía.

**El selector de fecha es el del sistema operativo.** No es pereza: un menú propio es
exactamente el que puede quedar debajo de otra capa y no aparecer. El del sistema no tiene
z-index, funciona con teclado sin escribir una línea, y en celular abre la rueda nativa.

**La franja de horas se estira sola.** Se parte de un horario normal de consultorio y crece para
que quepa cualquier cita fuera de él. Sin eso, una cita de las 7 de la mañana se recorta contra
el borde y se lee como si empezara a las 8. Cuando llegue Configuración, el horario sale de ahí.

**Los recordatorios de una cita se mueven CON ella**, y dentro de la misma transacción de la
base. Reagendar al martes empuja sus recordatorios pendientes conservando el desfase —uno puesto
para el día anterior sigue quedando el día anterior—, y cancelarla los descarta. Hacerlo desde
el navegador tendría una ventana: si se cae la red en medio, la cita queda el martes y el
recordatorio sigue avisando del lunes.

**"Enviar mensaje" no manda nada desde Agenda:** abre Mensajes con el **id del paciente** y el
de la cita. Un teléfono copiado deja de ser el bueno en cuanto alguien lo corrige en Clientes.

**La sala del diseño no está, a propósito.** La captura muestra "Sala 1 – Paz y Luz"; en la base
no hay tabla de salas. Escribir ese renglón con un texto fijo sería justo lo que este producto
no hace.

**Bloque 8 — Inicio.** El tablero, el buscador global y la campana de avisos.

**No es dueño de un solo dato.** Cada cifra vive en otro módulo y aquí solo se pregunta.
Las once cifras salen de `resumen_inicio` en **un** viaje al servidor, no once; y la agenda de
hoy comparte la misma llave de caché que el módulo Agenda, así que abrir las dos pantallas
cuesta una sola consulta y crear una cita refresca ambas sin apretar F5.

**El rol no se disimula, se aplica.** `resumen_inicio` corre con los permisos de quien llama:
a una recepcionista sin `verFinanzas` la base le entrega las ventas en cero, y la pantalla
además no le pinta esa tarjeta — para que ese cero no se lea como "hoy no hemos vendido nada".

**Dos cosas que en un tablero se confunden solas y salen caras:** "todavía no llega" se pinta
con una raya y no con un cero; y cuando ayer no hubo ventas se dice "nuevo", no "+∞%". El eje
de la gráfica **empieza en cero siempre**: entre $4,800 y $5,000, una escala automática dibuja
una subida que no existió.

**Los avisos de la campana se deducen de cifras reales** —productos bajos, recordatorios
vencidos, citas sin confirmar—. No hay tabla de notificaciones, y por eso ninguno puede quedarse
anunciando algo que ya se resolvió: si el producto se resurtió, el aviso desaparece solo.

**El buscador no pierde el foco.** El campo se pinta siempre en el mismo lugar del árbol, ningún
componente se define dentro de otro render, y se espera a que dejes de escribir antes de
consultar. Hay una prueba que escribe "Fernanda" de un tirón y comprueba que el cursor sigue ahí.

**Hay una guardia nueva:** toda operación que guarde algo tiene que declarar que refresca Inicio.
Olvidarlo no revienta nada — solo deja el tablero mostrando el número de antes, con toda la cara
de estar al día.

### La orden única

```bash
npm install
npm run consistencia
```

Tipos → guardias → pruebas → compilación → ataques. **Termina en verde o no se publica.** Sin
base de datos configurada te lo dice fuerte en vez de pasar en verde fingiendo que comprobó algo.

**401 pruebas · 11 guardias · 77 ataques.**

---

## Lo que sigue

| Bloque | Qué trae |
|---|---|
| **0** ✅ | Arquitectura, esquema, reglas, operaciones, ataques |
| **1** ✅ | El armazón: sesión, marco, menú, rutas, identidad visual |
| **4** ✅ | **Agenda** — día, semana, mes, sin choques de horario |
| **8** ✅ | **Inicio** — el tablero, el buscador global y los avisos |
| 2 | Clientes · 3 · Servicios y Cursos |
| 5 | Productos · 6 · Ventas, Pagos y Caja · 7 · Gastos y Recordatorios |
| 9 | Reportes · 10 · Configuración · 11 · Mensajes · 12 · Publicación |

Inicio es el bloque 8, no el 1: es un resumen, y un resumen necesita que exista
lo que resume. Sale antes que Clientes y Servicios a propósito — con Agenda ya
construida, sus tarjetas tienen de dónde salir, y las que todavía no tienen
fuente **están en cero porque no hay registros, no porque falte código**.

---

Un bloque a la vez, con su verificación, esperando autorización antes del
siguiente. El proceso completo está en `EL-PROCESO.md` de la base.
