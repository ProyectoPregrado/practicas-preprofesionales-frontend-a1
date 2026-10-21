import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// T-1b: dos pestañas comparten localStorage pero cada una tiene su propia copia del módulo (y su propio
// single-flight). El servidor rota el refresh token: si las dos renuevan con el mismo token casi a la vez,
// una gana y la otra recibe 401. Una sesión válida no puede cerrarse por esa carrera.

type Client = typeof import('./client')

// Una "pestaña" es una copia independiente del módulo del cliente.
async function openTab(): Promise<Client> {
  vi.resetModules()
  return import('./client')
}

function fakeServer() {
  let validRefresh = 'ref-0'
  let rotations = 0
  const refreshBodies: string[] = []

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/refresh')) {
      const { refreshToken } = JSON.parse(String(init?.body)) as { refreshToken: string }
      refreshBodies.push(refreshToken)
      // El servidor decide en el momento en que llega la petición.
      if (refreshToken !== validRefresh) {
        return { ok: false, status: 401, json: async () => ({ message: 'sesión expirada' }) }
      }
      rotations += 1
      validRefresh = `ref-${rotations}`
      const body = { accessToken: `acc-${rotations}`, refreshToken: validRefresh }
      // La respuesta del ganador llega después de la del perdedor: el peor caso para quien lea localStorage.
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { ok: true, status: 200, json: async () => body }
    }
    const bearer = new Headers(init?.headers).get('Authorization')
    if (bearer !== `Bearer acc-${rotations}`) {
      return { ok: false, status: 401, json: async () => ({ message: 'jwt expired' }) }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  })

  return { fetchMock, refreshBodies, rotations: () => rotations }
}

// Simula Web Locks entre pestañas: un único candado compartido por nombre.
function installWebLocks() {
  let tail: Promise<unknown> = Promise.resolve()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: <T>(_name: string, callback: () => Promise<T>) => {
        const run = tail.then(callback)
        tail = run.catch(() => undefined)
        return run
      },
    },
  })
}

function removeWebLocks() {
  Reflect.deleteProperty(navigator, 'locks')
}

beforeEach(() => {
  localStorage.setItem('access_token', 'acc-expired')
  localStorage.setItem('refresh_token', 'ref-0')
  installWebLocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  removeWebLocks()
  localStorage.clear()
})

describe('T-1b: renovación con varias pestañas', () => {
  it('dos pestañas renuevan a la vez: las dos obtienen sesión y solo se envía una renovación', async () => {
    const server = fakeServer()
    vi.stubGlobal('fetch', server.fetchMock)
    const [tabA, tabB] = [await openTab(), await openTab()]

    const [a, b] = await Promise.all([tabA.refreshSession(), tabB.refreshSession()])

    expect(a).toBe('acc-1')
    expect(b).toBe('acc-1')
    expect(server.refreshBodies).toEqual(['ref-0'])
    expect(localStorage.getItem('refresh_token')).toBe('ref-1')
  })

  it('dos pestañas con 401 a la vez no cierran la sesión de ninguna', async () => {
    const server = fakeServer()
    vi.stubGlobal('fetch', server.fetchMock)
    const [tabA, tabB] = [await openTab(), await openTab()]
    const unauthorizedA = vi.fn()
    const unauthorizedB = vi.fn()
    tabA.onUnauthorized(unauthorizedA)
    tabB.onUnauthorized(unauthorizedB)

    const results = await Promise.allSettled([tabA.api('/offers'), tabB.api('/placements')])

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(unauthorizedA).not.toHaveBeenCalled()
    expect(unauthorizedB).not.toHaveBeenCalled()
    expect(server.rotations()).toBe(1)
    expect(localStorage.getItem('refresh_token')).toBe('ref-1')
  })

  it('una pestaña que esperaba el candado no renueva con el token que otra ya usó', async () => {
    const server = fakeServer()
    vi.stubGlobal('fetch', server.fetchMock)
    const [tabA, tabB] = [await openTab(), await openTab()]

    await tabA.refreshSession()
    // tabB todavía creía tener ref-0 cuando empezó; en el momento de renovar ya hay un token nuevo.
    localStorage.setItem('refresh_token', 'ref-0')
    const pendingB = tabB.refreshSession()
    localStorage.setItem('refresh_token', 'ref-1')

    await expect(pendingB).resolves.toBe('acc-1')
    expect(server.refreshBodies).toEqual(['ref-0'])
  })

  it('si otra pestaña cerró la sesión mientras esperaba, no renueva y devuelve null', async () => {
    const server = fakeServer()
    vi.stubGlobal('fetch', server.fetchMock)
    const tab = await openTab()

    const pending = tab.refreshSession()
    localStorage.removeItem('refresh_token')

    await expect(pending).resolves.toBeNull()
    expect(server.refreshBodies).toEqual([])
  })

  it('sin Web Locks sigue renovando en una sola pestaña', async () => {
    removeWebLocks()
    const server = fakeServer()
    vi.stubGlobal('fetch', server.fetchMock)
    const tab = await openTab()

    await expect(tab.refreshSession()).resolves.toBe('acc-1')
    expect(localStorage.getItem('refresh_token')).toBe('ref-1')
  })
})
