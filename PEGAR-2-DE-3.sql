-- =====================================================================
-- PARTE 2 DE 3 — pegar en Supabase -> SQL Editor -> Run
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
-- CUANDO ESTA DIGA "Success", SIGUE CON LA PARTE 3.
--
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
