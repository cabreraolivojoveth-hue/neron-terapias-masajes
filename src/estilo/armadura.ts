/**
 * EL ESTILO DEL ARMAZON — barra lateral, barra superior y contenido.
 *
 * Es lo que mas se nota, porque se ve en las ocho pantallas todo el tiempo. Y
 * es lo que mas lejos estaba del diseño en la primera version: el menu sin
 * iconos, partido en tres grupos con titulo, y el modulo activo pintado como
 * un bloque plano de lado a lado.
 *
 * LAS MEDIDAS SALEN DE MEDIR LA CAPTURA, no de gusto: barra de 260, renglon de
 * 44 de alto con 12 de radio, icono de 20 separado 12 del texto.
 */

const v = (nombre: string): string => `var(--neron-${nombre})`;
const c = (nombre: string): string => `var(--centro-${nombre})`;

export function armadura(): string {
  return `
.arm { display: flex; min-height: 100dvh; background: ${v('fondo')}; }

/* El salto al contenido: invisible hasta que alguien navega con teclado. */
.arm-saltar {
  position: absolute; left: -9999px; top: 0; z-index: 100;
  padding: ${v('espacio-3')} ${v('espacio-4')};
  background: ${v('marca')}; color: ${v('sobre-marca')};
  border-radius: 0 0 ${c('radio-control')} 0;
}
.arm-saltar:focus { left: 0; }

/* ---------------------------------------------------------------- */
/* LA BARRA LATERAL                                                  */
/* ---------------------------------------------------------------- */
.arm-lateral {
  position: fixed; inset: 0 auto 0 0; z-index: 40;
  width: ${c('lateral')};
  display: flex; flex-direction: column;
  padding: ${v('espacio-5')} ${v('espacio-3')} ${v('espacio-4')};
  background: ${v('superficie')};
  border-right: 1px solid ${c('borde-tarjeta')};
  overflow-y: auto;
  /* En el celular se sale de pantalla y entra deslizando. */
  transform: translateX(-100%);
  transition: transform ${v('movimiento-curva')} ${v('movimiento-normal')};
}
.arm-lateral--abierta { transform: none; box-shadow: ${c('sombra-alta')}; }
@media (min-width: 1024px) {
  .arm-lateral { transform: none; }
}

.arm-marca { padding: 0 ${v('espacio-2')} ${v('espacio-5')}; }

/*
 * EL MENU SCROLLEA POR DENTRO, Y ESO NO ES UN DETALLE.
 *
 * El "flex: 1" con "min-height: 0" deja que esta caja se encoja cuando la
 * pantalla es baja. Sin overflow, encogerse NO recorta: la lista se sale por
 * abajo y se dibuja encima del pie — el nombre de la duena montado sobre
 * "Recordatorios", y el clic en "Configuracion" comido por el recuadro de la
 * cuenta, porque el pie va posicionado y gana el clic.
 *
 * Con overflow-y auto la lista se recorta y se recorre dentro de su hueco. La
 * marca arriba y el pie abajo se quedan quietos, que es lo que uno espera de una
 * barra lateral. Si algun dia se agregan modulos, esto ya esta resuelto.
 */
.arm-menu { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.arm-menu__lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }

/*
 * EL RENGLON DEL MENU.
 *
 * El icono NO es decoracion: en una lista de trece, es lo que deja encontrar
 * "Ventas" sin leer las trece palabras. Por eso ocupa su hueco fijo aunque el
 * texto sea corto.
 */
.arm-enlace {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  width: 100%; min-height: 44px;
  padding: 0 ${v('espacio-3')};
  border: none; border-radius: ${c('radio-control')};
  background: transparent; color: ${v('texto-suave')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  font-weight: ${v('peso-medio')};
  text-align: left; cursor: pointer;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              color ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.arm-enlace:hover { background: ${v('superficie-tenue')}; color: ${v('texto')}; }
.arm-enlace:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }
.arm-enlace__icono {
  flex: none; display: flex; color: ${v('texto-tenue')};
  transition: color ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              transform ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.arm-enlace:hover .arm-enlace__icono { color: ${v('texto-suave')}; transform: scale(1.1); }
.arm-enlace__texto { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* El activo: fondo tintado Y color de marca. Solo el color no alcanza cuando
   la pantalla se ve con sol encima, que es como se ve la del mostrador. */
.arm-enlace--activo {
  position: relative;
  background: ${v('marca-tenue')};
  color: ${v('marca')};
  font-weight: ${v('peso-fuerte')};
}
/*
 * LA RAYITA DE LA IZQUIERDA CRECE al llegar. Es lo unico del menu que se mueve
 * al cambiar de modulo, y basta: dice a donde se fue el foco sin que nada
 * salte de sitio. Un menu que se reacomoda al navegar obliga a volver a
 * buscar cada renglon.
 */
.arm-enlace--activo::before {
  content: '';
  position: absolute; left: 0; top: 50%;
  width: 3px; height: 60%;
  border-radius: ${c('radio-pastilla')};
  background: ${v('marca')};
  /* EL ESTADO NATURAL ES LA RAYITA PUESTA, y la animacion arranca desde
     abajo. Al reves —natural en scaleY(0), animacion que la sube— hacia falta
     "both" para que se quedara puesta al terminar, y "both" es lo que
     encerraba los velos de los modales dentro de la caja del modulo. Esta
     contado en "movimiento.ts". */
  transform: translateY(-50%);
  animation: mv-rayita ${v('movimiento-normal')} ${v('movimiento-curva')} backwards;
}
.arm-enlace--activo .arm-enlace__icono { color: ${v('marca')}; }
.arm-enlace--activo:hover { background: ${v('marca-tenue')}; color: ${v('marca')}; }
.arm-enlace--activo:hover .arm-enlace__icono { transform: none; }

/* ---------------------------------------------------------------- */
/* EL PIE DE LA BARRA: la cuenta y el soporte                        */
/* ---------------------------------------------------------------- */
.arm-pie {
  position: relative;
  /* Nunca se encoge: si algo tiene que ceder alto, que sea el menu, que si
     scrollea. Un pie encogido es como se encimaba antes. */
  flex: none;
  display: flex; flex-direction: column; gap: ${v('espacio-3')};
  padding-top: ${v('espacio-4')};
  margin-top: ${v('espacio-4')};
  border-top: 1px solid ${c('borde-tenue')};
}

.arm-cuenta {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  width: 100%; min-height: 52px;
  padding: 0 ${v('espacio-2')};
  border: none; border-radius: ${c('radio-control')};
  background: transparent;
  font-family: ${v('familia')}; text-align: left; cursor: pointer;
  transition: background ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.arm-cuenta:hover { background: ${v('superficie-tenue')}; }
.arm-cuenta:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }
.arm-cuenta__inicial {
  flex: none; width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  border-radius: ${c('radio-pastilla')};
  background: ${v('marca-tenue')}; color: ${v('marca')};
  font-size: ${v('texto-micro')}; font-weight: ${v('peso-fuerte')};
}
.arm-cuenta__texto { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.arm-cuenta__nombre {
  font-size: ${v('texto-chico')}; font-weight: ${v('peso-medio')}; color: ${v('texto')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.arm-cuenta__rol { font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; }
.arm-cuenta__flecha {
  flex: none; display: flex; color: ${v('texto-tenue')};
  transform: rotate(90deg);
  transition: transform ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.arm-cuenta__flecha--abierta { transform: rotate(-90deg); }

/*
 * EL PANEL FLOTA SOBRE LA CUENTA, NO LA EMPUJA.
 *
 * Se ancla a la caja de la cuenta y sale HACIA ARRIBA, que es el unico lado
 * con espacio: la cuenta vive pegada al fondo de la barra. Al abrirlo
 * no cambia el alto de nada, asi que el menu no se mueve ni se recorta.
 *
 * El z-index lo pone encima del menu; el 40 de la barra lateral lo mantiene por
 * debajo de los velos y modales, que es donde debe quedar.
 */
.arm-cuenta__caja { position: relative; }
.arm-cuenta__panel {
  position: absolute; z-index: 2;
  left: 0; right: 0; bottom: calc(100% + ${v('espacio-2')});
  display: flex; flex-direction: column;
  padding: ${v('espacio-1')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie-elevada')};
  box-shadow: ${c('sombra-alta')};
  animation: mv-sube ${v('movimiento-instantaneo')} ${v('movimiento-curva')} backwards;
}
.arm-cuenta__opcion {
  display: flex; align-items: center; gap: ${v('espacio-2')};
  width: 100%; min-height: 40px;
  padding: 0 ${v('espacio-3')};
  border: none; border-radius: 10px;
  background: transparent; color: ${v('texto')};
  font-family: ${v('familia')}; font-size: ${v('texto-chico')};
  text-align: left; cursor: pointer;
}
.arm-cuenta__opcion:hover { background: ${v('superficie-tenue')}; }
.arm-cuenta__opcion:focus-visible { outline: ${v('foco')}; outline-offset: -2px; }

.arm-soporte {
  display: flex; align-items: center; gap: ${v('espacio-3')};
  padding: ${v('espacio-3')};
  border: 1px solid ${c('borde-tenue')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie-tenue')};
}
.arm-soporte__icono { flex: none; display: flex; color: ${v('texto-suave')}; }
.arm-soporte__texto { display: flex; flex-direction: column; min-width: 0; }
.arm-soporte__titulo { font-size: ${v('texto-micro')}; font-weight: ${v('peso-medio')}; color: ${v('texto')}; }
.arm-soporte__pie { font-size: ${v('texto-micro')}; color: ${v('texto-tenue')}; }

.arm-velo {
  position: fixed; inset: 0; z-index: 35;
  background: ${v('velo')};
  animation: mv-aparece ${v('movimiento-instantaneo')} ${v('movimiento-curva')} backwards;
}
@media (min-width: 1024px) { .arm-velo { display: none; } }

/* ---------------------------------------------------------------- */
/* EL LADO DERECHO                                                   */
/* ---------------------------------------------------------------- */
.arm-principal {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
}
@media (min-width: 1024px) {
  .arm-principal { margin-left: ${c('lateral')}; }
}

.arm-superior {
  position: sticky; top: 0; z-index: 30;
  display: flex; align-items: center; gap: ${v('espacio-3')};
  min-height: 72px;
  padding: ${v('espacio-3')} ${v('espacio-6')};
  background: color-mix(in srgb, ${v('fondo')} 82%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid ${c('borde-tenue')};
}
.arm-superior__acciones {
  flex: 1; display: flex; align-items: center; justify-content: flex-end;
  gap: ${v('espacio-3')}; min-width: 0;
}

.arm-hamburguesa {
  flex: none; width: 42px; height: 42px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid ${c('borde-tarjeta')}; border-radius: ${c('radio-control')};
  background: ${v('superficie')}; color: ${v('texto')};
  cursor: pointer;
}
.arm-hamburguesa:focus-visible { outline: ${v('foco')}; outline-offset: 2px; }
@media (min-width: 1024px) { .arm-hamburguesa { display: none; } }

.arm-contenido {
  flex: 1; min-width: 0;
  padding: ${v('espacio-6')};
}
@media (max-width: 640px) {
  .arm-superior { padding: ${v('espacio-3')} ${v('espacio-4')}; }
  .arm-contenido { padding: ${v('espacio-4')}; }
}
`;
}
