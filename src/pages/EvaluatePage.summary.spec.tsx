import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authContext from '@/auth/AuthContext'
import { db } from '@/offline/db'
import { EvaluatePage } from './EvaluatePage'

// REDISEÑO-6: el resumen de la evaluación (horas del practicante, promedio en vivo y escala). El envío y sus errores
// tienen su propia prueba; aquí no se envía nada.

vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

// Radix Select usa APIs que jsdom no trae.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/practicantes/1/evaluar']}>
      <Routes>
        <Route path="/practicantes/:id/evaluar" element={<EvaluatePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function choose(user: ReturnType<typeof userEvent.setup>, criterion: string, score: string) {
  await user.click(await screen.findByRole('combobox', { name: criterion }))
  await user.click(await screen.findByRole('option', { name: score }))
}

describe('EvaluatePage — resumen del practicante', () => {
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
    await db.placements.put({
      id: 1,
      studentId: 10,
      tutorId: 2,
      companyId: 1,
      startDate: '2026-03-01',
      endDate: '2026-06-01',
      requiredHours: 200,
      status: 'ACTIVE',
      version: 1,
      updatedAt: '2026-03-01T00:00:00.000Z',
    })
    await db.hourLogs.put({
      id: 1,
      placementId: 1,
      date: '2026-03-02',
      startTime: '08:00',
      endTime: '12:00',
      hours: 50,
      activity: 'Actividad',
      status: 'APPROVED',
      version: 1,
      updatedAt: '2026-03-02T00:00:00.000Z',
      syncState: 'synced',
    })
  })

  it('muestra las horas aprobadas del practicante y el periodo', async () => {
    renderPage()

    expect(await screen.findByText('50.0 / 200')).toBeInTheDocument()
    expect(screen.getByText(/periodo 2026-1/)).toBeInTheDocument()
  })

  it('el promedio se calcula con los puntajes que ya se eligieron', async () => {
    const user = userEvent.setup()
    renderPage()
    const summary = (await screen.findByRole('heading', { name: 'Resumen del practicante' })).closest('div')!.parentElement!

    expect(within(summary).getByText('—')).toBeInTheDocument()

    await choose(user, 'Desempeño técnico', '5')
    expect(within(summary).getByText('5.0')).toBeInTheDocument()

    await choose(user, 'Comunicación', '4')
    expect(within(summary).getByText('4.5')).toBeInTheDocument()
  })

  it('explica la escala de 1 a 5 sin cambiar las opciones del desplegable', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Excelente')).toBeInTheDocument()
    expect(screen.getByText('Insuficiente')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Puntualidad' }))
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['1', '2', '3', '4', '5'])
  })
})
