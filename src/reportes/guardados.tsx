/**
 * LOS REPORTES GUARDADOS: la tabla del historial y el diálogo para guardar.
 *
 * LO QUE SE GUARDA ES LA PREGUNTA, NO LA RESPUESTA. Un reporte guardado no
 * conserva cifras: conserva el periodo, la pestaña y los filtros con los que se
 * hizo, y al reabrirlo se vuelve a calcular todo.
 *
 * Es a proposito y es lo unico correcto. Si guardara las cifras, un reporte de
 * junio abierto en agosto seguiria enseñando lo que decia en junio aunque desde
 * entonces se hubiera cancelado una venta de ese mes: diria un numero que ya no
 * es verdad, con fecha y con firma. Y esa es justo la clase de papel que se
 * lleva a una reunion.
 *
 * POR ESO LA COLUMNA DICE "Guardado el" Y NO "Generado el". Lo que tiene fecha
 * es cuando alguien decidio guardar esa pregunta, no cuando se contesto — la
 * respuesta es de ahora mismo, cada vez.
 */

import { useState } from 'react';
import type { ReporteGuardado } from '../datos/reportes.js';
import { Modal } from '../ui/modal.js';
import { Icono } from '../ui/iconos.js';
import { MenuDeAcciones } from '../ui/menu.js';
import { PESTANAS_DEL_REPORTE, type PestanaDelReporte } from './secciones.js';

/** Como se llama en pantalla la pestaña con la que se guardo. */
export function tipoEnPalabras(tipo: string): string {
  const p = PESTANAS_DEL_REPORTE.find((x) => x.clave === tipo);
  return p ? p.etiqueta : tipo;
}

/**
 * La marca de tiempo de la base, escrita como se lee.
 *
 * Se corta el texto en vez de pasarlo por `new Date`: la base devuelve un ISO
 * con zona, y `new Date(...).toLocaleDateString()` lo mueve a la zona del
 * navegador — un reporte guardado a las 11 de la noche saldria con la fecha del
 * dia siguiente para quien lo abra desde otro huso.
 */
export function cuandoSeGuardo(iso: string): string {
  const [fecha, resto] = iso.split('T');
  if (!fecha) return '';
  const [a, m, d] = fecha.split('-');
  const hora = (resto ?? '').slice(0, 5);
  return `${d}/${m}/${a}${hora ? ` ${hora}` : ''}`;
}

export function HistorialDeReportes({
  guardados,
  cargando,
  puedeGestionar,
  onAbrir,
  onExportar,
  onBorrar,
}: {
  readonly guardados: readonly ReporteGuardado[];
  readonly cargando: boolean;
  readonly puedeGestionar: boolean;
  onAbrir(r: ReporteGuardado): void;
  onExportar(r: ReporteGuardado): void;
  onBorrar(r: ReporteGuardado): void;
}) {
  return (
    <section className="pz-tarjeta" aria-label="Historial de reportes guardados">
      <h3 className="tt-tarjeta">Historial de reportes guardados</h3>

      {cargando ? (
        <div className="pz-cargando" aria-busy="true">
          <div className="pz-silueta pz-silueta--linea" />
          <div className="pz-silueta pz-silueta--linea" />
        </div>
      ) : guardados.length === 0 ? (
        <div className="pz-vacio pz-vacio--chico">
          <span className="pz-vacio__icono" aria-hidden="true">
            <Icono nombre="nota" lado={22} />
          </span>
          <p className="pz-vacio__texto">
            Todavía no hay reportes guardados. Cuando guardes uno, aquí queda con su período y sus
            filtros para volver a verlo con las cifras del momento.
          </p>
        </div>
      ) : (
        <div className="pz-tabla__marco">
          <table className="pz-tabla">
            <thead>
              <tr>
                <th scope="col">Nombre del reporte</th>
                <th scope="col">Tipo</th>
                <th scope="col">Período</th>
                <th scope="col" className="pz-tabla__opcional">Guardado el</th>
                <th scope="col" className="pz-tabla__opcional">Guardado por</th>
                <th scope="col" className="pz-tabla__acciones">Acciones</th>
              </tr>
            </thead>
            <tbody className="mv-escalonado">
              {guardados.map((g) => (
                <tr key={g.id}>
                  <td>
                    <button type="button" className="pz-enlace" onClick={() => onAbrir(g)}>
                      {g.nombre}
                    </button>
                  </td>
                  <td>{tipoEnPalabras(g.tipo)}</td>
                  <td>
                    {g.desde} – {g.hasta}
                  </td>
                  <td className="pz-tabla__opcional">{cuandoSeGuardo(g.creadoEn)}</td>
                  <td className="pz-tabla__opcional">{g.creadoPor ?? 'Sin registrar'}</td>
                  <td className="pz-tabla__acciones">
                    <MenuDeAcciones
                      de={g.nombre}
                      opciones={[
                        { clave: 'abrir', etiqueta: 'Volver a verlo', icono: 'lupa' },
                        { clave: 'exportar', etiqueta: 'Descargarlo', icono: 'salida' },
                        ...(puedeGestionar
                          ? [{ clave: 'borrar', etiqueta: 'Quitarlo', icono: 'basura' as const, peligro: true }]
                          : []),
                      ]}
                      onEscoger={(c) => {
                        if (c === 'abrir') onAbrir(g);
                        else if (c === 'exportar') onExportar(g);
                        else onBorrar(g);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function GuardarReporte({
  abierto,
  pestana,
  periodo,
  trabajando,
  error,
  onGuardar,
  onCerrar,
}: {
  readonly abierto: boolean;
  readonly pestana: PestanaDelReporte;
  readonly periodo: string;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(nombre: string): void;
  onCerrar(): void;
}) {
  const [nombre, setNombre] = useState('');

  return (
    <Modal
      abierto={abierto}
      titulo="Guardar este reporte"
      bloqueado={trabajando}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="pz-boton" onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </button>
          <button
            type="button"
            className="pz-boton pz-boton--principal"
            disabled={trabajando || nombre.trim() === ''}
            onClick={() => {
              onGuardar(nombre.trim());
              setNombre('');
            }}
          >
            {trabajando ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      {/* SE DICE QUE SE GUARDA ANTES DE GUARDARLO. Quien espera un PDF con las
          cifras congeladas y recibe una consulta que se recalcula tiene que
          enterarse aqui, no la primera vez que un total no coincide con el
          papel que imprimio. */}
      <p className="pz-dato__valor">
        Se guarda el <strong>período</strong> y los <strong>filtros</strong>, no las cifras. Al
        volver a abrirlo se calcula otra vez, así que siempre dice la verdad de hoy.
      </p>
      <div className="pz-datos">
        <div className="pz-dato pz-dato--renglon">
          <span className="tt-etiqueta">Sección</span>
          <span className="pz-dato__valor">{tipoEnPalabras(pestana)}</span>
        </div>
        <div className="pz-dato pz-dato--renglon">
          <span className="tt-etiqueta">Período</span>
          <span className="pz-dato__valor">{periodo}</span>
        </div>
      </div>
      <label className="pz-campo pz-campo--bloque">
        <span className="tt-etiqueta">Nombre *</span>
        <input
          className="rep-campo"
          autoComplete="off"
          placeholder="Cómo quieres encontrarlo después"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </label>
      {error ? <p className="pz-error__detalle">{error}</p> : null}
    </Modal>
  );
}
