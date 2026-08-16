/**
 * LA FICHA DEL CENTRO: como se llama, donde esta, y a que hora abre.
 *
 * EL NOMBRE Y EL LEMA SALEN DE AQUI, y hasta hoy vivian escritos en
 * `src/marca.ts` con un comentario que decia "hasta que Configuracion lo
 * administre". Ya lo administra: `marca.ts` se quedo solo con los colores, que
 * es lo unico que de verdad cambia entre un producto NERON y otro.
 *
 * LOS HORARIOS ESTAN EN ESTA MISMA PANTALLA Y NO EN UNA APARTE, aunque el
 * diseño no les da tarjeta propia. Es donde se buscan —"los datos de mi
 * centro" incluye a que hora abre— y separarlos habria significado inventar una
 * tarjeta que la captura de referencia no tiene.
 *
 * Y NO SON DECORACION: Agenda los lee. Agendar un domingo o a las siete de la
 * mañana avisa con todas sus letras, sin impedirlo — un centro de terapias
 * atiende fuera de horario constantemente, y un sistema que se niega a guardar
 * esa cita solo consigue que la cita se apunte en un papel.
 */

import { AreaDeTexto, Boton, Campo } from '@neron/base/ui';
import { DIAS_DE_LA_SEMANA, type DatosDelCentro, type HorarioDelDia } from '../datos/configuracion.js';
import { diasQueAbre, resumirHorarios } from './horarios-del-centro.js';

export interface PropiedadesDeLosDatos {
  readonly datos: DatosDelCentro;
  readonly loQueFalta: Readonly<Record<string, string>>;
  readonly mostrarErrores: boolean;
  readonly trabajando: boolean;
  readonly error: string | null;
  readonly puedeGuardar: boolean;
  onCambiar(datos: DatosDelCentro): void;
  onGuardar(): void;
}

export function DatosDelCentro({
  datos,
  loQueFalta,
  mostrarErrores,
  trabajando,
  error,
  puedeGuardar,
  onCambiar,
  onGuardar,
}: PropiedadesDeLosDatos) {
  const poner = <K extends keyof DatosDelCentro>(k: K, v: DatosDelCentro[K]): void =>
    onCambiar({ ...datos, [k]: v });

  const ponerDia = (dia: number, cambio: Partial<HorarioDelDia>): void =>
    onCambiar({
      ...datos,
      horarios: datos.horarios.map((h) => (h.dia === dia ? { ...h, ...cambio } : h)),
    });

  const falla = (campo: string): string | undefined =>
    mostrarErrores ? loQueFalta[campo] : undefined;

  const abre = diasQueAbre(datos.horarios);

  return (
    <div className="cfg-forma">
      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">El centro</h3>
        <div className="pz-dos">
          <Campo
            etiqueta="Cómo se llama"
            value={datos.nombre}
            onChange={(e) => poner('nombre', e.target.value)}
            obligatorio
            maxLength={80}
            {...(falla('nombre') ? { error: falla('nombre') } : {})}
          />
          <Campo
            etiqueta="Lema"
            value={datos.lema}
            onChange={(e) => poner('lema', e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="pz-dos">
          <Campo
            etiqueta="Teléfono"
            value={datos.telefono}
            onChange={(e) => poner('telefono', e.target.value)}
            maxLength={40}
          />
          <Campo
            etiqueta="Correo"
            type="email"
            value={datos.correo}
            onChange={(e) => poner('correo', e.target.value)}
            maxLength={120}
            {...(falla('correo') ? { error: falla('correo') } : {})}
          />
        </div>
        <AreaDeTexto
          etiqueta="Descripción"
          rows={2}
          value={datos.descripcion}
          onChange={(e) => poner('descripcion', e.target.value)}
          maxLength={280}
          ayuda="Una o dos líneas de qué es el centro. Sale en los documentos que se imprimen."
        />
        <Campo
          etiqueta="Sitio web"
          value={datos.sitio}
          onChange={(e) => poner('sitio', e.target.value)}
          maxLength={160}
        />
        <div className="pz-dos">
          <Campo
            etiqueta="Dirección"
            value={datos.direccion}
            onChange={(e) => poner('direccion', e.target.value)}
            maxLength={200}
          />
          <Campo
            etiqueta="Ciudad"
            value={datos.ciudad}
            onChange={(e) => poner('ciudad', e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="pz-tres">
          <Campo
            etiqueta="Estado"
            value={datos.estado}
            onChange={(e) => poner('estado', e.target.value)}
            maxLength={80}
          />
          <Campo
            etiqueta="País"
            value={datos.pais}
            onChange={(e) => poner('pais', e.target.value)}
            maxLength={80}
          />
          <Campo
            etiqueta="Código postal"
            value={datos.codigoPostal}
            onChange={(e) => poner('codigoPostal', e.target.value)}
            maxLength={12}
          />
        </div>
        {/*
          LA ZONA HORARIA ES DEL CENTRO Y NO DE LA COMPUTADORA. Sin ella, quien
          revise la agenda desde otro huso ve las citas corridas; y el dia que
          alguien viaje, la agenda del centro cambiaria de hora con el.
        */}
        <Campo
          etiqueta="Zona horaria"
          value={datos.zonaHoraria}
          onChange={(e) => poner('zonaHoraria', e.target.value)}
          maxLength={60}
          ayuda="La del centro, no la de quien mira la pantalla. Por ejemplo America/Mexico_City."
        />
      </section>

      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">Cómo te encuentran</h3>
        {/*
          LAS REDES SE GUARDAN COMO DIRECCION COMPLETA, no como usuario. Un
          "@centro" hay que convertirlo en enlace en cada sitio que lo pinte, y
          la conversión es distinta en cada red: la primera vez que alguien la
          escriba mal, el enlace lleva a ningún lado.
        */}
        <div className="pz-dos">
          <Campo
            etiqueta="Facebook"
            value={datos.facebook}
            onChange={(e) => poner('facebook', e.target.value)}
            maxLength={200}
            ayuda="La dirección completa de la página."
          />
          <Campo
            etiqueta="Instagram"
            value={datos.instagram}
            onChange={(e) => poner('instagram', e.target.value)}
            maxLength={200}
          />
        </div>
        <Campo
          etiqueta="WhatsApp"
          value={datos.whatsapp}
          onChange={(e) => poner('whatsapp', e.target.value)}
          maxLength={40}
          ayuda="El número con clave de país. Es el que se ofrece para escribirle al centro."
        />
      </section>

      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">Logotipo</h3>
        {/*
          SE GUARDA LA DIRECCION DEL ARCHIVO, NO EL ARCHIVO.
          Meter la imagen dentro del bloque de configuración —como texto en
          base64— lo haría crecer cientos de kilobytes, y ese bloque se lee
          ENTERO en cada arranque de cada pantalla del sistema: la barra lateral
          tardaría en aparecer en las trece.
        */}
        <div className="cfg-logo">
          {datos.logoUrl ? (
            <img className="cfg-logo__vista" src={datos.logoUrl} alt="El logotipo del centro" />
          ) : (
            <span className="cfg-logo__vacio">Sin logotipo</span>
          )}
          <div className="cfg-logo__campos">
            <Campo
              etiqueta="Dirección de la imagen"
              value={datos.logoUrl}
              onChange={(e) => poner('logoUrl', e.target.value)}
              maxLength={400}
              ayuda="Cuando hay logotipo, sustituye a la hoja en la barra lateral."
              {...(falla('logoUrl') ? { error: falla('logoUrl') } : {})}
            />
            {datos.logoUrl ? (
              <Boton tono="contorno" onClick={() => poner('logoUrl', '')}>
                Quitar el logotipo
              </Boton>
            ) : null}
          </div>
        </div>
        {/*
          SUBIR EL ARCHIVO TODAVIA NO SE PUEDE, Y SE DICE. Hace falta un lugar
          donde guardarlo —un almacenamiento con sus propios permisos— y ese
          todavía no está creado. Un botón de "Subir" que no sube nada le hace
          creer a alguien que ya tiene su logo puesto.
        */}
        <p className="tt-secundario">
          <strong>Todavía no se puede subir el archivo desde aquí.</strong> Hace falta un
          almacenamiento con sus propios permisos, y todavía no está creado. Mientras tanto se pega
          la dirección de una imagen que ya esté publicada.
        </p>
      </section>

      <section className="pz-tarjeta">
        <h3 className="tt-tarjeta">Horarios de atención</h3>
        <p className="tt-secundario">
          Agenda los respeta: agendar fuera de horario avisa, pero no lo impide. Un centro de
          terapias atiende fuera de hora a menudo, y una cita que el sistema no deja guardar acaba
          apuntada en un papel.
        </p>

        <ul className="cfg-horarios">
          {DIAS_DE_LA_SEMANA.map((d) => {
            const h = datos.horarios.find((x) => x.dia === d.dia);
            if (!h) return null;
            return (
              <li key={d.dia} className="cfg-horario">
                <span className="cfg-horario__dia">{d.nombre}</span>
                <label className="cfg-casilla">
                  <input
                    type="checkbox"
                    checked={!h.cerrado}
                    onChange={(e) => ponerDia(d.dia, { cerrado: !e.target.checked })}
                  />
                  <span>{h.cerrado ? 'Cerrado' : 'Abre'}</span>
                </label>
                {/*
                  Los campos de hora se quedan PINTADOS aunque el dia este
                  cerrado, solo deshabilitados: si desaparecieran, la fila se
                  encogeria y las siete se moverian cada vez que alguien marca
                  una casilla, con el dedo ya puesto sobre la siguiente.
                */}
                <label className="cfg-horario__hora">
                  <span className="neron-solo-lectores">{d.nombre}: a qué hora abre</span>
                  <input
                    className="cfg-campo"
                    type="time"
                    value={h.abre}
                    disabled={h.cerrado}
                    onChange={(e) => ponerDia(d.dia, { abre: e.target.value })}
                  />
                </label>
                <span className="cfg-horario__a" aria-hidden="true">
                  a
                </span>
                <label className="cfg-horario__hora">
                  <span className="neron-solo-lectores">{d.nombre}: a qué hora cierra</span>
                  <input
                    className="cfg-campo"
                    type="time"
                    value={h.cierra}
                    disabled={h.cerrado}
                    onChange={(e) => ponerDia(d.dia, { cierra: e.target.value })}
                  />
                </label>
              </li>
            );
          })}
        </ul>

        {falla('horarios') ? (
          <p className="pz-error__que" role="alert">
            {falla('horarios')}
          </p>
        ) : null}

        {/* EL RESUMEN ES LA COMPROBACION. Siete renglones de campos no se leen;
            una linea que dice "Lunes a viernes: 09:00 a 19:00" enseña de un
            vistazo si lo que se acaba de escribir es lo que se queria. */}
        <div className="cfg-resumen">
          <span className="tt-etiqueta">Queda así</span>
          {abre === 0 ? (
            <p className="tt-secundario">
              El centro está marcado como cerrado los siete días. Agenda va a avisar en cada cita
              que se agende.
            </p>
          ) : (
            <ul className="cfg-resumen__lista">
              {resumirHorarios(datos.horarios).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {error ? (
        <p className="pz-error__que" role="alert">
          {error}
        </p>
      ) : null}

      <div className="pz-ficha__pie">
        <Boton
          tono="principal"
          trabajando={trabajando}
          disabled={!puedeGuardar}
          onClick={onGuardar}
        >
          Guardar los datos del centro
        </Boton>
      </div>
    </div>
  );
}
