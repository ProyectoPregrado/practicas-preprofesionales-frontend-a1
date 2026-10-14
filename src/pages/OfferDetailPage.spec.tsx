import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as applicationsApi from '@/api/applications'
import { ApiError } from '@/api/client'
import * as offersApi from '@/api/offers'
import { OfferDetailPage } from './OfferDetailPage'

vi.mock('@/api/offers')
vi.mock('@/api/applications')

function renderPage(offerId = 1) {
  return render(
    <MemoryRouter initialEntries={[`/ofertas/${offerId}`]}>
      <Routes>
        <Route path="/ofertas/:id" element={<OfferDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OfferDetailPage (F-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra mensaje claro y botón de volver cuando el servidor responde 404 (oferta no encontrada o ajena)', async () => {
    vi.mocked(offersApi.getOffer).mockRejectedValue(new ApiError(404, 'oferta no encontrada'))
    vi.mocked(applicationsApi.listMine).mockResolvedValue([])

    renderPage(99)

    await waitFor(() => {
      expect(screen.getByText('Esta oferta no existe o ya no está disponible.')).toBeInTheDocument()
    })
    expect(
      screen.getByText('La oferta puede haber sido cerrada, encontrarse en borrador o el enlace es incorrecto.'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /volver a ofertas/i })).toHaveLength(2)
  })

  it('muestra mensaje claro cuando el servidor responde 403', async () => {
    vi.mocked(offersApi.getOffer).mockRejectedValue(new ApiError(403, 'Forbidden'))
    vi.mocked(applicationsApi.listMine).mockResolvedValue([])

    renderPage(4)

    await waitFor(() => {
      expect(screen.getByText('No tienes permiso para acceder a esta oferta.')).toBeInTheDocument()
    })
    expect(screen.getAllByRole('link', { name: /volver a ofertas/i })).toHaveLength(2)
  })

  it('un estudiante con postulación a una oferta CERRADA debe seguir viéndola con su postulación y badge CLOSED', async () => {
    const closedOffer = {
      id: 5,
      title: 'Desarrollador Junior Cerrada',
      description: 'Prácticas de desarrollo en tecnologías web.',
      companyId: 1,
      company: { id: 1, name: 'Empresa ABC' },
      seats: 2,
      requiredHours: 240,
      modality: 'PRESENCIAL',
      status: 'CLOSED',
      periodStart: '2026-03-01',
      periodEnd: '2026-07-31',
      createdAt: '2026-01-01',
      publishedAt: '2026-01-05',
    } as unknown as offersApi.Offer

    vi.mocked(offersApi.getOffer).mockResolvedValue(closedOffer)
    vi.mocked(applicationsApi.listMine).mockResolvedValue([
      {
        id: 10,
        offerId: 5,
        studentId: 1,
        status: 'ACCEPTED',
        motivation: 'Tengo gran interés en participar en el proyecto de desarrollo.',
        submittedAt: '2026-02-01',
        offer: closedOffer,
      } as unknown as applicationsApi.Application,
    ])

    renderPage(5)

    // La oferta se muestra con título y datos
    await waitFor(() => {
      expect(screen.getByText('Desarrollador Junior Cerrada')).toBeInTheDocument()
    })
    expect(screen.getByText('Empresa ABC')).toBeInTheDocument()
    // Muestra badge de CLOSED
    expect(screen.getByText('CLOSED')).toBeInTheDocument()

    // Muestra la postulación existente del estudiante
    expect(screen.getByText('Tu postulación')).toBeInTheDocument()
    expect(screen.getByText('ACCEPTED')).toBeInTheDocument()
    // No debe mostrar el formulario para postular nuevamente
    expect(screen.queryByText('Postular a esta oferta')).not.toBeInTheDocument()
  })

  it('muestra mensaje de postulaciones cerradas si la oferta está CLOSED y el usuario no tiene postulación previa', async () => {
    const closedOffer = {
      id: 6,
      title: 'Oferta Finalizada',
      description: 'Prácticas finalizadas.',
      companyId: 1,
      company: { id: 1, name: 'Empresa ABC' },
      seats: 1,
      requiredHours: 240,
      modality: 'HIBRIDA',
      status: 'CLOSED',
      periodStart: '2026-03-01',
      periodEnd: '2026-07-31',
      createdAt: '2026-01-01',
      publishedAt: '2026-01-05',
    } as unknown as offersApi.Offer

    vi.mocked(offersApi.getOffer).mockResolvedValue(closedOffer)
    vi.mocked(applicationsApi.listMine).mockResolvedValue([])

    renderPage(6)

    await waitFor(() => {
      expect(screen.getByText('Oferta Finalizada')).toBeInTheDocument()
    })
    expect(screen.getByText('Postulaciones cerradas')).toBeInTheDocument()
    expect(
      screen.getByText('Esta oferta ya se encuentra cerrada y no admite nuevas postulaciones.'),
    ).toBeInTheDocument()
  })
})
