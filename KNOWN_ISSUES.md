# Problemas conocidos

Lo que sabemos que está mal y no alcanzamos a arreglar antes de entregar esto.

Si encuentras algo que no está acá, agrégalo. Casi seguro hay más. No tuvimos tiempo de
auditar todo el repo, solo de anotar lo que nos mordió mientras construíamos.

Revisión de cierre (frontend), 21 de octubre de 2026, sobre develop 4a6d9f7. El estado de
cada ítem se verificó leyendo el código y corriendo las pruebas. Con todo integrado:
244 pruebas en 42 archivos, 63,6 % de cobertura de líneas (al inicio del proyecto era
16 %), `pnpm lint` sin hallazgos, `tsc --noEmit` y `pnpm build` correctos.

## D-06 · La validación de horas está en tres lados

--- Deuda Pagada

Pagada en el frontend con E6-01 (PR #33): el formulario ya no tiene las dos copias
(`validateHoursOnSubmit` y `validateHoursLive`) y usa `src/lib/hourRules.ts`, con el mismo
tope que el backend (8 horas por día, sumando los registros de la fecha, mínimo 0,5 h por
registro). La comprobación del tope se repite dentro de la transacción de Dexie al guardar,
así que dos pestañas no pueden pasarse a la vez. El backend ya tenía una sola regla
(`src/hour-log/hour-rules.ts` en su repo).

Límites que quedan (anotados en la revisión del PR):
- El tope `8` es una constante en el frontend; el backend lo lee de `MAX_HOURS_PER_DAY`. Si la
  coordinación lo cambia hay que tocar los dos.
- Los mensajes de error no son idénticos a los del backend (mayúsculas y redacción).
- Falta un test del borde exacto de 0,5 h (aceptado).

## D-08 · El indicador de sync miente por una ventana corta

--- Deuda Pagada

Corregida en el código con E1-07: `runSync` hace un solo
`setStatus({ syncing: false, pending, failed })` (`src/offline/sync/scheduler.ts`), con un
comentario que cita D-08. Esta entrada seguía sin marcarse. La verificación fue por lectura
del código; no se buscó un test de secuencia con ese nombre.

## D-09 · `HourLogForm.tsx` hace de todo

--- Deuda Pagada

Pagada con E6-04 (PR #35): `HourLogForm.tsx` pasó de 350 a 84 líneas y solo presenta. El
estado y el envío viven en `useHourLogForm` (122 líneas), la persistencia atómica con el
outbox en `hourLogPersistence.ts`, los errores en `hourLogErrors.ts`, los helpers puros en
`hourLogHelpers.ts` y los campos en `components/hour-log/`. Ningún archivo pasa de 150
líneas y cada pieza tiene pruebas.

## D-10 · Los hooks que tocan Dexie no tienen tests

--- Deuda Pagada

Pagada con E6-06 (PR #32), con suites reactivas sobre `fake-indexeddb`:
- `src/offline/hooks/useHourLogs.spec.ts` (ordenamiento por fecha, aislamiento por placementId y reactividad en inserciones/modificaciones/eliminaciones).
- `src/offline/hooks/usePlacement.spec.ts` (validación de sesión y rol STUDENT, aislamiento por estudiante y reactividad).
- `src/offline/hooks/useSyncStatus.spec.ts` (estado inicial, reactividad ante `setStatus` y limpieza de suscripciones en unmount).

Todos los hooks del directorio tienen cobertura de pruebas (`useOnline` ya la tenía).

--- Hallazgos de los Sprints 2 a 4

## S-3 · El lint del frontend fallaba

--- Deuda Pagada

Antes: 16 problemas (13 errores). El PR #34 resolvió los de `api/`, `crossTab`, las páginas y
el contexto de sesión, y E6-04 (#35) los de `HourLogForm`. Ahora `pnpm lint` en develop no da
hallazgos.

## T-1b · Varias pestañas con rotación del refresh token

--- Deuda Pagada

El single-flight de `refreshSession` es por pestaña y el servidor rota el token: dos pestañas
que renuevan a la vez enviaban el mismo token y una sesión válida se cerraba en todas. Se
demostró con dos copias del módulo y un servidor falso, y se corrigió con Web Locks
(PR #28). Sin Web Locks (navegadores viejos) queda la carrera. **No se ha probado con dos
pestañas reales de un navegador**: jsdom no tiene `navigator.locks`.

## S-1b · Refresh token huérfano al cancelar el aviso de login

--- Deuda Pagada

Si se cancelaba el aviso de horas sin sincronizar, el refresh token del login quedaba vivo sin
sesión. Corregido en el PR #27: cancelar, o iniciar con otras credenciales, lo revoca.

## F-1b · El bloque 403/404 de OfferApplicationsPage estaba repetido tres veces

--- Deuda Pagada

Un solo helper (PR #29). Otras pantallas (OfferDetailPage, CompanyOffersPage, EvaluatePage,
ReviewHoursPage, DocumentsPage) interpretan 403/404 con textos propios; no se unificaron
porque cambiaría lo que ve el usuario.

## F-2 · `LoginResponse.refreshToken` era opcional

--- Deuda Pagada

El backend siempre lo devuelve; ahora es obligatorio en el tipo (PR #30). El tipo `Company` ya
tenía `taxId` y `contactEmail` opcionales desde T-4.

## E6-05 · La paginación del libro de horas es una decisión de producto

PR #32: el libro de horas muestra 10 registros por página en lugar de la lista completa.
Durante la revisión se corrigió un `useMemo` llamado después de los `return` tempranos, que
rompía la pantalla al pasar de cargando a cargado. La medición del «antes» (~423 ms) de
`docs/E6-05-medicion-libro-horas.md` no es reproducible: el test solo mide el «después» con
una cota de 1000 ms.

## Límites conocidos de sesión

- La revocación del logout es de mejor esfuerzo: sin conexión el refresh token queda vivo
  hasta expirar.
- Cerrar la pestaña con el aviso de login abierto no revoca el token pendiente; expira solo.
