import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as aiApi from '@/api/ai'
import { ApiError } from '@/api/client'
import * as wav from '@/lib/wav'
import { DictateDayPanel } from './DictateDayPanel'

// IA-3: el dictado graba con el micrófono y la IA del servidor transcribe. Se simulan el micrófono, MediaRecorder, la
// conversión a WAV y la API: aquí se prueba qué hace la pantalla en cada paso.

vi.mock('@/api/ai')
vi.mock('@/lib/wav')

class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

const track = { stop: vi.fn() }
const getUserMedia = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  getUserMedia.mockResolvedValue({ getTracks: () => [track] })
  vi.mocked(wav.recordingToWav).mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const textbox = () => screen.getByLabelText('Cuéntale tu día a la IA') as HTMLTextAreaElement

describe('Dictar con la IA (IA-3)', () => {
  it('graba, al detener transcribe y agrega el texto al cuadro', async () => {
    vi.mocked(aiApi.transcribeAudio).mockResolvedValue({ text: 'Hoy de 8 a 12 configuré el servidor.' })
    render(<DictateDayPanel onDraft={vi.fn()} />)
    fireEvent.change(textbox(), { target: { value: 'Además,' } })

    fireEvent.click(screen.getByRole('button', { name: 'Dictar' }))
    expect(await screen.findByText('● Grabando… pulsa «Detener» al terminar')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Detener' }))

    await waitFor(() => expect(textbox().value).toBe('Además, Hoy de 8 a 12 configuré el servidor.'))
    expect(wav.recordingToWav).toHaveBeenCalledTimes(1)
    expect(aiApi.transcribeAudio).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Dictar' })).toBeInTheDocument()
  })

  it('mientras transcribe no deja completar ni volver a grabar', async () => {
    let finish!: (value: { text: string }) => void
    vi.mocked(aiApi.transcribeAudio).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<DictateDayPanel onDraft={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dictar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Detener' }))

    expect(await screen.findByRole('button', { name: 'Transcribiendo…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Completar con IA' })).toBeDisabled()
    finish({ text: 'listo' })
    await waitFor(() => expect(textbox().value).toBe('listo'))
  })

  it.each([
    ['NotAllowedError', 'El navegador no dio permiso al micrófono.'],
    ['NotFoundError', 'No se encontró un micrófono conectado.'],
    ['NotReadableError', 'Otra aplicación está usando el micrófono.'],
  ])('si el micrófono falla con %s, dice qué hacer', async (name, message) => {
    getUserMedia.mockRejectedValue(new DOMException('x', name))
    render(<DictateDayPanel onDraft={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dictar' }))

    expect(await screen.findByText(new RegExp(message.replace('.', '\\.')))).toBeInTheDocument()
    expect(aiApi.transcribeAudio).not.toHaveBeenCalled()
  })

  it('si no se escuchó nada, lo dice en lugar de dejar el cuadro vacío sin explicación', async () => {
    vi.mocked(aiApi.transcribeAudio).mockResolvedValue({ text: '' })
    render(<DictateDayPanel onDraft={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dictar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Detener' }))

    expect(await screen.findByText('No se escuchó nada. Habla cerca del micrófono y vuelve a intentar.')).toBeInTheDocument()
  })

  it('si la IA no está disponible, pide escribir el texto', async () => {
    vi.mocked(aiApi.transcribeAudio).mockRejectedValue(new ApiError(503, 'el dictado por voz necesita la IA configurada'))
    render(<DictateDayPanel onDraft={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dictar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Detener' }))

    expect(await screen.findByText('El dictado por voz no está disponible ahora. Escribe el texto en el cuadro.')).toBeInTheDocument()
  })

  it('sin micrófono ni MediaRecorder no aparece el botón Dictar', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    render(<DictateDayPanel onDraft={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Dictar' })).toBeNull()
  })
})
