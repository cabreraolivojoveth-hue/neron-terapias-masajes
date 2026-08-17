-- =====================================================================
-- PARTE 2 DE 6 — pegar en Supabase -> SQL Editor -> Run
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
        -- LOS MINUTOS QUE DE VERDAD SE VAN A BLOQUEAR, ya resueltos: los del
        -- servicio si los tiene, si no los de su categoria, si no cero. La
        -- lista enseña lo que va a pasar, no lo que esta escrito en la fila.
        'preparacionAntesMin', (select antes from app.preparacion_del_servicio(f.id)),
        'preparacionDespuesMin', (select despues from app.preparacion_del_servicio(f.id)),
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
    /*
     * LOS MINUTOS DE PREPARACION VAN EN DOS PARES, y hacen falta los dos.
     *
     * El par "…Min" es lo ESCRITO en el servicio, y puede ser nulo: nulo
     * significa "lo que diga mi categoria", no cero. El par "efectiva…" es lo
     * que de verdad se va a bloquear despues de resolver la herencia.
     *
     * Con uno solo, el formulario no puede distinguir "no lo he puesto" de
     * "lo puse en cero a proposito" — y son cosas distintas: la primera sigue
     * a la categoria y la segunda la desobedece.
     */
    'preparacionAntesMin', s.preparacion_antes_min,
    'preparacionDespuesMin', s.preparacion_despues_min,
    'efectivaAntesMin', (select antes from app.preparacion_del_servicio(s.id)),
    'efectivaDespuesMin', (select despues from app.preparacion_del_servicio(s.id)),
    'categoriaAntesMin', (select k.preparacion_antes_min from categoria k where k.id = s.categoria_id),
    'categoriaDespuesMin', (select k.preparacion_despues_min from categoria k where k.id = s.categoria_id),
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
  p_activo boolean default true,
  -- NULO NO ES CERO. Nulo es "lo que diga mi categoria"; cero es "ninguno, y
  -- lo digo yo". Por eso no llevan `coalesce` al guardar.
  p_preparacion_antes int default null,
  p_preparacion_despues int default null
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
  /*
   * EL TOPE DE CUATRO HORAS NO ES UN CAPRICHO.
   *
   * La preparacion BLOQUEA agenda de verdad. Un cero de mas —"150" en vez de
   * "15"— convierte un servicio de una hora en un bloque de dos y media, y lo
   * que se ve despues es "no hay horarios disponibles" sin ninguna pista de
   * por que. Se rechaza en la puerta y con el numero delante.
   */
  if p_preparacion_antes is not null and (p_preparacion_antes < 0 or p_preparacion_antes > 240) then
    raise exception 'La preparacion previa son entre 0 y 240 minutos, no %.', p_preparacion_antes
      using errcode = 'invalid_parameter_value';
  end if;
  if p_preparacion_despues is not null and (p_preparacion_despues < 0 or p_preparacion_despues > 240) then
    raise exception 'La preparacion posterior son entre 0 y 240 minutos, no %.', p_preparacion_despues
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if p_id is null then
    insert into servicio (negocio_id, nombre, descripcion, categoria_id, duracion_min,
                          precio_centavos, precio_promocional_centavos, promocion_desde,
                          promocion_hasta, color, requiere_preparacion, preparacion, notas,
                          dias_disponibles, hora_desde, hora_hasta, activo,
                          preparacion_antes_min, preparacion_despues_min)
    values (p_negocio, btrim(p_nombre), p_descripcion, p_categoria, p_duracion,
            p_precio, p_promo, p_promo_desde, p_promo_hasta, p_color,
            coalesce(p_requiere_preparacion, false), p_preparacion, p_notas,
            p_dias, p_hora_desde, p_hora_hasta, coalesce(p_activo, true),
            p_preparacion_antes, p_preparacion_despues)
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
         activo = coalesce(p_activo, v_s.activo),
         preparacion_antes_min = p_preparacion_antes,
         preparacion_despues_min = p_preparacion_despues,
         actualizado_en = now()
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

create or replace function public.cursos_del_centro(
  p_negocio text,
  p_busqueda text default null,
  p_estado text default null,
  p_categoria uuid default null,
  p_instructor uuid default null,
  p_modalidad text default null,
  p_con_lugares boolean default null,
  p_hoy date default current_date,
  p_pagina int default 1,
  p_por_pagina int default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select
      c.*,
      app.estado_del_curso(c.estado, c.activo, c.fecha_inicio, c.fecha_fin, p_hoy) as vida,
      app.lugares_ocupados(c.id) as ocupados,
      (select count(*) from sesion_curso s
        where s.curso_id = c.id and not s.eliminado) as sesiones,
      (select k.nombre from categoria k where k.id = c.categoria_id) as categoria,
      (select k.color  from categoria k where k.id = c.categoria_id) as categoria_color,
      (select m.nombre from membresia m where m.id = c.instructor_id) as instructor
    from curso c
    where c.negocio_id = p_negocio
      and not c.eliminado
      and (p_categoria  is null or c.categoria_id  = p_categoria)
      and (p_instructor is null or c.instructor_id = p_instructor)
      and (p_modalidad  is null or c.modalidad     = p_modalidad)
      -- El buscador mira nombre, subtitulo y descripcion. Sin acentos no se
      -- puede: `ilike` ya ignora mayusculas, que es lo que la gente escribe mal.
      and (p_busqueda is null or (
            c.nombre      ilike '%' || p_busqueda || '%'
         or c.subtitulo   ilike '%' || p_busqueda || '%'
         or c.descripcion ilike '%' || p_busqueda || '%'))
  ),
  filtrada as (
    select * from base
    where (p_estado is null or vida = p_estado)
      -- "Con lugares disponibles" es una pregunta real de mostrador: sirve
      -- para saber a quien todavia se le puede ofrecer.
      and (p_con_lugares is not true or cupo is null or ocupados < cupo)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    'filas', coalesce((
      -- Se agrega desde la subconsulta ya paginada y ordenada. El alias es
      -- `t`: referirse a `x` aqui afuera no compila.
      select jsonb_agg(t.x order by t.orden desc)
      from (
        select jsonb_build_object(
          'id', f.id,
          'nombre', f.nombre,
          'subtitulo', f.subtitulo,
          'categoriaId', f.categoria_id,
          'categoria', f.categoria,
          'categoriaColor', f.categoria_color,
          'instructorId', f.instructor_id,
          'instructor', f.instructor,
          'fechaInicio', f.fecha_inicio,
          'fechaFin', f.fecha_fin,
          'sesiones', f.sesiones,
          'precioCentavos', f.precio_centavos,
          'cupo', f.cupo,
          'ocupados', f.ocupados,
          'modalidad', f.modalidad,
          'imagenUrl', f.imagen_url,
          'videoYoutube', f.video_youtube,
          'vida', f.vida,
          'activo', f.activo
        ) as x,
        -- Los proximos primero, que es lo que se administra. Los finalizados
        -- se hunden solos sin tener que filtrarlos a mano.
        f.fecha_inicio as orden
        from filtrada f
        order by f.fecha_inicio desc
        limit greatest(p_por_pagina, 1)
        offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)
      ) t
    ), '[]'::jsonb)
  );
$$;

create or replace function public.ficha_del_curso(
  p_curso uuid, p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id,
    'nombre', c.nombre,
    'subtitulo', c.subtitulo,
    'descripcion', c.descripcion,
    'notas', c.notas,
    'categoriaId', c.categoria_id,
    'categoria', (select k.nombre from categoria k where k.id = c.categoria_id),
    'categoriaColor', (select k.color from categoria k where k.id = c.categoria_id),
    'instructorId', c.instructor_id,
    'instructor', (select m.nombre from membresia m where m.id = c.instructor_id),
    'fechaInicio', c.fecha_inicio,
    'fechaFin', c.fecha_fin,
    'precioCentavos', c.precio_centavos,
    'cupo', c.cupo,
    'ocupados', app.lugares_ocupados(c.id),
    'enEspera', (select count(*) from inscripcion i
                 where i.curso_id = c.id and i.estado = 'lista_espera'),
    'modalidad', c.modalidad,
    'lugar', c.lugar,
    'enlace', c.enlace,
    'imagenUrl', c.imagen_url,
    -- El identificador pelon, no una direccion. La arma la pantalla, y por eso
    -- siempre apunta a YouTube pase lo que pase con lo que se pego.
    'videoYoutube', c.video_youtube,
    'estado', c.estado,
    'activo', c.activo,
    'vida', app.estado_del_curso(c.estado, c.activo, c.fecha_inicio, c.fecha_fin, p_hoy),
    -- Los ALUMNOS son clientes con inscripcion. El nombre se RESUELVE al leer:
    -- si mañana se cambia el apellido, esta lista lo muestra al dia.
    'alumnos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'clienteId', i.cliente_id, 'nombre', cl.nombre,
        'telefono', cl.telefono, 'correo', cl.correo,
        'estado', i.estado, 'origen', i.origen,
        'inscritoEn', i.creado_en,
        -- El dinero se dice APARTE del estado de inscripcion: se puede estar
        -- inscrito y deber, y se puede haber pagado y luego cancelar.
        'pagada', i.venta_id is not null
      ) order by i.creado_en)
      from inscripcion i
      join cliente cl on cl.id = i.cliente_id
      where i.curso_id = c.id
    ), '[]'::jsonb),
    'sesiones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'titulo', s.titulo, 'fecha', s.fecha,
        'horaInicio', s.hora_inicio, 'horaFin', s.hora_fin,
        'instructorId', s.instructor_id,
        'instructor', (select m.nombre from membresia m where m.id = s.instructor_id),
        'lugar', s.lugar, 'estado', s.estado
      ) order by s.fecha, s.hora_inicio)
      from sesion_curso s
      where s.curso_id = c.id and not s.eliminado
    ), '[]'::jsonb),
    'material', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'titulo', m.titulo, 'tipo', m.tipo, 'url', m.url,
        'descripcion', m.descripcion, 'visibleParaAlumnos', m.visible_para_alumnos
      ) order by m.creado_en)
      from material_curso m
      where m.curso_id = c.id and not m.eliminado
    ), '[]'::jsonb)
  )
  from curso c
  where c.id = p_curso and not c.eliminado;
$$;
