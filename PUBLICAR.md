# Publicar Neron Terapias en Vercel

## 1. Hacer pública la base

Vercel no puede bajar un repositorio privado durante la compilación. El error
se ve así:

```
npm error git@github.com: Permission denied (publickey).
npm error fatal: Could not read from remote repository.
```

En GitHub → `base-neronprogramas` → **Settings** → hasta abajo, **Danger
Zone** → **Change repository visibility** → **Make public**.

No hay ningún secreto adentro: las llaves viven en tu `.env`, que `.gitignore`
excluye. **Terapias se queda privado** — solo la base se abre.

## 2. Por qué la dependencia dice `git+https` y no `github:`

En `package.json` verás:

```json
"@neron/base": "git+https://github.com/cabreraolivojoveth-hue/base-neronprogramas.git#v1.0.2"
```

El atajo `github:usuario/repo` que trae npm resuelve a **SSH**
(`git@github.com:...`), y Vercel no tiene llave SSH. Aunque el repositorio sea
público, la compilación falla igual. Con `git+https` no hace falta ninguna
credencial.

Es el mismo motivo por el que el primer despliegue falló, y no se ve en la
computadora de uno porque ahí sí hay llave SSH configurada.

## 3. Importar el proyecto

1. [vercel.com/new](https://vercel.com/new) → **Import** el repositorio
   `neron-terapias-masajes`
2. Framework: **Vite** (lo detecta solo)
3. **Antes de dar Deploy**, abre **Environment Variables** y agrega dos:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | La dirección de tu proyecto de Supabase |
| `VITE_SUPABASE_ANON_KEY` | La llave pública (`Publishable key` o la `anon`) |

**Ojo:** estas variables se leen **al compilar**, no al abrir la página. Si las
cambias después, hay que volver a desplegar (Deployments → ⋯ → Redeploy).

4. **Deploy**

## 4. Autorizar la dirección en Supabase

Cuando tengas la dirección de Vercel (`https://algo.vercel.app`):

Supabase → **Authentication** → **URL Configuration**

- **Site URL**: la dirección de Vercel
- **Redirect URLs**: agrega también `http://localhost:5173` para poder seguir
  trabajando en tu máquina

Sin esto, iniciar sesión puede rebotar.

## 5. Qué NO se sube

`.gitignore` deja fuera el `.env`, así que las llaves nunca llegan a GitHub ni
a Vercel por accidente. En Vercel se ponen a mano, una sola vez, en el formulario
de variables.

Y la llave **`sb_secret_`** de Supabase **no va aquí ni en ningún lado del
navegador**. Solo la pública.
