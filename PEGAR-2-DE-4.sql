-- =====================================================================
-- PARTE 2 DE 4 — pegar en Supabase -> SQL Editor -> Run
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
-- CUANDO ESTA DIGA "Success", SIGUE CON LA PARTE 3.
--
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
