-- =====================================================================
-- PARTE 1 DE 5 — pegar en Supabase -> SQL Editor -> Run
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
-- Es seguro correrlo las veces que haga falta: no borra datos, no reescribe
-- filas, y todo va con `if not exists` o `create or replace`. Si ya corriste
-- una version anterior de este archivo, correr esta otra vez no hace daño.
--
-- QUE TRAE: SOLO EL BLOQUE 7, RECORDATORIOS.
--
--   · La tabla `recordatorio` del bloque 0 se completa —hora, categoria,
--     responsable, notas, prioridad urgente, origen, anticipacion y quien lo
--     cerro—. NO se sustituye: dos disparadores de Agenda ya escriben en ella.
--   · Llegan `recordatorio_recurrente` (la REGLA, no las ocurrencias),
--     `recordatorio_evento` (el rastro, solo se agrega), `recordatorio_ajustes`
--     y `recordatorio_automatizacion`, con sus reglas de fila y sus permisos.
--   · Veinte funciones del modulo.
--
-- Y ARRIBA, EN LAS CORRECCIONES: `resumen_inicio` vuelve a crearse para separar
-- los recordatorios de hoy de los vencidos. Sin ella el sitio funciona, pero las
-- dos tarjetas nuevas de Inicio salen en cero.
--
-- LO DE ANTES YA NO VIENE. Eliminar-producto, el expediente clinico, Gastos,
-- Reportes y Mensajes ya estan corridos en la base, asi que la frontera se movio
-- y este archivo volvio a ser corto. No es cosmetico: el archivo largo reventaba
-- al pegarlo — el troceador del editor de Supabase perdia el hilo de los `$$` y
-- mandaba media funcion.
--
-- Sin correr esto, el sitio se publica igual y Recordatorios abre con un error
-- que no dice nada util: el navegador pide funciones que la base no tiene.
-- Vercel publica el navegador, no la base.
--
-- Este archivo lo genera `scripts/actualizar-base.ts` a partir de
-- INSTALAR-EN-TERAPIAS.sql. No se edita a mano: se corre el guion.

-- =====================================================================
-- CORRECCIONES A LO QUE YA HABIAS CORRIDO
-- =====================================================================
--
-- Son `create or replace`: se pueden correr encima de las que ya existen.

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
      -- SE BUSCA POR LAS CUATRO COSAS QUE ALGUIEN RECUERDA DE UNA VENTA: el
      -- folio, a quien se le vendio, QUE se vendio y QUIEN la hizo. El vendedor
      -- faltaba, y era el que mas se pedia en "Ventas del dia": quien cierra el
      -- turno pregunta "¿cuanto vendio fulano hoy?" y escribir su nombre no
      -- devolvia nada — sin error, con cara de que ese dia no vendio.
      and (p_busqueda is null or (
            v.folio ilike '%' || p_busqueda || '%'
         or exists (select 1 from cliente c where c.id = v.cliente_id
                     and c.nombre ilike '%' || p_busqueda || '%')
         or exists (select 1 from membresia m where m.id = v.vendedor_id
                     and m.nombre ilike '%' || p_busqueda || '%')
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

create or replace function public.resumen_inicio(p_negocio text, p_hoy date default current_date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ayer         date := p_hoy - 1;
  v_lunes        date := p_hoy - ((extract(isodow from p_hoy)::int) - 1);
  v_ventas_hoy   bigint;
  v_ventas_ayer  bigint;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(total_centavos), 0) into v_ventas_hoy
  from venta where negocio_id = p_negocio and fecha = p_hoy and estado = 'cobrada' and not eliminado;

  select coalesce(sum(total_centavos), 0) into v_ventas_ayer
  from venta where negocio_id = p_negocio and fecha = v_ayer and estado = 'cobrada' and not eliminado;

  return jsonb_build_object(
    'citasHoy', (
      select count(*) from cita
      where negocio_id = p_negocio and fecha = p_hoy and not eliminado
        and estado not in ('cancelada')
    ),
    'citasPendientes', (
      select count(*) from cita
      where negocio_id = p_negocio and fecha = p_hoy and not eliminado and estado = 'pendiente'
    ),
    'ventasHoy', v_ventas_hoy,
    -- SIN COMPARACION cuando ayer fue cero: no existe el porcentaje de
    -- crecimiento desde la nada. Se manda null y la pantalla dice "nuevo".
    'ventasAyer', case when v_ventas_ayer = 0 then null else v_ventas_ayer end,
    'productosBajos', (
      select count(*) from producto
      where negocio_id = p_negocio and not eliminado and activo
        and stock_actual <= stock_minimo
    ),
    'cursosProximos', (
      select count(*) from curso
      where negocio_id = p_negocio and not eliminado
        and fecha_inicio >= p_hoy and estado in ('programado', 'en_curso')
    ),
    /*
     * LOS TRES NUMEROS DE RECORDATORIOS SALEN DE AQUI, Y ES LA UNICA FORMA DE
     * QUE INICIO CUADRE CON SU MODULO.
     *
     * `recordatoriosPendientes` conserva su nombre y su significado —lo que
     * urge: hoy y lo que ya vencio— porque ya lo leen la campana y el tablero,
     * y cambiarle el sentido a una llave que alguien lee es de los cambios que
     * no fallan y dejan un numero mintiendo.
     *
     * Los otros dos son nuevos y van SEPARADOS porque no significan lo mismo:
     * uno vence hoy y del otro ya se paso la fecha. Sumarlos deja al dueño sin
     * saber si tiene que correr o si ya llego tarde.
     */
    'recordatoriosPendientes', (
      select count(*) from recordatorio
      where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha <= p_hoy
    ),
    'recordatoriosHoy', (
      select count(*) from recordatorio
      where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha = p_hoy
    ),
    'recordatoriosVencidos', (
      select count(*) from recordatorio
      where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha < p_hoy
    ),
    -- La grafica de la semana: un renglon por dia, con cero en los dias sin
    -- ventas. Los ceros vienen de la base y no se rellenan en el navegador,
    -- para que la grafica no tenga huecos ni invente puntos.
    'ingresosSemana', (
      select coalesce(jsonb_agg(jsonb_build_object('fecha', d.dia, 'total', coalesce(s.total, 0)) order by d.dia), '[]'::jsonb)
      from generate_series(v_lunes, v_lunes + 6, interval '1 day') as d(dia)
      left join (
        select fecha, sum(total_centavos) as total
        from venta
        where negocio_id = p_negocio and estado = 'cobrada' and not eliminado
          and fecha between v_lunes and v_lunes + 6
        group by fecha
      ) s on s.fecha = d.dia::date
    ),
    -- Los rankings salen de las ventas reales. No hay ningun contador
    -- guardado a mano que pueda desincronizarse.
    'topServicios', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select s.id, s.nombre, sum(vi.cantidad)::int as sesiones
        from venta_item vi
        join venta v on v.id = vi.venta_id and v.estado = 'cobrada' and not v.eliminado
        join servicio s on s.id = vi.servicio_id
        where vi.negocio_id = p_negocio and vi.tipo = 'servicio'
        group by s.id, s.nombre
        order by sesiones desc, s.nombre
        limit 5
      ) x
    ),
    'topProductos', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.id, p.nombre, p.imagen_url, sum(vi.cantidad)::int as unidades
        from venta_item vi
        join venta v on v.id = vi.venta_id and v.estado = 'cobrada' and not v.eliminado
        join producto p on p.id = vi.producto_id
        where vi.negocio_id = p_negocio and vi.tipo = 'producto'
        group by p.id, p.nombre, p.imagen_url
        order by unidades desc, p.nombre
        limit 4
      ) x
    )
  );
end;
$$;

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
