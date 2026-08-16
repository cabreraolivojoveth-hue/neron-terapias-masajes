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
-- El archivo completo, con todas las explicaciones, sigue siendo
-- INSTALAR-EN-TERAPIAS.sql. Aqui va solo lo que falta.


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
               group by vi.curso_id, cu.nombre, cu.cupo
               limit 10) x), '[]'::jsonb)
    ),

    'gastos', jsonb_build_object(
      'total',   (select coalesce(sum(monto_centavos), 0) from g),
      'cuantos', (select count(*)::int from g),
      'promedio', (select case when count(*) = 0 then null
                    else round(sum(monto_centavos)::numeric / count(*)) end from g),
      'mayor', (select max(monto_centavos) from g),
      'menor', (select min(monto_centavos) from g),
      'categorias', coalesce((select jsonb_agg(jsonb_build_object(
          'categoria', x.categoria, 'monto', x.monto, 'cuantos', x.n) order by x.monto desc)
        from (select categoria, sum(monto_centavos) as monto, count(*)::int as n
                from g group by categoria) x), '[]'::jsonb)
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
