-- =====================================================================
-- ACTUALIZAR LA BASE — pegar completo en Supabase → SQL Editor → Run
-- =====================================================================
--
-- QUE TRAE: todo lo que la base necesita para el bloque 3 (CURSOS) — las
-- columnas nuevas del curso, las tablas de sesiones y de material, la lista
-- de espera, y las nueve funciones que lo sostienen.
--
-- ES SEGURO CORRERLO LAS VECES QUE HAGA FALTA. No borra nada, no reescribe
-- ningun dato y no toca una sola fila existente: crea dos tablas nuevas (que
-- nacen vacias), agrega columnas que pueden quedarse vacias, y crea o
-- reemplaza funciones y restricciones. Si lo corres dos veces no cambia nada.
--
-- ESTO SE PROBO ANTES DE MANDARTELO: se levanto un Postgres limpio, se
-- instalo la base, este archivo encima, y se corrieron los 111 ataques. No es
-- una lectura a ojo.
--
-- EL ARCHIVO COMPLETO Y CON TODAS LAS EXPLICACIONES sigue siendo
-- INSTALAR-EN-TERAPIAS.sql. Este es solo el pedazo nuevo, para no tener que
-- pegar dos mil lineas cada vez.
--
-- =====================================================================


-- =====================================================================
-- 0 · LAS CATEGORIAS — por si este archivo se corre solo
--
-- Llegaron con el bloque de Servicios. Se vuelven a declarar aqui para que
-- este archivo no dependa de aquel: todo va con `if not exists`, asi que si
-- ya estan no cambia absolutamente nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CATEGORIAS — una sola tabla para servicios y para cursos
-- ---------------------------------------------------------------------
--
-- POR QUE UNA Y NO DOS. Un centro llama "Terapias Energeticas" tanto a un
-- servicio como a un curso, y con dos tablas ese nombre existiria dos veces:
-- se renombra en una y la otra se queda vieja. La columna `ambito` separa los
-- dos catalogos sin duplicar tabla, reglas de acceso ni pantalla.
--
-- Y ES UNA ENTIDAD, no un texto dentro del servicio. Guardar
-- `categoria = 'Terapias Energeticas'` en cada renglon obliga a corregir
-- doscientos renglones para cambiarle una letra al nombre — y siempre queda
-- alguno sin corregir.
--
create table if not exists categoria (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  text not null references negocio(id) on delete cascade,
  ambito      text not null check (ambito in ('servicio', 'curso')),
  nombre      text not null,
  descripcion text,
  -- El color de la pastilla. Nulo = el tono neutro del sistema.
  color       text,
  activo      boolean not null default true,
  eliminado   boolean not null default false,
  creado_en   timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categoria_negocio_id_unico') then
    alter table categoria add constraint categoria_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

-- Dos categorias del mismo ambito no se pueden llamar igual. Sin esto se
-- crean "Masajes" y "masajes" y los servicios quedan repartidos entre las dos.
create unique index if not exists categoria_nombre_unico
  on categoria (negocio_id, ambito, lower(nombre)) where not eliminado;

alter table categoria enable row level security;
alter table categoria force row level security;

-- LAS REGLAS DE FILA NO BASTAN: hace falta el permiso de TABLA.
--
-- Una politica dice QUE filas puede tocar alguien; el `grant` dice si puede
-- tocar la tabla siquiera. Sin el, la consulta muere con "permission denied"
-- antes de que la politica llegue a opinar — y el mensaje no menciona la
-- politica, asi que se busca el error donde no esta.
revoke all on categoria from anon;
grant select, insert, update, delete on categoria to authenticated;

drop policy if exists categoria_leer on categoria;
create policy categoria_leer on categoria
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists categoria_escribir on categoria;
create policy categoria_escribir on categoria
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo')
              and app.licencia_permite(negocio_id));

-- =====================================================================
-- CURSOS — talleres y formaciones, con sus sesiones y sus alumnos
-- =====================================================================
--
-- CUATRO ENTIDADES QUE SE SEPARAN A PROPOSITO, porque meterlas en una sola
-- tabla es lo que despues no se puede deshacer:
--
--   curso            la DEFINICION: que se enseña, cuanto cuesta, cuanto cabe.
--   sesion_curso     la EJECUCION: que dia, a que hora, con quien, donde.
--   inscripcion      la RELACION de una persona con un curso.
--   material_curso   lo que se reparte.
--
-- Un curso de un dia y uno de veinte sesiones son la MISMA tabla con distinto
-- numero de renglones en `sesion_curso`. Columnas `sesion1`, `sesion2`,
-- `sesion3` obligan a migrar la tabla el dia que alguien programe la cuarta.
--
-- Y EL ALUMNO ES UN CLIENTE. No hay tabla de alumnos: hay `cliente` con una
-- `inscripcion`. Con dos tablas de personas, la misma señora acaba capturada
-- dos veces —una porque vino a un masaje y otra porque tomo el taller— y su
-- historial queda partido en dos mitades que ya no se vuelven a juntar.

-- ---------------------------------------------------------------------
-- LAS COLUMNAS QUE LE FALTABAN AL CURSO
-- ---------------------------------------------------------------------
--
-- Todo aditivo y todo opcional: un curso que ya existia sigue funcionando
-- igual con estas columnas vacias.
--
alter table curso add column if not exists subtitulo text;
alter table curso add column if not exists categoria_id uuid;
-- El instructor es una MEMBRESIA, no un texto. Guardar
-- `instructor = 'Maria Lopez'` obliga a corregir treinta cursos el dia que se
-- case, y ademas impide preguntar "¿que da esta persona el 15 de julio?".
alter table curso add column if not exists instructor_id uuid;
alter table curso add column if not exists modalidad text not null default 'presencial';
alter table curso add column if not exists lugar text;
-- Para modalidad en linea. No se enseña el campo cuando no aplica.
alter table curso add column if not exists enlace text;
alter table curso add column if not exists imagen_url text;
alter table curso add column if not exists notas text;
-- El interruptor de "se ofrece / no se ofrece", aparte del ciclo de vida.
-- Un curso puede estar apagado y ser proximo a la vez: son dos cosas.
alter table curso add column if not exists activo boolean not null default true;
alter table curso add column if not exists actualizado_en timestamptz not null default now();

alter table curso drop constraint if exists curso_modalidad_valida;
alter table curso add constraint curso_modalidad_valida
  check (modalidad in ('presencial', 'en_linea', 'hibrido'));

-- LAS LLAVES VAN COMPUESTAS, contra `(negocio_id, id)`. Con una llave simple
-- se podria colgar un curso de la categoria —o del instructor— de OTRO centro:
-- las llaves foraneas no obedecen las reglas de fila.
alter table curso drop constraint if exists curso_categoria_mismo_negocio;
alter table curso add constraint curso_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  -- `set null (columna)` y NO `set null` a secas: la llave es compuesta y un
  -- `set null` pelon vaciaria tambien `negocio_id`, que no acepta nulos.
  on delete set null (categoria_id);

alter table curso drop constraint if exists curso_instructor_mismo_negocio;
alter table curso add constraint curso_instructor_mismo_negocio
  foreign key (negocio_id, instructor_id) references membresia (negocio_id, id)
  on delete set null (instructor_id);

alter table curso drop constraint if exists curso_fechas_coherentes;
alter table curso add constraint curso_fechas_coherentes
  check (fecha_fin is null or fecha_fin >= fecha_inicio);

create index if not exists curso_categoria_idx on curso (negocio_id, categoria_id)
  where not eliminado;
create index if not exists curso_fecha_idx on curso (negocio_id, fecha_inicio)
  where not eliminado;

-- ---------------------------------------------------------------------
-- LAS SESIONES — la ejecucion del curso, una fila por reunion
-- ---------------------------------------------------------------------
--
-- LA FECHA Y LA HORA VAN SEPARADAS, igual que en `cita`, y NO como un
-- `timestamptz`. Guardar "15 de julio 09:00" como instante obliga a decidir en
-- que huso, y el dia que el servidor conteste en UTC la sesion aparece el 14
-- a las 23:00. Una fecha y una hora locales no se mueven nunca.
--
create table if not exists sesion_curso (
  id            uuid primary key default gen_random_uuid(),
  negocio_id    text not null references negocio(id) on delete cascade,
  curso_id      uuid not null,
  -- "Sesion 1", "Practica", "Examen". Vacio = se numera al leer.
  titulo        text,
  fecha         date not null,
  hora_inicio   time not null,
  hora_fin      time not null,
  -- Puede diferir del instructor del curso: en una formacion larga, la
  -- practica la da otra persona. Nulo = el del curso.
  instructor_id uuid,
  lugar         text,
  estado        text not null default 'programada'
                check (estado in ('programada', 'impartida', 'cancelada')),
  eliminado     boolean not null default false,
  creado_en     timestamptz not null default now(),
  check (hora_fin > hora_inicio)
);

comment on table sesion_curso is
  'La EJECUCION de un curso. Un curso de un dia y uno de veinte sesiones son la misma tabla con '
  'distinto numero de renglones: columnas sesion1/sesion2/sesion3 obligan a migrar el dia que '
  'alguien programe la cuarta.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sesion_curso_negocio_id_unico') then
    alter table sesion_curso add constraint sesion_curso_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

alter table sesion_curso drop constraint if exists sesion_curso_mismo_negocio;
alter table sesion_curso add constraint sesion_curso_mismo_negocio
  foreign key (negocio_id, curso_id) references curso (negocio_id, id) on delete cascade;

alter table sesion_curso drop constraint if exists sesion_instructor_mismo_negocio;
alter table sesion_curso add constraint sesion_instructor_mismo_negocio
  foreign key (negocio_id, instructor_id) references membresia (negocio_id, id)
  on delete set null (instructor_id);

create index if not exists sesion_curso_idx on sesion_curso (negocio_id, curso_id)
  where not eliminado;
-- La agenda pide un RANGO de fechas: sin este indice recorre la tabla entera
-- cada vez que alguien cambia de semana.
create index if not exists sesion_curso_fecha_idx on sesion_curso (negocio_id, fecha)
  where not eliminado;

alter table sesion_curso enable row level security;
alter table sesion_curso force row level security;

revoke all on sesion_curso from anon;
grant select, insert, update, delete on sesion_curso to authenticated;

drop policy if exists sesion_curso_leer on sesion_curso;
create policy sesion_curso_leer on sesion_curso
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists sesion_curso_escribir on sesion_curso;
create policy sesion_curso_escribir on sesion_curso
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo')
              and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- EL MATERIAL — lo que se reparte, y a quien se le enseña
-- ---------------------------------------------------------------------
--
-- SOLO EL ENLACE, no el archivo. Un PDF de veinte megas guardado como texto en
-- la base infla cada respaldo, se baja entero en cada consulta y acaba
-- tumbando la pantalla. El archivo vive en el almacenamiento; aqui vive donde
-- encontrarlo.
--
create table if not exists material_curso (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   text not null references negocio(id) on delete cascade,
  curso_id     uuid not null,
  titulo       text not null,
  tipo         text not null default 'enlace'
               check (tipo in ('enlace', 'archivo', 'nota')),
  url          text,
  descripcion  text,
  -- Distingue el material del equipo del que ve el alumno. Sin esta columna,
  -- las notas del instructor se le acaban mandando a los alumnos.
  visible_para_alumnos boolean not null default true,
  eliminado    boolean not null default false,
  creado_en    timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'material_curso_negocio_id_unico') then
    alter table material_curso add constraint material_curso_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

alter table material_curso drop constraint if exists material_curso_mismo_negocio;
alter table material_curso add constraint material_curso_mismo_negocio
  foreign key (negocio_id, curso_id) references curso (negocio_id, id) on delete cascade;

create index if not exists material_curso_idx on material_curso (negocio_id, curso_id)
  where not eliminado;

alter table material_curso enable row level security;
alter table material_curso force row level security;

revoke all on material_curso from anon;
grant select, insert, update, delete on material_curso to authenticated;

drop policy if exists material_curso_leer on material_curso;
create policy material_curso_leer on material_curso
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists material_curso_escribir on material_curso;
create policy material_curso_escribir on material_curso
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo')
              and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- LA INSCRIPCION — lo que le faltaba
-- ---------------------------------------------------------------------
--
-- INSCRIPCION Y PAGO SON COSAS DISTINTAS, y confundirlas es el error caro.
-- Alguien puede estar inscrito y deber; alguien puede haber pagado y despues
-- cancelar. Por eso `estado` habla de la inscripcion y `venta_id` del dinero:
-- son dos columnas, no una.
--
alter table inscripcion add column if not exists origen text not null default 'manual';
alter table inscripcion add column if not exists notas text;

-- LA LISTA DE ESPERA. Un curso lleno no rechaza a la gente: la apunta. Y NO
-- ocupa lugar — contarla como ocupado dejaria fuera a quien si cabe.
alter table inscripcion drop constraint if exists inscripcion_estado_check;
alter table inscripcion add constraint inscripcion_estado_check
  check (estado in ('inscrito', 'asistio', 'cancelado', 'lista_espera'));

-- CANCELAR NO DEBE CERRAR LA PUERTA PARA SIEMPRE.
--
-- El `unique (curso_id, cliente_id)` de antes impedia que alguien que cancelo
-- se volviera a inscribir: la fila cancelada seguia ocupando el lugar en el
-- indice. Ahora el unico va SOLO sobre las inscripciones vivas.
alter table inscripcion drop constraint if exists inscripcion_curso_id_cliente_id_key;
create unique index if not exists inscripcion_viva_unica
  on inscripcion (curso_id, cliente_id) where estado <> 'cancelado';

create index if not exists inscripcion_cliente_idx on inscripcion (negocio_id, cliente_id);

-- ---------------------------------------------------------------------
-- EL ESTADO DE UN CURSO SE DERIVA — no se guarda dos veces
-- ---------------------------------------------------------------------
--
-- Un curso que ya paso es "finalizado" porque la fecha ya paso, no porque
-- alguien se haya acordado de marcarlo. Un estado guardado a mano se queda
-- viejo el primer lunes que nadie entre al sistema.
--
-- Lo que SI se guarda es lo que no se puede deducir de un calendario:
-- que alguien lo CANCELO, y que alguien lo APAGO. Un curso cancelado y uno
-- que simplemente termino no son lo mismo para nadie.
--
create or replace function app.estado_del_curso(
  p_estado text, p_activo boolean, p_inicio date, p_fin date, p_hoy date
)
returns text
language sql
immutable
as $$
  select case
    when p_estado = 'cancelado' then 'cancelado'
    when not coalesce(p_activo, true) then 'inactivo'
    when coalesce(p_fin, p_inicio) < p_hoy then 'finalizado'
    when p_inicio <= p_hoy then 'activo'
    else 'proximo'
  end;
$$;

comment on function app.estado_del_curso is
  'El ciclo de vida se DERIVA de las fechas; solo cancelado y apagado se guardan, porque no se '
  'deducen de un calendario. Un estado guardado a mano se queda viejo el primer lunes que nadie entra.';

-- ---------------------------------------------------------------------
-- LOS LUGARES OCUPADOS — se cuentan, no se guardan
-- ---------------------------------------------------------------------
--
-- Un contador `lugares_ocupados` en la tabla se desincroniza a la primera
-- cancelacion, y a partir de ahi hay dos numeros verdaderos y nadie sabe cual
-- creer. La lista de espera NO ocupa lugar: para eso existe.
--
create or replace function app.lugares_ocupados(p_curso uuid)
returns int
language sql
stable
as $$
  select count(*)::int from inscripcion
  where curso_id = p_curso and estado in ('inscrito', 'asistio');
$$;

-- ---------------------------------------------------------------------
-- LOS CURSOS DEL CENTRO — buscados, filtrados y paginados en la base
-- ---------------------------------------------------------------------
--
-- `security invoker` a proposito: las reglas de fila se aplican a quien llama.
-- Un centro no puede pedir los cursos de otro ni equivocandose.
--
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

comment on function public.cursos_del_centro is
  'La pagina con el estado, los lugares ocupados y las sesiones YA calculados. Bajar la tabla y '
  'contar en el navegador funciona con diez cursos y se cae con doscientos, y ademas seria una '
  'consulta por renglon para saber cuantos alumnos tiene cada uno.';

-- ---------------------------------------------------------------------
-- LAS CUATRO CIFRAS DE ARRIBA
-- ---------------------------------------------------------------------
--
-- NINGUNA ESTA GUARDADA. "Proximos cursos" son los que empiezan dentro de los
-- proximos treinta dias, contados HOY: guardar `proximos = 3` deja el numero
-- viejo en cuanto pasa un dia.
--
-- "ALUMNOS INSCRITOS" NECESITA UNA DEFINICION, y esta es la que se uso:
-- inscripciones VIVAS —ni canceladas ni en lista de espera— en cursos que
-- todavia no terminan. No es la suma de los cupos, que seria la capacidad; ni
-- el historico, que crece para siempre y no dice nada del mes que viene.
--
create or replace function public.resumen_cursos(
  p_negocio text, p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with c as (
    select curso.*,
           app.estado_del_curso(curso.estado, curso.activo, curso.fecha_inicio,
                                curso.fecha_fin, p_hoy) as vida
    from curso where negocio_id = p_negocio and not eliminado
  )
  select jsonb_build_object(
    'total', (select count(*) from c),
    'activos', (select count(*) from c where vida in ('activo', 'proximo')),
    'proximos', (select count(*) from c
                 where vida = 'proximo' and fecha_inicio <= p_hoy + 30),
    'alumnos', (
      select count(*) from inscripcion i
      join c on c.id = i.curso_id
      where i.estado in ('inscrito', 'asistio')
        and c.vida in ('activo', 'proximo')
    ),
    -- La ocupacion promedio de los cursos QUE TIENEN CUPO. Un curso sin limite
    -- no tiene porcentaje de ocupacion, y meterlo como cero hundiria el
    -- promedio de los demas.
    'ocupacionPromedio', (
      select round(avg(app.lugares_ocupados(id)::numeric * 100 / cupo))
      from c where cupo is not null and cupo > 0 and vida in ('activo', 'proximo')
    )
  );
$$;

comment on function public.resumen_cursos is
  'Las cuatro cifras se CUENTAN cada vez. "Alumnos inscritos" = inscripciones vivas en cursos que '
  'todavia no terminan: no es la suma de los cupos (eso es capacidad) ni el historico (que crece '
  'para siempre y no dice nada del mes que viene).';

-- ---------------------------------------------------------------------
-- LA FICHA DE UN CURSO — con sus alumnos, sesiones y material
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- GUARDAR UN CURSO
-- ---------------------------------------------------------------------
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
  p_activo boolean default true
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

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if p_id is null then
    insert into curso (negocio_id, nombre, subtitulo, descripcion, categoria_id, instructor_id,
                       fecha_inicio, fecha_fin, precio_centavos, cupo, modalidad, lugar,
                       enlace, imagen_url, notas, activo)
    values (p_negocio, btrim(p_nombre), p_subtitulo, p_descripcion, p_categoria, p_instructor,
            p_inicio, p_fin, p_precio, p_cupo, coalesce(p_modalidad, 'presencial'), p_lugar,
            p_enlace, p_imagen, p_notas, coalesce(p_activo, true))
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
         activo = coalesce(p_activo, v_c.activo), actualizado_en = now()
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

-- ---------------------------------------------------------------------
-- INSCRIBIR — con el cupo comprobado DENTRO de la transaccion
-- ---------------------------------------------------------------------
--
-- LA SOBREVENTA ES EL FALLO QUE NO SE PERDONA. La forma obvia —contar los
-- inscritos y, si caben, insertar— tiene una ventana entre las dos
-- operaciones: si dos personas compran el ultimo lugar a la vez, las dos
-- cuentas ven once de doce, las dos insertan, y el sabado llegan trece
-- personas a un salon de doce sillas.
--
-- El `for update` sobre el renglon del curso serializa a quien pregunte por
-- ese curso. La segunda espera a que la primera termine, y entonces ya cuenta
-- doce. No hay ventana.
--
create or replace function public.inscribir_en_curso(
  p_negocio text, p_curso uuid, p_cliente uuid,
  p_origen text default 'manual', p_notas text default null
)
returns inscripcion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_curso    curso;
  v_i        inscripcion;
  v_ocupados int;
  v_estado   text;
  v_quien    membresia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarCatalogo') then
    raise exception 'No tienes permiso para administrar inscripciones.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  -- EL CANDADO. Todo lo que sigue esta protegido de la carrera.
  select * into v_curso from curso
   where id = p_curso and negocio_id = p_negocio and not eliminado
   for update;
  if v_curso.id is null then
    raise exception 'Ese curso no existe.' using errcode = 'no_data_found';
  end if;
  if v_curso.estado = 'cancelado' then
    raise exception 'Ese curso esta cancelado.' using errcode = 'invalid_parameter_value';
  end if;

  -- El alumno tiene que ser un cliente DE ESTE CENTRO. Sin esta comprobacion
  -- se podria inscribir al paciente de otro consultorio.
  if not exists (select 1 from cliente
                  where id = p_cliente and negocio_id = p_negocio and not eliminado) then
    raise exception 'Ese cliente no existe en este centro.' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from inscripcion
              where curso_id = p_curso and cliente_id = p_cliente and estado <> 'cancelado') then
    raise exception 'Esa persona ya esta inscrita en este curso.'
      using errcode = 'unique_violation';
  end if;

  v_ocupados := app.lugares_ocupados(p_curso);

  -- LLENO NO ES "NO": ES LISTA DE ESPERA. Rechazar a alguien pierde al cliente;
  -- apuntarlo deja constancia de cuanta demanda hubo de verdad.
  if v_curso.cupo is not null and v_ocupados >= v_curso.cupo then
    v_estado := 'lista_espera';
  else
    v_estado := 'inscrito';
  end if;

  insert into inscripcion (negocio_id, curso_id, cliente_id, estado, origen, notas)
  values (p_negocio, p_curso, p_cliente, v_estado, coalesce(p_origen, 'manual'), p_notas)
  returning * into v_i;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'cursos', 'inscribir', p_curso::text, null,
          jsonb_build_object('clienteId', p_cliente, 'estado', v_estado));

  return v_i;
end;
$$;

comment on function public.inscribir_en_curso is
  'El cupo se comprueba DENTRO de la transaccion, con el renglon del curso bloqueado. Contar y '
  'luego insertar deja una ventana en la que dos personas compran el ultimo lugar y el sabado '
  'llegan trece a un salon de doce. Lleno no rechaza: manda a lista de espera.';

-- ---------------------------------------------------------------------
-- CAMBIAR EL ESTADO DE UNA INSCRIPCION
-- ---------------------------------------------------------------------
--
-- Cancelar LIBERA un lugar, y si hay alguien esperando hay que poder subirlo.
-- Subir a alguien de la lista de espera vuelve a pasar por el mismo candado:
-- de otro modo se podria pasar del cupo por la puerta de atras.
--
create or replace function public.cambiar_estado_inscripcion(
  p_inscripcion uuid, p_estado text, p_motivo text default null
)
returns inscripcion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_i      inscripcion;
  v_curso  curso;
  v_antes  text;
  v_quien  membresia;
begin
  select * into v_i from inscripcion where id = p_inscripcion;
  if v_i.id is null then
    raise exception 'Esa inscripcion no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_i.negocio_id, 'gestionarCatalogo') then
    raise exception 'No tienes permiso para administrar inscripciones.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(v_i.negocio_id) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_estado not in ('inscrito', 'asistio', 'cancelado', 'lista_espera') then
    raise exception 'Ese estado de inscripcion no existe.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_curso from curso where id = v_i.curso_id for update;

  -- Subir a alguien de la espera vuelve a comprobar el cupo, con el candado
  -- puesto: si no, la lista de espera seria la puerta de atras del cupo.
  if p_estado in ('inscrito', 'asistio') and v_i.estado not in ('inscrito', 'asistio')
     and v_curso.cupo is not null and app.lugares_ocupados(v_i.curso_id) >= v_curso.cupo then
    raise exception 'El curso esta lleno: no se puede confirmar esta inscripcion.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_antes := v_i.estado;
  update inscripcion set estado = p_estado where id = p_inscripcion returning * into v_i;

  select * into v_quien from membresia
   where negocio_id = v_i.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues, motivo)
  values (v_i.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'cursos', 'inscripcion', p_inscripcion::text,
          jsonb_build_object('estado', v_antes), jsonb_build_object('estado', p_estado), p_motivo);

  return v_i;
end;
$$;

-- ---------------------------------------------------------------------
-- GUARDAR UNA SESION — con el choque de instructor comprobado
-- ---------------------------------------------------------------------
--
-- EL CHOQUE SE COMPRUEBA CONTRA LAS DOS AGENDAS: las citas y las demas
-- sesiones. Una terapeuta no puede estar dando un taller y atendiendo a una
-- paciente a la misma hora, y comprobar solo una de las dos tablas deja
-- exactamente esa mitad del problema sin resolver.
--
create or replace function public.guardar_sesion_curso(
  p_curso uuid,
  p_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time,
  p_titulo text default null,
  p_instructor uuid default null,
  p_lugar text default null,
  p_estado text default 'programada'
)
returns sesion_curso
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_curso  curso;
  v_s      sesion_curso;
  v_quien  uuid;
  v_choque text;
begin
  select * into v_curso from curso where id = p_curso and not eliminado;
  if v_curso.id is null then
    raise exception 'Ese curso no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_curso.negocio_id, 'gestionarCatalogo') then
    raise exception 'No tienes permiso para administrar sesiones.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(v_curso.negocio_id) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_hora_fin <= p_hora_inicio then
    raise exception 'La sesion no puede terminar antes de empezar.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Nulo = el instructor del curso. Se resuelve AQUI para que la comprobacion
  -- de choque mire a la persona correcta y no a un nulo.
  v_quien := coalesce(p_instructor, v_curso.instructor_id);

  if v_quien is not null then
    select 'una cita' into v_choque from cita c
     where c.negocio_id = v_curso.negocio_id
       and c.profesional_id = v_quien
       and c.fecha = p_fecha
       and not c.eliminado
       and c.estado in ('pendiente', 'confirmada')
       and c.hora_inicio < p_hora_fin and c.hora_fin > p_hora_inicio
     limit 1;

    if v_choque is null then
      select 'otra sesion' into v_choque from sesion_curso s
       where s.negocio_id = v_curso.negocio_id
         and coalesce(s.instructor_id,
                      (select k.instructor_id from curso k where k.id = s.curso_id)) = v_quien
         and s.fecha = p_fecha
         and not s.eliminado
         and s.estado = 'programada'
         and (p_id is null or s.id <> p_id)
         and s.hora_inicio < p_hora_fin and s.hora_fin > p_hora_inicio
       limit 1;
    end if;

    if v_choque is not null then
      raise exception 'Esa persona ya tiene % a esa hora.', v_choque
        using errcode = 'exclusion_violation';
    end if;
  end if;

  if p_id is null then
    insert into sesion_curso (negocio_id, curso_id, titulo, fecha, hora_inicio, hora_fin,
                              instructor_id, lugar, estado)
    values (v_curso.negocio_id, p_curso, p_titulo, p_fecha, p_hora_inicio, p_hora_fin,
            p_instructor, p_lugar, coalesce(p_estado, 'programada'))
    returning * into v_s;
    return v_s;
  end if;

  update sesion_curso
     set titulo = p_titulo, fecha = p_fecha, hora_inicio = p_hora_inicio, hora_fin = p_hora_fin,
         instructor_id = p_instructor, lugar = p_lugar, estado = coalesce(p_estado, estado)
   where id = p_id and curso_id = p_curso
  returning * into v_s;
  if v_s.id is null then
    raise exception 'Esa sesion no existe.' using errcode = 'no_data_found';
  end if;
  return v_s;
end;
$$;

comment on function public.guardar_sesion_curso is
  'El choque de instructor se comprueba contra LAS DOS agendas —citas y otras sesiones—: mirar '
  'solo una deja justo la otra mitad del problema sin resolver.';

-- ---------------------------------------------------------------------
-- BORRAR UNA SESION Y GUARDAR MATERIAL
-- ---------------------------------------------------------------------
create or replace function public.archivar_sesion_curso(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n text;
begin
  select negocio_id into v_n from sesion_curso where id = p_id;
  if v_n is null then
    raise exception 'Esa sesion no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_n, 'gestionarCatalogo') then
    raise exception 'No tienes permiso para administrar sesiones.'
      using errcode = 'insufficient_privilege';
  end if;
  -- Se marca, no se borra: la sesion se impartio y la asistencia cuelga de
  -- ella. Un renglon borrado de verdad deja huecos en la historia.
  update sesion_curso set eliminado = true where id = p_id;
end;
$$;

create or replace function public.guardar_material_curso(
  p_curso uuid,
  p_id uuid,
  p_titulo text,
  p_tipo text default 'enlace',
  p_url text default null,
  p_descripcion text default null,
  p_visible boolean default true
)
returns material_curso
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_curso curso;
  v_m     material_curso;
begin
  select * into v_curso from curso where id = p_curso and not eliminado;
  if v_curso.id is null then
    raise exception 'Ese curso no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_curso.negocio_id, 'gestionarCatalogo') then
    raise exception 'No tienes permiso para administrar material.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'El material necesita un titulo.' using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into material_curso (negocio_id, curso_id, titulo, tipo, url, descripcion,
                                visible_para_alumnos)
    values (v_curso.negocio_id, p_curso, btrim(p_titulo), coalesce(p_tipo, 'enlace'), p_url,
            p_descripcion, coalesce(p_visible, true))
    returning * into v_m;
    return v_m;
  end if;

  update material_curso
     set titulo = btrim(p_titulo), tipo = coalesce(p_tipo, tipo), url = p_url,
         descripcion = p_descripcion, visible_para_alumnos = coalesce(p_visible, true)
   where id = p_id and curso_id = p_curso
  returning * into v_m;
  if v_m.id is null then
    raise exception 'Ese material no existe.' using errcode = 'no_data_found';
  end if;
  return v_m;
end;
$$;

create or replace function public.archivar_material_curso(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n text;
begin
  select negocio_id into v_n from material_curso where id = p_id;
  if v_n is null then
    raise exception 'Ese material no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_n, 'gestionarCatalogo') then
    raise exception 'No tienes permiso para administrar material.'
      using errcode = 'insufficient_privilege';
  end if;
  update material_curso set eliminado = true where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- LOS CURSOS DE UN CLIENTE — para su expediente
-- ---------------------------------------------------------------------
--
-- Sale de `inscripcion`, no de una copia dentro del cliente. Por eso cambiar
-- la fecha de un curso cambia a la vez lo que ve el expediente de los quince
-- inscritos, sin tocar quince renglones.
--
create or replace function public.cursos_del_cliente(
  p_cliente uuid, p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'inscripcionId', i.id,
    'cursoId', c.id,
    'nombre', c.nombre,
    'subtitulo', c.subtitulo,
    'fechaInicio', c.fecha_inicio,
    'fechaFin', c.fecha_fin,
    'estado', i.estado,
    'pagada', i.venta_id is not null,
    'vida', app.estado_del_curso(c.estado, c.activo, c.fecha_inicio, c.fecha_fin, p_hoy)
  ) order by c.fecha_inicio desc), '[]'::jsonb)
  from inscripcion i
  join curso c on c.id = i.curso_id and not c.eliminado
  where i.cliente_id = p_cliente;
$$;

-- ---------------------------------------------------------------------
-- LAS SESIONES DE UN RANGO — lo que la AGENDA necesita
-- ---------------------------------------------------------------------
--
-- LA AGENDA NO GUARDA COPIAS DE LAS SESIONES. Las pide aqui, con la misma
-- forma que una cita, y las pinta como un tipo de evento distinto. Crear una
-- cita "espejo" por cada sesion garantiza que el dia que alguien reprograme la
-- sesion, la copia se quede con la fecha vieja.
--
create or replace function public.sesiones_del_rango(
  p_negocio text,
  p_desde date,
  p_hasta date,
  p_profesional uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'cursoId', c.id,
    'titulo', coalesce(nullif(btrim(s.titulo), ''), c.nombre),
    'curso', c.nombre,
    'fecha', s.fecha,
    'horaInicio', s.hora_inicio,
    'horaFin', s.hora_fin,
    'lugar', coalesce(s.lugar, c.lugar),
    'estado', s.estado,
    'profesionalId', coalesce(s.instructor_id, c.instructor_id),
    'profesional', (select m.nombre from membresia m
                     where m.id = coalesce(s.instructor_id, c.instructor_id)),
    -- Los alumnos se cuentan al leer. Guardarlo en la sesion obligaria a
    -- recalcularlo con cada inscripcion y cada baja.
    'alumnos', (select count(*) from inscripcion i
                 where i.curso_id = c.id and i.estado in ('inscrito', 'asistio'))
  ) order by s.fecha, s.hora_inicio), '[]'::jsonb)
  from sesion_curso s
  join curso c on c.id = s.curso_id and not c.eliminado
  where s.negocio_id = p_negocio
    and not s.eliminado
    and s.fecha between p_desde and p_hasta
    and (p_profesional is null
         or coalesce(s.instructor_id, c.instructor_id) = p_profesional);
$$;

comment on function public.sesiones_del_rango is
  'La agenda las CONSULTA, no las copia. Una cita espejo por cada sesion se queda con la fecha '
  'vieja el dia que alguien reprograme la sesion de verdad.';

-- =====================================================================
-- LISTO. Si no salio ningun error en rojo, la base ya tiene todo lo que
-- necesitan las pantallas de Cursos — y las sesiones ya salen en la Agenda.
-- =====================================================================
