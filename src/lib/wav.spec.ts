import { describe, expect, it } from 'vitest'
import { encodeWav } from './wav'

function read(blob: Blob): Promise<DataView> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new DataView(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

const text = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)))

describe('encodeWav (IA-3)', () => {
  it('escribe una cabecera WAV PCM de 16 bits, mono, con la frecuencia pedida', async () => {
    const view = await read(encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 16000))

    expect(text(view, 0, 4)).toBe('RIFF')
    expect(text(view, 8, 4)).toBe('WAVE')
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(text(view, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(8)
    expect(view.byteLength).toBe(52)
  })

  it('convierte las muestras a enteros de 16 bits y recorta lo que se pasa de rango', async () => {
    const view = await read(encodeWav(new Float32Array([0, 1, -1, 2, -2]), 16000))
    const samples = [0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))
    expect(samples).toEqual([0, 32767, -32768, 32767, -32768])
  })

  it('el Blob se envía como audio/wav', () => {
    expect(encodeWav(new Float32Array(1), 16000).type).toBe('audio/wav')
  })
})
