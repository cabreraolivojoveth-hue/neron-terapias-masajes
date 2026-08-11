/**
 * EL MOVIMIENTO.
 *
 * TRES REGLAS, Y NINGUNA ES DECORATIVA:
 *
 * 1. EL MOVIMIENTO EXPLICA DE DONDE VIENE ALGO. Una tarjeta que aparece
 *    subiendo dice "esto acaba de llegar"; un panel que entra desde la derecha
 *    dice "esto es un detalle de lo que estabas viendo". Sin eso, la pantalla
 *    cambia de golpe y hay que volver a buscar donde estaba uno.
 *
 * 2. RAPIDO O NO SIRVE. Nada pasa de 240ms. Una animacion bonita de medio
 *    segundo se disfruta las tres primeras veces y estorba las otras
 *    doscientas del dia. Quien cobra en un mostrador no esta viendo una
 *    presentacion.
 *
 * 3. SE APAGA ENTERO PARA QUIEN LO PIDA. `prefers-reduced-motion` no es un
 *    detalle de accesibilidad simpatico: para algunas personas el movimiento
 *    en pantalla produce mareo de verdad. Al final del archivo se apaga TODO
 *    de un golpe, y por eso las animaciones se declaran con nombre en vez de
 *    sueltas — para poder apagarlas todas sin olvidar ninguna.
 *
 * LO QUE NO SE ANIMA, A PROPOSITO: nada que cambie de sitio mientras alguien
 * lo esta leyendo o apuntando con el dedo. Un renglon de tabla que se acomoda
 * solo mientras vas a tocarlo hace que toques el de al lado — y en Ventas eso
 * es cobrar otra cosa.
 */

const v = (nombre: string): string => `var(--neron-${nombre})`;
const c = (nombre: string): string => `var(--centro-${nombre})`;

export function movimiento(): string {
  return `
@keyframes pz-brillo {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes mv-sube {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: none; }
}

@keyframes mv-aparece {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes mv-entra-derecha {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: none; }
}

@keyframes mv-resorte {
  from { opacity: 0; transform: translateY(12px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}

@keyframes mv-late {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.12); }
}

/* ---------------------------------------------------------------- */
/* ENTRADAS                                                          */
/* ---------------------------------------------------------------- */
/*
 * EL ESCALONADO SE HACE CON "nth-child", no con un retraso por elemento en
 * JavaScript. Calcularlo en JS obliga a pasar el indice a cada componente y a
 * escribir estilos en linea — y ademas se pierde en cuanto la lista se
 * reordena. Ocho pasos bastan: mas alla, el ultimo tarda tanto que se siente
 * lento en vez de vivo.
 */
.mv-entra { animation: mv-sube ${v('movimiento-normal')} ${v('movimiento-curva')} both; }
.mv-entra-suave { animation: mv-aparece ${v('movimiento-normal')} ${v('movimiento-curva')} both; }

.mv-escalonado > * { animation: mv-sube ${v('movimiento-normal')} ${v('movimiento-curva')} both; }
.mv-escalonado > *:nth-child(1) { animation-delay: 0ms; }
.mv-escalonado > *:nth-child(2) { animation-delay: 40ms; }
.mv-escalonado > *:nth-child(3) { animation-delay: 80ms; }
.mv-escalonado > *:nth-child(4) { animation-delay: 120ms; }
.mv-escalonado > *:nth-child(5) { animation-delay: 160ms; }
.mv-escalonado > *:nth-child(6) { animation-delay: 200ms; }
.mv-escalonado > *:nth-child(7) { animation-delay: 240ms; }
.mv-escalonado > *:nth-child(n+8) { animation-delay: 280ms; }

/* El contenido de un modulo al entrar. La llave de React lo vuelve a montar
   al cambiar de pantalla, asi que se dispara sola en cada navegacion. */
.mv-pantalla { animation: mv-sube ${v('movimiento-normal')} ${v('movimiento-curva')} both; }

/* ---------------------------------------------------------------- */
/* AL PASAR EL PUNTERO                                               */
/* ---------------------------------------------------------------- */
/*
 * SOLO DONDE HAY ALGO QUE HACER. Levantar una tarjeta que no se puede tocar
 * promete una accion que no existe, y eso se siente peor que no animar nada.
 */
@media (hover: hover) {
  .mv-levanta { transition: transform ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
                            box-shadow ${v('movimiento-curva')} ${v('movimiento-instantaneo')}; }
  .mv-levanta:hover { transform: translateY(-2px); box-shadow: ${c('sombra-alta')}; }

  .pz-cifra.mv-levanta:hover { transform: translateY(-3px); }
}

/* La flecha de un renglon se adelanta un poco: dice "esto lleva a otro lado". */
.pz-renglon .pz-renglon__flecha {
  transition: transform ${v('movimiento-curva')} ${v('movimiento-instantaneo')},
              color ${v('movimiento-curva')} ${v('movimiento-instantaneo')};
}
.pz-renglon:hover .pz-renglon__flecha { transform: translateX(3px); color: ${v('marca')}; }

/* ---------------------------------------------------------------- */
/* PANELES Y DIALOGOS                                                */
/* ---------------------------------------------------------------- */
.mv-panel { animation: mv-entra-derecha ${v('movimiento-normal')} ${v('movimiento-curva')} both; }

/* El dialogo de la base entra con un resorte corto: aparecer de golpe en el
   centro de la pantalla sobresalta. */
.neron-modal__caja, .neron-dialogo, [role='dialog'] > * {
  animation: mv-resorte ${v('movimiento-normal')} ${v('movimiento-curva')} both;
}

/* ---------------------------------------------------------------- */
/* AVISOS                                                            */
/* ---------------------------------------------------------------- */
/* El punto de "hay algo nuevo" late DOS veces y se queda quieto. Un punto que
   late para siempre en la esquina de la pantalla cansa en diez minutos. */
.mv-late { animation: mv-late 900ms ${v('movimiento-curva')} 2; }

/* ---------------------------------------------------------------- */
/* SE APAGA ENTERO PARA QUIEN LO PIDA                                */
/* ---------------------------------------------------------------- */
/*
 * Para algunas personas esto no es un detalle bonito: es un mareo. Se apaga
 * TODO —animaciones, transiciones y desplazamiento suave— de un solo golpe,
 * en vez de acordarse regla por regla.
 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
`;
}
