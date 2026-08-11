# Bloque 0 — La arquitectura de Neron Terapias

**Centro Holístico · Bienestar & Terapias**

Este documento es la ley del producto. Se lee antes de tocar código, y cuando
algo no cuadre, gana lo que dice aquí.

Parte de **`@neron/base` v1.0.0**, que ya resuelve identidad, permisos,
seguridad por fila, guardado en la nube, sistema de diseño, formularios, marco,
tabla y tablero. Nada de eso se vuelve a escribir.

---

## 1. Por qué Inicio no fue el primer bloque

Pediste el módulo Inicio con una regla clara y correcta: **Inicio no puede ser
fuente de verdad, solo resumen.**

El repositorio estaba vacío. No existían Agenda, ni Clientes, ni Ventas, ni
Productos. Construir Inicio primero habría significado inventarle los datos —
exactamente lo que prohibiste.

Así que el orden es al revés: **primero las fuentes, después el resumen.** Este
bloque construye las fuentes.

---

## 2. La decisión de fondo: tablas, no bloque JSON

La base guarda el estado operativo en un bloque JSON (`estado.data`). Es lo que
Neron POS necesitaba: rápido, offline, un documento por negocio.

**Terapias no usa el bloque para sus entidades. Usa tablas relacionales.**

Por tres razones concretas:

- Un consultorio pregunta *"¿cuáles son los servicios más vendidos?"*, *"¿qué
  citas tiene Ana este mes?"*. Con un bloque JSON eso obliga a bajar todo y
  contar en el navegador. A los dos años de expedientes, el tablero tarda diez
  segundos en abrir.
- En un bloque JSON nada impide guardar el nombre del cliente dentro de la cita
  "para no tener que buscarlo". El día que esa paciente se cambia el apellido,
  la agenda sigue mostrando el viejo. Con una llave foránea eso es **imposible
  por construcción**.
- Las reglas de acceso por fila protegen tablas. Un bloque JSON se protege
  entero o nada: no hay forma de decir "esta persona ve la agenda pero no las
  finanzas".

El bloque `estado.data` sigue sirviendo para la **configuración** del negocio —
horarios, moneda, colores— que es poca y se lee entera.

---

## 3. Quién es dueño de qué

Regla única: **una sola fuente de verdad por entidad.** Todo lo demás la
referencia por id y la resuelve al leer.

| Entidad | Tabla | Es dueña de |
|---|---|---|
| Pacientes | `cliente` | nombre, teléfono, correo, notas clínicas |
| Catálogo | `servicio` | nombre, duración, precio, promoción, disponibilidad |
| Agrupación del catálogo | `categoria` | nombre y color del grupo — **una sola tabla** para servicios y cursos, separados por `ambito` |
| Cursos | `curso` | qué se enseña, cupo, precio, modalidad, instructor |
| Sesiones de curso | `sesion_curso` | **la ejecución** — día, hora, instructor y lugar de cada reunión |
| Material de curso | `material_curso` | el enlace a lo que se reparte, y a quién se le enseña |
| Inventario | `producto` | precio, costo, SKU, umbral bajo — **`stock_actual` es derivado, nadie lo escribe a mano** |
| Movimientos de inventario | `movimiento_inventario` | **por qué** cambió el stock. Solo se agrega: ni editar ni borrar |
| Proveedores | `proveedor` + `producto_proveedor` | de dónde llega, y a qué precio de cada quien |
| Agenda | `cita` | fecha, hora, estado, a quién y con quién |
| Transacciones | `venta` + `venta_item` | qué se vendió y en cuánto — **`venta_item` es la FOTO del día: nombre, precio y costo con que se cobró** |
| Propuestas | `cotizacion` + `cotizacion_item` | lo mismo, pero **sin efecto**. Entidad aparte, no una venta en estado raro |
| Series de folio | `contador_de_folio` | el siguiente número de cada serie, con candado |
| Pagos | `pago` | con qué se pagó. **Varios renglones son el pago mixto** — nunca un método llamado "mixto" |
| Egresos | `gasto` | lo que sale |
| Caja | `movimiento_caja` | **derivada** — nace de un **pago**, un gasto o un ajuste. Del pago y no de la venta: si no, un pago mixto no cabría, y el corte no sabría cuánto entró en efectivo |
| El cajón | `sesion_caja` | quién abrió, cuándo, con cuánto — y al cerrar, cuánto se esperaba, cuánto se contó y la diferencia. **No guarda saldo: el saldo se suma de los movimientos** |
| Inscripciones | `inscripcion` | quién va a qué curso, y en qué estado — **el alumno es un `cliente`**, no otra tabla de personas |
| Pendientes | `recordatorio` | qué falta hacer, y **de qué entidad salió** |
| Personas del sistema | `membresia` *(de la base)* | quién entra y con qué rol |

**Inicio y Reportes no son dueños de nada.** Consultan y resumen. Si alguna vez
Inicio guarda un número propio, ese número se va a desincronizar — es cuestión
de semanas.

---

## 4. El agujero que encontraron los ataques

Vale la pena contarlo porque es el error más caro que se evitó, y casi nadie lo
ve venir.

La primera versión de la agenda decía:

```sql
cliente_id uuid references cliente(id)
```

Parece suficiente. No lo es: **las llaves foráneas no obedecen las reglas de
fila.** Comprueban que el renglón exista, nada más — y existen los renglones de
todos los centros.

Con eso, la dueña del Centro Holístico podía crear en *su* agenda una cita
apuntando al paciente de **otro centro**. Su regla de lectura la deja ver esa
cita, porque es suya; y al resolver el nombre para pintarla, la aplicación le
entregaba el nombre de un paciente ajeno. **Fuga entre clientes del sistema, con
las reglas puestas y funcionando.**

La solución no fue un disparador ni otra política: es una **llave foránea
compuesta**.

```sql
foreign key (negocio_id, cliente_id) references cliente (negocio_id, id)
```

Así la base garantiza por construcción que el paciente es del mismo centro que
la cita. No hay forma de escribir la fila mala — ni desde el servidor.

Hay una de estas llaves por cada relación entre tablas. Lo encontraron
dos ataques que estaban escritos antes que el código.

---

## 5. Las operaciones que no vive en el navegador

Cobrar una venta no es "cambiar un campo a cobrada". Es, en un solo acto
indivisible:

1. sumar el total desde los renglones,
2. bajar el inventario de cada producto,
3. meter el ingreso a la caja,
4. marcar la venta.

Si eso vive en el navegador, cualquier interrupción —se cae la red, cierran la
pestaña, se va la luz— deja el sistema partido: venta cobrada sin bajar stock, o
stock bajado sin ingreso en caja. Y nadie se entera hasta que el inventario no
cuadra tres meses después.

Aquí es una transacción de la base de datos: **pasa entera o no pasa.**

| Operación | Qué garantiza |
|---|---|
| `registrar_venta(...)` | **la operación completa en un acto**: precio del servidor, stock, cupo, totales, pagos, inventario, inscripción y caja — y una llave de idempotencia que impide que el doble clic cobre dos veces |
| `cobrar_venta(id)` | total calculado, stock bajado con bloqueo de renglón, ingreso en caja, todo o nada |
| `cancelar_venta(id)` | stock devuelto con movimiento contrario, inscripción dada de baja, egreso contrario en caja |
| `guardar_cotizacion(...)` | una propuesta que **no mueve nada**: ni stock, ni caja, ni cupo |
| `abrir_caja(...)` / `cerrar_caja(...)` | una sola caja abierta por centro; el corte compara **solo efectivo** y se congela al cerrar |
| `registrar_movimiento_de_caja(...)` | lo único que se captura a mano: un ingreso o un retiro, sin poder dejar el cajón en negativo |
| `siguiente_folio()` | un contador con candado por centro: dos cajas simultáneas salen con folios distintos |
| `resumen_inicio()` | todo el tablero en **un** viaje al servidor |

Y dos disparadores que no hay que acordarse de llamar: **un gasto crea su egreso
en caja solo**, y **la hora de fin de una cita se calcula** desde la duración del
servicio.

---

## 6. Los permisos se aplican en la base, no en la pantalla

Siete capacidades propias del producto, que encajan en la base sin tocarla:

`gestionarClientes` · `gestionarAgenda` · `gestionarCatalogo` ·
`gestionarInventario` · `cobrar` · `verFinanzas` · `verExpediente`

**`verFinanzas` es el importante.** Una recepcionista sin ese permiso no es que
no vea el total del día: es que **la base de datos no se lo entrega** aunque lo
pida a mano. El tablero le devuelve cero en ventas y sus citas completas — puede
trabajar, no puede ver el dinero.

Eso está probado con un ataque, no supuesto.

---

## 7. La caja es un libro, y el efectivo no es todo el dinero

No hay forma de editar ni borrar un movimiento de caja. Ni la dueña, ni el
servidor. Cancelar una venta **no tacha su ingreso: agrega el egreso contrario**,
y por la misma vía por la que entró — devolver en efectivo lo que se cobró con
tarjeta sacaría del cajón dinero que nunca estuvo ahí.

Un registro financiero que se puede editar no sirve para auditar nada.

Y hay una distinción que casi nadie hace y que sostiene todo el módulo:

| | Qué cuenta |
|---|---|
| **Ingreso del negocio** | toda venta cobrada, con el método que sea |
| **Efectivo en el cajón** | solo lo que se pagó en efectivo |

Una venta de mil pesos con tarjeta es un ingreso de mil pesos y **cero** efectivo.
Si el sistema los sumara juntos, al cerrar el turno pediría contar seis mil y en
el cajón habría dos mil — y nadie sabría si faltó dinero o faltó entender el
número. Por eso **el corte compara solo efectivo**, y por eso cobrar en efectivo
exige una caja abierta: billetes en un cajón que ningún corte va a contar son un
descuadre garantizado.

---

## 8. Estados, iguales en todo el sistema

- **Cita:** `pendiente` · `confirmada` · `completada` · `cancelada` · `no_asistio`
- **Venta:** `borrador` · `cobrada` · `cancelada` — *solo las cobradas cuentan
  como ingreso*
- **Curso:** `programado` · `en_curso` · `terminado` · `cancelado`
- **Recordatorio:** `pendiente` · `hecho` · `descartado`

`no_asistio` existe aparte de `cancelada` porque no es lo mismo para el negocio:
una se reagenda, la otra ya costó.

---

## 9. Nada se borra

Todas las tablas con historial llevan `eliminado boolean`. Un expediente médico
borrado de verdad es un problema legal, no un renglón menos. Y las llaves
foráneas son `on delete restrict`: la base **impide** borrar un paciente con
historial.

---

## 10. Lo que sigue

| Bloque | Qué trae |
|---|---|
| **0** ✅ | Arquitectura, esquema completo, reglas de acceso, operaciones, 180 ataques |
| **1** ✅ | El armazón de la aplicación: sesión, marco, menú, rutas |
| **2** ✅ | **Clientes** — el expediente comercial |
| **3** ✅ | **Servicios y Cursos** |
| **4** ✅ | **Agenda** |
| **5** ✅ | **Productos** |
| **6** ✅ | **Ventas, Pagos y Caja** |
| 7 | Gastos y Recordatorios |
| **8** ✅ | **Inicio** — el tablero, el buscador global y los avisos |
| 9 | Reportes · 10 · Configuración · 11 · Mensajes · 12 · Publicación |

Inicio es el bloque 8, no el 1. Cuando llegue, cada tarjeta va a tener una
fuente real detrás, y las que estén en cero van a estar en cero **porque no hay
registros**, no porque falte código.
