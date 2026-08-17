/**
 * EL FORMULARIO DE UN SERVICIO.
 *
 * DOS SECCIONES, NO VEINTE CAMPOS DE GOLPE. Lo basico —nombre, categoria,
 * duracion, precio— siempre visible; la promocion, la disponibilidad, la
 * preparacion y el color, plegados. Un formulario de alta con quince campos a
 * la vista hace que se capture menos, no mas.
 *
 * LOS CAMPOS NO SE RECREAN: todo componente vive fuera de la funcion que pinta.
 * Definir uno adentro hace que React lo trate como nuevo en cada render,
 * destruya el campo y el foco se pierda despues de cada letra.
 *
 * EL PRECIO SE CAPTURA EN PESOS Y SE GUARDA EN CENTAVOS. Guardar dinero con
 * decimales acaba en totales que no cuadran por un centavo, y esos son los que
 * nadie encuentra.
 */

import { AreaDeTexto, Boton, Campo, Seleccion } from '@neron/base/ui';
import { Modal } from '../ui/modal.js';
import { Plegable } from '../ui/plegable.js';
import { aCentavos, aPesos } from '@neron/base/utils';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Categoria, DatosDeServicio } from '../datos/servicios.js';
import { COLOR_POR_OMISION } from '../marca.js';

export type ErroresDeServicio = Partial<Record<keyof DatosDeServicio, string>>;

/** Los siete dias, en digitos ISO: 1 es lunes y 7 domingo. */
export const DIAS_DE_LA_SEMANA: readonly { clave: string; corto: string; largo: string }[] = [
  { clave: '1', corto: 'Lun', largo: 'lunes' },
  { clave: '2', corto: 'Mar', largo: 'martes' },
  { clave: '3', corto: 'Mié', largo: 'miércoles' },
  { clave: '4', corto: 'Jue', largo: 'jueves' },
  { clave: '5', corto: 'Vie', largo: 'viernes' },
  { clave: '6', corto: 'Sáb', largo: 'sábado' },
  { clave: '7', corto: 'Dom', largo: 'domingo' },
];

const DURACIONES = [15, 30, 45, 60, 75, 90, 120, 150, 180];

export const SERVICIO_VACIO: DatosDeServicio = {
  nombre: '',
  descripcion: '',
  categoriaId: '',
  duracionMin: 60,
  precioCentavos: 0,
  precioPromocionalCentavos: null,
  promocionDesde: '',
  promocionHasta: '',
  color: '',
  requierePreparacion: false,
  preparacion: '',
  // NULO Y NO CERO: un servicio nuevo hereda lo de su categoria mientras nadie
  // escriba nada. Nacer en cero seria desobedecerla sin que nadie lo pidiera.
  preparacionAntesMin: null,
  preparacionDespuesMin: null,
  notas: '',
  diasDisponibles: '',
  horaDesde: '',
  horaHasta: '',
  activo: true,
};

export function validarServicio(d: DatosDeServicio): ErroresDeServicio {
  const e: ErroresDeServicio = {};

  if (!d.nombre.trim()) {
    // Un nombre de puros espacios pasa cualquier "no vacio" y deja un renglon
    // en blanco en la agenda que nadie sabe que servicio es.
    e.nombre = 'Escribe el nombre del servicio.';
  } else if (d.nombre.trim().length > 100) {
    e.nombre = 'El nombre no puede pasar de 100 letras.';
  }

  if (!Number.isFinite(d.duracionMin) || d.duracionMin <= 0) {
    // La duracion calcula la hora de fin de cada cita: en cero o negativa, la
    // base rechaza la cita con un mensaje que no ayuda en un mostrador.
    e.duracionMin = 'La duración tiene que ser mayor que cero.';
  } else if (d.duracionMin > 24 * 60) {
    e.duracionMin = 'Una sesión no puede durar más de un día.';
  }

  if (!Number.isFinite(d.precioCentavos) || d.precioCentavos < 0) {
    e.precioCentavos = 'El precio no puede ser negativo.';
  }

  if (d.precioPromocionalCentavos !== null) {
    if (d.precioPromocionalCentavos < 0) {
      e.precioPromocionalCentavos = 'El precio promocional no puede ser negativo.';
    } else if (d.precioPromocionalCentavos > d.precioCentavos) {
      // No es un capricho: una "promocion" mas cara que el precio de lista
      // significa que alguien escribio el numero en el campo equivocado.
      e.precioPromocionalCentavos = 'La promoción no puede costar más que el precio normal.';
    }
  }

  if (d.promocionDesde && d.promocionHasta && d.promocionHasta < d.promocionDesde) {
    e.promocionHasta = 'La promoción no puede terminar antes de empezar.';
  }

  if (d.horaDesde && d.horaHasta && d.horaHasta <= d.horaDesde) {
    e.horaHasta = 'La hora de cierre tiene que ser después de la de apertura.';
  }

  if (d.requierePreparacion && !d.preparacion.trim()) {
    // "Requiere preparacion: si" sin decir cual no le sirve a nadie: quien
    // recibe al paciente no sabe que pedirle.
    e.preparacion = 'Si requiere preparación, escribe en qué consiste.';
  }

  /*
   * EL TOPE DE CUATRO HORAS ATRAPA EL CERO DE MAS.
   *
   * "150" en vez de "15" convierte un servicio de una hora en un bloque de dos
   * y media, y lo que se ve despues es una agenda sin huecos sin ninguna pista
   * de por que. La base lo rechaza igual; aqui se dice antes y mejor.
   */
  for (const [campo, valor] of [
    ['preparacionAntesMin', d.preparacionAntesMin],
    ['preparacionDespuesMin', d.preparacionDespuesMin],
  ] as const) {
    if (valor === null) continue;
    if (!Number.isFinite(valor) || valor < 0) {
      e[campo] = 'No puede ser negativo. Déjalo vacío para heredar la categoría.';
    } else if (valor > 240) {
      e[campo] = 'Son minutos: como mucho 240. ¿Escribiste un cero de más?';
    }
  }

  return e;
}

/**
 * Lo escrito en el campo → minutos, o `null` para heredar.
 *
 * VACIO ES HEREDAR, no cero. Es toda la diferencia entre "sigo a mi categoria"
 * y "yo no llevo preparacion aunque mi categoria si" — y las dos hacen falta.
 */
export function minutosOHereda(escrito: string): number | null {
  const limpio = escrito.trim();
  if (limpio === '') return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * EL RESULTADO, EN PALABRAS: cuanto ocupa la sala de verdad.
 *
 * Sin esta linea hay que sumar de cabeza tres campos para saber que va a
 * bloquear la agenda, y ese es justo el calculo que nadie hace antes de
 * guardar. Cuando los dos estan vacios no se afirma nada de la categoria: esta
 * pantalla no la tiene cargada, y decir "heredarás 15" sin saberlo seria peor
 * que no decir nada.
 */
export function leerElBloqueo(d: DatosDeServicio): string {
  const antes = d.preparacionAntesMin;
  const despues = d.preparacionDespuesMin;
  if (antes === null && despues === null) {
    return 'Sin minutos propios: se usan los de la categoría, o ninguno si no tiene.';
  }
  const total = d.duracionMin + (antes ?? 0) + (despues ?? 0);
  const partes = [`${d.duracionMin} min de sesión`];
  if (antes) partes.push(`${antes} antes`);
  if (despues) partes.push(`${despues} después`);
  return `La agenda bloquea ${total} minutos: ${partes.join(' + ')}.`;
}

/* ------------------------------------------------------------------ */

export interface PropiedadesDelFormulario {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly inicial: DatosDeServicio;
  readonly categorias: readonly Categoria[];
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(datos: DatosDeServicio): void;
  onBuscarParecido(nombre: string): Promise<{ id: string; nombre: string } | null>;
  onCerrar(): void;
}

const ESPERA_MS = 400;

/** Pesos escritos → centavos. Vacio es cero, no `null`: un servicio gratis existe. */
function pesosACentavos(texto: string): number {
  const c = aCentavos(texto.replace(/[^\d.,-]/g, '').replace(',', '.'));
  return c ?? 0;
}

export function FormularioDeServicio({
  abierto,
  titulo,
  inicial,
  categorias,
  trabajando,
  error,
  onGuardar,
  onBuscarParecido,
  onCerrar,
}: PropiedadesDelFormulario) {
  const [v, setV] = useState<DatosDeServicio>(inicial);
  const [precio, setPrecio] = useState(() => String(aPesos(inicial.precioCentavos)));
  const [promo, setPromo] = useState(() =>
    inicial.precioPromocionalCentavos === null ? '' : String(aPesos(inicial.precioPromocionalCentavos)),
  );
  const [errores, setErrores] = useState<ErroresDeServicio>({});
  const [parecido, setParecido] = useState<{ id: string; nombre: string } | null>(null);
  const [extras, setExtras] = useState(false);

  const poner = <K extends keyof DatosDeServicio>(k: K, valor: DatosDeServicio[K]): void =>
    setV((a) => ({ ...a, [k]: valor }));

  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  /**
   * El aviso de "ya existe uno parecido" espera a que dejen de escribir.
   *
   * Sin la espera, cada tecla manda una consulta y las respuestas llegan
   * desordenadas: la de "Mas" contesta despues que la de "Masaje" y el aviso
   * termina hablando de otro servicio.
   */
  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => {
      void onBuscarParecido(v.nombre).then((p) => {
        if (vivo.current) setParecido(p);
      });
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [abierto, v.nombre, onBuscarParecido]);

  function enviar(e: FormEvent): void {
    e.preventDefault();
    const datos: DatosDeServicio = {
      ...v,
      precioCentavos: pesosACentavos(precio),
      precioPromocionalCentavos: promo.trim() === '' ? null : pesosACentavos(promo),
    };
    const fallos = validarServicio(datos);
    setErrores(fallos);
    if (Object.keys(fallos).length > 0) return;
    onGuardar(datos);
  }

  const alternarDia = (clave: string): void => {
    const puestos = new Set((v.diasDisponibles || '').split(''));
    if (puestos.has(clave)) puestos.delete(clave);
    else puestos.add(clave);
    poner('diasDisponibles', [...puestos].sort().join(''));
  };

  if (!abierto) return null;

  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCerrar}>
      <form className="pz-columna" onSubmit={enviar} noValidate>
        <Campo
          etiqueta="Nombre"
          value={v.nombre}
          onChange={(e) => poner('nombre', e.target.value)}
          obligatorio
          maxLength={100}
          {...(errores.nombre ? { error: errores.nombre } : {})}
        />

        {parecido ? (
          <div className="pz-aviso" role="alert">
            <p>
              Ya hay un servicio que se llama igual: <strong>{parecido.nombre}</strong>.
            </p>
            <p className="tt-secundario">
              Dos renglones iguales en el catálogo dejan la mitad de las citas colgando de uno y la
              mitad del otro, y ningún reporte por servicio vuelve a cuadrar.
            </p>
          </div>
        ) : null}

        <AreaDeTexto
          etiqueta="Descripción"
          value={v.descripcion}
          onChange={(e) => poner('descripcion', e.target.value)}
          rows={2}
          maxLength={500}
          ayuda="Una línea que explique en qué consiste. Se ve en la lista y en la agenda."
        />

        <div className="pz-dos">
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
          <Seleccion
            etiqueta="Duración"
            value={String(v.duracionMin)}
            onChange={(e) => poner('duracionMin', Number(e.target.value))}
            obligatorio
            {...(errores.duracionMin ? { error: errores.duracionMin } : {})}
            opciones={DURACIONES.map((d) => ({ valor: String(d), texto: `${d} minutos` }))}
          />
        </div>

        {/*
          LA PREPARACION VA JUNTO A LA DURACION, y no plegada con lo opcional.

          Es lo que bloquea agenda de verdad: un masaje con piedras de una hora
          con quince minutos de limpieza ocupa hora y cuarto, y hasta ahora el
          sistema ofrecia la hora siguiente como libre. Escondida detras de
          "Información adicional" nadie la pone, y el problema se queda.

          VACIO NO ES CERO. Vacio significa "lo que diga mi categoria"; un cero
          escrito es "ninguno, y lo digo yo". Por eso el campo puede quedarse en
          blanco y por eso debajo se dice cuanto se va a bloquear al final.
        */}
        <div className="pz-dos">
          <Campo
            etiqueta="Preparación antes"
            type="number"
            min={0}
            max={240}
            value={v.preparacionAntesMin === null ? '' : String(v.preparacionAntesMin)}
            onChange={(e) => poner('preparacionAntesMin', minutosOHereda(e.target.value))}
            {...(errores.preparacionAntesMin ? { error: errores.preparacionAntesMin } : {})}
            ayuda="Minutos para acomodar antes. Vacío hereda de la categoría."
          />
          <Campo
            etiqueta="Preparación después"
            type="number"
            min={0}
            max={240}
            value={v.preparacionDespuesMin === null ? '' : String(v.preparacionDespuesMin)}
            onChange={(e) => poner('preparacionDespuesMin', minutosOHereda(e.target.value))}
            {...(errores.preparacionDespuesMin ? { error: errores.preparacionDespuesMin } : {})}
            ayuda="Minutos para limpiar y preparar después."
          />
        </div>

        {/* SE DICE EL RESULTADO, no solo los ingredientes. Quien pone "15" en
            un servicio de 60 minutos necesita leer que la sala queda ocupada 75
            — que es lo que la agenda va a bloquear de verdad. */}
        <p className="srv-bloqueo" role="status">
          {leerElBloqueo(v)}
        </p>

        <div className="pz-dos">
          <Campo
            etiqueta="Precio"
            type="text"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            obligatorio
            {...(errores.precioCentavos ? { error: errores.precioCentavos } : {})}
            ayuda="En pesos. Un servicio de cortesía va en 0."
          />
          <Seleccion
            etiqueta="Estado"
            value={v.activo ? 'activo' : 'inactivo'}
            onChange={(e) => poner('activo', e.target.value === 'activo')}
            ayuda="Un servicio inactivo deja de ofrecerse para citas y ventas nuevas."
            opciones={[
              { valor: 'activo', texto: 'Activo' },
              { valor: 'inactivo', texto: 'Inactivo' },
            ]}
          />
        </div>

        <Plegable
          titulo="Lo demás del servicio"
          detalle="Promoción, color en la agenda, días en que se ofrece y notas"
          abierto={extras}
          onAlternar={() => setExtras((a) => !a)}
        >
            <div className="pz-dos">
              <Campo
                etiqueta="Precio promocional"
                type="text"
                inputMode="decimal"
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                {...(errores.precioPromocionalCentavos
                  ? { error: errores.precioPromocionalCentavos }
                  : {})}
                ayuda="Déjalo vacío si no hay promoción."
              />
              <Campo
                etiqueta="Color en agenda"
                type="color"
                // Un campo de color NO entiende una variable de CSS: necesita
                // un hex literal. Sale de `marca.ts`, que es donde viven los
                // colores del producto y donde ya paso la prueba de contraste.
                value={v.color || COLOR_POR_OMISION}
                onChange={(e) => poner('color', e.target.value)}
                ayuda="Con qué color se pinta este servicio en el calendario."
              />
            </div>

            <div className="pz-dos">
              <Campo
                etiqueta="La promoción empieza"
                type="date"
                value={aInput(v.promocionDesde)}
                onChange={(e) => poner('promocionDesde', deInput(e.target.value))}
                ayuda="Vacío = desde siempre."
              />
              <Campo
                etiqueta="La promoción termina"
                type="date"
                value={aInput(v.promocionHasta)}
                onChange={(e) => poner('promocionHasta', deInput(e.target.value))}
                {...(errores.promocionHasta ? { error: errores.promocionHasta } : {})}
                ayuda="Vacío = sin fecha de fin."
              />
            </div>

            <fieldset className="srv-dias">
              <legend className="tt-etiqueta">Días en que se ofrece</legend>
              <div className="srv-dias__fila">
                {DIAS_DE_LA_SEMANA.map((d) => {
                  const puesto = (v.diasDisponibles || '').includes(d.clave);
                  return (
                    <button
                      key={d.clave}
                      type="button"
                      className={`srv-dia${puesto ? ' srv-dia--puesto' : ''}`}
                      aria-pressed={puesto}
                      aria-label={d.largo}
                      onClick={() => alternarDia(d.clave)}
                    >
                      {d.corto}
                    </button>
                  );
                })}
              </div>
              <p className="srv-dias__nota">
                Sin ningún día marcado se ofrece según el horario del centro.
              </p>
            </fieldset>

            <div className="pz-dos">
              <Campo
                etiqueta="Desde las"
                type="time"
                value={v.horaDesde}
                onChange={(e) => poner('horaDesde', e.target.value)}
              />
              <Campo
                etiqueta="Hasta las"
                type="time"
                value={v.horaHasta}
                onChange={(e) => poner('horaHasta', e.target.value)}
                {...(errores.horaHasta ? { error: errores.horaHasta } : {})}
              />
            </div>

            <label className="srv-casilla">
              <input
                type="checkbox"
                checked={v.requierePreparacion}
                onChange={(e) => poner('requierePreparacion', e.target.checked)}
              />
              <span>Requiere preparación</span>
            </label>

            {v.requierePreparacion ? (
              <AreaDeTexto
                etiqueta="En qué consiste la preparación"
                value={v.preparacion}
                onChange={(e) => poner('preparacion', e.target.value)}
                rows={2}
                maxLength={1000}
                {...(errores.preparacion ? { error: errores.preparacion } : {})}
                ayuda="Lo que hay que decirle al paciente antes de la sesión."
              />
            ) : null}

            <AreaDeTexto
              etiqueta="Notas internas"
              value={v.notas}
              onChange={(e) => poner('notas', e.target.value)}
              rows={3}
              maxLength={2000}
              ayuda="Solo para el equipo. No se le muestran al paciente."
            />
        </Plegable>

        {error ? (
          <p className="pz-error__que" role="alert">
            {error}
          </p>
        ) : null}

        <div className="pz-ficha__pie">
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

/** `dd/mm/aaaa` → `aaaa-mm-dd`, que es lo que quiere un campo de fecha. */
export function aInput(f: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

export function deInput(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
