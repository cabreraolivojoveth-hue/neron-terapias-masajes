# Dónde me quedé — para continuar en un chat nuevo

Fecha de corte: se cerró el chat por límite de tokens, con el repo **en verde** y
todo lo terminado ya publicado en `main`.

---

## ESTADO DEL REPOSITORIO

`npm run consistencia` → **verde**: 14 guardias, 1.300 pruebas, 12 velos y
compilación. Los 180 ataques **no corren** en esta máquina porque falta
`DATABASE_URL` en el `.env` (solo están las dos llaves del navegador).

Último commit publicado: el expediente clínico de Clientes.

---

## LO QUE EL USUARIO TIENE QUE HACER (pendiente de su lado)

**Correr `ACTUALIZAR-BASE.sql` en Supabase → SQL Editor → Run.** Ya está generado
en la raíz del repo. Sin eso:

- el botón **Eliminar** de un producto contesta que la función no existe;
- la **ficha de salud** de un cliente se guarda pero no se vuelve a leer.

---

## 1. FALLO ABIERTO Y URGENTE: el foco salta solo

**Síntoma (reportado usando el programa):** estás escribiendo en un campo de
"Nuevo cliente" y el cursor **salta solo al campo de arriba**, sin tocar nada.
El usuario confirmó que **pasa en todos los campos y en todos los formularios**.

**Causa, ya diagnosticada:** el `Modal` de `@neron/base` enfoca su primer control
al abrirse —correcto— pero ese efecto depende de `onCerrar`:

```js
const cerrarSiSePuede = useCallback(..., [bloqueado, onCerrar]);
useEffect(() => { ...enfocarAdentro()... }, [abierto, cerrarSiSePuede]);
```

Y las pantallas le pasan flechas escritas en línea (`onCerrar={() => setFicha(null)}`),
que son una función NUEVA en cada render del padre. Así que **cada repintado del
padre vuelve a enfocar el primer campo**, con la persona escribiendo en el tercero.

`Confirmacion` NO tiene el fallo: su efecto depende solo de `[abierto]`.

**Alcance:** 19 archivos usan `Modal`/`Confirmacion`, con 21 `onCerrar={() => …}`
en línea.

**El arreglo ya está escrito** en `borradores/modal-envoltorio.tsx.txt`. Es un
envoltorio que guarda `onCerrar` en una `ref` y le entrega a la base una función
de identidad **estable**, así el efecto solo depende de `abierto`.

### Pasos que faltan

1. Mover `borradores/modal-envoltorio.tsx.txt` → `src/ui/modal.tsx`.
2. Cambiar los 19 archivos para que importen `Modal` de `../ui/modal.js` en vez
   de `@neron/base/ui`. (`Confirmacion` puede seguir viniendo de la base.)
3. **Guardia 15** en `guardias/fronteras.ts`: nadie importa `Modal` de
   `@neron/base/ui` fuera de `src/ui/modal.tsx`. Sin la guardia, la pantalla
   número veinte vuelve a caer y el fallo no avisa: no falla, no sale en la
   consola, solo hace imposible capturar.
4. `pruebas/componentes/modal.test.tsx`: que la función que recibe la base **no
   cambie de identidad** aunque el padre se repinte, y que aun así se llame a la
   versión de hoy al cerrar.
5. Batería completa y publicar.

---

## 2. MÓDULO REPORTES — a medio construir

El usuario mandó la foto (`imagenes de modulos/REPORTES.png`) y un encargo largo
y muy concreto. Lo esencial de ese encargo:

- Reportes **no es un módulo aislado**: es una capa de análisis que consume
  Ventas, Gastos, Caja, Clientes, Servicios, Cursos, Productos e Inventario.
- **Sin datos de ejemplo, sin mocks, sin números simulados.** Estados vacíos
  bien resueltos y ceros de verdad.
- **Nada de bases paralelas ni totales guardados.**
- Cálculos **en el servidor**, no bajando miles de registros al navegador.
- Un **selector de periodo global** que afecte TODO (nada debe quedarse con otro
  periodo por accidente), filtros combinables, comparación contra el periodo
  anterior —y si no hay con qué comparar, decir "Sin comparación disponible" en
  vez de 0%—, ocho pestañas funcionales, drill-down a los módulos, guardar y
  exportar reportes, y respetar permisos y aislamiento entre negocios.

### YA HECHO (publicado en `main`)

**Toda la capa de agregación en la base**, al final de `INSTALAR-EN-TERAPIAS.sql`:

- `app.paso_de_la_serie(desde, hasta)` → agrupa por `dia` o por `mes` según el
  largo del rango.
- **`public.reporte_del_periodo(negocio, desde, hasta, tipo, metodo, vendedor)`**
  — TODO el reporte en UNA llamada: periodo, `hayComparacion`, métricas con su
  comparación, finanzas (utilidad derivada, margen `null` sin ingresos), serie
  ingresos/egresos con el eje completo, categorías reales, ventas (ticket `null`
  sin ventas, por método), servicios, clientes, productos, cursos, gastos y caja
  (movimientos reales y cortes ya firmados).
  Es `security invoker`: **las reglas de fila dan gratis el aislamiento entre
  centros y el permiso `verFinanzas`**.
- Tabla **`reporte_guardado`** con sus reglas de acceso, y
  `guardar_reporte` / `reportes_guardados` / `borrar_reporte`.
  Guarda **la pregunta (periodo y filtros), nunca la respuesta**: un reporte con
  cifras congeladas seguiría afirmando un total que dejó de ser verdad en cuanto
  se cancelara una venta de ese mes.

### EMPEZADO Y PARKEADO

`borradores/reportes-datos.ts.txt` → va a `src/datos/reportes.ts`. Está
**completo**: tipos, `ordenarReporte`, `traerReporte`, los guardados,
`llaveDelReporte` (la llave de cache lleva los filtros, si no cambiar un filtro
devolvería el reporte anterior desde la cache) y `LO_QUE_TOCA_UN_REPORTE`.

### LO QUE FALTA

1. Mover el borrador a `src/datos/reportes.ts` + `pruebas/reportes.test.ts`.
2. `src/reportes/` con la pantalla: encabezado, selector de periodo, filtros,
   4 métricas con comparación, 8 pestañas, gráfica ingresos/egresos, dona de
   categorías, resumen del periodo, rankings, guardados y exportar.
   **Reusar las piezas compartidas** (`pz-*`) y `MenuDeAcciones` / `Plegable`.
   Ojo con `pz-cifras`, `pz-cuerpo--maestro`, `pz-pestanas`.
3. `registro.ts` ya tiene `reportes` con `capacidad: 'verFinanzas'`; falta
   pintarlo en `aplicacion.tsx` (hoy cae en `Pendiente`).
4. Una prueba por archivo nuevo (guardia 7) y capturas por pestaña con
   `npm run capturas -- reportes --completa --toca="…"`.
5. **Gastos no existe** (`src/gastos/` no está, el módulo muestra "Pendiente").
   La tabla `gasto` SÍ existe y Reportes ya la consume. El usuario tiene la foto
   `imagenes de modulos/GASTOS.png` y quedó pendiente construirlo.

---

## 3. OTROS PENDIENTES CONOCIDOS

- **Módulos que siguen en "Pendiente"** (sin `src/`): Gastos, Reportes,
  Mensajes, Recordatorios, Configuración.
- Cuando exista `src/configuracion/`, la **guardia 8** revienta a propósito para
  obligar a decidir sobre el segundo factor apagado.
- Los **ataques a la base** no se han corrido nunca desde esta máquina.
