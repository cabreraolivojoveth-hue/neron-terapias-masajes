/**
 * El buscador global: lo que se puede probar sin servidor.
 *
 * Lo que de verdad entrega la base —que un centro no encuentre a los pacientes
 * de otro— lo comprueban los ataques, con las reglas de fila puestas. Aqui se
 * prueba que la consulta se arme bien y que la lista se agrupe como se ve.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/supabase.js', () => ({
  HAY_CONEXION: true,
  // Si algo llamara al servidor con menos letras de las minimas, esto
  // reventaria — que es justo lo que queremos que pase.
  supabase: () => {
    throw new Error('no se debe consultar al servidor en esta prueba');
  },
  clienteParaLaBase: () => ({}),
}));

const {
  LETRAS_MINIMAS,
  NOMBRE_DEL_TIPO,
  agruparPorTipo,
  buscarEnTodo,
  llaveDeBusqueda,
  normalizarBusqueda,
  paraContiene,
} = await import('../src/datos/busqueda.js');

describe('normalizar lo que se escribio', () => {
  it('recorta y baja a minusculas', () => {
    expect(normalizarBusqueda('  ANA  ')).toBe('ana');
  });

  it('junta los espacios de en medio', () => {
    // "ana   maria" y "ana maria" son la misma busqueda: sin esto serian dos
    // llaves de cache distintas para el mismo resultado.
    expect(normalizarBusqueda('ana   maria')).toBe('ana maria');
  });

  it('la misma busqueda escrita distinto da la MISMA llave', () => {
    expect(llaveDeBusqueda('t_c', '  Ana ')).toBe(llaveDeBusqueda('t_c', 'ana'));
  });

  it('la llave cambia con el centro', () => {
    expect(llaveDeBusqueda('t_a', 'ana')).not.toBe(llaveDeBusqueda('t_b', 'ana'));
  });

  it('la llave cuelga de "inicio" para que se refresque con el tablero', () => {
    // Sin esto, quien da de alta un paciente y lo busca medio minuto despues
    // no lo encuentra: el resultado de esa palabra quedo guardado de antes.
    expect(llaveDeBusqueda('t_c', 'ana').startsWith('inicio')).toBe(true);
  });
});

describe('lo que en una busqueda significa otra cosa', () => {
  it('el porcentaje se escapa: no trae la tabla entera', () => {
    expect(paraContiene('%')).toBe('%\\%%');
  });

  it('el guion bajo se escapa: no casa con cualquier letra', () => {
    expect(paraContiene('a_b')).toBe('%a\\_b%');
  });

  it('un texto normal solo se envuelve', () => {
    expect(paraContiene('ana')).toBe('%ana%');
  });
});

describe('cuando todavia no vale la pena buscar', () => {
  it('con menos letras que el minimo NO se consulta al servidor', async () => {
    // El mock de arriba revienta si alguien llama a supabase(): que estas
    // llamadas devuelvan lista vacia sin reventar ES la prueba.
    expect(await buscarEnTodo('t_c', '')).toEqual([]);
    expect(await buscarEnTodo('t_c', 'a')).toEqual([]);
    expect(await buscarEnTodo('t_c', '   ')).toEqual([]);
  });

  it('el minimo son dos letras', () => {
    expect(LETRAS_MINIMAS).toBe(2);
  });
});

describe('agrupar los resultados', () => {
  const cosa = (tipo: 'cliente' | 'producto', id: string) => ({
    tipo, id, nombre: `n${id}`, pista: null, modulo: tipo === 'cliente' ? 'clientes' : 'productos',
  });

  it('respeta el orden en que se muestran los grupos', () => {
    const g = agruparPorTipo([cosa('producto', '1'), cosa('cliente', '2')]);
    expect(g.map((x) => x.tipo)).toEqual(['cliente', 'producto']);
  });

  it('un grupo vacio DESAPARECE, no se queda con el encabezado solo', () => {
    // Un titulo "Productos" sin nada debajo solo hace preguntarse si algo se
    // rompio.
    const g = agruparPorTipo([cosa('cliente', '1')]);
    expect(g).toHaveLength(1);
    expect(g[0]?.titulo).toBe(NOMBRE_DEL_TIPO.cliente);
  });

  it('sin resultados no hay ni un grupo', () => {
    expect(agruparPorTipo([])).toEqual([]);
  });
});
