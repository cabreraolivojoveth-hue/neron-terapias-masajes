/**
 * LA CAPA DE DATOS DE CONFIGURACION.
 *
 * Lo que se vigila aqui es lo que no se ve al mirar la pantalla: que los huecos
 * de la base se rellenen SIEMPRE igual, que un `undefined` no cambie como se
 * calculan los precios, que la version del sistema no mienta, y que el CSV no
 * se descuadre con una coma.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPACIDADES_DE_PLATAFORMA,
  CENTRO_VACIO,
  DIAS_DE_LA_SEMANA,
  HORARIO_DE_ARRANQUE,
  LEMA_POR_OMISION,
  METODOS_DE_PAGO,
  NOMBRE_POR_OMISION,
  QUE_DESBLOQUEA,
  VERSION_DEL_SISTEMA,
  comoBloque,
  comoCsvDeExportacion,
  comoSeDiceLaAccion,
  llaveDeLaBitacora,
  llaveDeLaConfiguracion,
  llaveDelEquipo,
  loQueFaltaDeLaInvitacion,
  loQueFaltaDelCentro,
  ordenarBitacora,
  ordenarConfiguracion,
  ordenarEquipo,
  ordenarHorarios,
  ordenarLicencia,
  ordenarRoles,
  BITACORA_SIN_FILTROS,
  LO_QUE_TOCA_LA_CONFIGURACION,
  PREFIJO_DE_CONFIGURACION,
} from '../src/datos/configuracion.js';
import { CAPACIDADES_DE_TERAPIAS } from '../src/modulos/registro.js';

describe('la version del sistema', () => {
  it('es la MISMA que la del package.json', () => {
    /**
     * ESTA PRUEBA EXISTE PORQUE UNA VERSION QUE MIENTE ES PEOR QUE NINGUNA.
     *
     * El numero sale escrito en el codigo —no se puede leer el package.json
     * desde el navegador sin arrastrarlo entero al paquete publicado— y un
     * numero escrito a mano se queda viejo el dia que alguien publique sin
     * acordarse. Es lo primero que se pregunta cuando algo falla, y si no
     * cuadra con lo que hay publicado se busca el problema en el sitio
     * equivocado.
     */
    const paquete = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as { version: string };
    expect(VERSION_DEL_SISTEMA).toBe(paquete.version);
  });
});

describe('el nombre y el lema de arranque', () => {
  it('existen, para las pantallas que se pintan sin sesion', () => {
    // Entrar y "falta configurar la conexion" no tienen a quien preguntarle
    // como se llama el centro: no hay sesion todavia.
    expect(NOMBRE_POR_OMISION).not.toBe('');
    expect(LEMA_POR_OMISION).not.toBe('');
  });
});

describe('las capacidades', () => {
  it('las siete de plataforma son las de la base, ni una mas ni una menos', () => {
    expect([...CAPACIDADES_DE_PLATAFORMA]).toEqual([
      'gestionarUsuarios', 'gestionarConfiguracion', 'verAuditoria', 'exportarDatos',
      'restaurarRespaldo', 'zonaDePeligro', 'verFacturacion',
    ]);
  });

  it('TODAS dicen que desbloquean, tambien las del producto', () => {
    /*
     * Una matriz de dieciseis palabras tecnicas contra cinco columnas no la
     * entiende nadie: "verExpediente" no significa nada hasta que dice "leer
     * las notas clinicas de un paciente". Si mañana se agrega una capacidad y
     * se olvida su explicacion, la matriz enseña la clave cruda y esta prueba
     * lo caza antes.
     */
    for (const c of [...CAPACIDADES_DE_PLATAFORMA, ...CAPACIDADES_DE_TERAPIAS]) {
      expect(QUE_DESBLOQUEA[c], c).toBeDefined();
      expect(QUE_DESBLOQUEA[c]!.length, c).toBeGreaterThan(10);
    }
  });
});

describe('los horarios que llegan de la base', () => {
  it('SIEMPRE son los siete dias, aunque se haya guardado uno', () => {
    /*
     * Lo guardado se superpone a lo de arranque, dia por dia. Con una lista a
     * medias, la pantalla pintaria cuatro dias y el resto desaparecido — y
     * quien lo mire va a creer que perdio su horario.
     */
    const salida = ordenarHorarios([{ dia: 3, cerrado: true }]);
    expect(salida.length).toBe(7);
    expect(salida.map((h) => h.dia)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(salida[2]!.cerrado).toBe(true);
    // Los otros seis conservan lo de arranque.
    expect(salida[0]!.abre).toBe(HORARIO_DE_ARRANQUE[0]!.abre);
  });

  it('una hora ilegible NO se cuela: cae al valor de arranque', () => {
    // Un `HH:mm:ss` o un texto a medias metido en un `input type=time` deja el
    // campo vacio en unos navegadores y no en otros, sin decir nada.
    const salida = ordenarHorarios([{ dia: 1, abre: 'a las nueve', cierra: '20:30:00' }]);
    expect(salida[0]!.abre).toBe('09:00');
    expect(salida[0]!.cierra).toBe('20:30');
  });

  it('lo que no es una lista se contesta con los siete de arranque', () => {
    expect(ordenarHorarios(null).length).toBe(7);
    expect(ordenarHorarios('cualquier cosa').length).toBe(7);
  });

  it('los siete dias tienen nombre escrito, no salen de Intl', () => {
    // `Intl` depende de los datos de idioma del entorno: en una compilacion
    // recortada devuelve "Monday" sin avisar.
    expect(DIAS_DE_LA_SEMANA.length).toBe(7);
    expect(DIAS_DE_LA_SEMANA[0]!.nombre).toBe('Lunes');
    expect(DIAS_DE_LA_SEMANA[6]!.nombre).toBe('Domingo');
  });
});

describe('la configuracion que llega de la base', () => {
  it('un centro que nunca configuro nada sale completo, no vacio', () => {
    const c = ordenarConfiguracion({ nombre: 'Mi centro', centro: {} });
    expect(c.datos.nombre).toBe('Mi centro');
    expect(c.datos.moneda).toBe(CENTRO_VACIO.moneda);
    expect(c.datos.horarios.length).toBe(7);
    expect(c.datos.metodosDePago.length).toBeGreaterThan(0);
  });

  it('el impuesto incluido solo se apaga con un `false` ESCRITO', () => {
    /*
     * Esta casilla decide si el desglose se calcula hacia atras o se suma
     * encima: equivocarla cambia TODOS los totales del centro. Un `undefined`
     * de una base sin actualizar no puede hacer eso.
     */
    expect(ordenarConfiguracion({ centro: {} }).datos.impuestoIncluido).toBe(true);
    expect(ordenarConfiguracion({ centro: { impuestoIncluido: false } }).datos.impuestoIncluido)
      .toBe(false);
  });

  it('una lista de metodos VACIA cae a la de arranque, no a ninguno', () => {
    // Sin ningun metodo no se puede cobrar nada, y el sintoma seria un
    // mostrador donde el boton de cobrar no ofrece con que.
    expect(ordenarConfiguracion({ centro: { metodosDePago: [] } }).datos.metodosDePago.length)
      .toBeGreaterThan(0);
  });

  it('el lema guardado en blanco se respeta: no vuelve el de arranque', () => {
    // Quien borro el lema a proposito no quiere que reaparezca solo.
    expect(ordenarConfiguracion({ centro: { lema: '' } }).datos.lema).toBe('');
  });

  it('lo que no es un objeto no revienta', () => {
    expect(ordenarConfiguracion(null).datos.nombre).toBe(NOMBRE_POR_OMISION);
  });

  it('al guardar, el bloque NO lleva el nombre: ese vive en `negocio`', () => {
    // Una sola fuente de verdad por dato. Con el nombre en los dos sitios,
    // renombrar el centro dejaria una de las dos copias vieja.
    const bloque = comoBloque(CENTRO_VACIO);
    expect(bloque['nombre']).toBeUndefined();
    expect(bloque['lema']).toBeDefined();
  });

  it('al guardar, la moneda se manda en mayusculas', () => {
    expect(comoBloque({ ...CENTRO_VACIO, moneda: 'mxn' })['moneda']).toBe('MXN');
  });
});

describe('lo que le falta a la ficha del centro', () => {
  it('sin nombre no se guarda', () => {
    expect(loQueFaltaDelCentro({ ...CENTRO_VACIO, nombre: '  ' })['nombre']).toBeDefined();
  });

  it('un dia no puede cerrar antes de abrir', () => {
    const falta = loQueFaltaDelCentro({
      ...CENTRO_VACIO,
      horarios: [{ dia: 1, cerrado: false, abre: '19:00', cierra: '09:00' }],
    });
    expect(falta['horarios']).toBeDefined();
  });

  it('un dia CERRADO no se revisa: sus horas dan igual', () => {
    const falta = loQueFaltaDelCentro({
      ...CENTRO_VACIO,
      horarios: [{ dia: 1, cerrado: true, abre: '19:00', cierra: '09:00' }],
    });
    expect(falta['horarios']).toBeUndefined();
  });

  it('la moneda va con tres letras', () => {
    expect(loQueFaltaDelCentro({ ...CENTRO_VACIO, moneda: 'PESOS' })['moneda']).toBeDefined();
    expect(loQueFaltaDelCentro({ ...CENTRO_VACIO, moneda: 'USD' })['moneda']).toBeUndefined();
  });

  it('sin ningun metodo de pago no se guarda', () => {
    expect(loQueFaltaDelCentro({ ...CENTRO_VACIO, metodosDePago: [] })['metodosDePago'])
      .toBeDefined();
  });

  it('devuelve un error POR CAMPO, no un mensaje suelto', () => {
    // "Revisa los datos" obliga a mirarlos todos buscando cual esta mal.
    const falta = loQueFaltaDelCentro({ ...CENTRO_VACIO, nombre: '', moneda: 'X' });
    expect(Object.keys(falta).sort()).toEqual(['moneda', 'nombre']);
  });
});

describe('lo que le falta a una invitacion', () => {
  it('sin correo, sin nombre y sin rol, tres errores', () => {
    expect(Object.keys(loQueFaltaDeLaInvitacion('', '', '')).sort())
      .toEqual(['correo', 'nombre', 'rol']);
  });

  it('un correo sin arroba no pasa', () => {
    expect(loQueFaltaDeLaInvitacion('alguien', 'Alguien', 'admin')['correo']).toBeDefined();
  });
});

describe('el equipo que llega de la base', () => {
  it('un hueco no revienta: sale vacio y con cero dueños', () => {
    const e = ordenarEquipo(null);
    expect(e.miembros).toEqual([]);
    expect(e.duenosActivos).toBe(0);
  });

  it('"soy yo" lo decide la BASE, no una comparacion de aqui', () => {
    /*
     * La misma cuenta puede tener membresia en dos centros; comparar el id de
     * la cuenta contra el responsable haria que se marcara como propia una
     * membresia ajena.
     */
    const e = ordenarEquipo({ miembros: [{ id: 'm1', soyYo: true }, { id: 'm2' }] });
    expect(e.miembros[0]!.soyYo).toBe(true);
    expect(e.miembros[1]!.soyYo).toBe(false);
  });
});

describe('los roles que llegan de la base', () => {
  it('un rol sin permisos guardados sale con el objeto vacio, no con null', () => {
    // La matriz lee `permisos[capacidad]`: un null la reventaria entera.
    const r = ordenarRoles([{ id: 'dueno', etiqueta: 'Dueña' }]);
    expect(r[0]!.permisos).toEqual({});
    expect(r[0]!.activo).toBe(true);
  });
});

describe('la licencia', () => {
  it('sin renglon, no esta administrada — que NO es lo mismo que vencida', () => {
    /*
     * La base falla ABIERTO a proposito: un centro jamas se queda afuera por un
     * dato que todavia no existe. La pantalla tiene que poder decir "sin
     * licencia administrada" en vez de enseñar un plan inventado.
     */
    const l = ordenarLicencia({ administrada: false, permiteGuardar: true });
    expect(l.administrada).toBe(false);
    expect(l.plan).toBeNull();
    expect(l.permiteGuardar).toBe(true);
  });

  it('ante la duda sobre si se puede guardar, se dice que SI se puede', () => {
    // Es la misma regla del fallo abierto de la base: bloquear exige una
    // afirmacion explicita, nunca una ausencia.
    expect(ordenarLicencia({}).permiteGuardar).toBe(true);
    expect(ordenarLicencia({ permiteGuardar: false }).permiteGuardar).toBe(false);
  });
});

describe('la bitacora que llega de la base', () => {
  it('un hueco sale con listas vacias y pagina 1', () => {
    const b = ordenarBitacora(null);
    expect(b.filas).toEqual([]);
    expect(b.pagina).toBe(1);
    expect(b.modulos).toEqual([]);
  });

  it('los verbos cortos se leen en español al pintarlos', () => {
    /*
     * La bitacora guarda `dar-de-baja` porque es estable y se filtra bien.
     * Traducirlo al leer es lo que permite cambiar la frase sin migrar tres
     * años de historia.
     */
    expect(comoSeDiceLaAccion('dar-de-baja')).toBe('Dio de baja');
    expect(comoSeDiceLaAccion('cobrar')).toBe('Cobró');
  });

  it('un verbo que todavia no se traduce sale TAL CUAL, no vacio', () => {
    // Un renglon sin verbo es un renglon que no dice que paso.
    expect(comoSeDiceLaAccion('reagendar')).toBe('reagendar');
  });
});

describe('las llaves del cache', () => {
  it('todas empiezan con el mismo prefijo', () => {
    // Asi un solo `invalidar('configuracion')` refresca la ficha, el equipo,
    // los roles, la bitacora y la licencia a la vez.
    for (const llave of [
      llaveDeLaConfiguracion('t_x'),
      llaveDelEquipo('t_x'),
      llaveDeLaBitacora('t_x', BITACORA_SIN_FILTROS),
    ]) {
      expect(llave.startsWith(`${PREFIJO_DE_CONFIGURACION}:`)).toBe(true);
    }
  });

  it('la de la bitacora cambia con CADA filtro', () => {
    /*
     * Con una llave corta, cambiar de filtro enseñaria la pagina del filtro
     * anterior con toda la cara de estar al dia.
     */
    const base = llaveDeLaBitacora('t_x', BITACORA_SIN_FILTROS);
    expect(llaveDeLaBitacora('t_x', { ...BITACORA_SIN_FILTROS, modulo: 'caja' })).not.toBe(base);
    expect(llaveDeLaBitacora('t_x', { ...BITACORA_SIN_FILTROS, pagina: 2 })).not.toBe(base);
    expect(llaveDeLaBitacora('t_x', { ...BITACORA_SIN_FILTROS, busqueda: 'ana' })).not.toBe(base);
  });

  it('lo que se invalida incluye el tablero de Inicio', () => {
    // El nombre del centro se pinta en la barra lateral: sin ese prefijo,
    // renombrarlo lo dejaria con el nombre viejo hasta recargar.
    expect([...LO_QUE_TOCA_LA_CONFIGURACION]).toContain('inicio');
  });
});

describe('el archivo que se descarga', () => {
  it('una coma dentro de un dato NO parte la fila', () => {
    // Es el fallo clasico de exportar a mano: el archivo entero se descuadra a
    // partir de ahi y nadie sabe por que.
    const csv = comoCsvDeExportacion([{ nombre: 'Ramírez, Ana', tel: '1' }]);
    expect(csv.split('\n')[1]).toBe('"Ramírez, Ana","1"');
  });

  it('las comillas se duplican', () => {
    const csv = comoCsvDeExportacion([{ nota: 'dijo "sí"' }]);
    expect(csv.split('\n')[1]).toBe('"dijo ""sí"""');
  });

  it('las columnas salen de TODAS las filas, no de la primera', () => {
    /*
     * Dos filas de la misma tabla pueden traer llaves distintas cuando alguna
     * venia en nulo. Con la primera como plantilla, esas columnas desaparecen
     * del archivo sin avisar.
     */
    const csv = comoCsvDeExportacion([{ a: 1 }, { a: 2, b: 3 }]);
    expect(csv.split('\n')[0]).toBe('"a","b"');
  });

  it('sin filas devuelve vacio, no una cabecera sola', () => {
    expect(comoCsvDeExportacion([])).toBe('');
  });
});

describe('los metodos de pago', () => {
  it('son los que sabe cobrar la base, no una lista libre', () => {
    // Un metodo inventado produciria cobros que la base rechaza con un error
    // de restriccion que no dice nada.
    expect(METODOS_DE_PAGO.map((m) => m.clave)).toEqual([
      'efectivo', 'tarjeta', 'transferencia', 'otro',
    ]);
  });
});
