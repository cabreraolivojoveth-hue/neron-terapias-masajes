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

Hay dos proyectos y solo UNO es el del producto:

- ✅ **Neron-terapias** → `cxldnxdfhxipckvduzpk.supabase.co` — **este es**.
  Ahí está mi usuario (`cabreraolivojoveth@gmail.com`) y el esquema.
- ❌ base-neronprogramas → `zykqzykjlrjqsbrwpucc` — solo para probar la base.
  El producto NO lo usa.

**Lo que falta AHORITA para poder entrar:**

1. En Vercel → Settings → Environment Variables, las dos deben apuntar al
   proyecto correcto:
   - `VITE_SUPABASE_URL` = `https://cxldnxdfhxipckvduzpk.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = la Publishable key de **Neron-terapias**
2. Redeploy sin caché.
3. Comprobar que corrió `CREAR-MI-CENTRO.sql` en Neron-terapias (crea el
   negocio y mi membresía como dueño). Sin eso entra pero dice "tu cuenta no
   está en ningún centro".
4. Supabase → Authentication → URL Configuration → Site URL = la dirección de
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
