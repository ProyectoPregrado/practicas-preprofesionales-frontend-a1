import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import * as authContext from '@/auth/AuthContext'
import * as notify from '@/lib/notify'
import { db, type LocalDocument, type LocalHourLog } from '@/offline/db'
import { DocumentsPage } from './DocumentsPage'
import { HourLogsPage } from './HourLogsPage'
import { MyPlacementPage } from './MyPlacementPage'
import { ReviewHoursPage } from './ReviewHoursPage'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, api: vi.fn() }
})
vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})
// UX-4: aprobar pide confirmación con un aviso; aquí se acepta para llegar a la llamada a la API.
vi.mock('@/lib/notify')
vi.mock('@/offline/sync/scheduler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/offline/sync/scheduler')>()
  return { ...actual, syncNow: vi.fn().mockResolvedValue(undefined) }
})

let nextId = 0
const hourLog = (status: LocalHourLog['status'], date: string): LocalHourLog => ({
  id: ++nextId,
  placementId: 1,
  date,
  startTime: '08:00',
  endTime: '12:00',
  hours: 4,
  activity: `Actividad ${status}`,
  status,
  version: 1,
  updatedAt: '2026-04-01T00:00:00.000Z',
  syncState: 'synced',
})
const document = (kind: string, status: string): LocalDocument => ({
  id: ++nextId,
  placementId: 1,
  kind,
  filename: `${kind}.pdf`,
  status,
  version: 1,
  updatedAt: '2026-03-02T00:00:00.000Z',
})

const student = { id: 10, email: 'e@miyura.com', fullName: 'Estudiante 0', role: 'STUDENT' as const, companyId: null }
const tutor = { id: 2, email: 't@miyura.com', fullName: 'Tutor 0', role: 'TUTOR' as const, companyId: null }

function signIn(user: typeof student | typeof tutor) {
  vi.mocked(authContext.useAuth).mockReturnValue({ user, role: user.role, login: vi.fn(), logout: vi.fn() })
}

async function seed({ logs = [] as LocalHourLog[], documents = [] as LocalDocument[] } = {}) {
  await db.placements.put({
    id: 1,
    studentId: 10,
    tutorId: 2,
    companyId: 7,
    startDate: '2026-03-01',
    endDate: '2026-07-31',
    requiredHours: 240,
    status: 'ACTIVE',
    version: 1,
    updatedAt: new Date().toISOString(),
  })
  await db.hourLogs.bulkPut(logs)
  await db.documents.bulkPut(documents)
}

const inRouter = (ui: React.ReactElement, path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/practicantes/:id/horas" element={ui} />
      </Routes>
    </MemoryRouter>,
  )

const allLogs = () => [
  hourLog('APPROVED', '2026-03-10'),
  hourLog('SUBMITTED', '2026-03-11'),
  hourLog('REJECTED', '2026-03-12'),
]
const allDocuments = () => [document('AGREEMENT', 'VALIDATED'), document('INSURANCE', 'PENDING'), document('REPORT', 'REJECTED')]

// REDISEÑO-5: los estados de horas y documentos se leen en español. Solo cambia lo que se pinta: los valores
// que la aplicación guarda y envía a la API siguen siendo los del backend.
describe('estados de horas y documentos en español', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    nextId = 0
    await db.placements.clear()
    await db.hourLogs.clear()
    await db.documents.clear()
  })

  it('libro de horas: cada registro muestra su estado traducido y ninguno el valor del backend', async () => {
    signIn(student)
    await seed({ logs: allLogs() })
    inRouter(<HourLogsPage />)

    await screen.findByText('Actividad APPROVED')
    expect(screen.getAllByText('Aprobada').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('En revisión').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Rechazada').length).toBeGreaterThanOrEqual(1)
    for (const raw of ['APPROVED', 'SUBMITTED', 'REJECTED']) expect(screen.queryByText(raw)).toBeNull()
  })

  it('inicio: los últimos registros y los documentos pendientes también', async () => {
    signIn(student)
    await seed({ logs: allLogs(), documents: [document('REPORT', 'PENDING')] })
    inRouter(<MyPlacementPage />)

    await screen.findByText('REPORT.pdf')
    await waitFor(() => expect(screen.getAllByText('En revisión').length).toBeGreaterThanOrEqual(1))
    expect(screen.getAllByText('Aprobada').length).toBeGreaterThanOrEqual(1)
    for (const raw of ['APPROVED', 'SUBMITTED', 'REJECTED', 'PENDING']) expect(screen.queryByText(raw)).toBeNull()
  })

  it('documentos: la lista y los requisitos obligatorios muestran el estado traducido', async () => {
    signIn(student)
    await seed({ documents: allDocuments() })
    inRouter(<DocumentsPage />)

    await screen.findByText('REPORT.pdf')
    expect(screen.getAllByText('Validado').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('En revisión').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Rechazado')).toBeInTheDocument()
    for (const raw of ['VALIDATED', 'PENDING', 'REJECTED']) expect(screen.queryByText(raw)).toBeNull()
  })

  it('revisión del tutor: el registro enviado se lee «En revisión»', async () => {
    signIn(tutor)
    await seed({ logs: [hourLog('SUBMITTED', '2026-03-11')] })
    inRouter(<ReviewHoursPage />, '/practicantes/1/horas')

    await screen.findByText('Actividad SUBMITTED')
    expect(screen.getByText('En revisión')).toBeInTheDocument()
    expect(screen.queryByText('SUBMITTED')).toBeNull()
  })

  it('a la API se sigue enviando el valor del backend, no la traducción', async () => {
    const user = userEvent.setup()
    signIn(tutor)
    vi.mocked(api).mockResolvedValue({} as never)
    vi.mocked(notify.confirmar).mockResolvedValue(true)
    await seed({ logs: [hourLog('SUBMITTED', '2026-03-11')] })
    inRouter(<ReviewHoursPage />, '/practicantes/1/horas')

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
    const [path, options] = vi.mocked(api).mock.calls[0]
    expect(path).toBe('/hour-logs/1/review')
    expect(JSON.parse(String(options?.body))).toMatchObject({ status: 'APPROVED' })
  })
})
