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
-- CATEGORIAS — una sola tabla para agrupar servicios y cursos
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

alter table servicio add column if not exists categoria_id uuid;

-- LA LLAVE VA COMPUESTA, contra `(negocio_id, id)`.
--
-- Con una llave simple contra `categoria(id)` se podria colgar un servicio de
-- la categoria de OTRO centro: las llaves foraneas no obedecen las reglas de
-- fila, y el nombre de esa categoria ajena acabaria impreso en la agenda.
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
  origen         text not null check (origen in ('venta', 'gasto', 'ajuste')),
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
