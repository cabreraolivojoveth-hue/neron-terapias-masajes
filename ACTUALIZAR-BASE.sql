-- =====================================================================
-- ACTUALIZAR LA BASE — pegar completo en Supabase → SQL Editor → Run
-- =====================================================================
--
-- QUE TRAE: los tres bloques nuevos.
--
--   BLOQUE 5 · PRODUCTOS E INVENTARIO — las columnas nuevas del producto, las
--   tablas de proveedores y de MOVIMIENTOS DE INVENTARIO, y sus funciones.
--
--   BLOQUE 6 · VENTAS — la transaccion que cobra: `registrar_venta`, las
--   cotizaciones, el catalogo vendible y la ficha del ticket.
--
--   BLOQUE 6 · CAJA — la sesion de caja, el corte, y la regla que lo sostiene
--   todo: la tarjeta es un ingreso del negocio y CERO efectivo en el cajon.
--
-- ADEMAS CORRIGE TRES COSAS QUE YA ESTABAN PUBLICADAS:
--
--   1. `cobrar_venta` bajaba el stock con un `update` mudo. Funcionaba, pero
--      no dejaba rastro y dejaba pasar el inventario a negativo. Ahora pasa
--      por la unica puerta, que ademas congela el costo de la venta.
--   2. `siguiente_folio` hacia `max(folio) + 1`. Dos cajas cobrando al mismo
--      tiempo calculaban el mismo folio y la segunda reventaba. Ahora hay un
--      contador con candado.
--   3. La caja solo aceptaba UN movimiento por venta, asi que un pago mixto
--      —parte en efectivo y parte con tarjeta— reventaba contra el indice
--      unico. Ahora el movimiento cuelga del PAGO, no de la venta: entran los
--      dos, cada uno con su metodo, que es justo lo que un corte de caja
--      fisico necesita saber.
--   4. Cancelar una venta sacaba UN egreso sin forma de pago. En una venta
--      cobrada con tarjeta eso sacaba del cajon dinero que nunca entro al
--      cajon, y el corte de esa tarde salia con un faltante inventado. Ahora
--      el egreso sale por la MISMA via por la que entro.
--   5. Un gasto bajaba el efectivo siempre. La renta pagada por transferencia
--      no toca el cajon, y ahora el gasto lleva su forma de pago.
--
-- LO QUE CAMBIA EN COMO SE TRABAJA, y conviene saber antes de correrlo:
-- a partir de aqui, COBRAR EN EFECTIVO EXIGE UNA CAJA ABIERTA. La tarjeta y
-- la transferencia se siguen cobrando sin caja —ese dinero va al banco, no al
-- cajon—. Si intentas cobrar en efectivo sin caja abierta, Ventas te lo dice y
-- te lleva a abrirla.
--
-- ES SEGURO CORRERLO LAS VECES QUE HAGA FALTA, Y SEGURO CORRERLO SI YA
-- CORRISTE EL ANTERIOR. No borra nada, no reescribe ningun dato y no toca una
-- sola fila existente: todo va con `if not exists` o `create or replace`.
--
-- ESTO SE PROBO ANTES DE MANDARTELO: se levanto un Postgres limpio, se
-- instalo la base, este archivo encima, y se corrieron los 180 ataques —
-- incluidos el doble clic en "Finalizar venta", dos cajas vendiendo la ultima
-- pieza a la vez, un pago mixto que tiene que dejar dos movimientos de caja, y
-- un corte que solo cuenta el efectivo.
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
-- 3 · VENTAS, PAGOS Y COTIZACIONES
-- =====================================================================

/**
 * LA CAJA ES UN LIBRO: SE ESCRIBE, NO SE CORRIGE.
 *
 * No hay columna "revertido" ni forma de editar un renglon. Cancelar una
 * venta no tacha su ingreso: AGREGA el egreso contrario. El saldo sale de
 * sumar ingresos y restar egresos, y se netea solo.
 *
 * Por eso el indice unico incluye el tipo: una venta puede tener su ingreso
 * (al cobrar) y su egreso (al cancelar), pero jamas dos ingresos. Es lo que
 * hace que dos clics en "Cobrar" no metan el dinero dos veces.
 */
-- En una base que ya existia, la restriccion se amplia sin tocar una sola fila.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'movimiento_caja_origen_check') then
    alter table movimiento_caja drop constraint movimiento_caja_origen_check;
  end if;
  alter table movimiento_caja add constraint movimiento_caja_origen_check
    check (origen in ('venta', 'gasto', 'ajuste', 'pago'));
end $$;

create unique index if not exists movimiento_caja_unico_por_origen
  on movimiento_caja (negocio_id, origen, referencia_id, tipo)
  where referencia_id is not null;

-- =====================================================================
-- VENTAS — la operacion comercial, en un solo acto
-- =====================================================================
--
-- VENTAS ORQUESTA; NO ES DUEÑA DE CASI NADA. El cliente es de Clientes, el
-- servicio de Servicios, el producto y su stock de Productos, el cupo de
-- Cursos, el dinero de Caja. Aqui se JUNTAN, y lo unico propio es:
--
--   venta        la operacion: quien, cuando, cuanto.
--   venta_item   la FOTO de cada concepto vendido: nombre, precio y costo
--                del dia, para que la historia no se reescriba.
--   pago         COMO se pago. Varios renglones = pago mixto.
--   cotizacion   lo mismo, pero sin efecto: ni stock, ni caja, ni cupo.
--
-- LA REGLA QUE LO SOSTIENE TODO: `registrar_venta` es UNA transaccion. Valida
-- el stock, valida el cupo, calcula los totales EN EL SERVIDOR, guarda la
-- venta, mueve el inventario, inscribe en el curso, registra los pagos y mete
-- el dinero a la caja. Pasa entero o no pasa nada.
--
-- La forma obvia —varias llamadas desde el navegador— deja el sistema partido
-- en cuanto una falle: venta cobrada sin bajar stock, o stock bajado sin
-- ingreso en caja. Y nadie se entera hasta que el inventario no cuadra tres
-- meses despues.

-- ---------------------------------------------------------------------
-- LAS COLUMNAS QUE LE FALTABAN A LA VENTA
-- ---------------------------------------------------------------------
alter table venta add column if not exists vendedor_id uuid;
alter table venta add column if not exists subtotal_centavos bigint not null default 0;
alter table venta add column if not exists descuento_centavos bigint not null default 0;
alter table venta add column if not exists impuesto_centavos bigint not null default 0;
-- Lo que se recibio en efectivo. NO es el ingreso: si el cliente da mil por
-- una venta de novecientos, el ingreso son novecientos y cien son su cambio.
alter table venta add column if not exists efectivo_recibido_centavos bigint;
alter table venta add column if not exists notas text;
alter table venta add column if not exists cancelada_motivo text;

-- LA LLAVE DE IDEMPOTENCIA — contra el doble clic.
--
-- Sin esto, dos clics rapidos en "Finalizar venta" crean DOS ventas, bajan el
-- stock DOS veces y meten el dinero DOS veces a la caja. El boton deshabilitado
-- ayuda, pero no es la defensa: una red lenta reintenta sola, y la pestaña de
-- al lado no sabe nada del boton de esta.
--
-- El indice unico es la defensa de verdad: la segunda peticion con la misma
-- llave no crea nada, devuelve la venta que ya existe.
alter table venta add column if not exists llave_idempotencia text;
create unique index if not exists venta_llave_unica
  on venta (negocio_id, llave_idempotencia) where llave_idempotencia is not null;

alter table venta drop constraint if exists venta_vendedor_mismo_negocio;
alter table venta add constraint venta_vendedor_mismo_negocio
  foreign key (negocio_id, vendedor_id) references membresia (negocio_id, id)
  on delete set null (vendedor_id);

create index if not exists venta_fecha_idx on venta (negocio_id, fecha desc) where not eliminado;

-- EL METODO SE GUARDA EN LA CAJA. Tarjeta y efectivo son los dos ingresos,
-- pero solo uno esta fisicamente en el cajon: sin esta columna, un corte de
-- caja fisico tendria que adivinar cual fue cual.
alter table movimiento_caja add column if not exists metodo text;

-- ---------------------------------------------------------------------
-- LAS COTIZACIONES — lo mismo, pero SIN efecto
-- ---------------------------------------------------------------------
--
-- ENTIDAD APARTE, no una venta en estado raro. Una cotizacion guardada como
-- "venta borrador" acabaria contada en algun reporte de ingresos el dia que
-- alguien olvide filtrar el estado — y no es dinero, es una propuesta.
--
create table if not exists cotizacion (
  id                 uuid primary key default gen_random_uuid(),
  negocio_id         text not null references negocio(id) on delete cascade,
  folio              text not null,
  cliente_id         uuid,
  vendedor_id        uuid,
  fecha              date not null default current_date,
  vence              date,
  subtotal_centavos  bigint not null default 0,
  descuento_centavos bigint not null default 0,
  impuesto_centavos  bigint not null default 0,
  total_centavos     bigint not null default 0,
  estado             text not null default 'abierta'
                     check (estado in ('abierta', 'aceptada', 'vencida', 'cancelada', 'convertida')),
  notas              text,
  venta_id           uuid,
  eliminado          boolean not null default false,
  creado_en          timestamptz not null default now(),
  unique (negocio_id, folio)
);

comment on table cotizacion is
  'Entidad APARTE, no una venta en estado raro: una cotizacion guardada como venta borrador acaba '
  'contada en algun reporte de ingresos el dia que alguien olvide filtrar el estado.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cotizacion_negocio_id_unico') then
    alter table cotizacion add constraint cotizacion_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

alter table cotizacion drop constraint if exists cotizacion_cliente_mismo_negocio;
alter table cotizacion add constraint cotizacion_cliente_mismo_negocio
  foreign key (negocio_id, cliente_id) references cliente (negocio_id, id)
  on delete set null (cliente_id);

create index if not exists cotizacion_idx on cotizacion (negocio_id, fecha desc) where not eliminado;

create table if not exists cotizacion_item (
  id                       uuid primary key default gen_random_uuid(),
  negocio_id               text not null references negocio(id) on delete cascade,
  cotizacion_id            uuid not null,
  tipo                     text not null check (tipo in ('producto', 'servicio', 'curso')),
  producto_id              uuid,
  servicio_id              uuid,
  curso_id                 uuid,
  descripcion              text not null,
  cantidad                 numeric(12, 3) not null check (cantidad > 0),
  precio_unitario_centavos bigint not null check (precio_unitario_centavos >= 0),
  descuento_centavos       bigint not null default 0,
  subtotal_centavos        bigint not null check (subtotal_centavos >= 0)
);

alter table cotizacion_item drop constraint if exists ci_cotizacion_mismo_negocio;
alter table cotizacion_item add constraint ci_cotizacion_mismo_negocio
  foreign key (negocio_id, cotizacion_id) references cotizacion (negocio_id, id) on delete cascade;

create index if not exists cotizacion_item_idx on cotizacion_item (negocio_id, cotizacion_id);

alter table cotizacion      enable row level security;
alter table cotizacion      force row level security;
alter table cotizacion_item enable row level security;
alter table cotizacion_item force row level security;
revoke all on cotizacion, cotizacion_item from anon;
grant select, insert, update, delete on cotizacion, cotizacion_item to authenticated;

drop policy if exists cotizacion_leer on cotizacion;
create policy cotizacion_leer on cotizacion
  for select to authenticated using (app.es_miembro(negocio_id));
drop policy if exists cotizacion_escribir on cotizacion;
create policy cotizacion_escribir on cotizacion
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'cobrar'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'cobrar')
              and app.licencia_permite(negocio_id));

drop policy if exists cotizacion_item_leer on cotizacion_item;
create policy cotizacion_item_leer on cotizacion_item
  for select to authenticated using (app.es_miembro(negocio_id));
drop policy if exists cotizacion_item_escribir on cotizacion_item;
create policy cotizacion_item_escribir on cotizacion_item
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'cobrar'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'cobrar')
              and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- EL FOLIO DE COTIZACION — el mismo contador con candado
-- ---------------------------------------------------------------------
create or replace function public.siguiente_folio_cotizacion(p_negocio text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  insert into contador_de_folio (negocio_id, ambito, ultimo)
  values (p_negocio, 'cotizacion',
          coalesce((select max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int)
                    from cotizacion where negocio_id = p_negocio), 0) + 1)
  on conflict (negocio_id, ambito) do update
     set ultimo = contador_de_folio.ultimo + 1
  returning ultimo into v_n;
  return 'C-' || lpad(v_n::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- EL PRECIO DE UN CONCEPTO — resuelto en el SERVIDOR
-- ---------------------------------------------------------------------
--
-- El navegador manda QUE se vende y CUANTO, nunca a que precio. Aceptar el
-- precio del navegador es dejar que el cliente decida cuanto paga.
--
create or replace function app.precio_del_concepto(
  p_negocio text, p_tipo text, p_id uuid, p_hoy date
)
returns table (precio bigint, costo bigint, nombre text)
language plpgsql
stable
as $$
begin
  if p_tipo = 'producto' then
    return query
      select pr.precio_centavos, pr.costo_centavos, pr.nombre
      from producto pr
      where pr.id = p_id and pr.negocio_id = p_negocio and not pr.eliminado and pr.activo;
  elsif p_tipo = 'servicio' then
    return query
      -- La promocion la resuelve la base, no la pantalla: si cada una la
      -- resolviera, el dia que cambie la regla una cobraria de mas.
      select app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                                 s.promocion_desde, s.promocion_hasta, p_hoy),
             null::bigint, s.nombre
      from servicio s
      where s.id = p_id and s.negocio_id = p_negocio and not s.eliminado and s.activo;
  elsif p_tipo = 'curso' then
    return query
      select c.precio_centavos, null::bigint, c.nombre
      from curso c
      where c.id = p_id and c.negocio_id = p_negocio and not c.eliminado and c.activo
        and c.estado <> 'cancelado';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- REGISTRAR UNA VENTA — TODO EN UN SOLO ACTO
-- ---------------------------------------------------------------------
--
-- Esta funcion es el corazon del sistema. Hace, en una sola transaccion:
--
--   1. los porteros y el aislamiento entre centros
--   2. la IDEMPOTENCIA: la misma llave no crea dos ventas
--   3. resuelve el precio de cada concepto EN EL SERVIDOR
--   4. valida el stock de cada producto
--   5. valida el cupo de cada curso
--   6. calcula subtotal, descuento y total — el navegador no decide
--   7. comprueba que los pagos cuadren
--   8. guarda la venta con la FOTO de cada renglon (nombre, precio, costo)
--   9. mueve el inventario, con su movimiento
--  10. inscribe en el curso, si lo hay
--  11. registra los pagos y mete el dinero a la caja
--  12. deja el rastro en la bitacora
--
-- Si algo de eso falla, no queda nada a medias.
--
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

  -- SIN IMPUESTOS CONFIGURADOS, CERO. No se inventan: si el centro los cobra,
  -- se declaran en Configuracion y la cifra sale de ahi.
  v_total := v_subtotal - p_descuento;

  update venta
     set subtotal_centavos = v_subtotal,
         descuento_centavos = p_descuento,
         impuesto_centavos = 0,
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
  for v_pago in select * from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) loop
    v_aplicado := (v_pago ->> 'monto')::bigint;
    if v_aplicado <= 0 then
      raise exception 'Un pago tiene que ser mayor que cero.'
        using errcode = 'invalid_parameter_value';
    end if;
    v_pagado := v_pagado + v_aplicado;

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
                                 descripcion, fecha, metodo, creado_por)
    values (p_negocio, 'ingreso', 'pago', v_pago_id, v_aplicado,
            'Venta ' || v_folio, p_fecha, v_pago ->> 'metodo', auth.uid());
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

comment on function public.registrar_venta is
  'UNA transaccion: valida stock y cupo, calcula los totales EN EL SERVIDOR, guarda la foto de '
  'cada renglon, mueve el inventario, inscribe en el curso, registra los pagos y mete el dinero a '
  'la caja. Pasa entero o no pasa nada. La llave de idempotencia impide que el doble clic cobre '
  'dos veces.';

-- ---------------------------------------------------------------------
-- LAS VENTAS DE UN RANGO
-- ---------------------------------------------------------------------
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
      and (p_busqueda is null or (
            v.folio ilike '%' || p_busqueda || '%'
         or exists (select 1 from cliente c where c.id = v.cliente_id
                     and c.nombre ilike '%' || p_busqueda || '%')
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

-- ---------------------------------------------------------------------
-- LAS CIFRAS DEL DIA
-- ---------------------------------------------------------------------
--
-- CADA CIFRA DICE QUE CUENTA. "Ventas: 5" es transacciones; "Servicios: 3" son
-- unidades de servicio vendidas. Mezclarlas hace que dos personas lean el
-- mismo tablero y entiendan cosas distintas.
--
-- Y SOLO LAS COBRADAS. Una cancelada no es un ingreso; contarla infla el dia y
-- el mes.
--
create or replace function public.resumen_de_ventas(
  p_negocio text, p_dia date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with v as (
    select * from venta
    where negocio_id = p_negocio and fecha = p_dia and estado = 'cobrada' and not eliminado
  ),
  i as (
    select vi.* from venta_item vi join v on v.id = vi.venta_id
  )
  select jsonb_build_object(
    'ventas', (select count(*) from v),
    'totalCentavos', (select coalesce(sum(total_centavos), 0) from v),
    'servicios', (select coalesce(sum(cantidad), 0)::int from i where tipo = 'servicio'),
    'serviciosCentavos', (select coalesce(sum(subtotal_centavos), 0) from i where tipo = 'servicio'),
    'productos', (select coalesce(sum(cantidad), 0)::int from i where tipo = 'producto'),
    'productosCentavos', (select coalesce(sum(subtotal_centavos), 0) from i where tipo = 'producto'),
    'cursos', (select coalesce(sum(cantidad), 0)::int from i where tipo = 'curso'),
    'cursosCentavos', (select coalesce(sum(subtotal_centavos), 0) from i where tipo = 'curso'),
    -- El ticket promedio necesita ventas: sin ellas es `null`, no cero.
    'ticketPromedio', (
      select case when count(*) = 0 then null
                  else round(sum(total_centavos)::numeric / count(*)) end from v
    )
  );
$$;

-- ---------------------------------------------------------------------
-- LA FICHA DE UNA VENTA
-- ---------------------------------------------------------------------
create or replace function public.ficha_de_venta(p_venta uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', v.id, 'folio', v.folio, 'fecha', v.fecha, 'estado', v.estado,
    'clienteId', v.cliente_id,
    'cliente', (select c.nombre from cliente c where c.id = v.cliente_id),
    'clienteTelefono', (select c.telefono from cliente c where c.id = v.cliente_id),
    'vendedorId', v.vendedor_id,
    'vendedor', (select m.nombre from membresia m where m.id = v.vendedor_id),
    'subtotalCentavos', v.subtotal_centavos,
    'descuentoCentavos', v.descuento_centavos,
    'impuestoCentavos', v.impuesto_centavos,
    'totalCentavos', v.total_centavos,
    'efectivoRecibidoCentavos', v.efectivo_recibido_centavos,
    'notas', v.notas,
    'canceladaMotivo', v.cancelada_motivo,
    'creadoEn', v.creado_en,
    'canceladaEn', v.cancelada_en,
    -- Los renglones con su precio HISTORICO, el que se cobro ese dia.
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'tipo', i.tipo, 'descripcion', i.descripcion,
        'cantidad', i.cantidad,
        'precioUnitario', i.precio_unitario_centavos,
        'descuento', i.descuento_centavos,
        'subtotal', i.subtotal_centavos,
        -- El costo solo a quien puede verlo: con el se calcula la utilidad.
        'costoUnitario', case when app.puede_ver_costos(v.negocio_id)
                              then i.costo_unitario_centavos else null end
      ) order by i.id)
      from venta_item i where i.venta_id = v.id
    ), '[]'::jsonb),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'metodo', p.metodo, 'montoCentavos', p.monto_centavos
      ) order by p.creado_en)
      from pago p where p.venta_id = v.id
    ), '[]'::jsonb)
  )
  from venta v
  where v.id = p_venta and not v.eliminado;
$$;

-- ---------------------------------------------------------------------
-- CANCELAR UNA VENTA REGISTRADA
-- ---------------------------------------------------------------------
--
-- `cancelar_venta` ya devuelve el stock con un movimiento contrario y agrega
-- el egreso a caja. Le falta lo de Cursos: una inscripcion pagada con una
-- venta cancelada no puede seguir ocupando lugar.
--
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
  -- venta: el de la venta ocurrio de verdad.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    perform app.mover_inventario(v_item.producto_id, 'devolucion', v_item.cantidad,
                                 'Cancelacion de venta ' || v_venta.folio, 'venta', v_venta.id);
  end loop;

  -- LA INSCRIPCION QUE PAGO ESTA VENTA SE DA DE BAJA: si no, el lugar sigue
  -- ocupado por alguien que ya no pago y el sabado falta una silla. NO se
  -- borra: se cancela, y el rastro de que estuvo inscrita se conserva.
  update inscripcion set estado = 'cancelado'
   where venta_id = p_venta and estado <> 'cancelado';

  -- Y la caja NO se corrige: se le agrega el movimiento contrario.
  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                               descripcion, fecha, creado_por)
  values (v_venta.negocio_id, 'egreso', 'venta', v_venta.id, v_venta.total_centavos,
          'Cancelacion de venta ' || v_venta.folio || coalesce(' — ' || p_motivo, ''),
          current_date, auth.uid());

  update venta set estado = 'cancelada', cancelada_en = now(), cancelada_motivo = p_motivo
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

-- ---------------------------------------------------------------------
-- LAS COTIZACIONES — guardar, listar y convertir
-- ---------------------------------------------------------------------
create or replace function public.guardar_cotizacion(
  p_negocio text,
  p_items jsonb,
  p_cliente uuid default null,
  p_vendedor uuid default null,
  p_descuento bigint default 0,
  p_notas text default null,
  p_vence date default null,
  p_fecha date default current_date
)
returns cotizacion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c        cotizacion;
  v_item     jsonb;
  v_precio   bigint;
  v_costo    bigint;
  v_nombre   text;
  v_cantidad numeric(12,3);
  v_desc     bigint;
  v_sub      bigint;
  v_subtotal bigint := 0;
  v_tipo     text;
  v_id       uuid;
begin
  if not app.tiene_permiso(p_negocio, 'cobrar') then
    raise exception 'No tienes permiso para cotizar.' using errcode = 'insufficient_privilege';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una cotizacion necesita al menos un renglon.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into cotizacion (negocio_id, folio, cliente_id, vendedor_id, fecha, vence, notas)
  values (p_negocio, siguiente_folio_cotizacion(p_negocio), p_cliente, p_vendedor,
          p_fecha, p_vence, p_notas)
  returning * into v_c;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tipo := v_item ->> 'tipo';
    v_id := (v_item ->> 'id')::uuid;
    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 1);
    v_desc := coalesce((v_item ->> 'descuento')::bigint, 0);

    select precio, costo, nombre into v_precio, v_costo, v_nombre
    from app.precio_del_concepto(p_negocio, v_tipo, v_id, p_fecha);
    if v_nombre is null then
      raise exception 'Uno de los conceptos no existe o no es de este centro.'
        using errcode = 'no_data_found';
    end if;

    v_sub := (v_precio * v_cantidad)::bigint - v_desc;
    v_subtotal := v_subtotal + v_sub;

    insert into cotizacion_item (negocio_id, cotizacion_id, tipo,
                                 producto_id, servicio_id, curso_id,
                                 descripcion, cantidad, precio_unitario_centavos,
                                 descuento_centavos, subtotal_centavos)
    values (p_negocio, v_c.id, v_tipo,
            case when v_tipo = 'producto' then v_id end,
            case when v_tipo = 'servicio' then v_id end,
            case when v_tipo = 'curso'    then v_id end,
            v_nombre, v_cantidad, v_precio, v_desc, v_sub);
  end loop;

  update cotizacion
     set subtotal_centavos = v_subtotal,
         descuento_centavos = coalesce(p_descuento, 0),
         total_centavos = v_subtotal - coalesce(p_descuento, 0)
   where id = v_c.id
  returning * into v_c;

  -- UNA COTIZACION NO MUEVE NADA: ni stock, ni caja, ni cupo. Es una
  -- propuesta, no una operacion.
  return v_c;
end;
$$;

comment on function public.guardar_cotizacion is
  'Una cotizacion NO mueve nada: ni stock, ni caja, ni cupo. Es una propuesta. Al convertirla se '
  'vuelve a validar todo, porque entre la propuesta y el si pudo cambiar el precio o acabarse el '
  'producto.';

create or replace function public.cotizaciones_del_centro(
  p_negocio text, p_estado text default null, p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'folio', c.folio, 'fecha', c.fecha, 'vence', c.vence,
    'clienteId', c.cliente_id,
    'cliente', (select cl.nombre from cliente cl where cl.id = c.cliente_id),
    'vendedor', (select m.nombre from membresia m where m.id = c.vendedor_id),
    'totalCentavos', c.total_centavos,
    -- VENCIDA SE DERIVA de la fecha, no se guarda: un estado guardado a mano
    -- se queda viejo el primer lunes que nadie entra al sistema.
    'estado', case when c.estado = 'abierta' and c.vence is not null and c.vence < p_hoy
                   then 'vencida' else c.estado end,
    'ventaId', c.venta_id,
    'renglones', (select count(*) from cotizacion_item i where i.cotizacion_id = c.id)
  ) order by c.creado_en desc), '[]'::jsonb)
  from cotizacion c
  where c.negocio_id = p_negocio and not c.eliminado
    and (p_estado is null or c.estado = p_estado);
$$;

create or replace function public.items_de_cotizacion(p_cotizacion uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo', i.tipo,
    'id', coalesce(i.producto_id, i.servicio_id, i.curso_id),
    'descripcion', i.descripcion,
    'cantidad', i.cantidad,
    'precioUnitario', i.precio_unitario_centavos,
    'descuento', i.descuento_centavos,
    'subtotal', i.subtotal_centavos
  ) order by i.id), '[]'::jsonb)
  from cotizacion_item i where i.cotizacion_id = p_cotizacion;
$$;

create or replace function public.marcar_cotizacion(p_cotizacion uuid, p_estado text)
returns cotizacion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c cotizacion;
begin
  select * into v_c from cotizacion where id = p_cotizacion and not eliminado;
  if v_c.id is null then
    raise exception 'Esa cotizacion no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_c.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso para administrar cotizaciones.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_estado not in ('abierta', 'aceptada', 'cancelada') then
    raise exception 'Ese estado de cotizacion no existe.'
      using errcode = 'invalid_parameter_value';
  end if;
  -- Una cotizacion CONVERTIDA no vuelve atras: ya hay una venta detras.
  if v_c.estado = 'convertida' then
    raise exception 'Esa cotizacion ya se convirtio en la venta.'
      using errcode = 'invalid_parameter_value';
  end if;
  update cotizacion set estado = p_estado where id = p_cotizacion returning * into v_c;
  return v_c;
end;
$$;

create or replace function public.marcar_cotizacion_convertida(p_cotizacion uuid, p_venta uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c cotizacion;
begin
  select * into v_c from cotizacion where id = p_cotizacion;
  if v_c.id is null then return; end if;
  if not app.tiene_permiso(v_c.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso.' using errcode = 'insufficient_privilege';
  end if;
  update cotizacion set estado = 'convertida', venta_id = p_venta where id = p_cotizacion;
end;
$$;

-- ---------------------------------------------------------------------
-- EL CATALOGO VENDIBLE — lo unico que Ventas necesita de los tres modulos
-- ---------------------------------------------------------------------
--
-- UNA SOLA CONSULTA para servicios, productos y cursos. Ventas NO mantiene sus
-- propios catalogos: los pide. Y solo lo VENDIBLE — un producto agotado o un
-- curso lleno no se ofrece, para que el rechazo no llegue al final.
--
create or replace function public.catalogo_vendible(
  p_negocio text, p_busqueda text default null, p_tipo text default null,
  p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x order by x ->> 'nombre'), '[]'::jsonb) from (
    select jsonb_build_object(
      'tipo', 'servicio', 'id', s.id, 'nombre', s.nombre,
      'detalle', s.descripcion,
      'precioCentavos', app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                                            s.promocion_desde, s.promocion_hasta, p_hoy),
      'disponible', null::int, 'codigo', null::text
    ) as x
    from servicio s
    where s.negocio_id = p_negocio and not s.eliminado and s.activo
      and (p_tipo is null or p_tipo = 'servicio')
      and (p_busqueda is null or s.nombre ilike '%' || p_busqueda || '%')

    union all
    select jsonb_build_object(
      'tipo', 'producto', 'id', pr.id, 'nombre', pr.nombre,
      'detalle', pr.descripcion,
      'precioCentavos', pr.precio_centavos,
      -- CUANTO QUEDA, para que la pantalla no ofrezca de mas y el rechazo no
      -- llegue hasta el final.
      'disponible', pr.stock_actual, 'codigo', pr.sku
    )
    from producto pr
    where pr.negocio_id = p_negocio and not pr.eliminado and pr.activo
      and (p_tipo is null or p_tipo = 'producto')
      and (p_busqueda is null or pr.nombre ilike '%' || p_busqueda || '%'
                              or pr.sku ilike '%' || p_busqueda || '%'
                              or pr.codigo_barras ilike '%' || p_busqueda || '%')

    union all
    select jsonb_build_object(
      'tipo', 'curso', 'id', c.id, 'nombre', c.nombre,
      'detalle', c.subtitulo,
      'precioCentavos', c.precio_centavos,
      'disponible', case when c.cupo is null then null
                         else greatest(c.cupo - app.lugares_ocupados(c.id), 0) end,
      'codigo', null::text
    )
    from curso c
    where c.negocio_id = p_negocio and not c.eliminado and c.activo
      and c.estado <> 'cancelado'
      -- Un curso que ya termino no se vende.
      and coalesce(c.fecha_fin, c.fecha_inicio) >= p_hoy
      and (p_tipo is null or p_tipo = 'curso')
      and (p_busqueda is null or c.nombre ilike '%' || p_busqueda || '%')
  ) t;
$$;

comment on function public.catalogo_vendible is
  'Ventas NO mantiene sus propios catalogos: los pide. Y solo lo vendible —un producto agotado o '
  'un curso lleno no se ofrece— para que el rechazo no llegue al final de la captura.';

-- =====================================================================
-- 4 · CAJA
-- =====================================================================

-- =====================================================================
-- CAJA — el cajón, y la diferencia entre dinero y dinero FÍSICO
-- =====================================================================
--
-- LA DISTINCION QUE SOSTIENE TODO EL MODULO, y la que casi nadie hace:
--
--   INGRESO DEL NEGOCIO   toda venta cobrada, con el metodo que sea.
--   EFECTIVO EN EL CAJON  solo lo que se pago en efectivo.
--
-- Una venta de mil pesos con tarjeta es un ingreso de mil pesos y CERO
-- efectivo. Si el sistema las suma juntas, al cerrar el dia el cajon dice que
-- deberia haber seis mil y hay dos mil — y nadie sabe si falto dinero o falto
-- entender el numero. Por eso el corte compara SOLO efectivo, y las demas
-- formas de pago se enseñan aparte.
--
-- LO QUE ES NUEVO AQUI:
--
--   sesion_caja   la caja abierta: quien, cuando, con cuanto empezo, y —al
--                 cerrar— cuanto se esperaba, cuanto se conto y la diferencia.
--
-- Y `movimiento_caja` gana tres columnas: a que sesion pertenece, la
-- categoria de los movimientos capturados a mano, y sus notas.
--
-- LA CAJA SIGUE SIENDO DERIVADA. Ni la sesion ni el movimiento guardan un
-- saldo: el saldo se suma de los movimientos cada vez que se pide. Un saldo
-- guardado se desincroniza —es cuestion de semanas— y cuando lo hace nadie
-- sabe cual de los dos numeros creer.

-- ---------------------------------------------------------------------
-- LA SESION DE CAJA
-- ---------------------------------------------------------------------
create table if not exists sesion_caja (
  id                     uuid primary key default gen_random_uuid(),
  negocio_id             text not null references negocio(id) on delete cascade,
  nombre                 text not null,
  estado                 text not null default 'abierta'
                         check (estado in ('abierta', 'cerrada')),
  saldo_inicial_centavos bigint not null default 0 check (saldo_inicial_centavos >= 0),
  abierta_por            uuid,
  abierta_en             timestamptz not null default now(),
  cerrada_por            uuid,
  cerrada_en             timestamptz,
  -- LO QUE EL SISTEMA DIJO que debia haber en efectivo, congelado al cerrar.
  -- Se congela a proposito: si se recalculara al abrir el historial, un
  -- movimiento agregado despues cambiaria un corte ya firmado.
  esperado_centavos      bigint,
  contado_centavos       bigint,
  diferencia_centavos    bigint,
  observaciones          text,
  notas_cierre           text,
  creado_en              timestamptz not null default now()
);

comment on table sesion_caja is
  'La caja abierta. No guarda saldo: el saldo se suma de los movimientos. Un saldo guardado se '
  'desincroniza y entonces nadie sabe cual de los dos numeros creer. Lo unico que SI se congela es '
  'el corte —esperado, contado y diferencia— porque un corte firmado no puede cambiar despues.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sesion_caja_negocio_id_unico') then
    alter table sesion_caja add constraint sesion_caja_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

-- UNA SOLA CAJA ABIERTA POR CENTRO, y lo garantiza la base.
--
-- Con dos abiertas, cada venta tendria que elegir a cual va y la primera vez
-- que alguien elija mal el corte no cuadra. Comprobarlo en la pantalla no
-- sirve: dos personas abriendo caja a la vez pasan las dos comprobaciones.
create unique index if not exists sesion_caja_una_abierta
  on sesion_caja (negocio_id) where estado = 'abierta';

create index if not exists sesion_caja_historial_idx
  on sesion_caja (negocio_id, abierta_en desc);

alter table sesion_caja drop constraint if exists sesion_caja_abre_mismo_negocio;
alter table sesion_caja add constraint sesion_caja_abre_mismo_negocio
  foreign key (negocio_id, abierta_por) references membresia (negocio_id, id)
  on delete set null (abierta_por);

alter table sesion_caja drop constraint if exists sesion_caja_cierra_mismo_negocio;
alter table sesion_caja add constraint sesion_caja_cierra_mismo_negocio
  foreign key (negocio_id, cerrada_por) references membresia (negocio_id, id)
  on delete set null (cerrada_por);

-- ---------------------------------------------------------------------
-- LO QUE LE FALTABA AL MOVIMIENTO
-- ---------------------------------------------------------------------
-- A QUE CAJA pertenece. Nulo en los movimientos de antes de este bloque y en
-- los que ocurren sin caja abierta: esos existen —son ingresos del negocio—
-- pero no cuentan para ningun corte.
alter table movimiento_caja add column if not exists sesion_id uuid;
-- La categoria SOLO de los movimientos capturados a mano. La de una venta se
-- deduce de lo que se vendio y la de un gasto sale del gasto: copiarlas aqui
-- las dejaria viejas el dia que cambien.
alter table movimiento_caja add column if not exists categoria text;
alter table movimiento_caja add column if not exists notas text;

alter table movimiento_caja drop constraint if exists movimiento_caja_sesion_mismo_negocio;
alter table movimiento_caja add constraint movimiento_caja_sesion_mismo_negocio
  foreign key (negocio_id, sesion_id) references sesion_caja (negocio_id, id)
  on delete set null (sesion_id);

create index if not exists movimiento_caja_sesion_idx on movimiento_caja (sesion_id);

alter table sesion_caja enable row level security;
alter table sesion_caja force row level security;
revoke all on sesion_caja from anon;
grant select, insert, update on sesion_caja to authenticated;

-- UNA CAJA NO SE BORRA. Es el respaldo de un corte firmado.
revoke delete on sesion_caja from authenticated, anon, service_role;

drop policy if exists sesion_caja_leer on sesion_caja;
create policy sesion_caja_leer on sesion_caja
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists sesion_caja_abrir on sesion_caja;
create policy sesion_caja_abrir on sesion_caja
  for insert to authenticated
  with check (app.es_miembro(negocio_id)
              and app.tiene_permiso(negocio_id, 'verFinanzas')
              and app.licencia_permite(negocio_id));

-- UNA CAJA CERRADA NO SE VUELVE A TOCAR. El `using` lo impide en la base, no
-- en la pantalla: reabrir un corte firmado para "arreglar" un faltante es
-- exactamente lo que un registro financiero tiene que hacer imposible.
drop policy if exists sesion_caja_cerrar on sesion_caja;
create policy sesion_caja_cerrar on sesion_caja
  for update to authenticated
  using (app.es_miembro(negocio_id)
         and app.tiene_permiso(negocio_id, 'verFinanzas')
         and estado = 'abierta')
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

-- ---------------------------------------------------------------------
-- QUIEN PUEDE METER UN MOVIMIENTO A MANO
-- ---------------------------------------------------------------------
--
-- LA REGLA DE ANTES ERA `origen = 'ajuste'` A SECAS, y dependia de que el rol
-- dueño de la base se saltara las reglas de fila para que las funciones
-- pudieran escribir los movimientos de venta y de gasto. Eso funciona en
-- Postgres local y en Supabase, pero es una suposicion sobre la instalacion —
-- y si un dia deja de cumplirse, cobrar deja de meter el dinero a la caja.
--
-- Ahora la regla dice lo mismo pero sin depender de eso: se puede escribir un
-- movimiento de venta o de gasto SOLO si la operacion existe de verdad y es
-- de este centro. Sigue siendo imposible capturar un ingreso suelto, y el
-- indice unico sigue impidiendo meter el mismo dinero dos veces.
drop policy if exists caja_ajuste on movimiento_caja;
create policy caja_ajuste on movimiento_caja
  for insert to authenticated
  with check (
    app.es_miembro(negocio_id)
    and app.tiene_permiso(negocio_id, 'verFinanzas')
    and app.licencia_permite(negocio_id)
    and (
      -- Lo unico que se captura a mano: un ajuste, sin operacion detras y
      -- marcado como tal.
      (origen = 'ajuste' and referencia_id is null)
      -- Y lo que escriben las funciones, siempre contra algo que existe.
      or (origen = 'pago' and exists (
            select 1 from pago p join venta v on v.id = p.venta_id
             where p.id = referencia_id and v.negocio_id = movimiento_caja.negocio_id))
      or (origen = 'venta' and exists (
            select 1 from venta v
             where v.id = referencia_id and v.negocio_id = movimiento_caja.negocio_id))
      or (origen = 'gasto' and exists (
            select 1 from gasto g
             where g.id = referencia_id and g.negocio_id = movimiento_caja.negocio_id))
    )
  );

-- ---------------------------------------------------------------------
-- EL GASTO TAMBIEN TIENE FORMA DE PAGO
-- ---------------------------------------------------------------------
--
-- Sin esta columna, pagar la renta por transferencia bajaba el efectivo del
-- cajon — y al cerrar faltaba justo la renta.
alter table gasto add column if not exists metodo text not null default 'efectivo';
alter table gasto add column if not exists notas text;

-- ---------------------------------------------------------------------
-- LA CAJA ABIERTA DE UN CENTRO
-- ---------------------------------------------------------------------
create or replace function app.caja_abierta(p_negocio text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from sesion_caja where negocio_id = p_negocio and estado = 'abierta' limit 1;
$$;

-- ---------------------------------------------------------------------
-- EL EFECTIVO QUE DEBERIA HABER EN UNA CAJA
-- ---------------------------------------------------------------------
--
-- SOLO EFECTIVO. Una venta con tarjeta es un ingreso del negocio y cero
-- efectivo: sumarla aqui haria que el corte pidiera contar dinero que nunca
-- estuvo en el cajon.
--
-- El `coalesce(metodo, 'efectivo')` es por los movimientos de antes de
-- Ventas, que no llevaban metodo. Tratarlos como efectivo es lo conservador:
-- un gasto viejo salio del cajon, y darlo por tarjeta inflaria el esperado.
create or replace function app.efectivo_de_la_caja(p_sesion uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select saldo_inicial_centavos from sesion_caja where id = p_sesion), 0)
       + coalesce((
           select sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end)
           from movimiento_caja
           where sesion_id = p_sesion and coalesce(metodo, 'efectivo') = 'efectivo'
         ), 0);
$$;

comment on function app.efectivo_de_la_caja is
  'Lo que DEBERIA haber en el cajon: saldo inicial mas los ingresos en efectivo menos los egresos '
  'en efectivo. La tarjeta y la transferencia son ingresos del negocio y CERO efectivo — sumarlas '
  'haria que el corte pidiera contar dinero que nunca estuvo ahi.';

-- ---------------------------------------------------------------------
-- COMO SE LEE UN MOVIMIENTO
-- ---------------------------------------------------------------------
--
-- El TIPO que ve la persona no es la columna `tipo` —que solo dice si entra o
-- sale— sino la combinacion de origen y direccion. Se deduce al leer en vez de
-- guardarse: guardado seria un cuarto dato que puede contradecir a los otros
-- tres.
create or replace function app.clase_de_movimiento(p_origen text, p_tipo text)
returns text
language sql
immutable
as $$
  select case
    when p_origen = 'pago'                          then 'venta'
    when p_origen = 'venta'  and p_tipo = 'ingreso' then 'venta'
    when p_origen = 'venta'  and p_tipo = 'egreso'  then 'cancelacion'
    when p_origen = 'gasto'  and p_tipo = 'egreso'  then 'gasto'
    when p_origen = 'gasto'  and p_tipo = 'ingreso' then 'devolucion'
    when p_origen = 'ajuste' and p_tipo = 'ingreso' then 'ingreso'
    when p_origen = 'ajuste' and p_tipo = 'egreso'  then 'retiro'
    else p_tipo
  end;
$$;

-- LA CATEGORIA SE RESUELVE AL LEER, no se copia.
--
-- La de una venta sale de lo que se vendio; la de un gasto, del gasto. Copiar
-- cualquiera de las dos al movimiento las dejaria viejas el dia que cambien —
-- y ademas obligaria a recalcularlas en cada venta.
create or replace function app.categoria_del_movimiento(
  p_origen text, p_referencia uuid, p_categoria text
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta uuid;
  v_cats  text;
begin
  if p_origen = 'ajuste' then
    return p_categoria;
  end if;

  if p_origen = 'gasto' then
    return (select g.categoria from gasto g where g.id = p_referencia);
  end if;

  -- Un movimiento de pago apunta al PAGO; hay que subir hasta la venta.
  if p_origen = 'pago' then
    select p.venta_id into v_venta from pago p where p.id = p_referencia;
  else
    v_venta := p_referencia;
  end if;
  if v_venta is null then return null; end if;

  select string_agg(distinct
           case i.tipo when 'servicio' then 'Servicios'
                       when 'producto' then 'Productos'
                       when 'curso'    then 'Cursos' end, ' / ')
    into v_cats
    from venta_item i where i.venta_id = v_venta;
  return v_cats;
end;
$$;

-- ---------------------------------------------------------------------
-- ABRIR CAJA
-- ---------------------------------------------------------------------
create or replace function public.abrir_caja(
  p_negocio text,
  p_nombre text,
  p_saldo_inicial bigint default 0,
  p_observaciones text default null
)
returns sesion_caja
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s     sesion_caja;
  v_quien membresia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'verFinanzas') then
    raise exception 'No tienes permiso para abrir la caja.' using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite abrir caja.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_saldo_inicial, 0) < 0 then
    raise exception 'El saldo inicial no puede ser negativo.'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'La caja necesita un nombre para distinguirla en el historial.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- El indice unico ya lo impide; el mensaje esta aqui para que quien lo lea
  -- entienda que pasa en vez de recibir un error de indice.
  if app.caja_abierta(p_negocio) is not null then
    raise exception 'Ya hay una caja abierta. Cierrala antes de abrir otra.'
      using errcode = 'unique_violation';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into sesion_caja (negocio_id, nombre, saldo_inicial_centavos, abierta_por, observaciones)
  values (p_negocio, trim(p_nombre), coalesce(p_saldo_inicial, 0), v_quien.id, p_observaciones)
  returning * into v_s;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'caja', 'abrir', v_s.id::text, null,
          jsonb_build_object('nombre', v_s.nombre, 'saldoInicial', v_s.saldo_inicial_centavos));

  return v_s;
end;
$$;

-- ---------------------------------------------------------------------
-- CERRAR CAJA — el corte
-- ---------------------------------------------------------------------
--
-- El esperado se CONGELA aqui. Si se recalculara cada vez que alguien abre el
-- historial, un movimiento agregado despues cambiaria un corte ya firmado — y
-- un corte que cambia solo no sirve para explicarle a nadie un faltante.
create or replace function public.cerrar_caja(
  p_sesion uuid,
  p_contado bigint,
  p_notas text default null
)
returns sesion_caja
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s        sesion_caja;
  v_esperado bigint;
  v_quien    membresia;
begin
  select * into v_s from sesion_caja where id = p_sesion for update;
  if v_s.id is null then
    raise exception 'Esa caja no existe.' using errcode = 'no_data_found';
  end if;
  if not app.es_miembro(v_s.negocio_id) then
    raise exception 'Esa caja no es de tu centro.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_s.negocio_id, 'verFinanzas') then
    raise exception 'No tienes permiso para cerrar la caja.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_s.estado <> 'abierta' then
    raise exception 'Esa caja ya se cerro el %.', to_char(v_s.cerrada_en, 'DD/MM/YYYY HH24:MI')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_contado is null or p_contado < 0 then
    raise exception 'Hay que decir cuanto efectivo se conto. Si el cajon quedo vacio, es cero.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_esperado := app.efectivo_de_la_caja(p_sesion);

  select * into v_quien from membresia
   where negocio_id = v_s.negocio_id and usuario_id = auth.uid() limit 1;

  update sesion_caja
     set estado = 'cerrada',
         cerrada_en = now(),
         cerrada_por = v_quien.id,
         esperado_centavos = v_esperado,
         contado_centavos = p_contado,
         -- Positivo sobra, negativo falta. Se guarda con signo: "diferencia de
         -- 200" sin signo no dice si el dia salio bien o mal.
         diferencia_centavos = p_contado - v_esperado,
         notas_cierre = p_notas
   where id = p_sesion
  returning * into v_s;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (v_s.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'caja', 'cerrar', v_s.id::text, null,
          jsonb_build_object('esperado', v_esperado, 'contado', p_contado,
                             'diferencia', v_s.diferencia_centavos));

  return v_s;
end;
$$;

-- ---------------------------------------------------------------------
-- REGISTRAR UN INGRESO O UN RETIRO A MANO
-- ---------------------------------------------------------------------
create or replace function public.registrar_movimiento_de_caja(
  p_negocio text,
  p_tipo text,
  p_monto bigint,
  p_concepto text,
  p_metodo text default 'efectivo',
  p_categoria text default null,
  p_notas text default null
)
returns movimiento_caja
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m      movimiento_caja;
  v_sesion uuid;
  v_hay    bigint;
  v_quien  membresia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'verFinanzas') then
    raise exception 'No tienes permiso para mover la caja.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite mover la caja.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_tipo not in ('ingreso', 'egreso') then
    raise exception 'Un movimiento entra o sale; no hay tercera opcion.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(trim(p_concepto), '') = '' then
    raise exception 'Escribe de que es el movimiento. Dentro de seis meses es lo unico que lo explica.'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_metodo, 'efectivo') not in ('efectivo', 'tarjeta', 'transferencia', 'otro') then
    raise exception 'Esa forma de pago no existe.' using errcode = 'invalid_parameter_value';
  end if;

  v_sesion := app.caja_abierta(p_negocio);

  -- SIN CAJA ABIERTA NO SE MUEVE EFECTIVO. El dinero fisico sale de un cajon;
  -- si no hay cajon abierto, no hay de donde sacarlo ni donde meterlo, y el
  -- movimiento quedaria fuera de todos los cortes.
  if coalesce(p_metodo, 'efectivo') = 'efectivo' and v_sesion is null then
    raise exception 'No hay una caja abierta. Abre una antes de mover efectivo.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- NO SE RETIRA MAS EFECTIVO DEL QUE HAY. Un cajon en negativo no es un dato:
  -- es la prueba de que el sistema dejo sacar lo que no estaba.
  if p_tipo = 'egreso' and coalesce(p_metodo, 'efectivo') = 'efectivo' then
    v_hay := app.efectivo_de_la_caja(v_sesion);
    if p_monto > v_hay then
      raise exception 'En la caja hay $%, no se pueden retirar $%.',
        to_char(v_hay::numeric / 100, 'FM999999990.00'),
        to_char(p_monto::numeric / 100, 'FM999999990.00')
        using errcode = 'check_violation';
    end if;
  end if;

  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                               descripcion, fecha, metodo, categoria, notas, sesion_id, creado_por)
  values (p_negocio, p_tipo, 'ajuste', null, p_monto,
          trim(p_concepto), current_date, coalesce(p_metodo, 'efectivo'),
          nullif(trim(coalesce(p_categoria, '')), ''), p_notas, v_sesion, auth.uid())
  returning * into v_m;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'caja', p_tipo, v_m.id::text, null,
          jsonb_build_object('monto', p_monto, 'metodo', v_m.metodo, 'concepto', v_m.descripcion));

  return v_m;
end;
$$;

-- ---------------------------------------------------------------------
-- LA CAJA ACTUAL, CON SUS CIFRAS
-- ---------------------------------------------------------------------
--
-- Todo de un viaje: la sesion, lo que entro, lo que salio, el efectivo
-- esperado y el desglose por forma de pago. Sin esto la pantalla haria cinco
-- consultas y cada una podria contestar de un momento distinto.
create or replace function public.caja_actual(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case when s.id is null then null else jsonb_build_object(
    'id', s.id,
    'nombre', s.nombre,
    'estado', s.estado,
    'saldoInicialCentavos', s.saldo_inicial_centavos,
    'abiertaEn', s.abierta_en,
    'abiertaPor', (select m.nombre from membresia m where m.id = s.abierta_por),
    'observaciones', s.observaciones,
    -- TODO lo que entro y salio, con cualquier forma de pago. Es el movimiento
    -- del negocio.
    'ingresosCentavos', coalesce((select sum(monto_centavos) from movimiento_caja
                                   where sesion_id = s.id and tipo = 'ingreso'), 0),
    'egresosCentavos', coalesce((select sum(monto_centavos) from movimiento_caja
                                   where sesion_id = s.id and tipo = 'egreso'), 0),
    -- Y SOLO EL EFECTIVO, que es lo unico que se cuenta en el cajon.
    'efectivoEntroCentavos', coalesce((select sum(monto_centavos) from movimiento_caja
                                   where sesion_id = s.id and tipo = 'ingreso'
                                     and coalesce(metodo, 'efectivo') = 'efectivo'), 0),
    'efectivoSalioCentavos', coalesce((select sum(monto_centavos) from movimiento_caja
                                   where sesion_id = s.id and tipo = 'egreso'
                                     and coalesce(metodo, 'efectivo') = 'efectivo'), 0),
    'efectivoEsperadoCentavos', app.efectivo_de_la_caja(s.id),
    'movimientos', (select count(*) from movimiento_caja where sesion_id = s.id)
  ) end
  from (select * from sesion_caja
         where negocio_id = p_negocio and estado = 'abierta' limit 1) s;
$$;

-- ---------------------------------------------------------------------
-- EL RESUMEN DE UNA CAJA — formas de pago y movimientos por clase
-- ---------------------------------------------------------------------
create or replace function public.resumen_de_caja(p_sesion uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with m as (
    select mc.*, app.clase_de_movimiento(mc.origen, mc.tipo) as clase
    from movimiento_caja mc where mc.sesion_id = p_sesion
  ),
  -- Las formas de pago se cuentan sobre lo que ENTRO. Mezclar entradas y
  -- salidas en el mismo pastel da porcentajes que no significan nada.
  entradas as (select * from m where tipo = 'ingreso')
  select jsonb_build_object(
    'totalEntradasCentavos', coalesce((select sum(monto_centavos) from entradas), 0),
    'metodos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'metodo', t.metodo, 'centavos', t.centavos, 'movimientos', t.n
      ) order by t.centavos desc)
      from (
        select coalesce(metodo, 'efectivo') as metodo,
               sum(monto_centavos) as centavos, count(*) as n
        from entradas group by 1
      ) t
    ), '[]'::jsonb),
    'clases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clase', t.clase, 'movimientos', t.n, 'centavos', t.centavos
      ) order by t.clase)
      from (
        select clase, count(*) as n,
               sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end) as centavos
        from m group by clase
      ) t
    ), '[]'::jsonb),
    'movimientos', (select count(*) from m),
    'netoCentavos', coalesce((
      select sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end) from m
    ), 0)
  );
$$;

-- ---------------------------------------------------------------------
-- LOS MOVIMIENTOS, FILTRADOS Y PAGINADOS
-- ---------------------------------------------------------------------
create or replace function public.movimientos_de_caja(
  p_negocio text,
  p_sesion uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_busqueda text default null,
  p_clase text default null,
  p_metodo text default null,
  p_usuario uuid default null,
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
    select mc.*,
      app.clase_de_movimiento(mc.origen, mc.tipo) as clase,
      app.categoria_del_movimiento(mc.origen, mc.referencia_id, mc.categoria) as categoria_leida,
      (select m.nombre from membresia m
        where m.negocio_id = mc.negocio_id and m.usuario_id = mc.creado_por) as usuario,
      -- LA VENTA DE LA QUE SALIO, para poder navegar movimiento → venta → cliente.
      case when mc.origen = 'pago'
             then (select p.venta_id from pago p where p.id = mc.referencia_id)
           when mc.origen = 'venta' then mc.referencia_id end as venta_id
    from movimiento_caja mc
    where mc.negocio_id = p_negocio
      and (p_sesion is null or mc.sesion_id = p_sesion)
      and (p_desde is null or mc.fecha >= p_desde)
      and (p_hasta is null or mc.fecha <= p_hasta)
      and (p_metodo is null or coalesce(mc.metodo, 'efectivo') = p_metodo)
      and (p_usuario is null or mc.creado_por = p_usuario)
      and (p_clase is null or app.clase_de_movimiento(mc.origen, mc.tipo) = p_clase)
      and (p_busqueda is null or mc.descripcion ilike '%' || p_busqueda || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'filas', coalesce((
      select jsonb_agg(t.x order by t.orden desc)
      from (
        select jsonb_build_object(
          'id', b.id,
          'fecha', b.fecha,
          'creadoEn', b.creado_en,
          'clase', b.clase,
          'tipo', b.tipo,
          'concepto', b.descripcion,
          'metodo', coalesce(b.metodo, 'efectivo'),
          'categoria', b.categoria_leida,
          'montoCentavos', b.monto_centavos,
          'usuario', b.usuario,
          'notas', b.notas,
          'ventaId', b.venta_id,
          'sesionId', b.sesion_id
        ) as x, b.creado_en as orden
        from base b
        order by b.creado_en desc
        limit greatest(p_por_pagina, 1)
        offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)
      ) t
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- EL HISTORIAL DE CAJAS
-- ---------------------------------------------------------------------
--
-- El esperado de una caja CERRADA sale de lo que se congelo al cortar; el de
-- una abierta se calcula al vuelo. Recalcular el de una cerrada haria que un
-- corte firmado cambiara solo.
create or replace function public.historial_de_cajas(
  p_negocio text, p_pagina int default 1, p_por_pagina int default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select s.*,
      (select m.nombre from membresia m where m.id = s.abierta_por) as abrio,
      (select m.nombre from membresia m where m.id = s.cerrada_por) as cerro,
      coalesce((select sum(monto_centavos) from movimiento_caja
                 where sesion_id = s.id and tipo = 'ingreso'), 0) as ingresos,
      coalesce((select sum(monto_centavos) from movimiento_caja
                 where sesion_id = s.id and tipo = 'egreso'), 0) as egresos,
      (select count(*) from movimiento_caja where sesion_id = s.id) as movimientos
    from sesion_caja s
    where s.negocio_id = p_negocio
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'filas', coalesce((
      select jsonb_agg(t.x order by t.orden desc)
      from (
        select jsonb_build_object(
          'id', b.id, 'nombre', b.nombre, 'estado', b.estado,
          'abiertaEn', b.abierta_en, 'cerradaEn', b.cerrada_en,
          'abiertaPor', b.abrio, 'cerradaPor', b.cerro,
          'saldoInicialCentavos', b.saldo_inicial_centavos,
          'ingresosCentavos', b.ingresos,
          'egresosCentavos', b.egresos,
          'esperadoCentavos', coalesce(b.esperado_centavos, app.efectivo_de_la_caja(b.id)),
          'contadoCentavos', b.contado_centavos,
          'diferenciaCentavos', b.diferencia_centavos,
          'movimientos', b.movimientos,
          'observaciones', b.observaciones,
          'notasCierre', b.notas_cierre
        ) as x, b.abierta_en as orden
        from base b
        order by b.abierta_en desc
        limit greatest(p_por_pagina, 1)
        offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)
      ) t
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- EL REPORTE DE CAJA — de un periodo, no de una sesion
-- ---------------------------------------------------------------------
create or replace function public.reporte_de_caja(
  p_negocio text,
  p_desde date,
  p_hasta date,
  p_sesion uuid default null,
  p_usuario uuid default null,
  p_metodo text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with m as (
    select mc.*, app.clase_de_movimiento(mc.origen, mc.tipo) as clase
    from movimiento_caja mc
    where mc.negocio_id = p_negocio
      and mc.fecha between p_desde and p_hasta
      and (p_sesion is null or mc.sesion_id = p_sesion)
      and (p_usuario is null or mc.creado_por = p_usuario)
      and (p_metodo is null or coalesce(mc.metodo, 'efectivo') = p_metodo)
  )
  select jsonb_build_object(
    'ingresosCentavos', coalesce((select sum(monto_centavos) from m where tipo = 'ingreso'), 0),
    'egresosCentavos', coalesce((select sum(monto_centavos) from m where tipo = 'egreso'), 0),
    'movimientos', (select count(*) from m),
    'porMetodo', coalesce((
      select jsonb_agg(jsonb_build_object('metodo', t.metodo, 'centavos', t.c, 'movimientos', t.n)
                       order by t.c desc)
      from (select coalesce(metodo, 'efectivo') as metodo,
                   sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end) as c,
                   count(*) as n
              from m group by 1) t
    ), '[]'::jsonb),
    'porClase', coalesce((
      select jsonb_agg(jsonb_build_object('clase', t.clase, 'centavos', t.c, 'movimientos', t.n)
                       order by t.clase)
      from (select clase,
                   sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end) as c,
                   count(*) as n
              from m group by 1) t
    ), '[]'::jsonb),
    'porUsuario', coalesce((
      select jsonb_agg(jsonb_build_object('usuario', t.quien, 'centavos', t.c, 'movimientos', t.n)
                       order by t.n desc)
      from (select coalesce((select mb.nombre from membresia mb
                              where mb.negocio_id = p_negocio and mb.usuario_id = m.creado_por),
                            'Sin usuario') as quien,
                   sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end) as c,
                   count(*) as n
              from m group by 1) t
    ), '[]'::jsonb),
    -- Las diferencias salen de los CORTES del periodo, no de los movimientos.
    'cortes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nombre', s.nombre, 'cerradaEn', s.cerrada_en,
        'esperadoCentavos', s.esperado_centavos, 'contadoCentavos', s.contado_centavos,
        'diferenciaCentavos', s.diferencia_centavos
      ) order by s.cerrada_en desc)
      from sesion_caja s
      where s.negocio_id = p_negocio and s.estado = 'cerrada'
        and s.cerrada_en::date between p_desde and p_hasta
        and (p_sesion is null or s.id = p_sesion)
    ), '[]'::jsonb)
  );
$$;

comment on function public.reporte_de_caja is
  'La fuente que Reportes consulta para todo lo de caja. No duplica nada: suma los movimientos que '
  'ya existen y los cortes ya firmados.';


-- =====================================================================
-- LO QUE CAMBIA EN VENTAS Y EN GASTOS
-- =====================================================================
--
-- Las tres funciones que ya existian y ahora saben de la caja. Van DESPUES
-- de crear `sesion_caja` porque la consultan.

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

  -- SIN IMPUESTOS CONFIGURADOS, CERO. No se inventan: si el centro los cobra,
  -- se declaran en Configuracion y la cifra sale de ahi.
  v_total := v_subtotal - p_descuento;

  update venta
     set subtotal_centavos = v_subtotal,
         descuento_centavos = p_descuento,
         impuesto_centavos = 0,
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

create or replace function public.cancelar_venta(p_venta uuid, p_motivo text default null)
returns venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta  venta;
  v_item   record;
  v_pago   record;
  v_sesion uuid;
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
  -- venta: el de la venta ocurrio de verdad.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    perform app.mover_inventario(v_item.producto_id, 'devolucion', v_item.cantidad,
                                 'Cancelacion de venta ' || v_venta.folio, 'venta', v_venta.id);
  end loop;

  -- LA INSCRIPCION QUE PAGO ESTA VENTA SE DA DE BAJA: si no, el lugar sigue
  -- ocupado por alguien que ya no pago y el sabado falta una silla. NO se
  -- borra: se cancela, y el rastro de que estuvo inscrita se conserva.
  update inscripcion set estado = 'cancelado'
   where venta_id = p_venta and estado <> 'cancelado';

  -- Y LA CAJA NO SE CORRIGE: se le agrega el movimiento contrario, UNO POR
  -- PAGO y con la misma forma de pago. Devolver en efectivo lo que se cobro
  -- con tarjeta sacaria del cajon dinero que nunca estuvo ahi.
  for v_pago in
    select id, metodo, monto_centavos from pago where venta_id = p_venta
  loop
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                 descripcion, fecha, metodo, sesion_id, creado_por)
    values (v_venta.negocio_id, 'egreso', 'pago', v_pago.id, v_pago.monto_centavos,
            'Cancelacion de venta ' || v_venta.folio || coalesce(' — ' || p_motivo, ''),
            current_date, v_pago.metodo,
            case when v_pago.metodo = 'efectivo' then v_sesion else app.caja_abierta(v_venta.negocio_id) end,
            auth.uid());
  end loop;

  -- Una venta SIN pagos —no puede pasar por `registrar_venta`, pero si por la
  -- ruta vieja `cobrar_venta`— deja igualmente su egreso, para que la caja no
  -- se quede con un ingreso sin contrapartida.
  if not exists (select 1 from pago where venta_id = p_venta) then
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                 descripcion, fecha, sesion_id, creado_por)
    values (v_venta.negocio_id, 'egreso', 'venta', v_venta.id, v_venta.total_centavos,
            'Cancelacion de venta ' || v_venta.folio || coalesce(' — ' || p_motivo, ''),
            current_date, v_sesion, auth.uid());
  end if;

  update venta set estado = 'cancelada', cancelada_en = now(), cancelada_motivo = p_motivo
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

create or replace function app.gasto_a_caja()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_metodo text;
  v_sesion uuid;
begin
  -- LA FORMA DE PAGO DECIDE SI TOCA EL CAJON. La renta pagada por
  -- transferencia es un egreso del negocio y CERO efectivo: sin esta
  -- distincion, al cerrar el dia faltaba justo la renta y nadie sabia si era
  -- un faltante de verdad.
  --
  -- El `coalesce` es por los gastos capturados antes de que existiera la
  -- columna: darlos por efectivo es lo conservador — ese dinero salio del
  -- cajon.
  v_metodo := coalesce(new.metodo, 'efectivo');
  v_sesion := app.caja_abierta(new.negocio_id);

  if tg_op = 'INSERT' then
    if v_metodo = 'efectivo' and v_sesion is null then
      raise exception 'No hay una caja abierta: no se puede pagar en efectivo. Abre la caja en el modulo Caja.'
        using errcode = 'invalid_parameter_value';
    end if;
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                 descripcion, fecha, metodo, sesion_id, creado_por)
    values (new.negocio_id, 'egreso', 'gasto', new.id, new.monto_centavos, new.descripcion,
            new.fecha, v_metodo, v_sesion, new.creado_por);
    return new;
  end if;

  -- Un gasto capturado por error se marca como eliminado; la caja recibe el
  -- ingreso contrario, por la MISMA via. Igual que con las ventas: nada se
  -- tacha.
  if tg_op = 'UPDATE' and new.eliminado and not old.eliminado then
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                 descripcion, fecha, metodo, sesion_id, creado_por)
    values (new.negocio_id, 'ingreso', 'gasto', new.id, old.monto_centavos,
            'Se anulo el gasto: ' || old.descripcion, current_date,
            coalesce(old.metodo, 'efectivo'), v_sesion, auth.uid());
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


-- =====================================================================
-- LISTO. Si no salio ningun error en rojo, la base ya tiene todo lo que
-- necesitan Productos, Ventas y Caja: el inventario deja rastro, el cobro
-- pasa entero o no pasa, un doble clic no cobra dos veces, y el corte de
-- caja cuenta el efectivo — no la tarjeta.
--
-- LO PRIMERO QUE HAY QUE HACER DESPUES: entra a Caja y abre una. Sin caja
-- abierta no se puede cobrar en efectivo.
-- =====================================================================
