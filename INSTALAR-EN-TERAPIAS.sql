-- =====================================================================
--  NERON TERAPIAS — INSTALACION EN SUPABASE
--
--  QUE ES: las tablas propias del producto (pacientes, agenda, servicios,
--  cursos, inventario, ventas, caja, gastos, recordatorios), con sus reglas
--  de acceso por fila y las operaciones que la base de datos hace sola.
--
--  ANTES DE ESTE ARCHIVO hay que haber corrido, en el MISMO proyecto:
--      INSTALAR-EN-SUPABASE.sql   (el de la base @neron/base)
--  Sin el no existen `negocio`, `membresia` ni las funciones app.*, y esto
--  falla en la primera linea.
--
--  COMO SE USA:
--    1. Supabase → SQL Editor → New query
--    2. Se pega TODO este archivo y se corre
--    3. Se pega COMPROBAR-EN-TERAPIAS.sql y se corre: todo debe decir BIEN
--
--  Se puede volver a correr las veces que haga falta: no borra ni duplica
--  nada. Y no toca ninguna tabla de la base — solo le agrega a `membresia`
--  una llave candidata, que no le quita ni le cambia nada.
-- =====================================================================


-- =====================================================================
-- ESQUEMA DE NERON TERAPIAS

-- =====================================================================
-- ESQUEMA DE NERON TERAPIAS
--
-- Estas son las tablas PROPIAS DEL PRODUCTO. Las siete de la base
-- (negocio, estado, membresia, rol, licencia, auditoria, diario) ya estan
-- instaladas y no se tocan.
--
-- LA DECISION MAS IMPORTANTE DE ESTE ARCHIVO
-- ------------------------------------------
-- La base guarda el estado operativo en un bloque JSON (`estado.data`), que
-- es lo que Neron POS necesitaba: rapido, offline, un documento por negocio.
--
-- Terapias NO usa el bloque para sus entidades. Usa TABLAS DE VERDAD.
--
-- Por que: un consultorio necesita preguntar "¿cuales son los servicios mas
-- vendidos?", "¿que citas tiene Ana este mes?", "¿que productos estan por
-- acabarse?". Con un bloque JSON eso obliga a bajar TODO y contar en el
-- navegador — y a los dos años de expedientes, el tablero tarda diez
-- segundos en abrir. Con tablas, la base responde en milisegundos y ademas
-- garantiza que una cita no pueda apuntar a un cliente que no existe.
--
-- Y la razon de fondo, la que pidio el arquitecto: UNA SOLA FUENTE DE VERDAD
-- POR ENTIDAD. En un bloque JSON, nada impide guardar el nombre del cliente
-- dentro de la cita "para no tener que buscarlo". El dia que ese cliente se
-- cambia el apellido, la agenda sigue mostrando el viejo. Con una llave
-- foranea eso es imposible por construccion.
--
-- El bloque `estado.data` sigue sirviendo para la configuracion del negocio
-- —horarios, moneda, colores— que es poca y se lee entera.
--
-- REGLAS DE LA CASA QUE SE APLICAN AQUI
-- -------------------------------------
--   · El dinero SIEMPRE es un entero de centavos. Nunca decimal.
--   · Nada se borra: `eliminado boolean`. Un expediente medico borrado es
--     un problema legal, no un renglon menos.
--   · Toda tabla lleva `negocio_id` — es la columna sobre la que muerden
--     las reglas de acceso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CLIENTES — los pacientes del centro
-- ---------------------------------------------------------------------
create table if not exists cliente (
  id                uuid primary key default gen_random_uuid(),
  negocio_id        text not null references negocio(id) on delete cascade,
  nombre            text not null,
  telefono          text,
  correo            text,
  fecha_nacimiento  date,
  notas             text,
  -- Cuando entro al centro. Sirve para "clientes nuevos este mes".
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  eliminado         boolean not null default false
);

comment on table cliente is
  'LA FUENTE DE VERDAD de una persona. Ninguna otra tabla guarda su nombre: lo referencian por id. '
  'Asi, cambiar un apellido se refleja en agenda, ventas y reportes sin tocar nada mas.';

-- LA LLAVE QUE CIERRA EL AGUJERO ENTRE CENTROS. Ver el comentario grande
-- de mas abajo, en la tabla `cita`.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cliente_negocio_id_unico') then
    alter table cliente add constraint cliente_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

create index if not exists cliente_negocio_idx on cliente (negocio_id) where not eliminado;
-- El buscador global escribe letra por letra: sin este indice, cada tecla
-- recorre la tabla entera.
create index if not exists cliente_nombre_idx on cliente (negocio_id, lower(nombre));

-- ---------------------------------------------------------------------
-- SERVICIOS — el catalogo: Reiki, Biomagnetismo, Limpieza Energetica...
-- ---------------------------------------------------------------------
create table if not exists servicio (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      text not null references negocio(id) on delete cascade,
  nombre          text not null,
  descripcion     text,
  -- Cuanto dura, en minutos. La agenda lo usa para calcular la hora de fin
  -- sola, en vez de dejar que cada quien la escriba mal.
  duracion_min    int not null default 60 check (duracion_min > 0),
  precio_centavos bigint not null default 0 check (precio_centavos >= 0),
  activo          boolean not null default true,
  eliminado       boolean not null default false,
  creado_en       timestamptz not null default now()
);

comment on column servicio.precio_centavos is
  'Centavos ENTEROS. Un peso son 100. El decimal solo aparece al pintar en pantalla.';
comment on column servicio.activo is
  'Un servicio que ya no se ofrece se APAGA, no se borra: las citas y ventas viejas lo siguen '
  'necesitando para que los reportes historicos cuadren.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'servicio_negocio_id_unico') then
    alter table servicio add constraint servicio_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

create index if not exists servicio_negocio_idx on servicio (negocio_id) where not eliminado;

-- ---------------------------------------------------------------------
-- CURSOS — los talleres con fecha, cupo y precio
-- ---------------------------------------------------------------------
create table if not exists curso (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      text not null references negocio(id) on delete cascade,
  nombre          text not null,
  descripcion     text,
  fecha_inicio    date not null,
  fecha_fin       date,
  cupo            int check (cupo is null or cupo > 0),
  precio_centavos bigint not null default 0 check (precio_centavos >= 0),
  estado          text not null default 'programado'
                  check (estado in ('programado', 'en_curso', 'terminado', 'cancelado')),
  eliminado       boolean not null default false,
  creado_en       timestamptz not null default now()
);

comment on column curso.cupo is
  'Lugares totales. NULL es sin limite. Los disponibles NO se guardan aqui: se cuentan desde '
  'inscripcion. Un contador guardado a mano se desincroniza a la primera cancelacion.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'curso_negocio_id_unico') then
    alter table curso add constraint curso_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

create index if not exists curso_negocio_fecha_idx on curso (negocio_id, fecha_inicio) where not eliminado;

-- ---------------------------------------------------------------------
-- PRODUCTOS — aceites, inciensos, velas
-- ---------------------------------------------------------------------
create table if not exists producto (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      text not null references negocio(id) on delete cascade,
  nombre          text not null,
  descripcion     text,
  precio_centavos bigint not null default 0 check (precio_centavos >= 0),
  costo_centavos  bigint not null default 0 check (costo_centavos >= 0),
  stock_actual    int not null default 0,
  -- El umbral de "ya casi se acaba". Cada producto tiene el suyo: tres velas
  -- puede ser mucho y tres aceites poco.
  stock_minimo    int not null default 0 check (stock_minimo >= 0),
  imagen_url      text,
  activo          boolean not null default true,
  eliminado       boolean not null default false,
  creado_en       timestamptz not null default now()
);

comment on column producto.stock_actual is
  'Lo escribe la funcion de cobro, no el navegador. Puede quedar en negativo si alguien vende '
  'sin haber registrado una entrada: se prefiere un numero incomodo y visible a uno bonito y falso.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'producto_negocio_id_unico') then
    alter table producto add constraint producto_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

create index if not exists producto_negocio_idx on producto (negocio_id) where not eliminado;
-- El indice de "productos bajos" del tablero: se resuelve sin recorrer todo.
create index if not exists producto_stock_bajo_idx on producto (negocio_id)
  where not eliminado and activo and stock_actual <= stock_minimo;

-- ---------------------------------------------------------------------
-- CITAS — la agenda
-- ---------------------------------------------------------------------
create table if not exists cita (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  -- REFERENCIAS, no copias del nombre. Es la regla que pidio el arquitecto.
  -- Las llaves foraneas van MAS ABAJO y son COMPUESTAS, a proposito.
  cliente_id     uuid not null,
  servicio_id    uuid not null,
  -- Quien la atiende. Es una membresia del negocio, no una tabla aparte:
  -- en un centro chico las terapeutas son las mismas que usan el sistema.
  -- NULL cuando el centro es de una sola persona y no hace falta decirlo.
  profesional_id uuid,
  fecha          date not null,
  hora_inicio    time not null,
  hora_fin       time not null,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio')),
  notas          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado      boolean not null default false,
  -- Una cita que termina antes de empezar es un error de captura, no un dato.
  constraint cita_horas_coherentes check (hora_fin > hora_inicio)
);

comment on column cita.estado is
  'Los CINCO estados del sistema, iguales en toda la aplicacion: pendiente (falta confirmar), '
  'confirmada, completada (ya se dio), cancelada, no_asistio. "no_asistio" existe separado de '
  '"cancelada" porque no es lo mismo para el negocio: una se puede reagendar, la otra ya costo.';

comment on column cita.cliente_id is
  'on delete RESTRICT a proposito: la base impide borrar un cliente que tiene historial. Se '
  'marca como eliminado, y su historial sigue intacto.';

/**
 * EL AGUJERO QUE ENCONTRARON LOS ATAQUES, Y COMO SE CIERRA.
 *
 * La primera version decia `cliente_id uuid references cliente(id)`. Parece
 * suficiente y no lo es: LAS LLAVES FORANEAS NO OBEDECEN LAS REGLAS DE FILA.
 * Comprueban que el renglon exista, nada mas — y existen los renglones de
 * todos los centros.
 *
 * Con eso, la dueña del Centro Holistico podia crear en SU agenda una cita
 * apuntando al paciente de OTRO centro. Su regla de lectura de citas la deja
 * ver esa cita, porque es suya; y al resolver el nombre del paciente para
 * pintarla, se le entregaba el nombre de un paciente ajeno. Fuga entre
 * clientes del sistema, con las reglas puestas y funcionando.
 *
 * La solucion no es un disparador ni una politica mas: es una LLAVE FORANEA
 * COMPUESTA. Al referenciar (negocio_id, cliente_id) contra la llave
 * candidata (negocio_id, id) de cliente, la base garantiza por construccion
 * que el paciente es del mismo centro que la cita. No hay forma de escribir
 * la fila mala; ni siquiera desde el servidor.
 *
 * Lo encontraron dos ataques que estaban escritos antes que el codigo.
 */
alter table cita drop constraint if exists cita_cliente_mismo_negocio;
alter table cita add constraint cita_cliente_mismo_negocio
  foreign key (negocio_id, cliente_id) references cliente (negocio_id, id) on delete restrict;

alter table cita drop constraint if exists cita_servicio_mismo_negocio;
alter table cita add constraint cita_servicio_mismo_negocio
  foreign key (negocio_id, servicio_id) references servicio (negocio_id, id) on delete restrict;

/**
 * La terapeuta que atiende tambien tiene que ser de este centro.
 *
 * `membresia` es de la BASE, no del producto. Esto le agrega una llave
 * candidata —nada mas, no le quita ni le cambia nada— para poder apuntarle
 * de la misma forma compuesta. Es el unico toque del producto a una tabla de
 * la base, y es aditivo.
 */
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'membresia_negocio_id_unico') then
    alter table membresia add constraint membresia_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

alter table cita drop constraint if exists cita_profesional_mismo_negocio;
alter table cita add constraint cita_profesional_mismo_negocio
  foreign key (negocio_id, profesional_id) references membresia (negocio_id, id)
  -- `set null (columna)` y NO `set null` a secas. La llave es COMPUESTA: un
  -- `set null` pelon vacia las DOS columnas, y `negocio_id` no acepta nulos —
  -- asi que el borrado revienta y la fila de la izquierda no se puede borrar
  -- nunca. Se nombra la columna que si se debe vaciar.
  on delete set null (profesional_id);

-- El indice que sostiene "Citas hoy" y "Agenda de hoy" del tablero.
create index if not exists cita_negocio_fecha_idx on cita (negocio_id, fecha, hora_inicio)
  where not eliminado;
create index if not exists cita_cliente_idx on cita (cliente_id) where not eliminado;

-- ---------------------------------------------------------------------
-- VENTAS — la transaccion
-- ---------------------------------------------------------------------
create table if not exists venta (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  folio          text not null,
  -- NULL = venta de mostrador, sin cliente identificado. Pasa todos los dias
  -- y obligar a capturar un cliente solo produce clientes basura.
  cliente_id     uuid,
  fecha          date not null default current_date,
  total_centavos bigint not null default 0 check (total_centavos >= 0),
  estado         text not null default 'borrador'
                 check (estado in ('borrador', 'cobrada', 'cancelada')),
  creada_por     uuid,
  creado_en      timestamptz not null default now(),
  cobrada_en     timestamptz,
  cancelada_en   timestamptz,
  eliminado      boolean not null default false,
  unique (negocio_id, folio)
);

comment on column venta.estado is
  'SOLO las "cobrada" cuentan para ingresos. Una en borrador es un carrito a medias y una '
  'cancelada ya se revirtio: si contaran, el tablero mentiria hacia arriba todos los dias.';
comment on column venta.total_centavos is
  'Lo calcula la base al cobrar, sumando los renglones. No se acepta el total que mande el '
  'navegador: seria confiar en el cliente para una cifra de dinero.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'venta_negocio_id_unico') then
    alter table venta add constraint venta_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

-- Misma regla que en cita: el cliente de una venta es del mismo centro.
alter table venta drop constraint if exists venta_cliente_mismo_negocio;
alter table venta add constraint venta_cliente_mismo_negocio
  foreign key (negocio_id, cliente_id) references cliente (negocio_id, id) on delete restrict;

create index if not exists venta_negocio_fecha_idx on venta (negocio_id, fecha)
  where not eliminado and estado = 'cobrada';

-- ---------------------------------------------------------------------
-- RENGLONES DE VENTA — que se vendio exactamente
-- ---------------------------------------------------------------------
create table if not exists venta_item (
  id                      uuid primary key default gen_random_uuid(),
  negocio_id              text not null references negocio(id) on delete cascade,
  venta_id                uuid not null,
  tipo                    text not null check (tipo in ('producto', 'servicio', 'curso')),
  producto_id             uuid,
  servicio_id             uuid,
  curso_id                uuid,
  -- Se guarda tambien el nombre TAL COMO ESTABA AL VENDER. Esto NO contradice
  -- la regla de no copiar nombres: es un dato historico distinto del actual.
  -- Si el precio de Reiki sube el año que viene, el ticket del año pasado
  -- tiene que seguir diciendo lo que se cobro ese dia.
  descripcion             text not null,
  cantidad                numeric(12, 3) not null check (cantidad > 0),
  precio_unitario_centavos bigint not null check (precio_unitario_centavos >= 0),
  subtotal_centavos       bigint not null check (subtotal_centavos >= 0),
  -- Exactamente una referencia, la que corresponde a su tipo. Sin esto se
  -- podria guardar un renglon de tipo producto apuntando a un curso.
  constraint venta_item_una_referencia check (
    (tipo = 'producto' and producto_id is not null and servicio_id is null and curso_id is null) or
    (tipo = 'servicio' and servicio_id is not null and producto_id is null and curso_id is null) or
    (tipo = 'curso'    and curso_id    is not null and producto_id is null and servicio_id is null)
  )
);

comment on table venta_item is
  'De aqui salen "servicios mas vendidos" y "productos mas vendidos" del tablero. NO hay ningun '
  'contador guardado a mano en servicio ni en producto: se cuenta desde las ventas reales, que '
  'es lo unico que no puede desincronizarse.';

-- Las cuatro referencias, todas compuestas: ni la venta, ni el producto, ni
-- el servicio, ni el curso pueden ser de otro centro.
alter table venta_item drop constraint if exists venta_item_venta_mismo_negocio;
alter table venta_item add constraint venta_item_venta_mismo_negocio
  foreign key (negocio_id, venta_id) references venta (negocio_id, id) on delete cascade;
alter table venta_item drop constraint if exists venta_item_producto_mismo_negocio;
alter table venta_item add constraint venta_item_producto_mismo_negocio
  foreign key (negocio_id, producto_id) references producto (negocio_id, id) on delete restrict;
alter table venta_item drop constraint if exists venta_item_servicio_mismo_negocio;
alter table venta_item add constraint venta_item_servicio_mismo_negocio
  foreign key (negocio_id, servicio_id) references servicio (negocio_id, id) on delete restrict;
alter table venta_item drop constraint if exists venta_item_curso_mismo_negocio;
alter table venta_item add constraint venta_item_curso_mismo_negocio
  foreign key (negocio_id, curso_id) references curso (negocio_id, id) on delete restrict;

create index if not exists venta_item_venta_idx on venta_item (venta_id);
create index if not exists venta_item_producto_idx on venta_item (negocio_id, producto_id) where tipo = 'producto';
create index if not exists venta_item_servicio_idx on venta_item (negocio_id, servicio_id) where tipo = 'servicio';

-- ---------------------------------------------------------------------
-- PAGOS — con que se pago una venta
-- ---------------------------------------------------------------------
create table if not exists pago (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  venta_id       uuid not null,
  metodo         text not null check (metodo in ('efectivo', 'tarjeta', 'transferencia', 'otro')),
  monto_centavos bigint not null check (monto_centavos > 0),
  fecha          date not null default current_date,
  creado_en      timestamptz not null default now()
);

comment on table pago is
  'Separado de venta porque una venta se puede pagar en partes o con dos metodos —mitad efectivo, '
  'mitad tarjeta— y eso pasa todos los dias en un mostrador.';

alter table pago drop constraint if exists pago_venta_mismo_negocio;
alter table pago add constraint pago_venta_mismo_negocio
  foreign key (negocio_id, venta_id) references venta (negocio_id, id) on delete cascade;

create index if not exists pago_venta_idx on pago (venta_id);

-- ---------------------------------------------------------------------
-- GASTOS — lo que sale
-- ---------------------------------------------------------------------
create table if not exists gasto (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  categoria      text not null default 'general',
  descripcion    text not null,
  monto_centavos bigint not null check (monto_centavos > 0),
  fecha          date not null default current_date,
  creado_por     uuid,
  creado_en      timestamptz not null default now(),
  eliminado      boolean not null default false
);

create index if not exists gasto_negocio_fecha_idx on gasto (negocio_id, fecha) where not eliminado;

-- ---------------------------------------------------------------------
-- MOVIMIENTOS DE CAJA — el dinero que entra y sale
-- ---------------------------------------------------------------------
create table if not exists movimiento_caja (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  tipo           text not null check (tipo in ('ingreso', 'egreso')),
  -- DE DONDE VIENE. Esto es lo que hace auditable la caja: cada movimiento
  -- sabe que operacion lo produjo.
  --
  -- `pago` se agrego con Ventas: un PAGO MIXTO son dos pagos de la misma
  -- venta, y con el movimiento colgado de la venta el indice unico solo dejaba
  -- entrar el primero. Colgado del pago, cada uno tiene el suyo y el indice
  -- sigue impidiendo meter el mismo dinero dos veces.
  origen         text not null check (origen in ('venta', 'gasto', 'ajuste', 'pago')),
  referencia_id  uuid,
  monto_centavos bigint not null check (monto_centavos > 0),
  descripcion    text not null,
  fecha          date not null default current_date,
  creado_por     uuid,
  creado_en      timestamptz not null default now()
);

comment on table movimiento_caja is
  'DERIVADA, no fuente de verdad. Cada renglon nace de una venta cobrada, un gasto registrado o '
  'un ajuste manual, y guarda cual. Nunca se captura un ingreso "suelto" sin operacion detras: '
  'asi la caja siempre cuadra con ventas y gastos, y se puede auditar de donde sale cada peso.';

/**
 * LA CAJA ES UN LIBRO: SE ESCRIBE, NO SE CORRIGE.
 *
 * No hay columna "revertido" ni forma de editar un renglon. Cancelar una
 * venta no tacha su ingreso: AGREGA el egreso contrario. El saldo sale de
 * sumar ingresos y restar egresos, y se netea solo.
 *
 * Por eso el indice unico incluye el tipo: una venta puede tener su ingreso
 * (al cobrar) y su egreso (al cancelar), pero jamas dos ingresos. Es lo que
 * hace que dos clics en "Cobrar" no metan el dinero dos veces.
 */
-- En una base que ya existia, la restriccion se amplia sin tocar una sola fila.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'movimiento_caja_origen_check') then
    alter table movimiento_caja drop constraint movimiento_caja_origen_check;
  end if;
  alter table movimiento_caja add constraint movimiento_caja_origen_check
    check (origen in ('venta', 'gasto', 'ajuste', 'pago'));
end $$;

create unique index if not exists movimiento_caja_unico_por_origen
  on movimiento_caja (negocio_id, origen, referencia_id, tipo)
  where referencia_id is not null;

create index if not exists movimiento_caja_fecha_idx on movimiento_caja (negocio_id, fecha);

-- ---------------------------------------------------------------------
-- INSCRIPCIONES A CURSOS
-- ---------------------------------------------------------------------
create table if not exists inscripcion (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  text not null references negocio(id) on delete cascade,
  curso_id    uuid not null,
  cliente_id  uuid not null,
  -- La venta que la pago, si se cobro. NULL = apartado sin pagar.
  venta_id    uuid,
  estado      text not null default 'inscrito'
              check (estado in ('inscrito', 'asistio', 'cancelado')),
  creado_en   timestamptz not null default now(),
  -- Nadie se inscribe dos veces al mismo curso.
  unique (curso_id, cliente_id)
);

alter table inscripcion drop constraint if exists inscripcion_curso_mismo_negocio;
alter table inscripcion add constraint inscripcion_curso_mismo_negocio
  foreign key (negocio_id, curso_id) references curso (negocio_id, id) on delete cascade;
alter table inscripcion drop constraint if exists inscripcion_cliente_mismo_negocio;
alter table inscripcion add constraint inscripcion_cliente_mismo_negocio
  foreign key (negocio_id, cliente_id) references cliente (negocio_id, id) on delete restrict;
alter table inscripcion drop constraint if exists inscripcion_venta_mismo_negocio;
alter table inscripcion add constraint inscripcion_venta_mismo_negocio
  foreign key (negocio_id, venta_id) references venta (negocio_id, id)
  -- `set null (columna)` y NO `set null` a secas. La llave es COMPUESTA: un
  -- `set null` pelon vacia las DOS columnas, y `negocio_id` no acepta nulos —
  -- asi que el borrado revienta y la fila de la izquierda no se puede borrar
  -- nunca. Se nombra la columna que si se debe vaciar.
  on delete set null (venta_id);

create index if not exists inscripcion_curso_idx on inscripcion (curso_id);

-- ---------------------------------------------------------------------
-- RECORDATORIOS — lo pendiente
-- ---------------------------------------------------------------------
create table if not exists recordatorio (
  id            uuid primary key default gen_random_uuid(),
  negocio_id    text not null references negocio(id) on delete cascade,
  titulo        text not null,
  detalle       text,
  fecha         date not null,
  prioridad     text not null default 'normal' check (prioridad in ('baja', 'normal', 'alta')),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'hecho', 'descartado')),
  -- DE DONDE SALIO. Un recordatorio que solo dice "Recordar cita de Ana" es
  -- texto muerto: no se puede abrir la cita, ni saber si ya se cancelo, ni
  -- cerrarlo solo cuando la cita se atienda.
  entidad_tipo  text check (entidad_tipo in ('cliente', 'cita', 'venta', 'curso', 'producto')),
  entidad_id    uuid,
  creado_por    uuid,
  creado_en     timestamptz not null default now(),
  eliminado     boolean not null default false
);

create index if not exists recordatorio_pendiente_idx on recordatorio (negocio_id, fecha)
  where not eliminado and estado = 'pendiente';

-- =====================================================================
-- LA PREVENCION DE CHOQUES EN LA AGENDA
--
-- ESTO NO SE PUEDE HACER EN EL NAVEGADOR, y es el punto entero.
--
-- La forma obvia es: antes de guardar, buscar si hay otra cita encimada; si
-- no hay, guardar. Se llama "comprobar y luego actuar" y tiene una ventana
-- entre las dos: si la recepcionista y la terapeuta guardan al mismo tiempo,
-- las dos consultas ven el horario libre, las dos guardan, y el paciente
-- llega a una sala ocupada. Es una condicion de carrera clasica y ocurre de
-- verdad — no hace falta mala suerte, basta con dos personas trabajando.
--
-- La solucion es una RESTRICCION DE EXCLUSION: la base de datos se niega a
-- guardar dos renglones cuyos rangos de tiempo se toquen, para el mismo
-- profesional. Es atomica: no hay ventana. La segunda transaccion falla,
-- pase lo que pase, aunque lleguen en el mismo milisegundo.
-- =====================================================================

-- Hace falta para poder mezclar comparaciones de igualdad con rangos.
create extension if not exists btree_gist;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cita_sin_choque') then
    alter table cita add constraint cita_sin_choque
      exclude using gist (
        negocio_id with =,
        /**
         * SIN PROFESIONAL ASIGNADO, SE ASUME QUE ES LA MISMA PERSONA.
         *
         * Con NULL a secas, la comparacion de igualdad nunca se cumple y dos
         * citas sin terapeuta jamas chocarian: un centro de una sola persona
         * podria agendar tres pacientes a las 10:00 sin que nada lo impida.
         *
         * Se cambia el NULL por un valor fijo para que todas las citas sin
         * asignar caigan en la misma agenda. Si el centro tiene varias
         * terapeutas y quiere citas en paralelo, las asigna — que ademas es
         * lo que uno quiere que haga.
         */
        coalesce(profesional_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
        tsrange(fecha + hora_inicio, fecha + hora_fin) with &&
      )
      /**
       * Lo cancelado y lo que no asistio LIBERAN el horario.
       *
       * Es lo que uno espera: si se cancela la cita de las 10:00, esa hora
       * vuelve a estar disponible de inmediato. Y la cita cancelada se queda
       * en la tabla para el historial, sin estorbar.
       */
      where (not eliminado and estado in ('pendiente', 'confirmada', 'completada'));
  end if;
end $$;

comment on constraint cita_sin_choque on cita is
  'Impide dos citas encimadas para el mismo profesional. Es una restriccion de la base y no una '
  'comprobacion previa: por eso aguanta que dos personas guarden al mismo tiempo.';


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

-- El visitante sin sesion no ve absolutamente nada del producto.
revoke all on cliente, servicio, curso, producto, cita, venta, venta_item,
              pago, gasto, movimiento_caja, inscripcion, recordatorio
  from anon;

grant select, insert, update, delete on cliente, servicio, curso, producto, cita,
              venta, venta_item, pago, gasto, inscripcion, recordatorio
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


-- =====================================================================
-- LAS OPERACIONES QUE NO SE PUEDEN HACER DESDE EL NAVEGADOR
--
-- Cobrar una venta no es "cambiar un campo a cobrada". Es, en un solo acto
-- indivisible:
--
--   1. sumar el total desde los renglones,
--   2. bajar el inventario de cada producto,
--   3. meter el ingreso a la caja,
--   4. marcar la venta.
--
-- Si eso vive en el navegador, cualquier interrupcion —se cae la red a la
-- mitad, cierran la pestaña, se va la luz— deja el sistema partido: venta
-- cobrada sin bajar stock, o stock bajado sin ingreso en caja. Y nadie se da
-- cuenta hasta que el inventario no cuadra tres meses despues.
--
-- Aqui es una transaccion de la base de datos: pasa entera o no pasa.
--
-- Ademas son `security definer`, lo que las hace la UNICA puerta por la que
-- se puede tocar la caja. Las reglas del archivo anterior le cierran esa
-- puerta a todos los demas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- COBRAR UNA VENTA
-- ---------------------------------------------------------------------
create or replace function public.cobrar_venta(p_venta uuid)
returns venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta    venta;
  v_total    bigint;
  v_item     record;
  v_stock    int;
begin
  select * into v_venta from venta where id = p_venta and not eliminado;
  if v_venta.id is null then
    raise exception 'La venta no existe.' using errcode = 'no_data_found';
  end if;

  -- LOS TRES PORTEROS, en la base y no en la pantalla. Un `security definer`
  -- se salta las reglas de fila, asi que si no se pregunta aqui, cualquiera
  -- con sesion podria cobrar ventas de otro negocio llamando a esta funcion.
  if not app.es_miembro(v_venta.negocio_id) then
    raise exception 'Esta venta no es de tu negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_venta.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso para cobrar.' using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(v_venta.negocio_id) then
    raise exception 'La licencia no permite registrar operaciones.' using errcode = 'insufficient_privilege';
  end if;

  if v_venta.estado <> 'borrador' then
    -- Mensaje claro a proposito: "ya estaba cobrada" es una situacion
    -- normal (doble clic, dos pestañas), no una falla del sistema.
    raise exception 'Esta venta ya no esta en borrador: esta %.', v_venta.estado
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL TOTAL SE CALCULA, NO SE RECIBE. Aceptar el total que manda el
  -- navegador es dejar que el cliente decida cuanto pago.
  select coalesce(sum(subtotal_centavos), 0) into v_total
  from venta_item where venta_id = p_venta;

  if v_total <= 0 then
    raise exception 'No se puede cobrar una venta sin renglones.' using errcode = 'invalid_parameter_value';
  end if;

  -- Baja de inventario, renglon por renglon.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    -- `for update` bloquea el renglon del producto hasta que termine la
    -- transaccion. Sin esto, dos cajas vendiendo la ultima pieza al mismo
    -- tiempo leen "1 disponible" las dos y dejan el stock en -1.
    select stock_actual into v_stock
    from producto where id = v_item.producto_id for update;

    update producto
       set stock_actual = stock_actual - v_item.cantidad
     where id = v_item.producto_id;
  end loop;

  -- El ingreso a caja, con la referencia a la venta que lo produjo. El
  -- indice unico de movimiento_caja hace imposible meterlo dos veces.
  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos, descripcion, fecha, creado_por)
  values (v_venta.negocio_id, 'ingreso', 'venta', v_venta.id, v_total,
          'Venta ' || v_venta.folio, v_venta.fecha, auth.uid());

  update venta
     set estado = 'cobrada', total_centavos = v_total, cobrada_en = now()
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

comment on function public.cobrar_venta(uuid) is
  'La UNICA forma de cobrar. Calcula el total, baja inventario con bloqueo de renglon, mete el '
  'ingreso a caja y marca la venta — todo en una transaccion. O pasa completo, o no pasa nada.';

-- ---------------------------------------------------------------------
-- CANCELAR UNA VENTA YA COBRADA
-- ---------------------------------------------------------------------
create or replace function public.cancelar_venta(p_venta uuid, p_motivo text default null)
returns venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta venta;
  v_item  record;
begin
  select * into v_venta from venta where id = p_venta and not eliminado;
  if v_venta.id is null then
    raise exception 'La venta no existe.' using errcode = 'no_data_found';
  end if;

  if not app.es_miembro(v_venta.negocio_id) then
    raise exception 'Esta venta no es de tu negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_venta.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso para cancelar ventas.' using errcode = 'insufficient_privilege';
  end if;

  if v_venta.estado <> 'cobrada' then
    raise exception 'Solo se puede cancelar una venta cobrada; esta esta %.', v_venta.estado
      using errcode = 'invalid_parameter_value';
  end if;

  -- El inventario regresa.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    perform 1 from producto where id = v_item.producto_id for update;
    update producto set stock_actual = stock_actual + v_item.cantidad where id = v_item.producto_id;
  end loop;

  -- Y la caja NO se corrige: se le agrega el movimiento contrario. El
  -- ingreso original se queda ahi para siempre, porque de verdad ocurrio.
  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos, descripcion, fecha, creado_por)
  values (v_venta.negocio_id, 'egreso', 'venta', v_venta.id, v_venta.total_centavos,
          'Cancelacion de venta ' || v_venta.folio || coalesce(' — ' || p_motivo, ''),
          current_date, auth.uid());

  update venta set estado = 'cancelada', cancelada_en = now()
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

-- ---------------------------------------------------------------------
-- GASTOS → CAJA, automatico
-- ---------------------------------------------------------------------
--
-- Es un disparador y no una funcion que haya que acordarse de llamar: asi el
-- gasto y su movimiento de caja no pueden separarse nunca, ni por un descuido
-- ni por otra pantalla que inserte directo.
--
create or replace function app.gasto_a_caja()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_efectivo bigint;
  v_resto    bigint;
  v_sesion   uuid;
begin
  -- El `coalesce` es por los gastos capturados antes de que existiera la
  -- columna: darlos por efectivo es lo conservador — ese dinero salio del
  -- cajon.
  v_efectivo := coalesce(new.efectivo_centavos,
                         case when coalesce(new.metodo, 'efectivo') = 'efectivo'
                              then new.monto_centavos else 0 end);
  v_resto := new.monto_centavos - v_efectivo;
  v_sesion := app.caja_abierta(new.negocio_id);

  if tg_op = 'INSERT' then
    /*
     * DOS RENGLONES COMO MUCHO, y cada uno con SU forma de pago.
     *
     * El de efectivo es el unico que baja el cajon. El del resto existe igual
     * —aunque sea de tarjeta— porque es un EGRESO DEL NEGOCIO: sin el, la
     * renta pagada por transferencia desapareceria del total de egresos y el
     * dueño veria que gasto menos de lo que gasto.
     */
    if v_efectivo > 0 then
      -- SOLO EL EFECTIVO EXIGE CAJA ABIERTA. La transferencia no toca el
      -- cajon, asi que pedirla seria bloquear por nada.
      if v_sesion is null then
        raise exception 'No hay una caja abierta: no se puede pagar en efectivo. Abre la caja en el modulo Caja.'
          using errcode = 'invalid_parameter_value';
      end if;
      insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                   descripcion, fecha, metodo, sesion_id, creado_por)
      values (new.negocio_id, 'egreso', 'gasto', new.id, v_efectivo, new.descripcion,
              new.fecha, 'efectivo', v_sesion, new.creado_por);
    end if;

    if v_resto > 0 then
      insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                   descripcion, fecha, metodo, sesion_id, creado_por)
      values (new.negocio_id, 'egreso', 'gasto', new.id, v_resto, new.descripcion,
              new.fecha,
              case when new.metodo = 'mixto' then coalesce(new.metodo_resto, 'tarjeta')
                   else new.metodo end,
              v_sesion, new.creado_por);
    end if;
    return new;
  end if;

  -- Un gasto capturado por error se marca como eliminado; la caja recibe el
  -- ingreso contrario, por la MISMA via y partido igual. Nada se tacha.
  if tg_op = 'UPDATE' and new.eliminado and not old.eliminado then
    v_efectivo := coalesce(old.efectivo_centavos,
                           case when coalesce(old.metodo, 'efectivo') = 'efectivo'
                                then old.monto_centavos else 0 end);
    v_resto := old.monto_centavos - v_efectivo;

    if v_efectivo > 0 then
      insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                   descripcion, fecha, metodo, sesion_id, creado_por)
      values (new.negocio_id, 'ingreso', 'gasto', new.id, v_efectivo,
              'Se anulo el gasto: ' || old.descripcion, current_date,
              'efectivo', v_sesion, auth.uid());
    end if;
    if v_resto > 0 then
      insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                   descripcion, fecha, metodo, sesion_id, creado_por)
      values (new.negocio_id, 'ingreso', 'gasto', new.id, v_resto,
              'Se anulo el gasto: ' || old.descripcion, current_date,
              case when old.metodo = 'mixto' then coalesce(old.metodo_resto, 'tarjeta')
                   else old.metodo end,
              v_sesion, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists gasto_a_caja_insert on gasto;
create trigger gasto_a_caja_insert
  after insert on gasto
  for each row execute function app.gasto_a_caja();

drop trigger if exists gasto_a_caja_update on gasto;
create trigger gasto_a_caja_update
  after update on gasto
  for each row execute function app.gasto_a_caja();

-- ---------------------------------------------------------------------
-- LA HORA DE FIN DE UNA CITA SE CALCULA
-- ---------------------------------------------------------------------
--
-- Si la escribe la persona, tarde o temprano hay una cita de Reiki de 60
-- minutos que termina 20 minutos despues de empezar, y la agenda del dia
-- deja de cuadrar.
--
create or replace function app.cita_hora_fin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duracion int;
begin
  if new.hora_fin is null or new.hora_fin <= new.hora_inicio then
    select duracion_min into v_duracion from servicio where id = new.servicio_id;
    new.hora_fin := new.hora_inicio + make_interval(mins => coalesce(v_duracion, 60));
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists cita_hora_fin_trigger on cita;
create trigger cita_hora_fin_trigger
  before insert or update on cita
  for each row execute function app.cita_hora_fin();

-- ---------------------------------------------------------------------
-- EL FOLIO DE VENTA — la serie que no recicla
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- EL FOLIO — un contador de verdad, no un `max() + 1`
-- ---------------------------------------------------------------------
--
-- LO QUE ESTABA MAL Y LO ENCONTRO UN ATAQUE: la version anterior hacia
-- `select max(folio) + 1`. Dos cajas cobrando al mismo tiempo leen el mismo
-- maximo, calculan el mismo folio, y la segunda revienta contra el indice
-- unico — con un mensaje de base de datos que no le dice nada a quien esta
-- cobrando. Peor: si el indice no existiera, habria dos ventas con el mismo
-- folio y ningun corte volveria a cuadrar.
--
-- Ahora hay un contador por centro. El `on conflict do update ... returning`
-- es atomico: toma el candado del renglon, suma uno y devuelve el nuevo valor.
-- Dos llamadas simultaneas se forman y salen con numeros distintos.
--
create table if not exists contador_de_folio (
  negocio_id text not null references negocio(id) on delete cascade,
  ambito     text not null,
  ultimo     int not null default 0,
  primary key (negocio_id, ambito)
);

alter table contador_de_folio enable row level security;
alter table contador_de_folio force row level security;
revoke all on contador_de_folio from anon;
-- Nadie lo toca directamente: solo la funcion, que va como `security definer`.
revoke all on contador_de_folio from authenticated;

create or replace function public.siguiente_folio(p_negocio text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  -- La primera vez se arranca desde el mayor que EXISTA O HAYA EXISTIDO, para
  -- no reciclar folios de un centro que ya venia trabajando. Como nada se
  -- borra de verdad, un folio nunca se repite aunque se cancele la venta.
  insert into contador_de_folio (negocio_id, ambito, ultimo)
  values (p_negocio, 'venta',
          coalesce((select max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int)
                    from venta where negocio_id = p_negocio), 0) + 1)
  on conflict (negocio_id, ambito) do update
     set ultimo = contador_de_folio.ultimo + 1
  returning ultimo into v_n;

  return 'V-' || lpad(v_n::text, 5, '0');
end;
$$;

comment on function public.siguiente_folio is
  'Contador con candado, no `max() + 1`: dos cajas cobrando a la vez leen el mismo maximo y '
  'calculan el mismo folio. Aqui se forman y salen con numeros distintos.';

-- ---------------------------------------------------------------------
-- EL RESUMEN DE INICIO — una sola consulta para todo el tablero
-- ---------------------------------------------------------------------
--
-- Inicio necesita once cifras de nueve tablas. Con una consulta por tarjeta
-- serian once viajes al servidor cada vez que se abre la pantalla; con esto
-- es uno.
--
-- ES `security invoker` A PROPOSITO — lo contrario de las de arriba. Corre
-- con los permisos de quien llama, asi que las reglas de fila se aplican
-- normalmente: si la recepcionista no puede ver finanzas, las ventas le
-- llegan en cero porque LA BASE NO SE LAS DA, no porque la pantalla se las
-- esconda. Es la diferencia entre un permiso y un adorno.
--
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
    'recordatoriosPendientes', (
      select count(*) from recordatorio
      where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha <= p_hoy
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

comment on function public.resumen_inicio(text, date) is
  'Todo el tablero en un viaje. security INVOKER a proposito: las reglas de fila se aplican al '
  'que llama, asi que quien no puede ver finanzas recibe ceros de la base, no de la pantalla.';

-- =====================================================================
-- EL CATALOGO — categorias, servicios y cursos
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

-- ---------------------------------------------------------------------
-- SERVICIOS — lo que el catalogo necesita ademas de nombre y precio
-- ---------------------------------------------------------------------
--
-- Todo aditivo y todo opcional: un servicio que ya existia sigue funcionando
-- igual con estas columnas vacias.
--
alter table servicio add column if not exists categoria_id uuid;
alter table servicio add column if not exists precio_promocional_centavos bigint;
alter table servicio add column if not exists promocion_desde date;
alter table servicio add column if not exists promocion_hasta date;
alter table servicio add column if not exists color text;
alter table servicio add column if not exists requiere_preparacion boolean not null default false;
alter table servicio add column if not exists preparacion text;
alter table servicio add column if not exists notas text;
-- Los dias en que se ofrece, como digitos ISO: 1 es lunes y 7 domingo.
-- '1234567' es toda la semana. Nulo = lo que diga el horario del centro.
alter table servicio add column if not exists dias_disponibles text;
alter table servicio add column if not exists hora_desde time;
alter table servicio add column if not exists hora_hasta time;
alter table servicio add column if not exists actualizado_en timestamptz not null default now();

alter table servicio drop constraint if exists servicio_categoria_mismo_negocio;
alter table servicio add constraint servicio_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  -- Si alguien archiva la categoria, el servicio se queda SIN categoria, no
  -- desaparece. Nadie deberia tener que reasignar treinta servicios a mano.
  -- `set null (columna)` y NO `set null` a secas. La llave es COMPUESTA: un
  -- `set null` pelon vacia las DOS columnas, y `negocio_id` no acepta nulos —
  -- asi que el borrado revienta y la fila de la izquierda no se puede borrar
  -- nunca. Se nombra la columna que si se debe vaciar.
  on delete set null (categoria_id);

alter table servicio drop constraint if exists servicio_promocion_coherente;
alter table servicio add constraint servicio_promocion_coherente check (
  precio_promocional_centavos is null or precio_promocional_centavos >= 0
);
alter table servicio drop constraint if exists servicio_promocion_fechas;
alter table servicio add constraint servicio_promocion_fechas check (
  promocion_desde is null or promocion_hasta is null or promocion_hasta >= promocion_desde
);

create index if not exists servicio_categoria_idx on servicio (negocio_id, categoria_id)
  where not eliminado;

-- ---------------------------------------------------------------------
-- EL PRECIO EFECTIVO — una sola funcion, y todos preguntan aqui
-- ---------------------------------------------------------------------
--
-- Agenda, Ventas, Clientes y Reportes necesitan saber cuanto cuesta un
-- servicio HOY. Si cada uno resolviera la promocion por su cuenta, el dia que
-- cambie la regla habria que corregirla en cuatro lugares y uno se quedaria
-- con la vieja — y ese cobraria de mas.
--
-- La promocion sin fechas vale SIEMPRE; con fechas, solo dentro del rango. Una
-- promocion de cero es una promocion valida: hay servicios de cortesia.
--
create or replace function app.precio_efectivo(
  p_base bigint, p_promo bigint, p_desde date, p_hasta date, p_dia date
)
returns bigint
language sql
immutable
as $$
  select case
    when p_promo is null then p_base
    when p_desde is not null and p_dia < p_desde then p_base
    when p_hasta is not null and p_dia > p_hasta then p_base
    else p_promo
  end;
$$;

comment on function app.precio_efectivo is
  'El precio que aplica hoy. Vive aqui para que Agenda, Ventas y Reportes no resuelvan la '
  'promocion cada uno por su cuenta y acaben cobrando distinto.';

-- ---------------------------------------------------------------------
-- EL CATALOGO DE SERVICIOS — buscado, filtrado y paginado en la base
-- ---------------------------------------------------------------------
create or replace function public.servicios_del_centro(
  p_negocio text,
  p_busqueda text default null,
  p_estado text default null,
  p_categoria uuid default null,
  p_pagina int default 1,
  p_por_pagina int default 10,
  p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select s.*,
      c.nombre as categoria_nombre,
      c.color as categoria_color,
      app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                          s.promocion_desde, s.promocion_hasta, p_hoy) as precio_hoy
    from servicio s
    left join categoria c on c.id = s.categoria_id
    where s.negocio_id = p_negocio and not s.eliminado
  ),
  filtrado as (
    select b.* from base b
    where (p_estado is null or p_estado = ''
           or (p_estado = 'activo' and b.activo)
           or (p_estado = 'inactivo' and not b.activo))
      and (p_categoria is null or b.categoria_id = p_categoria)
      and (p_busqueda is null or p_busqueda = ''
           or b.nombre ilike '%' || p_busqueda || '%'
           or coalesce(b.descripcion, '') ilike '%' || p_busqueda || '%'
           or coalesce(b.categoria_nombre, '') ilike '%' || p_busqueda || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrado),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'nombre', f.nombre, 'descripcion', f.descripcion,
        'categoriaId', f.categoria_id, 'categoria', f.categoria_nombre,
        'categoriaColor', f.categoria_color,
        'duracionMin', f.duracion_min,
        'precioCentavos', f.precio_centavos,
        'precioHoyCentavos', f.precio_hoy,
        'enPromocion', f.precio_hoy <> f.precio_centavos,
        'activo', f.activo,
        'color', f.color
      ) order by f.nombre)
      from (
        select * from filtrado order by nombre
        limit greatest(coalesce(p_por_pagina, 10), 1)
        offset greatest(coalesce(p_pagina, 1) - 1, 0) * greatest(coalesce(p_por_pagina, 10), 1)
      ) f
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- EL RESUMEN DE SERVICIOS — las cuatro tarjetas en un viaje
-- ---------------------------------------------------------------------
create or replace function public.resumen_servicios(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with vivos as (
    select * from servicio where negocio_id = p_negocio and not eliminado
  )
  select jsonb_build_object(
    'total', (select count(*) from vivos),
    'activos', (select count(*) from vivos where activo),
    'inactivos', (select count(*) from vivos where not activo),
    -- El promedio se saca SOLO de los activos: un servicio apagado hace dos
    -- años no dice nada de cuanto dura hoy una sesion. `avg` devuelve null
    -- cuando no hay ninguno, y null es "todavia no se", no cero.
    'duracionPromedio', (
      select round(avg(duracion_min))::int from vivos where activo
    )
  );
$$;

comment on function public.resumen_servicios is
  'La duracion promedio se calcula SOLO con los servicios activos, y devuelve null cuando no hay '
  'ninguno. Cero minutos seria una respuesta falsa.';

-- ---------------------------------------------------------------------
-- LA FICHA DE UN SERVICIO — con su impacto antes de apagarlo
-- ---------------------------------------------------------------------
create or replace function public.ficha_del_servicio(
  p_servicio uuid, p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id, 'nombre', s.nombre, 'descripcion', s.descripcion, 'notas', s.notas,
    'categoriaId', s.categoria_id,
    'categoria', (select c.nombre from categoria c where c.id = s.categoria_id),
    'categoriaColor', (select c.color from categoria c where c.id = s.categoria_id),
    'duracionMin', s.duracion_min,
    'precioCentavos', s.precio_centavos,
    'precioPromocionalCentavos', s.precio_promocional_centavos,
    'promocionDesde', s.promocion_desde,
    'promocionHasta', s.promocion_hasta,
    'precioHoyCentavos', app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                                             s.promocion_desde, s.promocion_hasta, p_hoy),
    'color', s.color,
    'requierePreparacion', s.requiere_preparacion,
    'preparacion', s.preparacion,
    'diasDisponibles', s.dias_disponibles,
    'horaDesde', s.hora_desde,
    'horaHasta', s.hora_hasta,
    'activo', s.activo,
    'creadoEn', s.creado_en,
    -- CUANTAS CITAS FUTURAS TIENE. Es lo que se le enseña a quien va a
    -- apagarlo: apagar un servicio con doce citas agendadas sin avisar es
    -- como cancelarlas a ciegas.
    'citasFuturas', (
      select count(*) from cita v
      where v.servicio_id = s.id and not v.eliminado
        and v.estado in ('pendiente', 'confirmada') and v.fecha >= p_hoy
    ),
    'citasCompletadas', (
      select count(*) from cita v
      where v.servicio_id = s.id and not v.eliminado and v.estado = 'completada'
    ),
    -- SI ESTA PERSONA PUEDE VER LA BITACORA.
    --
    -- La regla de fila de `auditoria` solo la entrega a quien tiene
    -- `verAuditoria`. Sin este dato, una recepcionista recibiria una lista
    -- vacia y la pantalla le diria "todavia no hay cambios registrados" —
    -- que es mentira: los hay, simplemente no son para sus ojos. Una pantalla
    -- que confunde "no puedes verlo" con "no existe" enseña a desconfiar de
    -- todo lo demas que dice.
    'puedeVerHistorial', app.tiene_permiso(s.negocio_id, 'verAuditoria'),
    -- El historial sale de la bitacora que ya existe. No hay una segunda.
    --
    -- La columna de tiempo se llama `ocurrido_en`, NO `creado_en`: la bitacora
    -- guarda cuando PASO la cosa, que no siempre es cuando se pudo escribir el
    -- renglon —una entrada que se reintenta con mala red se escribe despues—.
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object(
        'accion', a.accion, 'quien', a.usuario_nombre, 'cuando', a.ocurrido_en,
        'antes', a.antes, 'despues', a.despues
      ) order by a.ocurrido_en desc)
      from (
        select * from auditoria
        where negocio_id = s.negocio_id and modulo = 'servicios' and entidad = s.id::text
        order by ocurrido_en desc limit 20
      ) a
    ), '[]'::jsonb)
  )
  from servicio s
  where s.id = p_servicio;
$$;

-- ---------------------------------------------------------------------
-- GUARDAR UN SERVICIO — con su rastro en la bitacora
-- ---------------------------------------------------------------------
--
-- Va por funcion y no por un `update` suelto porque hay que dejar rastro de QUE
-- cambio: el precio y la duracion de un servicio mueven dinero y agenda, y
-- "alguien lo cambio en algun momento" no le sirve a nadie tres meses despues.
--
create or replace function public.guardar_servicio(
  p_negocio text,
  p_id uuid,
  p_nombre text,
  p_descripcion text,
  p_categoria uuid,
  p_duracion int,
  p_precio bigint,
  -- De aqui para abajo todo es OPCIONAL, y por eso lleva valor por omision: un
  -- servicio se da de alta con nombre, duracion y precio. Obligar a mandar
  -- diecinueve argumentos para crear uno hace que cualquiera que llame a esta
  -- funcion desde otro lado se equivoque de posicion en silencio.
  p_promo bigint default null,
  p_promo_desde date default null,
  p_promo_hasta date default null,
  p_color text default null,
  p_requiere_preparacion boolean default false,
  p_preparacion text default null,
  p_notas text default null,
  p_dias text default null,
  p_hora_desde time default null,
  p_hora_hasta time default null,
  p_activo boolean default true
)
returns servicio
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s     servicio;
  v_antes jsonb;
  v_quien membresia;
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
    raise exception 'El servicio necesita un nombre.' using errcode = 'invalid_parameter_value';
  end if;
  if p_duracion is null or p_duracion <= 0 then
    raise exception 'La duracion tiene que ser mayor que cero.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if p_id is null then
    insert into servicio (negocio_id, nombre, descripcion, categoria_id, duracion_min,
                          precio_centavos, precio_promocional_centavos, promocion_desde,
                          promocion_hasta, color, requiere_preparacion, preparacion, notas,
                          dias_disponibles, hora_desde, hora_hasta, activo)
    values (p_negocio, btrim(p_nombre), p_descripcion, p_categoria, p_duracion,
            p_precio, p_promo, p_promo_desde, p_promo_hasta, p_color,
            coalesce(p_requiere_preparacion, false), p_preparacion, p_notas,
            p_dias, p_hora_desde, p_hora_hasta, coalesce(p_activo, true))
    returning * into v_s;

    insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                           entidad, antes, despues)
    values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
            coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'), 'servicios', 'crear', v_s.id::text, null,
            jsonb_build_object('nombre', v_s.nombre, 'precio', v_s.precio_centavos,
                               'duracion', v_s.duracion_min));
    return v_s;
  end if;

  select * into v_s from servicio where id = p_id and negocio_id = p_negocio and not eliminado;
  if v_s.id is null then
    raise exception 'Ese servicio no existe.' using errcode = 'no_data_found';
  end if;

  v_antes := jsonb_build_object('nombre', v_s.nombre, 'precio', v_s.precio_centavos,
                                'duracion', v_s.duracion_min, 'activo', v_s.activo,
                                'categoria', v_s.categoria_id, 'promo', v_s.precio_promocional_centavos);

  update servicio
     set nombre = btrim(p_nombre), descripcion = p_descripcion, categoria_id = p_categoria,
         duracion_min = p_duracion, precio_centavos = p_precio,
         precio_promocional_centavos = p_promo, promocion_desde = p_promo_desde,
         promocion_hasta = p_promo_hasta, color = p_color,
         requiere_preparacion = coalesce(p_requiere_preparacion, false),
         preparacion = p_preparacion, notas = p_notas,
         dias_disponibles = p_dias, hora_desde = p_hora_desde, hora_hasta = p_hora_hasta,
         activo = coalesce(p_activo, v_s.activo), actualizado_en = now()
   where id = p_id
  returning * into v_s;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'), 'servicios', 'editar', v_s.id::text, v_antes,
          jsonb_build_object('nombre', v_s.nombre, 'precio', v_s.precio_centavos,
                             'duracion', v_s.duracion_min, 'activo', v_s.activo,
                             'categoria', v_s.categoria_id, 'promo', v_s.precio_promocional_centavos));
  return v_s;
end;
$$;

comment on function public.guardar_servicio is
  'Crea o edita y DEJA RASTRO. El precio y la duracion mueven dinero y agenda: "alguien lo cambio '
  'en algun momento" no le sirve a nadie tres meses despues.';

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
-- PRODUCTOS E INVENTARIO — lo que existe, cuanto hay, y POR QUE cambio
-- =====================================================================
--
-- LA DECISION QUE SOSTIENE TODO ESTE BLOQUE: el stock no es un numero que se
-- edita. Es la consecuencia de una lista de movimientos.
--
--   producto               QUE existe: nombre, sku, precio, costo, minimo.
--   movimiento_inventario  POR QUE cambio: entrada, salida, venta, ajuste.
--   proveedor              DE DONDE llega.
--
-- Un `update producto set stock_actual = 20` no dice nada tres meses despues:
-- ni quien lo hizo, ni cuando, ni por que faltaban dos. Con movimientos, la
-- pregunta "¿por que dice 18 si compramos 20?" tiene respuesta.
--
-- `stock_actual` SE CONSERVA como columna —la lista se leeria lentisima
-- sumando movimientos en cada renglon— pero NADIE la escribe directamente:
-- solo `app.mover_inventario`, que hace las dos cosas en el mismo acto. Un
-- movimiento que diga -2 con el stock sin cambiar es peor que no tener
-- movimientos.

-- ---------------------------------------------------------------------
-- LAS COLUMNAS QUE LE FALTABAN AL PRODUCTO
-- ---------------------------------------------------------------------
alter table producto add column if not exists sku text;
alter table producto add column if not exists codigo_barras text;
alter table producto add column if not exists categoria_id uuid;
-- Donde esta fisicamente. Texto libre a proposito: un centro tiene "Estante
-- A"; inventarle una tabla de almacenes a quien tiene una vitrina es
-- construir un ERP que nadie pidio.
alter table producto add column if not exists ubicacion text;
-- Como se cuenta. Casi siempre piezas; los aceites a granel, mililitros.
alter table producto add column if not exists unidad text not null default 'pieza';
alter table producto add column if not exists notas text;
alter table producto add column if not exists actualizado_en timestamptz not null default now();

-- EL SKU ES UNICO POR CENTRO, NO EN TODO EL SISTEMA. Dos consultorios pueden
-- usar "AELV15" para cosas distintas y ninguno tiene por que enterarse.
create unique index if not exists producto_sku_unico
  on producto (negocio_id, upper(sku)) where sku is not null and not eliminado;
create unique index if not exists producto_barras_unico
  on producto (negocio_id, codigo_barras) where codigo_barras is not null and not eliminado;

alter table producto drop constraint if exists producto_categoria_mismo_negocio;
alter table producto add constraint producto_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  -- `set null (columna)`: la llave es compuesta y un `set null` pelon vaciaria
  -- tambien `negocio_id`, que no acepta nulos.
  on delete set null (categoria_id);

create index if not exists producto_categoria_idx on producto (negocio_id, categoria_id)
  where not eliminado;

-- EL AMBITO DE CATEGORIA CRECE. La misma tabla sirve para servicios, cursos y
-- ahora productos: un centro llama "Aceites" a un grupo y no quiere tres
-- listas distintas de grupos.
alter table categoria drop constraint if exists categoria_ambito_check;
alter table categoria add constraint categoria_ambito_check
  check (ambito in ('servicio', 'curso', 'producto'));

-- ---------------------------------------------------------------------
-- LOS PROVEEDORES
-- ---------------------------------------------------------------------
create table if not exists proveedor (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  text not null references negocio(id) on delete cascade,
  nombre      text not null,
  contacto    text,
  telefono    text,
  correo      text,
  notas       text,
  activo      boolean not null default true,
  eliminado   boolean not null default false,
  creado_en   timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'proveedor_negocio_id_unico') then
    alter table proveedor add constraint proveedor_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

create index if not exists proveedor_idx on proveedor (negocio_id) where not eliminado;

alter table proveedor enable row level security;
alter table proveedor force row level security;
revoke all on proveedor from anon;
grant select, insert, update, delete on proveedor to authenticated;

drop policy if exists proveedor_leer on proveedor;
create policy proveedor_leer on proveedor
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists proveedor_escribir on proveedor;
create policy proveedor_escribir on proveedor
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario')
              and app.licencia_permite(negocio_id));

-- UN PRODUCTO PUEDE TENER VARIOS PROVEEDORES. `producto.proveedor_nombre`
-- obligaria a escoger uno y a reescribirlo el dia que cambie; y no permitiria
-- comparar a quien se le compra mas barato.
create table if not exists producto_proveedor (
  id            uuid primary key default gen_random_uuid(),
  negocio_id    text not null references negocio(id) on delete cascade,
  producto_id   uuid not null,
  proveedor_id  uuid not null,
  -- Lo que ESE proveedor cobra. Puede diferir del costo de referencia.
  costo_centavos bigint check (costo_centavos is null or costo_centavos >= 0),
  -- El codigo con el que ese proveedor lo identifica en SU catalogo.
  codigo        text,
  preferido     boolean not null default false,
  creado_en     timestamptz not null default now(),
  unique (producto_id, proveedor_id)
);

alter table producto_proveedor drop constraint if exists pp_producto_mismo_negocio;
alter table producto_proveedor add constraint pp_producto_mismo_negocio
  foreign key (negocio_id, producto_id) references producto (negocio_id, id) on delete cascade;
alter table producto_proveedor drop constraint if exists pp_proveedor_mismo_negocio;
alter table producto_proveedor add constraint pp_proveedor_mismo_negocio
  foreign key (negocio_id, proveedor_id) references proveedor (negocio_id, id) on delete cascade;

-- SOLO UNO PUEDE SER EL PREFERIDO. Dos "principales" es no tener ninguno.
create unique index if not exists pp_un_solo_preferido
  on producto_proveedor (producto_id) where preferido;

create index if not exists pp_producto_idx on producto_proveedor (negocio_id, producto_id);

alter table producto_proveedor enable row level security;
alter table producto_proveedor force row level security;
revoke all on producto_proveedor from anon;
grant select, insert, update, delete on producto_proveedor to authenticated;

drop policy if exists pp_leer on producto_proveedor;
create policy pp_leer on producto_proveedor
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists pp_escribir on producto_proveedor;
create policy pp_escribir on producto_proveedor
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario')
              and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- EL MOVIMIENTO DE INVENTARIO — el corazon de este bloque
-- ---------------------------------------------------------------------
--
-- SOLO SE AGREGA. Un renglon que se puede editar no es una bitacora: si el
-- inventario no cuadra y los movimientos se pueden corregir a mano, no hay
-- forma de saber si falto mercancia o falto honestidad.
--
-- Guarda ANTES y DESPUES a proposito, aunque se podrian recalcular. Con los
-- dos numeros escritos, un descuadre se localiza leyendo la lista: el renglon
-- donde el "antes" de uno no coincide con el "despues" del anterior es
-- exactamente donde algo se salto el sistema.
--
create table if not exists movimiento_inventario (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  producto_id    uuid not null,
  tipo           text not null check (tipo in (
                   'inicial', 'entrada', 'venta', 'devolucion',
                   'ajuste_entrada', 'ajuste_salida', 'merma', 'caducado')),
  -- Positiva o negativa segun el tipo. Se guarda con signo para que sumar la
  -- columna de un producto de siempre su stock.
  cantidad       int not null check (cantidad <> 0),
  stock_antes    int not null,
  stock_despues  int not null,
  motivo         text,
  -- De donde vino: una venta, una compra, un ajuste a mano.
  referencia_tipo text check (referencia_tipo in ('venta', 'compra', 'ajuste')),
  referencia_id  uuid,
  -- El costo unitario de ESTA entrada. Es lo que permite calcular el valor del
  -- inventario y la utilidad historica sin depender del costo de hoy.
  costo_centavos bigint check (costo_centavos is null or costo_centavos >= 0),
  creado_por     uuid,
  creado_en      timestamptz not null default now()
);

comment on table movimiento_inventario is
  'SOLO SE AGREGA. El stock es la consecuencia de esta lista, no un numero que se edita. Guarda '
  'antes y despues aunque se podrian recalcular: con los dos escritos, un descuadre se localiza '
  'leyendo la lista.';

alter table movimiento_inventario drop constraint if exists mi_producto_mismo_negocio;
alter table movimiento_inventario add constraint mi_producto_mismo_negocio
  foreign key (negocio_id, producto_id) references producto (negocio_id, id) on delete cascade;

create index if not exists mi_producto_idx
  on movimiento_inventario (negocio_id, producto_id, creado_en desc);

alter table movimiento_inventario enable row level security;
alter table movimiento_inventario force row level security;
revoke all on movimiento_inventario from anon;
-- SIN update NI delete, para nadie. Igual que la caja: se agrega y ya.
revoke update, delete on movimiento_inventario from authenticated, anon, service_role;
grant select, insert on movimiento_inventario to authenticated;

drop policy if exists mi_leer on movimiento_inventario;
create policy mi_leer on movimiento_inventario
  for select to authenticated using (app.es_miembro(negocio_id));

drop policy if exists mi_agregar on movimiento_inventario;
create policy mi_agregar on movimiento_inventario
  for insert to authenticated
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarInventario'));

-- ---------------------------------------------------------------------
-- LA UNICA PUERTA POR LA QUE CAMBIA EL STOCK
-- ---------------------------------------------------------------------
--
-- Nadie escribe `producto.stock_actual` a mano. Todo pasa por aqui, y aqui el
-- movimiento y el stock cambian EN EL MISMO ACTO. Un movimiento que diga -2
-- con el stock sin tocar es peor que no tener movimientos: hace creer que hay
-- trazabilidad cuando no la hay.
--
-- El `for update` sobre el renglon del producto serializa a quien toque ESE
-- producto. Sin el, dos cajas vendiendo la ultima pieza leen "1 disponible"
-- las dos y el stock queda en -1.
--
create or replace function app.mover_inventario(
  p_producto uuid,
  p_tipo text,
  p_cantidad int,
  p_motivo text default null,
  p_referencia_tipo text default null,
  p_referencia_id uuid default null,
  p_costo bigint default null,
  p_permitir_negativo boolean default false
)
returns movimiento_inventario
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p      producto;
  v_antes  int;
  v_despues int;
  v_m      movimiento_inventario;
begin
  if p_cantidad = 0 then
    raise exception 'Un movimiento de cero no cambia nada.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL CANDADO. Todo lo que sigue esta protegido de la carrera.
  select * into v_p from producto where id = p_producto and not eliminado for update;
  if v_p.id is null then
    raise exception 'Ese producto no existe.' using errcode = 'no_data_found';
  end if;

  v_antes := v_p.stock_actual;
  v_despues := v_antes + p_cantidad;

  -- EL STOCK NO SE VA A NEGATIVO. Un inventario en -3 no es un dato: es la
  -- prueba de que el sistema dejo vender lo que no habia, y a partir de ahi
  -- ningun numero de esa pantalla vale nada.
  if v_despues < 0 and not p_permitir_negativo then
    raise exception 'Solo quedan % de %: no se pueden sacar %.',
      v_antes, v_p.nombre, abs(p_cantidad)
      using errcode = 'check_violation';
  end if;

  insert into movimiento_inventario (
    negocio_id, producto_id, tipo, cantidad, stock_antes, stock_despues,
    motivo, referencia_tipo, referencia_id, costo_centavos, creado_por)
  values (v_p.negocio_id, p_producto, p_tipo, p_cantidad, v_antes, v_despues,
          p_motivo, p_referencia_tipo, p_referencia_id, p_costo, auth.uid())
  returning * into v_m;

  update producto
     set stock_actual = v_despues, actualizado_en = now()
   where id = p_producto;

  return v_m;
end;
$$;

comment on function app.mover_inventario is
  'LA UNICA PUERTA por la que cambia el stock. Movimiento y stock cambian en el mismo acto, con '
  'el renglon del producto bloqueado: sin el candado, dos cajas vendiendo la ultima pieza leen '
  '"1 disponible" las dos y el stock queda en -1.';

-- ---------------------------------------------------------------------
-- EL ESTADO DE INVENTARIO SE DERIVA
-- ---------------------------------------------------------------------
--
-- "Disponible", "Stock bajo" y "Agotado" NO se guardan: se deducen del stock y
-- del minimo. Guardarlos obliga a recalcularlos en cada venta, y el dia que
-- ese recalculo falle la etiqueta se queda vieja sin que nada avise.
--
-- Y son OTRA COSA que `activo`. Un producto activo con cero piezas esta
-- agotado, no inactivo: apagarlo solo porque se acabo lo escondería de la
-- lista justo cuando hay que resurtirlo.
--
create or replace function app.estado_de_stock(p_stock int, p_minimo int)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_stock, 0) <= 0 then 'agotado'
    when coalesce(p_stock, 0) <= coalesce(p_minimo, 0) then 'bajo'
    else 'disponible'
  end;
$$;

-- ---------------------------------------------------------------------
-- QUIEN PUEDE VER COSTOS
-- ---------------------------------------------------------------------
--
-- El costo y el margen no son para todo el mundo. Y esconderlos con CSS no
-- esconde nada: quien abra la consola los ve igual. Se resuelve AQUI, y las
-- consultas devuelven nulo a quien no debe verlos.
--
create or replace function app.puede_ver_costos(p_negocio text)
returns boolean
language sql
stable
as $$
  select app.tiene_permiso(p_negocio, 'verCostos')
      or app.tiene_permiso(p_negocio, 'verFinanzas');
$$;

comment on function app.puede_ver_costos is
  'Esconder el costo con CSS no esconde nada: quien abra la consola lo ve igual. Se decide aqui, '
  'y la consulta devuelve nulo a quien no debe verlo.';

-- ---------------------------------------------------------------------
-- LOS PRODUCTOS DEL CENTRO — buscados, filtrados y paginados en la base
-- ---------------------------------------------------------------------
create or replace function public.productos_del_centro(
  p_negocio text,
  p_busqueda text default null,
  p_estado text default null,
  p_categoria uuid default null,
  p_proveedor uuid default null,
  p_activo boolean default null,
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
      p.*,
      app.estado_de_stock(p.stock_actual, p.stock_minimo) as inventario,
      (select k.nombre from categoria k where k.id = p.categoria_id) as categoria,
      (select k.color  from categoria k where k.id = p.categoria_id) as categoria_color
    from producto p
    where p.negocio_id = p_negocio
      and not p.eliminado
      and (p_categoria is null or p.categoria_id = p_categoria)
      and (p_activo is null or p.activo = p_activo)
      and (p_proveedor is null or exists (
            select 1 from producto_proveedor pp
            where pp.producto_id = p.id and pp.proveedor_id = p_proveedor))
      -- El buscador mira nombre, SKU y codigo de barras: en un mostrador se
      -- busca por lo que diga la etiqueta, no siempre por el nombre.
      and (p_busqueda is null or (
            p.nombre        ilike '%' || p_busqueda || '%'
         or p.sku           ilike '%' || p_busqueda || '%'
         or p.codigo_barras ilike '%' || p_busqueda || '%'
         or p.descripcion   ilike '%' || p_busqueda || '%'))
  ),
  filtrada as (
    select * from base where (p_estado is null or inventario = p_estado)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    'filas', coalesce((
      select jsonb_agg(t.x order by t.orden)
      from (
        select jsonb_build_object(
          'id', f.id,
          'nombre', f.nombre,
          'sku', f.sku,
          'codigoBarras', f.codigo_barras,
          'categoriaId', f.categoria_id,
          'categoria', f.categoria,
          'categoriaColor', f.categoria_color,
          'precioCentavos', f.precio_centavos,
          -- EL COSTO SOLO A QUIEN PUEDE VERLO. Nulo, no cero: cero seria un
          -- dato falso y ademas haria creer que el margen es del 100%.
          'costoCentavos', case when app.puede_ver_costos(p_negocio)
                                then f.costo_centavos else null end,
          'stockActual', f.stock_actual,
          'stockMinimo', f.stock_minimo,
          'unidad', f.unidad,
          'imagenUrl', f.imagen_url,
          'ubicacion', f.ubicacion,
          'inventario', f.inventario,
          'activo', f.activo
        ) as x,
        f.nombre as orden
        from filtrada f
        order by f.nombre
        limit greatest(p_por_pagina, 1)
        offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)
      ) t
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- LAS CUATRO CIFRAS DE ARRIBA
-- ---------------------------------------------------------------------
--
-- EL VALOR DEL INVENTARIO SE CALCULA CON EL COSTO, no con el precio de venta.
-- Con el precio de venta el numero sale inflado y se lee como si el centro
-- tuviera ese dinero: lo que hay en la vitrina vale lo que costo, y lo demas
-- es una ganancia que todavia no ocurre.
--
create or replace function public.resumen_productos(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with p as (
    select producto.*, app.estado_de_stock(stock_actual, stock_minimo) as inventario
    from producto where negocio_id = p_negocio and not eliminado and activo
  )
  select jsonb_build_object(
    -- Los ARCHIVADOS no cuentan: la cifra es "que tengo para vender", no
    -- "cuantos renglones hay en la tabla".
    'total', (select count(*) from p),
    'valorCentavos', case when app.puede_ver_costos(p_negocio) then (
      select coalesce(sum(greatest(stock_actual, 0)::bigint * costo_centavos), 0) from p
    ) else null end,
    'bajos', (select count(*) from p where inventario = 'bajo'),
    'agotados', (select count(*) from p where inventario = 'agotado')
  );
$$;

comment on function public.resumen_productos is
  'El valor del inventario se calcula con el COSTO, no con el precio de venta: lo que hay en la '
  'vitrina vale lo que costo, y lo demas es una ganancia que todavia no ocurre.';

-- ---------------------------------------------------------------------
-- LA FICHA DE UN PRODUCTO — con sus movimientos, ventas y proveedores
-- ---------------------------------------------------------------------
create or replace function public.ficha_del_producto(p_producto uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p.id,
    'nombre', p.nombre,
    'descripcion', p.descripcion,
    'sku', p.sku,
    'codigoBarras', p.codigo_barras,
    'categoriaId', p.categoria_id,
    'categoria', (select k.nombre from categoria k where k.id = p.categoria_id),
    'categoriaColor', (select k.color from categoria k where k.id = p.categoria_id),
    'precioCentavos', p.precio_centavos,
    'costoCentavos', case when app.puede_ver_costos(p.negocio_id)
                          then p.costo_centavos else null end,
    'puedeVerCostos', app.puede_ver_costos(p.negocio_id),
    'stockActual', p.stock_actual,
    'stockMinimo', p.stock_minimo,
    'unidad', p.unidad,
    'ubicacion', p.ubicacion,
    'imagenUrl', p.imagen_url,
    'notas', p.notas,
    'activo', p.activo,
    'inventario', app.estado_de_stock(p.stock_actual, p.stock_minimo),
    'valorCentavos', case when app.puede_ver_costos(p.negocio_id)
                          then greatest(p.stock_actual, 0)::bigint * p.costo_centavos
                          else null end,
    -- LOS MOVIMIENTOS: por que el stock es el que es.
    'movimientos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'tipo', m.tipo, 'cantidad', m.cantidad,
        'stockAntes', m.stock_antes, 'stockDespues', m.stock_despues,
        'motivo', m.motivo, 'referenciaTipo', m.referencia_tipo,
        'referenciaId', m.referencia_id,
        'quien', (select b.nombre from membresia b where b.usuario_id = m.creado_por
                   and b.negocio_id = m.negocio_id limit 1),
        'cuando', m.creado_en
      ) order by m.creado_en desc)
      from (select * from movimiento_inventario
             where producto_id = p.id order by creado_en desc limit 50) m
    ), '[]'::jsonb),
    -- LAS VENTAS con su precio HISTORICO. No se recalculan con el de hoy: el
    -- ticket de enero tiene que seguir diciendo lo que se cobro en enero.
    'ventas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ventaId', v.id, 'folio', v.folio, 'fecha', v.fecha,
        'cantidad', i.cantidad,
        'precioUnitario', i.precio_unitario_centavos,
        'total', i.subtotal_centavos,
        'clienteId', v.cliente_id,
        'cliente', (select c.nombre from cliente c where c.id = v.cliente_id)
      ) order by v.fecha desc, v.creado_en desc)
      from (select vi.* from venta_item vi
             join venta vv on vv.id = vi.venta_id
             where vi.producto_id = p.id and vv.estado = 'cobrada' and not vv.eliminado
             order by vv.fecha desc limit 30) i
      join venta v on v.id = i.venta_id
    ), '[]'::jsonb),
    'proveedores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pp.id, 'proveedorId', pr.id, 'nombre', pr.nombre,
        'telefono', pr.telefono, 'correo', pr.correo,
        'codigo', pp.codigo, 'preferido', pp.preferido,
        'costoCentavos', case when app.puede_ver_costos(p.negocio_id)
                              then pp.costo_centavos else null end
      ) order by pp.preferido desc, pr.nombre)
      from producto_proveedor pp
      join proveedor pr on pr.id = pp.proveedor_id and not pr.eliminado
      where pp.producto_id = p.id
    ), '[]'::jsonb)
  )
  from producto p
  where p.id = p_producto and not p.eliminado;
$$;

-- ---------------------------------------------------------------------
-- GUARDAR UN PRODUCTO — SIN tocar el stock
-- ---------------------------------------------------------------------
--
-- EL STOCK NO SE EDITA DESDE AQUI, a proposito. Cambiar 18 por 20 en un
-- formulario no dice de donde salieron las dos piezas. Para eso esta
-- `ajustar_inventario`, que exige un motivo y deja rastro.
--
-- El stock INICIAL si entra aqui, porque es la primera vez y no hay nada de
-- donde partir — pero produce su movimiento igual.
--
create or replace function public.guardar_producto(
  p_negocio text,
  p_id uuid,
  p_nombre text,
  p_descripcion text default null,
  p_sku text default null,
  p_codigo_barras text default null,
  p_categoria uuid default null,
  p_precio bigint default 0,
  p_costo bigint default 0,
  p_stock_minimo int default 0,
  p_unidad text default 'pieza',
  p_ubicacion text default null,
  p_imagen text default null,
  p_notas text default null,
  p_activo boolean default true,
  p_stock_inicial int default 0
)
returns producto
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p     producto;
  v_antes jsonb;
  v_quien membresia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarInventario') then
    raise exception 'No tienes permiso para administrar el inventario.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El producto necesita un nombre.' using errcode = 'invalid_parameter_value';
  end if;
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;
  if p_costo is null or p_costo < 0 then
    raise exception 'El costo no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;
  if p_stock_minimo is null or p_stock_minimo < 0 then
    raise exception 'El stock minimo no puede ser negativo.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if p_id is null then
    insert into producto (negocio_id, nombre, descripcion, sku, codigo_barras, categoria_id,
                          precio_centavos, costo_centavos, stock_actual, stock_minimo,
                          unidad, ubicacion, imagen_url, notas, activo)
    values (p_negocio, btrim(p_nombre), p_descripcion, nullif(btrim(coalesce(p_sku, '')), ''),
            nullif(btrim(coalesce(p_codigo_barras, '')), ''), p_categoria,
            p_precio, p_costo, 0, p_stock_minimo,
            coalesce(p_unidad, 'pieza'), p_ubicacion, p_imagen, p_notas, coalesce(p_activo, true))
    returning * into v_p;

    -- EL STOCK INICIAL NO SE ASIGNA EN SILENCIO: produce su movimiento, igual
    -- que todos los demas. Si mañana falta una pieza, la lista empieza aqui.
    if coalesce(p_stock_inicial, 0) > 0 then
      perform app.mover_inventario(v_p.id, 'inicial', p_stock_inicial,
                                   'Inventario inicial', null, null, p_costo);
      select * into v_p from producto where id = v_p.id;
    end if;

    insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                           entidad, antes, despues)
    values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
            coalesce((select r.etiqueta from rol r
                       where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                      v_quien.rol, 'desconocido'),
            'productos', 'crear', v_p.id::text, null,
            jsonb_build_object('nombre', v_p.nombre, 'precio', v_p.precio_centavos,
                               'costo', v_p.costo_centavos, 'sku', v_p.sku));
    return v_p;
  end if;

  select * into v_p from producto where id = p_id and negocio_id = p_negocio and not eliminado;
  if v_p.id is null then
    raise exception 'Ese producto no existe.' using errcode = 'no_data_found';
  end if;

  v_antes := jsonb_build_object('nombre', v_p.nombre, 'precio', v_p.precio_centavos,
                                'costo', v_p.costo_centavos, 'minimo', v_p.stock_minimo,
                                'activo', v_p.activo, 'sku', v_p.sku);

  update producto
     set nombre = btrim(p_nombre), descripcion = p_descripcion,
         sku = nullif(btrim(coalesce(p_sku, '')), ''),
         codigo_barras = nullif(btrim(coalesce(p_codigo_barras, '')), ''),
         categoria_id = p_categoria, precio_centavos = p_precio, costo_centavos = p_costo,
         stock_minimo = p_stock_minimo, unidad = coalesce(p_unidad, 'pieza'),
         ubicacion = p_ubicacion, imagen_url = p_imagen, notas = p_notas,
         activo = coalesce(p_activo, v_p.activo), actualizado_en = now()
     -- OJO: `stock_actual` NO esta en esta lista, y es a proposito.
   where id = p_id
  returning * into v_p;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'productos', 'editar', v_p.id::text, v_antes,
          jsonb_build_object('nombre', v_p.nombre, 'precio', v_p.precio_centavos,
                             'costo', v_p.costo_centavos, 'minimo', v_p.stock_minimo,
                             'activo', v_p.activo, 'sku', v_p.sku));
  return v_p;
end;
$$;

comment on function public.guardar_producto is
  'NO toca `stock_actual`, a proposito: cambiar 18 por 20 en un formulario no dice de donde '
  'salieron las dos piezas. Para eso esta `ajustar_inventario`, que exige un motivo.';

-- ---------------------------------------------------------------------
-- AJUSTAR EL INVENTARIO — con motivo obligatorio
-- ---------------------------------------------------------------------
create or replace function public.ajustar_inventario(
  p_producto uuid,
  p_tipo text,
  p_cantidad int,
  p_motivo text,
  p_costo bigint default null
)
returns movimiento_inventario
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p     producto;
  v_signo int;
  v_m     movimiento_inventario;
  v_quien membresia;
begin
  select * into v_p from producto where id = p_producto and not eliminado;
  if v_p.id is null then
    raise exception 'Ese producto no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_p.negocio_id, 'gestionarInventario') then
    raise exception 'No tienes permiso para ajustar el inventario.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(v_p.negocio_id) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_tipo not in ('entrada', 'ajuste_entrada', 'ajuste_salida', 'merma', 'caducado') then
    raise exception 'Ese tipo de movimiento no se puede hacer a mano.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.'
      using errcode = 'invalid_parameter_value';
  end if;
  -- EL MOTIVO ES OBLIGATORIO. Un ajuste sin motivo es exactamente el
  -- `update stock = 20` que este bloque existe para evitar.
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Todo ajuste necesita un motivo.' using errcode = 'invalid_parameter_value';
  end if;

  v_signo := case when p_tipo in ('entrada', 'ajuste_entrada') then 1 else -1 end;

  v_m := app.mover_inventario(p_producto, p_tipo, v_signo * p_cantidad, btrim(p_motivo),
                              'ajuste', null, p_costo);

  select * into v_quien from membresia
   where negocio_id = v_p.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues, motivo)
  values (v_p.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'productos', 'inventario', p_producto::text,
          jsonb_build_object('stock', v_m.stock_antes),
          jsonb_build_object('stock', v_m.stock_despues, 'tipo', p_tipo), btrim(p_motivo));

  return v_m;
end;
$$;

-- ---------------------------------------------------------------------
-- LOS PROVEEDORES DE UN PRODUCTO
-- ---------------------------------------------------------------------
create or replace function public.guardar_proveedor(
  p_negocio text, p_id uuid, p_nombre text,
  p_contacto text default null, p_telefono text default null,
  p_correo text default null, p_notas text default null, p_activo boolean default true
)
returns proveedor
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_pr proveedor;
begin
  if not app.tiene_permiso(p_negocio, 'gestionarInventario') then
    raise exception 'No tienes permiso para administrar proveedores.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El proveedor necesita un nombre.' using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into proveedor (negocio_id, nombre, contacto, telefono, correo, notas, activo)
    values (p_negocio, btrim(p_nombre), p_contacto, p_telefono, p_correo, p_notas,
            coalesce(p_activo, true))
    returning * into v_pr;
    return v_pr;
  end if;

  update proveedor
     set nombre = btrim(p_nombre), contacto = p_contacto, telefono = p_telefono,
         correo = p_correo, notas = p_notas, activo = coalesce(p_activo, activo)
   where id = p_id and negocio_id = p_negocio
  returning * into v_pr;
  if v_pr.id is null then
    raise exception 'Ese proveedor no existe.' using errcode = 'no_data_found';
  end if;
  return v_pr;
end;
$$;

create or replace function public.ligar_proveedor(
  p_producto uuid, p_proveedor uuid,
  p_costo bigint default null, p_codigo text default null, p_preferido boolean default false
)
returns producto_proveedor
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p  producto;
  v_pp producto_proveedor;
begin
  select * into v_p from producto where id = p_producto and not eliminado;
  if v_p.id is null then
    raise exception 'Ese producto no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_p.negocio_id, 'gestionarInventario') then
    raise exception 'No tienes permiso para administrar proveedores.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from proveedor
                  where id = p_proveedor and negocio_id = v_p.negocio_id and not eliminado) then
    raise exception 'Ese proveedor no existe en este centro.' using errcode = 'no_data_found';
  end if;

  -- SOLO UNO PUEDE SER EL PREFERIDO: el anterior se baja antes de subir este.
  -- Dos "principales" es no tener ninguno.
  if coalesce(p_preferido, false) then
    update producto_proveedor set preferido = false
     where producto_id = p_producto and preferido;
  end if;

  insert into producto_proveedor (negocio_id, producto_id, proveedor_id, costo_centavos,
                                  codigo, preferido)
  values (v_p.negocio_id, p_producto, p_proveedor, p_costo, p_codigo, coalesce(p_preferido, false))
  on conflict (producto_id, proveedor_id) do update
     set costo_centavos = excluded.costo_centavos,
         codigo = excluded.codigo,
         preferido = excluded.preferido
  returning * into v_pp;
  return v_pp;
end;
$$;

create or replace function public.desligar_proveedor(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n text;
begin
  select negocio_id into v_n from producto_proveedor where id = p_id;
  if v_n is null then
    raise exception 'Esa relacion no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_n, 'gestionarInventario') then
    raise exception 'No tienes permiso para administrar proveedores.'
      using errcode = 'insufficient_privilege';
  end if;
  delete from producto_proveedor where id = p_id;
end;
$$;

create or replace function public.proveedores_del_centro(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id, 'nombre', pr.nombre, 'contacto', pr.contacto,
    'telefono', pr.telefono, 'correo', pr.correo, 'activo', pr.activo,
    'productos', (select count(*) from producto_proveedor pp where pp.proveedor_id = pr.id)
  ) order by pr.nombre), '[]'::jsonb)
  from proveedor pr
  where pr.negocio_id = p_negocio and not pr.eliminado;
$$;

-- ---------------------------------------------------------------------
-- LA INTEGRACION QUE HABIA QUE CORREGIR: VENTAS ↔ INVENTARIO
-- ---------------------------------------------------------------------
--
-- `cobrar_venta` bajaba el stock con un `update` directo. Funcionaba —el
-- candado estaba puesto— pero NO DEJABA RASTRO: tres meses despues, "¿por que
-- dice 18 si compramos 20?" no tenia respuesta. Y ademas dejaba pasar el
-- stock a negativo: bastaba con capturar mas piezas de las que hay.
--
-- Ahora las dos funciones pasan por `app.mover_inventario`, que es la unica
-- puerta. Se corrige EN LA FUENTE en vez de parchar desde Productos.
--
-- Y EL COSTO SE CONGELA AL VENDER. Sin esa foto, subir el costo el mes que
-- viene reescribiria la utilidad de todos los meses anteriores.
--
alter table venta_item add column if not exists costo_unitario_centavos bigint;
alter table venta_item add column if not exists descuento_centavos bigint not null default 0;

comment on column venta_item.costo_unitario_centavos is
  'El costo del producto EN EL MOMENTO DE VENDER. Sin esta foto, subir el costo el mes que viene '
  'reescribiria la utilidad de todos los meses anteriores.';

create or replace function public.cobrar_venta(p_venta uuid)
returns venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta venta;
  v_total bigint;
  v_item  record;
begin
  select * into v_venta from venta where id = p_venta and not eliminado;
  if v_venta.id is null then
    raise exception 'La venta no existe.' using errcode = 'no_data_found';
  end if;

  -- LOS TRES PORTEROS, en la base y no en la pantalla.
  if not app.es_miembro(v_venta.negocio_id) then
    raise exception 'Esta venta no es de tu negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_venta.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso para cobrar.' using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(v_venta.negocio_id) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_venta.estado <> 'borrador' then
    raise exception 'Esta venta ya no esta en borrador: esta %.', v_venta.estado
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL TOTAL SE CALCULA, NO SE RECIBE. Aceptar el total que manda el
  -- navegador es dejar que el cliente decida cuanto pago.
  select coalesce(sum(subtotal_centavos), 0) into v_total
  from venta_item where venta_id = p_venta;

  if v_total <= 0 then
    raise exception 'No se puede cobrar una venta sin renglones.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- LA BAJA DE INVENTARIO, POR SU PUERTA. `mover_inventario` bloquea el
  -- renglon, comprueba que alcance y deja el movimiento — las tres cosas en
  -- el mismo acto.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    perform app.mover_inventario(v_item.producto_id, 'venta', -v_item.cantidad,
                                 'Venta ' || v_venta.folio, 'venta', v_venta.id);
  end loop;

  -- EL COSTO SE CONGELA AQUI, con el del catalogo en este instante.
  update venta_item vi
     set costo_unitario_centavos = p.costo_centavos
    from producto p
   where vi.venta_id = p_venta and vi.producto_id = p.id
     and vi.costo_unitario_centavos is null;

  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                               descripcion, fecha, creado_por)
  values (v_venta.negocio_id, 'ingreso', 'venta', v_venta.id, v_total,
          'Venta ' || v_venta.folio, v_venta.fecha, auth.uid());

  update venta set estado = 'cobrada', total_centavos = v_total, cobrada_en = now()
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

create or replace function public.cancelar_venta(p_venta uuid, p_motivo text default null)
returns venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta venta;
  v_item  record;
begin
  select * into v_venta from venta where id = p_venta and not eliminado;
  if v_venta.id is null then
    raise exception 'La venta no existe.' using errcode = 'no_data_found';
  end if;
  if not app.es_miembro(v_venta.negocio_id) then
    raise exception 'Esta venta no es de tu negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_venta.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso para cancelar ventas.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_venta.estado <> 'cobrada' then
    raise exception 'Solo se cancela una venta cobrada; esta esta %.', v_venta.estado
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL INVENTARIO REGRESA CON UN MOVIMIENTO CONTRARIO, no borrando el de la
  -- venta. El de la venta ocurrio de verdad: borrarlo seria reescribir la
  -- historia para que cuadre, que es justo lo que una bitacora impide.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    perform app.mover_inventario(v_item.producto_id, 'devolucion', v_item.cantidad,
                                 'Cancelacion de venta ' || v_venta.folio, 'venta', v_venta.id);
  end loop;

  -- Y la caja NO se corrige: se le agrega el movimiento contrario.
  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                               descripcion, fecha, creado_por)
  values (v_venta.negocio_id, 'egreso', 'venta', v_venta.id, v_venta.total_centavos,
          'Cancelacion de venta ' || v_venta.folio || coalesce(' — ' || p_motivo, ''),
          current_date, auth.uid());

  update venta set estado = 'cancelada', cancelada_en = now()
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

comment on function public.cobrar_venta is
  'Todo o nada: total calculado en el servidor, inventario bajado POR SU PUERTA —con movimiento y '
  'sin dejarlo negativo—, costo congelado e ingreso en caja.';

-- =====================================================================
-- VENTAS — la operacion comercial, en un solo acto
-- =====================================================================
--
-- VENTAS ORQUESTA; NO ES DUEÑA DE CASI NADA. El cliente es de Clientes, el
-- servicio de Servicios, el producto y su stock de Productos, el cupo de
-- Cursos, el dinero de Caja. Aqui se JUNTAN, y lo unico propio es:
--
--   venta        la operacion: quien, cuando, cuanto.
--   venta_item   la FOTO de cada concepto vendido: nombre, precio y costo
--                del dia, para que la historia no se reescriba.
--   pago         COMO se pago. Varios renglones = pago mixto.
--   cotizacion   lo mismo, pero sin efecto: ni stock, ni caja, ni cupo.
--
-- LA REGLA QUE LO SOSTIENE TODO: `registrar_venta` es UNA transaccion. Valida
-- el stock, valida el cupo, calcula los totales EN EL SERVIDOR, guarda la
-- venta, mueve el inventario, inscribe en el curso, registra los pagos y mete
-- el dinero a la caja. Pasa entero o no pasa nada.
--
-- La forma obvia —varias llamadas desde el navegador— deja el sistema partido
-- en cuanto una falle: venta cobrada sin bajar stock, o stock bajado sin
-- ingreso en caja. Y nadie se entera hasta que el inventario no cuadra tres
-- meses despues.

-- ---------------------------------------------------------------------
-- LAS COLUMNAS QUE LE FALTABAN A LA VENTA
-- ---------------------------------------------------------------------
alter table venta add column if not exists vendedor_id uuid;
alter table venta add column if not exists subtotal_centavos bigint not null default 0;
alter table venta add column if not exists descuento_centavos bigint not null default 0;
alter table venta add column if not exists impuesto_centavos bigint not null default 0;
-- Lo que se recibio en efectivo. NO es el ingreso: si el cliente da mil por
-- una venta de novecientos, el ingreso son novecientos y cien son su cambio.
alter table venta add column if not exists efectivo_recibido_centavos bigint;
alter table venta add column if not exists notas text;
alter table venta add column if not exists cancelada_motivo text;

-- LA LLAVE DE IDEMPOTENCIA — contra el doble clic.
--
-- Sin esto, dos clics rapidos en "Finalizar venta" crean DOS ventas, bajan el
-- stock DOS veces y meten el dinero DOS veces a la caja. El boton deshabilitado
-- ayuda, pero no es la defensa: una red lenta reintenta sola, y la pestaña de
-- al lado no sabe nada del boton de esta.
--
-- El indice unico es la defensa de verdad: la segunda peticion con la misma
-- llave no crea nada, devuelve la venta que ya existe.
alter table venta add column if not exists llave_idempotencia text;
create unique index if not exists venta_llave_unica
  on venta (negocio_id, llave_idempotencia) where llave_idempotencia is not null;

alter table venta drop constraint if exists venta_vendedor_mismo_negocio;
alter table venta add constraint venta_vendedor_mismo_negocio
  foreign key (negocio_id, vendedor_id) references membresia (negocio_id, id)
  on delete set null (vendedor_id);

create index if not exists venta_fecha_idx on venta (negocio_id, fecha desc) where not eliminado;

-- EL METODO SE GUARDA EN LA CAJA. Tarjeta y efectivo son los dos ingresos,
-- pero solo uno esta fisicamente en el cajon: sin esta columna, un corte de
-- caja fisico tendria que adivinar cual fue cual.
alter table movimiento_caja add column if not exists metodo text;

-- ---------------------------------------------------------------------
-- LAS COTIZACIONES — lo mismo, pero SIN efecto
-- ---------------------------------------------------------------------
--
-- ENTIDAD APARTE, no una venta en estado raro. Una cotizacion guardada como
-- "venta borrador" acabaria contada en algun reporte de ingresos el dia que
-- alguien olvide filtrar el estado — y no es dinero, es una propuesta.
--
create table if not exists cotizacion (
  id                 uuid primary key default gen_random_uuid(),
  negocio_id         text not null references negocio(id) on delete cascade,
  folio              text not null,
  cliente_id         uuid,
  vendedor_id        uuid,
  fecha              date not null default current_date,
  vence              date,
  subtotal_centavos  bigint not null default 0,
  descuento_centavos bigint not null default 0,
  impuesto_centavos  bigint not null default 0,
  total_centavos     bigint not null default 0,
  estado             text not null default 'abierta'
                     check (estado in ('abierta', 'aceptada', 'vencida', 'cancelada', 'convertida')),
  notas              text,
  venta_id           uuid,
  eliminado          boolean not null default false,
  creado_en          timestamptz not null default now(),
  unique (negocio_id, folio)
);

comment on table cotizacion is
  'Entidad APARTE, no una venta en estado raro: una cotizacion guardada como venta borrador acaba '
  'contada en algun reporte de ingresos el dia que alguien olvide filtrar el estado.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cotizacion_negocio_id_unico') then
    alter table cotizacion add constraint cotizacion_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

alter table cotizacion drop constraint if exists cotizacion_cliente_mismo_negocio;
alter table cotizacion add constraint cotizacion_cliente_mismo_negocio
  foreign key (negocio_id, cliente_id) references cliente (negocio_id, id)
  on delete set null (cliente_id);

create index if not exists cotizacion_idx on cotizacion (negocio_id, fecha desc) where not eliminado;

create table if not exists cotizacion_item (
  id                       uuid primary key default gen_random_uuid(),
  negocio_id               text not null references negocio(id) on delete cascade,
  cotizacion_id            uuid not null,
  tipo                     text not null check (tipo in ('producto', 'servicio', 'curso')),
  producto_id              uuid,
  servicio_id              uuid,
  curso_id                 uuid,
  descripcion              text not null,
  cantidad                 numeric(12, 3) not null check (cantidad > 0),
  precio_unitario_centavos bigint not null check (precio_unitario_centavos >= 0),
  descuento_centavos       bigint not null default 0,
  subtotal_centavos        bigint not null check (subtotal_centavos >= 0)
);

alter table cotizacion_item drop constraint if exists ci_cotizacion_mismo_negocio;
alter table cotizacion_item add constraint ci_cotizacion_mismo_negocio
  foreign key (negocio_id, cotizacion_id) references cotizacion (negocio_id, id) on delete cascade;

create index if not exists cotizacion_item_idx on cotizacion_item (negocio_id, cotizacion_id);

alter table cotizacion      enable row level security;
alter table cotizacion      force row level security;
alter table cotizacion_item enable row level security;
alter table cotizacion_item force row level security;
revoke all on cotizacion, cotizacion_item from anon;
grant select, insert, update, delete on cotizacion, cotizacion_item to authenticated;

drop policy if exists cotizacion_leer on cotizacion;
create policy cotizacion_leer on cotizacion
  for select to authenticated using (app.es_miembro(negocio_id));
drop policy if exists cotizacion_escribir on cotizacion;
create policy cotizacion_escribir on cotizacion
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'cobrar'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'cobrar')
              and app.licencia_permite(negocio_id));

drop policy if exists cotizacion_item_leer on cotizacion_item;
create policy cotizacion_item_leer on cotizacion_item
  for select to authenticated using (app.es_miembro(negocio_id));
drop policy if exists cotizacion_item_escribir on cotizacion_item;
create policy cotizacion_item_escribir on cotizacion_item
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'cobrar'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'cobrar')
              and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- EL FOLIO DE COTIZACION — el mismo contador con candado
-- ---------------------------------------------------------------------
create or replace function public.siguiente_folio_cotizacion(p_negocio text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  insert into contador_de_folio (negocio_id, ambito, ultimo)
  values (p_negocio, 'cotizacion',
          coalesce((select max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int)
                    from cotizacion where negocio_id = p_negocio), 0) + 1)
  on conflict (negocio_id, ambito) do update
     set ultimo = contador_de_folio.ultimo + 1
  returning ultimo into v_n;
  return 'C-' || lpad(v_n::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- EL PRECIO DE UN CONCEPTO — resuelto en el SERVIDOR
-- ---------------------------------------------------------------------
--
-- El navegador manda QUE se vende y CUANTO, nunca a que precio. Aceptar el
-- precio del navegador es dejar que el cliente decida cuanto paga.
--
create or replace function app.precio_del_concepto(
  p_negocio text, p_tipo text, p_id uuid, p_hoy date
)
returns table (precio bigint, costo bigint, nombre text)
language plpgsql
stable
as $$
begin
  if p_tipo = 'producto' then
    return query
      select pr.precio_centavos, pr.costo_centavos, pr.nombre
      from producto pr
      where pr.id = p_id and pr.negocio_id = p_negocio and not pr.eliminado and pr.activo;
  elsif p_tipo = 'servicio' then
    return query
      -- La promocion la resuelve la base, no la pantalla: si cada una la
      -- resolviera, el dia que cambie la regla una cobraria de mas.
      select app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                                 s.promocion_desde, s.promocion_hasta, p_hoy),
             null::bigint, s.nombre
      from servicio s
      where s.id = p_id and s.negocio_id = p_negocio and not s.eliminado and s.activo;
  elsif p_tipo = 'curso' then
    return query
      select c.precio_centavos, null::bigint, c.nombre
      from curso c
      where c.id = p_id and c.negocio_id = p_negocio and not c.eliminado and c.activo
        and c.estado <> 'cancelado';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- REGISTRAR UNA VENTA — TODO EN UN SOLO ACTO
-- ---------------------------------------------------------------------
--
-- Esta funcion es el corazon del sistema. Hace, en una sola transaccion:
--
--   1. los porteros y el aislamiento entre centros
--   2. la IDEMPOTENCIA: la misma llave no crea dos ventas
--   3. resuelve el precio de cada concepto EN EL SERVIDOR
--   4. valida el stock de cada producto
--   5. valida el cupo de cada curso
--   6. calcula subtotal, descuento y total — el navegador no decide
--   7. comprueba que los pagos cuadren
--   8. guarda la venta con la FOTO de cada renglon (nombre, precio, costo)
--   9. mueve el inventario, con su movimiento
--  10. inscribe en el curso, si lo hay
--  11. registra los pagos y mete el dinero a la caja
--  12. deja el rastro en la bitacora
--
-- Si algo de eso falla, no queda nada a medias.
--
create or replace function public.registrar_venta(
  p_negocio text,
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
  v_venta     venta;
  v_item      jsonb;
  v_pago      jsonb;
  v_precio    bigint;
  v_costo     bigint;
  v_nombre    text;
  v_cantidad  numeric(12,3);
  v_desc      bigint;
  v_sub       bigint;
  v_subtotal  bigint := 0;
  v_total     bigint;
  v_pagado    bigint := 0;
  v_folio     text;
  v_quien     membresia;
  v_stock     int;
  v_curso     curso;
  v_ocupados  int;
  v_tipo      text;
  v_id        uuid;
  v_aplicado  bigint;
  v_falta     bigint;
  v_pago_id   uuid;
  v_sesion    uuid;
begin
  /* --- 1. Los porteros ------------------------------------------- */
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'cobrar') then
    raise exception 'No tienes permiso para cobrar.' using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite registrar operaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  /* --- 2. LA IDEMPOTENCIA ---------------------------------------- */
  -- El doble clic no crea dos ventas: la segunda encuentra la primera y la
  -- devuelve tal cual. El boton deshabilitado ayuda, pero una red lenta
  -- reintenta sola y la pestaña de al lado no sabe del boton de esta.
  if p_llave is not null then
    select * into v_venta from venta
     where negocio_id = p_negocio and llave_idempotencia = p_llave;
    if v_venta.id is not null then
      return v_venta;
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No se puede cobrar una venta sin renglones.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- El cliente tiene que ser de ESTE centro. Sin esta comprobacion se podria
  -- cargarle una venta al paciente de otro consultorio.
  if p_cliente is not null and not exists (
        select 1 from cliente where id = p_cliente and negocio_id = p_negocio and not eliminado) then
    raise exception 'Ese cliente no existe en este centro.' using errcode = 'no_data_found';
  end if;

  v_folio := siguiente_folio(p_negocio);

  insert into venta (negocio_id, folio, cliente_id, vendedor_id, fecha, estado,
                     notas, llave_idempotencia, creada_por)
  values (p_negocio, v_folio, p_cliente, p_vendedor, p_fecha, 'borrador',
          p_notas, p_llave, auth.uid())
  returning * into v_venta;

  /* --- 3 a 8. Los renglones, con el precio del SERVIDOR ----------- */
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tipo := v_item ->> 'tipo';
    v_id := (v_item ->> 'id')::uuid;
    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 1);
    v_desc := coalesce((v_item ->> 'descuento')::bigint, 0);

    if v_cantidad <= 0 then
      raise exception 'La cantidad tiene que ser mayor que cero.'
        using errcode = 'invalid_parameter_value';
    end if;

    select precio, costo, nombre into v_precio, v_costo, v_nombre
    from app.precio_del_concepto(p_negocio, v_tipo, v_id, p_fecha);

    if v_nombre is null then
      raise exception 'Uno de los conceptos no existe, no esta activo, o no es de este centro.'
        using errcode = 'no_data_found';
    end if;

    -- EL DESCUENTO NO PUEDE PASARSE DEL RENGLON. Un descuento mayor que el
    -- subtotal daria un renglon negativo, y a partir de ahi el total miente.
    if v_desc < 0 or v_desc > (v_precio * v_cantidad)::bigint then
      raise exception 'El descuento de "%" no puede pasar de su importe.', v_nombre
        using errcode = 'invalid_parameter_value';
    end if;

    v_sub := (v_precio * v_cantidad)::bigint - v_desc;
    v_subtotal := v_subtotal + v_sub;

    insert into venta_item (negocio_id, venta_id, tipo,
                            producto_id, servicio_id, curso_id,
                            descripcion, cantidad, precio_unitario_centavos,
                            costo_unitario_centavos, descuento_centavos, subtotal_centavos)
    values (p_negocio, v_venta.id, v_tipo,
            case when v_tipo = 'producto' then v_id end,
            case when v_tipo = 'servicio' then v_id end,
            case when v_tipo = 'curso'    then v_id end,
            -- LA FOTO DEL NOMBRE Y DEL PRECIO. No contradice la regla de no
            -- copiar nombres: es un dato historico distinto del actual. Si el
            -- precio sube el año que viene, el ticket del año pasado tiene que
            -- seguir diciendo lo que se cobro ese dia.
            v_nombre, v_cantidad, v_precio, v_costo, v_desc, v_sub);

    /* --- 9. El inventario, por su unica puerta -------------------- */
    if v_tipo = 'producto' then
      perform app.mover_inventario(v_id, 'venta', -v_cantidad::int,
                                   'Venta ' || v_folio, 'venta', v_venta.id);
    end if;

    /* --- 10. El cupo del curso, con el renglon bloqueado ---------- */
    if v_tipo = 'curso' then
      select * into v_curso from curso where id = v_id for update;
      v_ocupados := app.lugares_ocupados(v_id);
      if v_curso.cupo is not null and v_ocupados + v_cantidad > v_curso.cupo then
        raise exception 'El curso "%" solo tiene % lugares y ya hay % ocupados.',
          v_curso.nombre, v_curso.cupo, v_ocupados
          using errcode = 'check_violation';
      end if;
      -- UNA INSCRIPCION NECESITA PERSONA. Vender un curso "al mostrador" deja
      -- un lugar ocupado por nadie, y el sabado sobra una silla.
      if p_cliente is null then
        raise exception 'Para vender el curso "%" hace falta decir quien lo toma.', v_curso.nombre
          using errcode = 'invalid_parameter_value';
      end if;
      -- Si ya estaba inscrito no se duplica: se le cobra y ya.
      if not exists (select 1 from inscripcion
                      where curso_id = v_id and cliente_id = p_cliente and estado <> 'cancelado') then
        insert into inscripcion (negocio_id, curso_id, cliente_id, estado, origen, venta_id)
        values (p_negocio, v_id, p_cliente, 'inscrito', 'venta', v_venta.id);
      else
        update inscripcion set venta_id = v_venta.id
         where curso_id = v_id and cliente_id = p_cliente and estado <> 'cancelado';
      end if;
    end if;
  end loop;

  /* --- 6. Los totales, calculados AQUI ---------------------------- */
  if p_descuento is null or p_descuento < 0 then
    raise exception 'El descuento no puede ser negativo.' using errcode = 'invalid_parameter_value';
  end if;
  if p_descuento > v_subtotal then
    raise exception 'El descuento no puede pasar del subtotal.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- SIN IMPUESTOS CONFIGURADOS, CERO. No se inventan: si el centro los cobra,
  -- se declaran en Configuracion y la cifra sale de ahi.
  v_total := v_subtotal - p_descuento;

  update venta
     set subtotal_centavos = v_subtotal,
         descuento_centavos = p_descuento,
         impuesto_centavos = 0,
         total_centavos = v_total,
         efectivo_recibido_centavos = p_efectivo_recibido,
         estado = 'cobrada',
         cobrada_en = now()
   where id = v_venta.id
  returning * into v_venta;

  /* --- 7 y 11. Los pagos, y de ahi la caja ------------------------ */
  --
  -- VARIOS RENGLONES = PAGO MIXTO. Guardar `metodo = 'mixto'` en la venta
  -- perderia el detalle, y entonces el corte de caja no puede saber cuanto
  -- entro en efectivo.
  v_sesion := app.caja_abierta(p_negocio);

  for v_pago in select * from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) loop
    v_aplicado := (v_pago ->> 'monto')::bigint;
    if v_aplicado <= 0 then
      raise exception 'Un pago tiene que ser mayor que cero.'
        using errcode = 'invalid_parameter_value';
    end if;
    v_pagado := v_pagado + v_aplicado;

    -- EL EFECTIVO NECESITA UN CAJON ABIERTO.
    --
    -- Cobrar en efectivo sin caja abierta deja billetes en un cajon que ningun
    -- corte va a contar: al cerrar el dia sobra dinero y nadie sabe de donde
    -- salio. La tarjeta y la transferencia NO lo necesitan — ese dinero no
    -- pasa por el cajon, va al banco.
    if (v_pago ->> 'metodo') = 'efectivo' and v_sesion is null then
      raise exception 'No hay una caja abierta: no se puede cobrar en efectivo. Abre la caja en el modulo Caja.'
        using errcode = 'invalid_parameter_value';
    end if;

    insert into pago (negocio_id, venta_id, metodo, monto_centavos, fecha)
    values (p_negocio, v_venta.id, v_pago ->> 'metodo', v_aplicado, p_fecha)
    returning id into v_pago_id;

    -- LA CAJA NACE DEL PAGO, no de la venta.
    --
    -- Con el movimiento colgado de la VENTA, un pago mixto reventaba: el
    -- indice unico de la caja solo dejaba entrar el primero de los dos. Y
    -- colgarlo de la venta ademas impide saber cuanto entro en efectivo, que
    -- es justo lo que un corte de caja necesita.
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                 descripcion, fecha, metodo, sesion_id, creado_por)
    values (p_negocio, 'ingreso', 'pago', v_pago_id, v_aplicado,
            'Venta ' || v_folio, p_fecha, v_pago ->> 'metodo', v_sesion, auth.uid());
  end loop;

  -- EL CAMBIO NO ES INGRESO. Si el cliente da mil por una venta de
  -- novecientos, entraron novecientos: los cien son suyos. Por eso lo que se
  -- registra es lo APLICADO, y `efectivo_recibido` se guarda aparte solo para
  -- poder imprimir el ticket.
  v_falta := v_total - v_pagado;
  if v_falta <> 0 then
    -- El mensaje va en pesos y con dos decimales: "suman 1.0000000000" no le
    -- dice nada a quien esta cobrando en un mostrador.
    raise exception 'Los pagos suman $% y el total es $%.',
      to_char(v_pagado::numeric / 100, 'FM999999990.00'),
      to_char(v_total::numeric / 100, 'FM999999990.00')
      using errcode = 'invalid_parameter_value';
  end if;

  /* --- 12. La bitacora -------------------------------------------- */
  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'ventas', 'cobrar', v_venta.id::text, null,
          jsonb_build_object('folio', v_folio, 'total', v_total,
                             'descuento', p_descuento, 'clienteId', p_cliente));

  return v_venta;
end;
$$;

comment on function public.registrar_venta is
  'UNA transaccion: valida stock y cupo, calcula los totales EN EL SERVIDOR, guarda la foto de '
  'cada renglon, mueve el inventario, inscribe en el curso, registra los pagos y mete el dinero a '
  'la caja. Pasa entero o no pasa nada. La llave de idempotencia impide que el doble clic cobre '
  'dos veces.';

-- ---------------------------------------------------------------------
-- LAS VENTAS DE UN RANGO
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- LAS CIFRAS DEL DIA
-- ---------------------------------------------------------------------
--
-- CADA CIFRA DICE QUE CUENTA. "Ventas: 5" es transacciones; "Servicios: 3" son
-- unidades de servicio vendidas. Mezclarlas hace que dos personas lean el
-- mismo tablero y entiendan cosas distintas.
--
-- Y SOLO LAS COBRADAS. Una cancelada no es un ingreso; contarla infla el dia y
-- el mes.
--
create or replace function public.resumen_de_ventas(
  p_negocio text, p_dia date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with v as (
    select * from venta
    where negocio_id = p_negocio and fecha = p_dia and estado = 'cobrada' and not eliminado
  ),
  i as (
    select vi.* from venta_item vi join v on v.id = vi.venta_id
  )
  select jsonb_build_object(
    'ventas', (select count(*) from v),
    'totalCentavos', (select coalesce(sum(total_centavos), 0) from v),
    'servicios', (select coalesce(sum(cantidad), 0)::int from i where tipo = 'servicio'),
    'serviciosCentavos', (select coalesce(sum(subtotal_centavos), 0) from i where tipo = 'servicio'),
    'productos', (select coalesce(sum(cantidad), 0)::int from i where tipo = 'producto'),
    'productosCentavos', (select coalesce(sum(subtotal_centavos), 0) from i where tipo = 'producto'),
    'cursos', (select coalesce(sum(cantidad), 0)::int from i where tipo = 'curso'),
    'cursosCentavos', (select coalesce(sum(subtotal_centavos), 0) from i where tipo = 'curso'),
    -- El ticket promedio necesita ventas: sin ellas es `null`, no cero.
    'ticketPromedio', (
      select case when count(*) = 0 then null
                  else round(sum(total_centavos)::numeric / count(*)) end from v
    )
  );
$$;

-- ---------------------------------------------------------------------
-- LA FICHA DE UNA VENTA
-- ---------------------------------------------------------------------
create or replace function public.ficha_de_venta(p_venta uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', v.id, 'folio', v.folio, 'fecha', v.fecha, 'estado', v.estado,
    'clienteId', v.cliente_id,
    'cliente', (select c.nombre from cliente c where c.id = v.cliente_id),
    'clienteTelefono', (select c.telefono from cliente c where c.id = v.cliente_id),
    'vendedorId', v.vendedor_id,
    'vendedor', (select m.nombre from membresia m where m.id = v.vendedor_id),
    'subtotalCentavos', v.subtotal_centavos,
    'descuentoCentavos', v.descuento_centavos,
    'impuestoCentavos', v.impuesto_centavos,
    'totalCentavos', v.total_centavos,
    'efectivoRecibidoCentavos', v.efectivo_recibido_centavos,
    'notas', v.notas,
    'canceladaMotivo', v.cancelada_motivo,
    'creadoEn', v.creado_en,
    'canceladaEn', v.cancelada_en,
    -- Los renglones con su precio HISTORICO, el que se cobro ese dia.
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'tipo', i.tipo, 'descripcion', i.descripcion,
        'cantidad', i.cantidad,
        'precioUnitario', i.precio_unitario_centavos,
        'descuento', i.descuento_centavos,
        'subtotal', i.subtotal_centavos,
        -- El costo solo a quien puede verlo: con el se calcula la utilidad.
        'costoUnitario', case when app.puede_ver_costos(v.negocio_id)
                              then i.costo_unitario_centavos else null end
      ) order by i.id)
      from venta_item i where i.venta_id = v.id
    ), '[]'::jsonb),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'metodo', p.metodo, 'montoCentavos', p.monto_centavos
      ) order by p.creado_en)
      from pago p where p.venta_id = v.id
    ), '[]'::jsonb)
  )
  from venta v
  where v.id = p_venta and not v.eliminado;
$$;

-- ---------------------------------------------------------------------
-- CANCELAR UNA VENTA REGISTRADA
-- ---------------------------------------------------------------------
--
-- `cancelar_venta` ya devuelve el stock con un movimiento contrario y agrega
-- el egreso a caja. Le falta lo de Cursos —una inscripcion pagada con una
-- venta cancelada no puede seguir ocupando lugar— y lo de Caja: el dinero
-- tiene que salir POR LA MISMA VIA POR LA QUE ENTRO.
--
-- LO QUE ESTABA MAL: el egreso salia como uno solo, sin forma de pago. En una
-- venta cobrada con tarjeta eso sacaba del cajon dinero que nunca entro al
-- cajon, y el corte de esa tarde salia con un faltante inventado.
--
create or replace function public.cancelar_venta(p_venta uuid, p_motivo text default null)
returns venta
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta  venta;
  v_item   record;
  v_pago   record;
  v_sesion uuid;
begin
  select * into v_venta from venta where id = p_venta and not eliminado;
  if v_venta.id is null then
    raise exception 'La venta no existe.' using errcode = 'no_data_found';
  end if;
  if not app.es_miembro(v_venta.negocio_id) then
    raise exception 'Esta venta no es de tu negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_venta.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso para cancelar ventas.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_venta.estado <> 'cobrada' then
    raise exception 'Solo se cancela una venta cobrada; esta esta %.', v_venta.estado
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL INVENTARIO REGRESA CON UN MOVIMIENTO CONTRARIO, no borrando el de la
  -- venta: el de la venta ocurrio de verdad.
  for v_item in
    select producto_id, sum(cantidad)::int as cantidad
    from venta_item
    where venta_id = p_venta and tipo = 'producto' and producto_id is not null
    group by producto_id
  loop
    perform app.mover_inventario(v_item.producto_id, 'devolucion', v_item.cantidad,
                                 'Cancelacion de venta ' || v_venta.folio, 'venta', v_venta.id);
  end loop;

  -- LA INSCRIPCION QUE PAGO ESTA VENTA SE DA DE BAJA: si no, el lugar sigue
  -- ocupado por alguien que ya no pago y el sabado falta una silla. NO se
  -- borra: se cancela, y el rastro de que estuvo inscrita se conserva.
  update inscripcion set estado = 'cancelado'
   where venta_id = p_venta and estado <> 'cancelado';

  -- Y LA CAJA NO SE CORRIGE: se le agrega el movimiento contrario, UNO POR
  -- PAGO y con la misma forma de pago. Devolver en efectivo lo que se cobro
  -- con tarjeta sacaria del cajon dinero que nunca estuvo ahi.
  for v_pago in
    select id, metodo, monto_centavos from pago where venta_id = p_venta
  loop
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                 descripcion, fecha, metodo, sesion_id, creado_por)
    values (v_venta.negocio_id, 'egreso', 'pago', v_pago.id, v_pago.monto_centavos,
            'Cancelacion de venta ' || v_venta.folio || coalesce(' — ' || p_motivo, ''),
            current_date, v_pago.metodo,
            case when v_pago.metodo = 'efectivo' then v_sesion else app.caja_abierta(v_venta.negocio_id) end,
            auth.uid());
  end loop;

  -- Una venta SIN pagos —no puede pasar por `registrar_venta`, pero si por la
  -- ruta vieja `cobrar_venta`— deja igualmente su egreso, para que la caja no
  -- se quede con un ingreso sin contrapartida.
  if not exists (select 1 from pago where venta_id = p_venta) then
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                 descripcion, fecha, sesion_id, creado_por)
    values (v_venta.negocio_id, 'egreso', 'venta', v_venta.id, v_venta.total_centavos,
            'Cancelacion de venta ' || v_venta.folio || coalesce(' — ' || p_motivo, ''),
            current_date, v_sesion, auth.uid());
  end if;

  update venta set estado = 'cancelada', cancelada_en = now(), cancelada_motivo = p_motivo
   where id = p_venta
  returning * into v_venta;

  return v_venta;
end;
$$;

-- ---------------------------------------------------------------------
-- LAS COTIZACIONES — guardar, listar y convertir
-- ---------------------------------------------------------------------
create or replace function public.guardar_cotizacion(
  p_negocio text,
  p_items jsonb,
  p_cliente uuid default null,
  p_vendedor uuid default null,
  p_descuento bigint default 0,
  p_notas text default null,
  p_vence date default null,
  p_fecha date default current_date
)
returns cotizacion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c        cotizacion;
  v_item     jsonb;
  v_precio   bigint;
  v_costo    bigint;
  v_nombre   text;
  v_cantidad numeric(12,3);
  v_desc     bigint;
  v_sub      bigint;
  v_subtotal bigint := 0;
  v_tipo     text;
  v_id       uuid;
begin
  if not app.tiene_permiso(p_negocio, 'cobrar') then
    raise exception 'No tienes permiso para cotizar.' using errcode = 'insufficient_privilege';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una cotizacion necesita al menos un renglon.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into cotizacion (negocio_id, folio, cliente_id, vendedor_id, fecha, vence, notas)
  values (p_negocio, siguiente_folio_cotizacion(p_negocio), p_cliente, p_vendedor,
          p_fecha, p_vence, p_notas)
  returning * into v_c;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tipo := v_item ->> 'tipo';
    v_id := (v_item ->> 'id')::uuid;
    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 1);
    v_desc := coalesce((v_item ->> 'descuento')::bigint, 0);

    select precio, costo, nombre into v_precio, v_costo, v_nombre
    from app.precio_del_concepto(p_negocio, v_tipo, v_id, p_fecha);
    if v_nombre is null then
      raise exception 'Uno de los conceptos no existe o no es de este centro.'
        using errcode = 'no_data_found';
    end if;

    v_sub := (v_precio * v_cantidad)::bigint - v_desc;
    v_subtotal := v_subtotal + v_sub;

    insert into cotizacion_item (negocio_id, cotizacion_id, tipo,
                                 producto_id, servicio_id, curso_id,
                                 descripcion, cantidad, precio_unitario_centavos,
                                 descuento_centavos, subtotal_centavos)
    values (p_negocio, v_c.id, v_tipo,
            case when v_tipo = 'producto' then v_id end,
            case when v_tipo = 'servicio' then v_id end,
            case when v_tipo = 'curso'    then v_id end,
            v_nombre, v_cantidad, v_precio, v_desc, v_sub);
  end loop;

  update cotizacion
     set subtotal_centavos = v_subtotal,
         descuento_centavos = coalesce(p_descuento, 0),
         total_centavos = v_subtotal - coalesce(p_descuento, 0)
   where id = v_c.id
  returning * into v_c;

  -- UNA COTIZACION NO MUEVE NADA: ni stock, ni caja, ni cupo. Es una
  -- propuesta, no una operacion.
  return v_c;
end;
$$;

comment on function public.guardar_cotizacion is
  'Una cotizacion NO mueve nada: ni stock, ni caja, ni cupo. Es una propuesta. Al convertirla se '
  'vuelve a validar todo, porque entre la propuesta y el si pudo cambiar el precio o acabarse el '
  'producto.';

create or replace function public.cotizaciones_del_centro(
  p_negocio text, p_estado text default null, p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'folio', c.folio, 'fecha', c.fecha, 'vence', c.vence,
    'clienteId', c.cliente_id,
    'cliente', (select cl.nombre from cliente cl where cl.id = c.cliente_id),
    'vendedor', (select m.nombre from membresia m where m.id = c.vendedor_id),
    'totalCentavos', c.total_centavos,
    -- VENCIDA SE DERIVA de la fecha, no se guarda: un estado guardado a mano
    -- se queda viejo el primer lunes que nadie entra al sistema.
    'estado', case when c.estado = 'abierta' and c.vence is not null and c.vence < p_hoy
                   then 'vencida' else c.estado end,
    'ventaId', c.venta_id,
    'renglones', (select count(*) from cotizacion_item i where i.cotizacion_id = c.id)
  ) order by c.creado_en desc), '[]'::jsonb)
  from cotizacion c
  where c.negocio_id = p_negocio and not c.eliminado
    and (p_estado is null or c.estado = p_estado);
$$;

create or replace function public.items_de_cotizacion(p_cotizacion uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo', i.tipo,
    'id', coalesce(i.producto_id, i.servicio_id, i.curso_id),
    'descripcion', i.descripcion,
    'cantidad', i.cantidad,
    'precioUnitario', i.precio_unitario_centavos,
    'descuento', i.descuento_centavos,
    'subtotal', i.subtotal_centavos
  ) order by i.id), '[]'::jsonb)
  from cotizacion_item i where i.cotizacion_id = p_cotizacion;
$$;

create or replace function public.marcar_cotizacion(p_cotizacion uuid, p_estado text)
returns cotizacion
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c cotizacion;
begin
  select * into v_c from cotizacion where id = p_cotizacion and not eliminado;
  if v_c.id is null then
    raise exception 'Esa cotizacion no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_c.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso para administrar cotizaciones.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_estado not in ('abierta', 'aceptada', 'cancelada') then
    raise exception 'Ese estado de cotizacion no existe.'
      using errcode = 'invalid_parameter_value';
  end if;
  -- Una cotizacion CONVERTIDA no vuelve atras: ya hay una venta detras.
  if v_c.estado = 'convertida' then
    raise exception 'Esa cotizacion ya se convirtio en la venta.'
      using errcode = 'invalid_parameter_value';
  end if;
  update cotizacion set estado = p_estado where id = p_cotizacion returning * into v_c;
  return v_c;
end;
$$;

create or replace function public.marcar_cotizacion_convertida(p_cotizacion uuid, p_venta uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c cotizacion;
begin
  select * into v_c from cotizacion where id = p_cotizacion;
  if v_c.id is null then return; end if;
  if not app.tiene_permiso(v_c.negocio_id, 'cobrar') then
    raise exception 'No tienes permiso.' using errcode = 'insufficient_privilege';
  end if;
  update cotizacion set estado = 'convertida', venta_id = p_venta where id = p_cotizacion;
end;
$$;

-- ---------------------------------------------------------------------
-- EL CATALOGO VENDIBLE — lo unico que Ventas necesita de los tres modulos
-- ---------------------------------------------------------------------
--
-- UNA SOLA CONSULTA para servicios, productos y cursos. Ventas NO mantiene sus
-- propios catalogos: los pide. Y solo lo VENDIBLE — un producto agotado o un
-- curso lleno no se ofrece, para que el rechazo no llegue al final.
--
create or replace function public.catalogo_vendible(
  p_negocio text, p_busqueda text default null, p_tipo text default null,
  p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x order by x ->> 'nombre'), '[]'::jsonb) from (
    select jsonb_build_object(
      'tipo', 'servicio', 'id', s.id, 'nombre', s.nombre,
      'detalle', s.descripcion,
      'precioCentavos', app.precio_efectivo(s.precio_centavos, s.precio_promocional_centavos,
                                            s.promocion_desde, s.promocion_hasta, p_hoy),
      'disponible', null::int, 'codigo', null::text
    ) as x
    from servicio s
    where s.negocio_id = p_negocio and not s.eliminado and s.activo
      and (p_tipo is null or p_tipo = 'servicio')
      and (p_busqueda is null or s.nombre ilike '%' || p_busqueda || '%')

    union all
    select jsonb_build_object(
      'tipo', 'producto', 'id', pr.id, 'nombre', pr.nombre,
      'detalle', pr.descripcion,
      'precioCentavos', pr.precio_centavos,
      -- CUANTO QUEDA, para que la pantalla no ofrezca de mas y el rechazo no
      -- llegue hasta el final.
      'disponible', pr.stock_actual, 'codigo', pr.sku
    )
    from producto pr
    where pr.negocio_id = p_negocio and not pr.eliminado and pr.activo
      and (p_tipo is null or p_tipo = 'producto')
      and (p_busqueda is null or pr.nombre ilike '%' || p_busqueda || '%'
                              or pr.sku ilike '%' || p_busqueda || '%'
                              or pr.codigo_barras ilike '%' || p_busqueda || '%')

    union all
    select jsonb_build_object(
      'tipo', 'curso', 'id', c.id, 'nombre', c.nombre,
      'detalle', c.subtitulo,
      'precioCentavos', c.precio_centavos,
      'disponible', case when c.cupo is null then null
                         else greatest(c.cupo - app.lugares_ocupados(c.id), 0) end,
      'codigo', null::text
    )
    from curso c
    where c.negocio_id = p_negocio and not c.eliminado and c.activo
      and c.estado <> 'cancelado'
      -- Un curso que ya termino no se vende.
      and coalesce(c.fecha_fin, c.fecha_inicio) >= p_hoy
      and (p_tipo is null or p_tipo = 'curso')
      and (p_busqueda is null or c.nombre ilike '%' || p_busqueda || '%')
  ) t;
$$;

comment on function public.catalogo_vendible is
  'Ventas NO mantiene sus propios catalogos: los pide. Y solo lo vendible —un producto agotado o '
  'un curso lleno no se ofrece— para que el rechazo no llegue al final de la captura.';

-- =====================================================================
-- CLIENTES — el expediente comercial de una persona
-- =====================================================================

-- ---------------------------------------------------------------------
-- EL TERAPEUTA ASIGNADO — aditivo, y distinto del que atendio una cita
-- ---------------------------------------------------------------------
--
-- SON DOS CONCEPTOS DISTINTOS Y CONFUNDIRLOS BORRA HISTORIA.
--
-- `cliente.profesional_id` es con quien se atiende HABITUALMENTE hoy.
-- `cita.profesional_id` es quien atendio ESA cita, y no se toca nunca mas.
--
-- Si fueran el mismo campo, cambiar de terapeuta reescribiria quien atendio
-- las sesiones del año pasado — y entonces los reportes por terapeuta dejan
-- de significar nada.
--
alter table cliente add column if not exists profesional_id uuid;

alter table cliente drop constraint if exists cliente_profesional_mismo_negocio;
alter table cliente add constraint cliente_profesional_mismo_negocio
  foreign key (negocio_id, profesional_id) references membresia (negocio_id, id)
  -- Si esa persona deja el centro, sus clientes se quedan SIN asignar, no se
  -- borran. `set null` y no `restrict`: nadie deberia tener que reasignar
  -- doscientos expedientes a mano para poder dar de baja a alguien.
  -- `set null (columna)` y NO `set null` a secas. La llave es COMPUESTA: un
  -- `set null` pelon vacia las DOS columnas, y `negocio_id` no acepta nulos —
  -- asi que el borrado revienta y la fila de la izquierda no se puede borrar
  -- nunca. Se nombra la columna que si se debe vaciar.
  on delete set null (profesional_id);

create index if not exists cliente_profesional_idx on cliente (negocio_id, profesional_id)
  where not eliminado;
-- El buscador de la lista compara telefono y correo, no solo el nombre.
create index if not exists cliente_contacto_idx on cliente (negocio_id, telefono, correo)
  where not eliminado;

-- ---------------------------------------------------------------------
-- LAS DOS REGLAS DEL DOMINIO, ESCRITAS UNA SOLA VEZ
-- ---------------------------------------------------------------------
--
-- "Activo" y "frecuente" no son opiniones de una pantalla: son reglas del
-- negocio. Si Clientes contara una cosa y Reportes otra, los dos numeros
-- serian verdad y nadie sabria cual usar.
--
-- Viven aqui, en la base, para que cualquier modulo que las necesite las
-- pregunte en vez de reinventarlas.
--
create or replace function app.meses_de_actividad() returns int
  language sql immutable as $$ select 6 $$;

create or replace function app.visitas_para_ser_frecuente() returns int
  language sql immutable as $$ select 5 $$;

comment on function app.meses_de_actividad() is
  'Un cliente esta ACTIVO si tuvo una cita completada en este plazo. Seis meses: en un centro de '
  'terapias, alguien que vino en marzo y estamos en agosto sigue siendo cliente, no un desconocido.';
comment on function app.visitas_para_ser_frecuente() is
  'Cuantas sesiones completadas hacen a alguien FRECUENTE. Cuando exista Configuracion, sale de ahi.';

-- ---------------------------------------------------------------------
-- EL PROXIMO CUMPLEAÑOS, con el 29 de febrero resuelto
-- ---------------------------------------------------------------------
--
-- `make_date(2027, 2, 29)` REVIENTA: ese dia no existe. Sin esto, un solo
-- paciente nacido en año bisiesto tumba el panel de cumpleaños entero tres
-- de cada cuatro años — y el error aparece en una pantalla que no habla de
-- fechas.
--
-- Se corre al 28 y no al 1 de marzo: es lo que hace la gente.
--
create or replace function app.cumple_en(p_nacimiento date, p_anio int)
returns date
language sql
immutable
as $$
  select case
    when extract(month from p_nacimiento) = 2 and extract(day from p_nacimiento) = 29
         and not (p_anio % 4 = 0 and (p_anio % 100 <> 0 or p_anio % 400 = 0))
      then make_date(p_anio, 2, 28)
    else make_date(p_anio, extract(month from p_nacimiento)::int,
                           extract(day from p_nacimiento)::int)
  end;
$$;

create or replace function app.proximo_cumpleanos(p_nacimiento date, p_hoy date)
returns date
language sql
immutable
as $$
  -- El de este año si todavia no pasa; si ya paso, el del que viene. Asi el
  -- 30 de diciembre se ven los cumpleaños de enero.
  select case
    when app.cumple_en(p_nacimiento, extract(year from p_hoy)::int) >= p_hoy
      then app.cumple_en(p_nacimiento, extract(year from p_hoy)::int)
    else app.cumple_en(p_nacimiento, extract(year from p_hoy)::int + 1)
  end;
$$;

-- ---------------------------------------------------------------------
-- LA LISTA DE CLIENTES — buscada, filtrada y paginada EN LA BASE
-- ---------------------------------------------------------------------
--
-- POR QUE NO SE BAJA LA TABLA Y SE FILTRA EN EL NAVEGADOR: porque funciona
-- perfecto con veinte clientes y se cae con dos mil. Y peor: para pintar
-- "ultima visita" y "visitas" habria que pedir el historial de cada uno —el
-- problema N+1 en su forma mas cara, una consulta por renglon.
--
-- Aqui las dos cifras salen en la MISMA consulta, ya calculadas.
--
-- NADA DE ESTO SE GUARDA EN `cliente`. `ultima_visita` y `visitas` se cuentan
-- cada vez: un contador a mano se desincroniza a la primera cita cancelada.
--
-- `security invoker` a proposito: las reglas de fila se aplican a quien llama.
-- Un centro no puede pedir los pacientes de otro ni equivocandose.
--
create or replace function public.clientes_del_centro(
  p_negocio text,
  p_busqueda text default null,
  p_estado text default null,
  p_profesional uuid default null,
  p_visitas_min int default null,
  p_visitas_max int default null,
  p_pagina int default 1,
  p_por_pagina int default 10,
  p_hoy date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select
      c.id, c.nombre, c.telefono, c.correo, c.fecha_nacimiento,
      c.profesional_id, c.eliminado, c.creado_en,
      coalesce(x.visitas, 0) as visitas,
      x.ultima_visita
    from cliente c
    left join lateral (
      select count(*)::int as visitas, max(v.fecha) as ultima_visita
      from cita v
      where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado
    ) x on true
    where c.negocio_id = p_negocio
  ),
  conestado as (
    select b.*,
      case
        -- ARCHIVADO gana sobre todo lo demas: un expediente guardado no es
        -- "inactivo", es uno que alguien decidio sacar de la lista.
        when b.eliminado then 'archivado'
        when b.ultima_visita is not null
             and b.ultima_visita >= p_hoy - (app.meses_de_actividad() * 30) then 'activo'
        else 'inactivo'
      end as estado
    from base b
  ),
  filtrado as (
    select x.* from conestado x
    where
      -- Los archivados NO salen salvo que se pidan por su nombre. Si salieran
      -- mezclados, la lista contaria gente que ya nadie atiende.
      (x.estado <> 'archivado' or p_estado = 'archivado')
      and (p_estado is null or p_estado = '' or x.estado = p_estado)
      and (p_profesional is null or x.profesional_id = p_profesional)
      and (p_visitas_min is null or x.visitas >= p_visitas_min)
      and (p_visitas_max is null or x.visitas <= p_visitas_max)
      and (
        p_busqueda is null or p_busqueda = ''
        or x.nombre ilike '%' || p_busqueda || '%'
        or coalesce(x.telefono, '') ilike '%' || p_busqueda || '%'
        or coalesce(x.correo, '') ilike '%' || p_busqueda || '%'
      )
  )
  select jsonb_build_object(
    -- El total va SIN paginar: es lo que sostiene "Mostrando 10 de 340".
    'total', (select count(*) from filtrado),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'nombre', f.nombre,
        'telefono', f.telefono,
        'correo', f.correo,
        'fechaNacimiento', f.fecha_nacimiento,
        'profesionalId', f.profesional_id,
        -- El nombre del terapeuta se RESUELVE al leer, no se copia.
        'profesional', (select m.nombre from membresia m where m.id = f.profesional_id),
        'visitas', f.visitas,
        'ultimaVisita', f.ultima_visita,
        'estado', f.estado,
        'creadoEn', f.creado_en
      ) order by f.nombre)
      from (
        select * from filtrado
        order by nombre
        limit greatest(coalesce(p_por_pagina, 10), 1)
        offset greatest(coalesce(p_pagina, 1) - 1, 0) * greatest(coalesce(p_por_pagina, 10), 1)
      ) f
    ), '[]'::jsonb)
  );
$$;

comment on function public.clientes_del_centro is
  'La lista con "ultima visita" y "visitas" YA CALCULADAS, en una sola consulta. Bajar la tabla y '
  'contar en el navegador funciona con veinte clientes y se cae con dos mil.';

-- ---------------------------------------------------------------------
-- EL RESUMEN DE CLIENTES — las cinco tarjetas y el pie, en un viaje
-- ---------------------------------------------------------------------
create or replace function public.resumen_clientes(p_negocio text, p_hoy date default current_date)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with vivos as (
    select c.* from cliente c where c.negocio_id = p_negocio and not c.eliminado
  ),
  visitas as (
    select v.cliente_id, count(*)::int as n, max(v.fecha) as ultima
    from cita v
    where v.negocio_id = p_negocio and v.estado = 'completada' and not v.eliminado
    group by v.cliente_id
  ),
  -- El adeudo de cada venta cobrada: lo que se cobro menos lo que se ha
  -- pagado. La verdad financiera vive en venta y pago; aqui solo se suma.
  saldos as (
    select ve.id, ve.total_centavos - coalesce((
      select sum(pg.monto_centavos) from pago pg where pg.venta_id = ve.id
    ), 0) as saldo
    from venta ve
    where ve.negocio_id = p_negocio and ve.estado = 'cobrada' and not ve.eliminado
      and ve.cliente_id is not null
  )
  select jsonb_build_object(
    'total', (select count(*) from vivos),
    'activos', (
      select count(*) from vivos c join visitas v on v.cliente_id = c.id
      where v.ultima >= p_hoy - (app.meses_de_actividad() * 30)
    ),
    -- NUEVOS ESTE MES se calcula, no se guarda un `es_nuevo` que despues
    -- nadie apaga el dia primero del mes siguiente.
    'nuevosEsteMes', (
      select count(*) from vivos c
      where c.creado_en >= date_trunc('month', p_hoy::timestamp)
        and c.creado_en < date_trunc('month', p_hoy::timestamp) + interval '1 month'
    ),
    'frecuentes', (
      select count(*) from vivos c join visitas v on v.cliente_id = c.id
      where v.n >= app.visitas_para_ser_frecuente()
    ),
    -- SOLO LAS COMPLETADAS son una visita. Una cancelada no es una visita, y
    -- una pendiente todavia no ha pasado.
    'totalVisitas', coalesce((select sum(v.n) from visitas v), 0),
    'citasProximas', (
      select count(*) from cita
      where negocio_id = p_negocio and not eliminado
        and estado in ('pendiente', 'confirmada')
        and fecha >= p_hoy and fecha <= p_hoy + 7
    ),
    'serviciosContratados', coalesce((
      select sum(vi.cantidad)::int from venta_item vi
      join venta ve on ve.id = vi.venta_id
      where vi.negocio_id = p_negocio and vi.tipo = 'servicio'
        and ve.estado = 'cobrada' and not ve.eliminado and ve.cliente_id is not null
    ), 0),
    'comprasRealizadas', (
      select count(*) from venta
      where negocio_id = p_negocio and estado = 'cobrada' and not eliminado
        and cliente_id is not null
    ),
    'cursosInscritos', (
      select count(*) from inscripcion
      where negocio_id = p_negocio and estado <> 'cancelado'
    ),
    -- Un saldo NEGATIVO —pagaron de mas— no resta del adeudo total: se
    -- ignora. Si restara, un anticipo de un cliente taparia la deuda de otro.
    'totalAdeudos', coalesce((select sum(s.saldo) from saldos s where s.saldo > 0), 0),
    'cumpleanos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'nombre', k.nombre, 'fecha', k.proximo, 'enDias', k.en_dias
      ) order by k.en_dias, k.nombre)
      from (
        select c.id, c.nombre,
          app.proximo_cumpleanos(c.fecha_nacimiento, p_hoy) as proximo,
          (app.proximo_cumpleanos(c.fecha_nacimiento, p_hoy) - p_hoy)::int as en_dias
        from vivos c
        where c.fecha_nacimiento is not null
      ) k
      where k.en_dias <= 30
      limit 5
    ), '[]'::jsonb)
  );
$$;

comment on function public.resumen_clientes is
  'Las cinco tarjetas y el pie del modulo Clientes en un solo viaje. Ninguna cifra esta guardada: '
  'todas se cuentan desde su modulo dueño.';

-- ---------------------------------------------------------------------
-- EL EXPEDIENTE DE UNA PERSONA — lo que Clientes UNE, no lo que guarda
-- ---------------------------------------------------------------------
--
-- Cada cifra viene de su modulo: las visitas de Agenda, las compras de
-- Ventas, el adeudo de Ventas menos Pagos, los cursos de Inscripciones.
-- Clientes no guarda ni una.
--
create or replace function public.expediente_del_cliente(
  p_cliente uuid, p_hoy date default current_date
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
    'telefono', c.telefono,
    'correo', c.correo,
    'fechaNacimiento', c.fecha_nacimiento,
    'notas', c.notas,
    'clienteDesde', c.creado_en,
    'archivado', c.eliminado,
    'profesionalId', c.profesional_id,
    'profesional', (select m.nombre from membresia m where m.id = c.profesional_id),
    'visitas', (select count(*) from cita v
                 where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado),
    'canceladas', (select count(*) from cita v
                    where v.cliente_id = c.id and v.estado = 'cancelada' and not v.eliminado),
    'noAsistio', (select count(*) from cita v
                   where v.cliente_id = c.id and v.estado = 'no_asistio' and not v.eliminado),
    'ultimaVisita', (select jsonb_build_object('fecha', v.fecha, 'servicio', s.nombre)
                      from cita v join servicio s on s.id = v.servicio_id
                      where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado
                      order by v.fecha desc, v.hora_inicio desc limit 1),
    'proximaCita', (select jsonb_build_object('id', v.id, 'fecha', v.fecha,
                                              'hora', v.hora_inicio, 'servicio', s.nombre)
                     from cita v join servicio s on s.id = v.servicio_id
                     where v.cliente_id = c.id and not v.eliminado
                       and v.estado in ('pendiente', 'confirmada') and v.fecha >= p_hoy
                     order by v.fecha, v.hora_inicio limit 1),
    'compras', (select count(*) from venta ve
                 where ve.cliente_id = c.id and ve.estado = 'cobrada' and not ve.eliminado),
    'totalGastado', coalesce((select sum(ve.total_centavos) from venta ve
                               where ve.cliente_id = c.id and ve.estado = 'cobrada'
                                 and not ve.eliminado), 0),
    'adeudo', greatest(coalesce((
      select sum(ve.total_centavos - coalesce((
        select sum(pg.monto_centavos) from pago pg where pg.venta_id = ve.id
      ), 0))
      from venta ve
      where ve.cliente_id = c.id and ve.estado = 'cobrada' and not ve.eliminado
    ), 0), 0),
    'cursos', (select count(*) from inscripcion i
                where i.cliente_id = c.id and i.estado <> 'cancelado'),
    -- Los servicios que ESTA persona ha recibido, contados desde sus citas
    -- completadas. No hay ninguna lista de textos guardada en el cliente.
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', y.nombre, 'veces', y.veces)
                       order by y.veces desc, y.nombre)
      from (
        select s.nombre, count(*)::int as veces
        from cita v join servicio s on s.id = v.servicio_id
        where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado
        group by s.nombre
        limit 5
      ) y
    ), '[]'::jsonb)
  )
  from cliente c
  where c.id = p_cliente;
$$;

comment on function public.expediente_del_cliente is
  'El expediente UNE lo que ya vive en otros modulos. Ni una de estas cifras esta guardada en la '
  'tabla cliente: se cuentan desde citas, ventas, pagos e inscripciones.';

-- =====================================================================
-- LA AGENDA
-- =====================================================================

-- ---------------------------------------------------------------------
-- LAS CITAS DE UN RANGO — una sola consulta para cualquier vista
-- ---------------------------------------------------------------------
--
-- Dia, semana y mes son el MISMO viaje al servidor con distinto rango. Sin
-- esto, la vista de mes haria una consulta por dia —treinta y un viajes— y
-- ademas una consulta por cita para resolver el nombre del paciente: el
-- problema N+1 en su forma mas clasica.
--
-- Los nombres se RESUELVEN al leer, no se copian al guardar. Si mañana esa
-- paciente se cambia el apellido, la agenda de hace tres meses tambien lo
-- muestra bien, porque nunca guardo una copia.
--
-- `security invoker` a proposito: las reglas de fila se aplican a quien
-- llama. Un centro no puede pedir la agenda de otro ni equivocandose.
--
create or replace function public.citas_del_rango(
  p_negocio text,
  p_desde date,
  p_hasta date,
  p_profesional uuid default null,
  p_servicio uuid default null,
  p_estado text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x order by x->>'fecha', x->>'horaInicio'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', c.id,
      'fecha', c.fecha,
      'horaInicio', to_char(c.hora_inicio, 'HH24:MI'),
      'horaFin', to_char(c.hora_fin, 'HH24:MI'),
      'estado', c.estado,
      'notas', c.notas,
      'clienteId', c.cliente_id,
      'cliente', cl.nombre,
      'clienteTelefono', cl.telefono,
      'clienteCorreo', cl.correo,
      'servicioId', c.servicio_id,
      'servicio', s.nombre,
      -- LA DURACION APLICADA, no la del catalogo de hoy.
      --
      -- Si un servicio pasa de 60 a 90 minutos, las citas del año pasado
      -- duraron 60. Leer `s.duracion_min` las reescribiria en pantalla y el
      -- reporte de ocupacion del año pasado cambiaria solo. La cita ya guarda
      -- su hora de inicio y de fin: esa resta ES el dato historico.
      'servicioMinutos', extract(epoch from (c.hora_fin - c.hora_inicio))::int / 60,
      'servicioPrecio', s.precio_centavos,
      'profesionalId', c.profesional_id,
      'profesional', m.nombre
    ) as x
    from cita c
    join cliente cl on cl.id = c.cliente_id
    join servicio s on s.id = c.servicio_id
    left join membresia m on m.id = c.profesional_id
    where c.negocio_id = p_negocio
      and not c.eliminado
      and c.fecha between p_desde and p_hasta
      and (p_profesional is null or c.profesional_id = p_profesional)
      and (p_servicio is null or c.servicio_id = p_servicio)
      and (p_estado is null or c.estado = p_estado)
  ) t;
$$;

-- ---------------------------------------------------------------------
-- EL HISTORIAL DE UN PACIENTE — calculado, nunca guardado
-- ---------------------------------------------------------------------
--
-- "Total de citas: 8" no se guarda en ningun lado. Un contador a mano se
-- desincroniza a la primera cancelacion y a partir de ahi nadie sabe cual de
-- los dos numeros es el bueno.
--
-- Que cuenta como cita historica: las COMPLETADAS. Una cancelada no fue una
-- sesion, y una que no se atendio tampoco — aunque las dos se conservan y se
-- cuentan aparte, porque para el negocio no son lo mismo.
--
create or replace function public.historial_del_cliente(p_cliente uuid, p_ahora timestamptz default now())
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'completadas', count(*) filter (where c.estado = 'completada'),
    'canceladas', count(*) filter (where c.estado = 'cancelada'),
    'noAsistio', count(*) filter (where c.estado = 'no_asistio'),
    'ultima', (
      select jsonb_build_object('fecha', u.fecha, 'servicio', su.nombre)
      from cita u join servicio su on su.id = u.servicio_id
      where u.cliente_id = p_cliente and not u.eliminado and u.estado = 'completada'
      order by u.fecha desc, u.hora_inicio desc limit 1
    ),
    -- La proxima: futura, no cancelada, la mas cercana. Tampoco se guarda.
    'proxima', (
      select jsonb_build_object(
        'id', p.id, 'fecha', p.fecha,
        'hora', to_char(p.hora_inicio, 'HH24:MI'), 'servicio', sp.nombre)
      from cita p join servicio sp on sp.id = p.servicio_id
      where p.cliente_id = p_cliente and not p.eliminado
        and p.estado in ('pendiente', 'confirmada')
        and (p.fecha + p.hora_inicio) > p_ahora
      order by p.fecha, p.hora_inicio limit 1
    )
  )
  from cita c
  where c.cliente_id = p_cliente and not c.eliminado;
$$;

-- ---------------------------------------------------------------------
-- REAGENDAR — mueve la cita, no crea otra
-- ---------------------------------------------------------------------
--
-- Reagendar creando una cita nueva y cancelando la vieja duplica el
-- historial del paciente: aparecen dos citas donde hubo una. Aqui se MUEVE
-- la misma, y el cambio queda firmado en la bitacora con el antes y el
-- despues, que es lo que permite reconstruir que paso tres meses despues.
--
create or replace function public.reagendar_cita(
  p_cita uuid, p_fecha date, p_hora_inicio time,
  p_profesional uuid default null, p_motivo text default null
)
returns cita
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cita     cita;
  v_antes    jsonb;
  v_duracion int;
  v_quien    membresia;
begin
  select * into v_cita from cita where id = p_cita and not eliminado;
  if v_cita.id is null then
    raise exception 'La cita no existe.' using errcode = 'no_data_found';
  end if;

  -- Los porteros van AQUI: un `security definer` se salta las reglas de fila,
  -- asi que sin esto cualquiera con sesion movería citas de otro centro.
  if not app.es_miembro(v_cita.negocio_id) then
    raise exception 'Esa cita no es de tu centro.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_cita.negocio_id, 'gestionarAgenda') then
    raise exception 'No tienes permiso para mover citas.' using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(v_cita.negocio_id) then
    raise exception 'La licencia no permite registrar operaciones.' using errcode = 'insufficient_privilege';
  end if;
  if v_cita.estado in ('cancelada', 'completada') then
    raise exception 'Una cita % ya no se puede mover.', v_cita.estado
      using errcode = 'invalid_parameter_value';
  end if;

  v_antes := jsonb_build_object(
    'fecha', v_cita.fecha, 'horaInicio', v_cita.hora_inicio, 'profesionalId', v_cita.profesional_id);

  select duracion_min into v_duracion from servicio where id = v_cita.servicio_id;

  update cita
     set fecha = p_fecha,
         hora_inicio = p_hora_inicio,
         -- La hora de fin se recalcula desde la duracion del servicio. Si se
         -- arrastrara la anterior, mover una cita de 90 minutos a otra hora
         -- podria dejarla de 30.
         hora_fin = p_hora_inicio + make_interval(mins => coalesce(v_duracion, 60)),
         profesional_id = coalesce(p_profesional, v_cita.profesional_id),
         actualizado_en = now()
   where id = p_cita
  returning * into v_cita;

  /**
   * LOS RECORDATORIOS DE ESA CITA SE MUEVEN CON ELLA, y va DENTRO de la misma
   * transaccion a proposito.
   *
   * Hacerlo desde el navegador —mover la cita, luego mover el recordatorio—
   * tiene una ventana: si la red se cae en medio, la cita queda el martes y su
   * recordatorio sigue avisando del lunes. Nadie se entera hasta que el aviso
   * sale con la fecha vieja. Aqui pasa entero o no pasa.
   *
   * Se conserva el DESFASE: un recordatorio puesto para el dia anterior sigue
   * quedando el dia anterior a la fecha nueva. Empujarlos todos a la fecha de
   * la cita convertiria un "confirmar 24 horas antes" en un aviso el mismo dia.
   *
   * Solo los PENDIENTES. Uno ya hecho es historia y no se reescribe.
   */
  update recordatorio r
     set fecha = p_fecha - ((v_antes->>'fecha')::date - r.fecha)
   where r.negocio_id = v_cita.negocio_id
     and r.entidad_tipo = 'cita'
     and r.entidad_id = p_cita
     and r.estado = 'pendiente'
     and not r.eliminado;

  select * into v_quien from membresia
   where negocio_id = v_cita.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues, motivo)
  values (v_cita.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'), 'agenda', 'reagendar', p_cita::text, v_antes,
          jsonb_build_object('fecha', v_cita.fecha, 'horaInicio', v_cita.hora_inicio,
                             'profesionalId', v_cita.profesional_id),
          p_motivo);

  return v_cita;
end;
$$;

-- ---------------------------------------------------------------------
-- CAMBIAR EL ESTADO — confirmar, completar, cancelar, no asistio
-- ---------------------------------------------------------------------
--
-- Una sola puerta para los cuatro, porque los cuatro comparten las mismas
-- comprobaciones y el mismo rastro. Y porque asi las transiciones imposibles
-- —revivir una cancelada, completar algo que no ha pasado— se rechazan en un
-- solo lugar en vez de en cuatro pantallas distintas.
--
create or replace function public.cambiar_estado_cita(
  p_cita uuid, p_estado text, p_motivo text default null
)
returns cita
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cita  cita;
  v_antes text;
  v_quien membresia;
begin
  select * into v_cita from cita where id = p_cita and not eliminado;
  if v_cita.id is null then
    raise exception 'La cita no existe.' using errcode = 'no_data_found';
  end if;
  if not app.es_miembro(v_cita.negocio_id) then
    raise exception 'Esa cita no es de tu centro.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_cita.negocio_id, 'gestionarAgenda') then
    raise exception 'No tienes permiso para cambiar citas.' using errcode = 'insufficient_privilege';
  end if;

  if p_estado not in ('pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio') then
    raise exception 'Estado desconocido: %', p_estado using errcode = 'invalid_parameter_value';
  end if;

  -- Una cita cancelada NO revive. Si la persona vuelve a agendar, es una
  -- cita nueva: si se reviviera, el horario que ya se le dio a alguien mas
  -- quedaria con dos citas y la restriccion de choque lo rechazaria en un
  -- lugar donde el mensaje no ayuda a nadie.
  if v_cita.estado = 'cancelada' and p_estado <> 'cancelada' then
    raise exception 'Una cita cancelada no se reactiva: se agenda una nueva.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_antes := v_cita.estado;

  update cita set estado = p_estado, actualizado_en = now(),
                  notas = case when p_motivo is null then notas
                               else coalesce(notas || E'\n', '') || p_motivo end
   where id = p_cita
  returning * into v_cita;

  /**
   * UNA CITA QUE SE CIERRA APAGA SUS RECORDATORIOS PENDIENTES.
   *
   * El caso concreto: se cancela la cita del jueves y al dia siguiente sale
   * igual el recordatorio de confirmarla. La paciente recibe un aviso de una
   * cita que ya no existe, y a partir de ahi deja de creerles a los avisos.
   *
   * Se marcan `descartado`, NO se borran: el recordatorio siguio existiendo y
   * borrarlo dejaria un hueco en el rastro de por que nadie la confirmo.
   *
   * "Completada" tambien los apaga: recordar confirmar una cita que ya se dio
   * no le sirve a nadie. "No asistio" igual — esa cita ya termino.
   */
  if p_estado in ('cancelada', 'completada', 'no_asistio') then
    update recordatorio
       set estado = 'descartado'
     where negocio_id = v_cita.negocio_id
       and entidad_tipo = 'cita'
       and entidad_id = p_cita
       and estado = 'pendiente'
       and not eliminado;
  end if;

  select * into v_quien from membresia
   where negocio_id = v_cita.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues, motivo)
  values (v_cita.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'), 'agenda', 'estado', p_cita::text,
          jsonb_build_object('estado', v_antes), jsonb_build_object('estado', p_estado), p_motivo);

  return v_cita;
end;
$$;


-- =====================================================================
-- CAJA — el cajón, y la diferencia entre dinero y dinero FÍSICO
-- =====================================================================
--
-- LA DISTINCION QUE SOSTIENE TODO EL MODULO, y la que casi nadie hace:
--
--   INGRESO DEL NEGOCIO   toda venta cobrada, con el metodo que sea.
--   EFECTIVO EN EL CAJON  solo lo que se pago en efectivo.
--
-- Una venta de mil pesos con tarjeta es un ingreso de mil pesos y CERO
-- efectivo. Si el sistema las suma juntas, al cerrar el dia el cajon dice que
-- deberia haber seis mil y hay dos mil — y nadie sabe si falto dinero o falto
-- entender el numero. Por eso el corte compara SOLO efectivo, y las demas
-- formas de pago se enseñan aparte.
--
-- LO QUE ES NUEVO AQUI:
--
--   sesion_caja   la caja abierta: quien, cuando, con cuanto empezo, y —al
--                 cerrar— cuanto se esperaba, cuanto se conto y la diferencia.
--
-- Y `movimiento_caja` gana tres columnas: a que sesion pertenece, la
-- categoria de los movimientos capturados a mano, y sus notas.
--
-- LA CAJA SIGUE SIENDO DERIVADA. Ni la sesion ni el movimiento guardan un
-- saldo: el saldo se suma de los movimientos cada vez que se pide. Un saldo
-- guardado se desincroniza —es cuestion de semanas— y cuando lo hace nadie
-- sabe cual de los dos numeros creer.

-- ---------------------------------------------------------------------
-- LA SESION DE CAJA
-- ---------------------------------------------------------------------
create table if not exists sesion_caja (
  id                     uuid primary key default gen_random_uuid(),
  negocio_id             text not null references negocio(id) on delete cascade,
  nombre                 text not null,
  estado                 text not null default 'abierta'
                         check (estado in ('abierta', 'cerrada')),
  saldo_inicial_centavos bigint not null default 0 check (saldo_inicial_centavos >= 0),
  abierta_por            uuid,
  abierta_en             timestamptz not null default now(),
  cerrada_por            uuid,
  cerrada_en             timestamptz,
  -- LO QUE EL SISTEMA DIJO que debia haber en efectivo, congelado al cerrar.
  -- Se congela a proposito: si se recalculara al abrir el historial, un
  -- movimiento agregado despues cambiaria un corte ya firmado.
  esperado_centavos      bigint,
  contado_centavos       bigint,
  diferencia_centavos    bigint,
  observaciones          text,
  notas_cierre           text,
  creado_en              timestamptz not null default now()
);

comment on table sesion_caja is
  'La caja abierta. No guarda saldo: el saldo se suma de los movimientos. Un saldo guardado se '
  'desincroniza y entonces nadie sabe cual de los dos numeros creer. Lo unico que SI se congela es '
  'el corte —esperado, contado y diferencia— porque un corte firmado no puede cambiar despues.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sesion_caja_negocio_id_unico') then
    alter table sesion_caja add constraint sesion_caja_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

-- UNA SOLA CAJA ABIERTA POR CENTRO, y lo garantiza la base.
--
-- Con dos abiertas, cada venta tendria que elegir a cual va y la primera vez
-- que alguien elija mal el corte no cuadra. Comprobarlo en la pantalla no
-- sirve: dos personas abriendo caja a la vez pasan las dos comprobaciones.
create unique index if not exists sesion_caja_una_abierta
  on sesion_caja (negocio_id) where estado = 'abierta';

create index if not exists sesion_caja_historial_idx
  on sesion_caja (negocio_id, abierta_en desc);

alter table sesion_caja drop constraint if exists sesion_caja_abre_mismo_negocio;
alter table sesion_caja add constraint sesion_caja_abre_mismo_negocio
  foreign key (negocio_id, abierta_por) references membresia (negocio_id, id)
  on delete set null (abierta_por);

alter table sesion_caja drop constraint if exists sesion_caja_cierra_mismo_negocio;
alter table sesion_caja add constraint sesion_caja_cierra_mismo_negocio
  foreign key (negocio_id, cerrada_por) references membresia (negocio_id, id)
  on delete set null (cerrada_por);

-- ---------------------------------------------------------------------
-- LO QUE LE FALTABA AL MOVIMIENTO
-- ---------------------------------------------------------------------
-- A QUE CAJA pertenece. Nulo en los movimientos de antes de este bloque y en
-- los que ocurren sin caja abierta: esos existen —son ingresos del negocio—
-- pero no cuentan para ningun corte.
alter table movimiento_caja add column if not exists sesion_id uuid;
-- La categoria SOLO de los movimientos capturados a mano. La de una venta se
-- deduce de lo que se vendio y la de un gasto sale del gasto: copiarlas aqui
-- las dejaria viejas el dia que cambien.
alter table movimiento_caja add column if not exists categoria text;
alter table movimiento_caja add column if not exists notas text;

alter table movimiento_caja drop constraint if exists movimiento_caja_sesion_mismo_negocio;
alter table movimiento_caja add constraint movimiento_caja_sesion_mismo_negocio
  foreign key (negocio_id, sesion_id) references sesion_caja (negocio_id, id)
  on delete set null (sesion_id);

create index if not exists movimiento_caja_sesion_idx on movimiento_caja (sesion_id);

alter table sesion_caja enable row level security;
alter table sesion_caja force row level security;
revoke all on sesion_caja from anon;
grant select, insert, update on sesion_caja to authenticated;

-- UNA CAJA NO SE BORRA. Es el respaldo de un corte firmado.
revoke delete on sesion_caja from authenticated, anon, service_role;

drop policy if exists sesion_caja_leer on sesion_caja;
create policy sesion_caja_leer on sesion_caja
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists sesion_caja_abrir on sesion_caja;
create policy sesion_caja_abrir on sesion_caja
  for insert to authenticated
  with check (app.es_miembro(negocio_id)
              and app.tiene_permiso(negocio_id, 'verFinanzas')
              and app.licencia_permite(negocio_id));

-- UNA CAJA CERRADA NO SE VUELVE A TOCAR. El `using` lo impide en la base, no
-- en la pantalla: reabrir un corte firmado para "arreglar" un faltante es
-- exactamente lo que un registro financiero tiene que hacer imposible.
drop policy if exists sesion_caja_cerrar on sesion_caja;
create policy sesion_caja_cerrar on sesion_caja
  for update to authenticated
  using (app.es_miembro(negocio_id)
         and app.tiene_permiso(negocio_id, 'verFinanzas')
         and estado = 'abierta')
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

-- ---------------------------------------------------------------------
-- QUIEN PUEDE METER UN MOVIMIENTO A MANO
-- ---------------------------------------------------------------------
--
-- LA REGLA DE ANTES ERA `origen = 'ajuste'` A SECAS, y dependia de que el rol
-- dueño de la base se saltara las reglas de fila para que las funciones
-- pudieran escribir los movimientos de venta y de gasto. Eso funciona en
-- Postgres local y en Supabase, pero es una suposicion sobre la instalacion —
-- y si un dia deja de cumplirse, cobrar deja de meter el dinero a la caja.
--
-- Ahora la regla dice lo mismo pero sin depender de eso: se puede escribir un
-- movimiento de venta o de gasto SOLO si la operacion existe de verdad y es
-- de este centro. Sigue siendo imposible capturar un ingreso suelto, y el
-- indice unico sigue impidiendo meter el mismo dinero dos veces.
drop policy if exists caja_ajuste on movimiento_caja;
create policy caja_ajuste on movimiento_caja
  for insert to authenticated
  with check (
    app.es_miembro(negocio_id)
    and app.tiene_permiso(negocio_id, 'verFinanzas')
    and app.licencia_permite(negocio_id)
    and (
      -- Lo unico que se captura a mano: un ajuste, sin operacion detras y
      -- marcado como tal.
      (origen = 'ajuste' and referencia_id is null)
      -- Y lo que escriben las funciones, siempre contra algo que existe.
      or (origen = 'pago' and exists (
            select 1 from pago p join venta v on v.id = p.venta_id
             where p.id = referencia_id and v.negocio_id = movimiento_caja.negocio_id))
      or (origen = 'venta' and exists (
            select 1 from venta v
             where v.id = referencia_id and v.negocio_id = movimiento_caja.negocio_id))
      or (origen = 'gasto' and exists (
            select 1 from gasto g
             where g.id = referencia_id and g.negocio_id = movimiento_caja.negocio_id))
    )
  );

-- ---------------------------------------------------------------------
-- EL GASTO TAMBIEN TIENE FORMA DE PAGO
-- ---------------------------------------------------------------------
--
-- Sin esta columna, pagar la renta por transferencia bajaba el efectivo del
-- cajon — y al cerrar faltaba justo la renta.
alter table gasto add column if not exists metodo text not null default 'efectivo';
alter table gasto add column if not exists notas text;

-- ---------------------------------------------------------------------
-- LA CAJA ABIERTA DE UN CENTRO
-- ---------------------------------------------------------------------
create or replace function app.caja_abierta(p_negocio text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from sesion_caja where negocio_id = p_negocio and estado = 'abierta' limit 1;
$$;

-- ---------------------------------------------------------------------
-- EL EFECTIVO QUE DEBERIA HABER EN UNA CAJA
-- ---------------------------------------------------------------------
--
-- SOLO EFECTIVO. Una venta con tarjeta es un ingreso del negocio y cero
-- efectivo: sumarla aqui haria que el corte pidiera contar dinero que nunca
-- estuvo en el cajon.
--
-- El `coalesce(metodo, 'efectivo')` es por los movimientos de antes de
-- Ventas, que no llevaban metodo. Tratarlos como efectivo es lo conservador:
-- un gasto viejo salio del cajon, y darlo por tarjeta inflaria el esperado.
create or replace function app.efectivo_de_la_caja(p_sesion uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select saldo_inicial_centavos from sesion_caja where id = p_sesion), 0)
       + coalesce((
           select sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end)
           from movimiento_caja
           where sesion_id = p_sesion and coalesce(metodo, 'efectivo') = 'efectivo'
         ), 0);
$$;

comment on function app.efectivo_de_la_caja is
  'Lo que DEBERIA haber en el cajon: saldo inicial mas los ingresos en efectivo menos los egresos '
  'en efectivo. La tarjeta y la transferencia son ingresos del negocio y CERO efectivo — sumarlas '
  'haria que el corte pidiera contar dinero que nunca estuvo ahi.';

-- ---------------------------------------------------------------------
-- COMO SE LEE UN MOVIMIENTO
-- ---------------------------------------------------------------------
--
-- El TIPO que ve la persona no es la columna `tipo` —que solo dice si entra o
-- sale— sino la combinacion de origen y direccion. Se deduce al leer en vez de
-- guardarse: guardado seria un cuarto dato que puede contradecir a los otros
-- tres.
create or replace function app.clase_de_movimiento(p_origen text, p_tipo text)
returns text
language sql
immutable
as $$
  select case
    when p_origen = 'pago'                          then 'venta'
    when p_origen = 'venta'  and p_tipo = 'ingreso' then 'venta'
    when p_origen = 'venta'  and p_tipo = 'egreso'  then 'cancelacion'
    when p_origen = 'gasto'  and p_tipo = 'egreso'  then 'gasto'
    when p_origen = 'gasto'  and p_tipo = 'ingreso' then 'devolucion'
    when p_origen = 'ajuste' and p_tipo = 'ingreso' then 'ingreso'
    when p_origen = 'ajuste' and p_tipo = 'egreso'  then 'retiro'
    else p_tipo
  end;
$$;

-- LA CATEGORIA SE RESUELVE AL LEER, no se copia.
--
-- La de una venta sale de lo que se vendio; la de un gasto, del gasto. Copiar
-- cualquiera de las dos al movimiento las dejaria viejas el dia que cambien —
-- y ademas obligaria a recalcularlas en cada venta.
create or replace function app.categoria_del_movimiento(
  p_origen text, p_referencia uuid, p_categoria text
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_venta uuid;
  v_cats  text;
begin
  if p_origen = 'ajuste' then
    return p_categoria;
  end if;

  if p_origen = 'gasto' then
    return (select g.categoria from gasto g where g.id = p_referencia);
  end if;

  -- Un movimiento de pago apunta al PAGO; hay que subir hasta la venta.
  if p_origen = 'pago' then
    select p.venta_id into v_venta from pago p where p.id = p_referencia;
  else
    v_venta := p_referencia;
  end if;
  if v_venta is null then return null; end if;

  select string_agg(distinct
           case i.tipo when 'servicio' then 'Servicios'
                       when 'producto' then 'Productos'
                       when 'curso'    then 'Cursos' end, ' / ')
    into v_cats
    from venta_item i where i.venta_id = v_venta;
  return v_cats;
end;
$$;

-- ---------------------------------------------------------------------
-- ABRIR CAJA
-- ---------------------------------------------------------------------
create or replace function public.abrir_caja(
  p_negocio text,
  p_nombre text,
  p_saldo_inicial bigint default 0,
  p_observaciones text default null
)
returns sesion_caja
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s     sesion_caja;
  v_quien membresia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'verFinanzas') then
    raise exception 'No tienes permiso para abrir la caja.' using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite abrir caja.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_saldo_inicial, 0) < 0 then
    raise exception 'El saldo inicial no puede ser negativo.'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'La caja necesita un nombre para distinguirla en el historial.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- El indice unico ya lo impide; el mensaje esta aqui para que quien lo lea
  -- entienda que pasa en vez de recibir un error de indice.
  if app.caja_abierta(p_negocio) is not null then
    raise exception 'Ya hay una caja abierta. Cierrala antes de abrir otra.'
      using errcode = 'unique_violation';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into sesion_caja (negocio_id, nombre, saldo_inicial_centavos, abierta_por, observaciones)
  values (p_negocio, trim(p_nombre), coalesce(p_saldo_inicial, 0), v_quien.id, p_observaciones)
  returning * into v_s;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'caja', 'abrir', v_s.id::text, null,
          jsonb_build_object('nombre', v_s.nombre, 'saldoInicial', v_s.saldo_inicial_centavos));

  return v_s;
end;
$$;

-- ---------------------------------------------------------------------
-- CERRAR CAJA — el corte
-- ---------------------------------------------------------------------
--
-- El esperado se CONGELA aqui. Si se recalculara cada vez que alguien abre el
-- historial, un movimiento agregado despues cambiaria un corte ya firmado — y
-- un corte que cambia solo no sirve para explicarle a nadie un faltante.
create or replace function public.cerrar_caja(
  p_sesion uuid,
  p_contado bigint,
  p_notas text default null
)
returns sesion_caja
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s        sesion_caja;
  v_esperado bigint;
  v_quien    membresia;
begin
  select * into v_s from sesion_caja where id = p_sesion for update;
  if v_s.id is null then
    raise exception 'Esa caja no existe.' using errcode = 'no_data_found';
  end if;
  if not app.es_miembro(v_s.negocio_id) then
    raise exception 'Esa caja no es de tu centro.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(v_s.negocio_id, 'verFinanzas') then
    raise exception 'No tienes permiso para cerrar la caja.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_s.estado <> 'abierta' then
    raise exception 'Esa caja ya se cerro el %.', to_char(v_s.cerrada_en, 'DD/MM/YYYY HH24:MI')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_contado is null or p_contado < 0 then
    raise exception 'Hay que decir cuanto efectivo se conto. Si el cajon quedo vacio, es cero.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_esperado := app.efectivo_de_la_caja(p_sesion);

  select * into v_quien from membresia
   where negocio_id = v_s.negocio_id and usuario_id = auth.uid() limit 1;

  update sesion_caja
     set estado = 'cerrada',
         cerrada_en = now(),
         cerrada_por = v_quien.id,
         esperado_centavos = v_esperado,
         contado_centavos = p_contado,
         -- Positivo sobra, negativo falta. Se guarda con signo: "diferencia de
         -- 200" sin signo no dice si el dia salio bien o mal.
         diferencia_centavos = p_contado - v_esperado,
         notas_cierre = p_notas
   where id = p_sesion
  returning * into v_s;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (v_s.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'caja', 'cerrar', v_s.id::text, null,
          jsonb_build_object('esperado', v_esperado, 'contado', p_contado,
                             'diferencia', v_s.diferencia_centavos));

  return v_s;
end;
$$;

-- ---------------------------------------------------------------------
-- REGISTRAR UN INGRESO O UN RETIRO A MANO
-- ---------------------------------------------------------------------
create or replace function public.registrar_movimiento_de_caja(
  p_negocio text,
  p_tipo text,
  p_monto bigint,
  p_concepto text,
  p_metodo text default 'efectivo',
  p_categoria text default null,
  p_notas text default null
)
returns movimiento_caja
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m      movimiento_caja;
  v_sesion uuid;
  v_hay    bigint;
  v_quien  membresia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'verFinanzas') then
    raise exception 'No tienes permiso para mover la caja.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia no permite mover la caja.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_tipo not in ('ingreso', 'egreso') then
    raise exception 'Un movimiento entra o sale; no hay tercera opcion.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(trim(p_concepto), '') = '' then
    raise exception 'Escribe de que es el movimiento. Dentro de seis meses es lo unico que lo explica.'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_metodo, 'efectivo') not in ('efectivo', 'tarjeta', 'transferencia', 'otro') then
    raise exception 'Esa forma de pago no existe.' using errcode = 'invalid_parameter_value';
  end if;

  v_sesion := app.caja_abierta(p_negocio);

  -- SIN CAJA ABIERTA NO SE MUEVE EFECTIVO. El dinero fisico sale de un cajon;
  -- si no hay cajon abierto, no hay de donde sacarlo ni donde meterlo, y el
  -- movimiento quedaria fuera de todos los cortes.
  if coalesce(p_metodo, 'efectivo') = 'efectivo' and v_sesion is null then
    raise exception 'No hay una caja abierta. Abre una antes de mover efectivo.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- NO SE RETIRA MAS EFECTIVO DEL QUE HAY. Un cajon en negativo no es un dato:
  -- es la prueba de que el sistema dejo sacar lo que no estaba.
  if p_tipo = 'egreso' and coalesce(p_metodo, 'efectivo') = 'efectivo' then
    v_hay := app.efectivo_de_la_caja(v_sesion);
    if p_monto > v_hay then
      raise exception 'En la caja hay $%, no se pueden retirar $%.',
        to_char(v_hay::numeric / 100, 'FM999999990.00'),
        to_char(p_monto::numeric / 100, 'FM999999990.00')
        using errcode = 'check_violation';
    end if;
  end if;

  insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                               descripcion, fecha, metodo, categoria, notas, sesion_id, creado_por)
  values (p_negocio, p_tipo, 'ajuste', null, p_monto,
          trim(p_concepto), current_date, coalesce(p_metodo, 'efectivo'),
          nullif(trim(coalesce(p_categoria, '')), ''), p_notas, v_sesion, auth.uid())
  returning * into v_m;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'caja', p_tipo, v_m.id::text, null,
          jsonb_build_object('monto', p_monto, 'metodo', v_m.metodo, 'concepto', v_m.descripcion));

  return v_m;
end;
$$;

-- ---------------------------------------------------------------------
-- LA CAJA ACTUAL, CON SUS CIFRAS
-- ---------------------------------------------------------------------
--
-- Todo de un viaje: la sesion, lo que entro, lo que salio, el efectivo
-- esperado y el desglose por forma de pago. Sin esto la pantalla haria cinco
-- consultas y cada una podria contestar de un momento distinto.
create or replace function public.caja_actual(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case when s.id is null then null else jsonb_build_object(
    'id', s.id,
    'nombre', s.nombre,
    'estado', s.estado,
    'saldoInicialCentavos', s.saldo_inicial_centavos,
    'abiertaEn', s.abierta_en,
    'abiertaPor', (select m.nombre from membresia m where m.id = s.abierta_por),
    'observaciones', s.observaciones,
    -- TODO lo que entro y salio, con cualquier forma de pago. Es el movimiento
    -- del negocio.
    'ingresosCentavos', coalesce((select sum(monto_centavos) from movimiento_caja
                                   where sesion_id = s.id and tipo = 'ingreso'), 0),
    'egresosCentavos', coalesce((select sum(monto_centavos) from movimiento_caja
                                   where sesion_id = s.id and tipo = 'egreso'), 0),
    -- Y SOLO EL EFECTIVO, que es lo unico que se cuenta en el cajon.
    'efectivoEntroCentavos', coalesce((select sum(monto_centavos) from movimiento_caja
                                   where sesion_id = s.id and tipo = 'ingreso'
                                     and coalesce(metodo, 'efectivo') = 'efectivo'), 0),
    'efectivoSalioCentavos', coalesce((select sum(monto_centavos) from movimiento_caja
                                   where sesion_id = s.id and tipo = 'egreso'
                                     and coalesce(metodo, 'efectivo') = 'efectivo'), 0),
    'efectivoEsperadoCentavos', app.efectivo_de_la_caja(s.id),
    'movimientos', (select count(*) from movimiento_caja where sesion_id = s.id)
  ) end
  from (select * from sesion_caja
         where negocio_id = p_negocio and estado = 'abierta' limit 1) s;
$$;

-- ---------------------------------------------------------------------
-- EL RESUMEN DE UNA CAJA — formas de pago y movimientos por clase
-- ---------------------------------------------------------------------
create or replace function public.resumen_de_caja(p_sesion uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with m as (
    select mc.*, app.clase_de_movimiento(mc.origen, mc.tipo) as clase
    from movimiento_caja mc where mc.sesion_id = p_sesion
  ),
  -- Las formas de pago se cuentan sobre lo que ENTRO. Mezclar entradas y
  -- salidas en el mismo pastel da porcentajes que no significan nada.
  entradas as (select * from m where tipo = 'ingreso')
  select jsonb_build_object(
    'totalEntradasCentavos', coalesce((select sum(monto_centavos) from entradas), 0),
    'metodos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'metodo', t.metodo, 'centavos', t.centavos, 'movimientos', t.n
      ) order by t.centavos desc)
      from (
        select coalesce(metodo, 'efectivo') as metodo,
               sum(monto_centavos) as centavos, count(*) as n
        from entradas group by 1
      ) t
    ), '[]'::jsonb),
    'clases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clase', t.clase, 'movimientos', t.n, 'centavos', t.centavos
      ) order by t.clase)
      from (
        select clase, count(*) as n,
               sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end) as centavos
        from m group by clase
      ) t
    ), '[]'::jsonb),
    'movimientos', (select count(*) from m),
    'netoCentavos', coalesce((
      select sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end) from m
    ), 0)
  );
$$;

-- ---------------------------------------------------------------------
-- LOS MOVIMIENTOS, FILTRADOS Y PAGINADOS
-- ---------------------------------------------------------------------
create or replace function public.movimientos_de_caja(
  p_negocio text,
  p_sesion uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_busqueda text default null,
  p_clase text default null,
  p_metodo text default null,
  p_usuario uuid default null,
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
    select mc.*,
      app.clase_de_movimiento(mc.origen, mc.tipo) as clase,
      app.categoria_del_movimiento(mc.origen, mc.referencia_id, mc.categoria) as categoria_leida,
      (select m.nombre from membresia m
        where m.negocio_id = mc.negocio_id and m.usuario_id = mc.creado_por) as usuario,
      -- LA VENTA DE LA QUE SALIO, para poder navegar movimiento → venta → cliente.
      case when mc.origen = 'pago'
             then (select p.venta_id from pago p where p.id = mc.referencia_id)
           when mc.origen = 'venta' then mc.referencia_id end as venta_id
    from movimiento_caja mc
    where mc.negocio_id = p_negocio
      and (p_sesion is null or mc.sesion_id = p_sesion)
      and (p_desde is null or mc.fecha >= p_desde)
      and (p_hasta is null or mc.fecha <= p_hasta)
      and (p_metodo is null or coalesce(mc.metodo, 'efectivo') = p_metodo)
      and (p_usuario is null or mc.creado_por = p_usuario)
      and (p_clase is null or app.clase_de_movimiento(mc.origen, mc.tipo) = p_clase)
      and (p_busqueda is null or mc.descripcion ilike '%' || p_busqueda || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'filas', coalesce((
      select jsonb_agg(t.x order by t.orden desc)
      from (
        select jsonb_build_object(
          'id', b.id,
          'fecha', b.fecha,
          'creadoEn', b.creado_en,
          'clase', b.clase,
          'tipo', b.tipo,
          'concepto', b.descripcion,
          'metodo', coalesce(b.metodo, 'efectivo'),
          'categoria', b.categoria_leida,
          'montoCentavos', b.monto_centavos,
          'usuario', b.usuario,
          'notas', b.notas,
          'ventaId', b.venta_id,
          'sesionId', b.sesion_id
        ) as x, b.creado_en as orden
        from base b
        order by b.creado_en desc
        limit greatest(p_por_pagina, 1)
        offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)
      ) t
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- EL HISTORIAL DE CAJAS
-- ---------------------------------------------------------------------
--
-- El esperado de una caja CERRADA sale de lo que se congelo al cortar; el de
-- una abierta se calcula al vuelo. Recalcular el de una cerrada haria que un
-- corte firmado cambiara solo.
create or replace function public.historial_de_cajas(
  p_negocio text, p_pagina int default 1, p_por_pagina int default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select s.*,
      (select m.nombre from membresia m where m.id = s.abierta_por) as abrio,
      (select m.nombre from membresia m where m.id = s.cerrada_por) as cerro,
      coalesce((select sum(monto_centavos) from movimiento_caja
                 where sesion_id = s.id and tipo = 'ingreso'), 0) as ingresos,
      coalesce((select sum(monto_centavos) from movimiento_caja
                 where sesion_id = s.id and tipo = 'egreso'), 0) as egresos,
      (select count(*) from movimiento_caja where sesion_id = s.id) as movimientos
    from sesion_caja s
    where s.negocio_id = p_negocio
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'filas', coalesce((
      select jsonb_agg(t.x order by t.orden desc)
      from (
        select jsonb_build_object(
          'id', b.id, 'nombre', b.nombre, 'estado', b.estado,
          'abiertaEn', b.abierta_en, 'cerradaEn', b.cerrada_en,
          'abiertaPor', b.abrio, 'cerradaPor', b.cerro,
          'saldoInicialCentavos', b.saldo_inicial_centavos,
          'ingresosCentavos', b.ingresos,
          'egresosCentavos', b.egresos,
          'esperadoCentavos', coalesce(b.esperado_centavos, app.efectivo_de_la_caja(b.id)),
          'contadoCentavos', b.contado_centavos,
          'diferenciaCentavos', b.diferencia_centavos,
          'movimientos', b.movimientos,
          'observaciones', b.observaciones,
          'notasCierre', b.notas_cierre
        ) as x, b.abierta_en as orden
        from base b
        order by b.abierta_en desc
        limit greatest(p_por_pagina, 1)
        offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)
      ) t
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- EL REPORTE DE CAJA — de un periodo, no de una sesion
-- ---------------------------------------------------------------------
create or replace function public.reporte_de_caja(
  p_negocio text,
  p_desde date,
  p_hasta date,
  p_sesion uuid default null,
  p_usuario uuid default null,
  p_metodo text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with m as (
    select mc.*, app.clase_de_movimiento(mc.origen, mc.tipo) as clase
    from movimiento_caja mc
    where mc.negocio_id = p_negocio
      and mc.fecha between p_desde and p_hasta
      and (p_sesion is null or mc.sesion_id = p_sesion)
      and (p_usuario is null or mc.creado_por = p_usuario)
      and (p_metodo is null or coalesce(mc.metodo, 'efectivo') = p_metodo)
  )
  select jsonb_build_object(
    'ingresosCentavos', coalesce((select sum(monto_centavos) from m where tipo = 'ingreso'), 0),
    'egresosCentavos', coalesce((select sum(monto_centavos) from m where tipo = 'egreso'), 0),
    'movimientos', (select count(*) from m),
    'porMetodo', coalesce((
      select jsonb_agg(jsonb_build_object('metodo', t.metodo, 'centavos', t.c, 'movimientos', t.n)
                       order by t.c desc)
      from (select coalesce(metodo, 'efectivo') as metodo,
                   sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end) as c,
                   count(*) as n
              from m group by 1) t
    ), '[]'::jsonb),
    'porClase', coalesce((
      select jsonb_agg(jsonb_build_object('clase', t.clase, 'centavos', t.c, 'movimientos', t.n)
                       order by t.clase)
      from (select clase,
                   sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end) as c,
                   count(*) as n
              from m group by 1) t
    ), '[]'::jsonb),
    'porUsuario', coalesce((
      select jsonb_agg(jsonb_build_object('usuario', t.quien, 'centavos', t.c, 'movimientos', t.n)
                       order by t.n desc)
      from (select coalesce((select mb.nombre from membresia mb
                              where mb.negocio_id = p_negocio and mb.usuario_id = m.creado_por),
                            'Sin usuario') as quien,
                   sum(case when tipo = 'ingreso' then monto_centavos else -monto_centavos end) as c,
                   count(*) as n
              from m group by 1) t
    ), '[]'::jsonb),
    -- Las diferencias salen de los CORTES del periodo, no de los movimientos.
    'cortes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nombre', s.nombre, 'cerradaEn', s.cerrada_en,
        'esperadoCentavos', s.esperado_centavos, 'contadoCentavos', s.contado_centavos,
        'diferenciaCentavos', s.diferencia_centavos
      ) order by s.cerrada_en desc)
      from sesion_caja s
      where s.negocio_id = p_negocio and s.estado = 'cerrada'
        and s.cerrada_en::date between p_desde and p_hasta
        and (p_sesion is null or s.id = p_sesion)
    ), '[]'::jsonb)
  );
$$;

comment on function public.reporte_de_caja is
  'La fuente que Reportes consulta para todo lo de caja. No duplica nada: suma los movimientos que '
  'ya existen y los cortes ya firmados.';

-- =====================================================================
-- ELIMINAR UN PRODUCTO — y por que no es lo mismo que desactivarlo
-- =====================================================================
--
-- DESACTIVAR saca el producto del catalogo y conserva su historial: lo que ya
-- se vendio sigue cuadrando, los reportes de meses pasados siguen dando el
-- mismo total, y el renglon de una venta vieja sigue sabiendo que se llevo.
--
-- ELIMINAR es para lo que NUNCA debio existir: un producto capturado por error,
-- una prueba, un duplicado. Y por eso solo se permite cuando NADA cuelga de el.
--
-- LA REGLA QUE HACE ESTO SEGURO: si el producto tiene una venta detras, no se
-- borra — se ofrece desactivarlo. Sin esa regla, borrar un producto vendido
-- dejaria renglones de venta apuntando a la nada: el ticket de un cliente
-- dejaria de poder reconstruirse y el total del mes cambiaria solo. Eso no es
-- una molestia, es perder contabilidad ya cerrada.
--
-- Los movimientos de inventario y los proveedores SI se van con el: no son
-- historia contable, son historia del propio producto que se esta borrando.
--
-- Se marca `eliminado` en vez de borrar el renglon. El id sigue existiendo, asi
-- que nada de lo que lo referencie se rompe, y una equivocacion se puede
-- deshacer desde la base sin haber perdido nada.
--
create or replace function app.eliminar_producto(p_producto uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p      producto;
  v_ventas int;
  v_quien  membresia;
begin
  select * into v_p from producto where id = p_producto and not eliminado for update;
  if v_p.id is null then
    raise exception 'Ese producto no existe.' using errcode = 'no_data_found';
  end if;

  if not app.tiene_permiso(v_p.negocio_id, 'gestionarInventario') then
    raise exception 'No tienes permiso para eliminar productos.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_ventas
    from venta_item
   where negocio_id = v_p.negocio_id
     and tipo = 'producto'
     and referencia_id = p_producto;

  -- LO QUE YA SE VENDIO NO SE BORRA. Se dice que hacer en su lugar: un error
  -- que solo prohibe deja a la persona sin salida.
  if v_ventas > 0 then
    raise exception
      '% ya se vendio % %: no se puede eliminar. Desactivalo para sacarlo del catalogo sin perder su historial.',
      v_p.nombre, v_ventas, case when v_ventas = 1 then 'vez' else 'veces' end
      using errcode = 'foreign_key_violation';
  end if;

  delete from movimiento_inventario
   where negocio_id = v_p.negocio_id and producto_id = p_producto;
  delete from producto_proveedor
   where negocio_id = v_p.negocio_id and producto_id = p_producto;

  update producto
     set eliminado = true, activo = false, actualizado_en = now()
   where id = p_producto;

  -- QUEDA ESCRITO QUIEN LO BORRO. Es lo unico que queda de un producto que ya
  -- no esta, y la unica forma de contestar "aqui habia algo, que paso".
  select * into v_quien from membresia
   where negocio_id = v_p.negocio_id and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (v_p.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_quien.negocio_id and r.id = v_quien.rol),
                    v_quien.rol, 'desconocido'),
          'productos', 'eliminar', p_producto::text,
          jsonb_build_object('nombre', v_p.nombre, 'sku', v_p.sku,
                             'stock', v_p.stock_actual),
          null);
end;
$$;

create or replace function public.eliminar_producto(p_producto uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$ select app.eliminar_producto(p_producto); $$;

grant execute on function public.eliminar_producto(uuid) to authenticated;

comment on function public.eliminar_producto is
  'Da de baja un producto que nunca debio existir. Se niega si ya se vendio: en ese caso lo que '
  'corresponde es desactivarlo, porque borrarlo dejaria renglones de venta apuntando a la nada.';

-- =====================================================================
-- EL EXPEDIENTE CLINICO DE UN CLIENTE
-- =====================================================================
--
-- POR QUE ESTO NO ES "INFORMACION ADICIONAL": en un centro de terapias, lo que
-- una persona tiene es lo PRIMERO que hay que saber, no un dato de relleno.
-- Dar un masaje descontracturante a alguien con una hernia reciente, usar
-- lavanda con quien es alergico, o aplicar presion firme a quien toma
-- anticoagulantes son daños de verdad — y ninguno se ve en la cara.
--
-- CADA COLUMNA ES TEXTO LIBRE Y NO UNA LISTA CERRADA, a proposito. Un catalogo
-- de padecimientos obligaria a mantenerlo y, el dia que llegue uno que no esta,
-- se captura en el campo equivocado o no se captura. Aqui lo que importa es que
-- QUEDE ESCRITO y que se lea antes de la sesion.
--
-- SE AGREGAN CON "if not exists" una por una: correr esto dos veces no hace
-- nada, y en una base que ya tiene clientes no se pierde ni un dato.
--
alter table cliente add column if not exists padecimientos       text;
alter table cliente add column if not exists alergias            text;
alter table cliente add column if not exists medicamentos        text;
alter table cliente add column if not exists cirugias            text;
alter table cliente add column if not exists embarazo            text;
alter table cliente add column if not exists contraindicaciones  text;
alter table cliente add column if not exists direccion           text;
alter table cliente add column if not exists ocupacion           text;
alter table cliente add column if not exists contacto_emergencia text;
alter table cliente add column if not exists telefono_emergencia text;
alter table cliente add column if not exists como_nos_conocio    text;
alter table cliente add column if not exists referido_por        text;
alter table cliente add column if not exists presion_preferida   text;
alter table cliente add column if not exists aromas_evitar       text;

comment on column cliente.contraindicaciones is
  'Lo que NO se le puede hacer a esta persona. Es la columna mas importante de la tabla: se lee '
  'antes de tocarla, y por eso el expediente la enseña arriba y aparte.';
comment on column cliente.embarazo is
  'no, si o lactancia. Cambia que aceites y que posiciones se pueden usar, asi que no es un dato '
  'mas: es una contraindicacion con nombre propio.';

-- El expediente ahora tambien trae lo clinico Y el historial de notas de sesion.
create or replace function public.expediente_del_cliente(
  p_cliente uuid, p_hoy date default current_date
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
    'telefono', c.telefono,
    'correo', c.correo,
    'fechaNacimiento', c.fecha_nacimiento,
    'notas', c.notas,
    'clienteDesde', c.creado_en,
    'archivado', c.eliminado,
    'profesionalId', c.profesional_id,
    'profesional', (select m.nombre from membresia m where m.id = c.profesional_id),
    -- Lo clinico. Va junto y con nombres claros: quien lo lee esta a punto de
    -- ponerle las manos encima a alguien.
    'padecimientos', c.padecimientos,
    'alergias', c.alergias,
    'medicamentos', c.medicamentos,
    'cirugias', c.cirugias,
    'embarazo', c.embarazo,
    'contraindicaciones', c.contraindicaciones,
    'direccion', c.direccion,
    'ocupacion', c.ocupacion,
    'contactoEmergencia', c.contacto_emergencia,
    'telefonoEmergencia', c.telefono_emergencia,
    'comoNosConocio', c.como_nos_conocio,
    'referidoPor', c.referido_por,
    'presionPreferida', c.presion_preferida,
    'aromasEvitar', c.aromas_evitar,
    'visitas', (select count(*) from cita v
                 where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado),
    'canceladas', (select count(*) from cita v
                    where v.cliente_id = c.id and v.estado = 'cancelada' and not v.eliminado),
    'noAsistio', (select count(*) from cita v
                   where v.cliente_id = c.id and v.estado = 'no_asistio' and not v.eliminado),
    'ultimaVisita', (select jsonb_build_object('fecha', v.fecha, 'servicio', s.nombre)
                      from cita v join servicio s on s.id = v.servicio_id
                      where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado
                      order by v.fecha desc, v.hora_inicio desc limit 1),
    'proximaCita', (select jsonb_build_object('id', v.id, 'fecha', v.fecha,
                                              'hora', v.hora_inicio, 'servicio', s.nombre)
                     from cita v join servicio s on s.id = v.servicio_id
                     where v.cliente_id = c.id and not v.eliminado
                       and v.estado in ('pendiente', 'confirmada') and v.fecha >= p_hoy
                     order by v.fecha, v.hora_inicio limit 1),
    'compras', (select count(*) from venta ve
                 where ve.cliente_id = c.id and ve.estado = 'cobrada' and not ve.eliminado),
    'totalGastado', coalesce((select sum(ve.total_centavos) from venta ve
                               where ve.cliente_id = c.id and ve.estado = 'cobrada'
                                 and not ve.eliminado), 0),
    'adeudo', greatest(coalesce((
      select sum(ve.total_centavos - coalesce((
        select sum(pg.monto_centavos) from pago pg where pg.venta_id = ve.id
      ), 0))
      from venta ve
      where ve.cliente_id = c.id and ve.estado = 'cobrada' and not ve.eliminado
    ), 0), 0),
    'cursos', (select count(*) from inscripcion i
                where i.cliente_id = c.id and i.estado <> 'cancelado'),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', y.nombre, 'veces', y.veces)
                       order by y.veces desc, y.nombre)
      from (
        select s.nombre, count(*)::int as veces
        from cita v join servicio s on s.id = v.servicio_id
        where v.cliente_id = c.id and v.estado = 'completada' and not v.eliminado
        group by s.nombre
        limit 5
      ) y
    ), '[]'::jsonb),
    -- ---------------------------------------------------------------
    -- LAS NOTAS DE CADA SESION, que es el historial de verdad.
    -- ---------------------------------------------------------------
    -- No se guardan en el cliente: son de la CITA, donde se escribieron. Aqui
    -- solo se juntan las que tienen algo escrito, de la mas reciente a la mas
    -- vieja. Es lo que deja llegar a la cuarta sesion sabiendo que se hizo en
    -- las tres anteriores, en vez de preguntar otra vez.
    'sesiones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', z.id, 'fecha', z.fecha, 'servicio', z.servicio,
               'profesional', z.profesional, 'notas', z.notas)
             order by z.fecha desc)
      from (
        select v.id, v.fecha, s.nombre as servicio, m.nombre as profesional, v.notas
        from cita v
        join servicio s on s.id = v.servicio_id
        left join membresia m on m.id = v.profesional_id
        where v.cliente_id = c.id and not v.eliminado
          and v.estado = 'completada'
          and v.notas is not null and btrim(v.notas) <> ''
        order by v.fecha desc, v.hora_inicio desc
        limit 20
      ) z
    ), '[]'::jsonb)
  )
  from cliente c
  where c.id = p_cliente;
$$;

comment on function public.expediente_del_cliente is
  'El expediente UNE lo que ya vive en otros modulos, y ahora tambien lo clinico y las notas de '
  'cada sesion. Ni una de las cifras esta guardada en la tabla cliente: se cuentan desde citas, '
  'ventas, pagos e inscripciones. Las notas de sesion son de la cita, donde se escribieron.';
-- =====================================================================
-- GASTOS — lo que sale del centro
-- =====================================================================
--
-- LO QUE YA EXISTIA Y NO SE VUELVE A ESCRIBIR: la tabla `gasto`, su
-- disparador a caja, la tabla `categoria` (que ya sirve a servicios, cursos y
-- productos), `proveedor`, y `movimiento_caja` con su indice unico. Este
-- bloque los COMPLETA; no levanta una arquitectura paralela al lado.
--
-- LAS TRES DECISIONES QUE MANDAN EN TODO LO DEMAS:
--
--  1. EL EFECTIVO SE GUARDA APARTE DEL MONTO. Un gasto mixto de $1,000 con
--     $300 en efectivo saca $300 del cajon, no $1,000. Con solo la columna
--     `metodo` no habia forma de saber cuanto: o salia todo o no salia nada, y
--     las dos estan mal. Por eso `efectivo_centavos` es una columna propia y
--     es LA UNICA que mira el disparador.
--
--  2. EDITAR UN GASTO NO EDITA SU MOVIMIENTO DE CAJA. La caja es un libro: se
--     escribe, no se corrige —lo dice el comentario de `movimiento_caja` desde
--     el bloque 6, y el indice unico lo hace cumplir: un gasto tiene como
--     mucho UN egreso y UN ingreso—. Asi que editar ANULA el gasto viejo (su
--     ingreso contrario entra a caja) y CREA uno nuevo que apunta al anterior
--     con `sustituye_a`. El neto en caja es exactamente el que pide la regla,
--     el historial queda entero, y es imposible que el mismo gasto meta dos
--     egresos.
--
--  3. UN RECURRENTE NO ES UN GASTO. Es una plantilla con su proxima fecha. El
--     gasto nace cuando le toca, y `(recurrente_id, periodo)` es UNICO: correr
--     la generacion dos veces —o diez— no puede crear el gasto de agosto dos
--     veces. La idempotencia esta en la base, no en quien la llama.

-- ---------------------------------------------------------------------
-- 1. LAS CATEGORIAS DE GASTO SE SUMAN A LAS QUE YA HABIA
-- ---------------------------------------------------------------------
--
-- `categoria` ya servia a servicios, cursos y productos con la columna
-- `ambito`. Crear una `categoria_gasto` aparte habria sido el mismo error que
-- costo el sistema de diseño: cuatro tablas parecidas y ninguna igual.
alter table categoria drop constraint if exists categoria_ambito_check;
alter table categoria add constraint categoria_ambito_check
  check (ambito in ('servicio', 'curso', 'producto', 'gasto'));

-- El icono y el orden los pide el diseño de Gastos. Van en la tabla comun
-- porque no tienen nada de gasto: el dia que Productos quiera ordenar las
-- suyas, ya esta.
alter table categoria add column if not exists icono text;
alter table categoria add column if not exists orden integer not null default 0;

-- ---------------------------------------------------------------------
-- 2. LA TABLA `gasto` SE COMPLETA
-- ---------------------------------------------------------------------
--
-- NO SE RENOMBRA `descripcion`. Es el concepto corto —"Renta de agosto"— y es
-- lo que caja copia a su movimiento desde el bloque 6. Cambiarle el nombre
-- obligaria a tocar el disparador, los ataques y los movimientos ya
-- guardados, todo para ganar una palabra. El texto largo y opcional del
-- diseño entra como `detalle`, que es lo que de verdad faltaba.
alter table gasto add column if not exists detalle text;

-- La categoria pasa de texto suelto a referencia. Se conserva la columna
-- `categoria` de texto: es lo que tienen los gastos capturados antes, y
-- borrarla perderia esa informacion sin devolver nada.
alter table gasto add column if not exists categoria_id uuid;
alter table gasto drop constraint if exists gasto_categoria_mismo_negocio;
alter table gasto add constraint gasto_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  on delete set null (categoria_id);

-- El proveedor SE REFERENCIA, no se copia. El dia que cambie su telefono,
-- todos los gastos viejos lo muestran al dia sin tocar nada.
alter table gasto add column if not exists proveedor_id uuid;
alter table gasto drop constraint if exists gasto_proveedor_mismo_negocio;
alter table gasto add constraint gasto_proveedor_mismo_negocio
  foreign key (negocio_id, proveedor_id) references proveedor (negocio_id, id)
  on delete set null (proveedor_id);

-- El folio de la factura o el recibo. Es por lo que se busca un gasto cuando
-- llega el contador.
alter table gasto add column if not exists referencia text;

/*
 * CUANTO DE ESTE GASTO SALIO DEL CAJON.
 *
 * Es la columna que decide si la caja se mueve y por cuanto, y la unica que
 * mira el disparador. Se guarda aparte del monto porque en un gasto mixto no
 * coinciden: $1,000 de los cuales $300 en efectivo sacan $300, y con solo
 * `metodo` habia que elegir entre sacar todo o no sacar nada.
 *
 * El relleno de los gastos que ya existian da por efectivo lo que se capturo
 * como efectivo y cero lo demas, que es exactamente lo que su movimiento de
 * caja ya dice.
 */
alter table gasto add column if not exists efectivo_centavos bigint not null default 0;
update gasto set efectivo_centavos = case when coalesce(metodo, 'efectivo') = 'efectivo'
                                          then monto_centavos else 0 end
 where efectivo_centavos = 0 and coalesce(metodo, 'efectivo') = 'efectivo';

-- En un gasto mixto, con que se pago la parte que NO fue efectivo. Sin esto,
-- el resumen por forma de pago no puede cuadrar con el total.
alter table gasto add column if not exists metodo_resto text;

alter table gasto drop constraint if exists gasto_metodo_check;
alter table gasto add constraint gasto_metodo_check
  check (metodo in ('efectivo', 'tarjeta', 'transferencia', 'mixto'));

/*
 * LAS TRES FORMAS TIENEN QUE CUADRAR ENTRE SI, y lo vigila la base.
 *
 * Puesto solo en la pantalla, cualquiera que llame a la base por su cuenta
 * puede grabar un gasto "de tarjeta" que saca efectivo del cajon. La regla
 * vive donde no se puede saltar.
 */
alter table gasto drop constraint if exists gasto_efectivo_cuadra;
alter table gasto add constraint gasto_efectivo_cuadra check (
  case metodo
    when 'efectivo' then efectivo_centavos = monto_centavos
    when 'mixto'    then efectivo_centavos > 0 and efectivo_centavos < monto_centavos
    else efectivo_centavos = 0
  end
);


-- ---------------------------------------------------------------------
-- 2.b EL EFECTIVO SE CALCULA SOLO, ANTES DE COMPROBARSE
-- ---------------------------------------------------------------------
--
-- POR QUE HACE FALTA, Y NO ES COMODIDAD.
--
-- La restriccion de mas abajo exige que el efectivo cuadre con la forma de
-- pago. Puesta sola, cualquier `insert` que no mencione `efectivo_centavos`
-- —los que ya existian, los de un script, los de un ataque— reventaba: la
-- columna arrancaba en cero y el metodo en efectivo, y eso no cuadra.
--
-- Se podria haber pedido que todos digan el efectivo. Pero entonces la regla
-- viviria en cada sitio que escribe, y basta que uno se equivoque para meter
-- dinero fantasma en la caja. Asi la invariante no se COMPRUEBA: se CUMPLE
-- sola, y el unico que tiene que acertar es el mixto — que es el unico caso
-- donde de verdad hay algo que decidir.
create or replace function app.gasto_normaliza_efectivo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.metodo := coalesce(new.metodo, 'efectivo');

  if new.metodo = 'efectivo' then
    new.efectivo_centavos := new.monto_centavos;
    new.metodo_resto := null;
  elsif new.metodo in ('tarjeta', 'transferencia') then
    new.efectivo_centavos := 0;
    new.metodo_resto := null;
  end if;
  -- El mixto conserva lo que le dieron: ahi si hay una decision, y la
  -- restriccion comprueba que quepa dentro del total.

  return new;
end;
$$;

drop trigger if exists gasto_normaliza_efectivo on gasto;
create trigger gasto_normaliza_efectivo
  before insert or update on gasto
  for each row execute function app.gasto_normaliza_efectivo();

-- Un gasto mixto dice con que se pago el resto; los demas no tienen resto.
alter table gasto drop constraint if exists gasto_metodo_resto_check;
alter table gasto add constraint gasto_metodo_resto_check check (
  (metodo = 'mixto' and metodo_resto in ('tarjeta', 'transferencia'))
  or (metodo <> 'mixto' and metodo_resto is null)
);

-- La cadena de correcciones: este gasto sustituye a aquel. Editar no pisa,
-- encadena, y por eso siempre se puede reconstruir que se capturo primero.
alter table gasto add column if not exists sustituye_a uuid;

-- De que plantilla recurrente nacio, y de que periodo. El par es UNICO mas
-- abajo: es lo que hace imposible generar dos veces el gasto de agosto.
alter table gasto add column if not exists recurrente_id uuid;
alter table gasto add column if not exists periodo text;

-- Anular es una operacion con nombre y apellido: quien, cuando y por que.
alter table gasto add column if not exists anulado_motivo text;
alter table gasto add column if not exists anulado_por uuid;
alter table gasto add column if not exists anulado_en timestamptz;

-- La fecha del gasto y la fecha en que se capturo NO son la misma, y el
-- reporte tiene que poder distinguirlas: una renta del 1 puede capturarse el 3.
alter table gasto add column if not exists actualizado_en timestamptz;

create index if not exists gasto_categoria_idx on gasto (negocio_id, categoria_id) where not eliminado;
create index if not exists gasto_proveedor_idx on gasto (negocio_id, proveedor_id) where not eliminado;

-- ---------------------------------------------------------------------
-- 3. LOS GASTOS RECURRENTES: la plantilla, no el gasto
-- ---------------------------------------------------------------------
create table if not exists gasto_recurrente (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      text not null references negocio(id) on delete cascade,
  descripcion     text not null,
  detalle         text,
  categoria_id    uuid,
  proveedor_id    uuid,
  monto_centavos  bigint not null check (monto_centavos > 0),
  metodo          text not null default 'efectivo'
                  check (metodo in ('efectivo', 'tarjeta', 'transferencia', 'mixto')),
  efectivo_centavos bigint not null default 0,
  metodo_resto    text,
  frecuencia      text not null
                  check (frecuencia in ('diario', 'semanal', 'quincenal', 'mensual',
                                        'bimestral', 'trimestral', 'semestral', 'anual')),
  fecha_inicio    date not null,
  proxima_fecha   date not null,
  fecha_fin       date,
  estado          text not null default 'activo'
                  check (estado in ('activo', 'pausado', 'finalizado')),
  notas           text,
  creado_por      uuid,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz,
  eliminado       boolean not null default false,
  constraint gasto_recurrente_negocio_id_unico unique (negocio_id, id),
  constraint gasto_recurrente_efectivo_cuadra check (
    case metodo
      when 'efectivo' then efectivo_centavos = monto_centavos
      when 'mixto'    then efectivo_centavos > 0 and efectivo_centavos < monto_centavos
      else efectivo_centavos = 0
    end
  ),
  constraint gasto_recurrente_metodo_resto_check check (
    (metodo = 'mixto' and metodo_resto in ('tarjeta', 'transferencia'))
    or (metodo <> 'mixto' and metodo_resto is null)
  ),
  -- Una plantilla que termina antes de empezar no genera nada y nadie
  -- entiende por que. Se rechaza al guardarla.
  constraint gasto_recurrente_fin_despues check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

comment on table gasto_recurrente is
  'LA PLANTILLA, NO EL GASTO. Guardar aqui la renta mensual no mueve ni un peso: el gasto nace '
  'cuando llega su fecha, por generar_gastos_recurrentes, y queda ligado por (recurrente_id, '
  'periodo) — que es unico, asi que correr la generacion diez veces crea el gasto una sola vez.';

alter table gasto_recurrente drop constraint if exists gasto_recurrente_categoria_mismo_negocio;
alter table gasto_recurrente add constraint gasto_recurrente_categoria_mismo_negocio
  foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
  on delete set null (categoria_id);

alter table gasto_recurrente drop constraint if exists gasto_recurrente_proveedor_mismo_negocio;
alter table gasto_recurrente add constraint gasto_recurrente_proveedor_mismo_negocio
  foreign key (negocio_id, proveedor_id) references proveedor (negocio_id, id)
  on delete set null (proveedor_id);

create index if not exists gasto_recurrente_proxima_idx
  on gasto_recurrente (negocio_id, proxima_fecha) where estado = 'activo' and not eliminado;

alter table gasto drop constraint if exists gasto_recurrente_mismo_negocio;
alter table gasto add constraint gasto_recurrente_mismo_negocio
  foreign key (negocio_id, recurrente_id) references gasto_recurrente (negocio_id, id)
  on delete set null (recurrente_id);

/*
 * LA IDEMPOTENCIA, Y ES UN INDICE PORQUE NINGUN OTRO SITIO AGUANTA.
 *
 * Si la comprobacion viviera en la funcion —"mira si ya existe y si no,
 * crealo"— dos ejecuciones a la vez leerian las dos que no existe y crearian
 * las dos. Aqui la segunda choca contra el indice y se descarta sola, sin
 * importar cuantas corran ni desde donde.
 */
create unique index if not exists gasto_recurrente_periodo_unico
  on gasto (recurrente_id, periodo) where recurrente_id is not null and periodo is not null;

-- ---------------------------------------------------------------------
-- 4. LAS REGLAS DE FILA DEL RECURRENTE
-- ---------------------------------------------------------------------
alter table gasto_recurrente enable row level security;
alter table gasto_recurrente force row level security;

drop policy if exists gasto_recurrente_leer on gasto_recurrente;
create policy gasto_recurrente_leer on gasto_recurrente
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists gasto_recurrente_crear on gasto_recurrente;
create policy gasto_recurrente_crear on gasto_recurrente
  for insert to authenticated
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas')
              and app.licencia_permite(negocio_id));

drop policy if exists gasto_recurrente_editar on gasto_recurrente;
create policy gasto_recurrente_editar on gasto_recurrente
  for update to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'))
  with check (app.es_miembro(negocio_id) and app.licencia_permite(negocio_id));

grant select, insert, update on gasto_recurrente to authenticated;


-- ---------------------------------------------------------------------
-- 4.b EL INDICE UNICO DE CAJA APRENDE LA FORMA DE PAGO
-- ---------------------------------------------------------------------
--
-- Era `(negocio, origen, referencia_id, tipo)`: UN egreso por gasto. Eso
-- funciona mientras un gasto se pague de una sola forma, y deja de funcionar
-- con el mixto — que necesita DOS renglones, uno de efectivo y otro del resto,
-- porque la caja distingue el efectivo por la columna `metodo` y con un solo
-- renglon "mixto" contaria cero efectivo.
--
-- Es la misma solucion que ya se tomo en Ventas y por el mismo motivo: alli un
-- pago mixto son dos pagos, y el movimiento cuelga del PAGO para que cada uno
-- tenga el suyo. Aqui la forma de pago entra en el indice.
--
-- LO QUE SIGUE IMPEDIENDO es exactamente lo de antes: dos clics no meten el
-- mismo dinero dos veces, porque el par (gasto, efectivo) sigue siendo unico.
drop index if exists movimiento_caja_unico_por_origen;
create unique index if not exists movimiento_caja_unico_por_origen
  on movimiento_caja (negocio_id, origen, referencia_id, tipo, coalesce(metodo, 'efectivo'))
  where referencia_id is not null;

-- ---------------------------------------------------------------------
-- 5. EL DISPARADOR A CAJA, AHORA CON EL EFECTIVO APARTE
-- ---------------------------------------------------------------------
--
-- Sigue siendo el UNICO que escribe caja por un gasto. Lo que cambia es que
-- mira `efectivo_centavos` en vez de deducir el monto del metodo: un mixto de
-- $1,000 con $300 en efectivo saca $300, que es lo que de verdad salio del
-- cajon.



-- ---------------------------------------------------------------------
-- 5.b LA AUDITORIA DE GASTOS, EN UN SOLO SITIO
-- ---------------------------------------------------------------------
--
-- El bloque de auditoria son ocho lineas y hacen falta en cinco operaciones.
-- Copiado cinco veces, la sexta se escribe distinta y el dia que alguien
-- audite de verdad encuentra que "anular" no guardaba el rol. Aqui se escribe
-- una vez.
--
-- Es `security definer` A PROPOSITO: quien anula un gasto tiene permiso de
-- anularlo, no de escribir en el libro de auditoria — si pudiera escribirlo,
-- podria tambien maquillarlo.
create or replace function app.anotar_gasto(
  p_negocio text, p_accion text, p_entidad text, p_antes jsonb, p_despues jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quien membresia%rowtype;
begin
  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = p_negocio and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'gastos', p_accion, p_entidad, p_antes, p_despues);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. REGISTRAR UN GASTO
-- ---------------------------------------------------------------------
--
-- Se llama a una funcion en vez de insertar desde la pantalla por una razon
-- concreta: la pantalla manda el metodo y el monto, y es la BASE la que
-- calcula cuanto de eso es efectivo. Dejando ese calculo en el navegador,
-- cualquiera que llame a la base por su cuenta decide cuanto sale del cajon.
create or replace function public.registrar_gasto(
  p_negocio       text,
  p_descripcion   text,
  p_monto         bigint,
  p_metodo        text default 'efectivo',
  p_fecha         date default null,
  p_categoria     uuid default null,
  p_proveedor     uuid default null,
  p_detalle       text default null,
  p_referencia    text default null,
  p_notas         text default null,
  p_efectivo      bigint default null,
  p_metodo_resto  text default null,
  p_recurrente    uuid default null,
  p_periodo       text default null,
  p_sustituye_a   uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_efectivo bigint;
  v_id       uuid;
begin
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'El gasto necesita un concepto.' using errcode = 'invalid_parameter_value';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del gasto tiene que ser mayor que cero.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_metodo not in ('efectivo', 'tarjeta', 'transferencia', 'mixto') then
    raise exception 'Forma de pago desconocida: %', p_metodo using errcode = 'invalid_parameter_value';
  end if;

  -- EL EFECTIVO LO DECIDE LA BASE. Solo el mixto trae su parte, y se
  -- comprueba que quepa dentro del total.
  if p_metodo = 'efectivo' then
    v_efectivo := p_monto;
  elsif p_metodo = 'mixto' then
    v_efectivo := coalesce(p_efectivo, 0);
    if v_efectivo <= 0 or v_efectivo >= p_monto then
      raise exception 'En un gasto mixto la parte en efectivo tiene que ser mayor que cero y menor que el total.'
        using errcode = 'invalid_parameter_value';
    end if;
    if coalesce(p_metodo_resto, '') not in ('tarjeta', 'transferencia') then
      raise exception 'Un gasto mixto tiene que decir con que se pago el resto.'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    v_efectivo := 0;
  end if;

  insert into gasto (negocio_id, descripcion, detalle, categoria_id, proveedor_id,
                     monto_centavos, metodo, efectivo_centavos, metodo_resto,
                     fecha, referencia, notas, recurrente_id, periodo, sustituye_a, creado_por)
  values (p_negocio, trim(p_descripcion), nullif(trim(coalesce(p_detalle, '')), ''),
          p_categoria, p_proveedor, p_monto, p_metodo, v_efectivo,
          case when p_metodo = 'mixto' then p_metodo_resto end,
          coalesce(p_fecha, current_date), nullif(trim(coalesce(p_referencia, '')), ''),
          nullif(trim(coalesce(p_notas, '')), ''), p_recurrente, p_periodo, p_sustituye_a, auth.uid())
  returning id into v_id;

  perform app.anotar_gasto(p_negocio, case when p_recurrente is not null then 'generar' else 'crear' end,
    v_id::text, null,
    jsonb_build_object('concepto', trim(p_descripcion), 'monto', p_monto,
                       'metodo', p_metodo, 'efectivo', v_efectivo, 'fecha', coalesce(p_fecha, current_date)));

  return v_id;
end;
$$;

comment on function public.registrar_gasto is
  'Registra un gasto y deja que el disparador mueva la caja. El EFECTIVO lo calcula la base, no '
  'quien llama: dejarlo en el navegador seria dejar que el navegador decida cuanto sale del cajon.';

-- ---------------------------------------------------------------------
-- 7. EDITAR UN GASTO — anula y encadena
-- ---------------------------------------------------------------------
--
-- La caja es un libro y su indice unico solo deja UN egreso por gasto. Asi
-- que editar no pisa: anula el gasto viejo —su ingreso contrario entra a
-- caja— y crea uno nuevo que apunta al anterior.
--
-- El neto sale exactamente como pide la regla. Cambiar $500 en efectivo por
-- $700 en efectivo deja en caja: -500, +500, -700. El saldo baja 700, que es
-- lo correcto, y ademas se puede reconstruir que paso.
create or replace function public.editar_gasto(
  p_gasto         uuid,
  p_descripcion   text,
  p_monto         bigint,
  p_metodo        text,
  p_fecha         date default null,
  p_categoria     uuid default null,
  p_proveedor     uuid default null,
  p_detalle       text default null,
  p_referencia    text default null,
  p_notas         text default null,
  p_efectivo      bigint default null,
  p_metodo_resto  text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_viejo gasto%rowtype;
  v_nuevo uuid;
begin
  select * into v_viejo from gasto where id = p_gasto;
  if not found then
    raise exception 'Ese gasto no existe.' using errcode = 'invalid_parameter_value';
  end if;
  if v_viejo.eliminado then
    raise exception 'Ese gasto esta anulado: no se puede editar.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- PRIMERO SE CREA EL NUEVO. Si el nuevo no se puede —no hay caja abierta
  -- para su efectivo, por ejemplo— la transaccion entera se cae y el viejo
  -- sigue vivo. Al reves, un fallo dejaria el gasto anulado y nada en su
  -- lugar: dinero que desaparece de los reportes sin que nadie lo pida.
  v_nuevo := public.registrar_gasto(
    v_viejo.negocio_id, p_descripcion, p_monto, p_metodo, p_fecha, p_categoria, p_proveedor,
    p_detalle, p_referencia, p_notas, p_efectivo, p_metodo_resto,
    v_viejo.recurrente_id, v_viejo.periodo, p_gasto
  );

  update gasto
     set eliminado = true,
         anulado_motivo = 'Corregido',
         anulado_por = auth.uid(),
         anulado_en = now(),
         actualizado_en = now()
   where id = p_gasto;

  perform app.anotar_gasto(v_viejo.negocio_id, 'editar', v_nuevo::text,
    jsonb_build_object('gasto', p_gasto, 'concepto', v_viejo.descripcion,
                       'monto', v_viejo.monto_centavos, 'metodo', v_viejo.metodo,
                       'efectivo', v_viejo.efectivo_centavos),
    jsonb_build_object('gasto', v_nuevo, 'concepto', p_descripcion,
                       'monto', p_monto, 'metodo', p_metodo));

  return v_nuevo;
end;
$$;

comment on function public.editar_gasto is
  'Editar ANULA y ENCADENA, no pisa. El indice unico de movimiento_caja solo deja un egreso por '
  'gasto, y la caja es un libro que se escribe y no se corrige. El neto queda igual y el '
  'historial entero. Se crea el nuevo ANTES de anular el viejo: si el nuevo falla, no queda un '
  'hueco donde habia un gasto.';

-- ---------------------------------------------------------------------
-- 8. ANULAR UN GASTO
-- ---------------------------------------------------------------------
create or replace function public.anular_gasto(p_gasto uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_g gasto%rowtype;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Anular un gasto necesita un motivo.' using errcode = 'invalid_parameter_value';
  end if;

  -- El `and not eliminado` no es cortesia: sin el, anular dos veces intentaria
  -- meter dos ingresos por el mismo gasto. El indice unico lo rechazaria, pero
  -- con un error que no dice nada.
  update gasto
     set eliminado = true,
         anulado_motivo = trim(p_motivo),
         anulado_por = auth.uid(),
         anulado_en = now(),
         actualizado_en = now()
   where id = p_gasto and not eliminado;

  if not found then
    raise exception 'Ese gasto no existe o ya estaba anulado.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_g from gasto where id = p_gasto;
  perform app.anotar_gasto(v_g.negocio_id, 'anular', p_gasto::text,
    jsonb_build_object('concepto', v_g.descripcion, 'monto', v_g.monto_centavos,
                       'metodo', v_g.metodo, 'efectivo', v_g.efectivo_centavos),
    jsonb_build_object('motivo', trim(p_motivo)));
end;
$$;

-- ---------------------------------------------------------------------
-- 9. GUARDAR Y MOVER UNA PLANTILLA RECURRENTE
-- ---------------------------------------------------------------------
create or replace function public.guardar_gasto_recurrente(
  p_negocio       text,
  p_id            uuid,
  p_descripcion   text,
  p_monto         bigint,
  p_metodo        text,
  p_frecuencia    text,
  p_fecha_inicio  date,
  p_categoria     uuid default null,
  p_proveedor     uuid default null,
  p_detalle       text default null,
  p_notas         text default null,
  p_efectivo      bigint default null,
  p_metodo_resto  text default null,
  p_fecha_fin     date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_efectivo bigint;
  v_id       uuid;
begin
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'El gasto recurrente necesita un concepto.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'invalid_parameter_value';
  end if;

  if p_metodo = 'efectivo' then
    v_efectivo := p_monto;
  elsif p_metodo = 'mixto' then
    v_efectivo := coalesce(p_efectivo, 0);
    if v_efectivo <= 0 or v_efectivo >= p_monto then
      raise exception 'En un gasto mixto la parte en efectivo tiene que ser mayor que cero y menor que el total.'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    v_efectivo := 0;
  end if;

  if p_id is null then
    insert into gasto_recurrente (negocio_id, descripcion, detalle, categoria_id, proveedor_id,
                                  monto_centavos, metodo, efectivo_centavos, metodo_resto,
                                  frecuencia, fecha_inicio, proxima_fecha, fecha_fin, notas, creado_por)
    values (p_negocio, trim(p_descripcion), nullif(trim(coalesce(p_detalle, '')), ''),
            p_categoria, p_proveedor, p_monto, p_metodo, v_efectivo,
            case when p_metodo = 'mixto' then p_metodo_resto end,
            p_frecuencia, p_fecha_inicio,
            -- LA PRIMERA VEZ TOCA EL DIA DE INICIO, aunque ya haya pasado: una
            -- renta que empezo el 1 y se captura el 3 tiene que generar la de
            -- este mes, no esperarse al siguiente.
            p_fecha_inicio,
            p_fecha_fin, nullif(trim(coalesce(p_notas, '')), ''), auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  update gasto_recurrente
     set descripcion = trim(p_descripcion),
         detalle = nullif(trim(coalesce(p_detalle, '')), ''),
         categoria_id = p_categoria,
         proveedor_id = p_proveedor,
         monto_centavos = p_monto,
         metodo = p_metodo,
         efectivo_centavos = v_efectivo,
         metodo_resto = case when p_metodo = 'mixto' then p_metodo_resto end,
         frecuencia = p_frecuencia,
         fecha_inicio = p_fecha_inicio,
         fecha_fin = p_fecha_fin,
         notas = nullif(trim(coalesce(p_notas, '')), ''),
         actualizado_en = now()
   where id = p_id and negocio_id = p_negocio and not eliminado;

  if not found then
    raise exception 'Ese gasto recurrente no existe.' using errcode = 'invalid_parameter_value';
  end if;
  return p_id;
end;
$$;

create or replace function public.marcar_gasto_recurrente(p_id uuid, p_estado text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_negocio text;
begin
  if p_estado not in ('activo', 'pausado', 'finalizado') then
    raise exception 'Estado desconocido: %', p_estado using errcode = 'invalid_parameter_value';
  end if;
  update gasto_recurrente
     set estado = p_estado, actualizado_en = now()
   where id = p_id and not eliminado
  returning negocio_id into v_negocio;
  if not found then
    raise exception 'Ese gasto recurrente no existe.' using errcode = 'invalid_parameter_value';
  end if;
  perform app.anotar_gasto(v_negocio, 'recurrente:' || p_estado, p_id::text, null,
    jsonb_build_object('estado', p_estado));
end;
$$;

-- ---------------------------------------------------------------------
-- 10. EL PERIODO DE UN RECURRENTE, Y CUANDO LE TOCA OTRA VEZ
-- ---------------------------------------------------------------------
--
-- El periodo es la ETIQUETA que hace unica cada instancia: '2026-08' para un
-- mensual, '2026-W32' para un semanal. Es lo que el indice unico compara, asi
-- que dos generaciones del mismo mes chocan y la segunda se descarta sola.
create or replace function app.periodo_del_recurrente(p_frecuencia text, p_fecha date)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_frecuencia
    when 'diario'     then to_char(p_fecha, 'YYYY-MM-DD')
    when 'semanal'    then to_char(p_fecha, 'IYYY-"W"IW')
    -- La quincena: dos por mes, y el dia 15 parte. Sin esto, las dos del mismo
    -- mes compartirian etiqueta y la segunda no se generaria nunca.
    when 'quincenal'  then to_char(p_fecha, 'YYYY-MM') || case when extract(day from p_fecha) <= 15
                                                              then '-A' else '-B' end
    when 'mensual'    then to_char(p_fecha, 'YYYY-MM')
    when 'bimestral'  then to_char(p_fecha, 'YYYY') || '-B' || ceil(extract(month from p_fecha) / 2.0)::text
    when 'trimestral' then to_char(p_fecha, 'YYYY') || '-T' || ceil(extract(month from p_fecha) / 3.0)::text
    when 'semestral'  then to_char(p_fecha, 'YYYY') || '-S' || ceil(extract(month from p_fecha) / 6.0)::text
    when 'anual'      then to_char(p_fecha, 'YYYY')
  end;
$$;

create or replace function app.siguiente_fecha_recurrente(p_frecuencia text, p_fecha date)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_frecuencia
    when 'diario'     then p_fecha + interval '1 day'
    when 'semanal'    then p_fecha + interval '1 week'
    when 'quincenal'  then p_fecha + interval '15 days'
    when 'mensual'    then p_fecha + interval '1 month'
    when 'bimestral'  then p_fecha + interval '2 months'
    when 'trimestral' then p_fecha + interval '3 months'
    when 'semestral'  then p_fecha + interval '6 months'
    when 'anual'      then p_fecha + interval '1 year'
  end::date;
$$;

-- ---------------------------------------------------------------------
-- 11. GENERAR LOS GASTOS QUE YA TOCAN
-- ---------------------------------------------------------------------
--
-- SE PUEDE LLAMAR CUANTAS VECES SE QUIERA. La idempotencia no la pone esta
-- funcion: la pone el indice unico (recurrente_id, periodo). Aqui solo se
-- captura la colision y se sigue. Por eso da igual si la llama la pantalla al
-- abrir Gastos, un cron de la base, o las dos a la vez.
create or replace function public.generar_gastos_recurrentes(p_negocio text)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r        record;
  v_fecha  date;
  v_periodo text;
  v_creados integer := 0;
  v_vueltas integer;
begin
  for r in
    select * from gasto_recurrente
     where negocio_id = p_negocio and estado = 'activo' and not eliminado
       and proxima_fecha <= current_date
     order by proxima_fecha
  loop
    v_fecha := r.proxima_fecha;
    v_vueltas := 0;

    -- UNA PLANTILLA PUEDE DEBER VARIAS. Si nadie abrio el sistema en tres
    -- meses, la renta debe tres. Se generan todas, cada una con su fecha real
    -- —no tres con la de hoy, que descuadraria los reportes de esos meses.
    --
    -- El tope de vueltas es un seguro contra una plantilla con fecha de inicio
    -- absurda: mil dias no bloquean la pantalla mientras alguien mira.
    while v_fecha <= current_date and (r.fecha_fin is null or v_fecha <= r.fecha_fin)
          and v_vueltas < 400 loop
      v_periodo := app.periodo_del_recurrente(r.frecuencia, v_fecha);
      begin
        insert into gasto (negocio_id, descripcion, detalle, categoria_id, proveedor_id,
                           monto_centavos, metodo, efectivo_centavos, metodo_resto,
                           fecha, notas, recurrente_id, periodo, creado_por)
        values (r.negocio_id, r.descripcion, r.detalle, r.categoria_id, r.proveedor_id,
                r.monto_centavos, r.metodo, r.efectivo_centavos, r.metodo_resto,
                v_fecha, r.notas, r.id, v_periodo, r.creado_por);
        v_creados := v_creados + 1;
      exception
        -- YA ESTABA. Es el caso normal cuando dos procesos corren a la vez, no
        -- un error: se sigue con el siguiente periodo.
        when unique_violation then null;
        -- SIN CAJA ABIERTA no se puede pagar en efectivo, y el disparador lo
        -- rechaza. No es motivo para abortar la generacion entera ni para
        -- mover la proxima fecha: se deja para cuando abran caja.
        when invalid_parameter_value then exit;
      end;
      v_fecha := app.siguiente_fecha_recurrente(r.frecuencia, v_fecha);
      v_vueltas := v_vueltas + 1;
    end loop;

    update gasto_recurrente
       set proxima_fecha = v_fecha,
           estado = case when fecha_fin is not null and v_fecha > fecha_fin
                         then 'finalizado' else estado end,
           actualizado_en = now()
     where id = r.id;
  end loop;

  return v_creados;
end;
$$;

comment on function public.generar_gastos_recurrentes is
  'Idempotente A PROPOSITO: la unicidad la pone el indice (recurrente_id, periodo), no esta '
  'funcion. Dos ejecuciones simultaneas no pueden crear dos gastos del mismo mes. Por eso se '
  'puede llamar desde la pantalla sin miedo, y tambien desde un cron de la base.';

-- ---------------------------------------------------------------------
-- 12. LOS GASTOS DE UN RANGO, YA CON SUS NOMBRES RESUELTOS
-- ---------------------------------------------------------------------
--
-- Los nombres de la categoria, el proveedor y quien lo capturo se RESUELVEN
-- aqui, no se copian en la tabla. El dia que cambie el nombre de un proveedor,
-- los gastos viejos lo dicen al dia sin tocar nada.
create or replace function public.gastos_del_rango(
  p_negocio  text,
  p_desde    date,
  p_hasta    date,
  p_incluir_anulados boolean default false
)
returns table (
  id uuid, fecha date, descripcion text, detalle text,
  monto_centavos bigint, metodo text, efectivo_centavos bigint, metodo_resto text,
  categoria_id uuid, categoria text, categoria_color text, categoria_icono text,
  proveedor_id uuid, proveedor text,
  referencia text, notas text,
  recurrente_id uuid, frecuencia text,
  creado_por uuid, usuario text, creado_en timestamptz, actualizado_en timestamptz,
  eliminado boolean, anulado_motivo text, anulado_en timestamptz, sustituye_a uuid
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select g.id, g.fecha, g.descripcion, g.detalle,
         g.monto_centavos, g.metodo, g.efectivo_centavos, g.metodo_resto,
         g.categoria_id, coalesce(c.nombre, nullif(g.categoria, 'general')), c.color, c.icono,
         g.proveedor_id, p.nombre,
         g.referencia, g.notas,
         g.recurrente_id, gr.frecuencia,
         g.creado_por, m.nombre, g.creado_en, g.actualizado_en,
         g.eliminado, g.anulado_motivo, g.anulado_en, g.sustituye_a
    from gasto g
    left join categoria c on c.id = g.categoria_id and c.negocio_id = g.negocio_id
    left join proveedor p on p.id = g.proveedor_id and p.negocio_id = g.negocio_id
    left join gasto_recurrente gr on gr.id = g.recurrente_id and gr.negocio_id = g.negocio_id
    left join membresia m on m.usuario_id = g.creado_por and m.negocio_id = g.negocio_id
   where g.negocio_id = p_negocio
     and g.fecha between p_desde and p_hasta
     and (p_incluir_anulados or not g.eliminado)
   order by g.fecha desc, g.creado_en desc;
$$;

-- ---------------------------------------------------------------------
-- 13. EL RESUMEN DEL PERIODO
-- ---------------------------------------------------------------------
--
-- SE SUMA EN EL SERVIDOR. Bajar el año entero al navegador para sumarlo alli
-- son varios segundos cada vez que alguien abre Gastos, y a los dos años de
-- operacion es insoportable.
--
-- La comparacion contra el periodo anterior toma un rango del MISMO LARGO
-- pegado por detras: del 1 al 10 de agosto se compara contra el 22 al 31 de
-- julio, que son diez dias igual. Comparar diez dias contra un mes entero da
-- un porcentaje que no significa nada.
create or replace function public.resumen_de_gastos(
  p_negocio text,
  p_desde   date,
  p_hasta   date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with dias as (
    select greatest((p_hasta - p_desde) + 1, 1) as n
  ),
  actual as (
    select * from gasto
     where negocio_id = p_negocio and not eliminado and fecha between p_desde and p_hasta
  ),
  anterior as (
    select * from gasto
     where negocio_id = p_negocio and not eliminado
       and fecha between p_desde - (select n from dias) and p_desde - 1
  ),
  mayor as (
    select descripcion, monto_centavos from actual order by monto_centavos desc, creado_en limit 1
  )
  select jsonb_build_object(
    'totalCentavos', coalesce((select sum(monto_centavos) from actual), 0),
    'cuantos', (select count(*) from actual),
    'dias', (select n from dias),
    -- El promedio se saca entre los DIAS del periodo, no entre los gastos: es
    -- "cuanto sale al dia", que es la pregunta que se hace quien lo mira.
    'promedioDiarioCentavos',
      coalesce((select sum(monto_centavos) from actual), 0) / (select n from dias),
    'mayor', case when exists (select 1 from mayor)
      then (select jsonb_build_object('descripcion', descripcion, 'centavos', monto_centavos) from mayor)
      end,
    'anteriorCentavos', coalesce((select sum(monto_centavos) from anterior), 0),
    -- SIN PERIODO ANTERIOR NO HAY PORCENTAJE. Dividir entre cero no da cero:
    -- no da nada, y "+∞%" o "+5000%" es el numero que mas veces se ve mal
    -- hecho en un tablero.
    'hayComparacion', (select count(*) from anterior) > 0,
    'porCategoria', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.categoria_id, 'nombre', t.nombre, 'color', t.color,
        'centavos', t.centavos, 'cuantos', t.n
      ) order by t.centavos desc)
      from (
        select a.categoria_id, coalesce(c.nombre, 'Sin categoría') as nombre, c.color,
               sum(a.monto_centavos) as centavos, count(*) as n
          from actual a
          left join categoria c on c.id = a.categoria_id and c.negocio_id = p_negocio
         group by a.categoria_id, c.nombre, c.color
      ) t
    ), '[]'::jsonb),
    'porMetodo', coalesce((
      select jsonb_agg(jsonb_build_object(
        'metodo', t.metodo, 'centavos', t.centavos, 'cuantos', t.n
      ) order by t.centavos desc)
      from (
        select metodo, sum(monto_centavos) as centavos, count(*) as n
          from actual group by metodo
      ) t
    ), '[]'::jsonb),
    'porDia', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', t.d, 'centavos', t.centavos) order by t.d)
      from (
        -- LOS DIAS SIN GASTOS VAN EN CERO, no ausentes: un hueco en la grafica
        -- se lee como una caida en vez de como un dia tranquilo.
        select s.d::date as d, coalesce(sum(a.monto_centavos), 0) as centavos
          from generate_series(p_desde, p_hasta, interval '1 day') s(d)
          left join actual a on a.fecha = s.d::date
         group by s.d
      ) t
    ), '[]'::jsonb),
    'efectivoCentavos', coalesce((select sum(efectivo_centavos) from actual), 0)
  );
$$;

comment on function public.resumen_de_gastos is
  'Todo el tablero de Gastos en UN viaje. La comparacion contra el periodo anterior toma un rango '
  'del mismo largo pegado por detras; sin datos antes, avisa que no hay comparacion en vez de '
  'inventar un porcentaje contra cero.';

-- ---------------------------------------------------------------------
-- 14. LOS RECURRENTES DEL CENTRO
-- ---------------------------------------------------------------------
create or replace function public.gastos_recurrentes_del_centro(p_negocio text)
returns table (
  id uuid, descripcion text, detalle text,
  monto_centavos bigint, metodo text, efectivo_centavos bigint, metodo_resto text,
  categoria_id uuid, categoria text, categoria_color text,
  proveedor_id uuid, proveedor text,
  frecuencia text, fecha_inicio date, proxima_fecha date, fecha_fin date,
  estado text, notas text, generados bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.id, r.descripcion, r.detalle,
         r.monto_centavos, r.metodo, r.efectivo_centavos, r.metodo_resto,
         r.categoria_id, c.nombre, c.color,
         r.proveedor_id, p.nombre,
         r.frecuencia, r.fecha_inicio, r.proxima_fecha, r.fecha_fin,
         r.estado, r.notas,
         (select count(*) from gasto g where g.recurrente_id = r.id and not g.eliminado)
    from gasto_recurrente r
    left join categoria c on c.id = r.categoria_id and c.negocio_id = r.negocio_id
    left join proveedor p on p.id = r.proveedor_id and p.negocio_id = r.negocio_id
   where r.negocio_id = p_negocio and not r.eliminado
   order by case r.estado when 'activo' then 0 when 'pausado' then 1 else 2 end,
            r.proxima_fecha;
$$;

-- ---------------------------------------------------------------------
-- 15. UNA CATEGORIA CON GASTOS NO SE BORRA
-- ---------------------------------------------------------------------
--
-- Borrarla dejaria los gastos historicos sin decir de que eran, y un reporte
-- del año pasado con la mitad de las lineas en "Sin categoria" no sirve para
-- nada. Se desactiva: deja de ofrecerse al capturar y los viejos la conservan.
create or replace function public.gastos_de_la_categoria(p_categoria uuid)
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*) from gasto where categoria_id = p_categoria and not eliminado;
$$;

-- =====================================================================
-- REPORTES — la capa de analisis
-- =====================================================================
--
-- REPORTES NO ES DUEÑO DE NI UN DATO, y esa es toda su arquitectura. No hay
-- tabla de reportes, no hay copia de las ventas, no hay totales guardados. Todo
-- se cuenta EN EL MOMENTO desde las tablas de cada modulo: venta, venta_item,
-- pago, gasto, movimiento_caja, cliente, cita, producto, curso e inscripcion.
--
-- POR QUE ASI Y NO CON TOTALES GUARDADOS: un total guardado se desincroniza a
-- la primera venta cancelada, y a partir de ahi hay dos numeros verdaderos y
-- nadie sabe cual creer. Es el mismo error que este proyecto ya evito en el
-- expediente del cliente y en las cifras de Inicio.
--
-- TODO SE CALCULA EN EL SERVIDOR, en una sola llamada. Bajar mil ventas al
-- navegador para sumarlas seria lento hoy e imposible en dos años — y ademas
-- dejaria el calculo del lado donde se puede manipular.
--
-- UNA SOLA LLAMADA PARA TODO EL REPORTE, y no una por pestaña. Es lo que
-- garantiza que las ocho pestañas hablen del MISMO periodo y de los MISMOS
-- filtros: con una consulta por pestaña, basta que una se quede con el periodo
-- viejo para que la pantalla se contradiga a si misma sin avisar.
--
-- `security invoker` NO ES UN DETALLE: hace que las reglas de acceso por fila se
-- apliquen con los permisos de QUIEN LLAMA. De ahi salen gratis dos cosas que el
-- encargo pedia: un centro jamas ve los datos de otro, y quien no tiene
-- `verFinanzas` no obtiene cifras de dinero aunque llame a la funcion a mano
-- desde la consola.

-- ---------------------------------------------------------------------
-- COMO SE AGRUPA LA SERIE DEL TIEMPO
-- ---------------------------------------------------------------------
-- Un rango de un año agrupado por dia son trescientos sesenta y cinco puntos:
-- ilegible. Uno de una semana agrupado por mes es un solo punto: inutil. Se
-- decide por el largo del rango y se DICE en la respuesta, para que la grafica
-- pueda rotular el eje como corresponde.
create or replace function app.paso_de_la_serie(p_desde date, p_hasta date)
returns text
language sql
immutable
as $$
  select case when (p_hasta - p_desde) > 92 then 'mes' else 'dia' end;
$$;

-- ---------------------------------------------------------------------
-- EL REPORTE DEL PERIODO
-- ---------------------------------------------------------------------
--
-- LOS FILTROS SE COMBINAN Y TODOS SON OPCIONALES. `null` significa "sin
-- filtrar", no "ninguno": un filtro que al quedarse vacio devuelve cero seria
-- indistinguible de un periodo sin ventas.
--
--   p_tipo      servicio | producto | curso — de que se compone el ingreso
--   p_metodo    efectivo | tarjeta | transferencia | otro
--   p_vendedor  quien cobro la venta
--
create or replace function public.reporte_del_periodo(
  p_negocio  text,
  p_desde    date,
  p_hasta    date,
  p_tipo     text default null,
  p_metodo   text default null,
  p_vendedor uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with
  -- El periodo anterior COMPARABLE: mismo numero de dias, pegado hacia atras.
  -- Comparar un mes contra una semana daria una caida del 75% que no existe.
  rango as (
    select p_desde as desde, p_hasta as hasta,
           (p_hasta - p_desde + 1) as dias,
           (p_desde - (p_hasta - p_desde + 1))::date as desde_ant,
           (p_desde - 1)::date as hasta_ant,
           app.paso_de_la_serie(p_desde, p_hasta) as paso
  ),

  -- --- LAS VENTAS QUE CUENTAN --------------------------------------
  -- Solo las COBRADAS. Un borrador no es dinero y una cancelada dejo de serlo;
  -- las dos se conservan en su tabla, pero no suman aqui.
  v as (
    select ve.* from venta ve, rango r
    where ve.negocio_id = p_negocio and not ve.eliminado
      and ve.estado = 'cobrada'
      and ve.fecha between r.desde and r.hasta
      and (p_vendedor is null or ve.creada_por = p_vendedor)
      and (p_metodo is null or exists (
            select 1 from pago pg where pg.venta_id = ve.id and pg.metodo = p_metodo))
  ),
  v_ant as (
    select ve.* from venta ve, rango r
    where ve.negocio_id = p_negocio and not ve.eliminado
      and ve.estado = 'cobrada'
      and ve.fecha between r.desde_ant and r.hasta_ant
      and (p_vendedor is null or ve.creada_por = p_vendedor)
      and (p_metodo is null or exists (
            select 1 from pago pg where pg.venta_id = ve.id and pg.metodo = p_metodo))
  ),
  it as (
    select vi.* from venta_item vi join v on v.id = vi.venta_id
    where p_tipo is null or vi.tipo = p_tipo
  ),
  it_ant as (
    select vi.* from venta_item vi join v_ant on v_ant.id = vi.venta_id
    where p_tipo is null or vi.tipo = p_tipo
  ),

  -- CON FILTRO DE TIPO, EL INGRESO ES EL DE ESOS RENGLONES; sin filtro, es el
  -- total de la venta. No es lo mismo: el total lleva el descuento general, que
  -- no pertenece a ningun renglon. Sumar renglones siempre daria de mas.
  ingresos as (
    select case when p_tipo is null
                then (select coalesce(sum(total_centavos), 0) from v)
                else (select coalesce(sum(subtotal_centavos), 0) from it) end as monto,
           case when p_tipo is null
                then (select coalesce(sum(total_centavos), 0) from v_ant)
                else (select coalesce(sum(subtotal_centavos), 0) from it_ant) end as antes
  ),

  -- --- LOS GASTOS DEL PERIODO --------------------------------------
  g as (
    select ga.* from gasto ga, rango r
    where ga.negocio_id = p_negocio and not ga.eliminado
      and ga.fecha between r.desde and r.hasta
  ),

  -- --- LAS CITAS COMPLETADAS ---------------------------------------
  -- "Servicios realizados" sale de AGENDA, no de las ventas: una sesion se da
  -- aunque se haya cobrado otro dia, y un paquete se cobra una vez y se da en
  -- cuatro sesiones. Contarlo desde la venta diria cuatro veces menos.
  ct as (
    select ci.* from cita ci, rango r
    where ci.negocio_id = p_negocio and not ci.eliminado
      and ci.estado = 'completada'
      and ci.fecha between r.desde and r.hasta
  ),
  ct_ant as (
    select ci.* from cita ci, rango r
    where ci.negocio_id = p_negocio and not ci.eliminado
      and ci.estado = 'completada'
      and ci.fecha between r.desde_ant and r.hasta_ant
  ),

  -- Quien fue atendido: quien tuvo cita completada O compro. Sin unir las dos,
  -- una venta de mostrador a alguien identificado no contaria como atencion.
  atendidos as (
    select count(*)::int as n from (
      select cliente_id from ct where cliente_id is not null
      union
      select cliente_id from v where cliente_id is not null
    ) x
  ),
  atendidos_ant as (
    select count(*)::int as n from (
      select cliente_id from ct_ant where cliente_id is not null
      union
      select cliente_id from v_ant where cliente_id is not null
    ) x
  ),

  -- ¿HAY CON QUE COMPARAR? Si el centro no existia antes del periodo, no se
  -- inventa un "+100%": se dice que no hay comparacion. Un porcentaje contra la
  -- nada es el numero mas facil de creerse y el mas falso.
  hubo_antes as (
    select exists (
      select 1 from venta ve, rango r
      where ve.negocio_id = p_negocio and not ve.eliminado and ve.estado = 'cobrada'
        and ve.fecha between r.desde_ant and r.hasta_ant
    ) or exists (
      select 1 from gasto ga, rango r
      where ga.negocio_id = p_negocio and not ga.eliminado
        and ga.fecha between r.desde_ant and r.hasta_ant
    ) as hay
  ),

  -- --- LA SERIE DE INGRESOS CONTRA EGRESOS -------------------------
  -- Se genera el eje COMPLETO del periodo y se pegan los importes encima. Sin
  -- generarlo, un dia sin ventas simplemente no existiria y la linea saltaria
  -- de martes a jueves como si el miercoles no hubiera pasado.
  eje as (
    select case when r.paso = 'mes'
                then date_trunc('month', d)::date
                else d::date end as punto
    from rango r, generate_series(r.desde, r.hasta, interval '1 day') d
    group by 1
  ),
  serie as (
    select e.punto,
           coalesce((select sum(x.total_centavos) from v x, rango r
                      where case when r.paso = 'mes'
                                 then date_trunc('month', x.fecha)::date else x.fecha end = e.punto), 0) as ingresos,
           coalesce((select sum(y.monto_centavos) from g y, rango r
                      where case when r.paso = 'mes'
                                 then date_trunc('month', y.fecha)::date else y.fecha end = e.punto), 0) as egresos
    from eje e
  )

  select jsonb_build_object(
    'periodo', (select jsonb_build_object(
        'desde', r.desde, 'hasta', r.hasta, 'dias', r.dias,
        'desdeAnterior', r.desde_ant, 'hastaAnterior', r.hasta_ant,
        'paso', r.paso) from rango r),

    'hayComparacion', (select hay from hubo_antes),

    'metricas', jsonb_build_object(
      'ingresos',       (select monto from ingresos),
      'ingresosAntes',  (select antes from ingresos),
      'ventas',         (select count(*)::int from v),
      'ventasAntes',    (select count(*)::int from v_ant),
      'clientes',       (select n from atendidos),
      'clientesAntes',  (select n from atendidos_ant),
      'servicios',      (select count(*)::int from ct),
      'serviciosAntes', (select count(*)::int from ct_ant)
    ),

    'finanzas', jsonb_build_object(
      'ingresos', (select monto from ingresos),
      'egresos',  (select coalesce(sum(monto_centavos), 0) from g),
      -- LA UTILIDAD SE DERIVA, no se guarda: ingresos menos egresos. Un tercer
      -- numero guardado aparte se desincroniza de los otros dos.
      'utilidad', (select monto from ingresos) - (select coalesce(sum(monto_centavos), 0) from g),
      -- El margen necesita ingresos: sin ellos es `null`, no cero por ciento.
      'margen', (select case when monto = 0 then null
                  else round(((monto - (select coalesce(sum(monto_centavos), 0) from g))::numeric
                              / monto) * 100, 1) end from ingresos),
      'promedioDiario', (select round((select monto from ingresos)::numeric / greatest(r.dias, 1))
                          from rango r),
      'clientesNuevos', (select count(*)::int from cliente c, rango r
                          where c.negocio_id = p_negocio and not c.eliminado
                            and c.creado_en::date between r.desde and r.hasta),
      'serviciosRealizados', (select count(*)::int from ct),
      'cursosVendidos', (select coalesce(sum(cantidad), 0)::int from it where tipo = 'curso')
    ),

    'serie', coalesce((select jsonb_agg(jsonb_build_object(
        'punto', s.punto, 'ingresos', s.ingresos, 'egresos', s.egresos) order by s.punto)
      from serie s), '[]'::jsonb),

    -- Las categorias del ingreso NO son un catalogo: son los tipos que de
    -- verdad se vendieron. Si no se vendio ni un curso, "Cursos" no aparece.
    'categorias', coalesce((select jsonb_agg(jsonb_build_object(
        'clave', x.tipo, 'monto', x.monto, 'cuantos', x.cuantos) order by x.monto desc)
      from (select tipo, sum(subtotal_centavos) as monto, sum(cantidad)::int as cuantos
              from it group by tipo) x), '[]'::jsonb),

    'ventas', jsonb_build_object(
      'cobradas',  (select count(*)::int from v),
      'canceladas', (select count(*)::int from venta ve, rango r
                      where ve.negocio_id = p_negocio and not ve.eliminado
                        and ve.estado = 'cancelada' and ve.fecha between r.desde and r.hasta),
      -- Sin ventas el ticket es `null`, no cero: no se divide entre cero y
      -- "$0 de ticket promedio" se leeria como que se vendio regalado.
      'ticket',  (select case when count(*) = 0 then null
                    else round(sum(total_centavos)::numeric / count(*)) end from v),
      'maxima',  (select max(total_centavos) from v),
      'minima',  (select min(total_centavos) from v),
      'porMetodo', coalesce((select jsonb_agg(jsonb_build_object(
          'metodo', x.metodo, 'monto', x.monto, 'operaciones', x.n) order by x.monto desc)
        from (select pg.metodo, sum(pg.monto_centavos) as monto, count(*)::int as n
                from pago pg join v on v.id = pg.venta_id
               group by pg.metodo) x), '[]'::jsonb)
    ),

    'servicios', jsonb_build_object(
      'realizados', (select count(*)::int from ct),
      'ingresos', (select coalesce(sum(subtotal_centavos), 0) from it where tipo = 'servicio'),
      'ranking', coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'nombre', x.nombre, 'cantidad', x.cantidad, 'ingresos', x.ingresos)
          order by x.cantidad desc, x.ingresos desc)
        from (select vi.servicio_id as id, s.nombre,
                     sum(vi.cantidad)::int as cantidad, sum(vi.subtotal_centavos) as ingresos
                from it vi join servicio s on s.id = vi.servicio_id
               where vi.tipo = 'servicio'
               group by vi.servicio_id, s.nombre
               -- SE ORDENA ANTES DE CORTAR. Con el "limit" solo, Postgres
               -- devuelve diez filas CUALESQUIERA y el orden de afuera las
               -- acomoda entre ellas: la tarjeta se titula "mas realizados" y
               -- enseña diez al azar. No falla, no avisa y no se nota.
               order by cantidad desc, ingresos desc
               limit 10) x), '[]'::jsonb)
    ),

    'clientes', jsonb_build_object(
      'totales', (select count(*)::int from cliente c
                   where c.negocio_id = p_negocio and not c.eliminado),
      -- NUEVO es quien se dio de alta en el periodo, no quien compro por
      -- primera vez: alguien de hace dos años que vuelve hoy no es nuevo.
      'nuevos', (select count(*)::int from cliente c, rango r
                  where c.negocio_id = p_negocio and not c.eliminado
                    and c.creado_en::date between r.desde and r.hasta),
      'atendidos', (select n from atendidos),
      'recurrentes', (select count(*)::int from (
          select cliente_id from ct where cliente_id is not null
          group by cliente_id having count(*) > 1) x),
      'ranking', coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'nombre', x.nombre, 'visitas', x.visitas,
          'compras', x.compras, 'gastado', x.gastado)
          order by x.gastado desc, x.visitas desc)
        from (
          select c.id, c.nombre,
                 (select count(*)::int from ct where ct.cliente_id = c.id) as visitas,
                 (select count(*)::int from v where v.cliente_id = c.id) as compras,
                 (select coalesce(sum(total_centavos), 0) from v where v.cliente_id = c.id) as gastado
            from cliente c
           where c.negocio_id = p_negocio and not c.eliminado
             and (exists (select 1 from ct where ct.cliente_id = c.id)
                  or exists (select 1 from v where v.cliente_id = c.id))
           order by gastado desc, visitas desc
           limit 10) x), '[]'::jsonb)
    ),

    'productos', jsonb_build_object(
      'unidades', (select coalesce(sum(cantidad), 0)::int from it where tipo = 'producto'),
      'ingresos', (select coalesce(sum(subtotal_centavos), 0) from it where tipo = 'producto'),
      -- El stock es de HOY, no del periodo: un inventario historico pediria
      -- reconstruirlo movimiento a movimiento y no es lo que se pregunta aqui.
      'bajos', (select count(*)::int from producto p
                 where p.negocio_id = p_negocio and not p.eliminado and p.activo
                   and app.estado_de_stock(p.stock_actual, p.stock_minimo) = 'bajo'),
      'agotados', (select count(*)::int from producto p
                    where p.negocio_id = p_negocio and not p.eliminado and p.activo
                      and app.estado_de_stock(p.stock_actual, p.stock_minimo) = 'agotado'),
      'ranking', coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'nombre', x.nombre, 'cantidad', x.cantidad, 'ingresos', x.ingresos)
          order by x.cantidad desc, x.ingresos desc)
        from (select vi.producto_id as id, p.nombre,
                     sum(vi.cantidad)::int as cantidad, sum(vi.subtotal_centavos) as ingresos
                from it vi join producto p on p.id = vi.producto_id
               where vi.tipo = 'producto'
               group by vi.producto_id, p.nombre
               order by cantidad desc, ingresos desc
               limit 10) x), '[]'::jsonb)
    ),

    'cursos', jsonb_build_object(
      'vendidos', (select coalesce(sum(cantidad), 0)::int from it where tipo = 'curso'),
      'ingresos', (select coalesce(sum(subtotal_centavos), 0) from it where tipo = 'curso'),
      'inscritos', (select count(*)::int from inscripcion i, rango r
                     where i.negocio_id = p_negocio and i.estado <> 'cancelado'
                       and i.creado_en::date between r.desde and r.hasta),
      'proximos', (select count(*)::int from curso cu, rango r
                    where cu.negocio_id = p_negocio and not cu.eliminado
                      and cu.estado = 'programado' and cu.fecha_inicio >= r.hasta),
      'terminados', (select count(*)::int from curso cu, rango r
                      where cu.negocio_id = p_negocio and not cu.eliminado
                        and cu.estado = 'terminado'
                        and coalesce(cu.fecha_fin, cu.fecha_inicio) between r.desde and r.hasta),
      'ranking', coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'nombre', x.nombre, 'cantidad', x.cantidad,
          'ingresos', x.ingresos, 'inscritos', x.inscritos, 'cupo', x.cupo)
          order by x.cantidad desc, x.ingresos desc)
        from (select vi.curso_id as id, cu.nombre, cu.cupo,
                     sum(vi.cantidad)::int as cantidad, sum(vi.subtotal_centavos) as ingresos,
                     (select count(*)::int from inscripcion i
                       where i.curso_id = cu.id and i.estado <> 'cancelado') as inscritos
                from it vi join curso cu on cu.id = vi.curso_id
               where vi.tipo = 'curso'
               -- "cu.id" VA EN EL AGRUPADO aunque parezca de sobra al lado de
               -- "vi.curso_id": la subconsulta de los inscritos lo usa, y sin
               -- el Postgres rechaza la funcion entera con "subquery uses
               -- ungrouped column". Es un error de EJECUCION, no de sintaxis:
               -- no lo caza crear la funcion, solo llamarla — que es por lo
               -- que salio al pegar el instalador y no antes.
               group by vi.curso_id, cu.id, cu.nombre, cu.cupo
               order by cantidad desc, ingresos desc
               limit 10) x), '[]'::jsonb)
    ),

    'gastos', jsonb_build_object(
      'total',   (select coalesce(sum(monto_centavos), 0) from g),
      'cuantos', (select count(*)::int from g),
      'promedio', (select case when count(*) = 0 then null
                    else round(sum(monto_centavos)::numeric / count(*)) end from g),
      'mayor', (select max(monto_centavos) from g),
      'menor', (select min(monto_centavos) from g),
      -- EL NOMBRE SE RESUELVE POR LA REFERENCIA, no por la columna vieja.
      -- `gasto.categoria` es texto y se quedo en 'general' para todo cuando
      -- Gastos paso a usar `categoria_id`: agrupar por ella habria pintado la
      -- pestaña entera con una sola barra llamada "general". Y resolverlo al
      -- leer —en vez de copiar el nombre— es lo que hace que renombrar una
      -- categoria se vea al dia en los reportes viejos.
      'categorias', coalesce((select jsonb_agg(jsonb_build_object(
          'categoria', x.categoria, 'monto', x.monto, 'cuantos', x.n) order by x.monto desc)
        from (select coalesce(c.nombre, nullif(gg.categoria, 'general'), 'Sin categoría') as categoria,
                     sum(gg.monto_centavos) as monto, count(*)::int as n
                from g gg
                left join categoria c
                       on c.id = gg.categoria_id and c.negocio_id = p_negocio
               group by 1) x), '[]'::jsonb)
    ),

    -- --- CAJA -------------------------------------------------------
    -- Salen de los movimientos REALES, no se reconstruyen. Un movimiento
    -- reconstruido a partir de las ventas se perderia los ingresos y retiros
    -- capturados a mano, que son justo los que descuadran un corte.
    'caja', jsonb_build_object(
      'ventas', (select coalesce(sum(mc.monto_centavos), 0) from movimiento_caja mc, rango r
                  where mc.negocio_id = p_negocio and mc.origen in ('venta', 'pago')
                    and mc.tipo = 'ingreso' and mc.fecha between r.desde and r.hasta),
      'ingresosManuales', (select coalesce(sum(mc.monto_centavos), 0) from movimiento_caja mc, rango r
                            where mc.negocio_id = p_negocio and mc.origen = 'ajuste'
                              and mc.tipo = 'ingreso' and mc.fecha between r.desde and r.hasta),
      'retiros', (select coalesce(sum(mc.monto_centavos), 0) from movimiento_caja mc, rango r
                   where mc.negocio_id = p_negocio and mc.origen = 'ajuste'
                     and mc.tipo = 'egreso' and mc.fecha between r.desde and r.hasta),
      'gastosDeCaja', (select coalesce(sum(mc.monto_centavos), 0) from movimiento_caja mc, rango r
                        where mc.negocio_id = p_negocio and mc.origen = 'gasto'
                          and mc.fecha between r.desde and r.hasta),
      'movimientos', (select count(*)::int from movimiento_caja mc, rango r
                       where mc.negocio_id = p_negocio and mc.fecha between r.desde and r.hasta),
      -- Los cortes YA FIRMADOS del periodo. No se recalculan: se leen tal cual
      -- se congelaron al cerrar, que es lo que los hace auditables.
      'cortes', coalesce((select jsonb_agg(jsonb_build_object(
          'id', s.id, 'nombre', s.nombre, 'cerradaEn', s.cerrada_en,
          'saldoInicial', s.saldo_inicial_centavos, 'esperado', s.esperado_centavos,
          'contado', s.contado_centavos, 'diferencia', s.diferencia_centavos)
          order by s.cerrada_en desc)
        from sesion_caja s, rango r
        where s.negocio_id = p_negocio and s.estado = 'cerrada'
          and s.cerrada_en::date between r.desde and r.hasta), '[]'::jsonb),
      'descuadre', (select coalesce(sum(s.diferencia_centavos), 0) from sesion_caja s, rango r
                     where s.negocio_id = p_negocio and s.estado = 'cerrada'
                       and s.cerrada_en::date between r.desde and r.hasta)
    )
  );
$$;

grant execute on function public.reporte_del_periodo(text, date, date, text, text, uuid) to authenticated;

comment on function public.reporte_del_periodo is
  'TODO el reporte en UNA llamada, contado en el momento desde las tablas de cada modulo. No hay '
  'tabla de reportes ni totales guardados: un total guardado se desincroniza a la primera venta '
  'cancelada. Una sola llamada garantiza que las ocho pestañas hablen del mismo periodo.';

-- =====================================================================
-- REPORTES GUARDADOS
-- =====================================================================
--
-- LO QUE SE GUARDA ES LA PREGUNTA, NO LA RESPUESTA. Un reporte guardado no
-- conserva cifras: conserva el periodo y los filtros con los que se hizo. Al
-- reabrirlo se vuelve a calcular.
--
-- Es a proposito y es lo unico correcto: si guardara las cifras, un reporte de
-- junio abierto en agosto seguiria enseñando lo que decia en junio aunque desde
-- entonces se hubiera cancelado una venta de ese mes. Diria un numero que ya no
-- es verdad, con fecha y firma.
create table if not exists reporte_guardado (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  nombre         text not null,
  -- Que pestaña se estaba viendo: resumen, ventas, servicios…
  tipo           text not null default 'resumen',
  desde          date not null,
  hasta          date not null,
  -- Los filtros tal cual, para poder reconstruir la pantalla exacta.
  filtros        jsonb not null default '{}'::jsonb,
  creado_por     uuid,
  creado_por_nombre text,
  creado_en      timestamptz not null default now(),
  eliminado      boolean not null default false
);

comment on table reporte_guardado is
  'Guarda la PREGUNTA (periodo y filtros), nunca la respuesta. Un reporte con cifras congeladas '
  'seguiria afirmando un total que dejo de ser verdad en cuanto se cancelara una venta de ese mes.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reporte_guardado_negocio_id_unico') then
    alter table reporte_guardado add constraint reporte_guardado_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

create index if not exists reporte_guardado_negocio_idx
  on reporte_guardado (negocio_id, creado_en desc) where not eliminado;

alter table reporte_guardado enable row level security;
alter table reporte_guardado force row level security;

drop policy if exists reporte_guardado_ver on reporte_guardado;
create policy reporte_guardado_ver on reporte_guardado
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists reporte_guardado_escribir on reporte_guardado;
create policy reporte_guardado_escribir on reporte_guardado
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

drop policy if exists reporte_guardado_cambiar on reporte_guardado;
create policy reporte_guardado_cambiar on reporte_guardado
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'verFinanzas'));

create or replace function public.guardar_reporte(
  p_negocio text,
  p_nombre  text,
  p_tipo    text,
  p_desde   date,
  p_hasta   date,
  p_filtros jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_quien membresia;
begin
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El reporte necesita un nombre para poder encontrarlo despues.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into reporte_guardado (negocio_id, nombre, tipo, desde, hasta, filtros,
                                creado_por, creado_por_nombre)
  values (p_negocio, btrim(p_nombre), coalesce(p_tipo, 'resumen'), p_desde, p_hasta,
          coalesce(p_filtros, '{}'::jsonb), auth.uid(), coalesce(v_quien.nombre, 'desconocido'))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.guardar_reporte(text, text, text, date, date, jsonb) to authenticated;

create or replace function public.reportes_guardados(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'nombre', r.nombre, 'tipo', r.tipo,
      'desde', r.desde, 'hasta', r.hasta, 'filtros', r.filtros,
      'creadoEn', r.creado_en, 'creadoPor', r.creado_por_nombre)
      order by r.creado_en desc), '[]'::jsonb)
  from reporte_guardado r
  where r.negocio_id = p_negocio and not r.eliminado;
$$;

grant execute on function public.reportes_guardados(text) to authenticated;

create or replace function public.borrar_reporte(p_reporte uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update reporte_guardado set eliminado = true where id = p_reporte;
$$;

grant execute on function public.borrar_reporte(uuid) to authenticated;
