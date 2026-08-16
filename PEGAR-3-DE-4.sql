-- =====================================================================
-- PARTE 3 DE 4 — pegar en Supabase -> SQL Editor -> Run
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
comment on function public.guardar_rol_del_centro(text, text, text, jsonb, boolean) is
  'Crea o cambia un rol y deja rastro. Se niega a tocar `dueno`: ese rol vive con la lista de '
  'permisos vacia a proposito, y escribirsela es como un centro se queda sin nadie que pueda todo.';

revoke all on function public.guardar_rol_del_centro(text, text, text, jsonb, boolean) from public, anon;
grant execute on function public.guardar_rol_del_centro(text, text, text, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 9. INVITAR A ALGUIEN
-- ---------------------------------------------------------------------
create or replace function public.invitar_al_centro(
  p_negocio text,
  p_correo text,
  p_nombre text,
  p_rol text,
  p_permisos jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quien   membresia;
  v_correo  text;
  v_nombre  text;
  v_id      uuid;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para invitar gente a este centro.'
      using errcode = 'insufficient_privilege';
  end if;

  v_correo := lower(nullif(btrim(coalesce(p_correo, '')), ''));
  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_correo is null or position('@' in v_correo) = 0 then
    raise exception 'Escribe un correo valido.' using errcode = 'invalid_parameter_value';
  end if;
  if v_nombre is null then
    raise exception 'Escribe como se llama la persona.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(btrim(p_rol), '') = '' then
    raise exception 'Escoge que rol va a tener.' using errcode = 'invalid_parameter_value';
  end if;

  -- SOLO UN DUEÑO PUEDE NOMBRAR OTRO DUEÑO. Con `gestionarUsuarios` a secas,
  -- quien administra podria invitar a un comodo suyo como dueño y quedarse con
  -- el centro. Subir a alguien a lo mas alto lo hace quien ya esta ahi.
  if p_rol = 'dueno' and not exists (
    select 1 from membresia m
     where m.negocio_id = p_negocio and m.usuario_id = auth.uid() and m.rol = 'dueno'
       and m.activo and not m.eliminado
  ) then
    raise exception 'Solo quien ya es dueño puede nombrar a otro dueño.'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from membresia m
              where m.negocio_id = p_negocio and lower(m.correo) = v_correo and not m.eliminado) then
    raise exception 'Esa persona ya esta en el centro.' using errcode = 'unique_violation';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into invitacion (negocio_id, correo, nombre, rol, permisos, invitado_por)
  values (p_negocio, v_correo, v_nombre, btrim(p_rol), p_permisos, auth.uid())
  -- Volver a invitar al mismo correo ACTUALIZA la invitacion en vez de
  -- reventar: el caso normal es que el primer aviso se perdio y se quiere
  -- reenviar, quiza con otro rol.
  on conflict (negocio_id, lower(correo)) where estado = 'pendiente'
  do update set nombre = excluded.nombre, rol = excluded.rol,
                permisos = excluded.permisos, creada_en = now()
  returning id into v_id;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = p_negocio and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'configuracion', 'invitar', v_id::text, null,
          jsonb_build_object('correo', v_correo, 'rol', btrim(p_rol)));

  return jsonb_build_object('id', v_id, 'correo', v_correo);
end;
$$;

comment on function public.invitar_al_centro(text, text, text, text, jsonb) is
  'Deja la invitacion pendiente. NO crea la cuenta: eso lo hace el proveedor de identidad. La '
  'persona entra con ese correo y la reclama con reclamar_invitaciones().';

revoke all on function public.invitar_al_centro(text, text, text, text, jsonb) from public, anon;
grant execute on function public.invitar_al_centro(text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 10. CANCELAR UNA INVITACION
-- ---------------------------------------------------------------------
create or replace function public.cancelar_invitacion_del_centro(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv invitacion;
begin
  select * into v_inv from invitacion where id = p_id;
  if v_inv.id is null then
    raise exception 'Esa invitacion no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_inv.negocio_id, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para cancelar invitaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Se marca cancelada, no se borra: quien invito a quien y cuando es
  -- justamente lo que hay que poder mirar despues.
  update invitacion set estado = 'cancelada' where id = p_id;
end;
$$;

revoke all on function public.cancelar_invitacion_del_centro(uuid) from public, anon;
grant execute on function public.cancelar_invitacion_del_centro(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 11. RECLAMAR MIS INVITACIONES
-- ---------------------------------------------------------------------
--
-- LA LLAMA QUIEN ACABA DE ENTRAR Y NO PERTENECE A NINGUN CENTRO. Es el unico
-- camino por el que una membresia nace sin que la escriba alguien de adentro,
-- y por eso lo que decide a quien se le da NO es un parametro: es el correo del
-- TOKEN. Si el correo viniera en un argumento, cualquiera se daria de alta en
-- el centro de cualquiera escribiendo el correo del invitado.
--
-- El correo sale de `request.jwt.claims` a mano y no de `auth.email()` para
-- poder atacarla en un Postgres normal, donde ese ayudante de Supabase no
-- existe. Es el mismo dato y la misma fuente.
create or replace function public.reclamar_invitaciones()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_correo text;
  v_yo     uuid;
  v_cuenta int := 0;
  v_inv    invitacion;
begin
  v_yo := auth.uid();
  if v_yo is null then
    raise exception 'Hay que haber entrado para reclamar una invitacion.'
      using errcode = 'insufficient_privilege';
  end if;

  v_correo := lower(nullif(btrim(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'email', '')), ''));

  if v_correo is null then
    return jsonb_build_object('aceptadas', 0, 'centros', '[]'::jsonb);
  end if;

  for v_inv in
    select * from invitacion
     where estado = 'pendiente' and lower(correo) = v_correo
     order by creada_en
  loop
    -- Si ya estaba dentro, la invitacion se cierra igual: dejarla pendiente
    -- para siempre haria que la lista de invitaciones mintiera.
    if not exists (select 1 from membresia m
                    where m.negocio_id = v_inv.negocio_id and m.usuario_id = v_yo) then
      insert into membresia (negocio_id, usuario_id, correo, nombre, rol, permisos, activo)
      values (v_inv.negocio_id, v_yo, v_correo, v_inv.nombre, v_inv.rol, v_inv.permisos, true);
      v_cuenta := v_cuenta + 1;

      insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                             entidad, antes, despues)
      values (v_inv.negocio_id, v_yo, v_inv.nombre,
              coalesce((select r.etiqueta from rol r
                         where r.negocio_id = v_inv.negocio_id and r.id = v_inv.rol),
                       v_inv.rol, 'desconocido'),
              'configuracion', 'aceptar-invitacion', v_inv.id::text, null,
              jsonb_build_object('correo', v_correo, 'rol', v_inv.rol));
    end if;

    update invitacion
       set estado = 'aceptada', aceptada_en = now(), aceptada_por = v_yo
     where id = v_inv.id;
  end loop;

  return jsonb_build_object(
    'aceptadas', v_cuenta,
    'centros', coalesce((select jsonb_agg(n.nombre) from membresia m
                          join negocio n on n.id = m.negocio_id
                         where m.usuario_id = v_yo and m.activo and not m.eliminado), '[]'::jsonb));
end;
$$;

comment on function public.reclamar_invitaciones() is
  'Convierte en membresia las invitaciones al correo DEL TOKEN. El correo jamas viene por '
  'parametro: si viniera, cualquiera se daria de alta en el centro de cualquiera.';

revoke all on function public.reclamar_invitaciones() from public, anon;
grant execute on function public.reclamar_invitaciones() to authenticated;

-- ---------------------------------------------------------------------
-- 12. CAMBIAR EL ROL DE ALGUIEN
-- ---------------------------------------------------------------------
create or replace function public.cambiar_rol_en_el_centro(
  p_membresia uuid,
  p_rol text,
  p_permisos jsonb default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m     membresia;
  v_quien membresia;
begin
  select * into v_m from membresia where id = p_membresia;
  if v_m.id is null then
    raise exception 'Esa persona no esta en ningun centro.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_m.negocio_id, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para cambiar roles.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_rol), '') = '' then
    raise exception 'Escoge un rol.' using errcode = 'invalid_parameter_value';
  end if;

  -- NADIE SE BAJA A SI MISMO. Es la mitad de la proteccion anti-bloqueo: sin
  -- esto, la unica dueña puede cambiarse a "consulta" con un clic y quedarse
  -- fuera de su propio centro sin forma de volver.
  if v_m.usuario_id = auth.uid() then
    raise exception 'No puedes cambiarte el rol a ti misma: es lo que impide quedarte fuera de tu propio centro.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_rol = 'dueno' and not exists (
    select 1 from membresia m
     where m.negocio_id = v_m.negocio_id and m.usuario_id = auth.uid() and m.rol = 'dueno'
       and m.activo and not m.eliminado
  ) then
    raise exception 'Solo quien ya es dueño puede nombrar a otro dueño.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Y EL CENTRO NO SE QUEDA SIN DUEÑO. Bajar al ultimo dejaria un centro donde
  -- nadie puede repartir permisos: no se rompe nada, simplemente ya no hay
  -- forma de arreglarlo desde adentro.
  if v_m.rol = 'dueno' and p_rol <> 'dueno' and (
    select count(*) from membresia m
     where m.negocio_id = v_m.negocio_id and m.rol = 'dueno' and m.activo and not m.eliminado
  ) <= 1 then
    raise exception 'Este centro se quedaria sin dueño. Nombra a otro dueño antes de bajar a este.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_quien from membresia
   where negocio_id = v_m.negocio_id and usuario_id = auth.uid() limit 1;

  update membresia set rol = btrim(p_rol), permisos = p_permisos where id = p_membresia;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (v_m.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_m.negocio_id and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'configuracion', 'cambiar-rol', p_membresia::text,
          jsonb_build_object('rol', v_m.rol, 'permisos', v_m.permisos),
          jsonb_build_object('rol', btrim(p_rol), 'permisos', p_permisos));
end;
$$;

comment on function public.cambiar_rol_en_el_centro(uuid, text, jsonb) is
  'Cambia el rol de otra persona. Nunca el propio, nunca al ultimo dueño, y solo un dueño puede '
  'nombrar a otro: las tres son la proteccion anti-bloqueo, comprobada aqui y no en la pantalla.';

revoke all on function public.cambiar_rol_en_el_centro(uuid, text, jsonb) from public, anon;
grant execute on function public.cambiar_rol_en_el_centro(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 13. ACTIVAR O DAR DE BAJA
-- ---------------------------------------------------------------------
--
-- DAR DE BAJA ES `eliminado`, NO UN DELETE. Es la regla del §9 del bloque 0
-- llevada a las personas: sus ventas, sus movimientos de caja y su rastro en la
-- bitacora tienen que seguir teniendo un nombre. Un renglon menos convierte
-- media historia del centro en "usuario desconocido".
create or replace function public.cambiar_acceso_en_el_centro(
  p_membresia uuid,
  p_activo boolean,
  p_dar_de_baja boolean default false
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m     membresia;
  v_quien membresia;
  v_baja  boolean := coalesce(p_dar_de_baja, false);
  v_act   boolean := coalesce(p_activo, true);
begin
  select * into v_m from membresia where id = p_membresia;
  if v_m.id is null then
    raise exception 'Esa persona no esta en ningun centro.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_m.negocio_id, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para cambiar el acceso de nadie.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_m.usuario_id = auth.uid() then
    raise exception 'No puedes quitarte a ti misma el acceso: es lo que impide quedarte fuera de tu propio centro.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_m.rol = 'dueno' and (v_baja or not v_act) and (
    select count(*) from membresia m
     where m.negocio_id = v_m.negocio_id and m.rol = 'dueno' and m.activo and not m.eliminado
  ) <= 1 then
    raise exception 'Este centro se quedaria sin dueño activo.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_quien from membresia
   where negocio_id = v_m.negocio_id and usuario_id = auth.uid() limit 1;

  update membresia
     set activo = case when v_baja then false else v_act end,
         eliminado = case when v_baja then true else v_m.eliminado end
   where id = p_membresia;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (v_m.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_m.negocio_id and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'configuracion', case when v_baja then 'dar-de-baja' else 'cambiar-acceso' end,
          p_membresia::text,
          jsonb_build_object('activo', v_m.activo, 'eliminado', v_m.eliminado),
          jsonb_build_object('activo', case when v_baja then false else v_act end,
                             'eliminado', case when v_baja then true else v_m.eliminado end));
end;
$$;

comment on function public.cambiar_acceso_en_el_centro(uuid, boolean, boolean) is
  'Activa, desactiva o da de baja. La baja es logica: sus ventas y su rastro en la bitacora '
  'tienen que seguir teniendo un nombre. Nunca sobre uno mismo ni sobre el ultimo dueño.';

revoke all on function public.cambiar_acceso_en_el_centro(uuid, boolean, boolean) from public, anon;
grant execute on function public.cambiar_acceso_en_el_centro(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 14. LA BITACORA — solo se lee
-- ---------------------------------------------------------------------
--
-- ES `security invoker` A PROPOSITO. La politica de `auditoria` ya exige
-- `verAuditoria` para leer, asi que quien no lo tiene recibe una lista vacia
-- SIN QUE ESTA FUNCION HAGA NADA. Es la diferencia que sostiene el modulo: no
-- se le esconde el boton, es que la base no se lo entrega.
create or replace function public.bitacora_del_centro(
  p_negocio text,
  p_modulo text default null,
  p_usuario uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_busqueda text default null,
  p_pagina int default 1,
  p_por_pagina int default 20
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pagina int := greatest(1, coalesce(p_pagina, 1));
  v_cuantas int := least(200, greatest(1, coalesce(p_por_pagina, 20)));
  v_aguja text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_total bigint;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_total
    from auditoria a
   where a.negocio_id = p_negocio
     and (p_modulo is null or a.modulo = p_modulo)
     and (p_usuario is null or a.usuario_id = p_usuario)
     and (p_desde is null or a.ocurrido_en::date >= p_desde)
     and (p_hasta is null or a.ocurrido_en::date <= p_hasta)
     and (v_aguja is null or a.usuario_nombre ilike '%' || v_aguja || '%'
                          or a.accion ilike '%' || v_aguja || '%'
                          or coalesce(a.detalle, '') ilike '%' || v_aguja || '%');

  return jsonb_build_object(
    'total', v_total,
    'pagina', v_pagina,
    'porPagina', v_cuantas,
    'filas', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
                 'id', a.id,
                 'ocurridoEn', a.ocurrido_en,
                 'usuarioId', a.usuario_id,
                 'usuario', a.usuario_nombre,
                 'rol', a.rol_etiqueta,
                 'modulo', a.modulo,
                 'accion', a.accion,
                 'detalle', a.detalle,
                 'entidad', a.entidad,
                 'antes', a.antes,
                 'despues', a.despues,
                 'motivo', a.motivo) as x
          from auditoria a
         where a.negocio_id = p_negocio
           and (p_modulo is null or a.modulo = p_modulo)
           and (p_usuario is null or a.usuario_id = p_usuario)
           and (p_desde is null or a.ocurrido_en::date >= p_desde)
           and (p_hasta is null or a.ocurrido_en::date <= p_hasta)
           and (v_aguja is null or a.usuario_nombre ilike '%' || v_aguja || '%'
                                or a.accion ilike '%' || v_aguja || '%'
                                or coalesce(a.detalle, '') ilike '%' || v_aguja || '%')
         order by a.ocurrido_en desc
         limit v_cuantas offset (v_pagina - 1) * v_cuantas
      ) t), '[]'::jsonb),
    -- LOS MODULOS Y LA GENTE SALEN DE LO QUE HAY, no de una lista escrita. Un
    -- filtro con opciones que no existen en la bitacora deja a quien lo usa
    -- buscando renglones que nunca hubo.
    'modulos', coalesce((
      select jsonb_agg(distinct a.modulo order by a.modulo)
        from auditoria a where a.negocio_id = p_negocio), '[]'::jsonb),
    'gente', coalesce((
      select jsonb_agg(x) from (
        select distinct jsonb_build_object('id', a.usuario_id, 'nombre', a.usuario_nombre) as x
          from auditoria a where a.negocio_id = p_negocio and a.usuario_id is not null
      ) t), '[]'::jsonb));
end;
$$;

comment on function public.bitacora_del_centro is
  'La bitacora, filtrada y paginada en el servidor. security invoker: quien no tiene verAuditoria '
  'recibe una lista vacia porque la base no se la entrega, no porque aqui se le esconda.';
