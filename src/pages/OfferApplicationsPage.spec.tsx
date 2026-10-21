import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import * as companiesApi from '@/api/companies'
import * as offersApi from '@/api/offers'
import * as notify from '@/lib/notify'
import { OfferApplicationsPage } from './OfferApplicationsPage'

vi.mock('@/api/offers')
vi.mock('@/api/companies')
vi.mock('@/lib/notify')

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
    vi.mocked(notify.confirmar).mockResolvedValue(true)
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

// UX-1: aceptar una postulación consume un cupo y la decisión no se puede deshacer: pide confirmación.
describe('OfferApplicationsPage — confirmar al aceptar (UX-1)', () => {
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
    vi.mocked(companiesApi.listApplicationsForOffer).mockResolvedValue([application])
    vi.mocked(companiesApi.decideApplication).mockResolvedValue(undefined as never)
    vi.mocked(notify.exito).mockResolvedValue(undefined as never)
  })

  it('pregunta con el nombre de la persona y los cupos que quedan, antes de decidir', async () => {
    vi.mocked(notify.confirmar).mockResolvedValue(false)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }))

    await waitFor(() => expect(notify.confirmar).toHaveBeenCalledTimes(1))
    const options = vi.mocked(notify.confirmar).mock.calls[0][0]
    expect(options.titulo).toContain('Estudiante Prueba')
    expect(options.texto).toContain('quedarán 2 de 3 cupos')
    expect(options.texto).toContain('no se puede deshacer')
  })

  it('si se cancela, no se envía la decisión ni se muestra un aviso de éxito', async () => {
    vi.mocked(notify.confirmar).mockResolvedValue(false)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }))
    await waitFor(() => expect(notify.confirmar).toHaveBeenCalled())

    expect(companiesApi.decideApplication).not.toHaveBeenCalled()
    expect(notify.exito).not.toHaveBeenCalled()
  })

  it('si se confirma, se decide exactamente una vez y se avisa del éxito', async () => {
    vi.mocked(notify.confirmar).mockResolvedValue(true)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }))

    await waitFor(() => expect(notify.exito).toHaveBeenCalledTimes(1))
    expect(companiesApi.decideApplication).toHaveBeenCalledTimes(1)
    expect(companiesApi.decideApplication).toHaveBeenCalledWith(9, 'ACCEPTED')
    expect(vi.mocked(notify.exito).mock.calls[0][0]).toContain('Estudiante Prueba')
  })

  it('un doble clic mientras la confirmación está abierta no abre dos preguntas ni decide dos veces', async () => {
    let resolveConfirm!: (value: boolean) => void
    vi.mocked(notify.confirmar).mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve
      }),
    )
    renderPage()
    const button = await screen.findByRole('button', { name: 'Aceptar' })

    fireEvent.click(button)
    fireEvent.click(button)
    resolveConfirm(true)

    await waitFor(() => expect(companiesApi.decideApplication).toHaveBeenCalledTimes(1))
    expect(notify.confirmar).toHaveBeenCalledTimes(1)
  })

  it('descartar o pasar a entrevista no pide confirmación (se pueden revisar después)', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Entrevista' }))

    await waitFor(() => expect(companiesApi.decideApplication).toHaveBeenCalledWith(9, 'INTERVIEW'))
    expect(notify.confirmar).not.toHaveBeenCalled()
  })

  // UX-2: el error del servidor salía en línea ARRIBA de la lista, fuera de la vista de quien está en el botón.
  // Ahora se muestra en un aviso que la persona tiene que leer.
  describe('cuando el servidor rechaza la decisión (UX-2)', () => {
    beforeEach(() => {
      vi.mocked(notify.confirmar).mockResolvedValue(true)
      vi.mocked(notify.error).mockResolvedValue(undefined as never)
    })

    it.each([
      ['un 400 del servidor, con su mensaje', new ApiError(400, 'la oferta ya no tiene cupos'), 'la oferta ya no tiene cupos'],
      ['un 403 de otra empresa', new ApiError(403, 'x'), 'No puedes decidir postulaciones de ofertas que pertenecen a otra empresa.'],
      ['un error que no es de la API, con el mensaje por defecto', new TypeError('red'), 'No se pudo enviar la decisión'],
    ])('aceptar: con %s muestra un aviso de error y no un mensaje en línea', async (_caso, failure, texto) => {
      vi.mocked(companiesApi.decideApplication).mockRejectedValue(failure)
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }))

      await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1))
      expect(notify.error).toHaveBeenCalledWith('No se pudo aceptar la postulación', texto)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(notify.exito).not.toHaveBeenCalled()
    })

    it.each([
      ['Descartar', 'No se pudo descartar la postulación'],
      ['Entrevista', 'No se pudo pasar la postulación a entrevista'],
    ])('%s: el título del aviso dice qué acción falló', async (boton, titulo) => {
      vi.mocked(companiesApi.decideApplication).mockRejectedValue(new ApiError(400, 'la postulación ya fue decidida'))
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: boton }))

      await waitFor(() => expect(notify.error).toHaveBeenCalledWith(titulo, 'la postulación ya fue decidida'))
    })

    it('si la decisión sale bien no se muestra ningún aviso de error', async () => {
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }))

      await waitFor(() => expect(notify.exito).toHaveBeenCalledTimes(1))
      expect(notify.error).not.toHaveBeenCalled()
    })

    it('los botones siguen deshabilitados mientras el aviso de error está abierto y se habilitan al cerrarlo', async () => {
      let closeNotice!: () => void
      vi.mocked(notify.error).mockReturnValue(
        new Promise<void>((resolve) => {
          closeNotice = resolve
        }),
      )
      vi.mocked(companiesApi.decideApplication).mockRejectedValue(new ApiError(400, 'la oferta ya no tiene cupos'))
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }))

      await waitFor(() => expect(notify.error).toHaveBeenCalled())
      expect(screen.getByRole('button', { name: 'Aceptando…' })).toBeDisabled()

      closeNotice()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Aceptar' })).not.toBeDisabled())
    })

    it('los botones se habilitan de nuevo cuando la persona cierra el aviso de error', async () => {
      vi.mocked(companiesApi.decideApplication).mockRejectedValue(new ApiError(400, 'la oferta ya no tiene cupos'))
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }))

      await waitFor(() => expect(notify.error).toHaveBeenCalled())
      await waitFor(() => expect(screen.getByRole('button', { name: 'Aceptar' })).not.toBeDisabled())
    })
  })
})
