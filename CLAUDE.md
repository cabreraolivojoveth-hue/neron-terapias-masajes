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
- **Supabase del producto:** `cxldnxdfhxipckvduzpk.supabase.co`. El proyecto
  `zykqzykjlrjqsbrwpucc` es solo para probar la base — el producto no lo usa.
- **La base se instala por `git+https://`**, no por `github:usuario/repo`: npm
  resuelve eso a SSH y Vercel no tiene llave.
- **`onAuthStateChange` de Supabase avisa sosteniendo un candado interno.** Llamar
  a otra función de autenticación desde adentro cuelga la pantalla para siempre,
  sin error y sin nada en la consola.
