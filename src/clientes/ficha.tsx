/**
 * LA FICHA: dar de alta y editar un cliente.
 *
 * LOS CAMPOS NO SE RECREAN. Todo componente vive FUERA de la funcion que
 * pinta. Definir uno adentro hace que React lo trate como nuevo en cada
 * render: destruye el campo, monta otro, y el foco se pierde despues de cada
 * letra. Es la queja de "escribo una letra y tengo que volver a hacer clic".
 *
 * SE AVISA DE UN POSIBLE DUPLICADO, NO SE PROHIBE. Si otro expediente ya tiene
 * ese telefono o ese correo, casi siempre es la misma persona capturada dos
 * veces —y un historial partido en dos no se vuelve a juntar—. Pero a veces
 * una madre da su telefono para la ficha de su hija, asi que quien captura
 * decide: viendo la coincidencia, en vez de enterarse tres meses despues.
 *
 * NO SE COMPARA POR NOMBRE. Dos personas se llaman igual, y en un centro chico
 * hay hermanas con el mismo apellido.
 */

import { AreaDeTexto, Boton, Campo, Seleccion } from '@neron/base/ui';
import { Modal } from '../ui/modal.js';
import { Plegable } from '../ui/plegable.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ProfesionalBreve } from '../datos/citas.js';
import { DATOS_VACIOS, type DatosDeCliente, type PosibleDuplicado } from '../datos/clientes.js';

/* ------------------------------------------------------------------ */
/* Las validaciones, puras y probables sin navegador                   */
/* ------------------------------------------------------------------ */

export type CamposConError = Partial<Record<keyof DatosDeCliente, string>>;

const LARGO_MAXIMO_NOMBRE = 120;

/**
 * Lo minimo para que un expediente sirva: un nombre de verdad.
 *
 * Todo lo demas es opcional a proposito. En un mostrador, obligar a capturar
 * correo produce correos inventados —y un correo inventado es peor que
 * ninguno, porque el sistema le va a escribir a esa direccion—.
 */
export function validarCliente(datos: DatosDeCliente, hoy: Date = new Date()): CamposConError {
  const errores: CamposConError = {};

  const nombre = datos.nombre.trim();
  if (!nombre) {
    // Un nombre de puros espacios pasa cualquier comprobacion de "no vacio" y
    // deja un renglon en blanco en la lista que nadie sabe de quien es.
    errores.nombre = 'Escribe el nombre del cliente.';
  } else if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    errores.nombre = `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE} letras.`;
  }

  const correo = datos.correo.trim();
  // Deliberadamente simple: que tenga algo, arroba, algo, punto, algo. Las
  // expresiones "completas" para correo rechazan direcciones validas y no
  // atrapan las falsas — lo unico que comprueba de verdad un correo es
  // mandarle un mensaje.
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) {
    errores.correo = 'Ese correo no se ve completo. Revisa que tenga arroba y dominio.';
  }

  const telefono = datos.telefono.trim();
  if (telefono) {
    const digitos = telefono.replace(/\D/g, '');
    if (digitos.length < 7) {
      errores.telefono = 'El teléfono se ve corto. Revisa que esté completo.';
    } else if (!/^[\d\s()+.-]+$/.test(telefono)) {
      errores.telefono = 'El teléfono solo lleva números, espacios y los signos + ( ) - .';
    }
  }

  if (datos.fechaNacimiento) {
    const partes = datos.fechaNacimiento.split('/');
    const dia = Number(partes[0]);
    const mes = Number(partes[1]);
    const anio = Number(partes[2]);
    const marca = Date.parse(
      `${partes[2] ?? ''}-${partes[1] ?? ''}-${partes[0] ?? ''}T12:00:00Z`,
    );
    const d = Number.isFinite(marca) ? new Date(marca) : null;
    // Un 31 de febrero NO revienta: `Date` lo corre al 3 de marzo sin avisar.
    // Si el dia que vuelve no es el que entro, esa fecha no existia — y una
    // fecha corrupta convertida en otra creible es peor que un error.
    const existe = d !== null && d.getUTCDate() === dia && d.getUTCMonth() + 1 === mes;
    if (!existe) {
      errores.fechaNacimiento = 'Esa fecha no existe.';
    } else if (marca > hoy.getTime()) {
      // Una fecha de nacimiento futura es siempre un error de captura, y
      // ademas rompe el calculo del proximo cumpleaños.
      errores.fechaNacimiento = 'La fecha de nacimiento no puede ser futura.';
    } else if (anio < 1900) {
      errores.fechaNacimiento = 'Revisa el año: se ve demasiado atrás.';
    }
  }

  return errores;
}

/* El vacio canonico vive con el tipo, en la capa de datos: con veinte campos,
   tenerlo escrito en dos sitios garantiza que uno se quede corto. */
export const FICHA_VACIA: DatosDeCliente = DATOS_VACIOS;

/* ------------------------------------------------------------------ */

export interface PropiedadesDeFicha {
  readonly abierta: boolean;
  readonly titulo: string;
  readonly inicial: DatosDeCliente;
  readonly profesionales: readonly ProfesionalBreve[];
  readonly trabajando: boolean;
  readonly error: string | null;
  /** El id que se está editando, para no avisarle de que choca consigo mismo. */
  readonly editandoId?: string;
  onGuardar(datos: DatosDeCliente): void;
  onBuscarDuplicado(telefono: string, correo: string): Promise<PosibleDuplicado | null>;
  onAbrirDuplicado(id: string): void;
  onCerrar(): void;
}

/** Cuanto se espera antes de preguntar por duplicados. */
const ESPERA_MS = 400;

export function FichaDeCliente({
  abierta,
  titulo,
  inicial,
  profesionales,
  trabajando,
  error,
  onGuardar,
  onBuscarDuplicado,
  onAbrirDuplicado,
  onCerrar,
}: PropiedadesDeFicha) {
  const [v, setV] = useState<DatosDeCliente>(inicial);
  const [errores, setErrores] = useState<CamposConError>({});
  const [duplicado, setDuplicado] = useState<PosibleDuplicado | null>(null);
  const [extras, setExtras] = useState(false);
  const [salud, setSalud] = useState(false);
  const [emergencia, setEmergencia] = useState(false);

  const poner = <K extends keyof DatosDeCliente>(k: K, valor: DatosDeCliente[K]): void =>
    setV((a) => ({ ...a, [k]: valor }));

  /**
   * La busqueda de duplicados espera a que dejen de escribir.
   *
   * Sin la espera, cada tecla del telefono manda una consulta y las respuestas
   * llegan desordenadas: la de "664" contesta despues que la de "6641234567" y
   * el aviso termina hablando de otra persona.
   */
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  useEffect(() => {
    if (!abierta) return;
    const t = setTimeout(() => {
      void onBuscarDuplicado(v.telefono, v.correo).then((d) => {
        if (vivo.current) setDuplicado(d);
      });
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [abierta, v.telefono, v.correo, onBuscarDuplicado]);

  function enviar(e: FormEvent): void {
    e.preventDefault();
    const fallos = validarCliente(v);
    setErrores(fallos);
    // Se marca CADA campo con su mensaje, no un "revisa los datos" general:
    // el que falla puede haber quedado tres campos mas arriba, fuera de vista.
    if (Object.keys(fallos).length > 0) return;
    onGuardar(v);
  }

  if (!abierta) return null;

  return (
    <Modal abierto={abierta} titulo={titulo} onCerrar={onCerrar}>
      <form className="pz-columna" onSubmit={enviar} noValidate>
        <Campo
          etiqueta="Nombre"
          value={v.nombre}
          onChange={(e) => poner('nombre', e.target.value)}
          obligatorio
          maxLength={LARGO_MAXIMO_NOMBRE}
          {...(errores.nombre ? { error: errores.nombre } : {})}
          ayuda="Nombre y apellidos, como quieras verlo en la agenda."
        />

        <div className="pz-dos">
          <Campo
            etiqueta="Teléfono"
            type="tel"
            value={v.telefono}
            onChange={(e) => poner('telefono', e.target.value)}
            {...(errores.telefono ? { error: errores.telefono } : {})}
          />
          <Campo
            etiqueta="Correo"
            type="email"
            value={v.correo}
            onChange={(e) => poner('correo', e.target.value)}
            {...(errores.correo ? { error: errores.correo } : {})}
          />
        </div>

        {duplicado ? (
          <div className="pz-aviso" role="alert">
            <p>
              Ya hay un cliente con ese {duplicado.porque === 'telefono' ? 'teléfono' : 'correo'}:{' '}
              <strong>{duplicado.nombre}</strong>.
            </p>
            <p className="tt-secundario">
              Si es la misma persona, abre su expediente en vez de crear otro — un historial partido
              en dos ya no se vuelve a juntar.
            </p>
            <Boton tono="contorno" type="button" onClick={() => onAbrirDuplicado(duplicado.id)}>
              Abrir su expediente
            </Boton>
          </div>
        ) : null}

        <div className="pz-dos">
          <Campo
            etiqueta="Fecha de nacimiento"
            type="date"
            value={aInput(v.fechaNacimiento)}
            onChange={(e) => poner('fechaNacimiento', deInput(e.target.value))}
            {...(errores.fechaNacimiento ? { error: errores.fechaNacimiento } : {})}
            ayuda="De aquí salen los cumpleaños próximos."
          />
          <Seleccion
            etiqueta="Terapeuta asignado"
            value={v.profesionalId}
            onChange={(e) => poner('profesionalId', e.target.value)}
            ayuda="Con quién se atiende normalmente. No cambia quién atendió sus citas pasadas."
            opciones={[
              { valor: '', texto: 'Sin asignar' },
              ...profesionales.map((p) => ({ valor: p.id, texto: p.nombre })),
            ]}
          />
        </div>

        {/*
          LO CLINICO VA PLEGADO, PERO NO ESCONDIDO.
          Un formulario de alta con veinte campos a la vista hace que se capture
          MENOS, no mas: se abandona a la mitad. Plegado, dar de alta a alguien
          son cuatro campos, y lo demas se completa en su expediente cuando hay
          tiempo — que es como pasa de verdad en un mostrador.
          El boton era un "button" pelon sin estilo del sistema. Ahora es una
          pieza compartida con su flecha que gira, igual que todo lo demas.
        */}
        <Plegable
          titulo="Ficha de salud"
          detalle="Lo que hay que saber antes de una sesión"
          abierto={salud}
          onAlternar={() => setSalud((a) => !a)}
        >
          {/*
            ESTO NO ES "INFORMACION ADICIONAL": en un centro de terapias es lo
            primero que hay que saber. Dar un descontracturante a quien trae una
            hernia reciente, usar lavanda con quien es alergico o presion firme a
            quien toma anticoagulantes son daños de verdad, y ninguno se ve en la
            cara. Por eso las contraindicaciones van primero y aparte.
          */}
          <AreaDeTexto
            etiqueta="Contraindicaciones"
            value={v.contraindicaciones}
            onChange={(e) => poner('contraindicaciones', e.target.value)}
            rows={2}
            maxLength={2000}
            ayuda="Lo que NO se le puede hacer. Es lo primero que se lee antes de atenderla."
          />
          <div className="pz-dos">
            <AreaDeTexto
              etiqueta="Padecimientos"
              value={v.padecimientos}
              onChange={(e) => poner('padecimientos', e.target.value)}
              rows={2}
              maxLength={2000}
              ayuda="Diabetes, hipertensión, hernias, migraña…"
            />
            <AreaDeTexto
              etiqueta="Alergias"
              value={v.alergias}
              onChange={(e) => poner('alergias', e.target.value)}
              rows={2}
              maxLength={2000}
              ayuda="Aceites, aromas, látex, medicamentos."
            />
          </div>
          <div className="pz-dos">
            <AreaDeTexto
              etiqueta="Medicamentos"
              value={v.medicamentos}
              onChange={(e) => poner('medicamentos', e.target.value)}
              rows={2}
              maxLength={2000}
              ayuda="Los que toma hoy. Algunos cambian la presión que se puede aplicar."
            />
            <AreaDeTexto
              etiqueta="Cirugías o lesiones"
              value={v.cirugias}
              onChange={(e) => poner('cirugias', e.target.value)}
              rows={2}
              maxLength={2000}
              ayuda="Y hace cuánto. Una cirugía reciente cambia todo."
            />
          </div>
          <div className="pz-dos">
            <Seleccion
              etiqueta="Embarazo o lactancia"
              value={v.embarazo}
              onChange={(e) => poner('embarazo', e.target.value)}
              ayuda="Cambia los aceites y las posiciones que se pueden usar."
              opciones={[
                { valor: '', texto: 'Sin especificar' },
                { valor: 'no', texto: 'No' },
                { valor: 'si', texto: 'Embarazo' },
                { valor: 'lactancia', texto: 'Lactancia' },
              ]}
            />
            <Seleccion
              etiqueta="Presión preferida"
              value={v.presionPreferida}
              onChange={(e) => poner('presionPreferida', e.target.value)}
              ayuda="Para no tener que preguntarlo en cada sesión."
              opciones={[
                { valor: '', texto: 'Sin preferencia' },
                { valor: 'suave', texto: 'Suave' },
                { valor: 'media', texto: 'Media' },
                { valor: 'firme', texto: 'Firme' },
              ]}
            />
          </div>
          <Campo
            etiqueta="Aromas que evitar"
            value={v.aromasEvitar}
            onChange={(e) => poner('aromasEvitar', e.target.value)}
            ayuda="Los que le molestan aunque no sean alergia."
          />
        </Plegable>

        <Plegable
          titulo="Contacto de emergencia"
          detalle="A quién llamar si algo pasa durante una sesión"
          abierto={emergencia}
          onAlternar={() => setEmergencia((a) => !a)}
        >
          <div className="pz-dos">
            <Campo
              etiqueta="Nombre"
              value={v.contactoEmergencia}
              onChange={(e) => poner('contactoEmergencia', e.target.value)}
            />
            <Campo
              etiqueta="Teléfono"
              type="tel"
              value={v.telefonoEmergencia}
              onChange={(e) => poner('telefonoEmergencia', e.target.value)}
            />
          </div>
        </Plegable>

        <Plegable
          titulo="Datos y cómo llegó"
          detalle="Dirección, ocupación y de dónde nos conoce"
          abierto={extras}
          onAlternar={() => setExtras((a) => !a)}
        >
          <div className="pz-dos">
            <Campo
              etiqueta="Ocupación"
              value={v.ocupacion}
              onChange={(e) => poner('ocupacion', e.target.value)}
              ayuda="A qué se dedica: explica muchas tensiones."
            />
            <Campo
              etiqueta="Cómo nos conoció"
              value={v.comoNosConocio}
              onChange={(e) => poner('comoNosConocio', e.target.value)}
            />
          </div>
          <div className="pz-dos">
            <Campo
              etiqueta="Referido por"
              value={v.referidoPor}
              onChange={(e) => poner('referidoPor', e.target.value)}
            />
            <Campo
              etiqueta="Dirección"
              value={v.direccion}
              onChange={(e) => poner('direccion', e.target.value)}
            />
          </div>
          <AreaDeTexto
            etiqueta="Notas generales"
            value={v.notas}
            onChange={(e) => poner('notas', e.target.value)}
            rows={4}
            maxLength={4000}
            ayuda="Lo que necesites recordar de esta persona. Las notas de cada sesión se escriben en su cita."
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
  // Vaciar el campo deja la fecha vacia, no "hoy" a escondidas.
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
