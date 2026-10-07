const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

const unauthorizedListeners = new Set<() => void>()

function normalizePath(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return new URL(path).pathname
  }
  return path.split('?')[0]
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    listener()
  }
}

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    if (res.status === 401 && normalizePath(path) !== '/auth/login') {
      notifyUnauthorized()
    }
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.message ?? `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}
