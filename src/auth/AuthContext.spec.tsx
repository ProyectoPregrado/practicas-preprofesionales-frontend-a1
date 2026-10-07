import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, onUnauthorized } from '@/api/client'
import { db } from '@/offline/db'
import { getCrossTabChannel } from '@/offline/sync/crossTab'
import { AuthProvider, useAuth } from './AuthContext'

const navigateMock = vi.fn()
const unauthorizedListeners = new Set<() => void>()
const postMessageMock = vi.fn()
const removeChannelListenerMock = vi.fn()
let channelListener: ((msg: { type: string; payload?: unknown }) => void | Promise<void>) | null = null
const TEST_LOGIN_SECRET = 'test-secret'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: vi.fn() }
})

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    api: vi.fn(),
    onUnauthorized: vi.fn((listener: () => void) => {
      unauthorizedListeners.add(listener)
      return () => unauthorizedListeners.delete(listener)
    }),
  }
})

vi.mock('@/offline/sync/crossTab', () => ({
  getCrossTabChannel: vi.fn(() => ({
    postMessage: postMessageMock,
    onMessage: (listener: (msg: { type: string; payload?: unknown }) => void | Promise<void>) => {
      channelListener = listener
      return () => {
        if (channelListener === listener) channelListener = null
        removeChannelListenerMock()
      }
    },
  })),
}))

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

function withProvider({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  )
}

async function emitUnauthorized() {
  await act(async () => {
    for (const listener of [...unauthorizedListeners]) {
      listener()
    }
  })
}

async function emitRemoteLogout(reason: 'SESSION_EXPIRED' | 'EXPLICIT_LOGOUT') {
  await act(async () => {
    await channelListener?.({
      type: 'LOGOUT',
      payload: { reason },
    })
  })
}

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  unauthorizedListeners.clear()
  channelListener = null
  postMessageMock.mockClear()
  removeChannelListenerMock.mockClear()
  navigateMock.mockClear()
  vi.mocked(useNavigate).mockReturnValue(navigateMock)
  await db.delete()
  await db.open()
})

afterEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  await db.delete()
  await db.open()
})

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth(), { wrapper })).toThrow('useAuth debe usarse dentro de AuthProvider')
  })
})

describe('AuthProvider', () => {
  it('starts with no user when localStorage is empty', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    expect(result.current.user).toBeNull()
    expect(result.current.role).toBeNull()
  })

  it('restores a valid stored user on init', () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, email: 'coordinador@miyura.com', fullName: 'Coordinación', role: 'COORDINATOR', companyId: null }),
    )
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    expect(result.current.user?.email).toBe('coordinador@miyura.com')
    expect(result.current.role).toBe('COORDINATOR')
  })

  it('ignores a corrupted stored user instead of throwing', () => {
    localStorage.setItem('user', '{not-json')
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    expect(result.current.user).toBeNull()
  })

  it('login stores the token and user, and updates the context', async () => {
    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-123',
      user: { id: 5, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1 },
    })
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })

    await act(async () => {
      await result.current.login('empresa0@miyura.com', TEST_LOGIN_SECRET)
    })

    expect(api).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'empresa0@miyura.com', password: TEST_LOGIN_SECRET }),
    })
    expect(localStorage.getItem('access_token')).toBe('tok-123')
    expect(localStorage.getItem('last_user_id')).toBe('5')
    expect(result.current.user?.companyId).toBe(1)
    expect(result.current.role).toBe('COMPANY')
  })

  it('logout clears storage, local Dexie data and broadcasts explicit logout', async () => {
    await db.outbox.add({
      clientOpId: 'op-1',
      entity: 'hourLog',
      op: 'create',
      payload: { hours: 2 },
      baseVersion: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      attempts: 0,
      lastError: null,
    })

    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-123',
      user: { id: 5, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1 },
    })
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })

    await act(async () => {
      await result.current.login('empresa0@miyura.com', TEST_LOGIN_SECRET)
    })
    await act(async () => {
      await result.current.logout()
    })

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('last_user_id')).toBeNull()
    expect(await db.outbox.count()).toBe(0)
    expect(postMessageMock).toHaveBeenCalledWith('LOGOUT', { reason: 'EXPLICIT_LOGOUT' })
    expect(result.current.user).toBeNull()
  })

  it('clears Dexie when a different user logs in', async () => {
    localStorage.setItem('last_user_id', '99')
    await db.outbox.add({
      clientOpId: 'op-old-user',
      entity: 'hourLog',
      op: 'create',
      payload: { hours: 4 },
      baseVersion: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      attempts: 0,
      lastError: null,
    })

    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-new',
      user: { id: 5, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1 },
    })

    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    await act(async () => {
      await result.current.login('empresa0@miyura.com', TEST_LOGIN_SECRET)
    })

    expect(await db.outbox.count()).toBe(0)
  })

  it('keeps Dexie data when the same user logs in again', async () => {
    localStorage.setItem('last_user_id', '5')
    await db.outbox.add({
      clientOpId: 'op-same-user',
      entity: 'hourLog',
      op: 'create',
      payload: { hours: 6 },
      baseVersion: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      attempts: 0,
      lastError: null,
    })

    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-same',
      user: { id: 5, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1 },
    })

    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    await act(async () => {
      await result.current.login('empresa0@miyura.com', TEST_LOGIN_SECRET)
    })

    expect(await db.outbox.count()).toBe(1)
  })

  it('on 401 it clears only session, preserves outbox and broadcasts session expiration', async () => {
    localStorage.setItem('access_token', 'tok')
    localStorage.setItem('user', JSON.stringify({ id: 5, email: 'a@a.com', fullName: 'A', role: 'COMPANY', companyId: 1 }))
    await db.outbox.add({
      clientOpId: 'op-pending',
      entity: 'hourLog',
      op: 'create',
      payload: { hours: 3 },
      baseVersion: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      attempts: 0,
      lastError: null,
    })

    renderHook(() => useAuth(), { wrapper: withProvider })
    await emitUnauthorized()

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(await db.outbox.count()).toBe(1)
    expect(sessionStorage.getItem('session_expired')).toBe('true')
    expect(postMessageMock).toHaveBeenCalledWith('LOGOUT', { reason: 'SESSION_EXPIRED' })
    expect(navigateMock).toHaveBeenCalledWith('/login')
  })

  it('handles a second 401 after re-login without page reload', async () => {
    localStorage.setItem('access_token', 'tok')
    localStorage.setItem('user', JSON.stringify({ id: 5, email: 'a@a.com', fullName: 'A', role: 'COMPANY', companyId: 1 }))

    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-new',
      user: { id: 5, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1 },
    })

    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })

    await emitUnauthorized()
    await emitUnauthorized()

    await act(async () => {
      await result.current.login('empresa0@miyura.com', TEST_LOGIN_SECRET)
    })

    await emitUnauthorized()

    expect(postMessageMock).toHaveBeenCalledTimes(2)
    expect(postMessageMock).toHaveBeenNthCalledWith(1, 'LOGOUT', { reason: 'SESSION_EXPIRED' })
    expect(postMessageMock).toHaveBeenNthCalledWith(2, 'LOGOUT', { reason: 'SESSION_EXPIRED' })
    expect(navigateMock).toHaveBeenCalledTimes(2)
  })

  it('cleans Dexie/outbox when explicit logout is received from another tab', async () => {
    localStorage.setItem('access_token', 'tok')
    localStorage.setItem('user', JSON.stringify({ id: 5, email: 'a@a.com', fullName: 'A', role: 'COMPANY', companyId: 1 }))
    localStorage.setItem('last_user_id', '5')
    await db.outbox.add({
      clientOpId: 'op-remote-explicit',
      entity: 'hourLog',
      op: 'create',
      payload: { hours: 8 },
      baseVersion: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      attempts: 0,
      lastError: null,
    })

    renderHook(() => useAuth(), { wrapper: withProvider })
    await emitRemoteLogout('EXPLICIT_LOGOUT')

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('last_user_id')).toBeNull()
    expect(await db.outbox.count()).toBe(0)
    expect(postMessageMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith('/login')
  })

  it('preserves Dexie/outbox and propagates session_expired when SESSION_EXPIRED is received from another tab', async () => {
    localStorage.setItem('access_token', 'tok')
    localStorage.setItem('user', JSON.stringify({ id: 5, email: 'a@a.com', fullName: 'A', role: 'COMPANY', companyId: 1 }))
    localStorage.setItem('last_user_id', '5')
    await db.outbox.add({
      clientOpId: 'op-remote-expired',
      entity: 'hourLog',
      op: 'create',
      payload: { hours: 10 },
      baseVersion: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      attempts: 0,
      lastError: null,
    })

    renderHook(() => useAuth(), { wrapper: withProvider })
    await emitRemoteLogout('SESSION_EXPIRED')

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('last_user_id')).toBe('5')
    expect(await db.outbox.count()).toBe(1)
    expect(sessionStorage.getItem('session_expired')).toBe('true')
    expect(postMessageMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith('/login')
  })

  it('registers and unregisters unauthorized and cross-tab listeners', () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper: withProvider })

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(getCrossTabChannel).toHaveBeenCalledTimes(1)

    unmount()

    expect(unauthorizedListeners.size).toBe(0)
    expect(removeChannelListenerMock).toHaveBeenCalledTimes(1)
  })
})
