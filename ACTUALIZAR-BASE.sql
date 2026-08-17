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
-- BLOQUE 12 — LAS COLUMNAS Y LOS AYUDANTES QUE USA TODO LO DEMAS
-- =====================================================================
--
-- ESTO VIVE AQUI ARRIBA Y NO CON EL RESTO DEL BLOQUE 12, y no es por gusto:
-- `servicios_del_centro`, `ficha_del_servicio`, `citas_del_rango` y
-- `ficha_del_curso` son funciones `language sql`, y a esas Postgres SI les
-- valida el cuerpo al crearlas. Si las columnas y los ayudantes nacieran al
-- final del archivo, el instalador se caeria mil lineas antes de llegar ahi
-- diciendo que no existe `app.preparacion_del_servicio` — y el error no
-- mencionaria el orden, que es lo unico que estaria mal.
--
-- La marca de arriba se la lleva `scripts/actualizar-base.ts` a
-- `ACTUALIZAR-BASE.sql`: sin ella, todo esto se quedaria antes de la frontera
-- y la base publicada recibiria las funciones nuevas sin las columnas que
-- necesitan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LA PREPARACION: los minutos que una sesion ocupa ADEMAS de su duracion
-- ---------------------------------------------------------------------
--
-- Un masaje con piedras calientes de 10:00 a 11:00 no libera la sala a las
-- 11:00: hay que limpiar, recoger las piedras, cambiar el material y preparar
-- la siguiente terapia. Si la agenda deja poner otra cita a las 11:00, esa
-- cita no se puede dar — y el sistema la ofrecio.
--
-- NULO NO ES CERO, y esta distincion es toda la herencia:
--
--   · un numero  → lo que dice el servicio, y manda sobre todo lo demas;
--   · NULO       → "lo que diga mi categoria";
--   · sin nada en la categoria tampoco → cero.
--
-- Que el cero se pueda escribir a proposito es justo lo que permite que un
-- servicio se salga de la regla de su categoria sin tener que sacarlo de ella.
alter table servicio add column if not exists preparacion_antes_min int;
alter table servicio add column if not exists preparacion_despues_min int;
alter table servicio drop constraint if exists servicio_preparacion_razonable;
alter table servicio add constraint servicio_preparacion_razonable check (
  (preparacion_antes_min is null or (preparacion_antes_min between 0 and 240))
  and (preparacion_despues_min is null or (preparacion_despues_min between 0 and 240))
);

comment on column servicio.preparacion_despues_min is
  'Minutos que la sala sigue ocupada DESPUES de terminar la sesion: limpiar, recoger, preparar. '
  'Bloquean agenda de verdad. NULO significa "lo que diga mi categoria", no cero.';

-- La categoria pone el valor por omision de sus servicios. Es donde de verdad
-- se parece: todos los masajes necesitan mas limpieza que todas las lecturas.
alter table categoria add column if not exists preparacion_antes_min int;
alter table categoria add column if not exists preparacion_despues_min int;
alter table categoria drop constraint if exists categoria_preparacion_razonable;
alter table categoria add constraint categoria_preparacion_razonable check (
  (preparacion_antes_min is null or (preparacion_antes_min between 0 and 240))
  and (preparacion_despues_min is null or (preparacion_despues_min between 0 and 240))
);

/**
 * LA HERENCIA, RESUELTA EN UN SOLO SITIO.
 *
 * Servicio → categoria → cero. Si esta cuenta se escribiera en cada pantalla
 * que la necesita, el dia que cambie el orden habria que acordarse de las
 * cuatro — y la que se olvide bloqueara horarios distintos que las otras tres.
 */
create or replace function app.preparacion_del_servicio(p_servicio uuid)
returns table (antes int, despues int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(s.preparacion_antes_min, c.preparacion_antes_min, 0),
         coalesce(s.preparacion_despues_min, c.preparacion_despues_min, 0)
    from servicio s
    left join categoria c on c.id = s.categoria_id
   where s.id = p_servicio;
$$;

comment on function app.preparacion_del_servicio is
  'La prioridad del encargo, en un solo lugar: configuracion del SERVICIO, luego la de su '
  'CATEGORIA, luego cero. Nulo en el servicio es "heredo"; cero es "ninguno, y lo digo yo".';

-- Lo que una cita ocupa DE VERDAD, con su preparacion incluida. Lo escribe el
-- disparador `app.cita_hora_fin` y lo vigila la restriccion de choque.
alter table cita add column if not exists bloqueo_inicio time;
alter table cita add column if not exists bloqueo_fin time;

comment on column cita.bloqueo_fin is
  'Hora en que la sala queda libre de verdad: la de fin mas la preparacion posterior. Se GUARDA '
  'y no se calcula al leer porque la restriccion de exclusion que impide los choques no puede '
  'consultar otra tabla — y porque es la foto de lo que se acordo al agendar.';

-- ---------------------------------------------------------------------
-- 2. LA CITA COBRADA: de que cita nacio una venta
-- ---------------------------------------------------------------------
--
-- La relacion vive EN LA VENTA y no en la cita, y la direccion importa. Un
-- campo `cobrada` en `cita` seria un segundo lugar donde vive la misma verdad:
-- el dia que se cancele la venta se quedaria diciendo que si, y esa sesion se
-- cobraria dos veces sin que nada avisara.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cita_negocio_id_unico') then
    alter table cita add constraint cita_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

alter table venta add column if not exists cita_id uuid;

alter table venta drop constraint if exists venta_cita_mismo_negocio;
alter table venta add constraint venta_cita_mismo_negocio
  foreign key (negocio_id, cita_id) references cita (negocio_id, id)
  -- Compuesta como todas: sin esto se podria colgar una venta de este centro
  -- de la cita de otro, porque las llaves foraneas no obedecen las reglas de
  -- fila. `set null (columna)` nombra la que se vacia: un `set null` pelon
  -- vaciaria tambien `negocio_id`, que no acepta nulos.
  on delete set null (cita_id);

/**
 * UNA CITA SE COBRA UNA VEZ. LO IMPIDE LA BASE, NO LA PANTALLA.
 *
 * El boton apagado ayuda y no defiende: la pestaña de al lado no sabe de este
 * boton, y dos personas en dos mostradores cobran la misma sesion sin que
 * ninguna vea a la otra. Un indice unico no tiene ventana.
 *
 * Solo cuenta lo COBRADO: una venta cancelada libera la cita, que es lo que
 * uno espera —se cancelo el cobro, hay que volver a cobrar—.
 */
create unique index if not exists venta_una_por_cita
  on venta (negocio_id, cita_id)
  where cita_id is not null and not eliminado and estado = 'cobrada';

-- ---------------------------------------------------------------------
-- 3. EL VIDEO DE PRESENTACION DE UN CURSO
-- ---------------------------------------------------------------------
--
-- SE GUARDA EL IDENTIFICADOR, NO LA DIRECCION. Guardar la URL que alguien pego
-- y meterla despues en un `iframe` es dejar que quien edite un curso incruste
-- el sitio que quiera dentro del sistema. Con los once caracteres del video, la
-- direccion la arma el producto y siempre apunta a YouTube.
alter table curso add column if not exists video_youtube text;
alter table curso drop constraint if exists curso_video_identificador;
alter table curso add constraint curso_video_identificador check (
  video_youtube is null or video_youtube ~ '^[A-Za-z0-9_-]{11}$'
);

comment on column curso.video_youtube is
  'El identificador de once caracteres del video, NUNCA la URL. La direccion la arma la pantalla, '
  'y por eso no hay forma de que un curso incruste otra cosa que un video de YouTube.';

/**
 * EL IDENTIFICADOR DE UN ENLACE DE YOUTUBE, en todas sus formas.
 *
 * El mismo video llega escrito de seis maneras y todas son legitimas:
 *
 *     youtube.com/watch?v=ID          el de la barra de direcciones
 *     youtu.be/ID                     el de "Compartir"
 *     youtube.com/embed/ID            el de "Insertar"
 *     youtube.com/shorts/ID           los verticales
 *     youtube.com/live/ID             las transmisiones
 *     ...cualquiera de los anteriores con &t=90, ?si=... o &list=...
 *
 * Devuelve NULO si no reconoce ninguno — nunca se inventa un identificador.
 * Vive en la base y no solo en la pantalla porque la pantalla se puede saltar:
 * quien llame a `guardar_curso` a mano tiene que pasar por aqui igual.
 */
create or replace function app.identificador_de_youtube(p_texto text)
returns text
language plpgsql
immutable
as $$
declare
  v_limpio text := btrim(coalesce(p_texto, ''));
  v_id     text;
begin
  if v_limpio = '' then return null; end if;

  -- Ya viene pelado: once caracteres y nada mas.
  if v_limpio ~ '^[A-Za-z0-9_-]{11}$' then return v_limpio; end if;

  -- `substring` con un grupo devuelve el grupo. El `(?:...)` de delante no
  -- captura, asi que lo que sale es siempre el identificador.
  v_id := substring(v_limpio from '(?:v=|/embed/|/shorts/|/live/|youtu\.be/|/v/)([A-Za-z0-9_-]{11})');
  if v_id is not null then return v_id; end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. LAS FIRMAS QUE CAMBIARON
-- ---------------------------------------------------------------------
--
-- `guardar_servicio` y `guardar_curso` ganan argumentos. Postgres no sustituye
-- una funcion cuando cambia su lista de argumentos: crea OTRA con el mismo
-- nombre. Y con dos, PostgREST no sabe a cual llamar y contesta "Could not
-- choose the best candidate function" a todo el mundo. Asi que la vieja se va.
--
-- Van con `if exists` porque en una instalacion nueva nunca existieron.
drop function if exists public.guardar_servicio(
  text, uuid, text, text, uuid, int, bigint, bigint, date, date, text, boolean,
  text, text, text, time, time, boolean);
drop function if exists public.guardar_curso(
  text, uuid, text, text, text, uuid, uuid, date, date, bigint, int, text, text,
  text, text, text, boolean);

-- =====================================================================
-- CORRECCIONES A LO QUE YA HABIAS CORRIDO
-- =====================================================================
--
-- Son `create or replace`: se pueden correr encima de las que ya existen.
-- Van DESPUES de las columnas de arriba porque varias las usan.

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

create or replace function app.cita_hora_fin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duracion int;
  v_antes    int := 0;
  v_despues  int := 0;
  v_ini      time;
  v_fin      time;
begin
  if new.hora_fin is null or new.hora_fin <= new.hora_inicio then
    select duracion_min into v_duracion from servicio where id = new.servicio_id;
    new.hora_fin := new.hora_inicio + make_interval(mins => coalesce(v_duracion, 60));
  end if;

  select p.antes, p.despues into v_antes, v_despues
    from app.preparacion_del_servicio(new.servicio_id) p;
  v_antes := coalesce(v_antes, 0);
  v_despues := coalesce(v_despues, 0);

  /*
   * LA HORA SE DA LA VUELTA, Y ESO ROMPE EL RANGO.
   *
   * En Postgres `time '00:05' - interval '10 min'` NO da un error: da
   * `23:55`. Con eso, una cita de las 00:05 con diez minutos de preparacion
   * guardaria un bloqueo que empieza a las 23:55 y termina a la 1:05 — un
   * rango invertido que la restriccion de exclusion rechaza con un mensaje
   * que no menciona nada de esto. Se detecta por la vuelta, no por comparar
   * con las cero horas: es la unica señal fiable.
   */
  v_ini := new.hora_inicio - make_interval(mins => v_antes);
  if v_ini > new.hora_inicio then v_ini := time '00:00'; end if;
  v_fin := new.hora_fin + make_interval(mins => v_despues);
  if v_fin < new.hora_fin then v_fin := time '23:59:59'; end if;

  new.bloqueo_inicio := v_ini;
  new.bloqueo_fin := v_fin;
  new.actualizado_en := now();
  return new;
end;
$$;

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
      -- LA DURACION APLICADA, no la del catalogo de hoy.
      --
      -- Si un servicio pasa de 60 a 90 minutos, las citas del año pasado
      -- duraron 60. Leer `s.duracion_min` las reescribiria en pantalla y el
      -- reporte de ocupacion del año pasado cambiaria solo. La cita ya guarda
      -- su hora de inicio y de fin: esa resta ES el dato historico.
      'servicioMinutos', extract(epoch from (c.hora_fin - c.hora_inicio))::int / 60,
      'servicioPrecio', s.precio_centavos,
      'profesionalId', c.profesional_id,
      'profesional', m.nombre,
      /*
       * LA FRANJA DE PREPARACION, tal como se guardo al agendar.
       *
       * Sale del bloqueo y no del servicio de hoy, por la misma razon que la
       * duracion: cambiar la limpieza de un servicio de quince a treinta
       * minutos no reescribe lo que ocupo la agenda del mes pasado.
       */
      'preparacionAntesMin',
        extract(epoch from (c.hora_inicio - coalesce(c.bloqueo_inicio, c.hora_inicio)))::int / 60,
      'preparacionDespuesMin',
        extract(epoch from (coalesce(c.bloqueo_fin, c.hora_fin) - c.hora_fin))::int / 60,
      /*
       * SI ESTA CITA YA SE COBRO, Y CON QUE VENTA.
       *
       * No es un estado guardado en la cita: es la venta la que sabe de que
       * cita nacio. Un campo `cobrada` en `cita` seria un segundo lugar donde
       * vive la misma verdad, y el dia que se cancele la venta se quedaria
       * diciendo que si — que es como se cobra dos veces la misma sesion.
       *
       * De aqui sale la diferencia entre "Completada — pendiente de cobro" y
       * "Completada — cobrada", que la pantalla calcula y no guarda.
       */
      'ventaId', (
        select v.id from venta v
        where v.negocio_id = c.negocio_id and v.cita_id = c.id
          and v.estado = 'cobrada' and not v.eliminado
        limit 1
      )
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

create or replace function public.servicios_del_centro(
  p_negocio text,
  p_busqueda text default null,
  p_estado text default null,
  p_categoria uuid default null,
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
    select s.*,
      c.nombre as categoria_nombre,
      c.color as categoria_color,
      app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                          s.promocion_desde, s.promocion_hasta, p_hoy) as precio_hoy
    from servicio s
    left join categoria c on c.id = s.categoria_id
    where s.negocio_id = p_negocio and not s.eliminado
  ),
  filtrado as (
    select b.* from base b
    where (p_estado is null or p_estado = ''
           or (p_estado = 'activo' and b.activo)
           or (p_estado = 'inactivo' and not b.activo))
      and (p_categoria is null or b.categoria_id = p_categoria)
      and (p_busqueda is null or p_busqueda = ''
           or b.nombre ilike '%' || p_busqueda || '%'
           or coalesce(b.descripcion, '') ilike '%' || p_busqueda || '%'
           or coalesce(b.categoria_nombre, '') ilike '%' || p_busqueda || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrado),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'nombre', f.nombre, 'descripcion', f.descripcion,
        'categoriaId', f.categoria_id, 'categoria', f.categoria_nombre,
        'categoriaColor', f.categoria_color,
        'duracionMin', f.duracion_min,
        -- LOS MINUTOS QUE DE VERDAD SE VAN A BLOQUEAR, ya resueltos: los del
        -- servicio si los tiene, si no los de su categoria, si no cero. La
        -- lista enseña lo que va a pasar, no lo que esta escrito en la fila.
        'preparacionAntesMin', (select antes from app.preparacion_del_servicio(f.id)),
        'preparacionDespuesMin', (select despues from app.preparacion_del_servicio(f.id)),
        'precioCentavos', f.precio_centavos,
        'precioHoyCentavos', f.precio_hoy,
        'enPromocion', f.precio_hoy <> f.precio_centavos,
        'activo', f.activo,
        'color', f.color
      ) order by f.nombre)
      from (
        select * from filtrado order by nombre
        limit greatest(coalesce(p_por_pagina, 10), 1)
        offset greatest(coalesce(p_pagina, 1) - 1, 0) * greatest(coalesce(p_por_pagina, 10), 1)
      ) f
    ), '[]'::jsonb)
  );
$$;

create or replace function public.ficha_del_servicio(
  p_servicio uuid, p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id, 'nombre', s.nombre, 'descripcion', s.descripcion, 'notas', s.notas,
    'categoriaId', s.categoria_id,
    'categoria', (select c.nombre from categoria c where c.id = s.categoria_id),
    'categoriaColor', (select c.color from categoria c where c.id = s.categoria_id),
    'duracionMin', s.duracion_min,
    'precioCentavos', s.precio_centavos,
    'precioPromocionalCentavos', s.precio_promocional_centavos,
    'promocionDesde', s.promocion_desde,
    'promocionHasta', s.promocion_hasta,
    'precioHoyCentavos', app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                                             s.promocion_desde, s.promocion_hasta, p_hoy),
    'color', s.color,
    'requierePreparacion', s.requiere_preparacion,
    'preparacion', s.preparacion,
    /*
     * LOS MINUTOS DE PREPARACION VAN EN DOS PARES, y hacen falta los dos.
     *
     * El par "…Min" es lo ESCRITO en el servicio, y puede ser nulo: nulo
     * significa "lo que diga mi categoria", no cero. El par "efectiva…" es lo
     * que de verdad se va a bloquear despues de resolver la herencia.
     *
     * Con uno solo, el formulario no puede distinguir "no lo he puesto" de
     * "lo puse en cero a proposito" — y son cosas distintas: la primera sigue
     * a la categoria y la segunda la desobedece.
     */
    'preparacionAntesMin', s.preparacion_antes_min,
    'preparacionDespuesMin', s.preparacion_despues_min,
    'efectivaAntesMin', (select antes from app.preparacion_del_servicio(s.id)),
    'efectivaDespuesMin', (select despues from app.preparacion_del_servicio(s.id)),
    'categoriaAntesMin', (select k.preparacion_antes_min from categoria k where k.id = s.categoria_id),
    'categoriaDespuesMin', (select k.preparacion_despues_min from categoria k where k.id = s.categoria_id),
    'diasDisponibles', s.dias_disponibles,
    'horaDesde', s.hora_desde,
    'horaHasta', s.hora_hasta,
    'activo', s.activo,
    'creadoEn', s.creado_en,
    -- CUANTAS CITAS FUTURAS TIENE. Es lo que se le enseña a quien va a
    -- apagarlo: apagar un servicio con doce citas agendadas sin avisar es
    -- como cancelarlas a ciegas.
    'citasFuturas', (
      select count(*) from cita v
      where v.servicio_id = s.id and not v.eliminado
        and v.estado in ('pendiente', 'confirmada') and v.fecha >= p_hoy
    ),
    'citasCompletadas', (
      select count(*) from cita v
      where v.servicio_id = s.id and not v.eliminado and v.estado = 'completada'
    ),
    -- SI ESTA PERSONA PUEDE VER LA BITACORA.
    --
    -- La regla de fila de `auditoria` solo la entrega a quien tiene
    -- `verAuditoria`. Sin este dato, una recepcionista recibiria una lista
    -- vacia y la pantalla le diria "todavia no hay cambios registrados" —
    -- que es mentira: los hay, simplemente no son para sus ojos. Una pantalla
    -- que confunde "no puedes verlo" con "no existe" enseña a desconfiar de
    -- todo lo demas que dice.
    'puedeVerHistorial', app.tiene_permiso(s.negocio_id, 'verAuditoria'),
    -- El historial sale de la bitacora que ya existe. No hay una segunda.
    --
    -- La columna de tiempo se llama `ocurrido_en`, NO `creado_en`: la bitacora
    -- guarda cuando PASO la cosa, que no siempre es cuando se pudo escribir el
    -- renglon —una entrada que se reintenta con mala red se escribe despues—.
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object(
        'accion', a.accion, 'quien', a.usuario_nombre, 'cuando', a.ocurrido_en,
        'antes', a.antes, 'despues', a.despues
      ) order by a.ocurrido_en desc)
      from (
        select * from auditoria
        where negocio_id = s.negocio_id and modulo = 'servicios' and entidad = s.id::text
        order by ocurrido_en desc limit 20
      ) a
    ), '[]'::jsonb)
  )
  from servicio s
  where s.id = p_servicio;
$$;

create or replace function public.guardar_servicio(
  p_negocio text,
  p_id uuid,
  p_nombre text,
  p_descripcion text,
  p_categoria uuid,
  p_duracion int,
  p_precio bigint,
  -- De aqui para abajo todo es OPCIONAL, y por eso lleva valor por omision: un
  -- servicio se da de alta con nombre, duracion y precio. Obligar a mandar
  -- diecinueve argumentos para crear uno hace que cualquiera que llame a esta
  -- funcion desde otro lado se equivoque de posicion en silencio.
  p_promo bigint default null,
  p_promo_desde date default null,
  p_promo_hasta date default null,
  p_color text default null,
  p_requiere_preparacion boolean default false,
  p_preparacion text default null,
  p_notas text default null,
  p_dias text default null,
  p_hora_desde time default null,
  p_hora_hasta time default null,
  p_activo boolean default true,
  -- NULO NO ES CERO. Nulo es "lo que diga mi categoria"; cero es "ninguno, y
  -- lo digo yo". Por eso no llevan `coalesce` al guardar.
  p_preparacion_antes int default null,
  p_preparacion_despues int default null
)
returns servicio
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s     servicio;
  v_antes jsonb;
  v_quien membresia;
begin
  -- Los porteros van AQUI: un `security definer` se salta las reglas de fila.
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarCatalogo') then
    raise exception 'No tienes permiso para administrar el catalogo.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El servicio necesita un nombre.' using errcode = 'invalid_parameter_value';
  end if;
  if p_duracion is null or p_duracion <= 0 then
    raise exception 'La duracion tiene que ser mayor que cero.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;
  /*
   * EL TOPE DE CUATRO HORAS NO ES UN CAPRICHO.
   *
   * La preparacion BLOQUEA agenda de verdad. Un cero de mas —"150" en vez de
   * "15"— convierte un servicio de una hora en un bloque de dos y media, y lo
   * que se ve despues es "no hay horarios disponibles" sin ninguna pista de
   * por que. Se rechaza en la puerta y con el numero delante.
   */
  if p_preparacion_antes is not null and (p_preparacion_antes < 0 or p_preparacion_antes > 240) then
    raise exception 'La preparacion previa son entre 0 y 240 minutos, no %.', p_preparacion_antes
      using errcode = 'invalid_parameter_value';
  end if;
  if p_preparacion_despues is not null and (p_preparacion_despues < 0 or p_preparacion_despues > 240) then
    raise exception 'La preparacion posterior son entre 0 y 240 minutos, no %.', p_preparacion_despues
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if p_id is null then
    insert into servicio (negocio_id, nombre, descripcion, categoria_id, duracion_min,
                          precio_centavos, precio_promocional_centavos, promocion_desde,
                          promocion_hasta, color, requiere_preparacion, preparacion, notas,
                          dias_disponibles, hora_desde, hora_hasta, activo,
                          preparacion_antes_min, preparacion_despues_min)
    values (p_negocio, btrim(p_nombre), p_descripcion, p_categoria, p_duracion,
            p_precio, p_promo, p_promo_desde, p_promo_hasta, p_color,
            coalesce(p_requiere_preparacion, false), p_preparacion, p_notas,
            p_dias, p_hora_desde, p_hora_hasta, coalesce(p_activo, true),
            p_preparacion_antes, p_preparacion_despues)
    returning * into v_s;

    insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                           entidad, antes, despues)
    values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
            coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'), 'servicios', 'crear', v_s.id::text, null,
            jsonb_build_object('nombre', v_s.nombre, 'precio', v_s.precio_centavos,
                               'duracion', v_s.duracion_min));
    return v_s;
  end if;

  select * into v_s from servicio where id = p_id and negocio_id = p_negocio and not eliminado;
  if v_s.id is null then
    raise exception 'Ese servicio no existe.' using errcode = 'no_data_found';
  end if;

  v_antes := jsonb_build_object('nombre', v_s.nombre, 'precio', v_s.precio_centavos,
                                'duracion', v_s.duracion_min, 'activo', v_s.activo,
                                'categoria', v_s.categoria_id, 'promo', v_s.precio_promocional_centavos);

  update servicio
     set nombre = btrim(p_nombre), descripcion = p_descripcion, categoria_id = p_categoria,
         duracion_min = p_duracion, precio_centavos = p_precio,
         precio_promocional_centavos = p_promo, promocion_desde = p_promo_desde,
         promocion_hasta = p_promo_hasta, color = p_color,
         requiere_preparacion = coalesce(p_requiere_preparacion, false),
         preparacion = p_preparacion, notas = p_notas,
         dias_disponibles = p_dias, hora_desde = p_hora_desde, hora_hasta = p_hora_hasta,
         activo = coalesce(p_activo, v_s.activo),
         preparacion_antes_min = p_preparacion_antes,
         preparacion_despues_min = p_preparacion_despues,
         actualizado_en = now()
   where id = p_id
  returning * into v_s;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'), 'servicios', 'editar', v_s.id::text, v_antes,
          jsonb_build_object('nombre', v_s.nombre, 'precio', v_s.precio_centavos,
                             'duracion', v_s.duracion_min, 'activo', v_s.activo,
                             'categoria', v_s.categoria_id, 'promo', v_s.precio_promocional_centavos));
  return v_s;
end;
$$;

create or replace function public.cursos_del_centro(
  p_negocio text,
  p_busqueda text default null,
  p_estado text default null,
  p_categoria uuid default null,
  p_instructor uuid default null,
  p_modalidad text default null,
  p_con_lugares boolean default null,
  p_hoy date default current_date,
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
      c.*,
      app.estado_del_curso(c.estado, c.activo, c.fecha_inicio, c.fecha_fin, p_hoy) as vida,
      app.lugares_ocupados(c.id) as ocupados,
      (select count(*) from sesion_curso s
        where s.curso_id = c.id and not s.eliminado) as sesiones,
      (select k.nombre from categoria k where k.id = c.categoria_id) as categoria,
      (select k.color  from categoria k where k.id = c.categoria_id) as categoria_color,
      (select m.nombre from membresia m where m.id = c.instructor_id) as instructor
    from curso c
    where c.negocio_id = p_negocio
      and not c.eliminado
      and (p_categoria  is null or c.categoria_id  = p_categoria)
      and (p_instructor is null or c.instructor_id = p_instructor)
      and (p_modalidad  is null or c.modalidad     = p_modalidad)
      -- El buscador mira nombre, subtitulo y descripcion. Sin acentos no se
      -- puede: `ilike` ya ignora mayusculas, que es lo que la gente escribe mal.
      and (p_busqueda is null or (
            c.nombre      ilike '%' || p_busqueda || '%'
         or c.subtitulo   ilike '%' || p_busqueda || '%'
         or c.descripcion ilike '%' || p_busqueda || '%'))
  ),
  filtrada as (
    select * from base
    where (p_estado is null or vida = p_estado)
      -- "Con lugares disponibles" es una pregunta real de mostrador: sirve
      -- para saber a quien todavia se le puede ofrecer.
      and (p_con_lugares is not true or cupo is null or ocupados < cupo)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    'filas', coalesce((
      -- Se agrega desde la subconsulta ya paginada y ordenada. El alias es
      -- `t`: referirse a `x` aqui afuera no compila.
      select jsonb_agg(t.x order by t.orden desc)
      from (
        select jsonb_build_object(
          'id', f.id,
          'nombre', f.nombre,
          'subtitulo', f.subtitulo,
          'categoriaId', f.categoria_id,
          'categoria', f.categoria,
          'categoriaColor', f.categoria_color,
          'instructorId', f.instructor_id,
          'instructor', f.instructor,
          'fechaInicio', f.fecha_inicio,
          'fechaFin', f.fecha_fin,
          'sesiones', f.sesiones,
          'precioCentavos', f.precio_centavos,
          'cupo', f.cupo,
          'ocupados', f.ocupados,
          'modalidad', f.modalidad,
          'imagenUrl', f.imagen_url,
          'videoYoutube', f.video_youtube,
          'vida', f.vida,
          'activo', f.activo
        ) as x,
        -- Los proximos primero, que es lo que se administra. Los finalizados
        -- se hunden solos sin tener que filtrarlos a mano.
        f.fecha_inicio as orden
        from filtrada f
        order by f.fecha_inicio desc
        limit greatest(p_por_pagina, 1)
        offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)
      ) t
    ), '[]'::jsonb)
  );
$$;

create or replace function public.ficha_del_curso(
  p_curso uuid, p_hoy date default current_date
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
    'subtitulo', c.subtitulo,
    'descripcion', c.descripcion,
    'notas', c.notas,
    'categoriaId', c.categoria_id,
    'categoria', (select k.nombre from categoria k where k.id = c.categoria_id),
    'categoriaColor', (select k.color from categoria k where k.id = c.categoria_id),
    'instructorId', c.instructor_id,
    'instructor', (select m.nombre from membresia m where m.id = c.instructor_id),
    'fechaInicio', c.fecha_inicio,
    'fechaFin', c.fecha_fin,
    'precioCentavos', c.precio_centavos,
    'cupo', c.cupo,
    'ocupados', app.lugares_ocupados(c.id),
    'enEspera', (select count(*) from inscripcion i
                 where i.curso_id = c.id and i.estado = 'lista_espera'),
    'modalidad', c.modalidad,
    'lugar', c.lugar,
    'enlace', c.enlace,
    'imagenUrl', c.imagen_url,
    -- El identificador pelon, no una direccion. La arma la pantalla, y por eso
    -- siempre apunta a YouTube pase lo que pase con lo que se pego.
    'videoYoutube', c.video_youtube,
    'estado', c.estado,
    'activo', c.activo,
    'vida', app.estado_del_curso(c.estado, c.activo, c.fecha_inicio, c.fecha_fin, p_hoy),
    -- Los ALUMNOS son clientes con inscripcion. El nombre se RESUELVE al leer:
    -- si mañana se cambia el apellido, esta lista lo muestra al dia.
    'alumnos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'clienteId', i.cliente_id, 'nombre', cl.nombre,
        'telefono', cl.telefono, 'correo', cl.correo,
        'estado', i.estado, 'origen', i.origen,
        'inscritoEn', i.creado_en,
        -- El dinero se dice APARTE del estado de inscripcion: se puede estar
        -- inscrito y deber, y se puede haber pagado y luego cancelar.
        'pagada', i.venta_id is not null
      ) order by i.creado_en)
      from inscripcion i
      join cliente cl on cl.id = i.cliente_id
      where i.curso_id = c.id
    ), '[]'::jsonb),
    'sesiones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'titulo', s.titulo, 'fecha', s.fecha,
        'horaInicio', s.hora_inicio, 'horaFin', s.hora_fin,
        'instructorId', s.instructor_id,
        'instructor', (select m.nombre from membresia m where m.id = s.instructor_id),
        'lugar', s.lugar, 'estado', s.estado
      ) order by s.fecha, s.hora_inicio)
      from sesion_curso s
      where s.curso_id = c.id and not s.eliminado
    ), '[]'::jsonb),
    'material', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'titulo', m.titulo, 'tipo', m.tipo, 'url', m.url,
        'descripcion', m.descripcion, 'visibleParaAlumnos', m.visible_para_alumnos
      ) order by m.creado_en)
      from material_curso m
      where m.curso_id = c.id and not m.eliminado
    ), '[]'::jsonb)
  )
  from curso c
  where c.id = p_curso and not c.eliminado;
$$;

create or replace function public.guardar_curso(
  p_negocio text,
  p_id uuid,
  p_nombre text,
  p_subtitulo text default null,
  p_descripcion text default null,
  p_categoria uuid default null,
  p_instructor uuid default null,
  p_inicio date default null,
  p_fin date default null,
  p_precio bigint default 0,
  p_cupo int default null,
  p_modalidad text default 'presencial',
  p_lugar text default null,
  p_enlace text default null,
  p_imagen text default null,
  p_notas text default null,
  p_activo boolean default true,
  -- El enlace de YouTube tal cual lo pego la persona. Se valida y se normaliza
  -- aqui abajo; lo que se GUARDA es el identificador del video, no la URL.
  p_video text default null
)
returns curso
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c      curso;
  v_antes  jsonb;
  v_quien  membresia;
  v_ocupados int;
  v_video  text;
begin
  -- Los porteros van AQUI: un `security definer` se salta las reglas de fila.
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarCatalogo') then
    raise exception 'No tienes permiso para administrar el catalogo.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El curso necesita un nombre.' using errcode = 'invalid_parameter_value';
  end if;
  if p_inicio is null then
    raise exception 'El curso necesita una fecha de inicio.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_fin is not null and p_fin < p_inicio then
    raise exception 'El curso no puede terminar antes de empezar.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;
  -- Un cupo en cero no es "sin limite": es un curso al que nadie puede entrar.
  -- Sin limite se dice con NULO, nunca con 999999.
  if p_cupo is not null and p_cupo <= 0 then
    raise exception 'El cupo tiene que ser mayor que cero. Dejalo vacio si no hay limite.'
      using errcode = 'invalid_parameter_value';
  end if;

  /*
   * EL VIDEO SE VALIDA EN LA BASE, NO SOLO EN LA PANTALLA.
   *
   * Lo que se guarda es el IDENTIFICADOR de once caracteres, no la direccion
   * que alguien pego. Dos razones, y la segunda es la que importa:
   *
   *   · Un mismo video llega escrito de seis formas —`watch?v=`, `youtu.be/`,
   *     `/embed/`, `/shorts/`, con `&t=90`, con `?si=` de compartir—. Guardar
   *     la cadena entera obligaria a que cada pantalla las entienda todas.
   *   · Guardar una URL cualquiera y meterla despues en un `iframe` es dejar
   *     que quien edite un curso incruste el sitio que quiera dentro del
   *     sistema. Con el identificador, la direccion la ARMA el producto y
   *     siempre apunta a YouTube.
   *
   * Cadena vacia y nulo son lo mismo aqui: quitar el video.
   */
  v_video := app.identificador_de_youtube(p_video);
  if coalesce(btrim(p_video), '') <> '' and v_video is null then
    raise exception 'Ese enlace no parece un video de YouTube.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if p_id is null then
    insert into curso (negocio_id, nombre, subtitulo, descripcion, categoria_id, instructor_id,
                       fecha_inicio, fecha_fin, precio_centavos, cupo, modalidad, lugar,
                       enlace, imagen_url, notas, activo, video_youtube)
    values (p_negocio, btrim(p_nombre), p_subtitulo, p_descripcion, p_categoria, p_instructor,
            p_inicio, p_fin, p_precio, p_cupo, coalesce(p_modalidad, 'presencial'), p_lugar,
            p_enlace, p_imagen, p_notas, coalesce(p_activo, true), v_video)
    returning * into v_c;

    insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                           entidad, antes, despues)
    values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
            coalesce((select r.etiqueta from rol r
                       where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                      v_quien.rol, 'desconocido'),
            'cursos', 'crear', v_c.id::text, null,
            jsonb_build_object('nombre', v_c.nombre, 'precio', v_c.precio_centavos,
                               'cupo', v_c.cupo, 'inicio', v_c.fecha_inicio));
    return v_c;
  end if;

  select * into v_c from curso where id = p_id and negocio_id = p_negocio and not eliminado;
  if v_c.id is null then
    raise exception 'Ese curso no existe.' using errcode = 'no_data_found';
  end if;

  -- BAJAR EL CUPO POR DEBAJO DE LOS QUE YA ENTRARON deja gente inscrita en un
  -- curso que dice estar lleno de mas, y nadie sabe a quien sacar.
  v_ocupados := app.lugares_ocupados(p_id);
  if p_cupo is not null and p_cupo < v_ocupados then
    raise exception 'Ya hay % alumnos inscritos: el cupo no puede quedar en %.',
      v_ocupados, p_cupo using errcode = 'invalid_parameter_value';
  end if;

  v_antes := jsonb_build_object('nombre', v_c.nombre, 'precio', v_c.precio_centavos,
                                'cupo', v_c.cupo, 'inicio', v_c.fecha_inicio,
                                'activo', v_c.activo, 'categoria', v_c.categoria_id,
                                'instructor', v_c.instructor_id);

  update curso
     set nombre = btrim(p_nombre), subtitulo = p_subtitulo, descripcion = p_descripcion,
         categoria_id = p_categoria, instructor_id = p_instructor,
         fecha_inicio = p_inicio, fecha_fin = p_fin, precio_centavos = p_precio,
         cupo = p_cupo, modalidad = coalesce(p_modalidad, 'presencial'), lugar = p_lugar,
         enlace = p_enlace, imagen_url = p_imagen, notas = p_notas,
         activo = coalesce(p_activo, v_c.activo), video_youtube = v_video,
         actualizado_en = now()
   where id = p_id
  returning * into v_c;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'cursos', 'editar', v_c.id::text, v_antes,
          jsonb_build_object('nombre', v_c.nombre, 'precio', v_c.precio_centavos,
                             'cupo', v_c.cupo, 'inicio', v_c.fecha_inicio,
                             'activo', v_c.activo, 'categoria', v_c.categoria_id,
                             'instructor', v_c.instructor_id));
  return v_c;
end;
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

-- ---------------------------------------------------------------------
-- UNA ANOTACION EN LA BITACORA, CON SU FECHA DE VERDAD
-- ---------------------------------------------------------------------
--
-- La bitacora de un centro con cinco meses de trabajo no puede estar vacia: es
-- de las primeras cosas que se enseñan. Y las anotaciones tienen que llevar la
-- fecha en que ocurrio cada cosa — todas con la de hoy dirian que el centro
-- entero se uso en una tarde.
create or replace function app.demo_bitacora(
  p_negocio text,
  p_modulo  text,
  p_accion  text,
  p_entidad text,
  p_despues jsonb,
  p_cuando  timestamptz,
  p_usuario uuid,
  p_nombre  text,
  p_rol     text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into auditoria (negocio_id, ocurrido_en, usuario_id, usuario_nombre, rol_etiqueta,
                         modulo, accion, entidad, despues)
  values (p_negocio, p_cuando, p_usuario, coalesce(p_nombre, 'desconocido'),
          coalesce(p_rol, 'desconocido'), p_modulo, p_accion, p_entidad, p_despues)
  returning id into v_id;

  perform app.demo_anotar(p_negocio, 'auditoria', v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. CARGAR — un paso por llamada
-- ---------------------------------------------------------------------
--
-- LOS NUEVE PASOS, y el orden no es decorativo: cada uno necesita lo que dejo
-- el anterior.
--
--   1  El catalogo: categorias, servicios, productos, proveedores, cursos,
--      plantillas, canales, las plantillas de gasto recurrente y la ficha del
--      centro. Sin esto no hay de que agendar ni que cobrar.
--   2  Los pacientes, con su expediente clinico y dados de alta a lo largo de
--      los cinco meses — no todos el mismo dia, que es como se nota que un
--      centro lleva tiempo abierto.
--   3-8 Un mes de trabajo por paso, dia por dia: se abre la caja, se atienden
--      las citas, se cobra, se registran los gastos y se hace el corte. El
--      ultimo paso llega hasta hoy y deja la caja de hoy ABIERTA, con citas
--      pendientes por delante.
--   9  Lo que cuelga de todo lo anterior: inscripciones, cotizaciones,
--      recordatorios, conversaciones, reportes guardados y la bitacora.
--
-- POR QUE POR PASOS Y NO DE UN VIAJE: son unas seis mil filas. PostgREST corta
-- las llamadas largas, y una carga cortada a la mitad deja el centro con dos
-- meses de historia, la caja de un dia sin cerrar y ninguna explicacion. Cada
-- paso es su propia transaccion: o entra el mes entero o no entra ninguno.
create or replace function public.cargar_datos_de_demostracion(
  p_negocio text,
  p_paso int default 1,
  p_hoy date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  /* El calendario de la demostracion */
  v_hoy       date := coalesce(p_hoy, current_date);
  v_inicio    date := (date_trunc('month', coalesce(p_hoy, current_date)::timestamp)
                        - interval '5 months')::date;
  v_mes       date;
  v_fin       date;
  v_dia       date;
  v_dow       int;

  /* Quien "trabajo" todo esto */
  v_usuario   uuid := auth.uid();
  v_membresia uuid;
  v_equipo    uuid[];
  v_nombre_yo text;
  v_rol_yo    text;

  /* Los catalogos ya sembrados, para escoger de ellos */
  v_clientes  uuid[];
  v_servicios uuid[];
  v_productos uuid[];
  v_elegibles int;

  /* El dia que se esta simulando */
  v_sesion    uuid;
  v_cuantas   int;
  v_i         int;
  v_hora      time;
  v_id        uuid;
  v_cita      uuid;
  v_estado    text;
  v_cliente   uuid;
  /*
   * EL SERVICIO Y EL PRODUCTO VAN EN VARIABLES SUELTAS Y NO EN UN `record`.
   * Un `record` de plpgsql solo se puede llenar desde una consulta: no se le
   * puede asignar nulo para decir "esta vez no se llevo nada", que es
   * exactamente lo que hace falta aqui.
   */
  v_serv_id     uuid;
  v_serv_nombre text;
  v_serv_min    int;
  v_serv_precio bigint;
  v_prod_id     uuid;
  v_prod_nombre text;
  v_prod_precio bigint;
  v_prod_costo  bigint;
  v_prod_stock  int;
  v_lleva     boolean;
  v_venta     uuid;
  v_folio     text;
  v_folio_n   int;
  v_subtotal  bigint;
  v_descuento bigint;
  v_total     bigint;
  v_metodo    text;
  v_pago      uuid;
  v_cuenta    int;
  v_esperado  bigint;
  v_contado   bigint;
  v_gasto     uuid;
  v_curso     record;
  v_conv      uuid;
  v_cuando    timestamptz;
  v_texto     text;
  v_hechas    int := 0;
  r           record;
begin
  /* --- Los tres candados ------------------------------------------- */
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.es_la_cuenta_de_demostracion() then
    raise exception 'Los datos de demostracion solo se cargan desde la cuenta de demostracion.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'Hace falta el permiso de configuracion para cargar la demostracion.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_paso is null or p_paso < 1 or p_paso > 9 then
    raise exception 'La demostracion se carga en 9 pasos, del 1 al 9.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL PASO 1 ES EL QUE COMPRUEBA QUE NO HAY NADA, y no los nueve: los pasos
  -- 2 al 9 encuentran —a proposito— lo que sembro el 1. Comprobarlo en todos
  -- haria imposible terminar la carga que se acaba de empezar.
  if p_paso = 1 and exists (select 1 from dato_de_demostracion where negocio_id = p_negocio) then
    raise exception 'Este centro ya tiene datos de demostracion. Quitalos antes de volver a cargarlos.'
      using errcode = 'unique_violation';
  end if;

  /*
   * UNA CAJA ABIERTA QUE NO ES DE LA DEMOSTRACION LA PARA EN SECO, Y ESTO SE
   * APRENDIO CARO: la primera carga de verdad murio en el paso 3 con
   *
   *   duplicate key value violates unique constraint "sesion_caja_una_abierta"
   *
   * La demostracion abre y cierra la caja de cada dia, uno por uno —es lo que
   * hace que el corte de cada dia cuadre con lo que se cobro ese dia— y la base
   * solo permite UNA caja abierta por centro. Si ya habia una del uso normal,
   * el primer dia sembrado choca contra ella.
   *
   * SE COMPRUEBA ANTES DE ESCRIBIR NADA, y el mensaje dice que hacer. Dejar que
   * reviente en el paso 3 significa dos pasos ya sembrados, un error que habla
   * de un indice y ninguna pista de que la culpa era de una caja abierta hace
   * semanas.
   *
   * NO SE CIERRA SOLA, y eso es a proposito: un corte de caja es un documento
   * firmado —quien lo cierra dice cuanto conto— y esta funcion no tiene ni idea
   * de cuanto dinero hay en ese cajon. Lo unico honesto es pararse y decirlo.
   */
  if (p_paso = 1 or p_paso between 3 and 8)
     and exists (
       select 1 from sesion_caja s
        where s.negocio_id = p_negocio and s.estado = 'abierta'
          and s.id not in (select d.fila_id from dato_de_demostracion d
                            where d.negocio_id = p_negocio and d.tabla = 'sesion_caja'
                              and d.fila_id is not null)) then
    raise exception 'Hay una caja abierta en este centro y la demostracion abre y cierra la de cada dia. Haz su corte en Caja -> Corte de caja y vuelve a intentarlo.'
      using errcode = 'invalid_parameter_value';
  end if;

  select m.id, m.nombre, coalesce(r2.etiqueta, m.rol)
    into v_membresia, v_nombre_yo, v_rol_yo
    from membresia m
    left join rol r2 on r2.negocio_id = m.negocio_id and r2.id = m.rol
   where m.negocio_id = p_negocio and m.usuario_id = v_usuario
   limit 1;

  select array_agg(m.id order by m.creado_en) into v_equipo
    from membresia m
   where m.negocio_id = p_negocio and m.activo and not m.eliminado;

  -- LA MISMA SEMILLA SIEMPRE. La variedad se quiere —no todos los dias
  -- iguales— pero la reproducibilidad tambien: una demostracion que sale
  -- distinta cada vez no se puede ensayar antes de enseñarla.
  perform setseed(0.4242);

  /* =================================================================
     PASO 1 — EL CATALOGO
     ================================================================= */
  if p_paso = 1 then

    /* Las categorias, de los cinco ambitos que las usan */
    with nuevas as (
      insert into categoria (negocio_id, ambito, nombre, descripcion, color, orden, creado_en)
      select p_negocio, x.ambito, x.nombre, x.descripcion, x.color, x.orden,
             (v_inicio - 4)::timestamp + time '10:00'
        from (values
          ('servicio', 'Masajes', 'Trabajo corporal manual', '#7FA37F', 1),
          ('servicio', 'Terapias energeticas', 'Reiki, biomagnetismo y limpieza', '#9C8AC4', 2),
          ('servicio', 'Terapias corporales', 'Ventosas, drenaje y reflexologia', '#5FA8B8', 3),
          ('servicio', 'Bienestar integral', 'Sesiones combinadas y seguimiento', '#D9A05B', 4),
          ('curso', 'Formaciones', 'Programas de varias sesiones', '#7FA37F', 1),
          ('curso', 'Talleres', 'Un dia, tema suelto', '#D9A05B', 2),
          ('producto', 'Aceites esenciales', 'Para masaje y difusor', '#7FA37F', 1),
          ('producto', 'Cristales', 'Cuarzos y minerales', '#9C8AC4', 2),
          ('producto', 'Aromaterapia', 'Inciensos, velas y difusores', '#D9A05B', 3),
          ('producto', 'Herbolaria', 'Tes, unguentos y tinturas', '#5FA8B8', 4),
          ('gasto', 'Renta', 'El local', '#D9A05B', 1),
          ('gasto', 'Servicios', 'Luz, agua e internet', '#5FA8B8', 2),
          ('gasto', 'Insumos', 'Aceites, sabanas y desechables', '#7FA37F', 3),
          ('gasto', 'Nomina', 'Pagos al equipo', '#9C8AC4', 4),
          ('gasto', 'Publicidad', 'Redes y volantes', '#C4788A', 5),
          ('gasto', 'Mantenimiento', 'Arreglos y limpieza a fondo', '#8A8A8A', 6),
          ('recordatorio', 'Seguimiento', 'Volver a llamar a alguien', '#7FA37F', 1),
          ('recordatorio', 'Administrativo', 'Papeles, pagos y tramites', '#5FA8B8', 2),
          ('recordatorio', 'Inventario', 'Lo que hay que reponer', '#D9A05B', 3),
          ('conversacion', 'Cita', 'Agendar, mover o confirmar', '#7FA37F', 1),
          ('conversacion', 'Informacion', 'Precios, horarios y dudas', '#5FA8B8', 2),
          ('conversacion', 'Seguimiento', 'Como siguio despues de la sesion', '#9C8AC4', 3)
        ) as x(ambito, nombre, descripcion, color, orden)
      -- SI EL CENTRO YA TENIA UNA QUE SE LLAMA IGUAL, SE RESPETA LA SUYA.
      -- `categoria_nombre_unico` no deja dos con el mismo nombre en el mismo
      -- ambito, y sin esto la carga entera moria por una categoria repetida.
      -- La que se queda es la del centro, y como no entra al rastro, quitar la
      -- demostracion tampoco se la lleva.
      on conflict do nothing
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'categoria', id from nuevas;

    /* Los servicios que se ofrecen */
    with nuevos as (
      insert into servicio (negocio_id, nombre, descripcion, duracion_min, precio_centavos,
                            categoria_id, color, requiere_preparacion, preparacion, notas,
                            activo, creado_en, actualizado_en)
      select p_negocio, x.nombre, x.descripcion, x.duracion, x.precio,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'servicio' and c.nombre = x.categoria),
             x.color, x.preparar, x.preparacion, x.notas, true,
             (v_inicio - 3)::timestamp + time '11:00', (v_inicio - 3)::timestamp + time '11:00'
        from (values
          ('Masaje relajante', 'Presion suave de cuerpo completo con aceite tibio', 60, 65000,
           'Masajes', '#7FA37F', false, null, 'El mas pedido de la tarde'),
          ('Masaje descontracturante', 'Trabajo profundo en espalda, cuello y hombros', 60, 75000,
           'Masajes', '#7FA37F', false, null, 'Se pregunta por lesiones antes de empezar'),
          ('Masaje con piedras calientes', 'Basalto templado sobre puntos de tension', 90, 95000,
           'Masajes', '#7FA37F', true, 'Calentar las piedras 40 minutos antes', null),
          ('Masaje prenatal', 'Postura lateral, presion suave, a partir del segundo trimestre', 60, 78000,
           'Masajes', '#7FA37F', true, 'Preparar cojines laterales', 'No antes de la semana 13'),
          ('Reiki', 'Imposicion de manos por centros energeticos', 50, 60000,
           'Terapias energeticas', '#9C8AC4', false, null, null),
          ('Biomagnetismo', 'Rastreo y colocacion de imanes por pares', 60, 80000,
           'Terapias energeticas', '#9C8AC4', true, 'Desinfectar los imanes entre sesiones', null),
          ('Limpieza energetica', 'Sahumerio, cuencos y barrido con hierbas', 45, 55000,
           'Terapias energeticas', '#9C8AC4', true, 'Ventilar la sala 15 minutos despues', null),
          ('Reflexologia podal', 'Puntos reflejos en pies', 45, 50000,
           'Terapias corporales', '#5FA8B8', false, null, null),
          ('Terapia de ventosas', 'Ventosas de silicon en espalda', 45, 65000,
           'Terapias corporales', '#5FA8B8', false, null, 'Avisar que deja marcas dos o tres dias'),
          ('Drenaje linfatico', 'Maniobras lentas de drenaje', 75, 90000,
           'Terapias corporales', '#5FA8B8', false, null, null),
          ('Aromaterapia', 'Sesion con mezcla personalizada de aceites', 60, 70000,
           'Bienestar integral', '#D9A05B', false, null, null),
          ('Auriculoterapia', 'Puntos en pabellon auricular con semillas', 40, 45000,
           'Bienestar integral', '#D9A05B', false, null, null)
        ) as x(nombre, descripcion, duracion, precio, categoria, color, preparar, preparacion, notas)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'servicio', id from nuevos;

    /* Los proveedores */
    with nuevos as (
      insert into proveedor (negocio_id, nombre, contacto, telefono, correo, notas, activo, creado_en)
      select p_negocio, x.nombre, x.contacto, x.telefono, x.correo, x.notas, true,
             (v_inicio - 2)::timestamp + time '12:00'
        from (values
          ('Aromas del Valle', 'Ventas mayoreo', '5544120987', 'ventas@aromasdelvalle.mx',
           'Entrega los martes. Pedido minimo 2 000 pesos.'),
          ('Cristales de Tepoztlan', 'Mostrador', '7773310455', 'hola@cristalestepoz.mx',
           'Se paga por transferencia antes del envio.'),
          ('Herbolaria San Juan', 'Pedidos', '5566780123', null,
           'Tienen te a granel; se pide por kilo.'),
          ('Distribuidora Zen', 'Atencion a centros', '5512349876', 'pedidos@zendistribuidora.mx',
           'Facturan a 15 dias.'),
          ('Velas Luna Artesanal', 'Taller', '5591230044', null,
           'Produccion propia, tardan una semana.')
        ) as x(nombre, contacto, telefono, correo, notas)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'proveedor', id from nuevos;

    /* Los productos de mostrador */
    with nuevos as (
      insert into producto (negocio_id, nombre, descripcion, precio_centavos, costo_centavos,
                            stock_actual, stock_minimo, sku, unidad, ubicacion, categoria_id,
                            activo, creado_en, actualizado_en)
      select p_negocio, x.nombre, x.descripcion, x.precio, x.costo, 0, x.minimo, x.sku,
             x.unidad, x.ubicacion,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'producto' and c.nombre = x.categoria),
             true, (v_inicio - 2)::timestamp + time '13:00', (v_inicio - 2)::timestamp + time '13:00'
        from (values
          ('Aceite esencial de lavanda 15 ml', 'Para difusor y masaje', 22000, 11000, 6, 'AE-LAV15',
           'pieza', 'Vitrina 1', 'Aceites esenciales'),
          ('Aceite esencial de romero 15 ml', 'Circulacion y concentracion', 22000, 11500, 5, 'AE-ROM15',
           'pieza', 'Vitrina 1', 'Aceites esenciales'),
          ('Aceite esencial de eucalipto 15 ml', 'Vias respiratorias', 20000, 10000, 5, 'AE-EUC15',
           'pieza', 'Vitrina 1', 'Aceites esenciales'),
          ('Aceite de almendras dulces 250 ml', 'Base para masaje', 18000, 8500, 8, 'AB-ALM250',
           'pieza', 'Bodega', 'Aceites esenciales'),
          ('Cuarzo rosa pulido', 'Pieza mediana', 15000, 6000, 6, 'CR-ROSA',
           'pieza', 'Vitrina 2', 'Cristales'),
          ('Amatista en bruto', 'Punta natural', 24000, 10500, 4, 'CR-AMA',
           'pieza', 'Vitrina 2', 'Cristales'),
          ('Cuarzo blanco punta', 'Pieza chica', 12000, 4800, 6, 'CR-BLA',
           'pieza', 'Vitrina 2', 'Cristales'),
          ('Incienso de copal', 'Caja con 20 varas', 6000, 2500, 10, 'AR-COP',
           'caja', 'Estante A', 'Aromaterapia'),
          ('Incienso de palo santo', 'Bolsa con 6 piezas', 9000, 4000, 8, 'AR-PSA',
           'bolsa', 'Estante A', 'Aromaterapia'),
          ('Vela de soya con lavanda', 'Vaso de 180 g', 17000, 7500, 6, 'AR-VSL',
           'pieza', 'Estante A', 'Aromaterapia'),
          ('Difusor de bambu', 'Ultrasonico, 300 ml', 45000, 24000, 3, 'AR-DIF',
           'pieza', 'Bodega', 'Aromaterapia'),
          ('Sales de bano de eucalipto', 'Bolsa de 500 g', 13000, 5500, 8, 'AR-SAL',
           'bolsa', 'Estante B', 'Aromaterapia'),
          ('Te relajante de tila y manzanilla', 'Bolsa de 100 g', 8500, 3500, 10, 'HB-TER',
           'bolsa', 'Estante B', 'Herbolaria'),
          ('Unguento de arnica', 'Frasco de 60 g', 12000, 5000, 8, 'HB-ARN',
           'pieza', 'Estante B', 'Herbolaria'),
          ('Roll-on de menta y lavanda', 'Para cuello y sienes', 9500, 3800, 10, 'HB-ROL',
           'pieza', 'Vitrina 1', 'Herbolaria'),
          ('Tintura de valeriana 30 ml', 'Gotero', 14000, 6200, 6, 'HB-VAL',
           'pieza', 'Estante B', 'Herbolaria')
        ) as x(nombre, descripcion, precio, costo, minimo, sku, unidad, ubicacion, categoria)
      -- Mismo motivo: `producto_sku_unico` es unico por centro y el de aqui
      -- podria chocar con uno que ya exista.
      on conflict do nothing
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'producto', id from nuevos;

    /* A quien se le compra cada cosa */
    with nuevos as (
      insert into producto_proveedor (negocio_id, producto_id, proveedor_id, costo_centavos,
                                      codigo, preferido, creado_en)
      select p_negocio, p.id, pr.id, p.costo_centavos, upper(left(p.sku, 6)), true,
             (v_inicio - 2)::timestamp + time '13:30'
        from producto p
        join categoria c on c.id = p.categoria_id
        join proveedor pr on pr.negocio_id = p_negocio and pr.nombre = case c.nombre
               when 'Aceites esenciales' then 'Aromas del Valle'
               when 'Cristales' then 'Cristales de Tepoztlan'
               when 'Herbolaria' then 'Herbolaria San Juan'
               else 'Distribuidora Zen' end
       where p.negocio_id = p_negocio
         and p.id in (select fila_id from dato_de_demostracion
                       where negocio_id = p_negocio and tabla = 'producto')
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'producto_proveedor', id from nuevos;

    /* El inventario inicial: lo que habia el dia que arranco la historia */
    for r in
      select p.id, p.costo_centavos, x.inicial
        from (values
          ('Aceite esencial de lavanda 15 ml', 24), ('Aceite esencial de romero 15 ml', 18),
          ('Aceite esencial de eucalipto 15 ml', 18), ('Aceite de almendras dulces 250 ml', 30),
          ('Cuarzo rosa pulido', 20), ('Amatista en bruto', 12),
          ('Cuarzo blanco punta', 18), ('Incienso de copal', 40),
          ('Incienso de palo santo', 25), ('Vela de soya con lavanda', 22),
          ('Difusor de bambu', 8), ('Sales de bano de eucalipto', 24),
          ('Te relajante de tila y manzanilla', 30), ('Unguento de arnica', 20),
          ('Roll-on de menta y lavanda', 28), ('Tintura de valeriana 30 ml', 14)
        ) as x(nombre, inicial)
        join producto p on p.negocio_id = p_negocio and p.nombre = x.nombre
    loop
      perform app.demo_mover_inventario(p_negocio, r.id, 'inicial', r.inicial,
        'Inventario inicial del centro', null, null, r.costo_centavos,
        (v_inicio - 1)::timestamp + time '09:00', v_usuario);
    end loop;

    /* Los cursos: dos terminados, uno corriendo y dos por venir */
    with nuevos as (
      insert into curso (negocio_id, nombre, subtitulo, descripcion, categoria_id, instructor_id,
                         fecha_inicio, fecha_fin, cupo, precio_centavos, modalidad, lugar,
                         estado, activo, notas, creado_en, actualizado_en)
      select p_negocio, x.nombre, x.subtitulo, x.descripcion,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'curso' and c.nombre = x.categoria),
             v_membresia,
             v_hoy + x.empieza, v_hoy + x.termina, x.cupo, x.precio, x.modalidad, x.lugar,
             x.estado, true, x.notas,
             (v_hoy + x.empieza - 30)::timestamp + time '17:00',
             (v_hoy + x.empieza - 30)::timestamp + time '17:00'
        from (values
          ('Formacion en masaje holistico', 'Modulo I: fundamentos',
           'Ocho sesiones de tecnica basica, anatomia aplicada y practica supervisada.',
           'Formaciones', -130, -100, 12, 480000, 'presencial', 'Sala grande', 'terminado', null),
          ('Taller de Reiki nivel I', 'Iniciacion y practica',
           'Un fin de semana: historia, simbolos e imposicion de manos.',
           'Talleres', -95, -94, 10, 180000, 'presencial', 'Sala grande', 'terminado', null),
          ('Aromaterapia aplicada al masaje', 'Mezclas y seguridad',
           'Como elegir y diluir aceites esenciales segun el caso.',
           'Talleres', -60, -60, 14, 150000, 'presencial', 'Sala grande', 'terminado', null),
          ('Taller de Reiki nivel II', 'Simbolos y distancia',
           'Continuacion del nivel I, con practica entre companeros.',
           'Talleres', -6, 8, 10, 220000, 'presencial', 'Sala grande', 'en_curso',
           'Dos personas del nivel I pidieron lugar.'),
          ('Introduccion al biomagnetismo', 'Pares biomagneticos',
           'Rastreo, pares principales y protocolo de higiene.',
           'Formaciones', 24, 52, 12, 520000, 'presencial', 'Sala grande', 'programado', null),
          ('Taller de piedras calientes', 'Tecnica y cuidados',
           'Manejo del calor, secuencia y contraindicaciones.',
           'Talleres', 40, 40, 8, 190000, 'presencial', 'Sala chica', 'programado', null)
        ) as x(nombre, subtitulo, descripcion, categoria, empieza, termina, cupo, precio,
               modalidad, lugar, estado, notas)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'curso', id from nuevos;

    /* Las sesiones de cada curso */
    for v_curso in
      select c.id, c.nombre, c.fecha_inicio, c.fecha_fin, c.estado
        from curso c
       where c.negocio_id = p_negocio
         and c.id in (select fila_id from dato_de_demostracion
                       where negocio_id = p_negocio and tabla = 'curso')
    loop
      -- UNA SESION POR SEMANA, con un tope de cuatro. Un taller de un dia tiene
      -- una sola; una formacion de un mes, cuatro. Repartirlas por semanas y no
      -- por un numero fijo evita el absurdo de cuatro sesiones dentro de un
      -- curso que dura un dia.
      v_cuantas := greatest(1, least(4, (v_curso.fecha_fin - v_curso.fecha_inicio) / 7 + 1));
      for v_i in 1..v_cuantas loop
        v_dia := v_curso.fecha_inicio
                 + ((v_i - 1) * ((v_curso.fecha_fin - v_curso.fecha_inicio) / v_cuantas));
        insert into sesion_curso (negocio_id, curso_id, titulo, fecha, hora_inicio, hora_fin,
                                  instructor_id, lugar, estado, creado_en)
        values (p_negocio, v_curso.id, 'Sesion ' || v_i, v_dia, time '10:00', time '14:00',
                v_membresia, 'Sala grande',
                case when v_dia < v_hoy then 'impartida' else 'programada' end,
                (v_curso.fecha_inicio - 25)::timestamp + time '18:00')
        returning id into v_id;
        perform app.demo_anotar(p_negocio, 'sesion_curso', v_id);
      end loop;

      insert into material_curso (negocio_id, curso_id, titulo, tipo, descripcion,
                                  visible_para_alumnos, creado_en)
      values (p_negocio, v_curso.id, 'Manual del participante', 'nota',
              'Se entrega impreso el primer dia.', true,
              (v_curso.fecha_inicio - 20)::timestamp + time '18:00')
      returning id into v_id;
      perform app.demo_anotar(p_negocio, 'material_curso', v_id);
    end loop;

    /* Los canales de mensajes */
    insert into canal_de_mensajes (negocio_id, tipo, nombre, identificador, estado,
                                   activo, creado_en)
    values (p_negocio, 'manual', 'WhatsApp del centro (captura manual)', '5561230099',
            'conectado', true, (v_inicio - 1)::timestamp + time '10:00')
    returning id into v_conv;
    perform app.demo_anotar(p_negocio, 'canal_de_mensajes', v_conv);

    insert into canal_de_mensajes (negocio_id, tipo, nombre, identificador, estado,
                                   activo, creado_en)
    values (p_negocio, 'whatsapp', 'WhatsApp Business (por conectar)', null,
            'sin_conectar', true, (v_inicio - 1)::timestamp + time '10:05')
    returning id into v_id;
    perform app.demo_anotar(p_negocio, 'canal_de_mensajes', v_id);

    /* Las plantillas de mensaje */
    with nuevas as (
      insert into plantilla_de_mensaje (negocio_id, nombre, categoria, cuerpo, canal_tipo,
                                        activa, creado_en)
      select p_negocio, x.nombre, x.categoria, x.cuerpo, 'manual', true,
             (v_inicio - 1)::timestamp + time '10:30'
        from (values
          ('Recordatorio de cita', 'citas',
           'Hola {{cliente.nombre}}, te recordamos tu cita de {{cita.servicio}} el {{cita.fecha}} a las {{cita.hora}}. Si necesitas moverla, contestanos por aqui.'),
          ('Confirmacion de cita', 'citas',
           'Listo {{cliente.nombre}}, quedo agendada tu cita de {{cita.servicio}} el {{cita.fecha}} a las {{cita.hora}}. Te esperamos 10 minutos antes.'),
          ('Seguimiento despues de la sesion', 'seguimiento',
           'Hola {{cliente.nombre}}, ¿como te sentiste despues de la sesion? Recuerda tomar agua y descansar hoy.'),
          ('Aviso de promocion', 'promociones',
           'Este mes tenemos precio especial en {{servicio.nombre}}. Si quieres apartar lugar, contestanos por aqui.'),
          ('Curso por empezar', 'cursos',
           'Hola {{cliente.nombre}}, el curso {{curso.nombre}} empieza el {{curso.fecha}}. Te apartamos lugar.'),
          ('Cobro pendiente', 'cobros',
           'Hola {{cliente.nombre}}, nos quedo pendiente el pago de tu ultima sesion. Cuando gustes lo vemos.')
        ) as x(nombre, categoria, cuerpo)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'plantilla_de_mensaje', id from nuevas;

    /*
     * DOS AUTOMATIZACIONES DE MENSAJES, LAS DOS APAGADAS.
     *
     * Apagadas no es un descuido: mandarle mensajes a los pacientes de alguien
     * sin que esa persona lo haya pedido es de lo poco que este sistema no
     * puede deshacer, y ademas todavia no hay un servidor que las dispare. Se
     * siembran para que la pantalla de automatizaciones tenga algo que enseñar
     * —vacia no se entiende para que sirve— y se ven tal como estan: a la
     * espera.
     */
    with nuevas as (
      insert into automatizacion_de_mensajes (negocio_id, evento, plantilla_id, canal_id,
                                              activa, creado_en)
      select p_negocio, x.evento,
             (select p.id from plantilla_de_mensaje p
               where p.negocio_id = p_negocio and p.nombre = x.plantilla),
             (select c.id from canal_de_mensajes c
               where c.negocio_id = p_negocio and c.tipo = 'manual' limit 1),
             false, (v_inicio - 1)::timestamp + time '10:40'
        from (values
          ('cita_recordatorio', 'Recordatorio de cita'),
          ('seguimiento', 'Seguimiento despues de la sesion')
        ) as x(evento, plantilla)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'automatizacion_de_mensajes', id from nuevas;

    /* Los gastos que se repiten cada mes */
    with nuevos as (
      insert into gasto_recurrente (negocio_id, descripcion, detalle, categoria_id, proveedor_id,
                                    monto_centavos, metodo, efectivo_centavos, frecuencia,
                                    fecha_inicio, proxima_fecha, estado, notas, creado_por, creado_en)
      select p_negocio, x.descripcion, x.detalle,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'gasto' and c.nombre = x.categoria),
             null, x.monto, x.metodo,
             case when x.metodo = 'efectivo' then x.monto else 0 end,
             x.frecuencia, v_inicio,
             -- LA PROXIMA SIEMPRE EN EL FUTURO. Con una fecha ya pasada, la
             -- primera vez que alguien abra Gastos la generacion crearia gastos
             -- de verdad —no de demostracion— que despues nadie sabria quitar.
             case when x.frecuencia = 'semanal'
                  then v_hoy + (8 - extract(isodow from v_hoy)::int)
                  else (date_trunc('month', v_hoy::timestamp) + interval '1 month')::date end,
             'activo', x.notas, v_usuario, (v_inicio - 1)::timestamp + time '11:00'
        from (values
          ('Renta del local', 'Deposito a la cuenta del arrendador', 'Renta', 1200000,
           'transferencia', 'mensual', 'Se paga los primeros tres dias del mes.'),
          ('Internet y telefono', 'Paquete del centro', 'Servicios', 89900,
           'transferencia', 'mensual', null),
          ('Lavanderia de sabanas', 'Servicio semanal a domicilio', 'Servicios', 65000,
           'efectivo', 'semanal', null)
        ) as x(descripcion, detalle, categoria, monto, metodo, frecuencia, notas)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'gasto_recurrente', id from nuevos;

    /* Los ajustes de recordatorios, si el centro no tenia los suyos */
    insert into recordatorio_ajustes (negocio_id, avisar_en_navegador, anticipacion_min,
                                      hora_por_omision, dias_de_proximos, orden_por_omision,
                                      consejo, actualizado_en, actualizado_por)
    values (p_negocio, false, 30, time '09:00', 7, 'urgencia',
            'Confirma las citas del dia siguiente antes de cerrar.', now(), v_usuario)
    on conflict (negocio_id) do nothing;
    if found then
      insert into dato_de_demostracion (negocio_id, tabla, llave)
      values (p_negocio, 'recordatorio_ajustes', p_negocio);
    end if;

    /* Dos automatizaciones encendidas, para que se vea que se pueden encender */
    with nuevas as (
      insert into recordatorio_automatizacion (negocio_id, evento, activa, plantilla_titulo,
                                               plantilla_detalle, dias_antes, hora, prioridad,
                                               categoria_id, responsable_id, creado_en)
      select p_negocio, x.evento, x.activa, x.titulo, x.detalle, x.dias, time '09:00', x.prioridad,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'recordatorio' and c.nombre = x.categoria),
             v_membresia, (v_inicio + 10)::timestamp + time '09:00'
        from (values
          ('cita_nueva', true, 'Confirmar la cita de {nombre}',
           'Llamar o escribir un dia antes.', 1, 'normal', 'Seguimiento'),
          ('stock_bajo', true, 'Reponer {nombre}',
           'Quedan pocas piezas en vitrina.', 0, 'alta', 'Inventario')
        ) as x(evento, activa, titulo, detalle, dias, prioridad, categoria)
      -- UNA REGLA POR EVENTO Y POR CENTRO, dice la tabla. Si el centro ya
      -- encendio la de "cita nueva", la suya manda y la demostracion no la
      -- pisa: encenderle a alguien una automatizacion que apago es de las
      -- pocas cosas que este sistema no puede deshacer.
      on conflict do nothing
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'recordatorio_automatizacion', id from nuevas;

    /* La ficha del centro, SOLO si estaba vacia */
    --
    -- No se pisa lo que el centro ya haya escrito. Si alguien ya puso su
    -- direccion y su telefono, esos son datos de verdad y valen mas que
    -- cualquier cosa que se pueda inventar aqui.
    if not exists (select 1 from estado e
                    where e.negocio_id = p_negocio and e.data ? 'centro') then
      insert into estado (negocio_id, data)
      values (p_negocio, jsonb_build_object('centro', jsonb_build_object(
        'lema', 'Bienestar & Terapias',
        'descripcion', 'Centro de terapias holisticas: masaje, reiki, biomagnetismo y formacion.',
        'telefono', '5561230099',
        'correo', 'contacto@centroholistico.mx',
        'sitio', 'https://centroholistico.mx',
        'direccion', 'Av. de los Fresnos 148, local 3',
        'ciudad', 'Ciudad de Mexico',
        'estado', 'CDMX',
        'pais', 'Mexico',
        'codigoPostal', '04100',
        'instagram', 'centroholistico.mx',
        'whatsapp', '5561230099',
        'zonaHoraria', 'America/Mexico_City',
        'moneda', 'MXN',
        'decimales', 2,
        'impuestoNombre', 'IVA',
        'impuestoTasa', 0,
        'impuestoIncluido', true,
        'metodosDePago', jsonb_build_array('efectivo', 'tarjeta', 'transferencia'),
        'pieDeComprobante', 'Gracias por tu visita. Toma agua y descansa hoy.',
        'horarios', jsonb_build_array(
          jsonb_build_object('dia', 1, 'cerrado', false, 'abre', '09:00', 'cierra', '19:00'),
          jsonb_build_object('dia', 2, 'cerrado', false, 'abre', '09:00', 'cierra', '19:00'),
          jsonb_build_object('dia', 3, 'cerrado', false, 'abre', '09:00', 'cierra', '19:00'),
          jsonb_build_object('dia', 4, 'cerrado', false, 'abre', '09:00', 'cierra', '19:00'),
          jsonb_build_object('dia', 5, 'cerrado', false, 'abre', '09:00', 'cierra', '19:00'),
          jsonb_build_object('dia', 6, 'cerrado', false, 'abre', '10:00', 'cierra', '15:00'),
          jsonb_build_object('dia', 7, 'cerrado', true, 'abre', '09:00', 'cierra', '19:00')))))
      on conflict (negocio_id) do update
        set data = coalesce(estado.data, '{}'::jsonb) || excluded.data,
            updated_at = now();
      insert into dato_de_demostracion (negocio_id, tabla, llave)
      values (p_negocio, 'estado.centro', 'centro');
    end if;

    v_hechas := (select count(*) from dato_de_demostracion where negocio_id = p_negocio);
  end if;

  /* =================================================================
     PASO 2 — LOS PACIENTES
     ================================================================= */
  if p_paso = 2 then

    /*
     * NO TODOS SE DIERON DE ALTA EL MISMO DIA, y eso es la mitad del realismo:
     * doce ya eran pacientes cuando arranca la historia y los otros treinta y
     * tres van entrando a lo largo de los cinco meses. Asi "pacientes nuevos
     * este mes" enseña un numero que significa algo, y el expediente de alguien
     * de hace cinco meses tiene mas sesiones que el de quien llego el martes.
     */
    with gente(i, nombre, telefono, correo, edad, ocupacion, como, notas) as (values
      (1,  'Adriana Villalobos',  '5541230011', 'adriana.villalobos@correo.mx', 41, 'Contadora',       'Recomendacion', 'Viene cada quince dias desde que abrimos.'),
      (2,  'Roberto Quinones',    '5541230012', 'r.quinones@correo.mx',         53, 'Chofer',          'Paso por la calle', null),
      (3,  'Fernanda Escobar',    '5541230013', 'fer.escobar@correo.mx',        29, 'Disenadora',      'Instagram', 'Prefiere las tardes.'),
      (4,  'Ignacio Salgado',     '5541230014', null,                           60, 'Jubilado',        'Recomendacion', null),
      (5,  'Patricia Zuniga',     '5541230015', 'paty.zuniga@correo.mx',        47, 'Maestra',         'Recomendacion', null),
      (6,  'Hector Arreola',      '5541230016', null,                           38, 'Programador',     'Google', 'Trabaja sentado todo el dia.'),
      (7,  'Mariana Cuevas',      '5541230017', 'mariana.cuevas@correo.mx',     34, 'Enfermera',       'Recomendacion', null),
      (8,  'Gabriel Orozco Rivas','5541230018', null,                           45, 'Comerciante',     'Paso por la calle', null),
      (9,  'Silvia Bermudez',     '5541230019', 'silvia.bermudez@correo.mx',    56, 'Ama de casa',     'Recomendacion', null),
      (10, 'Oscar Villagomez',    '5541230020', null,                           31, 'Entrenador',      'Instagram', null),
      (11, 'Rocio Tapia',         '5541230021', 'rocio.tapia@correo.mx',        44, 'Abogada',         'Recomendacion', null),
      (12, 'Ernesto Valadez',     '5541230022', null,                           49, 'Mecanico',        'Paso por la calle', null),
      (13, 'Alejandra Najera',    '5541230023', 'ale.najera@correo.mx',         27, 'Estudiante',      'Instagram', null),
      (14, 'Ramiro Cifuentes',    '5541230024', null,                           62, 'Jubilado',        'Recomendacion', null),
      (15, 'Noemi Lizarraga',     '5541230025', 'noemi.liz@correo.mx',          39, 'Nutriologa',      'Recomendacion', null),
      (16, 'Sergio Padilla',      '5541230026', null,                           50, 'Vendedor',        'Google', null),
      (17, 'Veronica Ibarra',     '5541230027', 'vero.ibarra@correo.mx',        36, 'Psicologa',       'Recomendacion', 'Manda pacientes suyos.'),
      (18, 'Arturo Cadena',       '5541230028', null,                           43, 'Arquitecto',      'Paso por la calle', null),
      (19, 'Lucia Fajardo',       '5541230029', 'lucia.fajardo@correo.mx',      33, 'Fotografa',       'Instagram', null),
      (20, 'Emilio Renteria',     '5541230030', null,                           55, 'Ingeniero',       'Recomendacion', null),
      (21, 'Claudia Banuelos',    '5541230031', 'claudia.b@correo.mx',          42, 'Administradora',  'Google', null),
      (22, 'Javier Montenegro',   '5541230032', null,                           37, 'Cocinero',        'Paso por la calle', 'Trabaja de pie doce horas.'),
      (23, 'Rosalia Guevara',     '5541230033', 'rosalia.guevara@correo.mx',    58, 'Costurera',       'Recomendacion', null),
      (24, 'Ulises Penaloza',     '5541230034', null,                           30, 'Musico',          'Instagram', null),
      (25, 'Andrea Sotomayor',    '5541230035', 'andrea.soto@correo.mx',        26, 'Pasante',         'Instagram', null),
      (26, 'Fabian Corona',       '5541230036', null,                           48, 'Taxista',         'Paso por la calle', null),
      (27, 'Marisol Aguirre',     '5541230037', 'marisol.aguirre@correo.mx',    35, 'Recepcionista',   'Recomendacion', null),
      (28, 'Ruben Cisneros',      '5541230038', null,                           52, 'Electricista',    'Google', null),
      (29, 'Elena Barajas',       '5541230039', 'elena.barajas@correo.mx',      40, 'Terapeuta',       'Recomendacion', null),
      (30, 'Tomas Verdugo',       '5541230040', null,                           28, 'Repartidor',      'Paso por la calle', null),
      (31, 'Yolanda Espinosa',    '5541230041', 'yolanda.esp@correo.mx',        61, 'Jubilada',        'Recomendacion', null),
      (32, 'Ivan Roldan',         '5541230042', null,                           34, 'Contador',        'Google', null),
      (33, 'Beatriz Camarena',    '5541230043', 'bety.camarena@correo.mx',      46, 'Enfermera',       'Recomendacion', null),
      (34, 'Salvador Trujillo',   '5541230044', null,                           57, 'Carpintero',      'Paso por la calle', null),
      (35, 'Diana Alcantara',     '5541230045', 'diana.alcantara@correo.mx',    32, 'Publicista',      'Instagram', null),
      (36, 'Nicolas Gaytan',      '5541230046', null,                           39, 'Ingeniero',       'Recomendacion', null),
      (37, 'Estefania Robles',    '5541230047', 'estefania.robles@correo.mx',   25, 'Estudiante',      'Instagram', null),
      (38, 'Gerardo Maldonado',   '5541230048', null,                           51, 'Gerente',         'Google', null),
      (39, 'Karina Bustamante',   '5541230049', 'karina.busta@correo.mx',       37, 'Docente',         'Recomendacion', null),
      (40, 'Alfonso Rivas',       '5541230050', null,                           44, 'Comerciante',     'Paso por la calle', null),
      (41, 'Guadalupe Mercado',   '5541230051', 'lupita.mercado@correo.mx',     54, 'Enfermera',       'Recomendacion', null),
      (42, 'Edgar Villasenor',    '5541230052', null,                           29, 'Barista',         'Instagram', null),
      (43, 'Sofia Zamudio',       '5541230053', 'sofia.zamudio@correo.mx',      31, 'Veterinaria',     'Google', null),
      (44, 'Manuel Andrade',      '5541230054', null,                           47, 'Chofer',          'Paso por la calle', null),
      (45, 'Renata Ochoa',        '5541230055', 'renata.ochoa@correo.mx',       33, 'Traductora',      'Recomendacion', 'Llego por la promocion de septiembre.')
    ),
    nuevos as (
      insert into cliente (negocio_id, nombre, telefono, correo, fecha_nacimiento, ocupacion,
                           como_nos_conocio, notas, acepta_promociones, creado_en, actualizado_en)
      select p_negocio, g.nombre, g.telefono, g.correo,
             (v_hoy - (g.edad * 365 + 60))::date, g.ocupacion, g.como, g.notas,
             (g.i % 7) <> 0,
             case when g.i <= 12
                  then (v_inicio - (13 - g.i) * 9)::timestamp + time '10:00'
                  else (v_inicio + ((g.i - 12) * greatest(1, (v_hoy - v_inicio) - 5) / 33))::timestamp
                       + time '10:00'
             end,
             case when g.i <= 12
                  then (v_inicio - (13 - g.i) * 9)::timestamp + time '10:00'
                  else (v_inicio + ((g.i - 12) * greatest(1, (v_hoy - v_inicio) - 5) / 33))::timestamp
                       + time '10:00'
             end
        from gente g
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'cliente', id from nuevos;

    /*
     * EL EXPEDIENTE CLINICO, EN LOS QUE DE VERDAD TIENEN ALGO.
     *
     * No se le inventa un padecimiento a los cuarenta y cinco: en un centro
     * real la mayoria no trae nada que avisar, y una franja de aviso que sale
     * en todas las fichas se deja de leer en una semana. Estos catorce son los
     * que hacen falta para enseñar para que sirve el aviso — incluida una
     * embarazada, una alergia y un anticoagulante, que son los tres casos que
     * cambian lo que la terapeuta puede hacer.
     */
    for r in
      select * from (values
        ('Adriana Villalobos', 'Contracturas cervicales por escritorio', null, null,
         'Presion firme en trapecios; evitar cuello anterior.', 'firme', null,
         'Marco Villalobos', '5541239911'),
        ('Roberto Quinones', 'Hernia lumbar L4-L5 diagnosticada hace dos anos',
         null, 'Naproxeno ocasional',
         'NO trabajar zona lumbar profunda. Nada de descontracturante en espalda baja.',
         'media', null, 'Elsa Quinones', '5541239912'),
        ('Patricia Zuniga', 'Migrana cronica', 'Alergia al aceite de menta', null,
         'Evitar aromas fuertes; luz baja en la sala.', 'suave', 'menta, eucalipto',
         'Jorge Zuniga', '5541239913'),
        ('Silvia Bermudez', 'Hipertension controlada', null, 'Losartan diario',
         'Levantarse despacio al terminar la sesion.', 'suave', null,
         'Ana Bermudez', '5541239914'),
        ('Mariana Cuevas', 'Embarazo de 22 semanas', null, 'Acido folico',
         'Solo masaje prenatal, en decubito lateral. Nada de aceites con salvia ni romero.',
         'suave', 'salvia, romero', 'Luis Cuevas', '5541239915'),
        ('Ignacio Salgado', 'Artrosis de rodilla', null, 'Acenocumarol (anticoagulante)',
         'ANTICOAGULANTE: presion suave, sin ventosas ni maniobras profundas.',
         'suave', null, 'Marta Salgado', '5541239916'),
        ('Hector Arreola', 'Tendinitis en muneca derecha', null, null,
         'Evitar antebrazo derecho hasta que lo revise el traumatologo.', 'media', null,
         'Sonia Arreola', '5541239917'),
        ('Javier Montenegro', 'Varices en piernas', null, null,
         'Nada de presion descendente en piernas; drenaje siempre hacia el corazon.',
         'suave', null, 'Rita Montenegro', '5541239918'),
        ('Rosalia Guevara', 'Fibromialgia', 'Alergia al latex', 'Pregabalina',
         'Sesiones cortas; avisar antes de cada maniobra nueva.', 'suave', null,
         'Hugo Guevara', '5541239919'),
        ('Yolanda Espinosa', 'Osteoporosis', null, 'Calcio y vitamina D',
         'Nada de presion profunda sobre costillas ni columna.', 'suave', null,
         'Rene Espinosa', '5541239920'),
        ('Guadalupe Mercado', 'Diabetes tipo 2', null, 'Metformina',
         'Revisar pies antes de reflexologia; si hay herida, no se toca.', 'media', null,
         'Sara Mercado', '5541239921'),
        ('Beatriz Camarena', 'Cirugia de hombro hace ocho meses', null, null,
         'Rango limitado en hombro izquierdo; no forzar.', 'media', null,
         'Omar Camarena', '5541239922'),
        ('Salvador Trujillo', 'Dolor ciatico recurrente', null, 'Ibuprofeno en crisis',
         'En crisis, solo trabajo suave y calor.', 'media', null,
         'Lidia Trujillo', '5541239923'),
        ('Renata Ochoa', 'Ansiedad', 'Alergia a la lavanda', null,
         'Evitar lavanda en difusor y aceite. Musica baja.', 'suave', 'lavanda',
         'Pablo Ochoa', '5541239924')
      ) as x(nombre, padecimientos, alergias, medicamentos, contraindicaciones,
             presion, aromas, emergencia, telefono_emergencia)
    loop
      update cliente
         set padecimientos = r.padecimientos,
             alergias = r.alergias,
             medicamentos = r.medicamentos,
             contraindicaciones = r.contraindicaciones,
             presion_preferida = r.presion,
             aromas_evitar = r.aromas,
             contacto_emergencia = r.emergencia,
             telefono_emergencia = r.telefono_emergencia,
             embarazo = case when r.nombre = 'Mariana Cuevas' then '22 semanas' end
       where negocio_id = p_negocio and nombre = r.nombre;
    end loop;

    v_hechas := (select count(*) from dato_de_demostracion
                  where negocio_id = p_negocio and tabla = 'cliente');
  end if;

  /* =================================================================
     PASOS 3 AL 8 — UN MES DE TRABAJO POR PASO
     ================================================================= */
  if p_paso between 3 and 8 then

    v_mes := (date_trunc('month', v_hoy::timestamp) - make_interval(months => 8 - p_paso))::date;
    -- El ultimo paso llega hasta hoy y sigue TRES SEMANAS mas alla: una agenda
    -- que se acaba hoy no se parece a la de un centro que trabaja.
    if p_paso = 8 then
      v_fin := v_hoy + 21;
    else
      v_fin := (v_mes + interval '1 month')::date - 1;
    end if;

    select array_agg(c.id order by c.creado_en, c.nombre) into v_clientes
      from cliente c
     where c.negocio_id = p_negocio
       and c.id in (select fila_id from dato_de_demostracion
                     where negocio_id = p_negocio and tabla = 'cliente');
    select array_agg(s.id order by s.nombre) into v_servicios
      from servicio s
     where s.negocio_id = p_negocio
       and s.id in (select fila_id from dato_de_demostracion
                     where negocio_id = p_negocio and tabla = 'servicio');
    select array_agg(p.id order by p.nombre) into v_productos
      from producto p
     where p.negocio_id = p_negocio
       and p.id in (select fila_id from dato_de_demostracion
                     where negocio_id = p_negocio and tabla = 'producto');

    if v_clientes is null or v_servicios is null then
      raise exception 'Faltan los pasos 1 y 2: no hay ni catalogo ni pacientes que agendar.'
        using errcode = 'no_data_found';
    end if;

    -- EL FOLIO SIGUE DONDE LO DEJO EL MES ANTERIOR. Es la misma cuenta que
    -- hace `siguiente_folio`: el mayor que exista o haya existido, mas uno.
    select coalesce(max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int), 0)
      into v_folio_n from venta where negocio_id = p_negocio;

    v_dia := v_mes;
    while v_dia <= v_fin loop
      v_dow := extract(isodow from v_dia)::int;

      -- DOMINGO CERRADO, y sabado corto. Es el horario que deja escrito el
      -- paso 1: una agenda con citas en domingo contradice la configuracion
      -- del propio centro en la primera pantalla que alguien abra.
      if v_dow <> 7 then

        /* --- Se abre la caja del dia ------------------------------- */
        if v_dia <= v_hoy then
          insert into sesion_caja (negocio_id, nombre, estado, saldo_inicial_centavos,
                                   abierta_por, abierta_en, observaciones, creado_en)
          values (p_negocio, 'Caja del ' || to_char(v_dia, 'DD/MM/YYYY'), 'abierta', 150000,
                  v_membresia, v_dia::timestamp + time '08:45',
                  'Fondo fijo de mil quinientos pesos.', v_dia::timestamp + time '08:45')
          returning id into v_sesion;
          perform app.demo_anotar(p_negocio, 'sesion_caja', v_sesion);
        else
          v_sesion := null;
        end if;

        /* --- Las citas del dia ------------------------------------- */
        v_cuantas := case when v_dow = 6 then 3 else 4 + (random() * 2)::int end;
        -- Cuanta gente existia YA ese dia. Agendar en marzo a alguien que se
        -- dio de alta en julio es el detalle que delata unos datos inventados.
        v_elegibles := least(array_length(v_clientes, 1),
                             greatest(8, 12 + ((v_dia - v_inicio) * 33)
                                              / greatest(1, v_hoy - v_inicio)));

        for v_i in 1..v_cuantas loop
          v_hora := time '09:00' + make_interval(mins => (v_i - 1) * 90);

          /*
           * EL SORTEO SE HACE FUERA DE LA CONSULTA, Y ESTO COSTO UNA CARGA
           * ENTERA. La primera version decia:
           *
           *   select ... into ... from servicio s
           *    where s.id = v_servicios[1 + floor(random() * ...)::int];
           *
           * y reventaba con "null value in column servicio_id of relation
           * cita violates not-null constraint" en un dia cualquiera del tercer
           * paso. La causa no se ve leyendolo: `random()` es VOLATIL, asi que
           * el motor la evalua UNA VEZ POR CADA FILA que examina. Con doce
           * servicios, cada fila se comparaba contra un sorteo distinto y las
           * doce podian fallar a la vez — una de cada tres veces no encontraba
           * ninguna, la consulta no devolvia nada, y `select into` deja las
           * variables en nulo sin quejarse. El error salia tres lineas mas
           * abajo, en el insert, hablando de otra cosa.
           *
           * Sorteado antes en una variable, el sorteo ocurre una vez y la
           * consulta busca un id fijo. Es la misma trampa que un `where
           * fecha > now()` dentro de un bucle: la funcion volatil no se queda
           * quieta solo porque uno la lea como si fuera un valor.
           */
          v_serv_id := v_servicios[1 + floor(random() * array_length(v_servicios, 1))::int];
          select s.nombre, s.duracion_min, s.precio_centavos
            into v_serv_nombre, v_serv_min, v_serv_precio
            from servicio s
           where s.id = v_serv_id;

          v_cliente := v_clientes[1 + floor(random() * v_elegibles)::int];

          if v_dia < v_hoy then
            v_estado := case when random() < 0.87 then 'completada'
                             when random() < 0.6 then 'cancelada'
                             else 'no_asistio' end;
          elsif v_dia = v_hoy then
            v_estado := case when v_hora < localtime then 'completada' else 'confirmada' end;
          else
            v_estado := case when random() < 0.7 then 'confirmada' else 'pendiente' end;
          end if;

          v_texto := case
            when v_estado = 'completada' then (array[
              'Mucha tension en trapecios. Se trabajo con calor previo y quedo mejor.',
              'Sesion completa sin novedad. Se recomendo tomar agua y no cargar peso hoy.',
              'Refiere dolor de cuello desde el lunes. Se libero con maniobras suaves.',
              'Segunda sesion de la serie. Va notando menos rigidez al despertar.',
              'Se trabajo espalda baja con presion media. Queda pendiente revisar cadera.',
              'Llego con dolor de cabeza; se trabajo craneal y salio sin molestia.'])
              [1 + floor(random() * 6)::int]
            when v_estado = 'cancelada' then 'Cancelo el mismo dia por trabajo.'
            when v_estado = 'no_asistio' then 'No llego y no aviso.'
            else null end;

          /*
           * SI ESA HORA YA ESTABA OCUPADA, LA DEMOSTRACION NO LA PISA.
           *
           * ESTO REVENTO EL PASO 8 EN UN CENTRO DE VERDAD:
           *
           *   conflicting key value violates exclusion constraint "cita_sin_choque"
           *
           * La demostracion siembra a las 09:00, 10:30, 12:00… y esas horas
           * entre ellas no chocan nunca. Con quien choca es con las citas que ya
           * habia en la agenda: cualquiera que haya estado probando el sistema
           * tiene una a las nueve de un martes, y la restriccion de exclusion
           * —que es la que impide dos pacientes en la misma sala a la misma
           * hora— la rechaza, con razon.
           *
           * NO SE TOCA ESA RESTRICCION NI SE BORRA LA CITA DE NADIE: se salta el
           * hueco. Una demostracion con cuatro citas menos ese dia se ve igual
           * de bien; una que empuja la cita de verdad de alguien, no.
           *
           * El `exception` va DENTRO del bucle a proposito: en plpgsql un bloque
           * con manejador es un punto de retorno, asi que solo se deshace ESA
           * cita y el mes entero sigue. Con el manejador afuera se perderia el
           * mes completo por un choque de las nueve de la mañana.
           */
          v_cita := null;
          begin
            insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha,
                              hora_inicio, hora_fin, estado, notas, creado_en, actualizado_en)
            values (p_negocio, v_cliente, v_serv_id, v_membresia, v_dia, v_hora,
                    v_hora + make_interval(mins => v_serv_min), v_estado, v_texto,
                    (v_dia - 4)::timestamp + time '12:00',
                    v_dia::timestamp + time '20:00')
            returning id into v_cita;
            perform app.demo_anotar(p_negocio, 'cita', v_cita);
          exception when exclusion_violation then
            -- Ese horario ya era de alguien. Se deja como estaba.
            v_cita := null;
          end;

          /* --- Lo que se atendio, se cobro -------------------------- */
          -- SIN CITA NO HAY VENTA: si el hueco estaba ocupado, no se atendio a
          -- nadie, y cobrar una sesion que no ocurrio descuadraria el dia.
          if v_cita is not null and v_estado = 'completada' and v_sesion is not null then
            -- ¿Se llevo algo de mostrador? Uno de cada cuatro, y solo si
            -- queda existencia: vender lo que no hay dejaria el inventario en
            -- negativo, que es justo lo que la base impide en el sistema de
            -- verdad.
            v_lleva := random() < 0.26;
            v_prod_id := null;
            if v_lleva then
              -- El sorteo, FUERA de la consulta. Ver el comentario largo de
              -- arriba: `random()` dentro del `where` se evalua una vez por
              -- fila y la consulta se queda sin devolver nada.
              v_prod_id := v_productos[1 + floor(random() * array_length(v_productos, 1))::int];
              select p.nombre, p.precio_centavos, p.costo_centavos, p.stock_actual
                into v_prod_nombre, v_prod_precio, v_prod_costo, v_prod_stock
                from producto p
               where p.id = v_prod_id;
              if coalesce(v_prod_stock, 0) < 1 then
                v_prod_id := null;
              end if;
            end if;

            v_subtotal := v_serv_precio + coalesce(case when v_prod_id is not null
                                                        then v_prod_precio end, 0);
            v_descuento := case when random() < 0.12 then (v_subtotal / 10 / 100)::bigint * 100
                                else 0 end;
            v_total := v_subtotal - v_descuento;

            v_folio_n := v_folio_n + 1;
            v_folio := 'V-' || lpad(v_folio_n::text, 5, '0');

            insert into venta (negocio_id, folio, cliente_id, vendedor_id, fecha, estado,
                               subtotal_centavos, descuento_centavos, impuesto_centavos,
                               total_centavos, creada_por, creado_en, cobrada_en)
            values (p_negocio, v_folio, v_cliente, v_membresia, v_dia, 'cobrada',
                    v_subtotal, v_descuento, 0, v_total, v_usuario,
                    v_dia::timestamp + v_hora + make_interval(mins => v_serv_min),
                    v_dia::timestamp + v_hora + make_interval(mins => v_serv_min))
            returning id into v_venta;
            perform app.demo_anotar(p_negocio, 'venta', v_venta);

            insert into venta_item (negocio_id, venta_id, tipo, servicio_id, descripcion,
                                    cantidad, precio_unitario_centavos, descuento_centavos,
                                    subtotal_centavos)
            values (p_negocio, v_venta, 'servicio', v_serv_id, v_serv_nombre, 1,
                    v_serv_precio, 0, v_serv_precio)
            returning id into v_id;
            perform app.demo_anotar(p_negocio, 'venta_item', v_id);

            if v_prod_id is not null then
              insert into venta_item (negocio_id, venta_id, tipo, producto_id, descripcion,
                                      cantidad, precio_unitario_centavos,
                                      costo_unitario_centavos, descuento_centavos,
                                      subtotal_centavos)
              values (p_negocio, v_venta, 'producto', v_prod_id, v_prod_nombre, 1,
                      v_prod_precio, v_prod_costo, 0, v_prod_precio)
              returning id into v_id;
              perform app.demo_anotar(p_negocio, 'venta_item', v_id);

              perform app.demo_mover_inventario(p_negocio, v_prod_id, 'venta', -1,
                'Venta ' || v_folio, 'venta', v_venta, null,
                v_dia::timestamp + v_hora, v_usuario);
            end if;

            -- Con que se pago. El efectivo manda porque es un mostrador de
            -- barrio: es lo que hace que el corte de caja tenga algo que cuadrar.
            v_metodo := case when random() < 0.56 then 'efectivo'
                             when random() < 0.7 then 'tarjeta'
                             else 'transferencia' end;

            insert into pago (negocio_id, venta_id, metodo, monto_centavos, fecha, creado_en)
            values (p_negocio, v_venta, v_metodo, v_total, v_dia,
                    v_dia::timestamp + v_hora + make_interval(mins => v_serv_min))
            returning id into v_pago;
            perform app.demo_anotar(p_negocio, 'pago', v_pago);

            insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                         descripcion, fecha, metodo, sesion_id, creado_por, creado_en)
            values (p_negocio, 'ingreso', 'pago', v_pago, v_total, 'Venta ' || v_folio,
                    v_dia, v_metodo, v_sesion, v_usuario,
                    v_dia::timestamp + v_hora + make_interval(mins => v_serv_min))
            returning id into v_id;
            perform app.demo_anotar(p_negocio, 'movimiento_caja', v_id);

            -- Una de cada cinco queda anotada en la bitacora. Anotarlas todas
            -- serian seiscientos renglones iguales; ninguna dejaria la
            -- bitacora vacia en un centro que lleva cinco meses cobrando.
            if random() < 0.2 then
              perform app.demo_bitacora(p_negocio, 'ventas', 'cobrar', v_venta::text,
                jsonb_build_object('folio', v_folio, 'total', v_total),
                v_dia::timestamp + v_hora + make_interval(mins => v_serv_min),
                v_usuario, v_nombre_yo, v_rol_yo);
            end if;
          end if;
        end loop;

        /* --- Los gastos del dia ------------------------------------ */
        if v_dia <= v_hoy then
          -- La renta, el dia 2 de cada mes, por transferencia y ligada a su
          -- plantilla: es el par (recurrente, periodo) lo que impide que
          -- generarla otra vez cree una segunda.
          if extract(day from v_dia)::int = 2 then
            select id into v_id from gasto_recurrente
             where negocio_id = p_negocio and descripcion = 'Renta del local';
            v_gasto := app.demo_gasto(p_negocio, 'Renta del local',
              'Deposito a la cuenta del arrendador', 'Renta', 1200000, 'transferencia',
              v_dia, v_id, app.periodo_del_recurrente('mensual', v_dia), v_usuario);
            perform app.demo_bitacora(p_negocio, 'gastos', 'generar', v_gasto::text,
              jsonb_build_object('concepto', 'Renta del local', 'monto', 1200000),
              v_dia::timestamp + time '18:30', v_usuario, v_nombre_yo, v_rol_yo);
          end if;

          if extract(day from v_dia)::int = 5 then
            select id into v_id from gasto_recurrente
             where negocio_id = p_negocio and descripcion = 'Internet y telefono';
            v_gasto := app.demo_gasto(p_negocio, 'Internet y telefono', 'Paquete del centro',
              'Servicios', 89900, 'transferencia', v_dia, v_id,
              app.periodo_del_recurrente('mensual', v_dia), v_usuario);
          end if;

          if v_dow = 1 then
            select id into v_id from gasto_recurrente
             where negocio_id = p_negocio and descripcion = 'Lavanderia de sabanas';
            v_gasto := app.demo_gasto(p_negocio, 'Lavanderia de sabanas',
              'Servicio semanal a domicilio', 'Servicios', 65000, 'efectivo', v_dia, v_id,
              app.periodo_del_recurrente('semanal', v_dia), v_usuario);
          end if;

          if extract(day from v_dia)::int in (15, 28) then
            v_gasto := app.demo_gasto(p_negocio, 'Pago quincenal al equipo',
              'Terapeutas y recepcion', 'Nomina', 1450000, 'transferencia',
              v_dia, null, null, v_usuario);
            perform app.demo_bitacora(p_negocio, 'gastos', 'crear', v_gasto::text,
              jsonb_build_object('concepto', 'Pago quincenal al equipo', 'monto', 1450000),
              v_dia::timestamp + time '18:30', v_usuario, v_nombre_yo, v_rol_yo);
          end if;

          if extract(day from v_dia)::int = 8 and extract(month from v_dia)::int % 2 = 0 then
            v_gasto := app.demo_gasto(p_negocio, 'Luz del bimestre', null, 'Servicios',
              182000 + (random() * 40000)::bigint / 100 * 100, 'transferencia',
              v_dia, null, null, v_usuario);
          end if;

          if extract(day from v_dia)::int in (4, 14, 24) then
            v_gasto := app.demo_gasto(p_negocio,
              (array['Aceite de almendras a granel', 'Sabanas desechables y toallas',
                     'Gel antibacterial y guantes', 'Carbon e inciensos para la sala'])
                [1 + floor(random() * 4)::int],
              null, 'Insumos', 45000 + (random() * 90000)::bigint / 100 * 100, 'efectivo',
              v_dia, null, null, v_usuario);
          end if;

          if extract(day from v_dia)::int = 18 then
            v_gasto := app.demo_gasto(p_negocio, 'Publicidad en redes',
              'Campana del mes', 'Publicidad', 60000, 'tarjeta', v_dia, null, null, v_usuario);
          end if;

          if extract(day from v_dia)::int = 21 and extract(month from v_dia)::int % 3 = 0 then
            v_gasto := app.demo_gasto(p_negocio, 'Limpieza profunda del local', null,
              'Mantenimiento', 90000, 'efectivo', v_dia, null, null, v_usuario);
          end if;
        end if;

        /* --- Y se hace el corte ------------------------------------ */
        --
        -- LA CAJA DE HOY SE QUEDA ABIERTA, a proposito: es el estado en el que
        -- de verdad esta un centro a media tarde, y es lo que deja enseñar el
        -- corte de caja sin haberlo hecho todavia.
        if v_sesion is not null and v_dia < v_hoy then
          v_esperado := app.efectivo_de_la_caja(v_sesion);
          -- Un dia de cada seis no cuadra por unos pesos. Un historial donde
          -- todos los cortes salen exactos no se parece a ningun mostrador.
          v_contado := greatest(0, v_esperado + case when random() < 0.17
                                                     then ((random() * 60)::int - 30) * 100
                                                     else 0 end);
          update sesion_caja
             set estado = 'cerrada',
                 cerrada_por = v_membresia,
                 cerrada_en = v_dia::timestamp + time '19:40',
                 esperado_centavos = v_esperado,
                 contado_centavos = v_contado,
                 diferencia_centavos = v_contado - v_esperado,
                 notas_cierre = case when v_contado <> v_esperado
                                     then 'Diferencia por cambio; se anota y se sigue.' end
           where id = v_sesion;

          perform app.demo_bitacora(p_negocio, 'caja', 'cerrar', v_sesion::text,
            jsonb_build_object('esperado', v_esperado, 'contado', v_contado,
                               'diferencia', v_contado - v_esperado),
            v_dia::timestamp + time '19:40', v_usuario, v_nombre_yo, v_rol_yo);
        end if;
      end if;

      v_dia := v_dia + 1;
    end loop;

    v_hechas := (select count(*) from cita
                  where negocio_id = p_negocio and fecha between v_mes and v_fin);
  end if;

  /* =================================================================
     PASO 9 — LO QUE CUELGA DE TODO LO ANTERIOR
     ================================================================= */
  if p_paso = 9 then

    select array_agg(c.id order by c.creado_en, c.nombre) into v_clientes
      from cliente c
     where c.negocio_id = p_negocio
       and c.id in (select fila_id from dato_de_demostracion
                     where negocio_id = p_negocio and tabla = 'cliente');
    select array_agg(p.id order by p.nombre) into v_productos
      from producto p
     where p.negocio_id = p_negocio
       and p.id in (select fila_id from dato_de_demostracion
                     where negocio_id = p_negocio and tabla = 'producto');

    if v_clientes is null then
      raise exception 'Falta el paso 2: no hay pacientes a quien inscribir ni a quien escribirle.'
        using errcode = 'no_data_found';
    end if;

    select coalesce(max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int), 0)
      into v_folio_n from venta where negocio_id = p_negocio;

    /* --- Los alumnos de cada curso ----------------------------------- */
    v_cuenta := 0;
    for v_curso in
      select c.id, c.nombre, c.estado, c.precio_centavos, c.fecha_inicio
        from curso c
       where c.negocio_id = p_negocio
         and c.id in (select fila_id from dato_de_demostracion
                       where negocio_id = p_negocio and tabla = 'curso')
       order by c.fecha_inicio
    loop
      v_cuenta := v_cuenta + 1;
      v_cuantas := case v_curso.estado when 'terminado' then 8
                                       when 'en_curso' then 6
                                       else 3 end;

      for v_i in 1..v_cuantas loop
        -- El paso de siete es primo con cuarenta y cinco, asi que ningun
        -- alumno se repite dentro del mismo curso. Repetirlo chocaria contra
        -- `inscripcion_viva_unica`, que es justo lo que esa regla impide.
        v_cliente := v_clientes[1 + ((v_i * 7 + v_cuenta * 3)
                                     % array_length(v_clientes, 1))];

        v_estado := case
          when v_curso.estado = 'terminado' and v_i = v_cuantas then 'cancelado'
          when v_curso.estado = 'terminado' then 'asistio'
          when v_curso.estado = 'programado' and v_i = v_cuantas then 'lista_espera'
          else 'inscrito' end;

        v_venta := null;

        -- LOS DEL CURSO QUE ESTA CORRIENDO YA PAGARON, y su pago es una venta
        -- de verdad: renglon de tipo curso, su folio y su movimiento de caja.
        -- Inventar un "pagado: si" en la inscripcion seria un segundo sitio
        -- donde vive el dinero.
        if v_curso.estado = 'en_curso' and v_i <= 4 then
          v_folio_n := v_folio_n + 1;
          v_folio := 'V-' || lpad(v_folio_n::text, 5, '0');
          v_cuando := (v_curso.fecha_inicio - 5)::timestamp + time '17:30';

          insert into venta (negocio_id, folio, cliente_id, vendedor_id, fecha, estado,
                             subtotal_centavos, descuento_centavos, impuesto_centavos,
                             total_centavos, notas, creada_por, creado_en, cobrada_en)
          values (p_negocio, v_folio, v_cliente, v_membresia, (v_curso.fecha_inicio - 5),
                  'cobrada', v_curso.precio_centavos, 0, 0, v_curso.precio_centavos,
                  'Inscripcion al curso.', v_usuario, v_cuando, v_cuando)
          returning id into v_venta;
          perform app.demo_anotar(p_negocio, 'venta', v_venta);

          insert into venta_item (negocio_id, venta_id, tipo, curso_id, descripcion, cantidad,
                                  precio_unitario_centavos, descuento_centavos, subtotal_centavos)
          values (p_negocio, v_venta, 'curso', v_curso.id, v_curso.nombre, 1,
                  v_curso.precio_centavos, 0, v_curso.precio_centavos)
          returning id into v_id;
          perform app.demo_anotar(p_negocio, 'venta_item', v_id);

          insert into pago (negocio_id, venta_id, metodo, monto_centavos, fecha, creado_en)
          values (p_negocio, v_venta, 'transferencia', v_curso.precio_centavos,
                  (v_curso.fecha_inicio - 5), v_cuando)
          returning id into v_pago;
          perform app.demo_anotar(p_negocio, 'pago', v_pago);

          -- SIN `sesion_id`, y no es un olvido: una transferencia no pasa por
          -- el cajon. El ingreso del negocio existe; el corte de ese dia no lo
          -- cuenta porque ese dinero nunca estuvo ahi.
          insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                       descripcion, fecha, metodo, sesion_id, creado_por, creado_en)
          values (p_negocio, 'ingreso', 'pago', v_pago, v_curso.precio_centavos,
                  'Venta ' || v_folio, (v_curso.fecha_inicio - 5), 'transferencia', null,
                  v_usuario, v_cuando)
          returning id into v_id;
          perform app.demo_anotar(p_negocio, 'movimiento_caja', v_id);
        end if;

        insert into inscripcion (negocio_id, curso_id, cliente_id, venta_id, estado, origen,
                                 notas, creado_en)
        values (p_negocio, v_curso.id, v_cliente, v_venta, v_estado,
                case when v_venta is not null then 'venta' else 'manual' end,
                case when v_estado = 'lista_espera' then 'Avisar si alguien cancela.'
                     when v_estado = 'cancelado' then 'Cancelo una semana antes.' end,
                (v_curso.fecha_inicio - 12)::timestamp + time '16:00')
        returning id into v_id;
        perform app.demo_anotar(p_negocio, 'inscripcion', v_id);
      end loop;
    end loop;

    /* --- Las cotizaciones que se pidieron ---------------------------- */
    v_cuenta := 0;
    for r in
      select * from (values
        ('Paquete de cuatro masajes descontracturantes', 'Masaje descontracturante', 4, -70, 'convertida'),
        ('Sesion de piedras calientes para dos personas', 'Masaje con piedras calientes', 2, -52, 'aceptada'),
        ('Paquete de seis sesiones de reiki', 'Reiki', 6, -40, 'vencida'),
        ('Drenaje linfatico, serie de cinco', 'Drenaje linfatico', 5, -18, 'abierta'),
        ('Masaje relajante para equipo de oficina', 'Masaje relajante', 8, -9, 'abierta'),
        ('Limpieza energetica para inauguracion', 'Limpieza energetica', 3, -3, 'abierta')
      ) as x(concepto, servicio, cantidad, dias, estado)
    loop
      v_cuenta := v_cuenta + 1;
      select s.id, s.nombre, s.precio_centavos into v_serv_id, v_serv_nombre, v_serv_precio
        from servicio s where s.negocio_id = p_negocio and s.nombre = r.servicio;
      v_subtotal := v_serv_precio * r.cantidad;
      v_descuento := (v_subtotal / 20 / 100)::bigint * 100;

      insert into cotizacion (negocio_id, folio, cliente_id, vendedor_id, fecha, vence,
                              subtotal_centavos, descuento_centavos, impuesto_centavos,
                              total_centavos, estado, notas, creado_en)
      values (p_negocio, 'C-' || lpad(v_cuenta::text, 5, '0'),
              v_clientes[1 + ((v_cuenta * 5) % array_length(v_clientes, 1))],
              v_membresia, v_hoy + r.dias, v_hoy + r.dias + 15,
              v_subtotal, v_descuento, 0, v_subtotal - v_descuento, r.estado,
              r.concepto, (v_hoy + r.dias)::timestamp + time '13:00')
      returning id into v_id;
      perform app.demo_anotar(p_negocio, 'cotizacion', v_id);

      insert into cotizacion_item (negocio_id, cotizacion_id, tipo, servicio_id, descripcion,
                                   cantidad, precio_unitario_centavos, descuento_centavos,
                                   subtotal_centavos)
      values (p_negocio, v_id, 'servicio', v_serv_id, v_serv_nombre, r.cantidad,
              v_serv_precio, v_descuento, v_subtotal - v_descuento)
      returning id into v_cita;
      perform app.demo_anotar(p_negocio, 'cotizacion_item', v_cita);
    end loop;

    -- EL CONTADOR DE FOLIOS SE PONE AL DIA. Sin esto, la siguiente cotizacion
    -- que se haga desde la pantalla saldria con el folio C-00001 y chocaria
    -- contra el unico de la tabla — un error de restriccion en la cara de
    -- quien esta enseñando el sistema.
    insert into contador_de_folio (negocio_id, ambito, ultimo)
    values (p_negocio, 'cotizacion', v_cuenta)
    on conflict (negocio_id, ambito)
      do update set ultimo = greatest(contador_de_folio.ultimo, excluded.ultimo);

    /* --- Los recordatorios ------------------------------------------- */
    for r in
      select * from (values
        ('Llamar a la paciente de la cita cancelada', 'Reagendar la sesion de la semana pasada.',
         -3, 'alta', 'pendiente', 'Seguimiento'),
        ('Pedir aceite de almendras', 'Quedan menos de tres litros en bodega.',
         -1, 'urgente', 'pendiente', 'Inventario'),
        ('Pagar el predial del local', 'Vence a fin de mes.',
         -2, 'alta', 'pendiente', 'Administrativo'),
        ('Confirmar las citas de manana', null, 0, 'alta', 'pendiente', 'Seguimiento'),
        ('Revisar el stock de la vitrina', 'Reponer cuarzos y velas.',
         1, 'normal', 'pendiente', 'Inventario'),
        ('Mandar el recordatorio del curso de biomagnetismo', 'A los seis inscritos.',
         2, 'normal', 'pendiente', 'Seguimiento'),
        ('Renovar el seguro del local', 'Buscar dos cotizaciones antes.',
         5, 'normal', 'pendiente', 'Administrativo'),
        ('Cambiar las sabanas de la sala grande', null, 6, 'baja', 'pendiente', 'Administrativo'),
        ('Cotizar impresion de tarjetas', null, 9, 'baja', 'pendiente', 'Administrativo'),
        ('Llamar al proveedor de cristales', 'Preguntar por la amatista grande.',
         12, 'normal', 'pendiente', 'Inventario'),
        ('Preparar el material del taller de piedras', null, 16, 'normal', 'pendiente', 'Administrativo'),
        ('Seguimiento a la paciente con hernia', 'Preguntar como siguio de la espalda.',
         -18, 'alta', 'hecho', 'Seguimiento'),
        ('Depositar el corte de la semana', null, -21, 'normal', 'hecho', 'Administrativo'),
        ('Reponer inciensos de copal', null, -26, 'normal', 'hecho', 'Inventario'),
        ('Confirmar a los inscritos del taller de reiki', null, -33, 'alta', 'hecho', 'Seguimiento'),
        ('Pagar la nomina de la quincena', null, -38, 'urgente', 'hecho', 'Administrativo'),
        ('Llamar a quien no asistio el jueves', null, -44, 'normal', 'hecho', 'Seguimiento'),
        ('Comprar sabanas desechables', null, -51, 'normal', 'hecho', 'Inventario'),
        ('Revisar el contrato de la renta', null, -58, 'baja', 'hecho', 'Administrativo'),
        ('Actualizar los precios de la lista', null, -66, 'normal', 'hecho', 'Administrativo'),
        ('Felicitar a la paciente por su cumpleanos', null, -74, 'baja', 'hecho', 'Seguimiento'),
        ('Mandar promocion de septiembre', null, -82, 'normal', 'hecho', 'Seguimiento'),
        ('Cambiar el foco de la sala chica', null, -95, 'baja', 'hecho', 'Administrativo'),
        ('Mover la cita del sabado', 'Ya no se ocupa.', -29, 'baja', 'descartado', 'Seguimiento'),
        ('Cotizar difusores nuevos', 'Se compraron en otro lado.', -47, 'baja', 'descartado', 'Inventario')
      ) as x(titulo, detalle, dias, prioridad, estado, categoria)
    loop
      insert into recordatorio (negocio_id, titulo, detalle, fecha, hora, prioridad, estado,
                                categoria_id, responsable_id, creado_por, creado_en,
                                completado_en, completado_por)
      values (p_negocio, r.titulo, r.detalle, v_hoy + r.dias,
              case when r.prioridad in ('alta', 'urgente') then time '09:00' end,
              r.prioridad, r.estado,
              (select c.id from categoria c
                where c.negocio_id = p_negocio and c.ambito = 'recordatorio'
                  and c.nombre = r.categoria),
              v_membresia, v_usuario,
              (v_hoy + r.dias - 4)::timestamp + time '09:30',
              case when r.estado = 'hecho'
                   then (v_hoy + r.dias)::timestamp + time '18:00' end,
              case when r.estado = 'hecho' then v_usuario end)
      returning id into v_id;
      perform app.demo_anotar(p_negocio, 'recordatorio', v_id);

      -- EL RASTRO DE LOS QUE SE CERRARON. Un recordatorio hecho sin historial
      -- no puede contestar "¿quien lo cerro y cuando?", que es para lo unico
      -- que se le pregunta a esa tabla.
      if r.estado <> 'pendiente' then
        insert into recordatorio_evento (negocio_id, recordatorio_id, accion, despues,
                                         usuario_id, usuario_nombre, creado_en)
        values (p_negocio, v_id,
                case when r.estado = 'hecho' then 'completar' else 'cancelar' end,
                jsonb_build_object('estado', r.estado), v_usuario, v_nombre_yo,
                (v_hoy + r.dias)::timestamp + time '18:00')
        returning id into v_cita;
        perform app.demo_anotar(p_negocio, 'recordatorio_evento', v_cita);
      end if;
    end loop;

    /*
     * ALGUNOS RECORDATORIOS SABEN DE QUE HABLAN, y sin eso el modulo se queda
     * a medias: un recordatorio que solo dice "Pedir aceite de almendras" es
     * texto muerto — no se puede abrir el producto, ni saber si ya se repuso.
     * El panel de "lo pendiente de este paciente" del expediente y el del
     * producto salen de aqui, y sin una sola fila ligada salen siempre vacios.
     */
    update recordatorio rc set entidad_tipo = 'cliente', entidad_id = c.id
      from cliente c
     where rc.negocio_id = p_negocio and c.negocio_id = p_negocio
       and c.nombre = 'Roberto Quinones'
       and rc.titulo = 'Seguimiento a la paciente con hernia';

    update recordatorio rc set entidad_tipo = 'cliente', entidad_id = c.id
      from cliente c
     where rc.negocio_id = p_negocio and c.negocio_id = p_negocio
       and c.nombre = 'Adriana Villalobos'
       and rc.titulo = 'Llamar a la paciente de la cita cancelada';

    update recordatorio rc set entidad_tipo = 'producto', entidad_id = p.id
      from producto p
     where rc.negocio_id = p_negocio and p.negocio_id = p_negocio
       and p.nombre = 'Aceite de almendras dulces 250 ml'
       and rc.titulo = 'Pedir aceite de almendras';

    update recordatorio rc set entidad_tipo = 'producto', entidad_id = p.id
      from producto p
     where rc.negocio_id = p_negocio and p.negocio_id = p_negocio
       and p.nombre = 'Incienso de copal'
       and rc.titulo = 'Reponer inciensos de copal';

    update recordatorio rc set entidad_tipo = 'curso', entidad_id = cu.id
      from curso cu
     where rc.negocio_id = p_negocio and cu.negocio_id = p_negocio
       and cu.nombre = 'Introduccion al biomagnetismo'
       and rc.titulo = 'Mandar el recordatorio del curso de biomagnetismo';

    /* --- Las dos reglas que se repiten -------------------------------- */
    with nuevas as (
      insert into recordatorio_recurrente (negocio_id, titulo, detalle, hora, prioridad,
                                           categoria_id, responsable_id, frecuencia, intervalo,
                                           dias_semana, fecha_inicio, proxima_fecha, generados,
                                           estado, creado_por, creado_en)
      select p_negocio, x.titulo, x.detalle, time '09:00', x.prioridad,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'recordatorio' and c.nombre = x.categoria),
             v_membresia, x.frecuencia, 1, x.dias, v_inicio,
             v_hoy + x.proxima, x.generados, 'activo', v_usuario,
             v_inicio::timestamp + time '09:00'
        from (values
          ('Confirmar las citas del dia siguiente', 'Antes de cerrar el centro.',
           'alta', 'semanal', array[5], 1, 18, 'Seguimiento'),
          ('Revisar existencias de la vitrina', 'Contar y anotar lo que falte.',
           'normal', 'mensual', null::int[], 7, 5, 'Inventario')
        ) as x(titulo, detalle, prioridad, frecuencia, dias, proxima, generados, categoria)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'recordatorio_recurrente', id from nuevas;

    /* --- Las conversaciones ------------------------------------------- */
    select id into v_conv from canal_de_mensajes
     where negocio_id = p_negocio and tipo = 'manual'
       and id in (select fila_id from dato_de_demostracion
                   where negocio_id = p_negocio and tabla = 'canal_de_mensajes')
     limit 1;

    v_cuenta := 0;
    for r in
      select c.id, c.nombre, c.telefono
        from cliente c
       where c.negocio_id = p_negocio
         and c.telefono is not null
         and c.id in (select fila_id from dato_de_demostracion
                       where negocio_id = p_negocio and tabla = 'cliente')
       order by c.creado_en
       limit 18
    loop
      v_cuenta := v_cuenta + 1;
      -- Las mas viejas ya se cerraron; las tres ultimas siguen abiertas y con
      -- algo sin leer, que es lo que hace que el modulo tenga algo que enseñar.
      v_cuando := (v_hoy - (v_cuenta * 3))::timestamp + time '11:20';

      insert into conversacion (negocio_id, canal_id, cliente_id, contacto, estado, favorita,
                                asignada_a, atendida_en, ultimo_en, creado_en)
      values (p_negocio, v_conv, r.id, r.telefono,
              case when v_cuenta <= 3 then 'abierta'
                   when v_cuenta <= 12 then 'cerrada' else 'archivada' end,
              v_cuenta = 2, v_membresia,
              case when v_cuenta > 3 then v_cuando + interval '40 minutes' end,
              v_cuando + interval '35 minutes',
              v_cuando - interval '10 minutes')
      returning id into v_id;
      perform app.demo_anotar(p_negocio, 'conversacion', v_id);

      -- LA ETIQUETA NO SE ANOTA, y no es un olvido: `conversacion_etiqueta` no
      -- tiene columna `id` —su llave es el par— y ademas cuelga en cascada de
      -- la conversacion. Al quitar la demostracion se va sola con ella.
      insert into conversacion_etiqueta (negocio_id, conversacion_id, categoria_id)
      select p_negocio, v_id, c.id from categoria c
       where c.negocio_id = p_negocio and c.ambito = 'conversacion'
         and c.nombre = (array['Cita', 'Informacion', 'Seguimiento'])[1 + (v_cuenta % 3)]
      on conflict do nothing;

      insert into mensaje (negocio_id, conversacion_id, direccion, cuerpo, estado, enviado_por,
                           leido_en, creado_en)
      values
        (p_negocio, v_id, 'entrante',
         (array['Hola, buenas tardes. ¿Tienen lugar esta semana?',
                'Hola, quiero agendar un masaje descontracturante.',
                'Buen dia, ¿cuanto cuesta la sesion de reiki?',
                'Hola, ¿a que hora abren el sabado?',
                'Buenas, ¿puedo mover mi cita del jueves?'])[1 + (v_cuenta % 5)],
         'pendiente', null,
         case when v_cuenta <= 3 then null else v_cuando + interval '5 minutes' end,
         v_cuando),
        (p_negocio, v_id, 'saliente',
         (array['Hola, con gusto. Tenemos el jueves a las 12:00 y el viernes a las 16:30.',
                'Claro que si, el descontracturante dura una hora y son $750.',
                'La sesion de reiki son $600 y dura 50 minutos.',
                'El sabado abrimos de 10:00 a 15:00.',
                'Sin problema, ¿que dia te queda mejor?'])[1 + (v_cuenta % 5)],
         'enviado', v_usuario, null, v_cuando + interval '12 minutes'),
        (p_negocio, v_id, 'entrante',
         (array['Perfecto, me quedo el jueves.',
                'Muchas gracias, ahi nos vemos.',
                'Va, lo pienso y les aviso.',
                'Gracias!',
                'El viernes en la tarde, porfa.'])[1 + (v_cuenta % 5)],
         'pendiente', null,
         case when v_cuenta <= 3 then null else v_cuando + interval '40 minutes' end,
         v_cuando + interval '35 minutes');

      insert into dato_de_demostracion (negocio_id, tabla, fila_id)
      select p_negocio, 'mensaje', m.id from mensaje m
       where m.conversacion_id = v_id
      on conflict do nothing;
    end loop;

    -- Dos numeros que todavia no son de nadie: es lo que obliga a que
    -- `cliente_id` pueda ser nulo, y hay que poder enseñarlo.
    for v_i in 1..2 loop
      insert into conversacion (negocio_id, canal_id, cliente_id, contacto, estado,
                                ultimo_en, creado_en)
      values (p_negocio, v_conv, null, '55' || lpad((41230100 + v_i)::text, 8, '0'),
              'abierta', (v_hoy - v_i)::timestamp + time '17:10',
              (v_hoy - v_i)::timestamp + time '17:00')
      returning id into v_id;
      perform app.demo_anotar(p_negocio, 'conversacion', v_id);

      insert into mensaje (negocio_id, conversacion_id, direccion, cuerpo, estado, creado_en)
      values (p_negocio, v_id, 'entrante',
              case when v_i = 1 then 'Hola, ¿dan clases de masaje?'
                   else 'Buenas, ¿tienen servicio a domicilio?' end,
              'pendiente', (v_hoy - v_i)::timestamp + time '17:10')
      returning id into v_cita;
      perform app.demo_anotar(p_negocio, 'mensaje', v_cita);
    end loop;

    /* --- Una difusion que ya salio ------------------------------------ */
    insert into difusion (negocio_id, nombre, cuerpo, canal_id, destinatarios, fallidos,
                          creado_por, creado_en)
    values (p_negocio, 'Promocion de temporada',
            'Este mes el masaje con piedras calientes tiene precio especial. Contestanos por aqui para apartar lugar.',
            v_conv, 24, 0, v_usuario, (v_hoy - 20)::timestamp + time '10:00')
    returning id into v_id;
    perform app.demo_anotar(p_negocio, 'difusion', v_id);

    /* --- Los reportes que alguien dejo guardados ---------------------- */
    with nuevos as (
      insert into reporte_guardado (negocio_id, nombre, tipo, desde, hasta, filtros,
                                    creado_por, creado_por_nombre, creado_en)
      select p_negocio, x.nombre, x.tipo, x.desde, x.hasta, '{}'::jsonb,
             v_usuario, v_nombre_yo, x.desde::timestamp + time '20:00'
        from (values
          ('Cierre del mes pasado', 'resumen',
           (date_trunc('month', v_hoy::timestamp) - interval '1 month')::date,
           (date_trunc('month', v_hoy::timestamp)::date - 1)),
          ('Servicios mas pedidos del trimestre', 'servicios',
           (date_trunc('month', v_hoy::timestamp) - interval '3 months')::date,
           v_hoy),
          ('Gastos de los cinco meses', 'gastos', v_inicio, v_hoy)
        ) as x(nombre, tipo, desde, hasta)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'reporte_guardado', id from nuevos;

    /* --- Y unas cuantas anotaciones mas en la bitacora ---------------- */
    for r in
      select * from (values
        ('configuracion', 'editar', -148, 'Se guardaron los datos del centro'),
        ('servicios', 'crear', -147, 'Alta del catalogo de servicios'),
        ('productos', 'crear', -146, 'Alta del inventario inicial'),
        ('clientes', 'crear', -140, 'Alta de pacientes'),
        ('agenda', 'reagendar', -96, 'Se movio una cita'),
        ('cursos', 'crear', -95, 'Alta del taller de reiki'),
        ('configuracion', 'editar', -60, 'Se ajustaron los horarios'),
        ('agenda', 'estado', -31, 'Se cancelo una cita'),
        ('productos', 'ajustar', -24, 'Ajuste de inventario por merma'),
        ('clientes', 'editar', -12, 'Se actualizo un expediente')
      ) as x(modulo, accion, dias, detalle)
    loop
      perform app.demo_bitacora(p_negocio, r.modulo, r.accion, null,
        jsonb_build_object('detalle', r.detalle),
        (v_hoy + r.dias)::timestamp + time '12:00', v_usuario, v_nombre_yo, v_rol_yo);
    end loop;

    /* --- Dos ajustes de inventario, que en un centro real siempre hay -- */
    if v_productos is not null then
      perform app.demo_mover_inventario(p_negocio, v_productos[1], 'merma', -1,
        'Frasco roto al acomodar la vitrina', 'ajuste', null, null,
        (v_hoy - 24)::timestamp + time '11:00', v_usuario);
      perform app.demo_mover_inventario(p_negocio, v_productos[2], 'entrada', 12,
        'Pedido de reposicion', 'compra', null, null,
        (v_hoy - 18)::timestamp + time '10:00', v_usuario);
    end if;

    v_hechas := (select count(*) from dato_de_demostracion where negocio_id = p_negocio);
  end if;

  /*
   * QUEDA ESCRITO QUE ESTE PASO TERMINO, y hace falta por una razon concreta:
   * si la carga se corta a la mitad —una caja abierta, la pestaña cerrada, la
   * red— al volver a abrir la pantalla lo unico que se sabe es que hay filas
   * sembradas, no CUANTAS de las nueve tandas entraron. Sin esto, la unica
   * salida honesta seria "quitalo todo y empieza de nuevo"; con esto se puede
   * seguir desde donde se quedo.
   *
   * Se anota en la misma tabla del rastro y con `llave` en vez de `fila_id`,
   * asi que se va sola cuando se quita la demostracion.
   */
  insert into dato_de_demostracion (negocio_id, tabla, llave)
  values (p_negocio, 'paso', p_paso::text);

  return jsonb_build_object(
    'paso', p_paso,
    'pasos', 9,
    'titulo', (array['El catalogo del centro', 'Los pacientes y su expediente',
                     'El primer mes de trabajo', 'El segundo mes', 'El tercer mes',
                     'El cuarto mes', 'El quinto mes', 'Este mes, hasta hoy',
                     'Cursos, mensajes, recordatorios y bitacora'])[p_paso],
    'hechas', v_hechas,
    'siguiente', case when p_paso < 9 then p_paso + 1 end,
    'filas', (select count(*) from dato_de_demostracion where negocio_id = p_negocio));
end;
$$;

comment on function public.cargar_datos_de_demostracion(text, int, date) is
  'Siembra cinco meses de uso en NUEVE llamadas, una por paso. Solo la cuenta de demostracion, '
  'solo con permiso de configuracion, y solo si el centro no tiene ya una cargada. Cada fila queda '
  'anotada en dato_de_demostracion para poder quitarla despues.';

revoke all on function public.cargar_datos_de_demostracion(text, int, date) from public, anon;
grant execute on function public.cargar_datos_de_demostracion(text, int, date) to authenticated;

-- ---------------------------------------------------------------------
-- 5. QUITAR — exactamente lo sembrado, y nada mas
-- ---------------------------------------------------------------------
--
-- EL ORDEN DE LAS TABLAS ES EL DE LAS LLAVES FORANEAS, y no es alfabetico por
-- casualidad: los renglones de una venta se borran antes que la venta, las
-- citas antes que los pacientes, y los movimientos antes que la caja. Una
-- llave foranea `on delete restrict` —que es lo que protege un expediente con
-- historial— rechazaria el borrado en el orden equivocado, y el mensaje que
-- sale no dice cual es el orden bueno.
--
-- LO QUE NO SE BORRA NUNCA: lo que el centro capturo de verdad. Se borra por
-- id, uno por uno, contra la lista de lo sembrado. Un "borrar todo lo del
-- centro" es justo lo que no se le puede ofrecer a alguien que ya empezo a
-- trabajar con el sistema.
create or replace function public.quitar_datos_de_demostracion(p_negocio text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orden text[] := array[
    'recordatorio_evento', 'mensaje', 'conversacion', 'difusion',
    'cotizacion_item', 'cotizacion',
    'venta_item', 'pago', 'movimiento_caja', 'venta',
    'inscripcion', 'sesion_curso', 'material_curso', 'curso',
    'movimiento_inventario', 'producto_proveedor', 'producto',
    'gasto', 'gasto_recurrente', 'cita',
    'recordatorio', 'recordatorio_recurrente', 'recordatorio_automatizacion',
    'sesion_caja', 'cliente', 'servicio', 'proveedor', 'categoria',
    -- La automatizacion va ANTES que la plantilla y el canal de los que
    -- cuelga. Apuntan con `set null`, asi que el orden contrario tampoco
    -- reventaria — pero dejaria una regla apuntando al vacio si el borrado se
    -- cortara justo ahi.
    'automatizacion_de_mensajes', 'plantilla_de_mensaje', 'canal_de_mensajes',
    'reporte_guardado', 'auditoria'];
  v_tabla  text;
  v_n      int;
  v_total  int := 0;
  /* Lo que NO sembro la demostracion pero cuelga de ella. Ver mas abajo. */
  v_arrastradas int := 0;
  v_clientes  uuid[];
  v_servicios uuid[];
  v_productos uuid[];
  v_cursos    uuid[];
  v_ventas    uuid[];
  v_sembrados uuid[];
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.es_la_cuenta_de_demostracion() then
    raise exception 'Los datos de demostracion solo se quitan desde la cuenta de demostracion.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'Hace falta el permiso de configuracion para quitar la demostracion.'
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * PRIMERO SE VA LO QUE CRECIO ENCIMA DE LA DEMOSTRACION, Y ESTO REVENTO EN
   * UN ENSAYO CONTRA UNA POSTGRES DE VERDAD:
   *
   *   update or delete on table "cliente" violates RESTRICT setting of foreign
   *   key constraint "venta_cliente_mismo_negocio" on table "venta"
   *
   * Pasa siempre que alguien USA la demostracion, que es justo para lo que
   * existe: se cobra una venta a un paciente sembrado, se agenda una cita con
   * un servicio sembrado, se inscribe a alguien a un curso sembrado. Esas filas
   * son de quien las capturo —no estan en el rastro— pero apuntan a lo
   * sembrado con una llave foranea `restrict`, que es la que protege un
   * expediente con historial. Al borrar el paciente, la base se niega, con
   * razon, y el borrado entero se deshace.
   *
   * LAS DOS SALIDAS MALAS: dejar la demostracion pegada para siempre en cuanto
   * alguien la use, o quitarle el `restrict` a la llave —que es lo que impide
   * borrar el historial de un paciente de verdad—. Ninguna se toma.
   *
   * LO QUE SE HACE: se borra tambien lo que cuelga, y la pantalla lo dice con
   * esas palabras. Una venta a un paciente inventado no es informacion del
   * centro: es parte de la demostracion aunque la haya tecleado una persona.
   * Lo que se capturo APARTE —un paciente propio, un gasto, un recordatorio—
   * no se toca, y eso sigue siendo verdad.
   */
  select array_agg(fila_id) into v_clientes from dato_de_demostracion
   where negocio_id = p_negocio and tabla = 'cliente' and fila_id is not null;
  select array_agg(fila_id) into v_servicios from dato_de_demostracion
   where negocio_id = p_negocio and tabla = 'servicio' and fila_id is not null;
  select array_agg(fila_id) into v_productos from dato_de_demostracion
   where negocio_id = p_negocio and tabla = 'producto' and fila_id is not null;
  select array_agg(fila_id) into v_cursos from dato_de_demostracion
   where negocio_id = p_negocio and tabla = 'curso' and fila_id is not null;

  v_clientes  := coalesce(v_clientes,  '{}'::uuid[]);
  v_servicios := coalesce(v_servicios, '{}'::uuid[]);
  v_productos := coalesce(v_productos, '{}'::uuid[]);
  v_cursos    := coalesce(v_cursos,    '{}'::uuid[]);

  -- Las ventas que cobraron algo sembrado: al paciente, o el servicio, el
  -- producto o el curso. `coalesce` de las tres referencias funciona porque un
  -- renglon de venta tiene exactamente una, y la base lo obliga.
  select array_agg(v.id) into v_ventas
    from venta v
   where v.negocio_id = p_negocio
     and (v.cliente_id = any(v_clientes)
          or exists (select 1 from venta_item i
                      where i.venta_id = v.id
                        and coalesce(i.producto_id, i.servicio_id, i.curso_id)
                            = any(v_productos || v_servicios || v_cursos)));
  v_ventas := coalesce(v_ventas, '{}'::uuid[]);

  -- El rastro de esas ventas, de adentro hacia afuera. La caja cuelga del PAGO
  -- desde el bloque 6, asi que hay que buscarla por ahi.
  delete from movimiento_caja m
   where m.negocio_id = p_negocio
     and ((m.origen = 'pago'
           and m.referencia_id in (select p.id from pago p where p.venta_id = any(v_ventas)))
       or (m.origen = 'venta' and m.referencia_id = any(v_ventas)));
  get diagnostics v_n = row_count; v_arrastradas := v_arrastradas + v_n;

  delete from pago where venta_id = any(v_ventas);
  get diagnostics v_n = row_count; v_arrastradas := v_arrastradas + v_n;

  delete from venta_item where venta_id = any(v_ventas);
  get diagnostics v_n = row_count; v_arrastradas := v_arrastradas + v_n;

  delete from venta where id = any(v_ventas);
  get diagnostics v_n = row_count; v_arrastradas := v_arrastradas + v_n;

  -- Las citas de un paciente o un servicio sembrado.
  delete from cita c
   where c.negocio_id = p_negocio
     and (c.cliente_id = any(v_clientes) or c.servicio_id = any(v_servicios));
  get diagnostics v_n = row_count; v_arrastradas := v_arrastradas + v_n;

  -- Y las inscripciones a un curso sembrado o de un paciente sembrado.
  delete from inscripcion i
   where i.negocio_id = p_negocio
     and (i.cliente_id = any(v_clientes) or i.curso_id = any(v_cursos));
  get diagnostics v_n = row_count; v_arrastradas := v_arrastradas + v_n;

  /*
   * LO QUE EL PROPIO SISTEMA CREO A PARTIR DE LO SEMBRADO, que es la fuga que
   * mas costo ver: al abrir Recordatorios, las automatizaciones se ponen al dia
   * solas y crearon OCHENTA Y NUEVE recordatorios —"Confirmar la cita de
   * Fulana", "Reponer Incienso de copal"— a partir de las citas y los productos
   * inventados. Ninguno esta en el rastro, porque no los sembro la
   * demostracion: los creo el sistema funcionando, que es exactamente lo que se
   * queria enseñar.
   *
   * Se van con ella. Un recordatorio que habla de una cita que ya no existe no
   * es informacion del centro: es basura con nombre de paciente inventado, y
   * ademas no se puede abrir.
   *
   * Se compara contra TODO el rastro de una vez —cualquier id sembrado— porque
   * un recordatorio puede colgar de cuatro sitios distintos: la entidad de la
   * que habla, la fila que lo origino, la automatizacion que lo creo o la regla
   * que lo repite.
   */
  select array_agg(fila_id) into v_sembrados from dato_de_demostracion
   where negocio_id = p_negocio and fila_id is not null;
  v_sembrados := coalesce(v_sembrados, '{}'::uuid[]);

  delete from recordatorio rc
   where rc.negocio_id = p_negocio
     and (rc.entidad_id = any(v_sembrados)
       or rc.origen_id = any(v_sembrados)
       or rc.automatizacion_id = any(v_sembrados)
       or rc.recurrente_id = any(v_sembrados));
  get diagnostics v_n = row_count; v_arrastradas := v_arrastradas + v_n;

  -- Lo mismo con los gastos que nacieron de una plantilla recurrente sembrada:
  -- la renta de un local inventado no es un gasto del centro.
  delete from gasto g
   where g.negocio_id = p_negocio and g.recurrente_id = any(v_sembrados);
  get diagnostics v_n = row_count; v_arrastradas := v_arrastradas + v_n;

  -- Y las conversaciones que se abrieron con un paciente sembrado. Sus
  -- mensajes se van en cascada con ellas.
  delete from conversacion cv
   where cv.negocio_id = p_negocio and cv.cliente_id = any(v_clientes);
  get diagnostics v_n = row_count; v_arrastradas := v_arrastradas + v_n;

  /*
   * LO QUE ESTAS CUATRO NO NECESITAN, y por que:
   *   · `movimiento_inventario` y `producto_proveedor` cuelgan del producto en
   *     CASCADA: se van solos.
   *   · `conversacion`, `gasto`, `recordatorio` y `curso` apuntan con
   *     `set null`: se quedan, sin el dato que ya no existe. Es lo correcto —
   *     un gasto propio no desaparece porque su categoria era de la
   *     demostracion.
   */

  foreach v_tabla in array v_orden loop
    execute format(
      'delete from %I where id in (select fila_id from dato_de_demostracion' ||
      ' where negocio_id = $1 and tabla = %L and fila_id is not null)', v_tabla, v_tabla)
      using p_negocio;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  -- Los ajustes de recordatorios no tienen columna `id`: su llave es el
  -- centro. Solo se borran si los puso la demostracion.
  if exists (select 1 from dato_de_demostracion
              where negocio_id = p_negocio and tabla = 'recordatorio_ajustes') then
    delete from recordatorio_ajustes where negocio_id = p_negocio;
    v_total := v_total + 1;
  end if;

  -- Y la ficha del centro, TAMBIEN solo si la escribio la demostracion. Si
  -- alguien la edito despues, se queda: lo que una persona escribio vale mas
  -- que lo que invento este archivo.
  if exists (select 1 from dato_de_demostracion
              where negocio_id = p_negocio and tabla = 'estado.centro') then
    update estado set data = data - 'centro', updated_at = now()
     where negocio_id = p_negocio;
    v_total := v_total + 1;
  end if;

  delete from dato_de_demostracion where negocio_id = p_negocio;

  -- SE DEVUELVEN LAS DOS CIFRAS POR SEPARADO. "Se borraron 4 300 renglones" no
  -- dice si alguno era tuyo; "4 200 sembrados y 8 que capturaste encima de
  -- ellos" si, y es lo unico que deja entender que se fue.
  return jsonb_build_object('quitadas', v_total, 'arrastradas', v_arrastradas,
                            'cargada', false, 'filas', 0);
end;
$$;

comment on function public.quitar_datos_de_demostracion(text) is
  'Borra lo que sembro la demostracion, en el orden de las llaves foraneas, y ademas lo que se '
  'capturo COLGADO de ella —una venta a un paciente inventado se va con el—. Lo capturado aparte '
  'no se toca. Devuelve las dos cifras por separado.';

revoke all on function public.quitar_datos_de_demostracion(text) from public, anon;
grant execute on function public.quitar_datos_de_demostracion(text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. EL PERMISO QUE SUPABASE LE REGALA A CADA TABLA NUEVA
-- ---------------------------------------------------------------------
--
-- ESTO NO ES DEL BLOQUE 11: ES DE TODAS LAS TABLAS DEL PRODUCTO, y solo se vio
-- al comprobar la ultima contra la base de verdad.
--
-- Supabase trae puesto un `alter default privileges in schema public grant all
-- on tables to anon, authenticated, service_role`. "All" son SIETE permisos, no
-- cuatro: insert, select, update, delete, **truncate**, references y trigger.
-- Asi que cada tabla que crea este instalador nace con los siete, escriba lo
-- que escriba el archivo despues.
--
-- POR QUE IMPORTA, Y ES LO UNICO QUE IMPORTA DE ESTE BLOQUE: **las reglas de
-- fila NO se aplican a `truncate`**. Estan escritas para recortar que filas se
-- leen y se escriben; `truncate` no lee ni escribe filas, vacia la tabla. Con
-- ese permiso puesto, una sola sentencia dejaria en cero `cliente`, `venta` o
-- `movimiento_caja` — de todos los centros a la vez, y sin que ninguna politica
-- diga nada.
--
-- No es una puerta que este abierta hoy: PostgREST no manda `truncate` y nadie
-- de fuera tiene una conexion directa con el rol `authenticated`. Es un permiso
-- que sobra, y los permisos que sobran son los que se convierten en agujero el
-- dia que cambia otra cosa. Se quitan.
--
-- `references` y `trigger` van en el mismo viaje por lo mismo: nada del
-- producto los necesita, y con `trigger` se puede colgar codigo propio de una
-- tabla ajena.
--
-- LO QUE NO SE TOCA es lo que el sistema si usa: `select`, `insert`, `update` y
-- `delete` siguen exactamente como los dejo cada bloque, con sus reglas de fila
-- mordiendo encima.
--
-- HAY QUE VOLVER A CORRERLO CADA VEZ QUE NAZCA UNA TABLA. Por eso vive al final
-- del instalador y por eso `COMPROBAR-DEMOSTRACION.sql` lo comprueba: la unica
-- defensa contra un permiso que se regala solo es preguntarle a la base.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- =====================================================================
-- BLOQUE 12 — EL SISTEMA COMO UNO SOLO
-- =====================================================================
--
-- Este bloque no agrega una pantalla: agrega las CONEXIONES que faltaban entre
-- las que ya habia. Todo lo que hay aqui existe para que un dato que el sistema
-- ya conoce no se le vuelva a pedir a nadie.
--
--   1. El bloqueo real de la agenda: una cita ocupa su duracion MAS su
--      preparacion, y la restriccion de choque pasa a mirar eso.
--   2. `cobrar_cita`: completar una cita y cobrarla son un solo viaje, con la
--      venta atada a la cita para que no se pueda cobrar dos veces.
--   3. `cita_para_cobrar`: lo que Caja necesita para abrirse ya llena.
--   4. `ventas_por_dia`: los conteos que sostienen el historial por mes,
--      semana y dia sin traerse quinientas ventas al navegador.
--
-- LAS COLUMNAS NUEVAS NO ESTAN AQUI, estan mil lineas mas arriba y marcadas
-- para que el actualizador se las lleve: las funciones "language sql" que las
-- usan se validan al crearse, y a esas les toca antes que a este bloque.
--
-- NO BORRA NI REESCRIBE NADA. Lo unico que toca de lo que ya habia es rellenar
-- el bloqueo de las citas existentes, y lo rellena con lo que esas citas ya
-- ocupaban.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LA AGENDA BLOQUEA LO QUE DE VERDAD SE OCUPA
-- ---------------------------------------------------------------------
--
-- LAS CITAS QUE YA EXISTEN SE RELLENAN CON SU PROPIO HORARIO, ni un minuto
-- mas. Aplicarles la preparacion de hoy moveria hacia atras el bloqueo de una
-- cita de la semana que viene y podria hacerla chocar con la de al lado — una
-- cita que alguien ya agendo, que ya se confirmo, y que de pronto la base
-- declara imposible. La preparacion empieza a contar en lo que se agende de
-- ahora en adelante.
update cita
   set bloqueo_inicio = hora_inicio, bloqueo_fin = hora_fin
 where bloqueo_inicio is null or bloqueo_fin is null;

/**
 * LA RESTRICCION DE CHOQUE PASA A MIRAR EL BLOQUEO.
 *
 * Es la misma de siempre —la de exclusion, la que aguanta que dos personas
 * guarden en el mismo milisegundo— con una diferencia: compara lo que la sala
 * esta ocupada de verdad, no lo que dura la sesion. Con eso, un masaje de
 * 10:00 a 11:00 con quince minutos de limpieza deja la sala libre a las 11:15,
 * y la base se niega a guardar una cita a las 11:00.
 *
 * EL "coalesce" NO SOBRA. Una cita cuyo bloqueo fuera nulo produciria un rango
 * nulo, y un rango nulo no choca con nada: esa cita dejaria de reservar su
 * horario sin que nada avisara. Con el coalesce, lo peor que puede pasar es
 * que reserve exactamente lo que dura — que es como funcionaba antes.
 */
alter table cita drop constraint if exists cita_sin_choque;
alter table cita add constraint cita_sin_choque
  exclude using gist (
    negocio_id with =,
    coalesce(profesional_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    tsrange(fecha + coalesce(bloqueo_inicio, hora_inicio),
            fecha + coalesce(bloqueo_fin, hora_fin)) with &&
  )
  where (not eliminado and estado in ('pendiente', 'confirmada', 'completada'));

comment on constraint cita_sin_choque on cita is
  'Impide dos citas encimadas para el mismo profesional, contando la preparacion. Es una '
  'restriccion de la base y no una comprobacion previa: por eso aguanta que dos personas guarden '
  'al mismo tiempo.';

-- ---------------------------------------------------------------------
-- 2. COBRAR UNA CITA — un solo viaje, y una sola vez
-- ---------------------------------------------------------------------
--
-- POR QUE ES UNA FUNCION APARTE Y NO UN ARGUMENTO MAS DE `registrar_venta`:
--
-- Porque `registrar_venta` la llaman sitios que no tienen nada que ver con la
-- agenda, y porque cambiarle la firma a la funcion que mueve TODO el dinero
-- del sistema para agregarle un caso de uso es la clase de cambio que se paga
-- meses despues. Esta la envuelve: una funcion es una transaccion, asi que la
-- venta, el enlace con la cita y el cambio de estado pasan enteros o no pasa
-- ninguno.
--
-- LO QUE RESUELVE, CONTADO COMO PASA EN EL MOSTRADOR: la sesion termino, se
-- marca la cita completada, y hasta hoy habia que ir a Caja, buscar al
-- paciente, buscar el servicio y volver a escribir un precio que el sistema ya
-- sabia. Ahora se cobra desde la propia cita y no se vuelve a capturar nada.
create or replace function public.cobrar_cita(
  p_negocio text,
  p_cita uuid,
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
  v_cita  cita;
  v_venta venta;
  v_ya    venta;
begin
  -- Los porteros van AQUI: un `security definer` se salta las reglas de fila.
  -- `registrar_venta` vuelve a comprobar los suyos, y esta bien que lo haga:
  -- llegar hasta alla con una cita ajena ya seria tarde.
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_cita from cita
   where id = p_cita and negocio_id = p_negocio and not eliminado;
  if v_cita.id is null then
    raise exception 'Esa cita no existe en este centro.' using errcode = 'no_data_found';
  end if;

  /*
   * NO SE COBRA DOS VECES LA MISMA SESION.
   *
   * El indice unico es la defensa de verdad —aguanta dos mostradores a la
   * vez—, pero su error habla de un indice y no le dice nada a quien esta
   * cobrando. Aqui se comprueba para poder decirlo con palabras y con el folio
   * delante.
   *
   * SE PERDONA EL REINTENTO: si la venta que ya existe trae ESTA misma llave,
   * es la misma peticion llegando dos veces —una red lenta, un doble clic— y
   * lo correcto es devolver la que ya se hizo, no gritar.
   */
  select * into v_ya from venta
   where negocio_id = p_negocio and cita_id = p_cita
     and estado = 'cobrada' and not eliminado
   limit 1;
  if v_ya.id is not null then
    if p_llave is not null and v_ya.llave_idempotencia is not distinct from p_llave then
      return v_ya;
    end if;
    raise exception 'Esa cita ya se cobro con la venta %.', v_ya.folio
      using errcode = 'invalid_parameter_value';
  end if;

  /*
   * EL PACIENTE SALE DE LA CITA SI NADIE MANDA OTRO.
   *
   * Es el corazon de todo esto: la cita ya sabe de quien es. Volver a pedirlo
   * es exactamente el trabajo manual que este bloque existe para quitar. Se
   * deja mandar otro por un caso real —viene la mama a pagar la sesion de su
   * hija— y entonces manda quien cobra.
   */
  v_venta := registrar_venta(
    p_negocio,
    p_items,
    p_pagos,
    coalesce(p_cliente, v_cita.cliente_id),
    p_vendedor,
    p_descuento,
    p_efectivo_recibido,
    p_notas,
    p_llave,
    p_fecha
  );

  -- El enlace va DESPUES de la venta y dentro de la misma transaccion. Si
  -- `registrar_venta` hubiera fallado —sin stock, sin caja abierta, pagos que
  -- no cuadran— aqui no se llega y la cita se queda exactamente como estaba.
  update venta set cita_id = p_cita where id = v_venta.id
  returning * into v_venta;

  /*
   * COBRADA ES COMPLETADA. Si se pago, la sesion se dio.
   *
   * Solo se mueve desde los dos estados vivos: una cita cancelada o marcada
   * como que no asistio no revive por cobrarla —eso borraria el motivo por el
   * que se cancelo— y una que ya estaba completada se queda igual.
   *
   * Se llama a `cambiar_estado_cita` en vez de hacer el update aqui porque esa
   * funcion ademas apaga los recordatorios pendientes de la cita y deja el
   * rastro en la bitacora. Repetir el update se habria olvidado de las dos.
   */
  if v_cita.estado in ('pendiente', 'confirmada') then
    perform cambiar_estado_cita(p_cita, 'completada', null);
  end if;

  return v_venta;
end;
$$;

comment on function public.cobrar_cita is
  'Cobra una cita en UNA transaccion: registra la venta con registrar_venta, la ata a la cita y la '
  'deja completada. Que una cita se cobre dos veces lo impide el indice unico venta_una_por_cita; '
  'aqui solo se dice con palabras y con el folio delante.';

revoke all on function public.cobrar_cita(text, uuid, jsonb, jsonb, uuid, uuid, bigint, bigint,
                                          text, text, date) from public, anon;
grant execute on function public.cobrar_cita(text, uuid, jsonb, jsonb, uuid, uuid, bigint, bigint,
                                             text, text, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. LO QUE CAJA NECESITA PARA ABRIRSE YA LLENA
-- ---------------------------------------------------------------------
--
-- Devuelve la cita convertida en lo que el mostrador entiende: el servicio con
-- su precio, el paciente, el dia, la hora y quien la atendio. La pantalla solo
-- revisa y confirma.
--
-- EL PRECIO QUE VIAJA AQUI ES PARA ENSEÑAR, NO PARA COBRAR. Quien pone el
-- precio al cobrar sigue siendo `registrar_venta`, en el servidor. Si entre la
-- cita y el cobro subio la tarifa, se cobra la de hoy — y esta pantalla la
-- enseña antes de que nadie apriete nada.
--
-- EL VENDEDOR ARRANCA EN LA TERAPEUTA QUE ATENDIO. Es lo que casi siempre es
-- verdad, y se puede cambiar. Arrancar vacio obligaba a escogerla cada vez.
create or replace function public.cita_para_cobrar(
  p_cita uuid, p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id,
    'fecha', c.fecha,
    'horaInicio', to_char(c.hora_inicio, 'HH24:MI'),
    'horaFin', to_char(c.hora_fin, 'HH24:MI'),
    'estado', c.estado,
    'notas', c.notas,
    'clienteId', c.cliente_id,
    'cliente', cl.nombre,
    'servicioId', c.servicio_id,
    'servicio', s.nombre,
    -- El precio de HOY, con la promocion aplicada si la hay. Es el mismo que
    -- pondra el servidor al cobrar, calculado con la misma funcion.
    'precioCentavos', app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                                          s.promocion_desde, s.promocion_hasta, p_hoy),
    'servicioActivo', s.activo,
    'profesionalId', c.profesional_id,
    'profesional', m.nombre,
    -- Si ya se cobro, con que venta. La pantalla no ofrece cobrar de nuevo: la
    -- lleva a ver la que ya existe.
    'ventaId', (
      select v.id from venta v
      where v.negocio_id = c.negocio_id and v.cita_id = c.id
        and v.estado = 'cobrada' and not v.eliminado
      limit 1
    ),
    'ventaFolio', (
      select v.folio from venta v
      where v.negocio_id = c.negocio_id and v.cita_id = c.id
        and v.estado = 'cobrada' and not v.eliminado
      limit 1
    )
  )
  from cita c
  join cliente cl on cl.id = c.cliente_id
  join servicio s on s.id = c.servicio_id
  left join membresia m on m.id = c.profesional_id
  where c.id = p_cita and not c.eliminado;
$$;

comment on function public.cita_para_cobrar is
  'La cita con la forma que el mostrador necesita para abrirse ya llena. Va security invoker a '
  'proposito: mandan las reglas de fila, y un centro no puede pedir la cita de otro.';

-- ---------------------------------------------------------------------
-- 4. EL HISTORIAL POR MES, SEMANA Y DIA
-- ---------------------------------------------------------------------
--
-- QUE PROBLEMA RESUELVE: el historial acumula cientos de ventas y hasta ahora
-- solo se podia recorrer de diez en diez o buscar por texto. Buscar sirve
-- cuando ya se sabe que se busca; para "a ver que se hizo la segunda semana de
-- agosto" no sirve de nada.
--
-- POR QUE ES UNA FUNCION Y NO SE CUENTA EN EL NAVEGADOR: porque contar en el
-- navegador exige traerse las quinientas ventas para pintar doce renglones de
-- meses. Esto devuelve un renglon por DIA con venta —el nivel mas fino que
-- hace falta— y las semanas y los meses se suman a partir de ahi. Un año
-- entero de un centro ocupado son trescientos y pico renglones minusculos.
--
-- SOLO CUENTA LO COBRADO. Una venta cancelada no es actividad de ese dia: si
-- contara, la semana diria seis ventas y al abrirla habria cinco.
create or replace function public.ventas_por_dia(
  p_negocio text,
  p_desde date,
  p_hasta date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha', d.fecha,
           'cuantas', d.cuantas,
           'totalCentavos', d.total
         ) order by d.fecha desc), '[]'::jsonb)
  from (
    select v.fecha,
           count(*)::int as cuantas,
           coalesce(sum(v.total_centavos), 0)::bigint as total
      from venta v
     where v.negocio_id = p_negocio
       and not v.eliminado
       and v.estado = 'cobrada'
       and v.fecha between p_desde and p_hasta
     group by v.fecha
  ) d;
$$;

comment on function public.ventas_por_dia is
  'Un renglon por dia con ventas cobradas. De aqui salen los tres niveles del historial —mes, '
  'semana y dia— sumando hacia arriba, sin traerse una sola venta al navegador.';

-- ---------------------------------------------------------------------
-- 5. EL PERMISO REGALADO, OTRA VEZ
-- ---------------------------------------------------------------------
--
-- Este bloque NO crea tablas nuevas, asi que en rigor no hace falta. Se repite
-- porque cuesta nada y porque el dia que alguien agregue una tabla aqui la
-- linea ya esta puesta — que es justo lo que se olvida.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
