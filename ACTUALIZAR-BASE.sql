-- =====================================================================
-- ACTUALIZAR-BASE.sql — SOLO LO NUEVO
-- =====================================================================
--
-- Pegar en Supabase -> SQL Editor -> Run.
--
-- Es seguro correrlo las veces que haga falta: no borra datos, no reescribe
-- filas, y todo va con `if not exists` o `create or replace`.
--
-- QUE TRAE: el modulo GASTOS completo.
--
-- Sin correr esto, la pantalla de Gastos se publica y sale con un error que
-- no dice nada util: el navegador pediria funciones que la base todavia no
-- tiene.
--
-- LO QUE YA EXISTIA Y NO SE TOCA: la tabla `gasto` con sus datos, su
-- disparador a caja, `categoria`, `proveedor` y `movimiento_caja`. Este
-- archivo los COMPLETA.
--
-- LO QUE AGREGA:
--
--   · Las categorias de gasto se suman a la tabla `categoria` que ya servia a
--     servicios, cursos y productos — mismo sitio, distinto ambito.
--   · `gasto` gana: detalle, categoria_id, proveedor_id, referencia,
--     efectivo_centavos, metodo_resto, la cadena de correcciones y el rastro
--     de quien anulo, cuando y por que.
--   · `gasto_recurrente`: la plantilla de la renta mensual, con sus reglas de
--     acceso por fila encendidas y forzadas.
--   · Ocho funciones: registrar, editar, anular, guardar y marcar recurrentes,
--     generarlos, listarlos y el resumen del periodo.
--
-- LAS TRES DECISIONES QUE MANDAN:
--
--   1. EL EFECTIVO SE GUARDA APARTE DEL MONTO. Un gasto mixto de $1,000 con
--      $300 en efectivo saca $300 del cajon, no $1,000.
--   2. EDITAR ANULA Y ENCADENA. La caja es un libro que se escribe y no se
--      corrige, y su indice unico solo deja un egreso por gasto.
--   3. GENERAR RECURRENTES ES IDEMPOTENTE. `(recurrente_id, periodo)` es un
--      indice unico: correrlo diez veces crea el gasto de agosto UNA vez.
--
-- Los gastos que ya estuvieran capturados se rellenan solos: los de efectivo
-- quedan con su monto en `efectivo_centavos` —que es justo lo que su
-- movimiento de caja ya dice— y los demas en cero.

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
create or replace function app.gasto_a_caja()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_efectivo bigint;
  v_resto    bigint;
  v_sesion   uuid;
begin
  -- El `coalesce` es por los gastos capturados antes de que existiera la
  -- columna: darlos por efectivo es lo conservador — ese dinero salio del
  -- cajon.
  v_efectivo := coalesce(new.efectivo_centavos,
                         case when coalesce(new.metodo, 'efectivo') = 'efectivo'
                              then new.monto_centavos else 0 end);
  v_resto := new.monto_centavos - v_efectivo;
  v_sesion := app.caja_abierta(new.negocio_id);

  if tg_op = 'INSERT' then
    /*
     * DOS RENGLONES COMO MUCHO, y cada uno con SU forma de pago.
     *
     * El de efectivo es el unico que baja el cajon. El del resto existe igual
     * —aunque sea de tarjeta— porque es un EGRESO DEL NEGOCIO: sin el, la
     * renta pagada por transferencia desapareceria del total de egresos y el
     * dueño veria que gasto menos de lo que gasto.
     */
    if v_efectivo > 0 then
      -- SOLO EL EFECTIVO EXIGE CAJA ABIERTA. La transferencia no toca el
      -- cajon, asi que pedirla seria bloquear por nada.
      if v_sesion is null then
        raise exception 'No hay una caja abierta: no se puede pagar en efectivo. Abre la caja en el modulo Caja.'
          using errcode = 'invalid_parameter_value';
      end if;
      insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                   descripcion, fecha, metodo, sesion_id, creado_por)
      values (new.negocio_id, 'egreso', 'gasto', new.id, v_efectivo, new.descripcion,
              new.fecha, 'efectivo', v_sesion, new.creado_por);
    end if;

    if v_resto > 0 then
      insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                   descripcion, fecha, metodo, sesion_id, creado_por)
      values (new.negocio_id, 'egreso', 'gasto', new.id, v_resto, new.descripcion,
              new.fecha,
              case when new.metodo = 'mixto' then coalesce(new.metodo_resto, 'tarjeta')
                   else new.metodo end,
              v_sesion, new.creado_por);
    end if;
    return new;
  end if;

  -- Un gasto capturado por error se marca como eliminado; la caja recibe el
  -- ingreso contrario, por la MISMA via y partido igual. Nada se tacha.
  if tg_op = 'UPDATE' and new.eliminado and not old.eliminado then
    v_efectivo := coalesce(old.efectivo_centavos,
                           case when coalesce(old.metodo, 'efectivo') = 'efectivo'
                                then old.monto_centavos else 0 end);
    v_resto := old.monto_centavos - v_efectivo;

    if v_efectivo > 0 then
      insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                   descripcion, fecha, metodo, sesion_id, creado_por)
      values (new.negocio_id, 'ingreso', 'gasto', new.id, v_efectivo,
              'Se anulo el gasto: ' || old.descripcion, current_date,
              'efectivo', v_sesion, auth.uid());
    end if;
    if v_resto > 0 then
      insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                   descripcion, fecha, metodo, sesion_id, creado_por)
      values (new.negocio_id, 'ingreso', 'gasto', new.id, v_resto,
              'Se anulo el gasto: ' || old.descripcion, current_date,
              case when old.metodo = 'mixto' then coalesce(old.metodo_resto, 'tarjeta')
                   else old.metodo end,
              v_sesion, auth.uid());
    end if;
  end if;
  return new;
end;
$$;


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
