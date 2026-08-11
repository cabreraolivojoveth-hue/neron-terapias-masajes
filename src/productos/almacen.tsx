/**
 * PRODUCTOS — el almacén.
 *
 * ES LA FUENTE DE VERDAD DE QUE SE VENDE Y CUANTO HAY. Ventas consume este
 * catálogo, Caja recibe el dinero por su propia puerta, Reportes calcula la
 * utilidad con el costo HISTORICO. Aqui no se crea dinero ni se tocan clientes.
 *
 * Este archivo SOLO COORDINA. Las reglas duras —que el stock no se vaya a
 * negativo, que dos cajas no vendan la ultima pieza, que todo cambio deje
 * movimiento— viven en la base de datos.
 *
 * NO IMPORTA NADA DE VENTAS. Para abrir una venta se navega con un recado.
 */

import { tomarIntencion, useNavegacion } from '@neron/base/marco';
import { Boton, Campo, Confirmacion, Modal } from '@neron/base/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Categoria } from '../datos/categorias.js';
import {
  archivarCategoria,
  guardarCategoria,
  llaveDeCategorias,
  traerCategorias,
} from '../datos/categorias.js';
import { useConsulta, useOperacion } from '../datos/consulta.js';
import {
  ajustarInventario,
  cambiarEstadoDeProducto,
  desligarProveedor,
  guardarProducto,
  guardarProveedor,
  ligarProveedor,
  llaveDeLaFichaDelProducto,
  llaveDelResumenDeProductos,
  llaveDeProductos,
  llaveDeProveedores,
  traerFichaDeProducto,
  traerProductosDelCentro,
  traerProveedores,
  traerResumenDeProductos,
  LO_QUE_TOCA_UN_PRODUCTO,
  type DatosDeProducto,
  type EstadoDeStock,
  type FichaDeProducto,
  type FiltrosDeProductos,
  type PaginaDeProductos,
  type ProductoEnLista,
  type ProveedorEnLista,
  type ResumenDeProductos,
} from '../datos/productos.js';
import { useSesion } from '../identidad/sesion.js';
import { AdministrarCategorias } from '../ui/administrar-categorias.js';
import { Icono } from '../ui/iconos.js';
import { CifrasDeInventario } from './cifras-de-inventario.js';
import { FormularioDeProducto, PRODUCTO_VACIO } from './formulario-de-producto.js';
import { PanelDelProducto, loQuePasaAlApagarElProducto } from './panel-del-producto.js';
import { TablaDeProductos } from './tabla-de-productos.js';

/** Cuanto se espera antes de consultar mientras alguien escribe. */
const ESPERA_MS = 300;

/** La ficha del servidor, lista para el formulario. */
export function fichaAFormularioDeProducto(f: FichaDeProducto): DatosDeProducto {
  return {
    nombre: f.nombre,
    descripcion: f.descripcion ?? '',
    sku: f.sku ?? '',
    codigoBarras: f.codigoBarras ?? '',
    categoriaId: f.categoriaId ?? '',
    precioCentavos: f.precioCentavos,
    // Sin permiso de costos llega nulo; se conserva el que hay para no
    // borrarlo con un cero al guardar.
    costoCentavos: f.costoCentavos ?? 0,
    stockMinimo: f.stockMinimo,
    unidad: f.unidad,
    ubicacion: f.ubicacion ?? '',
    imagenUrl: f.imagenUrl ?? '',
    notas: f.notas ?? '',
    activo: f.activo,
    // NUNCA se arrastra al editar: editar no mueve inventario.
    stockInicial: 0,
  };
}

export function Almacen() {
  const { acceso } = useSesion();
  const { ir } = useNavegacion();

  const negocio = acceso?.negocioId ?? '';
  const permisos = acceso?.permisos ?? {};
  const puedeGestionar = permisos['gestionarInventario'] === true;
  const puedeVerCostos = permisos['verCostos'] === true || permisos['verFinanzas'] === true;

  /* --- Lo que la persona escogio ------------------------------------ */

  const [escrito, setEscrito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pestana, setPestana] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [soloInactivos, setSoloInactivos] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);

  const [formulario, setFormulario] = useState<{ inicial: DatosDeProducto; id?: string } | null>(
    null,
  );
  const [abierto, setAbierto] = useState<string | null>(null);
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false);
  const [aCambiarEstado, setACambiarEstado] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(escrito.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [escrito]);

  /** Cualquier filtro nuevo devuelve a la PAGINA UNO. */
  useEffect(
    () => setPagina(1),
    [busqueda, pestana, categoriaId, proveedorId, soloInactivos, porPagina],
  );

  const filtros: FiltrosDeProductos = useMemo(
    () => ({
      busqueda,
      estado: pestana as EstadoDeStock | '',
      categoriaId,
      proveedorId,
      // Por omision se ven los ACTIVOS. Los apagados hay que pedirlos, pero se
      // pueden encontrar: si no, se captura otra vez el que ya existia.
      activo: soloInactivos ? false : true,
    }),
    [busqueda, pestana, categoriaId, proveedorId, soloInactivos],
  );

  /* --- Lo que se le pide al servidor -------------------------------- */

  const lista = useConsulta<PaginaDeProductos>(
    negocio ? llaveDeProductos(negocio, filtros, pagina, porPagina) : null,
    () => traerProductosDelCentro(negocio, filtros, pagina, porPagina),
  );

  const resumen = useConsulta<ResumenDeProductos>(
    negocio ? llaveDelResumenDeProductos(negocio) : null,
    () => traerResumenDeProductos(negocio),
  );

  const categorias = useConsulta<Categoria[]>(
    negocio ? llaveDeCategorias(negocio, 'producto') : null,
    () => traerCategorias(negocio, 'producto'),
  );

  const proveedores = useConsulta<ProveedorEnLista[]>(
    negocio ? llaveDeProveedores(negocio) : null,
    () => traerProveedores(negocio),
  );

  const ficha = useConsulta<FichaDeProducto | null>(
    abierto ? llaveDeLaFichaDelProducto(abierto) : null,
    () => traerFichaDeProducto(abierto!),
  );

  /* --- Lo que cambia datos ------------------------------------------ */

  const guardado = useOperacion(guardarProducto, [...LO_QUE_TOCA_UN_PRODUCTO]);
  const cambioDeEstado = useOperacion(cambiarEstadoDeProducto, [...LO_QUE_TOCA_UN_PRODUCTO]);
  const ajuste = useOperacion(ajustarInventario, [...LO_QUE_TOCA_UN_PRODUCTO]);
  const ligado = useOperacion(ligarProveedor, [...LO_QUE_TOCA_UN_PRODUCTO]);
  const desligado = useOperacion(desligarProveedor, [...LO_QUE_TOCA_UN_PRODUCTO]);
  const proveedor = useOperacion(guardarProveedor, [...LO_QUE_TOCA_UN_PRODUCTO]);
  const categoria = useOperacion(guardarCategoria, [...LO_QUE_TOCA_UN_PRODUCTO]);
  const bajaDeCategoria = useOperacion(archivarCategoria, [...LO_QUE_TOCA_UN_PRODUCTO]);

  /** EL RECADO DE QUIEN NOS MANDO, que se consume UNA sola vez. */
  const recadoLeido = useRef(false);
  useEffect(() => {
    if (recadoLeido.current) return;
    recadoLeido.current = true;
    const recado = tomarIntencion('productos');
    if (!recado) return;
    if (recado.accion === 'nuevo') setFormulario({ inicial: PRODUCTO_VACIO });
    else if (recado.accion === 'abrir' && recado.detalle) setAbierto(recado.detalle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar(datos: DatosDeProducto): Promise<void> {
    const r = await guardado.ejecutar(negocio, formulario?.id ?? null, datos);
    if (r !== null) setFormulario(null);
  }

  /** Cada accion necesita la ficha COMPLETA, no el renglon de la lista. */
  async function hacer(clave: string, producto: ProductoEnLista): Promise<void> {
    if (clave === 'ver') {
      setAbierto(producto.id);
      return;
    }
    if (clave === 'ajustar') {
      // Ajustar vive DENTRO del detalle, junto a la lista de movimientos: es
      // donde se ve el efecto de lo que se acaba de hacer.
      setAbierto(producto.id);
      return;
    }
    const completa = await traerFichaDeProducto(producto.id);
    if (!completa) return;
    if (clave === 'editar') {
      setFormulario({ id: completa.id, inicial: fichaAFormularioDeProducto(completa) });
    } else if (clave === 'estado') {
      setAbierto(producto.id);
      setACambiarEstado(true);
    }
  }

  const cargandoLista = lista.estado === 'cargando' && lista.datos === null;
  const enFicha = ficha.datos;
  const trabajandoEnPanel = ajuste.trabajando || ligado.trabajando || desligado.trabajando;
  const errorEnPanel = ajuste.error ?? ligado.error ?? desligado.error;

  return (
    <div className="cli srv prd mv-pantalla">
      <header className="pz-encabezado">
        <div className="pz-encabezado__texto">
          <h2 className="tt-pagina">Productos</h2>
          <p className="tt-lema">Gestiona los productos que vendes en tu centro</p>
        </div>
        {puedeGestionar ? (
          <div className="pz-encabezado__acciones">
            <button
              type="button"
              className="pz-boton"
              onClick={() => setCategoriasAbiertas(true)}
            >
              <Icono nombre="cuadricula" lado={16} /> Categorías
            </button>
            <button
              type="button"
              className="pz-boton pz-boton--principal"
              onClick={() => setFormulario({ inicial: PRODUCTO_VACIO })}
            >
              <Icono nombre="mas" lado={16} /> Nuevo producto
            </button>
          </div>
        ) : null}
      </header>

      {resumen.error ? (
        <div className="pz-error" role="alert">
          <p className="pz-error__que">No pudimos cargar el resumen del inventario.</p>
          <p className="pz-error__detalle">{resumen.error}</p>
          <button type="button" className="pz-boton" onClick={resumen.recargar}>
            Reintentar
          </button>
        </div>
      ) : null}

      <CifrasDeInventario resumen={resumen.datos} />

      <div className="pz-cuerpo">
        <TablaDeProductos
          productos={lista.datos?.filas ?? []}
          total={lista.datos?.total ?? 0}
          pagina={pagina}
          porPagina={porPagina}
          busqueda={escrito}
          pestana={pestana}
          categoriaId={categoriaId}
          proveedorId={proveedorId}
          soloInactivos={soloInactivos}
          categorias={categorias.datos ?? []}
          proveedores={proveedores.datos ?? []}
          filtrosAbiertos={filtrosAbiertos}
          seleccionado={abierto}
          permisos={permisos}
          cargando={cargandoLista}
          error={lista.error}
          onBuscar={setEscrito}
          onPestana={setPestana}
          onCategoria={setCategoriaId}
          onProveedor={setProveedorId}
          onSoloInactivos={setSoloInactivos}
          onFiltros={() => setFiltrosAbiertos((a) => !a)}
          onPagina={setPagina}
          onPorPagina={setPorPagina}
          onAccion={(clave, p) => void hacer(clave, p)}
          onNuevo={() => setFormulario({ inicial: PRODUCTO_VACIO })}
          onReintentar={lista.recargar}
        />

        <PanelDelProducto
          ficha={abierto ? enFicha : null}
          cargando={Boolean(abierto) && ficha.estado === 'cargando' && enFicha === null}
          error={abierto ? ficha.error : null}
          permisos={permisos}
          proveedores={proveedores.datos ?? []}
          trabajando={trabajandoEnPanel}
          errorDeOperacion={errorEnPanel}
          onEditar={() => {
            if (enFicha) {
              setFormulario({ id: enFicha.id, inicial: fichaAFormularioDeProducto(enFicha) });
            }
          }}
          onCambiarEstado={() => setACambiarEstado(true)}
          onCerrar={() => setAbierto(null)}
          onAjustar={(datos) => {
            if (enFicha) void ajuste.ejecutar(enFicha.id, datos);
          }}
          onLigar={(provId, costo, codigo, preferido) => {
            if (enFicha) void ligado.ejecutar(enFicha.id, provId, costo, codigo, preferido);
          }}
          onDesligar={(id) => void desligado.ejecutar(id)}
          onNuevoProveedor={() => setNuevoProveedor('')}
          // La venta se abre en VENTAS, que es donde se administra.
          onAbrirVenta={(ventaId) => ir('ventas', { intencion: `ventas:abrir:${ventaId}` })}
        />
      </div>

      {formulario ? (
        <FormularioDeProducto
          key={formulario.id ?? 'nuevo'}
          abierto
          titulo={formulario.id ? 'Editar producto' : 'Nuevo producto'}
          inicial={formulario.inicial}
          creando={!formulario.id}
          puedeVerCostos={puedeVerCostos}
          categorias={categorias.datos ?? []}
          trabajando={guardado.trabajando}
          error={guardado.error}
          onGuardar={(d) => void guardar(d)}
          onCerrar={() => setFormulario(null)}
        />
      ) : null}

      <AdministrarCategorias
        abierto={categoriasAbiertas}
        titulo="Categorías de productos"
        que="producto"
        categorias={categorias.datos ?? []}
        cargando={categorias.estado === 'cargando' && categorias.datos === null}
        trabajando={categoria.trabajando || bajaDeCategoria.trabajando}
        error={categoria.error ?? bajaDeCategoria.error}
        onGuardar={(id, datos) => void categoria.ejecutar(negocio, 'producto', id, datos)}
        onArchivar={(id) => void bajaDeCategoria.ejecutar(id)}
        onCerrar={() => setCategoriasAbiertas(false)}
      />

      {/* Dar de alta un proveedor es un formulario chico: no merece su propia
          pantalla, y sacarlo del flujo haria perder lo que se estaba ligando. */}
      <Modal
        abierto={nuevoProveedor !== null}
        titulo="Nuevo proveedor"
        onCerrar={() => setNuevoProveedor(null)}
      >
        <div className="pz-columna">
          <Campo
            etiqueta="Nombre"
            value={nuevoProveedor ?? ''}
            onChange={(e) => setNuevoProveedor(e.target.value)}
            obligatorio
            maxLength={120}
          />
          {proveedor.error ? (
            <p className="pz-error__que" role="alert">
              {proveedor.error}
            </p>
          ) : null}
          <div className="pz-ficha__pie">
            <Boton tono="contorno" type="button" onClick={() => setNuevoProveedor(null)}>
              Cancelar
            </Boton>
            <Boton
              tono="principal"
              type="button"
              trabajando={proveedor.trabajando}
              onClick={() => {
                if (!nuevoProveedor?.trim()) return;
                void proveedor
                  .ejecutar(negocio, null, {
                    nombre: nuevoProveedor,
                    contacto: '',
                    telefono: '',
                    correo: '',
                    notas: '',
                    activo: true,
                  })
                  .then((r) => {
                    if (r !== null) setNuevoProveedor(null);
                  });
              }}
            >
              Guardar
            </Boton>
          </div>
        </div>
      </Modal>

      {/* La confirmacion espera a que la ficha llegue: sin saber cuantas piezas
          quedan, apagar seria una decision a ciegas. */}
      <Confirmacion
        abierto={aCambiarEstado && enFicha !== null}
        titulo={enFicha?.activo ? 'Desactivar producto' : 'Activar producto'}
        confirmar={enFicha?.activo ? 'Desactivar' : 'Activar'}
        destructivo={enFicha?.activo === true}
        onConfirmar={() => {
          if (enFicha) void cambioDeEstado.ejecutar(negocio, enFicha, !enFicha.activo);
          setACambiarEstado(false);
        }}
        onCancelar={() => setACambiarEstado(false)}
      >
        <p>
          {loQuePasaAlApagarElProducto(enFicha)} No se borra nada: sus ventas, sus movimientos y los
          reportes lo siguen encontrando.
        </p>
      </Confirmacion>
    </div>
  );
}
