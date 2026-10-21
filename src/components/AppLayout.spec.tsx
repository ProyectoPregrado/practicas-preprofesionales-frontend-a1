import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsyncedHoursWarningError } from '@/auth/AuthContext'
import * as notify from '@/lib/notify'
import { AppLayout } from './AppLayout'

const mockLogout = vi.fn()

vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 1, email: 'student@miyura.com', fullName: 'Estudiante Prueba', role: 'STUDENT', companyId: null },
      role: 'STUDENT',
      login: vi.fn(),
      confirmDiscard: vi.fn(),
      logout: mockLogout,
    }),
  }
})

vi.mock('@/lib/notify')

vi.mock('@/offline/sync/scheduler', () => ({
  startSync: vi.fn(() => vi.fn()),
  stopSync: vi.fn(),
}))

vi.mock('@/components/SyncIndicator', () => ({
  SyncIndicator: () => <div data-testid="sync-indicator">SyncIndicator</div>,
}))

function renderLayout() {
  return render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  )
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogout.mockReset()
    vi.mocked(notify.confirmar).mockResolvedValue(false)
  })

  it('renderiza la barra de navegación y el botón de salir', () => {
    renderLayout()

    expect(screen.getByText('Estudiante Prueba')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salir/i })).toBeInTheDocument()
  })

  it('sin horas pendientes, Salir cierra la sesión sin preguntar nada', async () => {
    const user = userEvent.setup()
    mockLogout.mockResolvedValue(undefined)
    renderLayout()

    await user.click(screen.getByRole('button', { name: /salir/i }))

    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1))
    expect(mockLogout).toHaveBeenCalledWith()
    expect(notify.confirmar).not.toHaveBeenCalled()
  })
})

// UX-8: el aviso de horas sin sincronizar pasa de un diálogo propio a `notify.confirmar`, como el resto de las
// confirmaciones, y su texto va en tuteo.
describe('AppLayout — horas sin sincronizar al salir (UX-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogout.mockReset()
    vi.mocked(notify.confirmar).mockResolvedValue(false)
  })

  it('pregunta con cuántas horas se perderían y avisa que se descartan definitivamente', async () => {
    const user = userEvent.setup()
    mockLogout.mockRejectedValueOnce(new UnsyncedHoursWarningError(4))
    renderLayout()

    await user.click(screen.getByRole('button', { name: /salir/i }))

    await waitFor(() => expect(notify.confirmar).toHaveBeenCalledTimes(1))
    const options = vi.mocked(notify.confirmar).mock.calls[0][0]
    expect(options.titulo).toBe('Horas sin sincronizar en este equipo')
    expect(options.texto).toContain('Hay 4 registros de horas pendientes de sincronizar.')
    expect(options.texto).toContain('Si cierras sesión')
    expect(options.texto).toContain('se descartarán definitivamente')
    expect(options.confirmar).toBe('Descartar horas y salir')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('con una sola hora pendiente el texto va en singular', async () => {
    const user = userEvent.setup()
    mockLogout.mockRejectedValueOnce(new UnsyncedHoursWarningError(1))
    renderLayout()

    await user.click(screen.getByRole('button', { name: /salir/i }))

    await waitFor(() => expect(notify.confirmar).toHaveBeenCalledTimes(1))
    expect(vi.mocked(notify.confirmar).mock.calls[0][0].texto).toContain(
      'Hay 1 registro de hora pendiente de sincronizar.',
    )
  })

  it('si se cancela, la sesión sigue abierta y no se descarta nada', async () => {
    const user = userEvent.setup()
    mockLogout.mockRejectedValueOnce(new UnsyncedHoursWarningError(4))
    renderLayout()

    await user.click(screen.getByRole('button', { name: /salir/i }))
    await waitFor(() => expect(notify.confirmar).toHaveBeenCalled())

    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(mockLogout).not.toHaveBeenCalledWith({ forceDiscard: true })
    expect(screen.getByRole('button', { name: /salir/i })).not.toBeDisabled()
  })

  it('si se confirma, cierra la sesión descartando las horas, exactamente una vez', async () => {
    const user = userEvent.setup()
    vi.mocked(notify.confirmar).mockResolvedValue(true)
    mockLogout.mockRejectedValueOnce(new UnsyncedHoursWarningError(3)).mockResolvedValueOnce(undefined)
    renderLayout()

    await user.click(screen.getByRole('button', { name: /salir/i }))

    await waitFor(() => expect(mockLogout).toHaveBeenLastCalledWith({ forceDiscard: true }))
    expect(mockLogout).toHaveBeenCalledTimes(2)
  })

  it('un segundo clic en Salir mientras la pregunta está abierta no abre otra', async () => {
    const user = userEvent.setup()
    let resolveConfirm!: (value: boolean) => void
    vi.mocked(notify.confirmar).mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve
      }),
    )
    mockLogout.mockRejectedValueOnce(new UnsyncedHoursWarningError(4)).mockResolvedValue(undefined)
    renderLayout()
    const salir = screen.getByRole('button', { name: /salir/i })

    await user.click(salir)
    await waitFor(() => expect(notify.confirmar).toHaveBeenCalledTimes(1))
    await user.click(salir)
    resolveConfirm(true)

    await waitFor(() => expect(mockLogout).toHaveBeenLastCalledWith({ forceDiscard: true }))
    expect(notify.confirmar).toHaveBeenCalledTimes(1)
    expect(mockLogout).toHaveBeenCalledTimes(2)
  })
})
