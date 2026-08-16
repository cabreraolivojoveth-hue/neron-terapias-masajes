-- =====================================================================
-- PARTE 2 DE 6 — pegar en Supabase -> SQL Editor -> Run
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
-- CUANDO ESTA DIGA "Success", SIGUE CON LA PARTE 3.
--
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
