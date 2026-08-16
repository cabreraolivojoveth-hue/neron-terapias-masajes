-- =====================================================================
-- PARTE 6 DE 6 — pegar en Supabase -> SQL Editor -> Run
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

-- =====================================================================
-- CONFIGURACION — EL CENTRO, SU EQUIPO Y SU RASTRO (bloque 10)
-- =====================================================================
--
-- CASI NO TRAE TABLAS, Y ESO ES LO IMPORTANTE.
--
-- Las siete de la base ya son las suyas: `negocio`, `estado`, `membresia`,
-- `rol`, `licencia`, `auditoria` y `diario`. Configuracion las ADMINISTRA; no
-- las duplica. Una segunda tabla de usuarios o una segunda copia de los
-- horarios acabaria diciendo algo distinto de la primera, y nadie sabria cual
-- creer.
--
-- LA UNICA TABLA NUEVA ES `invitacion`, y existe por una razon concreta:
-- `membresia.usuario_id` es `uuid not null`, asi que no se puede dar de alta a
-- alguien que todavia no tiene cuenta. La invitacion es ese hueco: se guarda el
-- correo, y cuando esa persona entra por primera vez la reclama y se convierte
-- en membresia.
--
-- POR QUE TODO LO QUE ESCRIBE VA EN FUNCIONES `security definer`:
--
-- Las reglas de la base NO dejan que una sesion normal escriba `membresia` ni
-- `rol` — es el agujero mas grave que la base existe para no repetir: en Neron
-- POS la lista de usuarios vivia dentro del bloque JSON que el navegador
-- escribe, asi que una cajera podia cambiarse el rol a dueña sin atacar nada.
-- Aqui no hay servidor propio, asi que la puerta controlada es una funcion que
-- comprueba `gestionarUsuarios` ANTES de tocar nada y corre con permisos del
-- creador. Esa comprobacion es la unica llave; por eso esta escrita en todas.
--
-- LA PROTECCION ANTI-BLOQUEO NO SE TOCA. El rol `dueno` se guarda con la lista
-- de permisos VACIA y `app.tiene_permiso` lo entiende. Ademas, aqui:
--   · nadie puede quitarse a si mismo el acceso ni bajarse de rol,
--   · un centro no se puede quedar sin ningun dueño activo,
--   · los permisos del rol `dueno` no se pueden editar.
-- Las tres se comprueban en la base, no en la pantalla.

-- ---------------------------------------------------------------------
-- 1. EL PLAN, QUE LO ESCRIBE LA PLATAFORMA
-- ---------------------------------------------------------------------
--
-- `licencia` no tenia como decir QUE plan es. La pantalla tiene que enseñarlo
-- —la captura de referencia lo pone arriba a la derecha— y la alternativa era
-- inventarselo en el navegador, que es justo lo que este producto no hace.
--
-- Sigue siendo del mundo B: se lee desde adentro y se escribe SOLO desde la
-- plataforma. Sin plan escrito, la pantalla dice que no hay ninguno
-- administrado en vez de fingir uno.
alter table licencia add column if not exists plan text;

comment on column licencia.plan is
  'El nombre del plan contratado. Lo escribe la plataforma; el centro solo lo lee. Nulo '
  'significa "sin plan administrado", que es la verdad de un centro sin licencia — no un hueco.';

-- ---------------------------------------------------------------------
-- 2. LAS INVITACIONES
-- ---------------------------------------------------------------------
create table if not exists invitacion (
  id            uuid primary key default gen_random_uuid(),
  negocio_id    text not null references negocio(id) on delete cascade,
  correo        text not null,
  nombre        text not null,
  rol           text not null,
  permisos      jsonb,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente', 'aceptada', 'cancelada')),
  invitado_por  uuid,
  creada_en     timestamptz not null default now(),
  aceptada_en   timestamptz,
  aceptada_por  uuid
);

comment on table invitacion is
  'El hueco entre "te invito" y "ya tienes cuenta". membresia.usuario_id es not null, asi que '
  'no se puede dar de alta a quien todavia no existe. Se guarda el correo y la persona la '
  'reclama al entrar por primera vez.';

-- UNA SOLA INVITACION PENDIENTE POR CORREO Y CENTRO. Sin esto, invitar dos
-- veces a la misma persona —que pasa siempre, porque el primer correo se
-- pierde— crearia dos filas y al reclamarlas la segunda reventaria contra la
-- unicidad de `membresia`, con un error que no dice nada.
--
-- VA COMO INDICE PARCIAL Y NO COMO RESTRICCION a proposito: una cancelada y una
-- pendiente del mismo correo tienen que poder convivir, que es lo que permite
-- volver a invitar a alguien despues de cancelarle.
create unique index if not exists invitacion_pendiente_unica
  on invitacion (negocio_id, lower(correo))
  where estado = 'pendiente';

create index if not exists invitacion_por_correo on invitacion (lower(correo)) where estado = 'pendiente';

alter table invitacion enable row level security;
alter table invitacion force row level security;

-- SE LEE CON `gestionarUsuarios`, y nada mas. Un correo ajeno es dato
-- personal: quien no administra el equipo no tiene por que ver a quien se
-- invito y a quien no.
drop policy if exists invitacion_leer on invitacion;
create policy invitacion_leer on invitacion
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarUsuarios'));

-- No hay politica de insert, update ni delete: se escribe SOLO por funcion, y
-- la funcion comprueba el permiso. Es la misma decision que `membresia`.

-- ---------------------------------------------------------------------
-- 3. LA CONFIGURACION DEL CENTRO — que se lee
-- ---------------------------------------------------------------------
--
-- EL NOMBRE VIVE EN `negocio` Y LO DEMAS EN `estado.data`, y esa division es
-- la del bloque 0: `estado.data` es para la configuracion —poca, y se lee
-- entera—, mientras que las entidades van en tablas de verdad.
--
-- ES `security invoker`: las reglas de fila deciden que se entrega. Cualquier
-- miembro puede leer como se llama su centro y a que hora abre; para CAMBIARLO
-- hace falta `gestionarConfiguracion`, y eso se comprueba en la funcion de
-- guardar, no aqui.
create or replace function public.configuracion_del_centro(p_negocio text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
  v_datos  jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select n.nombre into v_nombre from negocio n where n.id = p_negocio;
  select coalesce(e.data -> 'centro', '{}'::jsonb) into v_datos
    from estado e where e.negocio_id = p_negocio;

  return jsonb_build_object(
    'nombre', coalesce(v_nombre, ''),
    -- Se devuelve el bloque TAL CUAL, sin rellenar huecos. Los valores por
    -- omision los pone el navegador en un solo sitio: si se pusieran aqui
    -- tambien, el dia que uno cambie habria dos verdades sobre a que hora abre
    -- un centro que nunca configuro nada.
    'centro', coalesce(v_datos, '{}'::jsonb),
    'creadoEn', (select n.creado_en from negocio n where n.id = p_negocio),
    'miembros', (select count(*) from membresia m
                  where m.negocio_id = p_negocio and m.activo and not m.eliminado)
  );
end;
$$;

comment on function public.configuracion_del_centro(text) is
  'El nombre del centro y su bloque de configuracion. Lo lee cualquier miembro: hasta la barra '
  'lateral necesita saber como se llama el sitio donde trabaja.';

grant execute on function public.configuracion_del_centro(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. LA CONFIGURACION DEL CENTRO — que se guarda
-- ---------------------------------------------------------------------
--
-- `security definer` porque toca `negocio.nombre`, que no tiene politica de
-- escritura para nadie: el nombre del centro es de los datos que, si el
-- navegador pudiera escribir sueltos, cualquiera podria renombrarle el centro
-- a su dueña. La llave es la comprobacion de `gestionarConfiguracion` de aqui
-- abajo, y por eso va antes que cualquier `update`.
create or replace function public.guardar_configuracion_del_centro(
  p_negocio text,
  p_nombre text,
  p_datos jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quien  membresia;
  v_antes  jsonb;
  v_nombre text;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'No tienes permiso para cambiar la configuracion del centro.'
      using errcode = 'insufficient_privilege';
  end if;
  -- LA LICENCIA TAMBIEN MANDA AQUI. Sin esto, un centro vencido no podria
  -- guardar una cita pero si renombrarse: dos reglas distintas para la misma
  -- pregunta es como se cuelan los huecos.
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia de este centro no permite guardar cambios.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'La configuracion tiene que ser un objeto de llaves.' using errcode = '22023';
  end if;

  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_nombre is null then
    raise exception 'El centro tiene que llamarse de alguna forma.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  select jsonb_build_object('nombre', n.nombre,
                            'centro', coalesce((select e.data -> 'centro' from estado e
                                                 where e.negocio_id = p_negocio), '{}'::jsonb))
    into v_antes
    from negocio n where n.id = p_negocio;

  update negocio set nombre = v_nombre where id = p_negocio;

  -- SE FUSIONA POR LLAVE, igual que `guardar_llaves` de la base y por el mismo
  -- motivo: dos pantallas abiertas que guardan cosas distintas del mismo
  -- bloque no se pisan. Escribir el bloque entero desde el navegador es como
  -- se pierde lo que otro acababa de guardar.
  insert into estado (negocio_id, data)
  values (p_negocio, jsonb_build_object('centro', p_datos))
  on conflict (negocio_id) do update
    set data = coalesce(estado.data, '{}'::jsonb)
               || jsonb_build_object('centro',
                    coalesce(estado.data -> 'centro', '{}'::jsonb) || p_datos),
        updated_at = now();

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = p_negocio and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'configuracion', 'editar', p_negocio, v_antes,
          jsonb_build_object('nombre', v_nombre, 'centro', p_datos));

  return public.configuracion_del_centro(p_negocio);
end;
$$;

comment on function public.guardar_configuracion_del_centro(text, text, jsonb) is
  'Renombra el centro y fusiona su bloque de configuracion. Comprueba gestionarConfiguracion '
  'ANTES de tocar nada: es la unica llave, porque negocio no tiene politica de escritura.';

revoke all on function public.guardar_configuracion_del_centro(text, text, jsonb) from public, anon;
grant execute on function public.guardar_configuracion_del_centro(text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. MI PROPIO NOMBRE
-- ---------------------------------------------------------------------
--
-- Cambiarse el nombre no es administrar usuarios: es la ficha de uno mismo, y
-- se puede hacer sin `gestionarUsuarios`. Lo que NO deja esta funcion es tocar
-- el rol ni el correo — para eso estan las de mas abajo, con su permiso.
create or replace function public.guardar_mi_perfil(p_negocio text, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
  v_id     uuid;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_nombre is null then
    raise exception 'Escribe como te llamas.' using errcode = 'invalid_parameter_value';
  end if;

  update membresia set nombre = v_nombre
   where negocio_id = p_negocio and usuario_id = auth.uid()
  returning id into v_id;

  if v_id is null then
    raise exception 'No se encontro tu membresia en este centro.' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object('id', v_id, 'nombre', v_nombre);
end;
$$;

comment on function public.guardar_mi_perfil(text, text) is
  'El nombre propio, que no es administrar usuarios. No deja tocar rol ni correo: eso pide '
  'gestionarUsuarios y va por otra funcion.';

revoke all on function public.guardar_mi_perfil(text, text) from public, anon;
grant execute on function public.guardar_mi_perfil(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. EL EQUIPO — quien entra y con que rol
-- ---------------------------------------------------------------------
create or replace function public.equipo_del_centro(p_negocio text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para ver el equipo del centro.'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'miembros', (
      select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', m.id,
                 'usuarioId', m.usuario_id,
                 'correo', m.correo,
                 'nombre', m.nombre,
                 'rol', m.rol,
                 'rolEtiqueta', coalesce(r.etiqueta, m.rol),
                 'activo', m.activo,
                 'eliminado', m.eliminado,
                 'permisos', m.permisos,
                 'soyYo', m.usuario_id = auth.uid(),
                 'creadoEn', m.creado_en) as x
          from membresia m
          left join rol r on r.negocio_id = m.negocio_id and r.id = m.rol
         where m.negocio_id = p_negocio
      ) t),
    'invitaciones', (
      select coalesce(jsonb_agg(x order by x->>'creadaEn' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', i.id,
                 'correo', i.correo,
                 'nombre', i.nombre,
                 'rol', i.rol,
                 'rolEtiqueta', coalesce(r.etiqueta, i.rol),
                 'creadaEn', i.creada_en) as x
          from invitacion i
          left join rol r on r.negocio_id = i.negocio_id and r.id = i.rol
         where i.negocio_id = p_negocio and i.estado = 'pendiente'
      ) t),
    -- CUANTOS DUEÑOS ACTIVOS QUEDAN. La pantalla lo necesita para apagar el
    -- boton de dar de baja al ultimo, y decirlo antes es mejor que dejar que
    -- la base lo rechace despues.
    'duenosActivos', (
      select count(*) from membresia m
       where m.negocio_id = p_negocio and m.rol = 'dueno' and m.activo and not m.eliminado)
  );
end;
$$;

comment on function public.equipo_del_centro(text) is
  'Miembros e invitaciones pendientes. Pide gestionarUsuarios: un correo ajeno es dato personal, '
  'y quien no administra el equipo no tiene por que verlo.';

grant execute on function public.equipo_del_centro(text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. LOS ROLES Y SU USO
-- ---------------------------------------------------------------------
create or replace function public.roles_del_centro(p_negocio text)
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
    select jsonb_agg(x order by x->>'etiqueta') from (
      select jsonb_build_object(
               'id', r.id,
               'etiqueta', r.etiqueta,
               'permisos', coalesce(r.permisos, '{}'::jsonb),
               'activo', r.activo,
               -- EL NUMERO DE GENTE QUE LO USA se cuenta, no se guarda. Es lo
               -- que convierte apagar un rol en una decision informada: uno que
               -- usan cuatro personas las deja a las cuatro en el rol de
               -- respaldo, y a ciegas nadie se entera.
               'cuantos', (select count(*) from membresia m
                            where m.negocio_id = r.negocio_id and m.rol = r.id
                              and m.activo and not m.eliminado)) as x
        from rol r
       where r.negocio_id = p_negocio
    ) t), '[]'::jsonb);
end;
$$;

comment on function public.roles_del_centro(text) is
  'Los roles guardados del centro con cuanta gente los usa. Los de fabrica los mezcla el motor '
  'de permisos del navegador: aqui solo vive lo que este centro cambio.';

grant execute on function public.roles_del_centro(text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. GUARDAR UN ROL
-- ---------------------------------------------------------------------
--
-- EL ROL `dueno` NO SE EDITA, y es la proteccion anti-bloqueo entera en una
-- linea. Se guarda con la lista de permisos VACIA porque `app.tiene_permiso`
-- devuelve true en cuanto ve ese rol, sin mirar nada mas. Escribirle permisos
-- —aunque fueran todos en true— haria que el dia que alguien apague uno por
-- error, la dueña se quede sin poder entrar a su propio centro.
create or replace function public.guardar_rol_del_centro(
  p_negocio text,
  p_id text,
  p_etiqueta text,
  p_permisos jsonb,
  p_activo boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quien membresia;
  v_id    text;
  v_antes jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para cambiar los roles del centro.'
      using errcode = 'insufficient_privilege';
  end if;

  -- El id se normaliza: sin acentos ni espacios, porque el motor de permisos
  -- lo compara como texto opaco y "Recepción" y "recepcion" serian dos roles.
  v_id := lower(regexp_replace(btrim(coalesce(p_id, '')), '[^a-zA-Z0-9_]+', '_', 'g'));
  if v_id = '' then
    raise exception 'El rol necesita un identificador.' using errcode = 'invalid_parameter_value';
  end if;
  if nullif(btrim(coalesce(p_etiqueta, '')), '') is null then
    raise exception 'El rol necesita un nombre visible.' using errcode = 'invalid_parameter_value';
  end if;

  if v_id = 'dueno' then
    raise exception 'El rol de dueño no se edita: es la proteccion que impide que un centro se quede sin nadie que pueda todo.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  select jsonb_build_object('etiqueta', r.etiqueta, 'permisos', r.permisos, 'activo', r.activo)
    into v_antes from rol r where r.negocio_id = p_negocio and r.id = v_id;

  insert into rol (negocio_id, id, etiqueta, permisos, activo)
  values (p_negocio, v_id, btrim(p_etiqueta), coalesce(p_permisos, '{}'::jsonb),
          coalesce(p_activo, true))
  on conflict (negocio_id, id) do update
    set etiqueta = excluded.etiqueta,
        permisos = excluded.permisos,
        activo = excluded.activo;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = p_negocio and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'configuracion', case when v_antes is null then 'crear' else 'editar' end,
          v_id, v_antes,
          jsonb_build_object('etiqueta', btrim(p_etiqueta), 'permisos',
                             coalesce(p_permisos, '{}'::jsonb), 'activo', coalesce(p_activo, true)));

  return jsonb_build_object('id', v_id);
end;
$$;

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

