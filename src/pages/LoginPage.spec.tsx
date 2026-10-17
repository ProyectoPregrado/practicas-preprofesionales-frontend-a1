import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { SESSION_EXPIRED_MESSAGE } from '@/auth/auth.constants'
import { UnsyncedHoursWarningError } from '@/auth/AuthContext'
import { LoginPage } from './LoginPage'

const mockLogin = vi.fn()
const mockConfirmDiscard = vi.fn()
const mockCancelPendingLogin = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return {
    ...actual,
    useAuth: () => ({
      login: mockLogin,
      confirmDiscard: mockConfirmDiscard,
      cancelPendingLogin: mockCancelPendingLogin,
      user: null,
      role: null,
      logout: vi.fn(),
    }),
  }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('renderiza los campos de correo, contraseña y el botón de entrar', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/correo institucional/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('muestra el mensaje de sesión expirada si session_expired está en sessionStorage y lo consume', () => {
    sessionStorage.setItem('session_expired', 'true')

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(SESSION_EXPIRED_MESSAGE)
    // Se consume para no volver a mostrarse en un refresco
    expect(sessionStorage.getItem('session_expired')).toBeNull()
  })

  it('muestra el mensaje de error de ApiError si falla el inicio de sesión', async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValueOnce(new ApiError(401, 'Credenciales incorrectas'))

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/correo institucional/i), 'user@miyura.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Credenciales incorrectas')
    })
  })

  it('llama a login con los valores ingresados y navega a / si es exitoso', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValueOnce(undefined)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/correo institucional/i), 'estudiante@miyura.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('estudiante@miyura.com', 'secret123')
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('muestra el modal de advertencia si hay horas sin sincronizar y permite cancelar sin borrar', async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValueOnce(new UnsyncedHoursWarningError(3))

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/correo institucional/i), 'otro@miyura.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'pass123')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByText(/Horas sin sincronizar en este equipo/i)).toBeInTheDocument()
      expect(screen.getByText(/Hay 3 registros de horas pendientes/i)).toBeInTheDocument()
    })

    // El usuario cancela
    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    await waitFor(() => {
      expect(screen.queryByText(/Horas sin sincronizar en este equipo/i)).not.toBeInTheDocument()
    })
    expect(mockLogin).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    // S-1b: cancelar el aviso libera el login pendiente (revoca su refresh token).
    expect(mockCancelPendingLogin).toHaveBeenCalledTimes(1)
  })

  it('permite confirmar el descarte de horas y completar el inicio de sesión', async () => {
    const user = userEvent.setup()
    mockLogin
      .mockRejectedValueOnce(new UnsyncedHoursWarningError(2))
      .mockResolvedValueOnce(undefined)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/correo institucional/i), 'otro@miyura.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'pass123')
    await user.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByText(/Horas sin sincronizar en este equipo/i)).toBeInTheDocument()
    })

    // El usuario confirma descartar horas y entrar
    await user.click(screen.getByRole('button', { name: /descartar horas y entrar/i }))

    await waitFor(() => {
      expect(mockConfirmDiscard).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })
})
