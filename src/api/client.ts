const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type UnauthorizedListener = () => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

function notifyUnauthorized() {
  unauthorizedListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // Ignore listener errors
    }
  })
}

export function isTokenExpiringSoon(token: string, bufferSeconds = 30): boolean {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return false
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const payloadStr = typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary')
    const payload = JSON.parse(payloadStr) as { exp?: number }
    if (typeof payload.exp !== 'number') return false
    const nowInSeconds = Math.floor(Date.now() / 1000)
    return payload.exp - nowInSeconds <= bufferSeconds
  } catch {
    return false
  }
}

let refreshPromise: Promise<string | null> | null = null

// El servidor no pudo responder (5xx, red caída): la sesión puede seguir siendo válida,
// así que no se cierra. Solo un rechazo definitivo (401/403) devuelve null.
export class RefreshUnavailableError extends Error {
  constructor() {
    super('No se pudo renovar la sesión, intenta de nuevo')
    this.name = 'RefreshUnavailableError'
  }
}

// T-1b: el single-flight de abajo es por pestaña y el refresh token rota. Dos pestañas que renuevan a la
// vez enviarían el mismo token: una gana y la otra recibe 401, y ese 401 cerraría una sesión válida.
// Web Locks serializa la renovación entre pestañas.
// shortcut: sin Web Locks (navegadores viejos) la carrera entre pestañas sigue ahí; sin alternativa barata.
async function withRefreshLock(task: () => Promise<string | null>): Promise<string | null> {
  return navigator.locks ? await navigator.locks.request('yura-token-refresh', task) : task()
}

async function requestRefresh(): Promise<string | null> {
  const staleToken = localStorage.getItem('refresh_token')
  if (!staleToken) {
    return null
  }
  return withRefreshLock(async () => {
    // Mientras esperaba el candado, otra pestaña pudo renovar (token distinto) o cerrar la sesión (sin token).
    const current = localStorage.getItem('refresh_token')
    if (current === staleToken) return renewWith(staleToken)
    return current ? localStorage.getItem('access_token') : null
  })
}

async function renewWith(refreshToken: string): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    throw new RefreshUnavailableError()
  }

  if (res.status === 401 || res.status === 403) {
    return null
  }
  if (!res.ok) {
    throw new RefreshUnavailableError()
  }

  const data = (await res.json().catch(() => null)) as {
    accessToken?: string
    refreshToken?: string
    user?: unknown
  } | null
  if (!data?.accessToken) {
    return null
  }
  localStorage.setItem('access_token', data.accessToken)
  if (data.refreshToken) {
    localStorage.setItem('refresh_token', data.refreshToken)
  }
  if (data.user) {
    localStorage.setItem('user', JSON.stringify(data.user))
  }
  return data.accessToken
}

// Single-flight: las llamadas concurrentes comparten una sola renovación (el refresh token rota,
// un segundo intento con el token viejo fallaría). El `.finally` va sobre la promesa y no dentro
// de la función async: así se limpia aunque la función retorne antes del primer `await`.
export function refreshSession(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = requestRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

async function maybeProactiveRefresh(path: string, isRetry: boolean): Promise<void> {
  const isAuthEndpoint =
    path.startsWith('/auth/login') || path.startsWith('/auth/refresh') || path.startsWith('/auth/logout')

  if (isAuthEndpoint || isRetry) {
    return
  }

  const currentToken = localStorage.getItem('access_token')
  const refreshToken = localStorage.getItem('refresh_token')
  if (currentToken && refreshToken && isTokenExpiringSoon(currentToken)) {
    // Si la renovación proactiva no está disponible, se sigue con el token actual:
    // el servidor decide y, si responde 401, el camino reactivo de abajo lo resuelve.
    await refreshSession().catch(() => null)
  }
}

function isRefreshEligible(path: string, isRetry: boolean): boolean {
  if (isRetry || path.startsWith('/auth/refresh') || path.startsWith('/auth/logout')) {
    return false
  }
  return Boolean(localStorage.getItem('refresh_token'))
}

async function handleUnauthorized(
  path: string,
  init: RequestInit,
  isRetry: boolean,
  status: number,
  bodyMessage?: string,
): Promise<Response> {
  if (path.startsWith('/auth/login')) {
    throw new ApiError(status, bodyMessage ?? `Error ${status}`)
  }

  if (isRefreshEligible(path, isRetry)) {
    try {
      const refreshedToken = await refreshSession()
      if (refreshedToken) {
        return await send(path, init, true)
      }
    } catch (err) {
      // Fallo transitorio de la renovación: no se cierra la sesión.
      if (err instanceof RefreshUnavailableError) {
        throw new ApiError(status, err.message)
      }
      throw err
    }
  }

  notifyUnauthorized()
  throw new ApiError(status, bodyMessage ?? `Error ${status}`)
}

/**
 * Hace la petición con el token y la renovación de sesión, y devuelve la respuesta ya comprobada (2xx). Con un
 * `FormData` no se fija `Content-Type`: el navegador pone el `multipart/form-data` con su separador.
 */
async function send(path: string, init: RequestInit, isRetry: boolean): Promise<Response> {
  await maybeProactiveRefresh(path, isRetry)

  const token = localStorage.getItem('access_token')
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 401) {
      return handleUnauthorized(path, init, isRetry, res.status, body.message)
    }
    throw new ApiError(res.status, body.message ?? `Error ${res.status}`)
  }

  return res
}

export async function api<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  const res = await send(path, init, isRetry)

  if (res.status === 204) {
    return undefined as unknown as T
  }

  return res.json() as Promise<T>
}

/** DOC-2: un archivo del servidor (un PDF, una imagen) con la misma sesión que el resto de la API. */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await send(path, {}, false)
  return res.blob()
}
