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

**Bloque 0 — Los cimientos del producto.** Veintiuna tablas con sus reglas de acceso
por fila, las operaciones que la base de datos hace sola, y 180 ataques que las
comprueban.

| Tabla | Es dueña de |
|---|---|
| `cliente` | los pacientes: nombre, contacto, notas clínicas |
| `servicio` | el catálogo: nombre, duración, precio |
| `curso` | talleres: fechas, cupo, precio |
| `producto` | inventario: precio, costo, existencias, umbral bajo |
| `cita` | la agenda: fecha, hora, estado, a quién y con quién |
| `venta` + `venta_item` | qué se vendió y en cuánto — con la **foto** del precio y el costo del día |
| `cotizacion` + `cotizacion_item` | lo mismo, pero **sin efecto**: ni stock, ni caja, ni cupo |
| `pago` | con qué se pagó. Varios renglones son el pago mixto |
| `gasto` | lo que sale |
| `movimiento_caja` | **derivada** — nace de un **pago**, un gasto o un ajuste |
| `sesion_caja` | el cajón abierto: quién, cuándo, con cuánto, y el corte al cerrar |
| `inscripcion` | quién va a qué curso |
| `recordatorio` | qué falta hacer, y de qué entidad salió |

**Una sola fuente de verdad por entidad.** Ninguna tabla guarda el nombre de un
paciente: lo referencian por id. Cambiar un apellido se refleja en agenda,
ventas y reportes sin tocar nada más.

### Lo que la base de datos hace sola

Cobrar una venta no es cambiar un campo. Es resolver el precio de cada concepto,
validar el stock y el cupo, sumar el total, bajar el inventario con bloqueo de
renglón, inscribir en el curso, registrar los pagos y meter el dinero a la caja
— **todo en una transacción**. Si eso viviera en el navegador, cualquier
interrupción dejaría el sistema partido.

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

180 ataques contra las tablas del producto: leer el expediente de otro centro,
cobrarse una venta ajena, meter dinero a la caja sin operación detrás, marcar
una venta como cobrada sin bajar inventario. **Están bien cuando fallan el
intento.**

Y hay control negativo: `NERON_SIN_REGLAS=1 npm run ataques` corre el mismo
ensayo sin las reglas de fila. Ahí **24 de los 180 tienen éxito**. Eso es lo que
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

**Bloque 2 — Clientes.** El expediente comercial de una persona.

**Es la fuente de verdad de quién es alguien, y solo de eso.** Sus citas son de Agenda, sus
compras de Ventas, su adeudo de Ventas menos Pagos, sus cursos de Inscripciones. Aquí se
**consultan y se unen**. Por eso corregir un teléfono aquí lo corrige a la vez en la agenda, en
el panel de una cita y en el buscador global — nadie guardó una copia.

**Ninguna cifra está guardada.** "Visitas", "última visita", "total gastado" y "adeudo" se
cuentan cada vez. Un contador a mano se desincroniza a la primera cita cancelada, y a partir de
ahí hay dos números y nadie sabe cuál creer.

**"Activo" y "frecuente" son reglas del negocio, no opiniones de una pantalla.** Viven en la base
(`app.meses_de_actividad`, `app.visitas_para_ser_frecuente`) para que Reportes cuente lo mismo, y
cada tarjeta **dice la regla que aplicó** en vez de dejar el número como un misterio.

**La lista se busca, se filtra y se pagina en la base.** Bajar la tabla y filtrar en el navegador
funciona con veinte clientes y se cae con dos mil; y para pintar "última visita" habría que pedir
el historial de cada renglón —el problema N+1 en su forma más cara—. Aquí sale todo en una
consulta.

**Se avisa de un posible duplicado, no se prohíbe.** Si otro expediente ya tiene ese teléfono o
ese correo, casi siempre es la misma persona capturada dos veces —y un historial partido en dos
no se vuelve a juntar—. Pero a veces una madre da su teléfono para la ficha de su hija: quien
captura decide, viendo la coincidencia. **No se compara por nombre**: dos personas se llaman
igual.

**Se archiva, no se borra.** Un expediente tiene citas, ventas y cursos colgando, y uno borrado
de verdad es un problema legal. Sale de la lista y su historial queda intacto.

**Los cumpleaños se calculan**, no se guardan como recordatorios. El 29 de febrero se corre al 28
en los años que no son bisiestos: `make_date(2027, 2, 29)` revienta, y un solo paciente nacido en
año bisiesto tumbaría el panel entero tres de cada cuatro años.

**El terapeuta asignado y el que atendió una cita son cosas distintas.** Cambiar de terapeuta no
reescribe quién dio las sesiones del año pasado — si lo hiciera, los reportes por terapeuta
dejarían de significar nada.

**Bloque 3 — Servicios.** El catálogo de lo que ofrece el centro.

**Es la fuente de verdad de lo que se ofrece.** Agenda toma de aquí la duración y el color de
cada cita, Ventas el precio, Reportes el nombre para agrupar. Ninguno guarda una copia: todos
preguntan por `servicio_id`.

**El precio de hoy y el precio que se cobró son cosas distintas.** `servicio.precio_centavos` es
el del catálogo ahora; lo que se cobró en enero vive en el renglón de esa venta, con su propio
precio. Si un reporte de enero leyera el catálogo de hoy, subir un precio reescribiría la
historia.

**La duración de hoy y la que duró, también.** La cita guarda su hora de inicio y de fin: esa
resta es lo que duró. Cambiar un servicio de 60 a 90 minutos ya no alarga las citas del año
pasado — antes sí lo hacía, y la agenda de marzo dejaba de cuadrar con lo que de verdad pasó.

**La promoción se resuelve en la base**, en `app.precio_efectivo`. Si cada pantalla la resolviera
por su cuenta, el día que cambie la regla habría que corregirla en cuatro lugares y una se
quedaría cobrando de más. Una promoción vencida se dice **vencida**, no vigente: sigue guardada,
y verla sin fecha hace creer que se está cobrando.

**La categoría es una entidad, no un texto dentro del servicio.** Guardar
`categoria = 'Terapias Energéticas'` en cada renglón obliga a corregir doscientos renglones para
cambiarle una letra al nombre, y siempre queda alguno sin corregir. Una sola tabla sirve para
servicios y para cursos: un centro llama igual a los dos, y con dos tablas ese nombre se renombra
en una y la otra se queda vieja.

**Archivar dice a quién afecta antes de hacerlo.** Una categoría que usan siete servicios,
archivada a ciegas, deja a los siete sin categoría sin que nadie se entere. El número va siempre
visible. Y archivarla **no borra** los servicios: la llave foránea es `on delete set null`.

**Apagar un servicio dice cuántas citas futuras tiene.** Apagar a ciegas uno con doce citas por
delante deja doce personas esperando algo que ya no se ofrece. Las que ya existían se respetan;
lo que cambia es que deja de ofrecerse para citas y ventas **nuevas**.

**Un duplicado sale con otro nombre y apagado.** Con el mismo nombre, el catálogo queda con dos
renglones idénticos, la mitad de las citas cuelga de uno y la mitad del otro, y ningún reporte
por servicio vuelve a cuadrar.

**Sin días marcados no se inventa "Lunes a Domingo".** El diseño muestra un rango porque es un
diseño; el horario del centro lo administra Configuración, que todavía no llega. Mientras tanto
dice **"Según el horario del centro"**, que es la verdad.

**Bloque 3 — Cursos.** Talleres y formaciones, con sus sesiones y sus alumnos.

**Cuatro entidades separadas a propósito.** `curso` es la *definición* —qué se enseña, cuánto
cuesta, cuánto cabe—; `sesion_curso` es la *ejecución* —qué día, a qué hora, con quién—;
`inscripcion` es la relación de una persona con un curso; `material_curso` es lo que se reparte.
Un curso de un día y uno de veinte sesiones son la **misma tabla** con distinto número de
renglones: columnas `sesion1`, `sesion2`, `sesion3` obligan a migrar el día que alguien programe
la cuarta.

**El alumno es un cliente.** No hay tabla de alumnos: hay `cliente` con una `inscripcion`. Con dos
listas de personas, la misma señora acaba capturada dos veces —una porque vino a un masaje y otra
porque tomó el taller— y su historial queda partido en dos mitades que ya no se vuelven a juntar.

**La sobreventa la impide la base, no el navegador.** La forma obvia —contar los inscritos y, si
caben, insertar— tiene una ventana entre las dos operaciones: si dos personas compran el último
lugar a la vez, las dos cuentas ven once de doce, las dos insertan, y el sábado llegan trece
personas a un salón de doce sillas. El `for update` sobre el renglón del curso cierra esa ventana.
**Está probado con dos conexiones pidiendo el último lugar a la vez: una entra, la otra va a lista
de espera.**

**Lleno no rechaza: apunta.** Rechazar pierde al cliente; apuntarlo deja constancia de cuánta
demanda hubo de verdad. Y la lista de espera **no ocupa lugar** — contarla como ocupada dejaría
fuera a quien sí cabe. Subir a alguien de la espera vuelve a pasar por el mismo candado: si no,
sería la puerta de atrás del cupo.

**Inscripción y pago son cosas distintas.** Se puede estar inscrito y deber; se puede haber pagado
y después cancelar. Son dos columnas y dos etiquetas, no una: una sola que mezclara las dos haría
imposible saber a quién hay que cobrarle.

**Las sesiones salen en la Agenda, consultadas.** No hay una cita espejo por cada sesión: crear
copias garantiza que el día que alguien reprograme la sesión, la copia se quede con la fecha vieja
y haya dos calendarios diciendo cosas distintas. En la agenda se ven **distintas de una cita** —es
otro tipo de evento— y se abren en Cursos, que es donde se administran.

**El choque de instructor se comprueba contra las dos agendas**: las citas y las demás sesiones.
Mirar sólo una deja exactamente la otra mitad del problema sin resolver.

**El estado del curso se deriva de las fechas.** Sólo *cancelado* y *apagado* se guardan, porque no
se deducen de un calendario — y un curso cancelado y uno que simplemente terminó no son lo mismo
para nadie. Un estado guardado a mano se queda viejo el primer lunes que nadie entra al sistema.

**"Sin cupo" no es cero.** Cero sería un curso al que nadie puede entrar. Sin límite se dice con
nulo, nunca con 999999.

**La fecha no miente.** Del 15 al 16 son *dos* días, no uno. Y cinco sábados salteados **no** son
un rango de cinco semanas: se dicen "5 sesiones", porque enseñarlos como rango hace creer que el
curso dura cinco semanas corridas.

**Bloque 5 — Productos.** El catálogo físico y el inventario.

**El stock no es un número que se edita: es la consecuencia de una lista de movimientos.** Un
`update producto set stock = 20` no dice nada tres meses después — ni quién lo hizo, ni cuándo, ni
por qué faltaban dos. Con `movimiento_inventario`, la pregunta *"¿por qué dice 18 si compramos
20?"* tiene respuesta.

**Nadie escribe `stock_actual` directamente.** Todo pasa por una sola función, que cambia el
movimiento y el stock **en el mismo acto**, con el renglón del producto bloqueado. Un movimiento
que diga −2 con el stock sin tocar es peor que no tener movimientos: hace creer que hay
trazabilidad cuando no la hay.

**El stock nunca queda negativo.** Un inventario en −3 no es un dato: es la prueba de que el
sistema dejó vender lo que no había, y a partir de ahí ningún número de esa pantalla vale nada.
**Probado con dos cajas vendiendo la última pieza a la vez: una vende, la otra recibe "solo queda
0".**

**Todo ajuste exige un motivo.** Un ajuste sin motivo es exactamente el `update stock = 20` que
esto existe para evitar, sólo que con más pasos. Y la bitácora **no se puede editar ni borrar**:
si el inventario no cuadra y los movimientos se corrigen a mano, no hay forma de saber si faltó
mercancía o faltó honestidad.

**El valor del inventario va con el COSTO, no con el precio de venta.** Con el precio sale
inflado y se lee como si el centro tuviera ese dinero: lo que hay en la vitrina vale lo que costó.

**El costo no es para todo el mundo, y esconderlo con CSS no lo esconde.** Quien no tiene
`verCostos` recibe `null` desde la base — no cero — y la pantalla lo **dice**, en vez de enseñar
un cero que se leería como "no vale nada".

**El costo se congela al vender.** Sin esa foto, subir el costo el mes que viene reescribiría la
utilidad de todos los meses anteriores.

**"Desactivado" y "agotado" son cosas distintas.** Un producto activo con cero piezas está
agotado, no inactivo: apagarlo solo porque se acabó lo escondería justo cuando hay que resurtirlo.

**Bloque 6 — Ventas.** El punto de venta: servicios, productos y cursos en una sola operación.

**Ventas orquesta; no es dueña de casi nada.** El cliente es de Clientes, el servicio de
Servicios, el producto y su stock de Productos, el cupo de Cursos, el dinero de Caja. Por eso no
hay ni un catálogo propio: `catalogo_vendible` pide los tres a la vez. Mantener copias obligaría a
sincronizarlas, y el día que fallara se vendería algo que ya no existe.

**Cobrar es UNA transacción, no diez llamadas.** `registrar_venta` valida el stock, valida el
cupo, calcula los totales **en el servidor**, guarda la foto de cada renglón, mueve el inventario,
inscribe en el curso, registra los pagos y mete el dinero a la caja. Pasa entero o no pasa nada.
Diez llamadas desde el navegador dejan el sistema partido en cuanto una falle —venta cobrada sin
bajar stock, o stock bajado sin ingreso en caja— y nadie se entera hasta que el inventario no
cuadra tres meses después.

**El precio no viaja desde el navegador.** Se manda *qué* se vende y *cómo* se paga. Aceptar el
precio del navegador es dejar que el cliente decida cuánto paga. **Probado: mandando precio 1,
cobra 800.**

**Un doble clic no cobra dos veces.** El botón deshabilitado ayuda, pero no es la defensa: una red
lenta reintenta sola y la pestaña de al lado no sabe de ese botón. La defensa es una llave de
idempotencia con índice único — la segunda petición no crea nada, devuelve la venta que ya existe.
**Probado con la misma llave dos veces: una venta, un descuento de stock.**

**Un pago mixto son DOS pagos, no un método "mixto".** Guardar `metodo = 'mixto'` pierde el
detalle, y entonces el corte de caja no puede saber cuánto entró en efectivo — que es justo lo que
hay que contar en el cajón al cerrar. Cada pago deja su propio movimiento de caja, con su método.

**El cambio no es un egreso.** Si el cliente da mil por una venta de novecientos, entraron
novecientos: los cien eran suyos desde el principio. Se registra lo **aplicado**; lo recibido se
guarda aparte, solo para el ticket.

**Los precios históricos no se reescriben.** `venta_item` guarda la foto del nombre, del precio y
del costo del día. Si Reiki sube a $900 el mes que viene, el ticket del mes pasado sigue diciendo
$800 — y la utilidad de ese mes no cambia sola.

**Cancelar no borra.** La venta se queda en el historial, marcada. El stock vuelve con un
movimiento **contrario** —el de la venta ocurrió de verdad—, la inscripción que pagó esa venta se
da de baja, y la caja recibe el egreso contrario. Un registro financiero que se puede tachar no
sirve para auditar nada.

**Una cotización no mueve nada:** ni stock, ni caja, ni cupo. Es una propuesta, y es una entidad
aparte — guardada como "venta borrador" acabaría contada en algún reporte de ingresos el día que
alguien olvide filtrar el estado.

**El folio no se recicla ni se repite.** Con `max(folio) + 1`, dos cajas cobrando a la vez leen el
mismo máximo y la segunda revienta. Hay un contador con candado por centro.

**Los impuestos salen en cero porque no hay ninguno configurado**, y la pantalla lo dice: "IVA
(0%)". El día que Configuración los declare, la cifra sale de ahí.

**Bloque 6 — Caja.** El cajón, y lo que de verdad hay dentro.

**Un ingreso del negocio no es lo mismo que efectivo en el cajón, y esa distinción sostiene todo
el módulo.** Una venta de mil pesos con tarjeta es un ingreso de mil pesos y **cero** efectivo. Si
el sistema los sumara juntos, al cerrar el turno pediría contar seis mil y en el cajón habría dos
mil — y nadie sabría si faltó dinero o faltó entender el número. El corte compara **solo
efectivo**; el resto se enseña al lado, dicho.

**Sin caja abierta no se cobra en efectivo.** Billetes en un cajón que ningún corte va a contar son
un descuadre garantizado. La tarjeta y la transferencia sí se cobran sin caja — ese dinero va al
banco. Y cuando Ventas topa con esto, no deja a quien cobra releyendo el error: **lo lleva a Caja
a abrirla.**

**Una sola caja abierta por centro, y lo garantiza un índice.** Con dos, cada venta tendría que
elegir a cuál va, y la primera vez que alguien elija mal el corte no cuadra. Comprobarlo en la
pantalla no sirve: dos personas abriendo caja a la vez pasan las dos comprobaciones.

**Caja no es dueña de ningún movimiento.** Los de venta los escribe `registrar_venta`, los de
gasto un disparador, y lo único que se captura a mano son los ajustes: ingresos y retiros. Si se
pudieran meter ingresos sueltos, la caja dejaría de cuadrar con las ventas el primer día.

**No hay editar ni borrar en toda la pantalla**, y no es un olvido: la caja es un libro. Revertir
algo es agregar el movimiento contrario. Cancelar una venta devuelve el dinero **por la misma vía
por la que entró** — un pago con tarjeta no saca efectivo del cajón.

**Un gasto pagado por transferencia no baja el efectivo.** Sin esa distinción, al cerrar faltaba
justo la renta y nadie sabía si era un faltante de verdad.

**No se retira más efectivo del que hay.** Un cajón en negativo no es un dato: es la prueba de que
el sistema dejó sacar lo que no estaba.

**El esperado se congela al cortar.** Si se recalculara al abrir el historial, un movimiento
agregado después cambiaría un corte ya firmado — y entonces no serviría para explicarle un
faltante a nadie. Una caja cerrada no se reabre ni se retoca: lo impide la base.

**El número esperado no se enseña hasta que el conteo ya está escrito.** Quien ya vio la cifra
objetivo tiende a "encontrar" justo esa cantidad, y entonces el conteo no comprueba nada.

**Nada se guarda calculado.** Ni el saldo de la caja ni los totales del turno: se suman de los
movimientos cada vez que se piden. Un saldo guardado se desincroniza, y cuando lo hace nadie sabe
cuál de los dos números creer.

### La orden única

```bash
npm install
npm run consistencia
```

Tipos → guardias → pruebas → compilación → ataques. **Termina en verde o no se publica.** Sin
base de datos configurada te lo dice fuerte en vez de pasar en verde fingiendo que comprobó algo.

**Los ataques aplican `INSTALAR-EN-TERAPIAS.sql` de verdad**, no una copia. Postgres no revisa el
cuerpo de una función `plpgsql` al crearla, así que un nombre de columna equivocado sobrevive a
los tipos, a las guardias y a las mil pruebas — y revienta en el SQL Editor. Aplicando el
instalador real, cada función se parsea contra un Postgres de carne y hueso y el error sale aquí.

**1161 pruebas · 11 guardias · 180 ataques.**

---

## Lo que sigue

| Bloque | Qué trae |
|---|---|
| **0** ✅ | Arquitectura, esquema, reglas, operaciones, ataques |
| **1** ✅ | El armazón: sesión, marco, menú, rutas, identidad visual |
| **4** ✅ | **Agenda** — día, semana, mes, sin choques de horario |
| **8** ✅ | **Inicio** — el tablero, el buscador global y los avisos |
| **2** ✅ | **Clientes** — el expediente comercial de cada persona |
| **3** ✅ | **Servicios** — el catálogo · **Cursos** — talleres, sesiones e inscripciones |
| **5** ✅ | **Productos** — el catálogo físico y el inventario trazable |
| **6** ✅ | **Ventas** — el cobro en una transacción, con pagos y cotizaciones |
| **6** ✅ | **Caja** — la sesión, el corte, y la tarjeta que no entra al cajón |
| 7 | Gastos y Recordatorios |
| 9 | Reportes · 10 · Configuración · 11 · Mensajes · 12 · Publicación |

Inicio es el bloque 8, no el 1: es un resumen, y un resumen necesita que exista
lo que resume. Sale antes que Clientes y Servicios a propósito — con Agenda ya
construida, sus tarjetas tienen de dónde salir, y las que todavía no tienen
fuente **están en cero porque no hay registros, no porque falte código**.

---

Un bloque a la vez, con su verificación, esperando autorización antes del
siguiente. El proceso completo está en `EL-PROCESO.md` de la base.
