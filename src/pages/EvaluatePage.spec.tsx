import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import * as evaluationsApi from '@/api/evaluations'
import * as authContext from '@/auth/AuthContext'
import * as notify from '@/lib/notify'
import { db } from '@/offline/db'
import { EvaluatePage } from './EvaluatePage'

vi.mock('@/api/evaluations')
vi.mock('@/lib/notify')
vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

// Radix Select usa APIs que jsdom no trae.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
})

function renderPage(placementId = 1) {
  return render(
    <MemoryRouter initialEntries={[`/practicantes/${placementId}/evaluar`]}>
      <Routes>
        <Route path="/practicantes/:id/evaluar" element={<EvaluatePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// UX-6: una evaluación va al acta y la app no ofrece editarla ni retirarla, así que pide confirmación con los
// puntajes a la vista; y los errores del servidor salen en un aviso, no en un mensaje dentro del formulario.
describe('EvaluatePage — confirmar y avisar (UX-6)', () => {
  const user = userEvent.setup()

  async function choose(criterion: string, score: string) {
    await user.click(await screen.findByRole('combobox', { name: criterion }))
    await user.click(await screen.findByRole('option', { name: score }))
  }

  async function fillAndSubmit() {
    renderPage()
    await choose('Desempeño técnico', '4')
    await choose('Comunicación', '5')
    await choose('Puntualidad', '3')
    fireEvent.change(screen.getByLabelText('Comentario'), { target: { value: '  Muy responsable.  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar evaluación' }))
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 2, email: 'tutor0@miyura.com', fullName: 'Tutor 0', role: 'TUTOR', companyId: null },
      role: 'TUTOR',
      login: vi.fn(),
      logout: vi.fn(),
    })
    await db.placements.clear()
    await db.placements.put({
      id: 1,
      studentId: 10,
      tutorId: 2,
      companyId: 1,
      startDate: '2026-03-01',
      endDate: '2026-07-31',
      requiredHours: 240,
      status: 'ACTIVE',
      version: 1,
      updatedAt: new Date().toISOString(),
    })
    vi.mocked(evaluationsApi.submitEvaluation).mockResolvedValue({ id: 1 } as unknown as evaluationsApi.Evaluation)
    vi.mocked(notify.confirmar).mockResolvedValue(true)
    vi.mocked(notify.error).mockResolvedValue(undefined as never)
  })

  it('pregunta con los puntajes y el periodo antes de enviar, y avisa que queda en el acta', async () => {
    vi.mocked(notify.confirmar).mockResolvedValue(false)
    await fillAndSubmit()

    await waitFor(() => expect(notify.confirmar).toHaveBeenCalledTimes(1))
    const options = vi.mocked(notify.confirmar).mock.calls[0][0]
    expect(options.titulo).toContain('evaluación')
    for (const fragmento of ['2026-1', 'técnico 4', 'comunicación 5', 'puntualidad 3', 'acta']) {
      expect(options.texto).toContain(fragmento)
    }
  })

  it('si se cancela, no se envía nada y el formulario conserva lo elegido', async () => {
    vi.mocked(notify.confirmar).mockResolvedValue(false)
    await fillAndSubmit()
    await waitFor(() => expect(notify.confirmar).toHaveBeenCalled())

    expect(evaluationsApi.submitEvaluation).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Desempeño técnico' })).toHaveTextContent('4')
    expect(screen.getByLabelText('Comentario')).toHaveValue('  Muy responsable.  ')
    expect(screen.getByRole('button', { name: 'Enviar evaluación' })).not.toBeDisabled()
  })

  it('si se confirma, se envía exactamente una vez y la pantalla muestra «Evaluación enviada»', async () => {
    await fillAndSubmit()

    expect(await screen.findByText('Evaluación enviada')).toBeInTheDocument()
    expect(evaluationsApi.submitEvaluation).toHaveBeenCalledTimes(1)
    expect(evaluationsApi.submitEvaluation).toHaveBeenCalledWith({
      placementId: 1,
      kind: 'TUTOR',
      period: '2026-1',
      scores: { technical: 4, communication: 5, punctuality: 3 },
      comment: 'Muy responsable.',
    })
  })

  it('si falta un puntaje se avisa en línea, sin abrir la confirmación', async () => {
    renderPage()
    await choose('Desempeño técnico', '4')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar evaluación' }))

    expect(await screen.findAllByRole('alert')).toHaveLength(2)
    expect(notify.confirmar).not.toHaveBeenCalled()
    expect(evaluationsApi.submitEvaluation).not.toHaveBeenCalled()
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

    await waitFor(() => expect(evaluationsApi.submitEvaluation).toHaveBeenCalledTimes(1))
    expect(notify.confirmar).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'un 403',
      new ApiError(403, 'Forbidden'),
      'No tienes permiso para evaluar esta práctica porque no eres el tutor asignado.',
    ],
    ['un 404, con su mensaje', new ApiError(404, 'placement no encontrado'), 'placement no encontrado'],
    ['un error que no es de la API, con el mensaje por defecto', new TypeError('red'), undefined],
  ])('con %s muestra un aviso de error y no un mensaje en línea', async (_caso, failure, texto) => {
    vi.mocked(evaluationsApi.submitEvaluation).mockRejectedValue(failure)
    await fillAndSubmit()

    await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1))
    expect(notify.error).toHaveBeenCalledWith('No se pudo enviar la evaluación', texto)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('Evaluación enviada')).toBeNull()
  })

  it('el botón sigue deshabilitado mientras el aviso de error está abierto y se habilita al cerrarlo', async () => {
    vi.mocked(evaluationsApi.submitEvaluation).mockRejectedValue(new ApiError(404, 'placement no encontrado'))
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar evaluación' })).not.toBeDisabled())
  })
})
