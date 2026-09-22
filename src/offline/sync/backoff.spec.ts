import { describe, expect, it } from 'vitest'
import { calculateBackoff, DEFAULT_RETRY_CONFIG } from './backoff'

describe('calculateBackoff', () => {
  it('retorna 0 si attempts es 0 o negativo', () => {
    expect(calculateBackoff(0)).toBe(0)
    expect(calculateBackoff(-1)).toBe(0)
  })

  it('calcula retroceso exponencial estándar: 1s, 2s, 4s, 8s', () => {
    // Intento 1: 1s
    expect(calculateBackoff(1)).toBe(1000)
    // Intento 2: 2s
    expect(calculateBackoff(2)).toBe(2000)
    // Intento 3: 4s
    expect(calculateBackoff(3)).toBe(4000)
    // Intento 4: 8s
    expect(calculateBackoff(4)).toBe(8000)
  })

  it('aplica el límite máximo parametrizable maxDelayMs', () => {
    // Con límite por defecto (8000 ms), intento 5 no pasa de 8000 ms
    expect(calculateBackoff(5)).toBe(DEFAULT_RETRY_CONFIG.maxDelayMs)
    expect(calculateBackoff(10)).toBe(DEFAULT_RETRY_CONFIG.maxDelayMs)

    // Con límite parametrizado a 16000 ms
    expect(calculateBackoff(5, { maxDelayMs: 16000 })).toBe(16000)
    expect(calculateBackoff(6, { maxDelayMs: 16000 })).toBe(16000)

    // Con límite menor parametrizado a 3000 ms
    expect(calculateBackoff(3, { maxDelayMs: 3000 })).toBe(3000)
  })

  it('permite parametrizar initialDelayMs y factor multiplicador', () => {
    expect(calculateBackoff(1, { initialDelayMs: 500 })).toBe(500)
    expect(calculateBackoff(2, { initialDelayMs: 500, factor: 3 })).toBe(1500)
    expect(calculateBackoff(3, { initialDelayMs: 500, factor: 3, maxDelayMs: 10000 })).toBe(4500)
  })
})
