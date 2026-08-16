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
