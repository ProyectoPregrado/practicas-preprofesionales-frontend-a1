import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import * as companiesApi from '@/api/companies'
import * as authContext from '@/auth/AuthContext'
import * as notify from '@/lib/notify'
import { CompanyOffersPage } from './CompanyOffersPage'

vi.mock('@/api/companies')
vi.mock('@/lib/notify')
vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

const offerBase = {
  companyId: 5,
  description: 'Actividades de práctica',
  modality: 'PRESENCIAL',
  seats: 3,
  requiredHours: 240,
  periodStart: '2026-03-01',
  periodEnd: '2026-07-31',
  publishedAt: null,
  company: { id: 5, name: 'Empresa', sector: 'TI' },
  applications: [],
}
const draft = { ...offerBase, id: 1, title: 'Oferta borrador', status: 'DRAFT' } as never
const open = { ...offerBase, id: 2, title: 'Oferta abierta', status: 'PUBLISHED' } as never

function renderPage() {
  return render(
    <MemoryRouter>
      <CompanyOffersPage />
    </MemoryRouter>,
  )
}

// UX-4: publicar y cerrar una oferta no tienen vuelta atrás (publicar solo sale de DRAFT y no hay reabrir),
// así que piden confirmación; y los errores del servidor salen en un aviso, no en un mensaje arriba de la lista.
describe('CompanyOffersPage — confirmar y avisar (UX-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 50, email: 'empresa0@miyura.com', fullName: 'Contacto', role: 'COMPANY', companyId: 5 },
      role: 'COMPANY',
      login: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(companiesApi.listMyOffers).mockResolvedValue([draft, open])
    vi.mocked(companiesApi.listCompanies).mockResolvedValue([])
    vi.mocked(companiesApi.publishOffer).mockResolvedValue(undefined as never)
    vi.mocked(companiesApi.closeOffer).mockResolvedValue(undefined as never)
    vi.mocked(notify.confirmar).mockResolvedValue(true)
    vi.mocked(notify.exito).mockResolvedValue(undefined as never)
    vi.mocked(notify.error).mockResolvedValue(undefined as never)
  })

  describe.each([
    {
      accion: 'Publicar',
      pending: 'Publicando…',
      api: () => vi.mocked(companiesApi.publishOffer),
      oferta: { id: 1, titulo: 'Oferta borrador' },
      textoConfirmacion: ['La verán todos los estudiantes', 'no se puede volver a borrador'],
      exito: 'Oferta publicada',
      fallo: 'No se pudo publicar la oferta',
      sinPermiso: 'No tienes permiso para publicar esta oferta porque no pertenece a tu empresa.',
    },
    {
      accion: 'Cerrar',
      pending: 'Cerrando…',
      api: () => vi.mocked(companiesApi.closeOffer),
      oferta: { id: 2, titulo: 'Oferta abierta' },
      textoConfirmacion: ['ya no podrán postular', 'no se puede reabrir'],
      exito: 'Oferta cerrada',
      fallo: 'No se pudo cerrar la oferta',
      sinPermiso: 'No tienes permiso para cerrar esta oferta porque no pertenece a tu empresa.',
    },
  ])('$accion', ({ accion, pending, api, oferta, textoConfirmacion, exito, fallo, sinPermiso }) => {
    it('pregunta con el título de la oferta y avisa que no se puede deshacer, antes de enviar', async () => {
      vi.mocked(notify.confirmar).mockResolvedValue(false)
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: accion }))

      await waitFor(() => expect(notify.confirmar).toHaveBeenCalledTimes(1))
      const options = vi.mocked(notify.confirmar).mock.calls[0][0]
      expect(options.titulo).toContain(oferta.titulo)
      for (const fragmento of textoConfirmacion) expect(options.texto).toContain(fragmento)
    })

    it('si se cancela, no se envía nada ni se muestra un aviso de éxito', async () => {
      vi.mocked(notify.confirmar).mockResolvedValue(false)
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: accion }))
      await waitFor(() => expect(notify.confirmar).toHaveBeenCalled())

      expect(api()).not.toHaveBeenCalled()
      expect(notify.exito).not.toHaveBeenCalled()
    })

    it('si se confirma, se envía exactamente una vez y se avisa del éxito', async () => {
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: accion }))

      await waitFor(() => expect(notify.exito).toHaveBeenCalledWith(exito))
      expect(api()).toHaveBeenCalledTimes(1)
      expect(api()).toHaveBeenCalledWith(oferta.id)
    })

    it('un doble clic mientras la confirmación está abierta no abre dos preguntas ni envía dos veces', async () => {
      let resolveConfirm!: (value: boolean) => void
      vi.mocked(notify.confirmar).mockReturnValue(
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve
        }),
      )
      renderPage()
      const button = await screen.findByRole('button', { name: accion })

      fireEvent.click(button)
      fireEvent.click(button)
      resolveConfirm(true)

      await waitFor(() => expect(api()).toHaveBeenCalledTimes(1))
      expect(notify.confirmar).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['un 403 de otra empresa', new ApiError(403, 'x'), sinPermiso],
      ['un 400 del servidor, con su mensaje', new ApiError(400, 'la oferta ya cambió de estado'), 'la oferta ya cambió de estado'],
      ['un error que no es de la API, con el mensaje por defecto', new TypeError('red'), fallo],
    ])('con %s muestra un aviso de error y no un mensaje en línea', async (_caso, failure, texto) => {
      api().mockRejectedValue(failure)
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: accion }))

      await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1))
      expect(notify.error).toHaveBeenCalledWith(fallo, texto)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(notify.exito).not.toHaveBeenCalled()
    })

    it('el botón sigue deshabilitado mientras el aviso de error está abierto y se habilita al cerrarlo', async () => {
      api().mockRejectedValue(new ApiError(400, 'la oferta ya cambió de estado'))
      let closeNotice!: () => void
      vi.mocked(notify.error).mockReturnValue(
        new Promise<void>((resolve) => {
          closeNotice = resolve
        }),
      )
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: accion }))

      await waitFor(() => expect(notify.error).toHaveBeenCalled())
      expect(screen.getByRole('button', { name: pending })).toBeDisabled()

      closeNotice()
      await waitFor(() => expect(screen.getByRole('button', { name: accion })).not.toBeDisabled())
    })
  })
})
