/**
 * EL FORMULARIO DE UN RECORDATORIO — el mismo para el alta y para la edicion.
 *
 * DOS FORMULARIOS PARECIDOS SE ACABAN SEPARANDO: uno recibe un arreglo y el
 * otro no, y ese arreglo es justo el que despues nadie encuentra. Aqui cambia el
 * titulo del dialogo y nada mas.
 *
 * LOS CAMPOS NO PIERDEN EL FOCO. El dialogo entra por `src/ui/modal.tsx`, que le
 * amarra a la base una funcion de cierre de identidad estable: con el `Modal` de
 * la base a pelo, cada repintado del padre vuelve a enfocar el primer campo y
 * las letras se van al campo equivocado mientras escribes. Lo vigila la
 * guardia 15.
 *
 * "REPETIR" CAMBIA LO QUE SE GUARDA, no solo lo que se ve. Con la casilla
 * puesta, guardar crea una REGLA (`recordatorio_recurrente`) y la base genera la
 * primera ocurrencia; sin ella, crea un recordatorio suelto. Que un mismo boton
 * guarde dos cosas distintas es raro, y por eso el pie del dialogo lo dice con
 * todas sus letras antes de que alguien lo apriete.
 *
 * LA RELACION SE BUSCA, NO SE DESPLIEGA. Un selector con los mil doscientos
 * pacientes del centro hay que bajarlo entero para que nadie encuentre a nadie.
 */

import { Boton, Campo } from '@neron/base/ui';
import { useState } from 'react';
import type { Categoria } from '../datos/categorias.js';
import type { ProfesionalBreve } from '../datos/citas.js';
import {
  ANTICIPACIONES,
  COMO_SE_DICE_LA_ENTIDAD,
  COMO_SE_DICE_LA_FRECUENCIA,
  COMO_SE_DICE_LA_PRIORIDAD,
  ENTIDADES,
  FRECUENCIAS,
  PRIORIDADES,
  type DatosDeRecordatorio,
  type EntidadDeRecordatorio,
  type FrecuenciaDeRepeticion,
  type OpcionDeRelacion,
  type PrioridadDeRecordatorio,
} from '../datos/recordatorios.js';
import { Icono } from '../ui/iconos.js';
import { Modal } from '../ui/modal.js';
import { Plegable } from '../ui/plegable.js';
import { DIAS_DE_LA_SEMANA, repeticionEnPalabras } from './plazos.js';
import { aISOSeguro, deISOSeguro } from './tabla-de-recordatorios.js';

export interface PropiedadesDelFormulario {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly datos: DatosDeRecordatorio;
  /** El nombre de lo ya relacionado, resuelto. Se enseña para poder quitarlo. */
  readonly relacionado: string | null;
  readonly buscandoRelacion: string;
  readonly opcionesDeRelacion: readonly OpcionDeRelacion[];
  readonly buscandoRelacionEnCurso: boolean;
  readonly categorias: readonly Categoria[];
  readonly responsables: readonly ProfesionalBreve[];
  /** Cuánto antes avisa el centro cuando el recordatorio no dice otra cosa. */
  readonly anticipacionDelCentro: number;
  readonly puedeAdministrarCategorias: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  readonly mostrarErrores: boolean;
  readonly loQueFalta: Readonly<Record<string, string>>;
  onCambiar(d: DatosDeRecordatorio): void;
  onBuscarRelacion(texto: string): void;
  onGuardar(): void;
  onCerrar(): void;
  onAdministrarCategorias(): void;
}

export function FormularioDeRecordatorio({
  abierto,
  titulo,
  datos,
  relacionado,
  buscandoRelacion,
  opcionesDeRelacion,
  buscandoRelacionEnCurso,
  categorias,
  responsables,
  anticipacionDelCentro,
  puedeAdministrarCategorias,
  trabajando,
  error,
  mostrarErrores,
  loQueFalta,
  onCambiar,
  onBuscarRelacion,
  onGuardar,
  onCerrar,
  onAdministrarCategorias,
}: PropiedadesDelFormulario) {
  /**
   * LAS DOS SECCIONES QUE SE PLIEGAN SE ABREN SOLAS SI YA TRAEN ALGO.
   *
   * Editar un recordatorio que ya esta relacionado con una cita y encontrarse
   * la seccion cerrada hace pensar que la relacion se perdio — y lo primero que
   * se hace entonces es volver a ponerla, que es como acaban duplicadas.
   */
  const [relacionAbierta, setRelacionAbierta] = useState(false);
  const [repeticionAbierta, setRepeticionAbierta] = useState(false);

  const poner = <K extends keyof DatosDeRecordatorio>(
    k: K,
    v: DatosDeRecordatorio[K],
  ): void => onCambiar({ ...datos, [k]: v });

  const falla = (campo: string): string | undefined =>
    mostrarErrores ? loQueFalta[campo] : undefined;

  const diaPuesto = (iso: number): boolean => datos.diasSemana.includes(iso);
  const cambiarDia = (iso: number): void => {
    poner(
      'diasSemana',
      diaPuesto(iso)
        ? datos.diasSemana.filter((d) => d !== iso)
        : [...datos.diasSemana, iso].sort((a, b) => a - b),
    );
  };

  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      ancho
      bloqueado={trabajando}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton tono="contorno" type="button" onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </Boton>
          <Boton tono="principal" type="button" trabajando={trabajando} onClick={onGuardar}>
            {/* EL BOTON DICE QUE VA A CREAR. Con la casilla de repetir puesta
                no se guarda un recordatorio: se guarda una regla que los va a
                ir creando. Enterarse despues es de las sorpresas caras. */}
            {datos.repetir ? 'Crear la repetición' : 'Guardar recordatorio'}
          </Boton>
        </>
      }
    >
      <div className="rec-forma">
        <Campo
          etiqueta="Título"
          obligatorio
          maxLength={160}
          autoComplete="off"
          placeholder="Qué hay que hacer"
          value={datos.titulo}
          onChange={(e) => poner('titulo', e.target.value)}
          {...(falla('titulo') ? { error: falla('titulo') } : {})}
        />

        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Descripción</span>
          {/* Un area de texto y no un campo de una linea: la descripcion es
              donde se explica que hay que hacer, y en un campo corto no cabe. */}
          <textarea
            className="rec-area"
            rows={2}
            maxLength={1000}
            placeholder="Qué hay que hacer, o qué hay que recordar"
            value={datos.detalle}
            onChange={(e) => poner('detalle', e.target.value)}
          />
        </label>

        <div className="pz-dos">
          <label className="pz-campo">
            <span className="tt-etiqueta">
              {datos.repetir ? 'Empieza el *' : 'Fecha *'}
            </span>
            <input
              type="date"
              value={aISOSeguro(datos.fecha)}
              onChange={(e) => poner('fecha', deISOSeguro(e.target.value))}
            />
            {falla('fecha') ? <span className="pz-error__detalle">{falla('fecha')}</span> : null}
          </label>

          <label className="pz-campo">
            <span className="tt-etiqueta">Hora</span>
            <input
              type="time"
              value={datos.hora}
              onChange={(e) => poner('hora', e.target.value)}
            />
            {/* LA HORA ES OPCIONAL, y se dice. Obligar a inventarle una hace que
                todo acabe a medianoche y que el aviso salga de madrugada. */}
            <span className="tt-secundario">Sin hora es de todo el día.</span>
            {falla('hora') ? <span className="pz-error__detalle">{falla('hora')}</span> : null}
          </label>
        </div>

        <div className="pz-dos">
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
            {puedeAdministrarCategorias ? (
              <button type="button" className="pz-enlace pz-enlace--pelado" onClick={onAdministrarCategorias}>
                Administrar categorías
              </button>
            ) : null}
          </label>

          <label className="pz-campo">
            <span className="tt-etiqueta">Responsable</span>
            <select
              value={datos.responsableId}
              onChange={(e) => poner('responsableId', e.target.value)}
            >
              {/* LA LISTA SALE DE LAS MEMBRESIAS REALES DEL CENTRO. No hay una
                  tabla de responsables aparte ni un campo de texto libre: un
                  nombre escrito a mano no se puede filtrar ni avisar. */}
              <option value="">Sin asignar</option>
              {responsables.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
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
            <span className="tt-etiqueta">Avisar</span>
            <select
              value={datos.anticipacionMin}
              onChange={(e) => poner('anticipacionMin', e.target.value)}
            >
              {/* LO QUE DIGA EL CENTRO ES LA OPCION POR OMISION, y dice cual es.
                  "Usar lo del centro" a secas obliga a ir a Configuración solo
                  para saber que se acaba de escoger. */}
              <option value="">
                Lo que diga el centro (
                {ANTICIPACIONES.find((a) => a.minutos === anticipacionDelCentro)?.etiqueta.toLowerCase() ??
                  `${anticipacionDelCentro} min antes`}
                )
              </option>
              {ANTICIPACIONES.map((a) => (
                <option key={a.minutos} value={String(a.minutos)}>
                  {a.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Plegable
          titulo="Relacionar con algo del centro"
          detalle={relacionado ?? (datos.entidadTipo !== '' ? 'A medias' : 'Sin relación')}
          abierto={relacionAbierta || datos.entidadTipo !== ''}
          onAlternar={() => setRelacionAbierta((a) => !a)}
        >
          <RelacionarCon
            tipo={datos.entidadTipo}
            elegido={datos.entidadId}
            relacionado={relacionado}
            texto={buscandoRelacion}
            opciones={opcionesDeRelacion}
            buscando={buscandoRelacionEnCurso}
            error={falla('entidad') ?? null}
            onTipo={(t) => onCambiar({ ...datos, entidadTipo: t, entidadId: '' })}
            onBuscar={onBuscarRelacion}
            onElegir={(id) => poner('entidadId', id)}
            onQuitar={() => onCambiar({ ...datos, entidadTipo: '', entidadId: '' })}
          />
        </Plegable>

        <Plegable
          titulo="Repetir este recordatorio"
          detalle={
            datos.repetir
              ? repeticionEnPalabras(datos.frecuencia, Number(datos.intervalo) || 1, datos.diasSemana)
              : 'No se repite'
          }
          abierto={repeticionAbierta || datos.repetir}
          onAlternar={() => setRepeticionAbierta((a) => !a)}
        >
          <div className="rec-repeticion">
            <label className="pz-campo rec-casilla">
              <input
                type="checkbox"
                checked={datos.repetir}
                onChange={(e) => poner('repetir', e.target.checked)}
              />
              <span>Que se repita solo</span>
            </label>

            {datos.repetir ? (
              <>
                <div className="pz-dos">
                  <label className="pz-campo">
                    <span className="tt-etiqueta">Cada cuánto</span>
                    <select
                      value={datos.frecuencia}
                      onChange={(e) =>
                        poner('frecuencia', e.target.value as FrecuenciaDeRepeticion)
                      }
                    >
                      {FRECUENCIAS.map((f) => (
                        <option key={f} value={f}>
                          {COMO_SE_DICE_LA_FRECUENCIA[f]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="pz-campo">
                    <span className="tt-etiqueta">Cada cuántas veces</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      inputMode="numeric"
                      value={datos.intervalo}
                      onChange={(e) => poner('intervalo', e.target.value)}
                    />
                    {falla('intervalo') ? (
                      <span className="pz-error__detalle">{falla('intervalo')}</span>
                    ) : null}
                  </label>
                </div>

                {datos.frecuencia === 'semanal' || datos.frecuencia === 'personalizado' ? (
                  <fieldset className="rec-dias">
                    <legend className="tt-etiqueta">Qué días</legend>
                    {DIAS_DE_LA_SEMANA.map((d) => (
                      <label
                        key={d.iso}
                        className={`rec-dia${diaPuesto(d.iso) ? ' rec-dia--puesto' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="neron-solo-lectores"
                          checked={diaPuesto(d.iso)}
                          onChange={() => cambiarDia(d.iso)}
                        />
                        <span aria-hidden="true">{d.corto}</span>
                        <span className="neron-solo-lectores">{d.largo}</span>
                      </label>
                    ))}
                    {falla('diasSemana') ? (
                      <span className="pz-error__detalle">{falla('diasSemana')}</span>
                    ) : null}
                  </fieldset>
                ) : null}

                <div className="pz-dos">
                  <label className="pz-campo">
                    <span className="tt-etiqueta">Termina el</span>
                    <input
                      type="date"
                      value={aISOSeguro(datos.fechaFin)}
                      onChange={(e) => poner('fechaFin', deISOSeguro(e.target.value))}
                    />
                    {falla('fechaFin') ? (
                      <span className="pz-error__detalle">{falla('fechaFin')}</span>
                    ) : null}
                  </label>
                  <label className="pz-campo">
                    <span className="tt-etiqueta">O después de</span>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="Sin límite"
                      value={datos.repeticiones}
                      onChange={(e) => poner('repeticiones', e.target.value)}
                    />
                    {falla('repeticiones') ? (
                      <span className="pz-error__detalle">{falla('repeticiones')}</span>
                    ) : (
                      <span className="tt-secundario">veces</span>
                    )}
                  </label>
                </div>

                {/* LA REGLA ESCRITA EN ESPAÑOL, antes de guardarla. Es lo unico
                    que deja cachar que uno queria decir otra cosa antes de que
                    empiece a crear recordatorios. */}
                <p className="pz-pista">
                  <span className="pz-pista__icono" aria-hidden="true">
                    <Icono nombre="volver" lado={16} />
                  </span>
                  {repeticionEnPalabras(
                    datos.frecuencia,
                    Number(datos.intervalo) || 1,
                    datos.diasSemana,
                  )}
                  {datos.fecha ? `, a partir del ${datos.fecha}` : ''}. No se crean todos de golpe:
                  el siguiente se programa cuando se cierra el anterior.
                </p>
              </>
            ) : null}
          </div>
        </Plegable>

        <label className="pz-campo pz-campo--bloque">
          <span className="tt-etiqueta">Notas</span>
          <textarea
            className="rec-area"
            rows={2}
            maxLength={2000}
            placeholder="Lo que haga falta apuntar"
            value={datos.notas}
            onChange={(e) => poner('notas', e.target.value)}
          />
        </label>

        {error ? (
          <p className="pz-error__que" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* El escoge-con-que-se-relaciona                                      */
/* ------------------------------------------------------------------ */

export function RelacionarCon({
  tipo,
  elegido,
  relacionado,
  texto,
  opciones,
  buscando,
  error,
  onTipo,
  onBuscar,
  onElegir,
  onQuitar,
}: {
  readonly tipo: string;
  readonly elegido: string;
  readonly relacionado: string | null;
  readonly texto: string;
  readonly opciones: readonly OpcionDeRelacion[];
  readonly buscando: boolean;
  readonly error: string | null;
  onTipo(t: string): void;
  onBuscar(v: string): void;
  onElegir(id: string): void;
  onQuitar(): void;
}) {
  return (
    <div className="rec-relacion">
      <label className="pz-campo">
        <span className="tt-etiqueta">Con qué se relaciona</span>
        <select value={tipo} onChange={(e) => onTipo(e.target.value)}>
          <option value="">Con nada</option>
          {ENTIDADES.map((e) => (
            <option key={e} value={e}>
              {COMO_SE_DICE_LA_ENTIDAD[e]}
            </option>
          ))}
        </select>
      </label>

      {tipo !== '' ? (
        elegido !== '' ? (
          <div className="rec-relacion__puesta">
            <span className="pz-pastilla pz-pastilla--marca">
              {relacionado ?? COMO_SE_DICE_LA_ENTIDAD[tipo as EntidadDeRecordatorio]}
            </span>
            <button type="button" className="pz-enlace pz-enlace--pelado" onClick={onQuitar}>
              Quitar la relación
            </button>
          </div>
        ) : (
          <>
            <label className="pz-campo">
              <span className="tt-etiqueta">
                Busca {COMO_SE_DICE_LA_ENTIDAD[tipo as EntidadDeRecordatorio].toLowerCase()}
              </span>
              <input
                type="search"
                autoComplete="off"
                placeholder={tipo === 'cita' ? 'Fecha de la cita' : 'Escribe dos letras o más'}
                value={texto}
                onChange={(e) => onBuscar(e.target.value)}
              />
            </label>

            {buscando ? (
              <p className="tt-secundario">Buscando…</p>
            ) : texto.trim().length >= 2 && opciones.length === 0 ? (
              // NO ENCONTRAR ALGO SE DICE. Una lista que se queda vacia sin
              // explicacion hace pensar que el buscador se rompio.
              <p className="tt-secundario">No encontramos nada con ese texto.</p>
            ) : opciones.length > 0 ? (
              <ul className="pz-lista rec-opciones">
                {opciones.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="pz-renglon"
                      onClick={() => onElegir(o.id)}
                    >
                      <span className="pz-renglon__cuerpo">
                        <span className="pz-renglon__titulo">{o.nombre}</span>
                        {o.pista ? <span className="pz-renglon__pie">{o.pista}</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )
      ) : null}

      {error ? <p className="pz-error__detalle">{error}</p> : null}
    </div>
  );
}
