/** Frecuencia del WAV que se envía a transcribir: suficiente para voz y liviano (unos 32 KB por segundo). */
export const DICTATION_SAMPLE_RATE = 16000

/** Muestras en coma flotante (−1 a 1) a WAV PCM de 16 bits, mono: el formato que cualquier IA de audio acepta. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = samples.length * 2
  const buffer = new ArrayBuffer(44 + bytes)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, bytes, true)
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })
  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Lo que grabó el navegador (webm u ogg, según cuál sea) a WAV mono de 16 kHz: se decodifica y se remuestrea con la
 * Web Audio API, que traen todos los navegadores actuales.
 */
export async function recordingToWav(recording: Blob): Promise<Blob> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    const length = Math.max(1, Math.ceil(decoded.duration * DICTATION_SAMPLE_RATE))
    const offline = new OfflineAudioContext(1, length, DICTATION_SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return encodeWav(rendered.getChannelData(0), DICTATION_SAMPLE_RATE)
  } finally {
    await context.close().catch(() => undefined)
  }
}
