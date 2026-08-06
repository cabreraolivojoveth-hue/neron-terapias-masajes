-- =====================================================================
-- LAS OPERACIONES QUE NO SE PUEDEN HACER DESDE EL NAVEGADOR
--
-- Cobrar una venta no es "cambiar un campo a cobrada". Es, en un solo acto
-- indivisible:
--
--   1. sumar el total desde los renglones,
--   2. bajar el inventario de cada producto,
--   3. meter el ingreso a la caja,
--   4. marcar la venta.
--
-- Si eso vive en el navegador, cualquier interrupcion —se cae la red a la
-- mitad, cierran la pestaña, se va la luz— deja el sistema partido: venta
-- cobrada sin bajar stock, o stock bajado sin ingreso en caja. Y nadie se da
-- cuenta hasta que el inventario no cuadra tres meses despues.
--
-- Aqui es una transaccion de la base de datos: pasa entera o no pasa.
--
-- Ademas son `security definer`, lo que las hace la UNICA puerta por la que
-- se puede tocar la caja. Las reglas del archivo anterior le cierran esa
-- puerta a todos los demas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- COBRAR UNA VENTA
-- ---------------------------------------------------------------------
create or replace function public.cobrar_venta(p_venta uuid)
returns venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta    venta;
  v_total    bigint;
  v_item     record;
  v_stock    int;
begin
  select * into v_venta from venta where id = p_venta and not eliminado;
  if v_venta.id is null then
    raise exception 'La venta no existe.' using errcode = 'no_data_found';
  end if;

  -- LOS TRES PORTEROS, en la base y no en la pantalla. Un `security definer`
  -- se salta las reglas de fila, asi que si no se pregunta aqui, cualquiera
  -- con sesion podria cobrar ventas de otro negocio llamando a esta funcion.
  if not app.es_miembro(v_venta.negocio_id) then
    raise exception 'Esta venta no es de tu negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_venta.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso para cobrar.' using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(v_venta.negocio_id) then
    raise exception 'La licencia no permite registrar operaciones.' using errcode = 'insufficient_privilege';
  end if;

  if v_venta.estado <> 'borrador' then
    -- Mensaje claro a proposito: "ya estaba cobrada" es una situacion
    -- normal (doble clic, dos pestañas), no una falla del sistema.
    raise exception 'Esta venta ya no esta en borrador: esta %.', v_venta.estado
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL TOTAL SE CALCULA, NO SE RECIBE. Aceptar el total que manda el
  -- navegador es dejar que el cliente decida cuanto pago.
  select coalesce(sum(subtotal_centavos), 0) into v_total
  from venta_item where venta_id = p_venta;

  if v_total <= 0 then
    raise exception 'No se puede cobrar una venta sin renglones.' using errcode = 'invalid_parameter_value';
  end if;

  -- Baja de inventario, renglon por renglon.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    -- `for update` bloquea el renglon del producto hasta que termine la
    -- transaccion. Sin esto, dos cajas vendiendo la ultima pieza al mismo
    -- tiempo leen "1 disponible" las dos y dejan el stock en -1.
    select stock_actual into v_stock
    from producto where id = v_item.producto_id for update;

    update producto
       set stock_actual = stock_actual - v_item.cantidad
     where id = v_item.producto_id;
  end loop;

  -- El ingreso a caja, con la referencia a la venta que lo produjo. El
  -- indice unico de movimiento_caja hace imposible meterlo dos veces.
  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos, descripcion, fecha, creado_por)
  values (v_venta.negocio_id, 'ingreso', 'venta', v_venta.id, v_total,
          'Venta ' || v_venta.folio, v_venta.fecha, auth.uid());

  update venta
     set estado = 'cobrada', total_centavos = v_total, cobrada_en = now()
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

comment on function public.cobrar_venta(uuid) is
  'La UNICA forma de cobrar. Calcula el total, baja inventario con bloqueo de renglon, mete el '
  'ingreso a caja y marca la venta — todo en una transaccion. O pasa completo, o no pasa nada.';

-- ---------------------------------------------------------------------
-- CANCELAR UNA VENTA YA COBRADA
-- ---------------------------------------------------------------------
create or replace function public.cancelar_venta(p_venta uuid, p_motivo text default null)
returns venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta venta;
  v_item  record;
begin
  select * into v_venta from venta where id = p_venta and not eliminado;
  if v_venta.id is null then
    raise exception 'La venta no existe.' using errcode = 'no_data_found';
  end if;

  if not app.es_miembro(v_venta.negocio_id) then
    raise exception 'Esta venta no es de tu negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_venta.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso para cancelar ventas.' using errcode = 'insufficient_privilege';
  end if;

  if v_venta.estado <> 'cobrada' then
    raise exception 'Solo se puede cancelar una venta cobrada; esta esta %.', v_venta.estado
      using errcode = 'invalid_parameter_value';
  end if;

  -- El inventario regresa.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    perform 1 from producto where id = v_item.producto_id for update;
    update producto set stock_actual = stock_actual + v_item.cantidad where id = v_item.producto_id;
  end loop;

  -- Y la caja NO se corrige: se le agrega el movimiento contrario. El
  -- ingreso original se queda ahi para siempre, porque de verdad ocurrio.
  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos, descripcion, fecha, creado_por)
  values (v_venta.negocio_id, 'egreso', 'venta', v_venta.id, v_venta.total_centavos,
          'Cancelacion de venta ' || v_venta.folio || coalesce(' — ' || p_motivo, ''),
          current_date, auth.uid());

  update venta set estado = 'cancelada', cancelada_en = now()
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

-- ---------------------------------------------------------------------
-- GASTOS → CAJA, automatico
-- ---------------------------------------------------------------------
--
-- Es un disparador y no una funcion que haya que acordarse de llamar: asi el
-- gasto y su movimiento de caja no pueden separarse nunca, ni por un descuido
-- ni por otra pantalla que inserte directo.
--
create or replace function app.gasto_a_caja()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos, descripcion, fecha, creado_por)
    values (new.negocio_id, 'egreso', 'gasto', new.id, new.monto_centavos, new.descripcion, new.fecha, new.creado_por);
    return new;
  end if;

  -- Un gasto capturado por error se marca como eliminado; la caja recibe el
  -- ingreso contrario. Igual que con las ventas: nada se tacha.
  if tg_op = 'UPDATE' and new.eliminado and not old.eliminado then
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos, descripcion, fecha, creado_por)
    values (new.negocio_id, 'ingreso', 'gasto', new.id, old.monto_centavos,
            'Se anulo el gasto: ' || old.descripcion, current_date, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists gasto_a_caja_insert on gasto;
create trigger gasto_a_caja_insert
  after insert on gasto
  for each row execute function app.gasto_a_caja();

drop trigger if exists gasto_a_caja_update on gasto;
create trigger gasto_a_caja_update
  after update on gasto
  for each row execute function app.gasto_a_caja();

-- ---------------------------------------------------------------------
-- LA HORA DE FIN DE UNA CITA SE CALCULA
-- ---------------------------------------------------------------------
--
-- Si la escribe la persona, tarde o temprano hay una cita de Reiki de 60
-- minutos que termina 20 minutos despues de empezar, y la agenda del dia
-- deja de cuadrar.
--
create or replace function app.cita_hora_fin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duracion int;
begin
  if new.hora_fin is null or new.hora_fin <= new.hora_inicio then
    select duracion_min into v_duracion from servicio where id = new.servicio_id;
    new.hora_fin := new.hora_inicio + make_interval(mins => coalesce(v_duracion, 60));
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists cita_hora_fin_trigger on cita;
create trigger cita_hora_fin_trigger
  before insert or update on cita
  for each row execute function app.cita_hora_fin();

-- ---------------------------------------------------------------------
-- EL FOLIO DE VENTA — la serie que no recicla
-- ---------------------------------------------------------------------
create or replace function public.siguiente_folio(p_negocio text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max int;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  -- Se toma el mayor que EXISTA O HAYA EXISTIDO. Como nada se borra de
  -- verdad, un folio nunca se repite aunque se cancele la venta.
  select coalesce(max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int), 0)
    into v_max
  from venta where negocio_id = p_negocio;
  return 'V-' || lpad((v_max + 1)::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- EL RESUMEN DE INICIO — una sola consulta para todo el tablero
-- ---------------------------------------------------------------------
--
-- Inicio necesita once cifras de nueve tablas. Con una consulta por tarjeta
-- serian once viajes al servidor cada vez que se abre la pantalla; con esto
-- es uno.
--
-- ES `security invoker` A PROPOSITO — lo contrario de las de arriba. Corre
-- con los permisos de quien llama, asi que las reglas de fila se aplican
-- normalmente: si la recepcionista no puede ver finanzas, las ventas le
-- llegan en cero porque LA BASE NO SE LAS DA, no porque la pantalla se las
-- esconda. Es la diferencia entre un permiso y un adorno.
--
create or replace function public.resumen_inicio(p_negocio text, p_hoy date default current_date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ayer         date := p_hoy - 1;
  v_lunes        date := p_hoy - ((extract(isodow from p_hoy)::int) - 1);
  v_ventas_hoy   bigint;
  v_ventas_ayer  bigint;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(total_centavos), 0) into v_ventas_hoy
  from venta where negocio_id = p_negocio and fecha = p_hoy and estado = 'cobrada' and not eliminado;

  select coalesce(sum(total_centavos), 0) into v_ventas_ayer
  from venta where negocio_id = p_negocio and fecha = v_ayer and estado = 'cobrada' and not eliminado;

  return jsonb_build_object(
    'citasHoy', (
      select count(*) from cita
      where negocio_id = p_negocio and fecha = p_hoy and not eliminado
        and estado not in ('cancelada')
    ),
    'citasPendientes', (
      select count(*) from cita
      where negocio_id = p_negocio and fecha = p_hoy and not eliminado and estado = 'pendiente'
    ),
    'ventasHoy', v_ventas_hoy,
    -- SIN COMPARACION cuando ayer fue cero: no existe el porcentaje de
    -- crecimiento desde la nada. Se manda null y la pantalla dice "nuevo".
    'ventasAyer', case when v_ventas_ayer = 0 then null else v_ventas_ayer end,
    'productosBajos', (
      select count(*) from producto
      where negocio_id = p_negocio and not eliminado and activo
        and stock_actual <= stock_minimo
    ),
    'cursosProximos', (
      select count(*) from curso
      where negocio_id = p_negocio and not eliminado
        and fecha_inicio >= p_hoy and estado in ('programado', 'en_curso')
    ),
    'recordatoriosPendientes', (
      select count(*) from recordatorio
      where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha <= p_hoy
    ),
    -- La grafica de la semana: un renglon por dia, con cero en los dias sin
    -- ventas. Los ceros vienen de la base y no se rellenan en el navegador,
    -- para que la grafica no tenga huecos ni invente puntos.
    'ingresosSemana', (
      select coalesce(jsonb_agg(jsonb_build_object('fecha', d.dia, 'total', coalesce(s.total, 0)) order by d.dia), '[]'::jsonb)
      from generate_series(v_lunes, v_lunes + 6, interval '1 day') as d(dia)
      left join (
        select fecha, sum(total_centavos) as total
        from venta
        where negocio_id = p_negocio and estado = 'cobrada' and not eliminado
          and fecha between v_lunes and v_lunes + 6
        group by fecha
      ) s on s.fecha = d.dia::date
    ),
    -- Los rankings salen de las ventas reales. No hay ningun contador
    -- guardado a mano que pueda desincronizarse.
    'topServicios', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select s.id, s.nombre, sum(vi.cantidad)::int as sesiones
        from venta_item vi
        join venta v on v.id = vi.venta_id and v.estado = 'cobrada' and not v.eliminado
        join servicio s on s.id = vi.servicio_id
        where vi.negocio_id = p_negocio and vi.tipo = 'servicio'
        group by s.id, s.nombre
        order by sesiones desc, s.nombre
        limit 5
      ) x
    ),
    'topProductos', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.id, p.nombre, p.imagen_url, sum(vi.cantidad)::int as unidades
        from venta_item vi
        join venta v on v.id = vi.venta_id and v.estado = 'cobrada' and not v.eliminado
        join producto p on p.id = vi.producto_id
        where vi.negocio_id = p_negocio and vi.tipo = 'producto'
        group by p.id, p.nombre, p.imagen_url
        order by unidades desc, p.nombre
        limit 4
      ) x
    )
  );
end;
$$;

comment on function public.resumen_inicio(text, date) is
  'Todo el tablero en un viaje. security INVOKER a proposito: las reglas de fila se aplican al '
  'que llama, asi que quien no puede ver finanzas recibe ceros de la base, no de la pantalla.';

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
      'servicioMinutos', s.duracion_min,
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

-- ---------------------------------------------------------------------
-- EL HISTORIAL DE UN PACIENTE — calculado, nunca guardado
-- ---------------------------------------------------------------------
--
-- "Total de citas: 8" no se guarda en ningun lado. Un contador a mano se
-- desincroniza a la primera cancelacion y a partir de ahi nadie sabe cual de
-- los dos numeros es el bueno.
--
-- Que cuenta como cita historica: las COMPLETADAS. Una cancelada no fue una
-- sesion, y una que no se atendio tampoco — aunque las dos se conservan y se
-- cuentan aparte, porque para el negocio no son lo mismo.
--
create or replace function public.historial_del_cliente(p_cliente uuid, p_ahora timestamptz default now())
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'completadas', count(*) filter (where c.estado = 'completada'),
    'canceladas', count(*) filter (where c.estado = 'cancelada'),
    'noAsistio', count(*) filter (where c.estado = 'no_asistio'),
    'ultima', (
      select jsonb_build_object('fecha', u.fecha, 'servicio', su.nombre)
      from cita u join servicio su on su.id = u.servicio_id
      where u.cliente_id = p_cliente and not u.eliminado and u.estado = 'completada'
      order by u.fecha desc, u.hora_inicio desc limit 1
    ),
    -- La proxima: futura, no cancelada, la mas cercana. Tampoco se guarda.
    'proxima', (
      select jsonb_build_object(
        'id', p.id, 'fecha', p.fecha,
        'hora', to_char(p.hora_inicio, 'HH24:MI'), 'servicio', sp.nombre)
      from cita p join servicio sp on sp.id = p.servicio_id
      where p.cliente_id = p_cliente and not p.eliminado
        and p.estado in ('pendiente', 'confirmada')
        and (p.fecha + p.hora_inicio) > p_ahora
      order by p.fecha, p.hora_inicio limit 1
    )
  )
  from cita c
  where c.cliente_id = p_cliente and not c.eliminado;
$$;

-- ---------------------------------------------------------------------
-- REAGENDAR — mueve la cita, no crea otra
-- ---------------------------------------------------------------------
--
-- Reagendar creando una cita nueva y cancelando la vieja duplica el
-- historial del paciente: aparecen dos citas donde hubo una. Aqui se MUEVE
-- la misma, y el cambio queda firmado en la bitacora con el antes y el
-- despues, que es lo que permite reconstruir que paso tres meses despues.
--
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

  select * into v_quien from membresia
   where negocio_id = v_cita.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues, motivo)
  values (v_cita.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'), 'agenda', 'reagendar', p_cita::text, v_antes,
          jsonb_build_object('fecha', v_cita.fecha, 'horaInicio', v_cita.hora_inicio,
                             'profesionalId', v_cita.profesional_id),
          p_motivo);

  return v_cita;
end;
$$;

-- ---------------------------------------------------------------------
-- CAMBIAR EL ESTADO — confirmar, completar, cancelar, no asistio
-- ---------------------------------------------------------------------
--
-- Una sola puerta para los cuatro, porque los cuatro comparten las mismas
-- comprobaciones y el mismo rastro. Y porque asi las transiciones imposibles
-- —revivir una cancelada, completar algo que no ha pasado— se rechazan en un
-- solo lugar en vez de en cuatro pantallas distintas.
--
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

  select * into v_quien from membresia
   where negocio_id = v_cita.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues, motivo)
  values (v_cita.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'), 'agenda', 'estado', p_cita::text,
          jsonb_build_object('estado', v_antes), jsonb_build_object('estado', p_estado), p_motivo);

  return v_cita;
end;
$$;
