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

/*
 * ESTA COLUMNA SUBE AQUI, Y NO ES ORDEN: ES QUE EL ARCHIVO NO SE PODIA
 * INSTALAR DE CERO.
 *
 * `acepta_promociones` la agrega el bloque de Mensajes, cuatro mil lineas mas
 * abajo. Pero `clientes_del_centro` —que vive en el bloque 2, mucho antes— la
 * LEE, y es una funcion de lenguaje `sql`: Postgres SI parsea su cuerpo al
 * crearla. En la base de verdad no se nota, porque cuando esa funcion se
 * recreo la columna ya existia de una corrida anterior; en una base NUEVA el
 * instalador muere con "column f.acepta_promociones does not exist" y todo lo
 * que va despues se queda sin aplicar.
 *
 * Se vio levantando una Postgres limpia y aplicando el archivo entero, que es
 * la unica forma de verlo. Se queda tambien la de mas abajo: es
 * `if not exists`, asi que no hace nada la segunda vez.
 */
alter table cliente add column if not exists acepta_promociones boolean not null default true;

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
-- LA HORA DE FIN DE UNA CITA SE CALCULA — Y TAMBIEN LO QUE OCUPA DE VERDAD
-- ---------------------------------------------------------------------
--
-- Si la escribe la persona, tarde o temprano hay una cita de Reiki de 60
-- minutos que termina 20 minutos despues de empezar, y la agenda del dia
-- deja de cuadrar.
--
-- Y ADEMAS SE CALCULA EL BLOQUEO, que es lo que la sala esta ocupada de
-- verdad. Un masaje con piedras de 10:00 a 11:00 deja quince minutos de
-- limpiar, recoger y preparar la siguiente terapia: si la agenda deja poner
-- otra cita a las 11:00, esa cita no se puede dar. El sistema estaba
-- ofreciendo un horario que fisicamente no existe.
--
-- POR QUE SE GUARDAN LAS DOS HORAS Y NO SE CALCULAN AL LEER: porque quien
-- impide el choque es una restriccion de exclusion de la base, y una
-- restriccion no puede consultar otra tabla. Ademas son la FOTO de lo que se
-- acordo: si mañana el servicio pasa de quince minutos de limpieza a treinta,
-- las citas de la semana pasada siguieron ocupando quince.
--
create or replace function app.cita_hora_fin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duracion int;
  v_antes    int := 0;
  v_despues  int := 0;
  v_ini      time;
  v_fin      time;
begin
  if new.hora_fin is null or new.hora_fin <= new.hora_inicio then
    select duracion_min into v_duracion from servicio where id = new.servicio_id;
    new.hora_fin := new.hora_inicio + make_interval(mins => coalesce(v_duracion, 60));
  end if;

  select p.antes, p.despues into v_antes, v_despues
    from app.preparacion_del_servicio(new.servicio_id) p;
  v_antes := coalesce(v_antes, 0);
  v_despues := coalesce(v_despues, 0);

  /*
   * LA HORA SE DA LA VUELTA, Y ESO ROMPE EL RANGO.
   *
   * En Postgres `time '00:05' - interval '10 min'` NO da un error: da
   * `23:55`. Con eso, una cita de las 00:05 con diez minutos de preparacion
   * guardaria un bloqueo que empieza a las 23:55 y termina a la 1:05 — un
   * rango invertido que la restriccion de exclusion rechaza con un mensaje
   * que no menciona nada de esto. Se detecta por la vuelta, no por comparar
   * con las cero horas: es la unica señal fiable.
   */
  v_ini := new.hora_inicio - make_interval(mins => v_antes);
  if v_ini > new.hora_inicio then v_ini := time '00:00'; end if;
  v_fin := new.hora_fin + make_interval(mins => v_despues);
  if v_fin < new.hora_fin then v_fin := time '23:59:59'; end if;

  new.bloqueo_inicio := v_ini;
  new.bloqueo_fin := v_fin;
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

-- >>> LLEVAR AL ACTUALIZADOR
-- =====================================================================
-- BLOQUE 12 — LAS COLUMNAS Y LOS AYUDANTES QUE USA TODO LO DEMAS
-- =====================================================================
--
-- ESTO VIVE AQUI ARRIBA Y NO CON EL RESTO DEL BLOQUE 12, y no es por gusto:
-- `servicios_del_centro`, `ficha_del_servicio`, `citas_del_rango` y
-- `ficha_del_curso` son funciones `language sql`, y a esas Postgres SI les
-- valida el cuerpo al crearlas. Si las columnas y los ayudantes nacieran al
-- final del archivo, el instalador se caeria mil lineas antes de llegar ahi
-- diciendo que no existe `app.preparacion_del_servicio` — y el error no
-- mencionaria el orden, que es lo unico que estaria mal.
--
-- La marca de arriba se la lleva `scripts/actualizar-base.ts` a
-- `ACTUALIZAR-BASE.sql`: sin ella, todo esto se quedaria antes de la frontera
-- y la base publicada recibiria las funciones nuevas sin las columnas que
-- necesitan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LA PREPARACION: los minutos que una sesion ocupa ADEMAS de su duracion
-- ---------------------------------------------------------------------
--
-- Un masaje con piedras calientes de 10:00 a 11:00 no libera la sala a las
-- 11:00: hay que limpiar, recoger las piedras, cambiar el material y preparar
-- la siguiente terapia. Si la agenda deja poner otra cita a las 11:00, esa
-- cita no se puede dar — y el sistema la ofrecio.
--
-- NULO NO ES CERO, y esta distincion es toda la herencia:
--
--   · un numero  → lo que dice el servicio, y manda sobre todo lo demas;
--   · NULO       → "lo que diga mi categoria";
--   · sin nada en la categoria tampoco → cero.
--
-- Que el cero se pueda escribir a proposito es justo lo que permite que un
-- servicio se salga de la regla de su categoria sin tener que sacarlo de ella.
alter table servicio add column if not exists preparacion_antes_min int;
alter table servicio add column if not exists preparacion_despues_min int;
alter table servicio drop constraint if exists servicio_preparacion_razonable;
alter table servicio add constraint servicio_preparacion_razonable check (
  (preparacion_antes_min is null or (preparacion_antes_min between 0 and 240))
  and (preparacion_despues_min is null or (preparacion_despues_min between 0 and 240))
);

comment on column servicio.preparacion_despues_min is
  'Minutos que la sala sigue ocupada DESPUES de terminar la sesion: limpiar, recoger, preparar. '
  'Bloquean agenda de verdad. NULO significa "lo que diga mi categoria", no cero.';

-- La categoria pone el valor por omision de sus servicios. Es donde de verdad
-- se parece: todos los masajes necesitan mas limpieza que todas las lecturas.
alter table categoria add column if not exists preparacion_antes_min int;
alter table categoria add column if not exists preparacion_despues_min int;
alter table categoria drop constraint if exists categoria_preparacion_razonable;
alter table categoria add constraint categoria_preparacion_razonable check (
  (preparacion_antes_min is null or (preparacion_antes_min between 0 and 240))
  and (preparacion_despues_min is null or (preparacion_despues_min between 0 and 240))
);

/**
 * LA HERENCIA, RESUELTA EN UN SOLO SITIO.
 *
 * Servicio → categoria → cero. Si esta cuenta se escribiera en cada pantalla
 * que la necesita, el dia que cambie el orden habria que acordarse de las
 * cuatro — y la que se olvide bloqueara horarios distintos que las otras tres.
 */
create or replace function app.preparacion_del_servicio(p_servicio uuid)
returns table (antes int, despues int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(s.preparacion_antes_min, c.preparacion_antes_min, 0),
         coalesce(s.preparacion_despues_min, c.preparacion_despues_min, 0)
    from servicio s
    left join categoria c on c.id = s.categoria_id
   where s.id = p_servicio;
$$;

comment on function app.preparacion_del_servicio is
  'La prioridad del encargo, en un solo lugar: configuracion del SERVICIO, luego la de su '
  'CATEGORIA, luego cero. Nulo en el servicio es "heredo"; cero es "ninguno, y lo digo yo".';

-- Lo que una cita ocupa DE VERDAD, con su preparacion incluida. Lo escribe el
-- disparador `app.cita_hora_fin` y lo vigila la restriccion de choque.
alter table cita add column if not exists bloqueo_inicio time;
alter table cita add column if not exists bloqueo_fin time;

comment on column cita.bloqueo_fin is
  'Hora en que la sala queda libre de verdad: la de fin mas la preparacion posterior. Se GUARDA '
  'y no se calcula al leer porque la restriccion de exclusion que impide los choques no puede '
  'consultar otra tabla — y porque es la foto de lo que se acordo al agendar.';

-- ---------------------------------------------------------------------
-- 2. LA CITA COBRADA: de que cita nacio una venta
-- ---------------------------------------------------------------------
--
-- La relacion vive EN LA VENTA y no en la cita, y la direccion importa. Un
-- campo `cobrada` en `cita` seria un segundo lugar donde vive la misma verdad:
-- el dia que se cancele la venta se quedaria diciendo que si, y esa sesion se
-- cobraria dos veces sin que nada avisara.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cita_negocio_id_unico') then
    alter table cita add constraint cita_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

alter table venta add column if not exists cita_id uuid;

alter table venta drop constraint if exists venta_cita_mismo_negocio;
alter table venta add constraint venta_cita_mismo_negocio
  foreign key (negocio_id, cita_id) references cita (negocio_id, id)
  -- Compuesta como todas: sin esto se podria colgar una venta de este centro
  -- de la cita de otro, porque las llaves foraneas no obedecen las reglas de
  -- fila. `set null (columna)` nombra la que se vacia: un `set null` pelon
  -- vaciaria tambien `negocio_id`, que no acepta nulos.
  on delete set null (cita_id);

/**
 * UNA CITA SE COBRA UNA VEZ. LO IMPIDE LA BASE, NO LA PANTALLA.
 *
 * El boton apagado ayuda y no defiende: la pestaña de al lado no sabe de este
 * boton, y dos personas en dos mostradores cobran la misma sesion sin que
 * ninguna vea a la otra. Un indice unico no tiene ventana.
 *
 * Solo cuenta lo COBRADO: una venta cancelada libera la cita, que es lo que
 * uno espera —se cancelo el cobro, hay que volver a cobrar—.
 */
create unique index if not exists venta_una_por_cita
  on venta (negocio_id, cita_id)
  where cita_id is not null and not eliminado and estado = 'cobrada';

-- ---------------------------------------------------------------------
-- 3. EL VIDEO DE PRESENTACION DE UN CURSO
-- ---------------------------------------------------------------------
--
-- SE GUARDA EL IDENTIFICADOR, NO LA DIRECCION. Guardar la URL que alguien pego
-- y meterla despues en un `iframe` es dejar que quien edite un curso incruste
-- el sitio que quiera dentro del sistema. Con los once caracteres del video, la
-- direccion la arma el producto y siempre apunta a YouTube.
alter table curso add column if not exists video_youtube text;
alter table curso drop constraint if exists curso_video_identificador;
alter table curso add constraint curso_video_identificador check (
  video_youtube is null or video_youtube ~ '^[A-Za-z0-9_-]{11}$'
);

comment on column curso.video_youtube is
  'El identificador de once caracteres del video, NUNCA la URL. La direccion la arma la pantalla, '
  'y por eso no hay forma de que un curso incruste otra cosa que un video de YouTube.';

/**
 * EL IDENTIFICADOR DE UN ENLACE DE YOUTUBE, en todas sus formas.
 *
 * El mismo video llega escrito de seis maneras y todas son legitimas:
 *
 *     youtube.com/watch?v=ID          el de la barra de direcciones
 *     youtu.be/ID                     el de "Compartir"
 *     youtube.com/embed/ID            el de "Insertar"
 *     youtube.com/shorts/ID           los verticales
 *     youtube.com/live/ID             las transmisiones
 *     ...cualquiera de los anteriores con &t=90, ?si=... o &list=...
 *
 * Devuelve NULO si no reconoce ninguno — nunca se inventa un identificador.
 * Vive en la base y no solo en la pantalla porque la pantalla se puede saltar:
 * quien llame a `guardar_curso` a mano tiene que pasar por aqui igual.
 */
create or replace function app.identificador_de_youtube(p_texto text)
returns text
language plpgsql
immutable
as $$
declare
  v_limpio text := btrim(coalesce(p_texto, ''));
  v_id     text;
begin
  if v_limpio = '' then return null; end if;

  -- Ya viene pelado: once caracteres y nada mas.
  if v_limpio ~ '^[A-Za-z0-9_-]{11}$' then return v_limpio; end if;

  -- `substring` con un grupo devuelve el grupo. El `(?:...)` de delante no
  -- captura, asi que lo que sale es siempre el identificador.
  v_id := substring(v_limpio from '(?:v=|/embed/|/shorts/|/live/|youtu\.be/|/v/)([A-Za-z0-9_-]{11})');
  if v_id is not null then return v_id; end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. LAS FIRMAS QUE CAMBIARON
-- ---------------------------------------------------------------------
--
-- `guardar_servicio` y `guardar_curso` ganan argumentos. Postgres no sustituye
-- una funcion cuando cambia su lista de argumentos: crea OTRA con el mismo
-- nombre. Y con dos, PostgREST no sabe a cual llamar y contesta "Could not
-- choose the best candidate function" a todo el mundo. Asi que la vieja se va.
--
-- Van con `if exists` porque en una instalacion nueva nunca existieron.
drop function if exists public.guardar_servicio(
  text, uuid, text, text, uuid, int, bigint, bigint, date, date, text, boolean,
  text, text, text, time, time, boolean);
drop function if exists public.guardar_curso(
  text, uuid, text, text, text, uuid, uuid, date, date, bigint, int, text, text,
  text, text, text, boolean);
-- <<< LLEVAR AL ACTUALIZADOR

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
        -- LOS MINUTOS QUE DE VERDAD SE VAN A BLOQUEAR, ya resueltos: los del
        -- servicio si los tiene, si no los de su categoria, si no cero. La
        -- lista enseña lo que va a pasar, no lo que esta escrito en la fila.
        'preparacionAntesMin', (select antes from app.preparacion_del_servicio(f.id)),
        'preparacionDespuesMin', (select despues from app.preparacion_del_servicio(f.id)),
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
    /*
     * LOS MINUTOS DE PREPARACION VAN EN DOS PARES, y hacen falta los dos.
     *
     * El par "…Min" es lo ESCRITO en el servicio, y puede ser nulo: nulo
     * significa "lo que diga mi categoria", no cero. El par "efectiva…" es lo
     * que de verdad se va a bloquear despues de resolver la herencia.
     *
     * Con uno solo, el formulario no puede distinguir "no lo he puesto" de
     * "lo puse en cero a proposito" — y son cosas distintas: la primera sigue
     * a la categoria y la segunda la desobedece.
     */
    'preparacionAntesMin', s.preparacion_antes_min,
    'preparacionDespuesMin', s.preparacion_despues_min,
    'efectivaAntesMin', (select antes from app.preparacion_del_servicio(s.id)),
    'efectivaDespuesMin', (select despues from app.preparacion_del_servicio(s.id)),
    'categoriaAntesMin', (select k.preparacion_antes_min from categoria k where k.id = s.categoria_id),
    'categoriaDespuesMin', (select k.preparacion_despues_min from categoria k where k.id = s.categoria_id),
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
  p_activo boolean default true,
  -- NULO NO ES CERO. Nulo es "lo que diga mi categoria"; cero es "ninguno, y
  -- lo digo yo". Por eso no llevan `coalesce` al guardar.
  p_preparacion_antes int default null,
  p_preparacion_despues int default null
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
  /*
   * EL TOPE DE CUATRO HORAS NO ES UN CAPRICHO.
   *
   * La preparacion BLOQUEA agenda de verdad. Un cero de mas —"150" en vez de
   * "15"— convierte un servicio de una hora en un bloque de dos y media, y lo
   * que se ve despues es "no hay horarios disponibles" sin ninguna pista de
   * por que. Se rechaza en la puerta y con el numero delante.
   */
  if p_preparacion_antes is not null and (p_preparacion_antes < 0 or p_preparacion_antes > 240) then
    raise exception 'La preparacion previa son entre 0 y 240 minutos, no %.', p_preparacion_antes
      using errcode = 'invalid_parameter_value';
  end if;
  if p_preparacion_despues is not null and (p_preparacion_despues < 0 or p_preparacion_despues > 240) then
    raise exception 'La preparacion posterior son entre 0 y 240 minutos, no %.', p_preparacion_despues
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if p_id is null then
    insert into servicio (negocio_id, nombre, descripcion, categoria_id, duracion_min,
                          precio_centavos, precio_promocional_centavos, promocion_desde,
                          promocion_hasta, color, requiere_preparacion, preparacion, notas,
                          dias_disponibles, hora_desde, hora_hasta, activo,
                          preparacion_antes_min, preparacion_despues_min)
    values (p_negocio, btrim(p_nombre), p_descripcion, p_categoria, p_duracion,
            p_precio, p_promo, p_promo_desde, p_promo_hasta, p_color,
            coalesce(p_requiere_preparacion, false), p_preparacion, p_notas,
            p_dias, p_hora_desde, p_hora_hasta, coalesce(p_activo, true),
            p_preparacion_antes, p_preparacion_despues)
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
         activo = coalesce(p_activo, v_s.activo),
         preparacion_antes_min = p_preparacion_antes,
         preparacion_despues_min = p_preparacion_despues,
         actualizado_en = now()
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
          'videoYoutube', f.video_youtube,
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
    -- El identificador pelon, no una direccion. La arma la pantalla, y por eso
    -- siempre apunta a YouTube pase lo que pase con lo que se pego.
    'videoYoutube', c.video_youtube,
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
  -- El impuesto configurado del centro. Ver el bloque de los totales.
  v_tasa      numeric := 0;
  v_incluido  boolean := true;
  v_base      bigint := 0;
  v_impuesto  bigint := 0;
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

  /*
   * EL IMPUESTO SALE DE CONFIGURACION, Y SE CALCULA AQUI.
   *
   * Hasta el bloque 10 esto era un cero escrito a mano con un comentario que
   * decia "si el centro los cobra, se declaran en Configuracion" — y no habia
   * donde declararlos. Ahora si: `estado.data.centro.impuestoTasa` y
   * `impuestoIncluido`.
   *
   * SE CALCULA EN EL SERVIDOR Y NO EN EL NAVEGADOR, por la misma razon que
   * todo lo demas de esta funcion: el precio, el total y el impuesto tienen que
   * salir de la misma cuenta indivisible. Un impuesto calculado en el navegador
   * y mandado como parametro es un impuesto que se puede cambiar a mano.
   *
   * DOS CUENTAS DISTINTAS, y confundirlas cambia lo que el cliente paga:
   *
   *   · INCLUIDO: el precio ya lo trae dentro. Se saca hacia atras
   *     —base x tasa / (100 + tasa)— y el TOTAL NO SE TOCA. Es lo normal en
   *     Mexico: el precio de la lista es el que se cobra.
   *   · NO INCLUIDO: se suma encima, y el total sube.
   *
   * LO YA COBRADO NO SE TOCA. Esta cuenta solo corre al registrar una venta
   * nueva: cambiar la tasa hoy no reescribe el mes pasado, que es justo lo que
   * hace que un reporte viejo se pueda seguir creyendo.
   */
  select coalesce((e.data -> 'centro' ->> 'impuestoTasa')::numeric, 0),
         coalesce((e.data -> 'centro' ->> 'impuestoIncluido')::boolean, true)
    into v_tasa, v_incluido
    from estado e where e.negocio_id = p_negocio;

  v_tasa := coalesce(v_tasa, 0);
  v_incluido := coalesce(v_incluido, true);
  v_base := v_subtotal - p_descuento;

  if v_tasa <= 0 then
    v_impuesto := 0;
    v_total := v_base;
  elsif v_incluido then
    v_impuesto := round(v_base * v_tasa / (100 + v_tasa));
    v_total := v_base;
  else
    v_impuesto := round(v_base * v_tasa / 100);
    v_total := v_base + v_impuesto;
  end if;

  update venta
     set subtotal_centavos = v_subtotal,
         descuento_centavos = p_descuento,
         impuesto_centavos = v_impuesto,
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
      -- LA COLUMNA FALTABA AQUI Y LA FUNCION LA DEVOLVIA ABAJO. El bloque de
      -- Mensajes agrego `aceptaPromociones` a lo que sale, y nadie la agrego a
      -- esta lista: `f.acepta_promociones` no existia en el CTE. La funcion
      -- entera se negaba a crearse —"column f.acepta_promociones does not
      -- exist"— y con ella se caia todo el resto del instalador.
      --
      -- POR QUE NO SE NOTO NUNCA: en la base de verdad esta funcion se aplico
      -- por ultima vez antes de ese cambio, asi que ahi corre una version vieja
      -- que si funciona. Solo aparece al instalar de cero, y eso no lo hacia
      -- nadie. Se vio levantando una Postgres limpia y aplicando el archivo.
      c.acepta_promociones,
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
        'aceptaPromociones', f.acepta_promociones,
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
      'profesional', m.nombre,
      /*
       * LA FRANJA DE PREPARACION, tal como se guardo al agendar.
       *
       * Sale del bloqueo y no del servicio de hoy, por la misma razon que la
       * duracion: cambiar la limpieza de un servicio de quince a treinta
       * minutos no reescribe lo que ocupo la agenda del mes pasado.
       */
      'preparacionAntesMin',
        extract(epoch from (c.hora_inicio - coalesce(c.bloqueo_inicio, c.hora_inicio)))::int / 60,
      'preparacionDespuesMin',
        extract(epoch from (coalesce(c.bloqueo_fin, c.hora_fin) - c.hora_fin))::int / 60,
      /*
       * SI ESTA CITA YA SE COBRO, Y CON QUE VENTA.
       *
       * No es un estado guardado en la cita: es la venta la que sabe de que
       * cita nacio. Un campo `cobrada` en `cita` seria un segundo lugar donde
       * vive la misma verdad, y el dia que se cancele la venta se quedaria
       * diciendo que si — que es como se cobra dos veces la misma sesion.
       *
       * De aqui sale la diferencia entre "Completada — pendiente de cobro" y
       * "Completada — cobrada", que la pantalla calcula y no guarda.
       */
      'ventaId', (
        select v.id from venta v
        where v.negocio_id = c.negocio_id and v.cita_id = c.id
          and v.estado = 'cobrada' and not v.eliminado
        limit 1
      )
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
    /*
     * EL `round` NO SOBRA, Y SU FALTA TIRO LA PANTALLA DE GASTOS ENTERA:
     *
     *   formatearMoneda() recibio "67222.58066516129", que no son centavos
     *   enteros. El dinero del sistema SIEMPRE es un entero de centavos.
     *
     * `sum()` de un `bigint` devuelve NUMERIC —no bigint—, asi que dividirlo
     * entre los dias da decimales en cuanto no toca exacto. Con el centro
     * vacio, cero entre sesenta y dos daba cero clavado y no se veia; con
     * sesenta y cuatro gastos de verdad, la division cayo en un numero con doce
     * decimales y la guardia de la base —que hace bien en existir— tumbo la
     * pantalla.
     *
     * Se redondea AQUI, en el servidor, y no al pintar: el dinero sale entero
     * de la base o no sale. Redondear en el navegador seria dejar que cada
     * pantalla decidiera por su cuenta cuantos centavos son un centavo.
     */
    'promedioDiarioCentavos',
      round(coalesce((select sum(monto_centavos) from actual), 0)
            / (select n from dias))::bigint,
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

-- =====================================================================
-- MENSAJES — la capa de comunicacion con los clientes
-- =====================================================================
--
-- MENSAJES NO ES UNA SEGUNDA BASE DE DATOS DEL SISTEMA, y esa es toda su
-- arquitectura. No guarda el nombre del cliente, ni su telefono, ni su saldo,
-- ni la fecha de su cita: guarda `cliente_id` y lo demas se resuelve al leer.
-- El dia que alguien cambie de apellido, todas las conversaciones viejas lo
-- dicen al dia sin tocar nada — y no hay forma de que existan dos versiones de
-- la misma persona.
--
-- LAS CUATRO CAPAS, y por que estan separadas:
--
--   mensaje  ->  conversacion  ->  canal  ->  proveedor
--
-- El proveedor (WhatsApp, SMS, correo) es lo unico que cambia entre canales, y
-- vive FUERA de estas tablas. Si el modulo hablara de WhatsApp directamente,
-- agregar SMS obligaria a reescribirlo entero; asi, un canal nuevo es un
-- renglon en `canal_de_mensajes` y un adaptador nuevo del lado del servidor.
--
-- AQUI NO HAY NI UNA CREDENCIAL, Y ES A PROPOSITO. Estas tablas las lee el
-- navegador a traves de las reglas de fila: cualquier cosa guardada aqui es
-- cualquier cosa que se puede leer desde la consola del navegador. Los tokens
-- del proveedor van en las variables de entorno del servidor que los use, y
-- ese servidor todavia no existe — ver `canal_de_mensajes`.

-- ---------------------------------------------------------------------
-- 1. LAS ETIQUETAS SE SUMAN A LAS CATEGORIAS QUE YA HABIA
-- ---------------------------------------------------------------------
--
-- No se crea una tabla de etiquetas. `categoria` ya sirve a servicios, cursos,
-- productos y gastos con su `ambito`, ya tiene color, ya tiene su pantalla de
-- administracion y sus reglas de fila. Una tabla paralela seria el mismo
-- concepto con dos nombres, y el dia que se renombre una etiqueta habria que
-- acordarse de cual de las dos.
alter table categoria drop constraint if exists categoria_ambito_check;
alter table categoria add constraint categoria_ambito_check
  check (ambito in ('servicio', 'curso', 'producto', 'gasto', 'conversacion'));

-- ---------------------------------------------------------------------
-- 2. LOS CANALES
-- ---------------------------------------------------------------------
--
-- UN CANAL NO SE PUEDE DECLARAR "CONECTADO" DESDE EL NAVEGADOR. El estado
-- arranca en 'sin_conectar' y solo lo mueve quien de verdad hablo con el
-- proveedor, que es el servidor. Dejar que la pantalla lo pusiera en
-- 'conectado' seria pintar un candado cerrado en una puerta abierta: se
-- intentaria enviar, fallaria cada vez, y la culpa pareceria del mensaje.
--
-- `configuracion` guarda lo que NO es secreto: el numero visible, el nombre de
-- la cuenta, el identificador publico. Los tokens NO van aqui — ver la cabeza
-- de este bloque.
create table if not exists canal_de_mensajes (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  tipo           text not null check (tipo in ('whatsapp', 'sms', 'correo', 'manual')),
  nombre         text not null,
  -- El numero o la cuenta que ve el cliente. Nulo mientras no se conecte.
  identificador  text,
  estado         text not null default 'sin_conectar'
                 check (estado in ('sin_conectar', 'conectado', 'error')),
  detalle_error  text,
  ultima_sincronizacion timestamptz,
  configuracion  jsonb not null default '{}'::jsonb,
  activo         boolean not null default true,
  eliminado      boolean not null default false,
  creado_en      timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'canal_de_mensajes_negocio_id_unico') then
    alter table canal_de_mensajes add constraint canal_de_mensajes_negocio_id_unico
      unique (negocio_id, id);
  end if;
end $$;

create index if not exists canal_de_mensajes_negocio_idx
  on canal_de_mensajes (negocio_id) where not eliminado;

alter table canal_de_mensajes enable row level security;
alter table canal_de_mensajes force row level security;

drop policy if exists canal_de_mensajes_ver on canal_de_mensajes;
create policy canal_de_mensajes_ver on canal_de_mensajes
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists canal_de_mensajes_escribir on canal_de_mensajes;
create policy canal_de_mensajes_escribir on canal_de_mensajes
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists canal_de_mensajes_cambiar on canal_de_mensajes;
create policy canal_de_mensajes_cambiar on canal_de_mensajes
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

comment on table canal_de_mensajes is
  'Por donde se habla con el cliente. El estado solo lo mueve el servidor que de verdad hablo con el '
  'proveedor: declararse conectado desde el navegador haria fallar cada envio culpando al mensaje. '
  'NUNCA guardar tokens aqui — el navegador lee esta tabla.';

-- ---------------------------------------------------------------------
-- 3. LA CONVERSACION
-- ---------------------------------------------------------------------
--
-- `cliente_id` PUEDE SER NULO y es la decision que sostiene el modulo: llega un
-- mensaje de un numero que no esta en Clientes y hay que poder guardarlo. Lo
-- que NO se hace es inventar un cliente para tener a quien colgarlo — eso
-- llenaria el directorio de fantasmas con nombre de telefono. La conversacion
-- vive suelta hasta que alguien la identifica.
--
-- `contacto` es el identificador EN EL CANAL (el numero de WhatsApp, el correo).
-- Es lo unico que llega en un mensaje entrante, y es por lo que se busca al
-- cliente. No sustituye al telefono de la ficha: es por donde entro.
--
-- `atendida_en` es lo que deja marcar una conversacion como resuelta a mano.
-- Sin ella, "pendiente de respuesta" seria solo "el ultimo mensaje es del
-- cliente", y un "gracias!" al final de una conversacion cerrada la dejaria
-- pendiente para siempre.
create table if not exists conversacion (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  canal_id       uuid,
  cliente_id     uuid,
  contacto       text not null,
  estado         text not null default 'abierta'
                 check (estado in ('abierta', 'cerrada', 'archivada')),
  favorita       boolean not null default false,
  asignada_a     uuid,
  atendida_en    timestamptz,
  ultimo_en      timestamptz not null default now(),
  creado_en      timestamptz not null default now(),
  eliminado      boolean not null default false
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversacion_negocio_id_unico') then
    alter table conversacion add constraint conversacion_negocio_id_unico unique (negocio_id, id);
  end if;
  -- TODA RELACION VA POR LLAVE COMPUESTA. Una llave simple dejaria colgar una
  -- conversacion del cliente de otro centro: las llaves foraneas no obedecen
  -- las reglas de fila.
  if not exists (select 1 from pg_constraint where conname = 'conversacion_cliente_fk') then
    alter table conversacion add constraint conversacion_cliente_fk
      foreign key (negocio_id, cliente_id) references cliente (negocio_id, id)
      on delete set null (cliente_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversacion_canal_fk') then
    alter table conversacion add constraint conversacion_canal_fk
      foreign key (negocio_id, canal_id) references canal_de_mensajes (negocio_id, id)
      on delete set null (canal_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversacion_asignada_fk') then
    alter table conversacion add constraint conversacion_asignada_fk
      foreign key (negocio_id, asignada_a) references membresia (negocio_id, id)
      on delete set null (asignada_a);
  end if;
end $$;

-- UNA CONVERSACION POR CONTACTO Y CANAL. Es lo que impide que el mismo numero
-- abra un hilo nuevo cada vez que escribe: sin esto, el historial de alguien
-- quedaria repartido en veinte conversaciones de un mensaje.
create unique index if not exists conversacion_contacto_unica
  on conversacion (negocio_id, canal_id, lower(contacto)) where not eliminado;

create index if not exists conversacion_reciente_idx
  on conversacion (negocio_id, ultimo_en desc) where not eliminado;
create index if not exists conversacion_cliente_idx
  on conversacion (negocio_id, cliente_id) where not eliminado;

alter table conversacion enable row level security;
alter table conversacion force row level security;

drop policy if exists conversacion_ver on conversacion;
create policy conversacion_ver on conversacion
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists conversacion_escribir on conversacion;
create policy conversacion_escribir on conversacion
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists conversacion_cambiar on conversacion;
create policy conversacion_cambiar on conversacion
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

comment on table conversacion is
  'Un hilo con un contacto en un canal. NO guarda el nombre ni el telefono del cliente: guarda '
  'cliente_id y lo demas se resuelve al leer. cliente_id puede ser nulo — llega un mensaje de un '
  'numero desconocido y hay que guardarlo sin inventar una ficha.';

-- ---------------------------------------------------------------------
-- 4. EL MENSAJE
-- ---------------------------------------------------------------------
--
-- `estado` SOLO VALE PARA LO QUE SALE. Un mensaje entrante ya llego: no tiene
-- sentido decir que esta "entregado". Y de lo que sale, solo se guarda lo que
-- el proveedor de verdad confirma — inventar un "leido" que nadie reporto es
-- peor que no tenerlo, porque se toma por cierto.
--
-- `leido_en` es lo del NEGOCIO leyendo al cliente, no al reves. De ahi salen
-- los no leidos de la lista.
create table if not exists mensaje (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references negocio(id) on delete cascade,
  conversacion_id uuid not null,
  direccion      text not null check (direccion in ('entrante', 'saliente')),
  cuerpo         text not null,
  -- 'pendiente' = guardado y todavia sin mandar a ningun proveedor. Es el
  -- estado en el que se queda todo mientras no haya un canal conectado, y se
  -- dice tal cual en la pantalla en vez de pintar una palomita falsa.
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'enviando', 'enviado', 'entregado', 'leido', 'fallido')),
  error          text,
  -- El id que le dio el proveedor, para poder casar sus avisos de estado.
  externo_id     text,
  adjunto_url    text,
  adjunto_tipo   text,
  enviado_por    uuid,
  difusion_id    uuid,
  leido_en       timestamptz,
  creado_en      timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mensaje_negocio_id_unico') then
    alter table mensaje add constraint mensaje_negocio_id_unico unique (negocio_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mensaje_conversacion_fk') then
    alter table mensaje add constraint mensaje_conversacion_fk
      foreign key (negocio_id, conversacion_id) references conversacion (negocio_id, id)
      on delete cascade;
  end if;
end $$;

create index if not exists mensaje_hilo_idx on mensaje (negocio_id, conversacion_id, creado_en desc);
create index if not exists mensaje_sin_leer_idx on mensaje (negocio_id, conversacion_id)
  where direccion = 'entrante' and leido_en is null;
-- El buscador de conversaciones mira dentro del texto.
create index if not exists mensaje_cuerpo_idx on mensaje using gin (to_tsvector('spanish', cuerpo));

alter table mensaje enable row level security;
alter table mensaje force row level security;

drop policy if exists mensaje_ver on mensaje;
create policy mensaje_ver on mensaje
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists mensaje_escribir on mensaje;
create policy mensaje_escribir on mensaje
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists mensaje_cambiar on mensaje;
create policy mensaje_cambiar on mensaje
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

comment on table mensaje is
  'Un mensaje de un hilo. El estado solo vale para lo saliente y solo se mueve con lo que el '
  'proveedor confirma: un "leido" inventado se toma por cierto y es peor que no tenerlo.';

-- ---------------------------------------------------------------------
-- 5. LAS ETIQUETAS DE UNA CONVERSACION
-- ---------------------------------------------------------------------
create table if not exists conversacion_etiqueta (
  negocio_id      text not null references negocio(id) on delete cascade,
  conversacion_id uuid not null,
  categoria_id    uuid not null,
  primary key (conversacion_id, categoria_id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversacion_etiqueta_conv_fk') then
    alter table conversacion_etiqueta add constraint conversacion_etiqueta_conv_fk
      foreign key (negocio_id, conversacion_id) references conversacion (negocio_id, id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversacion_etiqueta_cat_fk') then
    alter table conversacion_etiqueta add constraint conversacion_etiqueta_cat_fk
      foreign key (negocio_id, categoria_id) references categoria (negocio_id, id)
      on delete cascade;
  end if;
end $$;

alter table conversacion_etiqueta enable row level security;
alter table conversacion_etiqueta force row level security;

drop policy if exists conversacion_etiqueta_ver on conversacion_etiqueta;
create policy conversacion_etiqueta_ver on conversacion_etiqueta
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists conversacion_etiqueta_escribir on conversacion_etiqueta;
create policy conversacion_etiqueta_escribir on conversacion_etiqueta
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists conversacion_etiqueta_borrar on conversacion_etiqueta;
create policy conversacion_etiqueta_borrar on conversacion_etiqueta
  for delete using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

-- ---------------------------------------------------------------------
-- 6. LAS PLANTILLAS
-- ---------------------------------------------------------------------
--
-- Las variables van escritas en el cuerpo como {{cliente.nombre}} y se
-- rellenan AL USAR la plantilla, contra el cliente y la cita de verdad. Lo que
-- no se hace nunca es guardar el texto ya rellenado: eso seria una copia del
-- nombre de alguien que envejece sola.
create table if not exists plantilla_de_mensaje (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   text not null references negocio(id) on delete cascade,
  nombre       text not null,
  categoria    text not null default 'general',
  cuerpo       text not null,
  canal_tipo   text check (canal_tipo in ('whatsapp', 'sms', 'correo', 'manual')),
  activa       boolean not null default true,
  eliminado    boolean not null default false,
  creado_en    timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plantilla_de_mensaje_negocio_id_unico') then
    alter table plantilla_de_mensaje add constraint plantilla_de_mensaje_negocio_id_unico
      unique (negocio_id, id);
  end if;
end $$;

create index if not exists plantilla_de_mensaje_negocio_idx
  on plantilla_de_mensaje (negocio_id, nombre) where not eliminado;

alter table plantilla_de_mensaje enable row level security;
alter table plantilla_de_mensaje force row level security;

drop policy if exists plantilla_ver on plantilla_de_mensaje;
create policy plantilla_ver on plantilla_de_mensaje
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists plantilla_escribir on plantilla_de_mensaje;
create policy plantilla_escribir on plantilla_de_mensaje
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists plantilla_cambiar on plantilla_de_mensaje;
create policy plantilla_cambiar on plantilla_de_mensaje
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

-- ---------------------------------------------------------------------
-- 7. LAS AUTOMATIZACIONES
-- ---------------------------------------------------------------------
--
-- NACEN APAGADAS, SIEMPRE. `activa` es false por omision y no hay forma de
-- crear una encendida: mandar mensajes solo a los clientes de alguien sin que
-- esa persona lo haya pedido explicitamente es de las pocas cosas de este
-- sistema que no se pueden deshacer.
--
-- Y no corren solas todavia: hace falta un servidor que escuche los eventos.
-- Mientras tanto quedan declaradas, y la pantalla dice que estan a la espera
-- en vez de fingir que disparan.
create table if not exists automatizacion_de_mensajes (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   text not null references negocio(id) on delete cascade,
  evento       text not null check (evento in (
                 'cita_nueva', 'cita_confirmada', 'cita_cancelada', 'cita_reagendada',
                 'cita_recordatorio', 'inscripcion_nueva', 'pago_registrado',
                 'seguimiento', 'cliente_inactivo')),
  plantilla_id uuid,
  canal_id     uuid,
  activa       boolean not null default false,
  condiciones  jsonb not null default '{}'::jsonb,
  eliminado    boolean not null default false,
  creado_en    timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'automatizacion_negocio_id_unico') then
    alter table automatizacion_de_mensajes add constraint automatizacion_negocio_id_unico
      unique (negocio_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'automatizacion_plantilla_fk') then
    alter table automatizacion_de_mensajes add constraint automatizacion_plantilla_fk
      foreign key (negocio_id, plantilla_id) references plantilla_de_mensaje (negocio_id, id)
      on delete set null (plantilla_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'automatizacion_canal_fk') then
    alter table automatizacion_de_mensajes add constraint automatizacion_canal_fk
      foreign key (negocio_id, canal_id) references canal_de_mensajes (negocio_id, id)
      on delete set null (canal_id);
  end if;
end $$;

alter table automatizacion_de_mensajes enable row level security;
alter table automatizacion_de_mensajes force row level security;

drop policy if exists automatizacion_ver on automatizacion_de_mensajes;
create policy automatizacion_ver on automatizacion_de_mensajes
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists automatizacion_escribir on automatizacion_de_mensajes;
create policy automatizacion_escribir on automatizacion_de_mensajes
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists automatizacion_cambiar on automatizacion_de_mensajes;
create policy automatizacion_cambiar on automatizacion_de_mensajes
  for update using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'))
  with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

-- ---------------------------------------------------------------------
-- 8. LAS DIFUSIONES
-- ---------------------------------------------------------------------
--
-- Se guarda A QUIENES se mando y cuantos fallaron, no el texto repetido: cada
-- destinatario recibe un `mensaje` normal con su `difusion_id`, asi que la
-- difusion aparece en el hilo de cada persona como cualquier otro mensaje. Una
-- bandeja de difusiones aparte seria un segundo historial que se separa del
-- primero.
create table if not exists difusion (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   text not null references negocio(id) on delete cascade,
  nombre       text not null,
  cuerpo       text not null,
  canal_id     uuid,
  destinatarios int not null default 0,
  fallidos     int not null default 0,
  creado_por   uuid,
  creado_en    timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'difusion_negocio_id_unico') then
    alter table difusion add constraint difusion_negocio_id_unico unique (negocio_id, id);
  end if;
end $$;

alter table difusion enable row level security;
alter table difusion force row level security;

drop policy if exists difusion_ver on difusion;
create policy difusion_ver on difusion
  for select using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

drop policy if exists difusion_escribir on difusion;
create policy difusion_escribir on difusion
  for insert with check (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarMensajes'));

-- ---------------------------------------------------------------------
-- 9. QUIEN ESTA PENDIENTE DE RESPUESTA
-- ---------------------------------------------------------------------
--
-- NO ES "EL ULTIMO MENSAJE ES DEL CLIENTE", y la diferencia importa: con esa
-- regla, un "gracias!" al final de una conversacion resuelta la deja pendiente
-- para siempre y la cifra de arriba deja de significar nada.
--
-- Es: hay algo del cliente DESPUES de lo ultimo que hicimos nosotros —
-- responder o marcarla atendida a mano.
create or replace function app.conversacion_pendiente(p_conversacion uuid, p_atendida timestamptz)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from mensaje m
     where m.conversacion_id = p_conversacion
       and m.direccion = 'entrante'
       and m.creado_en > greatest(
             coalesce(p_atendida, '-infinity'::timestamptz),
             coalesce((select max(s.creado_en) from mensaje s
                        where s.conversacion_id = p_conversacion
                          and s.direccion = 'saliente'
                          and s.estado <> 'fallido'), '-infinity'::timestamptz))
  );
$$;

-- ---------------------------------------------------------------------
-- 10. LA LISTA DE CONVERSACIONES
-- ---------------------------------------------------------------------
--
-- SE PAGINA EN EL SERVIDOR. Un centro con dos años de operacion tiene miles de
-- hilos; bajarlos todos para enseñar ocho es lento hoy e imposible despues.
--
-- El ultimo mensaje se resuelve al leer con un `lateral`, no se copia a la
-- conversacion: un texto copiado se queda viejo en cuanto se borre o se corrija
-- el mensaje, y nadie se entera.
create or replace function public.conversaciones_del_centro(
  p_negocio    text,
  p_bandeja    text default 'todas',
  p_busqueda   text default null,
  p_etiqueta   uuid default null,
  p_pagina     int default 1,
  p_por_pagina int default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select c.*,
      (select cl.nombre from cliente cl where cl.id = c.cliente_id) as cliente,
      (select ca.tipo from canal_de_mensajes ca where ca.id = c.canal_id) as canal_tipo,
      (select ca.nombre from canal_de_mensajes ca where ca.id = c.canal_id) as canal,
      (select m.nombre from membresia m where m.id = c.asignada_a) as asignada,
      (select count(*)::int from mensaje m
        where m.conversacion_id = c.id and m.direccion = 'entrante' and m.leido_en is null) as sin_leer,
      app.conversacion_pendiente(c.id, c.atendida_en) as pendiente,
      (select jsonb_build_object('cuerpo', m.cuerpo, 'direccion', m.direccion,
                                 'estado', m.estado, 'creadoEn', m.creado_en)
         from mensaje m where m.conversacion_id = c.id
        order by m.creado_en desc limit 1) as ultimo
    from conversacion c
    where c.negocio_id = p_negocio and not c.eliminado
      and (p_etiqueta is null or exists (
            select 1 from conversacion_etiqueta e
             where e.conversacion_id = c.id and e.categoria_id = p_etiqueta))
      -- SE BUSCA POR LAS CUATRO COSAS QUE ALGUIEN RECUERDA DE UN HILO: por
      -- quien es, por su contacto, por lo que se dijo, y por como se etiqueto.
      and (p_busqueda is null or (
            c.contacto ilike '%' || p_busqueda || '%'
         or exists (select 1 from cliente cl where cl.id = c.cliente_id
                     and (cl.nombre ilike '%' || p_busqueda || '%'
                       or coalesce(cl.telefono, '') ilike '%' || p_busqueda || '%'
                       or coalesce(cl.correo, '') ilike '%' || p_busqueda || '%'))
         or exists (select 1 from mensaje m where m.conversacion_id = c.id
                     and m.cuerpo ilike '%' || p_busqueda || '%')
         or exists (select 1 from conversacion_etiqueta e
                    join categoria ca on ca.id = e.categoria_id
                     where e.conversacion_id = c.id and ca.nombre ilike '%' || p_busqueda || '%')))
  ),
  -- LAS BANDEJAS SE FILTRAN DESPUES de calcular, no antes: "no leidos" y
  -- "pendientes" son cuentas de los mensajes, no columnas de la conversacion.
  filtrada as (
    select * from base b
     where case p_bandeja
             when 'no_leidas'  then b.sin_leer > 0 and b.estado <> 'archivada'
             when 'pendientes' then b.pendiente and b.estado <> 'archivada'
             when 'archivadas' then b.estado = 'archivada'
             -- "Todas" NO incluye las archivadas: archivar sirve justamente
             -- para sacarlas de la vista de todos los dias.
             else b.estado <> 'archivada'
           end
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrada),
    -- Los contadores de las cuatro pestañas salen de la MISMA consulta: pedirlos
    -- aparte deja que una diga 3 y la pestaña de al lado 4.
    'cuentas', jsonb_build_object(
      'todas',      (select count(*)::int from base where estado <> 'archivada'),
      'noLeidas',   (select count(*)::int from base where sin_leer > 0 and estado <> 'archivada'),
      'pendientes', (select count(*)::int from base where pendiente and estado <> 'archivada'),
      'archivadas', (select count(*)::int from base where estado = 'archivada')
    ),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'clienteId', f.cliente_id, 'cliente', f.cliente,
        'contacto', f.contacto, 'canalId', f.canal_id, 'canal', f.canal,
        'canalTipo', f.canal_tipo, 'estado', f.estado, 'favorita', f.favorita,
        'asignadaA', f.asignada_a, 'asignada', f.asignada,
        'sinLeer', f.sin_leer, 'pendiente', f.pendiente,
        'ultimoEn', f.ultimo_en, 'ultimo', f.ultimo,
        'etiquetas', coalesce((
          select jsonb_agg(jsonb_build_object('id', ca.id, 'nombre', ca.nombre, 'color', ca.color)
                 order by ca.nombre)
            from conversacion_etiqueta e join categoria ca on ca.id = e.categoria_id
           where e.conversacion_id = f.id), '[]'::jsonb))
        order by f.ultimo_en desc)
      from (select * from filtrada order by ultimo_en desc
             limit greatest(p_por_pagina, 1)
            offset greatest(p_pagina - 1, 0) * greatest(p_por_pagina, 1)) f
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.conversaciones_del_centro(text, text, text, uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 11. EL HILO DE UNA CONVERSACION
-- ---------------------------------------------------------------------
--
-- SE PIDE HACIA ATRAS, de lo mas nuevo a lo mas viejo, con un tope. Un hilo de
-- dos años son miles de mensajes y bajarlos de golpe cuelga la pestaña; se
-- traen los ultimos y la pantalla pide mas al subir.
create or replace function public.mensajes_de_la_conversacion(
  p_conversacion uuid,
  p_antes_de     timestamptz default null,
  p_limite       int default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x order by x->>'creadoEn'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', m.id, 'direccion', m.direccion, 'cuerpo', m.cuerpo,
      'estado', m.estado, 'error', m.error,
      'adjuntoUrl', m.adjunto_url, 'adjuntoTipo', m.adjunto_tipo,
      'quien', (select mb.nombre from membresia mb where mb.id = m.enviado_por),
      'difusionId', m.difusion_id,
      'leidoEn', m.leido_en, 'creadoEn', m.creado_en) as x
      from mensaje m
     where m.conversacion_id = p_conversacion
       and (p_antes_de is null or m.creado_en < p_antes_de)
     order by m.creado_en desc
     limit greatest(p_limite, 1)
  ) t;
$$;

grant execute on function public.mensajes_de_la_conversacion(uuid, timestamptz, int) to authenticated;

-- ---------------------------------------------------------------------
-- 12. EL RESUMEN DEL PERIODO
-- ---------------------------------------------------------------------
--
-- Mismas reglas que en Reportes, y por lo mismo: sin periodo anterior con
-- actividad NO hay porcentaje, y una tasa sin denominador es `null` y no cero.
-- "0% de respuesta" afirma que no se contesto a nadie; sin conversaciones que
-- respondieran, lo cierto es que no habia a quien.
create or replace function public.resumen_de_mensajes(
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
  with rango as (
    select p_desde as desde, p_hasta as hasta,
           (p_desde - (p_hasta - p_desde + 1))::date as desde_ant,
           (p_desde - 1)::date as hasta_ant
  ),
  m as (
    select ms.* from mensaje ms, rango r
     where ms.negocio_id = p_negocio and ms.creado_en::date between r.desde and r.hasta
  ),
  m_ant as (
    select ms.* from mensaje ms, rango r
     where ms.negocio_id = p_negocio and ms.creado_en::date between r.desde_ant and r.hasta_ant
  ),
  conv as (
    select c.*, app.conversacion_pendiente(c.id, c.atendida_en) as pendiente
      from conversacion c
     where c.negocio_id = p_negocio and not c.eliminado
  ),
  -- Las que PEDIAN respuesta en el periodo: llego algo del cliente.
  pedian as (
    select distinct conversacion_id from m where direccion = 'entrante'
  ),
  respondidas as (
    select count(*)::int as n from pedian p
     where exists (select 1 from mensaje s
                    where s.conversacion_id = p.conversacion_id
                      and s.direccion = 'saliente' and s.estado <> 'fallido'
                      and s.creado_en > (select min(e.creado_en) from m e
                                          where e.conversacion_id = p.conversacion_id
                                            and e.direccion = 'entrante'))
  )
  select jsonb_build_object(
    'activas', (select count(*)::int from conv where estado = 'abierta'),
    'clientesEnConversacion',
      (select count(distinct cliente_id)::int from conv
        where estado = 'abierta' and cliente_id is not null),
    'enviados',      (select count(*)::int from m where direccion = 'saliente'),
    'enviadosAntes', (select count(*)::int from m_ant where direccion = 'saliente'),
    'recibidos',      (select count(*)::int from m where direccion = 'entrante'),
    'recibidosAntes', (select count(*)::int from m_ant where direccion = 'entrante'),
    'pendientes', (select count(*)::int from conv where pendiente and estado <> 'archivada'),
    'hayComparacion', (select count(*) from m_ant) > 0,
    'pedianRespuesta', (select count(*)::int from pedian),
    'respondidas', (select n from respondidas),
    -- Sin nadie a quien responder, la tasa es `null`. Un 0% afirmaria que se
    -- dejo a todo el mundo sin contestar.
    'tasaRespuesta', case when (select count(*) from pedian) = 0 then null
                     else round(((select n from respondidas)::numeric
                                 / (select count(*) from pedian)) * 100, 1) end,
    -- El tiempo de respuesta solo sale si hay pares de verdad. Sin datos se
    -- dice que no hay, en vez de enseñar un cero que se lee como "al instante".
    'minutosDeRespuesta', (
      select round(avg(extract(epoch from (s.creado_en - e.creado_en)) / 60))
        from m e
        join lateral (
          select min(x.creado_en) as creado_en from mensaje x
           where x.conversacion_id = e.conversacion_id
             and x.direccion = 'saliente' and x.estado <> 'fallido'
             and x.creado_en > e.creado_en
        ) s on s.creado_en is not null
       where e.direccion = 'entrante')
  );
$$;

grant execute on function public.resumen_de_mensajes(text, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 13. ABRIR (O ENCONTRAR) LA CONVERSACION DE UN CONTACTO
-- ---------------------------------------------------------------------
--
-- LA REGLA DE ORO DEL MODULO: si ya existe un cliente con ese telefono, la
-- conversacion se cuelga de EL. No se crea otro y no se deja suelta. Buscar por
-- los ultimos diez digitos es lo que hace que "+52 646 123 4567",
-- "6461234567" y "646-123-4567" sean la misma persona — que es como los
-- telefonos se capturan de verdad.
create or replace function public.abrir_conversacion(
  p_negocio  text,
  p_contacto text,
  p_canal    uuid default null,
  p_cliente  uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  v_cliente uuid := p_cliente;
  v_digitos text := right(regexp_replace(coalesce(p_contacto, ''), '[^0-9]', '', 'g'), 10);
begin
  if btrim(coalesce(p_contacto, '')) = '' then
    raise exception 'Una conversacion necesita un contacto: un numero o un correo.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Se busca al cliente ANTES de crear nada.
  if v_cliente is null and length(v_digitos) >= 10 then
    select c.id into v_cliente from cliente c
     where c.negocio_id = p_negocio and not c.eliminado
       and right(regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g'), 10) = v_digitos
     limit 1;
  end if;
  if v_cliente is null and p_contacto like '%@%' then
    select c.id into v_cliente from cliente c
     where c.negocio_id = p_negocio and not c.eliminado
       and lower(coalesce(c.correo, '')) = lower(p_contacto)
     limit 1;
  end if;

  select c.id into v_id from conversacion c
   where c.negocio_id = p_negocio and not c.eliminado
     and lower(c.contacto) = lower(p_contacto)
     and c.canal_id is not distinct from p_canal
   limit 1;

  if v_id is not null then
    -- Si el hilo existia suelto y ahora ya se sabe de quien es, se ata. Al
    -- reves no: nunca se le quita el cliente a una conversacion identificada.
    update conversacion
       set cliente_id = coalesce(cliente_id, v_cliente),
           estado = case when estado = 'archivada' then 'abierta' else estado end
     where id = v_id;
    return v_id;
  end if;

  insert into conversacion (negocio_id, canal_id, cliente_id, contacto)
  values (p_negocio, p_canal, v_cliente, btrim(p_contacto))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.abrir_conversacion(text, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 14. GUARDAR UN MENSAJE
-- ---------------------------------------------------------------------
--
-- SE GUARDA COMO 'pendiente', NUNCA COMO 'enviado'. Guardar y enviar son dos
-- cosas distintas y solo la primera pasa aqui: el envio lo hace el servidor que
-- habla con el proveedor, y es el quien mueve el estado. Marcarlo enviado aqui
-- seria decir que el cliente lo recibio cuando no ha salido de la base.
create or replace function public.guardar_mensaje(
  p_negocio      text,
  p_conversacion uuid,
  p_direccion    text,
  p_cuerpo       text,
  p_adjunto_url  text default null,
  p_adjunto_tipo text default null,
  p_externo_id   text default null,
  p_difusion     uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_quien uuid;
begin
  if btrim(coalesce(p_cuerpo, '')) = '' and p_adjunto_url is null then
    raise exception 'Un mensaje vacio no se manda.'
      using errcode = 'invalid_parameter_value';
  end if;

  select m.id into v_quien from membresia m
   where m.negocio_id = p_negocio and m.usuario_id = auth.uid() limit 1;

  insert into mensaje (negocio_id, conversacion_id, direccion, cuerpo, estado,
                       adjunto_url, adjunto_tipo, externo_id, difusion_id, enviado_por,
                       -- Lo que ESCRIBE el negocio ya esta leido por el negocio.
                       leido_en)
  values (p_negocio, p_conversacion, p_direccion, btrim(coalesce(p_cuerpo, '')),
          case when p_direccion = 'entrante' then 'entregado' else 'pendiente' end,
          p_adjunto_url, p_adjunto_tipo, p_externo_id, p_difusion,
          case when p_direccion = 'saliente' then v_quien end,
          case when p_direccion = 'saliente' then now() end)
  returning id into v_id;

  -- La conversacion sube a lo mas reciente. Es lo que ordena la lista.
  update conversacion set ultimo_en = now(),
         estado = case when estado = 'archivada' and p_direccion = 'entrante'
                       then 'abierta' else estado end
   where id = p_conversacion;

  return v_id;
end;
$$;

grant execute on function public.guardar_mensaje(text, uuid, text, text, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 15. MOVER EL ESTADO DE UN MENSAJE
-- ---------------------------------------------------------------------
--
-- Lo llama quien de verdad hablo con el proveedor. Un fallo guarda su motivo:
-- "no se pudo enviar" sin decir por que obliga a adivinar entre el numero mal
-- escrito, el canal caido y la plantilla no aprobada.
create or replace function public.marcar_estado_de_mensaje(
  p_mensaje uuid,
  p_estado  text,
  p_error   text default null,
  p_externo text default null
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update mensaje
     set estado = p_estado,
         error = case when p_estado = 'fallido' then p_error end,
         externo_id = coalesce(p_externo, externo_id)
   where id = p_mensaje;
$$;

grant execute on function public.marcar_estado_de_mensaje(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 16. LAS ACCIONES SOBRE UNA CONVERSACION
-- ---------------------------------------------------------------------
--
-- ARCHIVAR NO BORRA. La conversacion sale de la vista de todos los dias y
-- sigue entera en "Archivadas": el historial de lo que se le dijo a alguien es
-- justo lo que no se puede perder.
create or replace function public.marcar_conversacion(
  p_conversacion uuid,
  p_accion       text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_accion = 'leida' then
    update mensaje set leido_en = now()
     where conversacion_id = p_conversacion and direccion = 'entrante' and leido_en is null;
  elsif p_accion = 'no_leida' then
    -- Se desmarca SOLO el ultimo entrante, no el hilo entero: lo que se quiere
    -- es "vuelve a recordarmelo", no reabrir dos años de mensajes.
    update mensaje set leido_en = null
     where id = (select m.id from mensaje m
                  where m.conversacion_id = p_conversacion and m.direccion = 'entrante'
                  order by m.creado_en desc limit 1);
  elsif p_accion = 'archivar' then
    update conversacion set estado = 'archivada' where id = p_conversacion;
  elsif p_accion = 'desarchivar' then
    update conversacion set estado = 'abierta' where id = p_conversacion;
  elsif p_accion = 'cerrar' then
    update conversacion set estado = 'cerrada', atendida_en = now() where id = p_conversacion;
  elsif p_accion = 'reabrir' then
    update conversacion set estado = 'abierta' where id = p_conversacion;
  elsif p_accion = 'atendida' then
    update conversacion set atendida_en = now() where id = p_conversacion;
  elsif p_accion = 'favorita' then
    update conversacion set favorita = not favorita where id = p_conversacion;
  else
    raise exception 'Accion desconocida sobre la conversacion: %', p_accion
      using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

grant execute on function public.marcar_conversacion(uuid, text) to authenticated;

create or replace function public.asignar_conversacion(p_conversacion uuid, p_membresia uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update conversacion set asignada_a = p_membresia where id = p_conversacion;
$$;

grant execute on function public.asignar_conversacion(uuid, uuid) to authenticated;

create or replace function public.ligar_cliente_a_conversacion(p_conversacion uuid, p_cliente uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update conversacion set cliente_id = p_cliente where id = p_conversacion;
$$;

grant execute on function public.ligar_cliente_a_conversacion(uuid, uuid) to authenticated;

-- Las etiquetas de un hilo se guardan de una vez: llega la lista completa y se
-- sustituye. Ir de una en una deja estados a medias si falla la tercera.
create or replace function public.etiquetar_conversacion(
  p_negocio      text,
  p_conversacion uuid,
  p_etiquetas    uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from conversacion_etiqueta where conversacion_id = p_conversacion;
  if p_etiquetas is not null and array_length(p_etiquetas, 1) > 0 then
    insert into conversacion_etiqueta (negocio_id, conversacion_id, categoria_id)
    select p_negocio, p_conversacion, unnest(p_etiquetas)
    on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.etiquetar_conversacion(text, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 17. PLANTILLAS, CANALES Y AUTOMATIZACIONES
-- ---------------------------------------------------------------------
create or replace function public.plantillas_del_centro(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nombre', p.nombre, 'categoria', p.categoria, 'cuerpo', p.cuerpo,
      'canalTipo', p.canal_tipo, 'activa', p.activa) order by p.nombre), '[]'::jsonb)
    from plantilla_de_mensaje p
   where p.negocio_id = p_negocio and not p.eliminado;
$$;

grant execute on function public.plantillas_del_centro(text) to authenticated;

create or replace function public.guardar_plantilla(
  p_negocio   text,
  p_id        uuid,
  p_nombre    text,
  p_categoria text,
  p_cuerpo    text,
  p_canal     text default null,
  p_activa    boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'La plantilla necesita un nombre para poder encontrarla.'
      using errcode = 'invalid_parameter_value';
  end if;
  if btrim(coalesce(p_cuerpo, '')) = '' then
    raise exception 'Una plantilla sin texto no sirve de nada.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into plantilla_de_mensaje (negocio_id, nombre, categoria, cuerpo, canal_tipo, activa)
    values (p_negocio, btrim(p_nombre), coalesce(nullif(btrim(p_categoria), ''), 'general'),
            p_cuerpo, p_canal, coalesce(p_activa, true))
    returning id into v_id;
  else
    update plantilla_de_mensaje
       set nombre = btrim(p_nombre),
           categoria = coalesce(nullif(btrim(p_categoria), ''), 'general'),
           cuerpo = p_cuerpo, canal_tipo = p_canal, activa = coalesce(p_activa, true)
     where id = p_id and negocio_id = p_negocio
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.guardar_plantilla(text, uuid, text, text, text, text, boolean) to authenticated;

create or replace function public.borrar_plantilla(p_plantilla uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update plantilla_de_mensaje set eliminado = true where id = p_plantilla;
$$;

grant execute on function public.borrar_plantilla(uuid) to authenticated;

create or replace function public.canales_del_centro(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'tipo', c.tipo, 'nombre', c.nombre, 'identificador', c.identificador,
      'estado', c.estado, 'detalleError', c.detalle_error,
      'ultimaSincronizacion', c.ultima_sincronizacion, 'activo', c.activo)
      order by c.creado_en), '[]'::jsonb)
    from canal_de_mensajes c
   where c.negocio_id = p_negocio and not c.eliminado;
$$;

grant execute on function public.canales_del_centro(text) to authenticated;

-- EL ESTADO NO ES UN PARAMETRO. Se declara el canal —que existe, como se llama,
-- que numero enseña— y nace 'sin_conectar'. Conectarlo de verdad es hablar con
-- el proveedor, y eso no pasa aqui.
create or replace function public.guardar_canal(
  p_negocio       text,
  p_id            uuid,
  p_tipo          text,
  p_nombre        text,
  p_identificador text default null,
  p_activo        boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El canal necesita un nombre.' using errcode = 'invalid_parameter_value';
  end if;
  if p_id is null then
    insert into canal_de_mensajes (negocio_id, tipo, nombre, identificador, activo)
    values (p_negocio, p_tipo, btrim(p_nombre), nullif(btrim(coalesce(p_identificador, '')), ''),
            coalesce(p_activo, true))
    returning id into v_id;
  else
    update canal_de_mensajes
       set tipo = p_tipo, nombre = btrim(p_nombre),
           identificador = nullif(btrim(coalesce(p_identificador, '')), ''),
           activo = coalesce(p_activo, true)
     where id = p_id and negocio_id = p_negocio
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.guardar_canal(text, uuid, text, text, text, boolean) to authenticated;

create or replace function public.automatizaciones_del_centro(p_negocio text)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'evento', a.evento, 'plantillaId', a.plantilla_id,
      'plantilla', (select p.nombre from plantilla_de_mensaje p where p.id = a.plantilla_id),
      'canalId', a.canal_id,
      'canal', (select c.nombre from canal_de_mensajes c where c.id = a.canal_id),
      'activa', a.activa) order by a.evento), '[]'::jsonb)
    from automatizacion_de_mensajes a
   where a.negocio_id = p_negocio and not a.eliminado;
$$;

grant execute on function public.automatizaciones_del_centro(text) to authenticated;

create or replace function public.guardar_automatizacion(
  p_negocio   text,
  p_id        uuid,
  p_evento    text,
  p_plantilla uuid default null,
  p_canal     uuid default null,
  p_activa    boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  -- NO SE ENCIENDE SIN PLANTILLA Y SIN CANAL. Una automatizacion activa sin
  -- que mandar y por donde no es una automatizacion: es un fallo silencioso
  -- que se descubre el dia que alguien pregunta por que no llego su recordatorio.
  if coalesce(p_activa, false) and (p_plantilla is null or p_canal is null) then
    raise exception 'Para encender una automatizacion hacen falta una plantilla y un canal.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into automatizacion_de_mensajes (negocio_id, evento, plantilla_id, canal_id, activa)
    values (p_negocio, p_evento, p_plantilla, p_canal, coalesce(p_activa, false))
    returning id into v_id;
  else
    update automatizacion_de_mensajes
       set evento = p_evento, plantilla_id = p_plantilla, canal_id = p_canal,
           activa = coalesce(p_activa, false)
     where id = p_id and negocio_id = p_negocio
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.guardar_automatizacion(text, uuid, text, uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 18. UNA DIFUSION
-- ---------------------------------------------------------------------
--
-- SOLO A QUIEN SE ESCOGIO. La lista de destinatarios llega entera desde la
-- pantalla, ya revisada, y aqui no se amplia por ningun motivo: una difusion
-- que "mejora" el conjunto por su cuenta es como se le escribe a alguien que
-- habia pedido que no.
--
-- Cada destinatario recibe un mensaje NORMAL en su hilo, con el id de la
-- difusion. Asi la difusion se lee en la conversacion de cada persona en vez
-- de vivir en una bandeja aparte que se separa del historial.
create or replace function public.registrar_difusion(
  p_negocio  text,
  p_nombre   text,
  p_cuerpo   text,
  p_canal    uuid,
  p_clientes uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_difusion uuid;
  v_quien    uuid;
  v_cliente  uuid;
  v_conv     uuid;
  v_contacto text;
  v_puestos  int := 0;
  v_fallidos int := 0;
begin
  if p_clientes is null or array_length(p_clientes, 1) is null then
    raise exception 'Una difusion sin destinatarios no se manda.'
      using errcode = 'invalid_parameter_value';
  end if;

  select m.id into v_quien from membresia m
   where m.negocio_id = p_negocio and m.usuario_id = auth.uid() limit 1;

  insert into difusion (negocio_id, nombre, cuerpo, canal_id, creado_por)
  values (p_negocio, btrim(p_nombre), p_cuerpo, p_canal, v_quien)
  returning id into v_difusion;

  foreach v_cliente in array p_clientes loop
    select c.telefono into v_contacto from cliente c
     where c.id = v_cliente and c.negocio_id = p_negocio and not c.eliminado;

    -- SIN POR DONDE ESCRIBIRLE, SE CUENTA COMO FALLIDO Y SE DICE. Saltarlo en
    -- silencio deja creyendo que llego a todo el mundo.
    if v_contacto is null or btrim(v_contacto) = '' then
      v_fallidos := v_fallidos + 1;
      continue;
    end if;

    v_conv := public.abrir_conversacion(p_negocio, v_contacto, p_canal, v_cliente);
    perform public.guardar_mensaje(p_negocio, v_conv, 'saliente', p_cuerpo,
                                   null, null, null, v_difusion);
    v_puestos := v_puestos + 1;
  end loop;

  update difusion set destinatarios = v_puestos, fallidos = v_fallidos where id = v_difusion;

  return jsonb_build_object('id', v_difusion, 'destinatarios', v_puestos, 'fallidos', v_fallidos);
end;
$$;

grant execute on function public.registrar_difusion(text, text, text, uuid, uuid[]) to authenticated;

comment on function public.registrar_difusion is
  'Manda SOLO a la lista que llega, ya revisada en la pantalla. Cada destinatario recibe un mensaje '
  'normal en su hilo con el id de la difusion: asi se lee en su conversacion y no en una bandeja '
  'aparte que se separa del historial. Quien no tiene telefono cuenta como fallido y se dice.';

-- ---------------------------------------------------------------------
-- 19. QUIEN NO QUIERE PROMOCIONES
-- ---------------------------------------------------------------------
--
-- Una difusion promocional NO se le manda a quien pidio que no. Es lo unico de
-- este modulo que no se puede deshacer —el mensaje ya llego— y por eso el dato
-- vive en la ficha del cliente y no en una lista aparte de Mensajes: la fuente
-- de verdad de lo que alguien pidio es su expediente.
--
-- ARRANCA EN "SI ACEPTA" a proposito. Ponerlo en "no" dejaria a todos los
-- clientes que ya existen fuera de cualquier difusion sin que nadie lo hubiera
-- pedido, y la primera difusion del centro no le llegaria a nadie sin decir por
-- que. Quien pida dejar de recibirlas se apaga desde su ficha.
--
-- NO afecta a los mensajes de siempre: confirmar una cita o avisar de un cambio
-- no es promocion, y eso se sigue pudiendo escribir a cualquiera.
alter table cliente add column if not exists acepta_promociones boolean not null default true;

comment on column cliente.acepta_promociones is
  'Si se le pueden mandar difusiones promocionales. Lo apaga quien lo pida, desde su ficha. No '
  'afecta a los mensajes de servicio: confirmar una cita no es promocion.';

-- ---------------------------------------------------------------------
-- 20. LOS PERMISOS DE TABLA QUE FALTABAN
-- ---------------------------------------------------------------------
--
-- ESTO COSTO UN "permission denied for table canal_de_mensajes" EN PRODUCCION,
-- con el SQL corrido entero y sin un solo error.
--
-- LA CONFUSION, Y ES FACIL DE REPETIR: las reglas de acceso por fila y los
-- permisos de tabla son DOS COSAS DISTINTAS que suenan igual. La regla de fila
-- RESTRINGE lo que ya se puede leer — decide CUALES filas. El `grant` es lo que
-- da el permiso de partida. Una tabla con politicas preciosas y sin `grant` no
-- deja leer NADA: las politicas no otorgan, recortan.
--
-- Se escribe una vez por tabla y se olvida para siempre, porque no falla al
-- crearla: falla la primera vez que alguien abre la pantalla. Lo vigila la
-- guardia 18.
--
-- `anon` no toca nada de esto: son datos de pacientes.
revoke all on conversacion, mensaje, canal_de_mensajes, conversacion_etiqueta,
              plantilla_de_mensaje, automatizacion_de_mensajes, difusion,
              reporte_guardado
  from anon;

grant select, insert, update on conversacion, mensaje, canal_de_mensajes,
              plantilla_de_mensaje, automatizacion_de_mensajes, reporte_guardado
  to authenticated;

-- Las etiquetas de un hilo se sustituyen enteras al guardar: hace falta borrar.
grant select, insert, delete on conversacion_etiqueta to authenticated;

-- Una difusion se escribe y se consulta; no se corrige. Igual que la caja: lo
-- que se mando, se mando.
grant select, insert, update on difusion to authenticated;



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

drop policy if exists recordatorio_automatizacion_escribir on recordatorio_automatizacion;
create policy recordatorio_automatizacion_escribir on recordatorio_automatizacion
  for all to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarConfiguracion'))
  with check (app.es_miembro(negocio_id)
              and app.tiene_permiso(negocio_id, 'gestionarConfiguracion')
              and app.licencia_permite(negocio_id));

-- ---------------------------------------------------------------------
-- 7. LAS AYUDAS DE FECHA DE LA RECURRENCIA
-- ---------------------------------------------------------------------

-- Cuando toca la siguiente vez, contando desde una fecha dada.
--
-- EL SEMANAL CON DIAS ESCOGIDOS ES EL UNICO CASO DIFICIL: "lunes y jueves cada
-- semana" no es "sumar 7 dias", es "el proximo dia de la lista, y si ya no
-- queda ninguno esta semana, el primero de la semana que viene mas el
-- intervalo". Resolverlo con una suma de dias produce la trampa clasica: el
-- recordatorio del jueves se convierte en uno del lunes siguiente y el jueves
-- deja de existir.
create or replace function app.siguiente_fecha_de_recordatorio(
  p_frecuencia text,
  p_intervalo int,
  p_dias_semana int[],
  p_desde date
) returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_paso int := greatest(coalesce(p_intervalo, 1), 1);
  v_dia  int;
  v_hoy  int;
  v_mejor int;
begin
  if p_frecuencia = 'diario' then
    return p_desde + v_paso;
  end if;

  if p_frecuencia = 'mensual' then
    return (p_desde + make_interval(months => v_paso))::date;
  end if;

  if p_frecuencia = 'anual' then
    return (p_desde + make_interval(years => v_paso))::date;
  end if;

  -- "Personalizado" es un semanal con dias escogidos: se trata igual.
  if p_frecuencia in ('semanal', 'personalizado') then
    if p_dias_semana is null or array_length(p_dias_semana, 1) is null then
      return p_desde + (7 * v_paso);
    end if;

    v_hoy := extract(isodow from p_desde)::int;
    v_mejor := null;
    foreach v_dia in array p_dias_semana loop
      -- El siguiente dia de la lista DENTRO de esta misma semana.
      if v_dia > v_hoy and (v_mejor is null or v_dia < v_mejor) then v_mejor := v_dia; end if;
    end loop;

    if v_mejor is not null then
      return p_desde + (v_mejor - v_hoy);
    end if;

    -- Ya no queda ninguno esta semana: al primero de la lista, saltando el
    -- intervalo de semanas que pida la regla.
    select min(d) into v_mejor from unnest(p_dias_semana) as d;
    return p_desde + (7 * v_paso) - (v_hoy - v_mejor);
  end if;

  return p_desde + v_paso;
end;
$$;

comment on function app.siguiente_fecha_de_recordatorio(text, int, int[], date) is
  'Cuando toca la siguiente vez. El semanal con dias escogidos no es "sumar 7": es el proximo dia '
  'de la lista, y si ya no queda ninguno, el primero de la semana que viene mas el intervalo.';

-- Un texto listo para comparar: minusculas y sin acentos.
--
-- NO SE USA `unaccent`: es una extension y este proyecto no la tiene instalada.
-- Pedir una extension nueva para una busqueda son permisos de superusuario en
-- Supabase y una dependencia mas que mantener; `translate` resuelve el español
-- entero, es inmutable, y no depende de nada.
--
-- POR QUE IMPORTA: quien teclea "energetica" tiene que encontrar "Energética".
-- Buscar con acentos exactos es una trampa para quien escribe rapido, y en el
-- mostrador se escribe rapido siempre.
create or replace function app.plegar(p_texto text) returns text
language sql
immutable
set search_path = pg_temp
as $$ select translate(lower(coalesce(p_texto, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') $$;

-- Escribe un renglon en el historial con el nombre de quien lo hizo.
create or replace function app.anotar_recordatorio(
  p_negocio text,
  p_recordatorio uuid,
  p_accion text,
  p_antes jsonb,
  p_despues jsonb
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
begin
  select nombre into v_nombre from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() and not eliminado
   limit 1;

  insert into recordatorio_evento
    (negocio_id, recordatorio_id, accion, antes, despues, usuario_id, usuario_nombre)
  values (p_negocio, p_recordatorio, p_accion, p_antes, p_despues, auth.uid(),
          coalesce(v_nombre, 'desconocido'));
end;
$$;

-- Si esta persona puede tocar ESE recordatorio.
--
-- LA REGLA: lo puede modificar quien lo creo, quien es su responsable, y quien
-- administra el centro. NO todo el mundo — un recordatorio que cualquiera puede
-- reasignarse o completar deja de decir quien tenia que hacerlo.
--
-- Y VIVE EN EL SERVIDOR, no en la pantalla. Esconder el boton es cortesia;
-- esto es lo que pasa cuando alguien manda la peticion a mano.
create or replace function app.puede_tocar_recordatorio(p_recordatorio uuid) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
begin
  select * into v_fila from recordatorio where id = p_recordatorio;
  if not found then return false; end if;
  if not app.es_miembro(v_fila.negocio_id) then return false; end if;
  if app.tiene_permiso(v_fila.negocio_id, 'gestionarConfiguracion') then return true; end if;
  if v_fila.creado_por = auth.uid() then return true; end if;
  return exists (
    select 1 from membresia m
     where m.id = v_fila.responsable_id and m.usuario_id = auth.uid() and not m.eliminado
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 8. LEER LA LISTA — con todo resuelto y paginado en el servidor
-- ---------------------------------------------------------------------
--
-- LA PAGINACION ES DEL SERVIDOR, no del navegador. Bajarse los mil doscientos
-- recordatorios de tres años para enseñar diez es lo que hace que la pantalla
-- tarde cinco segundos en abrir el dia que el centro lleva tiempo usandola — y
-- para entonces ya nadie sabe que fue lo que la volvio lenta.
--
-- LOS NOMBRES SE RESUELVEN AQUI, NO SE COPIAN. La categoria, el responsable y
-- el nombre de la entidad relacionada salen de un join en cada lectura. El dia
-- que una paciente se cambie el apellido, todos sus recordatorios lo dicen al
-- dia sin tocar nada.
--
-- "VENCIDO" SE CALCULA, no se guarda. Ver la cabecera del bloque.
create or replace function public.recordatorios_del_centro(
  p_negocio text,
  p_hoy date,
  p_pestana text default 'todos',
  p_busqueda text default null,
  p_categoria uuid default null,
  p_responsable uuid default null,
  p_prioridad text default null,
  p_entidad text default null,
  p_desde date default null,
  p_hasta date default null,
  p_solo_recurrentes boolean default false,
  p_solo_automaticos boolean default false,
  p_orden text default 'urgencia',
  p_desc boolean default false,
  p_pagina int default 1,
  p_por_pagina int default 10
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_tamano int := least(greatest(coalesce(p_por_pagina, 10), 1), 200);
  v_aguja  text := app.plegar(nullif(btrim(coalesce(p_busqueda, '')), ''));
  v_dias   int;
  v_salta  int;
  v_total  bigint;
  v_filas  jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(dias_de_proximos, 7) into v_dias
    from recordatorio_ajustes where negocio_id = p_negocio;
  v_dias := coalesce(v_dias, 7);
  v_salta := (v_pagina - 1) * v_tamano;

  /*
   * UNA SOLA PASADA: se filtra, se cuenta y se recorta la pagina en la misma
   * consulta. Con dos consultas —una para el total y otra para las filas— el
   * `where` se escribe dos veces, y el dia que alguien corrija un filtro en una
   * y no en la otra, el pie dice "de 40" sobre una lista de 12.
   *
   * `count(*) over ()` cuenta lo filtrado ANTES de recortar, y el `filter` del
   * agregado se queda solo con la pagina. Por eso el total sigue siendo bueno
   * aunque la pagina pedida quede vacia.
   */
  with base as (
    select r.id, r.titulo, r.detalle, r.notas, r.fecha, r.hora, r.prioridad, r.estado,
           r.categoria_id, r.responsable_id, r.entidad_tipo, r.entidad_id,
           r.recurrente_id, r.automatizacion_id, r.origen_tipo, r.anticipacion_min,
           r.notificado_en, r.completado_en, r.creado_en, r.actualizado_en,
           c.nombre as categoria, c.color as categoria_color,
           m.nombre as responsable,
           mc.nombre as completado_por,
           mk.nombre as creado_por,
           rr.frecuencia as recurrencia,
           e.nombre as entidad_nombre,
           e.contacto as entidad_contacto,
           (r.estado = 'pendiente' and r.fecha < p_hoy) as vencido
      from recordatorio r
      left join categoria c on c.id = r.categoria_id
      left join membresia m on m.id = r.responsable_id
      left join membresia mc on mc.usuario_id = r.completado_por and mc.negocio_id = r.negocio_id
      left join membresia mk on mk.usuario_id = r.creado_por and mk.negocio_id = r.negocio_id
      left join recordatorio_recurrente rr on rr.id = r.recurrente_id
      /*
       * LA ENTIDAD RELACIONADA SE RESUELVE CON UN LATERAL, no con seis joins.
       * Un recordatorio apunta a UNA cosa; seis left joins traerian cinco nulos
       * por renglon y obligarian a un coalesce de seis niveles para ordenar o
       * buscar por el nombre de lo relacionado.
       *
       * Y SE RESUELVE AL LEER, nunca se copia: el dia que una paciente se
       * cambie el apellido, todos sus recordatorios lo dicen al dia.
       */
      left join lateral (
        select case r.entidad_tipo
                 when 'cliente'  then (select cl.nombre from cliente cl where cl.id = r.entidad_id)
                 when 'cita'     then (select coalesce(cl.nombre, 'Cita') from cita ci
                                        left join cliente cl on cl.id = ci.cliente_id
                                        where ci.id = r.entidad_id)
                 when 'venta'    then (select v.folio from venta v where v.id = r.entidad_id)
                 when 'curso'    then (select cu.nombre from curso cu where cu.id = r.entidad_id)
                 when 'producto' then (select p.nombre from producto p where p.id = r.entidad_id)
                 when 'servicio' then (select s.nombre from servicio s where s.id = r.entidad_id)
                 when 'gasto'    then (select g.descripcion from gasto g where g.id = r.entidad_id)
               end as nombre,
               -- El telefono o el correo, para poder abrirle la conversacion al
               -- paciente desde el recordatorio sin un segundo viaje.
               case r.entidad_tipo
                 when 'cliente' then (select coalesce(cl.telefono, cl.correo) from cliente cl
                                       where cl.id = r.entidad_id)
                 when 'cita'    then (select coalesce(cl.telefono, cl.correo) from cita ci
                                       left join cliente cl on cl.id = ci.cliente_id
                                       where ci.id = r.entidad_id)
               end as contacto
      ) e on true
     where r.negocio_id = p_negocio
       and not r.eliminado
       and (p_pestana <> 'pendientes'  or r.estado = 'pendiente')
       and (p_pestana <> 'hoy'         or (r.estado = 'pendiente' and r.fecha = p_hoy))
       and (p_pestana <> 'proximos'    or (r.estado = 'pendiente'
                                           and r.fecha > p_hoy and r.fecha <= p_hoy + v_dias))
       and (p_pestana <> 'completados' or r.estado = 'hecho')
       and (p_pestana <> 'vencidos'    or (r.estado = 'pendiente' and r.fecha < p_hoy))
       and (p_pestana <> 'cancelados'  or r.estado = 'descartado')
       and (p_categoria is null   or r.categoria_id = p_categoria)
       and (p_responsable is null or r.responsable_id = p_responsable)
       and (p_prioridad is null   or r.prioridad = p_prioridad)
       and (p_entidad is null     or r.entidad_tipo = p_entidad)
       and (p_desde is null       or r.fecha >= p_desde)
       and (p_hasta is null       or r.fecha <= p_hasta)
       and (not coalesce(p_solo_recurrentes, false) or r.recurrente_id is not null)
       and (not coalesce(p_solo_automaticos, false) or r.automatizacion_id is not null)
       /*
        * LA BUSQUEDA MIRA TAMBIEN LO RELACIONADO. Buscar el apellido de una
        * paciente tiene que encontrar el recordatorio que habla de ella aunque
        * su nombre no este escrito en el titulo — y no lo esta nunca, porque
        * los nombres no se copian.
        */
       and (v_aguja is null or (
              app.plegar(r.titulo) like '%' || v_aguja || '%'
           or app.plegar(r.detalle) like '%' || v_aguja || '%'
           or app.plegar(r.notas) like '%' || v_aguja || '%'
           or app.plegar(c.nombre) like '%' || v_aguja || '%'
           or app.plegar(m.nombre) like '%' || v_aguja || '%'
           or app.plegar(e.nombre) like '%' || v_aguja || '%'
         ))
  ),
  contado as (
    select b.*,
           count(*) over () as cuantos,
           row_number() over (order by
             /*
              * EL ORDEN POR OMISION ES POR URGENCIA, no por fecha a secas:
              * primero lo vencido, luego lo de hoy, luego lo proximo y al final
              * lo ya cerrado. Ordenar solo por fecha pone arriba del todo lo que
              * se completo hace tres meses.
              */
             case when p_orden = 'urgencia' then
               case when b.estado <> 'pendiente' then 3
                    when b.fecha < p_hoy then 0
                    when b.fecha = p_hoy then 1
                    else 2 end
             end asc nulls last,
             case when p_orden = 'prioridad' then
               case b.prioridad when 'urgente' then 0 when 'alta' then 1
                                when 'normal' then 2 else 3 end
             end asc nulls last,
             case when p_orden = 'estado' then b.estado end asc nulls last,
             case when p_orden = 'responsable' then lower(coalesce(b.responsable, 'zzzz')) end
               asc nulls last,
             case when p_orden = 'creacion' and coalesce(p_desc, false) then b.creado_en end
               desc nulls last,
             case when p_orden = 'creacion' and not coalesce(p_desc, false) then b.creado_en end
               asc nulls last,
             case when coalesce(p_desc, false) then b.fecha end desc nulls last,
             case when not coalesce(p_desc, false) then b.fecha end asc nulls last,
             b.hora asc nulls last,
             -- A igual dia y hora, lo capturado antes va antes. Sin este ultimo
             -- desempate el orden baila entre paginas y la fila que ibas a tocar
             -- se mueve sola.
             b.creado_en asc
           ) as n
      from base b
  )
  select coalesce(max(cuantos), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'titulo', titulo, 'detalle', detalle, 'notas', notas,
           'fecha', fecha, 'hora', hora, 'prioridad', prioridad, 'estado', estado,
           'vencido', vencido,
           'categoriaId', categoria_id, 'categoria', categoria, 'categoriaColor', categoria_color,
           'responsableId', responsable_id, 'responsable', responsable,
           'entidadTipo', entidad_tipo, 'entidadId', entidad_id,
           'entidadNombre', entidad_nombre, 'entidadContacto', entidad_contacto,
           'recurrenteId', recurrente_id, 'recurrencia', recurrencia,
           'automatizacionId', automatizacion_id, 'origenTipo', origen_tipo,
           'anticipacionMin', anticipacion_min, 'notificadoEn', notificado_en,
           'completadoEn', completado_en, 'completadoPor', completado_por,
           'creadoPor', creado_por, 'creadoEn', creado_en, 'actualizadoEn', actualizado_en
         ) order by n) filter (where n > v_salta and n <= v_salta + v_tamano), '[]'::jsonb)
    into v_total, v_filas
    from contado;

  return jsonb_build_object(
    'total', v_total,
    'pagina', v_pagina,
    'porPagina', v_tamano,
    'filas', v_filas
  );
end;
$$;

comment on function public.recordatorios_del_centro(text, date, text, text, uuid, uuid, text, text, date, date, boolean, boolean, text, boolean, int, int) is
  'La lista con todo resuelto y paginada EN EL SERVIDOR, en una sola pasada. Los nombres se '
  'resuelven al leer; "vencido" se calcula, nunca se guarda.';

grant execute on function public.recordatorios_del_centro(text, date, text, text, uuid, uuid, text, text, date, date, boolean, boolean, text, boolean, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 9. EL RESUMEN — las cuatro cifras, la dona y los proximos, en un viaje
-- ---------------------------------------------------------------------
--
-- UN VIAJE Y NO SEIS. Las cuatro tarjetas de arriba, la dona del costado, la
-- lista de proximos y las metricas de cumplimiento salen de la misma tabla; una
-- consulta por tarjeta serian seis viajes cada vez que alguien abre la
-- pantalla.
--
-- LAS METRICAS DE CUMPLIMIENTO SOLO SE MANDAN SI HAY CON QUE. Un "0% de
-- cumplimiento" cuando no se ha completado nada todavia no es un dato: es un
-- reproche inventado. Se manda `null` y la pantalla no pinta la tarjeta.
create or replace function public.resumen_de_recordatorios(
  p_negocio text,
  p_hoy date
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_dias        int;
  v_mes         date := date_trunc('month', p_hoy)::date;
  v_cerrados    bigint;
  v_horas       numeric;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(dias_de_proximos, 7) into v_dias
    from recordatorio_ajustes where negocio_id = p_negocio;
  v_dias := coalesce(v_dias, 7);

  select count(*), avg(extract(epoch from (completado_en - creado_en)) / 3600.0)
    into v_cerrados, v_horas
    from recordatorio
   where negocio_id = p_negocio and not eliminado and estado = 'hecho'
     and completado_en is not null and completado_en >= v_mes;

  return jsonb_build_object(
    'diasDeProximos', v_dias,
    'pendientes', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente'),
    'hoy', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha = p_hoy),
    'vencidos', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente' and fecha < p_hoy),
    'proximos', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente'
         and fecha > p_hoy and fecha <= p_hoy + v_dias),
    -- "Completados: este mes", igual que dice el diseño. Un total historico
    -- solo sube y a los dos años deja de significar nada.
    'completados', v_cerrados,
    'cancelados', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'descartado'),
    'total', (
      select count(*) from recordatorio where negocio_id = p_negocio and not eliminado),
    -- SIN NADA CERRADO NO HAY PROMEDIO. Se manda null; la pantalla no inventa
    -- un cero que se leeria como "todo se resuelve al instante".
    'horasPromedio', case when v_cerrados = 0 then null else round(v_horas, 1) end,
    'porCategoria', (
      select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', c.id, 'nombre', coalesce(c.nombre, 'Sin categoría'), 'color', c.color,
                 'cuantos', count(*),
                 'hechos', count(*) filter (where r.estado = 'hecho')) as x
          from recordatorio r
          left join categoria c on c.id = r.categoria_id
         where r.negocio_id = p_negocio and not r.eliminado
         group by c.id, c.nombre, c.color
      ) t),
    'porResponsable', (
      select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', m.id, 'nombre', coalesce(m.nombre, 'Sin responsable'),
                 'cuantos', count(*),
                 'hechos', count(*) filter (where r.estado = 'hecho'),
                 'vencidos', count(*) filter (where r.estado = 'pendiente' and r.fecha < p_hoy)) as x
          from recordatorio r
          left join membresia m on m.id = r.responsable_id
         where r.negocio_id = p_negocio and not r.eliminado
         group by m.id, m.nombre
      ) t),
    -- LOS PROXIMOS DEL COSTADO. Ordenados por FECHA y no por prioridad: uno
    -- urgente para dentro de tres semanas no es lo que hay que hacer hoy.
    'proximosRecordatorios', (
      select coalesce(jsonb_agg(x order by (x->>'fecha')::date, x->>'hora' nulls last), '[]'::jsonb)
        from (
          select jsonb_build_object(
                   'id', r.id, 'titulo', r.titulo, 'fecha', r.fecha, 'hora', r.hora,
                   'prioridad', r.prioridad,
                   'entidadTipo', r.entidad_tipo,
                   'entidadNombre', case r.entidad_tipo
                     when 'cliente'  then (select cl.nombre from cliente cl where cl.id = r.entidad_id)
                     when 'cita'     then (select coalesce(cl.nombre, 'Cita') from cita ci
                                            left join cliente cl on cl.id = ci.cliente_id
                                            where ci.id = r.entidad_id)
                     when 'venta'    then (select v.folio from venta v where v.id = r.entidad_id)
                     when 'curso'    then (select cu.nombre from curso cu where cu.id = r.entidad_id)
                     when 'producto' then (select p.nombre from producto p where p.id = r.entidad_id)
                     when 'servicio' then (select s.nombre from servicio s where s.id = r.entidad_id)
                     when 'gasto'    then (select g.descripcion from gasto g where g.id = r.entidad_id)
                   end,
                   'categoria', c.nombre,
                   'vencido', r.fecha < p_hoy) as x
            from recordatorio r
            left join categoria c on c.id = r.categoria_id
           where r.negocio_id = p_negocio and not r.eliminado and r.estado = 'pendiente'
           order by r.fecha, r.hora nulls last
           limit 5
        ) t),
    'consejo', (select consejo from recordatorio_ajustes where negocio_id = p_negocio)
  );
end;
$$;

comment on function public.resumen_de_recordatorios(text, date) is
  'Las cuatro cifras, la dona, los proximos y el cumplimiento en UN viaje. El promedio y el '
  'cumplimiento van en null cuando no hay con que calcularlos: un 0% inventado es un reproche.';

grant execute on function public.resumen_de_recordatorios(text, date) to authenticated;

-- ---------------------------------------------------------------------
-- 10. GUARDAR — el alta y la edicion son la MISMA entidad
-- ---------------------------------------------------------------------
--
-- EDITAR NO CREA UNO NUEVO. Es la misma fila, y por eso el historial de un
-- recordatorio se puede leer de principio a fin. La alternativa —anular y
-- encadenar, como hace Gastos— tiene sentido cuando hay dinero de por medio y
-- el registro no se puede tocar; aqui solo produciria tres copias de la misma
-- tarea en la lista.
create or replace function public.guardar_recordatorio(
  p_negocio text,
  p_id uuid,
  p_titulo text,
  p_fecha date,
  p_detalle text default null,
  p_hora time default null,
  p_prioridad text default 'normal',
  p_categoria uuid default null,
  p_responsable uuid default null,
  p_entidad_tipo text default null,
  p_entidad_id uuid default null,
  p_notas text default null,
  p_anticipacion int default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_antes  jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  -- LAS MISMAS VALIDACIONES QUE LA PANTALLA, aqui otra vez. La pantalla valida
  -- para decirlo bien y a tiempo; esto valida para que sea verdad aunque
  -- alguien mande la peticion a mano.
  if v_titulo = '' then
    raise exception 'El recordatorio necesita un título.' using errcode = 'check_violation';
  end if;
  if length(v_titulo) > 160 then
    raise exception 'El título no puede pasar de 160 letras.' using errcode = 'check_violation';
  end if;
  if p_fecha is null then
    raise exception 'El recordatorio necesita una fecha.' using errcode = 'check_violation';
  end if;
  -- UNA ENTIDAD A MEDIAS NO SE GUARDA. Un `entidad_tipo` sin `entidad_id` deja
  -- un renglon que dice "relacionado con una cita" y no puede abrir ninguna.
  if (p_entidad_tipo is null) <> (p_entidad_id is null) then
    raise exception 'La relación necesita el tipo y el registro, o ninguno de los dos.'
      using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into recordatorio (negocio_id, titulo, detalle, fecha, hora, prioridad, categoria_id,
                              responsable_id, entidad_tipo, entidad_id, notas, anticipacion_min,
                              creado_por, estado)
    values (p_negocio, v_titulo, nullif(btrim(coalesce(p_detalle, '')), ''), p_fecha, p_hora,
            coalesce(p_prioridad, 'normal'), p_categoria, p_responsable, p_entidad_tipo,
            p_entidad_id, nullif(btrim(coalesce(p_notas, '')), ''), p_anticipacion,
            auth.uid(), 'pendiente')
    returning id into v_id;

    perform app.anotar_recordatorio(p_negocio, v_id, 'creado', null,
      jsonb_build_object('titulo', v_titulo, 'fecha', p_fecha, 'prioridad', p_prioridad));
    return v_id;
  end if;

  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo. Solo quien lo creó, su responsable o quien '
                    'administra el centro pueden cambiarlo.' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object('titulo', titulo, 'fecha', fecha, 'hora', hora,
                            'prioridad', prioridad, 'categoriaId', categoria_id,
                            'responsableId', responsable_id)
    into v_antes
    from recordatorio where id = p_id and negocio_id = p_negocio;

  if v_antes is null then
    raise exception 'Ese recordatorio no existe en este centro.' using errcode = 'no_data_found';
  end if;

  update recordatorio
     set titulo = v_titulo,
         detalle = nullif(btrim(coalesce(p_detalle, '')), ''),
         fecha = p_fecha,
         hora = p_hora,
         prioridad = coalesce(p_prioridad, 'normal'),
         categoria_id = p_categoria,
         responsable_id = p_responsable,
         entidad_tipo = p_entidad_tipo,
         entidad_id = p_entidad_id,
         notas = nullif(btrim(coalesce(p_notas, '')), ''),
         anticipacion_min = p_anticipacion,
         -- CAMBIAR LA FECHA O LA HORA VUELVE A ARMAR EL AVISO. Sin esto, mover
         -- un recordatorio a la semana que viene lo dejaria marcado como ya
         -- avisado y no volveria a sonar.
         notificado_en = case when p_fecha is distinct from (v_antes->>'fecha')::date
                                or p_hora is distinct from (v_antes->>'hora')::time
                              then null else notificado_en end,
         actualizado_en = now(),
         actualizado_por = auth.uid()
   where id = p_id and negocio_id = p_negocio;

  perform app.anotar_recordatorio(p_negocio, p_id, 'editado', v_antes,
    jsonb_build_object('titulo', v_titulo, 'fecha', p_fecha, 'hora', p_hora,
                       'prioridad', p_prioridad, 'categoriaId', p_categoria,
                       'responsableId', p_responsable));
  return p_id;
end;
$$;

comment on function public.guardar_recordatorio(text, uuid, text, date, text, time, text, uuid, uuid, text, uuid, text, int) is
  'Alta y edicion de la MISMA entidad. Editar no crea uno nuevo: es la misma fila, y por eso su '
  'historial se puede leer entero.';

grant execute on function public.guardar_recordatorio(text, uuid, text, date, text, time, text, uuid, uuid, text, uuid, text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 11. COMPLETAR Y REABRIR — y la siguiente vuelta de la recurrencia
-- ---------------------------------------------------------------------
--
-- COMPLETAR UN RECURRENTE NO MATA LA RECURRENCIA. Es el error clasico: se marca
-- hecho "confirmar caja del lunes" y la regla desaparece con el, asi que el
-- lunes siguiente no avisa nadie. Aqui, al cerrar uno que viene de una regla,
-- se programa la siguiente ocurrencia en el mismo acto — y si ya existe, el
-- indice unico la descarta sin ruido.
create or replace function public.completar_recordatorio(
  p_id uuid,
  p_hecho boolean default true
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila     recordatorio;
  v_regla    recordatorio_recurrente;
  v_proxima  date;
  v_nuevo    uuid;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo. Solo quien lo creó, su responsable o quien '
                    'administra el centro pueden cerrarlo.' using errcode = 'insufficient_privilege';
  end if;

  if p_hecho then
    update recordatorio
       set estado = 'hecho', completado_en = now(), completado_por = auth.uid(),
           actualizado_en = now(), actualizado_por = auth.uid()
     where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'completado',
      jsonb_build_object('estado', v_fila.estado), jsonb_build_object('estado', 'hecho'));
  else
    -- REABRIR LIMPIA LA MARCA DE COMPLETADO. Dejarla puesta haria que las
    -- metricas de "completados este mes" contaran uno que esta abierto.
    update recordatorio
       set estado = 'pendiente', completado_en = null, completado_por = null,
           notificado_en = null, actualizado_en = now(), actualizado_por = auth.uid()
     where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'reabierto',
      jsonb_build_object('estado', v_fila.estado), jsonb_build_object('estado', 'pendiente'));
    return null;
  end if;

  if v_fila.recurrente_id is null then return null; end if;

  select * into v_regla from recordatorio_recurrente
   where id = v_fila.recurrente_id and estado = 'activo' and not eliminado;
  if not found then return null; end if;

  v_proxima := app.siguiente_fecha_de_recordatorio(
    v_regla.frecuencia, v_regla.intervalo, v_regla.dias_semana, v_fila.fecha);

  -- Los dos topes de una regla: la fecha final y el numero de repeticiones.
  if v_regla.fecha_fin is not null and v_proxima > v_regla.fecha_fin then
    update recordatorio_recurrente set estado = 'finalizado', actualizado_en = now()
     where id = v_regla.id;
    return null;
  end if;
  if v_regla.repeticiones is not null and v_regla.generados >= v_regla.repeticiones then
    update recordatorio_recurrente set estado = 'finalizado', actualizado_en = now()
     where id = v_regla.id;
    return null;
  end if;

  insert into recordatorio (negocio_id, titulo, detalle, notas, fecha, hora, prioridad,
                            categoria_id, responsable_id, entidad_tipo, entidad_id,
                            anticipacion_min, recurrente_id, creado_por, estado)
  values (v_regla.negocio_id, v_regla.titulo, v_regla.detalle, v_regla.notas, v_proxima,
          v_regla.hora, v_regla.prioridad, v_regla.categoria_id, v_regla.responsable_id,
          v_regla.entidad_tipo, v_regla.entidad_id, v_regla.anticipacion_min,
          v_regla.id, v_regla.creado_por, 'pendiente')
  -- Si otra pestaña ya la creo, esta se descarta sola. La unicidad la pone el
  -- indice, no esta funcion.
  on conflict do nothing
  returning id into v_nuevo;

  update recordatorio_recurrente
     set proxima_fecha = v_proxima,
         generados = generados + case when v_nuevo is null then 0 else 1 end,
         actualizado_en = now()
   where id = v_regla.id;

  if v_nuevo is not null then
    perform app.anotar_recordatorio(v_regla.negocio_id, v_nuevo, 'programado', null,
      jsonb_build_object('fecha', v_proxima, 'recurrenteId', v_regla.id));
  end if;
  return v_nuevo;
end;
$$;

comment on function public.completar_recordatorio(uuid, boolean) is
  'Completar y reabrir. Completar uno recurrente PROGRAMA LA SIGUIENTE VUELTA en el mismo acto: '
  'sin eso, cerrar el del lunes mataria la regla y el lunes siguiente no avisaria nadie.';

grant execute on function public.completar_recordatorio(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 12. POSPONER, AJUSTAR, CANCELAR, DUPLICAR Y ELIMINAR
-- ---------------------------------------------------------------------

-- POSPONER MUEVE LA FECHA DE VERDAD Y LO ANOTA. Un "posponer" que solo esconde
-- el renglon un rato es la funcion que mas rapido destruye la confianza en una
-- lista de pendientes: al dia siguiente vuelve a aparecer y nadie sabe si se
-- movio o no.
create or replace function public.posponer_recordatorio(
  p_id uuid,
  p_fecha date,
  p_hora time default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if p_fecha is null then
    raise exception 'Posponer necesita una fecha nueva.' using errcode = 'check_violation';
  end if;
  if v_fila.estado <> 'pendiente' then
    raise exception 'Solo se pospone lo que sigue pendiente.' using errcode = 'check_violation';
  end if;

  update recordatorio
     set fecha = p_fecha,
         hora = coalesce(p_hora, hora),
         -- Vuelve a armarse el aviso: si no, un recordatorio ya avisado que se
         -- pospone a mañana no volveria a sonar nunca.
         notificado_en = null,
         actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_id;

  perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'pospuesto',
    jsonb_build_object('fecha', v_fila.fecha, 'hora', v_fila.hora),
    jsonb_build_object('fecha', p_fecha, 'hora', coalesce(p_hora, v_fila.hora)));
end;
$$;

grant execute on function public.posponer_recordatorio(uuid, date, time) to authenticated;

-- Cambia UNA cosa y anota cual. Es lo que usan las opciones rapidas del menu
-- de tres puntos: reasignar, subir la prioridad, mover de categoria.
--
-- UN DISCRIMINADOR Y NO CUATRO PARAMETROS OPCIONALES, porque `null` es un valor
-- legitimo en los tres campos: "sin responsable" y "no me lo toques" no se
-- pueden distinguir si los dos llegan como null.
create or replace function public.ajustar_recordatorio(
  p_id uuid,
  p_que text,
  p_valor text
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
  v_antes jsonb;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo.' using errcode = 'insufficient_privilege';
  end if;

  if p_que = 'responsable' then
    v_antes := jsonb_build_object('responsableId', v_fila.responsable_id);
    update recordatorio set responsable_id = nullif(p_valor, '')::uuid,
           actualizado_en = now(), actualizado_por = auth.uid() where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'reasignado', v_antes,
      jsonb_build_object('responsableId', nullif(p_valor, '')));

  elsif p_que = 'prioridad' then
    if p_valor not in ('baja', 'normal', 'alta', 'urgente') then
      raise exception 'Esa prioridad no existe.' using errcode = 'check_violation';
    end if;
    v_antes := jsonb_build_object('prioridad', v_fila.prioridad);
    update recordatorio set prioridad = p_valor,
           actualizado_en = now(), actualizado_por = auth.uid() where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'prioridad', v_antes,
      jsonb_build_object('prioridad', p_valor));

  elsif p_que = 'categoria' then
    v_antes := jsonb_build_object('categoriaId', v_fila.categoria_id);
    update recordatorio set categoria_id = nullif(p_valor, '')::uuid,
           actualizado_en = now(), actualizado_por = auth.uid() where id = p_id;
    perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'categoria', v_antes,
      jsonb_build_object('categoriaId', nullif(p_valor, '')));

  elsif p_que = 'avisado' then
    -- La pantalla marca que YA aviso, para no repetir la notificacion cada vez
    -- que alguien recarga. No lleva historial: no es una decision de nadie.
    update recordatorio set notificado_en = now() where id = p_id;

  else
    raise exception 'No se puede ajustar "%".', p_que using errcode = 'check_violation';
  end if;
end;
$$;

grant execute on function public.ajustar_recordatorio(uuid, text, text) to authenticated;

-- CANCELAR NO ES COMPLETAR, y son dos cosas distintas para el negocio: una se
-- hizo y la otra ya no aplica. Contarlas juntas convertiria "27 completados"
-- en un numero que nadie puede usar.
create or replace function public.cancelar_recordatorio(
  p_id uuid,
  p_motivo text default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo.' using errcode = 'insufficient_privilege';
  end if;

  update recordatorio
     set estado = 'descartado', actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_id;

  perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'cancelado',
    jsonb_build_object('estado', v_fila.estado),
    jsonb_build_object('estado', 'descartado', 'motivo', nullif(btrim(coalesce(p_motivo, '')), '')));
end;
$$;

grant execute on function public.cancelar_recordatorio(uuid, text) to authenticated;

-- ELIMINAR ES MARCAR, NUNCA BORRAR. La regla 9 del bloque 0 vale igual aqui:
-- el historial de por que nadie confirmo aquella cita se pierde entero si la
-- fila desaparece. Y ademas libera el hueco del indice de origen, que es la
-- forma de decirle a una automatizacion "vuelve a avisarme de esto".
create or replace function public.eliminar_recordatorio(p_id uuid) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila recordatorio;
begin
  select * into v_fila from recordatorio where id = p_id;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.puede_tocar_recordatorio(p_id) then
    raise exception 'Este recordatorio no es tuyo.' using errcode = 'insufficient_privilege';
  end if;

  -- El renglon del historial va ANTES del borrado logico: despues, la fila ya
  -- no cuenta como visible y el rastro quedaria sin su ultimo paso.
  perform app.anotar_recordatorio(v_fila.negocio_id, p_id, 'eliminado',
    jsonb_build_object('titulo', v_fila.titulo, 'estado', v_fila.estado), null);

  update recordatorio set eliminado = true, actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_id;
end;
$$;

grant execute on function public.eliminar_recordatorio(uuid) to authenticated;

-- DUPLICAR CREA OTRA ENTIDAD, con su propio id y su propio historial. Lo que NO
-- se copia es el estado ni la recurrencia: una copia nace pendiente y suelta,
-- porque copiar la regla dejaria dos reglas generando el mismo recordatorio.
create or replace function public.duplicar_recordatorio(p_id uuid, p_fecha date default null)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila  recordatorio;
  v_nuevo uuid;
begin
  select * into v_fila from recordatorio where id = p_id and not eliminado;
  if not found then
    raise exception 'Ese recordatorio no existe.' using errcode = 'no_data_found';
  end if;
  if not app.es_miembro(v_fila.negocio_id) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  insert into recordatorio (negocio_id, titulo, detalle, notas, fecha, hora, prioridad,
                            categoria_id, responsable_id, entidad_tipo, entidad_id,
                            anticipacion_min, creado_por, estado)
  values (v_fila.negocio_id, left(v_fila.titulo || ' (copia)', 160), v_fila.detalle, v_fila.notas,
          coalesce(p_fecha, v_fila.fecha), v_fila.hora, v_fila.prioridad, v_fila.categoria_id,
          v_fila.responsable_id, v_fila.entidad_tipo, v_fila.entidad_id, v_fila.anticipacion_min,
          auth.uid(), 'pendiente')
  returning id into v_nuevo;

  perform app.anotar_recordatorio(v_fila.negocio_id, v_nuevo, 'creado', null,
    jsonb_build_object('duplicadoDe', p_id));
  return v_nuevo;
end;
$$;

grant execute on function public.duplicar_recordatorio(uuid, date) to authenticated;

-- El rastro de un recordatorio, del mas reciente al mas viejo.
create or replace function public.historial_del_recordatorio(p_id uuid)
returns table (
  id uuid, accion text, antes jsonb, despues jsonb, usuario text, creado_en timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return query
    select e.id, e.accion, e.antes, e.despues, e.usuario_nombre, e.creado_en
      from recordatorio_evento e
     where e.recordatorio_id = p_id
     order by e.creado_en desc, e.id desc
     limit 100;
end;
$$;

grant execute on function public.historial_del_recordatorio(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 13. LOS RECORDATORIOS DE UNA ENTIDAD — lo que leen los demas modulos
-- ---------------------------------------------------------------------
--
-- ESTA ES LA MITAD DE LA CONEXION QUE CASI SIEMPRE FALTA. Poder abrir el
-- paciente desde el recordatorio es facil; poder ver los recordatorios desde el
-- expediente del paciente es lo que hace que el modulo sirva. Sin esto, quien
-- abre una ficha no tiene forma de saber que hay algo pendiente con esa persona.
create or replace function public.recordatorios_de_la_entidad(
  p_negocio text,
  p_tipo text,
  p_entidad uuid,
  p_incluir_cerrados boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'titulo', r.titulo, 'detalle', r.detalle, 'fecha', r.fecha,
             'hora', r.hora, 'prioridad', r.prioridad, 'estado', r.estado,
             'categoria', c.nombre, 'responsable', m.nombre)
           order by r.estado, r.fecha, r.hora nulls last)
      from recordatorio r
      left join categoria c on c.id = r.categoria_id
      left join membresia m on m.id = r.responsable_id
     where r.negocio_id = p_negocio and not r.eliminado
       and r.entidad_tipo = p_tipo and r.entidad_id = p_entidad
       and (p_incluir_cerrados or r.estado = 'pendiente')
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.recordatorios_de_la_entidad(text, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 14. LA RECURRENCIA — guardar la regla y generar lo que ya tocaba
-- ---------------------------------------------------------------------
create or replace function public.guardar_recordatorio_recurrente(
  p_negocio text,
  p_id uuid,
  p_titulo text,
  p_frecuencia text,
  p_fecha_inicio date,
  p_detalle text default null,
  p_notas text default null,
  p_hora time default null,
  p_prioridad text default 'normal',
  p_categoria uuid default null,
  p_responsable uuid default null,
  p_entidad_tipo text default null,
  p_entidad_id uuid default null,
  p_intervalo int default 1,
  p_dias_semana int[] default null,
  p_fecha_fin date default null,
  p_repeticiones int default null,
  p_anticipacion int default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_titulo text := btrim(coalesce(p_titulo, ''));
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if v_titulo = '' then
    raise exception 'El recordatorio necesita un título.' using errcode = 'check_violation';
  end if;
  if p_fecha_inicio is null then
    raise exception 'La repetición necesita una fecha de inicio.' using errcode = 'check_violation';
  end if;
  if p_fecha_fin is not null and p_fecha_fin < p_fecha_inicio then
    raise exception 'La repetición no puede terminar antes de empezar.'
      using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into recordatorio_recurrente
      (negocio_id, titulo, detalle, notas, hora, prioridad, categoria_id, responsable_id,
       entidad_tipo, entidad_id, anticipacion_min, frecuencia, intervalo, dias_semana,
       fecha_inicio, fecha_fin, repeticiones, proxima_fecha, creado_por)
    values (p_negocio, v_titulo, nullif(btrim(coalesce(p_detalle, '')), ''),
            nullif(btrim(coalesce(p_notas, '')), ''), p_hora, coalesce(p_prioridad, 'normal'),
            p_categoria, p_responsable, p_entidad_tipo, p_entidad_id, p_anticipacion,
            p_frecuencia, greatest(coalesce(p_intervalo, 1), 1), p_dias_semana,
            p_fecha_inicio, p_fecha_fin, p_repeticiones,
            -- LA PRIMERA VEZ ES LA FECHA DE INICIO, no la siguiente. Saltarse la
            -- primera ocurrencia es el fallo que hace que una regla creada hoy
            -- para hoy no genere nada y parezca rota.
            p_fecha_inicio, auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  update recordatorio_recurrente
     set titulo = v_titulo,
         detalle = nullif(btrim(coalesce(p_detalle, '')), ''),
         notas = nullif(btrim(coalesce(p_notas, '')), ''),
         hora = p_hora,
         prioridad = coalesce(p_prioridad, 'normal'),
         categoria_id = p_categoria,
         responsable_id = p_responsable,
         entidad_tipo = p_entidad_tipo,
         entidad_id = p_entidad_id,
         anticipacion_min = p_anticipacion,
         frecuencia = p_frecuencia,
         intervalo = greatest(coalesce(p_intervalo, 1), 1),
         dias_semana = p_dias_semana,
         fecha_inicio = p_fecha_inicio,
         fecha_fin = p_fecha_fin,
         repeticiones = p_repeticiones,
         -- La proxima nunca retrocede por debajo del inicio nuevo.
         proxima_fecha = greatest(proxima_fecha, p_fecha_inicio),
         actualizado_en = now()
   where id = p_id and negocio_id = p_negocio;
  return p_id;
end;
$$;

grant execute on function public.guardar_recordatorio_recurrente(text, uuid, text, text, date, text, text, time, text, uuid, uuid, text, uuid, int, int[], date, int, int) to authenticated;

create or replace function public.marcar_recordatorio_recurrente(p_id uuid, p_estado text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_estado not in ('activo', 'pausado', 'finalizado') then
    raise exception 'Ese estado no existe para una repetición.' using errcode = 'check_violation';
  end if;
  update recordatorio_recurrente set estado = p_estado, actualizado_en = now() where id = p_id;
end;
$$;

grant execute on function public.marcar_recordatorio_recurrente(uuid, text) to authenticated;

create or replace function public.recordatorios_recurrentes_del_centro(p_negocio text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', rr.id, 'titulo', rr.titulo, 'detalle', rr.detalle, 'notas', rr.notas,
             'hora', rr.hora, 'prioridad', rr.prioridad,
             'categoriaId', rr.categoria_id, 'categoria', c.nombre,
             'responsableId', rr.responsable_id, 'responsable', m.nombre,
             'entidadTipo', rr.entidad_tipo, 'entidadId', rr.entidad_id,
             'frecuencia', rr.frecuencia, 'intervalo', rr.intervalo,
             'diasSemana', rr.dias_semana,
             'fechaInicio', rr.fecha_inicio, 'fechaFin', rr.fecha_fin,
             'repeticiones', rr.repeticiones, 'generados', rr.generados,
             'proximaFecha', rr.proxima_fecha, 'estado', rr.estado,
             'anticipacionMin', rr.anticipacion_min)
           order by rr.estado, rr.proxima_fecha)
      from recordatorio_recurrente rr
      left join categoria c on c.id = rr.categoria_id
      left join membresia m on m.id = rr.responsable_id
     where rr.negocio_id = p_negocio and not rr.eliminado
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.recordatorios_recurrentes_del_centro(text) to authenticated;

-- Crea las ocurrencias que ya tocaban.
--
-- SE PUEDE LLAMAR CUANTAS VECES SE QUIERA, y por eso se llama al abrir la
-- pantalla y no hace falta un proceso aparte. La unicidad no la pone esta
-- llamada: la pone el indice `(recurrente_id, fecha)`. Diez pestañas abiertas a
-- la vez no pueden crear dos veces el recordatorio del lunes.
--
-- SE GENERA HASTA HOY Y NO MAS ALLA. Adelantar la agenda entera del año
-- llenaria la lista de cosas que nadie tiene que mirar todavia; el limite de
-- vueltas evita ademas que una regla mal guardada cuelgue la peticion.
create or replace function public.generar_recordatorios_recurrentes(
  p_negocio text,
  p_hoy date default current_date
) returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_regla   recordatorio_recurrente;
  v_fecha   date;
  v_creados int := 0;
  v_nuevo   uuid;
  v_vueltas int;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  for v_regla in
    select * from recordatorio_recurrente
     where negocio_id = p_negocio and estado = 'activo' and not eliminado
       and proxima_fecha <= p_hoy
  loop
    v_fecha := greatest(v_regla.proxima_fecha, v_regla.fecha_inicio);
    v_vueltas := 0;

    while v_fecha <= p_hoy and v_vueltas < 400 loop
      v_vueltas := v_vueltas + 1;

      exit when v_regla.fecha_fin is not null and v_fecha > v_regla.fecha_fin;
      exit when v_regla.repeticiones is not null
                and v_regla.generados + v_creados >= v_regla.repeticiones;

      insert into recordatorio (negocio_id, titulo, detalle, notas, fecha, hora, prioridad,
                                categoria_id, responsable_id, entidad_tipo, entidad_id,
                                anticipacion_min, recurrente_id, creado_por, estado)
      values (v_regla.negocio_id, v_regla.titulo, v_regla.detalle, v_regla.notas, v_fecha,
              v_regla.hora, v_regla.prioridad, v_regla.categoria_id, v_regla.responsable_id,
              v_regla.entidad_tipo, v_regla.entidad_id, v_regla.anticipacion_min,
              v_regla.id, v_regla.creado_por, 'pendiente')
      on conflict do nothing
      returning id into v_nuevo;

      if v_nuevo is not null then
        v_creados := v_creados + 1;
        perform app.anotar_recordatorio(v_regla.negocio_id, v_nuevo, 'programado', null,
          jsonb_build_object('fecha', v_fecha, 'recurrenteId', v_regla.id));
      end if;
      v_nuevo := null;

      v_fecha := app.siguiente_fecha_de_recordatorio(
        v_regla.frecuencia, v_regla.intervalo, v_regla.dias_semana, v_fecha);
    end loop;

    update recordatorio_recurrente
       set proxima_fecha = v_fecha,
           generados = generados + v_creados,
           estado = case
             when fecha_fin is not null and v_fecha > fecha_fin then 'finalizado'
             when repeticiones is not null and generados + v_creados >= repeticiones then 'finalizado'
             else estado end,
           actualizado_en = now()
     where id = v_regla.id;
  end loop;

  return v_creados;
end;
$$;

comment on function public.generar_recordatorios_recurrentes(text, date) is
  'Crea lo que ya tocaba. Idempotente por el indice (recurrente_id, fecha), no por esta funcion: '
  'diez pestañas abiertas no pueden crear dos veces el recordatorio del lunes.';

grant execute on function public.generar_recordatorios_recurrentes(text, date) to authenticated;

-- ---------------------------------------------------------------------
-- 15. LA CONFIGURACION DEL MODULO
-- ---------------------------------------------------------------------
create or replace function public.ajustes_de_recordatorios(p_negocio text) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
           'avisarEnNavegador', a.avisar_en_navegador,
           'anticipacionMin', a.anticipacion_min,
           'horaPorOmision', a.hora_por_omision,
           'avisarAlResponsable', a.avisar_al_responsable,
           'avisarAlReasignar', a.avisar_al_reasignar,
           'diasDeProximos', a.dias_de_proximos,
           'ordenPorOmision', a.orden_por_omision,
           'consejo', a.consejo)
    into v
    from recordatorio_ajustes a where a.negocio_id = p_negocio;

  -- SIN FILA SE DEVUELVEN LOS VALORES DE ARRANQUE, no un nulo. Que la pantalla
  -- tenga que saber que hacer con "todavia no configuraron nada" es como
  -- terminan dos juegos de valores por omision distintos, uno aqui y otro alla.
  return coalesce(v, jsonb_build_object(
    'avisarEnNavegador', false,
    'anticipacionMin', 30,
    'horaPorOmision', '09:00',
    'avisarAlResponsable', true,
    'avisarAlReasignar', true,
    'diasDeProximos', 7,
    'ordenPorOmision', 'urgencia',
    'consejo', null));
end;
$$;

grant execute on function public.ajustes_de_recordatorios(text) to authenticated;

create or replace function public.guardar_ajustes_de_recordatorios(
  p_negocio text,
  p_avisar_navegador boolean,
  p_anticipacion int,
  p_hora_por_omision time,
  p_avisar_responsable boolean,
  p_avisar_reasignar boolean,
  p_dias_proximos int,
  p_orden text,
  p_consejo text default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'Configurar Recordatorios le cambia el comportamiento a todo el centro y pide '
                    'permiso de configuración.' using errcode = 'insufficient_privilege';
  end if;

  insert into recordatorio_ajustes
    (negocio_id, avisar_en_navegador, anticipacion_min, hora_por_omision,
     avisar_al_responsable, avisar_al_reasignar, dias_de_proximos, orden_por_omision,
     consejo, actualizado_en, actualizado_por)
  values (p_negocio, coalesce(p_avisar_navegador, false), coalesce(p_anticipacion, 30),
          coalesce(p_hora_por_omision, '09:00'), coalesce(p_avisar_responsable, true),
          coalesce(p_avisar_reasignar, true), coalesce(p_dias_proximos, 7),
          coalesce(p_orden, 'urgencia'), nullif(btrim(coalesce(p_consejo, '')), ''),
          now(), auth.uid())
  on conflict (negocio_id) do update
    set avisar_en_navegador = excluded.avisar_en_navegador,
        anticipacion_min = excluded.anticipacion_min,
        hora_por_omision = excluded.hora_por_omision,
        avisar_al_responsable = excluded.avisar_al_responsable,
        avisar_al_reasignar = excluded.avisar_al_reasignar,
        dias_de_proximos = excluded.dias_de_proximos,
        orden_por_omision = excluded.orden_por_omision,
        consejo = excluded.consejo,
        actualizado_en = now(),
        actualizado_por = auth.uid();
end;
$$;

grant execute on function public.guardar_ajustes_de_recordatorios(text, boolean, int, time, boolean, boolean, int, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 16. LAS AUTOMATIZACIONES
-- ---------------------------------------------------------------------
create or replace function public.automatizaciones_de_recordatorios(p_negocio text) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'evento', a.evento, 'activa', a.activa,
             'plantillaTitulo', a.plantilla_titulo, 'plantillaDetalle', a.plantilla_detalle,
             'diasAntes', a.dias_antes, 'hora', a.hora, 'prioridad', a.prioridad,
             'categoriaId', a.categoria_id, 'categoria', c.nombre,
             'responsableId', a.responsable_id, 'responsable', m.nombre,
             'creados', (select count(*) from recordatorio r
                          where r.automatizacion_id = a.id and not r.eliminado))
           order by a.evento)
      from recordatorio_automatizacion a
      left join categoria c on c.id = a.categoria_id
      left join membresia m on m.id = a.responsable_id
     where a.negocio_id = p_negocio and not a.eliminado
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.automatizaciones_de_recordatorios(text) to authenticated;

create or replace function public.guardar_automatizacion_de_recordatorios(
  p_negocio text,
  p_evento text,
  p_activa boolean,
  p_titulo text,
  p_detalle text default null,
  p_dias_antes int default 1,
  p_hora time default null,
  p_prioridad text default 'normal',
  p_categoria uuid default null,
  p_responsable uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'Encender una automatización le crea recordatorios a todo el centro y pide '
                    'permiso de configuración.' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'La automatización necesita el título del recordatorio que va a crear.'
      using errcode = 'check_violation';
  end if;

  insert into recordatorio_automatizacion
    (negocio_id, evento, activa, plantilla_titulo, plantilla_detalle, dias_antes, hora,
     prioridad, categoria_id, responsable_id)
  values (p_negocio, p_evento, coalesce(p_activa, false), btrim(p_titulo),
          nullif(btrim(coalesce(p_detalle, '')), ''), coalesce(p_dias_antes, 1), p_hora,
          coalesce(p_prioridad, 'normal'), p_categoria, p_responsable)
  on conflict (negocio_id, evento) do update
    set activa = excluded.activa,
        plantilla_titulo = excluded.plantilla_titulo,
        plantilla_detalle = excluded.plantilla_detalle,
        dias_antes = excluded.dias_antes,
        hora = excluded.hora,
        prioridad = excluded.prioridad,
        categoria_id = excluded.categoria_id,
        responsable_id = excluded.responsable_id,
        eliminado = false,
        actualizado_en = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.guardar_automatizacion_de_recordatorios(text, text, boolean, text, text, int, time, text, uuid, uuid) to authenticated;

-- Aplica las reglas ENCENDIDAS y devuelve cuantos recordatorios nacieron.
--
-- NO CREA NADA SI NO HAY REGLAS. Es lo primero que comprueba, y es la razon de
-- que se pueda llamar al abrir la pantalla sin miedo: un centro que no ha
-- configurado nada no ve aparecer ni un renglon.
--
-- LOS DUPLICADOS LOS IMPIDE EL INDICE `recordatorio_origen_unico`, no este
-- codigo. Por eso da igual cuantas veces se llame ni desde cuantas pestañas.
create or replace function public.generar_recordatorios_automaticos(
  p_negocio text,
  p_hoy date default current_date
) returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_regla   recordatorio_automatizacion;
  v_creados int := 0;
  v_nuevo   uuid;
  v_origen  record;
  v_titulo  text;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  for v_regla in
    select * from recordatorio_automatizacion
     where negocio_id = p_negocio and activa and not eliminado
  loop
    for v_origen in
      select * from (
        -- CITA NUEVA: una por cita futura que siga viva. Las canceladas no
        -- entran; recordar confirmar una cita cancelada es el aviso falso que
        -- enseña a ignorar los avisos.
        select 'cita'::text as tipo, ci.id, coalesce(cl.nombre, 'la cita') as nombre,
               (ci.fecha - v_regla.dias_antes) as cuando
          from cita ci
          left join cliente cl on cl.id = ci.cliente_id
         where v_regla.evento = 'cita_nueva' and ci.negocio_id = p_negocio and not ci.eliminado
           and ci.fecha >= p_hoy and ci.estado in ('pendiente', 'confirmada')
        union all
        -- CLIENTE NUEVO: seguimiento a quien se dio de alta en los ultimos
        -- treinta dias. Mas atras no: dar seguimiento a alguien que llego hace
        -- medio año no es seguimiento, es una lista vieja de golpe.
        select 'cliente', cl.id, cl.nombre, (cl.creado_en::date + v_regla.dias_antes)
          from cliente cl
         where v_regla.evento = 'cliente_nuevo' and cl.negocio_id = p_negocio and not cl.eliminado
           and cl.creado_en::date >= p_hoy - 30
        union all
        -- VENTA PENDIENTE: los borradores con antigüedad. Una venta cobrada no
        -- necesita seguimiento y una cancelada tampoco.
        select 'venta', v.id, v.folio, (v.fecha + v_regla.dias_antes)
          from venta v
         where v_regla.evento = 'venta_pendiente' and v.negocio_id = p_negocio and not v.eliminado
           and v.estado = 'borrador' and v.fecha >= p_hoy - 90
        union all
        -- STOCK BAJO: producto activo en o por debajo de su minimo.
        select 'producto', p.id, p.nombre, p_hoy
          from producto p
         where v_regla.evento = 'stock_bajo' and p.negocio_id = p_negocio and not p.eliminado
           and p.activo and p.stock_actual <= p.stock_minimo
        union all
        -- CURSO PROXIMO: los que arrancan dentro de la ventana configurada.
        select 'curso', cu.id, cu.nombre, (cu.fecha_inicio - v_regla.dias_antes)
          from curso cu
         where v_regla.evento = 'curso_proximo' and cu.negocio_id = p_negocio and not cu.eliminado
           and cu.fecha_inicio >= p_hoy and cu.estado in ('programado', 'en_curso')
      ) o
    loop
      -- {nombre} y {fecha} se sustituyen con lo que la fila diga AHORA. El
      -- texto resultante se guarda porque es el titulo del recordatorio, no un
      -- dato del cliente: si esa persona se renombra, el vinculo sigue
      -- llevando a su ficha con el nombre al dia.
      v_titulo := replace(replace(v_regla.plantilla_titulo, '{nombre}', coalesce(v_origen.nombre, '')),
                          '{fecha}', to_char(v_origen.cuando, 'DD/MM/YYYY'));

      insert into recordatorio (negocio_id, titulo, detalle, fecha, hora, prioridad,
                                categoria_id, responsable_id, entidad_tipo, entidad_id,
                                origen_tipo, origen_id, automatizacion_id, creado_por, estado)
      values (p_negocio, left(btrim(v_titulo), 160), v_regla.plantilla_detalle,
              greatest(v_origen.cuando, p_hoy), v_regla.hora, v_regla.prioridad,
              v_regla.categoria_id, v_regla.responsable_id, v_origen.tipo, v_origen.id,
              v_regla.evento, v_origen.id, v_regla.id, auth.uid(), 'pendiente')
      on conflict do nothing
      returning id into v_nuevo;

      if v_nuevo is not null then
        v_creados := v_creados + 1;
        perform app.anotar_recordatorio(p_negocio, v_nuevo, 'automatico', null,
          jsonb_build_object('evento', v_regla.evento, 'automatizacionId', v_regla.id));
      end if;
      v_nuevo := null;
    end loop;

    -- EL STOCK QUE SE RESURTIO APAGA SU AVISO. Sin esto, "Reponer aceites"
    -- seguiria en la lista despues de haberlos repuesto, y una lista con cosas
    -- ya resueltas deja de leerse. Se marca `descartado`, no se borra: el hueco
    -- del indice se libera igual y queda el rastro de que llego a hacer falta.
    if v_regla.evento = 'stock_bajo' then
      update recordatorio r
         set estado = 'descartado', actualizado_en = now()
       where r.negocio_id = p_negocio and r.automatizacion_id = v_regla.id
         and r.estado = 'pendiente' and not r.eliminado
         and exists (select 1 from producto p
                      where p.id = r.origen_id and p.stock_actual > p.stock_minimo);
    end if;
  end loop;

  return v_creados;
end;
$$;

comment on function public.generar_recordatorios_automaticos(text, date) is
  'Aplica las reglas ENCENDIDAS. Sin reglas no crea nada, por eso se puede llamar al abrir la '
  'pantalla. Los duplicados los impide el indice recordatorio_origen_unico, no esta funcion.';

grant execute on function public.generar_recordatorios_automaticos(text, date) to authenticated;

-- ---------------------------------------------------------------------
-- 17. LO QUE REPORTES LE PREGUNTA A RECORDATORIOS
-- ---------------------------------------------------------------------
--
-- REPORTES NO CUENTA POR SU CUENTA. Si tuviera su propia consulta contra la
-- tabla, el dia que aqui cambie que significa "vencido" —o que los descartados
-- no cuentan— las dos pantallas dirian cifras distintas del mismo mes y nadie
-- sabria cual creer. Se pregunta aqui, y aqui esta la definicion.
create or replace function public.cumplimiento_de_recordatorios(
  p_negocio text,
  p_desde date,
  p_hasta date,
  p_hoy date default current_date
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_creados   bigint;
  v_hechos    bigint;
  v_horas     numeric;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_creados
    from recordatorio
   where negocio_id = p_negocio and not eliminado and creado_en::date between p_desde and p_hasta;

  select count(*), avg(extract(epoch from (completado_en - creado_en)) / 3600.0)
    into v_hechos, v_horas
    from recordatorio
   where negocio_id = p_negocio and not eliminado and estado = 'hecho'
     and completado_en is not null and completado_en::date between p_desde and p_hasta;

  return jsonb_build_object(
    'creados', v_creados,
    'completados', v_hechos,
    'pendientes', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente'
         and fecha between p_desde and p_hasta),
    'vencidos', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'pendiente'
         and fecha < p_hoy and fecha between p_desde and p_hasta),
    'cancelados', (
      select count(*) from recordatorio
       where negocio_id = p_negocio and not eliminado and estado = 'descartado'
         and fecha between p_desde and p_hasta),
    -- SIN NADA CREADO NO HAY PORCENTAJE. Dividir entre cero da un error, y
    -- rellenarlo con cero diria "0% de cumplimiento" de un mes sin trabajo.
    'cumplimiento', case when v_creados = 0 then null
                         else round(100.0 * v_hechos / v_creados, 1) end,
    'horasPromedio', case when v_hechos = 0 then null else round(v_horas, 1) end,
    'porResponsable', (
      select coalesce(jsonb_agg(x order by (x->>'cuantos')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'nombre', coalesce(m.nombre, 'Sin responsable'),
                 'cuantos', count(*),
                 'hechos', count(*) filter (where r.estado = 'hecho'),
                 'vencidos', count(*) filter (where r.estado = 'pendiente' and r.fecha < p_hoy)) as x
          from recordatorio r
          left join membresia m on m.id = r.responsable_id
         where r.negocio_id = p_negocio and not r.eliminado
           and r.fecha between p_desde and p_hasta
         group by m.nombre
      ) t),
    'porCategoria', (
      select coalesce(jsonb_agg(x order by (x->>'cuantos')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'nombre', coalesce(c.nombre, 'Sin categoría'),
                 'color', c.color,
                 'cuantos', count(*),
                 'hechos', count(*) filter (where r.estado = 'hecho')) as x
          from recordatorio r
          left join categoria c on c.id = r.categoria_id
         where r.negocio_id = p_negocio and not r.eliminado
           and r.fecha between p_desde and p_hasta
         group by c.nombre, c.color
      ) t)
  );
end;
$$;

grant execute on function public.cumplimiento_de_recordatorios(text, date, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 18. LOS PERMISOS DE TABLA DE LO NUEVO
-- ---------------------------------------------------------------------
--
-- Otra vez la distincion que costo un "permission denied" en produccion: las
-- reglas de fila RECORTAN, el `grant` es lo que da el permiso de partida. Una
-- tabla con politicas y sin grant no deja leer NI UNA fila, y el error no sale
-- al instalar: sale la primera vez que alguien abre la pantalla. Lo vigila la
-- guardia 18.
--
-- `anon` no toca nada: aqui hay nombres de pacientes resueltos y notas del
-- centro.
revoke all on recordatorio_recurrente, recordatorio_evento, recordatorio_ajustes,
              recordatorio_automatizacion
  from anon;

grant select, insert, update on recordatorio_recurrente, recordatorio_ajustes,
              recordatorio_automatizacion
  to authenticated;

-- El historial se escribe y se lee; no se corrige. Sin `update` ni `delete`,
-- igual que la caja: lo que paso, paso.
grant select, insert on recordatorio_evento to authenticated;

-- =====================================================================
-- CONFIGURACION — EL CENTRO, SU EQUIPO Y SU RASTRO (bloque 10)
-- =====================================================================
--
-- CASI NO TRAE TABLAS, Y ESO ES LO IMPORTANTE.
--
-- Las siete de la base ya son las suyas: `negocio`, `estado`, `membresia`,
-- `rol`, `licencia`, `auditoria` y `diario`. Configuracion las ADMINISTRA; no
-- las duplica. Una segunda tabla de usuarios o una segunda copia de los
-- horarios acabaria diciendo algo distinto de la primera, y nadie sabria cual
-- creer.
--
-- LA UNICA TABLA NUEVA ES `invitacion`, y existe por una razon concreta:
-- `membresia.usuario_id` es `uuid not null`, asi que no se puede dar de alta a
-- alguien que todavia no tiene cuenta. La invitacion es ese hueco: se guarda el
-- correo, y cuando esa persona entra por primera vez la reclama y se convierte
-- en membresia.
--
-- POR QUE TODO LO QUE ESCRIBE VA EN FUNCIONES `security definer`:
--
-- Las reglas de la base NO dejan que una sesion normal escriba `membresia` ni
-- `rol` — es el agujero mas grave que la base existe para no repetir: en Neron
-- POS la lista de usuarios vivia dentro del bloque JSON que el navegador
-- escribe, asi que una cajera podia cambiarse el rol a dueña sin atacar nada.
-- Aqui no hay servidor propio, asi que la puerta controlada es una funcion que
-- comprueba `gestionarUsuarios` ANTES de tocar nada y corre con permisos del
-- creador. Esa comprobacion es la unica llave; por eso esta escrita en todas.
--
-- LA PROTECCION ANTI-BLOQUEO NO SE TOCA. El rol `dueno` se guarda con la lista
-- de permisos VACIA y `app.tiene_permiso` lo entiende. Ademas, aqui:
--   · nadie puede quitarse a si mismo el acceso ni bajarse de rol,
--   · un centro no se puede quedar sin ningun dueño activo,
--   · los permisos del rol `dueno` no se pueden editar.
-- Las tres se comprueban en la base, no en la pantalla.

-- ---------------------------------------------------------------------
-- 1. EL PLAN, QUE LO ESCRIBE LA PLATAFORMA
-- ---------------------------------------------------------------------
--
-- `licencia` no tenia como decir QUE plan es. La pantalla tiene que enseñarlo
-- —la captura de referencia lo pone arriba a la derecha— y la alternativa era
-- inventarselo en el navegador, que es justo lo que este producto no hace.
--
-- Sigue siendo del mundo B: se lee desde adentro y se escribe SOLO desde la
-- plataforma. Sin plan escrito, la pantalla dice que no hay ninguno
-- administrado en vez de fingir uno.
alter table licencia add column if not exists plan text;

comment on column licencia.plan is
  'El nombre del plan contratado. Lo escribe la plataforma; el centro solo lo lee. Nulo '
  'significa "sin plan administrado", que es la verdad de un centro sin licencia — no un hueco.';

-- ---------------------------------------------------------------------
-- 2. LAS INVITACIONES
-- ---------------------------------------------------------------------
create table if not exists invitacion (
  id            uuid primary key default gen_random_uuid(),
  negocio_id    text not null references negocio(id) on delete cascade,
  correo        text not null,
  nombre        text not null,
  rol           text not null,
  permisos      jsonb,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente', 'aceptada', 'cancelada')),
  invitado_por  uuid,
  creada_en     timestamptz not null default now(),
  aceptada_en   timestamptz,
  aceptada_por  uuid
);

comment on table invitacion is
  'El hueco entre "te invito" y "ya tienes cuenta". membresia.usuario_id es not null, asi que '
  'no se puede dar de alta a quien todavia no existe. Se guarda el correo y la persona la '
  'reclama al entrar por primera vez.';

-- UNA SOLA INVITACION PENDIENTE POR CORREO Y CENTRO. Sin esto, invitar dos
-- veces a la misma persona —que pasa siempre, porque el primer correo se
-- pierde— crearia dos filas y al reclamarlas la segunda reventaria contra la
-- unicidad de `membresia`, con un error que no dice nada.
--
-- VA COMO INDICE PARCIAL Y NO COMO RESTRICCION a proposito: una cancelada y una
-- pendiente del mismo correo tienen que poder convivir, que es lo que permite
-- volver a invitar a alguien despues de cancelarle.
create unique index if not exists invitacion_pendiente_unica
  on invitacion (negocio_id, lower(correo))
  where estado = 'pendiente';

create index if not exists invitacion_por_correo on invitacion (lower(correo)) where estado = 'pendiente';

alter table invitacion enable row level security;
alter table invitacion force row level security;

-- SE LEE CON `gestionarUsuarios`, y nada mas. Un correo ajeno es dato
-- personal: quien no administra el equipo no tiene por que ver a quien se
-- invito y a quien no.
drop policy if exists invitacion_leer on invitacion;
create policy invitacion_leer on invitacion
  for select to authenticated
  using (app.es_miembro(negocio_id) and app.tiene_permiso(negocio_id, 'gestionarUsuarios'));

-- No hay politica de insert, update ni delete: se escribe SOLO por funcion, y
-- la funcion comprueba el permiso. Es la misma decision que `membresia`.

-- ---------------------------------------------------------------------
-- 3. LA CONFIGURACION DEL CENTRO — que se lee
-- ---------------------------------------------------------------------
--
-- EL NOMBRE VIVE EN `negocio` Y LO DEMAS EN `estado.data`, y esa division es
-- la del bloque 0: `estado.data` es para la configuracion —poca, y se lee
-- entera—, mientras que las entidades van en tablas de verdad.
--
-- ES `security invoker`: las reglas de fila deciden que se entrega. Cualquier
-- miembro puede leer como se llama su centro y a que hora abre; para CAMBIARLO
-- hace falta `gestionarConfiguracion`, y eso se comprueba en la funcion de
-- guardar, no aqui.
create or replace function public.configuracion_del_centro(p_negocio text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
  v_datos  jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select n.nombre into v_nombre from negocio n where n.id = p_negocio;
  select coalesce(e.data -> 'centro', '{}'::jsonb) into v_datos
    from estado e where e.negocio_id = p_negocio;

  return jsonb_build_object(
    'nombre', coalesce(v_nombre, ''),
    -- Se devuelve el bloque TAL CUAL, sin rellenar huecos. Los valores por
    -- omision los pone el navegador en un solo sitio: si se pusieran aqui
    -- tambien, el dia que uno cambie habria dos verdades sobre a que hora abre
    -- un centro que nunca configuro nada.
    'centro', coalesce(v_datos, '{}'::jsonb),
    'creadoEn', (select n.creado_en from negocio n where n.id = p_negocio),
    'miembros', (select count(*) from membresia m
                  where m.negocio_id = p_negocio and m.activo and not m.eliminado)
  );
end;
$$;

comment on function public.configuracion_del_centro(text) is
  'El nombre del centro y su bloque de configuracion. Lo lee cualquier miembro: hasta la barra '
  'lateral necesita saber como se llama el sitio donde trabaja.';

grant execute on function public.configuracion_del_centro(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. LA CONFIGURACION DEL CENTRO — que se guarda
-- ---------------------------------------------------------------------
--
-- `security definer` porque toca `negocio.nombre`, que no tiene politica de
-- escritura para nadie: el nombre del centro es de los datos que, si el
-- navegador pudiera escribir sueltos, cualquiera podria renombrarle el centro
-- a su dueña. La llave es la comprobacion de `gestionarConfiguracion` de aqui
-- abajo, y por eso va antes que cualquier `update`.
create or replace function public.guardar_configuracion_del_centro(
  p_negocio text,
  p_nombre text,
  p_datos jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quien  membresia;
  v_antes  jsonb;
  v_nombre text;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'No tienes permiso para cambiar la configuracion del centro.'
      using errcode = 'insufficient_privilege';
  end if;
  -- LA LICENCIA TAMBIEN MANDA AQUI. Sin esto, un centro vencido no podria
  -- guardar una cita pero si renombrarse: dos reglas distintas para la misma
  -- pregunta es como se cuelan los huecos.
  if not app.licencia_permite(p_negocio) then
    raise exception 'La licencia de este centro no permite guardar cambios.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'La configuracion tiene que ser un objeto de llaves.' using errcode = '22023';
  end if;

  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_nombre is null then
    raise exception 'El centro tiene que llamarse de alguna forma.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  select jsonb_build_object('nombre', n.nombre,
                            'centro', coalesce((select e.data -> 'centro' from estado e
                                                 where e.negocio_id = p_negocio), '{}'::jsonb))
    into v_antes
    from negocio n where n.id = p_negocio;

  update negocio set nombre = v_nombre where id = p_negocio;

  -- SE FUSIONA POR LLAVE, igual que `guardar_llaves` de la base y por el mismo
  -- motivo: dos pantallas abiertas que guardan cosas distintas del mismo
  -- bloque no se pisan. Escribir el bloque entero desde el navegador es como
  -- se pierde lo que otro acababa de guardar.
  insert into estado (negocio_id, data)
  values (p_negocio, jsonb_build_object('centro', p_datos))
  on conflict (negocio_id) do update
    set data = coalesce(estado.data, '{}'::jsonb)
               || jsonb_build_object('centro',
                    coalesce(estado.data -> 'centro', '{}'::jsonb) || p_datos),
        updated_at = now();

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = p_negocio and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'configuracion', 'editar', p_negocio, v_antes,
          jsonb_build_object('nombre', v_nombre, 'centro', p_datos));

  return public.configuracion_del_centro(p_negocio);
end;
$$;

comment on function public.guardar_configuracion_del_centro(text, text, jsonb) is
  'Renombra el centro y fusiona su bloque de configuracion. Comprueba gestionarConfiguracion '
  'ANTES de tocar nada: es la unica llave, porque negocio no tiene politica de escritura.';

revoke all on function public.guardar_configuracion_del_centro(text, text, jsonb) from public, anon;
grant execute on function public.guardar_configuracion_del_centro(text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. MI PROPIO NOMBRE
-- ---------------------------------------------------------------------
--
-- Cambiarse el nombre no es administrar usuarios: es la ficha de uno mismo, y
-- se puede hacer sin `gestionarUsuarios`. Lo que NO deja esta funcion es tocar
-- el rol ni el correo — para eso estan las de mas abajo, con su permiso.
create or replace function public.guardar_mi_perfil(p_negocio text, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
  v_id     uuid;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_nombre is null then
    raise exception 'Escribe como te llamas.' using errcode = 'invalid_parameter_value';
  end if;

  update membresia set nombre = v_nombre
   where negocio_id = p_negocio and usuario_id = auth.uid()
  returning id into v_id;

  if v_id is null then
    raise exception 'No se encontro tu membresia en este centro.' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object('id', v_id, 'nombre', v_nombre);
end;
$$;

comment on function public.guardar_mi_perfil(text, text) is
  'El nombre propio, que no es administrar usuarios. No deja tocar rol ni correo: eso pide '
  'gestionarUsuarios y va por otra funcion.';

revoke all on function public.guardar_mi_perfil(text, text) from public, anon;
grant execute on function public.guardar_mi_perfil(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. EL EQUIPO — quien entra y con que rol
-- ---------------------------------------------------------------------
create or replace function public.equipo_del_centro(p_negocio text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para ver el equipo del centro.'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'miembros', (
      select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', m.id,
                 'usuarioId', m.usuario_id,
                 'correo', m.correo,
                 'nombre', m.nombre,
                 'rol', m.rol,
                 'rolEtiqueta', coalesce(r.etiqueta, m.rol),
                 'activo', m.activo,
                 'eliminado', m.eliminado,
                 'permisos', m.permisos,
                 'soyYo', m.usuario_id = auth.uid(),
                 'creadoEn', m.creado_en) as x
          from membresia m
          left join rol r on r.negocio_id = m.negocio_id and r.id = m.rol
         where m.negocio_id = p_negocio
      ) t),
    'invitaciones', (
      select coalesce(jsonb_agg(x order by x->>'creadaEn' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', i.id,
                 'correo', i.correo,
                 'nombre', i.nombre,
                 'rol', i.rol,
                 'rolEtiqueta', coalesce(r.etiqueta, i.rol),
                 'creadaEn', i.creada_en) as x
          from invitacion i
          left join rol r on r.negocio_id = i.negocio_id and r.id = i.rol
         where i.negocio_id = p_negocio and i.estado = 'pendiente'
      ) t),
    -- CUANTOS DUEÑOS ACTIVOS QUEDAN. La pantalla lo necesita para apagar el
    -- boton de dar de baja al ultimo, y decirlo antes es mejor que dejar que
    -- la base lo rechace despues.
    'duenosActivos', (
      select count(*) from membresia m
       where m.negocio_id = p_negocio and m.rol = 'dueno' and m.activo and not m.eliminado)
  );
end;
$$;

comment on function public.equipo_del_centro(text) is
  'Miembros e invitaciones pendientes. Pide gestionarUsuarios: un correo ajeno es dato personal, '
  'y quien no administra el equipo no tiene por que verlo.';

grant execute on function public.equipo_del_centro(text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. LOS ROLES Y SU USO
-- ---------------------------------------------------------------------
create or replace function public.roles_del_centro(p_negocio text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(x order by x->>'etiqueta') from (
      select jsonb_build_object(
               'id', r.id,
               'etiqueta', r.etiqueta,
               'permisos', coalesce(r.permisos, '{}'::jsonb),
               'activo', r.activo,
               -- EL NUMERO DE GENTE QUE LO USA se cuenta, no se guarda. Es lo
               -- que convierte apagar un rol en una decision informada: uno que
               -- usan cuatro personas las deja a las cuatro en el rol de
               -- respaldo, y a ciegas nadie se entera.
               'cuantos', (select count(*) from membresia m
                            where m.negocio_id = r.negocio_id and m.rol = r.id
                              and m.activo and not m.eliminado)) as x
        from rol r
       where r.negocio_id = p_negocio
    ) t), '[]'::jsonb);
end;
$$;

comment on function public.roles_del_centro(text) is
  'Los roles guardados del centro con cuanta gente los usa. Los de fabrica los mezcla el motor '
  'de permisos del navegador: aqui solo vive lo que este centro cambio.';

grant execute on function public.roles_del_centro(text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. GUARDAR UN ROL
-- ---------------------------------------------------------------------
--
-- EL ROL `dueno` NO SE EDITA, y es la proteccion anti-bloqueo entera en una
-- linea. Se guarda con la lista de permisos VACIA porque `app.tiene_permiso`
-- devuelve true en cuanto ve ese rol, sin mirar nada mas. Escribirle permisos
-- —aunque fueran todos en true— haria que el dia que alguien apague uno por
-- error, la dueña se quede sin poder entrar a su propio centro.
create or replace function public.guardar_rol_del_centro(
  p_negocio text,
  p_id text,
  p_etiqueta text,
  p_permisos jsonb,
  p_activo boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quien membresia;
  v_id    text;
  v_antes jsonb;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para cambiar los roles del centro.'
      using errcode = 'insufficient_privilege';
  end if;

  -- El id se normaliza: sin acentos ni espacios, porque el motor de permisos
  -- lo compara como texto opaco y "Recepción" y "recepcion" serian dos roles.
  v_id := lower(regexp_replace(btrim(coalesce(p_id, '')), '[^a-zA-Z0-9_]+', '_', 'g'));
  if v_id = '' then
    raise exception 'El rol necesita un identificador.' using errcode = 'invalid_parameter_value';
  end if;
  if nullif(btrim(coalesce(p_etiqueta, '')), '') is null then
    raise exception 'El rol necesita un nombre visible.' using errcode = 'invalid_parameter_value';
  end if;

  if v_id = 'dueno' then
    raise exception 'El rol de dueño no se edita: es la proteccion que impide que un centro se quede sin nadie que pueda todo.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  select jsonb_build_object('etiqueta', r.etiqueta, 'permisos', r.permisos, 'activo', r.activo)
    into v_antes from rol r where r.negocio_id = p_negocio and r.id = v_id;

  insert into rol (negocio_id, id, etiqueta, permisos, activo)
  values (p_negocio, v_id, btrim(p_etiqueta), coalesce(p_permisos, '{}'::jsonb),
          coalesce(p_activo, true))
  on conflict (negocio_id, id) do update
    set etiqueta = excluded.etiqueta,
        permisos = excluded.permisos,
        activo = excluded.activo;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = p_negocio and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'configuracion', case when v_antes is null then 'crear' else 'editar' end,
          v_id, v_antes,
          jsonb_build_object('etiqueta', btrim(p_etiqueta), 'permisos',
                             coalesce(p_permisos, '{}'::jsonb), 'activo', coalesce(p_activo, true)));

  return jsonb_build_object('id', v_id);
end;
$$;

comment on function public.guardar_rol_del_centro(text, text, text, jsonb, boolean) is
  'Crea o cambia un rol y deja rastro. Se niega a tocar `dueno`: ese rol vive con la lista de '
  'permisos vacia a proposito, y escribirsela es como un centro se queda sin nadie que pueda todo.';

revoke all on function public.guardar_rol_del_centro(text, text, text, jsonb, boolean) from public, anon;
grant execute on function public.guardar_rol_del_centro(text, text, text, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 9. INVITAR A ALGUIEN
-- ---------------------------------------------------------------------
create or replace function public.invitar_al_centro(
  p_negocio text,
  p_correo text,
  p_nombre text,
  p_rol text,
  p_permisos jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quien   membresia;
  v_correo  text;
  v_nombre  text;
  v_id      uuid;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para invitar gente a este centro.'
      using errcode = 'insufficient_privilege';
  end if;

  v_correo := lower(nullif(btrim(coalesce(p_correo, '')), ''));
  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_correo is null or position('@' in v_correo) = 0 then
    raise exception 'Escribe un correo valido.' using errcode = 'invalid_parameter_value';
  end if;
  if v_nombre is null then
    raise exception 'Escribe como se llama la persona.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(btrim(p_rol), '') = '' then
    raise exception 'Escoge que rol va a tener.' using errcode = 'invalid_parameter_value';
  end if;

  -- SOLO UN DUEÑO PUEDE NOMBRAR OTRO DUEÑO. Con `gestionarUsuarios` a secas,
  -- quien administra podria invitar a un comodo suyo como dueño y quedarse con
  -- el centro. Subir a alguien a lo mas alto lo hace quien ya esta ahi.
  if p_rol = 'dueno' and not exists (
    select 1 from membresia m
     where m.negocio_id = p_negocio and m.usuario_id = auth.uid() and m.rol = 'dueno'
       and m.activo and not m.eliminado
  ) then
    raise exception 'Solo quien ya es dueño puede nombrar a otro dueño.'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from membresia m
              where m.negocio_id = p_negocio and lower(m.correo) = v_correo and not m.eliminado) then
    raise exception 'Esa persona ya esta en el centro.' using errcode = 'unique_violation';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  insert into invitacion (negocio_id, correo, nombre, rol, permisos, invitado_por)
  values (p_negocio, v_correo, v_nombre, btrim(p_rol), p_permisos, auth.uid())
  -- Volver a invitar al mismo correo ACTUALIZA la invitacion en vez de
  -- reventar: el caso normal es que el primer aviso se perdio y se quiere
  -- reenviar, quiza con otro rol.
  on conflict (negocio_id, lower(correo)) where estado = 'pendiente'
  do update set nombre = excluded.nombre, rol = excluded.rol,
                permisos = excluded.permisos, creada_en = now()
  returning id into v_id;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = p_negocio and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'configuracion', 'invitar', v_id::text, null,
          jsonb_build_object('correo', v_correo, 'rol', btrim(p_rol)));

  return jsonb_build_object('id', v_id, 'correo', v_correo);
end;
$$;

comment on function public.invitar_al_centro(text, text, text, text, jsonb) is
  'Deja la invitacion pendiente. NO crea la cuenta: eso lo hace el proveedor de identidad. La '
  'persona entra con ese correo y la reclama con reclamar_invitaciones().';

revoke all on function public.invitar_al_centro(text, text, text, text, jsonb) from public, anon;
grant execute on function public.invitar_al_centro(text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 10. CANCELAR UNA INVITACION
-- ---------------------------------------------------------------------
create or replace function public.cancelar_invitacion_del_centro(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv invitacion;
begin
  select * into v_inv from invitacion where id = p_id;
  if v_inv.id is null then
    raise exception 'Esa invitacion no existe.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_inv.negocio_id, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para cancelar invitaciones.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Se marca cancelada, no se borra: quien invito a quien y cuando es
  -- justamente lo que hay que poder mirar despues.
  update invitacion set estado = 'cancelada' where id = p_id;
end;
$$;

revoke all on function public.cancelar_invitacion_del_centro(uuid) from public, anon;
grant execute on function public.cancelar_invitacion_del_centro(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 11. RECLAMAR MIS INVITACIONES
-- ---------------------------------------------------------------------
--
-- LA LLAMA QUIEN ACABA DE ENTRAR Y NO PERTENECE A NINGUN CENTRO. Es el unico
-- camino por el que una membresia nace sin que la escriba alguien de adentro,
-- y por eso lo que decide a quien se le da NO es un parametro: es el correo del
-- TOKEN. Si el correo viniera en un argumento, cualquiera se daria de alta en
-- el centro de cualquiera escribiendo el correo del invitado.
--
-- El correo sale de `request.jwt.claims` a mano y no de `auth.email()` para
-- poder atacarla en un Postgres normal, donde ese ayudante de Supabase no
-- existe. Es el mismo dato y la misma fuente.
create or replace function public.reclamar_invitaciones()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_correo text;
  v_yo     uuid;
  v_cuenta int := 0;
  v_inv    invitacion;
begin
  v_yo := auth.uid();
  if v_yo is null then
    raise exception 'Hay que haber entrado para reclamar una invitacion.'
      using errcode = 'insufficient_privilege';
  end if;

  v_correo := lower(nullif(btrim(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'email', '')), ''));

  if v_correo is null then
    return jsonb_build_object('aceptadas', 0, 'centros', '[]'::jsonb);
  end if;

  for v_inv in
    select * from invitacion
     where estado = 'pendiente' and lower(correo) = v_correo
     order by creada_en
  loop
    -- Si ya estaba dentro, la invitacion se cierra igual: dejarla pendiente
    -- para siempre haria que la lista de invitaciones mintiera.
    if not exists (select 1 from membresia m
                    where m.negocio_id = v_inv.negocio_id and m.usuario_id = v_yo) then
      insert into membresia (negocio_id, usuario_id, correo, nombre, rol, permisos, activo)
      values (v_inv.negocio_id, v_yo, v_correo, v_inv.nombre, v_inv.rol, v_inv.permisos, true);
      v_cuenta := v_cuenta + 1;

      insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                             entidad, antes, despues)
      values (v_inv.negocio_id, v_yo, v_inv.nombre,
              coalesce((select r.etiqueta from rol r
                         where r.negocio_id = v_inv.negocio_id and r.id = v_inv.rol),
                       v_inv.rol, 'desconocido'),
              'configuracion', 'aceptar-invitacion', v_inv.id::text, null,
              jsonb_build_object('correo', v_correo, 'rol', v_inv.rol));
    end if;

    update invitacion
       set estado = 'aceptada', aceptada_en = now(), aceptada_por = v_yo
     where id = v_inv.id;
  end loop;

  return jsonb_build_object(
    'aceptadas', v_cuenta,
    'centros', coalesce((select jsonb_agg(n.nombre) from membresia m
                          join negocio n on n.id = m.negocio_id
                         where m.usuario_id = v_yo and m.activo and not m.eliminado), '[]'::jsonb));
end;
$$;

comment on function public.reclamar_invitaciones() is
  'Convierte en membresia las invitaciones al correo DEL TOKEN. El correo jamas viene por '
  'parametro: si viniera, cualquiera se daria de alta en el centro de cualquiera.';

revoke all on function public.reclamar_invitaciones() from public, anon;
grant execute on function public.reclamar_invitaciones() to authenticated;

-- ---------------------------------------------------------------------
-- 12. CAMBIAR EL ROL DE ALGUIEN
-- ---------------------------------------------------------------------
create or replace function public.cambiar_rol_en_el_centro(
  p_membresia uuid,
  p_rol text,
  p_permisos jsonb default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m     membresia;
  v_quien membresia;
begin
  select * into v_m from membresia where id = p_membresia;
  if v_m.id is null then
    raise exception 'Esa persona no esta en ningun centro.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_m.negocio_id, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para cambiar roles.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_rol), '') = '' then
    raise exception 'Escoge un rol.' using errcode = 'invalid_parameter_value';
  end if;

  -- NADIE SE BAJA A SI MISMO. Es la mitad de la proteccion anti-bloqueo: sin
  -- esto, la unica dueña puede cambiarse a "consulta" con un clic y quedarse
  -- fuera de su propio centro sin forma de volver.
  if v_m.usuario_id = auth.uid() then
    raise exception 'No puedes cambiarte el rol a ti misma: es lo que impide quedarte fuera de tu propio centro.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_rol = 'dueno' and not exists (
    select 1 from membresia m
     where m.negocio_id = v_m.negocio_id and m.usuario_id = auth.uid() and m.rol = 'dueno'
       and m.activo and not m.eliminado
  ) then
    raise exception 'Solo quien ya es dueño puede nombrar a otro dueño.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Y EL CENTRO NO SE QUEDA SIN DUEÑO. Bajar al ultimo dejaria un centro donde
  -- nadie puede repartir permisos: no se rompe nada, simplemente ya no hay
  -- forma de arreglarlo desde adentro.
  if v_m.rol = 'dueno' and p_rol <> 'dueno' and (
    select count(*) from membresia m
     where m.negocio_id = v_m.negocio_id and m.rol = 'dueno' and m.activo and not m.eliminado
  ) <= 1 then
    raise exception 'Este centro se quedaria sin dueño. Nombra a otro dueño antes de bajar a este.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_quien from membresia
   where negocio_id = v_m.negocio_id and usuario_id = auth.uid() limit 1;

  update membresia set rol = btrim(p_rol), permisos = p_permisos where id = p_membresia;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (v_m.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_m.negocio_id and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'configuracion', 'cambiar-rol', p_membresia::text,
          jsonb_build_object('rol', v_m.rol, 'permisos', v_m.permisos),
          jsonb_build_object('rol', btrim(p_rol), 'permisos', p_permisos));
end;
$$;

comment on function public.cambiar_rol_en_el_centro(uuid, text, jsonb) is
  'Cambia el rol de otra persona. Nunca el propio, nunca al ultimo dueño, y solo un dueño puede '
  'nombrar a otro: las tres son la proteccion anti-bloqueo, comprobada aqui y no en la pantalla.';

revoke all on function public.cambiar_rol_en_el_centro(uuid, text, jsonb) from public, anon;
grant execute on function public.cambiar_rol_en_el_centro(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 13. ACTIVAR O DAR DE BAJA
-- ---------------------------------------------------------------------
--
-- DAR DE BAJA ES `eliminado`, NO UN DELETE. Es la regla del §9 del bloque 0
-- llevada a las personas: sus ventas, sus movimientos de caja y su rastro en la
-- bitacora tienen que seguir teniendo un nombre. Un renglon menos convierte
-- media historia del centro en "usuario desconocido".
create or replace function public.cambiar_acceso_en_el_centro(
  p_membresia uuid,
  p_activo boolean,
  p_dar_de_baja boolean default false
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m     membresia;
  v_quien membresia;
  v_baja  boolean := coalesce(p_dar_de_baja, false);
  v_act   boolean := coalesce(p_activo, true);
begin
  select * into v_m from membresia where id = p_membresia;
  if v_m.id is null then
    raise exception 'Esa persona no esta en ningun centro.' using errcode = 'no_data_found';
  end if;
  if not app.tiene_permiso(v_m.negocio_id, 'gestionarUsuarios') then
    raise exception 'No tienes permiso para cambiar el acceso de nadie.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_m.usuario_id = auth.uid() then
    raise exception 'No puedes quitarte a ti misma el acceso: es lo que impide quedarte fuera de tu propio centro.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_m.rol = 'dueno' and (v_baja or not v_act) and (
    select count(*) from membresia m
     where m.negocio_id = v_m.negocio_id and m.rol = 'dueno' and m.activo and not m.eliminado
  ) <= 1 then
    raise exception 'Este centro se quedaria sin dueño activo.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_quien from membresia
   where negocio_id = v_m.negocio_id and usuario_id = auth.uid() limit 1;

  update membresia
     set activo = case when v_baja then false else v_act end,
         eliminado = case when v_baja then true else v_m.eliminado end
   where id = p_membresia;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (v_m.negocio_id, auth.uid(), coalesce(v_quien.nombre, 'desconocido'),
          coalesce((select r.etiqueta from rol r
                     where r.negocio_id = v_m.negocio_id and r.id = v_quien.rol),
                   v_quien.rol, 'desconocido'),
          'configuracion', case when v_baja then 'dar-de-baja' else 'cambiar-acceso' end,
          p_membresia::text,
          jsonb_build_object('activo', v_m.activo, 'eliminado', v_m.eliminado),
          jsonb_build_object('activo', case when v_baja then false else v_act end,
                             'eliminado', case when v_baja then true else v_m.eliminado end));
end;
$$;

comment on function public.cambiar_acceso_en_el_centro(uuid, boolean, boolean) is
  'Activa, desactiva o da de baja. La baja es logica: sus ventas y su rastro en la bitacora '
  'tienen que seguir teniendo un nombre. Nunca sobre uno mismo ni sobre el ultimo dueño.';

revoke all on function public.cambiar_acceso_en_el_centro(uuid, boolean, boolean) from public, anon;
grant execute on function public.cambiar_acceso_en_el_centro(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 14. LA BITACORA — solo se lee
-- ---------------------------------------------------------------------
--
-- ES `security invoker` A PROPOSITO. La politica de `auditoria` ya exige
-- `verAuditoria` para leer, asi que quien no lo tiene recibe una lista vacia
-- SIN QUE ESTA FUNCION HAGA NADA. Es la diferencia que sostiene el modulo: no
-- se le esconde el boton, es que la base no se lo entrega.
create or replace function public.bitacora_del_centro(
  p_negocio text,
  p_modulo text default null,
  p_usuario uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_busqueda text default null,
  p_pagina int default 1,
  p_por_pagina int default 20
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pagina int := greatest(1, coalesce(p_pagina, 1));
  v_cuantas int := least(200, greatest(1, coalesce(p_por_pagina, 20)));
  v_aguja text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_total bigint;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_total
    from auditoria a
   where a.negocio_id = p_negocio
     and (p_modulo is null or a.modulo = p_modulo)
     and (p_usuario is null or a.usuario_id = p_usuario)
     and (p_desde is null or a.ocurrido_en::date >= p_desde)
     and (p_hasta is null or a.ocurrido_en::date <= p_hasta)
     and (v_aguja is null or a.usuario_nombre ilike '%' || v_aguja || '%'
                          or a.accion ilike '%' || v_aguja || '%'
                          or coalesce(a.detalle, '') ilike '%' || v_aguja || '%');

  return jsonb_build_object(
    'total', v_total,
    'pagina', v_pagina,
    'porPagina', v_cuantas,
    'filas', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
                 'id', a.id,
                 'ocurridoEn', a.ocurrido_en,
                 'usuarioId', a.usuario_id,
                 'usuario', a.usuario_nombre,
                 'rol', a.rol_etiqueta,
                 'modulo', a.modulo,
                 'accion', a.accion,
                 'detalle', a.detalle,
                 'entidad', a.entidad,
                 'antes', a.antes,
                 'despues', a.despues,
                 'motivo', a.motivo) as x
          from auditoria a
         where a.negocio_id = p_negocio
           and (p_modulo is null or a.modulo = p_modulo)
           and (p_usuario is null or a.usuario_id = p_usuario)
           and (p_desde is null or a.ocurrido_en::date >= p_desde)
           and (p_hasta is null or a.ocurrido_en::date <= p_hasta)
           and (v_aguja is null or a.usuario_nombre ilike '%' || v_aguja || '%'
                                or a.accion ilike '%' || v_aguja || '%'
                                or coalesce(a.detalle, '') ilike '%' || v_aguja || '%')
         order by a.ocurrido_en desc
         limit v_cuantas offset (v_pagina - 1) * v_cuantas
      ) t), '[]'::jsonb),
    -- LOS MODULOS Y LA GENTE SALEN DE LO QUE HAY, no de una lista escrita. Un
    -- filtro con opciones que no existen en la bitacora deja a quien lo usa
    -- buscando renglones que nunca hubo.
    'modulos', coalesce((
      select jsonb_agg(distinct a.modulo order by a.modulo)
        from auditoria a where a.negocio_id = p_negocio), '[]'::jsonb),
    'gente', coalesce((
      select jsonb_agg(x) from (
        select distinct jsonb_build_object('id', a.usuario_id, 'nombre', a.usuario_nombre) as x
          from auditoria a where a.negocio_id = p_negocio and a.usuario_id is not null
      ) t), '[]'::jsonb));
end;
$$;

comment on function public.bitacora_del_centro is
  'La bitacora, filtrada y paginada en el servidor. security invoker: quien no tiene verAuditoria '
  'recibe una lista vacia porque la base no se la entrega, no porque aqui se le esconda.';

grant execute on function public.bitacora_del_centro(text, text, uuid, date, date, text, int, int)
  to authenticated;

-- ---------------------------------------------------------------------
-- 15. LA ACTIVIDAD RECIENTE — las tres ultimas del costado
-- ---------------------------------------------------------------------
create or replace function public.actividad_reciente_del_centro(p_negocio text, p_cuantas int default 3)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object(
               'id', a.id,
               'ocurridoEn', a.ocurrido_en,
               'usuario', a.usuario_nombre,
               'modulo', a.modulo,
               'accion', a.accion,
               'entidad', a.entidad) as x
        from auditoria a
       where a.negocio_id = p_negocio
       order by a.ocurrido_en desc
       limit least(20, greatest(1, coalesce(p_cuantas, 3)))
    ) t), '[]'::jsonb);
end;
$$;

grant execute on function public.actividad_reciente_del_centro(text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 16. EL PLAN Y LA LICENCIA
-- ---------------------------------------------------------------------
--
-- SE ENSEÑA PARA QUE LOS GUARDADOS NO FALLEN "PORQUE SI". `app.licencia_permite`
-- corta la escritura cuando la licencia vence, y sin una pantalla que lo diga
-- el sintoma es que un dia cualquiera deja de poder guardarse una cita, con un
-- error de permisos que nadie relaciona con una fecha.
create or replace function public.licencia_del_centro(p_negocio text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_l licencia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_l from licencia where negocio_id = p_negocio;

  return jsonb_build_object(
    -- SIN RENGLON DE LICENCIA NO SE INVENTA UNO. `administrada` en false es lo
    -- que le permite a la pantalla decir "este centro no tiene licencia
    -- administrada" en vez de enseñar un plan que nadie contrato.
    'administrada', v_l.negocio_id is not null,
    'plan', v_l.plan,
    'estado', v_l.estado,
    'expiraEn', v_l.expira_en,
    'actualizadaEn', v_l.actualizado_en,
    -- La respuesta a la unica pregunta que de verdad importa: ¿hoy se puede
    -- guardar? Sale de la MISMA funcion que corta de verdad, no de repetir su
    -- logica aqui — dos copias acabarian contestando distinto.
    'permiteGuardar', app.licencia_permite(p_negocio));
end;
$$;

grant execute on function public.licencia_del_centro(text) to authenticated;

-- ---------------------------------------------------------------------
-- 17. EXPORTAR LOS DATOS DEL CENTRO
-- ---------------------------------------------------------------------
--
-- UNA ENTIDAD POR LLAMADA Y CON TOPE. Bajarse el centro entero de un viaje es
-- lo que hace que la pestaña se congele el dia que el centro ya lleva tres años
-- trabajando; y peor, un JSON de sesenta megas que el navegador no puede armar
-- falla sin decir por que. El tope se DEVUELVE junto con las filas para que la
-- pantalla pueda avisar de que se quedo algo fuera, en vez de entregar un
-- archivo incompleto con cara de completo.
--
-- `security invoker`: las reglas de fila deciden que renglones salen. Quien no
-- ve el expediente clinico no lo exporta.
create or replace function public.exportar_del_centro(
  p_negocio text,
  p_que text,
  p_limite int default 5000
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tope  int := least(20000, greatest(1, coalesce(p_limite, 5000)));
  v_filas jsonb;
  v_total bigint;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'exportarDatos') then
    raise exception 'No tienes permiso para exportar los datos del centro.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_que = 'clientes' then
    select count(*) into v_total from cliente where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.nombre), '[]'::jsonb) into v_filas
      from (select * from cliente
             where negocio_id = p_negocio and not eliminado order by nombre limit v_tope) c;
  elsif p_que = 'servicios' then
    select count(*) into v_total from servicio where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(s) order by s.nombre), '[]'::jsonb) into v_filas
      from (select * from servicio
             where negocio_id = p_negocio and not eliminado order by nombre limit v_tope) s;
  elsif p_que = 'cursos' then
    select count(*) into v_total from curso where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.nombre), '[]'::jsonb) into v_filas
      from (select * from curso
             where negocio_id = p_negocio and not eliminado order by nombre limit v_tope) c;
  elsif p_que = 'productos' then
    select count(*) into v_total from producto where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(p) order by p.nombre), '[]'::jsonb) into v_filas
      from (select * from producto
             where negocio_id = p_negocio and not eliminado order by nombre limit v_tope) p;
  elsif p_que = 'citas' then
    select count(*) into v_total from cita where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.fecha desc), '[]'::jsonb) into v_filas
      from (select * from cita
             where negocio_id = p_negocio and not eliminado order by fecha desc limit v_tope) c;
  elsif p_que = 'ventas' then
    select count(*) into v_total from venta where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(v) order by v.fecha desc), '[]'::jsonb) into v_filas
      from (select * from venta
             where negocio_id = p_negocio and not eliminado order by fecha desc limit v_tope) v;
  elsif p_que = 'gastos' then
    select count(*) into v_total from gasto where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(g) order by g.fecha desc), '[]'::jsonb) into v_filas
      from (select * from gasto
             where negocio_id = p_negocio and not eliminado order by fecha desc limit v_tope) g;
  elsif p_que = 'recordatorios' then
    select count(*) into v_total from recordatorio where negocio_id = p_negocio and not eliminado;
    select coalesce(jsonb_agg(to_jsonb(r) order by r.fecha desc), '[]'::jsonb) into v_filas
      from (select * from recordatorio
             where negocio_id = p_negocio and not eliminado order by fecha desc limit v_tope) r;
  else
    raise exception 'No se sabe exportar "%". Las opciones son clientes, servicios, cursos, productos, citas, ventas, gastos y recordatorios.', p_que
      using errcode = 'invalid_parameter_value';
  end if;

  return jsonb_build_object(
    'que', p_que,
    'total', coalesce(v_total, 0),
    'entregadas', jsonb_array_length(v_filas),
    'tope', v_tope,
    'filas', v_filas);
end;
$$;

comment on function public.exportar_del_centro(text, text, int) is
  'Una entidad por llamada, con tope, y devolviendo cuantas hay de verdad: un archivo recortado '
  'sin avisar tiene exactamente la misma cara que uno completo.';

grant execute on function public.exportar_del_centro(text, text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 18. LA ZONA DE PELIGRO — transferir la propiedad
-- ---------------------------------------------------------------------
--
-- ES LA UNICA ACCION IRREVERSIBLE QUE EL CENTRO PUEDE HACERSE A SI MISMO desde
-- adentro, y por eso pide `zonaDePeligro` ADEMAS de ser dueño. Quien la usa
-- deja de poder deshacerla en el mismo acto: despues de transferir, ya no es
-- dueño y no puede transferirsela de vuelta.
create or replace function public.transferir_propiedad_del_centro(
  p_negocio text,
  p_membresia uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m     membresia;
  v_quien membresia;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'zonaDePeligro') then
    raise exception 'No tienes permiso para la zona de peligro.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_quien from membresia
   where negocio_id = p_negocio and usuario_id = auth.uid() limit 1;

  if v_quien.rol <> 'dueno' then
    raise exception 'Solo quien es dueño puede transferir la propiedad del centro.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from membresia where id = p_membresia and negocio_id = p_negocio;
  if v_m.id is null then
    raise exception 'Esa persona no esta en este centro.' using errcode = 'no_data_found';
  end if;
  if not v_m.activo or v_m.eliminado then
    raise exception 'No se le puede dar el centro a alguien sin acceso.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_m.usuario_id = auth.uid() then
    raise exception 'Ya eres la dueña de este centro.' using errcode = 'invalid_parameter_value';
  end if;

  -- SE SUBE PRIMERO Y SE BAJA DESPUES. Al reves, entre las dos sentencias
  -- habria un instante sin ningun dueño; y si la segunda fallara, se quedaria
  -- asi para siempre. Las dos van dentro de la misma funcion, o sea de la
  -- misma transaccion: pasan las dos o no pasa ninguna.
  update membresia set rol = 'dueno', permisos = null where id = p_membresia;
  update membresia set rol = 'admin' where id = v_quien.id;

  insert into auditoria (negocio_id, usuario_id, usuario_nombre, rol_etiqueta, modulo, accion,
                         entidad, antes, despues)
  values (p_negocio, auth.uid(), coalesce(v_quien.nombre, 'desconocido'), 'Dueño',
          'configuracion', 'transferir-propiedad', p_membresia::text,
          jsonb_build_object('dueno', v_quien.correo),
          jsonb_build_object('dueno', v_m.correo));
end;
$$;

comment on function public.transferir_propiedad_del_centro(text, uuid) is
  'Sube al nuevo dueño y baja al anterior en el mismo acto. Nunca hay un instante sin dueño, y '
  'quien la usa no puede deshacerla: por eso pide zonaDePeligro ademas de serlo.';

revoke all on function public.transferir_propiedad_del_centro(text, uuid) from public, anon;
grant execute on function public.transferir_propiedad_del_centro(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 19. EL PERMISO DE TABLA DE LO NUEVO
-- ---------------------------------------------------------------------
--
-- La distincion de siempre, que ya costo un "permission denied" en produccion:
-- las reglas de fila RECORTAN, el `grant` es lo que da el permiso de partida.
-- `invitacion` guarda correos de gente: `anon` no la toca ni de lejos.
--
-- SOLO `select`: se escribe por funcion, y la funcion comprueba
-- `gestionarUsuarios`. Con `insert` suelto, cualquiera con sesion podria
-- invitarse a si mismo al centro de cualquiera.
revoke all on invitacion from anon;
grant select on invitacion to authenticated;

-- Y SE LE QUITA A `authenticated` TODO LO DEMAS, aunque nunca se le diera.
--
-- ESTO SE VIO CONTRA LA BASE DE VERDAD, no leyendo el archivo: al comprobar los
-- permisos despues de aplicarlo, `authenticated` tenia CUATRO sobre `invitacion`
-- en vez de uno. La causa es que Supabase deja puestos unos permisos por
-- omision que conceden todo sobre cada tabla NUEVA, asi que la tabla nacio con
-- insert, update y delete sin que nadie los escribiera.
--
-- Las reglas de fila lo tapaban —no hay politica de escritura, asi que ninguna
-- de las tres podia tocar una fila— pero un permiso de tabla que sobra es un
-- permiso que el dia que alguien agregue una politica se convierte en un
-- agujero. Se quita explicitamente: escribir invitaciones es cosa de las
-- funciones, que comprueban `gestionarUsuarios` antes.
--
-- CORREGIDO EL 16/08/2026: decia `revoke insert, update, delete`, y eran SIETE
-- los permisos que Supabase regala, no cuatro. Se quedaban dentro `truncate`,
-- `references` y `trigger` — y las reglas de fila NO se aplican a `truncate`.
revoke all on invitacion from authenticated;
grant select on invitacion to authenticated;

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

-- ---------------------------------------------------------------------
-- UN GASTO DE DEMOSTRACION, CON SU RASTRO EN CAJA
-- ---------------------------------------------------------------------
--
-- SE INSERTA EN `gasto` Y NO SE TOCA LA CAJA A MANO: el disparador
-- `app.gasto_a_caja` es el unico que escribe el movimiento, y se deja que lo
-- haga. Escribirlo aqui seria una segunda via que el dia que el disparador
-- cambie dejaria la demostracion contando el dinero de otra forma que el
-- sistema de verdad — que es exactamente lo que una demostracion no puede
-- permitirse.
--
-- Lo unico que hace falta despues es ANOTAR los movimientos que nacieron del
-- gasto, para que quitar la demostracion se los lleve tambien.
create or replace function app.demo_gasto(
  p_negocio     text,
  p_descripcion text,
  p_detalle     text,
  p_categoria   text,
  p_monto       bigint,
  p_metodo      text,
  p_fecha       date,
  p_recurrente  uuid,
  p_periodo     text,
  p_quien       uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into gasto (negocio_id, descripcion, detalle, categoria, categoria_id,
                     monto_centavos, metodo, efectivo_centavos, fecha,
                     recurrente_id, periodo, creado_por, creado_en)
  values (p_negocio, p_descripcion, p_detalle, 'general',
          (select c.id from categoria c
            where c.negocio_id = p_negocio and c.ambito = 'gasto' and c.nombre = p_categoria),
          p_monto, p_metodo,
          case when p_metodo = 'efectivo' then p_monto else 0 end,
          p_fecha, p_recurrente, p_periodo, p_quien,
          p_fecha::timestamp + time '18:30')
  returning id into v_id;

  perform app.demo_anotar(p_negocio, 'gasto', v_id);

  insert into dato_de_demostracion (negocio_id, tabla, fila_id)
  select p_negocio, 'movimiento_caja', mc.id
    from movimiento_caja mc
   where mc.negocio_id = p_negocio and mc.origen = 'gasto' and mc.referencia_id = v_id
  on conflict do nothing;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- UNA ANOTACION EN LA BITACORA, CON SU FECHA DE VERDAD
-- ---------------------------------------------------------------------
--
-- La bitacora de un centro con cinco meses de trabajo no puede estar vacia: es
-- de las primeras cosas que se enseñan. Y las anotaciones tienen que llevar la
-- fecha en que ocurrio cada cosa — todas con la de hoy dirian que el centro
-- entero se uso en una tarde.
create or replace function app.demo_bitacora(
  p_negocio text,
  p_modulo  text,
  p_accion  text,
  p_entidad text,
  p_despues jsonb,
  p_cuando  timestamptz,
  p_usuario uuid,
  p_nombre  text,
  p_rol     text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into auditoria (negocio_id, ocurrido_en, usuario_id, usuario_nombre, rol_etiqueta,
                         modulo, accion, entidad, despues)
  values (p_negocio, p_cuando, p_usuario, coalesce(p_nombre, 'desconocido'),
          coalesce(p_rol, 'desconocido'), p_modulo, p_accion, p_entidad, p_despues)
  returning id into v_id;

  perform app.demo_anotar(p_negocio, 'auditoria', v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. CARGAR — un paso por llamada
-- ---------------------------------------------------------------------
--
-- LOS NUEVE PASOS, y el orden no es decorativo: cada uno necesita lo que dejo
-- el anterior.
--
--   1  El catalogo: categorias, servicios, productos, proveedores, cursos,
--      plantillas, canales, las plantillas de gasto recurrente y la ficha del
--      centro. Sin esto no hay de que agendar ni que cobrar.
--   2  Los pacientes, con su expediente clinico y dados de alta a lo largo de
--      los cinco meses — no todos el mismo dia, que es como se nota que un
--      centro lleva tiempo abierto.
--   3-8 Un mes de trabajo por paso, dia por dia: se abre la caja, se atienden
--      las citas, se cobra, se registran los gastos y se hace el corte. El
--      ultimo paso llega hasta hoy y deja la caja de hoy ABIERTA, con citas
--      pendientes por delante.
--   9  Lo que cuelga de todo lo anterior: inscripciones, cotizaciones,
--      recordatorios, conversaciones, reportes guardados y la bitacora.
--
-- POR QUE POR PASOS Y NO DE UN VIAJE: son unas seis mil filas. PostgREST corta
-- las llamadas largas, y una carga cortada a la mitad deja el centro con dos
-- meses de historia, la caja de un dia sin cerrar y ninguna explicacion. Cada
-- paso es su propia transaccion: o entra el mes entero o no entra ninguno.
create or replace function public.cargar_datos_de_demostracion(
  p_negocio text,
  p_paso int default 1,
  p_hoy date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  /* El calendario de la demostracion */
  v_hoy       date := coalesce(p_hoy, current_date);
  v_inicio    date := (date_trunc('month', coalesce(p_hoy, current_date)::timestamp)
                        - interval '5 months')::date;
  v_mes       date;
  v_fin       date;
  v_dia       date;
  v_dow       int;

  /* Quien "trabajo" todo esto */
  v_usuario   uuid := auth.uid();
  v_membresia uuid;
  v_equipo    uuid[];
  v_nombre_yo text;
  v_rol_yo    text;

  /* Los catalogos ya sembrados, para escoger de ellos */
  v_clientes  uuid[];
  v_servicios uuid[];
  v_productos uuid[];
  v_elegibles int;

  /* El dia que se esta simulando */
  v_sesion    uuid;
  v_cuantas   int;
  v_i         int;
  v_hora      time;
  v_id        uuid;
  v_cita      uuid;
  v_estado    text;
  v_cliente   uuid;
  /*
   * EL SERVICIO Y EL PRODUCTO VAN EN VARIABLES SUELTAS Y NO EN UN `record`.
   * Un `record` de plpgsql solo se puede llenar desde una consulta: no se le
   * puede asignar nulo para decir "esta vez no se llevo nada", que es
   * exactamente lo que hace falta aqui.
   */
  v_serv_id     uuid;
  v_serv_nombre text;
  v_serv_min    int;
  v_serv_precio bigint;
  v_prod_id     uuid;
  v_prod_nombre text;
  v_prod_precio bigint;
  v_prod_costo  bigint;
  v_prod_stock  int;
  v_lleva     boolean;
  v_venta     uuid;
  v_folio     text;
  v_folio_n   int;
  v_subtotal  bigint;
  v_descuento bigint;
  v_total     bigint;
  v_metodo    text;
  v_pago      uuid;
  v_cuenta    int;
  v_esperado  bigint;
  v_contado   bigint;
  v_gasto     uuid;
  v_curso     record;
  v_conv      uuid;
  v_cuando    timestamptz;
  v_texto     text;
  v_hechas    int := 0;
  r           record;
begin
  /* --- Los tres candados ------------------------------------------- */
  if not app.es_miembro(p_negocio) then
    raise exception 'Ese centro no es el tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if not app.es_la_cuenta_de_demostracion() then
    raise exception 'Los datos de demostracion solo se cargan desde la cuenta de demostracion.'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.tiene_permiso(p_negocio, 'gestionarConfiguracion') then
    raise exception 'Hace falta el permiso de configuracion para cargar la demostracion.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_paso is null or p_paso < 1 or p_paso > 9 then
    raise exception 'La demostracion se carga en 9 pasos, del 1 al 9.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- EL PASO 1 ES EL QUE COMPRUEBA QUE NO HAY NADA, y no los nueve: los pasos
  -- 2 al 9 encuentran —a proposito— lo que sembro el 1. Comprobarlo en todos
  -- haria imposible terminar la carga que se acaba de empezar.
  if p_paso = 1 and exists (select 1 from dato_de_demostracion where negocio_id = p_negocio) then
    raise exception 'Este centro ya tiene datos de demostracion. Quitalos antes de volver a cargarlos.'
      using errcode = 'unique_violation';
  end if;

  /*
   * UNA CAJA ABIERTA QUE NO ES DE LA DEMOSTRACION LA PARA EN SECO, Y ESTO SE
   * APRENDIO CARO: la primera carga de verdad murio en el paso 3 con
   *
   *   duplicate key value violates unique constraint "sesion_caja_una_abierta"
   *
   * La demostracion abre y cierra la caja de cada dia, uno por uno —es lo que
   * hace que el corte de cada dia cuadre con lo que se cobro ese dia— y la base
   * solo permite UNA caja abierta por centro. Si ya habia una del uso normal,
   * el primer dia sembrado choca contra ella.
   *
   * SE COMPRUEBA ANTES DE ESCRIBIR NADA, y el mensaje dice que hacer. Dejar que
   * reviente en el paso 3 significa dos pasos ya sembrados, un error que habla
   * de un indice y ninguna pista de que la culpa era de una caja abierta hace
   * semanas.
   *
   * NO SE CIERRA SOLA, y eso es a proposito: un corte de caja es un documento
   * firmado —quien lo cierra dice cuanto conto— y esta funcion no tiene ni idea
   * de cuanto dinero hay en ese cajon. Lo unico honesto es pararse y decirlo.
   */
  if (p_paso = 1 or p_paso between 3 and 8)
     and exists (
       select 1 from sesion_caja s
        where s.negocio_id = p_negocio and s.estado = 'abierta'
          and s.id not in (select d.fila_id from dato_de_demostracion d
                            where d.negocio_id = p_negocio and d.tabla = 'sesion_caja'
                              and d.fila_id is not null)) then
    raise exception 'Hay una caja abierta en este centro y la demostracion abre y cierra la de cada dia. Haz su corte en Caja -> Corte de caja y vuelve a intentarlo.'
      using errcode = 'invalid_parameter_value';
  end if;

  select m.id, m.nombre, coalesce(r2.etiqueta, m.rol)
    into v_membresia, v_nombre_yo, v_rol_yo
    from membresia m
    left join rol r2 on r2.negocio_id = m.negocio_id and r2.id = m.rol
   where m.negocio_id = p_negocio and m.usuario_id = v_usuario
   limit 1;

  select array_agg(m.id order by m.creado_en) into v_equipo
    from membresia m
   where m.negocio_id = p_negocio and m.activo and not m.eliminado;

  -- LA MISMA SEMILLA SIEMPRE. La variedad se quiere —no todos los dias
  -- iguales— pero la reproducibilidad tambien: una demostracion que sale
  -- distinta cada vez no se puede ensayar antes de enseñarla.
  perform setseed(0.4242);

  /* =================================================================
     PASO 1 — EL CATALOGO
     ================================================================= */
  if p_paso = 1 then

    /* Las categorias, de los cinco ambitos que las usan */
    with nuevas as (
      insert into categoria (negocio_id, ambito, nombre, descripcion, color, orden, creado_en)
      select p_negocio, x.ambito, x.nombre, x.descripcion, x.color, x.orden,
             (v_inicio - 4)::timestamp + time '10:00'
        from (values
          ('servicio', 'Masajes', 'Trabajo corporal manual', '#7FA37F', 1),
          ('servicio', 'Terapias energeticas', 'Reiki, biomagnetismo y limpieza', '#9C8AC4', 2),
          ('servicio', 'Terapias corporales', 'Ventosas, drenaje y reflexologia', '#5FA8B8', 3),
          ('servicio', 'Bienestar integral', 'Sesiones combinadas y seguimiento', '#D9A05B', 4),
          ('curso', 'Formaciones', 'Programas de varias sesiones', '#7FA37F', 1),
          ('curso', 'Talleres', 'Un dia, tema suelto', '#D9A05B', 2),
          ('producto', 'Aceites esenciales', 'Para masaje y difusor', '#7FA37F', 1),
          ('producto', 'Cristales', 'Cuarzos y minerales', '#9C8AC4', 2),
          ('producto', 'Aromaterapia', 'Inciensos, velas y difusores', '#D9A05B', 3),
          ('producto', 'Herbolaria', 'Tes, unguentos y tinturas', '#5FA8B8', 4),
          ('gasto', 'Renta', 'El local', '#D9A05B', 1),
          ('gasto', 'Servicios', 'Luz, agua e internet', '#5FA8B8', 2),
          ('gasto', 'Insumos', 'Aceites, sabanas y desechables', '#7FA37F', 3),
          ('gasto', 'Nomina', 'Pagos al equipo', '#9C8AC4', 4),
          ('gasto', 'Publicidad', 'Redes y volantes', '#C4788A', 5),
          ('gasto', 'Mantenimiento', 'Arreglos y limpieza a fondo', '#8A8A8A', 6),
          ('recordatorio', 'Seguimiento', 'Volver a llamar a alguien', '#7FA37F', 1),
          ('recordatorio', 'Administrativo', 'Papeles, pagos y tramites', '#5FA8B8', 2),
          ('recordatorio', 'Inventario', 'Lo que hay que reponer', '#D9A05B', 3),
          ('conversacion', 'Cita', 'Agendar, mover o confirmar', '#7FA37F', 1),
          ('conversacion', 'Informacion', 'Precios, horarios y dudas', '#5FA8B8', 2),
          ('conversacion', 'Seguimiento', 'Como siguio despues de la sesion', '#9C8AC4', 3)
        ) as x(ambito, nombre, descripcion, color, orden)
      -- SI EL CENTRO YA TENIA UNA QUE SE LLAMA IGUAL, SE RESPETA LA SUYA.
      -- `categoria_nombre_unico` no deja dos con el mismo nombre en el mismo
      -- ambito, y sin esto la carga entera moria por una categoria repetida.
      -- La que se queda es la del centro, y como no entra al rastro, quitar la
      -- demostracion tampoco se la lleva.
      on conflict do nothing
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'categoria', id from nuevas;

    /* Los servicios que se ofrecen */
    with nuevos as (
      insert into servicio (negocio_id, nombre, descripcion, duracion_min, precio_centavos,
                            categoria_id, color, requiere_preparacion, preparacion, notas,
                            activo, creado_en, actualizado_en)
      select p_negocio, x.nombre, x.descripcion, x.duracion, x.precio,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'servicio' and c.nombre = x.categoria),
             x.color, x.preparar, x.preparacion, x.notas, true,
             (v_inicio - 3)::timestamp + time '11:00', (v_inicio - 3)::timestamp + time '11:00'
        from (values
          ('Masaje relajante', 'Presion suave de cuerpo completo con aceite tibio', 60, 65000,
           'Masajes', '#7FA37F', false, null, 'El mas pedido de la tarde'),
          ('Masaje descontracturante', 'Trabajo profundo en espalda, cuello y hombros', 60, 75000,
           'Masajes', '#7FA37F', false, null, 'Se pregunta por lesiones antes de empezar'),
          ('Masaje con piedras calientes', 'Basalto templado sobre puntos de tension', 90, 95000,
           'Masajes', '#7FA37F', true, 'Calentar las piedras 40 minutos antes', null),
          ('Masaje prenatal', 'Postura lateral, presion suave, a partir del segundo trimestre', 60, 78000,
           'Masajes', '#7FA37F', true, 'Preparar cojines laterales', 'No antes de la semana 13'),
          ('Reiki', 'Imposicion de manos por centros energeticos', 50, 60000,
           'Terapias energeticas', '#9C8AC4', false, null, null),
          ('Biomagnetismo', 'Rastreo y colocacion de imanes por pares', 60, 80000,
           'Terapias energeticas', '#9C8AC4', true, 'Desinfectar los imanes entre sesiones', null),
          ('Limpieza energetica', 'Sahumerio, cuencos y barrido con hierbas', 45, 55000,
           'Terapias energeticas', '#9C8AC4', true, 'Ventilar la sala 15 minutos despues', null),
          ('Reflexologia podal', 'Puntos reflejos en pies', 45, 50000,
           'Terapias corporales', '#5FA8B8', false, null, null),
          ('Terapia de ventosas', 'Ventosas de silicon en espalda', 45, 65000,
           'Terapias corporales', '#5FA8B8', false, null, 'Avisar que deja marcas dos o tres dias'),
          ('Drenaje linfatico', 'Maniobras lentas de drenaje', 75, 90000,
           'Terapias corporales', '#5FA8B8', false, null, null),
          ('Aromaterapia', 'Sesion con mezcla personalizada de aceites', 60, 70000,
           'Bienestar integral', '#D9A05B', false, null, null),
          ('Auriculoterapia', 'Puntos en pabellon auricular con semillas', 40, 45000,
           'Bienestar integral', '#D9A05B', false, null, null)
        ) as x(nombre, descripcion, duracion, precio, categoria, color, preparar, preparacion, notas)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'servicio', id from nuevos;

    /* Los proveedores */
    with nuevos as (
      insert into proveedor (negocio_id, nombre, contacto, telefono, correo, notas, activo, creado_en)
      select p_negocio, x.nombre, x.contacto, x.telefono, x.correo, x.notas, true,
             (v_inicio - 2)::timestamp + time '12:00'
        from (values
          ('Aromas del Valle', 'Ventas mayoreo', '5544120987', 'ventas@aromasdelvalle.mx',
           'Entrega los martes. Pedido minimo 2 000 pesos.'),
          ('Cristales de Tepoztlan', 'Mostrador', '7773310455', 'hola@cristalestepoz.mx',
           'Se paga por transferencia antes del envio.'),
          ('Herbolaria San Juan', 'Pedidos', '5566780123', null,
           'Tienen te a granel; se pide por kilo.'),
          ('Distribuidora Zen', 'Atencion a centros', '5512349876', 'pedidos@zendistribuidora.mx',
           'Facturan a 15 dias.'),
          ('Velas Luna Artesanal', 'Taller', '5591230044', null,
           'Produccion propia, tardan una semana.')
        ) as x(nombre, contacto, telefono, correo, notas)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'proveedor', id from nuevos;

    /* Los productos de mostrador */
    with nuevos as (
      insert into producto (negocio_id, nombre, descripcion, precio_centavos, costo_centavos,
                            stock_actual, stock_minimo, sku, unidad, ubicacion, categoria_id,
                            activo, creado_en, actualizado_en)
      select p_negocio, x.nombre, x.descripcion, x.precio, x.costo, 0, x.minimo, x.sku,
             x.unidad, x.ubicacion,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'producto' and c.nombre = x.categoria),
             true, (v_inicio - 2)::timestamp + time '13:00', (v_inicio - 2)::timestamp + time '13:00'
        from (values
          ('Aceite esencial de lavanda 15 ml', 'Para difusor y masaje', 22000, 11000, 6, 'AE-LAV15',
           'pieza', 'Vitrina 1', 'Aceites esenciales'),
          ('Aceite esencial de romero 15 ml', 'Circulacion y concentracion', 22000, 11500, 5, 'AE-ROM15',
           'pieza', 'Vitrina 1', 'Aceites esenciales'),
          ('Aceite esencial de eucalipto 15 ml', 'Vias respiratorias', 20000, 10000, 5, 'AE-EUC15',
           'pieza', 'Vitrina 1', 'Aceites esenciales'),
          ('Aceite de almendras dulces 250 ml', 'Base para masaje', 18000, 8500, 8, 'AB-ALM250',
           'pieza', 'Bodega', 'Aceites esenciales'),
          ('Cuarzo rosa pulido', 'Pieza mediana', 15000, 6000, 6, 'CR-ROSA',
           'pieza', 'Vitrina 2', 'Cristales'),
          ('Amatista en bruto', 'Punta natural', 24000, 10500, 4, 'CR-AMA',
           'pieza', 'Vitrina 2', 'Cristales'),
          ('Cuarzo blanco punta', 'Pieza chica', 12000, 4800, 6, 'CR-BLA',
           'pieza', 'Vitrina 2', 'Cristales'),
          ('Incienso de copal', 'Caja con 20 varas', 6000, 2500, 10, 'AR-COP',
           'caja', 'Estante A', 'Aromaterapia'),
          ('Incienso de palo santo', 'Bolsa con 6 piezas', 9000, 4000, 8, 'AR-PSA',
           'bolsa', 'Estante A', 'Aromaterapia'),
          ('Vela de soya con lavanda', 'Vaso de 180 g', 17000, 7500, 6, 'AR-VSL',
           'pieza', 'Estante A', 'Aromaterapia'),
          ('Difusor de bambu', 'Ultrasonico, 300 ml', 45000, 24000, 3, 'AR-DIF',
           'pieza', 'Bodega', 'Aromaterapia'),
          ('Sales de bano de eucalipto', 'Bolsa de 500 g', 13000, 5500, 8, 'AR-SAL',
           'bolsa', 'Estante B', 'Aromaterapia'),
          ('Te relajante de tila y manzanilla', 'Bolsa de 100 g', 8500, 3500, 10, 'HB-TER',
           'bolsa', 'Estante B', 'Herbolaria'),
          ('Unguento de arnica', 'Frasco de 60 g', 12000, 5000, 8, 'HB-ARN',
           'pieza', 'Estante B', 'Herbolaria'),
          ('Roll-on de menta y lavanda', 'Para cuello y sienes', 9500, 3800, 10, 'HB-ROL',
           'pieza', 'Vitrina 1', 'Herbolaria'),
          ('Tintura de valeriana 30 ml', 'Gotero', 14000, 6200, 6, 'HB-VAL',
           'pieza', 'Estante B', 'Herbolaria')
        ) as x(nombre, descripcion, precio, costo, minimo, sku, unidad, ubicacion, categoria)
      -- Mismo motivo: `producto_sku_unico` es unico por centro y el de aqui
      -- podria chocar con uno que ya exista.
      on conflict do nothing
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'producto', id from nuevos;

    /* A quien se le compra cada cosa */
    with nuevos as (
      insert into producto_proveedor (negocio_id, producto_id, proveedor_id, costo_centavos,
                                      codigo, preferido, creado_en)
      select p_negocio, p.id, pr.id, p.costo_centavos, upper(left(p.sku, 6)), true,
             (v_inicio - 2)::timestamp + time '13:30'
        from producto p
        join categoria c on c.id = p.categoria_id
        join proveedor pr on pr.negocio_id = p_negocio and pr.nombre = case c.nombre
               when 'Aceites esenciales' then 'Aromas del Valle'
               when 'Cristales' then 'Cristales de Tepoztlan'
               when 'Herbolaria' then 'Herbolaria San Juan'
               else 'Distribuidora Zen' end
       where p.negocio_id = p_negocio
         and p.id in (select fila_id from dato_de_demostracion
                       where negocio_id = p_negocio and tabla = 'producto')
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'producto_proveedor', id from nuevos;

    /* El inventario inicial: lo que habia el dia que arranco la historia */
    for r in
      select p.id, p.costo_centavos, x.inicial
        from (values
          ('Aceite esencial de lavanda 15 ml', 24), ('Aceite esencial de romero 15 ml', 18),
          ('Aceite esencial de eucalipto 15 ml', 18), ('Aceite de almendras dulces 250 ml', 30),
          ('Cuarzo rosa pulido', 20), ('Amatista en bruto', 12),
          ('Cuarzo blanco punta', 18), ('Incienso de copal', 40),
          ('Incienso de palo santo', 25), ('Vela de soya con lavanda', 22),
          ('Difusor de bambu', 8), ('Sales de bano de eucalipto', 24),
          ('Te relajante de tila y manzanilla', 30), ('Unguento de arnica', 20),
          ('Roll-on de menta y lavanda', 28), ('Tintura de valeriana 30 ml', 14)
        ) as x(nombre, inicial)
        join producto p on p.negocio_id = p_negocio and p.nombre = x.nombre
    loop
      perform app.demo_mover_inventario(p_negocio, r.id, 'inicial', r.inicial,
        'Inventario inicial del centro', null, null, r.costo_centavos,
        (v_inicio - 1)::timestamp + time '09:00', v_usuario);
    end loop;

    /* Los cursos: dos terminados, uno corriendo y dos por venir */
    with nuevos as (
      insert into curso (negocio_id, nombre, subtitulo, descripcion, categoria_id, instructor_id,
                         fecha_inicio, fecha_fin, cupo, precio_centavos, modalidad, lugar,
                         estado, activo, notas, creado_en, actualizado_en)
      select p_negocio, x.nombre, x.subtitulo, x.descripcion,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'curso' and c.nombre = x.categoria),
             v_membresia,
             v_hoy + x.empieza, v_hoy + x.termina, x.cupo, x.precio, x.modalidad, x.lugar,
             x.estado, true, x.notas,
             (v_hoy + x.empieza - 30)::timestamp + time '17:00',
             (v_hoy + x.empieza - 30)::timestamp + time '17:00'
        from (values
          ('Formacion en masaje holistico', 'Modulo I: fundamentos',
           'Ocho sesiones de tecnica basica, anatomia aplicada y practica supervisada.',
           'Formaciones', -130, -100, 12, 480000, 'presencial', 'Sala grande', 'terminado', null),
          ('Taller de Reiki nivel I', 'Iniciacion y practica',
           'Un fin de semana: historia, simbolos e imposicion de manos.',
           'Talleres', -95, -94, 10, 180000, 'presencial', 'Sala grande', 'terminado', null),
          ('Aromaterapia aplicada al masaje', 'Mezclas y seguridad',
           'Como elegir y diluir aceites esenciales segun el caso.',
           'Talleres', -60, -60, 14, 150000, 'presencial', 'Sala grande', 'terminado', null),
          ('Taller de Reiki nivel II', 'Simbolos y distancia',
           'Continuacion del nivel I, con practica entre companeros.',
           'Talleres', -6, 8, 10, 220000, 'presencial', 'Sala grande', 'en_curso',
           'Dos personas del nivel I pidieron lugar.'),
          ('Introduccion al biomagnetismo', 'Pares biomagneticos',
           'Rastreo, pares principales y protocolo de higiene.',
           'Formaciones', 24, 52, 12, 520000, 'presencial', 'Sala grande', 'programado', null),
          ('Taller de piedras calientes', 'Tecnica y cuidados',
           'Manejo del calor, secuencia y contraindicaciones.',
           'Talleres', 40, 40, 8, 190000, 'presencial', 'Sala chica', 'programado', null)
        ) as x(nombre, subtitulo, descripcion, categoria, empieza, termina, cupo, precio,
               modalidad, lugar, estado, notas)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'curso', id from nuevos;

    /* Las sesiones de cada curso */
    for v_curso in
      select c.id, c.nombre, c.fecha_inicio, c.fecha_fin, c.estado
        from curso c
       where c.negocio_id = p_negocio
         and c.id in (select fila_id from dato_de_demostracion
                       where negocio_id = p_negocio and tabla = 'curso')
    loop
      -- UNA SESION POR SEMANA, con un tope de cuatro. Un taller de un dia tiene
      -- una sola; una formacion de un mes, cuatro. Repartirlas por semanas y no
      -- por un numero fijo evita el absurdo de cuatro sesiones dentro de un
      -- curso que dura un dia.
      v_cuantas := greatest(1, least(4, (v_curso.fecha_fin - v_curso.fecha_inicio) / 7 + 1));
      for v_i in 1..v_cuantas loop
        v_dia := v_curso.fecha_inicio
                 + ((v_i - 1) * ((v_curso.fecha_fin - v_curso.fecha_inicio) / v_cuantas));
        insert into sesion_curso (negocio_id, curso_id, titulo, fecha, hora_inicio, hora_fin,
                                  instructor_id, lugar, estado, creado_en)
        values (p_negocio, v_curso.id, 'Sesion ' || v_i, v_dia, time '10:00', time '14:00',
                v_membresia, 'Sala grande',
                case when v_dia < v_hoy then 'impartida' else 'programada' end,
                (v_curso.fecha_inicio - 25)::timestamp + time '18:00')
        returning id into v_id;
        perform app.demo_anotar(p_negocio, 'sesion_curso', v_id);
      end loop;

      insert into material_curso (negocio_id, curso_id, titulo, tipo, descripcion,
                                  visible_para_alumnos, creado_en)
      values (p_negocio, v_curso.id, 'Manual del participante', 'nota',
              'Se entrega impreso el primer dia.', true,
              (v_curso.fecha_inicio - 20)::timestamp + time '18:00')
      returning id into v_id;
      perform app.demo_anotar(p_negocio, 'material_curso', v_id);
    end loop;

    /* Los canales de mensajes */
    insert into canal_de_mensajes (negocio_id, tipo, nombre, identificador, estado,
                                   activo, creado_en)
    values (p_negocio, 'manual', 'WhatsApp del centro (captura manual)', '5561230099',
            'conectado', true, (v_inicio - 1)::timestamp + time '10:00')
    returning id into v_conv;
    perform app.demo_anotar(p_negocio, 'canal_de_mensajes', v_conv);

    insert into canal_de_mensajes (negocio_id, tipo, nombre, identificador, estado,
                                   activo, creado_en)
    values (p_negocio, 'whatsapp', 'WhatsApp Business (por conectar)', null,
            'sin_conectar', true, (v_inicio - 1)::timestamp + time '10:05')
    returning id into v_id;
    perform app.demo_anotar(p_negocio, 'canal_de_mensajes', v_id);

    /* Las plantillas de mensaje */
    with nuevas as (
      insert into plantilla_de_mensaje (negocio_id, nombre, categoria, cuerpo, canal_tipo,
                                        activa, creado_en)
      select p_negocio, x.nombre, x.categoria, x.cuerpo, 'manual', true,
             (v_inicio - 1)::timestamp + time '10:30'
        from (values
          ('Recordatorio de cita', 'citas',
           'Hola {{cliente.nombre}}, te recordamos tu cita de {{cita.servicio}} el {{cita.fecha}} a las {{cita.hora}}. Si necesitas moverla, contestanos por aqui.'),
          ('Confirmacion de cita', 'citas',
           'Listo {{cliente.nombre}}, quedo agendada tu cita de {{cita.servicio}} el {{cita.fecha}} a las {{cita.hora}}. Te esperamos 10 minutos antes.'),
          ('Seguimiento despues de la sesion', 'seguimiento',
           'Hola {{cliente.nombre}}, ¿como te sentiste despues de la sesion? Recuerda tomar agua y descansar hoy.'),
          ('Aviso de promocion', 'promociones',
           'Este mes tenemos precio especial en {{servicio.nombre}}. Si quieres apartar lugar, contestanos por aqui.'),
          ('Curso por empezar', 'cursos',
           'Hola {{cliente.nombre}}, el curso {{curso.nombre}} empieza el {{curso.fecha}}. Te apartamos lugar.'),
          ('Cobro pendiente', 'cobros',
           'Hola {{cliente.nombre}}, nos quedo pendiente el pago de tu ultima sesion. Cuando gustes lo vemos.')
        ) as x(nombre, categoria, cuerpo)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'plantilla_de_mensaje', id from nuevas;

    /*
     * DOS AUTOMATIZACIONES DE MENSAJES, LAS DOS APAGADAS.
     *
     * Apagadas no es un descuido: mandarle mensajes a los pacientes de alguien
     * sin que esa persona lo haya pedido es de lo poco que este sistema no
     * puede deshacer, y ademas todavia no hay un servidor que las dispare. Se
     * siembran para que la pantalla de automatizaciones tenga algo que enseñar
     * —vacia no se entiende para que sirve— y se ven tal como estan: a la
     * espera.
     */
    with nuevas as (
      insert into automatizacion_de_mensajes (negocio_id, evento, plantilla_id, canal_id,
                                              activa, creado_en)
      select p_negocio, x.evento,
             (select p.id from plantilla_de_mensaje p
               where p.negocio_id = p_negocio and p.nombre = x.plantilla),
             (select c.id from canal_de_mensajes c
               where c.negocio_id = p_negocio and c.tipo = 'manual' limit 1),
             false, (v_inicio - 1)::timestamp + time '10:40'
        from (values
          ('cita_recordatorio', 'Recordatorio de cita'),
          ('seguimiento', 'Seguimiento despues de la sesion')
        ) as x(evento, plantilla)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'automatizacion_de_mensajes', id from nuevas;

    /* Los gastos que se repiten cada mes */
    with nuevos as (
      insert into gasto_recurrente (negocio_id, descripcion, detalle, categoria_id, proveedor_id,
                                    monto_centavos, metodo, efectivo_centavos, frecuencia,
                                    fecha_inicio, proxima_fecha, estado, notas, creado_por, creado_en)
      select p_negocio, x.descripcion, x.detalle,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'gasto' and c.nombre = x.categoria),
             null, x.monto, x.metodo,
             case when x.metodo = 'efectivo' then x.monto else 0 end,
             x.frecuencia, v_inicio,
             -- LA PROXIMA SIEMPRE EN EL FUTURO. Con una fecha ya pasada, la
             -- primera vez que alguien abra Gastos la generacion crearia gastos
             -- de verdad —no de demostracion— que despues nadie sabria quitar.
             case when x.frecuencia = 'semanal'
                  then v_hoy + (8 - extract(isodow from v_hoy)::int)
                  else (date_trunc('month', v_hoy::timestamp) + interval '1 month')::date end,
             'activo', x.notas, v_usuario, (v_inicio - 1)::timestamp + time '11:00'
        from (values
          ('Renta del local', 'Deposito a la cuenta del arrendador', 'Renta', 1200000,
           'transferencia', 'mensual', 'Se paga los primeros tres dias del mes.'),
          ('Internet y telefono', 'Paquete del centro', 'Servicios', 89900,
           'transferencia', 'mensual', null),
          ('Lavanderia de sabanas', 'Servicio semanal a domicilio', 'Servicios', 65000,
           'efectivo', 'semanal', null)
        ) as x(descripcion, detalle, categoria, monto, metodo, frecuencia, notas)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'gasto_recurrente', id from nuevos;

    /* Los ajustes de recordatorios, si el centro no tenia los suyos */
    insert into recordatorio_ajustes (negocio_id, avisar_en_navegador, anticipacion_min,
                                      hora_por_omision, dias_de_proximos, orden_por_omision,
                                      consejo, actualizado_en, actualizado_por)
    values (p_negocio, false, 30, time '09:00', 7, 'urgencia',
            'Confirma las citas del dia siguiente antes de cerrar.', now(), v_usuario)
    on conflict (negocio_id) do nothing;
    if found then
      insert into dato_de_demostracion (negocio_id, tabla, llave)
      values (p_negocio, 'recordatorio_ajustes', p_negocio);
    end if;

    /* Dos automatizaciones encendidas, para que se vea que se pueden encender */
    with nuevas as (
      insert into recordatorio_automatizacion (negocio_id, evento, activa, plantilla_titulo,
                                               plantilla_detalle, dias_antes, hora, prioridad,
                                               categoria_id, responsable_id, creado_en)
      select p_negocio, x.evento, x.activa, x.titulo, x.detalle, x.dias, time '09:00', x.prioridad,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'recordatorio' and c.nombre = x.categoria),
             v_membresia, (v_inicio + 10)::timestamp + time '09:00'
        from (values
          ('cita_nueva', true, 'Confirmar la cita de {nombre}',
           'Llamar o escribir un dia antes.', 1, 'normal', 'Seguimiento'),
          ('stock_bajo', true, 'Reponer {nombre}',
           'Quedan pocas piezas en vitrina.', 0, 'alta', 'Inventario')
        ) as x(evento, activa, titulo, detalle, dias, prioridad, categoria)
      -- UNA REGLA POR EVENTO Y POR CENTRO, dice la tabla. Si el centro ya
      -- encendio la de "cita nueva", la suya manda y la demostracion no la
      -- pisa: encenderle a alguien una automatizacion que apago es de las
      -- pocas cosas que este sistema no puede deshacer.
      on conflict do nothing
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'recordatorio_automatizacion', id from nuevas;

    /* La ficha del centro, SOLO si estaba vacia */
    --
    -- No se pisa lo que el centro ya haya escrito. Si alguien ya puso su
    -- direccion y su telefono, esos son datos de verdad y valen mas que
    -- cualquier cosa que se pueda inventar aqui.
    if not exists (select 1 from estado e
                    where e.negocio_id = p_negocio and e.data ? 'centro') then
      insert into estado (negocio_id, data)
      values (p_negocio, jsonb_build_object('centro', jsonb_build_object(
        'lema', 'Bienestar & Terapias',
        'descripcion', 'Centro de terapias holisticas: masaje, reiki, biomagnetismo y formacion.',
        'telefono', '5561230099',
        'correo', 'contacto@centroholistico.mx',
        'sitio', 'https://centroholistico.mx',
        'direccion', 'Av. de los Fresnos 148, local 3',
        'ciudad', 'Ciudad de Mexico',
        'estado', 'CDMX',
        'pais', 'Mexico',
        'codigoPostal', '04100',
        'instagram', 'centroholistico.mx',
        'whatsapp', '5561230099',
        'zonaHoraria', 'America/Mexico_City',
        'moneda', 'MXN',
        'decimales', 2,
        'impuestoNombre', 'IVA',
        'impuestoTasa', 0,
        'impuestoIncluido', true,
        'metodosDePago', jsonb_build_array('efectivo', 'tarjeta', 'transferencia'),
        'pieDeComprobante', 'Gracias por tu visita. Toma agua y descansa hoy.',
        'horarios', jsonb_build_array(
          jsonb_build_object('dia', 1, 'cerrado', false, 'abre', '09:00', 'cierra', '19:00'),
          jsonb_build_object('dia', 2, 'cerrado', false, 'abre', '09:00', 'cierra', '19:00'),
          jsonb_build_object('dia', 3, 'cerrado', false, 'abre', '09:00', 'cierra', '19:00'),
          jsonb_build_object('dia', 4, 'cerrado', false, 'abre', '09:00', 'cierra', '19:00'),
          jsonb_build_object('dia', 5, 'cerrado', false, 'abre', '09:00', 'cierra', '19:00'),
          jsonb_build_object('dia', 6, 'cerrado', false, 'abre', '10:00', 'cierra', '15:00'),
          jsonb_build_object('dia', 7, 'cerrado', true, 'abre', '09:00', 'cierra', '19:00')))))
      on conflict (negocio_id) do update
        set data = coalesce(estado.data, '{}'::jsonb) || excluded.data,
            updated_at = now();
      insert into dato_de_demostracion (negocio_id, tabla, llave)
      values (p_negocio, 'estado.centro', 'centro');
    end if;

    v_hechas := (select count(*) from dato_de_demostracion where negocio_id = p_negocio);
  end if;

  /* =================================================================
     PASO 2 — LOS PACIENTES
     ================================================================= */
  if p_paso = 2 then

    /*
     * NO TODOS SE DIERON DE ALTA EL MISMO DIA, y eso es la mitad del realismo:
     * doce ya eran pacientes cuando arranca la historia y los otros treinta y
     * tres van entrando a lo largo de los cinco meses. Asi "pacientes nuevos
     * este mes" enseña un numero que significa algo, y el expediente de alguien
     * de hace cinco meses tiene mas sesiones que el de quien llego el martes.
     */
    with gente(i, nombre, telefono, correo, edad, ocupacion, como, notas) as (values
      (1,  'Adriana Villalobos',  '5541230011', 'adriana.villalobos@correo.mx', 41, 'Contadora',       'Recomendacion', 'Viene cada quince dias desde que abrimos.'),
      (2,  'Roberto Quinones',    '5541230012', 'r.quinones@correo.mx',         53, 'Chofer',          'Paso por la calle', null),
      (3,  'Fernanda Escobar',    '5541230013', 'fer.escobar@correo.mx',        29, 'Disenadora',      'Instagram', 'Prefiere las tardes.'),
      (4,  'Ignacio Salgado',     '5541230014', null,                           60, 'Jubilado',        'Recomendacion', null),
      (5,  'Patricia Zuniga',     '5541230015', 'paty.zuniga@correo.mx',        47, 'Maestra',         'Recomendacion', null),
      (6,  'Hector Arreola',      '5541230016', null,                           38, 'Programador',     'Google', 'Trabaja sentado todo el dia.'),
      (7,  'Mariana Cuevas',      '5541230017', 'mariana.cuevas@correo.mx',     34, 'Enfermera',       'Recomendacion', null),
      (8,  'Gabriel Orozco Rivas','5541230018', null,                           45, 'Comerciante',     'Paso por la calle', null),
      (9,  'Silvia Bermudez',     '5541230019', 'silvia.bermudez@correo.mx',    56, 'Ama de casa',     'Recomendacion', null),
      (10, 'Oscar Villagomez',    '5541230020', null,                           31, 'Entrenador',      'Instagram', null),
      (11, 'Rocio Tapia',         '5541230021', 'rocio.tapia@correo.mx',        44, 'Abogada',         'Recomendacion', null),
      (12, 'Ernesto Valadez',     '5541230022', null,                           49, 'Mecanico',        'Paso por la calle', null),
      (13, 'Alejandra Najera',    '5541230023', 'ale.najera@correo.mx',         27, 'Estudiante',      'Instagram', null),
      (14, 'Ramiro Cifuentes',    '5541230024', null,                           62, 'Jubilado',        'Recomendacion', null),
      (15, 'Noemi Lizarraga',     '5541230025', 'noemi.liz@correo.mx',          39, 'Nutriologa',      'Recomendacion', null),
      (16, 'Sergio Padilla',      '5541230026', null,                           50, 'Vendedor',        'Google', null),
      (17, 'Veronica Ibarra',     '5541230027', 'vero.ibarra@correo.mx',        36, 'Psicologa',       'Recomendacion', 'Manda pacientes suyos.'),
      (18, 'Arturo Cadena',       '5541230028', null,                           43, 'Arquitecto',      'Paso por la calle', null),
      (19, 'Lucia Fajardo',       '5541230029', 'lucia.fajardo@correo.mx',      33, 'Fotografa',       'Instagram', null),
      (20, 'Emilio Renteria',     '5541230030', null,                           55, 'Ingeniero',       'Recomendacion', null),
      (21, 'Claudia Banuelos',    '5541230031', 'claudia.b@correo.mx',          42, 'Administradora',  'Google', null),
      (22, 'Javier Montenegro',   '5541230032', null,                           37, 'Cocinero',        'Paso por la calle', 'Trabaja de pie doce horas.'),
      (23, 'Rosalia Guevara',     '5541230033', 'rosalia.guevara@correo.mx',    58, 'Costurera',       'Recomendacion', null),
      (24, 'Ulises Penaloza',     '5541230034', null,                           30, 'Musico',          'Instagram', null),
      (25, 'Andrea Sotomayor',    '5541230035', 'andrea.soto@correo.mx',        26, 'Pasante',         'Instagram', null),
      (26, 'Fabian Corona',       '5541230036', null,                           48, 'Taxista',         'Paso por la calle', null),
      (27, 'Marisol Aguirre',     '5541230037', 'marisol.aguirre@correo.mx',    35, 'Recepcionista',   'Recomendacion', null),
      (28, 'Ruben Cisneros',      '5541230038', null,                           52, 'Electricista',    'Google', null),
      (29, 'Elena Barajas',       '5541230039', 'elena.barajas@correo.mx',      40, 'Terapeuta',       'Recomendacion', null),
      (30, 'Tomas Verdugo',       '5541230040', null,                           28, 'Repartidor',      'Paso por la calle', null),
      (31, 'Yolanda Espinosa',    '5541230041', 'yolanda.esp@correo.mx',        61, 'Jubilada',        'Recomendacion', null),
      (32, 'Ivan Roldan',         '5541230042', null,                           34, 'Contador',        'Google', null),
      (33, 'Beatriz Camarena',    '5541230043', 'bety.camarena@correo.mx',      46, 'Enfermera',       'Recomendacion', null),
      (34, 'Salvador Trujillo',   '5541230044', null,                           57, 'Carpintero',      'Paso por la calle', null),
      (35, 'Diana Alcantara',     '5541230045', 'diana.alcantara@correo.mx',    32, 'Publicista',      'Instagram', null),
      (36, 'Nicolas Gaytan',      '5541230046', null,                           39, 'Ingeniero',       'Recomendacion', null),
      (37, 'Estefania Robles',    '5541230047', 'estefania.robles@correo.mx',   25, 'Estudiante',      'Instagram', null),
      (38, 'Gerardo Maldonado',   '5541230048', null,                           51, 'Gerente',         'Google', null),
      (39, 'Karina Bustamante',   '5541230049', 'karina.busta@correo.mx',       37, 'Docente',         'Recomendacion', null),
      (40, 'Alfonso Rivas',       '5541230050', null,                           44, 'Comerciante',     'Paso por la calle', null),
      (41, 'Guadalupe Mercado',   '5541230051', 'lupita.mercado@correo.mx',     54, 'Enfermera',       'Recomendacion', null),
      (42, 'Edgar Villasenor',    '5541230052', null,                           29, 'Barista',         'Instagram', null),
      (43, 'Sofia Zamudio',       '5541230053', 'sofia.zamudio@correo.mx',      31, 'Veterinaria',     'Google', null),
      (44, 'Manuel Andrade',      '5541230054', null,                           47, 'Chofer',          'Paso por la calle', null),
      (45, 'Renata Ochoa',        '5541230055', 'renata.ochoa@correo.mx',       33, 'Traductora',      'Recomendacion', 'Llego por la promocion de septiembre.')
    ),
    nuevos as (
      insert into cliente (negocio_id, nombre, telefono, correo, fecha_nacimiento, ocupacion,
                           como_nos_conocio, notas, acepta_promociones, creado_en, actualizado_en)
      select p_negocio, g.nombre, g.telefono, g.correo,
             (v_hoy - (g.edad * 365 + 60))::date, g.ocupacion, g.como, g.notas,
             (g.i % 7) <> 0,
             case when g.i <= 12
                  then (v_inicio - (13 - g.i) * 9)::timestamp + time '10:00'
                  else (v_inicio + ((g.i - 12) * greatest(1, (v_hoy - v_inicio) - 5) / 33))::timestamp
                       + time '10:00'
             end,
             case when g.i <= 12
                  then (v_inicio - (13 - g.i) * 9)::timestamp + time '10:00'
                  else (v_inicio + ((g.i - 12) * greatest(1, (v_hoy - v_inicio) - 5) / 33))::timestamp
                       + time '10:00'
             end
        from gente g
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'cliente', id from nuevos;

    /*
     * EL EXPEDIENTE CLINICO, EN LOS QUE DE VERDAD TIENEN ALGO.
     *
     * No se le inventa un padecimiento a los cuarenta y cinco: en un centro
     * real la mayoria no trae nada que avisar, y una franja de aviso que sale
     * en todas las fichas se deja de leer en una semana. Estos catorce son los
     * que hacen falta para enseñar para que sirve el aviso — incluida una
     * embarazada, una alergia y un anticoagulante, que son los tres casos que
     * cambian lo que la terapeuta puede hacer.
     */
    for r in
      select * from (values
        ('Adriana Villalobos', 'Contracturas cervicales por escritorio', null, null,
         'Presion firme en trapecios; evitar cuello anterior.', 'firme', null,
         'Marco Villalobos', '5541239911'),
        ('Roberto Quinones', 'Hernia lumbar L4-L5 diagnosticada hace dos anos',
         null, 'Naproxeno ocasional',
         'NO trabajar zona lumbar profunda. Nada de descontracturante en espalda baja.',
         'media', null, 'Elsa Quinones', '5541239912'),
        ('Patricia Zuniga', 'Migrana cronica', 'Alergia al aceite de menta', null,
         'Evitar aromas fuertes; luz baja en la sala.', 'suave', 'menta, eucalipto',
         'Jorge Zuniga', '5541239913'),
        ('Silvia Bermudez', 'Hipertension controlada', null, 'Losartan diario',
         'Levantarse despacio al terminar la sesion.', 'suave', null,
         'Ana Bermudez', '5541239914'),
        ('Mariana Cuevas', 'Embarazo de 22 semanas', null, 'Acido folico',
         'Solo masaje prenatal, en decubito lateral. Nada de aceites con salvia ni romero.',
         'suave', 'salvia, romero', 'Luis Cuevas', '5541239915'),
        ('Ignacio Salgado', 'Artrosis de rodilla', null, 'Acenocumarol (anticoagulante)',
         'ANTICOAGULANTE: presion suave, sin ventosas ni maniobras profundas.',
         'suave', null, 'Marta Salgado', '5541239916'),
        ('Hector Arreola', 'Tendinitis en muneca derecha', null, null,
         'Evitar antebrazo derecho hasta que lo revise el traumatologo.', 'media', null,
         'Sonia Arreola', '5541239917'),
        ('Javier Montenegro', 'Varices en piernas', null, null,
         'Nada de presion descendente en piernas; drenaje siempre hacia el corazon.',
         'suave', null, 'Rita Montenegro', '5541239918'),
        ('Rosalia Guevara', 'Fibromialgia', 'Alergia al latex', 'Pregabalina',
         'Sesiones cortas; avisar antes de cada maniobra nueva.', 'suave', null,
         'Hugo Guevara', '5541239919'),
        ('Yolanda Espinosa', 'Osteoporosis', null, 'Calcio y vitamina D',
         'Nada de presion profunda sobre costillas ni columna.', 'suave', null,
         'Rene Espinosa', '5541239920'),
        ('Guadalupe Mercado', 'Diabetes tipo 2', null, 'Metformina',
         'Revisar pies antes de reflexologia; si hay herida, no se toca.', 'media', null,
         'Sara Mercado', '5541239921'),
        ('Beatriz Camarena', 'Cirugia de hombro hace ocho meses', null, null,
         'Rango limitado en hombro izquierdo; no forzar.', 'media', null,
         'Omar Camarena', '5541239922'),
        ('Salvador Trujillo', 'Dolor ciatico recurrente', null, 'Ibuprofeno en crisis',
         'En crisis, solo trabajo suave y calor.', 'media', null,
         'Lidia Trujillo', '5541239923'),
        ('Renata Ochoa', 'Ansiedad', 'Alergia a la lavanda', null,
         'Evitar lavanda en difusor y aceite. Musica baja.', 'suave', 'lavanda',
         'Pablo Ochoa', '5541239924')
      ) as x(nombre, padecimientos, alergias, medicamentos, contraindicaciones,
             presion, aromas, emergencia, telefono_emergencia)
    loop
      update cliente
         set padecimientos = r.padecimientos,
             alergias = r.alergias,
             medicamentos = r.medicamentos,
             contraindicaciones = r.contraindicaciones,
             presion_preferida = r.presion,
             aromas_evitar = r.aromas,
             contacto_emergencia = r.emergencia,
             telefono_emergencia = r.telefono_emergencia,
             embarazo = case when r.nombre = 'Mariana Cuevas' then '22 semanas' end
       where negocio_id = p_negocio and nombre = r.nombre;
    end loop;

    v_hechas := (select count(*) from dato_de_demostracion
                  where negocio_id = p_negocio and tabla = 'cliente');
  end if;

  /* =================================================================
     PASOS 3 AL 8 — UN MES DE TRABAJO POR PASO
     ================================================================= */
  if p_paso between 3 and 8 then

    v_mes := (date_trunc('month', v_hoy::timestamp) - make_interval(months => 8 - p_paso))::date;
    -- El ultimo paso llega hasta hoy y sigue TRES SEMANAS mas alla: una agenda
    -- que se acaba hoy no se parece a la de un centro que trabaja.
    if p_paso = 8 then
      v_fin := v_hoy + 21;
    else
      v_fin := (v_mes + interval '1 month')::date - 1;
    end if;

    select array_agg(c.id order by c.creado_en, c.nombre) into v_clientes
      from cliente c
     where c.negocio_id = p_negocio
       and c.id in (select fila_id from dato_de_demostracion
                     where negocio_id = p_negocio and tabla = 'cliente');
    select array_agg(s.id order by s.nombre) into v_servicios
      from servicio s
     where s.negocio_id = p_negocio
       and s.id in (select fila_id from dato_de_demostracion
                     where negocio_id = p_negocio and tabla = 'servicio');
    select array_agg(p.id order by p.nombre) into v_productos
      from producto p
     where p.negocio_id = p_negocio
       and p.id in (select fila_id from dato_de_demostracion
                     where negocio_id = p_negocio and tabla = 'producto');

    if v_clientes is null or v_servicios is null then
      raise exception 'Faltan los pasos 1 y 2: no hay ni catalogo ni pacientes que agendar.'
        using errcode = 'no_data_found';
    end if;

    -- EL FOLIO SIGUE DONDE LO DEJO EL MES ANTERIOR. Es la misma cuenta que
    -- hace `siguiente_folio`: el mayor que exista o haya existido, mas uno.
    select coalesce(max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int), 0)
      into v_folio_n from venta where negocio_id = p_negocio;

    v_dia := v_mes;
    while v_dia <= v_fin loop
      v_dow := extract(isodow from v_dia)::int;

      -- DOMINGO CERRADO, y sabado corto. Es el horario que deja escrito el
      -- paso 1: una agenda con citas en domingo contradice la configuracion
      -- del propio centro en la primera pantalla que alguien abra.
      if v_dow <> 7 then

        /* --- Se abre la caja del dia ------------------------------- */
        if v_dia <= v_hoy then
          insert into sesion_caja (negocio_id, nombre, estado, saldo_inicial_centavos,
                                   abierta_por, abierta_en, observaciones, creado_en)
          values (p_negocio, 'Caja del ' || to_char(v_dia, 'DD/MM/YYYY'), 'abierta', 150000,
                  v_membresia, v_dia::timestamp + time '08:45',
                  'Fondo fijo de mil quinientos pesos.', v_dia::timestamp + time '08:45')
          returning id into v_sesion;
          perform app.demo_anotar(p_negocio, 'sesion_caja', v_sesion);
        else
          v_sesion := null;
        end if;

        /* --- Las citas del dia ------------------------------------- */
        v_cuantas := case when v_dow = 6 then 3 else 4 + (random() * 2)::int end;
        -- Cuanta gente existia YA ese dia. Agendar en marzo a alguien que se
        -- dio de alta en julio es el detalle que delata unos datos inventados.
        v_elegibles := least(array_length(v_clientes, 1),
                             greatest(8, 12 + ((v_dia - v_inicio) * 33)
                                              / greatest(1, v_hoy - v_inicio)));

        for v_i in 1..v_cuantas loop
          v_hora := time '09:00' + make_interval(mins => (v_i - 1) * 90);

          /*
           * EL SORTEO SE HACE FUERA DE LA CONSULTA, Y ESTO COSTO UNA CARGA
           * ENTERA. La primera version decia:
           *
           *   select ... into ... from servicio s
           *    where s.id = v_servicios[1 + floor(random() * ...)::int];
           *
           * y reventaba con "null value in column servicio_id of relation
           * cita violates not-null constraint" en un dia cualquiera del tercer
           * paso. La causa no se ve leyendolo: `random()` es VOLATIL, asi que
           * el motor la evalua UNA VEZ POR CADA FILA que examina. Con doce
           * servicios, cada fila se comparaba contra un sorteo distinto y las
           * doce podian fallar a la vez — una de cada tres veces no encontraba
           * ninguna, la consulta no devolvia nada, y `select into` deja las
           * variables en nulo sin quejarse. El error salia tres lineas mas
           * abajo, en el insert, hablando de otra cosa.
           *
           * Sorteado antes en una variable, el sorteo ocurre una vez y la
           * consulta busca un id fijo. Es la misma trampa que un `where
           * fecha > now()` dentro de un bucle: la funcion volatil no se queda
           * quieta solo porque uno la lea como si fuera un valor.
           */
          v_serv_id := v_servicios[1 + floor(random() * array_length(v_servicios, 1))::int];
          select s.nombre, s.duracion_min, s.precio_centavos
            into v_serv_nombre, v_serv_min, v_serv_precio
            from servicio s
           where s.id = v_serv_id;

          v_cliente := v_clientes[1 + floor(random() * v_elegibles)::int];

          if v_dia < v_hoy then
            v_estado := case when random() < 0.87 then 'completada'
                             when random() < 0.6 then 'cancelada'
                             else 'no_asistio' end;
          elsif v_dia = v_hoy then
            v_estado := case when v_hora < localtime then 'completada' else 'confirmada' end;
          else
            v_estado := case when random() < 0.7 then 'confirmada' else 'pendiente' end;
          end if;

          v_texto := case
            when v_estado = 'completada' then (array[
              'Mucha tension en trapecios. Se trabajo con calor previo y quedo mejor.',
              'Sesion completa sin novedad. Se recomendo tomar agua y no cargar peso hoy.',
              'Refiere dolor de cuello desde el lunes. Se libero con maniobras suaves.',
              'Segunda sesion de la serie. Va notando menos rigidez al despertar.',
              'Se trabajo espalda baja con presion media. Queda pendiente revisar cadera.',
              'Llego con dolor de cabeza; se trabajo craneal y salio sin molestia.'])
              [1 + floor(random() * 6)::int]
            when v_estado = 'cancelada' then 'Cancelo el mismo dia por trabajo.'
            when v_estado = 'no_asistio' then 'No llego y no aviso.'
            else null end;

          /*
           * SI ESA HORA YA ESTABA OCUPADA, LA DEMOSTRACION NO LA PISA.
           *
           * ESTO REVENTO EL PASO 8 EN UN CENTRO DE VERDAD:
           *
           *   conflicting key value violates exclusion constraint "cita_sin_choque"
           *
           * La demostracion siembra a las 09:00, 10:30, 12:00… y esas horas
           * entre ellas no chocan nunca. Con quien choca es con las citas que ya
           * habia en la agenda: cualquiera que haya estado probando el sistema
           * tiene una a las nueve de un martes, y la restriccion de exclusion
           * —que es la que impide dos pacientes en la misma sala a la misma
           * hora— la rechaza, con razon.
           *
           * NO SE TOCA ESA RESTRICCION NI SE BORRA LA CITA DE NADIE: se salta el
           * hueco. Una demostracion con cuatro citas menos ese dia se ve igual
           * de bien; una que empuja la cita de verdad de alguien, no.
           *
           * El `exception` va DENTRO del bucle a proposito: en plpgsql un bloque
           * con manejador es un punto de retorno, asi que solo se deshace ESA
           * cita y el mes entero sigue. Con el manejador afuera se perderia el
           * mes completo por un choque de las nueve de la mañana.
           */
          v_cita := null;
          begin
            insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha,
                              hora_inicio, hora_fin, estado, notas, creado_en, actualizado_en)
            values (p_negocio, v_cliente, v_serv_id, v_membresia, v_dia, v_hora,
                    v_hora + make_interval(mins => v_serv_min), v_estado, v_texto,
                    (v_dia - 4)::timestamp + time '12:00',
                    v_dia::timestamp + time '20:00')
            returning id into v_cita;
            perform app.demo_anotar(p_negocio, 'cita', v_cita);
          exception when exclusion_violation then
            -- Ese horario ya era de alguien. Se deja como estaba.
            v_cita := null;
          end;

          /* --- Lo que se atendio, se cobro -------------------------- */
          -- SIN CITA NO HAY VENTA: si el hueco estaba ocupado, no se atendio a
          -- nadie, y cobrar una sesion que no ocurrio descuadraria el dia.
          if v_cita is not null and v_estado = 'completada' and v_sesion is not null then
            -- ¿Se llevo algo de mostrador? Uno de cada cuatro, y solo si
            -- queda existencia: vender lo que no hay dejaria el inventario en
            -- negativo, que es justo lo que la base impide en el sistema de
            -- verdad.
            v_lleva := random() < 0.26;
            v_prod_id := null;
            if v_lleva then
              -- El sorteo, FUERA de la consulta. Ver el comentario largo de
              -- arriba: `random()` dentro del `where` se evalua una vez por
              -- fila y la consulta se queda sin devolver nada.
              v_prod_id := v_productos[1 + floor(random() * array_length(v_productos, 1))::int];
              select p.nombre, p.precio_centavos, p.costo_centavos, p.stock_actual
                into v_prod_nombre, v_prod_precio, v_prod_costo, v_prod_stock
                from producto p
               where p.id = v_prod_id;
              if coalesce(v_prod_stock, 0) < 1 then
                v_prod_id := null;
              end if;
            end if;

            v_subtotal := v_serv_precio + coalesce(case when v_prod_id is not null
                                                        then v_prod_precio end, 0);
            v_descuento := case when random() < 0.12 then (v_subtotal / 10 / 100)::bigint * 100
                                else 0 end;
            v_total := v_subtotal - v_descuento;

            v_folio_n := v_folio_n + 1;
            v_folio := 'V-' || lpad(v_folio_n::text, 5, '0');

            insert into venta (negocio_id, folio, cliente_id, vendedor_id, fecha, estado,
                               subtotal_centavos, descuento_centavos, impuesto_centavos,
                               total_centavos, creada_por, creado_en, cobrada_en)
            values (p_negocio, v_folio, v_cliente, v_membresia, v_dia, 'cobrada',
                    v_subtotal, v_descuento, 0, v_total, v_usuario,
                    v_dia::timestamp + v_hora + make_interval(mins => v_serv_min),
                    v_dia::timestamp + v_hora + make_interval(mins => v_serv_min))
            returning id into v_venta;
            perform app.demo_anotar(p_negocio, 'venta', v_venta);

            insert into venta_item (negocio_id, venta_id, tipo, servicio_id, descripcion,
                                    cantidad, precio_unitario_centavos, descuento_centavos,
                                    subtotal_centavos)
            values (p_negocio, v_venta, 'servicio', v_serv_id, v_serv_nombre, 1,
                    v_serv_precio, 0, v_serv_precio)
            returning id into v_id;
            perform app.demo_anotar(p_negocio, 'venta_item', v_id);

            if v_prod_id is not null then
              insert into venta_item (negocio_id, venta_id, tipo, producto_id, descripcion,
                                      cantidad, precio_unitario_centavos,
                                      costo_unitario_centavos, descuento_centavos,
                                      subtotal_centavos)
              values (p_negocio, v_venta, 'producto', v_prod_id, v_prod_nombre, 1,
                      v_prod_precio, v_prod_costo, 0, v_prod_precio)
              returning id into v_id;
              perform app.demo_anotar(p_negocio, 'venta_item', v_id);

              perform app.demo_mover_inventario(p_negocio, v_prod_id, 'venta', -1,
                'Venta ' || v_folio, 'venta', v_venta, null,
                v_dia::timestamp + v_hora, v_usuario);
            end if;

            -- Con que se pago. El efectivo manda porque es un mostrador de
            -- barrio: es lo que hace que el corte de caja tenga algo que cuadrar.
            v_metodo := case when random() < 0.56 then 'efectivo'
                             when random() < 0.7 then 'tarjeta'
                             else 'transferencia' end;

            insert into pago (negocio_id, venta_id, metodo, monto_centavos, fecha, creado_en)
            values (p_negocio, v_venta, v_metodo, v_total, v_dia,
                    v_dia::timestamp + v_hora + make_interval(mins => v_serv_min))
            returning id into v_pago;
            perform app.demo_anotar(p_negocio, 'pago', v_pago);

            insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                         descripcion, fecha, metodo, sesion_id, creado_por, creado_en)
            values (p_negocio, 'ingreso', 'pago', v_pago, v_total, 'Venta ' || v_folio,
                    v_dia, v_metodo, v_sesion, v_usuario,
                    v_dia::timestamp + v_hora + make_interval(mins => v_serv_min))
            returning id into v_id;
            perform app.demo_anotar(p_negocio, 'movimiento_caja', v_id);

            -- Una de cada cinco queda anotada en la bitacora. Anotarlas todas
            -- serian seiscientos renglones iguales; ninguna dejaria la
            -- bitacora vacia en un centro que lleva cinco meses cobrando.
            if random() < 0.2 then
              perform app.demo_bitacora(p_negocio, 'ventas', 'cobrar', v_venta::text,
                jsonb_build_object('folio', v_folio, 'total', v_total),
                v_dia::timestamp + v_hora + make_interval(mins => v_serv_min),
                v_usuario, v_nombre_yo, v_rol_yo);
            end if;
          end if;
        end loop;

        /* --- Los gastos del dia ------------------------------------ */
        if v_dia <= v_hoy then
          -- La renta, el dia 2 de cada mes, por transferencia y ligada a su
          -- plantilla: es el par (recurrente, periodo) lo que impide que
          -- generarla otra vez cree una segunda.
          if extract(day from v_dia)::int = 2 then
            select id into v_id from gasto_recurrente
             where negocio_id = p_negocio and descripcion = 'Renta del local';
            v_gasto := app.demo_gasto(p_negocio, 'Renta del local',
              'Deposito a la cuenta del arrendador', 'Renta', 1200000, 'transferencia',
              v_dia, v_id, app.periodo_del_recurrente('mensual', v_dia), v_usuario);
            perform app.demo_bitacora(p_negocio, 'gastos', 'generar', v_gasto::text,
              jsonb_build_object('concepto', 'Renta del local', 'monto', 1200000),
              v_dia::timestamp + time '18:30', v_usuario, v_nombre_yo, v_rol_yo);
          end if;

          if extract(day from v_dia)::int = 5 then
            select id into v_id from gasto_recurrente
             where negocio_id = p_negocio and descripcion = 'Internet y telefono';
            v_gasto := app.demo_gasto(p_negocio, 'Internet y telefono', 'Paquete del centro',
              'Servicios', 89900, 'transferencia', v_dia, v_id,
              app.periodo_del_recurrente('mensual', v_dia), v_usuario);
          end if;

          if v_dow = 1 then
            select id into v_id from gasto_recurrente
             where negocio_id = p_negocio and descripcion = 'Lavanderia de sabanas';
            v_gasto := app.demo_gasto(p_negocio, 'Lavanderia de sabanas',
              'Servicio semanal a domicilio', 'Servicios', 65000, 'efectivo', v_dia, v_id,
              app.periodo_del_recurrente('semanal', v_dia), v_usuario);
          end if;

          if extract(day from v_dia)::int in (15, 28) then
            v_gasto := app.demo_gasto(p_negocio, 'Pago quincenal al equipo',
              'Terapeutas y recepcion', 'Nomina', 1450000, 'transferencia',
              v_dia, null, null, v_usuario);
            perform app.demo_bitacora(p_negocio, 'gastos', 'crear', v_gasto::text,
              jsonb_build_object('concepto', 'Pago quincenal al equipo', 'monto', 1450000),
              v_dia::timestamp + time '18:30', v_usuario, v_nombre_yo, v_rol_yo);
          end if;

          if extract(day from v_dia)::int = 8 and extract(month from v_dia)::int % 2 = 0 then
            v_gasto := app.demo_gasto(p_negocio, 'Luz del bimestre', null, 'Servicios',
              182000 + (random() * 40000)::bigint / 100 * 100, 'transferencia',
              v_dia, null, null, v_usuario);
          end if;

          if extract(day from v_dia)::int in (4, 14, 24) then
            v_gasto := app.demo_gasto(p_negocio,
              (array['Aceite de almendras a granel', 'Sabanas desechables y toallas',
                     'Gel antibacterial y guantes', 'Carbon e inciensos para la sala'])
                [1 + floor(random() * 4)::int],
              null, 'Insumos', 45000 + (random() * 90000)::bigint / 100 * 100, 'efectivo',
              v_dia, null, null, v_usuario);
          end if;

          if extract(day from v_dia)::int = 18 then
            v_gasto := app.demo_gasto(p_negocio, 'Publicidad en redes',
              'Campana del mes', 'Publicidad', 60000, 'tarjeta', v_dia, null, null, v_usuario);
          end if;

          if extract(day from v_dia)::int = 21 and extract(month from v_dia)::int % 3 = 0 then
            v_gasto := app.demo_gasto(p_negocio, 'Limpieza profunda del local', null,
              'Mantenimiento', 90000, 'efectivo', v_dia, null, null, v_usuario);
          end if;
        end if;

        /* --- Y se hace el corte ------------------------------------ */
        --
        -- LA CAJA DE HOY SE QUEDA ABIERTA, a proposito: es el estado en el que
        -- de verdad esta un centro a media tarde, y es lo que deja enseñar el
        -- corte de caja sin haberlo hecho todavia.
        if v_sesion is not null and v_dia < v_hoy then
          v_esperado := app.efectivo_de_la_caja(v_sesion);
          -- Un dia de cada seis no cuadra por unos pesos. Un historial donde
          -- todos los cortes salen exactos no se parece a ningun mostrador.
          v_contado := greatest(0, v_esperado + case when random() < 0.17
                                                     then ((random() * 60)::int - 30) * 100
                                                     else 0 end);
          update sesion_caja
             set estado = 'cerrada',
                 cerrada_por = v_membresia,
                 cerrada_en = v_dia::timestamp + time '19:40',
                 esperado_centavos = v_esperado,
                 contado_centavos = v_contado,
                 diferencia_centavos = v_contado - v_esperado,
                 notas_cierre = case when v_contado <> v_esperado
                                     then 'Diferencia por cambio; se anota y se sigue.' end
           where id = v_sesion;

          perform app.demo_bitacora(p_negocio, 'caja', 'cerrar', v_sesion::text,
            jsonb_build_object('esperado', v_esperado, 'contado', v_contado,
                               'diferencia', v_contado - v_esperado),
            v_dia::timestamp + time '19:40', v_usuario, v_nombre_yo, v_rol_yo);
        end if;
      end if;

      v_dia := v_dia + 1;
    end loop;

    v_hechas := (select count(*) from cita
                  where negocio_id = p_negocio and fecha between v_mes and v_fin);
  end if;

  /* =================================================================
     PASO 9 — LO QUE CUELGA DE TODO LO ANTERIOR
     ================================================================= */
  if p_paso = 9 then

    select array_agg(c.id order by c.creado_en, c.nombre) into v_clientes
      from cliente c
     where c.negocio_id = p_negocio
       and c.id in (select fila_id from dato_de_demostracion
                     where negocio_id = p_negocio and tabla = 'cliente');
    select array_agg(p.id order by p.nombre) into v_productos
      from producto p
     where p.negocio_id = p_negocio
       and p.id in (select fila_id from dato_de_demostracion
                     where negocio_id = p_negocio and tabla = 'producto');

    if v_clientes is null then
      raise exception 'Falta el paso 2: no hay pacientes a quien inscribir ni a quien escribirle.'
        using errcode = 'no_data_found';
    end if;

    select coalesce(max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int), 0)
      into v_folio_n from venta where negocio_id = p_negocio;

    /* --- Los alumnos de cada curso ----------------------------------- */
    v_cuenta := 0;
    for v_curso in
      select c.id, c.nombre, c.estado, c.precio_centavos, c.fecha_inicio
        from curso c
       where c.negocio_id = p_negocio
         and c.id in (select fila_id from dato_de_demostracion
                       where negocio_id = p_negocio and tabla = 'curso')
       order by c.fecha_inicio
    loop
      v_cuenta := v_cuenta + 1;
      v_cuantas := case v_curso.estado when 'terminado' then 8
                                       when 'en_curso' then 6
                                       else 3 end;

      for v_i in 1..v_cuantas loop
        -- El paso de siete es primo con cuarenta y cinco, asi que ningun
        -- alumno se repite dentro del mismo curso. Repetirlo chocaria contra
        -- `inscripcion_viva_unica`, que es justo lo que esa regla impide.
        v_cliente := v_clientes[1 + ((v_i * 7 + v_cuenta * 3)
                                     % array_length(v_clientes, 1))];

        v_estado := case
          when v_curso.estado = 'terminado' and v_i = v_cuantas then 'cancelado'
          when v_curso.estado = 'terminado' then 'asistio'
          when v_curso.estado = 'programado' and v_i = v_cuantas then 'lista_espera'
          else 'inscrito' end;

        v_venta := null;

        -- LOS DEL CURSO QUE ESTA CORRIENDO YA PAGARON, y su pago es una venta
        -- de verdad: renglon de tipo curso, su folio y su movimiento de caja.
        -- Inventar un "pagado: si" en la inscripcion seria un segundo sitio
        -- donde vive el dinero.
        if v_curso.estado = 'en_curso' and v_i <= 4 then
          v_folio_n := v_folio_n + 1;
          v_folio := 'V-' || lpad(v_folio_n::text, 5, '0');
          v_cuando := (v_curso.fecha_inicio - 5)::timestamp + time '17:30';

          insert into venta (negocio_id, folio, cliente_id, vendedor_id, fecha, estado,
                             subtotal_centavos, descuento_centavos, impuesto_centavos,
                             total_centavos, notas, creada_por, creado_en, cobrada_en)
          values (p_negocio, v_folio, v_cliente, v_membresia, (v_curso.fecha_inicio - 5),
                  'cobrada', v_curso.precio_centavos, 0, 0, v_curso.precio_centavos,
                  'Inscripcion al curso.', v_usuario, v_cuando, v_cuando)
          returning id into v_venta;
          perform app.demo_anotar(p_negocio, 'venta', v_venta);

          insert into venta_item (negocio_id, venta_id, tipo, curso_id, descripcion, cantidad,
                                  precio_unitario_centavos, descuento_centavos, subtotal_centavos)
          values (p_negocio, v_venta, 'curso', v_curso.id, v_curso.nombre, 1,
                  v_curso.precio_centavos, 0, v_curso.precio_centavos)
          returning id into v_id;
          perform app.demo_anotar(p_negocio, 'venta_item', v_id);

          insert into pago (negocio_id, venta_id, metodo, monto_centavos, fecha, creado_en)
          values (p_negocio, v_venta, 'transferencia', v_curso.precio_centavos,
                  (v_curso.fecha_inicio - 5), v_cuando)
          returning id into v_pago;
          perform app.demo_anotar(p_negocio, 'pago', v_pago);

          -- SIN `sesion_id`, y no es un olvido: una transferencia no pasa por
          -- el cajon. El ingreso del negocio existe; el corte de ese dia no lo
          -- cuenta porque ese dinero nunca estuvo ahi.
          insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos,
                                       descripcion, fecha, metodo, sesion_id, creado_por, creado_en)
          values (p_negocio, 'ingreso', 'pago', v_pago, v_curso.precio_centavos,
                  'Venta ' || v_folio, (v_curso.fecha_inicio - 5), 'transferencia', null,
                  v_usuario, v_cuando)
          returning id into v_id;
          perform app.demo_anotar(p_negocio, 'movimiento_caja', v_id);
        end if;

        insert into inscripcion (negocio_id, curso_id, cliente_id, venta_id, estado, origen,
                                 notas, creado_en)
        values (p_negocio, v_curso.id, v_cliente, v_venta, v_estado,
                case when v_venta is not null then 'venta' else 'manual' end,
                case when v_estado = 'lista_espera' then 'Avisar si alguien cancela.'
                     when v_estado = 'cancelado' then 'Cancelo una semana antes.' end,
                (v_curso.fecha_inicio - 12)::timestamp + time '16:00')
        returning id into v_id;
        perform app.demo_anotar(p_negocio, 'inscripcion', v_id);
      end loop;
    end loop;

    /* --- Las cotizaciones que se pidieron ---------------------------- */
    v_cuenta := 0;
    for r in
      select * from (values
        ('Paquete de cuatro masajes descontracturantes', 'Masaje descontracturante', 4, -70, 'convertida'),
        ('Sesion de piedras calientes para dos personas', 'Masaje con piedras calientes', 2, -52, 'aceptada'),
        ('Paquete de seis sesiones de reiki', 'Reiki', 6, -40, 'vencida'),
        ('Drenaje linfatico, serie de cinco', 'Drenaje linfatico', 5, -18, 'abierta'),
        ('Masaje relajante para equipo de oficina', 'Masaje relajante', 8, -9, 'abierta'),
        ('Limpieza energetica para inauguracion', 'Limpieza energetica', 3, -3, 'abierta')
      ) as x(concepto, servicio, cantidad, dias, estado)
    loop
      v_cuenta := v_cuenta + 1;
      select s.id, s.nombre, s.precio_centavos into v_serv_id, v_serv_nombre, v_serv_precio
        from servicio s where s.negocio_id = p_negocio and s.nombre = r.servicio;
      v_subtotal := v_serv_precio * r.cantidad;
      v_descuento := (v_subtotal / 20 / 100)::bigint * 100;

      insert into cotizacion (negocio_id, folio, cliente_id, vendedor_id, fecha, vence,
                              subtotal_centavos, descuento_centavos, impuesto_centavos,
                              total_centavos, estado, notas, creado_en)
      values (p_negocio, 'C-' || lpad(v_cuenta::text, 5, '0'),
              v_clientes[1 + ((v_cuenta * 5) % array_length(v_clientes, 1))],
              v_membresia, v_hoy + r.dias, v_hoy + r.dias + 15,
              v_subtotal, v_descuento, 0, v_subtotal - v_descuento, r.estado,
              r.concepto, (v_hoy + r.dias)::timestamp + time '13:00')
      returning id into v_id;
      perform app.demo_anotar(p_negocio, 'cotizacion', v_id);

      insert into cotizacion_item (negocio_id, cotizacion_id, tipo, servicio_id, descripcion,
                                   cantidad, precio_unitario_centavos, descuento_centavos,
                                   subtotal_centavos)
      values (p_negocio, v_id, 'servicio', v_serv_id, v_serv_nombre, r.cantidad,
              v_serv_precio, v_descuento, v_subtotal - v_descuento)
      returning id into v_cita;
      perform app.demo_anotar(p_negocio, 'cotizacion_item', v_cita);
    end loop;

    -- EL CONTADOR DE FOLIOS SE PONE AL DIA. Sin esto, la siguiente cotizacion
    -- que se haga desde la pantalla saldria con el folio C-00001 y chocaria
    -- contra el unico de la tabla — un error de restriccion en la cara de
    -- quien esta enseñando el sistema.
    insert into contador_de_folio (negocio_id, ambito, ultimo)
    values (p_negocio, 'cotizacion', v_cuenta)
    on conflict (negocio_id, ambito)
      do update set ultimo = greatest(contador_de_folio.ultimo, excluded.ultimo);

    /* --- Los recordatorios ------------------------------------------- */
    for r in
      select * from (values
        ('Llamar a la paciente de la cita cancelada', 'Reagendar la sesion de la semana pasada.',
         -3, 'alta', 'pendiente', 'Seguimiento'),
        ('Pedir aceite de almendras', 'Quedan menos de tres litros en bodega.',
         -1, 'urgente', 'pendiente', 'Inventario'),
        ('Pagar el predial del local', 'Vence a fin de mes.',
         -2, 'alta', 'pendiente', 'Administrativo'),
        ('Confirmar las citas de manana', null, 0, 'alta', 'pendiente', 'Seguimiento'),
        ('Revisar el stock de la vitrina', 'Reponer cuarzos y velas.',
         1, 'normal', 'pendiente', 'Inventario'),
        ('Mandar el recordatorio del curso de biomagnetismo', 'A los seis inscritos.',
         2, 'normal', 'pendiente', 'Seguimiento'),
        ('Renovar el seguro del local', 'Buscar dos cotizaciones antes.',
         5, 'normal', 'pendiente', 'Administrativo'),
        ('Cambiar las sabanas de la sala grande', null, 6, 'baja', 'pendiente', 'Administrativo'),
        ('Cotizar impresion de tarjetas', null, 9, 'baja', 'pendiente', 'Administrativo'),
        ('Llamar al proveedor de cristales', 'Preguntar por la amatista grande.',
         12, 'normal', 'pendiente', 'Inventario'),
        ('Preparar el material del taller de piedras', null, 16, 'normal', 'pendiente', 'Administrativo'),
        ('Seguimiento a la paciente con hernia', 'Preguntar como siguio de la espalda.',
         -18, 'alta', 'hecho', 'Seguimiento'),
        ('Depositar el corte de la semana', null, -21, 'normal', 'hecho', 'Administrativo'),
        ('Reponer inciensos de copal', null, -26, 'normal', 'hecho', 'Inventario'),
        ('Confirmar a los inscritos del taller de reiki', null, -33, 'alta', 'hecho', 'Seguimiento'),
        ('Pagar la nomina de la quincena', null, -38, 'urgente', 'hecho', 'Administrativo'),
        ('Llamar a quien no asistio el jueves', null, -44, 'normal', 'hecho', 'Seguimiento'),
        ('Comprar sabanas desechables', null, -51, 'normal', 'hecho', 'Inventario'),
        ('Revisar el contrato de la renta', null, -58, 'baja', 'hecho', 'Administrativo'),
        ('Actualizar los precios de la lista', null, -66, 'normal', 'hecho', 'Administrativo'),
        ('Felicitar a la paciente por su cumpleanos', null, -74, 'baja', 'hecho', 'Seguimiento'),
        ('Mandar promocion de septiembre', null, -82, 'normal', 'hecho', 'Seguimiento'),
        ('Cambiar el foco de la sala chica', null, -95, 'baja', 'hecho', 'Administrativo'),
        ('Mover la cita del sabado', 'Ya no se ocupa.', -29, 'baja', 'descartado', 'Seguimiento'),
        ('Cotizar difusores nuevos', 'Se compraron en otro lado.', -47, 'baja', 'descartado', 'Inventario')
      ) as x(titulo, detalle, dias, prioridad, estado, categoria)
    loop
      insert into recordatorio (negocio_id, titulo, detalle, fecha, hora, prioridad, estado,
                                categoria_id, responsable_id, creado_por, creado_en,
                                completado_en, completado_por)
      values (p_negocio, r.titulo, r.detalle, v_hoy + r.dias,
              case when r.prioridad in ('alta', 'urgente') then time '09:00' end,
              r.prioridad, r.estado,
              (select c.id from categoria c
                where c.negocio_id = p_negocio and c.ambito = 'recordatorio'
                  and c.nombre = r.categoria),
              v_membresia, v_usuario,
              (v_hoy + r.dias - 4)::timestamp + time '09:30',
              case when r.estado = 'hecho'
                   then (v_hoy + r.dias)::timestamp + time '18:00' end,
              case when r.estado = 'hecho' then v_usuario end)
      returning id into v_id;
      perform app.demo_anotar(p_negocio, 'recordatorio', v_id);

      -- EL RASTRO DE LOS QUE SE CERRARON. Un recordatorio hecho sin historial
      -- no puede contestar "¿quien lo cerro y cuando?", que es para lo unico
      -- que se le pregunta a esa tabla.
      if r.estado <> 'pendiente' then
        insert into recordatorio_evento (negocio_id, recordatorio_id, accion, despues,
                                         usuario_id, usuario_nombre, creado_en)
        values (p_negocio, v_id,
                case when r.estado = 'hecho' then 'completar' else 'cancelar' end,
                jsonb_build_object('estado', r.estado), v_usuario, v_nombre_yo,
                (v_hoy + r.dias)::timestamp + time '18:00')
        returning id into v_cita;
        perform app.demo_anotar(p_negocio, 'recordatorio_evento', v_cita);
      end if;
    end loop;

    /*
     * ALGUNOS RECORDATORIOS SABEN DE QUE HABLAN, y sin eso el modulo se queda
     * a medias: un recordatorio que solo dice "Pedir aceite de almendras" es
     * texto muerto — no se puede abrir el producto, ni saber si ya se repuso.
     * El panel de "lo pendiente de este paciente" del expediente y el del
     * producto salen de aqui, y sin una sola fila ligada salen siempre vacios.
     */
    update recordatorio rc set entidad_tipo = 'cliente', entidad_id = c.id
      from cliente c
     where rc.negocio_id = p_negocio and c.negocio_id = p_negocio
       and c.nombre = 'Roberto Quinones'
       and rc.titulo = 'Seguimiento a la paciente con hernia';

    update recordatorio rc set entidad_tipo = 'cliente', entidad_id = c.id
      from cliente c
     where rc.negocio_id = p_negocio and c.negocio_id = p_negocio
       and c.nombre = 'Adriana Villalobos'
       and rc.titulo = 'Llamar a la paciente de la cita cancelada';

    update recordatorio rc set entidad_tipo = 'producto', entidad_id = p.id
      from producto p
     where rc.negocio_id = p_negocio and p.negocio_id = p_negocio
       and p.nombre = 'Aceite de almendras dulces 250 ml'
       and rc.titulo = 'Pedir aceite de almendras';

    update recordatorio rc set entidad_tipo = 'producto', entidad_id = p.id
      from producto p
     where rc.negocio_id = p_negocio and p.negocio_id = p_negocio
       and p.nombre = 'Incienso de copal'
       and rc.titulo = 'Reponer inciensos de copal';

    update recordatorio rc set entidad_tipo = 'curso', entidad_id = cu.id
      from curso cu
     where rc.negocio_id = p_negocio and cu.negocio_id = p_negocio
       and cu.nombre = 'Introduccion al biomagnetismo'
       and rc.titulo = 'Mandar el recordatorio del curso de biomagnetismo';

    /* --- Las dos reglas que se repiten -------------------------------- */
    with nuevas as (
      insert into recordatorio_recurrente (negocio_id, titulo, detalle, hora, prioridad,
                                           categoria_id, responsable_id, frecuencia, intervalo,
                                           dias_semana, fecha_inicio, proxima_fecha, generados,
                                           estado, creado_por, creado_en)
      select p_negocio, x.titulo, x.detalle, time '09:00', x.prioridad,
             (select c.id from categoria c
               where c.negocio_id = p_negocio and c.ambito = 'recordatorio' and c.nombre = x.categoria),
             v_membresia, x.frecuencia, 1, x.dias, v_inicio,
             v_hoy + x.proxima, x.generados, 'activo', v_usuario,
             v_inicio::timestamp + time '09:00'
        from (values
          ('Confirmar las citas del dia siguiente', 'Antes de cerrar el centro.',
           'alta', 'semanal', array[5], 1, 18, 'Seguimiento'),
          ('Revisar existencias de la vitrina', 'Contar y anotar lo que falte.',
           'normal', 'mensual', null::int[], 7, 5, 'Inventario')
        ) as x(titulo, detalle, prioridad, frecuencia, dias, proxima, generados, categoria)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'recordatorio_recurrente', id from nuevas;

    /* --- Las conversaciones ------------------------------------------- */
    select id into v_conv from canal_de_mensajes
     where negocio_id = p_negocio and tipo = 'manual'
       and id in (select fila_id from dato_de_demostracion
                   where negocio_id = p_negocio and tabla = 'canal_de_mensajes')
     limit 1;

    v_cuenta := 0;
    for r in
      select c.id, c.nombre, c.telefono
        from cliente c
       where c.negocio_id = p_negocio
         and c.telefono is not null
         and c.id in (select fila_id from dato_de_demostracion
                       where negocio_id = p_negocio and tabla = 'cliente')
       order by c.creado_en
       limit 18
    loop
      v_cuenta := v_cuenta + 1;
      -- Las mas viejas ya se cerraron; las tres ultimas siguen abiertas y con
      -- algo sin leer, que es lo que hace que el modulo tenga algo que enseñar.
      v_cuando := (v_hoy - (v_cuenta * 3))::timestamp + time '11:20';

      insert into conversacion (negocio_id, canal_id, cliente_id, contacto, estado, favorita,
                                asignada_a, atendida_en, ultimo_en, creado_en)
      values (p_negocio, v_conv, r.id, r.telefono,
              case when v_cuenta <= 3 then 'abierta'
                   when v_cuenta <= 12 then 'cerrada' else 'archivada' end,
              v_cuenta = 2, v_membresia,
              case when v_cuenta > 3 then v_cuando + interval '40 minutes' end,
              v_cuando + interval '35 minutes',
              v_cuando - interval '10 minutes')
      returning id into v_id;
      perform app.demo_anotar(p_negocio, 'conversacion', v_id);

      -- LA ETIQUETA NO SE ANOTA, y no es un olvido: `conversacion_etiqueta` no
      -- tiene columna `id` —su llave es el par— y ademas cuelga en cascada de
      -- la conversacion. Al quitar la demostracion se va sola con ella.
      insert into conversacion_etiqueta (negocio_id, conversacion_id, categoria_id)
      select p_negocio, v_id, c.id from categoria c
       where c.negocio_id = p_negocio and c.ambito = 'conversacion'
         and c.nombre = (array['Cita', 'Informacion', 'Seguimiento'])[1 + (v_cuenta % 3)]
      on conflict do nothing;

      insert into mensaje (negocio_id, conversacion_id, direccion, cuerpo, estado, enviado_por,
                           leido_en, creado_en)
      values
        (p_negocio, v_id, 'entrante',
         (array['Hola, buenas tardes. ¿Tienen lugar esta semana?',
                'Hola, quiero agendar un masaje descontracturante.',
                'Buen dia, ¿cuanto cuesta la sesion de reiki?',
                'Hola, ¿a que hora abren el sabado?',
                'Buenas, ¿puedo mover mi cita del jueves?'])[1 + (v_cuenta % 5)],
         'pendiente', null,
         case when v_cuenta <= 3 then null else v_cuando + interval '5 minutes' end,
         v_cuando),
        (p_negocio, v_id, 'saliente',
         (array['Hola, con gusto. Tenemos el jueves a las 12:00 y el viernes a las 16:30.',
                'Claro que si, el descontracturante dura una hora y son $750.',
                'La sesion de reiki son $600 y dura 50 minutos.',
                'El sabado abrimos de 10:00 a 15:00.',
                'Sin problema, ¿que dia te queda mejor?'])[1 + (v_cuenta % 5)],
         'enviado', v_usuario, null, v_cuando + interval '12 minutes'),
        (p_negocio, v_id, 'entrante',
         (array['Perfecto, me quedo el jueves.',
                'Muchas gracias, ahi nos vemos.',
                'Va, lo pienso y les aviso.',
                'Gracias!',
                'El viernes en la tarde, porfa.'])[1 + (v_cuenta % 5)],
         'pendiente', null,
         case when v_cuenta <= 3 then null else v_cuando + interval '40 minutes' end,
         v_cuando + interval '35 minutes');

      insert into dato_de_demostracion (negocio_id, tabla, fila_id)
      select p_negocio, 'mensaje', m.id from mensaje m
       where m.conversacion_id = v_id
      on conflict do nothing;
    end loop;

    -- Dos numeros que todavia no son de nadie: es lo que obliga a que
    -- `cliente_id` pueda ser nulo, y hay que poder enseñarlo.
    for v_i in 1..2 loop
      insert into conversacion (negocio_id, canal_id, cliente_id, contacto, estado,
                                ultimo_en, creado_en)
      values (p_negocio, v_conv, null, '55' || lpad((41230100 + v_i)::text, 8, '0'),
              'abierta', (v_hoy - v_i)::timestamp + time '17:10',
              (v_hoy - v_i)::timestamp + time '17:00')
      returning id into v_id;
      perform app.demo_anotar(p_negocio, 'conversacion', v_id);

      insert into mensaje (negocio_id, conversacion_id, direccion, cuerpo, estado, creado_en)
      values (p_negocio, v_id, 'entrante',
              case when v_i = 1 then 'Hola, ¿dan clases de masaje?'
                   else 'Buenas, ¿tienen servicio a domicilio?' end,
              'pendiente', (v_hoy - v_i)::timestamp + time '17:10')
      returning id into v_cita;
      perform app.demo_anotar(p_negocio, 'mensaje', v_cita);
    end loop;

    /* --- Una difusion que ya salio ------------------------------------ */
    insert into difusion (negocio_id, nombre, cuerpo, canal_id, destinatarios, fallidos,
                          creado_por, creado_en)
    values (p_negocio, 'Promocion de temporada',
            'Este mes el masaje con piedras calientes tiene precio especial. Contestanos por aqui para apartar lugar.',
            v_conv, 24, 0, v_usuario, (v_hoy - 20)::timestamp + time '10:00')
    returning id into v_id;
    perform app.demo_anotar(p_negocio, 'difusion', v_id);

    /* --- Los reportes que alguien dejo guardados ---------------------- */
    with nuevos as (
      insert into reporte_guardado (negocio_id, nombre, tipo, desde, hasta, filtros,
                                    creado_por, creado_por_nombre, creado_en)
      select p_negocio, x.nombre, x.tipo, x.desde, x.hasta, '{}'::jsonb,
             v_usuario, v_nombre_yo, x.desde::timestamp + time '20:00'
        from (values
          ('Cierre del mes pasado', 'resumen',
           (date_trunc('month', v_hoy::timestamp) - interval '1 month')::date,
           (date_trunc('month', v_hoy::timestamp)::date - 1)),
          ('Servicios mas pedidos del trimestre', 'servicios',
           (date_trunc('month', v_hoy::timestamp) - interval '3 months')::date,
           v_hoy),
          ('Gastos de los cinco meses', 'gastos', v_inicio, v_hoy)
        ) as x(nombre, tipo, desde, hasta)
      returning id)
    insert into dato_de_demostracion (negocio_id, tabla, fila_id)
    select p_negocio, 'reporte_guardado', id from nuevos;

    /* --- Y unas cuantas anotaciones mas en la bitacora ---------------- */
    for r in
      select * from (values
        ('configuracion', 'editar', -148, 'Se guardaron los datos del centro'),
        ('servicios', 'crear', -147, 'Alta del catalogo de servicios'),
        ('productos', 'crear', -146, 'Alta del inventario inicial'),
        ('clientes', 'crear', -140, 'Alta de pacientes'),
        ('agenda', 'reagendar', -96, 'Se movio una cita'),
        ('cursos', 'crear', -95, 'Alta del taller de reiki'),
        ('configuracion', 'editar', -60, 'Se ajustaron los horarios'),
        ('agenda', 'estado', -31, 'Se cancelo una cita'),
        ('productos', 'ajustar', -24, 'Ajuste de inventario por merma'),
        ('clientes', 'editar', -12, 'Se actualizo un expediente')
      ) as x(modulo, accion, dias, detalle)
    loop
      perform app.demo_bitacora(p_negocio, r.modulo, r.accion, null,
        jsonb_build_object('detalle', r.detalle),
        (v_hoy + r.dias)::timestamp + time '12:00', v_usuario, v_nombre_yo, v_rol_yo);
    end loop;

    /* --- Dos ajustes de inventario, que en un centro real siempre hay -- */
    if v_productos is not null then
      perform app.demo_mover_inventario(p_negocio, v_productos[1], 'merma', -1,
        'Frasco roto al acomodar la vitrina', 'ajuste', null, null,
        (v_hoy - 24)::timestamp + time '11:00', v_usuario);
      perform app.demo_mover_inventario(p_negocio, v_productos[2], 'entrada', 12,
        'Pedido de reposicion', 'compra', null, null,
        (v_hoy - 18)::timestamp + time '10:00', v_usuario);
    end if;

    v_hechas := (select count(*) from dato_de_demostracion where negocio_id = p_negocio);
  end if;

  /*
   * QUEDA ESCRITO QUE ESTE PASO TERMINO, y hace falta por una razon concreta:
   * si la carga se corta a la mitad —una caja abierta, la pestaña cerrada, la
   * red— al volver a abrir la pantalla lo unico que se sabe es que hay filas
   * sembradas, no CUANTAS de las nueve tandas entraron. Sin esto, la unica
   * salida honesta seria "quitalo todo y empieza de nuevo"; con esto se puede
   * seguir desde donde se quedo.
   *
   * Se anota en la misma tabla del rastro y con `llave` en vez de `fila_id`,
   * asi que se va sola cuando se quita la demostracion.
   */
  insert into dato_de_demostracion (negocio_id, tabla, llave)
  values (p_negocio, 'paso', p_paso::text);

  return jsonb_build_object(
    'paso', p_paso,
    'pasos', 9,
    'titulo', (array['El catalogo del centro', 'Los pacientes y su expediente',
                     'El primer mes de trabajo', 'El segundo mes', 'El tercer mes',
                     'El cuarto mes', 'El quinto mes', 'Este mes, hasta hoy',
                     'Cursos, mensajes, recordatorios y bitacora'])[p_paso],
    'hechas', v_hechas,
    'siguiente', case when p_paso < 9 then p_paso + 1 end,
    'filas', (select count(*) from dato_de_demostracion where negocio_id = p_negocio));
end;
$$;

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
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

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
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
