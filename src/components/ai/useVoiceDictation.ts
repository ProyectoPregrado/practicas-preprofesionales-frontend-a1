import { useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '@/api/ai'
import { ApiError } from '@/api/client'
import { recordingToWav } from '@/lib/wav'

export type DictationState = 'idle' | 'recording' | 'transcribing'

/** Un dictado más largo se corta solo: el servidor acepta unos 2 minutos de audio. */
const MAX_SECONDS = 90

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'El navegador no dio permiso al micrófono. Actívalo en el candado de la barra de direcciones y vuelve a intentar.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No se encontró un micrófono conectado.'
  if (name === 'NotReadableError') return 'Otra aplicación está usando el micrófono. Ciérrala y vuelve a intentar.'
  return 'No se pudo usar el micrófono. Escribe el texto en el cuadro.'
}

function transcribeErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.statusCode === 503) return 'El dictado por voz no está disponible ahora. Escribe el texto en el cuadro.'
  if (err instanceof ApiError && err.statusCode === 413) return 'El audio es muy largo. Dicta en partes más cortas.'
  return 'No se pudo transcribir el audio. Inténtalo de nuevo o escribe el texto.'
}

/**
 * IA-3: dictado que no depende del reconocimiento de voz del navegador. Graba con el micrófono, convierte a WAV y la
 * IA del servidor lo transcribe; el texto se entrega a `onText`. Funciona en Chrome, Edge y Firefox.
 */
export function useVoiceDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>('idle')
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText
  const supported =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined'

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (recorder.current?.state === 'recording') recorder.current.stop()
    },
    [],
  )

  async function transcribe(chunks: Blob[], mimeType: string) {
    setState('transcribing')
    try {
      const wav = await recordingToWav(new Blob(chunks, { type: mimeType }))
      const { text } = await transcribeAudio(wav)
      if (text) onTextRef.current(text)
      else setError('No se escuchó nada. Habla cerca del micrófono y vuelve a intentar.')
    } catch (err) {
      setError(transcribeErrorMessage(err))
    } finally {
      setState('idle')
    }
  }

  async function start() {
    if (!supported || state !== 'idle') return
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setError(micErrorMessage(err))
      return
    }
    const chunks: Blob[] = []
    const instance = new MediaRecorder(stream)
    instance.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    instance.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      if (timer.current) clearTimeout(timer.current)
      void transcribe(chunks, instance.mimeType)
    }
    recorder.current = instance
    instance.start()
    setState('recording')
    timer.current = setTimeout(() => stop(), MAX_SECONDS * 1000)
  }

  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  return { supported, state, error, start, stop }
}
