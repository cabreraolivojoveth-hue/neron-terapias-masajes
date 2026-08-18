-- =====================================================================
-- PARTE 6 DE 6 — pegar en Supabase -> SQL Editor -> Run
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
-- ESTA ES LA ULTIMA. Con esta ya esta todo.
--
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
do $$
declare
  -- LAS TABLAS DE ESTE PRODUCTO, nombradas una por una. Antes esta linea decia
  -- `on all tables in schema public`, que no significa "las mias" sino TODAS
  -- las del proyecto de Supabase. Corrido en un proyecto donde vive otro
  -- programa de Neron, le quitaba permisos a sus tablas sin que nadie se
  -- entere; y en ese otro programa eso no se ve como un permiso mal puesto,
  -- se ve como si los datos se hubieran borrado. Paso.
  --
  -- Si nace una tabla, se agrega aqui. Olvidarla no es silencioso: la guardia
  -- de fronteras compara esta lista con los `create table` del repositorio y
  -- rompe la publicacion si falta alguna.
  tablas_del_producto text[] := array[
    'automatizacion_de_mensajes', 'canal_de_mensajes', 'categoria', 'cita',
    'cliente', 'contador_de_folio', 'conversacion', 'conversacion_etiqueta',
    'cotizacion', 'cotizacion_item', 'curso', 'dato_de_demostracion',
    'difusion', 'gasto', 'gasto_recurrente', 'inscripcion',
    'invitacion', 'material_curso', 'mensaje', 'movimiento_caja',
    'movimiento_inventario', 'pago', 'plantilla_de_mensaje', 'producto',
    'producto_proveedor', 'proveedor', 'recordatorio', 'recordatorio_ajustes',
    'recordatorio_automatizacion', 'recordatorio_evento', 'recordatorio_recurrente', 'reporte_guardado',
    'servicio', 'sesion_caja', 'sesion_curso', 'venta',
    'venta_item'
  ];
  t text;
begin
  foreach t in array tablas_del_producto loop
    -- `to_regclass` devuelve nulo si la tabla todavia no existe: asi este
    -- bloque se puede correr en una base a medio actualizar sin reventar.
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- BLOQUE 14 — DARSE DE ALTA UNO MISMO
-- =====================================================================
--
-- EL AGUJERO QUE ESTO TAPA, Y QUE ERA EL PRIMERO QUE VEIA CUALQUIERA:
--
-- La pantalla de entrada pedia correo y contraseña, y no habia ninguna forma de
-- tener una. `membresia` solo la escribe el servidor —bien, es la puerta de
-- todo—, y el unico camino por el que nacia una era `reclamar_invitaciones`,
-- que exige que alguien de ADENTRO te haya invitado antes. O sea: para entrar
-- al primer centro hacia falta estar ya en un centro. Nadie podia empezar.
--
-- ESTA ES LA SEGUNDA PUERTA, Y LA ULTIMA. Las dos son estrechas a proposito:
--
--   · `reclamar_invitaciones` te mete a un centro AJENO, y por eso lo que
--     decide es el correo del token contra una invitacion que ya existia.
--   · `crear_mi_centro` te mete a un centro TUYO, que nace en esa misma
--     llamada. No hay nada ajeno que tocar, y por eso puede abrirse sin que
--     nadie invite: el unico dato que decide sigue siendo `auth.uid()`.
--
-- LAS TRES COSAS QUE LA MANTIENEN CERRADA:
--
--   1. EL ID DEL CENTRO NO ES UN PARAMETRO. Sale de `auth.uid()`, asi que dos
--      cuentas no pueden apuntar al mismo. Si viniera de la pantalla, cualquiera
--      escribiria el id del centro de otro y se daria de alta ahi de dueño —que
--      es exactamente el fallo que `membresia` existe para impedir.
--   2. UNA CUENTA, UN CENTRO. Si ya hay membresia viva, se rechaza. Sin esto,
--      alguien invitado como recepcionista se crearia un centro paralelo, y el
--      directorio devuelve UNA membresia: quedaria dentro del centro equivocado
--      sin entender por que.
--   3. UNA INVITACION PENDIENTE GANA. Quien fue invitado y en vez de reclamarla
--      se crea un centro propio deja la invitacion colgada para siempre y —lo
--      caro— empieza a capturar pacientes en un centro que nadie mas ve. Se le
--      manda al boton de al lado.
--
-- EL ROL ES `dueno` Y NO SE PREGUNTA. Es el rol de fabrica con la proteccion
-- anti-bloqueo: `app.tiene_permiso` le contesta true sin mirar la lista, asi que
-- el centro recien nacido tiene a alguien que puede TODO desde el primer
-- segundo. Un centro cuyo primer miembro no fuera dueño naceria sin nadie que
-- pudiera invitar al segundo.
create or replace function public.crear_mi_centro(
  p_centro text,
  p_mi_nombre text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_yo     uuid;
  v_correo text;
  v_id     text;
  v_centro text;
  v_nombre text;
begin
  v_yo := auth.uid();
  if v_yo is null then
    raise exception 'Hay que haber entrado para crear un centro.'
      using errcode = 'insufficient_privilege';
  end if;

  -- El correo sale del TOKEN, igual que en `reclamar_invitaciones` y por el
  -- mismo motivo: es el unico dato de la sesion que nadie puede escribir desde
  -- la pantalla. Se lee a mano de las reclamaciones y no con `auth.email()`
  -- para poder atacar esta funcion en un Postgres normal, donde ese ayudante
  -- de Supabase no existe.
  v_correo := lower(nullif(btrim(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'email', '')), ''));
  if v_correo is null then
    raise exception 'La sesion no trae correo, y la membresia lo necesita para invitar despues.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Los espacios de sobra se quitan AQUI y no en la pantalla: un centro
  -- llamado "Casa Zen " y otro "Casa Zen" se ven iguales en la lista y no lo
  -- son. Copiar y pegar arrastra ese espacio mas veces de las que uno creeria.
  v_centro := nullif(btrim(regexp_replace(coalesce(p_centro, ''), '\s+', ' ', 'g')), '');
  v_nombre := nullif(btrim(regexp_replace(coalesce(p_mi_nombre, ''), '\s+', ' ', 'g')), '');

  if v_centro is null then
    raise exception 'El centro necesita un nombre.' using errcode = 'check_violation';
  end if;
  if v_nombre is null then
    raise exception 'Escribe tu nombre: es el que va a firmar cada movimiento en la bitacora.'
      using errcode = 'check_violation';
  end if;
  if length(v_centro) > 80 or length(v_nombre) > 80 then
    raise exception 'El nombre no puede pasar de 80 letras.' using errcode = 'check_violation';
  end if;

  -- UNA CUENTA, UN CENTRO. El directorio devuelve UNA membresia, asi que una
  -- segunda dejaria a la persona dentro del centro equivocado sin explicacion.
  if exists (select 1 from membresia m
              where m.usuario_id = v_yo and m.activo and not m.eliminado) then
    raise exception 'Tu cuenta ya pertenece a un centro.' using errcode = 'unique_violation';
  end if;

  -- LA INVITACION PENDIENTE GANA. Ver la explicacion de arriba: crearse un
  -- centro propio teniendo una invitacion es empezar a capturar pacientes en
  -- un lugar que nadie mas del equipo va a ver.
  if exists (select 1 from invitacion i
              where i.estado = 'pendiente' and lower(i.correo) = v_correo) then
    raise exception 'Te invitaron a un centro. Usa "Ya me invitaron" en vez de crear uno nuevo.'
      using errcode = 'unique_violation';
  end if;

  -- `t_<uid sin guiones>`, la forma que documenta la base. Sale del token: no
  -- hay ningun parametro con el que apuntar al centro de otro.
  v_id := 't_' || replace(v_yo::text, '-', '');

  insert into negocio (id, nombre, producto)
  values (v_id, v_centro, 'terapias')
  -- Si el renglon ya existia —un intento anterior que se corto a la mitad— se
  -- reusa en vez de reventar. Es el mismo id de la misma persona.
  on conflict (id) do update set nombre = excluded.nombre;

  -- El bloque de estado nace vacio. Terapias guarda en sus propias tablas, pero
  -- la fila existe porque crearla es alta de negocio y aqui es donde se da.
  insert into estado (negocio_id, data) values (v_id, '{}'::jsonb)
  on conflict (negocio_id) do nothing;

  -- EL `do update` NO ES UN ADORNO, Y `do nothing` AQUI ERA UN BUCLE INFINITO.
  --
  -- La comprobacion de arriba solo mira membresias VIVAS. Quien tenga una
  -- inactiva o dada de baja en su propio `t_<uid>` —se desactivo la cuenta y
  -- vuelve a intentar— pasa esa comprobacion; con `do nothing` el insert no
  -- hacia nada, la funcion devolvia exito, la pantalla recargaba, el portero lo
  -- mandaba otra vez a "sin centro" y vuelta a empezar. Para siempre y sin un
  -- solo error, que es la peor forma de fallar.
  --
  -- Reactivarla es lo correcto: el centro es suyo y su id sale de su propio
  -- uid, asi que no hay ninguna membresia ajena que esto pueda tocar.
  insert into membresia (negocio_id, usuario_id, correo, nombre, rol, activo)
  values (v_id, v_yo, v_correo, v_nombre, 'dueno', true)
  on conflict (negocio_id, usuario_id) do update
    set activo = true, eliminado = false, rol = 'dueno',
        nombre = excluded.nombre, correo = excluded.correo;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (v_id, v_yo, v_nombre, 'Dueño', 'configuracion', 'crear-centro', v_id, null,
          jsonb_build_object('centro', v_centro, 'correo', v_correo));

  return jsonb_build_object('negocio', v_id, 'centro', v_centro);
end;
$$;

comment on function public.crear_mi_centro(text, text) is
  'La segunda y ultima puerta por la que nace una membresia. El id del centro sale de auth.uid(), '
  'nunca de un parametro: si viniera de la pantalla, cualquiera se daria de alta de dueño en el '
  'centro de cualquiera. Se rechaza si ya hay membresia viva o invitacion pendiente.';

revoke all on function public.crear_mi_centro(text, text) from public, anon;
grant execute on function public.crear_mi_centro(text, text) to authenticated;

