/**
 * EL FORMULARIO DE UN GASTO.
 *
 * CADA ERROR VA DEBAJO DE SU CAMPO. "Revisa los datos" obliga a mirarlos todos
 * buscando cual esta mal; "El monto tiene que ser mayor que cero" debajo del
 * monto se arregla sin pensar.
 *
 * LOS ERRORES SALEN AL INTENTAR GUARDAR, no mientras se escribe. Marcar en
 * rojo el concepto en cuanto alguien pone la primera letra es regañar a quien
 * todavia no termino.
 *
 * EL ESTADO VIVE ARRIBA y entra por propiedades. Guardarlo aqui haria que
 * cada tecla remontara el formulario entero y el campo perderia el foco — que
 * es exactamente el fallo que ya nos costo en otros modulos.
 *
 * EL MONTO SE ESCRIBE EN PESOS Y SE GUARDA EN CENTAVOS. La conversion pasa en
 * un solo sitio: mezclando las dos unidades aparecen gastos de cien pesos
 * guardados como un peso, y no se nota hasta el corte.
 */

import { Modal } from '@neron/base/ui';
import { formatearMoneda } from '@neron/base/utils';
import type { Categoria } from '../datos/categorias.js';
import type { ProveedorEnLista } from '../datos/productos.js';
import {
  COMO_SE_DICE_EL_METODO,
  METODOS_DE_GASTO,
  efectivoQueSale,
  loQueFaltaDelGasto,
  type DatosDeGasto,
  type MetodoDeGasto,
} from '../datos/gastos.js';
import { Icono } from '../ui/iconos.js';
import { aValorDeCampo, deValorDeCampo } from '../ventas/quien-compra.js';

/** Los pesos que se escriben, en centavos. Solo digitos y un punto. */
export function pesosACentavos(escrito: string): number {
  const limpio = escrito.replace(/[^\d.]/g, '');
  if (limpio === '') return 0;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) return 0;
  // El redondeo evita que 10.1 se guarde como 1009 centavos por el punto
  // flotante — el error que va sumando hasta que un corte no cuadra.
  return Math.round(n * 100);
}

export function centavosAPesos(centavos: number): string {
  if (!Number.isFinite(centavos) || centavos === 0) return '';
  return String(centavos / 100);
}

export interface PropiedadesDelFormulario {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly datos: DatosDeGasto;
  /** En pesos, tal como se escribio. Se guarda aparte para no borrar el punto. */
  readonly montoEscrito: string;
  readonly efectivoEscrito: string;
  readonly categorias: readonly Categoria[];
  readonly proveedores: readonly ProveedorEnLista[];
  readonly hayCajaAbierta: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  /** Solo se pintan al intentar guardar: antes seria regañar a destiempo. */
  readonly mostrarErrores: boolean;
  onCambiar(d: DatosDeGasto): void;
  onMonto(escrito: string): void;
  onEfectivo(escrito: string): void;
  onGuardar(): void;
  onCerrar(): void;
  onAdministrarCategorias(): void;
}

export function FormularioDeGasto({
  abierto,
  titulo,
  datos,
  montoEscrito,
  efectivoEscrito,
  categorias,
  proveedores,
  hayCajaAbierta,
  trabajando,
  error,
  mostrarErrores,
  onCambiar,
  onMonto,
  onEfectivo,
  onGuardar,
  onCerrar,
  onAdministrarCategorias,
}: PropiedadesDelFormulario) {
  if (!abierto) return null;

  const falta = loQueFaltaDelGasto(datos);
  const poner = <K extends keyof DatosDeGasto>(k: K, v: DatosDeGasto[K]): void =>
    onCambiar({ ...datos, [k]: v });

  const sale = efectivoQueSale(datos);
  // AVISA ANTES DE INTENTARLO. La base rechaza el efectivo sin caja abierta, y
  // enterarse al apretar "Guardar" —con el formulario lleno— es el peor
  // momento posible.
  const avisaDeCaja = sale > 0 && !hayCajaAbierta;

  const errorDe = (campo: string): string | null =>
    mostrarErrores ? (falta[campo] ?? null) : null;

  /*
   * EL MODAL ES EL DE LA BASE, no uno propio. Ya trae resueltas las cuatro
   * cosas que casi nunca se resuelven: el foco entra al abrir y vuelve al
   * cerrar, no se sale mientras esta abierto, Escape cierra, y lo de atras
   * deja de moverse. Escribir otro seria volver a pagarlas — y la version
   * propia no las tendria, porque son invisibles para quien prueba con raton.
   *
   * Va BLOQUEADO: hay un formulario a medio llenar y tocar fuera por error
   * perderia lo capturado.
   */
  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCerrar} bloqueado ancho>
      <div className="gto-formulario">
        <form
          className="pz-columna"
          onSubmit={(e) => {
            e.preventDefault();
            onGuardar();
          }}
        >
          <label className="pz-campo">
            <span className="tt-etiqueta">Concepto *</span>
            <input
              className="gto-campo"
              autoComplete="off"
              placeholder="De qué es el gasto"
              value={datos.concepto}
              onChange={(e) => poner('concepto', e.target.value)}
            />
            {errorDe('concepto') ? (
              <span className="gto-error" role="alert">
                {errorDe('concepto')}
              </span>
            ) : null}
          </label>

          <label className="pz-campo">
            <span className="tt-etiqueta">Descripción</span>
            <textarea
              className="gto-campo gto-campo--area"
              rows={2}
              maxLength={500}
              placeholder="Lo que haga falta recordar"
              value={datos.detalle}
              onChange={(e) => poner('detalle', e.target.value)}
            />
          </label>

          <div className="pz-dos">
            <label className="pz-campo">
              <span className="tt-etiqueta">Monto *</span>
              <span className="gto-monto">
                <span className="gto-monto__signo" aria-hidden="true">
                  $
                </span>
                <input
                  className="gto-campo"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={montoEscrito}
                  onChange={(e) => onMonto(e.target.value)}
                />
              </span>
              {errorDe('monto') ? (
                <span className="gto-error" role="alert">
                  {errorDe('monto')}
                </span>
              ) : null}
            </label>

            <label className="pz-campo">
              <span className="tt-etiqueta">Fecha del gasto *</span>
              <input
                type="date"
                className="gto-campo"
                value={aValorDeCampo(datos.fecha)}
                onChange={(e) => poner('fecha', deValorDeCampo(e.target.value, datos.fecha))}
              />
              {errorDe('fecha') ? (
                <span className="gto-error" role="alert">
                  {errorDe('fecha')}
                </span>
              ) : null}
            </label>
          </div>

          <div className="pz-dos">
            <label className="pz-campo">
              <span className="tt-etiqueta">Categoría *</span>
              <select
                value={datos.categoriaId}
                onChange={(e) => poner('categoriaId', e.target.value)}
              >
                <option value="">Escoge una…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              {/* SIN CATEGORIAS NO SE PUEDE CAPTURAR, y se dice con la salida
                  al lado en vez de dejar un desplegable vacio. */}
              {categorias.length === 0 ? (
                <button type="button" className="pz-enlace" onClick={onAdministrarCategorias}>
                  <Icono nombre="mas" lado={14} /> Crea la primera categoría
                </button>
              ) : null}
              {errorDe('categoria') ? (
                <span className="gto-error" role="alert">
                  {errorDe('categoria')}
                </span>
              ) : null}
            </label>

            <label className="pz-campo">
              <span className="tt-etiqueta">Proveedor</span>
              <select
                value={datos.proveedorId}
                onChange={(e) => poner('proveedorId', e.target.value)}
              >
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pz-campo">
            <span className="tt-etiqueta">Forma de pago *</span>
            <div className="gto-metodos" role="group" aria-label="Forma de pago">
              {METODOS_DE_GASTO.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`vta-metodo${datos.metodo === m ? ' vta-metodo--puesto' : ''}`}
                  aria-pressed={datos.metodo === m}
                  onClick={() =>
                    onCambiar({
                      ...datos,
                      metodo: m,
                      // Al salir de mixto se limpia lo suyo: dejarlo puesto
                      // haria que la base rechazara un gasto que en pantalla
                      // se ve bien.
                      efectivoCentavos: m === 'mixto' ? datos.efectivoCentavos : 0,
                      metodoResto: m === 'mixto' ? (datos.metodoResto ?? 'tarjeta') : null,
                    })
                  }
                >
                  {COMO_SE_DICE_EL_METODO[m]}
                </button>
              ))}
            </div>
          </div>

          {datos.metodo === 'mixto' ? (
            <div className="pz-dos gto-mixto">
              <label className="pz-campo">
                <span className="tt-etiqueta">De eso, en efectivo *</span>
                <span className="gto-monto">
                  <span className="gto-monto__signo" aria-hidden="true">
                    $
                  </span>
                  <input
                    className="gto-campo"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={efectivoEscrito}
                    onChange={(e) => onEfectivo(e.target.value)}
                  />
                </span>
                {errorDe('efectivo') ? (
                  <span className="gto-error" role="alert">
                    {errorDe('efectivo')}
                  </span>
                ) : null}
              </label>
              <label className="pz-campo">
                <span className="tt-etiqueta">El resto se pagó con *</span>
                <select
                  value={datos.metodoResto ?? 'tarjeta'}
                  onChange={(e) => poner('metodoResto', e.target.value as MetodoDeGasto)}
                >
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                </select>
                {datos.montoCentavos > datos.efectivoCentavos && datos.efectivoCentavos > 0 ? (
                  <span className="tt-secundario">
                    Resto: {formatearMoneda(datos.montoCentavos - datos.efectivoCentavos)}
                  </span>
                ) : null}
              </label>
            </div>
          ) : null}

          <div className="pz-dos">
            <label className="pz-campo">
              <span className="tt-etiqueta">Referencia</span>
              <input
                className="gto-campo"
                autoComplete="off"
                placeholder="Folio, factura o recibo"
                value={datos.referencia}
                onChange={(e) => poner('referencia', e.target.value)}
              />
            </label>
            <label className="pz-campo">
              <span className="tt-etiqueta">Notas</span>
              <input
                className="gto-campo"
                autoComplete="off"
                value={datos.notas}
                onChange={(e) => poner('notas', e.target.value)}
              />
            </label>
          </div>

          {/* LO QUE VA A PASAR CON LA CAJA, dicho antes de guardar. Es la
              conexion que mas confunde cuando no se explica: por que un gasto
              de tarjeta no baja el efectivo. */}
          <p className="gto-aviso-caja">
            <Icono nombre="cajon" lado={14} />{' '}
            {sale > 0
              ? `Saldrán ${formatearMoneda(sale)} del cajón.`
              : 'No sale efectivo del cajón: se registra como egreso del negocio.'}
          </p>

          {avisaDeCaja ? (
            <div className="pz-error" role="alert">
              <p className="pz-error__que">No hay una caja abierta.</p>
              <p className="pz-error__detalle">
                Para pagar en efectivo hay que abrir la caja primero. Con tarjeta o transferencia
                se puede registrar ahora mismo.
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="pz-error" role="alert">
              <p className="pz-error__que">No se pudo guardar el gasto.</p>
              <p className="pz-error__detalle">{error}</p>
            </div>
          ) : null}

          <div className="pz-ficha__pie">
            <button type="button" className="pz-boton" onClick={onCerrar}>
              Cancelar
            </button>
            <button
              type="submit"
              className="pz-boton pz-boton--principal"
              disabled={trabajando || avisaDeCaja}
            >
              {trabajando ? 'Guardando…' : 'Guardar gasto'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
