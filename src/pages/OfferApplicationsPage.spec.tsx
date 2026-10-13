import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import * as companiesApi from '@/api/companies'
import * as offersApi from '@/api/offers'
import { OfferApplicationsPage } from './OfferApplicationsPage'

vi.mock('@/api/offers')
vi.mock('@/api/companies')

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
