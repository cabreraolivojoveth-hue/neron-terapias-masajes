-- =====================================================================
-- ACTUALIZAR LA BASE — pegar completo en Supabase → SQL Editor → Run
-- =====================================================================
--
-- ESTE REEMPLAZA AL QUE FALLO. El anterior reventaba en
-- `ficha_del_servicio` con "column a.creado_en does not exist": la bitacora
-- guarda `ocurrido_en`, no `creado_en`. Ya esta corregido, y ahora se prueba
-- contra un Postgres de verdad antes de mandartelo.
--
-- QUE TRAE:
--   1. El catalogo — la tabla de categorias, las columnas nuevas del
--      servicio y las cinco funciones que lo sostienen.
--   2. La agenda — la duracion de una cita sale de la CITA, no del catalogo
--      de hoy.
--   3. Tres llaves foraneas corregidas — un `on delete set null` que no se
--      podia ejecutar.
--
-- ES SEGURO CORRERLO LAS VECES QUE HAGA FALTA. No borra nada, no reescribe
-- ningun dato y no toca una sola fila existente: crea una tabla nueva (que
-- nace vacia), agrega columnas que pueden quedarse vacias, y crea o reemplaza
-- funciones y restricciones. Si lo corres dos veces no cambia nada.
--
-- SI YA CORRISTE EL DE CLIENTES, este va encima sin problema. Si no, tambien:
-- son bloques independientes.
--
-- EL ARCHIVO COMPLETO Y CON TODAS LAS EXPLICACIONES sigue siendo
-- INSTALAR-EN-TERAPIAS.sql. Este es solo el pedazo nuevo, para no tener que
-- pegar dos mil lineas cada vez.
--
-- =====================================================================


-- =====================================================================
-- 1 · EL CATALOGO — categorias, servicios y cursos
-- =====================================================================

-- =====================================================================
-- EL CATALOGO — categorias, servicios y cursos
-- =====================================================================

-- ---------------------------------------------------------------------
-- CATEGORIAS — una sola tabla para servicios y para cursos
-- ---------------------------------------------------------------------
--
-- POR QUE UNA Y NO DOS. Un centro llama "Terapias Energeticas" tanto a un
-- servicio como a un curso, y con dos tablas ese nombre existiria dos veces:
-- se renombra en una y la otra se queda vieja. La columna `ambito` separa los
-- dos catalogos sin duplicar tabla, reglas de acceso ni pantalla.
--
-- Y ES UNA ENTIDAD, no un texto dentro del servicio. Guardar
-- `categoria = 'Terapias Energeticas'` en cada renglon obliga a corregir
-- doscientos renglones para cambiarle una letra al nombre — y siempre queda
-- alguno sin corregir.
--
create table if not exists categoria (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  text not null references negocio(id) on delete cascade,
  ambito      text not null check (ambito in ('servicio', 'curso')),
  nombre      text not null,
  descripcion text,
  -- El color de la pastilla. Nulo = el tono neutro del sistema.
  color       text,
  activo      boolean not null default true,
  eliminado   boolean not null default false,
  creado_en   timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categoria_negocio_id_unico') then
    alter table categoria add constraint categoria_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

-- Dos categorias del mismo ambito no se pueden llamar igual. Sin esto se
-- crean "Masajes" y "masajes" y los servicios quedan repartidos entre las dos.
create unique index if not exists categoria_nombre_unico
  on categoria (negocio_id, ambito, lower(nombre)) where not eliminado;

alter table categoria enable row level security;
alter table categoria force row level security;

drop policy if exists categoria_leer on categoria;
create policy categoria_leer on categoria
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists categoria_escribir on categoria;
create policy categoria_escribir on categoria
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo')
              and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- SERVICIOS — lo que el catalogo necesita ademas de nombre y precio
-- ---------------------------------------------------------------------
--
-- Todo aditivo y todo opcional: un servicio que ya existia sigue funcionando
-- igual con estas columnas vacias.
--
alter table servicio add column if not exists categoria_id uuid;
alter table servicio add column if not exists precio_promocional_centavos bigint;
alter table servicio add column if not exists promocion_desde date;
alter table servicio add column if not exists promocion_hasta date;
alter table servicio add column if not exists color text;
alter table servicio add column if not exists requiere_preparacion boolean not null default false;
alter table servicio add column if not exists preparacion text;
alter table servicio add column if not exists notas text;
-- Los dias en que se ofrece, como digitos ISO: 1 es lunes y 7 domingo.
-- '1234567' es toda la semana. Nulo = lo que diga el horario del centro.
alter table servicio add column if not exists dias_disponibles text;
alter table servicio add column if not exists hora_desde time;
alter table servicio add column if not exists hora_hasta time;
alter table servicio add column if not exists actualizado_en timestamptz not null default now();

alter table servicio drop constraint if exists servicio_categoria_mismo_negocio;
alter table servicio add constraint servicio_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  -- Si alguien archiva la categoria, el servicio se queda SIN categoria, no
  -- desaparece. Nadie deberia tener que reasignar treinta servicios a mano.
  -- `set null (columna)` y NO `set null` a secas. La llave es COMPUESTA: un
  -- `set null` pelon vacia las DOS columnas, y `negocio_id` no acepta nulos —
  -- asi que el borrado revienta y la fila de la izquierda no se puede borrar
  -- nunca. Se nombra la columna que si se debe vaciar.
  on delete set null (categoria_id);

alter table servicio drop constraint if exists servicio_promocion_coherente;
alter table servicio add constraint servicio_promocion_coherente check (
  precio_promocional_centavos is null or precio_promocional_centavos >= 0
);
alter table servicio drop constraint if exists servicio_promocion_fechas;
alter table servicio add constraint servicio_promocion_fechas check (
  promocion_desde is null or promocion_hasta is null or promocion_hasta >= promocion_desde
);

create index if not exists servicio_categoria_idx on servicio (negocio_id, categoria_id)
  where not eliminado;

-- ---------------------------------------------------------------------
-- EL PRECIO EFECTIVO — una sola funcion, y todos preguntan aqui
-- ---------------------------------------------------------------------
--
-- Agenda, Ventas, Clientes y Reportes necesitan saber cuanto cuesta un
-- servicio HOY. Si cada uno resolviera la promocion por su cuenta, el dia que
-- cambie la regla habria que corregirla en cuatro lugares y uno se quedaria
-- con la vieja — y ese cobraria de mas.
--
-- La promocion sin fechas vale SIEMPRE; con fechas, solo dentro del rango. Una
-- promocion de cero es una promocion valida: hay servicios de cortesia.
--
create or replace function app.precio_efectivo(
  p_base bigint, p_promo bigint, p_desde date, p_hasta date, p_dia date
)
returns bigint
language sql
immutable
as $$
  select case
    when p_promo is null then p_base
    when p_desde is not null and p_dia < p_desde then p_base
    when p_hasta is not null and p_dia > p_hasta then p_base
    else p_promo
  end;
$$;

comment on function app.precio_efectivo is
  'El precio que aplica hoy. Vive aqui para que Agenda, Ventas y Reportes no resuelvan la '
  'promocion cada uno por su cuenta y acaben cobrando distinto.';

-- ---------------------------------------------------------------------
-- EL CATALOGO DE SERVICIOS — buscado, filtrado y paginado en la base
-- ---------------------------------------------------------------------
create or replace function public.servicios_del_centro(
  p_negocio text,
  p_busqueda text default null,
  p_estado text default null,
  p_categoria uuid default null,
  p_pagina int default 1,
  p_por_pagina int default 10,
  p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select s.*,
      c.nombre as categoria_nombre,
      c.color as categoria_color,
      app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                          s.promocion_desde, s.promocion_hasta, p_hoy) as precio_hoy
    from servicio s
    left join categoria c on c.id = s.categoria_id
    where s.negocio_id = p_negocio and not s.eliminado
  ),
  filtrado as (
    select b.* from base b
    where (p_estado is null or p_estado = ''
           or (p_estado = 'activo' and b.activo)
           or (p_estado = 'inactivo' and not b.activo))
      and (p_categoria is null or b.categoria_id = p_categoria)
      and (p_busqueda is null or p_busqueda = ''
           or b.nombre ilike '%' || p_busqueda || '%'
           or coalesce(b.descripcion, '') ilike '%' || p_busqueda || '%'
           or coalesce(b.categoria_nombre, '') ilike '%' || p_busqueda || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrado),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'nombre', f.nombre, 'descripcion', f.descripcion,
        'categoriaId', f.categoria_id, 'categoria', f.categoria_nombre,
        'categoriaColor', f.categoria_color,
        'duracionMin', f.duracion_min,
        'precioCentavos', f.precio_centavos,
        'precioHoyCentavos', f.precio_hoy,
        'enPromocion', f.precio_hoy <> f.precio_centavos,
        'activo', f.activo,
        'color', f.color
      ) order by f.nombre)
      from (
        select * from filtrado order by nombre
        limit greatest(coalesce(p_por_pagina, 10), 1)
        offset greatest(coalesce(p_pagina, 1) - 1, 0) * greatest(coalesce(p_por_pagina, 10), 1)
      ) f
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- EL RESUMEN DE SERVICIOS — las cuatro tarjetas en un viaje
-- ---------------------------------------------------------------------
create or replace function public.resumen_servicios(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with vivos as (
    select * from servicio where negocio_id = p_negocio and not eliminado
  )
  select jsonb_build_object(
    'total', (select count(*) from vivos),
    'activos', (select count(*) from vivos where activo),
    'inactivos', (select count(*) from vivos where not activo),
    -- El promedio se saca SOLO de los activos: un servicio apagado hace dos
    -- años no dice nada de cuanto dura hoy una sesion. `avg` devuelve null
    -- cuando no hay ninguno, y null es "todavia no se", no cero.
    'duracionPromedio', (
      select round(avg(duracion_min))::int from vivos where activo
    )
  );
$$;

comment on function public.resumen_servicios is
  'La duracion promedio se calcula SOLO con los servicios activos, y devuelve null cuando no hay '
  'ninguno. Cero minutos seria una respuesta falsa.';

-- ---------------------------------------------------------------------
-- LA FICHA DE UN SERVICIO — con su impacto antes de apagarlo
-- ---------------------------------------------------------------------
create or replace function public.ficha_del_servicio(
  p_servicio uuid, p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id, 'nombre', s.nombre, 'descripcion', s.descripcion, 'notas', s.notas,
    'categoriaId', s.categoria_id,
    'categoria', (select c.nombre from categoria c where c.id = s.categoria_id),
    'categoriaColor', (select c.color from categoria c where c.id = s.categoria_id),
    'duracionMin', s.duracion_min,
    'precioCentavos', s.precio_centavos,
    'precioPromocionalCentavos', s.precio_promocional_centavos,
    'promocionDesde', s.promocion_desde,
    'promocionHasta', s.promocion_hasta,
    'precioHoyCentavos', app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                                             s.promocion_desde, s.promocion_hasta, p_hoy),
    'color', s.color,
    'requierePreparacion', s.requiere_preparacion,
    'preparacion', s.preparacion,
    'diasDisponibles', s.dias_disponibles,
    'horaDesde', s.hora_desde,
    'horaHasta', s.hora_hasta,
    'activo', s.activo,
    'creadoEn', s.creado_en,
    -- CUANTAS CITAS FUTURAS TIENE. Es lo que se le enseña a quien va a
    -- apagarlo: apagar un servicio con doce citas agendadas sin avisar es
    -- como cancelarlas a ciegas.
    'citasFuturas', (
      select count(*) from cita v
      where v.servicio_id = s.id and not v.eliminado
        and v.estado in ('pendiente', 'confirmada') and v.fecha >= p_hoy
    ),
    'citasCompletadas', (
      select count(*) from cita v
      where v.servicio_id = s.id and not v.eliminado and v.estado = 'completada'
    ),
    -- SI ESTA PERSONA PUEDE VER LA BITACORA.
    --
    -- La regla de fila de `auditoria` solo la entrega a quien tiene
    -- `verAuditoria`. Sin este dato, una recepcionista recibiria una lista
    -- vacia y la pantalla le diria "todavia no hay cambios registrados" —
    -- que es mentira: los hay, simplemente no son para sus ojos. Una pantalla
    -- que confunde "no puedes verlo" con "no existe" enseña a desconfiar de
    -- todo lo demas que dice.
    'puedeVerHistorial', app.tiene_permiso(s.negocio_id, 'verAuditoria'),
    -- El historial sale de la bitacora que ya existe. No hay una segunda.
    --
    -- La columna de tiempo se llama `ocurrido_en`, NO `creado_en`: la bitacora
    -- guarda cuando PASO la cosa, que no siempre es cuando se pudo escribir el
    -- renglon —una entrada que se reintenta con mala red se escribe despues—.
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object(
        'accion', a.accion, 'quien', a.usuario_nombre, 'cuando', a.ocurrido_en,
        'antes', a.antes, 'despues', a.despues
      ) order by a.ocurrido_en desc)
      from (
        select * from auditoria
        where negocio_id = s.negocio_id and modulo = 'servicios' and entidad = s.id::text
        order by ocurrido_en desc limit 20
      ) a
    ), '[]'::jsonb)
  )
  from servicio s
  where s.id = p_servicio;
$$;

-- ---------------------------------------------------------------------
-- GUARDAR UN SERVICIO — con su rastro en la bitacora
-- ---------------------------------------------------------------------
--
-- Va por funcion y no por un `update` suelto porque hay que dejar rastro de QUE
-- cambio: el precio y la duracion de un servicio mueven dinero y agenda, y
-- "alguien lo cambio en algun momento" no le sirve a nadie tres meses despues.
--
create or replace function public.guardar_servicio(
  p_negocio text,
  p_id uuid,
  p_nombre text,
  p_descripcion text,
  p_categoria uuid,
  p_duracion int,
  p_precio bigint,
  -- De aqui para abajo todo es OPCIONAL, y por eso lleva valor por omision: un
  -- servicio se da de alta con nombre, duracion y precio. Obligar a mandar
  -- diecinueve argumentos para crear uno hace que cualquiera que llame a esta
  -- funcion desde otro lado se equivoque de posicion en silencio.
  p_promo bigint default null,
  p_promo_desde date default null,
  p_promo_hasta date default null,
  p_color text default null,
  p_requiere_preparacion boolean default false,
  p_preparacion text default null,
  p_notas text default null,
  p_dias text default null,
  p_hora_desde time default null,
  p_hora_hasta time default null,
  p_activo boolean default true
)
returns servicio
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s     servicio;
  v_antes jsonb;
  v_quien membresia;
begin
  -- Los porteros van AQUI: un `security definer` se salta las reglas de fila.
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarCatalogo') then
    raise exception 'No tienes permiso para administrar el catalogo.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El servicio necesita un nombre.' using errcode = 'invalid_parameter_value';
  end if;
  if p_duracion is null or p_duracion <= 0 then
    raise exception 'La duracion tiene que ser mayor que cero.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if p_id is null then
    insert into servicio (negocio_id, nombre, descripcion, categoria_id, duracion_min,
                          precio_centavos, precio_promocional_centavos, promocion_desde,
                          promocion_hasta, color, requiere_preparacion, preparacion, notas,
                          dias_disponibles, hora_desde, hora_hasta, activo)
    values (p_negocio, btrim(p_nombre), p_descripcion, p_categoria, p_duracion,
            p_precio, p_promo, p_promo_desde, p_promo_hasta, p_color,
            coalesce(p_requiere_preparacion, false), p_preparacion, p_notas,
            p_dias, p_hora_desde, p_hora_hasta, coalesce(p_activo, true))
    returning * into v_s;

    insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                           entidad, antes, despues)
    values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
            coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'), 'servicios', 'crear', v_s.id::text, null,
            jsonb_build_object('nombre', v_s.nombre, 'precio', v_s.precio_centavos,
                               'duracion', v_s.duracion_min));
    return v_s;
  end if;

  select * into v_s from servicio where id = p_id and negocio_id = p_negocio and not eliminado;
  if v_s.id is null then
    raise exception 'Ese servicio no existe.' using errcode = 'no_data_found';
  end if;

  v_antes := jsonb_build_object('nombre', v_s.nombre, 'precio', v_s.precio_centavos,
                                'duracion', v_s.duracion_min, 'activo', v_s.activo,
                                'categoria', v_s.categoria_id, 'promo', v_s.precio_promocional_centavos);

  update servicio
     set nombre = btrim(p_nombre), descripcion = p_descripcion, categoria_id = p_categoria,
         duracion_min = p_duracion, precio_centavos = p_precio,
         precio_promocional_centavos = p_promo, promocion_desde = p_promo_desde,
         promocion_hasta = p_promo_hasta, color = p_color,
         requiere_preparacion = coalesce(p_requiere_preparacion, false),
         preparacion = p_preparacion, notas = p_notas,
         dias_disponibles = p_dias, hora_desde = p_hora_desde, hora_hasta = p_hora_hasta,
         activo = coalesce(p_activo, v_s.activo), actualizado_en = now()
   where id = p_id
  returning * into v_s;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'), 'servicios', 'editar', v_s.id::text, v_antes,
          jsonb_build_object('nombre', v_s.nombre, 'precio', v_s.precio_centavos,
                             'duracion', v_s.duracion_min, 'activo', v_s.activo,
                             'categoria', v_s.categoria_id, 'promo', v_s.precio_promocional_centavos));
  return v_s;
end;
$$;

comment on function public.guardar_servicio is
  'Crea o edita y DEJA RASTRO. El precio y la duracion mueven dinero y agenda: "alguien lo cambio '
  'en algun momento" no le sirve a nadie tres meses despues.';

-- =====================================================================
-- 2 · LA AGENDA — la duracion sale de la CITA, no del catalogo de hoy
--
-- Antes, cada cita reportaba `servicio.duracion_min`, o sea la duracion que
-- el servicio tiene HOY. Cambiar un servicio de 60 a 90 minutos alargaba en
-- pantalla todas las citas del año pasado, y la agenda de marzo dejaba de
-- cuadrar con lo que de verdad paso.
--
-- Ahora la duracion es la resta de las horas que la propia cita guarda. La
-- historia se queda quieta.
-- =====================================================================

-- =====================================================================
-- LA AGENDA
-- =====================================================================

-- ---------------------------------------------------------------------
-- LAS CITAS DE UN RANGO — una sola consulta para cualquier vista
-- ---------------------------------------------------------------------
--
-- Dia, semana y mes son el MISMO viaje al servidor con distinto rango. Sin
-- esto, la vista de mes haria una consulta por dia —treinta y un viajes— y
-- ademas una consulta por cita para resolver el nombre del paciente: el
-- problema N+1 en su forma mas clasica.
--
-- Los nombres se RESUELVEN al leer, no se copian al guardar. Si mañana esa
-- paciente se cambia el apellido, la agenda de hace tres meses tambien lo
-- muestra bien, porque nunca guardo una copia.
--
-- `security invoker` a proposito: las reglas de fila se aplican a quien
-- llama. Un centro no puede pedir la agenda de otro ni equivocandose.
--
create or replace function public.citas_del_rango(
  p_negocio text,
  p_desde date,
  p_hasta date,
  p_profesional uuid default null,
  p_servicio uuid default null,
  p_estado text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x order by x->>'fecha', x->>'horaInicio'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', c.id,
      'fecha', c.fecha,
      'horaInicio', to_char(c.hora_inicio, 'HH24:MI'),
      'horaFin', to_char(c.hora_fin, 'HH24:MI'),
      'estado', c.estado,
      'notas', c.notas,
      'clienteId', c.cliente_id,
      'cliente', cl.nombre,
      'clienteTelefono', cl.telefono,
      'clienteCorreo', cl.correo,
      'servicioId', c.servicio_id,
      'servicio', s.nombre,
      -- LA DURACION APLICADA, no la del catalogo de hoy.
      --
      -- Si un servicio pasa de 60 a 90 minutos, las citas del año pasado
      -- duraron 60. Leer `s.duracion_min` las reescribiria en pantalla y el
      -- reporte de ocupacion del año pasado cambiaria solo. La cita ya guarda
      -- su hora de inicio y de fin: esa resta ES el dato historico.
      'servicioMinutos', extract(epoch from (c.hora_fin - c.hora_inicio))::int / 60,
      'servicioPrecio', s.precio_centavos,
      'profesionalId', c.profesional_id,
      'profesional', m.nombre
    ) as x
    from cita c
    join cliente cl on cl.id = c.cliente_id
    join servicio s on s.id = c.servicio_id
    left join membresia m on m.id = c.profesional_id
    where c.negocio_id = p_negocio
      and not c.eliminado
      and c.fecha between p_desde and p_hasta
      and (p_profesional is null or c.profesional_id = p_profesional)
      and (p_servicio is null or c.servicio_id = p_servicio)
      and (p_estado is null or c.estado = p_estado)
  ) t;
$$;

-- =====================================================================
-- 3 · TRES LLAVES FORANEAS QUE NO SE PODIAN EJECUTAR
--
-- Las tres son COMPUESTAS —`(negocio_id, x_id)`— y las tres decian
-- `on delete set null` a secas. Un `set null` pelon sobre una llave compuesta
-- vacia LAS DOS columnas, y `negocio_id` no acepta nulos: el borrado revienta
-- y la fila de la izquierda no se puede borrar nunca.
--
-- En la practica se notaba asi: dar de baja a una terapeuta, borrar una venta
-- o borrar una categoria fallaba con un error de columna nula que no decia
-- nada de la llave. Ahora se nombra la columna que si se debe vaciar.
--
-- Lo encontro un ataque nuevo, no una revision a ojo.
-- =====================================================================

alter table cita drop constraint if exists cita_profesional_mismo_negocio;
alter table cita add constraint cita_profesional_mismo_negocio
  foreign key (negocio_id, profesional_id) references membresia (negocio_id, id)
  -- `set null (columna)` y NO `set null` a secas. La llave es COMPUESTA: un
  -- `set null` pelon vacia las DOS columnas, y `negocio_id` no acepta nulos —
  -- asi que el borrado revienta y la fila de la izquierda no se puede borrar
  -- nunca. Se nombra la columna que si se debe vaciar.
  on delete set null (profesional_id);

alter table inscripcion drop constraint if exists inscripcion_venta_mismo_negocio;
alter table inscripcion add constraint inscripcion_venta_mismo_negocio
  foreign key (negocio_id, venta_id) references venta (negocio_id, id)
  -- `set null (columna)` y NO `set null` a secas. La llave es COMPUESTA: un
  -- `set null` pelon vacia las DOS columnas, y `negocio_id` no acepta nulos —
  -- asi que el borrado revienta y la fila de la izquierda no se puede borrar
  -- nunca. Se nombra la columna que si se debe vaciar.
  on delete set null (venta_id);

-- La columna del terapeuta asignado llego con el bloque de Clientes. Se
-- vuelve a declarar por si este archivo se corre sin aquel: `if not exists`
-- no toca nada cuando ya esta.
alter table cliente add column if not exists profesional_id uuid;

alter table cliente drop constraint if exists cliente_profesional_mismo_negocio;
alter table cliente add constraint cliente_profesional_mismo_negocio
  foreign key (negocio_id, profesional_id) references membresia (negocio_id, id)
  -- Si esa persona deja el centro, sus clientes se quedan SIN asignar, no se
  -- borran. `set null` y no `restrict`: nadie deberia tener que reasignar
  -- doscientos expedientes a mano para poder dar de baja a alguien.
  -- `set null (columna)` y NO `set null` a secas. La llave es COMPUESTA: un
  -- `set null` pelon vacia las DOS columnas, y `negocio_id` no acepta nulos —
  -- asi que el borrado revienta y la fila de la izquierda no se puede borrar
  -- nunca. Se nombra la columna que si se debe vaciar.
  on delete set null (profesional_id);

-- =====================================================================
-- LISTO. Si no salio ningun error en rojo, la base ya tiene todo lo que
-- necesitan las pantallas de Servicios.
--
-- Esto se probo aplicandolo sobre un Postgres limpio, con la base instalada
-- primero, y corriendo los 90 ataques encima. No es una lectura a ojo.
-- =====================================================================
