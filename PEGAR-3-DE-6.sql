-- =====================================================================
-- PARTE 3 DE 6 — pegar en Supabase -> SQL Editor -> Run
-- =====================================================================
--
-- Proyecto: hgypobbanvkwnqmepqim (neron-terapias). MIRA EL REF EN LA BARRA
-- DE DIRECCIONES: hay otro que se llama casi igual.
--
-- Va en orden: 1, luego 2, luego 3. Cada parte corta entre dos sentencias,
-- nunca dentro de una funcion, asi que cada una es SQL valido por si sola.
--
-- Es seguro correrla las veces que haga falta: todo va con `if not exists`
-- o `create or replace`.
--
-- CUANDO ESTA DIGA "Success", SIGUE CON LA PARTE 4.
--
drop policy if exists recordatorio_automatizacion_escribir on recordatorio_automatizacion;
create policy recordatorio_automatizacion_escribir on recordatorio_automatizacion
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarConfiguracion'))
  with check (app.es_miembro(negocio_id)
              and app.tiene_permiso(negocio_id, 'gestionarConfiguracion')
              and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- 7. LAS AYUDAS DE FECHA DE LA RECURRENCIA
-- ---------------------------------------------------------------------

-- Cuando toca la siguiente vez, contando desde una fecha dada.
--
-- EL SEMANAL CON DIAS ESCOGIDOS ES EL UNICO CASO DIFICIL: "lunes y jueves cada
-- semana" no es "sumar 7 dias", es "el proximo dia de la lista, y si ya no
-- queda ninguno esta semana, el primero de la semana que viene mas el
-- intervalo". Resolverlo con una suma de dias produce la trampa clasica: el
-- recordatorio del jueves se convierte en uno del lunes siguiente y el jueves
-- deja de existir.
create or replace function app.siguiente_fecha_de_recordatorio(
  p_frecuencia text,
  p_intervalo int,
  p_dias_semana int[],
  p_desde date
) returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_paso int := greatest(coalesce(p_intervalo, 1), 1);
  v_dia  int;
  v_hoy  int;
  v_mejor int;
begin
  if p_frecuencia = 'diario' then
    return p_desde + v_paso;
  end if;

  if p_frecuencia = 'mensual' then
    return (p_desde + make_interval(months => v_paso))::date;
  end if;

  if p_frecuencia = 'anual' then
    return (p_desde + make_interval(years => v_paso))::date;
  end if;

  -- "Personalizado" es un semanal con dias escogidos: se trata igual.
  if p_frecuencia in ('semanal', 'personalizado') then
    if p_dias_semana is null or array_length(p_dias_semana, 1) is null then
      return p_desde + (7 * v_paso);
    end if;

    v_hoy := extract(isodow from p_desde)::int;
    v_mejor := null;
    foreach v_dia in array p_dias_semana loop
      -- El siguiente dia de la lista DENTRO de esta misma semana.
      if v_dia > v_hoy and (v_mejor is null or v_dia < v_mejor) then v_mejor := v_dia; end if;
    end loop;

    if v_mejor is not null then
      return p_desde + (v_mejor - v_hoy);
    end if;

    -- Ya no queda ninguno esta semana: al primero de la lista, saltando el
    -- intervalo de semanas que pida la regla.
    select min(d) into v_mejor from unnest(p_dias_semana) as d;
    return p_desde + (7 * v_paso) - (v_hoy - v_mejor);
  end if;

  return p_desde + v_paso;
end;
$$;

comment on function app.siguiente_fecha_de_recordatorio(text, int, int[], date) is
  'Cuando toca la siguiente vez. El semanal con dias escogidos no es "sumar 7": es el proximo dia '
  'de la lista, y si ya no queda ninguno, el primero de la semana que viene mas el intervalo.';

-- Un texto listo para comparar: minusculas y sin acentos.
--
-- NO SE USA `unaccent`: es una extension y este proyecto no la tiene instalada.
-- Pedir una extension nueva para una busqueda son permisos de superusuario en
-- Supabase y una dependencia mas que mantener; `translate` resuelve el español
-- entero, es inmutable, y no depende de nada.
--
-- POR QUE IMPORTA: quien teclea "energetica" tiene que encontrar "Energética".
-- Buscar con acentos exactos es una trampa para quien escribe rapido, y en el
-- mostrador se escribe rapido siempre.
create or replace function app.plegar(p_texto text) returns text
language sql
immutable
set search_path = pg_temp
as $$ select translate(lower(coalesce(p_texto, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') $$;

-- Escribe un renglon en el historial con el nombre de quien lo hizo.
create or replace function app.anotar_recordatorio(
  p_negocio text,
  p_recordatorio uuid,
  p_accion text,
  p_antes jsonb,
  p_despues jsonb
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
begin
  select nombre into v_nombre from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() and not eliminado
   limit 1;

  insert into recordatorio_evento
    (negocio_id, recordatorio_id, accion, antes, despues, usuario_id, usuario_nombre)
  values (p_negocio, p_recordatorio, p_accion, p_antes, p_despues, auth.uid(),
          coalesce(v_nombre, 'desconocido'));
end;
$$;

-- Si esta persona puede tocar ESE recordatorio.
--
-- LA REGLA: lo puede modificar quien lo creo, quien es su responsable, y quien
-- administra el centro. NO todo el mundo — un recordatorio que cualquiera puede
-- reasignarse o completar deja de decir quien tenia que hacerlo.
--
-- Y VIVE EN EL SERVIDOR, no en la pantalla. Esconder el boton es cortesia;
-- esto es lo que pasa cuando alguien manda la peticion a mano.
create or replace function app.puede_tocar_recordatorio(p_recordatorio uuid) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
begin
  select * into v_fila from recordatorio where id = p_recordatorio;
  if not found then return false; end if;
  if not app.es_miembro(v_fila.negocio_id) then return false; end if;
  if app.tiene_permiso(v_fila.negocio_id, 'gestionarConfiguracion') then return true; end if;
  if v_fila.creado_por = auth.uid() then return true; end if;
  return exists (
    select 1 from membresia m
     where m.id = v_fila.responsable_id and m.usuario_id = auth.uid() and not m.eliminado
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 8. LEER LA LISTA — con todo resuelto y paginado en el servidor
-- ---------------------------------------------------------------------
--
-- LA PAGINACION ES DEL SERVIDOR, no del navegador. Bajarse los mil doscientos
-- recordatorios de tres años para enseñar diez es lo que hace que la pantalla
-- tarde cinco segundos en abrir el dia que el centro lleva tiempo usandola — y
-- para entonces ya nadie sabe que fue lo que la volvio lenta.
--
-- LOS NOMBRES SE RESUELVEN AQUI, NO SE COPIAN. La categoria, el responsable y
-- el nombre de la entidad relacionada salen de un join en cada lectura. El dia
-- que una paciente se cambie el apellido, todos sus recordatorios lo dicen al
-- dia sin tocar nada.
--
-- "VENCIDO" SE CALCULA, no se guarda. Ver la cabecera del bloque.
create or replace function public.recordatorios_del_centro(
  p_negocio text,
  p_hoy date,
  p_pestana text default 'todos',
  p_busqueda text default null,
  p_categoria uuid default null,
  p_responsable uuid default null,
  p_prioridad text default null,
  p_entidad text default null,
  p_desde date default null,
  p_hasta date default null,
  p_solo_recurrentes boolean default false,
  p_solo_automaticos boolean default false,
  p_orden text default 'urgencia',
  p_desc boolean default false,
  p_pagina int default 1,
  p_por_pagina int default 10
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_tamano int := least(greatest(coalesce(p_por_pagina, 10), 1), 200);
  v_aguja  text := app.plegar(nullif(btrim(coalesce(p_busqueda, '')), ''));
  v_dias   int;
  v_salta  int;
  v_total  bigint;
  v_filas  jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(dias_de_proximos, 7) into v_dias
    from recordatorio_ajustes where negocio_id = p_negocio;
  v_dias := coalesce(v_dias, 7);
  v_salta := (v_pagina - 1) * v_tamano;

  /*
   * UNA SOLA PASADA: se filtra, se cuenta y se recorta la pagina en la misma
   * consulta. Con dos consultas —una para el total y otra para las filas— el
   * `where` se escribe dos veces, y el dia que alguien corrija un filtro en una
   * y no en la otra, el pie dice "de 40" sobre una lista de 12.
   *
   * `count(*) over ()` cuenta lo filtrado ANTES de recortar, y el `filter` del
   * agregado se queda solo con la pagina. Por eso el total sigue siendo bueno
   * aunque la pagina pedida quede vacia.
   */
  with base as (
    select r.id, r.titulo, r.detalle, r.notas, r.fecha, r.hora, r.prioridad, r.estado,
           r.categoria_id, r.responsable_id, r.entidad_tipo, r.entidad_id,
           r.recurrente_id, r.automatizacion_id, r.origen_tipo, r.anticipacion_min,
           r.notificado_en, r.completado_en, r.creado_en, r.actualizado_en,
           c.nombre as categoria, c.color as categoria_color,
           m.nombre as responsable,
           mc.nombre as completado_por,
           mk.nombre as creado_por,
           rr.frecuencia as recurrencia,
           e.nombre as entidad_nombre,
           e.contacto as entidad_contacto,
           (r.estado = 'pendiente' and r.fecha < p_hoy) as vencido
      from recordatorio r
      left join categoria c on c.id = r.categoria_id
      left join membresia m on m.id = r.responsable_id
      left join membresia mc on mc.usuario_id = r.completado_por and mc.negocio_id = r.negocio_id
      left join membresia mk on mk.usuario_id = r.creado_por and mk.negocio_id = r.negocio_id
      left join recordatorio_recurrente rr on rr.id = r.recurrente_id
      /*
       * LA ENTIDAD RELACIONADA SE RESUELVE CON UN LATERAL, no con seis joins.
       * Un recordatorio apunta a UNA cosa; seis left joins traerian cinco nulos
       * por renglon y obligarian a un coalesce de seis niveles para ordenar o
       * buscar por el nombre de lo relacionado.
       *
       * Y SE RESUELVE AL LEER, nunca se copia: el dia que una paciente se
       * cambie el apellido, todos sus recordatorios lo dicen al dia.
       */
      left join lateral (
        select case r.entidad_tipo
                 when 'cliente'  then (select cl.nombre from cliente cl where cl.id = r.entidad_id)
                 when 'cita'     then (select coalesce(cl.nombre, 'Cita') from cita ci
                                        left join cliente cl on cl.id = ci.cliente_id
                                        where ci.id = r.entidad_id)
                 when 'venta'    then (select v.folio from venta v where v.id = r.entidad_id)
                 when 'curso'    then (select cu.nombre from curso cu where cu.id = r.entidad_id)
                 when 'producto' then (select p.nombre from producto p where p.id = r.entidad_id)
                 when 'servicio' then (select s.nombre from servicio s where s.id = r.entidad_id)
                 when 'gasto'    then (select g.descripcion from gasto g where g.id = r.entidad_id)
               end as nombre,
               -- El telefono o el correo, para poder abrirle la conversacion al
               -- paciente desde el recordatorio sin un segundo viaje.
               case r.entidad_tipo
                 when 'cliente' then (select coalesce(cl.telefono, cl.correo) from cliente cl
                                       where cl.id = r.entidad_id)
                 when 'cita'    then (select coalesce(cl.telefono, cl.correo) from cita ci
                                       left join cliente cl on cl.id = ci.cliente_id
                                       where ci.id = r.entidad_id)
               end as contacto
      ) e on true
     where r.negocio_id = p_negocio
       and not r.eliminado
       and (p_pestana <> 'pendientes'  or r.estado = 'pendiente')
       and (p_pestana <> 'hoy'         or (r.estado = 'pendiente' and r.fecha = p_hoy))
       and (p_pestana <> 'proximos'    or (r.estado = 'pendiente'
                                           and r.fecha > p_hoy and r.fecha <= p_hoy + v_dias))
       and (p_pestana <> 'completados' or r.estado = 'hecho')
       and (p_pestana <> 'vencidos'    or (r.estado = 'pendiente' and r.fecha < p_hoy))
       and (p_pestana <> 'cancelados'  or r.estado = 'descartado')
       and (p_categoria is null   or r.categoria_id = p_categoria)
       and (p_responsable is null or r.responsable_id = p_responsable)
       and (p_prioridad is null   or r.prioridad = p_prioridad)
       and (p_entidad is null     or r.entidad_tipo = p_entidad)
       and (p_desde is null       or r.fecha >= p_desde)
       and (p_hasta is null       or r.fecha <= p_hasta)
       and (not coalesce(p_solo_recurrentes, false) or r.recurrente_id is not null)
       and (not coalesce(p_solo_automaticos, false) or r.automatizacion_id is not null)
       /*
        * LA BUSQUEDA MIRA TAMBIEN LO RELACIONADO. Buscar el apellido de una
        * paciente tiene que encontrar el recordatorio que habla de ella aunque
        * su nombre no este escrito en el titulo — y no lo esta nunca, porque
        * los nombres no se copian.
        */
       and (v_aguja is null or (
              app.plegar(r.titulo) like '%' || v_aguja || '%'
           or app.plegar(r.detalle) like '%' || v_aguja || '%'
           or app.plegar(r.notas) like '%' || v_aguja || '%'
           or app.plegar(c.nombre) like '%' || v_aguja || '%'
           or app.plegar(m.nombre) like '%' || v_aguja || '%'
           or app.plegar(e.nombre) like '%' || v_aguja || '%'
         ))
  ),
  contado as (
    select b.*,
           count(*) over () as cuantos,
           row_number() over (order by
             /*
              * EL ORDEN POR OMISION ES POR URGENCIA, no por fecha a secas:
              * primero lo vencido, luego lo de hoy, luego lo proximo y al final
              * lo ya cerrado. Ordenar solo por fecha pone arriba del todo lo que
              * se completo hace tres meses.
              */
             case when p_orden = 'urgencia' then
               case when b.estado <> 'pendiente' then 3
                    when b.fecha < p_hoy then 0
                    when b.fecha = p_hoy then 1
                    else 2 end
             end asc nulls last,
             case when p_orden = 'prioridad' then
               case b.prioridad when 'urgente' then 0 when 'alta' then 1
                                when 'normal' then 2 else 3 end
             end asc nulls last,
             case when p_orden = 'estado' then b.estado end asc nulls last,
             case when p_orden = 'responsable' then lower(coalesce(b.responsable, 'zzzz')) end
               asc nulls last,
             case when p_orden = 'creacion' and coalesce(p_desc, false) then b.creado_en end
               desc nulls last,
             case when p_orden = 'creacion' and not coalesce(p_desc, false) then b.creado_en end
               asc nulls last,
             case when coalesce(p_desc, false) then b.fecha end desc nulls last,
             case when not coalesce(p_desc, false) then b.fecha end asc nulls last,
             b.hora asc nulls last,
             -- A igual dia y hora, lo capturado antes va antes. Sin este ultimo
             -- desempate el orden baila entre paginas y la fila que ibas a tocar
             -- se mueve sola.
             b.creado_en asc
           ) as n
      from base b
  )
  select coalesce(max(cuantos), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'titulo', titulo, 'detalle', detalle, 'notas', notas,
           'fecha', fecha, 'hora', hora, 'prioridad', prioridad, 'estado', estado,
           'vencido', vencido,
           'categoriaId', categoria_id, 'categoria', categoria, 'categoriaColor', categoria_color,
           'responsableId', responsable_id, 'responsable', responsable,
           'entidadTipo', entidad_tipo, 'entidadId', entidad_id,
           'entidadNombre', entidad_nombre, 'entidadContacto', entidad_contacto,
           'recurrenteId', recurrente_id, 'recurrencia', recurrencia,
           'automatizacionId', automatizacion_id, 'origenTipo', origen_tipo,
           'anticipacionMin', anticipacion_min, 'notificadoEn', notificado_en,
           'completadoEn', completado_en, 'completadoPor', completado_por,
           'creadoPor', creado_por, 'creadoEn', creado_en, 'actualizadoEn', actualizado_en
         ) order by n) filter (where n > v_salta and n <= v_salta + v_tamano), '[]'::jsonb)
    into v_total, v_filas
    from contado;

  return jsonb_build_object(
    'total', v_total,
    'pagina', v_pagina,
    'porPagina', v_tamano,
    'filas', v_filas
  );
end;
$$;

comment on function public.recordatorios_del_centro(text, date, text, text, uuid, uuid, text, text, date, date, boolean, boolean, text, boolean, int, int) is
  'La lista con todo resuelto y paginada EN EL SERVIDOR, en una sola pasada. Los nombres se '
  'resuelven al leer; "vencido" se calcula, nunca se guarda.';

grant execute on function public.recordatorios_del_centro(text, date, text, text, uuid, uuid, text, text, date, date, boolean, boolean, text, boolean, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 9. EL RESUMEN — las cuatro cifras, la dona y los proximos, en un viaje
-- ---------------------------------------------------------------------
--
-- UN VIAJE Y NO SEIS. Las cuatro tarjetas de arriba, la dona del costado, la
-- lista de proximos y las metricas de cumplimiento salen de la misma tabla; una
-- consulta por tarjeta serian seis viajes cada vez que alguien abre la
-- pantalla.
--
-- LAS METRICAS DE CUMPLIMIENTO SOLO SE MANDAN SI HAY CON QUE. Un "0% de
-- cumplimiento" cuando no se ha completado nada todavia no es un dato: es un
-- reproche inventado. Se manda `null` y la pantalla no pinta la tarjeta.
create or replace function public.resumen_de_recordatorios(
  p_negocio text,
  p_hoy date
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_dias        int;
  v_mes         date := date_trunc('month', p_hoy)::date;
  v_cerrados    bigint;
  v_horas       numeric;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(dias_de_proximos, 7) into v_dias
    from recordatorio_ajustes where negocio_id = p_negocio;
  v_dias := coalesce(v_dias, 7);

  select count(*), avg(extract(epoch from (completado_en - creado_en)) / 3600.0)
    into v_cerrados, v_horas
    from recordatorio
   where negocio_id = p_negocio and not eliminado and estado = 'hecho'
     and completado_en is not null and completado_en >= v_mes;

  return jsonb_build_object(
    'diasDeProximos', v_dias,
    'pendientes', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente'),
    'hoy', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha = p_hoy),
    'vencidos', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha < p_hoy),
    'proximos', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente'
         and fecha > p_hoy and fecha <= p_hoy + v_dias),
    -- "Completados: este mes", igual que dice el diseño. Un total historico
    -- solo sube y a los dos años deja de significar nada.
    'completados', v_cerrados,
    'cancelados', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'descartado'),
    'total', (
      select count(*) from recordatorio where negocio_id = p_negocio and not eliminado),
    -- SIN NADA CERRADO NO HAY PROMEDIO. Se manda null; la pantalla no inventa
    -- un cero que se leeria como "todo se resuelve al instante".
    'horasPromedio', case when v_cerrados = 0 then null else round(v_horas, 1) end,
    'porCategoria', (
      select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', c.id, 'nombre', coalesce(c.nombre, 'Sin categoría'), 'color', c.color,
                 'cuantos', count(*),
                 'hechos', count(*) filter (where r.estado = 'hecho')) as x
          from recordatorio r
          left join categoria c on c.id = r.categoria_id
         where r.negocio_id = p_negocio and not r.eliminado
         group by c.id, c.nombre, c.color
      ) t),
    'porResponsable', (
      select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', m.id, 'nombre', coalesce(m.nombre, 'Sin responsable'),
                 'cuantos', count(*),
                 'hechos', count(*) filter (where r.estado = 'hecho'),
                 'vencidos', count(*) filter (where r.estado = 'pendiente' and r.fecha < p_hoy)) as x
          from recordatorio r
          left join membresia m on m.id = r.responsable_id
         where r.negocio_id = p_negocio and not r.eliminado
         group by m.id, m.nombre
      ) t),
    -- LOS PROXIMOS DEL COSTADO. Ordenados por FECHA y no por prioridad: uno
    -- urgente para dentro de tres semanas no es lo que hay que hacer hoy.
    'proximosRecordatorios', (
      select coalesce(jsonb_agg(x order by (x->>'fecha')::date, x->>'hora' nulls last), '[]'::jsonb)
        from (
          select jsonb_build_object(
                   'id', r.id, 'titulo', r.titulo, 'fecha', r.fecha, 'hora', r.hora,
                   'prioridad', r.prioridad,
                   'entidadTipo', r.entidad_tipo,
                   'entidadNombre', case r.entidad_tipo
                     when 'cliente'  then (select cl.nombre from cliente cl where cl.id = r.entidad_id)
                     when 'cita'     then (select coalesce(cl.nombre, 'Cita') from cita ci
                                            left join cliente cl on cl.id = ci.cliente_id
                                            where ci.id = r.entidad_id)
                     when 'venta'    then (select v.folio from venta v where v.id = r.entidad_id)
                     when 'curso'    then (select cu.nombre from curso cu where cu.id = r.entidad_id)
                     when 'producto' then (select p.nombre from producto p where p.id = r.entidad_id)
                     when 'servicio' then (select s.nombre from servicio s where s.id = r.entidad_id)
                     when 'gasto'    then (select g.descripcion from gasto g where g.id = r.entidad_id)
                   end,
                   'categoria', c.nombre,
                   'vencido', r.fecha < p_hoy) as x
            from recordatorio r
            left join categoria c on c.id = r.categoria_id
           where r.negocio_id = p_negocio and not r.eliminado and r.estado = 'pendiente'
           order by r.fecha, r.hora nulls last
           limit 5
        ) t),
    'consejo', (select consejo from recordatorio_ajustes where negocio_id = p_negocio)
  );
end;
$$;
