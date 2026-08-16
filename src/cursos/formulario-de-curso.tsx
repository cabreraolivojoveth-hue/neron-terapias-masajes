/**
 * EL FORMULARIO DE UN CURSO.
 *
 * DOS SECCIONES, NO VEINTE CAMPOS DE GOLPE. Lo basico —nombre, categoria,
 * fechas, precio, cupo— siempre visible; la modalidad, el lugar, la imagen y
 * las notas, plegados.
 *
 * EL LUGAR DEPENDE DE LA MODALIDAD. Un curso en linea no tiene sala, y pedir
 * una direccion para algo que pasa en una videollamada solo consigue que
 * alguien escriba "n/a" ahi.
 *
 * EL CUPO VACIO ES "SIN LIMITE", y se guarda como nulo. Jamas como 999999: ese
 * numero acaba impreso en una pantalla y nadie sabe si es un cupo o un error.
 */

import { AreaDeTexto, Boton, Campo, Seleccion } from '@neron/base/ui';
import { Modal } from '../ui/modal.js';
import { Plegable } from '../ui/plegable.js';
import { aCentavos, aPesos } from '@neron/base/utils';
import { useState, type FormEvent } from 'react';
import type { Categoria } from '../datos/categorias.js';
import type { DatosDeCurso, Modalidad } from '../datos/cursos.js';

export type ErroresDeCurso = Partial<Record<keyof DatosDeCurso, string>>;

export const MODALIDADES: readonly { valor: Modalidad; texto: string }[] = [
  { valor: 'presencial', texto: 'Presencial' },
  { valor: 'en_linea', texto: 'En línea' },
  { valor: 'hibrido', texto: 'Híbrido' },
];

export const CURSO_VACIO: DatosDeCurso = {
  nombre: '',
  subtitulo: '',
  descripcion: '',
  categoriaId: '',
  instructorId: '',
  fechaInicio: '',
  fechaFin: '',
  precioCentavos: 0,
  cupo: null,
  modalidad: 'presencial',
  lugar: '',
  enlace: '',
  imagenUrl: '',
  notas: '',
  activo: true,
};

/** Si esa modalidad necesita una direccion fisica. */
export const necesitaLugar = (m: Modalidad): boolean => m === 'presencial' || m === 'hibrido';
/** Si esa modalidad necesita un enlace de conexion. */
export const necesitaEnlace = (m: Modalidad): boolean => m === 'en_linea' || m === 'hibrido';

export function validarCurso(d: DatosDeCurso): ErroresDeCurso {
  const e: ErroresDeCurso = {};

  if (!d.nombre.trim()) {
    // Un nombre de puros espacios pasa cualquier "no vacio" y deja un renglon
    // en blanco en la lista que nadie sabe que curso es.
    e.nombre = 'Escribe el nombre del curso.';
  } else if (d.nombre.trim().length > 120) {
    e.nombre = 'El nombre no puede pasar de 120 letras.';
  }

  if (!d.fechaInicio) {
    e.fechaInicio = 'El curso necesita una fecha de inicio.';
  }

  // Se comparan como `aaaa-mm-dd`, que es lo que trae el campo nativo: comparar
  // `dd/mm/aaaa` como texto diria que el 02/01 va antes que el 15/12.
  if (d.fechaInicio && d.fechaFin && aComparable(d.fechaFin) < aComparable(d.fechaInicio)) {
    e.fechaFin = 'El curso no puede terminar antes de empezar.';
  }

  if (!Number.isFinite(d.precioCentavos) || d.precioCentavos < 0) {
    e.precioCentavos = 'El precio no puede ser negativo.';
  }

  // Cupo en cero NO es "sin limite": es un curso al que nadie puede entrar.
  // Sin limite se dice dejandolo vacio.
  if (d.cupo !== null && (!Number.isFinite(d.cupo) || d.cupo <= 0)) {
    e.cupo = 'El cupo tiene que ser mayor que cero. Déjalo vacío si no hay límite.';
  }

  if (necesitaEnlace(d.modalidad) && !d.enlace.trim()) {
    e.enlace = 'Un curso en línea necesita el enlace de conexión.';
  }

  return e;
}

/** `dd/mm/aaaa` → `aaaa-mm-dd`, comparable como texto. */
function aComparable(f: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : f;
}

/** `dd/mm/aaaa` → `aaaa-mm-dd`, que es lo que quiere un campo de fecha. */
export function aInputFecha(f: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

export function deInputFecha(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Pesos escritos → centavos. Vacio es cero: un curso de cortesia existe. */
function pesosACentavos(texto: string): number {
  const c = aCentavos(texto.replace(/[^\d.,-]/g, '').replace(',', '.'));
  return c ?? 0;
}

export interface PropiedadesDelFormularioDeCurso {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly inicial: DatosDeCurso;
  readonly categorias: readonly Categoria[];
  readonly instructores: readonly { id: string; nombre: string }[];
  readonly trabajando: boolean;
  readonly error: string | null;
  onGuardar(datos: DatosDeCurso): void;
  onCerrar(): void;
}

export function FormularioDeCurso({
  abierto,
  titulo,
  inicial,
  categorias,
  instructores,
  trabajando,
  error,
  onGuardar,
  onCerrar,
}: PropiedadesDelFormularioDeCurso) {
  const [v, setV] = useState<DatosDeCurso>(inicial);
  const [precio, setPrecio] = useState(() => String(aPesos(inicial.precioCentavos)));
  const [cupo, setCupo] = useState(() => (inicial.cupo === null ? '' : String(inicial.cupo)));
  const [errores, setErrores] = useState<ErroresDeCurso>({});
  const [extras, setExtras] = useState(false);

  const poner = <K extends keyof DatosDeCurso>(k: K, valor: DatosDeCurso[K]): void =>
    setV((a) => ({ ...a, [k]: valor }));

  function enviar(e: FormEvent): void {
    e.preventDefault();
    const datos: DatosDeCurso = {
      ...v,
      precioCentavos: pesosACentavos(precio),
      // Vacio = sin limite = nulo. NO cero, que significaria que no cabe nadie.
      cupo: cupo.trim() === '' ? null : Number(cupo),
    };
    const fallos = validarCurso(datos);
    setErrores(fallos);
    if (Object.keys(fallos).length > 0) return;
    onGuardar(datos);
  }

  if (!abierto) return null;

  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCerrar}>
      <form className="pz-columna" onSubmit={enviar} noValidate>
        <Campo
          etiqueta="Nombre"
          value={v.nombre}
          onChange={(e) => poner('nombre', e.target.value)}
          obligatorio
          maxLength={120}
          {...(errores.nombre ? { error: errores.nombre } : {})}
        />

        <Campo
          etiqueta="Subtítulo"
          value={v.subtitulo}
          onChange={(e) => poner('subtitulo', e.target.value)}
          maxLength={160}
          ayuda="Una línea corta que acompaña al nombre en la lista."
        />

        <AreaDeTexto
          etiqueta="Descripción"
          value={v.descripcion}
          onChange={(e) => poner('descripcion', e.target.value)}
          rows={3}
          maxLength={2000}
          ayuda="Qué se aprende. Se ve en la ficha del curso."
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
            etiqueta="Instructor"
            value={v.instructorId}
            onChange={(e) => poner('instructorId', e.target.value)}
            ayuda="Sale del equipo del centro, no se escribe a mano."
            opciones={[
              { valor: '', texto: 'Sin asignar' },
              ...instructores.map((p) => ({ valor: p.id, texto: p.nombre })),
            ]}
          />
        </div>

        <div className="pz-dos">
          <Campo
            etiqueta="Empieza"
            type="date"
            value={aInputFecha(v.fechaInicio)}
            onChange={(e) => poner('fechaInicio', deInputFecha(e.target.value))}
            obligatorio
            {...(errores.fechaInicio ? { error: errores.fechaInicio } : {})}
          />
          <Campo
            etiqueta="Termina"
            type="date"
            value={aInputFecha(v.fechaFin)}
            onChange={(e) => poner('fechaFin', deInputFecha(e.target.value))}
            {...(errores.fechaFin ? { error: errores.fechaFin } : {})}
            ayuda="Vacío = un solo día."
          />
        </div>

        <div className="pz-dos">
          <Campo
            etiqueta="Precio"
            type="text"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            obligatorio
            {...(errores.precioCentavos ? { error: errores.precioCentavos } : {})}
            ayuda="En pesos. Un curso gratuito va en 0."
          />
          <Campo
            etiqueta="Cupo máximo"
            type="text"
            inputMode="numeric"
            value={cupo}
            onChange={(e) => setCupo(e.target.value.replace(/[^\d]/g, ''))}
            {...(errores.cupo ? { error: errores.cupo } : {})}
            ayuda="Déjalo vacío si no hay límite de personas."
          />
        </div>

        <Plegable
          titulo="Lo demás del curso"
          detalle="Horario, lugar, requisitos y lo que incluye"
          abierto={extras}
          onAlternar={() => setExtras((a) => !a)}
        >
            <div className="pz-dos">
              <Seleccion
                etiqueta="Modalidad"
                value={v.modalidad}
                onChange={(e) => poner('modalidad', e.target.value as Modalidad)}
                opciones={MODALIDADES.map((m) => ({ valor: m.valor, texto: m.texto }))}
              />
              <Seleccion
                etiqueta="Estado"
                value={v.activo ? 'activo' : 'inactivo'}
                onChange={(e) => poner('activo', e.target.value === 'activo')}
                ayuda="Un curso inactivo deja de ofrecerse. Los inscritos no se pierden."
                opciones={[
                  { valor: 'activo', texto: 'Activo' },
                  { valor: 'inactivo', texto: 'Inactivo' },
                ]}
              />
            </div>

            {/* EL CAMPO SE PIDE SEGUN LA MODALIDAD. Pedir una direccion para un
                curso en linea solo consigue que alguien escriba "n/a" ahi. */}
            {necesitaLugar(v.modalidad) ? (
              <Campo
                etiqueta="Lugar"
                value={v.lugar}
                onChange={(e) => poner('lugar', e.target.value)}
                maxLength={200}
                ayuda="Dónde se imparte."
              />
            ) : null}

            {necesitaEnlace(v.modalidad) ? (
              <Campo
                etiqueta="Enlace de conexión"
                value={v.enlace}
                onChange={(e) => poner('enlace', e.target.value)}
                maxLength={500}
                {...(errores.enlace ? { error: errores.enlace } : {})}
                ayuda="La liga de la videollamada."
              />
            ) : null}

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
              rows={3}
              maxLength={2000}
              ayuda="Solo para el equipo. No se les muestran a los alumnos."
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
