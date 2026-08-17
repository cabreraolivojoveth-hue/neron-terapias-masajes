-- =====================================================================
-- ARREGLAR-PERMISOS.sql — el "MAL" de la comprobacion, y de donde salio
-- =====================================================================
--
-- Pegar en Supabase -> SQL Editor -> Run. Proyecto `hgypobbanvkwnqmepqim`
-- (neron-terapias). MIRA EL REF EN LA BARRA DE DIRECCIONES.
--
-- QUE PASO:
--
-- `COMPROBAR-DEMOSTRACION.sql` dijo MAL en "authenticated puede LEERLA y nada
-- mas". No es que falte el permiso de leer: es que SOBRAN otros.
--
-- Supabase trae puesto un `alter default privileges in schema public grant all
-- on tables to anon, authenticated, service_role`. "All" son SIETE permisos, no
-- cuatro: insert, select, update, delete, **truncate**, references y trigger.
-- Cada tabla que se crea nace con los siete, diga lo que diga el archivo
-- despues. El bloque 11 quitaba tres —insert, update y delete— y se quedaban
-- dentro los otros.
--
-- POR QUE NO ES UN DETALLE: **las reglas de fila NO se aplican a `truncate`**.
-- Estan escritas para recortar que filas se leen y se escriben; `truncate` no
-- lee ni escribe filas, vacia la tabla entera. Con ese permiso puesto, una sola
-- sentencia dejaria en cero `cliente`, `venta` o `movimiento_caja` de TODOS los
-- centros, y ninguna politica diria nada.
--
-- No hay ninguna puerta abierta hoy —PostgREST no manda `truncate` y nadie de
-- fuera tiene conexion directa con el rol `authenticated`—, pero es un permiso
-- que sobra, y los permisos que sobran son los que se vuelven agujero el dia
-- que cambia otra cosa.
--
-- Esto ya esta corregido en `INSTALAR-EN-TERAPIAS.sql` para las instalaciones
-- nuevas. Este archivo es para la base que ya corrio.

-- ---------------------------------------------------------------------
-- 1. QUE TIENE AHORA MISMO — se mira antes de tocar nada
-- ---------------------------------------------------------------------
select 'ANTES' as cuando,
       table_name as tabla,
       string_agg(distinct privilege_type, ', ' order by privilege_type) as tiene_authenticated
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee = 'authenticated'
   and table_name in ('dato_de_demostracion', 'invitacion', 'cliente', 'venta')
 group by table_name
 order by table_name;

-- ---------------------------------------------------------------------
-- 2. LA TABLA DEL RASTRO: se revoca TODO y despues se da `select`
-- ---------------------------------------------------------------------
--
-- En ese orden, que es el unico que funciona: quitar permisos por nombre deja
-- dentro los que no se nombraron, y son siete.
revoke all on dato_de_demostracion from anon;
revoke all on dato_de_demostracion from authenticated;
grant select on dato_de_demostracion to authenticated;

-- ---------------------------------------------------------------------
-- 3. `invitacion` tenia lo mismo, y por la misma razon
-- ---------------------------------------------------------------------
revoke all on invitacion from anon;
revoke all on invitacion from authenticated;
grant select on invitacion to authenticated;

-- ---------------------------------------------------------------------
-- 4. Y LAS DEMAS TABLAS DEL PRODUCTO
-- ---------------------------------------------------------------------
--
-- Se quitan SOLO los tres que nadie usa. `select`, `insert`, `update` y
-- `delete` se quedan exactamente como los dejo cada bloque, con sus reglas de
-- fila mordiendo encima: esto no cambia nada de lo que el sistema puede hacer.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. COMO QUEDO — la misma consulta de arriba
-- ---------------------------------------------------------------------
select 'DESPUES' as cuando,
       table_name as tabla,
       string_agg(distinct privilege_type, ', ' order by privilege_type) as tiene_authenticated
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee = 'authenticated'
   and table_name in ('dato_de_demostracion', 'invitacion', 'cliente', 'venta')
 group by table_name
 order by table_name;

-- Tiene que quedar asi:
--
--   dato_de_demostracion  SELECT
--   invitacion            SELECT
--   cliente               DELETE, INSERT, SELECT, UPDATE
--   venta                 DELETE, INSERT, SELECT, UPDATE
--
-- Y ninguna con TRUNCATE. Despues de esto, vuelve a correr
-- COMPROBAR-DEMOSTRACION.sql: los ocho renglones tienen que decir BIEN.
