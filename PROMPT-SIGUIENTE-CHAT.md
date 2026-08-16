# Para el chat siguiente

Copia todo lo que hay debajo de la raya. Adjunta también
`imagenes de modulos/CONFIGURACION.png`.

---

Estoy construyendo **Neron Terapias** (Centro Holístico), un ERP para un centro
de terapias. Vamos por el **último módulo: Configuración**. Antes de nada, el
estado exacto.

## 1. DÓNDE ESTÁ EL PROYECTO

**La carpeta desde la que abro el chat está VACÍA.** Solo tiene
`imagenes de modulos/` con la foto de cada módulo. **No concluyas que el
proyecto no existe.** El ERP vive aquí:

```
C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes
```

Y la base compartida en `C:\Users\cabre\OneDrive\Documentos\GitHub\base-neronprogramas`.

**Lee primero, enteros:** `CLAUDE.md` (el acuerdo de trabajo, manda sobre todo lo
demás), `BLOQUE-0-ARQUITECTURA.md` (la ley del producto) y `CONTINUAR-AQUI.md`.

## 2. QUÉ ESTÁ HECHO

Bloques 0, 1, 2 Clientes, 3 Servicios y Cursos, 4 Agenda, 5 Productos,
6 Ventas/Caja, 7 Gastos y Recordatorios, 8 Inicio, 9 Reportes, 11 Mensajes.

**Falta solo el 10: Configuración.**

Estado de la batería a día de hoy: **1 905 pruebas, 18 guardias, 19 velos y
108 pantallas de alcance, todo en verde.** La compilación pasa. Los ataques
(`pruebas-bd/ataques.ts`) **no corren en esta máquina** porque no hay
`DATABASE_URL`; se escriben igual y se dice en el resumen.

## 3. LO ÚLTIMO QUE PASÓ (16/08/2026) — Recordatorios

Se construyó el bloque 7 entero y **ya está publicado y funcionando**:

- Cuatro commits en `main`: `3078f21`, `6c8e429`, `e844841`, `3310281`.
- Vercel desplegado. El paquete publicado trae el módulo.
- **El SQL ya corrió** en Supabase `hgypobbanvkwnqmepqim` y está comprobado:
  4 tablas nuevas, 10 columnas nuevas, 21 funciones y `resumen_inicio`
  desglosando los vencidos.
- Las veinte funciones **se ensayaron contra la base de verdad** (crear, listar,
  buscar, posponer, completar, reabrir, ajustar, cancelar, eliminar, historial,
  repetición sin duplicar, la siguiente vuelta al completar, automatizaciones
  apagadas sin crear nada, cumplimiento y tablero) dentro de un bloque que
  revienta a propósito para que Postgres lo deshaga. No quedó ni una fila.

**No hay nada pendiente de Recordatorios.** Si algo se ve raro al abrirlo, es
noticia nueva.

## 4. CÓMO TRABAJAMOS — dos cosas que hago yo, no tú

Esto **sustituye** lo que dice `CONTINUAR-AQUI.md` sobre que yo corro git:

1. **Empujas tú a `main`.** Eso dispara el despliegue en Vercel. No me pidas
   permiso cada vez ni esperes a que yo haga `add`/`commit`/`push`.
2. **Me pasas siempre el SQL de Supabase**, sin que te lo pida: regenera
   `ACTUALIZAR-BASE.sql` con `npx tsx scripts/actualizar-base.ts` y mándamelo.

Y lo de siempre: **no preguntas antes de ejecutar**, mandas el trabajo hecho con
un resumen corto. Nada de listas de opciones.

**Verde o no se publica:** `npm run consistencia` antes de empujar. Si algo
falla, causa raíz, corregir, y correr **toda** la batería otra vez.

**No digas que un módulo está listo sin haber visto su captura**
(`npm run capturas -- <modulo>`) al lado de la foto. Los tipos, las guardias y
las pruebas no miran.

## 5. TRAMPAS YA PAGADAS — no volver a caer

**Supabase:** el proyecto del producto es **`hgypobbanvkwnqmepqim`**
(`neron-terapias`, organización `Neron Terapias`). Hay **otro que se llama casi
igual** (`cxldnxdfhxipckvduzpk`) y es el que sale al entrar con mi correo de
todos los días. **Mira el ref en la barra de direcciones antes de correr un
SQL.** Eso ya costó una mañana.

**El editor de Supabase se atraganta con archivos grandes.** Trocea las
sentencias antes de mandarlas y pierde el hilo de los `$$`: llega media función
y sale un `unterminated dollar-quoted string` que no dice nada de la causa. Por
eso existe `npx tsx scripts/partir-sql.ts`, que lo corta en partes **sin partir
nunca dentro de una función**. Úsalo si el SQL pasa de unas cientos de líneas.

**Un `limit` al final de un `union all` recorta el conjunto entero**, no la
última rama. Me dejó una comprobación contestando un solo renglón y pareciendo
que todo estaba bien.

**`drop constraint if exists` + `add` NO vale para una llave única** de la que
cuelgue una foránea: la segunda pasada del archivo revienta. Usa un bloque que
mire `pg_constraint` y la agregue solo si falta.

**`src/estilos.ts` y los `src/estilo/*.ts` son literales de plantilla.** Un
acento grave dentro —hasta en un comentario— cierra la cadena y deja de
compilar. Para citar una clase en un comentario, comillas dobles.

**En bash, un acento grave en un `python -c` se lo come el shell.** Escribe los
archivos con la herramienta de escritura, no con `python -c`.

## 6. LO QUE HAY QUE HACER AHORA: Configuración

**El prompt completo del módulo ya está escrito en el repositorio:**

```
PROMPT-CONFIGURACION.md
```

Léelo entero, es concreto. Lo esencial, por si acaso:

- **Casi no necesita tablas nuevas.** Las siete de la base ya existen y son las
  suyas: `negocio`, `estado`, `membresia`, `rol`, `licencia`, `auditoria`,
  `diario`. Las siete capacidades de plataforma (`gestionarUsuarios`,
  `gestionarConfiguracion`, `verAuditoria`, `exportarDatos`,
  `restaurarRespaldo`, `zonaDePeligro`, `verFacturacion`) son su índice.
- **La guardia 8 va a reventar la batería en cuanto exista
  `src/configuracion/`.** Es a propósito: `src/identidad/sesion.tsx` lleva
  `segundoFactorApagado: true` desde que no había pantalla para dar de alta la
  verificación en dos pasos. **El módulo tiene que traer esa pantalla y quitar
  la línea.** No apagues la guardia.
- **La prueba del módulo pendiente se BORRA**, no se muda: está en
  `pruebas/componentes/aplicacion.test.tsx` y su propio comentario dice que
  cuando llegue el último se borra. Configuración es el último.
- **No absorbe la configuración de los demás módulos.** Recordatorios ya tiene
  la suya, Mensajes sus canales y plantillas, las categorías se administran
  desde cada catálogo con `AdministrarCategorias`. Configuración **enlaza**.
- Si usas un prefijo `cfg-` para las clases, **agrégalo a `MIOS` en
  `guardias/fronteras.ts`** o la guardia 17 no vigila nada.

Al terminar: batería en verde, captura mirada, empujar a `main` y pasarme el
SQL. Y dime qué implementaste, qué conexiones creaste, qué pruebas corrieron y
cuáles no, qué problemas encontraste y qué queda pendiente.

## 7. COSAS PRÁCTICAS DE MI MÁQUINA

- PowerShell bloquea `npm`: usa **`npm.cmd`**, o el Bash que ya funciona.
- Las llaves NUNCA por el chat. Van en mi `.env`, que `.gitignore` excluye.
- Todo en español: nombres, archivos, comentarios. Los comentarios dicen **por
  qué** existe algo y qué se rompió antes.
- **Cero datos de ejemplo.** Ni un nombre ni una cifra de la foto. Hay una
  guardia que revienta la publicación si se cuela uno.
