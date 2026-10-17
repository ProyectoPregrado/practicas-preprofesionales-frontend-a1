# Problemas conocidos

Lo que sabemos que está mal y no alcanzamos a arreglar antes de entregar esto.

Si encuentras algo que no está acá, agrégalo. Casi seguro hay más. No tuvimos tiempo de
auditar todo el repo, solo de anotar lo que nos mordió mientras construíamos.

Revisión K-1 (frontend), 17 de octubre de 2026, sobre develop aee183e. El estado de cada
ítem se verificó leyendo el código; lo que está en un PR abierto se dice así y no se marca
como pagado hasta que se integre en develop. Cobertura en develop: 58,6 % de líneas
(159 pruebas, 33 archivos); al inicio del proyecto era 16 %.

## D-06 · La validación de horas está en tres lados

--- Parcial: backend pagado, frontend abierto

El backend ya tiene una sola regla (`src/hour-log/hour-rules.ts` en el repo del backend, 8 horas
por día, E6-01). En este repo `HourLogForm.tsx` sigue con sus dos copias y limita 8 horas
**por registro**, no por día. Pendiente: E6-01 (frontend).

`src/components/HourLogForm.tsx` (este repo), más `src/hour-log/dto/create-hour-log.dto.ts`
y `src/hour-log/hour-log.service.ts` en el backend.

Y encima, en el frontend está duplicada dos veces sobre sí misma: `validateHoursOnSubmit` y
`validateHoursLive` son la misma regla copiada a mano, una para cuando se envía el
formulario y otra para el aviso que aparece mientras el estudiante todavía está escribiendo.
Acá el tope es 8 horas. El DTO del backend permite hasta 12. El servicio del backend corta
en 10. Tres números para la misma regla de negocio y ninguno coincide con los otros dos.
Nadie recuerda cuál es el correcto. Probablemente ninguno. Hay que preguntarle a alguien de
la unidad de vinculación cuántas horas se pueden registrar por día antes de tocar esto.

## D-08 · El indicador de sync miente por una ventana corta

--- Corregida en el código (E1-07)

`runSync` hace ahora un solo `setStatus({ syncing: false, pending, failed })`
(`src/offline/sync/scheduler.ts`), con un comentario que cita D-08. Esta entrada seguía sin
marcarse. La verificación fue por lectura del código; no se buscó un test de secuencia con
ese nombre.

`src/offline/sync/status.ts`, `src/offline/sync/scheduler.ts`.

Cuando termina un push, `runSync` llama `setStatus({ syncing: false, lastSyncAt: ... })`.
En ese momento el indicador ya se pinta como sincronizado. El contador de `pending` se
recalcula aparte, en un `await db.outbox.count()` una línea después. Entre esas dos
llamadas hay una vuelta al event loop en la que el estado en memoria dice "ya terminé" con
un contador de pendientes que todavía no se actualizó. Es una ventana de milisegundos, no
la vas a notar mirando la pantalla, pero si escribes un test que aserte sobre el orden de
los estados del indicador, la vas a agarrar. No nos alcanzó a arreglar. Hay que juntar
ambos `setStatus` en uno solo, o calcular `pending` antes de marcar `syncing: false`.

## D-09 · `HourLogForm.tsx` hace de todo

--- Abierta

Sigue en 353 líneas. Pendiente: E6-04 (depende de E6-01 del frontend).

`src/components/HourLogForm.tsx`, 348 líneas.

Estado del formulario, las dos copias de la validación de horas (ver D-06), formateo de la
fecha en español para la confirmación, cálculo de la duración a partir de inicio y fin, la
escritura a `db.hourLogs` y el `enqueue()` al outbox, todo en el mismo componente.
Funciona, pero cualquier cambio, hasta uno chico como agregar un campo, obliga a leerlo
entero para saber qué más se puede romper. Debería partirse en un hook de formulario, los
helpers puros que ya casi están separados (`formatDateForConfirmation`,
`computeDurationLabel`) y un hook de persistencia aparte. No llegamos.

## D-10 · Los hooks que tocan Dexie no tienen tests

--- Abierta

Sigue sin spec para `useHourLogs`, `usePlacement` y `useSyncStatus` (solo `useOnline` tiene).
Pendiente: E6-06.

`src/offline/hooks/`: `useHourLogs.ts`, `usePlacement.ts`, `useSyncStatus.ts`. La
excepción es `useOnline.ts`, que sí tiene spec.

No supimos testear hooks que tocan IndexedDB y lo dejamos así. Todos usan `useLiveQuery` de
`dexie-react-hooks` contra la base real de Dexie; en otras partes del repo probamos con
`fake-indexeddb` (mira `offline/db.spec.ts` como referencia) y no debería ser muy distinto
hacerlo acá, pero nunca nos sentamos a escribirlos. Si vas a tocar cómo se leen las horas o
la plaza del estudiante desde la UI, vas a ciegas. No hay red de seguridad que te avise si
rompiste algo.

--- Hallazgos nuevos (Sprints 2 y 3)

## S-3 · El lint del frontend falla

`pnpm lint` en develop da 16 problemas (13 errores, 3 avisos), casi todos de sonarjs
(ternarios anidados, complejidad de `api`, `void`). Los PR de los Sprints 2 y 3 sumaron
errores sobre los que ya existían. Abierta.

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

## Límites conocidos de sesión

- La revocación del logout es de mejor esfuerzo: sin conexión el refresh token queda vivo
  hasta expirar.
- Cerrar la pestaña con el aviso de login abierto no revoca el token pendiente; expira solo.
