/**
 * LA BARRERA DE HASTA ARRIBA.
 *
 * EXISTE POR UNA PANTALLA EN BLANCO, y vale la pena contarlo.
 *
 * El marco de la base trae barreras de error por pantalla: si un modulo
 * revienta, se puede navegar a otro y el sistema se recupera. Pero esas
 * barreras viven DENTRO del marco, y el marco solo se pinta cuando ya hay
 * sesion.
 *
 * Si algo revienta ANTES —al crear el cliente de la base de datos, al leer la
 * configuracion, en el primer render— no hay nada arriba que lo atrape.
 * React desmonta el arbol entero y deja la pagina en blanco. Sin mensaje, sin
 * pista, sin nada que la persona pueda hacer. Solo un error en la consola del
 * navegador que nadie va a abrir.
 *
 * Esta barrera envuelve TODO, incluida la que decide que se ve. Es la ultima
 * red, y su unico trabajo es que la pantalla nunca se quede muda.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Estado {
  readonly error: Error | null;
}

export class BarreraDeRaiz extends Component<{ readonly children: ReactNode }, Estado> {
  override state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Se registra el error Y donde ocurrio. "Se cayo la aplicacion" no sirve
    // para nada tres semanas despues.
    console.error('[arranque]', error.message, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    /**
     * Los estilos van EN LINEA a proposito.
     *
     * Si lo que revento fue la hoja de estilos —o el arranque, antes de
     * inyectarla— las clases del sistema no existen todavia. Una pantalla de
     * error que depende de los estilos que fallaron es una pantalla en blanco
     * con otro nombre.
     */
    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          background: '#faf9f7',
          color: '#1c1917',
        }}
      >
        <div
          style={{
            maxWidth: '560px',
            width: '100%',
            border: '1px solid #d6d3d1',
            borderRadius: '12px',
            padding: '24px',
            background: '#ffffff',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: '20px' }}>
            El sistema no pudo arrancar
          </h1>
          <p style={{ margin: '0 0 16px', color: '#57534e', fontSize: '14px', lineHeight: 1.5 }}>
            Algo falló antes de poder mostrar nada. Esto es lo que dijo:
          </p>
          <pre
            style={{
              margin: '0 0 16px',
              padding: '12px',
              background: '#f5f5f4',
              border: '1px solid #e7e5e4',
              borderRadius: '8px',
              fontSize: '13px',
              // Un mensaje largo se parte en vez de sacar scroll horizontal.
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {error.message}
          </pre>
          <p style={{ margin: 0, color: '#57534e', fontSize: '13px', lineHeight: 1.5 }}>
            Lo más común es que el archivo <code>.env</code> tenga la dirección o la llave
            incompletas. Vuelve a correr <strong>CONECTAR.bat</strong> y fíjate que los dos
            valores queden completos.
          </p>
        </div>
      </main>
    );
  }
}
