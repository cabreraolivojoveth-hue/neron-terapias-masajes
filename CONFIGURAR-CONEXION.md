# Conectar Neron Terapias con su base de datos

Son cuatro pasos y no hay que mandarle nada a nadie: **las llaves se quedan en
tu computadora.** El archivo donde van está excluido del repositorio.

## 1. Crear el proyecto en Supabase

Uno **nuevo**, aparte del de la base. Nómbralo `neron-terapias`.
La contraseña de la base de datos la generas y la guardas tú — yo no la veo ni
la necesito.

## 2. Instalar la base primero

En Supabase → **SQL Editor** → New query, pega y corre, **en este orden**:

1. `INSTALAR-EN-SUPABASE.sql` — está en el repositorio de `base-neronprogramas`
2. `COMPROBAR-EN-SUPABASE.sql` — los 25 puntos deben decir BIEN

Sin esto no existen `negocio`, `membresia` ni las funciones `app.*`, y el paso
siguiente falla en la primera línea.

## 3. Instalar Terapias encima

En el mismo SQL Editor:

1. `INSTALAR-EN-TERAPIAS.sql`
2. `COMPROBAR-EN-TERAPIAS.sql` — los 13 puntos deben decir BIEN

Los dos se pueden volver a correr las veces que haga falta: no borran ni
duplican nada.

## 4. El archivo de llaves, en tu máquina

Crea un archivo llamado `.env` en la carpeta del proyecto, con esto adentro:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
DATABASE_URL=...
```

- **URL** y **anon key**: Supabase → Settings → API
- **DATABASE_URL**: Supabase → Settings → Database → Connection string → URI.
  Donde dice `[YOUR-PASSWORD]` va la contraseña que tú generaste.

`.gitignore` ya deja ese archivo fuera del repositorio, así que no se sube ni
por accidente.

**Nunca me mandes esas llaves por el chat.** La anon key va en el navegador y
cualquiera la puede ver — por eso existen las reglas de acceso. La
`DATABASE_URL` sí es secreta de verdad.

## 5. Correr los ataques contra tu proyecto real

```bash
npm install
npm run ataques
```

Los 55 ataques intentan leer el expediente de otro centro, cobrarse una venta
ajena, meter dinero a la caja sin operación detrás. **Están bien cuando fallan
el intento.**
