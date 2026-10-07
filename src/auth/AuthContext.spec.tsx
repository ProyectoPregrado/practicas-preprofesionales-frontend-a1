import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { db } from '@/offline/db'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, api: vi.fn() }
})

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

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
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
      await result.current.login('empresa0@miyura.com', 'yura1234')
    })

    expect(api).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'empresa0@miyura.com', password: 'yura1234' }),
    })
    expect(localStorage.getItem('access_token')).toBe('tok-123')
    expect(result.current.user?.companyId).toBe(1)
    expect(result.current.role).toBe('COMPANY')
  })

  it('logout clears storage and the context', async () => {
    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-123',
      user: { id: 5, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1 },
    })
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    await act(async () => {
      await result.current.login('empresa0@miyura.com', 'yura1234')
    })

    await act(async () => {
      await result.current.logout()
    })

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it('logout wipes local Dexie data, including the sync checkpoint, so the next session starts clean', async () => {
    await db.placements.put({
      id: 1,
      studentId: 99,
      tutorId: 1,
      companyId: 1,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
      requiredHours: 200,
      status: 'ACTIVE',
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await db.meta.put({ key: 'syncCheckpoint', value: '2026-01-01T00:00:00.000Z' })

    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-123',
      user: { id: 5, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1 },
    })
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    await act(async () => {
      await result.current.login('empresa0@miyura.com', 'yura1234')
    })

    await act(async () => {
      await result.current.logout()
    })

    expect(await db.placements.count()).toBe(0)
    expect(await db.meta.count()).toBe(0)
  })

  it('logout broadcasts LOGOUT message to crossTabChannel', async () => {
    const { getCrossTabChannel } = await import('@/offline/sync/crossTab')
    const channel = getCrossTabChannel()
    const postMessageSpy = vi.spyOn(channel, 'postMessage')

    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-123',
      user: { id: 5, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1 },
    })
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    
    await act(async () => {
      await result.current.login('empresa0@miyura.com', 'yura1234')
    })
    
    await act(async () => {
      await result.current.logout()
    })

    expect(postMessageSpy).toHaveBeenCalledWith('LOGOUT')
  })

  it('logs out automatically when receiving LOGOUT message from crossTabChannel', async () => {
    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-123',
      user: { id: 5, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1 },
    })
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    await act(async () => {
      await result.current.login('empresa0@miyura.com', 'yura1234')
    })

    const { CrossTabChannel } = await import('@/offline/sync/crossTab')
    
    await act(async () => {
      const otherTabChannel = new CrossTabChannel('offline_sync_channel', 'other-tab')
      otherTabChannel.postMessage('LOGOUT')
      otherTabChannel.close()
    })

    await act(async () => {
      expect(result.current.user).toBeNull()
    })
  })

  it('clears storage and user state when 401 unauthorized occurs WITHOUT wiping unsynced Dexie outbox hours', async () => {
    // Inserta 10 horas encoladas en outbox (trabajo offline pendiente)
    for (let i = 1; i <= 10; i++) {
      await db.outbox.put({
        clientOpId: `op-${i}`,
        entity: 'hourLog',
        op: 'create',
        baseVersion: null,
        lastError: null,
        payload: { placementId: 1, date: '2026-01-01', hours: 2, activity: 'Offline work' },
        createdAt: new Date().toISOString(),
        attempts: 0,
      })
    }
    expect(await db.outbox.count()).toBe(10)

    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-123',
      user: { id: 5, email: 'estudiante@miyura.com', fullName: 'Estudiante 5', role: 'STUDENT', companyId: null },
    })
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    await act(async () => {
      await result.current.login('estudiante@miyura.com', 'yura1234')
    })
    expect(result.current.user).not.toBeNull()

    // Simula disparo de expiración 401
    await act(async () => {
      // Invocar listeners de onUnauthorized registrados
      const actualClient = await vi.importActual<typeof import('@/api/client')>('@/api/client')
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ statusCode: 401, message: 'jwt expired' }),
      })
      vi.stubGlobal('fetch', fetchMock)
      try {
        await actualClient.api('/offers')
      } catch {
        // Expected 401
      }
    })

    // La sesión queda vacía pero las 10 horas en outbox PERMANECEN intactas en Dexie
    await vi.waitFor(() => {
      expect(result.current.user).toBeNull()
      expect(localStorage.getItem('access_token')).toBeNull()
    })
    expect(await db.outbox.count()).toBe(10)
  })

  it('wipes Dexie data if a DIFFERENT user logs in on a shared machine after 401', async () => {
    // Inserta datos del usuario 5
    await db.outbox.put({
      clientOpId: 'op-user5',
      entity: 'hourLog',
      op: 'create',
      baseVersion: null,
      lastError: null,
      payload: { placementId: 1, date: '2026-01-01', hours: 4, activity: 'Student 5 work' },
      createdAt: new Date().toISOString(),
      attempts: 0,
    })

    // Simula sesión previa de Usuario 5
    localStorage.setItem('last_user_id', '5')

    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-999',
      user: { id: 99, email: 'otro@miyura.com', fullName: 'Usuario 99', role: 'STUDENT', companyId: null },
    })
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })

    // Usuario 99 inicia sesión (usuario distinto al 5)
    await act(async () => {
      await result.current.login('otro@miyura.com', 'pass1234')
    })

    // Dexie debe haber sido limpiado para proteger el aislamiento (caso C-2)
    expect(await db.outbox.count()).toBe(0)
    expect(localStorage.getItem('last_user_id')).toBe('99')
  })

  it('preserves Dexie data if the SAME user logs back in after 401', async () => {
    await db.outbox.put({
      clientOpId: 'op-sameuser',
      entity: 'hourLog',
      op: 'create',
      baseVersion: null,
      lastError: null,
      payload: { placementId: 1, date: '2026-01-01', hours: 4, activity: 'Same student work' },
      createdAt: new Date().toISOString(),
      attempts: 0,
    })

    localStorage.setItem('last_user_id', '5')

    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-555',
      user: { id: 5, email: 'estudiante@miyura.com', fullName: 'Estudiante 5', role: 'STUDENT', companyId: null },
    })
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })

    // El mismo Usuario 5 vuelve a iniciar sesión
    await act(async () => {
      await result.current.login('estudiante@miyura.com', 'yura1234')
    })

    // Dexie conserva las horas pendientes para continuar el sync
    expect(await db.outbox.count()).toBe(1)
    expect(result.current.user?.id).toBe(5)
  })

  it('handles a second 401 after logging in again without reloading the page', async () => {
    vi.mocked(api).mockResolvedValue({
      accessToken: 'tok-1',
      user: { id: 5, email: 'estudiante@miyura.com', fullName: 'Estudiante 5', role: 'STUDENT', companyId: null },
    })
    const { result } = renderHook(() => useAuth(), { wrapper: withProvider })
    const actualClient = await vi.importActual<typeof import('@/api/client')>('@/api/client')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'jwt expired' }) }),
    )

    try {
      // Dos vencimientos seguidos en la misma carga de página: ambos deben cerrar la sesión.
      for (let expiry = 1; expiry <= 2; expiry++) {
        await act(async () => {
          await result.current.login('estudiante@miyura.com', 'yura1234')
        })
        expect(localStorage.getItem('access_token')).toBe('tok-1')

        await act(async () => {
          await actualClient.api('/offers').catch(() => undefined)
        })

        await vi.waitFor(() => {
          expect(localStorage.getItem('access_token')).toBeNull()
          expect(result.current.user).toBeNull()
        })
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
