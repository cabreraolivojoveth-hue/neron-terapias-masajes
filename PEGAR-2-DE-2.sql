-- =====================================================================
-- PARTE 2 DE 2 — pegar en Supabase -> SQL Editor -> Run
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
    'plantilla_de_mensaje', 'canal_de_mensajes', 'reporte_guardado', 'auditoria'];
  v_tabla  text;
  v_n      int;
  v_total  int := 0;
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

  return jsonb_build_object('quitadas', v_total, 'cargada', false, 'filas', 0);
end;
$$;

comment on function public.quitar_datos_de_demostracion(text) is
  'Borra EXACTAMENTE lo que sembro la demostracion, en el orden de las llaves foraneas, y deja '
  'intacto lo que el centro haya capturado de verdad.';

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

