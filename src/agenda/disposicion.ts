/**
 * Donde va cada cita dentro de la columna del dia.
 *
 * Aritmetica pura: recibe citas con hora de inicio y fin, y devuelve
 * posiciones en porcentaje. Se prueba comparando numeros, sin navegador.
 *
 * Lo que resuelve y casi ningun calendario hecho a mano resuelve: cuando dos
 * citas se enciman —cosa normal, dos terapeutas atendiendo a la vez— hay que
 * repartirlas a lo ancho. Si no, una tapa a la otra y la de abajo deja de
 * existir para quien mira la pantalla.
 */

export interface CitaColocable {
  readonly id: string;
  readonly horaInicio: string;
  readonly horaFin: string;
}

export interface Colocada<T> {
  readonly cita: T;
  /** Desde arriba de la columna, en porcentaje. */
  readonly arriba: number;
  readonly alto: number;
  /** En que carril va, cuando se encima con otras. */
  readonly carril: number;
  readonly carriles: number;
}

/** Minutos desde medianoche. `null` si la hora no se entiende. */
export function minutosDe(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 24 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** De minutos a `HH:MM`. */
export function comoHora(minutos: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutos)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Reparte las citas del dia en carriles.
 *
 * `abre` y `cierra` son los minutos que se ven en pantalla — salen de la
 * configuracion del centro, no de un numero escrito aqui.
 *
 * Una cita que empieza antes de abrir o termina despues de cerrar NO se
 * esconde: se recorta a la vista. Esconderla seria peor — la persona la
 * agendo, existe, y no verla hace pensar que se perdio.
 */
export function colocar<T extends CitaColocable>(
  citas: readonly T[],
  abre: number,
  cierra: number,
): Colocada<T>[] {
  const ventana = Math.max(1, cierra - abre);

  const conMinutos = citas
    .map((cita) => {
      const inicio = minutosDe(cita.horaInicio);
      const fin = minutosDe(cita.horaFin);
      return inicio === null || fin === null ? null : { cita, inicio, fin: Math.max(fin, inicio + 1) };
    })
    .filter((x): x is { cita: T; inicio: number; fin: number } => x !== null)
    .sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);

  /**
   * Se agrupan las que se TOCAN, en cadena.
   *
   * No basta con comparar de dos en dos: si A choca con B y B choca con C
   * —aunque A y C no se toquen— las tres tienen que repartirse el ancho
   * juntas. Si no, A y C acabarian las dos en el carril 0, encimadas.
   */
  const grupos: { cita: T; inicio: number; fin: number }[][] = [];
  let actual: { cita: T; inicio: number; fin: number }[] = [];
  let finDelGrupo = -1;

  for (const c of conMinutos) {
    if (actual.length > 0 && c.inicio < finDelGrupo) {
      actual.push(c);
      finDelGrupo = Math.max(finDelGrupo, c.fin);
    } else {
      if (actual.length > 0) grupos.push(actual);
      actual = [c];
      finDelGrupo = c.fin;
    }
  }
  if (actual.length > 0) grupos.push(actual);

  const salida: Colocada<T>[] = [];

  for (const grupo of grupos) {
    // Dentro del grupo, cada cita busca el primer carril libre — el que ya
    // termino antes de que ella empiece. Asi tres citas seguidas que se
    // encadenan no abren tres carriles: reusan el primero que se desocupa.
    const finDeCarril: number[] = [];
    const carrilDe = new Map<string, number>();

    for (const c of grupo) {
      let carril = finDeCarril.findIndex((fin) => fin <= c.inicio);
      if (carril === -1) {
        carril = finDeCarril.length;
        finDeCarril.push(c.fin);
      } else {
        finDeCarril[carril] = c.fin;
      }
      carrilDe.set(c.cita.id, carril);
    }

    for (const c of grupo) {
      const inicio = Math.max(c.inicio, abre);
      const fin = Math.min(c.fin, cierra);
      salida.push({
        cita: c.cita,
        arriba: ((inicio - abre) / ventana) * 100,
        // Un minimo visible: una cita de cinco minutos que quede en una raya
        // de un pixel no se puede tocar con el dedo.
        alto: Math.max(((fin - inicio) / ventana) * 100, 1.5),
        carril: carrilDe.get(c.cita.id) ?? 0,
        carriles: finDeCarril.length,
      });
    }
  }

  return salida;
}

/**
 * Donde va la linea de la hora actual.
 *
 * Devuelve `null` cuando no se debe pintar — y son dos casos distintos: que
 * no se este viendo hoy, y que la hora actual quede fuera del horario del
 * centro. En los dos, una linea seria mentira.
 */
export function lineaDeAhora(
  momento: Date,
  abre: number,
  cierra: number,
): { readonly arriba: number; readonly hora: string } | null {
  const minutos = momento.getHours() * 60 + momento.getMinutes();
  if (minutos < abre || minutos > cierra) return null;
  const ventana = Math.max(1, cierra - abre);
  return { arriba: ((minutos - abre) / ventana) * 100, hora: comoHora(minutos) };
}

/** Las marcas de hora de la columna izquierda: 08:00, 09:00, ... */
export function horasDe(abre: number, cierra: number, paso = 60): string[] {
  const salida: string[] = [];
  for (let m = Math.ceil(abre / paso) * paso; m <= cierra; m += paso) salida.push(comoHora(m));
  return salida;
}

/**
 * A que hora corresponde un clic dentro de la columna.
 *
 * Se redondea al cuarto de hora mas cercano: nadie agenda a las 10:07, y sin
 * redondear cada clic daria una hora distinta e irrepetible.
 */
export function horaDelClic(
  proporcion: number,
  abre: number,
  cierra: number,
  redondeo = 15,
): string {
  const dentro = Math.max(0, Math.min(1, proporcion));
  const crudo = abre + dentro * (cierra - abre);
  return comoHora(Math.round(crudo / redondeo) * redondeo);
}
