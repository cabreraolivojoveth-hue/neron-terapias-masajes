import { describe, expect, it } from 'vitest';
import {
  CAPACIDADES_DE_TERAPIAS,
  GRUPOS,
  MODULOS,
  MODULO_POR_OMISION,
  moduloPorId,
  modulosVisibles,
} from '../src/modulos/registro.js';

const TODO_PERMITIDO = Object.fromEntries(
  [...CAPACIDADES_DE_TERAPIAS, 'gestionarConfiguracion'].map((c) => [c, true]),
);

describe('el registro es la unica lista', () => {
  it('cada modulo trae id, etiqueta, bloque y promesa', () => {
    for (const m of MODULOS) {
      expect(m.id, m.id).toMatch(/^[a-z]+$/);
      expect(m.etiqueta.length, m.id).toBeGreaterThan(0);
      expect(m.bloque, m.id).toBeGreaterThan(0);
      // La promesa no es adorno: es lo que se le muestra a quien abre un
      // modulo que todavia no llega, en vez de datos inventados.
      expect(m.promesa.length, m.id).toBeGreaterThan(20);
    }
  });

  it('no hay dos modulos con el mismo id', () => {
    const ids = MODULOS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('los doce del diseño estan', () => {
    const ids = MODULOS.map((m) => m.id);
    for (const esperado of ['inicio','agenda','clientes','servicios','cursos','productos',
                            'ventas','caja','gastos','recordatorios','reportes','configuracion']) {
      expect(ids, esperado).toContain(esperado);
    }
  });

  it('todo modulo agrupado existe, y todo modulo existe en un grupo', () => {
    const ids = new Set(MODULOS.map((m) => m.id));
    const agrupados = new Set<string>(GRUPOS.flatMap((g) => [...g.modulos]));
    for (const id of agrupados) expect(ids, `${id} agrupado`).toContain(id);
    for (const m of MODULOS) {
      if (m.sueltoArriba) continue;
      expect(agrupados.has(m.id), `${m.id} sin grupo`).toBe(true);
    }
  });

  it('un modulo no vive en dos grupos a la vez', () => {
    const todos = GRUPOS.flatMap((g) => [...g.modulos]) as string[];
    expect(new Set(todos).size).toBe(todos.length);
  });
});

describe('los permisos deciden que se ve', () => {
  it('con todos los permisos se ven todos', () => {
    expect(modulosVisibles(TODO_PERMITIDO)).toHaveLength(MODULOS.length);
  });

  it('SIN NINGUN PERMISO todavia se ve Inicio y Recordatorios', () => {
    // Nadie puede quedarse con el menu vacio: seria entrar al sistema y no
    // poder ir a ningun lado, sin que nada explique por que.
    const visibles = modulosVisibles({});
    expect(visibles).toContain('inicio');
    expect(visibles).toContain('recordatorios');
  });

  it('la recepcionista sin finanzas NO ve Caja, Gastos ni Reportes', () => {
    const visibles = modulosVisibles({
      gestionarClientes: true, gestionarAgenda: true, cobrar: true, verFinanzas: false,
    });
    expect(visibles).toContain('agenda');
    expect(visibles).toContain('clientes');
    expect(visibles).toContain('ventas');
    expect(visibles).not.toContain('caja');
    expect(visibles).not.toContain('gastos');
    expect(visibles).not.toContain('reportes');
  });

  it('un permiso ausente NO cuenta como concedido', () => {
    // El error tipico: `permisos[c] !== false`. Con eso, un permiso que
    // todavia no llego del servidor se toma como concedido.
    expect(modulosVisibles({ verFinanzas: undefined as unknown as boolean })).not.toContain('caja');
  });

  it('un permiso que llega como texto tampoco cuenta', () => {
    expect(modulosVisibles({ verFinanzas: 'true' as unknown as boolean })).not.toContain('caja');
  });
});

describe('a donde va quien se pierde', () => {
  it('el modulo por omision existe y lo ve cualquiera', () => {
    const m = moduloPorId(MODULO_POR_OMISION);
    expect(m).not.toBeNull();
    expect(m?.capacidad).toBeNull();
  });

  it('un id que no existe devuelve null, no revienta', () => {
    expect(moduloPorId('facturacion')).toBeNull();
  });
});

describe('ni un dato de la captura de referencia', () => {
  it('el registro no trae nombres ni cifras inventadas', () => {
    const texto = JSON.stringify(MODULOS);
    for (const prohibido of ['Ana López', 'José Pérez', 'María', '4,850', '28 sesiones']) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
  });
});
