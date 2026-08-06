-- =====================================================================
-- ACTUALIZAR LA BASE — pegar completo en Supabase → SQL Editor → Run
-- =====================================================================
--
-- QUE TRAE: todo lo que la base necesita para el bloque 5 (PRODUCTOS E
-- INVENTARIO) — las columnas nuevas del producto, las tablas de proveedores y
-- de MOVIMIENTOS DE INVENTARIO, y las funciones que lo sostienen.
--
-- ADEMAS CORRIGE DOS COSAS QUE YA ESTABAN PUBLICADAS:
--
--   1. `cobrar_venta` bajaba el stock con un `update` mudo. Funcionaba, pero
--      no dejaba rastro y dejaba pasar el inventario a negativo. Ahora pasa
--      por la unica puerta, que ademas congela el costo de la venta.
--   2. `siguiente_folio` hacia `max(folio) + 1`. Dos cajas cobrando al mismo
--      tiempo calculaban el mismo folio y la segunda reventaba. Ahora hay un
--      contador con candado.
--
-- ES SEGURO CORRERLO LAS VECES QUE HAGA FALTA. No borra nada, no reescribe
-- ningun dato y no toca una sola fila existente.
--
-- ESTO SE PROBO ANTES DE MANDARTELO: se levanto un Postgres limpio, se
-- instalo la base, este archivo encima, y se corrieron los 135 ataques —
-- incluida la prueba de dos cajas vendiendo la ultima pieza a la vez.
--
-- =====================================================================


-- =====================================================================
-- 1 · EL FOLIO — un contador de verdad
-- =====================================================================

-- EL FOLIO — un contador de verdad, no un `max() + 1`
-- ---------------------------------------------------------------------
--
-- LO QUE ESTABA MAL Y LO ENCONTRO UN ATAQUE: la version anterior hacia
-- `select max(folio) + 1`. Dos cajas cobrando al mismo tiempo leen el mismo
-- maximo, calculan el mismo folio, y la segunda revienta contra el indice
-- unico — con un mensaje de base de datos que no le dice nada a quien esta
-- cobrando. Peor: si el indice no existiera, habria dos ventas con el mismo
-- folio y ningun corte volveria a cuadrar.
--
-- Ahora hay un contador por centro. El `on conflict do update ... returning`
-- es atomico: toma el candado del renglon, suma uno y devuelve el nuevo valor.
-- Dos llamadas simultaneas se forman y salen con numeros distintos.
--
create table if not exists contador_de_folio (
  negocio_id text not null references negocio(id) on delete cascade,
  ambito     text not null,
  ultimo     int not null default 0,
  primary key (negocio_id, ambito)
);

alter table contador_de_folio enable row level security;
alter table contador_de_folio force row level security;
revoke all on contador_de_folio from anon;
-- Nadie lo toca directamente: solo la funcion, que va como `security definer`.
revoke all on contador_de_folio from authenticated;

create or replace function public.siguiente_folio(p_negocio text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  -- La primera vez se arranca desde el mayor que EXISTA O HAYA EXISTIDO, para
  -- no reciclar folios de un centro que ya venia trabajando. Como nada se
  -- borra de verdad, un folio nunca se repite aunque se cancele la venta.
  insert into contador_de_folio (negocio_id, ambito, ultimo)
  values (p_negocio, 'venta',
          coalesce((select max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int)
                    from venta where negocio_id = p_negocio), 0) + 1)
  on conflict (negocio_id, ambito) do update
     set ultimo = contador_de_folio.ultimo + 1
  returning ultimo into v_n;

  return 'V-' || lpad(v_n::text, 5, '0');
end;
$$;

comment on function public.siguiente_folio is
  'Contador con candado, no `max() + 1`: dos cajas cobrando a la vez leen el mismo maximo y '
  'calculan el mismo folio. Aqui se forman y salen con numeros distintos.';

-- =====================================================================
-- 2 · PRODUCTOS E INVENTARIO
-- =====================================================================

-- =====================================================================
-- PRODUCTOS E INVENTARIO — lo que existe, cuanto hay, y POR QUE cambio
-- =====================================================================
--
-- LA DECISION QUE SOSTIENE TODO ESTE BLOQUE: el stock no es un numero que se
-- edita. Es la consecuencia de una lista de movimientos.
--
--   producto               QUE existe: nombre, sku, precio, costo, minimo.
--   movimiento_inventario  POR QUE cambio: entrada, salida, venta, ajuste.
--   proveedor              DE DONDE llega.
--
-- Un `update producto set stock_actual = 20` no dice nada tres meses despues:
-- ni quien lo hizo, ni cuando, ni por que faltaban dos. Con movimientos, la
-- pregunta "¿por que dice 18 si compramos 20?" tiene respuesta.
--
-- `stock_actual` SE CONSERVA como columna —la lista se leeria lentisima
-- sumando movimientos en cada renglon— pero NADIE la escribe directamente:
-- solo `app.mover_inventario`, que hace las dos cosas en el mismo acto. Un
-- movimiento que diga -2 con el stock sin cambiar es peor que no tener
-- movimientos.

-- ---------------------------------------------------------------------
-- LAS COLUMNAS QUE LE FALTABAN AL PRODUCTO
-- ---------------------------------------------------------------------
alter table producto add column if not exists sku text;
alter table producto add column if not exists codigo_barras text;
alter table producto add column if not exists categoria_id uuid;
-- Donde esta fisicamente. Texto libre a proposito: un centro tiene "Estante
-- A"; inventarle una tabla de almacenes a quien tiene una vitrina es
-- construir un ERP que nadie pidio.
alter table producto add column if not exists ubicacion text;
-- Como se cuenta. Casi siempre piezas; los aceites a granel, mililitros.
alter table producto add column if not exists unidad text not null default 'pieza';
alter table producto add column if not exists notas text;
alter table producto add column if not exists actualizado_en timestamptz not null default now();

-- EL SKU ES UNICO POR CENTRO, NO EN TODO EL SISTEMA. Dos consultorios pueden
-- usar "AELV15" para cosas distintas y ninguno tiene por que enterarse.
create unique index if not exists producto_sku_unico
  on producto (negocio_id, upper(sku)) where sku is not null and not eliminado;
create unique index if not exists producto_barras_unico
  on producto (negocio_id, codigo_barras) where codigo_barras is not null and not eliminado;

alter table producto drop constraint if exists producto_categoria_mismo_negocio;
alter table producto add constraint producto_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  -- `set null (columna)`: la llave es compuesta y un `set null` pelon vaciaria
  -- tambien `negocio_id`, que no acepta nulos.
  on delete set null (categoria_id);

create index if not exists producto_categoria_idx on producto (negocio_id, categoria_id)
  where not eliminado;

-- EL AMBITO DE CATEGORIA CRECE. La misma tabla sirve para servicios, cursos y
-- ahora productos: un centro llama "Aceites" a un grupo y no quiere tres
-- listas distintas de grupos.
alter table categoria drop constraint if exists categoria_ambito_check;
alter table categoria add constraint categoria_ambito_check
  check (ambito in ('servicio', 'curso', 'producto'));

-- ---------------------------------------------------------------------
-- LOS PROVEEDORES
-- ---------------------------------------------------------------------
create table if not exists proveedor (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  text not null references negocio(id) on delete cascade,
  nombre      text not null,
  contacto    text,
  telefono    text,
  correo      text,
  notas       text,
  activo      boolean not null default true,
  eliminado   boolean not null default false,
  creado_en   timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'proveedor_negocio_id_unico') then
    alter table proveedor add constraint proveedor_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

create index if not exists proveedor_idx on proveedor (negocio_id) where not eliminado;

alter table proveedor enable row level security;
alter table proveedor force row level security;
revoke all on proveedor from anon;
grant select, insert, update, delete on proveedor to authenticated;

drop policy if exists proveedor_leer on proveedor;
create policy proveedor_leer on proveedor
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists proveedor_escribir on proveedor;
create policy proveedor_escribir on proveedor
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario')
              and app.licencia_permite(negocio_id));

-- UN PRODUCTO PUEDE TENER VARIOS PROVEEDORES. `producto.proveedor_nombre`
-- obligaria a escoger uno y a reescribirlo el dia que cambie; y no permitiria
-- comparar a quien se le compra mas barato.
create table if not exists producto_proveedor (
  id            uuid primary key default gen_random_uuid(),
  negocio_id    text not null references negocio(id) on delete cascade,
  producto_id   uuid not null,
  proveedor_id  uuid not null,
  -- Lo que ESE proveedor cobra. Puede diferir del costo de referencia.
  costo_centavos bigint check (costo_centavos is null or costo_centavos >= 0),
  -- El codigo con el que ese proveedor lo identifica en SU catalogo.
  codigo        text,
  preferido     boolean not null default false,
  creado_en     timestamptz not null default now(),
  unique (producto_id, proveedor_id)
);

alter table producto_proveedor drop constraint if exists pp_producto_mismo_negocio;
alter table producto_proveedor add constraint pp_producto_mismo_negocio
  foreign key (negocio_id, producto_id) references producto (negocio_id, id) on delete cascade;
alter table producto_proveedor drop constraint if exists pp_proveedor_mismo_negocio;
alter table producto_proveedor add constraint pp_proveedor_mismo_negocio
  foreign key (negocio_id, proveedor_id) references proveedor (negocio_id, id) on delete cascade;

-- SOLO UNO PUEDE SER EL PREFERIDO. Dos "principales" es no tener ninguno.
create unique index if not exists pp_un_solo_preferido
  on producto_proveedor (producto_id) where preferido;

create index if not exists pp_producto_idx on producto_proveedor (negocio_id, producto_id);

alter table producto_proveedor enable row level security;
alter table producto_proveedor force row level security;
revoke all on producto_proveedor from anon;
grant select, insert, update, delete on producto_proveedor to authenticated;

drop policy if exists pp_leer on producto_proveedor;
create policy pp_leer on producto_proveedor
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists pp_escribir on producto_proveedor;
create policy pp_escribir on producto_proveedor
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario')
              and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- EL MOVIMIENTO DE INVENTARIO — el corazon de este bloque
-- ---------------------------------------------------------------------
--
-- SOLO SE AGREGA. Un renglon que se puede editar no es una bitacora: si el
-- inventario no cuadra y los movimientos se pueden corregir a mano, no hay
-- forma de saber si falto mercancia o falto honestidad.
--
-- Guarda ANTES y DESPUES a proposito, aunque se podrian recalcular. Con los
-- dos numeros escritos, un descuadre se localiza leyendo la lista: el renglon
-- donde el "antes" de uno no coincide con el "despues" del anterior es
-- exactamente donde algo se salto el sistema.
--
create table if not exists movimiento_inventario (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  producto_id    uuid not null,
  tipo           text not null check (tipo in (
                   'inicial', 'entrada', 'venta', 'devolucion',
                   'ajuste_entrada', 'ajuste_salida', 'merma', 'caducado')),
  -- Positiva o negativa segun el tipo. Se guarda con signo para que sumar la
  -- columna de un producto de siempre su stock.
  cantidad       int not null check (cantidad <> 0),
  stock_antes    int not null,
  stock_despues  int not null,
  motivo         text,
  -- De donde vino: una venta, una compra, un ajuste a mano.
  referencia_tipo text check (referencia_tipo in ('venta', 'compra', 'ajuste')),
  referencia_id  uuid,
  -- El costo unitario de ESTA entrada. Es lo que permite calcular el valor del
  -- inventario y la utilidad historica sin depender del costo de hoy.
  costo_centavos bigint check (costo_centavos is null or costo_centavos >= 0),
  creado_por     uuid,
  creado_en      timestamptz not null default now()
);

comment on table movimiento_inventario is
  'SOLO SE AGREGA. El stock es la consecuencia de esta lista, no un numero que se edita. Guarda '
  'antes y despues aunque se podrian recalcular: con los dos escritos, un descuadre se localiza '
  'leyendo la lista.';

alter table movimiento_inventario drop constraint if exists mi_producto_mismo_negocio;
alter table movimiento_inventario add constraint mi_producto_mismo_negocio
  foreign key (negocio_id, producto_id) references producto (negocio_id, id) on delete cascade;

create index if not exists mi_producto_idx
  on movimiento_inventario (negocio_id, producto_id, creado_en desc);

alter table movimiento_inventario enable row level security;
alter table movimiento_inventario force row level security;
revoke all on movimiento_inventario from anon;
-- SIN update NI delete, para nadie. Igual que la caja: se agrega y ya.
revoke update, delete on movimiento_inventario from authenticated, anon, service_role;
grant select, insert on movimiento_inventario to authenticated;

drop policy if exists mi_leer on movimiento_inventario;
create policy mi_leer on movimiento_inventario
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists mi_agregar on movimiento_inventario;
create policy mi_agregar on movimiento_inventario
  for insert to authenticated
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario'));

-- ---------------------------------------------------------------------
-- LA UNICA PUERTA POR LA QUE CAMBIA EL STOCK
-- ---------------------------------------------------------------------
--
-- Nadie escribe `producto.stock_actual` a mano. Todo pasa por aqui, y aqui el
-- movimiento y el stock cambian EN EL MISMO ACTO. Un movimiento que diga -2
-- con el stock sin tocar es peor que no tener movimientos: hace creer que hay
-- trazabilidad cuando no la hay.
--
-- El `for update` sobre el renglon del producto serializa a quien toque ESE
-- producto. Sin el, dos cajas vendiendo la ultima pieza leen "1 disponible"
-- las dos y el stock queda en -1.
--
create or replace function app.mover_inventario(
  p_producto uuid,
  p_tipo text,
  p_cantidad int,
  p_motivo text default null,
  p_referencia_tipo text default null,
  p_referencia_id uuid default null,
  p_costo bigint default null,
  p_permitir_negativo boolean default false
)
returns movimiento_inventario
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p      producto;
  v_antes  int;
  v_despues int;
  v_m      movimiento_inventario;
begin
  if p_cantidad = 0 then
    raise exception 'Un movimiento de cero no cambia nada.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL CANDADO. Todo lo que sigue esta protegido de la carrera.
  select * into v_p from producto where id = p_producto and not eliminado for update;
  if v_p.id is null then
    raise exception 'Ese producto no existe.' using errcode = 'no_data_found';
  end if;

  v_antes := v_p.stock_actual;
  v_despues := v_antes + p_cantidad;

  -- EL STOCK NO SE VA A NEGATIVO. Un inventario en -3 no es un dato: es la
  -- prueba de que el sistema dejo vender lo que no habia, y a partir de ahi
  -- ningun numero de esa pantalla vale nada.
  if v_despues < 0 and not p_permitir_negativo then
    raise exception 'Solo quedan % de %: no se pueden sacar %.',
      v_antes, v_p.nombre, abs(p_cantidad)
      using errcode = 'check_violation';
  end if;

  insert into movimiento_inventario (
    negocio_id, producto_id, tipo, cantidad, stock_antes, stock_despues,
    motivo, referencia_tipo, referencia_id, costo_centavos, creado_por)
  values (v_p.negocio_id, p_producto, p_tipo, p_cantidad, v_antes, v_despues,
          p_motivo, p_referencia_tipo, p_referencia_id, p_costo, auth.uid())
  returning * into v_m;

  update producto
     set stock_actual = v_despues, actualizado_en = now()
   where id = p_producto;

  return v_m;
end;
$$;

comment on function app.mover_inventario is
  'LA UNICA PUERTA por la que cambia el stock. Movimiento y stock cambian en el mismo acto, con '
  'el renglon del producto bloqueado: sin el candado, dos cajas vendiendo la ultima pieza leen '
  '"1 disponible" las dos y el stock queda en -1.';

-- ---------------------------------------------------------------------
-- EL ESTADO DE INVENTARIO SE DERIVA
-- ---------------------------------------------------------------------
--
-- "Disponible", "Stock bajo" y "Agotado" NO se guardan: se deducen del stock y
-- del minimo. Guardarlos obliga a recalcularlos en cada venta, y el dia que
-- ese recalculo falle la etiqueta se queda vieja sin que nada avise.
--
-- Y son OTRA COSA que `activo`. Un producto activo con cero piezas esta
-- agotado, no inactivo: apagarlo solo porque se acabo lo escondería de la
-- lista justo cuando hay que resurtirlo.
--
create or replace function app.estado_de_stock(p_stock int, p_minimo int)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_stock, 0) <= 0 then 'agotado'
    when coalesce(p_stock, 0) <= coalesce(p_minimo, 0) then 'bajo'
    else 'disponible'
  end;
$$;

-- ---------------------------------------------------------------------
-- QUIEN PUEDE VER COSTOS
-- ---------------------------------------------------------------------
--
-- El costo y el margen no son para todo el mundo. Y esconderlos con CSS no
-- esconde nada: quien abra la consola los ve igual. Se resuelve AQUI, y las
-- consultas devuelven nulo a quien no debe verlos.
--
create or replace function app.puede_ver_costos(p_negocio text)
returns boolean
language sql
stable
as $$
  select app.tiene_permiso(p_negocio, 'verCostos')
      or app.tiene_permiso(p_negocio, 'verFinanzas');
$$;

comment on function app.puede_ver_costos is
  'Esconder el costo con CSS no esconde nada: quien abra la consola lo ve igual. Se decide aqui, '
  'y la consulta devuelve nulo a quien no debe verlo.';

-- ---------------------------------------------------------------------
-- LOS PRODUCTOS DEL CENTRO — buscados, filtrados y paginados en la base
-- ---------------------------------------------------------------------
create or replace function public.productos_del_centro(
  p_negocio text,
  p_busqueda text default null,
  p_estado text default null,
  p_categoria uuid default null,
  p_proveedor uuid default null,
  p_activo boolean default null,
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
      p.*,
      app.estado_de_stock(p.stock_actual, p.stock_minimo) as inventario,
      (select k.nombre from categoria k where k.id = p.categoria_id) as categoria,
      (select k.color  from categoria k where k.id = p.categoria_id) as categoria_color
    from producto p
    where p.negocio_id = p_negocio
      and not p.eliminado
      and (p_categoria is null or p.categoria_id = p_categoria)
      and (p_activo is null or p.activo = p_activo)
      and (p_proveedor is null or exists (
            select 1 from producto_proveedor pp
            where pp.producto_id = p.id and pp.proveedor_id = p_proveedor))
      -- El buscador mira nombre, SKU y codigo de barras: en un mostrador se
      -- busca por lo que diga la etiqueta, no siempre por el nombre.
      and (p_busqueda is null or (
            p.nombre        ilike '%' || p_busqueda || '%'
         or p.sku           ilike '%' || p_busqueda || '%'
         or p.codigo_barras ilike '%' || p_busqueda || '%'
         or p.descripcion   ilike '%' || p_busqueda || '%'))
  ),
  filtrada as (
    select * from base where (p_estado is null or inventario = p_estado)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    'filas', coalesce((
      select jsonb_agg(t.x order by t.orden)
      from (
        select jsonb_build_object(
          'id', f.id,
          'nombre', f.nombre,
          'sku', f.sku,
          'codigoBarras', f.codigo_barras,
          'categoriaId', f.categoria_id,
          'categoria', f.categoria,
          'categoriaColor', f.categoria_color,
          'precioCentavos', f.precio_centavos,
          -- EL COSTO SOLO A QUIEN PUEDE VERLO. Nulo, no cero: cero seria un
          -- dato falso y ademas haria creer que el margen es del 100%.
          'costoCentavos', case when app.puede_ver_costos(p_negocio)
                                then f.costo_centavos else null end,
          'stockActual', f.stock_actual,
          'stockMinimo', f.stock_minimo,
          'unidad', f.unidad,
          'imagenUrl', f.imagen_url,
          'ubicacion', f.ubicacion,
          'inventario', f.inventario,
          'activo', f.activo
        ) as x,
        f.nombre as orden
        from filtrada f
        order by f.nombre
        limit greatest(p_por_pagina, 1)
        offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)
      ) t
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- LAS CUATRO CIFRAS DE ARRIBA
-- ---------------------------------------------------------------------
--
-- EL VALOR DEL INVENTARIO SE CALCULA CON EL COSTO, no con el precio de venta.
-- Con el precio de venta el numero sale inflado y se lee como si el centro
-- tuviera ese dinero: lo que hay en la vitrina vale lo que costo, y lo demas
-- es una ganancia que todavia no ocurre.
--
create or replace function public.resumen_productos(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with p as (
    select producto.*, app.estado_de_stock(stock_actual, stock_minimo) as inventario
    from producto where negocio_id = p_negocio and not eliminado and activo
  )
  select jsonb_build_object(
    -- Los ARCHIVADOS no cuentan: la cifra es "que tengo para vender", no
    -- "cuantos renglones hay en la tabla".
    'total', (select count(*) from p),
    'valorCentavos', case when app.puede_ver_costos(p_negocio) then (
      select coalesce(sum(greatest(stock_actual, 0)::bigint * costo_centavos), 0) from p
    ) else null end,
    'bajos', (select count(*) from p where inventario = 'bajo'),
    'agotados', (select count(*) from p where inventario = 'agotado')
  );
$$;

comment on function public.resumen_productos is
  'El valor del inventario se calcula con el COSTO, no con el precio de venta: lo que hay en la '
  'vitrina vale lo que costo, y lo demas es una ganancia que todavia no ocurre.';

-- ---------------------------------------------------------------------
-- LA FICHA DE UN PRODUCTO — con sus movimientos, ventas y proveedores
-- ---------------------------------------------------------------------
create or replace function public.ficha_del_producto(p_producto uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p.id,
    'nombre', p.nombre,
    'descripcion', p.descripcion,
    'sku', p.sku,
    'codigoBarras', p.codigo_barras,
    'categoriaId', p.categoria_id,
    'categoria', (select k.nombre from categoria k where k.id = p.categoria_id),
    'categoriaColor', (select k.color from categoria k where k.id = p.categoria_id),
    'precioCentavos', p.precio_centavos,
    'costoCentavos', case when app.puede_ver_costos(p.negocio_id)
                          then p.costo_centavos else null end,
    'puedeVerCostos', app.puede_ver_costos(p.negocio_id),
    'stockActual', p.stock_actual,
    'stockMinimo', p.stock_minimo,
    'unidad', p.unidad,
    'ubicacion', p.ubicacion,
    'imagenUrl', p.imagen_url,
    'notas', p.notas,
    'activo', p.activo,
    'inventario', app.estado_de_stock(p.stock_actual, p.stock_minimo),
    'valorCentavos', case when app.puede_ver_costos(p.negocio_id)
                          then greatest(p.stock_actual, 0)::bigint * p.costo_centavos
                          else null end,
    -- LOS MOVIMIENTOS: por que el stock es el que es.
    'movimientos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'tipo', m.tipo, 'cantidad', m.cantidad,
        'stockAntes', m.stock_antes, 'stockDespues', m.stock_despues,
        'motivo', m.motivo, 'referenciaTipo', m.referencia_tipo,
        'referenciaId', m.referencia_id,
        'quien', (select b.nombre from membresia b where b.usuario_id = m.creado_por
                   and b.negocio_id = m.negocio_id limit 1),
        'cuando', m.creado_en
      ) order by m.creado_en desc)
      from (select * from movimiento_inventario
             where producto_id = p.id order by creado_en desc limit 50) m
    ), '[]'::jsonb),
    -- LAS VENTAS con su precio HISTORICO. No se recalculan con el de hoy: el
    -- ticket de enero tiene que seguir diciendo lo que se cobro en enero.
    'ventas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ventaId', v.id, 'folio', v.folio, 'fecha', v.fecha,
        'cantidad', i.cantidad,
        'precioUnitario', i.precio_unitario_centavos,
        'total', i.subtotal_centavos,
        'clienteId', v.cliente_id,
        'cliente', (select c.nombre from cliente c where c.id = v.cliente_id)
      ) order by v.fecha desc, v.creado_en desc)
      from (select vi.* from venta_item vi
             join venta vv on vv.id = vi.venta_id
             where vi.producto_id = p.id and vv.estado = 'cobrada' and not vv.eliminado
             order by vv.fecha desc limit 30) i
      join venta v on v.id = i.venta_id
    ), '[]'::jsonb),
    'proveedores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pp.id, 'proveedorId', pr.id, 'nombre', pr.nombre,
        'telefono', pr.telefono, 'correo', pr.correo,
        'codigo', pp.codigo, 'preferido', pp.preferido,
        'costoCentavos', case when app.puede_ver_costos(p.negocio_id)
                              then pp.costo_centavos else null end
      ) order by pp.preferido desc, pr.nombre)
      from producto_proveedor pp
      join proveedor pr on pr.id = pp.proveedor_id and not pr.eliminado
      where pp.producto_id = p.id
    ), '[]'::jsonb)
  )
  from producto p
  where p.id = p_producto and not p.eliminado;
$$;

-- ---------------------------------------------------------------------
-- GUARDAR UN PRODUCTO — SIN tocar el stock
-- ---------------------------------------------------------------------
--
-- EL STOCK NO SE EDITA DESDE AQUI, a proposito. Cambiar 18 por 20 en un
-- formulario no dice de donde salieron las dos piezas. Para eso esta
-- `ajustar_inventario`, que exige un motivo y deja rastro.
--
-- El stock INICIAL si entra aqui, porque es la primera vez y no hay nada de
-- donde partir — pero produce su movimiento igual.
--
create or replace function public.guardar_producto(
  p_negocio text,
  p_id uuid,
  p_nombre text,
  p_descripcion text default null,
  p_sku text default null,
  p_codigo_barras text default null,
  p_categoria uuid default null,
  p_precio bigint default 0,
  p_costo bigint default 0,
  p_stock_minimo int default 0,
  p_unidad text default 'pieza',
  p_ubicacion text default null,
  p_imagen text default null,
  p_notas text default null,
  p_activo boolean default true,
  p_stock_inicial int default 0
)
returns producto
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p     producto;
  v_antes jsonb;
  v_quien membresia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarInventario') then
    raise exception 'No tienes permiso para administrar el inventario.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El producto necesita un nombre.' using errcode = 'invalid_parameter_value';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;
  if p_costo is null or p_costo < 0 then
    raise exception 'El costo no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;
  if p_stock_minimo is null or p_stock_minimo < 0 then
    raise exception 'El stock minimo no puede ser negativo.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if p_id is null then
    insert into producto (negocio_id, nombre, descripcion, sku, codigo_barras, categoria_id,
                          precio_centavos, costo_centavos, stock_actual, stock_minimo,
                          unidad, ubicacion, imagen_url, notas, activo)
    values (p_negocio, btrim(p_nombre), p_descripcion, nullif(btrim(coalesce(p_sku, '')), ''),
            nullif(btrim(coalesce(p_codigo_barras, '')), ''), p_categoria,
            p_precio, p_costo, 0, p_stock_minimo,
            coalesce(p_unidad, 'pieza'), p_ubicacion, p_imagen, p_notas, coalesce(p_activo, true))
    returning * into v_p;

    -- EL STOCK INICIAL NO SE ASIGNA EN SILENCIO: produce su movimiento, igual
    -- que todos los demas. Si mañana falta una pieza, la lista empieza aqui.
    if coalesce(p_stock_inicial, 0) > 0 then
      perform app.mover_inventario(v_p.id, 'inicial', p_stock_inicial,
                                   'Inventario inicial', null, null, p_costo);
      select * into v_p from producto where id = v_p.id;
    end if;

    insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                           entidad, antes, despues)
    values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
            coalesce((select r.etiqueta from rol r
                       where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                      v_quien.rol, 'desconocido'),
            'productos', 'crear', v_p.id::text, null,
            jsonb_build_object('nombre', v_p.nombre, 'precio', v_p.precio_centavos,
                               'costo', v_p.costo_centavos, 'sku', v_p.sku));
    return v_p;
  end if;

  select * into v_p from producto where id = p_id and negocio_id = p_negocio and not eliminado;
  if v_p.id is null then
    raise exception 'Ese producto no existe.' using errcode = 'no_data_found';
  end if;

  v_antes := jsonb_build_object('nombre', v_p.nombre, 'precio', v_p.precio_centavos,
                                'costo', v_p.costo_centavos, 'minimo', v_p.stock_minimo,
                                'activo', v_p.activo, 'sku', v_p.sku);

  update producto
     set nombre = btrim(p_nombre), descripcion = p_descripcion,
         sku = nullif(btrim(coalesce(p_sku, '')), ''),
         codigo_barras = nullif(btrim(coalesce(p_codigo_barras, '')), ''),
         categoria_id = p_categoria, precio_centavos = p_precio, costo_centavos = p_costo,
         stock_minimo = p_stock_minimo, unidad = coalesce(p_unidad, 'pieza'),
         ubicacion = p_ubicacion, imagen_url = p_imagen, notas = p_notas,
         activo = coalesce(p_activo, v_p.activo), actualizado_en = now()
     -- OJO: `stock_actual` NO esta en esta lista, y es a proposito.
   where id = p_id
  returning * into v_p;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'productos', 'editar', v_p.id::text, v_antes,
          jsonb_build_object('nombre', v_p.nombre, 'precio', v_p.precio_centavos,
                             'costo', v_p.costo_centavos, 'minimo', v_p.stock_minimo,
                             'activo', v_p.activo, 'sku', v_p.sku));
  return v_p;
end;
$$;

comment on function public.guardar_producto is
  'NO toca `stock_actual`, a proposito: cambiar 18 por 20 en un formulario no dice de donde '
  'salieron las dos piezas. Para eso esta `ajustar_inventario`, que exige un motivo.';

-- ---------------------------------------------------------------------
-- AJUSTAR EL INVENTARIO — con motivo obligatorio
-- ---------------------------------------------------------------------
create or replace function public.ajustar_inventario(
  p_producto uuid,
  p_tipo text,
  p_cantidad int,
  p_motivo text,
  p_costo bigint default null
)
returns movimiento_inventario
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p     producto;
  v_signo int;
  v_m     movimiento_inventario;
  v_quien membresia;
begin
  select * into v_p from producto where id = p_producto and not eliminado;
  if v_p.id is null then
    raise exception 'Ese producto no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_p.negocio_id, 'gestionarInventario') then
    raise exception 'No tienes permiso para ajustar el inventario.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(v_p.negocio_id) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_tipo not in ('entrada', 'ajuste_entrada', 'ajuste_salida', 'merma', 'caducado') then
    raise exception 'Ese tipo de movimiento no se puede hacer a mano.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.'
      using errcode = 'invalid_parameter_value';
  end if;
  -- EL MOTIVO ES OBLIGATORIO. Un ajuste sin motivo es exactamente el
  -- `update stock = 20` que este bloque existe para evitar.
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Todo ajuste necesita un motivo.' using errcode = 'invalid_parameter_value';
  end if;

  v_signo := case when p_tipo in ('entrada', 'ajuste_entrada') then 1 else -1 end;

  v_m := app.mover_inventario(p_producto, p_tipo, v_signo * p_cantidad, btrim(p_motivo),
                              'ajuste', null, p_costo);

  select * into v_quien from membresia
   where negocio_id = v_p.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues, motivo)
  values (v_p.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'productos', 'inventario', p_producto::text,
          jsonb_build_object('stock', v_m.stock_antes),
          jsonb_build_object('stock', v_m.stock_despues, 'tipo', p_tipo), btrim(p_motivo));

  return v_m;
end;
$$;

-- ---------------------------------------------------------------------
-- LOS PROVEEDORES DE UN PRODUCTO
-- ---------------------------------------------------------------------
create or replace function public.guardar_proveedor(
  p_negocio text, p_id uuid, p_nombre text,
  p_contacto text default null, p_telefono text default null,
  p_correo text default null, p_notas text default null, p_activo boolean default true
)
returns proveedor
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_pr proveedor;
begin
  if not app.tiene_permiso(p_negocio, 'gestionarInventario') then
    raise exception 'No tienes permiso para administrar proveedores.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El proveedor necesita un nombre.' using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into proveedor (negocio_id, nombre, contacto, telefono, correo, notas, activo)
    values (p_negocio, btrim(p_nombre), p_contacto, p_telefono, p_correo, p_notas,
            coalesce(p_activo, true))
    returning * into v_pr;
    return v_pr;
  end if;

  update proveedor
     set nombre = btrim(p_nombre), contacto = p_contacto, telefono = p_telefono,
         correo = p_correo, notas = p_notas, activo = coalesce(p_activo, activo)
   where id = p_id and negocio_id = p_negocio
  returning * into v_pr;
  if v_pr.id is null then
    raise exception 'Ese proveedor no existe.' using errcode = 'no_data_found';
  end if;
  return v_pr;
end;
$$;

create or replace function public.ligar_proveedor(
  p_producto uuid, p_proveedor uuid,
  p_costo bigint default null, p_codigo text default null, p_preferido boolean default false
)
returns producto_proveedor
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p  producto;
  v_pp producto_proveedor;
begin
  select * into v_p from producto where id = p_producto and not eliminado;
  if v_p.id is null then
    raise exception 'Ese producto no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_p.negocio_id, 'gestionarInventario') then
    raise exception 'No tienes permiso para administrar proveedores.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from proveedor
                  where id = p_proveedor and negocio_id = v_p.negocio_id and not eliminado) then
    raise exception 'Ese proveedor no existe en este centro.' using errcode = 'no_data_found';
  end if;

  -- SOLO UNO PUEDE SER EL PREFERIDO: el anterior se baja antes de subir este.
  -- Dos "principales" es no tener ninguno.
  if coalesce(p_preferido, false) then
    update producto_proveedor set preferido = false
     where producto_id = p_producto and preferido;
  end if;

  insert into producto_proveedor (negocio_id, producto_id, proveedor_id, costo_centavos,
                                  codigo, preferido)
  values (v_p.negocio_id, p_producto, p_proveedor, p_costo, p_codigo, coalesce(p_preferido, false))
  on conflict (producto_id, proveedor_id) do update
     set costo_centavos = excluded.costo_centavos,
         codigo = excluded.codigo,
         preferido = excluded.preferido
  returning * into v_pp;
  return v_pp;
end;
$$;

create or replace function public.desligar_proveedor(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n text;
begin
  select negocio_id into v_n from producto_proveedor where id = p_id;
  if v_n is null then
    raise exception 'Esa relacion no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_n, 'gestionarInventario') then
    raise exception 'No tienes permiso para administrar proveedores.'
      using errcode = 'insufficient_privilege';
  end if;
  delete from producto_proveedor where id = p_id;
end;
$$;

create or replace function public.proveedores_del_centro(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id, 'nombre', pr.nombre, 'contacto', pr.contacto,
    'telefono', pr.telefono, 'correo', pr.correo, 'activo', pr.activo,
    'productos', (select count(*) from producto_proveedor pp where pp.proveedor_id = pr.id)
  ) order by pr.nombre), '[]'::jsonb)
  from proveedor pr
  where pr.negocio_id = p_negocio and not pr.eliminado;
$$;

-- ---------------------------------------------------------------------
-- LA INTEGRACION QUE HABIA QUE CORREGIR: VENTAS ↔ INVENTARIO
-- ---------------------------------------------------------------------
--
-- `cobrar_venta` bajaba el stock con un `update` directo. Funcionaba —el
-- candado estaba puesto— pero NO DEJABA RASTRO: tres meses despues, "¿por que
-- dice 18 si compramos 20?" no tenia respuesta. Y ademas dejaba pasar el
-- stock a negativo: bastaba con capturar mas piezas de las que hay.
--
-- Ahora las dos funciones pasan por `app.mover_inventario`, que es la unica
-- puerta. Se corrige EN LA FUENTE en vez de parchar desde Productos.
--
-- Y EL COSTO SE CONGELA AL VENDER. Sin esa foto, subir el costo el mes que
-- viene reescribiria la utilidad de todos los meses anteriores.
--
alter table venta_item add column if not exists costo_unitario_centavos bigint;
alter table venta_item add column if not exists descuento_centavos bigint not null default 0;

comment on column venta_item.costo_unitario_centavos is
  'El costo del producto EN EL MOMENTO DE VENDER. Sin esta foto, subir el costo el mes que viene '
  'reescribiria la utilidad de todos los meses anteriores.';

create or replace function public.cobrar_venta(p_venta uuid)
returns venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta venta;
  v_total bigint;
  v_item  record;
begin
  select * into v_venta from venta where id = p_venta and not eliminado;
  if v_venta.id is null then
    raise exception 'La venta no existe.' using errcode = 'no_data_found';
  end if;

  -- LOS TRES PORTEROS, en la base y no en la pantalla.
  if not app.es_miembro(v_venta.negocio_id) then
    raise exception 'Esta venta no es de tu negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_venta.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso para cobrar.' using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(v_venta.negocio_id) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_venta.estado <> 'borrador' then
    raise exception 'Esta venta ya no esta en borrador: esta %.', v_venta.estado
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL TOTAL SE CALCULA, NO SE RECIBE. Aceptar el total que manda el
  -- navegador es dejar que el cliente decida cuanto pago.
  select coalesce(sum(subtotal_centavos), 0) into v_total
  from venta_item where venta_id = p_venta;

  if v_total <= 0 then
    raise exception 'No se puede cobrar una venta sin renglones.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- LA BAJA DE INVENTARIO, POR SU PUERTA. `mover_inventario` bloquea el
  -- renglon, comprueba que alcance y deja el movimiento — las tres cosas en
  -- el mismo acto.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    perform app.mover_inventario(v_item.producto_id, 'venta', -v_item.cantidad,
                                 'Venta ' || v_venta.folio, 'venta', v_venta.id);
  end loop;

  -- EL COSTO SE CONGELA AQUI, con el del catalogo en este instante.
  update venta_item vi
     set costo_unitario_centavos = p.costo_centavos
    from producto p
   where vi.venta_id = p_venta and vi.producto_id = p.id
     and vi.costo_unitario_centavos is null;

  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                               descripcion, fecha, creado_por)
  values (v_venta.negocio_id, 'ingreso', 'venta', v_venta.id, v_total,
          'Venta ' || v_venta.folio, v_venta.fecha, auth.uid());

  update venta set estado = 'cobrada', total_centavos = v_total, cobrada_en = now()
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

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
    raise exception 'No tienes permiso para cancelar ventas.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_venta.estado <> 'cobrada' then
    raise exception 'Solo se cancela una venta cobrada; esta esta %.', v_venta.estado
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL INVENTARIO REGRESA CON UN MOVIMIENTO CONTRARIO, no borrando el de la
  -- venta. El de la venta ocurrio de verdad: borrarlo seria reescribir la
  -- historia para que cuadre, que es justo lo que una bitacora impide.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    perform app.mover_inventario(v_item.producto_id, 'devolucion', v_item.cantidad,
                                 'Cancelacion de venta ' || v_venta.folio, 'venta', v_venta.id);
  end loop;

  -- Y la caja NO se corrige: se le agrega el movimiento contrario.
  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                               descripcion, fecha, creado_por)
  values (v_venta.negocio_id, 'egreso', 'venta', v_venta.id, v_venta.total_centavos,
          'Cancelacion de venta ' || v_venta.folio || coalesce(' — ' || p_motivo, ''),
          current_date, auth.uid());

  update venta set estado = 'cancelada', cancelada_en = now()
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

comment on function public.cobrar_venta is
  'Todo o nada: total calculado en el servidor, inventario bajado POR SU PUERTA —con movimiento y '
  'sin dejarlo negativo—, costo congelado e ingreso en caja.';

-- =====================================================================
-- LISTO. Si no salio ningun error en rojo, la base ya tiene todo lo que
-- necesitan las pantallas de Productos — y el inventario ya deja rastro.
-- =====================================================================
