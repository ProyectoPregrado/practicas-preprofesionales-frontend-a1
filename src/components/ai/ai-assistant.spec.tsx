import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as aiApi from '@/api/ai'
import { api } from '@/api/client'
import * as authContext from '@/auth/AuthContext'
import { HourLogForm } from '@/components/HourLogForm'
import * as notify from '@/lib/notify'
import { db, type LocalHourLog } from '@/offline/db'
import { ReviewHoursPage } from '@/pages/ReviewHoursPage'
import { DocumentCheckPanel } from './DocumentCheckPanel'

// IA-1: el asistente de prácticas. La API de IA se simula: aquí se prueba qué hace la interfaz con cada respuesta.

vi.mock('@/api/ai')
vi.mock('@/lib/notify')
vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, api: vi.fn() }
})
vi.mock('@/offline/sync/scheduler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/offline/sync/scheduler')>()
  return { ...actual, syncNow: vi.fn().mockResolvedValue(undefined) }
})
vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Cuéntale tu día a la IA (estudiante)', () => {
  const draft = {
    date: '2026-03-04',
    startTime: '14:00',
    endTime: '18:00',
    hours: 4,
    activity: 'Configuré el servidor de pruebas y documenté la instalación.',
    followUp: '',
    warnings: [],
    aiUsed: true,
  }

  it('con lo que cuenta la persona llena fecha, horario, horas y actividad, y dice que fue con IA', async () => {
    vi.mocked(aiApi.draftHourLog).mockResolvedValue(draft)
    render(<HourLogForm placementId={1} />)

    fireEvent.change(screen.getByLabelText('Cuéntale tu día a la IA'), { target: { value: 'ayer de 2 a 6 de la tarde el servidor' } })
    fireEvent.click(screen.getByRole('button', { name: 'Completar con IA' }))

    await waitFor(() => expect((screen.getByLabelText('Hora de inicio') as HTMLInputElement).value).toBe('14:00'))
    expect((screen.getByLabelText('Hora de fin') as HTMLInputElement).value).toBe('18:00')
    expect((screen.getByLabelText('Horas') as HTMLInputElement).value).toBe('4')
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('2026-03-04')
    expect((screen.getByLabelText(/Actividad/) as HTMLTextAreaElement).value).toBe(draft.activity)
    expect(screen.getByText('Analizado con IA')).toBeInTheDocument()
    expect(vi.mocked(aiApi.draftHourLog).mock.calls[0][0]).toBe('ayer de 2 a 6 de la tarde el servidor')
  })

  it('si falta algo, muestra la pregunta para completarlo y las advertencias de las reglas', async () => {
    vi.mocked(aiApi.draftHourLog).mockResolvedValue({
      ...draft,
      startTime: '',
      endTime: '',
      followUp: '¿A qué hora empezaste y a qué hora terminaste?',
      warnings: ['La hora de fin debe ser posterior a la de inicio'],
      aiUsed: false,
    })
    render(<HourLogForm placementId={1} />)

    fireEvent.change(screen.getByLabelText('Cuéntale tu día a la IA'), { target: { value: 'hice el informe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Completar con IA' }))

    expect(await screen.findByText('¿A qué hora empezaste y a qué hora terminaste?')).toBeInTheDocument()
    expect(screen.getByText('La hora de fin debe ser posterior a la de inicio')).toBeInTheDocument()
    expect(screen.getByText('Modo básico (sin IA)')).toBeInTheDocument()
  })

  it('sin texto el botón no hace nada', () => {
    render(<HourLogForm placementId={1} />)
    expect(screen.getByRole('button', { name: 'Completar con IA' })).toBeDisabled()
  })

  it('sin conexión no se puede usar y dice que se llene a mano', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<HourLogForm placementId={1} />)
    expect(screen.getByLabelText('Cuéntale tu día a la IA')).toBeDisabled()
    expect(screen.getByText('Sin conexión: llena el formulario a mano; se guarda igual.')).toBeInTheDocument()
  })

  it('si el servidor falla, avisa y deja el formulario para llenarlo a mano', async () => {
    vi.mocked(aiApi.draftHourLog).mockRejectedValue(new TypeError('red'))
    render(<HourLogForm placementId={1} />)

    fireEvent.change(screen.getByLabelText('Cuéntale tu día a la IA'), { target: { value: 'algo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Completar con IA' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar el registro. Llénalo a mano.')
  })
})

describe('Revisión asistida (tutor)', () => {
  const log = (id: number, activity: string, status: LocalHourLog['status'] = 'SUBMITTED'): LocalHourLog => ({
    id,
    placementId: 1,
    date: `2026-03-0${id}`,
    startTime: '08:00',
    endTime: '12:00',
    hours: 4,
    activity,
    status,
    version: 1,
    updatedAt: '2026-03-01T00:00:00.000Z',
    syncState: 'synced',
  })

  beforeEach(async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 2, email: 'tutor0@miyura.com', fullName: 'Tutor 0', role: 'TUTOR', companyId: null },
      role: 'TUTOR',
      login: vi.fn(),
      logout: vi.fn(),
    })
    await db.placements.clear()
    await db.hourLogs.clear()
    await db.placements.put({
      id: 1, studentId: 22, tutorId: 2, companyId: 1, startDate: '2026-03-01', endDate: '2026-07-31',
      requiredHours: 240, status: 'ACTIVE', version: 1, updatedAt: '2026-03-01T00:00:00.000Z',
    })
    await db.hourLogs.bulkPut([
      log(1, 'Configuré el servidor de pruebas'),
      log(2, 'apoyo'),
      log(3, 'Documenté la red de la oficina'),
    ])
    vi.mocked(aiApi.getReviewHints).mockResolvedValue({
      aiUsed: true,
      hints: [
        { logId: 1, level: 'green', reasons: [], suggestedNote: '' },
        { logId: 2, level: 'yellow', reasons: ['La actividad es muy corta para saber qué se hizo.'], suggestedNote: '¿Qué apoyo diste y a qué área?' },
        { logId: 3, level: 'green', reasons: [], suggestedNote: '' },
      ],
    })
    vi.mocked(api).mockResolvedValue({} as never)
    vi.mocked(notify.exito).mockResolvedValue(undefined as never)
  })

  function renderReview() {
    return render(
      <MemoryRouter initialEntries={['/practicantes/1/horas']}>
        <Routes>
          <Route path="/practicantes/:id/horas" element={<ReviewHoursPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('al analizar muestra el resumen, el color de cada registro y por qué', async () => {
    const user = userEvent.setup()
    renderReview()

    await user.click(await screen.findByRole('button', { name: 'Analizar con IA' }))

    const bar = screen.getByRole('region', { name: 'Revisión asistida' })
    expect(within(bar).getByText('2 registros se ven bien · 1 necesita tu revisión')).toBeInTheDocument()
    expect(within(bar).getByText('Analizado con IA')).toBeInTheDocument()
    expect(screen.getByText('La actividad es muy corta para saber qué se hizo.')).toBeInTheDocument()
    expect(screen.getAllByText('Se ve bien')).toHaveLength(2)
  })

  it('al devolver un registro amarillo, la nota viene escrita por la IA para editarla', async () => {
    const user = userEvent.setup()
    renderReview()
    await user.click(await screen.findByRole('button', { name: 'Analizar con IA' }))

    const row = screen.getByText('apoyo').closest('[class*="flex"]')!.parentElement!.parentElement!
    await user.click(within(row).getByRole('button', { name: 'Devolver' }))

    expect(await screen.findByLabelText('¿Qué tiene que corregir?')).toHaveValue('¿Qué apoyo diste y a qué área?')
  })

  it('«Aprobar verdes» pide una sola confirmación y aprueba solo los verdes', async () => {
    const user = userEvent.setup()
    vi.mocked(notify.confirmar).mockResolvedValue(true)
    renderReview()
    await user.click(await screen.findByRole('button', { name: 'Analizar con IA' }))

    await user.click(screen.getByRole('button', { name: 'Aprobar 2 verdes' }))

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2))
    expect(notify.confirmar).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api).mock.calls.map(([path]) => path).sort()).toEqual(['/hour-logs/1/review', '/hour-logs/3/review'])
    await waitFor(() => expect(notify.exito).toHaveBeenCalledWith('2 registros aprobados'))
  })

  it('si se cancela la confirmación no se aprueba nada', async () => {
    const user = userEvent.setup()
    vi.mocked(notify.confirmar).mockResolvedValue(false)
    renderReview()
    await user.click(await screen.findByRole('button', { name: 'Analizar con IA' }))

    await user.click(screen.getByRole('button', { name: 'Aprobar 2 verdes' }))

    await waitFor(() => expect(notify.confirmar).toHaveBeenCalled())
    expect(api).not.toHaveBeenCalled()
  })
})

describe('Revisar documento con IA', () => {
  it('muestra lo que no cuadra primero y los datos que leyó', async () => {
    vi.mocked(aiApi.checkDocument).mockResolvedValue({
      aiUsed: true,
      extracted: {
        documentType: 'INSURANCE',
        personName: 'Ana Pérez',
        companyName: 'Empresa Andina',
        validFrom: '2026-01-01',
        validTo: '2026-06-30',
        policyNumber: 'P-123',
        summary: 'Póliza de accidentes personales.',
      },
      findings: [{ level: 'red', message: 'Vence el 2026-06-30, antes de que termine la práctica (2026-07-31).' }],
    })
    render(<DocumentCheckPanel documentId={7} />)

    fireEvent.click(screen.getByRole('button', { name: 'Revisar con IA' }))

    expect(await screen.findByText('Vence el 2026-06-30, antes de que termine la práctica (2026-07-31).')).toBeInTheDocument()
    expect(screen.getByText('Atención')).toBeInTheDocument()
    expect(screen.getByText('P-123')).toBeInTheDocument()
    expect(screen.getByText('2026-01-01 → 2026-06-30')).toBeInTheDocument()
    expect(aiApi.checkDocument).toHaveBeenCalledWith(7)
  })

  it('si la IA no está configurada lo dice, sin inventar datos', async () => {
    vi.mocked(aiApi.checkDocument).mockResolvedValue({
      aiUsed: false,
      extracted: null,
      findings: [{ level: 'yellow', message: 'La revisión automática necesita la IA configurada en el servidor.' }],
    })
    render(<DocumentCheckPanel documentId={7} />)

    fireEvent.click(screen.getByRole('button', { name: 'Revisar con IA' }))

    expect(await screen.findByText('La revisión automática necesita la IA configurada en el servidor.')).toBeInTheDocument()
    expect(screen.getByText('Modo básico (sin IA)')).toBeInTheDocument()
  })
})
