# E3-01 — Auditoría de permisos por ruta (frontend)

Complemento de `docs/E3-01-auditoria-permisos-endpoints.md` del repositorio backend. Allí está el
inventario de endpoints con sus pruebas `curl`; aquí está la otra mitad: qué rutas protege el
cliente, con qué datos decide, y qué da por hecho del servidor.

Un cliente no impone permisos: todo lo que hace `RequireRole` se puede saltar editando el
navegador. Por eso en este repositorio no hay `curl` ni "explotable". Lo que se audita es otra
cosa: **que la interfaz no esconda un agujero del servidor** y que la sesión y los datos locales
no se filtren entre usuarios.

> **Estado de la verificación.** Todo lo de este documento sale de leer el código en `develop`
> (`0a2633f`). No ejecuté el frontend ni lo probé en un navegador: los hallazgos C-2 y C-3
> quedan marcados "por verificar" y traen los pasos para comprobarlos.

## 1. Cómo decide el cliente

- La sesión vive en `localStorage`: `access_token` (el JWT) y `user` (JSON con `id`, `email`,
  `fullName`, `role`, `companyId`). `AuthContext` lee `user` al arrancar (`readStoredUser`).
- `RequireRole` (`src/auth/RequireRole.tsx`) compara el `role` de ese `user` con la lista de roles
  de la ruta; si no coincide, redirige a `/`. No consulta al servidor ni decodifica el token.
- `AppLayout` muestra el menú según el rol (`NAV_BY_ROLE`).
- `api()` (`src/api/client.ts`) manda el token en `Authorization` y lanza `ApiError` ante cualquier
  respuesta no exitosa. **No trata distinto el 401 ni el 403.**

## 2. Rutas protegidas (12) y qué servidor las respalda

Además hay `/login` (pública) y `/` (redirige a la pantalla inicial del rol). Todas las rutas de la
tabla van envueltas en `RequireRole` y dentro de `AppLayout`, que a su vez exige cualquier rol.

"Servidor" remite a la numeración del inventario del backend (`#n`) y a sus hallazgos.

| Ruta | Rol | De dónde salen los datos | Endpoints que llama | ¿Lo cierra el servidor? |
|---|---|---|---|---|
| `/ofertas` | STUDENT | API | `GET /offers` (#5) | Sí |
| `/ofertas/:id` | STUDENT | API | `GET /offers/:id` (#7), `POST /applications` (#11) | **No**: H-5 (#7). `POST /applications` sí |
| `/postulaciones` | STUDENT | API | `GET /applications/me` (#13) | Sí |
| `/mi-practica` | STUDENT | Dexie | (vía `/sync/pull`, #26) | Sí |
| `/horas` | STUDENT | Dexie + cola de envío | `POST /sync/push` (#27) | Sí |
| `/documentos` | STUDENT | Dexie + API | `POST /placements/:id/documents` (#19) | Sí |
| `/practicantes` | TUTOR | Dexie (`placements` con `tutorId = user.id`) | (vía `/sync/pull`, #26) | Sí |
| `/practicantes/:id/horas` | TUTOR | Dexie | `PATCH /hour-logs/:id/review` (#23) | **No**: H-1 |
| `/practicantes/:id/evaluar` | TUTOR | Dexie + API | `POST /evaluations` (#24) | Sí |
| `/ofertas-empresa` | COMPANY | API | `GET /companies` (#3), `GET /offers/me` (#6), `POST /offers` (#8), `PATCH /offers/:id/publish` (#9), `PATCH /offers/:id/close` (#10) | **No**: H-4 (#8, #9, #10) y H-6 (#3) |
| `/ofertas-empresa/:id/postulaciones` | COMPANY | API | `GET /offers/:id` (#7), `GET /offers/:id/applications` (#12), `PATCH /applications/:id/decide` (#14) | **No**: H-3 (#12, #14) y H-5 (#7) |
| `/acreditacion` | COORDINATOR | API | `GET /placements/accreditation` (#15) | Sí |

Todos los roles ejecutan `startSync()` desde `AppLayout`, así que todos llaman a
`GET /sync/pull` cada minuto; para empresa y coordinación vuelve vacío porque el servidor filtra
por estudiante o tutor (#26).

**Lectura de la tabla:** de las 12 rutas, 4 llaman a endpoints con hallazgo (H-1, H-3, H-4, H-5).
En esas cuatro la interfaz solo muestra a cada usuario lo suyo, pero el servidor no lo exige. Es
decir: hoy esos agujeros no se ven desde la aplicación, y solo se alcanzan llamando a la API
directamente, como hicieron los `curl` del backend.

## 3. Hallazgos del cliente

### C-1 — La protección de rutas es solo de presentación · informativo

El rol sale de `localStorage.user`, que cualquiera puede editar. Cambiar `role` en el navegador
muestra pantallas de otro rol, pero el servidor sigue respondiendo según el rol del token: en la
auditoría del backend, un estudiante que intenta aprobar una hora recibe `403 "rol insuficiente"`.
No es un agujero; es la razón por la que **H-1, H-3, H-4 y H-5 hay que cerrarlos en el servidor** y
no esconderlos en la interfaz.

### C-2 — `login` no limpia los datos locales; solo `logout` lo hace · prioridad media · por verificar

`logout` borra Dexie y `localStorage` (`AuthContext.tsx:60`). `login` no borra nada
(`AuthContext.tsx:47`). Si una sesión termina sin pulsar "Salir" (el token expira, se cierra la
pestaña, o alguien borra solo `localStorage`), la base local y el checkpoint de sincronización del
usuario anterior siguen ahí cuando entra otro usuario. El comentario de `logout` describe justo
ese riesgo para el laboratorio compartido.

Las pantallas del estudiante filtran por su propio id (`usePlacement`: `studentId = user.id`) y la
lista del tutor por `tutorId = user.id`, pero `ReviewHoursPage` lee `db.placements.get(id)` y
`db.hourLogs` por `placementId` sin comprobar de quién son (`EvaluatePage` también lee
`db.placements.get(id)`): un tutor que abra `/practicantes/<id>/horas` con el id de una plaza que
dejó otro tutor vería esas horas locales.

Para comprobarlo: entrar como `tutor0`, dejar que sincronice, **borrar solo** `access_token` y
`user` de `localStorage` (sin "Salir"), entrar como `tutor1` y abrir `/practicantes/1/horas`
(plaza 1, de `tutor0`). Si muestra horas, el hallazgo se confirma.
Lo cubre en parte la parte 2 de E3-03 frontend (limpiar datos al expirar o cerrar sesión), pero el
caso "iniciar sesión sin haber cerrado" no está en su texto: conviene avisar a quien la tiene.

### C-3 — Riesgo de integración abierto: tokens de 15 minutos sin manejo de 401 · prioridad alta · por verificar

El backend en `develop` ya emite el access token con vida de **15 minutos** por defecto
(`token-config.ts`, E3-03 backend) y devuelve un `refreshToken`. El cliente en `develop`:

- Guarda solo `accessToken` y `user` en el login (`LoginResponse` no incluye `refreshToken`).
- No tiene ningún tratamiento de 401 ni de renovación (no hay coincidencias de `401` ni de
  `refreshToken` en `src`).

Consecuencia esperada: pasados 15 minutos, toda llamada falla con 401 y se muestra como un error
genérico; la sincronización en segundo plano reintenta con retroceso en vez de mandar al usuario al
login. Es exactamente el caso que advierte la nota técnica de E3-03 ("si el cliente no maneja el
401 antes de que expiren los tokens, el usuario verá errores raros").

Para comprobarlo: con backend y frontend de `develop`, iniciar sesión y esperar 15 minutos (o
arrancar el backend con `JWT_EXPIRES_IN=1m`), y mirar la pantalla y la consola.
Lo resuelve la parte 1 de E3-03 frontend (detectar 401 y redirigir). Mientras no esté integrada, la
combinación `develop` de backend y frontend tiene esta ventana.

### C-4 — Token y usuario en `localStorage` · prioridad baja

Cualquier script que corra en la página puede leer `access_token`. Es una decisión habitual en
aplicaciones de una sola página y no se propone cambiarla en este sprint; la expiración corta de
E3-03 reduce el daño de un token robado.

### Nota para el issue #13 (H-4)

`CompanyOffersPage` arma el `CreateOfferDto` con `companyId: user.companyId`
(`CompanyOffersPage.tsx:424`): el cliente ya manda la empresa correcta, y el servidor acepta lo que
llegue. Al corregir H-4 en el backend, el cliente seguirá funcionando si el servidor comprueba que
ese `companyId` coincide con el del token; si en cambio el servidor lo ignora, se puede quitar del
DTO del cliente.

## 4. Quién cubre qué

| Hallazgo | Cubre | Estado |
|---|---|---|
| C-1 | Los issues del backend (#13, #14, E3-02, E3-07) | Sin acción en el cliente |
| C-2 | E3-03 frontend, parte 2 (Fariddy), con el caso "login sin logout previo" | Por verificar y avisar |
| C-3 | E3-03 frontend, parte 1 (Cristian) | Por verificar; riesgo mientras no se integre |
| C-4 | Ninguna | Documentado, sin acción |

No se crean issues nuevos desde esta auditoría: C-2 y C-3 caen dentro de E3-03, y C-1 y C-4 no son
accionables. Si al verificar C-2 resulta que no queda cubierto por E3-03, hay que abrir una tarea
hija.
