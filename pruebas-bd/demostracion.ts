/**
 * EL ENSAYO DE LA DEMOSTRACION — contra una Postgres de verdad.
 *
 *   DATABASE_URL=postgres://... npx tsx pruebas-bd/demostracion.ts
 *
 * POR QUE EXISTE, Y QUE COSTO NO TENERLO.
 *
 * `cargar_datos_de_demostracion` son mil setecientas lineas de plpgsql, y
 * **Postgres no valida el cuerpo de una funcion plpgsql al crearla**: el SQL se
 * aplica sin una queja y el primer error aparece cuando alguien aprieta el
 * boton. La primera version se publico "verde" —tipos, dieciocho guardias, dos
 * mil pruebas, velos, alcance y compilacion— y aun asi fallo tres veces
 * seguidas en la cara de quien la estrenaba:
 *
 *   1. `duplicate key ... "sesion_caja_una_abierta"` — el centro ya tenia una
 *      caja abierta y la demostracion abre y cierra la de cada dia.
 *   2. `null value in column "servicio_id"` — `random()` dentro de un `where`
 *      es VOLATIL y se evalua una vez por fila: la consulta se quedaba sin
 *      devolver nada y `select into` deja las variables en nulo sin quejarse.
 *   3. `violates RESTRICT ... "venta_cliente_mismo_negocio"` — al quitarla, un
 *      paciente sembrado con una venta cobrada encima no se puede borrar.
 *
 * Las tres se ven en el primer segundo de ESTE ensayo. Ninguna se ve leyendo.
 *
 * NO CORRE CONTRA SUPABASE, y se niega en redondo: sembraria cinco meses de
 * pacientes inventados en el centro de alguien. Va contra una Postgres local
 * —o una embebida de usar y tirar— sobre una base VACIA, porque aplica los dos
 * instaladores enteros.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const RAIZ = join(import.meta.dirname, '..');
const CADENA = process.env.DATABASE_URL ?? '';
const BASE = process.env.NERON_BASE ?? join(RAIZ, '..', 'base-neronprogramas');

const CENTRO = 't_ensayo_demo';
const DUENA = '11111111-1111-4111-8111-111111111111';
/** El mismo que comprueba `app.correo_de_demostracion()`. */
const CORREO = 'cabreraolivojoveth@gmail.com';

/*
 * SE SALTA EN VEZ DE FALLAR, y las dos razones son distintas:
 *
 *   · Sin DATABASE_URL no hay donde correrlo, igual que los ataques.
 *   · CON la de Supabase, correrlo seria sembrar cinco meses de pacientes
 *     inventados en el centro de verdad. Eso no se hace ni preguntando.
 *
 * Se dice en voz alta las dos veces: un paso que se salta callado es un paso
 * que nadie vuelve a correr.
 */
if (!CADENA || /supabase\.(co|com|in)/i.test(CADENA)) {
  console.log('  EL ENSAYO DE LA DEMOSTRACION NO CORRIO.');
  console.log(CADENA
    ? '  DATABASE_URL apunta a Supabase, y este ensayo siembra cinco meses de datos'
    : '  Falta DATABASE_URL.');
  console.log(CADENA
    ? '  inventados: solo corre contra una Postgres LOCAL y vacia.'
    : '  Necesita una Postgres LOCAL y vacia: aplica los dos instaladores enteros.');
  console.log('  Es el unico paso que EJECUTA el cuerpo de cargar_datos_de_demostracion.');
  process.exit(0);
}

const cliente = new pg.Client({ connectionString: CADENA });

let malas = 0;
const ok = (que: string, bien: boolean, detalle = ''): void => {
  console.log(`    ${bien ? 'ok  ' : 'MAL '} ${que}${detalle ? ` — ${detalle}` : ''}`);
  if (!bien) malas += 1;
};

/**
 * Lo que Supabase pone y una Postgres pelada no tiene.
 *
 * `alter default privileges ... grant all` NO es un adorno: es lo que hace que
 * cada tabla nueva nazca con los siete permisos, incluido `truncate`. Sin
 * reproducirlo aqui, la comprobacion de que el instalador se los quita no
 * comprobaria nada.
 */
const PREAMBULO = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $x$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $x$;
create or replace function auth.jwt() returns jsonb language sql stable as $x$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $x$;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

/** Corre algo COMO la cuenta de demostracion, con su correo en el token. */
async function como<T>(sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  await cliente.query('begin');
  await cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: DUENA, email: CORREO, role: 'authenticated' }),
  ]);
  await cliente.query('set local role authenticated');
  try {
    const r = await cliente.query(sql, params);
    await cliente.query('commit');
    return r;
  } catch (e) {
    await cliente.query('rollback');
    throw e;
  }
}

const uno = async (sql: string, params: unknown[] = []): Promise<Record<string, number>> =>
  (await cliente.query(sql, params)).rows[0];

async function principal(): Promise<void> {
  await cliente.connect();
  await cliente.query(PREAMBULO);
  await cliente.query(readFileSync(join(BASE, 'INSTALAR-EN-SUPABASE.sql'), 'utf8'));
  await cliente.query(readFileSync(join(RAIZ, 'INSTALAR-EN-TERAPIAS.sql'), 'utf8'));

  await cliente.query('delete from negocio where id = $1', [CENTRO]);
  await cliente.query(
    `insert into negocio (id, nombre, producto) values ($1,'Centro Holistico','terapias')`, [CENTRO]);
  await cliente.query(`insert into estado (negocio_id, data) values ($1,'{}')`, [CENTRO]);
  await cliente.query(
    `insert into rol (negocio_id, id, etiqueta, permisos) values ($1,'dueno','Duena','{}'::jsonb)`, [CENTRO]);
  await cliente.query(
    `insert into membresia (negocio_id, usuario_id, correo, nombre, rol, activo)
     values ($1,$2,$3,'Quien ensena','dueno',true)`, [CENTRO, DUENA, CORREO]);

  /*
   * EL CENTRO NO ESTA VACIO, Y ESA ES LA PRUEBA.
   *
   * La primera version de este ensayo sembraba sobre una base recien creada y
   * salia verde; en el centro de verdad —que llevaba semanas usandose— la carga
   * murio en el paso 8:
   *
   *   conflicting key value violates exclusion constraint "cita_sin_choque"
   *
   * Asi que aqui se ensucia el centro ANTES, con lo que cualquiera tiene
   * despues de probar el sistema: una categoria que se llama igual, un producto
   * con el mismo codigo, una automatizacion ya encendida y —lo que revento—
   * citas propias justo en los horarios que la demostracion usa.
   */
  const CHOCAN = 6;
  await cliente.query(
    `insert into categoria (negocio_id, ambito, nombre) values ($1, 'servicio', 'Masajes')`, [CENTRO]);
  await cliente.query(
    `insert into producto (negocio_id, nombre, sku, precio_centavos)
     values ($1, 'Mi producto', 'AE-LAV15', 100)`, [CENTRO]);
  await cliente.query(
    `insert into recordatorio_automatizacion (negocio_id, evento, activa, plantilla_titulo)
     values ($1, 'cita_nueva', false, 'La mia')`, [CENTRO]);
  const mio = (await cliente.query(
    `insert into cliente (negocio_id, nombre) values ($1, 'Paciente propio') returning id`,
    [CENTRO])).rows[0];
  const suServicio = (await cliente.query(
    `insert into servicio (negocio_id, nombre, duracion_min, precio_centavos)
     values ($1, 'Servicio propio', 60, 50000) returning id`, [CENTRO])).rows[0];
  const suMembresia = (await cliente.query(
    `select id from membresia where negocio_id = $1 limit 1`, [CENTRO])).rows[0];
  for (let i = 0; i < CHOCAN; i += 1) {
    await cliente.query(
      `insert into cita (negocio_id, cliente_id, servicio_id, profesional_id, fecha,
                         hora_inicio, hora_fin, estado)
       values ($1,$2,$3,$4, current_date - $5::int, '09:00', '10:00', 'confirmada')`,
      [CENTRO, mio.id, suServicio.id, suMembresia.id, i * 7 + 1]);
  }

  console.log(String.fromCharCode(10) + '  Los nueve pasos, sobre un centro QUE YA SE USABA:');
  for (let paso = 1; paso <= 9; paso += 1) {
    const r = await como(
      `select public.cargar_datos_de_demostracion($1, $2,
         current_date - ((extract(isodow from current_date)::int) - 1)) as x`, [CENTRO, paso]);
    console.log(`      ${paso}. ${r.rows[0].x.titulo} — ${r.rows[0].x.hechas}`);
  }

  console.log('\n  Lo que tiene que cuadrar:');

  const estado = (await como(`select public.datos_de_demostracion($1) as x`, [CENTRO])).rows[0].x;
  ok('la demostracion se declara completa', estado.completa === true && estado.ultimoPaso === 9);

  const citas = await uno(`select count(*)::int n, count(*) filter (where fecha > current_date)::int futuras,
      count(distinct date_trunc('month', fecha))::int meses from cita where negocio_id=$1`, [CENTRO]);
  ok('hay cinco meses de citas y tambien futuras',
    Number(citas.n) > 400 && Number(citas.futuras) > 5 && Number(citas.meses) >= 6,
    `${citas.n} citas en ${citas.meses} meses, ${citas.futuras} por venir`);

  const ventas = await uno(`select count(*)::int n, count(distinct folio)::int folios,
      sum(total_centavos)::bigint total from venta where negocio_id=$1`, [CENTRO]);
  ok('ninguna venta repite folio', ventas.n === ventas.folios, `${ventas.n} ventas`);

  const cuadre = await uno(`select count(*)::int malas from venta v where v.negocio_id=$1
     and (v.total_centavos <> (select coalesce(sum(p.monto_centavos),0) from pago p where p.venta_id=v.id)
       or v.subtotal_centavos <> (select coalesce(sum(i.subtotal_centavos),0) from venta_item i where i.venta_id=v.id))`, [CENTRO]);
  ok('cada venta cuadra con sus renglones y con lo que se pago', cuadre.malas === 0);

  const caja = await uno(`select count(*)::int n, count(*) filter (where estado='abierta')::int abiertas,
      count(*) filter (where diferencia_centavos <> 0)::int descuadres from sesion_caja where negocio_id=$1`, [CENTRO]);
  ok('queda UNA caja abierta, la del ultimo dia', caja.abiertas === 1, `${caja.abiertas} de ${caja.n}`);
  ok('y algunos cortes no cuadran, como en un mostrador', Number(caja.descuadres) > 0);

  const corte = await uno(`select count(*)::int malas from sesion_caja s
     where s.negocio_id=$1 and s.estado='cerrada'
       and s.esperado_centavos <> s.saldo_inicial_centavos + coalesce((
         select sum(case when m.tipo='ingreso' then m.monto_centavos else -m.monto_centavos end)
           from movimiento_caja m where m.sesion_id=s.id and coalesce(m.metodo,'efectivo')='efectivo'),0)`, [CENTRO]);
  ok('el esperado de cada corte es el efectivo de ese dia', corte.malas === 0);

  const inv = await uno(`select count(*) filter (where stock_actual < 0)::int negativos,
      count(*) filter (where stock_actual <> (select coalesce(sum(m.cantidad),0)
        from movimiento_inventario m where m.producto_id = p.id))::int descuadrados
      from producto p where p.negocio_id=$1`, [CENTRO]);
  ok('el stock nunca queda negativo y es la suma de sus movimientos',
    inv.negativos === 0 && inv.descuadrados === 0);

  const gastos = await uno(`select count(*)::int n, count(*) filter (where not exists (
      select 1 from movimiento_caja m where m.origen='gasto' and m.referencia_id=g.id))::int sin_caja
      from gasto g where g.negocio_id=$1`, [CENTRO]);
  // `sin_caja` en minusculas y con guion bajo A PROPOSITO: Postgres devuelve los
  // alias en minusculas, asi que un `sinCaja` llega como `sincaja` y la
  // comprobacion compara `undefined` contra cero — sale MAL con todo bien.
  ok('cada gasto movio la caja', gastos.sin_caja === 0, `${gastos.n} gastos, ${gastos.sin_caja} sin movimiento`);

  const permisos = await uno(`select
      (select count(*) from information_schema.role_table_grants
        where table_schema='public' and privilege_type='TRUNCATE'
          and grantee in ('anon','authenticated'))::int truncan`);
  ok('ninguna tabla le da truncate a una sesion', permisos.truncan === 0, `${permisos.truncan} la dan`);

  console.log('\n  Las pantallas, con los datos puestos:');
  const PANTALLAS: readonly (readonly [string, string])[] = [
    ['Inicio', `select public.resumen_inicio($1) as x`],
    ['Agenda', `select public.citas_del_rango($1, current_date - 30, current_date + 21) as x`],
    ['Clientes', `select public.clientes_del_centro($1) as x`],
    ['Servicios', `select public.servicios_del_centro($1) as x`],
    ['Cursos', `select public.cursos_del_centro($1) as x`],
    ['Productos', `select public.productos_del_centro($1) as x`],
    ['Mostrador', `select public.catalogo_vendible($1) as x`],
    ['Ventas', `select public.ventas_del_rango($1, current_date - 150, current_date) as x`],
    ['Cotizaciones', `select public.cotizaciones_del_centro($1) as x`],
    ['Caja', `select public.historial_de_cajas($1) as x`],
    ['Gastos', `select public.resumen_de_gastos($1, current_date - 150, current_date) as x`],
    ['Reportes', `select public.reporte_del_periodo($1, current_date - 150, current_date) as x`],
    ['Mensajes', `select public.conversaciones_del_centro($1) as x`],
    ['Recordatorios', `select public.recordatorios_del_centro($1, current_date) as x`],
    ['Bitacora', `select public.bitacora_del_centro($1) as x`],
    ['Exportar', `select public.exportar_del_centro($1, 'ventas') as x`],
  ];
  for (const [nombre, sql] of PANTALLAS) {
    try {
      const x = (await como(sql, [CENTRO])).rows[0]?.x;
      const texto = JSON.stringify(x ?? null);
      ok(nombre, texto !== 'null' && texto !== '[]' && texto !== '{}', `${texto.length} caracteres`);
    } catch (e) {
      ok(nombre, false, (e as Error).message);
    }
  }

  console.log('\n  Los candados:');
  const rechazado = async (sql: string, params: unknown[]): Promise<string | null> => {
    try { await como(sql, params); return null; } catch (e) { return (e as Error).message; }
  };
  ok('no se carga dos veces',
    (await rechazado(`select public.cargar_datos_de_demostracion($1, 1)`, [CENTRO])) !== null);

  await cliente.query('begin');
  await cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: DUENA, email: 'otra@correo.mx', role: 'authenticated' })]);
  await cliente.query('set local role authenticated');
  let ajena: string | null = null;
  try { await cliente.query(`select public.cargar_datos_de_demostracion($1, 1)`, [CENTRO]); }
  catch (e) { ajena = (e as Error).message; }
  await cliente.query('rollback');
  ok('otra cuenta no la carga', ajena !== null);

  console.log('\n  Y trabajando encima, se quita entera:');
  // Se cobra una venta a un paciente sembrado: es lo que hace cualquiera
  // durante una demostracion, y es lo que reventaba el borrado.
  const srv = (await cliente.query(
    `select id, precio_centavos from servicio where negocio_id=$1 order by nombre limit 1`, [CENTRO])).rows[0];
  const cli = (await cliente.query(
    `select id from cliente where negocio_id=$1 order by creado_en limit 1`, [CENTRO])).rows[0];
  await como(`select public.registrar_venta($1,
      jsonb_build_array(jsonb_build_object('tipo','servicio','id',$2::text,'cantidad',1)),
      jsonb_build_array(jsonb_build_object('metodo','tarjeta','monto',$3::bigint)), $4)`,
    [CENTRO, srv.id, srv.precio_centavos, cli.id]);
  // Y un gasto suelto, que NO cuelga de nada sembrado: ese se tiene que quedar.
  await como(`select public.registrar_gasto($1, 'Gasto propio del ensayo', 5000, 'transferencia')`, [CENTRO]);

  const quitado = (await como(`select public.quitar_datos_de_demostracion($1) as x`, [CENTRO])).rows[0].x;
  console.log(`      ${quitado.quitadas} sembradas + ${quitado.arrastradas} que crecieron encima`);

  const resto = await uno(`select
      (select count(*) from cliente where negocio_id=$1)::int clientes,
      (select count(*) from cita where negocio_id=$1)::int citas,
      (select count(*) from venta where negocio_id=$1)::int ventas,
      (select count(*) from movimiento_caja where negocio_id=$1)::int caja,
      (select count(*) from recordatorio where negocio_id=$1)::int recordatorios,
      (select count(*) from auditoria where negocio_id=$1)::int bitacora,
      (select count(*) from dato_de_demostracion where negocio_id=$1)::int rastro,
      (select count(*) from gasto where negocio_id=$1)::int gastos`, [CENTRO]);
  /*
   * LA BITACORA Y EL MOVIMIENTO DE CAJA QUE QUEDAN SON DEL ENSAYO, no de la
   * demostracion: los dejo `registrar_venta` y `registrar_gasto` al trabajar
   * encima. Y se quedan A PROPOSITO — la bitacora no la puede borrar nadie, ni
   * el servidor, que es lo unico que la hace servir para auditar. Lo que se
   * comprueba es que no quede NADA sembrado.
   */
  // Queda lo del centro: su paciente, sus seis citas y su gasto. Nada sembrado.
  ok('no queda ni una fila sembrada, ni lo que colgaba de ella',
    resto.clientes === 1 && resto.citas === CHOCAN && resto.ventas === 0 &&
    resto.recordatorios === 0 && resto.rastro === 0,
    JSON.stringify(resto));
  ok('y la bitacora conserva lo que hizo una persona, que no se borra nunca',
    resto.bitacora === 2, `${resto.bitacora} anotaciones`);
  ok('y el gasto propio se queda, que es la otra mitad de la promesa',
    resto.gastos === 1, `${resto.gastos} gastos`);

  ok('se puede volver a cargar desde cero',
    (await como(`select public.cargar_datos_de_demostracion($1, 1) as x`, [CENTRO])).rows[0].x.paso === 1);

  /* Y lo que ya tenia el centro sigue exactamente donde estaba */
  const suyo = await uno(`select
      (select count(*) from cita where negocio_id=$1 and hora_inicio = '09:00'
        and cliente_id = $2)::int citas,
      (select count(*) from cliente where negocio_id=$1 and nombre='Paciente propio')::int cliente,
      (select count(*) from categoria where negocio_id=$1 and ambito='servicio' and nombre='Masajes')::int categoria,
      (select count(*) from producto where negocio_id=$1 and sku='AE-LAV15')::int producto,
      (select count(*) from recordatorio_automatizacion where negocio_id=$1 and evento='cita_nueva'
        and plantilla_titulo='La mia')::int automatizacion`, [CENTRO, mio.id]);
  ok('las citas que ya tenia el centro siguen ahi, sin pisar ni una',
    suyo.citas === CHOCAN, `${suyo.citas} de ${CHOCAN}`);
  ok('y su categoria, su producto y su automatizacion tambien',
    suyo.cliente === 1 && suyo.categoria === 1 && suyo.producto === 1 && suyo.automatizacion === 1,
    JSON.stringify(suyo));

  await cliente.query('delete from negocio where id = $1', [CENTRO]);
  await cliente.end();

  console.log('');
  if (malas > 0) {
    console.log(`  ${malas} COMPROBACIONES MAL. No se publica.`);
    process.exit(1);
  }
  console.log('  La demostracion corre entera contra una Postgres de verdad.');
}

principal().catch(async (e) => {
  console.error(`\n  REVENTO: ${(e as Error).message}`);
  try { await cliente.end(); } catch { /* ya estaba cerrada */ }
  process.exit(1);
});
