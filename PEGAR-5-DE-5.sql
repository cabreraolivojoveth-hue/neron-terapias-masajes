-- =====================================================================
-- PARTE 5 DE 5 — pegar en Supabase -> SQL Editor -> Run
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
-- ESTA ES LA ULTIMA. Con esta ya esta todo.
--
grant execute on function public.guardar_ajustes_de_recordatorios(text, boolean, int, time, boolean, boolean, int, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 16. LAS AUTOMATIZACIONES
-- ---------------------------------------------------------------------
create or replace function public.automatizaciones_de_recordatorios(p_negocio text) returns jsonb
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
             'id', a.id, 'evento', a.evento, 'activa', a.activa,
             'plantillaTitulo', a.plantilla_titulo, 'plantillaDetalle', a.plantilla_detalle,
             'diasAntes', a.dias_antes, 'hora', a.hora, 'prioridad', a.prioridad,
             'categoriaId', a.categoria_id, 'categoria', c.nombre,
             'responsableId', a.responsable_id, 'responsable', m.nombre,
             'creados', (select count(*) from recordatorio r
                          where r.automatizacion_id = a.id and not r.eliminado))
           order by a.evento)
      from recordatorio_automatizacion a
      left join categoria c on c.id = a.categoria_id
      left join membresia m on m.id = a.responsable_id
     where a.negocio_id = p_negocio and not a.eliminado
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.automatizaciones_de_recordatorios(text) to authenticated;

create or replace function public.guardar_automatizacion_de_recordatorios(
  p_negocio text,
  p_evento text,
  p_activa boolean,
  p_titulo text,
  p_detalle text default null,
  p_dias_antes int default 1,
  p_hora time default null,
  p_prioridad text default 'normal',
  p_categoria uuid default null,
  p_responsable uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'Encender una automatización le crea recordatorios a todo el centro y pide '
                    'permiso de configuración.' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'La automatización necesita el título del recordatorio que va a crear.'
      using errcode = 'check_violation';
  end if;

  insert into recordatorio_automatizacion
    (negocio_id, evento, activa, plantilla_titulo, plantilla_detalle, dias_antes, hora,
     prioridad, categoria_id, responsable_id)
  values (p_negocio, p_evento, coalesce(p_activa, false), btrim(p_titulo),
          nullif(btrim(coalesce(p_detalle, '')), ''), coalesce(p_dias_antes, 1), p_hora,
          coalesce(p_prioridad, 'normal'), p_categoria, p_responsable)
  on conflict (negocio_id, evento) do update
    set activa = excluded.activa,
        plantilla_titulo = excluded.plantilla_titulo,
        plantilla_detalle = excluded.plantilla_detalle,
        dias_antes = excluded.dias_antes,
        hora = excluded.hora,
        prioridad = excluded.prioridad,
        categoria_id = excluded.categoria_id,
        responsable_id = excluded.responsable_id,
        eliminado = false,
        actualizado_en = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.guardar_automatizacion_de_recordatorios(text, text, boolean, text, text, int, time, text, uuid, uuid) to authenticated;

-- Aplica las reglas ENCENDIDAS y devuelve cuantos recordatorios nacieron.
--
-- NO CREA NADA SI NO HAY REGLAS. Es lo primero que comprueba, y es la razon de
-- que se pueda llamar al abrir la pantalla sin miedo: un centro que no ha
-- configurado nada no ve aparecer ni un renglon.
--
-- LOS DUPLICADOS LOS IMPIDE EL INDICE `recordatorio_origen_unico`, no este
-- codigo. Por eso da igual cuantas veces se llame ni desde cuantas pestañas.
create or replace function public.generar_recordatorios_automaticos(
  p_negocio text,
  p_hoy date default current_date
) returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_regla   recordatorio_automatizacion;
  v_creados int := 0;
  v_nuevo   uuid;
  v_origen  record;
  v_titulo  text;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  for v_regla in
    select * from recordatorio_automatizacion
     where negocio_id = p_negocio and activa and not eliminado
  loop
    for v_origen in
      select * from (
        -- CITA NUEVA: una por cita futura que siga viva. Las canceladas no
        -- entran; recordar confirmar una cita cancelada es el aviso falso que
        -- enseña a ignorar los avisos.
        select 'cita'::text as tipo, ci.id, coalesce(cl.nombre, 'la cita') as nombre,
               (ci.fecha - v_regla.dias_antes) as cuando
          from cita ci
          left join cliente cl on cl.id = ci.cliente_id
         where v_regla.evento = 'cita_nueva' and ci.negocio_id = p_negocio and not ci.eliminado
           and ci.fecha >= p_hoy and ci.estado in ('pendiente', 'confirmada')
        union all
        -- CLIENTE NUEVO: seguimiento a quien se dio de alta en los ultimos
        -- treinta dias. Mas atras no: dar seguimiento a alguien que llego hace
        -- medio año no es seguimiento, es una lista vieja de golpe.
        select 'cliente', cl.id, cl.nombre, (cl.creado_en::date + v_regla.dias_antes)
          from cliente cl
         where v_regla.evento = 'cliente_nuevo' and cl.negocio_id = p_negocio and not cl.eliminado
           and cl.creado_en::date >= p_hoy - 30
        union all
        -- VENTA PENDIENTE: los borradores con antigüedad. Una venta cobrada no
        -- necesita seguimiento y una cancelada tampoco.
        select 'venta', v.id, v.folio, (v.fecha + v_regla.dias_antes)
          from venta v
         where v_regla.evento = 'venta_pendiente' and v.negocio_id = p_negocio and not v.eliminado
           and v.estado = 'borrador' and v.fecha >= p_hoy - 90
        union all
        -- STOCK BAJO: producto activo en o por debajo de su minimo.
        select 'producto', p.id, p.nombre, p_hoy
          from producto p
         where v_regla.evento = 'stock_bajo' and p.negocio_id = p_negocio and not p.eliminado
           and p.activo and p.stock_actual <= p.stock_minimo
        union all
        -- CURSO PROXIMO: los que arrancan dentro de la ventana configurada.
        select 'curso', cu.id, cu.nombre, (cu.fecha_inicio - v_regla.dias_antes)
          from curso cu
         where v_regla.evento = 'curso_proximo' and cu.negocio_id = p_negocio and not cu.eliminado
           and cu.fecha_inicio >= p_hoy and cu.estado in ('programado', 'en_curso')
      ) o
    loop
      -- {nombre} y {fecha} se sustituyen con lo que la fila diga AHORA. El
      -- texto resultante se guarda porque es el titulo del recordatorio, no un
      -- dato del cliente: si esa persona se renombra, el vinculo sigue
      -- llevando a su ficha con el nombre al dia.
      v_titulo := replace(replace(v_regla.plantilla_titulo, '{nombre}', coalesce(v_origen.nombre, '')),
                          '{fecha}', to_char(v_origen.cuando, 'DD/MM/YYYY'));

      insert into recordatorio (negocio_id, titulo, detalle, fecha, hora, prioridad,
                                categoria_id, responsable_id, entidad_tipo, entidad_id,
                                origen_tipo, origen_id, automatizacion_id, creado_por, estado)
      values (p_negocio, left(btrim(v_titulo), 160), v_regla.plantilla_detalle,
              greatest(v_origen.cuando, p_hoy), v_regla.hora, v_regla.prioridad,
              v_regla.categoria_id, v_regla.responsable_id, v_origen.tipo, v_origen.id,
              v_regla.evento, v_origen.id, v_regla.id, auth.uid(), 'pendiente')
      on conflict do nothing
      returning id into v_nuevo;

      if v_nuevo is not null then
        v_creados := v_creados + 1;
        perform app.anotar_recordatorio(p_negocio, v_nuevo, 'automatico', null,
          jsonb_build_object('evento', v_regla.evento, 'automatizacionId', v_regla.id));
      end if;
      v_nuevo := null;
    end loop;

    -- EL STOCK QUE SE RESURTIO APAGA SU AVISO. Sin esto, "Reponer aceites"
    -- seguiria en la lista despues de haberlos repuesto, y una lista con cosas
    -- ya resueltas deja de leerse. Se marca `descartado`, no se borra: el hueco
    -- del indice se libera igual y queda el rastro de que llego a hacer falta.
    if v_regla.evento = 'stock_bajo' then
      update recordatorio r
         set estado = 'descartado', actualizado_en = now()
       where r.negocio_id = p_negocio and r.automatizacion_id = v_regla.id
         and r.estado = 'pendiente' and not r.eliminado
         and exists (select 1 from producto p
                      where p.id = r.origen_id and p.stock_actual > p.stock_minimo);
    end if;
  end loop;

  return v_creados;
end;
$$;

comment on function public.generar_recordatorios_automaticos(text, date) is
  'Aplica las reglas ENCENDIDAS. Sin reglas no crea nada, por eso se puede llamar al abrir la '
  'pantalla. Los duplicados los impide el indice recordatorio_origen_unico, no esta funcion.';

grant execute on function public.generar_recordatorios_automaticos(text, date) to authenticated;

-- ---------------------------------------------------------------------
-- 17. LO QUE REPORTES LE PREGUNTA A RECORDATORIOS
-- ---------------------------------------------------------------------
--
-- REPORTES NO CUENTA POR SU CUENTA. Si tuviera su propia consulta contra la
-- tabla, el dia que aqui cambie que significa "vencido" —o que los descartados
-- no cuentan— las dos pantallas dirian cifras distintas del mismo mes y nadie
-- sabria cual creer. Se pregunta aqui, y aqui esta la definicion.
create or replace function public.cumplimiento_de_recordatorios(
  p_negocio text,
  p_desde date,
  p_hasta date,
  p_hoy date default current_date
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_creados   bigint;
  v_hechos    bigint;
  v_horas     numeric;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_creados
    from recordatorio
   where negocio_id = p_negocio and not eliminado and creado_en::date between p_desde and p_hasta;

  select count(*), avg(extract(epoch from (completado_en - creado_en)) / 3600.0)
    into v_hechos, v_horas
    from recordatorio
   where negocio_id = p_negocio and not eliminado and estado = 'hecho'
     and completado_en is not null and completado_en::date between p_desde and p_hasta;

  return jsonb_build_object(
    'creados', v_creados,
    'completados', v_hechos,
    'pendientes', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente'
         and fecha between p_desde and p_hasta),
    'vencidos', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente'
         and fecha < p_hoy and fecha between p_desde and p_hasta),
    'cancelados', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'descartado'
         and fecha between p_desde and p_hasta),
    -- SIN NADA CREADO NO HAY PORCENTAJE. Dividir entre cero da un error, y
    -- rellenarlo con cero diria "0% de cumplimiento" de un mes sin trabajo.
    'cumplimiento', case when v_creados = 0 then null
                         else round(100.0 * v_hechos / v_creados, 1) end,
    'horasPromedio', case when v_hechos = 0 then null else round(v_horas, 1) end,
    'porResponsable', (
      select coalesce(jsonb_agg(x order by (x->>'cuantos')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'nombre', coalesce(m.nombre, 'Sin responsable'),
                 'cuantos', count(*),
                 'hechos', count(*) filter (where r.estado = 'hecho'),
                 'vencidos', count(*) filter (where r.estado = 'pendiente' and r.fecha < p_hoy)) as x
          from recordatorio r
          left join membresia m on m.id = r.responsable_id
         where r.negocio_id = p_negocio and not r.eliminado
           and r.fecha between p_desde and p_hasta
         group by m.nombre
      ) t),
    'porCategoria', (
      select coalesce(jsonb_agg(x order by (x->>'cuantos')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'nombre', coalesce(c.nombre, 'Sin categoría'),
                 'color', c.color,
                 'cuantos', count(*),
                 'hechos', count(*) filter (where r.estado = 'hecho')) as x
          from recordatorio r
          left join categoria c on c.id = r.categoria_id
         where r.negocio_id = p_negocio and not r.eliminado
           and r.fecha between p_desde and p_hasta
         group by c.nombre, c.color
      ) t)
  );
end;
$$;

grant execute on function public.cumplimiento_de_recordatorios(text, date, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 18. LOS PERMISOS DE TABLA DE LO NUEVO
-- ---------------------------------------------------------------------
--
-- Otra vez la distincion que costo un "permission denied" en produccion: las
-- reglas de fila RECORTAN, el `grant` es lo que da el permiso de partida. Una
-- tabla con politicas y sin grant no deja leer NI UNA fila, y el error no sale
-- al instalar: sale la primera vez que alguien abre la pantalla. Lo vigila la
-- guardia 18.
--
-- `anon` no toca nada: aqui hay nombres de pacientes resueltos y notas del
-- centro.
revoke all on recordatorio_recurrente, recordatorio_evento, recordatorio_ajustes,
              recordatorio_automatizacion
  from anon;

grant select, insert, update on recordatorio_recurrente, recordatorio_ajustes,
              recordatorio_automatizacion
  to authenticated;

-- El historial se escribe y se lee; no se corrige. Sin `update` ni `delete`,
-- igual que la caja: lo que paso, paso.
grant select, insert on recordatorio_evento to authenticated;

