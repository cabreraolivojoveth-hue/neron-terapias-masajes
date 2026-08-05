-- =====================================================================
--  CREAR TU CENTRO Y DARTE DE ALTA COMO DUEÑA
--
--  Se corre UNA SOLA VEZ, despues de haber creado tu usuario.
--
--  ANTES DE ESTO, en Supabase:
--     Authentication  ->  Users  ->  Add user  ->  Create new user
--     Pones tu correo y una contraseña, y marcas "Auto Confirm User".
--     La contraseña la escoges tu; nadie mas la ve.
--
--  DESPUES cambias el correo de abajo por el tuyo y le das Run.
-- =====================================================================

do $$
declare
  -- ↓↓↓ CAMBIA ESTO POR TU CORREO ↓↓↓
  v_correo   text := 'cabreraolivojoveth@gmail.com';
  -- ↓↓↓ Y ESTO POR EL NOMBRE DE TU CENTRO ↓↓↓
  v_centro   text := 'Centro Holístico';

  v_usuario  uuid;
  v_negocio  text;
begin
  select id into v_usuario from auth.users where lower(email) = lower(v_correo);

  if v_usuario is null then
    raise exception
      'No existe ningun usuario con el correo %. Crealo primero en Authentication -> Users.', v_correo;
  end if;

  -- El id del negocio se arma con el id de la dueña: es la convencion de la
  -- base, y garantiza que no se repita nunca.
  v_negocio := 't_' || replace(v_usuario::text, '-', '');

  insert into negocio (id, nombre, producto)
  values (v_negocio, v_centro, 'terapias')
  on conflict (id) do update set nombre = excluded.nombre;

  insert into estado (negocio_id, data) values (v_negocio, '{}'::jsonb)
  on conflict (negocio_id) do nothing;

  /**
   * LOS ROLES DEL CENTRO.
   *
   * El de dueña no lleva permisos escritos: la base ya trata al dueño como
   * que puede todo, y es la proteccion anti-bloqueo — nadie, ni tu por
   * accidente, puede dejarte fuera de tu propio sistema.
   *
   * Recepcion y terapeuta si los llevan, y son los que puedes ajustar
   * despues desde Configuracion.
   */
  insert into rol (negocio_id, id, etiqueta, permisos) values
    (v_negocio, 'dueno', 'Dueña', '{}'::jsonb),
    (v_negocio, 'recepcion', 'Recepción', '{
        "gestionarClientes": true,
        "gestionarAgenda": true,
        "cobrar": true,
        "verFinanzas": false,
        "gestionarCatalogo": false,
        "gestionarInventario": false,
        "verExpediente": false,
        "gestionarUsuarios": false,
        "verAuditoria": false
     }'::jsonb),
    (v_negocio, 'terapeuta', 'Terapeuta', '{
        "gestionarClientes": true,
        "gestionarAgenda": true,
        "verExpediente": true,
        "cobrar": false,
        "verFinanzas": false,
        "gestionarCatalogo": false,
        "gestionarInventario": false,
        "gestionarUsuarios": false,
        "verAuditoria": false
     }'::jsonb)
  on conflict (negocio_id, id) do nothing;

  insert into membresia (negocio_id, usuario_id, correo, nombre, rol, activo)
  values (v_negocio, v_usuario, v_correo, split_part(v_correo, '@', 1), 'dueno', true)
  on conflict do nothing;

  raise notice 'Listo. Centro "%" creado con id %. Ya puedes entrar con %.',
    v_centro, v_negocio, v_correo;
end $$;

-- Comprobacion: tiene que devolver un renglon con tu correo y rol "dueno".
select m.correo, m.rol, m.activo, n.nombre as centro
from membresia m join negocio n on n.id = m.negocio_id
where lower(m.correo) = lower('cabreraolivojoveth@gmail.com');
