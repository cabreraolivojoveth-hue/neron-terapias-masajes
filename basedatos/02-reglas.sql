-- =====================================================================
-- REGLAS DE ACCESO POR FILA — NERON TERAPIAS
--
-- Cada tabla del producto lleva reglas encendidas Y FORZADAS, y cada una
-- tiene su propio ataque escrito en `pruebas-bd/ataques.ts`.
--
-- Esto no es burocracia: es el agujero exacto de Neron POS. Alli el archivo
-- de reglas existia y nunca se ejecuto, y nadie lo noto porque el sistema
-- FUNCIONA MEJOR SIN REGLAS. Con la llave publica —la que va en el navegador
-- y cualquiera ve— se podia pedir el expediente de todos los pacientes de
-- todos los negocios. No hacia falta atacar nada: era una consulta normal.
--
-- Se apoyan en las tres funciones de la base, sin modificarlas:
--   app.es_miembro(negocio)              ¿perteneces a este negocio?
--   app.tiene_permiso(negocio, capacidad) ¿puedes hacer esto?
--   app.licencia_permite(negocio)         ¿la licencia deja escribir?
--
-- LAS CAPACIDADES DEL PRODUCTO
-- ----------------------------
-- La base trae las administrativas. Terapias agrega las suyas, y encajan sin
-- tocar la base porque `tiene_permiso` acepta cualquier nombre de capacidad:
--
--   gestionarClientes    dar de alta y editar pacientes
--   gestionarAgenda      crear y mover citas
--   gestionarCatalogo    servicios y cursos
--   gestionarInventario  productos y existencias
--   cobrar               levantar y cobrar ventas
--   verFinanzas          ver ventas, pagos, caja, gastos y totales
--   verExpediente        leer las notas clinicas del paciente
--
-- verFinanzas se aplica AQUI, en la base — no escondiendo tarjetas en la
-- pantalla. Una recepcionista sin ese permiso no es que no vea el total del
-- dia: es que la base de datos no se lo entrega aunque lo pida a mano.
-- =====================================================================

alter table cliente          enable row level security;  alter table cliente          force row level security;
alter table servicio         enable row level security;  alter table servicio         force row level security;
alter table curso            enable row level security;  alter table curso            force row level security;
alter table producto         enable row level security;  alter table producto         force row level security;
alter table cita             enable row level security;  alter table cita             force row level security;
alter table venta            enable row level security;  alter table venta            force row level security;
alter table venta_item       enable row level security;  alter table venta_item       force row level security;
alter table pago             enable row level security;  alter table pago             force row level security;
alter table gasto            enable row level security;  alter table gasto            force row level security;
alter table movimiento_caja  enable row level security;  alter table movimiento_caja  force row level security;
alter table inscripcion      enable row level security;  alter table inscripcion      force row level security;
alter table recordatorio     enable row level security;  alter table recordatorio     force row level security;
alter table categoria        enable row level security;  alter table categoria        force row level security;
-- Estas dos las crea `INSTALAR-EN-TERAPIAS.sql`, que se aplica DESPUES. Este
-- archivo tambien se usa para restaurar las reglas despues del control
-- negativo, y entonces si existen — asi que se encienden solo si estan.
do $$ begin
  if to_regclass('public.sesion_curso') is not null then
    execute 'alter table sesion_curso enable row level security';
    execute 'alter table sesion_curso force row level security';
  end if;
  if to_regclass('public.material_curso') is not null then
    execute 'alter table material_curso enable row level security';
    execute 'alter table material_curso force row level security';
  end if;
  if to_regclass('public.proveedor') is not null then
    execute 'alter table proveedor enable row level security';
    execute 'alter table proveedor force row level security';
  end if;
  if to_regclass('public.producto_proveedor') is not null then
    execute 'alter table producto_proveedor enable row level security';
    execute 'alter table producto_proveedor force row level security';
  end if;
  if to_regclass('public.movimiento_inventario') is not null then
    execute 'alter table movimiento_inventario enable row level security';
    execute 'alter table movimiento_inventario force row level security';
  end if;
end $$;

-- El visitante sin sesion no ve absolutamente nada del producto.
revoke all on cliente, servicio, curso, producto, cita, venta, venta_item,
              pago, gasto, movimiento_caja, inscripcion, recordatorio, categoria
  from anon;

grant select, insert, update, delete on cliente, servicio, curso, producto, cita,
              venta, venta_item, pago, gasto, inscripcion, recordatorio, categoria
  to authenticated;
grant select, insert on movimiento_caja to authenticated;

-- ---------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------
drop policy if exists cliente_leer on cliente;
create policy cliente_leer on cliente
  for select to authenticated
  using (app.es_miembro(negocio_id));

drop policy if exists cliente_crear on cliente;
create policy cliente_crear on cliente
  for insert to authenticated
  with check (
    app.es_miembro(negocio_id)
    and app.tiene_permiso(negocio_id, 'gestionarClientes')
    and app.licencia_permite(negocio_id)
  );

drop policy if exists cliente_editar on cliente;
create policy cliente_editar on cliente
  for update to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarClientes'))
  -- El `with check` impide MOVER el renglon a otro negocio. Sin el, alguien
  -- edita un cliente suyo y le cambia el negocio_id al de la competencia.
  with check (app.es_miembro(negocio_id) and app.licencia_permite(negocio_id));

-- No hay politica de DELETE a proposito: los clientes se marcan como
-- eliminados. Un expediente borrado de verdad es un problema legal.

-- ---------------------------------------------------------------------
-- SERVICIOS Y CURSOS — el catalogo
-- ---------------------------------------------------------------------
-- La categoria se LEE con ser miembro y se ESCRIBE con gestionarCatalogo: es
-- parte del catalogo, y quien no puede tocar un servicio tampoco puede
-- renombrar el grupo al que pertenece.
drop policy if exists categoria_leer on categoria;
create policy categoria_leer on categoria
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists categoria_escribir on categoria;
create policy categoria_escribir on categoria
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo')
              and app.licencia_permite(negocio_id));

drop policy if exists servicio_leer on servicio;
create policy servicio_leer on servicio
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists servicio_crear on servicio;
create policy servicio_crear on servicio
  for insert to authenticated
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo')
              and app.licencia_permite(negocio_id));

drop policy if exists servicio_editar on servicio;
create policy servicio_editar on servicio
  for update to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo'))
  with check (app.es_miembro(negocio_id) and app.licencia_permite(negocio_id));

drop policy if exists curso_leer on curso;
create policy curso_leer on curso
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists curso_crear on curso;
create policy curso_crear on curso
  for insert to authenticated
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo')
              and app.licencia_permite(negocio_id));

drop policy if exists curso_editar on curso;
create policy curso_editar on curso
  for update to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo'))
  with check (app.es_miembro(negocio_id) and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- PRODUCTOS
-- ---------------------------------------------------------------------
drop policy if exists producto_leer on producto;
create policy producto_leer on producto
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists producto_crear on producto;
create policy producto_crear on producto
  for insert to authenticated
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario')
              and app.licencia_permite(negocio_id));

drop policy if exists producto_editar on producto;
create policy producto_editar on producto
  for update to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario'))
  with check (app.es_miembro(negocio_id) and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- CITAS
-- ---------------------------------------------------------------------
drop policy if exists cita_leer on cita;
create policy cita_leer on cita
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists cita_crear on cita;
create policy cita_crear on cita
  for insert to authenticated
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarAgenda')
              and app.licencia_permite(negocio_id));

drop policy if exists cita_editar on cita;
create policy cita_editar on cita
  for update to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarAgenda'))
  with check (app.es_miembro(negocio_id) and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- VENTAS — aqui empieza el dinero
-- ---------------------------------------------------------------------
drop policy if exists venta_leer on venta;
create policy venta_leer on venta
  for select to authenticated
  -- No basta con ser miembro: hay que poder ver finanzas. Es la regla del
  -- arquitecto aplicada donde debe estar — en la fuente, no en la pantalla.
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists venta_crear on venta;
create policy venta_crear on venta
  for insert to authenticated
  with check (
    app.es_miembro(negocio_id)
    and app.tiene_permiso(negocio_id, 'cobrar')
    and app.licencia_permite(negocio_id)
    -- Una venta NACE en borrador, siempre. Nadie la crea ya cobrada: cobrar
    -- es una operacion con consecuencias (baja inventario, mueve caja) y esa
    -- tiene que pasar por la funcion, no por un insert.
    and estado = 'borrador'
  );

drop policy if exists venta_editar on venta;
create policy venta_editar on venta
  for update to authenticated
  using (
    app.es_miembro(negocio_id)
    and app.tiene_permiso(negocio_id, 'cobrar')
    -- Solo se toca mientras es un carrito a medias. Una venta cobrada es un
    -- hecho consumado: para deshacerla existe cancelar_venta().
    and estado = 'borrador'
  )
  with check (
    app.es_miembro(negocio_id)
    and app.licencia_permite(negocio_id)
    -- Y NO se puede salir de borrador por la puerta de atras. Sin esta linea,
    -- un `update venta set estado='cobrada'` metia la venta a los ingresos
    -- del dia sin bajar una sola pieza de inventario ni tocar la caja.
    and estado = 'borrador'
  );

drop policy if exists venta_item_leer on venta_item;
create policy venta_item_leer on venta_item
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists venta_item_escribir on venta_item;
create policy venta_item_escribir on venta_item
  for all to authenticated
  using (
    app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'cobrar')
    and exists (select 1 from venta v where v.id = venta_id and v.estado = 'borrador')
  )
  with check (
    app.es_miembro(negocio_id) and app.licencia_permite(negocio_id)
    -- No se le agregan renglones a una venta ya cobrada: cambiaria el total
    -- de un ticket que el cliente ya tiene en la mano.
    and exists (select 1 from venta v where v.id = venta_id and v.estado = 'borrador')
  );

drop policy if exists pago_leer on pago;
create policy pago_leer on pago
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists pago_crear on pago;
create policy pago_crear on pago
  for insert to authenticated
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'cobrar')
              and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- GASTOS
-- ---------------------------------------------------------------------
drop policy if exists gasto_leer on gasto;
create policy gasto_leer on gasto
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists gasto_crear on gasto;
create policy gasto_crear on gasto
  for insert to authenticated
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas')
              and app.licencia_permite(negocio_id));

drop policy if exists gasto_editar on gasto;
create policy gasto_editar on gasto
  for update to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'))
  with check (app.es_miembro(negocio_id) and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- CAJA — derivada, y por eso casi nadie la escribe
-- ---------------------------------------------------------------------
drop policy if exists caja_leer on movimiento_caja;
create policy caja_leer on movimiento_caja
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists caja_ajuste on movimiento_caja;
create policy caja_ajuste on movimiento_caja
  for insert to authenticated
  with check (
    app.es_miembro(negocio_id)
    and app.tiene_permiso(negocio_id, 'verFinanzas')
    and app.licencia_permite(negocio_id)
    -- LO UNICO que una persona puede meter a mano es un AJUSTE, y queda
    -- marcado como tal. Los movimientos de venta y de gasto los escriben las
    -- funciones, que es lo que garantiza que la caja siempre cuadre con la
    -- operacion que la produjo. Si se pudieran capturar ingresos sueltos, la
    -- caja dejaria de ser auditable el primer dia.
    and origen = 'ajuste'
    and referencia_id is null
  );

-- LA CAJA NO SE REESCRIBE NI SE BORRA. Ni el dueño, ni el servidor.
-- Revertir un movimiento es AGREGAR el contrario, nunca tachar el original.
-- Es la misma regla que la bitacora de la base, y por el mismo motivo: un
-- registro financiero que se puede editar no sirve para auditar nada.
revoke update, delete on movimiento_caja from authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- INSCRIPCIONES Y RECORDATORIOS
-- ---------------------------------------------------------------------
drop policy if exists inscripcion_leer on inscripcion;
create policy inscripcion_leer on inscripcion
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists inscripcion_escribir on inscripcion;
create policy inscripcion_escribir on inscripcion
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarCatalogo')
              and app.licencia_permite(negocio_id));

drop policy if exists recordatorio_leer on recordatorio;
create policy recordatorio_leer on recordatorio
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists recordatorio_escribir on recordatorio;
create policy recordatorio_escribir on recordatorio
  for all to authenticated
  using (app.es_miembro(negocio_id))
  with check (app.es_miembro(negocio_id) and app.licencia_permite(negocio_id));
