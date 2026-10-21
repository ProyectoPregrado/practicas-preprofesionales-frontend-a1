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

// REDISEÑO-5: la tabla ya no pagina de 6 en 6 fijo: la persona elige de 5 a 30 filas (10 por defecto) y se le recuerda.
describe('MyStudentsPage — paginación (filas por página)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    await db.placements.clear()
    await db.hourLogs.clear()
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 2, email: 'tutor0@miyura.com', fullName: 'Tutor 0', role: 'TUTOR', companyId: null },
      role: 'TUTOR',
      login: vi.fn(),
      logout: vi.fn(),
    })
  })

  it('por defecto muestra 10 estudiantes por página y navega entre páginas', async () => {
    await seedPlacements(14)
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(studentLabels()).toHaveLength(10))
    expect(screen.getByText('Página 1 de 2')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(studentLabels()).toHaveLength(4)
    expect(screen.getByText('Página 2 de 2')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByText('Página 1 de 2')).toBeTruthy()
  })

  it('al elegir 5 filas por página muestra 5 y recalcula las páginas', async () => {
    await seedPlacements(14)
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(studentLabels()).toHaveLength(10))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filas por página' }), '5')

    expect(studentLabels()).toHaveLength(5)
    expect(screen.getByText('Página 1 de 3')).toBeTruthy()
  })

  it('recuerda la elección de este tutor al volver a abrir la pantalla', async () => {
    await seedPlacements(14)
    localStorage.setItem('pageSize:2', '5')
    renderPage()

    await waitFor(() => expect(studentLabels()).toHaveLength(5))
  })

  it('con 5 o menos estudiantes no hay paginación ni selector', async () => {
    await seedPlacements(5)
    renderPage()

    await waitFor(() => expect(studentLabels()).toHaveLength(5))
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Filas por página' })).toBeNull()
  })

  it('con 6 a 10 estudiantes entran todos en una página, pero se puede bajar a 5', async () => {
    await seedPlacements(8)
    renderPage()

    await waitFor(() => expect(studentLabels()).toHaveLength(8))
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Filas por página' })).toBeInTheDocument()
  })

  it('los totales de arriba cuentan a todos, no solo a la página visible', async () => {
    await seedPlacements(14)
    renderPage()

    await waitFor(() => expect(studentLabels()).toHaveLength(10))
    expect(screen.getAllByText('14').length).toBeGreaterThan(0)
  })
})
