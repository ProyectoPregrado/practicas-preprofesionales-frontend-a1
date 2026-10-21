import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authContext from '@/auth/AuthContext'
import { db, type LocalPlacement } from '@/offline/db'
import { usePlacement } from './usePlacement'

vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

describe('usePlacement', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('retorna null si no hay usuario autenticado', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: null,
      role: null,
      login: vi.fn(),
      logout: vi.fn(),
    })

    const { result } = renderHook(() => usePlacement())

    await waitFor(() => {
      expect(result.current).toBeNull()
    })
  })

  it('retorna null si el rol no es STUDENT aunque existan placements', async () => {
    await db.placements.put({
      id: 1,
      studentId: 10,
      tutorId: 2,
      companyId: 3,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
      requiredHours: 240,
      status: 'ACTIVE',
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 10, email: 'tutor@miyura.com', fullName: 'Tutor Docente', role: 'TUTOR', companyId: null },
      role: 'TUTOR',
      login: vi.fn(),
      logout: vi.fn(),
    })

    const { result } = renderHook(() => usePlacement())

    await waitFor(() => {
      expect(result.current).toBeNull()
    })
  })

  it('retorna el placement del estudiante cuando existe en Dexie', async () => {
    const studentPlacement: LocalPlacement = {
      id: 77,
      studentId: 42,
      tutorId: 2,
      companyId: 5,
      startDate: '2026-02-01',
      endDate: '2026-07-01',
      requiredHours: 320,
      status: 'ACTIVE',
      version: 1,
      updatedAt: '2026-02-01T00:00:00.000Z',
    }

    await db.placements.put(studentPlacement)

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 42, email: 'estudiante42@miyura.com', fullName: 'Estudiante 42', role: 'STUDENT', companyId: null },
      role: 'STUDENT',
      login: vi.fn(),
      logout: vi.fn(),
    })

    const { result } = renderHook(() => usePlacement())

    await waitFor(() => {
      expect(result.current).toEqual(studentPlacement)
    })
  })

  it('retorna null si el estudiante no tiene ningún placement registrado', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 99, email: 'estudiante99@miyura.com', fullName: 'Estudiante 99', role: 'STUDENT', companyId: null },
      role: 'STUDENT',
      login: vi.fn(),
      logout: vi.fn(),
    })

    const { result } = renderHook(() => usePlacement())

    await waitFor(() => {
      expect(result.current).toBeNull()
    })
  })

  it('no devuelve un placement que pertenece a otro estudiante', async () => {
    await db.placements.put({
      id: 12,
      studentId: 88, // Pertenece a estudiante 88
      tutorId: 3,
      companyId: 4,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
      requiredHours: 240,
      status: 'ACTIVE',
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 50, email: 'estudiante50@miyura.com', fullName: 'Estudiante 50', role: 'STUDENT', companyId: null },
      role: 'STUDENT',
      login: vi.fn(),
      logout: vi.fn(),
    })

    const { result } = renderHook(() => usePlacement())

    await waitFor(() => {
      expect(result.current).toBeNull()
    })
  })

  it('reacciona en vivo cuando el placement del estudiante se inserta o actualiza en Dexie', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 25, email: 'estudiante25@miyura.com', fullName: 'Estudiante 25', role: 'STUDENT', companyId: null },
      role: 'STUDENT',
      login: vi.fn(),
      logout: vi.fn(),
    })

    const { result } = renderHook(() => usePlacement())

    await waitFor(() => {
      expect(result.current).toBeNull()
    })

    // Se asigna y sincroniza el placement en la base local
    await act(async () => {
      await db.placements.put({
        id: 300,
        studentId: 25,
        tutorId: 4,
        companyId: 1,
        startDate: '2026-03-01',
        endDate: '2026-08-01',
        requiredHours: 240,
        status: 'ACTIVE',
        version: 1,
        updatedAt: '2026-03-01T00:00:00.000Z',
      })
    })

    await waitFor(() => {
      expect(result.current?.id).toBe(300)
      expect(result.current?.requiredHours).toBe(240)
    })

    // Se actualizan las horas requeridas
    await act(async () => {
      await db.placements.update(300, { requiredHours: 300 })
    })

    await waitFor(() => {
      expect(result.current?.requiredHours).toBe(300)
    })
  })
})
