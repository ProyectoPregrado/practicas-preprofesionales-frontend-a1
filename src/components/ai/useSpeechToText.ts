import { useEffect, useRef, useState } from 'react'

// La Web Speech API no está en los tipos de TypeScript del DOM: se declara lo mínimo que se usa.
interface SpeechResult {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechEvent {
  resultIndex: number
  results: ArrayLike<SpeechResult>
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Dictado con el reconocimiento de voz del navegador (Chrome y Edge lo traen; Firefox no). Cada frase reconocida se
 * entrega a `onText` para que se agregue a lo escrito. `supported` es falso si el navegador no lo tiene.
 */
export function useSpeechToText(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText
  const Ctor = recognitionCtor()

  useEffect(() => () => recognition.current?.stop(), [])

  function start() {
    if (!Ctor || listening) return
    const instance = new Ctor()
    instance.lang = 'es-EC'
    instance.continuous = true
    instance.interimResults = false
    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) onTextRef.current(result[0].transcript.trim())
      }
    }
    instance.onerror = (event) => {
      setError(event.error === 'not-allowed' ? 'El navegador no tiene permiso para usar el micrófono.' : 'No se pudo escuchar. Inténtalo de nuevo.')
    }
    instance.onend = () => setListening(false)
    recognition.current = instance
    setError(null)
    setListening(true)
    instance.start()
  }

  function stop() {
    recognition.current?.stop()
    setListening(false)
  }

  return { supported: Ctor !== null, listening, error, start, stop }
}
