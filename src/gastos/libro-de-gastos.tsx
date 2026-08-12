/**
 * GASTOS — lo que sale del centro.
 *
 * NO ES DUEÑO DEL DINERO DEL CAJON. Registra la obligacion —cuanto, a quien,
 * de que— y la base mueve la caja si hubo efectivo. Aqui no se escribe ni un
 * movimiento de caja: si se pudiera, el dia que alguien capturara uno suelto
 * la caja dejaria de cuadrar con los gastos y nadie sabria cual creer.
 *
 * DE DONDE SALE CADA COSA:
 *   las cuatro cifras, las dos graficas y el reparto → `resumen_de_gastos`
 *   la tabla                                        → `gastos_del_rango`
 *   los recurrentes                                 → su propia consulta
 *   las categorias y los proveedores                → SUS modulos, no una copia
 *
 * TODO MIRA EL MISMO PERIODO. Cambiarlo mueve las cifras, la tabla, las dos
 * graficas, los agrupados y la comparacion a la vez. Si cada parte calculara
 * el suyo, dos numeros de la misma pantalla se contradirian.
 *
 * LOS RECURRENTES SE GENERAN AL ENTRAR, y es seguro porque la base es
 * idempotente: `(recurrente_id, periodo)` es un indice unico. Dos pestañas
 * abiertas a la vez no pueden crear dos veces la renta de agosto.
 */

import { tomarIntencion, useNavegacion } from '@neron/base/marco';
import { hoy as hoyDe, type Fecha } from '@neron/base/utils';
import { Confirmacion } from '@neron/base/ui';
import { useEffect, useMemo, useState } from 'react';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  archivarCategoria,
  guardarCategoria,
  llaveDeCategorias,
  traerCategorias,
  type Categoria,
  type DatosDeCategoria,
} from '../datos/categorias.js';
import { llaveDeProveedores, traerProveedores, type ProveedorEnLista } from '../datos/productos.js';
import { llaveDeLaCaja, traerCajaAbierta } from '../datos/caja.js';
import { PREFIJO_DE_INICIO } from '../datos/tablero.js';
import {
  GASTO_VACIO,
  LO_QUE_TOCA_UN_GASTO,
  anularGasto,
  editarGasto,
  generarRecurrentes,
  guardarRecurrente,
  llaveDeGastos,
  llaveDelResumenDeGastos,
  llaveDeRecurrentes,
  marcarRecurrente,
  registrarGasto,
  traerGastos,
  traerRecurrentes,
  traerResumenDeGastos,
  type DatosDeGasto,
  type EstadoDeRecurrente,
  type GastoEnLista,
  type GastoRecurrente,
  type ResumenDeGastos,
} from '../datos/gastos.js';
import { useSesion } from '../identidad/sesion.js';
import { AdministrarCategorias } from '../ui/administrar-categorias.js';
import { Icono } from '../ui/iconos.js';
import { CifrasDeGastos } from './cifras-de-gastos.js';
import { FormularioDeGasto, centavosAPesos, pesosACentavos } from './formulario-de-gasto.js';
import { GastosPorCategoria, GastosPorDia } from './graficas-de-gastos.js';
import { PanelDelGasto } from './panel-del-gasto.js';
import { Recurrentes } from './recurrentes.js';
import {
  FILTROS_VACIOS,
  PESTANAS_DE_GASTOS,
  TablaDeGastos,
  ListaAgrupada,
  agruparPorCategoria,
  agruparPorMetodo,
  filtrarGastos,
  type ColumnaDeOrden,
  type FiltrosDeGastos,
  type PestanaDeGastos,
} from './tabla-de-gastos.js';
import { aISO, periodosDeGasto, type ClaveDePeriodoDeGasto } from './periodos.js';

/** Lo que se pone en el archivo que se descarga. */
export function comoCsv(gastos: readonly GastoEnLista[]): string {
  const cabeceras = [
    'Fecha', 'Concepto', 'Descripcion', 'Categoria', 'Metodo', 'Monto', 'Efectivo',
    'Proveedor', 'Referencia', 'Registro', 'Estado',
  ];
  /*
   * LAS COMILLAS SE DUPLICAN Y TODO VA ENTRECOMILLADO. Un concepto con una
   * coma —"Renta, agosto"— parte la fila en dos y el archivo entero se
   * descuadra a partir de ahi. Es el fallo clasico de exportar a mano.
   */
  const escapar = (v: string | number | null): string =>
    `"${String(v ?? '').replace(/"/g, '""')}"`;

  const filas = gastos.map((g) =>
    [
      g.fecha, g.concepto, g.detalle ?? '', g.categoria ?? '', g.metodo,
      (g.montoCentavos / 100).toFixed(2), (g.efectivoCentavos / 100).toFixed(2),
      g.proveedor ?? '', g.referencia ?? '', g.usuario ?? '',
      g.anulado ? 'Anulado' : 'Registrado',
    ].map(escapar).join(','),
  );

  return [cabeceras.map(escapar).join(','), ...filas].join('\n');
}

export function LibroDeGastos() {
  const { acceso } = useSesion();
  const { ir } = useNavegacion();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  // GESTIONAR GASTOS ES DE QUIEN VE FINANZAS, igual que la regla de fila de la
  // base. Esconder el boton es cortesia; la regla es el permiso.
  const puedeGestionar = permisos['verFinanzas'] === true;

  const [hoy] = useState<Fecha>(() => hoyDe());
  const periodos = useMemo(() => periodosDeGasto(hoy), [hoy]);

  const [clave, setClave] = useState<ClaveDePeriodoDeGasto>('esteMes');
  const [desdeLibre, setDesdeLibre] = useState<Fecha>(hoy);
  const [hastaLibre, setHastaLibre] = useState<Fecha>(hoy);

  const periodo = periodos.find((p) => p.clave === clave);
  const desde = periodo ? periodo.desde : desdeLibre;
  const hasta = periodo ? periodo.hasta : hastaLibre;

  const [pestana, setPestana] = useState<PestanaDeGastos>('todos');
  const [filtros, setFiltros] = useState<FiltrosDeGastos>(FILTROS_VACIOS);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [columna, setColumna] = useState<ColumnaDeOrden>('fecha');
  const [descendente, setDescendente] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [abierto, setAbierto] = useState<string | null>(null);

  const [formulario, setFormulario] = useState<{
    id: string | null;
    datos: DatosDeGasto;
  } | null>(null);
  const [montoEscrito, setMontoEscrito] = useState('');
  const [efectivoEscrito, setEfectivoEscrito] = useState('');
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [aAnular, setAAnular] = useState<GastoEnLista | null>(null);
  const [motivo, setMotivo] = useState('');
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false);

  /* --- Lo que se le pide al servidor -------------------------------- */

  const gastos = useConsulta<GastoEnLista[]>(
    negocio ? llaveDeGastos(negocio, desde, hasta) : null,
    () => traerGastos(negocio, desde, hasta, true),
  );

  const resumen = useConsulta<ResumenDeGastos>(
    negocio ? llaveDelResumenDeGastos(negocio, desde, hasta) : null,
    () => traerResumenDeGastos(negocio, desde, hasta),
  );

  const recurrentes = useConsulta<GastoRecurrente[]>(
    negocio ? llaveDeRecurrentes(negocio) : null,
    () => traerRecurrentes(negocio),
  );

  // LAS CATEGORIAS Y LOS PROVEEDORES SALEN DE SUS MODULOS. Gastos no mantiene
  // copias: el dia que se renombre un proveedor, aqui se ve renombrado.
  const categorias = useConsulta<Categoria[]>(
    negocio ? llaveDeCategorias(negocio, 'gasto') : null,
    () => traerCategorias(negocio, 'gasto'),
  );

  const proveedores = useConsulta<ProveedorEnLista[]>(
    negocio ? llaveDeProveedores(negocio) : null,
    () => traerProveedores(negocio),
  );

  const caja = useConsulta(
    negocio ? llaveDeLaCaja(negocio) : null,
    () => traerCajaAbierta(negocio),
  );

  /*
   * LOS RECURRENTES QUE YA TOCABAN SE CREAN AL ENTRAR.
   *
   * Es seguro llamarlo cada vez: la unicidad la pone un indice de la base, no
   * esta linea. Sin esto, la renta de agosto solo existiria si alguien
   * abriera la pantalla el dia exacto — que es justo lo que un recurrente
   * viene a evitar.
   */
  useEffect(() => {
    if (!negocio || !puedeGestionar) return;
    let vivo = true;
    void generarRecurrentes(negocio)
      .then((cuantos) => {
        if (vivo && cuantos > 0) {
          gastos.recargar();
          resumen.recargar();
          recurrentes.recargar();
        }
      })
      // Un fallo aqui no puede tumbar la pantalla: los gastos ya capturados se
      // ven igual. El caso normal es que no haya caja abierta para uno en
      // efectivo, y eso se resuelve solo cuando la abran.
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // Solo al entrar y al cambiar de centro: no en cada repintado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocio, puedeGestionar]);

  /* --- El recado que llega de otro modulo --------------------------- */

  useEffect(() => {
    const recado = tomarIntencion('gastos');
    if (recado?.accion === 'nuevo' && puedeGestionar) abrirNuevo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Las operaciones ---------------------------------------------- */

  const alta = useOperacion(
    (d: DatosDeGasto) => registrarGasto(negocio, d),
    LO_QUE_TOCA_UN_GASTO,
  );
  const cambio = useOperacion(
    (id: string, d: DatosDeGasto) => editarGasto(id, d),
    LO_QUE_TOCA_UN_GASTO,
  );
  const anulacion = useOperacion(
    (id: string, m: string) => anularGasto(id, m),
    LO_QUE_TOCA_UN_GASTO,
  );
  const recurrente = useOperacion(
    (id: string, estado: EstadoDeRecurrente) => marcarRecurrente(id, estado),
    LO_QUE_TOCA_UN_GASTO,
  );
  const categoria = useOperacion(
    (id: string | null, d: DatosDeCategoria) => guardarCategoria(negocio, 'gasto', id, d),
    ['categorias', 'gastos', PREFIJO_DE_INICIO],
  );
  const archivo = useOperacion((id: string) => archivarCategoria(id),
    ['categorias', 'gastos', PREFIJO_DE_INICIO]);

  /* --- Lo que se ve ------------------------------------------------- */

  const lista = gastos.datos ?? [];
  const filtrados = useMemo(() => filtrarGastos(lista, filtros), [lista, filtros]);
  const usuarios = useMemo(
    () => [...new Set(lista.map((g) => g.usuario).filter((u): u is string => u !== null))].sort(),
    [lista],
  );
  const elAbierto = lista.find((g) => g.id === abierto) ?? null;
  const cargando = gastos.estado === 'cargando' && gastos.datos === null;

  function abrirNuevo(): void {
    setFormulario({ id: null, datos: { ...GASTO_VACIO, fecha: hoy } });
    setMontoEscrito('');
    setEfectivoEscrito('');
    setMostrarErrores(false);
    alta.limpiarError();
    cambio.limpiarError();
  }

  function abrirEdicion(g: GastoEnLista, duplicando = false): void {
    setFormulario({
      // Duplicar parte de los mismos datos pero SIN id: crea uno nuevo en vez
      // de encadenar una correccion al original.
      id: duplicando ? null : g.id,
      datos: {
        concepto: duplicando ? `${g.concepto} (copia)` : g.concepto,
        detalle: g.detalle ?? '',
        montoCentavos: g.montoCentavos,
        metodo: g.metodo,
        efectivoCentavos: g.efectivoCentavos,
        metodoResto: g.metodoResto,
        // Una copia se captura HOY; una edicion conserva su fecha.
        fecha: duplicando ? hoy : g.fecha,
        categoriaId: g.categoriaId ?? '',
        proveedorId: g.proveedorId ?? '',
        referencia: g.referencia ?? '',
        notas: g.notas ?? '',
      },
    });
    setMontoEscrito(centavosAPesos(g.montoCentavos));
    setEfectivoEscrito(g.metodo === 'mixto' ? centavosAPesos(g.efectivoCentavos) : '');
    setMostrarErrores(false);
    alta.limpiarError();
    cambio.limpiarError();
  }

  async function guardar(): Promise<void> {
    if (!formulario) return;
    setMostrarErrores(true);
    const { loQueFaltaDelGasto } = await import('../datos/gastos.js');
    if (Object.keys(loQueFaltaDelGasto(formulario.datos)).length > 0) return;

    if (formulario.id === null) {
      const id = await alta.ejecutar(formulario.datos);
      if (id) {
        setFormulario(null);
        setAbierto(String(id));
      }
      return;
    }
    // Editar devuelve un id NUEVO: el viejo queda anulado en el historial. Sin
    // seguirlo, quien tenia abierto el detalle se quedaria mirando un anulado.
    const id = await cambio.ejecutar(formulario.id, formulario.datos);
    if (id) {
      setFormulario(null);
      setAbierto(String(id));
    }
  }

  function exportar(): void {
    /*
     * SE EXPORTA LO QUE SE VE, no la tabla entera: el archivo respeta el
     * periodo, el buscador y los filtros. Descargar 340 renglones cuando en
     * pantalla hay 12 hace que el archivo no cuadre con lo que se estaba
     * mirando, y quien lo abre no sabe cual de los dos es el bueno.
     */
    const csv = comoCsv(filtrados);
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos-${aISO(desde)}-a-${aISO(hasta)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hayCajaAbierta = caja.datos !== null && caja.datos !== undefined;

  return (
    <div className="cli srv gto mv-pantalla">
      <header className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">Gastos</h2>
          <p className="tt-lema">Registra y controla los gastos de tu centro</p>
        </div>
        <div className="pz-encabezado__acciones">
          <label className="pz-campo pz-campo--corto">
            <span className="neron-solo-lectores">Periodo</span>
            <select
              value={clave}
              onChange={(e) => {
                setClave(e.target.value as ClaveDePeriodoDeGasto);
                setPagina(1);
              }}
            >
              {periodos.map((p) => (
                <option key={p.clave} value={p.clave}>
                  {p.etiqueta}
                </option>
              ))}
              <option value="personalizado">Personalizado</option>
            </select>
          </label>
          {puedeGestionar ? (
            <>
              <button
                type="button"
                className="pz-boton"
                onClick={() => setCategoriasAbiertas(true)}
              >
                <Icono nombre="cuadricula" lado={16} /> Categorías
              </button>
              <button type="button" className="pz-boton pz-boton--principal" onClick={abrirNuevo}>
                <Icono nombre="mas" lado={16} /> Nuevo gasto
              </button>
            </>
          ) : null}
        </div>
      </header>

      {clave === 'personalizado' ? (
        <div className="pz-filtros">
          <label className="pz-campo">
            <span className="tt-etiqueta">Desde</span>
            <input
              type="date"
              value={aISO(desdeLibre)}
              onChange={(e) => {
                const [a, m, d] = e.target.value.split('-');
                if (a && m && d) setDesdeLibre(`${d}/${m}/${a}` as Fecha);
              }}
            />
          </label>
          <label className="pz-campo">
            <span className="tt-etiqueta">Hasta</span>
            <input
              type="date"
              value={aISO(hastaLibre)}
              onChange={(e) => {
                const [a, m, d] = e.target.value.split('-');
                if (a && m && d) setHastaLibre(`${d}/${m}/${a}` as Fecha);
              }}
            />
          </label>
        </div>
      ) : null}

      <CifrasDeGastos resumen={resumen.datos} />

      <div className="pz-pestanas" role="tablist" aria-label="Secciones de Gastos">
        {PESTANAS_DE_GASTOS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            className={`pz-pestana${pestana === p.clave ? ' pz-pestana--puesta' : ''}`}
            onClick={() => setPestana(p.clave)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {/* La llave es la pestaña: es lo que hace que lo nuevo entre en vez de
          sustituirse de golpe. */}
      <div className="mv-cambia" key={pestana}>
        {pestana === 'todos' ? (
          <div className="pz-cuerpo">
            <TablaDeGastos
              gastos={lista}
              categorias={categorias.datos ?? []}
              proveedores={proveedores.datos ?? []}
              usuarios={usuarios}
              filtros={filtros}
              filtrosAbiertos={filtrosAbiertos}
              columna={columna}
              descendente={descendente}
              pagina={pagina}
              porPagina={porPagina}
              seleccionado={abierto}
              cargando={cargando}
              error={gastos.error}
              puedeGestionar={puedeGestionar}
              onFiltros={setFiltros}
              onAbrirFiltros={() => setFiltrosAbiertos((a) => !a)}
              onOrden={(c) => {
                // Tocar la misma columna da la vuelta al orden; otra empieza
                // por lo mas util: lo mas reciente y lo mas caro primero.
                if (c === columna) setDescendente((d) => !d);
                else {
                  setColumna(c);
                  setDescendente(c === 'fecha' || c === 'monto');
                }
              }}
              onPagina={setPagina}
              onPorPagina={(n) => {
                setPorPagina(n);
                setPagina(1);
              }}
              onAbrir={setAbierto}
              onAccion={(clave, g) => {
                if (clave === 'ver') setAbierto(g.id);
                else if (clave === 'editar') abrirEdicion(g);
                else if (clave === 'duplicar') abrirEdicion(g, true);
                else if (clave === 'anular') {
                  setAAnular(g);
                  setMotivo('');
                } else if (clave === 'recurrente') {
                  void guardarRecurrente(negocio, null, {
                    concepto: g.concepto,
                    detalle: g.detalle ?? '',
                    montoCentavos: g.montoCentavos,
                    metodo: g.metodo,
                    efectivoCentavos: g.efectivoCentavos,
                    metodoResto: g.metodoResto,
                    frecuencia: 'mensual',
                    fechaInicio: hoy,
                    fechaFin: null,
                    categoriaId: g.categoriaId ?? '',
                    proveedorId: g.proveedorId ?? '',
                    notas: g.notas ?? '',
                  }).then(() => recurrentes.recargar());
                }
              }}
              onNuevo={abrirNuevo}
              onExportar={exportar}
              onReintentar={gastos.recargar}
            />

            <PanelDelGasto
              gasto={elAbierto}
              puedeGestionar={puedeGestionar}
              onEditar={() => elAbierto && abrirEdicion(elAbierto)}
              onDuplicar={() => elAbierto && abrirEdicion(elAbierto, true)}
              onAnular={() => {
                setAAnular(elAbierto);
                setMotivo('');
              }}
              onVerProveedor={() =>
                ir('productos', { intencion: `productos:proveedor:${elAbierto?.proveedorId}` })
              }
              onVerCaja={() => ir('caja', { intencion: 'caja:movimientos' })}
              onCerrar={() => setAbierto(null)}
            />
          </div>
        ) : pestana === 'categoria' ? (
          <div className="pz-dos">
            <section className="pz-tarjeta" aria-label="Gastos agrupados por categoría">
              <h3 className="tt-tarjeta">Por categoría</h3>
              <ListaAgrupada
                grupos={agruparPorCategoria(filtrados)}
                total={filtrados.reduce((s, g) => s + g.montoCentavos, 0)}
                vacio="Aún no hay gastos en este periodo."
              />
            </section>
            <GastosPorCategoria
              categorias={resumen.datos?.porCategoria ?? []}
              total={resumen.datos?.totalCentavos ?? 0}
              cargando={resumen.estado === 'cargando' && resumen.datos === null}
            />
          </div>
        ) : pestana === 'metodo' ? (
          <div className="pz-dos">
            <section className="pz-tarjeta" aria-label="Gastos agrupados por forma de pago">
              <h3 className="tt-tarjeta">Por forma de pago</h3>
              <ListaAgrupada
                grupos={agruparPorMetodo(filtrados)}
                total={filtrados.reduce((s, g) => s + g.montoCentavos, 0)}
                vacio="Aún no hay gastos en este periodo."
              />
              {/* LA DISTINCION QUE MAS SE PREGUNTA, escrita donde se pregunta. */}
              <p className="tt-secundario">
                Solo el efectivo sale del cajón. Tarjeta y transferencia son egresos del negocio y
                no se cuentan en el corte de caja.
              </p>
            </section>
            <GastosPorDia
              dias={resumen.datos?.porDia ?? []}
              cargando={resumen.estado === 'cargando' && resumen.datos === null}
            />
          </div>
        ) : (
          <Recurrentes
            recurrentes={recurrentes.datos ?? []}
            hoy={hoy}
            cargando={recurrentes.estado === 'cargando' && recurrentes.datos === null}
            puedeGestionar={puedeGestionar}
            onNuevo={abrirNuevo}
            onEditar={() => undefined}
            onMarcar={(r, estado) => void recurrente.ejecutar(r.id, estado)}
          />
        )}
      </div>

      <FormularioDeGasto
        abierto={formulario !== null}
        titulo={formulario?.id === null ? 'Nuevo gasto' : 'Editar gasto'}
        datos={formulario?.datos ?? GASTO_VACIO}
        montoEscrito={montoEscrito}
        efectivoEscrito={efectivoEscrito}
        categorias={categorias.datos ?? []}
        proveedores={proveedores.datos ?? []}
        hayCajaAbierta={hayCajaAbierta}
        trabajando={alta.trabajando || cambio.trabajando}
        error={alta.error ?? cambio.error}
        mostrarErrores={mostrarErrores}
        onCambiar={(d) => setFormulario((f) => (f ? { ...f, datos: d } : f))}
        onMonto={(escrito) => {
          setMontoEscrito(escrito);
          setFormulario((f) =>
            f ? { ...f, datos: { ...f.datos, montoCentavos: pesosACentavos(escrito) } } : f,
          );
        }}
        onEfectivo={(escrito) => {
          setEfectivoEscrito(escrito);
          setFormulario((f) =>
            f ? { ...f, datos: { ...f.datos, efectivoCentavos: pesosACentavos(escrito) } } : f,
          );
        }}
        onGuardar={() => void guardar()}
        onCerrar={() => setFormulario(null)}
        onAdministrarCategorias={() => {
          setFormulario(null);
          setCategoriasAbiertas(true);
        }}
      />

      <AdministrarCategorias
        abierto={categoriasAbiertas}
        titulo="Categorías de gastos"
        que="gasto"
        categorias={categorias.datos ?? []}
        cargando={categorias.estado === 'cargando' && categorias.datos === null}
        trabajando={categoria.trabajando || archivo.trabajando}
        error={categoria.error ?? archivo.error}
        onGuardar={(id, d) => void categoria.ejecutar(id, d)}
        onArchivar={(id) => void archivo.ejecutar(id)}
        onCerrar={() => setCategoriasAbiertas(false)}
      />

      {/* ANULAR PIDE MOTIVO. Sin el, dentro de tres meses nadie sabe por que
          se anulo un gasto de diez mil pesos — y la base lo exige igual. */}
      <Confirmacion
        abierto={aAnular !== null}
        titulo={`¿Anular "${aAnular?.concepto ?? ''}"?`}
        confirmar="Anular el gasto"
        destructivo
        trabajando={anulacion.trabajando}
        onConfirmar={() => {
          if (!aAnular || motivo.trim() === '') return;
          void anulacion.ejecutar(aAnular.id, motivo).then(() => {
            setAAnular(null);
            setMotivo('');
          });
        }}
        onCancelar={() => setAAnular(null)}
      >
        <p className="pz-dato__valor">
          El gasto se queda en el historial con quién lo anuló y por qué.
          {aAnular && aAnular.efectivoCentavos > 0
            ? ' La caja recibe de vuelta el efectivo que salió.'
            : ' No se movió efectivo, así que la caja no cambia.'}
        </p>
        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Motivo *</span>
          <input
            className="gto-campo"
            autoComplete="off"
            placeholder="Por qué se anula"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
        {anulacion.error ? (
          <p className="pz-error__detalle">{anulacion.error}</p>
        ) : null}
      </Confirmacion>
    </div>
  );
}
