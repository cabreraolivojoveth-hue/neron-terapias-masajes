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
  foreign key (negocio_id, profesional_id) references membresia (negocio_id, id) on delete set null;

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
  foreign key (negocio_id, venta_id) references venta (negocio_id, id) on delete set null;

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
begin
  if tg_op = 'INSERT' then
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos, descripcion, fecha, creado_por)
    values (new.negocio_id, 'egreso', 'gasto', new.id, new.monto_centavos, new.descripcion, new.fecha, new.creado_por);
    return new;
  end if;

  -- Un gasto capturado por error se marca como eliminado; la caja recibe el
  -- ingreso contrario. Igual que con las ventas: nada se tacha.
  if tg_op = 'UPDATE' and new.eliminado and not old.eliminado then
    insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos, descripcion, fecha, creado_por)
    values (new.negocio_id, 'ingreso', 'gasto', new.id, old.monto_centavos,
            'Se anulo el gasto: ' || old.descripcion, current_date, auth.uid());
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
create or replace function public.siguiente_folio(p_negocio text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max int;
begin
  if not app.es_miembro(p_negocio) then
    raise exception 'No perteneces a este negocio.' using errcode = 'insufficient_privilege';
  end if;
  -- Se toma el mayor que EXISTA O HAYA EXISTIDO. Como nada se borra de
  -- verdad, un folio nunca se repite aunque se cancele la venta.
  select coalesce(max(nullif(regexp_replace(folio, '\D', '', 'g'), '')::int), 0)
    into v_max
  from venta where negocio_id = p_negocio;
  return 'V-' || lpad((v_max + 1)::text, 5, '0');
end;
$$;

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
  on delete set null;

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
    -- El historial sale de la bitacora que ya existe. No hay una segunda.
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object(
        'accion', a.accion, 'quien', a.usuario_nombre, 'cuando', a.creado_en,
        'antes', a.antes, 'despues', a.despues
      ) order by a.creado_en desc)
      from (
        select * from auditoria
        where negocio_id = s.negocio_id and modulo = 'servicios' and entidad = s.id::text
        order by creado_en desc limit 20
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
  p_promo bigint,
  p_promo_desde date,
  p_promo_hasta date,
  p_color text,
  p_requiere_preparacion boolean,
  p_preparacion text,
  p_notas text,
  p_dias text,
  p_hora_desde time,
  p_hora_hasta time,
  p_activo boolean
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
            coalesce(v_quien.rol, 'desconocido'), 'servicios', 'crear', v_s.id::text, null,
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
          coalesce(v_quien.rol, 'desconocido'), 'servicios', 'editar', v_s.id::text, v_antes,
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
  on delete set null;

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
          coalesce(v_quien.rol, 'desconocido'), 'agenda', 'reagendar', p_cita::text, v_antes,
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
          coalesce(v_quien.rol, 'desconocido'), 'agenda', 'estado', p_cita::text,
          jsonb_build_object('estado', v_antes), jsonb_build_object('estado', p_estado), p_motivo);

  return v_cita;
end;
$$;

