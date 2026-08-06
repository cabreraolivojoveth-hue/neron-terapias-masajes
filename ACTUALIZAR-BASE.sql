-- =====================================================================
-- ACTUALIZAR LA BASE — pegar completo en Supabase → SQL Editor → Run
-- =====================================================================
--
-- QUE TRAE: lo que la base necesita para los bloques 2 (Clientes) y para la
-- conexion Agenda ↔ Recordatorios.
--
-- ES SEGURO CORRERLO LAS VECES QUE HAGA FALTA. No borra nada, no reescribe
-- ningun dato y no toca una sola fila existente: solo agrega una columna
-- nueva (que puede estar vacia) y crea o reemplaza funciones. Si ya lo
-- corriste, correrlo otra vez no cambia nada.
--
-- EL ARCHIVO COMPLETO Y CON TODAS LAS EXPLICACIONES sigue siendo
-- INSTALAR-EN-TERAPIAS.sql. Este es solo el pedazo nuevo, para no tener que
-- pegar dos mil lineas cada vez.
--
-- =====================================================================


-- =====================================================================
-- 1 · AGENDA ↔ RECORDATORIOS
--
-- Los recordatorios de una cita se mueven CON ella al reagendar, y se
-- descartan cuando la cita se cierra. Va dentro de la misma transaccion a
-- proposito: hacerlo desde el navegador deja una ventana en la que la cita
-- queda el martes y su recordatorio sigue avisando del lunes.
-- =====================================================================

create or replace function public.reagendar_cita(
  p_cita uuid, p_fecha date, p_hora_inicio time,
  p_profesional uuid default null, p_motivo text default null
)
returns cita
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cita     cita;
  v_antes    jsonb;
  v_duracion int;
  v_quien    membresia;
begin
  select * into v_cita from cita where id = p_cita and not eliminado;
  if v_cita.id is null then
    raise exception 'La cita no existe.' using errcode = 'no_data_found';
  end if;

  -- Los porteros van AQUI: un `security definer` se salta las reglas de fila,
  -- asi que sin esto cualquiera con sesion movería citas de otro centro.
  if not app.es_miembro(v_cita.negocio_id) then
    raise exception 'Esa cita no es de tu centro.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_cita.negocio_id, 'gestionarAgenda') then
    raise exception 'No tienes permiso para mover citas.' using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(v_cita.negocio_id) then
    raise exception 'La licencia no permite registrar operaciones.' using errcode = 'insufficient_privilege';
  end if;
  if v_cita.estado in ('cancelada', 'completada') then
    raise exception 'Una cita % ya no se puede mover.', v_cita.estado
      using errcode = 'invalid_parameter_value';
  end if;

  v_antes := jsonb_build_object(
    'fecha', v_cita.fecha, 'horaInicio', v_cita.hora_inicio, 'profesionalId', v_cita.profesional_id);

  select duracion_min into v_duracion from servicio where id = v_cita.servicio_id;

  update cita
     set fecha = p_fecha,
         hora_inicio = p_hora_inicio,
         -- La hora de fin se recalcula desde la duracion del servicio. Si se
         -- arrastrara la anterior, mover una cita de 90 minutos a otra hora
         -- podria dejarla de 30.
         hora_fin = p_hora_inicio + make_interval(mins => coalesce(v_duracion, 60)),
         profesional_id = coalesce(p_profesional, v_cita.profesional_id),
         actualizado_en = now()
   where id = p_cita
  returning * into v_cita;

  /**
   * LOS RECORDATORIOS DE ESA CITA SE MUEVEN CON ELLA, y va DENTRO de la misma
   * transaccion a proposito.
   *
   * Hacerlo desde el navegador —mover la cita, luego mover el recordatorio—
   * tiene una ventana: si la red se cae en medio, la cita queda el martes y su
   * recordatorio sigue avisando del lunes. Nadie se entera hasta que el aviso
   * sale con la fecha vieja. Aqui pasa entero o no pasa.
   *
   * Se conserva el DESFASE: un recordatorio puesto para el dia anterior sigue
   * quedando el dia anterior a la fecha nueva. Empujarlos todos a la fecha de
   * la cita convertiria un "confirmar 24 horas antes" en un aviso el mismo dia.
   *
   * Solo los PENDIENTES. Uno ya hecho es historia y no se reescribe.
   */
  update recordatorio r
     set fecha = p_fecha - ((v_antes->>'fecha')::date - r.fecha)
   where r.negocio_id = v_cita.negocio_id
     and r.entidad_tipo = 'cita'
     and r.entidad_id = p_cita
     and r.estado = 'pendiente'
     and not r.eliminado;

  select * into v_quien from membresia
   where negocio_id = v_cita.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues, motivo)
  values (v_cita.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce(v_quien.rol, 'desconocido'), 'agenda', 'reagendar', p_cita::text, v_antes,
          jsonb_build_object('fecha', v_cita.fecha, 'horaInicio', v_cita.hora_inicio,
                             'profesionalId', v_cita.profesional_id),
          p_motivo);

  return v_cita;
end;
$$;

create or replace function public.cambiar_estado_cita(
  p_cita uuid, p_estado text, p_motivo text default null
)
returns cita
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cita  cita;
  v_antes text;
  v_quien membresia;
begin
  select * into v_cita from cita where id = p_cita and not eliminado;
  if v_cita.id is null then
    raise exception 'La cita no existe.' using errcode = 'no_data_found';
  end if;
  if not app.es_miembro(v_cita.negocio_id) then
    raise exception 'Esa cita no es de tu centro.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_cita.negocio_id, 'gestionarAgenda') then
    raise exception 'No tienes permiso para cambiar citas.' using errcode = 'insufficient_privilege';
  end if;

  if p_estado not in ('pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio') then
    raise exception 'Estado desconocido: %', p_estado using errcode = 'invalid_parameter_value';
  end if;

  -- Una cita cancelada NO revive. Si la persona vuelve a agendar, es una
  -- cita nueva: si se reviviera, el horario que ya se le dio a alguien mas
  -- quedaria con dos citas y la restriccion de choque lo rechazaria en un
  -- lugar donde el mensaje no ayuda a nadie.
  if v_cita.estado = 'cancelada' and p_estado <> 'cancelada' then
    raise exception 'Una cita cancelada no se reactiva: se agenda una nueva.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_antes := v_cita.estado;

  update cita set estado = p_estado, actualizado_en = now(),
                  notas = case when p_motivo is null then notas
                               else coalesce(notas || E'\n', '') || p_motivo end
   where id = p_cita
  returning * into v_cita;

  /**
   * UNA CITA QUE SE CIERRA APAGA SUS RECORDATORIOS PENDIENTES.
   *
   * El caso concreto: se cancela la cita del jueves y al dia siguiente sale
   * igual el recordatorio de confirmarla. La paciente recibe un aviso de una
   * cita que ya no existe, y a partir de ahi deja de creerles a los avisos.
   *
   * Se marcan `descartado`, NO se borran: el recordatorio siguio existiendo y
   * borrarlo dejaria un hueco en el rastro de por que nadie la confirmo.
   *
   * "Completada" tambien los apaga: recordar confirmar una cita que ya se dio
   * no le sirve a nadie. "No asistio" igual — esa cita ya termino.
   */
  if p_estado in ('cancelada', 'completada', 'no_asistio') then
    update recordatorio
       set estado = 'descartado'
     where negocio_id = v_cita.negocio_id
       and entidad_tipo = 'cita'
       and entidad_id = p_cita
       and estado = 'pendiente'
       and not eliminado;
  end if;

  select * into v_quien from membresia
   where negocio_id = v_cita.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues, motivo)
  values (v_cita.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce(v_quien.rol, 'desconocido'), 'agenda', 'estado', p_cita::text,
          jsonb_build_object('estado', v_antes), jsonb_build_object('estado', p_estado), p_motivo);

  return v_cita;
end;
$$;


-- =====================================================================
-- CLIENTES — el expediente comercial de una persona
-- =====================================================================

-- ---------------------------------------------------------------------
-- EL TERAPEUTA ASIGNADO — aditivo, y distinto del que atendio una cita
-- ---------------------------------------------------------------------
--
-- SON DOS CONCEPTOS DISTINTOS Y CONFUNDIRLOS BORRA HISTORIA.
--
-- `cliente.profesional_id` es con quien se atiende HABITUALMENTE hoy.
-- `cita.profesional_id` es quien atendio ESA cita, y no se toca nunca mas.
--
-- Si fueran el mismo campo, cambiar de terapeuta reescribiria quien atendio
-- las sesiones del año pasado — y entonces los reportes por terapeuta dejan
-- de significar nada.
--
alter table cliente add column if not exists profesional_id uuid;

alter table cliente drop constraint if exists cliente_profesional_mismo_negocio;
alter table cliente add constraint cliente_profesional_mismo_negocio
  foreign key (negocio_id, profesional_id) references membresia (negocio_id, id)
  -- Si esa persona deja el centro, sus clientes se quedan SIN asignar, no se
  -- borran. `set null` y no `restrict`: nadie deberia tener que reasignar
  -- doscientos expedientes a mano para poder dar de baja a alguien.
  on delete set null;

create index if not exists cliente_profesional_idx on cliente (negocio_id, profesional_id)
  where not eliminado;
-- El buscador de la lista compara telefono y correo, no solo el nombre.
create index if not exists cliente_contacto_idx on cliente (negocio_id, telefono, correo)
  where not eliminado;

-- ---------------------------------------------------------------------
-- LAS DOS REGLAS DEL DOMINIO, ESCRITAS UNA SOLA VEZ
-- ---------------------------------------------------------------------
--
-- "Activo" y "frecuente" no son opiniones de una pantalla: son reglas del
-- negocio. Si Clientes contara una cosa y Reportes otra, los dos numeros
-- serian verdad y nadie sabria cual usar.
--
-- Viven aqui, en la base, para que cualquier modulo que las necesite las
-- pregunte en vez de reinventarlas.
--
create or replace function app.meses_de_actividad() returns int
  language sql immutable as $$ select 6 $$;

create or replace function app.visitas_para_ser_frecuente() returns int
  language sql immutable as $$ select 5 $$;

comment on function app.meses_de_actividad() is
  'Un cliente esta ACTIVO si tuvo una cita completada en este plazo. Seis meses: en un centro de '
  'terapias, alguien que vino en marzo y estamos en agosto sigue siendo cliente, no un desconocido.';
comment on function app.visitas_para_ser_frecuente() is
  'Cuantas sesiones completadas hacen a alguien FRECUENTE. Cuando exista Configuracion, sale de ahi.';

-- ---------------------------------------------------------------------
-- EL PROXIMO CUMPLEAÑOS, con el 29 de febrero resuelto
-- ---------------------------------------------------------------------
--
-- `make_date(2027, 2, 29)` REVIENTA: ese dia no existe. Sin esto, un solo
-- paciente nacido en año bisiesto tumba el panel de cumpleaños entero tres
-- de cada cuatro años — y el error aparece en una pantalla que no habla de
-- fechas.
--
-- Se corre al 28 y no al 1 de marzo: es lo que hace la gente.
--
create or replace function app.cumple_en(p_nacimiento date, p_anio int)
returns date
language sql
immutable
as $$
  select case
    when extract(month from p_nacimiento) = 2 and extract(day from p_nacimiento) = 29
         and not (p_anio % 4 = 0 and (p_anio % 100 <> 0 or p_anio % 400 = 0))
      then make_date(p_anio, 2, 28)
    else make_date(p_anio, extract(month from p_nacimiento)::int,
                           extract(day from p_nacimiento)::int)
  end;
$$;

create or replace function app.proximo_cumpleanos(p_nacimiento date, p_hoy date)
returns date
language sql
immutable
as $$
  -- El de este año si todavia no pasa; si ya paso, el del que viene. Asi el
  -- 30 de diciembre se ven los cumpleaños de enero.
  select case
    when app.cumple_en(p_nacimiento, extract(year from p_hoy)::int) >= p_hoy
      then app.cumple_en(p_nacimiento, extract(year from p_hoy)::int)
    else app.cumple_en(p_nacimiento, extract(year from p_hoy)::int + 1)
  end;
$$;

-- ---------------------------------------------------------------------
-- LA LISTA DE CLIENTES — buscada, filtrada y paginada EN LA BASE
-- ---------------------------------------------------------------------
--
-- POR QUE NO SE BAJA LA TABLA Y SE FILTRA EN EL NAVEGADOR: porque funciona
-- perfecto con veinte clientes y se cae con dos mil. Y peor: para pintar
-- "ultima visita" y "visitas" habria que pedir el historial de cada uno —el
-- problema N+1 en su forma mas cara, una consulta por renglon.
--
-- Aqui las dos cifras salen en la MISMA consulta, ya calculadas.
--
-- NADA DE ESTO SE GUARDA EN `cliente`. `ultima_visita` y `visitas` se cuentan
-- cada vez: un contador a mano se desincroniza a la primera cita cancelada.
--
-- `security invoker` a proposito: las reglas de fila se aplican a quien llama.
-- Un centro no puede pedir los pacientes de otro ni equivocandose.
--
create or replace function public.clientes_del_centro(
  p_negocio text,
  p_busqueda text default null,
  p_estado text default null,
  p_profesional uuid default null,
  p_visitas_min int default null,
  p_visitas_max int default null,
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
    select
      c.id, c.nombre, c.telefono, c.correo, c.fecha_nacimiento,
      c.profesional_id, c.eliminado, c.creado_en,
      coalesce(x.visitas, 0) as visitas,
      x.ultima_visita
    from cliente c
    left join lateral (
      select count(*)::int as visitas, max(v.fecha) as ultima_visita
      from cita v
      where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado
    ) x on true
    where c.negocio_id = p_negocio
  ),
  conestado as (
    select b.*,
      case
        -- ARCHIVADO gana sobre todo lo demas: un expediente guardado no es
        -- "inactivo", es uno que alguien decidio sacar de la lista.
        when b.eliminado then 'archivado'
        when b.ultima_visita is not null
             and b.ultima_visita >= p_hoy - (app.meses_de_actividad() * 30) then 'activo'
        else 'inactivo'
      end as estado
    from base b
  ),
  filtrado as (
    select x.* from conestado x
    where
      -- Los archivados NO salen salvo que se pidan por su nombre. Si salieran
      -- mezclados, la lista contaria gente que ya nadie atiende.
      (x.estado <> 'archivado' or p_estado = 'archivado')
      and (p_estado is null or p_estado = '' or x.estado = p_estado)
      and (p_profesional is null or x.profesional_id = p_profesional)
      and (p_visitas_min is null or x.visitas >= p_visitas_min)
      and (p_visitas_max is null or x.visitas <= p_visitas_max)
      and (
        p_busqueda is null or p_busqueda = ''
        or x.nombre ilike '%' || p_busqueda || '%'
        or coalesce(x.telefono, '') ilike '%' || p_busqueda || '%'
        or coalesce(x.correo, '') ilike '%' || p_busqueda || '%'
      )
  )
  select jsonb_build_object(
    -- El total va SIN paginar: es lo que sostiene "Mostrando 10 de 340".
    'total', (select count(*) from filtrado),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'nombre', f.nombre,
        'telefono', f.telefono,
        'correo', f.correo,
        'fechaNacimiento', f.fecha_nacimiento,
        'profesionalId', f.profesional_id,
        -- El nombre del terapeuta se RESUELVE al leer, no se copia.
        'profesional', (select m.nombre from membresia m where m.id = f.profesional_id),
        'visitas', f.visitas,
        'ultimaVisita', f.ultima_visita,
        'estado', f.estado,
        'creadoEn', f.creado_en
      ) order by f.nombre)
      from (
        select * from filtrado
        order by nombre
        limit greatest(coalesce(p_por_pagina, 10), 1)
        offset greatest(coalesce(p_pagina, 1) - 1, 0) * greatest(coalesce(p_por_pagina, 10), 1)
      ) f
    ), '[]'::jsonb)
  );
$$;

comment on function public.clientes_del_centro is
  'La lista con "ultima visita" y "visitas" YA CALCULADAS, en una sola consulta. Bajar la tabla y '
  'contar en el navegador funciona con veinte clientes y se cae con dos mil.';

-- ---------------------------------------------------------------------
-- EL RESUMEN DE CLIENTES — las cinco tarjetas y el pie, en un viaje
-- ---------------------------------------------------------------------
create or replace function public.resumen_clientes(p_negocio text, p_hoy date default current_date)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with vivos as (
    select c.* from cliente c where c.negocio_id = p_negocio and not c.eliminado
  ),
  visitas as (
    select v.cliente_id, count(*)::int as n, max(v.fecha) as ultima
    from cita v
    where v.negocio_id = p_negocio and v.estado = 'completada' and not v.eliminado
    group by v.cliente_id
  ),
  -- El adeudo de cada venta cobrada: lo que se cobro menos lo que se ha
  -- pagado. La verdad financiera vive en venta y pago; aqui solo se suma.
  saldos as (
    select ve.id, ve.total_centavos - coalesce((
      select sum(pg.monto_centavos) from pago pg where pg.venta_id = ve.id
    ), 0) as saldo
    from venta ve
    where ve.negocio_id = p_negocio and ve.estado = 'cobrada' and not ve.eliminado
      and ve.cliente_id is not null
  )
  select jsonb_build_object(
    'total', (select count(*) from vivos),
    'activos', (
      select count(*) from vivos c join visitas v on v.cliente_id = c.id
      where v.ultima >= p_hoy - (app.meses_de_actividad() * 30)
    ),
    -- NUEVOS ESTE MES se calcula, no se guarda un `es_nuevo` que despues
    -- nadie apaga el dia primero del mes siguiente.
    'nuevosEsteMes', (
      select count(*) from vivos c
      where c.creado_en >= date_trunc('month', p_hoy::timestamp)
        and c.creado_en < date_trunc('month', p_hoy::timestamp) + interval '1 month'
    ),
    'frecuentes', (
      select count(*) from vivos c join visitas v on v.cliente_id = c.id
      where v.n >= app.visitas_para_ser_frecuente()
    ),
    -- SOLO LAS COMPLETADAS son una visita. Una cancelada no es una visita, y
    -- una pendiente todavia no ha pasado.
    'totalVisitas', coalesce((select sum(v.n) from visitas v), 0),
    'citasProximas', (
      select count(*) from cita
      where negocio_id = p_negocio and not eliminado
        and estado in ('pendiente', 'confirmada')
        and fecha >= p_hoy and fecha <= p_hoy + 7
    ),
    'serviciosContratados', coalesce((
      select sum(vi.cantidad)::int from venta_item vi
      join venta ve on ve.id = vi.venta_id
      where vi.negocio_id = p_negocio and vi.tipo = 'servicio'
        and ve.estado = 'cobrada' and not ve.eliminado and ve.cliente_id is not null
    ), 0),
    'comprasRealizadas', (
      select count(*) from venta
      where negocio_id = p_negocio and estado = 'cobrada' and not eliminado
        and cliente_id is not null
    ),
    'cursosInscritos', (
      select count(*) from inscripcion
      where negocio_id = p_negocio and estado <> 'cancelado'
    ),
    -- Un saldo NEGATIVO —pagaron de mas— no resta del adeudo total: se
    -- ignora. Si restara, un anticipo de un cliente taparia la deuda de otro.
    'totalAdeudos', coalesce((select sum(s.saldo) from saldos s where s.saldo > 0), 0),
    'cumpleanos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'nombre', k.nombre, 'fecha', k.proximo, 'enDias', k.en_dias
      ) order by k.en_dias, k.nombre)
      from (
        select c.id, c.nombre,
          app.proximo_cumpleanos(c.fecha_nacimiento, p_hoy) as proximo,
          (app.proximo_cumpleanos(c.fecha_nacimiento, p_hoy) - p_hoy)::int as en_dias
        from vivos c
        where c.fecha_nacimiento is not null
      ) k
      where k.en_dias <= 30
      limit 5
    ), '[]'::jsonb)
  );
$$;

comment on function public.resumen_clientes is
  'Las cinco tarjetas y el pie del modulo Clientes en un solo viaje. Ninguna cifra esta guardada: '
  'todas se cuentan desde su modulo dueño.';

-- ---------------------------------------------------------------------
-- EL EXPEDIENTE DE UNA PERSONA — lo que Clientes UNE, no lo que guarda
-- ---------------------------------------------------------------------
--
-- Cada cifra viene de su modulo: las visitas de Agenda, las compras de
-- Ventas, el adeudo de Ventas menos Pagos, los cursos de Inscripciones.
-- Clientes no guarda ni una.
--
create or replace function public.expediente_del_cliente(
  p_cliente uuid, p_hoy date default current_date
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
    'telefono', c.telefono,
    'correo', c.correo,
    'fechaNacimiento', c.fecha_nacimiento,
    'notas', c.notas,
    'clienteDesde', c.creado_en,
    'archivado', c.eliminado,
    'profesionalId', c.profesional_id,
    'profesional', (select m.nombre from membresia m where m.id = c.profesional_id),
    'visitas', (select count(*) from cita v
                 where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado),
    'canceladas', (select count(*) from cita v
                    where v.cliente_id = c.id and v.estado = 'cancelada' and not v.eliminado),
    'noAsistio', (select count(*) from cita v
                   where v.cliente_id = c.id and v.estado = 'no_asistio' and not v.eliminado),
    'ultimaVisita', (select jsonb_build_object('fecha', v.fecha, 'servicio', s.nombre)
                      from cita v join servicio s on s.id = v.servicio_id
                      where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado
                      order by v.fecha desc, v.hora_inicio desc limit 1),
    'proximaCita', (select jsonb_build_object('id', v.id, 'fecha', v.fecha,
                                              'hora', v.hora_inicio, 'servicio', s.nombre)
                     from cita v join servicio s on s.id = v.servicio_id
                     where v.cliente_id = c.id and not v.eliminado
                       and v.estado in ('pendiente', 'confirmada') and v.fecha >= p_hoy
                     order by v.fecha, v.hora_inicio limit 1),
    'compras', (select count(*) from venta ve
                 where ve.cliente_id = c.id and ve.estado = 'cobrada' and not ve.eliminado),
    'totalGastado', coalesce((select sum(ve.total_centavos) from venta ve
                               where ve.cliente_id = c.id and ve.estado = 'cobrada'
                                 and not ve.eliminado), 0),
    'adeudo', greatest(coalesce((
      select sum(ve.total_centavos - coalesce((
        select sum(pg.monto_centavos) from pago pg where pg.venta_id = ve.id
      ), 0))
      from venta ve
      where ve.cliente_id = c.id and ve.estado = 'cobrada' and not ve.eliminado
    ), 0), 0),
    'cursos', (select count(*) from inscripcion i
                where i.cliente_id = c.id and i.estado <> 'cancelado'),
    -- Los servicios que ESTA persona ha recibido, contados desde sus citas
    -- completadas. No hay ninguna lista de textos guardada en el cliente.
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', y.nombre, 'veces', y.veces)
                       order by y.veces desc, y.nombre)
      from (
        select s.nombre, count(*)::int as veces
        from cita v join servicio s on s.id = v.servicio_id
        where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado
        group by s.nombre
        limit 5
      ) y
    ), '[]'::jsonb)
  )
  from cliente c
  where c.id = p_cliente;
$$;

comment on function public.expediente_del_cliente is
  'El expediente UNE lo que ya vive en otros modulos. Ni una de estas cifras esta guardada en la '
  'tabla cliente: se cuentan desde citas, ventas, pagos e inscripciones.';
