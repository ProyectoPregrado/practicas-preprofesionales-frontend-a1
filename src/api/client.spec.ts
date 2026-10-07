import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, onUnauthorized } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

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
      ok: false, status: 403,
      json: async () => ({ statusCode: 403, message: 'rol insuficiente' }),
    }))

    await expect(api('/offers')).rejects.toMatchObject({ statusCode: 403, message: 'rol insuficiente' })
    await expect(api('/offers')).rejects.toBeInstanceOf(ApiError)
  })

  it('does not notify unauthorized listeners for 401 on /auth/login', async () => {
    const listener = vi.fn()
    const unsubscribe = onUnauthorized(listener)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))

    await expect(api('/auth/login')).rejects.toBeInstanceOf(ApiError)
    await expect(api('/auth/login?from=expired')).rejects.toBeInstanceOf(ApiError)

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('notifies unauthorized listeners for 401 on non-login routes, including similar paths', async () => {
    const listener = vi.fn()
    const unsubscribe = onUnauthorized(listener)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))

    await expect(api('/offers')).rejects.toBeInstanceOf(ApiError)
    await expect(api('/auth/login/callback')).rejects.toBeInstanceOf(ApiError)

    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('handles concurrent 401 requests via Promise.all and notifies listener for each call', async () => {
    const listener = vi.fn()
    const unsubscribe = onUnauthorized(listener)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))

    await Promise.all([
      expect(api('/offers?req=1')).rejects.toBeInstanceOf(ApiError),
      expect(api('/offers?req=2')).rejects.toBeInstanceOf(ApiError),
      expect(api('/offers?req=3')).rejects.toBeInstanceOf(ApiError),
    ])

    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
  })
})
