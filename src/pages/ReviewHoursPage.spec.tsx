import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '@/api/client'
import * as authContext from '@/auth/AuthContext'
import { db } from '@/offline/db'
import { ReviewHoursPage } from './ReviewHoursPage'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, api: vi.fn() }
})

vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return {
    ...actual,
    useAuth: vi.fn(),
  }
})

function renderPage(placementId = 1) {
  return render(
    <MemoryRouter initialEntries={[`/practicantes/${placementId}/horas`]}>
      <Routes>
        <Route path="/practicantes/:id/horas" element={<ReviewHoursPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ReviewHoursPage (F-1)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.placements.clear()
    await db.hourLogs.clear()
  })

  it('muestra estado "Práctica no asignada" si la práctica en Dexie pertenece a otro tutor', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 2, email: 'tutor0@miyura.com', fullName: 'Tutor 0', role: 'TUTOR', companyId: null },
      role: 'TUTOR',
      login: vi.fn(),
      logout: vi.fn(),
    })

    // Práctica con tutorId: 99 (distinto al tutor logueado id: 2)
    await db.placements.put({
      id: 1,
      studentId: 10,
      tutorId: 99,
      companyId: 1,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
      requiredHours: 200,
      status: 'ACTIVE',
      version: 1,
      updatedAt: new Date().toISOString(),
    })

    renderPage(1)

    await waitFor(() => {
      expect(screen.getByText('Práctica no asignada')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Esta práctica está asignada a otro tutor. No tienes permisos para revisar sus horas.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /volver a la lista/i })).toBeInTheDocument()
  })

  it('muestra mensaje claro ante 403 al intentar revisar una hora ajena', async () => {
    const user = userEvent.setup()
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 2, email: 'tutor0@miyura.com', fullName: 'Tutor 0', role: 'TUTOR', companyId: null },
      role: 'TUTOR',
      login: vi.fn(),
      logout: vi.fn(),
    })

    await db.placements.put({
      id: 1,
      studentId: 10,
      tutorId: 2,
      companyId: 1,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
      requiredHours: 200,
      status: 'ACTIVE',
      version: 1,
      updatedAt: new Date().toISOString(),
    })

    await db.hourLogs.put({
      id: 36,
      placementId: 1,
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      activity: 'Desarrollo en backend',
      status: 'SUBMITTED',
      syncState: 'synced',
      version: 1,
      updatedAt: new Date().toISOString(),
    })

    // Servidor responde 403
    vi.mocked(api).mockRejectedValue(new ApiError(403, 'no eres el tutor asignado a esta práctica'))

    renderPage(1)

    await waitFor(() => {
      expect(screen.getByText('Desarrollo en backend')).toBeInTheDocument()
    })

    const approveButton = screen.getByRole('button', { name: /aprobar/i })
    await user.click(approveButton)

    await waitFor(() => {
      expect(
        screen.getByText('No tienes permiso para revisar este registro porque no eres el tutor asignado a esta práctica.'),
      ).toBeInTheDocument()
    })
  })
})
