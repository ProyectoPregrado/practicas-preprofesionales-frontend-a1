# Problemas conocidos

Lo que sabemos que está mal y no alcanzamos a arreglar antes de entregar esto.

Si encuentras algo que no está acá, agrégalo. Casi seguro hay más. No tuvimos tiempo de
auditar todo el repo, solo de anotar lo que nos mordió mientras construíamos.

## D-06 · La validación de horas está en tres lados

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

`src/components/HourLogForm.tsx`, 348 líneas.

Estado del formulario, las dos copias de la validación de horas (ver D-06), formateo de la
fecha en español para la confirmación, cálculo de la duración a partir de inicio y fin, la
escritura a `db.hourLogs` y el `enqueue()` al outbox, todo en el mismo componente.
Funciona, pero cualquier cambio, hasta uno chico como agregar un campo, obliga a leerlo
entero para saber qué más se puede romper. Debería partirse en un hook de formulario, los
helpers puros que ya casi están separados (`formatDateForConfirmation`,
`computeDurationLabel`) y un hook de persistencia aparte. No llegamos.

## D-10 · Los hooks que tocan Dexie no tienen tests

--- Pagada (E6-06)

Cubierto con suites completas y reactivas usando `fake-indexeddb`:
- `src/offline/hooks/useHourLogs.spec.ts` (ordenamiento por fecha, aislamiento por placementId y reactividad en inserciones/modificaciones/eliminaciones).
- `src/offline/hooks/usePlacement.spec.ts` (validación de sesión y rol STUDENT, aislamiento por estudiante y reactividad).
- `src/offline/hooks/useSyncStatus.spec.ts` (estado inicial, reactividad ante `setStatus` y limpieza de suscripciones en unmount).

`src/offline/hooks/`: `useHourLogs.ts`, `usePlacement.ts`, `useSyncStatus.ts`. La
excepción era `useOnline.ts`, que ya tenía spec. Todos los hooks del directorio cuentan ahora con cobertura de pruebas.
