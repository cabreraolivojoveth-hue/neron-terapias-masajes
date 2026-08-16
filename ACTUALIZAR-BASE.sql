-- =====================================================================
-- ACTUALIZAR-BASE.sql — SOLO LO NUEVO
-- =====================================================================
--
-- Pegar en Supabase -> SQL Editor -> Run. Una sola vez basta.
--
-- Va al proyecto `hgypobbanvkwnqmepqim` (neron-terapias). MIRA EL REF EN LA
-- BARRA DE DIRECCIONES: hay otro que se llama casi igual y correr esto alli ya
-- costo una mañana.
--
-- Es seguro correrlo las veces que haga falta: no borra datos, no reescribe
-- filas, y todo va con `if not exists` o `create or replace`.
--
-- QUE TRAE:
--
--   1. RECORDATORIOS (bloque 7). Si ya lo corriste, volver a correrlo no hace
--      daño.
--   2. CONFIGURACION (bloque 10), al final:
--      · `licencia` gana la columna `plan`, que escribe la plataforma.
--      · Nace `invitacion`, con sus reglas de fila y su permiso. Es la unica
--        tabla nueva del bloque: `membresia.usuario_id` es not null, asi que
--        no se puede dar de alta a quien todavia no tiene cuenta.
--      · Dieciseis funciones: la ficha del centro, el equipo, los roles, la
--        bitacora, la licencia, exportar y transferir la propiedad.
--
-- Y ARRIBA, EN LAS CORRECCIONES:
--
--   · `registrar_venta` VUELVE A CREARSE, y esto es lo importante del bloque:
--     hasta hoy escribia `impuesto_centavos = 0` a mano. Ahora lee la tasa que
--     se configura en Configuracion y la desglosa —hacia atras si el precio ya
--     la lleva dentro, encima si no—. Sin correr esto, la pantalla enseñaria el
--     impuesto configurado y el servidor seguiria guardando cero.
--   · `resumen_inicio` y `ventas_del_rango`, sin cambios de esta vez.
--
-- LO YA COBRADO NO SE TOCA: la cuenta del impuesto solo corre al registrar una
-- venta nueva. Cambiar la tasa hoy no reescribe el mes pasado.
--
-- Sin correr esto, el sitio se publica igual y Configuracion abre con un error
-- que no dice nada util: el navegador pide funciones que la base no tiene.
-- Vercel publica el navegador, no la base.
--
-- Este archivo lo genera `scripts/actualizar-base.ts` a partir de
-- INSTALAR-EN-TERAPIAS.sql. No se edita a mano: se corre el guion.

-- =====================================================================
-- CORRECCIONES A LO QUE YA HABIAS CORRIDO
-- =====================================================================
--
-- Son `create or replace`: se pueden correr encima de las que ya existen.

create or replace function public.ventas_del_rango(
  p_negocio text,
  p_desde date,
  p_hasta date,
  p_busqueda text default null,
  p_estado text default null,
  p_vendedor uuid default null,
  p_cliente uuid default null,
  p_metodo text default null,
  p_pagina int default 1,
  p_por_pagina int default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select v.*,
      (select c.nombre from cliente c where c.id = v.cliente_id) as cliente,
      (select m.nombre from membresia m where m.id = v.vendedor_id) as vendedor,
      -- Los metodos se juntan al leer. Guardar "mixto" en la venta perderia el
      -- detalle que el corte de caja necesita.
      (select string_agg(distinct p.metodo, ', ') from pago p where p.venta_id = v.id) as metodos,
      (select count(*) from venta_item i where i.venta_id = v.id) as renglones
    from venta v
    where v.negocio_id = p_negocio
      and not v.eliminado
      and v.fecha between p_desde and p_hasta
      and (p_estado is null or v.estado = p_estado)
      and (p_vendedor is null or v.vendedor_id = p_vendedor)
      and (p_cliente is null or v.cliente_id = p_cliente)
      and (p_metodo is null or exists (
            select 1 from pago p where p.venta_id = v.id and p.metodo = p_metodo))
      -- SE BUSCA POR LAS CUATRO COSAS QUE ALGUIEN RECUERDA DE UNA VENTA: el
      -- folio, a quien se le vendio, QUE se vendio y QUIEN la hizo. El vendedor
      -- faltaba, y era el que mas se pedia en "Ventas del dia": quien cierra el
      -- turno pregunta "¿cuanto vendio fulano hoy?" y escribir su nombre no
      -- devolvia nada — sin error, con cara de que ese dia no vendio.
      and (p_busqueda is null or (
            v.folio ilike '%' || p_busqueda || '%'
         or exists (select 1 from cliente c where c.id = v.cliente_id
                     and c.nombre ilike '%' || p_busqueda || '%')
         or exists (select 1 from membresia m where m.id = v.vendedor_id
                     and m.nombre ilike '%' || p_busqueda || '%')
         or exists (select 1 from venta_item i where i.venta_id = v.id
                     and i.descripcion ilike '%' || p_busqueda || '%')))
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'filas', coalesce((
      select jsonb_agg(t.x order by t.orden desc)
      from (
        select jsonb_build_object(
          'id', b.id, 'folio', b.folio, 'fecha', b.fecha,
          'clienteId', b.cliente_id, 'cliente', b.cliente,
          'vendedor', b.vendedor,
          'renglones', b.renglones,
          'subtotalCentavos', b.subtotal_centavos,
          'descuentoCentavos', b.descuento_centavos,
          'totalCentavos', b.total_centavos,
          'metodos', b.metodos,
          'estado', b.estado,
          'creadoEn', b.creado_en
        ) as x, b.creado_en as orden
        from base b
        order by b.creado_en desc
        limit greatest(p_por_pagina, 1)
        offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)
      ) t
    ), '[]'::jsonb)
  );
$$;

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
    /*
     * LOS TRES NUMEROS DE RECORDATORIOS SALEN DE AQUI, Y ES LA UNICA FORMA DE
     * QUE INICIO CUADRE CON SU MODULO.
     *
     * `recordatoriosPendientes` conserva su nombre y su significado —lo que
     * urge: hoy y lo que ya vencio— porque ya lo leen la campana y el tablero,
     * y cambiarle el sentido a una llave que alguien lee es de los cambios que
     * no fallan y dejan un numero mintiendo.
     *
     * Los otros dos son nuevos y van SEPARADOS porque no significan lo mismo:
     * uno vence hoy y del otro ya se paso la fecha. Sumarlos deja al dueño sin
     * saber si tiene que correr o si ya llego tarde.
     */
    'recordatoriosPendientes', (
      select count(*) from recordatorio
      where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha <= p_hoy
    ),
    'recordatoriosHoy', (
      select count(*) from recordatorio
      where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha = p_hoy
    ),
    'recordatoriosVencidos', (
      select count(*) from recordatorio
      where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha < p_hoy
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

create or replace function public.registrar_venta(
  p_negocio text,
  p_items jsonb,
  p_pagos jsonb default '[]'::jsonb,
  p_cliente uuid default null,
  p_vendedor uuid default null,
  p_descuento bigint default 0,
  p_efectivo_recibido bigint default null,
  p_notas text default null,
  p_llave text default null,
  p_fecha date default current_date
)
returns venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta     venta;
  v_item      jsonb;
  v_pago      jsonb;
  -- El impuesto configurado del centro. Ver el bloque de los totales.
  v_tasa      numeric := 0;
  v_incluido  boolean := true;
  v_base      bigint := 0;
  v_impuesto  bigint := 0;
  v_precio    bigint;
  v_costo     bigint;
  v_nombre    text;
  v_cantidad  numeric(12,3);
  v_desc      bigint;
  v_sub       bigint;
  v_subtotal  bigint := 0;
  v_total     bigint;
  v_pagado    bigint := 0;
  v_folio     text;
  v_quien     membresia;
  v_stock     int;
  v_curso     curso;
  v_ocupados  int;
  v_tipo      text;
  v_id        uuid;
  v_aplicado  bigint;
  v_falta     bigint;
  v_pago_id   uuid;
  v_sesion    uuid;
begin
  /* --- 1. Los porteros ------------------------------------------- */
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'cobrar') then
    raise exception 'No tienes permiso para cobrar.' using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  /* --- 2. LA IDEMPOTENCIA ---------------------------------------- */
  -- El doble clic no crea dos ventas: la segunda encuentra la primera y la
  -- devuelve tal cual. El boton deshabilitado ayuda, pero una red lenta
  -- reintenta sola y la pestaña de al lado no sabe del boton de esta.
  if p_llave is not null then
    select * into v_venta from venta
     where negocio_id = p_negocio and llave_idempotencia = p_llave;
    if v_venta.id is not null then
      return v_venta;
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No se puede cobrar una venta sin renglones.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- El cliente tiene que ser de ESTE centro. Sin esta comprobacion se podria
  -- cargarle una venta al paciente de otro consultorio.
  if p_cliente is not null and not exists (
        select 1 from cliente where id = p_cliente and negocio_id = p_negocio and not eliminado) then
    raise exception 'Ese cliente no existe en este centro.' using errcode = 'no_data_found';
  end if;

  v_folio := siguiente_folio(p_negocio);

  insert into venta (negocio_id, folio, cliente_id, vendedor_id, fecha, estado,
                     notas, llave_idempotencia, creada_por)
  values (p_negocio, v_folio, p_cliente, p_vendedor, p_fecha, 'borrador',
          p_notas, p_llave, auth.uid())
  returning * into v_venta;

  /* --- 3 a 8. Los renglones, con el precio del SERVIDOR ----------- */
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tipo := v_item ->> 'tipo';
    v_id := (v_item ->> 'id')::uuid;
    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 1);
    v_desc := coalesce((v_item ->> 'descuento')::bigint, 0);

    if v_cantidad <= 0 then
      raise exception 'La cantidad tiene que ser mayor que cero.'
        using errcode = 'invalid_parameter_value';
    end if;

    select precio, costo, nombre into v_precio, v_costo, v_nombre
    from app.precio_del_concepto(p_negocio, v_tipo, v_id, p_fecha);

    if v_nombre is null then
      raise exception 'Uno de los conceptos no existe, no esta activo, o no es de este centro.'
        using errcode = 'no_data_found';
    end if;

    -- EL DESCUENTO NO PUEDE PASARSE DEL RENGLON. Un descuento mayor que el
    -- subtotal daria un renglon negativo, y a partir de ahi el total miente.
    if v_desc < 0 or v_desc > (v_precio * v_cantidad)::bigint then
      raise exception 'El descuento de "%" no puede pasar de su importe.', v_nombre
        using errcode = 'invalid_parameter_value';
    end if;

    v_sub := (v_precio * v_cantidad)::bigint - v_desc;
    v_subtotal := v_subtotal + v_sub;

    insert into venta_item (negocio_id, venta_id, tipo,
                            producto_id, servicio_id, curso_id,
                            descripcion, cantidad, precio_unitario_centavos,
                            costo_unitario_centavos, descuento_centavos, subtotal_centavos)
    values (p_negocio, v_venta.id, v_tipo,
            case when v_tipo = 'producto' then v_id end,
            case when v_tipo = 'servicio' then v_id end,
            case when v_tipo = 'curso'    then v_id end,
            -- LA FOTO DEL NOMBRE Y DEL PRECIO. No contradice la regla de no
            -- copiar nombres: es un dato historico distinto del actual. Si el
            -- precio sube el año que viene, el ticket del año pasado tiene que
            -- seguir diciendo lo que se cobro ese dia.
            v_nombre, v_cantidad, v_precio, v_costo, v_desc, v_sub);

    /* --- 9. El inventario, por su unica puerta -------------------- */
    if v_tipo = 'producto' then
      perform app.mover_inventario(v_id, 'venta', -v_cantidad::int,
                                   'Venta ' || v_folio, 'venta', v_venta.id);
    end if;

    /* --- 10. El cupo del curso, con el renglon bloqueado ---------- */
    if v_tipo = 'curso' then
      select * into v_curso from curso where id = v_id for update;
      v_ocupados := app.lugares_ocupados(v_id);
      if v_curso.cupo is not null and v_ocupados + v_cantidad > v_curso.cupo then
        raise exception 'El curso "%" solo tiene % lugares y ya hay % ocupados.',
          v_curso.nombre, v_curso.cupo, v_ocupados
          using errcode = 'check_violation';
      end if;
      -- UNA INSCRIPCION NECESITA PERSONA. Vender un curso "al mostrador" deja
      -- un lugar ocupado por nadie, y el sabado sobra una silla.
      if p_cliente is null then
        raise exception 'Para vender el curso "%" hace falta decir quien lo toma.', v_curso.nombre
          using errcode = 'invalid_parameter_value';
      end if;
      -- Si ya estaba inscrito no se duplica: se le cobra y ya.
      if not exists (select 1 from inscripcion
                      where curso_id = v_id and cliente_id = p_cliente and estado <> 'cancelado') then
        insert into inscripcion (negocio_id, curso_id, cliente_id, estado, origen, venta_id)
        values (p_negocio, v_id, p_cliente, 'inscrito', 'venta', v_venta.id);
      else
        update inscripcion set venta_id = v_venta.id
         where curso_id = v_id and cliente_id = p_cliente and estado <> 'cancelado';
      end if;
    end if;
  end loop;

  /* --- 6. Los totales, calculados AQUI ---------------------------- */
  if p_descuento is null or p_descuento < 0 then
    raise exception 'El descuento no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;
  if p_descuento > v_subtotal then
    raise exception 'El descuento no puede pasar del subtotal.'
      using errcode = 'invalid_parameter_value';
  end if;

  /*
   * EL IMPUESTO SALE DE CONFIGURACION, Y SE CALCULA AQUI.
   *
   * Hasta el bloque 10 esto era un cero escrito a mano con un comentario que
   * decia "si el centro los cobra, se declaran en Configuracion" — y no habia
   * donde declararlos. Ahora si: `estado.data.centro.impuestoTasa` y
   * `impuestoIncluido`.
   *
   * SE CALCULA EN EL SERVIDOR Y NO EN EL NAVEGADOR, por la misma razon que
   * todo lo demas de esta funcion: el precio, el total y el impuesto tienen que
   * salir de la misma cuenta indivisible. Un impuesto calculado en el navegador
   * y mandado como parametro es un impuesto que se puede cambiar a mano.
   *
   * DOS CUENTAS DISTINTAS, y confundirlas cambia lo que el cliente paga:
   *
   *   · INCLUIDO: el precio ya lo trae dentro. Se saca hacia atras
   *     —base x tasa / (100 + tasa)— y el TOTAL NO SE TOCA. Es lo normal en
   *     Mexico: el precio de la lista es el que se cobra.
   *   · NO INCLUIDO: se suma encima, y el total sube.
   *
   * LO YA COBRADO NO SE TOCA. Esta cuenta solo corre al registrar una venta
   * nueva: cambiar la tasa hoy no reescribe el mes pasado, que es justo lo que
   * hace que un reporte viejo se pueda seguir creyendo.
   */
  select coalesce((e.data -> 'centro' ->> 'impuestoTasa')::numeric, 0),
         coalesce((e.data -> 'centro' ->> 'impuestoIncluido')::boolean, true)
    into v_tasa, v_incluido
    from estado e where e.negocio_id = p_negocio;

  v_tasa := coalesce(v_tasa, 0);
  v_incluido := coalesce(v_incluido, true);
  v_base := v_subtotal - p_descuento;

  if v_tasa <= 0 then
    v_impuesto := 0;
    v_total := v_base;
  elsif v_incluido then
    v_impuesto := round(v_base * v_tasa / (100 + v_tasa));
    v_total := v_base;
  else
    v_impuesto := round(v_base * v_tasa / 100);
    v_total := v_base + v_impuesto;
  end if;

  update venta
     set subtotal_centavos = v_subtotal,
         descuento_centavos = p_descuento,
         impuesto_centavos = v_impuesto,
         total_centavos = v_total,
         efectivo_recibido_centavos = p_efectivo_recibido,
         estado = 'cobrada',
         cobrada_en = now()
   where id = v_venta.id
  returning * into v_venta;

  /* --- 7 y 11. Los pagos, y de ahi la caja ------------------------ */
  --
  -- VARIOS RENGLONES = PAGO MIXTO. Guardar `metodo = 'mixto'` en la venta
  -- perderia el detalle, y entonces el corte de caja no puede saber cuanto
  -- entro en efectivo.
  v_sesion := app.caja_abierta(p_negocio);

  for v_pago in select * from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) loop
    v_aplicado := (v_pago ->> 'monto')::bigint;
    if v_aplicado <= 0 then
      raise exception 'Un pago tiene que ser mayor que cero.'
        using errcode = 'invalid_parameter_value';
    end if;
    v_pagado := v_pagado + v_aplicado;

    -- EL EFECTIVO NECESITA UN CAJON ABIERTO.
    --
    -- Cobrar en efectivo sin caja abierta deja billetes en un cajon que ningun
    -- corte va a contar: al cerrar el dia sobra dinero y nadie sabe de donde
    -- salio. La tarjeta y la transferencia NO lo necesitan — ese dinero no
    -- pasa por el cajon, va al banco.
    if (v_pago ->> 'metodo') = 'efectivo' and v_sesion is null then
      raise exception 'No hay una caja abierta: no se puede cobrar en efectivo. Abre la caja en el modulo Caja.'
        using errcode = 'invalid_parameter_value';
    end if;

    insert into pago (negocio_id, venta_id, metodo, monto_centavos, fecha)
    values (p_negocio, v_venta.id, v_pago ->> 'metodo', v_aplicado, p_fecha)
    returning id into v_pago_id;

    -- LA CAJA NACE DEL PAGO, no de la venta.
    --
    -- Con el movimiento colgado de la VENTA, un pago mixto reventaba: el
    -- indice unico de la caja solo dejaba entrar el primero de los dos. Y
    -- colgarlo de la venta ademas impide saber cuanto entro en efectivo, que
    -- es justo lo que un corte de caja necesita.
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                 descripcion, fecha, metodo, sesion_id, creado_por)
    values (p_negocio, 'ingreso', 'pago', v_pago_id, v_aplicado,
            'Venta ' || v_folio, p_fecha, v_pago ->> 'metodo', v_sesion, auth.uid());
  end loop;

  -- EL CAMBIO NO ES INGRESO. Si el cliente da mil por una venta de
  -- novecientos, entraron novecientos: los cien son suyos. Por eso lo que se
  -- registra es lo APLICADO, y `efectivo_recibido` se guarda aparte solo para
  -- poder imprimir el ticket.
  v_falta := v_total - v_pagado;
  if v_falta <> 0 then
    -- El mensaje va en pesos y con dos decimales: "suman 1.0000000000" no le
    -- dice nada a quien esta cobrando en un mostrador.
    raise exception 'Los pagos suman $% y el total es $%.',
      to_char(v_pagado::numeric / 100, 'FM999999990.00'),
      to_char(v_total::numeric / 100, 'FM999999990.00')
      using errcode = 'invalid_parameter_value';
  end if;

  /* --- 12. La bitacora -------------------------------------------- */
  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'ventas', 'cobrar', v_venta.id::text, null,
          jsonb_build_object('folio', v_folio, 'total', v_total,
                             'descuento', p_descuento, 'clienteId', p_cliente));

  return v_venta;
end;
$$;

-- =====================================================================
-- RECORDATORIOS — EL SEGUIMIENTO DE LO PENDIENTE (bloque 7)
-- =====================================================================
--
-- LA TABLA `recordatorio` YA EXISTIA DESDE EL BLOQUE 0, y aqui NO se
-- sustituye: se completa. Crear una tabla nueva —`pendiente`, `tarea`— habria
-- dejado dos fuentes de verdad para lo mismo, y las citas ya escriben en esta:
-- `reagendar_cita` mueve sus recordatorios y `cambiar_estado_de_cita` los
-- descarta. Una tabla nueva habria dejado esos dos disparadores escribiendo en
-- la vieja mientras la pantalla lee la nueva — el peor fallo posible, porque no
-- revienta: solo deja de avisar.
--
-- LOS TRES ESTADOS SON LOS DEL BLOQUE 0 Y NO SE TOCAN:
--
--     pendiente · hecho · descartado
--
-- Y "VENCIDO" NO ES UN CUARTO ESTADO. Es `fecha < hoy and estado =
-- 'pendiente'`, calculado al leer. Guardarlo obligaria a un proceso que a
-- medianoche recorriera la tabla marcando los de ayer; el dia que ese proceso
-- no corra, la pantalla diria "pendiente" de algo que vencio hace una semana.
-- Peor: un recordatorio vencido que se guarda como estado propio deja de ser
-- pendiente, y entonces "completarlo" tendria que saber a cual de los dos
-- volver. Derivado no se puede desincronizar.
--
-- Lo que si es nuevo:
--
--   1. La hora, la categoria, el responsable, las notas y la prioridad urgente.
--   2. `recordatorio_recurrente` — LA REGLA, no las instancias.
--   3. `recordatorio_evento` — el historial de quien hizo que.
--   4. `recordatorio_ajustes` — la configuracion del modulo, por centro.
--   5. `recordatorio_automatizacion` — las reglas que crean recordatorios
--      solos, APAGADAS mientras nadie las encienda.
--
-- ---------------------------------------------------------------------
-- 1. LA TABLA `recordatorio` SE COMPLETA
-- ---------------------------------------------------------------------

-- LA HORA ES OPCIONAL A PROPOSITO. "Llamar a la clienta el martes" no tiene
-- hora, y obligar a inventarle una hace que todos acaben a las 00:00 y que el
-- aviso salga de madrugada. Sin hora, el aviso usa la hora del centro que se
-- configura en `recordatorio_ajustes.hora_por_omision`.
alter table recordatorio add column if not exists hora time;

alter table recordatorio add column if not exists notas text;

-- LA CATEGORIA ES LA MISMA TABLA QUE USAN SERVICIOS, CURSOS, PRODUCTOS Y
-- GASTOS. Una lista de grupos aparte para recordatorios seria la quinta, y a la
-- quinta ya nadie renombra las cinco.
alter table recordatorio add column if not exists categoria_id uuid;

-- EL RESPONSABLE ES UNA MEMBRESIA, no un texto. Un nombre escrito a mano no se
-- puede filtrar, no sirve para avisar a nadie y se queda viejo el dia que esa
-- persona cambie de apellido.
alter table recordatorio add column if not exists responsable_id uuid;

alter table recordatorio add column if not exists recurrente_id uuid;

-- DE QUE AUTOMATIZACION SALIO, Y DE QUE FILA. Es lo unico que impide que la
-- regla "avisa cuando el stock baje" cree un recordatorio nuevo cada vez que
-- alguien abre la pantalla. Ver el indice unico mas abajo.
alter table recordatorio add column if not exists origen_tipo text;
alter table recordatorio add column if not exists origen_id uuid;
alter table recordatorio add column if not exists automatizacion_id uuid;

-- CUANTO ANTES AVISAR, en minutos. Nulo = lo que diga la configuracion del
-- centro. Guardar el numero en cada fila permite que uno concreto avise con un
-- dia de antelacion sin cambiarselo a los demas.
alter table recordatorio add column if not exists anticipacion_min int;
alter table recordatorio add column if not exists notificado_en timestamptz;

-- QUIEN LO COMPLETO Y CUANDO. Sin esto, "27 completados este mes" no se puede
-- calcular y nadie puede saber quien cerro que. `creado_en` no sirve: es cuando
-- se capturo, no cuando se hizo.
alter table recordatorio add column if not exists completado_en timestamptz;
alter table recordatorio add column if not exists completado_por uuid;

alter table recordatorio add column if not exists actualizado_en timestamptz;
alter table recordatorio add column if not exists actualizado_por uuid;

-- URGENTE ENTRA COMO CUARTA PRIORIDAD. Con solo tres, "alta" acababa puesta en
-- todo y dejaba de significar nada.
alter table recordatorio drop constraint if exists recordatorio_prioridad_check;
alter table recordatorio add constraint recordatorio_prioridad_check
  check (prioridad in ('baja', 'normal', 'alta', 'urgente'));

-- SERVICIO Y GASTO SE SUMAN A LAS ENTIDADES QUE PUEDEN ORIGINAR UNO. Un
-- seguimiento de servicio y un pago de gasto que hay que confirmar son casos
-- reales, y sin el tipo el recordatorio se queda como texto muerto: no se puede
-- abrir nada desde el.
alter table recordatorio drop constraint if exists recordatorio_entidad_tipo_check;
alter table recordatorio add constraint recordatorio_entidad_tipo_check
  check (entidad_tipo in ('cliente', 'cita', 'venta', 'curso', 'producto', 'servicio', 'gasto'));

-- LA LLAVE COMPUESTA QUE PERMITEN LAS DEMAS. Sin `(negocio_id, id)` unico, las
-- tablas de abajo no pueden apuntar aqui con llave compuesta, y una llave
-- simple deja colgar el historial de un centro del recordatorio de otro.
--
-- SE AGREGA SI FALTA, NO SE TIRA Y SE VUELVE A PONER, y esto costo un error en
-- la segunda pasada del archivo:
--
--   cannot drop constraint recordatorio_negocio_id_unico on table recordatorio
--   because other objects depend on it
--
-- El `drop constraint if exists` seguido de `add` es el patron idempotente de
-- todo el instalador y funciona para las llaves foraneas y las restricciones de
-- comprobacion, porque de esas no cuelga nada. De UNA LLAVE UNICA si cuelga: en
-- cuanto `recordatorio_evento` apunta aqui con su llave compuesta, tirar el
-- indice se lleva por delante esa llave foranea, y Postgres —con razon— se
-- niega. La primera vez pasa; la segunda revienta el archivo entero.
--
-- Lo que NO se hace es `drop ... cascade`, que es lo que sugiere la pista del
-- error: eso borraria en silencio la llave foranea del historial y la dejaria
-- sin volver a crear si el archivo se cortara justo ahi.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'recordatorio_negocio_id_unico'
       and conrelid = 'recordatorio'::regclass
  ) then
    alter table recordatorio add constraint recordatorio_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

alter table recordatorio drop constraint if exists recordatorio_categoria_mismo_negocio;
alter table recordatorio add constraint recordatorio_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  on delete set null (categoria_id);

alter table recordatorio drop constraint if exists recordatorio_responsable_mismo_negocio;
alter table recordatorio add constraint recordatorio_responsable_mismo_negocio
  foreign key (negocio_id, responsable_id) references membresia (negocio_id, id)
  on delete set null (responsable_id);

-- LA CATEGORIA APRENDE EL AMBITO. Las de recordatorios son suyas: agrupar
-- "Créditos" o "Marketing" no tiene nada que ver con agrupar servicios.
alter table categoria drop constraint if exists categoria_ambito_check;
alter table categoria add constraint categoria_ambito_check
  check (ambito in ('servicio', 'curso', 'producto', 'gasto', 'conversacion', 'recordatorio'));

create index if not exists recordatorio_responsable_idx
  on recordatorio (negocio_id, responsable_id, fecha) where not eliminado;

create index if not exists recordatorio_entidad_idx
  on recordatorio (negocio_id, entidad_tipo, entidad_id) where not eliminado;

create index if not exists recordatorio_completado_idx
  on recordatorio (negocio_id, completado_en) where estado = 'hecho' and not eliminado;

-- ---------------------------------------------------------------------
-- 2. LA REGLA DE RECURRENCIA — una fila, no trescientos recordatorios
-- ---------------------------------------------------------------------
--
-- LO QUE NO SE HACE: crear de golpe las 52 ocurrencias de un recordatorio
-- semanal. Se ve inofensivo y trae tres problemas que no se ven hasta que ya
-- estan dentro: la tabla se llena de filas que nadie ha mirado, cambiar la hora
-- obliga a corregir 52 renglones —y siempre queda alguno—, y una recurrencia
-- "sin fin" no se puede materializar porque no hay final que materializar.
--
-- LO QUE SI: se guarda la REGLA, y `generar_recordatorios_recurrentes` crea la
-- siguiente instancia cuando toca. Correr esa funcion diez veces crea el
-- recordatorio UNA sola vez, y eso no lo garantiza la funcion: lo garantiza el
-- indice unico `(recurrente_id, fecha)` que hay mas abajo. La diferencia
-- importa: dos pestañas abiertas a la vez ejecutan la comprobacion las dos, ven
-- las dos que no existe, y crean las dos. Contra el indice, la segunda choca y
-- se descarta sola.
create table if not exists recordatorio_recurrente (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      text not null references negocio(id) on delete cascade,
  titulo          text not null,
  detalle         text,
  notas           text,
  hora            time,
  prioridad       text not null default 'normal'
                    check (prioridad in ('baja', 'normal', 'alta', 'urgente')),
  categoria_id    uuid,
  responsable_id  uuid,
  entidad_tipo    text check (entidad_tipo in
                    ('cliente', 'cita', 'venta', 'curso', 'producto', 'servicio', 'gasto')),
  entidad_id      uuid,
  anticipacion_min int,
  frecuencia      text not null
                    check (frecuencia in ('diario', 'semanal', 'mensual', 'anual', 'personalizado')),
  -- CADA CUANTAS VECES. Un semanal con intervalo 2 es cada quince dias, y eso
  -- es una frecuencia de verdad que la gente usa; inventarle un nombre
  -- ("quincenal") multiplica la lista sin resolver "cada tres semanas".
  intervalo       int not null default 1 check (intervalo between 1 and 365),
  -- Solo para el semanal: que dias de la semana, en numeracion ISO (1 lunes,
  -- 7 domingo). Vacio = el mismo dia de la semana en que empezo.
  dias_semana     int[],
  fecha_inicio    date not null,
  fecha_fin       date,
  -- El tope por cuenta, alternativo a la fecha final. Nulo = sin tope.
  repeticiones    int check (repeticiones is null or repeticiones > 0),
  generados       int not null default 0,
  proxima_fecha   date not null,
  estado          text not null default 'activo'
                    check (estado in ('activo', 'pausado', 'finalizado')),
  creado_por      uuid,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz,
  eliminado       boolean not null default false,
  constraint recordatorio_recurrente_negocio_id_unico unique (negocio_id, id),
  -- Una regla que termina antes de empezar no genera nada y nadie entiende por
  -- que la pantalla se quedo vacia. Se rechaza al guardarla.
  constraint recordatorio_recurrente_fin_despues
    check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

comment on table recordatorio_recurrente is
  'LA REGLA, NO LAS INSTANCIAS. Guardar aqui "confirmar caja cada lunes" no crea ni un '
  'recordatorio: nacen de generar_recordatorios_recurrentes cuando toca, y quedan ligados por '
  '(recurrente_id, fecha) — que es unico, asi que correr la generacion diez veces crea uno solo.';

alter table recordatorio_recurrente drop constraint if exists recordatorio_recurrente_categoria_mismo_negocio;
alter table recordatorio_recurrente add constraint recordatorio_recurrente_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  on delete set null (categoria_id);

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

comment on function public.recordatorios_del_centro(text, date, text, text, uuid, uuid, text, text, date, date, boolean, boolean, text, boolean, int, int) is
  'La lista con todo resuelto y paginada EN EL SERVIDOR, en una sola pasada. Los nombres se '
  'resuelven al leer; "vencido" se calcula, nunca se guarda.';

grant execute on function public.recordatorios_del_centro(text, date, text, text, uuid, uuid, text, text, date, date, boolean, boolean, text, boolean, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 9. EL RESUMEN — las cuatro cifras, la dona y los proximos, en un viaje
-- ---------------------------------------------------------------------
--
-- UN VIAJE Y NO SEIS. Las cuatro tarjetas de arriba, la dona del costado, la
-- lista de proximos y las metricas de cumplimiento salen de la misma tabla; una
-- consulta por tarjeta serian seis viajes cada vez que alguien abre la
-- pantalla.
--
-- LAS METRICAS DE CUMPLIMIENTO SOLO SE MANDAN SI HAY CON QUE. Un "0% de
-- cumplimiento" cuando no se ha completado nada todavia no es un dato: es un
-- reproche inventado. Se manda `null` y la pantalla no pinta la tarjeta.
create or replace function public.resumen_de_recordatorios(
  p_negocio text,
  p_hoy date
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_dias        int;
  v_mes         date := date_trunc('month', p_hoy)::date;
  v_cerrados    bigint;
  v_horas       numeric;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(dias_de_proximos, 7) into v_dias
    from recordatorio_ajustes where negocio_id = p_negocio;
  v_dias := coalesce(v_dias, 7);

  select count(*), avg(extract(epoch from (completado_en - creado_en)) / 3600.0)
    into v_cerrados, v_horas
    from recordatorio
   where negocio_id = p_negocio and not eliminado and estado = 'hecho'
     and completado_en is not null and completado_en >= v_mes;

  return jsonb_build_object(
    'diasDeProximos', v_dias,
    'pendientes', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente'),
    'hoy', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha = p_hoy),
    'vencidos', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha < p_hoy),
    'proximos', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente'
         and fecha > p_hoy and fecha <= p_hoy + v_dias),
    -- "Completados: este mes", igual que dice el diseño. Un total historico
    -- solo sube y a los dos años deja de significar nada.
    'completados', v_cerrados,
    'cancelados', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'descartado'),
    'total', (
      select count(*) from recordatorio where negocio_id = p_negocio and not eliminado),
    -- SIN NADA CERRADO NO HAY PROMEDIO. Se manda null; la pantalla no inventa
    -- un cero que se leeria como "todo se resuelve al instante".
    'horasPromedio', case when v_cerrados = 0 then null else round(v_horas, 1) end,
    'porCategoria', (
      select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', c.id, 'nombre', coalesce(c.nombre, 'Sin categoría'), 'color', c.color,
                 'cuantos', count(*),
                 'hechos', count(*) filter (where r.estado = 'hecho')) as x
          from recordatorio r
          left join categoria c on c.id = r.categoria_id
         where r.negocio_id = p_negocio and not r.eliminado
         group by c.id, c.nombre, c.color
      ) t),
    'porResponsable', (
      select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', m.id, 'nombre', coalesce(m.nombre, 'Sin responsable'),
                 'cuantos', count(*),
                 'hechos', count(*) filter (where r.estado = 'hecho'),
                 'vencidos', count(*) filter (where r.estado = 'pendiente' and r.fecha < p_hoy)) as x
          from recordatorio r
          left join membresia m on m.id = r.responsable_id
         where r.negocio_id = p_negocio and not r.eliminado
         group by m.id, m.nombre
      ) t),
    -- LOS PROXIMOS DEL COSTADO. Ordenados por FECHA y no por prioridad: uno
    -- urgente para dentro de tres semanas no es lo que hay que hacer hoy.
    'proximosRecordatorios', (
      select coalesce(jsonb_agg(x order by (x->>'fecha')::date, x->>'hora' nulls last), '[]'::jsonb)
        from (
          select jsonb_build_object(
                   'id', r.id, 'titulo', r.titulo, 'fecha', r.fecha, 'hora', r.hora,
                   'prioridad', r.prioridad,
                   'entidadTipo', r.entidad_tipo,
                   'entidadNombre', case r.entidad_tipo
                     when 'cliente'  then (select cl.nombre from cliente cl where cl.id = r.entidad_id)
                     when 'cita'     then (select coalesce(cl.nombre, 'Cita') from cita ci
                                            left join cliente cl on cl.id = ci.cliente_id
                                            where ci.id = r.entidad_id)
                     when 'venta'    then (select v.folio from venta v where v.id = r.entidad_id)
                     when 'curso'    then (select cu.nombre from curso cu where cu.id = r.entidad_id)
                     when 'producto' then (select p.nombre from producto p where p.id = r.entidad_id)
                     when 'servicio' then (select s.nombre from servicio s where s.id = r.entidad_id)
                     when 'gasto'    then (select g.descripcion from gasto g where g.id = r.entidad_id)
                   end,
                   'categoria', c.nombre,
                   'vencido', r.fecha < p_hoy) as x
            from recordatorio r
            left join categoria c on c.id = r.categoria_id
           where r.negocio_id = p_negocio and not r.eliminado and r.estado = 'pendiente'
           order by r.fecha, r.hora nulls last
           limit 5
        ) t),
    'consejo', (select consejo from recordatorio_ajustes where negocio_id = p_negocio)
  );
end;
$$;

comment on function public.resumen_de_recordatorios(text, date) is
  'Las cuatro cifras, la dona, los proximos y el cumplimiento en UN viaje. El promedio y el '
  'cumplimiento van en null cuando no hay con que calcularlos: un 0% inventado es un reproche.';

grant execute on function public.resumen_de_recordatorios(text, date) to authenticated;

-- ---------------------------------------------------------------------
-- 10. GUARDAR — el alta y la edicion son la MISMA entidad
-- ---------------------------------------------------------------------
--
-- EDITAR NO CREA UNO NUEVO. Es la misma fila, y por eso el historial de un
-- recordatorio se puede leer de principio a fin. La alternativa —anular y
-- encadenar, como hace Gastos— tiene sentido cuando hay dinero de por medio y
-- el registro no se puede tocar; aqui solo produciria tres copias de la misma
-- tarea en la lista.
create or replace function public.guardar_recordatorio(
  p_negocio text,
  p_id uuid,
  p_titulo text,
  p_fecha date,
  p_detalle text default null,
  p_hora time default null,
  p_prioridad text default 'normal',
  p_categoria uuid default null,
  p_responsable uuid default null,
  p_entidad_tipo text default null,
  p_entidad_id uuid default null,
  p_notas text default null,
  p_anticipacion int default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_antes  jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  -- LAS MISMAS VALIDACIONES QUE LA PANTALLA, aqui otra vez. La pantalla valida
  -- para decirlo bien y a tiempo; esto valida para que sea verdad aunque
  -- alguien mande la peticion a mano.
  if v_titulo = '' then
    raise exception 'El recordatorio necesita un título.' using errcode = 'check_violation';
  end if;
  if length(v_titulo) > 160 then
    raise exception 'El título no puede pasar de 160 letras.' using errcode = 'check_violation';
  end if;
  if p_fecha is null then
    raise exception 'El recordatorio necesita una fecha.' using errcode = 'check_violation';
  end if;
  -- UNA ENTIDAD A MEDIAS NO SE GUARDA. Un `entidad_tipo` sin `entidad_id` deja
  -- un renglon que dice "relacionado con una cita" y no puede abrir ninguna.
  if (p_entidad_tipo is null) <> (p_entidad_id is null) then
    raise exception 'La relación necesita el tipo y el registro, o ninguno de los dos.'
      using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into recordatorio (negocio_id, titulo, detalle, fecha, hora, prioridad, categoria_id,
                              responsable_id, entidad_tipo, entidad_id, notas, anticipacion_min,
                              creado_por, estado)
    values (p_negocio, v_titulo, nullif(btrim(coalesce(p_detalle, '')), ''), p_fecha, p_hora,
            coalesce(p_prioridad, 'normal'), p_categoria, p_responsable, p_entidad_tipo,
            p_entidad_id, nullif(btrim(coalesce(p_notas, '')), ''), p_anticipacion,
            auth.uid(), 'pendiente')
    returning id into v_id;

    perform app.anotar_recordatorio(p_negocio, v_id, 'creado', null,
      jsonb_build_object('titulo', v_titulo, 'fecha', p_fecha, 'prioridad', p_prioridad));
    return v_id;
  end if;

  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo. Solo quien lo creó, su responsable o quien '
                    'administra el centro pueden cambiarlo.' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object('titulo', titulo, 'fecha', fecha, 'hora', hora,
                            'prioridad', prioridad, 'categoriaId', categoria_id,
                            'responsableId', responsable_id)
    into v_antes
    from recordatorio where id = p_id and negocio_id = p_negocio;

  if v_antes is null then
    raise exception 'Ese recordatorio no existe en este centro.' using errcode = 'no_data_found';
  end if;

  update recordatorio
     set titulo = v_titulo,
         detalle = nullif(btrim(coalesce(p_detalle, '')), ''),
         fecha = p_fecha,
         hora = p_hora,
         prioridad = coalesce(p_prioridad, 'normal'),
         categoria_id = p_categoria,
         responsable_id = p_responsable,
         entidad_tipo = p_entidad_tipo,
         entidad_id = p_entidad_id,
         notas = nullif(btrim(coalesce(p_notas, '')), ''),
         anticipacion_min = p_anticipacion,
         -- CAMBIAR LA FECHA O LA HORA VUELVE A ARMAR EL AVISO. Sin esto, mover
         -- un recordatorio a la semana que viene lo dejaria marcado como ya
         -- avisado y no volveria a sonar.
         notificado_en = case when p_fecha is distinct from (v_antes->>'fecha')::date
                                or p_hora is distinct from (v_antes->>'hora')::time
                              then null else notificado_en end,
         actualizado_en = now(),
         actualizado_por = auth.uid()
   where id = p_id and negocio_id = p_negocio;

  perform app.anotar_recordatorio(p_negocio, p_id, 'editado', v_antes,
    jsonb_build_object('titulo', v_titulo, 'fecha', p_fecha, 'hora', p_hora,
                       'prioridad', p_prioridad, 'categoriaId', p_categoria,
                       'responsableId', p_responsable));
  return p_id;
end;
$$;

comment on function public.guardar_recordatorio(text, uuid, text, date, text, time, text, uuid, uuid, text, uuid, text, int) is
  'Alta y edicion de la MISMA entidad. Editar no crea uno nuevo: es la misma fila, y por eso su '
  'historial se puede leer entero.';

grant execute on function public.guardar_recordatorio(text, uuid, text, date, text, time, text, uuid, uuid, text, uuid, text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 11. COMPLETAR Y REABRIR — y la siguiente vuelta de la recurrencia
-- ---------------------------------------------------------------------
--
-- COMPLETAR UN RECURRENTE NO MATA LA RECURRENCIA. Es el error clasico: se marca
-- hecho "confirmar caja del lunes" y la regla desaparece con el, asi que el
-- lunes siguiente no avisa nadie. Aqui, al cerrar uno que viene de una regla,
-- se programa la siguiente ocurrencia en el mismo acto — y si ya existe, el
-- indice unico la descarta sin ruido.
create or replace function public.completar_recordatorio(
  p_id uuid,
  p_hecho boolean default true
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila     recordatorio;
  v_regla    recordatorio_recurrente;
  v_proxima  date;
  v_nuevo    uuid;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo. Solo quien lo creó, su responsable o quien '
                    'administra el centro pueden cerrarlo.' using errcode = 'insufficient_privilege';
  end if;

  if p_hecho then
    update recordatorio
       set estado = 'hecho', completado_en = now(), completado_por = auth.uid(),
           actualizado_en = now(), actualizado_por = auth.uid()
     where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'completado',
      jsonb_build_object('estado', v_fila.estado), jsonb_build_object('estado', 'hecho'));
  else
    -- REABRIR LIMPIA LA MARCA DE COMPLETADO. Dejarla puesta haria que las
    -- metricas de "completados este mes" contaran uno que esta abierto.
    update recordatorio
       set estado = 'pendiente', completado_en = null, completado_por = null,
           notificado_en = null, actualizado_en = now(), actualizado_por = auth.uid()
     where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'reabierto',
      jsonb_build_object('estado', v_fila.estado), jsonb_build_object('estado', 'pendiente'));
    return null;
  end if;

  if v_fila.recurrente_id is null then return null; end if;

  select * into v_regla from recordatorio_recurrente
   where id = v_fila.recurrente_id and estado = 'activo' and not eliminado;
  if not found then return null; end if;

  v_proxima := app.siguiente_fecha_de_recordatorio(
    v_regla.frecuencia, v_regla.intervalo, v_regla.dias_semana, v_fila.fecha);

  -- Los dos topes de una regla: la fecha final y el numero de repeticiones.
  if v_regla.fecha_fin is not null and v_proxima > v_regla.fecha_fin then
    update recordatorio_recurrente set estado = 'finalizado', actualizado_en = now()
     where id = v_regla.id;
    return null;
  end if;
  if v_regla.repeticiones is not null and v_regla.generados >= v_regla.repeticiones then
    update recordatorio_recurrente set estado = 'finalizado', actualizado_en = now()
     where id = v_regla.id;
    return null;
  end if;

  insert into recordatorio (negocio_id, titulo, detalle, notas, fecha, hora, prioridad,
                            categoria_id, responsable_id, entidad_tipo, entidad_id,
                            anticipacion_min, recurrente_id, creado_por, estado)
  values (v_regla.negocio_id, v_regla.titulo, v_regla.detalle, v_regla.notas, v_proxima,
          v_regla.hora, v_regla.prioridad, v_regla.categoria_id, v_regla.responsable_id,
          v_regla.entidad_tipo, v_regla.entidad_id, v_regla.anticipacion_min,
          v_regla.id, v_regla.creado_por, 'pendiente')
  -- Si otra pestaña ya la creo, esta se descarta sola. La unicidad la pone el
  -- indice, no esta funcion.
  on conflict do nothing
  returning id into v_nuevo;

  update recordatorio_recurrente
     set proxima_fecha = v_proxima,
         generados = generados + case when v_nuevo is null then 0 else 1 end,
         actualizado_en = now()
   where id = v_regla.id;

  if v_nuevo is not null then
    perform app.anotar_recordatorio(v_regla.negocio_id, v_nuevo, 'programado', null,
      jsonb_build_object('fecha', v_proxima, 'recurrenteId', v_regla.id));
  end if;
  return v_nuevo;
end;
$$;

comment on function public.completar_recordatorio(uuid, boolean) is
  'Completar y reabrir. Completar uno recurrente PROGRAMA LA SIGUIENTE VUELTA en el mismo acto: '
  'sin eso, cerrar el del lunes mataria la regla y el lunes siguiente no avisaria nadie.';

grant execute on function public.completar_recordatorio(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 12. POSPONER, AJUSTAR, CANCELAR, DUPLICAR Y ELIMINAR
-- ---------------------------------------------------------------------

-- POSPONER MUEVE LA FECHA DE VERDAD Y LO ANOTA. Un "posponer" que solo esconde
-- el renglon un rato es la funcion que mas rapido destruye la confianza en una
-- lista de pendientes: al dia siguiente vuelve a aparecer y nadie sabe si se
-- movio o no.
create or replace function public.posponer_recordatorio(
  p_id uuid,
  p_fecha date,
  p_hora time default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if p_fecha is null then
    raise exception 'Posponer necesita una fecha nueva.' using errcode = 'check_violation';
  end if;
  if v_fila.estado <> 'pendiente' then
    raise exception 'Solo se pospone lo que sigue pendiente.' using errcode = 'check_violation';
  end if;

  update recordatorio
     set fecha = p_fecha,
         hora = coalesce(p_hora, hora),
         -- Vuelve a armarse el aviso: si no, un recordatorio ya avisado que se
         -- pospone a mañana no volveria a sonar nunca.
         notificado_en = null,
         actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_id;

  perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'pospuesto',
    jsonb_build_object('fecha', v_fila.fecha, 'hora', v_fila.hora),
    jsonb_build_object('fecha', p_fecha, 'hora', coalesce(p_hora, v_fila.hora)));
end;
$$;

grant execute on function public.posponer_recordatorio(uuid, date, time) to authenticated;

-- Cambia UNA cosa y anota cual. Es lo que usan las opciones rapidas del menu
-- de tres puntos: reasignar, subir la prioridad, mover de categoria.
--
-- UN DISCRIMINADOR Y NO CUATRO PARAMETROS OPCIONALES, porque `null` es un valor
-- legitimo en los tres campos: "sin responsable" y "no me lo toques" no se
-- pueden distinguir si los dos llegan como null.
create or replace function public.ajustar_recordatorio(
  p_id uuid,
  p_que text,
  p_valor text
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
  v_antes jsonb;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo.' using errcode = 'insufficient_privilege';
  end if;

  if p_que = 'responsable' then
    v_antes := jsonb_build_object('responsableId', v_fila.responsable_id);
    update recordatorio set responsable_id = nullif(p_valor, '')::uuid,
           actualizado_en = now(), actualizado_por = auth.uid() where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'reasignado', v_antes,
      jsonb_build_object('responsableId', nullif(p_valor, '')));

  elsif p_que = 'prioridad' then
    if p_valor not in ('baja', 'normal', 'alta', 'urgente') then
      raise exception 'Esa prioridad no existe.' using errcode = 'check_violation';
    end if;
    v_antes := jsonb_build_object('prioridad', v_fila.prioridad);
    update recordatorio set prioridad = p_valor,
           actualizado_en = now(), actualizado_por = auth.uid() where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'prioridad', v_antes,
      jsonb_build_object('prioridad', p_valor));

  elsif p_que = 'categoria' then
    v_antes := jsonb_build_object('categoriaId', v_fila.categoria_id);
    update recordatorio set categoria_id = nullif(p_valor, '')::uuid,
           actualizado_en = now(), actualizado_por = auth.uid() where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'categoria', v_antes,
      jsonb_build_object('categoriaId', nullif(p_valor, '')));

  elsif p_que = 'avisado' then
    -- La pantalla marca que YA aviso, para no repetir la notificacion cada vez
    -- que alguien recarga. No lleva historial: no es una decision de nadie.
    update recordatorio set notificado_en = now() where id = p_id;

  else
    raise exception 'No se puede ajustar "%".', p_que using errcode = 'check_violation';
  end if;
end;
$$;

grant execute on function public.ajustar_recordatorio(uuid, text, text) to authenticated;

-- CANCELAR NO ES COMPLETAR, y son dos cosas distintas para el negocio: una se
-- hizo y la otra ya no aplica. Contarlas juntas convertiria "27 completados"
-- en un numero que nadie puede usar.
create or replace function public.cancelar_recordatorio(
  p_id uuid,
  p_motivo text default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo.' using errcode = 'insufficient_privilege';
  end if;

  update recordatorio
     set estado = 'descartado', actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_id;

  perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'cancelado',
    jsonb_build_object('estado', v_fila.estado),
    jsonb_build_object('estado', 'descartado', 'motivo', nullif(btrim(coalesce(p_motivo, '')), '')));
end;
$$;

grant execute on function public.cancelar_recordatorio(uuid, text) to authenticated;

-- ELIMINAR ES MARCAR, NUNCA BORRAR. La regla 9 del bloque 0 vale igual aqui:
-- el historial de por que nadie confirmo aquella cita se pierde entero si la
-- fila desaparece. Y ademas libera el hueco del indice de origen, que es la
-- forma de decirle a una automatizacion "vuelve a avisarme de esto".
create or replace function public.eliminar_recordatorio(p_id uuid) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo.' using errcode = 'insufficient_privilege';
  end if;

  -- El renglon del historial va ANTES del borrado logico: despues, la fila ya
  -- no cuenta como visible y el rastro quedaria sin su ultimo paso.
  perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'eliminado',
    jsonb_build_object('titulo', v_fila.titulo, 'estado', v_fila.estado), null);

  update recordatorio set eliminado = true, actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_id;
end;
$$;

grant execute on function public.eliminar_recordatorio(uuid) to authenticated;

-- DUPLICAR CREA OTRA ENTIDAD, con su propio id y su propio historial. Lo que NO
-- se copia es el estado ni la recurrencia: una copia nace pendiente y suelta,
-- porque copiar la regla dejaria dos reglas generando el mismo recordatorio.
create or replace function public.duplicar_recordatorio(p_id uuid, p_fecha date default null)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila  recordatorio;
  v_nuevo uuid;
begin
  select * into v_fila from recordatorio where id = p_id and not eliminado;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.es_miembro(v_fila.negocio_id) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  insert into recordatorio (negocio_id, titulo, detalle, notas, fecha, hora, prioridad,
                            categoria_id, responsable_id, entidad_tipo, entidad_id,
                            anticipacion_min, creado_por, estado)
  values (v_fila.negocio_id, left(v_fila.titulo || ' (copia)', 160), v_fila.detalle, v_fila.notas,
          coalesce(p_fecha, v_fila.fecha), v_fila.hora, v_fila.prioridad, v_fila.categoria_id,
          v_fila.responsable_id, v_fila.entidad_tipo, v_fila.entidad_id, v_fila.anticipacion_min,
          auth.uid(), 'pendiente')
  returning id into v_nuevo;

  perform app.anotar_recordatorio(v_fila.negocio_id, v_nuevo, 'creado', null,
    jsonb_build_object('duplicadoDe', p_id));
  return v_nuevo;
end;
$$;

grant execute on function public.duplicar_recordatorio(uuid, date) to authenticated;

-- El rastro de un recordatorio, del mas reciente al mas viejo.
create or replace function public.historial_del_recordatorio(p_id uuid)
returns table (
  id uuid, accion text, antes jsonb, despues jsonb, usuario text, creado_en timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return query
    select e.id, e.accion, e.antes, e.despues, e.usuario_nombre, e.creado_en
      from recordatorio_evento e
     where e.recordatorio_id = p_id
     order by e.creado_en desc, e.id desc
     limit 100;
end;
$$;

grant execute on function public.historial_del_recordatorio(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 13. LOS RECORDATORIOS DE UNA ENTIDAD — lo que leen los demas modulos
-- ---------------------------------------------------------------------
--
-- ESTA ES LA MITAD DE LA CONEXION QUE CASI SIEMPRE FALTA. Poder abrir el
-- paciente desde el recordatorio es facil; poder ver los recordatorios desde el
-- expediente del paciente es lo que hace que el modulo sirva. Sin esto, quien
-- abre una ficha no tiene forma de saber que hay algo pendiente con esa persona.
create or replace function public.recordatorios_de_la_entidad(
  p_negocio text,
  p_tipo text,
  p_entidad uuid,
  p_incluir_cerrados boolean default false
) returns jsonb
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
             'id', r.id, 'titulo', r.titulo, 'detalle', r.detalle, 'fecha', r.fecha,
             'hora', r.hora, 'prioridad', r.prioridad, 'estado', r.estado,
             'categoria', c.nombre, 'responsable', m.nombre)
           order by r.estado, r.fecha, r.hora nulls last)
      from recordatorio r
      left join categoria c on c.id = r.categoria_id
      left join membresia m on m.id = r.responsable_id
     where r.negocio_id = p_negocio and not r.eliminado
       and r.entidad_tipo = p_tipo and r.entidad_id = p_entidad
       and (p_incluir_cerrados or r.estado = 'pendiente')
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.recordatorios_de_la_entidad(text, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 14. LA RECURRENCIA — guardar la regla y generar lo que ya tocaba
-- ---------------------------------------------------------------------
create or replace function public.guardar_recordatorio_recurrente(
  p_negocio text,
  p_id uuid,
  p_titulo text,
  p_frecuencia text,
  p_fecha_inicio date,
  p_detalle text default null,
  p_notas text default null,
  p_hora time default null,
  p_prioridad text default 'normal',
  p_categoria uuid default null,
  p_responsable uuid default null,
  p_entidad_tipo text default null,
  p_entidad_id uuid default null,
  p_intervalo int default 1,
  p_dias_semana int[] default null,
  p_fecha_fin date default null,
  p_repeticiones int default null,
  p_anticipacion int default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_titulo text := btrim(coalesce(p_titulo, ''));
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if v_titulo = '' then
    raise exception 'El recordatorio necesita un título.' using errcode = 'check_violation';
  end if;
  if p_fecha_inicio is null then
    raise exception 'La repetición necesita una fecha de inicio.' using errcode = 'check_violation';
  end if;
  if p_fecha_fin is not null and p_fecha_fin < p_fecha_inicio then
    raise exception 'La repetición no puede terminar antes de empezar.'
      using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into recordatorio_recurrente
      (negocio_id, titulo, detalle, notas, hora, prioridad, categoria_id, responsable_id,
       entidad_tipo, entidad_id, anticipacion_min, frecuencia, intervalo, dias_semana,
       fecha_inicio, fecha_fin, repeticiones, proxima_fecha, creado_por)
    values (p_negocio, v_titulo, nullif(btrim(coalesce(p_detalle, '')), ''),
            nullif(btrim(coalesce(p_notas, '')), ''), p_hora, coalesce(p_prioridad, 'normal'),
            p_categoria, p_responsable, p_entidad_tipo, p_entidad_id, p_anticipacion,
            p_frecuencia, greatest(coalesce(p_intervalo, 1), 1), p_dias_semana,
            p_fecha_inicio, p_fecha_fin, p_repeticiones,
            -- LA PRIMERA VEZ ES LA FECHA DE INICIO, no la siguiente. Saltarse la
            -- primera ocurrencia es el fallo que hace que una regla creada hoy
            -- para hoy no genere nada y parezca rota.
            p_fecha_inicio, auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  update recordatorio_recurrente
     set titulo = v_titulo,
         detalle = nullif(btrim(coalesce(p_detalle, '')), ''),
         notas = nullif(btrim(coalesce(p_notas, '')), ''),
         hora = p_hora,
         prioridad = coalesce(p_prioridad, 'normal'),
         categoria_id = p_categoria,
         responsable_id = p_responsable,
         entidad_tipo = p_entidad_tipo,
         entidad_id = p_entidad_id,
         anticipacion_min = p_anticipacion,
         frecuencia = p_frecuencia,
         intervalo = greatest(coalesce(p_intervalo, 1), 1),
         dias_semana = p_dias_semana,
         fecha_inicio = p_fecha_inicio,
         fecha_fin = p_fecha_fin,
         repeticiones = p_repeticiones,
         -- La proxima nunca retrocede por debajo del inicio nuevo.
         proxima_fecha = greatest(proxima_fecha, p_fecha_inicio),
         actualizado_en = now()
   where id = p_id and negocio_id = p_negocio;
  return p_id;
end;
$$;

grant execute on function public.guardar_recordatorio_recurrente(text, uuid, text, text, date, text, text, time, text, uuid, uuid, text, uuid, int, int[], date, int, int) to authenticated;

create or replace function public.marcar_recordatorio_recurrente(p_id uuid, p_estado text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_estado not in ('activo', 'pausado', 'finalizado') then
    raise exception 'Ese estado no existe para una repetición.' using errcode = 'check_violation';
  end if;
  update recordatorio_recurrente set estado = p_estado, actualizado_en = now() where id = p_id;
end;
$$;

grant execute on function public.marcar_recordatorio_recurrente(uuid, text) to authenticated;

create or replace function public.recordatorios_recurrentes_del_centro(p_negocio text)
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
    select jsonb_agg(jsonb_build_object(
             'id', rr.id, 'titulo', rr.titulo, 'detalle', rr.detalle, 'notas', rr.notas,
             'hora', rr.hora, 'prioridad', rr.prioridad,
             'categoriaId', rr.categoria_id, 'categoria', c.nombre,
             'responsableId', rr.responsable_id, 'responsable', m.nombre,
             'entidadTipo', rr.entidad_tipo, 'entidadId', rr.entidad_id,
             'frecuencia', rr.frecuencia, 'intervalo', rr.intervalo,
             'diasSemana', rr.dias_semana,
             'fechaInicio', rr.fecha_inicio, 'fechaFin', rr.fecha_fin,
             'repeticiones', rr.repeticiones, 'generados', rr.generados,
             'proximaFecha', rr.proxima_fecha, 'estado', rr.estado,
             'anticipacionMin', rr.anticipacion_min)
           order by rr.estado, rr.proxima_fecha)
      from recordatorio_recurrente rr
      left join categoria c on c.id = rr.categoria_id
      left join membresia m on m.id = rr.responsable_id
     where rr.negocio_id = p_negocio and not rr.eliminado
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.recordatorios_recurrentes_del_centro(text) to authenticated;

-- Crea las ocurrencias que ya tocaban.
--
-- SE PUEDE LLAMAR CUANTAS VECES SE QUIERA, y por eso se llama al abrir la
-- pantalla y no hace falta un proceso aparte. La unicidad no la pone esta
-- llamada: la pone el indice `(recurrente_id, fecha)`. Diez pestañas abiertas a
-- la vez no pueden crear dos veces el recordatorio del lunes.
--
-- SE GENERA HASTA HOY Y NO MAS ALLA. Adelantar la agenda entera del año
-- llenaria la lista de cosas que nadie tiene que mirar todavia; el limite de
-- vueltas evita ademas que una regla mal guardada cuelgue la peticion.
create or replace function public.generar_recordatorios_recurrentes(
  p_negocio text,
  p_hoy date default current_date
) returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_regla   recordatorio_recurrente;
  v_fecha   date;
  v_creados int := 0;
  v_nuevo   uuid;
  v_vueltas int;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  for v_regla in
    select * from recordatorio_recurrente
     where negocio_id = p_negocio and estado = 'activo' and not eliminado
       and proxima_fecha <= p_hoy
  loop
    v_fecha := greatest(v_regla.proxima_fecha, v_regla.fecha_inicio);
    v_vueltas := 0;

    while v_fecha <= p_hoy and v_vueltas < 400 loop
      v_vueltas := v_vueltas + 1;

      exit when v_regla.fecha_fin is not null and v_fecha > v_regla.fecha_fin;
      exit when v_regla.repeticiones is not null
                and v_regla.generados + v_creados >= v_regla.repeticiones;

      insert into recordatorio (negocio_id, titulo, detalle, notas, fecha, hora, prioridad,
                                categoria_id, responsable_id, entidad_tipo, entidad_id,
                                anticipacion_min, recurrente_id, creado_por, estado)
      values (v_regla.negocio_id, v_regla.titulo, v_regla.detalle, v_regla.notas, v_fecha,
              v_regla.hora, v_regla.prioridad, v_regla.categoria_id, v_regla.responsable_id,
              v_regla.entidad_tipo, v_regla.entidad_id, v_regla.anticipacion_min,
              v_regla.id, v_regla.creado_por, 'pendiente')
      on conflict do nothing
      returning id into v_nuevo;

      if v_nuevo is not null then
        v_creados := v_creados + 1;
        perform app.anotar_recordatorio(v_regla.negocio_id, v_nuevo, 'programado', null,
          jsonb_build_object('fecha', v_fecha, 'recurrenteId', v_regla.id));
      end if;
      v_nuevo := null;

      v_fecha := app.siguiente_fecha_de_recordatorio(
        v_regla.frecuencia, v_regla.intervalo, v_regla.dias_semana, v_fecha);
    end loop;

    update recordatorio_recurrente
       set proxima_fecha = v_fecha,
           generados = generados + v_creados,
           estado = case
             when fecha_fin is not null and v_fecha > fecha_fin then 'finalizado'
             when repeticiones is not null and generados + v_creados >= repeticiones then 'finalizado'
             else estado end,
           actualizado_en = now()
     where id = v_regla.id;
  end loop;

  return v_creados;
end;
$$;

comment on function public.generar_recordatorios_recurrentes(text, date) is
  'Crea lo que ya tocaba. Idempotente por el indice (recurrente_id, fecha), no por esta funcion: '
  'diez pestañas abiertas no pueden crear dos veces el recordatorio del lunes.';

grant execute on function public.generar_recordatorios_recurrentes(text, date) to authenticated;

-- ---------------------------------------------------------------------
-- 15. LA CONFIGURACION DEL MODULO
-- ---------------------------------------------------------------------
create or replace function public.ajustes_de_recordatorios(p_negocio text) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
           'avisarEnNavegador', a.avisar_en_navegador,
           'anticipacionMin', a.anticipacion_min,
           'horaPorOmision', a.hora_por_omision,
           'avisarAlResponsable', a.avisar_al_responsable,
           'avisarAlReasignar', a.avisar_al_reasignar,
           'diasDeProximos', a.dias_de_proximos,
           'ordenPorOmision', a.orden_por_omision,
           'consejo', a.consejo)
    into v
    from recordatorio_ajustes a where a.negocio_id = p_negocio;

  -- SIN FILA SE DEVUELVEN LOS VALORES DE ARRANQUE, no un nulo. Que la pantalla
  -- tenga que saber que hacer con "todavia no configuraron nada" es como
  -- terminan dos juegos de valores por omision distintos, uno aqui y otro alla.
  return coalesce(v, jsonb_build_object(
    'avisarEnNavegador', false,
    'anticipacionMin', 30,
    'horaPorOmision', '09:00',
    'avisarAlResponsable', true,
    'avisarAlReasignar', true,
    'diasDeProximos', 7,
    'ordenPorOmision', 'urgencia',
    'consejo', null));
end;
$$;

grant execute on function public.ajustes_de_recordatorios(text) to authenticated;

create or replace function public.guardar_ajustes_de_recordatorios(
  p_negocio text,
  p_avisar_navegador boolean,
  p_anticipacion int,
  p_hora_por_omision time,
  p_avisar_responsable boolean,
  p_avisar_reasignar boolean,
  p_dias_proximos int,
  p_orden text,
  p_consejo text default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'Configurar Recordatorios le cambia el comportamiento a todo el centro y pide '
                    'permiso de configuración.' using errcode = 'insufficient_privilege';
  end if;

  insert into recordatorio_ajustes
    (negocio_id, avisar_en_navegador, anticipacion_min, hora_por_omision,
     avisar_al_responsable, avisar_al_reasignar, dias_de_proximos, orden_por_omision,
     consejo, actualizado_en, actualizado_por)
  values (p_negocio, coalesce(p_avisar_navegador, false), coalesce(p_anticipacion, 30),
          coalesce(p_hora_por_omision, '09:00'), coalesce(p_avisar_responsable, true),
          coalesce(p_avisar_reasignar, true), coalesce(p_dias_proximos, 7),
          coalesce(p_orden, 'urgencia'), nullif(btrim(coalesce(p_consejo, '')), ''),
          now(), auth.uid())
  on conflict (negocio_id) do update
    set avisar_en_navegador = excluded.avisar_en_navegador,
        anticipacion_min = excluded.anticipacion_min,
        hora_por_omision = excluded.hora_por_omision,
        avisar_al_responsable = excluded.avisar_al_responsable,
        avisar_al_reasignar = excluded.avisar_al_reasignar,
        dias_de_proximos = excluded.dias_de_proximos,
        orden_por_omision = excluded.orden_por_omision,
        consejo = excluded.consejo,
        actualizado_en = now(),
        actualizado_por = auth.uid();
end;
$$;

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
