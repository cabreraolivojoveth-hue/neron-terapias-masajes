/**
 * EL FORMULARIO DE UN PRODUCTO.
 *
 * EL STOCK NO SE EDITA AQUI, y es la decision mas importante de este archivo.
 * Cambiar 18 por 20 en un formulario no dice de donde salieron las dos piezas.
 * Para eso esta "Ajustar inventario", que exige un motivo y deja rastro.
 *
 * El stock INICIAL si entra —solo al crear— porque es la primera vez y no hay
 * nada de donde partir. Pero produce su movimiento igual: si mañana falta una
 * pieza, la lista empieza ahi.
 */

import { AreaDeTexto, Boton, Campo, Modal, Seleccion } from '@neron/base/ui';
import { aCentavos, aPesos } from '@neron/base/utils';
import { useState, type FormEvent } from 'react';
import type { Categoria } from '../datos/categorias.js';
import type { DatosDeProducto } from '../datos/productos.js';

export type ErroresDeProducto = Partial<Record<keyof DatosDeProducto, string>>;

export const UNIDADES: readonly { valor: string; texto: string }[] = [
  { valor: 'pieza', texto: 'Pieza' },
  { valor: 'ml', texto: 'Mililitro' },
  { valor: 'g', texto: 'Gramo' },
  { valor: 'kg', texto: 'Kilogramo' },
  { valor: 'paquete', texto: 'Paquete' },
];

export const PRODUCTO_VACIO: DatosDeProducto = {
  nombre: '',
  descripcion: '',
  sku: '',
  codigoBarras: '',
  categoriaId: '',
  precioCentavos: 0,
  costoCentavos: 0,
  stockMinimo: 0,
  unidad: 'pieza',
  ubicacion: '',
  imagenUrl: '',
  notas: '',
  activo: true,
  stockInicial: 0,
};

export function validarProducto(d: DatosDeProducto, creando: boolean): ErroresDeProducto {
  const e: ErroresDeProducto = {};

  if (!d.nombre.trim()) {
    e.nombre = 'Escribe el nombre del producto.';
  } else if (d.nombre.trim().length > 120) {
    e.nombre = 'El nombre no puede pasar de 120 letras.';
  }

  if (!Number.isFinite(d.precioCentavos) || d.precioCentavos < 0) {
    e.precioCentavos = 'El precio no puede ser negativo.';
  }
  if (!Number.isFinite(d.costoCentavos) || d.costoCentavos < 0) {
    e.costoCentavos = 'El costo no puede ser negativo.';
  }
  if (!Number.isFinite(d.stockMinimo) || d.stockMinimo < 0) {
    e.stockMinimo = 'El mínimo no puede ser negativo.';
  }
  // El stock inicial NEGATIVO no existe: no se puede empezar debiendo piezas.
  if (creando && (!Number.isFinite(d.stockInicial) || d.stockInicial < 0)) {
    e.stockInicial = 'El stock inicial no puede ser negativo.';
  }

  return e;
}

/** Pesos escritos → centavos. Vacio es cero: un producto de cortesía existe. */
function pesosACentavos(texto: string): number {
  const c = aCentavos(texto.replace(/[^\d.,-]/g, '').replace(',', '.'));
  return c ?? 0;
}

export interface PropiedadesDelFormularioDeProducto {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly inicial: DatosDeProducto;
  /** Al editar, el stock NO se toca desde aqui. */
  readonly creando: boolean;
  readonly puedeVerCostos: boolean;
  readonly categorias: readonly Categoria[];
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(datos: DatosDeProducto): void;
  onCerrar(): void;
}

export function FormularioDeProducto({
  abierto,
  titulo,
  inicial,
  creando,
  puedeVerCostos,
  categorias,
  trabajando,
  error,
  onGuardar,
  onCerrar,
}: PropiedadesDelFormularioDeProducto) {
  const [v, setV] = useState<DatosDeProducto>(inicial);
  const [precio, setPrecio] = useState(() => String(aPesos(inicial.precioCentavos)));
  const [costo, setCosto] = useState(() => String(aPesos(inicial.costoCentavos)));
  const [errores, setErrores] = useState<ErroresDeProducto>({});
  const [extras, setExtras] = useState(false);

  const poner = <K extends keyof DatosDeProducto>(k: K, valor: DatosDeProducto[K]): void =>
    setV((a) => ({ ...a, [k]: valor }));

  function enviar(e: FormEvent): void {
    e.preventDefault();
    const datos: DatosDeProducto = {
      ...v,
      precioCentavos: pesosACentavos(precio),
      // Sin permiso de costos NO se manda un cero que borraria el costo real:
      // se conserva el que ya traia.
      costoCentavos: puedeVerCostos ? pesosACentavos(costo) : inicial.costoCentavos,
    };
    const fallos = validarProducto(datos, creando);
    setErrores(fallos);
    if (Object.keys(fallos).length > 0) return;
    onGuardar(datos);
  }

  if (!abierto) return null;

  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCerrar}>
      <form className="cli-ficha" onSubmit={enviar} noValidate>
        <Campo
          etiqueta="Nombre"
          value={v.nombre}
          onChange={(e) => poner('nombre', e.target.value)}
          obligatorio
          maxLength={120}
          {...(errores.nombre ? { error: errores.nombre } : {})}
        />

        <AreaDeTexto
          etiqueta="Descripción"
          value={v.descripcion}
          onChange={(e) => poner('descripcion', e.target.value)}
          rows={2}
          maxLength={1000}
        />

        <div className="cli-ficha__par">
          <Campo
            etiqueta="SKU"
            value={v.sku}
            onChange={(e) => poner('sku', e.target.value)}
            maxLength={40}
            ayuda="Tu código interno. Único dentro de tu centro."
          />
          <Seleccion
            etiqueta="Categoría"
            value={v.categoriaId}
            onChange={(e) => poner('categoriaId', e.target.value)}
            opciones={[
              { valor: '', texto: 'Sin categoría' },
              ...categorias
                .filter((c) => c.activo || c.id === v.categoriaId)
                .map((c) => ({ valor: c.id, texto: c.nombre })),
            ]}
          />
        </div>

        <div className="cli-ficha__par">
          <Campo
            etiqueta="Precio de venta"
            type="text"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            obligatorio
            {...(errores.precioCentavos ? { error: errores.precioCentavos } : {})}
            ayuda="En pesos."
          />
          {/* EL COSTO SOLO A QUIEN PUEDE VERLO. Enseñarlo en gris igual lo
              enseña: se quita del formulario entero. */}
          {puedeVerCostos ? (
            <Campo
              etiqueta="Costo"
              type="text"
              inputMode="decimal"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              {...(errores.costoCentavos ? { error: errores.costoCentavos } : {})}
              ayuda="Lo que te cuesta. Con esto se calcula el valor del inventario."
            />
          ) : null}
        </div>

        <div className="cli-ficha__par">
          <Campo
            etiqueta="Stock mínimo"
            type="text"
            inputMode="numeric"
            value={String(v.stockMinimo)}
            onChange={(e) => poner('stockMinimo', Number(e.target.value.replace(/[^\d]/g, '') || 0))}
            {...(errores.stockMinimo ? { error: errores.stockMinimo } : {})}
            ayuda="Cuándo avisar que se está acabando."
          />
          {/* SOLO AL CREAR. Al editar, el stock se mueve — no se escribe. */}
          {creando ? (
            <Campo
              etiqueta="Stock inicial"
              type="text"
              inputMode="numeric"
              value={String(v.stockInicial)}
              onChange={(e) =>
                poner('stockInicial', Number(e.target.value.replace(/[^\d]/g, '') || 0))
              }
              {...(errores.stockInicial ? { error: errores.stockInicial } : {})}
              ayuda="Cuántas piezas tienes hoy. Queda registrado como movimiento inicial."
            />
          ) : null}
        </div>

        {!creando ? (
          <p className="cli-ficha__duplicado-nota">
            El stock no se edita desde aquí. Para cambiarlo usa <strong>Ajustar inventario</strong>,
            que pide un motivo y deja el movimiento registrado.
          </p>
        ) : null}

        <button
          type="button"
          className="cli-ficha__mas"
          aria-expanded={extras}
          onClick={() => setExtras((a) => !a)}
        >
          {extras ? '− Ocultar información adicional' : '+ Información adicional'}
        </button>

        {extras ? (
          <>
            <div className="cli-ficha__par">
              <Campo
                etiqueta="Código de barras"
                value={v.codigoBarras}
                onChange={(e) => poner('codigoBarras', e.target.value)}
                maxLength={60}
                ayuda="Para buscarlo con lector en el mostrador."
              />
              <Seleccion
                etiqueta="Unidad"
                value={v.unidad}
                onChange={(e) => poner('unidad', e.target.value)}
                opciones={UNIDADES.map((u) => ({ valor: u.valor, texto: u.texto }))}
              />
            </div>

            <div className="cli-ficha__par">
              <Campo
                etiqueta="Ubicación"
                value={v.ubicacion}
                onChange={(e) => poner('ubicacion', e.target.value)}
                maxLength={120}
                ayuda="Dónde está guardado."
              />
              <Seleccion
                etiqueta="Estado"
                value={v.activo ? 'activo' : 'inactivo'}
                onChange={(e) => poner('activo', e.target.value === 'activo')}
                ayuda="Un producto desactivado deja de ofrecerse al vender."
                opciones={[
                  { valor: 'activo', texto: 'Activo' },
                  { valor: 'inactivo', texto: 'Desactivado' },
                ]}
              />
            </div>

            <Campo
              etiqueta="Imagen"
              value={v.imagenUrl}
              onChange={(e) => poner('imagenUrl', e.target.value)}
              maxLength={500}
              ayuda="La dirección de una imagen. Sin ella se usa un icono neutro."
            />

            <AreaDeTexto
              etiqueta="Notas internas"
              value={v.notas}
              onChange={(e) => poner('notas', e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </>
        ) : null}

        {error ? (
          <p className="cli-ficha__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="cli-ficha__pie">
          <Boton tono="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton tono="principal" type="submit" trabajando={trabajando}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
