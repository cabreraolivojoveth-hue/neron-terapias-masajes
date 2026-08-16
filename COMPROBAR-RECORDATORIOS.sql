-- =====================================================================
-- COMPROBAR-RECORDATORIOS.sql — ¿entró el bloque 7, o no?
-- =====================================================================
--
-- Pegar en Supabase -> SQL Editor -> Run, en el proyecto `hgypobbanvkwnqmepqim`.
-- No cambia nada: solo cuenta.
--
-- POR QUE EXISTE: el editor de Supabase corre el archivo entero como una sola
-- transacción, así que un error al final deshace todo lo de arriba. Pero cuando
-- el error es "ya existe" —como el del índice único que ya tenía dependientes—
-- lo que dice de verdad es que una pasada ANTERIOR sí había entrado. Los dos
-- casos se ven igual desde el editor, y adivinar cuál de los dos es cuesta
-- volver a pegar cinco mil líneas para nada.
--
-- Cada renglón dice qué se esperaba y qué hay. Si los cuatro salen BIEN, no
-- hace falta correr nada más.

select
  'Tablas nuevas'                                  as que,
  '4'                                              as se_esperaban,
  count(*)::text                                   as hay,
  case when count(*) = 4 then 'BIEN' else 'FALTA' end as veredicto
from information_schema.tables
where table_schema = 'public'
  and table_name in ('recordatorio_recurrente', 'recordatorio_evento',
                     'recordatorio_ajustes', 'recordatorio_automatizacion')

union all

select
  'Columnas nuevas de `recordatorio`',
  '10',
  count(*)::text,
  case when count(*) = 10 then 'BIEN' else 'FALTA' end
from information_schema.columns
where table_schema = 'public' and table_name = 'recordatorio'
  and column_name in ('hora', 'notas', 'categoria_id', 'responsable_id',
                      'recurrente_id', 'origen_id', 'automatizacion_id',
                      'anticipacion_min', 'completado_en', 'completado_por')

union all

select
  'Funciones del módulo',
  '17',
  count(*)::text,
  case when count(*) >= 17 then 'BIEN' else 'FALTA' end
from information_schema.routines
where routine_schema = 'public'
  and (routine_name like '%recordatorio%' or routine_name like '%recordatorios%')

union all

-- La que separa los recordatorios de hoy de los vencidos. Sin ella el sitio
-- funciona igual, pero las dos tarjetas nuevas de Inicio salen en cero.
--
-- EL `limit 1` VA DENTRO DE SU PROPIO SUBSELECT, y no es un capricho de estilo:
-- un `limit` al final de un `union all` recorta EL CONJUNTO ENTERO, no la ultima
-- rama. Escrito suelto ahi abajo, esta comprobacion contestaba un solo renglon
-- —"Tablas nuevas: BIEN"— y las otras tres desaparecian sin decir nada. Es la
-- peor forma de fallar para algo que existe justamente para decir la verdad:
-- daba una respuesta corta y tranquilizadora que se leia como si todo estuviera
-- comprobado.
select * from (
  select
    '`resumen_inicio` ya desglosa los vencidos' as que,
    'sí'                                       as se_esperaban,
    case when position('recordatoriosVencidos' in pg_get_functiondef(p.oid)) > 0
         then 'sí' else 'no' end               as hay,
    case when position('recordatoriosVencidos' in pg_get_functiondef(p.oid)) > 0
         then 'BIEN' else 'FALTA' end          as veredicto
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'resumen_inicio'
  limit 1
) u;
