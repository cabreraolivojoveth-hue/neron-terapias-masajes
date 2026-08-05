-- =====================================================================
--  COMPROBACION DE NERON TERAPIAS
--
--  Se pega en el SQL Editor de Supabase DESPUES del instalador.
--  Cada renglon dice BIEN o MAL. Si algo dice MAL, no se sigue.
--
--  No comprueba que el codigo "parezca" correcto: comprueba el estado real
--  de la base de datos — que las reglas esten encendidas, forzadas, con sus
--  politicas puestas, y que las llaves que impiden mezclar centros existan.
-- =====================================================================

with esperadas(tabla) as (
  values ('cliente'),('servicio'),('curso'),('producto'),('cita'),('venta'),
         ('venta_item'),('pago'),('gasto'),('movimiento_caja'),('inscripcion'),('recordatorio')
)

select '1. Las doce tablas del producto existen' as comprueba,
       case when count(*) = 12 then 'BIEN' else 'MAL — faltan ' || (12 - count(*)) end as resultado,
       count(*)::text || ' de 12' as detalle
from pg_tables t join esperadas e on e.tabla = t.tablename
where t.schemaname = 'public'

union all
select '2. Todas tienen reglas de fila ENCENDIDAS',
       case when count(*) = 12 then 'BIEN' else 'MAL — sin reglas: ' || (12 - count(*))::text end,
       count(*)::text || ' de 12'
from pg_class c join esperadas e on e.tabla = c.relname
where c.relrowsecurity

union all
select '3. Y FORZADAS (que tambien apliquen al dueño de la tabla)',
       case when count(*) = 12 then 'BIEN' else 'MAL — sin forzar: ' || (12 - count(*))::text end,
       count(*)::text || ' de 12'
from pg_class c join esperadas e on e.tabla = c.relname
where c.relforcerowsecurity

union all
select '4. Ninguna tabla se quedo sin al menos una politica',
       case when count(*) = 12 then 'BIEN' else 'MAL — sin politicas: ' || (12 - count(*))::text end,
       count(*)::text || ' de 12'
from (select tablename from pg_policies where schemaname='public' group by tablename) p
join esperadas e on e.tabla = p.tablename

union all
select '5. El visitante SIN SESION no tiene ni un permiso',
       case when count(*) = 0 then 'BIEN' else 'MAL — anon puede tocar ' || count(*)::text end,
       coalesce(string_agg(distinct table_name, ', '), 'ninguna')
from information_schema.role_table_grants g join esperadas e on e.tabla = g.table_name
where g.grantee = 'anon'

union all
select '6. La caja no se puede EDITAR ni BORRAR, por nadie',
       case when count(*) = 0 then 'BIEN' else 'MAL — ' || string_agg(grantee || ':' || privilege_type, ', ') end,
       'update/delete sobre movimiento_caja'
from information_schema.role_table_grants
where table_name = 'movimiento_caja' and privilege_type in ('UPDATE','DELETE')
  and grantee in ('authenticated','anon','service_role')

union all
select '7. Las llaves que impiden mezclar dos centros estan puestas',
       case when count(*) >= 11 then 'BIEN' else 'MAL — solo ' || count(*)::text || ' de 11' end,
       count(*)::text || ' llaves compuestas'
from pg_constraint where conname like '%mismo_negocio'

union all
select '8. Las operaciones que la base hace sola existen',
       case when count(*) = 8 then 'BIEN' else 'MAL — faltan ' || (8 - count(*))::text end,
       coalesce(string_agg(proname, ', ' order by proname), 'ninguna')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('cobrar_venta','cancelar_venta','siguiente_folio','resumen_inicio',
                                           'citas_del_rango','historial_del_cliente','reagendar_cita','cambiar_estado_cita')

union all
select '14. La agenda NO deja encimar dos citas del mismo profesional',
       case when count(*) = 1 then 'BIEN' else 'MAL — falta la restriccion de exclusion' end,
       'cita_sin_choque — es lo unico que aguanta dos personas guardando a la vez'
from pg_constraint where conname = 'cita_sin_choque'

union all
select '15. Reagendar y cambiar estado corren con permisos elevados',
       case when count(*) = 2 then 'BIEN' else 'MAL — no son definer' end,
       count(*)::text || ' de 2'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('reagendar_cita','cambiar_estado_cita') and p.prosecdef

union all
select '16. La agenda se lee con los permisos de quien pregunta',
       case when count(*) = 2 then 'BIEN' else 'MAL — son definer y se saltarian los permisos' end,
       'citas_del_rango e historial_del_cliente deben ser security invoker'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('citas_del_rango','historial_del_cliente') and not p.prosecdef

union all
select '9. Cobrar y cancelar corren con permisos elevados (security definer)',
       case when count(*) = 2 then 'BIEN' else 'MAL — no son definer' end,
       count(*)::text || ' de 2'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('cobrar_venta','cancelar_venta') and p.prosecdef

union all
select '10. El resumen del tablero NO — corre con los permisos de quien llama',
       case when count(*) = 1 then 'BIEN' else 'MAL — es definer y se saltaria los permisos' end,
       'resumen_inicio debe ser security invoker'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname = 'resumen_inicio' and not p.prosecdef

union all
select '11. Los gastos alimentan la caja solos (disparador puesto)',
       case when count(*) = 2 then 'BIEN' else 'MAL — falta el disparador' end,
       count(*)::text || ' de 2'
from pg_trigger where tgname in ('gasto_a_caja_insert','gasto_a_caja_update')

union all
select '12. Una venta no puede tener dos ingresos en caja',
       case when count(*) = 1 then 'BIEN' else 'MAL — falta el indice unico' end,
       'movimiento_caja_unico_por_origen'
from pg_indexes where indexname = 'movimiento_caja_unico_por_origen'

union all
select '13. La base @neron/base esta instalada debajo',
       case when count(*) = 3 then 'BIEN' else 'MAL — falta correr INSTALAR-EN-SUPABASE.sql primero' end,
       count(*)::text || ' de 3 funciones app.*'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='app' and p.proname in ('es_miembro','tiene_permiso','licencia_permite')

order by 1;
