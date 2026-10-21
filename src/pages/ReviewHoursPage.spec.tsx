import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '@/api/client'
import * as authContext from '@/auth/AuthContext'
import * as notify from '@/lib/notify'
import { db } from '@/offline/db'
import { syncNow } from '@/offline/sync/scheduler'
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

vi.mock('@/lib/notify')

// La revisión sincroniza al terminar; aquí no hay servidor.
vi.mock('@/offline/sync/scheduler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/offline/sync/scheduler')>()
  return { ...actual, syncNow: vi.fn().mockResolvedValue(undefined) }
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

    // UX-4: aprobar pide confirmación; y el error ya no sale en línea sino en un aviso que hay que leer.
    vi.mocked(notify.confirmar).mockResolvedValue(true)
    vi.mocked(notify.error).mockResolvedValue(undefined as never)
    const approveButton = screen.getByRole('button', { name: /aprobar/i })
    await user.click(approveButton)

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith(
        'No se pudo aprobar las horas',
        'No tienes permiso para revisar este registro porque no eres el tutor asignado a esta práctica.',
      )
    })
  })
})

// UX-4: aprobar horas cuenta para el acta y no se puede deshacer (el servidor solo revisa registros
// SUBMITTED), así que pide confirmación. Devolver ya tiene su propio diálogo con la nota.
describe('ReviewHoursPage — confirmar y avisar (UX-4)', () => {
  async function seed({ approvedHours = 0, requiredHours = 200 } = {}) {
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
      requiredHours,
      status: 'ACTIVE',
      version: 1,
      updatedAt: new Date().toISOString(),
    })
    const base = { placementId: 1, startTime: '08:00', endTime: '12:00', syncState: 'synced' as const, version: 1 }
    await db.hourLogs.bulkPut([
      { ...base, id: 36, date: '2026-04-01', hours: 4, activity: 'Desarrollo en backend', status: 'SUBMITTED', updatedAt: new Date().toISOString() },
      ...(approvedHours > 0
        ? [{ ...base, id: 35, date: '2026-03-30', hours: approvedHours, activity: 'Trabajo previo', status: 'APPROVED' as const, updatedAt: new Date().toISOString() }]
        : []),
    ])
  }

  const reviewCalls = () => vi.mocked(api).mock.calls.filter(([path]) => String(path).includes('/review'))

  beforeEach(async () => {
    vi.clearAllMocks()
    await db.placements.clear()
    await db.hourLogs.clear()
    vi.mocked(api).mockResolvedValue({} as never)
    vi.mocked(notify.confirmar).mockResolvedValue(true)
    vi.mocked(notify.exito).mockResolvedValue(undefined as never)
    vi.mocked(notify.error).mockResolvedValue(undefined as never)
  })

  it('al aprobar pregunta con las horas y cuánto suman al total, y avisa que no se puede deshacer', async () => {
    const user = userEvent.setup()
    await seed({ approvedHours: 20 })
    vi.mocked(notify.confirmar).mockResolvedValue(false)
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(notify.confirmar).toHaveBeenCalledTimes(1))
    const options = vi.mocked(notify.confirmar).mock.calls[0][0]
    expect(options.titulo).toMatch(/Aprobar 4 h del/)
    expect(options.texto).toContain('Se suman 4 h a las 20 aprobadas de 200')
    expect(options.texto).toContain('no se puede deshacer')
    expect(options.texto).not.toContain('se completa')
  })

  it('si con esas horas se alcanzan las requeridas, lo dice (la plaza pasa a completada)', async () => {
    const user = userEvent.setup()
    await seed({ approvedHours: 196 })
    vi.mocked(notify.confirmar).mockResolvedValue(false)
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(notify.confirmar).toHaveBeenCalled())
    expect(vi.mocked(notify.confirmar).mock.calls[0][0].texto).toContain('se completa')
  })

  it('si se cancela, no se envía la revisión ni se muestra un aviso de éxito', async () => {
    const user = userEvent.setup()
    await seed()
    vi.mocked(notify.confirmar).mockResolvedValue(false)
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(notify.confirmar).toHaveBeenCalled())

    expect(reviewCalls()).toHaveLength(0)
    expect(notify.exito).not.toHaveBeenCalled()
  })

  it('si se confirma, se revisa una sola vez y se avisa del éxito', async () => {
    const user = userEvent.setup()
    await seed()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(notify.exito).toHaveBeenCalledWith('Horas aprobadas'))
    expect(reviewCalls()).toHaveLength(1)
    expect(reviewCalls()[0][0]).toBe('/hour-logs/36/review')
    expect(JSON.parse(String(reviewCalls()[0][1]?.body))).toEqual({ status: 'APPROVED' })
  })

  it('un doble clic mientras la confirmación está abierta no abre dos preguntas ni revisa dos veces', async () => {
    await seed()
    let resolveConfirm!: (value: boolean) => void
    vi.mocked(notify.confirmar).mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve
      }),
    )
    renderPage()
    const button = await screen.findByRole('button', { name: 'Aprobar' })

    fireEvent.click(button)
    fireEvent.click(button)
    resolveConfirm(true)

    await waitFor(() => expect(reviewCalls()).toHaveLength(1))
    expect(notify.confirmar).toHaveBeenCalledTimes(1)
  })

  it('devolver no pide otra confirmación (el diálogo con la nota ya lo es) y avisa del éxito', async () => {
    const user = userEvent.setup()
    await seed()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Devolver' }))
    await user.type(await screen.findByLabelText('¿Qué tiene que corregir?'), 'Falta detalle')
    await user.click(screen.getByRole('button', { name: 'Devolver el registro' }))

    await waitFor(() => expect(notify.exito).toHaveBeenCalledWith('Registro devuelto al estudiante'))
    expect(notify.confirmar).not.toHaveBeenCalled()
    expect(JSON.parse(String(reviewCalls()[0][1]?.body))).toEqual({ status: 'REJECTED', note: 'Falta detalle' })
  })

  it.each([
    ['un 400 del servidor, con su mensaje', new ApiError(400, 'la hora ya fue revisada'), 'la hora ya fue revisada'],
    ['un error que no es de la API, con el mensaje por defecto', new TypeError('red'), 'No se pudo enviar la revisión'],
  ])('aprobar: con %s muestra un aviso de error y no un mensaje en línea', async (_caso, failure, texto) => {
    const user = userEvent.setup()
    await seed()
    vi.mocked(api).mockRejectedValue(failure)
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('No se pudo aprobar las horas', texto))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(notify.exito).not.toHaveBeenCalled()
  })

  it('devolver: si el servidor rechaza, el título dice qué acción falló', async () => {
    const user = userEvent.setup()
    await seed()
    vi.mocked(api).mockRejectedValue(new ApiError(400, 'la hora ya fue revisada'))
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Devolver' }))
    await user.type(await screen.findByLabelText('¿Qué tiene que corregir?'), 'Falta detalle')
    await user.click(screen.getByRole('button', { name: 'Devolver el registro' }))

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('No se pudo devolver el registro', 'la hora ya fue revisada'),
    )
  })

  it('los botones siguen deshabilitados mientras el aviso de error está abierto y se habilitan al cerrarlo', async () => {
    const user = userEvent.setup()
    await seed()
    vi.mocked(api).mockRejectedValue(new ApiError(400, 'la hora ya fue revisada'))
    let closeNotice!: () => void
    vi.mocked(notify.error).mockReturnValue(
      new Promise<void>((resolve) => {
        closeNotice = resolve
      }),
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(notify.error).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Aprobando…' })).toBeDisabled()

    closeNotice()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aprobar' })).not.toBeDisabled())
  })

  // UX-10: si el servidor rechaza porque el registro ya no está pendiente (otra pestaña o el mismo tutor en otro
  // equipo), la lista local está vieja: se vuelve a sincronizar para traer el estado real.
  describe('re-sincronización tras un rechazo (UX-10)', () => {
    it('ante un 400 (el registro ya no está pendiente) sincroniza y la fila deja de ofrecer Aprobar', async () => {
      const user = userEvent.setup()
      await seed()
      vi.mocked(api).mockRejectedValue(new ApiError(400, 'solo se revisan registros en SUBMITTED'))
      vi.mocked(syncNow).mockImplementationOnce(async () => {
        await db.hourLogs.update(36, { status: 'APPROVED' })
      })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Aprobar' }))

      await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull())
    })

    it.each([
      ['un 403', new ApiError(403, 'x')],
      ['un error que no es de la API', new TypeError('red')],
    ])('con %s no sincroniza: no hay motivo para creer que el registro cambió', async (_caso, failure) => {
      const user = userEvent.setup()
      await seed()
      vi.mocked(api).mockRejectedValue(failure)
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Aprobar' }))

      await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1))
      expect(syncNow).not.toHaveBeenCalled()
    })
  })
})

// REDISEÑO-5: la revisión de horas también pagina, con las filas por página que elige cada tutor.
describe('ReviewHoursPage — filas por página', () => {
  const rowsShown = () => screen.queryAllByText(/^Tarea \d+$/)

  async function seedLogs(count: number) {
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
    await db.hourLogs.bulkPut(
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        placementId: 1,
        date: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: `Tarea ${i + 1}`,
        status: 'SUBMITTED' as const,
        version: 1,
        updatedAt: new Date().toISOString(),
        syncState: 'synced' as const,
      })),
    )
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    await db.placements.clear()
    await db.hourLogs.clear()
  })

  it('por defecto muestra 10 registros por página y avisa que hay más', async () => {
    await seedLogs(12)
    renderPage(1)

    await waitFor(() => expect(rowsShown()).toHaveLength(10))
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('al elegir 5 filas por página muestra 5', async () => {
    const user = userEvent.setup()
    await seedLogs(12)
    renderPage(1)
    await waitFor(() => expect(rowsShown()).toHaveLength(10))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filas por página' }), '5')

    expect(rowsShown()).toHaveLength(5)
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
  })
})
