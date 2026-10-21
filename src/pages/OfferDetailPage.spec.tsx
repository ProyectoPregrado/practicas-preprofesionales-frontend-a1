import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as applicationsApi from '@/api/applications'
import { ApiError } from '@/api/client'
import * as offersApi from '@/api/offers'
import * as notify from '@/lib/notify'
import { OfferDetailPage } from './OfferDetailPage'

vi.mock('@/api/offers')
vi.mock('@/api/applications')
vi.mock('@/lib/notify')

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

// UX-5: postular envía la motivación a la empresa y la pantalla no deja volver a postular, así que pide
// confirmación; y los errores del servidor (404, 409) salen en un aviso, no en un mensaje dentro del formulario.
describe('OfferDetailPage — confirmar y avisar al postularse (UX-5)', () => {
  const MOTIVATION = 'Estoy en octavo ciclo y me interesa el mantenimiento industrial.'
  const published = {
    id: 7,
    title: 'Auxiliar de mantenimiento',
    description: 'Apoyo al área de mantenimiento.',
    companyId: 1,
    company: { id: 1, name: 'Empresa ABC' },
    seats: 2,
    requiredHours: 240,
    modality: 'PRESENCIAL',
    status: 'PUBLISHED',
    periodStart: '2026-03-01',
    periodEnd: '2026-07-31',
    createdAt: '2026-01-01',
    publishedAt: '2026-01-05',
  } as unknown as offersApi.Offer

  async function fillAndSubmit(motivation = MOTIVATION) {
    renderPage(7)
    fireEvent.change(await screen.findByLabelText(/por qué te interesa/i), { target: { value: motivation } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar postulación' }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(offersApi.getOffer).mockResolvedValue(published)
    vi.mocked(applicationsApi.listMine).mockResolvedValue([])
    vi.mocked(applicationsApi.apply).mockResolvedValue({
      id: 99,
      offerId: 7,
      status: 'SUBMITTED',
      submittedAt: '2026-02-01',
    } as unknown as applicationsApi.Application)
    vi.mocked(notify.confirmar).mockResolvedValue(true)
    vi.mocked(notify.exito).mockResolvedValue(undefined as never)
    vi.mocked(notify.error).mockResolvedValue(undefined as never)
  })

  it('pregunta con el título y la empresa de la oferta antes de enviar', async () => {
    vi.mocked(notify.confirmar).mockResolvedValue(false)
    await fillAndSubmit()

    await waitFor(() => expect(notify.confirmar).toHaveBeenCalledTimes(1))
    const options = vi.mocked(notify.confirmar).mock.calls[0][0]
    expect(options.titulo).toContain('Auxiliar de mantenimiento')
    expect(options.texto).toContain('Empresa ABC')
  })

  it('si se cancela, no se envía nada, no hay aviso de éxito y el formulario conserva lo escrito', async () => {
    vi.mocked(notify.confirmar).mockResolvedValue(false)
    await fillAndSubmit()
    await waitFor(() => expect(notify.confirmar).toHaveBeenCalled())

    expect(applicationsApi.apply).not.toHaveBeenCalled()
    expect(notify.exito).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/por qué te interesa/i)).toHaveValue(MOTIVATION)
    expect(screen.getByRole('button', { name: 'Enviar postulación' })).not.toBeDisabled()
  })

  it('si se confirma, se envía exactamente una vez con la motivación y se avisa del éxito', async () => {
    await fillAndSubmit()

    await waitFor(() => expect(notify.exito).toHaveBeenCalledWith('Postulación enviada'))
    expect(applicationsApi.apply).toHaveBeenCalledTimes(1)
    expect(applicationsApi.apply).toHaveBeenCalledWith(7, MOTIVATION)
    expect(await screen.findByText('Tu postulación')).toBeInTheDocument()
  })

  it('una motivación demasiado corta se rechaza en línea, sin abrir la confirmación', async () => {
    await fillAndSubmit('muy corta')

    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe al menos 20 caracteres')
    expect(notify.confirmar).not.toHaveBeenCalled()
    expect(applicationsApi.apply).not.toHaveBeenCalled()
  })

  it('un doble clic mientras la confirmación está abierta no abre dos preguntas ni envía dos veces', async () => {
    let resolveConfirm!: (value: boolean) => void
    vi.mocked(notify.confirmar).mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve
      }),
    )
    await fillAndSubmit()
    fireEvent.click(screen.getByRole('button', { name: /enviando/i }))
    resolveConfirm(true)

    await waitFor(() => expect(applicationsApi.apply).toHaveBeenCalledTimes(1))
    expect(notify.confirmar).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['un 409 (ya postuló), con su mensaje', new ApiError(409, 'ya postulaste a esta oferta'), 'ya postulaste a esta oferta'],
    ['un 404 (la oferta ya no existe), con su mensaje', new ApiError(404, 'oferta no encontrada'), 'oferta no encontrada'],
    ['un 403', new ApiError(403, 'Forbidden'), 'No tienes permiso para postular a esta oferta.'],
    ['un error que no es de la API, con el mensaje por defecto', new TypeError('red'), undefined],
  ])('con %s muestra un aviso de error y no un mensaje en línea', async (_caso, failure, texto) => {
    vi.mocked(applicationsApi.apply).mockRejectedValue(failure)
    await fillAndSubmit()

    await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1))
    expect(notify.error).toHaveBeenCalledWith('No se pudo enviar la postulación', texto)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(notify.exito).not.toHaveBeenCalled()
  })

  it('el botón sigue deshabilitado mientras el aviso de error está abierto y se habilita al cerrarlo', async () => {
    vi.mocked(applicationsApi.apply).mockRejectedValue(new ApiError(409, 'ya postulaste a esta oferta'))
    let closeNotice!: () => void
    vi.mocked(notify.error).mockReturnValue(
      new Promise<void>((resolve) => {
        closeNotice = resolve
      }),
    )
    await fillAndSubmit()

    await waitFor(() => expect(notify.error).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /enviando/i })).toBeDisabled()

    closeNotice()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar postulación' })).not.toBeDisabled())
  })
})
