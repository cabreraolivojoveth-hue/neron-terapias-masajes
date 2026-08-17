-- =====================================================================
-- PARTE 6 DE 6 — pegar en Supabase -> SQL Editor -> Run
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
-- ESTA ES LA ULTIMA. Con esta ya esta todo.
--
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

