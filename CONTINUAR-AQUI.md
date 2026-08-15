# Para continuar en otro chat

Pega el texto de abajo en un chat nuevo. Está escrito para que quien lo lea
entienda el estado completo sin tener que preguntarte nada.

---

## EL MENSAJE (copia desde aquí)

Estoy construyendo **Neron Terapias** (Centro Holístico), un sistema para un
centro de terapias. Yo soy el arquitecto: tú programas y escribes los archivos
directo en mi carpeta, yo solo corro git.

**Dónde está todo, en mi máquina:**

- Producto: `C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes`
- Base compartida: `C:\Users\cabre\OneDrive\Documentos\GitHub\base-neronprogramas`

**Lee primero estos archivos, son las reglas y lo ya resuelto:**

De la base: `EL-PROCESO.md`, `COMO-EMPEZAR-UN-PRODUCTO.md`, `README.md`,
`BLOQUE-0-ARQUITECTURA.md`.
Del producto: `README.md`, `BLOQUE-0-ARQUITECTURA.md`, `CONTINUAR-AQUI.md`.

**Lo que YA está hecho:**

- `@neron/base` v1.0.2 — repositorio **público**, 836 pruebas, 10 guardias,
  33 ataques.
- Terapias bloques 0, 1 y 4 — 209 pruebas, 7 guardias, 77 ataques. Publicado
  en Vercel.
- Base de datos: 12 tablas con reglas de acceso por fila y llaves compuestas
  que impiden mezclar centros.

**Supabase — MUY IMPORTANTE:**

El proyecto del producto es **`neron-terapias`** → `hgypobbanvkwnqmepqim.supabase.co`.

- Cuenta de Supabase que lo posee: **neroncenterserv@gmail.com**
  (organizacion `Neron Terapias`, plan Free).
- Correo para ENTRAR a la aplicacion: `cabreraolivojoveth@gmail.com`.
  Son cosas distintas: uno es el dueño de la cuenta, el otro el usuario del
  sistema. Las llaves y la contraseña de la base NO se escriben aqui: van en
  `.env` y en las variables de Vercel.
- Sitio publicado: `https://neron-terapias-masajes-neon.vercel.app`

Proyectos que ya NO se usan:

- ❌ `cxldnxdfhxipckvduzpk` — el viejo. Quedo en una cuenta a la que ya no hay
  acceso. Sigue vivo, pero es inalcanzable: no apuntar nada ahi.
- ❌ `zykqzykjlrjqsbrwpucc` — solo para probar la base.

**La migracion quedo hecha el 13/08/2026.** El orden que funciono:

1. `INSTALAR-EN-SUPABASE.sql` (repo base, v1.1.0) → Success.
2. `COMPROBAR-EN-SUPABASE.sql` → 25 puntos, 0 MAL.
3. `INSTALAR-EN-TERAPIAS.sql` → Success. **Ya trae dentro `basedatos/01-esquema`,
   `02-reglas` y `03-funciones` completos** (los 76 objetos), asi que correrlos
   aparte sobra.
4. `COMPROBAR-EN-TERAPIAS.sql` → 16 puntos, 0 MAL.
5. Usuario en Authentication → Users, con "Auto Confirm".
6. `CREAR-MI-CENTRO.sql`.
7. Vercel → variables al proyecto nuevo + Redeploy **sin** build cache.
8. Supabase → Authentication → URL Configuration → Site URL = la direccion de
   Vercel.

**Bloques que siguen:** 2 Clientes · 3 Servicios y Cursos · 5 Productos ·
6 Ventas, Pagos y Caja · 7 Gastos y Recordatorios · **8 Inicio** (el tablero) ·
9 Reportes · 10 Configuración.

**Cómo trabajamos:**

Un bloque a la vez, con su batería en verde (`npm run consistencia`), y esperas
mi "siguiente" antes del que sigue. Escribes los archivos directo en mi carpeta;
yo hago add, commit y push.

**Cosas prácticas de mi máquina que ya nos costaron tiempo:**

- PowerShell bloquea `npm`. Hay que usar **`npm.cmd`**.
- Los comandos largos y pegados se me enredan. **Mándame una línea a la vez**,
  o mejor un archivo `.bat` de doble clic (ya hay varios: `ARRANCAR.bat`,
  `CONECTAR.bat`, `SUBIR.bat`).
- Al pegar en la consola se pierde el primer carácter. Ya está contemplado en
  el código, pero tenlo en cuenta.
- Las llaves NUNCA por el chat. Van en mi `.env`, que `.gitignore` excluye.

**Reglas que no se rompen:**

- Todo en español, código y comentarios.
- Los comentarios dicen POR QUÉ existe algo y qué se rompió antes.
- **Nunca datos de ejemplo.** Ni un nombre, ni una cifra, ni una cita
  inventada. Hay una guardia que revienta la publicación si se cuela uno.
- Toda tabla nueva lleva reglas de acceso encendidas, forzadas, y su propio
  ataque escrito.
- Verde o no se publica. Si algo falla: causa raíz, corregir, correr **toda**
  la batería otra vez.

## (copia hasta aquí)

---

# Lo que se aprendió, para no repetirlo

Estos tres costaron una madrugada. Están arreglados, pero si algo parecido
vuelve a aparecer, aquí está el mapa.

### 1. La pantalla que cargaba para siempre

`onAuthStateChange` de Supabase corre su aviso **mientras sostiene un candado
interno**. Llamar a otra función de autenticación desde adentro de ese aviso
produce un bloqueo mutuo: no hay error, no hay excepción, no hay nada en la
consola. Solo una pantalla cargando sin fin.

Arreglado en `base/src/identidad/proveedor-supabase.ts` sacando el trabajo del
aviso con `setTimeout(0)`. Hay una prueba que simula el candado y lo cacha.

**Ninguna de las 836 pruebas lo veía** porque el doble de pruebas no tiene
candados. Solo aparece con el Supabase de verdad.

### 2. Vercel no podía bajar la base

Dos causas encadenadas:

- El repositorio de la base era privado → `Permission denied (publickey)`.
  Se hizo público.
- npm resuelve `github:usuario/repo` a **SSH**, y Vercel no tiene llave. Se
  cambió a `git+https://...` **y** se puso un Install Command en Vercel:
  ```
  git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && npm install
  ```
- El `package-lock.json` guardaba la dirección `ssh://` y la versión vieja.
  Se quitó del repositorio para que npm lo regenere.

### 3. Redeploy no compila el commit nuevo

En Vercel, **Redeploy vuelve a compilar el MISMO commit** del despliegue que
estás viendo. Para compilar código nuevo hay que buscar el despliegue del
commit nuevo en la lista, o empujar un commit para disparar uno.

Se perdió un buen rato dándole Redeploy a un despliegue viejo.
