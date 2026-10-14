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

async function requestRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) {
    return null
  }

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

export async function api<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  const isAuthEndpoint =
    path.startsWith('/auth/login') || path.startsWith('/auth/refresh') || path.startsWith('/auth/logout')

  if (!isAuthEndpoint && !isRetry) {
    const currentToken = localStorage.getItem('access_token')
    const refreshToken = localStorage.getItem('refresh_token')
    if (currentToken && refreshToken && isTokenExpiringSoon(currentToken)) {
      // Si la renovación proactiva no está disponible, se sigue con el token actual:
      // el servidor decide y, si responde 401, el camino reactivo de abajo lo resuelve.
      await refreshSession().catch(() => null)
    }
  }

  const token = localStorage.getItem('access_token')
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))

    if (res.status === 401) {
      if (path.startsWith('/auth/login')) {
        throw new ApiError(res.status, body.message ?? `Error ${res.status}`)
      }

      if (!isRetry && !path.startsWith('/auth/refresh') && !path.startsWith('/auth/logout') && localStorage.getItem('refresh_token')) {
        try {
          const refreshedToken = await refreshSession()
          if (refreshedToken) {
            return api<T>(path, init, true)
          }
        } catch (err) {
          // Fallo transitorio de la renovación: no se cierra la sesión.
          if (err instanceof RefreshUnavailableError) {
            throw new ApiError(res.status, err.message)
          }
          throw err
        }
      }

      notifyUnauthorized()
    }

    throw new ApiError(res.status, body.message ?? `Error ${res.status}`)
  }

  if (res.status === 204) {
    return undefined as unknown as T
  }

  return res.json() as Promise<T>
}

