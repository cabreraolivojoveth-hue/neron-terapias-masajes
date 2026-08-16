-- =====================================================================
-- PARTE 4 DE 5 — pegar en Supabase -> SQL Editor -> Run
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
-- CUANDO ESTA DIGA "Success", SIGUE CON LA PARTE 5.
--
grant execute on function public.ajustar_recordatorio(uuid, text, text) to authenticated;

-- CANCELAR NO ES COMPLETAR, y son dos cosas distintas para el negocio: una se
-- hizo y la otra ya no aplica. Contarlas juntas convertiria "27 completados"
-- en un numero que nadie puede usar.
create or replace function public.cancelar_recordatorio(
  p_id uuid,
  p_motivo text default null
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

  update recordatorio
     set estado = 'descartado', actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_id;

  perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'cancelado',
    jsonb_build_object('estado', v_fila.estado),
    jsonb_build_object('estado', 'descartado', 'motivo', nullif(btrim(coalesce(p_motivo, '')), '')));
end;
$$;

grant execute on function public.cancelar_recordatorio(uuid, text) to authenticated;

-- ELIMINAR ES MARCAR, NUNCA BORRAR. La regla 9 del bloque 0 vale igual aqui:
-- el historial de por que nadie confirmo aquella cita se pierde entero si la
-- fila desaparece. Y ademas libera el hueco del indice de origen, que es la
-- forma de decirle a una automatizacion "vuelve a avisarme de esto".
create or replace function public.eliminar_recordatorio(p_id uuid) returns void
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

  -- El renglon del historial va ANTES del borrado logico: despues, la fila ya
  -- no cuenta como visible y el rastro quedaria sin su ultimo paso.
  perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'eliminado',
    jsonb_build_object('titulo', v_fila.titulo, 'estado', v_fila.estado), null);

  update recordatorio set eliminado = true, actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_id;
end;
$$;

grant execute on function public.eliminar_recordatorio(uuid) to authenticated;

-- DUPLICAR CREA OTRA ENTIDAD, con su propio id y su propio historial. Lo que NO
-- se copia es el estado ni la recurrencia: una copia nace pendiente y suelta,
-- porque copiar la regla dejaria dos reglas generando el mismo recordatorio.
create or replace function public.duplicar_recordatorio(p_id uuid, p_fecha date default null)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila  recordatorio;
  v_nuevo uuid;
begin
  select * into v_fila from recordatorio where id = p_id and not eliminado;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.es_miembro(v_fila.negocio_id) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  insert into recordatorio (negocio_id, titulo, detalle, notas, fecha, hora, prioridad,
                            categoria_id, responsable_id, entidad_tipo, entidad_id,
                            anticipacion_min, creado_por, estado)
  values (v_fila.negocio_id, left(v_fila.titulo || ' (copia)', 160), v_fila.detalle, v_fila.notas,
          coalesce(p_fecha, v_fila.fecha), v_fila.hora, v_fila.prioridad, v_fila.categoria_id,
          v_fila.responsable_id, v_fila.entidad_tipo, v_fila.entidad_id, v_fila.anticipacion_min,
          auth.uid(), 'pendiente')
  returning id into v_nuevo;

  perform app.anotar_recordatorio(v_fila.negocio_id, v_nuevo, 'creado', null,
    jsonb_build_object('duplicadoDe', p_id));
  return v_nuevo;
end;
$$;

grant execute on function public.duplicar_recordatorio(uuid, date) to authenticated;

-- El rastro de un recordatorio, del mas reciente al mas viejo.
create or replace function public.historial_del_recordatorio(p_id uuid)
returns table (
  id uuid, accion text, antes jsonb, despues jsonb, usuario text, creado_en timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return query
    select e.id, e.accion, e.antes, e.despues, e.usuario_nombre, e.creado_en
      from recordatorio_evento e
     where e.recordatorio_id = p_id
     order by e.creado_en desc, e.id desc
     limit 100;
end;
$$;

grant execute on function public.historial_del_recordatorio(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 13. LOS RECORDATORIOS DE UNA ENTIDAD — lo que leen los demas modulos
-- ---------------------------------------------------------------------
--
-- ESTA ES LA MITAD DE LA CONEXION QUE CASI SIEMPRE FALTA. Poder abrir el
-- paciente desde el recordatorio es facil; poder ver los recordatorios desde el
-- expediente del paciente es lo que hace que el modulo sirva. Sin esto, quien
-- abre una ficha no tiene forma de saber que hay algo pendiente con esa persona.
create or replace function public.recordatorios_de_la_entidad(
  p_negocio text,
  p_tipo text,
  p_entidad uuid,
  p_incluir_cerrados boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'titulo', r.titulo, 'detalle', r.detalle, 'fecha', r.fecha,
             'hora', r.hora, 'prioridad', r.prioridad, 'estado', r.estado,
             'categoria', c.nombre, 'responsable', m.nombre)
           order by r.estado, r.fecha, r.hora nulls last)
      from recordatorio r
      left join categoria c on c.id = r.categoria_id
      left join membresia m on m.id = r.responsable_id
     where r.negocio_id = p_negocio and not r.eliminado
       and r.entidad_tipo = p_tipo and r.entidad_id = p_entidad
       and (p_incluir_cerrados or r.estado = 'pendiente')
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.recordatorios_de_la_entidad(text, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 14. LA RECURRENCIA — guardar la regla y generar lo que ya tocaba
-- ---------------------------------------------------------------------
create or replace function public.guardar_recordatorio_recurrente(
  p_negocio text,
  p_id uuid,
  p_titulo text,
  p_frecuencia text,
  p_fecha_inicio date,
  p_detalle text default null,
  p_notas text default null,
  p_hora time default null,
  p_prioridad text default 'normal',
  p_categoria uuid default null,
  p_responsable uuid default null,
  p_entidad_tipo text default null,
  p_entidad_id uuid default null,
  p_intervalo int default 1,
  p_dias_semana int[] default null,
  p_fecha_fin date default null,
  p_repeticiones int default null,
  p_anticipacion int default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_titulo text := btrim(coalesce(p_titulo, ''));
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if v_titulo = '' then
    raise exception 'El recordatorio necesita un título.' using errcode = 'check_violation';
  end if;
  if p_fecha_inicio is null then
    raise exception 'La repetición necesita una fecha de inicio.' using errcode = 'check_violation';
  end if;
  if p_fecha_fin is not null and p_fecha_fin < p_fecha_inicio then
    raise exception 'La repetición no puede terminar antes de empezar.'
      using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into recordatorio_recurrente
      (negocio_id, titulo, detalle, notas, hora, prioridad, categoria_id, responsable_id,
       entidad_tipo, entidad_id, anticipacion_min, frecuencia, intervalo, dias_semana,
       fecha_inicio, fecha_fin, repeticiones, proxima_fecha, creado_por)
    values (p_negocio, v_titulo, nullif(btrim(coalesce(p_detalle, '')), ''),
            nullif(btrim(coalesce(p_notas, '')), ''), p_hora, coalesce(p_prioridad, 'normal'),
            p_categoria, p_responsable, p_entidad_tipo, p_entidad_id, p_anticipacion,
            p_frecuencia, greatest(coalesce(p_intervalo, 1), 1), p_dias_semana,
            p_fecha_inicio, p_fecha_fin, p_repeticiones,
            -- LA PRIMERA VEZ ES LA FECHA DE INICIO, no la siguiente. Saltarse la
            -- primera ocurrencia es el fallo que hace que una regla creada hoy
            -- para hoy no genere nada y parezca rota.
            p_fecha_inicio, auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  update recordatorio_recurrente
     set titulo = v_titulo,
         detalle = nullif(btrim(coalesce(p_detalle, '')), ''),
         notas = nullif(btrim(coalesce(p_notas, '')), ''),
         hora = p_hora,
         prioridad = coalesce(p_prioridad, 'normal'),
         categoria_id = p_categoria,
         responsable_id = p_responsable,
         entidad_tipo = p_entidad_tipo,
         entidad_id = p_entidad_id,
         anticipacion_min = p_anticipacion,
         frecuencia = p_frecuencia,
         intervalo = greatest(coalesce(p_intervalo, 1), 1),
         dias_semana = p_dias_semana,
         fecha_inicio = p_fecha_inicio,
         fecha_fin = p_fecha_fin,
         repeticiones = p_repeticiones,
         -- La proxima nunca retrocede por debajo del inicio nuevo.
         proxima_fecha = greatest(proxima_fecha, p_fecha_inicio),
         actualizado_en = now()
   where id = p_id and negocio_id = p_negocio;
  return p_id;
end;
$$;

grant execute on function public.guardar_recordatorio_recurrente(text, uuid, text, text, date, text, text, time, text, uuid, uuid, text, uuid, int, int[], date, int, int) to authenticated;

create or replace function public.marcar_recordatorio_recurrente(p_id uuid, p_estado text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_estado not in ('activo', 'pausado', 'finalizado') then
    raise exception 'Ese estado no existe para una repetición.' using errcode = 'check_violation';
  end if;
  update recordatorio_recurrente set estado = p_estado, actualizado_en = now() where id = p_id;
end;
$$;

grant execute on function public.marcar_recordatorio_recurrente(uuid, text) to authenticated;

create or replace function public.recordatorios_recurrentes_del_centro(p_negocio text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', rr.id, 'titulo', rr.titulo, 'detalle', rr.detalle, 'notas', rr.notas,
             'hora', rr.hora, 'prioridad', rr.prioridad,
             'categoriaId', rr.categoria_id, 'categoria', c.nombre,
             'responsableId', rr.responsable_id, 'responsable', m.nombre,
             'entidadTipo', rr.entidad_tipo, 'entidadId', rr.entidad_id,
             'frecuencia', rr.frecuencia, 'intervalo', rr.intervalo,
             'diasSemana', rr.dias_semana,
             'fechaInicio', rr.fecha_inicio, 'fechaFin', rr.fecha_fin,
             'repeticiones', rr.repeticiones, 'generados', rr.generados,
             'proximaFecha', rr.proxima_fecha, 'estado', rr.estado,
             'anticipacionMin', rr.anticipacion_min)
           order by rr.estado, rr.proxima_fecha)
      from recordatorio_recurrente rr
      left join categoria c on c.id = rr.categoria_id
      left join membresia m on m.id = rr.responsable_id
     where rr.negocio_id = p_negocio and not rr.eliminado
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.recordatorios_recurrentes_del_centro(text) to authenticated;

-- Crea las ocurrencias que ya tocaban.
--
-- SE PUEDE LLAMAR CUANTAS VECES SE QUIERA, y por eso se llama al abrir la
-- pantalla y no hace falta un proceso aparte. La unicidad no la pone esta
-- llamada: la pone el indice `(recurrente_id, fecha)`. Diez pestañas abiertas a
-- la vez no pueden crear dos veces el recordatorio del lunes.
--
-- SE GENERA HASTA HOY Y NO MAS ALLA. Adelantar la agenda entera del año
-- llenaria la lista de cosas que nadie tiene que mirar todavia; el limite de
-- vueltas evita ademas que una regla mal guardada cuelgue la peticion.
create or replace function public.generar_recordatorios_recurrentes(
  p_negocio text,
  p_hoy date default current_date
) returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_regla   recordatorio_recurrente;
  v_fecha   date;
  v_creados int := 0;
  v_nuevo   uuid;
  v_vueltas int;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  for v_regla in
    select * from recordatorio_recurrente
     where negocio_id = p_negocio and estado = 'activo' and not eliminado
       and proxima_fecha <= p_hoy
  loop
    v_fecha := greatest(v_regla.proxima_fecha, v_regla.fecha_inicio);
    v_vueltas := 0;

    while v_fecha <= p_hoy and v_vueltas < 400 loop
      v_vueltas := v_vueltas + 1;

      exit when v_regla.fecha_fin is not null and v_fecha > v_regla.fecha_fin;
      exit when v_regla.repeticiones is not null
                and v_regla.generados + v_creados >= v_regla.repeticiones;

      insert into recordatorio (negocio_id, titulo, detalle, notas, fecha, hora, prioridad,
                                categoria_id, responsable_id, entidad_tipo, entidad_id,
                                anticipacion_min, recurrente_id, creado_por, estado)
      values (v_regla.negocio_id, v_regla.titulo, v_regla.detalle, v_regla.notas, v_fecha,
              v_regla.hora, v_regla.prioridad, v_regla.categoria_id, v_regla.responsable_id,
              v_regla.entidad_tipo, v_regla.entidad_id, v_regla.anticipacion_min,
              v_regla.id, v_regla.creado_por, 'pendiente')
      on conflict do nothing
      returning id into v_nuevo;

      if v_nuevo is not null then
        v_creados := v_creados + 1;
        perform app.anotar_recordatorio(v_regla.negocio_id, v_nuevo, 'programado', null,
          jsonb_build_object('fecha', v_fecha, 'recurrenteId', v_regla.id));
      end if;
      v_nuevo := null;

      v_fecha := app.siguiente_fecha_de_recordatorio(
        v_regla.frecuencia, v_regla.intervalo, v_regla.dias_semana, v_fecha);
    end loop;

    update recordatorio_recurrente
       set proxima_fecha = v_fecha,
           generados = generados + v_creados,
           estado = case
             when fecha_fin is not null and v_fecha > fecha_fin then 'finalizado'
             when repeticiones is not null and generados + v_creados >= repeticiones then 'finalizado'
             else estado end,
           actualizado_en = now()
     where id = v_regla.id;
  end loop;

  return v_creados;
end;
$$;

comment on function public.generar_recordatorios_recurrentes(text, date) is
  'Crea lo que ya tocaba. Idempotente por el indice (recurrente_id, fecha), no por esta funcion: '
  'diez pestañas abiertas no pueden crear dos veces el recordatorio del lunes.';

grant execute on function public.generar_recordatorios_recurrentes(text, date) to authenticated;

-- ---------------------------------------------------------------------
-- 15. LA CONFIGURACION DEL MODULO
-- ---------------------------------------------------------------------
create or replace function public.ajustes_de_recordatorios(p_negocio text) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
           'avisarEnNavegador', a.avisar_en_navegador,
           'anticipacionMin', a.anticipacion_min,
           'horaPorOmision', a.hora_por_omision,
           'avisarAlResponsable', a.avisar_al_responsable,
           'avisarAlReasignar', a.avisar_al_reasignar,
           'diasDeProximos', a.dias_de_proximos,
           'ordenPorOmision', a.orden_por_omision,
           'consejo', a.consejo)
    into v
    from recordatorio_ajustes a where a.negocio_id = p_negocio;

  -- SIN FILA SE DEVUELVEN LOS VALORES DE ARRANQUE, no un nulo. Que la pantalla
  -- tenga que saber que hacer con "todavia no configuraron nada" es como
  -- terminan dos juegos de valores por omision distintos, uno aqui y otro alla.
  return coalesce(v, jsonb_build_object(
    'avisarEnNavegador', false,
    'anticipacionMin', 30,
    'horaPorOmision', '09:00',
    'avisarAlResponsable', true,
    'avisarAlReasignar', true,
    'diasDeProximos', 7,
    'ordenPorOmision', 'urgencia',
    'consejo', null));
end;
$$;

grant execute on function public.ajustes_de_recordatorios(text) to authenticated;

create or replace function public.guardar_ajustes_de_recordatorios(
  p_negocio text,
  p_avisar_navegador boolean,
  p_anticipacion int,
  p_hora_por_omision time,
  p_avisar_responsable boolean,
  p_avisar_reasignar boolean,
  p_dias_proximos int,
  p_orden text,
  p_consejo text default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'Configurar Recordatorios le cambia el comportamiento a todo el centro y pide '
                    'permiso de configuración.' using errcode = 'insufficient_privilege';
  end if;

  insert into recordatorio_ajustes
    (negocio_id, avisar_en_navegador, anticipacion_min, hora_por_omision,
     avisar_al_responsable, avisar_al_reasignar, dias_de_proximos, orden_por_omision,
     consejo, actualizado_en, actualizado_por)
  values (p_negocio, coalesce(p_avisar_navegador, false), coalesce(p_anticipacion, 30),
          coalesce(p_hora_por_omision, '09:00'), coalesce(p_avisar_responsable, true),
          coalesce(p_avisar_reasignar, true), coalesce(p_dias_proximos, 7),
          coalesce(p_orden, 'urgencia'), nullif(btrim(coalesce(p_consejo, '')), ''),
          now(), auth.uid())
  on conflict (negocio_id) do update
    set avisar_en_navegador = excluded.avisar_en_navegador,
        anticipacion_min = excluded.anticipacion_min,
        hora_por_omision = excluded.hora_por_omision,
        avisar_al_responsable = excluded.avisar_al_responsable,
        avisar_al_reasignar = excluded.avisar_al_reasignar,
        dias_de_proximos = excluded.dias_de_proximos,
        orden_por_omision = excluded.orden_por_omision,
        consejo = excluded.consejo,
        actualizado_en = now(),
        actualizado_por = auth.uid();
end;
$$;
