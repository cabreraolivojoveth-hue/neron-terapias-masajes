-- =====================================================================
-- PARTE 3 DE 5 — pegar en Supabase -> SQL Editor -> Run
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

comment on function public.resumen_de_recordatorios(text, date) is
  'Las cuatro cifras, la dona, los proximos y el cumplimiento en UN viaje. El promedio y el '
  'cumplimiento van en null cuando no hay con que calcularlos: un 0% inventado es un reproche.';

grant execute on function public.resumen_de_recordatorios(text, date) to authenticated;

-- ---------------------------------------------------------------------
-- 10. GUARDAR — el alta y la edicion son la MISMA entidad
-- ---------------------------------------------------------------------
--
-- EDITAR NO CREA UNO NUEVO. Es la misma fila, y por eso el historial de un
-- recordatorio se puede leer de principio a fin. La alternativa —anular y
-- encadenar, como hace Gastos— tiene sentido cuando hay dinero de por medio y
-- el registro no se puede tocar; aqui solo produciria tres copias de la misma
-- tarea en la lista.
create or replace function public.guardar_recordatorio(
  p_negocio text,
  p_id uuid,
  p_titulo text,
  p_fecha date,
  p_detalle text default null,
  p_hora time default null,
  p_prioridad text default 'normal',
  p_categoria uuid default null,
  p_responsable uuid default null,
  p_entidad_tipo text default null,
  p_entidad_id uuid default null,
  p_notas text default null,
  p_anticipacion int default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_antes  jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  -- LAS MISMAS VALIDACIONES QUE LA PANTALLA, aqui otra vez. La pantalla valida
  -- para decirlo bien y a tiempo; esto valida para que sea verdad aunque
  -- alguien mande la peticion a mano.
  if v_titulo = '' then
    raise exception 'El recordatorio necesita un título.' using errcode = 'check_violation';
  end if;
  if length(v_titulo) > 160 then
    raise exception 'El título no puede pasar de 160 letras.' using errcode = 'check_violation';
  end if;
  if p_fecha is null then
    raise exception 'El recordatorio necesita una fecha.' using errcode = 'check_violation';
  end if;
  -- UNA ENTIDAD A MEDIAS NO SE GUARDA. Un `entidad_tipo` sin `entidad_id` deja
  -- un renglon que dice "relacionado con una cita" y no puede abrir ninguna.
  if (p_entidad_tipo is null) <> (p_entidad_id is null) then
    raise exception 'La relación necesita el tipo y el registro, o ninguno de los dos.'
      using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into recordatorio (negocio_id, titulo, detalle, fecha, hora, prioridad, categoria_id,
                              responsable_id, entidad_tipo, entidad_id, notas, anticipacion_min,
                              creado_por, estado)
    values (p_negocio, v_titulo, nullif(btrim(coalesce(p_detalle, '')), ''), p_fecha, p_hora,
            coalesce(p_prioridad, 'normal'), p_categoria, p_responsable, p_entidad_tipo,
            p_entidad_id, nullif(btrim(coalesce(p_notas, '')), ''), p_anticipacion,
            auth.uid(), 'pendiente')
    returning id into v_id;

    perform app.anotar_recordatorio(p_negocio, v_id, 'creado', null,
      jsonb_build_object('titulo', v_titulo, 'fecha', p_fecha, 'prioridad', p_prioridad));
    return v_id;
  end if;

  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo. Solo quien lo creó, su responsable o quien '
                    'administra el centro pueden cambiarlo.' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object('titulo', titulo, 'fecha', fecha, 'hora', hora,
                            'prioridad', prioridad, 'categoriaId', categoria_id,
                            'responsableId', responsable_id)
    into v_antes
    from recordatorio where id = p_id and negocio_id = p_negocio;

  if v_antes is null then
    raise exception 'Ese recordatorio no existe en este centro.' using errcode = 'no_data_found';
  end if;

  update recordatorio
     set titulo = v_titulo,
         detalle = nullif(btrim(coalesce(p_detalle, '')), ''),
         fecha = p_fecha,
         hora = p_hora,
         prioridad = coalesce(p_prioridad, 'normal'),
         categoria_id = p_categoria,
         responsable_id = p_responsable,
         entidad_tipo = p_entidad_tipo,
         entidad_id = p_entidad_id,
         notas = nullif(btrim(coalesce(p_notas, '')), ''),
         anticipacion_min = p_anticipacion,
         -- CAMBIAR LA FECHA O LA HORA VUELVE A ARMAR EL AVISO. Sin esto, mover
         -- un recordatorio a la semana que viene lo dejaria marcado como ya
         -- avisado y no volveria a sonar.
         notificado_en = case when p_fecha is distinct from (v_antes->>'fecha')::date
                                or p_hora is distinct from (v_antes->>'hora')::time
                              then null else notificado_en end,
         actualizado_en = now(),
         actualizado_por = auth.uid()
   where id = p_id and negocio_id = p_negocio;

  perform app.anotar_recordatorio(p_negocio, p_id, 'editado', v_antes,
    jsonb_build_object('titulo', v_titulo, 'fecha', p_fecha, 'hora', p_hora,
                       'prioridad', p_prioridad, 'categoriaId', p_categoria,
                       'responsableId', p_responsable));
  return p_id;
end;
$$;

comment on function public.guardar_recordatorio(text, uuid, text, date, text, time, text, uuid, uuid, text, uuid, text, int) is
  'Alta y edicion de la MISMA entidad. Editar no crea uno nuevo: es la misma fila, y por eso su '
  'historial se puede leer entero.';

grant execute on function public.guardar_recordatorio(text, uuid, text, date, text, time, text, uuid, uuid, text, uuid, text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 11. COMPLETAR Y REABRIR — y la siguiente vuelta de la recurrencia
-- ---------------------------------------------------------------------
--
-- COMPLETAR UN RECURRENTE NO MATA LA RECURRENCIA. Es el error clasico: se marca
-- hecho "confirmar caja del lunes" y la regla desaparece con el, asi que el
-- lunes siguiente no avisa nadie. Aqui, al cerrar uno que viene de una regla,
-- se programa la siguiente ocurrencia en el mismo acto — y si ya existe, el
-- indice unico la descarta sin ruido.
create or replace function public.completar_recordatorio(
  p_id uuid,
  p_hecho boolean default true
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila     recordatorio;
  v_regla    recordatorio_recurrente;
  v_proxima  date;
  v_nuevo    uuid;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo. Solo quien lo creó, su responsable o quien '
                    'administra el centro pueden cerrarlo.' using errcode = 'insufficient_privilege';
  end if;

  if p_hecho then
    update recordatorio
       set estado = 'hecho', completado_en = now(), completado_por = auth.uid(),
           actualizado_en = now(), actualizado_por = auth.uid()
     where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'completado',
      jsonb_build_object('estado', v_fila.estado), jsonb_build_object('estado', 'hecho'));
  else
    -- REABRIR LIMPIA LA MARCA DE COMPLETADO. Dejarla puesta haria que las
    -- metricas de "completados este mes" contaran uno que esta abierto.
    update recordatorio
       set estado = 'pendiente', completado_en = null, completado_por = null,
           notificado_en = null, actualizado_en = now(), actualizado_por = auth.uid()
     where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'reabierto',
      jsonb_build_object('estado', v_fila.estado), jsonb_build_object('estado', 'pendiente'));
    return null;
  end if;

  if v_fila.recurrente_id is null then return null; end if;

  select * into v_regla from recordatorio_recurrente
   where id = v_fila.recurrente_id and estado = 'activo' and not eliminado;
  if not found then return null; end if;

  v_proxima := app.siguiente_fecha_de_recordatorio(
    v_regla.frecuencia, v_regla.intervalo, v_regla.dias_semana, v_fila.fecha);

  -- Los dos topes de una regla: la fecha final y el numero de repeticiones.
  if v_regla.fecha_fin is not null and v_proxima > v_regla.fecha_fin then
    update recordatorio_recurrente set estado = 'finalizado', actualizado_en = now()
     where id = v_regla.id;
    return null;
  end if;
  if v_regla.repeticiones is not null and v_regla.generados >= v_regla.repeticiones then
    update recordatorio_recurrente set estado = 'finalizado', actualizado_en = now()
     where id = v_regla.id;
    return null;
  end if;

  insert into recordatorio (negocio_id, titulo, detalle, notas, fecha, hora, prioridad,
                            categoria_id, responsable_id, entidad_tipo, entidad_id,
                            anticipacion_min, recurrente_id, creado_por, estado)
  values (v_regla.negocio_id, v_regla.titulo, v_regla.detalle, v_regla.notas, v_proxima,
          v_regla.hora, v_regla.prioridad, v_regla.categoria_id, v_regla.responsable_id,
          v_regla.entidad_tipo, v_regla.entidad_id, v_regla.anticipacion_min,
          v_regla.id, v_regla.creado_por, 'pendiente')
  -- Si otra pestaña ya la creo, esta se descarta sola. La unicidad la pone el
  -- indice, no esta funcion.
  on conflict do nothing
  returning id into v_nuevo;

  update recordatorio_recurrente
     set proxima_fecha = v_proxima,
         generados = generados + case when v_nuevo is null then 0 else 1 end,
         actualizado_en = now()
   where id = v_regla.id;

  if v_nuevo is not null then
    perform app.anotar_recordatorio(v_regla.negocio_id, v_nuevo, 'programado', null,
      jsonb_build_object('fecha', v_proxima, 'recurrenteId', v_regla.id));
  end if;
  return v_nuevo;
end;
$$;

comment on function public.completar_recordatorio(uuid, boolean) is
  'Completar y reabrir. Completar uno recurrente PROGRAMA LA SIGUIENTE VUELTA en el mismo acto: '
  'sin eso, cerrar el del lunes mataria la regla y el lunes siguiente no avisaria nadie.';

grant execute on function public.completar_recordatorio(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 12. POSPONER, AJUSTAR, CANCELAR, DUPLICAR Y ELIMINAR
-- ---------------------------------------------------------------------

-- POSPONER MUEVE LA FECHA DE VERDAD Y LO ANOTA. Un "posponer" que solo esconde
-- el renglon un rato es la funcion que mas rapido destruye la confianza en una
-- lista de pendientes: al dia siguiente vuelve a aparecer y nadie sabe si se
-- movio o no.
create or replace function public.posponer_recordatorio(
  p_id uuid,
  p_fecha date,
  p_hora time default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if p_fecha is null then
    raise exception 'Posponer necesita una fecha nueva.' using errcode = 'check_violation';
  end if;
  if v_fila.estado <> 'pendiente' then
    raise exception 'Solo se pospone lo que sigue pendiente.' using errcode = 'check_violation';
  end if;

  update recordatorio
     set fecha = p_fecha,
         hora = coalesce(p_hora, hora),
         -- Vuelve a armarse el aviso: si no, un recordatorio ya avisado que se
         -- pospone a mañana no volveria a sonar nunca.
         notificado_en = null,
         actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_id;

  perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'pospuesto',
    jsonb_build_object('fecha', v_fila.fecha, 'hora', v_fila.hora),
    jsonb_build_object('fecha', p_fecha, 'hora', coalesce(p_hora, v_fila.hora)));
end;
$$;

grant execute on function public.posponer_recordatorio(uuid, date, time) to authenticated;

-- Cambia UNA cosa y anota cual. Es lo que usan las opciones rapidas del menu
-- de tres puntos: reasignar, subir la prioridad, mover de categoria.
--
-- UN DISCRIMINADOR Y NO CUATRO PARAMETROS OPCIONALES, porque `null` es un valor
-- legitimo en los tres campos: "sin responsable" y "no me lo toques" no se
-- pueden distinguir si los dos llegan como null.
create or replace function public.ajustar_recordatorio(
  p_id uuid,
  p_que text,
  p_valor text
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
  v_antes jsonb;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo.' using errcode = 'insufficient_privilege';
  end if;

  if p_que = 'responsable' then
    v_antes := jsonb_build_object('responsableId', v_fila.responsable_id);
    update recordatorio set responsable_id = nullif(p_valor, '')::uuid,
           actualizado_en = now(), actualizado_por = auth.uid() where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'reasignado', v_antes,
      jsonb_build_object('responsableId', nullif(p_valor, '')));

  elsif p_que = 'prioridad' then
    if p_valor not in ('baja', 'normal', 'alta', 'urgente') then
      raise exception 'Esa prioridad no existe.' using errcode = 'check_violation';
    end if;
    v_antes := jsonb_build_object('prioridad', v_fila.prioridad);
    update recordatorio set prioridad = p_valor,
           actualizado_en = now(), actualizado_por = auth.uid() where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'prioridad', v_antes,
      jsonb_build_object('prioridad', p_valor));

  elsif p_que = 'categoria' then
    v_antes := jsonb_build_object('categoriaId', v_fila.categoria_id);
    update recordatorio set categoria_id = nullif(p_valor, '')::uuid,
           actualizado_en = now(), actualizado_por = auth.uid() where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'categoria', v_antes,
      jsonb_build_object('categoriaId', nullif(p_valor, '')));

  elsif p_que = 'avisado' then
    -- La pantalla marca que YA aviso, para no repetir la notificacion cada vez
    -- que alguien recarga. No lleva historial: no es una decision de nadie.
    update recordatorio set notificado_en = now() where id = p_id;

  else
    raise exception 'No se puede ajustar "%".', p_que using errcode = 'check_violation';
  end if;
end;
$$;
