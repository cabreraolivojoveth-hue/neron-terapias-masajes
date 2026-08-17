-- =====================================================================
-- COMPROBAR-DEMOSTRACION.sql — ¿de verdad se aplico el bloque 11?
-- =====================================================================
--
-- Pegar en Supabase -> SQL Editor -> Run, DESPUES de ACTUALIZAR-BASE.sql.
-- Proyecto `hgypobbanvkwnqmepqim` (neron-terapias). MIRA EL REF EN LA BARRA DE
-- DIRECCIONES: hay otro que se llama casi igual.
--
-- POR QUE ESTE ARCHIVO EXISTE, Y NO ES DESCONFIANZA:
--
-- El 16/08/2026 el editor de Supabase dijo "Success" y no habia aplicado nada.
-- Su dialogo de "operaciones destructivas" —el que sale cuando el texto trae
-- `drop`, `revoke` o `alter`— se queda esperando una confirmacion mientras el
-- panel de resultados sigue enseñando el "Success" de la consulta ANTERIOR.
-- Verde en pantalla y cero cambios en la base. Solo se vio preguntandole a la
-- base directamente, que es lo que hace esto.
--
-- El bloque 11 trae `revoke` y `alter table`, asi que ese dialogo VA A SALIR.
-- Hay que darle a "Run" dentro del dialogo, y luego correr esto.
--
-- Cada renglon dice BIEN o MAL. Si hay un solo MAL, no se aprieta el boton de
-- la demostracion todavia: la pantalla fallaria pidiendo algo que no existe.

select 'la tabla del rastro existe' as que,
       case when to_regclass('public.dato_de_demostracion') is not null
            then 'BIEN' else 'MAL' end as como

union all
select 'y tiene sus reglas de fila encendidas y FORZADAS',
       case when (select count(*) from pg_class
                   where relname = 'dato_de_demostracion'
                     and relrowsecurity and relforcerowsecurity) = 1
            then 'BIEN' else 'MAL' end

union all
-- Las reglas de fila RECORTAN; el grant es el permiso de partida. Con politicas
-- y sin grant no se lee ni una fila, y el error sale en la pantalla, no aqui.
--
-- EL RENGLON DICE QUE TIENE, no solo si esta bien: la primera vez salio MAL y
-- "MAL" a secas no decia si faltaba `select` o si sobraba algo. Sobraban tres
-- —truncate, references y trigger— que Supabase le regala a cada tabla nueva.
select 'authenticated sobre la tabla del rastro: ' ||
         coalesce((select string_agg(distinct privilege_type, ', ' order by privilege_type)
                     from information_schema.role_table_grants
                    where table_schema = 'public'
                      and table_name = 'dato_de_demostracion'
                      and grantee = 'authenticated'), 'ninguno'),
       case when (select string_agg(distinct privilege_type, ',' order by privilege_type)
                    from information_schema.role_table_grants
                   where table_schema = 'public'
                     and table_name = 'dato_de_demostracion'
                     and grantee = 'authenticated')
                 = 'SELECT'
            then 'BIEN' else 'MAL: corre ARREGLAR-PERMISOS.sql' end

union all
/*
 * NINGUNA TABLA DEL PRODUCTO LE DA `truncate` A UNA SESION.
 *
 * Es el permiso que Supabase regala y que nadie escribe, y el unico de los
 * siete que las reglas de fila NO pueden recortar: `truncate` no lee ni escribe
 * filas, vacia la tabla. Con el puesto, una sola sentencia dejaria en cero
 * `cliente` o `movimiento_caja` de todos los centros a la vez.
 *
 * Se comprueba aqui —y no solo al crear la tabla— porque el regalo se repite
 * con CADA tabla nueva: la unica defensa es preguntarle a la base.
 */
select 'ninguna tabla le da truncate a anon ni a authenticated (' ||
         (select count(*)::text from information_schema.role_table_grants
           where table_schema = 'public' and privilege_type = 'TRUNCATE'
             and grantee in ('anon', 'authenticated')) || ')',
       case when (select count(*) from information_schema.role_table_grants
                   where table_schema = 'public' and privilege_type = 'TRUNCATE'
                     and grantee in ('anon', 'authenticated')) = 0
            then 'BIEN' else 'MAL: corre ARREGLAR-PERMISOS.sql' end

union all
select 'las tres funciones del bloque estan',
       case when (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public'
                     and p.proname in ('cargar_datos_de_demostracion',
                                       'quitar_datos_de_demostracion',
                                       'datos_de_demostracion')) = 3
            then 'BIEN' else 'MAL' end

union all
select 'y las cuatro de apoyo tambien',
       case when (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'app'
                     and p.proname in ('correo_de_demostracion', 'es_la_cuenta_de_demostracion',
                                       'demo_anotar', 'demo_mover_inventario')) = 4
            then 'BIEN' else 'MAL' end

union all
-- La cuenta tiene que ser LA de la aplicacion. Si aqui sale otra, el boton
-- aparece en la pantalla y la base rechaza la carga: se ve como "no sirve".
select 'la cuenta que puede cargarla es ' || app.correo_de_demostracion(),
       case when app.correo_de_demostracion() = 'cabreraolivojoveth@gmail.com'
            then 'BIEN' else 'MAL' end

union all
select 'las funciones son SECURITY DEFINER, que es lo que las deja sembrar',
       case when (select count(*) from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public'
                     and p.proname in ('cargar_datos_de_demostracion',
                                       'quitar_datos_de_demostracion')
                     and p.prosecdef) = 2
            then 'BIEN' else 'MAL' end

union all
-- Lo ultimo y lo mas importante: que TODAVIA NO haya sembrado nada. Este
-- archivo se corre antes de apretar el boton.
select 'todavia no hay ninguna fila de demostracion (' ||
         (select count(*)::text from dato_de_demostracion) || ')',
       case when (select count(*) from dato_de_demostracion) = 0
            then 'BIEN' else 'ojo: ya hay algo cargado' end;
