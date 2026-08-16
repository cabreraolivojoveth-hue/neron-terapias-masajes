-- =====================================================================
-- PARTE 2 DE 5 — pegar en Supabase -> SQL Editor -> Run
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
alter table recordatorio_recurrente drop constraint if exists recordatorio_recurrente_responsable_mismo_negocio;
alter table recordatorio_recurrente add constraint recordatorio_recurrente_responsable_mismo_negocio
  foreign key (negocio_id, responsable_id) references membresia (negocio_id, id)
  on delete set null (responsable_id);

alter table recordatorio drop constraint if exists recordatorio_recurrente_mismo_negocio;
alter table recordatorio add constraint recordatorio_recurrente_mismo_negocio
  foreign key (negocio_id, recurrente_id) references recordatorio_recurrente (negocio_id, id)
  on delete set null (recurrente_id);

-- LA IDEMPOTENCIA DE LA RECURRENCIA, Y ES UN INDICE PORQUE NINGUN OTRO SITIO
-- AGUANTA. Si viviera en la funcion —"mira si ya existe y si no, crealo"— dos
-- ejecuciones simultaneas leerian las dos que no existe.
create unique index if not exists recordatorio_recurrente_fecha_unica
  on recordatorio (recurrente_id, fecha) where recurrente_id is not null and not eliminado;

create index if not exists recordatorio_recurrente_proxima_idx
  on recordatorio_recurrente (negocio_id, proxima_fecha) where estado = 'activo' and not eliminado;

-- ---------------------------------------------------------------------
-- 3. EL HISTORIAL — quien hizo que, y cuando
-- ---------------------------------------------------------------------
--
-- SOLO SE AGREGA: ni se edita ni se borra. Un rastro que se puede corregir no
-- sirve para contestar la unica pregunta que se le hace ("¿quien pospuso esto
-- tres veces?").
create table if not exists recordatorio_evento (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      text not null references negocio(id) on delete cascade,
  recordatorio_id uuid not null,
  accion          text not null,
  antes           jsonb,
  despues         jsonb,
  usuario_id      uuid,
  -- EL NOMBRE SE CONGELA AQUI A PROPOSITO, y es la unica copia de todo el
  -- modulo. Un rastro que resuelve el nombre al leer cambia de version cuando
  -- esa persona se renombra o se da de baja, y entonces deja de decir quien lo
  -- hizo el dia que lo hizo — que es justo para lo que existe.
  usuario_nombre  text,
  creado_en       timestamptz not null default now()
);

comment on table recordatorio_evento is
  'El rastro de un recordatorio. Solo se agrega. El nombre del usuario va congelado a proposito: '
  'es lo unico del modulo que se copia, porque un rastro tiene que decir quien lo hizo ENTONCES.';

alter table recordatorio_evento drop constraint if exists recordatorio_evento_mismo_negocio;
alter table recordatorio_evento add constraint recordatorio_evento_mismo_negocio
  foreign key (negocio_id, recordatorio_id) references recordatorio (negocio_id, id)
  on delete cascade;

create index if not exists recordatorio_evento_idx
  on recordatorio_evento (recordatorio_id, creado_en desc);

-- ---------------------------------------------------------------------
-- 4. LA CONFIGURACION DEL MODULO, POR CENTRO
-- ---------------------------------------------------------------------
--
-- UNA FILA POR CENTRO, y por eso `negocio_id` es la llave primaria: dos filas
-- de ajustes para el mismo centro es un estado que no significa nada y que
-- alguien acabaria leyendo con `limit 1`.
--
-- LO QUE NO GUARDA: nada del ERP. Los horarios del centro, la moneda y los
-- usuarios viven en su sitio. Aqui solo esta el comportamiento de este modulo.
create table if not exists recordatorio_ajustes (
  negocio_id           text primary key references negocio(id) on delete cascade,
  -- El aviso del navegador. Apagado por omision: pedir permiso de
  -- notificaciones sin que nadie lo haya pedido es la forma mas rapida de que
  -- alguien lo bloquee para siempre.
  avisar_en_navegador  boolean not null default false,
  anticipacion_min     int not null default 30
                         check (anticipacion_min in (0, 5, 15, 30, 60, 1440)),
  -- Con que hora se cuenta un recordatorio que no la tiene.
  hora_por_omision     time not null default '09:00',
  avisar_al_responsable boolean not null default true,
  avisar_al_reasignar  boolean not null default true,
  -- Cuantos dias cuenta "proximos". El diseño dice 7; se deja configurable
  -- porque un centro que agenda con un mes de antelacion quiere 30.
  dias_de_proximos     int not null default 7 check (dias_de_proximos between 1 and 90),
  orden_por_omision    text not null default 'urgencia'
                         check (orden_por_omision in
                           ('urgencia', 'fecha', 'prioridad', 'creacion', 'responsable')),
  -- El texto del "Consejo del dia". Nulo = el del producto. Se guarda para que
  -- un centro pueda poner el suyo, NO para fingir que el sistema analiza algo.
  consejo              text,
  actualizado_en       timestamptz,
  actualizado_por      uuid
);

comment on table recordatorio_ajustes is
  'El comportamiento de Recordatorios en ESTE centro. Una fila por negocio. No guarda nada del '
  'resto del ERP: los horarios, la moneda y los usuarios siguen viviendo en su sitio.';

-- ---------------------------------------------------------------------
-- 5. LAS AUTOMATIZACIONES — apagadas hasta que alguien las encienda
-- ---------------------------------------------------------------------
--
-- LA TABLA NACE VACIA Y ESO ES LA DECISION. Un sistema que empieza creando
-- recordatorios solos —"confirmar cita", "seguimiento de cliente nuevo"— le
-- llena la lista a alguien que nunca los pidio, y lo primero que aprende esa
-- persona es a ignorar la lista. Cada regla se enciende a mano, una vez, desde
-- Configuracion.
create table if not exists recordatorio_automatizacion (
  id                uuid primary key default gen_random_uuid(),
  negocio_id        text not null references negocio(id) on delete cascade,
  evento            text not null check (evento in
                      ('cita_nueva', 'cliente_nuevo', 'venta_pendiente',
                       'stock_bajo', 'curso_proximo')),
  activa            boolean not null default false,
  -- El titulo del recordatorio que se va a crear. Admite {nombre} y {fecha},
  -- que se sustituyen con lo que la fila de origen diga en ese momento.
  plantilla_titulo  text not null,
  plantilla_detalle text,
  -- Cuantos dias ANTES del hecho. Para "cita nueva" es antes de la cita; para
  -- "curso proximo", antes de que empiece. Cero = el mismo dia.
  dias_antes        int not null default 1 check (dias_antes between 0 and 90),
  hora              time,
  prioridad         text not null default 'normal'
                      check (prioridad in ('baja', 'normal', 'alta', 'urgente')),
  categoria_id      uuid,
  responsable_id    uuid,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz,
  eliminado         boolean not null default false,
  constraint recordatorio_automatizacion_negocio_id_unico unique (negocio_id, id),
  -- UNA REGLA POR EVENTO Y POR CENTRO. Dos reglas del mismo evento crean dos
  -- recordatorios por cada cita, y la segunda no se ve al configurar: solo
  -- aparece cuando la lista sale duplicada y nadie sabe de donde salio.
  constraint recordatorio_automatizacion_evento_unico unique (negocio_id, evento)
);

comment on table recordatorio_automatizacion is
  'Las reglas que crean recordatorios solos. La tabla nace VACIA y cada regla se enciende a mano: '
  'un sistema que llena la lista sin que nadie lo pidiera enseña a ignorar la lista.';

alter table recordatorio_automatizacion drop constraint if exists recordatorio_automatizacion_categoria_mismo_negocio;
alter table recordatorio_automatizacion add constraint recordatorio_automatizacion_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  on delete set null (categoria_id);

alter table recordatorio_automatizacion drop constraint if exists recordatorio_automatizacion_responsable_mismo_negocio;
alter table recordatorio_automatizacion add constraint recordatorio_automatizacion_responsable_mismo_negocio
  foreign key (negocio_id, responsable_id) references membresia (negocio_id, id)
  on delete set null (responsable_id);

alter table recordatorio drop constraint if exists recordatorio_automatizacion_mismo_negocio;
alter table recordatorio add constraint recordatorio_automatizacion_mismo_negocio
  foreign key (negocio_id, automatizacion_id) references recordatorio_automatizacion (negocio_id, id)
  on delete set null (automatizacion_id);

/*
 * LA PREVENCION DE DUPLICADOS DE LAS AUTOMATIZACIONES.
 *
 * Es el requisito que mas facil se pasa por alto y el que mas rapido rompe la
 * confianza en el modulo: la regla "avisa cuando el stock baje" se ejecuta cada
 * vez que alguien abre la pantalla, y sin esto crearia un recordatorio nuevo
 * cada vez. A la tercera visita hay tres "Reponer aceites esenciales" y la
 * lista deja de servir.
 *
 * La llave es (de que regla, de que fila salio). Se cuenta tambien el
 * recordatorio ya COMPLETADO: si solo contaran los pendientes, completar el de
 * stock bajo haria que la siguiente ejecucion creara otro igual, y quedaria un
 * bucle en el que nunca se puede terminar de reponer nada. Un recordatorio
 * eliminado si libera el hueco — es la forma de decir "vuelve a avisarme".
 */
create unique index if not exists recordatorio_origen_unico
  on recordatorio (negocio_id, automatizacion_id, origen_id)
  where automatizacion_id is not null and origen_id is not null and not eliminado;

-- ---------------------------------------------------------------------
-- 6. LAS REGLAS DE FILA DE LAS TABLAS NUEVAS
-- ---------------------------------------------------------------------
--
-- LOS RECORDATORIOS LOS VE TODO EL CENTRO, y es a proposito: son la lista de
-- pendientes del equipo, no el buzon privado de nadie. Quien atiende tiene que
-- poder ver que la de recepcion todavia no confirmo la cita de mañana.
--
-- QUIEN PUEDE MODIFICAR CUAL se decide en las funciones, no aqui. La politica
-- de la tabla se queda en "es miembro" porque los disparadores del bloque 0
-- —`reagendar_cita` mueve los recordatorios de esa cita, `cambiar_estado_de_cita`
-- los descarta— escriben en filas de las que quien cancela la cita casi nunca
-- es responsable. Una politica mas estrecha los dejaria fallar en silencio: la
-- cita se cancelaria y su recordatorio seguiria avisando. La restriccion fina
-- vive en `guardar_recordatorio` y compañia, que corren en el servidor y son
-- igual de inevitables.
alter table recordatorio_recurrente enable row level security;
alter table recordatorio_recurrente force row level security;
alter table recordatorio_evento enable row level security;
alter table recordatorio_evento force row level security;
alter table recordatorio_ajustes enable row level security;
alter table recordatorio_ajustes force row level security;
alter table recordatorio_automatizacion enable row level security;
alter table recordatorio_automatizacion force row level security;

drop policy if exists recordatorio_recurrente_leer on recordatorio_recurrente;
create policy recordatorio_recurrente_leer on recordatorio_recurrente
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists recordatorio_recurrente_escribir on recordatorio_recurrente;
create policy recordatorio_recurrente_escribir on recordatorio_recurrente
  for all to authenticated
  using (app.es_miembro(negocio_id))
  with check (app.es_miembro(negocio_id) and app.licencia_permite(negocio_id));

-- EL HISTORIAL SE LEE Y SE AGREGA. No hay politica de update ni de delete, y
-- eso no es un olvido: sin politica, la operacion se niega. Un rastro que se
-- puede corregir no sirve para auditar nada.
drop policy if exists recordatorio_evento_leer on recordatorio_evento;
create policy recordatorio_evento_leer on recordatorio_evento
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists recordatorio_evento_agregar on recordatorio_evento;
create policy recordatorio_evento_agregar on recordatorio_evento
  for insert to authenticated with check (app.es_miembro(negocio_id));

drop policy if exists recordatorio_ajustes_leer on recordatorio_ajustes;
create policy recordatorio_ajustes_leer on recordatorio_ajustes
  for select to authenticated using (app.es_miembro(negocio_id));

-- CONFIGURAR EL MODULO NO ES USARLO. Cambiar la anticipacion de los avisos le
-- cambia el comportamiento a todo el centro, asi que pide el mismo permiso que
-- la configuracion del sistema. La dueña lo tiene siempre.
drop policy if exists recordatorio_ajustes_escribir on recordatorio_ajustes;
create policy recordatorio_ajustes_escribir on recordatorio_ajustes
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarConfiguracion'))
  with check (app.es_miembro(negocio_id)
              and app.tiene_permiso(negocio_id, 'gestionarConfiguracion')
              and app.licencia_permite(negocio_id));

drop policy if exists recordatorio_automatizacion_leer on recordatorio_automatizacion;
create policy recordatorio_automatizacion_leer on recordatorio_automatizacion
  for select to authenticated using (app.es_miembro(negocio_id));

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
