-- =====================================================================
-- REVISAR REPORTES — TODO EN UNA SOLA CONSULTA
-- =====================================================================
--
-- POR QUE UNA SOLA Y NO CINCO: el editor de Supabase enseña el resultado de
-- la ULTIMA consulta que corre, no de todas. Con cinco selects seguidos solo
-- se ve el de abajo y los otros cuatro se pierden — que es justo lo que
-- acaba de pasar.
--
-- Pegar entero y correr. No cambia nada: solo pregunta.
--
-- TIENEN QUE SALIR SIETE RENGLONES, todos con "sí". El primero que diga "NO"
-- es la causa, y el texto de al lado dice que significa.

select * from (
  values
    (1, 'la función del reporte',
        case when to_regprocedure('public.reporte_del_periodo(text,date,date,text,text,uuid)') is null
             then 'NO — no se creó: el archivo abortó antes de llegar aquí'
             else 'sí' end),

    (2, 'la puede llamar quien entra',
        case when to_regprocedure('public.reporte_del_periodo(text,date,date,text,text,uuid)') is null
             then 'NO — no existe la función'
             when has_function_privilege('authenticated',
                  'public.reporte_del_periodo(text,date,date,text,text,uuid)', 'execute')
             then 'sí'
             else 'NO — falta el grant execute to authenticated' end),

    (3, 'la función auxiliar del esquema app',
        case when to_regprocedure('app.paso_de_la_serie(date,date)') is null
             then 'NO — falta app.paso_de_la_serie'
             else 'sí' end),

    (4, 'la tabla de reportes guardados',
        case when to_regclass('public.reporte_guardado') is null
             then 'NO — falta la tabla reporte_guardado'
             else 'sí' end),

    (5, 'las otras tres funciones de reportes',
        case when to_regprocedure('public.reportes_guardados(text)') is null
              or to_regprocedure('public.guardar_reporte(text,text,text,date,date,jsonb)') is null
              or to_regprocedure('public.borrar_reporte(uuid)') is null
             then 'NO — el archivo se cortó a mitad del bloque de reportes'
             else 'sí' end),

    (6, 'el buscador de ventas encuentra por vendedor',
        case when to_regprocedure(
                    'public.ventas_del_rango(text,date,date,text,text,uuid,uuid,text,int,int)') is null
             then 'NO — no existe ventas_del_rango'
             when (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'ventas_del_rango' limit 1)
                  like '%m.nombre ilike%'
             then 'sí'
             else 'NO — quedó la versión vieja, sin buscar por vendedor' end),

    (7, 'estás en el proyecto correcto',
        case when current_database() is not null
             then 'proyecto: ' || coalesce(current_setting('app.settings.project_ref', true),
                                           current_database())
             else '?' end)
) as t(orden, que, resultado)
order by orden;

-- Y de paso, que la API relea la lista de funciones. Es inofensivo.
-- (No devuelve nada; por eso va al final y no tapa el resultado de arriba.)
notify pgrst, 'reload schema';
