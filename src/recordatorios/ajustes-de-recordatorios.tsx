/**
 * LA CONFIGURACION DE RECORDATORIOS — solo de este modulo.
 *
 * NO ES LA CONFIGURACION DEL ERP. Los datos del centro, los horarios, los roles
 * y los usuarios viven en el modulo Configuración y aquí no se tocan: mezclarlos
 * haría que cambiar la anticipación de un aviso pareciera un cambio del sistema
 * entero, y ese miedo es lo que hace que nadie ajuste nada.
 *
 * LAS AUTOMATIZACIONES NACEN APAGADAS Y NO EXISTEN HASTA QUE SE GUARDAN. La
 * tabla arranca vacía; esta pantalla enseña los cinco eventos posibles con su
 * interruptor en "no", y solo al guardar se escribe una fila. Un sistema que
 * empieza creando recordatorios solos le llena la lista a alguien que nunca los
 * pidió, y lo primero que esa persona aprende es a ignorar la lista.
 *
 * EL AVISO DEL NAVEGADOR DICE LO QUE DE VERDAD HACE. Funciona con la pestaña
 * abierta y nada más. Prometer "notificaciones" a secas es peor que no tener el
 * interruptor: alguien confía, cierra el navegador, y se pierde el aviso que sí
 * importaba.
 */

import { Boton, Campo, Confirmacion } from '@neron/base/ui';
import { useState } from 'react';
import type { Categoria } from '../datos/categorias.js';
import type { ProfesionalBreve } from '../datos/citas.js';
import {
  ANTICIPACIONES,
  COMO_SE_DICE_EL_EVENTO,
  COMO_SE_DICE_LA_PRIORIDAD,
  DE_DONDE_SALE_EL_EVENTO,
  EVENTOS,
  ORDENES,
  PRIORIDADES,
  type AjustesDeRecordatorios,
  type AutomatizacionDeRecordatorios,
  type ColumnaDeOrden,
  type DatosDeAutomatizacion,
  type EventoAutomatizable,
  type PrioridadDeRecordatorio,
} from '../datos/recordatorios.js';
import { Icono } from '../ui/iconos.js';
import { Modal } from '../ui/modal.js';
import { permisoDeAviso, type PermisoDeAviso } from './avisos.js';

/** El título que se propone para cada evento. Se puede cambiar antes de guardar. */
export const TITULO_QUE_SE_PROPONE: Readonly<Record<EventoAutomatizable, string>> = {
  cita_nueva: 'Confirmar cita de {nombre}',
  cliente_nuevo: 'Dar seguimiento a {nombre}',
  venta_pendiente: 'Dar seguimiento a la venta {nombre}',
  stock_bajo: 'Reponer {nombre}',
  curso_proximo: 'Preparar el curso {nombre}',
};

/** Qué significa "días antes" en cada evento. Sin esto, el número no dice nada. */
export const QUE_SIGNIFICAN_LOS_DIAS: Readonly<Record<EventoAutomatizable, string>> = {
  cita_nueva: 'días antes de la cita',
  cliente_nuevo: 'días después del alta',
  venta_pendiente: 'días después de la venta',
  stock_bajo: 'días (el aviso es para hoy)',
  curso_proximo: 'días antes de que empiece',
};

/** Lo que se explica de cada aviso del navegador, según lo que dijo el navegador. */
export function comoSeExplicaElPermiso(p: PermisoDeAviso): string {
  if (p === 'no-se-puede') return 'Este navegador no sabe mostrar notificaciones.';
  if (p === 'negado')
    return 'Bloqueaste las notificaciones para este sitio. Hay que volver a permitirlas desde los ajustes del navegador.';
  if (p === 'sin-preguntar') return 'Al encenderlo, el navegador te va a pedir permiso.';
  return 'El navegador ya tiene permiso.';
}

/** Los datos de una automatización que todavía no existe en la base. */
export function automatizacionEnBlanco(evento: EventoAutomatizable): DatosDeAutomatizacion {
  return {
    evento,
    activa: false,
    plantillaTitulo: TITULO_QUE_SE_PROPONE[evento],
    plantillaDetalle: '',
    diasAntes: evento === 'stock_bajo' ? 0 : 1,
    hora: '',
    prioridad: 'normal',
    categoriaId: '',
    responsableId: '',
  };
}

/** Junta lo guardado con lo que todavía no existe, para poder enseñarlos juntos. */
export function todosLosEventos(
  guardadas: readonly AutomatizacionDeRecordatorios[],
): DatosDeAutomatizacion[] {
  return EVENTOS.map((e) => {
    const ya = guardadas.find((a) => a.evento === e);
    if (!ya) return automatizacionEnBlanco(e);
    return {
      evento: e,
      activa: ya.activa,
      plantillaTitulo: ya.plantillaTitulo,
      plantillaDetalle: ya.plantillaDetalle ?? '',
      diasAntes: ya.diasAntes,
      hora: ya.hora ?? '',
      prioridad: ya.prioridad,
      categoriaId: ya.categoriaId ?? '',
      responsableId: ya.responsableId ?? '',
    };
  });
}

export interface PropiedadesDeAjustes {
  readonly abierto: boolean;
  readonly ajustes: AjustesDeRecordatorios;
  readonly automatizaciones: readonly AutomatizacionDeRecordatorios[];
  readonly categorias: readonly Categoria[];
  readonly responsables: readonly ProfesionalBreve[];
  readonly puedeConfigurar: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(a: AjustesDeRecordatorios): void;
  onGuardarAutomatizacion(d: DatosDeAutomatizacion): void;
  /** Enciende el aviso del navegador pidiendo permiso primero. */
  onEncenderAvisos(): void;
  onCategorias(): void;
  onCerrar(): void;
}

export function AjustesDeRecordatoriosModal({
  abierto,
  ajustes,
  automatizaciones,
  categorias,
  responsables,
  puedeConfigurar,
  trabajando,
  error,
  onGuardar,
  onGuardarAutomatizacion,
  onEncenderAvisos,
  onCategorias,
  onCerrar,
}: PropiedadesDeAjustes) {
  const [borrador, setBorrador] = useState<AjustesDeRecordatorios>(ajustes);
  const [editando, setEditando] = useState<DatosDeAutomatizacion | null>(null);
  const [aEncender, setAEncender] = useState<DatosDeAutomatizacion | null>(null);

  if (!abierto) return null;

  const poner = <K extends keyof AjustesDeRecordatorios>(
    k: K,
    v: AjustesDeRecordatorios[K],
  ): void => setBorrador((a) => ({ ...a, [k]: v }));

  const permiso = permisoDeAviso();
  const eventos = todosLosEventos(automatizaciones);

  return (
    <Modal
      abierto={abierto}
      titulo="Configuración de recordatorios"
      ancho
      bloqueado={trabajando}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton tono="contorno" type="button" onClick={onCerrar} disabled={trabajando}>
            Cerrar
          </Boton>
          {puedeConfigurar ? (
            <Boton
              tono="principal"
              type="button"
              trabajando={trabajando}
              onClick={() => onGuardar(borrador)}
            >
              Guardar configuración
            </Boton>
          ) : null}
        </>
      }
    >
      <div className="rec-ajustes">
        {!puedeConfigurar ? (
          <p className="pz-pista">
            <span className="pz-pista__icono" aria-hidden="true">
              <Icono nombre="alerta" lado={16} />
            </span>
            Puedes ver cómo está configurado, pero cambiarlo le cambia el comportamiento a todo el
            centro y pide permiso de configuración.
          </p>
        ) : null}

        <section>
          <h4 className="tt-tarjeta">Avisos</h4>

          <label className="pz-campo rec-casilla">
            <input
              type="checkbox"
              disabled={!puedeConfigurar || permiso === 'no-se-puede' || permiso === 'negado'}
              checked={borrador.avisarEnNavegador}
              onChange={(e) => {
                if (e.target.checked) {
                  // EL PERMISO SE PIDE AQUI, con el gesto del usuario delante.
                  // Pedirlo al abrir la pantalla es como se acaba bloqueado.
                  onEncenderAvisos();
                }
                poner('avisarEnNavegador', e.target.checked);
              }}
            />
            <span>Avisarme en el navegador cuando llegue la hora</span>
          </label>
          {/* SE DICE EL LIMITE, no se esconde. Ver la cabecera del archivo. */}
          <p className="tt-secundario">
            Funciona con esta pestaña abierta. Para avisar con todo cerrado hace falta un servicio
            que corra solo, y todavía no existe: cuando exista, esta misma configuración le sirve.
            {' '}
            {comoSeExplicaElPermiso(permiso)}
          </p>

          <div className="pz-dos">
            <label className="pz-campo">
              <span className="tt-etiqueta">Con cuánta anticipación</span>
              <select
                disabled={!puedeConfigurar}
                value={String(borrador.anticipacionMin)}
                onChange={(e) => poner('anticipacionMin', Number(e.target.value))}
              >
                {ANTICIPACIONES.map((a) => (
                  <option key={a.minutos} value={String(a.minutos)}>
                    {a.etiqueta}
                  </option>
                ))}
              </select>
              <span className="tt-secundario">
                Cada recordatorio puede pedir la suya; esto es lo que usan los demás.
              </span>
            </label>

            <label className="pz-campo">
              <span className="tt-etiqueta">Hora de los de todo el día</span>
              <input
                type="time"
                disabled={!puedeConfigurar}
                value={borrador.horaPorOmision}
                onChange={(e) => poner('horaPorOmision', e.target.value)}
              />
              {/* SIN ESTO, un recordatorio sin hora avisaria a medianoche —
                  justo cuando nadie lo va a leer. */}
              <span className="tt-secundario">A qué hora se cuenta uno que no tiene hora.</span>
            </label>
          </div>

          <label className="pz-campo rec-casilla">
            <input
              type="checkbox"
              disabled={!puedeConfigurar}
              checked={borrador.avisarAlResponsable}
              onChange={(e) => poner('avisarAlResponsable', e.target.checked)}
            />
            <span>
              Avisar solo a quien sea responsable
              <span className="tt-secundario">
                {' '}
                — los que no tienen responsable le avisan a todo el mundo igual.
              </span>
            </span>
          </label>

          <label className="pz-campo rec-casilla">
            <input
              type="checkbox"
              disabled={!puedeConfigurar}
              checked={borrador.avisarAlReasignar}
              onChange={(e) => poner('avisarAlReasignar', e.target.checked)}
            />
            <span>Avisar a quien reciba un recordatorio que le pasaron</span>
          </label>
        </section>

        <section>
          <h4 className="tt-tarjeta">Comportamiento</h4>
          <div className="pz-dos">
            <label className="pz-campo">
              <span className="tt-etiqueta">Cuántos días cuenta "próximos"</span>
              <input
                type="number"
                min={1}
                max={90}
                inputMode="numeric"
                disabled={!puedeConfigurar}
                value={String(borrador.diasDeProximos)}
                onChange={(e) => poner('diasDeProximos', Number(e.target.value) || 7)}
              />
              {/* CAMBIA LA TARJETA Y LA PESTAÑA A LA VEZ, y se dice: si no,
                  alguien lo sube a 30 y no entiende por que la tarjeta de arriba
                  cambio de nombre. */}
              <span className="tt-secundario">
                Cambia la tarjeta de arriba y la pestaña "Próximos" a la vez.
              </span>
            </label>

            <label className="pz-campo">
              <span className="tt-etiqueta">Cómo se ordenan al abrir</span>
              <select
                disabled={!puedeConfigurar}
                value={borrador.ordenPorOmision}
                onChange={(e) => poner('ordenPorOmision', e.target.value as ColumnaDeOrden)}
              >
                {ORDENES.map((o) => (
                  <option key={o.clave} value={o.clave}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Campo
            etiqueta="Consejo del día"
            maxLength={200}
            disabled={!puedeConfigurar}
            placeholder="Déjalo vacío para el del sistema"
            value={borrador.consejo ?? ''}
            onChange={(e) => poner('consejo', e.target.value === '' ? null : e.target.value)}
            ayuda="Es un texto fijo, no un análisis. El sistema no inventa consejos."
          />

          {puedeConfigurar ? (
            <button type="button" className="pz-boton" onClick={onCategorias}>
              <Icono nombre="renglones" lado={16} /> Administrar categorías
            </button>
          ) : null}
        </section>

        <section>
          <h4 className="tt-tarjeta">Automatizaciones</h4>
          <p className="tt-secundario">
            Crean recordatorios solos cuando pasa algo en otro módulo. Todas empiezan apagadas: no
            se enciende ninguna hasta que tú lo digas.
          </p>

          <ul className="pz-lista rec-automatizaciones">
            {eventos.map((a) => (
              <li key={a.evento} className="pz-renglon pz-renglon--quieto">
                <span className="pz-renglon__cuerpo">
                  <span className="pz-renglon__titulo">{COMO_SE_DICE_EL_EVENTO[a.evento]}</span>
                  <span className="pz-renglon__pie">
                    {DE_DONDE_SALE_EL_EVENTO[a.evento]} · crea "{a.plantillaTitulo}"
                    {a.diasAntes > 0 ? `, ${a.diasAntes} ${QUE_SIGNIFICAN_LOS_DIAS[a.evento]}` : ''}
                  </span>
                </span>

                {(() => {
                  const guardada = automatizaciones.find((g) => g.evento === a.evento);
                  return guardada && guardada.creados > 0 ? (
                    <span className="tt-secundario">
                      {guardada.creados} {guardada.creados === 1 ? 'creado' : 'creados'}
                    </span>
                  ) : null;
                })()}

                <span className={`pz-pastilla pz-pastilla--${a.activa ? 'exito' : 'marca'}`}>
                  {a.activa ? 'Encendida' : 'Apagada'}
                </span>

                {puedeConfigurar ? (
                  <span className="pz-encabezado__acciones">
                    <button
                      type="button"
                      className="pz-boton"
                      onClick={() => setEditando({ ...a })}
                    >
                      <Icono nombre="lapiz" lado={14} /> Ajustar
                    </button>
                    <button
                      type="button"
                      className="pz-boton"
                      onClick={() => {
                        // ENCENDERLA PIDE CONFIRMACION; apagarla no. Encender
                        // puede crear treinta recordatorios de golpe —uno por
                        // cita futura— y eso hay que saberlo antes, no despues.
                        if (a.activa) onGuardarAutomatizacion({ ...a, activa: false });
                        else setAEncender({ ...a, activa: true });
                      }}
                    >
                      {a.activa ? 'Apagar' : 'Encender'}
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {error ? (
          <p className="pz-error__que" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {editando ? (
        <AjustarAutomatizacion
          datos={editando}
          categorias={categorias}
          responsables={responsables}
          trabajando={trabajando}
          onCambiar={setEditando}
          onGuardar={() => {
            onGuardarAutomatizacion(editando);
            setEditando(null);
          }}
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      <Confirmacion
        abierto={aEncender !== null}
        titulo="¿Encender esta automatización?"
        confirmar="Encenderla"
        trabajando={trabajando}
        onConfirmar={() => {
          if (aEncender) onGuardarAutomatizacion(aEncender);
          setAEncender(null);
        }}
        onCancelar={() => setAEncender(null)}
      >
        <p className="pz-dato__valor">
          A partir de ahora va a crear un recordatorio por cada vez que pase{' '}
          {aEncender ? COMO_SE_DICE_EL_EVENTO[aEncender.evento].toLowerCase() : ''}, incluidos los
          que ya existen y todavía no han pasado. No se duplica: si ya creó el de una cita, no crea
          otro para la misma.
        </p>
      </Confirmacion>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* El ajuste fino de una automatizacion                                */
/* ------------------------------------------------------------------ */

export function AjustarAutomatizacion({
  datos,
  categorias,
  responsables,
  trabajando,
  onCambiar,
  onGuardar,
  onCerrar,
}: {
  readonly datos: DatosDeAutomatizacion;
  readonly categorias: readonly Categoria[];
  readonly responsables: readonly ProfesionalBreve[];
  readonly trabajando: boolean;
  onCambiar(d: DatosDeAutomatizacion): void;
  onGuardar(): void;
  onCerrar(): void;
}) {
  const poner = <K extends keyof DatosDeAutomatizacion>(
    k: K,
    v: DatosDeAutomatizacion[K],
  ): void => onCambiar({ ...datos, [k]: v });

  return (
    <Modal
      abierto
      titulo={COMO_SE_DICE_EL_EVENTO[datos.evento]}
      bloqueado={trabajando}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton tono="contorno" type="button" onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </Boton>
          <Boton tono="principal" type="button" trabajando={trabajando} onClick={onGuardar}>
            Guardar la regla
          </Boton>
        </>
      }
    >
      <div className="rec-forma">
        <Campo
          etiqueta="Título del recordatorio"
          obligatorio
          maxLength={160}
          value={datos.plantillaTitulo}
          onChange={(e) => poner('plantillaTitulo', e.target.value)}
          // LAS DOS PIEZAS QUE SE SUSTITUYEN, dichas donde se escriben. Sin
          // esto nadie descubre que existen.
          ayuda="Puedes usar {nombre} y {fecha}: se cambian por lo que diga el registro."
        />

        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Descripción</span>
          <textarea
            className="rec-area"
            rows={2}
            maxLength={500}
            value={datos.plantillaDetalle}
            onChange={(e) => poner('plantillaDetalle', e.target.value)}
          />
        </label>

        <div className="pz-dos">
          <label className="pz-campo">
            <span className="tt-etiqueta">Cuántos días</span>
            <input
              type="number"
              min={0}
              max={90}
              inputMode="numeric"
              value={String(datos.diasAntes)}
              onChange={(e) => poner('diasAntes', Number(e.target.value) || 0)}
            />
            <span className="tt-secundario">{QUE_SIGNIFICAN_LOS_DIAS[datos.evento]}</span>
          </label>

          <label className="pz-campo">
            <span className="tt-etiqueta">Hora</span>
            <input type="time" value={datos.hora} onChange={(e) => poner('hora', e.target.value)} />
            <span className="tt-secundario">Sin hora es de todo el día.</span>
          </label>
        </div>

        <div className="pz-dos">
          <label className="pz-campo">
            <span className="tt-etiqueta">Prioridad</span>
            <select
              value={datos.prioridad}
              onChange={(e) => poner('prioridad', e.target.value as PrioridadDeRecordatorio)}
            >
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {COMO_SE_DICE_LA_PRIORIDAD[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="pz-campo">
            <span className="tt-etiqueta">Categoría</span>
            <select
              value={datos.categoriaId}
              onChange={(e) => poner('categoriaId', e.target.value)}
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="pz-campo">
          <span className="tt-etiqueta">Responsable</span>
          <select
            value={datos.responsableId}
            onChange={(e) => poner('responsableId', e.target.value)}
          >
            <option value="">Sin asignar</option>
            {responsables.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
