import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { UnsyncedHoursWarningError } from '@/auth/AuthContext'
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

vi.mock('@/offline/sync/scheduler', () => ({
  startSync: vi.fn(() => vi.fn()),
  stopSync: vi.fn(),
}))

vi.mock('@/components/SyncIndicator', () => ({
  SyncIndicator: () => <div data-testid="sync-indicator">SyncIndicator</div>,
}))

describe('AppLayout', () => {
  it('renderiza la barra de navegación y el botón de salir', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    )

    expect(screen.getByText('Estudiante Prueba')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salir/i })).toBeInTheDocument()
  })

  it('muestra el modal de advertencia al hacer clic en Salir si hay horas sin sincronizar y permite cancelar', async () => {
    const user = userEvent.setup()
    mockLogout.mockRejectedValueOnce(new UnsyncedHoursWarningError(4))

    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /salir/i }))

    await waitFor(() => {
      expect(screen.getByText(/Horas sin sincronizar en este equipo/i)).toBeInTheDocument()
      expect(screen.getByText(/Hay 4 registros de horas pendientes de sincronizar/i)).toBeInTheDocument()
    })

    // El usuario cancela
    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    await waitFor(() => {
      expect(screen.queryByText(/Horas sin sincronizar en este equipo/i)).not.toBeInTheDocument()
    })
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('permite confirmar el descarte y completar el cierre de sesión al hacer clic en Descartar horas y salir', async () => {
    const user = userEvent.setup()
    mockLogout
      .mockRejectedValueOnce(new UnsyncedHoursWarningError(3))
      .mockResolvedValueOnce(undefined)

    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /salir/i }))

    await waitFor(() => {
      expect(screen.getByText(/Horas sin sincronizar en este equipo/i)).toBeInTheDocument()
    })

    // El usuario confirma descarte
    await user.click(screen.getByRole('button', { name: /descartar horas y salir/i }))

    await waitFor(() => {
      expect(mockLogout).toHaveBeenLastCalledWith({ forceDiscard: true })
    })
  })
})
