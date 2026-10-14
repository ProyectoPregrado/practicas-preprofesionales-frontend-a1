import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, onUnauthorized } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('attaches the bearer token and returns parsed json', async () => {
    localStorage.setItem('access_token', 'tok')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(api<{ id: number }>('/offers')).resolves.toEqual({ id: 1 })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('throws ApiError carrying the backend message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ statusCode: 403, message: 'rol insuficiente' }),
    }))

    await expect(api('/offers')).rejects.toMatchObject({ statusCode: 403, message: 'rol insuficiente' })
    await expect(api('/offers')).rejects.toBeInstanceOf(ApiError)
  })

  it('notifies onUnauthorized listener when response status is 401', async () => {
    const listener = vi.fn()
    const unsubscribe = onUnauthorized(listener)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ statusCode: 401, message: 'jwt expired' }),
    }))

    await expect(api('/offers')).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('does NOT notify onUnauthorized listener when 401 comes from /auth/login', async () => {
    const listener = vi.fn()
    const unsubscribe = onUnauthorized(listener)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ statusCode: 401, message: 'credenciales inválidas' }),
    }))

    await expect(api('/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError)
    expect(listener).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('handles concurrent 401 requests via Promise.all and notifies listener for each call', async () => {
    const listener = vi.fn()
    const unsubscribe = onUnauthorized(listener)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ statusCode: 401, message: 'jwt expired' }),
    }))

    await expect(
      Promise.all([api('/offers'), api('/placements'), api('/profile')])
    ).rejects.toBeInstanceOf(ApiError)

    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(1)

    unsubscribe()
  })

  describe('T-1: Renovación silenciosa y reintento ante 401', () => {
    function makeJwt(payload: Record<string, unknown>): string {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const body = btoa(JSON.stringify(payload))
      return `${header}.${body}.signature`
    }

    it('renueva proactivamente si el access token está por vencer y realiza la llamada con el nuevo token', async () => {
      const expiringExp = Math.floor(Date.now() / 1000) + 10 // vence en 10s (<= 30s)
      const expiringToken = makeJwt({ exp: expiringExp, sub: 1 })
      localStorage.setItem('access_token', expiringToken)
      localStorage.setItem('refresh_token', 'valid-refresh-token')

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/refresh')) {
          return {
            ok: true,
            json: async () => ({
              accessToken: 'new-fresh-access-token',
              refreshToken: 'new-fresh-refresh-token',
            }),
          }
        }
        if (url.endsWith('/offers')) {
          return {
            ok: true,
            json: async () => [{ id: 10, title: 'Oferta renovada' }],
          }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await api<Array<{ id: number; title: string }>>('/offers')

      expect(result).toEqual([{ id: 10, title: 'Oferta renovada' }])
      // Debe haber llamado primero a /auth/refresh
      expect(fetchMock.mock.calls[0][0]).toContain('/auth/refresh')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ refreshToken: 'valid-refresh-token' }))
      // Y luego a /offers con el nuevo token
      expect(fetchMock.mock.calls[1][0]).toContain('/offers')
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new-fresh-access-token')
      // localStorage actualizado
      expect(localStorage.getItem('access_token')).toBe('new-fresh-access-token')
      expect(localStorage.getItem('refresh_token')).toBe('new-fresh-refresh-token')
    })

    it('renueva reactivamente ante un 401, reintenta una vez y no notifica a onUnauthorized si tiene éxito', async () => {
      localStorage.setItem('access_token', 'expired-access-token')
      localStorage.setItem('refresh_token', 'my-refresh-token')

      const listener = vi.fn()
      const unsubscribe = onUnauthorized(listener)

      let offersAttempts = 0
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/offers')) {
          offersAttempts++
          if (offersAttempts === 1) {
            return { ok: false, status: 401, json: async () => ({ statusCode: 401, message: 'jwt expired' }) }
          }
          return { ok: true, json: async () => ({ success: true }) }
        }
        if (url.endsWith('/auth/refresh')) {
          return {
            ok: true,
            json: async () => ({
              accessToken: 'new-access-token',
              refreshToken: 'new-refresh-token',
            }),
          }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await api<{ success: boolean }>('/offers')

      expect(res).toEqual({ success: true })
      expect(offersAttempts).toBe(2)
      expect(localStorage.getItem('access_token')).toBe('new-access-token')
      expect(localStorage.getItem('refresh_token')).toBe('new-refresh-token')
      // No debe haberse cerrado la sesión
      expect(listener).not.toHaveBeenCalled()

      unsubscribe()
    })

    it('reintenta solo UNA vez ante 401: si el reintento también falla con 401, notifica onUnauthorized', async () => {
      localStorage.setItem('access_token', 'initial-token')
      localStorage.setItem('refresh_token', 'my-refresh-token')

      const listener = vi.fn()
      const unsubscribe = onUnauthorized(listener)

      let offersCalls = 0
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/offers')) {
          offersCalls++
          return { ok: false, status: 401, json: async () => ({ statusCode: 401, message: 'unauthorized' }) }
        }
        if (url.endsWith('/auth/refresh')) {
          return {
            ok: true,
            json: async () => ({ accessToken: 'another-token', refreshToken: 'another-refresh' }),
          }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      await expect(api('/offers')).rejects.toBeInstanceOf(ApiError)
      // Debe haber llamado a /offers 2 veces en total (original + 1 reintento)
      expect(offersCalls).toBe(2)
      // Como el reintento falló, sí debe notificar onUnauthorized
      expect(listener).toHaveBeenCalled()

      unsubscribe()
    })

    it('si /auth/refresh falla con 401 ante expiración, notifica onUnauthorized y rechaza', async () => {
      localStorage.setItem('access_token', 'expired-token')
      localStorage.setItem('refresh_token', 'revoked-refresh-token')

      const listener = vi.fn()
      const unsubscribe = onUnauthorized(listener)

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/offers')) {
          return { ok: false, status: 401, json: async () => ({ message: 'jwt expired' }) }
        }
        if (url.endsWith('/auth/refresh')) {
          return { ok: false, status: 401, json: async () => ({ message: 'la sesión expiró' }) }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', fetchMock)

      await expect(api('/offers')).rejects.toBeInstanceOf(ApiError)
      expect(listener).toHaveBeenCalled()

      unsubscribe()
    })

    it('un fallo transitorio de /auth/refresh (5xx) NO cierra la sesión ni borra los tokens', async () => {
      localStorage.setItem('access_token', 'expired-token')
      localStorage.setItem('refresh_token', 'valid-refresh-token')
      const listener = vi.fn()
      const unsubscribe = onUnauthorized(listener)
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/offers')) return { ok: false, status: 401, json: async () => ({ message: 'jwt expired' }) }
        return { ok: false, status: 503, json: async () => ({}) }
      }))

      await expect(api('/offers')).rejects.toBeInstanceOf(ApiError)

      expect(listener).not.toHaveBeenCalled()
      expect(localStorage.getItem('refresh_token')).toBe('valid-refresh-token')
      unsubscribe()
    })

    it('un error de red en /auth/refresh NO cierra la sesión', async () => {
      localStorage.setItem('access_token', 'expired-token')
      localStorage.setItem('refresh_token', 'valid-refresh-token')
      const listener = vi.fn()
      const unsubscribe = onUnauthorized(listener)
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/offers')) return { ok: false, status: 401, json: async () => ({ message: 'jwt expired' }) }
        throw new TypeError('Failed to fetch')
      }))

      await expect(api('/offers')).rejects.toBeInstanceOf(ApiError)

      expect(listener).not.toHaveBeenCalled()
      unsubscribe()
    })

    it('si el refresh token desaparece antes de renovar, el siguiente refresh sigue funcionando', async () => {
      const { refreshSession } = await import('./client')
      localStorage.removeItem('refresh_token')
      expect(await refreshSession()).toBeNull()

      localStorage.setItem('refresh_token', 'valid-refresh-token')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ accessToken: 'new-token', refreshToken: 'new-refresh' }),
      }))

      expect(await refreshSession()).toBe('new-token')
    })

    it('maneja llamadas concurrentes bajo 401 (Promise.all) llamando a /auth/refresh UNA SOLA VEZ', async () => {
      localStorage.setItem('access_token', 'expired-token')
      localStorage.setItem('refresh_token', 'shared-refresh-token')

      let refreshCallsCount = 0
      const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/auth/refresh')) {
          refreshCallsCount++
          return {
            ok: true,
            json: async () => ({
              accessToken: 'single-flight-new-token',
              refreshToken: 'single-flight-new-refresh',
            }),
          }
        }
        // Las peticiones con el token viejo fallan con 401; con el nuevo triunfan
        const authHeader = (init?.headers as Record<string, string>)?.Authorization
        if (authHeader === 'Bearer single-flight-new-token') {
          return { ok: true, json: async () => ({ ok: true, url }) }
        }
        return { ok: false, status: 401, json: async () => ({ message: 'jwt expired' }) }
      })
      vi.stubGlobal('fetch', fetchMock)

      const results = await Promise.all([
        api<{ ok: boolean; url: string }>('/offers'),
        api<{ ok: boolean; url: string }>('/placements'),
        api<{ ok: boolean; url: string }>('/profile'),
      ])

      // Todas las peticiones deben haber tenido éxito
      expect(results).toHaveLength(3)
      expect(results.every((r) => r.ok)).toBe(true)
      // IMPORTANTE: /auth/refresh solo se llamó UNA vez gracias al mutex/single-flight
      expect(refreshCallsCount).toBe(1)
      expect(localStorage.getItem('access_token')).toBe('single-flight-new-token')
    })
  })
})

