# E1-01: reproducción de pérdida del outbox

## Objetivo

Reproducir de forma determinista la pérdida de una hora cuando la red falla durante
`pushOutbox`, sin temporizadores ni dependencias de un backend real.

## Escenario automatizado

El test `conserva la operación cuando la red falla antes del acuse del servidor`, en
`src/offline/sync/push.spec.ts`, realiza estos pasos:

1. Guarda una hora local con identificador temporal y la agrega al outbox mediante
   `enqueue`.
2. Inyecta un fallo de red haciendo que el cliente de API rechace el `POST /sync/push`.
3. Ejecuta `pushOutbox` y comprueba que el error ocurre antes de recibir un acuse.
4. Exige que la operación siga en el outbox y que la hora continúe en estado `queued`.

Con la implementación heredada, el paso 4 fallaba: `pushOutbox` ejecutaba `bulkDelete`
antes del `POST`, por lo que el contador quedaba en cero cuando la petición rechazaba. El
test permitió reproducir el defecto de forma determinista. Tras actualizar la rama con el
`develop` que conserva y registra los reintentos, el mismo caso pasa normalmente y queda
como prueba de regresión.

## Orden original del fallo

1. Se leen hasta 500 operaciones del outbox.
2. Se construye el payload y se conserva en memoria la relación entre IDs locales y
   operaciones.
3. Se borran las operaciones de Dexie con `bulkDelete`.
4. Se intenta enviar el lote al backend.
5. La red falla y no existe respuesta que pueda procesar `applyResults`.
6. La hora local sigue marcada como `queued`, pero la operación necesaria para enviarla
   ya no existe. Reiniciar la aplicación no puede recuperarla.

## Impacto por entidad

| Entidad | Impacto verificado |
| --- | --- |
| Horas | Afectadas. Son la única entidad que el frontend admite actualmente en el outbox; una caída entre el borrado y el acuse pierde la operación de forma persistente. |
| Evaluaciones | No pasan por `pushOutbox`. Se escriben directamente por HTTP, por lo que este orden de borrado no puede perder una operación encolada. Un fallo de red se propaga al flujo online. |
| Documentos | No pasan por `pushOutbox`. Igual que las evaluaciones, dependen de una petición HTTP directa y no están expuestos a este defecto concreto del outbox. |

La limitación está reflejada también por el tipo `OutboxEntry`, cuyo campo `entity` solo
acepta `hourLog`, y por la arquitectura documentada en el README.

## Estado tras actualizar con develop

La implementación actual elimina del outbox únicamente las operaciones incluidas en una
respuesta válida. Si la red falla, conserva la operación, incrementa `attempts` y registra
`lastError`. La prueba E1-01 ya no usa `it.fails`: pasa sin modificar sus expectativas y
protege la reconciliación de IDs locales con los IDs asignados por el servidor.
