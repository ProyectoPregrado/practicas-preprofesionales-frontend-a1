import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Role } from '@/auth/AuthContext'
import { Topbar } from './Topbar'

const student = { fullName: 'Estudiante Prueba' }

function renderTopbar(props: Partial<React.ComponentProps<typeof Topbar>> = {}) {
  return render(<Topbar user={student} role="STUDENT" onLogout={vi.fn()} leaving={false} {...props} />)
}

// REDISEÑO-2: la barra superior del portal muestra quién eres y en qué portal estás.
describe('Topbar', () => {
  it('muestra el nombre, el rol y las iniciales de la persona', () => {
    renderTopbar()

    expect(screen.getByText('Estudiante Prueba')).toBeInTheDocument()
    expect(screen.getByText('Estudiante')).toBeInTheDocument()
    expect(screen.getByText('EP')).toBeInTheDocument()
  })

  it.each([
    ['STUDENT', 'Portal del estudiante'],
    ['TUTOR', 'Portal del tutor'],
    ['COMPANY', 'Portal de la empresa'],
    ['COORDINATOR', 'Portal de coordinación'],
  ] as [Role, string][])('el rol %s dice «%s»', (role, portal) => {
    renderTopbar({ role })

    expect(screen.getByText(portal)).toBeInTheDocument()
  })

  it('sin sesión cargada no inventa un nombre ni un portal', () => {
    renderTopbar({ user: null, role: null })

    expect(screen.queryByText(/portal/i)).toBeNull()
    expect(screen.getByText('··')).toBeInTheDocument()
  })

  it('Salir llama a onLogout', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    renderTopbar({ onLogout })

    await user.click(screen.getByRole('button', { name: 'Salir' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('mientras se cierra la sesión, Salir queda deshabilitado', () => {
    renderTopbar({ leaving: true })

    expect(screen.getByRole('button', { name: 'Salir' })).toBeDisabled()
  })
})
