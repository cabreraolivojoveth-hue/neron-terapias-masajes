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

.arm-menu { flex: 1; min-height: 0; }
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
.arm-enlace__icono { flex: none; display: flex; color: ${v('texto-tenue')}; transition: color ${v('movimiento-curva')} ${v('movimiento-instantaneo')}; }
.arm-enlace:hover .arm-enlace__icono { color: ${v('texto-suave')}; }
.arm-enlace__texto { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* El activo: fondo tintado Y color de marca. Solo el color no alcanza cuando
   la pantalla se ve con sol encima, que es como se ve la del mostrador. */
.arm-enlace--activo {
  background: ${v('marca-tenue')};
  color: ${v('marca')};
  font-weight: ${v('peso-fuerte')};
}
.arm-enlace--activo .arm-enlace__icono { color: ${v('marca')}; }
.arm-enlace--activo:hover { background: ${v('marca-tenue')}; color: ${v('marca')}; }

/* ---------------------------------------------------------------- */
/* EL PIE DE LA BARRA: la cuenta y el soporte                        */
/* ---------------------------------------------------------------- */
.arm-pie {
  position: relative;
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

.arm-cuenta__panel {
  display: flex; flex-direction: column;
  padding: ${v('espacio-1')};
  border: 1px solid ${c('borde-tarjeta')};
  border-radius: ${c('radio-control')};
  background: ${v('superficie-elevada')};
  box-shadow: ${c('sombra-alta')};
  animation: mv-sube ${v('movimiento-instantaneo')} ${v('movimiento-curva')} both;
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
  animation: mv-aparece ${v('movimiento-instantaneo')} ${v('movimiento-curva')} both;
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
