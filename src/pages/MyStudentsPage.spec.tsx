import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authContext from '@/auth/AuthContext'
import { db } from '@/offline/db'
import { MyStudentsPage } from './MyStudentsPage'

vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

async function seedPlacements(count: number) {
  await db.placements.bulkPut(
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      studentId: 100 + i,
      tutorId: 2,
      companyId: 1,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
      requiredHours: 200,
      status: 'ACTIVE',
      version: 1,
      updatedAt: new Date().toISOString(),
    })),
  )
}

const studentLabels = () => screen.queryAllByText(/^Estudiante #\d+$/).map((el) => el.textContent)

function renderPage() {
  return render(
    <MemoryRouter>
      <MyStudentsPage />
    </MemoryRouter>,
  )
}

describe('MyStudentsPage — paginación (6 por página)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.placements.clear()
    await db.hourLogs.clear()
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 2, email: 'tutor0@miyura.com', fullName: 'Tutor 0', role: 'TUTOR', companyId: null },
      role: 'TUTOR',
      login: vi.fn(),
      logout: vi.fn(),
    })
  })

  it('muestra como máximo 6 estudiantes por página y navega entre páginas', async () => {
    await seedPlacements(14)
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(studentLabels()).toHaveLength(6))
    expect(screen.getByText('Página 1 de 3')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(studentLabels()).toHaveLength(6)
    expect(screen.getByText('Página 2 de 3')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(studentLabels()).toHaveLength(2)
    expect(screen.getByText('Página 3 de 3')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByText('Página 2 de 3')).toBeTruthy()
  })

  it('con 6 o menos estudiantes no muestra paginación', async () => {
    await seedPlacements(6)
    renderPage()

    await waitFor(() => expect(studentLabels()).toHaveLength(6))
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
  })

  it('los totales de arriba cuentan a todos, no solo a la página visible', async () => {
    await seedPlacements(14)
    renderPage()

    await waitFor(() => expect(studentLabels()).toHaveLength(6))
    expect(screen.getAllByText('14').length).toBeGreaterThan(0)
  })
})
