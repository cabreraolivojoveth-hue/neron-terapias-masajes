-- =====================================================================
-- ACTUALIZAR-BASE.sql — SOLO LO NUEVO
-- =====================================================================
--
-- Pegar en Supabase -> SQL Editor -> Run. Una sola vez basta.
--
-- Es seguro correrlo las veces que haga falta: no borra datos, no reescribe
-- filas, y todo va con `if not exists` o `create or replace`. Si ya corriste
-- una version anterior de este archivo, correr esta otra vez no hace daño.
--
-- QUE TRAE, en orden:
--
--   1. ELIMINAR UN PRODUCTO. Sin esto, el boton Eliminar de un producto
--      contesta que la funcion no existe.
--   2. EL EXPEDIENTE CLINICO DEL CLIENTE. Sin esto, la ficha de salud se
--      guarda pero no se vuelve a leer: padecimientos, alergias y
--      contraindicaciones salen vacias la siguiente vez que se abre — y son
--      justo las que hay que mirar ANTES de dar una sesion.
--   3. EL MODULO GASTOS COMPLETO: la tabla `gasto` completada, los
--      recurrentes, el disparador a caja con el efectivo aparte y sus ocho
--      funciones.
--   4. LA CAPA DE REPORTES: `reporte_del_periodo` —todo el reporte en UNA
--      llamada— y la tabla `reporte_guardado` con sus reglas de fila.
--   5. LA CAPA DE MENSAJES: conversaciones, hilos, canales, plantillas,
--      automatizaciones y difusiones, con sus permisos de tabla.
--   6. RECORDATORIOS COMPLETO: la tabla `recordatorio` del bloque 0 se
--      completa —hora, categoria, responsable, notas, recurrencia, origen y
--      quien lo cerro— y llegan `recordatorio_recurrente`,
--      `recordatorio_evento`, `recordatorio_ajustes` y
--      `recordatorio_automatizacion` con sus reglas de fila y sus veinte
--      funciones. Sin esto, Recordatorios abre y contesta que las funciones no
--      existen.
--
-- Y ARRIBA, EN LAS CORRECCIONES: `resumen_inicio` vuelve a crearse para
-- separar los recordatorios de hoy de los vencidos. Sin ella, Inicio sigue
-- funcionando pero sus dos tarjetas nuevas salen en cero.
--
-- POR QUE VAN LOS CUATRO Y NO SOLO EL ULTIMO: la version anterior de este
-- archivo se regenero para Gastos y en el camino perdio los dos primeros
-- bloques, que nunca se llegaron a correr. Al ser todo idempotente, la
-- respuesta correcta es incluirlos otra vez en vez de pedirte que recuerdes
-- cual corriste.
--
-- Sin correr esto, el sitio se publica igual y las pantallas nuevas salen con
-- un error que no dice nada util: el navegador pide funciones que la base
-- todavia no tiene. Vercel publica el navegador, no la base.
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

-- =====================================================================
-- ELIMINAR UN PRODUCTO — y por que no es lo mismo que desactivarlo
-- =====================================================================
--
-- DESACTIVAR saca el producto del catalogo y conserva su historial: lo que ya
-- se vendio sigue cuadrando, los reportes de meses pasados siguen dando el
-- mismo total, y el renglon de una venta vieja sigue sabiendo que se llevo.
--
-- ELIMINAR es para lo que NUNCA debio existir: un producto capturado por error,
-- una prueba, un duplicado. Y por eso solo se permite cuando NADA cuelga de el.
--
-- LA REGLA QUE HACE ESTO SEGURO: si el producto tiene una venta detras, no se
-- borra — se ofrece desactivarlo. Sin esa regla, borrar un producto vendido
-- dejaria renglones de venta apuntando a la nada: el ticket de un cliente
-- dejaria de poder reconstruirse y el total del mes cambiaria solo. Eso no es
-- una molestia, es perder contabilidad ya cerrada.
--
-- Los movimientos de inventario y los proveedores SI se van con el: no son
-- historia contable, son historia del propio producto que se esta borrando.
--
-- Se marca `eliminado` en vez de borrar el renglon. El id sigue existiendo, asi
-- que nada de lo que lo referencie se rompe, y una equivocacion se puede
-- deshacer desde la base sin haber perdido nada.
--
create or replace function app.eliminar_producto(p_producto uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p      producto;
  v_ventas int;
  v_quien  membresia;
begin
  select * into v_p from producto where id = p_producto and not eliminado for update;
  if v_p.id is null then
    raise exception 'Ese producto no existe.' using errcode = 'no_data_found';
  end if;

  if not app.tiene_permiso(v_p.negocio_id, 'gestionarInventario') then
    raise exception 'No tienes permiso para eliminar productos.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_ventas
    from venta_item
   where negocio_id = v_p.negocio_id
     and tipo = 'producto'
     and referencia_id = p_producto;

  -- LO QUE YA SE VENDIO NO SE BORRA. Se dice que hacer en su lugar: un error
  -- que solo prohibe deja a la persona sin salida.
  if v_ventas > 0 then
    raise exception
      '% ya se vendio % %: no se puede eliminar. Desactivalo para sacarlo del catalogo sin perder su historial.',
      v_p.nombre, v_ventas, case when v_ventas = 1 then 'vez' else 'veces' end
      using errcode = 'foreign_key_violation';
  end if;

  delete from movimiento_inventario
   where negocio_id = v_p.negocio_id and producto_id = p_producto;
  delete from producto_proveedor
   where negocio_id = v_p.negocio_id and producto_id = p_producto;

  update producto
     set eliminado = true, activo = false, actualizado_en = now()
   where id = p_producto;

  -- QUEDA ESCRITO QUIEN LO BORRO. Es lo unico que queda de un producto que ya
  -- no esta, y la unica forma de contestar "aqui habia algo, que paso".
  select * into v_quien from membresia
   where negocio_id = v_p.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (v_p.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'productos', 'eliminar', p_producto::text,
          jsonb_build_object('nombre', v_p.nombre, 'sku', v_p.sku,
                             'stock', v_p.stock_actual),
          null);
end;
$$;

create or replace function public.eliminar_producto(p_producto uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$ select app.eliminar_producto(p_producto); $$;

grant execute on function public.eliminar_producto(uuid) to authenticated;

comment on function public.eliminar_producto is
  'Da de baja un producto que nunca debio existir. Se niega si ya se vendio: en ese caso lo que '
  'corresponde es desactivarlo, porque borrarlo dejaria renglones de venta apuntando a la nada.';

-- =====================================================================
-- EL EXPEDIENTE CLINICO DE UN CLIENTE
-- =====================================================================
--
-- POR QUE ESTO NO ES "INFORMACION ADICIONAL": en un centro de terapias, lo que
-- una persona tiene es lo PRIMERO que hay que saber, no un dato de relleno.
-- Dar un masaje descontracturante a alguien con una hernia reciente, usar
-- lavanda con quien es alergico, o aplicar presion firme a quien toma
-- anticoagulantes son daños de verdad — y ninguno se ve en la cara.
--
-- CADA COLUMNA ES TEXTO LIBRE Y NO UNA LISTA CERRADA, a proposito. Un catalogo
-- de padecimientos obligaria a mantenerlo y, el dia que llegue uno que no esta,
-- se captura en el campo equivocado o no se captura. Aqui lo que importa es que
-- QUEDE ESCRITO y que se lea antes de la sesion.
--
-- SE AGREGAN CON "if not exists" una por una: correr esto dos veces no hace
-- nada, y en una base que ya tiene clientes no se pierde ni un dato.
--
alter table cliente add column if not exists padecimientos       text;
alter table cliente add column if not exists alergias            text;
alter table cliente add column if not exists medicamentos        text;
alter table cliente add column if not exists cirugias            text;
alter table cliente add column if not exists embarazo            text;
alter table cliente add column if not exists contraindicaciones  text;
alter table cliente add column if not exists direccion           text;
alter table cliente add column if not exists ocupacion           text;
alter table cliente add column if not exists contacto_emergencia text;
alter table cliente add column if not exists telefono_emergencia text;
alter table cliente add column if not exists como_nos_conocio    text;
alter table cliente add column if not exists referido_por        text;
alter table cliente add column if not exists presion_preferida   text;
alter table cliente add column if not exists aromas_evitar       text;

comment on column cliente.contraindicaciones is
  'Lo que NO se le puede hacer a esta persona. Es la columna mas importante de la tabla: se lee '
  'antes de tocarla, y por eso el expediente la enseña arriba y aparte.';
comment on column cliente.embarazo is
  'no, si o lactancia. Cambia que aceites y que posiciones se pueden usar, asi que no es un dato '
  'mas: es una contraindicacion con nombre propio.';

-- El expediente ahora tambien trae lo clinico Y el historial de notas de sesion.
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
    -- Lo clinico. Va junto y con nombres claros: quien lo lee esta a punto de
    -- ponerle las manos encima a alguien.
    'padecimientos', c.padecimientos,
    'alergias', c.alergias,
    'medicamentos', c.medicamentos,
    'cirugias', c.cirugias,
    'embarazo', c.embarazo,
    'contraindicaciones', c.contraindicaciones,
    'direccion', c.direccion,
    'ocupacion', c.ocupacion,
    'contactoEmergencia', c.contacto_emergencia,
    'telefonoEmergencia', c.telefono_emergencia,
    'comoNosConocio', c.como_nos_conocio,
    'referidoPor', c.referido_por,
    'presionPreferida', c.presion_preferida,
    'aromasEvitar', c.aromas_evitar,
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
    ), '[]'::jsonb),
    -- ---------------------------------------------------------------
    -- LAS NOTAS DE CADA SESION, que es el historial de verdad.
    -- ---------------------------------------------------------------
    -- No se guardan en el cliente: son de la CITA, donde se escribieron. Aqui
    -- solo se juntan las que tienen algo escrito, de la mas reciente a la mas
    -- vieja. Es lo que deja llegar a la cuarta sesion sabiendo que se hizo en
    -- las tres anteriores, en vez de preguntar otra vez.
    'sesiones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', z.id, 'fecha', z.fecha, 'servicio', z.servicio,
               'profesional', z.profesional, 'notas', z.notas)
             order by z.fecha desc)
      from (
        select v.id, v.fecha, s.nombre as servicio, m.nombre as profesional, v.notas
        from cita v
        join servicio s on s.id = v.servicio_id
        left join membresia m on m.id = v.profesional_id
        where v.cliente_id = c.id and not v.eliminado
          and v.estado = 'completada'
          and v.notas is not null and btrim(v.notas) <> ''
        order by v.fecha desc, v.hora_inicio desc
        limit 20
      ) z
    ), '[]'::jsonb)
  )
  from cliente c
  where c.id = p_cliente;
$$;

comment on function public.expediente_del_cliente is
  'El expediente UNE lo que ya vive en otros modulos, y ahora tambien lo clinico y las notas de '
  'cada sesion. Ni una de las cifras esta guardada en la tabla cliente: se cuentan desde citas, '
  'ventas, pagos e inscripciones. Las notas de sesion son de la cita, donde se escribieron.';
-- =====================================================================
-- GASTOS — lo que sale del centro
-- =====================================================================
--
-- LO QUE YA EXISTIA Y NO SE VUELVE A ESCRIBIR: la tabla `gasto`, su
-- disparador a caja, la tabla `categoria` (que ya sirve a servicios, cursos y
-- productos), `proveedor`, y `movimiento_caja` con su indice unico. Este
-- bloque los COMPLETA; no levanta una arquitectura paralela al lado.
--
-- LAS TRES DECISIONES QUE MANDAN EN TODO LO DEMAS:
--
--  1. EL EFECTIVO SE GUARDA APARTE DEL MONTO. Un gasto mixto de $1,000 con
--     $300 en efectivo saca $300 del cajon, no $1,000. Con solo la columna
--     `metodo` no habia forma de saber cuanto: o salia todo o no salia nada, y
--     las dos estan mal. Por eso `efectivo_centavos` es una columna propia y
--     es LA UNICA que mira el disparador.
--
--  2. EDITAR UN GASTO NO EDITA SU MOVIMIENTO DE CAJA. La caja es un libro: se
--     escribe, no se corrige —lo dice el comentario de `movimiento_caja` desde
--     el bloque 6, y el indice unico lo hace cumplir: un gasto tiene como
--     mucho UN egreso y UN ingreso—. Asi que editar ANULA el gasto viejo (su
--     ingreso contrario entra a caja) y CREA uno nuevo que apunta al anterior
--     con `sustituye_a`. El neto en caja es exactamente el que pide la regla,
--     el historial queda entero, y es imposible que el mismo gasto meta dos
--     egresos.
--
--  3. UN RECURRENTE NO ES UN GASTO. Es una plantilla con su proxima fecha. El
--     gasto nace cuando le toca, y `(recurrente_id, periodo)` es UNICO: correr
--     la generacion dos veces —o diez— no puede crear el gasto de agosto dos
--     veces. La idempotencia esta en la base, no en quien la llama.

-- ---------------------------------------------------------------------
-- 1. LAS CATEGORIAS DE GASTO SE SUMAN A LAS QUE YA HABIA
-- ---------------------------------------------------------------------
--
-- `categoria` ya servia a servicios, cursos y productos con la columna
-- `ambito`. Crear una `categoria_gasto` aparte habria sido el mismo error que
-- costo el sistema de diseño: cuatro tablas parecidas y ninguna igual.
alter table categoria drop constraint if exists categoria_ambito_check;
alter table categoria add constraint categoria_ambito_check
  check (ambito in ('servicio', 'curso', 'producto', 'gasto'));

-- El icono y el orden los pide el diseño de Gastos. Van en la tabla comun
-- porque no tienen nada de gasto: el dia que Productos quiera ordenar las
-- suyas, ya esta.
alter table categoria add column if not exists icono text;
alter table categoria add column if not exists orden integer not null default 0;

-- ---------------------------------------------------------------------
-- 2. LA TABLA `gasto` SE COMPLETA
-- ---------------------------------------------------------------------
--
-- NO SE RENOMBRA `descripcion`. Es el concepto corto —"Renta de agosto"— y es
-- lo que caja copia a su movimiento desde el bloque 6. Cambiarle el nombre
-- obligaria a tocar el disparador, los ataques y los movimientos ya
-- guardados, todo para ganar una palabra. El texto largo y opcional del
-- diseño entra como `detalle`, que es lo que de verdad faltaba.
alter table gasto add column if not exists detalle text;

-- La categoria pasa de texto suelto a referencia. Se conserva la columna
-- `categoria` de texto: es lo que tienen los gastos capturados antes, y
-- borrarla perderia esa informacion sin devolver nada.
alter table gasto add column if not exists categoria_id uuid;
alter table gasto drop constraint if exists gasto_categoria_mismo_negocio;
alter table gasto add constraint gasto_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  on delete set null (categoria_id);

-- El proveedor SE REFERENCIA, no se copia. El dia que cambie su telefono,
-- todos los gastos viejos lo muestran al dia sin tocar nada.
alter table gasto add column if not exists proveedor_id uuid;
alter table gasto drop constraint if exists gasto_proveedor_mismo_negocio;
alter table gasto add constraint gasto_proveedor_mismo_negocio
  foreign key (negocio_id, proveedor_id) references proveedor (negocio_id, id)
  on delete set null (proveedor_id);

-- El folio de la factura o el recibo. Es por lo que se busca un gasto cuando
-- llega el contador.
alter table gasto add column if not exists referencia text;

/*
 * CUANTO DE ESTE GASTO SALIO DEL CAJON.
 *
 * Es la columna que decide si la caja se mueve y por cuanto, y la unica que
 * mira el disparador. Se guarda aparte del monto porque en un gasto mixto no
 * coinciden: $1,000 de los cuales $300 en efectivo sacan $300, y con solo
 * `metodo` habia que elegir entre sacar todo o no sacar nada.
 *
 * El relleno de los gastos que ya existian da por efectivo lo que se capturo
 * como efectivo y cero lo demas, que es exactamente lo que su movimiento de
 * caja ya dice.
 */
alter table gasto add column if not exists efectivo_centavos bigint not null default 0;
update gasto set efectivo_centavos = case when coalesce(metodo, 'efectivo') = 'efectivo'
                                          then monto_centavos else 0 end
 where efectivo_centavos = 0 and coalesce(metodo, 'efectivo') = 'efectivo';

-- En un gasto mixto, con que se pago la parte que NO fue efectivo. Sin esto,
-- el resumen por forma de pago no puede cuadrar con el total.
alter table gasto add column if not exists metodo_resto text;

alter table gasto drop constraint if exists gasto_metodo_check;
alter table gasto add constraint gasto_metodo_check
  check (metodo in ('efectivo', 'tarjeta', 'transferencia', 'mixto'));

/*
 * LAS TRES FORMAS TIENEN QUE CUADRAR ENTRE SI, y lo vigila la base.
 *
 * Puesto solo en la pantalla, cualquiera que llame a la base por su cuenta
 * puede grabar un gasto "de tarjeta" que saca efectivo del cajon. La regla
 * vive donde no se puede saltar.
 */
alter table gasto drop constraint if exists gasto_efectivo_cuadra;
alter table gasto add constraint gasto_efectivo_cuadra check (
  case metodo
    when 'efectivo' then efectivo_centavos = monto_centavos
    when 'mixto'    then efectivo_centavos > 0 and efectivo_centavos < monto_centavos
    else efectivo_centavos = 0
  end
);


-- ---------------------------------------------------------------------
-- 2.b EL EFECTIVO SE CALCULA SOLO, ANTES DE COMPROBARSE
-- ---------------------------------------------------------------------
--
-- POR QUE HACE FALTA, Y NO ES COMODIDAD.
--
-- La restriccion de mas abajo exige que el efectivo cuadre con la forma de
-- pago. Puesta sola, cualquier `insert` que no mencione `efectivo_centavos`
-- —los que ya existian, los de un script, los de un ataque— reventaba: la
-- columna arrancaba en cero y el metodo en efectivo, y eso no cuadra.
--
-- Se podria haber pedido que todos digan el efectivo. Pero entonces la regla
-- viviria en cada sitio que escribe, y basta que uno se equivoque para meter
-- dinero fantasma en la caja. Asi la invariante no se COMPRUEBA: se CUMPLE
-- sola, y el unico que tiene que acertar es el mixto — que es el unico caso
-- donde de verdad hay algo que decidir.
create or replace function app.gasto_normaliza_efectivo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.metodo := coalesce(new.metodo, 'efectivo');

  if new.metodo = 'efectivo' then
    new.efectivo_centavos := new.monto_centavos;
    new.metodo_resto := null;
  elsif new.metodo in ('tarjeta', 'transferencia') then
    new.efectivo_centavos := 0;
    new.metodo_resto := null;
  end if;
  -- El mixto conserva lo que le dieron: ahi si hay una decision, y la
  -- restriccion comprueba que quepa dentro del total.

  return new;
end;
$$;

drop trigger if exists gasto_normaliza_efectivo on gasto;
create trigger gasto_normaliza_efectivo
  before insert or update on gasto
  for each row execute function app.gasto_normaliza_efectivo();

-- Un gasto mixto dice con que se pago el resto; los demas no tienen resto.
alter table gasto drop constraint if exists gasto_metodo_resto_check;
alter table gasto add constraint gasto_metodo_resto_check check (
  (metodo = 'mixto' and metodo_resto in ('tarjeta', 'transferencia'))
  or (metodo <> 'mixto' and metodo_resto is null)
);

-- La cadena de correcciones: este gasto sustituye a aquel. Editar no pisa,
-- encadena, y por eso siempre se puede reconstruir que se capturo primero.
alter table gasto add column if not exists sustituye_a uuid;

-- De que plantilla recurrente nacio, y de que periodo. El par es UNICO mas
-- abajo: es lo que hace imposible generar dos veces el gasto de agosto.
alter table gasto add column if not exists recurrente_id uuid;
alter table gasto add column if not exists periodo text;

-- Anular es una operacion con nombre y apellido: quien, cuando y por que.
alter table gasto add column if not exists anulado_motivo text;
alter table gasto add column if not exists anulado_por uuid;
alter table gasto add column if not exists anulado_en timestamptz;

-- La fecha del gasto y la fecha en que se capturo NO son la misma, y el
-- reporte tiene que poder distinguirlas: una renta del 1 puede capturarse el 3.
alter table gasto add column if not exists actualizado_en timestamptz;

create index if not exists gasto_categoria_idx on gasto (negocio_id, categoria_id) where not eliminado;
create index if not exists gasto_proveedor_idx on gasto (negocio_id, proveedor_id) where not eliminado;

-- ---------------------------------------------------------------------
-- 3. LOS GASTOS RECURRENTES: la plantilla, no el gasto
-- ---------------------------------------------------------------------
create table if not exists gasto_recurrente (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      text not null references negocio(id) on delete cascade,
  descripcion     text not null,
  detalle         text,
  categoria_id    uuid,
  proveedor_id    uuid,
  monto_centavos  bigint not null check (monto_centavos > 0),
  metodo          text not null default 'efectivo'
                  check (metodo in ('efectivo', 'tarjeta', 'transferencia', 'mixto')),
  efectivo_centavos bigint not null default 0,
  metodo_resto    text,
  frecuencia      text not null
                  check (frecuencia in ('diario', 'semanal', 'quincenal', 'mensual',
                                        'bimestral', 'trimestral', 'semestral', 'anual')),
  fecha_inicio    date not null,
  proxima_fecha   date not null,
  fecha_fin       date,
  estado          text not null default 'activo'
                  check (estado in ('activo', 'pausado', 'finalizado')),
  notas           text,
  creado_por      uuid,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz,
  eliminado       boolean not null default false,
  constraint gasto_recurrente_negocio_id_unico unique (negocio_id, id),
  constraint gasto_recurrente_efectivo_cuadra check (
    case metodo
      when 'efectivo' then efectivo_centavos = monto_centavos
      when 'mixto'    then efectivo_centavos > 0 and efectivo_centavos < monto_centavos
      else efectivo_centavos = 0
    end
  ),
  constraint gasto_recurrente_metodo_resto_check check (
    (metodo = 'mixto' and metodo_resto in ('tarjeta', 'transferencia'))
    or (metodo <> 'mixto' and metodo_resto is null)
  ),
  -- Una plantilla que termina antes de empezar no genera nada y nadie
  -- entiende por que. Se rechaza al guardarla.
  constraint gasto_recurrente_fin_despues check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

comment on table gasto_recurrente is
  'LA PLANTILLA, NO EL GASTO. Guardar aqui la renta mensual no mueve ni un peso: el gasto nace '
  'cuando llega su fecha, por generar_gastos_recurrentes, y queda ligado por (recurrente_id, '
  'periodo) — que es unico, asi que correr la generacion diez veces crea el gasto una sola vez.';

alter table gasto_recurrente drop constraint if exists gasto_recurrente_categoria_mismo_negocio;
alter table gasto_recurrente add constraint gasto_recurrente_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  on delete set null (categoria_id);

alter table gasto_recurrente drop constraint if exists gasto_recurrente_proveedor_mismo_negocio;
alter table gasto_recurrente add constraint gasto_recurrente_proveedor_mismo_negocio
  foreign key (negocio_id, proveedor_id) references proveedor (negocio_id, id)
  on delete set null (proveedor_id);

create index if not exists gasto_recurrente_proxima_idx
  on gasto_recurrente (negocio_id, proxima_fecha) where estado = 'activo' and not eliminado;

alter table gasto drop constraint if exists gasto_recurrente_mismo_negocio;
alter table gasto add constraint gasto_recurrente_mismo_negocio
  foreign key (negocio_id, recurrente_id) references gasto_recurrente (negocio_id, id)
  on delete set null (recurrente_id);

/*
 * LA IDEMPOTENCIA, Y ES UN INDICE PORQUE NINGUN OTRO SITIO AGUANTA.
 *
 * Si la comprobacion viviera en la funcion —"mira si ya existe y si no,
 * crealo"— dos ejecuciones a la vez leerian las dos que no existe y crearian
 * las dos. Aqui la segunda choca contra el indice y se descarta sola, sin
 * importar cuantas corran ni desde donde.
 */
create unique index if not exists gasto_recurrente_periodo_unico
  on gasto (recurrente_id, periodo) where recurrente_id is not null and periodo is not null;

-- ---------------------------------------------------------------------
-- 4. LAS REGLAS DE FILA DEL RECURRENTE
-- ---------------------------------------------------------------------
alter table gasto_recurrente enable row level security;
alter table gasto_recurrente force row level security;

drop policy if exists gasto_recurrente_leer on gasto_recurrente;
create policy gasto_recurrente_leer on gasto_recurrente
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists gasto_recurrente_crear on gasto_recurrente;
create policy gasto_recurrente_crear on gasto_recurrente
  for insert to authenticated
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas')
              and app.licencia_permite(negocio_id));

drop policy if exists gasto_recurrente_editar on gasto_recurrente;
create policy gasto_recurrente_editar on gasto_recurrente
  for update to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'))
  with check (app.es_miembro(negocio_id) and app.licencia_permite(negocio_id));

grant select, insert, update on gasto_recurrente to authenticated;


-- ---------------------------------------------------------------------
-- 4.b EL INDICE UNICO DE CAJA APRENDE LA FORMA DE PAGO
-- ---------------------------------------------------------------------
--
-- Era `(negocio, origen, referencia_id, tipo)`: UN egreso por gasto. Eso
-- funciona mientras un gasto se pague de una sola forma, y deja de funcionar
-- con el mixto — que necesita DOS renglones, uno de efectivo y otro del resto,
-- porque la caja distingue el efectivo por la columna `metodo` y con un solo
-- renglon "mixto" contaria cero efectivo.
--
-- Es la misma solucion que ya se tomo en Ventas y por el mismo motivo: alli un
-- pago mixto son dos pagos, y el movimiento cuelga del PAGO para que cada uno
-- tenga el suyo. Aqui la forma de pago entra en el indice.
--
-- LO QUE SIGUE IMPEDIENDO es exactamente lo de antes: dos clics no meten el
-- mismo dinero dos veces, porque el par (gasto, efectivo) sigue siendo unico.
drop index if exists movimiento_caja_unico_por_origen;
create unique index if not exists movimiento_caja_unico_por_origen
  on movimiento_caja (negocio_id, origen, referencia_id, tipo, coalesce(metodo, 'efectivo'))
  where referencia_id is not null;

-- ---------------------------------------------------------------------
-- 5. EL DISPARADOR A CAJA, AHORA CON EL EFECTIVO APARTE
-- ---------------------------------------------------------------------
--
-- Sigue siendo el UNICO que escribe caja por un gasto. Lo que cambia es que
-- mira `efectivo_centavos` en vez de deducir el monto del metodo: un mixto de
-- $1,000 con $300 en efectivo saca $300, que es lo que de verdad salio del
-- cajon.



-- ---------------------------------------------------------------------
-- 5.b LA AUDITORIA DE GASTOS, EN UN SOLO SITIO
-- ---------------------------------------------------------------------
--
-- El bloque de auditoria son ocho lineas y hacen falta en cinco operaciones.
-- Copiado cinco veces, la sexta se escribe distinta y el dia que alguien
-- audite de verdad encuentra que "anular" no guardaba el rol. Aqui se escribe
-- una vez.
--
-- Es `security definer` A PROPOSITO: quien anula un gasto tiene permiso de
-- anularlo, no de escribir en el libro de auditoria — si pudiera escribirlo,
-- podria tambien maquillarlo.
create or replace function app.anotar_gasto(
  p_negocio text, p_accion text, p_entidad text, p_antes jsonb, p_despues jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quien membresia%rowtype;
begin
  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = p_negocio and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'gastos', p_accion, p_entidad, p_antes, p_despues);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. REGISTRAR UN GASTO
-- ---------------------------------------------------------------------
--
-- Se llama a una funcion en vez de insertar desde la pantalla por una razon
-- concreta: la pantalla manda el metodo y el monto, y es la BASE la que
-- calcula cuanto de eso es efectivo. Dejando ese calculo en el navegador,
-- cualquiera que llame a la base por su cuenta decide cuanto sale del cajon.
create or replace function public.registrar_gasto(
  p_negocio       text,
  p_descripcion   text,
  p_monto         bigint,
  p_metodo        text default 'efectivo',
  p_fecha         date default null,
  p_categoria     uuid default null,
  p_proveedor     uuid default null,
  p_detalle       text default null,
  p_referencia    text default null,
  p_notas         text default null,
  p_efectivo      bigint default null,
  p_metodo_resto  text default null,
  p_recurrente    uuid default null,
  p_periodo       text default null,
  p_sustituye_a   uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_efectivo bigint;
  v_id       uuid;
begin
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'El gasto necesita un concepto.' using errcode = 'invalid_parameter_value';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del gasto tiene que ser mayor que cero.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_metodo not in ('efectivo', 'tarjeta', 'transferencia', 'mixto') then
    raise exception 'Forma de pago desconocida: %', p_metodo using errcode = 'invalid_parameter_value';
  end if;

  -- EL EFECTIVO LO DECIDE LA BASE. Solo el mixto trae su parte, y se
  -- comprueba que quepa dentro del total.
  if p_metodo = 'efectivo' then
    v_efectivo := p_monto;
  elsif p_metodo = 'mixto' then
    v_efectivo := coalesce(p_efectivo, 0);
    if v_efectivo <= 0 or v_efectivo >= p_monto then
      raise exception 'En un gasto mixto la parte en efectivo tiene que ser mayor que cero y menor que el total.'
        using errcode = 'invalid_parameter_value';
    end if;
    if coalesce(p_metodo_resto, '') not in ('tarjeta', 'transferencia') then
      raise exception 'Un gasto mixto tiene que decir con que se pago el resto.'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    v_efectivo := 0;
  end if;

  insert into gasto (negocio_id, descripcion, detalle, categoria_id, proveedor_id,
                     monto_centavos, metodo, efectivo_centavos, metodo_resto,
                     fecha, referencia, notas, recurrente_id, periodo, sustituye_a, creado_por)
  values (p_negocio, trim(p_descripcion), nullif(trim(coalesce(p_detalle, '')), ''),
          p_categoria, p_proveedor, p_monto, p_metodo, v_efectivo,
          case when p_metodo = 'mixto' then p_metodo_resto end,
          coalesce(p_fecha, current_date), nullif(trim(coalesce(p_referencia, '')), ''),
          nullif(trim(coalesce(p_notas, '')), ''), p_recurrente, p_periodo, p_sustituye_a, auth.uid())
  returning id into v_id;

  perform app.anotar_gasto(p_negocio, case when p_recurrente is not null then 'generar' else 'crear' end,
    v_id::text, null,
    jsonb_build_object('concepto', trim(p_descripcion), 'monto', p_monto,
                       'metodo', p_metodo, 'efectivo', v_efectivo, 'fecha', coalesce(p_fecha, current_date)));

  return v_id;
end;
$$;

comment on function public.registrar_gasto is
  'Registra un gasto y deja que el disparador mueva la caja. El EFECTIVO lo calcula la base, no '
  'quien llama: dejarlo en el navegador seria dejar que el navegador decida cuanto sale del cajon.';

-- ---------------------------------------------------------------------
-- 7. EDITAR UN GASTO — anula y encadena
-- ---------------------------------------------------------------------
--
-- La caja es un libro y su indice unico solo deja UN egreso por gasto. Asi
-- que editar no pisa: anula el gasto viejo —su ingreso contrario entra a
-- caja— y crea uno nuevo que apunta al anterior.
--
-- El neto sale exactamente como pide la regla. Cambiar $500 en efectivo por
-- $700 en efectivo deja en caja: -500, +500, -700. El saldo baja 700, que es
-- lo correcto, y ademas se puede reconstruir que paso.
create or replace function public.editar_gasto(
  p_gasto         uuid,
  p_descripcion   text,
  p_monto         bigint,
  p_metodo        text,
  p_fecha         date default null,
  p_categoria     uuid default null,
  p_proveedor     uuid default null,
  p_detalle       text default null,
  p_referencia    text default null,
  p_notas         text default null,
  p_efectivo      bigint default null,
  p_metodo_resto  text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_viejo gasto%rowtype;
  v_nuevo uuid;
begin
  select * into v_viejo from gasto where id = p_gasto;
  if not found then
    raise exception 'Ese gasto no existe.' using errcode = 'invalid_parameter_value';
  end if;
  if v_viejo.eliminado then
    raise exception 'Ese gasto esta anulado: no se puede editar.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- PRIMERO SE CREA EL NUEVO. Si el nuevo no se puede —no hay caja abierta
  -- para su efectivo, por ejemplo— la transaccion entera se cae y el viejo
  -- sigue vivo. Al reves, un fallo dejaria el gasto anulado y nada en su
  -- lugar: dinero que desaparece de los reportes sin que nadie lo pida.
  v_nuevo := public.registrar_gasto(
    v_viejo.negocio_id, p_descripcion, p_monto, p_metodo, p_fecha, p_categoria, p_proveedor,
    p_detalle, p_referencia, p_notas, p_efectivo, p_metodo_resto,
    v_viejo.recurrente_id, v_viejo.periodo, p_gasto
  );

  update gasto
     set eliminado = true,
         anulado_motivo = 'Corregido',
         anulado_por = auth.uid(),
         anulado_en = now(),
         actualizado_en = now()
   where id = p_gasto;

  perform app.anotar_gasto(v_viejo.negocio_id, 'editar', v_nuevo::text,
    jsonb_build_object('gasto', p_gasto, 'concepto', v_viejo.descripcion,
                       'monto', v_viejo.monto_centavos, 'metodo', v_viejo.metodo,
                       'efectivo', v_viejo.efectivo_centavos),
    jsonb_build_object('gasto', v_nuevo, 'concepto', p_descripcion,
                       'monto', p_monto, 'metodo', p_metodo));

  return v_nuevo;
end;
$$;

comment on function public.editar_gasto is
  'Editar ANULA y ENCADENA, no pisa. El indice unico de movimiento_caja solo deja un egreso por '
  'gasto, y la caja es un libro que se escribe y no se corrige. El neto queda igual y el '
  'historial entero. Se crea el nuevo ANTES de anular el viejo: si el nuevo falla, no queda un '
  'hueco donde habia un gasto.';

-- ---------------------------------------------------------------------
-- 8. ANULAR UN GASTO
-- ---------------------------------------------------------------------
create or replace function public.anular_gasto(p_gasto uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_g gasto%rowtype;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Anular un gasto necesita un motivo.' using errcode = 'invalid_parameter_value';
  end if;

  -- El `and not eliminado` no es cortesia: sin el, anular dos veces intentaria
  -- meter dos ingresos por el mismo gasto. El indice unico lo rechazaria, pero
  -- con un error que no dice nada.
  update gasto
     set eliminado = true,
         anulado_motivo = trim(p_motivo),
         anulado_por = auth.uid(),
         anulado_en = now(),
         actualizado_en = now()
   where id = p_gasto and not eliminado;

  if not found then
    raise exception 'Ese gasto no existe o ya estaba anulado.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_g from gasto where id = p_gasto;
  perform app.anotar_gasto(v_g.negocio_id, 'anular', p_gasto::text,
    jsonb_build_object('concepto', v_g.descripcion, 'monto', v_g.monto_centavos,
                       'metodo', v_g.metodo, 'efectivo', v_g.efectivo_centavos),
    jsonb_build_object('motivo', trim(p_motivo)));
end;
$$;

-- ---------------------------------------------------------------------
-- 9. GUARDAR Y MOVER UNA PLANTILLA RECURRENTE
-- ---------------------------------------------------------------------
create or replace function public.guardar_gasto_recurrente(
  p_negocio       text,
  p_id            uuid,
  p_descripcion   text,
  p_monto         bigint,
  p_metodo        text,
  p_frecuencia    text,
  p_fecha_inicio  date,
  p_categoria     uuid default null,
  p_proveedor     uuid default null,
  p_detalle       text default null,
  p_notas         text default null,
  p_efectivo      bigint default null,
  p_metodo_resto  text default null,
  p_fecha_fin     date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_efectivo bigint;
  v_id       uuid;
begin
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'El gasto recurrente necesita un concepto.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'invalid_parameter_value';
  end if;

  if p_metodo = 'efectivo' then
    v_efectivo := p_monto;
  elsif p_metodo = 'mixto' then
    v_efectivo := coalesce(p_efectivo, 0);
    if v_efectivo <= 0 or v_efectivo >= p_monto then
      raise exception 'En un gasto mixto la parte en efectivo tiene que ser mayor que cero y menor que el total.'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    v_efectivo := 0;
  end if;

  if p_id is null then
    insert into gasto_recurrente (negocio_id, descripcion, detalle, categoria_id, proveedor_id,
                                  monto_centavos, metodo, efectivo_centavos, metodo_resto,
                                  frecuencia, fecha_inicio, proxima_fecha, fecha_fin, notas, creado_por)
    values (p_negocio, trim(p_descripcion), nullif(trim(coalesce(p_detalle, '')), ''),
            p_categoria, p_proveedor, p_monto, p_metodo, v_efectivo,
            case when p_metodo = 'mixto' then p_metodo_resto end,
            p_frecuencia, p_fecha_inicio,
            -- LA PRIMERA VEZ TOCA EL DIA DE INICIO, aunque ya haya pasado: una
            -- renta que empezo el 1 y se captura el 3 tiene que generar la de
            -- este mes, no esperarse al siguiente.
            p_fecha_inicio,
            p_fecha_fin, nullif(trim(coalesce(p_notas, '')), ''), auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  update gasto_recurrente
     set descripcion = trim(p_descripcion),
         detalle = nullif(trim(coalesce(p_detalle, '')), ''),
         categoria_id = p_categoria,
         proveedor_id = p_proveedor,
         monto_centavos = p_monto,
         metodo = p_metodo,
         efectivo_centavos = v_efectivo,
         metodo_resto = case when p_metodo = 'mixto' then p_metodo_resto end,
         frecuencia = p_frecuencia,
         fecha_inicio = p_fecha_inicio,
         fecha_fin = p_fecha_fin,
         notas = nullif(trim(coalesce(p_notas, '')), ''),
         actualizado_en = now()
   where id = p_id and negocio_id = p_negocio and not eliminado;

  if not found then
    raise exception 'Ese gasto recurrente no existe.' using errcode = 'invalid_parameter_value';
  end if;
  return p_id;
end;
$$;

create or replace function public.marcar_gasto_recurrente(p_id uuid, p_estado text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_negocio text;
begin
  if p_estado not in ('activo', 'pausado', 'finalizado') then
    raise exception 'Estado desconocido: %', p_estado using errcode = 'invalid_parameter_value';
  end if;
  update gasto_recurrente
     set estado = p_estado, actualizado_en = now()
   where id = p_id and not eliminado
  returning negocio_id into v_negocio;
  if not found then
    raise exception 'Ese gasto recurrente no existe.' using errcode = 'invalid_parameter_value';
  end if;
  perform app.anotar_gasto(v_negocio, 'recurrente:' || p_estado, p_id::text, null,
    jsonb_build_object('estado', p_estado));
end;
$$;

-- ---------------------------------------------------------------------
-- 10. EL PERIODO DE UN RECURRENTE, Y CUANDO LE TOCA OTRA VEZ
-- ---------------------------------------------------------------------
--
-- El periodo es la ETIQUETA que hace unica cada instancia: '2026-08' para un
-- mensual, '2026-W32' para un semanal. Es lo que el indice unico compara, asi
-- que dos generaciones del mismo mes chocan y la segunda se descarta sola.
create or replace function app.periodo_del_recurrente(p_frecuencia text, p_fecha date)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_frecuencia
    when 'diario'     then to_char(p_fecha, 'YYYY-MM-DD')
    when 'semanal'    then to_char(p_fecha, 'IYYY-"W"IW')
    -- La quincena: dos por mes, y el dia 15 parte. Sin esto, las dos del mismo
    -- mes compartirian etiqueta y la segunda no se generaria nunca.
    when 'quincenal'  then to_char(p_fecha, 'YYYY-MM') || case when extract(day from p_fecha) <= 15
                                                              then '-A' else '-B' end
    when 'mensual'    then to_char(p_fecha, 'YYYY-MM')
    when 'bimestral'  then to_char(p_fecha, 'YYYY') || '-B' || ceil(extract(month from p_fecha) / 2.0)::text
    when 'trimestral' then to_char(p_fecha, 'YYYY') || '-T' || ceil(extract(month from p_fecha) / 3.0)::text
    when 'semestral'  then to_char(p_fecha, 'YYYY') || '-S' || ceil(extract(month from p_fecha) / 6.0)::text
    when 'anual'      then to_char(p_fecha, 'YYYY')
  end;
$$;

create or replace function app.siguiente_fecha_recurrente(p_frecuencia text, p_fecha date)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_frecuencia
    when 'diario'     then p_fecha + interval '1 day'
    when 'semanal'    then p_fecha + interval '1 week'
    when 'quincenal'  then p_fecha + interval '15 days'
    when 'mensual'    then p_fecha + interval '1 month'
    when 'bimestral'  then p_fecha + interval '2 months'
    when 'trimestral' then p_fecha + interval '3 months'
    when 'semestral'  then p_fecha + interval '6 months'
    when 'anual'      then p_fecha + interval '1 year'
  end::date;
$$;

-- ---------------------------------------------------------------------
-- 11. GENERAR LOS GASTOS QUE YA TOCAN
-- ---------------------------------------------------------------------
--
-- SE PUEDE LLAMAR CUANTAS VECES SE QUIERA. La idempotencia no la pone esta
-- funcion: la pone el indice unico (recurrente_id, periodo). Aqui solo se
-- captura la colision y se sigue. Por eso da igual si la llama la pantalla al
-- abrir Gastos, un cron de la base, o las dos a la vez.
create or replace function public.generar_gastos_recurrentes(p_negocio text)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r        record;
  v_fecha  date;
  v_periodo text;
  v_creados integer := 0;
  v_vueltas integer;
begin
  for r in
    select * from gasto_recurrente
     where negocio_id = p_negocio and estado = 'activo' and not eliminado
       and proxima_fecha <= current_date
     order by proxima_fecha
  loop
    v_fecha := r.proxima_fecha;
    v_vueltas := 0;

    -- UNA PLANTILLA PUEDE DEBER VARIAS. Si nadie abrio el sistema en tres
    -- meses, la renta debe tres. Se generan todas, cada una con su fecha real
    -- —no tres con la de hoy, que descuadraria los reportes de esos meses.
    --
    -- El tope de vueltas es un seguro contra una plantilla con fecha de inicio
    -- absurda: mil dias no bloquean la pantalla mientras alguien mira.
    while v_fecha <= current_date and (r.fecha_fin is null or v_fecha <= r.fecha_fin)
          and v_vueltas < 400 loop
      v_periodo := app.periodo_del_recurrente(r.frecuencia, v_fecha);
      begin
        insert into gasto (negocio_id, descripcion, detalle, categoria_id, proveedor_id,
                           monto_centavos, metodo, efectivo_centavos, metodo_resto,
                           fecha, notas, recurrente_id, periodo, creado_por)
        values (r.negocio_id, r.descripcion, r.detalle, r.categoria_id, r.proveedor_id,
                r.monto_centavos, r.metodo, r.efectivo_centavos, r.metodo_resto,
                v_fecha, r.notas, r.id, v_periodo, r.creado_por);
        v_creados := v_creados + 1;
      exception
        -- YA ESTABA. Es el caso normal cuando dos procesos corren a la vez, no
        -- un error: se sigue con el siguiente periodo.
        when unique_violation then null;
        -- SIN CAJA ABIERTA no se puede pagar en efectivo, y el disparador lo
        -- rechaza. No es motivo para abortar la generacion entera ni para
        -- mover la proxima fecha: se deja para cuando abran caja.
        when invalid_parameter_value then exit;
      end;
      v_fecha := app.siguiente_fecha_recurrente(r.frecuencia, v_fecha);
      v_vueltas := v_vueltas + 1;
    end loop;

    update gasto_recurrente
       set proxima_fecha = v_fecha,
           estado = case when fecha_fin is not null and v_fecha > fecha_fin
                         then 'finalizado' else estado end,
           actualizado_en = now()
     where id = r.id;
  end loop;

  return v_creados;
end;
$$;

comment on function public.generar_gastos_recurrentes is
  'Idempotente A PROPOSITO: la unicidad la pone el indice (recurrente_id, periodo), no esta '
  'funcion. Dos ejecuciones simultaneas no pueden crear dos gastos del mismo mes. Por eso se '
  'puede llamar desde la pantalla sin miedo, y tambien desde un cron de la base.';

-- ---------------------------------------------------------------------
-- 12. LOS GASTOS DE UN RANGO, YA CON SUS NOMBRES RESUELTOS
-- ---------------------------------------------------------------------
--
-- Los nombres de la categoria, el proveedor y quien lo capturo se RESUELVEN
-- aqui, no se copian en la tabla. El dia que cambie el nombre de un proveedor,
-- los gastos viejos lo dicen al dia sin tocar nada.
create or replace function public.gastos_del_rango(
  p_negocio  text,
  p_desde    date,
  p_hasta    date,
  p_incluir_anulados boolean default false
)
returns table (
  id uuid, fecha date, descripcion text, detalle text,
  monto_centavos bigint, metodo text, efectivo_centavos bigint, metodo_resto text,
  categoria_id uuid, categoria text, categoria_color text, categoria_icono text,
  proveedor_id uuid, proveedor text,
  referencia text, notas text,
  recurrente_id uuid, frecuencia text,
  creado_por uuid, usuario text, creado_en timestamptz, actualizado_en timestamptz,
  eliminado boolean, anulado_motivo text, anulado_en timestamptz, sustituye_a uuid
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select g.id, g.fecha, g.descripcion, g.detalle,
         g.monto_centavos, g.metodo, g.efectivo_centavos, g.metodo_resto,
         g.categoria_id, coalesce(c.nombre, nullif(g.categoria, 'general')), c.color, c.icono,
         g.proveedor_id, p.nombre,
         g.referencia, g.notas,
         g.recurrente_id, gr.frecuencia,
         g.creado_por, m.nombre, g.creado_en, g.actualizado_en,
         g.eliminado, g.anulado_motivo, g.anulado_en, g.sustituye_a
    from gasto g
    left join categoria c on c.id = g.categoria_id and c.negocio_id = g.negocio_id
    left join proveedor p on p.id = g.proveedor_id and p.negocio_id = g.negocio_id
    left join gasto_recurrente gr on gr.id = g.recurrente_id and gr.negocio_id = g.negocio_id
    left join membresia m on m.usuario_id = g.creado_por and m.negocio_id = g.negocio_id
   where g.negocio_id = p_negocio
     and g.fecha between p_desde and p_hasta
     and (p_incluir_anulados or not g.eliminado)
   order by g.fecha desc, g.creado_en desc;
$$;

-- ---------------------------------------------------------------------
-- 13. EL RESUMEN DEL PERIODO
-- ---------------------------------------------------------------------
--
-- SE SUMA EN EL SERVIDOR. Bajar el año entero al navegador para sumarlo alli
-- son varios segundos cada vez que alguien abre Gastos, y a los dos años de
-- operacion es insoportable.
--
-- La comparacion contra el periodo anterior toma un rango del MISMO LARGO
-- pegado por detras: del 1 al 10 de agosto se compara contra el 22 al 31 de
-- julio, que son diez dias igual. Comparar diez dias contra un mes entero da
-- un porcentaje que no significa nada.
create or replace function public.resumen_de_gastos(
  p_negocio text,
  p_desde   date,
  p_hasta   date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with dias as (
    select greatest((p_hasta - p_desde) + 1, 1) as n
  ),
  actual as (
    select * from gasto
     where negocio_id = p_negocio and not eliminado and fecha between p_desde and p_hasta
  ),
  anterior as (
    select * from gasto
     where negocio_id = p_negocio and not eliminado
       and fecha between p_desde - (select n from dias) and p_desde - 1
  ),
  mayor as (
    select descripcion, monto_centavos from actual order by monto_centavos desc, creado_en limit 1
  )
  select jsonb_build_object(
    'totalCentavos', coalesce((select sum(monto_centavos) from actual), 0),
    'cuantos', (select count(*) from actual),
    'dias', (select n from dias),
    -- El promedio se saca entre los DIAS del periodo, no entre los gastos: es
    -- "cuanto sale al dia", que es la pregunta que se hace quien lo mira.
    'promedioDiarioCentavos',
      coalesce((select sum(monto_centavos) from actual), 0) / (select n from dias),
    'mayor', case when exists (select 1 from mayor)
      then (select jsonb_build_object('descripcion', descripcion, 'centavos', monto_centavos) from mayor)
      end,
    'anteriorCentavos', coalesce((select sum(monto_centavos) from anterior), 0),
    -- SIN PERIODO ANTERIOR NO HAY PORCENTAJE. Dividir entre cero no da cero:
    -- no da nada, y "+∞%" o "+5000%" es el numero que mas veces se ve mal
    -- hecho en un tablero.
    'hayComparacion', (select count(*) from anterior) > 0,
    'porCategoria', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.categoria_id, 'nombre', t.nombre, 'color', t.color,
        'centavos', t.centavos, 'cuantos', t.n
      ) order by t.centavos desc)
      from (
        select a.categoria_id, coalesce(c.nombre, 'Sin categoría') as nombre, c.color,
               sum(a.monto_centavos) as centavos, count(*) as n
          from actual a
          left join categoria c on c.id = a.categoria_id and c.negocio_id = p_negocio
         group by a.categoria_id, c.nombre, c.color
      ) t
    ), '[]'::jsonb),
    'porMetodo', coalesce((
      select jsonb_agg(jsonb_build_object(
        'metodo', t.metodo, 'centavos', t.centavos, 'cuantos', t.n
      ) order by t.centavos desc)
      from (
        select metodo, sum(monto_centavos) as centavos, count(*) as n
          from actual group by metodo
      ) t
    ), '[]'::jsonb),
    'porDia', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', t.d, 'centavos', t.centavos) order by t.d)
      from (
        -- LOS DIAS SIN GASTOS VAN EN CERO, no ausentes: un hueco en la grafica
        -- se lee como una caida en vez de como un dia tranquilo.
        select s.d::date as d, coalesce(sum(a.monto_centavos), 0) as centavos
          from generate_series(p_desde, p_hasta, interval '1 day') s(d)
          left join actual a on a.fecha = s.d::date
         group by s.d
      ) t
    ), '[]'::jsonb),
    'efectivoCentavos', coalesce((select sum(efectivo_centavos) from actual), 0)
  );
$$;

comment on function public.resumen_de_gastos is
  'Todo el tablero de Gastos en UN viaje. La comparacion contra el periodo anterior toma un rango '
  'del mismo largo pegado por detras; sin datos antes, avisa que no hay comparacion en vez de '
  'inventar un porcentaje contra cero.';

-- ---------------------------------------------------------------------
-- 14. LOS RECURRENTES DEL CENTRO
-- ---------------------------------------------------------------------
create or replace function public.gastos_recurrentes_del_centro(p_negocio text)
returns table (
  id uuid, descripcion text, detalle text,
  monto_centavos bigint, metodo text, efectivo_centavos bigint, metodo_resto text,
  categoria_id uuid, categoria text, categoria_color text,
  proveedor_id uuid, proveedor text,
  frecuencia text, fecha_inicio date, proxima_fecha date, fecha_fin date,
  estado text, notas text, generados bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.id, r.descripcion, r.detalle,
         r.monto_centavos, r.metodo, r.efectivo_centavos, r.metodo_resto,
         r.categoria_id, c.nombre, c.color,
         r.proveedor_id, p.nombre,
         r.frecuencia, r.fecha_inicio, r.proxima_fecha, r.fecha_fin,
         r.estado, r.notas,
         (select count(*) from gasto g where g.recurrente_id = r.id and not g.eliminado)
    from gasto_recurrente r
    left join categoria c on c.id = r.categoria_id and c.negocio_id = r.negocio_id
    left join proveedor p on p.id = r.proveedor_id and p.negocio_id = r.negocio_id
   where r.negocio_id = p_negocio and not r.eliminado
   order by case r.estado when 'activo' then 0 when 'pausado' then 1 else 2 end,
            r.proxima_fecha;
$$;

-- ---------------------------------------------------------------------
-- 15. UNA CATEGORIA CON GASTOS NO SE BORRA
-- ---------------------------------------------------------------------
--
-- Borrarla dejaria los gastos historicos sin decir de que eran, y un reporte
-- del año pasado con la mitad de las lineas en "Sin categoria" no sirve para
-- nada. Se desactiva: deja de ofrecerse al capturar y los viejos la conservan.
create or replace function public.gastos_de_la_categoria(p_categoria uuid)
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*) from gasto where categoria_id = p_categoria and not eliminado;
$$;

-- =====================================================================
-- REPORTES — la capa de analisis
-- =====================================================================
--
-- REPORTES NO ES DUEÑO DE NI UN DATO, y esa es toda su arquitectura. No hay
-- tabla de reportes, no hay copia de las ventas, no hay totales guardados. Todo
-- se cuenta EN EL MOMENTO desde las tablas de cada modulo: venta, venta_item,
-- pago, gasto, movimiento_caja, cliente, cita, producto, curso e inscripcion.
--
-- POR QUE ASI Y NO CON TOTALES GUARDADOS: un total guardado se desincroniza a
-- la primera venta cancelada, y a partir de ahi hay dos numeros verdaderos y
-- nadie sabe cual creer. Es el mismo error que este proyecto ya evito en el
-- expediente del cliente y en las cifras de Inicio.
--
-- TODO SE CALCULA EN EL SERVIDOR, en una sola llamada. Bajar mil ventas al
-- navegador para sumarlas seria lento hoy e imposible en dos años — y ademas
-- dejaria el calculo del lado donde se puede manipular.
--
-- UNA SOLA LLAMADA PARA TODO EL REPORTE, y no una por pestaña. Es lo que
-- garantiza que las ocho pestañas hablen del MISMO periodo y de los MISMOS
-- filtros: con una consulta por pestaña, basta que una se quede con el periodo
-- viejo para que la pantalla se contradiga a si misma sin avisar.
--
-- `security invoker` NO ES UN DETALLE: hace que las reglas de acceso por fila se
-- apliquen con los permisos de QUIEN LLAMA. De ahi salen gratis dos cosas que el
-- encargo pedia: un centro jamas ve los datos de otro, y quien no tiene
-- `verFinanzas` no obtiene cifras de dinero aunque llame a la funcion a mano
-- desde la consola.

-- ---------------------------------------------------------------------
-- COMO SE AGRUPA LA SERIE DEL TIEMPO
-- ---------------------------------------------------------------------
-- Un rango de un año agrupado por dia son trescientos sesenta y cinco puntos:
-- ilegible. Uno de una semana agrupado por mes es un solo punto: inutil. Se
-- decide por el largo del rango y se DICE en la respuesta, para que la grafica
-- pueda rotular el eje como corresponde.
create or replace function app.paso_de_la_serie(p_desde date, p_hasta date)
returns text
language sql
immutable
as $$
  select case when (p_hasta - p_desde) > 92 then 'mes' else 'dia' end;
$$;

-- ---------------------------------------------------------------------
-- EL REPORTE DEL PERIODO
-- ---------------------------------------------------------------------
--
-- LOS FILTROS SE COMBINAN Y TODOS SON OPCIONALES. `null` significa "sin
-- filtrar", no "ninguno": un filtro que al quedarse vacio devuelve cero seria
-- indistinguible de un periodo sin ventas.
--
--   p_tipo      servicio | producto | curso — de que se compone el ingreso
--   p_metodo    efectivo | tarjeta | transferencia | otro
--   p_vendedor  quien cobro la venta
--
create or replace function public.reporte_del_periodo(
  p_negocio  text,
  p_desde    date,
  p_hasta    date,
  p_tipo     text default null,
  p_metodo   text default null,
  p_vendedor uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with
  -- El periodo anterior COMPARABLE: mismo numero de dias, pegado hacia atras.
  -- Comparar un mes contra una semana daria una caida del 75% que no existe.
  rango as (
    select p_desde as desde, p_hasta as hasta,
           (p_hasta - p_desde + 1) as dias,
           (p_desde - (p_hasta - p_desde + 1))::date as desde_ant,
           (p_desde - 1)::date as hasta_ant,
           app.paso_de_la_serie(p_desde, p_hasta) as paso
  ),

  -- --- LAS VENTAS QUE CUENTAN --------------------------------------
  -- Solo las COBRADAS. Un borrador no es dinero y una cancelada dejo de serlo;
  -- las dos se conservan en su tabla, pero no suman aqui.
  v as (
    select ve.* from venta ve, rango r
    where ve.negocio_id = p_negocio and not ve.eliminado
      and ve.estado = 'cobrada'
      and ve.fecha between r.desde and r.hasta
      and (p_vendedor is null or ve.creada_por = p_vendedor)
      and (p_metodo is null or exists (
            select 1 from pago pg where pg.venta_id = ve.id and pg.metodo = p_metodo))
  ),
  v_ant as (
    select ve.* from venta ve, rango r
    where ve.negocio_id = p_negocio and not ve.eliminado
      and ve.estado = 'cobrada'
      and ve.fecha between r.desde_ant and r.hasta_ant
      and (p_vendedor is null or ve.creada_por = p_vendedor)
      and (p_metodo is null or exists (
            select 1 from pago pg where pg.venta_id = ve.id and pg.metodo = p_metodo))
  ),
  it as (
    select vi.* from venta_item vi join v on v.id = vi.venta_id
    where p_tipo is null or vi.tipo = p_tipo
  ),
  it_ant as (
    select vi.* from venta_item vi join v_ant on v_ant.id = vi.venta_id
    where p_tipo is null or vi.tipo = p_tipo
  ),

  -- CON FILTRO DE TIPO, EL INGRESO ES EL DE ESOS RENGLONES; sin filtro, es el
  -- total de la venta. No es lo mismo: el total lleva el descuento general, que
  -- no pertenece a ningun renglon. Sumar renglones siempre daria de mas.
  ingresos as (
    select case when p_tipo is null
                then (select coalesce(sum(total_centavos), 0) from v)
                else (select coalesce(sum(subtotal_centavos), 0) from it) end as monto,
           case when p_tipo is null
                then (select coalesce(sum(total_centavos), 0) from v_ant)
                else (select coalesce(sum(subtotal_centavos), 0) from it_ant) end as antes
  ),

  -- --- LOS GASTOS DEL PERIODO --------------------------------------
  g as (
    select ga.* from gasto ga, rango r
    where ga.negocio_id = p_negocio and not ga.eliminado
      and ga.fecha between r.desde and r.hasta
  ),

  -- --- LAS CITAS COMPLETADAS ---------------------------------------
  -- "Servicios realizados" sale de AGENDA, no de las ventas: una sesion se da
  -- aunque se haya cobrado otro dia, y un paquete se cobra una vez y se da en
  -- cuatro sesiones. Contarlo desde la venta diria cuatro veces menos.
  ct as (
    select ci.* from cita ci, rango r
    where ci.negocio_id = p_negocio and not ci.eliminado
      and ci.estado = 'completada'
      and ci.fecha between r.desde and r.hasta
  ),
  ct_ant as (
    select ci.* from cita ci, rango r
    where ci.negocio_id = p_negocio and not ci.eliminado
      and ci.estado = 'completada'
      and ci.fecha between r.desde_ant and r.hasta_ant
  ),

  -- Quien fue atendido: quien tuvo cita completada O compro. Sin unir las dos,
  -- una venta de mostrador a alguien identificado no contaria como atencion.
  atendidos as (
    select count(*)::int as n from (
      select cliente_id from ct where cliente_id is not null
      union
      select cliente_id from v where cliente_id is not null
    ) x
  ),
  atendidos_ant as (
    select count(*)::int as n from (
      select cliente_id from ct_ant where cliente_id is not null
      union
      select cliente_id from v_ant where cliente_id is not null
    ) x
  ),

  -- ¿HAY CON QUE COMPARAR? Si el centro no existia antes del periodo, no se
  -- inventa un "+100%": se dice que no hay comparacion. Un porcentaje contra la
  -- nada es el numero mas facil de creerse y el mas falso.
  hubo_antes as (
    select exists (
      select 1 from venta ve, rango r
      where ve.negocio_id = p_negocio and not ve.eliminado and ve.estado = 'cobrada'
        and ve.fecha between r.desde_ant and r.hasta_ant
    ) or exists (
      select 1 from gasto ga, rango r
      where ga.negocio_id = p_negocio and not ga.eliminado
        and ga.fecha between r.desde_ant and r.hasta_ant
    ) as hay
  ),

  -- --- LA SERIE DE INGRESOS CONTRA EGRESOS -------------------------
  -- Se genera el eje COMPLETO del periodo y se pegan los importes encima. Sin
  -- generarlo, un dia sin ventas simplemente no existiria y la linea saltaria
  -- de martes a jueves como si el miercoles no hubiera pasado.
  eje as (
    select case when r.paso = 'mes'
                then date_trunc('month', d)::date
                else d::date end as punto
    from rango r, generate_series(r.desde, r.hasta, interval '1 day') d
    group by 1
  ),
  serie as (
    select e.punto,
           coalesce((select sum(x.total_centavos) from v x, rango r
                      where case when r.paso = 'mes'
                                 then date_trunc('month', x.fecha)::date else x.fecha end = e.punto), 0) as ingresos,
           coalesce((select sum(y.monto_centavos) from g y, rango r
                      where case when r.paso = 'mes'
                                 then date_trunc('month', y.fecha)::date else y.fecha end = e.punto), 0) as egresos
    from eje e
  )

  select jsonb_build_object(
    'periodo', (select jsonb_build_object(
        'desde', r.desde, 'hasta', r.hasta, 'dias', r.dias,
        'desdeAnterior', r.desde_ant, 'hastaAnterior', r.hasta_ant,
        'paso', r.paso) from rango r),

    'hayComparacion', (select hay from hubo_antes),

    'metricas', jsonb_build_object(
      'ingresos',       (select monto from ingresos),
      'ingresosAntes',  (select antes from ingresos),
      'ventas',         (select count(*)::int from v),
      'ventasAntes',    (select count(*)::int from v_ant),
      'clientes',       (select n from atendidos),
      'clientesAntes',  (select n from atendidos_ant),
      'servicios',      (select count(*)::int from ct),
      'serviciosAntes', (select count(*)::int from ct_ant)
    ),

    'finanzas', jsonb_build_object(
      'ingresos', (select monto from ingresos),
      'egresos',  (select coalesce(sum(monto_centavos), 0) from g),
      -- LA UTILIDAD SE DERIVA, no se guarda: ingresos menos egresos. Un tercer
      -- numero guardado aparte se desincroniza de los otros dos.
      'utilidad', (select monto from ingresos) - (select coalesce(sum(monto_centavos), 0) from g),
      -- El margen necesita ingresos: sin ellos es `null`, no cero por ciento.
      'margen', (select case when monto = 0 then null
                  else round(((monto - (select coalesce(sum(monto_centavos), 0) from g))::numeric
                              / monto) * 100, 1) end from ingresos),
      'promedioDiario', (select round((select monto from ingresos)::numeric / greatest(r.dias, 1))
                          from rango r),
      'clientesNuevos', (select count(*)::int from cliente c, rango r
                          where c.negocio_id = p_negocio and not c.eliminado
                            and c.creado_en::date between r.desde and r.hasta),
      'serviciosRealizados', (select count(*)::int from ct),
      'cursosVendidos', (select coalesce(sum(cantidad), 0)::int from it where tipo = 'curso')
    ),

    'serie', coalesce((select jsonb_agg(jsonb_build_object(
        'punto', s.punto, 'ingresos', s.ingresos, 'egresos', s.egresos) order by s.punto)
      from serie s), '[]'::jsonb),

    -- Las categorias del ingreso NO son un catalogo: son los tipos que de
    -- verdad se vendieron. Si no se vendio ni un curso, "Cursos" no aparece.
    'categorias', coalesce((select jsonb_agg(jsonb_build_object(
        'clave', x.tipo, 'monto', x.monto, 'cuantos', x.cuantos) order by x.monto desc)
      from (select tipo, sum(subtotal_centavos) as monto, sum(cantidad)::int as cuantos
              from it group by tipo) x), '[]'::jsonb),

    'ventas', jsonb_build_object(
      'cobradas',  (select count(*)::int from v),
      'canceladas', (select count(*)::int from venta ve, rango r
                      where ve.negocio_id = p_negocio and not ve.eliminado
                        and ve.estado = 'cancelada' and ve.fecha between r.desde and r.hasta),
      -- Sin ventas el ticket es `null`, no cero: no se divide entre cero y
      -- "$0 de ticket promedio" se leeria como que se vendio regalado.
      'ticket',  (select case when count(*) = 0 then null
                    else round(sum(total_centavos)::numeric / count(*)) end from v),
      'maxima',  (select max(total_centavos) from v),
      'minima',  (select min(total_centavos) from v),
      'porMetodo', coalesce((select jsonb_agg(jsonb_build_object(
          'metodo', x.metodo, 'monto', x.monto, 'operaciones', x.n) order by x.monto desc)
        from (select pg.metodo, sum(pg.monto_centavos) as monto, count(*)::int as n
                from pago pg join v on v.id = pg.venta_id
               group by pg.metodo) x), '[]'::jsonb)
    ),

    'servicios', jsonb_build_object(
      'realizados', (select count(*)::int from ct),
      'ingresos', (select coalesce(sum(subtotal_centavos), 0) from it where tipo = 'servicio'),
      'ranking', coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'nombre', x.nombre, 'cantidad', x.cantidad, 'ingresos', x.ingresos)
          order by x.cantidad desc, x.ingresos desc)
        from (select vi.servicio_id as id, s.nombre,
                     sum(vi.cantidad)::int as cantidad, sum(vi.subtotal_centavos) as ingresos
                from it vi join servicio s on s.id = vi.servicio_id
               where vi.tipo = 'servicio'
               group by vi.servicio_id, s.nombre
               -- SE ORDENA ANTES DE CORTAR. Con el "limit" solo, Postgres
               -- devuelve diez filas CUALESQUIERA y el orden de afuera las
               -- acomoda entre ellas: la tarjeta se titula "mas realizados" y
               -- enseña diez al azar. No falla, no avisa y no se nota.
               order by cantidad desc, ingresos desc
               limit 10) x), '[]'::jsonb)
    ),

    'clientes', jsonb_build_object(
      'totales', (select count(*)::int from cliente c
                   where c.negocio_id = p_negocio and not c.eliminado),
      -- NUEVO es quien se dio de alta en el periodo, no quien compro por
      -- primera vez: alguien de hace dos años que vuelve hoy no es nuevo.
      'nuevos', (select count(*)::int from cliente c, rango r
                  where c.negocio_id = p_negocio and not c.eliminado
                    and c.creado_en::date between r.desde and r.hasta),
      'atendidos', (select n from atendidos),
      'recurrentes', (select count(*)::int from (
          select cliente_id from ct where cliente_id is not null
          group by cliente_id having count(*) > 1) x),
      'ranking', coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'nombre', x.nombre, 'visitas', x.visitas,
          'compras', x.compras, 'gastado', x.gastado)
          order by x.gastado desc, x.visitas desc)
        from (
          select c.id, c.nombre,
                 (select count(*)::int from ct where ct.cliente_id = c.id) as visitas,
                 (select count(*)::int from v where v.cliente_id = c.id) as compras,
                 (select coalesce(sum(total_centavos), 0) from v where v.cliente_id = c.id) as gastado
            from cliente c
           where c.negocio_id = p_negocio and not c.eliminado
             and (exists (select 1 from ct where ct.cliente_id = c.id)
                  or exists (select 1 from v where v.cliente_id = c.id))
           order by gastado desc, visitas desc
           limit 10) x), '[]'::jsonb)
    ),

    'productos', jsonb_build_object(
      'unidades', (select coalesce(sum(cantidad), 0)::int from it where tipo = 'producto'),
      'ingresos', (select coalesce(sum(subtotal_centavos), 0) from it where tipo = 'producto'),
      -- El stock es de HOY, no del periodo: un inventario historico pediria
      -- reconstruirlo movimiento a movimiento y no es lo que se pregunta aqui.
      'bajos', (select count(*)::int from producto p
                 where p.negocio_id = p_negocio and not p.eliminado and p.activo
                   and app.estado_de_stock(p.stock_actual, p.stock_minimo) = 'bajo'),
      'agotados', (select count(*)::int from producto p
                    where p.negocio_id = p_negocio and not p.eliminado and p.activo
                      and app.estado_de_stock(p.stock_actual, p.stock_minimo) = 'agotado'),
      'ranking', coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'nombre', x.nombre, 'cantidad', x.cantidad, 'ingresos', x.ingresos)
          order by x.cantidad desc, x.ingresos desc)
        from (select vi.producto_id as id, p.nombre,
                     sum(vi.cantidad)::int as cantidad, sum(vi.subtotal_centavos) as ingresos
                from it vi join producto p on p.id = vi.producto_id
               where vi.tipo = 'producto'
               group by vi.producto_id, p.nombre
               order by cantidad desc, ingresos desc
               limit 10) x), '[]'::jsonb)
    ),

    'cursos', jsonb_build_object(
      'vendidos', (select coalesce(sum(cantidad), 0)::int from it where tipo = 'curso'),
      'ingresos', (select coalesce(sum(subtotal_centavos), 0) from it where tipo = 'curso'),
      'inscritos', (select count(*)::int from inscripcion i, rango r
                     where i.negocio_id = p_negocio and i.estado <> 'cancelado'
                       and i.creado_en::date between r.desde and r.hasta),
      'proximos', (select count(*)::int from curso cu, rango r
                    where cu.negocio_id = p_negocio and not cu.eliminado
                      and cu.estado = 'programado' and cu.fecha_inicio >= r.hasta),
      'terminados', (select count(*)::int from curso cu, rango r
                      where cu.negocio_id = p_negocio and not cu.eliminado
                        and cu.estado = 'terminado'
                        and coalesce(cu.fecha_fin, cu.fecha_inicio) between r.desde and r.hasta),
      'ranking', coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'nombre', x.nombre, 'cantidad', x.cantidad,
          'ingresos', x.ingresos, 'inscritos', x.inscritos, 'cupo', x.cupo)
          order by x.cantidad desc, x.ingresos desc)
        from (select vi.curso_id as id, cu.nombre, cu.cupo,
                     sum(vi.cantidad)::int as cantidad, sum(vi.subtotal_centavos) as ingresos,
                     (select count(*)::int from inscripcion i
                       where i.curso_id = cu.id and i.estado <> 'cancelado') as inscritos
                from it vi join curso cu on cu.id = vi.curso_id
               where vi.tipo = 'curso'
               -- "cu.id" VA EN EL AGRUPADO aunque parezca de sobra al lado de
               -- "vi.curso_id": la subconsulta de los inscritos lo usa, y sin
               -- el Postgres rechaza la funcion entera con "subquery uses
               -- ungrouped column". Es un error de EJECUCION, no de sintaxis:
               -- no lo caza crear la funcion, solo llamarla — que es por lo
               -- que salio al pegar el instalador y no antes.
               group by vi.curso_id, cu.id, cu.nombre, cu.cupo
               order by cantidad desc, ingresos desc
               limit 10) x), '[]'::jsonb)
    ),

    'gastos', jsonb_build_object(
      'total',   (select coalesce(sum(monto_centavos), 0) from g),
      'cuantos', (select count(*)::int from g),
      'promedio', (select case when count(*) = 0 then null
                    else round(sum(monto_centavos)::numeric / count(*)) end from g),
      'mayor', (select max(monto_centavos) from g),
      'menor', (select min(monto_centavos) from g),
      -- EL NOMBRE SE RESUELVE POR LA REFERENCIA, no por la columna vieja.
      -- `gasto.categoria` es texto y se quedo en 'general' para todo cuando
      -- Gastos paso a usar `categoria_id`: agrupar por ella habria pintado la
      -- pestaña entera con una sola barra llamada "general". Y resolverlo al
      -- leer —en vez de copiar el nombre— es lo que hace que renombrar una
      -- categoria se vea al dia en los reportes viejos.
      'categorias', coalesce((select jsonb_agg(jsonb_build_object(
          'categoria', x.categoria, 'monto', x.monto, 'cuantos', x.n) order by x.monto desc)
        from (select coalesce(c.nombre, nullif(gg.categoria, 'general'), 'Sin categoría') as categoria,
                     sum(gg.monto_centavos) as monto, count(*)::int as n
                from g gg
                left join categoria c
                       on c.id = gg.categoria_id and c.negocio_id = p_negocio
               group by 1) x), '[]'::jsonb)
    ),

    -- --- CAJA -------------------------------------------------------
    -- Salen de los movimientos REALES, no se reconstruyen. Un movimiento
    -- reconstruido a partir de las ventas se perderia los ingresos y retiros
    -- capturados a mano, que son justo los que descuadran un corte.
    'caja', jsonb_build_object(
      'ventas', (select coalesce(sum(mc.monto_centavos), 0) from movimiento_caja mc, rango r
                  where mc.negocio_id = p_negocio and mc.origen in ('venta', 'pago')
                    and mc.tipo = 'ingreso' and mc.fecha between r.desde and r.hasta),
      'ingresosManuales', (select coalesce(sum(mc.monto_centavos), 0) from movimiento_caja mc, rango r
                            where mc.negocio_id = p_negocio and mc.origen = 'ajuste'
                              and mc.tipo = 'ingreso' and mc.fecha between r.desde and r.hasta),
      'retiros', (select coalesce(sum(mc.monto_centavos), 0) from movimiento_caja mc, rango r
                   where mc.negocio_id = p_negocio and mc.origen = 'ajuste'
                     and mc.tipo = 'egreso' and mc.fecha between r.desde and r.hasta),
      'gastosDeCaja', (select coalesce(sum(mc.monto_centavos), 0) from movimiento_caja mc, rango r
                        where mc.negocio_id = p_negocio and mc.origen = 'gasto'
                          and mc.fecha between r.desde and r.hasta),
      'movimientos', (select count(*)::int from movimiento_caja mc, rango r
                       where mc.negocio_id = p_negocio and mc.fecha between r.desde and r.hasta),
      -- Los cortes YA FIRMADOS del periodo. No se recalculan: se leen tal cual
      -- se congelaron al cerrar, que es lo que los hace auditables.
      'cortes', coalesce((select jsonb_agg(jsonb_build_object(
          'id', s.id, 'nombre', s.nombre, 'cerradaEn', s.cerrada_en,
          'saldoInicial', s.saldo_inicial_centavos, 'esperado', s.esperado_centavos,
          'contado', s.contado_centavos, 'diferencia', s.diferencia_centavos)
          order by s.cerrada_en desc)
        from sesion_caja s, rango r
        where s.negocio_id = p_negocio and s.estado = 'cerrada'
          and s.cerrada_en::date between r.desde and r.hasta), '[]'::jsonb),
      'descuadre', (select coalesce(sum(s.diferencia_centavos), 0) from sesion_caja s, rango r
                     where s.negocio_id = p_negocio and s.estado = 'cerrada'
                       and s.cerrada_en::date between r.desde and r.hasta)
    )
  );
$$;

grant execute on function public.reporte_del_periodo(text, date, date, text, text, uuid) to authenticated;

comment on function public.reporte_del_periodo is
  'TODO el reporte en UNA llamada, contado en el momento desde las tablas de cada modulo. No hay '
  'tabla de reportes ni totales guardados: un total guardado se desincroniza a la primera venta '
  'cancelada. Una sola llamada garantiza que las ocho pestañas hablen del mismo periodo.';

-- =====================================================================
-- REPORTES GUARDADOS
-- =====================================================================
--
-- LO QUE SE GUARDA ES LA PREGUNTA, NO LA RESPUESTA. Un reporte guardado no
-- conserva cifras: conserva el periodo y los filtros con los que se hizo. Al
-- reabrirlo se vuelve a calcular.
--
-- Es a proposito y es lo unico correcto: si guardara las cifras, un reporte de
-- junio abierto en agosto seguiria enseñando lo que decia en junio aunque desde
-- entonces se hubiera cancelado una venta de ese mes. Diria un numero que ya no
-- es verdad, con fecha y firma.
create table if not exists reporte_guardado (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  nombre         text not null,
  -- Que pestaña se estaba viendo: resumen, ventas, servicios…
  tipo           text not null default 'resumen',
  desde          date not null,
  hasta          date not null,
  -- Los filtros tal cual, para poder reconstruir la pantalla exacta.
  filtros        jsonb not null default '{}'::jsonb,
  creado_por     uuid,
  creado_por_nombre text,
  creado_en      timestamptz not null default now(),
  eliminado      boolean not null default false
);

comment on table reporte_guardado is
  'Guarda la PREGUNTA (periodo y filtros), nunca la respuesta. Un reporte con cifras congeladas '
  'seguiria afirmando un total que dejo de ser verdad en cuanto se cancelara una venta de ese mes.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reporte_guardado_negocio_id_unico') then
    alter table reporte_guardado add constraint reporte_guardado_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

create index if not exists reporte_guardado_negocio_idx
  on reporte_guardado (negocio_id, creado_en desc) where not eliminado;

alter table reporte_guardado enable row level security;
alter table reporte_guardado force row level security;

drop policy if exists reporte_guardado_ver on reporte_guardado;
create policy reporte_guardado_ver on reporte_guardado
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists reporte_guardado_escribir on reporte_guardado;
create policy reporte_guardado_escribir on reporte_guardado
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists reporte_guardado_cambiar on reporte_guardado;
create policy reporte_guardado_cambiar on reporte_guardado
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

create or replace function public.guardar_reporte(
  p_negocio text,
  p_nombre  text,
  p_tipo    text,
  p_desde   date,
  p_hasta   date,
  p_filtros jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_quien membresia;
begin
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El reporte necesita un nombre para poder encontrarlo despues.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into reporte_guardado (negocio_id, nombre, tipo, desde, hasta, filtros,
                                creado_por, creado_por_nombre)
  values (p_negocio, btrim(p_nombre), coalesce(p_tipo, 'resumen'), p_desde, p_hasta,
          coalesce(p_filtros, '{}'::jsonb), auth.uid(), coalesce(v_quien.nombre, 'desconocido'))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.guardar_reporte(text, text, text, date, date, jsonb) to authenticated;

create or replace function public.reportes_guardados(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'nombre', r.nombre, 'tipo', r.tipo,
      'desde', r.desde, 'hasta', r.hasta, 'filtros', r.filtros,
      'creadoEn', r.creado_en, 'creadoPor', r.creado_por_nombre)
      order by r.creado_en desc), '[]'::jsonb)
  from reporte_guardado r
  where r.negocio_id = p_negocio and not r.eliminado;
$$;

grant execute on function public.reportes_guardados(text) to authenticated;

create or replace function public.borrar_reporte(p_reporte uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update reporte_guardado set eliminado = true where id = p_reporte;
$$;

grant execute on function public.borrar_reporte(uuid) to authenticated;

-- =====================================================================
-- MENSAJES — la capa de comunicacion con los clientes
-- =====================================================================
--
-- MENSAJES NO ES UNA SEGUNDA BASE DE DATOS DEL SISTEMA, y esa es toda su
-- arquitectura. No guarda el nombre del cliente, ni su telefono, ni su saldo,
-- ni la fecha de su cita: guarda `cliente_id` y lo demas se resuelve al leer.
-- El dia que alguien cambie de apellido, todas las conversaciones viejas lo
-- dicen al dia sin tocar nada — y no hay forma de que existan dos versiones de
-- la misma persona.
--
-- LAS CUATRO CAPAS, y por que estan separadas:
--
--   mensaje  ->  conversacion  ->  canal  ->  proveedor
--
-- El proveedor (WhatsApp, SMS, correo) es lo unico que cambia entre canales, y
-- vive FUERA de estas tablas. Si el modulo hablara de WhatsApp directamente,
-- agregar SMS obligaria a reescribirlo entero; asi, un canal nuevo es un
-- renglon en `canal_de_mensajes` y un adaptador nuevo del lado del servidor.
--
-- AQUI NO HAY NI UNA CREDENCIAL, Y ES A PROPOSITO. Estas tablas las lee el
-- navegador a traves de las reglas de fila: cualquier cosa guardada aqui es
-- cualquier cosa que se puede leer desde la consola del navegador. Los tokens
-- del proveedor van en las variables de entorno del servidor que los use, y
-- ese servidor todavia no existe — ver `canal_de_mensajes`.

-- ---------------------------------------------------------------------
-- 1. LAS ETIQUETAS SE SUMAN A LAS CATEGORIAS QUE YA HABIA
-- ---------------------------------------------------------------------
--
-- No se crea una tabla de etiquetas. `categoria` ya sirve a servicios, cursos,
-- productos y gastos con su `ambito`, ya tiene color, ya tiene su pantalla de
-- administracion y sus reglas de fila. Una tabla paralela seria el mismo
-- concepto con dos nombres, y el dia que se renombre una etiqueta habria que
-- acordarse de cual de las dos.
alter table categoria drop constraint if exists categoria_ambito_check;
alter table categoria add constraint categoria_ambito_check
  check (ambito in ('servicio', 'curso', 'producto', 'gasto', 'conversacion'));

-- ---------------------------------------------------------------------
-- 2. LOS CANALES
-- ---------------------------------------------------------------------
--
-- UN CANAL NO SE PUEDE DECLARAR "CONECTADO" DESDE EL NAVEGADOR. El estado
-- arranca en 'sin_conectar' y solo lo mueve quien de verdad hablo con el
-- proveedor, que es el servidor. Dejar que la pantalla lo pusiera en
-- 'conectado' seria pintar un candado cerrado en una puerta abierta: se
-- intentaria enviar, fallaria cada vez, y la culpa pareceria del mensaje.
--
-- `configuracion` guarda lo que NO es secreto: el numero visible, el nombre de
-- la cuenta, el identificador publico. Los tokens NO van aqui — ver la cabeza
-- de este bloque.
create table if not exists canal_de_mensajes (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  tipo           text not null check (tipo in ('whatsapp', 'sms', 'correo', 'manual')),
  nombre         text not null,
  -- El numero o la cuenta que ve el cliente. Nulo mientras no se conecte.
  identificador  text,
  estado         text not null default 'sin_conectar'
                 check (estado in ('sin_conectar', 'conectado', 'error')),
  detalle_error  text,
  ultima_sincronizacion timestamptz,
  configuracion  jsonb not null default '{}'::jsonb,
  activo         boolean not null default true,
  eliminado      boolean not null default false,
  creado_en      timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'canal_de_mensajes_negocio_id_unico') then
    alter table canal_de_mensajes add constraint canal_de_mensajes_negocio_id_unico
      unique (negocio_id, id);
  end if;
end $$;

create index if not exists canal_de_mensajes_negocio_idx
  on canal_de_mensajes (negocio_id) where not eliminado;

alter table canal_de_mensajes enable row level security;
alter table canal_de_mensajes force row level security;

drop policy if exists canal_de_mensajes_ver on canal_de_mensajes;
create policy canal_de_mensajes_ver on canal_de_mensajes
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists canal_de_mensajes_escribir on canal_de_mensajes;
create policy canal_de_mensajes_escribir on canal_de_mensajes
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists canal_de_mensajes_cambiar on canal_de_mensajes;
create policy canal_de_mensajes_cambiar on canal_de_mensajes
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

comment on table canal_de_mensajes is
  'Por donde se habla con el cliente. El estado solo lo mueve el servidor que de verdad hablo con el '
  'proveedor: declararse conectado desde el navegador haria fallar cada envio culpando al mensaje. '
  'NUNCA guardar tokens aqui — el navegador lee esta tabla.';

-- ---------------------------------------------------------------------
-- 3. LA CONVERSACION
-- ---------------------------------------------------------------------
--
-- `cliente_id` PUEDE SER NULO y es la decision que sostiene el modulo: llega un
-- mensaje de un numero que no esta en Clientes y hay que poder guardarlo. Lo
-- que NO se hace es inventar un cliente para tener a quien colgarlo — eso
-- llenaria el directorio de fantasmas con nombre de telefono. La conversacion
-- vive suelta hasta que alguien la identifica.
--
-- `contacto` es el identificador EN EL CANAL (el numero de WhatsApp, el correo).
-- Es lo unico que llega en un mensaje entrante, y es por lo que se busca al
-- cliente. No sustituye al telefono de la ficha: es por donde entro.
--
-- `atendida_en` es lo que deja marcar una conversacion como resuelta a mano.
-- Sin ella, "pendiente de respuesta" seria solo "el ultimo mensaje es del
-- cliente", y un "gracias!" al final de una conversacion cerrada la dejaria
-- pendiente para siempre.
create table if not exists conversacion (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  canal_id       uuid,
  cliente_id     uuid,
  contacto       text not null,
  estado         text not null default 'abierta'
                 check (estado in ('abierta', 'cerrada', 'archivada')),
  favorita       boolean not null default false,
  asignada_a     uuid,
  atendida_en    timestamptz,
  ultimo_en      timestamptz not null default now(),
  creado_en      timestamptz not null default now(),
  eliminado      boolean not null default false
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversacion_negocio_id_unico') then
    alter table conversacion add constraint conversacion_negocio_id_unico unique (negocio_id, id);
  end if;
  -- TODA RELACION VA POR LLAVE COMPUESTA. Una llave simple dejaria colgar una
  -- conversacion del cliente de otro centro: las llaves foraneas no obedecen
  -- las reglas de fila.
  if not exists (select 1 from pg_constraint where conname = 'conversacion_cliente_fk') then
    alter table conversacion add constraint conversacion_cliente_fk
      foreign key (negocio_id, cliente_id) references cliente (negocio_id, id)
      on delete set null (cliente_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversacion_canal_fk') then
    alter table conversacion add constraint conversacion_canal_fk
      foreign key (negocio_id, canal_id) references canal_de_mensajes (negocio_id, id)
      on delete set null (canal_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversacion_asignada_fk') then
    alter table conversacion add constraint conversacion_asignada_fk
      foreign key (negocio_id, asignada_a) references membresia (negocio_id, id)
      on delete set null (asignada_a);
  end if;
end $$;

-- UNA CONVERSACION POR CONTACTO Y CANAL. Es lo que impide que el mismo numero
-- abra un hilo nuevo cada vez que escribe: sin esto, el historial de alguien
-- quedaria repartido en veinte conversaciones de un mensaje.
create unique index if not exists conversacion_contacto_unica
  on conversacion (negocio_id, canal_id, lower(contacto)) where not eliminado;

create index if not exists conversacion_reciente_idx
  on conversacion (negocio_id, ultimo_en desc) where not eliminado;
create index if not exists conversacion_cliente_idx
  on conversacion (negocio_id, cliente_id) where not eliminado;

alter table conversacion enable row level security;
alter table conversacion force row level security;

drop policy if exists conversacion_ver on conversacion;
create policy conversacion_ver on conversacion
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists conversacion_escribir on conversacion;
create policy conversacion_escribir on conversacion
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists conversacion_cambiar on conversacion;
create policy conversacion_cambiar on conversacion
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

comment on table conversacion is
  'Un hilo con un contacto en un canal. NO guarda el nombre ni el telefono del cliente: guarda '
  'cliente_id y lo demas se resuelve al leer. cliente_id puede ser nulo — llega un mensaje de un '
  'numero desconocido y hay que guardarlo sin inventar una ficha.';

-- ---------------------------------------------------------------------
-- 4. EL MENSAJE
-- ---------------------------------------------------------------------
--
-- `estado` SOLO VALE PARA LO QUE SALE. Un mensaje entrante ya llego: no tiene
-- sentido decir que esta "entregado". Y de lo que sale, solo se guarda lo que
-- el proveedor de verdad confirma — inventar un "leido" que nadie reporto es
-- peor que no tenerlo, porque se toma por cierto.
--
-- `leido_en` es lo del NEGOCIO leyendo al cliente, no al reves. De ahi salen
-- los no leidos de la lista.
create table if not exists mensaje (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  conversacion_id uuid not null,
  direccion      text not null check (direccion in ('entrante', 'saliente')),
  cuerpo         text not null,
  -- 'pendiente' = guardado y todavia sin mandar a ningun proveedor. Es el
  -- estado en el que se queda todo mientras no haya un canal conectado, y se
  -- dice tal cual en la pantalla en vez de pintar una palomita falsa.
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'enviando', 'enviado', 'entregado', 'leido', 'fallido')),
  error          text,
  -- El id que le dio el proveedor, para poder casar sus avisos de estado.
  externo_id     text,
  adjunto_url    text,
  adjunto_tipo   text,
  enviado_por    uuid,
  difusion_id    uuid,
  leido_en       timestamptz,
  creado_en      timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mensaje_negocio_id_unico') then
    alter table mensaje add constraint mensaje_negocio_id_unico unique (negocio_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mensaje_conversacion_fk') then
    alter table mensaje add constraint mensaje_conversacion_fk
      foreign key (negocio_id, conversacion_id) references conversacion (negocio_id, id)
      on delete cascade;
  end if;
end $$;

create index if not exists mensaje_hilo_idx on mensaje (negocio_id, conversacion_id, creado_en desc);
create index if not exists mensaje_sin_leer_idx on mensaje (negocio_id, conversacion_id)
  where direccion = 'entrante' and leido_en is null;
-- El buscador de conversaciones mira dentro del texto.
create index if not exists mensaje_cuerpo_idx on mensaje using gin (to_tsvector('spanish', cuerpo));

alter table mensaje enable row level security;
alter table mensaje force row level security;

drop policy if exists mensaje_ver on mensaje;
create policy mensaje_ver on mensaje
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists mensaje_escribir on mensaje;
create policy mensaje_escribir on mensaje
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists mensaje_cambiar on mensaje;
create policy mensaje_cambiar on mensaje
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

comment on table mensaje is
  'Un mensaje de un hilo. El estado solo vale para lo saliente y solo se mueve con lo que el '
  'proveedor confirma: un "leido" inventado se toma por cierto y es peor que no tenerlo.';

-- ---------------------------------------------------------------------
-- 5. LAS ETIQUETAS DE UNA CONVERSACION
-- ---------------------------------------------------------------------
create table if not exists conversacion_etiqueta (
  negocio_id      text not null references negocio(id) on delete cascade,
  conversacion_id uuid not null,
  categoria_id    uuid not null,
  primary key (conversacion_id, categoria_id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversacion_etiqueta_conv_fk') then
    alter table conversacion_etiqueta add constraint conversacion_etiqueta_conv_fk
      foreign key (negocio_id, conversacion_id) references conversacion (negocio_id, id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversacion_etiqueta_cat_fk') then
    alter table conversacion_etiqueta add constraint conversacion_etiqueta_cat_fk
      foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
      on delete cascade;
  end if;
end $$;

alter table conversacion_etiqueta enable row level security;
alter table conversacion_etiqueta force row level security;

drop policy if exists conversacion_etiqueta_ver on conversacion_etiqueta;
create policy conversacion_etiqueta_ver on conversacion_etiqueta
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists conversacion_etiqueta_escribir on conversacion_etiqueta;
create policy conversacion_etiqueta_escribir on conversacion_etiqueta
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists conversacion_etiqueta_borrar on conversacion_etiqueta;
create policy conversacion_etiqueta_borrar on conversacion_etiqueta
  for delete using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

-- ---------------------------------------------------------------------
-- 6. LAS PLANTILLAS
-- ---------------------------------------------------------------------
--
-- Las variables van escritas en el cuerpo como {{cliente.nombre}} y se
-- rellenan AL USAR la plantilla, contra el cliente y la cita de verdad. Lo que
-- no se hace nunca es guardar el texto ya rellenado: eso seria una copia del
-- nombre de alguien que envejece sola.
create table if not exists plantilla_de_mensaje (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   text not null references negocio(id) on delete cascade,
  nombre       text not null,
  categoria    text not null default 'general',
  cuerpo       text not null,
  canal_tipo   text check (canal_tipo in ('whatsapp', 'sms', 'correo', 'manual')),
  activa       boolean not null default true,
  eliminado    boolean not null default false,
  creado_en    timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plantilla_de_mensaje_negocio_id_unico') then
    alter table plantilla_de_mensaje add constraint plantilla_de_mensaje_negocio_id_unico
      unique (negocio_id, id);
  end if;
end $$;

create index if not exists plantilla_de_mensaje_negocio_idx
  on plantilla_de_mensaje (negocio_id, nombre) where not eliminado;

alter table plantilla_de_mensaje enable row level security;
alter table plantilla_de_mensaje force row level security;

drop policy if exists plantilla_ver on plantilla_de_mensaje;
create policy plantilla_ver on plantilla_de_mensaje
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists plantilla_escribir on plantilla_de_mensaje;
create policy plantilla_escribir on plantilla_de_mensaje
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists plantilla_cambiar on plantilla_de_mensaje;
create policy plantilla_cambiar on plantilla_de_mensaje
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

-- ---------------------------------------------------------------------
-- 7. LAS AUTOMATIZACIONES
-- ---------------------------------------------------------------------
--
-- NACEN APAGADAS, SIEMPRE. `activa` es false por omision y no hay forma de
-- crear una encendida: mandar mensajes solo a los clientes de alguien sin que
-- esa persona lo haya pedido explicitamente es de las pocas cosas de este
-- sistema que no se pueden deshacer.
--
-- Y no corren solas todavia: hace falta un servidor que escuche los eventos.
-- Mientras tanto quedan declaradas, y la pantalla dice que estan a la espera
-- en vez de fingir que disparan.
create table if not exists automatizacion_de_mensajes (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   text not null references negocio(id) on delete cascade,
  evento       text not null check (evento in (
                 'cita_nueva', 'cita_confirmada', 'cita_cancelada', 'cita_reagendada',
                 'cita_recordatorio', 'inscripcion_nueva', 'pago_registrado',
                 'seguimiento', 'cliente_inactivo')),
  plantilla_id uuid,
  canal_id     uuid,
  activa       boolean not null default false,
  condiciones  jsonb not null default '{}'::jsonb,
  eliminado    boolean not null default false,
  creado_en    timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'automatizacion_negocio_id_unico') then
    alter table automatizacion_de_mensajes add constraint automatizacion_negocio_id_unico
      unique (negocio_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'automatizacion_plantilla_fk') then
    alter table automatizacion_de_mensajes add constraint automatizacion_plantilla_fk
      foreign key (negocio_id, plantilla_id) references plantilla_de_mensaje (negocio_id, id)
      on delete set null (plantilla_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'automatizacion_canal_fk') then
    alter table automatizacion_de_mensajes add constraint automatizacion_canal_fk
      foreign key (negocio_id, canal_id) references canal_de_mensajes (negocio_id, id)
      on delete set null (canal_id);
  end if;
end $$;

alter table automatizacion_de_mensajes enable row level security;
alter table automatizacion_de_mensajes force row level security;

drop policy if exists automatizacion_ver on automatizacion_de_mensajes;
create policy automatizacion_ver on automatizacion_de_mensajes
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists automatizacion_escribir on automatizacion_de_mensajes;
create policy automatizacion_escribir on automatizacion_de_mensajes
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists automatizacion_cambiar on automatizacion_de_mensajes;
create policy automatizacion_cambiar on automatizacion_de_mensajes
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

-- ---------------------------------------------------------------------
-- 8. LAS DIFUSIONES
-- ---------------------------------------------------------------------
--
-- Se guarda A QUIENES se mando y cuantos fallaron, no el texto repetido: cada
-- destinatario recibe un `mensaje` normal con su `difusion_id`, asi que la
-- difusion aparece en el hilo de cada persona como cualquier otro mensaje. Una
-- bandeja de difusiones aparte seria un segundo historial que se separa del
-- primero.
create table if not exists difusion (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   text not null references negocio(id) on delete cascade,
  nombre       text not null,
  cuerpo       text not null,
  canal_id     uuid,
  destinatarios int not null default 0,
  fallidos     int not null default 0,
  creado_por   uuid,
  creado_en    timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'difusion_negocio_id_unico') then
    alter table difusion add constraint difusion_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

alter table difusion enable row level security;
alter table difusion force row level security;

drop policy if exists difusion_ver on difusion;
create policy difusion_ver on difusion
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists difusion_escribir on difusion;
create policy difusion_escribir on difusion
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

-- ---------------------------------------------------------------------
-- 9. QUIEN ESTA PENDIENTE DE RESPUESTA
-- ---------------------------------------------------------------------
--
-- NO ES "EL ULTIMO MENSAJE ES DEL CLIENTE", y la diferencia importa: con esa
-- regla, un "gracias!" al final de una conversacion resuelta la deja pendiente
-- para siempre y la cifra de arriba deja de significar nada.
--
-- Es: hay algo del cliente DESPUES de lo ultimo que hicimos nosotros —
-- responder o marcarla atendida a mano.
create or replace function app.conversacion_pendiente(p_conversacion uuid, p_atendida timestamptz)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from mensaje m
     where m.conversacion_id = p_conversacion
       and m.direccion = 'entrante'
       and m.creado_en > greatest(
             coalesce(p_atendida, '-infinity'::timestamptz),
             coalesce((select max(s.creado_en) from mensaje s
                        where s.conversacion_id = p_conversacion
                          and s.direccion = 'saliente'
                          and s.estado <> 'fallido'), '-infinity'::timestamptz))
  );
$$;

-- ---------------------------------------------------------------------
-- 10. LA LISTA DE CONVERSACIONES
-- ---------------------------------------------------------------------
--
-- SE PAGINA EN EL SERVIDOR. Un centro con dos años de operacion tiene miles de
-- hilos; bajarlos todos para enseñar ocho es lento hoy e imposible despues.
--
-- El ultimo mensaje se resuelve al leer con un `lateral`, no se copia a la
-- conversacion: un texto copiado se queda viejo en cuanto se borre o se corrija
-- el mensaje, y nadie se entera.
create or replace function public.conversaciones_del_centro(
  p_negocio    text,
  p_bandeja    text default 'todas',
  p_busqueda   text default null,
  p_etiqueta   uuid default null,
  p_pagina     int default 1,
  p_por_pagina int default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select c.*,
      (select cl.nombre from cliente cl where cl.id = c.cliente_id) as cliente,
      (select ca.tipo from canal_de_mensajes ca where ca.id = c.canal_id) as canal_tipo,
      (select ca.nombre from canal_de_mensajes ca where ca.id = c.canal_id) as canal,
      (select m.nombre from membresia m where m.id = c.asignada_a) as asignada,
      (select count(*)::int from mensaje m
        where m.conversacion_id = c.id and m.direccion = 'entrante' and m.leido_en is null) as sin_leer,
      app.conversacion_pendiente(c.id, c.atendida_en) as pendiente,
      (select jsonb_build_object('cuerpo', m.cuerpo, 'direccion', m.direccion,
                                 'estado', m.estado, 'creadoEn', m.creado_en)
         from mensaje m where m.conversacion_id = c.id
        order by m.creado_en desc limit 1) as ultimo
    from conversacion c
    where c.negocio_id = p_negocio and not c.eliminado
      and (p_etiqueta is null or exists (
            select 1 from conversacion_etiqueta e
             where e.conversacion_id = c.id and e.categoria_id = p_etiqueta))
      -- SE BUSCA POR LAS CUATRO COSAS QUE ALGUIEN RECUERDA DE UN HILO: por
      -- quien es, por su contacto, por lo que se dijo, y por como se etiqueto.
      and (p_busqueda is null or (
            c.contacto ilike '%' || p_busqueda || '%'
         or exists (select 1 from cliente cl where cl.id = c.cliente_id
                     and (cl.nombre ilike '%' || p_busqueda || '%'
                       or coalesce(cl.telefono, '') ilike '%' || p_busqueda || '%'
                       or coalesce(cl.correo, '') ilike '%' || p_busqueda || '%'))
         or exists (select 1 from mensaje m where m.conversacion_id = c.id
                     and m.cuerpo ilike '%' || p_busqueda || '%')
         or exists (select 1 from conversacion_etiqueta e
                    join categoria ca on ca.id = e.categoria_id
                     where e.conversacion_id = c.id and ca.nombre ilike '%' || p_busqueda || '%')))
  ),
  -- LAS BANDEJAS SE FILTRAN DESPUES de calcular, no antes: "no leidos" y
  -- "pendientes" son cuentas de los mensajes, no columnas de la conversacion.
  filtrada as (
    select * from base b
     where case p_bandeja
             when 'no_leidas'  then b.sin_leer > 0 and b.estado <> 'archivada'
             when 'pendientes' then b.pendiente and b.estado <> 'archivada'
             when 'archivadas' then b.estado = 'archivada'
             -- "Todas" NO incluye las archivadas: archivar sirve justamente
             -- para sacarlas de la vista de todos los dias.
             else b.estado <> 'archivada'
           end
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    -- Los contadores de las cuatro pestañas salen de la MISMA consulta: pedirlos
    -- aparte deja que una diga 3 y la pestaña de al lado 4.
    'cuentas', jsonb_build_object(
      'todas',      (select count(*)::int from base where estado <> 'archivada'),
      'noLeidas',   (select count(*)::int from base where sin_leer > 0 and estado <> 'archivada'),
      'pendientes', (select count(*)::int from base where pendiente and estado <> 'archivada'),
      'archivadas', (select count(*)::int from base where estado = 'archivada')
    ),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'clienteId', f.cliente_id, 'cliente', f.cliente,
        'contacto', f.contacto, 'canalId', f.canal_id, 'canal', f.canal,
        'canalTipo', f.canal_tipo, 'estado', f.estado, 'favorita', f.favorita,
        'asignadaA', f.asignada_a, 'asignada', f.asignada,
        'sinLeer', f.sin_leer, 'pendiente', f.pendiente,
        'ultimoEn', f.ultimo_en, 'ultimo', f.ultimo,
        'etiquetas', coalesce((
          select jsonb_agg(jsonb_build_object('id', ca.id, 'nombre', ca.nombre, 'color', ca.color)
                 order by ca.nombre)
            from conversacion_etiqueta e join categoria ca on ca.id = e.categoria_id
           where e.conversacion_id = f.id), '[]'::jsonb))
        order by f.ultimo_en desc)
      from (select * from filtrada order by ultimo_en desc
             limit greatest(p_por_pagina, 1)
            offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)) f
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.conversaciones_del_centro(text, text, text, uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 11. EL HILO DE UNA CONVERSACION
-- ---------------------------------------------------------------------
--
-- SE PIDE HACIA ATRAS, de lo mas nuevo a lo mas viejo, con un tope. Un hilo de
-- dos años son miles de mensajes y bajarlos de golpe cuelga la pestaña; se
-- traen los ultimos y la pantalla pide mas al subir.
create or replace function public.mensajes_de_la_conversacion(
  p_conversacion uuid,
  p_antes_de     timestamptz default null,
  p_limite       int default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x order by x->>'creadoEn'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', m.id, 'direccion', m.direccion, 'cuerpo', m.cuerpo,
      'estado', m.estado, 'error', m.error,
      'adjuntoUrl', m.adjunto_url, 'adjuntoTipo', m.adjunto_tipo,
      'quien', (select mb.nombre from membresia mb where mb.id = m.enviado_por),
      'difusionId', m.difusion_id,
      'leidoEn', m.leido_en, 'creadoEn', m.creado_en) as x
      from mensaje m
     where m.conversacion_id = p_conversacion
       and (p_antes_de is null or m.creado_en < p_antes_de)
     order by m.creado_en desc
     limit greatest(p_limite, 1)
  ) t;
$$;

grant execute on function public.mensajes_de_la_conversacion(uuid, timestamptz, int) to authenticated;

-- ---------------------------------------------------------------------
-- 12. EL RESUMEN DEL PERIODO
-- ---------------------------------------------------------------------
--
-- Mismas reglas que en Reportes, y por lo mismo: sin periodo anterior con
-- actividad NO hay porcentaje, y una tasa sin denominador es `null` y no cero.
-- "0% de respuesta" afirma que no se contesto a nadie; sin conversaciones que
-- respondieran, lo cierto es que no habia a quien.
create or replace function public.resumen_de_mensajes(
  p_negocio text,
  p_desde   date,
  p_hasta   date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with rango as (
    select p_desde as desde, p_hasta as hasta,
           (p_desde - (p_hasta - p_desde + 1))::date as desde_ant,
           (p_desde - 1)::date as hasta_ant
  ),
  m as (
    select ms.* from mensaje ms, rango r
     where ms.negocio_id = p_negocio and ms.creado_en::date between r.desde and r.hasta
  ),
  m_ant as (
    select ms.* from mensaje ms, rango r
     where ms.negocio_id = p_negocio and ms.creado_en::date between r.desde_ant and r.hasta_ant
  ),
  conv as (
    select c.*, app.conversacion_pendiente(c.id, c.atendida_en) as pendiente
      from conversacion c
     where c.negocio_id = p_negocio and not c.eliminado
  ),
  -- Las que PEDIAN respuesta en el periodo: llego algo del cliente.
  pedian as (
    select distinct conversacion_id from m where direccion = 'entrante'
  ),
  respondidas as (
    select count(*)::int as n from pedian p
     where exists (select 1 from mensaje s
                    where s.conversacion_id = p.conversacion_id
                      and s.direccion = 'saliente' and s.estado <> 'fallido'
                      and s.creado_en > (select min(e.creado_en) from m e
                                          where e.conversacion_id = p.conversacion_id
                                            and e.direccion = 'entrante'))
  )
  select jsonb_build_object(
    'activas', (select count(*)::int from conv where estado = 'abierta'),
    'clientesEnConversacion',
      (select count(distinct cliente_id)::int from conv
        where estado = 'abierta' and cliente_id is not null),
    'enviados',      (select count(*)::int from m where direccion = 'saliente'),
    'enviadosAntes', (select count(*)::int from m_ant where direccion = 'saliente'),
    'recibidos',      (select count(*)::int from m where direccion = 'entrante'),
    'recibidosAntes', (select count(*)::int from m_ant where direccion = 'entrante'),
    'pendientes', (select count(*)::int from conv where pendiente and estado <> 'archivada'),
    'hayComparacion', (select count(*) from m_ant) > 0,
    'pedianRespuesta', (select count(*)::int from pedian),
    'respondidas', (select n from respondidas),
    -- Sin nadie a quien responder, la tasa es `null`. Un 0% afirmaria que se
    -- dejo a todo el mundo sin contestar.
    'tasaRespuesta', case when (select count(*) from pedian) = 0 then null
                     else round(((select n from respondidas)::numeric
                                 / (select count(*) from pedian)) * 100, 1) end,
    -- El tiempo de respuesta solo sale si hay pares de verdad. Sin datos se
    -- dice que no hay, en vez de enseñar un cero que se lee como "al instante".
    'minutosDeRespuesta', (
      select round(avg(extract(epoch from (s.creado_en - e.creado_en)) / 60))
        from m e
        join lateral (
          select min(x.creado_en) as creado_en from mensaje x
           where x.conversacion_id = e.conversacion_id
             and x.direccion = 'saliente' and x.estado <> 'fallido'
             and x.creado_en > e.creado_en
        ) s on s.creado_en is not null
       where e.direccion = 'entrante')
  );
$$;

grant execute on function public.resumen_de_mensajes(text, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 13. ABRIR (O ENCONTRAR) LA CONVERSACION DE UN CONTACTO
-- ---------------------------------------------------------------------
--
-- LA REGLA DE ORO DEL MODULO: si ya existe un cliente con ese telefono, la
-- conversacion se cuelga de EL. No se crea otro y no se deja suelta. Buscar por
-- los ultimos diez digitos es lo que hace que "+52 646 123 4567",
-- "6461234567" y "646-123-4567" sean la misma persona — que es como los
-- telefonos se capturan de verdad.
create or replace function public.abrir_conversacion(
  p_negocio  text,
  p_contacto text,
  p_canal    uuid default null,
  p_cliente  uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  v_cliente uuid := p_cliente;
  v_digitos text := right(regexp_replace(coalesce(p_contacto, ''), '[^0-9]', '', 'g'), 10);
begin
  if btrim(coalesce(p_contacto, '')) = '' then
    raise exception 'Una conversacion necesita un contacto: un numero o un correo.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Se busca al cliente ANTES de crear nada.
  if v_cliente is null and length(v_digitos) >= 10 then
    select c.id into v_cliente from cliente c
     where c.negocio_id = p_negocio and not c.eliminado
       and right(regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g'), 10) = v_digitos
     limit 1;
  end if;
  if v_cliente is null and p_contacto like '%@%' then
    select c.id into v_cliente from cliente c
     where c.negocio_id = p_negocio and not c.eliminado
       and lower(coalesce(c.correo, '')) = lower(p_contacto)
     limit 1;
  end if;

  select c.id into v_id from conversacion c
   where c.negocio_id = p_negocio and not c.eliminado
     and lower(c.contacto) = lower(p_contacto)
     and c.canal_id is not distinct from p_canal
   limit 1;

  if v_id is not null then
    -- Si el hilo existia suelto y ahora ya se sabe de quien es, se ata. Al
    -- reves no: nunca se le quita el cliente a una conversacion identificada.
    update conversacion
       set cliente_id = coalesce(cliente_id, v_cliente),
           estado = case when estado = 'archivada' then 'abierta' else estado end
     where id = v_id;
    return v_id;
  end if;

  insert into conversacion (negocio_id, canal_id, cliente_id, contacto)
  values (p_negocio, p_canal, v_cliente, btrim(p_contacto))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.abrir_conversacion(text, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 14. GUARDAR UN MENSAJE
-- ---------------------------------------------------------------------
--
-- SE GUARDA COMO 'pendiente', NUNCA COMO 'enviado'. Guardar y enviar son dos
-- cosas distintas y solo la primera pasa aqui: el envio lo hace el servidor que
-- habla con el proveedor, y es el quien mueve el estado. Marcarlo enviado aqui
-- seria decir que el cliente lo recibio cuando no ha salido de la base.
create or replace function public.guardar_mensaje(
  p_negocio      text,
  p_conversacion uuid,
  p_direccion    text,
  p_cuerpo       text,
  p_adjunto_url  text default null,
  p_adjunto_tipo text default null,
  p_externo_id   text default null,
  p_difusion     uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_quien uuid;
begin
  if btrim(coalesce(p_cuerpo, '')) = '' and p_adjunto_url is null then
    raise exception 'Un mensaje vacio no se manda.'
      using errcode = 'invalid_parameter_value';
  end if;

  select m.id into v_quien from membresia m
   where m.negocio_id = p_negocio and m.usuario_id = auth.uid() limit 1;

  insert into mensaje (negocio_id, conversacion_id, direccion, cuerpo, estado,
                       adjunto_url, adjunto_tipo, externo_id, difusion_id, enviado_por,
                       -- Lo que ESCRIBE el negocio ya esta leido por el negocio.
                       leido_en)
  values (p_negocio, p_conversacion, p_direccion, btrim(coalesce(p_cuerpo, '')),
          case when p_direccion = 'entrante' then 'entregado' else 'pendiente' end,
          p_adjunto_url, p_adjunto_tipo, p_externo_id, p_difusion,
          case when p_direccion = 'saliente' then v_quien end,
          case when p_direccion = 'saliente' then now() end)
  returning id into v_id;

  -- La conversacion sube a lo mas reciente. Es lo que ordena la lista.
  update conversacion set ultimo_en = now(),
         estado = case when estado = 'archivada' and p_direccion = 'entrante'
                       then 'abierta' else estado end
   where id = p_conversacion;

  return v_id;
end;
$$;

grant execute on function public.guardar_mensaje(text, uuid, text, text, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 15. MOVER EL ESTADO DE UN MENSAJE
-- ---------------------------------------------------------------------
--
-- Lo llama quien de verdad hablo con el proveedor. Un fallo guarda su motivo:
-- "no se pudo enviar" sin decir por que obliga a adivinar entre el numero mal
-- escrito, el canal caido y la plantilla no aprobada.
create or replace function public.marcar_estado_de_mensaje(
  p_mensaje uuid,
  p_estado  text,
  p_error   text default null,
  p_externo text default null
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update mensaje
     set estado = p_estado,
         error = case when p_estado = 'fallido' then p_error end,
         externo_id = coalesce(p_externo, externo_id)
   where id = p_mensaje;
$$;

grant execute on function public.marcar_estado_de_mensaje(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 16. LAS ACCIONES SOBRE UNA CONVERSACION
-- ---------------------------------------------------------------------
--
-- ARCHIVAR NO BORRA. La conversacion sale de la vista de todos los dias y
-- sigue entera en "Archivadas": el historial de lo que se le dijo a alguien es
-- justo lo que no se puede perder.
create or replace function public.marcar_conversacion(
  p_conversacion uuid,
  p_accion       text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_accion = 'leida' then
    update mensaje set leido_en = now()
     where conversacion_id = p_conversacion and direccion = 'entrante' and leido_en is null;
  elsif p_accion = 'no_leida' then
    -- Se desmarca SOLO el ultimo entrante, no el hilo entero: lo que se quiere
    -- es "vuelve a recordarmelo", no reabrir dos años de mensajes.
    update mensaje set leido_en = null
     where id = (select m.id from mensaje m
                  where m.conversacion_id = p_conversacion and m.direccion = 'entrante'
                  order by m.creado_en desc limit 1);
  elsif p_accion = 'archivar' then
    update conversacion set estado = 'archivada' where id = p_conversacion;
  elsif p_accion = 'desarchivar' then
    update conversacion set estado = 'abierta' where id = p_conversacion;
  elsif p_accion = 'cerrar' then
    update conversacion set estado = 'cerrada', atendida_en = now() where id = p_conversacion;
  elsif p_accion = 'reabrir' then
    update conversacion set estado = 'abierta' where id = p_conversacion;
  elsif p_accion = 'atendida' then
    update conversacion set atendida_en = now() where id = p_conversacion;
  elsif p_accion = 'favorita' then
    update conversacion set favorita = not favorita where id = p_conversacion;
  else
    raise exception 'Accion desconocida sobre la conversacion: %', p_accion
      using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

grant execute on function public.marcar_conversacion(uuid, text) to authenticated;

create or replace function public.asignar_conversacion(p_conversacion uuid, p_membresia uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update conversacion set asignada_a = p_membresia where id = p_conversacion;
$$;

grant execute on function public.asignar_conversacion(uuid, uuid) to authenticated;

create or replace function public.ligar_cliente_a_conversacion(p_conversacion uuid, p_cliente uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update conversacion set cliente_id = p_cliente where id = p_conversacion;
$$;

grant execute on function public.ligar_cliente_a_conversacion(uuid, uuid) to authenticated;

-- Las etiquetas de un hilo se guardan de una vez: llega la lista completa y se
-- sustituye. Ir de una en una deja estados a medias si falla la tercera.
create or replace function public.etiquetar_conversacion(
  p_negocio      text,
  p_conversacion uuid,
  p_etiquetas    uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from conversacion_etiqueta where conversacion_id = p_conversacion;
  if p_etiquetas is not null and array_length(p_etiquetas, 1) > 0 then
    insert into conversacion_etiqueta (negocio_id, conversacion_id, categoria_id)
    select p_negocio, p_conversacion, unnest(p_etiquetas)
    on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.etiquetar_conversacion(text, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 17. PLANTILLAS, CANALES Y AUTOMATIZACIONES
-- ---------------------------------------------------------------------
create or replace function public.plantillas_del_centro(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nombre', p.nombre, 'categoria', p.categoria, 'cuerpo', p.cuerpo,
      'canalTipo', p.canal_tipo, 'activa', p.activa) order by p.nombre), '[]'::jsonb)
    from plantilla_de_mensaje p
   where p.negocio_id = p_negocio and not p.eliminado;
$$;

grant execute on function public.plantillas_del_centro(text) to authenticated;

create or replace function public.guardar_plantilla(
  p_negocio   text,
  p_id        uuid,
  p_nombre    text,
  p_categoria text,
  p_cuerpo    text,
  p_canal     text default null,
  p_activa    boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'La plantilla necesita un nombre para poder encontrarla.'
      using errcode = 'invalid_parameter_value';
  end if;
  if btrim(coalesce(p_cuerpo, '')) = '' then
    raise exception 'Una plantilla sin texto no sirve de nada.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into plantilla_de_mensaje (negocio_id, nombre, categoria, cuerpo, canal_tipo, activa)
    values (p_negocio, btrim(p_nombre), coalesce(nullif(btrim(p_categoria), ''), 'general'),
            p_cuerpo, p_canal, coalesce(p_activa, true))
    returning id into v_id;
  else
    update plantilla_de_mensaje
       set nombre = btrim(p_nombre),
           categoria = coalesce(nullif(btrim(p_categoria), ''), 'general'),
           cuerpo = p_cuerpo, canal_tipo = p_canal, activa = coalesce(p_activa, true)
     where id = p_id and negocio_id = p_negocio
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.guardar_plantilla(text, uuid, text, text, text, text, boolean) to authenticated;

create or replace function public.borrar_plantilla(p_plantilla uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update plantilla_de_mensaje set eliminado = true where id = p_plantilla;
$$;

grant execute on function public.borrar_plantilla(uuid) to authenticated;

create or replace function public.canales_del_centro(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'tipo', c.tipo, 'nombre', c.nombre, 'identificador', c.identificador,
      'estado', c.estado, 'detalleError', c.detalle_error,
      'ultimaSincronizacion', c.ultima_sincronizacion, 'activo', c.activo)
      order by c.creado_en), '[]'::jsonb)
    from canal_de_mensajes c
   where c.negocio_id = p_negocio and not c.eliminado;
$$;

grant execute on function public.canales_del_centro(text) to authenticated;

-- EL ESTADO NO ES UN PARAMETRO. Se declara el canal —que existe, como se llama,
-- que numero enseña— y nace 'sin_conectar'. Conectarlo de verdad es hablar con
-- el proveedor, y eso no pasa aqui.
create or replace function public.guardar_canal(
  p_negocio       text,
  p_id            uuid,
  p_tipo          text,
  p_nombre        text,
  p_identificador text default null,
  p_activo        boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El canal necesita un nombre.' using errcode = 'invalid_parameter_value';
  end if;
  if p_id is null then
    insert into canal_de_mensajes (negocio_id, tipo, nombre, identificador, activo)
    values (p_negocio, p_tipo, btrim(p_nombre), nullif(btrim(coalesce(p_identificador, '')), ''),
            coalesce(p_activo, true))
    returning id into v_id;
  else
    update canal_de_mensajes
       set tipo = p_tipo, nombre = btrim(p_nombre),
           identificador = nullif(btrim(coalesce(p_identificador, '')), ''),
           activo = coalesce(p_activo, true)
     where id = p_id and negocio_id = p_negocio
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.guardar_canal(text, uuid, text, text, text, boolean) to authenticated;

create or replace function public.automatizaciones_del_centro(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'evento', a.evento, 'plantillaId', a.plantilla_id,
      'plantilla', (select p.nombre from plantilla_de_mensaje p where p.id = a.plantilla_id),
      'canalId', a.canal_id,
      'canal', (select c.nombre from canal_de_mensajes c where c.id = a.canal_id),
      'activa', a.activa) order by a.evento), '[]'::jsonb)
    from automatizacion_de_mensajes a
   where a.negocio_id = p_negocio and not a.eliminado;
$$;

grant execute on function public.automatizaciones_del_centro(text) to authenticated;

create or replace function public.guardar_automatizacion(
  p_negocio   text,
  p_id        uuid,
  p_evento    text,
  p_plantilla uuid default null,
  p_canal     uuid default null,
  p_activa    boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  -- NO SE ENCIENDE SIN PLANTILLA Y SIN CANAL. Una automatizacion activa sin
  -- que mandar y por donde no es una automatizacion: es un fallo silencioso
  -- que se descubre el dia que alguien pregunta por que no llego su recordatorio.
  if coalesce(p_activa, false) and (p_plantilla is null or p_canal is null) then
    raise exception 'Para encender una automatizacion hacen falta una plantilla y un canal.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into automatizacion_de_mensajes (negocio_id, evento, plantilla_id, canal_id, activa)
    values (p_negocio, p_evento, p_plantilla, p_canal, coalesce(p_activa, false))
    returning id into v_id;
  else
    update automatizacion_de_mensajes
       set evento = p_evento, plantilla_id = p_plantilla, canal_id = p_canal,
           activa = coalesce(p_activa, false)
     where id = p_id and negocio_id = p_negocio
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.guardar_automatizacion(text, uuid, text, uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 18. UNA DIFUSION
-- ---------------------------------------------------------------------
--
-- SOLO A QUIEN SE ESCOGIO. La lista de destinatarios llega entera desde la
-- pantalla, ya revisada, y aqui no se amplia por ningun motivo: una difusion
-- que "mejora" el conjunto por su cuenta es como se le escribe a alguien que
-- habia pedido que no.
--
-- Cada destinatario recibe un mensaje NORMAL en su hilo, con el id de la
-- difusion. Asi la difusion se lee en la conversacion de cada persona en vez
-- de vivir en una bandeja aparte que se separa del historial.
create or replace function public.registrar_difusion(
  p_negocio  text,
  p_nombre   text,
  p_cuerpo   text,
  p_canal    uuid,
  p_clientes uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_difusion uuid;
  v_quien    uuid;
  v_cliente  uuid;
  v_conv     uuid;
  v_contacto text;
  v_puestos  int := 0;
  v_fallidos int := 0;
begin
  if p_clientes is null or array_length(p_clientes, 1) is null then
    raise exception 'Una difusion sin destinatarios no se manda.'
      using errcode = 'invalid_parameter_value';
  end if;

  select m.id into v_quien from membresia m
   where m.negocio_id = p_negocio and m.usuario_id = auth.uid() limit 1;

  insert into difusion (negocio_id, nombre, cuerpo, canal_id, creado_por)
  values (p_negocio, btrim(p_nombre), p_cuerpo, p_canal, v_quien)
  returning id into v_difusion;

  foreach v_cliente in array p_clientes loop
    select c.telefono into v_contacto from cliente c
     where c.id = v_cliente and c.negocio_id = p_negocio and not c.eliminado;

    -- SIN POR DONDE ESCRIBIRLE, SE CUENTA COMO FALLIDO Y SE DICE. Saltarlo en
    -- silencio deja creyendo que llego a todo el mundo.
    if v_contacto is null or btrim(v_contacto) = '' then
      v_fallidos := v_fallidos + 1;
      continue;
    end if;

    v_conv := public.abrir_conversacion(p_negocio, v_contacto, p_canal, v_cliente);
    perform public.guardar_mensaje(p_negocio, v_conv, 'saliente', p_cuerpo,
                                   null, null, null, v_difusion);
    v_puestos := v_puestos + 1;
  end loop;

  update difusion set destinatarios = v_puestos, fallidos = v_fallidos where id = v_difusion;

  return jsonb_build_object('id', v_difusion, 'destinatarios', v_puestos, 'fallidos', v_fallidos);
end;
$$;

grant execute on function public.registrar_difusion(text, text, text, uuid, uuid[]) to authenticated;

comment on function public.registrar_difusion is
  'Manda SOLO a la lista que llega, ya revisada en la pantalla. Cada destinatario recibe un mensaje '
  'normal en su hilo con el id de la difusion: asi se lee en su conversacion y no en una bandeja '
  'aparte que se separa del historial. Quien no tiene telefono cuenta como fallido y se dice.';

-- ---------------------------------------------------------------------
-- 19. QUIEN NO QUIERE PROMOCIONES
-- ---------------------------------------------------------------------
--
-- Una difusion promocional NO se le manda a quien pidio que no. Es lo unico de
-- este modulo que no se puede deshacer —el mensaje ya llego— y por eso el dato
-- vive en la ficha del cliente y no en una lista aparte de Mensajes: la fuente
-- de verdad de lo que alguien pidio es su expediente.
--
-- ARRANCA EN "SI ACEPTA" a proposito. Ponerlo en "no" dejaria a todos los
-- clientes que ya existen fuera de cualquier difusion sin que nadie lo hubiera
-- pedido, y la primera difusion del centro no le llegaria a nadie sin decir por
-- que. Quien pida dejar de recibirlas se apaga desde su ficha.
--
-- NO afecta a los mensajes de siempre: confirmar una cita o avisar de un cambio
-- no es promocion, y eso se sigue pudiendo escribir a cualquiera.
alter table cliente add column if not exists acepta_promociones boolean not null default true;

comment on column cliente.acepta_promociones is
  'Si se le pueden mandar difusiones promocionales. Lo apaga quien lo pida, desde su ficha. No '
  'afecta a los mensajes de servicio: confirmar una cita no es promocion.';

-- ---------------------------------------------------------------------
-- 20. LOS PERMISOS DE TABLA QUE FALTABAN
-- ---------------------------------------------------------------------
--
-- ESTO COSTO UN "permission denied for table canal_de_mensajes" EN PRODUCCION,
-- con el SQL corrido entero y sin un solo error.
--
-- LA CONFUSION, Y ES FACIL DE REPETIR: las reglas de acceso por fila y los
-- permisos de tabla son DOS COSAS DISTINTAS que suenan igual. La regla de fila
-- RESTRINGE lo que ya se puede leer — decide CUALES filas. El `grant` es lo que
-- da el permiso de partida. Una tabla con politicas preciosas y sin `grant` no
-- deja leer NADA: las politicas no otorgan, recortan.
--
-- Se escribe una vez por tabla y se olvida para siempre, porque no falla al
-- crearla: falla la primera vez que alguien abre la pantalla. Lo vigila la
-- guardia 18.
--
-- `anon` no toca nada de esto: son datos de pacientes.
revoke all on conversacion, mensaje, canal_de_mensajes, conversacion_etiqueta,
              plantilla_de_mensaje, automatizacion_de_mensajes, difusion,
              reporte_guardado
  from anon;

grant select, insert, update on conversacion, mensaje, canal_de_mensajes,
              plantilla_de_mensaje, automatizacion_de_mensajes, reporte_guardado
  to authenticated;

-- Las etiquetas de un hilo se sustituyen enteras al guardar: hace falta borrar.
grant select, insert, delete on conversacion_etiqueta to authenticated;

-- Una difusion se escribe y se consulta; no se corrige. Igual que la caja: lo
-- que se mando, se mando.
grant select, insert, update on difusion to authenticated;



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
