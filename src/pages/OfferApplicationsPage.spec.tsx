import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import * as companiesApi from '@/api/companies'
import * as offersApi from '@/api/offers'
import { OfferApplicationsPage } from './OfferApplicationsPage'

vi.mock('@/api/offers')
vi.mock('@/api/companies')
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

function renderPage(offerId = 1) {
  return render(
    <MemoryRouter initialEntries={[`/ofertas-empresa/${offerId}/postulaciones`]}>
      <Routes>
        <Route path="/ofertas-empresa/:id/postulaciones" element={<OfferApplicationsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OfferApplicationsPage (F-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra mensaje claro de acceso restringido ante 403 cuando la oferta no es de la empresa', async () => {
    vi.mocked(offersApi.getOffer).mockRejectedValue(new ApiError(403, 'la oferta no pertenece a tu empresa'))
    vi.mocked(companiesApi.listApplicationsForOffer).mockRejectedValue(
      new ApiError(403, 'la oferta no pertenece a tu empresa'),
    )

    renderPage(4)

    await waitFor(() => {
      expect(
        screen.getByText(
          'No tienes permiso para ver las postulaciones de esta oferta porque no pertenece a tu empresa.',
        ),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Acceso restringido o no disponible')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /volver a mis ofertas/i })).toHaveLength(2)
  })

  it('muestra mensaje claro ante 404 cuando la oferta no existe o no está disponible', async () => {
    vi.mocked(offersApi.getOffer).mockRejectedValue(new ApiError(404, 'oferta no encontrada'))
    vi.mocked(companiesApi.listApplicationsForOffer).mockRejectedValue(new ApiError(404, 'oferta no encontrada'))

    renderPage(99)

    await waitFor(() => {
      expect(screen.getByText('Esta oferta no existe o no está disponible.')).toBeInTheDocument()
    })
    expect(screen.getByText('Acceso restringido o no disponible')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /volver a mis ofertas/i })).toHaveLength(2)
  })
})

// F-1b: el mensaje de error de carga se calculaba en tres copias (oferta, postulaciones y recarga tras
// decidir). Cada una se fija por separado: falla solo una de las tres llamadas a la vez.
describe('OfferApplicationsPage — mensajes de error de carga (F-1b)', () => {
  const FORBIDDEN = 'No tienes permiso para ver las postulaciones de esta oferta porque no pertenece a tu empresa.'
  const NOT_FOUND = 'Esta oferta no existe o no está disponible.'

  const offer = {
    id: 1,
    companyId: 5,
    title: 'Oferta de prueba',
    description: 'd',
    modality: 'PRESENCIAL',
    seats: 3,
    requiredHours: 240,
    periodStart: '2026-03-01',
    periodEnd: '2026-07-31',
    status: 'PUBLISHED',
    publishedAt: null,
    company: { id: 5, name: 'Empresa', sector: 'TI' },
  } as never
  const application = {
    id: 9,
    offerId: 1,
    studentId: 2,
    status: 'SUBMITTED',
    motivation: 'quiero postular',
    submittedAt: '2026-03-02',
    decidedAt: null,
    student: { id: 2, email: 'e@miyura.com', fullName: 'Estudiante Prueba' },
  } as never

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(offersApi.getOffer).mockResolvedValue(offer)
    vi.mocked(companiesApi.listApplicationsForOffer).mockResolvedValue([])
  })

  describe.each([
    ['la oferta', () => vi.mocked(offersApi.getOffer), 'No se pudo cargar la oferta'],
    ['las postulaciones', () => vi.mocked(companiesApi.listApplicationsForOffer), 'No se pudieron cargar las postulaciones'],
  ] as const)('cuando falla la carga de %s', (_name, source, fallback) => {
    it.each([
      ['403', new ApiError(403, 'x'), FORBIDDEN],
      ['404', new ApiError(404, 'x'), NOT_FOUND],
      ['otro estado de ApiError, con su mensaje', new ApiError(500, 'falló el servidor'), 'falló el servidor'],
      ['un error que no es de la API, con el mensaje por defecto', new TypeError('red'), fallback],
    ])('%s', async (_case, error, message) => {
      source().mockRejectedValue(error)

      renderPage()

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.getByText('Acceso restringido o no disponible')).toBeInTheDocument()
    })
  })

  it.each([
    ['403', new ApiError(403, 'x'), FORBIDDEN],
    ['404', new ApiError(404, 'x'), NOT_FOUND],
    ['otro estado de ApiError, con su mensaje', new ApiError(500, 'falló el servidor'), 'falló el servidor'],
    ['un error que no es de la API, con el mensaje por defecto', new TypeError('red'), 'No se pudieron cargar las postulaciones'],
  ])('cuando falla la recarga tras decidir: %s', async (_case, error, message) => {
    vi.mocked(companiesApi.listApplicationsForOffer).mockResolvedValueOnce([application]).mockRejectedValue(error)
    vi.mocked(companiesApi.decideApplication).mockResolvedValue(undefined as never)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByText('Acceso restringido o no disponible')).toBeInTheDocument()
  })
})

// REDISEÑO-5: la tabla de postulaciones también pagina, con las filas por página que elige cada persona.
describe('OfferApplicationsPage — filas por página', () => {
  const offer = {
    id: 1,
    companyId: 5,
    title: 'Oferta de prueba',
    description: 'd',
    modality: 'PRESENCIAL',
    seats: 30,
    requiredHours: 240,
    periodStart: '2026-03-01',
    periodEnd: '2026-07-31',
    status: 'PUBLISHED',
    publishedAt: null,
    company: { id: 5, name: 'Empresa', sector: 'TI' },
  } as never
  const applications = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      offerId: 1,
      studentId: 100 + i,
      status: 'SUBMITTED',
      motivation: 'quiero postular',
      submittedAt: '2026-03-02',
      decidedAt: null,
      student: { id: 100 + i, email: `e${i}@miyura.com`, fullName: `Candidato ${i + 1}` },
    })) as never
  const rowsShown = () => screen.queryAllByText(/^Candidato \d+$/)

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(offersApi.getOffer).mockResolvedValue(offer)
  })

  it('por defecto muestra 10 candidatos por página', async () => {
    vi.mocked(companiesApi.listApplicationsForOffer).mockResolvedValue(applications(12))
    renderPage()

    await waitFor(() => expect(rowsShown()).toHaveLength(10))
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('al elegir 5 filas por página muestra 5', async () => {
    const user = userEvent.setup()
    vi.mocked(companiesApi.listApplicationsForOffer).mockResolvedValue(applications(12))
    renderPage()
    await waitFor(() => expect(rowsShown()).toHaveLength(10))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filas por página' }), '5')

    expect(rowsShown()).toHaveLength(5)
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
  })

  it('con pocas postulaciones se ven todas', async () => {
    vi.mocked(companiesApi.listApplicationsForOffer).mockResolvedValue(applications(3))
    renderPage()

    await waitFor(() => expect(rowsShown()).toHaveLength(3))
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
  })
})
