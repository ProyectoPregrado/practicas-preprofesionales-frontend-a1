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
})
