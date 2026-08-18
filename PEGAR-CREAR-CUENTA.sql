-- =====================================================================
-- CREAR CUENTA — pegar en Supabase -> SQL Editor -> Run
-- =====================================================================
--
-- Proyecto: hgypobbanvkwnqmepqim (neron-terapias). MIRA EL REF EN LA BARRA
-- DE DIRECCIONES: hay otro que se llama casi igual.
--
-- Es una sola funcion. Se puede correr las veces que haga falta: va con
-- `create or replace`, no crea tablas y no escribe ni un renglon de datos
-- hasta que alguien apriete el boton en la pantalla.
--
-- SIN ESTO, EL BOTON "Crear una cuenta" FALLA diciendo que la base no tiene
-- `crear_mi_centro`. Vercel publica el navegador, no la base.
--
-- Este bloque es identico al BLOQUE 14 del final de INSTALAR-EN-TERAPIAS.sql,
-- que es la fuente de verdad. Este archivo existe solo para no tener que pegar
-- quince mil lineas cuando la base ya esta instalada. La guardia 16 de
-- `guardias/fronteras.ts` lo vigila igual que al instalador: un recorte es
-- justo donde el texto se pega mal.
--
-- VA DESPUES DE `INSTALAR-EN-TERAPIAS.sql`, NO EN LUGAR DE EL. La funcion
-- consulta `invitacion` —para mandar al boton de al lado a quien ya fue
-- invitado— y esa tabla nace en el instalador de Terapias. En un proyecto que
-- solo tenga la base, esto falla diciendo que `invitacion` no existe.
--
-- ---------------------------------------------------------------------
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
