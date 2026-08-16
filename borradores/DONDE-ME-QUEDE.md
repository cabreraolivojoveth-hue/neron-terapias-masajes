# Dónde me quedé — para continuar en un chat nuevo

Fecha de corte: **16/08/2026**. Todo lo terminado está publicado en `main` y el
SQL ya corrió en la base del producto.

---

## ESTADO DEL REPOSITORIO

`npm run consistencia` → **verde**: 17 guardias, 1.548 pruebas, 13 velos, 84
pantallas de alcance y compilación.

**Los ataques siguen sin correr NUNCA desde esta máquina**: falta `DATABASE_URL`
en el `.env` (solo están las dos llaves del navegador). Es la única parte de la
batería que jamás se ha ejecutado, así que nadie ha comprobado todavía que las
reglas de acceso por fila de verdad muerdan.

---

## LO QUE EL USUARIO YA HIZO (no hace falta pedirlo otra vez)

Corrió `ACTUALIZAR-BASE.sql` en el proyecto correcto y la aplicación quedó
funcionando. Con eso entraron los cuatro bloques que faltaban: eliminar
producto, el expediente clínico, Gastos completo y la capa de Reportes.

**LA MAÑANA QUE COSTÓ, Y POR QUÉ:** el SQL se estuvo pegando en
`cxldnxdfhxipckvduzpk`, que TAMBIÉN se llama "Neron-terapias" y es el que sale
al entrar con el correo de todos los días. Salía sin un solo error y la pantalla
seguía fallando. Está contado con la tabla de los tres proyectos en el §7 de
`CLAUDE.md`. **Antes de mandar un SQL, comprobar el ref en la barra de
direcciones** — el nombre del selector no distingue nada.

---

## LO QUE SE HIZO EN ESTE TRAMO

- **El foco que saltaba solo.** `src/ui/modal.tsx` le da a la base una función de
  identidad estable; las doce pantallas con `Modal` importan de ahí. **Guardia
  15** impide que la trece vuelva a caer.
- **El instalador estaba partido en dos.** La sección de Reportes se había
  pegado *dentro* de dos funciones de Gastos. Salió publicado en verde porque
  nada de la batería abría ese archivo. **Guardia 16.**
- **`ACTUALIZAR-BASE.sql` ya no se arma a mano:** `scripts/actualizar-base.ts` lo
  genera desde el instalador cortando por título, no por número de línea. Antes
  se regeneró a mano y perdió dos bloques enteros.
- **Reportes completo**, publicado y funcionando.
- **Tres errores de SQL** que solo aparecían al ejecutarlo: el `group by` sin
  `cu.id`, el `limit 10` que cortaba antes de ordenar en los cuatro rankings, y
  los gastos por categoría agrupados por la columna de texto vieja.
- **Caja reorganizada:** sin la pestaña "El cajón" (sin tocar una cuenta), el
  corte ya no abre el formulario al entrar, "Ventas del día" arranca con cuatro
  y crece, su buscador encuentra por vendedor, y se fue la duplicación de
  "Últimas ventas del día". Clientes recientes en el buscador de Cobrar.
- **Nuevo paciente = Nuevo cliente.** La Agenda monta `FichaDeCliente`.
- **Guardia 17:** toda clase escrita existe en la hoja. Encontró dieciocho
  muertas, entre ellas tres formularios que seguían con el botón pelón de
  "+ Información adicional".
- **`npm run alcance`**, nuevo paso de la batería: diez módulos en cuatro
  tamaños, con el carrito lleno, comprobando que a cada botón se llega.

---

## LO QUE FALTA

### 1. Módulos que siguen en "Pendiente"

Sin `src/`: **Mensajes**, **Recordatorios** y **Configuración**. Las fotos están
en `imagenes de modulos/`.

Cuando exista `src/configuracion/`, la **guardia 8 revienta a propósito** para
obligar a decidir sobre el segundo factor apagado. No es un fallo: es la deuda
cobrándose.

### 2. Los ataques a la base

Sigue faltando `DATABASE_URL`. Mientras tanto, la parte de seguridad del sistema
está escrita y sin comprobar.

### 3. Un cabo suelto honesto: el scroll de Cobrar

Se reportó que al meter productos la zona de cobrar se iba de la pantalla sin
poder bajar. **No se consiguió reproducir el síntoma exacto en la vitrina** — la
tarjeta mide 592 píxeles y cabe en las cuatro ventanas de prueba. Se cambió la
estructura igual, porque la que había era frágil: ahora la columna entera es
pegajosa y se recorre por dentro si no cabe.

`npm run alcance` es la red, **no la prueba de regresión de ese caso**. Si vuelve
a pasar, hay que preguntar con cuántos productos y en qué pantalla, y agrandar el
caso de `scripts/alcance.ts` hasta que lo cace.

### 4. El `.env` local apunta al proyecto de pruebas, y con un error de tecleo

Dice `ttps://zykqzykjlrjqsbrwpucc.supabase.co` — sin la `h` y al proyecto que no
se usa. No afecta al sitio publicado (Vercel tiene sus propias variables) pero
rompe el desarrollo local contra la base real. **No se tocó a propósito:**
apuntar la máquina de alguien a producción es su decisión, no la de quien pasaba
por ahí.
