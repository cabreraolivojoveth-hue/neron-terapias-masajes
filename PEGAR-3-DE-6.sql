-- =====================================================================
-- PARTE 3 DE 6 — pegar en Supabase -> SQL Editor -> Run
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
-- CUANDO ESTA DIGA "Success", SIGUE CON LA PARTE 4.
--
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
