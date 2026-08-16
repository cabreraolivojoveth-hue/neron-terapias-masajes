# Prompt para el bloque 10 — Configuración

Copia todo lo que hay debajo de la raya en un chat nuevo, y adjunta la foto
`imagenes de modulos/CONFIGURACION.png`.

---

Quiero que implementes COMPLETAMENTE el módulo **Configuración** de mi ERP. Es el
**último** que falta. La imagen adjunta es la referencia visual y **se sigue al
pie de la letra**: misma distribución, mismas secciones, mismos botones, mismo
orden.

## 0. DÓNDE ESTÁ EL PROYECTO — léelo antes de nada

**La carpeta desde la que abro el chat está VACÍA.** Solo tiene
`imagenes de modulos/`. No concluyas que el proyecto no existe.

El ERP vive en:

```
C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes
```

Y la base compartida en `...\GitHub\base-neronprogramas`.

## 1. ANTES DE PROGRAMAR

Lee, en este orden y enteros:

- `CLAUDE.md` — el acuerdo de trabajo. Manda sobre todo lo demás.
- `BLOQUE-0-ARQUITECTURA.md` — la ley del producto.
- `CONTINUAR-AQUI.md` — el estado y las trampas ya pagadas.
- `src/modulos/registro.ts`, `src/identidad/sesion.tsx`, `guardias/fronteras.ts`.

Y mira cómo quedó el módulo anterior (Recordatorios) para copiar su forma:
`src/datos/recordatorios.ts` y `src/recordatorios/`.

No reemplaces nada que ya funcione. Reutiliza la arquitectura. No crees una
segunda fuente de verdad.

## 2. QUÉ ES CONFIGURACIÓN, Y QUÉ NO ES

**Casi no necesita tablas nuevas.** Las siete de `@neron/base` ya existen y son
las suyas: `negocio`, `estado`, `membresia`, `rol`, `licencia`, `auditoria`,
`diario`. Configuración las **administra**; no las duplica.

Las capacidades de plataforma ya existen en la base y son el índice del módulo:

`gestionarUsuarios` · `gestionarConfiguracion` · `verAuditoria` ·
`exportarDatos` · `restaurarRespaldo` · `zonaDePeligro` · `verFacturacion`

**Cada sección respeta la suya.** Quien no tiene `verAuditoria` no ve la
bitácora — y no porque se le esconda el botón, sino porque la base no se la
entrega.

**NO absorbe la configuración de los demás módulos.** Recordatorios ya tiene su
`recordatorio_ajustes` y su pantalla; Mensajes sus canales y plantillas; las
categorías se administran desde cada catálogo con `AdministrarCategorias`.
Configuración **enlaza** a eso, no lo reimplementa. Dos pantallas que guardan lo
mismo acaban diciendo cosas distintas.

## 3. LAS SECCIONES

Sigue la foto para la distribución. El contenido, como mínimo:

1. **El centro** — nombre, lema, contacto, dirección, zona horaria, moneda.
   Hoy `NOMBRE_DEL_PRODUCTO` y `LEMA` viven escritos en `src/marca.ts` con un
   comentario que dice *"vive aquí hasta que Configuración lo administre"*.
   Págalo: que salgan del negocio y que `marca.ts` se quede solo con los colores.
2. **Horarios** — días y horas en que abre el centro. **Agenda tiene que
   respetarlos**: agendar fuera de horario debe avisar.
3. **Usuarios y roles** — `membresia` y `rol`. Invitar, cambiar rol, activar,
   dar de baja. **La protección anti-bloqueo no se toca**: el rol `dueno` se
   guarda con la lista de permisos vacía y `app.tiene_permiso` lo entiende. No
   se puede quedar un centro sin dueño ni quitarse uno a sí mismo el acceso.
4. **Permisos** — la matriz de rol × capacidad, con las siete de plataforma y
   las nueve de `CAPACIDADES_DE_TERAPIAS`. Que se vea qué desbloquea cada una.
5. **Bitácora** — la tabla `auditoria`, que ya se está llenando desde Agenda,
   Ventas, Caja y Gastos. Filtros por módulo, persona y fecha. **Solo se lee.**
6. **Exportar / respaldo** — con `exportarDatos` y `restaurarRespaldo`. Si
   restaurar no se puede hacer bien todavía, **dilo en la pantalla** en vez de
   poner un botón que no hace nada.
7. **Plan y licencia** — `licencia`. Qué plan, hasta cuándo, qué límites.
   `app.licencia_permite` ya bloquea la escritura cuando vence: que la pantalla
   lo explique en vez de dejar que los guardados fallen sin motivo aparente.
8. **Zona de peligro** — con `zonaDePeligro`. Confirmación escrita, nada de un
   botón suelto.

## 4. TRES COSAS QUE VAN A REVENTAR LA BATERÍA — no son bugs, son avisos

**4.a — La guardia 8 revienta en cuanto exista `src/configuracion/`.**

Es a propósito y es la deuda más importante del proyecto.
`src/identidad/sesion.tsx` lleva `segundoFactorApagado: true` porque no había
pantalla para dar de alta la verificación en dos pasos, y sin ese apagado el
dueño se quedaba encerrado fuera de su propio centro. La guardia está atada a
que exista esta carpeta justamente para obligar a decidir ahora.

**Así que este módulo tiene que traer la pantalla de segundo factor y quitar esa
línea.** No apagues la guardia. No es negociable: la base se lo exige a dueño y
administrador.

**4.b — La prueba del módulo pendiente se borra, no se muda.**

`pruebas/componentes/aplicacion.test.tsx` tiene una prueba
(`los modulos que no llegan lo DICEN`) que apunta a Configuración. Su propio
comentario dice que **cuando se construya el último, se borra** — no se busca
otro con que rellenarla. Bórrala. Decide también si `src/modulos/pendiente.tsx`
sigue teniendo sentido como red de seguridad para un id desconocido (yo creo que
sí); si lo quitas, quita su prueba con él.

**4.c — El prefijo nuevo se declara.**

Si usas `cfg-` para las clases, agrégalo a `MIOS` en `guardias/fronteras.ts`
(está junto a `rec-`, `gto-`, `rep-`…). Si no, la guardia 17 no vigila nada y
las clases que no existan pasarán sin avisar.

## 5. REGLAS QUE NO SE ROMPEN

- **Cero datos de ejemplo.** Ni un nombre ni una cifra de la foto. La guardia 1
  revienta la publicación. El módulo se entrega vacío, con su estado de
  "todavía no hay nada" bien resuelto.
- **Ni un color a mano.** Todos salen de `src/marca.ts`. Si Configuración deja
  cambiar los colores del centro, **respeta la prueba de contraste**: el primer
  verde candidato se cayó en 4.06:1 y hubo que bajarlo.
- **Los nombres se resuelven al leer, jamás se copian.**
- **Cada archivo nuevo de `src/` necesita su prueba** en `pruebas/`
  (guardia 7), y dos archivos no se pueden llamar igual (guardia 6).
- **El `Modal` entra por `src/ui/modal.js`**, nunca de `@neron/base/ui`
  (guardia 15). Y `MenuDeAcciones`, `Plegable` y `AdministrarCategorias` ya
  existen: úsalos.
- **Toda `useOperacion` declara el prefijo `inicio`** en su invalidación
  (guardia 11).
- **Toda tabla nueva con reglas de fila necesita su `grant`** (guardia 18) y su
  ataque escrito en `pruebas-bd/ataques.ts`.
- **En `INSTALAR-EN-TERAPIAS.sql`, lo nuevo va AL FINAL**, nunca en medio
  (guardia 16). Y **el patrón `drop constraint if exists` + `add` NO vale para
  una llave única de la que cuelgue una foránea**: eso me acaba de reventar la
  segunda pasada del SQL de Recordatorios. Usa un bloque que compruebe
  `pg_constraint` y la agregue solo si falta.

## 6. CÓMO SE MIRA, Y CÓMO SE ENTREGA

No digas que está listo sin haber visto la captura al lado de la foto:

```bash
npm run capturas -- configuracion
```

Y agrega el módulo a `scripts/capturas.ts`, `scripts/velos.ts`,
`scripts/alcance.ts` y `pruebas-visuales/vitrina.tsx`. **Ojo con velos:** busca
los botones por nombre accesible y en la barra lateral hay uno que se llama
"Configuración"; si tu botón se llama igual, el guion aprieta el del menú y se
va de la pantalla. Ponle un `aria-label` que contenga el texto visible.

Batería completa, **verde o no se publica**:

```bash
npm run consistencia
```

Los ataques no van a correr: esta máquina no tiene `DATABASE_URL`. Escríbelos
igual y **dilo en el resumen** en vez de decir "todo verde".

Al terminar, **siempre las dos cosas**:

1. **Empuja tú a `main`** — eso dispara el despliegue en Vercel.
2. **Pásame el SQL de Supabase**: regenera `ACTUALIZAR-BASE.sql`
   (`npx tsx scripts/actualizar-base.ts`) y mándamelo. Va al proyecto
   **`hgypobbanvkwnqmepqim`** (`neron-terapias`) — **mira el ref en la barra de
   direcciones**, hay otro que se llama casi igual y correr el SQL ahí ya costó
   una mañana.

Y dime al final: qué implementaste, qué conexiones creaste, qué pruebas
corrieron y cuáles no, qué problemas encontraste y qué queda pendiente.
