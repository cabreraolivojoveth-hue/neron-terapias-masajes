/**
 * LA PESTAÑA DE PROVEEDORES.
 *
 * UN PRODUCTO PUEDE TENER VARIOS. `producto.proveedor_nombre` obligaria a
 * escoger uno y a reescribirlo el dia que cambie; y no permitiria comparar a
 * quien se le compra mas barato.
 *
 * SOLO UNO PUEDE SER EL PRINCIPAL. Dos "principales" es no tener ninguno.
 *
 * NO HAY MODULO DE COMPRAS todavia, y no se finge: aqui se registra a quien se
 * le compra y a que precio. La orden de compra formal —con su folio, su
 * recepcion parcial y su cuenta por pagar— es otro bloque.
 */

import { Boton, Campo, Confirmacion } from '@neron/base/ui';
import { aCentavos, aPesos } from '@neron/base/utils';
import { useState } from 'react';
import { formatearDinero } from '../datos/moneda.js';
import type { FichaDeProducto, ProveedorDelProducto, ProveedorEnLista } from '../datos/productos.js';
import { Icono } from '../ui/iconos.js';

/** El proveedor principal, si hay uno marcado. */
export function elPreferido(
  proveedores: readonly ProveedorDelProducto[],
): ProveedorDelProducto | null {
  return proveedores.find((p) => p.preferido) ?? null;
}

export interface PropiedadesDeProveedores {
  readonly ficha: FichaDeProducto;
  readonly proveedores: readonly ProveedorEnLista[];
  readonly permisos: Readonly<Record<string, boolean>>;
  readonly trabajando: boolean;
  readonly error: string | null;
  onLigar(proveedorId: string, costoCentavos: number | null, codigo: string, preferido: boolean): void;
  onDesligar(id: string): void;
  onNuevoProveedor(): void;
}

export function Proveedores({
  ficha,
  proveedores,
  permisos,
  trabajando,
  error,
  onLigar,
  onDesligar,
  onNuevoProveedor,
}: PropiedadesDeProveedores) {
  const [ligando, setLigando] = useState(false);
  const [escogido, setEscogido] = useState('');
  const [costo, setCosto] = useState('');
  const [codigo, setCodigo] = useState('');
  const [preferido, setPreferido] = useState(false);
  const [aQuitar, setAQuitar] = useState<ProveedorDelProducto | null>(null);
  const puedeGestionar = permisos['gestionarInventario'] === true;

  const yaLigados = new Set(ficha.proveedores.map((p) => p.proveedorId));
  const disponibles = proveedores.filter((p) => !yaLigados.has(p.id) && p.activo);

  return (
    <div className="srv-detalle__cuerpo">
      {ficha.proveedores.length === 0 ? (
        <p className="pz-vacio__texto">
          Este producto todavía no tiene proveedores. Aquí se registra a quién se le compra y a qué
          precio, para poder comparar.
        </p>
      ) : (
        <ul className="pz-lista mv-escalonado">
          {ficha.proveedores.map((p) => (
            <li key={p.id} className="pz-renglon pz-renglon--quieto">
              <span className="pz-ficha" aria-hidden="true">
                <Icono nombre="bolsa" lado={18} />
              </span>
              <span className="pz-renglon__cuerpo">
                <span className="pz-renglon__titulo">
                  {p.nombre}
                  {p.preferido ? (
                    <span className="pz-pastilla pz-pastilla--exito">Principal</span>
                  ) : null}
                </span>
                <span className="pz-renglon__pie">
                  {/* El costo de ESE proveedor, solo a quien puede verlo. */}
                  {p.costoCentavos === null ? 'Sin costo registrado' : formatearDinero(p.costoCentavos)}
                  {p.codigo ? ` · su código: ${p.codigo}` : ''}
                  {p.telefono ? ` · ${p.telefono}` : ''}
                </span>
              </span>
              {puedeGestionar ? (
                <span className="pz-encabezado__acciones">
                  <button type="button" className="pz-boton" onClick={() => setAQuitar(p)}>
                    <Icono nombre="archivar" lado={14} /> Quitar
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {puedeGestionar ? (
        ligando ? (
          <div className="cat__forma">
            {disponibles.length === 0 ? (
              <p className="pz-vacio__texto">
                No hay más proveedores para ligar. Da de alta uno nuevo primero.
              </p>
            ) : (
              <label className="pz-campo">
                <span className="tt-etiqueta">Proveedor</span>
                <select value={escogido} onChange={(e) => setEscogido(e.target.value)}>
                  <option value="">Escoge uno</option>
                  {disponibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="pz-dos">
              <Campo
                etiqueta="Lo que te cobra"
                type="text"
                inputMode="decimal"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                ayuda="En pesos. Vacío si todavía no lo sabes."
              />
              <Campo
                etiqueta="Su código"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                maxLength={60}
                ayuda="Cómo lo identifica ese proveedor en su catálogo."
              />
            </div>

            <label className="srv-casilla">
              <input
                type="checkbox"
                checked={preferido}
                onChange={(e) => setPreferido(e.target.checked)}
              />
              <span>Es el proveedor principal</span>
            </label>

            {error ? (
              <p className="pz-error__que" role="alert">
                {error}
              </p>
            ) : null}

            <div className="pz-ficha__pie">
              <Boton tono="contorno" type="button" onClick={() => setLigando(false)}>
                Cancelar
              </Boton>
              <Boton
                tono="principal"
                type="button"
                trabajando={trabajando}
                onClick={() => {
                  if (!escogido) return;
                  const c = costo.trim() === '' ? null : (aCentavos(costo.replace(',', '.')) ?? 0);
                  onLigar(escogido, c, codigo, preferido);
                  setEscogido('');
                  setCosto('');
                  setCodigo('');
                  setPreferido(false);
                  setLigando(false);
                }}
              >
                Ligar proveedor
              </Boton>
            </div>
          </div>
        ) : (
          <div className="pz-encabezado__acciones">
            <button
              type="button"
              className="pz-boton"
              onClick={() => setLigando(true)}
            >
              <Icono nombre="mas" lado={14} /> Ligar un proveedor
            </button>
            <button type="button" className="pz-boton" onClick={onNuevoProveedor}>
              <Icono nombre="personaMas" lado={14} /> Dar de alta uno nuevo
            </button>
          </div>
        )
      ) : null}

      {/* NO HAY MODULO DE COMPRAS: se dice, no se finge. */}
      <p className="tt-secundario">
        Para que llegue mercancía usa <strong>Ajustar inventario → Entrada</strong>. La orden de
        compra formal, con su folio y su cuenta por pagar, todavía no existe en el sistema.
      </p>

      <Confirmacion
        abierto={aQuitar !== null}
        titulo="Quitar proveedor"
        confirmar="Quitar"
        destructivo
        onConfirmar={() => {
          if (aQuitar) onDesligar(aQuitar.id);
          setAQuitar(null);
        }}
        onCancelar={() => setAQuitar(null)}
      >
        <p>
          Deja de estar ligado a este producto. El proveedor sigue existiendo y los movimientos de
          inventario que ya se registraron no cambian.
        </p>
      </Confirmacion>
    </div>
  );
}

/** Los pesos de un costo, para el formulario. */
export const costoEnPesos = (centavos: number | null): string =>
  centavos === null ? '' : String(aPesos(centavos));
