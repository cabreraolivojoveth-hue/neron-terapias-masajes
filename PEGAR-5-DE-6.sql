-- =====================================================================
-- PARTE 5 DE 6 — pegar en Supabase -> SQL Editor -> Run
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
-- CUANDO ESTA DIGA "Success", SIGUE CON LA PARTE 6.
--
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
