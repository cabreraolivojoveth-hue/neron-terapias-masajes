-- =====================================================================
-- PARTE 1 DE 6 — pegar en Supabase -> SQL Editor -> Run
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
