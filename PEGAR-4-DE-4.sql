-- =====================================================================
-- PARTE 4 DE 4 — pegar en Supabase -> SQL Editor -> Run
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
grant execute on function public.bitacora_del_centro(text, text, uuid, date, date, text, int, int)
  to authenticated;

-- ---------------------------------------------------------------------
-- 15. LA ACTIVIDAD RECIENTE — las tres ultimas del costado
-- ---------------------------------------------------------------------
create or replace function public.actividad_reciente_del_centro(p_negocio text, p_cuantas int default 3)
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
    select jsonb_agg(x) from (
      select jsonb_build_object(
               'id', a.id,
               'ocurridoEn', a.ocurrido_en,
               'usuario', a.usuario_nombre,
               'modulo', a.modulo,
               'accion', a.accion,
               'entidad', a.entidad) as x
        from auditoria a
       where a.negocio_id = p_negocio
       order by a.ocurrido_en desc
       limit least(20, greatest(1, coalesce(p_cuantas, 3)))
    ) t), '[]'::jsonb);
end;
$$;

grant execute on function public.actividad_reciente_del_centro(text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 16. EL PLAN Y LA LICENCIA
-- ---------------------------------------------------------------------
--
-- SE ENSEÑA PARA QUE LOS GUARDADOS NO FALLEN "PORQUE SI". `app.licencia_permite`
-- corta la escritura cuando la licencia vence, y sin una pantalla que lo diga
-- el sintoma es que un dia cualquiera deja de poder guardarse una cita, con un
-- error de permisos que nadie relaciona con una fecha.
create or replace function public.licencia_del_centro(p_negocio text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_l licencia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_l from licencia where negocio_id = p_negocio;

  return jsonb_build_object(
    -- SIN RENGLON DE LICENCIA NO SE INVENTA UNO. `administrada` en false es lo
    -- que le permite a la pantalla decir "este centro no tiene licencia
    -- administrada" en vez de enseñar un plan que nadie contrato.
    'administrada', v_l.negocio_id is not null,
    'plan', v_l.plan,
    'estado', v_l.estado,
    'expiraEn', v_l.expira_en,
    'actualizadaEn', v_l.actualizado_en,
    -- La respuesta a la unica pregunta que de verdad importa: ¿hoy se puede
    -- guardar? Sale de la MISMA funcion que corta de verdad, no de repetir su
    -- logica aqui — dos copias acabarian contestando distinto.
    'permiteGuardar', app.licencia_permite(p_negocio));
end;
$$;

grant execute on function public.licencia_del_centro(text) to authenticated;

-- ---------------------------------------------------------------------
-- 17. EXPORTAR LOS DATOS DEL CENTRO
-- ---------------------------------------------------------------------
--
-- UNA ENTIDAD POR LLAMADA Y CON TOPE. Bajarse el centro entero de un viaje es
-- lo que hace que la pestaña se congele el dia que el centro ya lleva tres años
-- trabajando; y peor, un JSON de sesenta megas que el navegador no puede armar
-- falla sin decir por que. El tope se DEVUELVE junto con las filas para que la
-- pantalla pueda avisar de que se quedo algo fuera, en vez de entregar un
-- archivo incompleto con cara de completo.
--
-- `security invoker`: las reglas de fila deciden que renglones salen. Quien no
-- ve el expediente clinico no lo exporta.
create or replace function public.exportar_del_centro(
  p_negocio text,
  p_que text,
  p_limite int default 5000
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tope  int := least(20000, greatest(1, coalesce(p_limite, 5000)));
  v_filas jsonb;
  v_total bigint;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'exportarDatos') then
    raise exception 'No tienes permiso para exportar los datos del centro.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_que = 'clientes' then
    select count(*) into v_total from cliente where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.nombre), '[]'::jsonb) into v_filas
      from (select * from cliente
             where negocio_id = p_negocio and not eliminado order by nombre limit v_tope) c;
  elsif p_que = 'servicios' then
    select count(*) into v_total from servicio where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(s) order by s.nombre), '[]'::jsonb) into v_filas
      from (select * from servicio
             where negocio_id = p_negocio and not eliminado order by nombre limit v_tope) s;
  elsif p_que = 'cursos' then
    select count(*) into v_total from curso where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.nombre), '[]'::jsonb) into v_filas
      from (select * from curso
             where negocio_id = p_negocio and not eliminado order by nombre limit v_tope) c;
  elsif p_que = 'productos' then
    select count(*) into v_total from producto where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(p) order by p.nombre), '[]'::jsonb) into v_filas
      from (select * from producto
             where negocio_id = p_negocio and not eliminado order by nombre limit v_tope) p;
  elsif p_que = 'citas' then
    select count(*) into v_total from cita where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.fecha desc), '[]'::jsonb) into v_filas
      from (select * from cita
             where negocio_id = p_negocio and not eliminado order by fecha desc limit v_tope) c;
  elsif p_que = 'ventas' then
    select count(*) into v_total from venta where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(v) order by v.fecha desc), '[]'::jsonb) into v_filas
      from (select * from venta
             where negocio_id = p_negocio and not eliminado order by fecha desc limit v_tope) v;
  elsif p_que = 'gastos' then
    select count(*) into v_total from gasto where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(g) order by g.fecha desc), '[]'::jsonb) into v_filas
      from (select * from gasto
             where negocio_id = p_negocio and not eliminado order by fecha desc limit v_tope) g;
  elsif p_que = 'recordatorios' then
    select count(*) into v_total from recordatorio where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(r) order by r.fecha desc), '[]'::jsonb) into v_filas
      from (select * from recordatorio
             where negocio_id = p_negocio and not eliminado order by fecha desc limit v_tope) r;
  else
    raise exception 'No se sabe exportar "%". Las opciones son clientes, servicios, cursos, productos, citas, ventas, gastos y recordatorios.', p_que
      using errcode = 'invalid_parameter_value';
  end if;

  return jsonb_build_object(
    'que', p_que,
    'total', coalesce(v_total, 0),
    'entregadas', jsonb_array_length(v_filas),
    'tope', v_tope,
    'filas', v_filas);
end;
$$;

comment on function public.exportar_del_centro(text, text, int) is
  'Una entidad por llamada, con tope, y devolviendo cuantas hay de verdad: un archivo recortado '
  'sin avisar tiene exactamente la misma cara que uno completo.';

grant execute on function public.exportar_del_centro(text, text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 18. LA ZONA DE PELIGRO — transferir la propiedad
-- ---------------------------------------------------------------------
--
-- ES LA UNICA ACCION IRREVERSIBLE QUE EL CENTRO PUEDE HACERSE A SI MISMO desde
-- adentro, y por eso pide `zonaDePeligro` ADEMAS de ser dueño. Quien la usa
-- deja de poder deshacerla en el mismo acto: despues de transferir, ya no es
-- dueño y no puede transferirsela de vuelta.
create or replace function public.transferir_propiedad_del_centro(
  p_negocio text,
  p_membresia uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m     membresia;
  v_quien membresia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'zonaDePeligro') then
    raise exception 'No tienes permiso para la zona de peligro.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if v_quien.rol <> 'dueno' then
    raise exception 'Solo quien es dueño puede transferir la propiedad del centro.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from membresia where id = p_membresia and negocio_id = p_negocio;
  if v_m.id is null then
    raise exception 'Esa persona no esta en este centro.' using errcode = 'no_data_found';
  end if;
  if not v_m.activo or v_m.eliminado then
    raise exception 'No se le puede dar el centro a alguien sin acceso.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_m.usuario_id = auth.uid() then
    raise exception 'Ya eres la dueña de este centro.' using errcode = 'invalid_parameter_value';
  end if;

  -- SE SUBE PRIMERO Y SE BAJA DESPUES. Al reves, entre las dos sentencias
  -- habria un instante sin ningun dueño; y si la segunda fallara, se quedaria
  -- asi para siempre. Las dos van dentro de la misma funcion, o sea de la
  -- misma transaccion: pasan las dos o no pasa ninguna.
  update membresia set rol = 'dueno', permisos = null where id = p_membresia;
  update membresia set rol = 'admin' where id = v_quien.id;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'), 'Dueño',
          'configuracion', 'transferir-propiedad', p_membresia::text,
          jsonb_build_object('dueno', v_quien.correo),
          jsonb_build_object('dueno', v_m.correo));
end;
$$;

comment on function public.transferir_propiedad_del_centro(text, uuid) is
  'Sube al nuevo dueño y baja al anterior en el mismo acto. Nunca hay un instante sin dueño, y '
  'quien la usa no puede deshacerla: por eso pide zonaDePeligro ademas de serlo.';

revoke all on function public.transferir_propiedad_del_centro(text, uuid) from public, anon;
grant execute on function public.transferir_propiedad_del_centro(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 19. EL PERMISO DE TABLA DE LO NUEVO
-- ---------------------------------------------------------------------
--
-- La distincion de siempre, que ya costo un "permission denied" en produccion:
-- las reglas de fila RECORTAN, el `grant` es lo que da el permiso de partida.
-- `invitacion` guarda correos de gente: `anon` no la toca ni de lejos.
--
-- SOLO `select`: se escribe por funcion, y la funcion comprueba
-- `gestionarUsuarios`. Con `insert` suelto, cualquiera con sesion podria
-- invitarse a si mismo al centro de cualquiera.
revoke all on invitacion from anon;
grant select on invitacion to authenticated;

-- Y SE LE QUITA A `authenticated` TODO LO DEMAS, aunque nunca se le diera.
--
-- ESTO SE VIO CONTRA LA BASE DE VERDAD, no leyendo el archivo: al comprobar los
-- permisos despues de aplicarlo, `authenticated` tenia CUATRO sobre `invitacion`
-- en vez de uno. La causa es que Supabase deja puestos unos permisos por
-- omision que conceden todo sobre cada tabla NUEVA, asi que la tabla nacio con
-- insert, update y delete sin que nadie los escribiera.
--
-- Las reglas de fila lo tapaban —no hay politica de escritura, asi que ninguna
-- de las tres podia tocar una fila— pero un permiso de tabla que sobra es un
-- permiso que el dia que alguien agregue una politica se convierte en un
-- agujero. Se quita explicitamente: escribir invitaciones es cosa de las
-- funciones, que comprueban `gestionarUsuarios` antes.
revoke insert, update, delete on invitacion from authenticated;

