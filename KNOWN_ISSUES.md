# Problemas conocidos

Lo que sabemos que está mal y no alcanzamos a arreglar antes de entregar esto.

Si encuentras algo que no está acá, agrégalo. Casi seguro hay más. No tuvimos tiempo de
auditar todo el repo, solo de anotar lo que nos mordió mientras construíamos.

Revisión K-1 (frontend), 20 de octubre de 2026, sobre develop b9d516c. El estado de cada
ítem se verificó leyendo el código y corriendo las pruebas; lo que está en un PR abierto se
dice así y no se marca como pagado hasta que se integre en develop. Cobertura en develop:
59,7 % de líneas (198 pruebas, 37 archivos); al inicio del proyecto era 16 %.

## D-06 · La validación de horas está en tres lados

--- Pagada en el frontend (E6-01, PR #33)

El formulario ya no tiene las dos copias (`validateHoursOnSubmit` y `validateHoursLive`): usa
`src/lib/hourRules.ts`, con el mismo tope que el backend (8 horas por día, sumando los
registros de la fecha, mínimo 0,5 h por registro). La comprobación del tope se repite dentro
de la transacción de Dexie al guardar, así que dos pestañas no pueden pasarse a la vez.

Límites que quedan (anotados en la revisión del PR):
- El tope `8` es una constante en el frontend; el backend lo lee de `MAX_HOURS_PER_DAY`. Si la
  coordinación lo cambia hay que tocar los dos.
- Los mensajes de error no son idénticos a los del backend (mayúsculas y redacción).
- Falta un test del borde exacto de 0,5 h (aceptado).

El backend ya tenía una sola regla (`src/hour-log/hour-rules.ts` en su repo, E6-01).

## D-08 · El indicador de sync miente por una ventana corta

--- Corregida en el código (E1-07)

`runSync` hace ahora un solo `setStatus({ syncing: false, pending, failed })`
(`src/offline/sync/scheduler.ts`), con un comentario que cita D-08. Esta entrada seguía sin
marcarse. La verificación fue por lectura del código; no se buscó un test de secuencia con
ese nombre.

## D-09 · `HourLogForm.tsx` hace de todo

--- Abierta

Sigue en 350 líneas y es el único archivo con errores de lint (complejidad cognitiva 16 sobre
15, complejidad ciclomática 18). La validación ya salió a `hourRules.ts` (D-06). Pendiente:
E6-04 (separar el formulario).

## D-10 · Los hooks que tocan Dexie no tienen tests

--- Pagada (E6-06, PR #32)

Cubierto con suites completas y reactivas usando `fake-indexeddb`:
- `src/offline/hooks/useHourLogs.spec.ts` (ordenamiento por fecha, aislamiento por placementId y reactividad en inserciones/modificaciones/eliminaciones).
- `src/offline/hooks/usePlacement.spec.ts` (validación de sesión y rol STUDENT, aislamiento por estudiante y reactividad).
- `src/offline/hooks/useSyncStatus.spec.ts` (estado inicial, reactividad ante `setStatus` y limpieza de suscripciones en unmount).

`src/offline/hooks/`: `useHourLogs.ts`, `usePlacement.ts`, `useSyncStatus.ts`. La
excepción era `useOnline.ts`, que ya tenía spec. Todos los hooks del directorio cuentan ahora con cobertura de pruebas.

--- Hallazgos nuevos (Sprints 2 a 4)

## S-3 · El lint del frontend falla

--- Casi pagada (PR #34)

Antes: 16 problemas (13 errores). Ahora `pnpm lint` en develop da **2 problemas (1 error, 1
aviso), los dos en `HourLogForm.tsx`** (ver D-09). Se resolverán al separar el formulario
(E6-04).

## T-1b · Varias pestañas con rotación del refresh token

El single-flight de `refreshSession` es por pestaña y el servidor rota el token: dos pestañas
que renuevan a la vez enviaban el mismo token y una sesión válida se cerraba en todas.
Demostrado con dos copias del módulo y un servidor falso. Corregido con Web Locks en el PR
abierto #28 (apilado sobre #27); sin Web Locks queda la carrera. No se ha probado con dos
pestañas reales de un navegador.

## S-1b · Refresh token huérfano al cancelar el aviso de login

Si se cancelaba el aviso de horas sin sincronizar, el refresh token del login quedaba vivo
sin sesión. Corregido en el PR abierto #27.

## F-1b · El bloque 403/404 de OfferApplicationsPage estaba repetido tres veces

Un solo helper en el PR abierto #29. Otras pantallas (OfferDetailPage, CompanyOffersPage,
EvaluatePage, ReviewHoursPage, DocumentsPage) interpretan 403/404 con textos propios; no se
unificaron.

## F-2 · `LoginResponse.refreshToken` era opcional

El backend siempre lo devuelve. Obligatorio en el PR abierto #30. El tipo `Company` ya tenía
`taxId` y `contactEmail` opcionales desde T-4.

## E6-05 · La paginación del libro de horas es una decisión de producto

PR #32 (integrado): el libro de horas muestra 10 registros por página en lugar de la lista
completa. Durante la revisión se corrigió un `useMemo` llamado después de los `return`
tempranos, que rompía la pantalla al pasar de cargando a cargado. La medición del «antes»
(~423 ms) del documento `docs/E6-05-medicion-libro-horas.md` no es reproducible: el test solo
mide el «después» con una cota de 1000 ms.

## Límites conocidos de sesión

- La revocación del logout es de mejor esfuerzo: sin conexión el refresh token queda vivo
  hasta expirar.
- Cerrar la pestaña con el aviso de login abierto no revoca el token pendiente; expira solo.
