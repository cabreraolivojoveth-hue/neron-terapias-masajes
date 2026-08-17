-- =====================================================================
-- PARTE 1 DE 3 — pegar en Supabase -> SQL Editor -> Run
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
-- CUANDO ESTA DIGA "Success", SIGUE CON LA PARTE 2.
--
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
-- ARRIBA, UNA CORRECCION DE LO QUE YA CORRIA:
--
--   · `resumen_de_gastos` VUELVE A CREARSE. Su promedio diario salia con
--     decimales —`sum()` de un bigint devuelve numeric— y la guardia del
--     dinero tira la pantalla de Gastos entera en cuanto hay gastos de verdad:
--     "formatearMoneda() recibio 67222.58066516129". Con el centro vacio la
--     division daba cero clavado y no se veia.
--
-- Y DESPUES, EL BLOQUE 11: los datos de demostracion.
--
--   · Nace `dato_de_demostracion`, con sus reglas de fila y su permiso. Es el
--     rastro de que fila nacio de una demostracion, y es lo unico que permite
--     QUITARLA despues sin tocar lo que hayas capturado tu.
--   · `cargar_datos_de_demostracion` siembra cinco meses de uso en NUEVE pasos
--     —catalogo, pacientes, un mes por paso, y al final cursos, mensajes,
--     recordatorios y bitacora—. Cada paso es su propia llamada: de un viaje,
--     el tiempo limite de PostgREST la cortaria a la mitad.
--   · `quitar_datos_de_demostracion` borra exactamente lo sembrado, en el
--     orden de las llaves foraneas.
--   · `datos_de_demostracion` dice si hay algo cargado y cuanto.
--
-- SOLO DESDE LA CUENTA `cabreraolivojoveth@gmail.com`. El correo se compara
-- en la base, no en la pantalla: esconder la tarjeta es cortesia, y aqui hacia
-- falta seguridad. Cualquier otra cuenta recibe un error de permisos aunque
-- llame a la base a mano.
--
-- NO TOCA NI UNA FILA DE LO QUE YA HAY. Todo lo que crea es nuevo, y hasta que
-- alguien apriete el boton no escribe ni un renglon de datos.
--
-- Sin correr esto, el sitio se publica igual y la seccion "Datos de
-- demostracion" falla pidiendo funciones que la base no tiene. Vercel publica
-- el navegador, no la base.
--
-- Este archivo lo genera `scripts/actualizar-base.ts` a partir de
-- INSTALAR-EN-TERAPIAS.sql. No se edita a mano: se corre el guion.

-- =====================================================================
-- CORRECCIONES A LO QUE YA HABIAS CORRIDO
-- =====================================================================
--
-- Son `create or replace`: se pueden correr encima de las que ya existen.

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
    /*
     * EL `round` NO SOBRA, Y SU FALTA TIRO LA PANTALLA DE GASTOS ENTERA:
     *
     *   formatearMoneda() recibio "67222.58066516129", que no son centavos
     *   enteros. El dinero del sistema SIEMPRE es un entero de centavos.
     *
     * `sum()` de un `bigint` devuelve NUMERIC —no bigint—, asi que dividirlo
     * entre los dias da decimales en cuanto no toca exacto. Con el centro
     * vacio, cero entre sesenta y dos daba cero clavado y no se veia; con
     * sesenta y cuatro gastos de verdad, la division cayo en un numero con doce
     * decimales y la guardia de la base —que hace bien en existir— tumbo la
     * pantalla.
     *
     * Se redondea AQUI, en el servidor, y no al pintar: el dinero sale entero
     * de la base o no sale. Redondear en el navegador seria dejar que cada
     * pantalla decidiera por su cuenta cuantos centavos son un centavo.
     */
    'promedioDiarioCentavos',
      round(coalesce((select sum(monto_centavos) from actual), 0)
            / (select n from dias))::bigint,
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

-- =====================================================================
-- DATOS DE DEMOSTRACION — CINCO MESES DE USO, PARA ENSEÑAR EL SISTEMA (bloque 11)
-- =====================================================================
--
-- QUE ES ESTO Y POR QUE NO CONTRADICE LA REGLA NUMERO UNO DEL PRODUCTO.
--
-- La regla dice: "cero datos de ejemplo, ni un nombre, ni una cifra". Sigue en
-- pie y no se toca — de hecho la guardia 1 de `guardias/fronteras.ts` revienta
-- la publicacion si un nombre inventado se cuela en `src/`. Lo que esa regla
-- prohibe es que un centro DE VERDAD abra una pantalla y vea pacientes que no
-- existen sin haberlo pedido.
--
-- Esto es lo contrario: nada de aqui viaja al navegador ni existe en `src/`.
-- Son filas que se escriben SOLO cuando una persona concreta las pide con un
-- boton, en SU centro, y que se pueden quitar enteras. Toda la invencion vive
-- dentro de estas funciones, que es el unico sitio donde no puede acabar en la
-- pantalla de alguien por accidente.
--
-- LOS TRES CANDADOS, y hacen falta los tres:
--
--   1. Solo la CUENTA de demostracion. El correo se compara en la base, no en
--      la pantalla: esconder el boton es cortesia, y aqui hace falta seguridad.
--   2. Solo quien puede administrar la configuracion de ESE centro.
--   3. Solo si el centro no tiene ya datos de demostracion cargados. Cargar
--      dos veces duplicaria cinco meses de historia y ningun reporte volveria
--      a cuadrar.
--
-- SE CARGA POR PASOS, Y NO ES CAPRICHO. Son unas seis mil filas: en una sola
-- llamada, el tiempo limite de PostgREST la corta a la mitad y deja el centro
-- con dos meses de historia y ninguna explicacion. Cada paso es una llamada
-- —una transaccion— y la pantalla enseña por donde va.
--
-- CADA FILA QUEDA ANOTADA en `dato_de_demostracion`. Es lo que permite quitar
-- exactamente lo sembrado sin tocar lo que el centro haya capturado de verdad:
-- un "borrar todo lo del centro" es justo lo que no se le puede ofrecer a
-- alguien que ya empezo a trabajar.

-- ---------------------------------------------------------------------
-- 1. EL RASTRO — que fila nacio de una demostracion
-- ---------------------------------------------------------------------
--
-- SIN ESTA TABLA NO HAY VUELTA ATRAS, y esa es toda su razon de ser. Marcar
-- las filas con un texto en sus notas no sirve: hay tablas sin notas, y ademas
-- el texto se puede editar desde la pantalla y entonces la fila deja de ser
-- reconocible. Un renglon por fila sembrada es lo unico que sigue siendo
-- verdad haga lo que haga quien la mire.
create table if not exists dato_de_demostracion (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  text not null references negocio(id) on delete cascade,
  -- La tabla donde vive la fila. Texto y no una llave foranea: no existe forma
  -- de referenciar "cualquier tabla" en Postgres, y una lista cerrada de
  -- nombres se desincronizaria del orden de borrado de mas abajo.
  tabla       text not null,
  fila_id     uuid,
  -- Para lo que NO se identifica con un uuid. Hoy solo el bloque `centro` de
  -- `estado`, que es una llave dentro de un JSON.
  llave       text,
  sembrado_en timestamptz not null default now()
);

comment on table dato_de_demostracion is
  'Una fila por cada fila sembrada. Es lo unico que permite QUITAR la demostracion sin borrar lo '
  'que el centro capturo de verdad. Se lee para ensenar cuanto hay; se escribe solo desde las '
  'funciones de demostracion.';

create index if not exists dato_de_demostracion_idx
  on dato_de_demostracion (negocio_id, tabla);

-- La misma fila no se anota dos veces: si pasara, el borrado intentaria
-- borrarla dos veces y el conteo que se le enseña a la persona mentiria.
create unique index if not exists dato_de_demostracion_unico
  on dato_de_demostracion (negocio_id, tabla, fila_id) where fila_id is not null;

alter table dato_de_demostracion enable row level security;
alter table dato_de_demostracion force row level security;

-- LAS REGLAS DE FILA RECORTAN; EL GRANT ES EL PERMISO DE PARTIDA. Es la
-- distincion que ya costo un "permission denied" en produccion con Mensajes.
--
-- SOLO `select`: esta tabla la escriben las funciones de aqui abajo, que
-- comprueban el correo antes. Con `insert` suelto, cualquiera con sesion
-- podria anotar como "de demostracion" una fila real del centro — y entonces
-- quitar la demostracion se llevaria por delante un expediente de verdad.
--
-- SE REVOCA TODO Y DESPUES SE DA `select`, EN ESE ORDEN. Y no es estilo: es lo
-- unico que funciona.
--
-- Supabase deja puesto un `alter default privileges ... grant all on tables to
-- anon, authenticated, service_role`, asi que CADA TABLA NUEVA nace con los
-- SIETE permisos —insert, select, update, delete, truncate, references y
-- trigger— sin que nadie los escriba. Quitar solo insert, update y delete deja
-- dentro los otros tres, y uno de ellos importa de verdad: **las reglas de fila
-- no se aplican a `truncate`**. Con ese permiso puesto, una sesion cualquiera
-- podria vaciar la tabla entera de todos los centros de un golpe.
--
-- Lo cacho `COMPROBAR-DEMOSTRACION.sql` contra la base de verdad, que es la
-- unica forma de verlo: leyendo este archivo parecia correcto.
revoke all on dato_de_demostracion from anon;
revoke all on dato_de_demostracion from authenticated;
grant select on dato_de_demostracion to authenticated;

drop policy if exists dato_de_demostracion_leer on dato_de_demostracion;
create policy dato_de_demostracion_leer on dato_de_demostracion
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarConfiguracion'));

-- ---------------------------------------------------------------------
-- 2. LA CUENTA QUE PUEDE — el candado de verdad
-- ---------------------------------------------------------------------
--
-- EL CORREO SE COMPARA AQUI Y NO EN LA PANTALLA. La pantalla esconde la
-- tarjeta, que es cortesia; esta funcion es lo que hace que llamar a la base a
-- mano desde otra cuenta no sirva de nada. Es la misma division que el resto
-- del sistema: la pantalla ordena, la base decide.
--
-- ES UNA FUNCION Y NO UN TEXTO REPETIDO EN TRES SITIOS: el dia que la cuenta
-- de demostracion cambie, se cambia aqui y las tres funciones se enteran. Tres
-- copias es como una se queda vieja y abre la puerta que las otras cierran.
create or replace function app.correo_de_demostracion()
returns text
language sql
immutable
as $$ select 'cabreraolivojoveth@gmail.com'::text $$;

comment on function app.correo_de_demostracion() is
  'La UNICA cuenta que puede cargar datos de demostracion. No es un secreto —esta escrito en el '
  'repositorio— y no hace falta que lo sea: lo que protege no es el nombre, es que la comparacion '
  'ocurra en la base y no en el navegador.';

-- ---------------------------------------------------------------------
-- ¿QUIEN ESTA LLAMANDO?
-- ---------------------------------------------------------------------
--
-- EL CORREO SALE DEL TOKEN, no de una tabla que alguien pueda editar. El
-- respaldo por `membresia` esta para una sola situacion: un token sin la
-- reclamacion `email` —que pasa con algunos proveedores de identidad— dejaria
-- a la cuenta buena fuera de su propia demostracion. Y aun asi no abre nada:
-- `membresia.correo` solo lo escribe quien tiene `gestionarUsuarios`, que es el
-- mismo que ya podria invitarse a si mismo al centro.
create or replace function app.es_la_cuenta_de_demostracion()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lower(coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
           (select m.correo from membresia m
             where m.usuario_id = auth.uid() and m.activo and not m.eliminado
             order by m.creado_en limit 1),
           '')) = app.correo_de_demostracion();
$$;

comment on function app.es_la_cuenta_de_demostracion() is
  'Si quien llama es la cuenta de demostracion. El correo se lee del token de la sesion: '
  'compararlo en el navegador seria pedirle al visitante que diga quien es.';

-- ---------------------------------------------------------------------
-- ANOTAR UNA FILA SEMBRADA
-- ---------------------------------------------------------------------
--
-- Devuelve el mismo id que recibe para poder escribirla en linea sin partir la
-- sentencia en dos. `on conflict do nothing` porque anotar dos veces la misma
-- fila no es un error: es un paso que se repitio.
create or replace function app.demo_anotar(p_negocio text, p_tabla text, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into dato_de_demostracion (negocio_id, tabla, fila_id)
  values (p_negocio, p_tabla, p_id)
  on conflict do nothing;
  return p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- MOVER EL INVENTARIO CON FECHA
-- ---------------------------------------------------------------------
--
-- ES UNA COPIA DE `app.mover_inventario` CON UNA SOLA DIFERENCIA, y hace falta
-- por ella: la de verdad estampa `creado_en = now()`, que es lo correcto
-- cuando algo pasa hoy. Aqui todo paso hace meses, y una entrada de mercancia
-- de marzo anotada con la fecha de hoy dejaria el historial del producto en un
-- orden que no ocurrio nunca.
--
-- LO QUE NO CAMBIA es lo importante: el movimiento y el stock se escriben en
-- el mismo acto, y el stock nunca se calcula aparte. Un stock que no sea la
-- suma de sus movimientos es exactamente el descuadre que esa tabla existe
-- para hacer imposible.
create or replace function app.demo_mover_inventario(
  p_negocio   text,
  p_producto  uuid,
  p_tipo      text,
  p_cantidad  int,
  p_motivo    text,
  p_ref_tipo  text,
  p_ref_id    uuid,
  p_costo     bigint,
  p_cuando    timestamptz,
  p_quien     uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_antes   int;
  v_despues int;
  v_id      uuid;
begin
  select stock_actual into v_antes from producto where id = p_producto for update;
  v_despues := v_antes + p_cantidad;

  insert into movimiento_inventario (
    negocio_id, producto_id, tipo, cantidad, stock_antes, stock_despues,
    motivo, referencia_tipo, referencia_id, costo_centavos, creado_por, creado_en)
  values (p_negocio, p_producto, p_tipo, p_cantidad, v_antes, v_despues,
          p_motivo, p_ref_tipo, p_ref_id, p_costo, p_quien, p_cuando)
  returning id into v_id;

  perform app.demo_anotar(p_negocio, 'movimiento_inventario', v_id);

  update producto set stock_actual = v_despues, actualizado_en = p_cuando
   where id = p_producto;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. QUE HAY CARGADO — lo que lee la pantalla
-- ---------------------------------------------------------------------
--
-- Se pide antes de enseñar el boton y despues de cada paso. Contesta las dos
-- unicas preguntas que la pantalla necesita: si hay algo cargado y cuanto.
create or replace function public.datos_de_demostracion(p_negocio text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cuantas bigint;
  v_cuando  timestamptz;
  v_ultimo  int;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este centro.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'No tienes permiso para ver la configuracion de este centro.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*), min(sembrado_en) into v_cuantas, v_cuando
    from dato_de_demostracion where negocio_id = p_negocio;

  -- HASTA DONDE LLEGO LA CARGA. Se lee de las marcas que deja cada paso, no de
  -- cuantas filas hay: una carga que se corto en el paso 3 tiene cientos de
  -- filas y no esta completa, y decirle "cargada" a eso es la mentira que
  -- obliga a quitarla entera sin saber por que.
  select coalesce(max(nullif(llave, '')::int), 0) into v_ultimo
    from dato_de_demostracion
   where negocio_id = p_negocio and tabla = 'paso';

  return jsonb_build_object(
    'puede', app.es_la_cuenta_de_demostracion(),
    'cargada', v_cuantas > 0,
    'filas', v_cuantas,
    'sembradaEn', v_cuando,
    'ultimoPaso', v_ultimo,
    'completa', v_ultimo >= 9,
    'pasos', 9,
    'porTabla', coalesce((
      select jsonb_object_agg(t.tabla, t.cuantas)
      from (select tabla, count(*) as cuantas
              from dato_de_demostracion
             where negocio_id = p_negocio
             group by tabla) t), '{}'::jsonb));
end;
$$;

comment on function public.datos_de_demostracion(text) is
  'Si este centro tiene datos de demostracion cargados, cuantas filas y desde cuando. Tambien dice '
  'si la cuenta que pregunta es la que puede cargarlos, para que la pantalla no ofrezca un boton '
  'que la base va a rechazar.';

revoke all on function public.datos_de_demostracion(text) from public, anon;
grant execute on function public.datos_de_demostracion(text) to authenticated;

-- ---------------------------------------------------------------------
-- UN GASTO DE DEMOSTRACION, CON SU RASTRO EN CAJA
-- ---------------------------------------------------------------------
--
-- SE INSERTA EN `gasto` Y NO SE TOCA LA CAJA A MANO: el disparador
-- `app.gasto_a_caja` es el unico que escribe el movimiento, y se deja que lo
-- haga. Escribirlo aqui seria una segunda via que el dia que el disparador
-- cambie dejaria la demostracion contando el dinero de otra forma que el
-- sistema de verdad — que es exactamente lo que una demostracion no puede
-- permitirse.
--
-- Lo unico que hace falta despues es ANOTAR los movimientos que nacieron del
-- gasto, para que quitar la demostracion se los lleve tambien.
create or replace function app.demo_gasto(
  p_negocio     text,
  p_descripcion text,
  p_detalle     text,
  p_categoria   text,
  p_monto       bigint,
  p_metodo      text,
  p_fecha       date,
  p_recurrente  uuid,
  p_periodo     text,
  p_quien       uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into gasto (negocio_id, descripcion, detalle, categoria, categoria_id,
                     monto_centavos, metodo, efectivo_centavos, fecha,
                     recurrente_id, periodo, creado_por, creado_en)
  values (p_negocio, p_descripcion, p_detalle, 'general',
          (select c.id from categoria c
            where c.negocio_id = p_negocio and c.ambito = 'gasto' and c.nombre = p_categoria),
          p_monto, p_metodo,
          case when p_metodo = 'efectivo' then p_monto else 0 end,
          p_fecha, p_recurrente, p_periodo, p_quien,
          p_fecha::timestamp + time '18:30')
  returning id into v_id;

  perform app.demo_anotar(p_negocio, 'gasto', v_id);

  insert into dato_de_demostracion (negocio_id, tabla, fila_id)
  select p_negocio, 'movimiento_caja', mc.id
    from movimiento_caja mc
   where mc.negocio_id = p_negocio and mc.origen = 'gasto' and mc.referencia_id = v_id
  on conflict do nothing;

  return v_id;
end;
$$;
