import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as accreditationApi from '@/api/accreditation'
import * as authContext from '@/auth/AuthContext'
import { db, type LocalHourLog } from '@/offline/db'
import { AccreditationPage } from './AccreditationPage'
import { HourLogsPage } from './HourLogsPage'
import { MyStudentsPage } from './MyStudentsPage'
import { ReviewHoursPage } from './ReviewHoursPage'

// EXP-1: cada botón descarga lo que muestra su pantalla. Se intercepta el Blob para leer el CSV generado.

vi.mock('@/api/accreditation')
vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

let downloaded: { blob: Blob; filename: string } | null = null

beforeAll(() => {
  URL.createObjectURL = vi.fn((blob: Blob) => {
    downloaded = { blob, filename: '' }
    return 'blob:csv'
  })
  URL.revokeObjectURL = vi.fn()
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    if (downloaded) downloaded.filename = this.download
  }
})

// jsdom no trae Blob.text(); FileReader sí.
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

async function downloadedCsv(): Promise<{ text: string; filename: string }> {
  await waitFor(() => expect(downloaded).not.toBeNull())
  return { text: await readBlob(downloaded!.blob), filename: downloaded!.filename }
}

function log(id: number, status: LocalHourLog['status']): LocalHourLog {
  return {
    id, placementId: 1, date: `2026-03-0${id}`, startTime: '08:00', endTime: '12:00', hours: 4, activity: `Tarea ${id}`,
    status, version: 1, updatedAt: '2026-03-01T00:00:00.000Z', syncState: 'synced',
  }
}

beforeEach(async () => {
  downloaded = null
  localStorage.clear()
  vi.clearAllMocks()
  await db.placements.clear()
  await db.hourLogs.clear()
  vi.mocked(authContext.useAuth).mockReturnValue({
    user: { id: 2, email: 'tutor0@miyura.com', fullName: 'Tutor 0', role: 'TUTOR', companyId: null },
    role: 'TUTOR',
    login: vi.fn(),
    logout: vi.fn(),
  })
  await db.placements.put({
    id: 1, studentId: 22, tutorId: 2, companyId: 7, startDate: '2026-03-01', endDate: '2026-07-31',
    requiredHours: 240, status: 'ACTIVE', version: 1, updatedAt: '2026-03-01T00:00:00.000Z',
  })
  await db.hourLogs.bulkPut([log(1, 'APPROVED'), log(2, 'SUBMITTED'), log(3, 'REJECTED')])
})

describe('exportar a CSV', () => {
  it('Mis practicantes exporta la cola con su avance', async () => {
    render(
      <MemoryRouter>
        <MyStudentsPage />
      </MemoryRouter>,
    )

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Exportar CSV' }))

    const { text, filename } = await downloadedCsv()
    expect(filename).toMatch(/^mis-practicantes-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(text).toContain('Estudiante #22,Empresa #7,4,240,2,4,1,2026-03-03')
  })

  it('las horas del practicante exportan solo lo que deja ver el filtro, de la más antigua a la más reciente', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/practicantes/1/horas']}>
        <Routes>
          <Route path="/practicantes/:id/horas" element={<ReviewHoursPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('Tarea 1')

    await user.click(screen.getByRole('button', { name: 'Sin revisar · 1' }))
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }))

    const { text, filename } = await downloadedCsv()
    expect(filename).toMatch(/^horas-estudiante-22-/)
    expect(text).toContain('2026-03-02,08:00,12:00,4,Tarea 2,En revisión,')
    expect(text).not.toContain('Tarea 1')
    expect(text).not.toContain('Tarea 3')
  })

  it('el acta de acreditación se exporta con el periodo elegido', async () => {
    vi.mocked(accreditationApi.reportForPeriod).mockResolvedValue([
      { placementId: 1, studentName: 'Ana Pérez', level: 'ACREDITADO', reasons: [], completionPercentage: 100 },
    ])
    render(
      <MemoryRouter>
        <AccreditationPage />
      </MemoryRouter>,
    )
    await screen.findByText('Ana Pérez')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Exportar acta' }))

    const { text, filename } = await downloadedCsv()
    expect(filename).toMatch(/^acta-acreditacion-2026-1-/)
    expect(text).toContain('2026-1,Ana Pérez,Acreditado,100,')
  })

  it('sin filas que exportar el botón está desactivado', async () => {
    vi.mocked(accreditationApi.reportForPeriod).mockResolvedValue([])
    render(
      <MemoryRouter>
        <AccreditationPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(accreditationApi.reportForPeriod).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Exportar acta' })).toBeDisabled()
  })

  it('el estudiante exporta su libro de horas con los filtros aplicados', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 22, email: 'estudiante0@miyura.com', fullName: 'Estudiante 0', role: 'STUDENT', companyId: null },
      role: 'STUDENT',
      login: vi.fn(),
      logout: vi.fn(),
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <HourLogsPage />
      </MemoryRouter>,
    )
    await screen.findByText('Tarea 1')

    await user.click(screen.getByRole('button', { name: /^Aprobadas/ }))
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }))

    const { text, filename } = await downloadedCsv()
    expect(filename).toMatch(/^libro-de-horas-/)
    expect(text).toContain('Tarea 1,Aprobada')
    expect(text).not.toContain('Tarea 2')
  })
})
