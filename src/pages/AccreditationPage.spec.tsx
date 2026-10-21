import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as accreditationApi from '@/api/accreditation'
import { AccreditationPage } from './AccreditationPage'

vi.mock('@/api/accreditation')
vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 10, email: 'u@miyura.com', fullName: 'Usuario', role: 'STUDENT', companyId: null },
      role: 'STUDENT',
      login: () => undefined,
      logout: () => undefined,
    }),
  }
})

const rows = (count: number): accreditationApi.AccreditationRow[] =>
  Array.from({ length: count }, (_, i) => ({
    placementId: i + 1,
    studentName: `Practicante ${i + 1}`,
    level: 'PENDIENTE',
    reasons: [],
    completionPercentage: 50,
  })) as accreditationApi.AccreditationRow[]

const rowsShown = () => screen.queryAllByText(/^Practicante \d+$/)

// REDISEÑO-5: el acta pagina con las filas por página que elige cada persona; las cifras de arriba cuentan a todos.
describe('AccreditationPage — filas por página', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('por defecto muestra 10 practicantes por página', async () => {
    vi.mocked(accreditationApi.reportForPeriod).mockResolvedValue(rows(12))
    render(<AccreditationPage />)

    await waitFor(() => expect(rowsShown()).toHaveLength(10))
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('al elegir 5 filas por página muestra 5', async () => {
    const user = userEvent.setup()
    vi.mocked(accreditationApi.reportForPeriod).mockResolvedValue(rows(12))
    render(<AccreditationPage />)
    await waitFor(() => expect(rowsShown()).toHaveLength(10))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filas por página' }), '5')

    expect(rowsShown()).toHaveLength(5)
  })

  it('el contador de arriba sigue contando a todos los practicantes', async () => {
    vi.mocked(accreditationApi.reportForPeriod).mockResolvedValue(rows(12))
    render(<AccreditationPage />)

    expect(await screen.findByText('12 practicantes')).toBeInTheDocument()
  })

  it('al cambiar de periodo vuelve a la primera página', async () => {
    const user = userEvent.setup()
    vi.mocked(accreditationApi.reportForPeriod).mockResolvedValue(rows(25))
    render(<AccreditationPage />)
    await waitFor(() => expect(rowsShown()).toHaveLength(10))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '2026-2' }))

    await waitFor(() => expect(screen.getByText('Página 1 de 3')).toBeInTheDocument())
  })
})
