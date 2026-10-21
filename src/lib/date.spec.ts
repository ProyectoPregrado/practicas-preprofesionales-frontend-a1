import { describe, expect, it } from 'vitest'
import { formatDate, parseLocalDate } from './date'

describe('parseLocalDate', () => {
  it('parses a date-only ISO string as local midnight, not UTC midnight', () => {
    const parsed = parseLocalDate('2026-01-01')
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(0)
    expect(parsed.getDate()).toBe(1)
  })

  it('ignores a time component if present', () => {
    const parsed = parseLocalDate('2026-08-04T15:30:00.000Z')
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(7)
    expect(parsed.getDate()).toBe(4)
  })
})

describe('formatDate', () => {
  it('muestra el día como se lee en Ecuador, sin correrse por la zona horaria', () => {
    expect(formatDate('2026-03-05')).toBe('05 mar 2026')
    expect(formatDate('2026-03-05T23:30:00.000Z')).toBe('05 mar 2026')
  })

  it('devuelve tal cual lo que no es una fecha', () => {
    expect(formatDate('sin fecha')).toBe('sin fecha')
  })
})
