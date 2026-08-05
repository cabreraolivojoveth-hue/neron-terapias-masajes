/**
 * La hoja del Centro Holistico.
 *
 * Va en SVG y no como imagen: pesa doscientos bytes, no pide una peticion
 * mas al servidor, se ve nitida en cualquier pantalla y toma el color de la
 * marca sola —asi funciona igual en tema claro y en oscuro sin tener dos
 * archivos que despues alguien olvida cambiar a la vez.
 */

export function Hoja({ pequena = false }: { readonly pequena?: boolean }) {
  const lado = pequena ? 20 : 28;
  return (
    <svg
      className="terapias-hoja"
      width={lado}
      height={lado}
      viewBox="0 0 24 24"
      fill="none"
      // Es decoracion: el nombre del centro va escrito al lado. Anunciarla
      // solo estorbaria a quien usa lector de pantalla.
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 2.5c-4.2 2-7 5.2-7 9.1 0 3.6 2.6 6.4 6 6.4 4 0 7-3.6 7-8.5 0-2.8-2-5.6-6-7z"
        fill="currentColor"
        opacity="0.9"
      />
      <path d="M12 21.5V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}
