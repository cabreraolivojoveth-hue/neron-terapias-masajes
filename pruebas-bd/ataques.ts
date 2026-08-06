/**
 * ATAQUES CONTRA NERON TERAPIAS
 *
 * Cada prueba de aqui intenta hacer daño de verdad contra las tablas del
 * producto: leer el expediente de los pacientes de otro centro, cobrarse una
 * venta ajena, meter dinero a la caja sin operacion detras, cambiar una venta
 * a "cobrada" sin bajar inventario. **Estan bien cuando fallan el intento.**
 *
 * Y van con controles positivos: unas reglas que nieguen TODO pasarian todos
 * los ataques y el centro no podria trabajar. Tambien se comprueba que lo
 * permitido de verdad funcione.
 *
 * La cadena de conexion NUNCA se escribe aqui ni se manda por chat: vive en
 * el .env de tu maquina, que .gitignore deja fuera del repositorio.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const RAIZ = join(import.meta.dirname, '..');
const CADENA = process.env.DATABASE_URL;
const SIN_REGLAS = process.env.NERON_SIN_REGLAS === '1';

/* Los personajes del ensayo -------------------------------------------- */

const CENTRO = 't_centro';        // Centro Holistico
const OTRO = 't_otro';            // otro centro, la victima potencial

const DUENA = '11111111-1111-4111-8111-111111111111';
const RECEPCION = '22222222-2222-4222-8222-222222222222'; // sin verFinanzas
const DUENO_OTRO = '44444444-4444-4444-8444-444444444444';

/* Resultados ------------------------------------------------------------ */

interface Resultado { grupo: string; titulo: string; paso: boolean; detalle: string }
const resultados: Resultado[] = [];
let grupoActual = '';
const grupo = (n: string): void => { grupoActual = n; };
const anotar = (titulo: string, paso: boolean, detalle = ''): void => {
  resultados.push({ grupo: grupoActual, titulo, paso, detalle });
};

/** Las doce tablas del producto. Una sola lista, para que no se desincronicen. */
const TABLAS = ['cliente', 'servicio', 'curso', 'producto', 'cita', 'venta',
  'venta_item', 'pago', 'gasto', 'movimiento_caja', 'inscripcion', 'recordatorio',
  'categoria', 'sesion_curso', 'material_curso'] as const;

const cliente = new pg.Client(CADENA ? { connectionString: CADENA } : {});

/** Corre algo COMO esa persona: el mismo mecanismo que usa Supabase. */
async function como<T>(usuario: string | null, trabajo: () => Promise<T>): Promise<T> {
  await cliente.query('begin');
  try {
    await cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
      // Sin sesion se manda un token VACIO PERO VALIDO, que es lo que llega
      // de verdad: la peticion existe, simplemente no trae identidad. Un
      // texto vacio no es JSON y reventaria antes de probar nada.
      usuario ? JSON.stringify({ sub: usuario, role: 'authenticated' }) : '{}',
    ]);
    await cliente.query('set local role authenticated');
    return await trabajo();
  } finally {
    await cliente.query('rollback');
  }
}

async function cuantos(sql: string, params: unknown[] = []): Promise<number> {
  const r = await cliente.query(sql, params);
  return r.rowCount ?? 0;
}

/**
 * Corre algo esperando que la base lo RECHACE. Devuelve el mensaje.
 *
 * Va sobre un punto de retorno porque en Postgres una sentencia rechazada
 * ABORTA la transaccion entera: sin esto, la prueba siguiente recibiria
 * "current transaction is aborted" y el ensayo se caeria a la primera regla
 * que funcione — justo al reves de lo que se busca.
 */
let punto = 0;
async function rechazado(trabajo: () => Promise<unknown>): Promise<string | null> {
  punto += 1;
  const nombre = `p${punto}`;
  await cliente.query(`savepoint ${nombre}`);
  try {
    await trabajo();
    await cliente.query(`release savepoint ${nombre}`);
    return null;
  } catch (e) {
    await cliente.query(`rollback to savepoint ${nombre}`);
    return (e as Error).message.split('\n')[0] ?? 'rechazado';
  }
}

/* Escenario ------------------------------------------------------------- */

let servicioId = '';
let productoId = '';
let clienteId = '';
let servicioOtro = '';
let clienteOtro = '';
let membresiaDuena = '';
let membresiaRecepcion = '';
let categoriaId = '';
let categoriaOtra = '';

/**
 * SE APLICA EL INSTALADOR DE VERDAD, no una copia.
 *
 * LO QUE COSTO APRENDER ESTO: `basedatos/*.sql` se quedo atras y doce
 * funciones vivian SOLO en `INSTALAR-EN-TERAPIAS.sql`. Como Postgres no revisa
 * el cuerpo de una funcion `plpgsql` al crearla, y estas pruebas nunca veian
 * las de `sql`, un nombre de columna equivocado —`creado_en` donde la bitacora
 * dice `ocurrido_en`— paso los tipos, las guardias, 618 pruebas y la
 * compilacion, y reventó en el SQL Editor con el centro esperando.
 *
 * Aplicar el instalador completo aqui hace que Postgres parsee cada funcion
 * `sql` de verdad. El error sale en `npm run consistencia`, no a las nueve de
 * la mañana.
 */
async function aplicarEsquema(): Promise<void> {
  for (const a of ['01-esquema.sql', '02-reglas.sql', '03-funciones.sql']) {
    await cliente.query(readFileSync(join(RAIZ, 'basedatos', a), 'utf8'));
  }
  // Va DESPUES de los tres: es idempotente —todo con `if not exists` o
  // `create or replace`— y trae ademas lo que ellos no tienen.
  await cliente.query(readFileSync(join(RAIZ, 'INSTALAR-EN-TERAPIAS.sql'), 'utf8'));
  if (SIN_REGLAS) {
    /**
     * EL CANDADO DEL CONTROL NEGATIVO.
     *
     * Lo que sigue APAGA las reglas de fila de las doce tablas y le abre los
     * permisos a cualquiera con sesion. Es lo que hay que hacer para probar
     * que sin reglas los ataques SI tienen exito — y es, literalmente, dejar
     * el sistema como estaba Neron POS.
     *
     * Corrido contra el Supabase de verdad, dejaria los expedientes de todos
     * los pacientes al alcance de cualquiera CON LA BASE ASI, PARA SIEMPRE:
     * el `alter table` no se deshace solo al terminar el script.
     *
     * Por eso se niega a correr contra algo que huela a Supabase, y por eso
     * vuelve a poner las reglas al final pase lo que pase.
     */
    if (CADENA && /supabase\.(co|com|in)/i.test(CADENA)) {
      console.error('  El control negativo NO corre contra Supabase: apagaria las reglas de');
      console.error('  fila de tu proyecto y las dejaria apagadas. Solo contra una base local.');
      process.exit(1);
    }
    for (const t of TABLAS) {
      await cliente.query(`alter table ${t} disable row level security`);
      await cliente.query(`grant select, insert, update, delete on ${t} to authenticated`);
    }
    // El instalador vuelve a encender las reglas de sus tablas al aplicarse.
    // Se vuelven a apagar DESPUES de el, o el control negativo no controla nada.
    await cliente.query(readFileSync(join(RAIZ, 'INSTALAR-EN-TERAPIAS.sql'), 'utf8'));
    for (const t of TABLAS) {
      await cliente.query(`alter table ${t} disable row level security`);
      await cliente.query(`grant select, insert, update, delete on ${t} to authenticated`);
    }
    return;
  }
}

/** Vuelve a poner las reglas. Se llama SIEMPRE, aunque el ensayo reviente. */
async function restaurarReglas(): Promise<void> {
  if (!SIN_REGLAS) return;
  await cliente.query('set role postgres');
  await cliente.query(readFileSync(join(RAIZ, 'basedatos', '02-reglas.sql'), 'utf8'));
  await cliente.query('reset role');
  console.log('  (reglas restauradas: la base local quedo como estaba)');
}

async function sembrar(): Promise<void> {
  await cliente.query('set role postgres');
  await cliente.query('delete from negocio where id = any($1)', [[CENTRO, OTRO]]);
  await cliente.query(
    `insert into negocio (id, nombre, producto) values ($1,'Centro Holistico','terapias'), ($2,'Otro Centro','terapias')`,
    [CENTRO, OTRO]);
  await cliente.query(`insert into estado (negocio_id, data) values ($1,'{}'), ($2,'{}')`, [CENTRO, OTRO]);

  // La recepcionista puede agendar y cobrar, pero NO ver finanzas.
  await cliente.query(
    `insert into rol (negocio_id, id, etiqueta, permisos) values
       ($1,'dueno','Dueña','{}'::jsonb),
       ($1,'recepcion','Recepcion','{"gestionarClientes":true,"gestionarAgenda":true,"cobrar":true,"verFinanzas":false,"gestionarInventario":false,"gestionarCatalogo":false}'::jsonb),
       ($2,'dueno','Dueño','{}'::jsonb)`, [CENTRO, OTRO]);

  await cliente.query(
    `insert into membresia (negocio_id, usuario_id, correo, nombre, rol, activo) values
       ($1,$3,'duena@centro.mx','Duena','dueno',true),
       ($1,$4,'recepcion@centro.mx','Recepcion','recepcion',true),
       ($2,$5,'dueno@otro.mx','Dueno Otro','dueno',true)`,
    [CENTRO, OTRO, DUENA, RECEPCION, DUENO_OTRO]);

  const ms = await cliente.query(
    `select id, rol from membresia where negocio_id = $1 order by rol`, [CENTRO]);
  membresiaDuena = ms.rows.find((r: { rol: string }) => r.rol === 'dueno').id;
  membresiaRecepcion = ms.rows.find((r: { rol: string }) => r.rol === 'recepcion').id;

  const s = await cliente.query(
    `insert into servicio (negocio_id, nombre, duracion_min, precio_centavos) values
       ($1,'Reiki',60,80000) returning id`, [CENTRO]);
  servicioId = s.rows[0].id;

  const p = await cliente.query(
    `insert into producto (negocio_id, nombre, precio_centavos, stock_actual, stock_minimo) values
       ($1,'Aceite de Lavanda',25000,10,3) returning id`, [CENTRO]);
  productoId = p.rows[0].id;

  const c = await cliente.query(
    `insert into cliente (negocio_id, nombre, telefono, notas) values
       ($1,'Paciente Del Centro','6461234567','notas clinicas privadas') returning id`, [CENTRO]);
  clienteId = c.rows[0].id;

  const so = await cliente.query(
    `insert into servicio (negocio_id, nombre, precio_centavos) values ($1,'Masaje Otro',50000) returning id`, [OTRO]);
  servicioOtro = so.rows[0].id;
  const co = await cliente.query(
    `insert into cliente (negocio_id, nombre, notas) values ($1,'Paciente Ajeno','expediente ajeno') returning id`, [OTRO]);
  clienteOtro = co.rows[0].id;

  const k = await cliente.query(
    `insert into categoria (negocio_id, ambito, nombre) values ($1,'servicio','Terapias') returning id`,
    [CENTRO]);
  categoriaId = k.rows[0].id;
  const ko = await cliente.query(
    `insert into categoria (negocio_id, ambito, nombre) values ($1,'servicio','Ajena') returning id`,
    [OTRO]);
  categoriaOtra = ko.rows[0].id;

  await cliente.query('reset role');
}

/** Deja una venta en borrador con un servicio y dos productos. */
async function ventaEnBorrador(negocio = CENTRO): Promise<string> {
  const v = await cliente.query(
    `insert into venta (negocio_id, folio, cliente_id, fecha) values ($1,'V-TEST',$2,current_date) returning id`,
    [negocio, negocio === CENTRO ? clienteId : clienteOtro]);
  const id = v.rows[0].id;
  await cliente.query(
    `insert into venta_item (negocio_id, venta_id, tipo, servicio_id, descripcion, cantidad, precio_unitario_centavos, subtotal_centavos)
     values ($1,$2,'servicio',$3,'Reiki',1,80000,80000)`, [negocio, id, servicioId]);
  await cliente.query(
    `insert into venta_item (negocio_id, venta_id, tipo, producto_id, descripcion, cantidad, precio_unitario_centavos, subtotal_centavos)
     values ($1,$2,'producto',$3,'Aceite',2,25000,50000)`, [negocio, id, productoId]);
  return id;
}

/* ---------------------------------------------------------------------- */
/* Los ataques                                                             */
/* ---------------------------------------------------------------------- */

async function correr(): Promise<void> {
  grupo('El expediente de un centro no se ve desde otro');

  for (const [tabla, etiqueta] of [
    ['cliente', 'los pacientes'],
    ['servicio', 'el catalogo de servicios'],
    ['curso', 'los cursos'],
    ['producto', 'el inventario'],
    ['cita', 'la agenda'],
    ['venta', 'las ventas'],
    ['venta_item', 'los renglones de venta'],
    ['pago', 'los pagos'],
    ['gasto', 'los gastos'],
    ['movimiento_caja', 'la caja'],
    ['inscripcion', 'las inscripciones'],
    ['recordatorio', 'los recordatorios'],
    ['categoria', 'las categorías del catálogo'],
    ['sesion_curso', 'las sesiones de curso'],
    ['material_curso', 'el material de los cursos'],
  ] as const) {
    await como(DUENO_OTRO, async () => {
      const n = await cuantos(`select * from ${tabla} where negocio_id = $1`, [CENTRO]);
      anotar(`NO puede ver ${etiqueta} del otro centro`, n === 0, `vio ${n}`);
    });
  }

  await como(DUENO_OTRO, async () => {
    const e = await rechazado(() =>
      cliente.query(`insert into cliente (negocio_id, nombre) values ($1,'Infiltrado')`, [CENTRO]));
    anotar('NO puede meter un paciente en el centro ajeno', e !== null, e ?? 'lo logro');
  });

  await como(DUENO_OTRO, async () => {
    const r = await cliente.query(
      `update cliente set nombre='Secuestrado' where id=$1 returning id`, [clienteId]);
    anotar('NO puede editar un paciente ajeno', r.rowCount === 0, `toco ${r.rowCount}`);
  });

  await como(DUENA, async () => {
    const e = await rechazado(() =>
      cliente.query(`update cliente set negocio_id=$1 where id=$2`, [OTRO, clienteId]));
    anotar('NO puede MUDAR su paciente al centro de al lado', e !== null, e ?? 'lo logro');
  });

  grupo('El catalogo no se cuelga de la categoria de otro centro');

  await como(DUENA, async () => {
    /**
     * EL ATAQUE QUE JUSTIFICA LA LLAVE COMPUESTA.
     *
     * Con una llave simple contra `categoria(id)` esto PASARIA: las llaves
     * foraneas no obedecen las reglas de fila, asi que la base aceptaria el
     * apuntador y el nombre de una categoria ajena acabaria impreso en la
     * agenda del centro equivocado.
     */
    const e = await rechazado(() =>
      cliente.query(`update servicio set categoria_id=$1 where id=$2`, [categoriaOtra, servicioId]));
    anotar('NO puede colgar su servicio de una categoria ajena', e !== null, e ?? 'lo logro');
  });

  await como(DUENA, async () => {
    const r = await cliente.query(
      `update servicio set categoria_id=$1 where id=$2 returning id`, [categoriaId, servicioId]);
    anotar('SI puede usar una categoria propia', r.rowCount === 1, `toco ${r.rowCount}`);
  });

  await como(DUENO_OTRO, async () => {
    const e = await rechazado(() =>
      cliente.query(`insert into categoria (negocio_id, ambito, nombre) values ($1,'servicio','Infiltrada')`,
        [CENTRO]));
    anotar('NO puede meter una categoria en el centro ajeno', e !== null, e ?? 'lo logro');
  });

  await como(RECEPCION, async () => {
    // Quien no puede tocar un servicio tampoco puede renombrar el grupo al que
    // pertenece: seria cambiarle la etiqueta a todo el catalogo de lado.
    const e = await rechazado(() =>
      cliente.query(`insert into categoria (negocio_id, ambito, nombre) values ($1,'servicio','Sin permiso')`,
        [CENTRO]));
    anotar('Sin gestionarCatalogo NO se crean categorias', e !== null, e ?? 'lo logro');
  });

  await como(DUENA, async () => {
    // Archivar una categoria deja a sus servicios SIN categoria, no los borra.
    // Perder treinta servicios por limpiar una etiqueta seria imperdonable.
    await cliente.query(`update servicio set categoria_id=$1 where id=$2`, [categoriaId, servicioId]);
    await cliente.query('set local role postgres');
    await cliente.query(`delete from categoria where id=$1`, [categoriaId]);
    await cliente.query('set local role authenticated');
    const n = await cuantos(`select * from servicio where id=$1`, [servicioId]);
    anotar('borrar la categoria NO borra sus servicios', n === 1, `quedaron ${n}`);
  });

  grupo('El catalogo deja rastro, y el rastro se puede volver a leer');

  await como(DUENA, async () => {
    /**
     * LA PRUEBA QUE FALTABA, Y QUE COSTO UN SQL ROTO EN PRODUCCION.
     *
     * Guardar y volver a leer es lo unico que comprueba que las dos mitades
     * usan los mismos nombres de columna. `ficha_del_servicio` leia
     * `a.creado_en` cuando la bitacora se llama `ocurrido_en`, y nada lo
     * detuvo: los tipos no ven SQL, las guardias tampoco, y las pruebas del
     * navegador simulan el servidor.
     */
    const s = await cliente.query(
      `select (guardar_servicio($1, null, 'Sesion Del Rastro', null, null, 60, 50000)).id as id`,
      [CENTRO]);
    const nuevo = s.rows[0].id;

    const f = await cliente.query(`select ficha_del_servicio($1) as f`, [nuevo]);
    const ficha = f.rows[0].f;
    anotar('guardar y volver a leer la ficha NO revienta', ficha !== null, 'devolvio nulo');

    const historial = ficha?.historial ?? [];
    anotar('crear un servicio deja su renglon en la bitacora',
      historial.length === 1 && historial[0]?.accion === 'crear',
      `trajo ${historial.length}`);
    // Sin fecha, el historial se lee como una lista de cambios sin cuando.
    anotar('el renglon trae CUANDO paso', Boolean(historial[0]?.cuando), 'vino vacio');
    // El id del rol ('dueno') no es su etiqueta ('Dueña'). La bitacora guarda
    // la etiqueta para que se siga leyendo dentro de tres años.
    const a = await cliente.query(
      `select rol_etiqueta from auditoria where entidad = $1`, [nuevo]);
    anotar('la bitacora guarda la ETIQUETA del rol, no su id',
      a.rows[0]?.rol_etiqueta === 'Dueña', `guardo ${a.rows[0]?.rol_etiqueta}`);
  });

  await como(RECEPCION, async () => {
    /**
     * "No puedes verlo" NO es lo mismo que "no existe".
     *
     * La regla de fila de la bitacora solo la entrega a quien tiene
     * `verAuditoria`. Sin decirlo, la pantalla enseñaria "todavia no hay
     * cambios registrados" a quien si los hay — y una pantalla que confunde
     * las dos cosas enseña a desconfiar de todo lo demas que dice.
     */
    const f = await cliente.query(`select ficha_del_servicio($1) as f`, [servicioId]);
    anotar('sin verAuditoria, la ficha lo DICE en vez de fingir que no hay nada',
      f.rows[0].f?.puedeVerHistorial === false, `dijo ${f.rows[0].f?.puedeVerHistorial}`);
  });

  await como(RECEPCION, async () => {
    const e = await rechazado(() =>
      cliente.query(`select guardar_servicio($1, null, 'Sin permiso', null, null, 60, 1000)`,
        [CENTRO]));
    anotar('Sin gestionarCatalogo NO se guarda un servicio', e !== null, e ?? 'lo logro');
  });

  await como(DUENO_OTRO, async () => {
    const e = await rechazado(() =>
      cliente.query(`select guardar_servicio($1, null, 'Infiltrado', null, null, 60, 1000)`,
        [CENTRO]));
    anotar('NO puede guardar un servicio en el centro ajeno', e !== null, e ?? 'lo logro');
  });

  grupo('El cupo de un curso no se pasa, ni por la puerta de atras');

  await como(DUENA, async () => {
    /**
     * LO QUE MAS DUELE SI FALLA: LA SOBREVENTA.
     *
     * Un curso con dos lugares no puede terminar con tres inscritos. La forma
     * obvia —contar y luego insertar— tiene una ventana entre las dos
     * operaciones; el `for update` sobre el renglon del curso la cierra.
     */
    const c = await cliente.query(
      `select (guardar_curso($1, null, 'Taller Del Ataque', null, null, null, null,
         current_date + 10, current_date + 11, 100000, 2)).id as id`, [CENTRO]);
    const curso = c.rows[0].id;

    const a = await cliente.query(
      `insert into cliente (negocio_id, nombre) values ($1,'Alumna A'),($1,'Alumna B'),($1,'Alumna C')
       returning id, nombre`, [CENTRO]);
    const [x, y, z] = a.rows.map((r: { id: string }) => r.id);

    const e1 = await cliente.query(`select (inscribir_en_curso($1,$2,$3)).estado as e`,
      [CENTRO, curso, x]);
    const e2 = await cliente.query(`select (inscribir_en_curso($1,$2,$3)).estado as e`,
      [CENTRO, curso, y]);
    anotar('los dos primeros SI entran', e1.rows[0].e === 'inscrito' && e2.rows[0].e === 'inscrito',
      `${e1.rows[0].e} y ${e2.rows[0].e}`);

    // LLENO NO RECHAZA: apunta. Rechazar pierde al cliente; apuntarlo deja
    // constancia de cuanta demanda hubo de verdad.
    const e3 = await cliente.query(`select (inscribir_en_curso($1,$2,$3)).estado as e`,
      [CENTRO, curso, z]);
    anotar('el tercero va a LISTA DE ESPERA, no se rechaza',
      e3.rows[0].e === 'lista_espera', `quedo ${e3.rows[0].e}`);

    const o = await cliente.query(`select app.lugares_ocupados($1) n`, [curso]);
    anotar('la lista de espera NO ocupa lugar', o.rows[0].n === 2, `ocupados ${o.rows[0].n}`);

    // NADIE SE INSCRIBE DOS VECES. Dos inscripciones vivas de la misma persona
    // hacen que el cupo cuente doble y que la asistencia no cuadre.
    const dup = await rechazado(() =>
      cliente.query(`select inscribir_en_curso($1,$2,$3)`, [CENTRO, curso, x]));
    anotar('NO se puede inscribir dos veces a la misma persona', dup !== null, dup ?? 'lo logro');

    // Subir a alguien de la espera vuelve a comprobar el cupo: si no, la lista
    // de espera seria la puerta de atras del cupo.
    const ins = await cliente.query(
      `select id from inscripcion where curso_id=$1 and estado='lista_espera'`, [curso]);
    const subir = await rechazado(() =>
      cliente.query(`select cambiar_estado_inscripcion($1,'inscrito')`, [ins.rows[0].id]));
    anotar('la lista de espera NO es la puerta de atras del cupo', subir !== null,
      subir ?? 'lo logro');

    // Bajar el cupo por debajo de los inscritos dejaria gente adentro de un
    // curso que dice estar lleno de mas, y nadie sabria a quien sacar.
    const baja = await rechazado(() =>
      cliente.query(`select guardar_curso($1,$2,'Taller Del Ataque',null,null,null,null,
        current_date + 10, current_date + 11, 100000, 1)`, [CENTRO, curso]));
    anotar('NO se puede bajar el cupo por debajo de los ya inscritos', baja !== null,
      baja ?? 'lo logro');
  });

  await como(DUENO_OTRO, async () => {
    const e = await rechazado(() =>
      cliente.query(`select guardar_curso($1, null, 'Infiltrado', null,null,null,null,
        current_date + 5, null, 1000, 5)`, [CENTRO]));
    anotar('NO puede crear un curso en el centro ajeno', e !== null, e ?? 'lo logro');
  });

  grupo('Las sesiones de curso no enciman al instructor');

  await como(DUENA, async () => {
    const c = await cliente.query(
      `select (guardar_curso($1, null, 'Taller Con Sesiones', null, null, null, $2,
         current_date + 20, current_date + 21, 100000, 10)).id as id`, [CENTRO, membresiaDuena]);
    const curso = c.rows[0].id;

    const s1 = await cliente.query(
      `select (guardar_sesion_curso($1, null, current_date + 20, '09:00','15:00')).id as id`,
      [curso]);
    anotar('una sesion normal SI entra', Boolean(s1.rows[0].id), 'no entro');

    // EL CHOQUE SE COMPRUEBA CONTRA LAS DOS AGENDAS. Mirar solo una deja
    // exactamente la otra mitad del problema sin resolver.
    const e1 = await rechazado(() =>
      cliente.query(`select guardar_sesion_curso($1, null, current_date + 20, '14:00','18:00')`,
        [curso]));
    anotar('el instructor NO puede tener dos sesiones encimadas', e1 !== null, e1 ?? 'lo logro');

    const e2 = await cliente.query(
      `select (guardar_sesion_curso($1, null, current_date + 20, '16:00','18:00')).id as id`,
      [curso]);
    anotar('pero una pegada a la anterior SI entra', Boolean(e2.rows[0].id), 'la rechazo');

    // Y contra las CITAS: una terapeuta no puede estar dando un taller y
    // atendiendo a una paciente a la misma hora.
    await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha,
                         hora_inicio, hora_fin)
       values ($1,$2,$3,$4, current_date + 21, '10:00','11:00')`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    const e3 = await rechazado(() =>
      cliente.query(`select guardar_sesion_curso($1, null, current_date + 21, '10:30','12:00')`,
        [curso]));
    anotar('ni una sesion encimada con una CITA suya', e3 !== null, e3 ?? 'lo logro');

    // Una sesion que termina antes de empezar no existe.
    const e4 = await rechazado(() =>
      cliente.query(`select guardar_sesion_curso($1, null, current_date + 25, '15:00','09:00')`,
        [curso]));
    anotar('una sesion no puede terminar antes de empezar', e4 !== null, e4 ?? 'lo logro');
  });

  await como(RECEPCION, async () => {
    const c = await cliente.query(`select id from curso where negocio_id=$1 limit 1`, [CENTRO]);
    if (c.rows[0]) {
      const e = await rechazado(() =>
        cliente.query(`select guardar_sesion_curso($1, null, current_date + 30, '09:00','10:00')`,
          [c.rows[0].id]));
      anotar('Sin gestionarCatalogo NO se programan sesiones', e !== null, e ?? 'lo logro');
    }
  });

  grupo('El curso se conecta sin apropiarse de nada');

  await como(DUENA, async () => {
    const c = await cliente.query(
      `select (guardar_curso($1, null, 'Taller Conectado', null,null,null,null,
         current_date + 40, null, 50000, 5)).id as id`, [CENTRO]);
    const curso = c.rows[0].id;
    await cliente.query(`select inscribir_en_curso($1,$2,$3)`, [CENTRO, curso, clienteId]);

    // EL ALUMNO ES UN CLIENTE: el nombre se resuelve al leer, no se copia.
    const f = await cliente.query(`select ficha_del_curso($1) as f`, [curso]);
    const alumnos = f.rows[0].f?.alumnos ?? [];
    anotar('la ficha resuelve el NOMBRE del alumno desde su ficha de cliente',
      alumnos[0]?.nombre === 'Paciente Del Centro', `trajo ${alumnos[0]?.nombre}`);

    await cliente.query(`update cliente set nombre='Paciente Corregida' where id=$1`, [clienteId]);
    const f2 = await cliente.query(`select ficha_del_curso($1) as f`, [curso]);
    anotar('corregir el nombre en Clientes lo corrige en el curso',
      f2.rows[0].f?.alumnos?.[0]?.nombre === 'Paciente Corregida', 'se quedo viejo');

    // Y AL REVES: el expediente del cliente enseña sus cursos, derivados de la
    // inscripcion. Nadie guarda una copia.
    const mios = await cliente.query(`select cursos_del_cliente($1) as c`, [clienteId]);
    anotar('el expediente del cliente enseña sus cursos',
      (mios.rows[0].c ?? []).length === 1, `trajo ${(mios.rows[0].c ?? []).length}`);

    // LA SESION SALE EN LA AGENDA, consultada. No hay una cita espejo.
    await cliente.query(
      `select guardar_sesion_curso($1, null, current_date + 40, '09:00','13:00')`, [curso]);
    const ses = await cliente.query(
      `select sesiones_del_rango($1, current_date, current_date + 60) as s`, [CENTRO]);
    const enAgenda = (ses.rows[0].s ?? []).filter(
      (x: { cursoId: string }) => x.cursoId === curso);
    anotar('la sesion sale en la agenda del centro', enAgenda.length === 1,
      `trajo ${enAgenda.length}`);
    anotar('y trae cuantos alumnos van, contados al leer',
      enAgenda[0]?.alumnos === 1, `dijo ${enAgenda[0]?.alumnos}`);

    const citas = await cliente.query(
      `select count(*) n from cita where negocio_id=$1 and fecha = current_date + 40`, [CENTRO]);
    anotar('y NO se creo una cita espejo que se pueda desincronizar',
      Number(citas.rows[0].n) === 0, `creo ${citas.rows[0].n}`);
  });

  await como(DUENO_OTRO, async () => {
    const n = await cuantos(`select * from sesion_curso where negocio_id = $1`, [CENTRO]);
    anotar('desde otro centro las sesiones ajenas vienen VACIAS', n === 0, `vio ${n}`);
  });

  grupo('Sin permiso de finanzas, la base no entrega el dinero');

  await como(RECEPCION, async () => {
    await cliente.query('set local role postgres');
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    await cliente.query(`set local role authenticated`);
    const n = await cuantos(`select * from venta where negocio_id=$1`, [CENTRO]);
    anotar('la recepcionista NO ve las ventas', n === 0, `vio ${n}`);
  });

  await como(RECEPCION, async () => {
    const n = await cuantos(`select * from movimiento_caja where negocio_id=$1`, [CENTRO]);
    anotar('la recepcionista NO ve la caja', n === 0, `vio ${n}`);
  });

  await como(RECEPCION, async () => {
    const n = await cuantos(`select * from gasto where negocio_id=$1`, [CENTRO]);
    anotar('la recepcionista NO ve los gastos', n === 0, `vio ${n}`);
  });

  await como(RECEPCION, async () => {
    const r = await cliente.query(`select resumen_inicio($1) as x`, [CENTRO]);
    const resumen = r.rows[0].x;
    anotar('el tablero le da CERO en ventas, desde la base',
      Number(resumen.ventasHoy) === 0, `le dio ${resumen.ventasHoy}`);
    anotar('pero SI le da sus citas: no se le apaga el trabajo',
      typeof resumen.citasHoy !== 'undefined');
  });

  await como(RECEPCION, async () => {
    const e = await rechazado(() =>
      cliente.query(`insert into producto (negocio_id, nombre, precio_centavos) values ($1,'Contrabando',100)`, [CENTRO]));
    anotar('sin gestionarInventario NO puede crear productos', e !== null, e ?? 'lo logro');
  });

  grupo('Una venta no se cobra por la puerta de atras');

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    // La base LANZA, no ignora la fila en silencio: el `with check` de
    // venta_editar deja pasar el renglon (todavia es borrador) y despues
    // rechaza el valor nuevo. Es lo que se quiere — un update que no hace
    // nada y no avisa es peor que uno que falla.
    const e = await rechazado(() => cliente.query(
      `update venta set estado='cobrada', total_centavos=999999 where id=$1`, [v]));
    anotar('NO se puede marcar "cobrada" con un update directo', e !== null,
      'se marco sin bajar inventario ni tocar caja');
    const r = await cliente.query(`select estado, total_centavos from venta where id=$1`, [v]);
    anotar('y la venta se queda en borrador con su total intacto',
      r.rows[0]?.estado === 'borrador' && Number(r.rows[0]?.total_centavos) === 0,
      JSON.stringify(r.rows[0]));
  });

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    const e = await rechazado(() => cliente.query(
      `insert into venta_item (negocio_id, venta_id, tipo, servicio_id, descripcion, cantidad, precio_unitario_centavos, subtotal_centavos)
       values ($1,$2,'servicio',$3,'Colado',1,1,1)`, [CENTRO, v, servicioId]));
    anotar('NO se le agregan renglones a una venta ya cobrada', e !== null, e ?? 'lo logro');
  });

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`update venta set total_centavos = 1 where id=$1`, [v]);
    const r = await cliente.query(`select (cobrar_venta($1)).total_centavos as t`, [v]);
    anotar('el total lo CALCULA la base, no el navegador', Number(r.rows[0].t) === 130000,
      `quedo en ${r.rows[0].t}`);
  });

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    const e = await rechazado(() => cliente.query(`select cobrar_venta($1)`, [v]));
    anotar('cobrar dos veces NO mete el dinero dos veces', e !== null, e ?? 'se cobro doble');
  });

  await como(DUENO_OTRO, async () => {
    await cliente.query('set local role postgres');
    const v = await ventaEnBorrador();
    await cliente.query('set local role authenticated');
    const e = await rechazado(() => cliente.query(`select cobrar_venta($1)`, [v]));
    anotar('NO puede cobrar una venta de otro centro', e !== null, e ?? 'la cobro');
  });

  grupo('El inventario responde solo');

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    const r = await cliente.query(`select stock_actual from producto where id=$1`, [productoId]);
    anotar('vender 2 piezas deja el stock en 8', r.rows[0].stock_actual === 8,
      `quedo en ${r.rows[0].stock_actual}`);
  });

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    await cliente.query(`select cancelar_venta($1,'prueba')`, [v]);
    const r = await cliente.query(`select stock_actual from producto where id=$1`, [productoId]);
    anotar('cancelar la venta REGRESA las 2 piezas', r.rows[0].stock_actual === 10,
      `quedo en ${r.rows[0].stock_actual}`);
  });

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    const r = await cliente.query(
      `select count(*) filter (where stock_actual <= stock_minimo) as bajos from producto where negocio_id=$1 and not eliminado and activo`,
      [CENTRO]);
    anotar('"productos bajos" se calcula, no se guarda a mano', Number(r.rows[0].bajos) === 0,
      'con 8 de 3 minimo no deberia estar bajo');
  });

  grupo('La caja es un libro: se escribe, no se corrige');

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    const r = await cliente.query(
      `select referencia_id, monto_centavos from movimiento_caja where origen='venta' and referencia_id=$1`, [v]);
    anotar('la venta cobrada deja UN movimiento, con su referencia',
      r.rowCount === 1 && Number(r.rows[0].monto_centavos) === 130000,
      `${r.rowCount} movimientos`);
  });

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    await cliente.query(`select cancelar_venta($1)`, [v]);
    const r = await cliente.query(
      `select coalesce(sum(case when tipo='ingreso' then monto_centavos else -monto_centavos end),0) as saldo
       from movimiento_caja where origen='venta' and referencia_id=$1`, [v]);
    anotar('cancelar AGREGA el contrario: el saldo de esa venta queda en 0',
      Number(r.rows[0].saldo) === 0, `saldo ${r.rows[0].saldo}`);
  });

  await como(DUENA, async () => {
    const e = await rechazado(() => cliente.query(
      `insert into movimiento_caja (negocio_id, tipo, origen, referencia_id, monto_centavos, descripcion)
       values ($1,'ingreso','venta',gen_random_uuid(),500000,'dinero de la nada')`, [CENTRO]));
    anotar('NO se puede meter un ingreso de venta a mano', e !== null, e ?? 'lo metio');
  });

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    const e = await rechazado(() => cliente.query(
      `update movimiento_caja set monto_centavos = 1 where referencia_id=$1`, [v]));
    anotar('NI LA DUEÑA puede editar un movimiento de caja', e !== null, e ?? 'lo edito');
  });

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    const e = await rechazado(() => cliente.query(
      `delete from movimiento_caja where referencia_id=$1`, [v]));
    anotar('ni borrarlo', e !== null, e ?? 'lo borro');
  });

  await como(DUENA, async () => {
    const r = await cliente.query(
      `insert into movimiento_caja (negocio_id, tipo, origen, monto_centavos, descripcion)
       values ($1,'ingreso','ajuste',10000,'sobrante del turno') returning id`, [CENTRO]);
    anotar('un AJUSTE manual si se puede, y queda marcado como ajuste', r.rowCount === 1);
  });

  grupo('Gastos que alimentan la caja solos');

  await como(DUENA, async () => {
    const g = await cliente.query(
      `insert into gasto (negocio_id, descripcion, monto_centavos) values ($1,'Renta',500000) returning id`, [CENTRO]);
    const r = await cliente.query(
      `select tipo, monto_centavos from movimiento_caja where origen='gasto' and referencia_id=$1`, [g.rows[0].id]);
    anotar('registrar un gasto crea su egreso en caja, sin pedirlo',
      r.rowCount === 1 && r.rows[0].tipo === 'egreso', `${r.rowCount} movimientos`);
  });

  await como(DUENA, async () => {
    const g = await cliente.query(
      `insert into gasto (negocio_id, descripcion, monto_centavos) values ($1,'Error',100000) returning id`, [CENTRO]);
    await cliente.query(`update gasto set eliminado=true where id=$1`, [g.rows[0].id]);
    const r = await cliente.query(
      `select coalesce(sum(case when tipo='ingreso' then monto_centavos else -monto_centavos end),0) as saldo
       from movimiento_caja where origen='gasto' and referencia_id=$1`, [g.rows[0].id]);
    anotar('anular el gasto lo netea en caja, sin borrar nada',
      Number(r.rows[0].saldo) === 0, `saldo ${r.rows[0].saldo}`);
  });

  grupo('La agenda no acepta datos imposibles');

  await como(DUENA, async () => {
    const e = await rechazado(() => cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, fecha, hora_inicio, hora_fin)
       values ($1,$2,$3,current_date,'10:00','10:00')`, [CENTRO, clienteId, servicioId]));
    // El disparador recalcula la hora de fin desde la duracion del servicio:
    // no la deja igual a la de inicio, la corrige.
    const r = await cliente.query(
      `select hora_inicio, hora_fin from cita where negocio_id=$1 order by creado_en desc limit 1`, [CENTRO]);
    anotar('la hora de fin se CALCULA desde la duracion del servicio',
      e === null && r.rows[0]?.hora_fin === '11:00:00', `quedo ${r.rows[0]?.hora_fin}`);
  });

  await como(DUENA, async () => {
    const e = await rechazado(() => cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, fecha, hora_inicio, hora_fin)
       values ($1,$2,$3,current_date,'10:00','11:00')`, [CENTRO, clienteOtro, servicioId]));
    anotar('NO se agenda a un paciente de otro centro', e !== null, e ?? 'lo agendo');
  });

  await como(DUENA, async () => {
    const e = await rechazado(() => cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, fecha, hora_inicio, hora_fin)
       values ($1,$2,$3,current_date,'10:00','11:00')`, [CENTRO, clienteId, servicioOtro]));
    anotar('NI con un servicio de otro centro', e !== null, e ?? 'lo agendo');
  });

  await como(DUENA, async () => {
    const e = await rechazado(() => cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,current_date,'10:00','11:00','inventado')`, [CENTRO, clienteId, servicioId]));
    anotar('NO se inventa un estado de cita fuera de los cinco', e !== null, e ?? 'lo acepto');
  });

  await como(DUENA, async () => {
    const e = await rechazado(() => cliente.query(`delete from cliente where id=$1`, [clienteId]));
    const n = await cuantos(`select * from cliente where id=$1`, [clienteId]);
    anotar('un expediente NO se borra de verdad: se marca eliminado',
      e !== null || n === 1, 'desaparecio');
  });

  grupo('La licencia suspendida detiene la escritura, no la lectura');

  await como(DUENA, async () => {
    await cliente.query('set local role postgres');
    await cliente.query(
      `insert into licencia (negocio_id, estado) values ($1,'suspendida')
       on conflict (negocio_id) do update set estado='suspendida'`, [CENTRO]);
    await cliente.query('set local role authenticated');
    const e = await rechazado(() => cliente.query(
      `insert into cliente (negocio_id, nombre) values ($1,'Nuevo')`, [CENTRO]));
    anotar('con licencia suspendida NO se dan de alta pacientes', e !== null, e ?? 'lo dio de alta');
    const n = await cuantos(`select * from cliente where negocio_id=$1`, [CENTRO]);
    anotar('pero SI se leen los que ya estaban: sus datos no se secuestran', n > 0, `vio ${n}`);
  });

  grupo('La agenda no deja encimar dos citas');

  await como(DUENA, async () => {
    await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-03-10','09:00','10:00','confirmada')`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    const e = await rechazado(() => cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-03-10','09:30','10:30','confirmada')`,
      [CENTRO, clienteId, servicioId, membresiaDuena]));
    anotar('la MISMA terapeuta no puede tener dos citas encimadas', e !== null, e ?? 'las acepto');
  });

  await como(DUENA, async () => {
    await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-03-11','09:00','10:00','confirmada')`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    const r = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-03-11','09:30','10:30','confirmada') returning id`,
      [CENTRO, clienteId, servicioId, membresiaRecepcion]);
    // Dos terapeutas SI pueden atender a la misma hora. Tratarlo como
    // conflicto obligaria a un centro con dos salas a trabajar como si
    // tuviera una.
    anotar('pero DOS terapeutas distintas si atienden a la misma hora', r.rowCount === 1);
  });

  await como(DUENA, async () => {
    await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-03-12','09:00','10:00','confirmada')`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    const r = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-03-12','10:00','11:00','confirmada') returning id`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    // Pegada no es encimada: 10:00 empieza justo cuando la otra termina.
    anotar('una cita pegada a la anterior SI entra', r.rowCount === 1);
  });

  await como(DUENA, async () => {
    const v = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-03-13','09:00','10:00','confirmada') returning id`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    await cliente.query(`select cambiar_estado_cita($1,'cancelada','se enfermo')`, [v.rows[0].id]);
    const r = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-03-13','09:00','10:00','confirmada') returning id`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    anotar('cancelar LIBERA el horario de inmediato', r.rowCount === 1);
  });

  await como(DUENA, async () => {
    const v = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-03-14','09:00','10:00','confirmada') returning id`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    await cliente.query(`select cambiar_estado_cita($1,'cancelada')`, [v.rows[0].id]);
    const n = await cuantos(`select * from cita where id=$1`, [v.rows[0].id]);
    anotar('y la cita cancelada SE QUEDA en el historial', n === 1);
  });

  await como(DUENA, async () => {
    const v = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-03-15','09:00','10:00','confirmada') returning id`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    await cliente.query(`select cambiar_estado_cita($1,'cancelada')`, [v.rows[0].id]);
    const e = await rechazado(() =>
      cliente.query(`select cambiar_estado_cita($1,'confirmada')`, [v.rows[0].id]));
    anotar('una cita cancelada NO revive', e !== null, e ?? 'revivio');
  });

  await como(DUENA, async () => {
    const e = await rechazado(() => cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, fecha, hora_inicio, hora_fin)
       values ($1,$2,$3,'2027-03-16','10:00','09:00')`, [CENTRO, clienteId, servicioId]));
    // El disparador recalcula la hora de fin desde la duracion del servicio,
    // asi que una cita al reves nunca llega a guardarse mal.
    const r = await cliente.query(
      `select hora_fin from cita where fecha='2027-03-16'`);
    anotar('una cita que termina antes de empezar se corrige sola',
      e === null && r.rows[0]?.hora_fin === '11:00:00', JSON.stringify(r.rows[0]));
  });

  grupo('Reagendar mueve la cita, no la duplica');

  await como(DUENA, async () => {
    const v = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-04-01','09:00','10:00','confirmada') returning id`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    await cliente.query(`select reagendar_cita($1,'2027-04-05','15:00')`, [v.rows[0].id]);
    const n = await cuantos(`select * from cita where cliente_id=$1 and fecha in ('2027-04-01','2027-04-05')`, [clienteId]);
    anotar('reagendar deja UNA cita, no dos', n === 1, `quedaron ${n}`);
  });

  await como(DUENA, async () => {
    const v = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-04-02','09:00','10:00','confirmada') returning id`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    await cliente.query(`select reagendar_cita($1,'2027-04-06','15:00',null,'la paciente lo pidio')`, [v.rows[0].id]);
    const r = await cliente.query(
      `select antes, despues, motivo from auditoria where entidad=$1 and accion='reagendar'`, [v.rows[0].id]);
    anotar('y queda firmado en la bitacora, con el antes y el despues',
      r.rowCount === 1 && r.rows[0].antes.fecha === '2027-04-02' && r.rows[0].despues.fecha === '2027-04-06',
      JSON.stringify(r.rows[0]));
  });

  await como(DUENA, async () => {
    const v = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-04-03','09:00','10:00','confirmada') returning id`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    await cliente.query(`select reagendar_cita($1,'2027-04-07','15:00')`, [v.rows[0].id]);
    const r = await cliente.query(`select hora_fin from cita where id=$1`, [v.rows[0].id]);
    // Si arrastrara la hora de fin anterior, mover una cita de 90 minutos la
    // dejaria de 30 sin que nadie lo note.
    anotar('la hora de fin se recalcula desde la duracion del servicio',
      r.rows[0].hora_fin === '16:00:00', r.rows[0].hora_fin);
  });

  await como(RECEPCION, async () => {
    await cliente.query('set local role postgres');
    const v = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-04-20','09:00','10:00','confirmada') returning id`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    await cliente.query('set local role authenticated');
    // `to_char` en la consulta, no `String()` en JavaScript: el controlador
    // devuelve un Date y compararlo como texto da la fecha en otro formato
    // —y peor, corrida un dia segun la zona horaria de la maquina.
    const r = await cliente.query(
      `select to_char((reagendar_cita($1,'2027-04-21','11:00')).fecha, 'YYYY-MM-DD') as f`,
      [v.rows[0].id]);
    anotar('la recepcionista SI puede mover citas: es su trabajo',
      r.rows[0].f === '2027-04-21', r.rows[0].f);
  });

  await como(DUENO_OTRO, async () => {
    await cliente.query('set local role postgres');
    const v = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,'2027-04-30','09:00','10:00','confirmada') returning id`,
      [CENTRO, clienteId, servicioId]);
    await cliente.query('set local role authenticated');
    const e = await rechazado(() => cliente.query(`select reagendar_cita($1,'2027-05-01','11:00')`, [v.rows[0].id]));
    anotar('NO se puede mover una cita de otro centro', e !== null, e ?? 'la movio');
  });

  grupo('La agenda se lee entera de un viaje');

  await como(DUENA, async () => {
    const r = await cliente.query(`select citas_del_rango($1,'2027-06-01','2027-06-30') as x`, [CENTRO]);
    anotar('un rango sin citas devuelve una lista vacia, no nulo',
      Array.isArray(r.rows[0].x) && r.rows[0].x.length === 0, JSON.stringify(r.rows[0].x));
  });

  await como(DUENA, async () => {
    await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-06-10','09:00','10:00','confirmada')`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    const r = await cliente.query(`select citas_del_rango($1,'2027-06-01','2027-06-30') as x`, [CENTRO]);
    const c = r.rows[0].x[0];
    // El nombre se RESUELVE al leer. No hay ninguna copia guardada dentro de
    // la cita que pueda quedarse vieja.
    anotar('trae el nombre del paciente resuelto desde su ficha',
      c?.cliente === 'Paciente Del Centro', JSON.stringify(c));
    anotar('y el servicio con su duracion', c?.servicio === 'Reiki' && c?.servicioMinutos === 60);
    anotar('y la terapeuta que atiende', c?.profesional === 'Duena');
  });

  await como(DUENA, async () => {
    await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2027-07-10','09:00','10:00','confirmada')`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    await cliente.query(`update cliente set nombre='Se Cambio El Apellido' where id=$1`, [clienteId]);
    const r = await cliente.query(`select citas_del_rango($1,'2027-07-01','2027-07-31') as x`, [CENTRO]);
    // Esta es la prueba que justifica no copiar nombres: cambiar la ficha se
    // refleja en TODA la agenda, incluidas las citas de hace meses.
    anotar('cambiar el nombre en la ficha cambia la agenda entera',
      r.rows[0].x[0]?.cliente === 'Se Cambio El Apellido', JSON.stringify(r.rows[0].x[0]));
  });

  await como(DUENO_OTRO, async () => {
    const r = await cliente.query(`select citas_del_rango($1,'2020-01-01','2030-12-31') as x`, [CENTRO]);
    anotar('desde otro centro la agenda ajena viene VACIA',
      Array.isArray(r.rows[0].x) && r.rows[0].x.length === 0, JSON.stringify(r.rows[0].x));
  });

  grupo('El historial del paciente se calcula, no se guarda');

  await como(DUENA, async () => {
    for (const [f, e] of [['2027-01-05','completada'],['2027-01-06','completada'],
                          ['2027-01-07','cancelada'],['2027-01-08','no_asistio']] as const) {
      await cliente.query(
        `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
         values ($1,$2,$3,$4,$5,'09:00','10:00',$6)`,
        [CENTRO, clienteId, servicioId, membresiaDuena, f, e]);
    }
    const r = await cliente.query(`select historial_del_cliente($1) as x`, [clienteId]);
    const h = r.rows[0].x;
    anotar('cuenta las COMPLETADAS, no todas', Number(h.completadas) === 2, JSON.stringify(h));
    anotar('y separa canceladas de no asistio: para el negocio no son lo mismo',
      Number(h.canceladas) === 1 && Number(h.noAsistio) === 1, JSON.stringify(h));
  });

  await como(DUENA, async () => {
    await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha, hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4,'2028-02-10','11:00','12:00','confirmada'),
              ($1,$2,$3,$4,'2028-03-10','11:00','12:00','confirmada')`,
      [CENTRO, clienteId, servicioId, membresiaDuena]);
    const r = await cliente.query(`select historial_del_cliente($1,'2028-01-01'::timestamptz) as x`, [clienteId]);
    anotar('la proxima cita es la MAS CERCANA en el futuro',
      r.rows[0].x.proxima?.fecha === '2028-02-10', JSON.stringify(r.rows[0].x.proxima));
  });

  await como(DUENA, async () => {
    const r = await cliente.query(`select historial_del_cliente($1,'2099-01-01'::timestamptz) as x`, [clienteId]);
    anotar('sin citas futuras, la proxima viene NULA — no se inventa una',
      r.rows[0].x.proxima === null, JSON.stringify(r.rows[0].x.proxima));
  });

  grupo('Controles positivos — que el centro pueda trabajar');

  await como(DUENA, async () => {
    const r = await cliente.query(
      `insert into cliente (negocio_id, nombre, telefono) values ($1,'Paciente Nuevo','6469998877') returning id`, [CENTRO]);
    anotar('la dueña SI da de alta un paciente', r.rowCount === 1);
  });

  await como(RECEPCION, async () => {
    const r = await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, fecha, hora_inicio, hora_fin)
       values ($1,$2,$3,current_date,'09:00','10:00') returning id`, [CENTRO, clienteId, servicioId]);
    anotar('la recepcionista SI agenda una cita', r.rowCount === 1);
  });

  await como(RECEPCION, async () => {
    const n = await cuantos(`select * from cliente where negocio_id=$1`, [CENTRO]);
    anotar('la recepcionista SI ve a los pacientes: los necesita', n > 0, `vio ${n}`);
  });

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    const r = await cliente.query(`select (cobrar_venta($1)).estado as e`, [v]);
    anotar('la dueña SI cobra una venta', r.rows[0].e === 'cobrada');
  });

  await como(DUENA, async () => {
    const v = await ventaEnBorrador();
    await cliente.query(`select cobrar_venta($1)`, [v]);
    const r = await cliente.query(`select resumen_inicio($1) as x`, [CENTRO]);
    const x = r.rows[0].x;
    anotar('el tablero le da el total del dia calculado', Number(x.ventasHoy) === 130000,
      `le dio ${x.ventasHoy}`);
    anotar('y el ranking sale de las ventas reales, no de un contador',
      Array.isArray(x.topServicios) && x.topServicios[0]?.nombre === 'Reiki',
      JSON.stringify(x.topServicios));
    anotar('la grafica trae los siete dias, con ceros de verdad',
      Array.isArray(x.ingresosSemana) && x.ingresosSemana.length === 7,
      `${x.ingresosSemana?.length} dias`);
  });

  await como(DUENA, async () => {
    const r = await cliente.query(`select resumen_inicio($1) as x`, [CENTRO]);
    anotar('sin ventas ayer, la comparacion viene NULA, no en infinito',
      r.rows[0].x.ventasAyer === null, `vino ${r.rows[0].x.ventasAyer}`);
  });

  await como(DUENO_OTRO, async () => {
    const e = await rechazado(() => cliente.query(`select resumen_inicio($1)`, [CENTRO]));
    anotar('NO se puede pedir el tablero de otro centro', e !== null, e ?? 'se lo dio');
  });

  await como(null, async () => {
    const n = await cuantos(`select * from cliente`);
    anotar('sin sesion no se ve absolutamente nada', n === 0, `vio ${n}`);
  });
}

/* Salida ---------------------------------------------------------------- */

async function principal(): Promise<void> {
  await cliente.connect();
  try {
    await aplicarEsquema();
    await sembrar();
    try {
      await correr();
    } catch (e) {
      // El grupo y la cuenta importan: sin ellos, un fallo a mitad del ensayo
      // solo dice "reviento" y hay que ir a buscarlo a mano.
      console.error(`  REVENTO en el grupo "${grupoActual}" despues de ${resultados.length} pruebas:`);
      console.error(`  ${(e as Error).message}`);
      throw e;
    }
  } finally {
    await restaurarReglas();
    await cliente.end();
  }

  let ultimo = '';
  let fallaron = 0;
  for (const r of resultados) {
    if (r.grupo !== ultimo) { console.log(`  ${r.grupo}`); ultimo = r.grupo; }
    if (r.paso) {
      console.log(`    ok   ${r.titulo}`);
    } else {
      fallaron += 1;
      console.log(`    MAL  ${r.titulo}${r.detalle ? ` — ${r.detalle}` : ''}`);
    }
  }

  console.log('');
  if (SIN_REGLAS) {
    console.log(`  CONTROL NEGATIVO: ${fallaron} de ${resultados.length} ataques TIENEN EXITO sin las reglas.`);
    console.log('  Eso es lo que prueba que las pruebas sirven: si aqui no fallara nada,');
    console.log('  significaria que las reglas no son las que estan deteniendo los ataques.');
    process.exit(0);
  }
  if (fallaron > 0) {
    console.log(`  ${fallaron} ATAQUES TUVIERON EXITO. No se publica.`);
    process.exit(1);
  }
  console.log(`  ${resultados.length} ataques rechazados. Las reglas estan puestas y muerden.`);
}

principal().catch((e) => {
  console.error(`  No se pudieron correr los ataques: ${(e as Error).message}`);
  process.exit(1);
});
