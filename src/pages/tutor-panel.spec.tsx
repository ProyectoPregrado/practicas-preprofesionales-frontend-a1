import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authContext from '@/auth/AuthContext'
import { db, type LocalHourLog } from '@/offline/db'
import { MyStudentsPage } from './MyStudentsPage'
import { ReviewHoursPage } from './ReviewHoursPage'

// REDISEÑO-6: las pantallas del tutor como panel. Estas pruebas cubren lo nuevo (orden de la cola, panel principal,
// indicadores y filtros); la paginación y los permisos siguen en MyStudentsPage.spec y ReviewHoursPage.spec.

vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

function placement(id: number) {
  return {
    id,
    studentId: 100 + id,
    tutorId: 2,
    companyId: 1,
    startDate: '2026-01-01',
    endDate: '2026-06-01',
    requiredHours: 100,
    status: 'ACTIVE',
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

let nextLogId = 1
function log(placementId: number, status: LocalHourLog['status'], hours: number, activity = 'Actividad'): LocalHourLog {
  const id = nextLogId++
  return {
    id,
    placementId,
    date: `2026-03-${String((id % 28) + 1).padStart(2, '0')}`,
    startTime: '08:00',
    endTime: '12:00',
    hours,
    activity,
    status,
    version: 1,
    updatedAt: '2026-03-01T00:00:00.000Z',
    syncState: 'synced',
  }
}

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

describe('Mis practicantes como panel', () => {
  function renderList() {
    return render(
      <MemoryRouter>
        <MyStudentsPage />
      </MemoryRouter>,
    )
  }

  it('ordena la cola: primero quien más horas tiene esperando, luego el más atrasado', async () => {
    await db.placements.bulkPut([placement(1), placement(2), placement(3)])
    await db.hourLogs.bulkPut([log(1, 'APPROVED', 60), log(2, 'SUBMITTED', 2), log(3, 'SUBMITTED', 8)])
    renderList()

    await waitFor(() => expect(screen.getAllByText(/^Estudiante #\d+$/)).toHaveLength(3))
    expect(screen.getAllByText(/^Estudiante #\d+$/).map((el) => el.textContent)).toEqual([
      'Estudiante #103',
      'Estudiante #102',
      'Estudiante #101',
    ])
  })

  it('el panel dice cuántas horas esperan y lleva al primero de la cola', async () => {
    await db.placements.bulkPut([placement(1), placement(2)])
    await db.hourLogs.bulkPut([log(1, 'SUBMITTED', 2.5), log(2, 'SUBMITTED', 4), log(2, 'SUBMITTED', 1)])
    renderList()

    expect(await screen.findByRole('heading', { name: /Tienes 7.5 horas por revisar de 2 practicantes/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Revisar al primero de la cola' }).getAttribute('href')).toBe(
      '/practicantes/2/horas',
    )
  })

  it('sin nada que revisar dice que está al día y no ofrece revisar al primero', async () => {
    await db.placements.bulkPut([placement(1)])
    await db.hourLogs.bulkPut([log(1, 'APPROVED', 10)])
    renderList()

    expect(await screen.findByRole('heading', { name: /Estás al día/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Revisar al primero de la cola' })).toBeNull()
  })

  it('cada fila ofrece revisar y evaluar a ese practicante', async () => {
    await db.placements.bulkPut([placement(4)])
    renderList()

    expect((await screen.findByRole('link', { name: 'Evaluar' })).getAttribute('href')).toBe('/practicantes/4/evaluar')
    expect(screen.getByRole('link', { name: 'Revisar' }).getAttribute('href')).toBe('/practicantes/4/horas')
  })

  it('marca a quien tiene registros devueltos sin corregir', async () => {
    await db.placements.bulkPut([placement(1)])
    await db.hourLogs.bulkPut([log(1, 'REJECTED', 3)])
    renderList()

    expect(await screen.findByText('1 devuelto')).toBeTruthy()
  })
})

describe('Horas del practicante: indicadores y filtros', () => {
  function renderReview() {
    return render(
      <MemoryRouter initialEntries={['/practicantes/1/horas']}>
        <Routes>
          <Route path="/practicantes/:id/horas" element={<ReviewHoursPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  async function seed() {
    await db.placements.put(placement(1))
    await db.hourLogs.bulkPut([
      log(1, 'SUBMITTED', 4, 'Pendiente A'),
      log(1, 'SUBMITTED', 1, 'Pendiente B'),
      log(1, 'APPROVED', 6, 'Aprobado A'),
      log(1, 'REJECTED', 3, 'Devuelto A'),
    ])
  }

  it('los indicadores cuentan horas aprobadas, sin revisar y registros devueltos', async () => {
    await seed()
    renderReview()

    const kpis = await screen.findByRole('list', { name: 'Indicadores' })
    expect(within(kpis).getByText('6.0')).toBeTruthy()
    expect(within(kpis).getByText('5.0')).toBeTruthy()
    expect(within(kpis).getByText('2 registros esperan tu decisión')).toBeTruthy()
    expect(within(kpis).getByText('Esperan la corrección del estudiante')).toBeTruthy()
  })

  it('filtra el libro por estado y muestra cuántos hay de cada uno', async () => {
    const user = userEvent.setup()
    await seed()
    renderReview()
    await screen.findByText('Aprobado A')

    await user.click(screen.getByRole('button', { name: 'Sin revisar · 2' }))
    expect(screen.getByText('Pendiente A')).toBeTruthy()
    expect(screen.getByText('Pendiente B')).toBeTruthy()
    expect(screen.queryByText('Aprobado A')).toBeNull()
    expect(screen.queryByText('Devuelto A')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Devueltos · 1' }))
    expect(screen.getByText('Devuelto A')).toBeTruthy()
    expect(screen.queryByText('Pendiente A')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Todos · 4' }))
    expect(screen.getByText('Aprobado A')).toBeTruthy()
  })

  it('un filtro sin resultados no dice que no hay nada que revisar', async () => {
    const user = userEvent.setup()
    await db.placements.put(placement(1))
    await db.hourLogs.bulkPut([log(1, 'SUBMITTED', 4, 'Pendiente A')])
    renderReview()
    await screen.findByText('Pendiente A')

    await user.click(screen.getByRole('button', { name: 'Aprobados · 0' }))
    expect(screen.getByText('Ningún registro con este estado')).toBeTruthy()
    expect(screen.queryByText('No tienes horas pendientes de revisar')).toBeNull()
  })
})
